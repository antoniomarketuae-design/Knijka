/**
 * Builder tests on BOTH a synthetic micro-district (exact expectations) and
 * the real content/world/district-v1.json (structural invariants + budget).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  CURB_CHAMFER_M,
  CURB_HEIGHT_M,
  GUTTER_TINT,
  JUNCTION_DECAL_Y,
  LANE_WIDTH_M,
  PARKING_LANE_WIDTH_M,
  PARKING_LANE_Y,
  paintsZebra,
  ROAD_DECAL_Y,
  ROAD_Y,
  SIDEWALK_TOP_Y,
  WHEEL_TRACK_TINT,
} from "../builders/constants";
import { ribbonCrossSection } from "../builders/roads";
import { assertDistrict, TREE_KINDS, type District, type WorldGeometry } from "../types";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Synthetic micro-district: a signalized + crossing X-junction, one entry.
// ---------------------------------------------------------------------------

function syntheticDistrict(): District {
  const nodes = [
    { id: "nC", x: 0, y: 0 },
    { id: "nN", x: 0, y: 120 },
    { id: "nS", x: 0, y: -120 },
    { id: "nE", x: 120, y: 0 },
    { id: "nW", x: -120, y: 0 },
  ];
  const mkEdge = (
    id: string,
    from: string,
    to: string,
    cls: string,
    lanes: number,
    geometry: [number, number][],
  ) => ({
    id,
    from,
    to,
    class: cls,
    name: null,
    oneway: false,
    roundabout: false,
    lanes,
    lanesSource: "tag" as const,
    maxspeed: 50,
    maxspeedSource: "default" as const,
    length: 120,
    geometry,
  });
  return {
    format: "district-v1",
    meta: {
      district: "test",
      label: "Test",
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
        mkEdge("eN", "nC", "nN", "secondary", 4, [
          [0, 0],
          [0, 120],
        ]),
        mkEdge("eS", "nC", "nS", "secondary", 4, [
          [0, 0],
          [0, -120],
        ]),
        mkEdge("eE", "nC", "nE", "residential", 2, [
          [0, 0],
          [120, 0],
        ]),
        mkEdge("eW", "nC", "nW", "residential", 2, [
          [0, 0],
          [-120, 0],
        ]),
      ],
    },
    intersections: [{ id: "nC", x: 0, y: 0, degree: 4, signalized: true }],
    crossings: [
      { id: "x1", x: 0, y: 30, kind: "marked", signalized: false, edgeId: "eN" },
    ],
    roundabouts: [],
    buildings: [
      {
        id: "b1",
        height: 15,
        heightSource: "levels",
        footprint: [
          [30, 30],
          [50, 30],
          [50, 50],
          [30, 50],
        ],
      },
    ],
    spawnPoints: [],
  };
}

describe("buildWorldGeometry on a synthetic X-junction", () => {
  let world: WorldGeometry;
  beforeAll(() => {
    world = buildWorldGeometry(syntheticDistrict(), { seed: 7 });
  });

  it("builds one ribbon per edge and one junction patch", () => {
    expect(world.stats.ribbons).toBe(4);
    expect(world.stats.skippedRibbons).toBe(0);
    // 4 dead ends produce no patches; the center node does.
    expect(world.stats.junctionPatches).toBe(1);
  });

  it("road ribbons have the correct width from lane counts (+ parking bands)", () => {
    // First ribbon is eN (secondary, 4 lanes): the first cross-section row is
    // the wear-baked station list (left edge ... right edge) -> its extremes
    // span travel lanes + a parking band per side (QW3 arterial section).
    const halfWidth = (4 * LANE_WIDTH_M) / 2 + PARKING_LANE_WIDTH_M;
    const section = ribbonCrossSection(halfWidth, PARKING_LANE_WIDTH_M, 4);
    const pos = world.roadSurface.positions;
    const first = 0;
    const last = (section.length - 1) * 3;
    const dx = pos[first]! - pos[last]!;
    const dz = pos[first + 2]! - pos[last + 2]!;
    expect(Math.hypot(dx, dz)).toBeCloseTo(4 * LANE_WIDTH_M + 2 * PARKING_LANE_WIDTH_M, 3);
  });

  it("bakes wheel-track + gutter wear into road vertex colors (doc 71 §4.4)", () => {
    // Station list: edges carry the gutter tint, each lane two track dips.
    const halfWidth = (4 * LANE_WIDTH_M) / 2 + PARKING_LANE_WIDTH_M;
    const section = ribbonCrossSection(halfWidth, PARKING_LANE_WIDTH_M, 4);
    expect(section[0]!.offset).toBeCloseTo(-halfWidth);
    expect(section[section.length - 1]!.offset).toBeCloseTo(halfWidth);
    expect(section[0]!.tint).toBeCloseTo(GUTTER_TINT);
    expect(section.filter((s) => s.tint === WHEEL_TRACK_TINT).length).toBe(8); // 4 lanes x 2 tracks
    // Offsets strictly increase (valid quad strip).
    for (let i = 1; i < section.length; i++) {
      expect(section[i]!.offset).toBeGreaterThan(section[i - 1]!.offset);
    }
    // The built mesh carries one RGB per vertex, all in (0, 1], with both
    // full-bright and worn vertices present.
    const colors = world.roadSurface.colors;
    expect(colors).toBeDefined();
    expect(colors!.length).toBe(world.roadSurface.positions.length);
    let worn = 0;
    let bright = 0;
    for (let i = 0; i < colors!.length; i += 3) {
      const c = colors![i]!;
      expect(c).toBeGreaterThan(0);
      expect(c).toBeLessThanOrEqual(1);
      if (Math.abs(c - WHEEL_TRACK_TINT) < 1e-6) worn++; // float32 storage
      if (c === 1) bright++;
    }
    expect(worn).toBeGreaterThan(0);
    expect(bright).toBeGreaterThan(0);
  });

  it("scatters seeded road decals as one co-planar quad batch", () => {
    // doc 82 V4: 4 ribbons x ~95 m usable at 1/10 m -> ~9 quads each, plus
    // the junction pass. The lower bound is deliberately above the pre-V4
    // ceiling of 12 — at 1/40 m this test passed with as few as 4 decals for
    // the whole map, which is the "statistically invisible" density V4 exists
    // to end.
    //
    // Re-baselined after the P2 fixes (per-cell end inset + the marking
    // keep-out, decals.ts): measured 44 total / 12 junction at seed 7, the
    // SAME as before them. Both fixes reshuffle the seeded stream, but the
    // re-draw loop refills the slots they would otherwise have emptied, so on
    // this map the density is unchanged.
    expect(world.stats.roadDecals).toBeGreaterThanOrEqual(30);
    expect(world.stats.roadDecals).toBeLessThanOrEqual(80);
    const { positions, uvs, indices } = world.roadDecals;
    expect(positions.length / 3).toBe(world.stats.roadDecals * 4);
    expect(indices.length / 3).toBe(world.stats.roadDecals * 2);
    for (let i = 1; i < positions.length; i += 3) {
      // EXACTLY co-planar with the surface underneath — the ribbons for the
      // road pass, the (3 mm lower) junction patch for the junction pass.
      // Never in between: a lifted quad shears at grazing cockpit angles.
      const y = positions[i]!;
      expect(
        Math.abs(y - ROAD_DECAL_Y) < 1e-6 || Math.abs(y - JUNCTION_DECAL_Y) < 1e-6,
      ).toBe(true);
    }
    // Atlas UVs stay inside the texture.
    for (let i = 0; i < uvs.length; i++) {
      expect(uvs[i]!).toBeGreaterThanOrEqual(0);
      expect(uvs[i]!).toBeLessThanOrEqual(1);
    }
    // Decal quads face up (CCW after world mapping).
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      const abx = positions[b]! - positions[a]!;
      const abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!;
      const acz = positions[c + 2]! - positions[a + 2]!;
      expect(abz * acx - abx * acz).toBeGreaterThan(0);
    }
  });

  it("wears the junction interior, and never off the asphalt (doc 82 V4)", () => {
    // The X-junction is the one node with a patch, so all junction wear
    // belongs to it. Before V4 this count was structurally 0: ribbons are
    // trimmed back to the approach cuts, so nothing could reach the ~1,600 m²
    // of open slab a 2.5×-scaled 4-way carries.
    expect(world.stats.junctionDecals).toBeGreaterThan(0);
    expect(world.stats.junctionDecals).toBeLessThan(world.stats.roadDecals);

    // EXACT containment, not a radius guess: every junction-plane decal vertex
    // must land inside a triangle of the junction patch mesh itself. A
    // T-junction patch is not a disc, and a decal sampled from one would float
    // on the grass of the open side.
    const patch = world.junctionSurface;
    const tris: [number, number, number, number, number, number][] = [];
    for (let t = 0; t < patch.indices.length; t += 3) {
      const [a, b, c] = [patch.indices[t]! * 3, patch.indices[t + 1]! * 3, patch.indices[t + 2]! * 3];
      tris.push([
        patch.positions[a]!,
        patch.positions[a + 2]!,
        patch.positions[b]!,
        patch.positions[b + 2]!,
        patch.positions[c]!,
        patch.positions[c + 2]!,
      ]);
    }
    expect(tris.length).toBeGreaterThan(0);
    const inside = (px: number, pz: number): boolean =>
      tris.some(([ax, az, bx, bz, cx, cz]) => {
        const d1 = (px - bx) * (az - bz) - (ax - bx) * (pz - bz);
        const d2 = (px - cx) * (bz - cz) - (bx - cx) * (pz - cz);
        const d3 = (px - ax) * (cz - az) - (cx - ax) * (pz - az);
        const neg = d1 < -1e-9 || d2 < -1e-9 || d3 < -1e-9;
        const pos = d1 > 1e-9 || d2 > 1e-9 || d3 > 1e-9;
        return !(neg && pos);
      });

    const pos = world.roadDecals.positions;
    let checked = 0;
    let escaped = 0;
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.abs(pos[i + 1]! - JUNCTION_DECAL_Y) > 1e-6) continue; // ribbon pass
      checked++;
      if (!inside(pos[i]!, pos[i + 2]!)) escaped++;
    }
    expect(checked).toBe(world.stats.junctionDecals * 4);
    expect(escaped).toBe(0);
  });

  it("chamfers the curb top without changing the drivable curb height", () => {
    // The 2 cm sun-catcher strip exists (vertices at TOP - CURB_CHAMFER_M)…
    const pos = world.sidewalks.positions;
    let chamfer = 0;
    for (let i = 1; i < pos.length; i += 3) {
      if (Math.abs(pos[i]! - (SIDEWALK_TOP_Y - CURB_CHAMFER_M)) < 1e-6) chamfer++;
    }
    expect(chamfer).toBeGreaterThan(0);
    // …while the physics contract holds: top still one 12 cm curb above road.
    expect(SIDEWALK_TOP_Y - ROAD_Y).toBeCloseTo(CURB_HEIGHT_M);
    // AO-ish read: curb-foot vertices darker than walkway vertices.
    const colors = world.sidewalks.colors;
    expect(colors).toBeDefined();
    const tints = new Set<number>();
    for (let i = 0; i < colors!.length; i += 3) tints.add(colors![i]!);
    expect(Math.min(...tints)).toBeLessThan(0.8); // curb foot grime
    expect(Math.max(...tints)).toBe(1); // walkway/chamfer full-bright
  });

  it("lays tinted parking bands along arterial edges only", () => {
    // eN + eS are secondary (2 strips each); eE/eW residential get none.
    expect(world.stats.parkingLaneStrips).toBe(4);
    const pos = world.parkingLanes.positions;
    expect(pos.length).toBeGreaterThan(0);
    for (let i = 1; i < pos.length; i += 3) {
      expect(pos[i]!).toBeCloseTo(PARKING_LANE_Y);
    }
  });

  it("all road surface normals point up and sit at ROAD_Y", () => {
    const { normals, positions } = world.roadSurface;
    for (let i = 0; i < normals.length; i += 3) {
      expect(normals[i + 1]).toBeCloseTo(1);
      expect(positions[i + 1]).toBeCloseTo(ROAD_Y);
    }
  });

  it("road triangles face upward (CCW after world mapping)", () => {
    const { positions, indices } = world.roadSurface;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      const abx = positions[b]! - positions[a]!;
      const abz = positions[b + 2]! - positions[a + 2]!;
      const acx = positions[c]! - positions[a]!;
      const acz = positions[c + 2]! - positions[a + 2]!;
      // y of cross product (flat triangle): abz*acx - abx*acz
      expect(abz * acx - abx * acz).toBeGreaterThan(0);
    }
  });

  it("sidewalk tops sit exactly one curb above the road", () => {
    const pos = world.sidewalks.positions;
    let sawTop = 0;
    for (let i = 1; i < pos.length; i += 3) {
      const y = pos[i]!;
      expect(y).toBeGreaterThanOrEqual(-1e-6);
      expect(y).toBeLessThanOrEqual(SIDEWALK_TOP_Y + 1e-6);
      if (Math.abs(y - SIDEWALK_TOP_Y) < 1e-6) sawTop++;
    }
    expect(sawTop).toBeGreaterThan(0);
    expect(SIDEWALK_TOP_Y - ROAD_Y).toBeCloseTo(CURB_HEIGHT_M);
  });

  it("paints a stop line per signalized approach and one zebra", () => {
    expect(world.stats.stopLines).toBe(4);
    expect(world.stats.zebraCrossings).toBe(1);
    expect(world.stats.markingQuads).toBeGreaterThan(4);
  });

  it("places near + far-side traffic lights per approach with the junction node id", () => {
    // Doc 62 S1/#19: each incoming approach gets its near head AND a
    // far-side companion mirrored through the node (the head a driver
    // waiting at the line actually sees) — 4 approaches × 2 heads.
    expect(world.trafficLights.length).toBe(8);
    for (const tl of world.trafficLights) {
      expect(tl.nodeId).toBe("nC");
      expect(Number.isFinite(tl.approachBearingDeg)).toBe(true);
      // Poles stand outside the roadway but near the junction mouth (the
      // scaled open radius reaches ~35 m here, pole ~42 m out; the mirrored
      // companion sits at the same radius on the far corner).
      const d = Math.hypot(tl.position[0], tl.position[2]);
      expect(d).toBeGreaterThan(LANE_WIDTH_M);
      expect(d).toBeLessThan(50);
    }
  });

  it("places limit-50 signs at district entry roads", () => {
    expect(world.stats.signs.limit50).toBeGreaterThanOrEqual(1);
  });

  it("streetscape v2: no boulevard row/billboards without primary streets, no kits off-district", () => {
    // Linden boulevards and billboards are primary-class only; this district
    // has secondary + residential edges.
    expect(world.trees.every((t) => t.kind !== "linden")).toBe(true);
    expect(world.stats.billboards).toBe(0);
    // Hand-anchored parking sites lie outside these bounds -> skipped.
    expect(world.stats.parkingKits).toBe(0);
    // Secondary edges near the signalized junction still host a shelter.
    expect(world.stats.busStops).toBeGreaterThanOrEqual(1);
    expect(world.stats.busStops).toBeLessThanOrEqual(8);
  });

  it("extrudes the building with 4 wall variants buckets and a roof", () => {
    const total = world.buildingWalls.reduce((s, w) => s + w.positions.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(world.buildingRoofs.indices.length).toBeGreaterThanOrEqual(6);
    // Roof height = building height.
    expect(world.buildingRoofs.positions[1]).toBeCloseTo(15);
    // Three baked bands on a wall tall enough to carry a crown (art pass
    // 2026-08-03): the ground-floor grime, the body, and the CORNICE — a dark
    // reveal line under a bright parapet cap, which is what stops a flat-roofed
    // prism reading as a bare extrusion at `low`, where there is no facade
    // normal map at all. This synthetic building is 15 m, so it qualifies.
    const walls = world.buildingWalls.find((w) => w.positions.length > 0)!;
    expect(walls.colors).toBeDefined();
    const tints = new Set<number>();
    for (let i = 0; i < walls.colors!.length; i += 3) tints.add(walls.colors![i]!);
    expect(tints.size).toBe(4);
    const sorted = [...tints].sort((a, b) => a - b);
    // …and the crown's cap is the BRIGHTEST value on the prism while the
    // reveal under it is the darkest — the ordering is the cue, not the
    // numbers.
    expect(sorted[0]).toBeLessThan(sorted[1]!);
    expect(sorted[3]).toBeGreaterThan(sorted[2]!);
  });

  it("ground collider top face sits at the road surface", () => {
    const g = world.colliders.ground;
    expect(g.position[1] + g.halfExtents[1]).toBeCloseTo(ROAD_Y);
    // Covers the district bounds + margin.
    expect(g.halfExtents[0]).toBeGreaterThan(120);
    expect(g.halfExtents[2]).toBeGreaterThan(120);
  });

  it("collider meshes are valid indexed trimeshes", () => {
    for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(c.positions.length % 3).toBe(0);
      expect(c.indices.length % 3).toBe(0);
      expect(c.indices.length).toBeGreaterThan(0);
      const maxIdx = Math.max(...Array.from(c.indices));
      expect(maxIdx).toBeLessThan(c.positions.length / 3);
    }
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(syntheticDistrict(), { seed: 7 });
    expect(Array.from(again.roadSurface.positions)).toEqual(
      Array.from(world.roadSurface.positions),
    );
    expect(again.trees).toEqual(world.trees);
    expect(again.stats).toEqual(world.stats);
  });

  it("paints parking bays as 3-stroke U-shapes in the markings mesh (doc 68 A5)", () => {
    const bare = buildWorldGeometry(syntheticDistrict(), { seed: 7, parkingBays: [] });
    const withBay = buildWorldGeometry(syntheticDistrict(), {
      seed: 7,
      parkingBays: [{ x: 20, y: 30, headingDeg: 90, widthM: 3, lengthM: 6.6 }],
    });
    expect(bare.stats.parkingBays).toBe(0);
    expect(withBay.stats.parkingBays).toBe(1);
    // U-shape = side line + both end lines = 3 extra quads = 12 extra vertices.
    expect(withBay.stats.markingQuads).toBe(bare.stats.markingQuads + 3);
    expect(withBay.markings.positions.length).toBe(bare.markings.positions.length + 12 * 3);
  });

  it("junction radius overrides move the ribbon cut (hand-polish hook)", () => {
    // Default open radius at nC is ~35 m (scaled roads); override past it.
    const wide = buildWorldGeometry(syntheticDistrict(), {
      seed: 7,
      junctionRadiusOverrides: { nC: 50 },
    });
    // eN ribbon starts further from the center -> first vertex further out.
    const zDefault = Math.abs(world.roadSurface.positions[2]!);
    const zWide = Math.abs(wide.roadSurface.positions[2]!);
    expect(zWide).toBeGreaterThan(zDefault + 5);
  });
});

// ---------------------------------------------------------------------------
// Real district
// ---------------------------------------------------------------------------

function loadRealDistrict(): District {
  const candidates = [
    path.join(process.cwd(), "content", "world", "district-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "district-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return assertDistrict(JSON.parse(fs.readFileSync(file, "utf8")));
    }
  }
  throw new Error(`district-v1.json not found in: ${candidates.join(", ")}`);
}

describe("buildWorldGeometry on the real district (Студентски град)", () => {
  let district: District;
  let world: WorldGeometry;
  beforeAll(() => {
    district = loadRealDistrict();
    world = buildWorldGeometry(district);
  });

  it("covers every edge with a ribbon or a junction patch", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(
      district.roads.edges.length,
    );
    expect(world.stats.ribbons).toBeGreaterThan(250);
    expect(world.stats.junctionPatches).toBeGreaterThan(100);
  });

  it("produces no NaN/infinite coordinates anywhere", () => {
    const buffers = [
      world.roadSurface,
      world.junctionSurface,
      world.sidewalks,
      world.markings,
      world.parkingLanes,
      world.roadDecals,
      world.terrain,
      world.buildingRoofs,
      ...world.buildingWalls,
    ];
    // Scan fast and assert once — the buffers hold ~millions of floats, so a
    // per-element expect() call is what made this test flake near the timeout.
    let nonFinite = 0;
    for (const mesh of buffers) {
      const p = mesh.positions;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) nonFinite++;
    }
    for (const list of [
      world.trafficLights,
      world.signs,
      world.streetlights,
      world.trees,
      world.billboards,
      world.busStops,
      world.parkingKits,
    ]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("places every signal head at a signalized node — vehicle heads at intersections, pedestrian heads at crossings", () => {
    expect(world.trafficLights.length).toBeGreaterThan(10);
    const signalizedJunctions = new Set(
      district.intersections.filter((i) => i.signalized).map((i) => i.id),
    );
    // Doc 86 L3: a pedestrian head's nodeId is the CROSSING id (the runtime's
    // own signal-node key), never a junction. Both families are checked here so
    // the invariant is strictly stronger than the „only at signalized
    // intersections" it replaces — a head keyed to nothing still fails.
    const signalizedCrossings = new Set(
      district.crossings.filter((c) => c.signalized).map((c) => c.id),
    );
    expect(signalizedCrossings.size).toBeGreaterThan(0);
    let vehicle = 0;
    let pedestrian = 0;
    for (const tl of world.trafficLights) {
      if (tl.head === "pedestrian") {
        expect(signalizedCrossings.has(tl.nodeId)).toBe(true);
        pedestrian++;
      } else {
        expect(signalizedJunctions.has(tl.nodeId)).toBe(true);
        vehicle++;
      }
    }
    expect(vehicle).toBeGreaterThan(10);
    // One head per kerb of every signalized crossing.
    expect(pedestrian).toBe(signalizedCrossings.size * 2);
  });

  it("places the BG sign set (give-way, stop, limit-50, roundabout)", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThan(5);
    expect(world.stats.signs.limit50).toBeGreaterThanOrEqual(1);
    // One mapped roundabout -> its entries carry Д11.
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(2);
  });

  it("paints zebras for every crossing kind the painter claims, on drivable edges", () => {
    // Asks the painter's own predicate rather than restating its condition, so
    // the count cannot drift from the paint (doc 86 T1's discipline; doc 87
    // A13 added `unknown` — an untagged urban crossing node is a marked
    // пешеходна пътека whose tag is missing, and it is the referent Урок 4's
    // dart-out stands on). `unmarked` still paints nothing, by law.
    const paintable = district.crossings.filter((c) => c.edgeId && paintsZebra(c)).length;
    expect(world.stats.zebraCrossings).toBeGreaterThan(paintable * 0.8);
    expect(world.stats.zebraCrossings).toBeLessThanOrEqual(paintable);
  });

  it("renders a mid-rise district: prisms for the fabric, few towers, data heights (QW3)", () => {
    // Every footprint is either a facade prism or a kit-building instance.
    expect(world.stats.buildings).toBe(district.buildings.length);
    // Towers only where OSM says genuinely tall AND the plot is compact —
    // a handful in Студентски град, not all 248 (the old 42–170 m canyon) —
    // plus a sparse capped set of low retail pavilions (kit v3).
    expect(world.stats.buildingInstances).toBeGreaterThanOrEqual(1);
    expect(world.stats.buildingInstances).toBeLessThanOrEqual(12);
    let towers = 0;
    for (const inst of world.buildingInstances) {
      if (inst.scale[1] >= 40) {
        towers++;
        expect(inst.scale[1]).toBeLessThanOrEqual(75); // data heights, clamped
      } else {
        expect(inst.scale[1]).toBeLessThan(8); // retail pavilion, low by rule
      }
    }
    expect(towers).toBeGreaterThanOrEqual(1);
    expect(towers).toBeLessThanOrEqual(8);
    // The prism fabric exists and tops out at mid-rise/real heights (≤ 75 m),
    // with the bulk of roof area well under the old 42 m tower floor.
    let maxRoofY = 0;
    let under30 = 0;
    let roofVerts = 0;
    const roofPos = world.buildingRoofs.positions;
    for (let i = 1; i < roofPos.length; i += 3) {
      const y = roofPos[i]!;
      maxRoofY = Math.max(maxRoofY, y);
      if (y < 30) under30++;
      roofVerts++;
    }
    expect(roofVerts).toBeGreaterThan(0);
    expect(maxRoofY).toBeLessThanOrEqual(75);
    expect(under30 / roofVerts).toBeGreaterThan(0.8);
  });

  it("paints the hand-placed Б2 line + sign for lesson 2 (QW4)", () => {
    // The override approach at n331942490 must carry a stop sign near the
    // junction (383.17, 65.76 → world z = -65.76). The sign stands at the
    // junction mouth — open radius ~17 m + pole offsets ≈ 19 m out.
    const near = world.signs.filter(
      (s) =>
        s.kind === "stop" &&
        Math.hypot(s.position[0] - 383.17, s.position[2] - -65.76) < 28,
    );
    expect(near.length).toBe(1);
  });

  it("paints the lesson-authored L7 bay by default (doc 68 A5)", () => {
    expect(LESSON_PARKING_BAYS.length).toBeGreaterThanOrEqual(1);
    expect(world.stats.parkingBays).toBe(LESSON_PARKING_BAYS.length);
    // The bay's paint vertices land around its authored center (world z = -y).
    const bay = LESSON_PARKING_BAYS[0]!;
    const pos = world.markings.positions;
    let near = 0;
    for (let i = 0; i < pos.length; i += 3) {
      if (Math.hypot(pos[i]! - bay.x, pos[i + 2]! - -bay.y) < bay.lengthM) near++;
    }
    // 3 quads × 4 vertices minimum.
    expect(near).toBeGreaterThanOrEqual(12);
  });

  it("keeps the ODbL attribution visible in the build output", () => {
    expect(world.attribution.text).toContain("OpenStreetMap contributors");
    expect(world.attribution.copyrightUrl).toContain("openstreetmap.org/copyright");
  });

  it("mixes the streetscape-v2 trees: linden boulevards + leafy rows (doc 70 REF 3)", () => {
    const kinds = { linden: 0, ornamental: 0, leafyA: 0, leafyB: 0 };
    for (const t of world.trees) kinds[t.kind]++;
    // Exactly the picked boulevards carry the uniform linden row; the mixed
    // leafy rows dominate everywhere else.
    expect(kinds.linden).toBeGreaterThan(20);
    expect(kinds.leafyA + kinds.leafyB).toBeGreaterThan(kinds.linden);
    expect(kinds.leafyA + kinds.leafyB).toBeGreaterThan(kinds.ornamental);
    expect(kinds.linden + kinds.ornamental + kinds.leafyA + kinds.leafyB).toBe(world.trees.length);
  });

  /**
   * Regression guard for a defect caught in a RENDERED FRAME
   * (public/clips/sc-junction-stop__m0.k2.webp): the boulevards were planted
   * with palms. Sofia is humid-continental with snowy winters — a palm on a
   * Sofia boulevard reads as fake to the exact 17-year-old this product is
   * for, and every species below is one that actually lines Sofia's streets
   * (липа / кестен / топола / явор). Both halves matter: the CONTRACT must not
   * offer a tropical species, and the builder must not plant anything outside
   * the contract.
   */
  it("plants only species that survive a Sofia winter — never a palm", () => {
    expect(TREE_KINDS.some((k) => /palm|tropic/i.test(k))).toBe(false);
    const planted = new Set<string>(world.trees.map((t) => t.kind));
    expect(planted.size).toBeGreaterThan(0);
    for (const kind of planted) expect(TREE_KINDS).toContain(kind);
  });

  /**
   * ...and the RENDERER must not resolve a kind to a tropical GLB — the type
   * rename alone would not have stopped `linden: bake(palm.scene)`. The frame
   * defect lived in this file, so the guard reads it.
   */
  it("never loads a palm asset in the prop renderer", () => {
    const src = fs.readFileSync(path.join(HERE, "..", "components", "WorldProps.tsx"), "utf8");
    // Comments explaining WHY palms are banned are fine; asset loads are not.
    const loads = src.match(/load\((?:[^)]*)\)/g) ?? [];
    expect(loads.length).toBeGreaterThan(0);
    expect(loads.filter((l) => /palm/i.test(l))).toEqual([]);
  });

  it("places sparse billboards along the primary street (doc 70 REF 3)", () => {
    expect(world.stats.billboards).toBeGreaterThanOrEqual(5);
    expect(world.stats.billboards).toBeLessThanOrEqual(30);
    // Sparse: pairwise distance >= the min spacing (billboards anchor to the
    // road centerline; the lateral pole offset can only stretch that).
    for (let i = 0; i < world.billboards.length; i++) {
      for (let j = i + 1; j < world.billboards.length; j++) {
        const a = world.billboards[i]!.position;
        const b = world.billboards[j]!.position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThan(100);
      }
    }
    const sizes = new Set(world.billboards.map((b) => b.size));
    expect(sizes.has("large")).toBe(true);
    expect(sizes.has("small")).toBe(true);
  });

  it("places 4-8 bus-stop shelters on the sidewalk, apart from each other", () => {
    expect(world.stats.busStops).toBeGreaterThanOrEqual(4);
    expect(world.stats.busStops).toBeLessThanOrEqual(8);
    for (const s of world.busStops) {
      expect(s.position[1]).toBeCloseTo(SIDEWALK_TOP_Y);
    }
    for (let i = 0; i < world.busStops.length; i++) {
      for (let j = i + 1; j < world.busStops.length; j++) {
        const a = world.busStops[i]!.position;
        const b = world.busStops[j]!.position;
        expect(Math.hypot(a[0] - b[0], a[2] - b[2])).toBeGreaterThanOrEqual(150);
      }
    }
  });

  it("dresses the 3 hand-anchored surface-parking sites (doc 70 REF 1)", () => {
    expect(world.stats.parkingKits).toBe(3);
    // Hand-picked district coordinates (props.ts PARKING_KIT_SITES), world z = -y.
    const sites: [number, number][] = [
      [-594.8, 184.8],
      [-558.8, -235.2],
      [149.2, -307.2],
    ];
    for (const [x, z] of sites) {
      const hit = world.parkingKits.some(
        (k) => Math.hypot(k.position[0] - x, k.position[2] - z) < 0.5,
      );
      expect(hit).toBe(true);
    }
  });

  it("scatters street-wear decals at ~1 per 10 m of ribbon (doc 82 V4)", () => {
    // 320 ribbons, mostly 40–200 m, at 1/10 m plus the junction pass -> ~1.7 k
    // quads, still ONE batch and ONE draw call. The floor is set ABOVE the
    // pre-V4 ceiling of 1,500 on purpose: this is the whole content of V4 and
    // reverting the spacing must fail here.
    //
    // Re-baselined after the P2 fixes (per-cell end inset + the marking
    // keep-out, decals.ts): measured 1,739 total / 431 junction, against
    // 1,760 / 447 before them. The keep-out costs 1.2% of the ribbon wear and
    // 3.6% of the junction wear — the re-draw loop resolves nearly every
    // rejected slot to a smaller cell instead of losing it — so the V4 floor
    // still has real headroom and paint legibility is bought almost free.
    expect(world.stats.roadDecals).toBeGreaterThan(1500);
    expect(world.stats.roadDecals).toBeLessThan(4000);
    // …and a real share of it now sits INSIDE the junctions, which carried
    // none at all before (ribbons are trimmed back to the approach cuts).
    expect(world.stats.junctionDecals).toBeGreaterThan(50);
    expect(world.roadDecals.positions.length / 3).toBe(world.stats.roadDecals * 4);
    for (let i = 1; i < world.roadDecals.positions.length; i += 3) {
      const y = world.roadDecals.positions[i]!;
      expect(
        Math.abs(y - ROAD_DECAL_Y) < 1e-6 || Math.abs(y - JUNCTION_DECAL_Y) < 1e-6,
      ).toBe(true);
    }
  });

  it("stays inside the performance budget", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(900_000);
    expect(world.stats.trees).toBeGreaterThan(200);
    expect(world.stats.trees).toBeLessThan(4000);
    expect(world.stats.streetlights).toBeGreaterThan(50);
  });

  it("terrain stays at/below road level near roads and within relief bounds", () => {
    const pos = world.terrain.positions;
    for (let i = 1; i < pos.length; i += 3) {
      expect(pos[i]!).toBeLessThanOrEqual(0.3);
      expect(pos[i]!).toBeGreaterThanOrEqual(-0.011);
    }
  });

  it("is deterministic end to end", () => {
    const again = buildWorldGeometry(district);
    expect(again.stats).toEqual(world.stats);
    expect(again.markings.positions.length).toBe(world.markings.positions.length);
    // Spot-check a buffer for byte equality.
    expect(Array.from(again.sidewalks.indices.slice(0, 300))).toEqual(
      Array.from(world.sidewalks.indices.slice(0, 300)),
    );
  });
});
