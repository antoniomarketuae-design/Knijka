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
import { describe, expect, it } from "vitest";
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
    const chip = SHEET_CODE.indexOf("{shown.chipBg ?? \"\"}");
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
