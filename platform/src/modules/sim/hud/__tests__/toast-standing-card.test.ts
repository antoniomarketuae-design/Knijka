/**
 * =============================================================================
 * A GRADED CARD NOBODY PRESSED IS NOT PUSHED OFF THE GLASS — sc-roundabout-
 * entry:fe081cf1 (major), the clause rig-w3g left open at 9390622; integrator
 * decision W7 (2026-10-15). `HudToasts.tsx`, „THE GRADED CARD NOBODY PRESSED",
 * carries the frame and the rule; this file runs them.
 *
 * THE DRIVE THIS FILE IS BUILT ON. `.audit-frames/rig-w3g/sc-roundabout-entry/
 * fe081cf1/pc-L3-CONTROL-NOPRESS-SIM.json` (+ `-raw.json`, `col.changes`),
 * Chromium, a 1165 × 650 shell, L3, advisor on, NOTHING pressed. Every length
 * below is a box that sidecar recorded, not an estimate:
 *
 *   column (cap)            232.4 → 478          245.6 px, `gap-1.5` = 6
 *   banner, task            232.4 → 281.1         48.7   (raf 3011)
 *   banner, crash pin       232.4 → 308.6         76.2   (raf 3014)
 *   advisor card            314.6 → 412.9         98.3   (raf 3014)
 *   recall pill             287.1 → 310.6         23.5
 *   fold row                454.5 → 478           23.5
 *   the fault card          116.5, its body box 383.1 → 402.1 (19; «ЗАЩО ↓»)
 *   scroller window         131.9 with the row (raf 3011) · 29.6 without it,
 *                           0.1 with it (rafs 3014 / 3015 / 3016 …)
 *
 * WHAT THE JUDGE SAW: whole for 4.8 s; at +4.87 s the pin's banner and the
 * advisor's card arrived and the card stood 448.4 → 564.9 against a window
 * ending at 478 (cut 86.9) or 448.5 (cut 116.4) — the window flipping between
 * the two as the fold row came and went — until it left at +7.91 s.
 *
 * WHAT IS TESTED.
 *   §1  which cards are on the glass while the column stands for one
 *       (`visibleToasts` with `standing`).
 *   §2  the read the stand is decided on (`readStandingToastCut`).
 *   §3  the stand itself, RUN: `useToastReader` mounted against a stand-in
 *       column laid out with the sidecar's lengths, held to its windows first,
 *       with the SHELL'S OWN fold measure (`measureToastColumnFold`) deciding
 *       the fold row between layouts — so an oscillation of the window is
 *       caught here, not described.
 *
 * WHAT THIS CANNOT DO: there is no layout engine (`environment: "node"`). The
 * same cell was laid out with the product's compiled CSS and the real
 * components in Chromium (lane scratch `cardstay-impl/rig/`); a device drive
 * is owed (rig cells CONTROL-NOPRESS on S-SIM, S-IMM, S-1366 and the
 * letterboxed /simulator stage).
 * =============================================================================
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bannerOneLineWhileReading, measureToastColumnFold } from "../../../../components/sim/lesson-ui/LessonPlayShell";
import * as Hud from "../HudToasts";
import { TOAST_MORE_SELECTOR, toastCardInWindow } from "../HudToasts";
import { visibleToasts } from "../hudPreferences";
import { fakeDocument, mountHook } from "./hookHarness";

type Standing = { id: number; trimAge?: boolean };
type Reader = {
  reading: { id: number; held: boolean } | null;
  standing?: Standing | null;
  summarise?: number | null;
  held: boolean;
  bannerYields: boolean;
  onWhyChange: (id: number, open: boolean) => void;
  recheck: () => void;
};

/** The exports this repair adds, read structurally: on a tree without them a
 *  row fails on its ASSERTION (what the column does), not on a link error. */
const NEW = Hud as unknown as {
  readStandingToastCut?: (scroller: unknown, judged: readonly boolean[]) => number | null;
  useToastReader: (args: {
    toasts: ReadonlyArray<{ id: number; event?: { kind: string } }>;
    scroller: { readonly current: unknown };
    whyChanged: (id: number, open: boolean) => void;
    holdAllBut: (id: number | null) => void;
    quiet?: boolean;
  }) => Reader;
};
const vis = visibleToasts as unknown as <T extends { id?: number; event: { kind: string } }>(
  toasts: readonly T[],
  quiet: boolean,
  reading: { id: number; held: boolean } | null,
  standing?: Standing | null,
) => T[];

afterEach(() => {
  vi.restoreAllMocks();
});

const RIG = {
  cap: 245.6,
  gap: 6,
  stackGap: 8,
  bannerTask: 48.7,
  bannerPinned: 76.2,
  /** the pinned banner set on one line (`ObjectiveBanner`'s `oneLine`, Chromium 2026-10-13: 76.25 → 48.75) */
  bannerOneLine: 48.75,
  advisor: 98.3,
  pill: 23.5,
  row: 23.5,
  summary: 116.5,
  /** where the column starts on the shell, for the rects the shell's fold measure reads. */
  columnTop: 232.4,
} as const;

/** The letterboxed /simulator stage at 1440 × 900: shell 1168 × 773.5 → the
 *  16:9 stage 1168 × 657 (1 px border) → padding box 655 → column top
 *  0.24·655 + 8 = 165.2, cap 655 − 165.2 − 108 − 56 = 325.8 (derived). */
const LETTERBOX_CAP = 325.8;

// ═════════════════════════════════════════════════════════════════════════════
// §1  WHO IS ON THE GLASS WHILE THE COLUMN STANDS FOR A CARD
// ═════════════════════════════════════════════════════════════════════════════

const card = (id: number, kind: string) => ({ id, event: { kind } });
const ids = (t: ReadonlyArray<{ id?: number }>) => t.map((x) => x.id);

describe("§1 visibleToasts while a graded card stands — praise waits, judged cards do not", () => {
  const stack = [card(4, "commendation"), card(3, "violation"), card(2, "commendation"), card(1, "lesson")];

  it("nothing stands: the column as it has always been", () => {
    expect(ids(vis(stack, false, null, null))).toEqual([4, 3]);
    expect(ids(vis(stack, false, null))).toEqual([4, 3]);
  });

  it("the fault stands: praise newer than it does not push it down — it is not painted", () => {
    expect(ids(vis(stack, false, null, { id: 3 })), "a «Браво» card stayed on top of the graded card it pushes out").toEqual([3, 1]);
  });

  it("a «Научи» card stands the same way", () => {
    expect(ids(vis(stack, false, null, { id: 1 }))).toEqual([3, 1]);
  });

  it("a standing id that is not in the column changes nothing", () => {
    expect(ids(vis(stack, false, null, { id: 99 }))).toEqual([4, 3]);
  });

  it("an opened explanation still owns the column (W1): the reading wins", () => {
    expect(ids(vis(stack, false, { id: 1, held: true }, { id: 3 }))).toEqual([1]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// the stand-in column
// ═════════════════════════════════════════════════════════════════════════════

class El {
  attrs: Record<string, string> = {};
  parentElement: El | null = null;
  children: El[] = [];
  style: Record<string, string> = { position: "" };
  offsetParent: El | null = null;
  previousElementSibling: El | null = null;
  clientTop = 0;
  scrollTop = 0;
  topFn: () => number = () => 0;
  heightFn: () => number = () => 0;
  clientFn: () => number = () => 0;
  scrollFn: () => number = () => 0;
  rectTopFn: () => number = () => 0;
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
  getBoundingClientRect() {
    return { top: this.rectTopFn(), height: this.heightFn(), bottom: this.rectTopFn() + this.heightFn() };
  }
  getAttribute(n: string) {
    return n in this.attrs ? this.attrs[n]! : null;
  }
  add(c: El) {
    c.parentElement = this;
    this.children.push(c);
    return c;
  }
  // ── what the summary read touches (a deep copy laid out in the column) ──
  className = "";
  text = "";
  set textContent(v: string) {
    this.text = v;
  }
  get textContent() {
    return this.text;
  }
  setAttribute(n: string, v: string) {
    this.attrs[n] = v;
  }
  appendChild(c: El) {
    return this.add(c);
  }
  removeChild(c: El) {
    this.children = this.children.filter((x) => x !== c);
    c.parentElement = null;
    return c;
  }
  insertBefore(c: El, ref: El) {
    c.parentElement = this;
    const at = this.children.indexOf(ref);
    this.children.splice(at < 0 ? this.children.length : at, 0, c);
    return c;
  }
  /** The height a deep copy of this box lays out at — on a card in its paragraph form, its summary card's. */
  copyPx: number | null = null;
  cloneNode(): El {
    const copy = new El();
    Object.assign(copy.attrs, this.attrs);
    const px = this.copyPx;
    copy.heightFn = px === null ? this.heightFn : () => px;
    for (const c of this.children) copy.add(c.cloneNode());
    return copy;
  }
  querySelector(sel: string): El | null {
    const scoped = sel.startsWith(":scope > ");
    const m = (scoped ? sel.slice(9) : sel).match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (m === null) throw new Error(`the stand-in cannot answer ${sel}`);
    const hit = (c: El) => {
      const v = c.getAttribute(m[1]!);
      return v !== null && (m[2] === undefined || v === m[2]);
    };
    if (scoped) return this.children.find(hit) ?? null;
    const walk = (el: El): El | null => {
      for (const c of el.children) {
        if (hit(c)) return c;
        const d = walk(c);
        if (d !== null) return d;
      }
      return null;
    };
    return walk(this);
  }
}

interface ModelCard {
  id: number;
  px: number;
  kind: "violation" | "lesson" | "commendation";
  /** The age stamp's own footer row (6 px gap + 15 px line), when it wraps under the law chip; absent when it shares the chip's row. */
  agePx?: number;
  /** In its PARAGRAPH form, with a summary to fall back to: the body box's height and the summary card's. */
  paragraph?: { bodyPx: number; summaryPx: number; peek: string };
}

/**
 * The shell's roomy column as flexbox lays it out: banner, the advisor's card
 * (while its prompt stands and the reader does not hold it), the recall pill,
 * the toast scroller (its content's height, shrunk to what the cap leaves),
 * and the fold row while the shell's fold measure says so.
 */
function column(start: { bannerPx: number; advisorPrompt: boolean; cards: ModelCard[]; capPx?: number; hold?: boolean }) {
  const s = { capPx: RIG.cap as number, hold: false, ...start, rowUp: false, reader: null as Reader | null };
  /** The banner as the shell lays it out: under a route hold, the SHELL'S OWN rule decides
   *  whether the reader's `bannerYields` sets it on one line (`bannerOneLineWhileReading`). */
  const bannerNow = () =>
    bannerOneLineWhileReading(s.hold ? ({ kind: "pinned" } as never) : null, s.reader?.bannerYields === true) ? RIG.bannerOneLine : s.bannerPx;
  const advisorMounted = () => s.advisorPrompt && s.reader?.held !== true;
  const toasts = () => s.cards.map((c) => ({ ...c, event: { kind: c.kind } }));
  const standing = () => s.reader?.standing ?? null;
  const painted = () => vis(toasts(), false, s.reader?.reading ?? null, standing());
  const above = () => bannerNow() + RIG.gap + (advisorMounted() ? RIG.advisor + RIG.gap : 0) + RIG.pill + RIG.gap;
  const natural = () => {
    const c = painted();
    return c.reduce((a, x) => a + laidOut(x, false), 0) + RIG.stackGap * Math.max(0, c.length - 1);
  };
  const windowPx = (withRow: boolean) =>
    Math.max(0, Math.min(natural(), s.capPx - above() - (withRow ? RIG.gap + RIG.row : 0)));
  /** `HudToasts` paints no stamp on the card the column stands for at step 3 (W9). */
  const trimmed = (c: ModelCard) => s.reader?.standing?.trimAge === true && s.reader.standing.id === c.id;
  const laidOut = (c: ModelCard, _withRow: boolean) => c.px - (trimmed(c) ? (c.agePx ?? 0) : 0);

  const columnEl = new El();
  const scroller = columnEl.add(new El());
  scroller.attrs["data-hud-toast-scroller"] = "";
  const stack = scroller.add(new El());
  stack.attrs["data-hud"] = "toasts";
  const row = new El();
  row.attrs[TOAST_MORE_SELECTOR.slice(1, -1)] = "";
  const rowInFlow = () => s.rowUp && row.style.position !== "absolute";
  scroller.offsetParent = columnEl;
  scroller.topFn = above;
  scroller.rectTopFn = () => RIG.columnTop + above();
  scroller.clientFn = () => windowPx(rowInFlow());
  scroller.scrollFn = () => Math.max(natural(), windowPx(rowInFlow()));
  stack.offsetParent = columnEl;
  stack.topFn = above;
  stack.rectTopFn = () => RIG.columnTop + above() - scroller.scrollTop;
  /** Lay the committed tree out — what React's commit does to the DOM. */
  const commit = () => {
    stack.children = [];
    columnEl.children = s.rowUp ? [scroller, row] : [scroller];
    row.parentElement = s.rowUp ? columnEl : null;
    const cards = painted();
    cards.forEach((c, i) => {
      const el = stack.add(new El());
      el.offsetParent = columnEl;
      el.topFn = () => above() + cards.slice(0, i).reduce((a, x) => a + laidOut(x, rowInFlow()) + RIG.stackGap, 0);
      el.heightFn = () => laidOut(c, rowInFlow());
      el.rectTopFn = () => RIG.columnTop + el.topFn() - scroller.scrollTop;
      if (c.paragraph !== undefined) {
        const para = c.paragraph;
        const body = el.add(new El());
        body.attrs["data-hud-toast-body"] = "paragraph";
        body.heightFn = () => (body.style.height ? parseFloat(body.style.height) : para.bodyPx);
        // the card answers the body's squeeze, as a flex column of its rows does
        el.heightFn = () => laidOut(c, rowInFlow()) - (para.bodyPx - body.heightFn());
        el.copyPx = para.summaryPx;
      }
      // the footer: the law chip, then the stamp — on the chip's row, or wrapped onto its own
      if (c.kind !== "commendation" && !trimmed(c)) {
        const law = el.add(new El());
        law.heightFn = () => 21;
        const age = el.add(new El());
        age.attrs["data-hud-toast-age"] = "";
        age.previousElementSibling = law;
        age.heightFn = () => 15;
        age.topFn = () => ((c.agePx ?? 0) > 0 ? 27 : 3);
      }
    });
  };
  /** Where a card stands against the window, as the glass shows it. */
  const cardAt = (id: number) => {
    let top = 0;
    for (const c of painted()) {
      const h = laidOut(c, s.rowUp);
      if (c.id === id) {
        const w = windowPx(s.rowUp);
        return { top, px: h, window: w, fit: toastCardInWindow(top, h, w), cutPx: Math.max(0, top + h - w) };
      }
      top += h + RIG.stackGap;
    }
    return null;
  };
  return { s, scroller, row, commit, cardAt, advisorMounted, painted, windowPx, bannerNow };
}

// ═════════════════════════════════════════════════════════════════════════════
// §2  THE READ THE STAND IS DECIDED ON
// ═════════════════════════════════════════════════════════════════════════════

describe("§2 readStandingToastCut — which judged card on the glass is cut below the window, asked without the fold row", () => {
  const read = (el: unknown, judged: boolean[]) => {
    expect(typeof NEW.readStandingToastCut, "nothing measures whether a graded card on the glass is cut").toBe("function");
    return NEW.readStandingToastCut!(el, judged);
  };

  it("the card before the crash pin, whole in its 131.9 px window: no claim", () => {
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.commit();
    expect(read(m.scroller, [true])).toBeNull();
  });

  it("THE FRAME (raf 3014): the advisor's card and the pinned banner leave 29.6 px — the card is cut", () => {
    const m = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.commit();
    expect(m.windowPx(false)).toBeCloseTo(29.6, 1);
    expect(read(m.scroller, [true])).toBe(0);
  });

  it("…and with the fold row up (raf 3015: a 0.1 px window, `clientHeight` 0) it is still cut — a zero window is not «not laid out»", () => {
    const m = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.s.rowUp = true;
    m.commit();
    expect(m.scroller.clientHeight).toBe(0);
    expect(read(m.scroller, [true])).toBe(0);
    expect(m.row.style.position, "the probe left the fold row out of flow").toBe("");
  });

  it("a card cut ONLY by the fold row is not a stand: the row is the shell's statement about the cards", () => {
    // cap 220: 220 − 48.7 − 6 − 23.5 − 6 = 135.8 without the row (the card fits), 106.3 with it (it does not)
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: 220, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.s.rowUp = true;
    m.commit();
    expect(m.windowPx(true)).toBeLessThan(RIG.summary);
    expect(m.windowPx(false)).toBeGreaterThanOrEqual(RIG.summary);
    expect(read(m.scroller, [true])).toBeNull();
  });

  it("praise cut below the window is not a graded card: no claim for it", () => {
    const m = column({
      bannerPx: RIG.bannerPinned,
      advisorPrompt: true,
      cards: [{ id: 3, px: 50, kind: "commendation" }],
    });
    m.commit();
    expect(read(m.scroller, [false])).toBeNull();
  });

  it("a stack that does not hold exactly the cards named, or a card with another offset parent, is no claim", () => {
    const m = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.commit();
    expect(read(m.scroller, [true, true])).toBeNull();
    (m.scroller.querySelector('[data-hud="toasts"]')!.children[0] as El).offsetParent = new El();
    expect(read(m.scroller, [true])).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §3  THE STAND, RUN — `useToastReader` on the sidecar's column, the shell's
//     own fold measure deciding the fold row between layouts
// ═════════════════════════════════════════════════════════════════════════════

function mountReader(model: ReturnType<typeof column>) {
  const hold: Array<number | null> = [];
  const m = mountHook(
    () => {
      const reader = NEW.useToastReader({
        toasts: model.s.cards.map((c) => ({ id: c.id, event: { kind: c.kind, ...(c.paragraph ? { peekBg: c.paragraph.peek } : {}) } })),
        scroller: { current: model.scroller },
        whyChanged: () => undefined,
        holdAllBut: (id) => hold.push(id),
        quiet: false,
      });
      model.s.reader = reader;
      model.commit();
      return reader;
    },
    { globals: { HTMLElement: El }, document: { ...fakeDocument(), createElement: () => new El() } },
  );
  /** One frame: commit → effects (the reader's layout effect) → the shell's fold measure. */
  const frame = () => {
    m.settle(1);
    model.s.rowUp = measureToastColumnFold(model.scroller as unknown as HTMLElement).belowFold > 0;
    model.commit();
    return { rowUp: model.s.rowUp, window: Math.round(model.windowPx(model.s.rowUp) * 10) / 10, advisor: model.advisorMounted() };
  };
  const settle = () => {
    for (let i = 0; i < 6; i += 1) frame();
    return m.settle(1);
  };
  return { m, hold, frame, settle };
}

describe("§3 the stand-in column IS the rig's column — held to the sidecar's own windows first", () => {
  it("before the pin: 131.9 px with the fold row up (raf 3011), 161.4 without it", () => {
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 2, px: 320, kind: "violation" }] });
    m.s.rowUp = true;
    m.commit();
    expect(m.windowPx(true)).toBeCloseTo(131.9, 1);
    expect(m.windowPx(false)).toBeCloseTo(161.4, 1);
  });

  it("after the pin, advisor painted: 29.6 px without the row, 0.1 with it (rafs 3014 / 3015)", () => {
    const m = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    m.commit();
    expect(m.windowPx(false)).toBeCloseTo(29.6, 1);
    expect(m.windowPx(true)).toBeCloseTo(0.1, 1);
    const at = m.cardAt(2)!;
    expect(at.cutPx).toBeCloseTo(86.9, 1);
  });
});

describe("§3 THE CELL (CONTROL-NOPRESS-SIM): the card nobody pressed, then the crash pin's banner and the advisor's card", () => {
  function onTheGlass(capPx: number = RIG.cap) {
    const model = column({
      bannerPx: RIG.bannerTask,
      advisorPrompt: false,
      capPx,
      cards: [{ id: 2, px: RIG.summary, kind: "violation" }],
    });
    const r = mountReader(model);
    r.settle();
    return { model, ...r };
  }
  function crashPins(t: ReturnType<typeof onTheGlass>) {
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.hold = true;
    t.model.s.advisorPrompt = true;
    return t.settle();
  }

  it("while the card fits, nothing stands and nothing waits", () => {
    const t = onTheGlass();
    const reader = t.settle();
    expect(reader.standing ?? null).toBeNull();
    expect(reader.held).toBe(false);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("THE FRAME: the advisor's card WAITS, and the graded card — title, one-liner, law chip — is whole in its window", () => {
    const t = onTheGlass();
    const reader = crashPins(t);
    expect(t.model.advisorMounted(), "the advisor's card was painted over the graded card it pushes out of the window").toBe(false);
    expect(reader.held).toBe(true);
    expect(reader.standing).toEqual({ id: 2 });
    const at = t.model.cardAt(2)!;
    expect(at.fit, `the graded card is cut ${at.cutPx.toFixed(1)} px below a ${at.window.toFixed(1)} px window`).toBe("whole");
    // 245.6 − 76.2 − 6 − 23.5 − 6 = 133.9 for the 116.5 px card; no fold row
    expect(t.model.windowPx(false)).toBeCloseTo(116.5, 1);
    expect(t.model.s.rowUp).toBe(false);
    expect(reader.bannerYields, "the advisor's wait was enough: the banner keeps its whole sentence (W8 folds it only for a card still cut)").toBe(false);
    t.m.unmount();
  });

  it("FOR ITS WHOLE LIFE: 180 consecutive layouts after the pin, the card whole on every one and the window never moving", () => {
    const t = onTheGlass();
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.hold = true;
    t.model.s.advisorPrompt = true;
    const frames = Array.from({ length: 180 }, () => t.frame());
    const windows = new Set(frames.slice(2).map((f) => f.window));
    const rowFlips = frames.slice(2).filter((f, i, a) => i > 0 && f.rowUp !== a[i - 1]!.rowUp).length;
    expect(rowFlips, "the fold row came and went between layouts — the window oscillates").toBe(0);
    expect([...windows], "the window moved between layouts").toHaveLength(1);
    expect(frames.slice(2).every((f) => !f.advisor), "the advisor's card came back while the card stood").toBe(true);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("the card leaves (its 8 s, or ✕): the advisor's card is painted at once — it waited, it was not dropped", () => {
    const t = onTheGlass();
    crashPins(t);
    t.model.s.cards = [];
    const reader = t.settle();
    expect(reader.standing ?? null).toBeNull();
    expect(reader.held).toBe(false);
    expect(t.model.advisorMounted()).toBe(true);
    t.m.unmount();
  });

  it("praise raised while it stands is not painted on top of it", () => {
    const t = onTheGlass();
    crashPins(t);
    t.model.s.cards = [{ id: 3, px: 52, kind: "commendation" }, ...t.model.s.cards];
    t.settle();
    expect(t.model.painted().map((c) => c.id)).toEqual([2]);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("THE PRODUCT'S OWN STAGE (letterboxed /simulator, cap 325.8): the advisor would cut it 6.7 px — it waits there too", () => {
    const t = onTheGlass(LETTERBOX_CAP);
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.hold = true;
    t.model.s.advisorPrompt = true;
    // base arithmetic: 325.8 − 76.2 − 98.3 − 23.5 − 18 = 109.8 for a 116.5 px card
    expect(t.model.windowPx(false)).toBeCloseTo(109.8, 1);
    const reader = t.settle();
    expect(reader.held).toBe(true);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("a stage with room for both gives up nothing: the advisor's card stays (1366 × 768, cap 335.3)", () => {
    const t = onTheGlass(335.3);
    const reader = crashPins(t);
    expect(reader.held).toBe(false);
    expect(t.model.advisorMounted()).toBe(true);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("THE BANNER GROWS UNDER A CARD THAT FITTED BESIDE THE ADVISOR'S CARD (letterboxed stage): the growth is answered — the advisor's card waits", () => {
    // 325.8 − 48.7 − 98.3 − 23.5 − 18 = 137.3 for the 116.5 px card: whole beside the advisor
    const t = onTheGlass(LETTERBOX_CAP);
    t.model.s.advisorPrompt = true;
    expect(t.settle().held, "the advisor's card waited for a card that fitted beside it").toBe(false);
    expect(t.model.advisorMounted()).toBe(true);
    expect(t.model.cardAt(2)!.fit).toBe("whole");
    // …then the crash pins the car: the banner grows 27.5 px, the card would be cut 6.7
    t.model.s.bannerPx = RIG.bannerPinned;
    t.model.s.hold = true;
    const reader = t.settle();
    expect(reader.held, "the banner's growth cut the graded card and nothing gave way").toBe(true);
    expect(t.model.advisorMounted()).toBe(false);
    const at = t.model.cardAt(2)!;
    expect(at.fit, `the graded card is cut ${at.cutPx.toFixed(1)} px`).toBe("whole");
    expect(reader.bannerYields, "the advisor's wait was enough: the banner keeps its whole sentence (W8 folds it only for a card still cut)").toBe(false);
    t.m.unmount();
  });

  it("WHERE THE WAIT IS NOT ENOUGH (cap 220): the banner under the crash pin's hold falls to ONE LINE (W8) and the card is whole", () => {
    // 220 − 76.2 − 6 − 23.5 − 6 = 108.3 for the 116.5 px card with the advisor waiting; one line gives 27.45 back: 135.75
    const t = onTheGlass(220);
    const reader = crashPins(t);
    expect(reader.held).toBe(true);
    expect(t.model.advisorMounted()).toBe(false);
    expect(reader.bannerYields, "the banner's growth cut the graded card and the banner did not give it back (W8)").toBe(true);
    expect(t.model.bannerNow(), "the banner under the hold is not on one line").toBe(RIG.bannerOneLine);
    const at = t.model.cardAt(2)!;
    expect(at.fit, `the graded card is cut ${at.cutPx.toFixed(1)} px below a ${at.window.toFixed(1)} px window`).toBe("whole");
    expect(t.model.s.rowUp).toBe(false);
    t.m.unmount();
  });

  it("…and where even ONE LINE is not enough (cap 190), the fold row announces the card — the column's existing fallback, and nothing flips", () => {
    // 190 − 48.75 − 6 − 23.5 − 6 = 105.75 < 116.5
    const t = onTheGlass(190);
    crashPins(t);
    const frames = Array.from({ length: 60 }, () => t.frame());
    expect(t.model.cardAt(2)!.fit).toBe("cut");
    expect(t.model.s.rowUp, "a card that does not fit is not announced").toBe(true);
    expect(frames.filter((f, i, a) => i > 0 && (f.rowUp !== a[i - 1]!.rowUp || f.window !== a[i - 1]!.window)).length, "the window oscillates").toBe(0);
    t.m.unmount();
  });
  it("he opens it with «ЗАЩО»: the reading owns the column (W1) and the stand ends", () => {
    const t = onTheGlass();
    crashPins(t);
    t.m.value.onWhyChange(2, true);
    const reader = t.settle();
    expect(reader.reading?.id).toBe(2);
    expect(reader.standing ?? null).toBeNull();
    t.m.unmount();
  });

  it("an opened explanation is never stood for and changes nothing else: with nothing judged on the glass nothing stands", () => {
    const t = onTheGlass();
    t.model.s.cards = [{ id: 5, px: 80, kind: "commendation" }];
    const reader = crashPins(t);
    expect(reader.standing ?? null).toBeNull();
    expect(t.model.advisorMounted()).toBe(true);
    // …on EVERY layout, not just the last one: praise cut by the advisor's card is never stood for
    const frames = Array.from({ length: 20 }, () => t.frame());
    expect(frames.filter((f) => !f.advisor).length, "the advisor's card waited for a «Браво» card").toBe(0);
    t.m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §3b W8 — THE BANNER'S GROWTH NEVER CUTS A CARD THE COLUMN STANDS FOR
//     (integrator decision W8, 2026-10-15; the verifier's F1: on the 1165 × 650
//     stage 18 catalogued summaries 137.5–181.5 px were whole before the crash
//     pin and lost the law chip for the rest of their life once the banner grew
//     48.7 → 76.2, with the advisor waiting AND with the advisor off)
// ═════════════════════════════════════════════════════════════════════════════

describe("§3b W8: a tall summary whole before the pin stays whole after it — the banner under the hold gives its growth back", () => {
  /** A 160 px summary: 161.4 px window before the pin (whole), 133.9 after it (cut 26.1), 161.35 with the banner on one line. */
  const TALL = 160;
  function tall(advisorPrompt: boolean, capPx: number = RIG.cap) {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx, cards: [{ id: 7, px: TALL, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    expect(model.cardAt(7)!.fit, "the stand-in does not start where the verifier's rows start (whole before the pin)").toBe("whole");
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    model.s.advisorPrompt = advisorPrompt;
    return { model, ...r };
  }

  for (const advisorPrompt of [false, true]) {
    it(`the crash pins the car ${advisorPrompt ? "(advisor on: it waits)" : "(advisor off, the L3 default)"}: whole on every one of 180 layouts, the banner on one line, the window never moving`, () => {
      const t = tall(advisorPrompt);
      const frames = Array.from({ length: 180 }, () => ({ ...t.frame(), fit: t.model.cardAt(7)!.fit, banner: t.model.bannerNow() }));
      const after = frames.slice(2);
      expect(after.filter((f) => f.fit !== "whole").length, "the banner's growth cut the graded card and nothing gave way").toBe(0);
      expect(after.every((f) => f.banner === RIG.bannerOneLine), "the banner under the hold kept its two-line growth over a card it cut").toBe(true);
      expect(new Set(after.map((f) => f.window)).size, "the window oscillates").toBe(1);
      expect(after.every((f) => !f.rowUp)).toBe(true);
      expect(after.every((f) => !f.advisor), "the advisor's card was painted while the card stood").toBe(true);
      t.m.unmount();
    });
  }

  it("the card leaves: the banner's whole sentence is back at once (the one line lasts exactly as long as the stand)", () => {
    const t = tall(false);
    t.settle();
    expect(t.model.bannerNow()).toBe(RIG.bannerOneLine);
    t.model.s.cards = [];
    const reader = t.settle();
    expect(reader.bannerYields, "the banner stayed on one line after the card it stood for had left").toBe(false);
    expect(t.model.bannerNow()).toBe(RIG.bannerPinned);
    t.m.unmount();
  });

  it("A BANNER WITH NO HOLD LEAD IS NEVER CUT: the same card cut by the task's own two lines leaves the task whole (the fold row announces the card)", () => {
    // no hold: the banner is the task and its cap (founder ruling 2026-09-22) — cap 210: 210 − 48.7 − 35.5 = 125.8 < 160
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: 210, cards: [{ id: 7, px: TALL, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    expect(model.bannerNow(), "a banner with no hold lead was set on one line").toBe(RIG.bannerTask);
    expect(model.cardAt(7)!.fit).toBe("cut");
    expect(model.s.rowUp).toBe(true);
    r.m.unmount();
  });

  it("a stand that BEGINS under a hold and OUTLIVES it: the hold ends, the banner is the task again (whole), and the card stays whole", () => {
    const t = tall(false);
    t.settle();
    expect(t.model.bannerNow()).toBe(RIG.bannerOneLine);
    // the car is freed: the lead goes, the banner is the 48.7 px task — never cut, since no hold stands
    t.model.s.hold = false;
    t.model.s.bannerPx = RIG.bannerTask;
    const frames = Array.from({ length: 30 }, () => ({ ...t.frame(), fit: t.model.cardAt(7)!.fit, banner: t.model.bannerNow() }));
    expect(frames.every((f) => f.banner === RIG.bannerTask), "the task banner was set on one line with no hold in front of it").toBe(true);
    expect(frames.every((f) => f.fit === "whole")).toBe(true);
    expect(new Set(frames.map((f) => f.window)).size, "the window oscillates").toBe(1);
    t.m.unmount();
  });

  it("TWO judged cards: a fault arriving on top of the standing card — both stay painted, in queue order, and the window does not move", () => {
    const t = tall(false, 330);
    t.settle();
    t.model.s.cards = [{ id: 8, px: 116.5, kind: "violation" }, ...t.model.s.cards];
    const frames = Array.from({ length: 40 }, () => t.frame());
    expect(t.model.painted().map((c) => c.id), "a judged card was taken off the glass for another").toEqual([8, 7]);
    expect(new Set(frames.slice(2).map((f) => f.window)).size, "the window oscillates").toBe(1);
    expect(frames.slice(2).filter((f, i, a) => i > 0 && f.rowUp !== a[i - 1]!.rowUp).length, "the fold row flips").toBe(0);
    t.m.unmount();
  });

  it("«ЗАЩО» on it ends the stand (W1 owns the column); closing it, the column stands for it again — and the banner returns to one line", () => {
    const t = tall(false);
    t.settle();
    t.m.value.onWhyChange(7, true);
    let reader = t.settle();
    expect(reader.reading?.id).toBe(7);
    expect(reader.standing ?? null).toBeNull();
    t.m.value.onWhyChange(7, false);
    reader = t.settle();
    expect(reader.standing, "closing the explanation did not give the card its stand back").toEqual({ id: 7 });
    expect(t.model.bannerNow()).toBe(RIG.bannerOneLine);
    expect(t.model.cardAt(7)!.fit).toBe("whole");
    t.m.unmount();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §3d W9 — WHERE THE BARE COLUMN CANNOT HOLD THE SUMMARY, THE ROW THE STUDENT
//     IS NOT JUDGED BY GOES: the age stamp («сега» / «преди N с») of the card
//     the column stands for, when it wraps onto a footer row of its own.
//     THE STAGE: the product's letterboxed /simulator at a 1366 × 768 laptop's
//     1366 × 657 viewport, MEASURED in the lane's rig (rig2/pdrive.mjs): shell
//     1094 wide, the 76.5 px top bar, stage 918 × 516.4 (padding box 916 × 514),
//     column top 131.4, cap 514 − 131.4 − 108 − 56 = 218.6; the bare column
//     (task banner 48.7, pill 23.5, two 6 px gaps) leaves 134.4. «Преминаване
//     на червен сигнал» (RED_LIGHT_CROSSED) is 147.25 px in its summary form there: a
//     36 px law chip and the stamp wrapped under it (+21) — cut 12.9 on
//     ARRIVAL, before any later card. Without its stamp row: 126.25.
// ═════════════════════════════════════════════════════════════════════════════

describe("§3d W9: a summary the bare column cannot hold drops its stamp row — title, one-liner and law chip whole", () => {
  const LB1366_CAP = 218.6;
  function arrives(card: ModelCard, capPx: number = LB1366_CAP) {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx, cards: [card] });
    const r = mountReader(model);
    return { model, ...r };
  }

  it("RED_LIGHT_CROSSED on arrival at the 1366 × 657 letterbox: whole on every layout, its stamp not painted, the window never moving", () => {
    const t = arrives({ id: 4, px: 147.25, kind: "violation", agePx: 21 });
    const frames = Array.from({ length: 60 }, () => ({ ...t.frame(), fit: t.model.cardAt(4)!.fit }));
    expect(frames.slice(2).filter((f) => f.fit !== "whole").length, "the summary is cut and the column gave nothing it could").toBe(0);
    expect(t.settle().standing, "the stamp row was not dropped for a card the bare column cannot hold").toEqual({ id: 4, trimAge: true });
    expect(new Set(frames.slice(2).map((f) => f.window)).size, "the window oscillates").toBe(1);
    expect(frames.slice(2).every((f) => !f.rowUp)).toBe(true);
    t.m.unmount();
  });

  it("the trim is taken ONLY where it gives a row back: a stamp on the law chip's own row stays painted, and the cut card is announced by the fold row", () => {
    // a 140 px summary whose stamp shares the chip's row: nothing to give — 134.4 < 140
    const t = arrives({ id: 5, px: 140, kind: "violation" });
    expect(t.settle().standing?.trimAge ?? false, "the stamp was taken off a card it gave no room to").toBe(false);
    expect(t.model.cardAt(5)!.fit).toBe("cut");
    expect(t.model.s.rowUp).toBe(true);
    t.m.unmount();
  });

  it("a summary that fits keeps its stamp: nothing stands, nothing is trimmed", () => {
    const t = arrives({ id: 6, px: 116.5, kind: "violation", agePx: 21 });
    t.settle();
    expect(t.m.value.standing ?? null).toBeNull();
    expect(t.model.cardAt(6)!.fit).toBe("whole");
    t.m.unmount();
  });

  it("the trim is the LAST step: under a crash pin the banner gives its growth back first, and the stamp stays where that was enough", () => {
    // cap 245.6 (1165 × 650): 160 px whole before the pin; the pin cuts it; one line is enough (161.35) — the stamp stays
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 7, px: 160, kind: "violation", agePx: 21 }] });
    const r = mountReader(model);
    r.settle();
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    const reader = r.settle();
    expect(reader.bannerYields).toBe(true);
    expect(reader.standing, "the stamp was dropped where the banner's one line was enough").toEqual({ id: 7 });
    expect(model.cardAt(7)!.fit).toBe("whole");
    r.m.unmount();
  });

  it("A NEWER FAULT ON TOP (own search, round 2): its body is laid out after the stand was taken on the card it pushed down — the stand moves UP to it and its summary drops its stamp row", () => {
    // the newer card's first commit: body pending (height 0) — 100 px, so the OLDER card is the one cut and stood for
    const t = arrives({ id: 1, px: 116.5, kind: "violation" });
    t.settle();
    expect(t.model.cardAt(1)!.fit).toBe("whole");
    const newer: ModelCard = { id: 2, px: 100, kind: "violation", agePx: 21 };
    t.model.s.cards = [newer, ...t.model.s.cards];
    t.frame();
    // …then the body choice lays the summary out: 147.25 px, its stamp wrapped under a two-line chip
    newer.px = 147.25;
    const frames = Array.from({ length: 40 }, () => ({ ...t.frame(), at: t.model.cardAt(2)! }));
    expect(t.settle().standing, "the stand stayed on the older card the newest one had pushed down").toEqual({ id: 2, trimAge: true });
    // whole in the column's window as the stand reads it (without the fold row): 126.25 in 134.4 …
    expect(frames.slice(2).filter((f) => f.at.px > t.model.windowPx(false)).length, "the newest graded card's summary is cut").toBe(0);
    // … and the fold row stands for the OLDER card it pushed down (a judged card — not W7's to hold back):
    // the residual, stated in HudToasts — 126.25 against 104.9 with the row
    expect(t.model.s.rowUp).toBe(true);
    expect(new Set(frames.slice(2).map((f) => f.window)).size, "the window oscillates").toBe(1);
    t.m.unmount();
  });

  it("…and the trim is NOT carried up: the newer card's stamp, on the law chip's own row, stays painted (the trim is a fact about one card's footer)", () => {
    const t = arrives({ id: 1, px: 147.25, kind: "violation", agePx: 21 });
    expect(t.settle().standing, "the stand-in does not start with the older card trimmed").toEqual({ id: 1, trimAge: true });
    // a 140 px summary on top whose stamp shares the chip's row: cut in 134.4, and no row to give
    t.model.s.cards = [{ id: 2, px: 140, kind: "violation" }, ...t.model.s.cards];
    const reader = t.settle();
    expect(reader.standing, "the trim taken for the older card's footer was carried to a card whose stamp gives no row").toEqual({ id: 2 });
    expect(reader.standing?.trimAge ?? false).toBe(false);
    t.m.unmount();
  });

  it("the card leaves: nothing stands and the next card is painted with its stamp", () => {
    const t = arrives({ id: 4, px: 147.25, kind: "violation", agePx: 21 });
    t.settle();
    t.model.s.cards = [{ id: 9, px: 116.5, kind: "violation", agePx: 21 }];
    const reader = t.settle();
    expect(reader.standing ?? null).toBeNull();
    t.m.unmount();
  });
});

describe("§3d toastAgeHasOwnRow — the stamp's row read off layout px", () => {
  const card = (lawTop: number, lawH: number, ageTop: number | null) => {
    const c = new El();
    const law = c.add(new El());
    law.topFn = () => lawTop;
    law.heightFn = () => lawH;
    if (ageTop !== null) {
      const age = c.add(new El());
      age.attrs["data-hud-toast-age"] = "";
      age.previousElementSibling = law;
      age.topFn = () => ageTop;
      age.heightFn = () => 15;
    }
    return c;
  };
  const read = (c: El) => {
    const f = (Hud as unknown as { toastAgeHasOwnRow?: (el: unknown) => boolean }).toastAgeHasOwnRow;
    expect(typeof f, "nothing reads whether the stamp has a row of its own").toBe("function");
    return f!(c);
  };
  it("wrapped under a three-line chip (51 px, stamp at 57): its own row", () => expect(read(card(0, 51, 57))).toBe(true));
  it("wrapped under a one-line chip (21 px, stamp at 27): its own row", () => expect(read(card(0, 21, 27))).toBe(true));
  it("beside the chip (stamp at 3, centred on the 21 px row): not its own row", () => expect(read(card(0, 21, 3))).toBe(false));
  it("no stamp: no row to give", () => expect(read(card(0, 21, null))).toBe(false));
});

// ═════════════════════════════════════════════════════════════════════════════
// §3e A CARD THAT ANSWERS ITS OWN CUT IS NOT STOOD FOR (round 2, own census):
//     with the stand taking every judged card it found cut, a PARAGRAPH the crash
//     pin's banner cut was stood for and the banner set on one line before the
//     card's own shrink switch (a ResizeObserver, after layout) could take its
//     summary — in the product's letterboxed stage at 1440 × 900, 11 of the 86
//     catalogued cards folded a banner base never let cut any card. The card's
//     own machinery answers first: a body still `pending`, or a top-of-stack
//     paragraph whose summary would be whole in the window as it stands.
// ═════════════════════════════════════════════════════════════════════════════

/** A stand-in just large enough for `toastCardShrinksItself` and the summary read it makes. */
class D {
  attrs: Record<string, string> = {};
  children: D[] = [];
  parentElement: D | null = null;
  style: Record<string, string> = {};
  offsetParent: D | null = null;
  offsetTop = 0;
  clientTop = 0;
  scrollTop = 0;
  text = "";
  className = "";
  /** this box's own height when it has no children laid out under it */
  ownPx = 0;
  /** the summary card's height a copy of this card lays out at (cards only) */
  summaryPx = 0;
  clientFn: () => number = () => 0;
  set textContent(v: string) { this.text = v; }
  get textContent() { return this.text; }
  get clientHeight() { return this.clientFn(); }
  get offsetHeight(): number {
    if (this.attrs["data-copy"] !== undefined) return this.summaryPx;
    const styled = this.style.height;
    if (styled !== undefined && styled !== "") return parseFloat(styled);
    return this.ownPx + this.children.reduce((a, c) => a + c.offsetHeight, 0);
  }
  getAttribute(n: string) { return n in this.attrs ? this.attrs[n]! : null; }
  setAttribute(n: string, v: string) { this.attrs[n] = v; }
  add(c: D) { c.parentElement = this; this.children.push(c); return c; }
  appendChild(c: D) { return this.add(c); }
  removeChild(c: D) { this.children = this.children.filter((x) => x !== c); c.parentElement = null; return c; }
  insertBefore(c: D, ref: D) { c.parentElement = this; this.children.splice(this.children.indexOf(ref), 0, c); return c; }
  cloneNode(): D {
    const copy = new D();
    Object.assign(copy.attrs, this.attrs, { "data-copy": "" });
    copy.summaryPx = this.summaryPx;
    for (const c of this.children) { const k = new D(); Object.assign(k.attrs, c.attrs); k.ownPx = c.ownPx; copy.add(k); for (const g of c.children) { const gg = new D(); Object.assign(gg.attrs, g.attrs); gg.ownPx = g.ownPx; k.add(gg); } }
    return copy;
  }
  querySelector(sel: string): D | null {
    const m = sel.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
    if (m === null) throw new Error(`the stand-in cannot answer ${sel}`);
    const hit = (c: D) => {
      const v = c.getAttribute(m[1]!);
      return v !== null && (m[2] === undefined || v === m[2]);
    };
    const walk = (el: D): D | null => {
      for (const c of el.children) {
        if (hit(c)) return c;
        const d = walk(c);
        if (d !== null) return d;
      }
      return null;
    };
    return walk(this);
  }
}

describe("§3e toastCardShrinksItself — the card's own machinery answers first", () => {
  afterEach(() => vi.unstubAllGlobals());
  /** A column → scroller → stack → card (header 60 px + body box with the paragraph) in a window of `windowPx`. */
  function stage(o: {
    choice: "pending" | "paragraph" | "summary";
    paragraphPx: number;
    summaryCardPx: number;
    windowPx: number;
    contentTop?: number;
    /** the fold row up: the scroller's window WITH it in flow (`windowPx` is then the window without it) */
    withRowPx?: number;
    /** an older card under this one in the stack (its height) */
    olderPx?: number;
  }) {
    vi.stubGlobal("HTMLElement", D);
    vi.stubGlobal("document", { createElement: () => new D() });
    const column = new D();
    const scroller = column.add(new D());
    scroller.attrs["data-hud-toast-scroller"] = "";
    scroller.offsetParent = column;
    const row = new D();
    row.attrs["data-hud-toast-more"] = "";
    if (o.withRowPx !== undefined) column.add(row);
    scroller.clientFn = () => (o.withRowPx !== undefined && row.style.position !== "absolute" ? o.withRowPx : o.windowPx);
    const stack = scroller.add(new D());
    stack.attrs["data-hud"] = "toasts";
    const card = stack.add(new D());
    card.offsetParent = column;
    card.offsetTop = o.contentTop ?? 0;
    card.ownPx = 60;
    card.summaryPx = o.summaryCardPx;
    const box = card.add(new D());
    const body = box.add(new D());
    body.attrs["data-hud-toast-body"] = o.choice;
    body.ownPx = o.choice === "pending" ? 0 : o.paragraphPx;
    if (o.olderPx !== undefined) {
      const older = stack.add(new D());
      older.offsetParent = column;
      older.offsetTop = card.offsetTop + card.offsetHeight + 8;
      older.ownPx = o.olderPx;
    }
    return { scroller, card };
  }
  const ask = (t: { scroller: D; card: D }, peek: string | undefined = "Кратко.") => {
    const f = (Hud as unknown as { toastCardShrinksItself?: (c: unknown, s: unknown, p: string | undefined) => boolean }).toastCardShrinksItself;
    expect(typeof f, "nothing asks whether a card answers its own cut").toBe("function");
    return f!(t.card, t.scroller, peek);
  };

  it("a body still PENDING (its first commit, laid out at 0 px) is not the card the student will see: it shrinks itself", () => {
    expect(ask(stage({ choice: "pending", paragraphPx: 200, summaryCardPx: 116.5, windowPx: 100 }))).toBe(true);
  });
  it("a top-of-stack PARAGRAPH cut in a 133.9 px window whose 116.5 px summary would be whole there: its own switch answers — the column takes nothing", () => {
    expect(ask(stage({ choice: "paragraph", paragraphPx: 160, summaryCardPx: 116.5, windowPx: 133.9 })), "the column stood for a paragraph its own summary mends").toBe(true);
  });
  it("…but a summary that would STILL be cut is no answer: the column stands for it", () => {
    expect(ask(stage({ choice: "paragraph", paragraphPx: 160, summaryCardPx: 147.25, windowPx: 133.9 }))).toBe(false);
  });
  it("a card already in its SUMMARY has nothing left to give: the column stands for it", () => {
    expect(ask(stage({ choice: "summary", paragraphPx: 19, summaryCardPx: 116.5, windowPx: 100 }))).toBe(false);
  });
  it("a paragraph with NO summary to show: the column stands for it", () => {
    expect(ask(stage({ choice: "paragraph", paragraphPx: 160, summaryCardPx: 116.5, windowPx: 133.9 }), "")).toBe(false);
  });
  it("a paragraph PUSHED down the stack (its switch refuses a pushed card): the column stands for it — praise on top is held back, not trusted to the switch", () => {
    expect(ask(stage({ choice: "paragraph", paragraphPx: 160, summaryCardPx: 116.5, windowPx: 200, contentTop: 54 }))).toBe(false);
  });
  it("round 3 (X2): the fold row up for THIS card alone — the summary is judged without it, as the card's own switch judges it (the row goes when the summary fits)", () => {
    // 1165 × 650: 133.9 without the row, 104.4 with it; the 116.5 summary fits only once the row goes
    expect(
      ask(stage({ choice: "paragraph", paragraphPx: 100, summaryCardPx: 116.5, windowPx: 133.9, withRowPx: 104.4 })),
      "the summary was judged under the fold row raised for the card it would mend",
    ).toBe(true);
  });
  it("round 3 (X2): the fold row up for an OLDER card below it — the full-screen 1280 × 720 frame: the 147.3 px summary is asked", () => {
    expect(
      ask(stage({ choice: "paragraph", paragraphPx: 153.3, summaryCardPx: 147.3, windowPx: 214.9, withRowPx: 185.4, olderPx: 116.5 })),
      "the newest paragraph, cut under the row raised for the older card, was not asked for a summary that fits",
    ).toBe(true);
  });
  it("round 3 (X2): …and a summary still cut under that row (190 px: whole in 214.9, not in 185.4) is asked too — the shorter card is the one the stand's own steps (one-line banner, stamp row) are then taken for", () => {
    expect(
      ask(stage({ choice: "paragraph", paragraphPx: 153.3, summaryCardPx: 190, windowPx: 214.9, withRowPx: 185.4, olderPx: 116.5 })),
      "the summary was judged in the window WITH the older card's row — the paragraph is left cut and the stand's steps are spent on the longer card",
    ).toBe(true);
  });
  it("round 3 (X2): a summary NO SHORTER than the card (205 px for a 200 px paragraph card) mends nothing — it is not asked, the card is stood for", () => {
    expect(
      ask(stage({ choice: "paragraph", paragraphPx: 140, summaryCardPx: 205, windowPx: 214.9, withRowPx: 185.4, olderPx: 116.5 })),
      "the card was asked for a summary taller than itself",
    ).toBe(false);
  });
});

describe("§3e the reader, run: a PARAGRAPH its own summary mends is asked for that summary BEFORE PAINT — the column takes no step for it", () => {
  it("1165 × 650, the crash pin: a 160 px paragraph whose summary is 116.5 — nothing stands, the banner keeps its sentence, the card is asked", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 7, px: 160, kind: "violation", paragraph: { bodyPx: 60, summaryPx: 116.5, peek: "Кратко." } }] });
    const r = mountReader(model);
    r.settle();
    expect(model.cardAt(7)!.fit, "the stand-in does not start with the paragraph whole").toBe("whole");
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    let reader = r.settle();
    expect(reader.summarise ?? null, "the cut paragraph was not asked for its summary before paint — it is painted cut until its observer runs").toBe(7);
    expect(reader.standing ?? null, "the column stood for a paragraph its own summary mends").toBeNull();
    expect(reader.bannerYields, "the banner was set on one line for a paragraph its own summary mends").toBe(false);
    expect(model.bannerNow()).toBe(RIG.bannerPinned);
    // the card answers (its layout effect, `toastBodyChoiceOnAsk`): 116.5 px, whole in 133.9 — the ask is withdrawn
    model.s.cards = [{ id: 7, px: 116.5, kind: "violation" }];
    reader = r.settle();
    expect(model.cardAt(7)!.fit).toBe("whole");
    expect(reader.summarise ?? null).toBeNull();
    expect(reader.standing ?? null).toBeNull();
    r.m.unmount();
  });
  it("a newer PARAGRAPH on top that its own summary mends is asked for it; the older card it pushes under the window is no longer stood for (round 3: a judged card put it there)", () => {
    // the older 116.5 px summary stands for the advisor's card (the frame); a 180 px paragraph arrives on top, summary 97.25
    const model = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, hold: true, cards: [{ id: 1, px: RIG.summary, kind: "violation" }] });
    const r = mountReader(model);
    expect(r.settle().standing, "the stand-in does not start with the frame's stand").toEqual({ id: 1 });
    model.s.cards = [{ id: 2, px: 180, kind: "violation", paragraph: { bodyPx: 99, summaryPx: 97.25, peek: "Кратко." } }, ...model.s.cards];
    const reader = r.settle();
    expect(reader.standing?.id ?? null, "the column still stands for the older card a newer judged card keeps under the window").not.toBe(1);
    expect(reader.summarise ?? null, "the newer paragraph was not asked for its summary").toBe(2);
    expect(model.cardAt(2)!.px, "the stand-in card did not answer").toBeGreaterThan(0);
    r.m.unmount();
  });

  it("THE FRAME'S OWN COMMIT with a paragraph: the advisor's card and the pin together leave 29.6 px — not even the summary fits, so the column stands; once the advisor's card waits the summary would fit: the card is asked, the banner is not folded", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 7, px: 160, kind: "violation", paragraph: { bodyPx: 60, summaryPx: 116.5, peek: "Кратко." } }] });
    const r = mountReader(model);
    r.settle();
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    model.s.advisorPrompt = true;
    const reader = r.settle();
    expect(reader.standing, "the advisor's card cut the paragraph past what its summary mends and nothing waited").toEqual({ id: 7 });
    expect(model.advisorMounted()).toBe(false);
    expect(reader.bannerYields, "the banner was folded where the card's own summary mends the cut once the advisor's card waits").toBe(false);
    expect(reader.summarise ?? null, "the paragraph was not asked for the summary that now fits").toBe(7);
    r.m.unmount();
  });

  it("…and the same 160 px card as a SUMMARY (nothing shorter to show): the banner gives its growth back", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 7, px: 160, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    expect(r.settle().bannerYields).toBe(true);
    r.m.unmount();
  });
});

describe("§3e the reader, run: a card whose body is still pending is not stood for — the advisor's card is not held back on its first commit", () => {
  it("pending: nothing stands; laid out as its summary and still cut: it stands", () => {
    // the stand-in column's card with a body attribute the reader can read
    const model = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
    let choice = "pending";
    const commit = model.commit;
    model.commit = () => {
      commit();
      const stack = model.scroller.querySelector('[data-hud="toasts"]')!;
      for (const c of stack.children) {
        const body = c.add(new El());
        body.attrs["data-hud-toast-body"] = choice;
      }
    };
    const r = mountReader(model);
    let reader = r.settle();
    expect(reader.standing ?? null, "the column stood for a card whose body had not been laid out yet").toBeNull();
    expect(reader.summarise ?? null, "a pending body was asked for a summary — its own arrival measurement decides").toBeNull();
    expect(model.advisorMounted()).toBe(true);
    choice = "summary";
    reader = r.settle();
    expect(reader.standing).toEqual({ id: 2 });
    expect(model.advisorMounted()).toBe(false);
    r.m.unmount();
  });
});

describe("§3e the card's answer to the ask — `toastBodyChoiceOnAsk`, taken in a layout effect (before paint)", () => {
  const on = (Hud as unknown as { toastBodyChoiceOnAsk?: (c: string, can: boolean, asked: boolean) => string }).toastBodyChoiceOnAsk;
  const f = (c: string, can: boolean, asked: boolean) => {
    expect(typeof on, "the card has no answer to the column's ask").toBe("function");
    return on!(c, can, asked);
  };
  it("asked, able to summarise, showing its paragraph: the summary", () => expect(f("paragraph", true, true)).toBe("summary"));
  it("not asked: the card as shipped", () => expect(f("paragraph", true, false)).toBe("paragraph"));
  it("nothing shorter to show: the paragraph stays (a blank body is a bare verdict)", () => expect(f("paragraph", false, true)).toBe("paragraph"));
  it("a pending body is its arrival measurement's; a summary stays a summary", () => {
    expect(f("pending", true, true)).toBe("pending");
    expect(f("summary", true, true)).toBe("summary");
  });
  it("the switch takes the ask in a LAYOUT effect keyed on it (read off the shipped source, comments stripped)", () => {
    const H = code(readFileSync(resolve(__dirname, "../HudToasts.tsx"), "utf8"));
    expect(H).toMatch(/useLayoutEffect\(\(\) => \{\s*const asked = toastBodyChoiceOnAsk\(choice, canSummarise, summariseNow\);\s*if \(asked !== choice\) setChoice\(asked\);\s*\}, \[summariseNow, canSummarise, choice\]\);/);
    expect(H).toMatch(/useToastBodyChoice\(canSummarise, violationToastBodyBg\(event, false\), summariseNow\)/);
    expect(H).toMatch(/summariseNow=\{t\.id === summarise\}/);
    // …and the card RENDERS the summary in the commit that carries the ask (the shell's fold measure sees it there)
    expect(H).toContain("return { setCard, bodyRef, choice: toastBodyChoiceOnAsk(choice, canSummarise, summariseNow) };");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// §3c THE STAND IS ASKED OF JUDGED CARDS ONLY — the verifier's VM10 (round 1,
//     F3): the cut read with every card counted as judged. On the 1004 × 565
//     and 1010 × 568 stages it measured (column top 0.24·H + 8, cap
//     H − top − 108 − 56: 257.4 and 259.7) a «Браво» card on top of a graded
//     card, then the pin's banner and the advisor's card: the window falls to
//     41.4 / 43.7 px (11.9 / 14.2 with the fold row — the verifier measured 11.9). The PRAISE card is the
//     first one cut; a read that stands for it stands for a card
//     `visibleToasts` will not paint — so nothing stands, nothing waits, and
//     the graded card under it is cut on every frame.
// ═════════════════════════════════════════════════════════════════════════════

describe("§3c a «Браво» card cut on top of a cut graded card: the column stands for the GRADED card", () => {
  const stages: ReadonlyArray<readonly [string, number]> = [
    ["H565", 565 - (0.24 * 565 + 8) - 108 - 56],
    ["H568", 568 - (0.24 * 568 + 8) - 108 - 56],
  ];
  for (const [label, capPx] of stages) {
    it(`${label} (cap ${capPx.toFixed(1)}): the advisor's card and the praise wait, the graded card is whole`, () => {
      const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx, cards: [{ id: 2, px: RIG.summary, kind: "violation" }] });
      const r = mountReader(model);
      r.settle();
      model.s.cards = [{ id: 3, px: 46, kind: "commendation" }, ...model.s.cards];
      r.settle();
      expect(model.painted().map((c) => c.id), "the stand-in does not start with both cards on the glass").toEqual([3, 2]);
      expect(model.cardAt(2)!.fit, "the stand-in does not start with the graded card whole").toBe("whole");
      model.s.bannerPx = RIG.bannerPinned;
      model.s.hold = true;
      model.s.advisorPrompt = true;
      const frames = Array.from({ length: 40 }, () => ({ ...r.frame(), fit: model.cardAt(2)?.fit ?? "gone", praise: model.painted().some((c) => c.id === 3) }));
      const after = frames.slice(2);
      expect(after.filter((f) => f.advisor || f.praise).length, "the advisor's card and the «Браво» card were painted while the graded card under them was cut").toBe(0);
      expect(after.filter((f) => f.fit !== "whole").length, "the graded card was cut: the column stood for the praise card instead").toBe(0);
      r.m.unmount();
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// §4  THE COLUMN AND THE SHELL SPEND IT — `HudToasts` paints what `standing`
//     says, and the shell hands it the reader's answer
// ═════════════════════════════════════════════════════════════════════════════

describe("§4 HudToasts, MOUNTED: while a graded card stands, praise is not painted (and the paint report says so)", () => {
  const fault = (title: string) => ({
    kind: "violation" as const,
    titleBg: title,
    explanationBg: "Х".repeat(323),
    peekBg: "Кратко.",
    points: 10,
    severity: "opasna" as const,
    lawRef: "ЗДвП чл. 20, ал. 2",
  });
  const praise = (title: string) => ({ kind: "commendation" as const, titleBg: title });
  const paint = (props: Record<string, unknown>) => {
    const reports: number[][] = [];
    const m = mountHook(() =>
      (Hud.HudToasts as unknown as (p: Record<string, unknown>) => unknown)({
        ...props,
        onPainted: (ids: readonly number[]) => reports.push([...ids]),
      }),
    );
    m.unmount();
    return reports;
  };
  const toasts = [
    { id: 3, event: praise("Браво") },
    { id: 2, event: fault("Удар в неподвижно препятствие") },
  ];

  it("nothing stands: the praise card is painted on top, as shipped", () => {
    expect(paint({ toasts })).toEqual([[3, 2]]);
  });

  it("W9: the card stood for at step 3 is painted with NO age stamp; at steps 1–2, and every other card, keep theirs", () => {
    const ages = (props: Record<string, unknown>) => {
      const out: Array<[number, unknown]> = [];
      const walk = (n: unknown): void => {
        if (n === null || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const el = n as { key?: unknown; props?: Record<string, unknown> };
        if (el.props && "ageBg" in el.props && "event" in el.props) out.push([Number(el.key), el.props.ageBg]);
        if (el.props) walk(el.props.children);
      };
      const m = mountHook(() => (Hud.HudToasts as unknown as (p: Record<string, unknown>) => unknown)(props));
      walk(m.value);
      m.unmount();
      return out;
    };
    const stamped = [
      { id: 3, event: fault("Червен сигнал"), raisedAtMs: Date.now() },
      { id: 2, event: fault("Удар в неподвижно препятствие"), raisedAtMs: Date.now() },
    ];
    const trimmed = ages({ toasts: stamped, standing: { id: 2, trimAge: true } });
    expect(trimmed.find(([id]) => id === 2)?.[1], "the stamp was painted on the card the column trimmed").toBeNull();
    expect(typeof trimmed.find(([id]) => id === 3)?.[1], "another card lost its stamp").toBe("string");
    const kept = ages({ toasts: stamped, standing: { id: 2 } });
    expect(typeof kept.find(([id]) => id === 2)?.[1], "a stand below step 3 took the stamp").toBe("string");
  });

  it("the paragraph the reader asks is the card told `summariseNow`; no other card is", () => {
    const flags = (props: Record<string, unknown>) => {
      const out: Array<[number, unknown]> = [];
      const walk = (n: unknown): void => {
        if (n === null || typeof n !== "object") return;
        if (Array.isArray(n)) return n.forEach(walk);
        const el = n as { key?: unknown; props?: Record<string, unknown> };
        if (el.props && "event" in el.props && "ageBg" in el.props) out.push([Number(el.key), el.props.summariseNow]);
        if (el.props) walk(el.props.children);
      };
      const m = mountHook(() => (Hud.HudToasts as unknown as (p: Record<string, unknown>) => unknown)(props));
      walk(m.value);
      m.unmount();
      return out;
    };
    const two = [
      { id: 3, event: fault("Червен сигнал") },
      { id: 2, event: fault("Удар в неподвижно препятствие") },
    ];
    expect(flags({ toasts: two, summarise: 3 })).toEqual([[3, true], [2, false]]);
    expect(flags({ toasts: two })).toEqual([[3, false], [2, false]]);
  });

  it("the fault stands: the column paints the fault alone", () => {
    expect(paint({ toasts, standing: { id: 2 } }), "praise was painted on top of the graded card the column stands for").toEqual([[2]]);
  });
});

describe("§4 the shell's wiring — read off the shipped source, comments stripped", () => {
  const SHELL = code(
    readFileSync(resolve(__dirname, "../../../../components/sim/lesson-ui/LessonPlayShell.tsx"), "utf8"),
  );

  it("the reader is told which cards are on the glass (quiet mode)", () => {
    expect(SHELL).toMatch(/useToastReader\(\{\s*toasts,\s*scroller: toastScrollRef,\s*whyChanged,\s*holdAllBut,\s*quiet: toastsQuiet,\s*\}\)/);
  });

  it("the column paints, and the fold row counts, with the reader's `standing`", () => {
    expect(SHELL).toMatch(/<HudToasts[\s\S]{0,400}standing=\{toastReader\.standing\}/);
    expect(SHELL).toContain("visibleToasts(toasts, toastsQuiet, toastReader.reading, toastReader.standing).length");
  });

  it("the column is handed the paragraph the reader asks for its summary", () => {
    expect(SHELL).toMatch(/<HudToasts[\s\S]{0,600}summarise=\{toastReader\.summarise\}/);
  });

  it("the advisor's card is gated on the reader's `held` — the one switch the stand turns", () => {
    expect(SHELL).toMatch(/!toastReader\.held &&\s*snap\.advisorPrompt\.textBg !== advisorDismissed \? \(\s*<AdvisorCard/);
  });
});

function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

// ═════════════════════════════════════════════════════════════════════════════
// §5  ROUND 3 (lane `cardstay`, integrator decisions X1–X3, 2026-10-16)
// ═════════════════════════════════════════════════════════════════════════════

/** The read, asked structurally: on a tree without it a row fails on its assertion, not on a TypeError. */
function readCut(el: unknown, judged: boolean[]): number | null {
  expect(typeof NEW.readStandingToastCut, "nothing measures whether a graded card on the glass is cut").toBe("function");
  return NEW.readStandingToastCut!(el, judged);
}

// X2 — TWO JUDGED CARDS. The verifier's round-2 frame (full screen at 1280 × 720,
// stage 1264 × 620): «Удар в неподвижно препятствие» (116.5) on the glass, then
// «Преминаване на червен сигнал» on top as its 213.3 px PARAGRAPH (summary
// 147.3). Window 214.9 without the fold row, 185.4 with it — the row raised for
// the older card it pushed down, which stays up whatever the newer card does.
// Base: the paragraph cut under that row (law chip out) until the crash pin's
// banner shrank the window and its own switch took the summary. Round 2: the
// stand sat on the older card, W8 kept the banner on one line, the window never
// shrank, and the paragraph stayed cut for its whole life.
describe("§5 X2: a judged card cut under a fold row raised for an OLDER judged card is cut — the column asks it for its summary", () => {
  /** cap − task banner − gap − pill − gap = 214.9; with the row (23.5 + 6) 185.4 */
  const FS1280_CAP = 299.1;
  const RED_LIGHT: ModelCard = { id: 2, px: 213.3, kind: "violation", paragraph: { bodyPx: 99, summaryPx: 147.3, peek: "Мина на червено." } };
  const COLLISION: ModelCard = { id: 1, px: RIG.summary, kind: "violation" };

  it("the read: the top card, whole without the row and cut with it, IS the cut card while the row stays up for the older one below it", () => {
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: FS1280_CAP, cards: [{ ...RED_LIGHT }, { ...COLLISION }] });
    m.s.rowUp = true;
    m.commit();
    expect(m.windowPx(false)).toBeCloseTo(214.9, 1);
    expect(m.windowPx(true)).toBeCloseTo(185.4, 1);
    expect(
      readCut(m.scroller, [true, true]),
      "the read still answers the OLDER card — the newer one's cut under the row that stays up for it was read away",
    ).toBe(0);
  });

  it("…and a row raised for the card ITSELF is still no cut (round 1's rule): alone, the same paragraph whole without the row is no claim", () => {
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: FS1280_CAP, cards: [{ ...RED_LIGHT }] });
    m.s.rowUp = true;
    m.commit();
    expect(readCut(m.scroller, [true])).toBeNull();
  });

  it("THE FRAME, run: the newer paragraph is asked for its summary before paint, takes it, and is whole — title, one-liner, law chip — on every layout, through the crash pin", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: FS1280_CAP, cards: [{ ...COLLISION }] });
    const r = mountReader(model);
    r.settle();
    expect(model.cardAt(1)!.fit, "the stand-in does not start with the older card whole").toBe("whole");
    model.s.cards = [{ ...RED_LIGHT }, ...model.s.cards];
    let asked: number | null = null;
    for (let i = 0; i < 6 && asked === null; i += 1) {
      r.frame();
      asked = model.s.reader?.summarise ?? null;
    }
    expect(asked, "the newer paragraph, cut under the row that stays up for the older card, was never asked for its summary").toBe(2);
    // the card answers (`toastBodyChoiceOnAsk`, its layout effect): its 147.3 px summary
    model.s.cards = [{ id: 2, px: 147.3, kind: "violation" }, { ...COLLISION }];
    const before = Array.from({ length: 30 }, () => ({ ...r.frame(), fit: model.cardAt(2)!.fit }));
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    model.s.advisorPrompt = true;
    const after = Array.from({ length: 60 }, () => ({ ...r.frame(), fit: model.cardAt(2)!.fit }));
    expect([...before, ...after].filter((f) => f.fit !== "whole").length, "the newest graded card was cut under the fold row").toBe(0);
    expect(model.s.rowUp, "the older card is not announced by the fold row").toBe(true);
    expect(model.painted().map((c) => c.id), "a judged card was taken off the glass").toEqual([2, 1]);
    expect(new Set(after.slice(2).map((f) => f.window)).size, "the window oscillates").toBe(1);
    r.m.unmount();
  });

  it("a SUMMARY on top cut only by that row (nothing shorter to show): the stand moves UP to it — its steps are taken for the card the student is reading", () => {
    // 1165 × 650: 161.4 without the row, 131.9 with it — a 140 px summary (stamp on its own row) on top of a 116.5 px one
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ ...COLLISION }] });
    const r = mountReader(model);
    r.settle();
    model.s.cards = [{ id: 3, px: 140, kind: "violation", agePx: 21 }, ...model.s.cards];
    const frames = Array.from({ length: 40 }, () => ({ ...r.frame(), fit: model.cardAt(3)!.fit }));
    const reader = r.settle();
    expect(reader.standing, "the stand stayed on the older card under the window").toEqual({ id: 3, trimAge: true });
    expect(frames.slice(4).filter((f) => f.fit !== "whole").length, "the newest graded card's summary is cut under the fold row").toBe(0);
    expect(model.s.rowUp).toBe(true);
    r.m.unmount();
  });
});

// X3 — THE TWO TEST GAPS THE ROUND-2 VERIFIER'S MUTANTS FOUND.
describe("§5 X3: the queue's cap holds while a card stands; a cut inside the rounding slack is no cut", () => {
  it("VB: a BURST of three faults while one stands — the column paints the cap (two), never three; quiet mode one", () => {
    const burst = [card(13, "violation"), card(12, "violation"), card(11, "violation")];
    expect(ids(vis(burst, false, null, { id: 11 })), "the queue's cap was dropped while a card stands — a third card painted").toEqual([13, 12]);
    expect(ids(vis(burst, true, null, { id: 13 })), "quiet mode painted more than one card while a card stands").toEqual([13]);
    expect(ids(vis([card(14, "commendation"), ...burst], false, null, { id: 12 })), "praise counted against the cap, or the cap dropped").toEqual([13, 12]);
  });

  it("VB, run: two more faults arrive while the first stands — two cards are painted, never three", () => {
    const model = column({ bannerPx: RIG.bannerPinned, advisorPrompt: true, hold: true, cards: [{ id: 1, px: RIG.summary, kind: "violation" }] });
    const r = mountReader(model);
    expect(r.settle().standing, "the stand-in does not start with the frame's stand").toEqual({ id: 1 });
    model.s.cards = [{ id: 3, px: 97.3, kind: "violation" }, { id: 2, px: 97.3, kind: "violation" }, ...model.s.cards];
    r.settle();
    expect(model.painted().length, "a third card was painted while a card stands").toBe(2);
    r.m.unmount();
  });

  it("VC: a card 0.9 px past the window (ILLEGAL_STOP_IN_BAN_ZONE, 162.3 in 161.4) is inside TOAST_FIT_SLACK_PX — no cut", () => {
    // cap 245.6 with the task banner: 161.4 without the row
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 5, px: 162.3, kind: "violation", agePx: 21 }] });
    m.commit();
    expect(Hud.TOAST_FIT_SLACK_PX).toBe(1);
    expect(readCut(m.scroller, [true]), "a card inside the rounding slack was read as cut").toBeNull();
  });

  it("VC, run: under the crash pin the banner gives its growth back (161.35) and the 162.3 px card keeps its stamp — the trim is not taken inside the slack", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 5, px: 162.3, kind: "violation", agePx: 21 }] });
    const r = mountReader(model);
    r.settle();
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    const reader = r.settle();
    expect(reader.bannerYields).toBe(true);
    expect(reader.standing?.trimAge ?? false, "the stamp was dropped for a card 0.9 px past its window — inside the slack every fold read in this column allows").toBe(false);
    r.m.unmount();
  });
});

// X1 — THE TOOLS PIN. `tools/mobile/__tests__/driveline.test.mjs` §M reads
// HudToasts.tsx with its comments stripped and requires the attribute's
// assignment text exactly once, inside ViolationToast: the hook is the
// violation card and only the violation card. Round 2 spelled it a second time
// in a selector and that gate went red. The lane has no tools/, so the pin is
// replicated here, with the tools test's own comment strip.
describe("§5 X1: `data-hud-toast-body=` is spelled once in HudToasts.tsx, inside ViolationToast (the driveline pin, replicated)", () => {
  const RAW = readFileSync(resolve(__dirname, "../HudToasts.tsx"), "utf8");
  const H = RAW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  it("once", () => {
    expect(H.split("data-hud-toast-body=").length - 1, "data-hud-toast-body is no longer on exactly one card kind").toBe(1);
  });
  it("inside ViolationToast", () => {
    const v = H.indexOf("function ViolationToast(");
    const c = H.indexOf("function ToastCard(");
    const at = H.indexOf("data-hud-toast-body=");
    expect(v >= 0 && c > v && at > v && at < c, "data-hud-toast-body is no longer inside ViolationToast").toBe(true);
  });
  it("the reader finds a pending body through the one name the attribute is written with", () => {
    expect(H).toContain('const TOAST_BODY_ATTR = "data-hud-toast-body";');
    expect(H).toContain('querySelector(`[${TOAST_BODY_ATTR}="pending"]`)');
  });
});

describe("§5 X2: the steps past the first belong to the TOP judged card — an older card under a newer judged one does not fold the banner or lose its stamp", () => {
  it("letterboxed 1440 × 900 (cap 325.8): a newer 147.3 px fault on top of an older 116.5 px one it pushes under the window — the crash pin's banner keeps its sentence, the newer card is whole, the older is announced", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: LETTERBOX_CAP, cards: [{ id: 1, px: RIG.summary, kind: "violation", agePx: 21 }] });
    const r = mountReader(model);
    r.settle();
    model.s.cards = [{ id: 2, px: 147.3, kind: "violation" }, ...model.s.cards];
    for (let i = 0; i < 6; i += 1) r.frame();
    expect(model.cardAt(2)!.fit, "the stand-in does not start with the newer card whole").toBe("whole");
    expect(model.s.rowUp, "the older card is not announced by the fold row").toBe(true);
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    model.s.advisorPrompt = true;
    const frames = Array.from({ length: 40 }, () => ({ ...r.frame(), fit: model.cardAt(2)!.fit, banner: model.bannerNow() }));
    const reader = model.s.reader!;
    expect(frames.every((f) => f.banner === RIG.bannerPinned), "the banner under the hold was set on one line for an older card the newer judged card keeps under the window").toBe(true);
    expect(reader.standing?.trimAge ?? false, "the older card's stamp was dropped though a judged card stands above it").toBe(false);
    expect(frames.every((f) => f.fit === "whole"), "the newer graded card was cut").toBe(true);
    expect(frames.every((f) => !f.advisor), "the advisor's card was painted over the newer graded card it would cut").toBe(true);
    r.m.unmount();
  });
});

describe("§5 X2: the top-card rule, run both ways (the round-3 mutants P6, P7)", () => {
  it("a NEWER card that fits arrives over a card stood for at step 2: the banner's sentence comes back — the older card is announced, the newer one is whole", () => {
    // 1165 × 650: a 160 px summary stood for under the crash pin, banner on one line (161.35)
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 7, px: 160, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    expect(r.settle().bannerYields, "the stand-in does not start with the banner on one line").toBe(true);
    // a 97.3 px fault on top: with the whole pinned banner and the older card's row it has 104.4 — whole
    model.s.cards = [{ id: 8, px: 97.3, kind: "violation" }, ...model.s.cards];
    const frames = Array.from({ length: 40 }, () => ({ ...r.frame(), fit: model.cardAt(8)!.fit, banner: model.bannerNow() }));
    expect(frames.slice(4).every((f) => f.banner === RIG.bannerPinned), "the banner stayed on one line for the older card the newer judged card keeps under the window").toBe(true);
    expect(frames.slice(4).every((f) => f.fit === "whole"), "the newer graded card was cut").toBe(true);
    expect(frames.slice(4).every((f) => f.rowUp), "the older card is not announced").toBe(true);
    r.m.unmount();
  });

  it("the newer card leaves: the older card is the top card again and is whole — it takes NO step it did not need (the banner keeps its sentence)", () => {
    // letterboxed 1440 × 900 (cap 325.8): 147.3 on top of 116.5 — the older under the window, stood for at step 1 only
    const model = column({ bannerPx: RIG.bannerPinned, advisorPrompt: false, hold: true, capPx: LETTERBOX_CAP, cards: [{ id: 1, px: RIG.summary, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    model.s.cards = [{ id: 2, px: 147.3, kind: "violation" }, ...model.s.cards];
    for (let i = 0; i < 12; i += 1) r.frame();
    expect(model.s.reader!.standing ?? null, "the column stands for an older card a newer judged card keeps under the window").toBeNull();
    model.s.cards = model.s.cards.filter((c) => c.id !== 2);
    const frames = Array.from({ length: 20 }, () => ({ ...r.frame(), fit: model.cardAt(1)!.fit, banner: model.bannerNow() }));
    expect(frames.every((f) => f.fit === "whole")).toBe(true);
    expect(frames.every((f) => f.banner === RIG.bannerPinned), "steps taken while the card was under a newer judged card were spent the moment it became the top card").toBe(true);
    expect(model.s.reader!.standing ?? null, "a stand latched while the card was under a newer judged card outlived the reason — the card is whole").toBeNull();
    r.m.unmount();
  });

  it("P3: an older card whose foot is inside the rounding slack below the window does not keep the fold row — the newer card is not read as cut under it", () => {
    // 1165 × 650, task banner: 161.4 without the row; 60 px on top, the older 93.9 px card's foot at 161.9
    const m = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, cards: [{ id: 2, px: 60, kind: "violation" }, { id: 1, px: 93.9, kind: "violation" }] });
    m.s.rowUp = true;
    m.commit();
    expect(readCut(m.scroller, [true, true]), "a card inside the rounding slack was read as keeping the fold row up").toBeNull();
  });
});

describe("§5 X2: an OLDER card the crash pin pushes out (whole before it, under the same newer card) is W7's case — the banner gives its growth back for it", () => {
  it("letterboxed 1920 × 969 (cap 488.5): 260 px on top of 116.5 px, both whole; the pin's banner and the advisor's card arrive — the advisor waits, the banner sets one line, both cards whole on every layout", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: 488.5, cards: [{ id: 1, px: RIG.summary, kind: "violation" }] });
    const r = mountReader(model);
    r.settle();
    model.s.cards = [{ id: 2, px: 260, kind: "violation" }, ...model.s.cards];
    for (let i = 0; i < 6; i += 1) r.frame();
    expect([model.cardAt(2)!.fit, model.cardAt(1)!.fit], "the stand-in does not start with both cards whole").toEqual(["whole", "whole"]);
    model.s.bannerPx = RIG.bannerPinned;
    model.s.hold = true;
    model.s.advisorPrompt = true;
    const frames = Array.from({ length: 40 }, () => ({ ...r.frame(), top: model.cardAt(2)!.fit, older: model.cardAt(1)!.fit, banner: model.bannerNow() }));
    const after = frames.slice(2);
    expect(after.filter((f) => f.older !== "whole").length, "the older graded card, pushed out by the banner's growth, was left under the window").toBe(0);
    expect(after.every((f) => f.top === "whole")).toBe(true);
    expect(after.every((f) => f.banner === RIG.bannerOneLine), "the banner kept its growth over a judged card it pushed out").toBe(true);
    expect(after.every((f) => !f.advisor)).toBe(true);
    expect(new Set(after.map((f) => f.window)).size, "the window oscillates").toBe(1);
    r.m.unmount();
  });
});

describe("§5 X2: a stand on an older card an unjudged change pushed — the card above it cut later", () => {
  /** letterboxed 1920 × 969, no hold: 260 px on top of a 130 px card whose stamp wraps (21) — both whole at cap 488.5 (404.3) */
  function pushed(top: ModelCard) {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: 488.5, cards: [{ id: 1, px: 130, kind: "violation", agePx: 21 }] });
    const r = mountReader(model);
    r.settle();
    model.s.cards = [top, ...model.s.cards];
    for (let i = 0; i < 6; i += 1) r.frame();
    expect([model.cardAt(2)!.fit, model.cardAt(1)!.fit], "the stand-in does not start with both cards whole").toEqual(["whole", "whole"]);
    // the stage shrinks (cap 480: 395.8) — nothing judged arrived, the older card is pushed 2.2 px out
    model.s.capPx = 480;
    for (let i = 0; i < 8; i += 1) r.frame();
    expect(model.s.reader!.standing, "the older card, pushed out by no judged card, was not stood for").toEqual({ id: 1, trimAge: true });
    expect(model.cardAt(1)!.fit).toBe("whole");
    return { model, r };
  }

  it("the stage shrinks again and cuts the TOP card (cap 300): the stand moves up to it — and the older card's dropped stamp is not carried to a card whose stamp shares its chip's row", () => {
    const { model, r } = pushed({ id: 2, px: 260, kind: "violation" });
    model.s.capPx = 300;
    for (let i = 0; i < 8; i += 1) r.frame();
    expect(model.s.reader!.standing, "the stand stayed on the older card while the top card above it was cut").toEqual({ id: 2 });
    r.m.unmount();
  });

  it("…a top PARAGRAPH its summary mends is asked for that summary instead (the stand does not move up to a card that answers its own cut)", () => {
    const { model, r } = pushed({ id: 2, px: 260, kind: "violation", paragraph: { bodyPx: 150, summaryPx: 116.5, peek: "Кратко." } });
    model.s.capPx = 300;
    r.frame();
    expect(model.s.reader!.summarise ?? null, "the top paragraph was not asked for the summary that mends its cut").toBe(2);
    expect(model.s.reader!.standing?.id ?? null, "the stand moved up to a paragraph that answers its own cut").not.toBe(2);
    r.m.unmount();
  });
});

describe("§5 X2: a card is not 'seen whole' under a newer card whose body is still pending", () => {
  it("letterboxed 1440 × 900: a 147.3 px fault arrives (first commit: body pending, 0 px) over a 116.5 px one, then lays out — the older card it pushed is not stood for", () => {
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: LETTERBOX_CAP, cards: [{ id: 1, px: RIG.summary, kind: "violation" }] });
    let pending = false;
    const commit = model.commit;
    model.commit = () => {
      commit();
      const stack = model.scroller.querySelector('[data-hud="toasts"]')!;
      const first = stack.children[0];
      if (pending && first !== undefined) {
        const body = first.add(new El());
        body.attrs["data-hud-toast-body"] = "pending";
      }
    };
    const r = mountReader(model);
    r.settle();
    const newer: ModelCard = { id: 2, px: 0.0001, kind: "violation" };
    pending = true;
    model.s.cards = [newer, ...model.s.cards];
    r.frame();
    // its own layout effect lays the summary out
    pending = false;
    newer.px = 147.3;
    for (let i = 0; i < 8; i += 1) r.frame();
    expect(model.cardAt(1)!.fit, "the stand-in does not push the older card out").toBe("cut");
    expect(model.s.reader!.standing ?? null, "the older card was recorded whole under the newer card's 0 px pending body and stood for").toBeNull();
    r.m.unmount();
  });
});

describe("§6 integration pin (verifier mutant R8): a stand's `above` follows the card's LAST whole sighting, even at the same step", () => {
  // R8 = `sameStand` ignoring `above`. It differs from the shipped reader only
  // when a look hands back a stand on the SAME card at the SAME step whose
  // `above` differs from the latched one: the latch was taken while the card
  // was the top card (above: none recorded), and the card is then cut by an
  // unjudged change under exactly the judged card it was last seen whole under.
  // Driven here at the hook's own input (`toasts`): the newer card leaves the
  // list and is listed again, and the stage grows 100 px between the sightings
  // (a «Цял екран» toggle) — the shape the verifier named. Lengths are the
  // stand-in's, not a filed frame.
  it("an older card stood for at step 1 as the top card, then cut by the advisor's card under the judged card it was last seen whole under, is stood for again", () => {
    const older: ModelCard = { id: 1, px: 200, kind: "violation", paragraph: { bodyPx: 150, summaryPx: 100, peek: "Кратко." } };
    const newer: ModelCard = { id: 2, px: 60, kind: "violation" };
    // 1 · roomy stage (cap 360: 275.8 px): both whole — the older card is seen whole under the newer one
    const model = column({ bannerPx: RIG.bannerTask, advisorPrompt: false, capPx: 360, cards: [newer, older] });
    const r = mountReader(model);
    r.settle();
    expect([model.cardAt(2)!.fit, model.cardAt(1)!.fit], "the stand-in does not start with both cards whole").toEqual(["whole", "whole"]);
    // 2 · the newer card is off the list; the stage shrinks (cap 234.2) and the advisor's card arrives:
    //     the older card, now the top card, is cut and stood for at step 1; its summary then fits, so it is asked, not stepped
    model.s.cards = [older];
    model.s.capPx = 234.2;
    model.s.advisorPrompt = true;
    for (let i = 0; i < 8; i += 1) r.frame();
    expect(model.s.reader!.standing ?? null, "the stand-in does not stand for the top card").toEqual({ id: 1 });
    expect(model.s.reader!.bannerYields, "the stand-in took a step past the first").toBe(false);
    expect(model.cardAt(1)!.fit, "the stand-in let the top card be seen whole").not.toBe("whole");
    // 3 · the stage grows 100 px (cap 334.2) and the newer card is listed again above it: the stand no longer
    //     holds (the judged cards above it are not the latched ones), the advisor's card mounts and cuts the older card
    model.s.capPx = 334.2;
    model.s.cards = [newer, older];
    for (let i = 0; i < 8; i += 1) r.frame();
    expect(
      model.s.reader!.standing?.id ?? null,
      "the older card, last seen whole under exactly the judged card above it now and cut by the advisor's card, was not stood for — the latch kept a stale `above`",
    ).toBe(1);
    expect(model.advisorMounted(), "the advisor's card did not wait for the older card stood for").toBe(false);
    r.m.unmount();
  });
});
