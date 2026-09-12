/**
 * perception-truth.mjs — WHICH WAY THE CAR SHOULD HAVE TURNED, FROM SOMETHING
 * THE PERCEPTION CANNOT SEE.
 *
 * A perception change that is graded by the perception's own error signal
 * grades itself. This file supplies the independent answer, and it is the same
 * artefact `tools/audit/route-fidelity.mjs` already trusts: the product's own
 * demonstrated correct drive, `content/traces/<lesson>/shadow-correct.trace.json`,
 * whose validation rule is "must replay with ZERO violations".
 *
 * THE CHAIN, and every link of it is on disk before this file runs:
 *
 *   · the STUDENT's pose per tick — `guidance.samples[].wx/.wz`, read from
 *     `window.__camProbe` in `CameraRig.tsx`. It is the chassis, not the pixel
 *     scan: a misread ribbon moves the car and the number grading it in the
 *     same direction, but it cannot move the chassis probe.
 *   · the CORRECT line — the shadow trace, 20 Hz `x,y`.
 *   · the FRAME — they differ by exactly one sign, `y = −z`
 *     (`LessonScene.tsx:597`, restated verbatim in `guidance.witness.frame`).
 *
 * So: put the pose in the trace frame, find the nearest point of the correct
 * line, walk `LOOKAHEAD_M` further along it, and measure the bearing from the
 * car's own direction of travel to that point. That bearing is the turn the
 * lesson wanted, in degrees, signed the way `errDeg` is signed.
 *
 * ── THE FOUR REFUSALS, because a truth that answers every question is not one ─
 *
 *  1. NO TRACE, NO TRUTH. Not every lesson has a shadow drive.
 *  2. OFF THE ROUTE. Past `MAX_OFFROUTE_M` from the correct line, the nearest
 *     point of that line is not the point the car is approaching and the
 *     bearing to it is a number about a different road. A drive that has left
 *     the route cannot be used to grade what it should have done next.
 *  3. TOO SLOW TO HAVE A DIRECTION. The car's heading here is the direction it
 *     actually travelled between two poses; below `MIN_STEP_M` that difference
 *     is probe noise with a plausible value.
 *  4. THE END OF THE LINE. Within `LOOKAHEAD_M` of the trace's end there is no
 *     look-ahead point, and clamping to the last sample would manufacture a
 *     turn demand out of the route running out.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Metres ahead along the CORRECT line to place the target.
 *
 * Deliberately the same 15 m as the control law's `LOOKAHEAD_M`, so the truth
 * asks the question the law is trying to answer and not an easier one. A
 * shorter look-ahead makes every junction look like a bigger turn (it is the
 * same geometry as a tighter pursuit radius) and would flatter any change that
 * increases the commanded angle.
 */
export const LOOKAHEAD_M = 15;
/**
 * Past this from the correct line the nearest point of that line is not the
 * point the car is approaching, and the bearing to it is a number about a
 * different road.
 *
 * SET BY MEASUREMENT, not by feel. Grading the RECORDED errDeg — what the
 * live, masked loop actually saw — against this truth over 289 lanes, the
 * agreement at |demand| >= 15 deg reads: back-difference heading, 15 m
 * look-ahead, 79.8 % at 6 m of tolerance against 79.0 % at 15 m; a CENTRED
 * heading difference is worse everywhere (77.3 / 77.1 %) and a forward one
 * worse again (74.6 / 75.1 %), because the pose after the tick already carries
 * the tick's own command. 6 m keeps 2,094 of the 2,616 gradable samples and
 * costs nothing in signal.
 *
 * THE 20 % THAT IS LEFT IS THE FLOOR OF THIS BENCH, and it must travel with
 * every number the bench prints: some of it is the truth being wrong and some
 * of it is the perception being wrong, and this measurement cannot separate
 * them. A change is therefore judged on how many turn demands it moves from
 * refused to CORRECTLY confident, not on driving a disagreement rate to zero
 * that was never going to reach zero.
 */
export const MAX_OFFROUTE_M = 6;
export const MIN_STEP_M = 0.35;

const traceCache = new Map();

/** The shadow drive, as `{x,y}` plus a cumulative-arc-length table in metres. */
export function loadTrace(lesson, repo) {
  if (traceCache.has(lesson)) return traceCache.get(lesson);
  const p = join(repo, "content", "traces", lesson, "shadow-correct.trace.json");
  let t = null;
  if (existsSync(p)) {
    try {
      const j = JSON.parse(readFileSync(p, "utf8"));
      const pts = (j.samples || []).map((s) => ({ x: s.x, y: s.y }));
      if (pts.length > 8) {
        const cum = new Float64Array(pts.length);
        for (let i = 1; i < pts.length; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        t = { pts, cum, length: cum[cum.length - 1] };
      }
    } catch {
      t = null;
    }
  }
  traceCache.set(lesson, t);
  return t;
}

/** The point `m` metres along the trace from arc position `s0`. */
function atArc(trace, s) {
  const { pts, cum } = trace;
  if (s <= 0) return pts[0];
  if (s >= cum[cum.length - 1]) return null;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= s) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1e-9;
  const f = (s - cum[lo]) / seg;
  return { x: pts[lo].x + (pts[hi].x - pts[lo].x) * f, y: pts[lo].y + (pts[hi].y - pts[lo].y) * f };
}

/**
 * The turn the lesson wanted at one tick.
 *
 * @param {{trace:object, poses:Array<{tSec:number,x:number,z:number}>, i:number,
 *          lookaheadM?:number, sign?:1|-1}} a
 *        `poses` are WORLD (`wx`,`wz`); `i` indexes the tick being graded.
 *        `sign` is the empirical calibration of "positive = right" — see
 *        `calibrateSign`, which measures it against the recorded `errDeg`
 *        rather than deriving it from a handedness convention nobody wrote down.
 * @returns {{ok:boolean, why?:string, demandDeg?:number, dir?:-1|1, offRouteM?:number}}
 */
export function demandAt({ trace, poses, i, lookaheadM = LOOKAHEAD_M, sign = 1, maxOffM = MAX_OFFROUTE_M }) {
  if (!trace) return { ok: false, why: "no shadow trace for this lesson" };
  const p = poses[i];
  if (!p) return { ok: false, why: "no pose at this tick" };
  // The direction the car was ACTUALLY travelling: the last step long enough to
  // be a direction rather than probe noise.
  let hx = 0;
  let hy = 0;
  for (let k = i - 1; k >= 0 && k >= i - 6; k--) {
    const dx = p.x - poses[k].x;
    const dy = -p.z - -poses[k].z;
    if (Math.hypot(dx, dy) >= MIN_STEP_M) {
      hx = dx;
      hy = dy;
      break;
    }
  }
  if (hx === 0 && hy === 0) {
    for (let k = i + 1; k < poses.length && k <= i + 6; k++) {
      const dx = poses[k].x - p.x;
      const dy = -poses[k].z - -p.z;
      if (Math.hypot(dx, dy) >= MIN_STEP_M) {
        hx = dx;
        hy = dy;
        break;
      }
    }
  }
  const hl = Math.hypot(hx, hy);
  if (hl < MIN_STEP_M) return { ok: false, why: `the car moved under ${MIN_STEP_M} m around this tick — no heading` };
  hx /= hl;
  hy /= hl;
  const cx = p.x;
  const cy = -p.z;
  let best = Infinity;
  let bi = 0;
  for (let k = 0; k < trace.pts.length; k++) {
    const d = (trace.pts[k].x - cx) ** 2 + (trace.pts[k].y - cy) ** 2;
    if (d < best) {
      best = d;
      bi = k;
    }
  }
  const off = Math.sqrt(best);
  if (off > maxOffM) return { ok: false, why: `${off.toFixed(1)} m off the correct line — its next turn is not this car's next turn`, offRouteM: off };
  const target = atArc(trace, trace.cum[bi] + lookaheadM);
  if (!target) return { ok: false, why: "within the look-ahead of the end of the correct line", offRouteM: off };
  const vx = target.x - cx;
  const vy = target.y - cy;
  const vl = Math.hypot(vx, vy);
  if (vl < 1e-6) return { ok: false, why: "degenerate target", offRouteM: off };
  const cross = hx * (vy / vl) - hy * (vx / vl);
  const dot = hx * (vx / vl) + hy * (vy / vl);
  const deg = (Math.atan2(cross, dot) * 180) / Math.PI * sign;
  return { ok: true, demandDeg: deg, dir: deg >= 0 ? 1 : -1, offRouteM: off };
}

/**
 * WHICH SIGN MEANS RIGHT — MEASURED, NOT ASSUMED.
 *
 * `errDeg` is positive when the ribbon is right of the image centre. The trace
 * frame's handedness is a separate fact, and nothing in the repo states the two
 * together, so instead of picking one and hoping this correlates the recorded
 * `errDeg` against the geometric bearing and returns whichever sign agrees.
 *
 * IT IS READ ONLY WHERE THE TWO DESCRIBE THE SAME TURN, and that threshold is
 * itself a measurement. Over 4,324 confident on-route samples of the recorded
 * corpus the agreement with `sign = −1` climbs monotonically with magnitude —
 * 67 % at ≥5°, 81 % at ≥10°, 93 % at ≥15°, 97 % at ≥20°, 98 % at ≥30° — because
 * at small errors the two are not the same quantity at all: one is the bearing
 * to a look-ahead point on a road CENTRELINE read off the glass, the other the
 * bearing to a look-ahead point on a DRIVEN line, and near zero they disagree
 * in sign as often as a coin. A convention has to be read where it is legible,
 * so the floor is `MIN_CAL_DEG`, which is also the control law's own
 * `SUSTAIN_DEG`: the magnitude at which the product itself calls something a
 * turn rather than a lane correction.
 *
 * If the vote is not decisive the calibration REFUSES. An ambiguous convention
 * silently resolved is how a bench comes to grade every left turn as a right one.
 */
export const MIN_CAL_DEG = 15;

export function calibrateSign(pairs, { minDeg = MIN_CAL_DEG, minN = 60, decisive = 0.75 } = {}) {
  let agree = 0;
  let n = 0;
  for (const { errDeg, rawDeg } of pairs) {
    if (!(Math.abs(errDeg) >= minDeg && Math.abs(rawDeg) >= minDeg)) continue;
    n++;
    if (Math.sign(errDeg) === Math.sign(rawDeg)) agree++;
  }
  if (n < minN) return { ok: false, why: `only ${n} pairs at ≥${minDeg}° — not enough to fix the convention`, n };
  const frac = agree / n;
  if (frac >= decisive) return { ok: true, sign: 1, n, agree: frac, minDeg };
  if (frac <= 1 - decisive) return { ok: true, sign: -1, n, agree: 1 - frac, minDeg };
  return { ok: false, why: `the two conventions agree on ${(frac * 100).toFixed(0)}% of ${n} at ≥${minDeg}° — that is noise, not a convention`, n, agree: frac };
}
