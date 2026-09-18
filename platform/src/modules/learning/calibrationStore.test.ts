/**
 * The write side of the „Позна ли се?" gate (doc 82 §5.3 I1).
 *
 * The integrity claim of the whole mechanic lives in this file: the client
 * sends ONLY what it believed, the actuals are read back off the persisted
 * session inside the same call keyed on `userId`, and the first answer is the
 * only answer. If any of those slips the row stops being evidence of a belief
 * and becomes a number the client chose about itself — so they are tested
 * against a fake Prisma client rather than trusted to a comment.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCalibrationStore, readSessionPassed, setCalibrationStore } from "./calibrationStore";

interface PredictionRow {
  simSessionId: string;
  userId: string;
  lessonId: string;
  predictedPoints: number;
  predictedPass: boolean;
  actualPoints: number;
  actualPass: boolean;
  recordedAt: Date;
}

interface SessionRow {
  id: string;
  userId: string;
  lessonId: string;
  score: number | null;
  events: unknown;
}

/** Rewritten per test; the mock factory below closes over the live bindings. */
let predictions: PredictionRow[];
let sessions: SessionRow[];
/** Set by the race test: make the very next create() reject, once. */
let createFailsOnce = false;

function matches(row: object, where: Record<string, unknown>): boolean {
  const r = row as Record<string, unknown>;
  return Object.entries(where).every(([k, v]) => r[k] === v);
}

vi.mock("@/lib/db", () => ({
  db: {
    simSelfPrediction: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        predictions.find((p) => matches(p, where)) ?? null,
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        predictions.filter((p) => matches(p, where)),
      create: async ({ data }: { data: Omit<PredictionRow, "recordedAt"> }) => {
        if (createFailsOnce) {
          createFailsOnce = false;
          throw new Error("unique constraint");
        }
        const row: PredictionRow = { ...data, recordedAt: new Date("2026-07-26T09:00:00Z") };
        predictions.push(row);
        return row;
      },
    },
    simSession: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        sessions.find((s) => matches(s, where)) ?? null,
    },
  },
}));

const EVENTS_PASSED = { version: 1, passed: true };

beforeEach(() => {
  predictions = [];
  sessions = [
    {
      id: "sess-1",
      userId: "u1",
      lessonId: "sc-park-perp-rev@L1",
      score: 7,
      events: { version: 1, passed: false },
    },
  ];
  createFailsOnce = false;
  // Drop any memoized store so each test builds a fresh Prisma-backed one
  // against the fake above.
  setCalibrationStore(null);
});

describe("readSessionPassed", () => {
  it("reads the verdict out of the versioned payload the sim module writes", () => {
    expect(readSessionPassed({ version: 1, passed: true })).toBe(true);
    expect(readSessionPassed({ version: 1, passed: false })).toBe(false);
  });

  it("degrades an unreadable payload to 'did not pass' (the conservative side)", () => {
    // A drive we cannot confirm passed can only ever make the student look
    // MORE optimistic than they were — never less, which would flatter them.
    expect(readSessionPassed(null)).toBe(false);
    expect(readSessionPassed(undefined)).toBe(false);
    expect(readSessionPassed("passed")).toBe(false);
    expect(readSessionPassed({ passed: true })).toBe(false); // no version
    expect(readSessionPassed({ version: 2, passed: true })).toBe(false); // future format
    expect(readSessionPassed({ version: 1, passed: "true" })).toBe(false);
  });

  /**
   * ADR-009 (doc 92 §5.9) — THE INSTRUMENT MUST KEEP MEASURING THE SAME THING.
   *
   * `SimSessionEventsJson.passed` used to mean «изпитен лист + route»; founder
   * Ruling A added a fourth conjunct to it («and the lesson's own mistake did
   * not happen»). This function feeds `actualPass`, i.e. the «Изпитът каза …»
   * tile, `verdictAgrees` («the claim that maps onto the real exam») and the
   * trend page's «разликата между твоя отговор и този на изпитната логика» — a
   * claim about THE EXAM, and the exam rung is untouched by the ruling.
   *
   * Read as the exam's answer, the new `passed` would count a student who read
   * his own clean sheet correctly as having got the exam WRONG: 133 practice
   * drives on this tree finish the route with a clean sheet and are not taken.
   */
  it("reads the EXAM verdict — `sheetRoutePassed` — not the new lesson one", () => {
    // The state ADR-009 created: clean изпитен лист, route finished, lesson not
    // taken. The student who answered «Да, издържах» was right about the exam.
    expect(readSessionPassed({ version: 1, passed: false, sheetRoutePassed: true })).toBe(true);
    // And the other direction: a failed sheet is a failed sheet.
    expect(readSessionPassed({ version: 1, passed: false, sheetRoutePassed: false })).toBe(false);
  });

  it("lets the field win over `passed`, in both directions", () => {
    // Vacuity guard for the case above: if the fallback simply ORed the two,
    // the assertion above would pass while the field did nothing.
    expect(readSessionPassed({ version: 1, passed: true, sheetRoutePassed: false })).toBe(false);
  });

  it("falls back to `passed` on a row written before ADR-009", () => {
    // Those rows carry no field, and their `passed` IS that same expression —
    // so this is the same number under its old name, not a guess. Coercing
    // them to `false` would tell the trend page that every drive a student
    // made before 2026-09-18 failed the exam.
    expect(readSessionPassed({ version: 1, passed: true })).toBe(true);
    expect(readSessionPassed({ version: 1, passed: false })).toBe(false);
    // A non-boolean is not a reading — fall back rather than coerce.
    expect(readSessionPassed({ version: 1, passed: true, sheetRoutePassed: "true" })).toBe(true);
    expect(readSessionPassed({ version: 1, passed: true, sheetRoutePassed: 0 })).toBe(true);
  });

  it("ignores the lesson's own mistakes — that is a different question", () => {
    // Deliberately NOT consulted here. Whether the lesson counted is answered
    // on the screens after this gate (§5.9's reveal line, the result screen's
    // «Не е взет», the history row), and folding it into `actualPass` is
    // exactly the revision-1 approach that doc 92 §5.9 withdraws.
    expect(
      readSessionPassed({
        version: 1,
        passed: false,
        sheetRoutePassed: true,
        lessonMistakes: [{ code: "VULNERABLE_PASS_TOO_CLOSE", t: 20.9, charged: false }],
      }),
    ).toBe(true);
  });
});

describe("CalibrationStore.record", () => {
  it("pairs the belief with the SERVER's own actuals, never the client's", () => {
    // The client sent a prediction and nothing else; points and verdict come
    // off the persisted session. Letting the client define both sides of the
    // comparison would make it a claim about nothing.
    return getCalibrationStore()
      .record("u1", "sess-1", { predictedPoints: 2, predictedPass: true })
      .then((res) => {
        expect(res.status).toBe("recorded");
        expect(res.record).toMatchObject({
          predictedPoints: 2,
          predictedPass: true,
          actualPoints: 7,
          actualPass: false,
          lessonId: "sc-park-perp-rev@L1",
        });
      });
  });

  it("reads the pass verdict out of the session's events payload", async () => {
    sessions[0].events = EVENTS_PASSED;
    sessions[0].score = 0;
    const res = await getCalibrationStore().record("u1", "sess-1", {
      predictedPoints: 3,
      predictedPass: false,
    });
    expect(res.record).toMatchObject({ actualPoints: 0, actualPass: true });
  });

  it("stores the EXAM verdict for a lesson that was not taken (ADR-009 §5.9)", async () => {
    // The row that reaches the trend page and its «сгреши и самата присъда»
    // clause. The drive: clean изпитен лист, route finished, the lesson's own
    // mistake committed — so `passed` is false and the exam reading is true.
    // A stored `actualPass: false` here would count a correct call as a wrong
    // one on every one of these drives.
    sessions[0].events = {
      version: 1,
      passed: false,
      sheetRoutePassed: true,
      lessonMistakes: [{ code: "VULNERABLE_PASS_TOO_CLOSE", t: 20.9, charged: false }],
    };
    sessions[0].score = 0;
    const res = await getCalibrationStore().record("u1", "sess-1", {
      predictedPoints: 0,
      predictedPass: true,
    });
    expect(res.record).toMatchObject({ actualPoints: 0, actualPass: true });
  });

  it("is write-once: a second answer returns the ORIGINAL, not the new guess", async () => {
    // The first response revealed the engine's answer, so anything after it is
    // a correction, not a prediction. Storing it would leave the row as
    // evidence of a belief nobody held.
    const store = getCalibrationStore();
    await store.record("u1", "sess-1", { predictedPoints: 2, predictedPass: true });
    const second = await store.record("u1", "sess-1", { predictedPoints: 7, predictedPass: false });
    expect(second.status).toBe("already");
    expect(second.record).toMatchObject({ predictedPoints: 2, predictedPass: true });
    expect(predictions).toHaveLength(1);
  });

  it("re-reads rather than upserts when a double-submit loses the create race", async () => {
    const store = getCalibrationStore();
    // Simulate the racing writer landing first: a row exists AND create throws.
    predictions.push({
      simSessionId: "sess-1",
      userId: "u1",
      lessonId: "sc-park-perp-rev@L1",
      predictedPoints: 1,
      predictedPass: true,
      actualPoints: 7,
      actualPass: false,
      recordedAt: new Date("2026-07-26T08:59:00Z"),
    });
    createFailsOnce = true;
    const res = await store.record("u1", "sess-1", { predictedPoints: 9, predictedPass: false });
    expect(res.status).toBe("already");
    expect(res.record?.predictedPoints).toBe(1);
  });

  it("refuses another account's session id instead of answering for it", async () => {
    // A session id is a cuid another account could guess at, and this is the
    // only write path — so `userId` is in the WHERE, not just the id.
    const res = await getCalibrationStore().record("u2", "sess-1", {
      predictedPoints: 2,
      predictedPass: true,
    });
    expect(res.status).toBe("unavailable");
    expect(res.record).toBeUndefined();
    expect(predictions).toHaveLength(0);
  });

  it("stores nothing for a session that carries no official score", async () => {
    sessions[0].score = null;
    const res = await getCalibrationStore().record("u1", "sess-1", {
      predictedPoints: 2,
      predictedPass: true,
    });
    expect(res.status).toBe("unavailable");
    expect(predictions).toHaveLength(0);
  });
});

describe("CalibrationStore.list / find", () => {
  it("returns only the caller's own rows", async () => {
    const store = getCalibrationStore();
    await store.record("u1", "sess-1", { predictedPoints: 2, predictedPass: true });
    expect(await store.list("u1")).toHaveLength(1);
    expect(await store.list("u2")).toHaveLength(0);
    expect(await store.find("u2", "sess-1")).toBeNull();
    expect(await store.find("u1", "sess-1")).not.toBeNull();
  });
});
