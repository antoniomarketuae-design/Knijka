/**
 * sheetLayout — THE OPEN «ПРОЧЕТИ» SHEET'S GEOMETRY, as numbers a node test can
 * hold against the audited phones.
 *
 * THE ROWS: sc-ed-d2-priority-run:8a7372dd, sc-merge-accel-lane:2091c183
 * (STILL). At L4/L5 `compile.ts` prepends the rung's complication
 * (`complicationBriefingText`, 307–412 characters) as step 1, and the open
 * sheet lost whole instructions behind «↓ още N реда — покажи». Measured with
 * `tools/mobile/sheet-fold.mjs` (w59 probes verify-L4/verify-L5):
 *
 *   iPhone 16 landscape 852×393   scroller 646×219 for 241–274 px of text
 *                                  → merge L5 item 7 (the hard shoulder) and
 *                                    d2 L5 items 7–8 (the equal-priority rule)
 *                                    lost whole
 *   Android 780×360               scroller 646×186 → 57–74 % of the body
 *
 * The w42–w46 audit ruling: a scroll cue is a MITIGATION, not the repair. When
 * a student opens the sheet on those phones, every step must be on the glass.
 *
 * WHERE THE HEIGHT WENT. The stacked sheet spends 120 px of a 308–341 px box on
 * chrome: `pt-2` + the 44 px header row + `gap-2` + `gap-2` + the 44 px
 * «Разбрах» + `pb-2`. It also stops at `max-w-2xl` (672 px) on a 780 px screen.
 * In LANDSCAPE, where height is the scarce axis and width is not, the header
 * and the acknowledgement move into a narrow RAIL beside the text: the text
 * gets the section's whole height minus its vertical padding, and the section
 * gets the whole width between the side safe areas. Nothing about the text
 * changes — same 12 px face, same `leading-snug` 16.5 px line, the size steps
 * 2…N were already read in — so this is space, not shrinkage.
 *
 * PORTRAIT is untouched: 700+ px of height holds every audited briefing in the
 * stacked sheet with room to spare, and the rail would steal width from the
 * axis that IS scarce there.
 *
 * THE TEXT MODEL IS CONSERVATIVE BY CONSTRUCTION. Node has no layout engine, so
 * wrapping is modelled greedily with one advance per character. The advance is
 * CALIBRATED against the w59 measurements on the real glass (646 px measure):
 * the smallest advance that never predicts FEWER lines than were painted for
 * the four measured briefings is 6.1 px; `SHEET_GLYPH_ADVANCE_PX` is 6.3, so the
 * model over-estimates and a fit it certifies has slack (`sheet-layout.test.ts`
 * holds the calibration as a test, so the constant cannot drift optimistic).
 *
 * PURE: no React, no DOM.
 */

/** Body face of the sheet (`text-xs`) — the floor; this module never shrinks it. */
export const SHEET_TEXT_PX = 12;
/** `text-xs leading-snug` = 12 × 1.375. */
export const SHEET_LINE_PX = 16.5;
/** Conservative per-character advance at 12 px (see the calibration note). */
export const SHEET_GLYPH_ADVANCE_PX = 6.3;

/** Stacked cap, `max-w-2xl`. */
export const SHEET_STACKED_MAX_W_PX = 672;
/** `px-3` each side. */
export const SHEET_PAD_X_PX = 12;
/** `pt-2` / `pb-2`. */
export const SHEET_PAD_Y_PX = 8;
/** `border-x` each side. */
export const SHEET_BORDER_X_PX = 1;
/** `border-t` (the sheet is `rounded-t-2xl border-x border-t`). */
export const SHEET_BORDER_TOP_PX = 1;
/** `gap-2` between the section's children. */
export const SHEET_GAP_PX = 8;
/** The header row: the ✕ is `h-11`. */
export const SHEET_HEADER_PX = 44;
/** «Разбрах»: `py-3` + a 20 px `text-sm` line. */
export const SHEET_ACK_PX = 44;
/** The section's top clearance, the `0.75rem` in its `maxHeight`. */
export const SHEET_TOP_GAP_PX = 12;
/** `--sim-dash-h` as measured on the glass (w46: 40, not the modelled 45). */
export const SHEET_DASH_PX = 40;
/**
 * The landscape rail: ✕ + tone glyph on one row, the chip under them, and
 * «Разбрах» at the foot. 88 px holds the 44 px ✕ plus the glyph, and a 14 px
 * bold «Разбрах» with `px-2`.
 */
export const SHEET_RAIL_PX = 88;

/**
 * THE RAIL'S CHIP, AND THE ONE WORD THAT DOES NOT FIT IN IT — round-1 low
 * finding. In the rail the chip is `basis-full` of an 88 px column, and the
 * exam-class token «второстепенна» (13 letters, 10 px `font-black uppercase
 * tracking-wider`) is wider than that. With only `break-words` to fall back
 * on, the browser broke it wherever the box ran out — «ВТОРОСТЕПЕН / НА», a
 * break that reads as a typo on the one label that prices the mistake.
 *
 * Widening the rail is not free: at 104 px the L4/L5 briefings stop fitting
 * the iPhone 16 landscape window (346.5 px of text in 324 px — measured by
 * `sheet-layout.test.ts`), which is the defect the rail exists to repair. So
 * the word gets a SOFT HYPHEN at its compound seam instead: «второ·(U+00AD)·степенна»
 * breaks as «ВТОРО- / СТЕПЕННА» when, and only when, the column is too
 * narrow, and prints unbroken everywhere else (portrait's single `truncate`
 * line included). Deterministic: no dependence on the engine having a
 * Bulgarian hyphenation dictionary, which `hyphens: auto` would need.
 *
 * `SHEET_CHIP_ADVANCE_PX` is conservative by construction: every glyph is
 * charged as the widest Cyrillic capital (О ≈ 0.76 em at 10 px, black weight)
 * plus `tracking-wider`'s 0.05 em.
 */
export const SHEET_CHIP_ADVANCE_PX = 8.1;

/** U+00AD SOFT HYPHEN — spelled as a code point so the source shows it. */
export const SOFT_HYPHEN = String.fromCharCode(0xad);

/**
 * Compound seams, as display-only soft hyphens: lowercase token → the index
 * the hyphen goes before («второ|степенна» = 5). An index, not a rewritten
 * string, so the word keeps whatever case it arrived in.
 */
export const SHEET_RAIL_CHIP_SEAMS: Readonly<Record<string, number>> = Object.freeze({
  второстепенна: 5,
});

/**
 * The chip text as the sheet paints it: each known long token given its soft
 * hyphen. Display-only — the item's own strings (and every comparison made on
 * them) are untouched; screen readers ignore U+00AD.
 */
export function railChipText(text: string): string {
  return text.replace(/\p{L}+/gu, (w) => {
    const seam = SHEET_RAIL_CHIP_SEAMS[w.toLowerCase()];
    return seam === undefined ? w : w.slice(0, seam) + SOFT_HYPHEN + w.slice(seam);
  });
}

/**
 * Does every unbreakable run of this chip fit the rail? A run is the text
 * between spaces / soft hyphens; a run ending at a soft hyphen is charged one
 * more glyph for the hyphen the break prints.
 */
export function railChipFits(text: string, railPx: number = SHEET_RAIL_PX): boolean {
  for (const word of text.split(/\s+/)) {
    const runs = word.split(SOFT_HYPHEN);
    for (let i = 0; i < runs.length; i++) {
      const glyphs = runs[i]!.length + (i < runs.length - 1 ? 1 : 0);
      if (glyphs * SHEET_CHIP_ADVANCE_PX > railPx) return false;
    }
  }
  return true;
}

export interface SheetViewport {
  readonly width: number;
  readonly height: number;
  readonly safeArea: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}

export interface SheetGeometry {
  /** Header + «Разбрах» in a side rail (landscape) vs stacked (portrait). */
  readonly rail: boolean;
  readonly sectionWidthPx: number;
  readonly sectionHeightPx: number;
  /** The scroller's content width — the measure the text wraps at. */
  readonly textWidthPx: number;
  /** The scroller's clientHeight — the text fits when it is ≤ this. */
  readonly textWindowPx: number;
}

/**
 * The layout switch, stated in the CSS's own terms: `landscape:` is
 * `@media (orientation: landscape)`, which is width > height (a square
 * viewport is portrait).
 */
export function sheetUsesRail(vp: Pick<SheetViewport, "width" | "height">): boolean {
  return vp.width > vp.height;
}

/**
 * The sheet's box on a viewport. `blocking` = the card carries «Разбрах».
 *
 * Height is the section's `maxHeight` — `--sim-vh − --sim-dash-h − 0.75rem` —
 * less the TOP safe inset, which the page does not pay today (see devices.mjs)
 * but a `black-translucent` switch would; charging it keeps the model on the
 * conservative side.
 */
export function sheetGeometry(vp: SheetViewport, blocking = true): SheetGeometry {
  return sheetUsesRail(vp) ? sheetRailGeometry(vp) : sheetStackedGeometry(vp, blocking);
}

function sheetSectionHeightPx(vp: SheetViewport): number {
  return vp.height - vp.safeArea.top - SHEET_DASH_PX - SHEET_TOP_GAP_PX;
}

function sheetInnerWidthPx(sectionWidthPx: number): number {
  return sectionWidthPx - 2 * SHEET_BORDER_X_PX - 2 * SHEET_PAD_X_PX;
}

/** Landscape: header + «Разбрах» in a rail beside the text; full safe width. */
export function sheetRailGeometry(vp: SheetViewport): SheetGeometry {
  const sectionHeightPx = sheetSectionHeightPx(vp);
  // `calc(100vw − 2 × max(inset-left, inset-right))`, centred.
  const sectionWidthPx = vp.width - 2 * Math.max(vp.safeArea.left, vp.safeArea.right);
  return {
    rail: true,
    sectionWidthPx,
    sectionHeightPx,
    textWidthPx: sheetInnerWidthPx(sectionWidthPx) - SHEET_GAP_PX - SHEET_RAIL_PX,
    textWindowPx: sectionHeightPx - SHEET_BORDER_TOP_PX - 2 * SHEET_PAD_Y_PX,
  };
}

/**
 * The stacked sheet: header row, text, «Разбрах», capped at `max-w-2xl`. What
 * portrait uses, and what EVERY phone used before the rail (the w59 geometry).
 */
export function sheetStackedGeometry(vp: SheetViewport, blocking = true): SheetGeometry {
  const sectionHeightPx = sheetSectionHeightPx(vp);
  const sectionWidthPx = Math.min(
    SHEET_STACKED_MAX_W_PX,
    vp.width - vp.safeArea.left - vp.safeArea.right,
  );
  const chrome =
    SHEET_BORDER_TOP_PX +
    2 * SHEET_PAD_Y_PX +
    SHEET_HEADER_PX +
    SHEET_GAP_PX +
    (blocking ? SHEET_GAP_PX + SHEET_ACK_PX : 0);
  return {
    rail: false,
    sectionWidthPx,
    sectionHeightPx,
    textWidthPx: sheetInnerWidthPx(sectionWidthPx),
    textWindowPx: sectionHeightPx - chrome,
  };
}

/** Greedy word wrap of ONE paragraph at `widthPx`; never fewer than 1 line. */
export function wrappedLineCount(
  paragraph: string,
  widthPx: number,
  advancePx: number = SHEET_GLYPH_ADVANCE_PX,
): number {
  let lines = 1;
  let cur = 0;
  for (const word of paragraph.split(/\s+/).filter((w) => w.length > 0)) {
    const w = word.length * advancePx;
    const next = cur === 0 ? w : cur + advancePx + w;
    if (next > widthPx && cur > 0) {
      lines += 1;
      cur = w;
    } else {
      cur = next;
    }
  }
  return lines;
}

/** Height of the sheet's text: each authored step is its own line box run. */
export function sheetTextHeightPx(
  paragraphs: readonly string[],
  widthPx: number,
  advancePx: number = SHEET_GLYPH_ADVANCE_PX,
): number {
  let lines = 0;
  for (const p of paragraphs) lines += wrappedLineCount(p, widthPx, advancePx);
  return lines * SHEET_LINE_PX;
}

export interface SheetFit {
  readonly fits: boolean;
  readonly textPx: number;
  readonly windowPx: number;
  readonly geometry: SheetGeometry;
}

/**
 * Does every step of this text show, whole, in the open sheet on this phone?
 * `paragraphs` are the lines as the sheet paints them: the numbered lead
 * («1. …») and then each numbered body step.
 */
export function sheetFitsWhole(
  vp: SheetViewport,
  paragraphs: readonly string[],
  blocking = true,
): SheetFit {
  const geometry = sheetGeometry(vp, blocking);
  const textPx = sheetTextHeightPx(paragraphs, geometry.textWidthPx);
  return { fits: textPx <= geometry.textWindowPx, textPx, windowPx: geometry.textWindowPx, geometry };
}
