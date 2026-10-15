/**
 * =============================================================================
 * THE FOLD ROW READS AND PAGES THE CARD BEING READ — sc-roundabout-entry:fe081cf1
 * round 2 (2026-10-13), integrator decision W2: «the card's BODY scrolls INSIDE
 * the card … the hidden part is announced by a visible affordance in the
 * product's own words (the fold row it already uses), and it is reachable».
 *
 * WHAT THIS FILE HOLDS, each at the level the logic lives:
 *   §1  `toastReadContinues` — „cut", by the column's own 1 px rule.
 *   §2  `measureToastColumnFold` with a body box in the stack: it counts, it
 *       says the true sentence, and the row may not hold ITSELF up over it.
 *   §3  `pageToastRead` / `toastReadPageScrollTop` — «покажи» walks the box to
 *       its last line, never past a line, and the row then leaves.
 *   §4  `bannerOneLineWhileReading` — the banner's one-line form at the reader's
 *       last step: only under a hold, the sentence untouched, the task and its
 *       cap never cut on a banner that has no lead.
 *
 * The stand-in answers exactly the reads these functions make (`offsetTop`,
 * `offsetHeight`, `clientHeight`, `scrollHeight`, `scrollTop`, the row's inline
 * `position`) and lays the column out as flexbox does: the card being read
 * takes the window the column has, its body box what is left under its pinned
 * rows. The lengths are the rig-w3d sidecar's (`pc-L3-F-ON-WHY.json`): opened
 * card 295.5 px, body 198 px of it, fold row 23.5 px, column gap 6 px.
 * `toastColumnFold.test.ts` beside this file holds the measure for cards
 * nobody opened; nothing there was edited for this.
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ObjectiveBanner } from "../../../../modules/sim/hud/ObjectiveBanner";
import { mountHook } from "../../../../modules/sim/hud/__tests__/hookHarness";
import {
  bannerOneLineWhileReading,
  bannerObjectiveLineBg,
  measureToastColumnFold,
  measureToastReadFold,
  objectiveTitleUnderHold,
  pageToastRead,
  toastPageScrollTop,
  toastReadContinues,
  toastReadContinuesWithoutRow,
  toastReadPageScrollTop,
} from "../LessonPlayShell";

const OPENED = 295.5;
const PINNED = 97.5;
const ROW = 23.5;
const GAP = 6;

/**
 * The shell's scroller with ONE card in it — the card being read — in a column
 * that has `roomPx` for the scroller and its fold row together.
 */
function readingColumn(spec: { roomPx: number; rowUp: boolean; naturalPx?: number; readBox?: boolean }) {
  const natural = spec.naturalPx ?? OPENED;
  const writes: string[] = [];
  let position = "";
  const row = {
    style: {
      get position() {
        return position;
      },
      set position(v: string) {
        writes.push(v);
        position = v;
      },
    },
  };
  const rowInFlow = () => spec.rowUp && position !== "absolute";
  const windowPx = () => Math.max(0, Math.min(natural, spec.roomPx - (rowInFlow() ? GAP + ROW : 0)));
  const cardPx = () => Math.max(PINNED + 16.5, windowPx());
  const read = {
    scrollTop: 0,
    get clientHeight() {
      return Math.round(cardPx() - PINNED);
    },
    get scrollHeight() {
      return Math.round(Math.max(natural, cardPx()) - PINNED);
    },
  };
  const stack = { offsetTop: 0, offsetParent: null as unknown, clientTop: 0, getBoundingClientRect: () => ({ top: 0 }), children: [] as unknown[] };
  const column = { querySelector: (sel: string) => (sel === ":scope > [data-hud-toast-more]" && spec.rowUp ? row : null) };
  const card = {
    offsetParent: column as unknown,
    offsetTop: 0,
    get offsetHeight() {
      return Math.round(cardPx());
    },
    getBoundingClientRect: () => ({ top: 0, height: cardPx() }),
  };
  stack.offsetParent = column;
  stack.children = [card];
  const scroller = {
    scrollTop: 0,
    get clientHeight() {
      return Math.round(windowPx());
    },
    get scrollHeight() {
      return Math.round(cardPx());
    },
    parentElement: column,
    getBoundingClientRect: () => ({ top: 0 }),
    querySelector: (sel: string) =>
      sel === '[data-hud="toasts"]' ? stack : sel === "[data-hud-toast-read]" && spec.readBox !== false ? read : null,
  };
  return { scroller: scroller as unknown as HTMLElement, row: row as unknown as HTMLElement, read, readEl: read as unknown as HTMLElement, writes, spec };
}

describe("§1 toastReadContinues — more of the paragraph is below the foot of its box", () => {
  it("more than 1 px past the foot is a cut; 1 px is rounding", () => {
    expect(toastReadContinues({ scrollTop: 0, clientHeight: 140, scrollHeight: 198 })).toBe(true);
    expect(toastReadContinues({ scrollTop: 0, clientHeight: 197, scrollHeight: 198 })).toBe(false);
    expect(toastReadContinues({ scrollTop: 0, clientHeight: 196, scrollHeight: 198 })).toBe(true);
  });

  it("read to the end, it does not continue", () => {
    expect(toastReadContinues({ scrollTop: 58, clientHeight: 140, scrollHeight: 198 })).toBe(false);
    expect(toastReadContinues({ scrollTop: 57, clientHeight: 140, scrollHeight: 198 })).toBe(false);
    expect(toastReadContinues({ scrollTop: 56, clientHeight: 140, scrollHeight: 198 })).toBe(true);
  });

  it("a box that has not been laid out (0 px) is not «everything is hidden»", () => {
    expect(toastReadContinues({ scrollTop: 0, clientHeight: 0, scrollHeight: 198 })).toBe(false);
  });
});

describe("§2 measureToastColumnFold — the card being read is «a card that cannot be read to its last line»", () => {
  it("THE /simulator STAGE (room 237.8): the card fits its window, its paragraph does not — the row goes up, with the sentence that is true", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: false });
    // the card itself never crosses the scroller's fold …
    expect(col.scroller.scrollHeight).toBe(col.scroller.clientHeight);
    // … and the fold is counted all the same: 140 of 198 px of the paragraph are on the glass.
    expect(col.read.clientHeight).toBe(140);
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 1, unseenBelowFold: 0 });
    // `unseenBelowFold` 0 is what makes the row say «↓ обяснението продължава — покажи» and not «още 1 известие».
    expect(measureToastReadFold(col.scroller)).toBe(true);
  });

  it("…and it stays up with the row in the column: 111 of 198 px, the paragraph still continues without the row", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: true });
    expect(col.read.clientHeight).toBe(111);
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 1, unseenBelowFold: 0 });
    // two probes — the rows, then the box — and each puts the row back before the next read
    expect(col.writes, "a probe did not put the row's inline position back").toEqual(["absolute", "", "absolute", ""]);
  });

  it("THE ROW MAY NOT HOLD ITSELF UP: a paragraph that is whole without the row takes the row down", () => {
    // room 300: 295.5 px fits without the row, and 300 − 29.5 = 270.5 does not with it
    const col = readingColumn({ roomPx: 300, rowUp: true });
    expect(col.read.scrollHeight - col.read.clientHeight, "as it stands, the row is what cuts it").toBe(25);
    expect(toastReadContinuesWithoutRow(col.scroller, col.row, col.readEl)).toBe(false);
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });

  it("the probe restores the place the student has paged to — in the box and in the scroller", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: true });
    col.read.scrollTop = 40;
    (col.scroller as unknown as { scrollTop: number }).scrollTop = 0;
    // a grown box clamps: model it — while the row is out of flow the box can hold less scroll
    const real = col.read;
    const proxy = new Proxy(real, {
      get(t, k) {
        if (k === "scrollTop" && (col.row.style as { position: string }).position === "absolute") {
          t.scrollTop = Math.min(t.scrollTop, 20);
        }
        return Reflect.get(t, k);
      },
    }) as unknown as HTMLElement;
    expect(toastReadContinuesWithoutRow(col.scroller, col.row, proxy)).toBe(true);
    expect(real.scrollTop, "a clamped scroll position was not put back").toBe(40);
  });

  it("the rig stage (room 383.3): whole at its natural height — no fold, and nothing is probed", () => {
    const col = readingColumn({ roomPx: 383.3, rowUp: false });
    expect(col.read.clientHeight).toBe(198);
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
    expect(measureToastReadFold(col.scroller)).toBe(false);
    expect(col.writes).toEqual([]);
  });

  it("NO CARD IS BEING READ: the measure is the measure it was — the box is not looked for in vain", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: false, readBox: false });
    // the rigid card of every earlier round: 238 px of window, a 238 px card (the stand-in shrinks it; nothing is cut)
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
    expect(measureToastReadFold(col.scroller)).toBe(false);
    expect(pageToastRead(col.scroller)).toBe(false);
  });
});

describe("§3 «покажи» pages the box being read to its last line, and never past one", () => {
  it("one press moves the BOX, not the scroller, and reports that it did", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: true });
    expect(pageToastRead(col.scroller)).toBe(true);
    // window 111 px, the column's 30 px overlap: 81 px down, of the 87 there are
    expect(col.read.scrollTop).toBe(81);
    expect((col.scroller as unknown as { scrollTop: number }).scrollTop).toBe(0);
  });

  it("pressed until the row leaves: the last line is on the glass, in a bounded number of presses, at every room", () => {
    for (const roomPx of [150, 180, 208.3, 237.8, 253.5, 283, 300, 360]) {
      for (const naturalPx of [OPENED, 441.25, 738.25]) {
        const col = readingColumn({ roomPx, rowUp: true, naturalPx });
        let presses = 0;
        while (measureToastColumnFold(col.scroller).belowFold > 0 && presses < 60) {
          const before = col.read.scrollTop;
          expect(pageToastRead(col.scroller), `room ${roomPx}, card ${naturalPx}: the row is up and the press paged nothing`).toBe(true);
          expect(col.read.scrollTop, "a press that does not advance is a control that cannot reach zero").toBeGreaterThan(before);
          expect(col.read.scrollTop - before, "a press paged past text the student never saw").toBeLessThanOrEqual(col.read.clientHeight);
          presses += 1;
        }
        expect(presses).toBeLessThan(60);
        // the measure said the row can go: it unmounts, the box takes its 29.5 px back, and nothing is left under its foot
        col.spec.rowUp = false;
        expect(col.read.scrollHeight - col.read.clientHeight - col.read.scrollTop).toBeLessThanOrEqual(1);
        expect(measureToastColumnFold(col.scroller).belowFold).toBe(0);
      }
    }
  });

  it("toastReadPageScrollTop is the column's page — except that it never steps further than the box is tall", () => {
    // a box with room for a page and its overlap: the column's own arithmetic
    expect(toastReadPageScrollTop(0, 111, 198)).toBe(toastPageScrollTop(0, 111, 198));
    expect(toastReadPageScrollTop(0, 111, 198)).toBe(81);
    // a box of one line and a half (25 px): the column's 40 px floor would skip 15 px of text
    expect(toastPageScrollTop(0, 25, 198)).toBe(40);
    expect(toastReadPageScrollTop(0, 25, 198)).toBe(25);
    // it still terminates at the end …
    expect(toastReadPageScrollTop(170, 25, 198)).toBe(173);
    // … and an unlaid box falls back to the column's floor rather than standing still
    expect(toastReadPageScrollTop(0, 0, 198)).toBe(40);
  });

  it("nothing left to read in the box: the press is not swallowed — the caller pages the stack", () => {
    const col = readingColumn({ roomPx: 237.8, rowUp: true });
    col.read.scrollTop = col.read.scrollHeight - col.read.clientHeight;
    expect(pageToastRead(col.scroller)).toBe(false);
  });
});

describe("§4 bannerOneLineWhileReading — the banner's last step, and what it may never cut", () => {
  it("one line ONLY when the reader asks for it AND a hold's lead stands in front of the task", () => {
    expect(bannerOneLineWhileReading("crashPinned", true)).toBe(true);
    expect(bannerOneLineWhileReading("offRoad", true)).toBe(true);
    // the reader has not asked: the banner as it shipped
    expect(bannerOneLineWhileReading("crashPinned", false)).toBe(false);
    expect(bannerOneLineWhileReading("offRoad", false)).toBe(false);
    expect(bannerOneLineWhileReading(null, false)).toBe(false);
    // NO LEAD: the sentence is the task, and one line of it could cut its «дръж под N км/ч»
    expect(bannerOneLineWhileReading(null, true), "a banner with no hold lead was cut to one line").toBe(false);
  });

  type Tree = { type: unknown; props: Record<string, unknown> };
  /** The banner's sentence element, as the component renders it. */
  function sentenceOf(oneLine: boolean | undefined, titleBg: string): Tree {
    const m = mountHook(() =>
      ObjectiveBanner({ titleBg, index: 2, total: 2, progress: 0.5, flash: null, ...(oneLine === undefined ? {} : { oneLine }) }),
    );
    const root = m.value as unknown as Tree;
    const p = (root.props.children as unknown[]).find(
      (c): c is Tree => typeof c === "object" && c !== null && (c as Tree).type === "p",
    );
    m.unmount();
    expect(p, "the banner's sentence is no longer a <p>").toBeDefined();
    return p!;
  }
  const TASK = "Премини през кръговото и излез с десен мигач";
  const PINNED = objectiveTitleUnderHold(TASK, "crashPinned")!;

  it("THE RIG'S BANNER, one line: the same sentence, whole in the DOM, set on one line with an ellipsis — and it starts with the hold's own order", () => {
    expect(PINNED).toBe(`Колата е притисната след удара — измъкни се назад, за да продължиш: ${TASK}`);
    const p = sentenceOf(true, PINNED);
    expect(p.props.children, "the one-line form changed the sentence").toBe(PINNED);
    const cls = String(p.props.className).split(/\s+/);
    expect(cls, "the sentence still wraps: the banner keeps its three lines").toContain("truncate");
    expect(cls).not.toContain("break-words");
    // the line begins with the hold's condition and its order. Where it ends is the browser's to say and is
    // not asserted here; laid out in Chromium at the rig's 304 px (lane scratch r2/spike/banner.mjs) the banner
    // goes 76.25 → 48.75 px and the line ends after «…измъкни се назад,»
    expect(PINNED.startsWith("Колата е притисната след удара — измъкни се назад")).toBe(true);
  });

  it("NOT ASKED FOR: the banner is the banner it was — the sentence wraps and nothing is cut", () => {
    for (const oneLine of [undefined, false]) {
      const p = sentenceOf(oneLine, PINNED);
      expect(p.props.className).toBe("break-words text-[11px] font-bold leading-tight text-foreground");
      expect(p.props.children).toBe(PINNED);
    }
  });

  it("THE TASK'S OWN CAP IS STILL SAID (founder ruling 2026-09-22): with no hold the shell never asks for one line, whatever the reader says", () => {
    const snap = { objectiveTitle: "Мини по моста", taskCapKmh: 40, limitKmh: 90 };
    const line = bannerObjectiveLineBg(snap);
    expect(line).toMatch(/40 км\/ч/);
    expect(objectiveTitleUnderHold(line, null)).toBe(line);
    expect(bannerOneLineWhileReading(null, true)).toBe(false);
    // …and under a hold the cap is behind the lead, in the DOM, and back on the glass when the reading ends
    expect(objectiveTitleUnderHold(line, "crashPinned")).toContain(line!);
  });

  it("IN THE SHELL: the sentence's expression is the base's — ONE field for the banner and the follow-hint pill — and the one-line form is a second prop", () => {
    const shell = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
    expect(shell).toContain("titleBg={objectiveTitleUnderHold(bannerObjectiveLineBg(snap), snap.objectiveHold)}");
    expect(shell).toContain("oneLine={bannerOneLineWhileReading(snap.objectiveHold, toastReader.bannerYields)}");
    // the only `truncate` in the banner is the one-line arm's
    const banner = readFileSync(resolve(__dirname, "../../../../modules/sim/hud/ObjectiveBanner.tsx"), "utf8");
    expect(banner).toMatch(/oneLine\s*\?\s*"truncate text-\[11px\] font-bold leading-tight text-foreground"\s*:\s*"break-words text-\[11px\] font-bold leading-tight text-foreground"/);
    expect(banner.split('"truncate ').length - 1).toBe(1);
  });
});
