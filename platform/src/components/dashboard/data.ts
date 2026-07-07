import "@/lib/content/loader";
import {
  getReadiness as learningGetReadiness,
  getTopicOverview as learningGetTopicOverview,
} from "@/modules/learning";
import { requireUser } from "@/modules/auth";
import {
  getSummary as gamificationGetSummary,
  getDailyMission as gamificationGetDailyMission,
  getRecentAchievements as gamificationGetRecentAchievements,
} from "@/modules/gamification";
import type { Topic } from "@/lib/content/types";

/* ============================================================================
 * DASHBOARD DATA LAYER (server-only)
 * ============================================================================
 * Readiness, topic overview, profile and continue-lesson are REAL (learning +
 * auth modules). Gamification (XP/level/streak, daily mission, achievements)
 * is served by the gamification module; XP is awarded by trackActivity()
 * call sites in the practice and exam actions.
 * Components import ONLY types from this file (`import type`), so the server
 * imports above never reach the client bundle.
 * ========================================================================== */

/* ----------------------------------------------------------------- types */

export type TopicRef = Pick<Topic, "id" | "order" | "titleBg">;

/** Per-topic mastery, 0..1 — produced by the learning module's mastery model. */
export interface TopicMastery {
  topic: TopicRef;
  /** 0..1 aggregated concept mastery within the topic. */
  mastery: number;
  /** Concepts with at least one recorded answer (activity signal). */
  questionsSeen: number;
}

export interface WeakConcept {
  conceptId: string;
  titleBg: string;
  topicId: string;
  /** 0..1 */
  mastery: number;
}

export interface ReadinessSnapshot {
  /** 0..100 predicted exam readiness. */
  score: number;
  perTopic: TopicMastery[];
  weakestConcepts: WeakConcept[];
}

export interface TopicOverview {
  topics: Array<{
    topic: TopicRef;
    conceptsTotal: number;
    conceptsStarted: number;
    conceptsMastered: number;
  }>;
}

export interface GamificationSummary {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streakDays: number;
  streakActiveToday: boolean;
}

export interface DailyMission {
  id: string;
  titleBg: string;
  descriptionBg: string;
  progress: number;
  target: number;
  xpReward: number;
  completed: boolean;
}

export interface Achievement {
  id: string;
  titleBg: string;
  descriptionBg: string;
  icon: "medal" | "flame" | "bolt" | "shield" | "star" | "trophy";
  earnedAt: string; // ISO date
}

export interface ContinueLesson {
  topic: TopicRef;
  conceptTitleBg: string;
  /** 0..100 coverage of the topic's concepts. */
  progressPct: number;
  href: string;
}

export interface StudentProfile {
  firstName: string;
}

/* ------------------------------------------------------------- real API */

export async function getStudentProfile(): Promise<StudentProfile> {
  const user = await requireUser();
  const first = (user.name ?? "").trim().split(/\s+/)[0];
  return { firstName: first || "шофьор" };
}

export async function getReadiness(): Promise<ReadinessSnapshot> {
  const user = await requireUser();
  const [readiness, overview] = await Promise.all([
    learningGetReadiness(user.id),
    learningGetTopicOverview(user.id),
  ]);
  const byTopic = new Map(overview.map((t) => [t.topicId, t]));

  return {
    score: readiness.score,
    perTopic: readiness.perTopic.map((p) => {
      const t = byTopic.get(p.topicId);
      return {
        topic: {
          id: p.topicId,
          order: t?.order ?? 0,
          titleBg: t?.titleBg ?? p.topicId,
        },
        mastery: p.score / 100,
        questionsSeen: t?.seenConceptCount ?? 0,
      };
    }),
    weakestConcepts: readiness.weakestConcepts.map((c) => ({
      conceptId: c.conceptId,
      titleBg: c.titleBg,
      topicId: c.topicId,
      mastery: c.effectiveMastery,
    })),
  };
}

export async function getTopicOverview(): Promise<TopicOverview> {
  const user = await requireUser();
  const overview = await learningGetTopicOverview(user.id);
  return {
    topics: overview.map((t) => ({
      topic: { id: t.topicId, order: t.order, titleBg: t.titleBg },
      conceptsTotal: t.conceptCount,
      conceptsStarted: t.seenConceptCount,
      conceptsMastered: Math.round(t.conceptCount * t.avgMastery),
    })),
  };
}

export async function getContinueLesson(): Promise<ContinueLesson | null> {
  const user = await requireUser();
  const [overview, readiness] = await Promise.all([
    learningGetTopicOverview(user.id),
    learningGetReadiness(user.id),
  ]);

  const started = overview.filter((t) => t.seenConceptCount > 0);
  if (started.length === 0) return null;

  const weakest = [...started].sort((a, b) => a.avgMastery - b.avgMastery)[0]!;
  const weakConcept = readiness.weakestConcepts.find(
    (c) => c.topicId === weakest.topicId,
  );

  return {
    topic: { id: weakest.topicId, order: weakest.order, titleBg: weakest.titleBg },
    conceptTitleBg: weakConcept?.titleBg ?? weakest.titleBg,
    progressPct: Math.round(weakest.coverage * 100),
    href: "/theory",
  };
}

export async function getGamification(): Promise<GamificationSummary> {
  const user = await requireUser();
  // Level math (1 + floor(xp/400)) and Sofia-day streak logic live in the
  // gamification module; the summary shape matches 1:1.
  return gamificationGetSummary(user.id);
}

/** Deterministic per (user, Sofia day); progress derived from today's attempts. */
export async function getDailyMission(): Promise<DailyMission | null> {
  const user = await requireUser();
  return gamificationGetDailyMission(user.id);
}

/** Newest 4 earned achievements (daily-mission markers filtered out). */
export async function getRecentAchievements(): Promise<Achievement[]> {
  const user = await requireUser();
  const recent = await gamificationGetRecentAchievements(user.id, 4);
  return recent.map((a) => ({
    id: a.id,
    titleBg: a.titleBg,
    descriptionBg: a.descriptionBg,
    icon: a.icon,
    earnedAt: a.earnedAt,
  }));
}
