/**
 * sim/rules — public surface of the rules subpackage.
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05). When the sim module barrel is
 * assembled it should re-export from here; other modules must never import
 * sim internals directly.
 */

export {
  DEFAULT_RULE_CONFIG,
  SEVERITY_POINTS,
  isScorableEvent,
  type CommendationCode,
  type CommendationEvent,
  type HeadlightState,
  type IndicatorState,
  type LaneArrow,
  type MirrorKind,
  type RuleEngineConfig,
  type RuleEvent,
  type ScorableEvent,
  type SeverityClass,
  type SimTick,
  type SimTickEvent,
  type TurnDirection,
  type Vec2,
  type ViolationCode,
  type ViolationEvent,
  type ViolationPoints,
} from "./types";

export {
  COMMENDATIONS,
  VIOLATIONS,
  makeCommendation,
  makeViolation,
  type CommendationSpec,
  type ViolationSpec,
} from "./catalog";

/**
 * The Наредба № 38 grounding: which clause of приложение № 5, т. 10 each code
 * is charged under, and — for the ten-point ones — what its detector actually
 * establishes before it convicts. Exported so the tutor/debrief surfaces can
 * cite the clause a student was charged under instead of only the number
 * (THEO-4: never a bare verdict).
 */
export {
  N38_ACT_ID,
  N38_BASIS,
  N38_CLAUSE_CLASS,
  N38_OPASNA_CASES,
  N38_OPASNA_HEADER,
  N38_OSNOVNA_DEF,
  N38_PASS_RULE,
  N38_REF,
  N38_UNIT_REF,
  N38_VTOROSTEPENNA_DEF,
  type ConflictEvidence,
  type N38Basis,
  type N38OpasnaCase,
} from "./n38";

export { createRuleEngine, reduceTick, type ReduceResult, type RuleEngineState } from "./engine";

export {
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  accumulateScore,
  applyViolation,
  emptyScore,
  isPassing,
  type ScoreBreakdown,
} from "./scoring";

export { buildSessionSummary, type FailReason, type SessionSummary } from "./summary";
