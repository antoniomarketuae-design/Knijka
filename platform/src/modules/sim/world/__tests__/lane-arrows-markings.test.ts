/**
 * Lane-intent arrow paint battery (meta.scenario.laneArrows — builders/
 * markings.ts paintLaneArrows).
 *
 * The audit finding this closes: sc-ln-turn-lane-arrows (SN-04/JU-14) teaches
 * obeying painted lane arrows that were NEVER painted — the authored truth
 * lived only in meta. This battery pins the render on both shipped consumers:
 *  - ln-arrows-v1 (single edgeId): three glyph stations per lane over the
 *    authored [30, 150] span, clamped by the junction trim; the right/through/
 *    left glyphs land at the exact authored lane centres and bend the correct
 *    way (right = toward the curb, left = toward the осева);
 *  - rb-2lane-v1 (edgeIds[], roundabout vocab): every arm paints the outer
 *    nearExits (through+right) and inner farExits (left) glyphs, rotated with
 *    the arm — on a map whose unclassified arms paint NO other markings;
 *  - byte-identity: a district WITHOUT the meta adds zero geometry, and the
 *    arrowed build's buffers are the arrowless build's plus an appended
 *    suffix (the arrows paint LAST — nothing upstream moves);
 *  - determinism: identical buffers across rebuilds.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeNetwork } from "../builders/network";
import { buildMarkings, type MarkingBuildResult } from "../builders/markings";
import { CENTER_LINE_WIDTH_M, DASH_WIDTH_M, LANE_WIDTH_M } from "../builders/constants";
import { assertDistrict, type District, type MeshData } from "../types";

const EMPTY: ReadonlySet<string> = new Set();

function loadDistrict(id: string): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
    path.join(process.cwd(), "public", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
  }
  throw new Error(`${id}.json not found in ${candidates.join(", ")}`);
}

/** The same district with meta.scenario.laneArrows deleted (arrowless twin). */
function stripArrows(district: District): District {
  const twin = structuredClone(district);
  delete (twin.meta.scenario as Record<string, unknown>).laneArrows;
  return twin;
}

function markingsOf(district: District): MarkingBuildResult {
  return buildMarkings(district, analyzeNetwork(district), EMPTY, EMPTY);
}

interface Quad {
  cx: number;
  cy: number;
  wx: number;
  wy: number;
  minX: number;
  maxX: number;
}

/** Reconstruct quads from the 6-index groups (every marking primitive is a
 *  MeshAccumulator.quad — arrow heads are degenerate quads, same shape).
 *  World (x, MARKING_Y, -y) → district (x, y): districtY = -z. */
function quads(mesh: MeshData, fromIndex = 0): Quad[] {
  const p = mesh.positions;
  const idx = mesh.indices;
  const out: Quad[] = [];
  for (let i = fromIndex; i + 6 <= idx.length; i += 6) {
    const corners = [idx[i], idx[i + 1], idx[i + 2], idx[i + 5]].map((vi) => ({
      x: p[3 * (vi as number)],
      y: -p[3 * (vi as number) + 2],
    }));
    const xs = corners.map((c) => c.x as number);
    const ys = corners.map((c) => c.y as number);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    out.push({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, wx: maxX - minX, wy: maxY - minY, minX, maxX });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ln-arrows-v1 — the SN-04 drill's three-lane approach (single edgeId)
// ---------------------------------------------------------------------------

describe("ln-arrows-v1 — laneArrows paints the right|through|left glyphs on the south approach", () => {
  const district = loadDistrict("ln-arrows-v1");
  const built = markingsOf(district);
  const base = markingsOf(stripArrows(district));
  const builtMesh = built.markings.toMeshData();
  const baseMesh = base.markings.toMeshData();
  const arrows = quads(builtMesh, baseMesh.indices.length);

  // Stations: fromM 30 + glyph half 3.75, pitch 30 → geometry s 33.75|63.75|
  // 93.75 (s 123.75 is authored but falls past the junction trim: the drawn
  // line ends at 150 − 43.375 − 0.8 = 105.825). Edge runs (0,-150)→(0,0), so
  // district y = s − 150.
  const STATION_Y = [-116.25, -86.25, -56.25];
  /** Authored lane centres (laneId 0 = curb): right | through | left. */
  const LANE_X = [20.31, 12.19, 4.06];

  it("paints 24 arrow quads: 3 stations × (right 3 + through 2 + left 3)", () => {
    expect(built.laneArrowQuads).toBe(24);
    expect(base.laneArrowQuads).toBe(0);
    expect(arrows).toHaveLength(24);
  });

  it("every glyph sits inside the authored span, clamped by the junction trim", () => {
    for (const q of arrows) {
      expect(q.cy).toBeGreaterThan(-120.5); // span start (y −120) + glyph inset
      expect(q.cy).toBeLessThan(-52); // last station's head, well before the mouth
    }
  });

  it("plants one stem per lane per station, centred EXACTLY on the authored lane centre", () => {
    for (const x of LANE_X) {
      const stems = arrows.filter((q) => Math.abs(q.cx - x) < 0.01 && q.wx < 1.1 && q.wy > 4.5);
      expect(stems, `lane x=${x}`).toHaveLength(3);
      // One stem per station: stem centre = station − 1.275 (turn) / −1.25 (through).
      const ys = stems.map((s) => s.cy).sort((a, b) => a - b);
      ys.forEach((y, i) => expect(y).toBeCloseTo((STATION_Y[i] as number) - (x === 12.19 ? 1.25 : 1.275), 1));
    }
  });

  it("the curb lane's RIGHT glyph bends toward the curb, the LEFT toward the осева", () => {
    // Right glyph (lane x 20.31): bend + head quads sit EAST of the stem.
    const rightSide = arrows.filter((q) => q.cx > 20.31 + 0.5);
    expect(rightSide).toHaveLength(6); // (bend + head) × 3 stations
    expect(Math.max(...rightSide.map((q) => q.maxX))).toBeGreaterThan(22);
    // Left glyph (lane x 4.06): bend + head sit WEST of the stem.
    const leftSide = arrows.filter((q) => q.cx < 4.06 - 0.5);
    expect(leftSide).toHaveLength(6);
    expect(Math.min(...leftSide.map((q) => q.minX))).toBeLessThan(3);
    // Through glyph (lane x 12.19): everything stays on the lane centre.
    for (const q of arrows.filter((q) => Math.abs(q.cx - 12.19) < 2)) {
      expect(Math.abs(q.cx - 12.19)).toBeLessThan(0.01);
    }
  });

  it("appends AFTER the arrowless paint: the base buffers are a byte-identical prefix", () => {
    expect(builtMesh.positions.length).toBeGreaterThan(baseMesh.positions.length);
    expect(Array.from(builtMesh.positions.slice(0, baseMesh.positions.length))).toEqual(
      Array.from(baseMesh.positions),
    );
    expect(Array.from(builtMesh.indices.slice(0, baseMesh.indices.length))).toEqual(
      Array.from(baseMesh.indices),
    );
    // The suffix is exactly the arrow quads (4 verts / 6 indices each).
    expect(builtMesh.indices.length - baseMesh.indices.length).toBe(24 * 6);
    expect(built.markingQuads - base.markingQuads).toBe(24);
  });

  it("is deterministic: rebuilding paints identical buffers", () => {
    const again = markingsOf(district).markings.toMeshData();
    expect(again.positions.length).toBe(builtMesh.positions.length);
    expect(Array.from(again.positions)).toEqual(Array.from(builtMesh.positions));
  });
});

// ---------------------------------------------------------------------------
// rb-2lane-v1 — roundabout vocab over edgeIds[] (nearExits | farExits)
// ---------------------------------------------------------------------------

describe("rb-2lane-v1 — laneArrows paints every arm's approach glyphs, rotated with the arm", () => {
  const district = loadDistrict("rb-2lane-v1");
  const built = markingsOf(district);
  const base = markingsOf(stripArrows(district));
  const builtMesh = built.markings.toMeshData();
  const arrows = quads(builtMesh, base.markings.toMeshData().indices.length);

  it("paints 28 quads: 4 arms × (nearExits 4 + farExits 3), one station per arm", () => {
    // Span [30, 90], pitch 30 → stations s 33.75 and 63.75; the second falls
    // past the ring trim (line ends at 90 − 25.25 − 0.8 = 63.95 < 63.75+3.75).
    expect(built.laneArrowQuads).toBe(28);
    expect(arrows).toHaveLength(28);
  });

  it("the arms now carry lane lines UNDER the arrows — RE-BASELINED (doc 86 T1)", () => {
    // Was `expect(base.markingQuads).toBe(0)` under the title "the arrows are
    // the ONLY paint on this map (unclassified arms draw no lane lines)". Doc
    // 86 quotes that assertion as the tree's own pinned proof of T1: rb-2lane's
    // four `unclassified` 2+2 arms drew no осева and no divider, while
    // sc-rb-lane-choice grades CENTER_LINE_TOUCHED, POOR_LANE_KEEPING and
    // NOT_KEEPING_RIGHT on them — and the lesson's whole subject is WHICH LANE
    // to take into the ring. `unclassified` is now marked, so the base build
    // paints 60 quads: per arm, an осева plus one same-direction divider on
    // each bank. The property the assertion actually protected — the arrow pass
    // APPENDS and changes nothing before it — is the byte-identical-prefix test
    // above, which still holds exactly.
    expect(base.markingQuads).toBe(60);
    expect(base.laneArrowQuads).toBe(0);
    expect(builtMesh.indices.length).toBe((60 + 28) * 6);
  });

  it("…and the осева of every arm is the widest line on it (T16)", () => {
    // South/north arms run along y, so their осева is the x ≈ 0 line; east/west
    // arms run along x. Every centre quad is CENTER_LINE_WIDTH_M across its
    // road, every divider is DASH_WIDTH_M — the cue that tells a student which
    // of the three lines on his 2+2 has oncoming traffic behind it.
    const all = quads(base.markings.toMeshData(), 0);
    const ns = all.filter((q) => Math.abs(q.cy) > 26 && q.wx < 0.6);
    const ew = all.filter((q) => Math.abs(q.cx) > 26 && q.wy < 0.6);
    const centre = [
      ...ns.filter((q) => Math.abs(q.cx) < 0.5),
      ...ew.filter((q) => Math.abs(q.cy) < 0.5),
    ];
    const dividers = [
      ...ns.filter((q) => Math.abs(Math.abs(q.cx) - LANE_WIDTH_M) < 0.5),
      ...ew.filter((q) => Math.abs(Math.abs(q.cy) - LANE_WIDTH_M) < 0.5),
    ];
    expect(centre.length).toBeGreaterThan(0);
    expect(dividers.length).toBeGreaterThan(0);
    // A dash quad is DASH_LENGTH_M along the road and one stroke across it —
    // the stroke is always the smaller extent.
    for (const q of centre) expect(Math.min(q.wx, q.wy)).toBeCloseTo(CENTER_LINE_WIDTH_M, 3);
    for (const q of dividers) expect(Math.min(q.wx, q.wy)).toBeCloseTo(DASH_WIDTH_M, 3);
  });

  it("each arm carries 7 quads at its own rotated lane centres", () => {
    // Arm bands (arms run at |coord| 26..116): south y<-26, north y>26, etc.
    const south = arrows.filter((q) => q.cy < -26);
    const north = arrows.filter((q) => q.cy > 26);
    const east = arrows.filter((q) => q.cx > 26);
    const west = arrows.filter((q) => q.cx < -26);
    expect([south.length, north.length, east.length, west.length]).toEqual([7, 7, 7, 7]);
    // South arm travels north: right-of-travel = east → lanes at +12.19/+4.06.
    const southStems = south.filter((q) => q.wx < 1.1 && q.wy > 4.5);
    const southXs = southStems.map((q) => q.cx).sort((a, b) => a - b);
    expect(southXs).toHaveLength(2);
    expect(southXs[0]).toBeCloseTo(4.06, 3);
    expect(southXs[1]).toBeCloseTo(12.19, 3);
    // East arm travels west: right-of-travel = north → lanes at +12.19/+4.06 in y,
    // stems lie ALONG x (rotated glyph: wide in x, thin in y).
    const eastStems = east.filter((q) => q.wy < 1.1 && q.wx > 4.5);
    const eastYs = eastStems.map((q) => q.cy).sort((a, b) => a - b);
    expect(eastYs).toHaveLength(2);
    expect(eastYs[0]).toBeCloseTo(4.06, 3);
    expect(eastYs[1]).toBeCloseTo(12.19, 3);
    // The outer (nearExits) lane bends toward the curb: quads beyond the outer
    // lane centre on the south arm reach east of x = 12.19 + 0.5.
    expect(south.some((q) => q.cx > 12.19 + 0.5)).toBe(true);
    // The inner (farExits) lane reads LEFT: quads west of x = 4.06 − 0.5.
    expect(south.some((q) => q.cx < 4.06 - 0.5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Byte-identity guard — districts without the meta gain nothing
// ---------------------------------------------------------------------------

describe("districts without meta.scenario.laneArrows paint zero arrow quads", () => {
  for (const id of ["ov-solid2-v1", "jx-equal-v1"]) {
    it(`${id}: laneArrowQuads is 0 and markingQuads is untouched by the pass`, () => {
      const district = loadDistrict(id);
      const result = markingsOf(district);
      expect(result.laneArrowQuads).toBe(0);
      // No laneArrows key anywhere in meta — the guard the pass keys on.
      const sc = district.meta.scenario as Record<string, unknown> | undefined;
      expect(sc?.laneArrows).toBeUndefined();
    });
  }
});
