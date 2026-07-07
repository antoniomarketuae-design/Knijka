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

// ---------------------------------------------------------------------------
// Safe exam payload (what the candidate is allowed to see)
// ---------------------------------------------------------------------------

/** Option as shown during the exam — deliberately NO `correct` flag. */
export interface ExamQuestionOption {
  id: string;
  textBg: string;
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

export interface ExamHistoryEntry {
  attemptId: string;
  startedAt: Date;
  finishedAt: Date | null;
  status: "in-progress" | "completed";
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
