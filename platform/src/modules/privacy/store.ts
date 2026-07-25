/**
 * Persistence boundary of the privacy module (same pattern as
 * @/modules/payments and @/modules/learning): all Prisma access lives here,
 * the rest of the module is pure and unit-testable through setPrivacyStore().
 *
 * Two rules this file exists to enforce:
 *
 * 1. EVERY read is scoped by `userId`. A data export that accidentally widened
 *    a `where` clause would be a personal-data breach, not a bug — so the
 *    filter is written once, here, and nowhere else.
 * 2. Erasure deletes child rows EXPLICITLY, in FK-safe order, inside one
 *    transaction — even though schema.prisma marks every relation
 *    `onDelete: Cascade` and Postgres would do it for us. Reasons: the delete
 *    counts become the erasure receipt (Art. 17 confirmation), the behaviour
 *    no longer depends on a migration having been applied with the cascade
 *    intact, and a future relation added WITHOUT a cascade fails loudly in the
 *    test rather than silently orphaning rows.
 */

import type { ErasureReceipt } from "./types";

/** The User row itself. `hasPassword` instead of the hash — see below. */
export interface PrivacyUserRecord {
  id: string;
  email: string;
  name: string | null;
  birthYear: number | null;
  locale: string;
  consentAt: Date | null;
  createdAt: Date;
  /**
   * Whether the account can be re-authenticated by password at all. The hash
   * itself never leaves the auth module — erasure re-auth goes through
   * verifyCredentials(), so there is exactly one credential check in the app.
   */
  hasPassword: boolean;
}

export interface PrivacyProgressRow {
  conceptId: string;
  mastery: number;
  reps: number;
  lapses: number;
  dueAt: Date | null;
  updatedAt: Date;
}

export interface PrivacyQuestionAttemptRow {
  questionId: string;
  context: string;
  correct: boolean;
  points: number;
  answeredAt: Date;
}

export interface PrivacyExamAttemptRow {
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  answers: unknown;
}

export interface PrivacySimSessionRow {
  lessonId: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  events: unknown;
  debrief: string | null;
}

export interface PrivacyEntitlementRow {
  pack: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  provider: string | null;
  providerRef: string | null;
}

export interface PrivacyGamificationRow {
  xp: number;
  level: number;
  streak: number;
  lastActiveDay: Date | null;
  achievements: unknown;
}

export interface PrivacyTutorThreadRow {
  createdAt: Date;
  updatedAt: Date;
  messages: unknown;
}

/** Everything we hold about one person, in one shot. */
export interface UserDataBundle {
  user: PrivacyUserRecord;
  progress: PrivacyProgressRow[];
  questionAttempts: PrivacyQuestionAttemptRow[];
  examAttempts: PrivacyExamAttemptRow[];
  simSessions: PrivacySimSessionRow[];
  entitlements: PrivacyEntitlementRow[];
  gamification: PrivacyGamificationRow | null;
  tutorThreads: PrivacyTutorThreadRow[];
}

export interface PrivacyStore {
  /** Art. 15/20 read. `null` when the id has no row (stale session). */
  loadUserBundle(userId: string): Promise<UserDataBundle | null>;
  /**
   * Art. 17 write: remove the user and every dependent row, atomically.
   * `null` when the user no longer exists (idempotent double-submit).
   */
  eraseUser(userId: string): Promise<ErasureReceipt["deleted"] | null>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

class PrismaPrivacyStore implements PrivacyStore {
  /** Lazy so importing the privacy module never boots Prisma. */
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async loadUserBundle(userId: string): Promise<UserDataBundle | null> {
    const db = await this.db();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        birthYear: true,
        locale: true,
        consentAt: true,
        createdAt: true,
        // Presence only — the hash must never reach an export file.
        passwordHash: true,
      },
    });
    if (!user) return null;

    const [
      progress,
      questionAttempts,
      examAttempts,
      simSessions,
      entitlements,
      gamification,
      tutorThreads,
    ] = await Promise.all([
      db.progress.findMany({
        where: { userId },
        select: {
          conceptId: true,
          mastery: true,
          reps: true,
          lapses: true,
          dueAt: true,
          updatedAt: true,
        },
        orderBy: { conceptId: "asc" },
      }),
      db.questionAttempt.findMany({
        where: { userId },
        select: {
          questionId: true,
          context: true,
          correct: true,
          points: true,
          answeredAt: true,
        },
        orderBy: { answeredAt: "asc" },
      }),
      db.examAttempt.findMany({
        where: { userId },
        select: {
          startedAt: true,
          finishedAt: true,
          score: true,
          maxScore: true,
          passed: true,
          answers: true,
        },
        orderBy: { startedAt: "asc" },
      }),
      db.simSession.findMany({
        where: { userId },
        select: {
          lessonId: true,
          startedAt: true,
          finishedAt: true,
          score: true,
          events: true,
          debrief: true,
        },
        orderBy: { startedAt: "asc" },
      }),
      db.entitlement.findMany({
        where: { userId },
        select: {
          pack: true,
          purchasedAt: true,
          expiresAt: true,
          provider: true,
          providerRef: true,
        },
        orderBy: { purchasedAt: "asc" },
      }),
      db.gamificationState.findUnique({
        where: { userId },
        select: {
          xp: true,
          level: true,
          streak: true,
          lastActiveDay: true,
          achievements: true,
        },
      }),
      db.tutorThread.findMany({
        where: { userId },
        select: { createdAt: true, updatedAt: true, messages: true },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const { passwordHash, ...profile } = user;
    return {
      user: { ...profile, hasPassword: passwordHash !== null },
      progress,
      questionAttempts,
      examAttempts,
      simSessions,
      entitlements,
      gamification,
      tutorThreads,
    };
  }

  async eraseUser(userId: string): Promise<ErasureReceipt["deleted"] | null> {
    const db = await this.db();

    return db.$transaction(async (tx) => {
      // Re-check inside the transaction: two concurrent deletes must not both
      // report success (and the second must not blow up on a missing row).
      const exists = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true },
      });
      if (!exists) return null;

      // Children first, parent last — FK-safe regardless of cascade config.
      const [
        progress,
        questionAttempts,
        examAttempts,
        simSessions,
        entitlements,
        gamification,
        tutorThreads,
      ] = await Promise.all([
        tx.progress.deleteMany({ where: { userId } }),
        tx.questionAttempt.deleteMany({ where: { userId } }),
        tx.examAttempt.deleteMany({ where: { userId } }),
        tx.simSession.deleteMany({ where: { userId } }),
        tx.entitlement.deleteMany({ where: { userId } }),
        tx.gamificationState.deleteMany({ where: { userId } }),
        tx.tutorThread.deleteMany({ where: { userId } }),
      ]);

      await tx.user.delete({ where: { id: userId } });

      return {
        progress: progress.count,
        questionAttempts: questionAttempts.count,
        examAttempts: examAttempts.count,
        simSessions: simSessions.count,
        entitlements: entitlements.count,
        gamification: gamification.count,
        tutorThreads: tutorThreads.count,
      };
    });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

/** A child row in the fake: the userId lives alongside the exported shape. */
type Owned<T> = T & { userId: string };

/**
 * Drops the ownership column, so the fake hands back exactly the shape the
 * Prisma `select` above produces — which never includes userId.
 */
function stripOwner<T>(row: Owned<T>): T {
  const copy: Record<string, unknown> = { ...row };
  delete copy.userId;
  return copy as T;
}

export class InMemoryPrivacyStore implements PrivacyStore {
  readonly progress: Owned<PrivacyProgressRow>[] = [];
  readonly questionAttempts: Owned<PrivacyQuestionAttemptRow>[] = [];
  readonly examAttempts: Owned<PrivacyExamAttemptRow>[] = [];
  readonly simSessions: Owned<PrivacySimSessionRow>[] = [];
  readonly entitlements: Owned<PrivacyEntitlementRow>[] = [];
  readonly gamification: Owned<PrivacyGamificationRow>[] = [];
  readonly tutorThreads: Owned<PrivacyTutorThreadRow>[] = [];

  /**
   * The backing user table, accepted BY REFERENCE. A test can pass the same
   * array to InMemoryAuthStore so that erasing here is immediately visible to
   * login there — that is how "a deleted user cannot log in" is asserted
   * end-to-end without a database.
   */
  constructor(readonly users: PrivacyUserRecord[] = []) {}

  async loadUserBundle(userId: string): Promise<UserDataBundle | null> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) return null;

    const mine = <T>(rows: Owned<T>[]): T[] =>
      rows.filter((r) => r.userId === userId).map(stripOwner);

    return {
      user,
      progress: mine(this.progress),
      questionAttempts: mine(this.questionAttempts),
      examAttempts: mine(this.examAttempts),
      simSessions: mine(this.simSessions),
      entitlements: mine(this.entitlements),
      gamification: mine(this.gamification)[0] ?? null,
      tutorThreads: mine(this.tutorThreads),
    };
  }

  async eraseUser(userId: string): Promise<ErasureReceipt["deleted"] | null> {
    const index = this.users.findIndex((u) => u.id === userId);
    if (index < 0) return null;

    // Splice in place — the array may be shared with another module's fake.
    const drop = <T>(rows: Owned<T>[]): number => {
      let removed = 0;
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i].userId === userId) {
          rows.splice(i, 1);
          removed++;
        }
      }
      return removed;
    };

    const deleted = {
      progress: drop(this.progress),
      questionAttempts: drop(this.questionAttempts),
      examAttempts: drop(this.examAttempts),
      simSessions: drop(this.simSessions),
      entitlements: drop(this.entitlements),
      gamification: drop(this.gamification),
      tutorThreads: drop(this.tutorThreads),
    };
    this.users.splice(index, 1);
    return deleted;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: PrivacyStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setPrivacyStore(s: PrivacyStore | null): void {
  store = s;
}

export function getPrivacyStore(): PrivacyStore {
  if (!store) store = new PrismaPrivacyStore();
  return store;
}
