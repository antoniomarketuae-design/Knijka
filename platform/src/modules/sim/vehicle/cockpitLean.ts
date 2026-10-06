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
 * the head sat dead level for the whole drive while the wind was on the
 * chassis. The push was real, graded, and invisible.
 *
 * THE WIND ALSO TURNS THE CAR NOW, AND THE ESTIMATE HAS TO KNOW IT — founder
 * ruling 2026-10-04 gave the wind its yaw pull (`crosswindPull.ts`): the
 * steered pair is turned downwind, and holding the lane takes a HELD wheel
 * into the wind. Round 1 of that repair left the estimate on the driver's
 * wheel alone, and its verifier measured what that did (finding V-05): the
 * better a student held the lane, the less he was told about the wind. His
 * held correction entered the estimate as a „corner" the other way and
 * cancelled the wind term — 0.35 m/s² left of 0.97 at the taught 34 km/h, and
 * about NOTHING at the motorway sibling's 70–78 km/h. The cue leaned a driver
 * who let go and went level on the driver doing the taught thing: backwards.
 *
 * SO THE KINEMATIC TERM IS TAKEN ON THE ROAD WHEELS — the driver's wheel PLUS
 * the wind's pull, `v²·tan(steer + pull)/L` — which is where the car is really
 * being steered, and the wind's own F/m is added to it whole:
 *   · LANE HELD: the road wheels are straight, the estimate is 0, and the head
 *     gets exactly the wind's F/m, breathing with the gust — the cue the row
 *     was repaired for, identical to what a lane-holder got before the pull
 *     existed (0.97 m/s² at 34 and at 78 km/h; `crosswind.test.ts` §2b);
 *   · LET GO: the wind's F/m PLUS the arc the car is really turned onto
 *     (0.62 of F/m at 34 km/h, 0.90 at 78 — never as much as F/m,
 *     `crosswindPathShareOfWind`), so the lean is 1.6–1.9× the held one while
 *     the car is being carried out of its lane;
 *   · OVER-CORRECTED (the gust has eased and the wheel has not): the estimate
 *     goes negative and takes the lean back toward level and past it — the
 *     cue to release, before the second swing.
 * A wheel angle is not counted twice by this: `steerRad` is the driver's and
 * `windSteerPullRad` is the wind's, they are two different angles on the same
 * axle, and `disturbanceMs2` is a force, not an angle.
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

import { ESTIMATE_WHEELBASE } from "./tuning";

/** Wheelbase used by the kinematic estimate, m. Re-exported through
 *  `tuning.ts` as `ESTIMATE_WHEELBASE`; taken as an argument here so this
 *  module stays a pure function of its inputs. */
export interface CockpitLeanInput {
  /** Forward speed, m/s. */
  speedMps: number;
  /** The DRIVER'S wheel as a road-wheel angle, rad (+ = left) —
   *  `VehicleSim.steerRad`. */
  steerRad: number;
  /**
   * Road-wheel angle the crosswind is adding, rad (+ = left) —
   * `VehicleSim.windSteerPullRad`. Summed with `steerRad` it is where the
   * steered pair really stands, which is what the corner estimate must be
   * taken on. Optional and 0 by default: every calm lesson, and every caller
   * that predates the pull, gets `tan(steerRad + 0)` — the estimate as it was.
   */
  windSteerPullRad?: number;
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
  const roadWheelRad = steerRad + (input.windSteerPullRad ?? 0);
  const kinematic = (speedMps * speedMps * Math.tan(roadWheelRad)) / wheelbaseM;
  return kinematic + disturbanceMs2;
}

/**
 * The four live-car readings the head lean is taken from — `VehicleSim`'s own
 * getters, by name. `steerRad` is the DRIVER'S wheel; the car's
 * `roadWheelRad` already has the wind's pull in it, so handing that here as
 * well would count the pull twice (round-2 verifier V2-04: its mutant made
 * exactly that edit in `CameraRig` and no test saw it).
 */
export interface CockpitLeanSource {
  readonly speedKmh: number;
  readonly steerRad: number;
  readonly windSteerPullRad: number;
  readonly windLatAccelMs2: number;
}

/**
 * THE LEAN INPUT, OFF THE LIVE CAR — what `CameraRig` feeds the head, as one
 * function of the whole car, so the camera cannot pick a different field than
 * the one the behavioural tests drive (`crosswind.test.ts`, a lane-holder on
 * the real `VehicleSim` leaned by the wind's own F/m) and the live-lesson
 * harness reads the same number the cockpit shows. No car (the rig not yet
 * mounted) is a level head, as `CameraRig` always had it.
 */
export function cockpitLeanFromSim(sim: CockpitLeanSource | null | undefined): number {
  if (!sim) return 0;
  return cockpitLatAccelMs2({
    speedMps: sim.speedKmh / 3.6,
    steerRad: sim.steerRad,
    windSteerPullRad: sim.windSteerPullRad,
    wheelbaseM: ESTIMATE_WHEELBASE,
    disturbanceMs2: sim.windLatAccelMs2,
  });
}
