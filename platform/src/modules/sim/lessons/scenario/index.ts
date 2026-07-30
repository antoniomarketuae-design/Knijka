/**
 * lessons/scenario — public surface of the Scenario Studio data backbone
 * (doc 76): ScenarioSpec v1 + validation, the level compiler into LessonSpec,
 * the rubric scorer, the doc-72 archetype registry and the authored
 * templates. Consumed via the lessons barrel (sim module boundary rule).
 */

// Spec vocabulary + types
export {
  MAP_ARCHETYPES,
  SCENARIO_FAMILIES,
  SCENARIO_LEVEL_NAMES_BG,
  type ConditionAxis,
  type LevelSpec,
  type MapArchetype,
  type MistakeDemo,
  type RubricBreakdownLine,
  type RubricObservationInput,
  type RubricScore,
  type RubricSpec,
  type ScenarioFamily,
  type ScenarioLevel,
  type ScenarioObjectiveSpec,
  type ScenarioSpec,
  type ScenarioStart,
  type ScenarioTeach,
  type ScenarioTraffic,
  type StepText,
  type TraceRef,
} from "./types";

// Validation (strict, actionable — the assembly-line gate)
export {
  ScenarioSpecError,
  assertScenarioSpec,
  validateScenarioSpec,
  type ValidateScenarioOptions,
} from "./validate";

// Doc-72 provenance registry
export { DOC72_ARCHETYPE_IDS, isDoc72ArchetypeId } from "./registry";

// Compiler: ScenarioSpec × level → LessonSpec (micro-lesson, no engine fork).
// DEFAULT_LEVEL_* are the doc 86 L13 level ladder; resolveScenarioRubric is the
// D7 seam — read a rung's rubric through it, never off `spec.rubric`.
export {
  DEFAULT_LEVEL_AIDS,
  DEFAULT_LEVEL_PAR_TIME_SCALE,
  DEFAULT_LEVEL_TOLERANCE,
  DEFAULT_LEVEL_TRAFFIC_SCALE,
  MISTAKE_EXPERIENCE_LEAD_IN_BG,
  SCENARIO_DEFAULT_TRAFFIC,
  SCENARIO_LESSON_ORDER,
  ScenarioCompileError,
  compileScenario,
  mistakeExperienceLessonId,
  resolveScenarioRubric,
  serializeObjectiveParams,
  type ScenarioCompileOptions,
} from "./compile";
export { SPEED_CAP_GRACE_KMH_PER_TOLERANCE } from "./params";

// THEO-3 — the mistake-experience mode („Направи грешката", doc 64):
// `~m<i>` id seam, entry-rung compile, the six founder-seeded classes.
export {
  MISTAKE_EXPERIENCE_DEMO_OFFER_SEC,
  MISTAKE_EXPERIENCE_SEEDS,
  compileMistakeExperience,
  mistakeExperienceSeedForEvent,
  parseMistakeExperienceLessonId,
  scenarioEntryLevel,
  type MistakeExperienceClassId,
  type MistakeExperienceSeed,
  type MistakeExperienceSeedRef,
  type ParsedMistakeExperienceLessonId,
} from "./mistakeExperience";

// Rubric scorer (pure; S1 wires the end screen)
export { scoreRubric } from "./rubric";

// S1 — id resolution (<templateId>@L<n> → compiled LessonSpec; the wire's
// third resolver), soft level progression (unlock by stars) and the
// attempt-trace observation mapper.
export {
  isScenarioLessonId,
  parseScenarioLessonId,
  scenarioLessonById,
  type ParsedScenarioLessonId,
} from "./resolve";
export {
  SCENARIO_UNLOCK_MIN_STARS,
  isScenarioLevelUnlocked,
  scenarioLevelProgress,
  type ProgressGateOptions,
  type ScenarioAttemptRow,
  type ScenarioLevelProgress,
} from "./progress";
export { parkingObservationFromTrace } from "./observation";

// „Следващ сценарий" — the next-target resolver behind the end-screen CTA
// (catalog order = SCENARIO_TEMPLATES order; the star gate mirrors doc 76 §8).
export {
  resolveScenarioNextStep,
  resolveScenarioNextSteps,
  type ScenarioNextStep,
  type ScenarioNextStepInput,
  type ScenarioNextSteps,
} from "./nextStep";

// Authored templates (P0: sc-park-perp-rev)
export {
  LOT_PERP_TARGET_BAY,
  SCENARIO_TEMPLATES,
  SC_PARK_PERP_REV,
  scenarioById,
} from "./templates";

// S2-A parking wave (sc-park-parallel / sc-park-45 / sc-park-narrow)
export {
  LOT_45_TARGET_BAY,
  LOT_NARROW_TARGET_BAY,
  LOT_PAR_TARGET_BAY,
  PARKING_TEMPLATES,
  SC_PARK_45,
  SC_PARK_NARROW,
  SC_PARK_PARALLEL,
} from "./templates-parking";
