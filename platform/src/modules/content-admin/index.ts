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

// The honest half: what a human signature is, and how to tell whether one
// exists. `"status": "approved"` answers neither question.
export {
  approvalStateOf,
  emptyLedger,
  indexLedger,
  isHumanApproved,
  ledgerPath,
  makeSignature,
  readLedger,
  serializeLedger,
  withSignature,
  writeLedgerAtomic,
} from "./approvals";
export { CONTENT_HASH_RE, canonicalQuestionContent, hashQuestionContent } from "./hash";
export {
  RISK_LABEL_BG,
  checkQuotedClaims,
  compareRisk,
  lawEvidenceFor,
  quotedSpans,
} from "./evidence";

// Server-only filesystem orchestration.
export {
  REVIEW_PAGE_SIZE,
  applyReviewDecision,
  assertNotProduction,
  listFlaggedQuestions,
} from "./io";
export type { ListFlaggedOptions } from "./io";

export type {
  ApplyResult,
  ApprovalEntry,
  ApprovalLedger,
  ApprovalState,
  BulkApproveOutcome,
  DecisionErrorCode,
  DecisionOutcome,
  FieldChange,
  FlaggedListResult,
  FlaggedQuestionDto,
  KeyChange,
  LawRefEvidence,
  QuestionDiff,
  QuestionPatch,
  QuotedClaim,
  ReviewAction,
  ReviewCensus,
  ReviewDecision,
  ReviewQueue,
  ReviewRisk,
  ReviewTopicSummary,
  ReviewVerdict,
  RiskTally,
} from "./types";
