/**
 * Exam supply audit — the structural guard behind the eligibility policy.
 *
 * builder.ts assigns topic quotas from the declared table (quotas.ts), capped by
 * each topic's eligible (approved) supply. That makes review debt curriculum-
 * shaping: a question left un-approved does not merely leave the pool — once a
 * topic has fewer approved questions than the table owes it, its exam slots
 * re-flow to whichever topics happen to be further through review. And it is
 * silent by construction — the paper still has 45 questions and 97 points, so
 * every invariant the exam module previously asserted keeps passing while a
 * topic goes dark. Measured case (audit M-8, 2026-07-24): `signali-i-markirovka`
 * had 65 authored questions but 13 eligible, so road markings — a heavily
 * examined official topic — were worth ~1.6% of a mock exam instead of ~6%. A
 * candidate could pass five mocks nearly untested on markings and never know.
 *
 * This module makes the invisible visible. For every topic it compares:
 *   • `quota`     — slots from the APPROVED pool: what candidates actually sit;
 *   • `fairQuota` — slots the topic would get if every authored question were
 *                   approved: the declared weighting (quotas.ts) as long as the
 *                   topic has the questions to back it.
 * A gap between the two is review debt masquerading as a curriculum decision.
 *
 * The audit is a pure read over the ContentRepo — no RNG, no exam built — so it
 * is cheap enough to run in CI (supply.test.ts) and from an admin screen.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question, Topic } from "../../lib/content/types";
import { assignQuotas, isExamEligible, type QuotaTarget } from "./builder";
import { EXAM_QUESTION_COUNT } from "./types";

/**
 * Approved questions a topic must hold PER EXAM SLOT it is owed. Below this the
 * topic is examinable but threadbare: the builder would be re-serving the same
 * handful of items to a candidate taking several mocks, which is how a student
 * memorises a bank instead of learning a rule (audit M-5/M-12 territory).
 */
export const MIN_SUPPLY_PER_SLOT = 3;

/**
 * Share of a topic's authored questions that must be approved. Below half, most
 * of what the topic teaches cannot be examined at all — whatever the quota
 * arithmetic then says, the exam is testing a minority of the material.
 */
export const MIN_APPROVED_SHARE = 0.5;

/**
 * How far a topic's real quota may fall below its fair quota before we call the
 * exam mis-weighted. One slot is rounding (45 slots over 16 topics never divides
 * cleanly); two is a topic being materially under-examined.
 */
export const MAX_QUOTA_SHORTFALL = 1;

export type SupplyProblemCode =
  /** Topic has authored questions but none approved — not examined at all. */
  | "TOPIC_DARK"
  /** Approved supply too thin to rotate across repeated mocks. */
  | "SUPPLY_TOO_THIN"
  /** Most of the topic is withheld from exams by review debt. */
  | "REVIEW_DEBT"
  /** Review debt has shifted the topic's exam slots to other topics. */
  | "UNDER_REPRESENTED";

export interface SupplyProblem {
  code: SupplyProblemCode;
  topicId: string;
  slug: string;
  /** Dev-facing, states the numbers and the remedy (review, not code). */
  message: string;
}

export interface TopicSupply {
  topicId: string;
  slug: string;
  titleBg: string;
  /** Questions whose primary concept maps here, whatever their status. */
  authored: number;
  /** The exam-eligible (approved) subset of `authored`. */
  eligible: number;
  /** Approved questions per point weight — the composition solver's freedom. */
  eligibleByWeight: Record<1 | 2 | 3, number>;
  /** Slots the topic gets in a real exam (allocation over `eligible`). */
  quota: number;
  /** Slots it would get with zero review debt (allocation over `authored`). */
  fairQuota: number;
  /** `eligible / authored` — 1 means the whole topic is examinable. */
  approvedShare: number;
}

export interface ExamSupplyAudit {
  /** True when `problems` is empty — the only value CI should accept. */
  ok: boolean;
  authored: number;
  eligible: number;
  /** Topic order (topics.json `order`), i.e. curriculum order. */
  topics: TopicSupply[];
  problems: SupplyProblem[];
}

/**
 * Audit the current content bank's exam supply, topic by topic.
 *
 * Throws the builder's own `ExamError` (BANK_TOO_SMALL) if the approved bank
 * cannot fill 45 slots at all — that is the same failure `buildExam` reports,
 * and there is nothing meaningful to audit below it.
 */
export function auditExamSupply(): ExamSupplyAudit {
  const repo = getContentRepo();
  const topicById = new Map(repo.topics().map((t) => [t.id, t]));

  // Same primary-topic rule as the builder: the topic of the first resolvable
  // concept. Anything orphaned is invisible to exams and to this audit alike.
  const byTopic = new Map<string, Question[]>();
  for (const q of repo.questions()) {
    const concept = q.conceptIds
      .map((id) => repo.conceptById(id))
      .find((c) => c !== undefined);
    if (!concept || !topicById.has(concept.topicId)) continue;
    const list = byTopic.get(concept.topicId) ?? [];
    list.push(q);
    byTopic.set(concept.topicId, list);
  }

  // assignQuotas' tie-break is documented as "pools arrive in topic order" —
  // both allocations must therefore be built the same way to be comparable.
  const rows = [...byTopic.entries()]
    .map(([topicId, questions]) => ({
      topic: topicById.get(topicId) as Topic,
      questions,
      eligible: questions.filter(isExamEligible),
    }))
    .sort((a, b) => a.topic.order - b.topic.order);

  // Same function, two supplies. With the declared quota table (M-11) `fair` is
  // simply the table read back — a topic with enough AUTHORED questions gets
  // exactly its declared slots — which is what "the curriculum's own weighting"
  // now means. `real` is the same assignment over the approved subset, so any
  // gap between them is review debt and nothing else.
  const real: QuotaTarget[] = rows.map((r) => ({
    slug: r.topic.slug,
    supply: r.eligible.length,
    quota: 0,
  }));
  const fair: QuotaTarget[] = rows.map((r) => ({
    slug: r.topic.slug,
    supply: r.questions.length,
    quota: 0,
  }));
  assignQuotas(real, EXAM_QUESTION_COUNT);
  assignQuotas(fair, EXAM_QUESTION_COUNT);

  const topics: TopicSupply[] = rows.map((r, i) => ({
    topicId: r.topic.id,
    slug: r.topic.slug,
    titleBg: r.topic.titleBg,
    authored: r.questions.length,
    eligible: r.eligible.length,
    eligibleByWeight: {
      1: r.eligible.filter((q) => q.points === 1).length,
      2: r.eligible.filter((q) => q.points === 2).length,
      3: r.eligible.filter((q) => q.points === 3).length,
    },
    quota: real[i].quota,
    fairQuota: fair[i].quota,
    approvedShare: r.questions.length === 0 ? 1 : r.eligible.length / r.questions.length,
  }));

  const problems: SupplyProblem[] = [];
  for (const t of topics) {
    const where = { topicId: t.topicId, slug: t.slug };
    if (t.authored > 0 && t.eligible === 0) {
      problems.push({
        ...where,
        code: "TOPIC_DARK",
        message: `${t.slug}: ${t.authored} authored question(s), 0 approved — the topic cannot appear in any exam.`,
      });
      continue; // every other number for a dark topic is a consequence of this
    }
    const needed = t.fairQuota * MIN_SUPPLY_PER_SLOT;
    if (t.eligible < needed) {
      problems.push({
        ...where,
        code: "SUPPLY_TOO_THIN",
        message: `${t.slug}: ${t.eligible} approved question(s) for ${t.fairQuota} exam slot(s) — needs >= ${needed} (${MIN_SUPPLY_PER_SLOT}x) so repeated mocks can rotate.`,
      });
    }
    if (t.approvedShare < MIN_APPROVED_SHARE) {
      problems.push({
        ...where,
        code: "REVIEW_DEBT",
        message: `${t.slug}: only ${t.eligible}/${t.authored} (${Math.round(t.approvedShare * 100)}%) approved — most of the topic is withheld from exams by review debt.`,
      });
    }
    if (t.fairQuota - t.quota > MAX_QUOTA_SHORTFALL) {
      problems.push({
        ...where,
        code: "UNDER_REPRESENTED",
        message: `${t.slug}: ${t.quota} of 45 exam slots, ${t.fairQuota} by curriculum weight — review debt has moved ${t.fairQuota - t.quota} slot(s) to other topics.`,
      });
    }
  }

  return {
    ok: problems.length === 0,
    authored: topics.reduce((n, t) => n + t.authored, 0),
    eligible: topics.reduce((n, t) => n + t.eligible, 0),
    topics,
    problems,
  };
}

/** One line per topic — for CI output and admin screens. */
export function formatExamSupplyAudit(audit: ExamSupplyAudit): string {
  const rows = audit.topics.map(
    (t) =>
      `  ${t.slug.padEnd(28)} approved ${String(t.eligible).padStart(4)}/${String(t.authored).padEnd(4)}` +
      ` slots ${t.quota}/${t.fairQuota} fair` +
      `  w1/w2/w3 ${t.eligibleByWeight[1]}/${t.eligibleByWeight[2]}/${t.eligibleByWeight[3]}`,
  );
  return [
    `Exam supply: ${audit.eligible}/${audit.authored} approved across ${audit.topics.length} topics`,
    ...rows,
    ...audit.problems.map((p) => `  ! ${p.code}: ${p.message}`),
  ].join("\n");
}
