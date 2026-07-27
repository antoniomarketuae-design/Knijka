import { describe, expect, it } from "vitest";
import { buildHazardBank, hazardBankAudit, selectHazardItems } from "../bank";
import { HazardError } from "../types";
import { makeBank, makeItemSource } from "./fixtures";

const build = (items: unknown) => () => buildHazardBank(items);

describe("buildHazardBank — structure", () => {
  it("derives the window, the clip-time fault and the media URLs", () => {
    const bank = makeBank([makeItemSource("hz-a")]);
    const item = bank.byId("hz-a")!;
    expect(item.window).toEqual({ openSec: 4, closeSec: 8 });
    expect(item.hazardAtSec).toBe(8); // faultSec 14 − clipStartSec 6
    expect(item.playableSec).toBe(8);
    expect(item.clipSrc).toBe("/clips/sc-a__m0.webm");
    expect(item.posterSrc).toBe("/clips/sc-a__m0.k0.webp");
  });

  it("rejects a file that is not the versioned bank shape", () => {
    expect(build([])).toThrow(HazardError);
    expect(build({ version: 2, items: [] })).toThrow(/failed validation/);
  });

  it("rejects an unknown field rather than silently ignoring it", () => {
    expect(
      build({ version: 1, items: [{ ...makeItemSource("hz-a"), windowCloseSec: 9 }] }),
    ).toThrow(/failed validation/);
  });

  it("rejects duplicate ids", () => {
    expect(build({ version: 1, items: [makeItemSource("hz-a"), makeItemSource("hz-a")] })).toThrow(
      /duplicate item id/,
    );
  });
});

describe("buildHazardBank — geometry is fatal, not advisory", () => {
  it("refuses a cut that runs past the fault", () => {
    expect(build({ version: 1, items: [makeItemSource("hz-a", { cutSec: 8.5 })] })).toThrow(
      /runs past the fault/,
    );
  });

  it("allows a cut exactly at the fault (the clip ends as it lands)", () => {
    expect(makeBank([makeItemSource("hz-a", { cutSec: 8 })]).items).toHaveLength(1);
  });

  it("refuses a window too short to hold five distinguishable bands", () => {
    expect(build({ version: 1, items: [makeItemSource("hz-a", { windowOpenSec: 7 })] })).toThrow(
      /under the 1.5s minimum/,
    );
  });

  it("refuses an item with no run-up before scoring opens", () => {
    expect(build({ version: 1, items: [makeItemSource("hz-a", { windowOpenSec: 0.5 })] })).toThrow(
      /run-up/,
    );
  });

  it("refuses a fault that is not inside the rendered clip", () => {
    expect(
      build({ version: 1, items: [makeItemSource("hz-a", { clipStartSec: 20, faultSec: 14 })] }),
    ).toThrow(/not inside the clip/);
  });

  it("reports every problem at once, not just the first", () => {
    let message = "";
    try {
      buildHazardBank({
        version: 1,
        items: [makeItemSource("hz-a", { cutSec: 8.5 }), makeItemSource("hz-b", { windowOpenSec: 0 })],
      });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("2 problem(s)");
  });
});

describe("buildHazardBank — retrieval integrity (ADR-002)", () => {
  it("refuses a violation code the rule catalog does not have", () => {
    expect(
      build({ version: 1, items: [makeItemSource("hz-a", { violationCode: "NOPE" as never })] }),
    ).toThrow(/failed validation/);
  });

  it("refuses an item whose law echo has drifted from the catalog", () => {
    expect(
      build({ version: 1, items: [makeItemSource("hz-a", { lawRefEcho: "ЗДвП чл. 5" })] }),
    ).toThrow(/no longer matches the catalog/);
  });
});

describe("the servable gate", () => {
  it("serves approved items only — an unwatched window is an unverified measurement", () => {
    const bank = makeBank([
      makeItemSource("hz-a", { status: "approved" }),
      makeItemSource("hz-b", { status: "needs-review" }),
      makeItemSource("hz-c", { status: "draft" }),
    ]);
    expect(bank.servable.map((i) => i.id)).toEqual(["hz-a"]);
    // …but the rest stay reachable, so a run dealt before an edit is gradeable
    // and the review board can list what is waiting.
    expect(bank.items).toHaveLength(3);
    expect(bank.byId("hz-b")).toBeDefined();
  });
});

describe("selectHazardItems", () => {
  const pool = makeBank([
    makeItemSource("hz-e1", { difficulty: 1 }),
    makeItemSource("hz-e2", { difficulty: 1 }),
    makeItemSource("hz-m1", { difficulty: 2 }),
    makeItemSource("hz-m2", { difficulty: 2 }),
    makeItemSource("hz-h1", { difficulty: 3 }),
    makeItemSource("hz-h2", { difficulty: 3 }),
  ]).items;

  it("ramps: easiest tier first", () => {
    const picked = selectHazardItems(pool, 4, 1234);
    expect(picked.map((i) => i.difficulty)).toEqual([1, 1, 2, 2]);
  });

  it("is deterministic for a seed and different across seeds", () => {
    const a = selectHazardItems(pool, 6, 7).map((i) => i.id);
    const b = selectHazardItems(pool, 6, 7).map((i) => i.id);
    expect(a).toEqual(b);
    const seeds = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((s) => selectHazardItems(pool, 6, s).map((i) => i.id).join()),
    );
    expect(seeds.size).toBeGreaterThan(1);
  });

  it("never repeats an item inside one run", () => {
    const picked = selectHazardItems(pool, 6, 99);
    expect(new Set(picked.map((i) => i.id)).size).toBe(6);
  });

  it("returns what it has when the pool is short of the requested length", () => {
    expect(selectHazardItems(pool, 20, 3)).toHaveLength(6);
    expect(selectHazardItems([], 3, 3)).toEqual([]);
    expect(selectHazardItems(pool, 0, 3)).toEqual([]);
  });
});

describe("hazardBankAudit", () => {
  it("tells a reviewer which clip to open and which seconds to scrub to", () => {
    const bank = makeBank([makeItemSource("hz-a", { status: "needs-review", notesBg: "виж кадъра" })]);
    expect(hazardBankAudit(bank)).toEqual([
      {
        itemId: "hz-a",
        clipId: "sc-a__m0",
        status: "needs-review",
        windowOpenSec: 4,
        cutSec: 8,
        hazardAtSec: 8,
        notesBg: "виж кадъра",
      },
    ]);
  });
});
