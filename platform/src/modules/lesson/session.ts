/**
 * The server half of the mini-quiz: deal, then grade.
 *
 * DEAL is deterministic (quiz.ts), so the grader does not need a signed ticket
 * the way practice does (audit M-10): it re-derives the beat's questions from
 * the beat id and refuses anything that is not on that list. The list is the
 * same list for everybody, forever, so re-deriving is free and there is no
 * token to expire, replay or leak. What the M-10 ticket actually protects
 * against — a client asking for the key to a question it was never dealt — is
 * closed here by the membership check.
 *
 * GRADE goes through learning.submitAnswer with context "lesson". Same grader,
 * same mastery curve, same spaced-repetition schedule as practice. That is the
 * whole point: sitting through a lesson makes the student's next practice
 * session smarter, because the classroom is an input to the learner model
 * rather than a display surface next to it.
 *
 * THEO-4 is satisfied by REUSE, not by new copy. The verdict carries the
 * question's stored `explanationBg`, its `lawRefs`, the per-option
 * `whyWrongBg` where the bank has it, and the wired mistake board — which is
 * where a wrong answer sends the student instead of a re-explanation. For more
 * than half the bank there is a VISUAL answer available at the exact moment
 * they are wrong about it, and that is the product's differentiator firing at
 * its highest-value moment.
 */

import { getContentRepo } from "@/lib/content/repo";
import { resolveWhyPanel } from "@/modules/clips";
import { traceUrlForRepoPath } from "@/modules/clips/view";
import { submitAnswer } from "@/modules/learning";
import { scenarioById } from "@/modules/sim/lessons";
import { lessonById } from "./compose";
import { pickBeatQuiz, quizSeed, toClientQuestion, type QuizPick } from "./quiz";
import type { Beat, LessonQuizQuestion, LessonQuizVerdict, ResolvedBoard } from "./types";

function picksFor(lessonId: string, beat: Beat): QuizPick[] {
  const repo = getContentRepo();
  const byConcept = beat.conceptIds.map((conceptId) => ({
    conceptId,
    questions: repo.questionsByConcept(conceptId),
  }));
  return pickBeatQuiz(byConcept, beat.questionCount, quizSeed(lessonId, beat.id));
}

/** This beat's questions, client-safe (no `correct` flags). */
export function dealBeatQuiz(
  lessonId: string,
  beatId: string,
): LessonQuizQuestion[] {
  const lesson = lessonById(lessonId);
  const beat = lesson?.beats.find((b) => b.id === beatId);
  if (lesson === undefined || beat === undefined || beat.kind !== "quiz") return [];
  return picksFor(lesson.id, beat).map(toClientQuestion);
}

/**
 * How many questions this beat will ACTUALLY deal.
 *
 * The authored `questionCount` is a request; the deal can come up short when a
 * concept's bank is thin or unreviewed. The outline reports the real number,
 * because the player uses it to decide when a quiz beat is finished — and a
 * player counting to two while the beat has one question is a lesson that
 * hangs on a blank card.
 */
export function beatQuizCount(lessonId: string, beat: Beat): number {
  if (beat.kind !== "quiz" || beat.questionCount === 0) return 0;
  return picksFor(lessonId, beat).length;
}

/**
 * The wired board for a question — the visual answer. Resolved through the
 * same why-panel chain the practice page uses, so a wrong answer in the
 * classroom and a wrong answer in practice send the student to the same reel.
 */
function boardForQuestion(questionId: string): ResolvedBoard | null {
  const sim = resolveWhyPanel(questionId)?.sim;
  if (sim === undefined) return null;
  const spec = scenarioById(sim.templateId);
  if (spec === undefined) return null;
  const board: ResolvedBoard = {
    mode: "mistake",
    wrong: {
      tracePath: traceUrlForRepoPath(sim.mistake.tracePath),
      districtId: sim.mistake.districtId,
      titleBg: sim.mistake.titleBg,
      whatWentWrongBg: sim.mistake.whatWentWrongBg,
    },
    drill: { templateId: sim.templateId, level: sim.level, titleBg: sim.titleBg },
  };
  if (spec.shadow.pending !== true) {
    board.mode = "compare";
    board.right = {
      tracePath: traceUrlForRepoPath(spec.shadow.path),
      districtId: spec.map.districtId,
      titleBg: spec.titleBg,
    };
  }
  return board;
}

export async function gradeBeatAnswer(
  userId: string,
  lessonId: string,
  beatId: string,
  questionId: string,
  selectedOptionIds: string[],
  now: Date = new Date(),
): Promise<LessonQuizVerdict> {
  const lesson = lessonById(lessonId);
  const beat = lesson?.beats.find((b) => b.id === beatId);
  if (lesson === undefined || beat === undefined || beat.kind !== "quiz") {
    throw new Error("gradeBeatAnswer: unknown lesson beat");
  }
  // The membership check — this beat's own deal, re-derived. A submission for
  // a question this beat never dealt is refused BEFORE anything is read,
  // graded or written, so it can never touch mastery and can never answer with
  // the key (the M-10 rule, enforced by determinism instead of a token).
  const picks = picksFor(lesson.id, beat);
  const pick = picks.find((p) => p.question.id === questionId);
  if (pick === undefined) {
    throw new Error("gradeBeatAnswer: question is not dealt by this beat");
  }

  const result = await submitAnswer(
    userId,
    questionId,
    [...new Set(selectedOptionIds)],
    "lesson",
    now,
  );

  // Requirement-zero at its deepest (doc 64 THEO-4): on a wrong "multi" the
  // question-level explanation cannot tell the student WHICH option they
  // missed. Where the bank has authored per-option rationale, it travels.
  const optionWhyBg = pick.question.options
    .filter((o) => o.whyWrongBg !== undefined && o.whyWrongBg.length > 0)
    .map((o) => ({ optionId: o.id, whyBg: o.whyWrongBg as string }));

  return {
    questionId,
    correct: result.correct,
    correctOptionIds: result.correctOptionIds,
    explanationBg: result.explanationBg,
    lawRefs: result.lawRefs.map(({ act, ref }) => ({ act, ref })),
    optionWhyBg,
    // Send them to the board, not to a re-explanation.
    board: result.correct ? null : boardForQuestion(questionId),
    masteryBefore: result.masteryBefore,
    masteryAfter: result.masteryAfter,
  };
}
