/**
 * THE CROSSWIND'S YAW PULL — what the wind does to the car's heading.
 *
 * WHY THIS FILE EXISTS — `sc-ac-crosswind:a9db1738`, founder ruling 2026-10-04
 * («Stronger wind»): holding the lane in a crosswind must take a VISIBLE STEADY
 * CORRECTION, about 3–5 % of full steering input. `tuning.ts`
 * (`CROSSWIND_STEER_PULL_RAD_PER_N`) carries the measurement that made a new
 * channel necessary — the side force alone, at any magnitude below the tyres'
 * own grip ceiling, asks for under 1 % — and the physics the channel stands
 * for. This module is only the arithmetic, kept pure so it can be pinned
 * without a physics world.
 *
 * THE LAW, TWO CLAUSES:
 *
 *     pull = F_lateral · min( RAD_PER_N , L / (m · (v² + v_s²)) )
 *
 *  1. A SLIP-ANGLE BUDGET. A side force asks the steered wheels for an angle
 *     proportional to the force and independent of speed (the linear bicycle
 *     model's steady-state result). That is the first term, and its constant
 *     is the one the founder ratified (2026-10-05, «ship the pull»).
 *  2. THE WIND CANNOT OUT-PUSH ITSELF, AND THE FASTER CAR IS CARRIED FURTHER.
 *     A car left alone on the angle follows an arc whose sideways acceleration
 *     is v²·pull/L. With the second term that is
 *
 *         (F/m) · v² / (v² + v_s²)
 *
 *     — below the wind's own F/m at EVERY speed, and STRICTLY RISING with
 *     speed at every speed. Below the crossover (35.5 km/h on the shipped
 *     constants) clause 1 is the smaller; above it clause 2 is.
 *
 * WHY `+ v_s²` (round 2, 2026-10-06). Round 1's second term was L/(m·v²),
 * which pins that acceleration AT F/m above its crossover: the arc was the
 * same at 60 km/h as at 110, the displacement over a reaction time stopped
 * rising with speed (measured, it fell slightly), and a sentence the motorway
 * sibling shows at 70–78 км/ч — «по-бавно покрай камиона значи по-малко
 * отместване от порива» — was no longer true of the car. `tuning.ts`
 * (`CROSSWIND_PULL_SATURATION_MS`) has the measurement, the choice of v_s and
 * its limits. Both properties are structural, not tuned: for any v_s > 0 the
 * share v²/(v² + v_s²) is increasing and under 1.
 *
 * SIGN. `lateralForceN` is the wind's force along the car's own LEFT axis
 * (+ = pushed left); the result is a road-wheel angle on `VehicleSim`'s
 * convention (+ = left). The wheels are turned the way the car is pushed —
 * DOWNWIND — so the correction that holds the lane is INTO the wind. It does
 * not flip in reverse: an arc's centripetal acceleration points at the side
 * the wheels are turned to whichever way the car is rolling.
 *
 * AT A STANDSTILL the first clause is the smaller (the second term is
 * L/(m·v_s²) there, three times the constant), and a road wheel turned a
 * degree on a parked car moves nothing.
 *
 * PURE, TOTAL, NO PHYSICS. Exactly 0 for a force of exactly 0, which is what
 * every lesson that authors no `physics.crosswind` passes — and `VehicleSim`
 * does not even call this outside its `windActive` gate.
 */

import {
  CHASSIS_MASS,
  CROSSWIND_PULL_SATURATION_MS,
  CROSSWIND_STEER_PULL_RAD_PER_N,
  WHEELBASE_M,
} from "./tuning";

/**
 * Road-wheel angle (rad, + = left) the crosswind turns the steered pair by.
 *
 * @param lateralForceN Wind force along the car's left axis, N (+ = pushed left).
 * @param speedMs       Forward speed, m/s (the sign is irrelevant).
 */
export function crosswindSteerPullRad(lateralForceN: number, speedMs: number): number {
  if (lateralForceN === 0) return 0;
  // Clause 2's ceiling, per newton. `v² + v_s²`, not `v²`: finite at rest (so
  // clause 1 decides there with no epsilon) and, at EVERY speed, strictly
  // under the L/(m·v²) that would put the arc's sideways acceleration AT the
  // wind's own F/m.
  const pathCapRadPerN =
    WHEELBASE_M / (CHASSIS_MASS * (speedMs * speedMs + CROSSWIND_PULL_SATURATION_MS ** 2));
  return lateralForceN * Math.min(CROSSWIND_STEER_PULL_RAD_PER_N, pathCapRadPerN);
}

/**
 * Speed (m/s) at which the two clauses meet on the shipped constants — below
 * it the pull is a constant angle per newton, above it the pull rolls off and
 * the path acceleration climbs toward F/m without reaching it. Exported for the
 * tests and for docblocks that quote it.
 */
export const CROSSWIND_PULL_CROSSOVER_MS = Math.sqrt(
  WHEELBASE_M / (CHASSIS_MASS * CROSSWIND_STEER_PULL_RAD_PER_N) - CROSSWIND_PULL_SATURATION_MS ** 2,
);

/**
 * THE SHARE OF THE WIND'S OWN F/m A CAR LEFT ALONE IS TURNED WITH at this
 * speed: the arc's sideways acceleration v²·pull/L, over F/m. This is the
 * kinematic reading of the law (the live car sits a few per cent under it —
 * `crosswind.test.ts` measures both), and it carries the two properties round
 * 2 was built for: it RISES STRICTLY with speed, and it is BELOW 1 at every
 * speed. `cockpitLean.ts` reads it — it is the part of the wind's push a
 * driver's held correction takes back out of the kinematic lean estimate.
 */
export function crosswindPathShareOfWind(speedMs: number): number {
  const v2 = speedMs * speedMs;
  return (v2 * CHASSIS_MASS * crosswindSteerPullRad(1, speedMs)) / WHEELBASE_M;
}
