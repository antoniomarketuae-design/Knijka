/**
 * Sim → mastery feed (A14): severity-weighted mastery dips + SM-2 scheduling
 * for violations, weak positive evidence for commendations, sequential
 * compounding per concept — over the in-memory store fake.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { FakeLearningStore } from "./fixtures";
import { REVIEW_INTERVALS_DAYS } from "./scheduler";
import {
  recordSimObservations,
  SIM_COMMENDATION_GAIN,
  SIM_VIOLATION_DECAY,
} from "./simFeed";
import { setLearningStore } from "./store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const USER = "u1";

let store: FakeLearningStore;

beforeEach(() => {
  store = new FakeLearningStore();
  setLearningStore(store);
});

describe("recordSimObservations — violations", () => {
  it("опасна grades like a wrong answer: ×0.6, lapse++, review in 1 day", async () => {
    store.seedProgress(USER, {
      conceptId: "c-priority",
      mastery: 0.8,
      reps: 3,
      lapses: 0,
      dueAt: new Date(NOW.getTime() + 10 * DAY_MS),
    });

    await recordSimObservations(
      USER,
      [{ conceptId: "c-priority", kind: "violation", severity: "opasna" }],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-priority")!;
    expect(row.mastery).toBeCloseTo(0.8 * SIM_VIOLATION_DECAY.opasna, 10);
    expect(row.lapses).toBe(1);
    expect(row.reps).toBe(0); // SM-2 ladder reset
    expect(row.dueAt).toEqual(
      new Date(NOW.getTime() + REVIEW_INTERVALS_DAYS[0] * DAY_MS),
    );
  });

  it("основна dips milder (×0.75) but still schedules a review", async () => {
    store.seedProgress(USER, { conceptId: "c-road", mastery: 0.8, reps: 2 });

    await recordSimObservations(
      USER,
      [{ conceptId: "c-road", kind: "violation", severity: "osnovna" }],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-road")!;
    expect(row.mastery).toBeCloseTo(0.8 * SIM_VIOLATION_DECAY.osnovna, 10);
    expect(row.lapses).toBe(1);
    expect(row.reps).toBe(0);
    expect(row.dueAt).not.toBeNull();
  });

  it("второстепенна only dips mastery — no lapse, SM-2 untouched", async () => {
    const dueAt = new Date(NOW.getTime() + 16 * DAY_MS);
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.8,
      reps: 4,
      lapses: 2,
      dueAt,
    });

    await recordSimObservations(
      USER,
      [{ conceptId: "c-road", kind: "violation", severity: "vtorostepenna" }],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-road")!;
    expect(row.mastery).toBeCloseTo(0.8 * SIM_VIOLATION_DECAY.vtorostepenna, 10);
    expect(row.lapses).toBe(2);
    expect(row.reps).toBe(4);
    expect(row.dueAt).toEqual(dueAt);
  });

  it("a violation on an unseen concept creates the row and queues a review", async () => {
    await recordSimObservations(
      USER,
      [{ conceptId: "c-priority", kind: "violation", severity: "opasna" }],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-priority")!;
    expect(row.mastery).toBe(0); // 0 × decay — nothing to lose yet
    expect(row.lapses).toBe(1);
    expect(row.dueAt).not.toBeNull(); // ...but the concept enters the queue
  });

  it("compounds several same-concept violations sequentially", async () => {
    store.seedProgress(USER, { conceptId: "c-road", mastery: 1 });

    await recordSimObservations(
      USER,
      [
        { conceptId: "c-road", kind: "violation", severity: "osnovna" },
        { conceptId: "c-road", kind: "violation", severity: "osnovna" },
      ],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-road")!;
    expect(row.mastery).toBeCloseTo(0.75 * 0.75, 10);
    expect(row.lapses).toBe(2);
  });

  it("skips violations without a severity instead of guessing", async () => {
    store.seedProgress(USER, { conceptId: "c-road", mastery: 0.5 });
    await recordSimObservations(
      USER,
      [{ conceptId: "c-road", kind: "violation" }],
      NOW,
    );
    expect(store.getProgressRow(USER, "c-road")!.mastery).toBe(0.5);
  });
});

describe("recordSimObservations — commendations", () => {
  it("is weak positive evidence: asymptotic +10%, SM-2 untouched", async () => {
    const dueAt = new Date(NOW.getTime() + 7 * DAY_MS);
    store.seedProgress(USER, {
      conceptId: "c-priority",
      mastery: 0.5,
      reps: 2,
      lapses: 1,
      dueAt,
    });

    await recordSimObservations(
      USER,
      [{ conceptId: "c-priority", kind: "commendation" }],
      NOW,
    );

    const row = store.getProgressRow(USER, "c-priority")!;
    expect(row.mastery).toBeCloseTo(0.5 + 0.5 * SIM_COMMENDATION_GAIN, 10);
    expect(row.reps).toBe(2); // never advances the ladder
    expect(row.lapses).toBe(1);
    expect(row.dueAt).toEqual(dueAt);
  });

  it("a violation then a commendation on one concept fold in order", async () => {
    store.seedProgress(USER, { conceptId: "c-road", mastery: 0.8 });

    await recordSimObservations(
      USER,
      [
        { conceptId: "c-road", kind: "violation", severity: "opasna" },
        { conceptId: "c-road", kind: "commendation" },
      ],
      NOW,
    );

    const afterViolation = 0.8 * SIM_VIOLATION_DECAY.opasna;
    expect(store.getProgressRow(USER, "c-road")!.mastery).toBeCloseTo(
      afterViolation + (1 - afterViolation) * SIM_COMMENDATION_GAIN,
      10,
    );
  });
});

describe("recordSimObservations — persistence", () => {
  it("does nothing for an empty observation list", async () => {
    await recordSimObservations(USER, [], NOW);
    expect(await store.getProgress(USER)).toEqual([]);
  });

  it("writes progress-only (no attempt rows) for untouched-concept isolation", async () => {
    store.seedProgress(USER, { conceptId: "c-road", mastery: 0.9 });
    store.seedProgress(USER, { conceptId: "c-warning", mastery: 0.4 });

    await recordSimObservations(
      USER,
      [{ conceptId: "c-road", kind: "violation", severity: "opasna" }],
      NOW,
    );

    // Untouched concept unchanged; no recordAnswer transactions happened.
    expect(store.getProgressRow(USER, "c-warning")!.mastery).toBe(0.4);
    expect(store.recordAnswerCalls).toHaveLength(0);
  });
});
