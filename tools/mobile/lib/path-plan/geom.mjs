// -----------------------------------------------------------------------------
// path-plan/geom.mjs — THE GEOMETRY EVERY pc-path WITNESS IS PLANNED IN.
//
// A port of the Slice 0 feasibility screen's shared helpers
// (scratchpad/steering/slice0/lib.mjs), moved into the repo so the witnesses a
// pc-path leg follows are built by committed code and pinned to the trace they
// were planned from (DESIGN-v2 §2.1–§2.6).
//
// Pure: node:crypto and the vehicle constants from `../guidance.mjs`, nothing
// else. `path-evidence.mjs` may import this file (DESIGN-v2 §8.1) because it
// holds no controller state and no witness — only frames, segments and digests.
//
// FRAMES. The trace is (x, y) with heading ψ 0 = north = +y, clockwise
// positive. `window.__camProbe` is (x, z) with z = −y (reverse-plan.mjs §1,
// measured). ψ keeps the same convention in both: unit heading is (sin ψ, cos ψ)
// in the trace frame and (sin ψ, −cos ψ) in the probe frame.
// -----------------------------------------------------------------------------
import { createHash } from "node:crypto";
import { VEHICLE, maxSteerAtKmh as vehicleMaxSteer, yawGainAtKmh as vehicleYawGain } from "../guidance.mjs";

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/**
 * The car, in the names the Slice 0 planner uses. Every number is the product's
 * (tuning.ts:109-114, 410-421) through `guidance.mjs` VEHICLE, and
 * `__tests__/path-plan.test.mjs` asserts they are equal, so this cannot drift
 * into a second opinion about the car.
 */
export const CAR = Object.freeze({
  L: VEHICLE.WHEELBASE_M,
  a: VEHICLE.WHEELBASE_M / 2,
  lock: VEHICLE.MAX_ANGLE_RAD,
  minLock: VEHICLE.MIN_ANGLE_RAD,
  fullLockKmh: VEHICLE.FULL_LOCK_KMH,
  minLockKmh: VEHICLE.MIN_LOCK_KMH,
  steerRate: VEHICLE.STEER_SPEED,
});
/** Rear-axle radius at lock, 3.742 m (kinematic). */
export const R_REAR_MIN = CAR.L / Math.tan(CAR.lock);
/** Chassis-origin radius at lock, 3.955 m (kinematic). */
export const R_CENTRE_MIN = Math.hypot(R_REAR_MIN, CAR.a);
/** Centre sideslip at lock, 18.9°. */
export const BETA_LOCK_DEG = Math.atan(0.5 * Math.tan(CAR.lock)) * DEG;
/** 14.49° of yaw per metre of CENTRE travel. */
export const YAW_LIMIT_CENTRE_DEG_PER_M = DEG / R_CENTRE_MIN;

export const maxSteerAtKmh = (kmh) => vehicleMaxSteer(kmh);
export const yawGainAtKmh = (kmh) => vehicleYawGain(kmh);

/** The classification box (reverse-plan.mjs:25-28; objectives.ts:3846-3848). */
export const BOX = Object.freeze({ posM: 0.5, yawDeg: 10 });
/** Slice 0 §1.5: ENDPOSE admits a re-plan whose centre stays within 1.5 m. */
export const TRACK_CORRIDOR_M = 0.5;
export const ENDPOSE_CORRIDOR_M = 1.5;
/** A forward run shorter than this is a micro square-up (Slice 0 §4.2). */
export const MICRO_M = 1.0;

export const wrapDeg = (d) => {
  let r = ((((d + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return r;
};
export const wrap360 = (d) => ((d % 360) + 360) % 360;
export const axisDiffDeg = (a, b) => {
  const raw = Math.abs(((a - b) % 360) + 360) % 360;
  const d = raw > 180 ? 360 - raw : raw;
  return d > 90 ? 180 - d : d;
};
/** Unit heading in the TRACE frame. */
export const hx = (psiDeg) => Math.sin(psiDeg * RAD);
export const hy = (psiDeg) => Math.cos(psiDeg * RAD);
/** Bearing (ψ convention) of a displacement in the TRACE frame. */
export const bearingDeg = (dx, dy) => Math.atan2(dx, dy) * DEG;

export const traceToProbe = (p) => ({ x: p.x, z: -p.y });
export const probeToTrace = (p) => ({ x: p.x, y: -p.z });

/**
 * `sha256` of `JSON.stringify(parsed.samples)`. Computed on the PARSED samples so
 * a CRLF worktree and an LF tree agree (memory `source-editing-traps.md`).
 * Accepts the file text or the parsed document.
 */
export function samplesDigest(docOrText) {
  const doc = typeof docOrText === "string" ? JSON.parse(docOrText) : docOrText;
  if (!doc || !Array.isArray(doc.samples)) throw new Error("samplesDigest: the trace has no samples array");
  return `sha256:${createHash("sha256").update(JSON.stringify(doc.samples)).digest("hex")}`;
}

/** Trace samples with cumulative arc and the ±1 gear sign (Slice 0 `loadTrace`). */
export function traceSamples(doc) {
  const src = Array.isArray(doc?.samples) ? doc.samples : [];
  const S = src.map((s, i) => ({ i, t: s.tSec, x: s.x, y: s.y, psi: s.headingDeg, v: s.speedKmh, gear: s.gear, steer: s.steerRad, brake: s.brakeOn }));
  let arc = 0;
  for (let i = 0; i < S.length; i++) {
    if (i) arc += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
    S[i].s = arc;
    S[i].g = S[i].gear === -1 ? -1 : 1;
  }
  return S;
}

/**
 * Gear segments, Slice 0 §4.2.
 *
 *  · contiguous runs of `gear === −1` against `gear ≥ 1`;
 *  · a segment after the first STARTS at the last sample before the switch
 *    (`p0 = i0 − 1`): that is the pose where the gear changed;
 *  · the 4–6 cm teleport the recorder makes against the new direction of
 *    motion at every switch is DROPPED from the segment's geometry (`skip`);
 *  · a heading snap at the switch belongs to the next segment's geometry and is
 *    never a pose — `startPsi` is the pre-switch heading;
 *  · a forward run shorter than 1.0 m is a micro square-up.
 */
export function gearSegments(S) {
  const segs = [];
  for (let i = 0; i < S.length; i++) {
    if (!segs.length || segs[segs.length - 1].g !== S[i].g) segs.push({ g: S[i].g, i0: i, i1: i });
    else segs[segs.length - 1].i1 = i;
  }
  segs.forEach((sg, k) => {
    sg.k = k;
    sg.p0 = k > 0 ? sg.i0 - 1 : sg.i0;
    sg.gear = sg.g === -1 ? "R" : "D";
    // The teleport: one sample, < 0.1 m, against the new motion.
    sg.skip = null;
    if (k > 0) {
      const p = S[sg.i0 - 1];
      const q = S[sg.i0];
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      const moved = Math.hypot(dx, dy);
      const along = dx * hx(p.psi) + dy * hy(p.psi);
      if (moved > 0.005 && moved < 0.1 && Math.sign(along) === -sg.g) sg.skip = sg.i0;
    }
    sg.lengthM = segmentPoints(S, sg).reduce((acc, pt, j, arr) => (j ? acc + Math.hypot(pt[0] - arr[j - 1][0], pt[1] - arr[j - 1][1]) : 0), 0);
    sg.micro = sg.g === 1 && sg.lengthM < MICRO_M;
  });
  return segs;
}

/** The segment's authored polyline in the TRACE frame, teleport dropped. */
export function segmentPoints(S, sg) {
  const pts = [];
  for (let i = sg.p0; i <= sg.i1; i++) {
    if (i === sg.skip) continue;
    pts.push([S[i].x, S[i].y]);
  }
  return pts;
}

/** Arc-resampled polyline over explicit points. Returns typed arrays at spacing ds. */
export function resamplePoints(ptsIn, ds = 0.05) {
  const pts = [];
  for (const [x, y] of ptsIn) {
    if (!pts.length || Math.hypot(x - pts[pts.length - 1][0], y - pts[pts.length - 1][1]) > 1e-4) pts.push([x, y]);
  }
  if (pts.length === 1) pts.push([pts[0][0], pts[0][1] + 1e-3]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = cum[cum.length - 1];
  const n = Math.max(2, Math.floor(L / ds) + 1);
  const X = new Float64Array(n);
  const Y = new Float64Array(n);
  let j = 0;
  for (let k = 0; k < n; k++) {
    const u = Math.min(L, k * ds);
    while (j < pts.length - 2 && cum[j + 1] < u) j++;
    const seg = cum[j + 1] - cum[j];
    const f = seg > 1e-12 ? (u - cum[j]) / seg : 0;
    X[k] = pts[j][0] + f * ((pts[j + 1]?.[0] ?? pts[j][0]) - pts[j][0]);
    Y[k] = pts[j][1] + f * ((pts[j + 1]?.[1] ?? pts[j][1]) - pts[j][1]);
  }
  X[n - 1] = pts[pts.length - 1][0];
  Y[n - 1] = pts[pts.length - 1][1];
  return { X, Y, n, ds, L };
}

/** Slice 0's `resample(S, p0, i1)`, kept for the ported callers. */
export function resample(S, p0, i1, ds = 0.05, pick = (s) => [s.x, s.y]) {
  const pts = [];
  for (let i = p0; i <= i1; i++) pts.push(pick(S[i]));
  return resamplePoints(pts, ds);
}

export function circumradius(ax, ay, bx, by, cx, cy) {
  const A = Math.hypot(bx - cx, by - cy);
  const B = Math.hypot(ax - cx, ay - cy);
  const C = Math.hypot(ax - bx, ay - by);
  const cr = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  if (Math.abs(cr) < 1e-12) return Infinity;
  return (A * B * C) / (2 * Math.abs(cr));
}

/** Tangent bearing (deg, unwrapped) at every resampled point, chord ±c. */
export function tangents(R, c = 0.25) {
  const h = Math.max(1, Math.round(c / R.ds));
  const T = new Float64Array(R.n);
  let prev = null;
  for (let k = 0; k < R.n; k++) {
    const a = Math.max(0, k - h);
    const b = Math.min(R.n - 1, k + h);
    let th = bearingDeg(R.X[b] - R.X[a], R.Y[b] - R.Y[a]);
    if (prev !== null) {
      while (th - prev > 180) th -= 360;
      while (th - prev < -180) th += 360;
    }
    T[k] = th;
    prev = th;
  }
  return T;
}

/**
 * Prepend a straight run of `lenM` BEHIND the first point of a resampled
 * polyline, along direction (ux, uy) pointing AWAY from the line (Slice 0 §6:
 * "the authored line is extended 3 m back along the approach so an overshoot is
 * not charged as deviation").
 */
export function extendStart(R, ux, uy, lenM) {
  const n0 = Math.round(lenM / R.ds);
  const X = new Float64Array(n0 + R.n);
  const Y = new Float64Array(n0 + R.n);
  for (let i = 0; i < n0; i++) {
    const u = (n0 - i) * R.ds;
    X[i] = R.X[0] + ux * u;
    Y[i] = R.Y[0] + uy * u;
  }
  X.set(R.X, n0);
  Y.set(R.Y, n0);
  return { X, Y, n: n0 + R.n, ds: R.ds, L: R.L + n0 * R.ds, prepended: n0 };
}

/** Windowed monotone projection (Slice 0 §1.2): 0.4 m back / 0.8 m ahead per step. */
export function projectWindow(ref, cx, cy, cur, back, ahead) {
  let best = Infinity;
  let bi = cur;
  const lo = Math.max(0, cur - back);
  const hi = Math.min(ref.n - 1, cur + ahead);
  for (let k = lo; k <= hi; k++) {
    const dx = ref.X[k] - cx;
    const dy = ref.Y[k] - cy;
    const d = dx * dx + dy * dy;
    if (d < best) {
      best = d;
      bi = k;
    }
  }
  return [Math.sqrt(best), bi];
}

/** Global point-to-segment distance against raw points (the independent re-measure). */
export function distanceToPoints(px, py, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const vx = bx - ax;
    const vy = by - ay;
    const L2 = vx * vx + vy * vy;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L2)) : 0;
    const d = Math.hypot(ax + t * vx - px, ay + t * vy - py);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Authored stops, Slice 0 §7.1: |speedKmh| ≤ 1 for ≥ 0.5 s. Tags: spawn,
 * routeEnd, gearChange→R|D, authored. The R→D switches that author no stop
 * (zebra, gap-short, judge) are NOT here; the builder inserts them.
 */
export function authoredStops(S, segs) {
  const stops = [];
  let a = null;
  for (let i = 0; i <= S.length; i++) {
    const still = i < S.length && Math.abs(S[i].v) <= 1;
    if (still && a === null) a = i;
    if (!still && a !== null) {
      const b = i - 1;
      const dwell = S[b].t - S[a].t + 0.05;
      if (dwell >= 0.5) {
        const segIndex = segs.findIndex((sg) => a >= sg.i0 && a <= sg.i1);
        const gc = segs.find((sg) => sg.k > 0 && sg.i0 >= a && sg.i0 <= b + 1);
        stops.push({
          tag: S[a].s < 0.3 ? "spawn" : b === S.length - 1 ? "routeEnd" : gc ? (gc.g === -1 ? "gearChange" : "gearChangeD") : "authored",
          toGear: gc ? (gc.g === -1 ? "R" : "D") : null,
          segIndex,
          arcM: S[a].s,
          tSec: S[a].t,
          dwellS: dwell,
          pose: { x: S[a].x, y: S[a].y, psi: S[a].psi },
          sampleIndex: a,
        });
      }
      a = null;
    }
  }
  return stops;
}
