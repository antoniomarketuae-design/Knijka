"use server";

/**
 * Server actions for the practice flow — a thin, guarded adapter over the
 * learning module. All business logic (grading, mastery, scheduling) lives
 * in @/modules/learning; this file only authenticates, validates the wire
 * input and shapes the response for the client.
 */

import "@/lib/content/loader";
import type { PracticeSubmitResult } from "@/components/theory/types";
import { requireUser } from "@/modules/auth";
import { submitAnswer } from "@/modules/learning";

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

  const result = await submitAnswer(
    user.id,
    questionId,
    [...new Set(selectedOptionIds)],
    "practice",
  );

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
