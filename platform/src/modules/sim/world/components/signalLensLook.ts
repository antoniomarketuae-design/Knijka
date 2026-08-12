/**
 * WHAT A LIT LENS LOOKS LIKE, AND WHAT AN UNLIT ONE LOOKS LIKE — doc 87 B35.
 *
 * These four numbers are the whole optical contract of a signal head, and they
 * live in their own file because the last time they moved, nothing in the build
 * could see it. Doc 86 L2 lifted the unlit lens out of near-black to fix „no
 * traffic light exists"; the lift went too far, and «Загаснал светофар» shipped
 * for weeks with a caption reading ЗАГАСНАЛ over three lamps a student would
 * call lit. A type check cannot catch a colour. Arithmetic can, so
 * `__tests__/signal-lens-look.test.ts` runs it on every push.
 *
 * WHAT WAS ACTUALLY WRONG, measured before anything was changed. On the frame
 * the row was refused on (sc-signal-dead, the captioned head at 24.7 m,
 * `RR/b35/b35-y-50.png`) the three „unlit" lenses sampled at rgb(138,17,7),
 * rgb(133,87,0) and rgb(21,107,37): HSV saturation 0.948 / 1.000 / 0.801, and
 * relative luminance 0.058 / 0.118 / 0.108 against a housing at 0.066. Two of
 * the three dead lenses were BRIGHTER than the housing they were set in, and
 * all three were pure hues. Nothing in the physical world is a pure hue except
 * a light source. That — not the choice of red — is what „lit" looks like.
 *
 * THE TWO PROPERTIES THE TEST PINS, in the same order they failed:
 *
 *   SATURATION. An unlit lens is dark tinted GLASS: a desaturated body colour
 *   with the hue only just readable. A lit lens is a pure emitter. The two sets
 *   below sit either side of a wide gap (unlit ≤ 0.45, lit ≥ 0.75) with nothing
 *   in between, so „nudging the unlit lens up a bit" cannot creep across it.
 *
 *   LUMINANCE. Every unlit tint is ≤ 15 % of its own lit colour's luminance as
 *   authored (measured 0.094 / 0.062 / 0.076). On the rendered frames after
 *   the fix, on ONE head in ONE frame of the live drill (sc-signal-redyellow
 *   at the stop line): lit amber rgb(220,175,93) L=0.467 beside its own unlit
 *   red L=0.026 and unlit green L=0.028 — an 18:1 read; lit green L=0.441
 *   beside unlit red L=0.026, 17:1. On the dead head at 24.7 m the three
 *   lenses sample L 0.010–0.017 at saturation 0.21–0.40 (two runs of the same
 *   pose; the scene's sun moves between runs, so a range, not a point).
 *
 * AND WHY THE UNLIT LENS IS NOT SIMPLY BLACK. A black lens is a hole, and a
 * head with three holes is the doc 86 L2 defect coming back. The glass tints
 * are LIGHTER than the lamp box they are set into (`buildPedSignalHousing`
 * paints it 0x1f2226, L 0.016, against glass at L 0.023 / 0.033 / 0.036), they
 * are drawn on the scene-lit standard material so they carry a gradient and a
 * sky highlight, and the Michelson contrast measured between an unlit lens and
 * the housing on the rendered frame at 24.7 m is 0.61–0.85 — where the OLD
 * unlit red managed 0.07, because it happened to sit at almost exactly the
 * housing's luminance and had nothing but hue to separate it. The dead head is
 * MORE legible as an object now, not less; it simply stopped claiming to be on.
 */

/** Lens radius, m (doc 62 S1: 0.085 → 0.13 for „no visible traffic light"). */
export const LENS_R_M = 0.13;

/**
 * The emissive sphere's radius. Larger than the glass lens it sits inside by a
 * deliberate hair: the glass is opaque and writes depth, so a coincident
 * emissive sphere would z-fight and a smaller one would be depth-rejected
 * outright. 0.004 m is 0.15 px at the 25 m the B35 frame was refused at.
 */
export const LENS_EMISSIVE_R_M = LENS_R_M + 0.004;

/** A lens that is EMITTING. Additive, so this is a contribution, not a paint. */
export const LAMP_ON_HEX = {
  red: 0xff3b30,
  yellow: 0xffb300,
  green: 0x30d158,
} as const;

/** A lens that is NOT emitting: the colour of its dark tinted glass. */
export const LENS_GLASS_HEX = {
  red: 0x3b2422,
  yellow: 0x3a3222,
  green: 0x243a2b,
} as const;

/** The three channels of an 0xRRGGBB literal, 0–255. */
export function channels(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

/** HSV saturation, 0–1 — „how pure is this hue", the lit/unlit tell. */
export function hsvSaturation(hex: number): number {
  const [r, g, b] = channels(hex);
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/** Relative luminance (WCAG/Rec.709 on linearised sRGB), 0–1. */
export function relativeLuminance(hex: number): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = channels(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
