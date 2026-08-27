import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PEEK_SCRIM_FEATHER_PX } from "@/modules/sim/hud";

/**
 * THE FEATHER NEEDS SOMEWHERE TO BE THAT IS NOT ON TOP OF A GLYPH.
 *
 * ── THE ROWS ────────────────────────────────────────────────────────────────
 *
 * Sweep w12 filed the first-run touch card fifteen times in two sentences:
 *
 *   „The first-run touch hint is painted with no panel of its own straight onto
 *    the rear-view mirror image and the sky."
 *      sc-crossing-child-ball:630ecd94 · sc-crossing-white-cane:452ab297 ·
 *      sc-park-zebra:117e0e10 · sc-park-wall:bb338547 ·
 *      sc-crossing-bus-shadow:b86a0913 · sc-park-45-rev:540d469b ·
 *      sc-speed-dangerous:132245db · sc-ov-solid-return:6c0e0f12
 *   „The hint's «РАЗБРАХ» button floats detached below the text with no visual
 *    tie to it."
 *      sc-crossing-child-ball:a846ca99 · sc-crossing-white-cane:90a1ced1 ·
 *      sc-rb-ped-exit:5fa0ff2e · sc-park-zebra:85de2236 ·
 *      sc-park-wall:30a41030 · sc-park-45-rev:95119078
 *
 * The card HAS a shade — `bc5a279` gave it the published one and the w12 frames
 * show it: `sc-park-wall__mobile-right/03-ready.png`, luminance across the
 * card's left edge at device y 232–244, bare sky 160 outside and 79 inside, a
 * ramp 78 device px wide between them. What the shade did not have is ROOM.
 * `inset: 0` on a card whose box stops at the ink puts the 26 px and 12 px
 * horizontal ramps and the 16 px bottom ramp INSIDE the ink:
 *
 *   card box                          device x 1624 → 2164  (180 CSS)
 *   «натисни пак надолу — минава на»  device x 1626 → 2164  (181 CSS)
 *   the ack chip                      the card's last ~46 of ~127 CSS px
 *
 * — so the cyan line that teaches how to select R starts 0.7 CSS px inside a
 * ramp that is at alpha ≈ 0 there, every line's last glyphs stand in the right
 * ramp, and the bottom third of a 44 px touch target stood on live road. That
 * last one is also why `ACK_CHIP_GROUND_ALPHA` was computing 0.90 and shipping
 * 0.90 → 0.50: its derivation assumes the card's own 0.80 is underneath.
 *
 * ── WHAT THIS FILE HOLDS ────────────────────────────────────────────────────
 *
 * The repair is a PAIR and only the pair works: `box-sizing: content-box` plus
 * padding equal to the published feather. Delete the padding and the ramps are
 * back on the glyphs. Delete `box-sizing` and it is WORSE than before — the
 * padding then comes out of the 180 px measure instead of being added around
 * it, «Ляв палец — волан. Десен палец» (173 of 180 px) re-wraps, and the card
 * gains a line it has 2.26 px of slack for, so the reverse-gear sentence comes
 * off the bottom. Either half alone type-checks, renders and changes no test.
 *
 * IT IS A SOURCE GATE AND THAT IS A CONCESSION, said plainly. jsdom has no
 * layout engine, so nothing in this suite can measure a box; importing
 * `LessonScene.tsx` drags in R3F, rapier wasm and the district loader, which is
 * the same reason `touchHintLifetime.ts` and `controlsLegendLifetime.ts` are
 * leaves beside it. What CAN be held without a browser is that the two
 * declarations are still there, still on the same element, and still derived
 * from `PEEK_SCRIM_FEATHER_PX` rather than typed as numbers — and the comment
 * stripping below is `unpanelInkExemption.test.ts`'s own discipline, written
 * after a mutation survived because the paragraph explaining a token contained
 * the token.
 */
const SCENE = readFileSync(
  join(__dirname, "..", "..", "LessonScene.tsx"),
  "utf8",
);

/** The card's own element: from its `data-hud` name to its ack button. */
const CARD = SCENE.slice(
  SCENE.indexOf('data-hud="touch-hint"'),
  SCENE.indexOf("{...tapDismissTouchHint}"),
);

/** …with every comment removed, so no assertion can be satisfied by prose. */
const CARD_CODE = CARD.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("the touch hint's shade has room for its feather", () => {
  it("the card is anchored where this file thinks it is", () => {
    expect(
      SCENE.indexOf('data-hud="touch-hint"'),
      "the touch-hint card moved — re-anchor this file",
    ).toBeGreaterThan(-1);
    expect(CARD.length).toBeGreaterThan(200);
  });

  it("the card sizes its INK, not its shade — box-sizing: content-box", () => {
    // PlayAreaStyles' `width` and `max-height` are written against the corridor
    // (notifyColumn.ts) and mean the PROSE's 180 px measure and the hazard
    // band's ceiling. Under `border-box` the padding below would eat both.
    expect(
      CARD_CODE,
      "the touch-hint card lost `box-sizing: content-box` — the feather " +
        "padding now comes OUT of the 180 px measure, the copy re-wraps and " +
        "the reverse-gear sentence is clipped",
    ).toContain('boxSizing: "content-box"');
  });

  it("the padding IS the published feather, on the three sides that have one", () => {
    for (const side of ["left", "right", "bottom"] as const) {
      const prop = `padding${side[0].toUpperCase()}${side.slice(1)}`;
      expect(
        CARD_CODE,
        `${prop} is gone or hand-typed — the shade's ${side} ramp is back on ` +
          "the ink it is there to keep off",
      ).toContain(`${prop}: \`\${PEEK_SCRIM_FEATHER_PX.${side}}px\``);
    }
  });

  it("…and there is NO top padding, because the mirror's lane is above", () => {
    // `PEEK_SCRIM_FEATHER_PX.top` is 0 by the published constant: above this
    // card is the interior rear-view mirror, and shade on the mirror is the
    // trade `sim-overlay-mirror-lane.test.ts` refused for the peek. A
    // `paddingTop` here would move the card's top edge down and hang the
    // shade's box into that lane.
    expect(PEEK_SCRIM_FEATHER_PX.top).toBe(0);
    expect(
      CARD_CODE,
      "a paddingTop appeared on the touch-hint card — the published top " +
        "feather is 0 and the lane above this card belongs to the mirror",
    ).not.toContain("paddingTop");
  });

  it("the shade still spans that box, and still from the published recipe", () => {
    // The padding is only room; the thing that fills it is the shade. If the
    // shade stopped being `inset: 0` the padding would be a silent 38 px of
    // nothing and the card would simply have moved.
    const shadeAt = CARD_CODE.indexOf('data-hud="touch-hint-scrim"');
    expect(shadeAt, "the touch-hint shade is gone — re-anchor").toBeGreaterThan(-1);
    const shade = CARD_CODE.slice(shadeAt, shadeAt + 900);
    expect(shade).toContain("inset: 0");
    expect(shade).toContain("peekScrimBackgroundCss(");
    expect(shade).toContain("peekScrimMaskCss(");
    // …and the gradient and the mask must be handed the SAME numbers the
    // padding is, or the flat core stops coinciding with the ink.
    expect(shade).toContain("PEEK_SCRIM_FEATHER_PX.left");
    expect(shade).toContain("PEEK_SCRIM_FEATHER_PX.right");
    expect(shade).toContain("PEEK_SCRIM_FEATHER_PX.bottom");
  });
});
