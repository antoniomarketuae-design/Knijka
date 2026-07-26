/**
 * Persistence boundary for the tutor module (mirrors learning/store.ts).
 *
 * ALL Prisma access is isolated behind the TutorStore interface; unit tests
 * inject an in-memory fake via setTutorStore(). The Prisma client is
 * imported lazily so importing this file never requires DATABASE_URL.
 *
 * v1 keeps ONE continuous thread per user (TutorThread.messages is the full
 * Json array); token/cost counters accumulate on the same row.
 */

/** A law reference the citation whitelist accepted (prompt.ts extractCitations). */
export interface TutorCitation {
  act: string;
  ref: string;
}

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  /** Epoch ms — also drives the daily budget window. */
  ts: number;
  /**
   * ADR-002: the law references this reply is ALLOWED to display as citations —
   * the output of the server-side whitelist, persisted with the message.
   *
   * It lives here rather than being re-derived on read because the whitelist
   * can only be evaluated against the materials that were retrieved for THAT
   * turn; a later read has no way to reconstruct them, and re-validating
   * against a fresh retrieval would quietly approve a different set. Absent on
   * user messages, and on assistant messages written before the UI learned to
   * read it — both render with no citation chips at all, which is the safe
   * direction to fail.
   */
  citations?: TutorCitation[];
}

export interface TutorThreadRecord {
  id: string;
  messages: TutorMessage[];
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

export interface TutorUsageDelta {
  tokensIn: number;
  tokensOut: number;
  costMicroUsd: number;
}

export interface TutorStore {
  /** The user's (single, v1) thread — most recently updated if several. */
  getThreadByUser(userId: string): Promise<TutorThreadRecord | null>;
  createThread(userId: string): Promise<TutorThreadRecord>;
  /**
   * Replace the thread's message array and accumulate usage counters.
   * `messages` is the FULL new array (prior history + the new exchange).
   */
  saveExchange(
    threadId: string,
    messages: TutorMessage[],
    usage: TutorUsageDelta,
  ): Promise<void>;

  /**
   * Micro-USD spent across ALL users on `day` ("YYYY-MM-DD", Europe/Sofia).
   * Feeds the daily kill-switch (budget.ts); 0 when the day has no row yet.
   */
  spentOnDay(day: string): Promise<number>;
  /**
   * Add one call's usage to that day's global total. Written in the same code
   * path as saveExchange so the ledger cannot drift from what was billed.
   */
  recordDaySpend(day: string, usage: TutorUsageDelta): Promise<void>;
}

/**
 * Defensive parse of the citations field. Anything that is not a well-formed
 * {act, ref} pair is dropped rather than coerced: this array is the UI's
 * permission to render a law-citation chip, so a half-readable row must
 * produce no citation, never a plausible-looking one.
 */
function parseTutorCitations(value: unknown): TutorCitation[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: TutorCitation[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const c = item as Record<string, unknown>;
    if (typeof c.act === "string" && typeof c.ref === "string") {
      out.push({ act: c.act, ref: c.ref });
    }
  }
  return out;
}

/** Defensive parse of the messages Json column — drops malformed entries. */
export function parseTutorMessages(value: unknown): TutorMessage[] {
  if (!Array.isArray(value)) return [];
  const out: TutorMessage[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const m = item as Record<string, unknown>;
    if (
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      typeof m.ts === "number"
    ) {
      const citations = parseTutorCitations(m.citations);
      out.push({
        role: m.role,
        content: m.content,
        ts: m.ts,
        ...(citations ? { citations } : {}),
      });
    }
  }
  return out;
}

function createPrismaStore(): TutorStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async getThreadByUser(userId) {
      const db = await getDb();
      const row = await db.tutorThread.findFirst({
        where: { userId },
        orderBy: { updatedAt: "desc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        messages: parseTutorMessages(row.messages),
        tokensIn: row.tokensIn,
        tokensOut: row.tokensOut,
        costMicroUsd: row.costMicroUsd,
      };
    },

    async createThread(userId) {
      const db = await getDb();
      const row = await db.tutorThread.create({ data: { userId } });
      return {
        id: row.id,
        messages: [],
        tokensIn: 0,
        tokensOut: 0,
        costMicroUsd: 0,
      };
    },

    async saveExchange(threadId, messages, usage) {
      const db = await getDb();
      await db.tutorThread.update({
        where: { id: threadId },
        data: {
          // Prisma Json column — TutorMessage[] is plain JSON data.
          messages: messages as unknown as object[],
          tokensIn: { increment: usage.tokensIn },
          tokensOut: { increment: usage.tokensOut },
          costMicroUsd: { increment: usage.costMicroUsd },
        },
      });
    },

    async spentOnDay(day) {
      const db = await getDb();
      const row = await db.tutorSpendDay.findUnique({ where: { day } });
      return row?.costMicroUsd ?? 0;
    },

    async recordDaySpend(day, usage) {
      const db = await getDb();
      // Upsert-with-increment, not read-modify-write: two concurrent tutor
      // replies must not lose one of their costs to a lost update, or the
      // kill-switch under-counts exactly when traffic is highest.
      await db.tutorSpendDay.upsert({
        where: { day },
        create: {
          day,
          calls: 1,
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          costMicroUsd: usage.costMicroUsd,
        },
        update: {
          calls: { increment: 1 },
          tokensIn: { increment: usage.tokensIn },
          tokensOut: { increment: usage.tokensOut },
          costMicroUsd: { increment: usage.costMicroUsd },
        },
      });
    },
  };
}

let store: TutorStore | null = null;

/** Test suites inject an in-memory fake here (see fixtures.ts). */
export function setTutorStore(s: TutorStore | null): void {
  store = s;
}

export function getTutorStore(): TutorStore {
  if (!store) {
    store = createPrismaStore();
  }
  return store;
}
