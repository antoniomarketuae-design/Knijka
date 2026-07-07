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

export interface TutorMessage {
  role: "user" | "assistant";
  content: string;
  /** Epoch ms — also drives the daily budget window. */
  ts: number;
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
      out.push({ role: m.role, content: m.content, ts: m.ts });
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
