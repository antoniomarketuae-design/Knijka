/**
 * The deterministic rule engine — a pure reducer over SimTick frames.
 *
 * `reduceTick(state, tick)` never mutates its inputs and has no side effects:
 * same state + same tick => same output, always. This is what makes real-time
 * feedback trustworthy and the module unit-testable without a 3D engine
 * (ADR-002: zero LLM in the feedback loop).
 *
 * v1 detectors:
 *  - speeding (второстепенна above 10% grace, опасна > +10 км/ч — doc 32)
 *  - red-light crossing (опасна)
 *  - Б2 stop line without a full stop (опасна)
 *  - missing indicator before turn / lane change (основна)
 *  - no mirror glance within 5 s before a lane change (основна)
 *  - seatbelt off while moving (основна)
 *  - handbrake left on while moving (второстепенна)
 *  - headlights off at night while moving (основна)
 *  - pedestrian crossing: approach too fast / not yielding (опасни)
 *  - collision (опасна + terminate flag)
 *
 * Design notes (documented decisions):
 *  - Continuous conditions use sustain windows + hysteresis: a violation
 *    fires once per "episode" and the episode only resets when the driver
 *    actually corrects (belt on, handbrake off, speed back under the limit…),
 *    so flicker around a threshold cannot double-bill the student.
 *  - A speeding episode that escalates from minor to dangerous emits BOTH
 *    events (both mistakes really happened); if speed jumps straight into the
 *    dangerous band, only the dangerous event fires.
 *  - Both pedestrian-crossing violations can fire on one crossing (approach
 *    too fast, then still failing to yield) — they are distinct mistakes and
 *    each deserves immediate feedback. Any опасна already fails the session.
 *  - A12 tolerance bands: false-positive penalties are the genre's #1
 *    trust-killer, so every detector carries explicit grace for innocent
 *    driving at its margins — physics creep on full stops, braking-response
 *    pause on crossing approach, cut-in recovery + grace ratio on following
 *    distance, min (not product) composition of condition factors, and a
 *    reverse-gear gate on the flow/lane detectors (a reverse-parking
 *    maneuver is not a wrong-way run or a lane change). The regression
 *    battery in __tests__/false-positives.test.ts is the contract: those
 *    drives must NEVER produce a violation.
 */

import { makeCommendation, makeViolation } from "./catalog";
import {
  DEFAULT_RULE_CONFIG,
  type MirrorKind,
  type RuleEngineConfig,
  type RuleEvent,
  type SimTick,
  type SimTickEvent,
  type TurnDirection,
} from "./types";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** One-shot episode tracker: fires once when a condition sustains, re-arms on reset. */
interface EpisodeState {
  /** When the condition became continuously true (null = not currently true). */
  activeSince: number | null;
  /** Whether this episode's violation has already been emitted. */
  emitted: boolean;
}

interface CrossingZoneState {
  crossingId: string;
  /** A pedestrian has been reported on the crossing at any point in this zone. */
  pedestrianSeen: boolean;
  tooFastSince: number | null;
  tooFastEmitted: boolean;
  /** Slowest speed observed inside the zone (for the yield commendation). */
  minSpeedKmh: number;
}

export interface RuleEngineState {
  config: RuleEngineConfig;
  prevT: number | null;
  prevLaneId: number | null;
  /** Segment the previous frame's laneId was numbered against (C1 revision):
   * laneId deltas are only lane CHANGES within one segment — an edge
   * transition renumbers lanes (SimTick contract note on laneId stability).
   * `undefined` = the tick source does not report segments (legacy grading). */
  prevEdgeId: string | null | undefined;
  /** C1 joint-grace ledger (only used when the tick reports edgeId): lane-id
   * deltas are held laneChangeJointGraceSec and dropped when a segment
   * transition lands inside the window — see the config comment. */
  laneChange: {
    pending: Array<{ t: number; dir: TurnDirection; indicatorOk: boolean; mirrorOk: boolean }>;
    lastBasisChangeAt: number | null;
  };
  /** Previous frame's speed — lets detectors read braking response (A12). */
  prevSpeedKmh: number | null;
  /** Previous frame's lead gap (null = none reported) — cut-in recovery (A12). */
  prevLeadGapM: number | null;
  lastIndicatorOnAt: Record<TurnDirection, number | null>;
  lastGlanceAt: Record<MirrorKind, number | null>;
  stop: {
    /** When the vehicle most recently came to (and stayed at) a full stop. */
    stoppedSince: number | null;
    /** Last moment a QUALIFYING full stop (long enough) was still in effect. */
    lastQualifyingStopAt: number | null;
  };
  speedingMinor: EpisodeState;
  speedingDangerous: EpisodeState;
  seatbelt: EpisodeState;
  handbrake: EpisodeState;
  headlights: EpisodeState;
  laneKeeping: EpisodeState;
  conditionsSpeed: EpisodeState;
  rainLights: EpisodeState;
  /** Driving in FOG without front fog lamps (AC-03, чл. 74). */
  fogLights: EpisodeState;
  following: EpisodeState;
  wrongWay: EpisodeState;
  keepRight: EpisodeState;
  crossing: CrossingZoneState | null;
  collisionCooldownUntil: number | null;
  /** Set once a collision occurs — the session grades as terminated. */
  terminated: boolean;
  /** Metres driven since the last violation — earns CLEAN_DRIVING commendations. */
  cleanDistanceM: number;
  // -- B1a Wave-1 detector pack (doc 72 capability 1) ------------------------
  /** Rising-edge episode over tick.stalled (второстепенна „загасване"). */
  stall: EpisodeState;
  /** Halted with the nose past a red-controlled stop line (JU-15). */
  stopOvershoot: EpisodeState;
  /**
   * C3 lawful-presence latch: the vehicle was at/near this stop line while
   * the light was GREEN (queue creep, or crossing legally when the phase
   * flipped). While latched, a later red must not convict the stranded car —
   * it arrived lawfully (FP case: "green-queue creep caught by the flip").
   * Cleared only on physical departure from the line window.
   */
  stopOvershootGreenSeen: boolean;
  /** Sustained ride on the осева линия toward oncoming (SN-03). */
  centerLine: EpisodeState;
  /** Stationary at a green light with a clear box (JU-09). */
  hesitation: EpisodeState;
  /**
   * Causeless harsh braking — episode with onset-speed memory (SP-11).
   * `causeSeen` (C3): a plausible cause observed at ANY point of the current
   * continuous braking episode exempts the WHOLE episode — a cause that
   * evaporates mid-stop (lead brake-checks then floors it) must not convert
   * the tail of a justified stop into a phantom (sticky-cause ledger).
   */
  harshBrake: {
    activeSince: number | null;
    emitted: boolean;
    onsetKmh: number;
    causeSeen: boolean;
  };
  /** First-move-off observation check (PK-05; config-gated). */
  moveOff: { restSeen: boolean; done: boolean };
  /** Last time a hazard-shaped tick event was seen (harsh-brake exemption). */
  lastHazardEventAt: number | null;
  // -- B1a Wave-2 detector pack (doc 72 capability 1) ------------------------
  /** Bumper-kissing at a standstill behind a stopped lead (FO-08). */
  standstillGap: EpisodeState;
  /** Long beam left on behind a lead vehicle at night (AC-04). */
  highBeamDip: EpisodeState;
  // -- B1a Wave-3 detector pack (doc 72 capability 1) — config-gated drills --
  /** Following under the WET-prudent gap while it rains (FO-04; config-gated). */
  followingRain: EpisodeState;
  // -- ZONE-BAN data layer (ADR-006 stage 2a) --------------------------------
  /** Casual rest inside an authored В27 no-stopping zone (PK-06). */
  banZoneStop: EpisodeState;
  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b) -----------------------------
  /**
   * Fully across the solid осева inside an authored М1 span (OV-04/SN-03
   * escalation). One bill per EXCURSION: `emitted` stays latched until the
   * vehicle is genuinely back in its own lane (own bank, clear of the line
   * band) — the same latch also suppresses the touch/lane-keep codes for the
   * rest of the excursion (one act, one code).
   */
  solidCross: EpisodeState;
  /** Sustained car travel in an authored bus lane (SN-05). */
  busLane: EpisodeState;
  // -- RAIL PACK slice 1 (ADR-006 stage 3a) ----------------------------------
  /**
   * Railway-crossing entry tracker (RX-01/RX-02): the band entry is graded at
   * the approach→on transition of tick.railCrossing, and ONLY when a genuine
   * "approach" frame was seen first — a vehicle materialising ON the band
   * (spawn/teleport) is structurally innocent (A12).
   */
  rail: {
    approachSeen: boolean;
    prevPhase: "approach" | "on" | null;
  };
  /** At rest ON the track band (RX-03 — no queue exemption, short sustain). */
  railRest: EpisodeState;
  // -- CURVE-ENVELOPE slice (doc 72 SP-05) ------------------------------------
  /**
   * Sustained speed above the curve's posted advisory inside an authored
   * curveAdvisory span (tick.curveAdvisoryKmh). One bill per episode; the
   * episode re-arms only on genuine correction (at/under the advisory) or on
   * leaving the span — a second, distinct overspeed in the same long curve is
   * a second act and bills again (the speeding-episode discipline).
   */
  curveSpeed: EpisodeState;
  // -- MOTORWAY-SEGMENT slice (doc 72 SP-10) ----------------------------------
  /**
   * Sustained causeless crawl under the flow floor on a motorway
   * (tick.motorway — authored edge data). One bill per episode; re-arms only
   * on genuine recovery (at/above the floor) or on leaving the motorway.
   */
  motorwaySlow: EpisodeState;
  /**
   * Sustained DRIVING in the лента за принудително спиране (laneId 0 inside
   * an authored emergencyLane span). One bill per excursion; re-arms on
   * leaving the lane/span.
   */
  emergencyLane: EpisodeState;
}

const IDLE_EPISODE: EpisodeState = { activeSince: null, emitted: false };

export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngineState {
  return {
    config: { ...DEFAULT_RULE_CONFIG, ...config },
    prevT: null,
    prevLaneId: null,
    prevEdgeId: undefined,
    laneChange: { pending: [], lastBasisChangeAt: null },
    prevSpeedKmh: null,
    prevLeadGapM: null,
    lastIndicatorOnAt: { left: null, right: null },
    lastGlanceAt: { left: null, right: null, rear: null },
    stop: { stoppedSince: null, lastQualifyingStopAt: null },
    speedingMinor: { ...IDLE_EPISODE },
    speedingDangerous: { ...IDLE_EPISODE },
    seatbelt: { ...IDLE_EPISODE },
    handbrake: { ...IDLE_EPISODE },
    headlights: { ...IDLE_EPISODE },
    laneKeeping: { ...IDLE_EPISODE },
    conditionsSpeed: { ...IDLE_EPISODE },
    rainLights: { ...IDLE_EPISODE },
    fogLights: { ...IDLE_EPISODE },
    following: { ...IDLE_EPISODE },
    wrongWay: { ...IDLE_EPISODE },
    keepRight: { ...IDLE_EPISODE },
    crossing: null,
    collisionCooldownUntil: null,
    terminated: false,
    cleanDistanceM: 0,
    stall: { ...IDLE_EPISODE },
    stopOvershoot: { ...IDLE_EPISODE },
    stopOvershootGreenSeen: false,
    centerLine: { ...IDLE_EPISODE },
    hesitation: { ...IDLE_EPISODE },
    harshBrake: { activeSince: null, emitted: false, onsetKmh: 0, causeSeen: false },
    moveOff: { restSeen: false, done: false },
    lastHazardEventAt: null,
    standstillGap: { ...IDLE_EPISODE },
    highBeamDip: { ...IDLE_EPISODE },
    followingRain: { ...IDLE_EPISODE },
    banZoneStop: { ...IDLE_EPISODE },
    solidCross: { ...IDLE_EPISODE },
    busLane: { ...IDLE_EPISODE },
    rail: { approachSeen: false, prevPhase: null },
    railRest: { ...IDLE_EPISODE },
    curveSpeed: { ...IDLE_EPISODE },
    motorwaySlow: { ...IDLE_EPISODE },
    emergencyLane: { ...IDLE_EPISODE },
  };
}

function cloneState(s: RuleEngineState): RuleEngineState {
  return {
    ...s,
    lastIndicatorOnAt: { ...s.lastIndicatorOnAt },
    lastGlanceAt: { ...s.lastGlanceAt },
    stop: { ...s.stop },
    speedingMinor: { ...s.speedingMinor },
    speedingDangerous: { ...s.speedingDangerous },
    seatbelt: { ...s.seatbelt },
    handbrake: { ...s.handbrake },
    headlights: { ...s.headlights },
    laneKeeping: { ...s.laneKeeping },
    conditionsSpeed: { ...s.conditionsSpeed },
    rainLights: { ...s.rainLights },
    fogLights: { ...s.fogLights },
    following: { ...s.following },
    wrongWay: { ...s.wrongWay },
    keepRight: { ...s.keepRight },
    crossing: s.crossing ? { ...s.crossing } : null,
    laneChange: { pending: s.laneChange.pending.map((p) => ({ ...p })), lastBasisChangeAt: s.laneChange.lastBasisChangeAt },
    stall: { ...s.stall },
    stopOvershoot: { ...s.stopOvershoot },
    centerLine: { ...s.centerLine },
    hesitation: { ...s.hesitation },
    harshBrake: { ...s.harshBrake },
    moveOff: { ...s.moveOff },
    standstillGap: { ...s.standstillGap },
    highBeamDip: { ...s.highBeamDip },
    followingRain: { ...s.followingRain },
    banZoneStop: { ...s.banZoneStop },
    solidCross: { ...s.solidCross },
    busLane: { ...s.busLane },
    rail: { ...s.rail },
    railRest: { ...s.railRest },
    curveSpeed: { ...s.curveSpeed },
    motorwaySlow: { ...s.motorwaySlow },
    emergencyLane: { ...s.emergencyLane },
  };
}

// ---------------------------------------------------------------------------
// Episode helper
// ---------------------------------------------------------------------------

/**
 * Advance an episode tracker. `reset` re-arms the episode (driver corrected);
 * otherwise the violation fires once `cond` has held for `sustainSec`.
 * Mutates `e` (which is always a fresh clone inside reduceTick).
 */
function stepEpisode(
  e: EpisodeState,
  cond: boolean,
  reset: boolean,
  t: number,
  sustainSec: number,
): boolean {
  if (reset) {
    e.activeSince = null;
    e.emitted = false;
    return false;
  }
  if (!cond) {
    e.activeSince = null;
    return false;
  }
  if (e.activeSince === null) e.activeSince = t;
  if (!e.emitted && t - e.activeSince >= sustainSec) {
    e.emitted = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export interface ReduceResult {
  state: RuleEngineState;
  events: RuleEvent[];
}

export function reduceTick(prev: RuleEngineState, tick: SimTick): ReduceResult {
  // Defensive: drop non-monotonic frames (a confused engine must not corrupt scoring).
  if (prev.prevT !== null && tick.t < prev.prevT) {
    return { state: prev, events: [] };
  }

  const s = cloneState(prev);
  const cfg = s.config;
  const t = tick.t;
  const speed = tick.speedKmh;
  const events: RuleEvent[] = [];

  // Frame-to-frame derivatives (A12 tolerance bands). dt of 0 (duplicate
  // timestamp) or a first frame yields neutral rates — detectors then judge
  // on the raw condition alone.
  const dt = s.prevT !== null ? t - s.prevT : 0;
  /** Signed acceleration, m/s² (negative = braking). */
  const accelMps2 =
    s.prevSpeedKmh !== null && dt > 0 ? (speed - s.prevSpeedKmh) / 3.6 / dt : 0;
  /** Gap to the lead vehicle, or null when the road ahead is clear/unknown. */
  const leadGapM =
    tick.leadGapM !== undefined && Number.isFinite(tick.leadGapM) ? tick.leadGapM : null;
  /** Rate the gap to the lead vehicle is opening, m/s (negative = closing). */
  const gapOpeningMps =
    leadGapM !== null && s.prevLeadGapM !== null && dt > 0
      ? (leadGapM - s.prevLeadGapM) / dt
      : 0;
  /** Reverse-gear maneuvering (parking) — flow/lane detectors do not apply. */
  const forwardGear = tick.gear >= 0;

  // -- 1. observation trackers (indicator history, mirror glances, full stops)
  if (tick.indicator === "left") s.lastIndicatorOnAt.left = t;
  if (tick.indicator === "right") s.lastIndicatorOnAt.right = t;

  for (const e of tick.events) {
    if (e.kind === "mirrorGlance") s.lastGlanceAt[e.mirror] = t;
    // Hazard ledger (A12): anything hazard-shaped in the recent past makes a
    // hard brake explainable — the causeless-harsh-brake detector stands down.
    if (
      e.kind === "crossingZoneEntered" ||
      e.kind === "crossingPassed" ||
      e.kind === "prioritySituation" ||
      e.kind === "collision"
    ) {
      s.lastHazardEventAt = t;
    }
  }

  if (speed <= cfg.fullStopMaxSpeedKmh) {
    if (s.stop.stoppedSince === null) s.stop.stoppedSince = t;
    if (t - s.stop.stoppedSince >= cfg.fullStopMinDurationSec) {
      s.stop.lastQualifyingStopAt = t; // still stopped => stop is "current"
    }
  } else {
    s.stop.stoppedSince = null;
  }

  // -- 1b. move-off observation (PK-05, DVSA top-5) — the session's FIRST
  // move-off from an observed rest must carry a fresh mirror glance (left or
  // rear) within the lookback. Config-gated OFF by default (see types.ts:
  // curb exits are indistinguishable from queue move-offs with current
  // telemetry, and the A12 innocent-drive contract pulls away unglanced).
  // A session that starts already in motion, or whose first motion is a
  // reverse maneuver, is never graded (conservative).
  if (!s.moveOff.done) {
    if (speed <= cfg.fullStopMaxSpeedKmh) {
      s.moveOff.restSeen = true;
    } else if (speed > cfg.movingSpeedKmh) {
      s.moveOff.done = true;
      if (cfg.moveOffObservationEnabled && s.moveOff.restSeen && forwardGear) {
        const left = s.lastGlanceAt.left;
        const rear = s.lastGlanceAt.rear;
        const observed =
          (left !== null && t - left <= cfg.moveOffLookbackSec) ||
          (rear !== null && t - rear <= cfg.moveOffLookbackSec);
        if (!observed) events.push(makeViolation("MOVE_OFF_WITHOUT_OBSERVATION", t));
      }
    }
  }

  // -- 1c. stall grading (VP-04): the driveline latches `stalled` until the
  // next successful restart — the rising edge is one официална второстепенна
  // „загасване"; the restart re-arms the episode for the next one.
  if (stepEpisode(s.stall, tick.stalled === true, tick.stalled !== true, t, 0)) {
    events.push(makeViolation("ENGINE_STALLED", t));
  }

  // -- 2. discrete zone / contact events
  for (const e of tick.events) {
    handleTickEvent(s, e, tick, events);
  }

  // -- 3. lane-change detection (after glance/indicator trackers updated)
  // Reverse gear is exempt (A12): backing across a lane boundary is a parking
  // maneuver, judged by maneuver objectives — not a lane change.
  // C1 revision: lane ids are only comparable WITHIN one segment (the SimTick
  // contract note on laneId stability), and near a segment joint the
  // locator's projection sweeps the bank while the car corners. So when the
  // tick reports edgeId: (a) deltas ACROSS segments never grade
  // (renumbering); (b) deltas within laneChangeJointGraceSec after a
  // transition never grade (joint artifact); (c) all other deltas are held
  // for the grace and dropped if a transition lands inside the window —
  // otherwise they emit with the delta's own timestamp. Legacy tick sources
  // (no edgeId) grade immediately, exactly as before. FP cases: "straight
  // across a lane-count change" + the joint cases in false-positives.test.ts.
  const basisKnown = tick.edgeId !== undefined && s.prevEdgeId !== undefined;
  const basisChanged = basisKnown && tick.edgeId !== s.prevEdgeId;
  if (basisChanged) {
    s.laneChange.pending = [];
    s.laneChange.lastBasisChangeAt = t;
  }
  if (s.laneChange.pending.length > 0) {
    const still: typeof s.laneChange.pending = [];
    for (const p of s.laneChange.pending) {
      if (t - p.t < cfg.laneChangeJointGraceSec) {
        still.push(p);
        continue;
      }
      if (!p.indicatorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_INDICATOR", p.t));
      if (!p.mirrorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", p.t));
      if (p.indicatorOk && p.mirrorOk) events.push(makeCommendation("SAFE_LANE_CHANGE", p.t));
    }
    s.laneChange.pending = still;
  }
  if (
    s.prevLaneId !== null &&
    tick.laneId !== s.prevLaneId &&
    speed >= cfg.laneChangeMinSpeedKmh &&
    forwardGear
  ) {
    const dir: TurnDirection = tick.laneId > s.prevLaneId ? "left" : "right";
    const lastOn = s.lastIndicatorOnAt[dir];
    const indicatorOk = lastOn !== null && t - lastOn <= cfg.indicatorLookbackSec;
    const lastGlance = s.lastGlanceAt[dir];
    const mirrorOk = lastGlance !== null && t - lastGlance <= cfg.mirrorLookbackSec;
    const legacyBasis = tick.edgeId === undefined || s.prevEdgeId === undefined;
    const gradableWithEdge =
      !basisChanged &&
      (s.laneChange.lastBasisChangeAt === null ||
        t - s.laneChange.lastBasisChangeAt >= cfg.laneChangeJointGraceSec);
    if (legacyBasis) {
      // Legacy source without segment ids — immediate grading.
      if (!indicatorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_INDICATOR", t));
      if (!mirrorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", t));
      if (indicatorOk && mirrorOk) events.push(makeCommendation("SAFE_LANE_CHANGE", t));
    } else if (gradableWithEdge) {
      s.laneChange.pending.push({ t, dir, indicatorOk, mirrorOk });
    }
    // else: renumbering at/near a segment joint — locator artifact, no grade.

    // OV-07 (изпреварване на пътека): a REAL lane change (joint artifacts
    // excluded by the branches above) landing inside an armed pedestrian-
    // crossing zone while a lead vehicle is present to overtake is the чл. 119
    // ban. It rides the SAME denoised signal as the lane-change codes, so its
    // false-positive surface is theirs — zero on an innocent single-lane
    // drive. A lane change with no lead ahead is a reposition, not an
    // overtake, and never fires (A12). One опасна per pass, at detection time.
    if (
      (legacyBasis || gradableWithEdge) &&
      s.crossing !== null &&
      leadGapM !== null &&
      leadGapM <= cfg.crossingOvertakeLeadGapM
    ) {
      events.push(makeViolation("OVERTAKING_AT_CROSSING", t));
    }

    // OV-06 (изпреварване при забрана — ADR-006 stage 2a): the SAME denoised
    // lane-change signal landing inside an authored В24 ban zone while a lead
    // is present to overtake. Reads ONLY tick.noOvertakeZone (bounded,
    // sign-posted district `zones` data) — the legacy whole-edge noOvertake
    // surface tag stays ungraded, so no shipped map can arm this. Same
    // corridor discipline as OV-07 above: a change with no lead is a
    // reposition (innocent), and the FP surface equals the lane-change
    // detector's. Both codes CAN fire on one change when a crossing zone and
    // a ban zone overlap — two distinct laws, two distinct lessons.
    if (
      (legacyBasis || gradableWithEdge) &&
      tick.noOvertakeZone === true &&
      leadGapM !== null &&
      leadGapM <= cfg.banOvertakeLeadGapM
    ) {
      events.push(makeViolation("OVERTAKING_IN_BAN_ZONE", t));
    }
  }
  s.prevLaneId = tick.laneId;
  s.prevEdgeId = tick.edgeId;

  // -- 4. continuous detectors (sustain + hysteresis)
  const limit = tick.maxSpeedKmh;
  const gracedLimit = limit * (1 + cfg.speedingGraceRatio);
  const dangerousAbove = limit + cfg.dangerousSpeedOverKmh;
  const speedReset = speed <= limit;
  if (
    stepEpisode(
      s.speedingMinor,
      speed > gracedLimit && speed <= dangerousAbove,
      speedReset,
      t,
      cfg.speedingMinorSustainSec,
    )
  ) {
    events.push(makeViolation("SPEEDING_OVER_LIMIT", t));
  }
  if (
    stepEpisode(
      s.speedingDangerous,
      speed > dangerousAbove,
      speedReset,
      t,
      cfg.speedingDangerousSustainSec,
    )
  ) {
    events.push(makeViolation("SPEEDING_DANGEROUS", t));
  }

  const moving = speed > cfg.movingSpeedKmh;
  if (stepEpisode(s.seatbelt, !tick.seatbeltOn && moving, tick.seatbeltOn, t, cfg.seatbeltSustainSec)) {
    events.push(makeViolation("SEATBELT_OFF_WHILE_MOVING", t));
  }
  if (stepEpisode(s.handbrake, tick.handbrakeOn && moving, !tick.handbrakeOn, t, cfg.handbrakeSustainSec)) {
    events.push(makeViolation("HANDBRAKE_LEFT_ON", t));
  }
  if (
    stepEpisode(
      s.headlights,
      tick.isNight && tick.headlights === "off" && moving,
      !tick.isNight || tick.headlights !== "off",
      t,
      cfg.headlightsSustainSec,
    )
  ) {
    events.push(makeViolation("HEADLIGHTS_OFF_AT_NIGHT", t));
  }

  // Crossed the solid осева (OV-04/SN-03 escalation — ADR-006 stage 2b): the
  // vehicle FULLY across the center line (its committed lane fix on the bank
  // opposing its travel — tick.opposingBank, the locator's own denoised bank
  // signal) inside an authored М1 span (tick.solidCenterLine — data, never a
  // heuristic). An indicator does NOT exempt: a signalled overtake across a
  // solid line is exactly the OV-04 mistake. Reverse maneuvering is exempt
  // (A12 — a parallel park backs across the road's markings by design).
  // The episode is the EXCURSION: reset only once genuinely back in the own
  // lane (own bank AND clear of the line band), so one crossing bills once
  // even if the flag flickers at the paint on the way back.
  const solidCrossCond =
    tick.solidCenterLine === true &&
    tick.oneway === false &&
    tick.opposingBank === true &&
    moving &&
    forwardGear;
  if (
    stepEpisode(
      s.solidCross,
      solidCrossCond,
      tick.opposingBank !== true && tick.laneOffsetM <= cfg.laneKeepMaxOffsetM,
      t,
      cfg.solidLineCrossSustainSec,
    )
  ) {
    events.push(makeViolation("CROSSED_SOLID_LINE", t));
  }
  // One act, one code (the stage-2b ruling): while the crossing condition is
  // armed — or has already billed within this same excursion — the touch and
  // generic lane-keep clocks stand down. A MERE touch (own bank, riding the
  // line band, never fully across) still grades CENTER_LINE_TOUCHED exactly
  // as shipped.
  const solidCrossExcursion =
    tick.solidCenterLine === true && (solidCrossCond || s.solidCross.emitted);

  // Center-line touch (SN-03/OV-04 — „настъпване на осева линия"): sustained
  // ride on/over the center line toward ONCOMING traffic. Armed only on
  // POSITIVE evidence: the runtime says the edge is two-way (oneway === false)
  // and the vehicle is in the leftmost lane of its direction with the offset
  // toward the center. A declared maneuver (any indicator — announced
  // overtake/dodge or return) is exempt, as is reverse maneuvering (A12).
  // When this specific condition is armed the GENERIC lane-keeping episode is
  // suppressed — one act, one code, no double-billing.
  const centerLineCond =
    tick.oneway === false &&
    tick.laneId === (tick.laneCount ?? 1) - 1 &&
    tick.laneOffsetM > cfg.laneKeepMaxOffsetM &&
    tick.indicator === "off" &&
    moving &&
    forwardGear &&
    !solidCrossExcursion;
  if (
    stepEpisode(
      s.centerLine,
      centerLineCond,
      tick.laneOffsetM <= cfg.laneKeepMaxOffsetM,
      t,
      cfg.centerLineSustainSec,
    )
  ) {
    events.push(makeViolation("CENTER_LINE_TOUCHED", t));
  }

  // Lane-keeping: sustained off-centre / straddling positioning while moving
  // forward. Reverse maneuvering (bay/parallel parking) is legitimately
  // off-centre and exempt (A12).
  const offCentre = Math.abs(tick.laneOffsetM) > cfg.laneKeepMaxOffsetM;
  if (
    stepEpisode(
      s.laneKeeping,
      offCentre && moving && forwardGear && !centerLineCond && !solidCrossExcursion,
      !offCentre,
      t,
      cfg.laneKeepSustainSec,
    )
  ) {
    events.push(makeViolation("POOR_LANE_KEEPING", t));
  }

  // Speed for the conditions: within the posted limit, but too fast for rain /
  // fog / snow / night. (Above the limit is regular speeding, handled above.)
  // Factors compose by MIN — the single most restrictive condition governs;
  // the product would double-bill a rainy night (A12). A factor of 1 means
  // the condition does not reduce the prudent speed at all. Shipped default
  // ordering: snow 0.5 < fog 0.6 < rain 0.85 ≤ night 1 — a snowy fog grades
  // once at the snow envelope, exactly like a foggy rain grades at fog's.
  const raining = tick.rain === true;
  const foggy = tick.fog === true;
  const snowy = tick.snow === true;
  const conditionFactor = Math.min(
    raining ? cfg.conditionSpeedRainFactor : 1,
    foggy ? cfg.conditionSpeedFogFactor : 1,
    snowy ? cfg.conditionSpeedSnowFactor : 1,
    tick.isNight ? cfg.conditionSpeedNightFactor : 1,
  );
  const conditionsReduced = conditionFactor < 1;
  const conditionLimit = limit * conditionFactor;
  const tooFastForConditions =
    conditionsReduced && moving && speed > conditionLimit && speed <= gracedLimit;
  if (
    stepEpisode(
      s.conditionsSpeed,
      tooFastForConditions,
      !conditionsReduced || speed <= conditionLimit,
      t,
      cfg.conditionsSpeedSustainSec,
    )
  ) {
    events.push(makeViolation("SPEED_TOO_FAST_FOR_CONDITIONS", t));
  }

  // Curve-advisory overspeed (SP-05 „скорост в завой" — the CURVE-ENVELOPE
  // slice, чл. 20 ал. 2): inside an AUTHORED curveAdvisory span
  // (tick.curveAdvisoryKmh — district `zones` data, never a heuristic),
  // sustained speed above the advisory + grace grades the curve основна.
  // Design decisions (documented):
  //  - DELIBERATELY NOT capped at the graced posted limit the way the
  //    conditions code is: the advisory envelope (50) lives on 90-roads, so a
  //    within-grace 95 into the bend must still bill the curve code; where the
  //    driver is ALSO over the limit, the SPEEDING_* codes bill their own
  //    distinct fault — two laws, two lessons (the OV-06/CROSSED_SOLID_LINE
  //    precedent).
  //  - Innocent by construction (A12): no span (every map without the layer)
  //    = silent; the approach BEFORE the span is governed only by the posted
  //    limit; at/under advisory (+ the grace band) never arms; a brief entry
  //    overshoot corrected within the sustain never bills; reverse
  //    maneuvering is exempt. Reset re-arms only after genuine correction
  //    (at/under the advisory) or after leaving the span — one bill per act.
  const advisoryKmh = tick.curveAdvisoryKmh;
  const curveOverspeed =
    advisoryKmh !== undefined &&
    moving &&
    forwardGear &&
    speed > advisoryKmh + cfg.curveSpeedGraceKmh;
  if (
    stepEpisode(
      s.curveSpeed,
      curveOverspeed,
      advisoryKmh === undefined || speed <= advisoryKmh,
      t,
      cfg.curveSpeedSustainSec,
    )
  ) {
    events.push(makeViolation("SPEED_TOO_FAST_FOR_CURVE", t));
  }

  // Lights in rain (daytime — night is covered by HEADLIGHTS_OFF_AT_NIGHT).
  const rainNoLights = raining && !tick.isNight && tick.headlights === "off" && moving;
  if (
    stepEpisode(s.rainLights, rainNoLights, !raining || tick.headlights !== "off", t, cfg.rainLightsSustainSec)
  ) {
    events.push(makeViolation("HEADLIGHTS_OFF_IN_RAIN", t));
  }

  // Fog lamps in fog (AC-03, чл. 74 — при значително намалена видимост
  // предните фарове за мъгла светят, заедно с късите). Armed EXCLUSIVELY by
  // tick.fog — dry/rain/night drives (fog absent) can never reach it, and a
  // clear-road drive with the fog lamps left on stays ungraded here (the
  // чл. 75 dazzle duty is a separate, unshipped code). The sustain gives the
  // same grace as the rain-lights detector for the moment between moving off
  // and reaching the V toggle.
  const fogNoFogLights = foggy && tick.fogLightsOn !== true && moving;
  if (
    stepEpisode(s.fogLights, fogNoFogLights, !foggy || tick.fogLightsOn === true, t, cfg.fogLightsSustainSec)
  ) {
    events.push(makeViolation("FOG_LIGHTS_OFF_IN_FOG", t));
  }

  // Following distance (2-second rule) — only above stop-and-go speed, when a
  // lead vehicle is actually in the tick's gap channel, only below the grace
  // ratio of the taught 2-second target, and never while the gap is already
  // opening (cut-in recovery — the driver is fixing it; A12).
  const safeGapM = Math.max(cfg.followMinGapM, (speed / 3.6) * cfg.followSafeSeconds);
  const tailgating =
    moving &&
    speed >= cfg.followMinSpeedKmh &&
    leadGapM !== null &&
    leadGapM < safeGapM * cfg.followFireRatio &&
    gapOpeningMps < cfg.followRecoveryRateMps;
  if (stepEpisode(s.following, tailgating, !tailgating, t, cfg.followSustainSec)) {
    events.push(makeViolation("FOLLOWING_TOO_CLOSE", t));
  }

  // Rain-aware following (FO-04 — „дистанция в дъжд"; config-gated per-lesson
  // drill). In rain the braking distance grows ~1.5×, so the prudent gap does
  // too. This fires ONLY in the band that is fine for DRY (the base основна
  // FOLLOWING_TOO_CLOSE stays silent — gap ≥ its fire threshold) but under the
  // WET-prudent gap — the direct analogue of SPEED_TOO_FAST_FOR_CONDITIONS
  // sitting under the graced limit. The same cut-in recovery guard applies
  // (a gap the driver is re-opening is not tailgating; A12). SHIPPED OFF: the
  // exam-bot never widens its time-gap in rain, so a default-on grade would
  // flag its innocent rainy drives — enabled per-lesson only.
  const rainSafeGapM = Math.max(
    cfg.followMinGapM,
    (speed / 3.6) * cfg.followSafeSeconds * cfg.followRainSecondsFactor,
  );
  const tailgatingRain =
    cfg.followRainAwareEnabled &&
    raining &&
    moving &&
    speed >= cfg.followMinSpeedKmh &&
    leadGapM !== null &&
    leadGapM >= safeGapM * cfg.followFireRatio && // the base основна is NOT firing (no double-bill)
    leadGapM < rainSafeGapM * cfg.followFireRatio &&
    gapOpeningMps < cfg.followRecoveryRateMps;
  if (stepEpisode(s.followingRain, tailgatingRain, !tailgatingRain, t, cfg.followRainSustainSec)) {
    events.push(makeViolation("FOLLOWING_TOO_CLOSE_FOR_RAIN", t));
  }

  // Wrong way against a one-way street (runtime sets tick.wrongWay). Reverse
  // gear is exempt (A12): reversing into a parking spot moves against the
  // flow by definition and is judged as a maneuver, not as wrong-way driving.
  const goingWrongWay = tick.wrongWay === true && moving && forwardGear;
  if (stepEpisode(s.wrongWay, goingWrongWay, !goingWrongWay, t, cfg.wrongWaySustainSec)) {
    events.push(makeViolation("WRONG_WAY", t));
  }

  // Keep right: prolonged driving in a non-rightmost lane on a multi-lane road.
  // Exempt while the LEFT indicator is on — declared left-turn positioning or
  // an announced overtake is REQUIRED left-lane use (ЗДвП чл. 25), and exempt
  // in reverse gear (parking maneuvers; A12). Stage 2b: inside an authored
  // bus-lane span the CURB lane is not a legal travel lane for the car, so
  // the rightmost REQUIRED lane is laneId 1 — correctly avoiding the bus lane
  // must never grade NOT_KEEPING_RIGHT (the SN-05 interplay; FP-battery case).
  // MOTORWAY-SEGMENT slice: an authored emergencyLane span is the SAME seam —
  // the лента за принудително спиране is never a travel lane, so correctly
  // cruising the rightmost TRAVEL lane (laneId 1) stays innocent; on a 2+2
  // motorway the keep-right story then works at any speed with zero new code
  // (the ln-v1 precedent, doc 72 OV-11 on the SP-10 map).
  const rightmostRequiredLane =
    tick.busLaneRight === true || tick.emergencyLaneRight === true ? 1 : 0;
  const hoggingLeft =
    tick.laneId > rightmostRequiredLane &&
    (tick.laneCount ?? 1) > 1 &&
    moving &&
    forwardGear &&
    tick.indicator !== "left";
  if (stepEpisode(s.keepRight, hoggingLeft, !hoggingLeft, t, cfg.keepRightSustainSec)) {
    events.push(makeViolation("NOT_KEEPING_RIGHT", t));
  }

  // Motorway crawl (SP-10 „минимална скорост на магистрала" — MOTORWAY-SEGMENT
  // slice). LAW NOTE (see the catalog entry): BG law has NO general motorway
  // minimum — чл. 54's 50 km/h constructive line is the honest floor, and the
  // graded fault is the SUSTAINED CAUSELESS crawl (the mobile chicane), never
  // a transition. Innocent by construction (A12):
  //  - only an authored edge `motorway: true` tag arms it (no shipped map);
  //  - transitions are exempt (|a| ≥ the steady band: moving off up through
  //    the band, braking down through it toward a stop);
  //  - congestion is exempt (a lead within the queue gap), as is any recent
  //    hazard-shaped event (the harsh-brake cause ledger, reused) and an
  //    armed crossing zone (paranoid — no motorway map carries one);
  //  - a crawl ALONG the emergency lane is the EMERGENCY_LANE_DRIVING act,
  //    not this one (one act, one code);
  //  - reverse maneuvering and the standstill are exempt (stopping on a
  //    motorway is its own future story — descoped honestly).
  const inEmergencyLane = tick.emergencyLaneRight === true && tick.laneId === 0;
  const motorwayCrawl =
    cfg.motorwayMinSpeedEnabled &&
    tick.motorway === true &&
    moving &&
    speed < cfg.motorwayMinFlowKmh &&
    Math.abs(accelMps2) < cfg.motorwaySlowSteadyMps2 &&
    (leadGapM === null || leadGapM > cfg.motorwaySlowQueueGapM) &&
    s.crossing === null &&
    (s.lastHazardEventAt === null || t - s.lastHazardEventAt > cfg.harshBrakeHazardCooldownSec) &&
    !inEmergencyLane &&
    forwardGear;
  if (
    stepEpisode(
      s.motorwaySlow,
      motorwayCrawl,
      tick.motorway !== true || speed >= cfg.motorwayMinFlowKmh,
      t,
      cfg.motorwaySlowSustainSec,
    )
  ) {
    events.push(makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", t));
  }

  // Emergency-lane driving (чл. 58, т. 3 — MOTORWAY-SEGMENT slice): sustained
  // travel in the CURB lane of an authored emergencyLane span
  // (tick.emergencyLaneRight — data, never a heuristic). The legal sides:
  //  - deliberately NO indicator exemption (contrast DRIVING_IN_BUS_LANE): a
  //    signalled undertake through the emergency lane is still the fault —
  //    crossing it is not a legal maneuver the way the bus-lane right turn is;
  //  - the ONE legal use, the breakdown pull-off, is protected structurally:
  //    firm braking toward a stop pauses the clock, and the STOP itself never
  //    grades here (v ≤ movingSpeedKmh disarms — stopping is descoped);
  //  - a degenerate span on a single-lane road never convicts (laneCount > 1
  //    — the busLane guard, mirrored), reverse maneuvering is exempt.
  // Reset on leaving the lane or the span — one bill per excursion.
  const emergencyLaneDriving =
    inEmergencyLane &&
    (tick.laneCount ?? 1) > 1 &&
    moving &&
    forwardGear &&
    accelMps2 > -cfg.emergencyLaneBrakeExemptMps2;
  if (
    stepEpisode(
      s.emergencyLane,
      emergencyLaneDriving,
      !inEmergencyLane,
      t,
      cfg.emergencyLaneSustainSec,
    )
  ) {
    events.push(makeViolation("EMERGENCY_LANE_DRIVING", t));
  }

  // -- 4a2. B1a Wave-2 small-rule detectors (doc 72 capability 1). Each rides
  // EXISTING telemetry and carries the exemptions that keep innocent driving
  // clean (A12); the OV-07 overtake-at-crossing composite lives in the
  // lane-change block above (it rides the denoised lane-change signal).

  // Standstill gap (FO-08 — „дистанция на спиране в колона"): bumper-kissing
  // behind a stopped lead at a full stop. Only at v ≈ 0 — a moving queue is
  // the FOLLOWING_TOO_CLOSE family's business (its own queue exemption
  // applies), so there is no double-bill. Needs a lead actually reported and
  // closer than the tiny see-the-tyres floor; opening the gap or moving off
  // re-arms.
  const standstillTooClose =
    speed <= cfg.fullStopMaxSpeedKmh &&
    leadGapM !== null &&
    leadGapM <= cfg.standstillMinGapM &&
    forwardGear;
  if (
    stepEpisode(
      s.standstillGap,
      standstillTooClose,
      speed > cfg.fullStopMaxSpeedKmh || leadGapM === null || leadGapM > cfg.standstillMinGapM,
      t,
      cfg.standstillGapSustainSec,
    )
  ) {
    events.push(makeViolation("STANDSTILL_GAP_TOO_CLOSE", t));
  }

  // High beam behind a lead at night (AC-04 — „дълги светлини зад кола"): long
  // beam left on while following a vehicle at night dazzles the lead's mirrors
  // (чл. 74). Armed only on POSITIVE evidence — night, beam HIGH, and a lead
  // actually reported within dip range. Open-road high beam (no lead) stays
  // innocent, exactly as HEADLIGHTS_OFF_AT_NIGHT leaves it. Dipping, or the
  // lead clearing, re-arms.
  const highBeamBehindLead =
    tick.isNight &&
    tick.headlights === "high" &&
    moving &&
    leadGapM !== null &&
    leadGapM <= cfg.highBeamDipMaxGapM &&
    forwardGear;
  if (
    stepEpisode(
      s.highBeamDip,
      highBeamBehindLead,
      !tick.isNight || tick.headlights !== "high" || leadGapM === null,
      t,
      cfg.highBeamDipSustainSec,
    )
  ) {
    events.push(makeViolation("HIGH_BEAM_NOT_DIPPED", t));
  }

  // Illegal stop in a ban zone (PK-06 „спиране в забранена зона" — ADR-006
  // stage 2a). The deferred-illegal-stop FP finding („a legal red-light/yield
  // stop near a junction looks identical to an illegal one") is the DESIGN
  // CONSTRAINT here, answered structurally:
  //  - the zone is AUTHORED data (tick.noStopZone from a В27 district span) —
  //    no heuristic zone inference, ever;
  //  - every traffic-shaped rest inside the zone is innocent by construction:
  //    a lead at rest within the queue gap, a stop line within the clear
  //    window, ANY forbidding effective signal in the watch window (a halted
  //    controller reads "red" — JU-18), an armed crossing zone, reverse gear;
  //  - the sustain (4 s) excludes traffic micro-stops; the reset arms one
  //    bill per stop (driving on at moving speed, or leaving the zone).
  // В28 (noParkZone) deliberately does NOT convict — престоят под В28 е
  // разрешен, and parking vs престой is indistinguishable with current
  // telemetry (the same A12 bar; PK-07 rides the zone later).
  const banZoneQueue = leadGapM !== null && leadGapM <= cfg.banZoneStopQueueGapM;
  const banZoneControl =
    (tick.nextStopLineM !== undefined && tick.nextStopLineM <= cfg.banZoneStopLineClearM) ||
    (tick.nextStopLineControl === "trafficLight" &&
      tick.nextStopLineState !== undefined &&
      tick.nextStopLineState !== "green");
  const illegalBanRest =
    cfg.banZoneStopEnabled &&
    tick.noStopZone === true &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    forwardGear &&
    !banZoneQueue &&
    !banZoneControl &&
    s.crossing === null;
  if (
    stepEpisode(
      s.banZoneStop,
      illegalBanRest,
      tick.noStopZone !== true || speed > cfg.movingSpeedKmh,
      t,
      cfg.banZoneStopRestSec,
    )
  ) {
    events.push(makeViolation("ILLEGAL_STOP_IN_BAN_ZONE", t));
  }

  // Driving in a bus lane (SN-05 „бус лента" — ADR-006 stage 2b): sustained
  // car travel in the CURB lane of an authored BUS span (tick.busLaneRight —
  // data, never a heuristic). The legal sides are structural (A12):
  //  - the 4 s sustain excludes the right-turn/curb-access transit (crossing
  //    the bus lane is LEGAL and takes ~2-3 s — a ≤ 3 s transit never bills);
  //  - a declared RIGHT indicator exempts entirely (announced turn/parking
  //    entry — the keep-right left-indicator discipline, mirrored);
  //  - a degenerate span on a single-lane road never convicts (laneCount > 1
  //    required: with no general lane to use there is nothing to teach);
  //  - reverse maneuvering is exempt (parking against the curb).
  // Reset on leaving the lane or the span — one bill per cruise, re-arming
  // for a repeat offence.
  const busLaneCruise =
    tick.busLaneRight === true &&
    tick.laneId === 0 &&
    (tick.laneCount ?? 1) > 1 &&
    moving &&
    forwardGear &&
    tick.indicator !== "right";
  if (
    stepEpisode(
      s.busLane,
      busLaneCruise,
      tick.busLaneRight !== true || tick.laneId !== 0,
      t,
      cfg.busLaneSustainSec,
    )
  ) {
    events.push(makeViolation("DRIVING_IN_BUS_LANE", t));
  }

  // Railway crossing (RAIL PACK slice 1, ADR-006 stage 3a — doc 72 RX-01/02/03,
  // ЗДвП чл. 51–53; Н38 treats rail-crossing offences as опасна). All three
  // cases bill the ONE dedicated code, each with a machine-readable detail:
  //  (a) "no-stop"          — an UNGUARDED crossing's band entered without a
  //      recent qualifying FULL STOP (the Б2 full-stop ledger discipline,
  //      verbatim: stop.lastQualifyingStopAt within stopRecencySec). The
  //      LEGAL ASYMMETRY is structural: a GUARDED crossing carries no stop
  //      duty while open (чл. 52 — the driver-is-the-barrier duty exists only
  //      where no barrier does), so railGuarded === true skips this case.
  //  (b) "entered-barred"   — the band entered while the guarded crossing is
  //      BARRED (authored timetable) — convicts regardless of any stop made
  //      first (weaving past the barrier after a polite stop is the kill).
  //  (c) "stopped-on-track" — came to REST on the band (railRest below).
  // Structural innocence (A12): all context is authored zone data (absent =
  // silent — every shipped v1 map); entries grade only after a genuine
  // "approach" frame (spawns/teleports onto the band are inert); reverse
  // maneuvering is exempt; braking THROUGH without stopping never bills.
  const railPhase = tick.railCrossing ?? null;
  if (railPhase === "on" && s.rail.prevPhase !== "on") {
    if (s.rail.approachSeen && forwardGear) {
      if (tick.railBarred === true) {
        events.push(makeViolation("RAIL_CROSSING_VIOLATION", t, { detail: "entered-barred" }));
      } else if (tick.railGuarded !== true) {
        const last = s.stop.lastQualifyingStopAt;
        const stopped = last !== null && t - last <= cfg.stopRecencySec;
        if (!stopped) {
          events.push(makeViolation("RAIL_CROSSING_VIOLATION", t, { detail: "no-stop" }));
        }
      }
      // guarded + open: crossing without stopping is LEGAL — no code.
    }
  }
  if (railPhase === "approach") s.rail.approachSeen = true;
  else if (railPhase === null) s.rail.approachSeen = false;
  s.rail.prevPhase = railPhase;

  // At rest ON the track band (RX-03 — „опашка върху прелеза"): deliberately
  // NO queue exemption (following the queue onto the tracks IS the taught
  // kill) and a short sustain — resting on rails is never innocent. A stop
  // BEFORE the band (the stop line, the approach queue) is a different phase
  // ("approach") and never arms this. Driving on re-arms one bill per rest.
  const restingOnRail = railPhase === "on" && speed <= cfg.fullStopMaxSpeedKmh && forwardGear;
  if (
    stepEpisode(
      s.railRest,
      restingOnRail,
      railPhase !== "on" || speed > cfg.movingSpeedKmh,
      t,
      cfg.railRestSustainSec,
    )
  ) {
    events.push(makeViolation("RAIL_CROSSING_VIOLATION", t, { detail: "stopped-on-track" }));
  }

  // NOTE: SP-06 „обструктивно бавно каране" (obstructively slow) was
  // prototyped here and REMOVED — with only rule-engine telemetry a
  // legitimately cautious crawl (готовност за спиране toward a blind junction,
  // a tight maneuver) is indistinguishable from an obstructive one, so it
  // false-fired on innocent recorded traces (a blind-junction shadow drive
  // among them). doc 72 flags SP-06 as needing the director's staged-hazard
  // knowledge; it is not safely gradable as a pure rule (A12). Left to N-tier.

  // -- 4b. B1a Wave-1 world-context detectors (doc 72 capability 1). All of
  // them read the OPTIONAL tick context fields; absent context = silent.

  // Stop position at red (JU-15): halted with the nose past the line/on the
  // zebra while the light forbids entry. The center never crossed (that would
  // be RED_LIGHT_CROSSED via the sweep) — this is the invisible-today overshoot.
  //
  // C3 lawful-presence latch: being at/near the line window while the light is
  // GREEN (queue creep on green, or the phase flipping over a stranded queue)
  // marks the presence as lawful — the code charges HOW YOU ARRIVED, not where
  // a red caught you. The latch clears only on physical departure, which also
  // kills the refire loop (one stranding, two red cycles = one violation, and
  // only when the arrival itself was under a forbidding light).
  const inOvershootWindow =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.stopOvershootCenterM + 2;
  const overshootDeparted =
    tick.nextStopLineM === undefined || tick.nextStopLineM > cfg.stopOvershootCenterM + 2;
  if (inOvershootWindow && tick.nextStopLineState === "green") {
    s.stopOvershootGreenSeen = true;
  } else if (overshootDeparted) {
    s.stopOvershootGreenSeen = false;
  }
  const overLineAtRed =
    tick.nextStopLineControl === "trafficLight" &&
    (tick.nextStopLineState === "red" || tick.nextStopLineState === "redYellow") &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.stopOvershootCenterM &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    !s.stopOvershootGreenSeen &&
    forwardGear;
  if (
    stepEpisode(
      s.stopOvershoot,
      overLineAtRed,
      overshootDeparted || tick.nextStopLineState === "green",
      t,
      cfg.stopOvershootRestSec,
    )
  ) {
    events.push(makeViolation("STOP_LINE_OVERSHOOT", t));
  }

  // Hesitation at green (JU-09 — „закъснели действия"): stationary at the
  // light, green for the whole sustain, box clear (no lead vehicle near), no
  // declared turn (an indicator = lawfully waiting for a gap/pedestrians),
  // no armed crossing zone (stragglers finishing their crossing), and the
  // engine RUNNING — a stall at the green is already billed as
  // ENGINE_STALLED; charging the restart seconds again as hesitation would
  // double-bill one act (C3 FP case: "stalled at the green").
  const hesitating =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState === "green" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.hesitationMaxLineDistM &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    tick.indicator === "off" &&
    (leadGapM === null || leadGapM > cfg.hesitationClearGapM) &&
    s.crossing === null &&
    tick.stalled !== true &&
    forwardGear;
  if (stepEpisode(s.hesitation, hesitating, !hesitating, t, cfg.hesitationSustainSec)) {
    events.push(makeViolation("HESITATION_AT_GREEN", t));
  }

  // Causeless harsh braking (VP-09/SP-11 — „рязко спиране, което създава
  // предпоставка за ПТП"). HIGH FP RISK by nature, so it fires only when
  // EVERY plausible cause is positively absent (A12 discipline, hard):
  //  - no lead vehicle anywhere near, no armed crossing zone,
  //  - no stop line / junction ahead within the clear windows,
  //  - no hazard-shaped tick event in the recent past (ledger above),
  //  - on the normal driving line (not recovering from a excursion),
  //  - onset from real speed, emergency-grade decel, sustained.
  // C3 additions to the cause ledger:
  //  - a FORBIDDING (non-green) light visible ahead is a cause at any
  //    distance the runtime watches — braking for a fresh amber flip 70 m out
  //    is a response, not a phantom;
  //  - a lead gap CLOSING fast is a cause at any distance — a lead braking
  //    hard 50 m ahead is exactly what must be responded to.
  const signalAheadForbids =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState !== undefined &&
    tick.nextStopLineState !== "green" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.harshBrakeSignalCauseM;
  const leadClosingFast =
    leadGapM !== null && gapOpeningMps <= -cfg.harshBrakeClosingLeadMps;
  const noBrakeCause =
    (leadGapM === null || leadGapM > cfg.harshBrakeClearLeadGapM) &&
    !leadClosingFast &&
    !signalAheadForbids &&
    s.crossing === null &&
    (tick.nextStopLineM === undefined || tick.nextStopLineM > cfg.harshBrakeStopLineClearM) &&
    (tick.nextJunctionM === undefined || tick.nextJunctionM > cfg.harshBrakeJunctionClearM) &&
    (s.lastHazardEventAt === null || t - s.lastHazardEventAt > cfg.harshBrakeHazardCooldownSec) &&
    Math.abs(tick.laneOffsetM) <= cfg.laneKeepMaxOffsetM &&
    tick.wrongWay !== true &&
    forwardGear;
  const harshDecel = dt > 0 && accelMps2 <= -cfg.harshBrakeDecelMps2;
  // Sticky-cause ledger (C3): a cause observed at any point of ONE continuous
  // braking episode (pedal never released) exempts the whole episode — a lead
  // that brake-checks and then floors it must not convert the tail of the
  // justified stop into a phantom. Resets on pedal release.
  if (accelMps2 <= -2 && !noBrakeCause) {
    s.harshBrake.causeSeen = true;
  }
  if (harshDecel && noBrakeCause && !s.harshBrake.causeSeen) {
    if (s.harshBrake.activeSince === null) {
      s.harshBrake.activeSince = t;
      s.harshBrake.onsetKmh = s.prevSpeedKmh ?? speed;
    }
    if (
      !s.harshBrake.emitted &&
      s.harshBrake.onsetKmh >= cfg.harshBrakeMinSpeedKmh &&
      t - s.harshBrake.activeSince >= cfg.harshBrakeSustainSec
    ) {
      s.harshBrake.emitted = true;
      events.push(makeViolation("HARSH_BRAKING_NO_CAUSE", t));
    }
  } else if (accelMps2 > -2) {
    // Pedal released (or a cause appeared and braking eased) — re-arm.
    s.harshBrake.activeSince = null;
    s.harshBrake.emitted = false;
    s.harshBrake.causeSeen = false;
  } else {
    // Still braking but a plausible cause exists now — never fire this episode.
    s.harshBrake.activeSince = null;
  }

  // -- 5. pedestrian-crossing zone: track approach speed while a pedestrian is
  // present. A firm braking response (>= crossingBrakeResponseMps2) pauses the
  // too-fast clock: entering the zone at a legal 45-50 km/h and braking hard
  // takes longer than the sustain to get under the max — punishing the exact
  // correct reaction would be a 10-point false positive (A12). Holding speed,
  // or merely lifting off, still fires on the sustain.
  if (s.crossing) {
    const z = s.crossing;
    z.minSpeedKmh = Math.min(z.minSpeedKmh, speed);
    const respondingByBraking = accelMps2 <= -cfg.crossingBrakeResponseMps2;
    if (z.pedestrianSeen && speed > cfg.crossingApproachMaxKmh && !respondingByBraking) {
      if (z.tooFastSince === null) z.tooFastSince = t;
      if (!z.tooFastEmitted && t - z.tooFastSince >= cfg.crossingTooFastSustainSec) {
        z.tooFastEmitted = true;
        events.push(makeViolation("PEDESTRIAN_CROSSING_TOO_FAST", t));
      }
    } else {
      z.tooFastSince = null;
    }
  }

  // -- 6. positive reinforcement: reward a violation-free driving streak.
  // A driver still committing a sustained violation (e.g. holding over the
  // limit — the episode fires once, then stays silent) must NOT accumulate
  // "clean" distance, so suppress while any episode is fired-and-ongoing.
  const ongoingViolation = [
    s.speedingMinor,
    s.speedingDangerous,
    s.seatbelt,
    s.handbrake,
    s.headlights,
    s.laneKeeping,
    s.conditionsSpeed,
    s.rainLights,
    s.fogLights,
    s.following,
    s.wrongWay,
    s.keepRight,
    s.stall,
    s.stopOvershoot,
    s.centerLine,
    s.hesitation,
    s.harshBrake,
    s.standstillGap,
    s.highBeamDip,
    s.followingRain,
    s.banZoneStop,
    s.solidCross,
    s.busLane,
    s.railRest,
    s.curveSpeed,
    s.motorwaySlow,
    s.emergencyLane,
  ].some((ep) => ep.emitted && ep.activeSince !== null);
  if (events.some((e) => e.kind === "violation")) {
    s.cleanDistanceM = 0; // any fresh mistake resets the streak
  } else if (!ongoingViolation && !s.terminated && moving && s.prevT !== null) {
    // Clamp dt so a pause/resume time jump can't fabricate a huge distance.
    s.cleanDistanceM += (speed / 3.6) * Math.min(t - s.prevT, 2);
    if (s.cleanDistanceM >= cfg.cleanDrivingDistanceM) {
      s.cleanDistanceM -= cfg.cleanDrivingDistanceM;
      events.push(makeCommendation("CLEAN_DRIVING", t));
    }
  }

  s.prevT = t;
  s.prevSpeedKmh = speed;
  s.prevLeadGapM = leadGapM;
  return { state: s, events };
}

// ---------------------------------------------------------------------------
// Discrete event handlers
// ---------------------------------------------------------------------------

function handleTickEvent(
  s: RuleEngineState,
  e: SimTickEvent,
  tick: SimTick,
  out: RuleEvent[],
): void {
  const cfg = s.config;
  const t = tick.t;

  switch (e.kind) {
    case "stopLineCrossed": {
      if (e.control === "trafficLight") {
        // JU-18: a resolved CONTROLLER permission is the effective signal and
        // overrides the lamps entirely (ЗДвП чл. 7 — сигналите на
        // регулировчика са над светофара): "halt" is the dedicated 10-point
        // опасна even on green lamps; "proceed" is innocent even on red.
        // Absent (every pre-JU-18 runtime) = the lamp grading, byte-identical.
        if (e.controller !== undefined) {
          if (e.controller === "halt") out.push(makeViolation("CONTROLLER_SIGNAL_VIOLATED", t));
          break;
        }
        if (e.lightState === "red") out.push(makeViolation("RED_LIGHT_CROSSED", t));
        // Red+yellow creep (JU-08): entering on the combination is the
        // официална основна — deliberately NOT the 10-point red entry.
        else if (e.lightState === "redYellow") out.push(makeViolation("RED_YELLOW_CROSSED", t));
        // Amber adjudication (JU-06): crossing on yellow is graded ONLY when
        // the runtime affirmatively computed that a comfortable stop was
        // possible at the flip (`stoppable: true`). Unknown/false = the
        // dilemma-zone entry the yellow legally exists for — innocent (A12).
        else if (e.lightState === "yellow" && e.stoppable === true) {
          out.push(makeViolation("YELLOW_LIGHT_NOT_STOPPED", t));
        }
        break;
      }
      // Б2 stop sign: a qualifying full stop must have ended recently.
      const last = s.stop.lastQualifyingStopAt;
      const stopped = last !== null && t - last <= cfg.stopRecencySec;
      out.push(
        stopped
          ? makeCommendation("FULL_STOP_AT_STOP_SIGN", t)
          : makeViolation("STOP_SIGN_NO_FULL_STOP", t),
      );
      // JU-23 „един поглед не стига" — the junction-scan lookback (config-gated
      // per-lesson drill). Crossing the Б2 line demands a FRESH ляво-дясно scan;
      // the glance trackers were updated this same tick (step 1, before this
      // handler). A left AND a right glance must each fall within the lookback.
      // This is a DISTINCT fault from the full-stop grade above (a rolling stop
      // can also skip the scan) — the "looked but failed to see" observation
      // quality the doc grades separately. SHIPPED OFF (see types.ts): the A12
      // whole-commute crosses a Б2 unglanced and must stay innocent by default.
      if (cfg.junctionScanObservationEnabled) {
        const lg = s.lastGlanceAt.left;
        const rg = s.lastGlanceAt.right;
        const scanned =
          lg !== null &&
          t - lg <= cfg.junctionScanLookbackSec &&
          rg !== null &&
          t - rg <= cfg.junctionScanLookbackSec;
        if (!scanned) out.push(makeViolation("JUNCTION_SCAN_INCOMPLETE", t));
      }
      break;
    }

    case "turnStarted": {
      const lastOn = s.lastIndicatorOnAt[e.direction];
      const ok = lastOn !== null && t - lastOn <= cfg.indicatorLookbackSec;
      if (!ok) out.push(makeViolation("TURN_WITHOUT_INDICATOR", t));
      break;
    }

    case "crossingZoneEntered": {
      if (s.crossing && s.crossing.crossingId === e.crossingId) {
        // presence update for the zone we are already in
        s.crossing.pedestrianSeen = s.crossing.pedestrianSeen || e.pedestrianOnCrossing;
      } else {
        s.crossing = {
          crossingId: e.crossingId,
          pedestrianSeen: e.pedestrianOnCrossing,
          tooFastSince: null,
          tooFastEmitted: false,
          minSpeedKmh: tick.speedKmh,
        };
      }
      break;
    }

    case "crossingPassed": {
      const z = s.crossing && s.crossing.crossingId === e.crossingId ? s.crossing : null;
      if (e.pedestrianOnCrossing) {
        out.push(makeViolation("PEDESTRIAN_NOT_YIELDED", t));
      } else if (
        z !== null &&
        z.pedestrianSeen &&
        !z.tooFastEmitted &&
        z.minSpeedKmh <= cfg.yieldSlowSpeedKmh
      ) {
        // A pedestrian was there, the driver slowed/stopped, and the crossing
        // is now clear — textbook yielding.
        out.push(makeCommendation("PEDESTRIAN_YIELDED", t));
      }
      if (z !== null) s.crossing = null;
      break;
    }

    case "collision": {
      if (s.collisionCooldownUntil !== null && t < s.collisionCooldownUntil) break;
      s.collisionCooldownUntil = t + cfg.collisionCooldownSec;
      s.terminated = true;
      out.push(makeViolation("COLLISION", t, { detail: e.withWhat }));
      break;
    }

    case "prioritySituation": {
      // Phase 2: the worldRuntime priority adjudicator decides the outcome; the
      // reducer just grades it. `situation` (give-way / uncontrolled / …) is
      // carried into the detail for the debrief. `yielded` = the driver met a
      // real conflict and resolved it correctly → positive reinforcement.
      // VU-09: the reserved "emergency" situation carries its own catalog code
      // (special-regime duty, ЗДвП чл. 91) — every other situation keeps
      // grading FAILED_TO_YIELD byte-identically. OV-05: the runtime's
      // overtake-corridor adjudicator ("overtake-oncoming") likewise carries
      // its own code — the head-on gamble is a distinct law (чл. 42, ал. 1)
      // and a distinct lesson from a junction priority slip. VU-02: the
      // runtime's vulnerable-pass adjudicator ("vulnerable-pass") is the same
      // discipline again — squeezing a cyclist is the чл. 42 lateral-clearance
      // duty, not a junction priority, so it bills its own основна. OV-09:
      // the runtime's overtake-return adjudicator ("overtake-return") closes
      // the overtake's third act — the brake-forcing cut back in front of the
      // overtaken vehicle is the чл. 42 return duty, its own основна.
      if (e.violated) {
        out.push(
          makeViolation(
            e.situation === "emergency"
              ? "EMERGENCY_NOT_YIELDED"
              : e.situation === "overtake-oncoming"
                ? "OVERTAKE_INSUFFICIENT_GAP"
                : e.situation === "overtake-return"
                  ? "OVERTAKE_RETURN_TOO_EARLY"
                  : e.situation === "vulnerable-pass"
                    ? "VULNERABLE_PASS_TOO_CLOSE"
                    : "FAILED_TO_YIELD",
            t,
            { detail: e.situation },
          ),
        );
      } else if (e.yielded) out.push(makeCommendation("YIELDED_TO_PRIORITY", t));
      break;
    }

    case "mirrorGlance": // handled in the tracker pass
      break;
  }
}
