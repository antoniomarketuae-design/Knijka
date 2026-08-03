import { beforeEach, describe, expect, it } from "vitest";
import { setContentRepo } from "@/lib/content/repo";
import { FakeLearningStore, makeFixtureRepo } from "./fixtures";
import {
  aggregateSimSignals,
  computeReadiness,
  computeSectionOverview,
  computeSimWeakSpots,
  computeTopicOverview,
  getReadiness,
  getSectionOverview,
  getSimWeakSpots,
  recencyFactor,
  SIM_BLEND_WEIGHT,
  SIM_EVIDENCE_WINDOW_DAYS,
} from "./readiness";
import {
  setLearningStore,
  toSimEvidenceRow,
  type ProgressRow,
  type SimEvidenceRow,
} from "./store";

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

// ---------------------------------------------------------------------------
// Sim blend (A14)
// ---------------------------------------------------------------------------

function evidence(
  conceptId: string,
  kind: "violation" | "commendation",
  severity: SimEvidenceRow["severity"] = null,
  finishedAt: Date = NOW,
): SimEvidenceRow {
  return { conceptId, kind, severity, finishedAt };
}

describe("aggregateSimSignals", () => {
  it("weighs violations by severity and commendations as one unit each", () => {
    const signals = aggregateSimSignals([
      evidence("c-road", "violation", "opasna"), // 3 negative units
      evidence("c-road", "commendation"), // 1 positive unit
      evidence("c-priority", "violation", "vtorostepenna"), // 1 negative
      evidence("c-priority", "commendation"),
    ]);
    expect(signals.get("c-road")!.signal).toBeCloseTo(1 / 4, 10);
    expect(signals.get("c-road")!.worstSeverity).toBe("opasna");
    expect(signals.get("c-priority")!.signal).toBeCloseTo(1 / 2, 10);
  });

  it("violation-free evidence yields signal 1, only-violations yields 0", () => {
    const signals = aggregateSimSignals([
      evidence("c-road", "commendation"),
      evidence("c-priority", "violation", "osnovna"),
    ]);
    expect(signals.get("c-road")!.signal).toBe(1);
    expect(signals.get("c-priority")!.signal).toBe(0);
  });
});

describe("computeReadiness — sim blend", () => {
  it("repeated violations lower a mastered concept's contribution", () => {
    // theory(c-road) = 1; sim signal 0 → blended = 1·0.75 = 0.75.
    const r = computeReadiness(
      [row("c-road", 1)],
      repo,
      NOW,
      [evidence("c-road", "violation", "opasna")],
    );
    expect(r.score).toBe(11); // round(100 · 0.75/7), was 14 without sim
    expect(r.perTopic).toEqual([
      { topicId: "t-basics", score: 25 }, // round(100 · 0.75/3)
      { topicId: "t-signs", score: 0 },
    ]);
  });

  it("violation-free driving raises an unseen concept's contribution", () => {
    // theory(c-priority) = 0; signal 1 → blended = 0.25 (weight 2 of 7).
    const r = computeReadiness([], repo, NOW, [
      evidence("c-priority", "commendation"),
    ]);
    expect(r.score).toBe(7); // round(100 · (2·0.25)/7)
  });

  it("leaves concepts without sim evidence untouched (theory dominant)", () => {
    const progress = [row("c-road", 1), row("c-warning", 0.6)];
    const withoutSim = computeReadiness(progress, repo, NOW);
    const withSim = computeReadiness(progress, repo, NOW, [
      evidence("c-priority", "violation", "opasna"),
    ]);
    // Only c-priority (theory 0, sim 0 → still 0) had evidence — no change.
    expect(withSim.score).toBe(withoutSim.score);
    // ...but a mastered concept WITH evidence does move:
    const moved = computeReadiness(progress, repo, NOW, [
      evidence("c-road", "violation", "opasna"),
    ]);
    expect(moved.score).toBeLessThan(withoutSim.score);
  });

  it("blend is bounded by SIM_BLEND_WEIGHT — sim can never dominate", () => {
    expect(SIM_BLEND_WEIGHT).toBeLessThanOrEqual(0.25);
    // Even catastrophic sim evidence keeps 75% of the theory mastery.
    const r = computeReadiness(
      [row("c-road", 1)],
      repo,
      NOW,
      Array.from({ length: 20 }, () => evidence("c-road", "violation", "opasna")),
    );
    expect(r.weakestConcepts.find((c) => c.conceptId === "c-road")!
      .effectiveMastery).toBeCloseTo(1 - SIM_BLEND_WEIGHT, 10);
  });

  it("sim evidence reorders weakestConcepts honestly", () => {
    const progress = [
      row("c-road", 0.5),
      row("c-priority", 0.55),
      row("c-warning", 0.6),
      row("c-sign-priority", 0.65),
    ];
    // c-sign-priority (best on theory) collapses under опасна sim evidence:
    // 0.65·0.75 + 0·0.25 = 0.4875 — now the weakest of the four.
    const r = computeReadiness(progress, repo, NOW, [
      evidence("c-sign-priority", "violation", "opasna"),
    ]);
    expect(r.weakestConcepts[0].conceptId).toBe("c-sign-priority");
  });

  it("getReadiness feeds windowed store evidence into the blend", async () => {
    const store = new FakeLearningStore();
    store.seedProgress("u1", { conceptId: "c-road", mastery: 1, updatedAt: NOW });
    store.seedSimEvidence("u1", [
      evidence("c-road", "violation", "opasna", NOW),
      // Outside the 14-day window — must be ignored.
      evidence(
        "c-road",
        "violation",
        "opasna",
        daysAgo(SIM_EVIDENCE_WINDOW_DAYS + 1),
      ),
    ]);
    setLearningStore(store);

    const r = await getReadiness("u1", NOW);
    expect(r.score).toBe(11); // one in-window violation → 0.75 · 1/7
  });
});

describe("sim weak spots", () => {
  it("ranks violated concepts worst-first and skips clean/unknown ones", () => {
    const result = computeSimWeakSpots(
      [
        evidence("c-road", "violation", "vtorostepenna"),
        evidence("c-road", "commendation"), // signal 0.5
        evidence("c-priority", "violation", "opasna"), // signal 0
        evidence("c-warning", "commendation"), // clean — never a weak spot
        evidence("c-gone", "violation", "opasna"), // stale content id — skipped
      ],
      repo,
      3,
    );
    expect(result.hasRecentEvidence).toBe(true);
    expect(result.spots.map((s) => s.conceptId)).toEqual([
      "c-priority",
      "c-road",
    ]);
    expect(result.spots[0].worstSeverity).toBe("opasna");
    expect(result.spots[0].topicSlug).toBe("basics");
    expect(result.spots[1].violationCount).toBe(1);
  });

  it("respects the limit and reports evidence presence separately", () => {
    const rows = [
      evidence("c-road", "violation", "osnovna"),
      evidence("c-priority", "violation", "opasna"),
      evidence("c-warning", "violation", "vtorostepenna"),
      evidence("c-sign-priority", "violation", "opasna"),
    ];
    const result = computeSimWeakSpots(rows, repo, 3);
    expect(result.spots).toHaveLength(3);

    const clean = computeSimWeakSpots([evidence("c-road", "commendation")], repo, 3);
    expect(clean.hasRecentEvidence).toBe(true);
    expect(clean.spots).toEqual([]);

    const none = computeSimWeakSpots([], repo, 3);
    expect(none.hasRecentEvidence).toBe(false);
  });

  it("getSimWeakSpots wires the windowed store read through", async () => {
    const store = new FakeLearningStore();
    store.seedSimEvidence("u1", [
      evidence("c-priority", "violation", "opasna", NOW),
      evidence(
        "c-road",
        "violation",
        "opasna",
        daysAgo(SIM_EVIDENCE_WINDOW_DAYS + 1), // stale — ignored
      ),
    ]);
    setLearningStore(store);

    const result = await getSimWeakSpots("u1", 3, NOW);
    expect(result.spots.map((s) => s.conceptId)).toEqual(["c-priority"]);
  });
});

describe("toSimEvidenceRow", () => {
  const finishedAt = NOW;

  it("recognises the two kinds of concept-linked rule event", () => {
    expect(
      toSimEvidenceRow("c-traffic-light-signals", "violation", "opasna", finishedAt),
    ).toEqual({
      conceptId: "c-traffic-light-signals",
      kind: "violation",
      severity: "opasna",
      finishedAt,
    });
    // A commendation carries no severity, and must not inherit one.
    expect(
      toSimEvidenceRow("c-lane-change", "commendation", "opasna", finishedAt),
    ).toEqual({
      conceptId: "c-lane-change",
      kind: "commendation",
      severity: null,
      finishedAt,
    });
  });

  it("never trusts the Json another module wrote", () => {
    // Every one of these arrives as SQL NULL out of the projection when the
    // stored element is not the object shape we expect.
    expect(toSimEvidenceRow(null, "violation", "opasna", finishedAt)).toBeNull();
    expect(toSimEvidenceRow("", "violation", "opasna", finishedAt)).toBeNull();
    // Not evidence: a rule event with no concept link teaches nothing.
    expect(toSimEvidenceRow(undefined, "violation", "opasna", finishedAt)).toBeNull();
    // An unknown kind, and — the one that would actually hurt — a severity
    // that is not a member of the official three. SIM_SEVERITY_UNITS is
    // indexed with it, so letting it through would weigh a violation
    // `undefined` and poison the whole blend with NaN.
    expect(toSimEvidenceRow("c-road", "weird", null, finishedAt)).toBeNull();
    expect(toSimEvidenceRow("c-road", "violation", "made-up", finishedAt)).toBeNull();
    expect(toSimEvidenceRow("c-road", "violation", null, finishedAt)).toBeNull();
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

describe("computeSectionOverview", () => {
  it("lists sections in topic order, with question counts, zeroed for a fresh user", () => {
    const overview = computeSectionOverview([], repo, NOW);
    expect(overview.map((s) => s.sectionId)).toEqual([
      "s-basics-road",
      "s-basics-priority",
      "s-signs-all",
    ]);
    // Distinct questions touching each section's concepts (see fixtures.ts):
    // c-road → q-road-1/2 (2); c-priority → q-prio-1/2 + q-sprio-1 (3);
    // c-warning → q-warn-1/2 and c-sign-priority → q-sprio-1 (distinct 3).
    expect(overview.map((s) => s.questionCount)).toEqual([2, 3, 3]);
    for (const s of overview) {
      expect(s.seenConceptCount).toBe(0);
      expect(s.coverage).toBe(0);
      expect(s.avgMastery).toBe(0);
      expect(s.dueCount).toBe(0);
    }
    expect(overview.find((s) => s.sectionId === "s-signs-all")?.conceptCount).toBe(2);
  });

  it("aggregates its concepts' mastery and due state", () => {
    const progress = [
      row("c-road", 0.8, { dueAt: daysAgo(0.1) }), // due
      row("c-priority", 0.4, { dueAt: new Date(NOW.getTime() + DAY_MS) }),
    ];
    const [road, priority, signs] = computeSectionOverview(progress, repo, NOW);

    expect(road.avgMastery).toBeCloseTo(0.8, 10);
    expect(road.dueCount).toBe(1);
    expect(road.coverage).toBe(1);

    expect(priority.avgMastery).toBeCloseTo(0.4, 10);
    expect(priority.dueCount).toBe(0);

    expect(signs.seenConceptCount).toBe(0);
    expect(signs.avgMastery).toBe(0);
  });

  it("getSectionOverview wires store rows through to the pure computation", async () => {
    const store = new FakeLearningStore();
    store.seedProgress("u1", { conceptId: "c-road", mastery: 1, updatedAt: NOW });
    setLearningStore(store);

    const overview = await getSectionOverview("u1", NOW);
    const road = overview.find((s) => s.sectionId === "s-basics-road");
    expect(road?.avgMastery).toBe(1);
    expect(road?.seenConceptCount).toBe(1);
  });
});
