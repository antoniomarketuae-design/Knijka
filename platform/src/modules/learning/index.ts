/**
 * learning module — public API.
 *
 * Modules and route handlers consume ONLY these exports (docs/architecture/05).
 * Callers must ensure the content repo is initialized (import
 * '@/lib/content/loader' server-side) before calling any of these.
 */

export { buildPracticeSession } from "./session";
export type {
  PracticeSessionOptions,
  SessionQuestion,
  SessionReason,
} from "./session";

export { submitAnswer } from "./submit";
export type {
  AnswerContext,
  SubmitAnswerOptions,
  SubmitAnswerResult,
} from "./submit";

// Practice-session binding (audit M-10): the practice page signs the questions
// it just dealt, and submitAnswer only answers for questions on that list.
export {
  issuePracticeTicket,
  isPracticeTicketRequired,
  PRACTICE_TICKET_TTL_MS,
  PracticeTicketError,
  verifyPracticeTicket,
} from "./practiceTicket";
export type { PracticeTicketCheck, PracticeTicketFailure } from "./practiceTicket";

// Per-session option shuffle (audit H-1a). buildPracticeSession applies it
// itself; these are exported for the OTHER surfaces that project a question
// into a client DTO from stored order — today the simulator's micro-quiz
// (app/(dashboard)/simulator/micro-quiz-actions.ts).
export {
  OPTION_ORDER_WINDOW_MS,
  optionOrderIsFixed,
  orderOptionsForPractice,
  practiceOptionSeed,
} from "./optionOrder";

export { applyGradedAnswers } from "./examFeed";
export type { GradedAnswer } from "./examFeed";

export { recordSimObservations } from "./simFeed";
export type { SimObservation } from "./simFeed";
export type { SimSeverity } from "./store";

// MOVED (audit M-20): the why-panel resolver, the clip pilot list and the
// generated clip plan now live in `@/modules/clips` — the module that owns the
// mistake-clip pipeline end to end. They were never learning's business: all
// three answer "which recorded SIMULATOR drive demonstrates this theory
// mistake?", and keeping them here is what made `learning` reach into
// sim/lessons, sim/traces, sim/rules, sim/scenarios and sim/world. Import them
// from `@/modules/clips` (server/build) or `@/modules/clips/view` (browser).
// Nothing is re-exported through here on purpose — a compatibility shim would
// leave the boundary violated while looking fixed.

export {
  getReadiness,
  getSectionOverview,
  getSimWeakSpots,
  getTopicOverview,
} from "./readiness";
export type {
  ConceptReadiness,
  Readiness,
  SectionOverview,
  SimWeakSpot,
  SimWeakSpotsResult,
  TopicOverview,
} from "./readiness";
