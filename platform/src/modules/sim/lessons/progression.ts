/**
 * Lesson unlock & best-result logic (pure).
 *
 * Rule (product decision, /simulator select screen): the curriculum is
 * linear — a lesson unlocks once the lesson with the PREVIOUS order has been
 * DRIVEN TO THE END. L0 „Свободно каране" (order 0) is always open, so there
 * is always something to drive.
 *
 * FR-06 (founder, 2026-07-29): „we should give users an option continue to
 * next question although you made mistake and come back to this later … we are
 * blocking them from advancing and sometimes they just want to go trough all
 * first." The gate used to read `prevPassed`, so a student who failed Урок N
 * could not open Урок N+1 at all — the wall he hit and reported twice
 * (FR-06, FR-23). It now reads „has a finished attempt": the curriculum keeps
 * its ORDER (nobody jumps to the parking exam before meeting a junction), and
 * losing to one lesson never confiscates the rest of the course.
 *
 * `passed` is untouched and still means passed — the select screen keeps
 * marking which lessons are actually done, the debrief still says a failed run
 * failed, and nothing here softens a verdict. An unlocked lesson is an open
 * door, not a grade.
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

/**
 * Explicit gate override, passed by callers that resolved it SERVER-SIDE
 * (admin role from the session — never from client input). `unlockAll` opens
 * every lesson; pass/attempt/best folding is unaffected.
 */
export interface ProgressionGateOptions {
  unlockAll?: boolean;
}

export function computeProgression(
  lessons: ReadonlyArray<LessonSpec>,
  attempts: ReadonlyArray<LessonAttemptRow>,
  opts?: ProgressionGateOptions,
): LessonProgressEntry[] {
  const unlockAll = opts?.unlockAll === true;
  const byLesson = new Map<string, { passed: boolean; attempts: number; best: number | null }>();
  for (const a of attempts) {
    const acc = byLesson.get(a.lessonId) ?? { passed: false, attempts: 0, best: null };
    acc.attempts += 1;
    acc.passed = acc.passed || a.passed;
    acc.best = acc.best === null ? a.score : Math.min(acc.best, a.score);
    byLesson.set(a.lessonId, acc);
  }

  const ordered = [...lessons].sort((a, b) => a.order - b.order);
  // FR-06: keyed on ATTEMPTED, not passed. Every row in `attempts` is a
  // finished session (store.ts writes one per completed drive, pass or fail),
  // so „tried it" is exactly `attempts > 0`.
  const triedByOrder = new Map<number, boolean>();
  for (const l of ordered) {
    triedByOrder.set(l.order, (byLesson.get(l.id)?.attempts ?? 0) > 0);
  }

  return ordered.map((lesson) => {
    const acc = byLesson.get(lesson.id);
    const isFirst = lesson.order === ordered[0].order;
    const prevTried = triedByOrder.get(lesson.order - 1) ?? false;
    return {
      lesson,
      unlocked: unlockAll || isFirst || prevTried,
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
  opts?: ProgressionGateOptions,
): boolean {
  if (opts?.unlockAll === true) return true;
  const prereq = exam.unlockAfterLessonId;
  if (prereq === undefined) return true;
  return attempts.some((a) => a.lessonId === prereq && a.passed);
}
