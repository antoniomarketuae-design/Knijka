/**
 * Seedable PRNG for deterministic exam generation.
 *
 * mulberry32 — tiny, fast, good-enough statistical quality for shuffling
 * question banks. NOT cryptographic (not needed here: exam integrity comes
 * from never sending `correct` flags to the client, not from seed secrecy).
 *
 * No module-level randomness: callers create an Rng from an explicit seed and
 * thread it through. `randomSeed()` is the only non-deterministic helper and
 * is invoked explicitly by callers that want a fresh exam.
 */

export type Rng = () => number;

/** Deterministic PRNG in [0, 1) from a 32-bit seed. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fresh non-deterministic 32-bit seed (call-time only, never at module load). */
export function randomSeed(): number {
  return (Math.floor(Math.random() * 0x100000000) ^ Date.now()) >>> 0;
}

/**
 * Derive a stable sub-seed from a base seed and a string key (FNV-1a, salted
 * with the seed).
 *
 * Why a *derived* seed instead of a shared stream: the builder threads one Rng
 * through the whole selection, so the option order of question #17 depends on
 * how many draws every earlier step consumed — which depends on the size and
 * shape of the entire bank. That is unreplayable the moment content changes,
 * and re-rendering an in-progress exam must survive exactly that (audit H-7).
 * Keying off (attempt seed, question id) makes one question's option order
 * independent of everything else, so it is identical on every resume.
 */
export function deriveSeed(seed: number, key: string): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0; // FNV offset basis, salted by seed
  for (let i = 0; i < key.length; i++) {
    h = (h ^ key.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0; // FNV prime
  }
  return h >>> 0;
}

/** Fisher–Yates shuffle. Returns a NEW array; input is not mutated. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Deterministic pick of one element (throws on empty input). */
export function pickOne<T>(items: readonly T[], rng: Rng): T {
  if (items.length === 0) throw new Error("pickOne: empty array");
  return items[Math.floor(rng() * items.length)];
}
