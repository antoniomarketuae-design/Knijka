/**
 * The shipped bank: content/hazard/items.json.
 *
 * Two jobs.
 *
 * 1. FRESHNESS. An item freezes two numbers it did not compute — the
 *    engine-computed fault (`faultSec`, copied from CLIP_PLAN) and the trim
 *    origin (`clipStartSec`, implied by the capture rig's [fault−8, fault+4]
 *    window). Freezing is right: a regenerated plan must never silently
 *    re-grade attempts that were already scored. But a frozen number that has
 *    quietly gone stale is worse than no number, so this file recomputes both
 *    from the committed traces + CLIP_PLAN and fails loudly on drift. When it
 *    fails, the fix is to re-author the item and re-watch the clip — never to
 *    edit the expectation.
 *
 * 2. END-TO-END ON REAL DATA. The seeded items are `needs-review` (the clip
 *    batch is still being produced and nobody has watched the cuts yet), so
 *    `deal()` correctly serves nothing today. The second half of this file
 *    proves the whole path anyway — real items, real windows, real catalog
 *    retrieval — by building a bank with the same rows marked approved.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLIP_PLAN } from "@/modules/clips";
// Deep import, test-only: the trim math is the capture rig's internal, and this
// gate exists precisely to prove the engine's frozen copy of it is still true.
// Production code never reaches past the clips barrel.
import { recordingWindow } from "@/modules/clips/capture/trim";
import { buildHazardBank, loadHazardBankFromDisk, setHazardBank } from "../bank";
import { hazardEngine } from "../engine";
import { HAZARD_DEFAULT_WINDOW_LEAD_SEC } from "../types";

const bank = loadHazardBankFromDisk();

/** content/ is a sibling of platform/; vitest runs with cwd = platform/. */
function readTrace(tracePath: string): { meta: { durationSec: number } } {
  const file = path.resolve(process.cwd(), "..", tracePath);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function readBankFile(): { items: unknown[] } {
  const file = path.resolve(process.cwd(), "..", "content", "hazard", "items.json");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

describe("content/hazard/items.json", () => {
  it("validates and is not empty", () => {
    expect(bank.items.length).toBeGreaterThan(0);
  });

  it("has a unique id per item and per clip (one item per recorded mistake)", () => {
    expect(new Set(bank.items.map((i) => i.id)).size).toBe(bank.items.length);
    expect(new Set(bank.items.map((i) => i.clip.id)).size).toBe(bank.items.length);
  });

  it("spreads difficulty so a run can ramp", () => {
    expect(new Set(bank.items.map((i) => i.difficulty)).size).toBeGreaterThan(1);
  });

  it("never names the hazard in anything the student reads before pressing", () => {
    for (const item of bank.items) {
      expect(item.titleBg).not.toBe(item.hazardBg);
      expect(item.briefBg).not.toContain(item.hazardBg);
      expect(item.briefBg.length).toBeGreaterThan(20);
    }
  });

  it("flags every unreviewed item with what a reviewer must confirm", () => {
    for (const item of bank.items) {
      if (item.status === "approved") continue;
      expect(item.notesBg.length).toBeGreaterThan(0);
    }
  });
});

describe("freshness against the clip pipeline", () => {
  it.each(bank.items.map((i) => [i.id, i] as const))(
    "%s still matches CLIP_PLAN and the trim window",
    (_id, item) => {
      const planned = CLIP_PLAN.find((entry) => entry.id === item.clip.id);
      expect(planned, `no CLIP_PLAN entry for ${item.clip.id}`).toBeDefined();
      expect(planned!.tracePath).toBe(item.clip.tracePath);
      expect(planned!.templateId).toBe(item.clip.templateId);
      expect(planned!.mistakeIndex).toBe(item.clip.mistakeIndex);

      // The frozen fault must still be the engine-computed one.
      expect(item.faultSec).toBeCloseTo(planned!.faultTimeSec, 2);

      // …and the frozen trim origin must still be where the rig would cut.
      const trace = readTrace(item.clip.tracePath);
      const window = recordingWindow(trace.meta.durationSec, planned!.faultTimeSec);
      expect(item.clipStartSec).toBeCloseTo(window.startSec, 2);

      // The cut must land inside the file the rig produced.
      expect(item.window.closeSec).toBeLessThanOrEqual(window.endSec - window.startSec);
    },
  );

  it("authors windows around the documented default lead", () => {
    for (const item of bank.items) {
      const lead = item.window.closeSec - item.window.openSec;
      // A deliberate deviation is allowed; a silent one is not — anything
      // outside ±1 s of the default should be argued for in notesBg.
      expect(Math.abs(lead - HAZARD_DEFAULT_WINDOW_LEAD_SEC)).toBeLessThanOrEqual(1);
    }
  });
});

describe("the whole path, on the real items", () => {
  /**
   * The shipped rows, with the review gate lifted — see the file header. Built
   * from the raw file rather than from `bank.items` so the authored fields are
   * the only thing that survives (the loader's derived fields would fail the
   * strict schema, which is itself the point).
   */
  const approved = buildHazardBank({
    version: 1,
    items: (readBankFile().items as Record<string, unknown>[]).map((row) => ({
      ...row,
      status: "approved",
    })),
  });

  it("deals a ramped run of real clips", async () => {
    setHazardBank(approved);
    try {
      const dealt = await hazardEngine.deal({ userId: "u1", door: "section", length: 5, seed: 11 });
      expect(dealt).toHaveLength(5);
      for (const { card } of dealt) {
        expect(card.clipSrc).toMatch(/^\/clips\/sc-[a-z0-9-]+__m\d+\.webm$/);
        expect(card.durationSec).toBeGreaterThan(1);
      }
    } finally {
      setHazardBank(null);
    }
  });

  it("grades a press against a real window and cites real law", async () => {
    setHazardBank(approved);
    try {
      const item = approved.items[0];
      const judgement = await hazardEngine.judge({
        itemId: item.id,
        // Just inside the window: the best band.
        pressesMediaSec: [item.window.openSec + 0.1],
        watchedToSec: item.playableSec,
      });
      expect(judgement.points).toBe(5);
      expect(judgement.verdict).toBe("excellent");
      expect(judgement.lawRefs[0].act).toBe("ЗДвП");
      expect(judgement.correctiveBg.length).toBeGreaterThan(20);
    } finally {
      setHazardBank(null);
    }
  });

  it("serves nothing while the items are still waiting to be watched", async () => {
    setHazardBank(bank);
    try {
      expect(await hazardEngine.deal({ userId: "u1", door: "section", length: 5 })).toEqual([]);
    } finally {
      setHazardBank(null);
    }
  });
});
