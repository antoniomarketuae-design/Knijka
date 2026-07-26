// gripSignal.ts — the GRIP-LOSS READ CHANNEL (doc 82 §4.2 F1).
//
// WHY THIS EXISTS: the sim already grades students on grip-limited driving
// while giving them ZERO sensory evidence that grip is running out. On the
// ice/aquaplane lessons (gripFactor 0.15, braking ×5.5) the car simply stops
// answering and the student gets no explanation. The quantity needed was
// already computed every physics step and thrown away.
//
// EVERYTHING HERE IS A PURE READ. Nothing in this file feeds a force, a
// torque or an impulse back into rapier, and VehicleSim's use of it writes
// only to two new private fields that no rapier call ever sees. That is the
// entire reason F1 ships ON by default while F2 (road roughness) and F3
// (engine braking) ship gated OFF: this channel cannot move a trajectory, so
// it cannot move a graded verdict.
//
// TWO HALVES, DELIBERATELY KEPT SEPARATE — they answer different questions:
//
//   DELIVERED — the friction-circle magnitude of the acceleration the tyres
//     actually produced, over the grip ceiling. It saturates just BELOW 1
//     because rapier clamps the side impulse at exactly that ceiling
//     (frictionSlip, tuning.ts cheat-sheet point 5), so on its own it can
//     never say "you asked for more than exists".
//
//   DEMANDED — the lateral acceleration the STEERING ANGLE is asking for at
//     this speed (kinematic bicycle, a = v²·tan δ / L). This is the half that
//     goes above 1: a driver winding on more lock in a slide is asking for
//     grip that is not there, and that is precisely the moment a real tyre
//     protests. It is also what makes the channel honest on ice — at
//     gripFactor 0.15 the ceiling collapses to ~2 m/s², so a perfectly
//     ordinary town corner already reads as over-demand.
//
// The consumer (scene/simAudio.ts) turns the combined number into a filtered
// scrub that opens into a screech. Keep it reading as TYRE PROTEST, not a
// racing game (doc 82 §4.2: "Keep it reading as tyre protest").

import {
  FRICTION_SLIP_FRONT,
  FRICTION_SLIP_REAR,
  GRAVITY,
  WHEEL_POSITIONS,
} from "./tuning";

/**
 * The tyre μ the utilisation is measured against — the mean of the front and
 * rear slips (1.4 / 1.5). The harness measures the car's real lateral ceiling
 * at ~13–14 m/s² (tuning.ts FRICTION_SLIP_FRONT note); 1.45 · 9.81 ≈ 14.2
 * lands inside that band, so utilisation 1.0 is the speed at which the
 * harness-locked grip ceiling is genuinely reached.
 */
export const GRIP_SIGNAL_MU = (FRICTION_SLIP_FRONT + FRICTION_SLIP_REAR) / 2;

/** Wheelbase (m) for the kinematic demand term, derived from the rig itself
 *  so it can never drift from the physics (front z − rear z = 2.56). */
export const GRIP_SIGNAL_WHEELBASE_M = WHEEL_POSITIONS[0].z - WHEEL_POSITIONS[2].z;

/**
 * Clamp (m/s²) on the raw measured acceleration fed into the signal — the
 * same job ROLL_COUPLING_MAX_LAT does for the roll torque, but set MUCH
 * higher (≈2 g). The roll clamp sits at 12, BELOW the ~14 m/s² grip ceiling,
 * so reusing it would cap delivered utilisation at 0.87 and the channel could
 * never reach 1. This clamp only exists to swallow raycast/curb spikes.
 */
export const GRIP_SIGNAL_MAX_ACCEL_MS2 = 20;

/** Low-pass rate (1/s) for the measured accelerations — matches the roll
 *  coupling's ROLL_COUPLING_LP; raycast tyre forces are jittery per step and
 *  an un-damped signal would chatter the audio layer. */
export const GRIP_SIGNAL_LP = 10;

/** Utilisation is reported clamped to this — a runaway demand term at full
 *  lock and speed would otherwise hand the audio layer a huge number. */
export const GRIP_UTILISATION_MAX = 2;

/** Below this speed (km/h) the channel reports 0. Kinematic demand explodes
 *  as v→0 only in the sense that it vanishes, but the delivered term is pure
 *  raycast noise at walking pace and a parking manoeuvre must be silent. */
export const GRIP_SIGNAL_MIN_KMH = 6;

/** Gravity magnitude (m/s²) — tuning.GRAVITY is the signed Y component. */
const G = Math.abs(GRAVITY);

/**
 * The lateral acceleration (m/s²) the tyres can deliver at this surface grip.
 * gripFactor 1 (dry) ≈ 14.2; wet 0.7 ≈ 10.0; packed snow 0.4 ≈ 5.7; a water
 * or ice patch 0.15 ≈ 2.1 — which is why the ice lessons feel like the car
 * stopped answering, and why this number is what the student needs to feel.
 */
export function gripCeilingMs2(gripFactor: number): number {
  return GRIP_SIGNAL_MU * G * Math.max(gripFactor, 0.01);
}

function clampUtil(u: number): number {
  if (!Number.isFinite(u) || u < 0) return 0;
  return u > GRIP_UTILISATION_MAX ? GRIP_UTILISATION_MAX : u;
}

/**
 * DELIVERED utilisation: the friction-circle magnitude of the accelerations
 * the tyres actually produced, over the ceiling. Longitudinal is included
 * because a car braking at 0.9 g has already spent most of its grip — that is
 * why trail-braking into a corner is the classic novice loss of control, and
 * the combined circle is the only form that expresses it.
 *
 * Both inputs are the LOW-PASSED, clamped accelerations VehicleSim measures.
 */
export function deliveredGripUtilisation(
  aLatMs2: number,
  aLongMs2: number,
  gripFactor: number,
): number {
  return clampUtil(Math.hypot(aLatMs2, aLongMs2) / gripCeilingMs2(gripFactor));
}

/**
 * DEMANDED utilisation: what the current road-wheel angle is ASKING for at
 * this speed (kinematic bicycle model), over the same ceiling. Above 1 the
 * driver is asking for grip that does not exist — the car will understeer
 * wide however hard the wheel is turned, and that is the moment the tyre
 * must be heard.
 */
export function demandedGripUtilisation(
  speedMs: number,
  steerRad: number,
  gripFactor: number,
): number {
  const aLat = Math.abs((speedMs * speedMs * Math.tan(steerRad)) / GRIP_SIGNAL_WHEELBASE_M);
  return clampUtil(aLat / gripCeilingMs2(gripFactor));
}

/**
 * The single number the audio layer and the debrief read: the worse of the
 * two halves. Delivered alone under-reports (it saturates at the ceiling);
 * demanded alone misses pure braking and the moment the rear steps out under
 * power. Whichever is higher is the honest answer to "how much of the grip
 * that exists is this driver using?".
 */
export function combinedGripUtilisation(
  delivered: number,
  demanded: number,
): number {
  return delivered > demanded ? delivered : demanded;
}
