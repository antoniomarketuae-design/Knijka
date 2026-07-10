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

import type { LessonObjective, LessonSpec, StagedEventOutcome } from "../contracts";
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
 * Emergency stop (L5 „Аварийно спиране"): the MIRROR of smoothStop. Reach at
 * least `minApproachKmh`, then stop with a peak deceleration of AT LEAST
 * `minDecelMs2` — proving a firm, decisive emergency brake (not a gentle
 * coast). A soft roll to a halt does NOT complete it. Coordinate-free, exactly
 * like smoothStop, so it needs no world geometry.
 */
export interface EmergencyStopParams {
  kind: "completeManeuver";
  maneuver: "emergencyStop";
  minApproachKmh: number;
  minDecelMs2: number;
}

/**
 * Reverse-park (L7 „Паркиране"): engage reverse gear during the maneuver and
 * then hold a full stop for `holdSec` continuous seconds. Tests the actual
 * motor skill (reverse + controlled halt); coordinate-free — the world renders
 * a bay, but completion is geometry-independent. Not expressible by reachZone
 * (which requires neither a held stop nor reverse) or smoothStop (forward,
 * gentle) — hence a dedicated evaluator.
 */
export interface ParkInBayParams {
  kind: "completeManeuver";
  maneuver: "parkInBay";
  /** Continuous seconds the vehicle must stay stopped to finish parking. */
  holdSec: number;
}

/** Enter the roundabout ring, then leave it again (enter + exit = done). */
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
  | { type: "stateless" } // reachZone, passSignal
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
  | {
      type: "emergencyStop";
      /** True once the vehicle reached the minimum approach speed. */
      armed: boolean;
      /** Peak deceleration observed during the current armed attempt, m/s². */
      maxDecelMs2: number;
      prevSpeedKmh: number | null;
      prevT: number | null;
    }
  | { type: "roundabout"; entered: boolean }
  | {
      type: "parkInBay";
      /** Reverse gear was engaged at some point during the attempt. */
      usedReverse: boolean;
      /** Session time the current continuous stop began; null while moving. */
      stoppedSinceT: number | null;
    };

export interface ObjectiveProgress {
  spec: LessonObjective;
  params: ObjectiveParams;
  status: ObjectiveStatus;
  /** 0..1 for the HUD progress bar (distance/maneuver phases); 0 when N/A. */
  progress: number;
  completedAtSec: number | null;
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
