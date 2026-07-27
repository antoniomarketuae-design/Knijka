/**
 * Hazard-perception scoring — PURE, and the part that must be provably fair.
 *
 * Nothing here reads content, touches a store, awaits anything or knows a user
 * exists. Everything it decides is a function of (window, presses), which is
 * what makes it testable to the edge and what lets the server be the only
 * authority: the browser hands over timestamps, this function hands back
 * points.
 *
 * ---------------------------------------------------------------------------
 * HOW THE REAL TEST SCORES (researched, so the shape is one that is known to
 * work rather than one we invented)
 *
 * The UK DVSA hazard-perception test shows 14 clips containing 15 developing
 * hazards. Each hazard is worth up to 5 points on a sliding window: the earlier
 * inside the window you click the more you score, down to 1, and outside the
 * window you score nothing. Clicking wrongly costs no points — but a candidate
 * who clicks continuously or in a pattern scores ZERO for that clip, which is
 * the anti-cheat that stops "cover the clip with clicks" from working. The car
 * pass mark is 44/75.
 *   gov.uk/theory-test/hazard-perception-test · gov.uk/theory-test/pass-mark-and-result
 *
 * WHAT WE KEEP: the 5→1 sliding band, "earlier is better but only inside the
 * window", zero for a clicking pattern, and 44/75 as the reference standard.
 *
 * WHAT WE CHANGE, and why:
 *  - THE WINDOW CLOSES AT THE CUT, and the cut lands at or before the fault.
 *    The DVSA lets its clips run on past the hazard; we must not, because a
 *    clip that runs on measures how fast you react to something blatant.
 *    Perception is the thing we are teaching.
 *  - ZERO IS NEVER BARE. A miss, a too-early press and a voided clip all score
 *    0, and all three still get the full „ето къде беше и защо" reveal
 *    (feedback.ts). A bare verdict is the one thing this product is not allowed
 *    to ship (doc 64 THEO-4).
 *  - 44/75 IS A BENCHMARK, NOT A PASS MARK. Hazard perception is not on the
 *    ДАИ exam; failing a student against a foreign standard on a skill their
 *    own exam ignores would make the whole surface feel like padding.
 * ---------------------------------------------------------------------------
 */

import {
  HAZARD_MAX_POINTS_PER_ITEM,
  type HazardItemScore,
  type HazardSpamReason,
  type HazardWindow,
} from "./types";

// ---------------------------------------------------------------------------
// Tunables — every one of them is a decision, so every one is named
// ---------------------------------------------------------------------------

/** Bands across the window: 5 → 4 → 3 → 2 → 1 points, earliest first. */
export const HAZARD_BANDS = HAZARD_MAX_POINTS_PER_ITEM;

/**
 * Two presses closer together than this are one tap.
 *
 * A mouse, a trackpad and especially a touchscreen all double-fire; a human
 * finger cannot deliberately produce two presses 80 ms apart. Collapsing them
 * BEFORE the anti-cheat check matters: without it a student with a bouncy
 * trackpad gets voided for cheating, which is the worst possible false positive
 * on a surface whose entire job is to be trusted.
 */
export const HAZARD_PRESS_DEBOUNCE_SEC = 0.08;

/**
 * Flood rule: presses allowed per second of playable clip, with a floor.
 * Density rather than a flat count, because a 12 s clip legitimately invites
 * more looking-and-second-guessing than an 8 s one.
 *
 * 0.8/s with a floor of 6 means an 8 s clip tolerates 7 presses and a 12 s clip
 * 10. Deliberately generous: a nervous first-timer pressing at four different
 * things is perceiving — badly — and should be taught, not accused.
 */
export const HAZARD_SPAM_PRESS_RATE = 0.8;
export const HAZARD_SPAM_MIN_PRESSES = 6;

/**
 * Metronome rule: this many consecutive presses whose gaps are all equal to
 * within the tolerance is a pattern, not perception. Five presses (four gaps)
 * is conservative on purpose — three evenly spaced presses happen by accident,
 * and the flood rule already catches anything denser.
 */
export const HAZARD_SPAM_RHYTHM_RUN = 5;
export const HAZARD_SPAM_RHYTHM_TOL_SEC = 0.25;

/**
 * How far past the cut a press may still arrive.
 *
 * The video element fires its last timeupdate slightly after we stop it, and a
 * finger already in motion when playback ends is not a fault. Those presses are
 * kept so they can be COUNTED as late (evidence); they can never score, because
 * bandFor() refuses anything past closeSec.
 */
export const HAZARD_LATE_SLACK_SEC = 0.5;

// ---------------------------------------------------------------------------
// Window geometry
// ---------------------------------------------------------------------------

/**
 * The six edges of the five bands, CLIP seconds: [open, …, close]. Band i
 * covers [edges[i], edges[i+1]) and pays 5 − i, with the final band closed at
 * both ends so a press exactly at the cut still scores 1 rather than nothing.
 *
 * Exported because the reveal timeline draws them — after grading only.
 */
export function bandEdges(window: HazardWindow): number[] {
  const span = window.closeSec - window.openSec;
  const step = span / HAZARD_BANDS;
  const edges: number[] = [];
  for (let i = 0; i <= HAZARD_BANDS; i++) edges.push(window.openSec + step * i);
  // Pin the last edge to closeSec exactly — floating-point accumulation must
  // not put the cut a microsecond outside its own window.
  edges[HAZARD_BANDS] = window.closeSec;
  return edges;
}

/**
 * Band index of a press, or null when it is outside the window (both ends
 * inclusive).
 *
 * Resolved by walking the SAME edges bandEdges() returns, not by re-deriving
 * the ratio. That is not pedantry: `(t − open) / span * 5` and
 * `open + span/5 * i` disagree at the boundaries in binary floating point, and
 * a press landing exactly on an edge would then be scored in one band and drawn
 * in the neighbouring one on the reveal timeline. A student who is shown a
 * different band from the one they were paid for has been told a lie about a
 * measurement, which is the one thing this surface cannot afford.
 */
export function bandFor(window: HazardWindow, pressSec: number): number | null {
  if (!Number.isFinite(pressSec)) return null;
  if (pressSec < window.openSec || pressSec > window.closeSec) return null;
  if (window.closeSec - window.openSec <= 0) return null; // the bank rejects these
  const edges = bandEdges(window);
  for (let i = HAZARD_BANDS - 1; i > 0; i--) {
    if (pressSec >= edges[i]) return i;
  }
  return 0;
}

/** Points for a band: the earliest band pays the maximum, the last pays 1. */
export function pointsForBand(band: number): number {
  return HAZARD_MAX_POINTS_PER_ITEM - band;
}

// ---------------------------------------------------------------------------
// Input hygiene
// ---------------------------------------------------------------------------

/**
 * Sanitise what the browser sent: drop anything that is not a finite second
 * inside [0, closeSec + slack], sort, then debounce.
 *
 * Dropping rather than rejecting is deliberate. A hostile client sending NaN,
 * −1 or 1e9 should get nothing out of it, not an error it can use to probe the
 * window; and an honest client with one stray event should still have its real
 * presses graded.
 */
export function sanitizePresses(
  pressSecs: readonly number[],
  window: HazardWindow,
): number[] {
  const limit = window.closeSec + HAZARD_LATE_SLACK_SEC;
  const clean = pressSecs
    .filter((t) => typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= limit)
    .sort((a, b) => a - b);

  const out: number[] = [];
  for (const t of clean) {
    const prev = out[out.length - 1];
    if (prev !== undefined && t - prev < HAZARD_PRESS_DEBOUNCE_SEC) continue;
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anti-cheat
// ---------------------------------------------------------------------------

/**
 * Is this a pattern of presses meant to cover the clip rather than perceive a
 * hazard? Runs on the DEBOUNCED presses (see HAZARD_PRESS_DEBOUNCE_SEC).
 *
 * Returns the rule that fired, or null. Both rules are deliberately biased
 * towards the student: a false accusation costs more than a cheat that gets 5
 * points on one clip, because the student cannot appeal and will simply stop
 * trusting the surface.
 */
export function detectSpam(
  pressSecs: readonly number[],
  window: HazardWindow,
): HazardSpamReason | null {
  // Flood: more presses than the clip's own length can justify.
  const allowed = Math.max(
    HAZARD_SPAM_MIN_PRESSES,
    Math.ceil(window.closeSec * HAZARD_SPAM_PRESS_RATE),
  );
  if (pressSecs.length > allowed) return "flood";

  // Metronome: a run of equal gaps. Every gap in the run is compared against
  // the run's FIRST gap — comparing neighbour to neighbour would let a slow
  // drift (0.4, 0.6, 0.8, 1.0) pass as a pattern when it is not one.
  if (pressSecs.length >= HAZARD_SPAM_RHYTHM_RUN) {
    const gaps: number[] = [];
    for (let i = 1; i < pressSecs.length; i++) gaps.push(pressSecs[i] - pressSecs[i - 1]);
    const runGaps = HAZARD_SPAM_RHYTHM_RUN - 1;
    for (let start = 0; start + runGaps <= gaps.length; start++) {
      const base = gaps[start];
      let uniform = true;
      for (let k = 1; k < runGaps; k++) {
        if (Math.abs(gaps[start + k] - base) > HAZARD_SPAM_RHYTHM_TOL_SEC) {
          uniform = false;
          break;
        }
      }
      if (uniform) return "rhythm";
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// The scoring function
// ---------------------------------------------------------------------------

/**
 * Score one clip. The only place hazard points are ever produced.
 *
 * Order of operations, and it matters:
 *   1. sanitise (drop impossible timestamps, sort, debounce);
 *   2. anti-cheat — a gamed clip is zero BEFORE any band is consulted, so
 *      spamming can never accidentally land on the 5-point band;
 *   3. the EARLIEST in-window press decides the score. Earlier is strictly
 *      better, so "earliest" and "best" are the same press. Taking the earliest
 *      is also what makes an early wrong guess followed by a late correct press
 *      score the LATE one: you get no credit for a press you made before the
 *      hazard existed.
 */
export function scoreHazardItem(
  itemId: string,
  window: HazardWindow,
  pressSecs: readonly number[],
): HazardItemScore {
  const presses = sanitizePresses(pressSecs, window);

  const spamReason = detectSpam(presses, window);
  if (spamReason !== null) {
    return {
      itemId,
      points: 0,
      maxPoints: HAZARD_MAX_POINTS_PER_ITEM,
      band: null,
      outcome: "spam",
      scoredAtSec: null,
      earlyPresses: presses.filter((t) => t < window.openSec).length,
      latePresses: presses.filter((t) => t > window.closeSec).length,
      spamReason,
    };
  }

  let earlyPresses = 0;
  let latePresses = 0;
  let scoredAtSec: number | null = null;
  let band: number | null = null;

  for (const t of presses) {
    if (t < window.openSec) {
      earlyPresses++;
      continue;
    }
    if (t > window.closeSec) {
      latePresses++;
      continue;
    }
    if (band === null) {
      const hit = bandFor(window, t);
      // null here only for a degenerate (zero-length) window, which the bank
      // loader rejects — keep the pair consistent rather than reporting a
      // scoring time that earned nothing.
      if (hit !== null) {
        band = hit;
        scoredAtSec = t;
      }
    }
  }

  return {
    itemId,
    points: band === null ? 0 : pointsForBand(band),
    maxPoints: HAZARD_MAX_POINTS_PER_ITEM,
    band,
    // "early" only when there was nothing else: pressing before the window AND
    // never inside it is a different mistake from silence, and the copy says so.
    outcome: band !== null ? "scored" : earlyPresses > 0 ? "early" : "missed",
    scoredAtSec,
    earlyPresses,
    latePresses,
    spamReason: null,
  };
}
