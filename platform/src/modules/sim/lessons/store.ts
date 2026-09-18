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
  /**
   * ADR-009 (additive, optional): the mistakes THIS LESSON EXISTS TO TEACH that
   * the student made anyway — the whole reason `passed` above is false on a
   * practice rung with a clean изпитен лист (founder Ruling A, 2026-09-17; doc
   * 92 §5.8).
   *
   * NO `titleBg`, DELIBERATELY. The history screen retitles from the violation
   * catalogue at render time (`historyLessonMistakes.ts`), on exactly the terms
   * `historyMistakes.ts` already states for a charged event: a stored payload
   * may LIST what happened, never name it — `detail` selects a row of an
   * AUTHORED per-act table and an unrecognised value falls back to the pooled
   * one (ADR-002). A title denormalised into this column would also freeze the
   * catalogue's wording on the day of the drive, which is the shape that shipped
   * «Удар в друго превозно средство ×2» over a drive that struck a person.
   *
   * ABSENT, NOT EMPTY, on every exam rung, every sandbox and every clean
   * practice drive — so a row written before ADR-009 and a clean row written
   * after it are the same shape, and no reader has to tell «[]» from «never
   * measured» (the same discipline `LessonResult.lessonMistakes` keeps).
   */
  lessonMistakes?: StoredLessonMistake[];
  /**
   * THE PRE-ADR-009 READING OF `passed`, STORED EXPLICITLY (doc 92 §5.9):
   * `summary.passed && completedAll && !aborted` — the изпитен лист plus the
   * route, with the lesson rule left out.
   *
   * WHY IT EXISTS. `passed` above used to mean exactly that expression, and
   * ADR-009 added a fourth conjunct to it. Self-calibration measures whether a
   * student can read THE EXAM (`modules/learning/calibration.ts:227-230`, the
   * trend page's own legend), and the exam rung is untouched by Ruling A — so
   * the instrument has to keep reading the exam verdict rather than silently
   * change what it measures the day the lesson rule landed. It is written on
   * EVERY row, so «the field is missing» means «written before 2026-09-18» and
   * nothing else; `calibrationStore.readSessionPassed` falls back to `passed`
   * for those rows, where the two are the same number by construction.
   */
  sheetRoutePassed?: boolean;
  /**
   * THE ИЗПИТЕН ЛИСТ ALONE — `result.summary.passed`, with neither the route
   * nor the lesson rule folded in (doc 92 §5.8).
   *
   * WHY A THIRD BOOLEAN AND NOT A DERIVATION FROM THE OTHER TWO. The history
   * row has to answer «is this drive „Не е взет" or „Неиздържан"?», and the
   * result screen answers it by asking the sheet FIRST (`sessionVerdict`: a
   * failed лист is «Неиздържан» whatever else happened). `sheetRoutePassed`
   * cannot stand in: it folds `completedAll`, and 425 of the 654 hit drives on
   * this tree are hit + clean sheet + route unfinished, where gating the row on
   * it would break it in the other direction. `passed` is now the LESSON
   * verdict. So the sheet's own answer is stored, once, on every row.
   *
   * ABSENT means «written before 2026-09-18» and nothing else — the fold reads
   * `!== false`, so an old row keeps the label it was given on the day (doc 92
   * §6: stored history is not regraded).
   */
  sheetPassed?: boolean;
}

/**
 * One stored lesson-mistake row: the code, when it happened, and whether any
 * occurrence of it reached the изпитен лист. `LessonMistakeHit` minus the
 * retrieved copy — see `SimSessionEventsJson.lessonMistakes` for why the title
 * is not here.
 */
export interface StoredLessonMistake {
  code: string;
  t: number;
  /** Some occurrence was charged — under ADR-009 that can only be a repeat. */
  charged: boolean;
  /** The act inside the code (`ViolationEvent.detail`) — a catalogue selector. */
  detail?: string;
}

/**
 * Shape-check a stored `lessonMistakes` array, dropping malformed ENTRIES
 * rather than refusing the whole payload (doc 92 §5.8).
 *
 * Per-entry rather than all-or-nothing because the alternative punishes the
 * student twice: a single bad row would make `parseSimSessionEvents` return
 * null for the session, and an unreadable payload takes the mistake list, the
 * near-miss stat and the training score with it. One dropped row costs one line
 * of the reason list.
 *
 * `detail` is kept only when it is a string and is NOT length-capped here. It
 * reaches exactly one consumer — `actCopy(code, detail)`, a lookup in our own
 * authored table — so a tampered or absurd value resolves the pooled row and
 * nothing else; the write side already caps it at `wire.ts MAX_DETAIL_LEN`, and
 * a second, different cap in the read path would silently disagree with it.
 */
function parseStoredLessonMistakes(value: unknown): StoredLessonMistake[] {
  if (!Array.isArray(value)) return [];
  const rows: StoredLessonMistake[] = [];
  for (const raw of value) {
    if (typeof raw !== "object" || raw === null) continue;
    const o = raw as Record<string, unknown>;
    if (typeof o.code !== "string" || o.code.length === 0) continue;
    if (typeof o.t !== "number" || !Number.isFinite(o.t)) continue;
    if (typeof o.charged !== "boolean") continue;
    const row: StoredLessonMistake = { code: o.code, t: o.t, charged: o.charged };
    if (typeof o.detail === "string") row.detail = o.detail;
    rows.push(row);
  }
  return rows;
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
  // ADR-009: the lesson's own mistakes. Assigned only when a row SURVIVED the
  // shape check, so «every entry was malformed» and «there were none» arrive at
  // the history screen as the same absent field rather than as an empty array
  // that would read as a measured fact.
  const lessonMistakes = parseStoredLessonMistakes(o.lessonMistakes);
  if (lessonMistakes.length > 0) {
    parsed.lessonMistakes = lessonMistakes;
  }
  // ADR-009 §5.9: the exam-only reading of the verdict. Absent on every row
  // written before 2026-09-18 — see the field's declaration.
  if (typeof o.sheetRoutePassed === "boolean") {
    parsed.sheetRoutePassed = o.sheetRoutePassed;
  }
  // ADR-009 §5.8: the изпитен лист on its own, for the history row's word.
  // Same treatment and the same dating rule as the field above it.
  if (typeof o.sheetPassed === "boolean") {
    parsed.sheetPassed = o.sheetPassed;
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
