/**
 * The deck's two promises, as numbers.
 *
 * 1. IT CANNOT COST A CONTRAST RATIO. Several review rounds bought specific,
 *    measured ratios on the authenticated surfaces — mastery ink at 7.25 : 1,
 *    the answer controls at 3.51–3.66 : 1 across 99–100 % of their outline,
 *    everything clusterScope.test.ts pins. Those are all INK against a FILL,
 *    and a backdrop that lifts the plane under a glyph spends them. The rule
 *    the deck holds itself to is therefore absolute and easy to check: it may
 *    not be brighter than the `.haze` layer it REPLACES. Its brightest pixel is
 *    `--haze-warm` over `--background`.
 *
 *    Checking the ingredients is enough to prove it about every pixel: sRGB
 *    alpha compositing and gradient interpolation are per-channel linear
 *    blends, the sRGB transfer is monotonic, and relative luminance is a
 *    positive-weighted sum — so a blend can never be brighter than its
 *    brightest ingredient. The last test in this file guards the other half of
 *    that argument: no `mix-blend-mode`, no `filter`, nothing additive.
 *
 * 2. IT IS THE LANDING PAGE'S ROAD. The whole design claim is that logging in
 *    moves a student from behind the car to inside it, in the same world. That
 *    is only true if the two surfaces share the geometry rather than resemble
 *    each other, so the reprojection is pinned here.
 *
 * The WCAG maths is re-implemented rather than imported from the hero's
 * heroContrast.ts, for the same reason clusterScope.test.ts re-implements it:
 * a contrast test that borrows its arithmetic from the code under test only
 * proves the two agree with each other.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  azimuthXOnPlate,
  elevationYOnPlate,
  HERO_PLATE_CAMERA,
  PLATE_RIDGE_POINTS,
  projectOnPlate,
  reprojectPlatePoint,
} from "@/lib/visual/roadPlate";
import {
  DECK_CABIN_COOL,
  DECK_CABIN_COOL_ALPHA,
  DECK_CABIN_COOL_BASE,
  DECK_CAMERA,
  DECK_HAZE_CEILING_HEX,
  DECK_LIT,
  DECK_PAINT,
  DECK_PAINT_ALPHA,
  DECK_RIDGE_FAR,
  DECK_RIDGE_NEAR,
  DECK_RIDGE_POINTS,
  DECK_ROAD_FAR,
  DECK_ROAD_NEAR,
  DECK_SKY_HORIZON,
  DECK_SKY_MID,
  DECK_SKY_TOP,
  DECK_SUN_WARM,
  DECK_TICK_AZIMUTH_LIMIT_DEG,
  DECK_VERGE,
  DECK_VIEWBOX_H,
  DECK_VIEWBOX_W,
  deckDashes,
  deckTicks,
} from "./deckScene";

// ---------------------------------------------------------------------------
// WCAG 2.x
// ---------------------------------------------------------------------------

function channel(byte: number): number {
  const s = byte / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 0xff) +
    0.7152 * channel((n >> 8) & 0xff) +
    0.0722 * channel(n & 0xff)
  );
}

/** sRGB compositing of `fg` at `alpha` over `bg` — the browser's arithmetic. */
function over(fg: string, bg: string, alpha: number): string {
  const f = Number.parseInt(fg.slice(1), 16);
  const b = Number.parseInt(bg.slice(1), 16);
  const mix = (shift: number) =>
    Math.round(((f >> shift) & 0xff) * alpha + ((b >> shift) & 0xff) * (1 - alpha))
      .toString(16)
      .padStart(2, "0");
  return `#${mix(16)}${mix(8)}${mix(0)}`;
}

function ratio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// ---------------------------------------------------------------------------
// The ceiling, computed from the stylesheet that actually ships
// ---------------------------------------------------------------------------

const CSS = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf8");

function clusterToken(name: string): string {
  const at = CSS.indexOf('\n[data-surface="cluster"],');
  const body = CSS.slice(at, CSS.indexOf("\n}", at));
  const hex = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body);
  if (hex) return hex[1].toLowerCase();
  const rgba = new RegExp(`${name}:\\s*rgba\\(([^)]+)\\)`).exec(body);
  if (!rgba) throw new Error(`no token ${name} in the cluster rule`);
  const [r, g, b] = rgba[1].split(",").map((p) => Number.parseFloat(p.trim()));
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

function clusterAlpha(name: string): number {
  const at = CSS.indexOf('\n[data-surface="cluster"],');
  const body = CSS.slice(at, CSS.indexOf("\n}", at));
  const rgba = new RegExp(`${name}:\\s*rgba\\(([^)]+)\\)`).exec(body);
  if (!rgba) throw new Error(`no token ${name} in the cluster rule`);
  return Number.parseFloat(rgba[1].split(",")[3].trim());
}

/** `--haze-warm` composited over `--background`: what `.haze` already painted. */
const CEILING_HEX = over(
  clusterToken("--haze-warm"),
  clusterToken("--background"),
  clusterAlpha("--haze-warm"),
);
const CEILING = luminance(CEILING_HEX);

describe("the ceiling is the layer the deck replaces", () => {
  it("is computed from globals.css, not transcribed beside it", () => {
    // The constant in deckScene.ts is documentation; THIS is the number, and it
    // comes from the stylesheet. If somebody retunes `--haze-warm` the deck's
    // budget moves with it rather than silently becoming a lie.
    expect(CEILING_HEX).toBe(DECK_HAZE_CEILING_HEX);
    expect(CEILING).toBeCloseTo(0.008183, 6);
  });

  it("the old haze was already the brightest thing on this plane", () => {
    // Sanity on the direction of the whole argument: the ground the deck sits
    // on is much darker than the ceiling, so there IS a budget to sculpt in.
    expect(luminance(clusterToken("--background"))).toBeLessThan(CEILING / 2);
  });
});

// ---------------------------------------------------------------------------
// 1. Every ingredient under the ceiling
// ---------------------------------------------------------------------------

describe("deck palette — nothing brighter than the haze it replaces", () => {
  /**
   * Every colour the deck can put on screen, as [label, composited hex].
   *
   * Anything drawn with alpha is composited here over the BRIGHTEST thing that
   * can be underneath it, which is the worst case: a blend is bounded by its
   * brightest ingredient, so if the worst case clears, every case does.
   */
  const INGREDIENTS: readonly (readonly [string, string])[] = [
    ["sky top (cabin roof)", DECK_SKY_TOP],
    ["sky mid", DECK_SKY_MID],
    ["sky horizon", DECK_SKY_HORIZON],
    ["dusk sun, full strength", DECK_SUN_WARM],
    ["ridge far", DECK_RIDGE_FAR],
    ["ridge near", DECK_RIDGE_NEAR],
    ["verge", DECK_VERGE],
    ["road near", DECK_ROAD_NEAR],
    ["road far", DECK_ROAD_FAR],
    ["the lit centre tick", DECK_LIT],
    // Lane paint over the brightest tarmac it is ever drawn on.
    ["lane paint on road", over(DECK_PAINT, DECK_ROAD_FAR, DECK_PAINT_ALPHA)],
    // The cabin wash's radial decays to nothing well above the horizon band,
    // so its bound is the brightest sky it can REACH — deckScene exports that
    // base rather than letting this test pick a convenient one.
    [
      "cabin overhead wash",
      over(DECK_CABIN_COOL, DECK_CABIN_COOL_BASE, DECK_CABIN_COOL_ALPHA),
    ],
  ];

  it.each(INGREDIENTS)("%s is at or under the ceiling", (_label, hex) => {
    expect(luminance(hex)).toBeLessThanOrEqual(CEILING);
  });

  it("the lit centre tick IS the ceiling, and is the only thing that reaches it", () => {
    // The point of the composition: the brightest pixel a student sees on this
    // plane is now 4 viewBox units wide instead of a third of the screen.
    expect(luminance(DECK_LIT)).toBeCloseTo(CEILING, 9);
    const others = INGREDIENTS.filter(([label]) => label !== "the lit centre tick");
    for (const [label, hex] of others) {
      expect(`${label}:${luminance(hex) < CEILING}`).toBe(`${label}:true`);
    }
  });

  it("lane paint could not be drawn one step brighter", () => {
    // Not a magic number: 0.04 is 105 % of the ceiling. This pins the reason
    // the alpha is 0.035 so a later "it's a bit subtle" nudge fails loudly.
    expect(luminance(over(DECK_PAINT, DECK_ROAD_FAR, 0.04))).toBeGreaterThan(CEILING);
    expect(luminance(over(DECK_PAINT, DECK_ROAD_FAR, DECK_PAINT_ALPHA))).toBeLessThanOrEqual(
      CEILING,
    );
  });

  it("nothing brighter than the tarmac may ever be UNDER the lane paint", () => {
    /**
     * The one that actually broke, found by measuring pixels rather than
     * tokens (tools/clips/headless/deck-contrast.mjs).
     *
     * `DECK_PAINT` is white-ish: far above the ceiling on its own, and legal
     * only as a composite. So the bound above is only true while the thing
     * beneath it is tarmac. The road ramp used to END on `DECK_SKY_HORIZON`
     * so the far road would dissolve into the sky — which put paint on a
     * horizon-bright base and produced 663 pixels at L 0.008242 on a 390 × 844
     * capture, against a ceiling of 0.008183.
     *
     * The fix was ORDER, not opacity: the road stops at tarmac, and the ground
     * haze that does the dissolving is painted AFTER the whole road group, so
     * it lifts the road and the paint together. Both halves are asserted here,
     * because either one alone lets the bug back in.
     */
    const PLATE = readFileSync(resolve(__dirname, "DeckPlate.tsx"), "utf8");
    const roadGradient = PLATE.slice(
      PLATE.indexOf('<linearGradient id="deck-road"'),
      PLATE.indexOf("</linearGradient>", PLATE.indexOf('<linearGradient id="deck-road"')),
    );
    expect(roadGradient).not.toContain("DECK_SKY_HORIZON");
    expect(luminance(DECK_ROAD_FAR)).toBeLessThan(luminance(DECK_SKY_HORIZON));

    // …and the haze goes on top of the paint, not under it.
    expect(PLATE.indexOf('mask="url(#deck-road-mask)"')).toBeLessThan(
      PLATE.indexOf('fill="url(#deck-ground-haze)"'),
    );
  });

  it("the paint fades by screen height, not per polygon", () => {
    /**
     * With SVG's default `objectBoundingBox` units the ramp is relative to each
     * shape's own box — so every dash, near or 100 m away, was painted with an
     * identical strong-to-weak ramp and the far run came out as bright as the
     * near one. That is the opposite of perspective, and it is how paint ended
     * up in the haze band at all.
     */
    const PLATE = readFileSync(resolve(__dirname, "DeckPlate.tsx"), "utf8");
    const paintGradient = PLATE.slice(
      PLATE.indexOf('id="deck-paint"'),
      PLATE.indexOf("</linearGradient>", PLATE.indexOf('id="deck-paint"')),
    );
    expect(paintGradient).toContain('gradientUnits="userSpaceOnUse"');
  });

  it("the graduations are cut DARK, so the tape costs no light at all", () => {
    // The graticule is drawn in DECK_SKY_TOP over the horizon band — i.e. it is
    // subtractive. An accent-blue tick would be the obvious alternative and it
    // is not affordable: even --accent at 3 % over the horizon is 108 % of the
    // ceiling. This is why the design is etched rather than lit.
    expect(luminance(DECK_SKY_TOP)).toBeLessThan(luminance(DECK_SKY_HORIZON));
    expect(
      luminance(over(clusterToken("--accent"), DECK_SKY_HORIZON, 0.03)),
    ).toBeGreaterThan(CEILING);
  });
});

describe("the inks that read over the deck", () => {
  /**
   * The consequence, stated the way a reviewer would ask for it: text over the
   * BRIGHTEST point of the deck is at least as legible as text over the
   * brightest point of the layer it replaced. It is the same number, because
   * the brightest point is the same colour by construction.
   */
  const INKS = ["--foreground", "--muted", "--accent", "--control-edge"] as const;

  it.each(INKS)("%s over the deck's brightest pixel is unchanged", (ink) => {
    const onDeck = ratio(clusterToken(ink), DECK_LIT);
    const onOldHaze = ratio(clusterToken(ink), CEILING_HEX);
    expect(onDeck).toBeCloseTo(onOldHaze, 10);
  });

  it("body ink still clears AA over the deck's brightest pixel", () => {
    expect(ratio(clusterToken("--muted"), DECK_LIT)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(clusterToken("--foreground"), DECK_LIT)).toBeGreaterThanOrEqual(4.5);
  });

  it("a control edge over the deck still clears 1.4.11", () => {
    expect(ratio(clusterToken("--control-edge"), DECK_LIT)).toBeGreaterThanOrEqual(3);
  });
});

describe("no escape hatch from the blend argument", () => {
  const DECK_CSS = (() => {
    const at = CSS.indexOf("  .deck {");
    return CSS.slice(at, CSS.indexOf("@keyframes deck-drift", at));
  })();
  const PLATE = readFileSync(resolve(__dirname, "DeckPlate.tsx"), "utf8");

  it("the deck's CSS uses no blend mode and no filter", () => {
    // The ceiling proof holds because every layer is a plain alpha blend.
    // `mix-blend-mode: screen` or a `filter: brightness()` would break it
    // silently — the palette would still pass and the pixels would not.
    expect(DECK_CSS).not.toMatch(/mix-blend-mode/);
    expect(DECK_CSS).not.toMatch(/backdrop-filter/);
    expect(DECK_CSS).not.toMatch(/\bfilter\s*:/);
  });

  it("the drawn plate uses no blend mode and no filter either", () => {
    expect(PLATE).not.toMatch(/mix-blend-mode/);
    expect(PLATE).not.toMatch(/style={{[^}]*filter/);
    expect(PLATE).not.toMatch(/<feBlend|<feComposite|<filter/);
  });

  it("the cabin layer only ever darkens", () => {
    // Every stop in `.deck-cabin` is black at some alpha. That is what lets the
    // vignette be exempt from the ceiling argument entirely.
    const cabin = CSS.slice(CSS.indexOf("  .deck-cabin {"), CSS.indexOf("  .deck-drift {"));
    const colours = cabin.match(/rgba?\([^)]*\)/g) ?? [];
    expect(colours.length).toBeGreaterThan(0);
    for (const c of colours) {
      expect(c).toMatch(/rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. It is the landing page's road
// ---------------------------------------------------------------------------

describe("the deck is the hero's world, from a different seat", () => {
  it("the crest is the hero plate's crest, re-aimed and not re-drawn", () => {
    expect(DECK_RIDGE_POINTS).toHaveLength(PLATE_RIDGE_POINTS.length);
    for (const [i, plate] of PLATE_RIDGE_POINTS.entries()) {
      const [x, y] = reprojectPlatePoint(HERO_PLATE_CAMERA, DECK_CAMERA, plate);
      expect(DECK_RIDGE_POINTS[i][0]).toBeCloseTo(x, 1);
      expect(DECK_RIDGE_POINTS[i][1]).toBeCloseTo(y, 1);
    }
  });

  it("reprojection preserves the angle, which is what makes it the same mountain", () => {
    // The summit sits 7.18° above the horizon in the hero plate. It must sit
    // at 7.18° here too — a taller or shorter Vitosha is a different place.
    const summit = PLATE_RIDGE_POINTS.reduce((a, b) => (b[1] < a[1] ? b : a));
    const elevationDeg =
      (Math.atan((HERO_PLATE_CAMERA.horizonY - summit[1]) / HERO_PLATE_CAMERA.focalPx) * 180) /
      Math.PI;
    const [, deckY] = reprojectPlatePoint(HERO_PLATE_CAMERA, DECK_CAMERA, summit);
    expect(deckY).toBeCloseTo(elevationYOnPlate(DECK_CAMERA, elevationDeg), 6);
    expect(elevationDeg).toBeCloseTo(7.18, 2);
  });

  it("the seat is a driver's, not the hero's chase camera", () => {
    // The one number that turns "a picture of a car" into "the view from inside
    // it". If this creeps back up toward 1.6 the perspective goes soft and the
    // backdrop stops reading as a windscreen.
    expect(DECK_CAMERA.eyeHeightM).toBeLessThan(HERO_PLATE_CAMERA.eyeHeightM);
    expect(DECK_CAMERA.eyeHeightM).toBeCloseTo(1.15, 2);
  });

  it("the road reaches the bottom of the frame, so it has no visible start", () => {
    // If the near end of the tarmac landed inside the frame the deck would read
    // as a picture pasted onto the page rather than as a space the page is in.
    const [, yNear] = projectOnPlate(DECK_CAMERA, 0, 0, 2.1);
    expect(yNear).toBeGreaterThanOrEqual(DECK_VIEWBOX_H);
  });

  it("the horizon leaves the top of the frame to the darkest sky", () => {
    // The topbar and every page heading live in the upper third; that is why
    // the horizon is over half way down and the sky ramp holds its darkest
    // value for the first 45 % of the drop.
    expect(DECK_CAMERA.horizonY / DECK_VIEWBOX_H).toBeGreaterThan(0.5);
    expect(DECK_CAMERA.horizonY / DECK_VIEWBOX_H).toBeLessThan(0.62);
  });
});

describe("the horizon graticule", () => {
  const ticks = deckTicks();

  it("is graduated by angle, so it bunches toward the edges like real glass", () => {
    // The property that separates an instrument from a dotted line: equal
    // ANGLES are unequal pixels under perspective. Gaps must shrink outward.
    const centre = ticks.findIndex((t) => Math.abs(t.x - DECK_CAMERA.vanishingX) < 0.05);
    expect(centre).toBeGreaterThan(0);
    const gapNearCentre = ticks[centre + 1].x - ticks[centre].x;
    const gapAtEdge = ticks[ticks.length - 1].x - ticks[ticks.length - 2].x;
    expect(gapAtEdge).toBeGreaterThan(gapNearCentre * 1.5);
  });

  it("has a mark dead ahead and majors every 10°", () => {
    expect(ticks.some((t) => t.major && Math.abs(t.x - DECK_CAMERA.vanishingX) < 0.05)).toBe(
      true,
    );
    const majors = ticks.filter((t) => t.major);
    expect(majors).toHaveLength(9); // -40 … +40
    expect(majors[0].x).toBeCloseTo(azimuthXOnPlate(DECK_CAMERA, -40), 1);
  });

  it("spans the whole visible field", () => {
    expect(ticks[0].x).toBeLessThan(0);
    expect(ticks[ticks.length - 1].x).toBeGreaterThan(DECK_VIEWBOX_W);
    // The frame's own half-angle is atan(800 / 1150) = 34.8°, so a tape that
    // stopped short of that would visibly END inside the picture.
    expect(DECK_TICK_AZIMUTH_LIMIT_DEG).toBeGreaterThan(34.8);
  });
});

describe("the drawn road", () => {
  const dashes = deckDashes();

  it("converges rather than stopping", () => {
    // The dash run has to reach sub-unit slivers, which is what reads as a road
    // going away rather than as six rectangles.
    expect(dashes.length).toBeGreaterThanOrEqual(9);
    const last = dashes[dashes.length - 1];
    expect(last.yNear - last.yFar).toBeLessThan(1);
    expect(last.yNear).toBeGreaterThan(DECK_CAMERA.horizonY);
  });

  it("every dash tapers — the width is projected, never stroked", () => {
    for (const d of dashes) {
      expect(d.halfNear).toBeGreaterThan(d.halfFar);
      expect(d.yNear).toBeGreaterThan(d.yFar);
    }
  });

  it("the plate is inline HTML, so it must stay small", () => {
    // It is serialised twice (HTML + the RSC flight payload) on every
    // authenticated navigation. ~30 dashes and ~33 ticks is the budget.
    expect(dashes.length + deckTicks().length).toBeLessThan(80);
    expect(DECK_VIEWBOX_W / DECK_VIEWBOX_H).toBeCloseTo(1.6, 2);
  });
});
