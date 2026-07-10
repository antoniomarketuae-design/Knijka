/**
 * sim/rules — the SimTick contract and rule-event types.
 *
 * This file IS the contract between the (future) 3D engine and the pedagogical
 * rule engine. The 3D engine (Three.js + R3F + Rapier, ADR-005) will be built
 * against `SimTick`: it samples vehicle + world state every frame and feeds
 * frames through `reduceTick` (engine.ts). The rule engine is pure TypeScript —
 * zero 3D/DOM dependencies, fully deterministic (ADR-002: real-time feedback
 * comes from the rule engine, never from an LLM).
 *
 * Scoring authority: docs/education/32_EXAMINATION_SYSTEM.md — the official
 * practical-exam error taxonomy (основни = 3 т., второстепенни = 1 т.,
 * опасни = 10 т.; pass: ≤ 9 total points, of which ≤ 6 from основни).
 */

// Value-only import; ../contracts imports this file as `import type`, so no
// runtime cycle exists (the type import is erased).
import { PERCEPTUAL_ROAD_SCALE } from "../contracts";

// ---------------------------------------------------------------------------
// SimTick — the input frame the 3D engine emits
// ---------------------------------------------------------------------------

export interface Vec2 {
  x: number;
  y: number;
}

export type MirrorKind = "left" | "right" | "rear";
export type IndicatorState = "off" | "left" | "right";
export type HeadlightState = "off" | "low" | "high";
export type TurnDirection = "left" | "right";

/**
 * Discrete world events that occurred between the previous tick and this one.
 * The 3D engine adjudicates geometry (line crossings, zone entry, contacts);
 * the rule engine adjudicates law and pedagogy.
 */
export type SimTickEvent =
  /**
   * Vehicle front axle crossed a stop line. For traffic lights the engine
   * reports the light state AT THE MOMENT of crossing.
   */
  | {
      kind: "stopLineCrossed";
      control: "stopSign" | "trafficLight";
      lightState?: "red" | "yellow" | "green";
    }
  /**
   * Vehicle entered the approach zone of a pedestrian crossing (engine should
   * size the zone ~25–30 m before the crossing). MAY be re-emitted for the
   * same crossingId to update `pedestrianOnCrossing` (e.g. a pedestrian steps
   * onto the crossing while the vehicle is already inside the zone).
   */
  | { kind: "crossingZoneEntered"; crossingId: string; pedestrianOnCrossing: boolean }
  /** Vehicle passed over the pedestrian crossing; flag sampled at that moment. */
  | { kind: "crossingPassed"; crossingId: string; pedestrianOnCrossing: boolean }
  /** Vehicle committed to a turn at an intersection (steering into it). */
  | { kind: "turnStarted"; direction: TurnDirection }
  /** Physical contact with another body. */
  | { kind: "collision"; withWhat: "vehicle" | "pedestrian" | "cyclist" | "staticObject" }
  /** Player looked at a mirror (gaze/hover/click — input layer decides). */
  | { kind: "mirrorGlance"; mirror: MirrorKind }
  /**
   * RESERVED for v2 (right-of-way detectors): the engine adjudicates a
   * priority situation (right-hand rule, left turn vs oncoming, roundabout
   * entry, emergency vehicle...). `violated` grades FAILED_TO_YIELD; `yielded`
   * (resolved a real conflict correctly) earns a positive commendation.
   */
  | {
      kind: "prioritySituation";
      situation: string;
      violated: boolean;
      yielded?: boolean;
    };

/**
 * One frame of simulation state. Emitted every physics/render tick (any rate;
 * the rule engine is rate-independent — all thresholds are in seconds).
 *
 * Conventions the 3D engine MUST follow:
 * - `t` is seconds since session start, monotonically increasing
 *   (non-monotonic frames are dropped by the reducer).
 * - `laneId` 0 = rightmost lane of the current carriageway, increasing to the
 *   LEFT. The engine must keep ids stable along a road segment — renumbering
 *   mid-segment would register as a phantom lane change.
 * - `maxSpeedKmh` is the legal limit at the vehicle's current position
 *   (signs/zones already resolved by the engine).
 * - `events` are the discrete events since the previous tick, in order.
 */
export interface SimTick {
  /** Seconds since session start. Monotonic. */
  t: number;
  /** Current speed, km/h, >= 0. */
  speedKmh: number;
  /** Legal speed limit at current position, km/h. */
  maxSpeedKmh: number;
  /** World position, meters. (Unused by v1 detectors; part of the contract for replay/v2.) */
  position: Vec2;
  /** Heading in degrees, 0 = north, clockwise. (Replay/v2.) */
  headingDeg: number;
  /** Signed lateral offset from lane center, meters, + = left. (Replay/v2.) */
  laneOffsetM: number;
  /** Current lane index; 0 = rightmost, increases leftward. */
  laneId: number;
  /** Lanes in the current travel direction (optional; absent = unknown/1). */
  laneCount?: number;
  indicator: IndicatorState;
  headlights: HeadlightState;
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  /** -1 = reverse, 0 = neutral, 1.. = forward gears. */
  gear: number;
  /** Engine RPM (optional — v1 detectors do not use it). */
  rpm?: number;
  /** True when the world is in night conditions (engine decides from time-of-day). */
  isNight: boolean;
  /** True in rain / reduced visibility (optional; absent = dry). */
  rain?: boolean;
  /** Gap in meters to the nearest vehicle ahead in-lane (optional; absent/∞ = clear road). */
  leadGapM?: number;
  /** True when driving against the flow of a one-way street (runtime-computed). */
  wrongWay?: boolean;
  /** Discrete events since the previous tick. */
  events: SimTickEvent[];
}

// ---------------------------------------------------------------------------
// Output events — violations & commendations
// ---------------------------------------------------------------------------

/**
 * Official severity classes (Наредба № 38, docs/education/32):
 * опасни = 10 т., основни = 3 т., второстепенни = 1 т.
 */
export type SeverityClass = "opasna" | "osnovna" | "vtorostepenna";

export type ViolationPoints = 1 | 3 | 10;

/** Official points per severity class — single source of truth. */
export const SEVERITY_POINTS: Record<SeverityClass, ViolationPoints> = {
  opasna: 10,
  osnovna: 3,
  vtorostepenna: 1,
};

export type ViolationCode =
  // driving detectors (engine.ts)
  | "SPEEDING_OVER_LIMIT" // второстепенна: above limit beyond grace, within +10 km/h
  | "SPEEDING_DANGEROUS" // опасна: > 10 km/h over (official, doc 32)
  | "RED_LIGHT_CROSSED" // опасна (official list)
  | "STOP_SIGN_NO_FULL_STOP" // опасна: missed stop at Б2 (official list)
  | "TURN_WITHOUT_INDICATOR" // основна
  | "LANE_CHANGE_WITHOUT_INDICATOR" // основна
  | "LANE_CHANGE_WITHOUT_MIRROR_CHECK" // основна
  | "SEATBELT_OFF_WHILE_MOVING" // основна
  | "HANDBRAKE_LEFT_ON" // второстепенна
  | "HEADLIGHTS_OFF_AT_NIGHT" // основна
  | "HEADLIGHTS_OFF_IN_RAIN" // второстепенна: reduced visibility, low beam should be on
  | "POOR_LANE_KEEPING" // второстепенна: sustained off-centre / straddling positioning
  | "SPEED_TOO_FAST_FOR_CONDITIONS" // второстепенна: within the limit but imprudent for rain/night
  | "FOLLOWING_TOO_CLOSE" // основна: tailgating — under the 2-second gap
  | "WRONG_WAY" // опасна: driving against a one-way street
  | "NOT_KEEPING_RIGHT" // второстепенна: hogging a left lane on a multi-lane road
  | "FAILED_TO_YIELD" // опасна: entered a priority situation without giving way (Phase 2)
  | "PEDESTRIAN_CROSSING_TOO_FAST" // опасна: accident precondition (official list)
  | "PEDESTRIAN_NOT_YIELDED" // опасна
  | "COLLISION" // опасна + session terminate flag (official: exam terminated)
  // pre-drive procedure (procedures/machine.ts)
  | "PREDRIVE_STEP_SKIPPED" // второстепенна per skipped step
  | "PREDRIVE_SEATBELT_SKIPPED" // основна (skipping the belt is not a detail)
  | "PREDRIVE_WRONG_ORDER"; // второстепенна per out-of-order step

export type CommendationCode =
  | "FULL_STOP_AT_STOP_SIGN"
  | "SAFE_LANE_CHANGE" // mirror glance + indicator both done
  | "PEDESTRIAN_YIELDED"
  | "YIELDED_TO_PRIORITY" // gave way correctly at a priority situation
  | "CLEAN_DRIVING" // sustained violation-free driving (positive reinforcement)
  | "PREDRIVE_PERFECT";

export interface ViolationEvent {
  kind: "violation";
  code: ViolationCode;
  /** Session time of detection, seconds. */
  t: number;
  severityClass: SeverityClass;
  points: ViolationPoints;
  titleBg: string;
  explanationBg: string;
  /** Legal basis, e.g. "ЗДвП чл. 21". */
  lawRef: string;
  /** Knowledge-graph link (content/concepts.json) — drives theory recommendations. */
  conceptId?: string;
  /**
   * The official exam terminates on collision. The sim session CONTINUES for
   * learning value, but the session is graded as terminated.
   */
  terminateSession?: boolean;
  /** Extra machine-readable context (e.g. skipped pre-drive step id). */
  detail?: string;
}

export interface CommendationEvent {
  kind: "commendation";
  code: CommendationCode;
  t: number;
  titleBg: string;
  explanationBg: string;
  conceptId?: string;
}

export type RuleEvent = ViolationEvent | CommendationEvent;

/** Anything the session summary can score (violations + commendations). */
export type ScorableEvent = ViolationEvent | CommendationEvent;

export function isScorableEvent(e: { kind: string }): e is ScorableEvent {
  return e.kind === "violation" || e.kind === "commendation";
}

// ---------------------------------------------------------------------------
// Rule engine configuration (all thresholds in one place, all overridable)
// ---------------------------------------------------------------------------

export interface RuleEngineConfig {
  /**
   * Grace above the limit before ANY violation fires, as a ratio (0.10 = 10%).
   * Absorbs speedometer/physics noise the way real enforcement tolerances do.
   * NOTE: for limits >= 100 km/h the 10% grace exceeds the official +10 km/h
   * dangerous threshold, so the second-degree band is empty there — the
   * dangerous rule below always wins.
   */
  speedingGraceRatio: number;
  /** Official (doc 32): опасна when more than this many km/h over the limit. */
  dangerousSpeedOverKmh: number;
  /** Seconds the minor-speeding condition must hold before it fires. */
  speedingMinorSustainSec: number;
  /** Seconds the dangerous-speeding condition must hold before it fires. */
  speedingDangerousSustainSec: number;

  /**
   * Speed at or under which the vehicle counts as fully stopped, km/h.
   * Must absorb physics-solver creep: a car held on the brake reads a small
   * residual velocity (sub-1 km/h) from the rigid-body solver, and a full
   * stop that never registers is a 10-point опасна false positive (A12).
   */
  fullStopMaxSpeedKmh: number;
  /** Seconds the vehicle must remain fully stopped for the stop to qualify. */
  fullStopMinDurationSec: number;
  /** A qualifying full stop must have ended within this many seconds before crossing the Б2 line. */
  stopRecencySec: number;

  /** Above this speed the vehicle counts as "moving" (belt/handbrake/lights detectors). */
  movingSpeedKmh: number;
  /** Sustain windows for the continuous state detectors. */
  seatbeltSustainSec: number;
  handbrakeSustainSec: number;
  headlightsSustainSec: number;

  /** Indicator must have been on (in the right direction) within this window before a turn/lane change. */
  indicatorLookbackSec: number;
  /** Mirror glance (side of the maneuver) required within this window before a lane change. Doc requirement: 5 s. */
  mirrorLookbackSec: number;
  /** Lane-id changes below this speed are ignored (parking shuffles, not lane changes). */
  laneChangeMinSpeedKmh: number;

  /** |laneOffsetM| beyond this (while moving) counts as straddling / off-centre. */
  laneKeepMaxOffsetM: number;
  /** Seconds the off-centre condition must hold before POOR_LANE_KEEPING fires. */
  laneKeepSustainSec: number;

  /**
   * Prudent-speed factor on the posted limit in rain (0.85 = 15% below).
   * When several conditions apply the engine takes the MOST RESTRICTIVE
   * single factor (min), never the product — multiplying factors double-bills
   * a rainy night (0.85 x 0.9 = 0.765 would flag 40 km/h in a 50 zone, which
   * is textbook-prudent driving; A12 FP case).
   */
  conditionSpeedRainFactor: number;
  /**
   * Prudent-speed factor on the posted limit at night. 1 = night alone does
   * not reduce the enforced prudent speed: the MVP world is lit urban Sofia,
   * where driving AT the posted limit with low beams on is exactly what every
   * competent driver does — any factor < 1 here flags at-the-limit night
   * cruising, the single most common innocent night behaviour (A12 FP case).
   * If unlit rural segments arrive, reintroduce a reduction as a per-segment
   * world signal, not a blanket night factor.
   */
  conditionSpeedNightFactor: number;
  /** Seconds too-fast-for-conditions must hold before it fires. */
  conditionsSpeedSustainSec: number;
  /** Seconds of driving in rain without low beam before HEADLIGHTS_OFF_IN_RAIN. */
  rainLightsSustainSec: number;

  /** Time-gap target for the 2-second rule, seconds. */
  followSafeSeconds: number;
  /** Never flag below this gap floor (crawl / stop-and-go), meters. */
  followMinGapM: number;
  /**
   * Only judge following distance above this speed (below = stop-and-go), km/h.
   * Queue traffic legitimately rolls at 15-20 km/h with ~1-second gaps; the
   * floor must sit above the queue-roll band or dense traffic spams
   * FOLLOWING_TOO_CLOSE (A12 FP case — the genre's classic trust-killer).
   */
  followMinSpeedKmh: number;
  /**
   * Grace band on the time-gap target: the violation fires only below this
   * fraction of the safe gap. The 2-second rule is the TAUGHT ideal; grading
   * at 100% of it flags 1.7-second urban flow that no examiner would fault.
   * 0.7 ≈ fires under ~1.26 s of actual gap — genuinely close (A12).
   */
  followFireRatio: number;
  /**
   * Gap-opening rate (m/s) at or above which tailgating is NOT counted: the
   * driver is actively recovering. Protects the cut-in case — a car merging
   * a few metres ahead puts the driver inside the safe gap through no fault
   * of theirs; while they back off and the gap grows, no violation (A12).
   */
  followRecoveryRateMps: number;
  /** Seconds under the fire threshold before FOLLOWING_TOO_CLOSE fires. */
  followSustainSec: number;

  /** Seconds against a one-way's flow before WRONG_WAY fires. */
  wrongWaySustainSec: number;

  /** Metres of violation-free driving that earns a CLEAN_DRIVING commendation. */
  cleanDrivingDistanceM: number;

  /** Seconds in a non-rightmost lane (multi-lane) before NOT_KEEPING_RIGHT — long
   *  enough that a normal overtake never trips it. A real pass of a slower
   *  vehicle at a modest speed delta runs 10-15 s in the left lane; the hog
   *  the rule targets sits there for tens of seconds (A12 tolerance band).
   *  Left-lane time with the LEFT indicator on (declared overtake / left-turn
   *  positioning) is exempt entirely — see engine.ts. */
  keepRightSustainSec: number;

  /** Max approach speed inside a crossing zone while a pedestrian is on the crossing, km/h. */
  crossingApproachMaxKmh: number;
  /** Seconds above the approach max before the too-fast violation fires. */
  crossingTooFastSustainSec: number;
  /**
   * Deceleration (m/s², positive number) at or above which the driver counts
   * as actively responding to the pedestrian, pausing the too-fast clock.
   * Entering the ~25-30 m zone at a legal 45-50 km/h and braking normally
   * (~3 m/s²) takes ~1.5-2 s to get under the approach max — without this
   * band the 10-point PEDESTRIAN_CROSSING_TOO_FAST fires DURING a correct,
   * prompt braking response (A12 FP case). Barreling through at constant
   * speed, or merely lifting off, still fires on the sustain unchanged.
   */
  crossingBrakeResponseMps2: number;
  /** To earn the yield commendation the vehicle must have slowed to at most this, km/h. */
  yieldSlowSpeedKmh: number;

  /** Minimum seconds between two collision violations (physics multi-contact debounce). */
  collisionCooldownSec: number;
}

export const DEFAULT_RULE_CONFIG: RuleEngineConfig = {
  speedingGraceRatio: 0.1,
  dangerousSpeedOverKmh: 10, // official, do not change without an ADR
  speedingMinorSustainSec: 2,
  speedingDangerousSustainSec: 1,

  // A12: was 0.5 — physics-solver brake creep reads 0.5-1 km/h on a car that
  // is genuinely stopped, and at 0.5 a real stop could never qualify (FP case:
  // "physics-jitter full stop"). 1 km/h is still unambiguously a stop; a
  // rolling stop at 3-4 km/h stays guilty.
  fullStopMaxSpeedKmh: 1,
  fullStopMinDurationSec: 0.5,
  stopRecencySec: 6,

  movingSpeedKmh: 5,
  seatbeltSustainSec: 1,
  handbrakeSustainSec: 1.5,
  headlightsSustainSec: 2,

  indicatorLookbackSec: 3,
  mirrorLookbackSec: 5,
  laneChangeMinSpeedKmh: 10,

  // ~straddling the lane line, scaled with the perceptual road width (base
  // 1.3 on a textbook 3.25 m lane → 3.25 on the 8.125 m drawn lane). The car
  // stays real-size, so the tolerance must track the DRAWN lane, not the law.
  laneKeepMaxOffsetM: 1.3 * PERCEPTUAL_ROAD_SCALE,
  laneKeepSustainSec: 3, // conservative: only sustained wandering, not a brief drift

  conditionSpeedRainFactor: 0.85,
  // A12: was 0.9 — flagged driving AT the posted limit on lit urban streets at
  // night (FP case: "night cruise at exactly the limit, lows on"). See the
  // interface comment; factors compose by MIN, not product, so rain governs
  // a rainy night at 0.85.
  conditionSpeedNightFactor: 1,
  conditionsSpeedSustainSec: 3,
  rainLightsSustainSec: 3,

  followSafeSeconds: 1.8,
  followMinGapM: 4,
  // A12: was 15 — queue traffic rolls at 15-20 km/h with short gaps (FP case:
  // "queue roll at 18 km/h"); above 20 km/h you are genuinely flowing.
  followMinSpeedKmh: 20,
  // A12: new grace band — fire only under 70% of the 2-second target
  // (FP case: "urban flow at ~1.3 s gap"). Steady sub-1.3 s tailgating fires.
  followFireRatio: 0.7,
  // A12: new — a gap opening at >= 0.5 m/s means the driver is recovering
  // from a cut-in; do not count those frames (FP case: "cut-in recovery").
  followRecoveryRateMps: 0.5,
  followSustainSec: 2,

  wrongWaySustainSec: 1.5,
  // A12: was 8 — a real overtake of a slower vehicle runs 10-15 s in the left
  // lane (FP case: "10-second overtake"); a hog sits there far longer.
  keepRightSustainSec: 12,
  cleanDrivingDistanceM: 250,

  crossingApproachMaxKmh: 30,
  crossingTooFastSustainSec: 1,
  // A12: new — braking at >= 2 m/s² toward a pedestrian pauses the too-fast
  // clock (FP case: "prompt firm brake from a legal approach speed").
  crossingBrakeResponseMps2: 2,
  yieldSlowSpeedKmh: 10,

  collisionCooldownSec: 3,
};
