/**
 * The reading scrim, as numbers — so the hero's legibility is a test rather
 * than a paragraph of confident prose in a component file.
 *
 * WHY THIS FILE EXISTS. LiveHero has always claimed an invariant: "the copy's
 * contrast must not depend on which image happens to be underneath." It is the
 * right invariant — the plate is a drawing, the loop is a video and the live
 * scene is a renderer, and only one of the three has luminance anyone can
 * predict at review time. But the claim lived in a comment, the scrim lived in
 * a template literal, and nothing connected either to the other, so when a
 * second visual layer arrived the invariant broke silently: the pre-rendered
 * dusk loop put a 0.32-luminance sky band directly behind the subhead on a
 * phone, where `--muted` scored 1.96 : 1 against a required 4.5.
 *
 * Nobody caught it in review because the failure is invisible in the source.
 * You cannot read a `linear-gradient(90deg, …)` and a video file and see a
 * contrast ratio. You can only measure it — so this module is the measurement,
 * expressed once, checked by heroContrast.test.ts, and imported by LiveHero as
 * the actual CSS it paints. One definition; the test and the pixels cannot
 * drift apart.
 *
 * Pure maths, no DOM and no React — the heroCapability.ts / heroScene.ts
 * pattern, for the same reason: vitest runs it in plain Node.
 */

// ---------------------------------------------------------------------------
// sRGB ↔ luminance
// ---------------------------------------------------------------------------

/** WCAG 2.x transfer function, one channel, 0–1. */
export function srgbToLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

/** Its inverse. */
export function linearToSrgb(linear: number): number {
  return linear <= 0.0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - 0.055;
}

/** WCAG relative luminance of an `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const r = srgbToLinear(((n >> 16) & 0xff) / 255);
  const g = srgbToLinear(((n >> 8) & 0xff) / 255);
  const b = srgbToLinear((n & 0xff) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two relative luminances. */
export function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Luminance left after compositing the scrim's near-black over a backdrop.
 *
 * The scrim is `rgba(4,6,11,α)` — the cluster background, which is 0.0021
 * luminance, i.e. black to three decimal places at any alpha that matters
 * here. Modelling it as pure black understates the result by <0.2 % and keeps
 * this reversible.
 *
 * The backdrop is modelled as the NEUTRAL GREY of the given luminance. That is
 * exact for a grey and slightly conservative for the warm dusk sky this is
 * actually used on (a saturated colour of equal luminance loses marginally
 * more), which is the direction an accessibility calculation should err in.
 *
 * Compositing happens in sRGB space, which is what browsers do by default and
 * is why the effect is so nonlinear: α = 0.78 does not remove 78 % of the
 * luminance, it removes 97 %.
 */
export function scrimmedLuminance(backdropLuminance: number, alpha: number): number {
  const grey = linearToSrgb(backdropLuminance);
  return srgbToLinear(grey * (1 - alpha));
}

// ---------------------------------------------------------------------------
// The scrim itself
// ---------------------------------------------------------------------------

/** One gradient stop: `alpha` of the scrim colour at `at` (0–1 of the axis). */
export interface ScrimStop {
  at: number;
  alpha: number;
}

/** The scrim's colour — `--background` in the cluster scope. */
export const SCRIM_RGB = "4,6,11";

/** Render a stop table as a CSS `linear-gradient(...)`. */
export function scrimGradient(angleDeg: number, stops: readonly ScrimStop[]): string {
  const body = stops
    .map((s) => `rgba(${SCRIM_RGB},${s.alpha}) ${Math.round(s.at * 1000) / 10}%`)
    .join(", ");
  return `linear-gradient(${angleDeg}deg, ${body})`;
}

/**
 * Scrim alpha at `fraction` along the gradient's axis.
 *
 * Linear between stops, clamped outside them — which is exactly what a CSS
 * `linear-gradient` does, so this function is the browser's arithmetic and not
 * a model of it.
 */
export function scrimAlphaAt(stops: readonly ScrimStop[], fraction: number): number {
  if (stops.length === 0) return 0;
  if (fraction <= stops[0].at) return stops[0].alpha;
  const last = stops[stops.length - 1];
  if (fraction >= last.at) return last.alpha;
  for (let i = 1; i < stops.length; i += 1) {
    const a = stops[i - 1];
    const b = stops[i];
    if (fraction <= b.at) {
      const span = b.at - a.at;
      // Two stops at the same position are a hard edge; take the later one.
      if (span <= 0) return b.alpha;
      return a.alpha + ((fraction - a.at) / span) * (b.alpha - a.alpha);
    }
  }
  return last.alpha;
}

/** Combined alpha of several scrim layers painted over one another. */
export function stackedAlpha(alphas: readonly number[]): number {
  return 1 - alphas.reduce((clear, a) => clear * (1 - a), 1);
}

// ---------------------------------------------------------------------------
// The two compositions
// ---------------------------------------------------------------------------

/**
 * DESKTOP — unchanged, and deliberately so.
 *
 * Above `lg` the shot is a left-copy / right-car composition: the copy column
 * is `max-w-2xl` on the left, the sun band and the tail lamps are on the
 * right. Darkening left-to-right buys the text its contrast and costs the
 * picture nothing. These three layers are byte-for-byte the gradients that
 * shipped, moved here so the two compositions live side by side.
 */
export const SCRIM_WIDE_HORIZONTAL: readonly ScrimStop[] = [
  { at: 0, alpha: 0.9 },
  { at: 0.34, alpha: 0.62 },
  { at: 0.64, alpha: 0.12 },
  { at: 0.82, alpha: 0 },
];
export const SCRIM_WIDE_BOTTOM: readonly ScrimStop[] = [
  { at: 0, alpha: 0.75 },
  { at: 0.38, alpha: 0 },
];
export const SCRIM_WIDE_TOP: readonly ScrimStop[] = [
  { at: 0, alpha: 0.62 },
  { at: 0.26, alpha: 0 },
];

/**
 * PHONE — the one that had to be invented.
 *
 * Below `lg` there is no left and no right: `HERO_BAND_CLASS`, the plate's
 * `xMaxYMax slice` and the loop's `object-cover object-right-bottom` all crop
 * their layer to its right-hand slice and stretch it across the full width,
 * and the copy spans the full width too. A horizontally-weighted scrim on that
 * composition puts its dark end on the left margin and its transparent end on
 * the right half of every line of body text.
 *
 * Vertical is where this shot's luminance actually varies, so that is the axis
 * the phone's scrim uses. The stops are set from a 390 × 844 capture of the
 * loop with the copy hidden (tools/clips/headless — the doc-66 R0 discipline):
 *
 *   0 → 62 %   the sky band, at 0.32 luminance, and the entire copy block
 *              (eyebrow 15 %, headline 19–42 %, subhead 45–58 %). 0.78 takes
 *              0.32 down to ~0.015, which is also where the still plate sits
 *              in the same rows — so the crossfade from plate to loop stops
 *              being a cut.
 *   62 → 84 %  the ROAD, released to 0.16. This is not a concession to the
 *              picture, it is the entire point of the feature: the streaming
 *              lane dashes are the only thing in the mobile crop with real
 *              local contrast (0.10 against 0.003 asphalt), i.e. the only
 *              thing a phone can see MOVING. The desktop scrim's bottom-up
 *              0.75 band crushed them to black — which is how a hero that was
 *              genuinely playing video still read as a photograph.
 *   84 → 100 % back to 0.5, so the section resolves into the page.
 */
export const SCRIM_NARROW_VERTICAL: readonly ScrimStop[] = [
  { at: 0, alpha: 0.82 },
  { at: 0.4, alpha: 0.78 },
  { at: 0.62, alpha: 0.78 },
  { at: 0.74, alpha: 0.16 },
  { at: 0.84, alpha: 0.16 },
  { at: 1, alpha: 0.5 },
];

/**
 * THE LOOP'S OWN GRADE — a THIRD composition, for a rung that did not exist
 * when the two above were written.
 *
 * A desktop that fails the WebGL probe used to get the still plate. It now gets
 * the pre-rendered loop, and the loop is not the plate: both layers are cropped
 * into the same box by the same `slice` fit, but the DRAWING puts its car and
 * its warm sky against the right-hand edge while the RENDER carries them
 * further left, into the copy column. Measured at 1440 × 900 with WebGL denied
 * and the copy hidden, sampling the whole 7.2 s loop rather than one frame:
 *
 *                        Lmean  CR      Lmax    CR      % of pixels below AA
 *   subhead, plate       0.0126 6.30    0.0445  4.17    0.00 % (glyph rects)
 *   subhead, loop        0.0060 7.05    0.2856  1.18    1.88 % (worst line)
 *
 * The means are fine — better than the plate's, because the loop's road is
 * darker than the drawing's. The PEAK is the whole defect, and it is one
 * object: the lead car's light bar, a near-white specular at 0.69 luminance
 * that sweeps to x ≈ 683 while the subhead's middle line runs to x ≈ 742.
 * `--muted` over it scores 1.18 : 1 against a required 4.5.
 *
 * WHY THIS IS A NEW LAYER AND NOT A HEAVIER `SCRIM_WIDE_HORIZONTAL`. The scrim
 * has already fallen to 0.33 where the light bar sits, so buying AA there
 * costs ~0.75 total alpha — and SCRIM_WIDE is painted over the LIVE SCENE and
 * the PLATE too, neither of which has this problem and one of which the
 * founder has signed off pixel for pixel. Grading the layer that is actually
 * too bright leaves the other two rungs byte-identical, which is the only
 * version of this fix that cannot regress a composition nobody complained
 * about.
 *
 * THE BAND IS BELOW THE HORIZON, NOT ABOVE IT, and that is the measurement
 * talking. The headline sits over the sky and never fails: `--foreground` at
 * large-text size scores 3.34 : 1 at its worst pixel against a 3 : 1 bar (4.06
 * over the glyphs themselves), so grading the sky would cost the sunset — the
 * one thing in the shot people actually look at — to fix nothing.
 *
 *   0 → 47.7 %   nothing, and the first stop is `HERO_LOOP_DESKTOP_HORIZON`
 *                itself rather than a round number near it: the ramp starts on
 *                the image's own hard edge, where the sky's luminance already
 *                collapses in one scanline, so it cannot read as a band.
 *   52 → 65.5 %  0.72 flat. The subhead's three lines occupy 52.3–63.8 %.
 *   65.5 → 73.5 % released. Below this are the CTAs, which carry opaque fills,
 *                and then the near road — whose streaming lane dashes are the
 *                only moving thing in the frame and the entire reason this rung
 *                exists at all. Measured: the near road and the sunset are
 *                bit-identical with and without this layer.
 */
export const SCRIM_LOOP_WIDE_VERTICAL: readonly ScrimStop[] = [
  { at: 0.477, alpha: 0 },
  { at: 0.52, alpha: 0.72 },
  { at: 0.655, alpha: 0.72 },
  { at: 0.735, alpha: 0 },
];

/** The CSS LiveHero paints above `lg`. Three layers, first on top. */
export const HERO_SCRIM_WIDE = [
  scrimGradient(90, SCRIM_WIDE_HORIZONTAL),
  scrimGradient(0, SCRIM_WIDE_BOTTOM),
  scrimGradient(180, SCRIM_WIDE_TOP),
].join(", ");

/** The CSS HeroLoopVideo paints over ITSELF above `lg`. One layer. */
export const HERO_LOOP_GRADE_WIDE = scrimGradient(180, SCRIM_LOOP_WIDE_VERTICAL);

/** The CSS LiveHero paints below `lg`. One layer — the axis that matters. */
export const HERO_SCRIM_NARROW = scrimGradient(180, SCRIM_NARROW_VERTICAL);

// ---------------------------------------------------------------------------
// What the scrim is standing between
// ---------------------------------------------------------------------------

/** Cluster-scope text tokens (globals.css `[data-surface="cluster"]`). */
export const HERO_FOREGROUND = "#e8eef8";
export const HERO_MUTED = "#8fa0b8";

/**
 * Measured relative luminance of the loop's sky band in the phone crop, from a
 * 390 × 844 capture with every scrim, join and grain layer removed.
 *
 * It is a FLAT wall — mean 0.32, peak 0.43, i.e. almost no internal structure
 * — which is what makes it both the worst thing that can sit behind body text
 * and the least interesting thing to look at. The peak is the number the
 * tests use; a contrast floor that only holds on average is not a floor.
 */
export const HERO_LOOP_SKY_LUMINANCE = 0.32;
export const HERO_LOOP_SKY_PEAK_LUMINANCE = 0.43;

/**
 * Measured luminance of a lit lane dash, and of the asphalt beside it, in the
 * same capture. The ratio between these two is the motion: if the scrim
 * flattens it, the video is playing and nobody can tell.
 */
export const HERO_LOOP_MARK_LUMINANCE = 0.1;
export const HERO_LOOP_ASPHALT_LUMINANCE = 0.003;

/**
 * What the loop puts behind the DESKTOP copy, measured at 1440 × 900 with the
 * loop forced on (WebGL denied) and the copy layer hidden.
 *
 * These are why the shipped horizontal scrim needed no change above `lg`. The
 * video's horizon is at 40 % of the section's height; the headline straddles
 * it at 28–48 % and the subhead sits well below it at 52–64 %. So the desktop
 * subhead is over road at 0.0055 — two orders of magnitude darker than the
 * 0.32 sky that same video puts behind the PHONE's subhead, which is the whole
 * asymmetry this module exists to record.
 *
 * Each is paired with the token that is actually drawn on it: the headline is
 * `--foreground` at large-text size, the subhead is `--muted` at body size.
 */
export const HERO_LOOP_DESKTOP_HEADLINE_BACKDROP = 0.0671;
export const HERO_LOOP_DESKTOP_SUBHEAD_BACKDROP = 0.0055;

/**
 * Where the desktop copy column sits horizontally, as a fraction of the
 * viewport — `max-w-2xl` inside `max-w-6xl`, measured rather than derived. The
 * headline reaches further right than the subhead, and the scrim is weakest at
 * the right, so they get separate bounds.
 */
export const HERO_DESKTOP_HEADLINE_COLUMN = { from: 0.117, to: 0.583 } as const;
export const HERO_DESKTOP_SUBHEAD_COLUMN = { from: 0.117, to: 0.517 } as const;

/**
 * Where the desktop subhead's three lines sit VERTICALLY, as a fraction of the
 * section — from `getClientRects()` on the text node, not from the paragraph's
 * box. The distinction matters here: the box is 88 px tall and the glyphs are
 * three 23 px lines inside it, and the failing highlight is 16 px tall.
 */
export const HERO_DESKTOP_SUBHEAD_ROWS = { from: 0.523, to: 0.638 } as const;

/**
 * The loop's measured horizon, as a fraction of the section at 1440 × 900 —
 * the row where the sky's luminance collapses from ~0.20 to ~0.03 in a single
 * scanline. The grade's ramp is pinned to it so the transition rides an edge
 * the picture already has.
 */
export const HERO_LOOP_DESKTOP_HORIZON = 0.477;

/**
 * The worst pixel the loop puts behind the desktop subhead, ALREADY SEEN
 * THROUGH `HERO_SCRIM_WIDE` — the lead car's light bar, sampled across the
 * whole loop at 1440 × 900 with WebGL denied and the copy hidden. `--muted`
 * over this is 1.18 : 1.
 *
 * And the same pixel with `HERO_LOOP_GRADE_WIDE` painted, measured the same
 * way rather than derived. That is deliberate: `scrimmedLuminance` models a
 * backdrop as the neutral grey of equal luminance, which is right for the dusk
 * sky it was written for but OPTIMISTIC for a near-white specular — the model
 * predicts 0.0219 here and the pixels come out at 0.0331, because sRGB's 2.4
 * exponent is convex and a spread of channels survives a multiply better than
 * a grey of the same luminance does. Recording the measurement keeps the
 * guarantee on the pixels; the test pins the gap so nobody quietly replaces it
 * with the cheaper prediction.
 */
export const HERO_LOOP_DESKTOP_SUBHEAD_PEAK = 0.2856;
export const HERO_LOOP_DESKTOP_SUBHEAD_PEAK_GRADED = 0.0331;

/**
 * The worst pixel the loop puts behind the desktop HEADLINE, on the same
 * sweep. Recorded because it is the number that says the sky needs NO grade:
 * `--foreground` at large-text size scores 3.34 : 1 over it, and the still
 * plate it replaced scores 3.96 — both clear the 3 : 1 bar, so darkening the
 * sunset would buy nothing and cost the shot.
 */
export const HERO_LOOP_DESKTOP_HEADLINE_PEAK = 0.2194;
export const HERO_PLATE_DESKTOP_HEADLINE_PEAK = 0.1773;

/**
 * Where the landing page's hero copy sits, as a fraction of the section's
 * height at 390 × 844 — measured with getBoundingClientRect, not guessed.
 * Eyebrow through subhead; the CTAs below carry their own opaque fills and do
 * not depend on the scrim.
 */
export const HERO_COPY_BAND = { from: 0.15, to: 0.58 } as const;

/** WCAG 2.1 AA: 4.5 : 1 for body text, 3 : 1 for large text. */
export const WCAG_AA_BODY = 4.5;
export const WCAG_AA_LARGE = 3;
