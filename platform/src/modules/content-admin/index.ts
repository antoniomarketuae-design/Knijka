/**
 * Public API of the `content-admin` module (docs/architecture/05) — the
 * dev-only founder tool that clears "needs-review" theory questions and writes
 * approvals/edits/rejections back to content/questions/*.json.
 *
 * Consumers (the /review page, the /api/review route handlers) import ONLY
 * from here. Client components must import types from `./types` with
 * `import type` — never a value from this index, which pulls in the
 * server-only filesystem layer.
 */

// Pure logic (safe on the server; also unit-tested in logic.test.ts).
export {
  REVIEW_PREFIX_RE,
  applyDecision,
  extractReviewNote,
  hasReviewPrefix,
  parseReviewRequest,
  serializeQuestionsFile,
  stripReviewPrefix,
  validateQuestion,
  validateQuestionsFile,
} from "./logic";

// Server-only filesystem orchestration.
export {
  applyReviewDecision,
  assertNotProduction,
  bulkApproveTopic,
  listFlaggedQuestions,
} from "./io";

export type {
  ApplyResult,
  BulkApproveOutcome,
  DecisionErrorCode,
  DecisionOutcome,
  FlaggedListResult,
  FlaggedQuestionDto,
  QuestionPatch,
  ReviewAction,
  ReviewDecision,
  ReviewTopicSummary,
} from "./types";
