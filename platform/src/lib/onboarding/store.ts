/**
 * Persistence boundary for the onboarding answers — User.examDate,
 * User.dailyGoalMin, User.onboardedAt.
 *
 * Same seam as every other store in the repo (modules/learning/store.ts,
 * modules/gamification/store.ts): ALL Prisma access hides behind an injectable
 * interface, the client is imported lazily so importing this file never needs
 * DATABASE_URL, and tests inject the in-memory fake below.
 *
 * WHY THIS FILE EXISTS AT ALL. The three answers lived in ONE BROWSER'S
 * localStorage. A student who registered on a phone and opened the site on a
 * laptop lost their exam date — and because it never reached the server, we
 * never had it either, so „изпитът ти е след 6 дни" was a message the product
 * could not send. On a one-time four-month pack with nothing to renew, that
 * countdown is the strongest retention signal this product collects.
 */

/** The three columns, as the flow and the countdown read them. */
export interface OnboardingRow {
  /**
   * Exam day at DAY precision, midnight UTC (schema: `@db.Date`, ADR-004 —
   * a day cannot place a minor anywhere at any hour). null = the student
   * answered „Още нямам дата", or was never asked; `onboardedAt` says which.
   */
  examDate: Date | null;
  /** 10 | 20 | 30 minutes; null = never answered. */
  dailyGoalMin: number | null;
  /**
   * When the flow completed. THE ONE FIELD THAT MAKES THE OTHER TWO
   * UNAMBIGUOUS: null = never asked, set + examDate null = asked and answered
   * „no date". Without it, NULL means both and the flow re-asks forever. It is
   * also what turns "how many registrations activated?" into one query.
   */
  onboardedAt: Date | null;
}

/**
 * A partial write. `undefined` means "this call has nothing to say about that
 * column" — NOT "clear it". Clearing the exam date is `examDate: null`, which
 * is what „Още нямам дата" posts, and the two must not collapse: step 1 and
 * step 2 of the flow each write only their own answer.
 */
export interface OnboardingPatch {
  examDate?: Date | null;
  dailyGoalMin?: number | null;
  onboardedAt?: Date;
}

export interface OnboardingStore {
  get(userId: string): Promise<OnboardingRow | null>;
  /** Upsert-by-update; a missing user is a no-op, never a throw. */
  save(userId: string, patch: OnboardingPatch): Promise<void>;
}

function createPrismaStore(): OnboardingStore {
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async get(userId) {
      const db = await getDb();
      const row = await db.user.findUnique({
        where: { id: userId },
        select: { examDate: true, dailyGoalMin: true, onboardedAt: true },
      });
      return row ?? null;
    },

    async save(userId, patch) {
      const db = await getDb();
      // updateMany, not update: `update` throws P2025 when the row is gone,
      // and a GDPR-erased account finishing a flow it had already opened must
      // not surface a 500 on a preferences write. Zero rows updated is the
      // correct outcome, not an error.
      await db.user.updateMany({
        where: { id: userId },
        // Keys absent from `patch` are absent here too, so a step that only
        // answers the goal cannot blank the exam date.
        data: patch,
      });
    },
  };
}

/** In-memory fake — the seam every unit test drives. */
export class FakeOnboardingStore implements OnboardingStore {
  private rows = new Map<string, OnboardingRow>();
  readonly saves: { userId: string; patch: OnboardingPatch }[] = [];

  seed(userId: string, row: Partial<OnboardingRow> = {}): void {
    this.rows.set(userId, {
      examDate: row.examDate ?? null,
      dailyGoalMin: row.dailyGoalMin ?? null,
      onboardedAt: row.onboardedAt ?? null,
    });
  }

  async get(userId: string): Promise<OnboardingRow | null> {
    const row = this.rows.get(userId);
    return row ? { ...row } : null;
  }

  async save(userId: string, patch: OnboardingPatch): Promise<void> {
    this.saves.push({ userId, patch });
    const row = this.rows.get(userId);
    if (!row) return; // no such user — same no-op as updateMany
    this.rows.set(userId, {
      examDate: "examDate" in patch ? (patch.examDate ?? null) : row.examDate,
      dailyGoalMin:
        "dailyGoalMin" in patch ? (patch.dailyGoalMin ?? null) : row.dailyGoalMin,
      onboardedAt: patch.onboardedAt ?? row.onboardedAt,
    });
  }
}

let store: OnboardingStore | null = null;

/** Tests inject a fake here; `null` restores the Prisma-backed store. */
export function setOnboardingStore(s: OnboardingStore | null): void {
  store = s;
}

export function getOnboardingStore(): OnboardingStore {
  if (!store) store = createPrismaStore();
  return store;
}
