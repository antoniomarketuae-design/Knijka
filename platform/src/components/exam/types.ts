/**
 * UI-level contracts for the mock-exam screens (/exams).
 *
 * Shared between the server actions (which build the enriched post-submit
 * review from the content repo) and the client components (runner, result
 * view). Deliberately NO runtime import from the exam module — client code
 * receives every value it needs as serialized props / action results, and
 * question data with `correct` flags only ever appears here AFTER submitExam
 * has closed the attempt.
 */

// ---------------------------------------------------------------------------
// Post-submit review (safe to show once the attempt is graded)
// ---------------------------------------------------------------------------

export interface ReviewOption {
  id: string;
  textBg: string;
  /** Part of the official correct answer set. */
  correct: boolean;
  /** Selected by the candidate. */
  chosen: boolean;
}

export interface ReviewLawRef {
  act: string;
  ref: string;
}

/**
 * Whether the text on this card is still the text that earned the verdict on
 * it (docs/education/92 §10.3 — door 6). Mirrors `@/modules/exam ReviewIntegrity`;
 * declared here rather than imported because this file is the CLIENT contract
 * and takes no runtime dependency on the exam module. Anything other than
 * `verified` arrives with `noticeBg` filled in, and — except for `unpinned` —
 * with the teaching half (option key, explanation, citations) already stripped
 * SERVER-SIDE. The card must not try to reconstruct it.
 */
export type ReviewIntegrity = "verified" | "unpinned" | "moved" | "withdrawn" | "gone";

export interface ReviewQuestion {
  questionId: string;
  textBg: string;
  type: "single" | "multi";
  /** The candidate selected at least one option. */
  answered: boolean;
  correct: boolean;
  /** Points awarded (question weight if correct, else 0). */
  pointsAwarded: number;
  /** Question weight (1 | 2 | 3). */
  maxPoints: number;
  options: ReviewOption[];
  explanationBg: string;
  lawRefs: ReviewLawRef[];
  integrity: ReviewIntegrity;
  /** Claim-free Bulgarian shown on the card; "" when `integrity` is verified. */
  noticeBg: string;
}

export interface ResultSummary {
  attemptId: string;
  score: number;
  maxScore: number;
  /** Official pass mark (87). */
  passPoints: number;
  passed: boolean;
  /** Submission arrived past 40:00 + grace — auto-failed but still graded. */
  late: boolean;
  /** Client-side elapsed seconds at the moment of submission. */
  timeUsedSec: number;
}

/** What the runner caches in localStorage right after a successful submit. */
export interface StoredReviewPayload {
  summary: ResultSummary;
  review: ReviewQuestion[];
}

// ---------------------------------------------------------------------------
// Submit action wire types
// ---------------------------------------------------------------------------

export interface SubmitExamInput {
  attemptId: string;
  /** One entry per exam question; empty optionIds = unanswered. */
  answers: { questionId: string; optionIds: string[] }[];
  clientElapsedSec: number;
}

export type SubmitFailureCode =
  | "ATTEMPT_NOT_FOUND"
  | "ALREADY_SUBMITTED"
  | "INVALID_ATTEMPT_STATE"
  | "INVALID_INPUT"
  /** Per-user budget spent — a scripted client, not a candidate. The runner
   *  keeps the paper on screen and says to try again in a moment; nothing is
   *  submitted, so nothing is lost. */
  | "RATE_LIMITED";

export type SubmitExamActionResult =
  | { ok: true; summary: ResultSummary; review: ReviewQuestion[] }
  | { ok: false; code: SubmitFailureCode };

// ---------------------------------------------------------------------------
// Storage / cookie keys + tiny shared formatters
// ---------------------------------------------------------------------------

/** localStorage key for in-progress answers + flags (refresh safety). */
export function answersStorageKey(attemptId: string): string {
  return `knizhka.exam.answers.${attemptId}`;
}

/** localStorage key for the cached post-submit review (same-device revisit). */
export function reviewStorageKey(attemptId: string): string {
  return `knizhka.exam.review.${attemptId}`;
}

/**
 * httpOnly cookie carrying the attempt's builder seed — lets the runner page
 * rebuild the same safe question set after a refresh without touching the
 * exam module's internals. Never readable from client JS.
 */
export function seedCookieName(attemptId: string): string {
  return `knizhka_exam_seed_${attemptId}`;
}

/** 2400 -> "40:00" (minutes:seconds, minutes may exceed 59). */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
