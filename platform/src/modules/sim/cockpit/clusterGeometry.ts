/**
 * Instrument-cluster GEOMETRY — the cluster as buffers, built once, pure.
 *
 * The whole face is quads on a shared atlas (clusterLayout.ts), emitted into
 * ONE interleaved buffer so ticks + telltales + digits + captions + rules cost
 * a single draw call; the housing is a second buffer (untextured, vertex-lit by
 * baked colours) and the needle a third because it rotates. Three draw calls,
 * ~200 triangles — the perfBudget.ts phone column is 70 draws / 250k tris, so
 * the rebuild spends about 4 % of the draw budget it is allowed.
 *
 * WHY BAKED VERTEX COLOURS AND NOT LIGHTS. Doc 83 §3: on a near-black ground a
 * drop shadow is invisible, so elevation has to come from a lit top edge and a
 * hairline. Baking that into the chamfer's vertex colours makes the cluster
 * read identically in the cockpit (lit cabin) and in a camera-pinned reel
 * overlay (no cabin at all) — which is the entire point of the rebuild: the
 * founder must see the SAME instrument in both.
 *
 * QUAD ORDER IS LOAD-BEARING. In the reel overlay the cluster draws with
 * depth-test off (it is chrome pinned in front of the world), so within a mesh
 * the submission order decides what covers what. Everything below is emitted
 * back-to-front on purpose and the tests pin the ordering.
 */

import {
  BEZEL_W,
  BEZEL_Z,
  CHAR_CELL_H,
  DIAL_CX,
  DIAL_CY,
  DIAL_NUM_CHAR_H,
  DIAL_NUM_CHAR_W,
  DIAL_NUM_R,
  DIAL_NUM_TRACK,
  DIGIT_COUNT,
  DIGIT_GAP,
  DIGIT_H,
  DIGIT_W,
  DIGITS_CX,
  DIGITS_CY,
  DIVIDER_X,
  DIVIDER_Y0,
  DIVIDER_Y1,
  FACE_H,
  FACE_W,
  GEAR_CX,
  GEAR_CY,
  GEAR_H,
  GEAR_W,
  HALO_CELL,
  HOUSING_DEPTH,
  LAMP_CELL,
  LAMP_CY,
  LAMP_HALO,
  LAMP_KEYS,
  MARK_CELL,
  MARK_CX,
  MARK_CY,
  MARK_H,
  MARK_W,
  NEEDLE_HALF_W_BASE,
  NEEDLE_HALF_W_TIP,
  NEEDLE_R_TAIL,
  NEEDLE_R_TIP,
  RULE_HALF_W,
  RULE_THICK,
  RULE_Y,
  TICK_COUNT,
  TICK_HALF_W_MAJOR,
  TICK_HALF_W_MINOR,
  TICK_R_INNER,
  TICK_R_MAJOR,
  TICK_R_MINOR,
  UNIT_CELL,
  UNIT_CX,
  UNIT_CY,
  UNIT_H,
  UNIT_W,
  WHITE_CELL,
  cellUv,
  charCell,
  dialAngleRad,
  glyphCell,
  lampSlotX,
  tickIsMajor,
  tickNumeral,
  tickSpeedKmh,
  type LampKey,
} from "./clusterLayout";

/** rgba as unit floats — the vertex-colour buffer's element. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** "#rrggbb" → unit floats. Kept here (not in a shared util) because the
 *  cluster is the only consumer and the palette is a fixed table. */
export function hexRgba(hex: string, alpha = 1): Rgba {
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8) & 255) / 255,
    b: (n & 255) / 255,
    a: alpha,
  };
}

// ---------------------------------------------------------------------------
// Quad emitter
// ---------------------------------------------------------------------------

interface Builder {
  pos: number[];
  uv: number[];
  col: number[];
  idx: number[];
  quads: number;
}

function newBuilder(): Builder {
  return { pos: [], uv: [], col: [], idx: [], quads: 0 };
}

/**
 * Push one quad from four corners in CCW order as seen from +z (the driver's
 * side). Returns the quad's index — callers keep those indices so the frame
 * loop can rewrite exactly the vertices it owns.
 */
function pushQuad(
  b: Builder,
  corners: readonly [number, number, number][],
  uv: { u0: number; v0: number; u1: number; v1: number },
  color: Rgba,
): number {
  const base = b.quads * 4;
  // Corner k gets uv corner k: (u0,v0) (u1,v0) (u1,v1) (u0,v1).
  const us = [uv.u0, uv.u1, uv.u1, uv.u0];
  const vs = [uv.v0, uv.v0, uv.v1, uv.v1];
  for (let k = 0; k < 4; k++) {
    b.pos.push(corners[k][0], corners[k][1], corners[k][2]);
    b.uv.push(us[k], vs[k]);
    b.col.push(color.r, color.g, color.b, color.a);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  return b.quads++;
}

/** Axis-aligned rectangle centred on (cx, cy) at depth z. */
function pushRect(
  b: Builder,
  cx: number,
  cy: number,
  w: number,
  h: number,
  z: number,
  uv: { u0: number; v0: number; u1: number; v1: number },
  color: Rgba,
): number {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const y0 = cy - h / 2;
  const y1 = cy + h / 2;
  return pushQuad(
    b,
    [
      [x0, y0, z],
      [x1, y0, z],
      [x1, y1, z],
      [x0, y1, z],
    ],
    uv,
    color,
  );
}

function finish(b: Builder) {
  return {
    positions: new Float32Array(b.pos),
    uvs: new Float32Array(b.uv),
    colors: new Float32Array(b.col),
    indices: new Uint16Array(b.idx),
    quadCount: b.quads,
  };
}

// ---------------------------------------------------------------------------
// The face mesh — every emissive element, one atlas, one draw call
// ---------------------------------------------------------------------------

/** Depths in design units. Small, but enough that the cockpit camera sees the
 *  glyphs standing off the face rather than z-fighting it. */
const Z_RULE = 1;
const Z_TICK = 1;
const Z_HALO = 1.5;
const Z_GLYPH = 2.2;
const Z_TEXT = 2.2;

export interface ClusterFaceMesh {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  quadCount: number;
  /** Quad index of dial tick i (ascending speed) — rewritten as speed changes. */
  tickQuad: number[];
  lampHaloQuad: Record<LampKey, number>;
  lampGlyphQuad: Record<LampKey, number>;
  /** Quad index of digit cell i, left → right. UVs are re-pointed per readout. */
  digitQuad: number[];
  gearQuad: number;
}

/** Static ink colours (dynamic elements are overwritten every frame anyway). */
const INK_RULE = hexRgba("#1a2130", 1);
const INK_MUTED = hexRgba("#8fa0b8", 1);
const INK_FORE = hexRgba("#e8eef8", 1);
const INK_HIDDEN = hexRgba("#000000", 0);

export function buildClusterFaceMesh(): ClusterFaceMesh {
  const b = newBuilder();
  const white = cellUv(WHITE_CELL);
  const halo = cellUv(HALO_CELL);

  // 1 — hairlines first (doc 83's "precise thin rules"): they sit under
  //     everything, and on a near-black ground they are what says "instrument".
  pushRect(b, 0, RULE_Y, RULE_HALF_W * 2, RULE_THICK, Z_RULE, white, INK_RULE);
  pushRect(
    b,
    DIVIDER_X,
    (DIVIDER_Y0 + DIVIDER_Y1) / 2,
    RULE_THICK,
    DIVIDER_Y1 - DIVIDER_Y0,
    Z_RULE,
    white,
    INK_RULE,
  );

  // 2 — the dial tick band. Ticks are geometry, not a bitmap, so the arc can
  //     FILL with speed: the reel reads a rate even when it cannot resolve the
  //     needle. Colours are rewritten per frame from litTickCount.
  const tickQuad: number[] = [];
  for (let i = 0; i < TICK_COUNT; i++) {
    const a = dialAngleRad(tickSpeedKmh(i));
    const major = tickIsMajor(i);
    const r1 = major ? TICK_R_MAJOR : TICK_R_MINOR;
    const hw = major ? TICK_HALF_W_MAJOR : TICK_HALF_W_MINOR;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    // Tangent = radial rotated +90°, so (radial, tangent, +z) is right-handed
    // and the corner walk below is CCW from the driver's side.
    const tx = -dy;
    const ty = dx;
    tickQuad.push(
      pushQuad(
        b,
        [
          [DIAL_CX + dx * TICK_R_INNER - tx * hw, DIAL_CY + dy * TICK_R_INNER - ty * hw, Z_TICK],
          [DIAL_CX + dx * r1 - tx * hw, DIAL_CY + dy * r1 - ty * hw, Z_TICK],
          [DIAL_CX + dx * r1 + tx * hw, DIAL_CY + dy * r1 + ty * hw, Z_TICK],
          [DIAL_CX + dx * TICK_R_INNER + tx * hw, DIAL_CY + dy * TICK_R_INNER + ty * hw, Z_TICK],
        ],
        white,
        INK_RULE,
      ),
    );
  }

  // 2b — the dial NUMERALS, on a ring inside the tick band. R1: without these
  //      the dial is an arc of dashes and no speed can be read off it. They
  //      sample the same mono strip as the big readout, so the scale and the
  //      number are visibly the same typeface — one instrument, not two.
  for (let i = 0; i < TICK_COUNT; i++) {
    const label = tickNumeral(i);
    if (!label) continue;
    const a = dialAngleRad(tickSpeedKmh(i));
    const cx = DIAL_CX + Math.cos(a) * DIAL_NUM_R;
    const cy = DIAL_CY + Math.sin(a) * DIAL_NUM_R;
    // Centre the whole label on the ring point, then step across it.
    const x0 = cx - ((label.length - 1) * DIAL_NUM_TRACK) / 2;
    for (let k = 0; k < label.length; k++) {
      pushRect(
        b,
        x0 + k * DIAL_NUM_TRACK,
        cy,
        DIAL_NUM_CHAR_W,
        DIAL_NUM_CHAR_H,
        Z_TEXT,
        cellUv(charCell(label[k])),
        INK_MUTED,
      );
    }
  }

  // 3 — telltale halos, ALL of them before ANY glyph: the halo is what turns a
  //     lit lamp into a warning at reel scale, and it must sit behind its glyph.
  const lampHaloQuad = {} as Record<LampKey, number>;
  LAMP_KEYS.forEach((key, i) => {
    lampHaloQuad[key] = pushRect(
      b,
      lampSlotX(i),
      LAMP_CY,
      LAMP_HALO,
      LAMP_HALO,
      Z_HALO,
      halo,
      INK_HIDDEN,
    );
  });

  // 4 — the glyphs themselves (white-on-transparent in the atlas, tinted by
  //     vertex colour, so one cell serves lit and unlit).
  const lampGlyphQuad = {} as Record<LampKey, number>;
  LAMP_KEYS.forEach((key, i) => {
    lampGlyphQuad[key] = pushRect(
      b,
      lampSlotX(i),
      LAMP_CY,
      LAMP_CELL,
      LAMP_CELL,
      Z_GLYPH,
      cellUv(glyphCell(key)),
      INK_RULE,
    );
  });

  // 5 — the digital speed readout: three mono cells whose UVs are re-pointed
  //     into the atlas character strip as the number changes (no canvas redraw,
  //     no second texture — the cell IS the digit). R1: centred on DIGITS_CX
  //     across the clear top band, NOT on the dial hub where the wheel rim, the
  //     needle and the hub glow all sat on top of it.
  const digitQuad: number[] = [];
  const digitsSpan = DIGIT_COUNT * DIGIT_W + (DIGIT_COUNT - 1) * DIGIT_GAP;
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const cx = DIGITS_CX - digitsSpan / 2 + DIGIT_W / 2 + i * (DIGIT_W + DIGIT_GAP);
    digitQuad.push(
      pushRect(b, cx, DIGITS_CY, DIGIT_W, DIGIT_H, Z_TEXT, cellUv(charCell(" ")), INK_FORE),
    );
  }

  // 6 — the gear glyph, sized so a speed/gear lesson is legible from the chase
  //     camera (the three „unreadable" reels the founder listed).
  const gearQuad = pushRect(
    b,
    GEAR_CX,
    GEAR_CY,
    GEAR_W,
    GEAR_H,
    Z_TEXT,
    cellUv(charCell("D")),
    INK_FORE,
  );

  // 7 — captions last (they never change).
  pushRect(b, UNIT_CX, UNIT_CY, UNIT_W, UNIT_H, Z_TEXT, cellUv(UNIT_CELL), INK_MUTED);
  pushRect(b, MARK_CX, MARK_CY, MARK_W, MARK_H, Z_TEXT, cellUv(MARK_CELL), INK_RULE);

  return { ...finish(b), tickQuad, lampHaloQuad, lampGlyphQuad, digitQuad, gearQuad };
}

// ---------------------------------------------------------------------------
// The housing — the volume and the lit top edge
// ---------------------------------------------------------------------------

export interface ClusterHousingMesh {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  quadCount: number;
}

/**
 * Bezel + back box. Emitted back-to-front (rear panel → side walls → face plate
 * → chamfer → lit hairline) so the mesh is correct even with depth-test off.
 *
 * The chamfer is the whole trick: its OUTER edge is bright at the top and dark
 * at the bottom, so the rim reads as catching light from above. That is the one
 * cue doc 83 says carries elevation on a black ground.
 */
export function buildClusterHousingMesh(): ClusterHousingMesh {
  const b = newBuilder();
  const uv = cellUv(WHITE_CELL);
  const ground = hexRgba("#05070c", 1);
  const panel = hexRgba("#0a0e16", 1);
  const back = hexRgba("#02040a", 1);
  const edgeLit = hexRgba("#5b6d84", 1);
  const edgeSide = hexRgba("#2b3547", 1);
  const edgeDark = hexRgba("#0a0e16", 1);
  const litHair = hexRgba("#ffffff", 0.12);

  const ix = FACE_W / 2;
  const iy = FACE_H / 2;
  const ox = ix + BEZEL_W;
  const oy = iy + BEZEL_W;
  const zb = -HOUSING_DEPTH;

  // Rear panel.
  pushQuad(
    b,
    [
      [-ox, -oy, zb],
      [ox, -oy, zb],
      [ox, oy, zb],
      [-ox, oy, zb],
    ],
    uv,
    back,
  );
  // Side walls, outer rim (z = BEZEL_Z) back to the rear panel.
  const wall: [number, number][][] = [
    [
      [-ox, -oy],
      [ox, -oy],
    ], // bottom
    [
      [ox, oy],
      [-ox, oy],
    ], // top
    [
      [ox, -oy],
      [ox, oy],
    ], // right
    [
      [-ox, oy],
      [-ox, -oy],
    ], // left
  ];
  for (const [p, q] of wall) {
    pushQuad(
      b,
      [
        [p[0], p[1], zb],
        [q[0], q[1], zb],
        [q[0], q[1], BEZEL_Z],
        [p[0], p[1], BEZEL_Z],
      ],
      uv,
      back,
    );
  }

  // Face plate — the ground the emissive art sits on.
  pushQuad(
    b,
    [
      [-ix, -iy, 0],
      [ix, -iy, 0],
      [ix, iy, 0],
      [-ix, iy, 0],
    ],
    uv,
    ground,
  );

  // Chamfer: inner edge on the face plane (panel dark), outer edge proud.
  pushChamfer(b, uv, [-ix, -iy], [ix, -iy], [-ox, -oy], [ox, -oy], panel, edgeDark); // bottom
  pushChamfer(b, uv, [ix, iy], [-ix, iy], [ox, oy], [-ox, oy], panel, edgeLit); // top
  pushChamfer(b, uv, [ix, -iy], [ix, iy], [ox, -oy], [ox, oy], panel, edgeSide); // right
  pushChamfer(b, uv, [-ix, iy], [-ix, -iy], [-ox, oy], [-ox, -oy], panel, edgeSide); // left

  // The inset lit hairline along the top inner edge — one pixel of white at 12 %
  // (doc 83's --lit-edge-strong), never a white overlay.
  pushQuad(
    b,
    [
      [-ix + 6, iy - 3, 0.6],
      [ix - 6, iy - 3, 0.6],
      [ix - 6, iy - 1.4, 0.6],
      [-ix + 6, iy - 1.4, 0.6],
    ],
    uv,
    litHair,
  );

  return {
    positions: new Float32Array(b.pos),
    colors: new Float32Array(b.col),
    indices: new Uint16Array(b.idx),
    quadCount: b.quads,
  };
}

/** One chamfer strip: inner edge i0→i1 on the face plane, outer edge o0→o1 at
 *  z = BEZEL_Z. Winding follows the caller's inner-edge direction. */
function pushChamfer(
  b: Builder,
  uv: { u0: number; v0: number; u1: number; v1: number },
  i0: [number, number],
  i1: [number, number],
  o0: [number, number],
  o1: [number, number],
  innerColor: Rgba,
  outerColor: Rgba,
): void {
  const base = b.quads * 4;
  const corners: [number, number, number][] = [
    [i0[0], i0[1], 0],
    [i1[0], i1[1], 0],
    [o1[0], o1[1], BEZEL_Z],
    [o0[0], o0[1], BEZEL_Z],
  ];
  const cols = [innerColor, innerColor, outerColor, outerColor];
  const us = [uv.u0, uv.u1, uv.u1, uv.u0];
  const vs = [uv.v0, uv.v0, uv.v1, uv.v1];
  for (let k = 0; k < 4; k++) {
    b.pos.push(corners[k][0], corners[k][1], corners[k][2]);
    b.uv.push(us[k], vs[k]);
    b.col.push(cols[k].r, cols[k].g, cols[k].b, cols[k].a);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  b.quads++;
}

// ---------------------------------------------------------------------------
// The needle — its own mesh because it is the one thing that moves at frame rate
// ---------------------------------------------------------------------------

export interface ClusterNeedleMesh {
  positions: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  quadCount: number;
}

/** Built pointing along +x (dial angle 0) about its pivot; the component
 *  rotates it by dialAngleRad(speed) and parks it at the dial centre. */
export function buildClusterNeedleMesh(): ClusterNeedleMesh {
  const b = newBuilder();
  const halo = cellUv(HALO_CELL);
  const white = cellUv(WHITE_CELL);
  // Hub glow first (behind the blade), then the blade. Round, so the hub does
  // not visibly spin with the needle. Tightened in R1: at 34 units it bloomed
  // across the numeral ring the dial has now, and a glow that hides the scale
  // is decoration beating information.
  pushRect(b, 0, 0, 26, 26, 0, halo, hexRgba("#48a9ff", 0.45));
  pushQuad(
    b,
    [
      [NEEDLE_R_TAIL, -NEEDLE_HALF_W_BASE * 0.7, 0.4],
      [NEEDLE_R_TIP, -NEEDLE_HALF_W_TIP, 0.4],
      [NEEDLE_R_TIP, NEEDLE_HALF_W_TIP, 0.4],
      [NEEDLE_R_TAIL, NEEDLE_HALF_W_BASE * 0.7, 0.4],
    ],
    white,
    hexRgba("#e8eef8", 1),
  );
  return {
    positions: new Float32Array(b.pos),
    uvs: new Float32Array(b.uv),
    colors: new Float32Array(b.col),
    indices: new Uint16Array(b.idx),
    quadCount: b.quads,
  };
}

// ---------------------------------------------------------------------------
// Per-frame writers — the only things that touch the buffers after build
// ---------------------------------------------------------------------------

/** Overwrite one quad's four vertex colours in a packed rgba buffer. */
export function writeQuadColor(colors: Float32Array, quad: number, c: Rgba): void {
  const o = quad * 16;
  for (let k = 0; k < 4; k++) {
    colors[o + k * 4] = c.r;
    colors[o + k * 4 + 1] = c.g;
    colors[o + k * 4 + 2] = c.b;
    colors[o + k * 4 + 3] = c.a;
  }
}

/** Re-point one quad at a different atlas cell (the digit/gear rewrite). */
export function writeQuadUv(
  uvs: Float32Array,
  quad: number,
  uv: { u0: number; v0: number; u1: number; v1: number },
): void {
  const o = quad * 8;
  const us = [uv.u0, uv.u1, uv.u1, uv.u0];
  const vs = [uv.v0, uv.v0, uv.v1, uv.v1];
  for (let k = 0; k < 4; k++) {
    uvs[o + k * 2] = us[k];
    uvs[o + k * 2 + 1] = vs[k];
  }
}

/** The character strip's cell height is the atlas contract the digit quads
 *  assume; exported so a test can catch an atlas re-layout that silently
 *  stretches the numerals. */
export const DIGIT_ATLAS_CELL_H = CHAR_CELL_H;
