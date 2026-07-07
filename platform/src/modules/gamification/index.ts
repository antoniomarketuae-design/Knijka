/**
 * gamification module — public API (docs/architecture/05: modules talk only
 * via index.ts; docs/platform/36: gamification serves LEARNING — XP rewards
 * effort and mastery, streaks reward consistency, and there are NO dark
 * patterns: no loss-aversion nags, no pay-to-progress, no social pressure).
 *
 * State model (NO schema changes): the module owns the GamificationState row
 * (xp / level / streak / lastActiveDay / achievements Json). Everything else
 * is DERIVED read-only from QuestionAttempt / ExamAttempt / Progress, which
 * belong to the learning & exam modules.
 *
 * Flow: call sites report activity AFTER the owning module persisted it —
 *   practice: theory practice action, after learning's submitAnswer;
 *   exams:    exams action, after the exam module's submitExam.
 * Both go through trackActivity(), which never throws: a gamification bug
 * must never break answering questions or grading an exam.
 *
 * Idempotency: recordActivity is called exactly once per user action (no
 * retries at call sites), so per-event dedup is intentionally not implemented.
 * The two award paths that COULD double-fire are guarded anyway: achievements
 * by their earned-set, the daily-mission bonus by the "dm-<date>" marker.
 */

import { getContentRepo, type ContentRepo } from "@/lib/content/repo";
import {
  achievementDef,
  CORRECT_COUNT_ACHIEVEMENTS,
  EARLY_BIRD_END_HOUR,
  EXAM_EXCELLENT_SCORE,
  NIGHT_OWL_END_HOUR,
  STREAK_ACHIEVEMENTS,
  TOPIC_MASTERED_THRESHOLD,
} from "./definitions";
import {
  deriveMission,
  missionIdForDay,
  missionProgress,
  topicAvgMasteries,
} from "./mission";
import {
  getGamificationStore,
  type GamificationStateRow,
  type MasteryRow,
} from "./store";
import { applyStreak, effectiveStreak, isActiveToday } from "./streak";
import { sofiaDayString, sofiaHour } from "./time";
import type {
  DailyMission,
  EarnedAchievement,
  GamificationEvent,
  GamificationSummary,
  RecordActivityResult,
} from "./types";
import { levelForXp, XP_PER_LEVEL, xpForEvent } from "./xp";

// -- public re-exports --------------------------------------------------------

export { ACHIEVEMENTS } from "./definitions";
export { setGamificationStore, type GamificationStore } from "./store";
export { XP_PER_LEVEL, levelForXp } from "./xp";
export type {
  AchievementDef,
  AchievementIcon,
  DailyMission,
  EarnedAchievement,
  GamificationEvent,
  GamificationSummary,
  RecordActivityResult,
} from "./types";

/**
 * Mission progress only needs "today in Sofia"; fetching a 48h window is a
 * cheap superset that stays correct across any UTC↔Sofia offset and DST.
 */
const MISSION_LOOKBACK_MS = 48 * 60 * 60 * 1000;

const EMPTY_STATE: GamificationStateRow = {
  xp: 0,
  streak: 0,
  lastActiveDay: null,
  achievements: [],
};

// -- write path ----------------------------------------------------------------

/**
 * Record one learning activity: award XP, advance the streak, award any due
 * achievements and — when today's mission just crossed its target — the
 * mission bonus. One call per user action; call AFTER the activity row was
 * persisted by its owning module (the derived checks read those tables).
 */
export async function recordActivity(
  userId: string,
  event: GamificationEvent,
  now: Date = new Date(),
): Promise<RecordActivityResult> {
  const store = getGamificationStore();
  const prev = (await store.getState(userId)) ?? EMPTY_STATE;

  const levelBefore = levelForXp(prev.xp);
  let xpAwarded = xpForEvent(event);

  const streakState = applyStreak(
    { streak: prev.streak, lastActiveDay: prev.lastActiveDay },
    now,
  );

  // Mastery rows are needed by up to two checks — fetch at most once.
  let masteryRows: MasteryRow[] | null = null;
  const getMasteryOnce = async (): Promise<MasteryRow[]> =>
    (masteryRows ??= await store.getMastery(userId));

  // ---- achievements ---------------------------------------------------------
  const earned = new Set(prev.achievements.map((a) => a.id));
  const markers = [...prev.achievements];
  const newAchievements: EarnedAchievement[] = [];
  const award = (id: string): void => {
    const def = achievementDef(id);
    if (!def || earned.has(id)) return;
    earned.add(id);
    const earnedAt = now.toISOString();
    markers.push({ id, earnedAt });
    newAchievements.push({ ...def, earnedAt });
  };

  for (const s of STREAK_ACHIEVEMENTS) {
    if (streakState.streak >= s.days) award(s.id);
  }

  const hour = sofiaHour(now);
  if (hour < NIGHT_OWL_END_HOUR) award("night-owl");
  else if (hour < EARLY_BIRD_END_HOUR) award("early-bird");

  const repo = tryGetRepo();

  if (event.type === "practice_answer") {
    if (event.correct) {
      // The learning module persisted this attempt before the call, so the
      // lifetime count already includes it; max(1, ...) keeps
      // first-correct-answer robust even if it did not.
      const count = Math.max(1, await store.countCorrectAnswers(userId));
      for (const c of CORRECT_COUNT_ACHIEVEMENTS) {
        if (count >= c.count) award(c.id);
      }
    }
    // Lazy topic-mastered check (spec: on practice events only).
    if (!earned.has("topic-mastered") && repo) {
      const mastered = topicAvgMasteries(repo, await getMasteryOnce()).some(
        (t) => t.avgMastery >= TOPIC_MASTERED_THRESHOLD,
      );
      if (mastered) award("topic-mastered");
    }
  } else {
    award("first-exam");
    if (event.passed) award("first-passed-exam");
    if (event.score >= EXAM_EXCELLENT_SCORE) award("exam-90-plus");
  }

  // ---- daily mission (double-award guarded by the "dm-<date>" marker) --------
  let missionCompleted = false;
  const markerId = missionIdForDay(sofiaDayString(now));
  if (!earned.has(markerId) && repo) {
    const mission = deriveMission(userId, now, repo, await getMasteryOnce());
    const attempts = await store.getAttemptsSince(
      userId,
      new Date(now.getTime() - MISSION_LOOKBACK_MS),
    );
    if (missionProgress(mission, attempts, repo, now) >= mission.target) {
      earned.add(markerId);
      markers.push({ id: markerId, earnedAt: now.toISOString() });
      xpAwarded += mission.xpReward;
      missionCompleted = true;
    }
  }

  // ---- persist ---------------------------------------------------------------
  const totalXp = prev.xp + xpAwarded;
  const level = levelForXp(totalXp);
  await store.saveState(userId, {
    xp: totalXp,
    level,
    streak: streakState.streak,
    lastActiveDay: streakState.lastActiveDay,
    achievements: markers,
  });

  return {
    xpAwarded,
    totalXp,
    level,
    leveledUp: level > levelBefore,
    streak: streakState.streak,
    newAchievements,
    missionCompleted,
  };
}

/**
 * CALL-SITE HELPER — the single integration point for other modules' actions.
 * Fire-and-forget semantics: any gamification failure is logged and swallowed
 * so it can never break the practice or exam flow. Call it:
 *  1. in src/app/(dashboard)/theory/practice/actions.ts, right after
 *     `submitAnswer(...)` resolves;
 *  2. in src/app/(dashboard)/exams/actions.ts, right after
 *     `submitExam(...)` resolves.
 */
export async function trackActivity(
  userId: string,
  event: GamificationEvent,
): Promise<void> {
  try {
    await recordActivity(userId, event);
  } catch (err) {
    console.warn("gamification: recordActivity failed (flow unaffected)", err);
  }
}

// -- read path -----------------------------------------------------------------

/** XP / level / streak snapshot for the dashboard header. */
export async function getSummary(
  userId: string,
  now: Date = new Date(),
): Promise<GamificationSummary> {
  const state = (await getGamificationStore().getState(userId)) ?? EMPTY_STATE;
  const streakState = {
    streak: state.streak,
    lastActiveDay: state.lastActiveDay,
  };
  return {
    xp: state.xp,
    level: levelForXp(state.xp),
    xpIntoLevel: state.xp % XP_PER_LEVEL,
    xpForNextLevel: XP_PER_LEVEL,
    streakDays: effectiveStreak(streakState, now),
    streakActiveToday: isActiveToday(streakState, now),
  };
}

/**
 * Today's mission with live progress. Deterministic per (userId, Sofia day);
 * `completed` is true once the "dm-<date>" marker exists (bonus paid) or the
 * target is reached. Returns null only when content is unavailable.
 */
export async function getDailyMission(
  userId: string,
  now: Date = new Date(),
): Promise<DailyMission | null> {
  const repo = tryGetRepo();
  if (!repo) return null;

  const store = getGamificationStore();
  const [state, mastery, attempts] = await Promise.all([
    store.getState(userId),
    store.getMastery(userId),
    store.getAttemptsSince(userId, new Date(now.getTime() - MISSION_LOOKBACK_MS)),
  ]);

  const mission = deriveMission(userId, now, repo, mastery);
  const rewarded = (state ?? EMPTY_STATE).achievements.some(
    (a) => a.id === mission.id,
  );
  const progress = rewarded
    ? mission.target
    : missionProgress(mission, attempts, repo, now);

  return {
    id: mission.id,
    titleBg: mission.titleBg,
    descriptionBg: mission.descriptionBg,
    progress,
    target: mission.target,
    xpReward: mission.xpReward,
    completed: rewarded || progress >= mission.target,
  };
}

/**
 * The user's most recent achievements, newest first. Daily-mission markers
 * ("dm-<date>") and unknown ids are filtered out by design.
 */
export async function getRecentAchievements(
  userId: string,
  limit = 4,
): Promise<EarnedAchievement[]> {
  const state = await getGamificationStore().getState(userId);
  if (!state) return [];
  return state.achievements
    .flatMap((m) => {
      const def = achievementDef(m.id);
      return def ? [{ ...def, earnedAt: m.earnedAt }] : [];
    })
    .sort((a, b) => Date.parse(b.earnedAt) - Date.parse(a.earnedAt))
    .slice(0, Math.max(0, limit));
}

// -- internals -----------------------------------------------------------------

/**
 * Content repo, or null when not initialized (server entrypoints import
 * '@/lib/content/loader'; if a caller forgot, degrade gracefully instead of
 * failing the whole activity).
 */
function tryGetRepo(): ContentRepo | null {
  try {
    return getContentRepo();
  } catch {
    return null;
  }
}
