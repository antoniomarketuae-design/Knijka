/**
 * sim/lessons — shared types of the lesson subsystem.
 *
 * The lesson engine is a PURE orchestration layer above the rule engine
 * (rules/) and the pre-drive machine (procedures/): it owns objective
 * progression and the session lifecycle, accumulates every scorable event,
 * and at the end folds everything through `buildSessionSummary` into an
 * official-style result. Zero DOM/3D/DB dependencies — the store (store.ts)
 * is the only impure seam and is injectable, like every other module store.
 */

import type {
  LessonObjective,
  LessonSpec,
  ParkingBaySpec,
  StagedEventOutcome,
} from "../contracts";
import type {
  RuleEngineState,
  ScorableEvent,
  SessionSummary,
  SeverityClass,
  Vec2,
} from "../rules";
import type { PreDriveMachine } from "../procedures";
import type { EscalatedMistake, PenaltyEscalation } from "./escalation";

// ---------------------------------------------------------------------------
// Objective parameters (typed views over LessonObjective.params)
// ---------------------------------------------------------------------------

/** Vehicle entered a circular zone (optionally at/below a max speed). */
export interface ReachZoneParams {
  kind: "reachZone";
  x: number;
  y: number;
  radiusM: number;
  /** When set, the zone only completes at/below this speed (km/h). */
  maxSpeedKmh?: number;
}

/**
 * Vehicle crossed a stop line of the given control type near a district node.
 * The objective tracks PROGRESSION only — running the red is still "passing";
 * the rule engine adjudicates the violation separately. `nodeId` refers to
 * district-v1.json; the coordinates are denormalized into the spec so the
 * lesson engine never needs the world file at runtime.
 */
export interface PassSignalParams {
  kind: "passSignal";
  /** Intersection/signal node id from district-v1.json (traceability). */
  nodeId: string;
  x: number;
  y: number;
  /** How close to the node a stopLineCrossed event must occur to count. */
  radiusM: number;
  control: "trafficLight" | "stopSign";
  /**
   * A10 (trafficLight only): the objective completes only if the RUN has met
   * at least one red — either this objective (or an earlier passSignal
   * objective, via ObjectiveContext.redsMetInRun) observed a full stop inside
   * its zone followed by a green-light crossing (waiting out a red), or a
   * crossing ON red (met the hard way; the rule engine grades that
   * separately). Guards against a greens-only luck run "passing" L2 without
   * the student ever handling a red. The signal cycle guarantees feasibility:
   * every light shows red 26 s of every 50 s (runtime SIGNAL_TIMING), so
   * stopping at the line always meets a red within ≤ 24 s.
   */
  requireRedMet?: boolean;
}

/** Accumulate driven distance (odometer over position deltas). */
export interface DriveDistanceParams {
  kind: "driveDistance";
  meters: number;
}

/**
 * Come to a full stop from at least `minApproachKmh` without exceeding
 * `maxDecelMs2` (harsh braking re-arms the attempt — accelerate and retry).
 */
export interface SmoothStopParams {
  kind: "completeManeuver";
  maneuver: "smoothStop";
  minApproachKmh: number;
  maxDecelMs2: number;
}

/**
 * Emergency stop (L5 „Аварийно спиране") — STIMULUS-LOCKED since A10. The
 * old evaluator armed on speed alone, so any hard stop anywhere completed it
 * without a hazard ever appearing (audit D4: reaction untrained). Now the
 * objective is bound to the A8 staged encounter named by `stagedEventId`
 * (L5: "l5-braking-lead-car"): it completes ONLY from that encounter's
 * StagedEventOutcome — success requires detail "stoppedInTime" (full stop,
 * no collision); "hitLeadCar" / "passedWithoutStopping" leave it failed.
 * The measured reaction time (stimulus onset → first brake application) is
 * surfaced in the objective detail with a grade band (see REACTION_BAND_*
 * in objectives.ts). Outcomes are session facts (LessonSessionState
 * .stagedOutcomes), so an outcome earned before the objective activates
 * still counts — the behavior was performed and measured.
 */
export interface EmergencyStopParams {
  kind: "completeManeuver";
  maneuver: "emergencyStop";
  /** Id of the staged encounter (LessonSpec.stagedEvents) this stop grades from. */
  stagedEventId: string;
}

/**
 * Reverse-park (L7 „Паркиране") — BAY-LOCKED since A10. The old evaluator was
 * coordinate-free, so ANY reverse + ANY held stop anywhere completed it
 * (audit D4). Now completion requires the car at rest INSIDE the authored
 * bay rect (A5 `LessonSpec.parkingBay`, denormalized here): centre within
 * `centerTolM` of the bay centre, heading within `headingTolDeg` of the bay
 * axis (folded to 180° — the rect is symmetric), reverse gear used during
 * the current attempt, and the stop held `holdSec` continuous seconds.
 * Attempts are counted (leaving the bay and re-entering = a new attempt,
 * which also re-demands reverse); alignment quality goes into the objective
 * detail for the debrief.
 */
export interface ParkInBayParams {
  kind: "completeManeuver";
  maneuver: "parkInBay";
  /** Continuous seconds the vehicle must stay stopped to finish parking. */
  holdSec: number;
  /** The marked bay rect the park must land in (same values as LessonSpec.parkingBay). */
  bay: ParkingBaySpec;
  /** Max distance of the car centre from the bay centre at rest, m. */
  centerTolM: number;
  /** Max |heading − bay axis| at rest, degrees (folded to the 180° axis). */
  headingTolDeg: number;
}

/**
 * Enter the roundabout ring, then leave it again — WITH the right indicator
 * on in the exit window (A10; the L3 spec promises „излез с десен мигач").
 * An unsignaled exit resets the traversal: the student re-enters the ring
 * and exits properly. The exit window is the annulus between enterRadiusM
 * and the exit crossing, after having entered.
 */
export interface RoundaboutParams {
  kind: "completeManeuver";
  maneuver: "roundabout";
  x: number;
  y: number;
  /** Inside this radius of the island center counts as "in the roundabout". */
  enterRadiusM: number;
  /** Beyond this radius (after entering) counts as "exited". */
  exitRadiusM: number;
}

export type ManeuverParams =
  | SmoothStopParams
  | EmergencyStopParams
  | RoundaboutParams
  | ParkInBayParams;

export type ObjectiveParams =
  | ReachZoneParams
  | PassSignalParams
  | DriveDistanceParams
  | ManeuverParams;

// ---------------------------------------------------------------------------
// Objective runtime state
// ---------------------------------------------------------------------------

export type ObjectiveStatus = "pending" | "active" | "done";

/** Per-objective evaluator memory (discriminated by evaluator, not by kind). */
export type ObjectiveEvalState =
  | { type: "stateless" } // reachZone
  | {
      type: "passSignal";
      /** The matching stop line has been crossed (near the node). */
      crossed: boolean;
      /**
       * Full stop observed inside the zone during the CURRENT visit (resets
       * on leaving the zone) — the observable signature of waiting at the
       * light; combined with a green crossing it certifies a met red.
       */
      stoppedInZoneVisit: boolean;
      /** This objective's junction contributed a met red to the run (A10). */
      redMet: boolean;
    }
  | { type: "driveDistance"; accumulatedM: number; prevPos: Vec2 | null }
  | {
      type: "smoothStop";
      /** True once the vehicle reached the minimum approach speed. */
      armed: boolean;
      /** Peak deceleration observed during the current armed attempt, m/s². */
      maxDecelMs2: number;
      prevSpeedKmh: number | null;
      prevT: number | null;
    }
  /**
   * emergencyStop is outcome-driven since A10 (no tick memory): completion
   * reads the staged encounter's StagedEventOutcome from ObjectiveContext.
   */
  | { type: "emergencyStop" }
  | {
      type: "roundabout";
      entered: boolean;
      /** Right indicator observed in the exit window after entering (A10). */
      exitSignaled: boolean;
    }
  | {
      type: "parkInBay";
      /**
       * Reverse gear engaged during the CURRENT attempt (reset when the car
       * leaves the bay — a new attempt must reverse again).
       */
      usedReverse: boolean;
      /** Session time the current continuous in-bay stop began; null while moving. */
      stoppedSinceT: number | null;
      /** Car centre currently inside the bay rect. */
      inBay: boolean;
      /** Bay entries so far (outside → inside transitions). */
      attempts: number;
    };

// ---------------------------------------------------------------------------
// Objective detail (A10) — measurement channel for HUD + debrief
// ---------------------------------------------------------------------------

/** Final-position quality of a park (debrief: „centred" vs „sloppy"). */
export type ParkAlignment = "centered" | "acceptable" | "sloppy";

/** Reaction-time grade band for the stimulus-locked emergency stop (A10). */
export type ReactionBand = "otlichen" | "dobur" | "baven";

/**
 * Structured per-objective measurements the evaluators surface alongside
 * done/progress (A10). Additive: only the hardened evaluators emit one; the
 * engine mirrors it onto ObjectiveProgress and buildLessonResult copies it
 * onto ObjectiveOutcome so the debrief can cite reaction time, park
 * alignment, attempts, and the red-light record without re-deriving them.
 */
export type ObjectiveDetail =
  | {
      kind: "parkInBay";
      attempts: number;
      inBay: boolean;
      /** Distance of car centre from bay centre, m; null while outside the bay. */
      centerOffsetM: number | null;
      /** |heading − bay axis| folded to 180°, degrees; null while outside. */
      headingOffsetDeg: number | null;
      /** Quality at the current/final in-bay stop; null while moving/outside. */
      alignment: ParkAlignment | null;
    }
  | {
      kind: "emergencyStop";
      /** Encounter resolution ("pending" until the staged event resolves). */
      outcome: "pending" | "stoppedInTime" | "hitLeadCar" | "passedWithoutStopping" | "collision";
      /** Stimulus onset → first brake application, s (null until measured). */
      reactionTimeSec: number | null;
      band: ReactionBand | null;
      /** Remaining bumper gap at full stop, m. */
      stopGapM: number | null;
    }
  | {
      kind: "passSignal";
      /** Reds met across the whole run (all passSignal objectives so far). */
      redsMetInRun: number;
      /** This objective's junction contributed a met red. */
      redMetHere: boolean;
    }
  | { kind: "roundabout"; entered: boolean; exitSignaled: boolean };

export interface ObjectiveProgress {
  spec: LessonObjective;
  params: ObjectiveParams;
  status: ObjectiveStatus;
  /** 0..1 for the HUD progress bar (distance/maneuver phases); 0 when N/A. */
  progress: number;
  completedAtSec: number | null;
  /** A10 measurement channel (attempts, reaction band, …); hardened evaluators only. */
  detail?: ObjectiveDetail;
}

// ---------------------------------------------------------------------------
// Teach moment (A9 — pause + card instead of a drive-by toast)
// ---------------------------------------------------------------------------

/**
 * A first, teachable encounter the shell must PAUSE for (doc 65 §5): freeze
 * physics, show the mini-lesson card with the authored law-cited WHY, resume
 * on acknowledgment. Emitted by applyTick for teach-mode coach decisions only
 * — опасна/terminating mistakes never become teach moments (safety floor:
 * they grade from the first encounter and keep the non-blocking toast, so a
 * modal never interrupts evasive handling mid-incident).
 */
export interface TeachMoment {
  /** Rule-catalog violation code that triggered the teachable moment. */
  code: string;
  /** Scenario event id it maps to (null → coached by its own code). */
  scenarioId: string | null;
  titleBg: string;
  /** Authored explanation from the violation catalog (ADR-002: no free text). */
  explanationBg: string;
  /** Legal basis, e.g. "ЗДвП чл. 21" — rendered as the law-ref chip. */
  lawRef?: string;
  /** Official class + points a REPEAT would cost — the card states the stake. */
  severity: SeverityClass;
  points: number;
  /** Session time of the mistake, seconds. */
  t: number;
}

// ---------------------------------------------------------------------------
// Lesson session state (the pure reducer state)
// ---------------------------------------------------------------------------

export type LessonPhase = "preDrive" | "driving" | "completed" | "aborted";

export interface LessonSessionState {
  lesson: LessonSpec;
  phase: LessonPhase;
  isNight: boolean;
  /** Pre-drive machine — non-null only when lesson.preDrive is true. */
  preDrive: PreDriveMachine | null;
  rules: RuleEngineState;
  objectives: ObjectiveProgress[];
  evalStates: ObjectiveEvalState[];
  /** Index of the active objective; === objectives.length when all are done. */
  currentObjectiveIndex: number;
  /** Every scorable event of the session (rule engine + pre-drive machine).
   *  Coached: a first, teachable mistake is shown live but NOT added here. */
  events: ScorableEvent[];
  /** How many times each scenario has been encountered — drives teach-first-then-grade. */
  scenarioEncounters: Record<string, number>;
  /**
   * Scored repeats the coach graded above ×1.0, in order (A9). Folded into the
   * result's effective score by buildLessonResult; the base `events` stay
   * official/catalog-fixed.
   */
  penaltyEscalations: PenaltyEscalation[];
  /**
   * Session time the last teach-moment PAUSE was emitted (null = none yet) —
   * the rate limit that keeps a mistake cluster from chaining pauses.
   */
  lastTeachMomentAtSec: number | null;
  /** Session time of the last processed tick, seconds. */
  lastT: number;
  endedAtSec: number | null;
  /**
   * A8 (additive): resolved staged-encounter outcomes, in resolution order.
   * The GRADED consequences already live in `events` (the orchestrator emits
   * only existing SimTick vocabulary); this is the measurement channel —
   * `reactionTimeSec` on the l5-braking-lead-car outcome is the
   * stimulus→brake-onset delta A10 locks the L5 objective to. Populated via
   * `applyStagedOutcome` (engine.ts) from LessonScene's onStagedOutcome
   * callback; absent on sessions predating A8.
   */
  stagedOutcomes?: StagedEventOutcome[];
}

// ---------------------------------------------------------------------------
// Result (input for persistence, debrief and the session-end screen)
// ---------------------------------------------------------------------------

export interface ObjectiveOutcome {
  id: string;
  titleBg: string;
  done: boolean;
  completedAtSec: number | null;
  /** A10 measurement channel, carried into the result for the debrief. */
  detail?: ObjectiveDetail;
}

// ---------------------------------------------------------------------------
// Gamification hook (integration ask — see note)
// ---------------------------------------------------------------------------

/**
 * INTEGRATION ASK (gamification module): the activity event a finished sim
 * lesson SHOULD report. `GamificationEvent` (modules/gamification/types.ts)
 * is a CLOSED union of practice_answer | exam_completed, so trackActivity
 * cannot accept this yet — per module-boundary rules we do NOT widen another
 * module's contract from here. Once the union gains this member (and
 * xpForEvent a case for it — suggested: base XP + pass bonus, scaled down for
 * repeat passes), call `trackActivity(userId, event)` in
 * src/app/(dashboard)/simulator/actions.ts right after saveSession (the
 * call site is marked). Until then sim lessons award no XP and the session-end
 * screen hides the XP chip.
 */
export interface SimLessonGamificationEvent {
  type: "sim_lesson";
  passed: boolean;
  /** Penalty points, 0 = perfect (NOT a 0..97 exam score). */
  score: number;
}

export interface LessonResult {
  lessonId: string;
  /** Official-format fold of every scorable event (rules/summary.ts). */
  summary: SessionSummary;
  objectives: ObjectiveOutcome[];
  /** True when every objective completed (vacuously true for free drive). */
  completedAll: boolean;
  aborted: boolean;
  /**
   * The lesson verdict: official pass rule AND all objectives done AND not
   * aborted. A free drive (no objectives) passes purely on the official rule.
   */
  passed: boolean;
  /** Total penalty points (lower is better) — stored in SimSession.score. */
  score: number;
  /**
   * Training-layer total with repeat escalation applied (×1.5/×2.0 per doc 65;
   * A9). Always ≥ `score`; fractional halves possible (3 × 1.5 = 4.5). The
   * official verdict (`passed`/`summary`) is NEVER derived from this — the
   * exam pass rule stays on official base points.
   */
  effectiveScore: number;
  /** The repeat mistakes that graded harder — debrief shows „повторна ×1.5". */
  escalations: EscalatedMistake[];
  durationSec: number;
}
