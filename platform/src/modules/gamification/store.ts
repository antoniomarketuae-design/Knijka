/**
 * Persistence boundary for the gamification module.
 *
 * ALL Prisma access is isolated behind the GamificationStore interface (same
 * pattern as modules/learning/store.ts and modules/exam/store.ts) so the rest
 * of the module stays pure and unit tests inject an in-memory fake via
 * setGamificationStore(). The Prisma client is imported LAZILY inside the
 * default store, so importing this file never requires DATABASE_URL.
 *
 * The module WRITES only GamificationState; everything else (attempt counts,
 * today's activity, per-concept mastery) is DERIVED read-only from the tables
 * owned by the learning/exam modules — no schema changes (see task contract).
 */

import { invalidateRequestScoped, requestScoped } from "@/lib/requestScope";
import type { AchievementMarker } from "./types";

export interface GamificationStateRow {
  xp: number;
  streak: number;
  lastActiveDay: Date | null;
  achievements: AchievementMarker[];
}

export interface StateWrite {
  xp: number;
  /** Denormalized 1 + floor(xp/400); kept in sync on every write. */
  level: number;
  streak: number;
  lastActiveDay: Date | null;
  achievements: AchievementMarker[];
}

/** Read-only slice of a QuestionAttempt row (any context). */
export interface AttemptRow {
  questionId: string;
  context: string;
  correct: boolean;
  answeredAt: Date;
}

/** Read-only slice of a Progress row (per-concept mastery). */
export interface MasteryRow {
  conceptId: string;
  /** 0..1 */
  mastery: number;
}

export interface GamificationStore {
  /** null = user has no GamificationState row yet. */
  getState(userId: string): Promise<GamificationStateRow | null>;
  /** Upsert the user's GamificationState. */
  saveState(userId: string, state: StateWrite): Promise<void>;
  /** Lifetime count of correct QuestionAttempts (any context). */
  countCorrectAnswers(userId: string): Promise<number>;
  /** QuestionAttempts at/after `since` (any context), for daily missions. */
  getAttemptsSince(userId: string, since: Date): Promise<AttemptRow[]>;
  /** All Progress rows of the user, for the topic-mastered check. */
  getMastery(userId: string): Promise<MasteryRow[]>;
}

// ---------------------------------------------------------------------------
// Json (de)serialization for the achievements column
// ---------------------------------------------------------------------------

/** Parse the achievements Json column defensively — never trust stored Json. */
export function parseAchievements(value: unknown): AchievementMarker[] {
  if (!Array.isArray(value)) return [];
  const out: AchievementMarker[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    if (typeof m.id !== "string" || typeof m.earnedAt !== "string") continue;
    out.push({ id: m.id, earnedAt: m.earnedAt });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

function createPrismaStore(): GamificationStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async getState(userId) {
      const db = await getDb();
      const row = await db.gamificationState.findUnique({ where: { userId } });
      if (!row) return null;
      return {
        xp: row.xp,
        streak: row.streak,
        lastActiveDay: row.lastActiveDay,
        achievements: parseAchievements(row.achievements),
      };
    },

    async saveState(userId, state) {
      const db = await getDb();
      // AchievementMarker[] is plain {id, earnedAt} objects — valid Json.
      const achievements = state.achievements.map((a) => ({
        id: a.id,
        earnedAt: a.earnedAt,
      }));
      const data = {
        xp: state.xp,
        level: state.level,
        streak: state.streak,
        lastActiveDay: state.lastActiveDay,
        achievements,
      };
      await db.gamificationState.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      });
    },

    async countCorrectAnswers(userId) {
      const db = await getDb();
      return db.questionAttempt.count({ where: { userId, correct: true } });
    },

    async getAttemptsSince(userId, since) {
      const db = await getDb();
      const rows = await db.questionAttempt.findMany({
        where: { userId, answeredAt: { gte: since } },
        select: {
          questionId: true,
          context: true,
          correct: true,
          answeredAt: true,
        },
      });
      return rows;
    },

    async getMastery(userId) {
      const db = await getDb();
      const rows = await db.progress.findMany({
        where: { userId },
        select: { conceptId: true, mastery: true },
      });
      return rows;
    },
  };
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: GamificationStore | null = null;

/** Tests inject an in-memory fake here (see fixtures.ts). */
export function setGamificationStore(s: GamificationStore | null): void {
  store = s;
}

/** The store as injected — the fake in tests, the Prisma one in production. */
function rawStore(): GamificationStore {
  if (!store) store = createPrismaStore();
  return store;
}

/**
 * Request-scope key for the user's GamificationState row.
 *
 * The dashboard asks for that ONE row three times in a single render:
 * getSummary (the XP bar), getDailyMission (has today's bonus already been
 * paid?) and getRecentAchievements (the medals). Nothing in a GET writes the
 * table, so all three are asking the same question at the same instant.
 */
const STATE_SCOPE = "gamification.state";

const readState = requestScoped(
  STATE_SCOPE,
  (userId: string): Promise<GamificationStateRow | null> =>
    rawStore().getState(userId),
);

/**
 * The store every caller gets: the injected one, with the state read deduped
 * per request.
 *
 * The memo sits ABOVE the injection seam rather than inside the Prisma store —
 * same layer readiness.ts memoises the learning store at — so it is the store
 * CONTRACT that guarantees one read per request, not one implementation of it.
 * Outside a request scope it degrades to a plain call (lib/requestScope.ts), so
 * a unit test driving the fake still sees every call it makes.
 */
const scopedStore: GamificationStore = {
  getState: (userId) => readState(userId),

  async saveState(userId, state) {
    await rawStore().saveState(userId, state);
    // recordActivity reads this row, awards XP and writes it back — and the
    // simulator's finish action reports activity and then renders the new
    // total in the same request. Evicting here is what stops that later read
    // from being served the pre-award row.
    invalidateRequestScoped(STATE_SCOPE, userId);
  },

  countCorrectAnswers: (userId) => rawStore().countCorrectAnswers(userId),
  getAttemptsSince: (userId, since) => rawStore().getAttemptsSince(userId, since),
  getMastery: (userId) => rawStore().getMastery(userId),
};

export function getGamificationStore(): GamificationStore {
  return scopedStore;
}
