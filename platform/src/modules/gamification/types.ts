/**
 * Shared types of the gamification module.
 */

/** Activity events reported by call sites (practice + exam flows). */
export type GamificationEvent =
  | {
      type: "practice_answer";
      correct: boolean;
      /** The question's official weight (1|2|3), NOT points earned. */
      points: number;
    }
  | {
      type: "exam_completed";
      passed: boolean;
      /** Final exam score, 0..97. */
      score: number;
    };

/** One entry of the GamificationState.achievements Json array. */
export interface AchievementMarker {
  id: string;
  /** ISO timestamp. */
  earnedAt: string;
}

export type AchievementIcon =
  | "medal"
  | "flame"
  | "bolt"
  | "shield"
  | "star"
  | "trophy";

export interface AchievementDef {
  id: string;
  titleBg: string;
  descriptionBg: string;
  icon: AchievementIcon;
}

/** An achievement definition joined with when the user earned it. */
export interface EarnedAchievement extends AchievementDef {
  /** ISO timestamp. */
  earnedAt: string;
}

export interface GamificationSummary {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  /** Effective streak: 0 if the chain is already broken as of `now`. */
  streakDays: number;
  streakActiveToday: boolean;
}

export interface DailyMission {
  /** "dm-YYYY-MM-DD" — doubles as the double-award guard marker id. */
  id: string;
  titleBg: string;
  descriptionBg: string;
  progress: number;
  target: number;
  xpReward: number;
  completed: boolean;
}

export interface RecordActivityResult {
  /** XP granted by THIS call (event XP + mission bonus if just completed). */
  xpAwarded: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  streak: number;
  /** Achievements earned by THIS call, in award order. */
  newAchievements: EarnedAchievement[];
  /** True when the daily-mission bonus was granted by THIS call. */
  missionCompleted: boolean;
}
