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
 *  - A ONE-SWITCH DUTY (belt, handbrake, the four lamp arms) that is STILL
 *    breached ten driving seconds after the student was shown it is billed
 *    once more, and then never again (STANDING_DUTY_REGRADE_SEC /
 *    STANDING_DUTY_MAX_BILLS). One bill per episode was the whole reason a
 *    lesson driven end-to-end unlit could reach its debrief as «чисто каране»:
 *    the single bill was spent on the teach-first free mini-lesson and the
 *    reducer never asked a second time. Two bills — the teach and the grade —
 *    is what the официален изпитен лист prices the offence at — and it is
 *    charged ONCE: the re-bill carries `regrade`, and `lessons/engine.ts` drops
 *    it when the code has already been charged (exam mode, a repeat offence, a
 *    grade-on-sight policy), so one continuous breach can never cost twice.
 *  - THE SAME RE-GRADE NOW COVERS THE TWO SECOND-DEGREE SPEED CODES
 *    (SPEED_REGRADE_SEC, six seconds — the derivation is at the constant): an
 *    overspeed still running after the card, and a speed still too fast for the
 *    rain/fog/snow/night envelope after the card, are billed once more. Without it a
 *    59-in-a-50 drive shorter than the 20 s `speedingRepeatSec` cadence — which
 *    is most of the catalogue's lessons — reached its debrief on «Второстепенни
 *    0 0 · ИЗДЪРЖАН · +100 XP», and the conditions code, which has no cadence at
 *    all, was free at any length. Same `regrade` discipline, same drop.
 *  - AND THE MOTORWAY CRAWL, the third and last code in that family
 *    (MOTORWAY_CRAWL_REGRADE_SEC). Its clock counts QUALIFYING seconds rather
 *    than wall seconds, so a student who answers the card by accelerating —
 *    which by construction stops the frames qualifying — never meets the second
 *    bill; one who keeps crawling steadily does. Same `regrade`, same drop.
 *  - AND THE EXCURSION OFF THE CARRIAGEWAY (OFF_CARRIAGEWAY_REGRADE_SEC). Its
 *    single bill per excursion was spent on the teach card, so a student who
 *    drove off the road and never came back reached his debrief charged NOTHING
 *    for it while the HUD had named the offence. Eight continuous seconds off
 *    the asphalt bills once more; steering back zeroes both clocks.
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

import {
  HANDBRAKE_ACT_MOVE_OFF_ATTEMPT,
  HEADLIGHTS_CONDITION_SNOW,
  JUNCTION_SCAN_CONTROL_GIVE_WAY,
  JUNCTION_SCAN_CONTROL_STOP,
  makeCommendation,
  makeViolation,
  NEEDLESS_STOP_ACT_PRIORITY_ROAD,
  SOLID_CROSS_ACT_ASTRIDE,
  SOLID_CROSS_ACT_ASTRIDE_OWN_WAY,
  SOLID_CROSS_ACT_OWN_WAY,
  SOLID_CROSS_ACT_UTURN,
  WRONG_WAY_ROAD_MOTORWAY,
} from "./catalog";
import { encodeSpeedMeasurement } from "./consequences";
import { BRAKING_LINE_MPS2, HARSH_BRAKE_TIE_TOLERANCE, isHarshBrakeWindow } from "./harshBrakeEpisode";
import {
  type ActAmendment,
  DEFAULT_RULE_CONFIG,
  KEEP_RIGHT_TOWN_MAX_KMH,
  type LaneArrow,
  type GlanceKind,
  type RuleEngineConfig,
  type RuleEvent,
  type SignBoundArrival,
  type SimTick,
  type SimTickEvent,
  type TurnDirection,
  type ViolationCode,
  type ViolationEvent,
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
  /**
   * How many times THIS episode has billed (stepSustainedEpisode only; zeroed
   * by the same reset that re-arms it). Read solely by the `maxBills` ceiling
   * — see `STANDING_DUTY_MAX_BILLS`. The two speeding calls pass no ceiling
   * and are unaffected by it, so their behaviour is byte-identical.
   */
  bills: number;
  /**
   * ACCRUED qualifying seconds and the frame they were last credited on —
   * written ONLY by the steppers' `accrue` arm (see `SPEEDING_SUSTAIN_ACCRUES`)
   * and therefore always 0 / null for every detector that does not opt in.
   */
  qualifiedSec: number;
  lastQualAt: number | null;
}

/**
 * WHICH BODY WAS HIT, at the FINEST resolution the reporter offered.
 *
 * A reporter that knows which body it struck stamps `actorId` and gets its own
 * episode; one that only knows the CATEGORY (the live rapier channel, whose NPC
 * shells are a rebinding pool and so have no stable id) falls back to the
 * category, byte-identically to the shipped per-kind behaviour. The fallback
 * half is derived from the event rather than restated, so a fifth kind added
 * there becomes a fifth fallback key here and cannot silently share a latch
 * with a fourth.
 *
 * Prefixed so a future actor literally named "vehicle" can never collide with
 * the category fallback of the same name.
 */
function contactKey(e: Extract<SimTickEvent, { kind: "collision" }>): string {
  return e.actorId === undefined ? `kind:${e.withWhat}` : `actor:${e.actorId}`;
}

/** One open contact encounter with one body — see the `collision` case. */
interface ContactEpisode {
  /** When contact with this body was last REPORTED. */
  at: number;
  /** `contactOdometerM` at that report — the baseline the 2 m floor measures from. */
  odoM: number;
  /**
   * `contactReverseOdometerM` at that report — the baseline the BACKED-OUT test
   * measures from, for the bodies the lead-gap channel cannot speak for. See
   * `CONTACT_REVERSE_TRAVEL_M`.
   */
  reverseOdoM: number;
  /**
   * The body's CATEGORY, carried so an ANONYMOUS report can be matched against
   * this episode. Without it a channel that cannot name what it hit would open
   * a second episode alongside a named one for the same body and bill the same
   * crash twice — see the `collision` case's mixed-resolution paragraph.
   */
  withWhat: Extract<SimTickEvent, { kind: "collision" }>["withWhat"];
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
    /**
     * `forced` (sc-ac-wind-truck-pass:ff1d4290 round 2): this lane change is
     * the entry of a BILLED cut-in — it put him in front of a vehicle that had
     * to brake hard — so it is graded for its indicator and its mirror as
     * before but is never COMMENDED: «…в правилния ред и навреме. Отлично.» is
     * false of a lane change the vehicle behind had to brake hard for. Absent
     * on every lane change that was not one.
     */
    pending: Array<{ t: number; dir: TurnDirection; indicatorOk: boolean; mirrorOk: boolean; forced?: true }>;
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
  /**
   * A SECOND, LONGER speed window — the one the motorway crawl's „is this a
   * transition or a chicane" question is answered over. Trimmed to
   * `motorwaySlowSteadyMeanWindowSec`.
   *
   * WHY IT CANNOT SHARE `speedWindow`. That window is sized by
   * `accelWindowSec` (0.04 s), and that number is set by the HARSH-BRAKE
   * conviction — a 7 m/s² signal held 0.4 s, where smoothing is lag and
   * 0.15 s already silences two authored panic-brake demos (see the default's
   * note in types.ts). The crawl's steadiness gate is the opposite kind of
   * measurement: a 0.5 m/s² band, i.e. a SMALL-signal question asked of a
   * derivative tuned for a large-signal one. types.ts's own arithmetic puts
   * the residual noise of that derivative at ~0.42 m/s² at 120 fps — 84 % of
   * the band — before any real pedal movement is added. One derivative cannot
   * serve both, so the crawl gate gets its own averaging length.
   */
  crawlSpeedWindow: Array<{ t: number; speedKmh: number }>;
  /** Previous frame's lead gap (null = none reported) — cut-in recovery (A12). */
  prevLeadGapM: number | null;
  /**
   * THE LEAD TRACK — the harsh-brake cause ledger's RATE-FREE view of the lead
   * (`sc-follow-tailgater:f42dce4f`). One sample per frame while the gap channel
   * reports a vehicle: the frame's time, `leadOdoM` and the gap. Trimmed to
   * `2 × LEAD_TRACK_WINDOW_SEC` with the newest sample older than that kept as
   * the anchor (the `stepSpeedWindow` discipline). A BLINK IS NOT AN ABSENCE
   * (round 2, 2026-10-03): a null frame no more than `LEAD_TRACK_WINDOW_SEC`
   * after the last reading is bridged and the track kept; it is emptied only by
   * a silence longer than that, a re-stage of the car, or a gap discontinuity
   * the motion cannot explain (`stepLeadTrack`), so a derivative is never taken
   * across two different leads. Entries are pushed and shifted, never mutated,
   * so cloneState's shallow copy is enough. See `leadTrackAt` and the cause
   * ledger above `causelessBraking`.
   */
  leadTrack: Array<{ t: number; odoM: number; gapM: number; sM?: number }>;
  /**
   * The cause ledger's MEMORY of the lead (round 2, `sc-follow-tailgater:63c0c28c`
   * R1). `enteredAt`: the last time a lead within `harshBrakeSignalCauseM`
   * newly ENTERED the corridor (first sight, back after a silence longer than
   * the window, or a nearer car in place of the old one — a car pulling out
   * ahead). `brakingAt`: the last frame a lead within that reach read braking at
   * the braking line. `demandAt`: the last frame a lead's closing demanded
   * `LEAD_DEMAND_LINE_MPS2`. `heldCause`: the lead-cause verdict of the last
   * frame the lead was actually in the channel, which a bridged blink reuses.
   * `nullSinceReading` (round 3, verifier C1): the channel has reported nobody
   * on at least one frame since the last reading — what makes a long hole
   * before the next reading a SILENCE (a fresh track) rather than one long
   * frame of a coarse fixture feed.
   * THE FAR MEMORIES (round 4, integrator ruling: beyond the reach restore
   * base-like acquittal). Read only while the ledger's lead is beyond it or absent, so nothing of
   * them reaches a lead inside the reach, where rounds 1–3 stand exactly:
   * `farEnteredAt` — a lead ENTERED the corridor (the same three ways as
   * `enteredAt`, at any range — within the reach `enteredAt` already says it);
   * `farBrakingAt` — a lead beyond the reach read braking at the line on its
   * quick reading; `farClosingAt` — a lead
   * beyond the reach closed at `harshBrakeClosingLeadMps` or more (round 5: the
   * closing NOW, `leadClosingNowMps`, not the window's mean). Plain numbers/booleans — cloneState copies the object.
   */
  leadMemory: {
    enteredAt: number | null;
    brakingAt: number | null;
    demandAt: number | null;
    heldCause: boolean;
    nullSinceReading: boolean;
    farEnteredAt: number | null;
    farBrakingAt: number | null;
    farClosingAt: number | null;
  };
  /**
   * Forward path length, metres, integrated by the TRAPEZOID of consecutive
   * speed readings (`min(dt, 2)`, the contact odometer's pause clamp). Not the
   * contact odometer: that one is a right-endpoint sum, which under a 9 m/s²
   * stop at 2.5 Hz understates each frame by a·dt²/2 = 0.75 m and would read a
   * steady lead as one braking at ~3.8 m/s² on the student's own brake onset.
   * The trapezoid is exact for the piecewise-linear speed a constant pedal
   * produces; measured against the positions in w71/w69's road records it
   * agrees to 0.66 m over a whole drive. Read ONLY by the lead track.
   */
  leadOdoM: number;
  /**
   * The student's travel BY HIS POSITIONS, metres (round 5) — the distance his
   * `position` moved each frame, or the trapezoid's increment on a frame where
   * that displacement cannot be his motion (a teleport, a fixture that never
   * moves him). Stored on each lead-track sample as `sM` and read ONLY by
   * `leadClosingNowMps`: the trapezoid `leadOdoM` misses the peak of a speed
   * that rises until the pedal and falls after it (up to 0.2 m on a 2.5 Hz frame),
   * which the lead's position then carries as a step and a three-sample speed
   * reads as the lead slowing by up to 0.8 m/s for the next 0.8 s.
   */
  leadPosOdoM: number;
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
  /** Keyed by `GlanceKind`, i.e. the three mirrors AND the blind-spot check —
   *  they are different acts and the move-off discharge needs to tell them
   *  apart. Only the two SIDE members feed `scanStopCreditSec`. */
  lastGlanceAt: Record<GlanceKind, number | null>;
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
    /**
     * SECONDS OF DRIVING since that stop — the clock `stopRecencySec` is
     * actually asking about, and the one the two consumers below read.
     *
     * WHY A WALL CLOCK WAS THE WRONG ONE — sc-merge-from-property:ab353b86,
     * measured at HEAD ad9a4bf on `.audit-frames/w31/frames/
     * sc-merge-from-property__pc-right/run.log` (EVIDENCE complete, and the
     * mobile leg says the same). The car comes to a genuine standstill at the
     * Б2 from 04-t022s to 04-t033s — eleven seconds of 0 км/ч, enough for the
     * route task «Спри напълно на Б2 на изхода» to tick off it — then creeps
     * away and crosses the paint at 04-t044s. `t - lastQualifyingStopAt` is
     * then over nine seconds, `stopRecencySec` is six, and the sheet prints
     * «✗ Неспиране на знак Б2 „Спри!“ −10 изпитни т. ОПАСНА ГРЕШКА» beside the
     * ✓ it had just issued for the same act. Twenty points and НЕИЗДЪРЖАН for
     * a drive whose only sin was waiting at a STOP sign.
     *
     * AND IT IS THE ANTI-SAFETY DIRECTION, which is why it is a root-cause fix
     * and not a tolerance. Б2 means stop AND give way (ЗДвП чл. 47): the wait
     * is the second half of the duty, and a clock that expires DURING it bills
     * the student for performing it. What the rule is for — „the stop was made
     * at this line, not a hundred metres back" — is a question about ground
     * covered, and ground covered is what this counts: time at rest no longer
     * ages a stop, moving time ages it exactly as before. At any speed the
     * window is the same distance it always was (6 s at 50 км/ч ≈ 83 m), so no
     * stop that used to be refused for being too far back is now accepted.
     *
     * The pattern is `scanStopCreditSec`'s, one field up, for its reason in its
     * own words: „the world they scanned was not moving past them."
     */
    movingSinceStopSec: number;
  };
  speedingMinor: EpisodeState;
  /**
   * The POST-TEACH RE-GRADE clock for `speedingMinor` — a second, longer
   * sustain on the SAME condition and the SAME reset, so the continuing
   * overspeed is billed once more `SPEED_REGRADE_SEC` of driving after the
   * first bill. Separate state rather than a parameter on the episode above
   * because the two answer different questions and must not share a clock: the
   * first bill is „he is speeding", this one is „he is STILL speeding, after we
   * told him". See `SPEED_REGRADE_SEC` for the frames.
   */
  speedingMinorRegrade: EpisodeState;
  speedingDangerous: EpisodeState;
  seatbelt: EpisodeState;
  handbrake: EpisodeState;
  /** The SAME lever, asked to move the car from a standstill — the pedal-held
   *  arm below `handbrake` (config-gated, `handbrakeMoveOffEnabled`). Its own
   *  episode because the two never overlap and must not share a clock: one
   *  needs `moving`, the other needs `!moving`. */
  handbrakeMoveOff: EpisodeState;
  headlights: EpisodeState;
  laneKeeping: EpisodeState;
  conditionsSpeed: EpisodeState;
  /** The post-teach re-grade clock for `conditionsSpeed` — see `speedingMinorRegrade`. */
  conditionsSpeedRegrade: EpisodeState;
  /**
   * Over the ACTIVE lesson task's own ceiling (`SimTick.taskSpeedCap`) — founder
   * ruling 2026-09-25, TASK_SPEED_CAP_EXCEEDED. THE CAP LEDGER (round 14,
   * founder ruling 2026-10-03 «Cap adds, never removes»): see the detector.
   */
  taskCap: EpisodeState;
  /** The post-teach re-grade clock for `taskCap` — the `conditionsSpeedRegrade` shape. */
  taskCapRegrade: EpisodeState;
  /**
   * The `blownAtSec` of the last task latch this reducer saw on a tick —
   * round 3 (verifier R2/R4). A stamp whose value differs is a NEW blow: the
   * task episodes restart at once and the clean-driving window in progress is
   * voided. null until the first stamp of the drive.
   */
  taskCapBlownAtSeen: number | null;
  /**
   * THE CAP LEDGER'S ACT (round 14; rounds 2–6's task act): named by its first bill, carrying at most one charge.
   * IDLE (`IDLE_TASK_ACT`) whenever no act is open. See „THE CAP LEDGER'S ACT" in `reduceTick`.
   */
  taskAct: TaskCapAct;
  /**
   * ROUND 6 — THE ARRIVAL'S ACT, KEPT WITH ITS LATCH: the latch whose arrival was billed into the act and, once that act
   * has ended with the latch still current, the act as it stood (`kept`), so the same latch taking the car over its
   * bill line again resumes it. null until an arrival is billed, and again from the next NEW latch.
   */
  taskArrival: TaskArrivalAct | null;
  /**
   * A SIGN-BOUND ARRIVAL WAITING FOR ITS BILL (rounds 7, 8 and 12, inside the cap ledger since round 14): billed on its
   * latch's first stamp, on the held correction, or at the ending of a drive that ends while it waits. null on every
   * other frame.
   */
  taskArrivalPending: TaskArrivalPending | null;
  /**
   * ROUND 14 — THE CAP LEDGER'S OWN READING OF THE M-16 CORRECTION: the frame since which the car has been at or under
   * the posted sign without a break (null while it is over it) — the definition `stepSustainedEpisode` keeps
   * `speedingMinor.resetSince` by, kept HERE so the cap ledger reads no speeding episode.
   */
  taskSignResetSince: number | null;
  /**
   * The sign-bound act (round 8): open from a sign-bound blow to the held correction; `billed` once its one bill is
   * out. No praise accrues while it is open (GATE 1). null on every frame of every drive that never blew a sign-bound
   * cap.
   */
  taskSignAct: { billed: boolean } | null;
  /**
   * ROUND 10 — the latches blown inside a sign-bound act AFTER it had its bill (round 7: «a second blow … adds
   * nothing»): their stretches are that act carrying on until the whole act has ended. null otherwise.
   */
  taskSignLatches: readonly number[] | null;
  rainLights: EpisodeState;
  /** Driving in FOG without front fog lamps (AC-03, чл. 74). */
  fogLights: EpisodeState;
  /**
   * Driving in SNOWFALL without low beams (AC-08, чл. 70, ал. 1) — the third
   * arm of the same duty `rainLights` carries, on the third weather flag.
   * See the detector for why it is a separate episode rather than a widened
   * `raining` term, and O28 for how long the product had none.
   */
  snowLights: EpisodeState;
  following: EpisodeState;
  wrongWay: EpisodeState;
  /**
   * THE ENTRY THE WRONG-WAY CLAUSE IS ABOUT — see `WRONG_WAY_ENTRY_TRAVEL_M`.
   *
   * A LEDGER FOR ONE RUN, not a baseline on one OSM way (2026-08-28 — see the
   * „WHAT THE FIRST CUT GOT WRONG" section of that constant):
   *  · `travelM`  — metres covered on the frames the heading was wrong,
   *                 accrued with the same `min(dt, 2)` clamp as the contact
   *                 odometer, so a paused sim fabricates none.
   *  · `heldSec`  — seconds of those same frames, ditto.
   *  · `lawfulSince` — when the lawful direction started being held, or null
   *                 while it is not. The ledger dies when that reaches
   *                 `WRONG_WAY_REARM_SEC`, i.e. exactly when the EPISODE
   *                 re-arms, and not one lawful frame sooner.
   *
   * Null while no run is open. It is deliberately NOT keyed on `tick.edgeId`:
   * an OSM way boundary is a cartography artefact, not a legal one, and keying
   * on it made the rule a function of how the map was cut (`rb-mini-v1`'s four
   * one-way arms are 28.2 m each).
   */
  wrongWayEntry: { travelM: number; heldSec: number; lawfulSince: number | null } | null;
  keepRight: EpisodeState;
  crossing: CrossingZoneState | null;
  /**
   * THE OPEN CONTACT EPISODES, ONE PER BODY — when the last contact with that
   * body was REPORTED, and the odometer reading at that moment. An episode
   * stays open while reports keep arriving and closes after
   * `collisionSeparationSec` of silence AND `COLLISION_REOPEN_TRAVEL_M` of
   * travel (AND, for `vehicle`, measured daylight); only the report that OPENS
   * one is billed. Absent key = never touched that body.
   *
   * Keyed by `contactKey`, not global, because one latch made a pedestrian
   * struck half a minute after a car crash FREE — and keyed by BODY rather than
   * by kind, because a per-kind latch made the second of two wrecked cars free
   * in the same way. See the `collision` case for both drives.
   *
   * `cloneState` copies the record and an entry is only ever assigned whole, so
   * the reducer writes bills into its own frame and never into the caller's —
   * pinned by "the reducer does not write a bill into the caller's state".
   */
  contactEpisodes: Record<string, ContactEpisode>;
  /**
   * Founder ruling 2026-09-30 («bill the forced braking»): until when a vehicle
   * contact is the tail of a BILLED cut-in and reads as one
   * (COLLISION_CONTACT_COPY.vehicleCutIn) rather than as the forward-collision
   * card — see the `laneEntered` case. null = no cut-in open.
   */
  cutInContactUntil: number | null;
  /**
   * ONE CUT-IN, ONE ACT (round 4): per follower vehicleId, until when that
   * vehicle is still answering a cut-in already billed — its reaction plus its
   * own hard stop from its speed at that entry. A forced crossing in front of
   * the same vehicle before then is the same act and is not billed again. See
   * the `laneEntered` case. Copied whole by cloneState; entries are assigned,
   * never mutated.
   */
  cutInActUntil: Record<string, number>;
  /**
   * THE VEHICLES HE IS IN FRONT OF WHOSE ANSWER IS NOT YET KNOWN (the
   * `laneEntryAnswer` event's `watching` phase, keyed like `cutInActUntil`).
   * While any is open, a lane change that would be commended is HELD rather
   * than praised — the praise says «навреме», and whether it was in time is
   * exactly what the vehicle behind has not yet answered. Closed by `clear`
   * (it did not have to slow for him), `lift` (it gave way, not hard) or
   * `braked` (hard) — round 3: only once the return is finished. Empty for ever on a lesson whose
   * cast publishes no such event, i.e. on every lesson but the one that stages
   * a vehicle to overtake. Copied whole by cloneState; entries are assigned
   * and deleted, never mutated.
   */
  laneEntryWatch: Record<string, true>;
  /**
   * Path length driven since the session began, metres — a monotone odometer
   * clamped per frame, never reset. Each episode remembers its own reading, so
   * "travel since THAT contact" is a subtraction and one body's report cannot
   * zero another body's distance. See `COLLISION_REOPEN_TRAVEL_M`.
   */
  contactOdometerM: number;
  /**
   * Path length driven IN REVERSE since the session began, metres — the same
   * clamped integrator as `contactOdometerM`, accrued only on the frames the
   * car was actually backing up. Half of the evidence a wall, a pedestrian or a
   * cyclist can supply to this reducer; see `CONTACT_REVERSE_TRAVEL_M` for why
   * forward path is not admissible.
   */
  contactReverseOdometerM: number;
  /**
   * ONE ACT, ONE BILL for the codes that ride REPORTED junction events — both
   * odometer readings and the ROAD SEGMENT at the last bill of each act key
   * (the ACT, plus whatever discriminator makes two of them genuinely different
   * faults). See `ACT_REOPEN_TRAVEL_M` for the two conjuncts that hold the
   * latch shut and `ACT_REVERSE_REOPEN_M` for the one motion that re-opens it
   * on the very segment it was billed on. Absent key = never billed.
   */
  actBills: Record<
    string,
    { odoM: number; reverseOdoM: number; edgeId: string | null | undefined }
  >;
  /**
   * THE PREVIOUS FRAME'S WORLD POSITION — the only evidence this reducer has
   * that the WORLD moved the car rather than the driver. See `restagedJump`.
   */
  prevPosition: { x: number; y: number } | null;
  /**
   * WHEN DAYLIGHT WAS LAST SEEN — the newest tick at which the vehicle ahead
   * was clear of the bumper (`CONTACT_LEAD_GAP_M`), or null if it never has
   * been. The third conjunct of "the bodies have come apart", and the only one
   * of the three that is a MEASUREMENT rather than a proxy: an episode has
   * daylight iff this is later than that episode's last report.
   *
   * Unknown counts as apart: a tick with no lead-gap channel (absent, ∞, or a
   * body the channel cannot see) stamps it, so every drive that has no gap
   * reading grades byte-identically to before. It is a claim about the IN-LANE
   * LEAD VEHICLE and nothing else, which is why only the `vehicle` episode
   * consults it — see the `collision` case for the shunt it was written
   * against and for the pedestrian it went on to acquit.
   */
  lastLeadApartAt: number | null;
  /**
   * WHEN THE ROAD AHEAD WAS LAST MEASURED CLEAR — the newest tick carrying an
   * AFFIRMATIVE gap reading over `CONTACT_LEAD_GAP_M`. The stamp above treats
   * an ABSENT channel as apart, which is right for the body that channel is
   * about and catastrophic for every other one: while a car grinds along a wall
   * there is no in-lane lead at all, so "unknown" is the permanent state, and
   * reading it as daylight is what let one scrape bill thirteen times. Only the
   * NON-vehicle branch of the `collision` case consults this one.
   */
  lastGapClearAt: number | null;
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
   * Where the car last crossed a traffic-light stop line on a GREEN it was
   * allowed to take — `null` when no such entry is live. The past-the-line arm
   * of HESITATION_AT_GREEN reads it, because the runtime stops describing a
   * line the instant the car's centre is over it (`worldRuntime.ts` keeps only
   * lines AHEAD, `d >= 0`), so a freeze with the nose in the mouth had no
   * light, no line and no distance on its tick. Assigned whole, never mutated.
   * See `HESITATION_PAST_LINE` in the reducer for the measurement.
   */
  hesitationGreenEntry: { x: number; y: number } | null;
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
    /**
     * Seconds of EMERGENCY-GRADE deceleration credited inside the open window,
     * and the frame the last credit was made on — the `accrue` discipline of
     * `stepEpisode`, spelled out here because `harshBrake` is not an
     * `EpisodeState` and cannot borrow that function's counter.
     *
     * They exist because the sustain used to be paid in CONSECUTIVE frames and
     * `accelMps2` is a noisy quantity at render rates, so the same stop was
     * convicted on a phone and acquitted on a desktop. The derivation, the
     * measurement and the two rejected formulations are at the detector.
     * A qualifying frame is credited with its OWN frame period and never with
     * the gap before it, and the window's first frame is credited with nothing
     * — so an isolated spike is worth nothing and a coarse replay bills on the
     * second qualifying frame exactly as the shipped consecutive-frame sustain
     * did. Both are zeroed by whatever re-arms or re-anchors the window.
     */
    qualifiedSec: number;
    lastQualAt: number | null;
    /**
     * THE FLOOR LIFTS FOR A FOLLOWER IT PUT AT RISK (`sc-follow-tailgater:
     * 63c0c28c` C1/C2a) — see the detector. `flooredSince` / `flooredAt`: the
     * window start and the latest frame of a causeless, emergency-grade episode
     * that the `harshBrakeMinSpeedKmh` floor ALONE acquitted (null: none open);
     * `flooredBilled`: that episode has been billed on a follower's account.
     * `followerForcedAt` / `followerAnswerSec`: the latest close follower's
     * report that it had to brake hard (`followerBraked`), and how long it is
     * still answering a brake — its own hard stop from the speed it had.
     * Flat primitives on purpose: this block is shallow-copied per tick.
     */
    flooredSince: number | null;
    flooredAt: number | null;
    flooredBilled: boolean;
    followerForcedAt: number | null;
    followerAnswerSec: number;
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
  /**
   * The SAME rest, `BAN_ZONE_REST_REGRADE_SEC` later — the second bill that
   * exists only to reach the charge the teach-first free lesson consumed. Same
   * condition, same reset, strictly larger sustain, so it can only ever fire
   * AFTER the bill above and never instead of it.
   */
  banZoneStopRegrade: EpisodeState;
  // -- LINE TYPES + BUS LANES (ADR-006 stage 2b) -----------------------------
  /**
   * Fully across the solid осева inside an authored М1 span (OV-04/SN-03
   * escalation). One bill per EXCURSION: `emitted` stays latched until the
   * vehicle is genuinely back in its own lane (own bank, clear of the line
   * band) — the same latch also suppresses the touch/lane-keep codes for the
   * rest of the excursion (one act, one code).
   */
  solidCross: EpisodeState;
  /**
   * THE REVERSAL ACROSS THE SOLID AXIS — what the reducer remembers in order to
   * answer «was this crossing a U-turn?» from the ROAD (see the block of that
   * name above `stepEpisode`, and `SolidCrossTurnState`).
   *
   * THE INITIAL VALUE, AND NEVER WRITTEN, unless the lesson authors
   * `solidCrossUTurnEnabled` — so on every other lesson the reducer's state is
   * what it was, and `SimTick.edgeAlignment` (which this is derived from) is
   * not read at all. Replaced, never mutated in place: the clone shares the
   * reference.
   */
  solidCrossTurn: SolidCrossTurnState;
  /** Sustained car travel in an authored bus lane (SN-05). */
  busLane: EpisodeState;
  /**
   * Seconds of bus-lane travel ACCRUED inside the currently-open episode — see
   * `BUS_LANE_REGRADE_SEC` and `stepAccruedEpisode` for why the sustain counts
   * qualifying seconds instead of demanding they be consecutive (the crawl past
   * a queue is the fault's own shape). Zeroed by the SAME reset that re-arms the
   * episode: leaving lane 0, or leaving the span.
   */
  busLaneCruiseSec: number;
  /**
   * THE SECOND BILL of one continuous bus-lane cruise — the same condition and
   * the same reset as `busLane`, on an accrued sustain that is
   * `BUS_LANE_REGRADE_SEC` longer, so it can only ever fire AFTER the first bill
   * and exactly once. See `BUS_LANE_REGRADE_SEC`.
   */
  busLaneRegrade: EpisodeState;
  /** The re-grade episode's own accrued ledger (see `busLaneCruiseSec`). */
  busLaneRegradeSec: number;
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
   * THE SECOND BILL of one continuous crawl — the same condition and the same
   * reset as `motorwaySlow`, on an accrued sustain that is
   * `MOTORWAY_CRAWL_REGRADE_SEC` longer, so it can only ever fire AFTER the
   * first bill and exactly once. See `MOTORWAY_CRAWL_REGRADE_SEC`.
   */
  motorwaySlowRegrade: EpisodeState;
  /** The re-grade episode's own accrued ledger (see `motorwayCrawlSec`). */
  motorwayCrawlRegradeSec: number;
  // -- THE TOWN HALF OF THE SPEED ENVELOPE (DRIVING_TOO_SLOW_IN_TOWN) --------
  /**
   * Sustained causeless crawl far under the POSTED limit on a through road.
   * One bill per episode; re-arms only on genuine recovery (back at/above the
   * floor) or on leaving the through road (a plate under
   * `townCrawlMinPostedKmh`, or a motorway, where the sibling code grades).
   */
  townCrawl: EpisodeState;
  /** Seconds of crawl ACCRUED inside the currently-open town episode — see
   *  `stepAccruedEpisode`; a stop-start crawl is the fault's own shape. */
  townCrawlSec: number;
  /** THE SECOND BILL of one continuous town crawl — same condition, same
   *  reset, sustain `TOWN_CRAWL_REGRADE_SEC` longer, so it can only ever fire
   *  AFTER the first and exactly once. See `MOTORWAY_CRAWL_REGRADE_SEC` for
   *  the argument: without it the single bill is spent on the teach card and a
   *  two-minute crawl costs the student nothing. */
  townCrawlRegrade: EpisodeState;
  /** The re-grade episode's own accrued ledger (see `townCrawlSec`). */
  townCrawlRegradeSec: number;
  /**
   * Seconds the car has been CONTINUOUSLY at or above the crawl's RECOVERY
   * band — the ledger `TOWN_CRAWL_RECOVERY_HELD_SEC` is spent against, and the
   * only thing that now wipes `townCrawlSec`. Zeroed the instant the speed
   * falls back below the band. See `TOWN_CRAWL_RECOVERY_HELD_SEC`.
   */
  townCrawlRecoverySec: number;
  // -- THE STOP THAT HAD NO REASON (STOPPED_WITHOUT_CAUSE) -------------------
  /**
   * A standstill HELD in a live lane on an open through road with nothing to
   * stop for. Consecutive by default: one stop is one act, and driving on
   * (v > movingSpeedKmh) re-arms it, so two needless stops cost two bills.
   * Under `needlessStopPerStop: false` (founder ruling 2026-10-04) its
   * `qualifiedSec` is the ADDED-UP causeless rest across stops instead, zeroed
   * only by a held recovery — see the detector in reduceTick.
   */
  needlessStop: EpisodeState;
  /** THE SECOND BILL of one long needless stop — same condition, same reset,
   *  sustain `NEEDLESS_STOP_REGRADE_SEC` longer, so it can only ever fire
   *  AFTER the first and exactly once. Same argument as the two crawl
   *  re-grades: the first bill is spent on the teach-first card, and without
   *  this a single 60-second freeze costs the student nothing. */
  needlessStopRegrade: EpisodeState;
  /**
   * When a body was last seen in the corridor within `harshBrakeClearLeadGapM`
   * ahead, seconds — or null. Stamped on every frame, read ONLY where a lesson
   * has dropped the junction excuse (`needlessStopJunctionExcuse: false`): it is
   * the staged-conflict reason that replaces it. See `needlessStopConflictAhead`
   * in reduceTick.
   */
  needlessStopConflictAt: number | null;
  /**
   * Sustained DRIVING in the лента за принудително спиране (laneId 0 inside
   * an authored emergencyLane span). One bill per excursion; re-arms on
   * leaving the lane/span.
   */
  emergencyLane: EpisodeState;
  /**
   * Sustained presence OFF the carriageway — `tick.edgeId === null`, the
   * runtime's own statement that the car is past the kerb (чл. 15, ал. 1).
   * One bill per excursion; re-arms the moment the car is back on the road,
   * so a driver who leaves twice is billed twice and a driver who leaves once
   * and stays out is billed once however long he stays.
   *
   * Deliberately NOT gated on motion, unlike every other span episode in this
   * block: the founder's case is a student who FINISHES a drive standing on
   * grass, and a `moving` conjunct would acquit exactly that. See the detector.
   */
  offCarriageway: EpisodeState;
  /**
   * The SAME excursion, `OFF_CARRIAGEWAY_REGRADE_SEC` later — the second bill
   * that exists only to reach the charge the teach-first free lesson consumed.
   * Same condition, same reset, strictly larger sustain, so it can only ever
   * fire AFTER the bill above and never instead of it.
   */
  offCarriagewayRegrade: EpisodeState;
  /**
   * VP-06 / N11 — the RED dashboard telltale, once the drive-on has been billed.
   *
   * `null` until the telltale runner's ignore branch reports its
   * `prioritySituation "warning-lamp" violated` (orchestrator/runners.ts); the
   * session time of that bill from then on. The lamp does NOT go out — a
   * coolant fault does not clear because a card was dismissed, and the runner
   * says so in its own class doc — so the чл. 101, ал. 1 duty («длъжен е да
   * спре») is still owed on every frame after it. That is what the re-grade
   * measures; see `WARNING_LAMP_REGRADE_SEC`.
   */
  warningLampIgnoredAt: number | null;
  /** The speed samples of the LAST `WARNING_LAMP_REGRADE_SEC` since that bill,
   *  kept as a decreasing run (each sample drops every earlier one it is not
   *  slower than), so the first entry is the fastest the car has gone in that
   *  window — the baseline the compliance drop is measured down from. A DROP
   *  and not a level, for the emergency runner's `peakSinceReleaseKmh` reason: a
   *  level alone pays a car that was already slow and never changed pace. A
   *  RECENT drop and not one since the bill, for the reason at
   *  `WARNING_LAMP_COMPLY_DROP_KMH`. Samples are pushed/shifted, never mutated. */
  warningLampRecent: Array<{ t: number; speedKmh: number }>;
  /** Accrued seconds of NOT-YET-COMPLYING driving since that bill — the ledger
   *  `WARNING_LAMP_REGRADE_SEC` is spent against. Zeroed the moment the driver
   *  actually begins to slow. */
  warningLampDriveOnSec: number;
  /** The SECOND bill of one continuing drive-on: the charge the teach-first
   *  free mini-lesson consumed, and the only повторение this once-per-drive
   *  duty can ever have. See `WARNING_LAMP_REGRADE_SEC`. */
  warningLampRegrade: EpisodeState;
}

const IDLE_EPISODE: EpisodeState = {
  activeSince: null,
  emitted: false,
  resetSince: null,
  lastEmitAt: null,
  bills: 0,
  qualifiedSec: 0,
  lastQualAt: null,
};

/** See `RuleEngineState.taskAct`. Replaced, never mutated in place. */
export interface TaskCapAct {
  /** The act's ONE first bill has been put before the student (the arrival's, or a first sustained bill). */
  named: boolean;
  /** The act's ONE charge-carrying re-grade has been emitted. */
  charged: boolean;
}
const IDLE_TASK_ACT: TaskCapAct = { named: false, charged: false };

/** See `RuleEngineState.taskArrival`. Replaced, never mutated in place. */
export interface TaskArrivalAct {
  /** The latch (`blownAtSec`) whose arrival was billed into the act. */
  latch: number;
  /** The act as it stood when it ended with this latch still current; null while it is open. */
  kept: TaskCapAct | null;
}

/** See `RuleEngineState.taskArrivalPending`. Replaced, never mutated in place. */
export interface TaskArrivalPending {
  /** The latch (`blownAtSec`) whose arrival waits. */
  latch: number;
  /** The blow its bill will quote. */
  arrival: SignBoundArrival;
  /** Later sign-bound blows in the same act while it waits — one act, one bill (round 7). */
  laterLatches: readonly number[];
}

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
 * HOW MUCH DAYLIGHT COUNTS AS DAYLIGHT, metres — the gap at which the vehicle
 * ahead is no longer against the bumper.
 *
 * THE CONSTANT ABOVE ARGUES ITS CONTRAPOSITIVE AND THE CODE USED ITS CONVERSE.
 * „A car that has not moved cannot have come apart from what it is inside of"
 * is true; „a car that HAS moved 2 m has come apart" is the sentence the gate
 * actually asked, and it is false for the commonest contact in the catalogue —
 * A SHUNT, where the car is moving BECAUSE it is still inside something. At the
 * 4 км/ч of `sc-ov-solid-return / mobile-wrong` the 2 m floor is crossed in
 * 1.8 s, so it stopped nothing at all: path length is not separation.
 *
 * MEASURED, and it reproduces the frame exactly. 90 s of one unbroken contact
 * at 4 км/ч, re-reported at the cadence the shell pool gives an ambient car
 * (`__tests__/sweep161-fault-episodes.test.ts`, the shunt table):
 *
 *   reporter cadence   0.5 s    2 s     4 s     7 s
 *   bills, before          1     46      23      13
 *   bills, after           1      1       1       1
 *
 * — 13 at a 7 s cadence being, to the row, the «SCORE: 130 наказателни точки ·
 * mistakes=13 (all «Пътнотранспортно произшествие»)» photographed on
 * `.audit-frames/sweep161/sc-ov-solid-return/mobile-wrong/08-debrief.png`, and
 * 14 what `sc-ln-boulevard-discipline` printed on the same shape. The frame at
 * `04-t072s.png` is the whole diagnosis in one picture: 4 км/ч, the shunted
 * truck filling the windscreen, its red band across the bonnet, and the HUD's
 * own «+2» repeat counter — a car that has never once been apart from the body
 * it is billing itself for leaving.
 *
 * WHY THE GAP AND NOT A BIGGER FLOOR. No distance can work, because the shunt
 * supplies distance; the reducer had to be given something that MEASURES the
 * thing the sentence claims. `tick.leadGapM` is that measurement — the same
 * bumper-to-bumper separation `contact.ts` closes an encounter on — and it is
 * read as a LATCH, not as an instantaneous test: the bodies must have been seen
 * apart at some point between the two reports. Instantaneously they are never
 * apart at a report, since the gap is 0 at every impact by definition, so a
 * point test would have suppressed the SECOND genuine crash instead of the
 * first false one.
 *
 * THE NUMBER. Above the touch: the following-lesson probes use `leadGapM: 0.2`
 * to mean „bumper touching" (templates-following2.ts), so the floor has to
 * clear 0.2. Below the re-hit: the shipped „hit, reverse out, hit again" case
 * backs about 1 m off before returning. 0.5 m sits 2.5× over the touch and 2×
 * under the reverse, and both directions are pinned by tests.
 *
 * WHOSE ALIBI IT IS. `tick.leadGapM` measures the IN-LANE VEHICLE AHEAD, so
 * this is evidence about a car and about nothing else. Applied to every body in
 * the world it acquitted a pedestrian knocked down thirty seconds after a car
 * crash, because the car that was hit first was still filling the lane — the
 * regression the `collision` case now carries in full. Only a `vehicle`
 * episode may cite it; a wall, a pedestrian and a cyclist fall back to silence
 * plus travel, which is what they had before this constant existed.
 *
 * A module constant for the same reason as the floor above: it is not a
 * tolerance to tune per lesson but a statement about what „apart" means.
 */
const CONTACT_LEAD_GAP_M = 0.5;

/**
 * HOW FAR THE CAR MUST HAVE BACKED OUT before it can have had a second accident
 * with a body the lead-gap channel cannot speak for, metres.
 *
 * THE CONSTANT ABOVE PROVED THAT PATH IS NOT SEPARATION, AND THEN LEFT THREE
 * QUARTERS OF THE CATALOGUE STILL MEASURING PATH. Its argument — „No distance
 * can work, because the shunt supplies distance" — is about contact, not about
 * cars, and is just as true of a wall. But the measurement that replaced the
 * proxy, `tick.leadGapM`, is a statement about the IN-LANE VEHICLE AHEAD and
 * about nothing else, so it was cited only by a `vehicle` episode and a wall, a
 * pedestrian and a cyclist were sent back to „silence plus 2 m of path" — the
 * rule that had just been shown false. Worse, they were sent back to a daylight
 * latch that reads an ABSENT gap channel as apart, and „no in-lane lead" is the
 * PERMANENT state of a car that is scraping a building.
 *
 * MEASURED THROUGH THIS REDUCER, 60 s of ONE unbroken contact at 12 км/ч with no
 * gap channel, the reporter re-firing at the cadence a shell pool gives an
 * ambient body:
 *
 *   reporter cadence   0.5 s    2 s     5 s    11 s
 *   bills, before          1     31      13       6
 *   bills, after           1      1       1       1
 *
 * — the same table `CONTACT_LEAD_GAP_M` printed for the shunt, on a wall
 * instead of a truck, and the same device-dependence, because a cadence is a
 * property of the PHONE. The frame is
 * `.audit-frames/sweep161/sc-signal-flashing/mobile-right/04-t121s.png`:
 * «Опасни грешки (по 10 изпитни т.) 4 40» on a drive where the ego was pushed
 * onto the footway and ground along one facade, three of the four bills being
 * the same car against the same wall at 0–12 км/ч — printed under the card's own
 * sentence that the ten points are the price of ONE act. `sc-ov-oncoming-gap /
 * mobile-wrong` printed fourteen of them, 141 точки.
 *
 * WHAT THE REDUCER CAN STILL HONESTLY CLAIM. Two things, and forward path is
 * neither:
 *  · the road ahead was MEASURED clear since the last report (`lastGapClearAt`
 *    — the affirmative half of the same reading, with the „unknown counts as
 *    apart" clause removed). A guardrail scraped down an OPEN road has that
 *    reading and it says 40 m, so that drive still bills its second accident —
 *    `engine.test.ts` „a guardrail scraped at speed…", the `parted` half;
 *  · or the car went BACKWARDS. Forward path is exactly what a scrape and a
 *    shunt manufacture — 2 m of it costs 0.6 s at 12 км/ч — while reversing out
 *    is the shipped „hit, reverse out, hit again" case the floor above was
 *    written to keep billing, and it is how a real second impact on the same
 *    wall begins.
 *
 * THE RESIDUE, said out loud because it is a real loss: on a road with no gap
 * channel at all, a driver who clips a bollard, drives on, and returns FORWARDS
 * to clip the same ANONYMOUS body is now charged once. That errs innocent
 * (A12), the direction this engine chooses when it cannot measure, and it is
 * bounded — the reporters that know which body they touched stamp `actorId`, so
 * two different walls are two keys and both still bill
 * (`contact-episode-per-body.test.ts`).
 *
 * The number is `COLLISION_REOPEN_TRAVEL_M` itself, deliberately: this is not a
 * second tolerance but the same floor, asked of the one motion that can supply
 * it.
 */
const CONTACT_REVERSE_TRAVEL_M = COLLISION_REOPEN_TRAVEL_M;

/**
 * HOW FAR A CAR MUST DRIVE BEFORE THE SAME REPORTED JUNCTION ACT CAN BE A
 * SECOND ACT, metres.
 *
 * ONE ACT, ONE BILL — the discipline the `collision` case spent three rewrites
 * arriving at, applied to the OTHER codes that ride reported events. Its
 * conclusion was general and was written down as such: „a contract cannot be the
 * only defence, because the reducer is the one place that survives every
 * reporter." `stopLineCrossed` and `prioritySituation` never had that defence at
 * all — every report they carried was billed, unconditionally.
 *
 * MEASURED THROUGH THIS REDUCER — ONE Б2 line and ONE give-way conflict on ONE
 * road segment, re-reported for 205 s while the car drives at 60 км/ч:
 *
 *   reporter cadence         0.25 s    1 s    4 s   15 s
 *   «Неспиране на знак Б2»       821    206     52     14
 *   «Непропускане на ППС»        821    206     52     14
 *
 * bills, after: 1 at every cadence. The photographed shape is
 * `.audit-frames/wave-c/frames/sc-junction-scan__pc-wrong/08-debrief.png` —
 * «376 наказателни точки · Общо (допустими 9) 60», with «Неспиране на знак Б2»
 * and «Непълно оглеждане при знак Б2» FOURTEEN rows each, matching the 15 s
 * column to the row — on `tj-stop-v1`, a district whose entire road network is
 * four nodes, three edges and ONE intersection. Fourteen bills cannot be
 * fourteen junctions on a map that has one.
 *
 * THE NUMBER, from the shipped world rather than from taste. Across all the
 * districts in `content/world`, the edges joining one junction node to another
 * measure 4.4 m at the shortest, 10.9 m at the tenth percentile and 48.0 m at
 * the median: two controls closer together than about eleven metres are one
 * junction the map has split into several OSM nodes, not two places a student
 * can drive between. 20 m sits above every one of those artifact pairs and well
 * under the median block, so the genuinely next junction bills on its own
 * merits and a line swept again while the car is still in the mouth cannot.
 *
 * THE SECOND CONJUNCT, and why a distance alone was not enough. At 60 км/ч a
 * 20 m floor is crossed in 1.2 s, so on its own it answers a car sitting at a
 * mouth and almost nothing else — measured, the 205 s drive above still billed
 * about 170 times on the distance floor alone. What the reducer also has is the
 * ROAD SEGMENT (`SimTick.edgeId`, the same C1 basis the lane-change block
 * already grades against), and a junction IS a node while an edge runs node to
 * node: two controlled approaches are never on one edge by construction, so a
 * report arriving off the SAME segment fix is the locator talking, not a second
 * junction. A source that names no segment asserts nothing and is left to the
 * distance floor, exactly as it grades today.
 *
 * …AND THE ONE DRIVE THAT SENTENCE IS FALSE FOR is a car that came BACK to the
 * same arm, which is also "on the segment it was billed on". That is what
 * `restagedJump` is for — see it.
 *
 * WHAT IT IS APPLIED TO, and the discipline behind the scope. THREE acts, and
 * they are exactly the three the sweep photographed repeating: the Б2 verdict
 * («stop-line» — the violation and the commendation share one key, being two
 * outcomes of one act), the junction scan («junction-scan»), and the JUNCTION
 * priority situations («priority|<situation>»). The signal verdicts and the
 * four BODY-adjudicated manoeuvre situations are deliberately NOT latched, each
 * for a reason written at its own call site — no frame shows either family
 * repeating, and latching a code on suspicion deletes real convictions: it cost
 * the shipped repeat-penalty escalation its second red, and `sc-vu-cyclist-group`
 * four of its five riders.
 *
 * WHAT REMAINS OPEN, said out loud. This closes the reporter-cadence family
 * outright. It cannot close a re-report whose lane fix has WANDERED onto
 * another segment in between: that is the locator's half of the same defect,
 * and it is reported rather than papered over with a floor big enough to hide
 * it.
 */
const ACT_REOPEN_TRAVEL_M = 20;

/**
 * HOW FAR THE CAR MUST HAVE BACKED UP before it can be at the SAME junction
 * control a second time, metres.
 *
 * THE ACT LATCH ABOVE HAD NO WAY BACK ON THE SEGMENT IT WAS BILLED ON, and the
 * segment conjunct short-circuits the distance floor, so „you are still at the
 * junction you were billed at" was an unbounded claim: measured through this
 * reducer, a student who rolls through a Б2, reverses twenty-five metres back
 * up the SAME arm and rolls through it again is billed ONCE for two offences —
 * and, worse, one who reverses back and then does it PROPERLY, a full four-
 * second stop at the line, collects NO «Правилно спиране» at all. The
 * commendation and the violation share one act key on purpose (they are two
 * outcomes of one act), so the key spent on the first pass silently swallows
 * the second verdict whichever way it goes. A product that teaches a student
 * to stop and then says nothing when he stops is the requirement-zero defect
 * (doc 64 THEO-4) dressed as a scoring fix, and it lands on the whole
 * reversing family, where backing up and re-approaching IS the exercise.
 *
 * The layer below already says so out loud: `worldRuntime`'s
 * `STOP_LINE_REFIRE_SEC` is 5 s and its comment reads „a genuine re-approach
 * takes longer anyway" — the reporter is BUILT to fire again on a real
 * re-approach, and until this constant the reducer silently overruled it.
 *
 * WHY REVERSE, AND WHY THIS NUMBER. It is `CONTACT_REVERSE_TRAVEL_M`'s
 * argument on a junction instead of a wall: forward path is exactly what a car
 * sitting in a junction mouth manufactures (the 205 s drive in
 * `ACT_REOPEN_TRAVEL_M` accrues 3.4 km of it without ever leaving the
 * intersection), while reversing is the one motion a re-report cannot fake. The
 * number is `ACT_REOPEN_TRAVEL_M` itself rather than the collision floor: 2 m
 * of reverse is the jitter at a line that `STOP_LINE_REFIRE_SEC` exists to
 * absorb, whereas twenty metres of it is a driver deliberately going back to
 * try the approach again.
 */
const ACT_REVERSE_REOPEN_M = ACT_REOPEN_TRAVEL_M;

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
 * HOW FAR A CAR MUST HAVE DRIVEN INTO THE STREET BEFORE IT CAN BE SAID TO HAVE
 * ENTERED IT AGAINST THE FLOW, metres — the entry floor for `WRONG_WAY`.
 *
 * ── THE CLAUSE, AND THE VERB IN IT ───────────────────────────────────────────
 * `n38.ts` quotes what this code is charged under: „когато изпитваният
 * **НАВЛЕЗЕ** срещу движението на пътен възел или път с еднопосочно движение".
 * The billable act is an ENTRY into a road, and until this constant existed the
 * reducer asserted it from a heading alone: `runtime/worldRuntime.ts:1961-1964`
 * requires `edgeRt.edge.oneway` FIRST and only then compares the vehicle's yaw
 * with the tangent of that edge — the nearest centreline within 30 m — so the
 * flag is „my yaw opposes the nearest one-way centreline", and a yaw is not an
 * entry. (The first cut of this block said the runtime „only computes a yaw
 * against the nearest centreline". It does not; the `oneway` test is there, and
 * it is why a junction sweep across a TWO-WAY arm cannot raise the flag at all.
 * What survives the correction is the rest: on a plaza-wide OSM mouth, or while
 * repositioning beside a one-way kerb, the nearest one-way centreline is metres
 * away and the yaw against it says nothing about a road the car has entered.)
 *
 * ── WHAT IS ON THE GLASS AT HEAD, and it is why this is not the rearm again ──
 * `.audit-frames/w14/frames/sc-ed-d2-city-run__pc-right/04-t053s.png` (the
 * `sc-ac-wind-truck-pass:71a28c54` row's third lesson, re-driven at HEAD): the
 * car is STANDING at **0 км/ч** in a wide signalled mouth, no В1 and no М10
 * arrow anywhere on the glass, and «ОПАСНА ГРЕШКА −10 изпитни т. · Движение в
 * обратна посока по еднопосочна улица … сега» is live over it. `WRONG_WAY_
 * REARM_SEC` above closed the ×5 runaway on that same drive — its `run.log`
 * bills once now where it billed five times — but one false 10-point опасна on
 * a 9-point sheet is still an instant НЕИЗДЪРЖАН, and the row it was filed on
 * is a CONSISTENCY row: the detector and the drawn world disagree.
 *
 * ── WHY A PATH FLOOR AND NOT A SPEED FLOOR ───────────────────────────────────
 * A speed floor would acquit the learner this code exists for. Creeping into a
 * one-way street at 8 км/ч is the commonest way the offence is actually
 * committed, and a rule that lets it go teaches the wrong thing at the wrong
 * moment. A PATH floor convicts him — at 8 км/ч he reaches it in 6,8 s, well
 * inside the street — while denying the conviction to a car that never went
 * anywhere. That asymmetry is the whole point: `COLLISION_REOPEN_TRAVEL_M`
 * above is the same instrument on the same argument („a car that has not moved
 * cannot have come apart from what it is inside of"), and this is „a car that
 * has not driven up the street has not entered it".
 *
 * ── WHAT THE FIRST CUT GOT WRONG: IT WAS A REVERSE SPEED FLOOR (2026-08-28) ──
 * The floor shipped keyed on `tick.edgeId` (torn up on every OSM way change)
 * and ran the two gates IN SERIES — 15 m first, and only THEN the 1,5 s
 * `wrongWaySustainSec`. Both mistakes point the same way, and the wave-7
 * verifier measured where: driving the real reducer with `wrongWay` true on
 * every frame for 60 s and advancing only `edgeId`, bills came out
 *
 *      edge m   20 км/ч   30   40   50   80
 *        ≤ 20      0       0    0    0    0
 *          25      1       0    0    0    0
 *        28.2      1       1    0    0    0
 *          40      1       1    1    1    0
 *        ≥ 60      1       1    1    1    1
 *
 * — the ACQUITTAL PROBABILITY RISING WITH SPEED, which is the exact inversion
 * of the thing this constant was written to build. The mechanism: with the
 * ledger dying at the way boundary, both gates had to complete on ONE edge, and
 * the series form needs `15/v + 1,5` seconds, i.e. `15 + 1,5·v` metres — 23 m
 * at 20 км/ч but 48 m at 80. On `rb-mini-v1` and `rb-ped-v1` ALL FOUR one-way
 * arms are 28,2 m, so going the wrong way round a mini-roundabout was billed at
 * 30 км/ч and never at 40 or 50; `district-v1` has 27 one-way edges under 15 m
 * and 49 under 30 m, `d2-v1` 12 and 37. The lane could not see it because every
 * map it checked is long (`ov-oneway-v1` 140 m, `mw-v1` 2600 m).
 *
 * BOTH mistakes are fixed here, and neither weakens the floor:
 *  1. THE LEDGER IS THE RUN, NOT THE WAY. `RuleEngineState.wrongWayEntry`
 *     accrues metres and seconds over the frames the heading is wrong, wherever
 *     the map happens to cut them, and dies only when the LAWFUL direction has
 *     been held for `WRONG_WAY_REARM_SEC`. That last clause matters as much as
 *     the first: the rearm block above exists because this flag FLICKERS, and a
 *     flicker that was allowed to fragment the path ledger instead of the bill
 *     ledger would be the same acquittal with a new address.
 *  2. THE GATES RUN IN PARALLEL. Both are measured from the same entry, so the
 *     bill lands at `max(1,5 s, 15/v)` — 2,7 s at 20 км/ч, 1,5 s at 40 and
 *     above. MONOTONE NON-INCREASING IN SPEED: the faster, more dangerous run
 *     is now billed first and never later, on a street of any length. (Series
 *     also acquitted the fast driver on a BOUNDED street — a 40 m one-way taken
 *     at 80 км/ч is over in 1,8 s against a 2,175 s requirement.)
 *
 * ── AND MEASURED AGAINST THE DRIVES ──────────────────────────────────────────
 * The three crawl legs this row was filed on hold 0–15 км/ч and drop under
 * `movingSpeedKmh` (5) every few seconds — `sc-ed-d2-city-run/pc-right` samples
 * 12·3·0·13·3·0·13·3·0·14·3·0 over 175 s. Each sub-5 км/ч stretch is not a
 * wrong-heading frame at all, so it accrues nothing and, once it outlasts the
 * 4 s rearm, wipes the ledger: a creep that never puts 15 m of moving
 * wrong-heading road behind it cannot be billed. (What the ledger DOES now
 * catch, and the first cut did not, is a genuine 30 m run whose flag blinks
 * out for a second at a time — see the sweep161 flicker cases.) A REAL run
 * cannot be acquitted: `traces/scOvOneWay.ts`'s mistakes head the wrong way at
 * road speed and cover 15 m in 1,1 s at 50 км/ч and 0,54 s at 100, so for them
 * the 1,5 s sustain is the binding gate and the bill lands exactly when it did
 * before this constant existed.
 *
 * ── WHY FIFTEEN ──────────────────────────────────────────────────────────────
 * It is a statement about a place, not a tolerance: a driver is IN the street
 * rather than in the mouth he came from once he has put a junction's width of
 * it behind him, and the widest mouths in the shipped districts are the d2
 * boulevard ones. It sits under `ACT_REOPEN_TRAVEL_M` (20 m — „a driver
 * deliberately going back to try the approach again"), which is right: entering
 * is less than re-approaching. Module constant and not a `RuleEngineConfig`
 * field for the same reason as the two above — a lesson that could lower it
 * could re-buy the false 10.
 *
 * ── WHAT THIS IS STILL NOT ───────────────────────────────────────────────────
 * It does not make the flag true. The world half of the row is open and named:
 * `world/builders/props.ts:1358` posts В1 only on scenario micro-maps and
 * deliberately never on the OSM districts („~150 one-way mouths whose REAL
 * signage the source data never recorded"), so on d2 a student can still be
 * convicted under a plate the world declines to draw. Closing THAT needs a
 * disarming world referent on the tick — the doc 86 T1 pattern
 * (`centreLinePainted` / `laneLinesPainted`), i.e. `rules/types.ts` +
 * `runtime/worldRuntime.ts` — and is reported, not patched here.
 */
const WRONG_WAY_ENTRY_TRAVEL_M = 15;

/**
 * THE STANDING-DUTY RE-GRADE — how long a CONTINUING breach of a one-switch
 * duty may run after the student has been shown it, before it is billed the
 * one time the изпитен лист prices, seconds.
 *
 * WHAT WAS PHOTOGRAPHED, and it is the whole lane. `sc-ac-night-lights /
 * pc-wrong` drove its entire night section with the lamps off and its debrief
 * reads «Какво се получи добре: чисто каране по изпитния лист — нито едно
 * нарушение не влезе в точките», over «Опасни 0 · Основни 0 · Второстепенни
 * 0». `sc-ac-rain-lights / pc-wrong` is the same sheet, word for word, on a
 * rain lesson driven unlit. `sc-pk-stop-vs-park / mobile-right` drives 134 s
 * with the КОЛАН button red and the leg's own run.log records 34 of its 42
 * sampled beats as `card=-/-`: not one violation card in the whole drive.
 * Three lessons whose entire subject is a switch, and none of them can mark it.
 *
 * WHY, and it is not the coach's fault. `stepEpisode` fires a violation ONCE
 * per episode and never again however long the breach lasts (`if (!e.emitted
 * …) { e.emitted = true; return true; }`), and every one-switch duty in this
 * file uses it: belt, handbrake, night lamps, rain lamps, fog lamps, snow
 * lamps. The single event it produces is then the FIRST encounter of its
 * topic, and teach-first-then-grade — the founder-approved discipline
 * (`scenarios/policy.ts`) — spends it on the free mini-lesson. The engine's own
 * words on the leg's debrief: «Първата среща не се наказва — точно затова я
 * показахме. При повторение вече влиза в изпитния лист.» There is never a
 * повторение, because the reducer never asks a second time. So the free lesson,
 * which exists to forgive a first MISTAKE, ends up forgiving the entire drive.
 *
 * WHAT THIS IS NOT. It is not a cadence and not a ladder: `STANDING_DUTY_MAX_
 * BILLS` below holds the episode to TWO bills — the teach and the grade — so a
 * breach held for three minutes still costs exactly what Наредба № 38 prices
 * it at, once, and can never produce the fifteen-row runaway this same sweep
 * files as critical elsewhere (`sc-junction-stop`, `sc-junction-scan`).
 *
 * WHY TEN SECONDS.
 *  · The teach card PAUSES the sim (the audited legs record «1 pause layer
 *    drained»), and sim time does not advance while it is up, so this is ten
 *    seconds of DRIVING after the student was told.
 *  · `speedingRearmSec` (4 s) is this engine's declared unit of „a correction
 *    that counts"; ten is more than two of them, deliberately generous, because
 *    a false second bill costs trust and the student may be mid-manoeuvre.
 *  · It has to reach the drives the audit photographed. Both AC legs above end
 *    at ~20 s of driving (run.log beats 04-t001s…04-t017s), so the engine's
 *    existing 20 s repeat cadence (`speedingRepeatSec`) would have expired
 *    AFTER the drive and moved nothing.
 *  · And it cannot punish a reaction: at the 59 км/ч both legs hold, ten
 *    seconds is 164 m of road driven unlit — nobody reaches a light switch in
 *    a hundred and sixty metres.
 *
 * TWO BILLS ARE NOT TWO CHARGES, and that distinction is load-bearing. The
 * second bill exists ONLY to reach the charge the free lesson consumed, so it
 * carries `regrade: true` (`rules/types.ts`) and `lessons/engine.ts` DROPS it
 * whenever the code has already been charged. Three cases where it has:
 *  · exam mode — `coachStep` opts.examMode scores unconditionally, so the
 *    FIRST bill is the charge and there is no teach to make up for;
 *  · a repeat offence — the topic was taught in the earlier episode, so the
 *    first bill of the second episode already grades;
 *  · any scenario whose policy grades this topic on sight.
 * Without that drop, a candidate on a NIGHT exam variant (`examBank.ts`) who
 * drives twelve seconds unbelted and unlit books 12 наказателни точки where
 * Наредба № 38 prices the pair at 6 — and the exam gates are `osnovniPoints >
 * 6` / `totalPoints > 9` (`rules/summary.ts`, `lessons/exam.ts`). That is a
 * false FAIL in the highest-stakes mode the product has, which is why the
 * reducer marks the re-grade instead of pretending the two bills are alike.
 * The mode itself is still invisible here: the reducer states a FACT about the
 * event („this is the same breach again"), and the layer that knows what was
 * charged decides. Grading policy stays out of the detector.
 */
const STANDING_DUTY_REGRADE_SEC = 10;

/**
 * How many bills ONE standing-duty episode may ever produce.
 *
 * TWO: the teach and the grade. The first is the founder-approved free
 * mini-lesson (`scenarios/policy.ts` — „the first time a driver meets a
 * scenario we TEACH it"); the second is the charge the официален изпитен лист
 * prices the offence at, and Наредба № 38 prices «Движение без предпазен
 * колан» and «Движение нощем без светлини» ONCE at 3 наказателни точки, not
 * per minute. A third bill would tell the student nothing he was not told at
 * the second and would only add a row — which is precisely the shape
 * `sc-junction-stop / pc-wrong` («Грешки (48)», fifteen identical rows) and
 * `sc-junction-scan / pc-wrong` («Грешки (62)») are filed as critical for.
 * The ceiling is what makes this repair unable to become that defect.
 */
const STANDING_DUTY_MAX_BILLS = 2;

/**
 * Functional accelerator above which the pedal counts as PRESSED, for the
 * standstill handbrake arm. Deliberately the same 0.1 as
 * `engine/stuckStart.ts STUCK_START_PEDAL_ON` and `REVERSE_ASSIST_PEDAL_ON` —
 * one definition of „a foot is on it" in this product. Restated rather than
 * imported so `rules/` keeps importing nothing from `engine/` (module
 * boundaries, doc 05); if one moves, both move.
 */
const HANDBRAKE_MOVE_OFF_PEDAL_ON = 0.1;

/**
 * THE SAME RE-GRADE, FOR THE TWO SECOND-DEGREE **SPEED** CODES — seconds of
 * driving after the first bill (w11 · lane „grade-blind-to-speed", 2026-08-26).
 *
 * ── WHAT WAS PHOTOGRAPHED ────────────────────────────────────────────────────
 * `sc-hazard-obstacle__pc-wrong/04-t012s.png` and its four siblings
 * (`sc-vu-pass-clearance`, `sc-follow-tailgater`, `sc-sp-wet-limit-plate`,
 * `sc-signal-response`, all `.audit-frames/w11/frames/…/04-t012s.png`): В26 disc
 * **50**, «РЕЖИМ Нормален ≤60 · знакът важи», cluster **59 км/ч**, held from the
 * first drive beat to the debrief — and the debrief reads «Опасни 0 0 · Основни
 * 1 3 · Второстепенни 0 0 · ИЗДЪРЖАН · +100 XP», where the single основна is the
 * harness's own unbuckled belt and nothing at all is booked for the speed.
 * `sc-ac-truck-spray__pc-wrong/04-t034s.png` is the same silence one code over:
 * disc **140**, «РЕЖИМ Нормален ≤150 · знакът важи · задачата иска ≤80», cluster
 * **128 км/ч**, heavy rain — and the driving is filed under «Учебни моменти (не
 * влизат в точките): • Несъобразена с условията скорост», i.e. at zero, so the
 * 130 км/ч leg and the 17 км/ч leg of that lesson get byte-identical cards.
 *
 * ── WHY, AND IT IS NOT THE BANDS ─────────────────────────────────────────────
 * Driven through this reducer, a flat 59 in a 50 held for 47 s bills
 * SPEEDING_OVER_LIMIT three times (t=6.6 / 26.6 / 46.6). The bands are right.
 * What is wrong is that the drives above are SHORTER than the cadence:
 *  · SPEEDING_OVER_LIMIT re-bills on `speedingRepeatSec` = **20 s**, and those
 *    five legs run 17–18 s from their first moving beat to the debrief (their
 *    own `run.log`: 04-t001s … 04-t017s, then 07-end), so the SECOND bill lands
 *    after the student has already been told he passed;
 *  · SPEED_TOO_FAST_FOR_CONDITIONS is on plain `stepEpisode` — ONE bill per
 *    episode, ever, however long the breach runs, so it is free at any length.
 * Either way the drive produces exactly ONE event, and the founder-approved
 * teach-first free mini-lesson (`scenarios/policy.ts`) spends it. Both codes are
 * второстепенни, i.e. precisely the constituency A12's warn-once floor covers,
 * so for a CONTINUING breach „one warning, then grade" reduces to „never
 * grade". The debrief then prints the engine's own promise — «Първата среща не
 * се наказва … При повторение вече влиза в изпитния лист» — over a drive that
 * never got a повторение because the reducer never asked a second time.
 *
 * That is verbatim the defect `STANDING_DUTY_REGRADE_SEC` above was written to
 * close, and that block already knew the speed cadence was too slow: „the
 * engine's existing 20 s repeat cadence (`speedingRepeatSec`) would have
 * expired AFTER the drive and moved nothing." The six one-switch duties were
 * repaired; the speed codes were left on the old model. This is the same repair
 * on the same argument.
 *
 * ── WHY SIX AND NOT THE DUTIES' TEN ──────────────────────────────────────────
 * Both halves of the number are this engine's own declared units, one of each:
 *  · `speedingRearmSec` = 4 — „a correction that counts" (the M-16 hysteresis,
 *    and the same figure `WRONG_WAY_REARM_SEC` borrows for the same idea);
 *  · `speedingMinorSustainSec` = 2 — „this is a fault and not a blip", the
 *    window that billed him the first time.
 * Six seconds is therefore „he was given the time this engine calls a
 * correction, did not take it, and then held the fault for as long as it took
 * to bill him in the first place". It is deliberately SHORTER than the duties'
 * ten because the corrective act is different in kind: the belt and the lamps
 * need a hand on a control that may be wanted for the manoeuvre, and ten
 * seconds was argued as generous for exactly that; the whole of the correction
 * here is lifting off the accelerator, which is the first line of the card the
 * student has just dismissed, and every metre in between is the offence still
 * being committed.
 * And — the same clause `STANDING_DUTY_REGRADE_SEC` argues for itself — it has
 * to reach the drives the audit photographed. Those five legs are over the
 * graced limit from their second drive beat to the end, i.e. for roughly 12–15 s
 * of driving (`run.log`: 04-t001s at 14 км/ч, 04-t006s at 56–57, then 04-t012s
 * and 04-t017s at 59, then 07-end), so a bill at first + 10 s would land at or
 * past the debrief and move nothing, while first + 6 s lands with a margin. That
 * is spending the margin in the direction that costs a real overspeed a point
 * rather than the direction that lets it go free — which is the right way round
 * for a RE-GRADE of a fault this engine has already billed, and would not be for
 * a fresh accusation.
 *
 * ── TWO BILLS ARE STILL NOT TWO CHARGES ──────────────────────────────────────
 * The re-grade carries `regrade: true`, so `lessons/engine.ts` DROPS it whenever
 * the code has already been charged — exam mode, a repeat offence, a
 * grade-on-sight policy. In exam mode the ledger is therefore byte-identical to
 * today. It exists only to reach the charge the free lesson consumed.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT TOUCH ────────────────────────────────────
 *  · SPEEDING_DANGEROUS — опасна, so `policyForViolation` returns
 *    „always-grade" and its FIRST bill is the charge. A re-grade there is dead
 *    by construction (`alreadyCharged` drops it on the same tick it is built),
 *    and its `repeatSec` is 0 on an argued safety ruling. Nothing to add.
 *  · SPEED_TOO_FAST_FOR_CURVE — основна (3 т.) and currently the subject of an
 *    OPEN false-positive row (`sc-sp-curve:45e7e4fb`: the card fires on a car
 *    that has left the carriageway entirely). Doubling a bill that is under
 *    suspicion of convicting the innocent is the wrong direction to move first;
 *    it is left alone until that row is settled.
 *  · THE TASK CAP, and this is the half of „grade-blind-to-speed" that is NOT
 *    closed here. `sc-ac-truck-spray`'s own strip paints «задачата иска ≤80»
 *    beside a 140 disc while the car does 128, and NOTHING in this file can see
 *    that 80: `readSpeedContract` (`scene/lessonSpeedContract.ts`) resolves
 *    posted-vs-task-vs-mode and names the BINDING number, `hud/StatusDashboard
 *    .tsx` paints it, and the reducer grades `tick.maxSpeedKmh` — the road's
 *    posted limit — and nothing else. The objective's own cap reaches the glass
 *    and the objective gate (`lessons/objectives.ts` `capMet`) and never the
 *    изпитен лист. Feeding it here would mean grading a DRILL INSTRUCTION as a
 *    Наредба № 38 fault across ~950 capped objectives, i.e. a founder decision
 *    with a lawRef and a severity, not a bug fix — the same line
 *    `lessons/advisor.ts` draws at its own 32 above-the-street gates. Filed,
 *    not patched.
 *    DECIDED 2026-09-25 (register item 17, „Bill it"): the cap is now graded
 *    by TASK_SPEED_CAP_EXCEEDED on THIS clock (see the detector after the
 *    curve block), fed by `SimTick.taskSpeedCap`, which `lessons/engine.ts`
 *    stamps from the active objective. Of the ~950, only the flow caps that
 *    bind under the sign reach it — the halt band (≤ 8 км/ч, „come to rest
 *    here") and every cap at or above the posted limit are never stamped.
 */
const SPEED_REGRADE_SEC = 6;

/**
 * THE SECOND-DEGREE SPEED BAND COUNTS QUALIFYING SECONDS, NOT CONSECUTIVE ONES
 * — the `accrue` opt-in the two SPEEDING_OVER_LIMIT episodes pass (w13 ·
 * `sc-ac-aquaplane:1d56d2ea`).
 *
 * ── WHAT WAS PHOTOGRAPHED, AND THEN MEASURED ─────────────────────────────────
 * `.audit-frames/sweep161/sc-ac-aquaplane/pc-wrong/04-t018s.png` and the w13
 * re-drive of the same leg: a 90 disc, «РЕЖИМ Нормален ≤100 · знакът важи», the
 * cluster walking 91 · 93 · 97 км/ч — and the drive reaches its debrief on
 * «Опасни 1 10 · Основни 0 0 · Второстепенни 2 2 · Общо (допустими 9) 3 12»
 * with no «Превишена скорост» row anywhere, and no speeding card on any beat of
 * the `run.log` either, so the reducer produced no such EVENT at all.
 *
 * The bands are right — driven through this reducer, a FLAT 97 in a 90 bills at
 * t = 3,0 and re-grades at 9,0 (`speedingBands`: 90 + min(90×0,10 · 5) = 95).
 * What silences it is the SHAPE of the drive. `stepSustainedEpisode` demanded
 * that the condition hold on EVERY frame of the sustain, so one frame under the
 * graced 95 set `activeSince` back to null and the two-second clock started
 * over. Measured on the same reducer, an oscillation between 93 and 97 with a
 * mean of 95 — i.e. a car above the graced limit for half of every second, for
 * forty seconds — produced ZERO events, against three for the steady 97.
 *
 * That is the M-16 unfairness with the sign flipped, and M-16's own fix does
 * not reach it: `rearmSec` protects the driver who dips under the LIMIT from
 * being billed twice, and nothing protected the sheet from a driver who dips
 * under the GRACE and is billed never. The steadier, more honest drive is the
 * expensive one again.
 *
 * ── THE INSTRUMENT IS ALREADY IN THIS FILE ───────────────────────────────────
 * `stepAccruedEpisode` was written for exactly this, on exactly this sweep, for
 * the motorway crawl: „that is right for a condition which is genuinely a STATE
 * (belt off, handbrake on) and wrong for one that describes a STRETCH OF ROAD,
 * because the worst driving is the least continuous." A speed band is a stretch
 * of road. The speed codes were left on the consecutive model; this is the same
 * repair on the same argument, and it is written as an `accrue` flag on the two
 * existing steppers rather than a third stepper so the rearm/repeat/maxBills
 * ladder above keeps working underneath it.
 *
 * ── WHAT IT CANNOT DO ────────────────────────────────────────────────────────
 *  · It cannot convict anybody who corrects. `reset` is unchanged and is still
 *    `speed <= limit`, and a reset ZEROES the ledger — coming back to the
 *    posted limit still buys a clean slate, so the drive that obeys the sign is
 *    byte-identical.
 *  · It loosens no per-frame gate. A frame that does not qualify contributes
 *    nothing (the clause `stepAccruedEpisode` states verbatim); only the demand
 *    that qualifying frames be ADJACENT is dropped.
 *  · It cannot fabricate seconds. The per-frame credit is clamped at 2 s, the
 *    same clamp the contact odometer and the crawl ledger use and for the same
 *    reason: every teach card pauses the sim.
 *  · It is opt-in. The six one-switch duties and WRONG_WAY pass `accrue` false
 *    and are unchanged — their conditions are states, and for a state a frame
 *    of falsehood IS the duty being met.
 *  · It changes no continuous drive at all: with the condition held every
 *    frame, `qualifiedSec` and `t − activeSince` are the same number.
 *  · AND IT STOPS AT THE ОПАСНА LINE. `speedingDangerous` deliberately does NOT
 *    accrue: its one bill is 10 наказателни точки against an allowance of 9, so
 *    it is the only speed code that fails an exam by itself, and its sustain is
 *    already the shortest in this file (1 s). A gap-surviving ledger there
 *    would let a handful of quarter-second blips past +10 km/h, spread over a
 *    whole lesson, add up to an instant НЕИЗДЪРЖАН — the A12 direction this
 *    file does not move in. The band beneath it accrues, so the same oscillating
 *    driver is still marked, at 1 point a rung instead of a failed exam. This
 *    is the same line `speedingRepeatSec` is already held to at the same
 *    threshold, and drawn for the same reason.
 *
 * ── MEASURED THROUGH THIS REDUCER (0,1 s frames, posted 90) ──────────────────
 *   93↔97 sine, 40 s:  before 0 events  ·  after 1 bill at 7,2 s + regrade 24,2
 *   flat 97,     40 s:  3,0 / 9,0 / 23,0 both before and after — byte-identical
 *   flat 94,    120 s:  0 events before and after (inside the grace, never
 *                       qualifies — the ledger cannot bill what never qualified)
 *   97 then 85 at 21 s: 3,0 + 9,0 only; the correction still buys a clean slate
 */
const SPEEDING_SUSTAIN_ACCRUES = true;

/**
 * THE SAME RE-GRADE, FOR THE MOTORWAY CRAWL — ACCRUED seconds of qualifying
 * crawl after the first bill (w11 · lane „engine", sc-mw-discipline:9e8f6966).
 *
 * ── WHAT WAS MEASURED, and it is the whole row ───────────────────────────────
 * `.audit-frames/w11/frames/sc-mw-discipline__mobile-right` — 273 s on a
 * 140 км/ч motorway (mw-v1: `motorway: true`, `maxspeed` 140), top speed
 * 24 км/ч, 23 full stops, 287.2 m of witness path — reaches its debrief on
 * «Опасни грешки 0 | 0 · Основни 1 | 3 · Второстепенни 0 | 0», the single
 * основна being the harness's own unbuckled belt. The row was filed as „no code
 * convicts the crawl". IT DOES. The leg's own `_audit-debrief.json` carries
 *
 *   «Учебни моменти (не влизат в точките): • Твърде бавно движение по
 *    автомагистрала»
 *
 * — `DRIVING_TOO_SLOW_FOR_MOTORWAY` fired, was shown, and was priced at ZERO.
 * The detector was never the defect. The BILL COUNT was: `stepAccruedEpisode`
 * emits once per episode and never again however long the crawl runs, the code
 * is второстепенна (`catalog.ts`, 1 наказателна точка), so
 * `policyForViolation` hands it the teach-first default — and the founder-
 * approved free mini-lesson spends the only bill the episode will ever produce.
 * The debrief then prints this engine's own promise, «Първата среща не се
 * наказва … При повторение вече влиза в изпитния лист», over 273 s that never
 * got a повторение because the reducer never asked a second time.
 *
 * That is verbatim `STANDING_DUTY_REGRADE_SEC`'s defect and verbatim
 * `SPEED_REGRADE_SEC`'s. The six one-switch duties were repaired in one wave and
 * the two second-degree speed codes in the next; the crawl — the ONLY code on
 * the sheet that grades „не пълзи", the subject of `sc-mw-discipline`,
 * `sc-mw-min-speed` and `sc-fo-motorway-gap` — was left on the old model. This
 * is the same repair on the same argument, and it is the third and last of that
 * family in this file.
 *
 * ── WHY SIX, AND WHY THEY ARE ACCRUED SECONDS ────────────────────────────────
 * Six is `SPEED_REGRADE_SEC`, and for its stated reason: the corrective act is
 * one pedal. Lifting off (`SPEED_REGRADE_SEC`) and pressing down are the same
 * kind of act, and both are the first line of the card the student has just
 * dismissed — which is why neither gets the ten seconds the duties are given for
 * a hand that may be wanted on the wheel.
 *
 * What is DIFFERENT here, and it is the safety property that makes six safe:
 * this clock counts QUALIFYING seconds, not wall seconds (`stepAccruedEpisode`
 * — the same ledger the first bill is drawn on, so the two are the same series
 * and the re-grade can never overtake the bill it re-grades). A frame accrues
 * only while every one of the crawl's own gates still holds — motorway, moving,
 * under `motorwayMinFlowKmh`, STEADY, no lead inside the queue gap, no crossing,
 * no hazard, forward gear, out of the emergency lane. A student who answers the
 * card by accelerating is by construction not steady (|a| leaves
 * `motorwaySlowSteadyMps2` the moment he presses), so his recovery accrues
 * NOTHING and this bill never reaches him; 0 → 50 км/ч at a gentle 1 m/s² is
 * fourteen seconds in which the ledger does not move. Six qualifying seconds is
 * therefore „he was shown the rule and then held the crawl, steadily, for one
 * and a half times the window that billed him in the first place".
 * And it has to reach the drive that was photographed: that leg holds 10–16 км/ч
 * across forty-three sampled beats over 273 s, so six accrued seconds is spent
 * many times over, while the 4 s first bill lands early enough that the re-grade
 * still has the whole drive in front of it.
 *
 * ── TWO BILLS ARE STILL NOT TWO CHARGES ──────────────────────────────────────
 * The re-grade carries `regrade: true`, so `lessons/engine.ts` (`applyTick`,
 * the `alreadyCharged` guard) DROPS it wherever the code has already been
 * charged — exam mode, a repeat offence, a grade-on-sight policy. In exam mode
 * the ledger is byte-identical to today. It exists only to reach the ONE
 * наказателна точка the free lesson consumed, and the episode can produce no
 * third bill: it is a second episode object with a strictly larger threshold,
 * so it fires exactly once and is zeroed by the same recovery that re-arms the
 * first.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT TOUCH ────────────────────────────────────
 *  · The crawl's GATES. Not one of them moves. A drive that books nothing today
 *    books nothing after this — including `sc-mw-discipline`'s sibling legs
 *    where a stopped body inside `motorwaySlowQueueGapM` disarms the detector
 *    outright (measured through this reducer: a lead reported at 40 m turns 23
 *    creeps into zero bills and two CLEAN_DRIVING commendations). Whether that
 *    exemption is right is a separate, open question about a channel this file
 *    does not own; it is reported, not widened here.
 *  · `EMERGENCY_LANE_DRIVING`, the crawl's neighbour. It is опасна, so
 *    `policyForViolation` returns „always-grade" and its FIRST bill is the
 *    charge — a re-grade there is dead by construction.
 */
const MOTORWAY_CRAWL_REGRADE_SEC = 6;

/**
 * THE SAME TWO DEFECTS, IN TOWN — seconds of qualifying crawl after the first
 * bill before the breach is re-graded (DRIVING_TOO_SLOW_IN_TOWN).
 *
 * Scaled to the town sustain the way 6 is scaled to the motorway's 4: the
 * second bill lands after roughly half as long again as the first, so a crawl
 * that ends shortly after the teach card is charged once and a crawl the
 * student simply keeps up is charged twice. Longer in absolute terms than the
 * motorway's 6 for the same reason `townCrawlSustainSec` is longer than 4.
 */
const TOWN_CRAWL_REGRADE_SEC = 10;

/**
 * THE SLOW SIDE OF THE ENVELOPE HAD NO HYSTERESIS AT ALL — how long the car
 * must HOLD the recovery band before the town crawl's accrued ledger is wiped
 * (w42 · `sc-vu-emergency-junction:853790f7`, the row the detector above was
 * written for and still does not reach).
 *
 * ── WHAT WAS MEASURED, THROUGH THIS REDUCER, AT HEAD ────────────────────────
 * The w42 `sc-vu-emergency-junction__pc-right` leg's OWN printed dial — the
 * beats in its `run.log`, 10 · 18 · 4 · 12 · 7 · 13 · 14 · 14 · 15 · 9 · 4 · 0
 * км/ч — interpolated to 1 Hz and run out to the 143 s the debrief prints
 * («Ориентировъчно време — 143 с при ориентир 60 с»), on the road that leg is
 * posted at (40, floor 12):
 *
 *   bills of DRIVING_TOO_SLOW_IN_TOWN … 0
 *   PEAK townCrawlSec over 143 s ……… 9.0   of the 20 s it needs
 *   every event the drive produced … CLEAN_DRIVING
 *
 * Nine seconds is not „nearly": the ledger was wiped SIX times and never got
 * past half. A detector written for this row cannot reach its own threshold on
 * the drive the row is filed on, so the row is open for the same reason it was
 * opened — «nothing anywhere flags it as too slow».
 *
 * ── THE CAUSE IS ONE LINE, AND THE FILE ALREADY FIXED IT ON THE FAST SIDE ───
 * `townReset` was `speed >= townFloorKmh`, and `stepAccruedEpisode`'s reset arm
 * ZEROES the ledger. So the detection line and the recovery line were the SAME
 * NUMBER, and one frame brushing it discarded every second banked before it.
 * That is verbatim the defect M-16 records for speeding — „a dip back to the
 * limit only re-arms once the driver has genuinely HELD it; anything shorter is
 * one continuing offence, not a new one" — and verbatim the one the
 * `SPEED_REGRADE_SEC` block re-fixed for the speeding RE-GRADE in 2026-08-30.
 * The fast side has carried BOTH guards for months:
 *
 *   fast side   convict above `limit + grace` · reset at or under `limit`
 *               · and only after `speedingRearmSec` of holding it
 *   slow side   convict below `floor` ………… · reset at `floor`
 *               · on ONE frame
 *
 * A band and a hold on one side of the envelope and neither on the other is
 * not an envelope, which is the sentence the detector above was built on.
 *
 * ── SO THE SLOW SIDE TAKES THE FAST SIDE'S TWO GUARDS, UNCHANGED ────────────
 *  · THE BAND is `speedingGraceRatio` / `speedingGraceMaxKmh`, the engine's own
 *    declared „this is not the same speed as the line" margin, added to the
 *    floor instead of the limit: 12 → 16 км/ч on a road posted 40, 15 → 20 on a
 *    50. Reaching 13 км/ч on a 40 road is not a recovery from a crawl; it is
 *    the crawl, one км/ч higher.
 *  · THE HOLD is 4 s — `speedingRearmSec`'s figure, which `WRONG_WAY_REARM_SEC`
 *    already borrows for exactly this job. One tick in the band is a blip; four
 *    seconds of it is a driver who has gone back to driving.
 * No number is invented and none is shown to the student: ЗДвП чл. 22, ал. 1
 * states no minimum speed (see the detector's own block), so these stay
 * DETECTION thresholds and the catalogue row keeps citing the article alone.
 *
 * ── A12 — WHAT CANNOT MOVE, AND WHY ─────────────────────────────────────────
 *  · Every ACQUITTAL is untouched. `townCrawlCond` is the same predicate, gate
 *    for gate — lead vehicle at any distance, junction/stop line/VRU inside
 *    `townCrawlClearAheadM`, crossing, rail, curve advisory, narrow meeting,
 *    night/rain/fog/snow, calmed zone, reverse, standstill, stall, handbrake,
 *    recent hazard. A drive that qualifies for NOT ONE second still banks not
 *    one second, and this constant cannot conjure the seconds it wipes.
 *  · A genuine recovery still wipes the ledger AND re-arms the episode in full,
 *    so `town-crawl.test.ts`'s „a second, distinct crawl after a genuine
 *    recovery is a second act and bills again" (15 s at 45 км/ч between two
 *    crawls) is byte-identical: 45 ≥ 20 and 15 s ≥ 4 s.
 *  · Leaving the through road still resets on the frame it happens — the seed
 *    below is the held threshold itself, so `townReset` is true immediately.
 *  · The ceiling is unchanged at TWO bills per episode (one второстепенна each,
 *    the second `regrade`-marked and dropped by `lessons/engine.ts` wherever
 *    the code was already charged), so exam mode is byte-identical.
 */
const TOWN_CRAWL_RECOVERY_HELD_SEC = 4;

/**
 * THE SAME DEFECT ONE MORE TIME, FOR A CAR THAT IS NOT MOVING AT ALL — seconds
 * of held causeless standstill AFTER the first bill before the breach is
 * re-graded (STOPPED_WITHOUT_CAUSE).
 *
 * The two crawl re-grades above exist because `policyForViolation` hands the
 * FIRST bill of a второстепенна to the teach-first free mini-lesson, so a single
 * episode reaches the debrief priced at zero. A needless stop has exactly the
 * same shape and the same hole: a student who stops once and simply stays
 * stopped commits one act, is taught once, and is charged nothing for it. Six
 * seconds — the sustain again, so the second bill lands at twice the first, the
 * same „half as long again or more" scaling the siblings use.
 *
 * It CANNOT produce a third bill: it is a second episode object with a strictly
 * larger threshold, zeroed by the same recovery (driving on) that re-arms the
 * first — and a driver who genuinely drives on and then freezes again has
 * committed a SECOND act, which bills unmarked through the first episode.
 */
const NEEDLESS_STOP_REGRADE_SEC = 6;

/**
 * THE SAME TWO DEFECTS, FOR THE REST IN A ZONE WHERE ПРЕСТОЯТ IS FORBIDDEN —
 * seconds of held illegal rest AFTER the first bill before the breach is
 * re-graded (ILLEGAL_STOP_IN_BAN_ZONE; audit `sc-pk-double-park:11ddd063`).
 *
 * ── WHAT WAS MEASURED, THROUGH THE PRODUCTION STACK AT HEAD ─────────────────
 * `compileScenario(sc-pk-double-park) → createWorldRuntime(pk-double-v1) →
 * applyTick → buildLessonResult`, a car that stops in the lane beside the
 * parked row at y = 130 (inside the authored чл. 98 span [70, 210]) and simply
 * never moves again:
 *   coachedMistakes  ILLEGAL_STOP_IN_BAN_ZONE          ×1
 *   summary.mistakes (empty)                    score 0 наказателни точки
 * Fifty seconds standing where престоят е забранен, on the lesson whose ENTIRE
 * subject is that act, priced at nothing. This code is основна, so
 * `policyForViolation` hands the first bill to the teach-first free
 * mini-lesson — and `stepEpisode` bills ONCE per rest and never asks again, so
 * for a student who is shown the card and does not move, that free bill is the
 * only bill there will ever be.
 *
 * That is verbatim `STANDING_DUTY_REGRADE_SEC`'s defect, verbatim
 * `MOTORWAY_CRAWL_REGRADE_SEC`'s, `BUS_LANE_REGRADE_SEC`'s,
 * `OFF_CARRIAGEWAY_REGRADE_SEC`'s and `NEEDLESS_STOP_REGRADE_SEC`'s — and this
 * was the one member of that family with no re-grade sibling. It takes their
 * answer unchanged: a second episode object with a strictly larger threshold,
 * marked `regrade`, which `lessons/engine.ts` (`applyTick`, the
 * `alreadyCharged` guard) DROPS wherever the code has already been charged. So
 * exam mode is byte-identical (`coach.ts` scores unconditionally there, the
 * first bill IS the charge, and the re-grade is dropped before it can double
 * it), and a SECOND rest later in the same drive still costs one act.
 *
 * ── THE NUMBER ─────────────────────────────────────────────────────────────
 * 6 s, the same as the bus lane's, and by the same arithmetic: it is one and a
 * half times the 4 s `banZoneStopRestSec` that billed him in the first place,
 * so the re-grade means „he was shown the rule and then went on standing there
 * for half as long again". Ten seconds of held rest in total.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────
 *  · The detector's ACQUITTALS. Not one moves — the queue lead, the person in
 *    the path, the stop line / red light and the armed crossing are the same
 *    predicate (`illegalBanRest`), evaluated once and shared, so a rest that is
 *    innocent on the first threshold is innocent on the second.
 *  · The reset. Driving on above `movingSpeedKmh`, or leaving the span, zeroes
 *    BOTH episodes — a student who answers the card the way `correctiveBg`
 *    asks („подмини зоната и спри чак след края ѝ") can never be reached by
 *    this bill.
 *  · The recorded mistake demos. Measured on the committed traces: the two
 *    `sc-pk-double-park` demos hold 5,15 s and 5,65 s of rest and the
 *    `sc-pk-*` shadows rest only outside their spans, so every committed
 *    recording still grades its authored codes exactly once.
 *  · The praise gate at the foot of this file, which reads `s.banZoneStop` —
 *    already `emitted` from the first bill, so a second episode there would be
 *    redundant (the same reading `OFF_CARRIAGEWAY_REGRADE_SEC` states).
 */
const BAN_ZONE_REST_REGRADE_SEC = 6;

/**
 * THE SAME TWO DEFECTS, ON THE BUS LANE — seconds of qualifying travel after
 * the first bill before the breach is re-graded (w13 · lane „rules",
 * sc-ov-bus-lane:b309af77, 2026-08-27).
 *
 * ── WHAT WAS PHOTOGRAPHED, AND IT IS THE WHOLE LESSON ────────────────────────
 * `sc-ov-bus-lane` is a pure lane-choice drill: no staged actor, ambient zero,
 * and by its own spec „the only gradable act is which lane the driver travels".
 * Its briefing says it in one line — «движението на автомобили в бус лентата е
 * забранено, дори тя да е празна». BOTH audited legs finish with that act
 * ungraded:
 *  · `.audit-frames/w13/frames/sc-ov-bus-lane__pc-right/_audit-debrief.json` —
 *    «Грешки (4)», 10 наказателни точки, and the four are mirror, indicator,
 *    mirror, lane-keeping. Not one row names the bus lane.
 *  · `…__pc-wrong/_audit-debrief.json` — «Грешки (2)», both «Превишена
 *    скорост», on the leg whose authored mistake is literally
 *    «Пътуване по бус лентата» (`templates-lanes.ts`, codeRefs
 *    DRIVING_IN_BUS_LANE).
 * A lesson that cannot grade its own subject is the defect this product can
 * least afford, and this one could not grade it on either side.
 *
 * ── WHY, HALF ONE: THE SUSTAIN DEMANDED CONSECUTIVE SECONDS ──────────────────
 * The detector was on plain `stepEpisode`, whose clock is reset by ONE frame of
 * falsehood — and `busLaneCruise` carries `moving` (> `movingSpeedKmh` = 5).
 * The right leg's own `run.log` speed ladder, every sampled beat of the drive:
 *   45 · 1 · 0 · 0 · 1 · 3 · 0 · 12 · 3 · 0 · 4 · 15 · 9 · 0 · 10 · 16 · 0 · 3 · 14 …
 * Under 5 км/ч on more beats than over it, and never four unbroken seconds
 * above it in the whole 208 s run. The 4 s sustain was therefore unreachable on
 * the drive the lesson is about. This is verbatim `stepAccruedEpisode`'s own
 * motivating case one code over — the motorway crawl, «205 s … TWENTY-EIGHT
 * full stops … the one fault the lesson is named after never booked» — and the
 * shape is the same for the same reason: THE STOP-START CRAWL IS THE FAULT'S
 * OWN SHAPE. A bus lane is used precisely to creep past the queue it runs
 * beside. So the clock counts QUALIFYING seconds instead of demanding they be
 * consecutive; every per-frame gate the detector already carried is untouched,
 * and the ledger is still zeroed by the SAME reset (leaving lane 0 or leaving
 * the span), so a car that genuinely returns to the general lane starts over.
 *
 * ── WHY, HALF TWO: THE ONE BILL WAS SPENT ON THE FREE LESSON ─────────────────
 * DRIVING_IN_BUS_LANE is основна (3), so `policyForViolation` returns
 * `undefined` and `ev-lane-discipline`'s `policyDefault`
 * („teach-first-then-grade") governs: the FIRST encounter is taught, not
 * charged. `stepEpisode` bills once per episode and never asks again — so even
 * on the fast leg, where the sustain WAS reachable, the single bill lands on a
 * teach card and the ledger stays empty. That is verbatim
 * `STANDING_DUTY_REGRADE_SEC`'s defect and verbatim `MOTORWAY_CRAWL_REGRADE_SEC`'s
 * (whose code shares this one's `teach-first-then-grade` mapping), so it takes
 * their answer: a second episode object with a strictly larger accrued
 * threshold, marked `regrade`, which `lessons/engine.ts` (`applyTick`, the
 * `alreadyCharged` guard) DROPS wherever the code has already been charged.
 *
 * ── THE NUMBER ───────────────────────────────────────────────────────────────
 * 6 s, the same as the crawl's, and for the same argument: it is one and a half
 * times the 4 s window that billed him in the first place, so the re-grade
 * means „he was shown the rule and then went on travelling the bus lane for
 * half as long again". A student who answers the card the way the lesson asks —
 * mirror, left indicator, out into the general lane — trips the reset and
 * accrues nothing, so this bill can never reach him. And it must reach the
 * drive that was photographed: 208 s in the lane, so six accrued seconds is
 * spent many times over.
 *
 * ── WHAT THIS DELIBERATELY DOES NOT TOUCH ────────────────────────────────────
 *  · The detector's GATES. Not one moves — the ≤3 s right-turn transit, the
 *    declared-right-indicator exemption, the single-lane degenerate span and
 *    the reverse exemption are the same predicates, and `line-marking-
 *    detectors.test.ts` still holds them.
 *  · `EMERGENCY_LANE_DRIVING`, this detector's twin two blocks down. It shares
 *    the consecutive-sustain shape exactly and is a candidate for the same
 *    first half — but it is опасна, so `policyForViolation` returns
 *    „always-grade" and the re-grade half is dead there by construction, and no
 *    frame in this wave photographs a CRAWL in an emergency lane. Measured, not
 *    assumed: it is reported, not widened here.
 */
const BUS_LANE_REGRADE_SEC = 6;

/**
 * SECONDS OFF THE CARRIAGEWAY BEFORE `OFF_CARRIAGEWAY` IS BILLED (чл. 15, ал. 1).
 *
 * A MODULE CONSTANT AND NOT A `RuleEngineConfig` FIELD, on the same rule the
 * other constants in this block follow: every `*SustainSec` in `types.ts` is
 * there because some drill wants it moved, and no drill has any business
 * dialling „stay on the road" — there is no lesson for which leaving the
 * carriageway later is the taught behaviour. A dial nobody may turn is one more
 * surface to keep in agreement with itself.
 *
 * ── FROM BELOW: THE FALSE CONVICTION, AND WHAT IS ALREADY PAID FOR ───────────
 * The kerb clip this threshold looks like it is guarding was ALREADY SPENT, one
 * layer down, before this file sees anything. `edgeId` goes null only when the
 * car's CENTRE is more than `surface.ts OFF_CARRIAGEWAY_BODY_ALLOWANCE_M` =
 * 0.97 m outside the kerb — 0.85 m of chassis half-width plus the 0.12 m kerb
 * this engine makes deliberately drivable so a scuff is a thump and not a crash.
 * The cross-section is measured, on ov-oncoming-v1 at y = 400
 * (`runtime/__tests__/off-carriageway-consult.test.ts`): two wheels over the
 * kerb is 0.475 m out and STILL reports its edge; the whole flank past the kerb
 * is 0.975 m. So a car clipping an apex on a legitimate line never reaches this
 * detector at all, and the sustain is not what protects it.
 *
 * WHAT THE SUSTAIN DOES BUY is the full-flank excursion that is corrected at
 * once: the centre crosses 0.97 m out and comes straight back, ≈1.9 m of lateral
 * travel. This file's own premise for what „a brief drift" costs in time is
 * `laneKeepSustainSec` = 3 s across a 3.5 m lane, i.e. ~1.2 m/s of lateral
 * correction; 1.9 m at that rate is ~1.6 s. Two seconds clears the corrected
 * excursion with margin and convicts the one that is not corrected.
 *
 * TWO SECONDS IS DELIBERATELY SHORTER THAN `emergencyLaneSustainSec`'s 3 s, and
 * the ground is the travel measurement above — ALONE. This block used to derive
 * the difference from law: the лента за принудително спиране has a LAWFUL use
 * (чл. 58, т. 3 permits the breakdown stop) so its threshold must buy an
 * innocence this one need not, because „no clause of ЗДвП lets a car travel or
 * stand on the тротоар or the банкет … neither surface is ever a lawful place
 * for a car to be". THE SECOND HALF IS FALSE — ЗДвП чл. 94 refutes it twice
 * over — so the claim is withdrawn rather than softened. Read out of
 * `content/law/acts/zdvp.json` on 2026-08-30:
 *   ал. 3: „Допуска се престой и паркиране на моторни превозни средства с
 *   допустима максимална маса до 2,5 тона върху тротоарите само на определените
 *   от собствениците на пътя или администрацията места, успоредно на оста на
 *   пътя, ако откъм страната на сградите остава разстояние най-малко 2 метра за
 *   преминаване на пешеходци." — a lawful car standing ON the тротоар.
 *   ал. 1/2: „За престой [паркиране] извън населените места пътните превозни
 *   средства се спират извън платното за движение. Паркирането на платното за
 *   движение е забранено." — outside a built-up area the law REQUIRES the car to
 *   leave the carriageway, and the банкет is where it goes.
 * WHAT SURVIVES IS TOO NARROW TO SET THIS NUMBER. чл. 15, ал. 1, чл. 15, ал. 5
 * and § 6, т. 6 are all about ДВИЖЕНИЕ, and this detector deliberately carries
 * no `moving` conjunct (see the reducer's own note at the OFF_CARRIAGEWAY
 * block) — it grades exactly the STANDING case чл. 94 can make lawful. A legal
 * asymmetry that does not cover the detector's own scope cannot be its
 * threshold's ground, and `railRestSustainSec` being 2 s as well is now a
 * coincidence of two derivations rather than a shared reason.
 * SO: 1.9 m of lateral excursion at this file's own ~1.2 m/s drift premise is
 * ~1.6 s, and 2 s clears it with margin. That sentence is the whole derivation.
 * AND THE RESIDUAL чл. 94 LEAVES, named because no sustain can close it: a car
 * lawfully parked in a marked pavement bay, or lawfully pulled off the road
 * outside a built-up area, is off the carriageway for as long as it likes and
 * this reducer cannot tell it from an excursion. What keeps that car clean today
 * is GEOMETRY, not law — all 117 authored parking-bay centres and every kerbside
 * band of all 105 districts read `carriageway`
 * (`runtime/__tests__/off-carriageway-consult.test.ts`) — so the day a district
 * authors a bay outside the kerb or a rural pull-off, this row convicts it and
 * the fix is a lawful-standing surface in the world, not a longer sustain.
 * NOT SHORTER STILL: `solidLineCrossSustainSec`'s 0.6 s is an anti-jitter guard
 * on a boolean that genuinely flickers (a centre dancing on the paint).
 * `edgeId` does not flicker — it is a containment test against static polygons —
 * so none of this 2 s is spent on noise, and all of it on the correction.
 *
 * ── FROM ABOVE: IT HAS TO REACH THE EXHIBITS ────────────────────────────────
 * All three are tens of seconds, so any bar under ~10 s closes them and 2 s is
 * not chosen to make them fire: `sc-ac-truck-spray/mobile-wrong` 04-t102s (145
 * км/ч across open field, no road in frame), `sc-sp-curve/mobile-wrong` 04-t154s
 * (96 км/ч on a green plane), `sc-rb-exit-signal/mobile-right` (at REST on the
 * roundabout island). `sc-junction-blind` pc/right is off the world from
 * t ≈ 63–74 s to t = 209 s — at least 135 s.
 *
 * ── WHAT THIS NUMBER CANNOT DO ──────────────────────────────────────────────
 * It cannot protect the frame-zero placeholder pose, because that pose is not an
 * excursion and no threshold distinguishes it from one. MEASURED while writing
 * this: on 7 of the 105 shipped districts the district ORIGIN — where
 * `scene/vehicleSample.ts` parks the placeholder until the chassis publishes —
 * reads `edgeId === null` (d2-v1, district-v1, lc-gantry-v1, rb-2lane-v1,
 * rb-mini-v1, rb-ped-v1, rb-single-v1). `applyTick` runs this reducer on those
 * frames unconditionally („the law applies from second zero"), so the guard is a
 * separate conjunct in the detector below and not a longer sustain here.
 */
const OFF_CARRIAGEWAY_SUSTAIN_SEC = 2;

/**
 * SECONDS STILL OFF THE CARRIAGEWAY, AFTER THE FIRST BILL, BEFORE THE BREACH IS
 * RE-GRADED (`sc-ov-oncoming-gap:83420a40`, critical — „no off-route stop, no
 * reset, NO PENALTY").
 *
 * ── THE DEFECT, MEASURED THROUGH THE SHIPPED STACK ──────────────────────────
 * The stop landed (`lessons/finish.ts` ends the drive 75 s off the network) and
 * the code landed (`OFF_CARRIAGEWAY`, above). The PENALTY did not. Driven
 * through the real `createWorldRuntime` on the row's own district
 * (ov-oncoming-v1) and the real `applyTick` on the compiled `sc-ov-oncoming-gap`
 * — car over the kerb at t = 10,5 s at 97 км/ч and never back:
 *   reducer  OFF_CARRIAGEWAY at t = 12,5 s — fired, once, exactly as designed
 *   debrief  «Второстепенни 5», all five SPEEDING_OVER_LIMIT; ИЗДЪРЖАН;
 *            OFF_CARRIAGEWAY present only in `coachedMistakes`, worth 0 points
 * `severityClass: "osnovna"` ⇒ `policyForViolation` returns undefined ⇒
 * teach-first-then-grade ⇒ the FIRST bill is taught, not charged — and this
 * detector bills ONCE per excursion, so a student who leaves the road and stays
 * off it is never asked a second time and pays nothing for it. That is verbatim
 * `STANDING_DUTY_REGRADE_SEC`'s defect, verbatim `MOTORWAY_CRAWL_REGRADE_SEC`'s
 * and verbatim `BUS_LANE_REGRADE_SEC`'s, so it takes their answer: a second
 * episode object with a strictly larger threshold, marked `regrade`, which
 * `lessons/engine.ts` (`applyTick`, the `alreadyCharged` guard) DROPS wherever
 * the code has already been charged. EXAM MODE IS BYTE-IDENTICAL to today —
 * `coach.ts` scores unconditionally there, so the first bill IS the charge and
 * the re-grade is dropped before it can double it (the guard `__tests__/
 * exam-mode.test.ts` already pins for the standing-duty family). In training it
 * moves the ledger in exactly one place: the excursion whose only bill was spent
 * on the free lesson. A SECOND excursion in the same drive is unchanged too —
 * its own bill grades on the prior encounter and its re-grade is dropped, so two
 * departures still cost two acts and never four.
 *
 * ── THE NUMBER ──────────────────────────────────────────────────────────────
 * 6 s, the same as the crawl's and the bus lane's, but it is NOT inherited: it
 * is 1,5 × this code's own 2 s window (the family's rule ⇒ 3 s) PLUS the ~1,6 s
 * of lateral travel the sustain's own derivation measures for getting the centre
 * back inside the kerb (1,9 m at this file's ~1,2 m/s drift premise), plus the
 * remainder as reaction margin. The corrective here is a STEERING recovery, not
 * a lifted pedal, so it is the slowest answer in the family and gets the widest
 * gap: eight continuous seconds off the asphalt before the second bill.
 * A student who answers the card the way `correctiveBg` asks — ease off, wheels
 * straight, back on at a shallow angle — trips the reset (`edgeId` is a string
 * again) and zeroes BOTH episodes, so this bill can never reach him.
 * And it must reach the drives that were photographed: they are all tens of
 * seconds off the road (this row's own frame is at t = 146 s), so eight is spent
 * many times over.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────
 *  · The detector's gates. The placeholder-pose guard, the reset and the
 *    crash-swallow are the SAME predicates, evaluated once and shared — a
 *    departure a collision caused is still one act and is still not billed
 *    twice, at either threshold.
 *  · The praise gates. They read `s.offCarriageway`, which is already `emitted`
 *    from the first bill; a second episode there would be redundant.
 */
const OFF_CARRIAGEWAY_REGRADE_SEC = 6;

/**
 * THE SAME FAMILY, ON THE RED DASHBOARD TELLTALE — accrued seconds of driving
 * on WITHOUT BEGINNING TO SLOW after the ignore bill (VP-06 / N11, audit
 * `sc-vp-telltale-red:c172d48b`).
 *
 * ── WHAT WAS MEASURED, THROUGH THE PRODUCTION CHAIN AT HEAD ─────────────────
 * `tools/audit/inprocess-drive.mjs --lesson sc-vp-telltale-red --rung 1`, a
 * script that holds the right lane at 55 км/ч from the spawn to the end of
 * ln-v1 and never stops — i.e. the row's own sentence, „a student who treats a
 * red lamp as a yellow one and keeps driving WITHOUT CRASHING":
 *   reducer  WARNING_LAMP_IGNORED at t = 20,5 s — fired, exactly as designed
 *   sheet    опасни 0/0 · основни 0/0 · второстепенни 0/0 · Общо 0
 *   debrief  the code under «Учебни моменти (не влизат в точките)»
 * The row's verdict, verbatim, on the изпитен лист: faultless.
 *
 * ── WHY, AND IT IS NOT THE EMITTER ──────────────────────────────────────────
 * The emitter landed at `b8b1ce4` (2026-09-02) and works. `WARNING_LAMP_IGNORED`
 * is основна, so `policyForViolation` returns undefined and teach-first governs:
 * the FIRST encounter is the founder-ratified free mini-lesson. And the telltale
 * runner resolves EXACTLY ONCE PER DRIVE (its own class doc; `phase` goes
 * "resolved" and `step` returns immediately after), while `prior` is counted per
 * TOPIC per DRIVE (`scenarios/coach.ts` — „one free lesson per topic"). So the
 * only bill this duty can ever produce is spent on the card, on every attempt,
 * for ever — and the debrief prints this engine's own promise, «Първата среща не
 * се наказва … При повторение вече влиза в изпитния лист», over a drive that can
 * have no повторение because nothing asks a second time.
 *
 * That is verbatim `STANDING_DUTY_REGRADE_SEC`'s defect, verbatim
 * `MOTORWAY_CRAWL_REGRADE_SEC`'s, `BUS_LANE_REGRADE_SEC`'s,
 * `BAN_ZONE_REST_REGRADE_SEC`'s and `OFF_CARRIAGEWAY_REGRADE_SEC`'s, so it takes
 * their answer unchanged: ONE more bill, marked `regrade`, which
 * `lessons/engine.ts` (`applyTick`, the `alreadyCharged` guard) DROPS wherever
 * the code has already been charged. Exam mode is byte-identical (`coach.ts`
 * scores unconditionally there, so the first bill IS the charge and the re-grade
 * is dropped before it can double it).
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * It is NOT the founder question w37 flagged and declined („a red warning lamp
 * may be the one case where a first-offence amnesty is wrong on safety
 * grounds"). Carving an exception out of teach-first would charge the student on
 * the very beat the lesson exists to teach. Teach-first is untouched here: the
 * first encounter is still free, still shown as a card, still worth zero. What
 * changes is that the ESCALATION the card promises becomes reachable.
 *
 * ── THE CONDITION IS „HAS HE BEGUN TO COMPLY", NOT „IS HE STILL MOVING" ─────
 * A plain still-moving clock would convict the student who IS obeying: from the
 * posted 50 (13,9 m/s) a calm 1,5 m/s² pull-over — «плавно намаляване», which is
 * literally what `correctiveBg` asks for — takes over nine seconds, and a slam
 * to beat the clock is the OTHER wrong answer this drill is built to punish
 * (`HARSH_BRAKING_NO_CAUSE`, the „Паническо спиране" demo). So the clock stops
 * the instant the car has actually shed speed, and runs only while it has not:
 * the question is whether he is SLOWING, never whether he has FINISHED.
 * `WARNING_LAMP_COMPLY_DROP_KMH` is that test — and until 2026-09-14 it asked
 * whether he had EVER slowed since the bill, which is a different question
 * with a different answer for the one student this row is about (see there).
 *
 * ── THE NUMBER ──────────────────────────────────────────────────────────────
 * 6 s, and it is `SPEED_REGRADE_SEC`'s number for `SPEED_REGRADE_SEC`'s stated
 * reason: the corrective act being waited for is ONE PEDAL — lifting off is the
 * first line of the card the student has just dismissed — so it does not get the
 * ten seconds `STANDING_DUTY_REGRADE_SEC` gives a hand that may be wanted on the
 * wheel, nor the eight `OFF_CARRIAGEWAY_REGRADE_SEC` gives a steering recovery.
 * Six seconds of holding pace after being told «спри безопасно СЕГА» is a
 * refusal, not a reaction.
 * And it reaches the drive that was measured: the bill lands at 20,5 s of a
 * 29,9 s full-route drive-on, so six accrued seconds is spent with room to
 * spare — while a student who lifts off at any point in those six seconds
 * trips the reset and can never be reached by this bill at all.
 *
 * ── WHAT IT DELIBERATELY DOES NOT TOUCH ─────────────────────────────────────
 *  · The EMITTER. Not one gate of the runner's ignore branch moves; a drive
 *    that books nothing today books nothing after this. The re-grade is armed
 *    only by the first bill, so no drive that was never billed can meet it.
 *  · The AMBER lamp. It authors no halt contract and emits nothing, so nothing
 *    here can arm on it — carrying on IS its taught answer.
 *  · `POLICE_STOP_SIGNAL_IGNORED`, the twin one runner down. It is основна and
 *    ITS runner also resolves once per drive, so it has the same shape — but no
 *    frame in this wave photographs it, and this file's own discipline is that
 *    an unphotographed neighbour is reported, not widened into. Reported.
 */
const WARNING_LAMP_REGRADE_SEC = 6;

/**
 * How much speed the driver must have SHED within the last
 * `WARNING_LAMP_REGRADE_SEC` for the re-grade above to count him as
 * responding, km/h.
 *
 * ── „WITHIN THE LAST SIX SECONDS", NOT „SINCE THE BILL" (2026-09-14) ─────────
 * The baseline used to be the fastest the car had gone SINCE the bill, and it
 * never came down. So the first 5 км/ч shed was a permanent acquittal: a
 * student who lifted off once and then drove on at the lower pace was „still
 * complying" for the rest of the drive. That is the row's own sentence —
 * `sc-vp-telltale-red:c172d48b`, „a student who treats a red lamp as a yellow
 * one and keeps driving without crashing" — because the yellow lamp's taught
 * answer IS „ease off and carry on carefully". MEASURED through
 * `compileScenario → recordScriptedDrive → applyTick` on ln-v1 at L1, the
 * runner billing the ignore at 23,7 s at 45 км/ч:
 *
 *   held 45 to the end of the road       → re-grade @ 29,7 s, Общо 3 (pinned
 *                                           in telltale-red-sweep161.test.ts)
 *   eased to 30 at y = 275, drove on     → NO re-grade, «Общо 0» — BEFORE
 *                                         → re-grade @ 36,3 s, Общо 3 — AFTER
 *
 * and `.audit-frames/w46/frames/sc-vp-telltale-red__pc-wrong` is the same
 * shape in the wild: a 57 км/ч peak, then plateaus in the low fifties with
 * stops between them, «Продължаване с червена контролна лампа» under «Учебни
 * моменти (не влизат в точките)» and nothing on the sheet.
 *
 * So the drop is now read against the fastest speed of the last six seconds
 * (`warningLampRecent`): the student who is slowing keeps shedding, and stays
 * acquitted for as long as he does; the student who eased off and then HELD a
 * pace stops shedding, and six seconds later his clock is running again. The
 * window is the re-grade's own six seconds, not a new number, and it is the
 * right size for a reason of its own: 5 км/ч in 6 s is a mean of 0,23 m/s²,
 * the size of the chassis's rolling resistance on its own (280 N on 1 220 kg,
 * `vehicle/tuning.ts`), before the linear damping (24,4·v N at 12 m/s is
 * another ~0,24 m/s²) and the drag a real lift-off adds on top — so a lifted
 * foot still counts as slowing, and the promise below («a genuine lift-off is
 * credited») survives.
 *
 * WHAT IS UNCHANGED: the reset is still the reset — the moment he IS slowing
 * the ledger is zeroed, so reaction seconds before a real pull-over are
 * forgiven exactly as before; a full stop still complies; the arm, the single
 * re-grade and the `regrade` marking are untouched; and `orchestrator/
 * __tests__/telltale-stimulus.test.ts`'s 1 m/s² pull-over stays acquitted.
 * WHAT IT STILL CANNOT REACH, written down: a student who eases off inside the
 * last ~11 s of the road (≈ five seconds for the old pace to leave the window,
 * six to accrue). On ln-v1 that is the final ~115 m at 38 км/ч; the drive ends
 * first. A settle-at-drive-end in the `settleUnpaidSpeedingTeach` shape would
 * close it, and its consumer is `lessons/engine.ts`, not this file.
 *
 * A DROP, NOT A LEVEL, and for the reason `EM_YIELD_DROP_KMH`
 * (orchestrator/runners.ts) was written against one lesson over: an absolute
 * „is he slow now" test pays the car that was already slow and never changed
 * pace, which on that row was measured as a free certificate for a drive that
 * did nothing at all. The mirror of that failure here would be a free
 * conviction for a car that was already crawling, so the test is the same one
 * in the same direction: did the driver DO something.
 *
 * 5, the same as `EM_YIELD_DROP_KMH` and for its stated derivation: it is above
 * the ripple a car holding a target speed shows against the tier governor —
 * which is the only thing it must clear to stop reading a steady hold as a
 * response — and low enough that a genuine lift-off is credited within the
 * first second of it (13,9 m/s at even 1,5 m/s² sheds 5 км/ч in under a second).
 */
const WARNING_LAMP_COMPLY_DROP_KMH = 5;

/**
 * The frame-zero placeholder's motion floor, km/h — the local mirror of
 * `lessons/engine.ts POSE_MOTION_KMH` (0.5). Duplicated rather than imported
 * because `rules/` is the leaf module and importing `lessons/` would invert the
 * dependency the whole module boundary rests on (docs/architecture/05). Kept at
 * the same value on purpose: two numbers for „the chassis has not published yet"
 * would rot apart, and this comment is the pin that says they are one claim.
 */
const POSE_PLACEHOLDER_KMH = 0.5;

/**
 * THE HARSH-BRAKE LINE IS EXCLUSIVE, AND THE COMPARISON SAYS SO IN A WAY
 * FLOATING POINT CANNOT OVERRULE (2026-08-29 · `sc-follow-tailgater:f42dce4f`).
 *
 * `harshBrakeDecelMps2` is the boundary of „emergency-grade", and its own
 * config note says a firm 4–5 m/s² stop never fires. A deceleration that merely
 * EQUALS the boundary is therefore the ambiguous case, and A12 spends an
 * ambiguity on the acquittal. Left to a bare `>=` the verdict is not decided by
 * that rule but by rounding: instrumented on the make-way leg of
 * `orchestrator/__tests__/emergency-approach.test.ts` — whose fixture driver
 * (`helpers.ts` `PolyDriver.advance`) brakes at a limit of exactly 7 m/s², so
 * every fixture-driven slow-down in that suite sits precisely on the line —
 * seventeen consecutive frames all reading `a = -7.0000` had `accelMps2 <= -7`
 * answer TRUE on six of them and FALSE on eleven.
 *
 * RELATIVE, and 1e-9: twelve orders of magnitude above the ~1e-15 relative
 * drift these sums accumulate, and eleven below any deceleration difference a
 * car can produce. It can only ever decide the exact tie, and it decides it the
 * same way every time. It is applied to the SUSTAIN's mean, which is the gate
 * that bills; the per-frame `harshDecel` reading keeps its shipped comparison,
 * because there it only chooses whether a frame is credited and the mean has
 * the last word either way.
 *
 * (The constant itself now lives in `harshBrakeEpisode.ts`, imported above, so
 * the one harsh-brake line is shared with the question asked of ANOTHER
 * vehicle — sc-ac-wind-truck-pass:ff1d4290 round 3.)
 */

/**
 * WRONG_WAY on an АВТОМАГИСТРАЛА — the card names the road the student is on
 * (w10-4, sc-merge-accel-lane:93685d58, 2026-08-25).
 *
 * THE FRAME. `.audit-frames/w10-4/frames/sc-merge-accel-lane__mobile-wrong/
 * 08-debrief-p6.png` and its `_audit-debrief.json`: six identical cards reading
 * «Движение в обратна посока по еднопосочна улица … Движеше се срещу платното
 * на еднопосочна улица … Влизай в еднопосочна само по посока на движението»,
 * in the lesson «Включване в магистрала през лентата за ускоряване», on a drive
 * the same sheet also bills «Движение по аварийната лента». There is no street
 * in this district and no В2 anywhere in it — the card describes a place the
 * student was never in, on the gravest row he collected.
 *
 * THE CLAUSE IS RIGHT AND THE TITLE IS WRONG, which is why this is copy and not
 * a code. Наредба № 38, прил. № 5, т. 10, б. „в" — quoted verbatim in `n38.ts`
 * — reads „когато изпитваният навлезе срещу движението на ПЪТЕН ВЪЗЕЛ или път с
 * еднопосочно движение": the article names the interchange FIRST and the
 * one-way street second, and a motorway carriageway is both one-way and a
 * пътен възел. So the mark, the severity and the citation stand exactly as
 * billed; only the sentence the student reads was written for the other half
 * of the clause. Same argument as the Б1/Б2 split (`catalog.ts`
 * JUNCTION_SCAN_CONTROL_COPY) — copy keyed on the act, no new code, no severity
 * or points change.
 *
 * AND THE CORRECTIVE COULD HAVE KILLED HIM. `correctiveBg` has no per-event
 * channel (read from the catalogue BY CODE at display time — see the note on
 * JUNCTION_SCAN_CONTROL_COPY), and the catalogue's said „спри веднага, включи
 * аварийните и излез внимателно на заден ход". On a motorway that is ЗДвП
 * чл. 58, т. 1 („забранено е … движение на заден ход") given as advice, at
 * 140 км/ч closing speeds. The catalogue's corrective was therefore rewritten
 * to be true of BOTH roads rather than split here — the same repair the
 * снеговалеж entry describes two blocks down.
 *
 * THE COPY ITSELF IS NOT HERE, and that is the correction this repair took on
 * its verifier pass. It first rode `makeViolation`'s `titleBg`/`explanationBg`
 * override, the way `JUNCTION_SCAN_COPY` below then did — and neither field
 * crosses `wire.ts`. `serializeRuleEvents` carries `kind`, `code`, `t`,
 * `detail`, `penaltyMultiplier`, `x/y`, so `rebuildRuleEvents` rebuilt the
 * pooled street row on the server and the end screen printed «…по
 * автомагистрала» in «Грешки» beside «…по еднопосочна улица» in «Разбор». So
 * the road travels as `detail`, which DOES cross, and the copy lives in
 * `catalog.ts WRONG_WAY_ROAD_COPY` where `actCopy` reaches it from both sides.
 *
 * THIS PARAGRAPH USED TO END WITH A FALSE EXCUSE, and it is worth keeping the
 * correction where the claim was made (ADR-009 lane R, 2026-09-18). It said
 * „JUNCTION_SCAN_COPY gets away with the override because its events are billed
 * inside a pre-drive/junction path that is retitled again on rebuild; this one
 * is not". No such path exists: `rebuildRuleEvents` retitles through
 * `preDriveStepTitle`, which answers for PREDRIVE_WRONG_ORDER and
 * PREDRIVE_STEP_SKIPPED only, and only for a `detail` that is a
 * `PreDriveStepId`. JUNCTION_SCAN_INCOMPLETE was rebuilt POOLED on the server
 * for as long as that sentence stood — the very defect this block describes,
 * two hundred lines below its own diagnosis. It has now made the same trip
 * (`catalog.ts JUNCTION_SCAN_CONTROL_COPY`), and „both surfaces happen to agree
 * today" is what this codebase has already been burned by three times
 * (wire.ts's `situation` note; FaultCard's; this).
 *
 * WHAT IS ROUTED, NOT PATCHED. `realWorldBg` has no per-event channel either
 * and still prices the street case (чл. 183, ал. 4 — 100 лв.); the motorway
 * case is чл. 178ж, ал. 1 (три месеца + 1000 лв.), which `consequences.ts`
 * already carries at the аварийна лента row. Splitting that string needs a
 * per-event road-price channel through `SessionEndScreen`'s FaultCard, which
 * is not this seam. Reported.
 *
 * SETTLED WITHOUT THAT CHANNEL — w12, 2026-08-27. The seam still cannot see
 * `detail`, so `consequences.ts ROAD_CONSEQUENCES.WRONG_WAY` stopped asserting
 * ONE price: it is a `conditional` row whose two branches are the two roads.
 * Nothing in this file moved for it, and `realWorldBg` stays unreachable for
 * this code.
 *
 * NOT the whole row either, and said out loud: the SIX bills are the flicker
 * half, and `WRONG_WAY_REARM_SEC` above owns it. This changes what one bill
 * SAYS, not how many there are.
 */

/**
 * THE TWO ACT TABLES THAT USED TO LIVE HERE — moved to `rules/catalog.ts` by
 * ADR-009 lane R, 2026-09-18. `JUNCTION_SCAN_COPY` (Б1 / Б2) is now
 * `JUNCTION_SCAN_CONTROL_COPY` and `SNOW_LIGHTS_COPY` is `SNOW_LIGHTS_ACT_COPY`,
 * both registered in `PER_ACT_COPY`; the retrieved articles, the founder's
 * frame and the `correctiveBg` reasoning moved with the text, unchanged.
 *
 * WHY THEY COULD NOT STAY. They rode `makeViolation`'s
 * `titleBg`/`explanationBg` override channel WITHOUT a `detail`, and that
 * channel dies at the wire: `serializeRuleEvents` carries `kind`, `code`, `t`,
 * `detail`, `penaltyMultiplier` and `x/y`, so `rebuildRuleEvents` rebuilt the
 * POOLED «Непълно оглеждане на кръстовището» on the server and the two halves
 * of one debrief named two different acts. The WRONG_WAY block above used to
 * excuse this pair — „JUNCTION_SCAN_COPY gets away with the override because
 * its events are billed inside a pre-drive/junction path that is retitled again
 * on rebuild" — and that sentence was never true: `rebuildRuleEvents`'s only
 * retitler is `preDriveStepTitle`, which answers for PREDRIVE_WRONG_ORDER and
 * PREDRIVE_STEP_SKIPPED alone and only for a `detail` that is a
 * `PreDriveStepId`. So the control and the condition now travel as `detail`,
 * which does cross, and both sides resolve the same title through `actCopy`.
 *
 * Nothing about the GRADE moved: same codes, same severities, same points, same
 * arming conditions, same `lawRef`. `rules/__tests__/act-copy-control.test.ts`
 * holds the parity and refuses a new override-without-detail call anywhere in
 * platform/src.
 */

/**
 * WHICH low-beam duty is live — night, rain or snowfall — or null when the
 * conditions demand no lamps at all.
 *
 * O35, AND WHY THIS IS A FUNCTION RATHER THAN THREE INLINE CONDITIONS. The
 * same hole was found twice by two audit rounds from two sides, because the
 * duty had two independent derivations and no owner:
 *   · round 6 (O28) found the GRADER had no snow arm — a lesson ordering
 *     «включи късите светлини» that the engine could not check;
 *   · round 8 (O35) found the DASHBOARD had no lights row for it either —
 *     `LessonScene.tsx` publishes `headlightsRequired = isNight || rain`, and
 *     `compile.ts` makes the weathers EXCLUSIVE (rain/fog/snow are three
 *     separate booleans), so no snow drive can ever satisfy that bit.
 * A student handed a dark car on `sc-ac-snow`, shown nothing, and then billed
 * for it is the founder's own roundabout complaint wearing a different coat.
 *
 * So the precedence lives HERE, once, and `hud/telltaleWarnings.ts` imports it
 * instead of restating it: what the telltale SHOWS and what the engine GRADES
 * now come from one place, and a drift needs an edit to this function rather
 * than an unnoticed disagreement between two files.
 *
 * The order is the order the three arms below fire in, and each exclusion
 * answers a double bill rather than tidiness: night carries no exclusion and is
 * the основна row; rain is guarded `!isNight`; snow is guarded `!rain &&
 * !isNight` and reuses the rain row's CODE (with the `detail: "snow"` act copy,
 * `catalog.ts SNOW_LIGHTS_ACT_COPY`) because чл.
 * 70, ал. 1 is one duty. A snowy night bills the night row once — here and in
 * the HUD alike.
 *
 * `rules/__tests__/low-beam-duty-one-source.test.ts` drives all sixteen
 * (night, rain, snow, fog) combinations through BOTH consumers and fails if
 * they ever disagree.
 */
export type LowBeamDuty = "night" | "rain" | "snow" | null;

export function lowBeamDuty(c: {
  isNight?: boolean;
  rain?: boolean;
  snow?: boolean;
}): LowBeamDuty {
  if (c.isNight === true) return "night";
  if (c.rain === true) return "rain";
  if (c.snow === true) return "snow";
  return null;
}

export function createRuleEngine(config?: Partial<RuleEngineConfig>): RuleEngineState {
  return {
    config: { ...DEFAULT_RULE_CONFIG, ...config },
    prevT: null,
    prevLaneId: null,
    prevEdgeId: undefined,
    laneChange: { pending: [], lastBasisChangeAt: null },
    prevSpeedKmh: null,
    speedWindow: [],
    crawlSpeedWindow: [],
    prevLeadGapM: null,
    leadTrack: [],
    leadMemory: {
      enteredAt: null,
      brakingAt: null,
      demandAt: null,
      heldCause: false,
      nullSinceReading: false,
      farEnteredAt: null,
      farBrakingAt: null,
      farClosingAt: null,
    },
    leadOdoM: 0,
    leadPosOdoM: 0,
    lastLeadNearAt: null,
    overtakePullOutAt: null,
    lastLaneArrow: null,
    lastIndicatorOnAt: { left: null, right: null },
    lastGlanceAt: { left: null, right: null, rear: null, shoulder: null },
    scanStopCreditSec: { left: 0, right: 0 },
    stop: { stoppedSince: null, lastQualifyingStopAt: null, movingSinceStopSec: 0 },
    speedingMinor: { ...IDLE_EPISODE },
    speedingMinorRegrade: { ...IDLE_EPISODE },
    speedingDangerous: { ...IDLE_EPISODE },
    seatbelt: { ...IDLE_EPISODE },
    handbrake: { ...IDLE_EPISODE },
    handbrakeMoveOff: { ...IDLE_EPISODE },
    headlights: { ...IDLE_EPISODE },
    laneKeeping: { ...IDLE_EPISODE },
    conditionsSpeed: { ...IDLE_EPISODE },
    conditionsSpeedRegrade: { ...IDLE_EPISODE },
    taskCap: { ...IDLE_EPISODE },
    taskCapRegrade: { ...IDLE_EPISODE },
    taskCapBlownAtSeen: null,
    taskAct: { ...IDLE_TASK_ACT },
    taskArrival: null,
    taskArrivalPending: null,
    taskSignResetSince: null,
    taskSignAct: null,
    taskSignLatches: null,
    rainLights: { ...IDLE_EPISODE },
    fogLights: { ...IDLE_EPISODE },
    snowLights: { ...IDLE_EPISODE },
    following: { ...IDLE_EPISODE },
    wrongWay: { ...IDLE_EPISODE },
    wrongWayEntry: null,
    keepRight: { ...IDLE_EPISODE },
    crossing: null,
    contactEpisodes: {},
    cutInContactUntil: null,
    cutInActUntil: {},
    laneEntryWatch: {},
    contactOdometerM: 0,
    contactReverseOdometerM: 0,
    actBills: {},
    prevPosition: null,
    lastLeadApartAt: null,
    lastGapClearAt: null,
    terminated: false,
    cleanDistanceM: 0,
    stall: { ...IDLE_EPISODE },
    stopOvershoot: { ...IDLE_EPISODE },
    stopOvershootGreenSeen: false,
    inLaneSeen: false,
    centerLine: { ...IDLE_EPISODE },
    hesitation: { ...IDLE_EPISODE },
    hesitationGreenEntry: null,
    harshBrake: {
      activeSince: null,
      emitted: false,
      onsetKmh: 0,
      causeSeen: false,
      qualifiedSec: 0,
      lastQualAt: null,
      flooredSince: null,
      flooredAt: null,
      flooredBilled: false,
      followerForcedAt: null,
      followerAnswerSec: 0,
    },
    moveOff: { restSeen: false, done: false },
    lastHazardEventAt: null,
    standstillGap: { ...IDLE_EPISODE },
    highBeamDip: { ...IDLE_EPISODE },
    followingRain: { ...IDLE_EPISODE },
    leadClosing: { ...IDLE_EPISODE },
    banZoneStop: { ...IDLE_EPISODE },
    banZoneStopRegrade: { ...IDLE_EPISODE },
    solidCross: { ...IDLE_EPISODE },
    solidCrossTurn: SOLID_CROSS_TURN_IDLE,
    busLane: { ...IDLE_EPISODE },
    busLaneCruiseSec: 0,
    busLaneRegrade: { ...IDLE_EPISODE },
    busLaneRegradeSec: 0,
    rail: { approachSeen: false, prevPhase: null },
    railRest: { ...IDLE_EPISODE },
    curveSpeed: { ...IDLE_EPISODE },
    motorwaySlow: { ...IDLE_EPISODE },
    motorwayCrawlSec: 0,
    motorwaySlowRegrade: { ...IDLE_EPISODE },
    motorwayCrawlRegradeSec: 0,
    townCrawl: { ...IDLE_EPISODE },
    townCrawlSec: 0,
    townCrawlRegrade: { ...IDLE_EPISODE },
    townCrawlRegradeSec: 0,
    townCrawlRecoverySec: 0,
    needlessStop: { ...IDLE_EPISODE },
    needlessStopRegrade: { ...IDLE_EPISODE },
    needlessStopConflictAt: null,
    emergencyLane: { ...IDLE_EPISODE },
    offCarriageway: { ...IDLE_EPISODE },
    offCarriagewayRegrade: { ...IDLE_EPISODE },
    warningLampIgnoredAt: null,
    warningLampRecent: [],
    warningLampDriveOnSec: 0,
    warningLampRegrade: { ...IDLE_EPISODE },
  };
}

function cloneState(s: RuleEngineState): RuleEngineState {
  return {
    ...s,
    // The samples themselves are never mutated in place (only pushed/shifted),
    // so a shallow array copy keeps the reducer's no-input-mutation contract.
    speedWindow: [...s.speedWindow],
    crawlSpeedWindow: [...s.crawlSpeedWindow],
    leadTrack: [...s.leadTrack],
    leadMemory: { ...s.leadMemory },
    lastIndicatorOnAt: { ...s.lastIndicatorOnAt },
    lastGlanceAt: { ...s.lastGlanceAt },
    scanStopCreditSec: { ...s.scanStopCreditSec },
    stop: { ...s.stop },
    speedingMinor: { ...s.speedingMinor },
    speedingMinorRegrade: { ...s.speedingMinorRegrade },
    speedingDangerous: { ...s.speedingDangerous },
    seatbelt: { ...s.seatbelt },
    handbrake: { ...s.handbrake },
    handbrakeMoveOff: { ...s.handbrakeMoveOff },
    headlights: { ...s.headlights },
    laneKeeping: { ...s.laneKeeping },
    conditionsSpeed: { ...s.conditionsSpeed },
    conditionsSpeedRegrade: { ...s.conditionsSpeedRegrade },
    taskCap: { ...s.taskCap },
    taskCapRegrade: { ...s.taskCapRegrade },
    rainLights: { ...s.rainLights },
    fogLights: { ...s.fogLights },
    snowLights: { ...s.snowLights },
    following: { ...s.following },
    wrongWay: { ...s.wrongWay },
    wrongWayEntry: s.wrongWayEntry ? { ...s.wrongWayEntry } : null,
    keepRight: { ...s.keepRight },
    crossing: s.crossing ? { ...s.crossing } : null,
    // Shallow by design: an entry is assigned whole at each report and never
    // mutated, so the copied record can share them (same argument as
    // speedWindow's above). Missing this line is how a reducer that promises
    // not to mutate its input starts writing bills into the caller's state.
    contactEpisodes: { ...s.contactEpisodes },
    // Same argument as contactEpisodes above: an entry is assigned whole at
    // each bill and never mutated, so the copied record may share them.
    actBills: { ...s.actBills },
    // Same argument again: a follower's act window is assigned whole.
    cutInActUntil: { ...s.cutInActUntil },
    laneEntryWatch: { ...s.laneEntryWatch },
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
    banZoneStopRegrade: { ...s.banZoneStopRegrade },
    solidCross: { ...s.solidCross },
    busLane: { ...s.busLane },
    busLaneRegrade: { ...s.busLaneRegrade },
    rail: { ...s.rail },
    railRest: { ...s.railRest },
    curveSpeed: { ...s.curveSpeed },
    motorwaySlow: { ...s.motorwaySlow },
    motorwaySlowRegrade: { ...s.motorwaySlowRegrade },
    townCrawl: { ...s.townCrawl },
    townCrawlRegrade: { ...s.townCrawlRegrade },
    needlessStop: { ...s.needlessStop },
    needlessStopRegrade: { ...s.needlessStopRegrade },
    emergencyLane: { ...s.emergencyLane },
    offCarriageway: { ...s.offCarriageway },
    offCarriagewayRegrade: { ...s.offCarriagewayRegrade },
    warningLampRecent: [...s.warningLampRecent],
    warningLampRegrade: { ...s.warningLampRegrade },
  };
}

// ---------------------------------------------------------------------------
// THE REVERSAL ACROSS THE SOLID AXIS — THE U-TURN (sc-mv-uturn-ban, rounds 2–6)
// ---------------------------------------------------------------------------
//
// THE QUESTION. A lesson that authors `solidCrossUTurnEnabled` asks, of a
// two-way road with an authored М1 span and of every crossing it bills there:
// «is THIS crossing the lesson's U-turn — did the car go over the solid axis
// and turn round, where turning round is forbidden?» A yes names the bill
// (`catalog.ts SOLID_CROSS_ACT_UTURN`); a no leaves it the crossing's own true
// copy. The code, the class and the points are the crossing's either way.
//
// ROUND 5 — ONE DEFINITION OF THE ACT (integrator ruling R5-1 … R5-3). Rounds
// 2–4 asked «is the car now on the OTHER bank, travelling with it?» and read
// the turn's place on the first frame the CENTRE was across. A car that turned
// round on its own half over the DASHES, drove fifty metres back and only then
// eased over the solid axis arrived «across, travelling with the far bank» on
// its crossing frame, and was told — at the lesson's own lawful gap — that it
// had made «обратен завой, а на това място той е забранен» (verifier Y1, 17 of
// 17). The reference followed the bank, not the heading. So:
//
// R5-1  A TURN-ROUND IS AN EVENT OF THE HEADING, measured against the road
//       alone (`SimTick.edgeAlignment.deg`, the nose against the edge's own
//       direction) — on whichever half the centre is, crossing or not.
//
//       · THE TRAVEL DIRECTION (`dir`) is the road direction the nose was last
//         within SOLID_CROSS_WITH_BANK_DEG (45°) of. It changes only when a
//         turn-round is confirmed, so there is a 90° dead band between the two
//         directions and a car square across the road has reversed nothing.
//       · THE SWING is a RATE OVER A WINDOW (round 6, R6-5 — stated once at
//         the constants below): the nose's counted degrees keep arriving one
//         way at a mean of at least 1° per 2.5 m. It begins on the frame the
//         nose leaves the heading it stood at, ends 2 m after its last degree,
//         and resumes as the same swing if the next degree arrives at the rate. A
//         standing car is still mid-swing (no metres pass); steering back the
//         other way, or running straight for 2 m, ends it.
//       · THE TURN-ROUND is the yaw excursion that takes the nose out of the
//         45° band of `dir` and into the 45° band of the opposite direction
//         without coming back into the first. Whatever happens in between — a
//         stop, a diagonal, a three-point shuffle — is part of it.
//       · ITS PLACE is where it BEGINS: the station of the last frame before
//         the swing that carried the nose out of the band — the last frame on
//         which the nose still stood at the heading it then turned away from
//         (so the same path has the same place whatever step its heading is
//         sampled in: round 6, verifier N4). (Not
//         where the nose passes 45°: on full lock that is 4 m further on, and
//         a turn begun 4 m before the end of the solid line was being placed
//         over the dashes — verifier Y5.) The axis there is read off the built
//         road (`tick.solidCenterLine`, the source the crossing bill reads).
//       · IT IS CONFIRMED on the frame the nose has stayed within 45° of the
//         opposite direction for `solidLineCrossSustainSec` (0.6 s — the same
//         guard the crossing uses). `dir` flips there, wherever the centre is.
//       · IT COMPLETES when the swing that carried the nose into the opposite
//         band ENDS — or carries it on out of the new direction's band, which
//         begins another excursion (a full circle is two turn-rounds, not one
//         long one). A turn-round from the outer lane on a 6.5 m radius has
//         its nose 135° round a metre before its centre reaches the axis;
//         that crossing is made DURING the turn-round and is the U-turn. A
//         crossing made after the swing has ended is made by a car that is
//         already travelling the other way, and is a crossing.
//
// R5-2  WHAT A TURN-ROUND MAY NAME. A billed crossing of the solid axis is the
//       U-turn if and only if ALL hold:
//         (i)   the centre went over where the axis is SOLID
//               (`crossedSolidAt`);
//         (ii)  a turn-round completed at or after that crossing, the car not
//               having gone back to the bank AND the direction it came from
//               — nor settled, for the sustain, travelling WITH the bank it
//               crossed to — before that turn-round began (the crossing is
//               then over: `home` and the far-bank close below) — so the
//               crossing is made before or during the turn-round, never after
//               it (`crossLate`);
//         (iii) the axis is SOLID where that turn-round begins (`turnPlace`).
//       Otherwise the crossing keeps its own copy, and NO EARLIER ROW IS EVER
//       RENAMED: a confirmed turn-round closes the manoeuvre, so a crossing
//       made later is a new act with a new bill.
//
//       What follows, each pinned through the live rung:
//         · turned round at the gap on his own half, then over the solid axis
//           on the way back (Y1)            → the crossing; nothing renamed;
//         · pulled out, then round to the RIGHT back over the solid axis,
//           ending on his own half (Y4)     → the U-turn — where he ends does
//           not matter, the heading alone says he turned round;
//         · astride, the turn begun 4 m before the solid line ends (Y5)
//                                           → the U-turn; begun 1 m past the
//           end → the crossing;
//         · astride to the gap, then the lawful turn (X1) → the crossing;
//         · one arc from his own lane, the centre crossing over the solid
//           axis → the U-turn, on any radius; crossing over the dashes → no
//           solid crossing, nothing billed;
//         · turned round wholly on his own half → nothing billed (recorded,
//           owed to the founder with how far a В23 reaches).
//
// R5-3  A MEASURED PLACE IS KEPT (Y2). Round 4 threw a turn-round's place away
//       on the first frame with no fix on this road, so one arc of 22 m radius
//       begun on the carriageway over the solid axis lost its name in the
//       field. Now:
//         · PAST THE KERB BUT STILL FIXED TO THIS ROAD the heading is followed
//           exactly as on the carriageway (`stepSolidCrossTurnOffRoad`): a
//           turn-round made on the verge begins, is placed and is confirmed
//           out there.
//         · WITH NO FIX ON THIS ROAD (`stepSolidCrossTurnUnseen`) the bank,
//           the crossing and its clocks hold, and the place already measured
//           is KEPT. The nose is still followed — against the road's own
//           bearing where it last had the car (`bearingDeg`): the tick always
//           carries the heading, and a turn-round is an event of the heading.
//           So one continuous turn through the field keeps the place it began
//           at; a car that straightens up out there and turns round LATER has
//           ended the first excursion and begun another one where no station
//           is known — that one is UNPLACED and names nothing (A12: never a
//           place the road did not measure).
//         · NOTHING IS CONFIRMED OUT THERE. The turn-round is confirmed when
//           the road next has a fix and the nose is within 45° of the opposite
//           direction; a car that never comes back names nothing.
//
// ROUND 6 — THE CLOSING ROUND (integrator rulings R6-1 … R6-5, on the round-5
// verifier's conditions C1 … C4 and N4):
//
// R6-1  THE TRACKER FOLLOWS THE ROAD, NOT THE EDGE (`solidCrossOnEdge`). The
//       armed boulevard is two edges split at the gap. Everything below — the
//       travel direction, the reference half, the swing, the place a
//       turn-round began at, an open crossing and its bill — carries across a
//       change of edge on the same road. And when a road sees a car for the
//       FIRST time (the start of the drive; back from a side street), its
//       travel direction is read off its heading and its reference half is the
//       half its centre is ON: it has crossed nothing this road saw, so
//       nothing — the plain detector included — bills it a crossing. A car
//       travelling the wrong way down the half it has never left is the
//       recorded, unbilled class.
// R6-2  ONE ACT, ONE BILL ENDS WITH THE SWING (`solidCrossRehome`). A further
//       crossing on the swing of a turn-round that has billed the U-turn is
//       the same act and is not billed again (`tailBillT`, `billShared`).
//       When that swing ENDS the manoeuvre is closed and HOME is the half of
//       the car's NEW travel direction. A centre that is then across the solid
//       axis from that half — the swing over-rotated and left it there, a
//       round to the right ended on the half it set out from — is a NEW
//       crossing: its sustain runs from the end of the swing, its bill is its
//       own, and a later turn-round can name it like any other standing
//       crossing. And two turn-rounds are two acts: if the car goes on round
//       and a SECOND turn-round names a crossing that had only shared the
//       first one's bill, that one is billed as the U-turn it is.
// R6-3  THE CROSSING'S REASON NEVER NAMES THE WRONG HALF (`solidCrossBill`,
//       `solidCrossOwnWay`): «…в насрещната половина на платното» is printed
//       only where the half the centre is on runs AGAINST the travel
//       direction; a car that has turned round and enters the half of its own
//       direction gets the same sentence without that clause.
// R6-4  THE WAY BACK IN THE TAIL (found by this round's fuzz, the same class as
//       the verifier's m7/m14): a U-turn begun just before the solid line ends
//       carries the centre out over the DASHES, is confirmed out there, and
//       over-rotates back over the SOLID axis on the same swing. That way back
//       is a crossing of the solid axis made during a turn-round begun where
//       the axis is solid — the U-turn — and is named or billed there and then.
// R6-5  THE SWING IS A RATE OVER A WINDOW — at the constants below.
//
// WHAT IS BILLED, AND BY WHAT — unchanged since round 3 except where stated:
//   · THE CROSSING, BY POSITION. The plain detector needs the car on the bank
//     its nose OPPOSES, above `movingSpeedKmh`; a car that reaches the axis
//     already pointing across the road, or creeps over at walking pace, is
//     never that (verifier V5: not billed at all, and praised). Here the
//     crossing is the CENTRE on the far bank of a solid axis for the sustain,
//     in a forward gear, with no bill yet in this excursion →
//     CROSSED_SOLID_LINE on whichever reason the body has earned on that
//     frame (`solidCrossBill`), or — where a turn-round already names it
//     (`named`) — the U-turn's.
//   · AND NOWHERE ELSE (round 3, W2): in an armed lesson the plain detector
//     stands down while the centre is on the REFERENCE bank (`bank`: the bank
//     the car was on when this road first saw it, last travelled with, was on
//     when it last turned round — or, after a turn-round that billed the
//     U-turn, the half of its new travel direction: R6-1, R6-2).
//   · THE BANK-SIDE BOOKKEEPING. `bank` is the bank the crossing is measured
//     FROM. A crossing is the frame the centre leaves it; it is over when the
//     car is back on it travelling the way it came (`home`), when the car has
//     travelled WITH the far bank for the sustain, or when a turn-round is
//     confirmed — and the bank the car is on then becomes the reference.
//   · ONE ACT, ONE BILL. `billedAt` silences a second bill until the car is
//     back home AND in lane (the plain detector's own re-arm). `billLive`
//     says that bill belongs to the crossing still standing — only such a
//     bill can be named. A car that wobbled home off-lane and THEN made a
//     U-turn across the axis gets the U-turn as a bill of its own.
//
// AND WHAT NO LONGER DECIDES ANYTHING: THE PULL-OUT (round 4, ruling R4-2 —
// ANY turn-round made inside the span by a car across or astride the solid
// axis is the U-turn, whatever came before it), and since round 5 the bank
// the car ends on.
//
// WHAT IS NOT READ, ON PURPOSE: how far the nose swung in some window of
// seconds, the radius, the speed, the lane the turn began in. Round 1 read
// «≥ 45° left inside 10 s of movement» and was refuted in both directions —
// `types.ts solidCrossUTurnEnabled` has the acts. The heading is read here as
// a RELATION TO THE ROAD (which of its two directions the car is travelling),
// never as an amount of recent rotation.

/** THE ONE ANGLE. The nose is ALONG a road direction while it is within this
 *  many degrees of it; a turn-round takes it from this band of one direction
 *  into this band of the other (≥ 135° round — well clear of a car standing
 *  square across the road, which has reversed nothing yet). The same band says
 *  when a car is travelling WITH the bank it is on. */
const SOLID_CROSS_WITH_BANK_DEG = 45;
/**
 * THE SWING, stated once — A RATE OVER A WINDOW (round 6, R6-5).
 *
 * Round 5 said «the nose is swinging while it never travels 2 m without
 * turning 1° further». That is a count of samples, not a rate: a sweep on an
 * 80 m radius drawn in 0.5° vertices delivers its degree after 2.09 m and the
 * same sweep in 0.25° vertices after 1.40 m, so one path was one swing or
 * many — and the PLACE of the turn it fed moved — with the step its heading
 * happened to be sampled in (verifier N4). Now:
 *
 *  · YAW IS COUNTED IN WHOLE DEGREES (`ADVANCE_DEG`) from the heading the nose
 *    last stood at; within `STILL_DEG` of that heading it is still standing
 *    at it.
 *  · THE RATE is one degree per `RATE_WINDOW_M` (2.5 m — every arc tighter
 *    than a 143 m radius; 115 m, where round 5 drew the line, is inside it
 *    with room for a sample step), measured over the window EACH DEGREE TOOK.
 *  · A SWING BEGINS on the frame the nose LEAVES the heading it stood at,
 *    provided the first degree arrives within that window. Nosing off slower
 *    than that is not a swing: the standing heading is moved up to the nose
 *    and the count starts again.
 *  · IT ENDS `SETTLE_M` (2 m) after its last counted degree — decision 1,
 *    unchanged. Counting a degree the other way ends it at once. A standing
 *    car is still mid-swing (no metres pass).
 *  · IT RESUMES AS THE SAME SWING, keeping the place it began at, when the
 *    next degree the same way arrives within `RESUME_MAX_M` (6.5 m: three
 *    degrees on a 115 m radius are 6.02 m apart) at that mean rate.
 *
 * So a path gives the same swing, and a turn the same place, at 0.25°, 0.5°,
 * 1° and 3° vertices on every radius from 6 m to 115 m (pinned through the
 * live rung); and on the tight arcs that turn a car round the swing still ends
 * two metres after the lock comes off, as round 5 pinned.
 *
 * WHAT A RATE CANNOT DO, stated: the END is decided on the frame it happens. A
 * heading drawn in 3° vertices on an 80 m radius runs straight for 4.2 m
 * between them, and for its first 4.2 m nothing tells that from the straight
 * run-out decision 1 pins — so a swing that eases from a full lock onto such a
 * sweep is ENDED two metres into it and resumed (same place) at the next
 * vertex. What a crossing made inside that first gap is part of can therefore
 * differ between a 3° and a 0.25° drawing of the same tail; the PLACE cannot.
 * Real steering turns the heading every frame and never meets the gap.
 */
const SOLID_CROSS_SWING_ADVANCE_DEG = 1;
const SOLID_CROSS_SWING_SETTLE_M = 2;
const SOLID_CROSS_SWING_RATE_WINDOW_M = 2.5;
const SOLID_CROSS_SWING_RESUME_MAX_M = 6.5;
const SOLID_CROSS_SWING_STILL_DEG = 0.05;
/** A counted degree is a degree: one that arrives as 0.9999999 after four
 *  quarter-degree vertices is counted on that vertex, not on the next. */
const SOLID_CROSS_SWING_EPS_DEG = 1e-6;
/**
 * THE SAME ROAD (round 6, R6-1). A road is authored in edges — the armed
 * boulevard is two, split at the gap — and the tracker follows the ROAD: when
 * the car is handed to an edge whose bearing under it is within this many
 * degrees of the bearing the tracker last read (or of its reverse — the same
 * axis authored the other way round), everything it holds carries over. A
 * side street meets the road at an angle and is another road.
 */
const SOLID_CROSS_SAME_ROAD_DEG = 15;

export interface SolidCrossTurnState {
  /** The edge every member below refers to; `null` = no reference anywhere. */
  edgeId: string | null;

  // -- the crossing, measured from a bank ------------------------------------
  /** THE REFERENCE BANK (`EdgeAlignment.travelDir`): the bank the car last
   *  travelled WITH on that edge, or was on when it last turned round;
   *  `0` = none yet. A crossing is the centre leaving it. */
  bank: 1 | -1 | 0;
  /** The bank the centre was on at the previous measured frame (`0` = unknown). */
  prevBank: 1 | -1 | 0;
  /** The axis where the centre LAST passed from one bank to the other, in
   *  either direction: `true` solid, `false` dashed, `null` = this road has
   *  not seen it pass. What «across the SOLID axis» means for a car a swing has
   *  left on the wrong half (R6-2, `solidCrossRehome`). */
  lastPassSolid: boolean | null;
  /** Session time the centre last left `bank` OVER A SOLID AXIS; `null` = it
   *  has not, the axis there was not solid, or that crossing is over (the car
   *  came home, or a turn-round was confirmed). */
  crossedSolidAt: number | null;
  /** R5-2 (ii): that crossing was made AFTER the swing of the turn-round then
   *  in progress had ended — by a car already travelling the other way. */
  crossLate: boolean;
  /** Since when the centre has been on the far bank without a break. */
  farSince: number | null;
  /** Since when the car has been on the far bank and WITH it; `null` = it is not. */
  reversedSince: number | null;
  /** `t` of the CROSSED_SOLID_LINE bill that silences another; cleared when the
   *  car is home AND in lane, or the manoeuvre closes. */
  billedAt: number | null;
  /** That bill belongs to the crossing still standing — it can be named. */
  billLive: boolean;
  /** …but it is not the crossing's OWN: the centre went over again on the swing
   *  of a turn-round that had already billed the U-turn, and one act is one
   *  bill (`tailBillT`). If ANOTHER turn-round then names this crossing, that
   *  is a second act and it is billed as one. */
  billShared: boolean;
  /** A turn-round names the standing crossing and its bill is still to come
   *  (the centre has not been across for the sustain yet). */
  named: boolean;
  /** A turn-round begun over the solid axis was confirmed with the centre OUT
   *  OVER THE DASHES and a bill already standing (the plain detector's, for the
   *  span it ran on the oncoming half): the manoeuvre is held open while that
   *  turn-round's swing goes on, because its way back over the solid axis would
   *  name that bill. Closed, as round 5 closed it at once, when the swing ends. */
  wayBackOpen: boolean;

  // -- R5-1: the heading against the road ------------------------------------
  /** THE TRAVEL DIRECTION: +1 = with the edge's geometry (bank +1's
   *  direction), −1 = against it, `0` = the nose has not been along the road
   *  yet. Flips only where a turn-round is confirmed. */
  dir: 1 | -1 | 0;
  /** The nose is out of the 45° band of `dir`: an excursion is in progress. */
  turning: boolean;
  /** THE PLACE of that excursion (R5-2 iii): the axis at the station where it
   *  began — `true` solid, `false` dashed, `null` unplaced (it left the band
   *  where the road had no fix on the car). */
  turnPlace: boolean | null;
  /** Since when the nose has been within 45° of the opposite direction. */
  oppSince: number | null;
  /** The swing's sense on the frame the nose entered that band (`0` = none). */
  oppSense: 1 | -1 | 0;
  /** That swing has ended since: a crossing from here on is `crossLate`. */
  swingOver: boolean;
  /** A confirmed turn-round whose swing is STILL GOING (its sense; `0` = none):
   *  a crossing made now is made during it. */
  tailSense: 1 | -1 | 0;
  /** …and that turn-round's place. */
  tailPlace: boolean | null;
  /** …and the `t` of the bill it NAMED when it was confirmed (`null` = it
   *  named none). A crossing its swing goes on to make is the same act and is
   *  not billed again: a round to the right from the oncoming outer lane that
   *  ends 0.2 m back over the axis has crossed twice and turned round once. */
  tailBillT: number | null;
  /** R6-2 — A TURN-ROUND HAS BILLED THE U-TURN (named a bill, or been billed as
   *  one) and its swing has not been seen to end yet. When it has, the
   *  manoeuvre is closed and HOME is the half of the car's new travel
   *  direction (`solidCrossRehome`). */
  actOpen: boolean;
  /** …and that swing's sense (`0` = it had already ended when the bill went out). */
  actSense: 1 | -1 | 0;

  // -- the swing (R6-5: a rate over a window) ---------------------------------
  /** Which way the nose is swinging (`+1` = clockwise, as `deg` grows); `0` = it is not. */
  swSense: 1 | -1 | 0;
  /** THE STANDING HEADING: `deg` at the last counted degree, or where a slow
   *  nosing-off was written off; `null` = no measured frame yet. */
  swRefDeg: number | null;
  /** The nose stood at that heading on the previous frame. */
  swStill: boolean;
  /** Which way it has left it (`0` = it has not). */
  swLeftSense: 1 | -1 | 0;
  /** Metres travelled since it left it. */
  swLeftM: number;
  /** The axis at the station it left it from (`null` = unknown) — where a
   *  swing that begins now BEGAN. */
  swLeftPlace: boolean | null;
  /** …and whether the centre was then across a solid crossing that still stood. */
  swLeftAcross: boolean;
  /** Metres travelled since the last counted degree of the swing in progress,
   *  or of the one that last ended (it may resume). */
  swDegM: number;
  /** `deg` at that degree; `null` = no degree has been counted. */
  swDegAt: number | null;
  /** The sense of the swing that last ended (`0` = none): only it can resume. */
  swEndedSense: 1 | -1 | 0;
  /** The axis at the station where the swing in progress began (`null` = unknown). */
  swPlace: boolean | null;
  /** It began with the centre across a solid crossing that still stood. */
  swAcross: boolean;
  /** The swing that was in progress when the centre crossed, while it is still
   *  going (its sense; `0` = there was none, or it has ended). */
  crossSwing: 1 | -1 | 0;
  /** The axis under the car on the previous frame (`null` = the road had no fix on it). */
  lastPlace: boolean | null;
  /** The road's own bearing where it last had a fix on the car, degrees
   *  (`SimTick.headingDeg` − `EdgeAlignment.deg`); `null` = it never had one.
   *  What the nose is read against while the road cannot see the car (R5-3). */
  bearingDeg: number | null;

  // -- the record of where every turn-round of the drive began ----------------
  // (sc-mv-uturn-ban:e98407b1 clause 4 — the RIGHT side.) Counted on the frame a
  // turn-round is CONFIRMED (`confirmSolidCrossTurn`: the one confirmation that
  // also names the illegal one — no second definition of the act), by its PLACE
  // (`turnPlace`). Kept for the whole DRIVE, not per road: a side street and back
  // carries them (`solidCrossOnEdge`). Read only through `uTurnPlaceRecord`.
  /** Confirmed turn-rounds that began where the axis is BROKEN (`turnPlace === false`). */
  turnsAtBrokenAxis: number;
  /** Confirmed turn-rounds that began where the axis is SOLID, or where the road
   *  could not place them (`turnPlace !== false`). */
  turnsElsewhere: number;
}

const SOLID_CROSS_TURN_IDLE: SolidCrossTurnState = {
  edgeId: null,
  bank: 0,
  prevBank: 0,
  lastPassSolid: null,
  crossedSolidAt: null,
  crossLate: false,
  farSince: null,
  reversedSince: null,
  billedAt: null,
  billLive: false,
  billShared: false,
  named: false,
  wayBackOpen: false,
  dir: 0,
  turning: false,
  turnPlace: null,
  oppSince: null,
  oppSense: 0,
  swingOver: false,
  tailSense: 0,
  tailPlace: null,
  tailBillT: null,
  actOpen: false,
  actSense: 0,
  swSense: 0,
  swRefDeg: null,
  swStill: true,
  swLeftSense: 0,
  swLeftM: 0,
  swLeftPlace: null,
  swLeftAcross: false,
  swDegM: 0,
  swDegAt: null,
  swEndedSense: 0,
  swPlace: null,
  swAcross: false,
  crossSwing: 0,
  lastPlace: null,
  bearingDeg: null,
  turnsAtBrokenAxis: 0,
  turnsElsewhere: 0,
};

/** What one frame of the tracker decided. */
interface SolidCrossTurnStep {
  state: SolidCrossTurnState;
  /**
   * A CROSSED_SOLID_LINE bill goes out on this frame: `"crossing"` on the
   * crossing's own copy (`solidCrossBill`), `"u-turn"` where a turn-round
   * already names it. `null` on every other frame.
   */
  bill: "crossing" | "u-turn" | null;
  /**
   * A TURN-ROUND NAMES THE BILL ALREADY OUT: its `t`. `null` on every other
   * frame — a turn-round begun over a dashed axis, one that follows the
   * crossing instead of containing it, and one with no live bill included.
   */
  names: number | null;
}

/** One frame, as the heading half needs it. */
interface SolidCrossHeadingFrame {
  /** The nose against the edge's own direction, degrees (`EdgeAlignment.deg`;
   *  where the road has no fix, against the bearing it last had). */
  deg: number;
  /** The axis is solid at the car's station (`tick.solidCenterLine`);
   *  `null` = the road has no fix on the car, so there is no station. */
  solidHere: boolean | null;
  /** Metres travelled since the previous frame. */
  stepM: number;
  t: number;
}

/** One measured frame on the carriageway, as the tracker needs it. */
interface SolidCrossTurnFrame extends SolidCrossHeadingFrame {
  solidHere: boolean;
  /** The road's bearing under the car (`SimTick.headingDeg` − `deg`). */
  bearingDeg: number;
  edgeId: string;
  /** The bank the centre is on (`EdgeAlignment.travelDir`). */
  bank: 1 | -1;
  /** A forward gear is engaged (the plain detector's own reverse exemption). */
  forwardGear: boolean;
  /** The plain detector's own «back in lane» — the predicate that ends its excursion. */
  inLane: boolean;
}

/** `b − a` folded into (−180, 180]. */
function solidCrossDeltaDeg(a: number, b: number): number {
  let d = b - a;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

/** The nose STANDS at `deg`: degrees are counted from here. MUTATES `s`. */
function solidCrossStandAt(s: SolidCrossTurnState, deg: number): void {
  s.swRefDeg = deg;
  s.swStill = true;
  s.swLeftSense = 0;
  s.swLeftM = 0;
}

/**
 * R6-1 — THE TRACKER FOLLOWS THE ROAD, NOT THE EDGE. What `prev` holds,
 * re-expressed on the edge the car is fixed to on this frame:
 *
 *  · the same edge → `prev` itself;
 *  · another edge OF THE SAME ROAD (its bearing under the car within
 *    SOLID_CROSS_SAME_ROAD_DEG of the bearing last read) → everything carries:
 *    the travel direction, the reference half, the swing, the place a
 *    turn-round began at, an open crossing and its bill. Round 5 began a
 *    fresh tracker there, so a car that turned round past the junction came
 *    back into the span with no reference half at all — the plain detector
 *    then billed it «Застъпи…» half a second BEFORE its centre reached the
 *    axis, or «Пресече изцяло…» when it never did, and a real U-turn made
 *    afterwards was neither billed nor named (verifier C2);
 *  · the same axis authored the other way round (the bearing reversed) → the
 *    same, with the two directions and the two halves swapped;
 *  · ANOTHER ROAD, or no road before this → THE ROAD SEES THE CAR FOR THE
 *    FIRST TIME (`firstSight`): its reference half is the half its centre is
 *    ON — it has crossed nothing this road saw — and its travel direction
 *    will be read off its heading on this very frame, never assumed. (Round 3
 *    waited for «the first half it travels WITH», and until then let the plain
 *    detector convict a car of a crossing nobody had seen it make.) `null`
 *    where the caller may not begin a tracker here (a frame past the kerb).
 */
function solidCrossOnEdge(
  prev: SolidCrossTurnState,
  edgeId: string,
  bearingDeg: number,
  bank: 1 | -1,
  firstSight: boolean,
): SolidCrossTurnState | null {
  if (prev.edgeId === edgeId) return prev;
  if (prev.edgeId !== null && prev.bearingDeg !== null) {
    const off = Math.abs(solidCrossDeltaDeg(prev.bearingDeg, bearingDeg));
    if (off <= SOLID_CROSS_SAME_ROAD_DEG) return { ...prev, edgeId };
    if (off >= 180 - SOLID_CROSS_SAME_ROAD_DEG) {
      const flip = (v: 1 | -1 | 0): 1 | -1 | 0 => (v === 0 ? 0 : v === 1 ? -1 : 1);
      const turn = (v: number | null): number | null => (v === null ? null : solidCrossDeltaDeg(0, v + 180));
      return {
        ...prev,
        edgeId,
        bank: flip(prev.bank),
        prevBank: flip(prev.prevBank),
        dir: flip(prev.dir),
        swRefDeg: turn(prev.swRefDeg),
        swDegAt: turn(prev.swDegAt),
      };
    }
  }
  // A new road starts a fresh tracker, but the drive's record of where its
  // turn-rounds began is the DRIVE's (`turnsAtBrokenAxis`, `turnsElsewhere`).
  return firstSight
    ? {
        ...SOLID_CROSS_TURN_IDLE,
        edgeId,
        bank,
        prevBank: bank,
        turnsAtBrokenAxis: prev.turnsAtBrokenAxis,
        turnsElsewhere: prev.turnsElsewhere,
      }
    : null;
}

/**
 * The hold a frame on ANOTHER road is read under (`solidCrossTurnHoldsRoad`):
 * `"turn"` — R7-1, a turn-round in progress; `"approach"` — R7-2, the approach
 * to one; `null` — none (`solidCrossOnEdge` decides the frame, as before).
 */
type SolidCrossHold = "turn" | "approach" | null;

/**
 * R7-1 — A TURN-ROUND BEGUN WHERE THE AXIS IS BROKEN KEEPS ITS ROAD
 * (sc-mv-uturn-ban:e98407b1 clause 4b). `true` when this frame's edge is
 * ANOTHER road (`solidCrossOnEdge` would begin a fresh tracker there, or none)
 * while the car is in the middle of an excursion on the tracker's road that
 * BEGAN where the axis is broken (`turnPlace === false`), and the swing
 * carrying it is still going (`swSense`) or can still resume as the same
 * swing (R6-5: within RESUME_MAX_M of its last degree — so a path drawn in
 * coarse vertices holds exactly as a smooth one does).
 *
 * WHY. The lawful turn-round at the gap is made in the mouth of the side
 * street, and the locator hands the tick to whichever centreline is nearer: an
 * arc from the inner lane that reaches y ≈ 277 is handed to `mvu-e-cross`
 * 80–100° round (rig-w2 R-edge-handoff: pc at y 279.05, phone at y 276.37; in
 * process 64.5–148.5° round over a sweep of stops and radii). A fresh tracker
 * on the side street never confirmed the turn-round that had begun on the
 * boulevard, `turnsAtBrokenAxis` stayed 0 and the praise was withheld from
 * a student who stopped where instruction 4 told him to («На 280-ия метър»).
 *
 * WHAT IT DOES. Such a frame is read against the road the excursion began on:
 * the nose against that road's last bearing (`bearingDeg`), its bank and any
 * crossing HELD, no station (`solidHere` null) — the heading half only, the
 * frame past the kerb of R5-3 (`stepSolidCrossTurnOffRoad`) — and like that
 * frame it may CONFIRM the turn-round, by the one confirmation, at the place it
 * was given where it began. Nothing here defines the act a second time.
 *
 * WHAT IT CANNOT DO. A turn-round begun where the axis is broken names no
 * crossing (`naming` needs `turnPlace === true`) and the heading half bills
 * nothing, so no bill and no name can come of a held frame. A turn-round begun
 * on the SOLID span, or unplaced, is never held: another road drops it exactly
 * as R6-1 ruled (`solid-cross-uturn-act.test.ts` «another ROAD drops the
 * reference»). Another EDGE of the same road is never held either: R6-1
 * carries everything there.
 *
 * WHERE IT ENDS. Once the excursion is over — confirmed, back along the road,
 * or its swing ended for good (a left turn INTO the side street straightens at
 * 90° and is no turn-round) — the next frame on the other road is its first
 * sight, as before, with the drive's record carried.
 *
 * R7-2 — …AND SO DOES THE APPROACH TO ONE (round 2, verifier F1). The locator
 * can hand the tick to the side street BEFORE the nose has left the 45° band:
 * a car that stops in the inner lane at y 262–268, creeps 12–15 m at 30–43°
 * across the dashes toward the mouth and then sweeps round on a 5 m radius is
 * on `mvu-e-cross` 30.0–43.0° round. No excursion is open there yet, so R7-1
 * could not hold it, the side street began a fresh tracker, and the
 * turn-round — begun at y 277.7–283.3, in the gap — was never counted (10
 * lawful drives × L1–L5: place {0, 0}, no praise). So a frame on another road
 * is ALSO read against this road while
 *
 *   · the car is still ALONG it (`dir` set and no excursion: the nose was
 *     inside the 45° band on the previous frame), and
 *   · the last station this road had on the car is where its axis is BROKEN
 *     (`lastPlace === false`), and
 *   · the nose is not along both roads at once (a fork meeting this road at
 *     less than 90°, whose band overlaps this one's: a car inside both has
 *     taken the fork, and the fork's own tracker has it, as before).
 *
 * Such a frame is the R7-1 frame with ONE difference: its station is the one
 * the road last had (`solidHere` = `lastPlace`, broken) — the only station
 * there is to give it, since the other road has none on this one. It is the
 * station a swing that begins out here, or an excursion that opens out here
 * with no swing, is placed at; a swing that began on the road before the
 * handoff keeps the place it began at (so one begun on the SOLID span and
 * carried out past the handoff is still begun there, and R7-1 then lets the
 * other road drop it). From the frame after the nose leaves the band R7-1
 * holds the excursion, with no station (`solidHere` null), exactly as in
 * round 1 — so once that turn-round is confirmed, or forgotten, `lastPlace`
 * is null, the approach cannot be held again, and the other road sees the car
 * for the first time, with the drive's record carried.
 *
 * It is the frame R7-1 already reads and the ONE confirmation: nothing here
 * defines the act a second time, and nothing bills or names — a turn-round
 * begun where the axis is broken names no crossing, and the heading half bills
 * none.
 */
function solidCrossTurnHoldsRoad(
  prev: SolidCrossTurnState,
  edgeId: string,
  bearingDeg: number,
  headingDeg: number,
): SolidCrossHold {
  if (prev.edgeId === null || prev.edgeId === edgeId || prev.bearingDeg === null || prev.bank === 0) return null;
  const off = Math.abs(solidCrossDeltaDeg(prev.bearingDeg, bearingDeg));
  if (off <= SOLID_CROSS_SAME_ROAD_DEG || off >= 180 - SOLID_CROSS_SAME_ROAD_DEG) return null; // the same road
  if (prev.turning) {
    // R7-1 — the excursion in progress.
    if (prev.turnPlace !== false) return null; // begun on the solid span, or unplaced
    const live = prev.swSense !== 0 || (prev.swEndedSense !== 0 && prev.swDegM <= SOLID_CROSS_SWING_RESUME_MAX_M);
    return live ? "turn" : null;
  }
  // R7-2 — the approach to it.
  if (prev.dir === 0 || prev.lastPlace !== false) return null;
  const toOther = Math.abs(solidCrossDeltaDeg(bearingDeg, headingDeg));
  const toThis = Math.abs(solidCrossDeltaDeg(prev.bearingDeg, headingDeg));
  const alongOther = toOther <= SOLID_CROSS_WITH_BANK_DEG || toOther >= 180 - SOLID_CROSS_WITH_BANK_DEG;
  const alongThis = (prev.dir === 1 ? toThis : 180 - toThis) <= SOLID_CROSS_WITH_BANK_DEG;
  return alongOther && alongThis ? null : "approach";
}

/**
 * R6-2 — A TURN-ROUND HAS BILLED THE U-TURN. From here to the end of its
 * swing a further crossing is the same act (`tailBillT`: not billed again);
 * when the swing ends, `solidCrossRehome`. MUTATES `s`.
 */
function solidCrossActBilled(s: SolidCrossTurnState, billT: number): void {
  s.actOpen = true;
  s.actSense = s.tailSense;
  if (s.tailSense !== 0) s.tailBillT = billT;
}

/**
 * R6-2 — THE SWING OF A BILLED TURN-ROUND HAS ENDED: the manoeuvre is closed,
 * and HOME is the half of the car's NEW travel direction, wherever its centre
 * is. If the centre is on that half, that is all. If it is not — the swing
 * over-rotated and left it back across, or a round to the right ended on the
 * half it set out from — it is ACROSS THE AXIS FROM HOME from this frame: a
 * new crossing, with its own sustain (counted from HERE: the swing's own
 * crossings are the U-turn's and are not billed again) and its own bill, open
 * to a later turn-round like any other. It is a crossing of the SOLID axis
 * only if the centre last passed the axis where it is solid (`lastPassSolid`):
 * a round begun over the solid axis whose centre went over two metres past
 * the end of it has crossed no solid line, and is told of none.
 *
 * Round 5 left home on whichever half the centre was on, so a U-turn that
 * over-rotated back over the solid axis could run twenty seconds against the
 * traffic of the half it ended on with no bill but the U-turn's (verifier C3).
 * MUTATES `s`.
 */
function solidCrossRehome(s: SolidCrossTurnState, f: SolidCrossTurnFrame): void {
  s.actOpen = false;
  s.actSense = 0;
  const home: 1 | -1 = s.dir === -1 ? -1 : 1;
  closeSolidCross(s, home);
  if (f.bank === home) return;
  s.prevBank = f.bank;
  s.crossedSolidAt = s.lastPassSolid === true ? f.t : null;
  s.farSince = f.t;
}

/**
 * R5-1 ON ONE FRAME — the swing, the travel direction and the excursion.
 * MUTATES `s` (always the caller's fresh copy). Returns `true` on the frame a
 * turn-round is CONFIRMED; the caller reads `s.turnPlace` and then calls
 * `confirmSolidCrossTurn`.
 */
function stepSolidCrossHeading(s: SolidCrossTurnState, f: SolidCrossHeadingFrame, sustainSec: number): boolean {
  // THE SWING (R6-5 — the block above the constants has the rule).
  if (s.swRefDeg === null) {
    solidCrossStandAt(s, f.deg);
  } else {
    s.swDegM += f.stepM;
    const d = solidCrossDeltaDeg(s.swRefDeg, f.deg);
    const sense = d > 0 ? 1 : -1;
    if (Math.abs(d) <= SOLID_CROSS_SWING_STILL_DEG) {
      s.swStill = true;
      s.swLeftSense = 0;
      s.swLeftM = 0;
    } else {
      if (s.swStill || s.swLeftSense !== sense) {
        // THE NOSE LEAVES THE HEADING IT STOOD AT — on the previous frame it
        // was still there (`lastPlace`): if a swing comes of this, that frame
        // is where it began.
        s.swLeftSense = sense;
        s.swLeftM = 0;
        s.swLeftPlace = s.lastPlace;
        s.swLeftAcross = s.bank !== 0 && s.prevBank !== s.bank && s.crossedSolidAt !== null;
      }
      s.swStill = false;
      s.swLeftM += f.stepM;
      if (Math.abs(d) >= SOLID_CROSS_SWING_ADVANCE_DEG - SOLID_CROSS_SWING_EPS_DEG) {
        // A COUNTED DEGREE.
        if (sense === s.swSense) {
          // …of the swing in progress.
        } else if (
          s.swSense === 0 &&
          sense === s.swEndedSense &&
          s.swDegAt !== null &&
          s.swDegM <= SOLID_CROSS_SWING_RESUME_MAX_M &&
          sense * solidCrossDeltaDeg(s.swDegAt, f.deg) * SOLID_CROSS_SWING_RATE_WINDOW_M >= s.swDegM
        ) {
          // …of the swing that had ended, arriving at the rate: THE SAME SWING
          // (its place and whether it began across are the ones it began with).
          s.swSense = sense;
        } else {
          // …the first of a NEW swing, which began where the nose left its heading.
          s.swSense = sense;
          s.swPlace = s.swLeftPlace;
          s.swAcross = s.swLeftAcross;
        }
        s.swDegM = 0;
        s.swDegAt = f.deg;
        solidCrossStandAt(s, f.deg);
      } else if (s.swLeftM >= SOLID_CROSS_SWING_RATE_WINDOW_M) {
        // Slower than the rate: not a swing. The count starts again from here.
        solidCrossStandAt(s, f.deg);
      }
    }
    // THE SWING ENDS — two metres after its last degree.
    if (s.swSense !== 0 && s.swDegM >= SOLID_CROSS_SWING_SETTLE_M) {
      s.swEndedSense = s.swSense;
      s.swSense = 0;
    }
  }
  // A confirmed turn-round is still going only while its swing is — and so is
  // the swing the centre crossed on.
  if (s.tailSense !== 0 && s.swSense !== s.tailSense) {
    s.tailSense = 0;
    s.tailBillT = null;
  }
  if (s.crossSwing !== 0 && s.swSense !== s.crossSwing) s.crossSwing = 0;

  let confirmed = false;
  const abs = Math.abs(f.deg);
  if (s.dir === 0) {
    if (abs <= SOLID_CROSS_WITH_BANK_DEG) s.dir = 1;
    else if (abs >= 180 - SOLID_CROSS_WITH_BANK_DEG) s.dir = -1;
  } else {
    const off = s.dir === 1 ? abs : 180 - abs;
    if (off <= SOLID_CROSS_WITH_BANK_DEG) {
      // Along the road again: no excursion (one that did not turn round is forgotten).
      s.turning = false;
      s.turnPlace = null;
      s.oppSince = null;
      s.oppSense = 0;
      s.swingOver = false;
    } else {
      if (!s.turning) {
        // THE EXCURSION BEGINS — and its place is where the swing that carried
        // the nose out of the band began. With no swing in progress (a creep
        // slower than 1° in 2 m) it is the previous frame's station; after a
        // stretch the road could not see, `lastPlace` is null: unplaced.
        s.turning = true;
        s.turnPlace = s.swSense !== 0 ? s.swPlace : s.lastPlace;
        // …and whatever turn-round was confirmed before it is over, even if the
        // car is still on the same swing (a full circle is two turn-rounds).
        s.tailSense = 0;
        s.tailBillT = null;
      }
      if (off >= 180 - SOLID_CROSS_WITH_BANK_DEG) {
        if (s.oppSince === null) {
          s.oppSince = f.t;
          s.oppSense = s.swSense;
          s.swingOver = s.swSense === 0;
        } else if (!s.swingOver && s.swSense !== s.oppSense) {
          s.swingOver = true;
        }
        confirmed = f.t - s.oppSince >= sustainSec;
      } else {
        s.oppSince = null;
        s.oppSense = 0;
        s.swingOver = false;
      }
    }
  }
  s.lastPlace = f.solidHere;
  return confirmed;
}

/** A turn-round is confirmed: the travel direction is the new one, and the
 *  turn-round lives on only as long as its swing does. MUTATES `s`. */
function confirmSolidCrossTurn(s: SolidCrossTurnState): void {
  // The drive's record of where its turn-rounds began (read by `uTurnPlaceRecord`).
  if (s.turnPlace === false) s.turnsAtBrokenAxis += 1;
  else s.turnsElsewhere += 1;
  s.tailSense = s.swingOver ? 0 : s.oppSense;
  s.tailPlace = s.turnPlace;
  s.tailBillT = null;
  s.dir = s.dir === 1 ? -1 : 1;
  s.turning = false;
  s.turnPlace = null;
  s.oppSince = null;
  s.oppSense = 0;
  s.swingOver = false;
}

/**
 * WHERE THE DRIVE'S TURN-ROUNDS BEGAN — the read-only face of the record above,
 * for `lessons/engine.ts uTurnPastSolidAxisEarned` (sc-mv-uturn-ban:e98407b1
 * clause 4, the RIGHT side).
 *
 * It is the reducer's own ADR-013 act and nothing else: a turn-round is counted
 * on the frame `confirmSolidCrossTurn` confirms it — the same confirmation that
 * names a crossing the U-turn — by the place R5-1 gives it (the axis under the
 * car where the swing that carried the nose out of the 45° band BEGAN). So the
 * praise and the U-turn's name can never disagree about what a turn-round is,
 * or where it was made.
 *
 * Both counts stay 0 on every lesson that does not arm `solidCrossUTurnEnabled`:
 * the tracker never runs there.
 */
export function uTurnPlaceRecord(s: RuleEngineState): { atBrokenAxis: number; elsewhere: number } {
  return { atBrokenAxis: s.solidCrossTurn.turnsAtBrokenAxis, elsewhere: s.solidCrossTurn.turnsElsewhere };
}

/** The manoeuvre is over: the bank the car is on is the one the next crossing
 *  is measured from. MUTATES `s`. */
function closeSolidCross(s: SolidCrossTurnState, bank: 1 | -1): void {
  s.bank = bank;
  s.prevBank = bank;
  s.crossedSolidAt = null;
  s.crossLate = false;
  s.farSince = null;
  s.reversedSince = null;
  s.billedAt = null;
  s.billLive = false;
  s.billShared = false;
  s.named = false;
  s.wayBackOpen = false;
  s.crossSwing = 0;
}

/**
 * THE CAR HAS NOT FINISHED WHAT IT IS DOING: it is still on the swing it
 * crossed on, or on one begun since, across the standing crossing. If that
 * swing turns out to be the turn-round, the crossing belongs to it (R5-2 ii) —
 * so the crossing is not «over» on such a frame, on either bank: a right-hand
 * round from astride the line has its centre back home 20° round, and a round
 * from a car that has just crossed over has its nose «with the far bank» for
 * its first 45°.
 */
function solidCrossMidSwing(s: SolidCrossTurnState): boolean {
  return s.crossSwing !== 0 || (s.swSense !== 0 && s.swAcross);
}

/** A turn-round begun where the axis is SOLID has been confirmed and its swing
 *  is still going: a crossing made now is made during it. */
function solidCrossOutInTail(s: SolidCrossTurnState): boolean {
  return s.tailSense !== 0 && s.tailPlace === true;
}

/** One measured frame of the tracker. Pure: `prev` is not mutated. */
function stepSolidCrossTurn(
  prev: SolidCrossTurnState,
  f: SolidCrossTurnFrame,
  sustainSec: number,
): SolidCrossTurnStep {
  const { bank, t } = f;
  // `prev` is already on this frame's edge and has a reference half
  // (`solidCrossOnEdge`, called by the reducer before anything reads it).
  const s: SolidCrossTurnState = { ...prev };
  s.bearingDeg = f.bearingDeg;
  const confirmed = stepSolidCrossHeading(s, f, sustainSec);
  // The nose against the direction of the bank the centre is ON.
  const withBank = (bank === 1 ? Math.abs(f.deg) : 180 - Math.abs(f.deg)) <= SOLID_CROSS_WITH_BANK_DEG;

  // R6-2 — the swing of a turn-round that billed the U-turn has ended (here,
  // or while the road could not see the car): the manoeuvre is closed and home
  // is the half of the new travel direction.
  if (s.actOpen && (s.actSense === 0 || s.swSense !== s.actSense)) solidCrossRehome(s, f);
  // …and a manoeuvre held open for a way back that did not come is closed where
  // round 5 closed it: on the bank the centre is on.
  if (s.wayBackOpen && !solidCrossOutInTail(s)) closeSolidCross(s, bank);

  // Where the centre passes the axis, whichever way: the axis under it there.
  if (s.prevBank !== 0 && bank !== s.prevBank) s.lastPassSolid = f.solidHere;

  // THE CROSSING — the frame the centre leaves the reference bank. Decided
  // afresh every time it does, UNLESS a solid crossing of this same manoeuvre
  // still stands (the car went back over the axis without coming HOME — a
  // three-point turn backs onto its own half with the nose still across the
  // road): that crossing, and the bill it carries, are this act's already.
  if (s.prevBank === s.bank && bank !== s.bank && s.crossedSolidAt === null) {
    s.crossedSolidAt = f.solidHere ? t : null;
    // (ii) made after the turn-round in progress had already completed…
    s.crossLate = s.turning && s.oppSince !== null && s.swingOver;
    // …or DURING one already confirmed, begun over a solid axis: the bill,
    // when the sustain brings it, is the U-turn's.
    s.named = f.solidHere && s.tailSense !== 0 && s.tailPlace === true;
    // The swing it crossed on may yet be the turn-round — unless that swing IS
    // a turn-round already confirmed, to which this crossing then belongs.
    s.crossSwing = s.tailSense !== 0 ? 0 : s.swSense;
    // …and if that turn-round has already named a bill, this crossing is the
    // same act: its bill is out (ONE ACT, ONE BILL).
    if (s.tailSense !== 0 && s.tailBillT !== null) {
      s.billedAt = s.tailBillT;
      s.billLive = true;
      s.billShared = true;
    }
  }
  // …AND THE WAY BACK COUNTS TOO. A car that went out where the axis is DASHED
  // and comes back over it where it is SOLID has crossed the solid axis (R5-2
  // i asks where the centre crossed, not which way). Coming home along the
  // road forgets it at once (`home` below); coming back mid-turn-round — out
  // over the dashes before the span, up the oncoming half into it, and round
  // to the right back over the solid axis — is the U-turn like any other, and
  // the bill that manoeuvre already carries is named when it is confirmed.
  if (s.prevBank !== 0 && s.prevBank !== s.bank && bank === s.bank && s.crossedSolidAt === null && f.solidHere) {
    s.crossedSolidAt = t;
    s.crossLate = s.turning && s.oppSince !== null && s.swingOver;
    if (solidCrossOutInTail(s)) {
      // …AND IN THE TAIL OF A TURN-ROUND ALREADY CONFIRMED, begun where the
      // axis is solid, it is the U-turn there and then (round 6: a U-turn begun
      // a metre before the solid line ends carries the centre out over the
      // dashes, is confirmed out there, and over-rotates back over the solid
      // axis on the same swing — round 5 had no turn-round left to name it, so
      // a crossing R5-2 calls the U-turn was billed as none, or not at all).
      // One act, one bill: the bill that manoeuvre already carries is named; a
      // centre that was out there for the sustain with no bill gets the
      // U-turn's now; one that only grazed out and back gets nothing.
      const names = s.billedAt !== null && s.billLive ? s.billedAt : null;
      const billNow = names === null && s.farSince !== null && t - s.farSince >= sustainSec;
      if (names !== null || billNow) {
        closeSolidCross(s, bank);
        s.prevBank = bank;
        solidCrossActBilled(s, names ?? t);
        return { state: s, bill: billNow ? "u-turn" : null, names };
      }
    }
  }
  s.prevBank = bank;

  if (confirmed) {
    // A TURN-ROUND IS CONFIRMED (R5-1) — and names the standing crossing iff
    // (i) it was over a solid axis, (ii) it was not made after the turn-round,
    // (iii) the turn-round began where the axis is solid (R5-2).
    const naming = s.crossedSolidAt !== null && !s.crossLate && s.turnPlace === true;
    confirmSolidCrossTurn(s);
    if (naming && s.billShared) {
      // ANOTHER TURN-ROUND names a crossing that so far only shared the bill of
      // the one before it (the car went on round: a U-turn, over the axis again
      // on the same swing, and a second U-turn back). Two turn-rounds are two
      // acts: this one gets a bill of its own — below, by position.
      s.billedAt = null;
      s.billLive = false;
      s.billShared = false;
    }
    if (naming && s.billedAt !== null && s.billLive) {
      // One act, one bill: the one already out is NAMED, and the manoeuvre is over.
      const names = s.billedAt;
      closeSolidCross(s, bank);
      solidCrossActBilled(s, names);
      return { state: s, bill: null, names };
    }
    if (bank !== s.bank && s.crossedSolidAt !== null && !s.billLive) {
      // Nothing has billed THIS crossing yet (the centre has not been across
      // for the sustain, it went over in reverse gear, or the bill that stands
      // is an earlier crossing's). It is billed by position below — as the
      // U-turn where the turn-round names it, as the crossing where it does
      // not (a turn-round begun over the dashes whose centre then went over
      // the first metre of solid line).
      if (naming) s.named = true;
    } else if (
      bank !== s.bank &&
      s.crossedSolidAt === null &&
      s.billedAt !== null &&
      s.billLive &&
      solidCrossOutInTail(s)
    ) {
      // OUT OVER THE DASHES when the turn-round is confirmed, WITH A BILL
      // STANDING, its swing still going, begun where the axis is solid: the way
      // back may yet be over the solid axis on this same swing, and would name
      // that bill (above; one act, one bill). The manoeuvre stays open for as
      // long as the swing does. (With no bill standing it is closed here, as in
      // round 5: a way back over the solid axis is then a crossing from this
      // bank, named and billed in the tail like any other.)
      s.wayBackOpen = true;
    } else {
      // Nothing to name — or nothing to bill: the centre is back on the bank
      // it left, or it went over where the axis is dashed. The manoeuvre is
      // over, and NOTHING EARLIER IS RENAMED by whatever the car does next.
      closeSolidCross(s, bank);
      return { state: s, bill: null, names: null };
    }
  }

  if (bank === s.bank) {
    s.farSince = null;
    s.reversedSince = null;
    // HOME — back on the bank AND the direction it came from, and not still
    // swinging on the swing it crossed on or one begun across
    // (`solidCrossMidSwing`).
    const home = !s.turning && !solidCrossMidSwing(s);
    if (home) {
      s.crossedSolidAt = null;
      s.crossLate = false;
      s.named = false;
      s.billLive = false;
      s.billShared = false;
      // …and in lane: the bill is over too — where the plain detector re-arms.
      if (f.inLane) s.billedAt = null;
    }
    return { state: s, bill: null, names: null };
  }

  // On the far half.
  if (s.farSince === null) s.farSince = t;
  if (withBank) {
    if (s.reversedSince === null) s.reversedSince = t;
  } else {
    s.reversedSince = null;
  }

  // THE CROSSING, BILLED BY POSITION — the centre across a solid axis for the
  // sustain. In a forward gear it is the crossing's own bill; where a
  // turn-round names it, it is the U-turn's in any gear (the centre that went
  // over while backing round) and even while an earlier crossing's bill
  // stands (a U-turn made after a crossing that came home is a second act).
  let bill: SolidCrossTurnStep["bill"] = null;
  if (s.crossedSolidAt !== null && t - s.farSince >= sustainSec) {
    if (s.named && (s.billedAt === null || !s.billLive)) bill = "u-turn";
    else if (s.billedAt === null && f.forwardGear) bill = "crossing";
    if (bill !== null) {
      s.billedAt = t;
      s.billLive = true;
      if (bill === "u-turn") solidCrossActBilled(s, t);
    }
  }
  // TRAVELLING WITH THE FAR BANK for the sustain: this bank is the reference
  // now. (A turn-round that brought the car here was confirmed above, on this
  // frame or an earlier one; a car that was ALREADY travelling this way when
  // it crossed — Y1 — gets here with its crossing billed as a crossing.)
  // And not while it is still mid-swing (`solidCrossMidSwing`): that swing may
  // be the turn-round this crossing belongs to.
  // …nor while the manoeuvre is held open for a way back (`wayBackOpen`).
  if (s.reversedSince !== null && t - s.reversedSince >= sustainSec && !solidCrossMidSwing(s) && !s.wayBackOpen) {
    closeSolidCross(s, bank);
  }
  return { state: s, bill, names: null };
}

/**
 * A FRAME PAST THE KERB BUT STILL FIXED TO THIS ROAD (R5-3). The centre does
 * not pass the axis from a verge, so the bank, the crossing and its clocks
 * HOLD; the heading is followed exactly as on the carriageway — a turn-round
 * made on the verge begins, is placed and is confirmed out there — and a
 * confirmed turn-round names the live bill like any other.
 */
function stepSolidCrossTurnOffRoad(
  prev: SolidCrossTurnState,
  f: SolidCrossHeadingFrame & { bank: 1 | -1; bearingDeg: number },
  sustainSec: number,
): SolidCrossTurnStep {
  const s: SolidCrossTurnState = { ...prev };
  s.bearingDeg = f.bearingDeg;
  if (!stepSolidCrossHeading(s, f, sustainSec)) return { state: s, bill: null, names: null };
  const naming = s.crossedSolidAt !== null && !s.crossLate && s.turnPlace === true;
  confirmSolidCrossTurn(s);
  if (naming && s.billShared) {
    // A second turn-round, a second act (as on the carriageway).
    s.billedAt = null;
    s.billLive = false;
    s.billShared = false;
  }
  if (naming && s.billedAt !== null && s.billLive) {
    const names = s.billedAt;
    closeSolidCross(s, f.bank);
    solidCrossActBilled(s, names);
    return { state: s, bill: null, names };
  }
  if (f.bank !== s.bank && s.crossedSolidAt !== null && !s.billLive) {
    // Unbilled so far: the bill, when the car is back on the carriageway and
    // the sustain is met, is the U-turn's where the turn-round names it.
    if (naming) s.named = true;
    return { state: s, bill: null, names: null };
  }
  closeSolidCross(s, f.bank);
  return { state: s, bill: null, names: null };
}

/**
 * A FRAME ON WHICH THE ROAD HAS NO FIX ON THE CAR (R5-3). The bank, the
 * crossing, its clocks and the place already measured HOLD. The nose is still
 * followed, against the bearing the road had where it last saw the car — so a
 * turn-round in progress stays in progress only while the nose stays out of
 * the band, and one that begins out here has no station: `solidHere` is null,
 * and with it `lastPlace`, the place of any swing that starts, and the place
 * of any excursion that starts. Nothing is confirmed until the road sees the
 * car again (the sustain is never met here; the clock keeps running, so the
 * first frame back confirms a turn-round that is already 0.6 s old).
 */
function stepSolidCrossTurnUnseen(
  prev: SolidCrossTurnState,
  f: { headingDeg: number; stepM: number; t: number },
): SolidCrossTurnState {
  if (prev.bearingDeg === null) return prev;
  const s: SolidCrossTurnState = { ...prev };
  stepSolidCrossHeading(
    s,
    { deg: solidCrossDeltaDeg(prev.bearingDeg, f.headingDeg), solidHere: null, stepM: f.stepM, t: f.t },
    Number.POSITIVE_INFINITY,
  );
  return s;
}

/**
 * THE CROSSING'S BILL IN AN ARMED LESSON, ON THE REASON THE BODY HAS EARNED
 * (round 3, verifier W3). The bill is decided by the CENTRE — across a solid
 * axis for the sustain is a crossing whatever the speed — and the pooled reason
 * says «Пресече ИЗЦЯЛО …», which is true only once the whole body is over:
 *
 *   · `bodyAcross === true`  → the pooled row, «изцяло» and all;
 *   · `bodyAcross === false` → the same title and corrective with the reason
 *     «Застъпи … и навлезе с повече от половината автомобил …»
 *     (`catalog.ts SOLID_CROSS_ACT_ASTRIDE`) — what a centre across and a body
 *     astride actually amount to;
 *   · `null` (the body was not measured on this frame: a tick with no road
 *     record, or one the tracker cannot place) → the pooled row, exactly as
 *     shipped. Nothing is claimed that was not claimed before.
 *
 * Either row is still OPEN to being named a U-turn if the turn completes
 * (`catalog.ts PROVISIONAL_ACTS`).
 */
function solidCrossBill(t: number, bodyAcross: boolean | null, ownWay: boolean): ViolationEvent {
  if (bodyAcross === null) return makeViolation("CROSSED_SOLID_LINE", t);
  if (ownWay) {
    return makeViolation("CROSSED_SOLID_LINE", t, {
      detail: bodyAcross ? SOLID_CROSS_ACT_OWN_WAY : SOLID_CROSS_ACT_ASTRIDE_OWN_WAY,
    });
  }
  return bodyAcross
    ? makeViolation("CROSSED_SOLID_LINE", t)
    : makeViolation("CROSSED_SOLID_LINE", t, { detail: SOLID_CROSS_ACT_ASTRIDE });
}

/**
 * R6-3 — DOES THE HALF THE CENTRE IS ON RUN THE CAR'S OWN WAY? The half `bank`
 * carries traffic in direction `bank`; the car's travel direction is the one
 * its nose was last along (`dir`, R5-1). Where they agree, the half the car
 * has entered is NOT the oncoming one, and the crossing's reason may not say
 * it is. `false` where either is unknown — the reason is then the shipped one,
 * which is what a car that has never been along the road gets.
 */
function solidCrossOwnWay(s: SolidCrossTurnState, bank: 1 | -1 | null): boolean {
  return bank !== null && s.dir !== 0 && s.dir === bank;
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
  accrue = false,
): boolean {
  if (reset) {
    e.activeSince = null;
    e.emitted = false;
    e.qualifiedSec = 0;
    e.lastQualAt = null;
    return false;
  }
  if (!cond) {
    e.activeSince = null;
    e.lastQualAt = null;
    if (!accrue) e.qualifiedSec = 0;
    return false;
  }
  if (e.activeSince === null) e.activeSince = t;
  if (accrue) {
    e.qualifiedSec += e.lastQualAt === null ? 0 : Math.max(0, Math.min(t - e.lastQualAt, 2));
    e.lastQualAt = t;
  }
  const heldSec = accrue ? e.qualifiedSec : t - e.activeSince;
  if (!e.emitted && heldSec >= sustainSec) {
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
 *
 * 2026-08-26: the six ONE-SWITCH DUTIES opt in too (belt, handbrake, and the
 * four lamp arms), with `repeatSec` STANDING_DUTY_REGRADE_SEC and a `maxBills`
 * ceiling of two. They came from plain `stepEpisode`, which bills once and
 * never asks again — and that single bill is spent by the teach-first free
 * lesson, so an entire lesson driven unbelted or unlit reached the debrief as
 * «чисто каране … нито едно нарушение не влезе в точките». See
 * STANDING_DUTY_REGRADE_SEC for the three legs that photographed it.
 *
 * `maxBills` 0 = no ceiling, which is what the two speeding calls pass, so
 * their behaviour (and every recorded drive's speeding ledger) is unchanged.
 *
 * 2026-08-27: the three SPEED-BAND episodes opt into `accrue` — see
 * `SPEEDING_SUSTAIN_ACCRUES`. Every other caller leaves it false and is
 * byte-identical.
 */
function stepSustainedEpisode(
  e: EpisodeState,
  cond: boolean,
  reset: boolean,
  t: number,
  sustainSec: number,
  rearmSec: number,
  repeatSec: number,
  maxBills = 0,
  accrue = false,
): boolean {
  if (reset) {
    e.activeSince = null;
    e.qualifiedSec = 0;
    e.lastQualAt = null;
    if (e.resetSince === null) e.resetSince = t;
    if (t - e.resetSince >= rearmSec) {
      e.emitted = false;
      e.lastEmitAt = null;
      // A genuine correction ENDS the episode, so the ceiling starts over with
      // it: a driver who buckles up and later unbuckles again has committed a
      // second offence, not a fifth helping of the first.
      e.bills = 0;
    }
    return false;
  }
  e.resetSince = null;
  if (!cond) {
    // Condition false without a reset (e.g. the minor band vacated because the
    // episode ESCALATED into the dangerous band) — the episode is still open,
    // so the sustain clock restarts but the bill is not re-armed. Under
    // `accrue` the LEDGER survives that gap (the clock still stops): the
    // episode has not been corrected, so the seconds already driven over the
    // band are not given back. See `SPEEDING_SUSTAIN_ACCRUES`.
    e.activeSince = null;
    e.lastQualAt = null;
    if (!accrue) e.qualifiedSec = 0;
    return false;
  }
  if (e.activeSince === null) e.activeSince = t;
  if (accrue) {
    e.qualifiedSec += e.lastQualAt === null ? 0 : Math.max(0, Math.min(t - e.lastQualAt, 2));
    e.lastQualAt = t;
  }
  if (!e.emitted) {
    if ((accrue ? e.qualifiedSec : t - e.activeSince) < sustainSec) return false;
    e.emitted = true;
    e.lastEmitAt = t;
    e.bills += 1;
    return true;
  }
  if (
    repeatSec > 0 &&
    e.lastEmitAt !== null &&
    t - e.lastEmitAt >= repeatSec &&
    (maxBills <= 0 || e.bills < maxBills)
  ) {
    e.lastEmitAt = t;
    e.bills += 1;
    return true;
  }
  return false;
}

/**
 * THE STANDING-DUTY PUSH — the one place the two bills stop being alike.
 *
 * Called immediately after `stepSustainedEpisode` returned true, so `ep.bills`
 * is THIS bill's number. Bill 1 is a new act. Bill 2 is the SAME breach ten
 * driving seconds later, and it exists only to reach the charge the teach-first
 * free lesson consumed (see `STANDING_DUTY_REGRADE_SEC`) — so it is marked, and
 * `lessons/engine.ts` drops it when the code has already been charged. That is
 * what keeps exam mode, where the first bill grades, from billing one
 * continuous unlit run twice and failing a candidate Наредба № 38 passes.
 *
 * The mark is a FACT about the event, not a policy: „this is the same breach
 * again". What to do with it belongs to the layer that knows what was charged.
 */
function standingDutyBill(ep: EpisodeState, v: ViolationEvent): ViolationEvent {
  return ep.bills > 1 ? { ...v, regrade: true } : v;
}

/**
 * ONE ACT, ONE BILL — the crash swallows the departure it caused.
 *
 * Module scope rather than a closure inside `reduceTick` so it costs nothing on
 * the ~120 Hz path: it is CALLED only from inside the two `OFF_CARRIAGEWAY` fire
 * branches (at most twice per excursion), and a per-frame closure allocation
 * would be exactly the cost the branch placement exists to avoid.
 *
 * The comparison is the episode's ONSET against the LAST contact report, within
 * one sustain either way, because the order is not fixed: a car can leave the
 * road and then strike a body already off it, or spin off after a mid-carriageway
 * impact. Shared by the bill and its re-grade so a crash-caused departure cannot
 * be acquitted at 2 s and then charged at 8 s.
 */
function crashCausedDeparture(
  contactEpisodes: Record<string, ContactEpisode>,
  departureOnset: number | null,
): boolean {
  if (departureOnset === null) return false;
  let lastContactAt: number | null = null;
  for (const key of Object.keys(contactEpisodes)) {
    const at = contactEpisodes[key]!.at;
    if (lastContactAt === null || at > lastContactAt) lastContactAt = at;
  }
  return (
    lastContactAt !== null &&
    Math.abs(departureOnset - lastContactAt) <= OFF_CARRIAGEWAY_SUSTAIN_SEC
  );
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
 * THE TASK CAP'S BILL LINE — founder ruling 2026-10-03, «LIKE A SPEED SIGN»: a blown task cap is billed above the
 * number the glass shows PLUS the same tolerance a posted limit gets, on every rung. So it is `speedingBands`' own
 * graded line with the glass figure (`shownKmh`) in the place of the sign — `speedingGraceRatio` and
 * `speedingGraceMaxKmh` read off the same config, never re-typed: «≤36» bills above 39,6, «≤80» above 85, «≤20» above 22.
 * The comparison is the speeding gate's too (strictly above), so a speed EXACTLY on the line is the A12 tie and is not
 * billed.
 *
 * WHAT IT REPLACED, AND WHY THAT IS GONE: rounds 2–14 billed above `capKmh + graceKmh` — the objective's compiled gate
 * (the author's figure plus the RUNG's ladder grace) plus the objective's own slack. On L1 of `sc-follow-tailgater` the
 * glass says «≤36» and that line was 36 + 5 + 5 = 46, ten km/h over the figure the student read, where a posted 36 would
 * bill above 39,6. The ruling keeps the ladder grace for crediting the objective and for the coach's copy, NEVER for
 * billing — so the gate and its slack are not inputs here at all.
 */
export function taskCapBillLineKmh(shownKmh: number, cfg: RuleEngineConfig): number {
  return speedingBands(shownKmh, cfg).gradedAbove;
}

/**
 * THE RE-GRADE FOR A DRIVE THAT ENDS BEFORE THE RE-GRADE CLOCK DOES — the
 * fourth and last member of the family `SPEED_REGRADE_SEC` opens, and the
 * residual `signals-sweep161.test.ts` §7 recorded rather than closed
 * (`sc-signal-flashing:0d68b149`, critical).
 *
 * ── WHAT IS LEFT AFTER THE FIRST THREE REPAIRS ───────────────────────────────
 * `SPEED_REGRADE_SEC` bills a CONTINUING overspeed a second time six accrued
 * driving seconds after the card, because the first bill is spent by the
 * founder-approved teach-first free mini-lesson (`scenarios/policy.ts` A12).
 * That reaches every drive with six seconds left in it. It cannot reach a drive
 * that ENDS first, and short lessons are not a corner case — MEASURED on
 * `sc-signal-flashing` through the production recorder + a real session
 * (`signals-sweep161.test.ts` §7): the reducer bills at ≈8,9 s, raises the
 * re-grade at ≈14,9 s, and the route completes at ≈12,6 s, because sxf-v1's
 * drivable run is 145 m and 145 m at 59 км/ч is shorter than the clock. So the
 * audit's own frame — `.audit-frames/sweep161/sc-signal-flashing/mobile-wrong/
 * 04-t012s.png`, «Превишена скорост» over a cluster reading 59 км/ч under a 50
 * badge — reached its debrief on «0 наказателни точки · Второстепенни 0 0».
 * On a lesson this short „one warning, then grade" still reduces to „never
 * grade", which is the sentence all three earlier blocks were written against.
 *
 * ── WHAT THIS SETTLES, AND WHAT IT CANNOT TOUCH ──────────────────────────────
 * The last tick of the drive is the last moment anything can ask, so it asks:
 * the student was SHOWN this fault (`speedingMinor.emitted` — the bill the
 * teach consumed) and was STILL COMMITTING IT when the drive ended
 * (`speedingMinorRegrade.activeSince !== null`, re-checked against the tick in
 * hand so the function is honest when called standalone). It is one
 * второстепенна point, `regrade`-marked exactly like the six-second bill, so
 * `lessons/engine.ts` drops it wherever the code was ALREADY charged — exam
 * mode, a repeat offence, a grade-on-sight policy — and the ledger there stays
 * byte-identical.
 *
 * A12 — NOTHING INNOCENT MOVES, and the guard is the episode itself. ONE frame
 * at or under the posted limit runs `stepEpisode`'s reset arm and clears
 * `activeSince`, `emitted` and the accrued ledger, so a student who lifts off
 * at any point in the remaining seconds is acquitted exactly as before; so is
 * a student who was never billed in the first place (nothing was withheld from
 * him, so there is nothing to settle); so is one whose re-grade already landed
 * (`speedingMinorRegrade.emitted`). What is left is a driver who was told, in
 * the moment, with the catalogue's explanation and its «✔ Правилното действие»,
 * and who was over the graced limit on the chequered flag.
 *
 * WHY NO EXTRA GRACE PERIOD HERE. The six seconds are time to correct DURING a
 * drive that continues; granting them to a drive that has ENDED is not mercy,
 * it is an acquittal, and any threshold measured in seconds simply re-opens the
 * hole for the next lesson one second shorter. The опасна band is untouched
 * (`speedingDangerous` always grades on its first bill — there is no withheld
 * charge to settle), and so is every other code: the six one-switch duties and
 * the motorway crawl have their own clocks and their own measurements, and
 * moving them belongs to whatever row measures them.
 */
export function settleUnpaidSpeedingTeach(
  state: RuleEngineState,
  // THE THREE FIELDS IT ACTUALLY READS, not the whole tick — `t`, `speedKmh`
  // and `maxSpeedKmh`. A full `SimTick` still satisfies this structurally, so
  // every existing caller is unchanged; what it buys is that a session which
  // has to KEEP this measurement for a hand-ended drive can keep three scalars
  // instead of the tick entire. That matters beyond tidiness: session state
  // carrying the whole tick would carry `edgeAlignment`, `sM` and `distM`, and
  // the two `*-not-graded` suites prove those are ungraded by asserting that
  // stripping them moves not one byte of state. See `lessons/types.ts`
  // `SpeedingSettleTick`.
  tick: Pick<SimTick, "t" | "speedKmh" | "maxSpeedKmh">,
): ViolationEvent | null {
  // He was never billed → nothing was withheld → nothing to settle.
  if (!state.speedingMinor.emitted) return null;
  // The six-second re-grade already landed; this would be a third bill.
  if (state.speedingMinorRegrade.emitted) return null;
  // The episode is closed — he corrected, and the reset already acquitted him.
  if (state.speedingMinorRegrade.activeSince === null) return null;
  const limit = tick.maxSpeedKmh;
  const speed = Math.abs(tick.speedKmh);
  const bands = speedingBands(limit, state.config);
  if (!(speed > bands.gradedAbove && speed <= bands.dangerousAbove)) return null;
  return {
    ...makeViolation("SPEEDING_OVER_LIMIT", tick.t, {
      detail: encodeSpeedMeasurement(speed, limit),
    }),
    regrade: true,
  };
}

/** Which condition governs the envelope — the one with the smallest factor. */
export type ConditionsCause = "snow" | "fog" | "rain" | "night";

/**
 * THE PRUDENT-SPEED ENVELOPE THE WORLD DECLARES, or null when nothing reduces it
 * — the number SPEED_TOO_FAST_FOR_CONDITIONS grades against (ЗДвП чл. 20,
 * ал. 2). Factors compose by MIN, so the single most restrictive condition
 * governs and a rainy night grades once (see the detector in `reduceTick`,
 * which reads this function — one derivation).
 *
 * Exported for the two readers that must quote the SAME number the detector
 * used: the task and conditions cards (`lessons/engine.ts
 * withSpeedMeasurement`, round-2 C4 — both numbers on the glass) and the
 * finish-time settlement below, which re-checks the tick in hand.
 */
export function conditionsSpeedEnvelope(
  tick: Pick<SimTick, "maxSpeedKmh"> & Partial<Pick<SimTick, "rain" | "fog" | "snow" | "isNight">>,
  cfg: RuleEngineConfig,
): { limitKmh: number; cause: ConditionsCause } | null {
  const arms: Array<[ConditionsCause, number]> = [];
  if (tick.snow === true) arms.push(["snow", cfg.conditionSpeedSnowFactor]);
  if (tick.fog === true) arms.push(["fog", cfg.conditionSpeedFogFactor]);
  if (tick.rain === true) arms.push(["rain", cfg.conditionSpeedRainFactor]);
  if (tick.isNight === true) arms.push(["night", cfg.conditionSpeedNightFactor]);
  let governing: [ConditionsCause, number] | null = null;
  for (const a of arms) if (governing === null || a[1] < governing[1]) governing = a;
  if (governing === null || !(governing[1] < 1)) return null;
  return { limitKmh: tick.maxSpeedKmh * governing[1], cause: governing[0] };
}

/**
 * What the finish-time settlements of ЗДвП чл. 20, ал. 2 read off the drive's last tick: the speeding settlement's
 * three scalars, the four condition flags the weather envelope is derived from, and the task stamp the reducer graded
 * that tick against.
 */
export type KinSettleTick = Pick<SimTick, "t" | "speedKmh" | "maxSpeedKmh"> &
  Partial<Pick<SimTick, "rain" | "fog" | "snow" | "isNight" | "taskSpeedCap">>;

/**
 * ROUND 7 — A DRIVE THAT ENDS WHILE A SIGN-BOUND ARRIVAL WAITS (see „THE SIGN-BOUND ARRIVAL" in `reduceTick`): the
 * ending hands its bill over, as the cap's first bill at the moment the drive ended, carrying its blow. Round 14: the
 * cap ledger's own — nothing of another code can have taken it. null on every drive with nothing waiting.
 */
export function settlePendingTaskArrival(state: RuleEngineState, tick: { t: number }): ViolationEvent | null {
  const waiting = state.taskArrivalPending;
  if (waiting === null) return null;
  // Inside a cap act already named, the waiting arrival is that act's (one act, one bill) and nothing is handed over.
  if (state.taskAct.named) return null;
  return { ...makeViolation("TASK_SPEED_CAP_EXCEEDED", tick.t), signBoundArrival: waiting.arrival };
}

/**
 * THE CAP'S WITHHELD CHARGE, SETTLED AT THE END OF THE DRIVE — round 2 of the 2026-09-25 ruling (verifier F2), in the
 * shape of `settleUnpaidSpeedingTeach` (commit 0e58070): a drive that ends before the route does no longer forgives an
 * overspeed it was TAUGHT about and was still committing on the chequered flag. MEASURED before it: the neighbours of
 * the photographed `sc-ac-truck-spray` wrong leg — through the ≤80 mark at 116, then 130 held to the route end —
 * finished «0 / 0 / 0» with «Чисто и спокойно каране»: the card at 25.0 s, the route's end at 30.8 s, inside
 * SPEED_REGRADE_SEC. Six seconds granted to a drive that has ENDED are not mercy, they are an acquittal.
 *
 * ROUND 14 — THE CAP LEDGER'S ALONE (founder ruling 2026-10-03, «Cap adds, never removes»). Rounds 2–13 settled here the
 * one charge of a „kin ledger" act shared by the cap, the weather and the bend, handed to whichever ceiling was broken.
 * Under the ruling the weather and the bend settle exactly as with no cap (`settleUnpaidAdaptationTeach`), and this
 * settles the cap's own act: its first bill was SHOWN (round 3, R3 — its own teach first), its one re-grade has not
 * landed, its current episode's first bill was emitted and its re-grade clock is running, and the car is over the cap's
 * bill line on the last tick. One `regrade`-marked bill, so the lesson drops it wherever the cap was already charged.
 * A12 — one frame back under the line acquits, exactly as mid-drive.
 */
export function settleUnpaidTaskTeach(state: RuleEngineState, tick: KinSettleTick): ViolationEvent | null {
  const act = state.taskAct;
  if (!act.named || act.charged) return null;
  const cap = tick.taskSpeedCap;
  if (cap === undefined || !(Math.abs(tick.speedKmh) > taskCapBillLineKmh(cap.shownKmh, state.config))) return null;
  if (!state.taskCap.emitted || state.taskCapRegrade.activeSince === null || state.taskCapRegrade.emitted) return null;
  return { ...makeViolation("TASK_SPEED_CAP_EXCEEDED", tick.t), regrade: true };
}

/**
 * Was the bend overspeed TAUGHT in its current episode (its one bill emitted —
 * the curve code has no re-grade family) and is the car still over the
 * advisory plus its grace on the tick in hand? The episode's own onset is read
 * off the reducer (`activeSince`, set only while `curveOverspeed` held on the
 * last frame reduced) and the tick is re-checked so the question is honest when
 * asked standalone, exactly as `settleUnpaidSpeedingTeach` re-checks its band.
 */
function curveStillOver(state: RuleEngineState, tick: AdaptationSettleTick): boolean {
  const adv = tick.curveAdvisoryKmh;
  return (
    state.curveSpeed.emitted &&
    state.curveSpeed.activeSince !== null &&
    adv !== undefined &&
    Math.abs(tick.speedKmh) > adv + state.config.curveSpeedGraceKmh
  );
}

/** What the weather/bend settlement reads: the settlement tick, plus the bend's advisory on it. */
export type AdaptationSettleTick = KinSettleTick & Partial<Pick<SimTick, "curveAdvisoryKmh">>;

/**
 * THE WITHHELD WEATHER OR BEND CHARGE, SETTLED AT THE END — founder ruling 2026-09-25, «Yes, same as speeding» (round 4
 * of register item 17).
 *
 * The founder was asked whether a weather overspeed, taught and still running when a drive ends, should be settled the
 * way SPEEDING_OVER_LIMIT is since 0e58070 — and answered yes, for the weather code AND the bend code. So this is
 * `settleUnpaidSpeedingTeach`'s shape, applied to each code on ITS OWN guards:
 *
 *  · SPEED_TOO_FAST_FOR_CONDITIONS — its first bill was emitted in this episode (`conditionsSpeed.emitted`: the
 *    no-cap ledger always shows it), its re-grade has not landed, its re-grade clock is still running
 *    (`activeSince`: the last frame reduced was over), and the car is over the envelope on the tick in hand;
 *  · SPEED_TOO_FAST_FOR_CURVE — its one bill was emitted in this episode and the car is still over the advisory plus
 *    its grace inside the span on the tick in hand (`curveStillOver`). The curve code has NO re-grade family, so
 *    mid-drive a taught bend overspeed is never charged at all; this settles it only when the drive ENDS inside the
 *    bend.
 *
 * Each bill is `regrade`-marked, so `lessons/engine.ts` drops it wherever the code was already charged (exam mode, a
 * spent topic, a repeat) and wherever it is the lesson's own ADR-009 target. A12 — NOTHING INNOCENT MOVES.
 *
 * ROUND 14 (founder ruling 2026-10-03, «the bend/weather bills are charged exactly as they would be in a lesson with no
 * cap»): THE NO-CAP LEDGER'S SETTLEMENT, on every drive. Rounds 3–13 handed the acts a task took part in to the kin
 * settlement instead; nothing about the cap reaches this function any more.
 */
export function settleUnpaidAdaptationTeach(state: RuleEngineState, tick: AdaptationSettleTick): ViolationEvent[] {
  const out: ViolationEvent[] = [];
  const envelope = conditionsSpeedEnvelope(tick, state.config);
  if (
    state.conditionsSpeed.emitted &&
    state.conditionsSpeedRegrade.activeSince !== null &&
    !state.conditionsSpeedRegrade.emitted &&
    envelope !== null &&
    Math.abs(tick.speedKmh) > envelope.limitKmh
  ) {
    out.push({ ...makeViolation("SPEED_TOO_FAST_FOR_CONDITIONS", tick.t), regrade: true });
  }
  if (curveStillOver(state, tick)) {
    out.push({ ...makeViolation("SPEED_TOO_FAST_FOR_CURVE", tick.t), regrade: true });
  }
  return out;
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

/**
 * THE LEAD TRACK'S WINDOW, seconds — the span every lead quantity the
 * harsh-brake cause ledger reads is measured over (`sc-follow-tailgater:f42dce4f`).
 *
 * WHY A WINDOW AT ALL. The ledger used to read `gapOpeningMps`, the gap's change
 * over ONE frame divided by that frame. On the first frame of a stop that
 * number is an average of the cruise before the pedal and the brake after it,
 * weighted by where in the frame the pedal fell — so the same stop read 3.4 m/s
 * on a 4 Hz phone, 2.9 on a 2.8 Hz one and 4.6 on the desktop, against a 3 m/s
 * line. The act was graded by the frame rate.
 *
 * WHY THIS LENGTH. The reducer is never handed a frame longer than the physics
 * integrates: `components/sim/lesson-ui/sessionClock.ts` advances `SimTick.t` by
 * at most `PHYSICS_MAX_FRAME_DT` = 0.5 s (rapier's own clamp), and both phone
 * road records the row was filed on measure exactly that as their longest frame.
 * A window of that length therefore always has a real sample at or before its
 * start, so the value at `t − W` is an interpolation between two readings the
 * reducer actually holds, never an extrapolation, at EVERY rate the product can
 * feed it. Restated, not imported — rules/ does not depend on a component file
 * — and `lead-track-rate-free.test.ts` pins the two numbers together. A coarser
 * feed (the 1 Hz fixture batteries) degrades exactly as `accelWindowSec` does:
 * the window then holds one prior frame and the value is the old per-frame one.
 */
export const LEAD_TRACK_WINDOW_SEC = 0.5;

/**
 * A driver's reaction time, seconds — the product's ONE reaction time,
 * `runtime/worldRuntime.ts` AMBER_REACTION_SEC (the C3 comfortable-stop model,
 * also the merge census oracle's T_R). Restated for the same dependency reason
 * as the window above and pinned to it by the same test.
 */
export const LEAD_REACTION_SEC = 1.0;

/**
 * THIS FILE'S OWN LINE BETWEEN BRAKING AND NOT BRAKING, m/s² — the deceleration
 * at which the harsh-brake ledger opens an episode at all (`accelMps2 <= -2`)
 * and at which a released pedal re-arms it. The cause ledger now asks the same
 * question of the LEAD («is it braking?») and of the GAP («does it make you
 * brake?»), so it is named once and read everywhere the ledger asks it.
 * (Defined in `harshBrakeEpisode.ts` since round 3 of
 * sc-ac-wind-truck-pass:ff1d4290 and imported above — the same line opens a
 * harsh-brake episode on another vehicle's account.)
 */

/**
 * THE DEMAND LINE, m/s² — the braking a closing must DEMAND before it is a reason
 * to brake at all (round 2, integrator ruling R2-c). A closing the student can
 * absorb by lifting off the throttle is no reason to brake, and lifting off is
 * engine braking: ~0.5–1 m/s². So the line sits at the BOTTOM of that band — a
 * closing that needs even the gentlest lift counts, which is the A12 side of
 * every doubt. Round 1 used the braking line (2 m/s²) here and convicted a stamp
 * for a stopped queue 65–200 m ahead at 50 км/ч (verifier C1); at 0.5 a queue is
 * a cause from 207 m in at 50 км/ч, and the drill's steady `FTG_LEAD` (closing
 * 4.6 m/s from 75–90 m, demand 0.13–0.15) still is not.
 */
export const LEAD_DEMAND_LINE_MPS2 = 0.5;

/**
 * How long a lead whose OWN READINGS said «cause» stays one after they last did,
 * seconds (R2-b). Two readings carry it:
 *  - BRAKING (the ruling's own case): the windowed reading needs
 *    `2 × LEAD_TRACK_WINDOW_SEC` of continuous track before it can say it, and a
 *    lead that has just said it is still a reason to stamp a second later even if
 *    the corridor lost it — a ±2.5° weave of the student's own heading drops a
 *    car 100 m ahead out of the 4 m corridor for ~0.8 s (verifier R1, H);
 *  - DEMAND: the closing on the student's first braking frame already contains
 *    his own braking. Measured on a stopped queue 200 m ahead at 50 км/ч: demand
 *    0.52 at the pedal, 0.41 on a 2.5 Hz phone's first braking frame 0.4 s later
 *    — acquitted on the desktop, convicted on the phone, the row's own split. The
 *    closing the driver REACTED to is the one before the pedal.
 * Equal to `LEAD_REACTION_SEC`: the driver is still reacting to what he saw.
 */
export const LEAD_CAUSE_MEMORY_SEC = 1.0;

/**
 * How long a lead that newly ENTERED the corridor stays a cause, seconds
 * (R2-b): a car pulling out ahead is a plausible surprise. Two reaction times —
 * one to see it, one to answer it — and longer than the `2 × W` the readings
 * need, so a lead is never judged on readings it has not had time to build.
 */
export const LEAD_ENTRY_MEMORY_SEC = 2.0;

/**
 * THE ENTRY MARGIN, metres (round 3, integrator ruling F2). A reading NEARER
 * than the gap the track predicts for this instant by more than this is a car
 * that pulled in (an entry); FARTHER by more than this, the lead left and the
 * next car is a new track (a restart). A FIXED distance, never a speed times
 * the frame: round 2 used (student speed + 50 m/s)·Δt + 5 m, which is 6.1 m at
 * 60 Hz and 30.6 m at 2.5 Hz, so one cut-in was an entry on a desktop and
 * invisible on a phone (verifier F2).
 *
 * WHY THIS SIZE. The prediction (`leadGapPredicted`) carries the lead on at the
 * mean speed of its last window. A lead braking (or accelerating) at up to a
 * departs from that by at most a·Δt·(W + Δt)/2 — half a window of lag in the
 * speed estimate, then the frame — which for a 10 m/s² emergency stop over the
 * longest frame the product feeds (`LEAD_TRACK_WINDOW_SEC`, 0.5 s — see the
 * window's own comment) is 2.5 m. The student's own trapezoid odometer adds at
 * most a·dt²/8 on a frame his pedal falls inside, 0.3 m for a 9.4 m/s² stamp on
 * a 0.5 s frame. 2.5 + 0.3 → 3 m. Measured against it on the 181 recorded
 * w69/w71 replays (own frames, 2.5–120 Hz, jitter): every prediction of a
 * continuing track was within +1.36 / −1.29 m of the reading, the traffic
 * system's path-end step (0.02–1.13 m there) included.
 *
 * BOTH ERRORS ARE ACQUITTALS OR NOTHING. A false entry (a lead braking harder
 * than any car can) makes a lead within the reach a cause for 2 s; a false
 * restart makes a lead within the reach unread (a cause) for 1 s and costs a
 * far lead nothing it was not already without. What the margin cannot see — a
 * car cutting in less than 3 m nearer than the old lead — is recorded (verifier
 * C4): an exact entry needs a lead identity on SimTick, a product change with
 * its own ruling.
 */
export const LEAD_ENTRY_MARGIN_M = 3;

/**
 * The fallback for a track with ONE sample (seen for a single frame), where no
 * speed of the lead can be read yet and so nothing can be predicted: the gap
 * cannot change faster than the student's own speed plus the fastest a car
 * ahead plausibly moves (`LEAD_MAX_SPEED_MPS`, 180 км/ч), plus `restagedJump`'s
 * own 5 m slack — round 2's bound, now asked only on the second frame of a
 * track. (The track that frame continues was itself just started as an entry
 * or a restart, so what this bound can miss is a SECOND car within one frame.)
 */
const LEAD_MAX_SPEED_MPS = 50;
const LEAD_GAP_JUMP_M = 5;

/**
 * The gap the lead track PREDICTS for time `t` given the student's odometer
 * `odoM` then (round 3, ruling F2): the lead carried on from its last sample at
 * the mean speed of the last `LEAD_TRACK_WINDOW_SEC` of its track (of the whole
 * track while it is shorter than that). Null when the track has fewer than two
 * samples. (No floor at zero: a mutant that let the lead «reverse» survived
 * every act — a window's mean speed goes negative only by measurement noise of
 * centimetres, far inside the margin — so the floor was a predicate nothing
 * could flip.)
 *
 * WHY NO DECELERATION TERM. The ruling's example predicts from the closing AND
 * the lead's deceleration. Built that way, a mutant that zeroed the
 * deceleration survived every act: a lead whose deceleration is anything up
 * to 10 m/s² — steady or changing — is at most a·Δt·(W + Δt)/2 = 2.5 m from
 * THIS prediction at Δt = W = 0.5 s, which is exactly what
 * `LEAD_ENTRY_MARGIN_M` is sized to absorb, so the term could decide no entry
 * and no restart a car can produce. A predicate nothing can make true or false
 * is not kept. Constant speed also keeps a position step's effect on the next
 * prediction to at most the step itself (δ·Δt/W), where a deceleration read
 * across the step would double it.
 */
function leadGapPredicted(
  track: ReadonlyArray<{ t: number; odoM: number; gapM: number }>,
  t: number,
  odoM: number,
): number | null {
  const n = track.length;
  if (n < 2) return null;
  const last = track[n - 1];
  const dtp = t - last.t;
  if (!(dtp > 0)) return null;
  const W = LEAD_TRACK_WINDOW_SEC;
  const p1 = last.odoM + last.gapM;
  const ago = leadTrackAt(track, last.t - W);
  const span = ago !== null ? W : last.t - track[0].t;
  if (!(span > 0)) return null;
  const p0 = ago !== null ? ago.odoM + ago.gapM : track[0].odoM + track[0].gapM;
  return p1 + ((p1 - p0) / span) * dtp - odoM;
}

/**
 * Record this frame on the lead track and trim it (see `RuleEngineState.leadTrack`).
 * Returns how the frame STARTED a track, if it did: "entry" (first sight, back
 * after a silence longer than the window, or a nearer car in place of the old
 * one), "restart" (the world re-staged the car, or a farther car replaced the
 * lead), or null (the track continues, or nobody is in the channel).
 *  - `gapM === null`: a BLINK IS NOT AN ABSENCE. The track is kept while the
 *    silence is no longer than `LEAD_TRACK_WINDOW_SEC` since the last reading,
 *    and emptied once it is longer.
 *  - a READING after a silence longer than the window (`nullSinceReading` and
 *    more than W since the last reading) starts a fresh track as an entry —
 *    the silence is measured on every frame, not only on null ones (round 3,
 *    verifier C1: a null frame exactly W after the last reading kept the track,
 *    and the reading after a 0.99 s hole interpolated across it). Two
 *    consecutive READINGS a long frame apart (a 1 Hz fixture feed) are not a
 *    silence and continue the track.
 *  - otherwise the reading is compared with the gap the track predicts
 *    (`leadGapPredicted`): nearer by more than `LEAD_ENTRY_MARGIN_M` is an entry,
 *    farther by more than it a restart — the same distance at every frame rate.
 *  - `restaged`: the car was moved by the world; the gap before it is another road.
 */
function stepLeadTrack(
  track: Array<{ t: number; odoM: number; gapM: number; sM?: number }>,
  t: number,
  odoM: number,
  gapM: number | null,
  speedMps: number,
  restaged: boolean,
  nullSinceReading: boolean,
  horizonSec: number,
  sM: number,
): "entry" | "restart" | null {
  if (restaged) track.length = 0;
  const last = track.length > 0 ? track[track.length - 1] : null;
  if (gapM === null) {
    if (last !== null && t - last.t > LEAD_TRACK_WINDOW_SEC) track.length = 0;
    return null;
  }
  let started: "entry" | "restart" | null = null;
  if (restaged) started = "restart";
  else if (last === null) started = "entry";
  else if (nullSinceReading && t - last.t > LEAD_TRACK_WINDOW_SEC) started = "entry";
  else {
    const predicted = leadGapPredicted(track, t, odoM);
    if (predicted !== null) {
      if (predicted - gapM > LEAD_ENTRY_MARGIN_M) started = "entry";
      else if (gapM - predicted > LEAD_ENTRY_MARGIN_M) started = "restart";
    } else {
      const bound = (speedMps + LEAD_MAX_SPEED_MPS) * Math.max(0, t - last.t) + LEAD_GAP_JUMP_M;
      if (last.gapM - gapM > bound) started = "entry";
      else if (gapM - last.gapM > bound) started = "restart";
    }
  }
  if (started !== null) track.length = 0;
  track.push({ t, odoM, gapM, sM });
  while (track.length >= 2 && track[1].t <= t - horizonSec) track.shift();
  return started;
}

/**
 * The lead track at time `tau`, linearly interpolated between the two samples
 * that bracket it; null when the track does not reach back that far (the lead
 * has not been seen continuously for that long). Linear interpolation of the
 * gap and of the trapezoid odometer is exact for a constant-speed lead and a
 * constant pedal, which is the case the ledger has to get right.
 */
function leadTrackAt(
  track: ReadonlyArray<{ t: number; odoM: number; gapM: number }>,
  tau: number,
): { odoM: number; gapM: number } | null {
  if (track.length === 0 || track[0].t > tau) return null;
  for (let i = track.length - 1; i >= 0; i--) {
    const a = track[i];
    if (a.t > tau) continue;
    const b = track[i + 1];
    if (b === undefined || b.t <= a.t) return { odoM: a.odoM, gapM: a.gapM };
    const f = (tau - a.t) / (b.t - a.t);
    return { odoM: a.odoM + f * (b.odoM - a.odoM), gapM: a.gapM + f * (b.gapM - a.gapM) };
  }
  return null;
}

/**
 * How many windows of track the FAR deceleration reading needs (round 3): two
 * for «now», three for «before» — see `leadCauseReadings`. The track is kept
 * this long (`LEAD_FAR_WINDOWS × LEAD_TRACK_WINDOW_SEC`, 2.5 s).
 */
export const LEAD_FAR_WINDOWS = 5;

/**
 * The lead quantities the harsh-brake cause ledger reads, all measured over
 * `LEAD_TRACK_WINDOW_SEC` and therefore the same at every frame rate:
 *  - `closingMps`: how fast the gap shrank over the last window (null = the
 *    lead has not been seen that long);
 *  - `demandMps2`: the deceleration a driver who reacts after
 *    `LEAD_REACTION_SEC` needs to stop that closing before the gap is gone —
 *    c² / 2(gap − c·T_R), Infinity when the reaction alone eats the gap, 0 when
 *    the gap is not shrinking (the merge census oracle's `demanded`, written
 *    from the same kinematics);
 *  - `leadDecelMps2`: how fast the LEAD ITSELF is slowing — the drop between
 *    its mean speed over the window before last and over the last window,
 *    divided by the window. Its position along the road is the student's own
 *    odometer plus the gap, so this is the lead's speed and not the closing:
 *    a student who is merely faster than a steady lead reads 0 here.
 *  - `leadDecelFarMps2` (round 3, ruling F1): the same question asked so that
 *    ONE STEP in the lead's position cannot answer it. The quick reading above
 *    takes a two-window difference, and a position step δ inside it reads as
 *    −δ/W² for one window and +δ/W² for the next: measured through the lesson
 *    session, the traffic system finishes an actor at the end of its path with
 *    a one-frame forward step of up to one frame of its motion
 *    (`traffic/staged.ts`, the FR-B5-EXIT retirement run starts from the
 *    clamped `s`) — 0.52 m at 10 Hz read as ±2.08 m/s², and the student's own
 *    odometer steps by up to a·dt²/8 at his brake onset. So this reading takes
 *    the mean speeds v₀…v₄ of the last five windows (v₀ the newest) and asks
 *    whether the lead is slower NOW (the faster of v₀, v₁) than BEFORE (the
 *    slowest of v₂, v₃, v₄), by the braking line per window:
 *        (min(v₂, v₃, v₄) − max(v₀, v₁)) / W.
 *    A lead braking steadily at a reads exactly a (min picks v₂, max picks v₁,
 *    one window apart). A forward step inflates at most two ADJACENT windows
 *    (the frame it falls in, interpolated across a window edge): inside «now»
 *    that only lowers the reading, inside «before» the min takes the third
 *    window — a forward step of ANY size cannot raise it. A backward step can
 *    raise it only by straddling the v₀/v₁ edge, by at most |δ|/2W² (2|δ| m/s²
 *    at W = 0.5): under the line for any |δ| < 1 m, and the backward steps the
 *    product makes are the odometer's ≤ 0.3 m. A step larger than
 *    `LEAD_ENTRY_MARGIN_M` never reaches the track at all — it starts a new one.
 *    The price is lag: a 6 m/s² lead reads 2 after 0.91 s of braking (the quick
 *    reading: 0.41 s), and the reading needs 2.5 s of continuous track. Null
 *    while the track is shorter than that.
 */
export function leadCauseReadings(
  track: ReadonlyArray<{ t: number; odoM: number; gapM: number }>,
  t: number,
  odoM: number,
  gapM: number | null,
): { closingMps: number | null; demandMps2: number; leadDecelMps2: number | null; leadDecelFarMps2: number | null } {
  const W = LEAD_TRACK_WINDOW_SEC;
  if (gapM === null) return { closingMps: null, demandMps2: 0, leadDecelMps2: null, leadDecelFarMps2: null };
  const ago = leadTrackAt(track, t - W);
  if (ago === null) return { closingMps: null, demandMps2: 0, leadDecelMps2: null, leadDecelFarMps2: null };
  const closingMps = (ago.gapM - gapM) / W;
  const room = gapM - closingMps * LEAD_REACTION_SEC;
  const demandMps2 =
    closingMps <= 0 ? 0 : room <= 0 ? Infinity : (closingMps * closingMps) / (2 * room);
  const ago2 = leadTrackAt(track, t - 2 * W);
  const leadDecelMps2 =
    ago2 === null
      ? null
      : ((ago.odoM + ago.gapM - (ago2.odoM + ago2.gapM)) / W - (odoM + gapM - (ago.odoM + ago.gapM)) / W) / W;
  // positions at t, t − W, …, t − 5W; v[k] = mean speed over [t − (k+1)W, t − kW]
  const pos: number[] = [odoM + gapM];
  for (let k = 1; k <= LEAD_FAR_WINDOWS; k++) {
    const at = leadTrackAt(track, t - k * W);
    if (at === null) break;
    pos.push(at.odoM + at.gapM);
  }
  let leadDecelFarMps2: number | null = null;
  if (pos.length === LEAD_FAR_WINDOWS + 1) {
    const v = pos.slice(1).map((p, k) => (pos[k] - p) / W);
    leadDecelFarMps2 = (Math.min(v[2], v[3], v[4]) - Math.max(v[0], v[1])) / W;
  }
  return { closingMps, demandMps2, leadDecelMps2, leadDecelFarMps2 };
}

/**
 * How far a frame's displacement may differ from the trapezoid of its two speeds
 * and still be the student's own motion, as m/s² × Δt² (round 5, `leadPosOdoM`).
 * The trapezoid is exact for a constant pedal; it misses by at most
 * (|a₁| + |a₂|)·Δt²/8 when the pedal changes inside the frame — 2.5·Δt² for two
 * 10 m/s² accelerations. (A curve's chord is shorter than its arc by L³/24R², 3 cm
 * for a 2.5 Hz frame on a 20 m radius: inside the slack. A per-cent term for it and
 * a 1 cm rounding term were built and removed — no act could flip either.) A
 * displacement outside that (a re-stage, a fixture that never moves the car) is
 * not the student's motion, and the trapezoid's increment is used instead — the
 * round-4 track's own odometer, never a step the motion cannot explain.
 */
const LEAD_POSITION_SLACK_MPS2 = 2.5;

/**
 * The span of lead track the LAG-FREE lead speed is read over, seconds (round 5,
 * ruling N2) — one window. The quadratic through three of the track's own samples
 * is exact for a lead whose deceleration has been constant over the span, so a
 * shorter span reads a lead that has JUST begun to brake sooner; but it also reads
 * a step in the lead's position as speed — 3δ/span on the newest sample — and the
 * traffic system makes such steps (its path-end finish, 0.06 m in the drill, the
 * reason round 4 pinned «a ±0.15 m step must not acquit a steady far lead closed at
 * 1.8 m/s», lead-cause-far-and-entry.test.ts). Measured against that pin and
 * against base on exact traces (a lead braking 1–4 m/s² from 0.05–0.5 s before a
 * 9.4 m/s² stamp, the real closing at the pedal 3.02–3.5 m/s, 7 rates × 12
 * phases/jitters, 280 acts × 84 cells):
 *   span 0.25 s: the pin FAILS (a −0.15 m step acquits at 4–120 Hz); 128 cells in
 *                25 acts billed that base acquitted (onset ≤ 0.2 s before);
 *   span 0.4 s:  the pin FAILS (−0.15 m, 1 test); 516 cells in 57 acts (≤ 0.3 s);
 *   span 0.5 s:  the pin holds; 869 cells in 84 acts — 829 of them a lead that
 *                began braking at most 0.25 s before the pedal, and none more than
 *                0.3 m/s over the line at the pedal.
 * Those are leads the student, a reaction time away, could not have been
 * answering — the closing before that braking was under the line — so the span
 * is the one the step pin allows. A per-frame gap jitter of σ moves the reading
 * by ~2.5σ/span: on the round-4 verifier's noisy steady leads (closing 2–2.8 m/s,
 * ±0.5–2 cm per frame, 1,512 cells) it acquitted 76 — acquittals, never a bill.
 */
export const LEAD_SPEED_NOW_SPAN_SEC = LEAD_TRACK_WINDOW_SEC;

/**
 * THE CLOSING NOW, m/s (round 5, integrator ruling N2 — the ONE closing the far
 * ledger stamps `farClosingAt` from). The 0.5 s windowed closing
 * (`leadCauseReadings().closingMps`) is a mean, so it runs W/2 = 0.25 s behind a
 * closing that is still RISING: a student speeding up toward a steady lead
 * 125–200 m ahead (real closing 3.3–3.5 m/s at the pedal read as 2.55–2.88), or a
 * lead slowing 1.5–1.9 m/s² under the braking line, was billed where base, which
 * read the closing frame by frame, acquitted (round-4 verifier F1, acts Q1/Q2).
 * So this closing has no averaging lag of its own:
 *  - the STUDENT side is his exact speed on this tick;
 *  - the LEAD side is its current speed: the derivative, at `t`, of the quadratic
 *    through three of the track's own samples — this frame, the newest sample at
 *    least `LEAD_SPEED_NOW_SPAN_SEC` older with at least one between, and the one
 *    between nearest their midpoint. Exact for a lead whose deceleration is
 *    constant over the span, at ANY frame rate and phase (real samples, never an
 *    interpolation, whose chord error at 2.5 Hz would read a braking lead
 *    ~0.15·a m/s fast). The lead's position is the student's travel BY HIS
 *    POSITIONS plus the gap (`leadPosOdoM`, sample `sM`), not the trapezoid
 *    odometer, whose miss at the pedal frame read a steady lead as slowing by up
 *    to 0.8 m/s for the next 0.8 s and acquitted stops at 2.5–4 Hz whose closing
 *    never reached the line (66 of 1,134 asserted cells on the verifier's Q1).
 *    The ruling's own estimate (the window's mean speed carried forward by the
 *    quick deceleration × W/2) was built first and measured: it lags a lead
 *    that began slowing less than 2 W before (by a·W/4 at 0.5 s) and billed 27
 *    of 84 cells base acquitted on a lead slowing 1.5 m/s² from 0.5 s before the
 *    pedal at 3.1 m/s. It was then kept as a fallback for a track too sparse for
 *    three samples, and removed: at 2 Hz and over a track 2 W long always holds
 *    three, so the fallback was reachable only on frames a second or more apart,
 *    and a 1 Hz stamp from 58 км/ч to rest is billed by no build of this ledger
 *    (base included — measured), so it could decide nothing.
 *  - and THE PEDAL BETWEEN TWO FRAMES. A closing that rises until the pedal and
 *    then falls peaks BETWEEN frames, so both endpoint readings can sit under the
 *    line while the frame's MEAN — which is what base read — is over it (at 4 Hz
 *    a student speeding up 3 m/s² toward a lead at 3.3 m/s, pedal 0.17 s after the
 *    previous frame). So the closing is also read over the last frame: the
 *    student's mean speed across it (his displacement over Δt, `studentFrameMeanMps`)
 *    minus the lead's speed at its midpoint. The larger of the two is the closing:
 *    A12, in doubt the reading that acquits.
 * Null when the lead is not in the channel or the track is shorter than 2 W (the
 * ledger then treats the lead as UNREAD — a cause — anyway).
 */
export function leadClosingNowMps(
  track: ReadonlyArray<{ t: number; odoM: number; gapM: number; sM?: number }>,
  t: number,
  sM: number,
  gapM: number | null,
  studentSpeedMps: number,
  studentFrameMeanMps: number | null,
  dt: number,
): number | null {
  if (gapM === null) return null;
  if (leadTrackAt(track, t - 2 * LEAD_TRACK_WINDOW_SEC) === null) return null;
  const n = track.length;
  let i2 = -1;
  for (let i = n - 3; i >= 0; i--) {
    if (track[i].t <= t - LEAD_SPEED_NOW_SPAN_SEC) {
      i2 = i;
      break;
    }
  }
  if (i2 < 0) return null;
  const mid = (t + track[i2].t) / 2;
  let i1 = i2 + 1;
  for (let i = i2 + 2; i < n - 1; i++) if (Math.abs(track[i].t - mid) < Math.abs(track[i1].t - mid)) i1 = i;
  const t1 = track[i1].t;
  const t2 = track[i2].t;
  const p0 = sM + gapM;
  const p1 = (track[i1].sM ?? track[i1].odoM) + track[i1].gapM;
  const p2 = (track[i2].sM ?? track[i2].odoM) + track[i2].gapM;
  const f01 = (p0 - p1) / (t - t1);
  const f12 = (p1 - p2) / (t1 - t2);
  const f012 = (f01 - f12) / (t - t2);
  const leadSpeedAt = (tau: number) => f01 + f012 * (tau - t1 + (tau - t));
  const atTick = studentSpeedMps - leadSpeedAt(t);
  if (studentFrameMeanMps === null || !(dt > 0)) return atTick;
  return Math.max(atTick, studentFrameMeanMps - leadSpeedAt(t - dt / 2));
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export interface ReduceResult {
  state: RuleEngineState;
  events: RuleEvent[];
  /**
   * Acts that became known on this frame for bills ALREADY emitted — see
   * `types.ts ActAmendment`. ABSENT on every frame that names nothing, which is
   * every frame of every lesson that does not author `solidCrossUTurnEnabled`,
   * so the result's shape is exactly what it was everywhere else.
   */
  amendments?: ActAmendment[];
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
  /** Acts that became known this frame for bills already out (`ActAmendment`). */
  let amendments: ActAmendment[] | undefined;

  /*
   * WITHDRAWN 2026-08-26 — WHY THIS FILE DOES *NOT* STAND ITS SPAN DETECTORS
   * DOWN ON `tick.edgeId === null`, written here so the next reader does not
   * re-add the gate that was tried and pulled.
   *
   * The evidence for it is real: `.audit-frames/w10-4/frames/
   * sc-sp-curve__mobile-wrong/04-t154s.png` is an unbroken green plane with two
   * trees in it, the carriageway visible only in the mirror, 96 км/ч, and
   * «⚠ −3 ИЗПИТНИ Т. · Несъобразена скорост в завой» live on the glass. The car
   * really is convicted under a span it is not on, because every authored span
   * is resolved from the lane fix's ARCLENGTH and the lane fix survives the
   * kerb — only `edgeId` is nulled.
   *
   * A gate of the form `edgeId !== null` CANNOT repair that, for one measured
   * reason: `edgeId` goes null at 0.97 m past the kerb, not at thirty metres
   * (`runtime/worldRuntime.ts` OFF_CARRIAGEWAY_M = OFF_CARRIAGEWAY_BODY_
   * ALLOWANCE_M = chassis half-width 0.85 + the deliberately-drivable kerb
   * 0.12). Nothing on the tick separates that field from a car with one wheel
   * over the kerb — and one wheel over the kerb is EXACTLY where the learner
   * behaviour these detectors exist to correct happens:
   *  · В27 (`illegalBanRest` below): the whole subject of `sc-pk-stop-vs-park`
   *    is stopping where stopping is forbidden, and the way a learner does it
   *    is half on the pavement. A gate acquits the lesson's own mistake.
   *  · the curve advisory: running WIDE onto the verge is the CONSEQUENCE of
   *    „несъобразена скорост в завой", so a gate would acquit the fault at the
   *    instant it produced its result — and its reset (`advisory === undefined`)
   *    would re-arm the sustain on the way back, so a driver oscillating over
   *    the line through a bend could clear the corner unbilled.
   * The 96,908-pose sweep in `lessons/finish.ts` licenses only the other
   * direction — that nothing ON the carriageway reads off-network. It says
   * nothing about the kerb-straddle band, which is where all of this happens.
   *
   * AND THE LAYER ABOVE HAS ALREADY RULED ON IT. `runtime/worldRuntime.ts`'s
   * surface-consult header: „`maxSpeedKmh`, `wrongWay`, `laneId`, the zone flags
   * and every опасна channel stay exactly as shipped off the asphalt. Silencing
   * them would trade a wrong charge for NO charge … must still be a conviction,
   * not a shrug." The repair that header routes instead is an OFF_CARRIAGEWAY
   * code naming the real fault AT THE KERB — `rules/types.ts` + this file + the
   * violation catalogue + a lawRef the founder signs. That is the fix. A blanket
   * acquittal is not, so `sc-sp-curve:45e7e4fb` stays an OPEN row.
   *
   * WAVE 12 — THE TWO THINGS „that is the fix" STILL LEFT UNANSWERED, settled
   * here so the lane that lands the code inherits them instead of re-deriving
   * them. This paragraph ships NO predicate, is read by nothing at runtime and
   * closes no row by itself; it is written because the class has now been filed
   * four times against three different files — `sc-sp-curve:45e7e4fb` above,
   * plus `sc-ac-truck-spray:7e53374c` and `sc-rb-exit-signal:7948cdde` on the
   * w17 re-drive — and each re-filing has so far cost a lane.
   *
   *  1. THE ENGINE'S INPUT SIDE IS ALREADY LIVE; there is nothing to build on
   *     this side but the arm. `runtime/worldRuntime.ts:1992` publishes
   *     `edgeId: offCarriageway ? null : fix.edgeId`, and that tick reaches this
   *     reducer every frame on the real route — `LessonScene.tsx:4194`
   *     `runtime.sample(…)` → `LessonPlayShell.tsx:3966` `applyTick` →
   *     `lessons/engine.ts:873` `reduceTick`. The signal a conviction needs is
   *     already ON THE TICK, at the kerb, at 0.97 m. What is absent is only the
   *     code and its rows. WITH ONE POLARITY TRAP: `edgeId` is
   *     `string | null | undefined`, and `undefined` means „this tick source
   *     cannot answer" (replays, fixtures, the dev rigs — see `types.ts`). Only
   *     an explicit `null` may ever convict. A gate written as `!tick.edgeId`
   *     turns every hand-built tick in the suite into a driver in a field.
   *
   *  2. THE LAWREF IS NO LONGER AN OPEN QUESTION. Retrieved and not recalled
   *     (ADR-002), out of `content/law/acts/zdvp.json`:
   *       "ЗДвП чл. 15, ал. 1" — „На пътя водачът на пътно превозно средство се
   *       движи възможно най-вдясно ПО ПЛАТНОТО ЗА ДВИЖЕНИЕ, а когато пътните
   *       ленти са очертани с пътна маркировка, използва най-дясната свободна
   *       лента." The duty names the carriageway itself, so it is the article
   *       the act breaches; § 6, т. 3 of the same act defines „платно за
   *       движение", which is what keeps the citation answerable to a
   *       seventeen-year-old instead of circular. ал. 2 does NOT exempt it — its
   *       three cases pick a LANE, never a surface off the carriageway. Re-open
   *       the file rather than trust these words if one of them is load-bearing.
   *
   * THE SHAPE OF THE REST IS THE ONE `catalog.ts` ALREADY WORKED OUT for the two
   * telltale codes („TWO CODES THAT ARE STILL NEEDED AND ARE DELIBERATELY NOT
   * HERE"): `VIOLATIONS` (catalog.ts:142) and `N38_BASIS` (n38.ts:176) are TOTAL
   * `Record<ViolationCode, …>`, so a code added to `types.ts` alone will not
   * compile, and a code added everywhere BUT here has no emitter and is the
   * dead-predicate class. One change or none of it.
   *
   * WHAT THE TWO NEW EXHIBITS ADD over the curve row: they are the case with NO
   * COLLISION IN IT, which is where the gap actually bites. `sc-ac-truck-spray /
   * mobile-wrong` 04-t102s is 145 км/ч across open field with no road in frame
   * and no fault of any class booked; on `sc-rb-exit-signal / mobile-right` the
   * car comes to REST on the roundabout's central island and the sheet books
   * only «Удар в неподвижно препятствие». The collision row's own copy already
   * says „Излизането от платното е самото произшествие" — the product can NAME
   * the act today, it just cannot charge it unless the car also hits something
   * on the way out.
   *
   * ── THE CODE LANDED 2026-08-30, AND EVERYTHING ABOVE STILL STANDS ──────────
   * `OFF_CARRIAGEWAY` now exists — union, catalogue row, Н38 basis (б. „а"),
   * referent exemption, four censuses and a detector in the span block below,
   * arming on the `edgeId === null` this paragraph describes. Recorded here
   * because this file's neighbours have twice been sent to build something that
   * was already running, and a routing note that outlives its route is worse
   * than none (`lessons/finish.ts` says the same about its own).
   *
   * WHAT DID *NOT* CHANGE, and it is the reason this whole block is kept rather
   * than deleted: NO span detector was stood down on `edgeId === null`. The
   * curve advisory, the В27 rest and every other span still grade off the
   * asphalt exactly as before, for the reasons argued above — the kerb-straddle
   * band is where the learner behaviour lives, and a blanket acquittal trades a
   * wrong charge for no charge. The new code is the OTHER half of the ruling in
   * `runtime/worldRuntime.ts`'s surface-consult header („must still be a
   * conviction, not a shrug"): the sheet now names the real fault at the kerb
   * IN ADDITION to whatever else was billed.
   *
   * ── 2026-09-01, THE ONE CONJUNCT THE ARGUMENT ABOVE DOES LICENSE ───────────
   * The two objections are both about the FIRE (acquitting the fault at the
   * instant it produces its result; re-arming the sustain on the way back).
   * Neither is about the ARM. The curve advisory now carries a one-sided
   * conjunct that reads `edgeId` ONLY to refuse a FRESH episode off the asphalt
   * — an episode already open keeps running past the kerb and still fires there
   * — which is what `sc-sp-curve:45e7e4fb` actually photographs: a re-arm two
   * minutes into a field, off a lane fix that survives the kerb to the 30 m
   * lock ring. Its derivation is at the detector. NOTHING ELSE moved: В27 and
   * every other span detector still arm off the asphalt exactly as before.
   */

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
  /**
   * The same derivative taken over `motorwaySlowSteadyMeanWindowSec` — the
   * MEAN acceleration across a second of road rather than across the last few
   * render frames. Read by exactly one gate (the motorway crawl's steadiness
   * test) and by nothing else; `null` until the window has actually spanned
   * its length, so a car with no history is never judged steady on no data.
   * See `crawlSpeedWindow`'s note for why it is a second window.
   */
  const crawlAnchor = stepSpeedWindow(
    s.crawlSpeedWindow,
    t,
    speed,
    cfg.motorwaySlowSteadyMeanWindowSec,
  );
  const crawlMeanAccelMps2 =
    crawlAnchor !== null && t - crawlAnchor.t >= cfg.motorwaySlowSteadyMeanWindowSec
      ? (speed - crawlAnchor.speedKmh) / 3.6 / (t - crawlAnchor.t)
      : null;
  /** Gap to the lead vehicle, or null when the road ahead is clear/unknown. */
  const leadGapM =
    tick.leadGapM !== undefined && Number.isFinite(tick.leadGapM) ? tick.leadGapM : null;
  /** Rate the gap to the lead vehicle is opening, m/s (negative = closing). */
  const gapOpeningMps =
    leadGapM !== null && s.prevLeadGapM !== null && dt > 0
      ? (leadGapM - s.prevLeadGapM) / dt
      : 0;
  // THE LEAD TRACK (read only by the harsh-brake cause ledger — see
  // `LEAD_TRACK_WINDOW_SEC`). The per-frame `gapOpeningMps` above is left
  // exactly as it was for the detectors that read it; it is the ledger that no
  // longer does. A car the WORLD moved (`restagedJump`) starts a fresh track:
  // the gap across a re-stage is two different roads.
  /** This frame's step of `leadPosOdoM`, m (null on the first frame); read by the far closing's frame mean. */
  let posStepM: number | null = null;
  if (s.prevSpeedKmh !== null && dt > 0) {
    const trapezoidM = ((Math.abs(s.prevSpeedKmh) + Math.abs(speed)) / 2 / 3.6) * Math.min(dt, 2);
    s.leadOdoM += trapezoidM;
    const movedM =
      s.prevPosition !== null ? Math.hypot(tick.position.x - s.prevPosition.x, tick.position.y - s.prevPosition.y) : NaN;
    posStepM = Math.abs(movedM - trapezoidM) <= LEAD_POSITION_SLACK_MPS2 * dt * dt ? movedM : trapezoidM;
    s.leadPosOdoM += posStepM;
  }
  const leadTrackStarted = stepLeadTrack(
    s.leadTrack,
    t,
    s.leadOdoM,
    leadGapM,
    Math.abs(speed) / 3.6,
    restagedJump(s.prevPosition, tick, dt, speed),
    s.leadMemory.nullSinceReading,
    LEAD_FAR_WINDOWS * LEAD_TRACK_WINDOW_SEC,
    s.leadPosOdoM,
  );
  s.leadMemory.nullSinceReading = leadGapM === null;
  /** The student's mean speed over this frame, m/s — his position step over Δt (`leadPosOdoM`'s step). */
  const studentFrameMeanMps = posStepM !== null ? posStepM / dt : null;
  if (leadTrackStarted === "entry" && leadGapM !== null && leadGapM <= cfg.harshBrakeSignalCauseM) {
    s.leadMemory.enteredAt = t;
  }
  // Round 4: an entry at ANY range is remembered on its own stamp, which only the
  // far ledger reads (see `leadMemory`). No range test: an entry within the reach
  // is already remembered by `enteredAt`, which is read everywhere, so stamping it
  // here too can change no verdict (mutation: equivalent).
  if (leadTrackStarted === "entry" && leadGapM !== null) {
    s.leadMemory.farEnteredAt = t;
  }
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
      // The JU-23 wait-freeze ledger is a LEFT/RIGHT scan credit, so only
      // those two members may reset it. `rear` never did; `shoulder` must not
      // either — the blind-spot check is a look behind the B-pillar, not the
      // ляво-дясно scan across a junction mouth that this credit measures.
      if (e.mirror === "left" || e.mirror === "right") s.scanStopCreditSec[e.mirror] = 0;
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
      // …and the driving clock restarts with it. Standing still does not age a
      // stop — see `RuleEngineState.stop.movingSinceStopSec` for the drive this
      // closes and why the wall clock was billing the wait itself.
      s.stop.movingSinceStopSec = 0;
    }
  } else {
    s.stop.stoppedSince = null;
    if (s.stop.lastQualifyingStopAt !== null) s.stop.movingSinceStopSec += dt;
  }

  // -- 1b. move-off observation (PK-05, DVSA top-5) — the session's FIRST
  // move-off from an observed rest must carry the WHOLE observation within the
  // lookback: a mirror behind you (left door or interior) AND the check over
  // your shoulder into the blind spot. Config-gated OFF by default (see
  // types.ts: curb exits are indistinguishable from queue move-offs with
  // current telemetry, and the A12 innocent-drive contract pulls away
  // unglanced). A session that starts already in motion, or whose first motion
  // is a reverse maneuver, is never graded (conservative).
  //
  // BOTH HALVES, SINCE 2026-09-01 — AND THE MIRROR ALONE WAS THE TAUGHT FAULT.
  // This read `left || rear` for as long as it existed, because until this wave
  // the cabin had no fourth look to ask for: `MirrorGlanceKind` was
  // „left | right | rear" and no key, button or hotspot on either platform
  // could perform a shoulder check. So the drill that exists to teach „огледало
  // И през рамо" cleared a student who did half of it, and the half it accepted
  // is the one that cannot see the thing that kills — the blind spot is by
  // definition what the glass misses.
  //
  // NOTHING NEW IS CLAIMED BY TIGHTENING IT. The product has said BOTH all
  // along, in the two authored texts this code is graded against:
  // `catalog.ts` MOVE_OFF_WITHOUT_OBSERVATION.correctiveBg — „поглед в лявото
  // огледало и към мъртвата зона" — and `procedures/tutorial.ts`
  // final-mirror-check, whose gradedByCode IS this code and whose howBg reads
  // „Поглед в лявото огледало, поглед във вътрешното, после КРАТЪК поглед през
  // рамо наляво — мъртвата зона не се вижда в никое огледало." The detector was
  // the only part of the product that disagreed. The lawRef is untouched
  // (ЗДвП чл. 25, ал. 1, retrieved, not restated).
  if (!s.moveOff.done) {
    if (speed <= cfg.fullStopMaxSpeedKmh) {
      s.moveOff.restSeen = true;
    } else if (speed > cfg.movingSpeedKmh) {
      s.moveOff.done = true;
      if (cfg.moveOffObservationEnabled && s.moveOff.restSeen && forwardGear) {
        const fresh = (at: number | null): boolean =>
          at !== null && t - at <= cfg.moveOffLookbackSec;
        // The mirror half: left door OR interior. RIGHT is deliberately absent
        // — a kerb-side look is not the move-off observation, which is what the
        // «Поглед само към бордюра» demo of this drill exists to show.
        const mirrored = fresh(s.lastGlanceAt.left) || fresh(s.lastGlanceAt.rear);
        const shouldered = fresh(s.lastGlanceAt.shoulder);
        if (!mirrored || !shouldered) {
          events.push(makeViolation("MOVE_OFF_WITHOUT_OBSERVATION", t));
        }
      }
    }
  }

  // -- 1c. stall grading (VP-04): the driveline latches `stalled` until the
  // next successful restart — the rising edge is one официална второстепенна
  // „загасване"; the restart re-arms the episode for the next one.
  if (stepEpisode(s.stall, tick.stalled === true, tick.stalled !== true, t, 0)) {
    events.push(makeViolation("ENGINE_STALLED", t));
  }

  // The contact odometer (COLLISION_REOPEN_TRAVEL_M measures against it).
  // Accrued BEFORE the event loop, so a report arriving on this frame is judged
  // against the ground covered up to it. MAGNITUDE, not direction: the live
  // channel hands the reducer a SIGNED speed (negative in reverse, the same
  // asymmetry contact.ts documents), and backing 1 m off a car you just hit is
  // exactly the travel this measures. dt is clamped like the clean-driving
  // integrator's — a pause/resume jump (every teach card pauses the sim) must
  // not fabricate metres the car never drove and re-arm a bill with them.
  // Monotone rather than reset-per-report: each episode subtracts its own
  // baseline, so scraping a wall cannot zero the distance the car has put
  // between itself and the car it hit a minute ago.
  const contactTravelM = (Math.abs(speed) / 3.6) * Math.min(dt, 2);
  s.contactOdometerM += contactTravelM;
  // …and the half of it driven BACKWARDS (CONTACT_REVERSE_TRAVEL_M). Both
  // readings of "in reverse" are honoured because the channels disagree: the
  // driveline hands the reducer a SIGNED speed, a replayed trace can carry an
  // unsigned one alongside the selector. Either is evidence the car went away
  // from what is in front of it; neither can be produced by a scrape.
  if (speed < 0 || tick.gear < 0) s.contactReverseOdometerM += contactTravelM;
  // …and the daylight stamp that goes with it (CONTACT_LEAD_GAP_M). Accrued on
  // the same frames and for the same reason: a report arriving now is judged
  // against what was SEEN up to it, and the bodies are never apart on the frame
  // of an impact. `leadGapM` is the reducer's derived gap, so an absent or
  // infinite channel is already null here — unknown reads as apart, which is
  // what keeps every drive without a lead reading byte-identical.
  if (leadGapM === null || leadGapM >= CONTACT_LEAD_GAP_M) s.lastLeadApartAt = t;
  // …and the same reading WITHOUT the "unknown counts as apart" clause, for the
  // bodies the gap channel is not about (`lastGapClearAt`).
  if (leadGapM !== null && leadGapM >= CONTACT_LEAD_GAP_M) s.lastGapClearAt = t;

  // -- 2. discrete zone / contact events
  // ONE ACT, ONE BILL: a car the WORLD moved (a re-staged encounter) is at a
  // junction it has not been graded at, whatever the odometer and the segment
  // fix say — so the act latches are spent first (see `restagedJump`).
  if (restagedJump(s.prevPosition, tick, dt, speed)) s.actBills = {};
  s.prevPosition = { x: tick.position.x, y: tick.position.y };
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
      if (p.indicatorOk && p.mirrorOk) {
        // THE PRAISE WAITS FOR THE VEHICLE BEHIND, AND IS NOT GIVEN FOR A
        // CUT-IN (sc-ac-wind-truck-pass:ff1d4290 round 2). «Правилна смяна на
        // лента … в правилния ред и навреме. Отлично.» was pushed here on the
        // order of the mirror and the lamp alone; the round-1 verifier's tape
        // (F-01) has it printed over a return made three metres ahead of a
        // truck that then braked from 40 to 19.5 км/ч. Two rules, both read off
        // state another case of this reducer owns:
        //  · `forced` — the lane change is the entry of a billed cut-in
        //    (`billForcedLaneEntry`): no praise, ever;
        //  · a `laneEntryAnswer` watch is open — the vehicle he is in front of
        //    has not answered yet: the praise is HELD (the order was right, so
        //    there is no violation to push and nothing else to do) and is
        //    pushed, with the lane change's own time, on the first frame no
        //    watch is open — or never, if the answer is a hard brake or a
        //    lift (round 3: the vehicle had to give way, so «навреме» is false).
        // A lesson with no such vehicle never opens a watch and never bills a
        // cut-in, so this branch is its old one line.
        if (p.forced === true) continue;
        if (laneEntryWatchOpen(s)) {
          still.push(p);
          continue;
        }
        events.push(makeCommendation("SAFE_LANE_CHANGE", p.t));
      }
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
      // A lane change made while a billed cut-in is still being answered IS
      // that cut-in's entry (the bill lands when his body's first corner
      // crosses the line, or when the vehicle behind has braked; the lane id
      // flips when his centre does) — see `pending.forced`.
      if (cutInActOpen(s, t)) s.laneChange.pending.push({ t, dir, indicatorOk, mirrorOk, forced: true });
      else s.laneChange.pending.push({ t, dir, indicatorOk, mirrorOk });
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
  const speedingMinorCond = speed > bands.gradedAbove && speed <= bands.dangerousAbove;
  if (
    stepSustainedEpisode(
      s.speedingMinor,
      speedingMinorCond,
      speedReset,
      t,
      cfg.speedingMinorSustainSec,
      cfg.speedingRearmSec,
      cfg.speedingRepeatSec,
      0,
      SPEEDING_SUSTAIN_ACCRUES,
    )
  ) {
    events.push(makeViolation("SPEEDING_OVER_LIMIT", t, { detail: speedDetail }));
  }
  // THE RE-GRADE THE FREE LESSON CONSUMED (SPEED_REGRADE_SEC — the frames and
  // the whole argument are there). The SAME condition as the bill above, on a
  // sustain that is `SPEED_REGRADE_SEC` longer — so it can only ever fire AFTER
  // that bill has already fired, never instead of it, and it fires exactly once
  // per continuous overspeed.
  //
  // It is additive on purpose: `stepSustainedEpisode`'s own cadence is left
  // byte-identical, so every bill this reducer produces today it still produces
  // at the same instant, and the 20 s ladder — which the M-16 note says must
  // keep making sustained speeding cost monotonically more than corrected
  // speeding — is untouched. What is added is ONE bill, marked `regrade`, which
  // `lessons/engine.ts` drops the moment the code has already been charged. So
  // in exam mode, on a repeat offence and under a grade-on-sight policy the
  // ledger does not move at all; it moves only where the single bill was spent
  // on the teach and the student was charged nothing.
  //
  // ── ITS RESET IS THE BILL'S RESET, NOT THE RAW ONE (2026-08-30) ────────────
  // This call passed `speedReset` — `speed <= limit` — so ONE frame at or under
  // the limit wiped the re-grade's ledger and re-armed it from zero. The bill
  // it exists to complete does not work that way: it rides
  // `stepSustainedEpisode` with `speedingRearmSec`, whose own doc says „a dip
  // back to the limit only re-arms once the driver has genuinely HELD it.
  // Anything shorter is one continuing offence, not a new one." The two halves
  // of one offence disagreed about what a correction is, and the disagreement
  // pointed the wrong way.
  //
  // MEASURED THROUGH THIS REDUCER, posted 50, one lesson-length drive:
  //   59 км/ч steady for 17 s               → bill + re-grade  (1 второстепенна)
  //   59/49 saw-tooth, 5 s over / 1 s under → the bill ALONE   (0)
  //   59/49 saw-tooth, 7 s over / 1 s under → the bill ALONE   (0)
  // The saw-tooth driver spends MORE of the drive above the graced limit and
  // pays a point LESS, because his one bill is spent by the teach-first free
  // mini-lesson and nothing ever asks again. That is the M-16 invariant this
  // file states twice — „sitting over the limit costs monotonically more the
  // longer it lasts" and, on the опасна band, „sustained is still never cheaper
  // than oscillating" — inverted, on the code the audit photographs most.
  // `speedingRepeatSec` cannot cover it: its 20 s cadence is longer than the
  // drive on most of the catalogue's lessons, which is the sentence
  // SPEED_REGRADE_SEC was written for in the first place.
  //
  // So the re-grade now resets on A CORRECTION THAT COUNTS: at or under the
  // limit and HELD there for `speedingRearmSec`, this engine's declared unit
  // for exactly that (the same figure `WRONG_WAY_REARM_SEC` borrows). A shorter
  // dip leaves the ledger standing — `stepEpisode`'s `!cond` arm keeps
  // `qualifiedSec` under `accrue`, and credits nothing for the gap itself, so
  // only seconds genuinely driven over the band ever count. A real correction
  // still wipes the ledger AND re-arms the episode in full.
  //
  // ORDER IS LOAD-BEARING: `resetSince` is maintained by the
  // `stepSustainedEpisode` call above, off the SAME `speedReset` boolean, and
  // is null on every frame that is not a reset — so it reads „how long the car
  // has been continuously at or under the posted limit". The bill must keep
  // being stepped before the re-grade.
  //
  // A12 — NOTHING INNOCENT MOVES. The student who lifts off and stays off for
  // four seconds is acquitted exactly as before. The ceiling is unchanged at
  // ONE extra bill per episode (`stepEpisode` emits once), it is
  // `regrade`-marked, and `lessons/engine.ts` drops it wherever the code was
  // already charged — so exam mode stays byte-identical.
  const speedCorrectionHeld =
    speedReset &&
    s.speedingMinor.resetSince !== null &&
    t - s.speedingMinor.resetSince >= cfg.speedingRearmSec;
  if (
    stepEpisode(
      s.speedingMinorRegrade,
      speedingMinorCond,
      speedCorrectionHeld,
      t,
      cfg.speedingMinorSustainSec + SPEED_REGRADE_SEC,
      SPEEDING_SUSTAIN_ACCRUES,
    )
  ) {
    events.push({
      ...makeViolation("SPEEDING_OVER_LIMIT", t, { detail: speedDetail }),
      regrade: true,
    });
  }
  // THE REPEAT CADENCE STOPS AT THE ОПАСНА LINE (2026-08-18, the redrive).
  //
  // `speedingRepeatSec` exists so that a continuing offence keeps costing more
  // than a corrected one, and in the второстепенна band it does real work: a
  // point a rung, and it is those rungs that turn a 7 км/ч overspeed held for
  // three minutes into a fail rather than a shrug. So the minor call above
  // passes `cfg.speedingRepeatSec` byte-identically, and must keep doing so —
  // collapsing it would move a 10-point fail to a 1-point pass, the one
  // direction a scorer may never move (see rules/scoring.ts's header).
  //
  // In the опасна band there is no work left for it to do. One bill is 10
  // наказателни точки against an allowance of 9, so the exam is НЕИЗДЪРЖАН at
  // the first rung and every later rung changes nothing the student is told —
  // except the count, and the count is the thing the sweep photographed:
  // `sc-park-left / pc-wrong` and `sc-park-zebra / pc-wrong` each printed
  // ELEVEN «Превишаване с повече от 10 км/ч» rows, «110 наказателни точки ·
  // Общо (допустими 9) 11», for one continuous overspeed
  // (`.audit-frames/sweep161/sc-park-left/pc-wrong/08-debrief.png`). MEASURED
  // through the reducer, 200 s held at 70 in a 50: 10 bills / 100 points
  // before, 1 bill / 10 points after
  // (`__tests__/sweep161-fault-episodes.test.ts`).
  //
  // It cannot credit anybody, structurally: the opening bill still stands and
  // 10 > 9, so a drive that failed on this fault still fails on it. And the
  // M-16 invariant it was half of survives — a saw-tooth in the опасна band
  // does not re-arm inside `speedingRearmSec` either, so sustained is still
  // never cheaper than oscillating, both now being one bill.
  if (
    stepSustainedEpisode(
      s.speedingDangerous,
      speed > bands.dangerousAbove,
      speedReset,
      t,
      cfg.speedingDangerousSustainSec,
      cfg.speedingRearmSec,
      0,
      // NOT ACCRUED, and it is a deliberate asymmetry — see the last clause of
      // `SPEEDING_SUSTAIN_ACCRUES`. This is the one speed code whose single
      // bill is 10 наказателни точки against an allowance of 9, i.e. an instant
      // НЕИЗДЪРЖАН, and its sustain is already the shortest in the file (1 s).
      // A ledger that survives gaps would let four quarter-second blips past
      // +10, spread over a whole lesson, add up to a failed exam — which is the
      // A12 direction this file does not move in. The второстепенна band
      // beneath it accrues and still marks the same driving at 1 point a rung.
    )
  ) {
    events.push(makeViolation("SPEEDING_DANGEROUS", t, { detail: speedDetail }));
  }

  const moving = speed > cfg.movingSpeedKmh;
  // THE ONE-SWITCH DUTIES (STANDING_DUTY_REGRADE_SEC — the belt, the handbrake
  // and the four lamp arms below). Each is a state the driver ends with a
  // single control action, and each used to bill ONCE per episode however long
  // the breach ran — the bill the free mini-lesson then spent, which is how a
  // whole lesson driven unbelted reached its debrief as «чисто каране». They
  // now re-grade ONCE, ten driving seconds after the student was shown the
  // rule, and never a third time — and that second bill is MARKED (see
  // `standingDutyBill`), so the layer that knows what was already charged can
  // refuse to charge one continuous breach twice.
  if (
    stepSustainedEpisode(
      s.seatbelt,
      !tick.seatbeltOn && moving,
      tick.seatbeltOn,
      t,
      cfg.seatbeltSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(standingDutyBill(s.seatbelt, makeViolation("SEATBELT_OFF_WHILE_MOVING", t)));
  }
  if (
    stepSustainedEpisode(
      s.handbrake,
      tick.handbrakeOn && moving,
      !tick.handbrakeOn,
      t,
      cfg.handbrakeSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(standingDutyBill(s.handbrake, makeViolation("HANDBRAKE_LEFT_ON", t)));
  }
  // …AND THE SAME LEVER FROM A STANDSTILL — the half the arm above cannot
  // reach (sc-vp-handbrake:1f2f7463, critical).
  //
  // The arm above needs `moving`. `PARKING_BRAKE_FORCE_N` (13 000 N against a
  // 4 800 N peak engine force) means a car whose lever was never released is
  // never moving: eight seconds of floored throttle reached 0.32 км/ч on the
  // drive rig, a fifteenth of `movingSpeedKmh`. So on the lesson TITLED
  // „Потегляне с вдигната ръчна" the named fault was unbookable, and the
  // debrief of a drive that never left the mark read «чисто каране без нито
  // едно нарушение · Второстепенни 0 0».
  //
  // The discriminator is the PEDAL, not the speedometer: a stationary car with
  // the lever up and no foot on the accelerator is a student who has not
  // started yet and must never be convicted, while one holding the throttle is
  // asking the car to move. `tick.throttlePedal` is absent on every trace,
  // replay and fixture (see its field note), so absence acquits.
  //
  // The two arms are DISJOINT by construction (`moving` / `!moving`) and keep
  // separate episodes, so a student cannot be billed twice for one lever, and
  // `handbrakeMoveOffSustainSec` (2.5 s) sits after `STUCK_START_HINT_S`
  // (1.2 s) so the cockpit has already told him what is holding the car.
  if (
    cfg.handbrakeMoveOffEnabled &&
    stepSustainedEpisode(
      s.handbrakeMoveOff,
      tick.handbrakeOn &&
        !moving &&
        (tick.throttlePedal ?? 0) > HANDBRAKE_MOVE_OFF_PEDAL_ON &&
        // …AND THE LEVER MUST BE THE BLOCKER. `stuckStartReason` clears them in
        // order — engine off, P, N, then the parking brake — and the cockpit
        // says which one it is. On the COLD hand-over this very drill uses at
        // L4 (engine off, selector P, lever up) it says «запали двигателя»,
        // so a handbrake bill there would charge a fault nobody named and
        // narrate a cause the windscreen contradicts. Both channels acquit
        // when absent, and both are the SAME question the cockpit answered.
        tick.engineOn === true &&
        tick.gear !== 0,
      !tick.handbrakeOn,
      t,
      cfg.handbrakeMoveOffSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(
      standingDutyBill(
        s.handbrakeMoveOff,
        makeViolation("HANDBRAKE_LEFT_ON", t, { detail: HANDBRAKE_ACT_MOVE_OFF_ATTEMPT }),
      ),
    );
  }
  // The one derivation of the low-beam duty (see `lowBeamDuty`): the three arms
  // below — night here, rain and snowfall further down — read it instead of
  // each restating the precedence, and the HUD's lights row reads the same
  // function. Byte-identical to the three inline conditions it replaced:
  // "night" IS `isNight`, "rain" IS `rain && !isNight`, "snow" IS
  // `snow && !rain && !isNight`.
  const lampDuty = lowBeamDuty(tick);
  if (
    stepSustainedEpisode(
      s.headlights,
      lampDuty === "night" && tick.headlights === "off" && moving,
      !tick.isNight || tick.headlights !== "off",
      t,
      cfg.headlightsSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(standingDutyBill(s.headlights, makeViolation("HEADLIGHTS_OFF_AT_NIGHT", t)));
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
  //
  // WHERE A LESSON ARMED THE REVERSAL (`solidCrossUTurnEnabled`), TWO THINGS
  // ARE READ OFF THE ROAD FIRST — round 3; nothing in this block runs, and
  // `tick.edgeAlignment` is not read, with the key off:
  //  · `onReferenceBank` — the centre is on the bank the car last travelled
  //    WITH (or was on when it last turned round — round 5), so it has
  //    crossed nothing. «The nose opposes its bank» is true
  //    there too once the nose is past 90° (a tight turn from the outer lane
  //    is 100° round with its centre 4 m short of the axis), and that is the
  //    frame this detector used to bill — «Пресече изцяло …» on a car that had
  //    not reached the line, and on one that never did (verifier W2). A frame
  //    the tracker cannot measure (past the kerb, no fix) HOLDS the last bank
  //    it measured: the centre does not pass the axis from a verge. With no
  //    reference yet, or a tick that carries no road record, this is false and
  //    the detector is exactly the shipped one.
  //  · `bodyAcross` — the whole body is across the axis on THIS frame
  //    (`null` = not measured). It chooses the bill's reason: `solidCrossBill`.
  let onReferenceBank = false;
  let bodyAcross: boolean | null = null;
  const solidCrossEa = cfg.solidCrossUTurnEnabled ? tick.edgeAlignment : undefined;
  /** The bank the centre is on, where the road has a fix on the car on a
   *  TWO-WAY edge — on its carriageway or past its kerb; `null` elsewhere. */
  const solidCrossBank: 1 | -1 | null =
    solidCrossEa !== undefined &&
    solidCrossEa.deg !== null &&
    solidCrossEa.edgeId !== null &&
    solidCrossEa.travelDir !== undefined &&
    tick.oneway === false
      ? solidCrossEa.travelDir
      : null;
  const solidCrossMeasured = solidCrossBank !== null && solidCrossEa !== undefined && !solidCrossEa.offCarriageway;
  /** This frame's tracker state refers to this frame's edge (`solidCrossOnEdge`). */
  let solidCrossOnRoad = false;
  /** This frame is on another road, read against the road a turn-round in
   *  progress, begun where the axis is broken, began on (`solidCrossTurnHoldsRoad`, R7-1). */
  let solidCrossHeld: SolidCrossHold = null;
  if (solidCrossEa !== undefined) {
    // R6-1 — FIRST, PUT THE TRACKER ON THE EDGE THE CAR IS ON: the same road
    // handed to its next edge carries everything over; a road that sees the
    // car for the first time takes the half it is on as the reference. Done
    // before the plain detector below is asked anything, so that detector
    // never reads a reference that belongs to another edge — or none at all.
    if (solidCrossBank !== null && solidCrossEa.deg !== null && solidCrossEa.edgeId !== null) {
      solidCrossHeld = solidCrossTurnHoldsRoad(
        s.solidCrossTurn,
        solidCrossEa.edgeId,
        tick.headingDeg - solidCrossEa.deg,
        tick.headingDeg,
      );
    }
    if (
      solidCrossHeld === null &&
      solidCrossBank !== null &&
      solidCrossEa.deg !== null &&
      solidCrossEa.edgeId !== null
    ) {
      const onEdge = solidCrossOnEdge(
        s.solidCrossTurn,
        solidCrossEa.edgeId,
        tick.headingDeg - solidCrossEa.deg,
        solidCrossBank,
        solidCrossMeasured,
      );
      if (onEdge !== null) {
        s.solidCrossTurn = onEdge;
        solidCrossOnRoad = true;
      }
    }
    const ref = s.solidCrossTurn;
    if (solidCrossMeasured && solidCrossHeld === null) {
      onReferenceBank = ref.bank === solidCrossBank;
      if (solidCrossEa.axisClearM !== undefined) bodyAcross = solidCrossEa.axisClearM >= 0;
    } else {
      onReferenceBank = ref.bank !== 0 && ref.prevBank === ref.bank;
    }
  }
  const solidCrossCond =
    tick.solidCenterLine === true &&
    tick.oneway === false &&
    tick.opposingBank === true &&
    moving &&
    forwardGear &&
    !onReferenceBank;
  const solidCrossBackInLane =
    tick.opposingBank !== true && tick.laneOffsetM <= cfg.laneKeepMaxOffsetM;
  /** The plain detector's bill in an ARMED lesson, pushed below once the
   *  tracker has stepped (its reason needs this frame's travel direction). */
  let solidCrossPlainBill: "crossing" | "u-turn" | null = null;
  if (stepEpisode(s.solidCross, solidCrossCond, solidCrossBackInLane, t, cfg.solidLineCrossSustainSec)) {
    // THE PLAIN CROSSING, UNDER THE CROSSING'S OWN TITLE — on every lesson, the
    // armed one included. At this frame the nose has opposed its bank for the
    // sustain and that is ALL that is known: on a U-turn begun beside the axis
    // the car is 34° round here, and the student may still steer back.
    // «Пресичане на непрекъсната осева линия» is true of every car that gets
    // this far; «обратен завой» is not, yet. If the turn completes, THIS bill
    // is named below.
    //
    // (Where the lesson armed the reversal and this excursion ALREADY carries a
    // bill — the position-based one below — this is the same act seen a second
    // way, and one act is one bill. And there the reason is the one the body
    // and the travel direction have earned on this frame — `solidCrossBill`.)
    if (!cfg.solidCrossUTurnEnabled) {
      events.push(makeViolation("CROSSED_SOLID_LINE", t));
    } else if (
      s.solidCrossTurn.billedAt === null &&
      !(
        s.solidCrossTurn.crossedSolidAt !== null &&
        s.solidCrossTurn.farSince !== null &&
        t - s.solidCrossTurn.farSince < cfg.solidLineCrossSustainSec
      )
    ) {
      // (…and not while the tracker holds a solid crossing whose OWN sustain is
      // still running — R6-2: a crossing that begins where a U-turn's swing
      // ends is billed the sustain after THAT, by position, not the sustain
      // after the nose first opposed this bank during the swing.)
      //
      // …unless a turn-round ALREADY names this crossing (round 5: the centre
      // went over during the turn-round's own swing, the nose already round —
      // and round far enough to oppose the bank it arrived on, which is what
      // this detector fires on). Then this bill is the U-turn's.
      const billed: SolidCrossTurnState = { ...s.solidCrossTurn, billedAt: t, billLive: true };
      solidCrossPlainBill = billed.named ? "u-turn" : "crossing";
      if (billed.named) solidCrossActBilled(billed, t);
      s.solidCrossTurn = billed;
    }
  }
  // THE REVERSAL ACROSS THE SOLID AXIS — one frame of the road-referenced
  // tracker, and ONLY where the lesson armed it (`solidCrossUTurnEnabled`; the
  // block of that name above `stepEpisode` has the whole rule). With the key
  // off — every lesson but sc-mv-uturn-ban — nothing below runs,
  // `tick.edgeAlignment` is not read and the state is never written.
  //
  // THREE KINDS OF FRAME (round 5, R5-3; round 6, R6-1 — «this road» is the
  // ROAD, whichever of its edges the car is on):
  //  · on the carriageway of a two-way road, measured — the whole tracker;
  //  · past the kerb but still fixed to the SAME road — the heading half only
  //    (`stepSolidCrossTurnOffRoad`): the bank and the crossing hold, and a
  //    turn-round made out there begins, is placed and is confirmed out there;
  //  · no fix on this road — the bank, the crossing and a place already
  //    measured hold, the nose is followed against the road's last bearing
  //    (`stepSolidCrossTurnUnseen`), and nothing is confirmed until the road
  //    sees the car again.
  if (cfg.solidCrossUTurnEnabled) {
    const ea = tick.edgeAlignment;
    if (ea === undefined) {
      // A tick that did not come from the world runtime carries no road record
      // at all, so the tracker never sees the car come home. The plain
      // detector's own excursion is then all there is: where IT re-arms, the
      // bill this excursion carried is over too — otherwise the first bill of
      // such a drive would silence every later one.
      if (solidCrossBackInLane && s.solidCrossTurn.billedAt !== null) {
        s.solidCrossTurn = { ...s.solidCrossTurn, billedAt: null, billLive: false };
      }
    } else {
      let turn: SolidCrossTurnStep | null = null;
      // Metres since the previous frame — the swing's yardstick.
      const stepM = (speed / 3.6) * Math.min(dt, 2);
      const held = s.solidCrossTurn;
      if (solidCrossHeld !== null && held.bearingDeg !== null && held.bank !== 0) {
        // R7-1 — another road has the car, mid turn-round on this one (begun
        // where the axis is broken): the heading half against this road's
        // bearing, the bank held, no station. R7-2 — …or on the approach to
        // one: the same, at the broken station this road last had.
        turn = stepSolidCrossTurnOffRoad(
          held,
          {
            bank: held.bank,
            deg: solidCrossDeltaDeg(held.bearingDeg, tick.headingDeg),
            bearingDeg: held.bearingDeg,
            solidHere: solidCrossHeld === "approach" ? held.lastPlace : null,
            stepM,
            t,
          },
          cfg.solidLineCrossSustainSec,
        );
      } else if (solidCrossOnRoad && solidCrossBank !== null && ea.deg !== null && ea.edgeId !== null) {
        const frame = {
          bank: solidCrossBank,
          deg: ea.deg,
          bearingDeg: tick.headingDeg - ea.deg,
          solidHere: tick.solidCenterLine === true,
          stepM,
          t,
        };
        turn = solidCrossMeasured
          ? stepSolidCrossTurn(
              s.solidCrossTurn,
              { ...frame, edgeId: ea.edgeId, forwardGear, inLane: solidCrossBackInLane },
              cfg.solidLineCrossSustainSec,
            )
          : stepSolidCrossTurnOffRoad(s.solidCrossTurn, frame, cfg.solidLineCrossSustainSec);
      } else {
        s.solidCrossTurn = stepSolidCrossTurnUnseen(s.solidCrossTurn, { headingDeg: tick.headingDeg, stepM, t });
      }
      if (turn !== null) {
        s.solidCrossTurn = turn.state;
        if (turn.bill === "crossing") {
          // THE CROSSING THE PLAIN DETECTOR COULD NOT SEE — the centre across a
          // solid axis for the sustain, whichever way the nose points and however
          // slowly it got there. The crossing's own title: what was crossed is all
          // that is known yet; how far across the body is, and whether the half
          // it has entered runs against it, choose the reason.
          events.push(
            solidCrossBill(t, bodyAcross, solidCrossOwnWay(turn.state, solidCrossMeasured ? solidCrossBank : null)),
          );
        } else if (turn.bill === "u-turn") {
          // A TURN-ROUND ALREADY NAMES THIS CROSSING and nothing had billed it:
          // the centre went over during the turn-round's own swing with the nose
          // already round, or in reverse gear. The bill carries the act.
          events.push(makeViolation("CROSSED_SOLID_LINE", t, { detail: SOLID_CROSS_ACT_UTURN }));
        } else if (turn.names !== null) {
          // THE TURN-ROUND IS CONFIRMED and the crossing's bill is already out:
          // it is NAMED (`ActAmendment`) — same code, time, class and points; the
          // act's title, reason and corrective.
          (amendments ??= []).push({
            code: "CROSSED_SOLID_LINE",
            billT: turn.names,
            detail: SOLID_CROSS_ACT_UTURN,
            t,
          });
        }
      }
    }
    // …and the plain detector's bill of this frame, on the reason this frame
    // has earned now that the tracker has read it (R6-3).
    if (solidCrossPlainBill === "u-turn") {
      events.push(makeViolation("CROSSED_SOLID_LINE", t, { detail: SOLID_CROSS_ACT_UTURN }));
    } else if (solidCrossPlainBill === "crossing") {
      events.push(
        solidCrossBill(t, bodyAcross, solidCrossOwnWay(s.solidCrossTurn, solidCrossMeasured ? solidCrossBank : null)),
      );
    }
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

  // Speed for the conditions: too fast for rain / fog / snow / night.
  // Factors compose by MIN — the single most restrictive condition governs;
  // the product would double-bill a rainy night (A12). A factor of 1 means
  // the condition does not reduce the prudent speed at all. Shipped default
  // ordering: snow 0.5 < fog 0.6 < rain 0.85 ≤ night 1 — a snowy fog grades
  // once at the snow envelope, exactly like a foggy rain grades at fog's.
  const raining = tick.rain === true;
  const foggy = tick.fog === true;
  const snowy = tick.snow === true;
  // ONE DERIVATION (2026-09-25, round 2): the envelope is also printed on the
  // task and conditions cards (`lessons/engine.ts withSpeedMeasurement`, C4) and
  // re-checked by the finish-time settlement, so it lives in one exported
  // function and this line reads it. Arithmetic identical to the inline MIN it
  // replaces: null ⇔ factor 1 ⇔ the limit itself.
  const envelope = conditionsSpeedEnvelope(tick, cfg);
  const conditionsReduced = envelope !== null;
  const conditionLimit = envelope?.limitKmh ?? limit;
  /*
   * THE WINTER RULE USED TO SWITCH ITSELF OFF AT THE EXACT SPEED IT IS ABOUT
   * (2026-08-27, `sc-ac-snow:6ed473c3`). This condition carried a fourth
   * conjunct — `&& speed <= bands.gradedAbove` — under the sentence „(Above the
   * limit is regular speeding, handled above.)". It did not hold, and the
   * arithmetic is the whole argument:
   *
   *   posted 50 · snow 0.5  ⇒  conditionLimit  25   ← what the lesson teaches
   *   posted 50 · grace 5   ⇒  bands.gradedAbove 55  ← where the old gate closed
   *
   * so every speed from 55 upwards — 2.2× the winter envelope and beyond —
   * left `tooFastForConditions` FALSE. The one band in which a snow lesson
   * cannot mark a snow fault was the fast half of it.
   *
   * MEASURED, NOT REASONED. `.audit-frames/w11/frames/sc-ac-snow__pc-wrong`:
   * top speed 59 км/ч against an on-screen «дръж под 25 км/ч» and instruction
   * «зимният таван тук е 25», and its `MISTAKES (4)` are колан −3, «Движение в
   * снеговалеж без светлини» −1 and two contacts. Not one speed rule, on the
   * lesson whose entire subject is winter speed. The same gate silences fog
   * (envelope 30) and rain (42.5) the same way, above 55.
   *
   * AND THE GATE COULD NOT EVEN DELEGATE. Its excuse was that SPEEDING_* bills
   * instead — but the три-lesson teach spends SPEEDING_OVER_LIMIT's first bill
   * (`SPEED_REGRADE_SEC`), and even when it lands it prices +9 over a posted 50
   * as ONE второстепенна point while the student is at 2.4× the envelope чл. 20,
   * ал. 2 demands. „Handled above" was handled as the wrong fault.
   *
   * TWO LAWS, TWO BILLS — the precedent is nine lines down in this same file.
   * SPEED_TOO_FAST_FOR_CURVE is „DELIBERATELY NOT capped at the graced posted
   * limit the way the conditions code is … where the driver is ALSO over the
   * limit, the SPEEDING_* codes bill their own distinct fault — two laws, two
   * lessons". чл. 21 (посоченото ограничение) and чл. 20, ал. 2 (да спреш пред
   * всяко предвидимо препятствие) are different duties with different lessons,
   * and this line now grades them the way the curve line already did.
   *
   * WHAT IT CANNOT DO IS RUN AWAY. The code is второстепенна (−1), `stepEpisode`
   * bills once per episode and the re-grade adds exactly one more — so the most
   * this can add to any drive is 2 наказателни точки, and only to a drive that
   * was over the prudent envelope for `conditionsSpeedSustainSec` in weather the
   * world itself declared. Every innocent case in `__tests__/conditions.test.ts`
   * (22 in snow, 25 in fog, 28 in a snowy foggy rain, 40 in rain, and every dry
   * tick) is under both the envelope AND the old cap, so it is untouched: this
   * moves nothing except the band the lessons are taught in.
   *
   * The road half cannot double-charge either: this code's `ROAD_CONSEQUENCES`
   * row is `kind: "conditional"` with no ungated money of its own
   * („Несъобразената скорост няма собствена глоба в ЗДвП"), so a drive that is
   * also speeding still prints exactly one price — the speeding ladder's.
   */
  const tooFastForConditions = conditionsReduced && moving && speed > conditionLimit;
  const conditionsSpeedReset = !conditionsReduced || speed <= conditionLimit;
  if (
    stepEpisode(
      s.conditionsSpeed,
      tooFastForConditions,
      conditionsSpeedReset,
      t,
      cfg.conditionsSpeedSustainSec,
    )
  ) {
    events.push(makeViolation("SPEED_TOO_FAST_FOR_CONDITIONS", t));
  }
  // …AND THE RE-GRADE, because the bill above is the only one this episode will
  // EVER produce (`stepEpisode` sets `emitted` once and never re-arms without a
  // correction), so the teach-first free lesson is the whole consequence of
  // driving an entire wet/foggy/snowy/night section too fast for it. Measured
  // on `sc-ac-truck-spray/pc-wrong`: 128 км/ч in rain against a conditions
  // envelope of 119 (140 × 0.85), filed under «Учебни моменти (не влизат в
  // точките)» and priced at zero, while the 17 км/ч leg of the same lesson got
  // the identical card. Same condition, same reset, a sustain longer by
  // SPEED_REGRADE_SEC, and `regrade: true` so it is dropped wherever the code
  // was already charged — see SPEED_REGRADE_SEC.
  if (
    stepEpisode(
      s.conditionsSpeedRegrade,
      tooFastForConditions,
      conditionsSpeedReset,
      t,
      cfg.conditionsSpeedSustainSec + SPEED_REGRADE_SEC,
    )
  ) {
    events.push({ ...makeViolation("SPEED_TOO_FAST_FOR_CONDITIONS", t), regrade: true });
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
  //  - THE ASPHALT GATES THE ARM, NOT THE FIRE (`sc-sp-curve:45e7e4fb`,
  //    critical — „a Несъобразена скорост в завой card fires there — the
  //    engine is scoring a corner the car is not on"). The withdrawn-gate note
  //    at the top of reduceTick refuses a BLANKET `edgeId !== null` conjunct
  //    for two reasons, and both are about the FIRE: running wide onto the
  //    verge is this fault's own result, so a blanket gate acquits the fault at
  //    the instant it produces it; and because leaving the span is also the
  //    reset, an oscillating driver could clear the bend unbilled. Neither
  //    reason touches the ARM. So the conjunct is one-sided:
  //
  //      an episode already open keeps running off the asphalt and still fires
  //      there;  a FRESH episode may not begin on a tick the runtime says is
  //      past the kerb.
  //
  //    That is exactly what the photographed drive needs. `.audit-frames/
  //    sweep161/sc-sp-curve/mobile-wrong` is two minutes of open field — the
  //    car left the road around t = 24 s and the card lands again at t = 129 s,
  //    which can only be a re-arm: the lane fix survives the kerb out to the
  //    locator's 30 m lock ring, so a car circling a field beside a bend keeps
  //    re-entering the span by ARCLENGTH and re-earning a 1,5 s sustain it
  //    serves entirely off the road. The bend that bill names is not under him,
  //    and a card a seventeen-year-old can refute out of his own windscreen
  //    teaches him to stop reading them (THEO-4, doc 64) — the same argument
  //    `runtime/worldRuntime.ts` already accepted for `wrongWay`, and the same
  //    boundary the act draws: § 6, т. 4 defines „граница на платното за
  //    движение" as the line separating платното from банкет/тротоар (ЗДвП,
  //    `content/law/acts/zdvp.json` — retrieved, ADR-002). Past it there is no
  //    завой to enter too fast.
  //    NOT AN AMNESTY: the departure itself is charged by OFF_CARRIAGEWAY
  //    (чл. 15, ал. 1) in the block below, on the very same `edgeId === null`.
  //    POLARITY: `edgeId` is `string | null | undefined` and `undefined` means
  //    „this tick source cannot answer" (replays, fixtures, the dev rigs), so
  //    only an explicit `null` may block an arm — written `!== null`, never
  //    `Boolean(edgeId)`, or every hand-built tick in the suite becomes a
  //    driver in a field.
  const advisoryKmh = tick.curveAdvisoryKmh;
  // Read BEFORE `stepEpisode` mutates it: this is last frame's onset, i.e.
  // „was this episode already open when the car was still on a road".
  const curveEpisodeOpen = s.curveSpeed.activeSince !== null;
  const curveOverspeed =
    advisoryKmh !== undefined &&
    moving &&
    forwardGear &&
    speed > advisoryKmh + cfg.curveSpeedGraceKmh &&
    (curveEpisodeOpen || tick.edgeId !== null);
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

  /*
   * THE TASK'S OWN CEILING — founder ruling 2026-09-25 (register item 17, answered „Bill it"). `sc-ac-truck-spray`
   * paints «задачата иска ≤80» beside a 140 disc, the banner states it, the objective refuses above it — and until this
   * block nothing on the изпитен лист could see it. MEASURED on the tree before it
   * (`lessons/__tests__/task-cap-ceiling.test.ts`): 110–115 км/ч through that ≤80 task in the rain books ZERO violations,
   * mints «Чисто и спокойно каране» three times over the breach, and the debrief closes on «карането беше чисто по
   * изпитния лист».
   *
   * THE NUMBERS. `SimTick.taskSpeedCap` is stamped ONLY by `lessons/engine.ts` (see the type), only once the student has
   * gone THROUGH the task's mark over it (`approachCap === "blown"`), and only over the stretch that cap governs (the mark
   * to the end of the feature its task names — `lessons/finish.ts taskCapStretch`; founder ruling 2, «only the named
   * stretch»). It bills above `taskCapBillLineKmh(shownKmh)` — the number the glass printed PLUS the tolerance a posted
   * limit gets (founder ruling 2026-10-03 «LIKE A SPEED SIGN»: «≤36» bills above 39,6), on every rung; the objective's
   * gate and its slack (the rung's ladder grace) credit the objective and word the coach's copy, and bill nothing. A
   * return to `shownKmh` is the correction that ends the episode. Between the two the episode neither accrues nor ends:
   * the SPEEDING_OVER_LIMIT shape.
   *
   * THE CLOCK IS THE CONDITIONS DUTY'S, because the duty is (ЗДвП чл. 20, ал. 2, the lawRef the ruling cites): the
   * sustain is `conditionsSpeedSustainSec` and the continuing breach re-grades on `SPEED_REGRADE_SEC` — two bills per
   * episode, the second `regrade`-marked so it only ever reaches the charge the teach-first free lesson consumed (founder
   * ruling 16, 2026-09-21: the first-fault grace is KEPT). The episode accrues (`SPEEDING_SUSTAIN_ACCRUES`) and re-arms
   * only on a correction held `speedingRearmSec` (M-16).
   *
   * WHAT IT CANNOT DO: bill a lesson that never stamped a cap (every recorder, replay and exam rung), bill a stopped car
   * (`moving`), or bill a leg held at or under the glass figure plus the sign's tolerance.
   *
   * ROUND 14 — THE CAP LEDGER. FOUNDER RULING 2026-10-03, verbatim: «Cap adds, never removes. The task cap is an extra
   * rule on top. Its bill stands on its own; the bend/weather bills are charged exactly as they would be in a lesson with
   * no cap. Blowing the cap can only add, never lower the score, and order never matters.»
   *
   * Rounds 2–13 folded this code, the weather's and the bend's into ONE „kin ledger" act with one name and one charge,
   * and — inside a sign-bound arrival's M-16 act — the SPEEDING_* bills too: a cap bill could absorb a weather or bend
   * bill, or be absorbed by one, or by a speeding bill, and which happened depended on the order the cards landed in.
   * Measured on round 13 (the round-13 verifier's long act): posted 50, a ≤50 mark passed at 56,2, then 53 through three
   * bends in the rain — 7 points with no cap, 1 with the mark blown. The ruling supersedes every such reading. What is
   * left is two ledgers:
   *  · THE NO-CAP LEDGER — the weather, bend and speeding detectors above, pushed exactly as they ship. Nothing below
   *    writes to their episodes or reads their bills: the same frames with the cap fields removed bill them identically
   *    (`rules/__tests__/taskCapTwoLedgers.ts` L1, censused over every generated family and through every committed
   *    capped lesson).
   *  · THE CAP LEDGER — this block. It reads the tick (the stamp, the arrival, the speed, the posted sign) and its own
   *    state, never a weather, bend or speeding episode or bill, and it bills TASK_SPEED_CAP_EXCEEDED alone, with the
   *    cap's OWN first-fault grace (`scenarios/mapping.ts teachTopicForCode` — ruling 16 applied to the cap's own fault,
   *    so a cap teach spends no weather/bend grace and a weather teach spends none of the cap's).
   * The lesson's total is the sum of the two, so blowing a cap can only add, in any order.
   */
  const taskCap = tick.taskSpeedCap;
  /*
   * ROUND 3 (verifier R2) — A NEW LATCH IS A NEW ACT; A GAP IN THE SAME LATCH IS NOT. The lesson keeps one latch per
   * blow (`lessons/engine.ts stepTaskCapLatch`) and names it on the stamp (`blownAtSec`):
   *  · a stamp whose latch the reducer has not seen before is a NEW blow — the next objective's mark, or the same mark
   *    blown again on a fresh approach — and it restarts the task's two episodes and its act at once;
   *  · a stamp that merely goes missing is a reset like any other, and ends a billed episode only after it has been HELD
   *    `speedingRearmSec` — the same hysteresis a dip back to the shown figure has (M-16).
   * ROUND 5 — A LATCH ALSO NAMES ITSELF BY ITS ARRIVAL (`SimTick.taskCapArrival`, founder ruling 2026-09-26 «Bill the
   * arrival»), so the blow is a new act here whether or not a stamp follows it. `taskLatchFresh` is read again at the
   * praise gate below (R4).
   */
  const taskArrival = tick.taskCapArrival;
  const taskLatchName = taskCap?.blownAtSec ?? taskArrival?.blownAtSec;
  const taskLatchFresh = taskLatchName !== undefined && taskLatchName !== s.taskCapBlownAtSeen;
  if (taskLatchFresh) {
    if (s.taskCapBlownAtSeen !== null) {
      s.taskCap = { ...IDLE_EPISODE };
      s.taskCapRegrade = { ...IDLE_EPISODE };
      s.taskAct = { ...IDLE_TASK_ACT };
    }
    s.taskCapBlownAtSeen = taskLatchName;
    // ROUND 6: a new blow is a new act — the old latch's kept act is never resumed by it.
    s.taskArrival = null;
  }
  const overTaskCap = taskCap !== undefined && moving && speed > taskCapBillLineKmh(taskCap.shownKmh, cfg);
  /*
   * ROUND 6 — THE ARRIVAL'S ACT, KEPT WITH ITS LATCH (founder ruling 4 in the integrator's reading: the arrival «is one
   * act with any sustained over-cap stretch that follows on the named feature»). The act ends by the plain rule — the
   * task's episode no longer live (below) — and, ending while the latch whose arrival it billed is still the current
   * one, it is KEPT as it stood (`taskArrival.kept`): the SAME latch taking the car over its bill line again RESUMES it,
   * its first bill and its one charge with it. So the student cannot make a later stretch on the same feature a new act
   * (a second card, a second charge) by hovering in the grace band, correcting, or leaving the graded road between
   * the blow and the stretch. A NEW latch drops it (above).
   */
  const heldArrival = s.taskArrival;
  if (heldArrival !== null && heldArrival.kept !== null && overTaskCap && taskCap !== undefined && taskCap.blownAtSec === heldArrival.latch) {
    if (!s.taskAct.named) s.taskAct = { ...heldArrival.kept };
    s.taskArrival = { latch: heldArrival.latch, kept: null };
  }
  /*
   * ROUND 5 — THE ARRIVAL IS THE OFFENCE (founder ruling 2026-09-26, «Bill the arrival», ruling 4 of register item 17):
   * «passing the mark over the cap IS the offence. It is billed as ONE EVENT at the blow: a teach card the first time
   * (per-topic grace), a point on a repeat.» So: ONE first bill of this code, on the frame the lesson latches the blow
   * (the arrival rides only that frame), once per latch, and only above the bill line — `taskCapBillLineKmh(shownKmh)`
   * (ruling 2026-10-03 «LIKE A SPEED SIGN»), re-checked here against the measured arrival so no stamp can bill a speed
   * that line does not refuse. The arrival is the speed at which the car CROSSED the mark (`lessons/engine.ts`
   * `stepTaskCapLatch`, interpolated between the two frames that straddle it).
   */
  const arrivalOver =
    taskLatchFresh &&
    taskArrival !== undefined &&
    taskArrival.blownAtSec === taskLatchName &&
    Math.abs(taskArrival.arrivalKmh) > taskCapBillLineKmh(taskArrival.shownKmh, cfg);
  /*
   * ROUND 7 / 8 / 12 — THE SIGN-BOUND ARRIVAL, inside the cap ledger (round 14). A mark whose cap the glass showed AT or
   * ABOVE the sign on the blow frame (`signBound`) is blown while the car is over the sign too. Rounds 7–13 let its one
   * bill WAIT so that a SPEEDING_*, weather or bend bill in the same act could absorb it; under the ruling the cap's
   * bill stands on its own, so nothing of another code absorbs it any more. What stays is the cap ledger's own act —
   * from the blow to the held correction (`taskSignAct`) — and the wait's three ends:
   *  · ROUND 12, THE STAMP RULE — the first frame one of its latches STAMPS the car (the cap then binds under the sign on
   *    its named stretch): the arrival is billed there, quoting its blow, exactly as its graded twin is billed at its
   *    blow, and the stretch that follows is that act carrying on, with its one re-grade;
   *  · ROUND 8, THE HELD CORRECTION — the frame the car has been back at or under the sign for `speedingRearmSec` (the
   *    product's M-16 definition of a correction, `stepSustainedEpisode`'s), read off the cap ledger's OWN record of it
   *    (`taskSignResetSince`, kept by the same rule `resetSince` is kept by), never off a speeding episode;
   *  · the ending of a drive that ends while it waits (`settlePendingTaskArrival`).
   * Inside one such act (round 7): a second sign-bound blow while the arrival waits waits with it — one bill; a blow
   * after the act has its bill adds none, and its latch is that act's (`taskSignLatches`: its stretch carries the act
   * on until the whole act has ended); any other task first bill while the arrival waits — a graded mark's arrival —
   * takes the act's one bill. No praise accrues while the act runs (round 8, GATE 1).
   */
  const signBound = arrivalOver && taskArrival !== undefined && taskArrival.shownKmh >= tick.maxSpeedKmh;
  if (speedReset) {
    if (s.taskSignResetSince === null) s.taskSignResetSince = t;
  } else {
    s.taskSignResetSince = null;
  }
  const signCorrectionHeld = speedReset && s.taskSignResetSince !== null && t - s.taskSignResetSince >= cfg.speedingRearmSec;
  if (signBound && taskArrival !== undefined && taskLatchName !== undefined) {
    const blow: SignBoundArrival = { arrivalKmh: Math.abs(taskArrival.arrivalKmh), shownKmh: taskArrival.shownKmh, postedKmh: tick.maxSpeedKmh };
    const act = s.taskSignAct ?? { billed: false };
    if (s.taskArrivalPending !== null) {
      s.taskArrivalPending = { ...s.taskArrivalPending, laterLatches: [...s.taskArrivalPending.laterLatches, taskLatchName] };
    } else if (act.billed) {
      s.taskSignLatches = [...(s.taskSignLatches ?? []), taskLatchName];
    } else {
      s.taskArrivalPending = { latch: taskLatchName, arrival: blow, laterLatches: [] };
    }
    s.taskSignAct = act;
  }
  // THE WAIT'S END, read on every frame — a blow frame included (a correction already held there bills at once).
  let signArrival: { latch: number; arrival: SignBoundArrival } | null = null;
  if (s.taskArrivalPending !== null) {
    const waiting = s.taskArrivalPending;
    const waitingLatches = [waiting.latch, ...waiting.laterLatches];
    if (taskCap !== undefined && waitingLatches.includes(taskCap.blownAtSec)) {
      signArrival = { latch: taskCap.blownAtSec, arrival: waiting.arrival };
      s.taskArrivalPending = null;
    } else if (signCorrectionHeld) {
      signArrival = { latch: waiting.latch, arrival: waiting.arrival };
      s.taskArrivalPending = null;
    }
  }
  // …and the sign-bound act ends on that same held correction.
  if (s.taskSignAct !== null && signCorrectionHeld) s.taskSignAct = null;
  const arrivalFirst = (arrivalOver && !signBound) || signArrival !== null;
  const arrivalLatch = signArrival !== null ? signArrival.latch : taskLatchName;
  const taskCapReset = taskCap === undefined || speed <= taskCap.shownKmh;
  // THE M-16 HYSTERESIS, borrowed with the band shape: a dip back to the shown figure only ENDS the episode once it has
  // been held `speedingRearmSec` — otherwise a driver hovering one km/h either side of an L3 cap (where gate and figure
  // are the same number) opens a fresh episode on every crossing and is billed as a repeat for one continuing breach.
  const taskCapRearmSec = cfg.speedingRearmSec;
  const taskFirst = stepSustainedEpisode(
    s.taskCap,
    overTaskCap,
    taskCapReset,
    t,
    cfg.conditionsSpeedSustainSec,
    taskCapRearmSec,
    0,
    0,
    SPEEDING_SUSTAIN_ACCRUES,
  );
  const taskCapCorrectionHeld =
    taskCapReset &&
    s.taskCap.resetSince !== null &&
    t - s.taskCap.resetSince >= taskCapRearmSec;
  const taskRegrade = stepEpisode(
    s.taskCapRegrade,
    overTaskCap,
    taskCapCorrectionHeld,
    t,
    cfg.conditionsSpeedSustainSec + SPEED_REGRADE_SEC,
    SPEEDING_SUSTAIN_ACCRUES,
  );
  /*
   * THE CAP LEDGER'S ACT — ONE FIRST BILL, ONE CHARGE (founder ruling 4, in the integrator's reading). The act is named by
   * its first bill — the arrival, or (where no arrival named it) the stretch's first sustained bill — and that bill is
   * the only one put before the student: every later first bill inside it is the act carrying on, emitted `absorbedBy`
   * the cap itself and dropped by the lesson. It carries at most ONE re-grade (`charged`), the second bill of the
   * conditions duty's cadence, so it only ever reaches the charge the teach-first free lesson consumed (ruling 16).
   * A latch blown after a sign-bound act already had its bill (round 7's later blow, `taskSignLatches`) names nothing:
   * its stretch is that act carrying on — absorbed, and charged only through an act of its latch that is open.
   */
  const signLatchActs = s.taskSignLatches;
  const carriesSignAct =
    !arrivalFirst && signLatchActs !== null && s.taskCapBlownAtSeen !== null && signLatchActs.includes(s.taskCapBlownAtSeen);
  const namedBefore = s.taskAct.named;
  if (!namedBefore && ((taskFirst && !carriesSignAct) || arrivalFirst)) s.taskAct = { ...s.taskAct, named: true };
  if (taskFirst || arrivalFirst) {
    const blowMark = signArrival !== null ? { signBoundArrival: signArrival.arrival } : {};
    if (carriesSignAct || namedBefore) {
      events.push({ ...makeViolation("TASK_SPEED_CAP_EXCEEDED", t), ...blowMark, absorbedBy: "TASK_SPEED_CAP_EXCEEDED" });
    } else {
      events.push({ ...makeViolation("TASK_SPEED_CAP_EXCEEDED", t), ...blowMark });
    }
    // ROUND 6: the arrival is in this act now, and the act lives with its latch.
    if (arrivalFirst && arrivalLatch !== undefined) s.taskArrival = { latch: arrivalLatch, kept: null };
    // ROUND 7: a task first bill inside the act a sign-bound arrival still waits in is that act's one bill.
    s.taskArrivalPending = null;
    if (s.taskSignAct !== null) s.taskSignAct = { billed: true };
  }
  if (taskRegrade && (!carriesSignAct || s.taskAct.named) && !s.taskAct.charged) {
    events.push({ ...makeViolation("TASK_SPEED_CAP_EXCEEDED", t), regrade: true });
    s.taskAct = { ...s.taskAct, charged: true };
  }
  // THE ACT ENDS when the task's episode is no longer live (corrected and re-armed, nothing banked); the arrival's act,
  // its latch still current, is KEPT (round 6, above).
  const taskActOver = s.taskCap.activeSince === null && !s.taskCap.emitted && s.taskCap.qualifiedSec === 0;
  if (taskActOver) {
    if (s.taskArrival !== null && s.taskArrival.kept === null && s.taskAct.named) s.taskArrival = { latch: s.taskArrival.latch, kept: { ...s.taskAct } };
    s.taskAct = { ...IDLE_TASK_ACT };
  }
  // ROUND 10: the latches a billed sign-bound act took on are its act until the WHOLE act has ended — the sign-bound
  // act (held correction) and the task's own; a later stretch of one of them is then a new act — and the kept act of
  // any of them goes with it.
  if (s.taskSignLatches !== null && s.taskSignAct === null && taskActOver) {
    const ended = s.taskSignLatches;
    if (s.taskArrival !== null && ended.includes(s.taskArrival.latch)) s.taskArrival = null;
    s.taskSignLatches = null;
  }

  // Lights in rain (daytime — night is covered by HEADLIGHTS_OFF_AT_NIGHT).
  const rainNoLights = lampDuty === "rain" && tick.headlights === "off" && moving;
  if (
    stepSustainedEpisode(
      s.rainLights,
      rainNoLights,
      !raining || tick.headlights !== "off",
      t,
      cfg.rainLightsSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(standingDutyBill(s.rainLights, makeViolation("HEADLIGHTS_OFF_IN_RAIN", t)));
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
    stepSustainedEpisode(
      s.fogLights,
      fogNoFogLights,
      !foggy || tick.fogLightsOn === true,
      t,
      cfg.fogLightsSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(standingDutyBill(s.fogLights, makeViolation("FOG_LIGHTS_OFF_IN_FOG", t)));
  }

  // Lights in SNOWFALL (O28, чл. 70, ал. 1 — the third arm of the low-beam
  // duty; see `catalog.ts SNOW_LIGHTS_ACT_COPY` for the retrieved article and
  // why it reuses the rain row's code rather than adding a second one for the
  // same rule).
  //
  // WHAT WAS MEASURED, 2026-08-19. The rain arm above reads `raining`, the fog
  // arm reads `tick.fog`, and NEITHER reads `tick.snow` — so `sc-ac-snow`, the
  // only lesson in the catalogue that compiles `weather: "snow"` (and compile.ts
  // makes the weathers EXCLUSIVE: rain/fog/snow are three separate booleans, so
  // tick.rain and tick.fog are both false there), had no lamp channel in any
  // form. Not a dead detector nothing armed — `grep -rn SNOW rules/` found no
  // episode, no code and no config: the channel did not exist. Its instruction 1
  // reads «Включи късите светлини и потегли меко» — an order the grader could
  // not check — and `__tests__/conditions.test.ts` carried an assertion titled
  // „no lamp duty on snow" that certified the hole as intended. Round 5's
  // objective-side lamp gate made the order refusable; this makes it teachable,
  // because a refused gate with no card is the bare verdict THEO-4 forbids.
  //
  // THE THREE EXCLUSIONS, each answering a false-positive rather than tidiness.
  // The first two are now spelled `lampDuty === "snow"` (O35 moved the
  // precedence into `lowBeamDuty` so the HUD could read the same one); they are
  // the same two conditions, unchanged in meaning:
  //  - `!tick.isNight` — verbatim the rain arm's own reason: night is covered by
  //    HEADLIGHTS_OFF_AT_NIGHT (основна), and sc-ac-snow's L5 rung IS a night
  //    rung (`l5Night()`), so without this the winter lesson's hardest level
  //    would bill one dark car twice.
  //  - `!raining` — a rainy snowfall is one omission of one switch. The rain arm
  //    fires there and its copy is true, so this arm stays silent: the same
  //    one-bill-per-act discipline the conditions factor gets from MIN.
  //  - `moving` + the shared `rainLightsSustainSec` grace — a car handed over
  //    dark (`scene/cabin.ts initialHeadlightsFor` returns "low" for
  //    night/rain/fog and NOT for snow, so sc-ac-snow IS handed over dark) must
  //    have the same seconds to reach L that the rain drill gets. No new config
  //    knob: one reduced-visibility duty, one grace.
  const snowNoLights = lampDuty === "snow" && tick.headlights === "off" && moving;
  if (
    stepSustainedEpisode(
      s.snowLights,
      snowNoLights,
      !snowy || tick.headlights !== "off",
      t,
      cfg.rainLightsSustainSec,
      0,
      STANDING_DUTY_REGRADE_SEC,
      STANDING_DUTY_MAX_BILLS,
    )
  ) {
    events.push(
      standingDutyBill(
        s.snowLights,
        // The condition travels as `detail`, not as a copy override: the
        // override does not cross `wire.ts` and the server would rebuild the
        // «в дъжд» title over a snow frame (ADR-009 lane R).
        makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, { detail: HEADLIGHTS_CONDITION_SNOW }),
      ),
    );
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
  //
  // …AND THE ENTRY IT IS CHARGED FOR (WRONG_WAY_ENTRY_TRAVEL_M — the frame, the
  // verb, the arithmetic and the measured grid are all in that block). The
  // heading opens the run; the PATH is what turns it into „навлезе".
  //
  // THE LEDGER IS THE RUN, AND ITS TWO GATES ARE PARALLEL. `wrongWayEntry`
  // accrues the metres and the seconds of the frames whose heading is wrong —
  // across OSM way boundaries, because a way boundary is a cartography artefact
  // (`rb-mini-v1`'s four one-way arms are 28,2 m each). The PATH half dies only
  // when the lawful direction has been held for the same WRONG_WAY_REARM_SEC
  // the bill uses; the SUSTAIN half dies on the first lawful frame (see the
  // `heldSec = 0` below). Both gates are read from that one ledger, so the bill
  // lands at max(sustain, floor/speed): monotone non-increasing in speed, which
  // the first cut of this floor was NOT.
  //
  // The sustain therefore lives in `goingWrongWay` and the stepper is passed 0:
  // it still owns the rearm hysteresis, the repeat cadence (none, here) and the
  // one-run-one-bill ledger, but the „how long" question is answered against
  // the entry so it cannot be re-asked after the path gate opens.
  const headingWrongWay = tick.wrongWay === true && moving && forwardGear;
  if (headingWrongWay) {
    const entry = (s.wrongWayEntry ??= { travelM: 0, heldSec: 0, lawfulSince: null });
    entry.lawfulSince = null;
    // Same `min(dt, 2)` clamp as the contact odometer above, and for the same
    // reason: every teach card pauses the sim, and a pause must not fabricate
    // metres or seconds the car never drove.
    entry.travelM += contactTravelM;
    entry.heldSec += Math.min(dt, 2);
  } else if (s.wrongWayEntry !== null) {
    // THE TWO HALVES OF THE LEDGER DIE ON DIFFERENT CLOCKS, deliberately. The
    // PATH survives the gap (up to the rearm) because a run does not stop being
    // one street because the flag blinked; the SUSTAIN does not, because it is
    // the debounce — it is what stops a flag that snaps to a parallel one-way
    // centreline for one frame at a time from ever adding up to a 10-point
    // опасна, however many frames it does it on. So the bill still needs
    // `wrongWaySustainSec` of UNBROKEN wrong heading, exactly as it did before
    // any of this, and the floor only ever adds a requirement on top.
    s.wrongWayEntry.heldSec = 0;
    if (s.wrongWayEntry.lawfulSince === null) s.wrongWayEntry.lawfulSince = t;
    if (t - s.wrongWayEntry.lawfulSince >= WRONG_WAY_REARM_SEC) s.wrongWayEntry = null;
  }
  const goingWrongWay =
    headingWrongWay &&
    s.wrongWayEntry !== null &&
    s.wrongWayEntry.travelM >= WRONG_WAY_ENTRY_TRAVEL_M &&
    s.wrongWayEntry.heldSec >= cfg.wrongWaySustainSec;
  if (
    stepSustainedEpisode(
      s.wrongWay,
      goingWrongWay,
      !headingWrongWay,
      t,
      0,
      WRONG_WAY_REARM_SEC,
      0,
    )
  ) {
    // The road the student is actually on picks the sentence, and it travels as
    // `detail` so the server's rebuild picks the same one (see the
    // WRONG_WAY_ROAD_COPY block above). `tick.motorway` is authored district
    // data and ABSENT means „unknown", never „no" — an unknown road keeps the
    // shipped street copy AND stamps no detail at all, so every recorded drive
    // off a non-motorway map is byte-identical on the wire as well as on glass.
    events.push(
      makeViolation(
        "WRONG_WAY",
        t,
        tick.motorway === true ? { detail: WRONG_WAY_ROAD_MOTORWAY } : undefined,
      ),
    );
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
  //
  // FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW». чл. 15, ал. 1 is
  // the duty this code bills, and ал. 2 switches it off: т. 2 — «в населените
  // места, на пътно платно с две и повече пътни ленти за движение в една
  // посока, обозначени с пътна маркировка …, по които е разрешено движението
  // … със скорост не по-голяма от 80 кm/h» — the driver «може да използва за
  // движение най-удобната за него пътна лента»; т. 3 — a lane whose entry a
  // light signal admits (т. 1 is repealed). Text retrieved from
  // content/law/acts/zdvp.json; keep-right-law-pins.test.ts holds it.
  //
  // So the duty binds only OUTSIDE a settlement (SimTick.outsideSettlement —
  // the world builder's own extra-urban predicate), on a MOTORWAY, or where
  // the posted limit is ABOVE 80. The rest of т. 2 is already in the arming
  // below: `laneLinesPainted` is «обозначени с пътна маркировка» and
  // `laneCount > 1` is «две и повече … в една посока». An absent settlement
  // flag acquits (see the field's doc): a town street at ≤ 80 with two marked
  // lanes one way bills nothing, while чл. 25's lane-change duties keep
  // grading through their own codes.
  //
  // т. 3 IS NOT A CHANNEL: no district carries a per-lane admission signal on
  // a multi-lane carriageway — the one lane-control gantry (lc-gantry-v1)
  // stands over single-lane one-way edges, where `laneCount > 1` keeps this
  // silent (measured in runtime/__tests__/settlement-signal.test.ts). A future
  // signal channel lands with its own exemption here.
  const keepRightBinds =
    tick.outsideSettlement === true ||
    tick.motorway === true ||
    tick.maxSpeedKmh > KEEP_RIGHT_TOWN_MAX_KMH;
  const rightmostRequiredLane =
    tick.busLaneRight === true || tick.emergencyLaneRight === true ? 1 : 0;
  const hoggingLeft =
    keepRightBinds &&
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
  // NOT A TRANSITION — MEASURED TWO WAYS, AND THE SECOND IS THE ONE A LEARNER
  // CAN FAIL (2026-08-23).
  //
  // The gate below asks „is this car merging, or is it a mobile chicane", and
  // until today it asked it of ONE number: the instantaneous derivative over
  // `accelWindowSec` = 0.04 s. That number belongs to the harsh-brake
  // conviction (7 m/s², held 0.4 s) and is deliberately short, because there
  // smoothing is lag; types.ts's own note prices its residual at ~0.42 m/s² at
  // 120 fps. The crawl band is 0.5. So on the glass the steadiness test was
  // 84 % noise BEFORE the driver touched anything.
  //
  // And a beginner does not hold a pedal — he presses and releases it, which
  // adds its own swing on top. Both make the same frame read „accelerating",
  // and a frame that reads „accelerating" accrues nothing, so the detector
  // that exists to say „не пълзи" can crawl for minutes without reaching one
  // qualifying second.
  //
  // MEASURED, `sc-fo-motorway-gap / pc-right` (`.audit-frames/rebase`, HEAD
  // 70bcd1ba): 258 s on a 140 км/ч motorway, top speed 15 км/ч, 27 full stops,
  // 347 m of carriageway — «Опасни 0 · Основни 0 · Второстепенни 0», on the
  // lesson whose briefing is «На 130 км/ч изминаваш 36 метра всяка секунда».
  // The map arms everything (mw-v1 edges carry `motorway: true`, `maxspeed`
  // 140) and the same drive's wrong leg scores 10, so the reducer was live and
  // the crawl gate specifically was silent.
  //
  // WHAT THIS DOES NOT ESTABLISH, WRITTEN DOWN RATHER THAN GLOSSED. Nobody has
  // yet read the live tick stream of that drive, so „the 0.04 s reading was out
  // of band during the holds" is the best-supported explanation and not a
  // measurement. What IS measured is the corpus's blindness to the question:
  // the recorded traces are scripted and dead flat —
  // `content/traces/sc-mw-min-speed/mistake-crawl-right.trace.json` holds 149
  // distinct speeds across 813 band frames — so replays and unit fixtures
  // exercised a smoothness the render loop never has to produce. The
  // measurement that would settle it is one drive's `accelMps2` and
  // `motorwayCrawlSec` published per frame; that is an instrument change and
  // belongs in tools/, not here.
  //
  // THE SECOND MEASUREMENT IS ADDITIVE — it can only ADD qualifying frames,
  // never remove one, so nothing that convicts today stops convicting. A merge
  // is still exempt under BOTH readings (0 → 130 at ~2.5 m/s² averages 2.5 over
  // any window), a brake toward a stop likewise; what changes is that a car
  // whose speed is ragged around a low MEAN is no longer mistaken for one that
  // is going somewhere.
  const steadyForCrawl =
    Math.abs(accelMps2) < cfg.motorwaySlowSteadyMps2 ||
    (crawlMeanAccelMps2 !== null && Math.abs(crawlMeanAccelMps2) < cfg.motorwaySlowSteadyMps2);
  const motorwayCrawl =
    cfg.motorwayMinSpeedEnabled &&
    tick.motorway === true &&
    moving &&
    speed < cfg.motorwayMinFlowKmh &&
    steadyForCrawl &&
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
  // THE RE-GRADE THE FREE LESSON CONSUMED (MOTORWAY_CRAWL_REGRADE_SEC — the
  // debrief that proves it and the whole argument are there). The SAME
  // condition, the SAME reset and the SAME per-frame credit as the bill above,
  // on an accrued sustain that is `MOTORWAY_CRAWL_REGRADE_SEC` longer — so it
  // can only ever fire AFTER that bill has fired, never instead of it, and it
  // fires exactly once per continuous crawl.
  //
  // Additive on purpose: the first bill's episode, ledger and instant are
  // untouched, so every drive this reducer books today it still books at the
  // same tick. What is added is ONE bill, marked `regrade`, which
  // `lessons/engine.ts` drops the moment the code has already been charged. In
  // exam mode, on a repeat offence and under a grade-on-sight policy the ledger
  // does not move at all; it moves only where the single bill was spent on the
  // teach and the student was charged nothing for 273 s of crawling.
  const crawlRegrade = stepAccruedEpisode(
    s.motorwaySlowRegrade,
    s.motorwayCrawlRegradeSec,
    motorwayCrawl,
    tick.motorway !== true || speed >= cfg.motorwayMinFlowKmh,
    t,
    dt,
    cfg.motorwaySlowSustainSec + MOTORWAY_CRAWL_REGRADE_SEC,
  );
  s.motorwayCrawlRegradeSec = crawlRegrade.accruedSec;
  if (crawlRegrade.fired) {
    events.push({ ...makeViolation("DRIVING_TOO_SLOW_FOR_MOTORWAY", t), regrade: true });
  }

  // -- THE OTHER SIDE OF THE SPEED ENVELOPE, IN TOWN -------------------------
  // (DRIVING_TOO_SLOW_IN_TOWN — audit sc-vu-emergency-junction:853790f7.)
  //
  // WHAT WAS MEASURED. The reference „correct" leg of `sc-vu-emergency-junction`
  // held 10–11 км/ч for well over two minutes on a street posted 40, and the
  // whole rule engine said nothing: every speed code above grades the FAST half
  // of the envelope, `DRIVING_TOO_SLOW_FOR_MOTORWAY` is gated on
  // `tick.motorway === true` (see its own block, twenty lines up), and no other
  // detector reads the low end at all. The flat-out leg of the SAME lesson was
  // billed once a tick. One side of the envelope graded is not an envelope, and
  // „crawl and you pass" was an unbeaten strategy across every town lesson.
  //
  // THE DUTY, RETRIEVED (ADR-002 — the same article the motorway sibling stands
  // on, and it is not motorway-specific): ЗДвП чл. 22, ал. 1 — „Водачът на
  // пътно превозно средство не трябва да се движи без основателна причина с
  // твърде ниска скорост, когато по този начин пречи на движението на другите
  // пътни превозни средства." There is NO general minimum speed in Bulgarian
  // law, so the floor below is a DETECTION threshold derived from the posted
  // limit, never presented to the student as a number he broke — the catalogue
  // row states the rule and the article and no invented figure.
  //
  // «БЕЗ ОСНОВАТЕЛНА ПРИЧИНА» IS THE HALF THAT NEEDS THE WORK, and it is why
  // this block is mostly acquittals. Every gate below is a REASON the law
  // already accepts, and each one disarms the clock before it ever starts:
  //  · a plate under `townCrawlMinPostedKmh` — a parking aisle, полигон or
  //    Зона 30 is signed slow on purpose (all fourteen `lot-*` maps are posted
  //    20, `poligon-v1` 20/30, `pk-drive-v1` and `sp-zone30-v1` 30), so the
  //    manoeuvre drills are structurally out, not listed out;
  //  · a motorway — its own code grades that, and one act gets one bill;
  //  · ANY vehicle ahead in the player's own corridor, at ANY distance, and
  //    this one is a legal reading rather than a threshold. чл. 22, ал. 1
  //    forbids the crawl that „пречи на движението на ДРУГИТЕ" — the car that
  //    holds a road up is the one at the FRONT of it. With a body ahead in my
  //    own lane I am not the head of the queue and I am not what anybody is
  //    stuck behind, whatever my speedometer says. So there is deliberately NO
  //    metre figure here: `traffic.leadGapFor` already answers „is there a
  //    vehicle ahead in my corridor" and that is the whole question. It costs a
  //    false NEGATIVE (the learner dawdling behind a car 200 m up the road goes
  //    free) and buys the acquittal of every following drill in the corpus,
  //    which is the direction A12 sends every doubt in this file;
  //  · a junction, stop line or pedestrian inside `townCrawlClearAheadM` — the
  //    approach IS the reason, and a learner who slows for one is doing it
  //    right;
  //  · a pedestrian-crossing zone the reducer already tracks (`s.crossing`), a
  //    rail crossing, a signed curve advisory, a narrow two-way meeting;
  //  · night, rain, fog or snow — чл. 20, ал. 2 orders the driver to fit the
  //    speed to the conditions, so a crawl in weather is obedience, not a fault
  //    (`sc-pe-night-unlit` ships «mistake-city-speed» for exactly this);
  //  · a calmed `zone` tag, a recent hazard, reverse gear, a standstill and a
  //    stall — the same exemptions the motorway crawl carries.
  // What is left when all of them are false is a car cruising steadily at
  // walking pace down an open through street with nothing in front of it. That
  // is the fault, and it is the only thing this convicts.
  const townFloorKmh = Math.min(limit * cfg.townCrawlFractionOfLimit, cfg.townCrawlFloorCapKmh);
  // Split ONLY so the standstill code below can ask a narrower question of the
  // lead arm (see `needlessStopReason`). `townReasonAhead` is the same
  // disjunction, in the same order, and the crawl reads it unchanged.
  const townLeadAhead = leadGapM !== null;
  const townReasonAheadExceptLead =
    (tick.nextJunctionM !== undefined && tick.nextJunctionM <= cfg.townCrawlClearAheadM) ||
    (tick.nextStopLineM !== undefined && tick.nextStopLineM <= cfg.townCrawlClearAheadM) ||
    (tick.vruAheadM !== undefined && tick.vruAheadM <= cfg.townCrawlClearAheadM) ||
    s.crossing !== null ||
    tick.railCrossing !== undefined ||
    tick.curveAdvisoryKmh !== undefined ||
    tick.narrowTwoWay === true;
  const townReasonAhead = townLeadAhead || townReasonAheadExceptLead;
  const townConditionsExcuse =
    tick.isNight || tick.rain === true || tick.fog === true || tick.snow === true;
  const townThroughRoad =
    limit >= cfg.townCrawlMinPostedKmh && tick.motorway !== true && tick.zone === undefined;
  const townCrawlCond =
    cfg.townCrawlEnabled &&
    townThroughRoad &&
    moving &&
    speed < townFloorKmh &&
    // The SAME steadiness test the motorway crawl uses, and for the same
    // reason: a move-off, a merge and a brake toward a stop all read far above
    // the band, so only a HELD crawl accrues.
    steadyForCrawl &&
    !townReasonAhead &&
    !townConditionsExcuse &&
    tick.stalled !== true &&
    !tick.handbrakeOn &&
    (s.lastHazardEventAt === null || t - s.lastHazardEventAt > cfg.harshBrakeHazardCooldownSec) &&
    forwardGear;
  // Re-armed by a GENUINE recovery — back into the recovery band and HELD
  // there — or by leaving the through road entirely. Both guards, and the
  // measurement that says why one line was not enough, are at
  // `TOWN_CRAWL_RECOVERY_HELD_SEC`: the detection line and the recovery line
  // used to be the same number, read on one frame, so 143 s of the
  // photographed crawl banked a peak of 9.0 s against a 20 s threshold and
  // reached the debrief as «CLEAN_DRIVING».
  const townRecoveryFloorKmh =
    townFloorKmh + Math.min(limit * cfg.speedingGraceRatio, cfg.speedingGraceMaxKmh);
  // Off the through road the ledger is void, so seed the hold at its own
  // threshold: `townReset` is then true on that very frame, exactly as before.
  s.townCrawlRecoverySec = !townThroughRoad
    ? TOWN_CRAWL_RECOVERY_HELD_SEC
    : speed >= townRecoveryFloorKmh
      ? s.townCrawlRecoverySec + Math.max(0, Math.min(dt, 2))
      : 0;
  const townReset = s.townCrawlRecoverySec >= TOWN_CRAWL_RECOVERY_HELD_SEC;
  const townStep = stepAccruedEpisode(
    s.townCrawl,
    s.townCrawlSec,
    townCrawlCond,
    townReset,
    t,
    dt,
    cfg.townCrawlSustainSec,
  );
  s.townCrawlSec = townStep.accruedSec;
  if (townStep.fired) {
    events.push(makeViolation("DRIVING_TOO_SLOW_IN_TOWN", t));
  }
  const townRegrade = stepAccruedEpisode(
    s.townCrawlRegrade,
    s.townCrawlRegradeSec,
    townCrawlCond,
    townReset,
    t,
    dt,
    cfg.townCrawlSustainSec + TOWN_CRAWL_REGRADE_SEC,
  );
  s.townCrawlRegradeSec = townRegrade.accruedSec;
  if (townRegrade.fired) {
    events.push({ ...makeViolation("DRIVING_TOO_SLOW_IN_TOWN", t), regrade: true });
  }

  // -- THE LIMIT CASE OF THE SAME ENVELOPE: THE STOP THAT HAD NO REASON -----
  // (STOPPED_WITHOUT_CAUSE — audit sc-jx-priority-confidence:9c987e7b.)
  //
  // WHAT WAS MEASURED. `sc-jx-priority-confidence` is titled „По пътя с
  // предимство — без излишни спирания" and its objective is one sentence: cross
  // the junction „равномерно и уверено… но не спирай без причина". The credited
  // drive of `.audit-frames/w21/frames/sc-jx-priority-confidence__pc-right`
  // (attested b224c7e) covered 187 m of an open priority arm in 88 s against
  // this template's own 40 s par, standing still for most of it with a car
  // glued 9 m behind — and reached «Второстепенни 0 · 0», ИЗДЪРЖАН, ★★★, +100
  // XP and a commendation. The behaviour the lesson is NAMED after was not
  // graded leniently; it was not looked at.
  //
  // WHY NEITHER CRAWL CODE ABOVE CATCHES IT, read off their own gates rather
  // than assumed. Both carry `moving` (v > `movingSpeedKmh` = 5), so a car at
  // REST contributes nothing to either ledger — the standstill is descoped by
  // construction. And `townReset` zeroes the town ledger the moment the driver
  // recovers to the floor, so the stop-drive-stop-drive shape this defect
  // actually has (that drive touched 44 км/ч twice) resets the clock before the
  // 20 s can accrue. Both are correct: a driver who reaches 44 км/ч is not
  // crawling. He is STOPPING, which is a different act and needs its own duty.
  //
  // THE DUTY, RETRIEVED (ADR-002 — `content/law/acts/zdvp.json`, чл. 24):
  // ал. 2 — „Преди да намали значително скоростта на движение на управляваното
  // от него пътно превозно средство, водачът е длъжен да се убеди, че няма да
  // създаде опасност за останалите участници в движението и че няма да затрудни
  // излишно тяхното движение." Not чл. 22, ал. 1: that one governs a driver who
  // „се движи… с твърде ниска скорост", and this car is not moving at all. чл. 24
  // is the article about the DECELERATION itself, and „затрудни излишно" is the
  // lesson's „излишни спирания" in the act's own words.
  //
  // «БЕЗ ПРИЧИНА» IS AGAIN THE HALF THAT NEEDS THE WORK, so this block is mostly
  // acquittals — and it reuses the town crawl's list verbatim (`townReasonAhead`,
  // `townThroughRoad`) rather than restating it, because the question „is there
  // anything up this road to be slow for" has exactly one right answer and two
  // copies of it would drift. On top of that list:
  //  · a forbidding LIGHT anywhere in the watch window, not merely inside the
  //    25 m clear band — waiting out a red 60 m back in a queue is the most
  //    ordinary lawful stop there is (the `banZoneControl` reading, mirrored);
  //  · an authored В27 span — a rest there is ILLEGAL_STOP_IN_BAN_ZONE's act,
  //    and one act gets one bill;
  //  · fog and snow, where чл. 20, ал. 2's „да бъдат в състояние да спрат пред
  //    всяко предвидимо препятствие" can genuinely bottom out at a halt. RAIN
  //    and NIGHT are deliberately NOT excuses here although the crawl code
  //    accepts both: they are reasons to go SLOWER, and standing still in a live
  //    lane is not a slower speed — on the rung this detector is armed for (L5,
  //    rain, with the лепка behind) it is the more dangerous thing, not the safer
  //    one;
  //  · a stall (ENGINE_STALLED owns it — charging the restart seconds again
  //    here would bill one mechanical event twice), reverse/neutral, and any
  //    hazard-shaped event inside the harsh-brake cooldown;
  //  · `s.moveOff.done` — THE SESSION HAS ACTUALLY DRIVEN. Every drive opens at
  //    rest while the student reads the briefing card, and without this the
  //    reducer would bill a car that has never been touched. It is the same
  //    latch `MOVE_OFF_WITHOUT_OBSERVATION` reads, set the first frame the car
  //    passes `movingSpeedKmh`.
  // What is left is a car held at a dead stop, in gear, in a live lane of an
  // open through road, with nothing ahead of it and no signal, no crossing, no
  // person, no weather and no hazard to answer for it.
  const needlessStopSignal =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState !== undefined &&
    tick.nextStopLineState !== "green";
  // A CAR 140 m UP THE ROAD IS NOT WHY I AM PARKED
  // (sc-follow-tailgater:63c0c28c). The list above is the CRAWL's, and its lead
  // arm carries the crawl's legal reading — „with a body ahead in my own lane I
  // am not the head of the queue", deliberately at ANY distance. That is right
  // for a car that is MOVING and wrong for one that is not: a driver at a dead
  // stop with 140 m of empty road in front of him is exactly what the traffic
  // behind is stuck behind, whatever sits at the far end of it. Inherited whole
  // it made the code unfireable wherever a lesson stages a lead at all —
  // measured on `sc-follow-tailgater`, whose cruiser holds the player's own
  // lane for the first 94 s of every drive.
  // So the STANDSTILL asks the narrower question, in the band this same block
  // already calls „the approach IS the reason" for a junction, a stop line or a
  // pedestrian: a body within `townCrawlClearAheadM` ahead is a queue and
  // excuses the rest exactly as before; beyond it the road is open and the stop
  // answers to nothing. The moving-car reading above is untouched — the crawl
  // still reads `townReasonAhead` whole, at any distance.
  const leadQueueAhead = leadGapM !== null && leadGapM <= cfg.townCrawlClearAheadM;
  // ── FOUNDER RULING 2026-10-04 «Add stops together» — the junction arm and the
  // conflict that replaces it (audit sc-jx-priority-confidence:9c987e7b).
  //
  // THE JUNCTION ARM IS A RADIUS. `tick.nextJunctionM` is `Math.hypot` to the
  // nearest node, so `townReasonAheadExceptLead` acquitted every stop within
  // 25 m of tj-n-c on either side, and that band is where this drill's fault
  // happens. On a generic route the arm is right, because the reducer cannot see
  // who owes way at a node. Where the author states that the route's junctions
  // oblige this driver to nothing (`needlessStopJunctionExcuse: false`, the
  // priority road), the standstill reads the same list WITHOUT that one term.
  // `townReasonAheadExceptLead` and the crawl's `townReasonAhead` are untouched.
  //
  // WHAT THE JUNCTION ARM WAS ALSO DOING, and must still be done. On L5 a
  // creeper crosses the priority driver's path at the node, and the defensive
  // student who stops for it must not be billed for the seconds it takes to
  // clear. The reducer cannot see a crossing car as a junction obligation; it
  // CAN see it in its own corridor, as `leadGapM`. Measured on L5 (stop at
  // x = −12): the creeper is 24 → 13 m ahead while the student brakes, gone
  // 0.7 s before he is at rest, and the waiter then crosses 12 m ahead for
  // 1.8 s. Neither is inside the 25 m queue band long enough to matter, so a
  // stop made FOR them would be billed on the seconds after they leave.
  // So where the junction arm is dropped, a body seen in the corridor within
  // `harshBrakeClearLeadGapM` (45 m — the reach at which the harsh-brake ledger
  // already treats a lead as a cause of braking) excuses the standstill, and
  // keeps excusing it for `harshBrakeHazardCooldownSec` (6 s — the settle every
  // hazard-shaped event already earns) after it was last seen. Nothing reads
  // this where the junction arm is kept, so every other lesson is untouched.
  const needlessStopJunctionAware = !cfg.needlessStopJunctionExcuse;
  if (needlessStopJunctionAware && leadGapM !== null && leadGapM <= cfg.harshBrakeClearLeadGapM) {
    s.needlessStopConflictAt = t;
  }
  const needlessStopConflictAhead =
    needlessStopJunctionAware &&
    s.needlessStopConflictAt !== null &&
    t - s.needlessStopConflictAt <= cfg.harshBrakeHazardCooldownSec;
  const needlessStopReasonAhead = cfg.needlessStopJunctionExcuse
    ? townReasonAheadExceptLead
    : (tick.nextStopLineM !== undefined && tick.nextStopLineM <= cfg.townCrawlClearAheadM) ||
      (tick.vruAheadM !== undefined && tick.vruAheadM <= cfg.townCrawlClearAheadM) ||
      s.crossing !== null ||
      tick.railCrossing !== undefined ||
      tick.curveAdvisoryKmh !== undefined ||
      tick.narrowTwoWay === true ||
      needlessStopConflictAhead;
  const needlessStopReason =
    leadQueueAhead ||
    needlessStopReasonAhead ||
    needlessStopSignal ||
    tick.noStopZone === true ||
    tick.fog === true ||
    tick.snow === true;
  const needlessStop =
    cfg.needlessStopEnabled &&
    townThroughRoad &&
    s.moveOff.done &&
    speed <= cfg.fullStopMaxSpeedKmh &&
    forwardGear &&
    tick.stalled !== true &&
    !needlessStopReason &&
    (s.lastHazardEventAt === null || t - s.lastHazardEventAt > cfg.harshBrakeHazardCooldownSec);
  // By default re-armed by driving on, or by leaving the through road — one bill
  // per stop, and a driver who stops needlessly twice is billed twice because
  // those are two acts. (Consecutive, not accrued: a stop is one event with a
  // beginning and an end.)
  //
  // FOUNDER RULING 2026-10-04 «Add stops together» (`needlessStopPerStop:
  // false`, sc-jx-priority-confidence only). The per-stop reading let fourteen
  // 3-second halts at 18 км/ч — 97 s against a 40 s par — bill nothing, because
  // every halt was shorter than the 6 s sustain and each one started the clock
  // over. Under the ruling the causeless seconds are ADDED UP across stops
  // (`stepAccruedEpisode`, the town crawl's own accrual, ledger kept in the
  // episode's `qualifiedSec`). A frame with a reason, or in motion, PAUSES the
  // sum and never zeroes it. Only a genuine recovery zeroes it: the town
  // crawl's `townReset` — back to the crawl's recovery speed and HELD there for
  // `TOWN_CRAWL_RECOVERY_HELD_SEC`, or off the through road — the same „gone
  // back to driving" test, so the two speed-envelope codes agree on what a
  // clean drive is. One bill per accrued episode, plus the same re-grade.
  //
  // THE CARD. Where the author has also dropped the junction arm (the priority
  // road), the bill carries `NEEDLESS_STOP_ACT_PRIORITY_ROAD`, whose copy says
  // why stopping there is the fault and that short stops add up. The pooled
  // row's «нито кръстовище» would be false on a stop beside tj-n-c.
  const needlessStopDetail =
    !cfg.needlessStopPerStop && !cfg.needlessStopJunctionExcuse
      ? NEEDLESS_STOP_ACT_PRIORITY_ROAD
      : undefined;
  let needlessStopFired: boolean;
  let needlessStopRegradeFired: boolean;
  if (cfg.needlessStopPerStop) {
    const needlessStopReset = !townThroughRoad || speed > cfg.movingSpeedKmh;
    needlessStopFired = stepEpisode(
      s.needlessStop,
      needlessStop,
      needlessStopReset,
      t,
      cfg.needlessStopSustainSec,
    );
    needlessStopRegradeFired = stepEpisode(
      s.needlessStopRegrade,
      needlessStop,
      needlessStopReset,
      t,
      cfg.needlessStopSustainSec + NEEDLESS_STOP_REGRADE_SEC,
    );
  } else {
    const first = stepAccruedEpisode(
      s.needlessStop,
      s.needlessStop.qualifiedSec,
      needlessStop,
      townReset,
      t,
      dt,
      cfg.needlessStopSustainSec,
    );
    s.needlessStop.qualifiedSec = first.accruedSec;
    needlessStopFired = first.fired;
    const second = stepAccruedEpisode(
      s.needlessStopRegrade,
      s.needlessStopRegrade.qualifiedSec,
      needlessStop,
      townReset,
      t,
      dt,
      cfg.needlessStopSustainSec + NEEDLESS_STOP_REGRADE_SEC,
    );
    s.needlessStopRegrade.qualifiedSec = second.accruedSec;
    needlessStopRegradeFired = second.fired;
  }
  if (needlessStopFired) {
    events.push(makeViolation("STOPPED_WITHOUT_CAUSE", t, { detail: needlessStopDetail }));
  }
  if (needlessStopRegradeFired) {
    events.push({
      ...makeViolation("STOPPED_WITHOUT_CAUSE", t, { detail: needlessStopDetail }),
      regrade: true,
    });
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

  // Off the carriageway (чл. 15, ал. 1 — „водачът… се движи възможно най-вдясно
  // ПО ПЛАТНОТО ЗА ДВИЖЕНИЕ"; § 6, т. 3 defines платно за движение and т. 4 its
  // граница). The arm the „WITHDRAWN 2026-08-26" block at the top of this
  // function routed and did not build: the runtime has published the signal at
  // the kerb since that day and nothing consumed it, so a student could drive
  // 145 км/ч across a field, or come to rest on a roundabout island, and read a
  // sheet that said nothing at all.
  //
  //  · THE POLARITY, and it is the whole difference between a fault detector and
  //    a machine for failing honest students. `tick.edgeId` is
  //    `string | null | undefined` and the three are NOT two: a string is „on
  //    that edge", `null` is „the runtime looked and this car is off the
  //    carriageway", `undefined` is „THIS TICK SOURCE CANNOT ANSWER" — replays,
  //    recorded traces, hand-built fixtures, the dev rigs. Only an explicit
  //    `=== null` may convict. Written as `!tick.edgeId` this line would read
  //    absent-channel as departure and convict every replay and every fixture in
  //    the suite of driving in a field — a false conviction on a student who
  //    never left the road, which this programme has spent whole rounds undoing.
  //    `lessons/finish.ts stepOffNetwork` guards the identical channel the
  //    identical way and says so; the two must not drift.
  //  · THE RESET IS THE POSITIVE FACT, for the same reason: the episode re-arms
  //    only on `typeof edgeId === "string"` — the runtime SAYING the car is on a
  //    road — never on „not null".
  //    WHAT AN `undefined` FRAME ACTUALLY DOES, read off `stepEpisode` rather
  //    than assumed: it is neither the condition nor the reset, so it lands in
  //    the `!cond` arm, which clears `activeSince` and leaves `emitted` alone.
  //    So it cannot convict, and it cannot re-arm a spent excursion for a second
  //    bill — but it DOES drop the onset, and the 2 s has to be re-earned from
  //    the next `null` frame. A channel that goes quiet mid-departure therefore
  //    buys the student time and can never cost him any, which is the direction
  //    an absent channel must err in and the same answer `stepOffNetwork` gives
  //    („Absent channel = innocent"). Pinned in
  //    `__tests__/off-carriageway.test.ts`.
  //    (This paragraph read „it leaves the episode exactly as it was" until
  //    2026-08-30. It does not — that is the `reset` arm, and `undefined` is not
  //    the reset. Corrected before the row shipped, because a comment that
  //    describes a neighbouring branch is how the next edit picks the wrong one.)
  //  · NO `moving` CONJUNCT, deliberately, and this is the one place this
  //    detector parts company with its neighbours above. The founder's case is a
  //    drive FINISHED standing on grass; every other span code here requires
  //    motion because its article grades travel, and чл. 15, ал. 1 grades where
  //    the car is. Requiring motion would acquit the exhibit that prompted it.
  //  · FRAME-ZERO POSE GUARD, mirroring `lessons/engine.ts` POSE_MOTION_KMH /
  //    `posedAtSec` (doc 87 B3/B10/B11) rather than importing it — `rules/` is
  //    the leaf module and may not import `lessons/`. It is NOT belt-and-braces:
  //    the scene ticks this reducer with a placeholder pose at the district
  //    ORIGIN before the chassis publishes, `applyTick` runs the rule engine on
  //    those frames unconditionally („the law applies from second zero"), and on
  //    7 of the 105 shipped districts that origin is measurably off the
  //    carriageway — d2-v1, district-v1, lc-gantry-v1, rb-2lane-v1, rb-mini-v1,
  //    rb-ped-v1, rb-single-v1. Without this conjunct an untouched session on
  //    district-v1 bills −3 for a car that was never placed: B-NEW-1 exactly,
  //    the placeholder frame that once ended untouched sessions at ~40 s.
  //    RESIDUAL, stated rather than hidden: a car genuinely at rest at exactly
  //    (0, 0) is acquitted too. That is float-exact equality on both coordinates
  //    and it is the same trade the session engine's own guard already makes.
  //  · WHAT ACQUITS THE LAWFUL CAR IS GEOMETRY, NOT THIS SUSTAIN, and it is
  //    measured rather than argued (`runtime/__tests__/off-carriageway-consult
  //    .test.ts`): all 248 authored spawn points, all 117 authored parking-bay
  //    centres (the builder draws the bays INTO the aisle ribbon — the deepest,
  //    lot-par-v1's parallel slot, reads outsideKerbM 0.000) and 57,000 poses
  //    across every travel lane AND kerbside parking band of all 105 districts
  //    read `carriageway`, worst outsideKerbM 0.000 m. A perfectly parked car is
  //    on the carriageway as far as this channel is concerned, so the parking
  //    curriculum cannot be convicted by this row. That sweep is the acquitting
  //    proof this detector rests on; it does not enumerate every authored
  //    objective TARGET, so the first drive audit after this lands should be read
  //    for false convictions before the row is called settled.
  //  · ONE ACT, ONE BILL — THE CRASH SWALLOWS THE DEPARTURE IT CAUSES, and this
  //    is the conjunct the first run of the trace gate demanded. A car that hits
  //    something and ends up in the verge HAS left the carriageway, and without
  //    this it is billed 3 for it on top of COLLISION's 10 — one physical event
  //    charged twice. The collision row's own copy already says they are one
  //    thing („Излизането от платното е самото произшествие"), `n38.ts` grounds
  //    this code on the case where no crash happened, and `HARSH_BRAKING_NO_
  //    CAUSE` defers to COLLISION in the same words. MEASURED on
  //    `sc-sign-warning/mistake-hold-speed`: departure at t ≈ 21.18 s, impact at
  //    t = 21.43 s, and this detector fired at t = 23.18 s — the sheet read
  //    SPEED_TOO_FAST_FOR_CONDITIONS + COLLISION + OFF_CARRIAGEWAY for one slide
  //    off an icy road.
  //    THE TEST IS TWO-SIDED ON PURPOSE, because the order is not fixed: there
  //    the car left the road and THEN hit a body already off it, while a spin
  //    after a mid-carriageway impact happens the other way round. Both are the
  //    same event, so what is compared is the episode's ONSET against the last
  //    contact REPORT, within one sustain either way. Reusing
  //    OFF_CARRIAGEWAY_SUSTAIN_SEC rather than inventing a second number is the
  //    claim itself: a departure this reducer cannot separate from an impact by
  //    more than the window it needs to call a departure real is not a separate
  //    act. A departure that starts LATER than that — the student recovered,
  //    drove on, and then left the road — is freely chosen and is billed.
  //    The gate is on the EMIT, not on the condition, so the episode still spends
  //    itself and one crash cannot be re-billed frame after frame.
  //    Read off `contactEpisodes` (every contact REPORT, billed or not) rather
  //    than off a new latch: a contact that `cameApart` judged part of an
  //    already-open encounter is still an impact, and still not the driver
  //    steering into a field.
  const atPlaceholderPose =
    tick.position.x === 0 && tick.position.y === 0 && Math.abs(speed) <= POSE_PLACEHOLDER_KMH;
  // Read BEFORE the step: a firing episode keeps its `activeSince`, but taking
  // it here also documents that the onset compared below is the one the sustain
  // was measured from, not whatever the next frame does to it.
  const departureOnset = s.offCarriageway.activeSince;
  // Evaluated ONCE and shared by both thresholds: the re-grade below is the same
  // breach, so it must not be able to drift apart from the bill on the predicate
  // that decides whether the car is off the road at all.
  const offCarriagewayNow = tick.edgeId === null && !atPlaceholderPose;
  const backOnCarriageway = typeof tick.edgeId === "string";
  if (
    stepEpisode(
      s.offCarriageway,
      offCarriagewayNow,
      backOnCarriageway,
      t,
      OFF_CARRIAGEWAY_SUSTAIN_SEC,
    ) &&
    // The crash scan is INSIDE the fire branch, not beside it: `Object.keys`
    // allocates, this reducer runs on every render frame (~120 Hz), and the
    // branch is reached at most once per excursion. The value is needed only to
    // decide whether to push, so computing it every frame would be a per-frame
    // allocation bought for nothing — the discipline the accel window's own note
    // spells out two hundred lines up.
    !crashCausedDeparture(s.contactEpisodes, departureOnset)
  ) {
    events.push(makeViolation("OFF_CARRIAGEWAY", t));
  }
  // THE RE-GRADE THE FREE LESSON CONSUMED (`OFF_CARRIAGEWAY_REGRADE_SEC` — its
  // block is the whole derivation). Same condition, same reset, same crash
  // swallow, on a sustain that is strictly larger, so it can only ever fire
  // AFTER the bill above and exactly once per excursion. `regrade: true` is a
  // FACT about the event — „this is the same breach again" — and
  // `lessons/engine.ts` drops it wherever the code was already charged, so a
  // continuous excursion can never cost twice.
  if (
    stepEpisode(
      s.offCarriagewayRegrade,
      offCarriagewayNow,
      backOnCarriageway,
      t,
      OFF_CARRIAGEWAY_SUSTAIN_SEC + OFF_CARRIAGEWAY_REGRADE_SEC,
    ) &&
    !crashCausedDeparture(s.contactEpisodes, departureOnset)
  ) {
    events.push({ ...makeViolation("OFF_CARRIAGEWAY", t), regrade: true });
  }

  // -- 4a1'. THE RED TELLTALE THAT WAS IGNORED AND STILL IS (VP-06 / N11 —
  // `WARNING_LAMP_REGRADE_SEC` carries the measurement and the derivation).
  // Armed ONLY by the runner's own ignore bill above, so no drive that was
  // never billed can be reached here. The clock runs while the driver is not
  // slowing and stops the instant he is — «спри безопасно СЕГА» is answered by
  // lifting off, not by finishing the stop. „Is slowing" is read over the last
  // `WARNING_LAMP_REGRADE_SEC`, not since the bill: see
  // `WARNING_LAMP_COMPLY_DROP_KMH` for the drive that shows why.
  if (s.warningLampIgnoredAt !== null) {
    const recent = s.warningLampRecent;
    while (recent.length > 0 && recent[recent.length - 1].speedKmh <= speed) recent.pop();
    recent.push({ t, speedKmh: speed });
    while (recent[0].t < t - WARNING_LAMP_REGRADE_SEC) recent.shift();
    const isComplying =
      recent[0].speedKmh - speed >= WARNING_LAMP_COMPLY_DROP_KMH || speed < cfg.movingSpeedKmh;
    const lampStep = stepAccruedEpisode(
      s.warningLampRegrade,
      s.warningLampDriveOnSec,
      !isComplying,
      isComplying,
      t,
      dt,
      WARNING_LAMP_REGRADE_SEC,
    );
    s.warningLampDriveOnSec = lampStep.accruedSec;
    if (lampStep.fired) {
      events.push({
        ...makeViolation("WARNING_LAMP_IGNORED", t, { detail: "warning-lamp" }),
        regrade: true,
      });
    }
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
  //
  // THE ONE INNOCENT REST THIS LIST COULD NOT SEE, and it is not hypothetical:
  // A PERSON STANDING IN THE LANE. Sweep 161, `sc-hz-accident-scene/pc-right`
  // (frame 04-t092s): a НАУЧИ card convicts «Спиране в забранена зона … под
  // знак В27» at the exact moment the car has stopped because a bystander is
  // in front of it. Stopping for a pedestrian is taught as an offence, on the
  // lesson whose whole subject is that people are standing there — the north
  // star inverted in one card.
  //
  // EVERY OTHER TRAFFIC-SHAPED REST WAS ACQUITTED ABOVE, so the omission was
  // structural rather than an oversight in the list: `banZoneQueue` reads
  // `leadGapM`, which is the VEHICLE ahead; `s.crossing` needs an armed
  // crossing zone, and hz-accident-v1 ships `crossings: []` precisely so no
  // PEDESTRIAN_* code can fire on it. There was no third channel, so this
  // reducer literally could not see the man it was convicting the student for
  // stopping in front of.
  //
  // THE CHANNEL IS NOW DECLARED (`SimTick.vruAheadM`, 2026-08-23) and read
  // here, on the same terms as every zone flag in this file: DATA, never a
  // heuristic, and ABSENT means the reporter cannot answer rather than „nobody
  // there" — so every existing drive, trace and fixture grades byte-
  // identically until something publishes it. It is also one-directional: this
  // number can only ACQUIT. Convicting on it would mean inferring „he should
  // have stopped" from a bare distance, which needs the person's heading and
  // speed and is the adjudication A12 refuses.
  //
  // WHAT IT STILL NEEDS, AND THIS FILE CANNOT DO IT: a publisher.
  // `runtime/worldRuntime.ts` builds the tick, and the orchestrator's contact
  // sentinel already resolves every staged pedestrian pose each frame — the
  // nearest one's forward distance in the player's own path is the value. Until
  // that lands, the acquittal below is armed and silent, exactly like
  // `noStopZone` was before a map carried a В27 span.
  const banZoneQueue = leadGapM !== null && leadGapM <= cfg.banZoneStopQueueGapM;
  /** A person in the path — the rest has a human cause (чл. 5, ал. 2). */
  const banZoneVruAhead =
    tick.vruAheadM !== undefined &&
    Number.isFinite(tick.vruAheadM) &&
    tick.vruAheadM <= cfg.banZoneVruAheadM;
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
    !banZoneVruAhead &&
    !banZoneControl &&
    s.crossing === null;
  // Evaluated ONCE and shared by both thresholds: the re-grade below is the
  // same breach, so it must not be able to drift apart from the bill on the
  // predicate that decides whether the car may stand here at all.
  const banZoneRestReset = tick.noStopZone !== true || speed > cfg.movingSpeedKmh;
  // AT A SPIRKA THE LAW ALLOWS THE DROP-OFF (founder follow-up ruling
  // 2026-09-22, «Teach чл. 69 as written»). чл. 69 lets other vehicles stop at a
  // bus stop «само за слизане на пътници», so a rest there is an offence only
  // once it is no longer one — паркиране (чл. 93, ал. 2), which чл. 98, ал. 2,
  // т. 3 bans at the stops. Every other basis keeps the 4 s sustain unchanged;
  // `RuleEngineConfig.busStopDropOffMaxSec` carries the number and says whose
  // it is (ours, not the act's). The re-grade below rides the same sustain, so
  // it stays strictly later than the bill.
  const banZoneRestSec =
    tick.noStopBasis === "law-bus-stop" ? cfg.busStopDropOffMaxSec : cfg.banZoneStopRestSec;
  if (
    stepEpisode(
      s.banZoneStop,
      illegalBanRest,
      banZoneRestReset,
      t,
      banZoneRestSec,
    )
  ) {
    events.push(makeViolation("ILLEGAL_STOP_IN_BAN_ZONE", t, { detail: tick.noStopBasis }));
  }
  // THE RE-GRADE THE FREE LESSON CONSUMED (`BAN_ZONE_REST_REGRADE_SEC` — its
  // block is the whole derivation). Same condition, same reset, on a sustain
  // that is strictly larger, so it can only ever fire AFTER the bill above and
  // exactly once per rest. `regrade: true` is a FACT about the event — „this is
  // the same breach again" — and `lessons/engine.ts` drops it wherever the code
  // was already charged, so one held rest can never cost twice.
  if (
    stepEpisode(
      s.banZoneStopRegrade,
      illegalBanRest,
      banZoneRestReset,
      t,
      banZoneRestSec + BAN_ZONE_REST_REGRADE_SEC,
    )
  ) {
    // THE SAME `detail` AS THE BILL ABOVE, and it is not optional garnish: the
    // re-grade is the SAME breach, so a basis on one and not the other would
    // print two different laws for one held rest — the wire.ts/FaultCard defect
    // this file already records twice (the WRONG_WAY note ~1798).
    events.push({
      ...makeViolation("ILLEGAL_STOP_IN_BAN_ZONE", t, { detail: tick.noStopBasis }),
      regrade: true,
    });
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
  // ACCRUED, NOT CONSECUTIVE, AND RE-GRADED ONCE (2026-08-27 — see
  // `BUS_LANE_REGRADE_SEC` for both frames and the whole argument). The gates
  // above are unchanged; what changed is that the 4 s no longer has to be one
  // unbroken run, because a bus lane is used precisely to CREEP past the queue
  // beside it and `moving` was resetting the clock on every one of those creeps
  // (the audited right leg never held > 5 км/ч for four seconds in 208 s and
  // booked nothing at all). The reset is the same one the detector always had —
  // leaving lane 0 or leaving the span — so a driver who does what the lesson
  // asks and pulls out into the general lane still zeroes the ledger.
  const busLaneReset = tick.busLaneRight !== true || tick.laneId !== 0;
  const busLaneStep = stepAccruedEpisode(
    s.busLane,
    s.busLaneCruiseSec,
    busLaneCruise,
    busLaneReset,
    t,
    dt,
    cfg.busLaneSustainSec,
  );
  s.busLaneCruiseSec = busLaneStep.accruedSec;
  if (busLaneStep.fired) {
    events.push(makeViolation("DRIVING_IN_BUS_LANE", t));
  }
  // THE RE-GRADE THE FREE LESSON CONSUMED. The SAME condition, the SAME reset
  // and the SAME per-frame credit as the bill above, on an accrued sustain that
  // is `BUS_LANE_REGRADE_SEC` longer — so it can only ever fire AFTER that bill
  // has fired, never instead of it, and it fires exactly once per continuous
  // cruise. Marked `regrade`, which `lessons/engine.ts` drops the moment the
  // code has already been charged, so exam mode and repeat offences are
  // byte-identical; it moves the ledger only where the single bill was spent on
  // the teach and the student was charged nothing for travelling the bus lane.
  const busLaneRegradeStep = stepAccruedEpisode(
    s.busLaneRegrade,
    s.busLaneRegradeSec,
    busLaneCruise,
    busLaneReset,
    t,
    dt,
    cfg.busLaneSustainSec + BUS_LANE_REGRADE_SEC,
  );
  s.busLaneRegradeSec = busLaneRegradeStep.accruedSec;
  if (busLaneRegradeStep.fired) {
    events.push({ ...makeViolation("DRIVING_IN_BUS_LANE", t), regrade: true });
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
        // DRIVING seconds, not wall-clock ones — the Б2 ledger discipline this
        // case says it follows, including the repair (see
        // `RuleEngineState.stop.movingSinceStopSec`). It matters more here than
        // there: чл. 51 has the driver stop AND look and listen at an unguarded
        // crossing, and a train is not a six-second wait.
        const stopped = last !== null && s.stop.movingSinceStopSec <= cfg.stopRecencySec;
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
  // HESITATION_PAST_LINE — THE FREEZE THAT HAPPENS ONE CAR-LENGTH LATER
  // (sc-signal-hesitation:440b1f7c, critical).
  //
  // WHAT WAS MEASURED, through `compileScenario → recordScriptedDrive →
  // applyTick` on sxh-v1 with sx-n-c pinned GREEN (the recorder's own
  // `SX_PIN_NS_GREEN_HOLD`), the SAME nine-second freeze at five places:
  //   centre 2.3 m BEFORE the line (y = −30)  → HESITATION_AT_GREEN @ 19.2 s,
  //                                              «…без да замръзваш» withheld
  //   centre 3.7 m PAST it (y = −24)          → violations [], gate ticked
  //                                  (after)  → HESITATION_AT_GREEN @ 20.1 s, withheld
  //   centre 7.7 m past (y = −20)             → violations [], gate ticked
  //                                  (after)  → HESITATION_AT_GREEN @ 20.6 s, withheld
  //   centre 15.7 m past (y = −12)            → violations [], gate ticked
  //                                  (after)  → unchanged: deeper than the window
  // and `.audit-frames/w45/frames/sc-signal-hesitation__pc-wrong/04-t016s.png`
  // is the second row in the wild: 0 км/ч, odometer 082 м from the y = −105
  // spawn, i.e. the centre ~5 m over the y = −27.725 line, the light green,
  // the road empty — and the sheet «Премини правó напред на зелено, без да
  // замръзваш ✓». The lesson is named for that picture.
  //
  // WHY. Every clause above reads `tick.nextStopLineM`, and the runtime keeps
  // only lines AHEAD of the car's centre (`worldRuntime.ts`, `d >= 0`). The
  // frame the centre is over the line the tick loses the line, its distance and
  // its lamp all at once, so the detector's twelve-metre window was really a
  // window that ENDED at the line — and stopping with the nose in the mouth, the
  // commonest way a hesitant learner stops, was unconvictable by construction.
  //
  // THE ANSWER READS THE CROSSING INSTEAD OF THE LAMP. `hesitationGreenEntry`
  // is written by the `stopLineCrossed` event (only on a green lamp the
  // approach was permitted to take), and this arm lives for exactly the same
  // `hesitationMaxLineDistM` on the far side of the line that the arm above has
  // on the near side — one number, both sides, no new threshold. The latch
  // dies the moment the car is farther than that from where it crossed, or the
  // moment the runtime reports ANY stop line inside the near-side window again
  // (a car that reversed back over the line, or a second junction's line close
  // ahead): the near-side arm, which sees the live lamp, owns those frames.
  //
  // WHAT IT CANNOT SEE, WRITTEN DOWN: the lamp after the crossing. A car that
  // entered on green and froze in the mouth while the phase turned amber is
  // still convicted here — and should be: once lawfully over the line the duty
  // is to clear the junction, not to stand in it, and the catalogue's
  // «Светна зелено, пътят пред теб беше свободен, а ти остана на място» is true
  // of him. The code, its severity and its Наредба № 38 citation are unchanged.
  //
  // A12 — IT ADDS TWO ACQUITTALS THE NEAR SIDE NEVER NEEDED. Past the line the
  // car is in the mouth, where the reasons to stand still multiply: a person on
  // the exit crossing (`vruAheadM` inside `townCrawlClearAheadM`, the engine's
  // existing „close enough ahead to be the reason" band) and any hazard-shaped
  // event inside the harsh-brake cooldown (a priority conflict, an emergency
  // vehicle). Every clause the near-side arm carries — indicator, lead, queued
  // exit, crossing zone, stall, gear — is shared below unchanged, so a left
  // turn waiting on oncoming traffic with its indicator on is acquitted on both
  // sides exactly alike.
  //
  // NOT WIDENED, and reported instead: either window's DEPTH. A freeze 17 m
  // short of the same green (y = −45) books nothing, and neither does one 15.7
  // m into the mouth (y = −12). No frame in this corpus photographs either, and
  // this file's discipline is that an unphotographed neighbour is reported, not
  // widened into.
  const nearLineWindow =
    tick.nextStopLineM !== undefined && tick.nextStopLineM <= cfg.hesitationMaxLineDistM;
  const greenEntry = s.hesitationGreenEntry;
  if (
    greenEntry !== null &&
    (nearLineWindow ||
      Math.hypot(tick.position.x - greenEntry.x, tick.position.y - greenEntry.y) >
        cfg.hesitationMaxLineDistM)
  ) {
    s.hesitationGreenEntry = null;
  }
  const atGreenLine =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState === "green" &&
    nearLineWindow;
  const pastGreenLine =
    s.hesitationGreenEntry !== null &&
    (tick.vruAheadM === undefined || tick.vruAheadM > cfg.townCrawlClearAheadM) &&
    (s.lastHazardEventAt === null || t - s.lastHazardEventAt > cfg.harshBrakeHazardCooldownSec);
  const hesitating =
    (atGreenLine || pastGreenLine) &&
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
  //
  // ── 2026-10-03 · THE CLOSING CAUSE, RE-ASKED (`sc-follow-tailgater:63c0c28c`
  // C2a and `:f42dce4f`) ──────────────────────────────────────────────────────
  // MEASURED, through the lesson's own session at 2.5 / 2.8 / 4 / 10 / 30 / 60 /
  // 120 Hz: the drill's brake check — 58 км/ч, the лепка 5–7 m behind, a 9.4
  // m/s² stamp to rest — was acquitted by THIS clause and by nothing else
  // (knocked out, all seven rates convict). The vehicle it read was the FRONT
  // lead, `FTG_LEAD`, a constant 11.5 m/s cruiser 80–90 m ahead; the student
  // closes on it at ~4.6 m/s only because he is faster than it. Two defects:
  //  1. «closing ≥ 3 m/s at any distance» calls a car 86 m ahead that nobody
  //     has to brake for a reason to brake as hard as the car can. Closing on a
  //     steady lead at 4.6 m/s from 86 m needs 0.13 m/s² — a lift of the pedal.
  //     The founding example was a lead that BRAKES; this clause could not tell
  //     it from a student who is simply quicker than the car in front.
  //  2. it read `gapOpeningMps`, a one-frame difference, and froze it with the
  //     sticky `causeSeen`, so the same stop was acquitted at 10–120 Hz and
  //     convicted at 2.5–4 Hz whenever the brake fell late in the frame.
  // ROUND 1 MADE THE LEAD A CAUSE BEYOND `harshBrakeClearLeadGapM` IN TWO WAYS
  // (round 2 below adds three and moves the demand line), each measured over
  // `LEAD_TRACK_WINDOW_SEC` (`leadCauseReadings`):
  //  - IT IS BRAKING: its own speed falling at `BRAKING_LINE_MPS2` or more,
  //    within `harshBrakeSignalCauseM` — the reach this ledger already gives a
  //    visible forbidding light. That is the founding example, kept at a range
  //    the old clause also covered, and it is the lead's speed, not the gap's:
  //    a student merely faster than a steady car reads 0.
  //  - THE CLOSING MAKES YOU BRAKE: a driver reacting after `LEAD_REACTION_SEC`
  //    would need braking to stop it before the gap is gone (round 1 drew that
  //    line at 2 m/s²; round 2 draws it at `LEAD_DEMAND_LINE_MPS2`). Inside 45 m
  //    nothing changes — the distance clause acquits first, as it always did.
  // A car BEHIND is in neither: `leadGapFor` only looks forward.
  //
  // ── ROUND 2 · WHEN THE LEDGER CANNOT SEE THE LEAD, THE LEAD IS A CAUSE
  // (verifier R1, integrator rulings R2-a…R2-d) ──────────────────────────────
  // Round 1 emptied the track on any null frame, so for 0.5 s (closing) and
  // 1.0 s (the lead's own deceleration) after a blink the lead read as no
  // cause — and a lawful hard stop for a lead braking 6 m/s² 67–103 m ahead was
  // billed 35/35 after ONE null frame or a ±2.5° weave of the student's heading.
  // A12 says an unknown is spent on the acquittal, so the lead is now a cause
  // beyond 45 m whenever ANY of these holds:
  //  - R2-a, A BLINK IS NOT AN ABSENCE: a null frame within
  //    `LEAD_TRACK_WINDOW_SEC` of the last reading is bridged — the lead counts
  //    at its last gap with the verdict it last had (`leadMemory.heldCause`);
  //  - R2-a, UNREAD: a lead within `harshBrakeSignalCauseM` whose windowed
  //    readings are not built yet (a track starting or re-starting);
  //  - R2-b, MEMORY: a lead seen braking — or whose closing was seen demanding
  //    the line (the closing before the pedal, see the constant) — within
  //    `LEAD_CAUSE_MEMORY_SEC`, or one
  //    that ENTERED the corridor within `LEAD_ENTRY_MEMORY_SEC` — a car pulling
  //    out ahead is a plausible surprise;
  //  - R2-c, DEMAND: its closing demands `LEAD_DEMAND_LINE_MPS2` (0.5 — a lift of
  //    the throttle) or more. The old closing FLOOR (`harshBrakeClosingLeadMps`,
  //    3 m/s) is gone from the ledger: beyond 45 m the demand line implies a
  //    closing of at least 6.2 m/s (c² + c·T_R·2·0.5 ≥ 2·0.5·45), so the floor
  //    could never decide a verdict (verifier survivor V1) — a predicate nothing
  //    can make true or false is not kept (round 4 brings the line back, windowed,
  //    for a lead BEYOND the reach only, where it does decide — see below);
  //  - IT IS BRAKING: its own speed falling at `BRAKING_LINE_MPS2` or more. R2-d
  //    pins the line: a lead braking 2.5 m/s² beyond 45 m acquits at every rate.
  //
  // ── ROUND 3 · A LEAD BRAKING HARD IS A CAUSE AT ANY RANGE (verifier F1,
  // integrator ruling) ─────────────────────────────────────────────────────────
  // Rounds 1–2 asked «is it braking?» only within `harshBrakeSignalCauseM`, so
  // beyond 120 m the only lead cause left was the CURRENT closing's demand,
  // which lags a braking lead: a lead braking 6–8 m/s² 125–200 m ahead was billed
  // in up to 42/42 cells where base billed none. Base's own words were «a lead
  // braking hard 50 m ahead is exactly what must be responded to», and it
  // acquitted at any distance. The reach had also been hiding noise (verifier
  // C2): the drill's steady `FTG_LEAD` read ≥ 2 m/s² 130–140 m ahead at 2.8 and
  // 10 Hz — measured, the one-frame position step the traffic system makes when
  // it finishes an actor at its path end (see `leadCauseReadings`). So the lead
  // is braking when EITHER
  //  - the FAR reading (`leadDecelFarMps2`, which no single forward position
  //    step can raise) is at the line — at ANY range the lead channel reports;
  //  - or the QUICK reading (`leadDecelMps2`, 0.5 s sooner) is, within the reach
  //    (as in rounds 1–2), and beyond it only until the far reading exists — a
  //    track younger than its 2.5 s (from 1.0 s on, when the quick reading
  //    exists). Without that, a lead first seen 1.7 s before it was stamped for,
  //    braking 6 m/s² 150 m ahead, acquitted on a phone (whose late bill let
  //    the far reading arrive first) and convicted on a desktop: this row's own
  //    split. The quick reading's step noise acquits: the A12 side.
  // The braking MEMORY is stamped from the same verdict, so it reaches past
  // 120 m too.
  //
  // ── ROUND 4 · BEYOND 120 m, BASE-LIKE ACQUITTAL (round-3 verifier R1/R2,
  // integrator ruling) ─────────────────────────────────────────────────────────
  // Round 3 kept UNREAD and ENTRY inside the reach, so beyond it a braking lead
  // was a cause only once its track was long and unbroken (quick reading 1.0 s,
  // far 2.5 s). One dropped frame on a 2.5–2.8 Hz phone (C1 restarts the track)
  // or a mild heading weave (in the corridor in stretches under a second) then
  // billed a lawful stop for a lead braking 6 m/s² 125–200 m ahead, where base
  // acquitted; and the far reading's lag billed a 2.5 m/s² lead at a 0.75 s
  // reaction on desktops only. The row needs a conviction only INSIDE the reach
  // (the drill's `FTG_LEAD` sits at 74–95 m), so inside it everything above
  // stands exactly, and BEYOND it a lead in the channel is a cause when ANY of:
  //  - its closing is `harshBrakeClosingLeadMps` (3 m/s) or more — base's own
  //    line, now measured from the lead track instead of a frame (round 4 over
  //    `LEAD_TRACK_WINDOW_SEC`; round 5 with no averaging lag — see below);
  //  - its deceleration reading is at the braking line (the ruling says quick OR
  //    far; the far reading could decide nothing here and is not asked — see the
  //    code — and the quick reading's step noise acquits: the A12 side);
  //  - its readings are not built yet — a young track, after a restart or an
  //    entry (a blink within the window is bridged with the verdict it last had);
  //  - the memories: an entry within `LEAD_ENTRY_MEMORY_SEC`, a braking or a
  //    closing reading within `LEAD_CAUSE_MEMORY_SEC` — the closing the driver
  //    reacted to is the one before the pedal, exactly as round 2's demand: a
  //    9.4 m/s² stamp takes 1.5 m/s off a 4.6 m/s closing's window within 0.4 s,
  //    and a phone whose first braking frame lands late would read it under the
  //    line. They are read only while the ledger's lead is beyond the reach or
  //    gone (`leadMemory`), so none reaches in.
  // ROUND 5 (round-4 verifier F1, integrator ruling N2): the closing that sets
  // `farClosingAt` is the closing NOW (`leadClosingNowMps`) — the student's speed
  // on this tick minus the lead's current speed, and over the last frame his mean
  // speed minus the lead's at its midpoint — not the window's mean, which ran
  // 0.25 s behind a closing that was still rising (a student speeding up toward a
  // steady far lead, or a far lead slowing under the braking line) and billed
  // stops base acquitted. Same 3 m/s line, same 1.0 s memory.
  // Beyond 120 m nothing convicts that base acquitted. This acquits a brake
  // check whose only lead is beyond 120 m and closing fast — on the recorded
  // w71/w69 wrong legs that is stops 2 AND 3 (`FTG_LEAD` 130–140 m ahead,
  // closing 4.6 m/s; stop 1, at the tailgater, has it 70–77 m ahead and is
  // graded) — the same verdict at every rate.
  // ROUND 3's OWN BEYOND-THE-REACH CLAUSES in `leadBraking` below (the far
  // reading at any range, the quick reading while the far one is young, the
  // braking memory stamped past the reach) are kept as round 3 has them, but
  // this block subsumes them beyond the reach: mutating any of them now moves
  // no verdict (recorded in the round-4 report).
  // What still convicts beyond 45 m is a lead INSIDE the reach that has been in
  // the corridor for more than 2 s, is read, is not braking and has not braked
  // for a second, and whose closing a lift of the throttle absorbs — the drill's
  // `FTG_LEAD` — or one beyond it that is read, steady, not new and closing under
  // 3 m/s.
  const signalAheadForbids =
    tick.nextStopLineControl === "trafficLight" &&
    tick.nextStopLineState !== undefined &&
    tick.nextStopLineState !== "green" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= cfg.harshBrakeSignalCauseM;
  const leadBridged = leadGapM === null && s.leadTrack.length > 0;
  const ledgerLeadGapM = leadBridged ? s.leadTrack[s.leadTrack.length - 1].gapM : leadGapM;
  let leadIsCause = false;
  if (leadGapM !== null) {
    const leadReadings = leadCauseReadings(s.leadTrack, t, s.leadOdoM, leadGapM);
    const leadInReach = leadGapM <= cfg.harshBrakeSignalCauseM;
    const leadUnread =
      leadInReach && (leadReadings.closingMps === null || leadReadings.leadDecelMps2 === null);
    const leadClosingDemands = leadReadings.demandMps2 >= LEAD_DEMAND_LINE_MPS2;
    const leadBraking =
      (leadReadings.leadDecelFarMps2 !== null && leadReadings.leadDecelFarMps2 >= BRAKING_LINE_MPS2) ||
      ((leadInReach || leadReadings.leadDecelFarMps2 === null) &&
        leadReadings.leadDecelMps2 !== null &&
        leadReadings.leadDecelMps2 >= BRAKING_LINE_MPS2);
    if (leadBraking) s.leadMemory.brakingAt = t;
    if (leadClosingDemands) s.leadMemory.demandAt = t;
    // Round 4, beyond the reach (see above). The closing and the braking verdicts
    // speak through their memories, stamped HERE and read below on this same frame
    // (`memoryAskedAt` ≤ t, and `farMemoryApplies` holds for a lead beyond the
    // reach) — so a live arm beside each stamp would decide nothing the stamp does
    // not (mutation: removing it failed no test, and the batteries and replays grade
    // identically without it). Only UNREAD, which
    // has no memory, is a live verdict, and the one a bridged blink holds.
    // The braking reading here is the QUICK one only. The ruling names «quick OR
    // far»; the far reading was built and removed: it crosses the line 0.5 s after
    // the quick one on every braking profile (it reads the same drop one window
    // later) and the braking memory spans 1.0 s, so it could decide no verdict
    // beyond the reach (mutation: off, 0 of 297 target tests failed; built with
    // and without it, the three verifier batteries — 1,680 acts × 42 cells — and the
    // 181 recorded replays grade identically).
    let farLeadIsCause = false;
    if (!leadInReach) {
      const farUnread = leadReadings.closingMps === null || leadReadings.leadDecelMps2 === null;
      if (leadReadings.leadDecelMps2 !== null && leadReadings.leadDecelMps2 >= BRAKING_LINE_MPS2) s.leadMemory.farBrakingAt = t;
      const farClosingNowMps = leadClosingNowMps(s.leadTrack, t, s.leadPosOdoM, leadGapM, Math.abs(speed) / 3.6, studentFrameMeanMps, dt);
      if (farClosingNowMps !== null && farClosingNowMps >= cfg.harshBrakeClosingLeadMps) s.leadMemory.farClosingAt = t;
      farLeadIsCause = farUnread;
    }
    leadIsCause = leadUnread || leadClosingDemands || leadBraking || farLeadIsCause;
    s.leadMemory.heldCause = leadIsCause;
  } else if (leadBridged) {
    leadIsCause = s.leadMemory.heldCause;
  }
  // The memory is asked at the START of this frame's span, not its end: the pedal
  // fell somewhere inside the frame and the reducer cannot know where, so a frame
  // any part of which lies inside the memory is covered — at 2.5 Hz a stamp one
  // second after the lead was last seen braking would otherwise first be judged
  // 1.4 s after it, and acquitted only on a desktop. Clamped at the window, so a
  // resume after a pause does not stretch the memory back over the pause.
  const memoryAskedAt = t - Math.min(Math.max(dt, 0), LEAD_TRACK_WINDOW_SEC);
  const leadRemembered =
    (s.leadMemory.brakingAt !== null && memoryAskedAt - s.leadMemory.brakingAt <= LEAD_CAUSE_MEMORY_SEC) ||
    (s.leadMemory.demandAt !== null && memoryAskedAt - s.leadMemory.demandAt <= LEAD_CAUSE_MEMORY_SEC) ||
    (s.leadMemory.enteredAt !== null && memoryAskedAt - s.leadMemory.enteredAt <= LEAD_ENTRY_MEMORY_SEC);
  // Round 4: the far memories speak only while the ledger's lead (read or
  // bridged) is beyond the reach, or nobody is in the channel at all.
  const farMemoryApplies = ledgerLeadGapM === null || ledgerLeadGapM > cfg.harshBrakeSignalCauseM;
  const farLeadRemembered =
    farMemoryApplies &&
    ((s.leadMemory.farEnteredAt !== null && memoryAskedAt - s.leadMemory.farEnteredAt <= LEAD_ENTRY_MEMORY_SEC) ||
      (s.leadMemory.farBrakingAt !== null && memoryAskedAt - s.leadMemory.farBrakingAt <= LEAD_CAUSE_MEMORY_SEC) ||
      (s.leadMemory.farClosingAt !== null && memoryAskedAt - s.leadMemory.farClosingAt <= LEAD_CAUSE_MEMORY_SEC));
  const noBrakeCause =
    (ledgerLeadGapM === null || ledgerLeadGapM > cfg.harshBrakeClearLeadGapM) &&
    !leadIsCause &&
    !leadRemembered &&
    !farLeadRemembered &&
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
  if (accelMps2 <= -BRAKING_LINE_MPS2 && !noBrakeCause) {
    s.harshBrake.causeSeen = true;
  }
  // THE SUSTAIN IS NOT A RUN OF FRAMES — TWO GATES, AND EACH COVERS THE OTHER'S
  // FAILURE (2026-08-29 · `sc-follow-tailgater:f42dce4f`, „same script,
  // opposite verdicts by platform").
  //
  // WHAT WAS MEASURED. The shipped shape armed on the first frame whose
  // windowed decel reached `harshBrakeDecelMps2` and set `activeSince = null`
  // on ANY frame that did not, so the 0.4 s had to be paid in CONSECUTIVE
  // qualifying frames. The quantity being thresholded is `accelMps2`, whose
  // residual noise `types.ts` puts at ~0.42 m/s² at 120 fps — `accelWindowSec`
  // is 0.04 s and is deliberately short, because smoothing is lag and 0.15 s
  // already silences two authored panic-brake demos. So the reading jitters
  // across the 7 line, and the number of frames that must ALL land on the
  // conviction side is the frame rate times 0.4: twelve on a phone, forty-eight
  // on a desktop. The reducer is pure and carries no platform branch, so a
  // split can only come from the tick rate — and it does. One honest stop from
  // 50 км/ч, folded through `reduceTick` at four rates with the same
  // alternating 0.06 км/ч wobble the M-18 suite calls the driveline's noise
  // floor (`__tests__/accel-window.test.ts`), graded by the shipped code:
  //
  //     decel 7.2 m/s²          20 Hz ·      30 Hz FIRE   60 Hz ·   120 Hz ·
  //     decel 7.5 m/s²          20 Hz FIRE   30 Hz FIRE   60 Hz FIRE 120 Hz FIRE
  //     decel 7.5, wobble 0.12  20 Hz ·      30 Hz FIRE   60 Hz ·   120 Hz ·
  //
  // A 7.5 m/s² stop is emergency-grade by this file's own definition and it is
  // held for 1.85 s — four and a half times the sustain — and the desktop
  // acquits it. That is the row, and it is a REQUIREMENT-ZERO failure before it
  // is a scoring one: the student who slammed the pedal is told nothing
  // happened, on the only honest screen in the product.
  //
  // GATE 1 — ACCRUED QUALIFYING SECONDS, the `accrue` discipline this file
  // already applies at `SPEEDING_SUSTAIN_ACCRUES` and `BUS_LANE_REGRADE_SEC`,
  // for the reason each of them gives: the fault's own shape is not a run of
  // frames. A frame that does not qualify no longer ZEROES the clock, it just
  // credits nothing.
  //
  // GATE 2 — THE MEAN OVER THE OPEN WINDOW must itself be emergency-grade, and
  // the window RE-ANCHORS on any frame where neither the instantaneous test nor
  // the mean holds. A window that has already lost the mean cannot regain it by
  // growing older, and re-anchoring (rather than closing) is what lets a real
  // emergency stop that FOLLOWS a long gentle brake inside one pedal
  // application still be seen.
  //
  // WHY BOTH, WHICH IS THE WHOLE POINT — each was built alone first and each
  // alone was wrong, measured rather than argued:
  //  · THE ACCRUAL ALONE convicts a 6.99 m/s² stop — one UNDER the line — at
  //    20/60/120 Hz and not at 30, because half of a jittering sub-threshold
  //    signal still crosses the line and half of a long stop is plenty of
  //    credit. That is a fresh false positive AND a fresh platform split, i.e.
  //    it does not even close the row.
  //  · THE MEAN ALONE passes the entire A12 battery and makes all four rates
  //    agree, but it has no answer for a signal whose frames straddle the line
  //    only because the STOP is long: it would have to be paired with the very
  //    consecutive-frame rule being removed. It is also the gate that has to
  //    carry the exact-tie problem — see `HARSH_BRAKE_TIE_TOLERANCE`.
  // Together: the accrual answers „was this held long enough", without caring
  // how the frames were cut up; the mean answers „was it actually this hard",
  // which is the question a sub-threshold stop must fail however long it lasts.
  //
  // A12, measured across 20 / 30 / 60 / 120 Hz rather than asserted, with the
  // wobble at 0, 0.06 and 0.12 км/ч. EVERY row is now unanimous across the four
  // rates, which is the property the row asks for. Silent everywhere on: 4, 5,
  // 6.99 and 7.00 m/s² constant stops (including a 4 s one from 90 км/ч), a
  // 0.25 s-ramped 5 m/s² stop, and a 5 m/s² stop carrying one 7.5 m/s² spike
  // frame. Convicting everywhere on: 7.01, 7.2, 7.5 and 9 m/s² constant stops,
  // 7.5 and 9 ramped, and a 9 m/s² emergency stop following two seconds of
  // 5 m/s² braking inside one pedal application. The boundary is decided by the
  // rule and not by a rounding mode: 7.00 acquits, 7.01 convicts, at every rate
  // and every wobble. `__tests__/false-positives.test.ts` is the contract and is
  // unmoved, and so are the 247 rules/orchestrator/traces files around it.
  const causelessBraking = accelMps2 <= -BRAKING_LINE_MPS2 && noBrakeCause && !s.harshBrake.causeSeen;
  if (causelessBraking) {
    const openWindow = s.harshBrake.activeSince;
    const heldSec = openWindow === null ? 0 : t - openWindow;
    // The mean only JUDGES a window long enough to average: over a span shorter
    // than the sustain the jitter has not divided away yet, and testing it
    // there re-anchored on early noise and threw the accrual away with it —
    // measured, that alone put 7.2 and 7.5 m/s² stops back to firing on the
    // phone and not the desktop, i.e. it reopened the row it was fixing.
    // AND THE LINE IS EXCLUSIVE, WITH A RELATIVE TOLERANCE, BECAUSE OTHERWISE
    // FLOATING POINT PICKS THE VERDICT. That is measured here, not feared:
    // `orchestrator/__tests__/helpers.ts` `PolyDriver.advance` brakes at a
    // limit of 7 m/s², which IS `harshBrakeDecelMps2`, so every fixture-driven
    // slow-down in that suite decelerates exactly ON the threshold — and
    // instrumented on the make-way leg of `emergency-approach.test.ts`,
    // seventeen consecutive frames all reading `a = -7.0000` had
    // `accelMps2 <= -7` answer TRUE on six of them and FALSE on eleven. A
    // deceleration that merely EQUALS the line is the ambiguous case, and A12
    // says an ambiguity is spent on the acquittal; the tolerance is what makes
    // that answer the same one every time instead of a rounding mode's. It is
    // relative and 1e-9 — twelve orders of magnitude over the ~1e-15 relative
    // drift of these sums and eleven under any deceleration a car produces, so
    // it can only ever decide the exact tie.
    const meanIsEmergencyGrade =
      openWindow !== null &&
      heldSec >= cfg.harshBrakeSustainSec &&
      (s.harshBrake.onsetKmh - speed) / 3.6 >
        cfg.harshBrakeDecelMps2 * heldSec * (1 + HARSH_BRAKE_TIE_TOLERANCE);
    if (openWindow === null || (heldSec >= cfg.harshBrakeSustainSec && !meanIsEmergencyGrade)) {
      // Open, or re-anchor. `onsetKmh` is the ANCHOR FRAME's own speed and not
      // `prevSpeedKmh`: both ends of the mean have to be samples this reducer
      // actually holds, or the span is a guess. The first draft paired
      // `prevSpeedKmh` with an estimate of the missing leg taken from the
      // CURRENT `dt`, and `false-positives.test.ts` refused it inside a minute
      // on „entering a lower-limit zone while already braking down to it" —
      // 88 → 87 → 57 → 53 on frames of 1 s, 1 s, 0.5 s, where the estimate
      // understated the span by half and read a lawful 6.3 m/s² deceleration as
      // 9.4. The cost is that the `harshBrakeMinSpeedKmh` floor now reads the
      // anchor frame rather than the one before it: one frame (~0.1 км/ч) at
      // render rates, and at the coarse replay rates the LOWER of the two
      // readings, which is the acquitting one.
      if (openWindow === null) {
        // A NEW pedal application: the last one's floored record is spent
        // (its follower window is its own — see „THE FLOOR LIFTS" below). A
        // re-anchor inside the same application keeps it.
        s.harshBrake.flooredSince = null;
        s.harshBrake.flooredAt = null;
        s.harshBrake.flooredBilled = false;
      }
      s.harshBrake.activeSince = t;
      s.harshBrake.onsetKmh = speed;
      s.harshBrake.qualifiedSec = 0;
      s.harshBrake.lastQualAt = null;
    }
    if (harshDecel) {
      // EACH QUALIFYING FRAME IS WORTH ITS OWN FRAME AND NEVER THE GAP BEFORE
      // IT — `min(t - lastQualAt, dt)`. Consecutive frames credit wall time, so
      // a coarse replay bills on the second qualifying frame exactly as the
      // shipped consecutive-frame sustain did; a frame standing alone after a
      // dip credits one frame and not the dip.
      //
      // THE FIRST QUALIFYING FRAME IS WORTH THE SPAN ITS OWN READING COVERS
      // (2026-10-03, `sc-follow-tailgater:f42dce4f`). It used to credit nothing,
      // which made an isolated spike worthless — and made the first whole FRAME
      // of an emergency stop on a phone worthless too. Measured through the
      // lesson's session, the drill's brake check (a 9.4 m/s² stamp held 0.6 s,
      // then 5.8 to rest) at 2.8 Hz: the pedal lands inside a 0.357 s frame
      // whose reading is still −8.1, the next reads −8.75 and the rest −5.8 —
      // a full 0.714 s of frames at emergency grade, of which the old rule
      // credited 0.357 against the 0.4 s sustain. Acquitted at 2.8 Hz, convicted
      // at 10–120 Hz: the same act graded by the frame rate. A qualifying
      // reading IS the mean deceleration over [accelAnchor.t, t], so that span is
      // time the car genuinely spent at emergency grade, at any rate. At render
      // rates it is `accelWindowSec` (0.04 s) — a lone spike is still worth a
      // tenth of the sustain and nothing more; on a coarse feed it is the frame.
      // Nothing is billed off it alone: the MEAN gate (heldSec ≥ the sustain,
      // the mean over the open window emergency-grade) still has the last word,
      // which is why the 1 s fixture «88 → 87 → 57 → 53» — one 8.3 m/s² second,
      // then 2.2 — stays acquitted: its window opens on the 57 frame and the
      // mean it must hold from there is 2.2.
      s.harshBrake.qualifiedSec +=
        s.harshBrake.lastQualAt === null
          ? accelAnchor === null
            ? 0
            : Math.max(0, Math.min(t - accelAnchor.t, 2))
          : Math.max(0, Math.min(t - s.harshBrake.lastQualAt, Math.min(dt, 2)));
      s.harshBrake.lastQualAt = t;
    }
    if (!s.harshBrake.emitted && s.harshBrake.qualifiedSec >= cfg.harshBrakeSustainSec && meanIsEmergencyGrade) {
      if (s.harshBrake.onsetKmh >= cfg.harshBrakeMinSpeedKmh) {
        s.harshBrake.emitted = true;
        events.push(makeViolation("HARSH_BRAKING_NO_CAUSE", t));
      } else {
        // Causeless and emergency-grade by every gate — the floor ALONE
        // acquits it. Recorded for „THE FLOOR LIFTS" below; nothing is billed
        // here, and without a close follower's report nothing ever is.
        if (s.harshBrake.flooredSince === null) s.harshBrake.flooredSince = s.harshBrake.activeSince;
        s.harshBrake.flooredAt = t;
      }
    }
  } else if (accelMps2 > -BRAKING_LINE_MPS2) {
    // Pedal released (or a cause appeared and braking eased) — re-arm.
    s.harshBrake.activeSince = null;
    s.harshBrake.emitted = false;
    s.harshBrake.causeSeen = false;
    s.harshBrake.qualifiedSec = 0;
    s.harshBrake.lastQualAt = null;
  } else {
    // Still braking but a plausible cause exists now — never fire this episode.
    s.harshBrake.activeSince = null;
    s.harshBrake.qualifiedSec = 0;
    s.harshBrake.lastQualAt = null;
    // …on either basis: the cause exempts the whole application (C3), so a
    // floored record of it is no longer a causeless brake.
    s.harshBrake.flooredSince = null;
    s.harshBrake.flooredAt = null;
  }

  // THE FLOOR LIFTS FOR A FOLLOWER IT PUT AT RISK (2026-10-09 ·
  // `sc-follow-tailgater:63c0c28c` C1/C2a, critical).
  //
  // WHAT WAS MEASURED. `harshBrakeMinSpeedKmh` (35) says a causeless stab from
  // lower is „clumsy, not dangerous". The rig-w2 judge photographed the case
  // where it is false: a full-pedal brake check at the лепка of
  // `sc-follow-tailgater` (−9.3 … −9.6 m/s², the car 8.5–8.9 m behind) from
  // 32.3–34.9 км/ч escaped entirely — no card, «ИЗДЪРЖАН» ★★★, «Чисто и
  // спокойно каране» — while the same pedal from 38.4 км/ч failed the lesson.
  // The lesson's own task 1 asks for under 36, so the student who OBEYS it is
  // the one the floor hides. Re-measured at c38086a through the live rung
  // chain (`follow-tailgater-brake-check-under-floor.test.ts`): from 32.3 and
  // 34.9 км/ч the glued лепка itself braked at a mean 9.7–10.0 m/s² over 0.4 s,
  // and on 23 of 40 drives — every one where it was still glued behind him —
  // nothing was billed.
  //
  // THE RULE, ON THE FOUNDER'S PRINCIPLE AND NOT A NEW SPEED. He ruled twice
  // (2026-09-30, 2026-10-05) that a conviction about another car rests on what
  // that car ACTUALLY had to do. So the floor is not moved; it is lifted for
  // ONE brake: a causeless episode that is emergency-grade by every gate above
  // (the cause ledger, the mean and the accrual — untouched) and that the floor
  // ALONE acquitted is billed when a close follower reports, on its own
  // account, that it had to brake HARD (`followerBraked`, re-checked here by
  // `isHarshBrakeWindow` against this config — the same line the student's own
  // brake is judged at, 7 m/s² held 0.4 s). Only the staged runner of a car
  // glued behind him in his lane publishes it (`RearTailgaterRunner`), so every
  // lesson without one keeps the 35 км/ч floor exactly.
  //
  // THE WINDOW — DERIVED, NOT TUNED. The follower's report must fall on or
  // after this episode's window start (it is answering HIS brake, not braking
  // on its own before it), and no later than its own hard stop after his last
  // emergency-grade frame: `speedMps / harshBrakeDecelMps2`, the speed it had
  // shed at the harsh line — the window the forced-braking bill already uses
  // for a vehicle answering him (`laneEntryAnswer`). For the лепка at 9.0–9.7
  // m/s that is 1.29–1.39 s. One bill per pedal application (`flooredBilled`);
  // `emitted` is set while the pedal is still down, so the praise gates read
  // the episode as billed exactly as for a bill from over the floor.
  //
  // NO SEPARATE „is it still inside the window NOW" TEST (round 2: a mutant
  // showed it could not fail, so it was removed rather than pinned). Every
  // field this condition reads changes only on a frame where it is set to that
  // frame: a report sets `followerForcedAt = t` (handleTickEvent runs before
  // this block in the same reduceTick), a floored frame sets `flooredAt = t`,
  // and every other write nulls `flooredSince` (the new pedal, the cause). So
  // the condition can only turn true on a frame where `t` IS the report time
  // (bounded by the window conjunct) or IS `flooredAt` (inside its own window,
  // `followerAnswerSec` ≥ 0) — and it bills on that frame.
  {
    const hb = s.harshBrake;
    if (
      hb.flooredSince !== null &&
      hb.flooredAt !== null &&
      !hb.flooredBilled &&
      hb.followerForcedAt !== null &&
      hb.followerForcedAt >= hb.flooredSince &&
      hb.followerForcedAt <= hb.flooredAt + hb.followerAnswerSec
    ) {
      hb.flooredBilled = true;
      if (hb.activeSince !== null) hb.emitted = true;
      events.push(makeViolation("HARSH_BRAKING_NO_CAUSE", t));
    }
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
  // TWO GATES, and they answer different questions — see each one's block.
  // GATE 1 stops a driver who has ALREADY been billed and has not corrected
  // from accumulating "clean" distance at all (the shipped behaviour, plus the
  // dip-hole the speed-band accrual opened under it). GATE 2 holds the PAYOUT
  // while a breach is live but has not yet run its sustain, so praise can no
  // longer be minted from the metres a fault is being committed on.
  const EPISODES = [
    // The episodes the two gates below read. Both arguments, the frames and
    // every measurement live on `billedAndUncorrected` and
    // `breachAwaitingSustain` under the list.
    s.speedingMinor,
    s.speedingDangerous,
    s.seatbelt,
    s.handbrake,
    s.headlights,
    s.laneKeeping,
    s.conditionsSpeed,
    // 2026-09-25 — the task ceiling (TASK_SPEED_CAP_EXCEEDED): a car billed over
    // «задачата иска ≤N» and not yet back at N banks no clean metres, the
    // contract every row on this list keeps.
    s.taskCap,
    s.rainLights,
    s.fogLights,
    // O28: without this row a snow drive that is STILL unlit keeps banking
    // CLEAN_DRIVING metres while its own violation stands open — the reassuring
    // direction again, and a commendation is credit read off the debrief.
    s.snowLights,
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
    // THE TOWN HALF OF THE SAME ENVELOPE (`sc-vu-emergency-junction:853790f7`).
    // `DRIVING_TOO_SLOW_IN_TOWN` landed with its motorway twin one line up
    // already on this list, and was never added to it. MEASURED through this
    // reducer, 10,5 км/ч held on a street posted 40 for 150 s: bill at 23 s,
    // re-grade at 33 s — and then CLEAN_DRIVING at 118,8 s, minted from the
    // metres of the very crawl still standing convicted. „Drive at walking pace
    // forever" was not merely unpunished, it was commended. Same contract as
    // every row here: `emitted` means he was already billed, `activeSince`
    // means he is still doing it, and `townReset` (back at or above the floor)
    // clears both, so a student who picks the pace up earns again at once.
    s.townCrawl,
    s.emergencyLane,
    // 2026-08-30 (`sc-ac-truck-spray:7e53374c`, critical). The newest episode in
    // this file was the only one never added to this list, and the omission is
    // not cosmetic: `OFF_CARRIAGEWAY` bills a FINITE number of times per
    // excursion (one, until `OFF_CARRIAGEWAY_REGRADE_SEC` added the second), so
    // from the frame after the last bill a car that is still in the field was
    // indistinguishable here from a car on the road. MEASURED through this
    // reducer — 145 км/ч,
    // `edgeId: null` throughout, 40 s, which is the row's own exhibit
    // (`.audit-frames/w17/…/sc-ac-truck-spray__mobile-wrong/04-t102s.png`, „145
    // км/ч across open green field with no road anywhere in frame"):
    //   before  OFF_CARRIAGEWAY, then SIX × CLEAN_DRIVING
    //   after   OFF_CARRIAGEWAY, then none until the wheels are back on a road
    // One every 250 m of grass. At a lawful 60 км/ч over the same field it was
    // three. The conviction landed and the engine then congratulated the student
    // for the very metres it had just convicted him for, which is worse than the
    // silence this code was added to end: «Какво се получи добре: • Чисто и
    // спокойно каране» is read off the debrief as credit, and a student told to
    // hold that level is being taught to hold a field at motorway speed.
    //
    // TWO THINGS IT DELIBERATELY DOES NOT DO, both because they would move A12's
    // acquitting direction. (1) It is added to THIS gate only, never to
    // `breachAwaitingSustain`: that list is for states unlawful at every instant,
    // and `OFF_CARRIAGEWAY_SUSTAIN_SEC`'s own derivation says the 2 s is bought
    // by the full-flank excursion that is CORRECTED at once — so a second of this
    // condition can still be a correction in progress, and deferring a payout
    // through it would withhold credit from a drive that never bills. Measured:
    // a 1,5 s excursion inside a 60 s drive earns the same four commendations
    // before and after. (2) It clears the instant the runtime reports an edge
    // again — `stepEpisode`'s `reset` arm (`typeof tick.edgeId === "string"`)
    // nulls `emitted`, so recovering onto the road resumes the streak on the next
    // moving frame rather than ending it.
    //
    // THE ONE PLACE `emitted` IS NOT „billed", WRITTEN DOWN RATHER THAN GLOSSED:
    // the crash-swallow gate inside the detector's own fire branch (`crashCaused
    // Departure`) suppresses the EMIT and not the episode — it is deliberately on
    // the push so one crash cannot be re-billed frame after frame — so a
    // departure inside one sustain of an impact sets `emitted` with
    // no violation pushed. Praise is already off for the terminating case
    // (`s.terminated`), and the non-terminating one is a car that has just hit
    // something and is now in the verge — not a car earning a commendation. It is
    // an inclusion, not an oversight.
    s.offCarriageway,
  ] as const;
  /**
   * GATE 1 — BILLED AND NOT YET CORRECTED. The shipped meaning („fired-and-
   * ongoing"), plus the hole the accrual opened under it: the three speed-band
   * episodes null `activeSince` on any frame that dips below the band while
   * KEEPING their ledger (`SPEEDING_SUSTAIN_ACCRUES`), so a driver already
   * billed for speeding resumed banking clean metres on every dip. That is the
   * oscillating driver the accrual exists to catch, earning praise between the
   * bills it is earning. `qualifiedSec` is zeroed by `reset` — for the speed
   * band „back to the POSTED limit" — so a genuine correction still ends it on
   * the frame it happens. Measured, posted 50, 120 s of 53↔57 at 0,5 s:
   * 7 SPEEDING_OVER_LIMIT and now 0 CLEAN_DRIVING (was 4).
   *
   * `emitted &&` is load-bearing and the first cut of this repair dropped it:
   * on `qualifiedSec > 0` alone a driver who touched 57 in a 50 for ONE second
   * and settled at 52 was denied every commendation for the next FIVE MINUTES
   * (measured: 300 s, 0 praise, against 17 now), because 52 is inside the
   * grace and never trips the reset. Withholding credit the student earned is
   * the A12 direction this file does not move in.
   */
  const billedAndUncorrected =
    EPISODES.some(
      // `qualifiedSec` is optional in the parameter type because `harshBrake`
      // carries its own narrower shape (onsetKmh / causeSeen, no ledger) — it
      // never accrues, so the clause is vacuous for it by construction.
      (ep: { activeSince: number | null; emitted: boolean; qualifiedSec?: number }) =>
        ep.emitted && (ep.activeSince !== null || (ep.qualifiedSec ?? 0) > 0),
    ) ||
    // ROUND 8 (round-7 verifier R6) — a sign-bound blow's act still running
    // (`taskSignAct`: from the blow to the held M-16 correction, the cap ledger's
    // own record of it since round 14), whether its arrival waits or has billed.
    // Round 7 withheld only the PAYOUT while the arrival waited (GATE 2), so the
    // sign's grace band after it counted as clean metres (its H1: praise at 20.7
    // and 38.0 at 54 on a 50). The metres of that act are not clean ones, and they
    // are not banked for a payout after it either: once the act has ended under
    // M-16, the streak starts from that frame, by the base rules. (It can only
    // WITHHOLD praise — the cap adds, never removes.)
    s.taskSignAct !== null;
  /**
   * GATE 2 — A BREACH IS LIVE ON THIS FRAME BUT HAS NOT RUN ITS SUSTAIN YET.
   *
   * ── WHAT WAS PHOTOGRAPHED (w8 · `sc-ac-truck-spray:990e5f64`, critical) ────
   * Replaying `sweep161/sc-ac-truck-spray/pc-wrong`'s own logged profile
   * (14 · 58 · 85 · 99 · 110 · 116 · 129 км/ч, posted 140, heavy rain — its
   * `log.txt`) through this reducer produced **3 × CLEAN_DRIVING** at 15,2 /
   * 23,8 / 31,5 s and ONE SPEED_TOO_FAST_FOR_CONDITIONS at 32,2 s. The third
   * is minted at ~125 км/ч, two seconds into a breach of the 119 км/ч rain
   * envelope, from the very metres the fault was being committed on — and
   * `cleanDistanceM = 0` arrives 0,7 s too late to matter, because the praise
   * has already been emitted. Since that single bill is what the teach-first
   * free lesson spends (`SPEED_REGRADE_SEC`), `summary.mistakes` is EMPTY, so
   * `lessons/debrief.ts cleanDrivingScopeBg` — the rider written for exactly
   * this, gated on `mistakes.length > 0` — never attaches, and the page prints
   * «Какво се получи добре: • Чисто и спокойно каране ×3» over 131 км/ч in a
   * rainstorm, unqualified. The engine tells a seventeen-year-old to hold that
   * level.
   *
   * ── WHY IT DEFERS THE PAYOUT AND DOES NOT STOP THE ACCRUAL ────────────────
   * The first cut suppressed the ACCRUAL and broke two shadow gates —
   * `sc-merge-lane-end` and `sc-merge-roadworks-shift`, both FLAWLESS recorded
   * drives, lost their CLEAN_DRIVING outright. The metres before a breach
   * bills are genuinely earned if the breach never bills, and stopping the
   * accrual throws them away for good. So they are still banked; only the
   * PAYOUT waits while the question is open. If the condition drops before its
   * sustain the held metres pay out on the next moving frame — the drive is
   * byte-identical bar a few frames of delay; if it bills, `cleanDistanceM = 0`
   * wipes them, which is the answer the reset always intended and could never
   * deliver in time, because the praise had already left.
   *
   * ── AND WHY IT READS NINE EPISODES AND NOT ALL TWENTY-NINE ────────────────
   * Because the sustain does not mean the same thing in both halves of this
   * file, and reading them alike is what broke the shadows twice.
   *  · For these nine the state is unlawful AT EVERY INSTANT it holds — over
   *    the prudent envelope for the weather, over the graced limit, unbelted,
   *    handbrake dragging, lamps off in the dark or the rain. The sustain is a
   *    DEBOUNCE, there so a sampling blip cannot bill; it is not a licence.
   *    Metres driven in that state are not clean metres before the bill either.
   *  · For the rest the sustain IS the definition of the fault, and a second of
   *    the condition is ordinary driving. `laneKeeping`'s condition is TRUE for
   *    the whole of a lawful indicated lane change (`offCentre` carries no
   *    `maneuverDeclared` term — only `centerLineCond` does), and `keepRight`'s
   *    is true from the moment `sc-merge-lane-end`'s shadow completes its zip
   *    merge until it stops, 4 s later, WITHOUT EVER BILLING — measured, that
   *    one condition alone withheld the payout for the entire remainder of a
   *    faultless drive. Withholding credit a student earned is the A12
   *    direction this file does not move in, and a gate that can be held open
   *    to the end of a lesson by a condition that will never bill is that
   *    direction with the numbers hidden.
   * `curveSpeed` belongs to the first class by nature and is deliberately LEFT
   * OUT: it is the subject of an open false-positive row (`sc-sp-curve:
   * 45e7e4fb` — the card fires on a car that has left the carriageway), and
   * wiring a predicate under suspicion into a second consumer is how one wrong
   * conviction becomes two wrong surfaces.
   *
   * Measured after: truck-spray 2 × CLEAN_DRIVING (the 31,5 s one gone), all
   * 161 trace files green, every lawful control unchanged.
   *
   * What it deliberately does NOT close is named rather than papered over: the
   * two surviving commendations (92 and 111 км/ч) stand, because both are
   * under the posted 140 AND under the 119 rain envelope. What they are over
   * is the OBJECTIVE's «задачата иска ≤80», and no field on `SimTick` carries
   * it — see `SPEED_REGRADE_SEC`'s „THE TASK CAP" clause for why feeding it
   * here is a founder decision and not a bug fix.
   * The founder decided it on 2026-09-25: `SimTick.taskSpeedCap` now carries
   * it, and `s.taskCap` sits on this list and on GATE 1's.
   */
  const breachAwaitingSustain = [
    s.speedingMinor,
    s.speedingDangerous,
    s.conditionsSpeed,
    // 2026-09-25 — over the task's own gate is unlawful at every instant in the
    // sense this list means (the sustain is a debounce, not a licence), and it is
    // the half of the spray drive the paragraph above names as NOT closed: the
    // 92 and 111 км/ч commendations were minted over «задачата иска ≤80».
    s.taskCap,
    s.seatbelt,
    s.handbrake,
    s.headlights,
    s.rainLights,
    s.fogLights,
    s.snowLights,
  ].some((ep) => ep.activeSince !== null);
  // ROUND 8: no sign-bound clause here. Round 7 held the PAYOUT while an arrival
  // waited (`taskArrivalPending`); GATE 1 now stops the ACCRUAL for the whole
  // act (`taskSignAct`, which is open whenever an arrival waits), and the blow
  // frame itself voids the window (`taskLatchFresh`, below) — so no metre of
  // the act is ever banked and there is nothing here to hold. A clause would be
  // a predicate no frame could make true on its own.
  /*
   * …AND A NEW TASK LATCH VOIDS THE WINDOW IN PROGRESS (round 3, verifier R4).
   * The window open when the stamp first arrives is the one that covers the
   * blown mark: measured on round 2, 100 through the spray's ≤80 mark and then
   * 78 minted «Чисто и спокойно каране» at 23.1 s over y 266 → 517, the mark at
   * 450 crossed at 100 inside it — because a breach shorter than the task
   * code's 3 s sustain never bills, and GATE 2 only DEFERS a payout while it
   * runs. The objective has already refused that arrival (`approachCap:
   * "blown"`, speed over the gate plus its slack, past the mark), so the metres
   * spanning it are not clean metres; the blow is the breach, and it resets the
   * streak exactly as a bill does. It WITHHOLDS rather than scopes that one
   * window, because a rider saying „the praise is for the metres without a
   * violation" would be false about a window containing one. Windows paid out
   * before the mark stand (they end before it), and later ones start after it;
   * `lessons/debrief.ts` scopes both on a drive whose cap was blown.
   * Every drive with no task stamp — every recorder, replay, exam rung and
   * uncapped lesson — never sets `taskLatchFresh`, and is byte-identical.
   */
  if (events.some((e) => e.kind === "violation") || taskLatchFresh) {
    s.cleanDistanceM = 0; // any fresh mistake resets the streak
  } else if (!billedAndUncorrected && !s.terminated && moving && s.prevT !== null) {
    // Clamp dt so a pause/resume time jump can't fabricate a huge distance.
    s.cleanDistanceM += (speed / 3.6) * Math.min(t - s.prevT, 2);
    if (s.cleanDistanceM >= cfg.cleanDrivingDistanceM && !breachAwaitingSustain) {
      s.cleanDistanceM -= cfg.cleanDrivingDistanceM;
      events.push(makeCommendation("CLEAN_DRIVING", t));
    }
  }

  s.prevT = t;
  s.prevSpeedKmh = speed;
  s.prevLeadGapM = leadGapM;
  return amendments === undefined ? { state: s, events } : { state: s, events, amendments };
}

// ---------------------------------------------------------------------------
// Discrete event handlers
// ---------------------------------------------------------------------------

/**
 * ONE ACT, ONE BILL (see `ACT_REOPEN_TRAVEL_M`).
 *
 * `event` is built by the caller either way — the catalogue lookups are pure —
 * and reaches `out` only if this act has not already been billed. `actKey` is
 * what the engine considers "the same act": not the code, but the ACT, plus
 * whatever discriminator makes two of them genuinely different faults (which
 * control was crossed, which situation was adjudicated). The Б2 verdict pair
 * shares one key on purpose — a full stop and a failure to make one are two
 * possible outcomes of a single act, never two acts.
 */
function billAct(
  s: RuleEngineState,
  tick: SimTick,
  out: RuleEvent[],
  actKey: string,
  event: RuleEvent,
): void {
  const last = s.actBills[actKey];
  if (last !== undefined) {
    // THE CAR WENT BACK AND DID IT AGAIN — the one motion that re-opens an act
    // on the segment it was billed on (see `ACT_REVERSE_REOPEN_M`). Asked
    // FIRST, because both conjuncts below are true of exactly this drive and
    // neither of them can see it.
    if (s.contactReverseOdometerM - last.reverseOdoM < ACT_REVERSE_REOPEN_M) {
      // Two conjuncts, each catching a different way one act arrives twice —
      // the constant's comment carries the argument and the measured tables.
      //
      // `null` IS A SEGMENT ANSWER, NOT A MISSING ONE, and it is the strongest
      // one there is: `locator.ts` sets it when the car is more than 30 m from
      // every centerline, i.e. „this car is nowhere". A car that is nowhere is
      // not at a junction at all, so a junction act reported off a null fix is
      // never a second junction — which is why null matches null here rather
      // than falling through to the distance floor, and why the floor may not
      // be asked to save it: `sc-junction-gap / mobile-wrong` leaves the
      // district at 58 км/ч and stays out for eighty seconds, so 20 m of path
      // costs it 1.2 s. Only `undefined` — a source that names no segment at
      // all: recorded traces, hand-built ticks, every pre-C1 engine — asserts
      // nothing and leaves the distance floor in charge.
      const sameEdge =
        tick.edgeId !== undefined && last.edgeId !== undefined && tick.edgeId === last.edgeId;
      if (sameEdge || s.contactOdometerM - last.odoM < ACT_REOPEN_TRAVEL_M) return;
    }
  }
  s.actBills[actKey] = {
    odoM: s.contactOdometerM,
    reverseOdoM: s.contactReverseOdometerM,
    edgeId: tick.edgeId,
  };
  out.push(event);
}

/**
 * DID THE WORLD PUT THE CAR SOMEWHERE, rather than the driver drive it there?
 *
 * The act latch above holds „you are still at the junction you were billed at",
 * and a session that RE-STAGES its encounter breaks that sentence in a way no
 * amount of odometer or segment reasoning can see: the orchestrator resets the
 * director and drops the driver 112 m back up the same approach arm, and the
 * second run at that junction is a second encounter that must convict again
 * (`orchestrator/__tests__/oncoming-left-turn.test.ts`, „re-stages
 * deterministically on retry"). To this reducer that is one frame in which the
 * car appears somewhere it could not possibly have driven to.
 *
 * So a displacement past the plausible envelope — twice the distance the
 * reported speed could have covered in the reported interval, plus 5 m of slack
 * for pose jitter and dropped frames — SPENDS every act latch, and the drive
 * that follows is graded from scratch. Deliberately generous: a pause/resume
 * jump is not a teleport (dt grows with it, so the envelope grows too), and the
 * cost of a missed teleport is one suppressed bill while the cost of a false
 * one is only that a genuine duplicate gets through.
 *
 * A source that reports no motion at all (every hand-built tick in the unit
 * suites sits at the origin) never triggers it, so those drives are unchanged.
 */
function restagedJump(
  prev: { x: number; y: number } | null,
  tick: SimTick,
  dt: number,
  speedKmh: number,
): boolean {
  if (prev === null) return false;
  const moved = Math.hypot(tick.position.x - prev.x, tick.position.y - prev.y);
  return moved > (Math.abs(speedKmh) / 3.6) * Math.max(dt, 0) * 2 + 5;
}

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
        // The past-the-line hesitation arm's latch (`HESITATION_PAST_LINE` in
        // the reducer). Written on EVERY signal crossing, so an entry on amber
        // or red — or against a регулировчик's halt — overwrites a stale green
        // with nothing: only a crossing on a green lamp the approach was
        // permitted to take can arm it, which is the only crossing whose freeze
        // the catalogue's «Светна зелено…» describes truthfully.
        s.hesitationGreenEntry =
          e.lightState === "green" && e.controller !== "halt"
            ? { x: tick.position.x, y: tick.position.y }
            : null;
        // JU-18: a resolved CONTROLLER permission is the effective signal and
        // overrides the lamps entirely (ЗДвП чл. 7 — сигналите на
        // регулировчика са над светофара): "halt" is the dedicated 10-point
        // опасна even on green lamps; "proceed" is innocent even on red.
        // Absent (every pre-JU-18 runtime) = the lamp grading, byte-identical.
        // THE SIGNAL VERDICTS ARE DELIBERATELY *NOT* ACT-LATCHED (2026-08-22 —
        // see `ACT_REOPEN_TRAVEL_M`). The one-act latch was written against a
        // photographed defect, and the codes it was photographed on are the Б2
        // verdict, the junction scan and the junction priority — every repeat
        // row in the sweep is one of those three. No frame anywhere in the
        // catalogue shows a signal verdict billed twice for one crossing, and
        // suppressing on a code with no evidence of the fault is how a fix
        // starts deleting real convictions: latched here, the shipped
        // repeat-penalty escalation lost its second red entirely
        // (`lessons/__tests__/teach-escalation.test.ts`, „always-grade (опасна)
        // escalates from its second encounter"). If a runaway red is ever
        // photographed, the latch is one call away and the key is "signal-line".
        if (e.controller !== undefined) {
          if (e.controller === "halt") out.push(makeViolation("CONTROLLER_SIGNAL_VIOLATED", t));
          // …and the compliant half is CREDITED, which until now it was not:
          // this arm could only convict, so the ONE act the регулировчик
          // lessons exist to teach — going on his permission while your own
          // lamp forbids it (ЗДвП чл. 7, ал. 1) — reached the debrief as
          // silence. Measured on sc-sig-controller-live/mobile-right: route
          // objectives ticked, «COMMENDATIONS (0): (none credited)», and the
          // only feedback a seventeen-year-old got was a fail and a 10-point
          // row. CLEAN_DRIVING cannot cover it either — that needs 250 m and
          // this drill's whole route is ~150 m — so a PERFECT drive of it
          // earned nothing at all. THEO-4 (doc 64) with the sign reversed.
          //
          // The gate is the FORBIDDING LAMP, and it is the same one the
          // objective already uses (`lessons/objectives.ts` requireRedMet:
          // forbidding lightState + controller "proceed"), so the praise card
          // and the route task can never disagree about what happened. On a
          // green lamp the officer and the lamp agree and nothing hard was
          // done — crossing there is ordinary driving and stays uncredited.
          //
          // AT A JUNCTION WHOSE LAMPS THE LESSON AUTHORS AS OUT there is no
          // lamp to forbid or to agree, and the gate above was reading the
          // hidden cycle under the officer's cluster: rig-w3a drove one careful
          // drill five times and the praise was on the sheets that happened to
          // cross at t 42.2 / 45.2 / 47.8 and off the ones at 49.3 / 58.8
          // (sc-sig-controller-postures:f7e046c4). The runtime now stamps
          // `lampsDark` and no phase, and the case is decided by what that
          // lesson promises, in its own words (templates-signals2.ts):
          //   instruction 1  «светофарът на кръстовището е ЗАГАСНАЛ … Тук важи
          //                   само неговата поза»;
          //   instruction 3  «Няма лампа за четене — четеш човека»;
          //   instruction 5  «Щом се обърне със СТРАНИЧЕН ПРОФИЛ … премини
          //                   решително и спокойно на север»;
          //   task 2         «Премини кръстовището, когато позата разреши
          //                   посоката ти» — graded by `requireControllerProceed`
          //                   (objectives.ts), i.e. on EVERY proceed crossing;
          //   examiner       «гледа кого четеш при загаснал светофар … решително
          //                   преминаване чак при страничния профил».
          // Reading the man and going on his permission IS that drill's whole
          // credited act, so it is credited on every proceed crossing — and the
          // praise and the route task agree on every one, as the paragraph
          // above requires. The title («Правилно изпълнен сигнал на
          // регулировчика») is the only part any surface prints, and it is true
          // with no lamp at all.
          else if (e.lampsDark === true || e.lightState === "red" || e.lightState === "redYellow") {
            out.push(makeCommendation("CONTROLLER_SIGNAL_OBEYED", t));
          }
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
          // The SIGN travels as `detail` (ADR-009 lane R): the catalogue row is
          // control-neutral, `catalog.ts JUNCTION_SCAN_CONTROL_COPY` holds the
          // two sentences, and `rebuildRuleEvents` resolves the same one.
          const bill = makeViolation("JUNCTION_SCAN_INCOMPLETE", t, {
            detail: JUNCTION_SCAN_CONTROL_GIVE_WAY,
          });
          billAct(s, tick, out, "junction-scan", bill);
        }
        break;
      }
      // Б2 stop sign: a qualifying full stop must have ended recently. The scan
      // grade follows the full-stop grade (order preserved for existing gates) —
      // it is a DISTINCT fault (a rolling stop can also skip the scan).
      const last = s.stop.lastQualifyingStopAt;
      // DRIVING seconds since the stop, not wall-clock ones: Б2 is stop AND
      // give way (ЗДвП чл. 47), and the wait for the gap is the second half of
      // the duty — a clock that ran during it billed the student ten points for
      // performing it. `RuleEngineState.stop.movingSinceStopSec` carries the
      // measured drive and why the distance the window stands for is unchanged.
      const stopped = last !== null && s.stop.movingSinceStopSec <= cfg.stopRecencySec;
      billAct(
        s,
        tick,
        out,
        "stop-line",
        stopped
          ? makeCommendation("FULL_STOP_AT_STOP_SIGN", t)
          : makeViolation("STOP_SIGN_NO_FULL_STOP", t),
      );
      if (scanIncomplete()) {
        // Б2's own sentence, keyed the same way as the give-way branch above.
        const bill = makeViolation("JUNCTION_SCAN_INCOMPLETE", t, {
          detail: JUNCTION_SCAN_CONTROL_STOP,
        });
        billAct(s, tick, out, "junction-scan", bill);
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
      // THE VERDICT MUST NOT DEPEND ON THE DEVICE (sc-zebra-approach:34ecd82d).
      // The in-zone sustain check below (§5) runs AFTER this handler, and this
      // handler closes the zone — so the sustain could only ever be satisfied
      // by a tick that LANDED inside the zone at least a sustain after onset.
      // That is a requirement on sampling cadence, not on driving, and cadence
      // is a property of the DEVICE (the same lesson the collision case's
      // reporters taught): the identical scripted 59 км/ч approach booked
      // «Твърде бързо приближаване…» on PC (pc-wrong/04-t006s, 250-odd samples
      // across the ~2.1 s transit) and NOT on the sub-10-fps mobile harness
      // (mobile-wrong, entry and pass with nothing between) — 20 т. against
      // 10 т. for one drive. So the still-open episode is adjudicated HERE, at
      // the pass, in wall clock: onset a full sustain before the paint AND
      // still over the approach max AT the paint is the same offence §5
      // convicts, no longer billed per tick count. Both directions hold:
      // `tooFastEmitted` keeps the fine cadence at one bill, `tooFastSince`
      // stays null through a braking response or a late-stepping pedestrian
      // (the reaction-time grace), and a car genuinely braking from a legal
      // entry cannot reach the paint above the max — pinned both ways in
      // crossing-pass-cadence.test.ts.
      //
      // STRICTLY greater, unlike §5's `>=`, and the boundary is the point: a
      // sustain that completes EXACTLY at the pass has no in-zone tick left
      // for §5 to convict on at any cadence (the pass tick closes the zone
      // first), so `>=` here would add a conviction no fine-cadence drive
      // ever received — crossing-host-edge.test.ts pins that drive innocent.
      // This clause repairs the sampling, it does not move the law.
      if (
        z !== null &&
        !z.tooFastEmitted &&
        z.tooFastSince !== null &&
        tick.speedKmh > cfg.crossingApproachMaxKmh &&
        t - z.tooFastSince > cfg.crossingTooFastSustainSec
      ) {
        z.tooFastEmitted = true;
        out.push(makeViolation("PEDESTRIAN_CROSSING_TOO_FAST", t));
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
      // A VEHICLE CONTACT WHILE A `laneEntryAnswer` WATCH IS OPEN ends that
      // entry in the worst way there is, so the lane change that put him there
      // is not praised, whatever the watch later says (`pending.forced`;
      // sc-ac-wind-truck-pass:ff1d4290 round 2). Before the episode logic, on
      // every report: this is about the praise, not about the bill.
      if (e.withWhat === "vehicle" && s.laneChange.pending.length > 0 && laneEntryWatchOpen(s)) {
        s.laneChange.pending = s.laneChange.pending.map((p) => (p.forced === true ? p : { ...p, forced: true as const }));
      }
      // ONE ENCOUNTER, ONE ACCIDENT — and the definition is the whole rule:
      //
      //   an encounter OPENS on the first reported contact and stays open for
      //   as long as contact keeps being reported; it CLOSES only once ALL
      //   THREE of `collisionSeparationSec` has passed with nothing reported at
      //   all, the car has driven `COLLISION_REOPEN_TRAVEL_M` since the last
      //   report, and the vehicle ahead has been SEEN clear of the bumper
      //   (`CONTACT_LEAD_GAP_M`) — the bodies have come apart. The report that
      //   opens an encounter is billed; every report inside one is the same
      //   accident, still happening.
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
      // 2026-08-18, THE REDRIVE: the travel half did not hold either, and the
      // reason is written on `CONTACT_LEAD_GAP_M` — it measured PATH, and a
      // shunt supplies path without ever supplying separation. Thirteen and
      // fourteen «Пътнотранспортно произшествие» rows for one contact, on a
      // sheet whose own caption says nine points are allowed. So the third
      // conjunct is the one that is not a proxy: the vehicle ahead has to have
      // been SEEN off the bumper between the two reports.
      //
      // …AND THAT CONJUNCT WAS PUT ON A LATCH SHARED BY EVERY BODY IN THE
      // WORLD, WHICH IS HOW THE FIX BOUGHT A FALSE ACQUITTAL. The daylight is
      // a reading off `tick.leadGapM`, i.e. a statement about ONE thing — the
      // in-lane vehicle ahead. A student who shunts a car and then, half a
      // minute later, knocks down a pedestrian has had TWO accidents; but the
      // pedestrian's bill was being asked to wait for the CAR's bumper to
      // clear, and while the driver is still nose-to-tail in the queue it
      // never does. Not billing a pedestrian at all is the same crime as
      // billing one crash thirteen times, pointed the other way — the sheet has
      // to be able to say both.
      //
      // AND IT WAS NOT HYPOTHETICAL: IT WAS ALREADY SHIPPING. Dumping the
      // contact channel of `sc-hz-accident-scene`'s own mistake demo, «Минаване
      // плътно и бързо покрай хората» — 26 reports at 45.9 км/ч: t=13.13 the
      // first wreck (vehicle), t=13.43…13.82 the BYSTANDER dragged along at
      // 60 Hz (pedestrian), t=14.23 the second wreck. The template's whole
      // lesson is that people are standing there, and the fault sheet printed
      // ONE «Пътнотранспортно произшествие» — the parked wreck. The man under
      // the wheels cost nothing. It now prints two: vehicle, then pedestrian.
      // (Synthetic twin, both directions pinned: «…struck half a minute after a
      // car crash…» in `sweep161-fault-episodes.test.ts` — 2 bills before the
      // daylight conjunct landed, 1 after, 2 now.)
      //
      // THE SECOND ROW COSTS NOTHING EXTRA, which is what makes this direction
      // the safe one: `rules/scoring.ts` closes the ledger at the first
      // terminating опасна (чл. 48, ал. 3) and marks every later one
      // `unscoredAfterClose`, so that replay still scores 10 with two COLLISION
      // rows on it. What the extra row buys is the thing THEO-4 asks for — the
      // debrief can no longer stay silent about the man in the road.
      //
      // SO THE EPISODE IS PER BODY, and each conjunct is asked only where it
      // means something. Silence and travel are properties of the CAR and apply
      // to every body; daylight is a property of the LEAD VEHICLE and is
      // required only of a `vehicle` episode. For a wall, a pedestrian or a
      // cyclist the gap channel is not looking at the body that was hit, so
      // demanding its testimony is a category error — those episodes fall back
      // to silence + travel, byte-identically to the shipped behaviour the
      // "no lead-gap channel" test pins.
      //
      // «PER BODY» USED TO MEAN «PER BODY-KIND», AND THAT COST A SECOND VICTIM
      // (2026-08-18, the refutation). The key was `e.withWhat`, so the contract
      // it enforced was not „one contact with one body bills once" but „one
      // contact with one KIND of body bills once" — and those differ on every
      // drive that stages two of anything. Measured on this very lesson: the
      // sc-hz-accident-scene wreck tableau is TWO rects (y = 150 and y = 162),
      // struck 1.1 s apart at 45.9 км/ч. Inside `collisionSeparationSec` (1.2 s)
      // the first rect's episode is still open, so the SECOND WRECKED CAR BILLED
      // ZERO. Two cars, one bill, and the residue is not innocent-erring in any
      // sense a student can read: the sheet said he hit a car when he hit two.
      //
      // The reporters that KNOW which body they touched now say so
      // (`SimTickEvent.actorId`): the orchestrator's contact sentinel already
      // held `m.actorId` and discarded it at the push, and the trace recorder's
      // obstacle channel already latched per RECT and discarded `i`. Both now
      // stamp it, and `contactKey` uses it. The live rapier channel still cannot
      // — its NPC shells are a rebinding pool, so an id would churn under the
      // latch — and it therefore keeps the category fallback, which is the
      // finest grain that exists on that side of the wire and errs innocent
      // (A12). What is no longer true is that the finest grain is category
      // EVERYWHERE; two of the three reporters were throwing identity away.
      // …AND THE REPORTERS DO NOT ALL SPEAK AT THE SAME RESOLUTION, which is
      // the trap a per-body key sets and a per-kind key hid. A drive can have
      // BOTH channels pointed at one body: on `sc-merge-from-property`'s
      // walk-through demo the contact sentinel reports `sc-mfp-walker` at 60 Hz
      // from t = 6.30, and at t = 6.57 the script's own authored consequence
      // beat fires an ANONYMOUS pedestrian report into the same overlap. Keyed
      // naively that is two episodes and TWO ПТП for one person under the
      // wheels — measured, and it is exactly the shape («one body billed
      // twice») that the older per-accident rule was binned for. Same story on
      // `sc-rb-busy-gap`'s short-gap demo at t = 23.40 against
      // `sc-rbg-follower`.
      //
      // So a report is matched against every episode it COULD be a
      // continuation of, and the asymmetry is the whole content of the rule:
      //  · a NAMED report rules out every OTHER named body — that is what the
      //    name is for — but not the anonymous episode of its own kind, which
      //    may well be this very body seen by a channel that could not name it;
      //  · an ANONYMOUS report rules out nothing, so it is a continuation of
      //    ANY open episode of its kind. It bills only when none is open.
      // The residue errs innocent in the one direction that has no name to
      // appeal to (A12), and a genuinely new named body is unaffected: two
      // wrecked cars are two names, so both still bill.
      const key = contactKey(e);
      const candidates: ContactEpisode[] = [];
      const own = s.contactEpisodes[key];
      if (own !== undefined) candidates.push(own);
      if (e.actorId !== undefined) {
        const anon = s.contactEpisodes[`kind:${e.withWhat}`];
        if (anon !== undefined) candidates.push(anon);
      } else {
        for (const [k, ep] of Object.entries(s.contactEpisodes)) {
          if (k !== key && ep.withWhat === e.withWhat) candidates.push(ep);
        }
      }
      // Empty candidate list = a body never touched before, which always bills.
      const cameApart = candidates.every((open) => {
        // «THE BODIES CAME APART» MUST BE MEASURED, AND WHICH MEASUREMENT
        // EXISTS DEPENDS ON THE BODY (2026-08-22 — the wall the first half of
        // this rule acquitted nothing of; see CONTACT_REVERSE_TRAVEL_M):
        //  · a VEHICLE has the gap channel, so daylight is the lead's own
        //    alibi, read as a latch because the gap is 0 at every impact by
        //    definition — and an ABSENT channel counts as apart, which is what
        //    keeps every drive without a gap reading byte-identical;
        //  · a WALL, a PEDESTRIAN or a CYCLIST has no such channel, so it used
        //    to fall back to forward path — the proxy CONTACT_LEAD_GAP_M had
        //    just proved false — under a latch that read the absent channel as
        //    daylight. It now needs one of the two things that ARE evidence:
        //    the road ahead MEASURED clear since the last report, or the car
        //    BACKED OUT.
        // Neither branch can acquit a body never touched before: `candidates`
        // is empty there and `every` is vacuously true.
        const daylight =
          e.withWhat === "vehicle"
            ? s.lastLeadApartAt !== null && s.lastLeadApartAt > open.at
            : (s.lastGapClearAt !== null && s.lastGapClearAt > open.at) ||
              s.contactReverseOdometerM - open.reverseOdoM >= CONTACT_REVERSE_TRAVEL_M;
        return (
          daylight &&
          t - open.at > cfg.collisionSeparationSec &&
          s.contactOdometerM - open.odoM >= COLLISION_REOPEN_TRAVEL_M
        );
      });
      s.contactEpisodes[key] = {
        at: t,
        odoM: s.contactOdometerM,
        reverseOdoM: s.contactReverseOdometerM,
        withWhat: e.withWhat,
      };
      if (!cameApart) break;
      s.terminated = true;
      // …and a VEHICLE contact that is the tail of a billed cut-in reads as the
      // cut-in (see the `laneEntered` case) — same charge, the true sentence.
      const cutInTail =
        e.withWhat === "vehicle" && s.cutInContactUntil !== null && t <= s.cutInContactUntil;
      out.push(makeViolation("COLLISION", t, { detail: cutInTail ? "vehicleCutIn" : e.withWhat }));
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
      //
      // ONE ACT, ONE BILL, BUT ONLY WHERE THE ACT IS A PLACE (2026-08-22; see
      // `ACT_REOPEN_TRAVEL_M`). A JUNCTION priority conflict is a state the
      // adjudicator resolves at a mouth, and every report of it used to be its
      // own 10-point опасна: measured, one give-way conflict re-reported for
      // 205 s billed 821 / 206 / 52 / 14 times at cadences of 0.25 / 1 / 4 /
      // 15 s. So those situations are latched, keyed by the SITUATION — a
      // give-way slip and a right-hand-rule slip at one mouth stay two faults
      // with two lessons — and the violated/yielded pair shares the key,
      // because yielding and failing to yield are two outcomes of one
      // encounter with one junction.
      //
      // THE FOUR MANOEUVRE SITUATIONS ARE NOT LATCHED, and the reason is the
      // whole justification of the floor: „you cannot reach a second CONTROL
      // without driving the road between them" is a statement about places, and
      // these four are adjudicated against a BODY. `sc-vu-cyclist-group` is the
      // measurement — five cyclists passed lawfully inside one cluster earn
      // five «Пропусна…» commendations, and a place-shaped latch collapsed them
      // to one (`s-w4-bot-completion.test.ts`, „…and commends it FIVE times").
      // Five riders are five acts however close together they are riding, and
      // `prioritySituation` carries no body id for the reducer to key on — so
      // it does not pretend to have one.
      // …and "warning-lamp" (N11/VP-06) joins them for a third reason of the
      // same shape: it is not adjudicated against a place OR a body but against
      // the CAR ITSELF, and its runner resolves exactly once per drive, so a
      // place-latch could only ever suppress a bill that cannot repeat.
      // …and "police-stop-signal" (VP-11) for a fourth reason of the same
      // family: it is adjudicated against ONE staged officer, its runner
      // resolves exactly once per drive, and the act is a duty owed to a person
      // rather than a right owed at a place — so a place-latch could only ever
      // suppress a bill that cannot repeat.
      const MANOEUVRE_SITUATIONS = new Set([
        "emergency",
        "overtake-oncoming",
        "overtake-return",
        "vulnerable-pass",
        "warning-lamp",
        "police-stop-signal",
      ]);
      const placeAct = MANOEUVRE_SITUATIONS.has(e.situation)
        ? null
        : `priority|${e.situation}`;
      if (e.violated) {
        const bill = makeViolation(
          e.situation === "emergency"
            ? "EMERGENCY_NOT_YIELDED"
            : e.situation === "overtake-oncoming"
              ? "OVERTAKE_INSUFFICIENT_GAP"
              : e.situation === "overtake-return"
                ? "OVERTAKE_RETURN_TOO_EARLY"
                : e.situation === "vulnerable-pass"
                  ? "VULNERABLE_PASS_TOO_CLOSE"
                  : // N11 (VP-06): the telltale runner's own duty — ЗДвП чл.
                    // 101, ал. 1 („длъжен е да спре"), which is neither a
                    // junction priority nor a manoeuvre.
                    e.situation === "warning-lamp"
                    ? "WARNING_LAMP_IGNORED"
                    : // VP-11: the police-stop runner's own duty — ЗДвП чл. 103
                      // („е длъжен да спре плавно в най-дясната част на
                      // платното"), which is neither a junction priority nor a
                      // manoeuvre.
                      e.situation === "police-stop-signal"
                      ? "POLICE_STOP_SIGNAL_IGNORED"
                      : "FAILED_TO_YIELD",
          t,
          { detail: e.situation },
        );
        if (placeAct === null) out.push(bill);
        else billAct(s, tick, out, placeAct, bill);
        // VP-06 (N11): ARM the drive-on re-grade. The lamp does not go out, so
        // the чл. 101, ал. 1 duty survives this bill — and this bill is the only
        // one the runner will ever produce (it resolves once per drive), which
        // is why the teach-first card was the whole price of the offence. See
        // `WARNING_LAMP_REGRADE_SEC`. Once per drive: a second arming would
        // reset the baseline the drop is measured from.
        if (e.situation === "warning-lamp" && s.warningLampIgnoredAt === null) {
          s.warningLampIgnoredAt = t;
          s.warningLampRecent = [{ t, speedKmh: tick.speedKmh }];
          s.warningLampDriveOnSec = 0;
        }
      } else if (e.yielded) {
        // …AND THE PRAISE NAMES THE ACT TOO (round 10, 2026-08-24). The bill
        // above has picked one of five codes by `e.situation` since VU-09; the
        // praise pushed one pooled sentence for all nine situations that reach
        // here, and that sentence ends «…безопасността на кръстовище» — false
        // on `emergency`, `vulnerable-pass` and `narrow-meeting`, none of which
        // needs a junction to happen. `sc-hz-accident-scene` is the frame: a
        // straight street past a crash, zero intersections in the district, and
        // a green «✓ Правилно отстъпено предимство» for making way for the
        // ambulance. The situation now travels with the praise and
        // `YIELD_PRAISE_SITUATION_COPY` (catalog.ts) answers for those three;
        // the five junction situations fall through to the pooled row unchanged.
        const praise = makeCommendation("YIELDED_TO_PRIORITY", t, e.situation);
        if (placeAct === null) out.push(praise);
        else billAct(s, tick, out, placeAct, praise);
      }
      break;
    }

    case "mirrorGlance": // handled in the tracker pass
      break;

    case "laneEntered": {
      // FOUNDER RULING 2026-09-30 — «BILL THE FORCED BRAKING» (sc-merge-lane-end:
      // 0487bcec round 3). „A cut-in so close that the vehicle already in the
      // lane the student enters must brake hard IS the lane-drop lesson's own
      // push-out mistake, billed even with NO contact" — ЗДвП чл. 25, ал. 2.
      //
      // The runtime measured the entry and what it demands of the follower
      // (`LaneEntryFollower.forcedDecelMps2` — the kinematics of the entry frame,
      // never the follower's own controller); this is only the judgement:
      //   · armed per lesson (`laneEntryForcedBrakingEnabled`) — the ruling is
      //     scoped to the lane-drop lessons, and everything else grades exactly
      //     as before;
      //   · „brake hard" is `harshBrakeDecelMps2`, the line the product already
      //     calls the student's own braking harsh at — EXCLUSIVE, the tie
      //     acquits, by the same tolerance and for the same reason
      //     (HARSH_BRAKE_TIE_TOLERANCE);
      //   · no follower, no bill: an entry into an empty lane, or behind the
      //     car, is the lesson's own taught drive.
      //
      // ONE CUT-IN, ONE ACT (round 4). The runtime publishes every crossing —
      // it has no lane-switch deadband any more, because a deadband with no
      // limit let a student who hovered 23 cm clear of the line dart in front
      // of the car unbilled (round 3 verifier, F3). So a body riding the line
      // in front of a car crosses it again and again, and the car is answering
      // ONE cut-in for its reaction plus its own hard stop from the speed it
      // had (the window below). A forced crossing in front of THAT vehicle
      // inside that window is the same act: billed once. After it, or in front
      // of another vehicle, it is a new act and bills again.
      if (!cfg.laneEntryForcedBrakingEnabled) break;
      const f = e.follower;
      if (f === null) break;
      if (f.forcedDecelMps2 <= cfg.harshBrakeDecelMps2 * (1 + HARSH_BRAKE_TIE_TOLERANCE)) break;
      // A contact inside the follower's react-and-stop time — its reaction plus
      // shedding its own speed at the hard line — is this cut-in's tail, and
      // the forward-collision card («…колкото ти е трябвал, за да спреш») would
      // be false about it (round 2's verifier, F8). Every FORCED crossing opens
      // it, billed or the same act, because each one is a cut-in the contact can
      // be the tail of. Nothing about the CHARGE moves: COLLISION still bills,
      // terminates and prices exactly as it did; only which true sentence the
      // student reads.
      billForcedLaneEntry(s, t, out, f.vehicleId, f.reactionSec + f.speedMps / cfg.harshBrakeDecelMps2, undefined);
      break;
    }

    case "followerBraked": {
      // THE CLOSE FOLLOWER'S OWN ACCOUNT (`sc-follow-tailgater:63c0c28c`): it
      // had to brake hard. Only recorded here — the bill, if any, is the harsh-
      // brake detector's („THE FLOOR LIFTS FOR A FOLLOWER IT PUT AT RISK"), and
      // only for a causeless emergency-grade episode of HIS that the floor alone
      // acquitted. „Hard" is re-checked against this config by the one
      // predicate (`isHarshBrakeWindow`), exactly as `laneEntryAnswer` does.
      if (!isHarshBrakeWindow({ heldSec: e.heldSec, meanDecelMps2: e.decelMps2, qualifiedSec: e.qualifiedSec }, cfg)) break;
      s.harshBrake.followerForcedAt = t;
      s.harshBrake.followerAnswerSec = e.speedMps / cfg.harshBrakeDecelMps2;
      break;
    }

    case "laneEntryAnswer": {
      // THE SECOND BASIS OF THE SAME BILL — what the vehicle he came in front of
      // ACTUALLY DID, on its own traffic model's account (`types.ts`, the
      // `laneEntryAnswer` event; sc-ac-wind-truck-pass:ff1d4290 round 2, the
      // integrator's decision of 2026-10-08 on the founder's rulings of
      // 2026-09-30 and 2026-10-05). The runner measures and publishes; this is
      // only the judgement, and it is the `laneEntered` case's judgement word
      // for word:
      //   · armed per lesson, by the same switch;
      //   · „brake hard" is `harshBrakeDecelMps2`, EXCLUSIVE, the tie acquits,
      //     same tolerance — read here against the deceleration the vehicle's
      //     account actually grew at, where `laneEntered` reads the one the
      //     entry demands;
      //   · one cut-in, one act, per vehicle — the SAME window record, keyed by
      //     the same published id, so an entry that is billed on what it
      //     demanded is not billed again for what the vehicle then did.
      // The vehicle has already reacted (it is braking), so what it is still
      // answering for is its own hard stop from the speed it had: no reaction
      // term in the window.
      //
      // ROUND 3 (the integrator's decision D2): „hard" is the WHOLE harsh-brake
      // rule — the window the runner found, re-checked here against this
      // engine's own config by the one predicate (`harshBrakeEpisode.ts
      // isHarshBrakeWindow`: over `harshBrakeDecelMps2` for
      // `harshBrakeSustainSec`, mean exclusive). A vehicle that only LIFTED for
      // him (`lift`, or a `braked` this config does not find hard) is NOT
      // billed as forced braking; the lane change is not praised either
      // («…навреме» is not true of a return the vehicle had to give way to);
      // and the product's own line for exactly this act is billed:
      // OVERTAKE_RETURN_TOO_EARLY (doc 72 OV-09, основна) — «Прибра се … пред
      // автомобила, който изпревари, и го принуди да намали», whose Наредба
      // № 38 rationale is this very case («Пострадалият е принуден да намали —
      // реакция, но не установена предпоставка за ПТП»). Its runtime tracker
      // cannot see a one-way carriageway (it watches an excursion onto the
      // opposing bank); this is its second basis, measured the same way the
      // forced-braking one is — the vehicle's own account, at the brake-lamp
      // line 0.3 m/s, inside its guard's reach (10.23 m at 40 км/ч = 0.92 s,
      // under the tracker's own 1.0 s conviction line). Armed by the same
      // per-lesson switch; detail the tracker's own, "overtake-return".
      const key = String(e.vehicleId);
      if (e.phase === "watching") {
        s.laneEntryWatch[key] = true;
        break;
      }
      delete s.laneEntryWatch[key];
      if (e.phase === "clear") break;
      const hard =
        e.phase === "braked" &&
        cfg.laneEntryForcedBrakingEnabled &&
        isHarshBrakeWindow({ heldSec: e.heldSec, meanDecelMps2: e.decelMps2, qualifiedSec: e.qualifiedSec }, cfg);
      if (!hard) {
        withholdLaneChangePraise(s);
        if (cfg.laneEntryForcedBrakingEnabled) {
          out.push(makeViolation("OVERTAKE_RETURN_TOO_EARLY", t, { detail: "overtake-return" }));
        }
        break;
      }
      billForcedLaneEntry(s, t, out, e.vehicleId, e.speedMps / cfg.harshBrakeDecelMps2, e.act);
      break;
    }
  }
}

/** The lane change(s) still waiting out their grace are not to be praised —
 *  see `pending.forced`. Shared by a billed cut-in and by a return the
 *  vehicle had to give way to (`laneEntryAnswer` `lift`). */
function withholdLaneChangePraise(s: RuleEngineState): void {
  if (s.laneChange.pending.length > 0) {
    s.laneChange.pending = s.laneChange.pending.map((p) => (p.forced === true ? p : { ...p, forced: true as const }));
  }
}

/** Is any vehicle he is in front of still to answer — see `laneEntryWatch`. */
function laneEntryWatchOpen(s: RuleEngineState): boolean {
  for (const k in s.laneEntryWatch) {
    if (s.laneEntryWatch[k] === true) return true;
  }
  return false;
}

/** Is a billed cut-in still being answered at `t` — see `cutInActUntil`. */
function cutInActOpen(s: RuleEngineState, t: number): boolean {
  for (const k in s.cutInActUntil) {
    if (t <= s.cutInActUntil[k]!) return true;
  }
  return false;
}

/**
 * BILL A FORCED LANE ENTRY — the one place LANE_ENTRY_FORCED_BRAKING is pushed,
 * shared by its two bases (`laneEntered`: what the entry demanded;
 * `laneEntryAnswer`: what the vehicle did). The caller has already judged it
 * HARD. ONE CUT-IN, ONE ACT: per vehicle, a second forced entry inside the time
 * that vehicle is still answering the first is the same act and is not billed
 * again; the contact window is extended either way (a contact can be the tail
 * of any of them).
 *
 * …AND THE LANE CHANGE THAT WAS THE ENTRY IS NOT PRAISED. Every lane change
 * still waiting out its grace is marked `forced` here — the bill and the lane
 * id's flip are a fraction of a second apart, in either order, and
 * `pending` holds a lane change for `laneChangeJointGraceSec` (and for as
 * long as a `laneEntryAnswer` watch is open); one made after this frame while
 * the act is still open is marked where it is created.
 *
 * `act` is the catalogue's per-act copy key (`LANE_ENTRY_ACT_COPY`):
 * undefined for the lane-drop cut-in, whose pooled row is written for it.
 */
function billForcedLaneEntry(
  s: RuleEngineState,
  t: number,
  out: RuleEvent[],
  vehicleId: number,
  answeringSec: number,
  act: string | undefined,
): void {
  const actKey = String(vehicleId);
  const openUntil = s.cutInActUntil[actKey];
  if (openUntil === undefined || t > openUntil) {
    out.push(makeViolation("LANE_ENTRY_FORCED_BRAKING", t, act === undefined ? undefined : { detail: act }));
    s.cutInActUntil[actKey] = t + answeringSec;
  }
  s.cutInContactUntil = Math.max(s.cutInContactUntil ?? -Infinity, t + answeringSec);
  withholdLaneChangePraise(s);
}
