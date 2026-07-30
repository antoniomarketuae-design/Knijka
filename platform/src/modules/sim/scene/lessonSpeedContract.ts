/**
 * THE LESSON'S OWN SPEED CONTRACT (doc 86 B7 / L17, lane 8).
 *
 * A district publishes the speeds its ROADS permit (`edge.maxspeed`, read by
 * `LessonScene.maxLegalSpeedOf`). A few districts additionally publish a speed
 * the LESSON REQUIRES — a number the student must actually be able to hold or
 * the drill cannot be completed at all. Today there is exactly one such
 * declaration in the tree and it was the cause of a scenario that could not be
 * won on any rung:
 *
 *   `content/world/sig-wave-v1.json` → `meta.scenario.wave.speedKmh = 50`
 *   (with `blockTravelSec` 19.01, i.e. the lamp offsets are solved FOR 50).
 *   `governorCapKmh("beginner", 50)` was 40 km/h, whose sustainable top speed
 *   is 39.1 km/h — a block then takes 23.8 s, the phase slips ~4.8 s per
 *   block, and the second and third greens are structurally unreachable.
 *   Nothing refused the tier and nothing told the student why (doc 86 B7).
 *
 * The rule this file encodes: **a tier may be slower than the road; it may
 * never be slower than the lesson.** The resolved number floors the governor
 * cap (`vehicle/difficulty.ts` governorCapKmh → REQUIRED_SPEED_HEADROOM_KMH).
 *
 * READ-ONLY over district data — this file never edits, only interprets, and
 * it is deliberately tolerant: an absent/garbage declaration returns undefined
 * and every governor path falls back to the domain rule, byte-identically.
 */

import type { District } from "@/modules/sim/world";

/** Sanity band for a declared required speed (km/h). Anything outside it is
 *  data corruption, not a contract — ignore it rather than governing to it. */
const MIN_DECLARED_KMH = 5;
const MAX_DECLARED_KMH = 200;

function finiteInBand(v: unknown): number | undefined {
  return typeof v === "number" &&
    Number.isFinite(v) &&
    v >= MIN_DECLARED_KMH &&
    v <= MAX_DECLARED_KMH
    ? v
    : undefined;
}

/**
 * The speed (km/h) this district's own scenario metadata says the student must
 * be able to drive, or undefined when it declares none.
 *
 * Sources, in precedence order:
 *  1. `meta.scenario.wave.speedKmh` — a green-wave map's solved-for speed.
 *  2. `meta.scenario.requiredSpeedKmh` — the generic seam, so a future
 *     generator can declare one without another code change here.
 */
export function lessonRequiredSpeedKmh(district: District): number | undefined {
  const scenario = district.meta?.scenario as
    | { wave?: { speedKmh?: unknown }; requiredSpeedKmh?: unknown }
    | undefined;
  if (!scenario || typeof scenario !== "object") return undefined;
  return (
    finiteInBand(scenario.wave?.speedKmh) ?? finiteInBand(scenario.requiredSpeedKmh)
  );
}
