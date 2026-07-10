/**
 * The scenario coach — applies teach-first-then-grade over the rule engine's
 * violation stream, without touching the pure reducer.
 *
 * Safety floor: dangerous (опасна) or session-terminating mistakes ALWAYS grade
 * from the first encounter — we never "teach away" running a red light or a
 * collision. Everything else (основна/второстепенна) teaches on the first
 * encounter and grades on repeats (escalating, per policy.ts).
 *
 * A12 warn-once floor: второстепенна (1-point) codes get ONE warning toast
 * (teach) before grading begins REGARDLESS of scenario mapping — unmapped
 * codes via the explicit policy-level default, mapped codes even if their
 * scenario were ever marked "always-grade" (a 1-point slip is never a safety
 * floor). See `policyForViolation` in policy.ts. основна/опасна unchanged.
 *
 * Pure + deterministic: the caller owns the per-session encounter counts.
 */

import { getScenarioEvent } from "./events";
import { scenarioForCode } from "./mapping";
import { policyForViolation, resolveEncounter } from "./policy";
import type { EncounterMode, ViolationSeverity } from "./policy";

type Severity = ViolationSeverity;

export interface CoachInput {
  code: string;
  severityClass: Severity;
  terminateSession?: boolean;
}

export interface CoachDecision {
  code: string;
  /** Scenario event this maps to (null → keyed by its own code). */
  scenarioId: string | null;
  mode: EncounterMode;
  /** Whether it counts toward the session score (false for a taught moment). */
  scored: boolean;
  /** Whether to surface the contextual mini-lesson this encounter. */
  showLesson: boolean;
  /**
   * Repeat-penalty escalation (policy.ts): 0 for teach/learn; for grade mode
   * ×1.0 on the first graded pass, ×1.5 then ×2.0 (capped) on repeats. A9
   * applies it to the training-layer effective points (lessons/escalation.ts);
   * the official base points stay catalog-fixed.
   */
  penaltyMultiplier: number;
}

/** Decide one violation and return the updated encounter counts. */
export function coachStep(
  encounters: Readonly<Record<string, number>>,
  v: CoachInput,
): { decision: CoachDecision; encounters: Record<string, number> } {
  const scenarioId = scenarioForCode(v.code);
  const key = scenarioId ?? v.code;
  // Severity ladder (policy.ts): опасна/terminating always grade; второстепенна
  // warns once before grading regardless of mapping; основна follows the map.
  const mappedPolicy = scenarioId ? getScenarioEvent(scenarioId)?.policyDefault : undefined;
  const override = policyForViolation(v.severityClass, v.terminateSession === true, mappedPolicy);
  const prior = encounters[key] ?? 0;
  const outcome = resolveEncounter(key, prior, override);
  return {
    decision: {
      code: v.code,
      scenarioId,
      mode: outcome.mode,
      scored: outcome.mode === "grade",
      showLesson: outcome.showLesson,
      penaltyMultiplier: outcome.penaltyMultiplier,
    },
    encounters: { ...encounters, [key]: prior + 1 },
  };
}

/** Fold the coach over an ordered violation stream (fresh session). */
export function coachSession(violations: readonly CoachInput[]): CoachDecision[] {
  let encounters: Record<string, number> = {};
  const out: CoachDecision[] = [];
  for (const v of violations) {
    const r = coachStep(encounters, v);
    encounters = r.encounters;
    out.push(r.decision);
  }
  return out;
}
