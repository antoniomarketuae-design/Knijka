/**
 * exam module — public API (docs/architecture/05: modules talk only via index.ts).
 *
 * Mock exams in the official Bulgarian category-B theory format
 * (docs/education/32): 45 questions / 97 points / pass >= 87 / 40 minutes.
 *
 * Lifecycle: startExam() builds a seeded exam and opens an ExamAttempt;
 * submitExam() grades (exact-set rule for multi), enforces the 40:00 + 30s
 * grace limit (late => auto-fail, but what was answered is still graded and
 * persisted), and records per-question results; getExamHistory() lists a
 * user's attempts.
 *
 * MASTERY COUPLING NOTE: the learning module does not exist yet
 * (src/modules contains no learning/index.ts to import), so instead of
 * forwarding answers to a mastery pipeline, submitExam persists
 * QuestionAttempt rows with context "exam" directly (same table the learning
 * module will read). When learning lands, swap createQuestionAttempts() for
 * its public recordAnswer API.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question } from "../../lib/content/types";
import { buildExam } from "./builder";
import { gradeExam } from "./grader";
import { getExamStore, type ExamAttemptRecord } from "./store";
import {
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  ExamError,
  type ExamAnswer,
  type ExamHistoryEntry,
  type StartExamResult,
  type SubmitExamResult,
} from "./types";

// -- public re-exports -------------------------------------------------------

export { buildExam } from "./builder";
export { gradeExam } from "./grader";
export { setExamStore, InMemoryExamStore, type ExamStore } from "./store";
export {
  EXAM_QUESTION_COUNT,
  EXAM_MAX_POINTS,
  EXAM_PASS_POINTS,
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  ExamError,
} from "./types";
export type {
  BuiltExam,
  ExamQuestion,
  ExamQuestionOption,
  ExamAnswer,
  GradeResult,
  PerQuestionResult,
  StartExamResult,
  SubmitExamResult,
  ExamHistoryEntry,
} from "./types";

// -- attempt payload (ExamAttempt.answers JSON) ------------------------------

/** Shape stored in ExamAttempt.answers while the exam is running. */
interface InProgressPayload {
  state: "in-progress";
  seed: number;
  questionIds: string[];
}

function parseInProgress(v: unknown): InProgressPayload | null {
  if (typeof v !== "object" || v === null) return null;
  const p = v as Record<string, unknown>;
  if (p.state !== "in-progress") return null;
  if (typeof p.seed !== "number") return null;
  if (!Array.isArray(p.questionIds) || !p.questionIds.every((x) => typeof x === "string")) {
    return null;
  }
  return { state: "in-progress", seed: p.seed, questionIds: p.questionIds as string[] };
}

// -- API ----------------------------------------------------------------------

/**
 * Build a fresh mock exam for the user and open an ExamAttempt.
 * `opts.seed` makes the exam reproducible (tests, support); omit for random.
 */
export async function startExam(
  userId: string,
  opts?: { seed?: number },
): Promise<StartExamResult> {
  const exam = buildExam(opts?.seed);
  const payload: InProgressPayload = {
    state: "in-progress",
    seed: exam.seed,
    questionIds: exam.questions.map((q) => q.id),
  };
  const attempt = await getExamStore().createAttempt({
    userId,
    maxScore: exam.totalPoints,
    answers: payload,
  });
  return {
    attemptId: attempt.id,
    seed: exam.seed,
    questions: exam.questions,
    durationSec: EXAM_DURATION_SEC,
  };
}

/**
 * Grade and close an attempt.
 *
 * Time limit: submissions past 40:00 + 30s grace — by the client-reported
 * elapsed time OR the authoritative server clock (now - startedAt) — are
 * rejected as a pass: `late: true`, `passed` forced false. Fail-safe: the
 * submitted answers are STILL graded and persisted (score, per-question
 * results, QuestionAttempt rows), so the candidate's work is never lost.
 */
export async function submitExam(
  userId: string,
  attemptId: string,
  answers: ExamAnswer[],
  clientElapsedSec: number,
): Promise<SubmitExamResult> {
  const store = getExamStore();
  const attempt = await store.getAttempt(attemptId);
  if (!attempt || attempt.userId !== userId) {
    // same error for "missing" and "not yours": don't leak other users' ids
    throw new ExamError("ATTEMPT_NOT_FOUND", `No exam attempt ${attemptId} for this user`);
  }
  if (attempt.finishedAt !== null) {
    throw new ExamError("ALREADY_SUBMITTED", `Attempt ${attemptId} is already submitted`);
  }
  const pending = parseInProgress(attempt.answers);
  if (!pending) {
    throw new ExamError("INVALID_ATTEMPT_STATE", `Attempt ${attemptId} has no exam payload`);
  }

  const now = new Date();
  const serverElapsedSec = (now.getTime() - attempt.startedAt.getTime()) / 1000;
  const limit = EXAM_DURATION_SEC + EXAM_GRACE_SEC;
  const late = clientElapsedSec > limit || serverElapsedSec > limit;

  // Resolve the attempt's questions from content. If content shifted between
  // deploys and a question vanished, grade the remaining ones (defensive).
  const repo = getContentRepo();
  const questions = pending.questionIds
    .map((id) => repo.questionById(id))
    .filter((q): q is Question => q !== undefined);

  const cleanAnswers: ExamAnswer[] = answers.map((a) => ({
    questionId: a.questionId,
    optionIds: [...new Set(a.optionIds)],
  }));
  const grade = gradeExam(questions, cleanAnswers);
  const passed = grade.passed && !late; // late submissions auto-fail

  await store.finishAttempt(attemptId, {
    finishedAt: now,
    score: grade.score,
    passed,
    // schema contract: answers Json = [{questionId, optionIds, correct, points}]
    answers: grade.perQuestion.map((p) => ({
      questionId: p.questionId,
      optionIds:
        cleanAnswers.find((a) => a.questionId === p.questionId)?.optionIds ?? [],
      correct: p.correct,
      points: p.points,
    })),
  });

  // Mastery signal: one QuestionAttempt per question the candidate actually
  // answered (context "exam"). See MASTERY COUPLING NOTE in the header.
  const answeredIds = new Set(
    cleanAnswers.filter((a) => a.optionIds.length > 0).map((a) => a.questionId),
  );
  await store.createQuestionAttempts(
    grade.perQuestion
      .filter((p) => answeredIds.has(p.questionId))
      .map((p) => ({
        userId,
        questionId: p.questionId,
        context: "exam" as const,
        correct: p.correct,
        points: p.points,
      })),
  );

  return { attemptId, late, ...grade, passed };
}

/** All exam attempts of a user, newest first. */
export async function getExamHistory(userId: string): Promise<ExamHistoryEntry[]> {
  const attempts = await getExamStore().listAttempts(userId);
  return attempts.map(toHistoryEntry);
}

function toHistoryEntry(a: ExamAttemptRecord): ExamHistoryEntry {
  return {
    attemptId: a.id,
    startedAt: a.startedAt,
    finishedAt: a.finishedAt,
    status: a.finishedAt === null ? "in-progress" : "completed",
    score: a.score,
    maxScore: a.maxScore,
    passed: a.passed,
  };
}
