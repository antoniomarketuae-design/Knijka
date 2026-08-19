/**
 * =============================================================================
 * THE CARD HAD NO GROUND — the ONE critical finding routed to SimOverlay.tsx,
 * plus the second clause of twenty-three more. Catalogue sweep 161, 2026-08-19.
 * =============================================================================
 *
 * FILED, verbatim (sc-ov-lane-keeping/mobile-right/04-t152s.png, critical):
 *
 *   „On mobile the ИНСТРУКЦИИ overlay has NO panel background at all. The
 *    'ИНСТРУКЦИИ' title is drawn over the demo picture-in-picture video, the
 *    body text runs straight over sky and buildings … The lesson's
 *    instructions are unreadable on a phone."
 *
 * and, as the second half of one sentence filed against twenty-three lessons:
 *
 *   „It carries no panel of its own, so its first two lines render directly
 *    over the rear-view mirror image and the sky, and the «ЗАЩО»/«×» controls
 *    land on top of world geometry."
 *
 * ── THE MEASUREMENT THIS FILE STANDS ON ──────────────────────────────────────
 *
 * Four filed frames were opened at device resolution (2556 × 1179 = iPhone 16
 * landscape 852 × 393 at dpr 3) and a 55 × 130 CSS-px block of world was
 * sampled IMMEDIATELY LEFT OF THE CARD'S OWN BOX, on the same rows. Left of the
 * box and not inside it, deliberately: it is the same material — the same
 * facade, the same sky — and it cannot contain one glyph or one halo pixel the
 * card itself drew, so the number is the ground and not the card.
 *
 *   sc-jx-blocked-exit  06-waited   L50 0.351  L90 0.518  L99 0.597  max 0.610
 *   sc-rb-exit-signal   04-t035s    L50 0.332  L90 0.523  L99 0.595  max 0.604
 *   sc-merge-lane-end   04-t115s    L50 0.273  L90 0.507  L99 0.570  max 0.589
 *   sc-ov-lane-keeping  04-t152s    L50 0.405  L90 0.467  L99 0.499  max 0.543
 *
 * The brightest single pixel across all four is rgb(204, 205, 206), and it is
 * the render-white facade in `sc-jx-blocked-exit/mobile-right/06-waited.png` —
 * the frame in which the whole authored WHY is pale grey type on pale grey
 * masonry. That pixel is `WORST_WORLD` below and it is what every assertion in
 * this file is computed against, because a HUD that is legible on the average
 * pixel and invisible on the bright one is a HUD that goes dark exactly when a
 * student is driving into the sun.
 *
 * ── WHY THIS IS A NODE TEST AND NOT A RENDER ────────────────────────────────
 *
 * The sibling files say it and it is the same reason here: vitest runs
 * `environment: "node"` in this suite, and jsdom would not composite an alpha
 * over a background or resolve a `mask-image` even if it did. What CAN be
 * proved without a browser is the arithmetic — an alpha, a colour and a
 * background determine a contrast ratio exactly — and the arithmetic is the
 * part that was wrong. The acceptance evidence is still a frame.
 *
 * ── THE INSTRUMENT SELF-CHECKS, BECAUSE EVERY „0 DEFECTS" IN THIS PROJECT WAS
 *    AN INSTRUMENT BUG AND ALL OF THEM LIED IN THE REASSURING DIRECTION ──────
 *
 * `contrast()` below is checked against the two anchors WCAG publishes before
 * it is trusted with anything: black on white is exactly 21 : 1, and #767676 on
 * white is the canonical 4.5 : 1 boundary case. A luminance function with a
 * transposed coefficient or a missing gamma step passes neither.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PEEK_SCRIM_ALPHA,
  PEEK_SCRIM_FEATHER_PX,
  PEEK_SCRIM_RGB,
  peekScrimBackgroundCss,
  peekScrimMaskCss,
} from "../SimOverlay";

const SRC = readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8");

type Rgb = readonly [number, number, number];

/** sRGB relative luminance, WCAG 2.x. */
function luminance([r, g, b]: Rgb): number {
  const chan = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `source` laid over `ground` at `alpha`, the way a browser composites it. */
function over(source: Rgb, ground: Rgb, alpha: number): Rgb {
  return [0, 1, 2].map((i) => alpha * source[i]! + (1 - alpha) * ground[i]!) as unknown as Rgb;
}

function hex(h: string): Rgb {
  const n = Number.parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The brightest world pixel under this card across the four filed frames —
 * `sc-jx-blocked-exit/mobile-right/06-waited.png`, the render-white facade.
 */
const WORST_WORLD: Rgb = [204, 205, 206];

/**
 * The three inks the card actually paints, as the UNPANEL register restates
 * them INSIDE a ghost (PlayAreaStyles, `[data-sim-stage] :is(.hud-ghost, …)`) —
 * not the app-theme values, which are dark and would flatter the result.
 */
const INK = {
  /** `--foreground`, pinned light inside the ghost: row 2, the authored line. */
  line: hex("#f2f6fc"),
  /** `--muted`, likewise: row 2b, the authored WHY. */
  body: hex("#c3cfe2"),
  /**
   * `--accent` — the chip, «↓ още N реда», «Прочети» and «Разбрах». THE QUIET
   * ONE, and therefore the one that sets the alpha. 10 px and `font-black`,
   * which is nowhere near WCAG's „large text", so its floor is 4.5 and not 3.
   */
  accent: hex("#3fa1ff"),
} as const;

/** WCAG AA for body-sized text. The floor, not a target. */
const AA = 4.5;

describe("the instrument, before it is believed", () => {
  it("reproduces the two contrast anchors WCAG publishes", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 6);
    // The canonical boundary grey: #767676 on white is 4.54 : 1.
    expect(contrast(hex("#767676"), [255, 255, 255])).toBeCloseTo(4.54, 2);
    expect(contrast([128, 128, 128], [128, 128, 128])).toBeCloseTo(1, 6);
  });

  it("composites the way a browser does — alpha 0 and 1 are the two ends", () => {
    expect(over([0, 0, 0], WORST_WORLD, 0)).toEqual([204, 205, 206]);
    expect(over([0, 0, 0], WORST_WORLD, 1)).toEqual([0, 0, 0]);
  });
});

describe("the defect, stated as a number so it cannot come back quietly", () => {
  /**
   * This is the frame, in arithmetic. If a later wave deletes the ground, these
   * are the ratios it goes back to — and 1.28 : 1 is not „low contrast", it is
   * the same colour twice.
   */
  it("bare ink on the filed facade is 1.0–1.7 : 1, i.e. no contrast at all", () => {
    expect(contrast(INK.line, WORST_WORLD)).toBeCloseTo(1.47, 2);
    expect(contrast(INK.accent, WORST_WORLD)).toBeCloseTo(1.7, 2);
    // THE NUMBER THAT IS THE FINDING. `--muted` is L 0.6172 and that facade
    // pixel is L 0.6096: the authored WHY and the wall behind it are the same
    // colour to a hundredth. Not „hard to read" — not there.
    expect(contrast(INK.body, WORST_WORLD)).toBeLessThan(1.05);
    // …and all three are far under the floor, which is the whole finding.
    for (const ink of Object.values(INK)) {
      expect(contrast(ink, WORST_WORLD)).toBeLessThan(AA);
    }
  });
});

describe("the ground, over the brightest world the sweep put under this card", () => {
  const shade = PEEK_SCRIM_RGB as unknown as Rgb;
  /**
   * ROUNDED, AND THAT IS THE POINT OF THIS WHOLE `describe`. A browser stores
   * the composited ground as 8-bit integers; the un-rounded float is a number
   * no pixel ever holds. The first alpha tried here (0.78) cleared AA by
   * 0.0016 — less than one unit of that rounding moves the ratio — and the
   * un-rounded form said it was fine.
   */
  const groundedAt = (alpha: number): Rgb =>
    over(shade, WORST_WORLD, alpha).map(Math.round) as unknown as Rgb;
  const grounded = groundedAt(PEEK_SCRIM_ALPHA);

  it("carries every ink on the card over AA", () => {
    expect(contrast(INK.line, grounded)).toBeGreaterThanOrEqual(AA);
    expect(contrast(INK.body, grounded)).toBeGreaterThanOrEqual(AA);
    // The binding one, and the only one with a small margin: 4.75 : 1.
    expect(contrast(INK.accent, grounded)).toBeGreaterThanOrEqual(AA);
  });

  it("clears the floor by more than the compositor's own rounding", () => {
    // What 0.78 failed. A margin thinner than one 8-bit step is not a margin —
    // it is the un-rounded arithmetic flattering itself. Half a step in the
    // ground is worth about 0.013 of ratio here, so 0.05 is ~4 steps of slack.
    expect(contrast(INK.accent, grounded)).toBeGreaterThanOrEqual(AA + 0.05);
    // …and the claim „rounding moves it that much" is itself checked, so this
    // assertion cannot quietly become a stricter floor with no reason attached.
    const nudged: Rgb = [grounded[0] + 1, grounded[1] + 1, grounded[2] + 1];
    expect(Math.abs(contrast(INK.accent, nudged) - contrast(INK.accent, grounded))).toBeGreaterThan(
      0.005,
    );
  });

  it("0.80 is the floor and not a preference — a lighter shade drops the accent", () => {
    // The mutation, run as an assertion: the alpha one step down fails the ink
    // that binds. Without this, „0.80" reads as taste and the next wave rounds
    // it to 0.7 to make the road show through.
    expect(contrast(INK.accent, groundedAt(PEEK_SCRIM_ALPHA - 0.05))).toBeLessThan(AA);
    // …and no shade at all is the defect itself.
    expect(contrast(INK.body, groundedAt(0))).toBeLessThan(2);
  });

  it("still lets the world through — it is a shade, not a curtain", () => {
    // A FALSE FIX IN THE OTHER DIRECTION. „An instruction he can read but which
    // hides the hazard it is about is a different failure" is the founder's own
    // note on this card, so the ground is asserted from BOTH sides.
    //
    // The measurement is the world's OWN contrast, not a taste threshold: the
    // dark bonnet rgb(70, 78, 92) against the lit facade is 5.27 : 1 bare. Under
    // the shipped shade it is 1.37 : 1 — dimmed, still two different things. At
    // 0.90 it would be 1.13 and at 1.00 exactly 1.00, i.e. one flat rectangle,
    // which is the panel this may not become. 1.25 is the floor because a
    // luminance step of a quarter is plainly visible over a field this size.
    const BONNET: Rgb = [70, 78, 92];
    expect(contrast(BONNET, WORST_WORLD)).toBeGreaterThan(5);
    const seen = contrast(
      over(shade, BONNET, PEEK_SCRIM_ALPHA),
      over(shade, WORST_WORLD, PEEK_SCRIM_ALPHA),
    );
    expect(seen).toBeGreaterThan(1.25);
    // …and the direction of travel is checked, so „> 1.25" cannot be satisfied
    // by an alpha so low that the first half of this file fails instead.
    expect(
      contrast(over(shade, BONNET, 0.9), over(shade, WORST_WORLD, 0.9)),
    ).toBeLessThan(seen);
    expect(contrast(over(shade, BONNET, 1), over(shade, WORST_WORLD, 1))).toBeCloseTo(1, 6);
  });
});

describe("it has no edge, which is the whole difference from the box he had removed", () => {
  const bg = peekScrimBackgroundCss();
  const mask = peekScrimMaskCss();

  it("both horizontal ends ramp to alpha 0", () => {
    // `to left`: 0px is the RIGHT edge, 100% is the LEFT edge. Both ends must
    // be the transparent stop, or the shade is a rectangle with a visible side.
    expect(bg.startsWith(`linear-gradient(to left, rgba(6, 11, 20, 0) 0px,`)).toBe(true);
    expect(bg.endsWith(`rgba(6, 11, 20, 0) 100%)`)).toBe(true);
  });

  it("both vertical ends ramp to alpha 0", () => {
    expect(mask).toContain("transparent 0px");
    expect(mask.endsWith("transparent 100%)")).toBe(true);
  });

  it("every ramp lives in the overhang, so the flat core is exactly the card", () => {
    // The ramp lengths and the negative insets are THE SAME CONSTANT, which is
    // what makes the claim true rather than approximately true: the shade is
    // full strength from the card's own top-left to its own bottom-right, and
    // fades only in the part of itself that hangs past the card.
    expect(bg).toContain(`rgba(6, 11, 20, ${PEEK_SCRIM_ALPHA}) ${PEEK_SCRIM_FEATHER_PX.right}px`);
    expect(bg).toContain(
      `rgba(6, 11, 20, ${PEEK_SCRIM_ALPHA}) calc(100% - ${PEEK_SCRIM_FEATHER_PX.left}px)`,
    );
    expect(mask).toContain(`#000 ${PEEK_SCRIM_FEATHER_PX.top}px`);
    expect(mask).toContain(`#000 calc(100% - ${PEEK_SCRIM_FEATHER_PX.bottom}px)`);
    for (const side of ["top", "right", "bottom", "left"] as const) {
      const px = PEEK_SCRIM_FEATHER_PX[side];
      // A ramp shorter than ~8 px reads as an edge at dpr 3; longer than ~32 px
      // and the shade starts covering road the card was never standing on.
      expect(px, `${side} feather`).toBeGreaterThanOrEqual(8);
      expect(px, `${side} feather`).toBeLessThanOrEqual(32);
      expect(SRC).toContain(`${side}: \`\${-PEEK_SCRIM_FEATHER_PX.${side}}px\``);
    }
  });

  it("the RAMPS are px, not per cent — the column is two widths, not one", () => {
    // 180 px sideways and up to 240 px upright (`notifyColumn.ts`). A percentage
    // ramp is a different number of pixels on each, so the flat core would stop
    // coinciding with the card's box on one orientation and nothing rendered in
    // node would notice. This file has already shipped one orientation-only
    // half-fix (the `@media` override the cascade discarded).
    //
    // `100%` and `calc(100% − Npx)` are the box's own far edge and are the ONE
    // legitimate use of a percentage here; every other stop must be absolute.
    // The check is therefore „no percentage stop other than 100%", not „no `%`".
    // `calc(…)` first, or the `[^,)]` arm eats the stop at its own parenthesis
    // and silently hands back a THREE-stop list that passes — the reassuring
    // direction, again. The length assertion below is what caught that.
    const stops = [...bg.matchAll(/rgba\([^)]*\)\s+(calc\([^)]*\)|[^,)]+)/g)].map((m) => m[1]!);
    expect(stops).toHaveLength(4);
    for (const stop of stops) {
      expect(stop, `stop "${stop}"`).toMatch(/^(\d+px|calc\(100% - \d+px\)|100%)$/);
    }
    // …and a `%` ramp would show up as a stop this pattern rejects:
    expect(/^(\d+px|calc\(100% - \d+px\)|100%)$/.test("62%")).toBe(false);
  });

  it("is not the shape the founder had removed — no border, no radius, no blur", () => {
    // „a full-width rounded strip ending in a SOLID BRAND-BLUE «Разбрах»
    // button. THAT IS A COOKIE BANNER." The three words that make that shape.
    expect(bg + mask).not.toMatch(/border|radius|blur/i);
  });
});

describe("the wiring, because a stripped style is a diff that changes no pixel", () => {
  const el = SRC.slice(
    SRC.indexOf('data-sim-overlay-scrim=""'),
    SRC.indexOf("Row 1 — the tone glyph"),
  );

  it("the shade element is findable (anchor check)", () => {
    expect(el.length, "the scrim element moved — re-anchor the tests below").toBeGreaterThan(200);
  });

  it("carries the UNPANEL exemption, or the stylesheet deletes it", () => {
    // `[data-sim-stage] :is(.hud-ghost, …) :is(div, …):not([data-hud-ink])` sets
    // `background-image: none !important`. Without this attribute the whole fix
    // is invisible on the deployed build and green here — which is precisely
    // how the tier picker's filled segment survived an entire unpanel pass.
    expect(el).toContain('data-hud-ink=""');
  });

  it("paints behind the words rather than over them", () => {
    // In-flow content paints BEFORE positioned descendants, so an absolutely
    // positioned sibling at `z-index: auto` lands ON TOP of the type it exists
    // to make readable — a fix that makes the finding worse.
    expect(el).toContain("zIndex: -1");
    expect(el).toContain('position: "absolute"');
  });

  it("never eats the tap that dismisses the card, and is never announced", () => {
    // The plain-line shape makes the WHOLE CARD a `<button aria-label="Скрий
    // известието">` (doc 87 · A6). A shade that swallowed that press would
    // re-open the founder's „those pop ups need to be able to be removed when
    // clicked" one layer down.
    expect(el).toContain('pointerEvents: "none"');
    expect(el).toContain("aria-hidden");
  });

  it("ships both mask spellings, for the WebKit versions still in this market", () => {
    expect(el).toContain("WebkitMaskImage: peekScrimMaskCss()");
    expect(el).toContain("maskImage: peekScrimMaskCss()");
  });

  it("the card is the shade's containing block AND its stacking context", () => {
    // `absolute` without a positioned ancestor escapes to the notification
    // column — which is `max-height`-capped at 95.76 px sideways while the card
    // it holds lays out taller, so the control row would be left unshaded.
    const cls = /const CARD_CLASS =\s*\n?\s*"([^"]*)"/.exec(SRC)?.[1];
    expect(cls, "CARD_CLASS moved — re-anchor this test").toBeDefined();
    expect(cls).toContain("relative");
    // ── AND `isolate`, WHICH WAS CAUGHT BY LOOKING AND BY NOTHING ELSE.
    //
    // A negative z-index does not stop at its parent: it climbs to the nearest
    // ancestor that HAS a stacking context and paints at the bottom of THAT
    // one. Rendered in WebKit over a patch of the facade this finding was filed
    // on, the first version of this fix produced a screenshot identical to the
    // defect — the shade sank past the backdrop and painted nothing — while
    // every assertion in this file was green. The column happens to carry
    // `z-30`, so on the shipped page it would have worked by coincidence, one
    // edit to somebody else's z-index away from silently reverting to 1.0 : 1.
    expect(cls).toContain("isolate");
    // …and it is still not the strip: `unpanel.test.ts` asserts these two from
    // its own side, and they are restated here because THIS is the commit that
    // added a background to this card and had to not put the box back.
    expect(cls).not.toMatch(/\bborder\b/);
    expect(cls).not.toMatch(/\brounded-full\b/);
  });
});
