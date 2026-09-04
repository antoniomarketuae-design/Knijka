/**
 * =============================================================================
 * THE READ SHEET CUT ITS OWN LAST INSTRUCTION AND SAID NOTHING
 * — catalogue sweep 161, chunk routed to hud/SimOverlay.tsx, 2026-08-17.
 * =============================================================================
 *
 * THE FILED FRAME, and it reproduces on the deployed build before anything was
 * changed (`sc-hz-accident-scene/mobile-right/02-briefing.png`, and measured
 * character-by-character with the Range walk `tools/mobile/brief-fold.mjs` uses
 * on the peek — WebKit, real insets, iPhone 16 landscape 852 × 393):
 *
 *   section    672 × 341 at (90, 12) — AT its cap; there is no more room
 *   scroller   646 × 220 · clientH 220 · scrollH 256 · OVERFLOW 36 px
 *   title      286 authored · 286 visible (100 %)
 *   body       769 authored · 638 visible (83 %)
 *   LOST       «6. Щом подминеш сцената и платното пред теб е чисто, чак тогава
 *               се върни в средата на лентата и ускори плавно до края на
 *               отсечката.»
 *   announced  NOTHING — no counter, no fade, no scrollbar
 *
 * The card is BLOCKING and «Разбрах» is its only exit, 8 px under the cut. The
 * student acknowledges a six-step briefing having been shown five steps, and
 * the surface that did it is the one he was SENT TO because the peek could not
 * finish printing.
 *
 * WHAT THIS FILE HOLDS. The fix has a pure half and a CSS half, and jsdom is
 * not in this project's vitest (`environment: "node"`), so a rendered assertion
 * about a flex box's height would pass no matter what the markup said. The pure
 * half is `foldLinesBelow`; the CSS half is held by the source contract at the
 * bottom — the technique `notify-column.test.ts` and `briefingOverflow.test.tsx`
 * already use, for that reason.
 *
 * EVERY CASE BELOW FAILS ON THE PRE-FIX BEHAVIOUR IN ONE DIRECTION OR THE
 * OTHER, and the pairs are deliberate: a counter that returned 0 for everybody
 * would have made every frame in this sweep look clean while deleting the one
 * affordance the sheet is getting, which is the same crime as the silence it
 * replaces, pointing the other way.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isValidElement } from "react";
import { describe, expect, it } from "vitest";
import { collectProps, mountHook } from "./hookHarness";
import { SimOverlay } from "../SimOverlay";
import {
  foldLinesBelow,
  FOLD_FALLBACK_LEADING_PX,
  FOLD_SLACK_PX,
} from "../SimOverlay";

const SRC = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

/**
 * The source with its prose taken out. `briefingOverflow.test.tsx` needed this
 * and says why: this file's register is writing the reason down, and a source
 * assertion that cannot tell code from the paragraph explaining it is a ban on
 * explaining. Every assertion below runs on code.
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SRC);

/**
 * THE RULE AS IT SHIPPED ON 2026-08-16, written out so the tests can fail on
 * it rather than on a description of it. `scrollTop` is not in it.
 */
const shippedYesterday = (s: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): number => {
  const hidden = s.scrollHeight - s.clientHeight;
  return hidden > 2 ? Math.max(1, Math.round(hidden / 14)) : 0;
};

/**
 * The measured sheet, as it is AFTER the fade lands: 220 px of window over
 * 256 px of text plus the 10 px of bottom padding that is the fade's twin, and
 * a 16.5 px leading (`text-xs` at `leading-snug`).
 */
const SHEET = { scrollTop: 0, scrollHeight: 266, clientHeight: 220, padBottomPx: 10 };

describe("foldLinesBelow — the number the student is owed", () => {
  it("counts the 36 px the accident-scene sheet hides, in whole lines", () => {
    // 36 / 16.5 = 2.18 → 2 whole lines of the numbered body, which is exactly
    // what authored step 6 lays out as. This is the case the frame was filed
    // for, and the number the student is owed.
    expect(foldLinesBelow(SHEET, 16.5)).toBe(2);
  });

  it("does NOT count the fade's padding as a line of Bulgarian", () => {
    // Both windows pad their own bottom by `TEXT_FADE_PX` so that a text which
    // FITS is not faded, and padding joins the scrollable overflow in every
    // engine this ships on. Counting it announces a line that does not exist —
    // which is what the peek has been doing since its counter landed.
    expect(foldLinesBelow({ ...SHEET, padBottomPx: 0 }, 16.5)).toBe(3);
    expect(foldLinesBelow(SHEET, 16.5)).toBe(2);
  });

  it("REACHES ZERO once the reader is at the bottom — the half that was missing", () => {
    // 266 − 220 = 46 px of scroll range, of which 10 is the padding.
    const atEnd = { ...SHEET, scrollTop: 46 };
    expect(foldLinesBelow(atEnd, 16.5)).toBe(0);
    // …and this is the assertion that fails on what shipped: the counter kept
    // claiming three hidden lines to a reader who had already read them all.
    expect(shippedYesterday(atEnd)).toBe(3);
  });

  it("…and it is a REAL boundary, not a rule that credits every scroll", () => {
    // One line still under him is still one line. A counter that zeroed on the
    // first touch of the wheel would be the „fix everything by measuring
    // nothing" failure the other way round.
    expect(foldLinesBelow({ ...SHEET, scrollTop: 18 }, 16.5)).toBe(1);
    expect(foldLinesBelow({ ...SHEET, scrollTop: 33 }, 16.5)).toBe(1);
    expect(foldLinesBelow({ ...SHEET, scrollTop: 34 }, 16.5)).toBe(0);
  });

  it("says NOTHING when the text fits, and sub-pixel layout is not text", () => {
    expect(foldLinesBelow({ scrollTop: 0, scrollHeight: 230, clientHeight: 220, padBottomPx: 10 }, 16.5)).toBe(0);
    // The slack: a box that fits perfectly can report a fractional overflow, and
    // «↓ още 0 реда» on a card with nothing below it is a lie in the other
    // direction. Both sides of the threshold are asserted.
    expect(foldLinesBelow({ scrollTop: 0, scrollHeight: 232, clientHeight: 220, padBottomPx: 10 }, 16.5)).toBe(0);
    expect(foldLinesBelow({ scrollTop: 0, scrollHeight: 232.5, clientHeight: 220, padBottomPx: 10 }, 16.5)).toBe(1);
    expect(FOLD_SLACK_PX).toBe(2);
  });

  it("never rounds a real fold away to zero", () => {
    // 3 px of hidden text over a 24 px leading rounds to 0. It is still text the
    // student cannot see, so the floor is one — a fold that exists is announced.
    expect(Math.round(3 / 24)).toBe(0);
    expect(foldLinesBelow({ scrollTop: 0, scrollHeight: 223, clientHeight: 220 }, 24)).toBe(1);
  });

  it("falls back when the engine cannot answer for the leading", () => {
    // `line-height: normal` and jsdom both give NaN. 14 px is the peek's own
    // 11 px type at `leading-tight`, rounded up — the count degrades, the row
    // does not disappear.
    for (const bad of [Number.NaN, 0, -20, Number.POSITIVE_INFINITY]) {
      expect(foldLinesBelow({ scrollTop: 0, scrollHeight: 256, clientHeight: 200 }, bad)).toBe(
        Math.round(56 / FOLD_FALLBACK_LEADING_PX),
      );
    }
  });
});

describe("the sheet carries the affordances the peek has had since 2026-08-14", () => {
  /** The open sheet's own markup — from its handle to the end of the file. */
  const SHEET_CODE = CODE.slice(CODE.indexOf('data-hud="overlay-read"'));

  it("announces the fold, with a handle a probe can find", () => {
    // The probe that measured the defect reports „announced: NOTHING" by
    // looking for exactly this attribute; before this wave there was none.
    expect(SHEET_CODE).toContain("data-sim-overlay-sheet-fold");
    expect(SHEET_CODE).toMatch(/sheetFold\.lines > 0 \?/);
    expect(SHEET_CODE).toContain("↓ още {sheetFold.lines}");
  });

  it("puts that row OUTSIDE the scroll window, and costs it NO authored text", () => {
    // Two rules, and the second is the one that decided the placement.
    //
    // `BriefingCard` states the first and this sweep is why: the phone's
    // counter was filed twice for covering the sentence it was counting. So the
    // row may not be inside the scroller.
    //
    // The second is arithmetic. The section is a `flex-col gap-2` AT its cap
    // and the scroller is its only shrinkable child, so a fourth row would take
    // 10 px of its own plus an 8 px gap out of the text — 36 px of fold becomes
    // 54, i.e. a THIRD line hidden to announce that two were. The header row is
    // 44 px of button already and the chip beside it is `flex-1 truncate`, so
    // there the row is free. Under THEO-4 the text is the lesson.
    // The header row is: tone glyph · chip · THIS COUNTER · «Затвори» ✕. Pinning
    // it between the chip and the ✕ says both things at once — it is in the
    // header (so the section still has three children and the scroller keeps
    // every pixel it had) and it is not floating loose in the dialog.
    // ── THE ANCHOR IS THE ELEMENT'S HANDLE, NOT ITS COPY — 2026-09-04.
    //    It read `{shown.chipBg ?? ""}` verbatim, i.e. it located this row by
    //    the exact expression the chip printed. `sc-junction-gap:4c2e452f` gave
    //    the sheet's chip the fault's CLASS beside its mark, so the expression
    //    changed and this case failed on a rewrite of a STRING while every
    //    claim it makes — the counter is in the header, after the chip, before
    //    the ✕, outside the scroller — stayed exactly as true. The expectation
    //    is re-pointed at `data-sim-overlay-sheet-chip`, which is what the chip
    //    IS rather than what it happens to say today.
    const chip = SHEET_CODE.indexOf("data-sim-overlay-sheet-chip");
    const foldRow = SHEET_CODE.indexOf("data-sim-overlay-sheet-fold");
    const closeX = SHEET_CODE.indexOf('aria-label="Затвори"');
    const scroller = SHEET_CODE.indexOf("data-sim-overlay-sheet-text");
    expect(chip).toBeGreaterThan(-1);
    expect(foldRow, "the counter is not beside the chip").toBeGreaterThan(chip);
    expect(foldRow, "the counter is past the header's ✕").toBeLessThan(closeX);
    expect(foldRow, "the counter is inside the window it counts").toBeLessThan(scroller);
  });

  it("fades its own cut instead of guillotining it, with the peek's own number", () => {
    // The filed frame shows the ascenders of «6.» sliced flat 8 px above a
    // solid blue button, which reads as a rendering fault rather than as „there
    // is more". `padding-bottom` matches the fade so a text that FITS is not
    // faded at all — the 2026-08-14 pairing, now on both windows.
    const sheetStyle = SHEET_CODE.slice(
      SHEET_CODE.indexOf("data-sim-overlay-sheet-text"),
      SHEET_CODE.indexOf("{renderDetail ?"),
    );
    expect(sheetStyle).toContain("WebkitMaskImage");
    expect(sheetStyle).toContain("maskImage");
    expect(sheetStyle).toContain("paddingBottom: `${TEXT_FADE_PX}px`");
    // One number for both windows, not two that agree today.
    expect(CODE).toContain("const TEXT_FADE_PX = 10;");
    expect(sheetStyle).toContain('touchAction: "pan-y"');
  });

  it("wires BOTH windows to onScroll, or the zero above can never be reached", () => {
    // The counter is only honest if it is recomputed when the reader moves.
    // `ResizeObserver` alone fires on resize, and scrolling is not a resize.
    expect(CODE).toContain("onScroll={peekFold.onScroll}");
    expect(CODE).toContain("onScroll={sheetFold.onScroll}");
  });

  it("keeps the peek's own counter outside its window too", () => {
    const peek = CODE.slice(
      CODE.indexOf("data-sim-overlay-text"),
      CODE.indexOf("data-hud=\"overlay-read\""),
    );
    const window = peek.indexOf("data-sim-overlay-text");
    const closes = peek.indexOf("data-sim-overlay-fold");
    const controls = peek.indexOf("cardIsDismissButton ? null :");
    expect(closes).toBeGreaterThan(window);
    expect(closes).toBeLessThan(controls);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   §RUN — THE CARD IS MOUNTED AND `useFoldLines` REALLY MEASURES.

   ── WHY, MEASURED ──────────────────────────────────────────────────────────

   `foldWindowPx`, `foldMaskCss` and `foldLinesBelow` above are pure and are
   called for real, so the ARITHMETIC of the cut is genuinely guarded. What was
   not guarded is that anything runs it. THE MUTATION, 2026-08-19:

       const measure = useCallback(() => {}, []);        ← the hook's new body
       const measureUnreachable = useCallback(() => {    ← the old one, intact
         const el = ref.current;
         …

   Every string these files grep for survived — `clientHeight: win.bottomPx`,
   `maskImage: peekFold.maskCss`, `onScroll={peekFold.onScroll}`, all of it —
   because the body was still in the file, just unreachable. `sim-overlay-fold`
   and `sim-overlay-line-grid` RAN 28/28 GREEN TOGETHER against a card that
   never measures anything: the mask stays the 2026-08-14 fixed 10 px band on
   every window, which is the decapitation in all three filed frames, and the
   counter stays at 0 so «↓ още N реда» never appears at all.

   So this section mounts the real `SimOverlay`, hands the peek's scroll window
   a stand-in with the boxes off `sc-rb-exit-signal`'s own frame, fires the
   `ResizeObserver` the engine would fire after layout, and reads the mask and
   the counter the component PUBLISHED — off the returned tree, not off the
   file. `hookHarness.ts` carries the technique and its limits.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * THE PEEK OF `sc-rb-exit-signal`, AS A SCROLL WINDOW.
 *
 * Same two rows as the pure fixtures at the top of `sim-overlay-line-grid`:
 * two lines of `text-[11px] leading-tight` title and eleven of `leading-snug`
 * body, in a window the column's cap resolved to 96 px. Every number here is a
 * box the engine would have reported; nothing is chosen to make a test pass.
 */
function rbExitSignalWindow() {
  const TITLE = 13.75;
  const BODY = 15.125;
  const rows = [
    { top: 0, height: 2 * TITLE, lineHeight: TITLE, body: false },
    // …and the SECOND row is the explanation, which the window's `measure` now
    // picks out by attribute for `whyIsReachable`. The stand-in carries the
    // attribute because the real `<p>` does: a fake that answered `null` here
    // would model a card with no WHY at all, which reads as REACHABLE — the
    // reassuring direction, in the fixture rather than in the code.
    { top: 2 * TITLE + 2, height: 11 * BODY, lineHeight: BODY, body: true },
  ];
  const el = {
    scrollTop: 0,
    clientHeight: 96,
    scrollHeight: 2 * TITLE + 2 + 11 * BODY + 10,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 180, height: 96 }),
    children: rows.map((r) => ({
      getBoundingClientRect: () => ({ top: r.top, left: 0, width: 180, height: r.height }),
      getAttribute: (name: string) =>
        name === "data-sim-overlay-body" && r.body ? "" : null,
      __lineHeight: r.lineHeight,
    })),
    __paddingBottom: 10,
  };
  return el;
}

/** `getComputedStyle` for exactly the two properties `measure` asks for. */
function computedStyleFor(node: unknown): { lineHeight: string; paddingBottom: string } {
  const n = node as { __lineHeight?: number; __paddingBottom?: number };
  return {
    lineHeight: n.__lineHeight === undefined ? "normal" : `${n.__lineHeight}px`,
    paddingBottom: n.__paddingBottom === undefined ? "0px" : `${n.__paddingBottom}px`,
  };
}

/** A teach card long enough to overflow its window — the filed one. */
const RB_ITEM = {
  id: "rb-exit-signal-instruction",
  kind: "teach",
  tone: "teach",
  chipBg: "ИНСТРУКЦИИ",
  lineBg: "Преди отклонението стои знак „Път с предимство“.",
  detailBg:
    "1. Там винаги е Б1 или Б2 — прочети го, преди да завиеш.\n" +
    "2. Забележи края на лентата и пусни мигача навреме.\n" +
    "3. Погледни в дясното огледало, после през рамо.\n" +
    "4. Влез в лентата без да режеш линията.\n" +
    "5. Изравни скоростта с потока.\n" +
    "6. Изключи мигача, щом си в лентата.",
};

/** Mount the card, hand the peek window its boxes, and let the engine measure. */
function mountPeek() {
  const el = rbExitSignalWindow();
  const mounted = mountHook(
    () =>
      SimOverlay({
        item: RB_ITEM,
        queued: 0,
      } as unknown as Parameters<typeof SimOverlay>[0]),
    { globals: { getComputedStyle: computedStyleFor } },
  );

  // The scroll window's ref is read OFF THE TREE rather than out of a slot
  // index: the element that carries `data-sim-overlay-text` is the window by
  // definition, and an index is a number that silently means something else the
  // next time a hook is added above it.
  const windows = collectProps(mounted.value, (p) => "data-sim-overlay-text" in p);
  expect(windows.length, "the peek must still render exactly one scroll window").toBe(1);
  const ref = windows[0]!.ref as { current: unknown };
  expect(ref, "the window must still carry the fold hook's ref").toBeTruthy();
  ref.current = el;

  // Now the effects can attach: `useFoldLines` bails out while `ref.current` is
  // null, which is exactly where React is on the first commit.
  mounted.settle(1);
  return { mounted, el, ref };
}

/** The mask the card published for its peek window, off the rendered tree. */
function peekMask(tree: unknown): string {
  const windows = collectProps(tree, (p) => "data-sim-overlay-text" in p);
  const style = (windows[0]?.style ?? {}) as Record<string, unknown>;
  return String(style.maskImage ?? style.WebkitMaskImage ?? "");
}

/**
 * The «↓ още N реда» the card is currently printing, flattened to text.
 *
 * The children are `["↓ още ", 4, " ", "реда"]` — a fragment, not a string —
 * so a walker that only collected STRING children would find „↓ още " and drop
 * the number, i.e. it would report a counter without ever reading what it
 * counts. That is the reassuring direction, so the number is joined back in.
 */
function foldCounters(tree: unknown): string[] {
  const flatten = (node: unknown): string => {
    if (Array.isArray(node)) return node.map(flatten).join("");
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (!isValidElement(node)) return "";
    const props = node.props as { children?: unknown };
    return props.children === undefined ? "" : flatten(props.children);
  };
  return collectProps(tree, (p) => "data-sim-overlay-fold" in p).map((p) =>
    flatten((p as { children?: unknown }).children).replace(/s+/g, " ").trim(),
  );
}

describe("§RUN the mounted card measures its own window", () => {
  it("THE MUTATION ROW: the published mask is the SNAPPED one, not the fixed band", () => {
    const { mounted, el } = mountPeek();
    const before = peekMask(mounted.rerender());
    // Nothing has been laid out yet in the harness's terms, so this is the
    // initial state the hook starts in — the 2026-08-14 gradient. It is
    // asserted so the row below is a CHANGE and not a coincidence.
    expect(before).toBe("linear-gradient(to bottom, #000 calc(100% - 10px), transparent)");

    mounted.observers.forEach((o) => o.fire());
    const after = peekMask(mounted.rerender());

    // 90 px is the last body line-box edge that fits a 96 px window — the same
    // number the pure `foldWindowPx` fixture at the top of
    // `sim-overlay-line-grid.test.ts` derives from these very boxes.
    expect(after).toBe(
      "linear-gradient(to bottom, transparent 0px, #000 0px, #000 90px, transparent 90px)",
    );
    // …and the band that halved «там винаги е Б1 или Б2» is gone from it.
    expect(after).not.toContain("calc(100% -");
    expect(el.clientHeight, "the harness must not have moved the window").toBe(96);
    mounted.unmount();
  });

  it("…and the counter it announces is measured off the CUT, not off the raw box", () => {
    // A DIFFERENT WINDOW ON PURPOSE, and the reason is a mutation that walked
    // through the first one. On the rb-exit-signal boxes the cut (90 px) and
    // the box (96 px) both round to SEVEN hidden lines, so feeding the counter
    // `el.clientHeight` instead of `win.bottomPx` — the exact regression this
    // pair exists to prevent — left the row green. These are the boxes from
    // `sim-overlay-line-grid`s own `foldLinesBelow` fixture, where the two
    // answers differ: FOUR hidden lines off the cut, THREE off the box.
    const el = rbExitSignalWindow();
    el.clientHeight = 98;
    el.scrollHeight = 160;
    el.children = [
      {
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 180, height: 150 }),
        getAttribute: () => null,
        __lineHeight: 15,
      },
    ];
    const mounted = mountHook(
      () => SimOverlay({ item: RB_ITEM, queued: 0 } as unknown as Parameters<typeof SimOverlay>[0]),
      { globals: { getComputedStyle: computedStyleFor } },
    );
    const windows = collectProps(mounted.value, (p) => "data-sim-overlay-text" in p);
    (windows[0]!.ref as { current: unknown }).current = el;
    mounted.settle(1);
    expect(foldCounters(mounted.rerender()), "a card that has not measured announces nothing").toEqual([]);

    mounted.observers.forEach((o) => o.fire());
    // Six lines are readable and four are not. „3" here is the counter reading
    // the box the snap already stopped showing a line of — a clean edge bought
    // with a lie, which is this defect one row further down.
    expect(foldCounters(mounted.rerender())).toEqual(["↓ още 4 реда"]);
    mounted.unmount();
  });

  it("THE OPPOSITE DIRECTION: a window whose text FITS is not cut and says nothing", () => {
    // The false-failure half. A card that announced a fold on a text that fits,
    // or faded a line that is fully visible, would be this defect pointing the
    // other way — and «↓ още 0 реда» under a complete sentence is a lie the
    // student has no way to check.
    const el = rbExitSignalWindow();
    el.clientHeight = 400;
    el.scrollHeight = 200;
    el.children = [
      {
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 180, height: 60 }),
        getAttribute: () => null,
        __lineHeight: 15.125,
      },
    ];
    const mounted = mountHook(
      () => SimOverlay({ item: RB_ITEM, queued: 0 } as unknown as Parameters<typeof SimOverlay>[0]),
      { globals: { getComputedStyle: computedStyleFor } },
    );
    const windows = collectProps(mounted.value, (p) => "data-sim-overlay-text" in p);
    (windows[0]!.ref as { current: unknown }).current = el;
    mounted.settle(1);
    mounted.observers.forEach((o) => o.fire());

    const mask = peekMask(mounted.rerender());
    // The 2026-08-14 gradient, character for character: nothing is hidden, so
    // there is no grid edge to snap to and the plain fade is correct.
    expect(mask).toBe("linear-gradient(to bottom, #000 calc(100% - 10px), transparent)");
    expect(foldCounters(mounted.rerender())).toEqual([]);
    mounted.unmount();
  });

  it("the ResizeObserver watches the ROWS and not only the box", () => {
    // The window keeps its size while the text inside it changes — a longer
    // item resizes the rows, not the box — so an observer on the box alone
    // measures once and never again. Both children are enrolled beside it.
    const { mounted, el } = mountPeek();
    const observing = mounted.observers.flatMap((o) => o.targets);
    expect(observing).toContain(el);
    for (const child of el.children) expect(observing).toContain(child);
    mounted.unmount();
  });

  it("the subscription does not outlive the card", () => {
    const { mounted } = mountPeek();
    expect(mounted.observers.length).toBeGreaterThan(0);
    const targets = mounted.observers.map((o) => o.targets);
    mounted.unmount();
    for (const t of targets) expect(t.length, "an observer survived the unmount").toBe(0);
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * ONE COUNT PER CARD — 2026-08-27, and the frame that made it a defect.
   *
   * `w12/frames/sc-junction-blind__mobile-right/04-t058s.png`, iPhone 16
   * landscape, cropped 2.2×. One card, twelve pixels between them:
   *
   *     преди 3 с        ↓ ОЩЕ 10 РЕДА
   *     ЗАЩО ↓8    ✕
   *
   * Neither number is wrong. `peekFold.lines` counts every line under the cut —
   * on that frame the folded THIRD LINE of the fault's own name is one of them —
   * and `whyFoldedLines` counts the explanation only. That is exactly why they
   * may not both be printed: a student who has just been charged −10 for an
   * ОПАСНА ГРЕШКА reads two counts of one fold and concludes the grader cannot
   * count. The one with a 44 px tap behind it is the one that speaks.
   *
   * BOTH DIRECTIONS ARE HERE, because suppressing the label unconditionally
   * would delete the only fold affordance a card with no «Защо» chip has —
   * `sc-park-zebra__mobile-right/04-t002s.png`'s «↓ ОЩЕ 1 РЕД» is that card.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  it("the chip carries the count, so the label stands down", () => {
    // The real peek: a title row and an identified BODY row, i.e. the shape
    // every violation and every briefing has on the glass.
    const { mounted } = mountPeek();
    mounted.observers.forEach((o) => o.fire());
    const tree = mounted.rerender();

    // 4 of 11 body lines are inside the cut, so `whyIsReachable` is false and
    // the chip is the surface that reports the size of what it holds.
    const why = collectProps(tree, (p) => "aria-expanded" in p);
    expect(why.length, "the «Защо» chip must still be on the card").toBe(1);
    const label = String((why[0] as { children?: unknown }).children ?? "");
    expect(label, "the chip stopped naming the size of what it holds").toContain("↓");

    // THE ANTI-VACUITY HALF, and it is the whole value of this row: the label
    // is silent because it STOOD DOWN, not because there was nothing to say.
    // `data-sim-overlay-text-cut` is `hasDetail && peekFold.lines > 0` — the
    // same measured counter the band prints — so its presence proves the band
    // had a number and did not print it.
    const windows = collectProps(tree, (p) => "data-sim-overlay-text" in p);
    expect(
      (windows[0] as { "data-sim-overlay-text-cut"?: string })["data-sim-overlay-text-cut"],
      "nothing was folded here — this fixture no longer tests the dedup",
    ).toBe("");

    // …and the 10 px band beside the stamp says nothing, because the chip has.
    expect(
      foldCounters(tree),
      "two counters for one fold — the sc-junction-blind reading",
    ).toEqual([]);
    mounted.unmount();
  });
});
