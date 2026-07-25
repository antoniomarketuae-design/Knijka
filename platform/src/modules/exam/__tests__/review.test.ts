/**
 * getExamReview — the server-side rehydration that replaced the localStorage
 * cache (audit M-1).
 *
 * The bug these tests pin is not "the review renders oddly", it is "the review
 * does not exist anywhere but the browser that took the exam". So the shape of
 * every test here is: grade an attempt, throw the client away, and ask the
 * server what happened — which is exactly what a student opening their history
 * on a phone does.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  getExamReview,
  InMemoryExamStore,
  parseGradedAnswers,
  rehydrateReview,
  setExamStore,
  startExam,
  submitExam,
  type ExamAnswer,
} from "..";
import { correctIds, makeFixtureRepo, richBank, topicOf } from "./fixtures";

const bank = richBank();
let store: InMemoryExamStore;

/** Same cold-start cost as lifecycle.test.ts: submitExam feeds mastery. */
beforeAll(async () => {
  await import("@/modules/learning");
}, 120_000);

beforeEach(() => {
  setContentRepo(makeFixtureRepo(bank));
  store = new InMemoryExamStore();
  setExamStore(store);
});

afterEach(() => {
  setExamStore(null);
});

const allCorrect = (questions: { id: string }[]): ExamAnswer[] =>
  questions.map((q) => ({ questionId: q.id, optionIds: correctIds(bank, q.id) }));

/** A deliberately mixed sheet: the first `wrongCount` questions answered wrong. */
function mixedSheet(questions: { id: string }[], wrongCount: number): ExamAnswer[] {
  return questions.map((q, i) => ({
    questionId: q.id,
    optionIds: i < wrongCount ? [`${q.id}-o1`, `${q.id}-o3`, `${q.id}-o2`] : correctIds(bank, q.id),
  }));
}

describe("getExamReview — the graded paper, from the server", () => {
  it("returns every question with its correct options, explanation and citations", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 21 });
    await submitExam("u1", attemptId, mixedSheet(questions, 5), 900);

    const review = await getExamReview("u1", attemptId);
    expect(review).not.toBeNull();
    expect(review!.questions).toHaveLength(45);

    // THEO-4: no bare verdicts. Every card must carry the reasoning.
    for (const q of review!.questions) {
      expect(q.explanationBg.length).toBeGreaterThan(0);
      expect(q.lawRefs.length).toBeGreaterThan(0);
      expect(q.options.some((o) => o.correct)).toBe(true);
    }
  });

  it("keeps the candidate's own selections, right and wrong", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 22 });
    await submitExam("u1", attemptId, mixedSheet(questions, 5), 900);

    const review = await getExamReview("u1", attemptId);
    const wrongIds = new Set(questions.slice(0, 5).map((q) => q.id));

    for (const q of review!.questions) {
      const chosen = q.options.filter((o) => o.chosen).map((o) => o.id);
      expect(q.answered).toBe(true);
      if (wrongIds.has(q.questionId)) {
        expect(q.correct).toBe(false);
        expect(q.pointsAwarded).toBe(0);
        expect(chosen.length).toBeGreaterThan(0);
      } else {
        expect(q.correct).toBe(true);
        expect(q.pointsAwarded).toBe(q.maxPoints);
      }
    }
  });

  it("marks unanswered questions as unanswered rather than as wrong guesses", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 23 });
    await submitExam("u1", attemptId, allCorrect(questions.slice(0, 40)), 900);

    const review = await getExamReview("u1", attemptId);
    const answered = review!.questions.filter((q) => q.answered);
    const blank = review!.questions.filter((q) => !q.answered);
    expect(answered).toHaveLength(40);
    expect(blank).toHaveLength(5);
    expect(blank.every((q) => q.options.every((o) => !o.chosen))).toBe(true);
  });

  it("reports the score, the verdict and the time used without the client", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 24 });
    await submitExam("u1", attemptId, allCorrect(questions), 1234);

    const review = await getExamReview("u1", attemptId);
    expect(review!.score).toBe(97);
    expect(review!.maxScore).toBe(97);
    expect(review!.passed).toBe(true);
    expect(review!.timeUsedSec).toBeGreaterThanOrEqual(0);
    expect(review!.finishedAt).toBeInstanceOf(Date);
  });

  it("refuses unknown, unfinished and other users' attempts identically", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 25 });
    // still running
    expect(await getExamReview("u1", attemptId)).toBeNull();

    await submitExam("u1", attemptId, allCorrect(questions), 900);
    expect(await getExamReview("u2", attemptId)).toBeNull(); // not yours
    expect(await getExamReview("u1", "attempt-does-not-exist")).toBeNull();
  });

  it("survives an unreadable grade payload instead of throwing at the page", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 26 });
    await submitExam("u1", attemptId, allCorrect(questions), 900);
    store.attempts.get(attemptId)!.answers = { nonsense: true };
    expect(await getExamReview("u1", attemptId)).toBeNull();
  });
});

describe("getExamReview — per-topic breakdown (the link into practice)", () => {
  it("accounts for all 45 questions and all 97 points across the topics", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 27 });
    await submitExam("u1", attemptId, mixedSheet(questions, 12), 900);

    const review = await getExamReview("u1", attemptId);
    const totals = review!.byTopic.reduce(
      (acc, t) => ({
        questions: acc.questions + t.questions,
        correct: acc.correct + t.correct,
        points: acc.points + t.points,
        maxPoints: acc.maxPoints + t.maxPoints,
      }),
      { questions: 0, correct: 0, points: 0, maxPoints: 0 },
    );
    expect(totals.questions).toBe(45);
    expect(totals.maxPoints).toBe(97);
    expect(totals.points).toBe(review!.score);
    expect(totals.correct).toBe(33);
  });

  it("counts each topic's own hits and misses, and carries the practice slug", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 28 });
    // Fail exactly the questions of one topic — the breakdown must name it.
    const targetTopic = topicOf(bank, questions[0].id);
    const answers: ExamAnswer[] = questions.map((q) => ({
      questionId: q.id,
      optionIds:
        topicOf(bank, q.id) === targetTopic ? [] : correctIds(bank, q.id),
    }));
    await submitExam("u1", attemptId, answers, 900);

    const review = await getExamReview("u1", attemptId);
    const failed = review!.byTopic.find((t) => t.topicId === targetTopic);
    expect(failed).toBeDefined();
    expect(failed!.correct).toBe(0);
    expect(failed!.points).toBe(0);
    expect(failed!.questions).toBeGreaterThan(0);
    // The slug is what /theory/practice?topic=… is built from — without it the
    // breakdown is a diagnosis with nowhere to go.
    expect(failed!.slug).toBe(
      bank.topics.find((t) => t.id === targetTopic)!.slug,
    );

    for (const t of review!.byTopic) {
      if (t.topicId === targetTopic) continue;
      expect(t.correct).toBe(t.questions);
    }
  });

  it("lists topics in curriculum order", async () => {
    const { attemptId, questions } = await startExam("u1", { seed: 29 });
    await submitExam("u1", attemptId, allCorrect(questions), 900);

    const review = await getExamReview("u1", attemptId);
    const orders = review!.byTopic.map(
      (t) => bank.topics.find((x) => x.id === t.topicId)!.order,
    );
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe("rehydrateReview — content drift and legacy rows", () => {
  it("degrades a question that has left the bank without losing its points", () => {
    const { questions, byTopic } = rehydrateReview([
      { questionId: "q-deleted", optionIds: ["x"], correct: false, points: 0, maxPoints: 3 },
    ]);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toEqual([]);
    expect(questions[0].maxPoints).toBe(3);
    expect(questions[0].topicSlug).toBeNull();
    // No topic, so nothing to send the student to — not a bogus bucket.
    expect(byTopic).toEqual([]);
  });

  it("falls back to the bank's weight for rows graded before maxPoints was stored", () => {
    const q = bank.questions.find((x) => x.points === 3)!;
    const { questions } = rehydrateReview([
      { questionId: q.id, optionIds: [], correct: false, points: 0 },
    ]);
    expect(questions[0].maxPoints).toBe(3);
  });

  it("prefers the stored weight over a later content edit", () => {
    // A question re-weighted after the exam must not change what the candidate
    // could have scored that day.
    const q = bank.questions.find((x) => x.points === 3)!;
    const { questions } = rehydrateReview([
      { questionId: q.id, optionIds: [], correct: false, points: 0, maxPoints: 2 },
    ]);
    expect(questions[0].maxPoints).toBe(2);
  });
});

describe("parseGradedAnswers", () => {
  it("accepts the persisted shape", () => {
    const parsed = parseGradedAnswers([
      { questionId: "q1", optionIds: ["a"], correct: true, points: 2, maxPoints: 2 },
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed![0].maxPoints).toBe(2);
  });

  it("rejects the in-progress payload and any other malformed JSON", () => {
    expect(parseGradedAnswers({ state: "in-progress", seed: 1, questionIds: [] })).toBeNull();
    expect(parseGradedAnswers(null)).toBeNull();
    expect(parseGradedAnswers([{ questionId: 1 }])).toBeNull();
    expect(parseGradedAnswers([{ questionId: "q1", optionIds: "a", correct: true, points: 1 }])).toBeNull();
    expect(parseGradedAnswers([{ questionId: "q1", optionIds: [], correct: "yes", points: 1 }])).toBeNull();
  });
});
