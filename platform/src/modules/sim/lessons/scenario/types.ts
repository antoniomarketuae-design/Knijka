/**
 * lessons/scenario — ScenarioSpec v1 (doc 76 §2), the data backbone of the
 * Scenario Studio: 150 hand-authored TEMPLATES × parametric variants, each
 * COMPILING into the existing lesson machinery (compile.ts). A scenario is a
 * micro-lesson — the rule engine, teach-pause, escalation, wire grading and
 * XP feeds all work unchanged. NO ENGINE FORK.
 *
 * Boundary: this module lives INSIDE lessons/ because its only output is a
 * LessonSpec; it imports lesson types (../types, ../../contracts) and the
 * rules catalog (validation), never engine/world/runtime internals.
 */

import type { LessonAidsSpec, StagedEventSpec } from "../../contracts";
import type { RuleEngineConfig } from "../../rules";
import type { ObjectiveParams } from "../types";

// ---------------------------------------------------------------------------
// Vocabulary (doc 76 §2/§3)
// ---------------------------------------------------------------------------

/** Template family — the catalog's top-level filter chips (doc 76 §2). */
export type ScenarioFamily =
  | "parking"
  | "junction"
  | "signals"
  | "pedestrians"
  | "lanes"
  | "roundabout"
  | "merging"
  | "hazards"
  | "speed"
  | "following"
  | "conditions"
  | "cockpit"
  | "vru"
  | "rail"
  | "exam-drills";

export const SCENARIO_FAMILIES: readonly ScenarioFamily[] = [
  "parking",
  "junction",
  "signals",
  "pedestrians",
  "lanes",
  "roundabout",
  "merging",
  "hazards",
  "speed",
  "following",
  "conditions",
  "cockpit",
  "vru",
  "rail",
  "exam-drills",
];

/**
 * Map archetype ids — the ~12–15 parametric generators of doc 76 §3. A
 * ScenarioSpec names WHICH generator produced its district; the generated
 * file itself is committed like poligon-v1 (map.districtId).
 */
export type MapArchetype =
  | "parking-lot"
  | "straight-street"
  | "t-junction"
  | "x-junction"
  | "roundabout"
  | "merge-lane"
  | "rural-curve"
  | "zebra-block"
  | "narrow-street"
  | "hill-ramp"
  | "motorway-segment";

export const MAP_ARCHETYPES: readonly MapArchetype[] = [
  "parking-lot",
  "straight-street",
  "t-junction",
  "x-junction",
  "roundabout",
  "merge-lane",
  "rural-curve",
  "zebra-block",
  "narrow-street",
  "hill-ramp",
  "motorway-segment",
];

/** Difficulty rungs (doc 76 §7). Level = parameter delta, never a copy. */
export type ScenarioLevel = 1 | 2 | 3 | 4 | 5;

export const SCENARIO_LEVEL_NAMES_BG: Record<ScenarioLevel, string> = {
  1: "Воден опит",
  2: "Частична помощ",
  3: "Самостоятелно",
  4: "Изпитни условия",
  5: "Усложнени",
};

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Reference to a recorded kinematic trace (doc 76 §5 — the Shadow Car is a
 * RECORDED trace played back as a ghost, never re-simulated physics).
 * `pending: true` marks a trace the S1 recorder has not produced yet: the
 * spec VALIDATES and ships in the pipeline, but compile/UI stages that need
 * the actual file treat it as unavailable. Recording flips it to `false`
 * (or drops the field) in the same commit that adds the file.
 */
export interface TraceRef {
  /** Repo-relative path, e.g. "content/traces/sc-park-perp-rev/shadow.trace.json". */
  path: string;
  /** True until the recorder fills the file (S1). Absent/false = recorded. */
  pending?: boolean;
}

/** One numbered instruction step (doc 76 §2 item 5 — the step-by-step view). */
export interface StepText {
  /** 1-based step number; the list must be contiguous 1..n. */
  n: number;
  textBg: string;
}

/**
 * One demonstrated WRONG way (doc 76 §2 items 9/10). Safety rule (doc 76 §0):
 * mistakes are DEMONSTRATED (red ghost + ❌ chrome), never practiced — the
 * student is never scored on performing them.
 */
export interface MistakeDemo {
  traceRef: TraceRef;
  titleBg: string;
  whatWentWrongBg: string;
  /**
   * Rule-catalog ViolationCodes the demo trace MUST grade when replayed
   * through the rules engine (the §9 stage-5 auto-assert). Validated against
   * rules/catalog VIOLATIONS.
   */
  codeRefs: string[];
}

/** The what/when/why/rule/expectation card set (doc 76 §2). */
export interface ScenarioTeach {
  /** WHEN this skill applies in real driving. */
  whenBg: string;
  /** WHY it matters (the safety story). */
  whyBg: string;
  /** Legal basis, e.g. "ЗДвП чл. 40" — must cite ЗДвП/ППЗДвП/Наредба. */
  lawRef: string;
  /** What the examiner expects to SEE (Наредба-38 framing). */
  examinerBg: string;
}

/** Starting situation (doc 76 §2 item 3). */
export interface ScenarioStart {
  /** Spawn point id from the scenario's district JSON… */
  spawnPointId?: string;
  /** …or an explicit pose (exactly one of the two must be set). */
  position?: { x: number; y: number };
  headingDeg?: number;
  /**
   * Vehicle state at spawn. Default "ready" (engine running — a maneuver
   * drill starts at the skill, not at the ignition ritual); "cold" restores
   * the full A1 start (L4 exam-protocol levels typically override to cold).
   */
  vehicleStart?: "cold" | "ready";
}

/** One graded objective of the scenario (compiles to a LessonObjective). */
export interface ScenarioObjectiveSpec {
  id: string;
  titleBg: string;
  /** TYPED params — the same union the lesson evaluators execute. */
  params: ObjectiveParams;
}

/** Environment axis (doc 76 §2). Every weather now COMPILES (the doc 76 §0
 *  weather gaps are closed: fog via the AC-03 unlock, snow via the AC-08
 *  winter-grip unlock — dry/rain/fog/snow, each composable with night). */
export interface ConditionAxis {
  weather?: "dry" | "rain" | "fog" | "snow";
  night?: boolean;
}

/** Ambient-traffic sizing override (compiles to LessonSpec.traffic). */
export interface ScenarioTraffic {
  vehicleCount?: number;
  pedestrianCount?: number;
  anchorRadiusM?: number;
}

/**
 * One difficulty rung — a PARAMETER DELTA over the template (doc 76 §7).
 * Aids default from DEFAULT_LEVEL_AIDS (the §7 table); everything here is an
 * override/addition for this template's rung.
 */
export interface LevelSpec {
  level: ScenarioLevel;
  /**
   * Multiplier on maneuver tolerances (parkInBay centerTolM/headingTolDeg).
   * > 1 = more forgiving (L1/L2), 1 = evaluator defaults. Range (0, 3].
   */
  toleranceScale?: number;
  /** Aid overrides merged over the DEFAULT_LEVEL_AIDS ladder entry. */
  aids?: Partial<LessonAidsSpec>;
  /** Traffic override for this rung (L5 adds live traffic). */
  traffic?: ScenarioTraffic;
  /** Condition override for this rung (L5 rain/night variants). */
  conditions?: ConditionAxis;
  /** Vehicle-start override (L4 usually flips to "cold" — exam protocol). */
  vehicleStart?: "cold" | "ready";
  /** examMode override; absent = the ladder default (true only at L4). */
  examMode?: boolean;
  /** Staged encounters ADDED at this rung (L5 complications). */
  stagedAdd?: StagedEventSpec[];
}

// ---------------------------------------------------------------------------
// Rubric (doc 76 §6) — types live here; the pure scorer in rubric.ts
// ---------------------------------------------------------------------------

/**
 * RubricSpec v1 — the scenario quality layer BEYOND violations. Every
 * component reads measurement channels that already exist (A10 objective
 * details); observation completeness reads the trace recorder's glance
 * moments once S1 lands (until then it scores as "not measured").
 */
export interface RubricSpec {
  /** Placement accuracy: consumes the parkInBay ObjectiveDetail (alignment +
   *  centre/heading offsets) of this success objective. */
  placement?: { objectiveId: string };
  /** Maneuver economy: bay-entry attempts on the same detail channel.
   *  attemptsFor3Stars <= attemptsFor2Stars (fewer attempts = better). */
  economy?: {
    objectiveId: string;
    attemptsFor3Stars: number;
    attemptsFor2Stars: number;
  };
  /** Observation completeness: authored required-glance moments, matched
   *  against observed glance events (trace channel, S1). */
  observation?: { moments: Array<{ id: string; titleBg: string }> };
  /** Par time, seconds — INFORMATIONAL ONLY, never a hard fail (doc 76 §6);
   *  time pressure is an L5 condition, not a rubric penalty. */
  parTimeSec?: number;
}

/** One rubric breakdown row for the end screen (S1 renders it). */
export interface RubricBreakdownLine {
  id: "placement" | "economy" | "observation" | "parTime";
  labelBg: string;
  detailBg: string;
  /** 0..2 component points; null = informational / not measured. */
  points: 0 | 1 | 2 | null;
  /** False when the channel had no data (e.g. no glance trace yet). */
  measured: boolean;
}

export interface RubricScore {
  stars: 1 | 2 | 3;
  breakdownBg: RubricBreakdownLine[];
}

/** Glance-moment channel input (S1 trace recorder feeds this). */
export interface RubricObservationInput {
  /** Ids of rubric observation moments the student's glances covered. */
  observedMomentIds: readonly string[];
}

// ---------------------------------------------------------------------------
// The template
// ---------------------------------------------------------------------------

/** Doc 76 §2 — one hand-authored scenario TEMPLATE (variants derive from it). */
export interface ScenarioSpec {
  /** Naming standard (doc 76 §9): "sc-<family-slug>", e.g. "sc-park-perp-rev". */
  id: string;
  family: ScenarioFamily;
  /** Catalog filter chips („паркиране", „заден ход"). */
  tagsBg: string[];
  titleBg: string;
  /** The learning objective, one sentence. */
  objectiveBg: string;
  /** Doc-72 provenance (e.g. "PK-02") — REQUIRED, validated vs the registry. */
  archetypeIds: string[];
  /** 152-graph concept ids — REQUIRED (mastery/readiness feed). */
  conceptIds: string[];
  map: {
    archetype: MapArchetype;
    /** Generator recipe (bays, bayWidthM, …) — provenance, mirrored in the
     *  district file's meta.scenario.params. */
    params: Record<string, number | string>;
    /** Committed district file (content/world/<districtId>.json). */
    districtId: string;
  };
  start: ScenarioStart;
  /** Numbered instructions (step-by-step view), contiguous 1..n. */
  instructionsBg: StepText[];
  /** The graded contract — existing objective kinds only. */
  success: ScenarioObjectiveSpec[];
  rubric?: RubricSpec;
  /** The correct demonstration (recorded trace; §5 validation rule: must
   *  replay with ZERO violations — CI gate once recorded). */
  shadow: TraceRef;
  /** 0–4 demonstrated wrong ways. */
  mistakes: MistakeDemo[];
  teach: ScenarioTeach;
  /** Authored rungs; compileScenario refuses a level the template omits. */
  levels: LevelSpec[];
  /** Template-wide staged encounters (all levels). */
  staged?: StagedEventSpec[];
  /** Template-wide base conditions (levels may override). */
  conditions?: ConditionAxis;
  /**
   * Per-drill rule-engine config, propagated by compileScenario to the
   * LessonSpec so the LIVE student session grades this drill's taught fault.
   * Needed by drills for config-gated detectors (default-OFF so they never
   * touch the exam bank / free-drive): the recorder enables it for the shadow;
   * this makes the student's own attempt grade too.
   */
  ruleConfig?: Partial<RuleEngineConfig>;
  /**
   * ADR-006 stage 4a — OPT-IN live-physics overrides, propagated by
   * compileScenario to LessonSpec.physics (the ruleConfig pattern).
   * `wetGrip: true` runs the STUDENT's car at the wet grip factor (~1.4×
   * braking distance, reduced cornering grip); `snowGrip: true` at the snow
   * grip factor (packed snow ≈ 0.4 — ~2.5× braking distance; the SNOW
   * unlock, doc 72 AC-08); `crosswind: true` blows the westward lateral wind
   * + deterministic gust through the live car (CROSSWIND_BRIDGE_N ±
   * CROSSWIND_GUST_* — the AC-12 wind unlock). Deliberately NOT implied by
   * conditions.weather ("rain"/"snow" render without touching physics, and
   * NO weather tag implies wind): shipped weather lessons were tuned against
   * dry, calm physics — only a template that AUTHORS this field gets
   * reduced-grip or wind dynamics. Semantic booleans, not raw numbers, so
   * the factor constants (vehicle/tuning.ts) stay the single source of truth
   * the authored ghost envelopes are pinned against.
   */
  physics?: { wetGrip?: boolean; snowGrip?: boolean; crosswind?: boolean };
  /** Bulgaria is the product (doc 76 §0 — locale from day one, no country packs). */
  localeBg: "bg-BG";
}
