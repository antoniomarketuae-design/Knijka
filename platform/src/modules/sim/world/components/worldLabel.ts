/**
 * THE WORLD-LABEL CHANNEL — a caption anchored to a piece of WORLD GEOMETRY.
 *
 * WHY THIS FILE EXISTS (doc 87 B35, and the reason that row was refused twice).
 * The product already had the pattern the register kept prescribing: B42's
 * billboarded caption over the регулировчик's head. It could not be reused,
 * because it is welded into `traffic/TrafficLayer.tsx` — a per-frame actor
 * system whose bubble is positioned off `system.pedestrians[i]`, painted from a
 * posture enum and hidden by an officer test. A signal head is not an actor: it
 * is static world geometry emitted by the builder into `WorldGeometry`, drawn
 * by `world/components/WorldProps.tsx`, and the two files may not import each
 * other's internals (docs/architecture/05). So the gate's own words —
 * „there is no shared world-label channel" — were exactly right, and the answer
 * is to extract one rather than to copy 90 lines into a second file.
 *
 * WHAT IS AND IS NOT SHARED TODAY, stated plainly so nobody reads more into
 * this file than it does. This is the channel for WORLD GEOMETRY, and the
 * signal head is its first caller. `traffic/TrafficLayer.tsx` still paints the
 * officer's bubble with its own painter (its `bubbleTex` + the wrapper above
 * `fillText`): that bubble is closed, photographed and shipped on row B42, and
 * moving it here would put a closed row back at risk for no gain the founder
 * can see. So the duplication is DELIBERATE and temporary — when the actor
 * bubble is next touched, it should adopt `drawWorldLabel` and delete its own
 * painter, and this paragraph is the note that says so.
 *
 * WHAT IT IS. A texture painter plus the numbers a billboarded plane needs. It
 * knows nothing about signals, officers or lessons: a caller supplies a
 * `WorldLabelCopy`, paints it once into its own canvas, and draws it on a plane
 * it positions and billboards itself. That is deliberately the whole contract —
 * the mesh stays with whoever owns the object being labelled, so the label
 * inherits that object's occlusion, its lifetime and its draw budget.
 *
 * WHY A WORLD PLANE AND NOT A DOM/HUD CARD. Four separate register rows record
 * DOM overlays landing on top of each other and on the thing they annotate
 * (B55's own left-hand head is hidden by the keyboard-help panel; the B64 frame
 * is covered by the instructions card). A world plane depth-TESTS: a bus
 * between the student and the head hides the caption exactly as it hides the
 * head, which is the honest read. It also costs one draw and cannot collide
 * with any HUD layer.
 *
 * THE SIZING RULE IS THE POINT. Past `WORLD_LABEL_REF_DIST_M` the caller grows
 * the plane with distance up to `WORLD_LABEL_MAX_SCALE`, so apparent size stays
 * roughly constant and the caption is readable from the distance at which the
 * student can still act on it — not only from the stop line, where the decision
 * has already been made.
 */

/** One caption: a headline, two body lines and a retrieved law reference. */
export interface WorldLabelCopy {
  /** Shouted line — what this object IS. */
  readonly headlineBg: string;
  /** What that means for the junction / the road. */
  readonly line1Bg: string;
  /** What the student must therefore DO. */
  readonly line2Bg: string;
  /**
   * ADR-002: retrieved and cited, never recalled. Where the corpus does not
   * hold the act, this carries the rule's NAME with no number — the founder's
   * standing ruling — rather than an invented article.
   */
  readonly lawRef: string;
  /** Border + headline colour; the only per-copy styling. */
  readonly accent: string;
}

export const WORLD_LABEL_TEX_W = 1024;
export const WORLD_LABEL_TEX_H = 470;
/** Plane size in metres at scale 1. Aspect matches the texture exactly
 *  (1024/470 = 3.4/1.5605) — a mismatch stretches the type. */
export const WORLD_LABEL_W_M = 3.4;
export const WORLD_LABEL_H_M = 1.5605;
/** Gap between the top of the labelled object and the bottom of the card, m. */
export const WORLD_LABEL_GAP_M = 0.34;
/** Distance at which the card is drawn at 1:1 world size, m. */
export const WORLD_LABEL_REF_DIST_M = 18;
/** Growth ceiling past the reference distance. 3.4 holds apparent size out to
 *  ~61 m, which is beyond the 45 m at which the dead-signal drill's own card
 *  says «намали отрано». */
export const WORLD_LABEL_MAX_SCALE = 3.4;
/** Left+right ink margin, px of the 1024 px canvas — clear of the 7 px border
 *  stroke and the 34 px corner radius. */
export const WORLD_LABEL_PAD_X = 44;
/**
 * Shrink floor for a line that does not fit. Shrink, never ellipsize: the law
 * line is read FROM THE DRIVING SEAT and „ЗДвП чл. 4…" is a worse failure than
 * a couple of points of type. Same discipline (and same value) as the B42
 * bubble's painter, for the same reason.
 */
export const WORLD_LABEL_MIN_FONT_SCALE = 0.62;

/**
 * The four authored line sizes, in texture px. Extracted from the painter so
 * the sizes and the legibility instrument below read from ONE table — the
 * cluster's „one table, three readers" rule, and the reason the dial numerals
 * could ship at a third of their reviewed size without anything noticing.
 */
export const WORLD_LABEL_LINE_PX = {
  headline: 100,
  line1: 50,
  line2: 54,
  lawRef: 38,
} as const;

const FONT = '"Segoe UI", system-ui, "Noto Sans", sans-serif';

// ---------------------------------------------------------------------------
// R1 — HOW BIG THIS CARD ACTUALLY IS ON THE SCREEN IT IS READ FROM
// ---------------------------------------------------------------------------
//
// „THE SIZING RULE IS THE POINT", says the header, and the point it makes is
// that the caption must be readable „from the distance at which the student can
// still act on it — not only from the stop line, where the decision has already
// been made". That is a testable claim expressed in texture pixels, which are
// not a size — the exact mistake clusterLayout.ts records in its R2 block, and
// the reason its dial numerals shipped at half the legibility floor.
//
// So the same arithmetic is done here. Nothing below changes what is painted;
// it makes the claim measurable, and the measurement is recorded at the site.
//
// WHAT IT SAYS, on the founder's handset (2556×1179 at dpr 3 → 852×393 CSS,
// vFOV 39.25° from cockpitVFovForAspect), at the reference distance where the
// apparent size is at its plateau — i.e. the size the card holds across the
// whole approach:
//
//     headline (100 px)   10.2 CSS px      floor 10.5      UNDER
//     line2    (54 px)     5.5 CSS px                      UNDER
//     line1    (50 px)     5.1 CSS px                      UNDER
//     lawRef   (38 px)     3.9 CSS px                      UNDER, by 2.7×
//
// and those numbers are OPTIMISTIC: they treat the whole em as ink, where the
// cap height of this font is nearer 0.7 of it. Realistically the law line lands
// at ~2.7 CSS px. The catalogue rows read exactly this back out of the frames —
// „a grey smear about 6 px tall", „an illegible blur at roughly 5 px".
//
// WHY THE SIZING RULE CANNOT FIX IT, and this is arithmetic rather than taste.
// Apparent size is at its MINIMUM at exactly WORLD_LABEL_REF_DIST_M (closer, the
// card is unscaled and grows as you approach; further, the scale cancels the
// distance until the ceiling). Lifting the smallest line to the floor needs the
// reference distance cut by 2.7×, to 6.6 m — and then holding the card out to
// the 45 m its own drill card asks for needs WORLD_LABEL_MAX_SCALE ≈ 6.8, i.e.
// a plane 23 m wide hanging over a junction. There is no value of these two
// constants that both fits in the world and clears the floor.
//
// SO THE ANSWER IS NOT TO HIDE IT. A caption that vanishes is a false refusal —
// the student loses the explanation AND the citation, and doc 64's
// requirement-zero says a bare verdict is never acceptable. The answer is fewer
// and bigger lines on the mounts that cannot resolve four, which is the same
// verdict `dialNumeralsLegibleAt` reached and the same one the founder accepted
// there. That is a COPY decision, not a painter one, so it is measured here and
// routed rather than guessed at in this lane.

/**
 * Glance floor in CSS px of ink — the same 20-arcminute derivation as
 * clusterLayout's GLANCE_FLOOR_CSS_PX (20′ at 300 mm on a 460 ppi handset at
 * dpr 3), restated rather than imported: `sim/world` and `sim/cockpit` are
 * separate modules and doc 05 forbids reaching into another module's internals.
 * If one of the two ever moves, they must move together.
 */
export const WORLD_LABEL_GLANCE_FLOOR_CSS_PX = 10.5;

/** The billboard scale the caller applies at `distM` (WorldProps' own clamp —
 *  stated here so the instrument and the renderer cannot disagree). */
export function worldLabelScaleAt(distM: number): number {
  if (!Number.isFinite(distM) || distM <= 0) return 1;
  return Math.min(WORLD_LABEL_MAX_SCALE, Math.max(1, distM / WORLD_LABEL_REF_DIST_M));
}

/** A texture-px line size as a height in world metres on the unscaled card. */
export function worldLabelInkMetres(linePx: number): number {
  return (linePx / WORLD_LABEL_TEX_H) * WORLD_LABEL_H_M;
}

/**
 * On-screen height of a line, in CSS px, for a viewport `viewportHeightCssPx`
 * tall with vertical FOV `vFovRad`, at `distM` metres.
 *
 * Treats the em as ink (see the block above): the answer is an OVER-estimate,
 * so a value under the floor is conclusive and a value over it is not a
 * guarantee. That asymmetry is deliberate — every „0 defects" report in this
 * project came from an instrument that erred the other way.
 */
export function worldLabelApparentCssPx(
  linePx: number,
  distM: number,
  viewportHeightCssPx: number,
  vFovRad: number,
): number {
  if (!(distM > 0) || !(viewportHeightCssPx > 0) || !(vFovRad > 0)) return 0;
  const metres = worldLabelInkMetres(linePx) * worldLabelScaleAt(distM);
  return (viewportHeightCssPx * metres) / (2 * distM * Math.tan(vFovRad / 2));
}

/** True when a line clears the glance floor — measured, never assumed. */
export function worldLabelLineIsLegible(
  linePx: number,
  distM: number,
  viewportHeightCssPx: number,
  vFovRad: number,
): boolean {
  return (
    worldLabelApparentCssPx(linePx, distM, viewportHeightCssPx, vFovRad) >=
    WORLD_LABEL_GLANCE_FLOOR_CSS_PX
  );
}

/** Paint one centred line, shrunk to fit inside the card. */
function labelLine(
  g: CanvasRenderingContext2D,
  text: string,
  weight: number,
  sizePx: number,
  y: number,
  W: number,
): void {
  const maxW = W - 2 * WORLD_LABEL_PAD_X;
  g.font = `${weight} ${sizePx}px ${FONT}`;
  const measured = g.measureText(text).width;
  if (measured > maxW) {
    const scaled = Math.max(WORLD_LABEL_MIN_FONT_SCALE, maxW / measured);
    g.font = `${weight} ${Math.floor(sizePx * scaled)}px ${FONT}`;
  }
  // The belt to the shrink's braces: at the floor, or if a font substitution
  // rasterises wider than it measured, the browser squeezes the glyphs instead
  // of letting the ink leave the card.
  g.fillText(text, W / 2, y, maxW);
}

/**
 * Paint a caption into `c` (expected `WORLD_LABEL_TEX_W × WORLD_LABEL_TEX_H`).
 *
 * Called ONLY when the copy actually changes — never per frame. Exported so the
 * gate can drive it against a recording 2D context: the painter is the thing
 * that can overflow, so the painter is the thing a test has to hold.
 */
export function drawWorldLabel(c: HTMLCanvasElement, copy: WorldLabelCopy): void {
  const g = c.getContext("2d");
  if (!g) return;
  const W = c.width;
  const H = c.height;
  const tail = 30; // downward pointer at the object, reserved at the bottom
  const bodyH = H - tail;
  const r = 34;
  g.clearRect(0, 0, W, H);
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(W - r, 0);
  g.quadraticCurveTo(W, 0, W, r);
  g.lineTo(W, bodyH - r);
  g.quadraticCurveTo(W, bodyH, W - r, bodyH);
  g.lineTo(W / 2 + 36, bodyH);
  g.lineTo(W / 2, H);
  g.lineTo(W / 2 - 36, bodyH);
  g.lineTo(r, bodyH);
  g.quadraticCurveTo(0, bodyH, 0, bodyH - r);
  g.lineTo(0, r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.closePath();
  // Near-opaque. The B42 bubble was authored at 0.93 and washed out against a
  // bright dawn sky; this card hangs at 4 m against MORE sky than that one does.
  g.fillStyle = "rgba(9,14,25,0.97)";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = copy.accent;
  g.stroke();

  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillStyle = copy.accent;
  labelLine(g, copy.headlineBg, 700, WORLD_LABEL_LINE_PX.headline, 118, W);
  g.fillStyle = "#dbe5f2";
  labelLine(g, copy.line1Bg, 600, WORLD_LABEL_LINE_PX.line1, 208, W);
  g.fillStyle = "#ffd9a8";
  labelLine(g, copy.line2Bg, 700, WORLD_LABEL_LINE_PX.line2, 290, W);
  g.fillStyle = "#8ea3bd";
  labelLine(g, copy.lawRef, 500, WORLD_LABEL_LINE_PX.lawRef, 368, W);
}
