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
import { encodeSpeedMeasurement } from "./consequences";
import {
  DEFAULT_RULE_CONFIG,
  type LaneArrow,
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
  /**
   * M-16 (stepSustainedEpisode only): when the driver last came back inside
   * the reset condition, and when this episode last billed. Untouched — and
   * therefore always null — for the detectors that use plain `stepEpisode`.
   */
  resetSince: number | null;
  lastEmitAt: number | null;
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
  /**
   * Rolling speed window (audit M-18): the samples the acceleration gates are
   * measured over, oldest first. Trimmed to `accelWindowSec` every frame —
   * see the ACCEL WINDOW note in reduceTick for why a single frame delta is
   * not a usable derivative at render rates.
   */
  speedWindow: Array<{ t: number; speedKmh: number }>;
  /** Previous frame's lead gap (null = none reported) — cut-in recovery (A12). */
  prevLeadGapM: number | null;
  /**
   * OV-07/OV-06 overtake tracker (audit H-5). Overtaking is a two-beat, LEFT-side
   * manoeuvre (ЗДвП чл. 42, ал. 2) and the two codes must grade the manoeuvre,
   * not the bare lane-id delta.
   *  - `lastLeadNearAt`: last moment a vehicle sat inside the overtake corridor
   *    ahead. The pull-out frame itself routinely loses it (the car is astride
   *    the boundary, the lead falls out of the ±4 m corridor), so the pull-out is
   *    recognised from the recent sighting rather than the instantaneous one.
   *  - `overtakePullOutAt`: when the driver last swung LEFT past such a vehicle.
   *    A change back to the RIGHT is the manoeuvre's second beat only while this
   *    is fresh; with no pull-out behind it, moving right is a merge to the curb
   *    or the required approach to a right turn — innocent, and the exact false
   *    positive H-5 documents.
   * Both are direction/manoeuvre bookkeeping only — neither grades anything.
   */
  lastLeadNearAt: number | null;
  overtakePullOutAt: number | null;
  /**
   * M-17 lane-intent memory: the last М10 glyph the vehicle stood on, and
   * when. The arrows are painted on the APPROACH; the turn is adjudicated
   * inside the junction, by which time the lane fix has long left the painted
   * span — so the arrow that governed the manoeuvre has to be remembered, the
   * way the overtake tracker remembers the lead it swung past. Overwritten by
   * every later span (a driver who re-lines-up is judged by the lane they
   * ended in) and SPENT by the turn it grades, so one approach can never
   * convict two junctions.
   */
  lastLaneArrow: { arrow: LaneArrow; t: number } | null;
  lastIndicatorOnAt: Record<TurnDirection, number | null>;
  lastGlanceAt: Record<MirrorKind, number | null>;
  /**
   * JU-23 wait-freeze ledger (founder R3 #13, doc 62): seconds spent
   * effectively STOPPED (speed < movingSpeedKmh) since each SIDE's last
   * glance. The junction-scan check subtracts it from the glance age, so a
   * ляво-дясно scan made at the mouth does NOT go stale while the driver
   * legally WAITS for the priority car to pass — the world they scanned was
   * not moving past them. Moving time still ages the scan normally (a glance
   * at mouth 1 stays stale by mouth 2).
   *
   * 2026-08-16: the LANE-CHANGE mirror now reads the same ledger, capped at
   * `mirrorWaitFreezeMaxSec` — see that config field for why the drilled order
   * (огледало → мигач → изчакай пролука → маневра) could not be performed
   * inside a fixed 8 s wall clock. Move-off observation still keeps the plain
   * window: it grades the transition out of rest itself, where „time spent at
   * rest" is the whole of what is being observed.
   */
  scanStopCreditSec: { left: number; right: number };
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
  /**
   * THE OPEN CONTACT EPISODE — when the last contact was REPORTED, or null if
   * the car has never touched anything. An episode stays open while reports
   * keep arriving and closes after `collisionSeparationSec` of silence AND
   * `COLLISION_REOPEN_TRAVEL_M` of travel; only the report that OPENS one is
   * billed. See the `collision` case.
   */
  lastCollisionContactAt: number | null;
  /**
   * Path length driven since the last REPORTED contact, metres (reset to 0 by
   * every report, including the ones inside an open encounter). The second
   * half of "the bodies have come apart" — see the `collision` case for the
   * drives that made silence alone insufficient.
   */
  travelSinceContactM: number;
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
  /**
   * SPAWN-POSE LATCH (doc 87 B23/B26/B33). False until the vehicle has been
   * observed INSIDE its own lane at least once this session. A student cannot
   * be convicted of moving onto a line he was placed on: four of four
   * straight-line drives in the founder review ended in a graded
   * «Настъпване на осевата линия» pause because the compiled spawn puts the car
   * astride the dashed осева (tj-*-v1 spawnPoints author x = 0, the road
   * CENTRELINE, while the lane centre is 4.06 m off it) and the driver simply
   * drove forward, straight, at the speed the objective taught. Once he has
   * once been where the lesson meant him to be, the positional detectors grade
   * exactly as shipped — this latch removes only the frame-zero falsehood, and
   * it disarms itself the moment a lane fixes its spawn data.
   */
  inLaneSeen: boolean;
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
  /** Gap to the lead COLLAPSING and already under the taught time-gap — the
   *  approach to a slowing / stopped queue (FO-08; config-gated). */
  leadClosing: EpisodeState;
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
   * Seconds of crawl ACCRUED inside the currently-open motorway episode — see
   * `stepAccruedEpisode` and the crawl detector for why the sustain counts
   * qualifying seconds instead of demanding they be consecutive. Zeroed by the
   * same reset that re-arms the episode (recovery / leaving the motorway).
   */
  motorwayCrawlSec: number;
  /**
   * Sustained DRIVING in the лента за принудително спиране (laneId 0 inside
   * an authored emergencyLane span). One bill per excursion; re-arms on
   * leaving the lane/span.
   */
  emergencyLane: EpisodeState;
}

const IDLE_EPISODE: EpisodeState = {
  activeSince: null,
  emitted: false,
  resetSince: null,
  lastEmitAt: null,
};

/**
 * HOW FAR A CAR MUST DRIVE BEFORE IT CAN HAVE HAD A SECOND ACCIDENT, metres.
 *
 * The encounter rule below was written as „silence ends an encounter", with the
 * separation itself delegated to a CONTRACT ON THE REPORTERS (see the
 * `collision` case). Trusting a contract is how the 2026-08-16 catalogue sweep
 * found «490 наказателни точки» — 49 пътнотранспортни произшествия — printed on
 * the same card as the sentence saying a collision is ONE dangerous error worth
 * ten; and 420, 290, 252, 141, 94 on other lessons, all of them one contact.
 *
 * A contract cannot be the only defence, because the reducer is the one place
 * that survives every reporter. This is the part it can check ITSELF, from
 * telemetry it already has: A CAR THAT HAS NOT MOVED CANNOT HAVE COME APART
 * FROM WHAT IT IS INSIDE OF. Two accidents need the body to be left and reached
 * again, so the path between them is at least twice the daylight in between.
 * 2 m is that floor measured against the case the encounter rule was built to
 * KEEP billing: the shipped „hit, reverse out, hit again" gate is the fastest
 * real re-hit rapier could produce (`collisionSeparationSec`'s 2.35 s), and
 * integrating its own frames gives 4.4 m of path — 2.2× the floor, so that
 * drive still bills twice. A car resting embedded in a bumper at 0 км/ч accrues
 * nothing and can never open a second one, however the reporter behaves.
 *
 * MEASURED, one embedded contact re-reported with 4 s gaps for 60 s at 0 км/ч
 * (`engine.test.ts` „an embedded car whose reporter falls silent…"): 16 bills /
 * 160 points before, 1 bill / 10 points after. It is a module constant and not
 * a `RuleEngineConfig` field on purpose — it is not a tolerance to tune per
 * lesson but a statement about what „apart" means, and a lesson that could
 * lower it could re-buy the 490.
 */
const COLLISION_REOPEN_TRAVEL_M = 2;

/**
 * HOW LONG THE RIGHT WAY MUST BE HELD BEFORE A SECOND WRONG-WAY RUN, seconds.
 *
 * `WRONG_WAY` is a 10-point опасна riding a boolean the runtime computes from
 * heading against edge direction — and heading is derived from motion, so at
 * crawl speed it is the noisiest signal in the tick. `stepEpisode` re-arms on
 * the FIRST frame the condition is false, which is the exact M-16 defect the
 * speeding episode was rewritten to close: one flickering signal becomes N
 * separate convictions. The 2026-08-17 catalogue sweep photographed the price
 * on a road nothing signs one-way — `sc-ac-wind-truck-pass / pc-right`, a
 * careful drive at 13–16 км/ч, «Движение в обратна посока по еднопосочна улица
 * ×5 — опасна, 50 наказателни т.» on a sheet whose whole allowance is 9; the
 * same code appears the same way on `sc-ed-d2-city-run / pc-right` (five to
 * eight bills) and on `sc-ac-truck-spray`.
 *
 * A driver who genuinely runs a one-way street twice must still be billed
 * twice, so the episode re-arms — but only after the lawful direction has been
 * HELD, which is what a second act requires and what a flicker never delivers.
 * 4 s is the number this engine already uses for „a correction that counts"
 * (`speedingRearmSec`); it is a module constant rather than a config field for
 * the same reason the travel floor above is — a lesson that could lower it
 * could re-buy the 50.
 *
 * NOT the whole defect, and deliberately said out loud: the sweep found no
 * one-way sign or arrow in ANY frame of the three lessons where this fires, so
 * the flag itself is wrong on those roads. That is the locator's/district
 * data's half and it is reported, not patched here — this half is the reducer's
 * own, and it is the difference between one false conviction and five.
 */
const WRONG_WAY_REARM_SEC = 4;

/**
 * JU-23 per-CONTROL copy for JUNCTION_SCAN_INCOMPLETE (doc 87, item 5 of the
 * 2026-08-05 gate's open list).
 *
 * The code is armed at BOTH kinds of priority line — a Б1 give-way line and a
 * Б2 stop line — because the fresh ляво-дясно scan is owed at both (see the
 * `stopLineCrossed` branch). The catalogue carries one string per code, so it
 * used to name Б2 for both, and the founder photographed the consequence: a
 * fault card reading «Премина стоп-линията на знак Б2» under the title bar of
 * the lesson «Б1 не значи спри винаги» (`newdef/b5gw-card-t24.4.png`).
 *
 * The catalogue text is now control-neutral and these two overrides put the
 * sign the student actually crossed on the card. They ride `makeViolation`'s
 * existing `titleBg`/`explanationBg` override channel — no new event field, no
 * new code, no severity or points change. `correctiveBg` has no per-event
 * channel (it is read from the catalogue BY CODE at display time), which is
 * why the catalogue's corrective was rewritten to be true of both controls
 * rather than split here.
 *
 * The Б1 half must also not smuggle back the myth this lesson exists to kill:
 * Б1 does not demand a stop (ЗДвП чл. 50), it demands that you give way — so
 * its copy says „намали и огледай", never „спри".
 */
const JUNCTION_SCAN_COPY = {
  giveWay: {
    titleBg: "Непълно оглеждане при знак Б1",
    explanationBg:
      "Премина линията на знак Б1 „Пропусни движението“, без да огледаш и наляво, и надясно. Б1 не иска да спреш винаги — иска да пропуснеш, а пропускаш само това, което си видял. „Един поглед не стига“: най-честата причина за удар на кръстовище е „гледах, но не видях“.",
  },
  stop: {
    titleBg: "Непълно оглеждане при знак Б2",
    explanationBg:
      "Премина стоп-линията на знак Б2 „Спри!“, без да огледаш и наляво, и надясно. „Един поглед не стига“ — най-честата причина за удар на кръстовище е „гледах, но не видях“: погледнал си веднъж отдалеч и си потеглил в това, което се е променило.",
  },
} as const;

export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngineState {
  return {
    config: { ...DEFAULT_RULE_CONFIG, ...config },
    prevT: null,
    prevLaneId: null,
    prevEdgeId: undefined,
    laneChange: { pending: [], lastBasisChangeAt: null },
    prevSpeedKmh: null,
    speedWindow: [],
    prevLeadGapM: null,
    lastLeadNearAt: null,
    overtakePullOutAt: null,
    lastLaneArrow: null,
    lastIndicatorOnAt: { left: null, right: null },
    lastGlanceAt: { left: null, right: null, rear: null },
    scanStopCreditSec: { left: 0, right: 0 },
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
    lastCollisionContactAt: null,
    travelSinceContactM: 0,
    terminated: false,
    cleanDistanceM: 0,
    stall: { ...IDLE_EPISODE },
    stopOvershoot: { ...IDLE_EPISODE },
    stopOvershootGreenSeen: false,
    inLaneSeen: false,
    centerLine: { ...IDLE_EPISODE },
    hesitation: { ...IDLE_EPISODE },
    harshBrake: { activeSince: null, emitted: false, onsetKmh: 0, causeSeen: false },
    moveOff: { restSeen: false, done: false },
    lastHazardEventAt: null,
    standstillGap: { ...IDLE_EPISODE },
    highBeamDip: { ...IDLE_EPISODE },
    followingRain: { ...IDLE_EPISODE },
    leadClosing: { ...IDLE_EPISODE },
    banZoneStop: { ...IDLE_EPISODE },
    solidCross: { ...IDLE_EPISODE },
    busLane: { ...IDLE_EPISODE },
    rail: { approachSeen: false, prevPhase: null },
    railRest: { ...IDLE_EPISODE },
    curveSpeed: { ...IDLE_EPISODE },
    motorwaySlow: { ...IDLE_EPISODE },
    motorwayCrawlSec: 0,
    emergencyLane: { ...IDLE_EPISODE },
  };
}

function cloneState(s: RuleEngineState): RuleEngineState {
  return {
    ...s,
    // The samples themselves are never mutated in place (only pushed/shifted),
    // so a shallow array copy keeps the reducer's no-input-mutation contract.
    speedWindow: [...s.speedWindow],
    lastIndicatorOnAt: { ...s.lastIndicatorOnAt },
    lastGlanceAt: { ...s.lastGlanceAt },
    scanStopCreditSec: { ...s.scanStopCreditSec },
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
    leadClosing: { ...s.leadClosing },
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

/**
 * Speeding-episode variant (audit M-16). Plain `stepEpisode` re-arms on the
 * FIRST frame the reset condition is seen, which made the fairest-looking
 * drive the most expensive one: 60 s held at 58 in a 50 zone billed once,
 * while a saw-tooth that dipped under 50 twelve times billed twelve — the
 * steadier, more dangerous behaviour graded 12× cheaper, and the student who
 * kept correcting punished for correcting. Two changes close the gap:
 *
 *  - `rearmSec` — a dip back to the limit only re-arms once the driver has
 *    genuinely HELD it. Anything shorter is one continuing offence, not a new
 *    one (the hysteresis the episode model already intended, measured in
 *    seconds instead of frames);
 *  - `repeatSec` — an episode that never ends re-bills on that cadence, so
 *    sitting over the limit costs monotonically more the longer it lasts.
 *    Without it the cooldown alone would make sustained speeding CHEAPER than
 *    before, which is the same unfairness with the sign flipped.
 *
 * `lastEmitAt` carries the episode's last bill; `resetSince` the moment the
 * driver came back under the limit. Both live on the same EpisodeState so the
 * 25 detectors that do not opt in are byte-identical (rearm/repeat default 0).
 *
 * 2026-08-17: WRONG_WAY opts in too, with `repeatSec` 0 — it needs only the
 * first half. Its condition is a runtime boolean rather than a threshold on a
 * measured number, so it has no saw-tooth to counterweight; what it has is a
 * signal that flickers, and `rearmSec` is exactly the guard against a flicker
 * being read as a second act (see WRONG_WAY_REARM_SEC).
 */
function stepSustainedEpisode(
  e: EpisodeState,
  cond: boolean,
  reset: boolean,
  t: number,
  sustainSec: number,
  rearmSec: number,
  repeatSec: number,
): boolean {
  if (reset) {
    e.activeSince = null;
    if (e.resetSince === null) e.resetSince = t;
    if (t - e.resetSince >= rearmSec) {
      e.emitted = false;
      e.lastEmitAt = null;
    }
    return false;
  }
  e.resetSince = null;
  if (!cond) {
    // Condition false without a reset (e.g. the minor band vacated because the
    // episode ESCALATED into the dangerous band) — the episode is still open,
    // so the sustain clock restarts but the bill is not re-armed.
    e.activeSince = null;
    return false;
  }
  if (e.activeSince === null) e.activeSince = t;
  if (!e.emitted) {
    if (t - e.activeSince < sustainSec) return false;
    e.emitted = true;
    e.lastEmitAt = t;
    return true;
  }
  if (repeatSec > 0 && e.lastEmitAt !== null && t - e.lastEmitAt >= repeatSec) {
    e.lastEmitAt = t;
    return true;
  }
  return false;
}

/**
 * ACCRUED-SUSTAIN variant (2026-08-17 — the 161-lesson catalogue sweep).
 *
 * `stepEpisode` demands that the condition hold on EVERY frame of the sustain:
 * one frame of falsehood sets `activeSince` back to null and the clock starts
 * over. That is right for a condition which is genuinely a state (belt off,
 * handbrake on) and wrong for one that describes a STRETCH OF ROAD, because the
 * worst driving is the least continuous. Measured, `sc-mw-min-speed / pc-right`
 * («Магистрален ритъм — не пълзи»): 205 s on a 140 км/ч motorway, top speed
 * 15 км/ч, TWENTY-EIGHT full stops — and «Опасни 0 · Основни 0 · Второстепенни
 * 0», the one fault the lesson is named after never booked, because the crawl
 * dropped under `movingSpeedKmh` between every creep. `sc-mw-discipline`
 * scored the same 0 on the same shape.
 *
 * So the clock counts QUALIFYING SECONDS instead of demanding they be
 * consecutive: every per-frame gate the caller passes in stays exactly as
 * shipped (this loosens none of them — a frame that does not qualify still
 * contributes nothing), and only the requirement that qualifying frames be
 * adjacent is dropped. The episode's ledger survives the gaps and is zeroed by
 * the SAME reset that re-arms the bill, so a genuine recovery still buys a
 * clean slate and the „one bill per episode" latch is untouched.
 *
 * The per-frame credit is clamped at 2 s, exactly as the clean-driving and
 * contact-travel integrators clamp theirs and for the same reason: a
 * pause/resume time jump (every teach card pauses the sim) must not hand the
 * ledger seconds nobody drove.
 */
function stepAccruedEpisode(
  e: EpisodeState,
  accruedSec: number,
  cond: boolean,
  reset: boolean,
  t: number,
  dt: number,
  sustainSec: number,
): { accruedSec: number; fired: boolean } {
  if (reset) {
    e.activeSince = null;
    e.emitted = false;
    return { accruedSec: 0, fired: false };
  }
  if (!cond) {
    // The episode is still open — hold the ledger, stop the clock.
    e.activeSince = null;
    return { accruedSec, fired: false };
  }
  if (e.activeSince === null) e.activeSince = t;
  const next = accruedSec + Math.max(0, Math.min(dt, 2));
  if (!e.emitted && next >= sustainSec) {
    e.emitted = true;
    return { accruedSec: next, fired: true };
  }
  return { accruedSec: next, fired: false };
}

/**
 * Does the lane's М10 glyph permit turning `dir` out of it (audit M-17)?
 * „Само направо" permits neither; the combined glyphs permit their own half.
 * Straight-on is never graded here — the arrow says which lane may TURN, and
 * a driver who goes straight out of a turn-only lane is a different (much
 * softer) fault the telemetry cannot separate from a wide turn.
 */
function arrowPermits(arrow: LaneArrow, dir: TurnDirection): boolean {
  switch (arrow) {
    case "left":
      return dir === "left";
    case "right":
    case "throughRight":
      return dir === "right";
    case "leftThrough":
      return dir === "left";
    case "through":
      return false;
  }
}

/**
 * The two speeding thresholds for a posted limit, km/h (audit M-14).
 *
 * The grace and the опасна threshold used to be expressed in different units —
 * a 10% RATIO against an absolute +10 км/ч — and the two curves cross at 100:
 * from there up the "graced limit" sits ABOVE the dangerous threshold and
 * SPEEDING_OVER_LIMIT is unreachable, so the whole second-degree band silently
 * disappears on every rural/motorway map. Worse at the shipped default: the
 * Нормален governor caps at limit + NORMAL_CAP_MARGIN_KMH (10) — exactly the
 * опасна threshold — so on the 140 km/h motorway maps NEITHER speeding code
 * could fire at all. A детектор that cannot fire teaches nothing.
 *
 * The fix decouples them: the grace stays proportional for the domain it was
 * researched in (10% of 50 = 5 км/ч, byte-identical on every urban map) but is
 * CAPPED in absolute km/h, so a gradable second-degree band always exists
 * under the опасна line. The cap is the honest reading of what grace is for —
 * speedometer/physics slack, which does not grow because the road is faster;
 * 14 км/ч over on a motorway is not instrument error.
 */
export function speedingBands(
  limit: number,
  cfg: RuleEngineConfig,
): { gradedAbove: number; dangerousAbove: number } {
  const grace = Math.min(limit * cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh);
  return { gradedAbove: limit + grace, dangerousAbove: limit + cfg.dangerousSpeedOverKmh };
}

/**
 * Advance the rolling speed window and return its ANCHOR — the oldest sample
 * still spanning `windowSec` (the newest sample that has fallen out of the
 * window is KEPT as the anchor, so the measured span is at least the window
 * and never collapses back to one frame at high frame rates). Null on the
 * first frame. Mutates `w`, which is always a fresh clone inside reduceTick.
 */
function stepSpeedWindow(
  w: Array<{ t: number; speedKmh: number }>,
  t: number,
  speedKmh: number,
  windowSec: number,
): { t: number; speedKmh: number } | null {
  while (w.length >= 2 && w[1].t <= t - windowSec) w.shift();
  const anchor = w.length > 0 ? w[0] : null;
  w.push({ t, speedKmh });
  return anchor;
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
  /**
   * ACCEL WINDOW (audit M-18). Signed acceleration, m/s² (negative = braking),
   * measured over `accelWindowSec` rather than over one frame.
   *
   * The rate the reducer is fed is the CALLER's, and the live loop feeds a
   * render frame: at 120 fps a frame lasts ~8 ms, so a 0.06 km/h wobble in the
   * driveline's reported speed differentiates to ~2.1 m/s² — past
   * crossingBrakeResponseMps2 and into the emergency-lane brake exemption.
   * Numerical noise would then read as a braking response, i.e. as innocence
   * the driver never earned (and, with the sign the other way, as the harsh
   * braking they never did). Anchoring on the oldest sample inside the window
   * makes the derivative rate-INDEPENDENT: at the 1 Hz trace/replay rate the
   * window holds a single prior frame and the value is identical to the old
   * frame-to-frame delta (every recorded gate unchanged), while at render
   * rates ~36 frames average the jitter out. Time-based sustains were already
   * rate-independent; this is the last gate that was not.
   */
  const accelAnchor = stepSpeedWindow(s.speedWindow, t, speed, cfg.accelWindowSec);
  const accelMps2 =
    accelAnchor !== null && dt > 0 && t > accelAnchor.t
      ? (speed - accelAnchor.speedKmh) / 3.6 / (t - accelAnchor.t)
      : 0;
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

  // M-17 lane-intent memory (see the state doc): remember the glyph under the
  // wheels, forward-gear only — backing over an arrow is not lining up for a
  // turn. Runs before the tick events so a turn adjudicated on THIS frame
  // still sees this frame's arrow.
  if (tick.laneArrow !== undefined && forwardGear) {
    s.lastLaneArrow = { arrow: tick.laneArrow, t };
  }

  // H-5 overtake bookkeeping: remember when a vehicle was last close enough
  // ahead to BE the car you would overtake. Both overtake codes share one
  // corridor (the two gap configs are the same distance expressed per code), so
  // the wider of the two defines the sighting — a per-lesson override that
  // widens one must not silently narrow the manoeuvre tracker.
  const overtakeCorridorM = Math.max(cfg.crossingOvertakeLeadGapM, cfg.banOvertakeLeadGapM);
  if (leadGapM !== null && leadGapM <= overtakeCorridorM) s.lastLeadNearAt = t;

  // JU-23 wait-freeze accrual (founder R3 #13): stopped/creeping time counts
  // toward each side's credit BEFORE this tick's glances reset it — the credit
  // covers the interval since the previous tick, the reset covers now.
  if (speed < cfg.movingSpeedKmh) {
    s.scanStopCreditSec.left += dt;
    s.scanStopCreditSec.right += dt;
  }

  for (const e of tick.events) {
    if (e.kind === "mirrorGlance") {
      s.lastGlanceAt[e.mirror] = t;
      if (e.mirror !== "rear") s.scanStopCreditSec[e.mirror] = 0;
    }
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

  // Path length since the last reported contact (COLLISION_REOPEN_TRAVEL_M).
  // Accrued BEFORE the event loop, so a report arriving on this frame is judged
  // against the ground covered up to it. MAGNITUDE, not direction: the live
  // channel hands the reducer a SIGNED speed (negative in reverse, the same
  // asymmetry contact.ts documents), and backing 1 m off a car you just hit is
  // exactly the travel this measures. dt is clamped like the clean-driving
  // integrator's — a pause/resume jump (every teach card pauses the sim) must
  // not fabricate metres the car never drove and re-arm a bill with them.
  s.travelSinceContactM += (Math.abs(speed) / 3.6) * Math.min(dt, 2);

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
    // WAIT-FREEZE (2026-08-16 — the lost-credit sweep; JU-23's ledger, reused).
    // The taught order is огледало → мигач → ИЗЧАКАЙ ПРОЛУКА → маневра, and the
    // wait is the beat with no upper bound: a student holding at a stopped
    // queue's tail for a gap burns the whole 8 s window standing still, and is
    // then billed for a mirror check he made, signalled and waited on. Standing
    // time is subtracted from the glance's age exactly as the junction scan
    // subtracts it — a car that swept no ground past its mirrors did not watch
    // the road it observed go by — and capped, because a blind spot behind a
    // stationary car does fill in eventually (the junction scan is uncapped for
    // the opposite reason: the driver keeps facing the road he scanned).
    const waitFreezeSec = Math.min(s.scanStopCreditSec[dir], cfg.mirrorWaitFreezeMaxSec);
    const mirrorOk =
      lastGlance !== null && t - lastGlance - waitFreezeSec <= cfg.mirrorLookbackSec;
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

    /**
     * H-5 DIRECTION GATE, shared by OV-07 and OV-06.
     *
     * Изпреварване is a two-beat, LEFT-side manoeuvre (ЗДвП чл. 42, ал. 2):
     * swing out past the vehicle ahead, then return to your own lane. Grading a
     * bare lane-id delta charges BOTH directions with the same law, and the
     * rightward half is where correct driving lives: the change that merges you
     * back to the curb, and above all the чл. 37 duty to be in the rightmost
     * lane before turning right — with a car queued ahead, at a junction, i.e.
     * exactly inside the 35 m a crossing zone arms. That drive is textbook and
     * the engine was instant-failing it at 10 points.
     *
     * So: a LEFT change past a lead is the pull-out and grades on its own. A
     * RIGHT change grades only while it closes a pull-out this engine actually
     * saw — the return beat of a real overtake, which is how both authored
     * mistake demos commit the offence (they cut back toward the lead inside
     * the zone). No pull-out behind it ⇒ the lead was never overtaken ⇒
     * innocent, whatever the lane-id arithmetic says.
     */
    const overtakeBeat = (leadGapLimitM: number): boolean => {
      if (leadGapM === null || leadGapM > leadGapLimitM) return false; // nobody to pass
      if (dir === "left") return true;
      return (
        s.overtakePullOutAt !== null &&
        t - s.overtakePullOutAt <= cfg.overtakeManeuverWindowSec
      );
    };

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
      overtakeBeat(cfg.crossingOvertakeLeadGapM)
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
    // a ban zone overlap — two distinct laws, two distinct lessons. The H-5
    // direction gate applies verbatim: В24 bans изпреварване, and moving right
    // to line up for a turn is not изпреварване inside a ban span either.
    if (
      (legacyBasis || gradableWithEdge) &&
      tick.noOvertakeZone === true &&
      overtakeBeat(cfg.banOvertakeLeadGapM)
    ) {
      events.push(makeViolation("OVERTAKING_IN_BAN_ZONE", t));
    }

    // Arm/close the manoeuvre AFTER grading, so a pull-out never convicts
    // itself as its own return. A leftward change past a recently-sighted lead
    // opens the overtake; the matching rightward change closes it, so a second
    // tuck-in later on cannot inherit the same pull-out's guilt.
    if (dir === "left") {
      const leadSeenRecently =
        s.lastLeadNearAt !== null && t - s.lastLeadNearAt <= cfg.overtakeManeuverWindowSec;
      if (leadSeenRecently) s.overtakePullOutAt = t;
    } else {
      s.overtakePullOutAt = null;
    }
  }
  s.prevLaneId = tick.laneId;
  s.prevEdgeId = tick.edgeId;

  // -- 4. continuous detectors (sustain + hysteresis)
  const limit = tick.maxSpeedKmh;
  const bands = speedingBands(limit, cfg);
  const speedReset = speed <= limit;
  // THE TWO NUMBERS THE CONVICTION USED TO THROW AWAY. Both speeding codes hold
  // the speed and the limit at the instant they fire, and used to emit neither,
  // so every downstream surface could say only „here is чл. 182's whole table".
  // Carried as `detail` (see consequences.ts encodeSpeedMeasurement) so
  // `deriveSpeedingBand` can name the student's own rung.
  const speedDetail = encodeSpeedMeasurement(speed, limit);
  if (
    stepSustainedEpisode(
      s.speedingMinor,
      speed > bands.gradedAbove && speed <= bands.dangerousAbove,
      speedReset,
      t,
      cfg.speedingMinorSustainSec,
      cfg.speedingRearmSec,
      cfg.speedingRepeatSec,
    )
  ) {
    events.push(makeViolation("SPEEDING_OVER_LIMIT", t, { detail: speedDetail }));
  }
  if (
    stepSustainedEpisode(
      s.speedingDangerous,
      speed > bands.dangerousAbove,
      speedReset,
      t,
      cfg.speedingDangerousSustainSec,
      cfg.speedingRearmSec,
      cfg.speedingRepeatSec,
    )
  ) {
    events.push(makeViolation("SPEEDING_DANGEROUS", t, { detail: speedDetail }));
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

  // PAINT REFERENT (doc 86 T1 — the fix that repairs 90 scenarios at once).
  // `CROSSED_SOLID_LINE` above is gated on `tick.solidCenterLine` because a
  // solid осева is authored data; these three codes graded the SAME piece of
  // road with no such question, so a district whose class the marking pass
  // skips convicted a student of stepping on a line the world never drew, and
  // of failing to keep a lane it never painted. The runtime answers from the
  // builder's own predicate + its own junction trim (runtime/spatial.ts
  // laneMarkingAt), so paint and grading cannot drift; an ABSENT field is
  // "caller cannot answer" and leaves the detector armed exactly as shipped.
  const centreLinePainted = tick.centreLinePainted !== false;
  const laneLinesPainted = tick.laneLinesPainted !== false;

  // SPAWN-POSE LATCH (doc 87 B23/B26/B33 — the four-of-four false pause).
  // The two positional codes below grade a DEPARTURE from the lane. A car the
  // lesson placed astride the осева never departed from anything: it was put
  // there, and driving straight ahead at the taught speed is the only thing the
  // student did. So they arm from the first frame he is actually inside his
  // lane, and until then this piece of road is ungraded. Everything else about
  // the drive still grades — speed, signals, priority, the crossing chain —
  // and the moment the compiled spawn moves to the lane centre (the data half
  // of the same defect, another lane's file) the latch is satisfied on frame 0
  // and these detectors are byte-identical to shipped.
  if (Math.abs(tick.laneOffsetM) <= cfg.laneKeepMaxOffsetM) s.inLaneSeen = true;

  // Center-line touch (SN-03/OV-04 — „настъпване на осева линия"): sustained
  // ride on/over the center line toward ONCOMING traffic. Armed only on
  // POSITIVE evidence: the world PAINTS an осева here, the runtime says the
  // edge is two-way (oneway === false) and the vehicle is in the leftmost lane
  // of its direction with the offset toward the center. A declared maneuver
  // (any indicator — announced overtake/dodge or return) is exempt, as is
  // reverse maneuvering (A12). When this specific condition is armed the
  // GENERIC lane-keeping episode is suppressed — one act, one code, no
  // double-billing.
  //
  // THE STALK IS AN EDGE, NOT A LEVEL (2026-08-16 — the lost-credit sweep, the
  // B21-RB mechanism again). `tick.indicator === "off"` asked whether the lamp
  // is lit ON THIS FRAME, and the lamp is not the student's to keep lit:
  // CabinControls.update auto-cancels at ARM 0.22 → RELEASE 0.05 rad, and
  // squeezing past a parked obstacle at 15 km/h exceeds 0.22 rad — so the stalk
  // extinguishes in the middle of the manoeuvre, while the car is still riding
  // the осева, and `centerLineSustainSec` (3.5 s) then starts counting on a
  // driver who DID declare. The exemption now uses the same lookback every
  // other indicator gate in this engine uses (`indicatorLookbackSec`, 5 s,
  // whose own doc says the thing that extinguishes the signal is usually not
  // the student). A lit stalk is `t - lastOn === 0`, so a signalled frame is
  // byte-identical; what changes is only the 5 s tail behind it, after which an
  // undeclared ride on the line arms and bills exactly as shipped.
  const declaredAt = Math.max(
    s.lastIndicatorOnAt.left ?? Number.NEGATIVE_INFINITY,
    s.lastIndicatorOnAt.right ?? Number.NEGATIVE_INFINITY,
  );
  const maneuverDeclared = t - declaredAt <= cfg.indicatorLookbackSec;
  const centerLineCond =
    centreLinePainted &&
    s.inLaneSeen &&
    tick.oneway === false &&
    tick.laneId === (tick.laneCount ?? 1) - 1 &&
    tick.laneOffsetM > cfg.laneKeepMaxOffsetM &&
    !maneuverDeclared &&
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
  // forward, ON A ROAD THAT HAS A PAINTED LANE. Reverse maneuvering
  // (bay/parallel parking) is legitimately off-centre and exempt (A12). The
  // paint gate arms the episode only; the RESET stays purely positional, so an
  // excursion that began on marked asphalt still clears the moment the car is
  // back inside its lane.
  const offCentre = Math.abs(tick.laneOffsetM) > cfg.laneKeepMaxOffsetM;
  if (
    stepEpisode(
      s.laneKeeping,
      laneLinesPainted &&
        s.inLaneSeen &&
        offCentre &&
        moving &&
        forwardGear &&
        !centerLineCond &&
        !solidCrossExcursion,
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
    conditionsReduced && moving && speed > conditionLimit && speed <= bands.gradedAbove;
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

  // FO-08 — CLOSING ON THE LEAD (config-gated per-lesson drill; see the
  // RuleEngineConfig block for the measurement that produced it).
  //
  // The detector above is muted below `followMinSpeedKmh` so a queue rolling in
  // formation is not spammed, and „Дистанция при спиране в колона" is driven
  // entirely inside that mute: at its own nominal 19.9 km/h the recorded run
  // eats 27.5 m of gap down to zero and grades NOTHING. This is the missing
  // half, and it swaps the SPEED gate for the discriminator the speed gate was
  // standing in for:
  //
  //   the gap is genuinely COLLAPSING (≥ leadClosingMinRateMps) — a queue in
  //   formation holds its gap and a faster car ahead opens it, so neither can
  //   ever arm this — AND it has already fallen under the FULL taught time-gap.
  //
  // No grace ratio here, deliberately: `followFireRatio` exists so a steady
  // 1.3 s of urban flow is not billed as tailgating, and a gap that is steady
  // is exactly the case this code excludes. What is left is „you are under the
  // taught distance AND still eating it", which needs no further tolerance —
  // and it fires while the student can still stop, which a 0.7 × line would
  // not.
  //
  // NO DOUBLE BILL, structurally: this code is armed ONLY BELOW
  // `followMinSpeedKmh`, i.e. in exactly the band the base основна is muted in.
  // Above the floor the same act is already FOLLOWING_TOO_CLOSE and this stays
  // silent — measured: a 25 km/h run used to collect BOTH (closing at t=14.3,
  // then tailgating at t=16.6 — six points for one act) and now collects only
  // the base code, unchanged from before this detector existed.
  const leadClosingMps = -gapOpeningMps;
  const closingOnLead =
    cfg.leadClosingEnabled &&
    moving &&
    forwardGear &&
    speed < cfg.followMinSpeedKmh &&
    leadGapM !== null &&
    leadClosingMps >= cfg.leadClosingMinRateMps &&
    leadGapM < safeGapM;
  if (
    stepEpisode(s.leadClosing, closingOnLead, !closingOnLead, t, cfg.leadClosingSustainSec)
  ) {
    events.push(makeViolation("CLOSING_ON_LEAD_TOO_FAST", t));
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
  //
  // ONE RUN, ONE BILL (2026-08-17 — see WRONG_WAY_REARM_SEC). The episode is
  // stepped with the M-16 hysteresis and NO repeat cadence: the driver has to
  // hold the lawful direction for the re-arm before a second run can be
  // charged, so a heading signal that flickers at crawl speed cannot turn one
  // stretch of road into five 10-point опасни.
  const goingWrongWay = tick.wrongWay === true && moving && forwardGear;
  if (
    stepSustainedEpisode(
      s.wrongWay,
      goingWrongWay,
      !goingWrongWay,
      t,
      cfg.wrongWaySustainSec,
      WRONG_WAY_REARM_SEC,
      0,
    )
  ) {
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
  // PAINT REFERENT (doc 86 T1): «дясната пътна лента» is a painted object. On a
  // carriageway the world draws no divider on, there is no rightmost lane to be
  // out of — the lane id is a procedural band, not something the student can
  // see — so the code stands down exactly as CENTER_LINE_TOUCHED does above.
  //
  // NOT FIXED HERE — the overtake this code cannot see (2026-08-16, the
  // lost-credit sweep; the measurement, so the next reader does not re-derive
  // it). The escape below is a LIT left stalk read as a LEVEL, and correct
  // practice extinguishes it — you cancel once established in the left lane,
  // and CabinControls cancels it for you at ARM 0.22 rad on the way out — while
  // passing a truck at a 10 km/h differential takes ~18 s against a 12 s
  // sustain. Both repairs are one line each (`s.overtakePullOutAt`, already
  // tracked for H-5; or the `indicatorLookbackSec` treatment CENTER_LINE_TOUCHED
  // gets above) and BOTH silence a shipped mistake demo: driven through the
  // production stack, `sc-ln-boulevard-discipline / mistake-left-lane-hog` pulls
  // out at t=5.1 past a lead 37.7 m ahead, stops at t=21.7 and is convicted at
  // t=17.1 — 4.6 s of slack against the overtake window, 3.2 s against the
  // indicator lookback. With the telemetry that exists, a genuine 18 s pass and
  // that 16.6 s stint are the SAME SIGNAL (the passed vehicle leaves `leadGapM`
  // the instant you change lane, in both), so no threshold separates them: the
  // demo has to hog for longer before the rule can be widened, and that is a
  // trace/content edit, not this file's.
  const rightmostRequiredLane =
    tick.busLaneRight === true || tick.emergencyLaneRight === true ? 1 : 0;
  const hoggingLeft =
    laneLinesPainted &&
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
  // minimum (чл. 55, ал. 1 sets a > 70 km/h condition on the VEHICLE, not on
  // the driver); the graded duty is чл. 22, ал. 1 „без основателна причина…
  // пречи", the 50 km/h floor below is an authored detection line and not a
  // legal one, and the graded fault is the SUSTAINED CAUSELESS crawl (the
  // mobile chicane), never
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
  // THE MOTORWAY GATE, added 2026-08-09 with the Наредба № 38 re-grounding of
  // EMERGENCY_LANE_DRIVING (see rules/n38.ts). The cited article opens with its
  // own condition — „Чл. 58. ПРИ ДВИЖЕНИЕ ПО АВТОМАГИСТРАЛА на водача е
  // забранено: … 4. … да се движи … в лентата за принудително спиране" — and
  // the detector armed on an authored `emergencyLane` span ALONE. All three
  // spans that exist today (mw-v1, mw-entry-v1, mw-exit-v1) sit on
  // `motorway: true` edges, so this is byte-identical on shipped content; what
  // it forbids is the future case where the span is authored on an urban
  // street and a 10-point charge fires citing a motorway-only article. The
  // 10 rests on the lane's LEGAL PURPOSE (see n38.ts), and that purpose is a
  // motorway fact — so the arming condition and the citation are now the same
  // road, by construction rather than by authoring luck.
  const inEmergencyLane =
    tick.emergencyLaneRight === true && tick.laneId === 0 && tick.motorway === true;
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
  // ACCRUED, NOT CONSECUTIVE (2026-08-17 — see `stepAccruedEpisode`). The gates
  // above are unchanged; what changed is that the 4 s no longer has to be one
  // unbroken run. THE STOP-START CRAWL IS THE FAULT'S OWN SHAPE — `pc-right` on
  // `sc-mw-min-speed` creeps 0→11→0 km/h for 205 s with 28 full stops, and the
  // old clock was reset by every one of those stops (`moving` false) and by
  // every launch (|a| above the steady band), so the lesson whose entire subject
  // is „не пълзи" booked Опасни 0 / Основни 0 / Второстепенни 0. Only the
  // plateau at the top of each creep qualifies, and now those plateaus add up.
  const crawlStep = stepAccruedEpisode(
    s.motorwaySlow,
    s.motorwayCrawlSec,
    motorwayCrawl,
    tick.motorway !== true || speed >= cfg.motorwayMinFlowKmh,
    t,
    dt,
    cfg.motorwaySlowSustainSec,
  );
  s.motorwayCrawlSec = crawlStep.accruedSec;
  if (crawlStep.fired) {
    events.push(makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", t));
  }

  // Emergency-lane driving (чл. 58, т. 4 „да се движи… в лентата за принудително
  // спиране"; т. 3 is the STOPPING permission — MOTORWAY-SEGMENT slice): sustained
  // travel in the CURB lane of an authored emergencyLane span
  // (tick.emergencyLaneRight — data, never a heuristic). The legal sides:
  //  - deliberately NO indicator exemption (contrast DRIVING_IN_BUS_LANE): a
  //    signalled undertake through the emergency lane is still the fault —
  //    crossing it is not a legal maneuver the way the bus-lane right turn is;
  //  - the ONE legal use, the breakdown pull-off, is protected structurally:
  //    firm braking toward a stop pauses the clock, and the STOP itself never
  //    grades here (v ≤ movingSpeedKmh disarms — stopping is descoped);
  //  - a degenerate span on a single-lane road never convicts (laneCount > 1
  //    — the busLane guard, mirrored), reverse maneuvering is exempt;
  //  - 2026-08-09: the span must ALSO be on an authored motorway edge — the
  //    cited article is expressly conditioned on „при движение по
  //    автомагистрала" (see `inEmergencyLane` above and rules/n38.ts).
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
  //
  // …BUT YOU HAVE TO HAVE DRIVEN ONTO IT (2026-08-17 — the catalogue sweep).
  // The two ENTRY cases above already refuse to grade a band the car never
  // approached, because „a vehicle materialising ON the band (spawn/teleport)
  // is structurally innocent" — and this case, which is the same claim about
  // the same band, carried no such gate. `sc-pk-rail-ban / pc-right` is what
  // that costs: at t=117 s the card «ОПАСНА ГРЕШКА −10 изпитни т. — Нарушение
  // на правилата за жп прелез» fires while the car sits at 0 км/ч on an empty
  // street with no rails, no barrier and no А34 anywhere in the frame, and that
  // single 10 is the WHOLE of the correct drive's debrief (1 опасна грешка,
  // НЕИЗДЪРЖАН). A student is failed for a rule at a place the world does not
  // show. Sharing the entry gate credits nobody who actually drove onto a
  // crossing: the runtime reports "approach" before "on" for every real one
  // (every RX-03 fixture in `rail-crossing-detectors.test.ts` opens that way,
  // one of them titled „after a CORRECT entry"), and the latch is only cleared
  // by leaving the crossing entirely.
  const restingOnRail =
    railPhase === "on" &&
    s.rail.approachSeen &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    forwardGear;
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
  //
  // THE BLOCKED EXIT (2026-08-16 — the lost-credit sweep). „Box clear" was one
  // bumper distance, 12 m, and the queue that makes a junction unclearable
  // stands on the FAR side of it: on the shipped correct demonstration of
  // `sc-jx-blocked-exit` the tail sits 56.4 m out and the engine convicted the
  // refusal to enter after 5.0 s (violation:HESITATION_AT_GREEN@t=17.5, graded
  // with DEFAULT_RULE_CONFIG). The drill only survives on a per-template
  // `hesitationClearGapM: 63`, which no other scenario and no exam spec carries
  // — so on the exam the чл. 50 duty the product teaches was a graded fault.
  // The wider gate is deliberately paired with a MOTION test rather than being
  // widened alone: standing traffic ahead means the exit is not there to be
  // reached; traffic that is opening the gap will clear it, and waiting behind
  // THAT is the hesitation this code exists for. `followRecoveryRateMps` is the
  // engine's existing „this gap is opening" line, reused so the two detectors
  // cannot disagree about what a departing lead looks like.
  const exitQueued =
    leadGapM !== null &&
    leadGapM <= cfg.hesitationQueueGapM &&
    gapOpeningMps < cfg.followRecoveryRateMps;
  const hesitating =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState === "green" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.hesitationMaxLineDistM &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    tick.indicator === "off" &&
    (leadGapM === null || leadGapM > cfg.hesitationClearGapM) &&
    !exitQueued &&
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
    s.leadClosing,
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
      // Б1 „Пропусни движението" (give-way) — ЗДвП чл. 50: yielding to priority
      // traffic is the duty, NOT a full stop. „Пълно спиране при Б1 се налага
      // само когато иначе би ги засякъл" (content bank q-krastovishta-006 /
      // concept c-give-way-stop-behavior), so crossing a give-way line demands
      // no FULL STOP here — rolling through a clear Б1 mouth is zero violations
      // on the full-stop axis, and a full stop at it is equally legal. The
      // failure-to-yield case is adjudicated by the world's conflict-query
      // pipeline (conflictNear) and delivered as a SEPARATE prioritySituation
      // {situation:"give-way"} event → FAILED_TO_YIELD (detail "give-way").
      //
      // JU-23 „един поглед не стига" — the junction-scan lookback (config-gated
      // per-lesson drill; SHIPPED OFF, so the A12 whole-commute stays innocent).
      // The FRESH ляво-дясно scan applies to a Б1 give-way line JUST AS to a Б2
      // stop line: you cannot yield to (or cross) priority traffic you never
      // looked for — the observation quality is the crux of the Б1 lesson, not a
      // Б2-only demand. A left AND a right glance must each fall in the lookback.
      // Wait-freeze (founder R3 #13): stopped time since a side's glance does
      // not age it — the driver who scanned at the mouth and then WAITED for
      // the priority car still crossed with a valid scan. Only MOVING time
      // counts against the lookback (mouth-to-mouth freshness preserved).
      const scanIncomplete = (): boolean => {
        if (!cfg.junctionScanObservationEnabled) return false;
        const lg = s.lastGlanceAt.left;
        const rg = s.lastGlanceAt.right;
        const scanned =
          lg !== null &&
          t - lg - s.scanStopCreditSec.left <= cfg.junctionScanLookbackSec &&
          rg !== null &&
          t - rg - s.scanStopCreditSec.right <= cfg.junctionScanLookbackSec;
        return !scanned;
      };
      if (e.control === "giveWay") {
        // Б1: no full-stop grade; the scan-observation fault still applies —
        // and it names Б1, not Б2. The catalogue string is control-neutral (see
        // its comment); this is the branch that puts the right sign on the card.
        if (scanIncomplete()) {
          out.push(makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.giveWay));
        }
        break;
      }
      // Б2 stop sign: a qualifying full stop must have ended recently. The scan
      // grade follows the full-stop grade (order preserved for existing gates) —
      // it is a DISTINCT fault (a rolling stop can also skip the scan).
      const last = s.stop.lastQualifyingStopAt;
      const stopped = last !== null && t - last <= cfg.stopRecencySec;
      out.push(
        stopped
          ? makeCommendation("FULL_STOP_AT_STOP_SIGN", t)
          : makeViolation("STOP_SIGN_NO_FULL_STOP", t),
      );
      if (scanIncomplete()) {
        out.push(makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.stop));
      }
      break;
    }

    case "turnStarted": {
      const lastOn = s.lastIndicatorOnAt[e.direction];
      const ok = lastOn !== null && t - lastOn <= cfg.indicatorLookbackSec;
      if (!ok) out.push(makeViolation("TURN_WITHOUT_INDICATOR", t));
      // M-17a — OBSERVATION. A turn carries the same чл. 25, ал. 1 duty as a
      // lane change (the mirror on the side you are swinging toward), and the
      // lane-change path has graded it since v1 while the turn path graded
      // only the signal. Config-gated OFF like every other observation check
      // (moveOff, junctionScan): the glance channel is authored per lesson,
      // and a lesson that does not feed it must never be billed for silence.
      if (cfg.turnObservationEnabled) {
        const lastGlance = s.lastGlanceAt[e.direction];
        const observed = lastGlance !== null && t - lastGlance <= cfg.mirrorLookbackSec;
        if (!observed) out.push(makeViolation("TURN_WITHOUT_OBSERVATION", t));
      }
      // M-17b — LANE INTENT. The М10 arrow of the approach lane either permits
      // this direction or forbids it; no arrow (or one the runtime cannot read
      // as a direction set) permits everything — absent = no marking =
      // innocent, the zone-data discipline. Reverse maneuvering is exempt for
      // the same reason it is exempt from the lane detectors: backing out of a
      // bay is not a turn out of a lane. The memory is SPENT here either way,
      // so an approach can convict at most the junction it led into.
      const arrowSeen = s.lastLaneArrow;
      s.lastLaneArrow = null;
      if (
        tick.gear >= 0 &&
        arrowSeen !== null &&
        t - arrowSeen.t <= cfg.laneArrowMemorySec &&
        !arrowPermits(arrowSeen.arrow, e.direction)
      ) {
        out.push(makeViolation("WRONG_LANE_FOR_DIRECTION", t));
      }
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
      // HOST-EDGE GATE (audit H-6). The act this case grades is DRIVING OVER
      // THE PAINT, so the car has to be on the road the paint is on. The zone
      // that produced this event, though, arms from the host edge AND every
      // edge sharing a node with it, and the pass test that follows carries a
      // 22 m lateral budget (the outer lane of a 6-lane arterial) — together
      // they hand us passes for the SIDE streets' zebras, up to ~20 m away. On
      // the live lesson/exam preset (20 pedestrians over 51 crossings) one of
      // those is near-certainly occupied, so the опасна that ENDS the exam
      // fires for a crossing the student drove correctly past.
      //
      // A mismatch between the crossing's host segment and the car's own means
      // we were near the crossing, not at it: nothing happened here. No опасна,
      // and no commendation either — you cannot be praised for yielding at a
      // zebra you never reached. The zone still closes below (it is behind us
      // geometrically), exactly as a graded pass would close it.
      //
      // Only an affirmative, comparable mismatch suppresses: a source that does
      // not name host edges, or a tick whose road fix is unknown, grades
      // byte-identically to before. Deliberately strict about WHICH edge —
      // crossings sit mid-edge, away from the node, so the locator is committed
      // to the host edge by the time the paint passes under the axle, and the
      // residual corner case costs a missed conviction. That is the cheap
      // direction (A12); the expensive one was failing correct driving.
      const offHostEdge =
        typeof e.hostEdgeId === "string" &&
        typeof tick.edgeId === "string" &&
        tick.edgeId !== e.hostEdgeId;
      if (offHostEdge) {
        if (z !== null) s.crossing = null;
        break;
      }
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

    case "crossingZoneExited": {
      // The zone's OTHER closing bracket (audit H-5): the driver turned away
      // instead of crossing, so no crossingPassed will ever arrive. Nothing to
      // grade — declining to cross a zebra is not an act — but the state MUST
      // close, or the armed zone follows the car for the rest of the session and
      // the overtake ban keeps grading kilometres from any crossing.
      // Id-matched: a stale exit for a zone we are no longer tracking must not
      // clear the one we just entered.
      if (s.crossing !== null && s.crossing.crossingId === e.crossingId) s.crossing = null;
      break;
    }

    case "collision": {
      // ONE ENCOUNTER, ONE ACCIDENT — and the definition is the whole rule:
      //
      //   an encounter OPENS on the first reported contact and stays open for
      //   as long as contact keeps being reported; it CLOSES only once BOTH
      //   `collisionSeparationSec` has passed with nothing reported at all AND
      //   the car has driven `COLLISION_REOPEN_TRAVEL_M` since the last report
      //   — the bodies have come apart. The report that opens an encounter is
      //   billed; every report inside one is the same accident, still happening.
      //
      // Contact is a STATE that persists across frames. What the fault sheet
      // convicts is an EVENT: a crash. The state has to be converted into
      // events somewhere, and here is the only place every source funnels
      // through (live physics, the trace recorder's obstacle channel, the
      // orchestrator's contact sentinel).
      //
      // «THE BODIES HAVE COME APART» IS A CLAIM ABOUT GEOMETRY, AND THIS
      // REDUCER HAS NONE (B83). It sees events, not poses, so the silence half
      // of the sentence above is only true if every reporter treats contact as
      // a STATE and keeps reporting for as long as the bodies are together.
      // That was left as a CONTRACT ON THE REPORTERS, and a contract is
      // exactly what the 2026-08-16 catalogue sweep broke again: 49 bills on
      // `sc-follow-standstill`, 42 on `sc-ov-abort` (189 s of them, on a car
      // photographed at 0 км/ч), 25 on `sc-ov-return-gap`, 14 on
      // `sc-ov-oncoming-gap` — and 8 on mobile against 1 on desktop for the
      // same script, because a reporter's cadence is a property of the DEVICE
      // and the bill was riding on it. So the reducer now also checks the half
      // it CAN check without geometry: the car has to have gone somewhere
      // (COLLISION_REOPEN_TRAVEL_M — its comment carries the argument and the
      // measurement). Silence alone no longer re-arms anything.
      //
      // The contract is still stated, and still owed, because the travel gate
      // only stops a false SECOND bill — a reporter that stays wrongly silent
      // is still the difference between one accident and none. It was once
      // silently broken and the shape is worth keeping in view: the orchestrator's
      // sentinel gated its report on closing speed, so it fell silent when the
      // DRIVER STOPPED — which is what a shaken student does after hitting
      // something. Driven on sc-follow-brake: nose into the standing lead,
      // hold the brake 0.95 s, ease forward 0.6 m still embedded in it, and
      // this billed TWO пътнотранспортни произшествия, 20 наказателни точки,
      // for one crash in which the cars never separated — 260 frames of
      // unbroken overlap of which only the 83 the driver was moving through
      // were ever reported, and a boundary pinned to the single 16.7 ms frame
      // that carried the silence past `collisionSeparationSec`.
      // The fix is in contact.ts, where the geometry is: the nudge floor now
      // gates only the OPENING of an encounter and the report stops on the
      // frame the measured separation says the bodies are clear. All three
      // reporters now honour the contract — rapier's shell pool re-fires a
      // sustained contact at 2 Hz whether or not the car is moving, and the
      // recorder's obstacle channel latches per rect and re-arms only on
      // separation, so neither can manufacture a false silence either.
      //
      // Both halves are load-bearing and each defends a real drive:
      //  · a student who scrapes along a wall for four seconds has had ONE
      //    accident, so a continuing report must not re-bill. The old rule —
      //    a 3 s rate limit — billed that scrape twice, and billed a car left
      //    resting against a bumper 10 points every 3 s indefinitely (measured:
      //    14 bills / 140 points over 40 s, with the crash-pin rescue disarmed
      //    by its own re-arming, so the drive could not end either);
      //  · a student who hits a car, reverses, and hits it again has had TWO,
      //    so separation must re-arm. The old rule missed that: two impacts
      //    1 s apart, with a metre of daylight between them, billed once.
      //    The travel gate is written to that case and not against it: that
      //    test's own frames integrate to 4.4 m, 2.2× the 2 m floor.
      //
      // Deliberately NOT keyed by which body was hit: the live channel is told
      // only the CATEGORY (`withWhat`) — the NPC shells that carry identity are
      // a rebinding pool, so an id would churn under the latch — and two
      // different cars struck inside the window therefore read as one
      // encounter. That errs innocent (A12), which is the cheap direction here.
      // Plumbing a stable actor id through `pushCollision` is the honest fix
      // and is listed, not attempted, because that wire runs through
      // LessonScene.
      const last = s.lastCollisionContactAt;
      const cameApart =
        last === null ||
        (t - last > cfg.collisionSeparationSec &&
          s.travelSinceContactM >= COLLISION_REOPEN_TRAVEL_M);
      s.lastCollisionContactAt = t;
      s.travelSinceContactM = 0;
      if (!cameApart) break;
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
