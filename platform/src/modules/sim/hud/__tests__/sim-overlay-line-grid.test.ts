/**
 * =============================================================================
 * THE CARD CUT THE LETTERS IN HALF — twenty-nine findings, twenty-three lessons
 * — catalogue sweep 161, chunk routed to hud/SimOverlay.tsx, 2026-08-18.
 * =============================================================================
 *
 * THE FILED SENTENCE, verbatim, on twenty-three different lessons:
 *
 *   „The teach card clips its body text THROUGH THE MIDDLE OF A LINE OF GLYPHS
 *    — the last visible row is sliced horizontally in half — and then offers
 *    «↓ ОЩЕ N РЕДА»."
 *
 * THREE FRAMES OPENED AT DEVICE RESOLUTION (2556 × 1179 = iPhone 16 landscape
 * 852 × 393 at dpr 3), three lessons, one picture:
 *
 *   sc-rb-exit-signal/mobile-right/04-t035s.png
 *     «стои знак „Път с предимство“» whole · «там винаги е Б1 или Б2» with its
 *     top half inked and the rest gone · «↓ още 9 реда»
 *   sc-jx-blocked-exit/mobile-right/06-waited.png
 *     «нещо тук. На червено се спира» whole · «напълно ПРЕД линията — без» cut
 *     through the waist · «↓ още 7 реда»
 *   sc-merge-lane-end/mobile-right/04-t115s.png   (car moving, 19 км/ч)
 *     «твое, не на другите.» whole · «2. Забележи края на лентата» halved
 *
 * THE CAUSE IS ARITHMETIC, NOT CHANCE. The body is `text-[11px] leading-snug`
 * — an 11 × 1.375 = 15.125 px line box — and the window's bottom band was a
 * FIXED 10 px fade. The window's height is whatever the notification column's
 * cap leaves after rows 1, 2c and 3, which is a multiple of nothing, so the
 * line that straddles the opaque edge keeps `(clientHeight − 10) mod 15.125`
 * px of full-strength ink: between 0 and 5.1 px of a line whose cap height is
 * about 8 px. Glyph tops at declining alpha — every time, on every lesson.
 *
 * WHAT THIS FILE HOLDS. `foldWindowPx` moves the cut onto the line grid and
 * `foldMaskCss` emits it; both are pure and exported for the reason the file
 * beside this one gives — vitest runs `environment: "node"` here, so a
 * rendered assertion about a flex box's height would pass whatever the markup
 * said. The wiring (both windows read the measured mask, and the counter is
 * fed the CUT rather than the box) is held by the source contract at the end,
 * the technique `sim-overlay-fold.test.ts` and `notify-column.test.ts` use.
 *
 * EVERY CASE BELOW FAILS ON THE PRE-2026-08-18 BEHAVIOUR IN ONE DIRECTION OR
 * THE OTHER, and the pairs are deliberate. A snap that fired on every window
 * would delete a line the student can already read — a false failure and a
 * false pass are the same crime — so „it does not cut when nothing overflows"
 * and „it does not cut a row whose line grid it cannot see" are asserted just
 * as hard as the cut itself.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  foldLinesBelow,
  foldMaskCss,
  foldWindowPx,
  FOLD_SLACK_PX,
  type FoldRow,
} from "../SimOverlay";

const SRC = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

/**
 * The source with its prose taken out. This file's register is writing the
 * reason down, and a source assertion that cannot tell code from the paragraph
 * explaining it is a ban on explaining.
 */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CODE = stripComments(SRC);

/** The band that shipped until 2026-08-18, so the tests can fail on it. */
const FIXED_BAND_PX = 10;

/* ───────────────────────────────────────────────────────────────────────────
   THE PEEK OF `sc-rb-exit-signal`, AS ITS BOXES LAY OUT.

   Inside the scroll window there are exactly two rows, and they lead at
   different sizes — which is half of why a single fixed band could never sit on
   a boundary:

     row 2   the line   `text-[11px] leading-tight` → 11 × 1.25   = 13.75 px
     row 2b  the body   `text-[11px] leading-snug`  → 11 × 1.375  = 15.125 px

   separated by the card's own `gap-0.5` = 2 px. The filed frame shows two lines
   of title and eleven of body, in a window the column's cap resolved to 96 px.
   ─────────────────────────────────────────────────────────────────────────── */
const TITLE_LEADING = 13.75;
const BODY_LEADING = 15.125;
const RB_ROWS: FoldRow[] = [
  { offsetTop: 0, heightPx: 2 * TITLE_LEADING, lineHeightPx: TITLE_LEADING },
  { offsetTop: 2 * TITLE_LEADING + 2, heightPx: 11 * BODY_LEADING, lineHeightPx: BODY_LEADING },
];
const RB_WINDOW = { scrollTop: 0, clientHeight: 96 };

describe("foldWindowPx — the cut goes between the line boxes, never inside one", () => {
  it("moves the rb-exit-signal cut off the middle of «там винаги е Б1 или Б2»", () => {
    const win = foldWindowPx(RB_ROWS, RB_WINDOW);

    // The body's grid: 29.5, 44.625, 59.75, 74.875, 90, 105.125 …
    // 90 is the last edge that fits a 96 px window (plus the 2 px of slack the
    // counter already uses for sub-pixel layout).
    expect(win.bottomPx).toBeCloseTo(90, 6);

    // AND THIS IS THE ASSERTION THAT FAILS ON WHAT SHIPPED. The fixed band put
    // the opaque edge at 96 − 10 = 86, which is 11.125 px into a 15.125 px line
    // box: that line kept 74 % of its height at full ink and lost the rest —
    // the decapitation in all three frames. A boundary is a boundary; 86 is not.
    const shippedEdge = RB_WINDOW.clientHeight - FIXED_BAND_PX;
    const intoTheLineBox = (shippedEdge - (2 * TITLE_LEADING + 2)) % BODY_LEADING;
    expect(intoTheLineBox).toBeGreaterThan(0);
    expect(intoTheLineBox).toBeCloseTo(11.125, 6);
    expect(win.bottomPx).not.toBe(shippedEdge);
  });

  it("lands on the grid for EVERY window height, where the band did so by luck", () => {
    // The window's height is the column's cap minus three rows of chrome: an
    // arbitrary number that moves with orientation, safe-area insets, Dynamic
    // Type and browser zoom. A fix that only holds on one of them is the „sized
    // against a pilot trace" trap this project has already paid for twice, so
    // the whole ladder from the tightest cap (780 × 360 leaves ~67 px) to the
    // 8 rem ceiling is swept.
    const bodyTop = 2 * TITLE_LEADING + 2;
    /** How far the opaque edge sits from the nearest line-box boundary. */
    const offGrid = (edge: number): number => {
      const k = (edge - bodyTop) / BODY_LEADING;
      return (
        BODY_LEADING * Math.min(Math.abs(k - Math.floor(k)), Math.abs(Math.ceil(k) - k))
      );
    };

    let bandOffGrid = 0;
    for (let clientHeight = 60; clientHeight <= 128; clientHeight += 1) {
      const win = foldWindowPx(RB_ROWS, { ...RB_WINDOW, clientHeight });
      expect(win.hardEdge, `window ${clientHeight} has 11 lines under it`).toBe(true);
      // Within the sub-pixel slack of a boundary — never 11 px into a line box.
      expect(
        offGrid(win.bottomPx),
        `window ${clientHeight} cut at ${win.bottomPx}`,
      ).toBeLessThanOrEqual(FOLD_SLACK_PX);
      if (offGrid(clientHeight - FIXED_BAND_PX) > FOLD_SLACK_PX) bandOffGrid += 1;
    }
    // …and the same sweep against the band that shipped: it cut into the
    // letters on 52 of the 69 heights in the ladder. The seventeen it got right
    // are the accident that let this survive three waves of screenshots — and
    // 96 px, the height the filed frames were taken at, is not one of them.
    expect(bandOffGrid).toBe(52);
    expect(offGrid(96 - FIXED_BAND_PX)).toBeCloseTo(4, 6);
  });

  it("does NOT cut a window whose text fits — the other direction", () => {
    // A snap that fired on everybody would hide a line the student can already
    // read, which is the same crime as the slice, pointing the other way.
    const short: FoldRow[] = [
      { offsetTop: 0, heightPx: 2 * TITLE_LEADING, lineHeightPx: TITLE_LEADING },
      { offsetTop: 2 * TITLE_LEADING + 2, heightPx: 2 * BODY_LEADING, lineHeightPx: BODY_LEADING },
    ];
    const win = foldWindowPx(short, RB_WINDOW);
    expect(win).toEqual({ topPx: 0, bottomPx: 96, hardEdge: false });
    // …and the mask it produces is the 2026-08-14 gradient, unchanged.
    expect(foldMaskCss(win)).toBe(
      "linear-gradient(to bottom, #000 calc(100% - 10px), transparent)",
    );

    // AND THE CASE THAT ACTUALLY PINS THE OVERFLOW TEST, because the two
    // refusals below it would have covered the one above by luck: six whole
    // lines ending 6 px short of a 96 px floor. That last edge is well inside
    // one line box of the floor, so nothing but „is anything hidden at all"
    // stands between this window and a hard cut announced where there is no
    // fold — a card claiming a fold it does not have is the counter's own
    // failure mode, pointing backwards.
    const justFits: FoldRow[] = [{ offsetTop: 0, heightPx: 6 * 15, lineHeightPx: 15 }];
    expect(foldWindowPx(justFits, { scrollTop: 0, clientHeight: 96 })).toEqual({
      topPx: 0,
      bottomPx: 96,
      hardEdge: false,
    });
  });

  it("refuses to snap past a row whose line grid it cannot see", () => {
    // `renderDetail` mounts a whole PreDriveChecklist into the sheet's window.
    // Its `line-height` says nothing about its insides, so the only edges it
    // offers are its own two — and snapping to its TOP would hide 153 px of
    // checklist to tidy a 6 px edge. A partial line is at most one line box
    // tall; a snap that costs more than that is not landing on a text grid.
    const withBlock: FoldRow[] = [
      { offsetTop: 0, heightPx: 2 * 19.25, lineHeightPx: 19.25 },
      { offsetTop: 46.5, heightPx: 300, lineHeightPx: Number.NaN },
    ];
    const win = foldWindowPx(withBlock, { scrollTop: 0, clientHeight: 200 });
    expect(win.bottomPx).toBe(200);
    // The guard is a THRESHOLD, not a blanket refusal: the same block one line
    // box away from the edge is snapped to, because that is a partial line.
    const nearEdge: FoldRow[] = [
      { offsetTop: 0, heightPx: 2 * 19.25, lineHeightPx: 19.25 },
      { offsetTop: 46.5, heightPx: 300, lineHeightPx: Number.NaN },
    ];
    expect(foldWindowPx(nearEdge, { scrollTop: 0, clientHeight: 55 }).bottomPx)
      .toBeCloseTo(46.5, 6);
  });

  it("never blanks a window too short for one line box", () => {
    // The `minHeight: 2.375rem` floor exists so this cannot happen at any size
    // that ships. If it ever does, a sliced line is still something and an
    // empty card is nothing — and an empty card is not reportable.
    const win = foldWindowPx([{ offsetTop: 0, heightPx: 150, lineHeightPx: 15 }], {
      scrollTop: 0,
      clientHeight: 10,
    });
    expect(win).toEqual({ topPx: 0, bottomPx: 10, hardEdge: false });
  });

  it("snaps the TOP too — sweep row 16 is «clipped at BOTH ends»", () => {
    const rows: FoldRow[] = [{ offsetTop: 0, heightPx: 150, lineHeightPx: 15 }];
    // Scrolled 40 px into a 15 px grid: the first whole line starts at 45.
    const scrolled = foldWindowPx(rows, { scrollTop: 40, clientHeight: 60 });
    expect(scrolled.topPx).toBeCloseTo(5, 6);
    // …and at rest there is nothing above the reader, so nothing is masked off
    // the top. A top band that was always on would eat the title.
    expect(foldWindowPx(rows, { scrollTop: 0, clientHeight: 60 }).topPx).toBe(0);
  });

  it("keeps the sub-pixel slack the counter already uses", () => {
    // A box that fits perfectly can report a fractional overflow. Cutting a
    // line off such a window would be the slice, self-inflicted, on a card with
    // nothing hidden at all.
    const rows: FoldRow[] = [{ offsetTop: 0, heightPx: 60 + FOLD_SLACK_PX, lineHeightPx: 15 }];
    expect(foldWindowPx(rows, { scrollTop: 0, clientHeight: 60 }).bottomPx).toBe(60);
    const realOverflow: FoldRow[] = [{ offsetTop: 0, heightPx: 75, lineHeightPx: 15 }];
    expect(foldWindowPx(realOverflow, { scrollTop: 0, clientHeight: 62 }).bottomPx).toBeCloseTo(60, 6);
  });
});

describe("«↓ още N реда» counts against the CUT, not against the box", () => {
  /**
   * Ten 15 px lines in a 98 px window: six fit whole, the seventh straddles.
   *   scrollHeight  150 of text + 10 of the fade's twin padding = 160
   *   the cut       90 = six whole lines
   */
  const ROWS: FoldRow[] = [{ offsetTop: 0, heightPx: 150, lineHeightPx: 15 }];
  // `padBottomPx` belongs to `foldLinesBelow` alone: `scrollHeight` counts the
  // fade's twin padding as if it were text, and `foldWindowPx` works from the
  // rows, which are text and nothing else.
  const SCROLL = { scrollTop: 0, scrollHeight: 160, clientHeight: 98, padBottomPx: 10 };

  it("reports FOUR hidden lines where the box arithmetic reported three", () => {
    const win = foldWindowPx(ROWS, SCROLL);
    expect(win.bottomPx).toBeCloseTo(90, 6);

    // What ships now: six lines are readable, four are not.
    expect(foldLinesBelow({ ...SCROLL, clientHeight: win.bottomPx }, 15)).toBe(4);

    // What shipped before, and it is the fix's own trap: with the snap in and
    // the counter still reading the BOX, the card would hide line 7 outright
    // and go on announcing three. A clean edge bought with a lie is this defect
    // one row further down.
    expect(foldLinesBelow(SCROLL, 15)).toBe(3);
  });

  it("still reaches zero at the bottom, and still says nothing when it fits", () => {
    // The 2026-08-17 half of the rule is untouched by the snap: a reader at the
    // end of a window that has been cut is still at the end.
    const atEnd = { ...SCROLL, scrollTop: 160 - 98 };
    const win = foldWindowPx(ROWS, { ...atEnd });
    expect(foldLinesBelow({ ...atEnd, clientHeight: win.bottomPx }, 15)).toBe(0);

    const fits = { scrollTop: 0, scrollHeight: 70, clientHeight: 98, padBottomPx: 10 };
    const fitRows: FoldRow[] = [{ offsetTop: 0, heightPx: 60, lineHeightPx: 15 }];
    const fitWin = foldWindowPx(fitRows, fits);
    expect(fitWin.bottomPx).toBe(98);
    expect(foldLinesBelow({ ...fits, clientHeight: fitWin.bottomPx }, 15)).toBe(0);
  });
});

describe("foldMaskCss — a hard edge on the grid, or the old band when there is none", () => {
  it("emits two coincident stops, so no line is ever dimmed through its waist", () => {
    const css = foldMaskCss({ topPx: 0, bottomPx: 90, hardEdge: true });
    expect(css).toBe(
      "linear-gradient(to bottom, transparent 0px, #000 0px, #000 90px, transparent 90px)",
    );
    // The band that halved the letters is GONE from this branch. A gradient
    // that ends inside a line box ends inside its letters, whatever its width —
    // which is why widening the 2026-08-14 fade was never the answer.
    expect(css).not.toContain("calc(100% -");
  });

  it("masks the top as well once the reader has scrolled", () => {
    expect(foldMaskCss({ topPx: 5, bottomPx: 90, hardEdge: true })).toBe(
      "linear-gradient(to bottom, transparent 5px, #000 5px, #000 90px, transparent 90px)",
    );
  });

  it("hands back the 2026-08-14 gradient, character for character, when nothing is cut", () => {
    // Its remaining job: keep a text that FITS from being faded at all, which
    // it does because `padding-bottom` is the same 10 px.
    expect(foldMaskCss({ topPx: 0, bottomPx: 98, hardEdge: false })).toBe(
      "linear-gradient(to bottom, #000 calc(100% - 10px), transparent)",
    );
  });

  it("still cuts hard when the grid edge lands ON the floor — the inferred-flag trap", () => {
    // `bottomPx === clientHeight` is NOT „nothing is hidden": a grid edge inside
    // the 2 px slack sits on the window's floor while ten lines are still under
    // it. Inferring the branch from the numbers would put the fixed band back on
    // exactly those windows and fade the bottom two thirds of a whole line.
    const rows: FoldRow[] = [{ offsetTop: 0, heightPx: 150, lineHeightPx: 15 }];
    const win = foldWindowPx(rows, { scrollTop: 0, clientHeight: 74 });
    expect(win.bottomPx).toBe(74);
    expect(win.hardEdge).toBe(true);
    expect(foldMaskCss(win)).not.toContain("calc(100% -");
  });
});

describe("the wiring — both windows read the measured mask, and the counter reads the cut", () => {
  it("neither window hardcodes the fixed band any more", () => {
    // The regression this catches is one character of an edit away: pasting the
    // literal gradient back into either style object restores the slice on
    // twenty-three lessons and changes nothing a pure test can see.
    //
    // RE-ANCHORED 2026-08-19. This used to be „there are exactly two masked
    // elements in this file", which stopped being true the moment the card got
    // its ground: `peekScrimMaskCss()` is a THIRD mask, and it is a shade's
    // vertical feather, not a text window's cut. A bare count would have failed
    // on a correct change — and the lazy repair (`toHaveLength(3)`) would have
    // left the third declaration unchecked, which is a hole exactly the size of
    // the defect this file was written for. So the declarations are PARTITIONED
    // instead: every mask in the file must be one of the two known kinds, and
    // the fold windows must still be two.
    //
    // EACH DECLARATION IS ITS OWN LINE AND NOTHING MORE. The first attempt read
    // a 120-character window after the property name, and a mutation walked
    // straight through it: replacing the shade's mask with a literal still
    // passed, because the window reached the `maskImage: peekScrimMaskCss()` on
    // the NEXT line and classified the literal by its neighbour. In the
    // reassuring direction, as always.
    const decls = CODE.split("WebkitMaskImage:")
      .slice(1)
      .map((d) => d.slice(0, d.indexOf("\n")).trim().replace(/,$/, ""));
    expect(decls.every((d) => d.length > 0)).toBe(true);
    const folds = decls.filter((d) => /^(peekFold|sheetFold)\.maskCss$/.test(d));
    const scrims = decls.filter((d) => /^peekScrimMaskCss\(\)$/.test(d));
    // Nothing unaccounted for: a fourth masked element has to be classified
    // here before this file will go green again.
    expect(folds.length + scrims.length).toBe(decls.length);
    expect(folds).toHaveLength(2);
    expect(scrims).toHaveLength(1);
    for (const decl of folds) expect(decl).not.toContain("calc(100% -");
    expect(CODE).toContain("maskImage: peekFold.maskCss");
    expect(CODE).toContain("maskImage: sheetFold.maskCss");
  });

  it("feeds `foldLinesBelow` the cut and not the raw box", () => {
    const measure = CODE.slice(CODE.indexOf("setLines(\n      foldLinesBelow("));
    const call = measure.slice(0, measure.indexOf("setMaskCss("));
    expect(call).toContain("clientHeight: win.bottomPx");
    expect(call).not.toContain("clientHeight: el.clientHeight");
  });

  it("keeps the fade's twin padding on both windows, which the snap relies on", () => {
    // `padding-bottom` is what puts the last line's box bottom on the window's
    // floor when the reader reaches the end, and what `foldLinesBelow` discounts
    // so the counter does not announce 10 px of padding as a line of Bulgarian.
    expect(CODE.match(/paddingBottom: `\$\{TEXT_FADE_PX\}px`/g)).toHaveLength(2);
    expect(CODE).toContain("const TEXT_FADE_PX = 10;");
  });
});
