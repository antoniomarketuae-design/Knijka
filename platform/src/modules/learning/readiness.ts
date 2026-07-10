/**
 * Exam-readiness estimate v2 (theory + sim blend) + per-topic dashboard
 * overview.
 *
 * computeReadiness is a PURE function over (Progress rows, ContentRepo, now,
 * sim evidence):
 *
 *   theory(c)  = mastery(c) * recencyFactor(days since last update)
 *   blended(c) = has sim evidence for c
 *                  ? theory(c) * (1 - w) + simSignal(c) * w    (w = 0.25)
 *                  : theory(c)
 *   score      = 100 * Σ(difficulty_c * blended_c) / Σ(difficulty_c)
 *
 * summed over ALL concepts in the content repo:
 *  - weight     = concept difficulty (1..3) — harder concepts matter more;
 *  - coverage   = unseen concepts contribute mastery 0, so untouched material
 *    drags the score down (built-in coverage penalty);
 *  - recency    = full credit for 7 days after the last review, then linear
 *    decay to a 0.5 floor at 30 days — stale knowledge counts half.
 *
 * Sim blend (A14, de Winter: sim telemetry predicts the road test): each
 * concept-linked rule event from sessions in the last 14 days is evidence.
 * simSignal(c) = positive / (positive + negative) in [0,1], where each
 * commendation adds 1 positive unit and each violation adds severity-weighted
 * negative units (опасна 3, основна 2, второстепенна 1 — the official
 * hierarchy). Violation-free driving on a concept therefore RAISES its
 * effective mastery (up to +w) and repeated violations LOWER it (down to
 * theory×(1-w)). The blend is deliberately conservative: it only touches
 * concepts with recent sim evidence, so theory stays dominant until sim
 * coverage is broad; blending at CONCEPT level makes per-topic and overall
 * scores plus weakest-concepts all honest through one formula. Note the
 * long-term memory of sim mistakes already lives in Progress via
 * recordSimObservations (simFeed.ts); this blend is the bounded RECENT-
 * behaviour overlay on top (also the only place commendation-density counts).
 *
 * No data → score 0. Score maps directly to the ≥87/97 (~90%) exam bar:
 * a user should not sit the mock exam confident below ~85–90.
 */

import { getContentRepo, type ContentRepo } from "@/lib/content/repo";
import { DAY_MS, isDue } from "./scheduler";
import {
  getLearningStore,
  type ProgressRow,
  type SimEvidenceRow,
  type SimSeverity,
} from "./store";

/** Full recency credit within this many days of the last review. */
export const RECENCY_FULL_DAYS = 7;
/** Recency credit bottoms out at this factor... */
export const RECENCY_FLOOR = 0.5;
/** ...once this many days have passed since the last review. */
export const RECENCY_FLOOR_DAYS = 30;

export const WEAKEST_CONCEPTS_COUNT = 5;

// ---- sim blend (A14) --------------------------------------------------------

/** Sim evidence older than this many days no longer influences readiness. */
export const SIM_EVIDENCE_WINDOW_DAYS = 14;
/** Blend weight of the sim signal on a concept WITH recent evidence. */
export const SIM_BLEND_WEIGHT = 0.25;
/** Negative evidence units per violation, by official severity class. */
export const SIM_SEVERITY_UNITS: Record<SimSeverity, number> = {
  opasna: 3,
  osnovna: 2,
  vtorostepenna: 1,
};

/** Aggregated recent sim evidence for one concept. */
export interface SimConceptSignal {
  conceptId: string;
  violationCount: number;
  commendationCount: number;
  /** Worst severity observed, null when violation-free. */
  worstSeverity: SimSeverity | null;
  /** positive/(positive+negative) in [0,1]; 1 = violation-free driving. */
  signal: number;
}

/** Fold raw evidence rows into per-concept signals — pure. */
export function aggregateSimSignals(
  evidence: ReadonlyArray<SimEvidenceRow>,
): Map<string, SimConceptSignal> {
  const acc = new Map<
    string,
    { pos: number; neg: number; v: number; c: number; worst: SimSeverity | null }
  >();
  for (const row of evidence) {
    const cur =
      acc.get(row.conceptId) ?? { pos: 0, neg: 0, v: 0, c: 0, worst: null };
    if (row.kind === "violation" && row.severity !== null) {
      cur.neg += SIM_SEVERITY_UNITS[row.severity];
      cur.v += 1;
      if (
        cur.worst === null ||
        SIM_SEVERITY_UNITS[row.severity] > SIM_SEVERITY_UNITS[cur.worst]
      ) {
        cur.worst = row.severity;
      }
    } else if (row.kind === "commendation") {
      cur.pos += 1;
      cur.c += 1;
    }
    acc.set(row.conceptId, cur);
  }

  const out = new Map<string, SimConceptSignal>();
  for (const [conceptId, a] of acc) {
    const total = a.pos + a.neg;
    if (total === 0) continue;
    out.set(conceptId, {
      conceptId,
      violationCount: a.v,
      commendationCount: a.c,
      worstSeverity: a.worst,
      signal: a.pos / total,
    });
  }
  return out;
}

export interface ConceptReadiness {
  conceptId: string;
  topicId: string;
  titleBg: string;
  /** Recency-adjusted mastery 0..1 (0 = unseen). */
  effectiveMastery: number;
}

export interface Readiness {
  /** 0..100 */
  score: number;
  perTopic: { topicId: string; score: number }[];
  /** Up to 5 lowest-effective-mastery concepts, weakest first. */
  weakestConcepts: ConceptReadiness[];
}

/** 1 while fresh, linear decay to RECENCY_FLOOR at RECENCY_FLOOR_DAYS. */
export function recencyFactor(daysSinceReview: number): number {
  if (daysSinceReview <= RECENCY_FULL_DAYS) return 1;
  if (daysSinceReview >= RECENCY_FLOOR_DAYS) return RECENCY_FLOOR;
  const t =
    (daysSinceReview - RECENCY_FULL_DAYS) /
    (RECENCY_FLOOR_DAYS - RECENCY_FULL_DAYS);
  return 1 - t * (1 - RECENCY_FLOOR);
}

export function computeReadiness(
  progress: ProgressRow[],
  repo: ContentRepo,
  now: Date,
  simEvidence: ReadonlyArray<SimEvidenceRow> = [],
): Readiness {
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));
  const simSignals = aggregateSimSignals(simEvidence);

  const effectiveMastery = (conceptId: string): number => {
    const row = byConcept.get(conceptId);
    const days = row
      ? (now.getTime() - row.updatedAt.getTime()) / DAY_MS
      : Infinity;
    const theory = row ? row.mastery * recencyFactor(days) : 0;
    // Sim blend (see file header): only concepts with recent sim evidence
    // move, bounded by SIM_BLEND_WEIGHT — theory stays dominant.
    const sim = simSignals.get(conceptId);
    if (!sim) return theory;
    return clamp01(
      theory * (1 - SIM_BLEND_WEIGHT) + sim.signal * SIM_BLEND_WEIGHT,
    );
  };

  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);
  // All concepts, in topic order (stable tie-break for weakestConcepts).
  const concepts = topics.flatMap((t) => repo.conceptsByTopic(t.id));

  const weightedScore = (conceptIds: string[]): number => {
    let weightSum = 0;
    let masterySum = 0;
    for (const id of conceptIds) {
      const concept = repo.conceptById(id);
      if (!concept) continue;
      weightSum += concept.difficulty;
      masterySum += concept.difficulty * effectiveMastery(id);
    }
    return weightSum === 0 ? 0 : Math.round((100 * masterySum) / weightSum);
  };

  const perTopic = topics.map((t) => ({
    topicId: t.id,
    score: weightedScore(repo.conceptsByTopic(t.id).map((c) => c.id)),
  }));

  const weakestConcepts = concepts
    .map((c) => ({
      conceptId: c.id,
      topicId: c.topicId,
      titleBg: c.titleBg,
      effectiveMastery: effectiveMastery(c.id),
    }))
    .sort((a, b) => a.effectiveMastery - b.effectiveMastery)
    .slice(0, WEAKEST_CONCEPTS_COUNT);

  return {
    score: weightedScore(concepts.map((c) => c.id)),
    perTopic,
    weakestConcepts,
  };
}

export async function getReadiness(
  userId: string,
  now: Date = new Date(),
): Promise<Readiness> {
  const store = getLearningStore();
  const since = new Date(now.getTime() - SIM_EVIDENCE_WINDOW_DAYS * DAY_MS);
  const [progress, simEvidence] = await Promise.all([
    store.getProgress(userId),
    // A degraded sim read must never take the readiness ring down with it.
    store.getSimEvidenceSince(userId, since).catch(() => []),
  ]);
  return computeReadiness(progress, getContentRepo(), now, simEvidence);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

// ---------------------------------------------------------------------------
// Sim weak spots (A14) — dashboard card input
// ---------------------------------------------------------------------------

export interface SimWeakSpot {
  conceptId: string;
  titleBg: string;
  topicId: string;
  /** For the „practice this" link (/theory/practice?topic=<slug>). */
  topicSlug: string | null;
  violationCount: number;
  worstSeverity: SimSeverity;
}

export interface SimWeakSpotsResult {
  /** Any sim evidence in the window at all — drives card visibility. */
  hasRecentEvidence: boolean;
  /** Up to `limit` concepts with the worst recent sim evidence, worst first. */
  spots: SimWeakSpot[];
}

/** Rank concepts by recent sim evidence — pure (worst first). */
export function computeSimWeakSpots(
  evidence: ReadonlyArray<SimEvidenceRow>,
  repo: ContentRepo,
  limit: number,
): SimWeakSpotsResult {
  const signals = [...aggregateSimSignals(evidence).values()];
  const topicSlugById = new Map(repo.topics().map((t) => [t.id, t.slug]));

  const spots = signals
    .filter(
      (s): s is SimConceptSignal & { worstSeverity: SimSeverity } =>
        s.violationCount > 0 && s.worstSeverity !== null,
    )
    // Worst first: lowest signal (violation-dominated), then most violations,
    // then worst severity as the tie-break.
    .sort(
      (a, b) =>
        a.signal - b.signal ||
        b.violationCount - a.violationCount ||
        SIM_SEVERITY_UNITS[b.worstSeverity] - SIM_SEVERITY_UNITS[a.worstSeverity],
    )
    .slice(0, Math.max(0, limit))
    .flatMap((s) => {
      const concept = repo.conceptById(s.conceptId);
      if (!concept) return []; // stale id — content moved on, skip
      return [
        {
          conceptId: s.conceptId,
          titleBg: concept.titleBg,
          topicId: concept.topicId,
          topicSlug: topicSlugById.get(concept.topicId) ?? null,
          violationCount: s.violationCount,
          worstSeverity: s.worstSeverity,
        },
      ];
    });

  return { hasRecentEvidence: evidence.length > 0, spots };
}

/** The `limit` concepts with the worst recent sim evidence (dashboard card). */
export async function getSimWeakSpots(
  userId: string,
  limit = 3,
  now: Date = new Date(),
): Promise<SimWeakSpotsResult> {
  const since = new Date(now.getTime() - SIM_EVIDENCE_WINDOW_DAYS * DAY_MS);
  const evidence = await getLearningStore()
    .getSimEvidenceSince(userId, since)
    .catch(() => [] as SimEvidenceRow[]);
  return computeSimWeakSpots(evidence, getContentRepo(), limit);
}

// ---------------------------------------------------------------------------
// Per-topic dashboard overview
// ---------------------------------------------------------------------------

export interface TopicOverview {
  topicId: string;
  slug: string;
  titleBg: string;
  order: number;
  conceptCount: number;
  /** Concepts with at least one recorded answer. */
  seenConceptCount: number;
  /** seenConceptCount / conceptCount (0 when the topic has no concepts). */
  coverage: number;
  /** Unweighted average mastery over ALL topic concepts, unseen = 0 (0..1). */
  avgMastery: number;
  /** Concepts currently due for review. */
  dueCount: number;
}

export function computeTopicOverview(
  progress: ProgressRow[],
  repo: ContentRepo,
  now: Date,
): TopicOverview[] {
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);

  return topics.map((t) => {
    const concepts = repo.conceptsByTopic(t.id);
    let seen = 0;
    let due = 0;
    let masterySum = 0;
    for (const c of concepts) {
      const row = byConcept.get(c.id);
      if (!row) continue;
      seen += 1;
      masterySum += row.mastery;
      if (isDue({ reps: row.reps, dueAt: row.dueAt }, now)) due += 1;
    }
    const count = concepts.length;
    return {
      topicId: t.id,
      slug: t.slug,
      titleBg: t.titleBg,
      order: t.order,
      conceptCount: count,
      seenConceptCount: seen,
      coverage: count === 0 ? 0 : seen / count,
      avgMastery: count === 0 ? 0 : masterySum / count,
      dueCount: due,
    };
  });
}

export async function getTopicOverview(
  userId: string,
  now: Date = new Date(),
): Promise<TopicOverview[]> {
  const progress = await getLearningStore().getProgress(userId);
  return computeTopicOverview(progress, getContentRepo(), now);
}

// ---------------------------------------------------------------------------
// Per-section dashboard overview
// ---------------------------------------------------------------------------
//
// Sections are a PRESENTATION grouping of concepts (see content/sections.json).
// A section's stats are the aggregate of its concepts — the very same
// concept-level mastery the engine already owns. Nothing here feeds the
// engine; it only powers the finer-grained theory hub navigation.

export interface SectionOverview {
  sectionId: string;
  topicId: string;
  titleBg: string;
  conceptCount: number;
  /** Concepts with at least one recorded answer. */
  seenConceptCount: number;
  /** seenConceptCount / conceptCount (0 when the section has no concepts). */
  coverage: number;
  /** Unweighted average mastery over ALL section concepts, unseen = 0 (0..1). */
  avgMastery: number;
  /** Section concepts currently due for review. */
  dueCount: number;
  /** Distinct questions touching any of the section's concepts. */
  questionCount: number;
}

export function computeSectionOverview(
  progress: ProgressRow[],
  repo: ContentRepo,
  now: Date,
): SectionOverview[] {
  const byConcept = new Map(progress.map((p) => [p.conceptId, p]));
  const topics = [...repo.topics()].sort((a, b) => a.order - b.order);
  const sectionsByTopic = (topicId: string) =>
    repo.sectionsByTopic?.(topicId) ??
    (repo.sections?.() ?? []).filter((s) => s.topicId === topicId);

  // Group by parent topic (topic order), sections in content order within.
  return topics.flatMap((t) =>
    sectionsByTopic(t.id).map((section) => {
      let seen = 0;
      let due = 0;
      let masterySum = 0;
      const questionIds = new Set<string>();
      for (const conceptId of section.conceptIds) {
        for (const q of repo.questionsByConcept(conceptId)) questionIds.add(q.id);
        const row = byConcept.get(conceptId);
        if (!row) continue;
        seen += 1;
        masterySum += row.mastery;
        if (isDue({ reps: row.reps, dueAt: row.dueAt }, now)) due += 1;
      }
      const count = section.conceptIds.length;
      return {
        sectionId: section.id,
        topicId: section.topicId,
        titleBg: section.titleBg,
        conceptCount: count,
        seenConceptCount: seen,
        coverage: count === 0 ? 0 : seen / count,
        avgMastery: count === 0 ? 0 : masterySum / count,
        dueCount: due,
        questionCount: questionIds.size,
      };
    }),
  );
}

export async function getSectionOverview(
  userId: string,
  now: Date = new Date(),
): Promise<SectionOverview[]> {
  const progress = await getLearningStore().getProgress(userId);
  return computeSectionOverview(progress, getContentRepo(), now);
}
