/**
 * Exam → mastery feed.
 *
 * The exam module owns its QuestionAttempt rows (context "exam"); what it
 * cannot do is update per-concept mastery — that math lives here. After
 * grading, the exam module calls applyGradedAnswers() with the graded
 * (questionId, correct) pairs of every question the candidate actually
 * answered. We re-run the same applyAnswer/schedule pipeline as practice,
 * compounding sequentially when several questions touch the same concept,
 * and persist progress-only (no attempt rows — those already exist).
 */

import { getContentRepo } from "@/lib/content/repo";
import { applyAnswer } from "./mastery";
import { schedule } from "./scheduler";
import {
  getLearningStore,
  type ProgressRow,
  type ProgressUpdate,
} from "./store";

export interface GradedAnswer {
  questionId: string;
  correct: boolean;
}

export async function applyGradedAnswers(
  userId: string,
  graded: GradedAnswer[],
  now: Date = new Date(),
): Promise<void> {
  if (graded.length === 0) return;

  const repo = getContentRepo();
  const store = getLearningStore();

  const progress = await store.getProgress(userId);
  const state = new Map<string, Pick<ProgressRow, "mastery" | "reps" | "lapses" | "dueAt">>(
    progress.map((p) => [
      p.conceptId,
      { mastery: p.mastery, reps: p.reps, lapses: p.lapses, dueAt: p.dueAt },
    ]),
  );
  const touched = new Set<string>();

  for (const g of graded) {
    const question = repo.questionById(g.questionId);
    if (!question) continue; // stale id — skip rather than fail the exam

    for (const conceptId of question.conceptIds) {
      const cur = state.get(conceptId) ?? {
        mastery: 0,
        reps: 0,
        lapses: 0,
        dueAt: null,
      };
      const nextMastery = applyAnswer(
        { mastery: cur.mastery, lapses: cur.lapses },
        g.correct,
        question.points,
      );
      const nextSchedule = schedule(
        { reps: cur.reps, dueAt: cur.dueAt },
        g.correct,
        now,
      );
      state.set(conceptId, {
        mastery: nextMastery.mastery,
        lapses: nextMastery.lapses,
        reps: nextSchedule.reps,
        dueAt: nextSchedule.dueAt,
      });
      touched.add(conceptId);
    }
  }

  const updates: ProgressUpdate[] = [...touched].map((conceptId) => {
    const s = state.get(conceptId)!;
    return {
      conceptId,
      mastery: s.mastery,
      reps: s.reps,
      lapses: s.lapses,
      dueAt: s.dueAt,
    };
  });

  await store.upsertProgress(userId, updates);
}
