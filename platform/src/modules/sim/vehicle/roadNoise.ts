// roadNoise.ts — road-surface vertical motion (doc 82 §4.2 F2).
//
// WHY: `ROAD_Y` is a single constant (world/builders/constants.ts) — the
// carriageway is a perfectly flat plane, so the carefully tuned suspension
// (1.62 Hz, ζ 0.37/0.61, anti-roll bars, COCKPIT_DAMPING 25) NEVER MOVES in a
// straight line. That is why the car reads as a camera on rails rather than
// 1220 kg. The fix the doc mandates is explicitly NOT displaced geometry
// (that breaks colliders, markings, decals and every builder) but a small
// per-wheel vertical impulse.
//
// DETERMINISM IS THE WHOLE DESIGN CONSTRAINT. The noise is sampled at the
// WHEEL'S WORLD POSITION, from an integer hash — no RNG, no seed, no
// accumulated state. The same wheel over the same square metre of Sofia gets
// the same bump on every run, in the browser and in Node, forever. That is
// what keeps recorded `SimAttemptTrace` replays and the CI baselines
// reproducible, and it is why the rule engine can still be trusted afterwards.
//
// AMPLITUDE IS DELIBERATELY TINY. Doc 82: "Target sub-centimetre wheel
// displacement at city speed; overdoing amplitude causes sim sickness." The
// per-wheel spring rate is SUSPENSION_STIFFNESS · CHASSIS_MASS = 26 · 1220 ≈
// 31,700 N/m, so the 160 N ceiling below is ≈ 5 mm of travel — felt in the
// cockpit camera, invisible on the speedometer, and ~1.3% of the 2,993 N
// static corner load, far too small to change a braking distance or a
// cornering line.
//
// This file is pure and node-testable; VehicleSim only calls it behind the
// roadRoughness gate, which defaults to 0 (no code path at all).

/** Roughness at which the amplitude below is reached in full. Lessons pass a
 *  0..1 surface factor; 0 (the default everywhere) skips the code path. */
export const ROAD_ROUGHNESS_MAX = 1;

/**
 * Per-wheel vertical force amplitude (N) at roughness 1 and full speed.
 * 160 N ≈ 5 mm of suspension travel (see the header) — the sub-centimetre
 * target. Raise this and you buy nausea, not realism.
 */
export const ROAD_ROUGHNESS_FORCE_N = 160;

/** Speed (km/h) at which the amplitude reaches full. Below it the effect
 *  fades to nothing: a parked car must not jiggle, and a car creeping into a
 *  parking bay must feel exactly as precise as it does today. */
export const ROAD_ROUGHNESS_FULL_KMH = 45;
/** Below this speed (km/h) there is no vertical excitation at all. */
export const ROAD_ROUGHNESS_MIN_KMH = 5;

/**
 * First-octave feature size (m) — the long undulation of a resurfaced lane,
 * the settle over a buried trench. At 50 km/h a wheel crosses one every
 * ~0.26 s ≈ 3.9 Hz, just above the 1.62 Hz body mode, so the chassis answers
 * with a gentle float rather than a resonant wallow.
 */
export const ROAD_NOISE_WAVELENGTH_M = 3.6;
/** Second octave = this many times finer (0.9 m) — the coarse-aggregate/tar-
 *  seam texture the tyre patch actually rides over. */
export const ROAD_NOISE_OCTAVE2_SCALE = 4;
/** Second-octave weight. Below 0.5 so the long wave still leads. */
export const ROAD_NOISE_OCTAVE2_GAIN = 0.45;
/** Arbitrary lattice offset for the second octave so the two do not share
 *  their zero crossings (which would read as one wave, not two). */
const OCTAVE2_OFFSET = 137.13;

/**
 * Integer hash → [0, 1). Deterministic, allocation-free, no Math.random:
 * the same lattice cell always yields the same value, in every runtime.
 * (xorshift-multiply finaliser; Math.imul keeps it in int32 on every engine.)
 */
function hash2(ix: number, iz: number): number {
  let h = Math.imul(ix | 0, 0x27d4eb2d) ^ Math.imul(iz | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Bilinear value noise on the integer lattice, smoothstep-faded, in [-1, 1]. */
function valueNoise(x: number, z: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const n00 = hash2(x0, z0);
  const n10 = hash2(x0 + 1, z0);
  const n01 = hash2(x0, z0 + 1);
  const n11 = hash2(x0 + 1, z0 + 1);
  const a = n00 + (n10 - n00) * sx;
  const b = n01 + (n11 - n01) * sx;
  return (a + (b - a) * sz) * 2 - 1;
}

/**
 * The road profile at a world XZ position, in [-1, 1]. Two octaves so the
 * surface carries both a long undulation and a fine texture — one octave
 * alone reads as a sine wave, which is worse than flat.
 */
export function roadNoiseAt(x: number, z: number): number {
  const o1 = valueNoise(x / ROAD_NOISE_WAVELENGTH_M, z / ROAD_NOISE_WAVELENGTH_M);
  const s = ROAD_NOISE_OCTAVE2_SCALE / ROAD_NOISE_WAVELENGTH_M;
  const o2 = valueNoise(x * s + OCTAVE2_OFFSET, z * s + OCTAVE2_OFFSET);
  return (o1 + o2 * ROAD_NOISE_OCTAVE2_GAIN) / (1 + ROAD_NOISE_OCTAVE2_GAIN);
}

/** Speed envelope 0..1 — silent below MIN, full at FULL_KMH and above. */
export function roadRoughnessSpeedScale(speedKmh: number): number {
  const v = Math.abs(speedKmh);
  if (v <= ROAD_ROUGHNESS_MIN_KMH) return 0;
  const x = (v - ROAD_ROUGHNESS_MIN_KMH) / (ROAD_ROUGHNESS_FULL_KMH - ROAD_ROUGHNESS_MIN_KMH);
  return x >= 1 ? 1 : x;
}

/**
 * Vertical force (N, signed) for one wheel at a world position and speed.
 * `roughness` is the lesson's surface factor (0 = today's glass-smooth road,
 * and the caller must not even reach this function at 0).
 */
export function roadRoughnessForceN(
  x: number,
  z: number,
  speedKmh: number,
  roughness: number,
): number {
  const r = roughness > ROAD_ROUGHNESS_MAX ? ROAD_ROUGHNESS_MAX : roughness;
  if (r <= 0) return 0;
  const speed = roadRoughnessSpeedScale(speedKmh);
  if (speed === 0) return 0;
  return roadNoiseAt(x, z) * ROAD_ROUGHNESS_FORCE_N * r * speed;
}
