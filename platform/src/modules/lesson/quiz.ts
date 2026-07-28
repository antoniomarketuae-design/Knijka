/**
 * The mini-quiz — „like in a real classroom, a teacher asking whether it
 * landed".
 *
 * The founder's version of this is the cheapest and most valuable part of the
 * whole classroom, because it needs NO new content and NO model:
 *
 *  - the questions are the real exam bank, scoped to the concepts the beat
 *    just taught, so they are exam-grade material and not invented checks;
 *  - grading is the real grader (learning.submitAnswer) on the server, so a
 *    lesson answer moves the SAME mastery/readiness needle practice does — the
 *    classroom is not a sideshow next to the learning engine, it is an input
 *    to it;
 *  - a wrong answer shows the question's stored explanation and the wired
 *    mistake replay. There is no bare „грешно" anywhere in the path (THEO-4).
 *
 * DETERMINISM IS A FEATURE, NOT A SHORTCUT. Same lesson, same beat ⇒ same two
 * questions, forever, for everybody. quiz-trigger.ts makes this argument for
 * the in-sim quiz and it applies with more force here: a student who retakes a
 * lesson to fix the one thing they got wrong must be able to meet that thing
 * again. That is why this does not call buildPracticeSession — the practice
 * engine deliberately picks against the learner model and the clock, which is
 * exactly right for practice and exactly wrong for a lesson you can replay.
 *
 * PURE. This file takes a question list and returns picks; the repo read lives
 * in resolve.ts. It unit-tests against a synthetic bank, like quiz-trigger.ts.
 */

import type { Question } from "@/lib/content/types";
import type { LessonQuizQuestion } from "./types";

/**
 * Only reviewed material is dealt in a lesson.
 *
 * Practice may show `needs-review` items (session.ts defaults
 * includeUnreviewed true) because practice is where the student is exploring.
 * A lesson is the teacher asserting that this is the material, and 84 of the
 * 1,089 questions are still unreviewed — doc 84 U6. Scoping it here closes
 * that uncertainty inside the module that created the exposure, rather than
 * hoping a caller remembers.
 */
export function isLessonEligible(question: Question): boolean {
  return question.status === "approved";
}

/**
 * A stable 32-bit hash of the beat's identity. Same inputs ⇒ same order, in
 * this process, in the next deploy, and on the founder's phone.
 */
export function quizSeed(lessonId: string, beatId: string): number {
  let hash = 2166136261;
  const key = `${lessonId}::${beatId}`;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Order a question's options for a lesson beat.
 *
 * The stored order puts the correct answer first far too often to be a fair
 * check (audit H-1a), so it is never used as-is. The rotation is keyed on the
 * SEED AND THE QUESTION ID, so two questions in one beat do not rotate in
 * lockstep, and it is a rotation rather than a shuffle so it is trivially
 * reversible when someone has to reproduce a support report.
 *
 * Grading is by option id (submit.ts) — nothing downstream may key off an
 * option's position.
 */
export function orderOptionsForBeat(
  question: Question,
  seed: number,
): Question["options"] {
  const n = question.options.length;
  if (n < 2) return question.options;
  let h = seed >>> 0;
  for (let i = 0; i < question.id.length; i++) {
    h ^= question.id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const shift = h % n;
  if (shift === 0) return question.options;
  return [...question.options.slice(shift), ...question.options.slice(0, shift)];
}

export interface QuizPick {
  question: Question;
  conceptId: string;
  options: Question["options"];
}

/**
 * Pick this beat's questions.
 *
 * `byConcept` is the beat's concepts in beat order, each mapped to that
 * concept's questions in bank order — the caller supplies it so this stays
 * pure. Selection walks the concepts round-robin (so a two-question quiz over
 * two concepts asks one of each rather than two of the first), skipping
 * unreviewed items and anything already picked.
 */
export function pickBeatQuiz(
  byConcept: ReadonlyArray<{ conceptId: string; questions: readonly Question[] }>,
  count: number,
  seed: number,
): QuizPick[] {
  const picked: QuizPick[] = [];
  const used = new Set<string>();
  const cursors = new Map<string, number>();

  let progressed = true;
  while (picked.length < count && progressed) {
    progressed = false;
    for (const bucket of byConcept) {
      if (picked.length >= count) break;
      let cursor = cursors.get(bucket.conceptId) ?? 0;
      while (cursor < bucket.questions.length) {
        const question = bucket.questions[cursor];
        cursor += 1;
        if (!isLessonEligible(question) || used.has(question.id)) continue;
        used.add(question.id);
        picked.push({
          question,
          conceptId: bucket.conceptId,
          options: orderOptionsForBeat(question, seed),
        });
        progressed = true;
        break;
      }
      cursors.set(bucket.conceptId, cursor);
    }
  }
  return picked;
}

/**
 * Strip a pick down to what the client may see. The `correct` flags NEVER
 * cross this boundary — grading happens server-side through
 * learning.submitAnswer, exactly like practice and the in-sim micro-quiz.
 */
export function toClientQuestion(pick: QuizPick): LessonQuizQuestion {
  return {
    questionId: pick.question.id,
    conceptId: pick.conceptId,
    type: pick.question.type,
    points: pick.question.points,
    textBg: pick.question.textBg,
    options: pick.options.map((o) => ({ id: o.id, textBg: o.textBg })),
  };
}
