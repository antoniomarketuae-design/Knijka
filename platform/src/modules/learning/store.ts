/**
 * Persistence boundary for the learning module.
 *
 * ALL Prisma access is isolated here behind the LearningStore interface so the
 * rest of the module stays pure and unit tests inject an in-memory fake via
 * setLearningStore() (mirroring setContentRepo() in @/lib/content/repo).
 *
 * The Prisma client is imported lazily inside the default store so importing
 * this file (e.g. from unit tests) never requires DATABASE_URL.
 */

export interface ProgressRow {
  conceptId: string;
  /** 0..1 (see mastery.ts) */
  mastery: number;
  /** Consecutive successful reviews (see scheduler.ts) */
  reps: number;
  /** Total wrong answers for this concept */
  lapses: number;
  /** Next review; null = never scheduled */
  dueAt: Date | null;
  /** Last write — used as the recency signal by readiness.ts */
  updatedAt: Date;
}

export interface ProgressUpdate {
  conceptId: string;
  mastery: number;
  reps: number;
  lapses: number;
  dueAt: Date | null;
}

export interface AttemptRecord {
  questionId: string;
  context: "practice" | "micro";
  correct: boolean;
  /** Official point weight of the question (1|2|3), not points earned. */
  points: number;
  answeredAt: Date;
}

export interface LearningStore {
  /** All Progress rows for a user. */
  getProgress(userId: string): Promise<ProgressRow[]>;
  /** Distinct question ids answered CORRECTLY at/after `since` (any context). */
  getCorrectlyAnsweredSince(userId: string, since: Date): Promise<string[]>;
  /**
   * Persist one QuestionAttempt plus its per-concept Progress upserts
   * atomically (single transaction).
   */
  recordAnswer(
    userId: string,
    attempt: AttemptRecord,
    updates: ProgressUpdate[],
  ): Promise<void>;
  /**
   * Progress-only upserts (no QuestionAttempt) — used by the exam mastery
   * feed, where the exam module already owns the attempt rows.
   */
  upsertProgress(userId: string, updates: ProgressUpdate[]): Promise<void>;
}

function createPrismaStore(): LearningStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async getProgress(userId) {
      const db = await getDb();
      const rows = await db.progress.findMany({ where: { userId } });
      return rows.map((r) => ({
        conceptId: r.conceptId,
        mastery: r.mastery,
        reps: r.reps,
        lapses: r.lapses,
        dueAt: r.dueAt,
        updatedAt: r.updatedAt,
      }));
    },

    async getCorrectlyAnsweredSince(userId, since) {
      const db = await getDb();
      const rows = await db.questionAttempt.findMany({
        where: { userId, correct: true, answeredAt: { gte: since } },
        select: { questionId: true },
      });
      return [...new Set(rows.map((r) => r.questionId))];
    },

    async upsertProgress(userId, updates) {
      const db = await getDb();
      await db.$transaction(
        updates.map((u) =>
          db.progress.upsert({
            where: { userId_conceptId: { userId, conceptId: u.conceptId } },
            create: {
              userId,
              conceptId: u.conceptId,
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
            update: {
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
          }),
        ),
      );
    },

    async recordAnswer(userId, attempt, updates) {
      const db = await getDb();
      await db.$transaction([
        db.questionAttempt.create({
          data: {
            userId,
            questionId: attempt.questionId,
            context: attempt.context,
            correct: attempt.correct,
            points: attempt.points,
            answeredAt: attempt.answeredAt,
          },
        }),
        ...updates.map((u) =>
          db.progress.upsert({
            where: { userId_conceptId: { userId, conceptId: u.conceptId } },
            create: {
              userId,
              conceptId: u.conceptId,
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
            update: {
              mastery: u.mastery,
              reps: u.reps,
              lapses: u.lapses,
              dueAt: u.dueAt,
            },
          }),
        ),
      ]);
    },
  };
}

let store: LearningStore | null = null;

/** Test suites inject an in-memory fake here (see fixtures.ts). */
export function setLearningStore(s: LearningStore): void {
  store = s;
}

export function getLearningStore(): LearningStore {
  if (!store) {
    store = createPrismaStore();
  }
  return store;
}
