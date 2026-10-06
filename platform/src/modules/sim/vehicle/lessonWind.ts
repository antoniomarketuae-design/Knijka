/**
 * WHAT A LESSON'S AUTHORED `physics` BECOMES ON THE CAR — one place, pure.
 *
 * WHY THIS FILE EXISTS — `sc-ac-crosswind:a9db1738`, round-1 verifier finding
 * V-08. Until now the mapping lived inline in two components and was copied by
 * hand into a third place:
 *
 *   `LessonScene.tsx`  windLateralN = crosswind ? −CROSSWIND_BRIDGE_N : 0, the
 *                      gust amplitude with the same sign, the period, and the
 *                      wet/snow grip MIN — as JSX props;
 *   `VehicleRig.tsx`   those props packed into `VehicleSimOptions` (the gust
 *                      object only when it has an amplitude and a period);
 *   the live-lane harness (`scenario/__tests__/liveWindDrive.ts`) — BOTH
 *                      steps, retyped, so that „the product's own car" in a
 *                      test was the product's car only for as long as nobody
 *                      edited a sign, an amplitude or a period in the scene.
 *
 * A measurement harness that copies the thing it measures can drift from it
 * silently, and the copy was exactly the three numbers a wind retune changes.
 * So the two steps are functions here; the scene, the rig, the harness and the
 * trace recorder's held-wheel channel all call them, and
 * `lessonWind.test.ts` reads the two component sources to prove the inline
 * arithmetic is gone and has not come back.
 *
 * PURE, TOTAL, NO PHYSICS. No rapier, no clock, no React. The default path is
 * unchanged by construction: an absent `physics` yields grip 1 and three
 * zeroes, and `rigSimOptions` of that is field-for-field the object
 * `VehicleRig` built inline (grip 1, wind 0, no gust key) — the calm car's
 * bit-identity law (`crosswind.test.ts` §1) is on the far side of it.
 */

import {
  CROSSWIND_BRIDGE_N,
  CROSSWIND_GUST_AMPLITUDE_N,
  CROSSWIND_GUST_PERIOD_SEC,
  SNOW_GRIP_FACTOR,
  WET_GRIP_FACTOR,
} from "./tuning";

/** The authored opt-ins (`LessonSpec.physics`), structurally — this module
 *  takes no dependency on the lesson contracts. */
export interface LessonPhysicsFlags {
  wetGrip?: boolean;
  snowGrip?: boolean;
  crosswind?: boolean;
}

/** What the scene hands the rig for a lesson's authored physics. */
export interface LessonRigPhysics {
  /** Tyre/brake grip factor: the MOST RESTRICTIVE authored one (1 = dry). */
  gripFactor: number;
  /** Constant wind force, N along world +X (negative = blowing WEST). */
  windLateralN: number;
  /** Gust sine amplitude, N, same axis and sign as the constant term. */
  windGustAmplitudeN: number;
  /** Gust sine period, s (0 = no gust). */
  windGustPeriodSec: number;
}

/** The slice of `VehicleSimOptions` this mapping decides. Structural, so this
 *  file does not import `VehicleSim` (which imports it). */
export interface RigSimWindOptions {
  gripFactor: number;
  windLateralN: number;
  windGust?: { periodSec: number; amplitudeN: number };
}

/**
 * `LessonSpec.physics` → the rig's physics props.
 *
 * THE SIGN IS THE LESSON. Negative = the wind blows WEST (world −X = district
 * west, `scene/vehicleSample.ts`'s axis map): on sc-ac-crosswind's northbound
 * street it shoves the car LEFT, toward the centre line — the AC-12 danger —
 * and on the motorway sibling it shoves the overtaking car toward the median.
 * The gust carries the same sign, so it deepens the push and never opposes it.
 *
 * Read from the AUTHORED field only — never derived from `environment` (the
 * shipped weather lessons were tuned against dry, calm physics).
 */
export function lessonRigPhysics(physics: LessonPhysicsFlags | undefined): LessonRigPhysics {
  const wind = physics?.crosswind === true;
  return {
    gripFactor: Math.min(physics?.wetGrip ? WET_GRIP_FACTOR : 1, physics?.snowGrip ? SNOW_GRIP_FACTOR : 1),
    windLateralN: wind ? -CROSSWIND_BRIDGE_N : 0,
    windGustAmplitudeN: wind ? -CROSSWIND_GUST_AMPLITUDE_N : 0,
    windGustPeriodSec: wind ? CROSSWIND_GUST_PERIOD_SEC : 0,
  };
}

/**
 * The rig's physics props → the options `VehicleSim` is constructed with.
 * The gust object exists only when it has both an amplitude and a period —
 * the identity discipline: a calm lesson passes no gust key at all.
 */
export function rigSimOptions(rig: LessonRigPhysics): RigSimWindOptions {
  return {
    gripFactor: rig.gripFactor,
    windLateralN: rig.windLateralN,
    ...(rig.windGustAmplitudeN !== 0 && rig.windGustPeriodSec > 0
      ? { windGust: { periodSec: rig.windGustPeriodSec, amplitudeN: rig.windGustAmplitudeN } }
      : {}),
  };
}

/**
 * The wind's force at a reading of the gust clock, N along world +X: the
 * constant term plus the pure sine. `VehicleSim.currentWindN()` IS this
 * function on its own clock (the „one number" law `windLateralNow` states),
 * and the trace recorder's held-wheel channel calls it on the demo's clock, so
 * a ghost's correction breathes on the gust the live car is pushed by.
 */
export function crosswindForceAtN(
  windLateralN: number,
  gustAmplitudeN: number,
  gustPeriodSec: number,
  clockSec: number,
): number {
  let windN = windLateralN;
  if (gustAmplitudeN !== 0) {
    windN += gustAmplitudeN * Math.sin((2 * Math.PI * clockSec) / gustPeriodSec);
  }
  return windN;
}
