/**
 * Per-concept mastery model — pure functions, no I/O.
 *
 * Mastery is a number in [0, 1] stored on Progress.mastery.
 *
 * Update rules (learning-engine v1):
 * - Correct answer:  mastery += (1 - mastery) * gain, where gain depends on the
 *   official point weight of the question (1 → 0.25, 2 → 0.35, 3 → 0.45).
 *   Asymptotic approach to 1: early answers move mastery a lot, later ones less.
 * - Wrong answer:    mastery *= 0.6 and lapses++ (lapses feed future analytics;
 *   the multiplicative penalty means high mastery survives one slip but repeated
 *   errors collapse it quickly).
 */

import type { Question } from "@/lib/content/types";

/** Mastery gain factor per official question point weight (docs/education/32). */
export const GAIN_BY_POINTS: Record<Question["points"], number> = {
  1: 0.25,
  2: 0.35,
  3: 0.45,
};

/** Multiplicative mastery decay applied on a wrong answer. */
export const WRONG_DECAY = 0.6;

export interface MasteryState {
  /** 0..1 */
  mastery: number;
  /** Count of wrong answers ever recorded for this concept. */
  lapses: number;
}

export const INITIAL_MASTERY: MasteryState = { mastery: 0, lapses: 0 };

export function applyCorrect(
  state: MasteryState,
  points: Question["points"],
): MasteryState {
  const gain = GAIN_BY_POINTS[points];
  return {
    mastery: clamp01(state.mastery + (1 - state.mastery) * gain),
    lapses: state.lapses,
  };
}

export function applyWrong(state: MasteryState): MasteryState {
  return {
    mastery: clamp01(state.mastery * WRONG_DECAY),
    lapses: state.lapses + 1,
  };
}

/** Convenience dispatcher used by submitAnswer. */
export function applyAnswer(
  state: MasteryState,
  correct: boolean,
  points: Question["points"],
): MasteryState {
  return correct ? applyCorrect(state, points) : applyWrong(state);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}
