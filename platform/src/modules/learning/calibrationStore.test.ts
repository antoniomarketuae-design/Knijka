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
