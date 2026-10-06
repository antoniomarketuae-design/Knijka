/**
 * sc-park-bay-exit-rev — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Излизане на заден от перпендикулярно място" on the
 * committed lot-perp-v1 district (the P0's map, REUSED byte-for-byte), recorded
 * with the template's OWN staged walker (single truth, imported from the spec).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations with the parked-car obstacle rects ARMED at
 *     collisionMinKmh 0 — the car leaves a bay boxed on both sides, pauses
 *     twice mid-arc to look, then yields to the staged walker on the aisle;
 *   - „Заден ход без оглед": the blind reverse's scripted pedestrian
 *     consequence, EXACTLY COLLISION;
 *   - „Изнасяне със замах": the SAME arc driven in one motion without a single
 *     pause or look, scripted contact with a car passing down the aisle,
 *     EXACTLY COLLISION.
 *
 * Geometry pinned to content/world/lot-perp-v1.json (the demo.ts pattern —
 * lessons pin district coordinates by value):
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   bay row on the EAST side, bay rects x ∈ [2.53, 7.53];
 *   start bay lot-bay-3 centre (5.03, 0), axis east-west (headingDeg 90);
 *   occupied neighbours lot-bay-1/2/4/5 at y = ∓5.4 / ∓2.7 — their car rects
 *   (2.25 × 0.9 half-extents) span x ∈ [2.78, 7.28], y ∈ ±[1.8, 3.6];
 *   spawn lot-spawn-finish (0, 18.75) sits on the drive-away leg.
 *
 * THE PATH IS ONE THE PRODUCT CAR CAN DRIVE (sc-park-bay-exit-rev:49af2940).
 * Until 2026-10-06 the reverse swung out on a 3.03 m car-CENTRE quarter arc.
 * The recorder is kinematic — the ghost stands on the authored point, headed
 * along the path's tangent — and that arc is tighter than this car can turn:
 * its body-centre radius at full lock is 3.955 m kinematically (wheelbase
 * 2.56 m and rear axle 1.28 m behind the centre, both from vehicle/tuning.ts
 * WHEEL_POSITIONS; STEER_MAX_ANGLE 0.6 rad ⇒ rear-axle radius 2.56 / tan 0.6 =
 * 3.74 m) and ≈ 4.17 m on the physics car in reverse at walking pace. A real
 * car with its centre on that arc needed a 2.89 m rear-axle radius and would
 * have swung its nose 0.13 m INTO the dret_90 standing in lot-bay-4. The demo
 * showed a manoeuvre no real car and no steering instrument could follow, and
 * the lesson was never once observed working.
 *
 * So the path is now INTEGRATED from a curvature programme (`authoredDrive`):
 * the body-centre path's curvature is held at ≤ 1 / 4.6 m everywhere
 * (PBE_MIN_CENTRE_RADIUS_M; ≥ 10 % wider than the physics car's 4.17) and only
 * ever changes in ramps, so the wheel is turned, never snapped, and the ghost
 * never pivots.
 *
 * WHY THE PATH IS SHAPED THE WAY IT IS. A REAL car reversing out with the
 * wheel turned swings its NOSE out — the front pivots about the rear axle, so
 * the outer front corner sweeps toward the neighbour on the far side
 * (lot-bay-4). The live scene stands real models in the bays (ScenarioObstacles
 * sizes each collider off its GLB: lot-bay-2 is a vela_h3, 1.05 m half-width;
 * lot-bay-4 a dret_90, 1.01 m), which leaves 0.8 m of air beside the hero in
 * the bay. So the reverse is: STRAIGHT back 1.0 m with the wheel straight
 * (instruction 3), then a GENTLE swing (radius 12 m) begun while the nose is
 * still between the neighbours, then — as the front clears their bumpers — the
 * firm swing (4.6 m) that brings the car round, unwinding the wheel over the
 * last 1.2 m so the car stops ALIGNED with the aisle (instruction 6; the teach
 * card's «подравняване в алеята преди потеглянето напред»). The forward half
 * then crosses to the aisle's driving line, right then left (4.65 m / 6 m),
 * arriving straight on x ≈ 0.91 exactly at the walker stop.
 *
 * Every pose keeps ≥ 0.25 m from every parked car as the product's boxes see
 * them (the headless table here AND the per-model GLB boxes of the live scene):
 * 0.69 m for the recorded pose, 0.36 m for a real car with its centre on this
 * path (its body trails the tangent by up to 15.6°, its rear axle on ≥ 4.53 m),
 * pinned in traces/__tests__/sc-park-bay-exit-rev-drivable.test.ts.
 *
 * Rule-engine safety envelope the paths respect: lane detectors arm at
 * |laneOffset| > 3.25 m ⇔ |x| < 0.81 on this road while moving > 5 km/h in a
 * FORWARD gear — the drive-away therefore runs the aisle at x ≈ 0.91 (offset
 * −3.15); the crossing to it never bills (the recorded gate and the live chain
 * agree: zero violations). Reverse gear is exempt from all lane/wrong-way
 * detectors by A12 law, which is what lets the reverse cross the aisle freely.
 */

import type { StagedEventSpec } from "../contracts";
import type { ScenarioBayMeta } from "../contracts";
import { scenarioBaysOf } from "../contracts";
import { SC_PARK_BAY_EXIT_REV } from "../lessons/scenario/templates-parking2";
import { STEER_MAX_ANGLE, WHEEL_POSITIONS } from "../vehicle";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PARK_BAY_EXIT_REV_ID = "sc-park-bay-exit-rev";

/**
 * Nominal parked-car footprint for the HEADLESS collision gate, m — the P0's
 * constants verbatim (the live scene colliders use each GLB rig's measured
 * bbox; these run a hair larger, so the recorded gate is at least as strict).
 */
export const PARKED_CAR_HALF_WIDTH_M = 0.9;
export const PARKED_CAR_HALF_LENGTH_M = 2.25;

/** Start pose: the centre of lot-bay-3, nose east (the bay axis), deep in. */
const BAY_X = 5.03;
const BAY_Y = 0;
/** End of the drive-away leg — past the aisle checkpoint zone (0, 20). */
const Y_FINISH = 21;
/** Пешеходна скорост — the reverse target, and the dial that keeps the staged
 *  walker (minTriggerSpeedKmh 7) strictly out of the reverse. */
const REVERSE_KMH = 4;
/**
 * The last leg, past the last bays: a CRAWL, then walking pace once past them.
 *
 * WHY A CRAWL. L5 stages a second walker (PBE_WALKER_LATE) who steps out from
 * between the last cars at y = 16; the ghost is one trace for every rung, so it
 * cannot stop for a person the L1 cast does not have. Below her 7 km/h floor the
 * runner still releases her once the car is within min(8 m, her seeded trigger
 * distance 5–11 m) of her line (the creep backstop, DART_CREEP_RELEASE_M), and
 * she needs ≈ 3.3 s to clear the car's path. At the latest release (5 m) the
 * bumper is 2.6 m short of her line, so the car must cover no more than that in
 * 3.4 s: ≤ 2.75 km/h. CRAWL_KMH holds under it, so the drive that is correct on
 * the L1 cast is also the one that lets L5's late walker cross whenever she is
 * released — measured on the live chain and over twelve director seeds in
 * sc-park-bay-exit-rev-drivable.test.ts. (At 12 km/h, the 3.03 m demo's speed,
 * the same trace ran her down on the live L5 chain.) It is also the lot's own
 * manner (meta.defaults: «маневрите се изпълняват с пешеходна скорост»).
 */
const CRAWL_KMH = 2.5;
/** Where the crawl ends: the bumper 4 m past the late walker's line (y = 16). */
const Y_CRAWL_END = 18;
/** Walking pace for the last metres to the finish. */
const EXIT_KMH = 6;

// ---------------------------------------------------------------------------
// The product car's limit, and the path the demo authors inside it
// ---------------------------------------------------------------------------

/** Wheelbase, m (tuning.ts WHEEL_POSITIONS: front z − rear z = 2.56). */
const PBE_WHEELBASE_M = WHEEL_POSITIONS[0].z - WHEEL_POSITIONS[2].z;
/** Rear axle behind the body centre, m (1.28) — the bicycle's no-slip point. */
const PBE_REAR_AXLE_M = -WHEEL_POSITIONS[2].z;
/** The car's tightest BODY-CENTRE radius at full lock, kinematically, m:
 *  rear-axle radius L / tan(STEER_MAX_ANGLE) = 3.74, then √(3.74² + 1.28²). */
export const PBE_KINEMATIC_CENTRE_RADIUS_M = Math.hypot(
  PBE_WHEELBASE_M / Math.tan(STEER_MAX_ANGLE),
  PBE_REAR_AXLE_M,
);
/**
 * The tightest body-centre radius this demo ever asks for, m. The physics car
 * is wider than the kinematic 3.955: its full-lock reverse circle at walking
 * pace measures ≈ 4.17 m (pinned in the drivability test). 4.6 keeps ≥ 10 %
 * in hand of that.
 */
export const PBE_MIN_CENTRE_RADIUS_M = 4.6;

/** One stretch of a curvature programme: the body-centre path's curvature
 *  (rad/m, clockwise-positive per metre travelled along the NOSE direction)
 *  ramps linearly from k0 to k1 over lenM — a wheel turned, never snapped. */
interface CurvatureStretch {
  lenM: number;
  k0: number;
  k1: number;
}

/** A body-centre pose on the integrated path (heading = the nose). */
interface PathPose {
  x: number;
  y: number;
  headingDeg: number;
}

/** Integration step (m) and the spacing of the polyline handed to the recorder. */
const PATH_DS_M = 0.01;
// → one recorder vertex per 0.02 m: about one per frame at walking pace, so the
// recorder's per-frame yaw (and the ghost wheel it estimates from it) moves
// smoothly instead of jumping at sparse chord corners.
const PATH_EMIT_EVERY = 2;

/**
 * The authored body-centre path, integrated from a curvature programme.
 *
 * WHY THE CENTRE AND NOT THE REAR AXLE. The recorder poses the ghost at the
 * points it is handed and heads it along their tangent; the ghost is drawn
 * centred on that point. So the curvature of THIS path is exactly what the
 * student watches the ghost turn at, and what every instrument cut from the
 * trace inherits. It is held at ≤ 1 / PBE_MIN_CENTRE_RADIUS_M everywhere, and
 * it only ever changes in ramps (clothoids), so the ghost never snaps. A real
 * car can put its centre on such a path: its body then trails the tangent by
 * up to ~15° (the rear axle runs inside the turn, on a radius of at least
 * 4.5 m here against the physics car's ≈ 3.97 m) — measured, not assumed, in
 * traces/__tests__/sc-park-bay-exit-rev-drivable.test.ts.
 *
 * `dir` −1 = reverse (the centre travels against the nose). Returns the
 * polyline (every 0.02 m, plus the exact end) and the end pose. Pure and
 * deterministic: same programme → same points.
 */
function authoredDrive(
  start: PathPose,
  programme: readonly CurvatureStretch[],
  dir: 1 | -1,
): { points: Array<[number, number]>; end: PathPose } {
  let psi = (start.headingDeg * Math.PI) / 180;
  let x = start.x;
  let y = start.y;
  const points: Array<[number, number]> = [[x, y]];
  let n = 0;
  for (const seg of programme) {
    const steps = Math.max(1, Math.round(seg.lenM / PATH_DS_M));
    const ds = seg.lenM / steps;
    for (let i = 0; i < steps; i++) {
      // Midpoint curvature: exact for a linear ramp, so the heading change of
      // a stretch is exactly its mean curvature × length (the closed forms in
      // `reverseHoldM` / `forwardHoldM` rely on it).
      const k = seg.k0 + ((seg.k1 - seg.k0) * (i + 0.5)) / steps;
      psi += k * dir * ds;
      x += dir * ds * Math.sin(psi);
      y += dir * ds * Math.cos(psi);
      if (++n % PATH_EMIT_EVERY === 0) points.push([x, y]);
    }
  }
  const last = points[points.length - 1];
  if (Math.hypot(last[0] - x, last[1] - y) > 1e-9) points.push([x, y]);
  return { points, end: { x, y, headingDeg: (psi * 180) / Math.PI } };
}

/**
 * The recorder brings a drive to rest 5 cm short of its last point
 * (recordScriptedDrive: `while (s < path.length − 0.05)`). Each authored piece
 * therefore carries a 5 cm run-out along its own final tangent, so the car
 * stops ON the authored point and the next piece starts exactly where it
 * stopped — no hop across a pause or the gear change.
 */
const RECORDER_STOP_SHORT_M = 0.05;
function withRunOut(points: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const out = points.map(([x, y]) => [x, y] as [number, number]);
  const [ax, ay] = out[out.length - 2];
  const [bx, by] = out[out.length - 1];
  const len = Math.hypot(bx - ax, by - ay);
  out.push([
    bx + ((bx - ax) / len) * RECORDER_STOP_SHORT_M,
    by + ((by - ay) / len) * RECORDER_STOP_SHORT_M,
  ]);
  return out;
}

// --- The reverse: out of the bay, round to the aisle -----------------------

/** Straight back with the wheel straight (instruction 3: „около метър"). */
const REV_STRAIGHT_M = 1.0;
/** Gentle swing — begun while the nose is still between the neighbours. */
const REV_GENTLE_RAMP_M = 1.5;
const REV_GENTLE_K = 1 / 12;
const REV_GENTLE_M = 1.35;
/** Firm swing (the demo's tightest, PBE_MIN_CENTRE_RADIUS_M) once the front
 *  is past the neighbours' bumpers. */
const REV_FIRM_RAMP_M = 2.0;
const REV_FIRM_K = 1 / PBE_MIN_CENTRE_RADIUS_M;
/** The wheel comes straight over the last stretch: the car stops aligned. */
const REV_STRAIGHTEN_M = 1.2;

/** Length of the firm hold that turns the car exactly 90° (east → north):
 *  the stretches' heading changes (mean curvature × length) sum to π/2. */
function reverseHoldM(): number {
  const before =
    (REV_GENTLE_K / 2) * REV_GENTLE_RAMP_M +
    REV_GENTLE_K * REV_GENTLE_M +
    ((REV_GENTLE_K + REV_FIRM_K) / 2) * REV_FIRM_RAMP_M;
  const after = (REV_FIRM_K / 2) * REV_STRAIGHTEN_M;
  return (Math.PI / 2 - before - after) / REV_FIRM_K;
}

const REVERSE = authoredDrive(
  { x: BAY_X, y: BAY_Y, headingDeg: 90 },
  [
    { lenM: REV_STRAIGHT_M, k0: 0, k1: 0 },
    { lenM: REV_GENTLE_RAMP_M, k0: 0, k1: REV_GENTLE_K },
    { lenM: REV_GENTLE_M, k0: REV_GENTLE_K, k1: REV_GENTLE_K },
    { lenM: REV_FIRM_RAMP_M, k0: REV_GENTLE_K, k1: REV_FIRM_K },
    { lenM: reverseHoldM(), k0: REV_FIRM_K, k1: REV_FIRM_K },
    { lenM: REV_STRAIGHTEN_M, k0: REV_FIRM_K, k1: 0 },
  ],
  -1,
);

/** Where the reverse comes to rest, aligned with the aisle — the point the
 *  template's Задача 1 zone is centred on (templates-parking2 LOT_EXIT_X/Y). */
export const PBE_REVERSE_END: Readonly<PathPose> = REVERSE.end;

/**
 * The reverse polyline between the moments the car has turned `fromDeg` and
 * `toDeg` degrees (0 = in the bay, nose east; 90 = aligned, nose north). Cuts
 * land on recorder vertices, so consecutive pieces share their joint exactly
 * and the recorder's heading runs on unbroken across a pause; every piece
 * carries the recorder's 5 cm run-out (see `withRunOut`).
 */
function reverseBetween(fromDeg: number, toDeg: number): Array<[number, number]> {
  const pts = REVERSE.points;
  const cutAt = (deg: number): number => {
    if (deg <= 0) return 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      // Reverse: the nose points against the chord's travel bearing.
      const heading = (Math.atan2(bx - ax, by - ay) * 180) / Math.PI + 180;
      const turned = 90 - (((((heading + 180) % 360) + 360) % 360) - 180);
      if (turned >= deg - 1e-9) return i;
    }
    return pts.length - 1;
  };
  return withRunOut(pts.slice(cutAt(fromDeg), cutAt(toDeg) + 1));
}

// --- The forward half: across to the driving line, straight at the stop ----

/** A short roll straight ahead off the reverse's stop, wheel still straight. */
const FWD_STRAIGHT_M = 0.15;
/** Right swing — the nose back toward the driving line. */
const FWD_RIGHT_RAMP_M = 2.0;
const FWD_RIGHT_K = 1 / 4.65;
const FWD_RIGHT_M = 2.4;
/** Left swing that lays the car straight on the line, wheel unwound slowly. */
const FWD_LEFT_RAMP_M = 1.6;
const FWD_LEFT_K = -1 / 6;
const FWD_UNWIND_M = 2.9;

/** Length of the left hold that brings the heading back to exactly north. */
function forwardHoldM(): number {
  const turned =
    (FWD_RIGHT_K / 2) * FWD_RIGHT_RAMP_M +
    FWD_RIGHT_K * FWD_RIGHT_M +
    ((FWD_RIGHT_K + FWD_LEFT_K) / 2) * FWD_LEFT_RAMP_M;
  return -(turned + (FWD_LEFT_K / 2) * FWD_UNWIND_M) / FWD_LEFT_K;
}

const FORWARD = authoredDrive(
  REVERSE.end,
  [
    { lenM: FWD_STRAIGHT_M, k0: 0, k1: 0 },
    { lenM: FWD_RIGHT_RAMP_M, k0: 0, k1: FWD_RIGHT_K },
    { lenM: FWD_RIGHT_M, k0: FWD_RIGHT_K, k1: FWD_RIGHT_K },
    { lenM: FWD_LEFT_RAMP_M, k0: FWD_RIGHT_K, k1: FWD_LEFT_K },
    { lenM: forwardHoldM(), k0: FWD_LEFT_K, k1: FWD_LEFT_K },
    { lenM: FWD_UNWIND_M, k0: FWD_LEFT_K, k1: 0 },
  ],
  1,
);

/** The drive-away line the forward half lands on (offset ≈ −3.15 from the
 *  drawn lane centre — inside the 3.25 m lane-keep band). */
export const PBE_DRIVE_X = FORWARD.end.x;
/** The walker stop: where the forward half arrives straight, short of her
 *  crossing (y = 10) — the front bumper ≈ 2.5 m before her line. */
export const PBE_YIELD_Y = FORWARD.end.y;

/**
 * The headless obstacle set of a scenario-lot district: one parked-car rect
 * per OCCUPIED bay (meta.scenario.bays — the same single truth the scene's
 * ScenarioObstacles mounts from). The P0's helper, re-derived here so the two
 * templates never share a private.
 */
export function lotObstacleRects(districtRaw: unknown): ObstacleRect2D[] {
  return scenarioBaysOf(districtRaw)
    .filter((b: ScenarioBayMeta) => b.occupied)
    .map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      halfWidthM: PARKED_CAR_HALF_WIDTH_M,
      halfLengthM: PARKED_CAR_HALF_LENGTH_M,
      withWhat: "vehicle" as const,
    }));
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkBayExitRevShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Паркирани сме с предницата навътре, отляво и отдясно има коли. Оглеждането е ПРЕДИ задната.",
      },
      // Rubric moment obs-before-reverse: both mirrors, then over the shoulder.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Алеята зад нас е чиста. Чак сега — задна предавка." },
      {
        // Straight back 1 m (wheel still straight), the gentle swing while the
        // nose is between the neighbours, and the first of the firm lock — a
        // third of the turn.
        kind: "drive",
        points: reverseBetween(0, 30),
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Спри и погледни пак: по алеята зад теб може да мине човек." },
      // Mid-maneuver pause 1 — rubric moment obs-during-reverse.
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: reverseBetween(30, 60),
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Задницата вече е в алеята — спри отново и се убеди, че нищо не идва." },
      // Mid-maneuver pause 2 — the second look of the two the maneuver requires.
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        // The rest of the turn; the wheel comes straight over the last 0.6 m,
        // so the car stops aligned with the aisle.
        points: reverseBetween(60, 90),
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Изправи волана. Излязохме — колата е подравнена по алеята." },
      { kind: "pause", sec: 1.0, brake: true },
      // Rubric moment obs-before-moveoff: look down the aisle both ways first.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Погледни по алеята в двете посоки и чак тогава потегли напред." },
      {
        // Across to the driving line (right, then left — both ramped) and
        // straight on x ≈ 0.90 at the walker stop: inside the lane-detector
        // band, clear of the parked boxes. Above 7 km/h, so the staged walker
        // arms here and only here.
        kind: "drive",
        points: withRunOut(FORWARD.points),
        targetKmh: 9,
      },
      { kind: "annotation", textBg: "Пешеходец пресича алеята. В паркинга хората вървят по платното — спри и изчакай." },
      // She needs ~6.5 s to clear her 8.4 m walk; 7 s of standstill lets her
      // finish with margin, and a stopped car can never trip the contact check.
      { kind: "pause", sec: 7.0, brake: true },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Продължи спокойно към изхода едва когато алеята е чиста." },
      {
        kind: "drive",
        points: [
          [PBE_DRIVE_X, PBE_YIELD_Y],
          [PBE_DRIVE_X, Y_CRAWL_END],
        ],
        targetKmh: CRAWL_KMH,
      },
      {
        // Same direction, no pause: the recorder rolls straight on, speeding
        // up to walking pace for the finish.
        kind: "drive",
        points: [
          [PBE_DRIVE_X, Y_CRAWL_END],
          [PBE_DRIVE_X, Y_FINISH],
        ],
        targetKmh: EXIT_KMH,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: оглед преди задната, пешеходна скорост, две спирания — и пропуснат пешеходец.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Заден ход без оглед" (scripted pedestrian consequence)
// ---------------------------------------------------------------------------

export function scParkBayExitRevMistakeBlindScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо, когато задната влезе преди огледалата.",
      },
      {
        kind: "annotation",
        textBg: "Задна предавка ВЕДНАГА — без огледала, без рамо, без поглед през задното стъкло. Това е грешката.",
      },
      {
        // The shadow's own reverse, driven blind, to 40° of the turn. Kept
        // under the walker's 7 km/h arm so the ONLY thing this demo grades is
        // the person the driver never looked for.
        kind: "drive",
        points: reverseBetween(0, 40),
        targetKmh: 5,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence: the unseen walker behind the car is struck at
      // reversing speed — the rule engine grades it exactly like a physics
      // contact (the P0's „пешеходец зад колата" seam).
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Човекът зад колата беше невидим от седалката — по устройство, не случайно. Чл. 40: убеди се, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изнасяне със замах" (scripted contact with the aisle car)
// ---------------------------------------------------------------------------

export function scParkBayExitRevMistakeSwingScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Същата дъга — но изкарана наведнъж: без спиране, без поглед назад.",
      },
      {
        // The shadow's exact path, minus every pause and every glance: the
        // path is proven clean against the neighbours (and drivable by the
        // product car), so the two missing checks are the ONLY difference
        // between this demo and the correct maneuver. To 75° of the turn.
        kind: "drive",
        points: reverseBetween(0, 75),
        targetKmh: 6,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence at the frame the tail is across the aisle
      // lane: a car coming down the aisle has nowhere to go. Scripted, because
      // no staged vehicle can be pathed on a `service` edge — see the
      // template's honest-scope header.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Излизащият назад пропуска всички. „Замахът“ не печели секунди — той маха проверките, при които щеше да я видиш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkBayExitRevTraceName =
  | "shadow-correct"
  | "mistake-blind-reverse"
  | "mistake-swing-out";

const SCRIPTS: Record<
  ScParkBayExitRevTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scParkBayExitRevShadowScript },
  "mistake-blind-reverse": { kind: "mistake", script: scParkBayExitRevMistakeBlindScript },
  "mistake-swing-out": { kind: "mistake", script: scParkBayExitRevMistakeSwingScript },
};

/**
 * Record one of the three drives against a loaded lot-perp-v1 document — the
 * TEMPLATE's staged walker armed (single truth), obstacles armed from the
 * district's own occupancy, collisionMinKmh 0 (the parking threshold, doc 76
 * §0). Deterministic: same district → same trace.
 */
export function recordScParkBayExitRevDrive(
  districtRaw: unknown,
  name: ScParkBayExitRevTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_BAY_EXIT_REV_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PARK_BAY_EXIT_REV.staged ?? [])] as StagedEventSpec[],
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
