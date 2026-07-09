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
}

const IDLE_EPISODE: EpisodeState = { activeSince: null, emitted: false };

export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngineState {
  return {
    config: { ...DEFAULT_RULE_CONFIG, ...config },
    prevT: null,
    prevLaneId: null,
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

  // -- 1. observation trackers (indicator history, mirror glances, full stops)
  if (tick.indicator === "left") s.lastIndicatorOnAt.left = t;
  if (tick.indicator === "right") s.lastIndicatorOnAt.right = t;

  for (const e of tick.events) {
    if (e.kind === "mirrorGlance") s.lastGlanceAt[e.mirror] = t;
  }

  if (speed <= cfg.fullStopMaxSpeedKmh) {
    if (s.stop.stoppedSince === null) s.stop.stoppedSince = t;
    if (t - s.stop.stoppedSince >= cfg.fullStopMinDurationSec) {
      s.stop.lastQualifyingStopAt = t; // still stopped => stop is "current"
    }
  } else {
    s.stop.stoppedSince = null;
  }

  // -- 2. discrete zone / contact events
  for (const e of tick.events) {
    handleTickEvent(s, e, tick, events);
  }

  // -- 3. lane-change detection (after glance/indicator trackers updated)
  if (
    s.prevLaneId !== null &&
    tick.laneId !== s.prevLaneId &&
    speed >= cfg.laneChangeMinSpeedKmh
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

  // Lane-keeping: sustained off-centre / straddling positioning while moving.
  const offCentre = Math.abs(tick.laneOffsetM) > cfg.laneKeepMaxOffsetM;
  if (stepEpisode(s.laneKeeping, offCentre && moving, !offCentre, t, cfg.laneKeepSustainSec)) {
    events.push(makeViolation("POOR_LANE_KEEPING", t));
  }

  // Speed for the conditions: within the posted limit, but too fast for rain /
  // night. (Above the limit is regular speeding, handled above.)
  const raining = tick.rain === true;
  const conditionsReduced = raining || tick.isNight;
  const conditionFactor =
    (raining ? cfg.conditionSpeedRainFactor : 1) * (tick.isNight ? cfg.conditionSpeedNightFactor : 1);
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

  // Following distance (2-second rule) — only above stop-and-go speed and when a
  // lead vehicle is actually in the tick's gap channel.
  const leadGap = tick.leadGapM;
  const safeGapM = Math.max(cfg.followMinGapM, (speed / 3.6) * cfg.followSafeSeconds);
  const tailgating =
    moving &&
    speed >= cfg.followMinSpeedKmh &&
    leadGap !== undefined &&
    Number.isFinite(leadGap) &&
    leadGap < safeGapM;
  if (stepEpisode(s.following, tailgating, !tailgating, t, cfg.followSustainSec)) {
    events.push(makeViolation("FOLLOWING_TOO_CLOSE", t));
  }

  // Wrong way against a one-way street (runtime sets tick.wrongWay).
  const goingWrongWay = tick.wrongWay === true && moving;
  if (stepEpisode(s.wrongWay, goingWrongWay, !goingWrongWay, t, cfg.wrongWaySustainSec)) {
    events.push(makeViolation("WRONG_WAY", t));
  }

  // Keep right: prolonged driving in a non-rightmost lane on a multi-lane road.
  const inLeftLane = tick.laneId > 0 && (tick.laneCount ?? 1) > 1 && moving;
  if (stepEpisode(s.keepRight, inLeftLane, !inLeftLane, t, cfg.keepRightSustainSec)) {
    events.push(makeViolation("NOT_KEEPING_RIGHT", t));
  }

  // -- 5. pedestrian-crossing zone: track approach speed while a pedestrian is present
  if (s.crossing) {
    const z = s.crossing;
    z.minSpeedKmh = Math.min(z.minSpeedKmh, speed);
    if (z.pedestrianSeen && speed > cfg.crossingApproachMaxKmh) {
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
        // yellow: not penalized in v1 (open question — see module report)
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
