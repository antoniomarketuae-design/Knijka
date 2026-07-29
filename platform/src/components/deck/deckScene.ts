/**
 * THE DECK — the room the instruments sit in, as numbers.
 *
 * WHAT IT IS. The landing page shows a car on a Bulgarian road at dusk, from
 * astern. Logging in should not teleport a student to a different product, so
 * the authenticated app's backdrop is the SAME road, the SAME dusk and the SAME
 * Vitosha crest — from the driver's seat. The panels then sit on the glass in
 * front of it, which is what the product is: an instrument cluster reading a
 * real road. Nobody else's dark dashboard has a vanishing point in it.
 *
 * It is literally the same road: the camera below is a `PlateCamera` over
 * `@/lib/visual/roadPlate`, the crest is the hero plate's crest re-aimed
 * through `reprojectPlatePoint`, and the lane cadence is the one shared
 * constant. Change a lane width and both surfaces move together.
 *
 * WHAT IT IS NOT. It is not a hero. A hero is the thing you look AT; this is
 * the thing you look THROUGH, behind text a student reads for twenty minutes
 * at a stretch, on pages they open many times a day. Two consequences run
 * through every number in this file:
 *
 *   1. IT IS STILL. Nothing here is a function of time. The one moving rung
 *      lives in DeckMotion and is 240 s per traverse — see deckCapability.ts
 *      for why there is no WebGL rung at all.
 *
 *   2. IT HAS A HARD LUMINANCE CEILING, and that is the whole engineering
 *      story. Several review rounds bought specific contrast ratios on these
 *      surfaces (mastery ink 7.25 : 1, the answer controls at 3.51–3.66 : 1
 *      across 99–100 % of their outline, clusterScope.test.ts pins the rest).
 *      A backdrop that lifts the ground under a glyph spends those ratios.
 *
 *      So the deck is not allowed to be brighter than the layer it REPLACES.
 *      `.haze` (globals.css, doc 83 §6) already paints this plane, and its
 *      brightest pixel is `--haze-warm` — rgba(72,169,255,0.10) — over
 *      `--background`, i.e. #0c1724, relative luminance 0.008183. That is
 *      `DECK_LUMINANCE_CEILING`, and every colour below is at or under it.
 *
 *      The invariant is provable rather than sampled: sRGB alpha compositing
 *      and gradient interpolation are per-channel linear blends, the sRGB
 *      transfer function is monotonic, and relative luminance is a
 *      positive-weighted sum — so a blend of two colours can never be brighter
 *      than the brighter of the two. If every ingredient is under the ceiling,
 *      every pixel is. deckScene.test.ts checks every ingredient, and the deck
 *      uses no `mix-blend-mode`, no filter and no additive layer, which are the
 *      only three ways to escape that argument.
 *
 * It buys depth the way a night scene actually does — by SHAPE and by
 * NEGATIVE space, not by light. The horizon ribbon's graduations are cut
 * DARK into the lit band rather than drawn bright over it, which is also how
 * a real etched graticule works.
 *
 * Pure data & math. Every consumer is a Server Component, so all of this runs
 * on the server and costs the browser nothing at all.
 */

import {
  azimuthXOnPlate,
  dashesOnPlate,
  HERO_PLATE_CAMERA,
  reprojectPlatePoint,
  PLATE_RIDGE_POINTS,
  ROAD_LANE_WIDTH_M,
  ROAD_MARK_WIDTH_M,
  ROAD_WIDTH_M,
  projectOnPlate,
  type PlateCamera,
  type PlateDash,
} from "@/lib/visual/roadPlate";

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

/**
 * 1.6 : 1 — a desktop window, not a hero band.
 *
 * The plate is `preserveAspectRatio="xMidYMid slice"`, so the viewBox aspect
 * decides which axis is cropped. 1600 × 1000 maps 1 : 1 onto the 1440 × 900
 * profile this is reviewed at, and on a 390 × 844 phone the fit is
 * height-driven — which keeps the horizon at its designed fraction of the
 * height and crops the sides, leaving the vanishing point, the centre line and
 * the summit dead centre. That is the correct thing to lose on a phone: the
 * composition is symmetric about the vanishing point, so a centre crop is the
 * same picture, narrower.
 */
export const DECK_VIEWBOX_W = 1600;
export const DECK_VIEWBOX_H = 1000;

/**
 * The driver's seat.
 *
 * `eyeHeightM` 1.15 is a real driver's eye above the road in a normal car —
 * NOT the hero plate's 1.6, which is a chase camera floating behind the roof.
 * That one number is the whole difference between "a picture of a car" and
 * "the view from inside it", and it is why the road opens up so much wider
 * here than in the hero: the lower the eye, the harder the perspective.
 *
 * `horizonY` at 56 % of the frame leaves the top 56 % for sky (where the
 * topbar and page headings live, so it is the darkest region) and the bottom
 * 44 % for the road. `focalPx` is then set so the road reaches the bottom edge
 * at ~3 m ahead: 1000 = 560 + f × 1.15 / 3 ⇒ f ≈ 1150. That works out to a
 * ~70° horizontal field, wide enough that the frame reads as a windscreen
 * rather than as a telephoto poster.
 */
export const DECK_CAMERA: PlateCamera = {
  vanishingX: DECK_VIEWBOX_W / 2,
  horizonY: 560,
  focalPx: 1150,
  eyeHeightM: 1.15,
};

/** Far end of the drawn road, m — past this the horizon haze has taken it. */
export const DECK_ROAD_FAR_M = 260;
/** Near end, m — off the bottom of the frame, so the road has no visible start. */
export const DECK_ROAD_NEAR_M = 2.1;

// ---------------------------------------------------------------------------
// Palette — every entry at or under DECK_LUMINANCE_CEILING
// ---------------------------------------------------------------------------

/**
 * The brightest pixel the layer this replaces already painted: `--haze-warm`
 * (rgba(72, 169, 255, 0.10)) composited over `--background` (#05070c).
 * Relative luminance 0.008183. Nothing in the deck may exceed it.
 */
export const DECK_HAZE_CEILING_HEX = "#0c1724";

/** Cabin roof / zenith. Darker than `--background`, which is what a roof is. */
export const DECK_SKY_TOP = "#03050a";
/** Mid sky — the long ramp down toward the light. */
export const DECK_SKY_MID = "#070b13";
/** The cool afterglow at the horizon. The brightest large area in the frame. */
export const DECK_SKY_HORIZON = "#0b1420";
/**
 * The dusk sun, off the RIGHT shoulder — the hero's own composition
 * (HeroPlate's `#hero-sun` sits at cx 0.76 for the same reason: driving south
 * at dusk in Sofia puts an azimuth-262° sun to starboard). It is the only warm
 * thing in the frame and it is what stops the deck reading as a blue filter.
 */
export const DECK_SUN_WARM = "#181310";

/** Vitosha: two silhouettes, both DARKER than the sky they stand against. */
export const DECK_RIDGE_FAR = "#080b14";
export const DECK_RIDGE_NEAR = "#04060c";

/** Ground either side of the tarmac. */
export const DECK_VERGE = "#04050a";
/** The road: near asphalt, and the far asphalt lifted by aerial perspective. */
export const DECK_ROAD_NEAR = "#0a0c12";
export const DECK_ROAD_FAR = "#0c0f17";

/**
 * Lane paint, and the alpha it is drawn at.
 *
 * 0.035 is not a taste number: at 0.04 over `DECK_ROAD_FAR` the composite is
 * 105 % of the ceiling and the invariant breaks. 0.035 lands at 98 %.
 *
 * …AND THE BOUND ONLY HOLDS WHILE THE THING UNDERNEATH IS TARMAC. `DECK_PAINT`
 * is white-ish, i.e. far over the ceiling on its own and legal only as a
 * composite, so what it is drawn ON is part of the constant. The road ramp used
 * to finish on `DECK_SKY_HORIZON` (so the far tarmac dissolved into the sky) —
 * which put paint on a horizon-bright base and produced 663 pixels over the
 * ceiling on a 390 × 844 capture. The dissolve now happens in the ground-haze
 * layer painted AFTER the road group instead; deckScene.test.ts pins both the
 * ramp's end colour and the drawing order, because either one alone lets it
 * back in.
 */
export const DECK_PAINT = "#cfd4dc";
export const DECK_PAINT_ALPHA = 0.035;

/**
 * The one LIT mark in the whole backdrop — the graticule's centre tick, at the
 * vanishing point. It is exactly `DECK_HAZE_CEILING_HEX`, i.e. exactly the
 * colour the old haze already painted across a third of this plane. The
 * brightest thing the student now sees is 4 px wide instead of 400.
 */
export const DECK_LIT = DECK_HAZE_CEILING_HEX;

/**
 * Cabin overhead light — the cool off-centre wash `.haze` already had
 * (`--haze-cool`, rgba(23, 225, 196, 0.055)), kept because it is the cue that
 * there is a roof above the frame.
 *
 * The alpha is 0.045 rather than the haze's 0.055 and that is a real
 * difference, not a rounding. `.haze` painted this wash over `--background`
 * alone; here it is painted over a SKY that already has its own ramp, and the
 * bound has to be the brightest sky the wash can reach — `DECK_SKY_MID`, since
 * the gradient has fallen to nothing well before the horizon band. 0.055 over
 * that is 92 % of the ceiling with no headroom for the sun behind it; 0.045 is
 * 82 % and still reads as a lit roof.
 */
export const DECK_CABIN_COOL = "#17e1c4";
export const DECK_CABIN_COOL_ALPHA = 0.045;
/**
 * The brightest ground the cabin wash can actually be composited over — its
 * radial has decayed to zero long before the horizon band. Exported so the
 * test states the same bound the design assumed, instead of inventing one.
 */
export const DECK_CABIN_COOL_BASE = DECK_SKY_MID;

// ---------------------------------------------------------------------------
// Vitosha, re-aimed
// ---------------------------------------------------------------------------

/**
 * The crest, in DECK_CAMERA coordinates.
 *
 * Not re-derived from the sky shader and not re-drawn by hand: the hero
 * plate's generated points are exact angles, and `reprojectPlatePoint` moves
 * an angle between two pinholes exactly. So the mountain outside the
 * windscreen is provably the same mountain that is behind the car on the
 * landing page — which is the entire claim this backdrop makes.
 */
export const DECK_RIDGE_POINTS: readonly (readonly [number, number])[] =
  PLATE_RIDGE_POINTS.map((p) => {
    const [x, y] = reprojectPlatePoint(HERO_PLATE_CAMERA, DECK_CAMERA, p);
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10] as const;
  });

// ---------------------------------------------------------------------------
// The horizon graticule
// ---------------------------------------------------------------------------

/**
 * A heading tape across the horizon: a tick every 2° of azimuth, a long one
 * every 10°.
 *
 * Spaced by ANGLE, not by pixels, so the marks bunch toward the edges of frame
 * exactly the way a scale painted on a real windscreen would. That perspective
 * bunching is the difference between an instrument and a dotted line.
 *
 * ±40° because the frame's own half-angle is atan(800 / 1150) = 34.8°: a tape
 * that stopped at ±32 would end INSIDE the picture, which is the one thing a
 * scale must never look like it does. The edge mask fades the last few out.
 */
export const DECK_TICK_AZIMUTH_STEP_DEG = 2;
export const DECK_TICK_AZIMUTH_LIMIT_DEG = 40;
export const DECK_TICK_MAJOR_EVERY_DEG = 10;
/** Tick lengths in viewBox units, measured UP from the horizon line. */
export const DECK_TICK_MINOR_LEN = 9;
export const DECK_TICK_MAJOR_LEN = 20;
/**
 * How far a MAJOR graduation runs below the horizon line.
 *
 * A real heading tape's decade marks cross the datum rather than stopping at
 * it; stopping is what makes a row of marks read as a fence. It also puts the
 * bottom of each major in the ground-haze band, which is lit, so the mark stays
 * legible on both sides of the line.
 */
export const DECK_TICK_MAJOR_DROP = 9;
/** The lit centre tick at the vanishing point — a shade past the majors. */
export const DECK_TICK_CENTRE_LEN = 26;
/**
 * The boresight: two short lit marks flanking the centre tick, at the horizon.
 *
 * This is the one element that is an INSTRUMENT rather than a landscape, and it
 * earns its place twice over. A drawn road under a mountain is atmosphere;
 * atmosphere plus a datum marking dead ahead is a head-up display, which is
 * what this product claims to be. And dead ahead is not an arbitrary place to
 * put a mark — „look far, where you are going" is the first thing an instructor
 * says, and the vanishing point is literally that instruction, drawn.
 */
export const DECK_BORESIGHT_GAP = 26;
export const DECK_BORESIGHT_LEN = 30;

export interface DeckTick {
  x: number;
  length: number;
  major: boolean;
}

/** Every graduation on the tape, left to right. */
export function deckTicks(): DeckTick[] {
  const out: DeckTick[] = [];
  for (
    let deg = -DECK_TICK_AZIMUTH_LIMIT_DEG;
    deg <= DECK_TICK_AZIMUTH_LIMIT_DEG + 1e-9;
    deg += DECK_TICK_AZIMUTH_STEP_DEG
  ) {
    const rounded = Math.round(deg);
    const major = rounded % DECK_TICK_MAJOR_EVERY_DEG === 0;
    out.push({
      x: Math.round(azimuthXOnPlate(DECK_CAMERA, deg) * 10) / 10,
      length: major ? DECK_TICK_MAJOR_LEN : DECK_TICK_MINOR_LEN,
      major,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The road, projected
// ---------------------------------------------------------------------------

/** The centre-line dashes visible from this seat, nearest first. */
export function deckDashes(): PlateDash[] {
  return dashesOnPlate(DECK_CAMERA, DECK_ROAD_NEAR_M + 0.9, 0.3);
}

/** A ground-plane quad between two lateral offsets, near → far. */
export function deckGroundBand(leftM: number, rightM: number): string {
  const pt = (lateralM: number, distanceM: number) => {
    const [x, y] = projectOnPlate(DECK_CAMERA, lateralM, 0, distanceM);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return [
    pt(leftM, DECK_ROAD_NEAR_M),
    pt(rightM, DECK_ROAD_NEAR_M),
    pt(rightM, DECK_ROAD_FAR_M),
    pt(leftM, DECK_ROAD_FAR_M),
  ].join(" ");
}

/**
 * A continuous edge line, drawn as a tapering quad rather than a stroke so it
 * narrows with distance exactly like the dashes do. A stroked line has constant
 * width, which is the single fastest way to destroy a vanishing point.
 */
export function deckEdgeLine(lateralM: number): string {
  const h = ROAD_MARK_WIDTH_M / 2;
  return deckGroundBand(lateralM - h, lateralM + h);
}

/** Half the tarmac, m — exported so the plate does not restate the geometry. */
export const DECK_ROAD_HALF_M = ROAD_WIDTH_M / 2;
/** Where the two edge lines sit, m either side of the centre line. */
export const DECK_EDGE_LATERAL_M = ROAD_LANE_WIDTH_M;

/**
 * The crest as one closed path, its feet buried just under the horizon so the
 * massif sits IN the haze band rather than standing on a drawn line.
 */
export const DECK_RIDGE_PATH = [
  `M ${DECK_RIDGE_POINTS[0][0]} ${DECK_CAMERA.horizonY + 12}`,
  ...DECK_RIDGE_POINTS.map(([x, y]) => `L ${x} ${y}`),
  `L ${DECK_RIDGE_POINTS[DECK_RIDGE_POINTS.length - 1][0]} ${DECK_CAMERA.horizonY + 12}`,
  "Z",
].join(" ");
