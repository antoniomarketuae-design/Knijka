/**
 * tutor module — public API (docs/architecture/05).
 *
 * Route handlers / server actions / pages consume ONLY these exports.
 * ADR-002: the tutor never free-recalls law — every reply is grounded in
 * retrieved content-bank material and cites its lawRefs.
 *
 * Callers of askTutor must ensure the content repo is initialized
 * (import '@/lib/content/loader' server-side) before calling.
 */

export {
  askTutor,
  getThread,
  TUTOR_DAILY_MESSAGE_LIMIT,
  TUTOR_LIMIT_REPLY_BG,
  TUTOR_MAX_INPUT_LENGTH,
} from "./service";
export type {
  AskTutorResult,
  TutorCitation,
  TutorThreadView,
} from "./service";
export type { TutorMessage } from "./store";
export { isTutorEnabled } from "./model";

// Global daily spend ceiling on the Anthropic key (audit H-8). Exported so an
// ops/admin surface can show today's burn, and so the message the student sees
// when it trips is testable from outside the module.
export {
  checkDailyBudget,
  sofiaDayKey,
  tutorDailyBudgetMicroUsd,
  TUTOR_BUDGET_REPLY_BG,
  TUTOR_DAILY_BUDGET_USD_DEFAULT,
} from "./budget";
export type { TutorBudgetState } from "./budget";
