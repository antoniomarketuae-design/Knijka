/**
 * Exam module types + official format constants.
 * Format authority: docs/education/32_EXAMINATION_SYSTEM.md (Наредба № 38).
 */

import type { Question } from "../../lib/content/types";

// ---------------------------------------------------------------------------
// Official Bulgarian category-B theory exam format (docs/education/32)
// ---------------------------------------------------------------------------

export const EXAM_QUESTION_COUNT = 45;
export const EXAM_MAX_POINTS = 97;
export const EXAM_PASS_POINTS = 87;
export const EXAM_DURATION_SEC = 2400; // 40 minutes
/** Network/auto-submit slack on top of the 40:00 limit. */
export const EXAM_GRACE_SEC = 30;

/**
 * How long after `startedAt` an opened attempt can still be RESUMED.
 *
 * Same number as the submit deadline, different decision — and the difference
 * is the whole point. Past this line the paper is over by the official clock,
 * so re-rendering it would show a runner with 00:00 on the timer, which
 * auto-submits on mount and hands the candidate a bare 0/97 „не издържан" for
 * an exam they never sat. That is the verdict-without-a-reason doc 64 THEO-4
 * forbids, produced by the product itself.
 *
 * Submission keeps its own, unchanged rule: a paper that arrives at 40:31 is
 * still GRADED (auto-failed, but graded — see submitExam). A student who was
 * really sitting there must never lose their answers to a clock; a student
 * whose phone dropped connection three days ago must never be graded on a
 * paper they never saw. This constant separates the two.
 */
export const EXAM_ATTEMPT_TTL_SEC = EXAM_DURATION_SEC + EXAM_GRACE_SEC;

// ---------------------------------------------------------------------------
// Safe exam payload (what the candidate is allowed to see)
// ---------------------------------------------------------------------------

/** Option as shown during the exam — deliberately NO `correct` flag.
 *  `media` (THEO-1 sign face) carries only a sign code — no answer leak. */
export interface ExamQuestionOption {
  id: string;
  textBg: string;
  media?: Question["options"][number]["media"];
}

/**
 * Safe view of a question for an in-progress exam. Strips `correct` flags,
 * `explanationBg` and `lawRefs` (all of which leak answers). Options arrive
 * pre-shuffled (seeded) by the builder.
 */
export interface ExamQuestion {
  id: string;
  type: Question["type"];
  points: Question["points"];
  textBg: string;
  media: Question["media"];
  options: ExamQuestionOption[];
}

/** Result of the exam builder. */
export interface BuiltExam {
  seed: number;
  /** Exam-ordered (seeded shuffle), 45 questions. */
  questions: ExamQuestion[];
  /** Sum of question weights — 97 whenever the bank allows it, never more. */
  totalPoints: number;
}

// ---------------------------------------------------------------------------
// Answers & grading
// ---------------------------------------------------------------------------

/** A candidate's answer to one question (empty optionIds = unanswered). */
export interface ExamAnswer {
  questionId: string;
  optionIds: string[];
}

export interface PerQuestionResult {
  questionId: string;
  correct: boolean;
  /** Points AWARDED: the question weight if correct, otherwise 0. */
  points: number;
  /** The question weight (1 | 2 | 3). */
  maxPoints: number;
  correctOptionIds: string[];
}

export interface GradeResult {
  score: number;
  maxScore: number;
  /** score >= 87 (official pass mark). */
  passed: boolean;
  perQuestion: PerQuestionResult[];
}

// ---------------------------------------------------------------------------
// Attempt lifecycle API shapes
// ---------------------------------------------------------------------------

export interface StartExamResult {
  attemptId: string;
  seed: number;
  questions: ExamQuestion[];
  durationSec: typeof EXAM_DURATION_SEC;
}

/**
 * An attempt that is still running, re-rendered from what was actually dealt.
 *
 * `seed` is the attempt row's stored builder seed, not a browser cookie, and
 * `questions` come from the stored question ids — so a resume works on any
 * device and survives a content deploy mid-attempt (audit H-7, M-9).
 */
export interface InProgressExam {
  attemptId: string;
  seed: number;
  /** Authoritative start time — the runner's clock is derived from it. */
  startedAt: Date;
  /** Exactly the questions dealt at start, in the dealt order. */
  questions: ExamQuestion[];
}

/**
 * Why an attempt route cannot show a running paper — the four answers, kept
 * apart because each one is a DIFFERENT sentence to the student.
 *
 * They used to be one `null`, so the route said „един от въпросите вече не е
 * част от банката" for all of them: true for exactly one case and a fabricated
 * excuse for the rest.
 */
export type ExamAttemptView =
  /** Resumable right now — render the runner with exactly these questions. */
  | { status: "in-progress"; exam: InProgressExam }
  /**
   * Past EXAM_ATTEMPT_TTL_SEC. The candidate is owed the truth („този опит
   * изтече"), never a grade.
   */
  | { status: "expired"; startedAt: Date; elapsedSec: number }
  /** A dealt question has left the bank — the one honest content excuse. */
  | { status: "unrestorable" }
  /** Unknown id, someone else's attempt, already graded, unreadable payload. */
  | { status: "unavailable" };

export interface SubmitExamResult extends GradeResult {
  attemptId: string;
  /**
   * true when the submission arrived past 40:00 + 30s grace (by client-reported
   * elapsed OR authoritative server clock). Late submissions are auto-failed
   * (`passed` forced false) but still graded and persisted — we never discard
   * what the candidate answered.
   */
  late: boolean;
}

// ---------------------------------------------------------------------------
// Review of a completed attempt (audit M-1 — server-side, any device)
// ---------------------------------------------------------------------------

export interface ExamReviewOption {
  id: string;
  textBg: string;
  /** Part of the official correct answer set. */
  correct: boolean;
  /** Selected by the candidate. */
  chosen: boolean;
}

/**
 * One question of a graded attempt, with everything needed to explain it:
 * the full option set with correct flags, the explanation and the citations.
 * Safe by construction — only reachable for an attempt that is already closed.
 */
export interface ExamReviewQuestion {
  questionId: string;
  textBg: string;
  type: Question["type"];
  /** The candidate selected at least one option. */
  answered: boolean;
  correct: boolean;
  /** Points awarded (question weight if correct, else 0). */
  pointsAwarded: number;
  /** Question weight (1 | 2 | 3), as graded. */
  maxPoints: number;
  options: ExamReviewOption[];
  explanationBg: string;
  lawRefs: { act: string; ref: string }[];
  /** Primary topic — null when the question has left the bank. */
  topicSlug: string | null;
  topicTitleBg: string | null;
}

/** How one topic went in this exam — the row a "practise this" link hangs off. */
export interface ExamTopicResult {
  topicId: string;
  slug: string;
  titleBg: string;
  /** Questions from this topic on the paper. */
  questions: number;
  correct: number;
  /** Points scored / available within this topic. */
  points: number;
  maxPoints: number;
}

/** A completed attempt, rebuilt from the attempt row on any device. */
export interface ExamReview {
  attemptId: string;
  startedAt: Date;
  finishedAt: Date;
  score: number;
  maxScore: number;
  passed: boolean;
  /** Wall-clock seconds between start and submit. */
  timeUsedSec: number;
  /** In the order the candidate sat them. */
  questions: ExamReviewQuestion[];
  /** Curriculum order; topics that appeared on this paper only. */
  byTopic: ExamTopicResult[];
}

export interface ExamHistoryEntry {
  attemptId: string;
  startedAt: Date;
  finishedAt: Date | null;
  /**
   * "expired" is DERIVED from startedAt, never stored: an unfinished attempt
   * older than EXAM_ATTEMPT_TTL_SEC can no longer be resumed, so listing it as
   * „Незавършен · Продължи →" invites the student into a screen that cannot
   * give them what the link promised.
   */
  status: "in-progress" | "expired" | "completed";
  score: number | null;
  maxScore: number;
  passed: boolean | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ExamErrorCode =
  | "BANK_TOO_SMALL" // fewer than 45 eligible questions
  | "BANK_OVERWEIGHT" // no 45-question combination fits within 97 points
  | "BANK_UNDERWEIGHT" // no 45-question combination reaches exactly 97 points
  | "ATTEMPT_NOT_FOUND" // unknown attempt id OR attempt owned by another user
  | "ALREADY_SUBMITTED"
  | "INVALID_ATTEMPT_STATE"; // stored attempt payload unreadable

export class ExamError extends Error {
  constructor(
    readonly code: ExamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExamError";
  }
}
