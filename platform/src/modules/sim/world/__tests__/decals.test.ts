/**
 * Road-decal placement invariants (doc 82 V4, P2 adversarial review):
 *
 *  1. NO DECAL UNDER PAINT. Grime on asphalt is the point of the wear system;
 *     grime under a zebra bar, a stop line or a lane dash reads as a bug and
 *     costs marking legibility — which the rule engine grades the student on
 *     seeing. Asserted against `world.markings`, the very buffer the renderer
 *     draws, so it covers every marking kind (dashes, edge lines, stop/give-way
 *     lines, zebras, bay U-shapes, zone solids, lane arrows, speed numerals)
 *     including ones added later.
 *
 *  2. THE END INSET IS A CLEARANCE FOR THE QUAD'S EDGE, not its centre. The
 *     first cut of V4 applied ROAD_DECAL_END_INSET_M to the CENTRE, so the two
 *     largest atlas cells (patch 5.0 m, crackA 4.5 m — half-extent up to 2.5 m,
 *     and `patch` is rotated ONTO the ribbon axis) overhung the approach cut by
 *     up to 1 m: straddling the stop line at cut + STOP_LINE_BEYOND_CUT_M, with
 *     the overhanging half sitting 3 mm ABOVE the junction patch it landed on.
 *
 * Both are geometric facts about the built buffers. (1) is asserted on a
 * synthetic signalized X AND on the real district-v1 map — the paint has to be
 * dense and varied for the assertion to bite. (2) is asserted on a single
 * isolated straight ribbon with an EMPTY marking mesh, so the decal-to-ribbon
 * assignment is unambiguous, the arclength projection is exact, and the
 * keep-out cannot mask an overhang by rejecting the quad for another reason.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  DECAL_MARKING_CLEARANCE_M,
  JUNCTION_DECAL_Y,
  ROAD_DECAL_END_INSET_M,
  ROAD_DECAL_SPACING_M,
} from "../builders/constants";
import { buildRoadDecals } from "../builders/decals";
import { polylineLength, projectOntoPolyline, type Vec2 } from "../builders/math2d";
import { MeshAccumulator } from "../builders/mesh";
import { analyzeNetwork } from "../builders/network";
import { assertDistrict, type District, type MeshData, type WorldGeometry } from "../types";

// ---------------------------------------------------------------------------
// Geometry helpers (world space: district (x, y) -> three (x, -z))
// ---------------------------------------------------------------------------

/** Every quad of a decal batch as four district-space corners + its plane. */
function decalQuads(mesh: MeshData): { corners: Vec2[]; y: number }[] {
  const out: { corners: Vec2[]; y: number }[] = [];
  const verts = mesh.positions.length / 3;
  for (let v = 0; v + 3 < verts; v += 4) {
    const corners: Vec2[] = [];
    for (let c = 0; c < 4; c++) {
      const i = (v + c) * 3;
      corners.push([mesh.positions[i]!, -mesh.positions[i + 2]!]);
    }
    out.push({ corners, y: mesh.positions[v * 3 + 1]! });
  }
  return out;
}

/** Every triangle of the markings batch as three district-space corners. */
function markingTriangles(mesh: MeshData): Vec2[][] {
  const out: Vec2[][] = [];
  for (let t = 0; t + 2 < mesh.indices.length; t += 3) {
    out.push(
      [0, 1, 2].map((k) => {
        const i = mesh.indices[t + k]! * 3;
        return [mesh.positions[i]!, -mesh.positions[i + 2]!] as Vec2;
      }),
    );
  }
  return out;
}

/**
 * Independent separating-axis overlap test — written here in the TEST rather
 * than imported from the builder, so a bug in the builder's own predicate
 * cannot mark its own homework. `gap` = 0 asks for plain overlap.
 */
function convexOverlap(a: readonly Vec2[], b: readonly Vec2[], gap: number): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i]!;
      const q = poly[(i + 1) % poly.length]!;
      const ex = q[0] - p[0];
      const ey = q[1] - p[1];
      const l = Math.hypot(ex, ey);
      if (l < 1e-9) continue;
      const nx = -ey / l;
      const ny = ex / l;
      const span = (poly2: readonly Vec2[]): [number, number] => {
        let lo = Infinity;
        let hi = -Infinity;
        for (const v of poly2) {
          const d = v[0] * nx + v[1] * ny;
          if (d < lo) lo = d;
          if (d > hi) hi = d;
        }
        return [lo, hi];
      };
      const [loA, hiA] = span(a);
      const [loB, hiB] = span(b);
      if (loA - hiB > gap || loB - hiA > gap) return false;
    }
  }
  return true;
}

/** Decal quads sitting on (or within `gap` of) painted markings. */
function paintCollisions(world: WorldGeometry, gap: number): number {
  const tris = markingTriangles(world.markings);
  // AABB pre-filter — the exact test is O(quads x triangles) otherwise, and
  // district-v1 carries thousands of each.
  const boxes = tris.map((t) => [
    Math.min(t[0]![0], t[1]![0], t[2]![0]),
    Math.min(t[0]![1], t[1]![1], t[2]![1]),
    Math.max(t[0]![0], t[1]![0], t[2]![0]),
    Math.max(t[0]![1], t[1]![1], t[2]![1]),
  ]);
  let hits = 0;
  for (const { corners } of decalQuads(world.roadDecals)) {
    const qx0 = Math.min(...corners.map((c) => c[0]));
    const qx1 = Math.max(...corners.map((c) => c[0]));
    const qy0 = Math.min(...corners.map((c) => c[1]));
    const qy1 = Math.max(...corners.map((c) => c[1]));
    for (let i = 0; i < tris.length; i++) {
      const b = boxes[i]!;
      if (qx1 + gap < b[0]! || qx0 - gap > b[2]! || qy1 + gap < b[1]! || qy0 - gap > b[3]!) continue;
      if (convexOverlap(corners, tris[i]!, gap)) {
        hits++;
        break;
      }
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Synthetic straight-ribbon X: exact arclength maths, one signalized junction
// with a marked crossing, four 4-lane arterials so the paint is dense.
// ---------------------------------------------------------------------------

function straightDistrict(): District {
  const nodes = [
    { id: "nC", x: 0, y: 0 },
    { id: "nN", x: 0, y: 120 },
    { id: "nS", x: 0, y: -120 },
    { id: "nE", x: 120, y: 0 },
    { id: "nW", x: -120, y: 0 },
  ];
  const mkEdge = (id: string, from: string, to: string, geometry: [number, number][]) => ({
    id,
    from,
    to,
    class: "secondary",
    name: null,
    oneway: false,
    roundabout: false,
    lanes: 4,
    lanesSource: "tag" as const,
    maxspeed: 50,
    maxspeedSource: "default" as const,
    length: 120,
    geometry,
  });
  return {
    format: "district-v1",
    meta: {
      district: "decal-test",
      label: "Decal test",
      boundsLocalMeters: { minX: -120, minY: -120, maxX: 120, maxY: 120 },
      attribution: {
        text: "Map data © OpenStreetMap contributors",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        copyrightUrl: "https://www.openstreetmap.org/copyright",
      },
    },
    roads: {
      nodes,
      edges: [
        mkEdge("eN", "nC", "nN", [
          [0, 0],
          [0, 120],
        ]),
        mkEdge("eS", "nC", "nS", [
          [0, 0],
          [0, -120],
        ]),
        mkEdge("eE", "nC", "nE", [
          [0, 0],
          [120, 0],
        ]),
        mkEdge("eW", "nC", "nW", [
          [0, 0],
          [-120, 0],
        ]),
      ],
    },
    intersections: [{ id: "nC", x: 0, y: 0, degree: 4, signalized: true }],
    crossings: [{ id: "x1", x: 0, y: 30, kind: "marked", signalized: true, edgeId: "eN" }],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  } as District;
}

describe("road decals keep out of paint (synthetic X)", () => {
  const district = straightDistrict();
  const world = buildWorldGeometry(district, { seed: 7 });

  it("paints and wears enough for the assertions to mean something", () => {
    expect(world.stats.markingQuads).toBeGreaterThan(0);
    expect(world.stats.stopLines).toBeGreaterThan(0);
    expect(world.stats.zebraCrossings).toBe(1);
    expect(world.stats.roadDecals).toBeGreaterThan(0);
    expect(world.stats.junctionDecals).toBeGreaterThan(0);
  });

  it("places no decal quad on a marking polygon", () => {
    expect(paintCollisions(world, 0)).toBe(0);
  });

  it("keeps the authored clearance, not just a touching edge", () => {
    // The builder rejects anything within DECAL_MARKING_CLEARANCE_M, so the
    // survivors clear the paint by at least that (minus float slop).
    expect(paintCollisions(world, DECAL_MARKING_CLEARANCE_M - 1e-6)).toBe(0);
  });

});

describe("the ribbon end inset is a clearance for the decal's EDGE", () => {
  /**
   * The P2 defect: ROAD_DECAL_END_INSET_M was applied to the decal CENTRE, so
   * a 5 m `patch` (half-extent 2.5 m, and rotated ONTO the ribbon axis)
   * centred at s = 1.5 m spanned −1.0…+4.0 m — 1 m past the approach cut,
   * straight over the stop line at cut + 0.6 m, with the overhanging half
   * sitting 3 mm ABOVE the junction patch it landed on.
   *
   * Tested on ONE isolated straight ribbon with an EMPTY marking mesh, so the
   * decal-to-ribbon assignment is unambiguous, the arclength projection is
   * exact, and the marking keep-out cannot mask the overhang by rejecting the
   * offending quad for a different reason. Swept over 200 seeds because the
   * overhang needs the first/last slot to draw a big cell at low jitter — a
   * few-percent event per ribbon end, which one seed can easily miss.
   */
  const isolatedRibbon = (): District => ({
    format: "district-v1",
    meta: {
      district: "decal-ribbon",
      label: "Decal ribbon",
      boundsLocalMeters: { minX: -10, minY: -10, maxX: 10, maxY: 130 },
      attribution: {
        text: "Map data © OpenStreetMap contributors",
        license: "ODbL 1.0",
        licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
        copyrightUrl: "https://www.openstreetmap.org/copyright",
      },
    },
    roads: {
      nodes: [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 0, y: 120 },
      ],
      edges: [
        {
          id: "e1",
          from: "a",
          to: "b",
          class: "secondary",
          name: null,
          oneway: false,
          roundabout: false,
          lanes: 4,
          lanesSource: "tag",
          maxspeed: 50,
          maxspeedSource: "default",
          length: 120,
          geometry: [
            [0, 0],
            [0, 120],
          ],
        },
      ],
    },
    intersections: [],
    crossings: [],
    roundabouts: [],
    buildings: [],
    spawnPoints: [],
  });

  it("never lets a decal corner reach past the inset, over 200 seeds", () => {
    const network = analyzeNetwork(isolatedRibbon());
    const line = network.edges[0]!.line as Vec2[];
    const total = polylineLength(line);
    const slots = Math.floor(total / ROAD_DECAL_SPACING_M);
    const seeds = 200;
    let checked = 0;
    let overhang = 0;
    let placed = 0;
    for (let seed = 0; seed < seeds; seed++) {
      const { decals, count } = buildRoadDecals(network, seed, new MeshAccumulator());
      placed += count;
      for (const { corners } of decalQuads(decals.toMeshData())) {
        for (const c of corners) {
          checked++;
          // projectOntoPolyline clamps to the polyline, so a corner PAST an
          // end reports s = 0 or s = total — both already violate the inset.
          const s = projectOntoPolyline(line, c).s;
          if (s < ROAD_DECAL_END_INSET_M - 1e-6 || s > total - ROAD_DECAL_END_INSET_M + 1e-6) {
            overhang++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
    expect(overhang).toBe(0);
    // …and the per-cell band costs essentially no wear: the clamp shortens the
    // slot band for big cells, it does not delete slots. A 120 m ribbon is far
    // longer than the widest cell, so every slot must still fill.
    expect(slots).toBe(12);
    expect(placed).toBe(seeds * slots);
  });
});

describe("road decals keep out of paint (real district)", () => {
  let world: WorldGeometry;

  beforeAll(() => {
    const candidates = [
      path.join(process.cwd(), "content", "world", "district-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "district-v1.json"),
    ];
    const file = candidates.find((f) => fs.existsSync(f));
    if (!file) throw new Error(`district-v1.json not found in: ${candidates.join(", ")}`);
    world = buildWorldGeometry(assertDistrict(JSON.parse(fs.readFileSync(file, "utf8"))));
  });

  it("places no decal quad on a marking polygon, either pass", () => {
    expect(world.stats.markingQuads).toBeGreaterThan(1000);
    expect(paintCollisions(world, 0)).toBe(0);
    // Both passes contributed, so neither is vacuously clean.
    const planes = new Set(
      decalQuads(world.roadDecals).map(({ y }) =>
        Math.abs(y - JUNCTION_DECAL_Y) < 1e-6 ? "junction" : "ribbon",
      ),
    );
    expect(planes.has("ribbon")).toBe(true);
    expect(planes.has("junction")).toBe(true);
  });
});
