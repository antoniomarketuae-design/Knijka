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
 * Session binding: a "practice" submission answers with the full key
 * (correctOptionIds + explanation + citations), so it is only accepted for a
 * question the practice engine actually dealt to this user — see
 * practiceTicket.ts and audit M-10.
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
   * The practice session this answer belongs to (issuePracticeTicket).
   * Verified strictly whenever it is present, and REQUIRED for
   * `context: "practice"` once PRACTICE_TICKET_REQUIRED=1 (practiceTicket.ts).
   * Ignored for "micro": those questions are chosen by the sim from the
   * driver's own faults, not from a list of ids the client can see.
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
  if (context === "practice") {
    assertPracticeTicket(userId, questionId, options.ticket, now);
  }

  const question = repo.questionById(questionId);
  if (!question) {
    throw new Error(`submitAnswer: unknown question "${questionId}"`);
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
