/**
 * Practice-session builder.
 *
 * Priority order (learning-engine v1):
 *  (a) DUE REVIEWS — concepts whose dueAt has passed, most overdue first.
 *      Reviews are never prerequisite-gated: once a concept has been studied,
 *      spaced repetition owns it.
 *  (b) WEAK CONCEPTS — already-seen concepts with mastery < 0.8, weakest
 *      first, but ONLY when every direct prerequisite (repo.prerequisites)
 *      has mastery ≥ 0.5 — never drill a concept before its prerequisites.
 *  (c) NEW CONCEPTS — never-answered concepts in topic order, same
 *      prerequisite gate.
 *
 * Within each bucket questions are drawn round-robin (one question per
 * concept per pass, concepts kept in bucket order) so a session covers
 * several concepts instead of exhausting the first one.
 *
 * Filters:
 *  - Questions answered correctly in the last 2 hours are excluded.
 *  - Status "draft" and "approved" are always eligible; "needs-review" only
 *    when includeUnreviewed (default true — practice may show unreviewed
 *    items; exams must NEVER, so the exam module must pass/keep them out).
 *
 * The session can come up short of `size` rather than violate prerequisite
 * gating or repeat recently-correct questions.
 */

import { getContentRepo } from "@/lib/content/repo";
import type { Concept, ContentStatus, Question } from "@/lib/content/types";
import { isDue } from "./scheduler";
import { getLearningStore, type ProgressRow } from "./store";

/** Prerequisites must be at least this mastered before a concept is drilled. */
export const PREREQ_MASTERY_THRESHOLD = 0.5;
/** Seen concepts below this mastery are still "weak" and get drilled. */
export const WEAK_MASTERY_THRESHOLD = 0.8;
/** Questions answered correctly within this window are excluded. */
export const RECENT_CORRECT_WINDOW_MS = 2 * 60 * 60 * 1000;

export const DEFAULT_SESSION_SIZE = 10;

export type SessionReason = "due-review" | "weak-concept" | "new-concept";

export interface SessionQuestion {
  question: Question;
  /** The concept this question was selected for. */
  conceptId: string;
  reason: SessionReason;
}

export interface PracticeSessionOptions {
  /** Restrict the session to one topic (repo slug). */
  topicSlug?: string;
  /**
   * Restrict the session to an explicit set of concepts — used by the theory
   * hub to launch practice for a single SECTION. Applied on top of any
   * topicSlug scope; concepts outside the set are excluded. The engine's
   * bucket ordering and prerequisite gating are otherwise unchanged.
   */
  conceptIds?: string[];
  /** Target number of questions (may return fewer). Default 10. */
  size?: number;
  /** Include "needs-review" questions. Default true (practice only). */
  includeUnreviewed?: boolean;
  /** Injectable clock for tests. Default: new Date(). */
  now?: Date;
}

export async function buildPracticeSession(
  userId: string,
  options: PracticeSessionOptions = {},
): Promise<SessionQuestion[]> {
  const {
    topicSlug,
    conceptIds,
    size = DEFAULT_SESSION_SIZE,
    includeUnreviewed = true,
    now = new Date(),
  } = options;

  const repo = getContentRepo();
  const store = getLearningStore();

  const [progress, recentCorrectIds] = await Promise.all([
    store.getProgress(userId),
    store.getCorrectlyAnsweredSince(
      userId,
      new Date(now.getTime() - RECENT_CORRECT_WINDOW_MS),
    ),
  ]);
  const progressByConcept = new Map<string, ProgressRow>(
    progress.map((p) => [p.conceptId, p]),
  );
  const recentCorrect = new Set(recentCorrectIds);

  // ---- Scope: concepts in topic order ------------------------------------
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);
  const scopedTopics = topicSlug
    ? topics.filter((t) => t.slug === topicSlug)
    : topics;
  if (topicSlug && scopedTopics.length === 0) {
    throw new Error(`buildPracticeSession: unknown topic slug "${topicSlug}"`);
  }
  const conceptFilter =
    conceptIds && conceptIds.length > 0 ? new Set(conceptIds) : null;
  const concepts = scopedTopics
    .flatMap((t) => repo.conceptsByTopic(t.id))
    .filter((c) => conceptFilter === null || conceptFilter.has(c.id));

  // ---- Eligibility helpers ------------------------------------------------
  const allowedStatuses = new Set<ContentStatus>(["draft", "approved"]);
  if (includeUnreviewed) allowedStatuses.add("needs-review");

  const masteryOf = (conceptId: string): number =>
    progressByConcept.get(conceptId)?.mastery ?? 0;

  const prereqsMet = (conceptId: string): boolean =>
    repo
      .prerequisites(conceptId)
      .every((p) => masteryOf(p.id) >= PREREQ_MASTERY_THRESHOLD);

  const usedQuestionIds = new Set<string>();
  const eligible = (q: Question): boolean =>
    allowedStatuses.has(q.status) &&
    !recentCorrect.has(q.id) &&
    !usedQuestionIds.has(q.id);

  // ---- Buckets (ordered concept lists) ------------------------------------
  const dueSet = new Set<string>();
  for (const c of concepts) {
    const p = progressByConcept.get(c.id);
    if (p && isDue({ reps: p.reps, dueAt: p.dueAt }, now)) dueSet.add(c.id);
  }

  const dueConcepts = concepts
    .filter((c) => dueSet.has(c.id))
    .sort(
      (a, b) =>
        progressByConcept.get(a.id)!.dueAt!.getTime() -
        progressByConcept.get(b.id)!.dueAt!.getTime(),
    );

  const weakConcepts = concepts
    .filter((c) => {
      const p = progressByConcept.get(c.id);
      return (
        p !== undefined &&
        !dueSet.has(c.id) &&
        p.mastery < WEAK_MASTERY_THRESHOLD &&
        prereqsMet(c.id)
      );
    })
    .sort((a, b) => masteryOf(a.id) - masteryOf(b.id));

  const newConcepts = concepts.filter(
    (c) => !progressByConcept.has(c.id) && prereqsMet(c.id),
  ); // already in topic order

  // ---- Fill: bucket by bucket, round-robin within a bucket -----------------
  const picked: SessionQuestion[] = [];

  const fillFrom = (bucket: Concept[], reason: SessionReason): void => {
    let progressMade = true;
    while (picked.length < size && progressMade) {
      progressMade = false;
      for (const concept of bucket) {
        if (picked.length >= size) break;
        const question = repo
          .questionsByConcept(concept.id)
          .find((q) => eligible(q));
        if (question) {
          usedQuestionIds.add(question.id);
          picked.push({ question, conceptId: concept.id, reason });
          progressMade = true;
        }
      }
    }
  };

  fillFrom(dueConcepts, "due-review");
  fillFrom(weakConcepts, "weak-concept");
  fillFrom(newConcepts, "new-concept");

  return picked;
}
