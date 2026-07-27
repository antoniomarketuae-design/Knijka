/**
 * The run lifecycle — and the whole of the "unforgeable" claim.
 *
 * The exam already established the shape (modules/exam/index.ts): the server
 * deals, the server remembers what it dealt, the client sends back only what a
 * human could have produced, and the server grades. Hazard perception needs
 * that discipline MORE than the exam does, not less, because its output is a
 * safety measurement the product intends to publish — a score a browser can
 * type is not evidence of anything.
 *
 * So, concretely, four properties, each enforced below and each with a test:
 *
 *  1. THE WINDOW NEVER LEAVES THE SERVER BEFORE THE ANSWER. The card served to
 *     the browser (HazardItemCard) has no window field to leak; the window
 *     comes back only inside a judgement, after the press has been submitted.
 *     This layer never even holds it — the engine does the lookup itself.
 *  2. THE CLIENT NEVER SENDS A SCORE. It sends media timestamps. Points come
 *     from the engine and are clamped here before they are recorded.
 *  3. ONE SHOT PER ITEM, IN ORDER. Only the item under the cursor is judgeable,
 *     a judged item is frozen, and a run that has finished is closed. Replaying
 *     a submission after reading the reveal changes nothing.
 *  4. THE PRESS MUST BE PHYSICALLY POSSIBLE. Media time cannot run ahead of the
 *     wall clock since the clip was served. Note the asymmetry, because it is
 *     the point: a stutter or a cheap phone makes media time LAG wall time and
 *     is never penalised; only the tamper direction is refused.
 *
 * What is deliberately NOT enforced here: how good a reaction is. Windows,
 * verdict thresholds and the law-cited reveal belong to the item engine
 * (engine.ts). This file would be the wrong place to have an opinion about
 * driving, and a second opinion about it would be worse than none.
 */

import type {
  HazardDoor,
  HazardItemCard,
  HazardItemFeedback,
  HazardRunItemLine,
  HazardRunProgress,
  HazardRunSummary,
} from "@/components/hazard/types";
import { getHazardEngine } from "./engine";
import { getHazardRunStore } from "./store";
import {
  HazardPlayError,
  type HazardDealtItem,
  type HazardRunItemRecord,
  type HazardRunRecord,
} from "./types";

/**
 * Items per run, per door.
 *
 * The standalone section runs the full set because it is the one place the
 * student came FOR this; the two embedded doors run short because they
 * interrupt something else the student was doing, and an interruption that
 * outstays its welcome is how a differentiator turns into the thing everyone
 * skips. Founder-adjustable — this table is the only place lengths live, which
 * is what keeps „three doors" from meaning „three products".
 */
export const HAZARD_RUN_LENGTH: Record<HazardDoor, number> = {
  section: 10,
  simulator: 3,
  theory: 3,
};

/**
 * Presses kept from one item. Past this the list is a clicking pattern, not
 * data — the engine still gets enough to recognise it and void the item, and
 * the server refuses to hold an unbounded array a client can grow for free.
 */
export const MAX_PRESSES_PER_ITEM = 24;

/**
 * Slack allowed between media time and wall-clock time, in seconds.
 *
 * Covers clock skew between the two timestamps, the round trip of the submit,
 * and the fact that `servedAt` is stamped when the card is written rather than
 * when the first frame paints. It does NOT need to cover buffering: buffering
 * moves media time the other way.
 */
export const CLOCK_SLACK_SEC = 3;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StartRunOptions {
  /** Override the door's default length (support tools, embedded contexts). */
  length?: number;
  /** Determinism handle, forwarded to the engine. */
  seed?: number;
  /** Injectable clock — tests, and nothing else. */
  now?: Date;
}

export interface StartedRun {
  runId: string;
  item: HazardItemCard;
  progress: HazardRunProgress;
}

/**
 * Deal a run and serve its first clip.
 *
 * Throws HazardPlayError("NO_ITEMS") when the engine has nothing to deal —
 * a bank that is still being produced is a normal state on the way to launch,
 * and the caller renders it as "готви се", never as a broken page.
 */
export async function startHazardRun(
  userId: string,
  door: HazardDoor,
  opts: StartRunOptions = {},
): Promise<StartedRun> {
  const engine = getHazardEngine();
  const now = opts.now ?? new Date();
  const length = Math.max(1, Math.min(opts.length ?? HAZARD_RUN_LENGTH[door], 25));

  const dealt = await engine.deal({ userId, door, length, seed: opts.seed });
  if (dealt.length === 0) {
    throw new HazardPlayError("NO_ITEMS", `hazard-play: engine dealt 0 items for door ${door}`);
  }

  const store = getHazardRunStore();
  const run = await store.createRun({
    userId,
    door,
    engineVersion: engine.version,
    startedAt: now,
    items: dealt.map(toItemRecord),
  });

  // Serving is a WRITE: `servedAt` is what the plausibility check measures
  // against, so the clip is not considered handed over until the store says so.
  run.items[0].servedAt = now;
  await store.saveRun(run);

  return {
    runId: run.id,
    item: cardAt(run, 0),
    progress: progressOf(run),
  };
}

export interface SubmittedReaction {
  feedback: HazardItemFeedback;
  next: HazardItemCard | null;
  progress: HazardRunProgress;
  summary: HazardRunSummary | null;
}

export interface SubmitReactionInput {
  runId: string;
  itemId: string;
  pressesMediaSec: number[];
  watchedToSec: number;
  /** Injectable clock — tests, and nothing else. */
  now?: Date;
}

/**
 * Judge one reaction and advance the run.
 *
 * The next card comes off the run row, not off a fresh deal — see the
 * HazardRunItemRecord comment for why a re-deal is the exam's audit H-7 with
 * different nouns.
 */
export async function submitHazardReaction(
  userId: string,
  input: SubmitReactionInput,
): Promise<SubmittedReaction> {
  const store = getHazardRunStore();
  const now = input.now ?? new Date();

  const run = await store.getRun(input.runId);
  // Unknown run and someone else's run give the SAME answer: this endpoint
  // must not become a probe for other students' run ids (same rule as
  // getExamReview / withdrawOutcome).
  if (run === null || run.userId !== userId || run.finishedAt !== null) {
    throw new HazardPlayError("RUN_NOT_FOUND", `hazard-play: no open run ${input.runId}`);
  }

  const current = run.items[run.cursor];
  if (current === undefined || current.itemId !== input.itemId || current.result !== null) {
    throw new HazardPlayError(
      "OUT_OF_ORDER",
      `hazard-play: ${input.itemId} is not the item in play on run ${run.id}`,
    );
  }

  const presses = sanitizePresses(input.pressesMediaSec, current.durationSec);
  const watchedToSec = clamp(input.watchedToSec, 0, current.durationSec);

  // Property 4 — the press must be physically possible. `servedAt` is null only
  // for a record this layer never served, which is a bug, not a student.
  const servedAt = current.servedAt;
  if (servedAt === null) {
    throw new HazardPlayError("OUT_OF_ORDER", `hazard-play: item ${input.itemId} was never served`);
  }
  const elapsedSec = (now.getTime() - servedAt.getTime()) / 1000;
  const furthest = Math.max(watchedToSec, presses.length > 0 ? presses[presses.length - 1] : 0);
  if (furthest > elapsedSec + CLOCK_SLACK_SEC) {
    throw new HazardPlayError(
      "IMPLAUSIBLE",
      `hazard-play: media time ${furthest.toFixed(2)}s exceeds ${elapsedSec.toFixed(2)}s of wall clock`,
    );
  }

  const judgement = await getHazardEngine().judge({
    itemId: current.itemId,
    pressesMediaSec: presses,
    watchedToSec,
  });

  // Defensive clamp. The engine is ours, but the run row is the evidence the
  // safety claim is eventually argued from, and evidence does not get to
  // contain 10/5 because a threshold table had a typo.
  const maxPoints = Math.max(0, finiteOr(judgement.maxPoints, 0));
  const points = clamp(finiteOr(judgement.points, 0), 0, maxPoints);
  const feedback: HazardItemFeedback = {
    ...judgement,
    itemId: current.itemId,
    points,
    maxPoints,
  };

  current.result = {
    itemId: current.itemId,
    titleBg: current.titleBg,
    verdict: feedback.verdict,
    points,
    maxPoints,
    leadSec:
      feedback.reactionAtSec === null
        ? null
        : round2(feedback.hazardAtSec - feedback.reactionAtSec),
  };
  run.cursor += 1;

  const done = run.cursor >= run.items.length;
  if (done) {
    run.finishedAt = now;
  } else {
    // Serving the next clip is the same WRITE as serving the first one.
    run.items[run.cursor].servedAt = now;
  }
  await store.saveRun(run);

  return {
    feedback,
    next: done ? null : cardAt(run, run.cursor),
    progress: progressOf(run),
    summary: done ? summarize(run) : null,
  };
}

/** The summary of a finished run (re-openable after a reload). */
export async function getHazardRunSummary(
  userId: string,
  runId: string,
): Promise<HazardRunSummary | null> {
  const run = await getHazardRunStore().getRun(runId);
  if (run === null || run.userId !== userId || run.finishedAt === null) return null;
  return summarize(run);
}

/** Finished runs of one user, newest first — the section's history strip. */
export async function listHazardRuns(userId: string, limit = 10): Promise<HazardRunSummary[]> {
  const runs = await getHazardRunStore().listRuns(userId, limit);
  return runs.map(summarize);
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function toItemRecord(item: HazardDealtItem): HazardRunItemRecord {
  return {
    itemId: item.itemId,
    // The whole dealt card is stored, not just its title and length: `cardAt`
    // rebuilds the card for later requests from THIS record, because re-dealing
    // would hand the student a different item (see the note on cardAt below).
    card: item.card,
    titleBg: item.card.titleBg,
    durationSec: item.card.durationSec,
    servedAt: null,
    result: null,
  };
}

/**
 * The card for one item of a run, rebuilt from what the store already holds.
 *
 * This is the ONLY way a card reaches the browser after the initial deal, and
 * that is deliberate: `deal()` is the engine's only card-producing method, so
 * "give me item 4 again" could only be expressed as a second deal — which may
 * shuffle, may exclude items the student has now seen, and would hand back a
 * DIFFERENT clip than the one being graded. That is audit H-7 with different
 * nouns. The dealt card is client-safe by construction (see HazardItemCard), so
 * storing it costs nothing in exposure and buys exact replay.
 *
 * Only the 1-based position is re-derived, because it is presentation.
 */
function cardAt(run: HazardRunRecord, index: number): HazardItemCard {
  return { ...run.items[index].card, index: index + 1, total: run.items.length };
}

function progressOf(run: HazardRunRecord): HazardRunProgress {
  const judged = run.items.filter((i) => i.result !== null);
  return {
    answered: judged.length,
    total: run.items.length,
    points: judged.reduce((sum, i) => sum + (i.result?.points ?? 0), 0),
    maxPoints: judged.reduce((sum, i) => sum + (i.result?.maxPoints ?? 0), 0),
  };
}

function summarize(run: HazardRunRecord): HazardRunSummary {
  const lines: HazardRunItemLine[] = run.items
    .map((i) => i.result)
    .filter((r): r is HazardRunItemLine => r !== null);

  const leads = lines
    .map((l) => l.leadSec)
    .filter((l): l is number => l !== null)
    .sort((a, b) => a - b);

  return {
    runId: run.id,
    door: run.door,
    finishedAtIso: run.finishedAt === null ? null : run.finishedAt.toISOString(),
    points: lines.reduce((sum, l) => sum + l.points, 0),
    maxPoints: lines.reduce((sum, l) => sum + l.maxPoints, 0),
    missed: lines.filter((l) => l.verdict === "missed").length,
    voided: lines.filter((l) => l.verdict === "void").length,
    medianLeadSec: leads.length === 0 ? null : round2(median(leads)),
    items: lines,
  };
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Presses → a list the engine can trust: finite numbers only, clamped into the
 * clip, sorted, de-duplicated to millisecond resolution (a double-fire from a
 * touch device that also synthesises a click is not two reactions), capped.
 */
function sanitizePresses(raw: unknown, durationSec: number): number[] {
  if (!Array.isArray(raw)) return [];
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out.push(clamp(value, 0, durationSec));
  }
  out.sort((a, b) => a - b);
  const deduped = out.filter((v, i) => i === 0 || v - out[i - 1] > 0.001);
  return deduped.slice(0, MAX_PRESSES_PER_ITEM);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
