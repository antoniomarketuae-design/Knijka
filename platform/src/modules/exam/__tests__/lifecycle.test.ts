import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  EXAM_DURATION_SEC,
  EXAM_GRACE_SEC,
  ExamError,
  getExamHistory,
  InMemoryExamStore,
  setExamStore,
  startExam,
  submitExam,
  type ExamAnswer,
} from "..";
import { correctIds, makeFixtureRepo, richBank } from "./fixtures";

const bank = richBank();
let store: InMemoryExamStore;

beforeEach(() => {
  setContentRepo(makeFixtureRepo(bank));
  store = new InMemoryExamStore();
  setExamStore(store);
});

afterEach(() => {
  setExamStore(null); // don't leak the fake into other suites
});

const allCorrect = (questions: { id: string }[]): ExamAnswer[] =>
  questions.map((q) => ({ questionId: q.id, optionIds: correctIds(bank, q.id) }));

describe("startExam", () => {
  it("creates an attempt row and returns the safe 45-question payload", async () => {
    const res = await startExam("u1", { seed: 99 });
    expect(res.questions).toHaveLength(45);
    expect(res.durationSec).toBe(EXAM_DURATION_SEC);
    expect(JSON.stringify(res.questions)).not.toContain('"correct"');

    const attempt = store.attempts.get(res.attemptId);
    expect(attempt).toBeDefined();
    expect(attempt!.userId).toBe("u1");
    expect(attempt!.maxScore).toBe(97);
    expect(attempt!.finishedAt).toBeNull();
    expect(attempt!.answers).toMatchObject({ state: "in-progress", seed: 99 });
  });
});

describe("submitExam — grading & persistence", () => {
  it("grades, persists score/passed/answers and QuestionAttempt rows", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 5 });
    const res = await submitExam("u1", attemptId, allCorrect(questions), 1200);

    expect(res.late).toBe(false);
    expect(res.score).toBe(97);
    expect(res.maxScore).toBe(97);
    expect(res.passed).toBe(true);
    expect(res.perQuestion).toHaveLength(45);

    const row = store.attempts.get(attemptId)!;
    expect(row.finishedAt).not.toBeNull();
    expect(row.score).toBe(97);
    expect(row.passed).toBe(true);
    expect(Array.isArray(row.answers)).toBe(true);
    expect((row.answers as unknown[]).length).toBe(45);

    // mastery signal: one QuestionAttempt per answered question, context "exam"
    expect(store.questionAttempts).toHaveLength(45);
    expect(store.questionAttempts.every((a) => a.context === "exam")).toBe(true);
    expect(store.questionAttempts.every((a) => a.userId === "u1")).toBe(true);
  });

  it("grades partial submissions (unanswered = wrong, no attempt rows)", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 6 });
    const answered = allCorrect(questions.slice(0, 10));
    const res = await submitExam("u1", attemptId, answered, 600);

    const expected = questions.slice(0, 10).reduce((n, q) => n + q.points, 0);
    expect(res.score).toBe(expected);
    expect(res.perQuestion).toHaveLength(45);
    expect(store.questionAttempts).toHaveLength(10);
  });

  it("rejects an unknown attempt and someone else's attempt identically", async () => {
    const { attemptId } = await startExam("u1", { seed: 7 });
    await expect(submitExam("u1", "nope", [], 10)).rejects.toMatchObject({
      code: "ATTEMPT_NOT_FOUND",
    });
    await expect(submitExam("u2", attemptId, [], 10)).rejects.toMatchObject({
      code: "ATTEMPT_NOT_FOUND",
    });
  });

  it("rejects double submission", async () => {
    const { attemptId } = await startExam("u1", { seed: 8 });
    await submitExam("u1", attemptId, [], 10);
    await expect(submitExam("u1", attemptId, [], 20)).rejects.toMatchObject({
      code: "ALREADY_SUBMITTED",
    });
  });
});

describe("submitExam — 40:00 + 30s time limit", () => {
  it("accepts a submission at exactly the grace boundary", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 9 });
    const res = await submitExam(
      "u1",
      attemptId,
      allCorrect(questions),
      EXAM_DURATION_SEC + EXAM_GRACE_SEC, // 2430s — still in
    );
    expect(res.late).toBe(false);
    expect(res.passed).toBe(true);
  });

  it("auto-fails past the client-reported limit but still grades what was answered", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 10 });
    const res = await submitExam(
      "u1",
      attemptId,
      allCorrect(questions),
      EXAM_DURATION_SEC + EXAM_GRACE_SEC + 1, // 2431s — late
    );
    expect(res.late).toBe(true);
    expect(res.passed).toBe(false); // auto-fail despite a 97/97 sheet
    expect(res.score).toBe(97); // ...but the work is graded, not discarded

    const row = store.attempts.get(attemptId)!;
    expect(row.passed).toBe(false);
    expect(row.score).toBe(97);
    expect(row.finishedAt).not.toBeNull();
  });

  it("auto-fails on the authoritative server clock even if the client lies", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 11 });
    store.attempts.get(attemptId)!.startedAt = new Date(Date.now() - 2 * 3600 * 1000);
    const res = await submitExam("u1", attemptId, allCorrect(questions), 100);
    expect(res.late).toBe(true);
    expect(res.passed).toBe(false);
  });
});

describe("getExamHistory", () => {
  it("lists a user's attempts newest first with status", async () => {
    const a1 = await startExam("u1", { seed: 12 });
    await submitExam("u1", a1.attemptId, allCorrect(a1.questions), 100);
    const a2 = await startExam("u1", { seed: 13 });
    await startExam("someone-else", { seed: 14 });

    const history = await getExamHistory("u1");
    expect(history).toHaveLength(2);
    const byId = new Map(history.map((h) => [h.attemptId, h]));
    expect(byId.get(a1.attemptId)).toMatchObject({
      status: "completed",
      score: 97,
      maxScore: 97,
      passed: true,
    });
    expect(byId.get(a2.attemptId)).toMatchObject({
      status: "in-progress",
      score: null,
      passed: null,
    });
    // newest first
    const times = history.map((h) => h.startedAt.getTime());
    expect(times).toEqual([...times].sort((x, y) => y - x));
  });
});
