/**
 * Persistence boundary of the admin module (same pattern as payments/exam):
 * Prisma in production, an in-memory fake injected by tests, and the client
 * imported LAZILY so a unit test that touches this module never boots Prisma.
 *
 * THE ONE RULE THIS FILE ENFORCES BY TYPE. Every mutating method takes an
 * `audit: CreateAdminActionInput` and writes it in the SAME TRANSACTION as the
 * change. There is no method that mutates without one and no way to add such a
 * method by accident — which is the only version of "every mutation writes a
 * row naming the admin who did it" that survives the next person in a hurry.
 */

import type { AdminActionKind, AdminActionRow } from "./types";

// ---------------------------------------------------------------------------
// Row shapes (deliberately narrow — /admin selects what it shows, nothing more)
// ---------------------------------------------------------------------------

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
  freeExamGrants: number;
}

export interface AdminEntitlementRecord {
  id: string;
  userId: string;
  pack: string;
  provider: string | null;
  providerRef: string | null;
  purchasedAt: Date;
  expiresAt: Date | null;
}

export interface AdminPaymentRecord {
  id: string;
  /**
   * Nullable by design (see the Payment header in schema.prisma): an Art. 17
   * erasure scrubs the link and keeps the receipt. Carried here — though the
   * screen never shows it, having searched by e-mail already — so the query is
   * expressed in the record it returns and the in-memory fake can filter on
   * the same field the real store filters on.
   */
  userId: string | null;
  stripeSessionId: string;
  stripePaymentIntentId: string | null;
  pack: string;
  amountCents: number;
  currency: string;
  livemode: boolean;
  status: string;
  createdAt: Date;
}

export interface AdminAttemptRecord {
  id: string;
  userId: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
}

export interface AdminTutorRecord {
  threads: number;
  questions: number;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

export interface CreateAdminActionInput {
  actorId: string;
  actorEmail: string;
  action: AdminActionKind;
  subjectId: string | null;
  targetRef: string | null;
  reason: string;
  detail?: unknown;
}

export interface CreateGrantInput {
  userId: string;
  pack: string;
  purchasedAt: Date;
  expiresAt: Date | null;
  provider: string;
  providerRef: string | null;
}

export interface AdminStore {
  // --- reads ---------------------------------------------------------------
  /** Case-insensitive: support is given an address by a human, not a machine. */
  findUserByEmail(email: string): Promise<AdminUserRecord | null>;
  listEntitlements(userId: string): Promise<AdminEntitlementRecord[]>;
  listPayments(userId: string): Promise<AdminPaymentRecord[]>;
  listAttempts(userId: string): Promise<AdminAttemptRecord[]>;
  tutorSpend(userId: string): Promise<AdminTutorRecord>;
  listActions(subjectId: string, limit: number): Promise<AdminActionRow[]>;

  // --- mutations (audit is not optional) -----------------------------------
  grantEntitlement(
    input: CreateGrantInput,
    audit: CreateAdminActionInput,
  ): Promise<AdminEntitlementRecord>;
  /** Returns false when the id does not belong to `userId` — never a blind delete. */
  revokeEntitlement(
    userId: string,
    entitlementId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean>;
  /** Returns the new grant total. */
  addFreeExamGrants(
    userId: string,
    delta: number,
    audit: CreateAdminActionInput,
  ): Promise<number>;
  /** Deletes ONLY an unfinished attempt of this user. False = refused. */
  deleteInProgressAttempt(
    userId: string,
    attemptId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

/** Prisma-compatible JSON input (our audit details are never top-level null). */
type JsonIn = string | number | boolean | JsonIn[] | { [k: string]: JsonIn | null };

/** The tutor thread rows the spend rollup reads. */
interface TutorThreadRow {
  messages: unknown;
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

/** Questions asked in one persisted thread — `messages` is an opaque Json blob. */
function countQuestions(messages: unknown): number {
  if (!Array.isArray(messages)) return 0;
  return messages.filter(
    (m) => typeof m === "object" && m !== null && (m as { role?: unknown }).role === "user",
  ).length;
}

function rollUpTutor(rows: TutorThreadRow[]): AdminTutorRecord {
  return rows.reduce<AdminTutorRecord>(
    (acc, t) => ({
      threads: acc.threads + 1,
      questions: acc.questions + countQuestions(t.messages),
      tokensIn: acc.tokensIn + t.tokensIn,
      tokensOut: acc.tokensOut + t.tokensOut,
      costMicroUsd: acc.costMicroUsd + t.costMicroUsd,
    }),
    { threads: 0, questions: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 },
  );
}

class PrismaAdminStore implements AdminStore {
  private async db() {
    const { db } = await import("@/lib/db");
    return db;
  }

  private auditData(audit: CreateAdminActionInput) {
    return {
      actorId: audit.actorId,
      actorEmail: audit.actorEmail,
      action: audit.action,
      subjectId: audit.subjectId,
      targetRef: audit.targetRef,
      reason: audit.reason,
      // Omitted rather than set to null: Prisma treats an absent nullable Json
      // field as SQL NULL, while an explicit `null` is a JSON null literal —
      // two different values in the column and only one of them means "nothing
      // to record".
      detail:
        audit.detail === undefined || audit.detail === null
          ? undefined
          : (audit.detail as JsonIn),
    };
  }

  async findUserByEmail(email: string): Promise<AdminUserRecord | null> {
    const db = await this.db();
    // `mode: "insensitive"` rather than lowercasing the column: registration
    // stores what the student typed, and a support ticket quotes it back with
    // whatever capitalisation the phone's keyboard chose.
    const row = await db.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        freeExamGrants: true,
      },
    });
    return row ?? null;
  }

  async listEntitlements(userId: string): Promise<AdminEntitlementRecord[]> {
    const db = await this.db();
    return db.entitlement.findMany({
      where: { userId },
      orderBy: { purchasedAt: "desc" },
      select: {
        id: true,
        userId: true,
        pack: true,
        provider: true,
        providerRef: true,
        purchasedAt: true,
        expiresAt: true,
      },
    });
  }

  async listPayments(userId: string): Promise<AdminPaymentRecord[]> {
    const db = await this.db();
    return db.payment.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        userId: true,
        stripeSessionId: true,
        stripePaymentIntentId: true,
        pack: true,
        amountCents: true,
        currency: true,
        livemode: true,
        status: true,
        createdAt: true,
      },
    });
  }

  async listAttempts(userId: string): Promise<AdminAttemptRecord[]> {
    const db = await this.db();
    return db.examAttempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        userId: true,
        startedAt: true,
        finishedAt: true,
        score: true,
        maxScore: true,
        passed: true,
      },
    });
  }

  async tutorSpend(userId: string): Promise<AdminTutorRecord> {
    const db = await this.db();
    const rows = await db.tutorThread.findMany({
      where: { userId },
      select: { messages: true, tokensIn: true, tokensOut: true, costMicroUsd: true },
    });
    return rollUpTutor(rows);
  }

  async listActions(subjectId: string, limit: number): Promise<AdminActionRow[]> {
    const db = await this.db();
    return db.adminAction.findMany({
      where: { subjectId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  async grantEntitlement(
    input: CreateGrantInput,
    audit: CreateAdminActionInput,
  ): Promise<AdminEntitlementRecord> {
    const db = await this.db();
    // One transaction: an entitlement that exists with no ledger row is exactly
    // the state /admin was built to end.
    const [entitlement] = await db.$transaction([
      db.entitlement.create({ data: input }),
      db.adminAction.create({ data: this.auditData(audit) }),
    ]);
    return entitlement;
  }

  async revokeEntitlement(
    userId: string,
    entitlementId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean> {
    const db = await this.db();
    return db.$transaction(async (tx) => {
      // deleteMany with BOTH keys, not delete-by-id: the id arrives from a form
      // and must never be able to revoke a different student's access.
      const { count } = await tx.entitlement.deleteMany({
        where: { id: entitlementId, userId },
      });
      if (count === 0) return false;
      await tx.adminAction.create({ data: this.auditData(audit) });
      return true;
    });
  }

  async addFreeExamGrants(
    userId: string,
    delta: number,
    audit: CreateAdminActionInput,
  ): Promise<number> {
    const db = await this.db();
    return db.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: userId },
        data: { freeExamGrants: { increment: delta } },
        select: { freeExamGrants: true },
      });
      await tx.adminAction.create({ data: this.auditData(audit) });
      return user.freeExamGrants;
    });
  }

  async deleteInProgressAttempt(
    userId: string,
    attemptId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean> {
    const db = await this.db();
    return db.$transaction(async (tx) => {
      // `finishedAt: null` is part of the WHERE, not a check-then-delete: a
      // graded exam is a student's record and support must not be able to
      // delete one, not even by racing a submit.
      const { count } = await tx.examAttempt.deleteMany({
        where: { id: attemptId, userId, finishedAt: null },
      });
      if (count === 0) return false;
      await tx.adminAction.create({ data: this.auditData(audit) });
      return true;
    });
  }
}

// ---------------------------------------------------------------------------
// In-memory store (tests / local tooling)
// ---------------------------------------------------------------------------

export class InMemoryAdminStore implements AdminStore {
  readonly users: AdminUserRecord[] = [];
  readonly entitlements: AdminEntitlementRecord[] = [];
  readonly payments: AdminPaymentRecord[] = [];
  readonly attempts: AdminAttemptRecord[] = [];
  readonly tutorThreads: (TutorThreadRow & { userId: string })[] = [];
  readonly actions: AdminActionRow[] = [];
  private nextId = 1;

  async findUserByEmail(email: string): Promise<AdminUserRecord | null> {
    const needle = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === needle) ?? null;
  }

  async listEntitlements(userId: string): Promise<AdminEntitlementRecord[]> {
    return this.entitlements
      .filter((e) => e.userId === userId)
      .sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
  }

  async listPayments(userId: string): Promise<AdminPaymentRecord[]> {
    return this.payments
      .filter((p) => p.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listAttempts(userId: string): Promise<AdminAttemptRecord[]> {
    return this.attempts
      .filter((a) => a.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  async tutorSpend(userId: string): Promise<AdminTutorRecord> {
    return rollUpTutor(this.tutorThreads.filter((t) => t.userId === userId));
  }

  async listActions(subjectId: string, limit: number): Promise<AdminActionRow[]> {
    return this.actions
      .filter((a) => a.subjectId === subjectId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  private audit(input: CreateAdminActionInput): AdminActionRow {
    const row: AdminActionRow = {
      id: `act-${this.nextId++}`,
      detail: input.detail ?? null,
      createdAt: new Date(),
      ...input,
    };
    this.actions.push(row);
    return row;
  }

  async grantEntitlement(
    input: CreateGrantInput,
    audit: CreateAdminActionInput,
  ): Promise<AdminEntitlementRecord> {
    const row: AdminEntitlementRecord = { id: `ent-${this.nextId++}`, ...input };
    this.entitlements.push(row);
    this.audit(audit);
    return row;
  }

  async revokeEntitlement(
    userId: string,
    entitlementId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean> {
    const i = this.entitlements.findIndex(
      (e) => e.id === entitlementId && e.userId === userId,
    );
    if (i === -1) return false;
    this.entitlements.splice(i, 1);
    this.audit(audit);
    return true;
  }

  async addFreeExamGrants(
    userId: string,
    delta: number,
    audit: CreateAdminActionInput,
  ): Promise<number> {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`InMemoryAdminStore: no user ${userId}`);
    user.freeExamGrants += delta;
    this.audit(audit);
    return user.freeExamGrants;
  }

  async deleteInProgressAttempt(
    userId: string,
    attemptId: string,
    audit: CreateAdminActionInput,
  ): Promise<boolean> {
    const i = this.attempts.findIndex(
      (a) => a.id === attemptId && a.userId === userId && a.finishedAt === null,
    );
    if (i === -1) return false;
    this.attempts.splice(i, 1);
    this.audit(audit);
    return true;
  }
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: AdminStore | null = null;

/** Tests inject a fake (or null to reset); production falls back to Prisma. */
export function setAdminStore(s: AdminStore | null): void {
  store = s;
}

export function getAdminStore(): AdminStore {
  if (!store) store = new PrismaAdminStore();
  return store;
}
