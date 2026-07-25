/**
 * exam module — public API (docs/architecture/05: modules talk only via index.ts).
 *
 * Mock exams in the official Bulgarian category-B theory format
 * (docs/education/32): 45 questions / 97 points / pass >= 87 / 40 minutes.
 *
 * Lifecycle: startExam() builds a seeded exam and opens an ExamAttempt;
 * getInProgressExam() re-renders a running attempt from what was dealt (the
 * ONLY supported way to show an in-progress paper — see restore.ts);
 * submitExam() grades (exact-set rule for multi), enforces the 40:00 + 30s
 * grace limit (late => auto-fail, but what was answered is still graded and
 * persisted), and records per-question results; getExamReview() rebuilds a
 * finished attempt's full review + per-topic breakdown from the attempt row
 * (server-side, so it survives the device it was taken on — audit M-1);
 * getExamHistory() lists a user's attempts.
 *
 * Content gate: only `approved` questions are exam-eligible (builder.ts,
 * isExamEligible). Because quotas are proportional to that eligible pool,
 * auditExamSupply() reports whether review debt has quietly re-weighted which
 * topics candidates are examined on — run it in CI, not only from an admin
 * screen (supply.ts).
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
import { restorePaper } from "./restore";
import { parseGradedAnswers, rehydrateReview } from "./review";
import { getExamStore, type ExamAttemptRecord } from "./store";
import {
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  ExamError,
  type ExamAnswer,
  type ExamHistoryEntry,
  type ExamReview,
  type InProgressExam,
  type StartExamResult,
  type SubmitExamResult,
} from "./types";

// -- public re-exports -------------------------------------------------------

export { buildExam, isExamEligible } from "./builder";
export { gradeExam } from "./grader";
export {
  DECLARED_QUOTA_TOTAL,
  EXAM_TOPIC_QUOTAS,
  declaredQuotaFor,
  type TopicQuota,
} from "./quotas";
export {
  auditExamSupply,
  formatExamSupplyAudit,
  MIN_SUPPLY_PER_SLOT,
  MIN_APPROVED_SHARE,
  MAX_QUOTA_SHORTFALL,
} from "./supply";
export type {
  ExamSupplyAudit,
  TopicSupply,
  SupplyProblem,
  SupplyProblemCode,
} from "./supply";
export { setExamStore, InMemoryExamStore, type ExamStore } from "./store";
export { parseGradedAnswers, rehydrateReview, type GradedAnswerRecord } from "./review";
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
  ExamReview,
  ExamReviewOption,
  ExamReviewQuestion,
  ExamTopicResult,
  InProgressExam,
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

  // Render the freshly dealt paper through the SAME projection a resume uses,
  // so the first paint and every later resume are byte-identical (the builder's
  // own option order comes from its bank-wide RNG stream, which is unreplayable
  // once content changes). Done before createAttempt so we never open an
  // attempt we could not render.
  const paper = restorePaper(payload.questionIds, exam.seed);
  if (!paper.ok) {
    // Unreachable: the ids were just read out of the repo we are restoring from.
    throw new ExamError(
      "INVALID_ATTEMPT_STATE",
      `Freshly built exam is unrestorable: ${paper.missingIds.join(", ")}`,
    );
  }

  const attempt = await getExamStore().createAttempt({
    userId,
    maxScore: exam.totalPoints,
    answers: payload,
  });
  return {
    attemptId: attempt.id,
    seed: exam.seed,
    questions: paper.questions,
    durationSec: EXAM_DURATION_SEC,
  };
}

/**
 * Re-render an attempt that is still running — the read path for /exams/[id].
 *
 * Returns null when the attempt cannot be faithfully restored: unknown id, an
 * attempt belonging to someone else (same answer for both — don't leak other
 * users' ids), an attempt that is already graded, an unreadable payload, or a
 * dealt question that has since been deleted from the bank.
 *
 * Callers must render a "cannot continue" view on null and must NEVER fall back
 * to `buildExam(seed)`: that deals a different paper and grades the candidate
 * on questions they never saw (audit H-7).
 */
export async function getInProgressExam(
  userId: string,
  attemptId: string,
): Promise<InProgressExam | null> {
  const attempt = await getExamStore().getAttempt(attemptId);
  if (!attempt || attempt.userId !== userId) return null;
  if (attempt.finishedAt !== null) return null;

  const pending = parseInProgress(attempt.answers);
  if (!pending) return null;

  // The seed comes from the attempt row, not a cookie — cleared cookies, a
  // 100-minute cookie maxAge or a second device no longer strand the exam (M-9).
  const paper = restorePaper(pending.questionIds, pending.seed);
  if (!paper.ok) {
    console.warn(
      `exam: attempt ${attemptId} is unrestorable — ${paper.missingIds.length} dealt question(s) no longer in the bank: ${paper.missingIds.join(", ")}`,
    );
    return null;
  }

  return {
    attemptId,
    seed: pending.seed,
    startedAt: attempt.startedAt,
    questions: paper.questions,
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
    // schema contract: answers Json =
    //   [{questionId, optionIds, correct, points, maxPoints}]
    // `maxPoints` is the weight AS GRADED: getExamReview must not let a later
    // content edit change what the candidate could have scored (audit M-1).
    answers: grade.perQuestion.map((p) => ({
      questionId: p.questionId,
      optionIds:
        cleanAnswers.find((a) => a.questionId === p.questionId)?.optionIds ?? [],
      correct: p.correct,
      points: p.points,
      maxPoints: p.maxPoints,
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

  // Feed graded answers into per-concept mastery (learning module).
  // Best-effort: a mastery-feed failure must never lose a graded exam.
  try {
    const { applyGradedAnswers } = await import("@/modules/learning");
    await applyGradedAnswers(
      userId,
      grade.perQuestion
        .filter((p) => answeredIds.has(p.questionId))
        .map((p) => ({ questionId: p.questionId, correct: p.correct })),
      now,
    );
  } catch (err) {
    console.warn("exam: mastery feed failed (grade persisted)", err);
  }

  return { attemptId, late, ...grade, passed };
}

/**
 * The full review of a COMPLETED attempt — every question with its correct
 * options, explanation and citations, plus the per-topic breakdown.
 *
 * Server-side and device-independent on purpose (audit M-1): this used to be a
 * localStorage cache, so a failed exam degraded to a bare score anywhere else.
 * Returns null for an unknown attempt, someone else's attempt (same answer for
 * both — don't leak other users' ids), an attempt still in progress, or a
 * grade payload that cannot be read.
 */
export async function getExamReview(
  userId: string,
  attemptId: string,
): Promise<ExamReview | null> {
  const attempt = await getExamStore().getAttempt(attemptId);
  if (!attempt || attempt.userId !== userId) return null;
  if (attempt.finishedAt === null) return null;

  const records = parseGradedAnswers(attempt.answers);
  if (!records) {
    console.warn(`exam: attempt ${attemptId} has no readable grade payload`);
    return null;
  }

  const { questions, byTopic } = rehydrateReview(records);
  return {
    attemptId,
    startedAt: attempt.startedAt,
    finishedAt: attempt.finishedAt,
    score: attempt.score ?? 0,
    maxScore: attempt.maxScore,
    passed: attempt.passed === true,
    timeUsedSec: Math.max(
      0,
      Math.round((attempt.finishedAt.getTime() - attempt.startedAt.getTime()) / 1000),
    ),
    questions,
    byTopic,
  };
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
