/**
 * Exam supply + composition guard — run against the REAL /content bank.
 *
 * The rest of the exam suite runs on synthetic fixtures, which is right for
 * algorithm invariants but blind to the failure this file exists for: the shape
 * of the actual content bank silently deciding what a candidate is examined on.
 * `isExamEligible` is `approved`-only and builder quotas are proportional to that
 * eligible pool, so review debt re-weights every mock exam without breaking a
 * single existing assertion (audit M-8: signali-i-markirovka examined at ~1.6%
 * of a paper instead of ~6%, invisibly, for months).
 *
 * So these tests are deliberately content-coupled: they fail when the BANK
 * regresses, not when the code does. The remedy for a red run here is a review
 * pass on the named topic — never a threshold edit.
 */

import { beforeAll, describe, expect, it } from "vitest";
import "../../../lib/content/loader"; // side effect: registers the real ContentRepo
import { getContentRepo } from "../../../lib/content/repo";
import {
  auditExamSupply,
  buildExam,
  formatExamSupplyAudit,
  isExamEligible,
  EXAM_MAX_POINTS,
  EXAM_QUESTION_COUNT,
  EXAM_TOPIC_QUOTAS,
  MAX_QUOTA_SHORTFALL,
  MIN_SUPPLY_PER_SLOT,
} from "..";

/** Exams built for the invariant sweep — the sample size the audit reports. */
const EXAM_SAMPLE = 500;

/** Primary topic of a question — the builder's rule (first resolvable concept). */
function primaryTopicId(questionId: string): string | undefined {
  const repo = getContentRepo();
  const q = repo.questionById(questionId);
  if (!q) return undefined;
  return q.conceptIds.map((id) => repo.conceptById(id)).find((c) => c !== undefined)?.topicId;
}

describe("exam eligibility policy — approved only", () => {
  it("treats only approved questions as exam-eligible", () => {
    const repo = getContentRepo();
    const questions = repo.questions();
    const eligible = questions.filter(isExamEligible);

    expect(eligible.every((q) => q.status === "approved")).toBe(true);
    // Stated from the other side too: whatever backlog the bank carries today,
    // none of it is examinable. (Not asserting that a backlog EXISTS — clearing
    // it completely is the goal, and must not turn this test red.)
    const backlog = questions.filter((q) => q.status !== "approved");
    expect(backlog.some(isExamEligible)).toBe(false);
  });

  it("never deals an un-approved question into an exam", () => {
    const repo = getContentRepo();
    for (let seed = 1; seed <= 50; seed++) {
      for (const q of buildExam(seed).questions) {
        expect(repo.questionById(q.id)?.status).toBe("approved");
      }
    }
  });
});

describe("declared quota table vs the curriculum (M-11)", () => {
  it("declares a weight for every topic in content/topics.json, and no others", () => {
    // The two files are the same decision written twice, so they drift the way
    // any duplicated decision drifts. When they do, buildExam silently reverts
    // to proportional allocation — the exact accident M-11 caught — so this is
    // the gate that turns that back into a red build.
    const contentSlugs = getContentRepo()
      .topics()
      .map((t) => t.slug)
      .sort();
    const declaredSlugs = EXAM_TOPIC_QUOTAS.map((t) => t.slug).sort();
    expect(declaredSlugs).toEqual(contentSlugs);
  });

  it("backs every declared slot with enough approved questions to fill it", () => {
    // A declared quota a topic cannot supply is not a mix — the builder caps it
    // and re-flows the slots, quietly returning the exam to "whoever reviewed
    // most wins". MIN_SUPPLY_PER_SLOT on top so repeated mocks can rotate.
    const audit = auditExamSupply();
    for (const row of EXAM_TOPIC_QUOTAS) {
      const topic = audit.topics.find((t) => t.slug === row.slug);
      expect(topic, `${row.slug} missing from the supply audit`).toBeDefined();
      expect(
        topic!.eligible,
        `${row.slug}: ${topic!.eligible} approved for ${row.quota} declared slot(s)`,
      ).toBeGreaterThanOrEqual(row.quota * MIN_SUPPLY_PER_SLOT);
    }
  });
});

describe("per-topic exam supply", () => {
  const audit = auditExamSupply();

  it("has no dark, threadbare or under-represented topic", () => {
    // The formatted table is the actionable part of a failure: it names the
    // topic and the review batch that fixes it.
    expect(audit.problems, `\n${formatExamSupplyAudit(audit)}\n`).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  it("gives every topic enough approved supply for the slots it is owed", () => {
    for (const t of audit.topics) {
      expect(t.eligible, `${t.slug} has no approved questions`).toBeGreaterThan(0);
      expect(
        t.eligible,
        `${t.slug}: ${t.eligible} approved for ${t.fairQuota} slot(s)`,
      ).toBeGreaterThanOrEqual(t.fairQuota * MIN_SUPPLY_PER_SLOT);
    }
  });

  it("keeps every topic's real quota within one slot of its curriculum weight", () => {
    for (const t of audit.topics) {
      expect(
        t.fairQuota - t.quota,
        `${t.slug}: ${t.quota} real slot(s) vs ${t.fairQuota} by bank size`,
      ).toBeLessThanOrEqual(MAX_QUOTA_SHORTFALL);
    }
  });

  it("keeps road markings (the topic M-8 caught going dark) fully examined", () => {
    // Named on purpose: this is the regression the eligibility change was made
    // for, and a generic threshold would not say so out loud. M-8 measured this
    // topic at 13 eligible questions and 1 slot => 1.6% of a paper; a candidate
    // could pass five mocks nearly untested on markings.
    const markings = audit.topics.find((t) => t.slug === "signali-i-markirovka");
    expect(markings).toBeDefined();
    expect(markings!.quota).toBeGreaterThanOrEqual(markings!.fairQuota);
    expect(markings!.quota / EXAM_QUESTION_COUNT).toBeGreaterThan(0.04);
  });
});

describe(`${EXAM_SAMPLE} exams on the real bank`, () => {
  // One sweep, several assertions — building 500 exams per test would only be
  // slow. Seeds are fixed, so a failure here is reproducible.
  const topicCounts = new Map<string, number[]>();
  const pointTotals = new Set<number>();
  const questionCounts = new Set<number>();
  const uniqueCounts = new Set<number>();
  const dealtStatuses = new Set<string>();

  beforeAll(() => {
    for (let i = 0; i < EXAM_SAMPLE; i++) {
      const exam = buildExam(i * 7919 + 13);
      questionCounts.add(exam.questions.length);
      uniqueCounts.add(new Set(exam.questions.map((q) => q.id)).size);
      pointTotals.add(exam.questions.reduce((n, q) => n + q.points, 0));

      const perTopic = new Map<string, number>();
      for (const q of exam.questions) {
        dealtStatuses.add(getContentRepo().questionById(q.id)?.status ?? "MISSING");
        const topicId = primaryTopicId(q.id) ?? "ORPHAN";
        perTopic.set(topicId, (perTopic.get(topicId) ?? 0) + 1);
      }
      for (const [topicId, n] of perTopic) {
        const series = topicCounts.get(topicId) ?? [];
        series.push(n);
        topicCounts.set(topicId, series);
      }
    }
  }, 120_000);

  it("deals nothing but approved questions", () => {
    expect([...dealtStatuses]).toEqual(["approved"]);
  });

  it("deals exactly 45 unique questions every time", () => {
    expect([...questionCounts]).toEqual([EXAM_QUESTION_COUNT]);
    expect([...uniqueCounts]).toEqual([EXAM_QUESTION_COUNT]);
  });

  it("totals exactly 97 points every time", () => {
    expect([...pointTotals]).toEqual([EXAM_MAX_POINTS]);
  });

  it("examines every topic in every exam, at its curriculum weight", () => {
    const audit = auditExamSupply();
    expect(topicCounts.size).toBe(audit.topics.length);
    for (const t of audit.topics) {
      const series = topicCounts.get(t.topicId) ?? [];
      expect(series.length, `${t.slug} missing from some exams`).toBe(EXAM_SAMPLE);
      const mean = series.reduce((a, b) => a + b, 0) / series.length;
      expect(
        Math.abs(mean - t.fairQuota),
        `${t.slug}: ${mean.toFixed(2)} questions/exam vs ${t.fairQuota} by curriculum weight`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("deals the declared quota table exactly, in every exam (M-11)", () => {
    // The mix WAS already identical across seeds — that is what M-11 measured.
    // The difference is that it is now identical to a table someone decided,
    // instead of to whatever the pool sizes happened to imply that week.
    const audit = auditExamSupply();
    for (const row of EXAM_TOPIC_QUOTAS) {
      const topic = audit.topics.find((t) => t.slug === row.slug)!;
      const series = topicCounts.get(topic.topicId) ?? [];
      const seen = new Set(series);
      expect(
        [...seen],
        `${row.slug}: dealt ${[...seen].join("/")} questions across ${EXAM_SAMPLE} exams, declared ${row.quota}`,
      ).toEqual([row.quota]);
    }
  });
});
