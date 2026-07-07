import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import { buildExam, EXAM_MAX_POINTS, EXAM_QUESTION_COUNT, ExamError } from "..";
import { allOnesBank, makeFixtureRepo, richBank, tinyBank, topicOf } from "./fixtures";

const SEEDS = Array.from({ length: 25 }, (_, i) => i * 1013 + 1);

describe("buildExam — official format invariants", () => {
  const bank = richBank();
  beforeEach(() => {
    setContentRepo(makeFixtureRepo(bank));
  });

  it("returns exactly 45 unique questions", () => {
    for (const seed of SEEDS) {
      const exam = buildExam(seed);
      expect(exam.questions).toHaveLength(EXAM_QUESTION_COUNT);
      expect(new Set(exam.questions.map((q) => q.id)).size).toBe(EXAM_QUESTION_COUNT);
    }
  });

  it("hits exactly 97 points when the bank allows it, never more", () => {
    for (const seed of SEEDS) {
      const exam = buildExam(seed);
      const sum = exam.questions.reduce((n, q) => n + q.points, 0);
      expect(sum).toBe(EXAM_MAX_POINTS);
      expect(exam.totalPoints).toBe(EXAM_MAX_POINTS);
    }
  });

  it("never includes needs-review questions", () => {
    const banned = new Set(
      bank.questions.filter((q) => q.status === "needs-review").map((q) => q.id),
    );
    expect(banned.size).toBeGreaterThan(0);
    for (const seed of SEEDS) {
      for (const q of buildExam(seed).questions) {
        expect(banned.has(q.id)).toBe(false);
      }
    }
  });

  it("touches every topic (min 1 question per topic)", () => {
    for (const seed of SEEDS) {
      const topicsHit = new Set(buildExam(seed).questions.map((q) => topicOf(bank, q.id)));
      expect(topicsHit.size).toBe(bank.topics.length);
    }
  });

  it("is deterministic for a given seed", () => {
    const a = buildExam(4242);
    const b = buildExam(4242);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("produces different exams for different seeds", () => {
    const a = buildExam(1);
    const b = buildExam(2);
    expect(JSON.stringify(a.questions)).not.toBe(JSON.stringify(b.questions));
  });

  it("assigns a random seed when none is given (still a valid exam)", () => {
    const exam = buildExam();
    expect(exam.questions).toHaveLength(EXAM_QUESTION_COUNT);
    expect(Number.isInteger(exam.seed)).toBe(true);
  });

  it("exposes no correct flags, explanations or law refs in the payload", () => {
    const json = JSON.stringify(buildExam(7));
    expect(json).not.toContain('"correct"');
    expect(json).not.toContain("explanationBg");
    expect(json).not.toContain("lawRefs");
  });

  it("shuffles option order (seeded)", () => {
    const exam = buildExam(7);
    const shuffledSomewhere = exam.questions.some((q) => {
      const canonical = bank.questions.find((b) => b.id === q.id)!.options.map((o) => o.id);
      const got = q.options.map((o) => o.id);
      expect([...got].sort()).toEqual([...canonical].sort()); // same option set
      return got.join(",") !== canonical.join(",");
    });
    expect(shuffledSomewhere).toBe(true);
  });
});

describe("buildExam — degenerate banks", () => {
  it("gets as close to 97 as the bank allows when 97 is unreachable", () => {
    setContentRepo(makeFixtureRepo(allOnesBank()));
    const exam = buildExam(11);
    expect(exam.questions).toHaveLength(EXAM_QUESTION_COUNT);
    expect(exam.totalPoints).toBe(45); // 45 x 1pt is the ceiling of that bank
  });

  it("throws BANK_TOO_SMALL below 45 eligible questions", () => {
    setContentRepo(makeFixtureRepo(tinyBank()));
    expect(() => buildExam(1)).toThrowError(ExamError);
    try {
      buildExam(1);
    } catch (e) {
      expect((e as ExamError).code).toBe("BANK_TOO_SMALL");
    }
  });
});
