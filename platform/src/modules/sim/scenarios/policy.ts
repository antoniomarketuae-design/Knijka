/**
 * Teach-first-then-grade — the founder-approved learning discipline.
 *
 * The first time a driver meets a scenario we TEACH it (pause, contextual
 * mini-lesson with the law citation, no penalty). Every repeat we GRADE it,
 * and grade repeats harder than a first-timer. Safety-critical scenarios grade
 * from the very first encounter; illustrative ones never penalise.
 *
 * Pure + deterministic: the caller owns the per-driver encounter counts (a
 * `Record<eventId, number>` living in the session/reducer); this module just
 * decides teach-vs-grade and how hard, from that count.
 */

import { getScenarioEvent } from "./events";
import type { GradingPolicy } from "./types";

export type EncounterMode =
  /** Mini-lesson + law citation, no penalty (a first, teachable encounter). */
  | "teach"
  /** Scored against the rule engine (a repeat, or an always-grade event). */
  | "grade"
  /** Surfaced as a learning moment, never scored. */
  | "learn";

export interface ScenarioOutcome {
  eventId: string;
  policy: GradingPolicy;
  mode: EncounterMode;
  /** 0 for teach/learn; ≥1 for grade, escalating on repeats (capped). */
  penaltyMultiplier: number;
  /** Surface the contextual mini-lesson + citation this encounter. */
  showLesson: boolean;
}

/** Grade escalation: 1st graded = 1.0, then +0.5 per repeat, capped at 2.0. */
const BASE_PENALTY = 1;
const REPEAT_STEP = 0.5;
const PENALTY_CAP = 2;

// ---------------------------------------------------------------------------
// A12 — severity-level policy floor (warn once, then grade)
// ---------------------------------------------------------------------------

/** The severity classes a coached violation can carry (rules/types.ts). */
export type ViolationSeverity = "opasna" | "osnovna" | "vtorostepenna";

/**
 * Policy-level default for второстепенни (1-point) codes: warn once (teach),
 * then grade. A named policy, not an accident of the unknown-id fallback in
 * `resolveEncounter` — второстепенни are exactly the codes where a surprise
 * penalty on the first slip destroys trust fastest (A12 / research R1 §6).
 */
export const VTOROSTEPENNA_DEFAULT_POLICY: GradingPolicy = "teach-first-then-grade";

/**
 * Resolve the policy override for one coached violation (A12).
 *
 * The severity ladder, in priority order:
 *  - опасна / session-terminating → "always-grade" (safety floor: a red light
 *    or collision is never taught away);
 *  - второстепенна → ONE warning toast (teach) before grading begins,
 *    REGARDLESS of scenario mapping: unmapped codes get the explicit
 *    `VTOROSTEPENNA_DEFAULT_POLICY`, and even a mapping to an "always-grade"
 *    scenario cannot skip the warning for a 1-point slip. A "learn-only"
 *    mapping is MORE lenient than warn-once, so it is left in charge.
 *  - основна → no override; the scenario mapping (or the library default)
 *    decides, exactly as before.
 *
 * Returns the `policyOverride` to pass to `resolveEncounter`, or undefined to
 * let the scenario mapping decide.
 */
export function policyForViolation(
  severityClass: ViolationSeverity,
  terminating: boolean,
  mappedPolicy: GradingPolicy | undefined,
): GradingPolicy | undefined {
  if (severityClass === "opasna" || terminating) return "always-grade";
  if (severityClass !== "vtorostepenna") return undefined;
  if (mappedPolicy === "learn-only") return undefined;
  return VTOROSTEPENNA_DEFAULT_POLICY;
}

function gradeMultiplier(priorGradedCount: number): number {
  return Math.min(PENALTY_CAP, BASE_PENALTY + REPEAT_STEP * Math.max(0, priorGradedCount));
}

/**
 * Decide how THIS encounter of a scenario is handled.
 *
 * @param eventId          scenario event id
 * @param priorEncounters  how many times this driver has already met it (0 = never)
 * @param policyOverride   optional per-lesson override of the event's default
 */
export function resolveEncounter(
  eventId: string,
  priorEncounters: number,
  policyOverride?: GradingPolicy,
): ScenarioOutcome {
  const policy =
    policyOverride ?? getScenarioEvent(eventId)?.policyDefault ?? "teach-first-then-grade";
  const prior = Math.max(0, Math.floor(priorEncounters));

  if (policy === "learn-only") {
    return { eventId, policy, mode: "learn", penaltyMultiplier: 0, showLesson: true };
  }

  if (policy === "always-grade") {
    // Graded from the first encounter; still show the lesson the first time.
    return {
      eventId,
      policy,
      mode: "grade",
      penaltyMultiplier: gradeMultiplier(prior),
      showLesson: prior === 0,
    };
  }

  // teach-first-then-grade
  if (prior === 0) {
    return { eventId, policy, mode: "teach", penaltyMultiplier: 0, showLesson: true };
  }
  // prior >= 1 → graded; the first graded pass (prior === 1) is at BASE.
  return {
    eventId,
    policy,
    mode: "grade",
    penaltyMultiplier: gradeMultiplier(prior - 1),
    showLesson: false,
  };
}

/** Immutably record one more encounter of `eventId`. */
export function recordEncounter(
  counts: Readonly<Record<string, number>>,
  eventId: string,
): Record<string, number> {
  return { ...counts, [eventId]: (counts[eventId] ?? 0) + 1 };
}
