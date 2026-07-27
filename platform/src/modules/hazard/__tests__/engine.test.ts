import { afterEach, describe, expect, it } from "vitest";
import { setHazardBank } from "../bank";
import { hazardEngine } from "../engine";
import { HazardError } from "../types";
import { makeBank, makeItemSource } from "./fixtures";

const bank = makeBank([
  makeItemSource("hz-a", { difficulty: 1 }),
  makeItemSource("hz-b", { difficulty: 2 }),
  makeItemSource("hz-c", { difficulty: 3 }),
  makeItemSource("hz-d", { difficulty: 3, status: "needs-review" }),
]);

afterEach(() => setHazardBank(null));

describe("hazardEngine.deal", () => {
  it("serves cards for approved items only", async () => {
    setHazardBank(bank);
    const dealt = await hazardEngine.deal({ userId: "u1", door: "section", length: 10, seed: 1 });
    expect(dealt.map((d) => d.itemId)).toEqual(["hz-a", "hz-b", "hz-c"]);
  });

  it("stops the player at the CUT, never at the end of the file", async () => {
    setHazardBank(bank);
    const [first] = await hazardEngine.deal({ userId: "u1", door: "theory", length: 1, seed: 1 });
    // The rig records 4 s past the fault; those 4 s are the answer, so the card
    // must never advertise them as playable.
    expect(first.card.durationSec).toBe(8);
  });

  it("is the SAME deal for every door — placement is routing, not a fork", async () => {
    setHazardBank(bank);
    const sim = await hazardEngine.deal({ userId: "u1", door: "simulator", length: 3, seed: 42 });
    const section = await hazardEngine.deal({ userId: "u2", door: "section", length: 3, seed: 42 });
    const theory = await hazardEngine.deal({ userId: "u3", door: "theory", length: 3, seed: 42 });
    expect(section).toEqual(sim);
    expect(theory).toEqual(sim);
  });

  it("deals nothing rather than something fabricated when the pool is empty", async () => {
    setHazardBank(makeBank([makeItemSource("hz-z", { status: "draft" })]));
    expect(await hazardEngine.deal({ userId: "u1", door: "section", length: 8 })).toEqual([]);
  });
});

describe("hazardEngine.judge", () => {
  it("grades a press against the item's window and returns the full reveal", async () => {
    setHazardBank(bank);
    const judgement = await hazardEngine.judge({
      itemId: "hz-a",
      pressesMediaSec: [4.2],
      watchedToSec: 8,
    });
    expect(judgement.verdict).toBe("excellent");
    expect(judgement.points).toBe(5);
    expect(judgement.maxPoints).toBe(5);
    expect(judgement.reactionAtSec).toBe(4.2);
    // Now — and only now — the answer is allowed out.
    expect(judgement.windowStartSec).toBe(4);
    expect(judgement.windowEndSec).toBe(8);
    expect(judgement.hazardAtSec).toBe(8);
    expect(judgement.hazardBg.length).toBeGreaterThan(0);
    expect(judgement.developingBg.length).toBeGreaterThan(0);
    expect(judgement.correctiveBg.length).toBeGreaterThan(0);
    expect(judgement.lawRefs).toEqual([{ act: "ЗДвП", ref: "чл. 119" }]);
  });

  it("teaches a zero exactly as hard as a five", async () => {
    setHazardBank(bank);
    const judgement = await hazardEngine.judge({
      itemId: "hz-a",
      pressesMediaSec: [],
      watchedToSec: 8,
    });
    expect(judgement.verdict).toBe("missed");
    expect(judgement.points).toBe(0);
    // The reveal is identical in substance — this is doc 64 THEO-4.
    expect(judgement.hazardBg.length).toBeGreaterThan(0);
    expect(judgement.developingBg.length).toBeGreaterThan(0);
    expect(judgement.correctiveBg.length).toBeGreaterThan(0);
    expect(judgement.lawRefs).toHaveLength(1);
  });

  it("still grades an item that is no longer servable (a run must not be lost)", async () => {
    setHazardBank(bank);
    const judgement = await hazardEngine.judge({
      itemId: "hz-d",
      pressesMediaSec: [7.5],
      watchedToSec: 8,
    });
    expect(judgement.points).toBe(1);
    expect(judgement.verdict).toBe("late");
  });

  it("refuses an item the bank has never heard of", async () => {
    setHazardBank(bank);
    await expect(
      hazardEngine.judge({ itemId: "hz-nope", pressesMediaSec: [5], watchedToSec: 8 }),
    ).rejects.toBeInstanceOf(HazardError);
  });

  it("ignores watchedToSec — a shorter watch can never improve a result", async () => {
    setHazardBank(bank);
    const full = await hazardEngine.judge({
      itemId: "hz-a",
      pressesMediaSec: [5],
      watchedToSec: 8,
    });
    const partial = await hazardEngine.judge({
      itemId: "hz-a",
      pressesMediaSec: [5],
      watchedToSec: 5.1,
    });
    expect(partial).toEqual(full);
  });
});
