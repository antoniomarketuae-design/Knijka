/**
 * auditExamSupply() — unit tests on synthetic banks.
 *
 * The guard's whole job is to notice review debt that the exam's own invariants
 * cannot: a starved topic still yields 45 questions and 97 points, so without
 * this audit the only symptom is a candidate being examined on the wrong mix.
 * The starved fixture is audit M-8 in miniature.
 *
 * The real /content bank is asserted separately in content-bank.test.ts —
 * these tests must stay content-independent.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "../../../lib/content/repo";
import {
  auditExamSupply,
  formatExamSupplyAudit,
  ExamError,
  MIN_SUPPLY_PER_SLOT,
} from "..";
import { makeFixtureRepo, supplyBank, tinyBank } from "./fixtures";

describe("auditExamSupply — a healthy bank", () => {
  beforeEach(() => {
    setContentRepo(makeFixtureRepo(supplyBank()));
  });

  it("reports no problems", () => {
    const audit = auditExamSupply();
    expect(audit.problems, formatExamSupplyAudit(audit)).toEqual([]);
    expect(audit.ok).toBe(true);
  });

  it("gives every topic its curriculum weight (quota == fairQuota)", () => {
    const audit = auditExamSupply();
    expect(audit.topics).toHaveLength(4);
    expect(audit.topics.reduce((n, t) => n + t.quota, 0)).toBe(45);
    for (const t of audit.topics) {
      expect(t.quota).toBe(t.fairQuota);
      expect(t.approvedShare).toBe(1);
      expect(t.eligible).toBeGreaterThanOrEqual(t.fairQuota * MIN_SUPPLY_PER_SLOT);
    }
  });
});

describe("auditExamSupply — a topic starved by review debt (M-8)", () => {
  beforeEach(() => {
    setContentRepo(makeFixtureRepo(supplyBank({ starveTopic: "d" })));
  });

  it("names the starved topic and every way it is starved", () => {
    const audit = auditExamSupply();
    expect(audit.ok).toBe(false);
    expect(audit.problems.every((p) => p.slug === "topic-d")).toBe(true);
    expect(new Set(audit.problems.map((p) => p.code))).toEqual(
      new Set(["SUPPLY_TOO_THIN", "REVIEW_DEBT", "UNDER_REPRESENTED"]),
    );
  });

  it("measures the slots review debt moved to the other topics", () => {
    const audit = auditExamSupply();
    const starved = audit.topics.find((t) => t.slug === "topic-d")!;
    expect(starved.authored).toBe(45);
    expect(starved.eligible).toBe(9); // 3 per weight survive review
    // The paper is still a legal 45 — the loss is invisible without this audit.
    expect(audit.topics.reduce((n, t) => n + t.quota, 0)).toBe(45);
    expect(starved.quota).toBeLessThan(starved.fairQuota - 1);
    for (const other of audit.topics.filter((t) => t.slug !== "topic-d")) {
      expect(other.quota).toBeGreaterThan(other.fairQuota); // the slots landed here
    }
  });

  it("still sees the topic's authored weight, not just its approved one", () => {
    const starved = auditExamSupply().topics.find((t) => t.slug === "topic-d")!;
    // fairQuota reads the FULL bank on purpose: it is the curriculum's weighting,
    // the thing review debt must not be allowed to silently overrule.
    expect(starved.fairQuota).toBeGreaterThanOrEqual(11);
    expect(starved.approvedShare).toBeCloseTo(9 / 45, 5);
  });
});

describe("auditExamSupply — a topic with nothing approved at all", () => {
  it("flags TOPIC_DARK and nothing else for that topic", () => {
    const bank = supplyBank();
    for (const q of bank.questions) {
      if (q.conceptIds[0] === "c-d") q.status = "needs-review";
    }
    setContentRepo(makeFixtureRepo(bank));

    const audit = auditExamSupply();
    const dark = audit.problems.filter((p) => p.slug === "topic-d");
    expect(dark).toHaveLength(1);
    expect(dark[0].code).toBe("TOPIC_DARK");
    expect(dark[0].message).toContain("0 approved");
    expect(audit.topics.find((t) => t.slug === "topic-d")!.quota).toBe(0);
  });
});

describe("auditExamSupply — bank too small to examine", () => {
  it("fails the same way the builder does", () => {
    setContentRepo(makeFixtureRepo(tinyBank()));
    expect(() => auditExamSupply()).toThrowError(ExamError);
    try {
      auditExamSupply();
    } catch (e) {
      expect((e as ExamError).code).toBe("BANK_TOO_SMALL");
    }
  });
});
