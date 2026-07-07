import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import {
  computeReadiness,
  computeTopicOverview,
  getReadiness,
  recencyFactor,
} from "./readiness";
import { setLearningStore, type ProgressRow } from "./store";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

// Fixture difficulty weights: c-road 1, c-priority 2, c-warning 1,
// c-sign-priority 3 → total weight 7.
const repo = makeFixtureRepo();

function row(
  conceptId: string,
  mastery: number,
  overrides: Partial<ProgressRow> = {},
): ProgressRow {
  return {
    conceptId,
    mastery,
    reps: 1,
    lapses: 0,
    dueAt: null,
    updatedAt: NOW,
    ...overrides,
  };
}

beforeEach(() => {
  setContentRepo(makeFixtureRepo());
});

describe("recencyFactor", () => {
  it("gives full credit for 7 days, then decays linearly to 0.5 at 30 days", () => {
    expect(recencyFactor(0)).toBe(1);
    expect(recencyFactor(7)).toBe(1);
    expect(recencyFactor(18.5)).toBeCloseTo(0.75, 10); // midpoint
    expect(recencyFactor(30)).toBe(0.5);
    expect(recencyFactor(365)).toBe(0.5); // floor
  });
});

describe("computeReadiness", () => {
  it("no data → score 0, zero per-topic scores, all concepts weakest", () => {
    const r = computeReadiness([], repo, NOW);
    expect(r.score).toBe(0);
    expect(r.perTopic).toEqual([
      { topicId: "t-basics", score: 0 },
      { topicId: "t-signs", score: 0 },
    ]);
    // Fewer than 5 concepts exist → all 4 returned, in topic order.
    expect(r.weakestConcepts.map((c) => c.conceptId)).toEqual([
      "c-road",
      "c-priority",
      "c-warning",
      "c-sign-priority",
    ]);
    expect(r.weakestConcepts.every((c) => c.effectiveMastery === 0)).toBe(true);
  });

  it("full fresh mastery everywhere → 100", () => {
    const progress = [
      row("c-road", 1),
      row("c-priority", 1),
      row("c-warning", 1),
      row("c-sign-priority", 1),
    ];
    const r = computeReadiness(progress, repo, NOW);
    expect(r.score).toBe(100);
    expect(r.perTopic).toEqual([
      { topicId: "t-basics", score: 100 },
      { topicId: "t-signs", score: 100 },
    ]);
  });

  it("unseen concepts drag the score down (coverage penalty)", () => {
    // Only c-road (weight 1 of 7) mastered.
    const r = computeReadiness([row("c-road", 1)], repo, NOW);
    expect(r.score).toBe(14); // round(100 * 1/7)
    expect(r.perTopic).toEqual([
      { topicId: "t-basics", score: 33 }, // round(100 * 1/3)
      { topicId: "t-signs", score: 0 },
    ]);
  });

  it("weights concepts by difficulty", () => {
    // c-sign-priority carries weight 3 of 7 — worth 3x c-road.
    const hard = computeReadiness([row("c-sign-priority", 1)], repo, NOW);
    expect(hard.score).toBe(43); // round(100 * 3/7)
    const easy = computeReadiness([row("c-road", 1)], repo, NOW);
    expect(easy.score).toBe(14);
  });

  it("stale mastery counts less (recency factor)", () => {
    const fresh = computeReadiness(
      [row("c-road", 1, { updatedAt: daysAgo(7) })],
      repo,
      NOW,
    );
    expect(fresh.score).toBe(14);

    const stale = computeReadiness(
      [row("c-road", 1, { updatedAt: daysAgo(40) })],
      repo,
      NOW,
    );
    expect(stale.score).toBe(7); // round(100 * 0.5/7)
  });

  it("weakest concepts are the lowest effective-mastery ones, weakest first", () => {
    const progress = [
      row("c-road", 0.9),
      row("c-priority", 0.3),
      row("c-warning", 0.6, { updatedAt: daysAgo(40) }), // effective 0.3 too
      // c-sign-priority unseen → 0
    ];
    const r = computeReadiness(progress, repo, NOW);
    expect(r.weakestConcepts.map((c) => c.conceptId)).toEqual([
      "c-sign-priority", // 0
      "c-priority", // 0.3 (topic order breaks the tie with c-warning)
      "c-warning", // 0.6 * 0.5 = 0.3
      "c-road", // 0.9
    ]);
    expect(r.weakestConcepts[0].effectiveMastery).toBe(0);
    expect(r.weakestConcepts[2].effectiveMastery).toBeCloseTo(0.3, 10);
  });

  it("getReadiness wires store rows through to the pure computation", async () => {
    const store = new FakeLearningStore();
    store.seedProgress("u1", { conceptId: "c-road", mastery: 1, updatedAt: NOW });
    setLearningStore(store);

    const r = await getReadiness("u1", NOW);
    expect(r.score).toBe(14);
  });
});

describe("computeTopicOverview", () => {
  it("returns zeroed rows per topic for a fresh user, in topic order", () => {
    const overview = computeTopicOverview([], repo, NOW);
    expect(overview.map((t) => t.topicId)).toEqual(["t-basics", "t-signs"]);
    for (const t of overview) {
      expect(t.conceptCount).toBe(2);
      expect(t.seenConceptCount).toBe(0);
      expect(t.coverage).toBe(0);
      expect(t.avgMastery).toBe(0);
      expect(t.dueCount).toBe(0);
    }
  });

  it("aggregates coverage, average mastery and due counts per topic", () => {
    const progress = [
      row("c-road", 0.8, { dueAt: daysAgo(0.1) }), // due
      row("c-priority", 0.4, { dueAt: new Date(NOW.getTime() + DAY_MS) }),
    ];
    const [basics, signs] = computeTopicOverview(progress, repo, NOW);

    expect(basics.seenConceptCount).toBe(2);
    expect(basics.coverage).toBe(1);
    expect(basics.avgMastery).toBeCloseTo(0.6, 10);
    expect(basics.dueCount).toBe(1);

    expect(signs.seenConceptCount).toBe(0);
    expect(signs.avgMastery).toBe(0);
  });
});
