/**
 * Persistence boundary for the „Позна ли се?" calibration gate (doc 82 §5.3
 * I1) — the write side of ./calibration.ts.
 *
 * Same pattern as ./store.ts: ALL Prisma access hides behind an injectable
 * interface, the client is imported lazily (importing this file never needs
 * DATABASE_URL) and unit tests inject an in-memory fake.
 *
 * TRUST MODEL, which is the whole reason this file is not two lines in a
 * server action: the client sends ONLY what the student believed. The actual
 * points and the actual verdict are read back off the already-persisted
 * SimSession *here*, inside the same call, keyed on `userId` — so a
 * hand-crafted POST can neither claim someone else's drive nor supply the
 * "actual" it is supposed to be measured against. Calibration is a claim about
 * the student's judgement; letting the client define both sides of the
 * comparison would make it a claim about nothing.
 *
 * WRITE-ONCE, for the same reason: the gate reveals the engine's answer. A
 * second write after that reveal is not a prediction, it is a correction, and
 * the row would silently become evidence of a belief nobody held. A repeat
 * call returns the ORIGINAL record rather than an error — the student is
 * simply looking at the screen they already answered.
 *
 * SERVER ONLY. Deliberately NOT re-exported from ./index.ts: the pure half
 * (./calibration) is deep-imported by the client gate widget, and a barrel
 * re-export is a static edge whether or not the symbol is called (audit M-26).
 */

import type { CalibrationRecord, PredictionInput } from "./calibration";

/**
 * Outcome of a gate submission.
 *  - `recorded`   — first answer, stored, engine's verdict attached.
 *  - `already`    — this drive was already predicted; the ORIGINAL comes back.
 *  - `unavailable`— no such session for this user, or it carries no official
 *                   score to be wrong about (an unfinished/legacy row). Not an
 *                   error the student can act on, so it is a status and the
 *                   screen just skips the gate.
 */
export type RecordPredictionStatus = "recorded" | "already" | "unavailable";

export interface RecordPredictionResult {
  status: RecordPredictionStatus;
  /** Present on `recorded` and `already`; absent on `unavailable`. */
  record?: CalibrationRecord;
}

export interface CalibrationStore {
  /** Store one prediction, pairing it with the SERVER's own actuals. */
  record(
    userId: string,
    simSessionId: string,
    input: PredictionInput,
  ): Promise<RecordPredictionResult>;
  /** Newest-first records for the trend screen. */
  list(userId: string, limit?: number): Promise<CalibrationRecord[]>;
  /** This drive's record, if the gate was already answered; null otherwise. */
  find(userId: string, simSessionId: string): Promise<CalibrationRecord | null>;
}

/** How many records the trend screen reads. Far past what a chart can show —
 *  the cap exists so one very active account cannot make the page unbounded. */
export const CALIBRATION_HISTORY_LIMIT = 60;

/**
 * Defensive read of the lesson verdict out of a stored SimSession events Json.
 *
 * The sim module owns that payload and parses it with its own validator; this
 * module deliberately re-derives the ONE field it needs instead of importing
 * across the boundary (exactly what ./store.ts:extractSimEvidence does for
 * rule events). An unreadable payload degrades to `false` — a drive we cannot
 * confirm passed did not pass, which is the conservative direction: it can
 * only ever mark the student MORE optimistic than they were, never less.
 */
export function readSessionPassed(events: unknown): boolean {
  if (typeof events !== "object" || events === null) return false;
  const o = events as Record<string, unknown>;
  return o.version === 1 && o.passed === true;
}

// ---------------------------------------------------------------------------
// Prisma-backed store (production default)
// ---------------------------------------------------------------------------

function createPrismaStore(): CalibrationStore {
  // Lazy so unit tests (which inject a fake) never evaluate @/lib/db.
  const getDb = async () => (await import("@/lib/db")).db;

  return {
    async record(userId, simSessionId, input) {
      const db = await getDb();

      // Answered already? Return what was stored — never the new guess.
      const existing = await db.simSelfPrediction.findFirst({
        where: { simSessionId, userId },
      });
      if (existing !== null) return { status: "already", record: existing };

      // userId in the WHERE, not just the id: a session id is a cuid another
      // account could guess at, and this is the only write path.
      const session = await db.simSession.findFirst({
        where: { id: simSessionId, userId },
        select: { lessonId: true, score: true, events: true },
      });
      if (session === null || session.score === null) return { status: "unavailable" };

      const row = {
        userId,
        lessonId: session.lessonId,
        predictedPoints: input.predictedPoints,
        predictedPass: input.predictedPass,
        actualPoints: session.score,
        actualPass: readSessionPassed(session.events),
      };

      try {
        const created = await db.simSelfPrediction.create({
          data: { simSessionId, ...row },
        });
        return { status: "recorded", record: created };
      } catch {
        // Lost the race with a double-submit (the primary key is the session).
        // Re-read rather than upsert: the FIRST answer is the honest one.
        const raced = await db.simSelfPrediction.findFirst({
          where: { simSessionId, userId },
        });
        return raced !== null ? { status: "already", record: raced } : { status: "unavailable" };
      }
    },

    async list(userId, limit = CALIBRATION_HISTORY_LIMIT) {
      const db = await getDb();
      return db.simSelfPrediction.findMany({
        where: { userId },
        orderBy: { recordedAt: "desc" },
        take: Math.max(1, Math.min(limit, CALIBRATION_HISTORY_LIMIT)),
      });
    },

    async find(userId, simSessionId) {
      const db = await getDb();
      return db.simSelfPrediction.findFirst({ where: { simSessionId, userId } });
    },
  };
}

// ---------------------------------------------------------------------------
// Injection point
// ---------------------------------------------------------------------------

let store: CalibrationStore | null = null;

/** Tests inject an in-memory fake here. */
export function setCalibrationStore(s: CalibrationStore | null): void {
  store = s;
}

export function getCalibrationStore(): CalibrationStore {
  if (!store) store = createPrismaStore();
  return store;
}
