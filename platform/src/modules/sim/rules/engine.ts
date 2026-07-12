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
}

const IDLE_EPISODE: EpisodeState = { activeSince: null, emitted: false };

export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngineState {
  return {
    config: { ...DEFAULT_RULE_CONFIG, ...config },
    prevT: null,
    prevLaneId: null,
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
    following: { ...s.following },
    wrongWay: { ...s.wrongWay },
    keepRight: { ...s.keepRight },
    crossing: s.crossing ? { ...s.crossing } : null,
    stall: { ...s.stall },
    stopOvershoot: { ...s.stopOvershoot },
    centerLine: { ...s.centerLine },
    hesitation: { ...s.hesitation },
    harshBrake: { ...s.harshBrake },
    moveOff: { ...s.moveOff },
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
    if (!indicatorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_INDICATOR", t));
    if (!mirrorOk) events.push(makeViolation("LANE_CHANGE_WITHOUT_MIRROR_CHECK", t));
    if (indicatorOk && mirrorOk) events.push(makeCommendation("SAFE_LANE_CHANGE", t));
  }
  s.prevLaneId = tick.laneId;

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
    forwardGear;
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
      offCentre && moving && forwardGear && !centerLineCond,
      !offCentre,
      t,
      cfg.laneKeepSustainSec,
    )
  ) {
    events.push(makeViolation("POOR_LANE_KEEPING", t));
  }

  // Speed for the conditions: within the posted limit, but too fast for rain /
  // night. (Above the limit is regular speeding, handled above.) Factors
  // compose by MIN — the single most restrictive condition governs; the
  // product would double-bill a rainy night (A12). A factor of 1 means the
  // condition does not reduce the prudent speed at all.
  const raining = tick.rain === true;
  const conditionFactor = Math.min(
    raining ? cfg.conditionSpeedRainFactor : 1,
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

  // Lights in rain (daytime — night is covered by HEADLIGHTS_OFF_AT_NIGHT).
  const rainNoLights = raining && !tick.isNight && tick.headlights === "off" && moving;
  if (
    stepEpisode(s.rainLights, rainNoLights, !raining || tick.headlights !== "off", t, cfg.rainLightsSustainSec)
  ) {
    events.push(makeViolation("HEADLIGHTS_OFF_IN_RAIN", t));
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
  // in reverse gear (parking maneuvers; A12).
  const hoggingLeft =
    tick.laneId > 0 &&
    (tick.laneCount ?? 1) > 1 &&
    moving &&
    forwardGear &&
    tick.indicator !== "left";
  if (stepEpisode(s.keepRight, hoggingLeft, !hoggingLeft, t, cfg.keepRightSustainSec)) {
    events.push(makeViolation("NOT_KEEPING_RIGHT", t));
  }

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
    s.following,
    s.wrongWay,
    s.keepRight,
    s.stall,
    s.stopOvershoot,
    s.centerLine,
    s.hesitation,
    s.harshBrake,
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
      if (e.violated) out.push(makeViolation("FAILED_TO_YIELD", t, { detail: e.situation }));
      else if (e.yielded) out.push(makeCommendation("YIELDED_TO_PRIORITY", t));
      break;
    }

    case "mirrorGlance": // handled in the tracker pass
      break;
  }
}
