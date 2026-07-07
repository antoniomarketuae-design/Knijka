/**
 * XP and level math — pure.
 *
 * XP exists to reward LEARNING EFFORT, not screen time (docs/platform/36):
 *  - correct practice answer:  10 × question weight (1|2|3) → 10/20/30 XP
 *  - wrong practice answer:    2 XP — effort still counts, but guessing is
 *    never competitive with knowing
 *  - completed mock exam:      50 XP + the exam score (0..97) as bonus
 *  - passing the exam:         +150 XP on top
 *
 * Level = 1 + floor(xp / 400) — MUST stay consistent with the dashboard
 * (src/components/dashboard/data.ts uses the same constant via getSummary).
 */

import type { GamificationEvent } from "./types";

export const XP_PER_LEVEL = 400;

export const XP_CORRECT_PER_POINT = 10;
export const XP_WRONG_ANSWER = 2;
export const XP_EXAM_COMPLETED = 50;
export const XP_EXAM_PASSED_BONUS = 150;

/** XP awarded for a single activity event (excludes daily-mission bonus). */
export function xpForEvent(event: GamificationEvent): number {
  switch (event.type) {
    case "practice_answer":
      return event.correct
        ? XP_CORRECT_PER_POINT * clampPoints(event.points)
        : XP_WRONG_ANSWER;
    case "exam_completed":
      return (
        XP_EXAM_COMPLETED +
        clampScore(event.score) +
        (event.passed ? XP_EXAM_PASSED_BONUS : 0)
      );
  }
}

export function levelForXp(xp: number): number {
  return 1 + Math.floor(Math.max(0, xp) / XP_PER_LEVEL);
}

/** Question weights are 1|2|3 by contract; clamp defensively. */
function clampPoints(points: number): number {
  if (!Number.isFinite(points)) return 1;
  return Math.min(3, Math.max(1, Math.round(points)));
}

/** Exam scores are 0..97 by contract; clamp defensively. */
function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(97, Math.max(0, Math.round(score)));
}
