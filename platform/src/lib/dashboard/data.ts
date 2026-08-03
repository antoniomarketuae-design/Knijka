import "@/lib/content/loader";
import { getContentRepo } from "@/lib/content/repo";
import {
  getReadiness as learningGetReadiness,
  getSimWeakSpots as learningGetSimWeakSpots,
  getTopicOverview as learningGetTopicOverview,
} from "@/modules/learning";
import { requireUser } from "@/modules/auth";
import {
  getSummary as gamificationGetSummary,
  getDailyMission as gamificationGetDailyMission,
  getRecentAchievements as gamificationGetRecentAchievements,
} from "@/modules/gamification";
import { requestScoped } from "@/lib/requestScope";
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
  /** Topic-scoped practice when the slug resolves, the theory hub otherwise. */
  href: string;
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
  /** Server-resolved role flag — renders the tiny „админ" badge. */
  isAdmin: boolean;
}

/** One „sim weak spot" — a concept the driver keeps violating on the road. */
export interface SimWeakSpotView {
  conceptId: string;
  titleBg: string;
  violationCount: number;
  worstSeverity: "opasna" | "osnovna" | "vtorostepenna";
  /** Targeted theory practice for the concept's topic. */
  href: string;
}

export interface SimWeakSpotsSnapshot {
  /** False until the user has driven recently — the card hides itself. */
  hasRecentEvidence: boolean;
  /** Worst first, at most 3. Empty + hasRecentEvidence = clean driving. */
  spots: SimWeakSpotView[];
}

/* ------------------------------------------------- request-scoped reads */
/*
 * The page renders these functions in one Promise.all, and two pairs of them
 * want the same answer: getReadiness and getContinueLesson both need the
 * readiness snapshot AND the topic overview. Sharing them here is not only a
 * query saved — the readiness snapshot is a fold over every concept in the
 * content repo, and getContinueLesson used to run that whole computation a
 * second time to read ONE title out of it.
 */

const readReadiness = requestScoped("dashboard.readiness", (userId: string) =>
  learningGetReadiness(userId),
);

const readTopicOverview = requestScoped(
  "dashboard.topicOverview",
  (userId: string) => learningGetTopicOverview(userId),
);

/* ------------------------------------------------------------- real API */

export async function getStudentProfile(): Promise<StudentProfile> {
  const user = await requireUser();
  const first = (user.name ?? "").trim().split(/\s+/)[0];
  return { firstName: first || "шофьор", isAdmin: user.isAdmin };
}

export async function getReadiness(): Promise<ReadinessSnapshot> {
  const user = await requireUser();
  const [readiness, overview] = await Promise.all([
    readReadiness(user.id),
    readTopicOverview(user.id),
  ]);
  const byTopic = new Map(overview.map((t) => [t.topicId, t]));
  // Same routing rule as getSimWeakSpots: resolve the concept's topic slug so
  // the „Препоръчано за упражнение" chips start topic-scoped practice.
  const slugByTopicId = new Map(
    getContentRepo()
      .topics()
      .map((t) => [t.id, t.slug]),
  );

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
    weakestConcepts: readiness.weakestConcepts.map((c) => {
      const slug = slugByTopicId.get(c.topicId);
      return {
        conceptId: c.conceptId,
        titleBg: c.titleBg,
        topicId: c.topicId,
        mastery: c.effectiveMastery,
        href: slug ? `/theory/practice?topic=${slug}` : "/theory",
      };
    }),
  };
}

export async function getTopicOverview(): Promise<TopicOverview> {
  const user = await requireUser();
  const overview = await readTopicOverview(user.id);
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

  // The overview alone decides WHICH topic to continue; readiness is consulted
  // for one thing only — the name of the weakest concept inside it. So take
  // the overview first and bail before touching readiness at all when the
  // student has not started anything: a brand-new account used to compute a
  // full concept-by-concept readiness fold in order to return null.
  const overview = await readTopicOverview(user.id);
  const started = overview.filter((t) => t.seenConceptCount > 0);
  if (started.length === 0) return null;

  const weakest = [...started].sort((a, b) => a.avgMastery - b.avgMastery)[0]!;
  // Shared with getReadiness above (request-scoped): the snapshot the ring is
  // already rendering, not a second one computed to read a single title.
  const readiness = await readReadiness(user.id);
  const weakConcept = readiness.weakestConcepts.find(
    (c) => c.topicId === weakest.topicId,
  );

  return {
    topic: { id: weakest.topicId, order: weakest.order, titleBg: weakest.titleBg },
    conceptTitleBg: weakConcept?.titleBg ?? weakest.titleBg,
    progressPct: Math.round(weakest.coverage * 100),
    // Straight into a session scoped to the weakest started topic — the hero
    // CTA drops the student into the right practice, not the generic hub.
    href: `/theory/practice?topic=${weakest.slug}`,
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

/** Concepts with the worst recent sim evidence (learning module, A14). */
export async function getSimWeakSpots(): Promise<SimWeakSpotsSnapshot> {
  const user = await requireUser();
  const result = await learningGetSimWeakSpots(user.id, 3);
  return {
    hasRecentEvidence: result.hasRecentEvidence,
    spots: result.spots.map((s) => ({
      conceptId: s.conceptId,
      titleBg: s.titleBg,
      violationCount: s.violationCount,
      worstSeverity: s.worstSeverity,
      // Same routing rule as the simulator debrief links: topic-scoped
      // practice when the slug resolves, the theory hub otherwise.
      href: s.topicSlug ? `/theory/practice?topic=${s.topicSlug}` : "/theory",
    })),
  };
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
