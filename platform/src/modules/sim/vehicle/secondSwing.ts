/**
 * THE SECOND SWING — «вторият замах», detected while the student makes it.
 *
 * WHY THIS FILE EXISTS — `sc-ac-crosswind:a9db1738`, major. The row has four
 * clauses and three of them have already been answered in product code: the
 * canopies bend on the live gust (`world/textures/windSway.ts`, wave 18), the
 * air itself drifts (`environment/windDrift.ts`, wave 18) and the student's head
 * is leaned by the shove (`cockpitLean.ts` → `CameraRig`, wave 24). The clause
 * left standing is the fourth: „the briefing's «втора корекция» warning has no
 * observable trigger."
 *
 * It is `sc-ac-crosswind`'s instruction 7 — «Пази се от рязката „втора
 * корекция“ — тя изхвърля колата към бордюра» — and until now the product could
 * not tell whether the student had just committed it. `cockpitLean.ts` ends its
 * own docblock on exactly this sentence: the gust's easing „is the observable
 * trigger step 6 asks the student to release the correction on, and step 7's
 * «втора корекция» is the mistake he makes when he cannot see it." Wave 24 gave
 * him the cue to release on. Nothing named the mistake when he made it anyway,
 * so the warning was a sentence in a briefing with no consequence anywhere in
 * the drive — the shape doc 64 THEO-4 forbids from the other direction (a
 * verdict with no explanation is banned; a warning with no verdict teaches just
 * as little).
 *
 * WHAT IT IS, PHYSICALLY. The wind pushes the car one way; the driver holds the
 * wheel the other way to cancel it. When the gust eases, the correction is
 * suddenly unopposed — and the reflex is to snap the wheel back through centre.
 * Now the residual wind and the driver's own input point the SAME way and the
 * car leaves on the downwind side far harder than the gust ever pushed it. That
 * is the crash `templates-conditions.ts` teaches (`teach.whyBg`: „вторият замах
 * е причината за повечето катастрофи при вятър"), and it is a SHAPE IN THE
 * STEERING TRACE, not a position: a held upwind correction, then a whip through
 * zero to the downwind side inside about a second.
 *
 * WHY NOT `POOR_LANE_KEEPING`. The shipped detector (`rules/engine.ts`) is
 * positional and sustained — `laneKeepSustainSec` of continuous off-centre. It
 * grades the OUTCOME, and it grades it late: by the time it fires the car has
 * already spent seconds out of position. The template's own note is that the
 * lane detectors ARE the honest grading for the drift, and this module does not
 * touch them. It is not a grader at all — see the law below.
 *
 * THE LAW OF THIS MODULE — A READ, NOT A RULE (`gripSignal.ts` / `cockpitLean.ts`
 * F1 discipline). Nothing here applies a force, advances a clock, or reaches the
 * rule engine: no verdict moves, no score changes, nothing is deducted. It
 * decides only whether the coaching line is on the glass. And it is armed by the
 * AUTHORED opt-in and by nothing else: `windLatAccelMs2` is the literal 0 on
 * every lesson that does not author `physics.crosswind`, so `windSign` is 0, the
 * state machine resets every frame and `stepSecondSwing` can never fire. Two
 * templates in the whole catalogue author it.
 */

/**
 * The thresholds. Each is grounded on a shipped constant rather than picked:
 *
 *  · `HOLD_RAD` / `SWING_RAD` — 0.10 rad of road-wheel angle. At the ~34 km/h
 *    this drill is taught at, `tuning.ts`'s speed-sensitive limit leaves about
 *    0.51 rad of lock, so 0.10 is a fifth of everything the car will give and
 *    unmistakably a deliberate movement. For scale, the steady counter-steer
 *    that out-pulls this wind in `crosswind.test.ts` is ~0.025 rad — 5 % of
 *    input. A quarter of the wheel is not a correction; it is a swing.
 *  · `HOLD_SEC` — 0.35 s. `STEER_SPEED` is 3.2 rad/s, so a mere flick through
 *    0.10 rad occupies ~0.03 s. A third of a second is a HELD correction.
 *  · `WINDOW_SEC` — 1.2 s after the hold ends. `STEER_RETURN_SPEED` is
 *    4.8 rad/s: a wheel released from 0.10 rad self-centres in ~0.02 s, and
 *    crossing to 0.10 rad on the far side under power takes ~0.06 s. 1.2 s is
 *    generous to the student and still far too short to catch a smooth release
 *    followed by an unrelated later steering input.
 *  · `MIN_SPEED_KMH` — 20. Below `STEER_FULL_SPEED_KMH` (15) the car hands over
 *    full lock for parking, where large opposite-lock movements are the correct
 *    technique; 20 keeps this off every manoeuvring drill and is well under the
 *    ~34 km/h this lesson is driven at.
 *  · `MIN_WIND_MS2` — 0.3. The shipped wind breathes between 0.57 and 1.39 m/s²
 *    (`CROSSWIND_BRIDGE_N ± CROSSWIND_GUST_AMPLITUDE_N` over `CHASSIS_MASS`),
 *    so the whole gust cycle is above this and a calm lesson's exact 0 is below
 *    it. It is a guard against a future near-zero wind, not a live threshold.
 *  · `CUE_SEC` / `COOLDOWN_SEC` — 4 s of reading time, then 8 s of silence. The
 *    advisor's first rule, verbatim: „a line that repeats every two seconds is
 *    worse than silence." A student sawing at the wheel gets one sentence per
 *    12 s, not one per frame.
 */
export const SECOND_SWING = {
  /** Road-wheel angle (rad) that counts as a held correction. */
  HOLD_RAD: 0.1,
  /** How long it must be held (s) before a reversal can count as the second. */
  HOLD_SEC: 0.35,
  /** Road-wheel angle (rad) on the OPPOSITE side that completes the swing. */
  SWING_RAD: 0.1,
  /** How long after the hold ends (s) the reversal still counts as the second. */
  WINDOW_SEC: 1.2,
  /** Below this (km/h) large opposite lock is parking technique, not a swing. */
  MIN_SPEED_KMH: 20,
  /** Below this lateral acceleration (m/s²) there is no wind to correct for. */
  MIN_WIND_MS2: 0.3,
  /** How long the coaching line stays on the glass (s). */
  CUE_SEC: 4,
  /** Minimum silence between two lines (s) — the advisor's no-nag rule. */
  COOLDOWN_SEC: 8,
} as const;

/** One frame of the student's driving, as the detector needs it. */
export interface SecondSwingSample {
  /** Session clock, s. */
  tSec: number;
  /** Road-wheel steer angle, rad (+ = left) — `VehicleSim.steerRad`. */
  steerRad: number;
  /** Signed forward speed, km/h — `VehicleSim.speedKmh`. */
  speedKmh: number;
  /**
   * Car-local lateral acceleration imposed by the wind, m/s² (+ = toward the
   * car's left) — `VehicleSim.windLatAccelMs2`. Exactly 0 on every lesson that
   * authors no `physics.crosswind`, which is what disarms this whole module.
   */
  windLatAccelMs2: number;
}

/** Mutable per-drive state. Owned by the caller; never allocated per frame. */
export interface SecondSwingState {
  /** Seconds the current upwind correction has been held. */
  heldSec: number;
  /** Sign of that correction (+1 = wheel left), 0 when nothing is held. */
  heldSign: number;
  /** Session time until which a reversal still counts; -Infinity = not armed. */
  armedUntilSec: number;
  /** When the last swing fired; -Infinity = never. */
  firedAtSec: number;
}

/** What the frame decided. `fired` is the rising edge, `cue` is the level. */
export interface SecondSwingRead {
  /** True on the ONE frame the swing completes — for the attempt annotation. */
  fired: boolean;
  /** True while the coaching line should be up — for the HUD chip. */
  cue: boolean;
}

export function createSecondSwingState(): SecondSwingState {
  return {
    heldSec: 0,
    heldSign: 0,
    armedUntilSec: Number.NEGATIVE_INFINITY,
    firedAtSec: Number.NEGATIVE_INFINITY,
  };
}

/**
 * Step the detector one frame. Pure in everything but `state`, which it mutates
 * in place (the per-frame allocation discipline the scene's other channels
 * keep).
 *
 * THE SMOOTH RELEASE THE LESSON ASKS FOR CANNOT FIRE THIS, and that is the
 * whole design: easing the wheel back takes the steer to ~0 and leaves it
 * there. Firing requires the wheel to travel PAST centre to a fifth of full
 * lock on the downwind side, which is the movement instruction 7 names and
 * nothing else.
 */
export function stepSecondSwing(
  state: SecondSwingState,
  sample: SecondSwingSample,
  dtSec: number,
): SecondSwingRead {
  const { tSec, steerRad, speedKmh, windLatAccelMs2 } = sample;

  // Which way the air is pushing, and therefore which way a correction goes.
  const windSign =
    windLatAccelMs2 > SECOND_SWING.MIN_WIND_MS2
      ? 1
      : windLatAccelMs2 < -SECOND_SWING.MIN_WIND_MS2
        ? -1
        : 0;
  const correctionSign = -windSign;
  const movingFast = speedKmh >= SECOND_SWING.MIN_SPEED_KMH;

  let fired = false;

  if (correctionSign === 0 || !movingFast) {
    // No wind, or too slow for this to be the taught mistake: disarm. The cue
    // below is unaffected — a student who lifts off after swinging still gets
    // to read why.
    state.heldSec = 0;
    state.heldSign = 0;
    state.armedUntilSec = Number.NEGATIVE_INFINITY;
  } else {
    const holdingUpwind =
      Math.sign(steerRad) === correctionSign && Math.abs(steerRad) >= SECOND_SWING.HOLD_RAD;
    if (holdingUpwind) {
      state.heldSec += dtSec;
      state.heldSign = correctionSign;
      if (state.heldSec >= SECOND_SWING.HOLD_SEC) {
        // The window is re-based every held frame, so it opens when the hold
        // ENDS rather than when it started.
        state.armedUntilSec = tSec + SECOND_SWING.WINDOW_SEC;
      }
    } else {
      state.heldSec = 0;
    }

    const swungBack =
      state.heldSign !== 0 &&
      tSec <= state.armedUntilSec &&
      Math.sign(steerRad) === -state.heldSign &&
      Math.abs(steerRad) >= SECOND_SWING.SWING_RAD;
    if (swungBack && tSec - state.firedAtSec >= SECOND_SWING.COOLDOWN_SEC) {
      fired = true;
      state.firedAtSec = tSec;
      state.heldSec = 0;
      state.heldSign = 0;
      state.armedUntilSec = Number.NEGATIVE_INFINITY;
    }
  }

  return { fired, cue: tSec - state.firedAtSec < SECOND_SWING.CUE_SEC };
}
