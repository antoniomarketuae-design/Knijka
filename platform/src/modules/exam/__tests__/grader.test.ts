import { describe, expect, it } from "vitest";
import type { Question } from "../../../lib/content/types";
import { gradeExam } from "../grader";
import { makeQuestion } from "./fixtures";

// fixture conventions: single => o2 correct; multi => o1 + o3 correct
const single = (id: string, points: 1 | 2 | 3 = 1): Question =>
  makeQuestion(id, "c-a", points);
const multi = (id: string, points: 1 | 2 | 3 = 2): Question =>
  makeQuestion(id, "c-a", points, { type: "multi" });

describe("gradeExam — single questions", () => {
  it("awards full weight for the correct option", () => {
    const r = gradeExam([single("q1", 3)], [{ questionId: "q1", optionIds: ["q1-o2"] }]);
    expect(r.score).toBe(3);
    expect(r.perQuestion[0]).toMatchObject({
      questionId: "q1",
      correct: true,
      points: 3,
      maxPoints: 3,
      correctOptionIds: ["q1-o2"],
    });
  });

  it("awards 0 for a wrong option and for no answer", () => {
    const r = gradeExam(
      [single("q1", 2), single("q2", 2)],
      [{ questionId: "q1", optionIds: ["q1-o3"] }], // q2 unanswered
    );
    expect(r.score).toBe(0);
    expect(r.perQuestion.map((p) => p.correct)).toEqual([false, false]);
    expect(r.perQuestion[1].points).toBe(0);
  });

  it("rejects selecting the correct option plus extras", () => {
    const r = gradeExam(
      [single("q1", 1)],
      [{ questionId: "q1", optionIds: ["q1-o2", "q1-o1"] }],
    );
    expect(r.score).toBe(0);
  });
});

describe("gradeExam — multi questions (official exact-set rule)", () => {
  it("full points only on the exact correct set, any order", () => {
    const r = gradeExam(
      [multi("m1", 2)],
      [{ questionId: "m1", optionIds: ["m1-o3", "m1-o1"] }],
    );
    expect(r.score).toBe(2);
    expect(r.perQuestion[0].correctOptionIds.sort()).toEqual(["m1-o1", "m1-o3"]);
  });

  it("zero for a strict subset of the correct set (no partial credit)", () => {
    const r = gradeExam([multi("m1", 2)], [{ questionId: "m1", optionIds: ["m1-o1"] }]);
    expect(r.score).toBe(0);
  });

  it("zero for a superset (correct set + a wrong option)", () => {
    const r = gradeExam(
      [multi("m1", 2)],
      [{ questionId: "m1", optionIds: ["m1-o1", "m1-o3", "m1-o2"] }],
    );
    expect(r.score).toBe(0);
  });

  it("ignores duplicated option ids in the submission", () => {
    const r = gradeExam(
      [multi("m1", 2)],
      [{ questionId: "m1", optionIds: ["m1-o1", "m1-o1", "m1-o3"] }],
    );
    expect(r.score).toBe(2);
  });
});

describe("gradeExam — totals and the 87-point pass boundary", () => {
  // realistic official shape: 13 x 1pt + 12 x 2pt + 20 x 3pt = 45 questions, 97 pts
  const questions: Question[] = [
    ...Array.from({ length: 13 }, (_, i) => single(`s1-${i}`, 1)),
    ...Array.from({ length: 12 }, (_, i) => single(`s2-${i}`, 2)),
    ...Array.from({ length: 20 }, (_, i) => single(`s3-${i}`, 3)),
  ];
  const correctFor = (q: Question) => ({
    questionId: q.id,
    optionIds: q.options.filter((o) => o.correct).map((o) => o.id),
  });

  it("computes maxScore as the sum of weights (97)", () => {
    const r = gradeExam(questions, []);
    expect(r.maxScore).toBe(97);
    expect(r.score).toBe(0);
    expect(r.passed).toBe(false);
  });

  it("passes at exactly 87", () => {
    // all 3-pointers (60) + all 2-pointers (24) + three 1-pointers = 87
    const answers = questions
      .filter((q) => q.points > 1 || ["s1-0", "s1-1", "s1-2"].includes(q.id))
      .map(correctFor);
    const r = gradeExam(questions, answers);
    expect(r.score).toBe(87);
    expect(r.passed).toBe(true);
  });

  it("fails at 86", () => {
    const answers = questions
      .filter((q) => q.points > 1 || ["s1-0", "s1-1"].includes(q.id))
      .map(correctFor);
    const r = gradeExam(questions, answers);
    expect(r.score).toBe(86);
    expect(r.passed).toBe(false);
  });

  it("ignores answers for questions outside the exam", () => {
    const r = gradeExam(
      [single("q1", 1)],
      [
        { questionId: "q1", optionIds: ["q1-o2"] },
        { questionId: "ghost", optionIds: ["x"] },
      ],
    );
    expect(r.score).toBe(1);
    expect(r.perQuestion).toHaveLength(1);
  });
});
