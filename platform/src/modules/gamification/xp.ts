/**
 * XP and level math — pure.
 *
 * XP exists to reward LEARNING EFFORT, not screen time (docs/platform/36):
 *  - correct practice answer:  10 × question weight (1|2|3) → 10/20/30 XP
 *  - wrong practice answer:    2 XP — effort still counts, but guessing is
 *    never competitive with knowing
 *  - completed mock exam:      50 XP + the exam score (0..97) as bonus
 *  - passing the exam:         +150 XP on top
 *  - sim lesson (A14):         see the SIM constants below
 *
 * Level = 1 + floor(xp / 400) — MUST stay consistent with the dashboard
 * (src/lib/dashboard/data.ts uses the same constant via getSummary).
 */

import type { GamificationEvent } from "./types";

export const XP_PER_LEVEL = 400;

export const XP_CORRECT_PER_POINT = 10;
export const XP_WRONG_ANSWER = 2;
export const XP_EXAM_COMPLETED = 50;
export const XP_EXAM_PASSED_BONUS = 150;

/*
 * Sim-lesson economy (A14) — calibrated against the existing rates above:
 * a lesson is a ~5–15 minute focused drive, i.e. real learning effort
 * comparable to a solid practice run (4–10 questions ≈ 40–150 XP) but well
 * short of a full 40-minute mock exam (pass ≈ 290 XP). Failing still pays
 * the base — the same "effort counts, guessing/grinding doesn't win" rule
 * as the 2-XP wrong answer, scaled to a whole drive.
 */
/** Finishing a lesson at all (≈ four correct 1-pt answers of effort). */
export const XP_SIM_COMPLETED = 40;
/** Passing verdict (official rule + objectives) — ≈ two hard questions. */
export const XP_SIM_PASSED_BONUS = 60;
/** One-time milestone: the FIRST ever pass of that lesson. */
export const XP_SIM_FIRST_PASS_BONUS = 50;
/**
 * Per CLEAN_DRIVING commendation (a sustained violation-free stretch),
 * capped so long free drives can't out-earn a passed mock exam.
 */
export const XP_SIM_CLEAN_DRIVE = 10;
export const XP_SIM_CLEAN_DRIVE_MAX = 3;

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
    case "sim_lesson":
      // `score` (penalty points) deliberately does NOT scale XP: quality is
      // already priced via `passed` (the official ≤9/≤6/no-опасна rule), and
      // clean driving is rewarded through the commendation bonus — penalty
      // points feed the learner model (learning module), not the wallet.
      return (
        XP_SIM_COMPLETED +
        (event.passed ? XP_SIM_PASSED_BONUS : 0) +
        (event.passed && event.firstPass === true ? XP_SIM_FIRST_PASS_BONUS : 0) +
        XP_SIM_CLEAN_DRIVE * clampCleanDrives(event.cleanDrives ?? 0)
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

/** Clean-drive commendations: non-negative, capped (see constant above). */
function clampCleanDrives(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(XP_SIM_CLEAN_DRIVE_MAX, Math.max(0, Math.floor(count)));
}
