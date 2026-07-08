/**
 * sim/scenarios — public API for the scenario-based learning event library.
 *
 * The deduplicated library of driving scenarios that the theory question bank
 * maps onto, plus the teach-first-then-grade policy engine. See
 * docs/simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md.
 */

export type {
  ScenarioEvent,
  ScenarioLibrary,
  ScenarioRoadmapPhase,
  GradingPolicy,
  ScenarioStatus,
  BuildComplexity,
  SafetyWeight,
} from "./types";

export {
  SCENARIO_EVENTS,
  SCENARIO_ROADMAP,
  SCENARIO_TOTALS,
  getScenarioEvent,
  scenarioEventsByStatus,
  liveScenarioEvents,
} from "./events";

export {
  resolveEncounter,
  recordEncounter,
  type EncounterMode,
  type ScenarioOutcome,
} from "./policy";
