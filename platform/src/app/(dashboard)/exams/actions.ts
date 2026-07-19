"use server";

/**
 * Server actions for the mock-exam flow (/exams).
 *
 * - startExamAction: opens an attempt via the exam module, stashes the
 *   builder seed in an httpOnly cookie (refresh/restore safety — the runner
 *   page can deterministically rebuild the same safe question set), then
 *   redirects to the runner.
 * - submitExamAction: grades via submitExam, then — only AFTER the attempt is
 *   closed — enriches every question from the content repo (correct options,
 *   explanationBg, lawRefs) for the review screen. Nothing leaks mid-exam.
 *
 * Business logic (selection, grading, time limit) stays in @/modules/exam;
 * this file only adapts it to the UI.
 */

import "@/lib/content/loader";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import {
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  EXAM_PASS_POINTS,
  ExamError,
  startExam,
  submitExam,
  type PerQuestionResult,
} from "@/modules/exam";
import {
  seedCookieName,
  type ResultSummary,
  type ReviewQuestion,
  type SubmitExamActionResult,
  type SubmitExamInput,
} from "@/components/exam/types";
import { trackActivity } from "@/modules/gamification";
import { requireEntitlementForExam } from "@/modules/payments";

const ATTEMPT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** „Започни пробен изпит" — form action on /exams. */
export async function startExamAction(): Promise<void> {
  const user = await requireUser();

  // Free tier: one mock exam total; packs unlock unlimited attempts.
  //
  // DEV ESCAPE HATCH (pre-launch): outside production the free-attempt cap is
  // bypassed so the team can rehearse the exam repeatedly without wiring up a
  // payment. Without this, the second „Започни пробен изпит" click silently
  // bounces to /pricing and the exam appears to "not start". Production keeps
  // the freemium gate fully intact (1 free exam, then /pricing) — flip this by
  // removing the guard once a dev entitlement seed exists.
  //
  // Admin accounts (role from the SERVER session, never the wire) bypass the
  // cap in every environment — founder/test accounts rehearse freely.
  const enforceExamLimit = process.env.NODE_ENV === "production" && !user.isAdmin;
  if (enforceExamLimit && !(await requireEntitlementForExam(user.id))) {
    redirect("/pricing?status=exam-limit");
  }

  let attemptId: string;
  try {
    const started = await startExam(user.id);
    attemptId = started.attemptId;

    const cookieStore = await cookies();
    cookieStore.set({
      name: seedCookieName(started.attemptId),
      value: String(started.seed),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // Exam window + slack: enough to resume/auto-submit, then self-cleans.
      maxAge: EXAM_DURATION_SEC + EXAM_GRACE_SEC + 60 * 60,
    });
  } catch (err) {
    // BANK_TOO_SMALL / BANK_OVERWEIGHT — content problem, not the user's.
    if (err instanceof ExamError) redirect("/exams?msg=start-failed");
    throw err;
  }

  redirect(`/exams/${attemptId}`);
}

/** Grade the attempt and return the summary + enriched review. */
export async function submitExamAction(
  input: SubmitExamInput,
): Promise<SubmitExamActionResult> {
  const user = await requireUser();

  const parsed = parseSubmitInput(input);
  if (!parsed) return { ok: false, code: "INVALID_INPUT" };

  try {
    const result = await submitExam(
      user.id,
      parsed.attemptId,
      parsed.answers,
      parsed.clientElapsedSec,
    );

    await trackActivity(user.id, {
      type: "exam_completed",
      passed: result.passed,
      score: result.score,
    });

    const summary: ResultSummary = {
      attemptId: result.attemptId,
      score: result.score,
      maxScore: result.maxScore,
      passPoints: EXAM_PASS_POINTS,
      passed: result.passed,
      late: result.late,
      timeUsedSec: Math.min(
        parsed.clientElapsedSec,
        EXAM_DURATION_SEC + EXAM_GRACE_SEC,
      ),
    };
    return {
      ok: true,
      summary,
      review: buildReview(result.perQuestion, parsed.answers),
    };
  } catch (err) {
    if (
      err instanceof ExamError &&
      (err.code === "ATTEMPT_NOT_FOUND" ||
        err.code === "ALREADY_SUBMITTED" ||
        err.code === "INVALID_ATTEMPT_STATE")
    ) {
      return { ok: false, code: err.code };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// helpers (not exported — "use server" files may only export async functions)
// ---------------------------------------------------------------------------

/** Server actions are public endpoints: never trust the wire shape. */
function parseSubmitInput(value: unknown): SubmitExamInput | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;

  if (typeof o.attemptId !== "string" || !ATTEMPT_ID_RE.test(o.attemptId)) {
    return null;
  }
  if (
    typeof o.clientElapsedSec !== "number" ||
    !Number.isFinite(o.clientElapsedSec) ||
    o.clientElapsedSec < 0
  ) {
    return null;
  }
  if (!Array.isArray(o.answers) || o.answers.length > 200) return null;

  const answers: SubmitExamInput["answers"] = [];
  for (const item of o.answers) {
    if (typeof item !== "object" || item === null) return null;
    const a = item as Record<string, unknown>;
    if (typeof a.questionId !== "string" || a.questionId.length > 128) return null;
    if (
      !Array.isArray(a.optionIds) ||
      a.optionIds.length > 20 ||
      !a.optionIds.every((x): x is string => typeof x === "string" && x.length <= 64)
    ) {
      return null;
    }
    answers.push({ questionId: a.questionId, optionIds: a.optionIds });
  }

  return {
    attemptId: o.attemptId,
    answers,
    clientElapsedSec: Math.floor(o.clientElapsedSec),
  };
}

/**
 * Post-submit enrichment from the content repo: full option texts with
 * correct flags, explanationBg and lawRefs. Only reachable after submitExam
 * succeeded, i.e. the attempt is closed — nothing leaks during the exam.
 */
function buildReview(
  perQuestion: PerQuestionResult[],
  answers: SubmitExamInput["answers"],
): ReviewQuestion[] {
  const repo = getContentRepo();
  const chosenByQuestion = new Map(
    answers.map((a) => [a.questionId, new Set(a.optionIds)]),
  );

  return perQuestion.map((p) => {
    const chosen = chosenByQuestion.get(p.questionId) ?? new Set<string>();
    const q = repo.questionById(p.questionId);
    if (!q) {
      // Content shifted between start and review — degrade gracefully.
      return {
        questionId: p.questionId,
        textBg: "Този въпрос вече не е наличен в учебното съдържание.",
        type: "single" as const,
        answered: chosen.size > 0,
        correct: p.correct,
        pointsAwarded: p.points,
        maxPoints: p.maxPoints,
        options: [],
        explanationBg: "",
        lawRefs: [],
      };
    }
    return {
      questionId: q.id,
      textBg: q.textBg,
      type: q.type,
      answered: chosen.size > 0,
      correct: p.correct,
      pointsAwarded: p.points,
      maxPoints: p.maxPoints,
      options: q.options.map((o) => ({
        id: o.id,
        textBg: o.textBg,
        correct: o.correct,
        chosen: chosen.has(o.id),
      })),
      explanationBg: q.explanationBg,
      lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
    };
  });
}
