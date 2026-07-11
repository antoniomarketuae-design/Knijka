/**
 * sim/lessons — public surface of the lesson subsystem.
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05); it re-exports this barrel as
 * `lessons`. The /simulator route and src/components/sim consume this
 * sub-barrel directly (same pattern as sim/engine and sim/hud).
 */

// Contract types lesson consumers need (owned by ../contracts.ts)
export type {
  HudEvent,
  LessonObjective,
  LessonSpec,
  NearMissEvent,
  NearMissStats,
  StagedEventOutcome,
  StagedEventSpec,
} from "../contracts";

// Multi-map seam helpers (doc 74 §5.1 — contracts own the district default)
export { DEFAULT_DISTRICT_ID, DEFAULT_LESSON_TRAFFIC, lessonDistrictId } from "../contracts";

// Lesson data (curriculum specs pinned to district-v1.json, полигон specs
// pinned to poligon-v1.json) + the A13 exam spec + per-district bay paint
export {
  EXAM_LESSON,
  LESSONS,
  POLIGON_LESSONS,
  lessonById,
  lessonParkingBaysFor,
  lessonsInOrder,
} from "./specs";

// A13 exam mode — official-limit termination fold (client + server shared)
export { EXAM_TERMINATION_TEXT_BG, examTerminationFor } from "./exam";

// Session engine (pure lifecycle reducer)
export {
  abortSession,
  applyNearMiss,
  applyPreDriveStep,
  applyStagedOutcome,
  applyTick,
  buildLessonResult,
  createLessonSession,
  finishSession,
  isDriveLocked,
  TEACH_PAUSE_MIN_GAP_S,
  type LessonEngineOptions,
  type LessonStepResult,
} from "./engine";

// Repeat-penalty escalation (A9 — pure, shared by client fold + server grading)
export {
  ESCALATION_MULTIPLIERS,
  applyEscalations,
  isEscalationMultiplier,
  type AppliedEscalations,
  type EscalatedMistake,
  type PenaltyEscalation,
} from "./escalation";

// Objective evaluators (exposed for tests/tooling; engine drives them)
export {
  createEvalState,
  parseObjectiveParams,
  stepObjective,
  PARK_CENTER_TOL_M,
  PARK_HEADING_TOL_DEG,
  PARK_MANEUVER_ZONE_M,
  REACTION_BAND_EXCELLENT_MAX_S,
  REACTION_BAND_GOOD_MAX_S,
  REACTION_BAND_LABELS_BG,
  type ObjectiveContext,
} from "./objectives";

// Debrief (template v1 — AI tutor seam documented in debrief.ts)
export { buildDebrief, type DebriefContext, type DebriefOutput } from "./debrief";

// In-sim micro-quiz trigger (pure — the theory↔driving closed loop)
export {
  QUIZ_TARGET_CONCEPT_IDS,
  QUIZ_TUNING,
  conceptForEvent,
  createQuizTriggerState,
  observeQuizTick,
  type MicroQuizOption,
  type MicroQuizQuestion,
  type QuizFrequency,
  type QuizTriggerResult,
  type QuizTriggerState,
  type QuizTuning,
  type TriggeredQuiz,
} from "./quiz-trigger";

// Progression / unlock logic (+ the A13 exam gate)
export {
  computeProgression,
  isExamUnlocked,
  type LessonAttemptRow,
  type LessonProgressEntry,
} from "./progression";

// NOTE: the Prisma-backed session store is intentionally NOT re-exported here.
// This barrel is imported by client components (LessonPlayShell, SceneSlot,
// LessonScene); re-exporting ./store would drag @/lib/db → pg → node:dns into
// the browser bundle. Server code imports the store directly from
// "@/modules/sim/lessons/store".

// Client ↔ server wire format for session finish
export {
  gradeFinishWire,
  parseFinishLessonWire,
  rebuildRuleEvents,
  reconcileObjectiveOutcomes,
  serializeNearMisses,
  serializeRuleEvents,
  type FinishLessonWire,
  type GradedFinishWire,
  type WireMicroQuiz,
  type WireNearMiss,
  type WireObjectiveOutcome,
  type WireRuleEvent,
} from "./wire";

// Shared types
export type {
  EventPosition,
  ExamTermination,
  ExamTerminationReason,
  LessonPhase,
  LessonResult,
  LessonSessionState,
  ObjectiveDetail,
  ObjectiveOutcome,
  ObjectiveParams,
  ObjectiveProgress,
  ObjectiveStatus,
  ParkAlignment,
  ReactionBand,
  SessionNearMiss,
  SimLessonGamificationEvent,
  TeachMoment,
} from "./types";
