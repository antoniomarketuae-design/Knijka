/**
 * DEMO CURVATURE — test support (nothing in the product imports it).
 *
 * The one measure both the sc-park-bay-exit-rev drivability pin and the
 * catalogue census use, so the lesson they pin and the lessons they report are
 * judged by the same arithmetic.
 *
 * WHAT IT MEASURES. A recorded trace pose is the car's BODY CENTRE with the
 * recorder's heading (the tangent of the authored centre path). The tightest
 * turn the demo asks for is the largest heading change per metre of centre
 * travel, taken over a WINDOW of travel rather than between samples: authored
 * paths are polylines, so between two samples the heading is piecewise
 * constant and a per-sample ratio would read every vertex as an infinitely
 * tight turn. Over a 1 m window a true circle of radius R reads exactly R, a
 * polyline vertex of angle θ reads 1 m / θ — the pivot-in-place it really is —
 * and nothing in between is smoothed past what a body 4 m long could notice.
 *
 * THE LIMIT IT IS COMPARED WITH is the product car's own: body-centre radius
 * √((L / tan δmax)² + a²) from vehicle/tuning.ts (L = WHEEL_POSITIONS front z −
 * rear z, a = the rear axle's distance behind the centre, δmax =
 * STEER_MAX_ANGLE) — 3.955 m. That is the KINEMATIC floor: a turn tighter than
 * it is one no setting of this car's wheel can produce. (The physics car,
 * measured, is wider still — ≈ 4.17 m in reverse at walking pace.)
 */

import * as T from "../../vehicle/tuning";
import type { TraceSample } from "../types";

export const DEMO_WHEELBASE_M = T.WHEEL_POSITIONS[0].z - T.WHEEL_POSITIONS[2].z;
export const DEMO_REAR_AXLE_M = -T.WHEEL_POSITIONS[2].z;
/** Tightest body-centre radius the product car can turn, kinematically, m. */
export const KINEMATIC_CENTRE_RADIUS_M = Math.hypot(
  DEMO_WHEELBASE_M / Math.tan(T.STEER_MAX_ANGLE),
  DEMO_REAR_AXLE_M,
);

const wrap180 = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;

export interface WindowedRadius {
  /** Tightest radius over any window of ≥ windowM of travel, m (Infinity: straight). */
  radiusM: number;
  /** Trace time at the start of that window, s. */
  atSec: number;
}

/** Tightest body-centre radius over any window of ≥ `windowM` metres of travel. */
export function windowedMinRadius(
  samples: readonly Pick<TraceSample, "x" | "y" | "headingDeg" | "tSec">[],
  windowM = 1.0,
): WindowedRadius {
  const s: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    s.push(s[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  }
  // Prefix sum of signed heading deltas, so a window's net turn is O(1).
  const turn: number[] = [0];
  for (let i = 1; i < samples.length; i++) {
    turn.push(turn[i - 1] + wrap180(samples[i].headingDeg - samples[i - 1].headingDeg));
  }
  let best: WindowedRadius = { radiusM: Infinity, atSec: 0 };
  let j = 0;
  for (let i = 0; i < samples.length; i++) {
    if (j < i) j = i;
    while (j < samples.length - 1 && s[j] - s[i] < windowM) j++;
    const ds = s[j] - s[i];
    if (ds < windowM) break;
    const dTurnRad = (Math.abs(turn[j] - turn[i]) * Math.PI) / 180;
    const r = dTurnRad > 1e-9 ? ds / dTurnRad : Infinity;
    if (r < best.radiusM) best = { radiusM: r, atSec: samples[i].tSec };
  }
  return best;
}
