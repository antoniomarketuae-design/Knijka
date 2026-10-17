/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE FOLD ROW MAY NOT TAKE ITSELF DOWN BECAUSE IT SQUEEZED THE WINDOW TO
 * NOTHING — sc-roundabout-entry:fe081cf1, rig-w3g CONTROL-NOPRESS-SIM at
 * 9390622 (integrator decision W7, 2026-10-15: „the window must not
 * oscillate").
 *
 * THE FRAMES (`pc-L3-CONTROL-NOPRESS-SIM-raw.json`, `col.changes`): after the
 * crash pin the advisor's card and the three-line banner left the toast
 * scroller 29.6 px (raf 3014: `clientHeight` 30, no row). The 116.5 px card
 * was cut, so the row went up — 23.5 + the column's 6 px gap — and the window
 * became 0.1 px (raf 3015: `clientHeight` 0, the row reading «↓ обяснението
 * продължава — покажи»). At `clientHeight` 0 `rowsBelowFold` answers „not
 * laid out, no claim", the fold read 0, the row went down, the window was
 * 29.6 again (raf 3016) — every one or two frames for the card's last 3 s.
 *
 * `measureToastColumnFold` (LessonPlayShell.tsx) now treats a scroller whose
 * cards have a height as laid out: with the row squeezing it to 0 it asks the
 * column without the row, as it does for every other fold read.
 *
 * The column model is `toastColumnFold.test.ts`'s, reduced to what this read
 * touches; layout happens between the reads (`layouts`), the way the shell's
 * `ResizeObserver` re-runs the measure after each commit.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { describe, expect, it } from "vitest";
import { measureToastColumnFold, rowsBelowFold } from "../LessonPlayShell";

interface Spec {
  windowWithRowPx: number;
  windowWithoutRowPx: number;
  cards: number[];
}

/** A scroller whose `clientHeight` depends on whether the fold row is in flow, like the shell's. */
function columnAt(spec: Spec, rowUp: boolean) {
  let position = "";
  const positions: string[] = [];
  const SCROLLER_TOP = 448.4;
  const tops: number[] = [];
  let y = 0;
  for (const h of spec.cards) {
    tops.push(y);
    y += h + 8;
  }
  const columnEl = {} as HTMLElement;
  const stack = {
    offsetParent: columnEl,
    offsetTop: 0,
    clientTop: 0,
    getBoundingClientRect: () => ({ top: SCROLLER_TOP }),
    children: spec.cards.map((h, i) => ({
      offsetParent: columnEl,
      offsetTop: tops[i],
      offsetHeight: h,
      getBoundingClientRect: () => ({ top: SCROLLER_TOP + tops[i]!, height: h }),
    })),
  };
  const row = rowUp
    ? {
        style: {
          get position() {
            return position;
          },
          set position(v: string) {
            positions.push(v);
            position = v;
          },
        },
      }
    : null;
  const scroller = {
    querySelector: (sel: string) => (sel === '[data-hud="toasts"]' && spec.cards.length > 0 ? stack : null),
    getBoundingClientRect: () => ({ top: SCROLLER_TOP }),
    get clientHeight() {
      return Math.round(rowUp && position !== "absolute" ? spec.windowWithRowPx : spec.windowWithoutRowPx);
    },
    scrollTop: 0,
    parentElement: {
      querySelector: (sel: string) => (sel === ":scope > [data-hud-toast-more]" ? row : null),
    },
  } as unknown as HTMLElement;
  return { scroller, positions };
}

/** The shell, one layout at a time: the row is up exactly when the last measure said so. */
function layouts(spec: Spec, n: number) {
  let rowUp = false;
  const seen: Array<{ rowUp: boolean; clientHeight: number; fold: { belowFold: number; unseenBelowFold: number } }> = [];
  for (let i = 0; i < n; i += 1) {
    const { scroller } = columnAt(spec, rowUp);
    const fold = measureToastColumnFold(scroller);
    seen.push({ rowUp, clientHeight: scroller.clientHeight, fold });
    rowUp = fold.belowFold > 0;
  }
  return seen;
}

// rafs 3014 / 3015: 29.6 px without the row, 0.1 with it; the 116.5 px card.
const RIG_FRAME: Spec = { windowWithRowPx: 0.1, windowWithoutRowPx: 29.6, cards: [116.5] };

describe("the fold row and a window it squeezes to nothing (rig-w3g CONTROL-NOPRESS-SIM)", () => {
  it("the trap, stated: at clientHeight 0 the shared count reads «no claim»", () => {
    expect(rowsBelowFold([{ top: 0, height: 116.5 }], 0, 0)).toBe(0);
  });

  it("row down: the 116.5 px card in a 29.6 px window is below the fold — the row goes up", () => {
    const { scroller } = columnAt(RIG_FRAME, false);
    expect(scroller.clientHeight).toBe(30);
    expect(measureToastColumnFold(scroller).belowFold).toBe(1);
  });

  it("row up, window 0.1 px: the row STAYS — the column without it still cannot show the card", () => {
    const { scroller, positions } = columnAt(RIG_FRAME, true);
    expect(scroller.clientHeight).toBe(0);
    const fold = measureToastColumnFold(scroller);
    expect(fold.belowFold, "the fold row read its own squeeze as «nothing below» and took itself down").toBe(1);
    // nothing of the card is on the glass: the count, not «обяснението продължава», is the true sentence
    expect(fold.unseenBelowFold).toBe(1);
    expect(positions.length % 2, "the probe left the row out of flow").toBe(0);
    expect(positions[positions.length - 1] ?? "").toBe("");
  });

  it("NO OSCILLATION: 120 consecutive layouts, the row flips once (up) and the window never moves again", () => {
    const seen = layouts(RIG_FRAME, 120);
    const flips = seen.filter((s, i) => i > 0 && s.rowUp !== seen[i - 1]!.rowUp).length;
    expect(flips, `the window went ${seen.slice(0, 6).map((s) => s.clientHeight).join(" → ")} …`).toBe(1);
    expect(new Set(seen.slice(1).map((s) => s.clientHeight))).toEqual(new Set([0]));
  });

  it("…and a card that fits once the row is gone still takes the row down (the w49 rule is untouched)", () => {
    const seen = layouts({ windowWithRowPx: 0.4, windowWithoutRowPx: 120, cards: [116.5] }, 6);
    expect(seen.map((s) => s.rowUp)).toEqual([false, false, false, false, false, false]);
    const { scroller } = columnAt({ windowWithRowPx: 0.4, windowWithoutRowPx: 120, cards: [116.5] }, true);
    expect(measureToastColumnFold(scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });

  it("an empty, unlaid scroller is still no claim", () => {
    const { scroller } = columnAt({ windowWithRowPx: 0, windowWithoutRowPx: 0, cards: [0] }, true);
    expect(measureToastColumnFold(scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });
});
