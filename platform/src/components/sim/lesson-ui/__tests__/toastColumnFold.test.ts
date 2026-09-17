/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE TOAST COLUMN'S FOLD, READ OFF THE PAINTED COLUMN — sc-roundabout-entry:
 * fe081cf1 (major), repair round 3.
 *
 * `measureToastColumnFold` (LessonPlayShell.tsx, beside `isToastArrival`)
 * carries the frame and the reasoning. This file does two things:
 *
 *   1. THE READING, against a column model that behaves the way the two
 *      engines were measured to behave in the round-3 rig: the fold row's
 *      `position: absolute` read gives back the window WITHOUT the row (all of
 *      the row + gap when the scroller is the only yielder, a few pixels when a
 *      briefing takes the rest), a scroller that grows under a `scrollTop` near
 *      its end clamps it, and a card in its `hud-toast-in` entry is
 *      `scale(0.96)` about its centre, so its rect is short and its layout box
 *      is not.
 *
 *   2. THE WIRING, off the shipped source: the component stores what the
 *      reading returns, and the fold row and its fade leave in the SAME commit
 *      as the last card. Each matcher is mutation-tested against the real text,
 *      so a green run means the wiring is there, not that the matcher went
 *      blind.
 *
 * jsdom has no layout, so the browser half lives where it can be measured: the
 * round-3 rig bundles this module whole and mounts the real `BriefingCard` and
 * `HudToasts` in the shell's column, class for class. Its numbers are quoted at
 * the function; nothing here pretends to be them.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listRowsInScrollCoords,
  measureToastColumnFold,
  rowsBelowFold,
  toastCardRowsInScrollCoords,
  toastScrollerHeightWithoutRow,
} from "../LessonPlayShell";

// ---------------------------------------------------------------------------
// The column model
// ---------------------------------------------------------------------------

interface ColumnSpec {
  /** Scroller `clientHeight` with the fold row in flow. */
  windowWithRowPx: number;
  /** …and with the row out of flow — the whole row + gap, or less when a
   *  briefing card takes the freed pixels back. */
  windowWithoutRowPx: number;
  /** Is `[data-hud-toast-more]` mounted? */
  rowUp: boolean;
  /** Card layout heights, top to bottom, and the entry scale each is painted at. */
  cards: ReadonlyArray<{ h: number; scale?: number }>;
  gapPx?: number;
  scrollTop?: number;
  /** Who the cards' offset parent is. `shared`: the column, like the stack's. */
  offsetParent?: "shared" | "stack" | "foreign";
  /** The row's inline `position` before the read, to prove it is put back. */
  rowInlinePosition?: string;
}

interface Column {
  scroller: HTMLElement;
  row: HTMLElement | null;
  /** How many times something wrote `scrollTop`. */
  scrollWrites: () => number;
  /** Every value `row.style.position` was set to, in order. */
  positionWrites: () => string[];
}

const SCROLLER_TOP = 400;
const STACK_OFFSET_TOP = 137;

function column(spec: ColumnSpec): Column {
  const gap = spec.gapPx ?? 8;
  const layoutTops: number[] = [];
  let y = 0;
  for (const c of spec.cards) {
    layoutTops.push(y);
    y += c.h + gap;
  }
  const scrollHeight = Math.max(0, y - gap);
  const positionWrites: string[] = [];
  let position = spec.rowInlinePosition ?? "";
  let scrollTop = spec.scrollTop ?? 0;
  let scrollWrites = 0;
  const rowOutOfFlow = () => position === "absolute";
  const clientHeight = () =>
    spec.rowUp && !rowOutOfFlow() ? spec.windowWithRowPx : spec.windowWithoutRowPx;
  // The engine clamps on layout: reading a size forces it.
  const clamp = () => {
    scrollTop = Math.min(scrollTop, Math.max(0, scrollHeight - clientHeight()));
  };

  const columnEl = { tag: "column" } as unknown as HTMLElement;
  const stack = {
    get offsetParent() {
      return columnEl;
    },
    offsetTop: STACK_OFFSET_TOP,
    clientTop: 0,
    getBoundingClientRect: () => ({ top: SCROLLER_TOP - scrollTop }),
  } as unknown as HTMLElement & { children: HTMLElement[] };
  const foreign = { tag: "foreign" } as unknown as HTMLElement;
  const cards = spec.cards.map((c, i) => {
    const s = c.scale ?? 1;
    const layoutTop = layoutTops[i];
    return {
      get offsetParent() {
        return spec.offsetParent === "stack" ? stack : spec.offsetParent === "foreign" ? foreign : columnEl;
      },
      get offsetTop() {
        return spec.offsetParent === "stack" ? layoutTop : STACK_OFFSET_TOP + layoutTop;
      },
      offsetHeight: c.h,
      // scale(s) about the centre: the rect is s·h tall, centred on the box.
      getBoundingClientRect: () => ({
        top: SCROLLER_TOP - scrollTop + layoutTop + (c.h * (1 - s)) / 2,
        height: c.h * s,
      }),
    } as unknown as HTMLElement;
  });
  Object.defineProperty(stack, "children", { value: cards });

  const row = spec.rowUp
    ? ({
        style: {
          get position() {
            return position;
          },
          set position(v: string) {
            positionWrites.push(v);
            position = v;
          },
        },
      } as unknown as HTMLElement)
    : null;

  const scroller = {
    querySelector: (sel: string) => (sel === '[data-hud="toasts"]' && spec.cards.length > 0 ? stack : null),
    getBoundingClientRect: () => ({ top: SCROLLER_TOP }),
    get clientHeight() {
      clamp();
      return clientHeight();
    },
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      scrollWrites++;
      scrollTop = v;
      clamp();
    },
    parentElement: {
      querySelector: (sel: string) => (sel === ":scope > [data-hud-toast-more]" ? row : null),
    },
  } as unknown as HTMLElement;

  return { scroller, row, scrollWrites: () => scrollWrites, positionWrites: () => positionWrites };
}

// ---------------------------------------------------------------------------
// 1 · The row counted its own height as a cut
// ---------------------------------------------------------------------------

describe("THE FRAME: the fold row may not hold itself up (w49 pc-right 04-t090s)", () => {
  // The column below the recall pill is 119.7 px (clientHeight reads 119/120),
  // the row is 23.5 + the column's 6 px gap, the −3 summary card is 117 px.
  const frame = (): ColumnSpec => ({
    windowWithRowPx: 90,
    windowWithoutRowPx: 120,
    rowUp: true,
    cards: [{ h: 117 }],
  });

  it("the reading this replaced calls the card cut — the frame's state", () => {
    // The plain window with the row in it. MUTATION: dropping the probe from
    // `measureToastColumnFold` makes the next case return exactly this.
    expect(rowsBelowFold([{ top: 0, height: 117 }], 0, 90)).toBe(1);
  });

  it("…and with the row out of the question, the card fits: no row", () => {
    expect(measureToastColumnFold(column(frame()).scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });

  it("A BRIEFING TAKES THE FREED PIXELS BACK: the row stays, and the arithmetic proposal would not have", () => {
    // `BriefingCard` is `[flex-shrink:20]`; freeing the row's 29.5 px hands the
    // scroller ~3 of them. The round-2 proposal (`clientHeight + row + gap`)
    // would read 119.5 here, call the card whole, unmount the row, find it cut,
    // and remount it — every frame, measured in both engines.
    const col = column({ ...frame(), windowWithoutRowPx: 93 });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 1, unseenBelowFold: 0 });
    const arithmetic = 90 + 23.5 + 6;
    expect(rowsBelowFold([{ top: 0, height: 117 }], 0, arithmetic), "the sum's answer").toBe(0);
  });

  it("no row up: the plain reading, and the row is never touched", () => {
    const col = column({ windowWithRowPx: 114, windowWithoutRowPx: 114, rowUp: false, cards: [{ h: 117 }] });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 1, unseenBelowFold: 0 });
  });

  it("nothing below the fold: the probe does not run at all", () => {
    const col = column({ windowWithRowPx: 200, windowWithoutRowPx: 230, rowUp: true, cards: [{ h: 117 }] });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
    expect(col.positionWrites()).toEqual([]);
  });

  it("THE SENTENCE IS COUNTED IN THE WINDOW THE STUDENT HAS", () => {
    // Row up and still needed. The second card starts at 108: under the real
    // fold (90), inside the hypothetical one (125). Counted against 125 it
    // would be „seen", and the row would say «обяснението продължава» over a
    // whole graded fault nobody has shown the student — the direction
    // `rowsFullyBelowFold` may never round in.
    const col = column({
      windowWithRowPx: 90,
      windowWithoutRowPx: 125,
      rowUp: true,
      cards: [{ h: 100 }, { h: 40 }],
    });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 2, unseenBelowFold: 1 });
  });
});

describe("the read puts back everything it touched", () => {
  it("the row's inline position comes back as the exact string it held", () => {
    for (const before of ["", "static", "relative"]) {
      const col = column({
        windowWithRowPx: 90,
        windowWithoutRowPx: 120,
        rowUp: true,
        cards: [{ h: 117 }],
        rowInlinePosition: before,
      });
      toastScrollerHeightWithoutRow(col.scroller, col.row!);
      expect(col.positionWrites()).toEqual(["absolute", before]);
      expect(col.row!.style.position).toBe(before);
    }
  });

  it("a scroller clamped by the read gets its scrollTop back — and one that was not is not written", () => {
    // Two 117 px cards, 242 px of content, scrolled to the end of the 90 px
    // window (152). Out of flow the window is 120, the most it can scroll is
    // 122, and the engine clamps: measured 121 → 93 in both engines.
    const clamped = column({
      windowWithRowPx: 90,
      windowWithoutRowPx: 120,
      rowUp: true,
      cards: [{ h: 117 }, { h: 117 }],
      scrollTop: 150,
    });
    expect(toastScrollerHeightWithoutRow(clamped.scroller, clamped.row!)).toBe(120);
    expect(clamped.scroller.scrollTop).toBe(150);
    expect(clamped.scrollWrites()).toBe(1);

    const untouched = column({
      windowWithRowPx: 90,
      windowWithoutRowPx: 120,
      rowUp: true,
      cards: [{ h: 117 }, { h: 117 }],
      scrollTop: 40,
    });
    toastScrollerHeightWithoutRow(untouched.scroller, untouched.row!);
    expect(untouched.scroller.scrollTop).toBe(40);
    expect(untouched.scrollWrites(), "no scroll event is invented").toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2 · The entry animation was measured as a fit
// ---------------------------------------------------------------------------

describe("THE ENTRY ANIMATION: a card at scale(0.96) is measured at its layout size", () => {
  it("a 114 px card in a 111 px window is cut — on the animation's first frame too", () => {
    const col = column({
      windowWithRowPx: 111,
      windowWithoutRowPx: 111,
      rowUp: false,
      cards: [{ h: 114, scale: 0.96 }],
    });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 1, unseenBelowFold: 0 });
  });

  it("…which the transformed rect called whole — the reading this replaced", () => {
    // bottom = 114 · 0.98 = 111.72, inside 111 + 1. MUTATION: reading
    // `getBoundingClientRect().height` back in `toastCardRowsInScrollCoords`
    // makes the case above return this.
    const rect = { top: (114 * 0.04) / 2, height: 114 * 0.96 };
    expect(rowsBelowFold(listRowsInScrollCoords(0, 0, [rect]), 0, 111)).toBe(0);
  });

  it("the rows are the layout boxes, in the scroller's content coordinates", () => {
    const col = column({
      windowWithRowPx: 300,
      windowWithoutRowPx: 300,
      rowUp: false,
      cards: [{ h: 117, scale: 0.96 }, { h: 111, scale: 0.97 }],
      scrollTop: 30,
    });
    const stack = col.scroller.querySelector('[data-hud="toasts"]') as HTMLElement;
    expect(toastCardRowsInScrollCoords(col.scroller, stack)).toEqual([
      { top: 0, height: 117 },
      { top: 125, height: 111 },
    ]);
  });

  it("a stack that becomes the cards' offset parent is read stack-relative", () => {
    const col = column({
      windowWithRowPx: 300,
      windowWithoutRowPx: 300,
      rowUp: false,
      cards: [{ h: 117, scale: 0.96 }, { h: 111 }],
      offsetParent: "stack",
    });
    const stack = col.scroller.querySelector('[data-hud="toasts"]') as HTMLElement;
    expect(toastCardRowsInScrollCoords(col.scroller, stack)).toEqual([
      { top: 0, height: 117 },
      { top: 125, height: 111 },
    ]);
  });

  it("any other offset parent falls back to the rect — the pre-repair reading, never a guess", () => {
    const col = column({
      windowWithRowPx: 300,
      windowWithoutRowPx: 300,
      rowUp: false,
      cards: [{ h: 100, scale: 0.96 }],
      offsetParent: "foreign",
    });
    const stack = col.scroller.querySelector('[data-hud="toasts"]') as HTMLElement;
    const [row] = toastCardRowsInScrollCoords(col.scroller, stack);
    expect(row.height).toBeCloseTo(96, 6);
    expect(row.top).toBeCloseTo(2, 6);
  });
});

describe("the claims it may not make", () => {
  it("no stack (HudToasts renders nothing) is no fold", () => {
    const col = column({ windowWithRowPx: 90, windowWithoutRowPx: 120, rowUp: true, cards: [] });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });

  it("an unlaid scroller (0 px) is no fold, not 'everything is hidden'", () => {
    const col = column({ windowWithRowPx: 0, windowWithoutRowPx: 0, rowUp: false, cards: [{ h: 117 }] });
    expect(measureToastColumnFold(col.scroller)).toEqual({ belowFold: 0, unseenBelowFold: 0 });
  });
});

// ---------------------------------------------------------------------------
// 3 · The wiring, off the shipped source
// ---------------------------------------------------------------------------

const SHELL = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");

/** Everything this repair needs the component to do, as faults. An anchor that
 *  cannot be found is a fault too — a matcher that cannot read its source must
 *  say so rather than pass. */
function wiringFaults(src: string): string[] {
  const faults: string[] = [];
  const cbAt = src.indexOf("const measureToastFold = useCallback(");
  if (cbAt < 0) return ["anchor: `const measureToastFold = useCallback(` is gone"];
  const cbEnd = src.indexOf("}, []);", cbAt);
  if (cbEnd < 0) return ["anchor: measureToastFold's `}, []);` is gone"];
  const cb = src.slice(cbAt, cbEnd);
  if (!/const fold = measureToastColumnFold\(el\);/.test(cb)) faults.push("measureToastFold does not read measureToastColumnFold(el)");
  if (!/setToastsBelowFold\(fold\.belowFold\);/.test(cb)) faults.push("belowFold is not stored from the reading");
  if (!/setToastsUnseenBelowFold\(fold\.unseenBelowFold\);/.test(cb)) faults.push("unseenBelowFold is not stored from the reading");
  if (/getBoundingClientRect/.test(cb)) faults.push("measureToastFold reads a transformed rect again");

  const fnAt = src.indexOf("export function measureToastColumnFold(");
  if (fnAt < 0) return [...faults, "anchor: `export function measureToastColumnFold(` is gone"];
  const fn = src.slice(fnAt, src.indexOf("\n}\n", fnAt));
  if (!/toastCardRowsInScrollCoords\(scroller, stack\)/.test(fn)) faults.push("the rows are not the layout reading");
  if (!/toastScrollerHeightWithoutRow\(scroller, row\)/.test(fn)) faults.push("the row is not taken out of the question");
  if (!/\[data-hud-toast-more\]/.test(fn)) faults.push("the reading no longer finds the fold row");

  const rowsAt = src.indexOf("export function toastCardRowsInScrollCoords(");
  const rows = rowsAt < 0 ? "" : src.slice(rowsAt, src.indexOf("\n}\n", rowsAt));
  if (rowsAt < 0) faults.push("anchor: `export function toastCardRowsInScrollCoords(` is gone");
  // BOTH offset-parent branches — the first draft of this matcher looked for one
  // occurrence, and a mutation of the common branch alone passed it.
  else if ((rows.match(/height: card\.offsetHeight/g) ?? []).length !== 2)
    faults.push("card heights are not offsetHeight in both layout branches");

  const probeAt = src.indexOf("export function toastScrollerHeightWithoutRow(");
  const probe = probeAt < 0 ? "" : src.slice(probeAt, src.indexOf("\n}\n", probeAt));
  if (probeAt < 0) faults.push("anchor: `export function toastScrollerHeightWithoutRow(` is gone");
  else {
    if (!/row\.style\.position = "absolute";/.test(probe)) faults.push("the row is not taken out of flow for the read");
    if (!/row\.style\.position = position;/.test(probe)) faults.push("the row's inline position is not put back");
    if (!/scroller\.scrollTop = scrollTop;/.test(probe)) faults.push("a clamped scrollTop is not put back");
  }

  if (!/const toastsShownCount = visibleToasts\(toasts, toastsQuiet\)\.length;/.test(src))
    faults.push("toastsShownCount is not HudToasts' own visibleToasts rule");
  const importAt = src.indexOf('} from "@/modules/sim/hud";');
  const importStart = src.lastIndexOf("import {", importAt);
  if (importAt < 0 || importStart < 0 || !/\bvisibleToasts,/.test(src.slice(importStart, importAt)))
    faults.push("visibleToasts is not imported from the hud barrel");

  const scAt = src.indexOf('data-hud-toast-scroller=""');
  const hudAt = src.indexOf("<HudToasts", scAt);
  if (scAt < 0 || hudAt < 0) return [...faults, "anchor: the scroller or its <HudToasts> is gone"];
  const decls = src.slice(scAt, hudAt);
  if (!/toastsBelowFold > 0 && toastsShownCount > 0\s*\?/.test(decls))
    faults.push("the fade is not gated on a card being shown");
  const moreAt = src.indexOf('data-hud-toast-more=""', hudAt);
  if (moreAt < 0) return [...faults, "anchor: the fold row is gone"];
  const beforeRow = src.slice(src.indexOf("</div>", hudAt), moreAt);
  if (!/\{toastsBelowFold > 0 && toastsShownCount > 0 \? \(/.test(beforeRow))
    faults.push("the fold row is not gated on a card being shown");
  return faults;
}

describe("THE WIRING: the component stores the reading, and the row leaves with the last card", () => {
  it("LessonPlayShell.tsx as it is in the tree: no faults", () => {
    expect(wiringFaults(SHELL)).toEqual([]);
  });

  const mutations: ReadonlyArray<[name: string, from: string | RegExp, to: string]> = [
    ["the callback goes back to its own rect reading", "const fold = measureToastColumnFold(el);", "const fold = { belowFold: 0, unseenBelowFold: 0 };"],
    ["belowFold is dropped", "setToastsBelowFold(fold.belowFold);", "setToastsBelowFold(0);"],
    ["the probe is removed", "toastScrollerHeightWithoutRow(scroller, row)", "scroller.clientHeight"],
    ["the rows read transformed rects", "toastCardRowsInScrollCoords(scroller, stack)", "[]"],
    ["heights come from the rect", "height: card.offsetHeight };\n      }\n      if (card.offsetParent === stack)", "height: card.getBoundingClientRect().height };\n      }\n      if (card.offsetParent === stack)"],
    ["the row's position is never restored", "row.style.position = position;", "void position;"],
    ["the clamp is not undone", "if (scroller.scrollTop !== scrollTop) scroller.scrollTop = scrollTop;", "void scrollTop;"],
    ["the shown count is invented", "const toastsShownCount = visibleToasts(toasts, toastsQuiet).length;", "const toastsShownCount = toasts.length;"],
    ["the fade forgets the last card", /toastsBelowFold > 0 && toastsShownCount > 0\n(\s*)\? \{/, "toastsBelowFold > 0\n$1? {"],
    ["the row forgets the last card", "{toastsBelowFold > 0 && toastsShownCount > 0 ? (", "{toastsBelowFold > 0 ? ("],
    ["the import goes", "  visibleToasts,\n  withSheetLocatorBg,", "  withSheetLocatorBg,"],
  ];
  for (const [name, from, to] of mutations) {
    it(`MUTATION — ${name}: the guard turns red`, () => {
      const mutated = typeof from === "string" ? SHELL.replace(from, to) : SHELL.replace(from, to);
      expect(mutated, `the mutation «${name}» did not apply — re-anchor it`).not.toBe(SHELL);
      expect(wiringFaults(mutated).length).toBeGreaterThan(0);
    });
  }
});
