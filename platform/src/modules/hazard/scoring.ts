/**
 * Hazard-perception scoring — PURE, and the part that must be provably fair.
 *
 * Nothing in this file reads content, touches a store, awaits anything or
 * knows a user exists. Everything it decides is a function of (window,
 * clicks), which is what makes it testable to the edge and what lets the
 * server be the only authority: the browser hands over timestamps, this
 * function hands back points.
 *
 * ---------------------------------------------------------------------------
 * HOW THE REAL TEST SCORES (researched, so we adopt a shape that is known to
 * work rather than one we invented)
 *
 * The UK DVSA hazard-perception test shows 14 clips containing 15 developing
 * hazards. Each hazard is worth "up to 5 points", scored by a sliding window:
 * the earlier inside the window you click, the more you score, down to 1, and
 * outside the window you score nothing. Clicking wrongly costs nothing — but
 * "you will not score anything if you click continuously or in a pattern",
 * which is the anti-cheat that stops a candidate from simply covering the clip.
 * The car pass mark is 44/75.
 *   gov.uk/theory-test/hazard-perception-test · gov.uk/theory-test/pass-mark-and-result
 *
 * WHAT WE KEEP: the 5→1 sliding band, "early is better but only inside the
 * window", zero for spam, and 44/75 as the reference standard.
 *
 * WHAT WE CHANGE, and why:
 *  - The window CLOSES AT THE CUT, and the cut lands before the hazard is
 *    unmissable. The DVSA lets its clips run on past the hazard; we must not,
 *    because a clip that runs on measures how fast you react to something
 *    blatant. Perception is the thing we are teaching.
 *  - Zero is never bare. Spam and a miss both score 0, but both still get the
 *    full „ето къде беше и защо" panel (feedback.ts). A bare verdict is the
 *    one thing this product is not allowed to ship (doc 64 THEO-4).
 *  - 44/75 is reported as a benchmark, not a pass mark. Hazard perception is
 *    not on the ДАИ exam; failing a student against a foreign standard on a
 *    skill their own exam ignores would make the whole surface feel like
 *    padding.
 * ---------------------------------------------------------------------------
 */

import { HAZARD_MAX_POINTS_PER_ITEM, type HazardItemScore, type HazardWindow } from "./types";

// ---------------------------------------------------------------------------
// Tunables — every one of them is a decision, so every one is named
// ---------------------------------------------------------------------------

/** Bands across the window: 5 → 4 → 3 → 2 → 1 points, earliest first. */
export const HAZARD_BANDS = HAZARD_MAX_POINTS_PER_ITEM;

/**
 * Two "clicks" closer together than this are one tap.
 *
 * A mouse, a trackpad and especially a touchscreen all double-fire; a human
 * finger cannot deliberately produce two presses 60 ms apart. Collapsing them
 * BEFORE the anti-cheat check matters: without it a student with a bouncy
 * trackpad gets zeroed for cheating, which is the worst possible false
 * positive on a surface whose whole job is to be trusted.
 */
export const HAZARD_CLICK_DEBOUNCE_SEC = 0.08;

/**
 * Flood rule: clicks allowed per second of playable clip, floored at a
 * minimum. Density rather than a flat count because a 20 s clip legitimately
 * invites more looking-and-second-guessing than an 8 s one.
 *
 * 0.6/s with a floor of 5 means: a 10 s clip tolerates 6 clicks, a 20 s clip
 * 12. Deliberately generous — a nervous first-timer clicking at four different
 * things is perceiving, badly, and should be taught, not accused.
 */
export const HAZARD_SPAM_CLICK_RATE = 0.6;
export const HAZARD_SPAM_MIN_CLICKS = 5;

/**
 * Metronome rule: this many consecutive clicks whose gaps are all equal to
 * within the tolerance = a pattern, not perception. Five clicks (four gaps) is
 * conservative on purpose; three evenly spaced clicks happen by accident.
 */
export const HAZARD_SPAM_RHYTHM_RUN = 5;
export const HAZARD_SPAM_RHYTHM_TOL_SEC = 0.25;

/** Why a clip was zeroed for gaming. Surfaced to the student, in Bulgarian. */
export type HazardSpamReason = "flood" | "rhythm";

// ---------------------------------------------------------------------------
// Window geometry
// ---------------------------------------------------------------------------

/**
 * The six edges of the five scoring bands, CLIP seconds:
 * [open, …, close]. Band i covers [edges[i], edges[i+1]) and pays 5 − i, with
 * the final band closed at both ends so a click exactly at the cut still
 * scores 1 rather than nothing.
 *
 * Exported because the review timeline draws them — after grading only.
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
 * Band index of a click, or null when it is outside the window.
 * Inclusive at both ends (see bandEdges).
 */
export function bandFor(window: HazardWindow, clickSec: number): number | null {
  if (clickSec < window.openSec || clickSec > window.closeSec) return null;
  const span = window.closeSec - window.openSec;
  if (span <= 0) return null; // degenerate window — the loader rejects these
  const raw = Math.floor(((clickSec - window.openSec) / span) * HAZARD_BANDS);
  return Math.min(HAZARD_BANDS - 1, Math.max(0, raw));
}

/** Points for a band: earliest band pays the maximum, last band pays 1. */
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
 * window; and a real client with a stray event should still have its honest
 * clicks graded.
 *
 * `slack` is how far past the cut a click may still arrive: the video element
 * fires its last timeupdate slightly after we stop it, and a finger already in
 * motion when playback ends is not a fault. Those clicks are kept so they can
 * be COUNTED as late (evidence) — they can never score, because bandFor()
 * refuses anything past closeSec.
 */
export const HAZARD_LATE_SLACK_SEC = 0.5;

export function sanitizeClicks(
  clickSecs: readonly number[],
  window: HazardWindow,
): number[] {
  const limit = window.closeSec + HAZARD_LATE_SLACK_SEC;
  const clean = clickSecs
    .filter((t) => typeof t === "number" && Number.isFinite(t) && t >= 0 && t <= limit)
    .sort((a, b) => a - b);

  const out: number[] = [];
  for (const t of clean) {
    const prev = out[out.length - 1];
    if (prev !== undefined && t - prev < HAZARD_CLICK_DEBOUNCE_SEC) continue;
    out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Anti-cheat
// ---------------------------------------------------------------------------

/**
 * Is this pattern of clicks an attempt to cover the clip rather than perceive
 * a hazard? Runs on the DEBOUNCED clicks (see HAZARD_CLICK_DEBOUNCE_SEC).
 *
 * Returns the rule that fired, or null. Both rules are deliberately biased
 * towards the student: a false accusation here costs more than a cheat that
 * gets 5 points on one clip, because the student cannot appeal and will simply
 * stop trusting the surface.
 */
export function detectSpam(
  clickSecs: readonly number[],
  window: HazardWindow,
): HazardSpamReason | null {
  // Flood: more clicks than the clip's own length can justify.
  const allowed = Math.max(
    HAZARD_SPAM_MIN_CLICKS,
    Math.ceil(window.closeSec * HAZARD_SPAM_CLICK_RATE),
  );
  if (clickSecs.length > allowed) return "flood";

  // Metronome: a run of equal gaps. Compare every gap in the run against the
  // run's FIRST gap — comparing neighbour-to-neighbour would let a slow drift
  // (0.4, 0.6, 0.8, 1.0) pass as "a pattern" when it is not one.
  if (clickSecs.length >= HAZARD_SPAM_RHYTHM_RUN) {
    const gaps: number[] = [];
    for (let i = 1; i < clickSecs.length; i++) gaps.push(clickSecs[i] - clickSecs[i - 1]);
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
 * Score one clip. The only place points are ever produced.
 *
 * Order of operations, and it matters:
 *   1. sanitise (drop impossible timestamps, sort, debounce)
 *   2. anti-cheat — a gamed clip is zero BEFORE any band is consulted, so
 *      spamming can never accidentally land on the 5-point band
 *   3. the EARLIEST in-window click decides the score. Earlier is strictly
 *      better, so "earliest" and "best" are the same click; taking the
 *      earliest is what makes an early wrong guess followed by a late correct
 *      one score the LATE one — you do not get credit for a click you made
 *      before the hazard existed.
 */
export function scoreHazardItem(
  itemId: string,
  window: HazardWindow,
  clickSecs: readonly number[],
): HazardItemScore {
  const clicks = sanitizeClicks(clickSecs, window);

  const spamReason = detectSpam(clicks, window);
  if (spamReason !== null) {
    return {
      itemId,
      points: 0,
      band: null,
      verdict: "spam",
      scoredAtSec: null,
      earlyClicks: clicks.filter((t) => t < window.openSec).length,
      lateClicks: clicks.filter((t) => t > window.closeSec).length,
      spamReason,
    };
  }

  let earlyClicks = 0;
  let lateClicks = 0;
  let scoredAtSec: number | null = null;
  let band: number | null = null;

  for (const t of clicks) {
    if (t < window.openSec) {
      earlyClicks++;
      continue;
    }
    if (t > window.closeSec) {
      lateClicks++;
      continue;
    }
    if (band === null) {
      const hit = bandFor(window, t);
      // null here only for a degenerate (zero-length) window, which the loader
      // rejects — keep the pair consistent rather than reporting a scoring
      // time that earned nothing.
      if (hit !== null) {
        band = hit;
        scoredAtSec = t;
      }
    }
  }

  return {
    itemId,
    points: band === null ? 0 : pointsForBand(band),
    band,
    verdict: band === null ? "missed" : "scored",
    scoredAtSec,
    earlyClicks,
    lateClicks,
    spamReason: null,
  };
}
