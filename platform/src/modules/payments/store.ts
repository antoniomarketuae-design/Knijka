/**
 * Persistence boundary of the payments module (pattern shared with
 * @/modules/exam and @/modules/learning):
 *
 * - Production: PrismaPaymentsStore over Entitlement + QuestionAttempt +
 *   ExamAttempt rows. Prisma is imported LAZILY inside methods so unit tests
 *   (which inject the in-memory fake) never touch the DB or need DATABASE_URL.
 * - Tests: InMemoryPaymentsStore injected via setPaymentsStore().
 */

export interface EntitlementRecord {
  id: string;
  userId: string;
  /** "core" | "premium_sim" (schema stores a plain string). */
  pack: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  provider: string | null;
  providerRef: string | null;
}

export interface CreateEntitlementInput {
  userId: string;
  pack: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  provider: string;
  providerRef: string;
}

export interface PaymentsStore {
  /** All entitlement rows of a user (active and expired). */
  listEntitlements(userId: string): Promise<EntitlementRecord[]>;
  /**
   * Lookup by (provider, providerRef) — the idempotency check that keeps a
   * retried webhook from granting the same purchase twice.
   */
  findEntitlementByProviderRef(
    provider: string,
    providerRef: string,
  ): Promise<EntitlementRecord | null>;
  createEntitlement(input: CreateEntitlementInput): Promise<EntitlementRecord>;
  /** QuestionAttempt rows in [from, to) for one context ("practice"). */
  countQuestionAttempts(
    userId: string,
    context: string,
    from: Date,
    to: Date,
  ): Promise<number>;
  /** ALL exam attempts ever (started counts as used — no restart farming). */
  countExamAttempts(userId: string): Promise<number>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

class PrismaPaymentsStore implements PaymentsStore {
  /** Lazy so importing the payments module never boots Prisma. */
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  async listEntitlements(userId: string): Promise<EntitlementRecord[]> {
    const db = await this.db();
    return db.entitlement.findMany({ where: { userId } });
  }

  async findEntitlementByProviderRef(
    provider: string,
    providerRef: string,
  ): Promise<EntitlementRecord | null> {
    const db = await this.db();
    return db.entitlement.findFirst({ where: { provider, providerRef } });
  }

  async createEntitlement(
    input: CreateEntitlementInput,
  ): Promise<EntitlementRecord> {
    const db = await this.db();
    return db.entitlement.create({ data: input });
  }

  async countQuestionAttempts(
    userId: string,
    context: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    const db = await this.db();
    return db.questionAttempt.count({
      where: { userId, context, answeredAt: { gte: from, lt: to } },
    });
  }

  async countExamAttempts(userId: string): Promise<number> {
    const db = await this.db();
    return db.examAttempt.count({ where: { userId } });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export interface FakeQuestionAttempt {
  userId: string;
  context: string;
  answeredAt: Date;
}

export class InMemoryPaymentsStore implements PaymentsStore {
  /** Exposed for test setup and assertions. */
  readonly entitlements: EntitlementRecord[] = [];
  readonly questionAttempts: FakeQuestionAttempt[] = [];
  readonly examAttemptUserIds: string[] = [];
  private nextId = 1;

  async listEntitlements(userId: string): Promise<EntitlementRecord[]> {
    return this.entitlements.filter((e) => e.userId === userId);
  }

  async findEntitlementByProviderRef(
    provider: string,
    providerRef: string,
  ): Promise<EntitlementRecord | null> {
    return (
      this.entitlements.find(
        (e) => e.provider === provider && e.providerRef === providerRef,
      ) ?? null
    );
  }

  async createEntitlement(
    input: CreateEntitlementInput,
  ): Promise<EntitlementRecord> {
    const record: EntitlementRecord = { id: `ent-${this.nextId++}`, ...input };
    this.entitlements.push(record);
    return record;
  }

  async countQuestionAttempts(
    userId: string,
    context: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.questionAttempts.filter(
      (a) =>
        a.userId === userId &&
        a.context === context &&
        a.answeredAt.getTime() >= from.getTime() &&
        a.answeredAt.getTime() < to.getTime(),
    ).length;
  }

  async countExamAttempts(userId: string): Promise<number> {
    return this.examAttemptUserIds.filter((id) => id === userId).length;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: PaymentsStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setPaymentsStore(s: PaymentsStore | null): void {
  store = s;
}

export function getPaymentsStore(): PaymentsStore {
  if (!store) store = new PrismaPaymentsStore();
  return store;
}
