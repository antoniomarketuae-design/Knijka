/**
 * WHICH BACKLOG A ROW BELONGS TO — the routing table, and the only copy of it.
 *
 * THE DEFECT THIS FILE EXISTS TO END. The queue used to be a two-branch
 * expression inside `collectQueue`: `needs-review` matched
 * `status === "needs-review" || signature-stale`, and everything else was
 * matched only if it was an unsigned `approved` claim. `machine-checked`
 * matched NEITHER. So promoting twelve first-aid rows from `needs-review` to
 * `machine-checked` — an honest promotion, they had passed every automated
 * check — deleted them from the review console. Measured: 17 of the 29
 * first-aid rows visible, 12 gone, and `c-bleeding-control` and
 * `c-victim-handling` reduced to one visible row each while
 * docs/development/91 §4.17 told the founder in writing to open /review and
 * approve all 29. He would have cleared a topic without ever seeing the
 * bleeding-control and casualty-handling rows.
 *
 * The lesson is not "add machine-checked to the predicate". It is that a
 * PARTIAL routing rule fails silently: nothing throws, no count goes negative,
 * the screen simply shows fewer rows and looks perfectly healthy. So the rule
 * here is TOTAL by construction —
 *
 *   every question lands in exactly one queue, or is human-approved. Nothing
 *   else is a legal outcome.
 *
 * and it is total in three enforced ways:
 *
 *   1. `dispositionOf` switches on `ContentStatus` with no `default`. Add a
 *      fifth status to the schema and this file stops compiling.
 *   2. `QUEUE_META` is a `Record<ReviewQueue, …>`, so a queue cannot exist
 *      without the label the console renders it with — the tab strip is built
 *      from `REVIEW_QUEUES`, not hand-written, so a new queue cannot be
 *      unreachable in the UI either.
 *   3. `census.queueTotals` sums to `total - humanApproved` over the real
 *      bank, checked in queue.test.ts. A status that routes nowhere makes that
 *      sum fall short and the test goes red naming the shortfall.
 *
 * Pure and client-safe on purpose: no `node:fs`, no zod, no side effects. The
 * console imports it directly (like `./types`) so the server and the tab strip
 * cannot disagree about what queues exist.
 */
import type { ContentStatus } from "@/lib/content/types";
import type { ApprovalState, ReviewQueue } from "./types";

export interface QueueMeta {
  /** Tab label. */
  labelBg: string;
  /** One line under the tab: what this pile IS, in the words it deserves. */
  hintBg: string;
}

/**
 * Every queue, in the order the console shows them — worst first.
 *
 * `Record<ReviewQueue, …>` is doing real work: it is a compile error to add a
 * member to `ReviewQueue` and not answer "what does the founder see on the tab?"
 */
export const QUEUE_META: Record<ReviewQueue, QueueMeta> = {
  "needs-review": {
    labelBg: "За поправка",
    hintBg:
      "Одиторът или вълна поправки е намерила нещо конкретно. Тук падат и редовете с изтекъл подпис.",
  },
  "machine-checked": {
    labelBg: "Проверени от машина",
    hintBg:
      "Минали са всички автоматични проверки — и НИКОЙ ЧОВЕК не ги е чел. Машината не може да ги одобри; само ти.",
  },
  unsigned: {
    labelBg: "Неподписани",
    hintBg:
      "Пише „approved“, но никой човек не го е задавал. Стигат до ученик още днес.",
  },
  draft: {
    labelBg: "Чернови",
    hintBg:
      "Незавършени, или върнати от преглед. Не стигат до ученик — чакат автора, не подписа.",
  },
};

/**
 * The queue ids, derived from the table above so the two can never drift.
 * Key order in an object literal with string keys is insertion order, so this
 * is also the tab order.
 */
export const REVIEW_QUEUES = Object.keys(QUEUE_META) as ReviewQueue[];

/** The default backlog when no queue is named (or an unknown one is). */
export const DEFAULT_QUEUE: ReviewQueue = "needs-review";

/**
 * Where one row sits. `"human-approved"` is the ONLY non-queue outcome, and it
 * is the one state that has genuinely finished: a named person signed this
 * exact text and it may be dealt to a student. Everything else is somebody's
 * open work and must be on a screen a human can reach.
 */
export type RowDisposition = ReviewQueue | "human-approved";

/**
 * Route one row. Total over `ContentStatus` × `ApprovalState`.
 *
 * Precedence, and why:
 *  1. `approved` + a signature that still covers the row ends the story — that
 *     is the whole point of the ledger (content/SCHEMA.md). BOTH halves are
 *     required: `contentHash` deliberately excludes `status`, so a signed row
 *     whose status was later walked back to `needs-review` still matches its
 *     signature. That contradiction belongs on a screen, not in the finished
 *     pile, and it keeps `sum(queueTotals) + humanApproved === total` exact.
 *  2. A signature that no longer covers it is the loudest problem in the bank:
 *     somebody signed, somebody else edited, and the row is quietly unapproved.
 *     It goes to `needs-review` whatever its status says.
 *  3. Otherwise the row's own pipeline stage decides. Note `draft` gets a queue
 *     rather than being swept under the rug: `applyDecision` sends REJECTED
 *     rows there, and a reject that disappears from every screen is the same
 *     class of hole as the one this file was written to close.
 */
export function dispositionOf(status: ContentStatus, approval: ApprovalState): RowDisposition {
  if (approval.kind === "human-approved" && status === "approved") return "human-approved";
  if (approval.kind === "signature-stale") return "needs-review";

  // No `default:` — deliberately. A new ContentStatus must fail the build here
  // rather than fall through to a queue that happens to be first.
  switch (status) {
    case "needs-review":
      return "needs-review";
    case "machine-checked":
      return "machine-checked";
    case "approved":
      return "unsigned";
    case "draft":
      return "draft";
  }
}

/** Narrow an untrusted `?queue=` value. Anything unknown falls back, never throws. */
export function parseQueue(value: string | null | undefined): ReviewQueue {
  return REVIEW_QUEUES.includes(value as ReviewQueue) ? (value as ReviewQueue) : DEFAULT_QUEUE;
}

/** A zeroed tally with one slot per queue — the shape `census.queueTotals` carries. */
export function emptyQueueTotals(): Record<ReviewQueue, number> {
  return Object.fromEntries(REVIEW_QUEUES.map((q) => [q, 0])) as Record<ReviewQueue, number>;
}
