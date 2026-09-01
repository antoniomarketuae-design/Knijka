/**
 * THE AIR ITSELF, MADE VISIBLE — the force→picture mapping the wind-drift
 * layer draws with.
 *
 * WHY THIS EXISTS — `sc-ac-wind-truck-pass:6a076479`, major: „No crosswind is
 * depicted anywhere — no gust, no dust, no spray, no sway on the trailer,
 * nothing moving in the grass — in a lesson whose whole subject is the gust you
 * take when you clear the truck's lee."
 *
 * HALF OF THAT ROW IS ALREADY CLOSED and this file does not re-close it:
 * `world/textures/windSway.ts` leans the street-tree canopies on the sim's own
 * gust phase. But the canopies are the only thing in the world that moves for
 * the wind, and on the map THIS lesson runs (`mw-v1`) they are the wrong
 * object: measured on the built geometry (`buildWorldGeometry(mw-v1, seed 7)`),
 * all 128 of its trees stand at world x = +30.1 … +59.2, i.e. 22–51 m off the
 * emergency lane on ONE side, while the student's lanes are x = 0 and −8.12 and
 * his eyes are on the truck ahead. `props.ts`'s `dressesAsStreet` is why —
 * a магистрала carries no street dressing, so nothing sways near the
 * carriageway and nothing sways in front of him at all.
 *
 * So the wind gets the one channel that is in the forward view on every map:
 * the air. Dust and chaff streaming across the carriageway, at the speed the
 * air is actually moving, breathing on the gust.
 *
 * ONE NUMBER, NOT TWO — the law `windSway.ts` set. The input here is
 * `VehicleSim.windLateralNow`: the exact newtons the chassis is being pushed
 * with THIS frame, read rather than recomputed on a render clock, so the dust
 * cannot drift out of phase with the push. A student who is taught to release
 * the counter-steer as the gust dies now has a cue that arrives with the force
 * instead of after the car has already moved.
 *
 * THE SPEED IS DERIVED FROM THE FORCE BY THE FORCE'S OWN LAW, not guessed:
 * `tuning.ts`'s CROSSWIND_BRIDGE_N docblock grounds 1200 N on a ~18 m/s gust
 * through F = Cs·A·½ρv², so v scales with √F and the peak of the shipped
 * envelope (1200 + 500 = 1700 N) is 18·√(1700/1200) ≈ 21.4 m/s. Retune the
 * newtons in `tuning.ts` and the picture follows; `windDrift.test.ts` asserts
 * the reference against the real constants so a retune turns red instead of
 * quietly rescaling the air.
 */

/**
 * The force at which the drift reaches its full speed and opacity, newtons —
 * the PEAK of the shipped crosswind (`tuning.CROSSWIND_BRIDGE_N` 1200 +
 * `tuning.CROSSWIND_GUST_AMPLITUDE_N` 500). Written as a literal rather than
 * imported so `sim/environment` takes no dependency on `sim/vehicle` for one
 * constant — the same discipline `windSway.ts` states, with the same test
 * holding the equality.
 */
export const WIND_DRIFT_REFERENCE_N = 1700;

/** Air speed at `WIND_DRIFT_REFERENCE_N`, m/s (see the header's √F note). */
export const WIND_DRIFT_SPEED_AT_REFERENCE_MPS = 21.4;

/**
 * Peak alpha of a mote. Deliberately low: this is dust in strong wind over a
 * clear motorway, not a sandstorm, and the surfaces the rule engine grades the
 * student on (lane paint, the М2 edge line, the truck) must stay legible
 * through it — the discipline `snowCover.ts` and `windSway.ts` both state.
 */
export const WIND_DRIFT_MAX_OPACITY = 0.55;

/**
 * Alpha floor as a fraction of the peak, so the lull thins the air without
 * emptying it. The shipped gust runs 700 N → 1700 N, i.e. strength 0.41 → 1.0,
 * so the motes breathe between 0.32 and 0.55 alpha on the 5 s sine — visible
 * as a rhythm rather than a flicker.
 */
export const WIND_DRIFT_OPACITY_FLOOR = 0.3;

/** Streak half-length at full strength, metres (a dust dash, not a rain line).
 *  Sized against RainStreaks' 0.55 m line: a mote is shorter, but 0.34 measured
 *  too faint to survive a carriageway behind it — see `WindDust.tsx`'s
 *  AREA_HALF for the measurement the two constants were retuned from. */
export const WIND_DRIFT_STREAK_M = 0.55;

/** Streak half-length floor as a fraction — the lull shortens the dashes. */
export const WIND_DRIFT_STREAK_FLOOR = 0.35;

/** What the drift layer draws for one reading of the live wind force. */
export interface WindDriftLook {
  /** |force| against the shipped peak, clamped to 0..1. */
  strength: number;
  /** SIGNED air speed along world +X, m/s (negative = the air blows west). */
  speedMps: number;
  /** Shader alpha for the motes — 0 when the lesson authors no wind. */
  opacity: number;
  /** Streak half-length, metres. */
  streakM: number;
}

/**
 * Map the live lateral wind force (N along world +X, the sign convention
 * `VehicleSim.windLateralNow` uses) onto what the air should look like.
 *
 * Pure, total and side-effect free: 0 N returns a fully transparent look, so a
 * lesson that authors no crosswind draws nothing even if the layer is mounted.
 */
export function windDriftLook(lateralN: number): WindDriftLook {
  const magnitude = Math.abs(lateralN);
  const strength = Math.min(magnitude / WIND_DRIFT_REFERENCE_N, 1);
  if (strength === 0) {
    return { strength: 0, speedMps: 0, opacity: 0, streakM: 0 };
  }
  const direction = lateralN < 0 ? -1 : 1;
  return {
    strength,
    speedMps: direction * WIND_DRIFT_SPEED_AT_REFERENCE_MPS * Math.sqrt(strength),
    opacity:
      WIND_DRIFT_MAX_OPACITY *
      (WIND_DRIFT_OPACITY_FLOOR + (1 - WIND_DRIFT_OPACITY_FLOOR) * strength),
    streakM:
      WIND_DRIFT_STREAK_M * (WIND_DRIFT_STREAK_FLOOR + (1 - WIND_DRIFT_STREAK_FLOOR) * strength),
  };
}
