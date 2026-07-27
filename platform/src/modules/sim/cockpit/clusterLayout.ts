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
