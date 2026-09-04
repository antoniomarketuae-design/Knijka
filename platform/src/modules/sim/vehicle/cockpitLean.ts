/**
 * THE COCKPIT'S LATERAL SENSE — what the student's head is leaned by.
 *
 * WHY THIS FILE EXISTS — `sc-ac-crosswind:a9db1738`, major: „A lesson built on
 * constant steering correction gives the student nothing to correct with or
 * against … there is no wind force visible in the car's attitude … Nothing in
 * the cockpit reports a lateral disturbance."
 *
 * On a screen there is no seat and no wheel weight — the sentence
 * `templates-conditions.ts` writes at step 6 of that very lesson. The ONE
 * channel the cockpit has for sideways force is `CameraRig`'s G-force head
 * motion (doc 63 §2): the eye slides against the corner and the head rolls
 * into it. Its input was
 *
 *     a = v² · tan(steer) / L
 *
 * — the kinematic bicycle estimate, computed from the DRIVER'S OWN STEERING and
 * from nothing else. That is exactly right for a corner and exactly wrong for a
 * crosswind, which is by definition a lateral acceleration the steering does not
 * explain. With hands fixed the term is identically 0, so on `sc-ac-crosswind`
 * the head sat dead level for the whole drive while the chassis was taking the
 * measured shove `crosswind.test.ts` pins (≈1 m downwind in 5 s at cruise,
 * ≈2.7 m in 10 s — half a lane). The push was real, graded, and invisible.
 *
 * THE FIX IS ADDITIVE AND CARRIES NO NEW GAIN. The wind's own contribution
 * arrives already in m/s² from `VehicleSim.windLatAccelMs2` — the newtons the
 * chassis is being pushed with, divided by the mass rapier was given, projected
 * on the car's left axis — and is simply SUMMED with the estimate. No
 * multiplier, no exaggeration: a 1 200 N steady wind on a 1 220 kg car is
 * 0.98 m/s² ≈ 0.10 g, and 0.10 g is what the student's head gets, because a
 * driver taught to read an inflated cue has been taught to misread the real
 * road (the north-star test). What makes it legible is not size but RHYTHM —
 * the shipped gust envelope breathes the term between 0.057 g and 0.142 g on a
 * 5 s sine, so the lean swells and eases with the gust. That easing is the
 * observable trigger step 6 asks the student to release the correction on, and
 * step 7's „втора корекция" is the mistake he makes when he cannot see it.
 *
 * BIT-IDENTICAL WHEN CALM. `windLatAccelMs2` returns the literal 0 on every
 * lesson that authors no `physics.crosswind` (two templates in the whole
 * catalogue), so `x + 0` leaves every other cockpit exactly where it was.
 *
 * PURE, TOTAL, NO PHYSICS. Nothing here applies a force or advances a clock —
 * this is a camera input, on the F1 read-channel law (`gripSignal.ts`). Grading
 * never reads it; a student's verdict cannot move because his head leaned.
 */

/** Wheelbase used by the kinematic estimate, m. Re-exported through
 *  `tuning.ts` as `ESTIMATE_WHEELBASE`; taken as an argument here so this
 *  module stays a pure function of its inputs. */
export interface CockpitLeanInput {
  /** Forward speed, m/s. */
  speedMps: number;
  /** Road-wheel steer angle, rad (+ = left) — the driver's own input. */
  steerRad: number;
  /** Wheelbase for the bicycle estimate, m (`ESTIMATE_WHEELBASE`). */
  wheelbaseM: number;
  /**
   * Lateral acceleration imposed by forces the steering does not explain,
   * m/s² (+ = toward the car's left) — today the crosswind, via
   * `VehicleSim.windLatAccelMs2`. 0 for every calm lesson.
   */
  disturbanceMs2: number;
}

/**
 * Car-local lateral acceleration the cockpit should lean on (m/s², + = left).
 *
 * `Math.tan` is safe here for every reachable steer angle: `STEER_MAX_ANGLE` is
 * far from π/2, so the estimate cannot blow up, and `CameraRig` clamps the
 * result to ±1.2 g before it reaches the head anyway.
 */
export function cockpitLatAccelMs2(input: CockpitLeanInput): number {
  const { speedMps, steerRad, wheelbaseM, disturbanceMs2 } = input;
  const kinematic = (speedMps * speedMps * Math.tan(steerRad)) / wheelbaseM;
  return kinematic + disturbanceMs2;
}
