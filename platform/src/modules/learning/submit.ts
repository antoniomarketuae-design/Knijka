/**
 * Answer submission: grading + persistence.
 *
 * Grading: exact set match between selected option ids and the correct option
 * ids — this handles "single" (exactly the one correct option) and "multi"
 * (select ALL correct options, no extras — the official exam format has no
 * partial credit, docs/education/32) with one rule.
 *
 * By ID, never by index — a load-bearing invariant, not an implementation
 * detail: practice presents options in a per-session shuffled order
 * (optionOrder.ts, audit H-1a), so an option's position on screen has no
 * relationship to its position in the bank. Any grading path that compared
 * positions would mark the right answer wrong the moment the shuffle moved it.
 *
 * Persistence: one QuestionAttempt + a Progress upsert per concept the
 * question maps to, in a single transaction (LearningStore.recordAnswer).
 * QuestionAttempt.points stores the question's official weight (1|2|3);
 * earned points are derivable via `correct`.
 *
 * masteryBefore/masteryAfter are averaged over the question's concepts
 * (most questions map to exactly one concept).
 *
 * Session binding: a submission that answers with the full key
 * (correctOptionIds + explanation + citations) is only accepted for a question
 * the engine actually dealt to this user — see practiceTicket.ts and audit
 * M-10. That is "practice" AND "micro": both hand back the key, so both are
 * bound. "lesson" is not, because the lesson module deals its own beat
 * deterministically and verifies membership itself (see AnswerContext below).
 *
 * Content clearance: a "micro" answer is additionally refused for any question
 * that is not `approved`. See the note at the check itself — the deal filters,
 * and the grader refuses independently, because those are two different doors.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { LawRef } from "@/lib/content/types";
import { applyAnswer } from "./mastery";
import { assertPracticeTicket } from "./practiceTicket";
import { schedule } from "./scheduler";
import { getLearningStore, type ProgressUpdate } from "./store";

/**
 * Contexts this module records. Exams are owned by the exam module.
 *
 * "lesson" is the classroom's mini-quiz (modules/lesson). It is a THIRD
 * context rather than a reuse of "practice" for two reasons: the practice
 * ticket (audit M-10) binds a submission to a list of ids the practice engine
 * dealt, and a lesson deals its own — deterministically, from the beat, so the
 * lesson module verifies membership itself; and the founder will want to know
 * whether classroom answers behave differently from practice answers, which is
 * unanswerable if they are recorded as the same thing.
 *
 * What is deliberately NOT different: grading, mastery, scheduling. A lesson
 * answer moves exactly the same needle a practice answer does. The classroom
 * is an input to the learning engine, not a parallel one.
 */
export type AnswerContext = "practice" | "micro" | "lesson";

export interface SubmitAnswerOptions {
  /**
   * The dealt session this answer belongs to (issuePracticeTicket).
   * Verified strictly whenever it is present, and REQUIRED for
   * `context: "practice"` and `context: "micro"` under the policy in
   * practiceTicket.ts (required in production; permissive elsewhere unless
   * PRACTICE_TICKET_REQUIRED says otherwise).
   *
   * THIS DOC USED TO READ "Ignored for micro: those questions are chosen by
   * the sim from the driver's own faults, not from a list of ids the client
   * can see." Both halves of that sentence were false. The sim does not choose
   * the question — `loadMicroQuizBank` ships a bank of up to 16 questions to
   * the browser and a PURE client-side trigger picks from it, so the ids are in
   * the client by design. And "ignored" meant the id was never checked against
   * anything at all: `submitMicroQuizAnswer` validated its TYPE and LENGTH and
   * then this function answered it with `correctOptionIds`, the explanation and
   * the citations — for any of the 1,089 rows in the bank, including the
   * first-aid rows the classroom, the exam and the tutor all refuse. It is the
   * same answer-key oracle audit M-10 closed on practice, on the next door
   * along. The ticket is issued by loadMicroQuizBank over exactly the bank it
   * dealt, and travels back on submit.
   */
  ticket?: string | null;
}

export interface SubmitAnswerResult {
  correct: boolean;
  correctOptionIds: string[];
  explanationBg: string;
  lawRefs: LawRef[];
  /** Avg mastery across the question's concepts before this answer (0..1). */
  masteryBefore: number;
  /** Avg mastery across the question's concepts after this answer (0..1). */
  masteryAfter: number;
}

export async function submitAnswer(
  userId: string,
  questionId: string,
  selectedOptionIds: string[],
  context: AnswerContext,
  now: Date = new Date(),
  options: SubmitAnswerOptions = {},
): Promise<SubmitAnswerResult> {
  const repo = getContentRepo();
  const store = getLearningStore();

  // Session binding BEFORE anything is read, graded or written (audit M-10):
  // a submission we are not going to honour must not touch mastery, must not
  // consume quota, and above all must not answer with the key.
  //
  // "micro" is here for exactly the reason "practice" is, and the omission was
  // not an oversight in reasoning but in scope: M-10 was written up as a
  // practice defect, the practice endpoint was fixed, and the neighbour that
  // returns the identical payload was left taking a bare question id.
  if (context === "practice" || context === "micro") {
    assertPracticeTicket(userId, questionId, options.ticket, now);
  }

  const question = repo.questionById(questionId);
  if (!question) {
    throw new Error(`submitAnswer: unknown question "${questionId}"`);
  }

  // CONTENT CLEARANCE FOR THE IN-DRIVE QUIZ — the same check narration.ts:87,
  // lesson/clearance.ts and exam/builder.ts:120 each make on their own surface.
  //
  // WHY IT IS HERE AND NOT ONLY ON THE DEAL. The deal (loadMicroQuizBank) now
  // filters by status, so no legitimate micro submission can reach this line
  // with an unapproved row. That is precisely why the check belongs here too:
  // the deal decides what a student is OFFERED, and this decides what the
  // server will SPEAK — and it is the second one that hands back
  // `explanationBg` and `lawRefs`. A filter on the deal alone is a gate on the
  // honest path only, which is the shape of every door found in this sweep.
  //
  // Ticket-or-not is a SESSION question and status is a CONTENT question, and
  // they fail differently: the ticket policy is permissive outside production
  // (practiceTicket.ts explains why) while this refuses everywhere, always. So
  // the 29 first-aid rows regrounded on ERC 2025 — several of whose answers
  // were REVERSED, because the old ones taught a student to make an injury
  // worse — cannot be spoken through this path in dev, in test, in a script or
  // on the VPS, whatever the env says, until a human signs them.
  //
  // Only "micro": "practice" deals `needs-review` deliberately
  // (session.ts includeUnreviewed) and "lesson" gates in lesson/quiz.ts.
  if (context === "micro" && question.status !== "approved") {
    throw new Error(
      `submitAnswer: question "${questionId}" is "${question.status}", not approved — the in-drive quiz never speaks an unsigned row`,
    );
  }

  const knownOptionIds = new Set(question.options.map((o) => o.id));
  for (const id of selectedOptionIds) {
    if (!knownOptionIds.has(id)) {
      throw new Error(
        `submitAnswer: option "${id}" does not belong to question "${questionId}"`,
      );
    }
  }

  const correctOptionIds = question.options
    .filter((o) => o.correct)
    .map((o) => o.id);
  const correct = sameSet(selectedOptionIds, correctOptionIds);

  // ---- Per-concept mastery + schedule updates -----------------------------
  const progress = await store.getProgress(userId);
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));

  const updates: ProgressUpdate[] = [];
  let masteryBeforeSum = 0;
  let masteryAfterSum = 0;

  for (const conceptId of question.conceptIds) {
    const row = byConcept.get(conceptId);
    const masteryState = {
      mastery: row?.mastery ?? 0,
      lapses: row?.lapses ?? 0,
    };
    const scheduleState = { reps: row?.reps ?? 0, dueAt: row?.dueAt ?? null };

    const nextMastery = applyAnswer(masteryState, correct, question.points);
    const nextSchedule = schedule(scheduleState, correct, now);

    masteryBeforeSum += masteryState.mastery;
    masteryAfterSum += nextMastery.mastery;
    updates.push({
      conceptId,
      mastery: nextMastery.mastery,
      lapses: nextMastery.lapses,
      reps: nextSchedule.reps,
      dueAt: nextSchedule.dueAt,
    });
  }

  await store.recordAnswer(
    userId,
    {
      questionId: question.id,
      context,
      correct,
      points: question.points,
      answeredAt: now,
    },
    updates,
  );

  const conceptCount = Math.max(1, question.conceptIds.length);
  return {
    correct,
    correctOptionIds,
    explanationBg: question.explanationBg,
    lawRefs: question.lawRefs,
    masteryBefore: masteryBeforeSum / conceptCount,
    masteryAfter: masteryAfterSum / conceptCount,
  };
}

function sameSet(a: string[], b: string[]): boolean {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size !== setB.size) return false;
  for (const x of setA) if (!setB.has(x)) return false;
  return true;
}
