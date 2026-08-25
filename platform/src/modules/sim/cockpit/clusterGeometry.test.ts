// Geometry contracts of the 3D „Виток" cluster.
//
// Two things are pinned here, and both are things that break silently.
//
// COST. The cluster is chrome that draws in every sim frame and in every
// recorded reel, on a phone budget of 70 draws / 250k tris (perfBudget.ts). It
// is three meshes and ~100 triangles; if someone later gives each lamp its own
// material that stays invisible on a desktop and eats the phone.
//
// DRAW ORDER. In the reel overlay the cluster renders with depth-test OFF (it
// is pinned in front of the camera), so within a mesh the SUBMISSION ORDER is
// the only thing deciding what covers what. A halo emitted after its glyph
// would paint over the glyph and the founder's belt warning would become a red
// smudge — the exact failure the rebuild exists to fix.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIGIT_ATLAS_CELL_H,
  buildClusterFaceMesh,
  buildClusterHousingMesh,
  buildClusterNeedleMesh,
  hexRgba,
  writeQuadColor,
  writeQuadUv,
} from "./clusterGeometry";
import {
  ATLAS_H,
  ATLAS_W,
  CHAR_CELL_H,
  CHAR_CELL_W,
  CLUSTER_PALETTE,
  DIAL_CX,
  DIAL_CY,
  DIAL_NUM_CHAR_W,
  DIAL_NUM_R,
  DIAL_NUM_TRACK,
  DIGIT_COUNT,
  DIGIT_GAP,
  DIGIT_H,
  DIGIT_W,
  DIGITS_CX,
  DIGITS_CY,
  FACE_H,
  FACE_W,
  GEAR_CX,
  GEAR_CY,
  GEAR_H,
  GEAR_W,
  LAMP_CELL,
  LAMP_CY,
  LAMP_HALO,
  LAMP_KEYS,
  LAMP_PITCH,
  TICK_COUNT,
  TICK_R_INNER,
  UNIT_CX,
  UNIT_W,
  cellUv,
  charCell,
  dialAngleRad,
  glyphCell,
  lampSlotX,
  tickNumeral,
  tickSpeedKmh,
  DIAL_MAX_KMH,
  CHAR_INK_H_FRACTION,
  CHAR_INK_W_FRACTION,
  DIAL_NUMERALS_MIN_FACE_CSS_PX,
  DIAL_NUM_CHAR_H,
  GLANCE_FLOOR_CSS_PX,
  dialNumeralsLegibleAt,
  inkHeightCssPx,
} from "./clusterLayout";
import { PERF_BUDGETS } from "../environment/perfBudget";

const face = buildClusterFaceMesh();
const housing = buildClusterHousingMesh();
const needle = buildClusterNeedleMesh();

/** Every mesh is an indexed triangle list of quads: 4 verts / 6 indices each. */
function assertWellFormed(m: {
  positions: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  quadCount: number;
}) {
  expect(m.positions.length).toBe(m.quadCount * 4 * 3);
  expect(m.colors.length).toBe(m.quadCount * 4 * 4);
  expect(m.indices.length).toBe(m.quadCount * 6);
  for (const i of m.indices) expect(i).toBeLessThan(m.quadCount * 4);
  for (const v of m.positions) expect(Number.isFinite(v)).toBe(true);
}

describe("mesh shape", () => {
  it("all three meshes are well-formed indexed quad lists", () => {
    assertWellFormed(face);
    assertWellFormed(housing);
    assertWellFormed(needle);
    expect(face.uvs.length).toBe(face.quadCount * 4 * 2);
    expect(needle.uvs.length).toBe(needle.quadCount * 4 * 2);
  });

  it("the face carries a quad for every element the readout can drive", () => {
    expect(face.tickQuad).toHaveLength(TICK_COUNT);
    expect(face.digitQuad).toHaveLength(DIGIT_COUNT);
    expect(Object.keys(face.lampGlyphQuad).sort()).toEqual([...LAMP_KEYS].sort());
    expect(Object.keys(face.lampHaloQuad).sort()).toEqual([...LAMP_KEYS].sort());
    // Every driven quad index must be a real, distinct quad — an aliased index
    // would make two elements light up together.
    const driven = [
      ...face.tickQuad,
      ...face.digitQuad,
      face.gearQuad,
      ...Object.values(face.lampGlyphQuad),
      ...Object.values(face.lampHaloQuad),
    ];
    expect(new Set(driven).size).toBe(driven.length);
    for (const q of driven) expect(q).toBeLessThan(face.quadCount);
  });
});

describe("perf budget", () => {
  it("the whole cluster is 3 draw calls and ~100 triangles", () => {
    // Housing · atlas face · needle. The face is ONE draw because ticks, lamps,
    // halos, digits, captions and rules all share the single atlas.
    const DRAW_CALLS = 3;
    const triangles = (face.quadCount + housing.quadCount + needle.quadCount) * 2;
    // `low` is the phone column (Galaxy A16 / Redmi Note): 70 draws / 250k tris.
    const phone = PERF_BUDGETS.low;

    expect(triangles).toBeLessThan(400);
    // Against the phone column: a rounding error in both budgets.
    expect(DRAW_CALLS / phone.drawCalls).toBeLessThan(0.05);
    expect(triangles / phone.triangles).toBeLessThan(0.005);
  });
});

describe("draw order (depth-test is OFF in the reel overlay)", () => {
  it("every telltale halo is submitted BEFORE its glyph", () => {
    // Otherwise the soft halo paints over the icon and the warning loses its
    // shape — a red blob instead of a belt.
    for (const key of LAMP_KEYS) {
      expect(face.lampHaloQuad[key]).toBeLessThan(face.lampGlyphQuad[key]);
    }
  });

  it("ALL halos precede ALL glyphs, so neighbouring lamps cannot bleed over each other", () => {
    const lastHalo = Math.max(...Object.values(face.lampHaloQuad));
    const firstGlyph = Math.min(...Object.values(face.lampGlyphQuad));
    expect(lastHalo).toBeLessThan(firstGlyph);
  });

  it("hairlines and ticks sit under the telltales and the text", () => {
    // The rules are emitted first of all; the readout text last.
    const firstHalo = Math.min(...Object.values(face.lampHaloQuad));
    for (const t of face.tickQuad) expect(t).toBeLessThan(firstHalo);
    for (const d of face.digitQuad) expect(d).toBeGreaterThan(firstHalo);
    expect(face.gearQuad).toBeGreaterThan(firstHalo);
  });
});

describe("layout legibility", () => {
  it("a lit lamp's halo is larger than its glyph — that is what makes it a warning", () => {
    expect(LAMP_HALO).toBeGreaterThan(LAMP_CELL);
  });

  it("adjacent halos never overlap", () => {
    // Two overlapping halos would read as one wide glow and the driver could
    // not tell WHICH lamp is lit.
    expect(LAMP_PITCH).toBeGreaterThanOrEqual(LAMP_HALO);
  });

  it("the telltale rail fits inside the face plate", () => {
    const outer = Math.abs(lampSlotX(0)) + LAMP_HALO / 2;
    expect(outer).toBeLessThanOrEqual(FACE_W / 2);
    expect(Math.abs(LAMP_CY) + LAMP_HALO / 2).toBeLessThanOrEqual(FACE_H / 2);
  });

  it("every face vertex lands on the face plate", () => {
    // A quad hanging off the plate would float in mid-air over the cabin.
    for (let i = 0; i < face.positions.length; i += 3) {
      expect(Math.abs(face.positions[i])).toBeLessThanOrEqual(FACE_W / 2);
      expect(Math.abs(face.positions[i + 1])).toBeLessThanOrEqual(FACE_H / 2);
    }
  });
});

describe("driver's-eye legibility", () => {
  // R1. The first build of this cluster was authored without ever being
  // rendered, and the frame that finally got taken from the driver's seat said
  // the speed was unreadable: the exact readout sat at the dial hub, behind the
  // steering-wheel rim, at ~60 % of the gear letter's size, under the needle.
  // The numbers below are MEASURED off that 1100×900 frame, and they are the
  // reason the layout looks the way it does — so they are pinned here rather
  // than left as a comment somebody re-derives by eye.
  //
  // If the seat, the camera or the cabin GLB moves, these will fail. That is
  // the correct outcome: re-render, re-measure, and update them together. What
  // must never happen again is the readout drifting back under the wheel with
  // every unit test still green.

  /** Below this the rim and column shroud hide the face outright. */
  const CLEAR_Y = -20;
  /** The wheel's upper boss additionally blanks this centre column below BOSS_Y. */
  const BOSS_X0 = -57;
  const BOSS_X1 = 55;
  const BOSS_Y = 45;
  /** A character cell's ink fills about 60 % of the quad's height, centred. */
  const INK = 0.6;

  const DIGITS_SPAN = DIGIT_COUNT * DIGIT_W + (DIGIT_COUNT - 1) * DIGIT_GAP;

  it("the speed number is at least as tall as the gear letter", () => {
    // The gear glyph is the benchmark: it is the ONE element the first cockpit
    // render proved legible. Half the founder's complaint was the speed, so the
    // speed has to meet it, not approach it.
    expect(DIGIT_H).toBeGreaterThanOrEqual(GEAR_H);
  });

  it("the speed digits keep the character cell's 1:2 aspect, so they are never stretched", () => {
    expect(DIGIT_H / DIGIT_W).toBeCloseTo(CHAR_CELL_H / CHAR_CELL_W, 5);
  });

  it.each([
    ["speed digits", DIGITS_CX, DIGITS_CY, DIGITS_SPAN, DIGIT_H * INK],
    ["gear letter", GEAR_CX, GEAR_CY, GEAR_W, GEAR_H * INK],
  ])("the %s is not hidden by the steering wheel", (_name, cx, cy, w, inkH) => {
    const bottom = cy - inkH / 2;
    expect(bottom).toBeGreaterThan(CLEAR_Y);
    const overlapsBoss = cx - w / 2 < BOSS_X1 && cx + w / 2 > BOSS_X0;
    if (overlapsBoss) expect(bottom).toBeGreaterThanOrEqual(BOSS_Y);
  });

  it("the speed and the gear read on ONE line", () => {
    // Two values on the same baseline is one horizontal scan for the driver;
    // stacked, it is two hunts around a wheel rim.
    expect(DIGITS_CY).toBe(GEAR_CY);
  });

  it("the speed block, the unit and the gear never overlap each other", () => {
    const spans: [string, number, number][] = [
      ["digits", DIGITS_CX - DIGITS_SPAN / 2, DIGITS_CX + DIGITS_SPAN / 2],
      ["unit", UNIT_CX - UNIT_W / 2, UNIT_CX + UNIT_W / 2],
      ["gear", GEAR_CX - GEAR_W / 2, GEAR_CX + GEAR_W / 2],
    ];
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i][1]).toBeGreaterThan(spans[i - 1][2]);
    }
    // …and the whole row stays on the plate.
    expect(spans[spans.length - 1][2]).toBeLessThanOrEqual(FACE_W / 2);
  });
});

describe("dial", () => {
  const labelWidth = (t: string) => (t.length - 1) * DIAL_NUM_TRACK + DIAL_NUM_CHAR_W;

  it("carries numerals — a scale without numbers is not a speedometer", () => {
    const labels = Array.from({ length: TICK_COUNT }, (_, i) => tickNumeral(i)).filter(Boolean);
    expect(labels.length).toBeGreaterThanOrEqual(4);
    expect(labels[0]).toBe("0");
    expect(labels.at(-1)).toBe(String(DIAL_MAX_KMH));
  });

  it("no two dial numerals can collide on their ring", () => {
    // The first attempt labelled every major tick and rendered „6089 00" where
    // 60/80/100 should have been — nine labels on a 48-unit ring are narrower
    // apart than „160" is wide. Arithmetic catches that; eyes caught it late.
    const placed: { x: number; y: number; half: number }[] = [];
    for (let i = 0; i < TICK_COUNT; i++) {
      const t = tickNumeral(i);
      if (!t) continue;
      const a = dialAngleRad(tickSpeedKmh(i));
      placed.push({
        x: DIAL_CX + Math.cos(a) * DIAL_NUM_R,
        y: DIAL_CY + Math.sin(a) * DIAL_NUM_R,
        half: labelWidth(t) / 2,
      });
    }
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i - 1];
      const b = placed[i];
      const gap = Math.hypot(b.x - a.x, b.y - a.y) - (a.half + b.half);
      expect(gap).toBeGreaterThan(0);
    }
  });

  it("the numeral ring stays inside the tick band", () => {
    // A numeral running out through its own scale is worse than no numeral.
    let widest = 0;
    for (let i = 0; i < TICK_COUNT; i++) {
      const t = tickNumeral(i);
      if (t) widest = Math.max(widest, labelWidth(t) / 2);
    }
    expect(DIAL_NUM_R + widest).toBeLessThanOrEqual(TICK_R_INNER);
  });

  it("0 km/h and full scale sweep 270° anticlockwise", () => {
    expect((dialAngleRad(0) * 180) / Math.PI).toBeCloseTo(225, 6);
    expect((dialAngleRad(DIAL_MAX_KMH) * 180) / Math.PI).toBeCloseTo(-45, 6);
  });

  it("the needle angle is monotonic and clamps outside the scale", () => {
    // A needle that wrapped past full scale would point at a LOW speed — the
    // one lie a speedometer must never tell.
    expect(dialAngleRad(DIAL_MAX_KMH * 2)).toBeCloseTo(dialAngleRad(DIAL_MAX_KMH), 10);
    expect(dialAngleRad(-40)).toBeCloseTo(dialAngleRad(40), 10);
    let prev = dialAngleRad(0);
    for (let v = 1; v <= DIAL_MAX_KMH; v++) {
      const a = dialAngleRad(v);
      expect(a).toBeLessThan(prev + 1e-9);
      prev = a;
    }
  });

  it("the needle is built pointing along +x so its rotation IS the dial angle", () => {
    // The component parks the needle at the dial centre and sets rotation.z =
    // dialAngleRad(speed). If the blade were built at any other angle the
    // needle would disagree with its own ticks at every speed.
    let maxX = -Infinity;
    let yAtMaxX = 0;
    for (let i = 0; i < needle.positions.length; i += 3) {
      if (needle.positions[i] > maxX) {
        maxX = needle.positions[i];
        yAtMaxX = needle.positions[i + 1];
      }
    }
    expect(maxX).toBeGreaterThan(0);
    expect(Math.abs(yAtMaxX)).toBeLessThan(maxX * 0.1);
  });
});

describe("atlas UVs", () => {
  it("every cell maps inside the texture", () => {
    const cells = [
      ...LAMP_KEYS.map((k) => glyphCell(k)),
      ...[..."0123456789PRNDM "].map((c) => charCell(c)),
    ];
    for (const cell of cells) {
      const uv = cellUv(cell);
      for (const v of [uv.u0, uv.u1, uv.v0, uv.v1]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(uv.u1).toBeGreaterThan(uv.u0);
      expect(uv.v1).toBeGreaterThan(uv.v0);
    }
  });

  it("cells are inset by half a texel so filtering cannot bleed a neighbour", () => {
    // At reel scale one bled texel is a visible smear on a lamp edge.
    const cell = glyphCell("belt");
    const uv = cellUv(cell);
    expect(uv.u0).toBeGreaterThan(cell.x / ATLAS_W);
    expect(uv.u1).toBeLessThan((cell.x + cell.w) / ATLAS_W);
    expect(uv.v1).toBeLessThan(1 - cell.y / ATLAS_H);
  });

  it("the character strip keeps the aspect the digit quads were sized against", () => {
    // DIGIT_ATLAS_CELL_H is the atlas contract the digit/gear quads assume. If
    // someone re-lays the atlas and changes the character cell's proportions,
    // the numerals silently render stretched — legible-ish on a desktop, mush
    // in a 1280×720 reel. Cheap to pin, invisible to catch by eye.
    expect(DIGIT_ATLAS_CELL_H).toBe(CHAR_CELL_H);
    const cell = charCell("8");
    expect(cell.h).toBe(DIGIT_ATLAS_CELL_H);
    // The quad is 36×54 design units; the cell it samples must be taller than
    // wide in the same sense, or the glyph is squashed across the cell.
    expect(cell.h / cell.w).toBeGreaterThan(1);
  });

  it("an unknown character resolves to the blank cell, never to garbage", () => {
    // An upstream gear label changing shape must not draw a random glyph.
    expect(charCell("%")).toEqual(charCell(" "));
    expect(charCell("z")).toEqual(charCell(" "));
  });
});

describe("doc 83 palette sync", () => {
  // clusterLayout.ts transcribes the [data-surface="cluster"] tokens as literals
  // because WebGL vertex colours cannot read CSS custom properties. That
  // transcription is a copy, and copies drift — the marketing surface gets
  // retuned and the cluster quietly stops being the same instrument. The whole
  // point of the rebuild is that the cockpit IS the brand's visual metaphor, so
  // the drift is worth a test rather than a comment asking nicely.
  const css = readFileSync(
    resolve(__dirname, "../../../app/globals.css"),
    "utf8",
  );
  const block = css.slice(css.indexOf('[data-surface="cluster"]'));
  const tokenValue = (name: string) => {
    const m = block.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
    return m?.[1]?.toLowerCase();
  };

  it.each([
    ["--background", CLUSTER_PALETTE.ground],
    ["--surface", CLUSTER_PALETTE.panel],
    ["--surface-2", CLUSTER_PALETTE.raised],
    ["--border", CLUSTER_PALETTE.rule],
    ["--border-strong", CLUSTER_PALETTE.ruleStrong],
    ["--control-edge", CLUSTER_PALETTE.edge],
    ["--foreground", CLUSTER_PALETTE.ink],
    ["--muted", CLUSTER_PALETTE.inkMuted],
    ["--accent", CLUSTER_PALETTE.accent],
    ["--accent-soft", CLUSTER_PALETTE.accentSoft],
    ["--success", CLUSTER_PALETTE.go],
    ["--warning", CLUSTER_PALETTE.caution],
    ["--danger", CLUSTER_PALETTE.warn],
  ])("%s matches the transcribed literal", (token, literal) => {
    expect(tokenValue(token)).toBe(literal.toLowerCase());
  });
});

describe("per-frame writers", () => {
  it("writeQuadColor paints exactly its own quad's four vertices", () => {
    const colors = new Float32Array(3 * 4 * 4);
    writeQuadColor(colors, 1, hexRgba("#ff6a58", 0.5));
    // Quad 0 and quad 2 untouched — a writer that ran long would light the
    // wrong lamp.
    for (let i = 0; i < 16; i++) expect(colors[i]).toBe(0);
    for (let i = 32; i < 48; i++) expect(colors[i]).toBe(0);
    for (let k = 0; k < 4; k++) {
      expect(colors[16 + k * 4]).toBeCloseTo(1, 5);
      expect(colors[16 + k * 4 + 3]).toBeCloseTo(0.5, 5);
    }
  });

  it("writeQuadUv re-points a quad at another atlas cell in build order", () => {
    // The digit rewrite must produce byte-identical UVs to what the builder
    // would have emitted for that character, or digits render sheared.
    const uvs = new Float32Array(2 * 4 * 2);
    const target = cellUv(charCell("7"));
    writeQuadUv(uvs, 1, target);
    expect(Array.from(uvs.slice(8))).toEqual([
      target.u0,
      target.v0,
      target.u1,
      target.v0,
      target.u1,
      target.v1,
      target.u0,
      target.v1,
    ]);
    for (let i = 0; i < 8; i++) expect(uvs[i]).toBe(0);
  });

  /**
   * THE PALETTE REACHES THE GPU IN THE RIGHT COLOUR SPACE
   * (sc-vp-telltale-red:622bf269, critical — 2026-08-25).
   *
   * This test used to assert `warn.g ≈ 0x6a / 255`, i.e. the RAW sRGB
   * fraction, and it passed on the build the corpus photographed. Three never
   * converts a raw BufferAttribute, so that fraction went out as LINEAR and
   * came back through the renderer's linear→sRGB output encode: measured on
   * `.audit-frames/sweep161/sc-vp-readiness/mobile-right/04-t102s.png`, ground
   * #05070c rendered (38,46,61) and INK_FORE #e8eef8 rendered (245,247,252) —
   * both exactly what encoding the fraction a second time predicts. warn
   * #ff6a58 arrived pale salmon and caution #ffc24b pale cream, which is the
   * red-versus-yellow triage sc-vp-telltale-red's whole briefing is built on.
   *
   * So the assertion is the ROUND TRIP rather than the parse. `encode` below
   * is the renderer's own transfer function written out independently of the
   * decoder under test, so dropping the conversion in `hexRgba` cannot make
   * both sides move together and pass.
   */
  it("hexRgba survives the renderer's own encode, byte for byte", () => {
    // Three's linear→sRGB output encode (the inverse of what hexRgba applies).
    const encode = (c: number) =>
      c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    const byte = (c: number) => Math.round(encode(c) * 255);

    for (const [hex, rgb] of [
      ["#ff6a58", [0xff, 0x6a, 0x58]], // warn — the STOP NOW lamp
      ["#ffc24b", [0xff, 0xc2, 0x4b]], // caution — the carry-on-to-a-garage lamp
      ["#05070c", [0x05, 0x07, 0x0c]], // the housing ground that arrived mid slate
      ["#e8eef8", [0xe8, 0xee, 0xf8]], // INK_FORE, the second exact match
    ] as const) {
      const c = hexRgba(hex);
      expect({ hex, rgb: [byte(c.r), byte(c.g), byte(c.b)] }).toEqual({ hex, rgb: [...rgb] });
    }
  });

  it("black and white are fixed points, and alpha is not a colour", () => {
    // The two the shipped test already pinned: 0 and 1 are fixed points of the
    // transfer function, so this half is unchanged by the repair above.
    expect(hexRgba("#ffffff")).toEqual({ r: 1, g: 1, b: 1, a: 1 });
    expect(hexRgba("#000000", 0)).toEqual({ r: 0, g: 0, b: 0, a: 0 });
    // Opacity is coverage, not light: converting it would fade every halo.
    expect(hexRgba("#ff6a58", 0.42).a).toBe(0.42);
  });

  it("the conversion moves the two lamp tones APART, not together", () => {
    // WHAT THIS DOES AND DOES NOT SAY. An earlier version asserted
    // `caution.g - warn.g > 0.35` under the title „far enough apart to be
    // TRIAGED", and a verifier was right to refuse the title: 0.35 is a gap in
    // LINEAR light, and linear is further from perceptual uniformity than sRGB
    // is, so a linear threshold is not evidence that a student can tell red
    // from amber. It was a mutation detector wearing a legibility claim.
    //
    // So it says the thing it can prove. Green is the channel red and amber
    // separate in. The authored hexes are 0x6a and 0xc2 apart — a fixed
    // distance in the space they were CHOSEN in — and the question the repair
    // turns on is which way the missing decode moved that pair. It moved them
    // together: without the conversion the raw fractions go to the GPU and come
    // back through the renderer's encode washed out, which is the pale salmon
    // and pale cream measured on the frame. With it, the separation is wider
    // than the authored one. Strictly greater, so dropping the decode (both
    // sides collapse to the raw gap, exactly equal) fails here.
    //
    // Legibility at the size the cabin mount renders a lamp — 28 design units,
    // ≈ 9 CSS px — is a DIFFERENT question and is still open; it is recorded on
    // `InstrumentCluster.tsx` with the glyph half of the same finding.
    const AUTHORED_GREEN_GAP = (0xc2 - 0x6a) / 255;
    const warn = hexRgba(CLUSTER_PALETTE.warn);
    const caution = hexRgba(CLUSTER_PALETTE.caution);
    expect(caution.g - warn.g).toBeGreaterThan(AUTHORED_GREEN_GAP);
  });
});

// ---------------------------------------------------------------------------
// R2 — THE TESTS THAT WOULD HAVE CAUGHT IT
// ---------------------------------------------------------------------------
//
// The dial already had two collision tests and both PASSED on the build the
// founder photographed, because both of them measure QUADS. The quad is 16
// units wide; the ink inside it is 14. Every question anybody had asked about
// this ring was asked in the wrong units.
describe("dial numerals — legibility, not just collision", () => {
  it("the characters of ONE label are laid down touching, in INK", () => {
    // THIS IS THE «120» → «12B» DEFECT, AS ARITHMETIC. `DIAL_NUM_TRACK` is the
    // advance between two characters of the same label; the ink is
    // CHAR_INK_W_FRACTION of the CHAR quad. Subtract and there is nothing left
    // between two digits — measured on the deployed build at −0.20…+0.08 CSS px
    // across five labels, i.e. the two glyphs are one shape.
    //
    // The test is deliberately an ASSERTION OF THE DEFECT rather than a
    // prohibition of it: the ring cannot be spaced any wider (five labels sit
    // 56 units of arc apart and «160» is already 44 wide), so this number is a
    // FACT ABOUT THE RING that the cabin mount has to route around, and if
    // someone later widens the track this test should fail and be re-thought
    // rather than quietly deleted.
    const inkGapUnits = DIAL_NUM_TRACK - DIAL_NUM_CHAR_W * CHAR_INK_W_FRACTION;
    expect(inkGapUnits).toBeCloseTo(0, 6);
  });

  it("estimates ink height to within 2 % of the live projection", () => {
    // Three rows MEASURED through the live camera on the deployed build
    // (wave12-cluster.mjs, iPhone 16). If this estimator drifts, every
    // threshold built on it is decoration. The residual is perspective across
    // the face, which the estimator deliberately does not model — so the bound
    // is relative and tight rather than `toBeCloseTo`'s ±0.5, which at 5.7 px
    // would be ±9 % and would not catch a real drift.
    const within2pc = (got: number, measured: number) =>
      expect(Math.abs(got - measured) / measured).toBeLessThan(0.02);
    within2pc(inkHeightCssPx(DIAL_NUM_CHAR_H, 161.01), 5.73);
    within2pc(inkHeightCssPx(DIAL_NUM_CHAR_H, 234.07), 8.34);
    within2pc(inkHeightCssPx(DIGIT_H, 161.01), 17.04);
  });

  it("needs a ~300 px face, and the cabin gives 158–234", () => {
    expect(DIAL_NUMERALS_MIN_FACE_CSS_PX).toBeGreaterThan(280);
    expect(DIAL_NUMERALS_MIN_FACE_CSS_PX).toBeLessThan(320);
    // The two cabin mounts the founder photographed.
    expect(dialNumeralsLegibleAt(157.86)).toBe(false); // landscape 852×393
    expect(dialNumeralsLegibleAt(234.07)).toBe(false); // portrait 393×852
    // The reel mount: 0.42 of a 1280 px frame, where they were signed off.
    expect(dialNumeralsLegibleAt(538)).toBe(true);
  });

  it("the DIGITAL readout clears the glance floor on the same face that fails", () => {
    // The whole argument in one assertion: identical atlas, identical material,
    // identical camera and distance. DIGIT_H is 96 units and DIAL_NUM_CHAR_H is
    // 32, and that ratio is the entire difference between a number the founder
    // reads and one he cannot.
    expect(inkHeightCssPx(DIGIT_H, 157.86)).toBeGreaterThan(GLANCE_FLOOR_CSS_PX);
    expect(inkHeightCssPx(DIAL_NUM_CHAR_H, 157.86)).toBeLessThan(GLANCE_FLOOR_CSS_PX / 1.8);
    expect(CHAR_INK_H_FRACTION).toBeGreaterThan(0.5);
  });

  it("the cabin mount emits no numeral quads, and loses nothing else", () => {
    const withNumerals = buildClusterFaceMesh();
    const without = buildClusterFaceMesh({ dialNumerals: false });
    // 0/40/80/120/160 = 1+2+2+3+3 = 11 character quads, and ELEVEN exactly:
    // the numerals are the only thing that goes.
    const dropped = withNumerals.quadCount - without.quadCount;
    expect(dropped).toBe(11);

    // Everything the dial is actually good at survives. The numerals are
    // emitted BEFORE the readouts, so every later handle shifts by exactly the
    // number dropped — which is a stronger statement than "unchanged": it says
    // nothing else was removed and nothing was reordered.
    expect(without.tickQuad).toEqual(withNumerals.tickQuad); // ticks come first
    expect(without.digitQuad).toEqual(withNumerals.digitQuad.map((q) => q - dropped));
    expect(without.gearQuad).toBe(withNumerals.gearQuad - dropped);
    for (const key of LAMP_KEYS) {
      expect(without.lampGlyphQuad[key]).toBe(withNumerals.lampGlyphQuad[key] - dropped);
      expect(without.lampHaloQuad[key]).toBe(withNumerals.lampHaloQuad[key] - dropped);
    }
  });
});
