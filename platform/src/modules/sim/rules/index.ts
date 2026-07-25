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
