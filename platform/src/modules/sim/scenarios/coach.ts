/**
 * The scenario coach — applies teach-first-then-grade over the rule engine's
 * violation stream, without touching the pure reducer.
 *
 * Safety floor: dangerous (опасна) or session-terminating mistakes ALWAYS grade
 * from the first encounter — we never "teach away" running a red light or a
 * collision. Everything else (основна/второстепенна) teaches on the first
 * encounter and grades on repeats (escalating, per policy.ts).
 *
 * Pure + deterministic: the caller owns the per-session encounter counts.
 */

import { scenarioForCode } from "./mapping";
import { resolveEncounter } from "./policy";
import type { EncounterMode } from "./policy";

type Severity = "opasna" | "osnovna" | "vtorostepenna";

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
}

/** Decide one violation and return the updated encounter counts. */
export function coachStep(
  encounters: Readonly<Record<string, number>>,
  v: CoachInput,
): { decision: CoachDecision; encounters: Record<string, number> } {
  const scenarioId = scenarioForCode(v.code);
  const key = scenarioId ?? v.code;
  // Safety floor: dangerous / terminating errors are never taught away.
  const override =
    v.severityClass === "opasna" || v.terminateSession ? "always-grade" : undefined;
  const prior = encounters[key] ?? 0;
  const outcome = resolveEncounter(key, prior, override);
  return {
    decision: {
      code: v.code,
      scenarioId,
      mode: outcome.mode,
      scored: outcome.mode === "grade",
      showLesson: outcome.showLesson,
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
