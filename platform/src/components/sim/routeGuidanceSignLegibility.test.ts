/**
 * SWEEP 161 — THE MARKER'S SIGN MAY NOT BE A VEIL.
 *
 * Four frames, three lessons, one sentence from the reviewer: the world label
 * is *„an enormous mid-grey ghost pasted flat on a beige building facade at
 * almost the same value as the wall."*
 *
 *   `sc-ln-obstacle-meeting/mobile-right/04-t074s.png` — car STOPPED on the
 *     wait mark (the dash in the same frame reads 0 км/ч), «Спри тук / спри —
 *     под 6 км/ч» washed into the facade with the «РАЗБРАХ» pill across it.
 *   `…/04-t090s.png` — the same chip smeared over the block on the left, filed
 *     by the sweep as „renders THROUGH buildings". It does not: in
 *     `04-t080s.png` the street trees occlude the same panel, and in
 *     `sc-maneuver-3point/pc-right/03-ready.png` the world's own В14 «40»
 *     stands crisply IN FRONT of it. What the sweep saw was a 5 m billboard at
 *     a fifth of an alpha in front of a distant wall.
 *   `sc-follow-cutin/mobile-right/04-t157s.png` — «Карай дотук / не по-бързо от
 *     39 км/ч» dissolving into a facade under the teach card.
 *   `sc-park-gap-long/mobile-right/07-end.png` — «Паркирай тук» split by the
 *     «РАЗБРАХ» pill and dimmed behind its fill.
 *
 * THE CAUSE IS ONE LINE OF ARITHMETIC. `markerSignOpacity` is a function of
 * DISTANCE alone and its near ramp spends 19 m (30 → 11 m) taking the panel
 * from full to nothing. A car crawling through that band — or STOPPED in it,
 * which is exactly what a halt gate asks for — parks a half-transparent
 * 5 × 1.67 m billboard across the windscreen for as long as it stands there.
 *
 * This file is the fence, and it is written in the unit the complaint is in:
 * CONTRAST at the eye. It derives the floor from the component's own exported
 * ink rather than restating a number, so a future re-skin re-derives it and
 * reds if the shipped floor stops holding.
 *
 * It also fences the opposite crime. „Hide the sign" would pass a legibility
 * test trivially and would be the same defect pointing the other way, so the
 * band that survives is asserted to be longer than the road the student needs
 * to act on the cap it carries — the same ≥3 s at the posted 50 km/h that
 * `scene/guidance-marker-sign.test.ts` already demands of the authored band.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ARROW_OPACITY,
  LABEL_CAP_PX,
  MIN_LEGIBLE_CAP_CSS_PX,
  MIN_LEGIBLE_SIGN_ALPHA,
  SIGN_CAP_RGB,
  SIGN_PLATE_ALPHA,
  SIGN_PLATE_RGB,
  SIGN_TITLE_RGB,
  capLineCssPxAt,
  signPanelAlpha,
} from "./RouteGuidance";
import {
  MARKER_SIGN_FAR_END_M,
  MARKER_SIGN_MAX_OPACITY,
  MARKER_SIGN_NEAR_END_M,
  markerSignOpacity,
} from "@/modules/sim/scene/guidanceRoute";
import { cockpitVFovForAspect } from "@/modules/sim/vehicle/tuning";

/** The component's own source — the size gate and the chevron's blend mode are
 *  both single declarations no jsdom render can reach (there is no WebGL and no
 *  2D canvas here), so they are read the way the plate's fill already is. */
const src2 = readFileSync(path.resolve(__dirname, "./RouteGuidance.tsx"), "utf8");

type RGB = readonly [number, number, number];

/**
 * The three backdrops the frames above catch the chip dissolving into. They are
 * measurements, not taste: a sunlit window reveal, the hazy sky the parking
 * marker stands against, and the beige facade of the sweep's own sentence.
 */
const BACKDROPS: ReadonlyArray<readonly [string, RGB]> = [
  ["lit window", [235, 220, 195]],
  ["hazy sky", [190, 200, 210]],
  ["beige facade", [200, 190, 175]],
];

/** WCAG 2.1 relative luminance. */
function luminance([r, g, b]: RGB): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return [
    alpha * fg[0] + (1 - alpha) * bg[0],
    alpha * fg[1] + (1 - alpha) * bg[1],
    alpha * fg[2] + (1 - alpha) * bg[2],
  ];
}

/**
 * What the eye sees when the panel is drawn at `alpha`: the plate carries the
 * canvas's own alpha as well as the material's, the glyphs are opaque on the
 * canvas so they carry only the material's. The worst of the three backdrops
 * and of the two text lines is the one that governs.
 */
function worstTextContrast(alpha: number, plateAlpha: number, title: RGB, cap: RGB): number {
  let worst = Infinity;
  for (const [, bg] of BACKDROPS) {
    const plate = over(SIGN_PLATE_RGB, alpha * plateAlpha, bg);
    worst = Math.min(worst, contrast(over(title, alpha, bg), plate));
    worst = Math.min(worst, contrast(over(cap, alpha, bg), plate));
  }
  return worst;
}

/** WCAG AA for large text — the size class both lines of this panel are in. */
const READABLE = 3;

/** What shipped when the sweep photographed it. */
const SHIPPED_PLATE_ALPHA = 0.72;
const SHIPPED_CAP_RGB: RGB = [159, 232, 220];

describe("the chip is a sign or it is absent, never a veil", () => {
  it("carries its own text at every alpha it is ever drawn at", () => {
    // THE FENCE. Half-metre steps from the mark out past the far end: wherever
    // the component draws anything, the worst line on the worst backdrop must
    // still be readable. On the shipped file this reds within a metre of
    // 11 m — the pose `04-t074s.png` catches, with the car stationary.
    for (let d = 0; d <= 200; d += 0.5) {
      const alpha = signPanelAlpha(d);
      if (alpha <= 0) continue;
      const ratio = worstTextContrast(alpha, SIGN_PLATE_ALPHA, SIGN_TITLE_RGB, SIGN_CAP_RGB);
      expect(ratio, `${d} m (alpha ${alpha.toFixed(3)})`).toBeGreaterThanOrEqual(READABLE);
    }
  });

  it("the floor is where the ink puts it, not where taste puts it", () => {
    // Derived, then compared: the smallest alpha at which THIS ink clears 3:1.
    // 0.47 with the plate at 0.96 and the cap lifted to #bef5e9; it was 0.66
    // with the shipped 0.72 plate and #9fe8dc, which is why the fade band was
    // a veil over 44 % of its own length.
    const smallestLegible = (plateAlpha: number, cap: RGB) => {
      for (let a = 0.01; a <= 1.0001; a += 0.01) {
        if (worstTextContrast(a, plateAlpha, SIGN_TITLE_RGB, cap) >= READABLE) return a;
      }
      return Number.POSITIVE_INFINITY;
    };
    const now = smallestLegible(SIGN_PLATE_ALPHA, SIGN_CAP_RGB);
    const shipped = smallestLegible(SHIPPED_PLATE_ALPHA, SHIPPED_CAP_RGB);

    expect(now).toBeLessThanOrEqual(MIN_LEGIBLE_SIGN_ALPHA + 1e-9);
    // The plate change has to be worth something on its own — a floor bolted
    // onto unchanged ink would just delete more of the band.
    expect(shipped - now).toBeGreaterThan(0.1);
  });

  it("names the metres of veil the shipped chip drew, and no longer draws", () => {
    // The defect, measured as road. Every half metre where the SHIPPED chip was
    // drawn (raw band, shipped ink) but could not be read.
    let veilM = 0;
    let drawnM = 0;
    for (let d = 0; d <= 200; d += 0.5) {
      const raw = markerSignOpacity(d);
      if (raw <= 0) continue;
      drawnM += 0.5;
      if (worstTextContrast(raw, SHIPPED_PLATE_ALPHA, SIGN_TITLE_RGB, SHIPPED_CAP_RGB) < READABLE) {
        veilM += 0.5;
      }
    }
    // 70.5, not 71: the ramps hit exactly 0 at 11 m and 82 m, so the sampler
    // counts the open interval between them.
    expect(drawnM).toBeCloseTo(70.5, 6);
    expect(veilM).toBeGreaterThan(30);
    expect(veilM / drawnM).toBeGreaterThan(0.4);

    // …and none of it survives: the same sweep over what is drawn TODAY.
    let veilNowM = 0;
    for (let d = 0; d <= 200; d += 0.5) {
      const alpha = signPanelAlpha(d);
      if (alpha <= 0) continue;
      if (worstTextContrast(alpha, SIGN_PLATE_ALPHA, SIGN_TITLE_RGB, SIGN_CAP_RGB) < READABLE) {
        veilNowM += 0.5;
      }
    }
    expect(veilNowM).toBe(0);
  });
});

describe("…and the other direction: the floor may not eat the lesson", () => {
  it("still gives the student ≥3 s of road at the posted limit to act on the cap", () => {
    // The crime this guards is „fix the ghost by never drawing the sign". The
    // chip carries a graded number («не по-бързо от 35 км/ч»), so the band it
    // is legible in has to be long enough to obey — the same criterion
    // scene/guidance-marker-sign.test.ts holds the AUTHORED band to, now held
    // against what is actually rendered.
    let first = Number.POSITIVE_INFINITY;
    let last = 0;
    for (let d = 0; d <= 200; d += 0.5) {
      if (signPanelAlpha(d) > 0) {
        first = Math.min(first, d);
        last = Math.max(last, d);
      }
    }
    expect(last - first).toBeGreaterThanOrEqual(3 * (50 / 3.6));
  });

  it("never draws the panel brighter than its authored band allows", () => {
    // A legibility gate may only take alpha away. Clamping it UP would be the
    // 2026-08-14 defect — „a dark rectangle parked on the vanishing point" —
    // reintroduced by the fix for its opposite.
    for (let d = 0; d <= 200; d += 0.25) {
      expect(signPanelAlpha(d), `${d} m`).toBeLessThanOrEqual(markerSignOpacity(d) + 1e-9);
      expect(signPanelAlpha(d), `${d} m`).toBeLessThanOrEqual(MARKER_SIGN_MAX_OPACITY + 1e-9);
    }
  });

  it("keeps the authored band's own endpoints: gone at the mark, gone in the far field", () => {
    expect(signPanelAlpha(0)).toBe(0);
    expect(signPanelAlpha(MARKER_SIGN_NEAR_END_M)).toBe(0);
    expect(signPanelAlpha(MARKER_SIGN_FAR_END_M)).toBe(0);
    expect(signPanelAlpha(200)).toBe(0);
    // And it is at FULL strength in the middle of the band — the floor moves
    // the edges of the window, never its centre.
    expect(signPanelAlpha(45)).toBeCloseTo(MARKER_SIGN_MAX_OPACITY, 6);
  });

  it("the pose that produced the frames is the pose it now refuses to draw", () => {
    // `04-t074s.png`: the car stationary on a halt mark, the sign a lane's half
    // width to the side and a few metres ahead. Anywhere inside the old near
    // ramp the panel is now absent instead of hanging there for as long as the
    // student stands still.
    expect(signPanelAlpha(12)).toBe(0);
    expect(signPanelAlpha(20)).toBe(0);
    // 16.6 m is not a round number: it is `07-end.png` SOLVED. Clean sky beside
    // the panel (153,161,170) against sky through it (124,132,140), with the
    // plate's own (6,18,22), gives an effective plate alpha of 0.20 on all
    // three channels ⇒ material alpha 0.28 ⇒ 16.6 m on the authored ramp. The
    // panel was 590 px wide there — 23 % of the frame — at ~1.5:1 text
    // contrast, with the «РАЗБРАХ» pill splitting «Паркирай тук» on top of it.
    expect(signPanelAlpha(16.6)).toBe(0);
    expect(markerSignOpacity(16.6)).toBeCloseTo(0.28, 2);
    // The metre it comes back at is the first legible one, not an arbitrary
    // setback: it clears 3:1 the moment it appears.
    const firstDrawn = Array.from({ length: 401 }, (_, i) => i * 0.5).find(
      (d) => signPanelAlpha(d) > 0,
    );
    expect(firstDrawn).toBeDefined();
    expect(
      worstTextContrast(signPanelAlpha(firstDrawn!), SIGN_PLATE_ALPHA, SIGN_TITLE_RGB, SIGN_CAP_RGB),
    ).toBeGreaterThanOrEqual(READABLE);
  });
});

describe("the canvas actually paints what the floor was computed from", () => {
  // The constants can all be right while `makeLabelTexture` still fills the old
  // 0.72 plate and draws bare glyphs — which is the exact state the sweep
  // photographed. There is no canvas in this environment (jsdom's getContext
  // returns null and the texture builder bails), so the honest guard is the
  // same one guidance-marker-sign.test.ts uses for the post: read the wiring.
  const src = readFileSync(path.resolve(__dirname, "./RouteGuidance.tsx"), "utf8");

  it("fills the plate from SIGN_PLATE_ALPHA, not from a literal", () => {
    expect(src).toMatch(/fillStyle = `rgba\(\$\{pr\}, \$\{pg\}, \$\{pb\}, \$\{SIGN_PLATE_ALPHA\}\)`/);
    expect(src).not.toContain("rgba(6, 18, 22, 0.72)");
  });

  it("haloes BOTH lines — the plate is not the only ground the glyphs get", () => {
    const strokes = src.match(/ctx\.strokeText\(/g) ?? [];
    expect(strokes.length).toBe(2);
    expect(src).toContain('const halo = "rgba(2, 10, 12, 0.9)"');
  });

  it("gates the panel on signPanelAlpha and takes the post with it", () => {
    expect(src).toContain("const alpha = signPanelAlpha(eyeDistM);");
    expect(src).toContain("sign.visible = alpha > 0;");
    expect(src).toContain("postMatRef.current.opacity = alpha * 0.85");
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   …AND CONTRAST IS NOT SIZE. THE FENCE ABOVE PASSED WHILE THE GRADED NUMBER
   WAS THREE PIXELS TALL.

   Sweep 161 filed the same object twice more, and neither finding is about ink:

     `sc-park-night/mobile-right/04-t034s.png` — «the «Спри тук» chip carries a
       second line stating the speed condition, and it renders at roughly six
       pixels tall — an unreadable grey smear under the title. The condition it
       hides («под 6 км/ч») is the exact tolerance the first graded task
       measures.»
     `sc-ln-obstacle-meeting/mobile-right/04-t080s.png` — «the world label
       «Карай дотук» clips its own unit: the second line reads «не по-бързо от
       35 км» with the «/ч» cut off.»

   The second is the first wearing a hat: `fillText`'s `maxWidth` condenses and
   never cuts, so nothing was clipped — the trailing glyphs of a line below the
   resolution of the screen are simply the ones that vanish first.

   This block is the SIZE fence, in the same shape as the alpha one: derived from
   the component's own exported type sizes and from the audit's own primary
   device, so a font change re-derives it instead of restating a number. It also
   fences the same opposite crime — „solve it by never printing the number" —
   because the number is a graded contract and a gate that hides it is the false
   certificate pointing the other way.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * The audit's own primary profile, `tools/mobile/lib/devices.mjs`
 * `iphone16-landscape`: 852 × 393 CSS px at DPR 3 — which is the 2556 × 1179 of
 * every `mobile-*` frame in the sweep. CSS px, not device px, because the rest
 * of this product's type is authored in CSS px and because a canvas rendering
 * below the window's DPR only ever makes this line smaller.
 */
const AUDIT_CSS_H = 393;
const AUDIT_CSS_W = 852;
/** The live cockpit vFOV at that aspect — hFOV-locked, so it is derived and not
 *  a fourth instrument measuring the wrong phone. ≈ 39.26°. */
const AUDIT_VFOV_DEG = cockpitVFovForAspect(AUDIT_CSS_W / AUDIT_CSS_H);

/** What the canvas actually drew when the sweep photographed those two frames. */
const SHIPPED_CAP_PX = 36;

/** The band the panel is drawn in at all, from the alpha fence above. */
function drawnBand(): { first: number; last: number } {
  let first = Number.POSITIVE_INFINITY;
  let last = 0;
  for (let d = 0; d <= 200; d += 0.02) {
    if (signPanelAlpha(d) > 0) {
      first = Math.min(first, d);
      last = Math.max(last, d);
    }
  }
  return { first, last };
}

/** Metres of the drawn band over which a cap line of `capPx` clears the floor. */
function legibleCapMetres(capPx: number): number {
  const scale = capPx / LABEL_CAP_PX;
  let m = 0;
  for (let d = 0; d <= 200; d += 0.02) {
    if (signPanelAlpha(d) <= 0) continue;
    if (capLineCssPxAt(d, AUDIT_CSS_H, AUDIT_VFOV_DEG) * scale >= MIN_LEGIBLE_CAP_CSS_PX) m += 0.02;
  }
  return m;
}

describe("the graded number is legible where it is printed, or it is not printed", () => {
  it("THE FRAME, AS ARITHMETIC: the shipped 36 px was 3 CSS px at the far end of its own band", () => {
    const { first, last } = drawnBand();
    // The alpha fence's own window, to the centimetre: 21.0 → 68.3 m.
    expect(first).toBeCloseTo(21.0, 1);
    expect(last).toBeCloseTo(68.3, 1);

    const atShipped = (d: number) =>
      capLineCssPxAt(d, AUDIT_CSS_H, AUDIT_VFOV_DEG) * (SHIPPED_CAP_PX / LABEL_CAP_PX);
    // The three readings in the LABEL_CAP_PX block, reproduced from the shipped
    // numbers rather than quoted: an em box of 3.0 / 4.6 / 9.9 CSS px.
    expect(atShipped(last)).toBeCloseTo(3.0, 1);
    expect(atShipped(45)).toBeCloseTo(4.6, 1);
    expect(atShipped(first)).toBeCloseTo(9.9, 1);

    // …and the alpha fence was green on every one of them. That is the whole
    // reason this block exists: an instrument that measures contrast cannot see
    // a number printed at three pixels.
    for (const d of [last, 45, first]) expect(signPanelAlpha(d)).toBeGreaterThan(0);
  });

  it("the floor is the smallest type this product ships, not a number from a paper", () => {
    // `text-[9px]` is the briefing card's own fold counter — the smallest thing
    // the HUD asks a student to read. A number the engine GRADES may not be
    // printed smaller than the chrome that counts hidden list rows.
    // And the swap has to be worth something ON ITS OWN, or it is decoration:
    // 36 → 48 px more than quadruples the road over which the number can be
    // read (2.0 m → 9.7 m of the same 47 m band).
    const shipped = legibleCapMetres(SHIPPED_CAP_PX);
    const now = legibleCapMetres(LABEL_CAP_PX);
    expect(shipped).toBeCloseTo(2.0, 1);
    expect(now).toBeCloseTo(9.7, 1);
    expect(now / shipped).toBeGreaterThan(4);

    // ── AND THE FLOOR IS TIED TO THE TWO FRAMES, NOT TO A PREFERENCE ────────
    // The cheap way to make this whole block green is to drop the floor until
    // the shipped size passes, which would change nothing on the glass. So: at
    // the far end of the band — the pose `04-t034s` and `04-t080s` both catch
    // the chip in — the number has to be REFUSED at the new size too, and the
    // shipped size has to be refused over essentially the whole band.
    const { first, last } = drawnBand();
    expect(capLineCssPxAt(last, AUDIT_CSS_H, AUDIT_VFOV_DEG)).toBeLessThan(
      MIN_LEGIBLE_CAP_CSS_PX,
    );
    expect(shipped / (last - first)).toBeLessThan(0.05);

    // Last, and only after the two above have done the work: the floor IS the
    // `text-[9px]` the HUD's own fold counter is set in.
    expect(MIN_LEGIBLE_CAP_CSS_PX).toBe(9);
  });

  it("…and the OTHER direction: the chip still says WHERE over the whole band", () => {
    // The crime here is „gate the cap line, and while you are at it stop drawing
    // the sign". The sign's own band may not move — the alpha suite holds it to
    // ≥3 s of road at the posted 50 km/h, and this asserts the gate did not
    // quietly spend that. The TITLE is unconditional: outside the size floor the
    // chip is a title-only plate, never an empty one.
    const { first, last } = drawnBand();
    expect(last - first).toBeGreaterThanOrEqual(3 * (50 / 3.6));
    // The title-only plate is built from the same function with the cap
    // suppressed, so „drawn without the number" cannot silently become „not
    // drawn": `withCap` is the ONLY thing that changes.
    expect(src2).toContain("const cap = withCap ? capLineBg(goal, postedKmh) : \"\";");
    expect(src2).toContain("makeLabelTexture(pointGoal, postedAtGoal, false)");
  });

  it("the gate reads the LIVE window, not a device profile", () => {
    // Four probes in this project have been fooled by a baked-in device. The
    // cockpit vFOV is hFOV-locked (`cockpitVFovForAspect`), so it changes with
    // the window shape; a constant here would be the fifth.
    expect(src2).toContain("capLineCssPxAt(eyeDistM, state.size.height, cam.fov ?? 0)");
    expect(src2).toContain("capPx >= MIN_LEGIBLE_CAP_CSS_PX ? labelTexture : labelTextureNoCap");
    // A camera with no `fov` (the top-down orthographic view) must resolve to
    // „not legible" rather than to NaN — 0 is below any floor.
    expect(capLineCssPxAt(30, AUDIT_CSS_H, 0)).toBe(0);
    expect(capLineCssPxAt(0, AUDIT_CSS_H, AUDIT_VFOV_DEG)).toBe(0);
    expect(capLineCssPxAt(30, 0, AUDIT_VFOV_DEG)).toBe(0);
    // Monotone in distance, or the swap would chatter at the boundary.
    for (let d = 5; d < 100; d += 1) {
      expect(capLineCssPxAt(d + 1, AUDIT_CSS_H, AUDIT_VFOV_DEG)).toBeLessThan(
        capLineCssPxAt(d, AUDIT_CSS_H, AUDIT_VFOV_DEG),
      );
    }
  });

  it("the swap costs no per-frame allocation — both plates are built per objective", () => {
    // The module's whole perf contract. A texture built inside `useFrame` would
    // be a new canvas every tick on the surface that is up for the entire drive.
    const frameBody = src2.slice(src2.indexOf("useFrame((state) => {"));
    expect(frameBody).not.toContain("makeLabelTexture(");
    expect(frameBody).not.toContain("document.createElement");
  });
});

describe("the turn chevron is the route's colour, not white", () => {
  /**
   * MEASURED, `sc-junction-blind/mobile-right/04-t065s.png`, raw pixels: the
   * chevron is rgb(255,255,255) at 815,308 / 830,290 / 800,320 and the sky
   * 270 px to its right is rgb(156,163,170). The same white blob stands beside
   * the marker shaft on `sc-jx-equal-left/mobile-right/04-t039s.png`.
   */
  const MEASURED_SKY: RGB = [156, 163, 170];
  /** The authored `--accent-2` (globals.css) — the ribbon's own colour. Used as
   *  the source here, which is the CONSERVATIVE choice: the tone map only ever
   *  lowers what the fragment emits, so the real accumulation clips sooner. */
  const ACCENT_2: RGB = [23, 225, 196];

  /** `n` additive layers of `src` at `alpha` over `bg`, in the 8-bit output
   *  space the blend stage actually works in. The extrusion is `DoubleSide`, so
   *  a view ray crosses at least the front and back caps. */
  function additive(src: RGB, alpha: number, bg: RGB, n: number): RGB {
    return [0, 1, 2].map((i) => Math.min(255, bg[i]! + n * alpha * src[i]!)) as unknown as RGB;
  }
  function normal(src: RGB, alpha: number, bg: RGB, n: number): RGB {
    let out: RGB = bg;
    for (let k = 0; k < n; k += 1) {
      out = [0, 1, 2].map((i) => alpha * src[i]! + (1 - alpha) * out[i]!) as unknown as RGB;
    }
    return out;
  }
  const spread = (c: RGB) => Math.max(...c) - Math.min(...c);
  const clipped = (c: RGB) => c.filter((v) => v >= 254.5).length;

  it("additive loses the hue, and loses MORE of it the more geometry there is", () => {
    for (const [, bg] of [...BACKDROPS, ["measured sky", MEASURED_SKY] as const]) {
      // One layer already blows two channels; by the sixth the arrow IS white,
      // which is the word both findings used.
      expect(clipped(additive(ACCENT_2, ARROW_OPACITY, bg, 1))).toBeGreaterThanOrEqual(2);
      expect(clipped(additive(ACCENT_2, ARROW_OPACITY, bg, 6))).toBe(3);
      expect(spread(additive(ACCENT_2, ARROW_OPACITY, bg, 6))).toBe(0);
      // Monotone toward white: every extra layer takes chroma away.
      expect(spread(additive(ACCENT_2, ARROW_OPACITY, bg, 4))).toBeLessThan(
        spread(additive(ACCENT_2, ARROW_OPACITY, bg, 1)),
      );
    }
  });

  it("normal blending cannot clip and cannot drift off the accent, at any layer count", () => {
    for (const [, bg] of [...BACKDROPS, ["measured sky", MEASURED_SKY] as const]) {
      for (const n of [1, 2, 4, 6]) {
        const c = normal(ACCENT_2, ARROW_OPACITY, bg, n);
        expect(clipped(c)).toBe(0);
        // Still unmistakably teal — the ribbon's own chroma, not a white blob.
        expect(spread(c)).toBeGreaterThan(150);
      }
      // …and it CONVERGES on the accent instead of running away from it, which
      // is the property that makes the arrow readable as „the same route".
      const far = normal(ACCENT_2, ARROW_OPACITY, bg, 6);
      for (const i of [0, 1, 2]) expect(Math.abs(far[i]! - ACCENT_2[i]!)).toBeLessThan(2);
    }
  });

  it("THE WIRING: the shipped arrow declares NormalBlending at ARROW_OPACITY", () => {
    const arrow = src2.slice(src2.indexOf("<mesh ref={arrowRef}"));
    const material = arrow.slice(0, arrow.indexOf("</mesh>"));
    expect(material).toContain("blending={THREE.NormalBlending}");
    expect(material).not.toContain("AdditiveBlending");
    expect(material).toContain("opacity={ARROW_OPACITY}");
    expect(material).toContain("color={accent}");
  });
});
