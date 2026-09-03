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
/**
 * THE GRADED LOOK CHANNEL — the three mirrors plus the one look that is not a
 * mirror at all.
 *
 * `shoulder` is the over-the-LEFT-shoulder check into the blind spot: the
 * wedge that starts where the door mirror's field ends and stops short of the
 * interior mirror's, in which a cyclist coming up the kerb side is invisible
 * in EVERY piece of glass on the car. It is a separate member and not a fourth
 * mirror for exactly that reason — see `scene/cabin.ts` `MirrorGlanceKind`,
 * which owns the act, and note that every consumer here that means MIRROR
 * GLASS (`scanStopCreditSec`, the A2 observer's `mirrorsGlanced`) must EXCLUDE
 * shoulder rather than widen to it.
 */
export type GlanceKind = MirrorKind | "shoulder";
export type IndicatorState = "off" | "left" | "right";
export type HeadlightState = "off" | "low" | "high";
export type TurnDirection = "left" | "right";
/**
 * The М10 lane-intent glyph painted in a lane (audit M-17). Only the MANDATORY
 * ones are modelled: a lane whose glyph the runtime cannot read as a direction
 * set (the roundabout „nearExits"/„farExits" labels, a future glyph) must
 * resolve to `undefined` on the tick and grade nothing — an unreadable marking
 * is the author's problem, never the student's.
 */
export type LaneArrow = "left" | "through" | "right" | "leftThrough" | "throughRight";

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
      /**
       * "stopSign" = Б2 „Стоп" — a full stop at the line is demanded regardless
       * of traffic (ЗДвП чл. 50). "trafficLight" = signalized (lightState/
       * controller adjudicate). "giveWay" = Б1 „Пропусни движението" — NO full
       * stop is demanded at the line: yielding is the duty, and a clear mouth
       * is legal at a roll (same чл. 50 — „пълно спиране се налага само когато
       * иначе би ги засякъл", content bank q-krastovishta-006). The failure-to-
       * yield case is NOT graded here — it rides the SEPARATE prioritySituation
       * {situation:"give-way"} event (→ FAILED_TO_YIELD), exactly as an
       * uncontrolled junction does. Absent Б1 authoring no runtime emits it, so
       * every shipped drive is byte-identical.
       */
      control: "stopSign" | "trafficLight" | "giveWay";
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
  /**
   * Vehicle passed over the pedestrian crossing; flag sampled at that moment.
   *
   * HOST-EDGE GATE (audit H-6). A zone arms from the crossing's host edge AND
   * every edge sharing a node with it — right for the APPROACH duty, wrong for
   * the pass: the pass test is a plain ahead→behind sweep with a lateral budget
   * sized for the outer lane of a 6-lane arterial (~22 m), and at a junction
   * that budget also swallows the SIDE streets' zebras. A full district sweep
   * produced 36 off-host-edge passes, 25 of them for a zebra the car never came
   * within 8 m of; with the lesson/exam traffic preset walking 20 pedestrians
   * over 51 crossings, one of those is near-certainly occupied — i.e. the
   * 10-point опасна that ends the exam fires for a zebra on another street.
   *
   * `hostEdgeId` is the id of the road segment the paint is on, in the SAME id
   * space as `SimTick.edgeId` (the district edge id). The reducer grades the
   * pass only when it cannot positively tell the two apart — an affirmative
   * mismatch means the car was merely NEAR the crossing, never on it. Emitting
   * it is the runtime's duty; absent = the source does not name host edges and
   * every existing drive grades byte-identically.
   */
  | {
      kind: "crossingPassed";
      crossingId: string;
      pedestrianOnCrossing: boolean;
      hostEdgeId?: string | null;
    }
  /**
   * Vehicle left the approach zone WITHOUT crossing — it turned away at the
   * junction, or reversed back out. The zone's closing bracket: `crossingPassed`
   * is the OTHER way a zone can end, and a driver who turns off never sends one.
   *
   * Without this event the armed zone outlives its geometry for the rest of the
   * session (audit H-5), and every zone-conditioned rule rides along: the
   * overtake ban keeps grading kilometres away from any zebra, the approach-speed
   * check keeps watching, and the detectors that stand down near a crossing
   * (keep-right, motorway-slow, curve speed) stay suppressed forever. Emitting it
   * is the engine's duty whenever it drops a zone for any reason other than a pass.
   */
  | { kind: "crossingZoneExited"; crossingId: string }
  /** Vehicle committed to a turn at an intersection (steering into it). */
  | { kind: "turnStarted"; direction: TurnDirection }
  /**
   * Physical contact with another body.
   *
   * `actorId` NAMES THE BODY, and it is what turns „one crash" from a guess
   * into a fact. Without it the engine is told only the CATEGORY, so two
   * different parked cars struck a second apart read as one encounter and the
   * second bills nothing (measured on sc-hz-accident-scene: two wreck rects at
   * y=150 and y=162, struck 1.1 s apart, inside `collisionSeparationSec` —
   * one bill). Reporters that KNOW which body they hit supply it and are then
   * graded per body; reporters that do not omit it and are graded per
   * category, exactly as before. See `engine.ts`'s `collision` case.
   */
  | {
      kind: "collision";
      withWhat: "vehicle" | "pedestrian" | "cyclist" | "staticObject";
      actorId?: string;
    }
  /** Player looked at a mirror — or over his shoulder into the blind spot
   *  (`mirror: "shoulder"`, which is NOT glass; see `GlanceKind`). Gaze /
   *  hover / click / key: the input layer decides. */
  | { kind: "mirrorGlance"; mirror: GlanceKind }
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
  /**
   * Metres of authored world left in front of the car — the distance to the
   * rectangle past which there is no ground, no props and no road
   * (`runtime/district.worldEdgeClearanceM`; negative outside it).
   *
   * WHY A TICK FIELD AND NOT A LOOKUP. The measure was shipped, gated by its
   * own test, and then read by NOTHING: on 2026-08-24 `districtWorldEdge` and
   * `worldEdgeClearanceM` had zero non-test consumers anywhere in the tree, and
   * its own docblock said so — «it draws nothing and it ends nothing». Meanwhile
   * the census inside that block records the defect it exists to answer: a
   * learner reaches the end of the authored world 60–78 m past the last road on
   * EVERY map in the product. A number nobody can read is not a repair, so it
   * travels with the tick, beside laneOffsetM, where the surfaces that must act
   * on it already look.
   *
   * OPTIONAL, and nothing grades on it. No rule reads this field; the HUD does.
   * A tick from a source with no district (replays, fixtures, the dev rigs)
   * simply omits it, and every consumer must treat absent as "unknown", never
   * as "outside".
   */
  worldEdgeClearanceM?: number;
  /**
   * Is that edge a WALL on this map, or the bare end of the ground?
   *
   * `world/builders/worldRim.districtHasWorldRimBelt` — true on the 103
   * authored micro-maps, which since 2026-08-27 are belted with a contiguous,
   * collidable row of building masses just inside the rim; false on the two
   * Sofia OSM extracts, where the terrain really does simply stop.
   *
   * IT EXISTS BECAUSE A SENTENCE WAS WRONG. The rim card is the only thing the
   * product ever says about what is out there, and it said «няма нито път, нито
   * сграда — теренът просто свършва» on every map — telling the student the
   * opposite of the wall in his windscreen (`sc-jx-equal-left:29a8ae1a`, whose
   * frame is a car parked nose-first against a rim mass). A virtual instructor
   * that contradicts the glass is worse than a silent one (THEO-4), so the
   * copy branches on this.
   *
   * OPTIONAL and ungraded, exactly like `worldEdgeClearanceM` beside it. Absent
   * means UNKNOWN — the consumer must fall back to the weaker claim, never
   * assert a wall it cannot see.
   */
  worldEdgeIsWalled?: boolean;
  /**
   * Mandatory direction glyph painted in the vehicle's OWN lane (М10 lane-
   * intent arrows — audit M-17). Authored world data (`meta.scenario
   * .laneArrows`, resolved by worldRuntime from the committed lane fix), never
   * a heuristic — and ABSENT means "no arrows here", which is always innocent.
   * Until this channel existed, no rule read the arrows at all: the whole
   * SN-04 lesson („ляв завой от лента „само направо") was graded as a missing
   * indicator, i.e. the debrief explained чл. 25 for an act that broke чл. 6.
   */
  laneArrow?: LaneArrow;
  indicator: IndicatorState;
  headlights: HeadlightState;
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  /** -1 = reverse, 0 = neutral, 1.. = forward gears. */
  gear: number;
  /**
   * FUNCTIONAL accelerator, 0..1 — the value the physics is actually being
   * given (post gate, post reverse remap; `VehicleInput.throttle`).
   *
   * THE ONE THING THE GRADER COULD NOT SEE. `PARKING_BRAKE_FORCE_N` (13 000 N
   * across the rear axle, against a 4 800 N peak engine force) does not make
   * the car DRAG — it makes the car STOP: eight seconds of full throttle
   * against the lever reached 0.32 км/ч on the drive rig, while
   * `HANDBRAKE_LEFT_ON` needs `speed > movingSpeedKmh` = 5. So on the lesson
   * TITLED „Потегляне с вдигната ръчна" the named fault could not be booked
   * from a standstill at all, and its debrief read «чисто каране без нито едно
   * нарушение» (sc-vp-handbrake:1f2f7463). Speed alone cannot tell a student
   * who is ASKING the car to move from one sitting still with his hands in his
   * lap; the pedal can.
   *
   * OPTIONAL, and absence is INNOCENCE. Every recorded trace, every replay and
   * every hand-built fixture omits it (`traces/recorder.ts` builds its
   * `VehicleSample` without one), so the only detector that reads it —
   * the config-gated standstill arm of `HANDBRAKE_LEFT_ON` — can never fire
   * there and every shipped shadow stays byte-identically clean.
   */
  throttlePedal?: number;
  /**
   * Is the engine RUNNING (`DrivelineState.engineOn`)?
   *
   * WHICH BLOCKER AM I BILLING? `engine/stuckStart.ts stuckStartReason` names
   * the ONE thing standing between the pedal and the road, in the order a
   * driver has to clear them: engine off → selector in P → selector in N →
   * parking brake. The cockpit speaks that answer aloud. A grader that books
   * the LEVER while the cockpit is saying «запали двигателя» charges a student
   * for a fault he was never told about and narrates a cause that is not the
   * one holding the car — which is the whole defect the standstill arm exists
   * to stop making. So that arm reads this channel and `gear` and convicts only
   * where the brake really is the blocker: engine running, a gear engaged.
   *
   * OPTIONAL, and absence ACQUITS. Traces, replays and fixtures omit it (they
   * omit `throttlePedal` too, so the arm is already unreachable there), and a
   * rig that cannot say what the ignition is doing cannot be allowed to guess.
   */
  engineOn?: boolean;
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
  /**
   * Distance in metres to the nearest PERSON in the vehicle's own path ahead —
   * a pedestrian or a cyclist standing in or crossing the carriageway the car
   * is about to occupy. Absent = the reporter cannot answer (every hand-built
   * tick, every recorded trace, every caller that has not been taught to
   * publish it), NOT „nobody there".
   *
   * THE ONE INNOCENT REST THE REDUCER COULD NOT SEE. `leadGapM` is the VEHICLE
   * ahead and `s.crossing` needs an authored crossing zone, so a car halted in
   * front of a human being looked, to every existing channel, exactly like a
   * car halted in front of nothing. Sweep 161, `sc-hz-accident-scene /
   * pc-right`, frame `04-t092s.png`: a НАУЧИ card convicting «Спиране в
   * забранена зона … под знак В27» at the moment a bystander is standing in
   * the car's lane — stopping for a person taught as an offence, on the lesson
   * whose entire subject is that people are standing there.
   *
   * POLARITY, deliberately one-directional: this channel can only ACQUIT. A
   * value inside `banZoneVruAheadM` makes a rest lawful; absence leaves every
   * detector exactly as it shipped, so no recorded drive changes shape. It is
   * never read to convict — inferring „he should have stopped" from a distance
   * is the adjudication A12 refuses, and it would need the person's own
   * heading and speed, which this number does not carry.
   */
  vruAheadM?: number;
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
  // -- PAINTED LANE MARKINGS (doc 86 T1 — the world referent the three lane
  // codes were missing). `CROSSED_SOLID_LINE` has always been gated on
  // `solidCenterLine`, and `WRONG_LANE_FOR_DIRECTION` on `meta.scenario
  // .laneArrows`; these two generalise that precedent to the осева and the lane
  // dividers, so a scenario can no longer grade paint its district never draws.
  //
  // POLARITY, deliberately asymmetric: an explicit **false** is the world
  // builder's own statement that it painted NOTHING here, and only that
  // disarms a detector. ABSENT means the caller cannot answer — a hand-built
  // tick in a unit test, a recorded trace, a clip plan — and leaves every
  // detector armed exactly as it shipped, so no existing drive changes shape.
  // (The runtime sets them only in the disarming direction for the same
  // reason: a painted road produces a byte-identical tick.)
  /**
   * An ОСЕВА is painted where the vehicle is — a line with oncoming traffic
   * behind it. `false` = the world draws none (an unmarked `service` aisle, an
   * odd-lane carriageway, a junction interior), and CENTER_LINE_TOUCHED cannot
   * fire: 90 of 155 scenarios used to bill «Настъпване на осевата линия» on
   * roads with no paint at all, which is the single widest defect in doc 86.
   */
  centreLinePainted?: boolean;
  /**
   * ANY lane boundary is painted where the vehicle is. `false` = there is no
   * painted lane to keep, and POOR_LANE_KEEPING / NOT_KEEPING_RIGHT cannot
   * fire — founder item 46: «there are no lanes on the roads I only know them
   * in my head» while the HUD congratulated him on keeping one.
   */
  laneLinesPainted?: boolean;
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
  /** Control of that line (see stopLineCrossed.control — "giveWay" = Б1). */
  nextStopLineControl?: "stopSign" | "trafficLight" | "giveWay";
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
 * hand-polish/future districts (Д15/Д16 semantics per чл. 61–62).
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
  | "TURN_WITHOUT_OBSERVATION" // основна: turned without a matching mirror glance (M-17; config-gated, see turnObservationEnabled)
  | "WRONG_LANE_FOR_DIRECTION" // основна: turned out of a lane whose М10 arrow forbids that direction (M-17; чл. 6)
  | "LANE_CHANGE_WITHOUT_INDICATOR" // основна
  | "LANE_CHANGE_WITHOUT_MIRROR_CHECK" // основна
  | "SEATBELT_OFF_WHILE_MOVING" // основна
  | "HANDBRAKE_LEFT_ON" // второстепенна
  | "HEADLIGHTS_OFF_AT_NIGHT" // основна
  | "HEADLIGHTS_OFF_IN_RAIN" // второстепенна: reduced visibility, low beam should be on
  | "FOG_LIGHTS_OFF_IN_FOG" // второстепенна: dense fog without front fog lamps (AC-03, чл. 74)
  | "POOR_LANE_KEEPING" // второстепенна: sustained off-centre / straddling positioning
  | "SPEED_TOO_FAST_FOR_CONDITIONS" // второстепенна: within the limit but imprudent for rain/night
  // THE OTHER SIDE OF THE SAME ENVELOPE (audit sc-vu-emergency-junction:853790f7).
  // Every speed code in this file graded the FAST half only. A reference drive
  // held 10–11 км/ч for over two minutes on a street posted 40 and booked
  // nothing, while the flat-out leg of the same lesson was billed once a tick —
  // so „пълзи и минаваш" was an unbeaten strategy across the whole lesson set.
  // The duty is ЗДвП чл. 22, ал. 1 („без основателна причина с твърде ниска
  // скорост… пречи"); there is NO statutory minimum, so the floor is derived
  // from the POSTED limit and the code is второстепенна, exactly like its
  // motorway sibling. See the detector in engine.ts for every acquittal.
  | "DRIVING_TOO_SLOW_IN_TOWN" // второстепенна: sustained causeless crawl far under the posted limit on a through road (чл. 22, ал. 1)
  // THE LIMIT CASE OF THE SAME ENVELOPE — audit sc-jx-priority-confidence:9c987e7b.
  // Both crawl codes above require `moving` (v > movingSpeedKmh): a car at REST
  // is descoped by construction, and `townReset` zeroes the crawl ledger the
  // moment the driver recovers, so a stop-drive-stop-drive pass books nothing at
  // all. On the lesson NAMED „без излишни спирания" the credited drive stood
  // still for most of 88 s on an open priority road with a car glued to its
  // bumper and read «Второстепенни 0 0 · ★★★». A stop is not a slow speed and
  // needs its own duty: ЗДвП чл. 24, ал. 2 — before slowing significantly the
  // driver must satisfy himself he will not endanger the others and will not
  // „затрудни излишно тяхното движение". Config-gated OFF (needlessStopEnabled),
  // armed per lesson: see the detector in engine.ts for every acquittal.
  | "STOPPED_WITHOUT_CAUSE" // второстепенна: held at a standstill in a live lane on an open through road with nothing to stop for (чл. 24, ал. 2)
  | "FOLLOWING_TOO_CLOSE" // основна: tailgating — under the 2-second gap
  | "WRONG_WAY" // опасна: driving against a one-way street
  | "NOT_KEEPING_RIGHT" // второстепенна: hogging a left lane on a multi-lane road
  // The SAME article as NOT_KEEPING_RIGHT, one step further out. чл. 15, ал. 1
  // places the car „по платното за движение" and then as far right as it can
  // be; hogging the left lane breaks the second half, and this breaks the
  // first. Fed by `SimTick.edgeId === null` — the runtime's own statement that
  // the car is past the kerb — never by `!edgeId`: `undefined` means the tick
  // source cannot answer, and reading absence as departure convicts every
  // replay and every hand-built fixture. See the detector in engine.ts.
  | "OFF_CARRIAGEWAY" // основна: sustained travel/rest off the carriageway (чл. 15, ал. 1)
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
  | "JUNCTION_SCAN_INCOMPLETE" // основна: crossed a priority line (Б1 or Б2) without a fresh left-AND-right scan (JU-23; config-gated)
  | "FOLLOWING_TOO_CLOSE_FOR_RAIN" // второстепенна: dry-appropriate gap held in rain — under the wet 3-second gap (FO-04; config-gated)
  | "CLOSING_ON_LEAD_TOO_FAST" // основна: the gap to the car in front is COLLAPSING and has fallen under the taught time-gap — the approach to a slowing/stopped queue (FO-08; config-gated)
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
  | "DRIVING_TOO_SLOW_FOR_MOTORWAY" // второстепенна: sustained causeless crawl on a motorway — ЗДвП чл. 22, ал. 1; the 50 km/h floor is authored, not statutory (SP-10; queue/transition innocent)
  | "EMERGENCY_LANE_DRIVING" // опасна: sustained DRIVING in the лента за принудително спиране (чл. 58, т. 4; т. 3 permits the breakdown STOP — pull-off braking innocent, stopping descoped)
  // OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — the head-on family)
  | "OVERTAKE_INSUFFICIENT_GAP" // опасна: committed on the opposing bank against an oncoming inside the convict gap (OV-05; the abort — braking + returning — NEVER convicts, OV-08)
  | "OVERTAKE_RETURN_TOO_EARLY" // основна: returned to the own bank under ~1 s in front of the overtaken vehicle — the brake-forcing cut back (OV-09; чл. 42 — връщане вдясно без засичане; runtime overtake-return tracker)
  // VRU-INTERACTION pack slice 1 (doc 72 VU-02 — the lateral-clearance duty)
  | "VULNERABLE_PASS_TOO_CLOSE" // основна: passed a same-direction cyclist with under ~1.2 m of air (чл. 42 достатъчна странична дистанция; the 1.2–1.5 m band stays a taught grace — runtime vulnerable-pass tracker)
  // N11 cockpit stimuli (doc 72 VP-06 — the red/amber telltale triage)
  | "WARNING_LAMP_IGNORED" // основна: drove on past a RED dashboard warning lamp instead of pulling over (ЗДвП чл. 139, ал. 1, т. 1; orchestrator telltale runner — structurally armed only where a red telltale is STAGED)
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
  /**
   * THIS EVENT IS THE RE-GRADE OF A BREACH ALREADY REPORTED, not a new act.
   *
   * Set by the CONTINUING-BREACH arms of `reduceTick`, and only by those:
   *  · the six one-switch duties — belt, handbrake, the four lamp arms (see
   *    `STANDING_DUTY_REGRADE_SEC`);
   *  · the two второстепенни speed codes — SPEEDING_OVER_LIMIT and
   *    SPEED_TOO_FAST_FOR_CONDITIONS (see `SPEED_REGRADE_SEC`).
   * Each of them adds exactly ONE such bill per episode, because the FIRST bill
   * is spent by the founder-approved teach-first free mini-lesson, and without
   * it an entire lesson driven unbelted, unlit, or 59 км/ч through a posted 50
   * reached its debrief as «чисто каране» / «Второстепенни 0 0». (The duties
   * then stop at two bills; SPEEDING_OVER_LIMIT keeps its own 20 s repeat
   * cadence on top, and those repeats are NOT marked.) The marked bill exists
   * ONLY to reach the charge the teach consumed.
   *
   * So it must not be charged when the first bill ALREADY was — in exam mode
   * (no teach pass at all), on a repeat offence (the topic was taught in the
   * earlier episode), or under any scenario policy that grades on sight.
   * `lessons/engine.ts` reads exactly this field and drops such an event
   * before it reaches the coach; without that, one continuous unlit night run
   * on an exam variant costs 6 основни points where Наредба № 38 prices it at
   * 3, and the exam fail gate is `osnovniPoints > 6`.
   *
   * ABSENT IS THE NORMAL CASE and means „a new act". It never reaches the wire
   * (`lessons/wire.ts` builds its own picked shape) and nothing scores on it.
   */
  regrade?: true;
}

export interface CommendationEvent {
  kind: "commendation";
  code: CommendationCode;
  t: number;
  titleBg: string;
  explanationBg: string;
  conceptId?: string;
  /**
   * WHICH ACT THIS PRAISE IS ABOUT, when the pooled code cannot say (round 10,
   * 2026-08-25). `YIELDED_TO_PRIORITY` is pushed for nine different situations
   * and `YIELD_PRAISE_SITUATION_COPY` (catalog.ts) retitles three of them, so
   * the title is no longer derivable from `code` alone — and the debrief is
   * built twice, once on the client and once from the server's rebuild of the
   * wire log. Present ONLY when it actually selected different copy; absent is
   * the pooled row, i.e. every commendation shipped before this field existed.
   *
   * It is the commendation's half of the `detail` channel `ViolationEvent`
   * already has, and it rides that same wire key (`lessons/wire.ts`).
   */
  situation?: string;
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
   * Window the signed acceleration is measured over, seconds (audit M-18).
   * The LARGE-SIGNAL acceleration gates read this one derivative — braking
   * response on a crossing approach, the harsh-brake onset, the emergency-lane
   * pull-off exemption — and a derivative taken across a single RENDER frame is
   * dominated by driveline noise (see the ACCEL WINDOW note in engine.ts). Must
   * be long enough to average the jitter and short enough that a real brake
   * application is not smeared away; at replay/trace rates (≥ 1 s frames) it
   * changes nothing.
   *
   * THE MOTORWAY STEADY-CRAWL TEST IS NO LONGER ONE OF THEM, and this sentence
   * used to list it (corrected 2026-08-23). Its band is 0.5 m/s², which is
   * SMALLER than this window's own residual as priced two paragraphs down in
   * `DEFAULT_RULE_CONFIG` — so it was reading a large-signal instrument to ask
   * a small-signal question. It now reads this derivative OR
   * `motorwaySlowSteadyMeanWindowSec`'s, qualifying on either; see that field.
   */
  accelWindowSec: number;
  /**
   * Grace above the limit before ANY violation fires, as a ratio (0.10 = 10%).
   * Absorbs speedometer/physics noise the way real enforcement tolerances do.
   * Capped in absolute km/h by `speedingGraceMaxKmh` — see it and the
   * `speedingBands()` header for why the two units must not be left to cross.
   */
  speedingGraceRatio: number;
  /**
   * Absolute ceiling on the proportional grace, km/h (audit M-14). MUST stay
   * below `dangerousSpeedOverKmh`, otherwise the second-degree band closes and
   * SPEEDING_OVER_LIMIT becomes dead code again on fast roads.
   */
  speedingGraceMaxKmh: number;
  /** Official (doc 32): опасна when more than this many km/h over the limit. */
  dangerousSpeedOverKmh: number;
  /** Seconds the minor-speeding condition must hold before it fires. */
  speedingMinorSustainSec: number;
  /** Seconds the dangerous-speeding condition must hold before it fires. */
  speedingDangerousSustainSec: number;
  /**
   * Seconds the driver must HOLD the limit before a speeding episode re-arms
   * (audit M-16). A momentary dip under the limit is one continuing offence
   * being corrected, not a fresh one: without this, a saw-tooth around the
   * limit billed once per dip while a steady 8 km/h over billed once in a
   * minute — the more dangerous drive graded an order of magnitude cheaper,
   * and the student who kept correcting punished for correcting.
   */
  speedingRearmSec: number;
  /**
   * Seconds after which an UNBROKEN speeding episode bills again (audit M-16;
   * 0 = never). The other half of the same fairness: with the re-arm cooldown
   * alone, sitting over the limit indefinitely would cost exactly one point,
   * so the cost must keep growing while the offence keeps going.
   */
  speedingRepeatSec: number;

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

  /**
   * THE SAME LEVER, FROM A STANDSTILL — the other half of `HANDBRAKE_LEFT_ON`
   * (sc-vp-handbrake:1f2f7463, critical).
   *
   * The shipped arm needs `moving` (> `movingSpeedKmh`), and the parking brake
   * in this product HOLDS rather than drags (see `SimTick.throttlePedal`), so
   * a student who floors the pedal without releasing the lever commits the
   * lesson's own named fault and reaches the debrief with an empty изпитен
   * лист. This arm books it on the ACT the student actually performs: the
   * accelerator asked for, and held against, an engaged parking brake.
   *
   * SHIPPED FLAGGED OFF, the `moveOffObservationEnabled` precedent, for the
   * same A12 reason: 130 exam rungs and 31 whole templates hand over a COLD
   * car (engine off, selector P, brake on), and arming a standstill offence
   * across all of them by default would grade the cockpit on lessons that
   * never asked the student to think about it. Drills that TEACH the release
   * opt in per lesson through `ScenarioSpec.ruleConfig`.
   */
  handbrakeMoveOffEnabled: boolean;
  /**
   * Continuous seconds of pedal against the engaged lever before the first
   * bill. Deliberately LONGER than `STUCK_START_HINT_S` (1.2 s), the moment
   * `engine/stuckStart.ts` makes the cockpit say «Ръчната спирачка е вдигната
   * — колата е задържана»: the student is TOLD what is wrong, and only a
   * pedal still held more than a second later is an act rather than a
   * misunderstanding. Teach first, then grade (doc 64 THEO-4).
   */
  handbrakeMoveOffSustainSec: number;

  /**
   * Indicator must have been on (in the right direction) within this window
   * before a turn/lane change. The tracker is refreshed EVERY TICK the stalk
   * is on (engine.ts §1), so this is not "signal early enough" — it is "how
   * long an EXTINGUISHED signal still counts", and the thing that extinguishes
   * it is usually not the student. See the default for the beginner case.
   */
  indicatorLookbackSec: number;
  /**
   * Mirror glance (side of the maneuver) required within this window before a
   * lane change. Measured from the glance to the frame `tick.laneId` flips —
   * i.e. it has to cover the human beats AND the whole lateral traverse of a
   * lane drawn at PERCEPTUAL_ROAD_SCALE. See the default.
   */
  mirrorLookbackSec: number;
  /**
   * Ceiling on the STOPPED time subtracted from a lane-change glance's age
   * (2026-08-16). The window above is a wall clock, and the drilled sequence
   * has an unbounded beat in the middle of it: огледало → мигач → изчакай
   * пролука → маневра. Waiting for a real gap from a standstill routinely
   * outlasts 8 s, so the glance expired on a student who looked, signalled and
   * waited — the three things the lesson asked for — and LANE_CHANGE_WITHOUT_
   * MIRROR_CHECK fired on the pull-away. The engine already owns the ledger
   * (`scanStopCreditSec`, founder R3 #13); this is how much of it the mirror
   * may spend. Capped, unlike the junction scan's use of the same ledger: a
   * driver waiting at a mouth keeps FACING the road he scanned, while a blind
   * spot behind a standing car fills in without him.
   */
  mirrorWaitFreezeMaxSec: number;
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

  // -- CLOSING_ON_LEAD_TOO_FAST (FO-08; doc 87 item 7 — his item 40) ---------
  //
  // WHY THIS EXISTS, measured before it was written. `sc-follow-standstill`
  // („Дистанция при спиране в колона") is a drill about approaching a STOPPED
  // queue, and its nominal pace is the staged lead's own 20.2 km/h cruise.
  // Driven at exactly that pace down the lane with no lift, the recorded run
  // reads: lead gap 27.5 m at t = 13 s → 8.6 m at t = 41 → 2.7 m at t = 43 →
  // 0.0 m at t = 45, and the ENTIRE rule-event log for the run is
  // `+CLEAN_DRIVING@46.5` and `STANDSTILL_GAP_TOO_CLOSE@54.2`. Not one distance
  // fault, at any point, on a drive that ends in the queue. The founder's
  // result screen for the live version of that drive is «20 наказателни точки ·
  // НЕИЗДЪРЖАН · Опасни 2 · Основни 0 · Второстепенни 0» — he failed and was
  // told nothing, which is a requirement-zero (doc 64 THEO-4) violation as much
  // as a tuning one.
  //
  // The mechanism is one number: `followMinSpeedKmh` is 20 and the drill is
  // driven at 19.9. Below the floor `FOLLOWING_TOO_CLOSE` is silent — for good
  // reason, since a queue rolling in formation at 15–20 km/h with one-second
  // gaps is normal traffic and grading it is the genre's classic trust-killer.
  //
  // The floor is therefore NOT lowered. What is added is the discriminator the
  // floor was standing in for: a queue in formation holds its gap, and a driver
  // running into the back of one does not. So this code judges the gap below
  // the floor ONLY while the gap is genuinely COLLAPSING — closing at
  // `leadClosingMinRateMps` or more. A steady queue can never arm it (closing
  // ≈ 0); a car ahead that is faster than you can never arm it (the gap opens).
  //
  // SHIPPED OFF, like every other per-lesson detector: the exam bots and 149
  // other templates keep the pre-change grading byte-for-byte.

  /** Master switch — enabled per lesson (`ruleConfig`), never by default. */
  leadClosingEnabled: boolean;
  /**
   * Closing rate (m/s) the gap must be shrinking at before this code can fire.
   * Above the frame-to-frame noise of the gap channel, and well under the
   * ~1.2–1.6 m/s a non-lifting driver develops against a queue that is coming
   * to rest (measured on the drill above).
   */
  leadClosingMinRateMps: number;
  /**
   * Seconds the collapsing-and-under-gap state must hold before it fires.
   * SHORTER than `followSustainSec` on purpose: a gap that is closing is its
   * own confirmation, and the whole value of this code is that it speaks while
   * the student still has room to stop.
   */
  leadClosingSustainSec: number;

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

  /**
   * WHAT MAKES TWO CONTACTS ONE ACCIDENT — seconds of NO reported contact that
   * end an encounter. This is not a rate limit; see the engine's `collision`
   * case for the rule it implements.
   *
   * It replaced `collisionCooldownSec: 3`, which was a rate limit, and which
   * billed a student 10 наказателни точки every three seconds for as long as
   * anything kept reporting the same touch. MEASURED before it was written:
   *
   *   · 30 s of unbroken contact through the reducer → ELEVEN
   *     «Пътнотранспортно произшествие», at t = 0, 3, 6 … 30. 110 points for
   *     one bumper;
   *   · a car held motionless against a body whose contact was re-reported at
   *     2 Hz for 40 s → 14 bills, 140 points, AND the FR-B5-JAM crash-pin
   *     rescue never fires: each new bill re-arms the pin with a fresh pose,
   *     restarting its 10 s stillness clock, so the drive that cannot move is
   *     also the drive that cannot end. One contact report, same 40 s: one
   *     bill, rescue at t = 13.5 s;
   *   · and it had the two cases backwards. A 4 s scrape along a wall billed
   *     TWICE (one accident); hit → 1 s of daylight → hit again billed ONCE
   *     (two accidents).
   *
   * THE NUMBER. Rapier does not re-fire a sustained contact — measured: a
   * chassis pushed into a kinematic NPC shell for 30 s emits exactly one
   * `collisionEnter` and zero exits. What re-fires it is the shell POOL:
   * NpcColliders rebinds every REASSIGN_INTERVAL_SEC = 0.5 s and a rebound
   * shell is teleported (`setTranslation`), which measured as a fresh
   * `collisionEnter` every 0.5 s while the player leant on it. So the window
   * must clear 0.5 s. Its ceiling is the fastest genuinely separate second
   * accident: reversing 1 m out and driving back in, with an instant gearbox
   * and no interlocks, measured 2.35 s of broken contact (the real D→N→R gate
   * makes it longer). 1.2 s sits 2.4× above the repeater and about half of the
   * floor under the real second impact.
   *
   * Erring long is the cheap direction (A12): the cost is forgiving a second
   * crash inside 1.2 s, against 90 points for one.
   */
  collisionSeparationSec: number;

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
  /** The observation — a mirror (left or rear) AND the over-the-shoulder
   * blind-spot check — must fall within this window before the session's FIRST
   * move-off from rest. BOTH, since 2026-09-01: see the discharge in engine.ts
   * §1b for why a mirror alone used to be enough and why that was the fault the
   * lesson exists to teach, dressed as a pass. */
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
  /**
   * THE OTHER WAY THE BOX IS NOT CLEAR (2026-08-16). `hesitationClearGapM` is
   * a bumper distance — it answers „is a car standing on top of me", and 12 m
   * is roughly one car plus a mouth. It cannot answer the question чл. 50 ал. 2
   * actually asks, which is „can I get OUT the far side", because the queue
   * that blocks the exit is by definition on the far side of the junction and
   * therefore FAR AWAY.
   *
   * Measured on the shipped correct demonstration of `sc-jx-blocked-exit` — the
   * drill whose entire subject is not entering a junction you cannot clear —
   * re-graded with DEFAULT_RULE_CONFIG: the driver stops at the line at t=12.5
   * with the light green and the queue tail 56.4 m beyond the mouth, and is
   * convicted of закъснели действия 5.0 s later. The drill survives ONLY
   * because its template carries a one-line `ruleConfig: { hesitationClearGapM:
   * 63 }`; no other scenario carries it, and lessons/specs.ts — the
   * official-format exam on real Sofia streets — carries no ruleConfig at all.
   *
   * So the escape is widened to the distance a blocked exit actually sits at,
   * and the thing that keeps it from swallowing the detector whole is not the
   * distance but the SECOND condition beside it in engine.ts: the traffic ahead
   * must not be moving away. A lead that is opening the gap will clear the box,
   * and freezing behind it is the hesitation JU-09 grades; a lead that is
   * standing still is the exit you cannot reach, and entering would be the
   * fault the lesson teaches. A road with nobody on it (leadGapM absent) never
   * touches this and grades exactly as shipped.
   */
  hesitationQueueGapM: number;

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

  /**
   * OV-07/OV-06 direction gate (audit H-5) — seconds a pull-out keeps an
   * overtake "open", i.e. how long the RETURN leg may lag the moment the driver
   * swung out past the vehicle ahead. Overtaking is a left-side manoeuvre in two
   * beats (ЗДвП чл. 42, ал. 2): swing out, come back. The beats are told apart
   * by direction, and the return beat only counts as overtaking when it closes a
   * pull-out this engine actually saw — otherwise a change to the RIGHT is a
   * merge back to the curb, or the legally REQUIRED move into the rightmost lane
   * before a right turn (чл. 37), which is exactly where a crossing zone is
   * armed. The same window also bounds how stale the lead sighting behind a
   * pull-out may be: the lead drops out of the ±4 m corridor while the car sits
   * astride the boundary, so the pull-out frame itself often reports no lead.
   * Long enough to cover a laboured pass of a crawling truck, short enough that
   * an overtake finished streets ago cannot convict a later rightward move. */
  overtakeManeuverWindowSec: number;

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

  /**
   * M-17 „завой без огледало" — the turn's observation duty (config-gated).
   * A turn is a manoeuvre under чл. 25, ал. 1 exactly as a lane change is, and
   * TURN_WITHOUT_OBSERVATION fires when `turnStarted` carries no glance to the
   * turn's side inside `mirrorLookbackSec`. SHIPPED FLAGGED OFF for the reason
   * every observation check is: the glance channel is authored per lesson, and
   * the shipped shadow/attempt traces turn without one — a default-on grade
   * would convict the contract's own correct drives. Lessons that DRILL the
   * mirror-before-turn habit opt in per-lesson.
   */
  turnObservationEnabled: boolean;
  /**
   * M-17 — how long an М10 lane arrow keeps governing after the vehicle has
   * driven off the painted span, seconds. The arrows are painted on the
   * approach and the turn is adjudicated inside the junction, so without a
   * memory the arrow would never be in force at the moment it matters; too
   * long a memory and the NEXT junction inherits it. Sized for one junction
   * traversal at urban speed (~6 s ≈ 50–80 m), and the memory is spent by the
   * first turn it sees regardless.
   */
  laneArrowMemorySec: number;
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
  /**
   * A PERSON in the path this close ahead = the rest has a human cause and
   * never convicts, m (`SimTick.vruAheadM`). The queue exemption above reads
   * `leadGapM`, which is the vehicle ahead; this is the same exemption for the
   * road user чл. 5, ал. 2 puts first, and it exists because the reducer
   * convicted a student of «Спиране в забранена зона» while a bystander stood
   * in front of his bumper (see engine.ts's ban-zone block).
   *
   * DELIBERATELY WIDER THAN THE QUEUE GAP. 8 m answers „is a car standing on
   * top of me"; a person is not a car. He can step, he is not lit, he is not
   * where the driver's eye is trained, and the whole duty is to leave him room
   * — so the distance at which stopping for him is obviously right is the
   * distance at which he is obviously the reason, not the one at which he is
   * unavoidable. 20 m is inside the urban stopping distance from 50 км/ч and
   * still short enough that a curb stop half a block from a pedestrian is
   * judged on its own merits.
   */
  banZoneVruAheadM: number;
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
   * The motorway flow floor, km/h — a PRODUCT threshold, not a statutory one.
   *
   * CORRECTED 2026-08-03. This used to read „ЗДвП чл. 54 admits only vehicles
   * whose CONSTRUCTIVE max exceeds 50 km/h". Both halves were false: чл. 54 is
   * the rail-crossing forced-stop article, and the figure is 70, not 50.
   * Retrieved — ЗДвП чл. 55, ал. 1: „На път, обозначен като автомагистрала или
   * скоростен път със съответния пътен знак, е разрешено движението само на
   * моторни превозни средства или състав от пътни превозни средства, чиято
   * конструктивна максимална скорост надвишава 70 km/h."
   *
   * What the law actually gives us: (a) no general mandatory minimum driving
   * speed on АМ; (b) a condition on the VEHICLE, > 70 km/h constructive; (c)
   * ЗДвП чл. 22, ал. 1 — „не трябва да се движи без основателна причина с
   * твърде ниска скорост, когато по този начин пречи на движението на другите".
   * (c) is the graded duty and it names no number at all.
   *
   * 50 therefore stays as an AUTHORED detection floor — deliberately below the
   * 70 line so the detector can only ever fire on a crawl nobody would defend —
   * and it is NOT presented to the student as a legal limit. Per the founder's
   * ruling: show the rule and the article, and no guessed number.
   */
  motorwayMinFlowKmh: number;
  /**
   * |acceleration| (m/s²) below which the crawl counts as STEADY-STATE.
   * Transitions are innocent by construction (A12): accelerating up through
   * the sub-50 band after a move-off, or braking down through it toward a
   * stop, both carry |a| well above this — only a HELD crawl grades.
   */
  motorwaySlowSteadyMps2: number;
  /**
   * Seconds the crawl's steadiness test averages the acceleration over, when
   * the instantaneous derivative says „transition" (see engine.ts's
   * `crawlSpeedWindow` and `steadyForCrawl`).
   *
   * WHY A SECOND WINDOW EXISTS AT ALL. `accelWindowSec` is 0.04 s and is set
   * by the harsh-brake conviction, where smoothing is lag — its own note says
   * 0.15 s already silences two authored panic-brake demos. Its residual at
   * 120 fps is ~0.42 m/s², which is 84 % of `motorwaySlowSteadyMps2`. A
   * 0.5 m/s² question cannot be asked of a derivative whose noise is 0.42, and
   * a beginner pumping the pedal at ~2 Hz adds ±1.7 m/s² on top of that.
   *
   * WHY THIS LENGTH. One second spans two full cycles of a ~2 Hz pedal, so the
   * pumping averages to the drift it actually is, while a real merge
   * (~2.5 m/s²) still reads 2.5 over the same second and stays exempt. It is
   * also LONGER than every recorded frame period the corpus replays at
   * (TRACE_SAMPLE_HZ = 20 → 0.05 s; the sweep fixtures → 0.25 s), which is the
   * point: at those rates this reading is a genuine average rather than the
   * previous frame restated, and it is the ONLY consumer of it.
   *
   * Shortening it toward `accelWindowSec` re-opens the defect; lengthening it
   * past a few seconds starts smearing a real merge into a crawl.
   */
  motorwaySlowSteadyMeanWindowSec: number;
  /** A lead within this gap (m) means congestion — the crawl has a traffic
   *  cause and never convicts (the cause-ledger discipline). Sized for
   *  motorway headways: 60 m ≈ a 2 s gap at 110 km/h, so even a generous
   *  queue crawl behind a lead stays innocent. */
  motorwaySlowQueueGapM: number;
  /** Seconds the causeless steady crawl must hold before
   *  DRIVING_TOO_SLOW_FOR_MOTORWAY fires — one bill per episode, re-armed
   *  only by genuine recovery (back at/над the flow floor). */
  motorwaySlowSustainSec: number;

  // -- THE TOWN HALF OF THE SPEED ENVELOPE (DRIVING_TOO_SLOW_IN_TOWN) --------
  /**
   * Master switch for the town-crawl detector. ON by default: the fault it
   * grades — a car held at walking pace on a through street — is available on
   * every ordinary district, and shipping it OFF would be the dead-predicate
   * class the whole audit exists to stop.
   */
  townCrawlEnabled: boolean;
  /**
   * The POSTED limit at or above which a road counts as a through road for
   * this detector, km/h.
   *
   * WHY A POSTED-LIMIT GATE AND NOT A LESSON LIST. Under 40 the plate itself
   * says „this is a calmed place": every parking map in the corpus is posted
   * 20 (all fourteen `lot-*`), the полигон is 20/30, `pk-drive-v1` and
   * `sp-zone30-v1` are 30. Crawling there is not a fault, it is the exercise —
   * and a Зона 30 is signed precisely so that people go slowly. So the arming
   * condition and the duty are the same road by construction: чл. 22, ал. 1
   * forbids obstructing OTHER traffic, and a 20 km/h aisle has none to obstruct.
   */
  townCrawlMinPostedKmh: number;
  /**
   * The crawl floor as a fraction of the posted limit — a PRODUCT threshold,
   * not a statutory one (Bulgaria has no general minimum speed; see the
   * catalogue row). Below `min(limit × this, townCrawlFloorCapKmh)` a steady,
   * causeless car is a mobile obstacle. At 0.3 that is 12 км/ч on a road posted
   * 40 and 15 on one posted 50 — walking-to-jogging pace, well under anything a
   * cautious learner cruises at, and it is NEVER shown to the student as a legal
   * limit (the copy states the rule and the article, and no guessed number).
   */
  townCrawlFractionOfLimit: number;
  /** Absolute cap on that floor, km/h — so a 90 km/h out-of-town road does not
   *  inherit a 27 km/h floor it has no urban flow to justify. */
  townCrawlFloorCapKmh: number;
  /** A junction, stop line or pedestrian ahead within this distance (m) is a
   *  REASON to be slow — чл. 22, ал. 1 forbids the crawl „без основателна
   *  причина", so a stated reason acquits before the clock ever runs. */
  townCrawlClearAheadM: number;
  /** Seconds of qualifying crawl (accrued, not consecutive) before the bill.
   *  Far longer than the motorway's 4 s: town driving is legitimately full of
   *  short slow stretches, and only a held, causeless crawl is the fault. */
  townCrawlSustainSec: number;

  // -- THE STOP THAT HAD NO REASON (STOPPED_WITHOUT_CAUSE) -------------------
  /**
   * Master switch for the needless-stop detector — OFF by default, armed per
   * lesson through `ScenarioSpec.ruleConfig` (the `junctionScanObservationEnabled`
   * / `followRainAwareEnabled` discipline), NOT the townCrawl "on everywhere"
   * one.
   *
   * WHY THE TWO SPEED-ENVELOPE CODES SHIP ON AND THIS SHIPS OFF, since the
   * difference is the whole risk calculus here. A crawl has ONE innocent shape
   * (I am going slowly because something up the road says so) and the acquittal
   * list below covers it. A STOP has dozens, and most of them are the curriculum
   * itself: the stop-mark drills halt on a painted mark, the parking family
   * halts in a bay, `sc-vp-police-stop` halts at the kerb, the pre-drive
   * procedure is performed at a standstill, and dozens of lessons end at rest on
   * their last objective. The rules module cannot see an objective, so it cannot
   * tell „arrived" from „froze" — and a detector that convicts a student for
   * finishing the exercise is worse than no detector at all. Armed per lesson,
   * the author states that on THIS route, standing still is never the task.
   */
  needlessStopEnabled: boolean;
  /**
   * Seconds a causeless standstill must be HELD (consecutive — one stop is one
   * act) before STOPPED_WITHOUT_CAUSE fires. One bill per stop; driving on
   * re-arms it, so a driver who stops needlessly twice is billed twice.
   *
   * Sized against the neighbours rather than picked: `hesitationSustainSec` is
   * 5 s for a freeze at a GREEN light — where a signal is actively telling the
   * driver to go — and `banZoneStopRestSec` is 4 s. Six is longer than both,
   * because here nothing at all is instructing the driver, and it is 3× the
   * longest authored rest in this template's own committed traces (the
   * phantom-brake demo pauses 2.0 s, the shadow 1.5 s at the end of the route),
   * so neither drive changes shape.
   */
  needlessStopSustainSec: number;

  /**
   * Чл. 58, т. 4 „да се движи… в лентата за принудително спиране" — seconds of
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
  // M-18: deliberately SHORTER than the 0.05 s trace sample period
  // (TRACE_SAMPLE_HZ = 20), so on every recorded replay the anchor is exactly
  // the previous frame and the whole regression corpus grades byte-identically
  // — while the live render loop, the only place the bug ever lived, spans ~5
  // frames at 120 fps and drops the noise-derived acceleration from 2.1 m/s²
  // (above crossingBrakeResponseMps2 — the audit's case) to ~0.42.
  // Do NOT lengthen it casually: smoothing is LAG, and the harsh-brake
  // conviction (7 m/s² held 0.4 s) is knife-edge on the authored panic-brake
  // demos — a 0.15 s window already makes two of them silent, i.e. turns a
  // graded mistake into a false negative.
  accelWindowSec: 0.04,
  speedingGraceRatio: 0.1,
  // M-14: 10% of the urban 50 — so every city map grades exactly as it always
  // did — and a hard ceiling above it, so the second-degree band survives on
  // the 90/140 roads instead of being swallowed by the +10 опасна line.
  speedingGraceMaxKmh: 5,
  dangerousSpeedOverKmh: 10, // official, do not change without an ADR
  speedingMinorSustainSec: 2,
  speedingDangerousSustainSec: 1,
  // M-16: 4 s genuinely at/under the limit re-arms the bill (long enough that
  // a saw-tooth reads as one episode, short enough that a real second offence
  // after a settled stretch is graded on its own); an episode that never
  // breaks re-bills every 20 s.
  speedingRearmSec: 4,
  speedingRepeatSec: 20,

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

  // OFF by default — see the field. `sc-vp-handbrake` opts in.
  handbrakeMoveOffEnabled: false,
  handbrakeMoveOffSustainSec: 2.5,

  // REGISTER B21 — founder: „he must press almost at the same time few buttons
  // … just a second." Both windows are widened, and the reason is the same in
  // both: they were set at REAL-WORLD numbers and then applied to a manoeuvre
  // this simulator makes structurally longer than the real one.
  //
  // indicator 3 → 5. The tracker refreshes every tick the stalk is on, so 3 s
  // never meant „signal 3 s early" — it meant „an extinguished signal is
  // forgotten after 3 s". And the stalk extinguishes ITSELF: scene/cabin.ts
  // auto-cancels like a real car (AUTOCANCEL_ARM_RAD 0.22 → RELEASE 0.05). A
  // beginner wobbles — eases left, straightens to re-check the mirror, eases
  // left again — and that first straighten clicks the stalk off while he is
  // still in the old lane, seconds before the wheels cross. He is then
  // convicted of LANE_CHANGE_WITHOUT_INDICATOR for a signal he DID give and
  // the CAR cancelled. 5 s covers one whole wobble-and-recover. It is also the
  // only value consistent with the drill's own contract: sc-lane-change
  // examinerBg demands «навременен мигач (2–3 секунди преди преместването)», so
  // 3 s was exactly the LOWER bound of the lesson's own ask with zero margin
  // left for the crossing itself.
  //
  // mirror 5 → 8. This one is measured from the glance to the frame
  // `tick.laneId` flips, so it has to pay for BOTH halves of the manoeuvre:
  //   · the human half is strictly SERIAL and cannot be overlapped — KeyQ pins
  //     the camera to the mirror (CameraRig GLANCE_OFFSETS), so a student
  //     physically cannot steer while looking. Release → re-orient → find the
  //     steer key is 1.5–2.5 s for a 17-year-old on their first drive;
  //   · the lateral half is 4.06 m, not the legal 1.63 m, because the lane is
  //     drawn at PERCEPTUAL_ROAD_SCALE (2.5 × 3.25 m = 8.125 m). A gentle
  //     beginner diagonal runs ~0.8–1.2 m/s of lateral speed ⇒ 3.4–5.1 s.
  // 5–7.6 s total, and it got WORSE the slower and more carefully he drove —
  // the grading was upside down for exactly the audience this product has.
  // Same reasoning as laneKeepMaxOffsetM below: the car stays real-size, so the
  // tolerance must track the DRAWN lane, not the law.
  //
  // 8 and not more: the blind-spot actor this drill stages sits 24 m behind at
  // matched speed, and a car closing at a 15 km/h differential covers 33 m in
  // 8 s — the honest edge of „your glance is still true". Past ~10 s the
  // observation IS stale and crediting it would teach a lie.
  //
  // NEITHER widening can absolve a mistake demo: „Престрояване без мигач" and
  // „Престрояване без огледало" never arm their channel at all, so the
  // timestamp is `null` and no window width reaches them (pinned by
  // lane-change-beginner-window.test.ts).
  indicatorLookbackSec: 5,
  mirrorLookbackSec: 8,
  // 20 s of standing time, i.e. a glance may be at most 28 s old and only if
  // the extra 20 were spent at a standstill. That covers the gap-wait a merge
  // out of a stopped queue actually takes, and stops well short of „he looked
  // once, a minute ago" — the same ceiling logic as the 8 s above, applied to
  // the one kind of second that does not age an observation as fast.
  mirrorWaitFreezeMaxSec: 20,
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

  // FO-08 closing-rate pack — OFF, opted into per lesson (see the block above).
  leadClosingEnabled: false,
  leadClosingMinRateMps: 0.8,
  leadClosingSustainSec: 1,

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

  collisionSeparationSec: 1.2,

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
  // 70 m clears the measured 56.4 m of the blocked-exit drill with room for a
  // longer Sofia junction, and stays under the 120 m the runtime watches its
  // signals at. It only ever applies to a lead that is NOT opening the gap —
  // see the interface comment.
  hesitationQueueGapM: 70,

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
  // H-5 direction gate: 20 s covers the slowest realistic pull-out → tuck-in
  // (the authored OV-06/OV-07 demos take 3.5–5.5 s), and expires long before a
  // later, unrelated move to the right could inherit the pull-out's guilt.
  overtakeManeuverWindowSec: 20,

  // B1a Wave-3 (doc 72 capability 1) — per-lesson drills, config-OFF by default.
  junctionScanObservationEnabled: false, // see the interface comment — lessons opt in
  junctionScanLookbackSec: 5, // same window as the lane-change mirror lookback
  turnObservationEnabled: false, // M-17 — see the interface comment; lessons opt in
  laneArrowMemorySec: 6,
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
  banZoneVruAheadM: 20, // a person, not a bumper — see the interface note
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
  motorwayMinFlowKmh: 50, // authored detection floor, NOT a legal limit — see the interface note
  // 0.5 m/s²: the recorder's own rates (accel 2.2 / brake ≥ 3.2) and any
  // honest live transition sit far above it; a held crawl reads ~0.
  motorwaySlowSteadyMps2: 0.5,
  // The crawl gate's own averaging length — see the interface note. 1 s: two
  // cycles of a beginner's ~2 Hz pedal, still short enough that a 2.5 m/s²
  // merge reads 2.5 and stays exempt.
  motorwaySlowSteadyMeanWindowSec: 1,
  motorwaySlowQueueGapM: 60,
  motorwaySlowSustainSec: 4,
  // The town half. Every number is an authored detection threshold, not a
  // statutory one — see the interface notes for what each one buys.
  townCrawlEnabled: true,
  townCrawlMinPostedKmh: 40, // under 40 the plate itself says „calmed place"
  townCrawlFractionOfLimit: 0.3, // 12 км/ч on a 40 road, 15 on a 50
  townCrawlFloorCapKmh: 15,
  // NOTE there is deliberately no queue-gap figure: any vehicle ahead in the
  // player's own corridor acquits at any distance, because чл. 22, ал. 1 is
  // about obstructing OTHERS and the car that obstructs is the one in front.
  // The argument in full is at the detector in engine.ts.
  townCrawlClearAheadM: 25,
  townCrawlSustainSec: 20,
  needlessStopEnabled: false, // armed per lesson — see the field's own note
  needlessStopSustainSec: 6,
  // 3 s: an accidental clip of the lane edge can never hold it; the shortest
  // deliberate undertake does (≈ 90+ m at motorway speed).
  emergencyLaneSustainSec: 3,
  emergencyLaneBrakeExemptMps2: 1,
};
