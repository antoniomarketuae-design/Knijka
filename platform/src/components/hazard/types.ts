/**
 * UI-level contracts for hazard-perception training — the wire between the
 * server (route actions + @/modules/hazard-play) and the browser.
 *
 * Same discipline as components/exam/types.ts: NO runtime import from a
 * module, because these shapes cross the RSC boundary and must stay free of
 * anything server-only. And, more importantly here:
 *
 *   THE SPLIT BETWEEN THE TWO HALVES OF THIS FILE IS THE SECURITY MODEL.
 *
 * `HazardItemCard` is everything the browser is allowed to hold WHILE the
 * clip is playing. It deliberately has no scoring window, no fault timestamp
 * and no "what the hazard is" text — a student who can read the window out of
 * the RSC payload (or out of `__NEXT_DATA__`, or a devtools breakpoint) is not
 * taking a reaction test, and the whole safety claim rests on the measurement
 * being real. `HazardItemFeedback` carries all of that, and it only ever comes
 * back from the server AFTER the reaction has been submitted and judged.
 *
 * The client never computes or sends a score. It sends the media timestamps of
 * the presses it observed; the server decides what they were worth
 * (@/modules/hazard-play attempts.ts explains what it refuses).
 *
 * ADR-004 (users are minors): a press timestamp is a fact about a video, not
 * about a person. Nothing in this file describes the student.
 */

// ---------------------------------------------------------------------------
// Doors — placement is routing, never a fork of the logic
// ---------------------------------------------------------------------------

/**
 * Where a run was started from. The engine and the player behave identically
 * for all three; the door only changes who is allowed in, how long the run is
 * and where „назад" points. Adding a fourth surface must never mean adding a
 * fourth code path — see docs note in @/modules/hazard-play index.ts.
 */
export type HazardDoor =
  /** The standalone section, /hazard — paid, the full-length run. */
  | "section"
  /** Free warm-up inside the simulator section — short, ungated. */
  | "simulator"
  /** A lesson step inside theory — short, ungated, returns to the lesson. */
  | "theory";

export const HAZARD_DOORS = ["section", "simulator", "theory"] as const;

export function isHazardDoor(value: unknown): value is HazardDoor {
  return (HAZARD_DOORS as readonly unknown[]).includes(value);
}

// ---------------------------------------------------------------------------
// BEFORE the reaction — what the browser may hold
// ---------------------------------------------------------------------------

/**
 * One clip, as the student receives it. Everything here is either visible on
 * screen anyway (the video, its length) or needed to render the shell.
 *
 * `briefBg` is the one line the student reads before play starts — the same
 * thing an instructor says before pulling away („караш по бул. Симеоновско,
 * 50 км/ч, светофарът пред теб е зелен"). It sets the task; it must never
 * name the hazard.
 */
export interface HazardItemCard {
  itemId: string;
  /** Public video URL, e.g. "/clips/hz-<id>.webm". */
  clipSrc: string;
  /** Poster still, or null → the player paints its own dark plate. */
  posterSrc: string | null;
  /** Clip length in seconds. Also the clamp bound for a reported press. */
  durationSec: number;
  /** Short title, shown on the brief card only. Never names the hazard. */
  titleBg: string;
  /** The instructor's one-line set-up, read before play. */
  briefBg: string;
  /** 1-based position in the run — for the „3 / 8" readout. */
  index: number;
  /** Items in this run. */
  total: number;
}

// ---------------------------------------------------------------------------
// AFTER the reaction — the reveal
// ---------------------------------------------------------------------------

/**
 * Verdicts, ordered from best to worst. Distinct from a bare score because the
 * copy has to be honest in a different way for each: "твърде рано" is not a
 * near-miss of "отлично", it is a different mistake (a student who taps at
 * everything is not scanning, and the UK test voids exactly that pattern).
 */
export type HazardVerdict =
  /** Reacted in the first part of the window — saw it develop. */
  | "excellent"
  /** Inside the window, but late in it. */
  | "good"
  /** Inside the window's tail — would have been a hard brake in reality. */
  | "late"
  /** Pressed before anything was there to see. Zero, and it is said plainly. */
  | "early"
  /** Never pressed, or pressed after the fault was already unavoidable. */
  | "missed"
  /** Clicking pattern — the item is voided rather than scored. */
  | "void";

/** A citation, exactly as the exam review renders one. Retrieval, not recall. */
export interface HazardLawRef {
  act: string;
  ref: string;
}

/**
 * The full reveal for one item. Server-authored, post-submission only.
 *
 * Every string here is COPIED from the rule catalog / item bank by the engine,
 * never generated at request time (ADR-002: the AI must not free-recall
 * Bulgarian law — retrieval + citation only).
 */
export interface HazardItemFeedback {
  itemId: string;
  verdict: HazardVerdict;
  /** Awarded points, server-computed. */
  points: number;
  /** What this item was worth. Engine-provided, so the scale can evolve. */
  maxPoints: number;
  /** Media second of the press that scored, or null when nothing counted. */
  reactionAtSec: number | null;
  /** Window opens: the first frame the cue is visible to a scanning driver. */
  windowStartSec: number;
  /** Window closes: the last moment a reaction still changes the outcome. */
  windowEndSec: number;
  /**
   * The engine-computed fault timestamp — the moment the hazard materialises
   * and the situation stops being recoverable. This is the number the whole
   * feature is built on and it is already computed for every mistake trace.
   */
  hazardAtSec: number;
  /** What the hazard actually was. Stored copy. */
  hazardBg: string;
  /** Why it was DEVELOPING before it was obvious — the cue chain, in order. */
  developingBg: string;
  /** What a competent driver does about it. Stored copy. */
  correctiveBg: string;
  /** Zero or more citations. Empty is allowed; invented text is not. */
  lawRefs: HazardLawRef[];
}

// ---------------------------------------------------------------------------
// Run-level views
// ---------------------------------------------------------------------------

export interface HazardRunProgress {
  /** Items judged so far. */
  answered: number;
  total: number;
  /** Points banked so far — server-computed, echoed for the readout. */
  points: number;
  /** Points available across the items judged so far. */
  maxPoints: number;
}

/** One row of the end-of-run table. */
export interface HazardRunItemLine {
  itemId: string;
  titleBg: string;
  verdict: HazardVerdict;
  points: number;
  maxPoints: number;
  /**
   * Seconds of warning the student gave themselves: hazardAtSec − reaction.
   * Positive = reacted before the fault materialised. null = never reacted.
   * This, not the score, is the number that means something on a real road.
   */
  leadSec: number | null;
}

export interface HazardRunSummary {
  runId: string;
  door: HazardDoor;
  /**
   * ISO string, or null while the run is still open. A string rather than a
   * Date because this shape crosses the RSC boundary, and because the history
   * strip formats it in the student's own locale on the client — a server-side
   * `toLocaleDateString` would render in the SERVER's timezone and then
   * disagree with itself after hydration.
   */
  finishedAtIso: string | null;
  points: number;
  maxPoints: number;
  /** Items where nothing counted. */
  missed: number;
  /** Items voided for a clicking pattern. */
  voided: number;
  /** Median lead time over the items that scored, or null. */
  medianLeadSec: number | null;
  items: HazardRunItemLine[];
}

// ---------------------------------------------------------------------------
// Server-action results (the route adapts the module to these)
// ---------------------------------------------------------------------------

/**
 * Failure codes the UI must be able to say something honest about. They are a
 * closed set so the copy map in the client is exhaustive — a new code is a
 * type error at the call site, not a silent blank panel.
 */
export type HazardActionErrorCode =
  /** No active pack (the /hazard door only). */
  | "NO_ENTITLEMENT"
  /** The item engine is not wired / has nothing to deal yet. */
  | "NO_ITEMS"
  /** Unknown run, someone else's run, or a finished one. */
  | "RUN_NOT_FOUND"
  /** The submitted item is not the one currently being played. */
  | "OUT_OF_ORDER"
  /** Timestamps that could not have come from watching the clip. */
  | "IMPLAUSIBLE"
  /** Anything else — always shown as a retryable message, never a stack. */
  | "FAILED";

export interface HazardActionFailure {
  ok: false;
  code: HazardActionErrorCode;
  messageBg: string;
}

export type StartHazardRunResult =
  | {
      ok: true;
      runId: string;
      item: HazardItemCard;
      progress: HazardRunProgress;
    }
  | HazardActionFailure;

export type SubmitHazardReactionResult =
  | {
      ok: true;
      feedback: HazardItemFeedback;
      /** The next clip, or null when the run is over. */
      next: HazardItemCard | null;
      progress: HazardRunProgress;
      /** Present exactly when `next` is null. */
      summary: HazardRunSummary | null;
    }
  | HazardActionFailure;

/**
 * What the player sends up. Note what is NOT here: no score, no verdict, no
 * elapsed wall-clock, no device fingerprint.
 *
 * `pressesMediaSec` is the full press list rather than just the first press,
 * because "did this student tap at everything?" is a real verdict the engine
 * has to be able to reach, and it cannot reach it from one number.
 */
export interface HazardReactionInput {
  runId: string;
  itemId: string;
  /** Media timestamps (video.currentTime) of every press, in order. */
  pressesMediaSec: number[];
  /**
   * Media time the clip had reached when the player submitted — normally the
   * duration. Sent so the server can tell "watched it and never pressed" from
   * "closed the tab", without a wall clock the browser controls.
   */
  watchedToSec: number;
}
