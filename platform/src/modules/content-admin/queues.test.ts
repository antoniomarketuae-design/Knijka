/**
 * THE TEST THAT WOULD HAVE CAUGHT IT.
 *
 * Twelve first-aid rows were promoted from `needs-review` to `machine-checked`
 * — an honest promotion; they had passed every automated check — and thereby
 * left every queue in the review console. `listFlaggedQuestions` matched
 * `needs-review`/stale-signature in one branch and unsigned-`approved` claims in
 * the other, and `machine-checked` matched neither. Nothing threw. No count went
 * negative. The screen just showed 17 of 29 rows and looked entirely healthy,
 * while docs/development/91 §4.17 told the founder in writing to open /review
 * and approve all 29. Of the two most dangerous concepts in the product,
 * `c-bleeding-control` and `c-victim-handling`, exactly one row of seven each
 * was still on screen.
 *
 * So the assertions below are not about `machine-checked`. Adding one status to
 * one predicate would fix today and leave the mechanism intact. They are about
 * the property that was missing: the routing rule must be TOTAL — every status
 * the content schema allows must reach a queue a human can open. The status
 * vocabulary is read from `ContentStatusSchema`, the same enum
 * `validate:content` enforces, so inventing a fifth status without giving it a
 * queue turns this file red on the commit that invents it.
 */
import { describe, expect, it } from "vitest";
import { ContentStatusSchema } from "@/lib/content/schemas";
import type { ContentStatus } from "@/lib/content/types";
import {
  DEFAULT_QUEUE,
  QUEUE_META,
  REVIEW_QUEUES,
  dispositionOf,
  emptyQueueTotals,
  parseQueue,
} from "./queues";
import type { ApprovalEntry, ApprovalState, ReviewQueue } from "./types";

/** The authoritative status list — the zod enum, not a copy of it. */
const STATUSES = ContentStatusSchema.options as readonly ContentStatus[];

const ENTRY: ApprovalEntry = {
  questionId: "q-ptp-018",
  verdict: "approved",
  by: "Антонио",
  at: "2026-08-03T09:14:22.101Z",
  contentHash: `sha256:${"a".repeat(64)}`,
  noteBg: null,
};

const STATES: ApprovalState[] = [
  { kind: "human-approved", entry: ENTRY },
  { kind: "signature-stale", entry: ENTRY },
  { kind: "human-rejected", entry: { ...ENTRY, verdict: "rejected" } },
  { kind: "unsigned-claim" },
  { kind: "unsigned" },
];

const isQueue = (value: string): value is ReviewQueue =>
  (REVIEW_QUEUES as string[]).includes(value);

describe("no status may be unreachable from every queue", () => {
  it("routes every status the content schema allows into a real queue", () => {
    // The unsigned state is the one every generated row is in: nobody has
    // signed anything. If a status cannot be reached from there, rows written
    // with it are invisible to the only screen that can approve them.
    const stranded = STATUSES.filter((status) => !isQueue(dispositionOf(status, { kind: "unsigned" })));
    expect(
      stranded,
      `these statuses reach no queue and would vanish from /review: ${stranded.join(", ")}`,
    ).toEqual([]);
  });

  it("never returns anything but a queue or the one finished state", () => {
    for (const status of STATUSES) {
      for (const approval of STATES) {
        const where = dispositionOf(status, approval);
        expect(
          isQueue(where) || where === "human-approved",
          `${status} + ${approval.kind} routed to "${where}"`,
        ).toBe(true);
      }
    }
  });

  it("puts machine-checked rows somewhere a human can open — the actual regression", () => {
    // The twelve rows, by id, from the measurement in the brief: q-ptp-018,
    // 019, 020, 021, 038, 039, 040, 041, 042, 061, 063, 064.
    expect(dispositionOf("machine-checked", { kind: "unsigned" })).toBe("machine-checked");
    expect(REVIEW_QUEUES).toContain("machine-checked");
  });

  it("keeps a rejected row visible instead of burying it in draft", () => {
    // `applyDecision` sends a rejected row to `draft`. A reject that disappears
    // from every screen is the same hole, one door down.
    expect(dispositionOf("draft", { kind: "human-rejected", entry: { ...ENTRY, verdict: "rejected" } })).toBe(
      "draft",
    );
    expect(dispositionOf("draft", { kind: "unsigned" })).toBe("draft");
  });

  it("gives every queue a tab label, so none is reachable only by URL", () => {
    expect(REVIEW_QUEUES.length).toBeGreaterThan(0);
    for (const queue of REVIEW_QUEUES) {
      expect(QUEUE_META[queue]?.labelBg, `${queue} has no tab label`).toBeTruthy();
      expect(QUEUE_META[queue]?.hintBg, `${queue} has no tab hint`).toBeTruthy();
    }
    // Derived from the table, never hand-listed — the two cannot drift.
    expect(REVIEW_QUEUES).toEqual(Object.keys(QUEUE_META));
    expect(new Set(REVIEW_QUEUES).size).toBe(REVIEW_QUEUES.length);
  });
});

describe("the precedence rules, one at a time", () => {
  it("treats a signed, hash-matching `approved` row as finished", () => {
    expect(dispositionOf("approved", { kind: "human-approved", entry: ENTRY })).toBe("human-approved");
  });

  it("re-queues a signed row whose status was walked back", () => {
    // contentHash deliberately excludes `status` (content/SCHEMA.md), so a row
    // can carry a valid signature and still say "needs-review". That is a
    // contradiction and it belongs on a screen — and it is what keeps
    // sum(queueTotals) + humanApproved === total exact.
    expect(dispositionOf("needs-review", { kind: "human-approved", entry: ENTRY })).toBe("needs-review");
    expect(dispositionOf("machine-checked", { kind: "human-approved", entry: ENTRY })).toBe(
      "machine-checked",
    );
  });

  it("sends a stale signature to needs-review whatever the row says", () => {
    for (const status of STATUSES) {
      expect(dispositionOf(status, { kind: "signature-stale", entry: ENTRY })).toBe("needs-review");
    }
  });

  it("keeps the unsigned `approved` pile in its own queue", () => {
    expect(dispositionOf("approved", { kind: "unsigned-claim" })).toBe("unsigned");
  });
});

describe("the queue parameter is narrowed, never trusted", () => {
  it("accepts every real queue", () => {
    for (const queue of REVIEW_QUEUES) expect(parseQueue(queue)).toBe(queue);
  });

  it("falls back instead of throwing or paging an empty screen", () => {
    for (const junk of [null, undefined, "", "approved", "../../etc", "MACHINE-CHECKED"]) {
      expect(parseQueue(junk)).toBe(DEFAULT_QUEUE);
    }
    expect(isQueue(DEFAULT_QUEUE)).toBe(true);
  });

  it("hands out a zeroed slot per queue", () => {
    const totals = emptyQueueTotals();
    expect(Object.keys(totals).sort()).toEqual([...REVIEW_QUEUES].sort());
    for (const queue of REVIEW_QUEUES) expect(totals[queue]).toBe(0);
  });
});
