import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  notifyColumnMaxHeightCss,
  notifyColumnMaxHeightPx,
  notifyColumnWidthPx,
  HAZARD_BAND_TOP_FRACTION,
  NOTIFY_COLUMN_GUTTER_PX,
  NOTIFY_COLUMN_MAX_STAGE_FRACTION,
  NOTIFY_COLUMN_MIN_LEFT_FRACTION,
} from "../notifyColumn";
import { notifyColumnFloorPx } from "../../../../components/sim/TouchControls";

/**
 * The cockpit horizon, as a fraction of the canvas — `cabinLook.test.ts`'s own
 * assertion (`at([0.24, 0.71, 1e6]).y ≈ 0.58`), quoted so the derivation of
 * `HAZARD_BAND_TOP_FRACTION` can be re-run here rather than trusted.
 *
 * It lived in `notifyColumn.ts` as an `export const` until 2026-08-26 and this
 * file was its only reader — not in the barrel, not read by any layout, and no
 * CSS length derived from it. A number a shipped module publishes reads as a
 * number that module USES; this one is a sanity datum for the row below, so it
 * sits with the row. (Deleting it instead would have cost the one assertion that
 * notices if the hazard band is ever raised into the sky.)
 */
const COCKPIT_HORIZON_FRACTION = 0.58;

/**
 * =============================================================================
 * „THE HUD IS STANDING ON THE ROAD" — 2026-08-16, the founder's four rows.
 *
 * WHY SOURCE PINS AND ARITHMETIC AND NOT A RENDER. Two of these four surfaces
 * are CSS rules inside a template literal (`PlayAreaStyles`), which is the one
 * thing in this app that can rot into a no-op without a single type error, a
 * single failing render or a single changed pixel — `unpanel.test.ts` and
 * `notify-column.test.ts` both say so in their own headers, and this file is
 * the third to be bitten by it. The other two are a component that needs a
 * WebGL context, a lesson, a session and a live visual viewport to mount at
 * all. What can be asserted honestly from here is that the line still says what
 * the measurement said it had to say.
 *
 * EVERY NUMBER BELOW CAME OFF THE DEPLOYED BUILD BEFORE THE FIX — WebKit, real
 * safe-area insets substituted into the page (`tools/mobile/lib/insets.mjs`),
 * authenticated `/simulator?scenario=sc-zebra-approach&level=1`, iPhone 16
 * landscape 852 × 393, canvas mounted and `[data-hud="touch-controls"]`
 * asserted, and the speedometer read through `[aria-label^="Скорост "]`
 * («Скорост 0 километра в час» at rest, which is what makes the probe's own
 * reading trustworthy).
 * =============================================================================
 */

const nl = (s: string): string => s.replace(/\r\n/g, "\n");
const read = (...p: string[]): string => nl(readFileSync(resolve(__dirname, ...p), "utf8"));
/** …with the prose taken out. These files ARGUE about the shapes they no
 *  longer ship, so „the string is absent" is only a claim about the code. */
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CSS = read("../../../../components/sim/lesson-ui/PlayAreaStyles.tsx");
const OVERLAY = read("../SimOverlay.tsx");
const OVERLAY_CODE = strip(OVERLAY);
const SCENE = read("../../../../components/sim/LessonScene.tsx");
const TOUCH = read("../../../../components/sim/TouchControls.tsx");

/** The stage the founder's frames are taken on, with its real insets. */
const IPHONE_L = { width: 852, height: 393, insetBottom: 21 };
/** …and upright, where the control band and not the sky is the binding budget. */
const IPHONE_P = { width: 393, height: 852, insetBottom: 34 };
/** `NOTIFY_COLUMN_TOP_CSS_COMPACT` — 0.5 rem plus a top inset this app pays 0 of. */
const TOP_PX = 8;

/* ───────────────────────────────────────────────────────────────────────────
   ROW 1 — „THE INSTRUCTION CARD EATS THE TOP-RIGHT QUADRANT."

   MEASURED, the landing frame: [data-hud="notify-column"] [541, 8, 180 × 192].
   The x rule (`NOTIFY_COLUMN_MIN_LEFT_FRACTION`, 2026-08-03) passes — 541/852 =
   0.635 — and the card still lay over the right-hand pavement, because nothing
   had ever constrained the OTHER axis: a floor at y = 200 is 0.509 of the
   stage, and everything this rung teaches the student to look at is projected
   at or below 0.53 (notifyColumn.ts carries the derivation off the cockpit
   projection `cabinLook.test.ts` already asserts).
   ─────────────────────────────────────────────────────────────────────────── */
describe("row 1 · the peek is bounded by the sky, not only by the control band", () => {
  it("keeps a tenth of the frame between the card's floor and the hazard band", () => {
    // The same margin and the same grammar as `HUD_LEFT_PANEL_MAX_HEIGHT_FRACTION`
    // („0.55 leaves a tenth of the frame of clearance" under a hotspot at 0.65).
    expect(HAZARD_BAND_TOP_FRACTION - NOTIFY_COLUMN_MAX_STAGE_FRACTION).toBeGreaterThanOrEqual(0.1);
    // …and the hazard band is below the horizon's own line, or the derivation
    // it comes from is describing the sky.
    expect(HAZARD_BAND_TOP_FRACTION).toBeLessThan(COCKPIT_HORIZON_FRACTION);
  });

  it("LANDSCAPE: 192 px of card becomes 161, and the floor leaves 0.509 → 0.430", () => {
    const bandBudget = IPHONE_L.height - notifyColumnFloorPx(IPHONE_L) - TOP_PX;
    // The pre-fix cap, read back off the shipped constants rather than quoted:
    // this is the 192 px the probe measured, and if the band ever moves this
    // line moves with it instead of freezing a number nobody re-derives.
    expect(bandBudget).toBe(192);

    const capped = notifyColumnMaxHeightPx(IPHONE_L.height, notifyColumnFloorPx(IPHONE_L), TOP_PX);
    expect(Math.round(capped)).toBe(161);
    // The card's floor as a fraction of the stage — the number his letter is
    // actually about. 200/393 = 0.509 before, 169/393 = 0.430 after.
    expect((TOP_PX + capped) / IPHONE_L.height).toBeLessThanOrEqual(
      NOTIFY_COLUMN_MAX_STAGE_FRACTION + 0.001,
    );
    expect((TOP_PX + bandBudget) / IPHONE_L.height).toBeGreaterThan(HAZARD_BAND_TOP_FRACTION - 0.03);
  });

  it("…and the box that lands on the road shrinks by a sixth of its area", () => {
    const w = notifyColumnWidthPx(IPHONE_L.width, true) - 60; // the flank lane, sideways
    expect(w).toBe(180); // the measured width, from the constants
    const before = w * (IPHONE_L.height - notifyColumnFloorPx(IPHONE_L) - TOP_PX);
    const after = w * notifyColumnMaxHeightPx(IPHONE_L.height, notifyColumnFloorPx(IPHONE_L), TOP_PX);
    const stage = IPHONE_L.width * IPHONE_L.height;
    expect(before / stage).toBeCloseTo(0.1032, 4);
    expect(after / stage).toBeCloseTo(0.0865, 4);
  });

  it("PORTRAIT is untouched — the band is still the tighter of the two budgets", () => {
    const floor = notifyColumnFloorPx(IPHONE_P);
    const band = IPHONE_P.height - floor - TOP_PX;
    expect(notifyColumnMaxHeightPx(IPHONE_P.height, floor, TOP_PX)).toBe(band);
    // 0.43 × 852 = 366 px, which is larger than what the band leaves, so the
    // `min()` picks the band and not one pixel of the upright layout moves.
    expect(IPHONE_P.height * NOTIFY_COLUMN_MAX_STAGE_FRACTION - TOP_PX).toBeGreaterThan(band);
  });

  it("the shipped stylesheet caps the column through THIS function", () => {
    // A stylesheet in a template literal rots without a type error. The rule
    // that used to read `calc(100% - <band floor> - <top>)` must now be the
    // `min()` of the two budgets, and it must come from the module rather than
    // be re-typed here — the drift this project has already paid for twice.
    expect(CSS).toContain("notifyColumnMaxHeightCss(");
    const compactColumn = CSS.slice(
      CSS.indexOf('[data-sim-compact="on"] [data-sim-stage] [data-hud="notify-column"],'),
    );
    const rule = compactColumn.slice(0, compactColumn.indexOf("}"));
    expect(rule).toContain("max-height: ${notifyColumnMaxHeightCss(");
    expect(rule).not.toMatch(/max-height:\s*calc\(\s*\n?\s*100% - \$\{notifyColumnFloorCss/);
    // …and the generated length really is a `min()` of two terms.
    const css = notifyColumnMaxHeightCss("var(--floor)", "8px");
    expect(css.startsWith("min(")).toBe(true);
    expect(css).toContain("var(--floor)");
    expect(css).toContain(`${NOTIFY_COLUMN_MAX_STAGE_FRACTION * 100}%`);
  });

  it("…but on a PHONE it is the inline style that binds, since 2026-08-17", () => {
    // THE RULE ABOVE IS NO LONGER THE ONE THAT TAKES EFFECT ON `data-sim-compact`,
    // and a test that kept saying it was would be this project's own most
    // expensive mistake repeated (PlayAreaStyles: „It was correct CSS and it
    // did nothing" — an inline style outranks every selector).
    //
    // The mirror lane moved this column's `top` off the phone layout's corner
    // datum, and a `max-height` is measured from the box's own top edge, so the
    // ceiling had to be recomputed in the same declaration or the card's floor
    // would have gone from 0.43 of the stage to 0.596 — straight through the
    // hazard band this row is about. `sim-overlay-mirror-lane.test.ts` holds
    // that pair and asserts the half-landed version fails.
    expect(OVERLAY_CODE).toContain("maxHeight: notifyColumnMaxHeightCss(");
    expect(OVERLAY_CODE).toContain("NOTIFY_COLUMN_TOP_CSS_COMPACT_COLUMN,");
    // The stylesheet rule stays for the ROOMY column and as the fallback for
    // any compact surface that is not this one; it is the sibling lane's to
    // retire, not this file's to pretend is live.
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   ROW 2 — „THE SENTENCE IS STILL CUT."

   MEASURED character by character against every clipping ancestor, same frame:
   580 characters in the card, 232 on the screen, 348 below the fold — the
   headline's last word («стъпи.») and the whole of authored steps 2–5. A
   previous wave reported „219 of 219 characters, the whole sentence" on this
   exact profile, because it read `innerText`, which answers for the DOM.

   The text is not truncated, it is SCROLLED, and that only matters if the
   student can tell. Nothing on the card said so: the window's edge is a 10 px
   fade and there was no number anywhere.
   ─────────────────────────────────────────────────────────────────────────── */
describe("row 2 · the fold has a name and a number", () => {
  it("the card prints how many lines are below it — and so does the READ SHEET", () => {
    // ── 2026-08-17. THE ASSERTIONS IN THIS `describe` RUN ON `OVERLAY_CODE`
    //    FROM HERE ON, AND THAT IS THE ROW'S OWN LESSON APPLIED TO ITSELF.
    //    Sweep 161 filed the read sheet for the identical defect one surface
    //    deeper, the fix quotes the old expression in the block that explains
    //    why it changed — and every `toContain` below went on passing against
    //    the PARAGRAPH. The stripped copy is what this file already uses for
    //    „the string is absent"; it has to be what „the string is present"
    //    uses too, or the guard is a ban on writing the reason down.
    expect(OVERLAY_CODE).toContain('data-sim-overlay-fold=""');
    expect(OVERLAY_CODE).toContain("↓ още {peekFold.lines}");
    // Bulgarian counts: one ред, many реда. A count that is grammatically wrong
    // in the language the product teaches is a count nobody believes.
    expect(OVERLAY_CODE).toContain('{peekFold.lines === 1 ? "ред" : "реда"}');
    // …and the surface the peek SENDS the student to, which had no counter, no
    // fade and no scrollbar at all — 36 px over on `sc-hz-accident-scene@L1`,
    // the whole of authored step 6 (`sim-overlay-fold.test.ts` has the
    // character-by-character measurement and holds this row's other half).
    expect(OVERLAY_CODE).toContain('data-sim-overlay-sheet-fold=""');
    expect(OVERLAY_CODE).toContain("↓ още {sheetFold.lines}");
  });

  it("…measured off the browser, never counted off the string", () => {
    // How much fits depends on the column width, the safe-area insets, the
    // orientation, Dynamic Type and the student's browser zoom. A character
    // budget in TypeScript is the „measures something weaker than the
    // requirement it is named for" trap this project has paid for twice.
    //
    // `scrollTop` IS PART OF THE QUESTION and was missing until 2026-08-17: the
    // expression answered „how much does not fit" and never „how much is still
    // below you", so a reader who had scrolled to the end was still being told
    // «↓ още 8 реда». A counter that cannot reach zero teaches its reader to
    // ignore it.
    expect(OVERLAY_CODE).toContain(
      "scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop",
    );
    // ── 2026-08-18. THE `probe` LOCAL IS GONE AND THE RULE IS BIGGER, NOT
    //    SMALLER. `foldWindowPx` needs every row's grid, not just the one the
    //    cut lands in, so the walk builds a `FoldRow[]` — and each row still
    //    takes its leading from the engine, which is the whole of what this
    //    assertion has ever been about.
    expect(OVERLAY_CODE).toMatch(/getComputedStyle\(child\)\.lineHeight/);
    // …and the ROW GEOMETRY comes off the browser too, by rect and not by
    // arithmetic on a font size. Whole-pixel `offsetTop`/`offsetHeight` would
    // round the 15.125 px grid back into the letters the snap exists to spare.
    expect(OVERLAY_CODE).toContain("child.getBoundingClientRect()");
    expect(OVERLAY_CODE).not.toContain("offsetHeight");
    // Both windows are wired to the browser's own scroll event, or the zero
    // above is unreachable: a scroll is not a resize.
    expect(OVERLAY_CODE).toContain("onScroll={peekFold.onScroll}");
    expect(OVERLAY_CODE).toContain("onScroll={sheetFold.onScroll}");
  });

  it("…and never with a layout read on the 150 ms poll's render path", () => {
    // This component re-renders six times a second. A `scrollHeight` read per
    // render is six forced reflows a second over a live WebGL canvas.
    // `ResizeObserver` fires once on observe — that IS the first measurement —
    // and afterwards only when a box changes size.
    expect(OVERLAY_CODE).toContain("new ResizeObserver(");
    expect(OVERLAY_CODE).toContain("ro.observe(el)");
    // The rule moved into `useFoldLines` when the sheet needed the same one, so
    // the subscription's key is the hook's argument rather than a bare
    // `[foldKey]` dependency — and BOTH windows are keyed off the same string.
    expect(OVERLAY_CODE).toMatch(/\}, \[key, measure\]\)/);
    expect(OVERLAY_CODE).toContain("useFoldLines(`peek ${foldKey}`)");
    expect(OVERLAY_CODE).toContain('useFoldLines(`sheet ${open ? "open" : "shut"} ${foldKey}`)');
    // The key is what is SAID, not the object: the poll hands this component a
    // fresh item object with the same words in it six times a second.
    expect(OVERLAY_CODE).toMatch(/const foldKey =\s*\n?\s*shown === null \? "" : `\$\{shown\.id\}/);
  });

  it("the text window keeps a floor of two whole line boxes plus the fade", () => {
    // The window is the ONE shrinkable item in the card, so every pixel row 1's
    // ceiling gives up comes out of here — and a window of 1.38 line boxes is
    // exactly the 2026-08-14 defect (`overflow: hidden` cutting the second line
    // through the middle of its glyphs).
    expect(OVERLAY).toContain('minHeight: "2.375rem"');
    const LINE = 13.75; // 11 px at `leading-tight`
    const FADE = 10; // TEXT_FADE_PX
    expect(2.375 * 16).toBeGreaterThanOrEqual(2 * LINE + FADE);
  });

  it("…and the whole authored text is still one 44 px tap away, unclamped", () => {
    // THEO-4. Shrinking the peek may not delete the explanation — the read
    // surface is where it moves to, it stops the car, and it must not have
    // grown a clamp of its own while this row was being written.
    expect(OVERLAY_CODE).not.toContain("line-clamp");
    expect(OVERLAY_CODE).toContain('shown.openLabelBg ?? "Защо"');
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   ROW 3 — „THE FIRST-RUN HINT IS PRINTED ACROSS THE MIDDLE OF THE ROAD."

   MEASURED, same build, the state a lesson lands in once the briefing is
   acknowledged: [data-hud="touch-hint"] [275, 202, 334 × 143]. The middle 39 %
   of the width, centred 16 px off the vanishing point, crossing the cockpit
   horizon (0.58 × 393 = 228), 14.3 % of the picture.

   A 2026-08-12 rule had already „moved it off the middle of the screen" — it
   moved it DOWN, into the corridor between the two thumb pads, which closed
   four control overlaps and left the prose on the road.
   ─────────────────────────────────────────────────────────────────────────── */
describe("row 3 · the first-run hint is in the right corridor, not on the road", () => {
  /** The hint's block in the scene tree — anchored on the CONDITION that mounts
   *  it, because the comment above it quotes the very box being fixed and an
   *  `indexOf` on the attribute name lands in the prose. */
  const hintStart = SCENE.indexOf("{showTouchHint ? (");
  const hintBlock = strip(
    SCENE.slice(hintStart, SCENE.indexOf("</button>", hintStart) + 9),
  );

  it("is no longer AUTHORED at the centre of the screen", () => {
    // The cascade rule that relocates it is one runtime condition away from not
    // applying — `[data-sim-compact="on"]` is a coarse-pointer check and a size
    // check, and a touch laptop or a tablet lands back on whatever the class
    // list says. So the default has to be a corner, not the vanishing point.
    expect(hintBlock).not.toContain("top-1/2");
    expect(hintBlock).not.toContain("-translate-y-1/2");
    expect(hintBlock).not.toContain("inset-x-0");
    // …and the CONTAINER's own class list, which is the one that decides where
    // the box is. (The button inside it centres its own label and legitimately
    // carries `items-center`, so the whole block is the wrong thing to scan.)
    const container = hintBlock.slice(
      hintBlock.indexOf('data-hud="touch-hint"'),
      hintBlock.indexOf("role=\"note\""),
    );
    expect(container).not.toContain("items-center");
    expect(container).not.toContain("text-center");
    expect(container).toContain("items-end");
    expect(container).toContain("text-right");
  });

  it("…and the corridor's geometry is written once, from notifyColumn.ts", () => {
    // The BARE rule, at the start of a line — the C1 ladder further up the file
    // carries `…[data-sim-overlay-active="on"] [data-hud="touch-hint"] {`, which
    // an `indexOf` on the attribute alone finds first and which is a different
    // rule making a different claim.
    const rule = CSS.slice(CSS.search(/\n\s*\[data-hud="touch-hint"\] \{/));
    const both = rule.slice(0, rule.indexOf("html[data-sim-car-sheet"));
    expect(both).toContain("right: ${NOTIFY_COLUMN_RIGHT_CSS};");
    expect(both).toContain("width: ${NOTIFY_COLUMN_WIDTH_CSS_ROOMY};");
    // …and sideways it pays the throttle band's lane out of the same width, or
    // it lays out 240 px wide with its right edge at 781 — measured, on the
    // deployed build, straight across «Л ЛЯВО», «З ЗАДН» and «Д ДЯСН», with its
    // own «Разбрах» over the last two. Three graded mirror glances.
    expect(both).toContain(
      "width: calc(${NOTIFY_COLUMN_WIDTH_CSS_COMPACT} - ${FLANK_LANE_VAR});",
    );
    expect(both).toContain("right: calc(${NOTIFY_COLUMN_RIGHT_CSS} + ${FLANK_LANE_VAR});");
    // …bounded by the same hazard band the peek is, since it shares the lane.
    expect(both).toContain("max-height: ${notifyColumnMaxHeightCss(");
    // The pad corridor it used to stand in is gone from THIS rule (it is still
    // the right answer for the instrument readout in portrait, which is why the
    // constants are still imported).
    expect(both).not.toContain("PAD_CORRIDOR_LEFT_CSS");
    expect(both).not.toContain("PAD_CORRIDOR_RIGHT_CSS");
  });

  it("the measured box fails the column's own left-edge rule; the new lane passes", () => {
    const leftFractionOf = (x: number): number => x / IPHONE_L.width;
    // What was on the screen: [275, 202, 334 × 143].
    expect(leftFractionOf(275)).toBeLessThan(NOTIFY_COLUMN_MIN_LEFT_FRACTION);
    // What the corridor gives it: the stage less the 12 px gutter, the 59 px
    // landscape notch inset and the compact column's own width.
    const laneLeft =
      IPHONE_L.width - NOTIFY_COLUMN_GUTTER_PX - 59 - notifyColumnWidthPx(IPHONE_L.width, true);
    expect(laneLeft).toBe(541);
    expect(leftFractionOf(laneLeft)).toBeGreaterThanOrEqual(NOTIFY_COLUMN_MIN_LEFT_FRACTION);
  });

  it("the WORDS scroll and «РАЗБРАХ» does not — it is a shrink-0 sibling", () => {
    // Measured on the deployed build with the corridor's ceiling applied and
    // the whole card as the scroller: the button's bottom sat 10.9 px below the
    // card's own fold on an iPhone 16 sideways. This screen has been caught by
    // that shape twice already (the deck's toggle off the top of a 393 px
    // stage; the read sheet's «Разбрах» clipped by its own height), so the
    // answer is SimOverlay's: a `min-h-0 shrink` window owns the overflow and
    // the control under it is laid out at its natural 44 px whatever the
    // ceiling is. Re-measured after: 0.0 px below the fold on 852 × 393 AND on
    // 780 × 360, where the ceiling is 146.8 and binds.
    expect(hintBlock).toContain("flex min-h-0 w-full shrink flex-col gap-1.5 overflow-y-auto");
    expect(hintBlock).toMatch(/min-h-11 shrink-0/);
    // …to the rule's own closing brace and not to the first `}` in it: every
    // length in here is a `${…}` interpolation, so „the first brace" is inside
    // the first declaration.
    const bare = CSS.slice(CSS.search(/\n\s*\[data-hud="touch-hint"\] \{/));
    expect(bare.slice(0, bare.indexOf("\n      }"))).toContain("overflow: hidden;");
  });

  it("…and its «Разбрах» paints a box again, in the ack chip's register", () => {
    // Photographed on the deployed build: bare DARK type on a bright road.
    // `[data-hud="touch-hint"]` is on `GHOST_SURFACES`, so the UNPANEL sweep's
    // `background-color: transparent !important` had been stripping `bg-accent`
    // off the one control that clears this card ever since the sweep landed —
    // and `text-background` is #04070e over tarmac.
    expect(hintBlock).toContain('data-hud-ink=""');
    expect(hintBlock).not.toContain("bg-accent");
    expect(hintBlock).not.toContain("text-background");
    // …and NOT as the solid pill the 2026-08-03 review called a cookie banner:
    // the same 18 %/55 % chip SimOverlay's acknowledgement already ships.
    expect(hintBlock).toContain('color-mix(in srgb, var(--accent) 18%, transparent)');
    // ── THE SECOND COLOUR MOVED ON THE OVERLAY, AND ONLY THERE — 2026-08-27.
    //
    // This line used to read `…18%, transparent)`, i.e. it asserted the two
    // chips were character-identical. SimOverlay's ack now mixes the SAME 18 %
    // with the peek chips' own ground instead of with `transparent`, because
    // the peek's three controls stand on live road and the world was resolving
    // inside them (`sim-overlay-chip-ground.test.ts` has the frames and the
    // derivation). This card does not: `[data-hud="touch-hint"]` is its own
    // ghost with `overflow: hidden`, and nothing filed against it.
    //
    // SO THE ASSERTION IS NARROWED, LOUDLY, TO THE HALF THAT IS STILL TRUE —
    // the 18 % REGISTER, which is what „not a solid brand button" means — and
    // it still bites in both directions: 100 % fails it, and so does a chip
    // with no `backgroundColor` at all, which is the state «ЗАЩО» shipped in.
    // If the touch hint is ever given a ground of its own, this pair becomes
    // one string again and this comment is the record of why it was two.
    expect(OVERLAY_CODE).toMatch(/backgroundColor: `color-mix\(in srgb, \$\{color\} 18%,/);
  });

  it("…and it is small type, because the lane is 180 px and not 334", () => {
    // 14 px in a 180 px column is four words a line. The notification column's
    // own register is 11 px and has been since it shipped; the hint joins it.
    expect(hintBlock).not.toContain("text-sm");
    expect(hintBlock).not.toContain("max-w-2xl");
    expect(hintBlock).toContain("text-[11px]");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   ROW 4 — „«КОЛАН» IS THE LEAST VISIBLE THING ON SCREEN."

   MEASURED, same build, belt off:
     «Закопчай предпазния колан»  [741, 176, 44 × 44]
       color rgb(255,106,88) · 15 px glyph · 8 px word
       background-color rgba(0,0,0,0) · border 0px
   — and its three neighbours on the same flank are the same box, the same
   glyph size and the same caption size, in white. The one control that is an
   alert was distinguished from three ordinary ones by HUE ALONE.
   ─────────────────────────────────────────────────────────────────────────── */
describe("row 4 · the belt station has ink", () => {
  const beltRule = CSS.slice(
    CSS.indexOf('button[aria-label="Закопчай предпазния колан"] {'),
    CSS.indexOf("@keyframes sim-belt-pulse"),
  );

  it("paints a fill and a hairline, and pulses", () => {
    expect(beltRule).toContain("background-color: color-mix(in srgb, var(--danger)");
    expect(beltRule).toContain("border-width: 1px");
    expect(beltRule).toContain("animation: sim-belt-pulse");
    expect(CSS).toContain("@keyframes sim-belt-pulse");
    // Reduced motion is a request about MOVEMENT, not about salience: the
    // animation goes and the loud end of the ramp stays.
    const reduced = CSS.slice(CSS.indexOf("@media (prefers-reduced-motion: reduce)", CSS.indexOf("@keyframes sim-belt-pulse")));
    expect(reduced.slice(0, 700)).toContain("animation: none;");
    expect(reduced.slice(0, 700)).toContain("background-color: color-mix(in srgb, var(--danger)");
  });

  it("changes NO geometry — the station is still 44 × 44 on the band", () => {
    // `touchArc.test.ts` and the flank sweep read these rects. A fill may not
    // become a layout change smuggled in through another lane's stylesheet.
    // Matched as a DECLARATION (start of line or after `;`/`{`) and not as a
    // substring: `border-width: 1px` contains „width:" and paints nothing, and
    // a test that cannot tell those apart is a test that gets deleted.
    for (const prop of ["width", "height", "top", "bottom", "left", "right", "transform", "margin", "padding", "inset"]) {
      expect(beltRule, `the belt rule must not set ${prop}`).not.toMatch(
        new RegExp(`(^|[\\s;{])${prop}\\s*:`, "m"),
      );
    }
  });

  it("names the control by what it IS, and pins it to its own station", () => {
    // Row A2's precedent: `aria-label` is load-bearing to what the control is,
    // a `:nth-child` chain is a private detail of a file this lane does not own
    // and stops matching the day a wrapper moves — the failure mode where a fix
    // reports green and the founder still cannot see the button.
    expect(CSS).toContain('[data-arc="0"][data-arc-side="right"]');
    // …and the markup still carries both halves of that handle.
    expect(TOUCH).toContain('labelBg="Закопчай предпазния колан"');
    expect(TOUCH).toContain("data-arc={index}");
    expect(TOUCH).toContain("data-arc-side={side}");
  });
});

/* ───────────────────────────────────────────────────────────────────────────
   ROW 5 — „TWO UNSTYLED BLUE CROSSHAIR WIDGETS FLOATING IN THE COCKPIT."

   FOUND by hit-testing the two coordinates in his frame rather than by
   guessing: they are the steering pad's 62 × 1 px rule with two end ticks and
   a 22 px ring (`bg-accent/45` + `border-accent`), and the drivetrain pad's
   same shape rotated, whose ring border is written INLINE as `var(--accent)`.
   Not stray widgets — the only ink either pad has — but the only two saturated
   brand-blue marks left on a screen whose every other instrument was moved to
   a neutral hairline register.
   ─────────────────────────────────────────────────────────────────────────── */
describe("row 5 · the pad marks are in the HUD's own register", () => {
  const padRule = CSS.slice(
    CSS.indexOf('[data-hud="touch-controls"] [role="slider"] {'),
    CSS.indexOf('[data-hud="touch-controls"] [role="slider"] {') + 260,
  );

  it("restates the TOKEN on the slider subtree, not the declarations", () => {
    expect(padRule).toContain("--accent:");
    // Tailwind's `bg-accent/45` and `border-accent` resolve through this one,
    // which is computed at :root and therefore has to be restated beside it.
    expect(padRule).toContain("--color-accent:");
  });

  it("…and carries no !important, because the ring's colour is LIVE feedback", () => {
    // `driveApply` writes the ring's border inline — green while the thumb asks
    // for throttle, red while it brakes, accent at neutral. A stylesheet rule
    // strong enough to beat an inline declaration would kill the only live
    // feedback the pad has, which is why the token moves instead.
    expect(padRule).not.toContain("!important");
    expect(TOUCH).toContain(
      'axis > 0 ? "var(--success)" : axis < 0 ? "var(--danger)" : "var(--accent)"',
    );
  });
});
