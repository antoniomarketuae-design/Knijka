"use client";

/**
 * SimOverlay — ONE overlay, at the top rail, one line high.
 *
 * This is the visible half of overlayQueue.ts. The founder's iPhone screenshots
 * (2026-07-29) showed a „ЗАДАЧА" card, a teach card and a red belt warning
 * stacked down the screen before the road got a pixel, because each of them was
 * a separate component that positioned itself. His verdict: „not acceptable it
 * is not playable at all."
 *
 * The grammar here is Gran Turismo's, which he attached as „how it should look
 * like": screen furniture is small, hard against an edge, and the centre of the
 * frame is road. So:
 *
 *   PEEK (default, and what the harness measures)
 *     A small card in the RIGHT-EDGE NOTIFICATION COLUMN (`notifyColumn.ts`).
 *
 *     ── 2026-08-03, HIS THIRD ASKING, AND WHY THE SHAPE CHANGED. ───────────
 *     This was a shrink-to-fit pill spanning the TOP RAIL, from the micro menu
 *     to the right inset — measured at 852×393 it laid out 766 px of an 852 px
 *     screen, a full-width strip across the sky. „you see all this text in the
 *     middle yes, and we said we have to move it from there so it doesnt
 *     bother the view … it must be like a popup notifications going below, it
 *     must be small text so the user can just read it."
 *
 *     A rail is horizontal and a notification column is vertical, and that is
 *     the whole change: the line now WRAPS (to three lines, clamped) inside a
 *     240 px column at the right edge instead of being truncated across the
 *     top of the road. Wrapping is also the THEO-4-friendlier of the two — the
 *     student sees more of the authored sentence, not less.
 *
 *   OPEN (only after a tap)
 *     A bottom sheet above the instrument band with the full authored text, the
 *     law citation, and the acknowledge. This is an EXPLICIT pause, which is
 *     the one case the budget allows to be large.
 *
 * WHY THE PEEK IS USUALLY NOT THERE AT ALL. Most items are transient: a task
 * line speaks when the objective changes and then gets out of the way, because
 * the route is already drawn IN THE WORLD (ghost ribbon, chevrons, objective
 * marker) and a permanent banner restating it is furniture. The ambient state
 * of this layer is an empty screen; „Задача" in the micro menu brings the line
 * back on demand. Only a blocking teach moment and the end-of-session verdict
 * stay until they are answered.
 *
 * THEO-4 — REQUIREMENT ZERO — IS THE CONSTRAINT THIS FILE IS BUILT AROUND.
 * A one-line overlay must never become a bare verdict. Every item that names a
 * mistake carries its authored, law-cited WHY in the sheet behind the „Защо"
 * button, the lawRef chip rides in the pill itself where there is room, and the
 * pill for such an item is ALWAYS interactive — `hasWhy()` in the pure module
 * is the assertion, and `overlayQueue.test.ts` is where it is enforced.
 *
 * ---------------------------------------------------------------------------
 * DOC 87 · A6 — „THOSE POP UPS NEED TO BE ABLE TO BE REMOVED WHEN CLICKED"
 *
 * The roomy half of this row shipped in `HudToasts` (the whole card is a
 * `<button aria-label="Скрий известието">` and a click removes it). THIS FILE
 * IS THE PHONE HALF AND IT WAS STILL DEAD: the peek was
 *
 *     const interactive = hasDetail || blocking;
 *
 * so an ordinary line — a task, a piece of guidance, a „Браво" — got
 * `pointer-events: none`, zero controls, and could only leave when its TTL ran
 * out. The founder's sentence is about exactly that card, and „wait seven
 * seconds" is not an answer to „remove it when I click it".
 *
 * So the peek now has two shapes, and they are the two the desktop column
 * already had:
 *
 *   PLAIN LINE (no WHY behind it, nothing to acknowledge, not blocking)
 *     the WHOLE CARD is the dismiss button — the `HudToasts` grammar, with the
 *     same ✕ glyph and the same „Скрий известието" label.
 *
 *   RICH LINE (carries a WHY, or an acknowledgement, or both)
 *     the card is not a button, because it already holds buttons. It gets a
 *     third 44 px chip — ✕ — beside „Защо" and the acknowledgement.
 *
 * A BLOCKING ITEM IS THE ONE THING WITH NO ✕, and that is the contract, not an
 * oversight: a teach moment holds the drive still until it is answered, and the
 * end-of-session line is the student's route to the debrief. Both keep their
 * acknowledgement instead. Everything else on the glass can be sent away with
 * one tap.
 * ---------------------------------------------------------------------------
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import {
  OVERLAY_PEEK_HEIGHT_PX,
  type SimOverlayItem,
  type SimOverlayTone,
} from "./overlayQueue";
import {
  FLANK_LANE_VAR,
  notifyColumnMaxHeightCss,
  NOTIFY_COLUMN_RIGHT_CSS,
  NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
  NOTIFY_COLUMN_WIDTH_CSS_COMPACT,
} from "./notifyColumn";
import { useTapActivation } from "./tapActivation";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * THE CONTROL BAND'S FLOOR, AS THIS COLUMN HAS TO SPELL IT — 2026-08-17.
 *
 * This is `TouchControls.notifyColumnFloorCss()`, character for character, and
 * it is a COPY rather than an import for one reason that is not negotiable:
 * `components/sim/**` consumes `modules/sim/**` through its `index.ts` and
 * never the other way round (docs/architecture/05; `hud/index.ts` line 3 says
 * so out loud). A component file importing a length out of a component would
 * invert that for a string.
 *
 * IT IS ONLY A STRING OF PUBLISHED NAMES, which is what makes the copy safe to
 * make and cheap to keep honest. Every term is either an `env()` or a CSS
 * custom property `TOUCH_BAND_CSS_VARS` declares — the identical arrangement
 * `FLANK_LANE_VAR` already uses two hundred lines below, and for the identical
 * cascade reason: these declarations are INLINE, and a variable is the one form
 * that crosses that boundary.
 *
 *   max(0px, calc(100% - var(--sim-svh)))   the band's LIFT — how far the stage
 *                                           overhangs the small viewport when
 *                                           browser chrome is out
 *   var(--sim-column-floor)                 the pad row itself; 10.75rem
 *                                           sideways, 30rem upright, switched
 *                                           by TOUCH_BAND_CSS_VARS' own media
 *                                           query. The fallback is the UPRIGHT
 *                                           number, i.e. the conservative one:
 *                                           if the variable never arrives the
 *                                           column is too short, never too tall
 *   env(safe-area-inset-bottom)             the home indicator
 *
 * AND THE COPY IS PINNED, NOT PROMISED. `sim-overlay-mirror-lane.test.ts`
 * asserts this constant is exactly what `notifyColumnFloorCss()` returns, so
 * the two cannot drift; if TouchControls re-derives its floor, that test fails
 * here rather than a phone reporting it three waves later.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const SIM_OVERLAY_COLUMN_FLOOR_CSS =
  "calc(max(0px, calc(100% - var(--sim-svh, 100vh))) + var(--sim-column-floor, 30rem) + env(safe-area-inset-bottom, 0px))";

/* ═══════════════════════════════════════════════════════════════════════════
   THE FOLD, AS ONE RULE INSTEAD OF ONE EXPRESSION PER SURFACE — 2026-08-17.

   This component has TWO scroll windows and only one of them was telling the
   truth about what is under it. The peek's counter («↓ още N реда») landed on
   2026-08-16; the READ SHEET — which is the surface the peek SENDS the student
   to, precisely because the peek could not finish printing — had no counter, no
   fade and no scrollbar. Sweep 161 filed it, and it reproduces on the deployed
   build exactly as filed:

     sc-hz-accident-scene@L1 · WebKit · real insets · iPhone 16 landscape
     852 × 393 · «ПРОЧЕТИ» open (tools/…/sheet-fold, the Range-per-character
     method `tools/mobile/brief-fold.mjs` uses on the peek):

       section    672 × 341 at (90, 12) — AT its cap, there is no more room
       scroller   646 × 220 · clientH 220 · scrollH 256 · OVERFLOW 36 px
       title      286 authored · 286 visible (100 %)
       body       769 authored · 638 visible (83 %)
       LOST       «6. Щом подминеш сцената и платното пред теб е чисто, чак
                   тогава се върни в средата на лентата и ускори плавно до
                   края на отсечката.»
       announced  NOTHING

   131 of 769 authored characters — the WHOLE of step 6 — under a 36 px fold,
   on a BLOCKING card whose only exit is «Разбрах», which sits 8 px below the
   cut. The student presses it having been shown five of six instructions and
   nothing said a sixth existed. That is the compiled-away briefing field all
   over again, one surface deeper.

   AND THE COUNTER THE PEEK ALREADY HAD WAS HALF A RULE. It read

       const hiddenPx = el.scrollHeight - el.clientHeight;

   which ignores `scrollTop`, so it answers „how much does not fit" and never
   „how much is still below you". A student who HAS scrolled to the end was
   still being told «↓ още 8 реда». A counter that cannot reach zero teaches
   the reader to ignore it, which costs the sheet the one affordance it is
   getting. So the rule is written once, here, with `scrollTop` in it, and both
   windows read it.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * 2 px of slack: sub-pixel layout makes `scrollHeight` exceed `clientHeight` by
 * a fraction on boxes that fit perfectly, and „↓ още 0 реда" on a card with
 * nothing below it is a lie in the other direction.
 */
export const FOLD_SLACK_PX = 2;
/** Used only when the engine cannot answer for the leading (jsdom, `normal`). */
export const FOLD_FALLBACK_LEADING_PX = 14;

/**
 * The fade band, and now also the grain the snap below is allowed to shave.
 *
 * MOVED TO MODULE SCOPE 2026-08-18 (it was declared inside the component) so
 * `foldMaskCss` — which is pure, exported and tested — can be written against
 * the same number the two windows pad themselves with. The declaration is
 * unchanged and `sim-overlay-fold.test.ts` still pins its text.
 */
const TEXT_FADE_PX = 10;

/**
 * How many whole lines are still BELOW the reader, right now.
 *
 * Pure, exported and tested (`sim-overlay-fold.test.ts`) rather than left as an
 * expression inside an effect: „a rule that lives only in a component is a rule
 * six waves of measurement can walk past" is written two hundred lines below
 * about this component's other shared rule, and this one had already been
 * walked past once — see the block above for the half of it that was missing.
 */
export function foldLinesBelow(
  scroll: {
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    /**
     * The window's own bottom padding, which is the fade's twin and is NOT
     * text. Both windows carry `padding-bottom: TEXT_FADE_PX` so that a text
     * which fits is not faded — and padding joins the scrollable overflow in
     * every engine this ships on, so a raw `scrollHeight − clientHeight`
     * counts those 10 px as if they were a line of Bulgarian. On the measured
     * sheet that is the difference between «↓ още 2 реда» (true: authored step
     * 6 is two lines) and «↓ още 3 реда» (a line that does not exist).
     */
    padBottomPx?: number;
  },
  lineHeightPx: number,
  slackPx: number = FOLD_SLACK_PX,
): number {
  const hidden =
    scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop - (scroll.padBottomPx ?? 0);
  if (!(hidden > slackPx)) return 0;
  const step =
    Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx : FOLD_FALLBACK_LEADING_PX;
  return Math.max(1, Math.round(hidden / step));
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE FADE WAS STILL CUTTING THE LETTERS IN HALF — 2026-08-18, sweep 161.

   TWENTY-NINE of the sixty BROKEN findings routed to this file are one
   sentence, filed verbatim against twenty-three different lessons:

     „The teach card clips its body text THROUGH THE MIDDLE OF A LINE OF
      GLYPHS — the last visible row is sliced horizontally in half — and then
      offers «↓ ОЩЕ N РЕДА»."

   Opened, at device resolution (2556 × 1179 = iPhone 16 landscape 852 × 393 at
   dpr 3), three frames, three lessons, the identical picture:

     sc-rb-exit-signal/mobile-right/04-t035s.png
       …«стои знак „Път с предимство“» whole, then «там винаги е Б1 или Б2»
       with its TOP HALF inked and the rest gone, then «↓ още 9 реда»
     sc-jx-blocked-exit/mobile-right/06-waited.png
       …«нещо тук. На червено се спира» whole, «напълно ПРЕД линията — без»
       cut through the waist, then «↓ още 7 реда»
     sc-merge-lane-end/mobile-right/04-t115s.png   (car moving, 19 км/ч)
       …«твое, не на другите.» whole, «2. Забележи края на лентата» halved

   AND THE ARITHMETIC SAYS IT COULD NEVER HAVE BEEN ANYTHING ELSE. The body is
   `text-[11px] leading-snug` — an 11 × 1.375 = 15.125 px line box — and the
   fade is a FIXED 10 px band at the bottom of the window. The window's height
   is whatever the column's cap leaves after rows 1, 2c and 3, which is not a
   multiple of 15.125 of anything. So the line that straddles the opaque edge
   keeps `(clientHeight − 10) mod 15.125` px of full-strength ink — between 0
   and 5.1 px of a line whose cap height is ~8 px — and loses the rest inside
   the band. Whatever the remainder happens to be, the reader sees GLYPH TOPS
   at declining alpha. That is decapitation, and the founder reads it, exactly
   as the 2026-08-14 note predicted of the guillotine it replaced, as „this
   product is broken" rather than as „there is more".

   A GRADIENT CANNOT FIX THIS, WHICH IS WHY THE 2026-08-14 PASS DID NOT. Widen
   the band to a whole line box and the straddling line simply fades from full
   ink at its cap height to nothing at its baseline — the same amputation, more
   slowly. Any band that ends inside a line box ends inside its letters. The
   only cut that is not through a letter is a cut BETWEEN LINE BOXES.

   SO THE WINDOW IS MASKED TO THE LINE GRID, AT BOTH ENDS. `foldWindowPx` finds
   the last line-box edge that fits and the first one that clears the top (row
   16 of the sweep is „clipped at BOTH ends on this viewport"), and the mask
   becomes opaque between them and transparent outside. A partial line is not
   dimmed, it is simply not shown, and the row that says how many lines are
   below is COUNTED AGAINST THE CUT rather than against the box — otherwise the
   fix would quietly hide one more line than the counter admits, which is the
   same silence one line further down.

   WHY THE COUNTER IS ENOUGH ON ITS OWN. The fade was never the cue: this
   card's «↓ още N реда» row and the 44 px «ПРОЧЕТИ» beside it are, and both
   are already there and already tested. The band's remaining job — keeping a
   text that FITS from being faded at all — is unchanged: no fold, no cut, and
   the soft 10 px gradient is emitted exactly as before.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * One row of the scroll window, in the window's own content coordinates.
 *
 * `heightPx` is always a whole number of that row's line boxes (a block of text
 * is laid out as N line boxes and nothing else), which is what lets the edges
 * be reconstructed without walking every line with a `Range`. `lineHeightPx` is
 * `NaN` whenever the engine cannot answer — `line-height: normal`, and every
 * row under vitest's `node` environment — and such a row contributes only its
 * own two edges, i.e. it is treated as one indivisible block.
 */
export type FoldRow = {
  offsetTop: number;
  heightPx: number;
  lineHeightPx: number;
};

/**
 * Where the window may be opaque: the line-grid edges nearest its two borders.
 *
 * Offsets are from the TOP OF THE VISIBLE BOX, which is what a `mask-image`
 * gradient is measured in. `hardEdge` is the answer to „is anything being cut
 * at all" and it is returned rather than inferred from the two numbers, because
 * the two agree with „nothing is cut" in a case where plenty is: a grid edge
 * that lands within the sub-pixel slack of the window's floor gives back
 * `bottomPx === clientHeight` while there are still ten lines underneath. Left
 * to infer, that window would fall back to the old fixed band and fade the
 * bottom two thirds of a WHOLE line — the defect, on the one geometry where the
 * grid happened to fit.
 *
 * TWO REFUSALS TO SNAP, and each guards against turning a sliced line into a
 * deleted paragraph:
 *
 *   · NOTHING IS OVERFLOWING. Then there is no cut to move and the window is
 *     handed back whole. A snap here would hide a line the student can already
 *     read — the false-failure twin of the defect being fixed.
 *   · THE SNAP WOULD COST MORE THAN ONE LINE BOX. A partial line is at most one
 *     line box tall, so a snap that shaves more than that is not landing on a
 *     text grid at all: it is landing on the top of an opaque row whose insides
 *     this function cannot see (`renderDetail` mounts a whole checklist into the
 *     sheet's window). Hiding that wholesale to tidy an edge is strictly worse
 *     than the edge, so the window is handed back whole and the pre-2026-08-18
 *     fade is what ships for that one row.
 */
// NO `padBottomPx` HERE, and its absence is the point: `foldLinesBelow` needs
// it because `scrollHeight` includes the fade's twin padding, but this function
// works from the ROWS, whose `heightPx` is text and nothing else. A parameter
// accepted and not read is a claim the caller can rely on and cannot.
export function foldWindowPx(
  rows: readonly FoldRow[],
  scroll: { scrollTop: number; clientHeight: number },
  slackPx: number = FOLD_SLACK_PX,
): { topPx: number; bottomPx: number; hardEdge: boolean } {
  const whole = { topPx: 0, bottomPx: scroll.clientHeight, hardEdge: false };
  if (rows.length === 0) return whole;

  const viewTop = scroll.scrollTop;
  const viewBottom = scroll.scrollTop + scroll.clientHeight;

  // Every line-box edge the rows put on the grid, plus each row's own two
  // borders — the gap between two rows (`gap-0.5`) is on neither grid, so both
  // of its sides have to be offered as places the cut may land.
  const edges: number[] = [];
  let contentTop = Number.POSITIVE_INFINITY;
  let contentBottom = Number.NEGATIVE_INFINITY;
  let grain = 0;
  for (const row of rows) {
    const top = row.offsetTop;
    const bottom = row.offsetTop + row.heightPx;
    contentTop = Math.min(contentTop, top);
    contentBottom = Math.max(contentBottom, bottom);
    edges.push(top, bottom);
    const leading = row.lineHeightPx;
    if (Number.isFinite(leading) && leading > 0) {
      grain = Math.max(grain, leading);
      const lines = Math.max(1, Math.round(row.heightPx / leading));
      for (let k = 1; k < lines; k += 1) edges.push(top + k * leading);
    }
  }
  if (grain === 0) grain = FOLD_FALLBACK_LEADING_PX;

  let bottomPx = scroll.clientHeight;
  let hardEdge = false;
  if (contentBottom > viewBottom + slackPx) {
    let best = Number.NEGATIVE_INFINITY;
    for (const edge of edges) {
      if (edge <= viewBottom + slackPx && edge > best) best = edge;
    }
    const snapped = best - viewTop;
    // …and the two refusals. `snapped > 0` is the window too short for even one
    // line box (the `minHeight: 2.375rem` floor exists so this cannot happen at
    // any size that ships); the grain test is the opaque-row case above.
    if (snapped > 0 && scroll.clientHeight - snapped <= grain + slackPx) {
      // Clamped: an edge inside the slack sits a fraction of a pixel BELOW the
      // floor, and a mask stop past the box is meaningless. The cut is still
      // hard — see `hardEdge` above for the case this exists for.
      bottomPx = Math.min(snapped, scroll.clientHeight);
      hardEdge = true;
    }
  }

  let topPx = 0;
  if (contentTop < viewTop - slackPx) {
    let best = Number.POSITIVE_INFINITY;
    for (const edge of edges) {
      if (edge >= viewTop - slackPx && edge < best) best = edge;
    }
    const snapped = best - viewTop;
    if (snapped > 0 && snapped < bottomPx && snapped <= grain + slackPx) {
      topPx = snapped;
      hardEdge = true;
    }
  }

  return { topPx, bottomPx, hardEdge };
}

/**
 * The window's `mask-image`, from the grid edges above.
 *
 * NO FOLD → THE 2026-08-14 GRADIENT, CHARACTER FOR CHARACTER. That band's job
 * in the no-overflow case is the one it does well: `padding-bottom` is the same
 * 10 px, so a text that fits has its last line's box bottom sitting on the
 * fade's opaque edge and nothing is dimmed at all.
 *
 * A FOLD → A HARD EDGE ON THE LINE GRID. Two coincident stops, so the cut falls
 * between line boxes and never inside one. The reader is told what is under it
 * by the «↓ още N реда» row outside the window and by «ПРОЧЕТИ» beside it —
 * both of which were already there, and neither of which the band was doing.
 */
export function foldMaskCss(
  win: { topPx: number; bottomPx: number; hardEdge: boolean },
  fadePx: number = TEXT_FADE_PX,
): string {
  if (!win.hardEdge) {
    return `linear-gradient(to bottom, #000 calc(100% - ${fadePx}px), transparent)`;
  }
  return (
    `linear-gradient(to bottom, transparent ${win.topPx}px, #000 ${win.topPx}px, ` +
    `#000 ${win.bottomPx}px, transparent ${win.bottomPx}px)`
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE CARD HAD NO GROUND, AND ON A BRIGHT WORLD THAT IS 1.3 : 1 — 2026-08-19.

   THE ONE CRITICAL FINDING ROUTED TO THIS FILE, verbatim
   (sc-ov-lane-keeping/mobile-right/04-t152s.png):

     „On mobile the ИНСТРУКЦИИ overlay has NO panel background at all. The
      'ИНСТРУКЦИИ' title is drawn over the demo picture-in-picture video, the
      body text runs straight over sky and buildings … The lesson's
      instructions are unreadable on a phone."

   and the same clause is the second half of the sentence filed against
   twenty-three further lessons: „It carries no panel of its own, so its first
   two lines render directly over the rear-view mirror image and the sky, and
   the «ЗАЩО»/«×» controls land on top of world geometry."

   THE HALO WAS THE ANSWER AND THE HALO DOES NOT REACH. `PlayAreaStyles`'
   UNPANEL register replaced every fill on this layer with a two-stop black
   text-shadow („HOW CONTRAST SURVIVES WITHOUT A BOX"), which holds on tarmac —
   the register was measured against a road. This card is pinned to the TOP of
   the frame, where the world is sky, render-white facades and a lit mirror.

   MEASURED OFF THE FILED FRAMES, at device resolution (2556 × 1179 = iPhone 16
   landscape 852 × 393 at dpr 3). The sample is a 55 × 130 CSS-px block of world
   taken IMMEDIATELY LEFT OF THE CARD'S OWN BOX, on the same rows — same
   material, and not one glyph or halo pixel of the card's own inside it:

     sc-jx-blocked-exit  06-waited    L50 0.351  L90 0.518  max 0.610
     sc-rb-exit-signal   04-t035s     L50 0.332  L90 0.523  max 0.604
     sc-merge-lane-end   04-t115s     L50 0.273  L90 0.507  max 0.589
     sc-ov-lane-keeping  04-t152s     L50 0.405  L90 0.467  max 0.543
       brightest pixel across all four: rgb(204, 205, 206)

   WCAG contrast of every ink this card paints, against that facade — and the
   values are the ones that RESOLVE ON THE SHIPPED PAGE, which is where the
   first version of this block was wrong (2026-08-19, second pass). Two inks
   are re-pinned by the UNPANEL register inside a ghost; the other five are the
   CLUSTER palette, because `/lesson/[lessonId]` renders under the (dashboard)
   layout's `data-surface="cluster"` — so `--accent` on this card is #48a9ff
   and NOT the app theme's #3fa1ff, and it is not the quiet one either:

                                              vs L90 0.518   vs the pixel
     --foreground #f2f6fc  row 2, the line       1.70 : 1      1.47 : 1
                           and «Разбрах»
     --muted      #c3cfe2  row 2b, the WHY       1.17 : 1      1.01 : 1
                           and the ✕ chip
     the card's own `color` = TONE_COLOR[tone] — the tone glyph, the «−N т.»
     chip, «↓ още N реда», the «ЗАЩО» label and both chip tints:
     --accent     #48a9ff  neutral               1.35 : 1      1.57 : 1
     --accent-2   #17e1c4  teach                 1.11 : 1      1.05 : 1
     --warning    #ffc24b  warn                  1.15 : 1      1.01 : 1
     --danger     #ff6a58  danger                1.52 : 1      1.77 : 1
     --success    #3ee095  good                  1.08 : 1      1.07 : 1

   1.01 : 1 is not „low contrast". `--warning` has luminance 0.6035 and `--muted`
   0.6172 against that facade pixel's 0.6096: the authored WHY, the «−N т.» chip
   of every second-degree violation and the wall behind them are THE SAME
   COLOUR, to a hundredth. The frame agrees — in 06-waited the whole explanation
   is pale grey type on pale grey masonry.

   SO THE CARD GETS A GROUND — AND NOT A PANEL, WHICH IS THE WHOLE DIFFICULTY.
   The 2026-08-03 ruling that took the box off this element was about a shape:
   „a full-width rounded strip ending in a SOLID BRAND-BLUE «Разбрах» button.
   THAT IS A COOKIE BANNER." A shape has a border, a radius and an edge. This
   has none of the three: no border, no radius, no blur, no backdrop-filter,
   and every one of its four sides ramps to alpha 0 OUTSIDE the card's own box,
   so there is no edge anywhere for the eye to read as furniture. It is a shade
   on the glass, which is what a sun-visor band is, and it claims not one pixel
   the card was not already standing on.

   WHY 0.80 AND NOT A NUMBER THAT LOOKED RIGHT. It is the alpha at which the
   QUIETEST ink on the card clears AA against the BRIGHTEST world the sweep
   actually put under it — rgb(204, 205, 206), which is the global maximum over
   the world band beside and below the card across all four filed frames.
   Composited, the ground becomes rgb(46, 50, 57), L = 0.0316 rounded, and the
   seven inks land at

     --foreground 11.87   --muted 8.18   --warning 8.01   --accent-2 7.73
     --success     7.54   --accent 5.15  --danger 4.57  ← THE ONE THAT BINDS

   AND THE INK THAT BINDS IS `--danger`, WHICH IS THE WHOLE POINT. It is not an
   exotic tone: `LessonPlayShell` gives it to every ГРУБА violation, so the card
   that binds this arithmetic is the card that tells a seventeen-year-old he has
   just made a serious mistake, and its «−N т.» chip is the quietest ink on it.
   The first version of this block drove the alpha off `--accent #3fa1ff` — a
   token this surface does not even resolve to — and was 0.58 of a ratio too
   generous.

   0.78 WAS THE FIRST ANSWER AND IT WAS WRONG TWICE OVER. Against the app
   theme's accent it cleared AA by 0.0016, which is less than the compositor's
   own grain (a browser stores the composited ground as 8-bit integers, and one
   unit either way moves this ratio by 0.066). Against the ink that ACTUALLY
   binds it does not clear AA at all: `--danger` on the 0.78 ground is 4.31 : 1.
   The bare threshold is α ≈ 0.7925; 0.795 gives 4.5029, over the floor by 0.003
   — a twentieth of one 8-bit step, i.e. a margin the arithmetic cannot see.
   0.80 gives 4.5692 with the ground rounded, which is the form the pixel
   actually takes: 1.04 steps of real slack, and the first two-decimal alpha
   that has any. `sim-overlay-scrim.test.ts` asserts the ROUNDED case and
   derives BOTH the binding ink and that step from the shipped palette, so a
   token edit re-picks them instead of leaving this paragraph to rot again.
   (0.75 puts `--danger` at 3.93 and 0.73 at 3.75.)

   AND IT MUST NOT BECOME A CURTAIN — the same test, from the other side. „An
   instruction he can read but which hides the hazard it is about is a different
   failure" is the founder's own note on this card. The world's own contrast in
   this corner — the dark bonnet rgb(70, 78, 92) against the lit facade — is
   5.27 : 1 bare and 1.37 : 1 under the shade: dimmed, and still plainly two
   different things. At 0.90 it would be 1.13 and at 1.00 exactly 1.00, one flat
   rectangle, which is the panel this may not become. The feathers are also the
   only place the shade may exist outside the card's box, and they are capped.
   ═══════════════════════════════════════════════════════════════════════════ */

/** The shade's colour. Near-black rather than pure, so it reads as glass. */
export const PEEK_SCRIM_RGB = [6, 11, 20] as const;

/**
 * Alpha across the card's OWN box — flat, not a ramp, because every one of the
 * three inks sits somewhere inside it and the binding one has little slack.
 */
export const PEEK_SCRIM_ALPHA = 0.8;

/**
 * How far the shade bleeds past the card on each side, and — the same numbers —
 * how long each ramp to alpha 0 is. Feather === bleed is what keeps the flat
 * core exactly coincident with the card's box: the ramps live entirely in the
 * overhang, so no glyph is ever standing on a partial ground.
 *
 * The left ramp is the long one because that is the side that faces the road;
 * right and bottom face the stage's own edge and the instrument band, where a
 * shorter ramp is invisible anyway.
 *
 * ── AND THE TOP RAMP IS 0, BECAUSE ABOVE THIS CARD IS AN INSTRUMENT.
 *    2026-08-19, second pass. It was 12, and 12 was a gutter that is not ours.
 *
 * `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` puts the column's top EXACTLY on the
 * interior mirror's lane — `max(0.5rem, 16.6% + 0.5rem)` and the lane is
 * `16.6% + 8px`, the same number, so the slack is zero on all three sideways
 * profiles (852 × 393 → 73.238 px, 780 × 360 → 67.755, 780 × 340 → 64.440).
 * A top overhang is therefore not „a ramp over the stage's edge", it is shade
 * on the mirror: at 12 px it spent all 8 px of the gutter
 * `NOTIFY_COLUMN_MIRROR_GUTTER_PX` owns and then 4 px of the mirror's own
 * projected box, at up to alpha 0.27 where the two meet. „The mirror does not
 * move, the HUD does" (PlayAreaStyles B74/B76) is the ruling, and the shade is
 * part of what the HUD paints — `sim-overlay-mirror-lane.test.ts` now judges
 * THIS rect and not merely the column's, which is how the 12 survived.
 *
 * SO THE FLAT CORE STARTS AT THE CARD'S OWN TOP EDGE, and the cost is a hard
 * edge on the one side that has no room for a ramp. It is bounded and it was
 * looked at: the BACKGROUND gradient is unchanged, so that edge is a line whose
 * ends dissolve over the last 26 px on the left and 12 px on the right — a
 * horizontal stroke with no corners, not the rounded strip the 2026-08-03
 * ruling removed. It has no border, no radius and no blur, and the same test
 * file still asserts all three.
 *
 * THE TWO ANSWERS THAT LOOK CHEAPER AND ARE NOT, both measured:
 *   · MOVE THE COLUMN DOWN 12 px so the ramp gets its own room. The rich
 *     violation card does not lay out at the column's ceiling — it lays out at
 *     `CHROME_PX` 86 + this window's own 2.375 rem floor = ~124 px against a
 *     95.76 px cap, i.e. it already paints past it — so the 12 px lands on the
 *     card's FLOOR, not on its top: 73.24 + 124 = 0.502 of a 393 px stage
 *     today, 0.533 after the move, against a hazard band that starts at 0.53
 *     (`HAZARD_BAND_TOP_FRACTION`). Trading a 4 px shade on the mirror for a
 *     card in the hazard band is the 2026-08-17 half-landed swap again.
 *   · RAMP INSIDE THE CARD instead of above it. `CARD_CLASS` has no padding;
 *     row 1's tone glyph and «−N т.» chip start at y = 0. A glyph standing on
 *     a partial ground is the defect this shade exists to close, not a milder
 *     version of it: half-way up the ramp the ground is rgb(125, 127, 132) and
 *     `--danger` reads 1.42 : 1 on it — the filed frame, with an extra step.
 */
export const PEEK_SCRIM_FEATHER_PX = { top: 0, right: 12, bottom: 16, left: 26 } as const;

const SCRIM_RGB_CSS = PEEK_SCRIM_RGB.join(", ");

/**
 * The shade itself: dense over the card, zero at both horizontal ends.
 *
 * Stops are in PX and not per cent, deliberately. The column is 180 px wide
 * sideways and up to 240 px upright (`notifyColumn.ts`), and a percentage ramp
 * would be a different number of pixels on each — i.e. the flat core would stop
 * lining up with the card's box on one of the two orientations, which is the
 * silent half-fix this file has already shipped once (the `@media` override the
 * cascade discarded).
 */
export function peekScrimBackgroundCss(
  feather: { left: number; right: number } = PEEK_SCRIM_FEATHER_PX,
  alpha: number = PEEK_SCRIM_ALPHA,
): string {
  const ink = (a: number) => `rgba(${SCRIM_RGB_CSS}, ${a})`;
  return (
    `linear-gradient(to left, ${ink(0)} 0px, ${ink(alpha)} ${feather.right}px, ` +
    `${ink(alpha)} calc(100% - ${feather.left}px), ${ink(0)} 100%)`
  );
}

/**
 * …and the vertical feather, as a mask over that gradient rather than a second
 * background layer, because two background layers do not intersect — they
 * stack, and a stack of two ramps is opaque wherever EITHER is opaque, which
 * puts a hard edge back on the two sides this is here to remove.
 */
export function peekScrimMaskCss(
  feather: { top: number; bottom: number } = PEEK_SCRIM_FEATHER_PX,
): string {
  return (
    `linear-gradient(to bottom, transparent 0px, #000 ${feather.top}px, ` +
    `#000 calc(100% - ${feather.bottom}px), transparent 100%)`
  );
}

/**
 * The counter, wired to a scroll window.
 *
 * NO SYNCHRONOUS READ IN THE EFFECT BODY, deliberately, and it is not a style
 * point: this component re-renders on the shell's 150 ms HUD poll, so a layout
 * read per render is six forced reflows a second over a live WebGL canvas.
 * `ResizeObserver` fires once for each target the moment it is observed — that
 * IS the initial measurement — and afterwards only when a box actually changes
 * size. Engines without it simply print no count, which is the pre-2026-08-16
 * behaviour and not a worse one. `onScroll` is the other input and it is cheap:
 * `setFoldLines` with an unchanged value bails out of the re-render.
 *
 * THE LEADING COMES FROM THE ROW THE FOLD IS ACTUALLY IN. It used to be
 * `firstElementChild`, which on the peek is a `text-[11px]` line whose sibling
 * body is also 11 px — harmless there and wrong on the sheet, where the `<h2>`
 * leads at 19.25 px and the numbered body it is cut inside leads at 16.5. A
 * step taken from the wrong row is a count that is wrong by a quarter.
 */
function useFoldLines(key: string): {
  ref: RefObject<HTMLDivElement | null>;
  lines: number;
  maskCss: string;
  onScroll: () => void;
} {
  const ref = useRef<HTMLDivElement | null>(null);
  const [lines, setLines] = useState(0);
  // The mask starts as the plain 2026-08-14 gradient, which is also what an
  // engine with no `ResizeObserver` and the server render keep: the snap can
  // only ever improve on it, never be a prerequisite for the card working.
  const [maskCss, setMaskCss] = useState(() =>
    foldMaskCss({ topPx: 0, bottomPx: 0, hardEdge: false }),
  );
  const measure = useCallback(() => {
    const el = ref.current;
    if (el === null) return;
    // RECTS AND NOT `offsetTop`/`offsetHeight`, as of 2026-08-18: both of those
    // round to whole pixels and the grid this snaps to is fractional (15.125 px
    // at `text-[11px] leading-snug`). Rounding twice, five rows down, walks the
    // cut a whole pixel back into the letters it exists to stay out of.
    const box = el.getBoundingClientRect();
    const rows: FoldRow[] = Array.from(el.children).map((child) => {
      const rect = child.getBoundingClientRect();
      return {
        offsetTop: rect.top - box.top + el.scrollTop,
        heightPx: rect.height,
        lineHeightPx: Number.parseFloat(getComputedStyle(child).lineHeight),
      };
    });
    // The fade's twin: both windows pad their own bottom by `TEXT_FADE_PX` so
    // that a text which FITS is not faded, and that padding joins the
    // scrollable overflow. Counting it would announce a line that is not there.
    const padBottomRaw = Number.parseFloat(getComputedStyle(el).paddingBottom);
    const padBottomPx = Number.isFinite(padBottomRaw) ? padBottomRaw : 0;
    const win = foldWindowPx(rows, {
      scrollTop: el.scrollTop,
      clientHeight: el.clientHeight,
    });
    const fold = el.scrollTop + el.clientHeight;
    // The last child that STARTS above the fold is the one the cut runs
    // through, so its line box is the unit the hidden pixels are counted in.
    let leading = rows.length === 0 ? Number.NaN : rows[0].lineHeightPx;
    for (const row of rows) {
      if (row.offsetTop <= fold) leading = row.lineHeightPx;
    }
    setLines(
      foldLinesBelow(
        {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
          // THE CUT, NOT THE BOX — 2026-08-18. The snap above stops showing the
          // line the fade used to halve, so counting against `clientHeight`
          // would report one line fewer than is really unread: a clean edge
          // bought with a lie, which is this defect one row further down.
          clientHeight: win.bottomPx,
          padBottomPx,
        },
        leading,
      ),
    );
    setMaskCss(foldMaskCss(win));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    // …and every child, because the WINDOW keeps its size while the text inside
    // it changes: a new item with a longer body resizes the rows, not the box.
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [key, measure]);
  return { ref, lines, maskCss, onScroll: measure };
}

/** Tone → the one colour token the pill is tinted with. */
const TONE_COLOR: Record<SimOverlayTone, string> = {
  neutral: "var(--accent)",
  teach: "var(--accent-2)",
  warn: "var(--warning)",
  danger: "var(--danger)",
  good: "var(--success)",
};

/** A tiny leading glyph, so the tone reads before the words do. */
function ToneGlyph({ tone, frozen }: { tone: SimOverlayTone; frozen: boolean }) {
  if (frozen) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
        <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
        <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      {tone === "danger" || tone === "warn" ? (
        <path
          d="M12 4 L21 19 H3 Z M12 10 v4 M12 16.4 v.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ) : tone === "good" ? (
        <path
          d="M5 12.5 L10 17.5 L19 7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M12 3.5 a8.5 8.5 0 1 0 0 17 a8.5 8.5 0 0 0 0-17 M12 10.5 v6 M12 7.2 v.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** A6: the ✕ the desktop toast column already shows. */
function DismissGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" aria-hidden>
      <path
        d="M6 6 L18 18 M18 6 L6 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SimOverlay({
  item,
  queued,
  frozen = false,
  renderDetail,
  onOpenChange,
  onDismiss,
}: {
  /** The ONE item selected by `selectOverlay`, or null for a clean screen. */
  item: SimOverlayItem | null;
  /** Non-ambient items waiting behind it — the „+N" badge. */
  queued: number;
  /** The drive is held still by this item (teach pause / session over). */
  frozen?: boolean;
  /** Rich detail for items that carry more than text (checklist, result). */
  renderDetail?: (item: SimOverlayItem) => ReactNode;
  /** The shell dims scene chrome while a sheet is open. */
  onOpenChange?: (open: boolean) => void;
  /**
   * A6: the student sent a non-blocking line away. The owner is told so it can
   * stop offering the item — a card that reappears on the next 150 ms HUD poll
   * has not been dismissed, it has blinked. The local guard below covers the
   * owner that does not care (the dev rig), so the ✕ is never a dead control.
   */
  onDismiss?: (item: SimOverlayItem) => void;
}) {
  // THE OPEN ITEM, not a boolean, and held as a COPY.
  //
  // Two bugs this shape prevents, both of which turn a „one line" system back
  // into the thing it replaced:
  //  · paging from one queued teach moment to the next must fold the sheet back
  //    down. An inherited `open === true` would greet the second mistake with
  //    a half-screen card nobody asked for.
  //  · a violation line is on a TTL. Holding a copy means a student who taps
  //    „Защо" keeps reading after the toast behind it expires — the alternative
  //    is a law citation that vanishes mid-sentence, which is a THEO-4 problem,
  //    not a cosmetic one.
  const [openItem, setOpenItem] = useState<SimOverlayItem | null>(null);
  const open = openItem !== null;

  // A6: the id the student last sent away. Kept by ID and not as a boolean so a
  // NEW line (the objective changed, another mistake fired) speaks immediately
  // — dismissing „Задача 2/3" must not silence „Задача 3/3".
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const live = item !== null && item.id !== dismissedId ? item : null;

  // While a sheet is open it IS the one overlay; a newly arrived line waits.
  const shown = openItem ?? live;

  // The acknowledgement handler behind a ref, refreshed after every render:
  // `acknowledge` then has a STABLE identity, which is what keeps the window
  // key listener below from being torn down and re-registered six times a
  // second by the shell's 150 ms HUD poll.
  const ackRef = useRef<(() => void) | null>(null);
  // A6: the same trick for the dismiss handler and for the item it acts on, so
  // the ✕ has a stable identity too.
  const dismissRef = useRef<((it: SimOverlayItem) => void) | null>(null);
  const shownRef = useRef<SimOverlayItem | null>(null);
  useEffect(() => {
    ackRef.current = shown?.onAck ?? null;
    shownRef.current = shown;
    dismissRef.current = onDismiss ?? null;
  });

  const acknowledge = useCallback(() => {
    setOpenItem(null);
    ackRef.current?.();
  }, []);

  const dismiss = useCallback(() => {
    const it = shownRef.current;
    if (it === null) return;
    setOpenItem(null);
    setDismissedId(it.id);
    dismissRef.current?.(it);
  }, []);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Space (and Enter) acknowledges a blocking item; Escape folds the sheet.
  //
  // CAPTURE PHASE + stopPropagation, exactly as TeachMomentOverlay does it and
  // for the same measured reason: Space is the parking-brake toggle on the
  // cabin's own window listener (bubble phase, live while paused), so without
  // this, dismissing a belt warning would also yank the handbrake. This is the
  // desktop acknowledgement the brief asks to keep — it costs nothing on a
  // phone and it is the only way to clear a card without a mouse.
  const blocking = shown?.blocking === true;
  const speaking = shown !== null;
  useEffect(() => {
    if (!speaking) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        if (!open) return;
        e.preventDefault();
        e.stopPropagation();
        setOpenItem(null);
        return;
      }
      if (e.code !== "Space" && e.key !== "Enter") return;
      if (!blocking && !open) return;
      const tag = e.target instanceof HTMLElement ? e.target.tagName : "";
      if (e.key === "Enter" && (tag === "BUTTON" || tag === "A")) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;
      if (blocking) acknowledge();
      else setOpenItem(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [speaking, blocking, open, acknowledge]);

  // ── DOC 91 · C2 — THE CARD'S OWN CONTROLS WERE DEAD WHILE HE WAS DRIVING ──
  //
  // Every control below was `onClick`-only, and a `click` born of a touch is a
  // compatibility mouse event that only the PRIMARY touch point gets. With a
  // thumb on the throttle — which is the entire time a teach moment or a
  // consequence card can appear — «РАЗБРАХ», «ЗАЩО» and the ✕ fired nothing.
  // Together with C1 that is his whole story: the popup arrives, the pedal
  // dies, and the button that would clear the popup does not answer either.
  //
  // One hook per BUTTON, never one shared between two of them: the mark that
  // de-duplicates the compatibility click belongs to the element that earned
  // it. They sit above the early return because they are hooks.
  const tapWhy = useTapActivation(() => setOpenItem(open ? null : shown));
  const tapAck = useTapActivation(acknowledge);
  const tapDismissChip = useTapActivation(dismiss);
  const tapDismissCard = useTapActivation(dismiss);
  const tapCloseSheet = useTapActivation(() => setOpenItem(null));
  const tapSheetAck = useTapActivation(acknowledge);

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * THE OPEN SHEET IS A READ MODE, AND IT SAYS SO TO THE WHOLE DOCUMENT.
   * 2026-08-13, doc 91 §I11 + §W2 — the founder's „the buttons need absolute
   * redesign", answered at the one place the contention actually lives.
   *
   * WHAT WAS MEASURED, deployed `/simulator`, WebKit, six profiles, canvas and
   * `[data-hud="touch-controls"]` asserted, the panel expanded from the
   * INSTRUCTION hint (not the belt warning — that confound is the previous
   * commit's whole subject):
   *
   *   iphone16-L  852×88 at y 8, FULL-BLEED, 22.4 % — 7 controls dead, 5 of 5
   *               in the top rail, «Разбрах» CLIPPED by the panel's own height
   *   small-L / galaxy-L   88 px strips at y −4 / y −28 — 6 dead, 5 of 5 rail
   *   all three portraits  294–327 px, 34.5–41.9 % — 3 dead, 3 of 5 rail
   *
   * «Закопчай предпазния колан» and «Контроли на автомобила» were buried on
   * 6 of 6 profiles in both orientations: the card telling a student to fasten
   * the belt was standing on the button that fastens it.
   *
   * THE TRAP §I11 NAMES, AND WHY THE OBVIOUS FIX IS WRONG. „Hide the rail" is
   * self-defeating — «КОЛАН» LIVES in that rail while the belt is unfastened,
   * so hiding the rail hides the thing the panel is pointing at. And the other
   * obvious fix, „give the sheet a bigger clearance", is what the code did
   * until today: it stood on `--sim-touch-floor`, which on a 393 px-tall stage
   * leaves 95 px — a two-line box whose own «Разбрах» does not fit inside it.
   *
   * SO NEITHER YIELDS, BECAUSE THE PREMISE IS WRONG. A paragraph of Bulgarian
   * legal prose and a row of driving controls are not two things competing for
   * one strip; they are two things that belong to DIFFERENT DURATIONS:
   *
   *   THE RIBBON  the peek. One line, `pointer-events: none`, in the right
   *               corridor, on screen ~99 % of a lesson. Measured over 40 s of
   *               unattended driving it buries 0 controls on 6 of 6. Unchanged
   *               by this commit except that it no longer has an in-place
   *               expanded state to grow into.
   *   THE READ    this sheet. It takes the screen above the instrument band —
   *               and it MAY, because opening it STOPS THE CAR (the shell adds
   *               `overlaySheetOpen` to `SceneSlot`'s `paused`, which reaches
   *               `TouchControls` as `hidden` and makes every control inert).
   *               Nothing is buried, because while the clock is stopped there
   *               is nothing on the glass to bury.
   *
   * THE INVARIANT, stated so it can be tested rather than promised:
   *   ► WHILE THE SIM CLOCK IS RUNNING, NO LAYER OUTSIDE THE RIBBON'S CORRIDOR
   *     MAY INTERSECT THE CONTROL EDGES. The read mode is the only layer that
   *     covers them, and it exists only when the clock is stopped.
   * `shellViewportContract.test.ts` asserts both halves ship together; if a
   * future edit removes the pause, the test that guards the full-bleed geometry
   * fails with it, because the geometry is only legitimate WITH the pause.
   *
   * THE `⤢` EXPAND IS GONE. It existed to reach the tall case past a cap that
   * only existed because of the clearance; with neither, a toggle between „the
   * whole reading surface" and „the whole reading surface" is a control that
   * does nothing — which is one of the founder's own three complaints.
   *
   * WHY AN ATTRIBUTE ON <html> AND NOT A PROP. Two surfaces that must stand
   * down for this one live in trees this component cannot reach: the shell's
   * «Меню» button (measured buried on both 852 and 780 landscape profiles) and
   * anything a later wave adds to the same corner. `html[data-sim-*]` is the
   * grammar `data-sim-car-sheet`, `data-sim-camera` and `data-sim-glance`
   * already use for exactly this, and PlayAreaStyles is where the arbitration
   * is written down. It is BELT AND BRACES, not the mechanism: the pause is
   * the mechanism, and this covers the one control the pause cannot reach.
   * ═══════════════════════════════════════════════════════════════════════════
   */
  useEffect(() => {
    const root = document.documentElement;
    if (!open) {
      delete root.dataset.simOverlayRead;
      return;
    }
    root.dataset.simOverlayRead = "open";
    return () => {
      delete root.dataset.simOverlayRead;
    };
  }, [open]);

  /* ══════════════════════════════════════════════════════════════════════════
     THE FOLD HAS A NAME AND A NUMBER — 2026-08-16, „THE HUD IS STANDING ON THE
     ROAD", row 2.

     FOUNDER: „the card shows «…пешеходецът решава дали да»; the authored text
     ends «…дали да стъпи.»" — and a previous wave reported „219 of 219
     characters, the whole sentence" on this exact profile.

     MEASURED ON THE DEPLOYED BUILD, character by character against every
     clipping ancestor (WebKit, real insets, iPhone 16 landscape 852 × 393,
     sc-zebra-approach@L1, the landing frame):

       in the DOM        580 characters
       on the screen     232
       below the fold    348 — the last word of the headline («стъпи.») and
                         then the WHOLE of authored steps 2, 3, 4 and 5

     So the sweep that said „whole sentence" was reading `innerText`, which
     answers for the DOM and not for the eye. The text is not truncated — it is
     SCROLLED, and the difference only matters if the student can tell. He
     cannot: the window's own edge is a 10 px fade (the 2026-08-14 mask, which
     was right to replace a guillotine and was never a way to SAY there is more)
     and nothing on the card carries a number.

     THIS IS THE HALF THAT PAYS FOR ROW 1. The column's new hazard-band ceiling
     (notifyColumn.ts) takes the peek from about eight visible lines to about
     five, and that trade is only honest if what falls below the fold is
     ANNOUNCED and one 44 px tap away with the car stopped. «ПРОЧЕТИ» was
     already the tap; this is the announcement.

     WHY IT IS MEASURED AND NOT COUNTED FROM THE STRING. How much fits depends
     on the column's width, the safe-area insets, the orientation, Dynamic Type
     and the student's browser zoom — every one of them a browser fact. A
     character budget computed in TypeScript is exactly the „measures something
     weaker than the requirement it is named for" trap this project has already
     paid for twice (the deck caption sized against a pilot trace, the peek
     sized against a 106.3 px card). `scrollHeight − clientHeight` is the
     browser's own answer to the only question being asked.

     NO SYNCHRONOUS READ IN THE EFFECT BODY, deliberately, and it is not a
     style point: this component re-renders on the shell's 150 ms HUD poll, so a
     layout read per render is six forced reflows a second over a live WebGL
     canvas. `ResizeObserver` fires once for each target the moment it is
     observed — that IS the initial measurement — and afterwards only when a box
     actually changes size. Engines without it simply print no count, which is
     today's behaviour and not a worse one.
     ══════════════════════════════════════════════════════════════════════════ */
  // The identity of what is being SAID, not the object: the poll hands this
  // component a new item object six times a second with the same words in it.
  const foldKey =
    shown === null ? "" : `${shown.id} ${shown.lineBg} ${shown.detailBg ?? ""}`;
  const peekFold = useFoldLines(`peek ${foldKey}`);
  // …and the sheet's own window, which had no counter at all. A SECOND hook and
  // not a shared one: the two boxes are never on screen together (the peek is
  // not rendered while the sheet is up — `open ? null :` below), they lead at
  // different sizes, and the sheet is the one of the two the student is
  // expected to read all the way to the end.
  const sheetFold = useFoldLines(`sheet ${open ? "open" : "shut"} ${foldKey}`);

  if (shown === null) return null;

  const color = TONE_COLOR[shown.tone];
  const hasDetail =
    (typeof shown.detailBg === "string" && shown.detailBg.trim().length > 0) ||
    shown.hasRichDetail === true;
  const hasAck = typeof shown.onAck === "function";
  // A6: the ✕ exists for everything the student is allowed to send away, which
  // is everything that is not holding the drive still…
  //
  // …AND IS NOT THE TASK ITSELF (doc 91 · C5/§I5(a)). The pre-drive line sat
  // 4 px from that ✕ and one miss removed it permanently — see `noDismiss` in
  // overlayQueue.ts for the measurement and for why `blocking` could not be
  // used instead. This is deliberately a property of the ITEM and not a new
  // rule about kinds: the owner declares „this one has no way back", which is
  // the only party that knows.
  const closable = !blocking && shown.noDismiss !== true;
  // …and when a card holds no OTHER control, the card itself is the button —
  // the `HudToasts` grammar, so the phone and the desktop dismiss the same way.
  const cardIsDismissButton = closable && !hasDetail && !hasAck;
  // There is no `interactive` flag any more, and its absence IS row A6's phone
  // half. It used to read `hasDetail || blocking`, and an ordinary line — a
  // task, a piece of guidance, a „Браво" — matched neither arm, so it rendered
  // with `pointer-events: none`, no control of any kind, and left only when its
  // TTL expired. Every peek is pointer-interactive now; `CARD_CLASS` carries
  // `pointer-events-auto touch-manipulation` unconditionally.
  //
  // The card is a COLUMN item, so this is a floor, not a fixed height: a wrapped
  // two-line task grows downward (which is what a notification does) instead of
  // clipping. Every card now carries at least a 44 px dismiss target, so the
  // floor is the thumb rule for all of them — `OVERLAY_PEEK_STATUS_HEIGHT_PX`
  // (30) described the card that could not be touched, and there is no longer
  // one.
  const minHeight = OVERLAY_PEEK_HEIGHT_PX;

  // `hud-ghost` — this is the peek, and the peek is an instrument line. It is
  // the direct counterpart of the reference's „Lap 1/1" and „Lap Time
  // 00:02.060": the words on the image, nothing behind them. The OPEN sheet
  // below is deliberately not a ghost — that one is the explicit pause where
  // the authored WHY and its law citation are read.
  //
  // ── 2026-08-03: THE OUTLINE CAME OFF. ─────────────────────────────────────
  // The review's first named piece of web furniture was this element: „the
  // briefing bar — a full-width rounded strip ending in a SOLID BRAND-BLUE
  // «Разбрах» button. THAT IS A COOKIE BANNER. His reference has PAUSE and VIEW
  // as two small translucent chips." He is not describing the words; he is
  // describing the STRIP. So the box went instead of the words: no border, no
  // radius to outline — a coloured tone glyph, a coloured chip and a line of
  // type on the road.
  //
  // `relative isolate` is all 2026-08-19 added to this list, and neither is a
  // box: `relative` makes the card the containing block for the shade behind it
  // and `isolate` makes it the shade's STACKING CONTEXT. Still no border, no
  // radius — `unpanel.test.ts` reads this literal and asserts both absences,
  // which is why the shade is a child element and not a `background` on the row.
  //
  // ── `isolate` IS NOT TIDINESS. IT WAS CAUGHT BY LOOKING. ──────────────────
  // The shade is `z-index: -1`, and a negative z-index does not stop at its
  // parent — it climbs to the nearest ancestor that HAS a stacking context and
  // paints at the bottom of that one. Rendered in WebKit (the sweep's engine)
  // over a patch of the very facade the critical finding was filed on, the
  // first attempt at this fix produced a screenshot IDENTICAL to the defect:
  // the card's only positioned ancestors were `z-index: auto`, so the shade
  // sank past the backdrop entirely and painted nothing. Every unit assertion
  // in `sim-overlay-scrim.test.ts` was green while it did.
  //
  // The column below happens to carry `z-30`, which would have hidden this on
  // the shipped page and left a fix that works by coincidence — one edit to the
  // column's z-index away from silently reverting to 1.01 : 1. `isolate` puts
  // the floor inside the card, where it cannot be taken away from a distance.
  const CARD_CLASS =
    "hud-ghost sim-overlay-in relative isolate pointer-events-auto touch-manipulation flex w-full min-w-0 min-h-0 flex-col items-stretch gap-0.5 text-left";

  /* ══════════════════════════════════════════════════════════════════════════
     THE TEXT WINDOW — 2026-08-14. WHY THE LETTERS WERE CUT THROUGH THE WAIST.

     FOUNDER, BOTH ORIENTATIONS, HIS OWN PHONE: «Потегли по улицата и се движи»
     renders whole, and the line under it is a row of decapitated glyph-tops.
     Reproduced on all six profiles. It is NOT the screen's top edge — zero of
     432 text nodes have any rect above y = 0, and the top-edge band at device
     scale cuts nothing. The card does it to itself, and here is the chain,
     measured on the deployed build (852 × 393, `wave11-why-sliced.mjs`):

       [data-hud="notify-column"]  max-height 128 px
         └ the card                 flex column, height 128, shortfall 0
             ├ row 1  chip          ~18 px
             ├ row 2  `line-clamp-3`  wants  96 px · GIVEN 19.1 px
             ├ row 2b `line-clamp-6`  wants 257 px · GIVEN 41.9 px
             └ row 3  two 44 px chips

     The two text rows were the ONLY shrinkable items in that column, and they
     were shrinkable for a reason nobody had noticed: `line-clamp` compiles to
     `overflow: hidden`, and an overflow other than `visible` zeroes a flex
     item's AUTOMATIC MINIMUM SIZE. So the entire 353 px shortfall landed on
     them. 19.1 px of a 13.75 px line box is 1.38 lines — line 2 keeps 0.38 of
     its height and `overflow: hidden` guillotines it through the middle of the
     glyphs. On the 780 × 360 Samsung the headline is a 2.6 px sliver: gone.

     THREE THINGS CHANGE, AND EACH ONE IS LOAD-BEARING.

     1. THE SHORTFALL MOVES INTO A SCROLLER. The two rows go inside one
        `min-h-0 shrink overflow-y-auto` window and become `shrink-0`
        themselves. A flex item that cannot shrink is laid out at its natural
        height — a WHOLE number of line boxes — so nothing is ever asked to be
        1.38 lines tall again. Whatever does not fit is BELOW the fold instead
        of amputated, which is the difference between „there is more" and „this
        product is broken".

     2. THE CUT IS FADED, NOT GUILLOTINED. A scroller still ends where it ends,
        and its own bottom edge would cut the next line exactly as before. The
        mask turns those last 10 px into a fade, so a partly visible line reads
        as CONTINUING rather than as a rendering fault — and `padding-bottom`
        is the same 10 px, which is what keeps a text that FITS from being
        faded at all: scrolled to the end, the last line's box bottom sits on
        the fade's opaque edge. (Bottom padding joins the scrollable overflow
        in every engine this ships on; that is what makes the two numbers agree.)

     3. THE ELLIPSIS GOES WITH THE CLAMP. `line-clamp-3` / `line-clamp-6` were
        hiding 77 px and 215 px of authored Bulgarian behind „…" and telling
        the student nothing — 110 px of a 219-character headline and 333 px of
        a 556-character body on the founder's own frame. An ellipsis is a claim
        that the rest is not worth the space; under THEO-4 the rest is the
        lesson. A scroll window makes the same content REACHABLE, and «ПРОЧЕТИ»
        beside it opens the whole thing with the car stopped.

     WHY NOT „JUST GIVE THE CARD MORE ROOM". Because there is none, and the
     arithmetic is not arguable: in landscape the column's cap is
     `100% − TOUCH_CONTROLS_FLOOR − top` = 128 px of a 393 px stage, and what
     it is standing off is the DRIVING CONTROLS — this peek does not stop the
     car, so it may not paint over them. The cap's own comment says it was
     „measured against the 106.3 px worst card"; the card a scenario lesson
     actually raises wants ~400. The cap is correct arithmetic against content
     that does not ship, and the answer to that is not a bigger box on top of
     the road — the founder's note on this very defect ends „an instruction he
     can read but which hides the hazard it is about is a different failure."
     ══════════════════════════════════════════════════════════════════════════ */
  // `TEXT_FADE_PX` now lives at module scope (see `foldMaskCss`), because the
  // band and the SNAP that replaces it when there is a fold are one rule.
  const textWindowStyle: CSSProperties = {
    // ── AND IT IS STILL A PEEK — 2026-08-14, the other half of his note.
    //
    // „AND MIND WHERE IT SITS: it is over the road. The founder's reference
    // keeps the centre clear. An instruction he can read but which hides the
    // hazard it is about is a different failure."
    //
    // Without a ceiling this window would take everything the column's cap
    // allows, and in PORTRAIT that cap is 403 px — 47 % of an 852 px screen,
    // because portrait has height to spare and the landscape arithmetic that
    // produced 128 never bit there. The card would go from 106 px to the full
    // 403 and hang down past the horizon (measured off his own frame: the road
    // starts at y ≈ 205), in the corridor beside the lane he is driving in.
    // Readable and in the way is not the trade he asked for.
    //
    // 8 rem = 128 px, and it is deliberately THE SAME NUMBER as the landscape
    // column cap (`100% − TOUCH_CONTROLS_FLOOR − top` at 852 × 393). One
    // constant, both orientations: the peek is never taller than the tightest
    // budget it has to survive, so it cannot grow into the picture on the
    // roomier axis. In landscape it does not bind — the column's own cap is
    // already the smaller of the two — so nothing about that orientation
    // changes except that the glyphs are whole.
    maxHeight: "8rem",
    // ── …AND A FLOOR, ADDED 2026-08-16 WITH THE HAZARD-BAND CEILING.
    //
    // This window is the ONE shrinkable item in the card (rows 2 and 2b are
    // `shrink-0` inside it, row 1 and row 3 are `shrink-0` outside it), so
    // every pixel the column's cap gives up comes out of here. That was safe
    // while the cap was „whatever the control band leaves"; it is not safe now
    // that a second, tighter budget can bind, because the failure mode is the
    // one the block above was written for — a window of 1.38 line boxes, whose
    // `overflow: hidden` cuts the second line through the middle of its glyphs.
    //
    // 2.375 rem = TWO whole 13.75 px line boxes plus the 10 px fade. Below that
    // the card overflows its column instead, which is visible and reportable;
    // silently amputated Bulgarian is neither. It is inert at every size that
    // ships (the tightest cap in the ladder, 780 × 360 landscape, leaves this
    // window ~67 px) and exists so that a future tightening of
    // `NOTIFY_COLUMN_MAX_STAGE_FRACTION` cannot re-create the 2026-08-14 defect
    // by arithmetic nobody re-measures.
    minHeight: "2.375rem",
    // ── THE BAND IS NOW THE LINE GRID WHENEVER THERE IS A FOLD — 2026-08-18.
    //
    // It used to be a fixed 10 px gradient, and sweep 161 filed the result 29
    // times against 23 lessons: a 10 px band at the bottom of a window whose
    // height is not a multiple of the 15.125 px line box leaves the straddling
    // line with between 0 and 5.1 px of full-strength ink — glyph tops, then
    // nothing. `foldMaskCss` has the measurement and the three frames.
    //
    // Both spellings: `mask-image` is unprefixed in current WebKit and
    // prefixed in the versions still on phones in this market.
    WebkitMaskImage: peekFold.maskCss,
    maskImage: peekFold.maskCss,
    paddingBottom: `${TEXT_FADE_PX}px`,
    // The card carries `touch-manipulation`; a window that scrolls has to say
    // which axis it owns, or the stage's gesture handling keeps the drag.
    touchAction: "pan-y",
    overscrollBehavior: "contain",
  };

  const cardBody = (
    <>
      {/* ── THE GROUND, 2026-08-19. The block at `peekScrimBackgroundCss` has
             the four sampled frames, the seven inks it replaces (1.01 : 1 at
             the flattest — `--warning` on a render-white facade — and 1.77 : 1
             at the best) and the arithmetic that picks 0.80 off `--danger`,
             which is the ink that binds and the tone of every груба violation.

             THE NUMBERS IN THIS PARAGRAPH USED TO BE THREE OTHER ONES, and
             they were wrong in the reassuring direction: they were measured on
             the APP theme's `--accent`, and this surface is
             `data-surface="cluster"`. `sim-overlay-scrim.test.ts` now reads the
             palette out of `globals.css` and the ghost pins out of
             `PlayAreaStyles.tsx` rather than restating them, so the next token
             edit fails a test instead of rotting a comment.

             `data-hud-ink` IS LOAD-BEARING AND IS NOT DECORATION. The UNPANEL
             sweep's second selector is
               [data-sim-stage] :is(.hud-ghost, …) :is(div, …):not([data-hud-ink])
             with `background-image: none !important`, so without this attribute
             the shade is stripped by the stylesheet and this whole fix is a
             diff that changes no pixel — which is exactly how the tier picker's
             filled segment survived a whole unpanel pass. The FIRST selector in
             that same rule is the ghost itself, unqualified, which is why the
             shade is a child element rather than a `background` on the row.

             `z-index: -1` and not a `::before`: the rows above are ordinary
             in-flow content, and in-flow content paints BEFORE positioned
             descendants — an absolutely positioned sibling at `auto` would land
             on top of the words it exists to make readable.

             `aria-hidden` + `pointer-events: none`: it is a shade. It must not
             be announced and it must not eat the tap that dismisses the card
             (the whole card is a `<button>` in the plain-line shape). */}
      <div
        data-sim-overlay-scrim=""
        data-hud-ink=""
        aria-hidden
        style={{
          position: "absolute",
          top: `${-PEEK_SCRIM_FEATHER_PX.top}px`,
          right: `${-PEEK_SCRIM_FEATHER_PX.right}px`,
          bottom: `${-PEEK_SCRIM_FEATHER_PX.bottom}px`,
          left: `${-PEEK_SCRIM_FEATHER_PX.left}px`,
          zIndex: -1,
          pointerEvents: "none",
          backgroundImage: peekScrimBackgroundCss(),
          // Both spellings, as the text window two rows down already does:
          // `mask-image` is unprefixed in current WebKit and prefixed in the
          // versions still on phones in this market.
          WebkitMaskImage: peekScrimMaskCss(),
          maskImage: peekScrimMaskCss(),
        }}
      />

      {/* Row 1 — the tone glyph, the chip, the „+N" badge and (when the whole
          card is the dismiss button) the ✕ that says so. `shrink-0`: this row
          is 18 px of label and it is never what gives when the column is
          short — see THE TEXT WINDOW above. */}
      <div className="flex min-w-0 shrink-0 items-center gap-1.5">
        <ToneGlyph tone={shown.tone} frozen={frozen} />
        {shown.chipBg ? (
          <span className="min-w-0 truncate text-[10px] font-black uppercase tracking-wider">
            {shown.chipBg}
          </span>
        ) : null}
        {queued > 0 ? (
          <span
            className="ml-auto shrink-0 rounded-full border border-border px-1.5 text-[10px] font-bold leading-[18px] text-muted"
            aria-label={`още ${queued} съобщения`}
          >
            +{queued}
          </span>
        ) : null}
        {cardIsDismissButton ? (
          <span className={`${queued > 0 ? "" : "ml-auto"} shrink-0 opacity-70`}>
            <DismissGlyph />
          </span>
        ) : null}
      </div>

      {/* ── THE TEXT WINDOW. Rows 2 and 2b live inside it and neither of them
             shrinks any more; the WINDOW is what gives when the column is
             short, and it gives by scrolling. The long block above this
             component's `cardBody` has the measurements. */}
      <div
        ref={peekFold.ref}
        onScroll={peekFold.onScroll}
        data-sim-overlay-text=""
        className="flex min-h-0 min-w-0 shrink flex-col gap-0.5 overflow-y-auto"
        style={textWindowStyle}
      >
        {/* Row 2 — THE LINE. No clamp: it is `shrink-0` inside the window, so it
            lays out at a whole number of line boxes and the window scrolls past
            it. „…" after four words is how a THEO-4 explanation turns back into
            a bare verdict, and `line-clamp-3` was doing exactly that to a
            219-character authored instruction. `break-words` because
            «Пътнотранспортно» is one unbreakable 16-letter word and the stage
            clips rather than scrolls (hud-card-fit.test.ts). */}
        <span className="min-w-0 shrink-0 break-words text-[11px] font-bold leading-tight text-foreground">
          {shown.lineBg}
        </span>

        {/* ══ ROW 2b — THE BODY, ON THE SCREEN, NOT BEHIND «ЗАЩО» ═══════════════
          *** THEO-4 — REQUIREMENT ZERO. THIS IS THE ROW THAT BREACHED IT. ***

          HIS WORDS: „THE CARDS SHOW BUTTONS AND NO TEXT." What he was looking
          at was this card with `detailBg` rendered NOWHERE — it appeared only
          inside the sheet at the bottom of this file, i.e. behind one press of
          «ЗАЩО» / «СПИСЪК». On a DESKTOP the same content renders inline (the
          pre-drive panel prints `instructionBg` in the pending-step card; the
          toast column prints the explanation under the line), so the phone was
          the one device where the reasoning was hidden — and it is the device
          with the least discoverable affordance for finding it.

          Requirement zero is founder-ratified and unconditional: no bare
          verdicts, ever; the student is owed the reasoning. A card whose BODY
          IS THE INSTRUCTION, hiding the instruction, is the plainest breach of
          it in the product. Wave 4 measured the collapse and never escalated
          it. It is not a layout preference and it is not negotiable against a
          height budget.

          SO THE BUDGET WAS SOLVED RATHER THAN PAID FOR WITH THE TEXT:
            · The column is ≤240 px on compact (`notifyColumn.ts`), and all
              thirteen pre-drive instructions are 55–95 characters — three
              lines at 11 px. They fit whole. Nothing is truncated in the case
              that produced the complaint.
            · `line-clamp-6` WAS the ceiling for the long ones — and it is gone
              as of 2026-08-14, because it was hiding 215 px of a 257 px body
              behind „…" and saying nothing. Six lines is not a „read more"
              when the reader is not told there are seventeen. The window
              above scrolls instead, and «ПРОЧЕТИ» opens the lot with the car
              stopped.
            · `whitespace-pre-line` so an authored list keeps its lines.
          It sits ABOVE the control row on purpose: the words are what the card
          is for, and the control beside it names what it opens.
          ══════════════════════════════════════════════════════════════════ */}
        {/* A <p>, deliberately: the UNPANEL register sets the ghost's face to
            MONO for instrument values and hands `:is(p, h1, h2, h3, blockquote)`
            back to the reading face. This is an authored sentence, so it is a
            paragraph — the same split every other authored line in this HUD
            already relies on. */}
        {shown.detailBg ? (
          <p
            data-sim-overlay-body=""
            className="min-w-0 shrink-0 whitespace-pre-line break-words text-[11px] font-semibold leading-snug text-muted"
          >
            {shown.detailBg}
          </p>
        ) : null}
      </div>

      {/* ── ROW 2c — THE FOLD, IN WORDS AND WITH A NUMBER. 2026-08-16.
             The block at `textWindowRef` above has the measurement (580
             characters in the card, 232 on the screen, 348 below a 10 px fade
             and nothing saying so). It is a LABEL and not a control on purpose:
             the two ways to the rest are already there and are both bigger than
             it — the window itself scrolls (`pan-y`, and this line is the only
             thing on the card that says an unhinted scroll region is there at
             all), and «ПРОЧЕТИ» on the row directly under it is 44 px and opens
             the lot with the car stopped. A 10 px button would be the touch
             target this file has already spent two rows removing.
             `aria-hidden`: assistive technology reads the whole body out of the
             DOM regardless of what is scrolled into view, so announcing a fold
             to a screen reader would describe a problem it does not have.
             ── AND IT IS AT FULL OPACITY, 2026-08-19. It carried `opacity-90`,
             which is a tenth nobody can see and which cost the only thing on
             this card that says the explanation continues: it inherits the
             card's `color`, and on a ГРУБА violation that is `--danger`, so
             0.9 of it over the shade below reads 3.97 : 1 — under AA, on the
             label that tells a student there is more of the reason he was
             marked down. Full strength it is 4.57 : 1, the same as the chip. */}
      {peekFold.lines > 0 ? (
        <span
          data-sim-overlay-fold=""
          aria-hidden
          className="mt-0.5 shrink-0 self-end text-[10px] font-black uppercase leading-none tracking-wider"
        >
          ↓ още {peekFold.lines} {peekFold.lines === 1 ? "ред" : "реда"}
        </span>
      ) : null}

      {/* Row 3 — the controls, right-aligned under the words. Absent only on the
          card that IS a control. `shrink-0`, and that is the half of this fix
          that keeps it from being a trap: these two 44 px chips are the only
          way out of a blocking briefing, and a flex row that shrinks would put
          them under the fold of a card the student cannot scroll past. */}
      {cardIsDismissButton ? null : (
        <div className="mt-0.5 flex shrink-0 items-center justify-end gap-1">
          {hasDetail ? (
            <button
              type="button"
              {...tapWhy}
              aria-expanded={open}
              // 44 px in BOTH axes. A 24 px chip with a big label is the
              // touch-target violation this project already counts 19 of. This
              // and the ack beside it are a matched PAIR — same height, same
              // radius, same weight, one outlined and one lightly tinted.
              className="flex h-11 min-w-[2.75rem] shrink-0 touch-manipulation items-center justify-center rounded-full border px-2 text-[11px] font-black uppercase tracking-wider"
              style={{
                color,
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              }}
            >
              {open ? "▾" : (shown.openLabelBg ?? "Защо")}
            </button>
          ) : null}
          {blocking || hasAck ? (
            // THE ACK, as one of the reference's „two small translucent chips".
            //
            // `data-hud-ink` STAYS, and it is load-bearing: it exempts this
            // element from the UNPANEL sweep so the 18 % tint below survives
            // (`background-color: transparent !important` would otherwise win)
            // and the one control that clears a blocking line never becomes
            // invisible. Doc 87 rows C1/C2 are literally „«Разбрах» was not
            // tappable" — this must read as pressable.
            //
            // A6 widened the condition from `blocking` to „has an onAck": the
            // end-of-session line keeps its „Резултат" chip even after the
            // student has turned the automatic debrief off and the line has
            // stopped freezing the screen.
            <button
              type="button"
              data-hud-ink=""
              {...tapAck}
              className="flex h-11 min-w-[2.75rem] shrink-0 touch-manipulation items-center justify-center rounded-full border px-3 text-[11px] font-black uppercase tracking-wider text-foreground"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 55%, transparent)`,
              }}
            >
              {shown.ackLabelBg ?? "Разбрах"}
            </button>
          ) : null}
          {closable ? (
            // A6, the rich-card half: the ✕ as a third chip, the same 44 px in
            // both axes as its two neighbours. A blocking item never gets one —
            // it has an acknowledgement, and that is what clears it.
            //
            // ── IT PAINTED 0 % OF ITS OWN BOX, AND 0 % IS NOT QUIET, IT IS
            //    ABSENT — 2026-08-13, the control census.
            //
            // Every graded control on this screen is a GHOST: ~22 % ink of its
            // own box at 0.82 effective opacity, which is the register that lets
            // a control be findable without costing the road. This one measured
            // 0.0 % in both orientations, sitting next to «Защо» at 81.8 % — a
            // 44 px target a student has no way to see. The census's rule for it
            // is „give it ink or delete it": it is not graded, so it is allowed
            // to be quiet, but it is not allowed to be invisible.
            //
            // 12 % of the card's own tone, which is the ack chip's 18 % one step
            // down — the same colour, one register quieter, so the pair still
            // reads as „the loud one clears the line, the quiet one hides it".
            // `data-hud-ink` is what exempts it from the UNPANEL sweep, exactly
            // as the acknowledgement beside it does; without it the sweep's
            // `background-color: transparent !important` would put the 0 % back.
            <button
              type="button"
              data-hud-close=""
              data-hud-ink=""
              {...tapDismissChip}
              aria-label="Скрий известието"
              className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border text-muted"
              style={{
                backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
                borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              }}
            >
              <DismissGlyph />
            </button>
          ) : null}
        </div>
      )}
    </>
  );

  return (
    <>
      {/* The compact overlay layer owns the rail while it speaks. A piece of
          SCENE chrome sits in the same corner and would put a second panel back
          on the screen the moment this one appeared — the exact bug being
          fixed. A CSS rule keyed on the shell's own attributes (the
          PlayAreaStyles precedent) keeps ONE definition of "compact" and needs
          no prop drilled through the 3D tree. It comes straight back when the
          line clears, which is most of the time.

          THE TIER PICKER USED TO BE THE SECOND SELECTOR HERE and is not any
          more: as of J-WAVE-3 it is `display: none` on every compact stage
          unconditionally (PlayAreaStyles — 255 px of segmented control does not
          fit a 167.5 px rail lane), so a rule that stood it down for a second
          could never match. Removed rather than left as dead CSS that reads
          like a live arbitration. The tier lives in the ⚙ sheet on a phone. */}
      <style>{`
        [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="telltale-pings"] {
          display: none;
        }
        @keyframes sim-overlay-in {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: none; }
        }
        .sim-overlay-in { animation: sim-overlay-in 180ms ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .sim-overlay-in { animation: none; }
        }
      `}</style>

      {/* ------------------------------------------------------------------
          PEEK — the RIGHT-EDGE NOTIFICATION COLUMN, small text, stacking down.

          It used to run `left: <menu button> … right: <inset>` — a rail. At
          852×393 that laid out 766 px of an 852 px screen: a strip of type
          across the whole top of the road, which is the thing the founder has
          now asked three times to have moved. The geometry comes from
          `notifyColumn.ts` so the shell's roomy column, this one and the CSS
          that pulls the scene-owned panels over are all the same numbers.

          It is replaced by, not stacked with, the open sheet: the sheet's own
          header already carries the same glyph and the same line, and „ONE
          overlay at a time" has to be true of this component before it can be
          true of the screen.
          ------------------------------------------------------------------ */}
      {open ? null : (
      <div
        data-sim-overlay={shown.kind}
        data-sim-overlay-state="peek"
        data-hud="notify-column"
        className="pointer-events-none absolute z-30 flex flex-col items-end"
        style={{
          // ── THE MIRROR IS AN INSTRUMENT — 2026-08-17, „THE HUD IS STANDING
          //    ON THE MIRROR". This is the inline declaration `notifyColumn.ts`
          //    published `NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN` for and could
          //    not make itself.
          //
          // It read `NOTIFY_COLUMN_TOP_CSS_COMPACT` — which is not this
          // column's top, it is the PHONE LAYOUT'S TOP-LEFT CORNER DATUM, and
          // `TouchControls.TOP_RAIL_TOP_CSS` and the sideways demonstration
          // deck stand on it too. 8 px from the top of the stage, in the corner
          // the cockpit projects its INTERIOR MIRROR into. Measured on the
          // deployed build (sweep161, WebKit, real insets, iPhone 16 landscape
          // 852 × 393, sc-ov-solid-line/mobile-right/01-arrival.png):
          //
          //   [data-hud="notify-column"]    [541, 8, 180 × 161]
          //   the interior mirror, painted  [524, 0 → 707, 70]
          //   → 166 × 62 = 10 292 px², and it is the TOP of the card — chip,
          //     title and first authored line, printed on a live reflection.
          //
          // The mirror does not move, the HUD does (PlayAreaStyles B74/B76,
          // in those words). `notify-column-mirror.test.ts` derives the lane
          // from `cabinLook.hotspotScreenRect("hotspot_mirror_rear", …)` rather
          // than from a screenshot, and `sim-overlay-mirror-lane.test.ts` is
          // what pins THIS declaration to it.
          top: NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
          // ── …AND THE CEILING HAD TO MOVE WITH IT, IN THE SAME COMMIT.
          //
          // A `max-height` is measured from the box's own top edge, so the two
          // are one change and not two. `PlayAreaStyles` writes this column's
          // `max-height` from the DATUM; leaving it there while the top moves
          // 8 → 73.2 px puts the card's floor at 73.2 + 161 = 234.2, i.e.
          // **0.596 of the stage** against a hazard band that starts at 0.53
          // (`NOTIFY_COLUMN_MAX_STAGE_FRACTION`) — it would trade the mirror
          // defect for the one the 2026-08-16 ceiling exists to close, on the
          // same frame. `sim-overlay-mirror-lane.test.ts` asserts that
          // half-landed pair fails.
          //
          // SO IT IS WRITTEN HERE, INLINE, and that is deliberate rather than
          // convenient: an inline style outranks every selector, which is the
          // cascade fact this column already relies on for `right`/`width`
          // below (PlayAreaStyles' own note: „The first attempt put the
          // column's right/width override in exactly this file … It was correct
          // CSS and it did nothing"). The stylesheet's compact `max-height`
          // rule is therefore now INERT for this element — it is the sibling
          // lane's to delete, and the report of this wave says so.
          //
          // `notifyColumnMaxHeightCss` is imported rather than re-typed, so the
          // `min()` of the two budgets has one definition. Resolved, with the
          // floor `SIM_OVERLAY_COLUMN_FLOOR_CSS` names:
          //   852 × 393  top 8 → 73.23   ceiling 161 → 95.76   floor 0.43 stage
          //   780 × 360  top 8 → 67.76   ceiling 147 → 87.04   floor 0.43 stage
          maxHeight: notifyColumnMaxHeightCss(
            SIM_OVERLAY_COLUMN_FLOOR_CSS,
            NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,
          ),
          // ── THE FLANK LANE, 2026-08-14 · „FIX · FLANKS" ────────────────────
          // This column is the ONE surface that shares the throttle band's
          // corner, and „NOTHING may ever cover them" is a hard constraint on
          // that band. Sideways the two boxes shared x 741–785 on the founder's
          // phone and `elementFromPoint` answered THIS CARD at the centre of
          // all four mirror/dock stations — a thumb aimed at a graded mirror
          // glance pressed the briefing.
          //
          // The width the column gives up here it gets back in height:
          // PlayAreaStyles caps it against `notifyColumnFloorCss()`, which no
          // longer has to clear the band now that the lanes are disjoint. Its
          // LEFT edge does not move at all, so notifyColumn.ts's 0.60 contract
          // is untouched.
          //
          // A VARIABLE AND NOT A CONSTANT, and not a stylesheet rule either:
          // these two declarations are INLINE, so they outrank every selector —
          // the first attempt at this wave shipped a `@media` override that was
          // applied and then discarded by the cascade, and the sweep caught it.
          // The orientation split lives in TOUCH_BAND_CSS_VARS, where a media
          // query can exist; upright the lane is 0 and the separation is bought
          // with height instead.
          right: `calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${FLANK_LANE_VAR})`,
          width: `calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR})`,
        }}
      >
        {/* A6 — TWO SHAPES, AND THEY ARE THE DESKTOP'S TWO.
            A card with nothing else to press IS the dismiss button
            (`HudToasts`' grammar, same ✕ glyph, same „Скрий известието"); a card
            that already holds „Защо" / „Разбрах" cannot nest a button, so it
            gets the ✕ as a third chip in the control row instead. */}
        {cardIsDismissButton ? (
          <button
            type="button"
            data-hud-close=""
            data-sim-overlay-card="button"
            {...tapDismissCard}
            aria-label={`Скрий известието: ${shown.lineBg}`}
            className={CARD_CLASS}
            style={{ minHeight: `${minHeight}px`, color }}
          >
            {cardBody}
          </button>
        ) : (
          <div
            data-sim-overlay-card="panel"
            className={CARD_CLASS}
            style={{ minHeight: `${minHeight}px`, color }}
            role={blocking ? "alertdialog" : "status"}
            aria-live={blocking ? "assertive" : "polite"}
            aria-label={`${shown.chipBg ? `${shown.chipBg} — ` : ""}${shown.lineBg}`}
          >
            {cardBody}
          </div>
        )}
      </div>
      )}

      {/* ------------------------------------------------------------------
          OPEN — the explicit pause. A bottom sheet that stops ABOVE the
          instrument band (`--sim-dash-h`, written by the play shell from the
          same constant the band is sized with, so the two cannot drift), never
          a full-bleed modal, and it scrolls inside itself rather than growing.
          Reached only by a tap, which is the one case the budget allows to be
          large — and it is where THEO-4's authored WHY lives in full.
          ------------------------------------------------------------------ */}
      {open ? (
        <div
          data-sim-overlay={shown.kind}
          data-sim-overlay-state="open"
          data-hud="overlay-read"
          className="pointer-events-none absolute inset-x-0 z-40 flex justify-center"
          // ── THE READ MODE'S ONE CLEARANCE: the instrument band, and nothing
          // else. See the block at `data-sim-overlay-read` above for why.
          //
          // It used to be `calc(var(--sim-dash-h) + var(--sim-touch-floor))` —
          // standing clear of the thumb band. That was the right answer to the
          // wrong question: it left 95 px on his phone sideways, which is a box
          // whose own «Разбрах» is clipped by it (measured, screenshot in
          // tools/mobile/.out/wave8-census/shots/), and it STILL buried the top
          // rail on 6 of 6 profiles because an 88 px box anchored at the bottom
          // and grown upward lands exactly on the rail's band.
          //
          // There is no thumb band to clear now: opening this sheet stops the
          // car, and a stopped car's controls are inert. The instrument band
          // stays because the speed and the gear are what a student checks the
          // sentence AGAINST — and because it is 40 px, not 260.
          style={{ bottom: "var(--sim-dash-h, 0px)" }}
          role="dialog"
          aria-modal="true"
          aria-label={shown.lineBg}
        >
          <section
            className="pointer-events-auto flex w-full max-w-2xl flex-col gap-2 overflow-hidden rounded-t-2xl border-x border-t bg-background/95 px-3 pb-2 pt-2 backdrop-blur"
            style={{
              borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
              // ── §I11, half 2 — THE CAP, AND THE `max()` IS THE HONEST PART.
              //
              // The clearance alone is not the fix and the first attempt at it
              // proved the point the hard way: standing on the thumb band and
              // still asking for `--sim-vh × 0.62` pushed the sheet off the TOP
              // instead of the bottom. Measured on the deployed product with
              // the clearance in and this cap not yet right — iPhone 16
              // landscape, «Затвори» and «Разгъни панела» 123.5 px ABOVE the
              // safe-area box, and the overlap with the controls went UP
              // (9 680 → 12 276 px²) because a box anchored only by `bottom:`
              // grows upward and the header row cannot shrink.
              //
              // ONE CAP NOW, AND IT IS THE WHOLE SCREEN ABOVE THE INSTRUMENTS.
              // The old one was `max(5.5rem, min(0.62 × vh, vh − dash − touch
              // floor − 0.75rem))`, i.e. 95.5 px on his phone sideways: a
              // header and one scrolling line, with «Разбрах» clipped off the
              // bottom. Both of the numbers that made it small are gone — 0.62
              // was a budget against a road the student is no longer driving,
              // and `--sim-touch-floor` was a clearance against controls that
              // are inert while this is up. `--sim-vh` is the shell's measured
              // visual-viewport height, so this cannot overrun the top edge the
              // way the first attempt at §I11 did (measured once, deployed:
              // «Затвори» 123.5 px above the safe-area box).
              maxHeight: "calc(var(--sim-vh, 100dvh) - var(--sim-dash-h, 0px) - 0.75rem)",
            }}
          >
            {/* ══ THE READ MODE'S OWN HEADER WAS A FRAGMENT — 2026-08-14 ══════
                This row used to carry the line as a `truncate`-d heading, and
                on the deployed build it ate 146 of the 219 characters of the
                instruction it was heading — «…По тъмно първо про…», one third
                of the line, with an ellipsis. This is the surface a student is
                SENT TO because the peek could not finish printing; a read mode
                whose title is itself cut off is the defect one level deeper,
                and it was in the frame nobody had opened.

                So the title stops living in a fixed-height row and joins the
                SCROLLING body below, where a 412-character exam complication
                (the worst in the shipped corpus) is simply the first paragraph
                of what the student came here to read. What stays here is the
                tone glyph, the card's own chip — «ИНСТРУКЦИИ», a label, always
                short — and the ✕. Nothing in this row can now be too long for
                it, which is the only way a header row is honest.

                The dialog keeps `aria-label={lineBg}`, so a screen reader still
                announces the sheet by its sentence and loses nothing. ══════ */}
            <div className="flex shrink-0 items-center gap-2">
              <span style={{ color }}>
                <ToneGlyph tone={shown.tone} frozen={false} />
              </span>
              <span
                className="min-w-0 flex-1 truncate text-[10px] font-black uppercase tracking-wider"
                style={{ color }}
              >
                {shown.chipBg ?? ""}
              </span>
              {/* ── THE SHEET'S FOLD, IN WORDS AND WITH A NUMBER — 2026-08-17.
                     The counterpart of row 2c on the peek. It lands in the
                     HEADER, and the placement is the whole of the argument.

                     IT COSTS NO AUTHORED BULGARIAN, WHICH IS WHY IT IS HERE.
                     The section is a `flex-col gap-2` at its cap (341 of the
                     341 px between the stage's top and the instrument band on
                     an iPhone 16 sideways) and the scroller is its ONLY
                     shrinkable child — so a fourth row would have taken its own
                     10 px plus an 8 px gap straight out of the text it is
                     counting, pushing the accident-scene fold from 36 px to 54
                     and hiding a THIRD line to announce that two were hidden.
                     Under THEO-4 the text is the lesson; this row is chrome. In
                     this header it takes zero height: the row is 44 px of
                     button already, the chip beside it is `flex-1 truncate` and
                     yields the width, and on the narrowest stage the three
                     items still lay out inside 369 px.

                     AND THE BOTTOM STILL SAYS „CONTINUES", because the fade
                     added to the scroller in the same commit is what a cut line
                     needs — the filed frame's real damage is that the
                     guillotined «6.» read as a rendering fault. Announcement at
                     the top, continuation cue at the bottom, nothing deleted.

                     IT REACHES ZERO, which the peek's version could not: the
                     rule at the top of this file has `scrollTop` in it and the
                     window below is wired to `onScroll`, so a reader who has
                     scrolled to the end sees the row disappear. A counter stuck
                     at «↓ още 2 реда» while he is already at the bottom teaches
                     him to ignore it.

                     `aria-hidden`: assistive technology reads the whole body
                     out of the DOM regardless of what is scrolled into view, so
                     announcing a fold to a screen reader would describe a
                     problem it does not have. */}
              {sheetFold.lines > 0 ? (
                <span
                  data-sim-overlay-sheet-fold=""
                  aria-hidden
                  className="shrink-0 whitespace-nowrap text-[10px] font-black uppercase leading-none tracking-wider"
                  style={{ color }}
                >
                  ↓ още {sheetFold.lines} {sheetFold.lines === 1 ? "ред" : "реда"}
                </span>
              ) : null}
              {/* «⤢ Разгъни панела» STOOD HERE AND IS DELETED, NOT MOVED.
                  It was the escape hatch from a height cap, and the cap is
                  gone: this surface is already the whole screen above the
                  instrument band. A 44 px control that toggles between one
                  size and the same size is the founder's own „a button that
                  does nothing and says nothing about why", and it was costing
                  the header a third of its width on a 360 px phone. */}
              <button
                type="button"
                {...tapCloseSheet}
                aria-label="Затвори"
                className="flex h-11 w-11 shrink-0 touch-manipulation items-center justify-center rounded-full border border-border text-sm font-black text-muted"
              >
                <span aria-hidden>✕</span>
              </button>
            </div>

            {/* `min-h-0` is what makes the cap above real: without it a flex
                column item refuses to shrink below its content, so the section
                overflows its own `max-height` and the box grows off the top of
                the screen — which is precisely the regression measured when
                this clearance first shipped.

                ── AND IT CUT ITS OWN LAST STEP IN SILENCE — 2026-08-17, sweep
                   161. The measurement is in the block at `foldLinesBelow`:
                   36 px over on `sc-hz-accident-scene@L1`, the whole of
                   authored step 6 below the fold, and the section is already AT
                   its cap (341 of the 341 px between the top of the stage and
                   the instrument band), so there is no room to give it.

                   THE FADE IS THE HALF THAT ANSWERS THE FRAME. A scroll
                   container ends where it ends, and its own bottom edge cuts
                   the next line through the glyphs — the filed frame shows the
                   ascenders of «6.» sliced flat with the blue «Разбрах» 8 px
                   under them, which reads as a rendering fault and not as
                   „there is more". The same 10 px `TEXT_FADE_PX` mask and the
                   same 10 px of bottom padding the peek has carried since
                   2026-08-14: padding joins the scrollable overflow in every
                   engine this ships on, so a text that FITS is not faded at all
                   — scrolled to the end, the last line's box bottom sits on the
                   fade's opaque edge.

                   `pan-y` / `overscroll-contain` for the reason the peek's
                   window carries them: the stage owns touch gestures unless a
                   scroller says which axis is its own. This one had neither,
                   which is part of why the fold was undiscoverable on a phone
                   even for a student who thought to try. */}
            <div
              ref={sheetFold.ref}
              onScroll={sheetFold.onScroll}
              data-sim-overlay-sheet-text=""
              className="min-h-0 min-w-0 shrink overflow-y-auto"
              style={{
                // The same rule as the peek's, from the same hook: the filed
                // frame here is «6.» with its ascenders sliced flat 8 px above
                // the blue «Разбрах», which is a 10 px band over a 16.5 px line
                // box — 61 % of the line inside the fade. `foldMaskCss` snaps
                // the cut to this window's own line grid instead.
                WebkitMaskImage: sheetFold.maskCss,
                maskImage: sheetFold.maskCss,
                paddingBottom: `${TEXT_FADE_PX}px`,
                touchAction: "pan-y",
                overscrollBehavior: "contain",
              }}
            >
              {/* The sentence the peek could not finish, in full and first.

                  ── AND WITH ITS NUMBER, WHEN IT HAS ONE — round 10, 2026-08-24.
                     Twenty-one BROKEN rows, twenty-one mobile `02-briefing.png`
                     frames, and every one of them is THIS element: an
                     unnumbered lead in the headline face over a `detailBg` that
                     opens at «2.» — while the pc leg of the same lesson numbers
                     the same list 1–5 in full. The body is right to keep the
                     authored numbering (`briefingBodyBg`); what was missing is
                     the item the numbering counts FROM.

                     IT GOES ON THIS SURFACE BECAUSE THIS IS WHERE THE FRAMES
                     WERE TAKEN, and that is the whole of the reason. The
                     harness clicks «ПРОЧЕТИ» and waits 2 500 ms before the
                     `02-briefing` beat (`tools/mobile/lesson-audit.mjs:1049`),
                     so every one of the twenty-one is this opened sheet — and
                     the sheet is the only surface that shows the whole list.
                     The peek's lead stays unnumbered because on the same
                     round's peek frames its body is entirely below the fold
                     («↓ ОЩЕ 35 РЕДА», «↓ ОЩЕ 17 РЕДА»): no numbers are visible
                     there at all, so there is no sequence with a hole in it. A
                     character-cost argument was also filed for this seam and
                     was WITHDRAWN under verification — the arithmetic and the
                     frame that contradicts it are at
                     `SimOverlayItem.lineOrdinal`. Do not cite it.

                     A separate `<span>` rather than a template literal so the
                     ordinal cannot be mistaken for authored Bulgarian by the
                     copy gates that read `lineBg`. `tabular-nums` keeps «10.»
                     from shifting the sentence's first glyph against «1.». */}
              <h2 className="break-words text-sm font-extrabold leading-snug text-foreground">
                {typeof shown.lineOrdinal === "number" ? (
                  <span className="tabular-nums">{shown.lineOrdinal}. </span>
                ) : null}
                {shown.lineBg}
              </h2>
              {/* ── `whitespace-pre-line`, AND IT WAS MISSING HERE FOR THE WHOLE
                     LIFE OF THIS SHEET. The card's own body has carried it since
                     row 2b landed; this copy did not, so a five-step briefing
                     arrived as ONE run-on paragraph — photographed 2026-08-13,
                     iPhone 16 landscape: „…дали да стъпи. 2. Видиш ли пешеходната
                     пътека, вдигни… 3. Стъпи ли пешеходец…" with no break
                     anywhere. The steps are authored as a numbered list and the
                     one surface that shows all of them was the one that threw
                     the numbering's shape away. */}
              {shown.detailBg ? (
                <p className="mt-1.5 whitespace-pre-line break-words text-xs leading-snug text-foreground">
                  {shown.detailBg}
                </p>
              ) : null}
              {shown.lawRef ? (
                <span className="mt-1.5 inline-block rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                  {shown.lawRef}
                </span>
              ) : null}
              {renderDetail ? <div className="mt-2">{renderDetail(shown)}</div> : null}
            </div>

            {blocking ? (
              <button
                type="button"
                {...tapSheetAck}
                className="btn-accent w-full shrink-0 justify-center py-3 text-sm"
              >
                {shown.ackLabelBg ?? "Разбрах"}
              </button>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
