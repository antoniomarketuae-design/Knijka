/**
 * The unforgeability suite.
 *
 * Every test below corresponds to one numbered property in the attempts.ts
 * header. They are written as attacks rather than as happy paths on purpose:
 * this module exists because a hazard score is EVIDENCE, and evidence is only
 * worth what the worst-behaved client cannot do to it.
 *
 * NOTE THE VIRTUAL CLOCK. `play()` below advances a fake wall clock past the
 * length of the clip before every submission, and it has to: a run submitted in
 * zero milliseconds claims to have watched twelve seconds of video in no time
 * at all, and property 4 refuses it. That the ordinary helper needs a clock is
 * the most convincing evidence in the file that the check is real.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { HazardItemCard } from "@/components/hazard/types";
import {
  CLOCK_SLACK_SEC,
  HAZARD_RUN_LENGTH,
  MAX_PRESSES_PER_ITEM,
  HazardPlayError,
  InMemoryHazardRunStore,
  getHazardRunSummary,
  hasHazardEngine,
  listHazardRuns,
  setHazardEngine,
  setHazardRunStore,
  startHazardRun,
  submitHazardReaction,
  type HazardDealRequest,
  type HazardDealtItem,
  type HazardEngine,
  type HazardJudgeRequest,
  type HazardJudgement,
  type SubmittedReaction,
} from "../index";

const USER = "user-1";
const OTHER_USER = "user-2";
const CLIP_SEC = 12;

// ---------------------------------------------------------------------------
// A fake item engine — the registration seam exists precisely so this is easy
// ---------------------------------------------------------------------------

function card(id: string): Omit<HazardItemCard, "index" | "total"> {
  return {
    itemId: id,
    clipSrc: `/clips/${id}.webm`,
    posterSrc: null,
    durationSec: CLIP_SEC,
    titleBg: `Клип ${id}`,
    briefBg: "Караш по булеварда, 50 км/ч.",
  };
}

interface FakeEngineOptions {
  poolSize?: number;
  judge?: (request: HazardJudgeRequest) => HazardJudgement;
}

/** The fake records what it was asked, which is most of what is under test. */
class FakeEngine implements HazardEngine {
  readonly version = "fake-1";
  readonly judgeCalls: HazardJudgeRequest[] = [];
  dealCalls = 0;

  constructor(private readonly options: FakeEngineOptions = {}) {}

  async deal(request: HazardDealRequest): Promise<HazardDealtItem[]> {
    this.dealCalls += 1;
    const n = Math.min(request.length, this.options.poolSize ?? 25);
    return Array.from({ length: n }, (_, i) => ({
      itemId: `hz-${i + 1}`,
      card: card(`hz-${i + 1}`),
    }));
  }

  async judge(request: HazardJudgeRequest): Promise<HazardJudgement> {
    this.judgeCalls.push(request);
    if (this.options.judge) return this.options.judge(request);
    const first = request.pressesMediaSec[0] ?? null;
    return {
      verdict: first === null ? "missed" : "good",
      points: first === null ? 0 : 3,
      maxPoints: 5,
      reactionAtSec: first,
      windowStartSec: 4,
      windowEndSec: 9,
      hazardAtSec: 11,
      hazardBg: "Дете зад паркиран бус.",
      developingBg: "Топка излиза на платното преди детето.",
      correctiveBg: "Сваляш скоростта още при буса.",
      lawRefs: [{ act: "ЗДвП", ref: "чл. 20" }],
    };
  }
}

function fakeEngine(options: FakeEngineOptions = {}): FakeEngine {
  return new FakeEngine(options);
}

// ---------------------------------------------------------------------------
// The virtual clock
// ---------------------------------------------------------------------------

const T0 = new Date("2026-07-27T10:00:00.000Z");
let clock = T0;

/** Advance far enough that watching the whole clip was physically possible. */
function afterOneClip(): Date {
  clock = new Date(clock.getTime() + (CLIP_SEC + 1) * 1000);
  return clock;
}

/** Start a run on the virtual clock. */
function open(door: "section" | "simulator" | "theory") {
  return startHazardRun(USER, door, { now: clock });
}

/** Submit one reaction, honestly timed. */
function play(
  runId: string,
  itemId: string,
  pressesMediaSec: number[] = [5],
): Promise<SubmittedReaction> {
  return submitHazardReaction(USER, {
    runId,
    itemId,
    pressesMediaSec,
    watchedToSec: CLIP_SEC,
    now: afterOneClip(),
  });
}

/** Drive a run to completion from `itemId`, returning its summary. */
async function runToEnd(runId: string, itemId: string | null, presses: number[] = [5]) {
  let current = itemId;
  let summary: SubmittedReaction["summary"] = null;
  while (current !== null) {
    const result = await play(runId, current, presses);
    current = result.next === null ? null : result.next.itemId;
    summary = result.summary;
  }
  return summary;
}

beforeEach(() => {
  clock = T0;
  setHazardRunStore(new InMemoryHazardRunStore());
  setHazardEngine(fakeEngine());
});

afterEach(() => {
  setHazardEngine(null);
  setHazardRunStore(null);
});

// ---------------------------------------------------------------------------

describe("the engine seam", () => {
  it("reports no engine before one is registered, and refuses rather than inventing one", async () => {
    setHazardEngine(null);
    expect(hasHazardEngine()).toBe(false);
    await expect(open("section")).rejects.toMatchObject({ code: "ENGINE_UNAVAILABLE" });
  });

  it("deals exactly once per run — a resumed run is never re-dealt", async () => {
    const engine = fakeEngine();
    setHazardEngine(engine);

    const run = await open("section");
    await play(run.runId, run.item.itemId);

    // A second deal is how the exam grew audit H-7: the student ends up graded
    // against a paper other than the one they were served.
    expect(engine.dealCalls).toBe(1);
  });

  it("refuses NO_ITEMS when the bank is empty rather than opening an empty run", async () => {
    setHazardEngine(fakeEngine({ poolSize: 0 }));
    await expect(open("section")).rejects.toMatchObject({ code: "NO_ITEMS" });
  });
});

describe("doors change size and admission, never logic", () => {
  it("deals the door's own run length", async () => {
    const section = await open("section");
    expect(section.item.total).toBe(HAZARD_RUN_LENGTH.section);

    const sim = await open("simulator");
    expect(sim.item.total).toBe(HAZARD_RUN_LENGTH.simulator);
  });

  it("sends an identical judge request shape for every door", async () => {
    const engine = fakeEngine();
    setHazardEngine(engine);

    for (const door of ["section", "simulator", "theory"] as const) {
      const run = await open(door);
      await play(run.runId, run.item.itemId, [5.5]);
    }

    expect(engine.judgeCalls).toHaveLength(3);
    for (const call of engine.judgeCalls) {
      expect(call.pressesMediaSec).toEqual([5.5]);
      expect(call.watchedToSec).toBe(CLIP_SEC);
    }
  });
});

describe("property 1 — the window never leaves the server before the answer", () => {
  it("serves a card with no window, fault time or hazard text on it", async () => {
    const run = await open("section");
    const serialized = JSON.stringify(run.item);

    for (const leak of [
      "windowStartSec",
      "windowEndSec",
      "hazardAtSec",
      "hazardBg",
      "developingBg",
      "correctiveBg",
      "lawRefs",
      "points",
      "verdict",
    ]) {
      expect(serialized).not.toContain(leak);
    }
    expect(Object.keys(run.item).sort()).toEqual(
      [
        "briefBg",
        "clipSrc",
        "durationSec",
        "index",
        "itemId",
        "posterSrc",
        "titleBg",
        "total",
      ].sort(),
    );
  });

  it("reveals the window only inside the judged response", async () => {
    const run = await open("section");
    const result = await play(run.runId, run.item.itemId);
    expect(result.feedback.windowStartSec).toBe(4);
    expect(result.feedback.hazardAtSec).toBe(11);
  });
});

describe("property 2 — the client never sends a score", () => {
  it("ignores anything score-shaped smuggled into the payload", async () => {
    const run = await open("section");
    const result = await submitHazardReaction(USER, {
      runId: run.runId,
      itemId: run.item.itemId,
      pressesMediaSec: [5],
      watchedToSec: CLIP_SEC,
      now: afterOneClip(),
      // A hostile client adds fields. There is nowhere for them to land.
      ...({ points: 999, verdict: "excellent", maxPoints: 999 } as object),
    });
    expect(result.feedback.points).toBe(3);
    expect(result.feedback.verdict).toBe("good");
  });

  it("clamps an engine that returns points above its own maximum", async () => {
    setHazardEngine(
      fakeEngine({
        judge: () => ({
          verdict: "excellent",
          points: 50,
          maxPoints: 5,
          reactionAtSec: 5,
          windowStartSec: 4,
          windowEndSec: 9,
          hazardAtSec: 11,
          hazardBg: "x",
          developingBg: "x",
          correctiveBg: "x",
          lawRefs: [],
        }),
      }),
    );
    const run = await open("section");
    const result = await play(run.runId, run.item.itemId);
    expect(result.feedback.points).toBe(5);
    expect(result.progress.points).toBe(5);
  });

  it("treats a non-finite engine number as zero rather than recording NaN", async () => {
    setHazardEngine(
      fakeEngine({
        judge: () => ({
          verdict: "missed",
          points: Number.NaN,
          maxPoints: Number.NaN,
          reactionAtSec: null,
          windowStartSec: 4,
          windowEndSec: 9,
          hazardAtSec: 11,
          hazardBg: "x",
          developingBg: "x",
          correctiveBg: "x",
          lawRefs: [],
        }),
      }),
    );
    const run = await open("section");
    const result = await play(run.runId, run.item.itemId, []);
    expect(result.feedback.points).toBe(0);
    expect(result.feedback.maxPoints).toBe(0);
  });
});

describe("property 3 — one shot per item, in order", () => {
  it("refuses a second submission for the same item", async () => {
    const run = await open("section");
    await play(run.runId, run.item.itemId);

    // The whole attack: read the reveal, learn the window, replay the press.
    await expect(play(run.runId, run.item.itemId, [4.1])).rejects.toMatchObject({
      code: "OUT_OF_ORDER",
    });
  });

  it("refuses an item that is not the one under the cursor", async () => {
    const run = await open("section");
    await expect(play(run.runId, "hz-4")).rejects.toMatchObject({ code: "OUT_OF_ORDER" });
  });

  it("answers RUN_NOT_FOUND identically for an unknown run and someone else's run", async () => {
    const run = await open("section");

    const unknown = await submitHazardReaction(OTHER_USER, {
      runId: "does-not-exist",
      itemId: "hz-1",
      pressesMediaSec: [],
      watchedToSec: 0,
      now: afterOneClip(),
    }).catch((e: unknown) => e);
    const someoneElses = await submitHazardReaction(OTHER_USER, {
      runId: run.runId,
      itemId: run.item.itemId,
      pressesMediaSec: [],
      watchedToSec: 0,
      now: afterOneClip(),
    }).catch((e: unknown) => e);

    // Identical answers, or this endpoint becomes a probe for other students'
    // run ids (the same rule getExamReview and withdrawOutcome follow).
    expect((unknown as HazardPlayError).code).toBe("RUN_NOT_FOUND");
    expect((someoneElses as HazardPlayError).code).toBe("RUN_NOT_FOUND");
  });

  it("closes the run after the last item and refuses everything after", async () => {
    const run = await open("simulator");
    const summary = await runToEnd(run.runId, run.item.itemId);

    expect(summary).not.toBeNull();
    expect(summary?.items).toHaveLength(HAZARD_RUN_LENGTH.simulator);
    await expect(play(run.runId, "hz-1")).rejects.toMatchObject({ code: "RUN_NOT_FOUND" });
  });
});

describe("property 4 — the press must be physically possible", () => {
  it("refuses media time that has run ahead of the wall clock", async () => {
    const run = await open("section");

    // Half a second later, claiming to have watched twelve seconds of video.
    await expect(
      submitHazardReaction(USER, {
        runId: run.runId,
        itemId: run.item.itemId,
        pressesMediaSec: [11.9],
        watchedToSec: CLIP_SEC,
        now: new Date(clock.getTime() + 500),
      }),
    ).rejects.toMatchObject({ code: "IMPLAUSIBLE" });
  });

  it("never penalises media time that LAGS the wall clock — the stutter case", async () => {
    const run = await open("section");

    // Five minutes of wall clock for a twelve-second clip: buffering, a phone
    // call, a locked screen. All fine — media time simply did not move.
    const result = await submitHazardReaction(USER, {
      runId: run.runId,
      itemId: run.item.itemId,
      pressesMediaSec: [5],
      watchedToSec: CLIP_SEC,
      now: new Date(clock.getTime() + 300_000),
    });
    expect(result.feedback.points).toBe(3);
  });

  it("allows an honest run home inside the clock slack", async () => {
    const run = await open("section");
    const result = await submitHazardReaction(USER, {
      runId: run.runId,
      itemId: run.item.itemId,
      pressesMediaSec: [CLIP_SEC - 0.1],
      watchedToSec: CLIP_SEC,
      // The clip minus the slack: the round trip is covered, nothing else is.
      now: new Date(clock.getTime() + (CLIP_SEC - CLOCK_SLACK_SEC + 0.5) * 1000),
    });
    expect(result.feedback.reactionAtSec).toBeCloseTo(CLIP_SEC - 0.1, 5);
  });

  it("times the SECOND item from when the second item was served, not from the run", async () => {
    const run = await open("simulator");
    const first = await play(run.runId, run.item.itemId);
    const next = first.next;
    expect(next).not.toBeNull();

    // The clock has already advanced 13 s for the first clip. If the check
    // measured from the RUN start, that slack would carry over and an instant
    // second submission would pass. It must not.
    await expect(
      submitHazardReaction(USER, {
        runId: run.runId,
        itemId: (next as HazardItemCard).itemId,
        pressesMediaSec: [11.5],
        watchedToSec: CLIP_SEC,
        now: new Date(clock.getTime() + 100),
      }),
    ).rejects.toMatchObject({ code: "IMPLAUSIBLE" });
  });
});

describe("press sanitising", () => {
  it("clamps into the clip, sorts, de-duplicates and caps", async () => {
    const engine = fakeEngine();
    setHazardEngine(engine);
    const run = await open("section");

    await play(run.runId, run.item.itemId, [
      // out of order, negative, past the end, a synthesised double-fire, and a
      // garbage value the wire could carry
      7.5, -3, 999, 2.0, 2.0005, Number.NaN as number,
    ]);

    expect(engine.judgeCalls[0].pressesMediaSec).toEqual([0, 2.0, 7.5, CLIP_SEC]);
  });

  it("caps a clicking pattern but still forwards enough of it to be voided", async () => {
    const engine = fakeEngine();
    setHazardEngine(engine);
    const run = await open("section");

    await play(
      run.runId,
      run.item.itemId,
      Array.from({ length: 200 }, (_, i) => i * 0.05),
    );

    const forwarded = engine.judgeCalls[0].pressesMediaSec;
    expect(forwarded).toHaveLength(MAX_PRESSES_PER_ITEM);
    // The engine still receives an unmistakable pattern rather than a trimmed
    // list that looks like a reasonable set of reactions.
    expect(forwarded[forwarded.length - 1] - forwarded[0]).toBeLessThan(2);
  });

  it("clamps watchedToSec into the clip", async () => {
    const engine = fakeEngine();
    setHazardEngine(engine);
    const run = await open("section");

    await submitHazardReaction(USER, {
      runId: run.runId,
      itemId: run.item.itemId,
      pressesMediaSec: [],
      watchedToSec: 10_000,
      now: afterOneClip(),
    });
    expect(engine.judgeCalls[0].watchedToSec).toBe(CLIP_SEC);
  });
});

describe("the summary — what the safety claim is eventually argued from", () => {
  it("reports lead time as hazard minus reaction, per item", async () => {
    const run = await open("simulator");
    const first = await play(run.runId, run.item.itemId);
    expect(first.progress.answered).toBe(1);

    const summary = await runToEnd(run.runId, first.next?.itemId ?? null);
    // hazardAtSec 11, reaction 5 → six seconds of warning.
    expect(summary?.items[0].leadSec).toBe(6);
    expect(summary?.medianLeadSec).toBe(6);
  });

  it("records no lead for an item where nothing counted", async () => {
    setHazardEngine(
      fakeEngine({
        judge: () => ({
          verdict: "missed",
          points: 0,
          maxPoints: 5,
          reactionAtSec: null,
          windowStartSec: 4,
          windowEndSec: 9,
          hazardAtSec: 11,
          hazardBg: "x",
          developingBg: "x",
          correctiveBg: "x",
          lawRefs: [],
        }),
      }),
    );
    const run = await open("simulator");
    const summary = await runToEnd(run.runId, run.item.itemId, []);
    expect(summary?.items.every((i) => i.leadSec === null)).toBe(true);
    expect(summary?.medianLeadSec).toBeNull();
    expect(summary?.missed).toBe(HAZARD_RUN_LENGTH.simulator);
  });

  it("re-opens a finished run's summary for its owner only", async () => {
    const run = await open("simulator");
    await runToEnd(run.runId, run.item.itemId);

    expect(await getHazardRunSummary(USER, run.runId)).not.toBeNull();
    expect(await getHazardRunSummary(OTHER_USER, run.runId)).toBeNull();
  });

  it("lists finished runs for the history strip, with a timestamp", async () => {
    const run = await open("simulator");
    await runToEnd(run.runId, run.item.itemId);

    const history = await listHazardRuns(USER, 10);
    expect(history).toHaveLength(1);
    expect(history[0].finishedAtIso).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(await listHazardRuns(OTHER_USER, 10)).toHaveLength(0);
  });

  it("does not list a run that is still in progress", async () => {
    await open("section");
    expect(await listHazardRuns(USER, 10)).toHaveLength(0);
  });
});
