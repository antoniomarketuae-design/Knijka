/**
 * sc-rb-lane-choice — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Коя лента в двулентово кръгово" on the
 * committed rb-2lane-v1 district, recorded with the template's OWN staged
 * circulator (sc-rb2-circulating — single truth, imported from the template).
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + the YIELDED_TO_PRIORITY commendation + the
 *     SAFE_LANE_CHANGE commendation for the announced inner→outer move;
 *   - „Обикаляне по външната до далечния изход" grades EXACTLY POOR_LANE_KEEPING;
 *   - „Изход направо през външната кола" grades EXACTLY the чл. 25 cascade:
 *     FAILED_TO_YIELD + LANE_CHANGE_WITHOUT_INDICATOR +
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + TURN_WITHOUT_INDICATOR + COLLISION.
 *
 * Geometry pinned to content/world/rb-2lane-v1.json: ring centerline R = 26
 * around (0, 0), CCW (s → e → n → w); ring LANE centres r = 30.06 (laneId 0,
 * outer) and r = 21.94 (laneId 1, inner); south-arm inbound lane centres
 * x = 12.19 (curb) and x = 4.06 (inner); the give-way bar of the south mouth
 * painted at y = −51.85; ring limit 30, arms 50. This drill takes the THIRD
 * (west) exit — the one the arrows reserve for the inner lane.
 *
 * EVERY PATH HERE IS ONE THE PRODUCT CAR CAN DRIVE
 * (catalogue-demo-curvature:dae908c7). Until 2026-10-11 the three drives were
 * typed in as waypoints — the ring as 10° chords, the entry as four corners,
 * the exit as a pivot: the shadow and mistake 1 left the outer lane at φ 245
 * already ON the west arm's kerb-lane line and turned the remaining 65° in one
 * vertex (1.11 m of «radius» against a car whose tightest body-centre circle
 * is 3.955 m), and mistake 2 cut out of the inner lane on two corners (+52°,
 * +10°; 1.96 m). Where two drive steps met the ghost skipped up to 2.6 m of
 * ring in one frame. The drives are now cut from one continuous line each,
 * built with ./ringDrive: curvature only ever ramps, the tightest radius the
 * correct drive and mistake 1 ask for is the exit's 9 m, and the tightest any
 * of the three asks for is mistake 2's 6 m cut (the product car's limit is
 * 3.955 m kinematic, ≈ 4.17 m physics; the family floor is 4.6 m —
 * traces/drivablePath.ts DRIVABLE_MIN_CENTRE_RADIUS_M). Pins:
 * traces/__tests__/ring-demos-drivable.test.ts.
 *
 * FIVE ENVELOPES DECIDE EVERY NUMBER BELOW — all five MEASURED on this
 * district through the live rung chain, none guessed (the sweeps are pinned in
 * the drivability test):
 *
 *  · THE LEFT INDICATOR IS NOT DECORATION, IT IS THE ONLY WAY THE INNER LANE
 *    IS LEGAL — twice over. чл. 25 demands the far-exit lane be announced; and
 *    NOT_KEEPING_RIGHT (the engine's чл. 15 detector) grades ANY sustained
 *    non-rightmost lane, exempting exactly one thing: `indicator === "left"`.
 *    Law and detector agree; the shadow signals.
 *
 *  · WHERE THE CAR WAITS: with its nose 0.8 m short of the painted give-way
 *    bar (centre y = −54.67) — where the product draws the student's own
 *    «Карай до линията за пропускане» gate (./ringMini STOP_NOSE_BEFORE_BAR_M)
 *    and inside the give-way watch, which since B15 is armed at the paint. The
 *    old demos waited at y = −35.5: 16 m past the bar, the nose half a metre
 *    inside the circulatory carriageway, 5.9 m from the outer-lane car
 *    sweeping by — a stance the lesson's own instruction 3 does not teach.
 *
 *  · THE WAITS. The shadow's 15 s sits in a measured clean window of 10 s
 *    and up (WAIT_WINDOW); mistake 1's and mistake 2's are their own
 *    (M1_WAIT_SEC, M2_WAIT_SEC — each says what decides it).
 *
 *  · THE CAR PACE 4.0 m/s IS AN ANGULAR CHOICE, NOT A SPEED ONE (the
 *    template). 4.0 m/s on r = 30.06 is 7.63 °/s; the driver at 12 km/h on
 *    r = 21.94 is 8.70 °/s. The 1.07 °/s the inner lane buys is what carries
 *    the driver clear of the outer lane before the lane change — which is
 *    precisely why the inner lane IS the far-exit lane.
 *
 *  · THE RING PACE IS 12 km/h AND THE TURN DETECTOR IS SLACK HERE. It fires at
 *    |Σ heading deltas| > 55° over a sliding 3 s window inside a junction area,
 *    and the whole ring is junction area. At 12 km/h on r = 21.94 the window
 *    carries 26°. The entries turn 45.7° (curb) and 47.8° (inner) to the right
 *    and are not turns; the correct exit is a signalled turn; mistake 2's cut
 *    is the only unsignalled one (see M2_PEEL_PHI_DEG).
 *
 * WHY MISTAKE 2 GRADES FIVE CODES. Cutting straight out of the inner lane
 * across a circulating car is not one fault, it is чл. 25 broken four ways in
 * one movement of the wheel, and the engine bills each: the manoeuvre is
 * unannounced (TURN_WITHOUT_INDICATOR + LANE_CHANGE_WITHOUT_INDICATOR),
 * unchecked (LANE_CHANGE_WITHOUT_MIRROR_CHECK), and taken across a vehicle with
 * priority (FAILED_TO_YIELD, from the uncontrolled-junction tracker at the west
 * mouth) — and then the two cars touch (COLLISION, emitted by the
 * RoundaboutEntryRunner's OWN contact branch, not an authored beat). Every code
 * is earned; none is authored; the card copy carries all five as the one act
 * they are.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_LANE_CHOICE } from "../lessons/scenario/templates-roundabout";
import { CHASSIS_HALF_EXTENTS } from "../vehicle";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import {
  ringPose,
  RingPathBuilder,
  type CurvatureStretch,
  type RingExitOptions,
  type RingPath,
} from "./ringDrive";
import { STOP_NOSE_BEFORE_BAR_M } from "./ringMini";

export const SC_RB_LANE_CHOICE_ID = "sc-rb-lane-choice";

/** Ring centerline radius (rb-2lane-v1 meta.scenario.params.ringRadiusM). */
const R = 26;
/** Ring LANE centre radii (meta.scenario.ringLaneRadiiM): laneId 0 = outer. */
const LANE_OUTER_R = 30.06;
const LANE_INNER_R = 21.94;
/** South-arm inbound lane centres (meta.scenario.armLaneCentersM). */
const ARM_CURB_X = 12.19;
const ARM_INNER_X = 4.06;
/** West-arm OUTBOUND lane centres: driving west, north is the driver's right,
 *  so the curb lane is y = +12.19 and the inner one y = +4.06. */
const WEST_CURB_Y = 12.19;
const WEST_INNER_Y = 4.06;
/** The south spawns (rb2-spawn-south-inner / -outer). */
const SPAWN_Y = -101;
/** Where the approach comes off the arm's pace. */
const Y_SLOW = -75;

/** The М8 give-way bar across the south arm — the district's own paint
 *  (asserted against the painter in the drivability test). */
const GIVE_WAY_BAR_Y = -51.85;
/** Where a yielding demo's centre rests: nose 0.8 m short of the bar. */
const HOLD_Y = GIVE_WAY_BAR_Y - STOP_NOSE_BEFORE_BAR_M - CHASSIS_HALF_EXTENTS.z;
/**
 * The wait at the line, s. From rest at the bar the outer-lane car is met
 * coming round from the west node; the driver lets it cross the mouth and
 * moves off behind it. Centre of the measured clean window
 * (WAIT_WINDOW in traces/__tests__/ring-demos-drivable.test.ts).
 */
const WAIT_SEC = 15;
/** Ring pace, km/h (the shadow + mistake 1). */
const RING_KMH = 12;
/** Entry pace, km/h: from rest at the bar, across the outer ring lane, onto the ring. */
const ENTRY_KMH = 15;

/** The dials a pin may sweep (absent = the authored drive). */
export interface RbLaneChoiceDials {
  /** Every demo: the wait at the line, s. */
  waitSec?: number;
  /** Shadow / mistake 1: the ring pace, км/ч. */
  ringKmh?: number;
  /** Mistake 2: the ring pace, км/ч. */
  m2RingKmh?: number;
  /** Mistake 2: the cut's pace, км/ч. */
  m2PeelKmh?: number;
  /** Mistake 2: the cut's shape (see M2_PEEL_PHI_DEG). */
  m2PeelPhiDeg?: number;
  m2CutHeadingDeg?: number;
  m2CutChordM?: number;
}

/**
 * The entry onto a ring lane from the arm lane that feeds it: straight on from
 * the bar, a right turn on a 12 m radius (wound over 4 m), a short chord and
 * the wheel wound left over 6 m onto the lane's own circle, ON it at φ = 50°.
 * 47.8° of right turn onto the inner lane, 45.7° onto the outer: under the
 * turn detector's 55°, so neither is a turn.
 */
const ENTRY_SHAPE = { landPhiDeg: 50, turnRadiusM: 12, rampInM: 4, rampOutM: 4, joinRampM: 6 } as const;

/**
 * The exit from the OUTER ring lane onto the west arm's curb lane: the wheel
 * comes off the ring at φ = 232° (38° of ring before the west arm's axis), a
 * chord, and a right turn on a 9 m radius (wound over 2 m) that ends on the
 * lane's centre, y = +12.19, headed west — 2.7 m inside the mouth's kerb at
 * its closest (pinned). The pivot it replaces turned the same 65° at φ 245.
 * The wheel goes from the ring's left lock to the exit's right one over 4 m
 * of road (1.2 s at the ring pace): the swing the rig's careful drive made
 * here in one arc (rbExitDrives.ts: φ 233, ρ 14.8 m, no easing at all).
 */
const EXIT_PEEL_PHI_DEG = 232;
const EXIT_SHAPE: Omit<RingExitOptions, "ringR"> = {
  peelPhiDeg: EXIT_PEEL_PHI_DEG,
  exitHeadingDeg: 270,
  laneOffsetM: WEST_CURB_Y,
  turnRadiusM: 9,
  rampInM: 2,
  rampOutM: 2,
  joinRampM: 2,
};

/**
 * THE LANE CHANGE, on a circle: inner → outer across φ 186° → 232° — the
 * quintic radius ramp of ./ringDrive (`ringShiftTo`), so the car leaves the
 * inner circle and joins the outer one with heading AND curvature continuous,
 * and the wheel comes off the ring the moment it is on the outer lane.
 * 46° of ring for 8.12 m of lateral travel; the car straddles the lane line
 * (|laneOffsetM| > 3.25) for under a second (pinned) — far under
 * laneKeepSustainSec (3 s).
 *
 * WHY IT STARTS AT φ 186° AND NOT AT THE AXIS. The engine grades a lane change
 * only when the lane id flips ≥ laneChangeJointGraceSec (1.5 s) after the
 * locator has handed the car from one ring edge to the next, and the ring's
 * edges meet at the north node: a car on the inner lane is handed from
 * rb2-e-ring-en to rb2-e-ring-nw ≈ 16° past it (EDGE_SWITCH_MARGIN_M is 4 m
 * and the inner lane rides 4.06 m off the edge's line). A change begun at
 * φ 178° flipped 1.5 s after that hand-over and its praise was dropped as a
 * joint artefact (measured); begun at 186° the flip lands ≈ 2 s after it.
 *
 * WHERE THE RIGHT INDICATOR GOES ON: φ = 176°, as the car passes the north
 * arm's OUTBOUND lanes (they leave the ring between φ 152° and 171°): the exit
 * before ours is behind us, so the lever can no longer be read as «I am
 * leaving here». The mirror look goes with it; the radius starts to open
 * 10° (1.2 s) later.
 */
const SIGNAL_PHI_DEG = 176;
const CHANGE_FROM_PHI_DEG = 186;

/** Spawn → REST before the bar, in the lane `laneX`. */
function toLine(laneX: number): RingPathBuilder {
  return new RingPathBuilder({ x: laneX, y: SPAWN_Y, headingDeg: 0 })
    .straightToY(Y_SLOW)
    .mark("slow")
    .straightToY(HOLD_Y)
    .mark("line");
}

/**
 * The shared approach down the south arm to REST before the bar. The lane is
 * the whole difference between the shadow and mistake 1: the arrows say the
 * third exit belongs to the inner lane (x = 4.06), and mistake 1 takes the
 * curb lane (x = 12.19) anyway. Arriving at rest is what keeps the wait
 * innocent.
 */
function approachSteps(p: RingPath): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: p.between("start", "slow"), targetKmh: 45, stopAtEnd: false },
    { kind: "drive", points: p.between("slow", "line", { stop: true }), targetKmh: 16 },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

function buildShadowPath(): RingPath {
  return toLine(ARM_INNER_X)
    .enterRing({ ...ENTRY_SHAPE, ringR: LANE_INNER_R })
    .mark("ring")
    .ringTo(SIGNAL_PHI_DEG)
    .mark("signal")
    .ringTo(CHANGE_FROM_PHI_DEG)
    .ringShiftTo(EXIT_PEEL_PHI_DEG, LANE_OUTER_R)
    .exitRing(EXIT_SHAPE)
    .mark("lane")
    .straightToX(-72)
    .mark("end")
    .build();
}
let shadowPath: RingPath | null = null;
const SHADOW = (): RingPath => (shadowPath ??= buildShadowPath());

export function scRbLaneChoiceShadowScript(dials: RbLaneChoiceDials = {}): DriveScript {
  const p = SHADOW();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Изходът ни е третият — западният. Стрелките казват: далечните изходи са от ВЪТРЕШНАТА лента. Заемаме я още сега.",
      },
      { kind: "glance", mirror: "left" },
      // The far-exit announcement — and the чл. 15 exemption (see the header).
      { kind: "indicator", setting: "left" },
      ...approachSteps(p),
      {
        kind: "annotation",
        textBg: "Ляв мигач за далечния изход. На линията спираме: в кръга има кола по външната лента и тя е с предимство.",
      },
      { kind: "glance", mirror: "left" },
      {
        // The wait: the circulator sweeps the mouth and out onto the east arc.
        // Stopped, so the left half-plane is irrelevant — and at rest the
        // drill's own yield is honest.
        kind: "pause",
        sec: dials.waitSec ?? WAIT_SEC,
        brake: true,
      },
      { kind: "annotation", textBg: "Мина. Влизаме след нея — но във ВЪТРЕШНАТА лента, не след нея по външната." },
      { kind: "glance", mirror: "left" },
      {
        // The entry onto the INNER lane: over the bar, across the outer ring
        // lane the car has just left, and onto r = 21.94 at φ = 50°.
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: ENTRY_KMH,
        stopAtEnd: false,
      },
      {
        // The ring PROPER, on the inner lane, past the first exit (east, φ = 90)
        // and the second (north, φ = 180) — neither is ours, and the left
        // indicator says so the whole way.
        kind: "drive",
        points: p.between("ring", "signal"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        // WAS «Северният подход остана зад нас…», shown at the north axis: the
        // north ARM's entry lanes (φ 189°–208°) are still ahead of the car
        // there. Its EXIT lanes (φ 152°–171°) are behind it — and the exit is
        // what the sentence is about.
        textBg: "Северният изход остана зад нас — последният преди нашия. Сега огледало, десен мигач и плавно навън.",
      },
      // The exit is a LANE CHANGE first and a turn second. Announced and checked
      // in that order, it earns SAFE_LANE_CHANGE instead of mistake 2's cascade.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Inner → outer across φ 186…232, then off the ring and onto the west
        // arm's CURB lane.
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: ringKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Вътрешна лента до последния подход, после престрояване с огледало и мигач — и излизаме. Никой в кръга не намали заради нас.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Обикаляне по външната до далечния изход" (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

/**
 * THE DRAG RADIUS, and it is the one number this demo is made of. The outer
 * lane's centre is r = 30.06 and the lane line between the two ring lanes is
 * r = 26.0. r = 26.3 puts the car 3.76 m off its own lane centre — past
 * laneKeepMaxOffsetM (3.25, the straddle band) with 0.51 m to spare — while
 * staying 0.65 m clear of the laneId flip (the locator's hysteresis hands the
 * car to lane 1 below r ≈ 25.65). So it is a car RIDING THE LINE: graded
 * POOR_LANE_KEEPING, never mistaken for a lane change, and with the hero's own
 * half-width (0.85 m) its left side is genuinely in the other lane.
 *
 * That is what „обикаляне по външната до далечния изход" looks like from
 * inside the cabin, and it is why it is the graded fault rather than a
 * bookkeeping one: a driver in the exit lane who is not exiting spends the
 * whole ring fighting a lane that peels away at every mouth, and the line is
 * where that fight shows. Held across BOTH mouths the driver should not be at,
 * the episode grades ONCE.
 */
const DRAG_R = 26.3;
/**
 * Mistake 1's wait at the line, s. From the CURB lane the outer-lane car
 * passes the mouth 25.97 m from the driver — on the edge of the 26 m reach
 * at which the product counts a circulating car as a conflict for the driver
 * at all (traffic/system.ts CIRCULATING_REACH_M) — so the entry is read as a
 * yield only when he follows it in promptly: measured, the commendation is
 * earned for waits of 11–12 s and not for 10 or ≥ 12.5 (M1_WAIT_WINDOW in the
 * drivability test). 11.5 puts him 17 m (4 s) behind the car he let by.
 */
const M1_WAIT_SEC = 11.5;
/**
 * The sag onto the line: φ 62° → 107° (the quintic ramp — 3.76 m in over 45°
 * of ring), the hold to φ 200°, and back out to the lane's centre by the
 * exit's peel (φ 232°). It starts 12° after the entry lands: the entry is
 * itself 45.7° of RIGHT sweep, and the inward drift is not started inside the
 * same 3 s window. The hold runs 20° past the north mouth's axis so that the
 * line is ridden for the 15 s the lesson's pins read
 * (lessons/scenario/__tests__/rb-lane-choice-exit-handover.test.ts) — measured
 * on the live chain, every rung: 14.57 s with the hold to φ 190°, 15.73 s to φ 200°.
 */
const DRAG_FROM_PHI_DEG = 62;
const DRAG_BY_PHI_DEG = 107;
const DRAG_HOLD_TO_PHI_DEG = 200;

function buildOuterLanePath(): RingPath {
  return toLine(ARM_CURB_X)
    .enterRing({ ...ENTRY_SHAPE, ringR: LANE_OUTER_R })
    .mark("ring")
    .ringTo(DRAG_FROM_PHI_DEG)
    .mark("sag")
    .ringShiftTo(DRAG_BY_PHI_DEG, DRAG_R)
    .ringTo(DRAG_HOLD_TO_PHI_DEG)
    .mark("signal")
    .ringShiftTo(EXIT_PEEL_PHI_DEG, LANE_OUTER_R)
    .exitRing(EXIT_SHAPE)
    .mark("lane")
    .straightToX(-72)
    .mark("end")
    .build();
}
let outerLanePath: RingPath | null = null;
const OUTER_LANE = (): RingPath => (outerLanePath ??= buildOuterLanePath());

export function scRbLaneChoiceMistakeOuterLaneScript(dials: RbLaneChoiceDials = {}): DriveScript {
  const p = OUTER_LANE();
  const ringKmh = dials.ringKmh ?? RING_KMH;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката започва преди кръга: изходът е третият, а колата заема ВЪНШНАТА лента — лентата на първите изходи.",
      },
      ...approachSteps(p),
      // No left indicator: the outer lane is laneId 0, so чл. 15 has nothing to
      // say — this driver's fault is the CHOICE, and the line it produces.
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: dials.waitSec ?? M1_WAIT_SEC, brake: true },
      { kind: "annotation", textBg: "Входът е изряден — пропуска циркулиращата и влиза чисто. По външната лента." },
      {
        // The curb lane's entry, onto the OUTER ring lane at φ = 50°.
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: ENTRY_KMH,
        stopAtEnd: false,
      },
      {
        // Settle on the outer lane proper first (see DRAG_FROM_PHI_DEG).
        kind: "drive",
        points: p.between("ring", "sag"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Външната лента извежда на всеки изход. Колата не иска да излиза — и линията ѝ увисва на разделителната.",
      },
      {
        // The sag onto the line, then HOLD it across BOTH foreign mouths
        // (east φ = 90, north φ = 180) — the two exits this driver is not
        // taking, in the lane that exists to take them.
        kind: "drive",
        points: p.between("sag", "signal"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      // The exit itself is done correctly — announced and checked. The ONE
      // taught fault is the lane and the line, never stacked with a second.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: p.between("signal", "end", { stop: true }),
        targetKmh: ringKmh,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Лентата се избира ПРЕДИ кръга, по стрелките на платното: външната — за първите изходи, вътрешната — за далечните (чл. 15).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изход направо през външната кола" (the чл. 25 cascade)
// ---------------------------------------------------------------------------

/**
 * THE WAIT AND THE RING PACE THAT PUT THE CAR THERE. The staged circulator is
 * a metronome from the moment the player arms it (the sync is pinned out — see
 * the template), so the only dials that decide where it stands when the driver
 * reaches the west mouth are when he moved off and how fast he went round.
 * Two facts have to come out in this order, and both are the product's own:
 *
 *   1. the uncontrolled-junction tracker of the west mouth convicts
 *      (FAILED_TO_YIELD, right-hand-rule) — he has been crossing the line of a
 *      car coming from his right for 0.9 s and has not stopped;
 *   2. then the two bodies touch (COLLISION — the car brakes, and is still
 *      struck: it lost its whole 4 m/s to him, pinned).
 *
 * The window in which both land in that order is NARROW, and it is narrow in
 * the product, not in the script: arrive 0.1 s earlier and the circulator
 * (its own player guard) stops 3–4 m short of him — a forced stop, billed,
 * but no crash; arrive 0.1 s later and he strikes it before the tracker's
 * 0.9 s have run, and the crash comes first. Measured (wait × ring pace, the
 * cut fixed): at a 10 s wait, 13.4–13.5 km/h — and 13.3 / 13.6 already fall
 * out on either side (M2_RING_BAND in traces/__tests__/ring-demos-drivable
 * .test.ts). The old demo's 13.3 (at a 15 s wait from y = −35.5) was the same
 * knife-edge, measured the same way.
 */
const M2_RING_KMH = 13.45;
/** Mistake 2's wait at the line, s (see M2_RING_KMH). */
const M2_WAIT_SEC = 10;

/**
 * THE CUT — straight out of the inner lane, across the outer one, in the shape
 * a driver who «just goes» actually drives: the wheel comes off the inner
 * circle at φ = 238° (M2_PEEL_PHI_DEG), a firm right turn on a 6 m radius
 * points the car WEST-SOUTH-WEST (heading 254°, M2_CUT_HEADING_DEG), it runs
 * straight across the outer lane on that line for M2_CUT_CHORD_M, and only
 * on the arm does it straighten up west (a 10 m radius). ≈ 60° of right turn
 * inside 3 s with the LEFT indicator still on — what the turn detector calls a
 * turn and the engine bills as TURN_WITHOUT_INDICATOR.
 *
 * WHY A STRAIGHT IN THE MIDDLE. The car it cuts across is graded by the
 * uncontrolled-junction tracker of the west mouth (FAILED_TO_YIELD,
 * right-hand-rule), which convicts once a car crossing his line from the right
 * has been in view for 0.9 s (YIELD_CONVICT_SUSTAIN_SEC) while he keeps
 * moving. A single arc from the ring to the arm (the first re-authoring:
 * ringExitProgramme, 7 m) only points him across the car's line at the very
 * end of the turn, so the contact came 0.5 s after the car came into view and
 * the conviction — when it came at all — landed after the crash (measured).
 * The straight is the stretch on which he is visibly crossing a lane with a
 * car in it and does not stop: the conviction, then the contact. The old demo
 * got the same order from two pivots (+52°, +10°) on a line no car can follow
 * (1.96 m of «radius»).
 */
const M2_PEEL_KMH = 14;
const M2_PEEL_PHI_DEG = 238;
const M2_CUT_HEADING_DEG = 254;
const M2_CUT_CHORD_M = 3;
const M2_CUT_RADIUS_M = 6;
const M2_STRAIGHTEN_RADIUS_M = 10;
const M2_CUT_RAMP_M = 1.5;
const M2_JOIN_RAMP_M = 2;
/** Where mistake 2's mid-ring caption is shown: past the north mouth. */
const M2_PAST_NORTH_PHI_DEG = 185;

/** The cut's curvature programme from the inner circle at `peelPhiDeg`. */
function cutProgramme(peelPhiDeg: number, cutHeadingDeg: number, chordM: number): CurvatureStretch[] {
  const ringHeadingDeg = ringPose(peelPhiDeg, LANE_INNER_R).headingDeg;
  // The join ramp unwinds the ring's left curvature: half its length × 1/r.
  const offRingDeg = ringHeadingDeg - ((M2_JOIN_RAMP_M / (2 * LANE_INNER_R)) * 180) / Math.PI;
  const turn = (deltaDeg: number, radiusM: number): CurvatureStretch[] => {
    const k = 1 / radiusM;
    const holdM = (((((deltaDeg % 360) + 360) % 360) * Math.PI) / 180) / k - M2_CUT_RAMP_M;
    if (!(holdM >= 0)) throw new Error(`sc-rb-lane-choice cut: ${deltaDeg}° on ${radiusM} m is less than its ramps`);
    return [
      { lenM: M2_CUT_RAMP_M, k0: 0, k1: k },
      { lenM: holdM, k0: k, k1: k },
      { lenM: M2_CUT_RAMP_M, k0: k, k1: 0 },
    ];
  };
  return [
    { lenM: M2_JOIN_RAMP_M, k0: -1 / LANE_INNER_R, k1: 0 },
    ...turn(cutHeadingDeg - offRingDeg, M2_CUT_RADIUS_M),
    { lenM: chordM, k0: 0, k1: 0 },
    ...turn(270 - cutHeadingDeg, M2_STRAIGHTEN_RADIUS_M),
  ];
}

function buildExitAcrossPath(
  peelPhiDeg = M2_PEEL_PHI_DEG,
  cutHeadingDeg = M2_CUT_HEADING_DEG,
  chordM = M2_CUT_CHORD_M,
): RingPath {
  return toLine(ARM_INNER_X)
    .enterRing({ ...ENTRY_SHAPE, ringR: LANE_INNER_R })
    .mark("ring")
    .ringTo(peelPhiDeg, { north: M2_PAST_NORTH_PHI_DEG })
    .mark("peel")
    .programme(cutProgramme(peelPhiDeg, cutHeadingDeg, chordM))
    .mark("lane")
    .straightToX(-40)
    .mark("end")
    .build();
}
let exitAcrossPath: RingPath | null = null;
const EXIT_ACROSS = (): RingPath => (exitAcrossPath ??= buildExitAcrossPath());

export function scRbLaneChoiceMistakeExitAcrossScript(dials: RbLaneChoiceDials = {}): DriveScript {
  const p =
    dials.m2PeelPhiDeg === undefined && dials.m2CutHeadingDeg === undefined && dials.m2CutChordM === undefined
      ? EXIT_ACROSS()
      : buildExitAcrossPath(dials.m2PeelPhiDeg, dials.m2CutHeadingDeg, dials.m2CutChordM);
  const ringKmh = dials.m2RingKmh ?? M2_RING_KMH;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път лентата е вярната — вътрешната, с ляв мигач. Гледай КАК напуска кръга.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      ...approachSteps(p),
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: dials.waitSec ?? M2_WAIT_SEC, brake: true },
      {
        kind: "drive",
        points: p.between("line", "ring"),
        targetKmh: ENTRY_KMH,
        stopAtEnd: false,
      },
      {
        // The inner lane past the east and the north mouths.
        kind: "drive",
        points: p.between("ring", "north"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        // Shown once both exits ARE behind the car (until 2026-10-11 it was
        // shown on the ring's first metres, before either).
        kind: "annotation",
        textBg: "Вътрешната лента, два подминати изхода — дотук учебникарски. А отдясно, по външната, върви кола.",
      },
      {
        // On to the third exit — no repositioning, no mirror, no right
        // indicator. The left one is still on.
        kind: "drive",
        points: p.between("north", "peel"),
        targetKmh: ringKmh,
        stopAtEnd: false,
      },
      {
        // Straight out. Across the outer lane, across the car in it.
        kind: "drive",
        points: p.between("peel", "end"),
        targetKmh: dials.m2PeelKmh ?? M2_PEEL_KMH,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 0.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Изходът от вътрешната лента не е завой, а престрояване и после завой: огледало, десен мигач, във външната лента — и чак тогава навън (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScRbLaneChoiceTraceName =
  | "shadow-correct"
  | "mistake-outer-lane-far-exit"
  | "mistake-exit-across-outer";

const SCRIPTS: Record<ScRbLaneChoiceTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scRbLaneChoiceShadowScript },
  "mistake-outer-lane-far-exit": { kind: "mistake", script: scRbLaneChoiceMistakeOuterLaneScript },
  "mistake-exit-across-outer": { kind: "mistake", script: scRbLaneChoiceMistakeExitAcrossScript },
};

/**
 * Record one of the three drives against a loaded rb-2lane-v1 document — the
 * TEMPLATE's staged circulator armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScRbLaneChoiceDrive(
  districtRaw: unknown,
  name: ScRbLaneChoiceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_RB_LANE_CHOICE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_RB_LANE_CHOICE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

/** Ring/lane constants the batteries assert against the generated district. */
export const SC_RB_LANE_CHOICE_GEOMETRY = {
  R,
  LANE_OUTER_R,
  LANE_INNER_R,
  ARM_CURB_X,
  ARM_INNER_X,
  WEST_CURB_Y,
  WEST_INNER_Y,
  GIVE_WAY_BAR_Y,
  HOLD_Y,
  WAIT_SEC,
  DRAG_R,
} as const;
