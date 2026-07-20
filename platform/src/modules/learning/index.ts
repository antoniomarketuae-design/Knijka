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

export { recordSimObservations } from "./simFeed";
export type { SimObservation } from "./simFeed";
export type { SimSeverity } from "./store";

// THEO-2 Stage 1 (doc 64) — the why-panel resolver: question id → stored
// explanation + citations (+ the scenario drill demonstrating the fault).
export { resolveWhyPanel } from "./whyPanel";

// Why-panel VIDEO pilot: the derived clip list the /dev/clip-capture rig
// records (one clip per resolvable event's representative mistake). Pure
// static data — needs no content repo.
export { clipIdFor, clipPilotList } from "./clipPilot";
export type { ClipPilotEntry } from "./clipPilot";
export type {
  WhyPanelExperienceRef,
  WhyPanelMistakeRef,
  WhyPanelPayload,
  WhyPanelSimRef,
} from "./whyPanel";

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
