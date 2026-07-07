/**
 * Session summary builder — turns the full event stream of a sim session
 * (rule-engine events + pre-drive procedure events) into the debrief payload:
 * score breakdown by official class, pass/fail per the official rule, the
 * mistake list with legal references, and the linked knowledge-graph concept
 * ids. The concept ids are how sim mistakes drive theory recommendations
 * (learning module reads them; sim itself never touches the DB —
 * docs/architecture/05).
 */

import {
  accumulateScore,
  isPassing,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
  type ScoreBreakdown,
} from "./scoring";
import type { CommendationEvent, ScorableEvent, ViolationEvent } from "./types";

export type FailReason =
  | "dangerous-mistake" // at least one опасна
  | "total-points-exceeded" // > 9 total
  | "osnovni-points-exceeded"; // > 6 from основни

export interface SessionSummary {
  score: ScoreBreakdown;
  /** Official pass rule: <= 9 total, <= 6 from основни, no опасна. */
  passed: boolean;
  failReasons: FailReason[];
  /** A collision occurred — official exams terminate; we grade it as such. */
  terminated: boolean;
  /** All violations, chronological. */
  mistakes: ViolationEvent[];
  /** All commendations, chronological. */
  commendations: CommendationEvent[];
  /**
   * Unique concept ids linked from the MISTAKES (not commendations), in order
   * of first occurrence — the input for theory recommendations.
   */
  conceptIds: string[];
}

export function buildSessionSummary(events: ReadonlyArray<ScorableEvent>): SessionSummary {
  const sorted = [...events].sort((a, b) => a.t - b.t);
  const mistakes = sorted.filter((e): e is ViolationEvent => e.kind === "violation");
  const commendations = sorted.filter((e): e is CommendationEvent => e.kind === "commendation");

  const score = accumulateScore(mistakes);
  const passed = isPassing(score);

  const failReasons: FailReason[] = [];
  if (score.hasDangerous) failReasons.push("dangerous-mistake");
  if (score.totalPoints > PASS_MAX_TOTAL_POINTS) failReasons.push("total-points-exceeded");
  if (score.osnovniPoints > PASS_MAX_OSNOVNI_POINTS) failReasons.push("osnovni-points-exceeded");

  const conceptIds: string[] = [];
  for (const m of mistakes) {
    if (m.conceptId !== undefined && !conceptIds.includes(m.conceptId)) {
      conceptIds.push(m.conceptId);
    }
  }

  return {
    score,
    passed,
    failReasons,
    terminated: mistakes.some((m) => m.terminateSession === true),
    mistakes,
    commendations,
    conceptIds,
  };
}
