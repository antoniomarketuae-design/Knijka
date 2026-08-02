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
  /**
   * B18 residual / FR-24 (founder: „the green circle that is stating where the
   * car to stop is actually putted AFTER the stop marked line on the road …
   * I have to stop BEFORE the line not after it").
   *
   * THE HALF THAT WAS LEFT. The DRAWN marker was fixed in scene/
   * guidanceRoute.ts — a waypoint authored past visible paint is pulled back
   * and drawn as a gate bar on the lawful side. Its own comment says the
   * acceptance radius „rides along untouched", and that is this row's
   * residual: the GRADE still came from the full circle, so a car stopped
   * 1.7 m PAST the give-way bars was credited with having stopped at them.
   *
   * A waypoint is a circle and a circle reaches exactly as far past a mark as
   * it reaches short of it. Where the mark stands for painted line the student
   * must not cross, that symmetry is a lie the lesson tells — and the aids
   * make it worse, because the L1/L2 tolerance ladder widens the radius in
   * BOTH directions.
   *
   * Set this to the SIGNED distance from the paint to the authored mark along
   * the approach — i.e. how far PAST the paint the mark itself sits — and the
   * acceptance becomes the disc cut off exactly at the line. Stopping earlier
   * still counts (early is the same act done sooner, and every metre the
   * ladder adds still adds backwards); stopping past the paint never does, at
   * any rung.
   *
   *   POSITIVE — the mark is inside the junction and credit must stop SHORT of
   *              it by this much (`sc-rb-approach`: +1.725 m past the М8 bars).
   *   NEGATIVE — the mark is on the approach and the paint is this far AHEAD of
   *              it, so credit may extend that far past the mark and no further
   *              (`sc-sdead-approach`: −2.275 m, a mark 2.275 m short of the
   *              stop line whose 12 m disc otherwise reached 9.72 m into the
   *              junction). Ten of the catalog's twelve cut objectives are this
   *              sign: the defect is almost always a generous RADIUS, not a
   *              badly placed mark.
   *
   * FR-24 required the negative half. The first version of this parameter only
   * accepted values ≥ 0, which is exactly why it could be authored on one
   * template and nowhere else — every other overhang in the catalog needed a
   * sign the type could not express, so the drawing stayed honest catalog-wide
   * and the grading stayed wrong catalog-wide.
   *
   * A value larger than `radiusM` would leave the disc with no acceptable
   * region at all and make the objective uncompletable except by the grace
   * capsule; `stop-line-grading.test.ts` refuses that rather than shipping it.
   *
   * The mark itself deliberately stays where the template authored it: that
   * is what keeps the guidance clamp engaged and the gate bar drawn
   * (governingPaintLine only pulls a marker back when the waypoint is PAST the
   * line). One anchor, two honest derivations from it.
   *
   * Nothing here is a fault: the rule engine's law adjudication is untouched.
   * This decides only whether the TASK is ticked off.
   */
  acceptBeforeMarkM?: number;
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
  /**
   * Which gear must carry the bay entry (S2, additive — absent = "reverse",
   * the A10/D4-hardened default every existing lesson keeps byte-identical).
   * "forward": echelon/45° forward-entry drills (doc-72 PK-02 echelon
   * variant) — the CURRENT attempt's bay entry itself must happen in a
   * forward gear; the reverse-credit machinery is not consulted.
   */
  entry?: "reverse" | "forward";
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

/**
 * Corridor rect a three-point turn must complete inside (bay-locked, like
 * parkInBay). Axis-oriented on the maneuver's `startHeadingDeg`: `halfLengthM`
 * runs ALONG the start heading (up the street), `halfWidthM` ACROSS it. Center
 * (x, y) in district space.
 */
export interface ThreePointTurnCorridor {
  x: number;
  y: number;
  halfWidthM: number;
  halfLengthM: number;
}

/**
 * Three-point turn / обратен завой (Наредба-38 exam-required, ЗДвП чл. 38) —
 * CORRIDOR-LOCKED, the parkInBay mold. Completes only when the car has REVERSED
 * its travel direction (~180°, ending within `toleranceDeg` of
 * `startHeadingDeg + 180`, folded to the 180° axis), at rest INSIDE the corridor
 * rect, held `holdSec` continuous seconds. A genuine turn on a narrow street is
 * three movements (forward-left, reverse-right, forward-away) — the evaluator
 * counts direction-change shunts (forward↔reverse) into the detail's `movements`
 * (= reversals + 1) so the rubric can grade economy; curb/obstacle contact
 * grades COLLISION through the existing obstacle-rect machinery (collisionMinKmh
 * 0, like parking). The evaluator never HARD-requires a reverse (a wide one-arc
 * U-turn is a 1-movement completion) — the narrow corridor + curbs are what make
 * the reverse physically necessary; economy is where the shunt count is judged.
 */
export interface ThreePointTurnParams {
  kind: "completeManeuver";
  maneuver: "threePointTurn";
  /** The bounded turn box the maneuver must complete inside (axis = startHeadingDeg). */
  corridor: ThreePointTurnCorridor;
  /** Travel heading at the start of the maneuver, deg (0 = north, cw). */
  startHeadingDeg: number;
  /** Max |final heading − (startHeadingDeg + 180)| folded to the 180° axis, deg. */
  toleranceDeg: number;
  /** Continuous seconds at rest (inside the corridor, facing back) to finish. */
  holdSec: number;
}

export type ManeuverParams =
  | SmoothStopParams
  | EmergencyStopParams
  | RoundaboutParams
  | ParkInBayParams
  | ThreePointTurnParams;

export type ObjectiveParams =
  | ReachZoneParams
  | PassSignalParams
  | DriveDistanceParams
  | ManeuverParams;

// ---------------------------------------------------------------------------
// Route finish (founder 2026-07-28 — see finish.ts for the full rationale)
// ---------------------------------------------------------------------------

/** Circular arrival zone marking where a lesson route ENDS, district meters. */
export interface RouteFinishZone {
  x: number;
  y: number;
  radiusM: number;
  /** Continuous seconds the arrival must hold before the finish trips. */
  dwellSec: number;
  /**
   * When set, only frames at/below this speed count toward `dwellSec` — the
   * difference between a finish you CROSS (a waypoint) and one you ARRIVE AT
   * (a parking bay, which every parallel-park route drives past on its way to
   * the pull-up pose). |speed| is compared, so reversing in counts.
   */
  maxSpeedKmh?: number;
  /**
   * WHICH SIDE of `radiusM` is the finish (B1, 2026-07-30).
   *
   * "inside" (the default, and every zone that shipped before this) — the
   * route ends AT a place: a waypoint, a junction, a painted bay. You arrive.
   *
   * "outside" — the route ends when you have LEFT a place. This is the only
   * honest shape for a maneuver whose target is where the WORK happens: the
   * roundabout island and the three-point-turn corridor are arrived at to
   * BEGIN the task, so an inside-zone there would trip while the student is
   * still working it. Standing still inside the ring can never end a drive;
   * driving away from it always can.
   */
  mode?: "inside" | "outside";
  /**
   * "outside" zones only: the vehicle must be observed WITHIN this radius
   * before leaving can count (you cannot leave somewhere you never reached).
   * Defaults to `radiusM`; always ≤ `radiusM`. For a roundabout this is the
   * ring's own `enterRadiusM`, so a car that merely passed nearby and turned
   * back has not "left the roundabout" — it never entered it.
   */
  armWithinM?: number;
  /**
   * May this zone be consulted while the chain is ALREADY ON the terminal
   * objective (the B2 rescue)? False for anchors where being inside the zone
   * is the normal, correct state of a student still working: a parking bay
   * (mid-shuffle pauses), a red light held at a `requireRedMet` junction.
   * Those keep the stalled-chain rescue and get a standstill-gated rescue of
   * their own (finish.ts `terminalRescueZone`) or none at all.
   */
  terminalRescue?: boolean;
}

/** Per-session memory of the route-finish gate (finish.ts `stepFinishGate`). */
export interface FinishGateState {
  /** The vehicle has been observed OUTSIDE the zone at least once — you
   *  cannot arrive somewhere you never left (a lesson may spawn in its bay). */
  armed: boolean;
  /** Start of the current continuous stay inside the zone; null = outside. */
  insideSinceSec: number | null;
  /** Session time the finish tripped; null = the end is still ahead. */
  reachedAtSec: number | null;
}

// ---------------------------------------------------------------------------
// Objective runtime state
// ---------------------------------------------------------------------------

export type ObjectiveStatus = "pending" | "active" | "done";

/** Per-objective evaluator memory (discriminated by evaluator, not by kind). */
export type ObjectiveEvalState =
  | {
      /**
       * reachZone. Stateless until B4/B5 (2026-07-30): the evaluator used to
       * demand `inZone && slowEnough` on the SAME frame, so one fast pass
       * through an 8 m window permanently voided a gate that could then only
       * be satisfied by physically driving back — 178 capped waypoints across
       * 137 templates, and the sequential chain locks behind every one of
       * them. Both halves now LATCH, independently and monotonically.
       */
      type: "reachZone";
      /** The zone itself has been reached (see objectives.ts for the terms). */
      reached: boolean;
      /** The arrival speed cap has been honoured at least once at the zone;
       *  always true for an uncapped zone. */
      capMet: boolean;
      /** The „arrived, but too fast" HUD notice has been shown once (engine). */
      overCapNoted: boolean;
      /**
       * Where the vehicle was on the frame BEFORE it first entered the grace
       * ring of a capped zone — the only thing in a position-and-speed tick
       * that says which way the student was coming from, and therefore which
       * side of the mark is „short of it" and which is „past it". Taken from
       * the previous frame rather than the first inside one so a coarse tick
       * step (or a replayed trace) cannot latch it on top of the mark itself
       * and flatten the direction to nothing. Null until the ring is entered,
       * and on uncapped zones, which have no grace ring at all.
       */
      approachFrom: Vec2 | null;
      /** Previous frame's position — only used to derive `approachFrom`. */
      prevPos: Vec2 | null;
      /**
       * The car has been OUTSIDE this zone's grace ring at least once while
       * the objective was live — i.e. there was a real arrival to concede.
       * Latched, never cleared. Guards the halt arm of the grace only (doc 87
       * B3/B10/B11: „it states 2 tasks and it is only 1"): a drill that spawns
       * you three metres from its own halt mark ticked task 1 off at t = 0,
       * at rest, for having done nothing.
       */
      everOutside: boolean;
    }
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
      /**
       * B6 (2026-07-30): ring exits taken WITHOUT the right indicator. The
       * traversal still resets (the skill has to be performed, not banked),
       * but the reset is no longer SILENT — the engine turns each increment
       * into an explaining HUD card, and finish.ts gives the maneuver a
       * leave-the-ring finish so „redo it" is a choice instead of the only
       * way out of a lesson that could not otherwise end.
       */
      voidedExits: number;
    }
  | {
      type: "parkInBay";
      /**
       * Reverse gear engaged during the CURRENT attempt (reset when the car
       * leaves the bay — a new attempt must reverse again).
       */
      usedReverse: boolean;
      /**
       * The CURRENT bay entry happened in a forward gear (set on the
       * outside → inside transition, cleared on exit) — the gate the
       * `entry: "forward"` variant checks instead of usedReverse (S2).
       */
      enteredForward: boolean;
      /** Session time the current continuous in-bay stop began; null while moving. */
      stoppedSinceT: number | null;
      /** Car centre currently inside the bay rect. */
      inBay: boolean;
      /** Bay entries so far (outside → inside transitions). */
      attempts: number;
    }
  | {
      type: "threePointTurn";
      /** Car centre has been inside the corridor at least once. */
      entered: boolean;
      /**
       * Last non-zero travel direction (−1 reverse, +1 forward, 0 = none yet).
       * Tracked only after entering the corridor — used to count shunts.
       */
      lastDir: number;
      /** Direction-change shunts (forward↔reverse) since entering the corridor. */
      reversals: number;
      /** Session time the current continuous in-corridor at-rest stop began; null while moving/outside. */
      stoppedSinceT: number | null;
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
  | { kind: "roundabout"; entered: boolean; exitSignaled: boolean }
  | {
      kind: "threePointTurn";
      /** Car centre has been inside the corridor. */
      entered: boolean;
      /** Direction-change shunts (forward↔reverse) used in the corridor. */
      reversals: number;
      /** Movements = reversals + 1 (a clean three-point turn is 3); 0 before entering. */
      movements: number;
      /** Current |heading − target| folded to the 180° axis, deg; null before entering. */
      headingToTargetDeg: number | null;
    };

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
// A15 — mistake-map measurement channels (both ADDITIVE)
// ---------------------------------------------------------------------------

/**
 * World position of one scored event (A15 mistake map). The rule engine's
 * ScorableEvent deliberately carries no position (rules/ adjudicates law, not
 * geometry) — the lessons engine records it here AT EMISSION TIME from the
 * very SimTick the event fired on, paired back to its event by (kind, code, t)
 * exactly like PenaltyEscalation pairs. Pre-drive events (no tick in hand)
 * simply have no record — their mistake rows render without a map marker.
 */
export interface EventPosition {
  kind: "violation" | "commendation";
  /** Rule-catalog code — pairs with ScorableEvent.code. */
  code: string;
  /** Session time of the event, seconds — pairs with ScorableEvent.t. */
  t: number;
  /** World position, meters (SimTick.position at emission). */
  x: number;
  y: number;
}

/**
 * One near-miss encounter as the SESSION records it (A15): the A11 traffic
 * stat (contracts.ts NearMissEvent) plus the player position the shell
 * captured when the encounter resolved — clearance is sub-meter, so the
 * player's own position IS the encounter location for map purposes. Nothing
 * here is graded (deliberately no ViolationCode); the end screen plots these
 * as "мина на косъм" rings.
 */
export interface SessionNearMiss {
  /** Session time at resolution, s. */
  tSec: number;
  /** What was nearly hit. */
  kind: "vehicle" | "pedestrian" | "cyclist";
  /** Tightest body-envelope clearance during the encounter, m (0 = brushed). */
  clearanceM: number;
  /** Peak relative speed during the encounter, m/s. */
  relSpeedMps: number;
  /** Player world position at resolution, m; null when no tick was in hand. */
  x: number | null;
  y: number | null;
}

// ---------------------------------------------------------------------------
// A13 — exam termination (examMode sessions only)
// ---------------------------------------------------------------------------

/**
 * Why an exam session terminated mid-route (A13). The first three mirror the
 * official fail rule (rules/summary.ts FailReason — doc 32: no опасна, ≤ 9
 * total, ≤ 6 from основни); "collision" is the terminateSession catalog flag
 * (a ПТП ends the real exam on the spot). In examMode these end the session
 * THE MOMENT they occur — unlike training lessons, which keep driving for
 * learning value and only fold the verdict at the end.
 */
export type ExamTerminationReason =
  | "collision"
  | "dangerous-mistake"
  | "total-points-exceeded"
  | "osnovni-points-exceeded";

/** The termination record: what ended the exam, and when. */
export interface ExamTermination {
  reason: ExamTerminationReason;
  /** Session time of the violation that tripped the limit, seconds. */
  tSec: number;
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
  /**
   * FRAME-ZERO POSE GUARD (doc 87 B3/B10/B11 — „it states 2 tasks and it is
   * only 1 task"). Session time of the first tick that DESCRIBED THE VEHICLE:
   * the first one carrying motion, or a position different from the one the
   * session opened on. Undefined until then, and while it is undefined the
   * objective chain does not advance.
   *
   * The scene mounts its pose buffer at the DISTRICT ORIGIN
   * (scene/vehicleSample.ts `createVehicleSample` → position {0, 0}) and ticks
   * this engine with it for the frames before the chassis writes its first
   * pose. Four shipped drills author their first waypoint within one car
   * length of that origin — sc-park-perp-rev (6.07 m), sc-park-parallel
   * (7.30), sc-park-narrow (5.87), sc-park-bay-exit-rev (3.19) — so their
   * „ЗАДАЧА 1/2" was ticked off by a car that did not exist yet, at a place
   * 111 m from where the student was actually sitting. sc-park-45, whose gate
   * is authored away from the origin, was the one bay drill the founder found
   * honest; that is the same fact from the other side.
   *
   * Held in the LESSON engine rather than patched in the scene because the
   * rule is a grading rule and belongs where grading lives: an objective is
   * earned by driving, and nothing has been driven while the car has not
   * moved. When the scene stops publishing the placeholder pose this guard
   * costs exactly one frame and changes nothing.
   *
   * B-NEW-1 (doc 87:229): the ROUTE-FINISH gates obey it too, and that is
   * what the guard originally missed. `rb-mini-v1` centres its ring on
   * exactly (0, 0), so the placeholder pose sat inside the roundabout
   * finish's arming circle and armed „you have left the ring" before the
   * student had moved a centimetre; the car then dwelt outside it — at its
   * own spawn — and the drive „finished" FINISH_LEAVE_S later. Same rule,
   * same reason: a drive that has not begun cannot end.
   */
  posedAtSec?: number;
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
  /**
   * A15 (additive): world positions of the SCORED events, recorded by
   * applyTick from the tick each event fired on — see EventPosition. Only
   * tick-emitted events appear (pre-drive events carry no position).
   */
  eventPositions?: EventPosition[];
  /**
   * A15 (additive): near-miss encounters, in resolution order — recorded via
   * `applyNearMiss` (engine.ts) from LessonScene's onNearMiss callback (A11).
   * Session stat only; never folds into any score.
   */
  nearMisses?: SessionNearMiss[];
  /**
   * A13 (additive; examMode sessions only): set the moment the exam
   * terminated on the official limits (exam.ts examTerminationFor) — the
   * session phase flips to "completed" on the same step. Absent on training
   * lessons and on exams that finished the route within limits.
   */
  examTermination?: ExamTermination;
  /**
   * THEO-3 (additive; lesson.mistakeExperience sessions only): session time
   * the targeted wrong action first fired — the one-shot latch behind the
   * consequence moment (applyTick emits `mistakeMoment` exactly once).
   * Absent on every other session and until the mistake happens.
   */
  mistakeExperienceHitAtSec?: number;
  /**
   * Route-finish gate (founder 2026-07-28; additive — absent until the first
   * tick that consults it, and never present on routes with no locatable end).
   * Tracked ONLY while the sequential chain has not yet reached the final
   * objective: it is the escape hatch that lets a student who skipped a task
   * still END the drive by reaching the end of the route, instead of being
   * made to re-drive it correctly before he may see what he did wrong. See
   * finish.ts — it changes WHEN a session stops, never WHAT is graded.
   */
  finishGate?: FinishGateState;
  /**
   * B2/B3 (2026-07-30) — the STANDSTILL rescue, tracked independently and on
   * every frame, whichever objective is active. It answers one question the
   * gate above deliberately cannot: „is this car simply stuck?" The evidence
   * is a full standstill held at the end of the route (finish.ts
   * `terminalRescueZone`), which no approach, creep, park shuffle or
   * red-light wait produces, and it needs its own dwell memory because the
   * two gates watch different zones with different criteria.
   *
   * It runs alongside the stalled-chain gate rather than only in its place
   * because a compact route (a parking lot, where the pull-up pose is 10 m
   * from the bay) clamps that gate below one lane wide — so a car parked at
   * the end of the route, three metres off, satisfied neither of them and had
   * no way out at all.
   */
  finishRescueGate?: FinishGateState;
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
  /**
   * A15 (additive): positions of the scored events for the end-screen mistake
   * map, paired to summary.mistakes/commendations by (kind, code, t). Absent
   * on server-graded results rebuilt purely from the wire (positions are
   * display metadata — the server never grades from them).
   */
  eventPositions?: EventPosition[];
  /** A15 (additive): the session's near-miss encounters ("мина на косъм"). */
  nearMisses?: SessionNearMiss[];
  /**
   * A13 (additive; examMode only): why the exam terminated mid-route, for the
   * examiner-style end framing („Изпитът се прекратява: …"). Derived on the
   * client from the live session and REDERIVED server-side from the rebuilt
   * catalog events (wire.ts) — never trusted from the client.
   */
  examTermination?: ExamTermination;
}
