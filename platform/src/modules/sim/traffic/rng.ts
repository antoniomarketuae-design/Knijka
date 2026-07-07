/**
 * Deterministic PRNG (mulberry32). Every random decision in sim/traffic goes
 * through a stream created here — never Math.random — so a seed fully
 * determines route choices, agent parameters and pedestrian wait times.
 */

export type Rng = () => number;

/** Returns a function producing floats in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [0, n). */
export function rngInt(rng: Rng, n: number): number {
  return Math.floor(rng() * n);
}

/** Float in [min, max). */
export function rngRange(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}
