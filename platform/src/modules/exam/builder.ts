/**
 * Mock-exam builder — official Bulgarian category-B theory format
 * (docs/education/32): exactly 45 questions, point weights 1/2/3 summing to
 * exactly 97, spread across ALL topics according to the declared quota table
 * (quotas.ts). Only `approved` questions — `draft` and `needs-review` content
 * NEVER reaches an exam (see isExamEligible).
 *
 * WHY 97 IS NOT NEGOTIABLE (audit M-13). The builder used to accept "as close
 * to 97 as the bank allows" and fall back to the largest achievable total
 * below it, while EXAM_PASS_POINTS stayed an absolute 87. A 94-point paper
 * therefore moved the pass bar from 89.7% to 92.6% without a word to the
 * candidate — the exam would have been harder than the real one and told
 * nobody. A bank that cannot compose 97 is a content problem with a content
 * fix (approve more questions at the missing weight); it is never something to
 * paper over by quietly re-scaling the official format. So: throw.
 *
 * SELECTION ALGORITHM (deterministic given a seed)
 * ------------------------------------------------
 * 1. Eligibility & grouping — filter the bank to status `approved` and
 *    group by primary topic (topic of the question's first concept). Each
 *    topic pool is sorted by question id (stable base) then seeded-shuffled.
 * 2. Topic quotas — read from the DECLARED table in quotas.ts (audit M-11:
 *    the mix is a product decision, not a by-product of how many questions
 *    each topic happens to hold). A topic short of approved supply is capped
 *    at what it has and the freed slots re-flow to topics with spare capacity.
 *    Only when the table and content/topics.json disagree does the builder
 *    fall back to the old proportional allocation — loudly (assignQuotas).
 * 3. Point-sum solve (exact, no blind greedy) — for each topic, enumerate the
 *    feasible weight compositions (c1,c2,c3) with c1+c2+c3 = quota given the
 *    pool's per-weight counts. A suffix-feasibility DP over topics yields the
 *    full set of achievable exam totals. The target is 97, full stop: if 97 is
 *    not achievable the build FAILS (BANK_UNDERWEIGHT / BANK_OVERWEIGHT) —
 *    see the note on the pass mark below. A forward pass then picks, per
 *    topic, a seeded-random composition among those that keep the remaining
 *    target feasible — this is the "greedy with backtracking" made exact: the
 *    DP prunes every dead end up front, so the greedy pick can never get stuck.
 * 4. Materialize — within each topic take the first c_w questions of each
 *    weight from the shuffled pool, seeded-shuffle the final 45-question
 *    order and each question's options, and emit safe views (no `correct`
 *    flags, no explanations, no law refs).
 *
 * Same seed => identical exam (questions, order, option order). No
 * Math.random at module level — a fresh seed is drawn per call when omitted.
 */

import { getContentRepo } from "../../lib/content/repo";
import type { Question, Topic } from "../../lib/content/types";
import { declaredQuotaFor } from "./quotas";
import { createRng, pickOne, randomSeed, shuffle } from "./rng";
import {
  EXAM_MAX_POINTS,
  EXAM_QUESTION_COUNT,
  ExamError,
  type BuiltExam,
  type ExamQuestion,
} from "./types";

type Weight = 1 | 2 | 3;

/** (c1, c2, c3) — how many 1/2/3-point questions a topic contributes. */
type Composition = readonly [number, number, number];

/**
 * The minimum assignQuotas() needs: a topic identity, a pool size and a
 * mutable slot count. Named separately because supply.ts runs the very same
 * assignment over the FULL bank to learn what each topic's weighting would be
 * without review debt.
 */
export interface QuotaTarget {
  /** content/topics.json slug — the key the declared quota table is written in. */
  readonly slug: string;
  /** How many questions this topic can actually offer. */
  readonly supply: number;
  /** Slots assigned by assignQuotas(). */
  quota: number;
}

interface TopicPool extends QuotaTarget {
  topic: Topic;
  /** Seeded-shuffled eligible questions of this topic. */
  questions: Question[];
  byWeight: Record<Weight, Question[]>;
}

/**
 * Exam eligibility — `approved` ONLY.
 *
 * content/SCHEMA.md: every authored item starts as `draft` and "nothing ships
 * without review". `draft` used to count as eligible here, which put un-reviewed
 * questions — including ones whose own `lawRefs` still carry the "?" uncertainty
 * marker that SCHEMA.md's Hard Rule 2 defines — in front of a candidate sitting a
 * mock exam. A question we are not sure is legally correct is worse than no
 * question at all: it teaches the wrong rule with the full authority of an exam.
 * So the gate is the review flag itself, nothing softer.
 *
 * Cost of this rule, which must stay visible: quotas below are proportional to
 * the ELIGIBLE pool, so an un-approved question does not merely leave the pool,
 * it hands its topic's exam slots to whichever topics are further through review.
 * `supply.ts` (auditExamSupply) is the guard that keeps that from happening
 * silently again — see the dark-topic check below and supply.test.ts.
 */
export function isExamEligible(q: Question): boolean {
  return q.status === "approved";
}

/** Build one mock exam. Deterministic for a given seed. */
export function buildExam(seed?: number): BuiltExam {
  const resolvedSeed = (seed ?? randomSeed()) >>> 0;
  const rng = createRng(resolvedSeed);
  const repo = getContentRepo();

  // -- 1. eligible questions grouped by primary topic ----------------------
  const topicById = new Map(repo.topics().map((t) => [t.id, t]));
  const grouped = new Map<string, Question[]>();
  const authoredPerTopic = new Map<string, number>(); // any status — dark-topic guard
  for (const q of repo.questions()) {
    const concept = q.conceptIds
      .map((id) => repo.conceptById(id))
      .find((c) => c !== undefined);
    if (!concept || !topicById.has(concept.topicId)) continue; // orphan content
    authoredPerTopic.set(concept.topicId, (authoredPerTopic.get(concept.topicId) ?? 0) + 1);
    if (!isExamEligible(q)) continue;
    const list = grouped.get(concept.topicId) ?? [];
    list.push(q);
    grouped.set(concept.topicId, list);
  }

  // A topic the curriculum teaches but that contributes ZERO eligible questions
  // is not examined at all — and every other invariant (45 questions, 97 points)
  // still passes while it happens. That is exactly how signali-i-markirovka went
  // 80% dark unnoticed (audit M-8). Shout, but still build: our review debt must
  // never be the reason a candidate cannot sit a mock. auditExamSupply() +
  // supply.test.ts are the hard gate; this is the runtime smoke alarm.
  for (const [topicId, authored] of authoredPerTopic) {
    if (!grouped.has(topicId)) {
      console.error(
        `exam: topic "${topicById.get(topicId)!.slug}" is DARK — ${authored} authored question(s), 0 approved. No mock exam can examine it until that backlog is reviewed.`,
      );
    }
  }

  const pools: TopicPool[] = [...grouped.entries()]
    .map(([topicId, questions]) => {
      const topic = topicById.get(topicId)!;
      const stable = questions
        .slice()
        .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      const shuffled = shuffle(stable, rng);
      return {
        topic,
        slug: topic.slug,
        questions: shuffled,
        byWeight: {
          1: shuffled.filter((q) => q.points === 1),
          2: shuffled.filter((q) => q.points === 2),
          3: shuffled.filter((q) => q.points === 3),
        },
        supply: shuffled.length,
        quota: 0,
      };
    })
    .sort((a, b) => a.topic.order - b.topic.order);

  const totalEligible = pools.reduce((n, p) => n + p.questions.length, 0);
  if (totalEligible < EXAM_QUESTION_COUNT) {
    throw new ExamError(
      "BANK_TOO_SMALL",
      `Need ${EXAM_QUESTION_COUNT} eligible questions, bank has ${totalEligible}`,
    );
  }

  // -- 2. quotas ------------------------------------------------------------
  assignQuotas(pools, EXAM_QUESTION_COUNT);

  // -- 3. exact point-sum solve ----------------------------------------------
  const active = pools.filter((p) => p.quota > 0);
  const comps = active.map((p) =>
    compositionsFor(p.quota, p.byWeight[1].length, p.byWeight[2].length, p.byWeight[3].length),
  );
  const suffixFeasible = buildSuffixFeasibility(comps);

  // 97 or nothing (audit M-13 — see the note in the file header). A silent
  // sub-97 paper raises the effective pass bar without telling the candidate,
  // so the two ways of missing the target are reported as what they are:
  // content problems, each with a different content fix.
  const achievable = suffixFeasible[0];
  if (!achievable.has(EXAM_MAX_POINTS)) {
    let bestBelow = -1;
    let lowest = Number.POSITIVE_INFINITY;
    for (const t of achievable) {
      if (t <= EXAM_MAX_POINTS && t > bestBelow) bestBelow = t;
      if (t < lowest) lowest = t;
    }
    if (lowest > EXAM_MAX_POINTS) {
      throw new ExamError(
        "BANK_OVERWEIGHT",
        `No ${EXAM_QUESTION_COUNT}-question selection fits within ${EXAM_MAX_POINTS} points (lightest possible paper is ${lowest}) — approve more 1- and 2-point questions`,
      );
    }
    throw new ExamError(
      "BANK_UNDERWEIGHT",
      `No ${EXAM_QUESTION_COUNT}-question selection reaches exactly ${EXAM_MAX_POINTS} points (closest below is ${bestBelow}) — approve more 3-point questions in the thin topics`,
    );
  }
  const target = EXAM_MAX_POINTS;

  // forward pass: seeded pick among compositions that keep the target feasible
  const selected: Question[] = [];
  let remaining = target;
  active.forEach((pool, i) => {
    const candidates: Composition[] = [];
    for (const [sum, list] of comps[i]) {
      if (suffixFeasible[i + 1].has(remaining - sum)) candidates.push(...list);
    }
    // deterministic candidate order before the seeded pick
    candidates.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
    const [c1, c2, c3] = pickOne(candidates, rng);
    remaining -= c1 * 1 + c2 * 2 + c3 * 3;
    selected.push(
      ...pool.byWeight[1].slice(0, c1),
      ...pool.byWeight[2].slice(0, c2),
      ...pool.byWeight[3].slice(0, c3),
    );
  });

  // -- 4. materialize ---------------------------------------------------------
  const ordered = shuffle(selected, rng);
  const questions: ExamQuestion[] = ordered.map((q) => ({
    id: q.id,
    type: q.type,
    points: q.points,
    textBg: q.textBg,
    media: q.media,
    // Safe views: never `correct`; option media (sign faces) may pass through.
    options: shuffle(q.options, rng).map((o) =>
      o.media === undefined
        ? { id: o.id, textBg: o.textBg }
        : { id: o.id, textBg: o.textBg, media: o.media },
    ),
  }));

  const totalPoints = questions.reduce((n, q) => n + q.points, 0);
  if (questions.length !== EXAM_QUESTION_COUNT || totalPoints !== EXAM_MAX_POINTS) {
    // invariant guard — should be unreachable. Asserted against the format
    // constant itself, not against `target`: a bug that mis-sets the target is
    // exactly the failure M-13 describes, and it must not verify itself.
    throw new ExamError(
      "INVALID_ATTEMPT_STATE",
      `Builder invariant violated: ${questions.length} questions / ${totalPoints} pts (format: ${EXAM_QUESTION_COUNT} / ${EXAM_MAX_POINTS})`,
    );
  }

  return { seed: resolvedSeed, questions, totalPoints };
}

/**
 * Assign each topic its slots from the DECLARED quota table (quotas.ts).
 *
 * A topic whose approved supply is smaller than its declared quota is capped
 * at what it can actually offer, and the freed slots re-flow to the topics with
 * the most spare capacity — the paper still has 45 questions, and the topic
 * that could not fill its own slots is the one auditExamSupply() then names.
 *
 * FALLBACK. If the table and content/topics.json have drifted apart — a topic
 * exists in the bank that nobody declared a weight for — there is no honest
 * declared answer, so this reverts to the old proportional allocation and says
 * so on stderr. Silently dropping the undeclared topic would re-create audit
 * M-8 (a topic examined at zero) with the spec as the culprit instead of review
 * debt. content-bank.test.ts is the gate that keeps the two files in step.
 *
 * Mutates `pool.quota`. Pools must arrive sorted by topic order (tie-break).
 *
 * Exported (module-internal, not re-exported from index.ts) so supply.ts can
 * run the identical assignment over the un-filtered bank — comparing quotas
 * only means something if both sides come out of the same function.
 */
export function assignQuotas(pools: QuotaTarget[], total: number): void {
  const undeclared = pools.filter((p) => declaredQuotaFor(p.slug) === undefined);
  if (undeclared.length > 0) {
    warnQuotaDrift(undeclared.map((p) => p.slug));
    allocateQuotas(pools, total);
    return;
  }

  let assigned = 0;
  for (const p of pools) {
    // The lookup is defined for every pool here (checked above). A topic the
    // table declares but the bank cannot offer AT ALL is simply absent from
    // `pools`, and its slots fall into the shortfall below.
    const declared = declaredQuotaFor(p.slug) ?? 0;
    p.quota = Math.min(declared, p.supply);
    assigned += p.quota;
  }

  // Re-flow whatever the declared table could not place: repeatedly to the
  // topic with the most unused approved supply (tie-break: topic order, since
  // `pools` arrives curriculum-ordered). Deterministic — no RNG in the mix.
  let shortfall = total - assigned;
  while (shortfall > 0) {
    let best: QuotaTarget | null = null;
    for (const p of pools) {
      const spare = p.supply - p.quota;
      if (spare <= 0) continue;
      if (best === null || spare > best.supply - best.quota) best = p;
    }
    if (best === null) {
      throw new ExamError("BANK_TOO_SMALL", "Not enough eligible questions for quotas");
    }
    best.quota += 1;
    shortfall -= 1;
  }
}

/**
 * One line per distinct drift, not one per built exam: every mock exam and
 * every supply audit runs this path, and a message repeated 500 times in a CI
 * log is a message nobody reads.
 */
const warnedQuotaDrift = new Set<string>();

function warnQuotaDrift(slugs: string[]): void {
  const key = [...slugs].sort().join(",");
  if (warnedQuotaDrift.has(key)) return;
  warnedQuotaDrift.add(key);
  console.error(
    `exam: topic(s) ${key} are in the content bank but not in the declared quota table (modules/exam/quotas.ts). Falling back to proportional allocation — the exam mix is an accident again until the table is updated.`,
  );
}

/**
 * Proportional fallback: give every non-empty topic 1 slot (as long as slots
 * remain), then spread the rest proportionally to pool size — largest-
 * remainder, capped at pool size, iterating so capped overflow re-flows to
 * topics with spare capacity. Mutates `pool.quota`.
 *
 * This was the ONLY allocation until audit M-11; it survives as the honest
 * answer for a bank whose topics the quota table does not describe (fixtures,
 * and a curriculum change caught mid-edit).
 */
export function allocateQuotas(pools: QuotaTarget[], total: number): void {
  let assigned = 0;
  for (const p of pools) {
    p.quota = assigned < total && p.supply > 0 ? 1 : 0;
    assigned += p.quota;
  }

  let remaining = total - assigned;
  let guard = 0;
  while (remaining > 0) {
    if (++guard > pools.length + total) {
      throw new ExamError("BANK_TOO_SMALL", "Quota allocation failed to converge");
    }
    const open = pools.filter((p) => p.quota < p.supply);
    if (open.length === 0) {
      throw new ExamError("BANK_TOO_SMALL", "Not enough eligible questions for quotas");
    }
    const weightSum = open.reduce((n, p) => n + p.supply, 0);
    const shares = open.map((p) => {
      const ideal = (remaining * p.supply) / weightSum;
      const base = Math.min(Math.floor(ideal), p.supply - p.quota);
      return { p, base, frac: ideal - base };
    });
    for (const s of shares) {
      s.p.quota += s.base;
      remaining -= s.base;
    }
    // largest remainder for the leftovers (stable: pools already topic-ordered)
    shares.sort((a, b) => b.frac - a.frac);
    for (const s of shares) {
      if (remaining === 0) break;
      if (s.p.quota < s.p.supply) {
        s.p.quota += 1;
        remaining -= 1;
      }
    }
  }
}

/**
 * All weight compositions (c1,c2,c3) with c1+c2+c3 = quota respecting the
 * pool's per-weight counts, keyed by point sum.
 */
function compositionsFor(
  quota: number,
  n1: number,
  n2: number,
  n3: number,
): Map<number, Composition[]> {
  const bySum = new Map<number, Composition[]>();
  for (let c3 = 0; c3 <= Math.min(quota, n3); c3++) {
    for (let c2 = 0; c2 <= Math.min(quota - c3, n2); c2++) {
      const c1 = quota - c3 - c2;
      if (c1 > n1) continue;
      const sum = c1 + 2 * c2 + 3 * c3;
      const list = bySum.get(sum) ?? [];
      list.push([c1, c2, c3]);
      bySum.set(sum, list);
    }
  }
  return bySum;
}

/**
 * suffix[i] = set of point totals achievable by topics i..end.
 * suffix[len] = {0}. suffix[0] is the full set of achievable exam totals.
 */
function buildSuffixFeasibility(comps: Map<number, Composition[]>[]): Set<number>[] {
  const suffix: Set<number>[] = new Array(comps.length + 1);
  suffix[comps.length] = new Set([0]);
  for (let i = comps.length - 1; i >= 0; i--) {
    const acc = new Set<number>();
    for (const sum of comps[i].keys()) {
      for (const rest of suffix[i + 1]) acc.add(sum + rest);
    }
    suffix[i] = acc;
  }
  return suffix;
}
