/**
 * B35 — A DEAD SIGNAL HEAD MUST LOOK DEAD.
 *
 * The register row is „is the dead head visibly dark". It was refused on a
 * frame where the caption said ЗАГАСНАЛ СВЕТОФАР over three lamps that any
 * student would call lit, and the reason turned out not to be the lens COLOURS
 * — those were already in the unlit branch — but two properties of them that
 * no type check can see:
 *
 *   the unlit lenses were fully saturated pure hues (measured 0.948 / 1.000 /
 *   0.801 HSV on `RR/b35/b35-y-50.png`, the captioned head at 24.7 m), and
 *   they were drawn on the same emissive, un-tone-mapped material as a LIT
 *   lens, so two of the three „off" lamps were brighter than the housing they
 *   sat in (relative luminance 0.118 and 0.108 against 0.066).
 *
 * This file is the arithmetic that stops that coming back. It is deliberately
 * split in two halves, because the defect needs BOTH to reappear:
 *
 *   1. THE NUMBERS — the lit/unlit gap in saturation and luminance, on the
 *      authored swatches, with a wide empty band between the two sets so that
 *      „lifting the unlit lens a little" (which is exactly what doc 86 L2 did)
 *      cannot creep across it unnoticed.
 *   2. THE WIRING — a source pin on WorldProps.tsx, in the grammar of
 *      `signal-lamp-fallback.test.ts` next door. The colours only mean what
 *      they mean if the unlit lens is on a SCENE-LIT pass and the emissive
 *      pass is ADDITIVE (so „off" = black = nothing drawn, rather than black =
 *      a hole punched in the head).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  channels,
  hsvSaturation,
  LAMP_ON_HEX,
  LENS_EMISSIVE_R_M,
  LENS_GLASS_HEX,
  LENS_R_M,
  relativeLuminance,
} from "../signalLensLook";

const LENSES = ["red", "yellow", "green"] as const;

/**
 * The lamp-box paint the lens is set INTO (`buildPedSignalHousing`, L 0.016).
 * The mast beside it is 0x2b2f33 (L 0.028) — lighter than the red glass, and
 * that is fine: nobody mistakes a pole for a lens. The comparison that matters
 * is the box the three lenses are cut into.
 */
const HOUSING_BOX_HEX = 0x1f2226;

describe("the helpers do what the pins below assume", () => {
  it("hsvSaturation is 1 for a pure hue and 0 for a grey", () => {
    expect(hsvSaturation(0xff0000)).toBe(1);
    expect(hsvSaturation(0x808080)).toBe(0);
    expect(hsvSaturation(0x000000)).toBe(0);
  });

  it("relativeLuminance brackets black and white", () => {
    expect(relativeLuminance(0x000000)).toBeCloseTo(0, 6);
    expect(relativeLuminance(0xffffff)).toBeCloseTo(1, 6);
    // …and it is not a naive channel average: green carries most of it.
    expect(relativeLuminance(0x00ff00)).toBeGreaterThan(relativeLuminance(0xff0000));
  });

  it("channels splits an 0xRRGGBB literal", () => {
    expect(channels(0x3b2422)).toEqual([0x3b, 0x24, 0x22]);
  });
});

describe("an unlit lens is DESATURATED — the property that read as „lit”", () => {
  it("every unlit tint is well under half-saturated", () => {
    for (const k of LENSES) {
      const s = hsvSaturation(LENS_GLASS_HEX[k]);
      expect(s, `${k} glass saturation ${s.toFixed(3)}`).toBeLessThanOrEqual(0.45);
    }
  });

  it("every lit colour is a pure hue, so the two sets cannot be confused", () => {
    for (const k of LENSES) {
      const s = hsvSaturation(LAMP_ON_HEX[k]);
      expect(s, `${k} lit saturation ${s.toFixed(3)}`).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("leaves an empty band between the two sets", () => {
    const unlitMax = Math.max(...LENSES.map((k) => hsvSaturation(LENS_GLASS_HEX[k])));
    const litMin = Math.min(...LENSES.map((k) => hsvSaturation(LAMP_ON_HEX[k])));
    // A gap, not a boundary: a future nudge has to cross open ground.
    expect(litMin - unlitMax).toBeGreaterThan(0.25);
  });

  it("the OLD unlit colours would fail this — the scanner has teeth", () => {
    // The three samples the row was refused on, verbatim from the frame.
    for (const [name, hex] of [
      ["red", 0x8a1107],
      ["amber", 0x855700],
      ["green", 0x156b25],
    ] as const) {
      expect(hsvSaturation(hex), `refused frame ${name}`).toBeGreaterThan(0.45);
    }
  });
});

describe("an unlit lens is DARK — but not a hole", () => {
  it("is at most 15 % of its own lit colour's luminance", () => {
    for (const k of LENSES) {
      const ratio = relativeLuminance(LENS_GLASS_HEX[k]) / relativeLuminance(LAMP_ON_HEX[k]);
      expect(ratio, `${k} unlit/lit luminance ${ratio.toFixed(3)}`).toBeLessThanOrEqual(0.15);
    }
  });

  it("is never black — a black lens is the „no traffic light exists” defect", () => {
    for (const k of LENSES) {
      expect(LENS_GLASS_HEX[k], k).not.toBe(0x000000);
      // Brighter than the lamp box it is set into, so three lenses are still
      // plainly there on a head whose bulbs are all out. (Measured on the
      // rendered frame at 24.7 m, where the whole head is scene-lit: the unlit
      // lens against the housing gives a Michelson contrast of 0.61–0.85,
      // where the OLD unlit red managed 0.07 — the head is MORE legible as an
      // object now, it simply stopped claiming to be on.)
      expect(relativeLuminance(LENS_GLASS_HEX[k]), k).toBeGreaterThan(
        relativeLuminance(HOUSING_BOX_HEX),
      );
    }
  });

  it("keeps enough hue to still read as a red/amber/green lens", () => {
    // Desaturated is not colourless: which lens is which must survive.
    for (const k of LENSES) {
      expect(hsvSaturation(LENS_GLASS_HEX[k]), k).toBeGreaterThan(0.2);
    }
    // …and each glass tint's brightest channel is its OWN channel.
    const [r] = channels(LENS_GLASS_HEX.red);
    expect(r).toBe(Math.max(...channels(LENS_GLASS_HEX.red)));
    const g = channels(LENS_GLASS_HEX.green)[1];
    expect(g).toBe(Math.max(...channels(LENS_GLASS_HEX.green)));
  });
});

describe("the emissive sphere can actually be seen when it IS lit", () => {
  it("is larger than the glass it sits in, or the depth test rejects it", () => {
    expect(LENS_EMISSIVE_R_M).toBeGreaterThan(LENS_R_M);
  });

  it("but by a hair — a visible overhang would ring the lens", () => {
    // 0.004 m at the 25 m this row is judged at is 0.15 px.
    expect(LENS_EMISSIVE_R_M - LENS_R_M).toBeLessThan(0.01);
  });
});

// ---------------------------------------------------------------------------
// THE WIRING. Colours alone do not make a dead head look dead: the unlit lens
// has to be on a scene-lit pass, and „off" has to draw nothing at all.
// ---------------------------------------------------------------------------

const WORLD_PROPS = readFileSync(
  join(process.cwd(), "src", "modules", "sim", "world", "components", "WorldProps.tsx"),
  "utf8",
);
const CODE = WORLD_PROPS.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

describe("the two passes a head is drawn in (source pin)", () => {
  it("mounts a scene-lit glass pass for the vehicle head AND the walker's", () => {
    expect(CODE).toContain('"traffic-light-lens-glass"');
    expect(CODE).toContain('"pedestrian-lens-glass"');
    // Scene-lit: a MeshBasicMaterial cannot darken in shadow, which is what
    // made the old „off" lens look self-luminous in the first place.
    expect(CODE).toMatch(/createLensGlass[\s\S]*?MeshStandardMaterial/);
  });

  it("draws the lit lens ADDITIVELY, so black means „not drawn”", () => {
    expect(CODE).toMatch(/createLampEmissiveMaterial[\s\S]*?AdditiveBlending/);
    expect(CODE).toMatch(/createLampEmissiveMaterial[\s\S]*?depthWrite:\s*false/);
  });

  it("gives an unlit lens NO emissive contribution — never a dimmed one", () => {
    // `lampColorsFor` and `pedLampColors` are the only writers of the emissive
    // instance colours. Every „off" branch must be LAMP_DARK.
    expect(CODE).toMatch(/const LAMP_DARK = new THREE\.Color\(0x000000\)/);
    const fn = /function lampColorsFor[\s\S]*?\n}/.exec(CODE);
    expect(fn, "lampColorsFor not found").not.toBeNull();
    expect((fn![0].match(/:\s*LAMP_DARK/g) ?? []).length).toBe(3);
    const ped = /function pedLampColors[\s\S]*?\n}/.exec(CODE);
    expect(ped, "pedLampColors not found").not.toBeNull();
    expect(ped![0]).toContain("LAMP_DARK");
    // The dead head is the row: every lens off, no exceptions.
    expect(ped![0]).toMatch(/state === "dark"\)\s*return \[LAMP_DARK, LAMP_DARK\]/);
  });

  it("keeps the lens numbers in one place, not typed twice", () => {
    expect(CODE).toMatch(/from "\.\/signalLensLook"/);
    // A raw sphere radius next to a lamp offset is how 0.13 got duplicated
    // three ways before; the constants file is the single truth now.
    expect(CODE).toMatch(/new THREE\.SphereGeometry\(LENS_R_M,/);
    expect(CODE).toMatch(/new THREE\.SphereGeometry\(LENS_EMISSIVE_R_M,/);
  });
});
