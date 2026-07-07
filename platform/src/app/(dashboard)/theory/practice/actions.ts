"use server";

/**
 * Server actions for the practice flow — a thin, guarded adapter over the
 * learning module. All business logic (grading, mastery, scheduling) lives
 * in @/modules/learning; this file only authenticates, validates the wire
 * input and shapes the response for the client.
 */

import "@/lib/content/loader";
import { redirect } from "next/navigation";
import type { PracticeSubmitResult } from "@/components/theory/types";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { trackActivity } from "@/modules/gamification";
import { submitAnswer } from "@/modules/learning";
import { checkPracticeQuota } from "@/modules/payments";

const MAX_ID_LENGTH = 120;
const MAX_SELECTED_OPTIONS = 12;

export async function submitPracticeAnswer(
  questionId: string,
  selectedOptionIds: string[],
): Promise<PracticeSubmitResult> {
  const user = await requireUser();

  // Server actions are a public POST endpoint — never trust the payload.
  if (
    typeof questionId !== "string" ||
    questionId.length === 0 ||
    questionId.length > MAX_ID_LENGTH
  ) {
    throw new Error("submitPracticeAnswer: invalid questionId");
  }
  if (
    !Array.isArray(selectedOptionIds) ||
    selectedOptionIds.length === 0 ||
    selectedOptionIds.length > MAX_SELECTED_OPTIONS ||
    !selectedOptionIds.every(
      (id): id is string =>
        typeof id === "string" && id.length > 0 && id.length <= MAX_ID_LENGTH,
    )
  ) {
    throw new Error("submitPracticeAnswer: invalid selectedOptionIds");
  }

  // Free tier: 20 practice questions per Sofia day; packs lift the limit.
  const quota = await checkPracticeQuota(user.id);
  if (!quota.allowed) redirect("/pricing?status=quota");

  const result = await submitAnswer(
    user.id,
    questionId,
    [...new Set(selectedOptionIds)],
    "practice",
  );

  const weight = getContentRepo().questionById(questionId)?.points ?? 1;
  await trackActivity(user.id, {
    type: "practice_answer",
    correct: result.correct,
    points: weight,
  });

  // Constrain the return value to exactly what the UI renders.
  return {
    correct: result.correct,
    correctOptionIds: result.correctOptionIds,
    explanationBg: result.explanationBg,
    lawRefs: result.lawRefs.map(({ act, ref }) => ({ act, ref })),
    masteryBefore: result.masteryBefore,
    masteryAfter: result.masteryAfter,
  };
}
