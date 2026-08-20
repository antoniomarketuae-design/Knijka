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
 *
 * ── SWEEP 161 · «+150 XP mobile vs +100 XP desktop» IS NOT FROM HERE ────────
 *
 * The sweep filed one BROKEN finding at this file (part F, minor):
 * `sc-pk-ban-stop` „Identical outcome, different reward: the same
 * 0 наказателни точки / ИЗДЪРЖАН result pays +150 XP on mobile and +100 XP on
 * desktop" — `.audit-frames/sweep161/sc-pk-ban-stop/{mobile,pc}-right/
 * 08-debrief.png`. Both frames are real and both numbers are correct; the
 * finding is REFUTED, and this file is not where it could have been fixed —
 * there is no XP concept in this module at all (the chip is awarded in
 * `app/(dashboard)/simulator/actions.ts` from `gamification/xp.ts`).
 *
 * THE ARITHMETIC IS SINGLE-VALUED, so no interpretation is needed. A
 * `sim_lesson` award is 40 completed + 60 passed + 50 first-ever-pass +
 * 10 × cleanDrives capped at 3. With ИЗДЪРЖАН on both frames, 150 is reachable
 * only as 40+60+50+0 and 100 only as 40+60+0+0 — the two differ in exactly one
 * term, the ONE-TIME first-pass milestone, and in nothing else. The frames'
 * own mtimes say which run spent it: mobile-right finished 13:12:04 and
 * pc-right 13:22:30 on 2026-08-17, same account, ten minutes apart. The
 * desktop leg was the SECOND pass of that lesson, so the milestone was already
 * banked. A platform did not pay differently; a repeat did.
 * `__tests__/progression-sweep161-xp.test.ts` holds the enumeration, including
 * the counter-proof that no `cleanDrives` value can manufacture 150 without
 * the milestone.
 *
 * ── …AND THE DEFECT THAT WAS HERE, WHICH THE FINDING DID NOT NAME ───────────
 *
 * The unlock gate used to read the predecessor by ARITHMETIC — `triedByOrder
 * .get(lesson.order - 1)` — which silently assumes every `order` in the list
 * handed in is a contiguous integer run. Nothing declared that precondition and
 * nothing checked it, and the failure mode is the worst available one: a lesson
 * whose `order - 1` is absent from the list gets `?? false` and is LOCKED
 * FOREVER, with no error anywhere. MEASURED at ec1f56f, feeding the function
 * every shipped spec with EVERY lesson already attempted (the most permissive
 * input that exists):
 *
 *     0    l0-free-drive ........ unlocked
 *     0.5  l0p-poligon-free ..... LOCKED   ← nothing can ever open it
 *     1    l1-preparation ....... unlocked
 *     1.5  l8-poligon ........... unlocked (only because 1.5 − 1 = 0.5 exists)
 *     2..7 the chain ............ unlocked
 *     100  lex-exam-1 ........... LOCKED
 *
 * Live behaviour was correct only because `/simulator/page.tsx` happens to pass
 * `LESSONS` alone, whose orders are 0..7 — the fractional полигон cards and the
 * exam card are composed separately through `isExamUnlocked`. So this was a
 * loaded gun, not a wound: renumber the chain, skip an integer, or hand the
 * function one out-of-chain card and the tail of the curriculum locks itself
 * against a student who has finished everything.
 *
 * The gate now reads the PREVIOUS ENTRY IN THE SORTED LIST, which is what the
 * rule at the top of this file says in words („the lesson with the PREVIOUS
 * order"). It is identical on the shipped chain — pinned in
 * `__tests__/progression.test.ts` — and total on every other input.
 * `unlockAfterLessonId` is still ignored here, per its contract note in
 * `contracts.ts`; out-of-curriculum cards gate through `isExamUnlocked` below
 * and must not be folded into the linear chain by the caller.
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
  const tried = (lessonId: string): boolean => (byLesson.get(lessonId)?.attempts ?? 0) > 0;

  return ordered.map((lesson, i) => {
    const acc = byLesson.get(lesson.id);
    // Kept order-keyed, not `i === 0`: if two lessons ever share the lowest
    // order they were BOTH open before this change and stay both open. A fix
    // for a lock-out must not itself lock anything out.
    const isFirst = lesson.order === ordered[0].order;
    // „the lesson with the PREVIOUS order" = the previous ENTRY, not
    // `order - 1`. See the header: the arithmetic form locked any lesson whose
    // predecessor's order was not exactly one less, forever and silently.
    const prev = ordered[i - 1];
    const prevTried = prev !== undefined && tried(prev.id);
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
