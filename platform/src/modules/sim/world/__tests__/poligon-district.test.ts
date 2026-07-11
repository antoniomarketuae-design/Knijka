/**
 * ПОЛИГОН prototype validation (map program doc 74, prototype P1).
 *
 * content/world/poligon-v1.json is the first NON-OSM, hand-authored district
 * (tools/maps/gen_poligon.mjs). This test proves the file satisfies the FULL
 * engine contract the real city district drives through:
 *
 *   1. world    — assertDistrict + buildWorldGeometry (meshes, colliders,
 *                 paint incl. lesson-authored parking bays) with zero errors;
 *   2. runtime  — parseDistrict + createWorldRuntime: zero signals/stop lines
 *                 by design, all 7 junctions uncontrolled (right-hand rule),
 *                 correct speed zones (30 circuit / 20 aprons), clean sample()
 *                 ticks along the start straight;
 *   3. traffic  — buildLaneGraph (36 directed lanes, ALL loopable) +
 *                 createTrafficSystem: ambient routes close, agents advance,
 *                 a staged instructor-car path resolves across the spine.
 *
 * If this passes, the engine is map-agnostic for полигон-class districts —
 * the remaining multi-map work is the loader seam (doc 74 §5), not the data
 * contract.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParkingBaySpec, VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

function loadPoligonRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "poligon-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "poligon-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `poligon-v1.json not found (run: node tools/maps/gen_poligon.mjs) in: ${candidates.join(", ")}`,
  );
}

/**
 * Lesson-authored bay paint for the полигон drills — SAME ParkingBaySpec
 * pattern as L7 (bays are curriculum data, not map data; the map only hosts
 * them). Parallel bay on the start straight + perpendicular bay on the apron.
 */
const POLIGON_BAYS: readonly ParkingBaySpec[] = [
  { x: 40, y: -135, headingDeg: 90, widthM: 3.0, lengthM: 6.6 },
  { x: 98.5, y: -70, headingDeg: 90, widthM: 3.0, lengthM: 6.6 },
];

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

describe("poligon-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadPoligonRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7, parkingBays: POLIGON_BAYS });
  });

  it("is a structurally valid district-v1 document", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(17);
    expect(district.roads.edges.length).toBe(20);
    expect(district.intersections.length).toBe(7);
    expect(district.intersections.every((i) => !i.signalized)).toBe(true);
    expect(district.crossings.length).toBe(1);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.length).toBe(3);
  });

  it("covers every edge with a ribbon or a junction patch", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(20);
    expect(world.stats.skippedRibbons).toBe(0);
    // 7 junctions + the 8 degree-2 arc joints all produce patches.
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(7);
  });

  it("produces no NaN/infinite coordinates in any buffer or placement", () => {
    const buffers = [
      world.roadSurface,
      world.junctionSurface,
      world.sidewalks,
      world.markings,
      world.parkingLanes,
      world.roadDecals,
      world.terrain,
      world.terrainPaved,
      world.buildingRoofs,
      ...world.buildingWalls,
    ];
    let nonFinite = 0;
    for (const mesh of buffers) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
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

  it("hosts a полигон, not a city: no signals, no stop signs, one zebra", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.zebraCrossings).toBe(1);
    // No primary streets → no billboards/palms; no OSM parking sites → no kits.
    expect(world.stats.billboards).toBe(0);
    expect(world.stats.parkingKits).toBe(0);
  });

  it("paints both lesson-authored bays (3 quads each — the L7 pattern)", () => {
    const bare = buildWorldGeometry(district, { seed: 7, parkingBays: [] });
    expect(bare.stats.parkingBays).toBe(0);
    expect(world.stats.parkingBays).toBe(2);
    expect(world.stats.markingQuads).toBe(bare.stats.markingQuads + 6);
  });

  it("builds valid colliders: ground box covers the ground, trimeshes indexed", () => {
    const g = world.colliders.ground;
    expect(g.halfExtents[0]).toBeGreaterThan(190);
    expect(g.halfExtents[2]).toBeGreaterThan(130);
    for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(c.positions.length % 3).toBe(0);
      expect(c.indices.length % 3).toBe(0);
      expect(c.indices.length).toBeGreaterThan(0);
      const maxIdx = Math.max(...Array.from(c.indices));
      expect(maxIdx).toBeLessThan(c.positions.length / 3);
    }
  });

  it("stays far inside the performance budget (tiny map)", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7, parkingBays: POLIGON_BAYS });
    expect(again.stats).toEqual(world.stats);
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });
});

describe("poligon-v1 through the world runtime", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadPoligonRaw());
  });

  it("parses and derives ZERO signals and ZERO stop lines (полигон by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
  });

  it("treats all 7 junctions as uncontrolled right-hand-rule junctions", () => {
    const ids = runtime.debugUncontrolledJunctions().map((j) => j.id).sort();
    expect(ids).toEqual([
      "pg-n-c",
      "pg-n-e0",
      "pg-n-g2",
      "pg-n-n0",
      "pg-n-p1",
      "pg-n-s0",
      "pg-n-w0",
    ]);
  });

  it("resolves the полигон speed zones: 30 circuit, 20 aprons, 30 off-road default", () => {
    expect(runtime.speedLimitAt({ x: 20, y: -130 })).toBe(30); // старт-стоп права
    expect(runtime.speedLimitAt({ x: 0, y: 65 })).toBe(30); // централна алея
    expect(runtime.speedLimitAt({ x: -95, y: -105 })).toBe(20); // слаломен коридор
    expect(runtime.speedLimitAt({ x: 0, y: -400 })).toBe(30); // off-map → meta default
  });

  it("locates every spawn point on its authored edge", () => {
    expect(runtime.locate({ x: 20, y: -130 }).edgeId).toBe("pg-e-s3");
    expect(runtime.locate({ x: -95, y: -105 }).edgeId).toBe("pg-e-apron-slalom");
    expect(runtime.locate({ x: 95, y: -105 }).edgeId).toBe("pg-e-apron-bays");
  });

  it("samples a clean eastbound run down the start straight (no phantom events)", () => {
    runtime.update(1 / 60);
    let t = 0;
    for (let x = 5; x <= 90; x += 5) {
      t += 0.5;
      const tick = runtime.sample(sample(x, -130, 90, 25), t, false);
      expect(tick.maxSpeedKmh).toBe(30);
      expect(tick.wrongWay).toBe(false);
      expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
      expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
      expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
    }
  });
});

describe("poligon-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadPoligonRaw() as TrafficDistrict;
  });

  it("builds a fully loopable lane graph (service aprons excluded)", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // 18 routable two-way edges → 36 directed lanes, ALL in one SCC.
    expect(graph.lanes.length).toBe(36);
    expect(graph.loopLanes.size).toBe(36);
    // The zebra maps onto both directed lanes of the north spine.
    expect(graph.crossingLanes.get("pg-x-1")?.length).toBe(2);
    // No signals anywhere → no crossing↔signal mapping.
    expect(graph.crossingSignalNode.size).toBe(0);
    // Junction mouths resolved for the 4-way (NPC stop points exist).
    expect(graph.junctionRadiusM.get("pg-n-c")).toBeGreaterThan(0);
  });

  it("runs ambient traffic + a staged instructor car with zero errors", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 6,
      pedestrianCount: 2,
      anchor: { x: 20, y: -130 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.laneCount).toBe(36);
    expect(traffic.stats.routeCount).toBeGreaterThanOrEqual(1);
    expect(traffic.stats.vehicleCount).toBe(6);
    expect(traffic.stats.pedestrianCount).toBeGreaterThanOrEqual(1);

    // Staged path across the spine (future полигон instructor-car drills).
    const staged = traffic.stage({
      kind: "vehicle",
      id: "pg-test-car",
      pathNodes: ["pg-n-s0", "pg-n-c", "pg-n-n0"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 5,
    });
    expect(staged).not.toBeNull();
    traffic.stagedCommand("pg-test-car", { type: "cruise" });

    for (let i = 0; i < 240; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 20, y: -130 },
        playerSpeedKmh: 0,
      });
    }

    // Every agent stays finite and on/near the ground (bounds + margin).
    for (const v of traffic.vehicles) {
      expect(Number.isFinite(v.x) && Number.isFinite(v.y)).toBe(true);
      expect(Math.abs(v.x)).toBeLessThan(190 + 60);
      expect(Math.abs(v.y)).toBeLessThan(130 + 60);
    }
    for (const p of traffic.pedestrians) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
    }
    // The staged car actually drove its resolved path.
    expect(traffic.staged("pg-test-car")!.s).toBeGreaterThan(5);
  });

  it("is deterministic: same seed + same dt sequence = identical playback", () => {
    const run = () => {
      const t = createTrafficSystem(raw, {
        seed: 42,
        vehicleCount: 4,
        pedestrianCount: 1,
        anchor: { x: 20, y: -130 },
        anchorRadiusM: 400,
      });
      for (let i = 0; i < 120; i++) {
        t.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      }
      return t.vehicles.map((v) => [v.x, v.y, v.speedMps]);
    };
    expect(run()).toEqual(run());
  });
});
