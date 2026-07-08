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
