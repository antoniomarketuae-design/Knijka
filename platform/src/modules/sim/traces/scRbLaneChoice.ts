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
 * x = 12.19 (curb) and x = 4.06 (inner); ring limit 30, arms 50. This drill
 * takes the THIRD (west) exit — the one the arrows reserve for the inner lane.
 *
 * FIVE ENVELOPES DECIDE EVERY NUMBER BELOW — all five MEASURED on this
 * district, none guessed:
 *
 *  · THE LEFT INDICATOR IS NOT DECORATION, IT IS THE ONLY WAY THE INNER LANE
 *    IS LEGAL — twice over. чл. 25 demands the far-exit lane be announced; and
 *    NOT_KEEPING_RIGHT (the engine's чл. 15 detector) grades ANY sustained
 *    non-rightmost lane, exempting exactly one thing: `indicator === "left"`.
 *    Measured: a silent inner-lane lap convicts NOT_KEEPING_RIGHT at t = 12.6
 *    (keepRightSustainSec = 12). Law and detector agree; the shadow signals.
 *
 *  · THE YIELD LINE IS AT y = −35.5, AND BOTH WALLS ARE MEASURED. It must sit
 *    INSIDE the roundabout tracker's decision zone (R + ROUNDABOUT_ENTRY_
 *    MARGIN_M = 38 m from the centre) or the wait earns nothing — and far
 *    enough out that the circulator sweeping the mouth at r = 30.06 does not
 *    trip STANDSTILL_GAP_TOO_CLOSE on a car standing at the line. On this
 *    R = 26 ring those two walls are ~7 m apart, and the sweep found the
 *    window exactly: y = −34 convicts STANDSTILL_GAP_TOO_CLOSE (measured, min
 *    separation 4.41 m); y = −37 needs a longer wait to stay innocent;
 *    y = −35.5 is clean across the whole wait band with 5.94 m of clearance.
 *
 *  · THE WAIT IS 15 s AND IT IS CENTRED IN A MEASURED WINDOW. At y = −35.5 the
 *    sweep grades: wait 13 ⇒ FAILED_TO_YIELD (the car is still in the left
 *    half-plane as the chord commits), wait 14/15/16 ⇒ ZERO violations +
 *    YIELDED_TO_PRIORITY. 15 is the centre — ~1 s of margin either way.
 *
 *  · THE CAR PACE 4.0 m/s IS AN ANGULAR CHOICE, NOT A SPEED ONE. The sibling
 *    rb-mini drills all run 2.9 m/s; this ring is bigger and, more to the
 *    point, this is the only drill where the player must OVERTAKE the staged
 *    car and then cross its lane. 4.0 m/s on r = 30.06 is 7.63 °/s; the player
 *    at 12 km/h on r = 21.94 is 8.70 °/s. The 1.07 °/s the inner lane buys is
 *    what carries the driver clear of the outer lane before the spiral — which
 *    is precisely why the inner lane IS the far-exit lane. Measured: the
 *    shadow's closest approach to the car after the mouth is 5.94 m.
 *
 *  · THE RING PACE IS 12 km/h AND THE TURN DETECTOR IS SLACK HERE. It fires at
 *    |Σ heading deltas| > 55° over a sliding 3 s window inside a junction area,
 *    and the whole ring is junction area (four mouths, ≤ 20 m from every ring
 *    point). At 12 km/h on r = 21.94 the window carries 26° — half the wall.
 *    That slack is what lets the EXIT's deliberate ~62° break register as one
 *    clean turnStarted instead of drowning in the ring's own curvature.
 *
 * WHY MISTAKE 2 GRADES FIVE CODES AND NOT THE TWO THE BACKLOG GUESSED. The
 * brief predicted „COLLISION + TURN_WITHOUT_INDICATOR". The production stack
 * disagrees, and doc 72 RB-04 predicted the disagreement verbatim — „grading
 * then falls to existing lane-change + priority vocabulary". Cutting straight
 * out of the inner lane across a circulating car is not one fault, it is чл. 25
 * broken four ways in one movement of the wheel, and the engine bills each:
 * the maneuver is unannounced (TURN_WITHOUT_INDICATOR + LANE_CHANGE_WITHOUT_
 * INDICATOR), unchecked (LANE_CHANGE_WITHOUT_MIRROR_CHECK), and taken across a
 * vehicle with priority (FAILED_TO_YIELD, from the uncontrolled-junction
 * tracker at the west mouth) — and then the two cars touch (COLLISION, emitted
 * by the RoundaboutEntryRunner's OWN contact branch at a measured 1.82 m, not
 * an authored beat). Every code is earned; none is authored; the card copy
 * carries all five as the one act they are. Attempts to suppress the
 * lane-change pair were measured and rejected: slowing the peel under
 * laneChangeMinSpeedKmh (10) also drops the collision AND the turn (measured at
 * 9 km/h: only FAILED_TO_YIELD survives, separation 4.17 m), which would buy
 * the backlog's code list by deleting the crash the lesson exists to show.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_RB_LANE_CHOICE } from "../lessons/scenario/templates-roundabout";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

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

/** The yield line — see the header's two-wall measurement. */
const HOLD_Y = -35.5;
/** The wait at the line, seconds — the centre of the measured clean window. */
const WAIT_SEC = 15;
/** Ring pace, km/h (the shadow + mistake 1). */
const RING_KMH = 12;

/** Ring point at circulation angle φ (degrees from the SOUTH node, CCW through
 * EAST — φ 90 = east, 180 = north, 270 = west) on a given lane radius. */
function ring(phiDeg: number, radius: number): [number, number] {
  const a = (phiDeg * Math.PI) / 180;
  return [radius * Math.sin(a), -radius * Math.cos(a)];
}

/** Sampled ring run φ0 → φ1 (CCW) at a fixed lane radius. */
function ringRun(phi0: number, phi1: number, radius: number, stepDeg = 10): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1 + 1e-9; p += stepDeg) out.push(ring(p, radius));
  return out;
}

/**
 * A SMOOTH radius ramp r0 → r1 across φ0 → φ1 (smoothstep easing, 5° samples) —
 * the lane change, on a circle. It is not a nicety: a naive two-point cross
 * (ring lane → ring lane) puts a ~50° heading break in the middle of the arc,
 * and the turn detector reads that as a spurious LEFT turn under the right
 * indicator (measured: TURN_WITHOUT_INDICATOR at the spiral joint). The
 * smoothstep keeps every per-waypoint delta under 12° so the only turnStarted
 * of the whole drill is the exit.
 */
function spiral(phi0: number, phi1: number, r0: number, r1: number, stepDeg = 5): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let p = phi0; p <= phi1 + 1e-9; p += stepDeg) {
    const u = (p - phi0) / (phi1 - phi0);
    const s = u * u * (3 - 2 * u);
    out.push(ring(p, r0 + (r1 - r0) * s));
  }
  return out;
}

/**
 * The shared approach down the south arm to REST on the yield line. `laneX`
 * picks the approach lane — and that single argument is the whole difference
 * between the shadow and mistake 1: the arrows say the third exit belongs to
 * the inner lane (x = 4.06), and mistake 1 takes the curb lane (x = 12.19)
 * anyway. Arriving at rest is what keeps the wait innocent (see the header).
 */
function approachSteps(laneX: number): DriveScript["steps"] {
  return [
    { kind: "glance", mirror: "rear" },
    { kind: "drive", points: [[laneX, -101], [laneX, -70], [laneX, -45]], targetKmh: 45, stopAtEnd: false },
    { kind: "drive", points: [[laneX, -45], [laneX, HOLD_Y]], targetKmh: 14 },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scRbLaneChoiceShadowScript(): DriveScript {
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
      ...approachSteps(ARM_INNER_X),
      {
        kind: "annotation",
        textBg: "Ляв мигач за далечния изход. На линията спираме: в кръга има кола по външната лента и тя е с предимство.",
      },
      { kind: "glance", mirror: "left" },
      {
        // The wait: the circulator sweeps the mouth and out onto the east arc.
        // Stopped, so the left half-plane is irrelevant (the tracker needs
        // > RHR_MOVING_KMH = 3) — and at rest the drill's own yield is honest.
        kind: "pause",
        sec: WAIT_SEC,
        brake: true,
      },
      { kind: "annotation", textBg: "Мина. Влизаме след нея — но във ВЪТРЕШНАТА лента, не след нея по външната." },
      {
        // The entry chord onto the INNER lane: a flat NE line from the mouth to
        // ring(40), sweeping the azimuth past the tracker's RB_ON_RING_DEG (35°)
        // stand-down with ~40° of total heading change — under the 55° turn wall,
        // so it is both quick to ring priority AND turnStarted-free.
        kind: "drive",
        points: [[ARM_INNER_X, HOLD_Y], [5.5, -30], [7.5, -26], ring(30, LANE_INNER_R), ring(40, LANE_INNER_R)],
        targetKmh: 15,
        stopAtEnd: false,
      },
      {
        // The ring PROPER, on the inner lane, past the first exit (east, φ = 90)
        // and up to the second (north, φ = 180) — neither is ours, and the left
        // indicator says so the whole way.
        kind: "drive",
        points: ringRun(40, 180, LANE_INNER_R),
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Северният подход остана зад нас — последният преди нашия. Сега огледало, десен мигач и плавно навън.",
      },
      // The exit is a LANE CHANGE first and a turn second. Announced and checked
      // in that order, it earns SAFE_LANE_CHANGE instead of mistake 2's cascade.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        // Inner → outer across φ 185…235 (the smoothstep spiral), then the outer
        // lane to the peel at φ = 245 and out onto the west arm's CURB lane.
        // 50° of ring for 8.13 m of lateral travel keeps the straddle band
        // (|laneOffsetM| > 3.25) under laneKeepSustainSec (3 s) — measured 2.8 s
        // at the joint, the drill's tightest innocence margin.
        kind: "drive",
        points: [
          ...spiral(185, 235, LANE_INNER_R, LANE_OUTER_R),
          ...ringRun(240, 245, LANE_OUTER_R, 5),
          [-40, WEST_CURB_Y],
          [-56, WEST_CURB_Y],
          [-72, WEST_CURB_Y],
        ],
        targetKmh: RING_KMH,
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
 * half-width (0.95 m) its left side is genuinely in the other lane.
 *
 * That is what „обикаляне по външната до далечния изход" looks like from
 * inside the cabin, and it is why it is the graded fault rather than a
 * bookkeeping one: a driver in the exit lane who is not exiting spends the
 * whole ring fighting a lane that peels away at every mouth, and the line is
 * where that fight shows. Held from φ = 70 to φ = 190 — across BOTH mouths the
 * driver should not be at — the episode grades ONCE (measured t = 33.6).
 */
const DRAG_R = 26.3;

export function scRbLaneChoiceMistakeOuterLaneScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката започва преди кръга: изходът е третият, а колата заема ВЪНШНАТА лента — лентата на първите изходи.",
      },
      ...approachSteps(ARM_CURB_X),
      // No left indicator: the outer lane is laneId 0, so чл. 15 has nothing to
      // say — this driver's fault is the CHOICE, and the line it produces.
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      { kind: "annotation", textBg: "Входът е изряден — пропуска циркулиращата и влиза чисто. По външната лента." },
      {
        // The curb lane's entry chord, and its waypoints are MONOTONE by
        // measurement, not by eye: the outer ring lane passes within a metre of
        // this arm lane (r = 30.06 vs x = 12.19), so a chord borrowed from the
        // inner-lane drives overshoots ring(30) and swings back — a −52°/+81°
        // zigzag the turn detector reads as a real turn (measured: spurious
        // turnStarted at t = 29.4, φ = 50, indicator off). These four points
        // rise smoothly onto the arc: Σ = +46° over the whole chord, under the
        // 55° wall.
        kind: "drive",
        points: [[ARM_CURB_X, HOLD_Y], [12.8, -31.5], [13.6, -28.5], ring(30, LANE_OUTER_R), ring(40, LANE_OUTER_R)],
        targetKmh: 15,
        stopAtEnd: false,
      },
      {
        // Settle on the outer lane proper for ~20° first. This is not padding:
        // the entry chord is itself ~40° of RIGHT sweep, and starting the
        // inward drift on top of it stacks the two inside the turn detector's
        // 3 s window and fires a spurious turnStarted (measured: t = 29.4,
        // φ = 50, indicator off ⇒ a TURN_WITHOUT_INDICATOR that has nothing to
        // do with the taught fault). 20° at 12 km/h is ~3.1 s — exactly long
        // enough for the chord to age out of the window.
        kind: "drive",
        points: ringRun(40, 60, LANE_OUTER_R, 10),
        targetKmh: RING_KMH,
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
        points: [...spiral(65, 85, LANE_OUTER_R, DRAG_R, 5), ...ringRun(90, 190, DRAG_R)],
        targetKmh: RING_KMH,
        stopAtEnd: false,
      },
      // The exit itself is done correctly — announced and checked. The ONE
      // taught fault is the lane and the line, never stacked with a second.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      {
        kind: "drive",
        points: [
          ...spiral(195, 225, DRAG_R, LANE_OUTER_R, 10),
          ...ringRun(230, 245, LANE_OUTER_R, 5),
          [-40, WEST_CURB_Y],
          [-56, WEST_CURB_Y],
          [-72, WEST_CURB_Y],
        ],
        targetKmh: RING_KMH,
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
 * THE RING PACE THAT PUTS THE CAR THERE. 13.3 km/h, not the shadow's 12, and
 * the 1.3 is the whole encounter: the staged circulator is a metronome from the
 * moment the player arms it (the sync is pinned out — see the template), so the
 * ONLY dial that decides where it stands when the driver reaches the west mouth
 * is how fast the driver got there. Measured at the same wait (15 s): 12.5 km/h
 * ⇒ the car is 5° past the exit and untouched (separation 5.94 m); 13.4 ⇒ the
 * driver arrives ahead of it and the uncontrolled-junction tracker convicts on
 * the wrong geometry; 13.3 ⇒ the car is 3° ahead in the outer lane at the peel,
 * exactly where a driver cutting straight out drives into its flank —
 * separation 1.82 m, the RoundaboutEntryRunner's own contact branch fires, and
 * the crash is the traffic system's, not a scripted beat.
 */
const M2_RING_KMH = 13.3;

/**
 * THE PEEL — a deliberate ~62° break out of the ring at φ = 252, and its shape
 * is arithmetic on the turn detector. The detector sums heading deltas over a
 * sliding 3 s window, and the ring is CONSTANTLY feeding it LEFT (negative)
 * deltas — at 13.3 km/h on r = 21.94 the window carries ≈ −29° of circulation
 * at any moment. So a single sharp break cannot clear the +55° wall; it takes
 * two consecutive RIGHT deltas (+52 then +10) close enough together to land in
 * one window. 14 km/h across the 6.9 m between them puts both inside 3 s:
 * turnStarted fires at t = 53.6 with the LEFT indicator still on ⇒
 * TURN_WITHOUT_INDICATOR. Slower and the turn never registers (measured 9 km/h:
 * no turnStarted at all).
 */
const M2_PEEL_KMH = 14;

export function scRbLaneChoiceMistakeExitAcrossScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път лентата е вярната — вътрешната, с ляв мигач. Гледай КАК напуска кръга.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      ...approachSteps(ARM_INNER_X),
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      {
        kind: "drive",
        points: [[ARM_INNER_X, HOLD_Y], [5.5, -30], [7.5, -26], ring(30, LANE_INNER_R), ring(40, LANE_INNER_R)],
        targetKmh: 15,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Вътрешната лента, два подминати изхода — дотук учебникарски. А отдясно, по външната, върви кола.",
      },
      {
        // The ring on the inner lane, all the way to the third exit — no
        // repositioning, no mirror, no right indicator. The left one is still on.
        kind: "drive",
        points: ringRun(40, 252, LANE_INNER_R, 8),
        targetKmh: M2_RING_KMH,
        stopAtEnd: false,
      },
      {
        // Straight out. Across the outer lane, across the car in it.
        kind: "drive",
        points: [ring(252, LANE_INNER_R), [-26.2, 5.3], [-30.5, WEST_INNER_Y], [-40, WEST_INNER_Y]],
        targetKmh: M2_PEEL_KMH,
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
  HOLD_Y,
  WAIT_SEC,
  DRAG_R,
} as const;
