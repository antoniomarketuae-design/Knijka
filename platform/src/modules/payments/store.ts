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

/**
 * THE RECEIPT (prisma Payment). Money exactly as Stripe reported it — never
 * recomputed from PACKS, because the price in code changes and the price
 * someone paid does not.
 */
export interface CreatePaymentInput {
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  userId: string;
  pack: string;
  amountCents: number;
  currency: string;
  livemode: boolean;
  /** Stripe's payment_status: paid | unpaid | no_payment_required. */
  status: string;
  /** `evt_…` when a webhook produced it; null from /checkout/return. */
  rawEventId: string | null;
}

export interface PaymentRecord extends CreatePaymentInput {
  id: string;
  createdAt: Date;
}

/**
 * One purchase, written as ONE unit: the grant and its receipt.
 *
 * They are a single store call rather than two because a grant without a
 * receipt is a sale the business has no record of, and a receipt without a
 * grant is a charge the student cannot use. The Prisma implementation puts
 * both inside `db.$transaction`.
 */
export interface RecordPurchaseInput {
  entitlement: CreateEntitlementInput;
  payment: CreatePaymentInput;
}

export type RecordPurchaseResult =
  | { status: "created"; entitlement: EntitlementRecord }
  | { status: "already-fulfilled"; entitlement: EntitlementRecord }
  /**
   * THE POISON PILL. This session's money is on file and its grant is not —
   * and that is not damage to repair, it is a decision to respect.
   *
   * The receipt deliberately outlives the grant (Payment survives an Art. 17
   * erasure via SetNull; the books must show what happened). So the two rows
   * come apart legitimately, by exactly two routes:
   *
   *   1. SUPPORT REVOKED THE ACCESS. /admin deletes the Entitlement row; the
   *      Payment row is untouched. The student paid, and was then deliberately
   *      cut off.
   *   2. THE ACCOUNT WAS ERASED. Deleting the User cascades the Entitlement
   *      away and NULLs Payment.userId. The person is gone.
   *
   * A replay of the session then cannot be fulfilled and MUST NOT be: writing
   * the grant again would hand back access support took away, or resurrect a
   * row for someone who exercised their right to be forgotten. It is also not
   * a failure — the purchase was delivered once, and the receipt proves it.
   *
   * Callers must treat this as SUCCESS (the webhook answers 200 and Stripe
   * stops retrying) and must never present it as active access. There is
   * deliberately no `entitlement` field: there is no entitlement, and a caller
   * that wants to claim one should not compile.
   */
  | { status: "receipt-without-grant"; stripeSessionId: string; paymentId: string };

/** One webhook Stripe delivered (prisma StripeEvent). */
export interface StripeEventRecord {
  id: string;
  stripeEventId: string;
  type: string;
  payload: unknown;
  receivedAt: Date;
  processedAt: Date | null;
  lastError: string | null;
}

export interface CreateStripeEventInput {
  stripeEventId: string;
  type: string;
  payload: unknown;
  receivedAt: Date;
}

/**
 * `isNew: false` means Stripe redelivered an event we already have. Not an
 * error — at-least-once delivery is the contract — but worth logging, and the
 * only signal that distinguishes "first attempt" from "retry" in the log.
 */
export interface RecordStripeEventResult {
  isNew: boolean;
  event: StripeEventRecord;
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
   * Extra free mock exams support has given this account back
   * (User.freeExamGrants). 0 for a user who has never needed one, and 0 for an
   * unknown id — the free allowance is never widened by a failed lookup.
   */
  countFreeExamGrants(userId: string): Promise<number>;
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
  /**
   * Every receipt belonging to a user, newest first — what /settings shows
   * under „Моите покупки".
   *
   * Reading these back matters as much as writing them. A student whose
   * purchase went wrong previously had NOTHING to quote: no amount, no date,
   * no session id. She wrote "I paid but it doesn't work" and the founder had
   * nothing to search his Stripe dashboard with. This method is the other end
   * of that conversation.
   */
  listPayments(userId: string): Promise<PaymentRecord[]>;

  // --- the money path -------------------------------------------------------

  /**
   * THE IDEMPOTENCY AUTHORITY. Writes the grant and its receipt as ONE unit,
   * and answers "already fulfilled" when this session was recorded before.
   *
   * The decision is the STORE's, not the caller's, and that is the whole point.
   * Fulfilment used to read (`findEntitlementByProviderRef`) and then write, so
   * two simultaneous deliveries of one session — Stripe's webhook and the
   * /checkout/return page, which race by design — both read "nothing yet" and
   * both granted. A read-then-write cannot be made safe in application code; a
   * unique constraint can, and `@@unique([provider, providerRef])` now exists
   * to enforce it. Implementations MUST NOT re-introduce the gap: Prisma lets
   * the DB reject the second write (P2002) and reports it as already-fulfilled;
   * the in-memory fake decides between the check and the insert with no `await`
   * in between, which is the same guarantee in a single-threaded runtime.
   *
   * A replay whose GRANT is gone but whose RECEIPT is not answers
   * `receipt-without-grant` — never an exception, and never a fresh grant.
   * That state is reached by an ordinary support revoke and by Art. 17
   * erasure; see the result type for why re-granting would be the wrong repair
   * in both cases.
   */
  recordPurchase(input: RecordPurchaseInput): Promise<RecordPurchaseResult>;

  /**
   * The account's e-mail, for `customer_email` on the Checkout Session.
   *
   * Narrow select for the same ADR-004 reason as findUserBirthYear: minting a
   * payment link is no reason to load a minor's user row.
   */
  findUserEmail(userId: string): Promise<string | null>;

  /**
   * Append one signature-verified webhook BEFORE any work is done on it, so a
   * fulfilment that then fails is a row someone can find (StripeEvent is the
   * dead-letter queue — see the schema comment) rather than one console.error
   * in an unrotated log.
   */
  recordStripeEvent(
    input: CreateStripeEventInput,
  ): Promise<RecordStripeEventResult>;

  /** Close the loop on a recorded event: processed at `at`, or failed with `error`. */
  markStripeEventProcessed(
    stripeEventId: string,
    at: Date,
    error?: string | null,
  ): Promise<void>;

  /**
   * The receipt behind a PaymentIntent — how a refund or a dispute finds the
   * purchase it undoes. Refund events are keyed by PaymentIntent; entitlements
   * are keyed by Checkout Session; this row is the only thing that joins them.
   */
  findPaymentByIntent(
    stripePaymentIntentId: string,
  ): Promise<PaymentRecord | null>;

  /**
   * Revocation: end the access granted by one Stripe session, now. Returns how
   * many rows were changed (0 = nothing was granted for it). Sets `expiresAt`
   * rather than deleting, because the books must still show what happened.
   */
  expireEntitlementsByProviderRef(
    provider: string,
    providerRef: string,
    at: Date,
  ): Promise<number>;
}

/**
 * Postgres unique-violation, as Prisma reports it. Matched structurally rather
 * than with `instanceof PrismaClientKnownRequestError` so this file keeps its
 * lazy relationship with the generated client — and so the in-memory store can
 * be reasoned about against the same contract.
 */
export function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2002"
  );
}

/**
 * Postgres foreign-key violation (23503), as Prisma reports it.
 *
 * On the purchase path this has exactly one meaning: the account the purchase
 * names does not exist. Entitlement.userId and Payment.userId are the only
 * foreign keys either INSERT touches, so a rejected reference is always "no
 * such user" — which is what an Art. 17 erasure leaves behind, and it is the
 * database enforcing the erasure rather than a bug to route around.
 *
 * Matched structurally for the same reason as isUniqueViolation above.
 */
export function isMissingReferenceViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "P2003"
  );
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

  async countFreeExamGrants(userId: string): Promise<number> {
    const db = await this.db();
    // Narrow select for the same ADR-004 reason as findUserBirthYear.
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { freeExamGrants: true },
    });
    return row?.freeExamGrants ?? 0;
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

  async listPayments(userId: string): Promise<PaymentRecord[]> {
    const db = await this.db();
    // Payment.userId is nullable (Art. 17 SetNull), so an equality filter is
    // exactly right: an erased account's receipts are no longer anyone's to
    // read, and NULL never equals a cuid.
    const rows = await db.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({ ...r, userId: r.userId as string }));
  }

  async recordPurchase(
    input: RecordPurchaseInput,
  ): Promise<RecordPurchaseResult> {
    const db = await this.db();
    const { provider, providerRef } = input.entitlement;
    try {
      // ONE transaction: a grant with no receipt is a sale we have no record
      // of, a receipt with no grant is a charge the student cannot use.
      const entitlement = await db.$transaction(async (tx) => {
        const created = await tx.entitlement.create({ data: input.entitlement });
        await tx.payment.create({ data: input.payment });
        return created;
      });
      return { status: "created", entitlement };
    } catch (err) {
      const duplicate = isUniqueViolation(err);
      const noSuchUser = isMissingReferenceViolation(err);
      if (!duplicate && !noSuchUser) throw err;

      if (duplicate) {
        // Somebody else fulfilled this session between our INSERT and theirs.
        // That is the constraint doing its job, not a failure — read back what
        // won and report the purchase as already delivered.
        const existing = await db.entitlement.findFirst({
          where: { provider, providerRef },
        });
        if (existing) {
          return { status: "already-fulfilled", entitlement: existing };
        }
      }

      // No grant to read back. Before rethrowing, ASK THE RECEIPT — the row
      // that is designed to outlive the grant. If this session's money is
      // already on file, the purchase was delivered once and its grant is gone
      // ON PURPOSE (support revoked it, or Art. 17 erased the account). See
      // RecordPurchaseResult["receipt-without-grant"] for the full account.
      //
      // This is the branch that used to rethrow, and rethrowing was a
      // three-day outage generated by an ordinary support action: revoke one
      // student's access, and the next replay of their session 500s the
      // webhook on every Stripe retry until the retry window closes.
      //
      // The lookup is by stripeSessionId — the Payment row's own unique key —
      // and NOT by (provider, providerRef): the grant is what went missing, so
      // asking the grant's key again would only repeat the question that just
      // came back empty.
      const receipt = await db.payment.findUnique({
        where: { stripeSessionId: input.payment.stripeSessionId },
        select: { id: true, stripeSessionId: true },
      });
      if (receipt) {
        return {
          status: "receipt-without-grant",
          stripeSessionId: receipt.stripeSessionId,
          paymentId: receipt.id,
        };
      }

      // Genuinely unreconcilable: a purchase we cannot grant AND have no
      // record of taking money for — a P2002 on some other constraint, or a
      // session whose metadata names an account that never existed. Rethrow,
      // so the caller answers 500, Stripe keeps knocking and the event stays
      // in the dead-letter queue. That is the same deliberate loudness the
      // webhook gives a paid session with no usable metadata: money arrived
      // with nothing to grant, and a human has to look.
      throw err;
    }
  }

  async findUserEmail(userId: string): Promise<string | null> {
    const db = await this.db();
    const row = await db.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    return row?.email ?? null;
  }

  async recordStripeEvent(
    input: CreateStripeEventInput,
  ): Promise<RecordStripeEventResult> {
    const db = await this.db();
    const payload = input.payload as never; // Prisma Json
    try {
      const event = await db.stripeEvent.create({
        data: {
          stripeEventId: input.stripeEventId,
          type: input.type,
          payload,
          receivedAt: input.receivedAt,
        },
      });
      return { isNew: true, event };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Stripe redelivered. Keep the original row (and its receivedAt — when
      // we FIRST saw this event is the audit-relevant timestamp).
      const event = await db.stripeEvent.findUnique({
        where: { stripeEventId: input.stripeEventId },
      });
      if (!event) throw err;
      return { isNew: false, event };
    }
  }

  async markStripeEventProcessed(
    stripeEventId: string,
    at: Date,
    error?: string | null,
  ): Promise<void> {
    const db = await this.db();
    await db.stripeEvent.update({
      where: { stripeEventId },
      // A failure leaves processedAt NULL — that is what makes the row a job
      // in the dead-letter queue rather than a finished one.
      data: error
        ? { lastError: error.slice(0, 2000) }
        : { processedAt: at, lastError: null },
    });
  }

  async findPaymentByIntent(
    stripePaymentIntentId: string,
  ): Promise<PaymentRecord | null> {
    const db = await this.db();
    const row = await db.payment.findFirst({
      where: { stripePaymentIntentId },
      orderBy: { createdAt: "desc" },
    });
    return row ? { ...row, userId: row.userId as string } : null;
  }

  async expireEntitlementsByProviderRef(
    provider: string,
    providerRef: string,
    at: Date,
  ): Promise<number> {
    const db = await this.db();
    const { count } = await db.entitlement.updateMany({
      where: { provider, providerRef },
      data: { expiresAt: at },
    });
    return count;
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
  /** Receipts, seeded by tests. Push a PaymentRecord to simulate a purchase. */
  readonly payments: PaymentRecord[] = [];
  /** Webhooks recorded — the dead-letter queue, for assertions. */
  readonly stripeEvents: StripeEventRecord[] = [];
  /** userId → birthYear, seeded by tests (absent = never collected). */
  readonly birthYears = new Map<string, number>();
  /** userId → extra free mock exams support restored (absent = none). */
  readonly freeExamGrants = new Map<string, number>();
  /** userId → e-mail, seeded by tests (absent = unknown account). */
  readonly emails = new Map<string, string>();
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

  async countFreeExamGrants(userId: string): Promise<number> {
    return this.freeExamGrants.get(userId) ?? 0;
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

  async listPayments(userId: string): Promise<PaymentRecord[]> {
    return this.payments
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Models `@@unique([provider, providerRef])` — and models it ATOMICALLY.
   *
   * Everything from the lookup to the push is synchronous, with no `await`
   * anywhere in between. That is not a style choice: in a single-threaded
   * runtime an `await` is the only place another fulfilment of the same session
   * can interleave, so a fake that awaited mid-check would let the duplicate
   * through and a "concurrent delivery" test against it would prove nothing.
   * This is the same guarantee Postgres gives, expressed the only way this
   * runtime can express it.
   */
  async recordPurchase(
    input: RecordPurchaseInput,
  ): Promise<RecordPurchaseResult> {
    const { provider, providerRef } = input.entitlement;
    const existing = this.entitlements.find(
      (e) => e.provider === provider && e.providerRef === providerRef,
    );
    if (existing) return { status: "already-fulfilled", entitlement: existing };

    // Models `Payment.stripeSessionId @unique` in the state where it BITES:
    // the grant is gone (support revoked it, or erasure cascaded it away) and
    // the receipt is still here. Postgres answers that with a rejected INSERT;
    // this answers it with a lookup. Both must reach the same verdict, or a
    // route test written against this fake proves something the database does
    // not do. It cannot REPRODUCE the defect — that takes two tables and one
    // transaction, and the real-DB test owns that — but it must not contradict
    // the contract either.
    const receipt = this.payments.find(
      (p) => p.stripeSessionId === input.payment.stripeSessionId,
    );
    if (receipt) {
      return {
        status: "receipt-without-grant",
        stripeSessionId: receipt.stripeSessionId,
        paymentId: receipt.id,
      };
    }

    const entitlement: EntitlementRecord = {
      id: `ent-${this.nextId++}`,
      ...input.entitlement,
    };
    this.entitlements.push(entitlement);
    this.payments.push({
      id: `pay-${this.nextId++}`,
      createdAt: input.entitlement.purchasedAt,
      ...input.payment,
    });
    return { status: "created", entitlement };
  }

  async findUserEmail(userId: string): Promise<string | null> {
    return this.emails.get(userId) ?? null;
  }

  async recordStripeEvent(
    input: CreateStripeEventInput,
  ): Promise<RecordStripeEventResult> {
    const seen = this.stripeEvents.find(
      (e) => e.stripeEventId === input.stripeEventId,
    );
    if (seen) return { isNew: false, event: seen };
    const event: StripeEventRecord = {
      id: `evt-row-${this.nextId++}`,
      stripeEventId: input.stripeEventId,
      type: input.type,
      payload: input.payload,
      receivedAt: input.receivedAt,
      processedAt: null,
      lastError: null,
    };
    this.stripeEvents.push(event);
    return { isNew: true, event };
  }

  async markStripeEventProcessed(
    stripeEventId: string,
    at: Date,
    error?: string | null,
  ): Promise<void> {
    const row = this.stripeEvents.find(
      (e) => e.stripeEventId === stripeEventId,
    );
    if (!row) return;
    if (error) row.lastError = error;
    else {
      row.processedAt = at;
      row.lastError = null;
    }
  }

  async findPaymentByIntent(
    stripePaymentIntentId: string,
  ): Promise<PaymentRecord | null> {
    return (
      this.payments.find(
        (p) => p.stripePaymentIntentId === stripePaymentIntentId,
      ) ?? null
    );
  }

  async expireEntitlementsByProviderRef(
    provider: string,
    providerRef: string,
    at: Date,
  ): Promise<number> {
    let count = 0;
    for (const e of this.entitlements) {
      if (e.provider === provider && e.providerRef === providerRef) {
        e.expiresAt = at;
        count++;
      }
    }
    return count;
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
