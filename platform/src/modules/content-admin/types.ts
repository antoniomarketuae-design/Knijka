/**
 * Shared types for the founder/admin content-review tool (dev-only).
 *
 * This file is pure TypeScript (type-only imports) so it is safe to import
 * from client components — no `node:fs`, no zod, no side effects.
 */
import type { Question } from "@/lib/content/types";

export type ReviewAction = "approve" | "reject" | "edit";

// ---------------------------------------------------------------------------
// The human-signature ledger (content/review/approvals.json)
//
// `"status": "approved"` on a row is a string a generator can type, and for
// 1,005 of 1,089 questions that is exactly what it was (docs/education/90 §1).
// A row is human-approved only when this ledger carries a signature over its
// content hash — see modules/content-admin/hash.ts.
// ---------------------------------------------------------------------------

export type ReviewVerdict = "approved" | "rejected";

/** One human decision, over one exact version of one question. */
export interface ApprovalEntry {
  questionId: string;
  verdict: ReviewVerdict;
  /** WHO. Taken from the authenticated session — never from client input. */
  by: string;
  /** ISO-8601 instant of the click. */
  at: string;
  /** `sha256:…` of the row as it stood when it was signed. */
  contentHash: string;
  noteBg: string | null;
}

export interface ApprovalLedger {
  version: 1;
  readmeBg: string;
  /**
   * How many rows still said `approved` with nobody's name on them when this
   * ledger was frozen. The validator refuses to let that number grow — every
   * review can only shrink it. This is the ratchet, and it is the whole reason
   * the count is stored in the file instead of being recomputed.
   */
  unsignedApprovedBaseline: number;
  baselineFrozenAt: string;
  entries: ApprovalEntry[];
}

/** How a question's authority stands right now. */
export type ApprovalState =
  | { kind: "human-approved"; entry: ApprovalEntry }
  /** Signed once, then the row changed — the signature no longer covers it. */
  | { kind: "signature-stale"; entry: ApprovalEntry }
  | { kind: "human-rejected"; entry: ApprovalEntry }
  /** Says `approved`; no human ever set it. Reachable today, and shouldn't be. */
  | { kind: "unsigned-claim" }
  | { kind: "unsigned" };

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

/**
 * One cited article, RETRIEVED from content/law (ADR-002: the review screen
 * quotes the statute, it never restates it). `textBg` is verbatim act text or
 * null — there is no third option, and a miss is shown as a miss.
 */
export interface LawRefEvidence {
  act: string;
  ref: string;
  /** SCHEMA.md hard rule 2: a trailing "?" means the author was unsure. */
  unverified: boolean;
  found: boolean;
  citationBg: string | null;
  contextBg: string | null;
  /** Verbatim statute text, truncated only for length (flagged when so). */
  textBg: string | null;
  truncated: boolean;
  /** Plain-Bulgarian reason the retrieval missed, when it did. */
  missReasonBg: string | null;
  sourceUrl: string | null;
  sourceVersionBg: string | null;
}

/**
 * A „…" span inside the explanation, checked against the retrieved text of the
 * articles this question cites. This is the ten-second check: does the sentence
 * we put in a student's head actually appear in the law we point them at?
 */
export interface QuotedClaim {
  quote: string;
  /** Unit ref whose retrieved text contains this span verbatim, or null. */
  foundInRef: string | null;
}

/** One field that differs from the diff baseline. */
export interface FieldChange {
  field: string;
  labelBg: string;
  before: string | null;
  after: string;
}

/**
 * How much a wrong decision on this row would cost a STUDENT — not how much
 * text moved. The queue is ordered by this, because 252 rows reviewed in
 * curriculum order buries the six that can mark a right answer wrong at
 * positions 150, 154, 161, 171, 226 and 231.
 */
export type ReviewRisk =
  /** The graded answer itself moved, or the row is brand new. */
  | "key-flip"
  /** A graded option's wording, the question type or its points changed. */
  | "answer-text"
  /** The question stem was re-asked. */
  | "stem"
  /** Only the teaching text moved. THEO-4 still applies; the grade does not. */
  | "explanation"
  /** Article numbers were tidied. Real work, no exam consequence. */
  | "citation"
  /** Already queued before this wave; nothing changed since the baseline. */
  | "untouched";

/** The correct-option id sets on either side of the baseline, e.g. "a,b,d" → "a,d". */
export interface KeyChange {
  before: string;
  after: string;
}

export interface QuestionDiff {
  /** Git ref the comparison is against (REVIEW_DIFF_BASE, default HEAD). */
  baseRef: string;
  kind: "changed" | "unchanged" | "new" | "unavailable";
  changes: FieldChange[];
  /** The row's status at the baseline — "approved" here is the whole story. */
  beforeStatus: string | null;
  /** Why no comparison was possible (not a git repo, file absent at base…). */
  unavailableReasonBg: string | null;
  /** Which band this row sorts into. */
  risk: ReviewRisk;
  /** Set only when the marked-correct set actually moved. */
  keyChange: KeyChange | null;
}

/** One question in the review queue, enriched with everything needed to clear it. */
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

  /** The row's own lifecycle flag, as stored. */
  status: Question["status"];
  /** Whether a human ever signed THIS text. */
  approval: ApprovalState;
  /** Retrieved statute text for every lawRef. */
  lawEvidence: LawRefEvidence[];
  /** Quoted spans in the explanation, checked against the retrieved text. */
  quotedClaims: QuotedClaim[];
  /** What changed since the baseline commit. */
  diff: QuestionDiff;
  /** The hash a signature would cover if it were approved as it stands. */
  contentHash: string;
}

/** Which backlog the reviewer is working through. */
export type ReviewQueue = "needs-review" | "unsigned";

export interface ReviewTopicSummary {
  slug: string;
  titleBg: string;
  needsReviewCount: number;
}

/**
 * The honest bank census — the numbers the launch decision is made on.
 * Deliberately separates "a machine said so" from "a person said so".
 */
export interface ReviewCensus {
  total: number;
  draft: number;
  machineChecked: number;
  needsReview: number;
  /** Rows flagged `approved`. Split into the two things that word can mean: */
  approved: number;
  /** …a human signed this exact text. The only student-reachable tier. */
  humanApproved: number;
  /** …nobody ever did. Reachable today; that is the defect. */
  unsignedApproved: number;
  /** Signed once, edited since — the signature no longer covers the row. */
  staleSignatures: number;
  unsignedApprovedBaseline: number;
}

/** How many rows of each risk band this queue holds, before paging. */
export type RiskTally = Record<ReviewRisk, number>;

export interface FlaggedListResult {
  queue: ReviewQueue;
  flagged: FlaggedQuestionDto[];
  topics: ReviewTopicSummary[];
  /** Rows in this queue, before paging. */
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  census: ReviewCensus;
  /**
   * The whole queue's risk profile — computed over every row, not just the page
   * on screen, so „6 сменени ключа" is a fact about the backlog and not about
   * the twenty rows that happen to be rendered.
   */
  risk: RiskTally;
}

/** Result of a pure question transition + validation. */
export type ApplyResult =
  | { ok: true; question: Question }
  | { ok: false; error: string };

export type DecisionErrorCode =
  | "not_found"
  /** Already carries a valid human signature over this exact text. */
  | "already_signed"
  | "validation_failed"
  | "write_failed";

/** Result of persisting a single decision to disk. */
export type DecisionOutcome =
  | {
      ok: true;
      questionId: string;
      newStatus: Question["status"];
      /** The signature that was written, when the decision minted one. */
      signature: ApprovalEntry | null;
    }
  | { ok: false; code: DecisionErrorCode; error: string };

export type BulkApproveOutcome =
  | { ok: true; approved: number }
  | { ok: false; error: string };
