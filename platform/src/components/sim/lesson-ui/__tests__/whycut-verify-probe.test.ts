/**
 * THE ROUND-1 VERIFIER'S PROBE, KEPT AS THE ROUND-2 ACCEPTANCE TEST —
 * sc-roundabout-entry:fe081cf1, lane whycut (2026-10-13).
 *
 * WHERE IT CAME FROM. `D:/knijka-lanes/scratch/whycut-verify/zz-whycut-verify
 * .test.ts`, the adversarial verifier's own file: 20 rows, 8 of them RED on the
 * round-1 patch. It mounts the real `useToastReader` on a stand-in for the
 * shell's roomy column whose sizes come from the product's own arithmetic
 * (`notifyColumnTopPx`, `notifyColumnCapPx`) and whose lengths are the rig-w3d
 * sidecar's (`pc-L3-F-ON-WHY.json`, Chromium 1440 × 900, 8cb0707):
 *   banner one line 260.5→309.2 (48.7) · pinned 260.5→336.7 (76.2)
 *   advisor card 342.7→441 (98.3) · recall pill 23.5 · column gap 6
 *   fold row 704.5→728 (23.5) · stack gap 8
 *   opened card 295.5 (body 66.5→264.5, law chip foot 291.5 from its top)
 *   summary card 116.5 · column 260.5→728 (467.5)
 *
 * WHAT WAS CHANGED TO KEEP IT, AND WHY — every change, so a reader can hold
 * this file against the verifier's:
 *
 *   A · THE STAND-IN LAYS THE OPENED CARD OUT AS THE BROWSER NOW DOES. The
 *       verifier's card was a rigid 295.5 px box. Since round 2 (integrator
 *       decision W2) the card being read is a flex column that shrinks to the
 *       window and scrolls its body between a pinned title and a pinned law
 *       chip; the stand-in's `laidOut` models that, and its two constants
 *       (pinned rows 97.5 px, one-line floor 16.5 px) are the sidecar's and
 *       `HudToasts.TOAST_READ_FLOOR_PX`. The model was held against real
 *       layout before it was trusted: the product's markup and compiled CSS in
 *       Chromium AND WebKit (`scratch/whycut-impl/r2/spike/`, 2026-10-13) give
 *       237.8 px / body 140 of 198 on the 650 stage, 283.0 / 185 of 198 at
 *       1366 × 768, 295.5 / 198 of 198 on the rig stage — the numbers §V0b
 *       holds this stand-in to.
 *   B · THE BANNER UNDER A HOLD GOES TO ONE LINE when the reader says so
 *       (`bannerYields` → `ObjectiveBanner`'s `oneLine`): the stand-in's pinned
 *       76.2 px banner is then the sidecar's one-line 48.7 (counter line, one
 *       line of the sentence, progress bar).
 *   C · THE HOOK'S INPUTS. `rowNeededForOthers` is gone (no other card is on
 *       the glass while one is read) and `holdOlderThan` is `holdAllBut`.
 *   D · TWO ROWS ARE RESTATED, because as written they are arithmetic about
 *       numbers round 2 is not allowed to move:
 *         – «on the 650 stage the column can hold this card with only the
 *           one-line banner standing» (267.3 ≥ 294.5). It cannot, and the
 *           integrator's W2 says what happens instead; the row now holds the
 *           267.3 AND that outcome.
 *         – «the lesson's own end does not come before the reading time is
 *           up» (10 084 ≥ 23 767). `CRASH_PIN_STUCK_S` is a graded clock; the
 *           row now holds that it has NOT moved and that the end OVERLAY
 *           waits (W3), through the product's own predicate and queue.
 *   E · ROWS ADDED: the six stages plus the phone, the paging to the last
 *       sentence, the «+N» count, the hold on every other card's clock.
 *
 * The other six red rows assert what they asserted, word for word
 * (`expect(at.fit).toBe("whole")`, `lawChipOutPx === 0`, `≤ 768`,
 * `painted.toHaveLength(1)`).
 *
 * NODE ARITHMETIC OVER A STAND-IN — NOT A DEVICE. What a student sees is owed
 * to the rig; the cells are named in the lane report.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudEvent, LessonSpec } from "../../../../modules/sim/contracts";
import {
  TOAST_FIT_SLACK_PX,
  TOAST_MORE_SELECTOR,
  TOAST_READ_ATTR,
  TOAST_READ_FLOOR_PX,
  TOAST_WHY_ATTR,
  toastCardInWindow,
  toastReadMs,
  useHudToastQueue,
  useToastReader,
} from "../../../../modules/sim/hud/HudToasts";
import {
  shouldShowDebrief,
  shouldShowEndBar,
  visibleToasts,
  waitingToasts,
} from "../../../../modules/sim/hud/hudPreferences";
import { notifyColumnTopPx } from "../../../../modules/sim/hud/notifyColumn";
import { mountHook } from "../../../../modules/sim/hud/__tests__/hookHarness";
import { CRASH_PIN_STUCK_S } from "../../../../modules/sim/lessons/finish";
import { applyTick, createLessonSession } from "../../../../modules/sim/lessons/engine";
import { tickWithEvents } from "../../../../modules/sim/lessons/__tests__/fixtures";
import { makeViolation, violationPeekBg, VIOLATIONS } from "../../../../modules/sim/rules";
import { COMPACT_MAX_HEIGHT_PX, isCompactViewport } from "../immersive";
import {
  notifyColumnCapPx,
  pageToastRead,
  teachMomentOneLinerBg,
  teachMomentPeekBg,
  toastPageScrollTop,
  toastReadContinues,
} from "../LessonPlayShell";

afterEach(() => {
  vi.restoreAllMocks();
});

const RIG = {
  gap: 6,
  stackGap: 8,
  bannerOneLine: 48.7,
  bannerPinned: 76.2,
  advisor: 98.3,
  pill: 23.5,
  row: 23.5,
  summary: 116.5,
  opened: 295.5,
  bodyTop: 66.5,
  bodyFoot: 264.5,
  lawFoot: 291.5,
  /** stage top bar in the rig's immersive harness: 900 − stage height (cap 467.5 ⇒ 0.76·H − 172 = 467.5 ⇒ H = 841.45). */
  stageH: (467.5 + 172) / 0.76,
} as const;
const TOP_BAR = 900 - RIG.stageH;
/** The card's rows that keep their height while it is read: everything but the body box. */
const PINNED = RIG.opened - (RIG.bodyFoot - RIG.bodyTop);
/** The law chip's foot stands this far above the card's own foot (the card's `py-1`). */
const LAW_FOOT_FROM_CARD_FOOT = RIG.opened - RIG.lawFoot;

/** Stages the product has. `h` is the `[data-sim-stage]` height. */
const STAGES: Array<{ name: string; h: number; how: string }> = [
  { name: "rig cell — immersive, 1440×900 viewport", h: RIG.stageH, how: "measured (sidecar): column 467.5" },
  {
    name: "REAL /simulator, not fullscreen, 1440×900 window (stage 1165×650)",
    h: 650,
    how: "the product's own measurement — LessonPlayShell «MEASURED ON THE SWEEP'S OWN STAGE (1165 × 650 at 1440 × 900 ?chrome=dashboard …)», hud-ux-client «reproduces the REAL /simulator geometry»",
  },
  { name: "immersive, 1366×768 viewport", h: 768 - TOP_BAR, how: "derived: viewport − the rig's 58.55 px top bar" },
  { name: "immersive, 1536×864 viewport (1080p laptop at 125 %)", h: 864 - TOP_BAR, how: "derived, same" },
  { name: "immersive, 1440×800 viewport", h: 800 - TOP_BAR, how: "derived, same" },
  { name: "immersive, 1920×1080 viewport", h: 1080 - TOP_BAR, how: "derived, same" },
];

function capOf(stageH: number): number {
  return notifyColumnCapPx(stageH, notifyColumnTopPx({ width: (stageH * 16) / 9, height: stageH }, false));
}

// ── a stand-in for the roomy column, laid out as the flex column lays it out ──
class El {
  attrs: Record<string, string> = {};
  parentElement: El | null = null;
  children: El[] = [];
  style: Record<string, string> = { position: "" };
  offsetParent: El | null = null;
  clientTop = 0;
  scrollTop = 0;
  topFn: () => number = () => 0;
  heightFn: () => number = () => 0;
  clientFn: () => number = () => 0;
  scrollFn: () => number = () => 0;
  get offsetTop() {
    return Math.round(this.topFn());
  }
  get offsetHeight() {
    return Math.round(this.heightFn());
  }
  get clientHeight() {
    return Math.round(this.clientFn());
  }
  get scrollHeight() {
    return Math.round(this.scrollFn());
  }
  getAttribute(n: string) {
    return n in this.attrs ? this.attrs[n]! : null;
  }
  add(c: El) {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  querySelector(sel: string): El | null {
    const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (m === null) throw new Error(`cannot answer ${sel}`);
    const walk = (el: El): El | null => {
      for (const c of el.children) {
        const v = c.getAttribute(m[1]!);
        if (v !== null && (m[2] === undefined || v === m[2])) return c;
        const d = walk(c);
        if (d !== null) return d;
      }
      return null;
    };
    return walk(this);
  }
}

interface Card {
  id: number;
  px: number;
  why?: "open" | "closed";
  kind?: "violation" | "lesson" | "commendation";
}

function makeColumn(init: {
  capPx: number;
  bannerPx: number;
  advisorPrompt: boolean;
  pill: boolean;
  cards: Card[];
  quiet?: boolean;
}) {
  const s = { quiet: false, ...init, rowUp: false, reader: null as null | ReturnType<typeof useToastReader> };
  const advisorMounted = () => s.advisorPrompt && s.reader?.held !== true;
  // (B) the banner set on one line is the sidecar's one-line banner.
  const bannerPx = () => (s.reader?.bannerYields === true ? Math.min(s.bannerPx, RIG.bannerOneLine) : s.bannerPx);
  const events = () =>
    s.cards.map((c) => ({ ...c, event: { kind: c.kind ?? (c.why === undefined ? "lesson" : "violation") } }));
  const painted = () => visibleToasts(events(), s.quiet, s.reader?.reading ?? null);
  const readId = () => {
    const reading = s.reader?.reading ?? null;
    return reading !== null && painted().some((c) => c.id === reading.id) ? reading.id : null;
  };
  const above = () =>
    bannerPx() + RIG.gap + (advisorMounted() ? RIG.advisor + RIG.gap : 0) + (s.pill ? RIG.pill + RIG.gap : 0);
  const naturalContent = () => {
    const c = painted();
    return c.reduce((a, x) => a + x.px, 0) + RIG.stackGap * Math.max(0, c.length - 1);
  };
  /** The shell's scroller: its content's natural height, shrunk to what the column has left. */
  const windowPx = (withRow: boolean) =>
    Math.max(0, Math.min(naturalContent(), s.capPx - above() - (withRow ? RIG.gap + RIG.row : 0)));
  /** (A) The card being read shrinks to the window, down to its pinned rows plus one body line. */
  const laidOut = (c: Card, withRow: boolean) =>
    c.id === readId() ? Math.max(PINNED + TOAST_READ_FLOOR_PX, Math.min(c.px, windowPx(withRow))) : c.px;
  const rowInFlow = (row: El) => s.rowUp && row.style.position !== "absolute";

  const columnEl = new El();
  const scroller = columnEl.add(new El());
  const stack = scroller.add(new El());
  stack.attrs["data-hud"] = "toasts";
  const row = new El();
  row.attrs[TOAST_MORE_SELECTOR.slice(1, -1)] = "";
  scroller.offsetParent = columnEl;
  scroller.topFn = above;
  scroller.clientFn = () => windowPx(rowInFlow(row));
  scroller.scrollFn = () => painted().reduce((a, c, i) => a + laidOut(c, rowInFlow(row)) + (i > 0 ? RIG.stackGap : 0), 0);
  let readBox: El | null = null;
  const commit = () => {
    // the body box keeps its scroll position across a re-render, as the DOM node does
    const keptTop = readBox === null ? 0 : (readBox as El).scrollTop;
    stack.children = [];
    readBox = null;
    columnEl.children = s.rowUp ? [scroller, row] : [scroller];
    row.parentElement = s.rowUp ? columnEl : null;
    const cards = painted();
    cards.forEach((c, i) => {
      const el = stack.add(new El());
      el.offsetParent = columnEl;
      el.topFn = () =>
        above() + cards.slice(0, i).reduce((a, x) => a + laidOut(x, rowInFlow(row)) + RIG.stackGap, 0);
      el.heightFn = () => laidOut(c, rowInFlow(row));
      if (c.why !== undefined) {
        const box = el.add(new El());
        if (c.id === readId()) {
          box.attrs[TOAST_READ_ATTR] = "";
          box.clientFn = () => laidOut(c, rowInFlow(row)) - PINNED;
          box.scrollFn = () => Math.max(c.px, laidOut(c, rowInFlow(row))) - PINNED;
          box.scrollTop = keptTop;
          readBox = box;
        }
        box.add(new El()).attrs[TOAST_WHY_ATTR] = c.why;
      }
    });
  };
  /** The shell's fold count with the row out of flow (`measureToastColumnFold`): is any painted
   *  card not readable to its last line — past the scroller's foot, or past its own body box's? */
  const foldNeeded = () => {
    let top = 0;
    for (const c of painted()) {
      const h = laidOut(c, false);
      if (top + h > windowPx(false) + TOAST_FIT_SLACK_PX) return true;
      if (c.id === readId()) {
        const box = { scrollTop: readBox === null ? 0 : readBox.scrollTop, clientHeight: h - PINNED, scrollHeight: Math.max(c.px, h) - PINNED };
        if (toastReadContinues(box)) return true;
      }
      top += h + RIG.stackGap;
    }
    return false;
  };
  const where = (id: number) => {
    let top = 0;
    for (const c of painted()) {
      const h = laidOut(c, s.rowUp);
      if (c.id === id) {
        const w = windowPx(s.rowUp);
        const read = c.id === readId();
        return {
          topInWindow: top,
          window: w,
          cardPx: h,
          fit: toastCardInWindow(top, h, w),
          cutPx: Math.max(0, top + h - w),
          // A read card's law chip rides the card's own foot; a rigid card's stands where it always did.
          lawChipOutPx: Math.max(0, top + (read ? h - LAW_FOOT_FROM_CARD_FOOT : RIG.lawFoot) - w),
          bodyShownPx: read ? h - PINNED : RIG.bodyFoot - RIG.bodyTop,
          bodyHiddenPx: read ? Math.max(0, c.px - h) : Math.max(0, top + RIG.bodyFoot - w),
          scrollsInside: read && c.px - h > TOAST_FIT_SLACK_PX,
        };
      }
      top += h + RIG.stackGap;
    }
    return null;
  };
  return { s, scroller, commit, foldNeeded, where, advisorMounted, painted, bannerPx, readBox: () => readBox, events };
}

function runReader(col: ReturnType<typeof makeColumn>) {
  const calls = { why: [] as Array<[number, boolean]>, hold: [] as Array<number | null> };
  const m = mountHook(
    () => {
      const reader = useToastReader({
        toasts: col.s.cards,
        scroller: { current: col.scroller as unknown as HTMLElement },
        whyChanged: (id, open) => calls.why.push([id, open]),
        holdAllBut: (id) => calls.hold.push(id),
      });
      col.s.reader = reader;
      col.commit();
      return reader;
    },
    { globals: { HTMLElement: El } },
  );
  const settle = () => {
    for (let i = 0; i < 5; i += 1) {
      m.settle(1);
      col.s.rowUp = col.foldNeeded();
    }
    return m.settle(1);
  };
  return { m, calls, settle };
}

/** «покажи», pressed until the row has nothing left to announce — the shell's own pager on the stand-in. */
function pageToTheEnd(col: ReturnType<typeof makeColumn>, r: ReturnType<typeof runReader>) {
  let presses = 0;
  while (col.s.rowUp && presses < 40) {
    // the shell's own handler, line for line (`revealMoreToasts`)
    const el = col.scroller as unknown as HTMLElement;
    if (!pageToastRead(el)) el.scrollTop = toastPageScrollTop(el.scrollTop, el.clientHeight, el.scrollHeight);
    presses += 1;
    col.s.rowUp = col.foldNeeded();
    r.m.settle(1);
  }
  const box = col.readBox();
  return {
    presses,
    leftPx: box === null ? 0 : box.scrollHeight - box.clientHeight - box.scrollTop,
  };
}

/** The rig cell's own moment: «ЗАЩО» open on the fault card, then the crash pins the car
 *  (banner three lines) and the advisor posts its recovery card. */
function crashPinnedCell(stageH: number, openedPx: number = RIG.opened) {
  const col = makeColumn({
    capPx: capOf(stageH),
    bannerPx: RIG.bannerPinned,
    advisorPrompt: true,
    pill: true,
    cards: [{ id: 1, px: openedPx, why: "open" }],
  });
  const r = runReader(col);
  r.m.value.onWhyChange(1, true);
  const reader = r.settle();
  const at = col.where(1)!;
  const rowUp = col.s.rowUp;
  const paged = pageToTheEnd(col, r);
  const atEnd = col.where(1)!;
  r.m.unmount();
  return { reader, at, atEnd, paged, advisorMounted: col.advisorMounted(), rowUp, cap: col.s.capPx, bannerPx: col.bannerPx() };
}

// ═════════════════════════════════════════════════════════════════════════════
describe("V0 the stand-in is the rig's column", () => {
  it("the product's cap arithmetic gives the sidecar's 467.5 px column at the rig stage, and 322 on the 1165×650 stage", () => {
    expect(capOf(RIG.stageH)).toBeCloseTo(467.5, 1);
    expect(notifyColumnTopPx({ width: 1165, height: 650 }, false)).toBe(164);
    expect(capOf(650)).toBe(322);
  });

  it("BASE BEHAVIOUR reproduced with no reader: window 222 with the row, the opened card cut 73.5, body 42.5, law chip 69.5", () => {
    const col = makeColumn({
      capPx: 467.5,
      bannerPx: RIG.bannerPinned,
      advisorPrompt: true,
      pill: true,
      cards: [{ id: 1, px: RIG.opened, why: "open" }],
    });
    col.s.rowUp = true;
    col.commit();
    const at = col.where(1)!;
    expect(at.window).toBeCloseTo(222, 1);
    expect(at.cutPx).toBeCloseTo(73.5, 1);
    expect(at.bodyHiddenPx).toBeCloseTo(42.5, 1);
    expect(at.lawChipOutPx).toBeCloseTo(69.5, 1);
  });
});

describe("V0b (A) the stand-in's read card is the card real browsers laid out — r2 spike, Chromium and WebKit", () => {
  // scratch/whycut-impl/r2/spike/spike.json, 2026-10-13: the product's markup and compiled CSS, the
  // one-line banner (48.7) and the pill (23.5) above the scroller, column capped at the stage's cap.
  const SPIKE: Array<{ stage: string; h: number; row: boolean; cardPx: number; bodyShown: number }> = [
    { stage: "rig 1440×900", h: RIG.stageH, row: false, cardPx: 295.5, bodyShown: 198 },
    { stage: "/simulator 650", h: 650, row: false, cardPx: 237.81, bodyShown: 140 },
    { stage: "/simulator 650, fold row up", h: 650, row: true, cardPx: 208.31, bodyShown: 111 },
    { stage: "immersive 1366×768", h: 768 - TOP_BAR, row: false, cardPx: 282.98, bodyShown: 185 },
    { stage: "immersive 1366×768, fold row up", h: 768 - TOP_BAR, row: true, cardPx: 253.48, bodyShown: 156 },
    { stage: "immersive 1440×800, fold row up", h: 800 - TOP_BAR, row: true, cardPx: 277.81, bodyShown: 180 },
  ];
  for (const m of SPIKE) {
    it(`${m.stage}: card ${m.cardPx} px, ${m.bodyShown} px of the 198 px paragraph on the glass, law chip in`, () => {
      const col = makeColumn({
        capPx: capOf(m.h),
        bannerPx: RIG.bannerOneLine,
        advisorPrompt: false,
        pill: true,
        cards: [{ id: 1, px: RIG.opened, why: "open" }],
      });
      const r = runReader(col);
      r.m.value.onWhyChange(1, true);
      r.m.settle(1);
      col.s.rowUp = m.row;
      r.m.settle(1);
      const at = col.where(1)!;
      r.m.unmount();
      expect(at.cardPx).toBeCloseTo(m.cardPx, 0);
      expect(Math.abs(at.bodyShownPx - m.bodyShown)).toBeLessThanOrEqual(1);
      expect(at.fit).toBe("whole");
      expect(at.lawChipOutPx).toBe(0);
    });
  }
});

describe("V1 BUILDER CLAIM — at the rig's stage the hold makes the paragraph whole", () => {
  it("1440×900 immersive: the hold is taken, the advisor waits, the card and its law chip are whole, no fold row", () => {
    const r = crashPinnedCell(RIG.stageH);
    expect(r.reader.held).toBe(true);
    expect(r.advisorMounted).toBe(false);
    expect(r.at.fit).toBe("whole");
    expect(r.at.lawChipOutPx).toBe(0);
    expect(r.rowUp).toBe(false);
    // round 2: at its natural height, not scrolling — and the banner KEEPS its recovery order.
    expect(r.at.cardPx).toBe(RIG.opened);
    expect(r.at.scrollsInside).toBe(false);
    expect(r.reader.bannerYields).toBe(false);
    expect(r.bannerPx).toBe(RIG.bannerPinned);
  });
});

describe("V2 STOP RULE (a) — the opened explanation of the row's OWN fault, at every stage the product has", () => {
  for (const stage of STAGES) {
    it(`${stage.name} [stage ${stage.h.toFixed(1)} px — ${stage.how}]: the 295.5 px opened card is whole with its law chip`, () => {
      const r = crashPinnedCell(stage.h);
      const report = `cap ${r.cap.toFixed(1)} · window ${r.at.window.toFixed(1)} · held ${r.reader.held} · banner yields ${r.reader.bannerYields} (${r.bannerPx}) · advisor mounted ${r.advisorMounted} · fold row ${r.rowUp} · card ${r.at.cardPx.toFixed(1)} of ${RIG.opened} · cut ${r.at.cutPx.toFixed(1)} · body shown ${r.at.bodyShownPx.toFixed(1)} hidden ${r.at.bodyHiddenPx.toFixed(1)} · law chip out ${r.at.lawChipOutPx.toFixed(1)} · «покажи» ×${r.paged.presses} leaves ${r.paged.leftPx}`;
      console.log(`[V2] ${stage.name}: ${report}`);
      // — the verifier's two assertions, as written —
      expect(r.at.fit, report).toBe("whole");
      expect(r.at.lawChipOutPx, report).toBe(0);
      // — W2's definition of whole, each half of it —
      // a paragraph that does not fit is ANNOUNCED (never a silent cut) …
      expect(r.rowUp, report).toBe(r.at.scrollsInside);
      // … every sentence of it is REACHABLE with the row's own control …
      expect(r.paged.leftPx, report).toBeLessThanOrEqual(TOAST_FIT_SLACK_PX);
      // … and the law chip is on the glass at the end of the paging as at its start.
      expect(r.atEnd.fit, report).toBe("whole");
      expect(r.atEnd.lawChipOutPx, report).toBe(0);
    });
  }

  it("(D, RESTATED) on the REAL /simulator stage (650) even the bare column cannot hold this card — so its body scrolls INSIDE it, law chip pinned", () => {
    const roomWithBannerOnly = capOf(650) - RIG.bannerOneLine - RIG.gap;
    console.log(`[V2] 650 stage, banner only: ${roomWithBannerOnly.toFixed(1)} px for a ${RIG.opened} px card`);
    // The verifier's row asked for room ≥ 294.5 here. The room is what it is:
    expect(roomWithBannerOnly).toBeCloseTo(267.3, 1);
    expect(roomWithBannerOnly).toBeLessThan(RIG.opened - TOAST_FIT_SLACK_PX);
    // …and this is what the student gets instead of a cut (integrator decision W2):
    const r = crashPinnedCell(650);
    expect(r.reader.held).toBe(true);
    expect(r.reader.bannerYields).toBe(true);
    expect(r.advisorMounted).toBe(false);
    expect(r.at.scrollsInside).toBe(true);
    expect(r.at.fit).toBe("whole");
    expect(r.at.lawChipOutPx).toBe(0);
    expect(r.rowUp).toBe(true);
    expect(r.at.bodyShownPx).toBeGreaterThanOrEqual(6 * 16.5); // six whole lines of the twelve at a time
    expect(r.paged.leftPx).toBeLessThanOrEqual(TOAST_FIT_SLACK_PX);
  });

  it("the smallest immersive viewport height at which the rig cell's opened card is whole after the hold", () => {
    // whole in W2's sense — title and law chip pinned, the paragraph reachable inside
    let vh = 600;
    while (crashPinnedCell(vh - TOP_BAR).at.fit !== "whole" && vh < 1200) vh += 1;
    console.log(`[V2] smallest immersive viewport height that holds the row's card whole: ${vh} px`);
    expect(vh, "a 1366×768 laptop, fullscreen, must be enough").toBeLessThanOrEqual(768);
    // …and stated beside it, the height from which nothing has to scroll at all:
    let natural = 600;
    while (crashPinnedCell(natural - TOP_BAR).at.scrollsInside && natural < 1200) natural += 1;
    console.log(`[V2] smallest immersive viewport height at which the paragraph does not scroll: ${natural} px`);
    // 0.76·H − 172 − (48.7 + 6) − (23.5 + 6) ≥ 294.5 ⇒ H ≥ 724.6 ⇒ viewport ≥ 783.2
    expect(natural).toBe(784);
  });

  it("(E) THE PHONE — a sideways phone is compact, the roomy column is not on its glass, and «Защо» there is the paused sheet", () => {
    // 852 × 393, the profile the sweep and the rig drive.
    expect(393).toBeLessThanOrEqual(COMPACT_MAX_HEIGHT_PX);
    expect(isCompactViewport(852, 393, true)).toBe(true);
    const shell = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
    // the roomy column (this file's whole subject) is hidden on compact, and its toast stack is not mounted …
    expect(shell).toMatch(/data-hud="notify-column"[\s\S]{0,200}compact \? "hidden" : ""/);
    expect(shell).toContain("{compact ? null : (");
    // … the phone's «Защо» opens `SimOverlay`'s sheet, and an open sheet stops the drive (and with it
    // the graded clock that ends a pinned lesson), so nothing there is on a reading clock.
    expect(shell).toContain("onOpenChange={setOverlaySheetOpen}");
    expect(shell).toMatch(/overlaySheetOpen \|\|/);
    // and the debrief's wait is the roomy leg's only: `reading` is false on compact by construction.
    expect(shell).toContain("reading: !compact && toastReader.reading !== null,");
  });
});

describe("V3 STOP RULE (a) — a second fault arrives while the first one's «ЗАЩО» is open (the rig's SC2 re-strike)", () => {
  function sc2(stageH: number, quiet = false) {
    const col = makeColumn({
      capPx: capOf(stageH),
      bannerPx: RIG.bannerPinned,
      advisorPrompt: true,
      pill: true,
      quiet,
      cards: [
        { id: 2, px: RIG.summary, why: "closed" },
        { id: 1, px: RIG.opened, why: "open" },
      ],
    });
    const r = runReader(col);
    r.m.value.onWhyChange(1, true);
    const reader = r.settle();
    const at = col.where(1)!;
    const out = {
      reader,
      at,
      painted: col.painted().map((c) => c.id),
      waiting: waitingToasts(col.events(), quiet, reader.reading),
      advisor: col.advisorMounted(),
      rowUp: col.s.rowUp,
      calls: r.calls,
    };
    r.m.unmount();
    return out;
  }

  it("rig stage 1440×900: the opened card pushed down by the newer summary card is still whole with its law chip", () => {
    const r = sc2(RIG.stageH);
    const report = `held ${r.reader.held} · advisor ${r.advisor} · row ${r.rowUp} · window ${r.at.window.toFixed(1)} · top ${r.at.topInWindow} · cut ${r.at.cutPx.toFixed(1)} · body hidden ${r.at.bodyHiddenPx.toFixed(1)} · law chip out ${r.at.lawChipOutPx.toFixed(1)} · painted ${JSON.stringify(r.painted)} · waiting +${r.waiting}`;
    console.log(`[V3] ${report}`);
    // — the verifier's assertion, as written —
    expect(r.at.fit, report).toBe("whole");
    // — and how: it is NOT pushed. The newer fault waits, counted, with its clock stopped. —
    expect(r.at.topInWindow, report).toBe(0);
    expect(r.at.lawChipOutPx, report).toBe(0);
    expect(r.painted, report).toEqual([1]);
    expect(r.waiting, report).toBe(1);
    expect(r.calls.hold[r.calls.hold.length - 1], report).toBe(1);
  });

  for (const stage of STAGES) {
    it(`${stage.name}: the re-strike never displaces the opened card, never cuts it, and is counted`, () => {
      const r = sc2(stage.h);
      expect(r.at.topInWindow).toBe(0);
      expect(r.at.fit).toBe("whole");
      expect(r.at.lawChipOutPx).toBe(0);
      expect(r.rowUp).toBe(r.at.scrollsInside);
      expect(r.painted).toEqual([1]);
      expect(r.waiting).toBe(1);
    });
  }

  it("QUIET MODE, the same sequence: one card on the glass, the newer fault behind the count", () => {
    const r = sc2(RIG.stageH, true);
    expect(r.painted).toEqual([1]);
    expect(r.waiting).toBe(1);
    expect(r.at.fit).toBe("whole");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
function staticObjectEvent(): Extract<HudEvent, { kind: "violation" }> {
  const v = makeViolation("COLLISION", 50.68, { detail: "staticObject" });
  const peek = violationPeekBg("COLLISION", "staticObject");
  return {
    kind: "violation",
    titleBg: v.titleBg,
    explanationBg: v.explanationBg,
    points: v.points,
    severity: v.severityClass,
    lawRef: v.lawRef,
    ...(peek === null ? {} : { peekBg: peek }),
  };
}

describe("V4 the life after the press", () => {
  it("BUILDER CLAIM: raised at 0, pressed at +2 233 → the queue's clock runs to +23 767 (323 chars at 15/s)", () => {
    const at = { now: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => at.now);
    const m = mountHook(() => useHudToastQueue());
    m.value.push([staticObjectEvent()]);
    const id = m.rerender().toasts[0]!.id;
    expect(m.timers.map((t) => t.ms)).toEqual([8000]);
    at.now = 2233;
    m.value.whyChanged(id, true);
    expect(m.timers).toHaveLength(1);
    expect(at.now + m.timers[0]!.ms).toBe(2233 + toastReadMs(323));
    expect(2233 + toastReadMs(323)).toBe(23767);
    m.unmount();
  });

  it("an UN-pressed card keeps the 8 s it always had (no regression)", () => {
    const at = { now: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => at.now);
    const m = mountHook(() => useHudToastQueue());
    m.value.push([staticObjectEvent()]);
    expect(m.timers.map((t) => t.ms)).toEqual([8000]);
    m.tick();
    expect(m.rerender().toasts).toHaveLength(0);
    m.unmount();
  });

  it("the HELD card's own clock is never stopped by its own hold, and never restarted by it", () => {
    const at = { now: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => at.now);
    const m = mountHook(() => useHudToastQueue());
    m.value.push([staticObjectEvent()]);
    const id = m.rerender().toasts[0]!.id;
    at.now = 2233;
    m.value.whyChanged(id, true);
    const armed = m.timers[0]!.id;
    at.now = 5033;
    m.value.holdAllBut(id);
    expect(m.timers).toHaveLength(1);
    expect(m.timers[0]!.id).toBe(armed);
    at.now = 9000;
    m.value.holdAllBut(null);
    expect(m.timers).toHaveLength(1);
    expect(m.timers[0]!.id).toBe(armed);
    m.unmount();
  });

  it("(D, RESTATED) IN THE RIG CELL the lesson ends where it always did — and the end OVERLAY waits for the reading time", () => {
    // sidecar: contact 50.683, at rest 50.767, end card 60.767 (= rest + 10.0), press at contact + 2.233
    const pressMs = 2233;
    const endMs = 84 + CRASH_PIN_STUCK_S * 1000;
    const readUntilMs = pressMs + toastReadMs(323);
    // The verifier's row asked for `endMs >= readUntilMs`. The graded clock has not moved, and must not:
    expect(CRASH_PIN_STUCK_S).toBe(10);
    expect(endMs).toBe(10084);
    expect(endMs).toBeLessThan(readUntilMs);

    // What waits is the overlay — asked of the product's own queue and the product's own predicate.
    const at = { now: 0 };
    vi.spyOn(Date, "now").mockImplementation(() => at.now);
    const q = mountHook(() => useHudToastQueue());
    q.value.push([staticObjectEvent()]);
    const id = q.rerender().toasts[0]!.id;
    at.now = pressMs;
    q.value.whyChanged(id, true);
    const readerOf = (toasts: ReadonlyArray<{ id: number }>) => {
      const m = mountHook(
        () => useToastReader({ toasts, scroller: { current: null }, whyChanged: () => {}, holdAllBut: () => {} }),
        { globals: { HTMLElement: El } },
      );
      m.value.onWhyChange(id, true);
      const reading = m.settle(1).reading;
      m.unmount();
      return reading;
    };
    // the roomy debrief as the rig cell had it: auto-open on, the I1 gate holding the result
    const overlay = (reading: boolean) => ({ ended: true, compact: false, expanded: false, skipped: false, autoOpen: true, held: true, reading });

    // at the end step the card is still in the queue — its clock runs to +23 767 …
    at.now = endMs;
    expect(q.timers).toHaveLength(1);
    expect(pressMs + q.timers[0]!.ms).toBe(readUntilMs);
    const stillReading = readerOf(q.rerender().toasts) !== null;
    expect(stillReading).toBe(true);
    // … so the full-frame debrief does not open, and the end bar says the session is over.
    expect(shouldShowDebrief(overlay(stillReading))).toBe(false);
    expect(shouldShowEndBar(overlay(stillReading))).toBe(true);
    // BASE, for the record: with nobody reading the same state opens it at once.
    expect(shouldShowDebrief(overlay(false))).toBe(true);

    // the reading time runs out: the card leaves, nobody is reading, the overlay opens. Bounded.
    at.now = readUntilMs;
    q.tick();
    const afterwards = readerOf(q.rerender().toasts) !== null;
    expect(afterwards).toBe(false);
    expect(shouldShowDebrief(overlay(afterwards))).toBe(true);
    console.log(
      `[V4] rig cell: press +${pressMs} ms · END (graded, unmoved) +${endMs} ms · reading time up +${readUntilMs} ms → the debrief opens at +${readUntilMs} ms, ${(readUntilMs - endMs) / 1000} s after the end, the end bar standing in meanwhile`,
    );
    q.unmount();
  });

  it("…and «Виж разбора» opens it at once: an explicit open outranks the wait", () => {
    expect(
      shouldShowDebrief({ ended: true, compact: false, expanded: true, skipped: false, autoOpen: true, held: true, reading: true }),
    ).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
const BASE_LESSON: LessonSpec = {
  id: "v-one-liner",
  order: 99,
  titleBg: "Тест",
  descriptionBg: "тест",
  conceptIds: [],
  spawn: { position: { x: 0, y: 0 }, headingDeg: 0 },
  preDrive: false,
  objectives: [],
};

describe("V5 one fault, one one-liner — COLLISION staticObject on both layouts", () => {
  it("PC column toast, phone L3 peek (same toast) and the phone's paused teach card print one line", () => {
    const r = applyTick(
      createLessonSession({ ...BASE_LESSON, aids: { pauseOnError: true } }),
      tickWithEvents(1, [{ kind: "collision", withWhat: "staticObject" }], { speedKmh: 3.6 }),
    );
    const toast = r.hudEvents.find((e): e is Extract<HudEvent, { kind: "violation" }> => e.kind === "violation")!;
    const moment = (r.teachMoments ?? [])[0]!;
    const pcLine = toast.peekBg; // HudToasts summary body + the compact overlay's `peekBg: t.event.peekBg`
    const phoneTeachLine = teachMomentOneLinerBg(moment);
    console.log(`[V5] PC «${pcLine}» · phone teach «${phoneTeachLine}» · code-keyed (base) «${teachMomentPeekBg(moment.code)}»`);
    expect(phoneTeachLine).toBe(pcLine);
    expect(pcLine).toBe(violationPeekBg("COLLISION", "staticObject"));
    expect(teachMomentPeekBg(moment.code)).toBe(VIOLATIONS.COLLISION.peekBg);
    expect(phoneTeachLine).not.toBe(VIOLATIONS.COLLISION.peekBg);
  });

  it("nothing graded moved: the same tick's events, points and state are what they were but for the one optional field", () => {
    const lesson = { ...BASE_LESSON, aids: { pauseOnError: true } };
    const r = applyTick(
      createLessonSession(lesson),
      tickWithEvents(1, [{ kind: "collision", withWhat: "staticObject" }], { speedKmh: 3.6 }),
    );
    const moment = (r.teachMoments ?? [])[0]!;
    const { peekBg: _line, ...rest } = moment as typeof moment & { peekBg?: string };
    expect(Object.keys(rest).sort()).toEqual(
      ["charged", "code", "explanationBg", "lawRef", "points", "scenarioId", "severity", "t", "titleBg"].sort(),
    );
    expect(JSON.stringify(r.state)).not.toContain("Не се появи внезапно");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("V6 STOP RULE (b) — «По-тихи известия: едно по едно…» while an explanation is open", () => {
  it("the quiet toggle's own sentence still says one at a time", () => {
    const shell = readFileSync(resolve(__dirname, "../LessonPlayShell.tsx"), "utf8");
    expect(shell).toContain('title="По-тихи известия: едно по едно, без похвалите. Грешките и обясненията към тях остават."');
  });

  it("quiet mode, «ЗАЩО» open on fault 1, fault 2 arrives: the column paints ONE card", () => {
    const toasts = [
      { id: 2, event: { kind: "violation" } },
      { id: 1, event: { kind: "violation" } },
    ];
    expect(visibleToasts(toasts, true).map((t) => t.id), "base rule: one at a time").toEqual([2]);
    const painted = visibleToasts(toasts, true, { id: 1, held: false }).map((t) => t.id);
    console.log(`[V6] quiet mode, reading card 1, newer card 2: painted ${JSON.stringify(painted)}`);
    expect(painted).toHaveLength(1);
    // …and it is the one he is reading, with the newer fault counted behind it.
    expect(painted).toEqual([1]);
    expect(waitingToasts(toasts, true, { id: 1, held: false })).toBe(1);
  });

  it("…and out of quiet mode too: an opened explanation is never one of two cards", () => {
    const toasts = [
      { id: 3, event: { kind: "violation" } },
      { id: 2, event: { kind: "lesson" } },
      { id: 1, event: { kind: "violation" } },
    ];
    for (const held of [false, true]) {
      expect(visibleToasts(toasts, false, { id: 2, held }).map((t) => t.id)).toEqual([2]);
      expect(waitingToasts(toasts, false, { id: 2, held })).toBe(2);
    }
  });
});
