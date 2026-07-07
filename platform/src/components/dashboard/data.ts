import type { Topic } from "@/lib/content/types";

/* ============================================================================
 * MOCK DATA LAYER — THE SINGLE SWAP POINT FOR REAL MODULE APIs
 * ============================================================================
 * This file mirrors the public contracts of the real modules
 * (platform/src/modules/<name>/index.ts, docs/architecture/05):
 *
 *   analytics.getReadiness(userId)        → getReadiness()
 *   learning.getTopicOverview(userId)     → getTopicOverview()
 *   learning.getContinueLesson(userId)    → getContinueLesson()
 *   gamification.getState(userId)         → getGamification()
 *   gamification.getDailyMission(userId)  → getDailyMission()
 *   gamification.getAchievements(userId)  → getRecentAchievements()
 *
 * When the modules land, replace ONLY the function bodies below (keep the
 * signatures and types) — every dashboard component consumes this file and
 * nothing else. All functions are async to match the future server APIs;
 * a small artificial latency keeps loading states honest during development.
 *
 * Topic ids/titles are copied verbatim from content/topics.json so the UI
 * renders the real curriculum. Once lib/content/loader.ts exists, source
 * them from getContentRepo().topics() instead.
 * ========================================================================== */

/** Simulated network/DB latency (ms) so loading skeletons stay visible. */
const MOCK_LATENCY_MS = 350;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) =>
    setTimeout(() => resolve(value), MOCK_LATENCY_MS),
  );
}

/* ----------------------------------------------------------------- types */

export type TopicRef = Pick<Topic, "id" | "order" | "titleBg">;

/** Per-topic mastery, 0..1 — produced by the learning module's mastery model. */
export interface TopicMastery {
  topic: TopicRef;
  /** 0..1 aggregated concept mastery within the topic. */
  mastery: number;
  questionsSeen: number;
}

export interface WeakConcept {
  conceptId: string;
  titleBg: string;
  topicId: string;
  /** 0..1 */
  mastery: number;
}

/** analytics.getReadiness — readiness score v1 (docs/architecture/05). */
export interface ReadinessSnapshot {
  /** 0..100 predicted exam readiness. */
  score: number;
  perTopic: TopicMastery[];
  weakestConcepts: WeakConcept[];
}

/** learning.getTopicOverview — curriculum progress per topic. */
export interface TopicOverview {
  topics: Array<{
    topic: TopicRef;
    conceptsTotal: number;
    conceptsStarted: number;
    conceptsMastered: number;
  }>;
}

/** gamification.getState — mirrors Prisma GamificationState (xp/level/streak). */
export interface GamificationSummary {
  xp: number;
  level: number;
  /** XP accumulated inside the current level. */
  xpIntoLevel: number;
  /** XP needed to reach the next level (total for the level). */
  xpForNextLevel: number;
  /** Consecutive active days. */
  streakDays: number;
  /** Whether today already counts towards the streak. */
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
  /** Icon key resolved by the UI — keeps the contract presentation-free. */
  icon: "medal" | "flame" | "bolt" | "shield" | "star" | "trophy";
  earnedAt: string; // ISO date
}

/** learning.getContinueLesson — null until the user starts the curriculum. */
export interface ContinueLesson {
  topic: TopicRef;
  conceptTitleBg: string;
  /** 0..100 progress through the current topic's practice set. */
  progressPct: number;
  href: string;
}

/** The logged-in student (auth module). Mocked until auth wiring. */
export interface StudentProfile {
  firstName: string;
}

/* ------------------------------------------------------ mock topic table */

/** Verbatim from content/topics.json (id, order, titleBg). */
const TOPICS: TopicRef[] = [
  { id: "t-basics", order: 1, titleBg: "Основни понятия и задължения" },
  { id: "t-vehicle", order: 2, titleBg: "Автомобилът и подготовката за път" },
  { id: "t-signs", order: 3, titleBg: "Пътни знаци" },
  { id: "t-signals-markings", order: 4, titleBg: "Светофари, маркировка и регулировчик" },
  { id: "t-priority", order: 5, titleBg: "Предимство" },
  { id: "t-junctions", order: 6, titleBg: "Кръстовища, кръгови движения и жп прелези" },
  { id: "t-speed", order: 7, titleBg: "Скорост и дистанция" },
  { id: "t-maneuvers", order: 8, titleBg: "Маневри, ленти и изпреварване" },
  { id: "t-vulnerable", order: 9, titleBg: "Пешеходци и уязвими участници" },
  { id: "t-roads", order: 10, titleBg: "Магистрали и извънградски пътища" },
  { id: "t-parking", order: 11, titleBg: "Спиране, престой и паркиране" },
  { id: "t-conditions", order: 12, titleBg: "Нощно шофиране и усложнени условия" },
  { id: "t-fitness", order: 13, titleBg: "Алкохол, умора и годност за шофиране" },
  { id: "t-admin", order: 14, titleBg: "Документи, нарушения и санкции" },
  { id: "t-accidents", order: 15, titleBg: "ПТП и първа помощ" },
  { id: "t-eco-defensive", order: 16, titleBg: "Икономично и защитно шофиране" },
];

/** Mock mastery per topic id — realistic mid-course spread. */
const MASTERY: Record<string, { mastery: number; seen: number }> = {
  "t-basics": { mastery: 0.92, seen: 64 },
  "t-vehicle": { mastery: 0.81, seen: 48 },
  "t-signs": { mastery: 0.74, seen: 112 },
  "t-signals-markings": { mastery: 0.68, seen: 57 },
  "t-priority": { mastery: 0.44, seen: 39 },
  "t-junctions": { mastery: 0.38, seen: 31 },
  "t-speed": { mastery: 0.66, seen: 42 },
  "t-maneuvers": { mastery: 0.52, seen: 35 },
  "t-vulnerable": { mastery: 0.71, seen: 28 },
  "t-roads": { mastery: 0.33, seen: 18 },
  "t-parking": { mastery: 0.58, seen: 26 },
  "t-conditions": { mastery: 0.29, seen: 12 },
  "t-fitness": { mastery: 0.83, seen: 22 },
  "t-admin": { mastery: 0.21, seen: 9 },
  "t-accidents": { mastery: 0.12, seen: 4 },
  "t-eco-defensive": { mastery: 0, seen: 0 },
};

/* ------------------------------------------------------------- mock API */

export async function getStudentProfile(): Promise<StudentProfile> {
  return delay({ firstName: "Алекс" });
}

export async function getReadiness(): Promise<ReadinessSnapshot> {
  const perTopic: TopicMastery[] = TOPICS.map((topic) => ({
    topic,
    mastery: MASTERY[topic.id]?.mastery ?? 0,
    questionsSeen: MASTERY[topic.id]?.seen ?? 0,
  }));

  return delay({
    score: 58,
    perTopic,
    weakestConcepts: [
      {
        conceptId: "c-right-hand-rule",
        titleBg: "Правило на дясното",
        topicId: "t-priority",
        mastery: 0.31,
      },
      {
        conceptId: "c-rail-crossing",
        titleBg: "Преминаване през жп прелез",
        topicId: "t-junctions",
        mastery: 0.27,
      },
      {
        conceptId: "c-control-points",
        titleBg: "Контролни точки и санкции",
        topicId: "t-admin",
        mastery: 0.18,
      },
    ],
  });
}

export async function getTopicOverview(): Promise<TopicOverview> {
  return delay({
    topics: TOPICS.map((topic) => {
      const m = MASTERY[topic.id] ?? { mastery: 0, seen: 0 };
      const conceptsTotal = 8;
      return {
        topic,
        conceptsTotal,
        conceptsStarted: Math.min(conceptsTotal, Math.ceil(m.seen / 6)),
        conceptsMastered: Math.round(conceptsTotal * m.mastery),
      };
    }),
  });
}

export async function getGamification(): Promise<GamificationSummary> {
  return delay({
    xp: 2380,
    level: 7,
    xpIntoLevel: 180,
    xpForNextLevel: 400,
    streakDays: 12,
    streakActiveToday: true,
  });
}

export async function getDailyMission(): Promise<DailyMission | null> {
  return delay({
    id: "dm-2026-07-07",
    titleBg: "Дневна мисия",
    descriptionBg: "Реши 10 въпроса от „Предимство“ — най-слабата ти тема.",
    progress: 4,
    target: 10,
    xpReward: 50,
    completed: false,
  });
}

export async function getRecentAchievements(): Promise<Achievement[]> {
  return delay([
    {
      id: "a-streak-7",
      titleBg: "Седмица без пропуск",
      descriptionBg: "7 поредни дни активно учене.",
      icon: "flame",
      earnedAt: "2026-07-02",
    },
    {
      id: "a-signs-50",
      titleBg: "Познавач на знаците",
      descriptionBg: "50 верни отговора за пътни знаци.",
      icon: "shield",
      earnedAt: "2026-06-29",
    },
    {
      id: "a-first-exam",
      titleBg: "Първи пробен изпит",
      descriptionBg: "Завърши първия си изпит в официален формат.",
      icon: "medal",
      earnedAt: "2026-06-25",
    },
    {
      id: "a-level-5",
      titleBg: "Ниво 5",
      descriptionBg: "Достигна ниво 5 в академията.",
      icon: "bolt",
      earnedAt: "2026-06-20",
    },
  ] satisfies Achievement[]);
}

export async function getContinueLesson(): Promise<ContinueLesson | null> {
  return delay({
    topic: TOPICS[4], // t-priority
    conceptTitleBg: "Завой наляво срещу насрещно движение",
    progressPct: 62,
    href: "/theory",
  });
}
