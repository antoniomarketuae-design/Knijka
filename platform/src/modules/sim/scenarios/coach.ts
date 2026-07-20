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

/**
 * A13 exam mode: teach-first is OFF for the whole session. EVERY violation —
 * every severity, mapped or not, first encounter or repeat — grades at
 * catalog points (mode "grade", ×1.0, no lesson card). The A12 warn-once
 * floor and the repeat-escalation ladder are TRAINING devices; an exam
 * scores exactly what the official protocol scores, nothing softer and
 * nothing harder. Encounter counts still accumulate (session bookkeeping).
 *
 * THEO-3 `learnOnly` — the exam mode's mirror image: the WHOLE session rides
 * the existing "learn-only" suppression channel (resolveEncounter's most
 * lenient policy — mode "learn", never scored, ×0). This is the
 * mistake-experience sandbox where the student performs the wrong action ON
 * PURPOSE: even the опасна/terminating safety floor is deliberately bypassed
 * — the dangerous act IS the assignment, and the consequence is presented by
 * the mode's overlay, never by the score. Mutually exclusive with examMode
 * by construction (the compiler never authors both); examMode wins if both
 * ever arrive (grading integrity outranks the sandbox).
 */
export interface CoachOptions {
  examMode?: boolean;
  learnOnly?: boolean;
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
  opts?: CoachOptions,
): { decision: CoachDecision; encounters: Record<string, number> } {
  const scenarioId = scenarioForCode(v.code);
  const key = scenarioId ?? v.code;
  const prior = encounters[key] ?? 0;
  const nextEncounters = { ...encounters, [key]: prior + 1 };

  // A13 exam mode — unconditional always-grade at official base points. Even
  // learn-only-mapped codes grade: if the rule engine emitted a violation, an
  // examiner would log it. No multiplier (repeat escalation is training-only)
  // and no mini-lesson mid-exam (the debrief teaches AFTER the verdict).
  if (opts?.examMode === true) {
    return {
      decision: {
        code: v.code,
        scenarioId,
        mode: "grade",
        scored: true,
        showLesson: false,
        penaltyMultiplier: 1,
      },
      encounters: nextEncounters,
    };
  }

  // Severity ladder (policy.ts): опасна/terminating always grade; второстепенна
  // warns once before grading regardless of mapping; основна follows the map.
  // THEO-3 learnOnly: the sandbox overrides the ladder with the existing
  // learn-only policy for every code — the same suppression channel
  // learn-only-mapped scenarios always used, applied session-wide.
  const mappedPolicy = scenarioId ? getScenarioEvent(scenarioId)?.policyDefault : undefined;
  const override =
    opts?.learnOnly === true
      ? "learn-only"
      : policyForViolation(v.severityClass, v.terminateSession === true, mappedPolicy);
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
    encounters: nextEncounters,
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
