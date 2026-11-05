/**
 * =============================================================================
 * THE CENSUS — every fault card, opened, at every stage the product has:
 * WHOLE, or SCROLLING INSIDE ITSELF WITH ITS LAW CHIP PINNED. None cut.
 * sc-roundabout-entry:fe081cf1 round 2 (2026-10-13), acceptance item 3.
 *
 * TWO HALVES, AND WHY NEITHER IS ENOUGH ALONE.
 *   · MEASURED: `openedCardHeights.fixture.ts` — all 87 cards (86 in round 2,
 *     row 87 added by lane staticcardcopy and measured the same way) laid out by
 *     Chromium and WebKit with the product's compiled CSS. That same run laid
 *     each card out IN the column at each stage and read the result off the
 *     DOM: 0 of 86 × 6 × 2 cut, law chip inside the window on every one
 *     (lane scratch `r2/census/census2-report.txt`).
 *   · ARITHMETIC, here: the product's own column sizes (`notifyColumnTopPx`,
 *     `notifyColumnCapPx`) against those heights, by the one rule the layout
 *     follows — the card being read takes the window, down to its pinned rows
 *     plus `TOAST_READ_FLOOR_PX`. This half is what RUNS in the gate, and it is
 *     held to the measured counts so the two cannot drift.
 * What neither is: the product on a device. Owed to the rig.
 *
 * THE STAGES: the six of the round-1 verifier's probe. What stands above the
 * stack is what stands after the column has yielded as far as it does — the
 * one-line banner (48.7 px) and the recall pill (23.5 px), 6 px gaps — and the
 * fold row (23.5 px + 6) joins them whenever the paragraph does not fit.
 * =============================================================================
 */
import { describe, expect, it } from "vitest";
import { TOAST_FIT_SLACK_PX, TOAST_READ_FLOOR_PX, toastReadMs } from "../../../../modules/sim/hud/HudToasts";
import { notifyColumnTopPx } from "../../../../modules/sim/hud/notifyColumn";
import { makeViolation, violationPeekBg, type ViolationCode } from "../../../../modules/sim/rules";
import { notifyColumnCapPx } from "../LessonPlayShell";
import { OPENED_CARD_HEIGHTS } from "./openedCardHeights.fixture";

const GAP = 6;
const BANNER_ONE_LINE = 48.7;
const PILL = 23.5;
const ROW = 23.5;
const ADVISOR = 98.3;
/** The rig's immersive harness: column 467.5 ⇒ stage 841.45 ⇒ a 58.55 px top bar at 900. */
const RIG_STAGE = (467.5 + 172) / 0.76;
const TOP_BAR = 900 - RIG_STAGE;

// RE-DERIVED for row 87, COLLISION/staticObjectOnRoad (lane staticcardcopy, S5): its card was laid out in
// each stage's column by the same browsers (scratch staticcardcopy-impl/cardcensus): Chromium — scrolls at
// 1165×650, whole from 1366×768 up (279 px natural, 283.0 px of room there); WebKit — scrolls at 1165×650 and
// 1366×768, whole from 1440×800 up (293 px natural). Each count below is the round-2 count plus that one card.
const STAGES: ReadonlyArray<{ name: string; h: number; cr: [whole: number, scrolls: number]; wk: [whole: number, scrolls: number] }> = [
  { name: "/simulator 1165×650 (1440×900 window)", h: 650, cr: [33, 54], wk: [27, 60] },
  { name: "immersive 1366×768", h: 768 - TOP_BAR, cr: [63, 24], wk: [60, 27] },
  { name: "immersive 1440×800", h: 800 - TOP_BAR, cr: [71, 16], wk: [70, 17] },
  { name: "immersive 1536×864", h: 864 - TOP_BAR, cr: [75, 12], wk: [76, 11] },
  { name: "rig cell, immersive 1440×900", h: RIG_STAGE, cr: [78, 9], wk: [78, 9] },
  { name: "immersive 1920×1080", h: 1080 - TOP_BAR, cr: [84, 3], wk: [84, 3] },
];

const capOf = (stageH: number) =>
  notifyColumnCapPx(stageH, notifyColumnTopPx({ width: (stageH * 16) / 9, height: stageH }, false));
/** The room the stack has under the one-line banner and the pill. */
const roomOf = (stageH: number) => capOf(stageH) - (BANNER_ONE_LINE + GAP) - (PILL + GAP);

type Fit = "whole" | "scrolls" | "cut";
/** One opened card in one column, by the rule the layout follows. */
function layOut(naturalPx: number, pinnedPx: number, roomPx: number): { fit: Fit; bodyShownPx: number } {
  if (naturalPx <= roomPx + TOAST_FIT_SLACK_PX) return { fit: "whole", bodyShownPx: naturalPx - pinnedPx };
  // it does not fit: the fold row goes up, and the card takes what is left
  const window = roomPx - (ROW + GAP);
  const bodyShownPx = window - pinnedPx;
  return bodyShownPx >= TOAST_READ_FLOOR_PX ? { fit: "scrolls", bodyShownPx } : { fit: "cut", bodyShownPx };
}

describe("the fixture is the catalogue's cards — a paragraph that changed turns this red", () => {
  it("87 cards, each a code (and act) the catalogue has, with a summary to open from, at the measured length", () => {
    // 86 → 87: COLLISION/staticObjectOnRoad (lane staticcardcopy), measured in both engines (fixture header).
    expect(OPENED_CARD_HEIGHTS).toHaveLength(87);
    const stale: string[] = [];
    for (const [key, chars] of OPENED_CARD_HEIGHTS) {
      const [code, detail] = key.split("/") as [ViolationCode, string | undefined];
      const v = makeViolation(code, 0, detail === undefined ? undefined : { detail });
      if (v.explanationBg.length !== chars) stale.push(`${key}: fixture ${chars} ch, catalogue ${v.explanationBg.length}`);
      const peek = violationPeekBg(code, detail);
      if (typeof peek !== "string" || peek.trim().length === 0) stale.push(`${key}: no summary — this card has no «Защо» to open`);
    }
    expect(stale).toEqual([]);
  });

  it("the row's own card is the sidecar's: 295.5 px opened, 97.5 px of it pinned (Chromium)", () => {
    const row = OPENED_CARD_HEIGHTS.find(([key]) => key === "COLLISION/staticObject")!;
    expect(row[1]).toBe(323);
    expect(row[2]).toBe(295.5);
    expect(row[3]).toBe(97.5);
  });
});

describe("the stages are the product's", () => {
  it("cap 322 on the 1165×650 stage, 467.5 on the rig's — the product's own two functions", () => {
    expect(capOf(650)).toBe(322);
    expect(capOf(RIG_STAGE)).toBeCloseTo(467.5, 1);
    expect(roomOf(650)).toBeCloseTo(237.8, 1);
    expect(roomOf(RIG_STAGE)).toBeCloseTo(383.3, 1);
  });
});

for (const [engine, natAt, pinAt] of [
  ["Chromium", 4, 5],
  ["WebKit", 8, 9],
] as const) {
  describe(`THE CENSUS — ${engine}: 87 opened cards × 6 stages, a fault waiting behind each («+1» in the footer)`, () => {
    for (const stage of STAGES) {
      it(`${stage.name}: none cut`, () => {
        const room = roomOf(stage.h);
        const tally = { whole: 0, scrolls: 0, cut: [] as string[] };
        let least = Number.POSITIVE_INFINITY;
        let leastKey = "";
        for (const card of OPENED_CARD_HEIGHTS) {
          const r = layOut(card[natAt], card[pinAt], room);
          if (r.fit === "cut") tally.cut.push(`${card[0]} (${card[natAt]} px, pinned ${card[pinAt]}) in ${room.toFixed(1)} px`);
          else tally[r.fit] += 1;
          if (r.fit === "scrolls" && r.bodyShownPx < least) {
            least = r.bodyShownPx;
            leastKey = card[0];
          }
        }
        console.log(
          `[census] ${engine} · ${stage.name}: room ${room.toFixed(1)} — whole ${tally.whole}, scrolls with the law chip pinned ${tally.scrolls}, cut ${tally.cut.length}` +
            (tally.scrolls > 0 ? ` · least paragraph on the glass ${least.toFixed(1)} px = ${(least / 16.5).toFixed(1)} lines (${leastKey})` : ""),
        );
        expect(tally.cut, "an opened explanation is cut, or its law chip is off the glass").toEqual([]);
        // …and the arithmetic is the browsers': the counts the same run read off the DOM
        const measured = engine === "Chromium" ? stage.cr : stage.wk;
        expect([tally.whole, tally.scrolls]).toEqual(measured);
        // a card that scrolls shows at least two whole lines of its paragraph at a time
        if (tally.scrolls > 0) expect(least).toBeGreaterThanOrEqual(2 * 16.5);
      });
    }

    it("BEFORE, for the record: beside the advisor's card (base) and with it waiting (round 1) — the cards that were CUT", () => {
      // natural height without the badge: neither base nor round 1 printed one
      const nat = engine === "Chromium" ? 2 : 6;
      const notWhole = (roomPx: number) => OPENED_CARD_HEIGHTS.filter((c) => c[nat] > roomPx + TOAST_FIT_SLACK_PX).length;
      const table = STAGES.map((s) => [notWhole(roomOf(s.h) - ADVISOR - GAP), notWhole(roomOf(s.h))]);
      console.log(`[census] ${engine} · cut at base → cut after round 1 → cut after round 2: ` + STAGES.map((s, i) => `${s.name} ${table[i]![0]} → ${table[i]![1]} → 0`).join(" · "));
      if (engine === "Chromium") {
        // the round-1 table, reproduced: 1165×650 86 → 50 · 1366×768 80 → 20 · 1440×900 23 → 8 · 1920×1080 7 → 3
        // — and with row 87 (lane staticcardcopy; its 279 px card is not whole beside the advisor at 1165×650 or
        // 1366×768, nor at 1165×650 without it): 1165×650 87 → 51 · 1366×768 81 → 20; the rest unchanged.
        expect(table[0]).toEqual([87, 51]);
        expect(table[1]).toEqual([81, 20]);
        expect(table[4]).toEqual([23, 8]);
        expect(table[5]).toEqual([7, 3]);
      }
      for (const [base, r1] of table) expect(r1).toBeLessThanOrEqual(base!);
    });

    it("THE BREAKPOINT, derived: the shortest stage on which every one of the 87 keeps its law chip pinned", () => {
      const worstPinned = Math.max(...OPENED_CARD_HEIGHTS.map((c) => c[pinAt]));
      // room − fold row ≥ pinned + one line, room = 0.76·H − 172 − (48.7 + 6) − (23.5 + 6)
      let h = 400;
      while (h < 900 && OPENED_CARD_HEIGHTS.some((c) => layOut(c[natAt], c[pinAt], roomOf(h)).fit === "cut")) h += 1;
      console.log(`[census] ${engine} · worst pinned rows ${worstPinned} px → every card pinned from a ${h} px stage up (the smallest product stage listed is 650)`);
      expect(h).toBeLessThanOrEqual(650);
      expect(roomOf(h) - (ROW + GAP)).toBeGreaterThanOrEqual(worstPinned + TOAST_READ_FLOOR_PX);
    });
  });
}

describe("the time to read what scrolls", () => {
  it("every card's life after the press is its own paragraph at the product's pace — the longest is 88 s", () => {
    const longest = Math.max(...OPENED_CARD_HEIGHTS.map((c) => c[1]));
    expect(longest).toBe(1320);
    expect(toastReadMs(longest)).toBe(88_000);
  });
});
