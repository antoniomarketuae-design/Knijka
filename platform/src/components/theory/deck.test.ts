import { describe, expect, it } from "vitest";
import type { TopicOverview } from "@/modules/learning";
import {
  MASTERED_AT,
  deckReadiness,
  lensCounts,
  matchesLens,
  pickFocus,
  topicState,
} from "./deck";

function topic(over: Partial<TopicOverview> & { order: number }): TopicOverview {
  return {
    topicId: `t-${over.order}`,
    slug: `topic-${over.order}`,
    titleBg: `Тема ${over.order}`,
    conceptCount: 10,
    seenConceptCount: 0,
    coverage: 0,
    avgMastery: 0,
    dueCount: 0,
    ...over,
  };
}

describe("topicState", () => {
  it("calls a topic started as soon as one concept was answered, even at 0%", () => {
    // The bug components/ui/mastery.ts was written to fix, one level up: a
    // student who opens a topic and scores nothing has still started it, and
    // the tile must not say „Нова" back at them.
    expect(topicState(topic({ order: 1, seenConceptCount: 3, avgMastery: 0 }))).toBe(
      "progress",
    );
  });

  it("is fresh only when nothing has been answered", () => {
    expect(topicState(topic({ order: 1 }))).toBe("fresh");
  });

  it("turns mastered at exactly the threshold the bar turns green at", () => {
    // If these two numbers ever drift, a tile shows a green ring above a chip
    // that says „в процес".
    expect(
      topicState(topic({ order: 1, seenConceptCount: 10, avgMastery: MASTERED_AT })),
    ).toBe("mastered");
    expect(
      topicState(
        topic({ order: 1, seenConceptCount: 10, avgMastery: MASTERED_AT - 0.01 }),
      ),
    ).toBe("progress");
  });
});

describe("lenses", () => {
  const topics = [
    topic({ order: 1, seenConceptCount: 10, avgMastery: 0.9 }),
    topic({ order: 2, seenConceptCount: 6, avgMastery: 0.4, dueCount: 3 }),
    topic({ order: 3 }),
    topic({ order: 4, seenConceptCount: 10, avgMastery: 0.8, dueCount: 2 }),
  ];

  it("counts every topic under the all-lens and each state exactly once", () => {
    expect(lensCounts(topics)).toEqual({
      all: 4,
      due: 2,
      progress: 1,
      fresh: 1,
      mastered: 2,
    });
  });

  it("the due lens cuts across the states rather than being one of them", () => {
    // Topic 4 is mastered AND due. It has to appear under both lenses —
    // mastery decays, and hiding a due topic because it is currently strong is
    // how a student loses it.
    expect(matchesLens(topics[3], "due")).toBe(true);
    expect(matchesLens(topics[3], "mastered")).toBe(true);
  });
});

describe("deckReadiness", () => {
  it("weights mastery by concept count, not by topic", () => {
    // 1 concept at 100% and 9 at 0% is 10%, not 50%. Averaging the per-topic
    // averages would let a two-concept topic move the headline gauge as much
    // as a fourteen-concept one.
    const readiness = deckReadiness([
      topic({ order: 1, conceptCount: 1, seenConceptCount: 1, avgMastery: 1 }),
      topic({ order: 2, conceptCount: 9, seenConceptCount: 0, avgMastery: 0 }),
    ]);
    expect(readiness.avgMastery).toBeCloseTo(0.1, 5);
    expect(readiness.conceptCount).toBe(10);
    expect(readiness.seenConceptCount).toBe(1);
  });

  it("is zero, not NaN, for an empty curriculum", () => {
    expect(deckReadiness([]).avgMastery).toBe(0);
  });
});

describe("pickFocus", () => {
  it("puts due review ahead of a weaker topic that is not due", () => {
    // Spaced repetition's contract: due work decays if skipped, unfinished
    // work merely stays unfinished.
    const focus = pickFocus([
      topic({ order: 1, seenConceptCount: 10, avgMastery: 0.05 }),
      topic({ order: 2, seenConceptCount: 10, avgMastery: 0.7, dueCount: 4 }),
    ]);
    expect(focus.kind).toBe("due");
    expect(focus.topic?.order).toBe(2);
  });

  it("falls back to the weakest STARTED topic when nothing is due", () => {
    const focus = pickFocus([
      topic({ order: 1, seenConceptCount: 10, avgMastery: 0.6 }),
      topic({ order: 2, seenConceptCount: 4, avgMastery: 0.2 }),
      topic({ order: 3 }),
    ]);
    expect(focus.kind).toBe("weakest");
    expect(focus.topic?.order).toBe(2);
  });

  it("opens new ground only once every started topic is strong", () => {
    const focus = pickFocus([
      topic({ order: 1, seenConceptCount: 10, avgMastery: 0.9 }),
      topic({ order: 2 }),
      topic({ order: 3 }),
    ]);
    expect(focus.kind).toBe("next");
    expect(focus.topic?.order).toBe(2);
  });

  it("has a real answer when everything is mastered", () => {
    const focus = pickFocus([
      topic({ order: 1, seenConceptCount: 10, avgMastery: 0.9 }),
      topic({ order: 2, seenConceptCount: 10, avgMastery: 0.8 }),
    ]);
    expect(focus.kind).toBe("held");
    expect(focus.topic).toBeNull();
    expect(focus.reason.length).toBeGreaterThan(20);
  });

  it("breaks ties on syllabus order so the recommendation does not wander", () => {
    // Same due count, same mastery: reloading the page must not hand the
    // student a different „start here" each time.
    const topics = [
      topic({ order: 7, seenConceptCount: 5, avgMastery: 0.4, dueCount: 2 }),
      topic({ order: 3, seenConceptCount: 5, avgMastery: 0.4, dueCount: 2 }),
    ];
    expect(pickFocus(topics).topic?.order).toBe(3);
    expect(pickFocus([...topics].reverse()).topic?.order).toBe(3);
  });

  it("never returns a bare instruction — THEO-4 applies to navigation too", () => {
    // Every branch has to justify itself in words, and every justification has
    // to name the topic it is talking about.
    const cases: TopicOverview[][] = [
      [topic({ order: 1, seenConceptCount: 3, avgMastery: 0.3, dueCount: 2 })],
      [topic({ order: 1, seenConceptCount: 3, avgMastery: 0.3 })],
      [topic({ order: 1 })],
    ];
    for (const topics of cases) {
      const focus = pickFocus(topics);
      expect(focus.reason.length).toBeGreaterThan(30);
      expect(focus.reason).toContain(topics[0].titleBg);
    }
  });

  it("agrees the verb with a single concept (Bulgarian has no -s to lean on)", () => {
    const focus = pickFocus([
      topic({ order: 1, seenConceptCount: 3, avgMastery: 0.3, dueCount: 1 }),
    ]);
    expect(focus.reason).toContain("1 понятие ");
    expect(focus.reason).not.toContain("1 понятия");
  });
});
