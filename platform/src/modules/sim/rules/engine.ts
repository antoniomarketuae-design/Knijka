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

import { makeCommendation, makeViolation, WRONG_WAY_ROAD_MOTORWAY } from "./catalog";
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
  headlights: EpisodeState;
  laneKeeping: EpisodeState;
  conditionsSpeed: EpisodeState;
  /** The post-teach re-grade clock for `conditionsSpeed` — see `speedingMinorRegrade`. */
  conditionsSpeedRegrade: EpisodeState;
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
 */
const HARSH_BRAKE_TIE_TOLERANCE = 1e-9;

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
 * of the clause. Same channel and same argument as `JUNCTION_SCAN_COPY` below
 * (Б1 vs Б2) — `makeViolation`'s `titleBg`/`explanationBg` override, no new
 * code, no severity or points change.
 *
 * AND THE CORRECTIVE COULD HAVE KILLED HIM. `correctiveBg` has no per-event
 * channel (read from the catalogue BY CODE at display time — see the note on
 * JUNCTION_SCAN_COPY), and the catalogue's said „спри веднага, включи
 * аварийните и излез внимателно на заден ход". On a motorway that is ЗДвП
 * чл. 58, т. 1 („забранено е … движение на заден ход") given as advice, at
 * 140 км/ч closing speeds. The catalogue's corrective was therefore rewritten
 * to be true of BOTH roads rather than split here — the same repair the
 * снеговалеж entry describes two blocks down.
 *
 * THE COPY ITSELF IS NOT HERE, and that is the correction this repair took on
 * its verifier pass. It first rode `makeViolation`'s `titleBg`/`explanationBg`
 * override, the way `JUNCTION_SCAN_COPY` below does — and neither field
 * crosses `wire.ts`. `serializeRuleEvents` carries `kind`, `code`, `t`,
 * `detail`, `penaltyMultiplier`, `x/y`, so `rebuildRuleEvents` rebuilt the
 * pooled street row on the server and the end screen printed «…по
 * автомагистрала» in «Грешки» beside «…по еднопосочна улица» in «Разбор». So
 * the road travels as `detail`, which DOES cross, and the copy lives in
 * `catalog.ts WRONG_WAY_ROAD_COPY` where `actCopy` reaches it from both sides.
 * JUNCTION_SCAN_COPY gets away with the override because its events are billed
 * inside a pre-drive/junction path that is retitled again on rebuild; this one
 * is not, and „both surfaces happen to agree today" is what this codebase has
 * already been burned by twice (wire.ts's `situation` note; FaultCard's).
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

/**
 * O28 — SNOWFALL copy for the low-beam duty the `snowLights` detector grades.
 *
 * WHY IT RIDES AN EXISTING CODE. The duty is ONE duty. Retrieved from the
 * ingested act (content/law/acts/zdvp.json, чл. 70, ал. 1), verbatim: „При
 * движение през нощта И ПРИ НАМАЛЕНА ВИДИМОСТ моторните превозни средства…
 * трябва да бъдат с включени къси или дълги светлини…" — the article's
 * operative condition is намалена видимост, and it names no weather at all.
 * Снеговалеж is one of the conditions the same act lists as producing it
 * (чл. 74, ал. 1: „…значително намалена видимост поради мъгла, СНЕГОВАЛЕЖ,
 * дъжд или други подобни условия"). So snow is not a second law, it is the
 * third weather flag under one law — and HEADLIGHTS_OFF_IN_RAIN is already
 * that law's второстепенна row, cited to чл. 70, ал. 1 and classified Н38
 * б. „б". A new code would duplicate the row, not the rule.
 *
 * THE CODE IS AN IDENTIFIER; THE CARD IS THE PRODUCT. The catalogue carries one
 * title per code and that title says „в дъжд", so the founder's Б1/Б2 defect
 * would repeat verbatim: a card reading «Движение в дъжд без светлини» over a
 * snow frame. These overrides ride `makeViolation`'s existing
 * `titleBg`/`explanationBg` channel — the same channel and the same reason as
 * JUNCTION_SCAN_COPY above. No new event field, no severity or points change.
 *
 * `correctiveBg` HAS NO PER-EVENT CHANNEL (read from the catalogue BY CODE at
 * display time — see the JUNCTION_SCAN_COPY note). The catalogue's is „тръгнат
 * ли чистачките, светват и късите светлини". MEASURED before reusing it rather
 * than assumed: the snow preset is a SNOWFALL veil, not dry packed snow —
 * `environment/presets.ts snowWeather` is authored at density 0.012 (~40 %
 * transmittance at 80 m) and `SnowFlakes` fall through it, so the wipers are
 * running and the corrective lands on target. It is the only student-facing
 * string this reuse does not get to restate; `n38.ts`'s rationale mentions rain
 * but reaches no surface (`examMarkFor` publishes clause + quote only).
 *
 * ROUTED, NOT SILENTLY ACCEPTED: renaming the code to something
 * condition-neutral (HEADLIGHTS_OFF_IN_LOW_VISIBILITY) is the honest end state
 * and touches rules/types.ts + catalog.ts + n38.ts + consequences.ts +
 * scenarios/mapping.ts + world/referents.ts, none of which is this lane's.
 */
const SNOW_LIGHTS_COPY = {
  titleBg: "Движение в снеговалеж без светлини",
  explanationBg:
    "Валеше сняг, а караше без къси светлини. Снегът е намалена видимост точно както дъждът и мъглата: платното още се вижда, но сивата кола в бялото се губи и насрещният те забелязва секунди по-късно, отколкото ти се струва. При намалена видимост колата се движи с включени къси светлини — не толкова за да виждаш, колкото за да те виждат.",
} as const;

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
 * !isNight` and reuses the rain row's CODE (with SNOW_LIGHTS_COPY) because чл.
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
    lastLeadNearAt: null,
    overtakePullOutAt: null,
    lastLaneArrow: null,
    lastIndicatorOnAt: { left: null, right: null },
    lastGlanceAt: { left: null, right: null, rear: null },
    scanStopCreditSec: { left: 0, right: 0 },
    stop: { stoppedSince: null, lastQualifyingStopAt: null },
    speedingMinor: { ...IDLE_EPISODE },
    speedingMinorRegrade: { ...IDLE_EPISODE },
    speedingDangerous: { ...IDLE_EPISODE },
    seatbelt: { ...IDLE_EPISODE },
    handbrake: { ...IDLE_EPISODE },
    headlights: { ...IDLE_EPISODE },
    laneKeeping: { ...IDLE_EPISODE },
    conditionsSpeed: { ...IDLE_EPISODE },
    conditionsSpeedRegrade: { ...IDLE_EPISODE },
    rainLights: { ...IDLE_EPISODE },
    fogLights: { ...IDLE_EPISODE },
    snowLights: { ...IDLE_EPISODE },
    following: { ...IDLE_EPISODE },
    wrongWay: { ...IDLE_EPISODE },
    wrongWayEntry: null,
    keepRight: { ...IDLE_EPISODE },
    crossing: null,
    contactEpisodes: {},
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
    harshBrake: {
      activeSince: null,
      emitted: false,
      onsetKmh: 0,
      causeSeen: false,
      qualifiedSec: 0,
      lastQualAt: null,
    },
    moveOff: { restSeen: false, done: false },
    lastHazardEventAt: null,
    standstillGap: { ...IDLE_EPISODE },
    highBeamDip: { ...IDLE_EPISODE },
    followingRain: { ...IDLE_EPISODE },
    leadClosing: { ...IDLE_EPISODE },
    banZoneStop: { ...IDLE_EPISODE },
    solidCross: { ...IDLE_EPISODE },
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
    emergencyLane: { ...IDLE_EPISODE },
    offCarriageway: { ...IDLE_EPISODE },
  };
}

function cloneState(s: RuleEngineState): RuleEngineState {
  return {
    ...s,
    // The samples themselves are never mutated in place (only pushed/shifted),
    // so a shallow array copy keeps the reducer's no-input-mutation contract.
    speedWindow: [...s.speedWindow],
    crawlSpeedWindow: [...s.crawlSpeedWindow],
    lastIndicatorOnAt: { ...s.lastIndicatorOnAt },
    lastGlanceAt: { ...s.lastGlanceAt },
    scanStopCreditSec: { ...s.scanStopCreditSec },
    stop: { ...s.stop },
    speedingMinor: { ...s.speedingMinor },
    speedingMinorRegrade: { ...s.speedingMinorRegrade },
    speedingDangerous: { ...s.speedingDangerous },
    seatbelt: { ...s.seatbelt },
    handbrake: { ...s.handbrake },
    headlights: { ...s.headlights },
    laneKeeping: { ...s.laneKeeping },
    conditionsSpeed: { ...s.conditionsSpeed },
    conditionsSpeedRegrade: { ...s.conditionsSpeedRegrade },
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
    busLaneRegrade: { ...s.busLaneRegrade },
    rail: { ...s.rail },
    railRest: { ...s.railRest },
    curveSpeed: { ...s.curveSpeed },
    motorwaySlow: { ...s.motorwaySlow },
    motorwaySlowRegrade: { ...s.motorwaySlowRegrade },
    emergencyLane: { ...s.emergencyLane },
    offCarriageway: { ...s.offCarriageway },
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
   * IN ADDITION to whatever else was billed. So `sc-sp-curve:45e7e4fb` is not
   * closed by this — the card it complains about still fires — but the drive it
   * photographs is no longer graded as though the car were on the road.
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
  // the whole argument are there). The SAME condition and the SAME reset as the
  // bill above, on a sustain that is `SPEED_REGRADE_SEC` longer — so it can
  // only ever fire AFTER that bill has already fired, never instead of it, and
  // it fires exactly once per continuous overspeed.
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
  if (
    stepEpisode(
      s.speedingMinorRegrade,
      speedingMinorCond,
      speedReset,
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

  // Speed for the conditions: too fast for rain / fog / snow / night.
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
  //  - NOT gated on «is there asphalt under the car»: see the withdrawn-gate
  //    note at the top of reduceTick. Running WIDE onto the verge is this
  //    fault's own consequence, and `edgeId` nulls one metre past the kerb.
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
  // duty; see SNOW_LIGHTS_COPY for the retrieved article and why it reuses the
  // rain row's code rather than adding a second one for the same rule).
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
      standingDutyBill(s.snowLights, makeViolation("HEADLIGHTS_OFF_IN_RAIN", t, SNOW_LIGHTS_COPY)),
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
  if (
    stepEpisode(
      s.offCarriageway,
      tick.edgeId === null && !atPlaceholderPose,
      typeof tick.edgeId === "string",
      t,
      OFF_CARRIAGEWAY_SUSTAIN_SEC,
    )
  ) {
    // The crash scan is INSIDE the fire branch, not beside it: `Object.keys`
    // allocates, this reducer runs on every render frame (~120 Hz), and the
    // branch is reached at most once per excursion. The value is needed only to
    // decide whether to push, so computing it every frame would be a per-frame
    // allocation bought for nothing — the discipline the accel window's own note
    // spells out two hundred lines up.
    let lastContactAt: number | null = null;
    for (const key of Object.keys(s.contactEpisodes)) {
      const at = s.contactEpisodes[key]!.at;
      if (lastContactAt === null || at > lastContactAt) lastContactAt = at;
    }
    const crashCausedDeparture =
      lastContactAt !== null &&
      departureOnset !== null &&
      Math.abs(departureOnset - lastContactAt) <= OFF_CARRIAGEWAY_SUSTAIN_SEC;
    if (!crashCausedDeparture) events.push(makeViolation("OFF_CARRIAGEWAY", t));
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
  const causelessBraking = accelMps2 <= -2 && noBrakeCause && !s.harshBrake.causeSeen;
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
      // dip credits one frame and not the dip. The first frame of a window
      // credits nothing, which is what makes an isolated spike worthless.
      s.harshBrake.qualifiedSec +=
        s.harshBrake.lastQualAt === null
          ? 0
          : Math.max(0, Math.min(t - s.harshBrake.lastQualAt, Math.min(dt, 2)));
      s.harshBrake.lastQualAt = t;
    }
    if (
      !s.harshBrake.emitted &&
      s.harshBrake.onsetKmh >= cfg.harshBrakeMinSpeedKmh &&
      s.harshBrake.qualifiedSec >= cfg.harshBrakeSustainSec &&
      meanIsEmergencyGrade
    ) {
      s.harshBrake.emitted = true;
      events.push(makeViolation("HARSH_BRAKING_NO_CAUSE", t));
    }
  } else if (accelMps2 > -2) {
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
    s.emergencyLane,
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
  const billedAndUncorrected = EPISODES.some(
    // `qualifiedSec` is optional in the parameter type because `harshBrake`
    // carries its own narrower shape (onsetKmh / causeSeen, no ledger) — it
    // never accrues, so the clause is vacuous for it by construction.
    (ep: { activeSince: number | null; emitted: boolean; qualifiedSec?: number }) =>
      ep.emitted && (ep.activeSince !== null || (ep.qualifiedSec ?? 0) > 0),
  );
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
   */
  const breachAwaitingSustain = [
    s.speedingMinor,
    s.speedingDangerous,
    s.conditionsSpeed,
    s.seatbelt,
    s.handbrake,
    s.headlights,
    s.rainLights,
    s.fogLights,
    s.snowLights,
  ].some((ep) => ep.activeSince !== null);
  if (events.some((e) => e.kind === "violation")) {
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
  return { state: s, events };
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
          const bill = makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.giveWay);
          billAct(s, tick, out, "junction-scan", bill);
        }
        break;
      }
      // Б2 stop sign: a qualifying full stop must have ended recently. The scan
      // grade follows the full-stop grade (order preserved for existing gates) —
      // it is a DISTINCT fault (a rolling stop can also skip the scan).
      const last = s.stop.lastQualifyingStopAt;
      const stopped = last !== null && t - last <= cfg.stopRecencySec;
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
        const bill = makeViolation("JUNCTION_SCAN_INCOMPLETE", t, JUNCTION_SCAN_COPY.stop);
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
      const MANOEUVRE_SITUATIONS = new Set([
        "emergency",
        "overtake-oncoming",
        "overtake-return",
        "vulnerable-pass",
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
                  : "FAILED_TO_YIELD",
          t,
          { detail: e.situation },
        );
        if (placeAct === null) out.push(bill);
        else billAct(s, tick, out, placeAct, bill);
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
  }
}
