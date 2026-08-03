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

/**
 * WHY listSessions HAS NO `take`, AND MUST NOT GROW ONE.
 *
 * A `take: 200` lived here briefly. It was wrong, and nothing went red.
 *
 * The cost this query had was the `events` blob, not the row count — every
 * ViolationEvent carries titleBg and explanationBg, ~430 bytes of Bulgarian
 * prose denormalised into a row that already holds it in the code. Dropping
 * `events` from the select IS the saving; the rows themselves are six scalars
 * on the (userId, startedAt) index.
 *
 * The cap read as safe against a comment saying the catalogue "unlocks on has
 * any attempt passed" — but FR-06 had already changed computeProgression to
 * unlock on an attempt PRESENT IN THE LIST (progression.ts:74), and
 * isExamUnlocked still needs a pass PRESENT IN THE LIST (progression.ts:109).
 * Newest-first means the rows a window drops are the OLDEST: the curriculum
 * lessons a student drove before moving into the scenario library. Measured
 * over 260 scenario drives + 8 older curriculum passes — full history: 8
 * lessons unlocked, exam open. Newest-200: 1 lesson unlocked, exam LOCKED,
 * полигон re-locked. It robs the heaviest user, who is the exact student the
 * cap was written for.
 *
 * If a bound is ever genuinely needed, the two unlock gates need their own
 * query that cannot lose a pass (groupBy lessonId with _max) — not a window
 * over the shared list.
 */

export interface SimSessionStore {
  /** One write per finished session (sessions persist only at the end, v1). */
  saveSession(userId: string, input: SaveSimSessionInput): Promise<{ id: string }>;
  /** Every one of the user's sessions, summary columns only — see the note above. */
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
          // The two summary columns are written from the SAME payload in the
          // same INSERT, so they can never disagree with it. `events` stays
          // authoritative; these are its projection for list reads.
          passed: input.events.passed,
          rubricStars: input.events.rubricStars ?? null,
        },
        select: { id: true },
      });
      return { id: row.id };
    },

    async listSessions(userId) {
      const db = await getDb();
      // NOT `events: true`. That one word made this query fetch every rule
      // event the student had ever generated — titleBg and explanationBg and
      // all — to compute two booleans' worth of progression. The summary
      // columns hold exactly what the three consumers read.
      const rows = await db.simSession.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true,
          lessonId: true,
          finishedAt: true,
          score: true,
          passed: true,
          rubricStars: true,
        },
      });
      return rows.map((r) => ({
        id: r.id,
        lessonId: r.lessonId,
        finishedAt: r.finishedAt,
        score: r.score,
        // NULL means "this drive records no such fact" — an unfinished row, a
        // non-scenario lesson, or a payload parseSimSessionEvents() refused.
        // The old code produced exactly these values from an unreadable blob.
        passed: r.passed ?? false,
        rubricStars: r.rubricStars,
      }));
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
