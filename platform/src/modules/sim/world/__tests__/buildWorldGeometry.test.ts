/**
 * Builder tests on BOTH a synthetic micro-district (exact expectations) and
 * the real content/world/district-v1.json (structural invariants + budget).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { LESSON_PARKING_BAYS } from "../../lessons/specs";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import {
  CURB_HEIGHT_M,
  LANE_WIDTH_M,
  PARKING_LANE_WIDTH_M,
  PARKING_LANE_Y,
  ROAD_Y,
  SIDEWALK_TOP_Y,
} from "../builders/constants";
import { assertDistrict, type District, type WorldGeometry } from "../types";

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
    // First ribbon is eN (secondary, 4 lanes): first two vertices are the L/R
    // pair of the first cross-section -> travel lanes + a parking band per
    // side (QW3 arterial cross-section).
    const pos = world.roadSurface.positions;
    const dx = pos[0]! - pos[3]!;
    const dz = pos[2]! - pos[5]!;
    expect(Math.hypot(dx, dz)).toBeCloseTo(4 * LANE_WIDTH_M + 2 * PARKING_LANE_WIDTH_M, 3);
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

  it("places one traffic light per approach with the junction node id", () => {
    expect(world.trafficLights.length).toBe(4);
    for (const tl of world.trafficLights) {
      expect(tl.nodeId).toBe("nC");
      // Poles stand outside the roadway but near the junction mouth (the
      // scaled open radius reaches ~35 m here, pole ~42 m out).
      const d = Math.hypot(tl.position[0], tl.position[2]);
      expect(d).toBeGreaterThan(LANE_WIDTH_M);
      expect(d).toBeLessThan(50);
    }
  });

  it("places limit-50 signs at district entry roads", () => {
    expect(world.stats.signs.limit50).toBeGreaterThanOrEqual(1);
  });

  it("extrudes the building with 4 wall variants buckets and a roof", () => {
    const total = world.buildingWalls.reduce((s, w) => s + w.positions.length, 0);
    expect(total).toBeGreaterThan(0);
    expect(world.buildingRoofs.indices.length).toBeGreaterThanOrEqual(6);
    // Roof height = building height.
    expect(world.buildingRoofs.positions[1]).toBeCloseTo(15);
    // Ground-floor band: some wall vertices carry the darker tint.
    const walls = world.buildingWalls.find((w) => w.positions.length > 0)!;
    expect(walls.colors).toBeDefined();
    const tints = new Set<number>();
    for (let i = 0; i < walls.colors!.length; i += 3) tints.add(walls.colors![i]!);
    expect(tints.size).toBe(2);
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
    for (const list of [world.trafficLights, world.signs, world.streetlights, world.trees]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("places traffic lights only at signalized intersections", () => {
    expect(world.trafficLights.length).toBeGreaterThan(10);
    const signalized = new Set(
      district.intersections.filter((i) => i.signalized).map((i) => i.id),
    );
    for (const tl of world.trafficLights) {
      expect(signalized.has(tl.nodeId)).toBe(true);
    }
  });

  it("places the BG sign set (give-way, stop, limit-50, roundabout)", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThan(5);
    expect(world.stats.signs.limit50).toBeGreaterThanOrEqual(1);
    // One mapped roundabout -> its entries carry Д11.
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(2);
  });

  it("paints zebras for marked/signal crossings that sit on drivable edges", () => {
    const paintable = district.crossings.filter(
      (c) => c.edgeId && (c.kind === "marked" || c.kind === "signals"),
    ).length;
    expect(world.stats.zebraCrossings).toBeGreaterThan(paintable * 0.8);
    expect(world.stats.zebraCrossings).toBeLessThanOrEqual(paintable);
  });

  it("renders a mid-rise district: prisms for the fabric, few towers, data heights (QW3)", () => {
    // Every footprint is either a facade prism or a tower instance.
    expect(world.stats.buildings).toBe(district.buildings.length);
    // Towers only where OSM says genuinely tall AND the plot is compact —
    // a handful in Студентски град, not all 248 (the old 42–170 m canyon).
    expect(world.stats.buildingInstances).toBeGreaterThanOrEqual(1);
    expect(world.stats.buildingInstances).toBeLessThanOrEqual(12);
    for (const inst of world.buildingInstances) {
      expect(inst.scale[1]).toBeGreaterThanOrEqual(40);
      expect(inst.scale[1]).toBeLessThanOrEqual(75);
    }
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

  it("stays inside the performance budget", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
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
