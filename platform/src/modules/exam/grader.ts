/**
 * Exam grading — pure functions only (no repo, no store, no clock).
 *
 * IT ALSO STAMPS THE FINGERPRINT (door 6, docs/education/92 §10.3). Grading is
 * the moment the exact bytes of a question are read to decide a verdict, so it
 * is the honest place to record WHICH bytes those were: `contentPin` on every
 * `PerQuestionResult`. It is still pure — `teachingPin` is a hash of the object
 * it was handed.
 *
 * Official rules (docs/education/32):
 * - each question awards its full weight (1/2/3) or nothing;
 * - "multi" (select-all-correct) questions score ONLY on an exact set match:
 *   any missing correct option or any extra wrong option => 0 points;
 * - "single" questions are the degenerate case of the same rule (the answer
 *   must be exactly the one correct option);
 * - unanswered questions score 0;
 * - pass at score >= 87.
 */

import type { Question } from "../../lib/content/types";
import { teachingPin } from "./pin";
import {
  EXAM_PASS_POINTS,
  type ExamAnswer,
  type GradeResult,
  type PerQuestionResult,
} from "./types";

/**
 * Grade a set of answers against the exam's questions (full content-side
 * `Question` objects — the caller resolves them; never the safe client view).
 * Answers for questions not in `questions` are ignored; questions with no
 * answer are graded incorrect.
 */
export function gradeExam(
  questions: readonly Question[],
  answers: readonly ExamAnswer[],
): GradeResult {
  const answerByQuestion = new Map<string, ExamAnswer>();
  for (const a of answers) {
    // last write wins if a client sends duplicates for the same question
    answerByQuestion.set(a.questionId, a);
  }

  let score = 0;
  let maxScore = 0;
  const perQuestion: PerQuestionResult[] = questions.map((q) => {
    const correctOptionIds = q.options.filter((o) => o.correct).map((o) => o.id);
    const given = answerByQuestion.get(q.id)?.optionIds ?? [];
    const correct = exactSetMatch(given, correctOptionIds);
    maxScore += q.points;
    if (correct) score += q.points;
    return {
      questionId: q.id,
      correct,
      points: correct ? q.points : 0,
      maxPoints: q.points,
      correctOptionIds,
      contentPin: teachingPin(q),
    };
  });

  return { score, maxScore, passed: score >= EXAM_PASS_POINTS, perQuestion };
}

/** Exact set equality, tolerant of duplicates and ordering in `given`. */
function exactSetMatch(given: readonly string[], expected: readonly string[]): boolean {
  const g = new Set(given);
  if (g.size !== expected.length) return false;
  return expected.every((id) => g.has(id));
}
