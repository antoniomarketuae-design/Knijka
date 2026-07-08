/**
 * Shared types for the founder/admin content-review tool (dev-only).
 *
 * This file is pure TypeScript (type-only imports) so it is safe to import
 * from client components — no `node:fs`, no zod, no side effects.
 */
import type { Question } from "@/lib/content/types";

export type ReviewAction = "approve" | "reject" | "edit";

/**
 * The editable subset of a question. The founder may fix these fields when
 * approving via "edit". Everything else (id, conceptIds, points, media) stays
 * fixed so referential integrity across the content graph can never break.
 */
export interface QuestionPatch {
  textBg?: string;
  type?: Question["type"];
  explanationBg?: string;
  options?: { id: string; textBg: string; correct: boolean }[];
  lawRefs?: { act: string; ref: string }[];
}

export type ReviewDecision =
  | { action: "approve" }
  | { action: "reject" }
  | { action: "edit"; patch: QuestionPatch };

/** One needs-review question, enriched for the review UI. */
export interface FlaggedQuestionDto {
  id: string;
  topicSlug: string;
  topicTitleBg: string;
  conceptIds: string[];
  type: Question["type"];
  points: Question["points"];
  textBg: string;
  options: { id: string; textBg: string; correct: boolean }[];
  /** Full stored explanation, including any leading [REVIEW: …] prefix. */
  explanationBg: string;
  /** Explanation with the [REVIEW: …] prefix stripped (student-facing text). */
  explanationClean: string;
  /** The auditor's note text (inside [REVIEW: …]), or null if there is none. */
  reviewNote: string | null;
  lawRefs: { act: string; ref: string }[];
}

export interface ReviewTopicSummary {
  slug: string;
  titleBg: string;
  needsReviewCount: number;
}

export interface FlaggedListResult {
  flagged: FlaggedQuestionDto[];
  topics: ReviewTopicSummary[];
  total: number;
}

/** Result of a pure question transition + validation. */
export type ApplyResult =
  | { ok: true; question: Question }
  | { ok: false; error: string };

export type DecisionErrorCode =
  | "not_found"
  | "not_needs_review"
  | "validation_failed"
  | "write_failed";

/** Result of persisting a single decision to disk. */
export type DecisionOutcome =
  | { ok: true; questionId: string; newStatus: Question["status"] }
  | { ok: false; code: DecisionErrorCode; error: string };

export type BulkApproveOutcome =
  | { ok: true; approved: number }
  | { ok: false; error: string };
