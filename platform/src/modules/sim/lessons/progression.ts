/**
 * Lesson unlock & best-result logic (pure).
 *
 * Rule (product decision, /simulator select screen): the curriculum is
 * linear — a lesson unlocks once the lesson with the PREVIOUS order has a
 * passed session. L0 „Свободно каране" (order 0) is always open, so there is
 * always something to drive.
 *
 * "Score" here is the official penalty-point total, so LOWER IS BETTER;
 * bestScore is the minimum across finished attempts.
 */

import type { LessonSpec } from "../contracts";

/** The slice of a persisted SimSession the progression logic needs. */
export interface LessonAttemptRow {
  lessonId: string;
  /** Lesson verdict stored in the events Json payload (store.ts parses it). */
  passed: boolean;
  /** Penalty points (SimSession.score). */
  score: number;
}

export interface LessonProgressEntry {
  lesson: LessonSpec;
  unlocked: boolean;
  passed: boolean;
  attempts: number;
  /** Fewest penalty points across attempts; null before the first attempt. */
  bestScore: number | null;
}

export function computeProgression(
  lessons: ReadonlyArray<LessonSpec>,
  attempts: ReadonlyArray<LessonAttemptRow>,
): LessonProgressEntry[] {
  const byLesson = new Map<string, { passed: boolean; attempts: number; best: number | null }>();
  for (const a of attempts) {
    const acc = byLesson.get(a.lessonId) ?? { passed: false, attempts: 0, best: null };
    acc.attempts += 1;
    acc.passed = acc.passed || a.passed;
    acc.best = acc.best === null ? a.score : Math.min(acc.best, a.score);
    byLesson.set(a.lessonId, acc);
  }

  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  const passedByOrder = new Map<number, boolean>();
  for (const l of ordered) {
    passedByOrder.set(l.order, byLesson.get(l.id)?.passed ?? false);
  }

  return ordered.map((lesson) => {
    const acc = byLesson.get(lesson.id);
    const isFirst = lesson.order === ordered[0].order;
    const prevPassed = passedByOrder.get(lesson.order - 1) ?? false;
    return {
      lesson,
      unlocked: isFirst || prevPassed,
      passed: acc?.passed ?? false,
      attempts: acc?.attempts ?? 0,
      bestScore: acc?.best ?? null,
    };
  });
}

/**
 * A13 — the exam entry's unlock gate. Out-of-curriculum specs (the exam card)
 * unlock once their `unlockAfterLessonId` prerequisite has a PASSED session;
 * a spec without the field is always open. Pure, mirrors computeProgression's
 * "previous passed" rule but keyed by an explicit lesson id instead of order
 * (documented choice on EXAM_LESSON: prerequisite = l2-intersections).
 */
export function isExamUnlocked(
  exam: Pick<LessonSpec, "unlockAfterLessonId">,
  attempts: ReadonlyArray<LessonAttemptRow>,
): boolean {
  const prereq = exam.unlockAfterLessonId;
  if (prereq === undefined) return true;
  return attempts.some((a) => a.lessonId === prereq && a.passed);
}
