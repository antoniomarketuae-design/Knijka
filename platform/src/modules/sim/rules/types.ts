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
   * reports the light state AT THE MOMENT of crossing. B1a additions
   * (doc 72 JU-06/JU-08): "redYellow" is its own state (red+yellow creep is
   * the официална основна, not the 10-point red entry), and for yellow
   * crossings the runtime MAY attach `stoppable` — its amber adjudication of
   * whether a comfortable stop was possible at the green→yellow flip
   * (distance/speed snapshot vs reaction + comfortable-decel physics).
   * Absent = unknown → the reducer stays silent (conservative, A12).
   *
   * CONTRACT (C3 ruling — the tailgater defence): `stoppable: true` must mean
   * a COMFORTABLE stop was possible (гентle decel + full reaction time + a
   * safety margin — worldRuntime uses 3 m/s², 1 s, ×1.15), never merely a
   * physically possible one. A stop any FOLLOWER could also match is the bar:
   * that comfort margin is exactly what makes "I had a tailgater" a non-
   * defence — a follower at any legal-ish gap can match a 3 m/s² stop. An
   * adjudicator that cannot guarantee this must omit the field (= innocent).
   */
  | {
      kind: "stopLineCrossed";
      control: "stopSign" | "trafficLight";
      lightState?: "red" | "redYellow" | "yellow" | "green";
      stoppable?: boolean;
      /**
       * JU-18 (регулировчик): the traffic CONTROLLER's resolved permission
       * for this approach at the crossing moment. When present it is the
       * EFFECTIVE signal and overrides `lightState` entirely (ЗДвП чл. 7 —
       * сигналите на регулировчика са над светофара): "halt" grades the
       * dedicated опасна CONTROLLER_SIGNAL_VIOLATED even on green lamps;
       * "proceed" is innocent even on red. `lightState` still carries the
       * LAMP truth for debriefs/asserts. Absent = no controller (every
       * pre-JU-18 engine) → the lightState grading below, byte-identical.
       */
      controller?: "halt" | "proceed";
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
   *
   * N1 (doc 72 JU-10) additive: `gapSec` MAY carry the adjudicator's measured
   * time-gap to the conflicting vehicle at the commit moment (the ACCEPTED
   * GAP of a left turn across oncoming). Measurement channel only — the
   * reducer grades exclusively off `violated`/`yielded`; scenarios rubric the
   * gap (< ~3 s = unsafe-but-legal advisory). Absent = unknown.
   */
  | {
      kind: "prioritySituation";
      situation: string;
      violated: boolean;
      yielded?: boolean;
      gapSec?: number;
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
  /**
   * Stable id of the road segment `laneId` is numbered against (C1 revision).
   * Lane ids are only comparable WITHIN one segment — crossing to a segment
   * with a different lane count renumbers the same physical lane (see the
   * laneId convention note above). When present, the lane-change detector
   * only grades laneId deltas between frames on the SAME segment; absent =
   * legacy engines with globally stable ids keep the old behaviour. `null`
   * means off-road/unknown.
   */
  edgeId?: string | null;
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
  /** True in FOG — drastically reduced visibility (doc 72 AC-03; optional;
   * absent = clear). Distinct from `rain`: fog arms its own prudent-speed
   * factor (harsher — чл. 20 ал. 2: stop within the VISIBLE distance) and the
   * fog-lamp duty (чл. 74), never the rain-lights detector. */
  fog?: boolean;
  /** True in SNOW — winter grip conditions (doc 72 AC-08; optional; absent =
   * clear). Arms ONLY the snow prudent-speed factor (the harshest of the
   * condition factors — packed snow holds ~0.35–0.45 of dry grip, so чл. 20
   * ал. 2 demands the deepest speed cut); no lamp duty arms on snow, and the
   * rain/fog detectors never read it — every existing drive is byte-identical. */
  snow?: boolean;
  /** Front fog lamps on (the cockpit V key / driveline fogLightsOn channel).
   * Optional and additive: absent = unknown = treated as OFF, but the only
   * detector reading it (FOG_LIGHTS_OFF_IN_FOG) arms exclusively when
   * `fog` is true — every existing drive stays byte-identically innocent. */
  fogLightsOn?: boolean;
  /** Gap in meters to the nearest vehicle ahead in-lane (optional; absent/∞ = clear road). */
  leadGapM?: number;
  /** True when driving against the flow of a one-way street (runtime-computed). */
  wrongWay?: boolean;
  // -- B1a Wave-1 world context (doc 72 capabilities 1 + N3). ALL optional and
  // additive: absent = unknown, and every detector that reads them treats
  // unknown as innocent (A12 — conservative by construction).
  /**
   * The driveline's latched stall flag (VehicleSample.stalled passthrough).
   * Rising edge = the официална второстепенна „загасване" (doc 72 VP-04).
   */
  stalled?: boolean;
  /** True/false when the runtime knows the current edge's directionality;
   * absent = unknown (center-line grading stays silent). */
  oneway?: boolean;
  /** Legality-zone tag of the current edge (doc 72 N3; district data). */
  zone?: EdgeZoneTag;
  /** Overtaking banned on the current edge (В24-class zone; surface-only
   * context for the future overtake-corridor adjudicator — doc 72 OV-06). */
  noOvertake?: boolean;
  /** U-turn banned on the current edge (surface-only context until the
   * U-turn maneuver evaluator lands — doc 72 OV-17 maps no cheap code). */
  noUTurn?: boolean;
  /** N1 (doc 72 OV-14): the current edge is a NARROW two-way road (one marked
   * lane total — meeting traffic must negotiate the passage). Surface-only
   * world context for narrow-meeting scenarios/rubrics; no detector grades
   * it (the who-yields adjudication needs obstruction-side data, which lives
   * in the staged narrowMeeting spec). district-v1 has no such edge today —
   * the poligon apron and future districts do. */
  narrowTwoWay?: boolean;
  // -- ZONE-BAN data layer (ADR-006 stage 2a; doc 72 PK-06/OV-06). All three
  // flags come ONLY from authored district `zones` spans (В27/В28/В24), never
  // from heuristics — a ban zone is authored data, which is what makes the
  // deferred-illegal-stop FP finding structural: absent = no zone = innocent.
  /** Inside an authored В27 no-stopping span (престоят и паркирането са
   * забранени). Read by the ILLEGAL_STOP_IN_BAN_ZONE detector. */
  noStopZone?: boolean;
  /** Inside an authored В28 no-parking span. SURFACE-ONLY in this slice: a
   * short престой under В28 is LEGAL, and parking vs престой cannot be told
   * apart with current telemetry (the same A12 bar that deferred the generic
   * illegal-stop idea) — no detector grades it. PK-07 rides it later. */
  noParkZone?: boolean;
  /** Inside an authored В24 no-overtaking span. Read by the
   * OVERTAKING_IN_BAN_ZONE composite. DISTINCT from the edge-level
   * `noOvertake` surface tag above, which stays ungraded (whole-edge hint,
   * possibly present in shipped data) — only the bounded, sign-posted zone
   * span convicts. */
  noOvertakeZone?: boolean;
  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b; doc 72 OV-04/SN-03/SN-05).
  // Same contract as the stage-2a flags: authored district `zones` spans
  // only, never heuristics — absent = no span = innocent.
  /** Inside an authored М1 solid-осева span (единична непрекъсната линия).
   * Read by the CROSSED_SOLID_LINE detector; a mere touch keeps grading
   * CENTER_LINE_TOUCHED exactly as before. */
  solidCenterLine?: boolean;
  /** Inside an authored BUS-lane span: the CURB lane (laneId 0 of the
   * vehicle's bank) is a bus lane. Read by DRIVING_IN_BUS_LANE, and the
   * keep-right detector stops requiring that lane (correctly avoiding the
   * bus lane must never grade NOT_KEEPING_RIGHT). */
  busLaneRight?: boolean;
  /**
   * The vehicle occupies the bank OPPOSING its own travel direction on a
   * TWO-WAY road — its center is fully past the осева, on the oncoming half
   * (runtime-computed from the committed lane fix: the occupied bank's
   * nominal direction vs the vehicle heading — the same channel `wrongWay`
   * rides for one-ways). Kinematic world context, set only when true; legal
   * where the line is dashed — ONLY the solidCenterLine composite grades it.
   */
  opposingBank?: boolean;
  // -- RAIL PACK slice 1 (ADR-006 stage 3a; doc 72 §12 RX-01/RX-02/RX-03).
  // Same contract as every zone flag above: authored district `zones` spans
  // only (kind "railCrossing"), never heuristics — absent = no crossing =
  // innocent. No shipped v1 map carries a rail span.
  /**
   * Railway-crossing phase from the authored track-band span: "on" = the
   * committed lane fix sits ON the band (between the rails ± clearance);
   * "approach" = within the runtime's approach window BEFORE the band in the
   * travel direction. The reducer grades the approach→on transition (the
   * entry) and a rest while "on" — RAIL_CROSSING_VIOLATION.
   */
  railCrossing?: "approach" | "on";
  /**
   * The crossing in context is GUARDED (barriers/РЖ lamps — А34). The legal
   * asymmetry the detector encodes (ЗДвП чл. 51–53): guarded + OPEN carries
   * NO stop duty (crossing without stopping is legal); UNGUARDED (absent —
   * the author's explicit declaration, А35) carries the mandatory full stop
   * before the band.
   */
  railGuarded?: boolean;
  /**
   * The guarded crossing is currently BARRED (barriers down/closing per the
   * authored deterministic timetable). Entering the band while set is the
   * RX-01 kill — convicts regardless of any stop made first.
   */
  railBarred?: boolean;
  // -- CURVE-ENVELOPE slice (doc 72 SP-05 „Скорост в завой"; rural-curve
  // archetype). Same contract as every zone field above: authored district
  // `zones` spans only (kind "curveAdvisory" with a valid advisoryKmh), never
  // heuristics — absent = no envelope = innocent. No pre-slice map carries one.
  /**
   * Advisory-speed envelope of the authored curve span the vehicle is INSIDE,
   * km/h (the Т-table under the А1/А2 warning — doc 72 SP-05). Overlapping
   * spans resolve to the MOST RESTRICTIVE (min). Read by the
   * SPEED_TOO_FAST_FOR_CURVE detector; absent (every frame outside a span —
   * including the whole approach BEFORE the curve) leaves only the posted
   * `maxSpeedKmh` governing, exactly as before.
   */
  curveAdvisoryKmh?: number;
  // -- MOTORWAY-SEGMENT slice (doc 72 SP-10 „Магистрала"; motorway-segment
  // archetype). Same contract as every world-context field above: authored
  // district DATA only, never heuristics — absent = not a motorway = every
  // motorway detector silent. No pre-slice map carries either field.
  /**
   * The current edge is an АВТОМАГИСТРАЛА (edge-level `motorway: true` tag —
   * generator data, the noOvertake/noUTurn surface-tag discipline). Arms the
   * DRIVING_TOO_SLOW_FOR_MOTORWAY detector; the 140 limit itself already
   * rides `maxSpeedKmh` (SPEEDING_* grade it with zero new code).
   */
  motorway?: boolean;
  /**
   * Inside an authored "emergencyLane" zone span: the CURB lane (laneId 0 of
   * the vehicle's bank) is the лента за принудително спиране (ЗДвП чл. 58,
   * т. 3 — движение по нея е забранено освен при принудително спиране).
   * Read by EMERGENCY_LANE_DRIVING, and the keep-right detector stops
   * requiring that lane (the busLaneRight seam, mirrored): cruising the
   * rightmost TRAVEL lane (laneId 1) must never grade NOT_KEEPING_RIGHT.
   */
  emergencyLaneRight?: boolean;
  /** Distance to the next stop line ahead on the current edge (travel
   * direction), m, within the runtime's watch window; absent = none/unknown. */
  nextStopLineM?: number;
  /** Control of that line. */
  nextStopLineControl?: "stopSign" | "trafficLight";
  /** Live lamp state of that line's approach (trafficLight lines only). */
  nextStopLineState?: "red" | "redYellow" | "yellow" | "green";
  /** Distance to the nearest intersection node, m (within ~80 m); absent =
   * none near. Context gate for the causeless-harsh-brake detector. */
  nextJunctionM?: number;
  /** Discrete events since the previous tick. */
  events: SimTickEvent[];
}

/**
 * Per-edge legality-zone tag (doc 72 N3). "thirty" = a signed «Зона 30»
 * section (the edge's maxspeed already carries the reduced limit — SPEEDING_*
 * grades it with zero new code); "school"/"residential" reserved for
 * hand-polish/future districts (Д15/Д16 semantics per чл. 62–63).
 */
export type EdgeZoneTag = "school" | "residential" | "thirty";

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
  | "FOG_LIGHTS_OFF_IN_FOG" // второстепенна: dense fog without front fog lamps (AC-03, чл. 74)
  | "POOR_LANE_KEEPING" // второстепенна: sustained off-centre / straddling positioning
  | "SPEED_TOO_FAST_FOR_CONDITIONS" // второстепенна: within the limit but imprudent for rain/night
  | "FOLLOWING_TOO_CLOSE" // основна: tailgating — under the 2-second gap
  | "WRONG_WAY" // опасна: driving against a one-way street
  | "NOT_KEEPING_RIGHT" // второстепенна: hogging a left lane on a multi-lane road
  | "FAILED_TO_YIELD" // опасна: entered a priority situation without giving way (Phase 2)
  | "EMERGENCY_NOT_YIELDED" // опасна: failed to make way for a special-regime vehicle (VU-09; prioritySituation "emergency")
  | "PEDESTRIAN_CROSSING_TOO_FAST" // опасна: accident precondition (official list)
  | "PEDESTRIAN_NOT_YIELDED" // опасна
  | "COLLISION" // опасна + session terminate flag (official: exam terminated)
  // B1a Wave-1 detector pack (doc 72 capability 1 + N2)
  | "ENGINE_STALLED" // второстепенна: „загасване" (VP-04)
  | "MOVE_OFF_WITHOUT_OBSERVATION" // основна: no mirror check before first move-off (PK-05; config-gated, see moveOffObservationEnabled)
  | "STOP_LINE_OVERSHOOT" // второстепенна: halted past the line at red (JU-15)
  | "CENTER_LINE_TOUCHED" // второстепенна: „настъпване на осева линия" (SN-03/OV-04)
  | "HARSH_BRAKING_NO_CAUSE" // основна: „рязко спиране" with no hazard context (VP-09/SP-11)
  | "HESITATION_AT_GREEN" // второстепенна: „закъснели действия" — green + clear + stationary (JU-09)
  | "YELLOW_LIGHT_NOT_STOPPED" // основна: amber entered although a comfortable stop existed (JU-06)
  | "RED_YELLOW_CROSSED" // основна: entered on the red+yellow combination (JU-08)
  | "CONTROLLER_SIGNAL_VIOLATED" // опасна: entered against the traffic controller's halt (JU-18; Н38 termination item)
  // B1a Wave-2 detector pack (doc 72 capability 1 — small-rule detectors on EXISTING telemetry)
  | "STANDSTILL_GAP_TOO_CLOSE" // второстепенна: bumper-kissing behind a stopped lead at a standstill (FO-08)
  | "HIGH_BEAM_NOT_DIPPED" // второстепенна: long beam left on behind a lead vehicle at night (AC-04)
  | "OVERTAKING_AT_CROSSING" // опасна: overtaking (lane change past a lead) in a pedestrian-crossing zone (OV-07)
  // B1a Wave-3 detector pack (doc 72 capability 1 — config-gated per-lesson drills on EXISTING telemetry)
  | "JUNCTION_SCAN_INCOMPLETE" // основна: crossed a Б2 stop line without a fresh left-AND-right scan (JU-23; config-gated)
  | "FOLLOWING_TOO_CLOSE_FOR_RAIN" // второстепенна: dry-appropriate gap held in rain — under the wet 3-second gap (FO-04; config-gated)
  // ZONE-BAN data layer (ADR-006 stage 2a — authored В24/В27 district zones)
  | "ILLEGAL_STOP_IN_BAN_ZONE" // основна: casual rest inside a В27 no-stopping zone (PK-06; queue/signal stops structurally innocent)
  | "OVERTAKING_IN_BAN_ZONE" // основна: lane change past a lead inside a В24 no-overtaking zone (OV-06; the OV-07 corridor discipline)
  // LINE TYPES + BUS LANES (ADR-006 stage 2b — authored М1/BUS district zones)
  | "CROSSED_SOLID_LINE" // опасна: fully crossed the solid осева inside an authored М1 span (OV-04/SN-03 escalation; a touch stays CENTER_LINE_TOUCHED)
  | "DRIVING_IN_BUS_LANE" // основна: sustained car travel in an authored bus lane (SN-05; brief transits to turn/park structurally innocent)
  // RAIL PACK slice 1 (ADR-006 stage 3a — authored railCrossing district zones)
  | "RAIL_CROSSING_VIOLATION" // опасна: unguarded band entry without the mandatory full stop / entry while barred / coming to rest ON the tracks (RX-01/02/03, чл. 51–53)
  // CURVE-ENVELOPE slice (authored curveAdvisory district zones — doc 72 SP-05)
  | "SPEED_TOO_FAST_FOR_CURVE" // основна: sustained speed above the curve's posted advisory inside the marked arc (чл. 20 ал. 2)
  // MOTORWAY-SEGMENT slice (doc 72 SP-10 — edge motorway tag + emergencyLane zones)
  | "DRIVING_TOO_SLOW_FOR_MOTORWAY" // второстепенна: sustained causeless crawl under the чл. 54 50 km/h line on a motorway (SP-10; queue/transition innocent)
  | "EMERGENCY_LANE_DRIVING" // опасна: sustained DRIVING in the лента за принудително спиране (чл. 58, т. 3; breakdown pull-off braking innocent, stopping descoped)
  // OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — the head-on family)
  | "OVERTAKE_INSUFFICIENT_GAP" // опасна: committed on the opposing bank against an oncoming inside the convict gap (OV-05; the abort — braking + returning — NEVER convicts, OV-08)
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
  /**
   * C1 revision — lane-id deltas within this many seconds of a SEGMENT
   * (edgeId) transition are lane-numbering artifacts, not maneuvers, and are
   * never graded; deltas farther from a joint are held this long and only
   * emitted if no transition follows. Near a joint the locator's projection
   * sweeps the bank while the car corners (renumbering the same physical
   * lane just before/after the lock switches edges) — the C1 exam-bank bot
   * collected 2–4 phantom основни per drive at multi-lane joints. Only
   * applies when the tick reports edgeId; legacy sources grade immediately.
   */
  laneChangeJointGraceSec: number;

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
  /**
   * Prudent-speed factor on the posted limit in FOG (doc 72 AC-03). Fog is
   * harsher than rain's 0.85: чл. 20 ал. 2 demands a speed you can stop at
   * WITHIN YOUR VISIBLE DISTANCE, and the rendered dense fog leaves ~50 m of
   * usable sight — 0.6 (a 50-zone envelope of 30 km/h) is the „смъкни
   * драстично" band the AC-03 archetype teaches (40–50 % under the limit).
   * Composes with rain/night by MIN like every condition factor (never the
   * product — see conditionSpeedRainFactor); armed ONLY when tick.fog is
   * true, so no existing drive can reach it.
   */
  conditionSpeedFogFactor: number;
  /**
   * Prudent-speed factor on the posted limit in SNOW (doc 72 AC-08 winter
   * grip). The HARSHEST condition factor: packed snow holds ~0.35–0.45 of
   * dry grip (SNOW_GRIP_FACTOR 0.4 — braking distance ~2.5× dry), so the
   * чл. 20 ал. 2 stop-before-the-foreseeable-obstacle envelope demands a
   * deeper cut than fog's visibility-driven 0.6 — 0.5 (a 50-zone envelope
   * of 25 km/h) is the „зимна скорост" band the winter archetype teaches.
   * Composes with rain/fog/night by MIN like every condition factor (never
   * the product — see conditionSpeedRainFactor); armed ONLY when tick.snow
   * is true, so no existing drive can reach it.
   */
  conditionSpeedSnowFactor: number;
  /** Seconds too-fast-for-conditions must hold before it fires. */
  conditionsSpeedSustainSec: number;
  /** Seconds of driving in rain without low beam before HEADLIGHTS_OFF_IN_RAIN. */
  rainLightsSustainSec: number;
  /** Seconds of driving in FOG without front fog lamps before
   *  FOG_LIGHTS_OFF_IN_FOG (mirrors rainLightsSustainSec — grace for the
   *  moment between moving off and reaching for the V toggle). */
  fogLightsSustainSec: number;

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

  // -- B1a Wave-1 detector pack (doc 72 capability 1) ------------------------

  /**
   * Move-off observation (PK-05 / DVSA top-5). SHIPPED FLAGGED OFF: with the
   * current telemetry a curb move-off is indistinguishable from a queue/
   * light move-off, and the A12 innocent-drive contract (the FP battery's
   * spawn pull-aways, incl. the whole-commute case) treats an unglanced
   * pull-away as innocent — enabling it by default would flag the contract's
   * own drives. Lessons that DRILL the move-off ritual (потегляне от място)
   * opt in per-lesson via config override.
   */
  moveOffObservationEnabled: boolean;
  /** Mirror glance (left or rear) must fall within this window before the
   * session's FIRST move-off from rest. */
  moveOffLookbackSec: number;

  /** Vehicle-center distance to a red-controlled stop line at rest at/under
   * which the nose (≈2.15 m overhang) is clearly past the line/on the zebra.
   * Deliberately under the geometric touch point — flags a real overshoot,
   * never a bumper kissing the paint (A12). */
  stopOvershootCenterM: number;
  /** Seconds at rest past the line before STOP_LINE_OVERSHOOT fires. */
  stopOvershootRestSec: number;

  /** Seconds of riding the center line (two-way road, leftmost lane, offset
   * beyond laneKeepMaxOffsetM toward oncoming, indicator off) before
   * CENTER_LINE_TOUCHED fires. C3: was 2 — an unsignalled single-obstacle
   * avoidance (easing around a parked van, ~3 s over the line) fired as
   * line-riding (FP case: "unsignalled pass around a parked car"). 3.5 s
   * tolerates one avoidance arc; the lazy block-long straddle the code
   * targets still fires. The specific code keeps suppressing the generic
   * lane-keeping episode while armed (no double-bill). */
  centerLineSustainSec: number;

  /** Deceleration (m/s², positive) at/above which braking counts as harsh. */
  harshBrakeDecelMps2: number;
  /** Speed at brake onset must be at least this for a causeless-harsh-brake
   * episode, km/h (low-speed stabs are clumsy, not dangerous). */
  harshBrakeMinSpeedKmh: number;
  /** Seconds the harsh deceleration must sustain before it fires. */
  harshBrakeSustainSec: number;
  /** A lead vehicle within this gap is a plausible cause — never fire, m. */
  harshBrakeClearLeadGapM: number;
  /** A stop line ahead within this distance is a plausible cause, m. */
  harshBrakeStopLineClearM: number;
  /** A junction within this distance is a plausible cause, m. */
  harshBrakeJunctionClearM: number;
  /** C3: a FORBIDDING (non-green) traffic light ahead within this distance is
   * a plausible cause at any speed — braking for a visible yellow/red is a
   * response, not a phantom (FP case: "amber flip at 70 m", just outside the
   * 60 m stop-line gate). Matches the runtime's line watch window. */
  harshBrakeSignalCauseM: number;
  /** C3: a lead gap CLOSING at/above this rate (m/s) is a plausible cause at
   * any distance — a lead braking hard 50 m ahead at speed closes fast and
   * is exactly what the driver must respond to (FP case: "amber flip + lead
   * brake coincide, each just outside its gate"). */
  harshBrakeClosingLeadMps: number;
  /** Any hazard-shaped tick event (crossing zone, priority situation,
   * collision) within this many seconds exempts hard braking, s. */
  harshBrakeHazardCooldownSec: number;

  /** Stationary at a GREEN light with a clear box for this long =
   * второстепенна „закъснели действия" (JU-09). Generous by design. */
  hesitationSustainSec: number;
  /** Only judged while at rest within this distance of the line, m. */
  hesitationMaxLineDistM: number;
  /** Lead gap at/under this means someone blocks the box — never fire, m. */
  hesitationClearGapM: number;

  // -- B1a Wave-2 detector pack (doc 72 capability 1) ------------------------

  /**
   * FO-08 „дистанция на спиране в колона" — при пълно спиране зад спряла кола
   * gap at/under which the standstill is bumper-kissing (see-the-tyres rule),
   * m. Deliberately tiny (a genuine „no escape lane" gap): the exam-bot rests
   * ~6 m behind a lead and dense stop-and-go keeps 3-4 m, so only a real
   * bumper-kiss trips it (A12). Only judged at v ≈ 0 (a moving queue is the
   * FOLLOWING_TOO_CLOSE family's business, with its own queue exemption). */
  standstillMinGapM: number;
  /** Seconds at a bumper-kissing standstill before STANDSTILL_GAP_TOO_CLOSE
   * fires — long enough that the final metre of a normal pull-up (gap still
   * settling) never fires before the car rests at a safe gap. */
  standstillGapSustainSec: number;

  /**
   * AC-04 „дълги светлини зад кола" — lead gap at/under which long beam at
   * night dazzles the lead's mirrors and must be dipped (чл. 74), m. Only
   * armed when a lead is actually present (leadGapM finite) AND the beam is
   * HIGH — open-road high beam (no lead) stays innocent, exactly as the
   * existing lights-off detector leaves it. */
  highBeamDipMaxGapM: number;
  /** Seconds of undipped long beam behind a lead at night before the code
   * fires — grace for a brief high-beam flash and for the moment between
   * acquiring a lead and dipping. */
  highBeamDipSustainSec: number;

  /**
   * OV-07 „изпреварване на пътека" — a lead within this gap (m) is the vehicle
   * being overtaken when a lane change lands inside an armed crossing zone
   * (чл. 119). The code rides the ALREADY-denoised lane-change signal (joint
   * artifacts excluded), so its false-positive surface equals the lane-change
   * detector's — zero on an innocent single-lane drive. A lane change with no
   * lead ahead is a reposition, not an overtake, and never fires. */
  crossingOvertakeLeadGapM: number;

  // -- B1a Wave-3 detector pack (doc 72 capability 1) — per-lesson DRILLS ------
  // Both ship config-OFF (like moveOffObservation): the innocent-drive
  // contract (the FP battery's whole-commute crosses a Б2 unglanced; the exam
  // bot never widens its time-gap in rain) treats these patterns as innocent,
  // so a DEFAULT-ON grade would flag the contract's own drives. Lessons that
  // DRILL the specific skill opt in per-lesson via a rule-config override.

  /**
   * JU-23 „един поглед не стига" — the junction-scan lookback (config-gated).
   * At a Б2 „Спри!" line the driver must scan ляво-дясно-ляво; the code fires
   * when the STOP line is crossed without a FRESH left AND right glance in the
   * lookback. SHIPPED FLAGGED OFF: the A12 whole-commute innocent drive crosses
   * a stop sign with no glance events (an attentive human glances, but the
   * contract does not model it), so a default-on grade would flag it. Enabled
   * per-lesson for the Л-Д-Л observation drill.
   */
  junctionScanObservationEnabled: boolean;
  /** A left AND a right glance must each fall within this window before the
   *  Б2 line is crossed (mirror-lookback clone pointed at the stop line). */
  junctionScanLookbackSec: number;

  /**
   * FO-04 „дистанция в дъжд" — rain-aware following (config-gated). In rain the
   * braking distance grows ~1.5×, so the 2-second rule becomes 3+; the code
   * fires when the gap is fine for DRY (base FOLLOWING_TOO_CLOSE silent) but
   * under the WET-prudent gap. SHIPPED FLAGGED OFF: the exam-bot follows at a
   * fixed ~1.9 s time-gap in rain AND dry (it reduces SPEED, not the time-gap),
   * so a default-on grade would flag every rainy innocent exam drive. Enabled
   * per-lesson for the wet-following drill.
   */
  followRainAwareEnabled: boolean;
  /** Multiplier on followSafeSeconds when it is raining (1.6 → the 1.8 s dry
   *  target becomes ~2.9 s wet). The rain code fires below this scaled gap; the
   *  band ABOVE the plain dry safe gap keeps it clear of the base основна (no
   *  double-bill). */
  followRainSecondsFactor: number;
  /** Seconds under the wet-prudent gap before FOLLOWING_TOO_CLOSE_FOR_RAIN
   *  fires — generous (mirrors conditionsSpeedSustainSec): a brief dip toward
   *  the wet gap while easing back is ordinary rain driving, not tailgating. */
  followRainSustainSec: number;

  // -- ZONE-BAN data layer (ADR-006 stage 2a; doc 72 PK-06/OV-06) -------------

  /**
   * PK-06 „спиране в забранена зона" master gate. DEFAULT ON — structurally
   * safe: the flag only ever arms on tick.noStopZone, which comes exclusively
   * from authored district `zones` data, and NO shipped map carries zones
   * (the exam bank / free-drive districts are plain v1). The deferred
   * illegal-stop FP finding („a legal red-light/yield stop near a junction
   * looks identical to an illegal one") is answered structurally, not by
   * this switch: the zone is authored data AND every traffic-shaped rest
   * context below is exempt. The switch exists for lessons that want the
   * zone as pure context.
   */
  banZoneStopEnabled: boolean;
  /** Seconds at rest inside a В27 zone before ILLEGAL_STOP_IN_BAN_ZONE fires —
   *  long enough to exclude traffic micro-stops (creep pauses, 2 s
   *  hesitations); a deliberate „пусни ме тук за малко" curb stop holds far
   *  longer. */
  banZoneStopRestSec: number;
  /** A lead at rest within this gap = a QUEUE — the stop has a traffic cause
   *  and never convicts (the standstill-lead context of the harsh-brake
   *  cause ledger, m). */
  banZoneStopQueueGapM: number;
  /** A stop line ahead within this distance = a CONTROL stop (Б2/light
   *  queue), never convicts, m. Any FORBIDDING effective signal in the
   *  runtime's watch window is likewise innocent at any distance. */
  banZoneStopLineClearM: number;

  /**
   * OV-06 „изпреварване при забрана" — a lead within this gap (m) is the
   * vehicle being overtaken when a lane change lands inside an armed В24
   * zone. Mirrors crossingOvertakeLeadGapM exactly (the OV-07 corridor
   * discipline): the code rides the ALREADY-denoised lane-change signal, so
   * its false-positive surface equals the lane-change detector's — zero on
   * an innocent single-lane drive; a lane change with no lead is a
   * reposition, never an overtake.
   */
  banOvertakeLeadGapM: number;

  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b; doc 72 OV-04/SN-03/SN-05) ----

  /**
   * OV-04/SN-03 escalation — seconds the vehicle must CONTINUOUSLY occupy the
   * opposing bank inside an authored М1 solid-осева span before
   * CROSSED_SOLID_LINE fires. The bank flip is the locator's committed lane
   * fix (the same denoised signal the lane-change family rides), so the only
   * noise left is centre-of-the-line jitter — a car whose center dances ON
   * the paint flips the flag every few frames and can never hold it this
   * long, while a genuine crossing (pull-out or drift-across) holds it for
   * seconds (A12 — the jitter case lives in the FP battery).
   */
  solidLineCrossSustainSec: number;

  /**
   * SN-05 „бус лента" — seconds of sustained travel in an authored bus lane
   * before DRIVING_IN_BUS_LANE fires. The taught norm: crossing the bus lane
   * is LEGAL for the right turn / curb access, so a brief transit (≤ ~3 s)
   * must never convict — 4 s excludes every crossing transit while the
   * „skip-the-queue" cruise holds far longer. A RIGHT indicator exempts
   * entirely (declared turn/parking entry — the keep-right left-indicator
   * discipline, mirrored).
   */
  busLaneSustainSec: number;

  // -- RAIL PACK slice 1 (ADR-006 stage 3a; doc 72 RX-01/02/03) ---------------

  /**
   * RX-03 „опашка върху прелеза" — seconds at rest ON the authored track band
   * before RAIL_CROSSING_VIOLATION fires. Much shorter than the В27 rest
   * sustain (4 s) on purpose: resting on rails is never innocent, and NO
   * queue exemption applies (following the queue onto the tracks IS the
   * taught kill — the barrier drops on your roof). Still long enough that a
   * brisk brake-through or a physics-creep frame can never bill: only a car
   * genuinely AT REST on the band holds v ≤ 1 km/h this long.
   */
  railRestSustainSec: number;

  // -- CURVE-ENVELOPE slice (doc 72 SP-05; authored curveAdvisory spans) ------

  /**
   * SP-05 „скорост в завой" — grace band ABOVE the posted advisory, km/h,
   * before the curve code can arm. An advisory is a taught envelope, not a
   * radar limit: a speedometer's worth of slack (+5 on a 50 advisory) keeps
   * the at-the-advisory drive — the textbook behaviour — structurally clear
   * of the threshold (A12), while the real fault the archetype targets
   * (10–20+ km/h too hot into the bend) sits far above it.
   */
  curveSpeedGraceKmh: number;
  /**
   * Seconds the over-advisory condition must hold INSIDE the span before
   * SPEED_TOO_FAST_FOR_CURVE fires. Covers the honest entry overshoot: a
   * driver who arrives a touch hot and corrects within ~1.5 s is adapting,
   * not ignoring the advisory (A12); one who HOLDS the speed through the
   * bend is exactly the SWOV loss-of-control novice the code teaches.
   */
  curveSpeedSustainSec: number;

  // -- MOTORWAY-SEGMENT slice (doc 72 SP-10; edge motorway tag + emergencyLane
  // zones) ---------------------------------------------------------------

  /**
   * SP-10 „минимална скорост на магистрала" master gate. DEFAULT ON —
   * structurally safe (the zone-ban precedent): the detector only ever arms
   * on tick.motorway, which comes exclusively from an authored edge-level
   * `motorway: true` tag, and NO shipped map is a motorway — it cannot arm
   * anywhere else. The switch exists for lessons that want the motorway
   * context without the crawl grade.
   */
  motorwayMinSpeedEnabled: boolean;
  /**
   * The motorway flow floor, km/h. VERIFIED legal basis (content bank,
   * q-magistrali-i-izvangradsko-026): Bulgarian law has NO general mandatory
   * minimum driving speed on АМ — ЗДвП чл. 54 admits only vehicles whose
   * CONSTRUCTIVE max exceeds 50 km/h, and a posted minimum applies only
   * under the mandatory-minimum sign. 50 is therefore the honest line: a car
   * SUSTAINED under it without a traffic cause sits below what the motorway
   * legally admits — the SP-10 mobile chicane (speed-differential crashes).
   */
  motorwayMinFlowKmh: number;
  /**
   * |acceleration| (m/s²) below which the crawl counts as STEADY-STATE.
   * Transitions are innocent by construction (A12): accelerating up through
   * the sub-50 band after a move-off, or braking down through it toward a
   * stop, both carry |a| well above this — only a HELD crawl grades.
   */
  motorwaySlowSteadyMps2: number;
  /** A lead within this gap (m) means congestion — the crawl has a traffic
   *  cause and never convicts (the cause-ledger discipline). Sized for
   *  motorway headways: 60 m ≈ a 2 s gap at 110 km/h, so even a generous
   *  queue crawl behind a lead stays innocent. */
  motorwaySlowQueueGapM: number;
  /** Seconds the causeless steady crawl must hold before
   *  DRIVING_TOO_SLOW_FOR_MOTORWAY fires — one bill per episode, re-armed
   *  only by genuine recovery (back at/над the flow floor). */
  motorwaySlowSustainSec: number;

  /**
   * Чл. 58, т. 3 „движение по лентата за принудително спиране" — seconds of
   * sustained DRIVING in the emergency lane before EMERGENCY_LANE_DRIVING
   * fires. Deliberately SHORTER than the bus-lane 4 s and with NO indicator
   * exemption: crossing the emergency lane is not a legal maneuver the way
   * the bus-lane right-turn transit is — any sustained travel in it is the
   * fault, signalled or not. The one legal use (the breakdown pull-off) is
   * protected by the brake exemption below + the moving gate (the STOP
   * itself is descoped — never graded here).
   */
  emergencyLaneSustainSec: number;
  /** Deceleration (m/s², positive) at/above which emergency-lane presence is
   *  a breakdown PULL-OFF in progress (braking to a stop) — the clock pauses.
   *  A cruise/undertake holds speed or accelerates and still fires. */
  emergencyLaneBrakeExemptMps2: number;
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
  laneChangeJointGraceSec: 1.5, // C1 — see the interface comment


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
  // AC-03: 0.6 × 50 = 30 km/h — stop-within-the-visible-distance (чл. 20
  // ал. 2) at the rendered ~50 m fog visibility; deliberately far below
  // rain's 0.85 (fog composes by MIN and governs a foggy rain). Armed only
  // by tick.fog — dry/rain/night drives never touch it.
  conditionSpeedFogFactor: 0.6,
  // AC-08 winter grip: 0.5 × 50 = 25 km/h — the harshest factor (packed snow
  // grip ~0.4 of dry ⇒ braking distance ~2.5×; чл. 20 ал. 2). Composes by
  // MIN (a snowy fog grades at the snow envelope once, never the product).
  // Armed only by tick.snow — dry/rain/fog/night drives never touch it.
  conditionSpeedSnowFactor: 0.5,
  conditionsSpeedSustainSec: 3,
  rainLightsSustainSec: 3,
  fogLightsSustainSec: 3,

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

  // B1a Wave-1 (doc 72 capability 1). Every threshold errs innocent (A12).
  moveOffObservationEnabled: false, // see the interface comment — lessons opt in
  moveOffLookbackSec: 7,
  stopOvershootCenterM: 1.2, // nose ≥ ~1 m over the paint before it counts
  stopOvershootRestSec: 0.7,
  // C3: was 2 — fired on an unsignalled ~3 s obstacle avoidance (see interface).
  centerLineSustainSec: 3.5,
  harshBrakeDecelMps2: 7, // emergency-grade only; a firm 4–5 m/s² stop never fires
  harshBrakeMinSpeedKmh: 35,
  harshBrakeSustainSec: 0.4,
  harshBrakeClearLeadGapM: 45,
  harshBrakeStopLineClearM: 60,
  harshBrakeJunctionClearM: 35,
  harshBrakeSignalCauseM: 120, // C3: any visible yellow/red ahead is a cause
  harshBrakeClosingLeadMps: 3, // C3: fast-closing lead = cause at any distance
  harshBrakeHazardCooldownSec: 6,
  hesitationSustainSec: 5, // DVSA marks ~3 s; we grade only a clear freeze
  hesitationMaxLineDistM: 12,
  hesitationClearGapM: 12,

  // B1a Wave-2 (doc 72 capability 1). Every threshold errs innocent (A12).
  // FO-08: 1.5 m is unambiguously bumper-kissing; the exam-bot rests ~6 m and
  // dense stop-and-go keeps 3-4 m, so both stay clean.
  standstillMinGapM: 1.5,
  standstillGapSustainSec: 1.5,
  // AC-04: any lead within 150 m at night warrants low beam; the exam-bot
  // drives on low beams throughout, so it can never trip this.
  highBeamDipMaxGapM: 150,
  highBeamDipSustainSec: 3,
  // OV-07: a lead within 45 m is the car you are passing at the crossing.
  crossingOvertakeLeadGapM: 45,

  // B1a Wave-3 (doc 72 capability 1) — per-lesson drills, config-OFF by default.
  junctionScanObservationEnabled: false, // see the interface comment — lessons opt in
  junctionScanLookbackSec: 5, // same window as the lane-change mirror lookback
  followRainAwareEnabled: false, // see the interface comment — lessons opt in
  // 1.6 × 1.8 s = 2.88 s wet-prudent target; fire ratio 0.7 → fires under
  // ~2.0 s of actual gap. The exam-bot holds ~1.9 s in rain, so this is
  // deliberately the DRILL band a wet-following lesson enables, not a route rule.
  followRainSecondsFactor: 1.6,
  followRainSustainSec: 3,

  // ZONE-BAN data layer (ADR-006 stage 2a). Default ON — see the interface
  // comment: arming requires authored zone data no shipped map carries, and
  // the queue/signal/crossing exemptions keep every traffic-shaped rest
  // innocent (the FP battery locks them in).
  banZoneStopEnabled: true,
  banZoneStopRestSec: 4,
  banZoneStopQueueGapM: 8,
  banZoneStopLineClearM: 25,
  // OV-06: same 45 m lead corridor as the crossing overtake (one discipline).
  banOvertakeLeadGapM: 45,

  // LINE TYPES + BUS LANES (ADR-006 stage 2b). Structurally data-armed like
  // the stage-2a flags: no shipped map carries the spans, and every threshold
  // errs innocent (A12).
  // 0.6 s: paint-jitter flips can't hold it; the shortest real pull-out can.
  solidLineCrossSustainSec: 0.6,
  // 4 s: a right-turn/curb transit crosses the bus lane in ~2-3 s; the cruise
  // the law targets holds it for blocks.
  busLaneSustainSec: 4,

  // RAIL PACK slice 1 (ADR-006 stage 3a). Structurally data-armed like every
  // zone detector: no shipped v1 map carries a railCrossing span.
  // 2 s: resting on the tracks is never innocent (no queue exemption — the
  // RX-03 kill), while braking THROUGH without stopping never holds v ≈ 0.
  railRestSustainSec: 2,

  // CURVE-ENVELOPE slice (doc 72 SP-05). Structurally data-armed like every
  // zone detector: only an authored curveAdvisory span (with a valid
  // advisoryKmh) can set tick.curveAdvisoryKmh — no pre-slice map carries one.
  curveSpeedGraceKmh: 5,
  curveSpeedSustainSec: 1.5,

  // MOTORWAY-SEGMENT slice (doc 72 SP-10). Structurally data-armed like every
  // zone detector: only an authored edge `motorway: true` tag sets
  // tick.motorway, and only an authored emergencyLane span sets
  // tick.emergencyLaneRight — no pre-slice map carries either.
  motorwayMinSpeedEnabled: true,
  motorwayMinFlowKmh: 50, // чл. 54's constructive line — see the interface note
  // 0.5 m/s²: the recorder's own rates (accel 2.2 / brake ≥ 3.2) and any
  // honest live transition sit far above it; a held crawl reads ~0.
  motorwaySlowSteadyMps2: 0.5,
  motorwaySlowQueueGapM: 60,
  motorwaySlowSustainSec: 4,
  // 3 s: an accidental clip of the lane edge can never hold it; the shortest
  // deliberate undertake does (≈ 90+ m at motorway speed).
  emergencyLaneSustainSec: 3,
  emergencyLaneBrakeExemptMps2: 1,
};
