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

/** One append-only ConsentEvent row (see prisma/schema.prisma). */
export interface ConsentEventRecord {
  id: string;
  userId: string;
  /** terms | privacy | parental_purchase | withdrawal_waiver */
  kind: string;
  /** register | checkout | settings */
  context: string;
  /** Published document version agreed to (src/lib/legal/versions.ts). */
  docVersion: string;
  /** The wording actually shown, verbatim. */
  textBg: string;
  /** Pack id when the consent gated a purchase; null otherwise. */
  subject: string | null;
  recordedAt: Date;
}

export type CreateConsentEventInput = Omit<ConsentEventRecord, "id">;

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
  /**
   * The buyer's birth year, for the ЗЛС minor gate at checkout (H-9).
   * This is the ONLY read of `User.birthYear` outside registration, and the
   * value never leaves the server: it decides which checkbox to require and
   * is then dropped. `null` = never collected (treated as "might be a minor",
   * see consent.ts).
   */
  findUserBirthYear(userId: string): Promise<number | null>;
  /** Append one consent proof. Rows are never updated afterwards. */
  createConsentEvent(
    input: CreateConsentEventInput,
  ): Promise<ConsentEventRecord>;
  /** Consent rows of one user in one context, recorded at/after `since`. */
  listConsentEvents(
    userId: string,
    context: string,
    since: Date,
  ): Promise<ConsentEventRecord[]>;
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

  async findUserBirthYear(userId: string): Promise<number | null> {
    const db = await this.db();
    // Narrow select on purpose (ADR-004): the checkout path has no business
    // loading the rest of a minor's user row to answer a yes/no question.
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { birthYear: true },
    });
    return row?.birthYear ?? null;
  }

  async createConsentEvent(
    input: CreateConsentEventInput,
  ): Promise<ConsentEventRecord> {
    const db = await this.db();
    return db.consentEvent.create({ data: input });
  }

  async listConsentEvents(
    userId: string,
    context: string,
    since: Date,
  ): Promise<ConsentEventRecord[]> {
    const db = await this.db();
    return db.consentEvent.findMany({
      where: { userId, context, recordedAt: { gte: since } },
      orderBy: { recordedAt: "desc" },
    });
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
  readonly consentEvents: ConsentEventRecord[] = [];
  /** userId → birthYear, seeded by tests (absent = never collected). */
  readonly birthYears = new Map<string, number>();
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

  async findUserBirthYear(userId: string): Promise<number | null> {
    return this.birthYears.get(userId) ?? null;
  }

  async createConsentEvent(
    input: CreateConsentEventInput,
  ): Promise<ConsentEventRecord> {
    const record: ConsentEventRecord = {
      id: `consent-${this.nextId++}`,
      ...input,
    };
    this.consentEvents.push(record);
    return record;
  }

  async listConsentEvents(
    userId: string,
    context: string,
    since: Date,
  ): Promise<ConsentEventRecord[]> {
    return this.consentEvents
      .filter(
        (c) =>
          c.userId === userId &&
          c.context === context &&
          c.recordedAt.getTime() >= since.getTime(),
      )
      .sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
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
