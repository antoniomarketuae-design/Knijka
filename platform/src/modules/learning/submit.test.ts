import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import { buildPracticeSession } from "./session";
import { setLearningStore } from "./store";
import { submitAnswer } from "./submit";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(NOW.getTime() + d * DAY_MS);

const USER = "u1";

let store: FakeLearningStore;

beforeEach(() => {
  setContentRepo(makeFixtureRepo());
  store = new FakeLearningStore();
  setLearningStore(store);
});

describe("submitAnswer", () => {
  it("grades a correct single-answer question and returns feedback payload", async () => {
    const result = await submitAnswer(
      USER,
      "q-road-1",
      ["q-road-1-a"],
      "practice",
      NOW,
    );

    expect(result.correct).toBe(true);
    expect(result.correctOptionIds).toEqual(["q-road-1-a"]);
    expect(result.explanationBg).toBe("Обяснение за q-road-1");
    expect(result.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 5" }]);
    expect(result.masteryBefore).toBe(0);
    expect(result.masteryAfter).toBeCloseTo(0.25, 10); // 1-point gain
  });

  it("persists attempt + progress in ONE store call (one transaction)", async () => {
    await submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW);

    expect(store.recordAnswerCalls).toHaveLength(1);
    const call = store.recordAnswerCalls[0];
    expect(call.userId).toBe(USER);
    expect(call.attempt).toEqual({
      questionId: "q-road-1",
      context: "practice",
      correct: true,
      points: 1, // question weight, not points earned
      answeredAt: NOW,
    });
    expect(call.updates).toEqual([
      {
        conceptId: "c-road",
        mastery: 0.25,
        reps: 1,
        lapses: 0,
        dueAt: daysFromNow(1),
      },
    ]);
  });

  it("applies the wrong-answer penalty: mastery *= 0.6, lapse++, 1-day reset", async () => {
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.8,
      reps: 3,
      lapses: 1,
      dueAt: daysFromNow(2),
    });

    const result = await submitAnswer(
      USER,
      "q-road-1",
      ["q-road-1-b"],
      "practice",
      NOW,
    );

    expect(result.correct).toBe(false);
    expect(result.masteryBefore).toBeCloseTo(0.8, 10);
    expect(result.masteryAfter).toBeCloseTo(0.48, 10);

    const row = store.getProgressRow(USER, "c-road")!;
    expect(row.mastery).toBeCloseTo(0.48, 10);
    expect(row.lapses).toBe(2);
    expect(row.reps).toBe(0);
    expect(row.dueAt).toEqual(daysFromNow(1));
  });

  it("multi questions require an EXACT set match (order-insensitive)", async () => {
    // Correct set is {a, b}.
    const partial = await submitAnswer(
      USER,
      "q-prio-1",
      ["q-prio-1-a"],
      "practice",
      NOW,
    );
    expect(partial.correct).toBe(false);

    const superset = await submitAnswer(
      USER,
      "q-prio-1",
      ["q-prio-1-a", "q-prio-1-b", "q-prio-1-c"],
      "practice",
      NOW,
    );
    expect(superset.correct).toBe(false);

    const empty = await submitAnswer(USER, "q-prio-1", [], "practice", NOW);
    expect(empty.correct).toBe(false);

    const exact = await submitAnswer(
      USER,
      "q-prio-1",
      ["q-prio-1-b", "q-prio-1-a"], // reversed order
      "practice",
      NOW,
    );
    expect(exact.correct).toBe(true);
    expect(exact.correctOptionIds).toEqual(["q-prio-1-a", "q-prio-1-b"]);
  });

  it("updates every concept of a multi-concept question and averages mastery", async () => {
    store.seedProgress(USER, { conceptId: "c-priority", mastery: 0.5, reps: 1 });

    // q-sprio-1 maps to c-sign-priority (unseen) AND c-priority (0.5).
    const result = await submitAnswer(
      USER,
      "q-sprio-1",
      ["q-sprio-1-a"],
      "micro",
      NOW,
    );

    expect(result.correct).toBe(true);
    expect(result.masteryBefore).toBeCloseTo((0 + 0.5) / 2, 10);
    // 3-point gain 0.45: 0 → 0.45 and 0.5 → 0.725
    expect(result.masteryAfter).toBeCloseTo((0.45 + 0.725) / 2, 10);

    const call = store.recordAnswerCalls[0];
    expect(call.attempt.context).toBe("micro");
    expect(call.updates.map((u) => u.conceptId).sort()).toEqual([
      "c-priority",
      "c-sign-priority",
    ]);
  });

  it("a correct early review does not advance the spaced-repetition schedule", async () => {
    store.seedProgress(USER, {
      conceptId: "c-road",
      mastery: 0.5,
      reps: 2,
      dueAt: daysFromNow(3), // not due yet
    });

    await submitAnswer(USER, "q-road-1", ["q-road-1-a"], "practice", NOW);

    const row = store.getProgressRow(USER, "c-road")!;
    expect(row.mastery).toBeCloseTo(0.625, 10); // mastery still improves
    expect(row.reps).toBe(2); // schedule untouched
    expect(row.dueAt).toEqual(daysFromNow(3));
  });

  it("grades a shuffled practice session by option ID, never by position", async () => {
    // The regression this pins: practice now presents options in a per-session
    // seeded order (audit H-1a), so an option's slot on screen has nothing to
    // do with its slot in the bank. A grader that compared POSITIONS would
    // mark the right answer wrong and the wrong answer right — and mastery,
    // lapses and dueAt all hang off that single boolean.
    const session = await buildPracticeSession(USER, { now: NOW, optionSeed: 0 });
    const presented = session
      .find((s) => s.question.id === "q-road-1")!
      .question.options.map((o) => o.id);

    const stored = makeFixtureRepo().questionById("q-road-1")!.options;
    const correctSlot = stored.findIndex((o) => o.correct); // 0 — the bank's habit
    const correctId = stored[correctSlot].id;
    // Precondition: this session really did move the answer off its slot.
    expect(presented[correctSlot]).not.toBe(correctId);

    const byId = await submitAnswer(USER, "q-road-1", [correctId], "practice", NOW);
    expect(byId.correct).toBe(true);
    expect(byId.correctOptionIds).toEqual([correctId]);

    // The option now SITTING in the historically correct slot is a distractor.
    const byPosition = await submitAnswer(
      USER,
      "q-road-1",
      [presented[correctSlot]],
      "practice",
      NOW,
    );
    expect(byPosition.correct).toBe(false);
  });

  it("rejects unknown questions and foreign option ids without persisting", async () => {
    await expect(
      submitAnswer(USER, "q-nope", [], "practice", NOW),
    ).rejects.toThrow(/unknown question/i);

    await expect(
      submitAnswer(USER, "q-road-1", ["q-warn-1-a"], "practice", NOW),
    ).rejects.toThrow(/does not belong/i);

    expect(store.recordAnswerCalls).toHaveLength(0);
  });
});
