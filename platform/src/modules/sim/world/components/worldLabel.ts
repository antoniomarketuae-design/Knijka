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

const FONT = '"Segoe UI", system-ui, "Noto Sans", sans-serif';

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
  labelLine(g, copy.headlineBg, 700, 100, 118, W);
  g.fillStyle = "#dbe5f2";
  labelLine(g, copy.line1Bg, 600, 50, 208, W);
  g.fillStyle = "#ffd9a8";
  labelLine(g, copy.line2Bg, 700, 54, 290, W);
  g.fillStyle = "#8ea3bd";
  labelLine(g, copy.lawRef, 500, 38, 368, W);
}
