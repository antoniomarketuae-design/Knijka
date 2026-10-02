/**
 * WHICH QUESTIONS A STUDENT IS SERVED, AND IN WHAT WORDS — asked of the
 * PRODUCT, not typed here (test-only helper; round 5 of «KEEP-RIGHT FOLLOWS THE
 * LAW», founder ruling 2026-10-01).
 *
 * WHY. The round-4 verifier found (R4-3) that q-manevri-031 — `needs-review`,
 * and so filed by rounds 3–4 as «parked» — is in fact dealt to students:
 * `modules/learning/session.ts` deals `needs-review` rows in practice by
 * default (`includeUnreviewed`, default true), and the content loader strips
 * the leading `[REVIEW: …]` note. Its explanation told a student, on a town
 * two-lane stem, that «мястото ти по подразбиране е най-дясната свободна лента
 * (чл. 15, ал. 1)». The claim census classified sentences without reading
 * `status`, so nothing separated a parked sentence from a served one.
 *
 * WHAT THIS ANSWERS
 *   the TEXT    `questionsAsServed()` is the product's own repo — the loader's
 *               zod-validated, sanitised rows (`lib/content/sanitize.ts`): a
 *               staff `[REVIEW: …]` note is not in it, exactly as it is not on
 *               the student's screen;
 *   the DEAL    `practiceServedQuestionIds()` runs the product's own practice
 *               builder with ITS defaults over the whole bank and returns every
 *               question it deals. `includeUnreviewed` is NOT passed: the
 *               serving default is the thing being read. A change of that
 *               default, or of the status filter, moves this set — and the
 *               census pins «served / parked» per showing, so it is a red.
 *
 * WHAT «SERVED» MEANS HERE: reachable through default practice. The exam, the
 * in-drive micro-quiz, the lesson quiz and the tutor deal `approved` rows only
 * (exam/builder.ts, simulator/micro-quiz-actions.ts, lesson/quiz.ts,
 * tutor/retrieval.ts), and every approved row is dealt by practice too — so
 * practice is the widest door, and the one R4-3 came through.
 *
 * `ignorePrerequisites: true` only removes the ORDER in which a fresh account
 * meets concepts (mastery gating); it does not change which rows are eligible.
 * The learning store is an empty in-memory one, injected through the module's
 * own test seam (`setLearningStore`), and restored afterwards.
 */
import { contentRepo } from "@/lib/content/loader";
import type { Question } from "@/lib/content/types";
import { buildPracticeSession } from "@/modules/learning";
import { setLearningStore, type LearningStore } from "@/modules/learning/store";

/** Every question exactly as the loader serves it (sanitised, validated). */
export function questionsAsServed(): Question[] {
  return contentRepo.questions();
}

/** The ids default practice deals, over the whole bank. */
export async function practiceServedQuestionIds(): Promise<Set<string>> {
  const empty = {
    getProgress: async () => [],
    getCorrectlyAnsweredSince: async () => [],
  } as unknown as LearningStore;
  setLearningStore(empty);
  try {
    const dealt = await buildPracticeSession("keep-right-claim-census", {
      ignorePrerequisites: true,
      size: Number.MAX_SAFE_INTEGER,
      now: new Date("2026-10-02T00:00:00.000Z"),
    });
    return new Set(dealt.map((d) => d.question.id));
  } finally {
    setLearningStore(null);
  }
}
