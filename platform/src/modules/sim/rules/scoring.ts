/**
 * Scoring accumulator mirroring the official practical-exam pass rule
 * (docs/education/32, Наредба № 38):
 *
 *   pass <=> total penalty points <= 9 AND points from основни <= 6
 *            AND no опасна mistake.
 *
 * One опасна is 10 points and already exceeds the 9-point cap, so the
 * `hasDangerous` flag is technically redundant for pass/fail — we keep it
 * explicit because the official rubric names it as an instant-fail condition
 * and the UI/debrief must surface it as such (the sim session still continues
 * for learning value).
 */

import type { ScorableEvent, ViolationEvent } from "./types";

export const PASS_MAX_TOTAL_POINTS = 9;
export const PASS_MAX_OSNOVNI_POINTS = 6;

export interface ScoreBreakdown {
  totalPoints: number;
  opasniPoints: number;
  osnovniPoints: number;
  vtorostepenniPoints: number;
  opasniCount: number;
  osnovniCount: number;
  vtorostepenniCount: number;
  /** At least one опасна mistake — official instant-fail condition. */
  hasDangerous: boolean;
}

export function emptyScore(): ScoreBreakdown {
  return {
    totalPoints: 0,
    opasniPoints: 0,
    osnovniPoints: 0,
    vtorostepenniPoints: 0,
    opasniCount: 0,
    osnovniCount: 0,
    vtorostepenniCount: 0,
    hasDangerous: false,
  };
}

/** Pure fold step — returns a new breakdown, never mutates. */
export function applyViolation(score: ScoreBreakdown, v: ViolationEvent): ScoreBreakdown {
  const next: ScoreBreakdown = { ...score, totalPoints: score.totalPoints + v.points };
  switch (v.severityClass) {
    case "opasna":
      next.opasniPoints += v.points;
      next.opasniCount += 1;
      next.hasDangerous = true;
      break;
    case "osnovna":
      next.osnovniPoints += v.points;
      next.osnovniCount += 1;
      break;
    case "vtorostepenna":
      next.vtorostepenniPoints += v.points;
      next.vtorostepenniCount += 1;
      break;
  }
  return next;
}

export function accumulateScore(events: ReadonlyArray<ScorableEvent>): ScoreBreakdown {
  let score = emptyScore();
  for (const e of events) {
    if (e.kind === "violation") score = applyViolation(score, e);
  }
  return score;
}

/** The official pass rule (doc 32). */
export function isPassing(score: ScoreBreakdown): boolean {
  return (
    !score.hasDangerous &&
    score.totalPoints <= PASS_MAX_TOTAL_POINTS &&
    score.osnovniPoints <= PASS_MAX_OSNOVNI_POINTS
  );
}
