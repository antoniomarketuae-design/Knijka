/**
 * Instrument-cluster LAYOUT — where every element of the „Виток" cluster sits,
 * as pure data. Doc 83's dark instrument-cluster language, in 3D:
 * deep ground, light used as EMISSION, precise thin rules, mono telemetry type.
 *
 * WHY A LAYOUT MODULE. The founder's verdict on the reels was that the cluster
 * is the product's visual metaphor and it was not readable — a 2D canvas face
 * on a quad plus a footer label. The rebuild makes it real geometry, which
 * means the numbers below are consumed twice (the geometry builder emits the
 * quads; the atlas painter fills the texture cells they sample) and once more
 * by the tests. One table, three readers — so it lives here and nowhere else.
 *
 * DESIGN UNITS. Everything is expressed in a 512×256 face-local grid centred on
 * (0, 0): x ∈ [−256, 256] right-positive, y ∈ [−128, 128] UP-positive (three's
 * convention, NOT canvas y-down), z toward the driver. The mounting component
 * scales the whole thing by `widthM / FACE_W`, so the same layout serves the
 * 0.30 m in-dash cluster and the large camera-pinned cluster the reels use.
 *
 * ── R1: WHAT THE DRIVER'S EYE ACTUALLY SEES ────────────────────────────────
 * The first build of this table was authored blind and then rendered for the
 * first time from the driver's seat. The frame said two things the numbers
 * could not:
 *
 *   1. THE STEERING WHEEL EATS THE BOTTOM HALF OF THE FACE. Measured off that
 *      frame, the rim + column shroud hide everything below roughly y = −20,
 *      and the wheel's upper boss additionally blanks the CENTRE column
 *      (x ≈ −57 … +55) below about y = +45. Anything that must be READ has to
 *      live in one of two clear panels — left of x ≈ −62 or right of x ≈ +60 —
 *      and above y ≈ −20, or in the clear bridge across the top.
 *   2. THE SPEED WAS PARKED IN THE ONE PLACE THAT IS ALWAYS HIDDEN. The exact
 *      mono readout sat AT the dial hub, i.e. dead centre-left behind the rim,
 *      at ~60 % of the gear letter's size, on top of the needle and its hub
 *      glow. It rendered as a smudge. The gear glyph — big, isolated, in the
 *      clear right panel — was perfectly legible in the same frame.
 *
 * So the readout now gets the gear's treatment: same glyph height, its own
 * clear panel, nothing drawn over it. The dial keeps the RATE job (and finally
 * carries numerals, because a scale without numbers is not an instrument), the
 * digits carry the VALUE, and the selector letter moves outboard to the right.
 */

// ---------------------------------------------------------------------------
// The face
// ---------------------------------------------------------------------------

/** Face plate extent in design units (2:1 — the GLB `screen_cluster` quad). */
export const FACE_W = 512;
export const FACE_H = 256;

/** Bezel: rim width and how far it stands proud of the face plate (toward the
 *  driver). The chamfer between the two is what catches light — doc 83 §3:
 *  "separation comes from a lit top edge and a hairline". */
export const BEZEL_W = 16;
export const BEZEL_Z = 8;
/** How deep the housing box runs BEHIND the face — the volume that makes the
 *  cluster read as an object at a three-quarter angle instead of a sticker. */
export const HOUSING_DEPTH = 22;

// ---------------------------------------------------------------------------
// Speedometer dial
// ---------------------------------------------------------------------------

/** Pushed left and lifted: the dial owns the whole clear LEFT panel now, and
 *  sitting 14 units higher keeps the 0–40 km/h ticks — the ones a learner
 *  actually drives on — above the steering-wheel rim instead of behind it. */
export const DIAL_CX = -164;
export const DIAL_CY = 30;
/** Tick band: every tick starts at the inner radius; majors run further out.
 *  The band is pulled in from 70/84/94 to leave a numeral ring inside it. */
export const TICK_R_INNER = 74;
export const TICK_R_MINOR = 82;
export const TICK_R_MAJOR = 90;
export const TICK_HALF_W_MINOR = 1.8;
export const TICK_HALF_W_MAJOR = 3.6;

export const DIAL_MAX_KMH = 160;
export const DIAL_TICK_STEP_KMH = 10;
/** 0 km/h points to 225° (lower-left), full scale to −45° — a 270° sweep. */
export const DIAL_START_DEG = 225;
export const DIAL_SWEEP_DEG = 270;
/** 0, 10, … 160 → 17 ticks. */
export const TICK_COUNT = DIAL_MAX_KMH / DIAL_TICK_STEP_KMH + 1;

/** Needle blade, in design units from the dial centre. The tip lands INSIDE
 *  the tick band (between the minor and major outer radii) rather than
 *  overshooting it — it now has numerals to point at, not just dashes. */
export const NEEDLE_R_TAIL = -16;
export const NEEDLE_R_TIP = 86;
export const NEEDLE_HALF_W_BASE = 5;
export const NEEDLE_HALF_W_TIP = 1.4;
/** The needle floats this far proud of the face so it casts a real silhouette
 *  in the cockpit view and parallaxes against the dial in the reel camera. */
export const NEEDLE_Z = 5;

/**
 * Tick angle (rad, CCW-positive — three's convention) for a dial speed.
 * Shared by the geometry builder (static tick placement) and the needle driver
 * (per-frame rotation), so a needle can never disagree with its own dial.
 */
export function dialAngleRad(speedKmh: number): number {
  const v = Math.min(Math.max(Math.abs(speedKmh), 0), DIAL_MAX_KMH);
  return ((DIAL_START_DEG - (DIAL_SWEEP_DEG * v) / DIAL_MAX_KMH) * Math.PI) / 180;
}

/** Speed at tick i (0-based). */
export function tickSpeedKmh(i: number): number {
  return i * DIAL_TICK_STEP_KMH;
}

/** Majors run longer, brighter, and carry a numeral. */
export function tickIsMajor(i: number): boolean {
  return tickSpeedKmh(i) % 20 === 0;
}

// ---------------------------------------------------------------------------
// Dial numerals
// ---------------------------------------------------------------------------
//
// R1: the first build shipped a bare tick band. Rendered, it was an arc of
// dashes you cannot read a speed off — the founder's complaint restated as a
// picture. Every major tick now carries its number on a ring INSIDE the band,
// sampled from the same mono strip the big readout uses, so the dial reads as
// a speedometer at any distance the reel camera picks.

/** Radius of the numeral ring — inside TICK_R_INNER, clear of the needle hub. */
export const DIAL_NUM_R = 48;
/** One numeral character. 1:2 like the atlas character cell, so the glyphs are
 *  never stretched (the digit quads obey the same rule). */
export const DIAL_NUM_CHAR_W = 16;
export const DIAL_NUM_CHAR_H = 32;
/** Advance between characters of a multi-digit label — tighter than the cell
 *  so „160" reads as one number rather than three separate glyphs. */
export const DIAL_NUM_TRACK = 14;
/**
 * Numerals every 40 km/h, not on every major tick.
 *
 * MEASURED, not guessed: nine labels on a 52-unit ring are 30° apart, which is
 * 27 units of arc — narrower than „160" is wide. The first render of the ring
 * duly produced „6089 00" where 60/80/100 should have been. Five labels sit
 * 68 units apart and stay separate, and the majors every 20 still mark the
 * in-between values with a longer tick.
 */
export const DIAL_LABEL_STEP_KMH = 40;

/** The numeral text for tick i, or "" when that tick carries none. */
export function tickNumeral(i: number): string {
  return tickSpeedKmh(i) % DIAL_LABEL_STEP_KMH === 0 ? String(tickSpeedKmh(i)) : "";
}

// ---------------------------------------------------------------------------
// R2 — HOW BIG A GLYPH ACTUALLY IS ON A SCREEN, AND WHEN IT STOPS BEING ONE
// ---------------------------------------------------------------------------
//
// EVERYTHING ABOVE THIS BLOCK IS EXPRESSED IN DESIGN UNITS, WHICH ARE NOT A
// SIZE. That is how the dial numerals came to ship at a third of the size they
// were reviewed at: the SAME component mounts twice from one implementation —
// portalled onto the cabin's `screen_cluster` quad, and pinned in front of the
// reel camera at 0.42 of the frame width (CaptureScene CLUSTER_FRAME_FRACTION,
// ≈538 px of face on a 1280 px frame). „32 units tall" is legible on one of
// those mounts and is not a number at all on the other, and nothing in this
// file could tell them apart.
//
// MEASURED ON THE DEPLOYED BUILD, iPhone 16, WebKit
// (tools/mobile/wave12-cluster.mjs — it projects these constants through the
// live camera and reads the shipped atlas back with getImageData):
//
//   mount                     face width   dial numeral ink   digital readout
//   cockpit, landscape 852×393   158 px        5.6 px             16.7 px
//   cockpit, portrait  393×852   234 px        8.3 px             24.8 px
//   reel, 1280×720               538 px       19.1 px             57.4 px
//
// On his panel (460 ppi, dpr 3 → 6.04 CSS px per mm) 5.6 px is 0.93 mm of ink,
// which subtends 10.6′ at arm's length. The published floor for a value that is
// GLANCED at rather than studied is ~20–25′ („5 mm at 700 mm" = 24.6′). The
// dial numerals ship at HALF the floor; the digital readout on the same texture
// clears it three times over, which is exactly why the founder can read
// «0 км/ч D» in the same frame in which «120» reads as «12B».

/**
 * Ink height and width of a mono glyph as a fraction of its atlas CELL.
 *
 * MEASURED off the shipped atlas, not derived from font metrics: the painter
 * sets `700 110px` mono into a 64×128 cell and where the ink lands depends on
 * the font the device actually resolved. wave12 reads the live CanvasTexture
 * back with getImageData and reports 0.5625 × 0.875 (72 × 56 of 128 × 64).
 *
 * A QUAD IS NOT A GLYPH, and forgetting that is a repeat offence in this file —
 * see the R1 note on UNIT_CELL, where a word floating in an over-wide cell
 * reached the cockpit as a 3-pixel smudge.
 */
export const CHAR_INK_H_FRACTION = 0.5625;
export const CHAR_INK_W_FRACTION = 0.875;

/**
 * The ink height, in CSS px, that a design-unit height renders at when the face
 * plate is `faceWidthCssPx` wide on screen. Accurate to ~1 % against the
 * measured projection (perspective across the face is the residual).
 */
export function inkHeightCssPx(designUnitsH: number, faceWidthCssPx: number): number {
  return (faceWidthCssPx * designUnitsH * CHAR_INK_H_FRACTION) / FACE_W;
}

/**
 * The glance floor in CSS px of ink: 20 arcminutes at 300 mm on a 460 ppi
 * handset at dpr 3. Below this a number is not read, it is guessed at — and
 * this instrument is read while the student is steering.
 */
export const GLANCE_FLOOR_CSS_PX = 10.5;

/**
 * THE FACE WIDTH AT WHICH DIAL NUMERALS BECOME LEGIBLE — ≈300 CSS px.
 *
 * This is the whole finding in one number. The reel mount gives 538 px and the
 * numerals were authored and signed off there. The cockpit gives 158 px in
 * landscape and 234 px in portrait, so on the founder's phone they cannot be
 * read in either orientation, and no amount of render resolution changes that:
 * 0.93 mm of ink is 0.93 mm of ink on a 460 ppi panel and on a 4000 ppi one.
 *
 * The dial CANNOT be given bigger numerals in place, either, and that is
 * arithmetic rather than taste: the numeral ring is r=48 inside a tick band
 * that starts at r=74, five labels sit 56 units of arc apart, and «160» at
 * double height would be 88 units wide. The ring has no room, and the dial has
 * no room to grow — it already spans x −254…−74 of a face whose edge is −256.
 */
export const DIAL_NUMERALS_MIN_FACE_CSS_PX =
  (GLANCE_FLOOR_CSS_PX * FACE_W) / (DIAL_NUM_CHAR_H * CHAR_INK_H_FRACTION);

/**
 * May this mount draw dial numerals at all?
 *
 * The honest division of labour when the answer is no: the DIAL keeps the job
 * an analogue instrument is actually for — needle angle, tick band, and the arc
 * lighting up with speed, all of which are large shapes that survive at 55 px
 * of diameter — and the VALUE comes from the digital readout beside it, which
 * is three times the height and measured legible. What is removed is the one
 * element that was neither: numerals too small to read but big enough to look
 * like information, which is the worse of the two failures.
 */
export function dialNumeralsLegibleAt(faceWidthCssPx: number): boolean {
  return faceWidthCssPx >= DIAL_NUMERALS_MIN_FACE_CSS_PX;
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/**
 * THE SPEED. Three mono cells, and the single most important thing on the
 * face — half the founder's original complaint was that he could not read it.
 *
 * R1 moved it OUT of the dial hub, where the wheel rim, the needle and the hub
 * glow all sat on top of it at 60 % of the gear letter's size, and gave it the
 * clear band across the top of the face. DIGIT_H is now the gear glyph's own
 * height, so „78" is exactly as big as „D" — the one element in the first
 * render that was unmistakably legible is the benchmark the speed has to meet.
 *
 * DIGIT_W : DIGIT_H is 1:2, the atlas character cell's own aspect, so the
 * numerals are never stretched.
 */
export const DIGIT_W = 48;
export const DIGIT_H = 96;
export const DIGIT_GAP = 4;
export const DIGIT_COUNT = 3;
/** Centred on the clear top band. The hundreds cell reaches into the column
 *  the wheel boss blanks, but only BELOW y ≈ 45 — the glyphs sit above that,
 *  and that cell is blank under 100 km/h anyway. */
export const DIGITS_CX = 8;
export const DIGITS_CY = 76;

/** „км/ч" — set on the number's baseline and to its RIGHT, so the readout says
 *  „78 км/ч" as one phrase instead of stacking a caption into the occluded
 *  band under the digits. */
export const UNIT_W = 68;
export const UNIT_H = 34;
export const UNIT_CX = 122;
export const UNIT_CY = 54;

/**
 * The gear letter — unchanged in SIZE (it is the one element the first cockpit
 * render proved legible, so it is the benchmark, not the variable), moved
 * outboard and lifted onto the speed's own line. „58 км/ч │ D" is then one
 * horizontal scan for the driver instead of two stacked hunts, and it puts the
 * letter further above the wheel rim than it was before.
 */
export const GEAR_CX = 206;
export const GEAR_CY = DIGITS_CY;
export const GEAR_W = 76;
export const GEAR_H = 96;

/** „В И Т О К" wordmark (ADR-001: the fictional marque). Marque, not data —
 *  so it takes the dead centre-bottom, where it is a proper badge in the reel
 *  camera and out of the way of every value the driver has to read. */
export const MARK_CX = 0;
export const MARK_CY = -44;
export const MARK_W = 112;
export const MARK_H = 32;

// ---------------------------------------------------------------------------
// Telltale rail
// ---------------------------------------------------------------------------

/** Lamp order along the bottom rail, outboard turn arrows like a real cluster. */
export const LAMP_KEYS = [
  "arrowLeft",
  "belt",
  "brake",
  "engine",
  "oil",
  "battery",
  "temp",
  "arrowRight",
] as const;
export type LampKey = (typeof LAMP_KEYS)[number];

export const LAMP_CY = -98;
export const LAMP_CELL = 40;
/** The soft halo behind a lit lamp. This is the thing that makes a red belt
 *  telltale read as a WARNING at 1280×720 instead of as a small icon — the
 *  founder's „unacceptable footer label" complaint, answered with light. */
export const LAMP_HALO = 56;
export const LAMP_PITCH = 56;

/** Rail slot centre x for lamp index i. */
export function lampSlotX(i: number): number {
  const span = (LAMP_KEYS.length - 1) * LAMP_PITCH;
  return -span / 2 + i * LAMP_PITCH;
}

// ---------------------------------------------------------------------------
// R3 — WHAT THE STEERING WHEEL ACTUALLY COVERS, AS DATA
// ---------------------------------------------------------------------------
//
// R1 opened with „the rim + column shroud hide everything below roughly
// y = −20" and every element below has been placed against that sentence. A
// sentence cannot be checked, and three CRITICAL catalogue rows turned on
// exactly this question — sc-vp-telltale, sc-vp-handbrake and sc-vp-telltale-red
// all report „no lamp of any colour renders in any frame". They are right about
// the frame. The lamps ARE fed and the painter DOES paint them
// (InstrumentCluster.tsx, which measured the silhouette off the shipped frame
// and wrote it down in a comment its own consumer cannot read).
//
// So the measurement moves HERE, where the positions it judges already live —
// one table, now four readers. Nothing about the geometry changes; what changes
// is that „is this element behind the wheel?" is a function instead of a claim.
//
// PROVENANCE, because a silhouette measured on one frame is not a universal
// constant: read off `.audit-frames/sweep161/sc-vp-readiness/mobile-right/
// 04-t102s.png` (2556×1179, the phone-class landscape the founder reviews on),
// where the face plate lands at x 866…1352 / y 860…1049 px — 0.949 px per
// design unit across and 0.738 down, the dash tilt foreshortening the vertical.
// These are the lowest design-y still VISIBLE at each sampled column. The PC
// window projects the same wheel slightly differently (its frame shows a ~8 px
// slit between rim and shroud that mobile does not), so this table is the
// MOBILE case — which is the strict one, and the one he reviews on.

/** One measured column of the wheel/shroud silhouette. */
export interface FaceSilhouetteSample {
  /** Design-unit x across the face. */
  readonly x: number;
  /** Lowest design-unit y still visible at that column. */
  readonly floorY: number;
}

/** The wheel's upper silhouette, left to right. The +41 at x −9 is the wheel
 *  BOSS, which is why the centre column is the worst place on the face. */
export const FACE_WHEEL_SILHOUETTE: readonly FaceSilhouetteSample[] = [
  { x: -220, floorY: -45 },
  { x: -115, floorY: -16 },
  { x: -9, floorY: 41 },
  { x: 107, floorY: -48 },
  { x: 233, floorY: -119 },
] as const;

/**
 * Lowest visible y at design-x, linearly interpolated between samples and held
 * flat outside them.
 *
 * HELD FLAT, NOT EXTRAPOLATED: past x −220 the plate runs out at −256 and past
 * +233 at +256, and a linear run-off would invent a silhouette in the corners
 * where the bezel is. Holding the end sample is the conservative reading — it
 * neither claims extra occlusion nor extra clearance.
 */
export function faceVisibleFloorY(x: number): number {
  const s = FACE_WHEEL_SILHOUETTE;
  if (!Number.isFinite(x)) return s[0]!.floorY;
  if (x <= s[0]!.x) return s[0]!.floorY;
  const last = s[s.length - 1]!;
  if (x >= last.x) return last.floorY;
  for (let i = 1; i < s.length; i++) {
    const b = s[i]!;
    if (x <= b.x) {
      const a = s[i - 1]!;
      const t = (x - a.x) / (b.x - a.x);
      return a.floorY + t * (b.floorY - a.floorY);
    }
  }
  return last.floorY;
}

/** An axis-aligned element on the face, in design units. */
export interface FaceRect {
  readonly cx: number;
  readonly cy: number;
  readonly w: number;
  readonly h: number;
}

/**
 * The HIGHEST floor anywhere under `rect` — i.e. the worst column it spans.
 *
 * SPAN, NOT CENTRE, and this is the whole point of the function. A centre-only
 * test is the exact shape of the bug this project has already shipped once (a
 * per-vertex bound replaced by a centroid one, which cannot fail): the boss
 * peaks at x −9, so an element centred at x −60 with its right edge at −9 is
 * half behind the wheel while its centre column is clear. Because the
 * silhouette is piecewise linear, the maximum is attained at an endpoint or at
 * a knot — so the exact answer needs no sampling.
 */
export function faceWorstFloorY(rect: FaceRect): number {
  const left = rect.cx - rect.w / 2;
  const right = rect.cx + rect.w / 2;
  let worst = Math.max(faceVisibleFloorY(left), faceVisibleFloorY(right));
  for (const s of FACE_WHEEL_SILHOUETTE) {
    if (s.x > left && s.x < right) worst = Math.max(worst, s.floorY);
  }
  return worst;
}

/**
 * The fraction of `rect`'s height the driver can actually see (0 = wholly
 * behind the wheel, 1 = wholly clear). Fractional rather than boolean because
 * the frames are fractional: the telltale rail is not absent, it is a sliver,
 * and „the top 20 % of a lamp" is a different engineering problem from „no
 * lamp" even though the founder reads both as nothing.
 */
export function faceVisibleFraction(rect: FaceRect): number {
  if (!(rect.h > 0)) return 0;
  const bottom = rect.cy - rect.h / 2;
  const top = rect.cy + rect.h / 2;
  const floor = faceWorstFloorY(rect);
  if (floor <= bottom) return 1;
  if (floor >= top) return 0;
  return (top - floor) / rect.h;
}

/** Wholly clear of the wheel — the only state in which a value can be READ
 *  rather than guessed at from a sliver. */
export function faceElementIsVisible(rect: FaceRect): boolean {
  return faceVisibleFraction(rect) >= 1;
}

/**
 * The INK box inside a character CELL, which is what the driver's eye is
 * actually looking for.
 *
 * „A QUAD IS NOT A GLYPH, and forgetting that is a repeat offence in this
 * file" — the R2 note says so about size, and it is just as true about
 * occlusion. The speed digits' 96-unit cells reach down to y 28, which is
 * BEHIND the boss (floor +41 at x −9); their 54 units of ink stop at y 49 and
 * clear it. Judging the cell would report the one readout the founder has
 * always been able to read as hidden, which is the false-refusal direction.
 */
export function faceInkRect(cell: FaceRect): FaceRect {
  return {
    cx: cell.cx,
    cy: cell.cy,
    w: cell.w * CHAR_INK_W_FRACTION,
    h: cell.h * CHAR_INK_H_FRACTION,
  };
}

/** The telltale rail's slot i as a face rect (glyph cell, not halo). */
export function lampGlyphRect(i: number): FaceRect {
  return { cx: lampSlotX(i), cy: LAMP_CY, w: LAMP_CELL, h: LAMP_CELL };
}

// ---------------------------------------------------------------------------
// Hairlines — the other half of doc 83's elevation grammar
// ---------------------------------------------------------------------------

/** Rule above the telltale rail (full width, inset from the bezel). */
export const RULE_Y = -70;
export const RULE_HALF_W = 236;
export const RULE_THICK = 1.5;
/** Vertical rule dividing the speed readout from the selector letter. Kept in
 *  the clear right panel so it is a rule the driver can actually see. */
export const DIVIDER_X = 162;
export const DIVIDER_Y0 = 22;
export const DIVIDER_Y1 = 122;

// ---------------------------------------------------------------------------
// Texture atlas — ONE 1024×512 canvas every emissive quad samples
// ---------------------------------------------------------------------------
//
// The whole face (glyphs, numerals, captions, halo, and a solid white patch the
// untextured quads sample) lives in one texture so the ticks, lamps, digits,
// captions and rules are a SINGLE draw call. The perf budget (perfBudget.ts:
// phone 70 draws / 250k tris) is why: this rebuild costs 3 draw calls total —
// housing, face atlas, needle — against the 2 the canvas cluster it replaces
// cost, and ~200 triangles.

export const ATLAS_W = 1024;
export const ATLAS_H = 512;

/** A cell in atlas PIXELS, top-left origin (canvas convention). */
export interface AtlasCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const GLYPH_CELL = 128;
/** Row 0: the eight telltale glyphs, in LAMP_KEYS order. */
export function glyphCell(key: LampKey): AtlasCell {
  const i = LAMP_KEYS.indexOf(key);
  return { x: i * GLYPH_CELL, y: 0, w: GLYPH_CELL, h: GLYPH_CELL };
}

/** Row 1: the mono character strip the digits and the gear letter sample. */
export const CHAR_SET = "0123456789PRNDM ";
export const CHAR_CELL_W = 64;
export const CHAR_CELL_H = 128;
export function charCell(ch: string): AtlasCell {
  const i = CHAR_SET.indexOf(ch);
  // Unknown characters render as the blank cell — a readout can never draw
  // garbage geometry just because an upstream label changed shape.
  const idx = i < 0 ? CHAR_SET.length - 1 : i;
  return { x: idx * CHAR_CELL_W, y: 128, w: CHAR_CELL_W, h: CHAR_CELL_H };
}

/**
 * Row 2: the two word cells.
 *
 * R1 shrank both. They were 256- and 320-wide cells holding 90- and 170-pixel
 * words, so a third to a half of each quad was transparent margin and the type
 * inside it rendered at a THIRD of the size the quad's height implied — „км/ч"
 * came out of the first cockpit render as a 3-pixel smudge. The cells are now
 * cut close to the ink and the painter fills them, so quad height means glyph
 * height for these two exactly as it does for the character strip.
 */
export const UNIT_CELL: AtlasCell = { x: 0, y: 256, w: 128, h: 64 };
export const MARK_CELL: AtlasCell = { x: 256, y: 256, w: 224, h: 64 };

/** Row 3: the radial halo, and the solid-white patch untextured quads use. */
export const HALO_CELL: AtlasCell = { x: 0, y: 320, w: 128, h: 128 };
export const WHITE_CELL: AtlasCell = { x: 160, y: 320, w: 32, h: 32 };

/**
 * Cell → UV rect, flipping to three's bottom-left origin. A half-texel inset
 * on every side stops bilinear filtering from bleeding a neighbouring cell into
 * a glyph — at reel scale one bled texel is a visible smear on the lamp edge.
 */
export function cellUv(cell: AtlasCell): { u0: number; v0: number; u1: number; v1: number } {
  const ix = 0.5 / ATLAS_W;
  const iy = 0.5 / ATLAS_H;
  return {
    u0: cell.x / ATLAS_W + ix,
    u1: (cell.x + cell.w) / ATLAS_W - ix,
    // Canvas y grows down, UV v grows up.
    v0: 1 - (cell.y + cell.h) / ATLAS_H + iy,
    v1: 1 - cell.y / ATLAS_H - iy,
  };
}

// ---------------------------------------------------------------------------
// Palette — doc 83's cluster tokens resolved to literals
// ---------------------------------------------------------------------------
//
// WebGL vertex colours and a 2D canvas cannot read CSS custom properties, so the
// [data-surface="cluster"] block of globals.css is transcribed here. Keep in
// sync with that block; these are the same hexes, not new ones.

export const CLUSTER_PALETTE = {
  /** --background: cockpit black with a cool cast. */
  ground: "#05070c",
  /** --surface / --surface-2: the deliberately shallow fill steps. */
  panel: "#0a0e16",
  raised: "#111724",
  /** --border / --border-strong: quiet rules. */
  rule: "#1a2130",
  ruleStrong: "#2b3547",
  /** --control-edge: the one edge that must be seen. */
  edge: "#5b6d84",
  /** --foreground / --muted. */
  ink: "#e8eef8",
  inkMuted: "#8fa0b8",
  /** --accent: emission, not fill. */
  accent: "#48a9ff",
  accentSoft: "#8ecbff",
  /** --success / --warning / --danger. */
  go: "#3ee095",
  caution: "#ffc24b",
  warn: "#ff6a58",
} as const;
