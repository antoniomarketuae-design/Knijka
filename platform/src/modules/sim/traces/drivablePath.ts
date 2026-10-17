/**
 * DRIVABLE AUTHORED PATHS — the curvature-programme kit a demo script is cut
 * from when its path has to be one the product car can drive
 * (catalogue-demo-curvature:dae908c7).
 *
 * THE RECIPE is sc-park-bay-exit-rev's (traces/scParkBayExitRev.ts, 8579f1d):
 * the recorder is kinematic — the ghost stands on the authored point, headed
 * along the path's tangent — so a polyline corner is a pivot on the spot and a
 * constant-radius arc tighter than the car's own circle is a turn no setting of
 * its wheel can make. A path is therefore not typed in as points; it is
 * INTEGRATED from a curvature programme: stretches over which the body-centre
 * path's curvature ramps linearly from k0 to k1 (a wheel turned, never
 * snapped), every |k| held at or under 1 / DRIVABLE_MIN_CENTRE_RADIUS_M.
 *
 * THE LIMIT AND THE MARGIN. The product car's tightest BODY-CENTRE circle is
 * 3.955 m kinematically (vehicle/tuning.ts: wheelbase 2.56 m, rear axle 1.28 m
 * behind the centre, STEER_MAX_ANGLE 0.6 rad ⇒ √((2.56 / tan 0.6)² + 1.28²)) —
 * the census limit (traces/__tests__/demoCurvature.ts) — and ≈ 4.17 m on the
 * physics car reversing at walking pace (measured in the drivability pins).
 * DRIVABLE_MIN_CENTRE_RADIUS_M = 4.6 keeps 16 % over the census limit and 10 %
 * over the physics car.
 *
 * SIGN. Curvature is clockwise-positive per metre travelled along the NOSE:
 * k > 0 is the wheel turned RIGHT in either gear (forward the car turns right;
 * in reverse the tail goes right and the nose swings left).
 *
 * Pure and deterministic: same programme → same points.
 */

/** The tightest body-centre radius any drivable demo asks for, m. */
export const DRIVABLE_MIN_CENTRE_RADIUS_M = 4.6;
/** …as a curvature, rad/m. */
export const DRIVABLE_MAX_K = 1 / DRIVABLE_MIN_CENTRE_RADIUS_M;

/** One stretch of a curvature programme: k ramps linearly k0 → k1 over lenM. */
export interface CurvatureStretch {
  lenM: number;
  k0: number;
  k1: number;
}

/** A body-centre pose on an integrated path (heading = the nose, 0 = north, cw). */
export interface PathPose {
  x: number;
  y: number;
  headingDeg: number;
}

export interface AuthoredPath {
  /** The polyline handed to the recorder: one vertex per millimetre, plus the exact end. */
  points: Array<[number, number]>;
  start: PathPose;
  end: PathPose;
  lengthM: number;
}

/**
 * Integration step, m — and the spacing of the polyline handed to the recorder.
 *
 * ONE MILLIMETRE, and the reason is the ghost's front wheels. The recorder
 * estimates the wheel angle from the heading change BETWEEN TWO FRAMES, and the
 * heading it reads is the chord's. At a parking creep (2.5 km/h) a frame covers
 * 11.6 mm: on 20 mm chords every other frame crosses no vertex at all, the
 * estimate reads 0 there and double on the frames between, and the ghost's
 * wheels snap straight four times a second through a turn the wheel is held
 * in (measured on the first recording of these drills: «−0.60 −0.60 0.00
 * −0.60 0.00»). At 1 mm every frame crosses 11–16 vertices and the estimate is
 * within a tenth of the turn it shows.
 */
const PATH_DS_M = 0.001;
const PATH_EMIT_EVERY = 1;

/**
 * Integrate a curvature programme from `start`. `dir` −1 = reverse (the centre
 * travels against the nose). Midpoint curvature per step: exact for a linear
 * ramp, so a stretch turns the heading by exactly its mean curvature × length.
 */
export function authoredDrive(
  start: PathPose,
  programme: readonly CurvatureStretch[],
  dir: 1 | -1,
): AuthoredPath {
  let psi = (start.headingDeg * Math.PI) / 180;
  let x = start.x;
  let y = start.y;
  const points: Array<[number, number]> = [[x, y]];
  let n = 0;
  let lengthM = 0;
  for (const seg of programme) {
    if (!(seg.lenM > 0)) continue;
    const steps = Math.max(1, Math.round(seg.lenM / PATH_DS_M));
    const ds = seg.lenM / steps;
    for (let i = 0; i < steps; i++) {
      const k = seg.k0 + ((seg.k1 - seg.k0) * (i + 0.5)) / steps;
      psi += k * dir * ds;
      x += dir * ds * Math.sin(psi);
      y += dir * ds * Math.cos(psi);
      lengthM += ds;
      if (++n % PATH_EMIT_EVERY === 0) points.push([x, y]);
    }
  }
  const last = points[points.length - 1];
  if (Math.hypot(last[0] - x, last[1] - y) > 1e-9) points.push([x, y]);
  return {
    points,
    start: { ...start },
    end: { x, y, headingDeg: (psi * 180) / Math.PI },
    lengthM,
  };
}

/**
 * The recorder brings a drive to rest 5 cm short of its last point
 * (recordScriptedDrive: `while (s < path.length − 0.05)`). A piece that ends in
 * a stop therefore carries a 5 cm run-out along its own final tangent, so the
 * car stops ON the authored point and the next piece starts exactly where it
 * stopped — no hop across a pause or a gear change.
 */
export const RECORDER_STOP_SHORT_M = 0.05;
export function withRunOut(
  points: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
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

/** A straight stretch. */
export const straight = (lenM: number): CurvatureStretch => ({ lenM, k0: 0, k1: 0 });

/**
 * One turn of exactly `turnRad` (> 0) at curvature `k` (signed: the wheel's
 * side), eased in over `rampInM` and out over `rampOutM`: ramp, hold, ramp.
 * The hold's length is solved so the three stretches' heading changes (mean
 * curvature × length) sum to `turnRad`. Throws when the ramps alone already
 * turn more than that — a programme that cannot be what it says.
 */
export function turn(
  turnRad: number,
  k: number,
  rampInM: number,
  rampOutM: number,
): CurvatureStretch[] {
  const ak = Math.abs(k);
  const holdM = (turnRad - (ak * (rampInM + rampOutM)) / 2) / ak;
  if (!(holdM >= 0)) {
    throw new Error(`turn of ${turnRad} rad at k=${k}: the ramps alone turn more`);
  }
  return [
    { lenM: rampInM, k0: 0, k1: k },
    { lenM: holdM, k0: k, k1: k },
    { lenM: rampOutM, k0: k, k1: 0 },
  ];
}

/**
 * An S that shifts the path sideways and leaves the heading where it was: a
 * turn one way, then the mirror turn back, with ONE continuous ramp through the
 * middle (k → −k). `k` is the FIRST turn's signed curvature; `swingRad` is how
 * far the heading leaves the original line at the middle of the S.
 */
export function sShift(swingRad: number, k: number, rampM: number): CurvatureStretch[] {
  const ak = Math.abs(k);
  // Each half turns swingRad: outer ramp (ak·rampM / 2) + hold + half of the
  // middle ramp, which runs k → −k over 2·rampM and passes zero at its middle.
  const holdM = (swingRad - ak * rampM) / ak;
  if (!(holdM >= 0)) {
    throw new Error(`sShift of ${swingRad} rad at k=${k}: the ramps alone turn more`);
  }
  return [
    { lenM: rampM, k0: 0, k1: k },
    { lenM: holdM, k0: k, k1: k },
    { lenM: 2 * rampM, k0: k, k1: -k },
    { lenM: holdM, k0: -k, k1: -k },
    { lenM: rampM, k0: -k, k1: 0 },
  ];
}

/**
 * The swing (rad) an `sShift` at `k` / `rampM` needs to move the path exactly
 * `lateralM` sideways. Bisection on the integrated programme — the lateral
 * shift is strictly increasing in the swing on (rampM·|k|, π/2).
 */
export function swingForShift(lateralM: number, k: number, rampM: number): number {
  const target = Math.abs(lateralM);
  const lateralOf = (swing: number): number => {
    const p = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, sShift(swing, Math.abs(k), rampM), 1);
    return Math.abs(p.end.x);
  };
  let lo = Math.abs(k) * rampM;
  let hi = Math.PI / 2;
  if (lateralOf(lo) > target) {
    throw new Error(`sShift: ${lateralM} m is less than the ramps alone shift at k=${k}`);
  }
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (lateralOf(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Translate a path so that its END lands on (x, y) — headings untouched. */
export function endingAt(path: AuthoredPath, x: number, y: number): AuthoredPath {
  const dx = x - path.end.x;
  const dy = y - path.end.y;
  return {
    points: path.points.map(([px, py]) => [px + dx, py + dy] as [number, number]),
    start: { ...path.start, x: path.start.x + dx, y: path.start.y + dy },
    end: { ...path.end, x, y },
    lengthM: path.lengthM,
  };
}
