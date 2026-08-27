/**
 * =============================================================================
 * THE PEEK'S CONTROL CHIPS HAD NO GROUND — 2026-08-27.
 *
 * Four rows of one sweep, one sentence: „The card's «ЗАЩО» control lands on top
 * of world geometry" (sc-ov-solid-return:5cb8eb40), „the «ЗАЩО ↓10» and «✕»
 * pills are unfilled outlines sitting directly on the parked cars"
 * (sc-park-zebra:9ce33786), „The card's ЗАЩО button is drawn over the traffic"
 * (sc-ov-night-gap:a150c99c), „its ЗАЩО / ✕ buttons are drawn on top of the
 * world traffic" (sc-ov-oncoming-gap:0a7d0af9).
 *
 * MEASURED, `w11/frames/…` at device resolution (852 × 393 at dpr 3), luminance
 * sampled inside each chip's own box with the glyph rows avoided:
 *
 *   sc-ov-return-gap__mobile-wrong/04-t081s   «ЗАЩО» sd 15.67   ✕ sd 11.89
 *   sc-park-zebra__mobile-right/04-t013s      «ЗАЩО» sd  5.80   the card's bare
 *                                                               ground: sd 5.85
 *
 * i.e. inside the one control that opens the authored explanation the world's
 * own texture is the same as it is on the bare card beside it. The card's shade
 * DOES reach the chips (`useCardOverhang`, verified on the same frame: the flat
 * core ends at CSS 191.3 and the chips end at 187.7) — it is sized for reading a
 * paragraph, and 1.37 : 1 of surviving world is the founder's own hazard rule,
 * not a fault. What was missing is a ground for the CONTROLS.
 *
 * THIS FILE IS PURE. No render, no timers, no layout: the derivation is
 * arithmetic and the wiring is a source read, so it costs microseconds under a
 * loaded 2-worker suite and cannot go red for want of a machine.
 * =============================================================================
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PEEK_CHIP_GROUND_ALPHA,
  PEEK_CHIP_TOTAL_ALPHA,
  PEEK_SCRIM_ALPHA,
  PEEK_SCRIM_RGB,
  chipGroundAlphaFor,
  peekChipGroundCss,
} from "../SimOverlay";

const nl = (s: string): string => s.replace(/\r\n/g, "\n");
/** …with the prose taken out: this file ARGUES about shapes it no longer
 *  ships, so „the string is present" must be a claim about the code. */
const strip = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CODE = strip(nl(readFileSync(resolve(__dirname, "../SimOverlay.tsx"), "utf8")));

// ── The two world samples the 0.80 block was measured against, verbatim: the
//    brightest pixel the sweep put under this card and the dark bonnet beside
//    it. Restated here so the ratios below are derived and not quoted.
const WORLD_BRIGHT = [204, 205, 206] as const;
const WORLD_DARK = [70, 78, 92] as const;

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const luminance = (rgb: readonly number[]): number =>
  0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
/** Source-over in sRGB byte space, which is what a browser actually does. */
const over = (world: readonly number[], ground: readonly number[], a: number): number[] =>
  world.map((c, i) => c * (1 - a) + ground[i] * a);
const contrast = (a: readonly number[], b: readonly number[]): number => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** How much of the world's own edge survives a ground of `alpha`. */
const worldEdgeUnder = (alpha: number): number =>
  contrast(over(WORLD_DARK, PEEK_SCRIM_RGB, alpha), over(WORLD_BRIGHT, PEEK_SCRIM_RGB, alpha));

describe("the chip ground is derived from the card's, not typed beside it", () => {
  it("composites with the card's ground back to the total it was solved for", () => {
    const beta = chipGroundAlphaFor(PEEK_SCRIM_ALPHA, PEEK_CHIP_TOTAL_ALPHA);
    // 1 − (1 − a)(1 − b) is what two alpha layers over one pixel actually read
    // as. If this ever stops holding, the chip is either a curtain or a no-op.
    expect(1 - (1 - PEEK_SCRIM_ALPHA) * (1 - beta)).toBeCloseTo(PEEK_CHIP_TOTAL_ALPHA, 10);
    expect(PEEK_CHIP_GROUND_ALPHA).toBeCloseTo(beta, 10);
    // …and at today's constants that is exactly a half.
    expect(PEEK_CHIP_GROUND_ALPHA).toBeCloseTo(0.5, 10);
  });

  it("re-derives when the card's ground moves, instead of rotting", () => {
    // The 0.80 was itself re-picked once (0.78 → 0.795 → 0.80). A chip alpha
    // typed as a literal would have kept the old total through that edit.
    expect(chipGroundAlphaFor(0.75, 0.9)).toBeCloseTo(0.6, 10);
    expect(chipGroundAlphaFor(0.9, 0.9)).toBeCloseTo(0, 10);
    // A total BELOW the card's own ground is not a lighter chip — it is a
    // request the compositor cannot honour, and it must not invert silently.
    expect(chipGroundAlphaFor(0.9, 0.8)).toBe(0);
    expect(chipGroundAlphaFor(1, 0.9)).toBe(0);
  });

  it("lands on the rung the 0.80 block measured and rejected FOR THE CARD", () => {
    // Both numbers come out of one function, so neither can drift alone.
    //   bare              5.27 : 1   the two samples, unshaded
    //   under the card    1.37 : 1   „dimmed, and still plainly two different
    //                                 things" — the founder's hazard rule, and
    //                                 the reason the card may not go past 0.80
    //   inside a chip     1.13 : 1   the rung the same block names as the point
    //                                 the world stops being two things
    expect(worldEdgeUnder(0)).toBeCloseTo(5.27, 2);
    expect(worldEdgeUnder(PEEK_SCRIM_ALPHA)).toBeCloseTo(1.37, 2);
    expect(worldEdgeUnder(PEEK_CHIP_TOTAL_ALPHA)).toBeCloseTo(1.13, 2);
    // AND IT IS STILL A TRANSLUCENT CHIP. 1.00 : 1 is one flat rectangle — the
    // panel the 2026-08-03 review deleted. The chip must stay short of it.
    expect(worldEdgeUnder(PEEK_CHIP_TOTAL_ALPHA)).toBeGreaterThan(1);
    expect(PEEK_CHIP_TOTAL_ALPHA).toBeLessThan(1);
  });

  it("paints the card's own near-black, not a new colour", () => {
    expect(peekChipGroundCss()).toBe(`rgba(${PEEK_SCRIM_RGB.join(", ")}, 0.5)`);
  });

  it("the tone stays ON TOP of the ground, which is why it is one color-mix", () => {
    // `color-mix(in srgb, C p%, G)` premultiplies, so with C opaque it is
    // arithmetically the same pixel as painting C at p% source-over G. Both
    // sides computed here rather than asserted from the comment.
    const TONE = [255, 106, 88] as const; // --danger, the ink that binds
    const g = PEEK_CHIP_GROUND_ALPHA;
    for (const p of [0.18, 0.12]) {
      const mixAlpha = p * 1 + (1 - p) * g;
      const overAlpha = p + g * (1 - p);
      expect(mixAlpha).toBeCloseTo(overAlpha, 12);
      for (let i = 0; i < 3; i += 1) {
        const mixPremul = p * TONE[i] + (1 - p) * g * PEEK_SCRIM_RGB[i];
        const overPremul = p * TONE[i] + g * (1 - p) * PEEK_SCRIM_RGB[i];
        expect(mixPremul).toBeCloseTo(overPremul, 12);
      }
    }
  });
});

describe("…and the ground is actually wired to the three controls", () => {
  /**
   * The control row and nothing else: from the row's own class list to the
   * fragment that closes `cardBody` after the ✕. Bounded deliberately at both
   * ends — a slice that started at `{...tapWhy}` would begin AFTER the «Защо»
   * button's own attributes and read the ACK's `data-hud-ink` as if it were
   * «Защо»'s (it did, for one revision of this file), and a slice that ran on
   * into the column's styles would make „no chip uses a tint as a ground" an
   * assertion about a surface this row does not own.
   */
  // `mt-0.5` left this class list on 2026-08-27: the chips moved inside the row
  // that also carries the moment stamp and the fold label, so the top margin is
  // now that row's. The slice this anchors is unchanged — it still starts at the
  // chips' own container and still ends after the ✕.
  const rowStart = CODE.indexOf('"flex shrink-0 items-center justify-end gap-1"');
  const row = CODE.slice(rowStart, CODE.indexOf("</>", CODE.indexOf("{...tapDismissChip}")));

  it("the control row is still findable (anchor check)", () => {
    // If either anchor moves, the assertions below go vacuously green.
    expect(rowStart, "the control row's class list moved — re-anchor").toBeGreaterThan(0);
    expect(row.length).toBeGreaterThan(1200);
    expect(row).toContain("{...tapWhy}");
    expect(row).toContain("{...tapDismissChip}");
  });

  it("«ЗАЩО» carries the ground AND the exemption that lets it paint", () => {
    const why = row.slice(row.indexOf("{hasDetail ? ("), row.indexOf("{blocking || hasAck ?"));
    expect(why.length).toBeGreaterThan(300);
    expect(why).toContain("{...tapWhy}");
    // …and NOT the neighbours', which is the whole point of the two bounds.
    expect(why).not.toContain("{...tapAck}");
    expect(why).toContain("backgroundColor: peekChipGroundCss()");
    // PlayAreaStyles' UNPANEL sweep is
    //   [data-sim-stage] .hud-ghost :is(div, span, button, …):not([data-hud-ink])
    // with `background-color: transparent !important`. This button is inside the
    // ghost, so WITHOUT the attribute the line above is a diff that changes no
    // pixel — which is exactly how the tier picker's fill survived a sweep.
    expect(why).toContain('data-hud-ink=""');
  });

  it("all three chips share ONE ground — a register, not three opinions", () => {
    expect(row.match(/peekChipGroundCss\(\)/g)).toHaveLength(3);
    // …and the two tone tints keep their strengths and their order: the tone is
    // the FIRST colour of the mix, i.e. it stays on top of the ground.
    expect(row).toContain("color-mix(in srgb, ${color} 18%, ${peekChipGroundCss()})");
    expect(row).toContain("color-mix(in srgb, ${color} 12%, ${peekChipGroundCss()})");
    // A tone mixed with `transparent` is a tint WITHOUT a ground, which is the
    // defect this row closes — 12 % of a tone removed about a quarter of the
    // world inside the ✕ and was accepted as a fill. Borders may still be one.
    expect(row).not.toMatch(/backgroundColor: `color-mix\(in srgb, \$\{color\} \d+%, transparent\)/);
  });
});
