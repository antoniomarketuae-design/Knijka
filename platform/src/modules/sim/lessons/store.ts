/**
 * Persistence boundary of the lessons subsystem — writes SimSession rows.
 *
 * Same pattern as modules/gamification/store.ts & modules/learning/store.ts:
 * ALL Prisma access hides behind an injectable interface, the Prisma client
 * is imported lazily (importing this file never needs DATABASE_URL), and unit
 * tests inject an in-memory fake via setSimSessionStore().
 *
 * Schema mapping (prisma/schema.prisma → SimSession):
 *   score   = official penalty-point total (LOWER is better; 0 = clean)
 *   events  = SimSessionEventsJson (versioned payload below: verdict + full
 *             rule-event log + objectives timeline — drives replay & debrief)
 *   debrief = the debrief text (template v1; the AI tutor layer will write
 *             richer text through the same column later)
 * The lesson VERDICT (passed) has no dedicated column by design — it lives in
 * the events payload and is parsed back defensively for progression.
 */

import type { ScorableEvent } from "../rules";
import type { ObjectiveOutcome } from "./types";

// ---------------------------------------------------------------------------
// The versioned Json payload of SimSession.events
// ---------------------------------------------------------------------------

export interface SimSessionEventsJson {
  version: 1;
  /** Lesson verdict: official pass AND all objectives AND not aborted. */
  passed: boolean;
  aborted: boolean;
  /** A collision occurred — graded as a terminated exam. */
  terminated: boolean;
  completedAll: boolean;
  /** Full chronological rule-event log (violations + commendations). */
  ruleEvents: ScorableEvent[];
  /** Objectives timeline: what was completed and when. */
  objectives: ObjectiveOutcome[];
}

/**
 * Defensive parse of a stored events column — never trust stored Json.
 * Returns null for foreign/corrupt payloads (row still lists, verdict false).
 */
export function parseSimSessionEvents(value: unknown): SimSessionEventsJson | null {
  if (typeof value !== "object" || value === null) return null;
  const o = value as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (
    typeof o.passed !== "boolean" ||
    typeof o.aborted !== "boolean" ||
    typeof o.terminated !== "boolean" ||
    typeof o.completedAll !== "boolean" ||
    !Array.isArray(o.ruleEvents) ||
    !Array.isArray(o.objectives)
  ) {
    return null;
  }
  return {
    version: 1,
    passed: o.passed,
    aborted: o.aborted,
    terminated: o.terminated,
    completedAll: o.completedAll,
    // Events/objectives were serialized by us; keep them opaque on read —
    // consumers that need details (replay/debrief) re-validate field by field.
    ruleEvents: o.ruleEvents as ScorableEvent[],
    objectives: o.objectives as ObjectiveOutcome[],
  };
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface SaveSimSessionInput {
  lessonId: string;
  startedAt: Date;
  finishedAt: Date;
  /** Penalty-point total (0 = perfect). */
  score: number;
  events: SimSessionEventsJson;
  debrief: string;
}

export interface SimSessionListRow {
  id: string;
  lessonId: string;
  finishedAt: Date | null;
  score: number | null;
  /** Parsed from the events payload; false when the payload is unreadable. */
  passed: boolean;
}

export interface SimSessionStore {
  /** One write per finished session (sessions persist only at the end, v1). */
  saveSession(userId: string, input: SaveSimSessionInput): Promise<{ id: string }>;
  /** All sessions of the user, newest first — input for progression. */
  listSessions(userId: string): Promise<SimSessionListRow[]>;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

function createPrismaStore(): SimSessionStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async saveSession(userId, input) {
      const db = await getDb();
      const row = await db.simSession.create({
        data: {
          userId,
          lessonId: input.lessonId,
          startedAt: input.startedAt,
          finishedAt: input.finishedAt,
          score: input.score,
          // Structured clone through JSON keeps the column plain Json.
          events: JSON.parse(JSON.stringify(input.events)),
          debrief: input.debrief,
        },
        select: { id: true },
      });
      return { id: row.id };
    },

    async listSessions(userId) {
      const db = await getDb();
      const rows = await db.simSession.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          lessonId: true,
          finishedAt: true,
          score: true,
          events: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        finishedAt: r.finishedAt,
        score: r.score,
        passed: parseSimSessionEvents(r.events)?.passed ?? false,
      }));
    },
  };
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: SimSessionStore | null = null;

/** Tests inject an in-memory fake here. */
export function setSimSessionStore(s: SimSessionStore | null): void {
  store = s;
}

export function getSimSessionStore(): SimSessionStore {
  if (!store) store = createPrismaStore();
  return store;
}
