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

export const DIAL_CX = -128;
export const DIAL_CY = 16;
/** Tick band: every tick starts at the inner radius; majors run further out. */
export const TICK_R_INNER = 70;
export const TICK_R_MINOR = 84;
export const TICK_R_MAJOR = 94;
export const TICK_HALF_W_MINOR = 1.6;
export const TICK_HALF_W_MAJOR = 3.2;

export const DIAL_MAX_KMH = 160;
export const DIAL_TICK_STEP_KMH = 10;
/** 0 km/h points to 225° (lower-left), full scale to −45° — a 270° sweep. */
export const DIAL_START_DEG = 225;
export const DIAL_SWEEP_DEG = 270;
/** 0, 10, … 160 → 17 ticks. */
export const TICK_COUNT = DIAL_MAX_KMH / DIAL_TICK_STEP_KMH + 1;

/** Needle blade, in design units from the dial centre. */
export const NEEDLE_R_TAIL = -18;
export const NEEDLE_R_TIP = 98;
export const NEEDLE_HALF_W_BASE = 4.5;
export const NEEDLE_HALF_W_TIP = 1.2;
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

/** Majors carry a numeral on a real cluster; here they are simply longer and
 *  brighter — the digital readout carries the number, so the dial stays clean
 *  (doc 83: precise thin rules, not decoration). */
export function tickIsMajor(i: number): boolean {
  return tickSpeedKmh(i) % 20 === 0;
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/** Digital speed: three mono cells inside the dial (the „hybrid" cluster — a
 *  sweeping needle for RATE, an exact number for VALUE). */
export const DIGIT_W = 36;
export const DIGIT_H = 54;
export const DIGIT_GAP = 2;
export const DIGIT_COUNT = 3;
export const DIGITS_CY = DIAL_CY + 6;

/** „км/ч" caption under the digits. */
export const UNIT_W = 72;
export const UNIT_H = 18;
export const UNIT_CY = DIAL_CY - 40;

/** The gear letter — the right half's anchor, deliberately huge: three of the
 *  five unreadable reels were gear/speed lessons with no visible instrument. */
export const GEAR_CX = 150;
export const GEAR_CY = 30;
export const GEAR_W = 76;
export const GEAR_H = 96;

/** „В И Т О К" wordmark under the gear (ADR-001: the fictional marque). */
export const MARK_CX = GEAR_CX;
export const MARK_CY = -42;
export const MARK_W = 120;
export const MARK_H = 18;

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
/** Vertical rule dividing dial half from readout half. */
export const DIVIDER_X = 40;
export const DIVIDER_Y0 = -60;
export const DIVIDER_Y1 = 108;

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

/** Row 2: the two word cells. */
export const UNIT_CELL: AtlasCell = { x: 0, y: 256, w: 256, h: 64 };
export const MARK_CELL: AtlasCell = { x: 256, y: 256, w: 320, h: 64 };

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
