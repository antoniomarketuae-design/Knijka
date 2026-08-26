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
  LessonAidsSpec,
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
} from "./specs";

// A13 exam mode — official-limit termination fold (client + server shared)
export { EXAM_TERMINATION_TEXT_BG, examTerminationFor } from "./exam";

// B1b — THE EXAM BANK: 1000+ distinct, replayable exam variants. Pure and
// deterministic; ids are the recipes (EX-<shell>-<cond>-<NNNN>).
export {
  EXAM_BANK_SIZE,
  EXAM_MAX_TERMINAL_ENCOUNTERS,
  EXAM_MIN_TERMINAL_ENCOUNTERS,
  allExamVariantIds,
  drawExamVariantId,
  examShellAssignmentCount,
  examVariantById,
  examVariantDistinctnessKey,
  generateExamVariant,
  isExamVariantId,
  parseExamVariantId,
  type ParsedExamVariantId,
} from "./examBank";
export { EXAM_CONDITIONS, EXAM_SHELLS } from "./examBankData";

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

// Route finish gate (founder 2026-07-28 — the end of the route ends the drive)
// + the lawful-wait hold that suspends it (B15 — waiting at a give-way line is
// not idling).
export {
  createFinishGate,
  createYieldWait,
  routeFinishZone,
  stepFinishGate,
  stepYieldWait,
  yieldReasonAt,
  FINISH_BAY_RADIUS_M,
  FINISH_DWELL_S,
  FINISH_MIN_RADIUS_M,
  FINISH_REST_KMH,
  FINISH_REST_S,
  YIELD_ROUNDABOUT_APPROACH_M,
  YIELD_STOP_LINE_REACH_M,
  YIELD_WAIT_MAX_S,
  type YieldReason,
  type YieldWaitContext,
} from "./finish";

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

// „Съветник" — pure next-action prompts for the drill HUD (advisor.ts)
export {
  ADVISOR_STORAGE_KEY,
  advisorPromptForObjective,
  advisorPromptForPreDriveStep,
  advisorPromptForSession,
  createGlancePingsState,
  defaultAdvisorEnabled,
  GLANCE_PING_APPROACH_M,
  GLANCE_PING_MAX_LEVEL,
  GLANCE_PING_MIN_ARM_KMH,
  glancePingsEligible,
  observeGlancePingsTick,
  parseStoredAdvisorSetting,
  resetGlancePings,
  serializeAdvisorSetting,
  // O51 — the figure this objective already put on the glass. On the barrel
  // because the WORLD plaque (`components/sim/RouteGuidance.capLineBg`) is the
  // fourth surface that has to name the same cap, and it sits outside this
  // module: without an exported resolver it re-derived the number and printed
  // the raw gate (41 against the card's 36 on sc-follow-tailgater@L1).
  shownObjectiveCapKmh,
  type AdvisorPrompt,
  type GlancePingPhase,
  type GlancePingsState,
} from "./advisor";

// B15-VOICE — the instructor's voice for a lawful wait (requirement zero, doc
// 64 THEO-4): the minute the student waits correctly is the minute the product
// used to say nothing at all. Pure copy + a staged fold; the engine emits it
// on the `lesson` teach channel, and never on an exam session.
export {
  createYieldVoice,
  stepYieldVoice,
  yieldWaitAdvisorPrompt,
  YIELD_VOICE_DEPART_GRACE_S,
  YIELD_VOICE_EPISODE_GAP_S,
  YIELD_VOICE_MUTE_CODES,
  YIELD_VOICE_NAME_S,
  YIELD_VOICE_SETTLE_S,
  YIELD_VOICE_VERDICT_S,
  type YieldVoiceInput,
  type YieldVoiceStep,
} from "./advisor";

// Debrief (template v1 — AI tutor seam documented in debrief.ts)
export { buildDebrief, type DebriefContext, type DebriefOutput } from "./debrief";

// In-sim micro-quiz trigger (pure — the theory↔driving closed loop)
export {
  QUIZ_RENDERABLE_MEDIA_KINDS,
  QUIZ_TARGET_CONCEPT_IDS,
  QUIZ_TUNING,
  conceptForEvent,
  createQuizTriggerState,
  isQuizMediaRenderable,
  observeQuizTick,
  toMicroQuizMedia,
  type MicroQuizMedia,
  type MicroQuizOption,
  type MicroQuizQuestion,
  type MicroQuizSignMedia,
  type QuizFrequency,
  type QuizMediaBearer,
  type QuizTriggerResult,
  type QuizTriggerState,
  type QuizTuning,
  type TriggeredQuiz,
} from "./quiz-trigger";

// S0 Scenario Studio (doc 76) — ScenarioSpec v1 + compiler + rubric. A
// scenario compiles INTO a LessonSpec; nothing else in this barrel changes.
export {
  DEFAULT_LEVEL_AIDS,
  DOC72_ARCHETYPE_IDS,
  LOT_PERP_TARGET_BAY,
  MAP_ARCHETYPES,
  MISTAKE_EXPERIENCE_DEMO_OFFER_SEC,
  MISTAKE_EXPERIENCE_LEAD_IN_BG,
  MISTAKE_EXPERIENCE_SEEDS,
  SCENARIO_DEFAULT_TRAFFIC,
  SCENARIO_FAMILY_TRAFFIC_BASELINE,
  SCENARIO_FAMILY_TRAFFIC_CEILING,
  SCENARIO_FAMILY_TRAFFIC_FLOOR,
  SCENARIO_FAMILIES,
  SCENARIO_LESSON_ORDER,
  SCENARIO_LEVEL_NAMES_BG,
  SCENARIO_TEMPLATES,
  SCENARIO_UNLOCK_MIN_STARS,
  SC_PARK_PERP_REV,
  ScenarioCompileError,
  ScenarioSpecError,
  assertScenarioSpec,
  compileMistakeExperience,
  compileScenario,
  isDoc72ArchetypeId,
  isScenarioLessonId,
  isScenarioLevelUnlocked,
  mistakeExperienceLessonId,
  mistakeExperienceSeedForEvent,
  parkingObservationFromTrace,
  parseMistakeExperienceLessonId,
  parseScenarioLessonId,
  resolveScenarioNextStep,
  resolveScenarioNextSteps,
  scenarioById,
  scenarioEntryLevel,
  scenarioLessonById,
  scenarioLevelProgress,
  scoreRubric,
  serializeObjectiveParams,
  validateScenarioSpec,
  type ConditionAxis,
  type LevelSpec,
  type MapArchetype,
  type MistakeDemo,
  type MistakeExperienceClassId,
  type MistakeExperienceSeed,
  type MistakeExperienceSeedRef,
  type ParsedMistakeExperienceLessonId,
  type ProgressGateOptions,
  type RubricBreakdownLine,
  type RubricObservationInput,
  type RubricScore,
  type RubricSpec,
  type ParsedScenarioLessonId,
  type ScenarioAttemptRow,
  type ScenarioCompileOptions,
  type ScenarioFamily,
  type ScenarioLevel,
  type ScenarioLevelProgress,
  type ScenarioNextStep,
  type ScenarioNextStepInput,
  type ScenarioNextSteps,
  type ScenarioObjectiveSpec,
  type ScenarioSpec,
  type ScenarioStart,
  type ScenarioTeach,
  type ScenarioTraffic,
  type StepText,
  type TraceRef,
  type ValidateScenarioOptions,
} from "./scenario";

// S2-A parking wave templates (own line-block per wave — merge-safe)
export {
  LOT_45_TARGET_BAY,
  LOT_NARROW_TARGET_BAY,
  LOT_PAR_TARGET_BAY,
  PARKING_TEMPLATES,
  SC_PARK_45,
  SC_PARK_NARROW,
  SC_PARK_PARALLEL,
} from "./scenario";

// Progression / unlock logic (+ the A13 exam gate)
export {
  computeProgression,
  isExamUnlocked,
  type LessonAttemptRow,
  type LessonProgressEntry,
  type ProgressionGateOptions,
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
  serializeCoachedMistakes,
  serializeNearMisses,
  serializeRuleEvents,
  type FinishLessonWire,
  type GradedFinishWire,
  type WireCoachedMistake,
  type WireMicroQuiz,
  type WireNearMiss,
  type WireObjectiveOutcome,
  type WireRuleEvent,
} from "./wire";

// Shared types
export type {
  CoachedMistake,
  EventPosition,
  ExamTermination,
  ExamTerminationReason,
  FinishGateState,
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
  RedMetVia,
  RouteFinishZone,
  SessionNearMiss,
  SimLessonGamificationEvent,
  TeachMoment,
  YieldVoiceState,
  YieldWaitState,
} from "./types";
