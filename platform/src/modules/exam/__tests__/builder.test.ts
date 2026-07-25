import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  buildExam,
  EXAM_MAX_POINTS,
  EXAM_QUESTION_COUNT,
  EXAM_TOPIC_QUOTAS,
  ExamError,
} from "..";
import {
  allOnesBank,
  allThreesBank,
  declaredQuotaBank,
  makeFixtureRepo,
  richBank,
  tinyBank,
  topicOf,
} from "./fixtures";

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

  it("never includes anything but approved questions", () => {
    // content/SCHEMA.md: nothing ships without review. `draft` used to be
    // eligible, which put un-reviewed items (the ones whose lawRefs may still
    // carry a "?") in front of an exam candidate — see isExamEligible.
    const banned = new Set(
      bank.questions.filter((q) => q.status !== "approved").map((q) => q.id),
    );
    const byStatus = (s: string) => bank.questions.filter((q) => q.status === s).length;
    expect(byStatus("draft")).toBeGreaterThan(0);
    expect(byStatus("needs-review")).toBeGreaterThan(0);
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
  it("refuses to deal a sub-97 exam when 97 is unreachable (M-13)", () => {
    // The old builder returned 45 x 1pt = 45 points here and said nothing,
    // while EXAM_PASS_POINTS stayed an absolute 87 — an unpassable paper. The
    // failure has to be loud because the fix is a content one (approve more
    // 3-pointers), and nothing about a 45-point exam looks wrong to a student.
    setContentRepo(makeFixtureRepo(allOnesBank()));
    expect(() => buildExam(11)).toThrowError(ExamError);
    try {
      buildExam(11);
    } catch (e) {
      expect((e as ExamError).code).toBe("BANK_UNDERWEIGHT");
      expect((e as ExamError).message).toContain("45"); // names the closest total
    }
  });

  it("throws BANK_OVERWEIGHT when even the lightest 45 exceed 97", () => {
    setContentRepo(makeFixtureRepo(allThreesBank()));
    try {
      buildExam(11);
      throw new Error("expected buildExam to throw");
    } catch (e) {
      expect(e).toBeInstanceOf(ExamError);
      expect((e as ExamError).code).toBe("BANK_OVERWEIGHT");
    }
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

describe("buildExam — declared topic quotas (M-11)", () => {
  const bank = declaredQuotaBank();
  beforeEach(() => {
    setContentRepo(makeFixtureRepo(bank));
  });

  it("gives every topic exactly the slots the quota table declares", () => {
    for (const seed of SEEDS) {
      const perTopic = new Map<string, number>();
      for (const q of buildExam(seed).questions) {
        const slug = slugOf(bank, q.id);
        perTopic.set(slug, (perTopic.get(slug) ?? 0) + 1);
      }
      for (const row of EXAM_TOPIC_QUOTAS) {
        expect(perTopic.get(row.slug), `${row.slug} @ seed ${seed}`).toBe(row.quota);
      }
    }
  });

  it("keeps the mix fixed when a topic's bank grows (the M-11 regression)", () => {
    // Proportional allocation moved a slot off some other topic the moment an
    // author added questions. 40 new parking questions must now change nothing.
    const grown = declaredQuotaBank({ extraFor: "spirane-i-parkirane", extra: 40 });
    const before = topicCounts(bank, buildExam(31).questions);
    setContentRepo(makeFixtureRepo(grown));
    const after = topicCounts(grown, buildExam(31).questions);
    expect(after).toEqual(before);
  });

  it("re-flows the slots a review-starved topic cannot fill, still hitting 45/97", () => {
    // The declared quota is a promise about the mix, not about content that
    // does not exist: a topic with 2 approved questions contributes 2, and the
    // paper stays a legal 45/97 rather than failing on someone else's backlog.
    const starved = declaredQuotaBank({ starveSlug: "patni-znatsi", keepApproved: 2 });
    setContentRepo(makeFixtureRepo(starved));
    const exam = buildExam(41);
    const counts = topicCounts(starved, exam.questions);
    expect(counts.get("patni-znatsi")).toBe(2); // declared 4, supply 2
    expect(exam.questions).toHaveLength(EXAM_QUESTION_COUNT);
    expect(exam.totalPoints).toBe(EXAM_MAX_POINTS);
  });
});

/** Primary-topic slug of a dealt question (the builder's own rule). */
function slugOf(bank: ReturnType<typeof declaredQuotaBank>, questionId: string): string {
  const topicId = topicOf(bank, questionId);
  const topic = bank.topics.find((t) => t.id === topicId);
  if (!topic) throw new Error(`fixture: no topic for ${questionId}`);
  return topic.slug;
}

function topicCounts(
  bank: ReturnType<typeof declaredQuotaBank>,
  questions: { id: string }[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const q of questions) {
    const slug = slugOf(bank, q.id);
    counts.set(slug, (counts.get(slug) ?? 0) + 1);
  }
  return counts;
}
