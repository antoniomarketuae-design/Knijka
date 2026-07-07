/**
 * Exam-readiness estimate v1 + per-topic dashboard overview.
 *
 * computeReadiness is a PURE function over (Progress rows, ContentRepo, now):
 *
 *   effectiveMastery(c) = mastery(c) * recencyFactor(days since last update)
 *   score = 100 * Σ(difficulty_c * effectiveMastery_c) / Σ(difficulty_c)
 *
 * summed over ALL concepts in the content repo:
 *  - weight     = concept difficulty (1..3) — harder concepts matter more;
 *  - coverage   = unseen concepts contribute mastery 0, so untouched material
 *    drags the score down (built-in coverage penalty);
 *  - recency    = full credit for 7 days after the last review, then linear
 *    decay to a 0.5 floor at 30 days — stale knowledge counts half.
 *
 * No data → score 0. Score maps directly to the ≥87/97 (~90%) exam bar:
 * a user should not sit the mock exam confident below ~85–90.
 */

import { getContentRepo, type ContentRepo } from "@/lib/content/repo";
import { DAY_MS, isDue } from "./scheduler";
import { getLearningStore, type ProgressRow } from "./store";

/** Full recency credit within this many days of the last review. */
export const RECENCY_FULL_DAYS = 7;
/** Recency credit bottoms out at this factor... */
export const RECENCY_FLOOR = 0.5;
/** ...once this many days have passed since the last review. */
export const RECENCY_FLOOR_DAYS = 30;

export const WEAKEST_CONCEPTS_COUNT = 5;

export interface ConceptReadiness {
  conceptId: string;
  topicId: string;
  titleBg: string;
  /** Recency-adjusted mastery 0..1 (0 = unseen). */
  effectiveMastery: number;
}

export interface Readiness {
  /** 0..100 */
  score: number;
  perTopic: { topicId: string; score: number }[];
  /** Up to 5 lowest-effective-mastery concepts, weakest first. */
  weakestConcepts: ConceptReadiness[];
}

/** 1 while fresh, linear decay to RECENCY_FLOOR at RECENCY_FLOOR_DAYS. */
export function recencyFactor(daysSinceReview: number): number {
  if (daysSinceReview <= RECENCY_FULL_DAYS) return 1;
  if (daysSinceReview >= RECENCY_FLOOR_DAYS) return RECENCY_FLOOR;
  const t =
    (daysSinceReview - RECENCY_FULL_DAYS) /
    (RECENCY_FLOOR_DAYS - RECENCY_FULL_DAYS);
  return 1 - t * (1 - RECENCY_FLOOR);
}

export function computeReadiness(
  progress: ProgressRow[],
  repo: ContentRepo,
  now: Date,
): Readiness {
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));

  const effectiveMastery = (conceptId: string): number => {
    const row = byConcept.get(conceptId);
    if (!row) return 0;
    const days = (now.getTime() - row.updatedAt.getTime()) / DAY_MS;
    return row.mastery * recencyFactor(days);
  };

  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);
  // All concepts, in topic order (stable tie-break for weakestConcepts).
  const concepts = topics.flatMap((t) => repo.conceptsByTopic(t.id));

  const weightedScore = (conceptIds: string[]): number => {
    let weightSum = 0;
    let masterySum = 0;
    for (const id of conceptIds) {
      const concept = repo.conceptById(id);
      if (!concept) continue;
      weightSum += concept.difficulty;
      masterySum += concept.difficulty * effectiveMastery(id);
    }
    return weightSum === 0 ? 0 : Math.round((100 * masterySum) / weightSum);
  };

  const perTopic = topics.map((t) => ({
    topicId: t.id,
    score: weightedScore(repo.conceptsByTopic(t.id).map((c) => c.id)),
  }));

  const weakestConcepts = concepts
    .map((c) => ({
      conceptId: c.id,
      topicId: c.topicId,
      titleBg: c.titleBg,
      effectiveMastery: effectiveMastery(c.id),
    }))
    .sort((a, b) => a.effectiveMastery - b.effectiveMastery)
    .slice(0, WEAKEST_CONCEPTS_COUNT);

  return {
    score: weightedScore(concepts.map((c) => c.id)),
    perTopic,
    weakestConcepts,
  };
}

export async function getReadiness(
  userId: string,
  now: Date = new Date(),
): Promise<Readiness> {
  const progress = await getLearningStore().getProgress(userId);
  return computeReadiness(progress, getContentRepo(), now);
}

// ---------------------------------------------------------------------------
// Per-topic dashboard overview
// ---------------------------------------------------------------------------

export interface TopicOverview {
  topicId: string;
  slug: string;
  titleBg: string;
  order: number;
  conceptCount: number;
  /** Concepts with at least one recorded answer. */
  seenConceptCount: number;
  /** seenConceptCount / conceptCount (0 when the topic has no concepts). */
  coverage: number;
  /** Unweighted average mastery over ALL topic concepts, unseen = 0 (0..1). */
  avgMastery: number;
  /** Concepts currently due for review. */
  dueCount: number;
}

export function computeTopicOverview(
  progress: ProgressRow[],
  repo: ContentRepo,
  now: Date,
): TopicOverview[] {
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);

  return topics.map((t) => {
    const concepts = repo.conceptsByTopic(t.id);
    let seen = 0;
    let due = 0;
    let masterySum = 0;
    for (const c of concepts) {
      const row = byConcept.get(c.id);
      if (!row) continue;
      seen += 1;
      masterySum += row.mastery;
      if (isDue({ reps: row.reps, dueAt: row.dueAt }, now)) due += 1;
    }
    const count = concepts.length;
    return {
      topicId: t.id,
      slug: t.slug,
      titleBg: t.titleBg,
      order: t.order,
      conceptCount: count,
      seenConceptCount: seen,
      coverage: count === 0 ? 0 : seen / count,
      avgMastery: count === 0 ? 0 : masterySum / count,
      dueCount: due,
    };
  });
}

export async function getTopicOverview(
  userId: string,
  now: Date = new Date(),
): Promise<TopicOverview[]> {
  const progress = await getLearningStore().getProgress(userId);
  return computeTopicOverview(progress, getContentRepo(), now);
}
