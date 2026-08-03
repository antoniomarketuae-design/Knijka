"use server";

/**
 * Server actions for the practice flow — a thin, guarded adapter over the
 * learning module. All business logic (grading, mastery, scheduling) lives
 * in @/modules/learning; this file only authenticates, validates the wire
 * input and shapes the response for the client.
 *
 * THIS ACTION USED TO BE AN ANSWER-KEY ORACLE FOR THE WHOLE BANK (audit M-10).
 * It returns `correctOptionIds`, and its only input was a question id — so any
 * id could be exchanged for its key, including the 45 ids in the DOM of a mock
 * exam open in another tab. The exam module's "nothing leaks mid-exam"
 * invariant was enforceable only on the exam's own routes; this was the side
 * door. It now requires the session ticket the practice page signs, so a
 * submission is only honoured for a question this user was actually dealt.
 *
 * Worse than the cheating, and the reason this is not merely a fairness fix:
 * every forged answer wrote a QuestionAttempt and moved mastery, which means
 * the readiness score — the number on the dashboard ring, and the only dataset
 * that could ever show this product makes safer drivers — was client-writable.
 */

import "@/lib/content/loader";
import { redirect } from "next/navigation";
import type { PracticeSubmitResult } from "@/components/theory/types";
import { getContentRepo } from "@/lib/content/repo";
import { requireUser } from "@/modules/auth";
import { trackActivity } from "@/modules/gamification";
import { resolveWhyPanel } from "@/modules/clips";
import { submitAnswer } from "@/modules/learning";
import { checkPracticeQuota } from "@/modules/payments";
import { consumeUserRateLimit, RATE_LIMITS } from "@/modules/security";

const MAX_ID_LENGTH = 120;
const MAX_SELECTED_OPTIONS = 12;
/** Comfortably above a real ticket (10 ids, a signature) and far below a DoS. */
const MAX_TICKET_LENGTH = 4096;

export async function submitPracticeAnswer(
  questionId: string,
  selectedOptionIds: string[],
  ticket: string,
): Promise<PracticeSubmitResult> {
  const user = await requireUser();

  // Every call costs a content lookup plus three DB writes, and a server action
  // never passes through the proxy chokepoint where the other budgets are
  // taken. Keyed on the SERVER session id, not the IP: a classroom shares one
  // school wi-fi address and shares nothing else. Taken FIRST, before any DB
  // work, because a limiter that runs after the expensive part is decoration.
  const budget = consumeUserRateLimit(user.id, RATE_LIMITS.practiceAnswer);
  if (!budget.allowed) {
    throw new Error("submitPracticeAnswer: rate limit exceeded");
  }

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
  if (typeof ticket !== "string" || ticket.length > MAX_TICKET_LENGTH) {
    throw new Error("submitPracticeAnswer: invalid ticket");
  }

  // Free tier: 20 practice questions per Sofia day; packs lift the limit.
  // Admins (role from the SERVER session) are never quota-gated.
  if (!user.isAdmin) {
    const quota = await checkPracticeQuota(user.id);
    if (!quota.allowed) redirect("/pricing?status=quota");
  }

  // The ticket goes in unvalidated on purpose: verification belongs to the
  // learning module (practiceTicket.ts), which owns the signing key and throws
  // PracticeTicketError BEFORE anything is read, graded or written — so a
  // submission we are not going to honour never touches mastery and, above all,
  // is never answered with the key.
  const result = await submitAnswer(
    user.id,
    questionId,
    [...new Set(selectedOptionIds)],
    "practice",
    new Date(),
    { ticket },
  );

  const weight = getContentRepo().questionById(questionId)?.points ?? 1;
  await trackActivity(user.id, {
    type: "practice_answer",
    correct: result.correct,
    points: weight,
  });

  // THEO-2 why-panel: the recorded drill demonstrating this question's fault.
  // Stored refs only (ADR-002) — text + citations already ride on `result`.
  const simRef = resolveWhyPanel(questionId)?.sim;

  // Constrain the return value to exactly what the UI renders.
  return {
    correct: result.correct,
    correctOptionIds: result.correctOptionIds,
    explanationBg: result.explanationBg,
    lawRefs: result.lawRefs.map(({ act, ref }) => ({ act, ref })),
    masteryBefore: result.masteryBefore,
    masteryAfter: result.masteryAfter,
    sim:
      simRef === undefined
        ? null
        : {
            templateId: simRef.templateId,
            level: simRef.level,
            titleBg: simRef.titleBg,
            mistake: {
              titleBg: simRef.mistake.titleBg,
              whatWentWrongBg: simRef.mistake.whatWentWrongBg,
              tracePath: simRef.mistake.tracePath,
              districtId: simRef.mistake.districtId,
            },
            // THEO-3: the wired „Преживей грешката" entry (six founder
            // classes today); stored refs only.
            experience:
              simRef.experience === null
                ? null
                : {
                    templateId: simRef.experience.templateId,
                    mistakeIndex: simRef.experience.mistakeIndex,
                    titleBg: simRef.experience.titleBg,
                  },
          },
  };
}
