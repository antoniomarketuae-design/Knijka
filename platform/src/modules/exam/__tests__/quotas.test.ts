/**
 * The declared topic-quota table (audit M-11) — content-independent checks.
 *
 * The table is a spec, so the things that make it a valid spec are asserted
 * rather than documented: it must add up to a legal paper, name each topic
 * once, and never write a topic out of the exam. Whether it matches the actual
 * content bank is a different question, asserted in content-bank.test.ts.
 */

import { describe, expect, it } from "vitest";
import {
  DECLARED_QUOTA_TOTAL,
  EXAM_QUESTION_COUNT,
  EXAM_TOPIC_QUOTAS,
  declaredQuotaFor,
} from "..";

describe("EXAM_TOPIC_QUOTAS", () => {
  it("hands out exactly 45 slots", () => {
    // Anything else is not the official format. quotas.ts throws at import
    // time on a bad sum; this is the assertion that fails in CI first.
    expect(DECLARED_QUOTA_TOTAL).toBe(EXAM_QUESTION_COUNT);
    expect(EXAM_TOPIC_QUOTAS.reduce((n, t) => n + t.quota, 0)).toBe(
      EXAM_QUESTION_COUNT,
    );
  });

  it("names every topic exactly once", () => {
    const slugs = EXAM_TOPIC_QUOTAS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("never writes a topic out of the exam", () => {
    // docs/education/32's format is a paper that examines the whole
    // curriculum: a 0-slot topic is the M-8 dark-topic failure, declared.
    for (const t of EXAM_TOPIC_QUOTAS) {
      expect(t.quota, `${t.slug} is worth 0 questions`).toBeGreaterThanOrEqual(1);
      expect(Number.isInteger(t.quota)).toBe(true);
    }
  });

  it("says why each topic is worth its slots", () => {
    // The rationale is what the next person editing this table reads instead
    // of re-deriving the weighting from scratch.
    for (const t of EXAM_TOPIC_QUOTAS) {
      expect(t.rationale.length, `${t.slug} has no rationale`).toBeGreaterThan(20);
    }
  });

  it("resolves declared quotas by slug and reports unknown topics as undefined", () => {
    for (const t of EXAM_TOPIC_QUOTAS) {
      expect(declaredQuotaFor(t.slug)).toBe(t.quota);
    }
    expect(declaredQuotaFor("topic-that-does-not-exist")).toBeUndefined();
  });
});
