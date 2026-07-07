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
export type { AnswerContext, SubmitAnswerResult } from "./submit";

export { applyGradedAnswers } from "./examFeed";
export type { GradedAnswer } from "./examFeed";

export { getReadiness, getTopicOverview } from "./readiness";
export type { ConceptReadiness, Readiness, TopicOverview } from "./readiness";
