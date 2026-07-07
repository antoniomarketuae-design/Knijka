/**
 * Mock-exam builder — official Bulgarian category-B theory format
 * (docs/education/32): exactly 45 questions, point weights 1/2/3 summing to
 * 97 (never more; as close to 97 as the bank allows), spread across ALL
 * topics proportionally to each topic's eligible-question availability
 * (min 1 per topic when possible). Only `draft` / `approved` questions —
 * `needs-review` content NEVER reaches an exam.
 *
 * SELECTION ALGORITHM (deterministic given a seed)
 * ------------------------------------------------
 * 1. Eligibility & grouping — filter the bank to status draft|approved and
 *    group by primary topic (topic of the question's first concept). Each
 *    topic pool is sorted by question id (stable base) then seeded-shuffled.
 * 2. Topic quotas — every non-empty topic gets 1 slot, then the remaining
 *    slots are distributed proportionally to topic pool sizes via the
 *    largest-remainder method, capped at pool size (iterating until all 45
 *    slots land; deterministic tie-break by topic order).
 * 3. Point-sum solve (exact, no blind greedy) — for each topic, enumerate the
 *    feasible weight compositions (c1,c2,c3) with c1+c2+c3 = quota given the
 *    pool's per-weight counts. A suffix-feasibility DP over topics yields the
 *    full set of achievable exam totals. Target = 97 if achievable, else the
 *    largest achievable total <= 97 ("as close to 97 as the bank allows");
 *    if even the minimum achievable total exceeds 97, building fails
 *    (BANK_OVERWEIGHT). A forward pass then picks, per topic, a seeded-random
 *    composition among those that keep the remaining target feasible — this
 *    is the "greedy with backtracking" made exact: the DP prunes every dead
 *    end up front, so the greedy pick can never get stuck.
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

interface TopicPool {
  topic: Topic;
  /** Seeded-shuffled eligible questions of this topic. */
  questions: Question[];
  byWeight: Record<Weight, Question[]>;
  quota: number;
}

export function isExamEligible(q: Question): boolean {
  return q.status === "draft" || q.status === "approved";
}

/** Build one mock exam. Deterministic for a given seed. */
export function buildExam(seed?: number): BuiltExam {
  const resolvedSeed = (seed ?? randomSeed()) >>> 0;
  const rng = createRng(resolvedSeed);
  const repo = getContentRepo();

  // -- 1. eligible questions grouped by primary topic ----------------------
  const topicById = new Map(repo.topics().map((t) => [t.id, t]));
  const grouped = new Map<string, Question[]>();
  for (const q of repo.questions()) {
    if (!isExamEligible(q)) continue;
    const concept = q.conceptIds
      .map((id) => repo.conceptById(id))
      .find((c) => c !== undefined);
    if (!concept || !topicById.has(concept.topicId)) continue; // orphan content
    const list = grouped.get(concept.topicId) ?? [];
    list.push(q);
    grouped.set(concept.topicId, list);
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
        questions: shuffled,
        byWeight: {
          1: shuffled.filter((q) => q.points === 1),
          2: shuffled.filter((q) => q.points === 2),
          3: shuffled.filter((q) => q.points === 3),
        },
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
  allocateQuotas(pools, EXAM_QUESTION_COUNT);

  // -- 3. exact point-sum solve ----------------------------------------------
  const active = pools.filter((p) => p.quota > 0);
  const comps = active.map((p) =>
    compositionsFor(p.quota, p.byWeight[1].length, p.byWeight[2].length, p.byWeight[3].length),
  );
  const suffixFeasible = buildSuffixFeasibility(comps);

  const achievable = suffixFeasible[0];
  let target: number;
  if (achievable.has(EXAM_MAX_POINTS)) {
    target = EXAM_MAX_POINTS;
  } else {
    let bestBelow = -1;
    for (const t of achievable) if (t <= EXAM_MAX_POINTS && t > bestBelow) bestBelow = t;
    if (bestBelow < 0) {
      throw new ExamError(
        "BANK_OVERWEIGHT",
        `No ${EXAM_QUESTION_COUNT}-question selection fits within ${EXAM_MAX_POINTS} points`,
      );
    }
    target = bestBelow;
  }

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
    options: shuffle(q.options, rng).map((o) => ({ id: o.id, textBg: o.textBg })),
  }));

  const totalPoints = questions.reduce((n, q) => n + q.points, 0);
  if (questions.length !== EXAM_QUESTION_COUNT || totalPoints !== target) {
    // invariant guard — should be unreachable
    throw new ExamError(
      "INVALID_ATTEMPT_STATE",
      `Builder invariant violated: ${questions.length} questions / ${totalPoints} pts`,
    );
  }

  return { seed: resolvedSeed, questions, totalPoints };
}

/**
 * Give every non-empty topic 1 slot (as long as slots remain), then spread
 * the rest proportionally to pool size — largest-remainder, capped at pool
 * size, iterating so capped overflow re-flows to topics with spare capacity.
 * Mutates `pool.quota`. Pools must arrive sorted by topic order (tie-break).
 */
function allocateQuotas(pools: TopicPool[], total: number): void {
  let assigned = 0;
  for (const p of pools) {
    p.quota = assigned < total && p.questions.length > 0 ? 1 : 0;
    assigned += p.quota;
  }

  let remaining = total - assigned;
  let guard = 0;
  while (remaining > 0) {
    if (++guard > pools.length + total) {
      throw new ExamError("BANK_TOO_SMALL", "Quota allocation failed to converge");
    }
    const open = pools.filter((p) => p.quota < p.questions.length);
    if (open.length === 0) {
      throw new ExamError("BANK_TOO_SMALL", "Not enough eligible questions for quotas");
    }
    const weightSum = open.reduce((n, p) => n + p.questions.length, 0);
    const shares = open.map((p) => {
      const ideal = (remaining * p.questions.length) / weightSum;
      const base = Math.min(Math.floor(ideal), p.questions.length - p.quota);
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
      if (s.p.quota < s.p.questions.length) {
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
