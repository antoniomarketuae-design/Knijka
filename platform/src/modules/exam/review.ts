/**
 * Rehydrating a COMPLETED attempt's review — the read path for /exams/[id].
 *
 * WHY THIS EXISTS (audit M-1). The full review used to live only in the
 * browser: the runner cached it in localStorage after submit, and
 * getExamHistory returned a score and nothing else. So the paper a candidate
 * had just failed became a bare number on any other device, in any other
 * browser, after any cache clear — and, because nothing pruned the ~39 KB per
 * attempt, eventually on the same device too. The graded payload was never
 * missing: store.listAttempts already read the whole `answers` column and
 * toHistoryEntry threw it away.
 *
 * That is a requirement-zero problem, not a convenience one (docs/education/64,
 * THEO-4): a mock exam that reports "62/97" and no explanations is the bare
 * verdict this product exists to refuse. A failed exam is also the single
 * highest-intent teaching moment we get — so the review has to survive the
 * device it was taken on, and it has to point somewhere: hence the per-topic
 * breakdown, which turns 45 verdicts into the two or three topics worth
 * practising next.
 *
 * The enrichment (option texts, `correct` flags, explanations, law refs) is a
 * plain content-repo read, safe here because it is reachable only for an
 * attempt that is already graded and closed — the same rule the post-submit
 * screen follows.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question } from "../../lib/content/types";
import type { ExamReviewQuestion, ExamTopicResult } from "./types";

/**
 * One entry of the graded `ExamAttempt.answers` array as index.ts persists it.
 * `maxPoints` is written since 2026-07-25; rows graded before that fall back to
 * the question's current weight (see resolveMaxPoints).
 */
export interface GradedAnswerRecord {
  questionId: string;
  optionIds: string[];
  correct: boolean;
  /** Points AWARDED (question weight if correct, else 0). */
  points: number;
  /** Question weight at the time of grading (1 | 2 | 3). */
  maxPoints?: number;
}

/** Parse the graded payload defensively — it is a JSON column, not a type. */
export function parseGradedAnswers(v: unknown): GradedAnswerRecord[] | null {
  if (!Array.isArray(v)) return null;
  const out: GradedAnswerRecord[] = [];
  for (const item of v) {
    if (typeof item !== "object" || item === null) return null;
    const o = item as Record<string, unknown>;
    if (typeof o.questionId !== "string") return null;
    if (typeof o.correct !== "boolean") return null;
    if (typeof o.points !== "number") return null;
    if (
      !Array.isArray(o.optionIds) ||
      !o.optionIds.every((x) => typeof x === "string")
    ) {
      return null;
    }
    out.push({
      questionId: o.questionId,
      optionIds: o.optionIds as string[],
      correct: o.correct,
      points: o.points,
      maxPoints: typeof o.maxPoints === "number" ? o.maxPoints : undefined,
    });
  }
  return out;
}

/**
 * Turn the stored grade into the full review + the per-topic breakdown.
 *
 * Question order is the stored order, which is the order the candidate sat —
 * "Въпрос 12" in the review is the twelfth question they answered.
 */
export function rehydrateReview(records: readonly GradedAnswerRecord[]): {
  questions: ExamReviewQuestion[];
  byTopic: ExamTopicResult[];
} {
  const repo = getContentRepo();
  const topicById = new Map(repo.topics().map((t) => [t.id, t]));

  const questions: ExamReviewQuestion[] = [];
  const perTopic = new Map<string, ExamTopicResult>();

  for (const rec of records) {
    const q = repo.questionById(rec.questionId);
    const topic = q === undefined ? undefined : topicById.get(primaryTopicId(q) ?? "");
    const maxPoints = resolveMaxPoints(rec, q);
    const chosen = new Set(rec.optionIds);

    questions.push(
      q === undefined
        ? {
            // Content shifted since the exam — degrade to the verdict rather
            // than invent a question. Rare, and honest when it happens.
            questionId: rec.questionId,
            textBg: "Този въпрос вече не е наличен в учебното съдържание.",
            type: "single",
            answered: chosen.size > 0,
            correct: rec.correct,
            pointsAwarded: rec.points,
            maxPoints,
            options: [],
            explanationBg: "",
            lawRefs: [],
            topicSlug: null,
            topicTitleBg: null,
          }
        : {
            questionId: q.id,
            textBg: q.textBg,
            type: q.type,
            answered: chosen.size > 0,
            correct: rec.correct,
            pointsAwarded: rec.points,
            maxPoints,
            options: q.options.map((o) => ({
              id: o.id,
              textBg: o.textBg,
              correct: o.correct,
              chosen: chosen.has(o.id),
            })),
            explanationBg: q.explanationBg,
            lawRefs: q.lawRefs.map((l) => ({ act: l.act, ref: l.ref })),
            topicSlug: topic?.slug ?? null,
            topicTitleBg: topic?.titleBg ?? null,
          },
    );

    // A question whose topic can no longer be resolved is left out of the
    // breakdown rather than bucketed under a fake topic: the breakdown's only
    // job is to send the student somewhere, and there is nowhere to send them.
    if (topic === undefined) continue;
    const row = perTopic.get(topic.id) ?? {
      topicId: topic.id,
      slug: topic.slug,
      titleBg: topic.titleBg,
      questions: 0,
      correct: 0,
      points: 0,
      maxPoints: 0,
    };
    row.questions += 1;
    if (rec.correct) row.correct += 1;
    row.points += rec.points;
    row.maxPoints += maxPoints;
    perTopic.set(topic.id, row);
  }

  // Curriculum order (topics.json `order`) — the same order the theory hub and
  // every other topic list uses, so a student reads one mental map, not two.
  const order = new Map([...topicById.values()].map((t) => [t.id, t.order]));
  const byTopic = [...perTopic.values()].sort(
    (a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0),
  );

  return { questions, byTopic };
}

/** Primary topic of a question — the builder's rule (first resolvable concept). */
function primaryTopicId(q: Question): string | undefined {
  const repo = getContentRepo();
  return q.conceptIds.map((id) => repo.conceptById(id)).find((c) => c !== undefined)
    ?.topicId;
}

/**
 * The weight this question was graded at. Prefer what was persisted: a weight
 * edited after the exam must not retroactively change how many points the
 * candidate "could have" scored. Older rows have no stored weight, so fall back
 * to the bank, then to the awarded points (correct answers at least self-report).
 */
function resolveMaxPoints(rec: GradedAnswerRecord, q: Question | undefined): number {
  if (rec.maxPoints !== undefined) return rec.maxPoints;
  if (q !== undefined) return q.points;
  return rec.points;
}
