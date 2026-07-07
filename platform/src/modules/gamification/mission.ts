/**
 * Daily missions — DERIVED, never stored (docs/platform/36).
 *
 * The mission for (userId, Sofia day) is a deterministic function of a hash
 * of both, so every call reproduces the same mission with zero state:
 *
 *  - "solve-count":   „Реши N въпроса днес" (N ∈ 10/15/20) — progress = number
 *    of QuestionAttempt rows today (any context: practice, micro AND exam
 *    answers all count — solving is solving).
 *  - "topic-correct": „5 верни отговора от тема Y" where Y is the user's
 *    weakest topic — progress = DISTINCT questions from that topic answered
 *    correctly today. Distinct on purpose: re-grinding one easy question must
 *    not complete the mission (gamification serves learning, no cheese paths).
 *
 * The weakest topic is recomputed from live mastery, so it can shift within a
 * day as the user improves — acceptable for v1 and documented here; the
 * completion marker ("dm-<date>" in the achievements Json) freezes the reward
 * either way, so no double-award is possible.
 *
 * The mission id IS the marker id: "dm-YYYY-MM-DD".
 */

import type { ContentRepo } from "@/lib/content/repo";
import type { AttemptRow, MasteryRow } from "./store";
import { sofiaDayString } from "./time";

export type MissionKind = "solve-count" | "topic-correct";

export interface MissionSpec {
  /** "dm-YYYY-MM-DD" — also the double-award guard marker id. */
  id: string;
  kind: MissionKind;
  titleBg: string;
  descriptionBg: string;
  target: number;
  xpReward: number;
  /** Set for "topic-correct" missions. */
  topicId?: string;
}

export const TOPIC_MISSION_TARGET = 5;
export const TOPIC_MISSION_XP = 40;
/** solve-count variants: target N with its XP reward (harder pays more). */
export const SOLVE_COUNT_VARIANTS: ReadonlyArray<{ n: number; xp: number }> = [
  { n: 10, xp: 30 },
  { n: 15, xp: 40 },
  { n: 20, xp: 50 },
];

/** FNV-1a 32-bit — tiny, stable, deterministic across runtimes. */
export function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function missionIdForDay(dayStr: string): string {
  return `dm-${dayStr}`;
}

export interface TopicMastery {
  topicId: string;
  titleBg: string;
  order: number;
  /** Average mastery over ALL topic concepts, unseen = 0 (0..1). */
  avgMastery: number;
}

/**
 * Per-topic average mastery, unseen concepts counting as 0 — the SAME formula
 * as the learning module's TopicOverview.avgMastery, so "topic-mastered" and
 * the dashboard never disagree. Topics without concepts are skipped.
 */
export function topicAvgMasteries(
  repo: ContentRepo,
  mastery: MasteryRow[],
): TopicMastery[] {
  const byConcept = new Map(mastery.map((m) => [m.conceptId, m.mastery]));
  return repo
    .topics()
    .map((t) => {
      const concepts = repo.conceptsByTopic(t.id);
      if (concepts.length === 0) return null;
      let sum = 0;
      for (const c of concepts) sum += byConcept.get(c.id) ?? 0;
      return {
        topicId: t.id,
        titleBg: t.titleBg,
        order: t.order,
        avgMastery: sum / concepts.length,
      };
    })
    .filter((t): t is TopicMastery => t !== null);
}

/** Weakest topic = lowest avgMastery, ties broken by topic order. */
export function weakestTopic(
  repo: ContentRepo,
  mastery: MasteryRow[],
): TopicMastery | null {
  const topics = topicAvgMasteries(repo, mastery);
  if (topics.length === 0) return null;
  return topics.reduce((best, t) =>
    t.avgMastery < best.avgMastery ||
    (t.avgMastery === best.avgMastery && t.order < best.order)
      ? t
      : best,
  );
}

/**
 * Derive the mission for (userId, `now`'s Sofia day). Deterministic: same
 * inputs → same mission. Falls back to "solve-count" when the content repo
 * has no usable topics.
 */
export function deriveMission(
  userId: string,
  now: Date,
  repo: ContentRepo,
  mastery: MasteryRow[],
): MissionSpec {
  const dayStr = sofiaDayString(now);
  const id = missionIdForDay(dayStr);
  const hash = fnv1a(`${userId}:${dayStr}`);

  const topic = (hash & 1) === 1 ? weakestTopic(repo, mastery) : null;
  if (topic) {
    return {
      id,
      kind: "topic-correct",
      titleBg: `${TOPIC_MISSION_TARGET} верни от „${topic.titleBg}“`,
      descriptionBg: `Отговори правилно на ${TOPIC_MISSION_TARGET} различни въпроса от най-слабата ти тема днес.`,
      target: TOPIC_MISSION_TARGET,
      xpReward: TOPIC_MISSION_XP,
      topicId: topic.topicId,
    };
  }

  const variant = SOLVE_COUNT_VARIANTS[(hash >>> 3) % SOLVE_COUNT_VARIANTS.length];
  return {
    id,
    kind: "solve-count",
    titleBg: `Реши ${variant.n} въпроса днес`,
    descriptionBg: `Отговори на ${variant.n} въпроса днес — от упражнения или пробен изпит.`,
    target: variant.n,
    xpReward: variant.xp,
  };
}

/**
 * Progress toward `mission` from the user's attempts, counting only rows on
 * the mission's Sofia day (callers pass a superset, e.g. "last 48h").
 */
export function missionProgress(
  mission: MissionSpec,
  attempts: AttemptRow[],
  repo: ContentRepo,
  now: Date,
): number {
  const dayStr = sofiaDayString(now);
  const today = attempts.filter((a) => sofiaDayString(a.answeredAt) === dayStr);

  if (mission.kind === "solve-count") {
    return Math.min(mission.target, today.length);
  }

  // topic-correct: distinct correct questions belonging to the topic.
  const topicConcepts = new Set(
    repo.conceptsByTopic(mission.topicId ?? "").map((c) => c.id),
  );
  const distinct = new Set<string>();
  for (const a of today) {
    if (!a.correct) continue;
    const q = repo.questionById(a.questionId);
    if (!q) continue;
    if (q.conceptIds.some((cid) => topicConcepts.has(cid))) {
      distinct.add(a.questionId);
    }
  }
  return Math.min(mission.target, distinct.size);
}
