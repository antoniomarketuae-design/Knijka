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
import type {
  EventPosition,
  ExamTermination,
  ObjectiveOutcome,
  SessionNearMiss,
} from "./types";

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
  /**
   * A15 (additive, optional — absent on rows saved before A15):
   * training-layer score with repeat escalations (A9) so history can show
   * „официален vs тренировъчен“; event positions + near-misses for future
   * replay/mistake-map rendering of stored sessions. All display metadata —
   * verdict/score above stay the only graded truth.
   */
  effectiveScore?: number;
  eventPositions?: EventPosition[];
  nearMisses?: SessionNearMiss[];
  /**
   * A13 (additive, optional — absent on training lessons and pre-A13 rows):
   * the session ran in exam mode. A passed sim exam is the strongest
   * readiness evidence a stored session carries — persisted so A14's
   * learner-model/gamification paths can weight it later WITHOUT re-deriving
   * from lesson ids (no A14 logic changes shipped with A13).
   */
  examMode?: boolean;
  /** A13: why the exam terminated (server-derived, examMode rows only). */
  examTermination?: ExamTermination;
  /**
   * S1 (additive; scenario sessions only): rubric stars the SERVER computed
   * from the graded result + validated wire measurement channels
   * (finishLessonAction → scoreRubric). Drives the catalog's personal-best
   * display and the soft level unlock (scenario/progress.ts) — never any
   * official score.
   */
  rubricStars?: 1 | 2 | 3;
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
  const parsed: SimSessionEventsJson = {
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
  // A15 optional fields — same opaque-but-shape-checked treatment.
  if (typeof o.effectiveScore === "number" && Number.isFinite(o.effectiveScore)) {
    parsed.effectiveScore = o.effectiveScore;
  }
  if (Array.isArray(o.eventPositions)) {
    parsed.eventPositions = o.eventPositions as EventPosition[];
  }
  if (Array.isArray(o.nearMisses)) {
    parsed.nearMisses = o.nearMisses as SessionNearMiss[];
  }
  // A13 optional fields — same treatment as the A15 additions above.
  if (o.examMode === true) {
    parsed.examMode = true;
  }
  if (typeof o.examTermination === "object" && o.examTermination !== null) {
    parsed.examTermination = o.examTermination as ExamTermination;
  }
  // S1: rubric stars — strict members only (1 | 2 | 3).
  if (o.rubricStars === 1 || o.rubricStars === 2 || o.rubricStars === 3) {
    parsed.rubricStars = o.rubricStars;
  }
  return parsed;
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
  /** S1: rubric stars from the events payload (scenario sessions); null on
   *  non-scenario rows / unreadable payloads / pre-S1 rows. */
  rubricStars: number | null;
}

/**
 * A15 history row — everything the „История на сесиите“ screen needs: the
 * stored debrief text plus the parsed events payload (null when the stored
 * Json is foreign/corrupt — the row still lists with its summary columns).
 */
export interface SimSessionDetailRow {
  id: string;
  lessonId: string;
  startedAt: Date;
  finishedAt: Date | null;
  score: number | null;
  debrief: string | null;
  events: SimSessionEventsJson | null;
}

export interface SimSessionStore {
  /** One write per finished session (sessions persist only at the end, v1). */
  saveSession(userId: string, input: SaveSimSessionInput): Promise<{ id: string }>;
  /** All sessions of the user, newest first — input for progression. */
  listSessions(userId: string): Promise<SimSessionListRow[]>;
  /** A15: newest-first detailed rows for the session-history screen. */
  listRecentSessions(userId: string, limit: number): Promise<SimSessionDetailRow[]>;
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
      return rows.map((r) => {
        const parsed = parseSimSessionEvents(r.events);
        return {
          id: r.id,
          lessonId: r.lessonId,
          finishedAt: r.finishedAt,
          score: r.score,
          passed: parsed?.passed ?? false,
          rubricStars: parsed?.rubricStars ?? null,
        };
      });
    },

    async listRecentSessions(userId, limit) {
      const db = await getDb();
      const rows = await db.simSession.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        take: Math.max(1, Math.min(limit, 50)),
        select: {
          id: true,
          lessonId: true,
          startedAt: true,
          finishedAt: true,
          score: true,
          debrief: true,
          events: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        score: r.score,
        debrief: r.debrief,
        events: parseSimSessionEvents(r.events),
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
