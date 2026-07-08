/**
 * sim/scenarios — the scenario-based learning event library.
 *
 * Every simulatable theory question maps to a reusable "scenario event": a
 * driving situation the engine can trigger, detect, and either teach or grade.
 * This is the deduplicated contract derived from analysing all 1,016 questions
 * (docs/simulation/65_SCENARIO_BASED_LEARNING_ENGINE.md) — ~45 events cover the
 * ~585 questions with a live-driving path, at a ~13:1 reuse ratio.
 *
 * The data lives in event-library.json (generated from the analysis, with the
 * examiner's legal corrections applied); these types give it shape.
 */

/** Grading discipline for a scenario, founder-approved: teach first, then grade. */
export type GradingPolicy =
  /** 1st encounter teaches (mini-lesson, no penalty); repeats grade, escalating. */
  | "teach-first-then-grade"
  /** Safety-critical — graded from the very first encounter (e.g. red light, wrong-way). */
  | "always-grade"
  /** Illustrative — always a learning moment, never penalised. */
  | "learn-only";

/** How far along the build is for this event in our actual engine. */
export type ScenarioStatus = "built" | "partial" | "new";

export type BuildComplexity = "low" | "med" | "high";
export type SafetyWeight = "critical" | "high" | "medium" | "low";

export interface ScenarioEvent {
  /** Stable id, e.g. "ev-junction-signalized". */
  id: string;
  /** Human family grouping (Junctions & priority, Speed & distance, …). */
  family: string;
  /** Short Bulgarian-facing name. */
  name: string;
  /** built = live now · partial = core exists · new = to build. */
  status: ScenarioStatus;
  /** What in the drive activates the scenario. */
  trigger: string;
  /** What the engine must measure to adjudicate it. */
  detection: string;
  /** Correct behaviour (grounds the pass criteria). */
  success: string;
  /** All the ways a driver fails it. */
  failure: string;
  /** Immediate Bulgarian coaching line shown after a mistake. */
  feedback: string;
  /** Default grading discipline (a lesson may override per-scenario). */
  policyDefault: GradingPolicy;
  /** World primitives the event needs (spawnable sign, NPC with priority, …). */
  worldPrimitives: string[];
  buildComplexity: BuildComplexity;
  /** How many theory questions this single event covers. */
  coverageQuestions: number;
  /** Which of the 16 topics it draws from. */
  coverageTopics: string[];
  safety: SafetyWeight;
  /** Total official exam points across the questions it covers. */
  examPointsCovered: number;
  /** Authoritative ЗДвП/ППЗДвП citation (examiner-verified). */
  lawRef: string | null;
  /** Correction note where the first-pass citation was wrong. */
  legalNote: string | null;
}

export interface ScenarioRoadmapPhase {
  phase: string;
  events: string[];
  rationale: string;
  effort: string;
}

export interface ScenarioLibrary {
  generatedFrom: string;
  totals: {
    simulatable: number;
    partial: number;
    notSimulatable: number;
    questionsCovered: number;
    eventCount: number;
  };
  roadmap: ScenarioRoadmapPhase[];
  events: ScenarioEvent[];
}
