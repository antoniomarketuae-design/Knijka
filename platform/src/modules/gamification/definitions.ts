/**
 * Achievement definitions v1 — the single source of truth (docs/platform/36).
 *
 * Every achievement rewards a LEARNING milestone (breadth, persistence,
 * mastery) — never raw screen time, purchases or social pressure. The user's
 * earned set lives in GamificationState.achievements as [{id, earnedAt}];
 * ids not present here (e.g. the "dm-<date>" daily-mission markers) are
 * ignored by every read path.
 */

import type { AchievementDef } from "./types";

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  {
    id: "first-correct-answer",
    titleBg: "Първи верен отговор",
    descriptionBg: "Отговори правилно на първия си въпрос.",
    icon: "medal",
  },
  {
    id: "50-correct",
    titleBg: "50 верни отговора",
    descriptionBg: "Отговори правилно на 50 въпроса общо.",
    icon: "star",
  },
  {
    id: "200-correct",
    titleBg: "200 верни отговора",
    descriptionBg: "Отговори правилно на 200 въпроса общо.",
    icon: "trophy",
  },
  {
    id: "first-exam",
    titleBg: "Първи пробен изпит",
    descriptionBg: "Завърши първия си пробен изпит.",
    icon: "shield",
  },
  {
    id: "first-passed-exam",
    titleBg: "Първи успешен изпит",
    descriptionBg: "Вземи пробен изпит с 87 или повече точки.",
    icon: "trophy",
  },
  {
    id: "exam-90-plus",
    titleBg: "Отличен резултат",
    descriptionBg: "Завърши пробен изпит с 90 или повече точки.",
    icon: "bolt",
  },
  {
    id: "streak-3",
    titleBg: "3 дни поред",
    descriptionBg: "Учи три последователни дни.",
    icon: "flame",
  },
  {
    id: "streak-7",
    titleBg: "Седмица без пропуск",
    descriptionBg: "Учи седем последователни дни.",
    icon: "flame",
  },
  {
    id: "streak-30",
    titleBg: "Месец постоянство",
    descriptionBg: "Учи тридесет последователни дни.",
    icon: "flame",
  },
  {
    id: "topic-mastered",
    titleBg: "Овладяна тема",
    descriptionBg: "Достигни 90% усвояване на цяла тема.",
    icon: "star",
  },
  {
    id: "night-owl",
    titleBg: "Нощна птица",
    descriptionBg: "Учи между полунощ и 5:00 сутринта.",
    icon: "bolt",
  },
  {
    id: "early-bird",
    titleBg: "Ранно пиле",
    descriptionBg: "Учи преди 8:00 сутринта.",
    icon: "medal",
  },
];

const byId = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function achievementDef(id: string): AchievementDef | undefined {
  return byId.get(id);
}

/** Streak lengths that unlock an achievement, mapped to their ids. */
export const STREAK_ACHIEVEMENTS: ReadonlyArray<{ days: number; id: string }> =
  [
    { days: 3, id: "streak-3" },
    { days: 7, id: "streak-7" },
    { days: 30, id: "streak-30" },
  ];

/** Total-correct-answer counts that unlock an achievement. */
export const CORRECT_COUNT_ACHIEVEMENTS: ReadonlyArray<{
  count: number;
  id: string;
}> = [
  { count: 1, id: "first-correct-answer" },
  { count: 50, id: "50-correct" },
  { count: 200, id: "200-correct" },
];

/** A topic counts as mastered at this average mastery (0..1). */
export const TOPIC_MASTERED_THRESHOLD = 0.9;

/** exam-90-plus triggers at this score. */
export const EXAM_EXCELLENT_SCORE = 90;

/** night-owl: Sofia hour in [0, NIGHT_OWL_END). */
export const NIGHT_OWL_END_HOUR = 5;
/** early-bird: Sofia hour in [NIGHT_OWL_END, EARLY_BIRD_END). */
export const EARLY_BIRD_END_HOUR = 8;
