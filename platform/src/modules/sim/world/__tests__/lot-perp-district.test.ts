/**
 * PARKING-LOT archetype contract battery (Scenario Studio doc 76 §3; the
 * poligon-district.test.ts pattern).
 *
 * content/world/lot-perp-v1.json is the P0 generated micro-map
 * (tools/maps/gen_parking_lot.mjs — perpendicular row, bayWidth 2.7 m,
 * 4 occupied neighbors around one free bay). The battery proves the file
 * satisfies the FULL engine contract every district drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry (ribbons, colliders,
 *                paint incl. the 5 scenario bays) with zero errors;
 *   2. runtime — createWorldRuntime: NO signals, NO stop lines, NO junctions
 *                (a lot teaches low-speed maneuvering, nothing else), 20 km/h
 *                everywhere, clean sample() ticks up the approach;
 *   3. traffic — buildLaneGraph (approach only — the service aisle is
 *                excluded) + createTrafficSystem with vehicleCount/
 *                pedestrianCount 0: an EMPTY lot must be a legal traffic
 *                config (scenario micro-maps run without ambient traffic).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { ParkingBaySpec, VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

function loadLotRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "lot-perp-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "lot-perp-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `lot-perp-v1.json not found (run: node tools/maps/gen_parking_lot.mjs) in: ${candidates.join(", ")}`,
  );
}

/** The generator's bay truth (meta.scenario) — painted exactly like lesson
 *  bays (ParkingBaySpec → buildWorldGeometry options; the L7/полигон pattern). */
function scenarioBays(raw: unknown): ParkingBaySpec[] {
  const meta = (raw as { meta: { scenario: { bays: Array<ParkingBaySpec & { occupied: boolean }> } } })
    .meta.scenario;
  return meta.bays.map(({ x, y, headingDeg, widthM, lengthM }) => ({
    x,
    y,
    headingDeg,
    widthM,
    lengthM,
  }));
}

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

describe("lot-perp-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;
  let bays: ParkingBaySpec[];

  beforeAll(() => {
    raw = loadLotRaw();
    district = assertDistrict(raw);
    bays = scenarioBays(raw);
    world = buildWorldGeometry(district, { seed: 7, parkingBays: bays });
  });

  it("is a structurally valid district-v1 document (lot shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(3);
    expect(district.roads.edges.length).toBe(2);
    expect(district.intersections.length).toBe(0); // straight joint = degree 2
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "lot-spawn-approach",
      "lot-spawn-finish",
    ]);
  });

  it("covers both edges with ribbons and paints all 5 scenario bays", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(2);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.parkingBays).toBe(5);
    // The bay U-paint rides the markings mesh: 3 quads per bay (L7 pattern).
    const bare = buildWorldGeometry(district, { seed: 7, parkingBays: [] });
    expect(bare.stats.parkingBays).toBe(0);
    expect(world.stats.markingQuads).toBe(bare.stats.markingQuads + 15);
  });

  it("hosts a parking lot, not a street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.stats.billboards).toBe(0);
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
    for (const list of [world.signs, world.streetlights, world.trees, world.busStops]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("builds valid colliders over the whole ground", () => {
    const g = world.colliders.ground;
    expect(g.halfExtents[0]).toBeGreaterThan(10);
    expect(g.halfExtents[2]).toBeGreaterThan(80);
    for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(c.positions.length % 3).toBe(0);
      expect(c.indices.length % 3).toBe(0);
      if (c.indices.length > 0) {
        const maxIdx = Math.max(...Array.from(c.indices));
        expect(maxIdx).toBeLessThan(c.positions.length / 3);
      }
    }
  });

  it("stays trivially inside the performance budget (micro-map)", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7, parkingBays: bays });
    expect(again.stats).toEqual(world.stats);
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });
});

describe("lot-perp-v1 through the world runtime", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadLotRaw());
  });

  it("derives ZERO signals, stop lines and junction trackers (lot by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves 20 km/h everywhere (approach, aisle, off-map default)", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -105 })).toBe(20); // approach
    expect(runtime.speedLimitAt({ x: 0, y: 10 })).toBe(20); // aisle
    expect(runtime.speedLimitAt({ x: 200, y: 200 })).toBe(20); // meta default
  });

  it("locates both spawn points on their authored edges", () => {
    expect(runtime.locate({ x: 0, y: -105 }).edgeId).toBe("lot-e-approach");
    expect(runtime.locate({ x: 0, y: 18.75 }).edgeId).toBe("lot-e-aisle");
  });

  it("STOP_LINE_OVERRIDES stays skip-safe on this foreign map (doc 74 §5.6)", () => {
    expect(STOP_LINE_OVERRIDES.length).toBeGreaterThan(0);
    const raw = loadLotRaw() as { roads: { edges: Array<{ id: string }> } };
    const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
    for (const ov of STOP_LINE_OVERRIDES) {
      expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
    }
    expect(runtime.debugStopLines()).toEqual([]);
  });

  it("samples a clean northbound run up the approach (no phantom events)", () => {
    runtime.update(1 / 60);
    let t = 0;
    for (let y = -115; y <= -35; y += 5) {
      t += 0.5;
      const tick = runtime.sample(sample(0, y, 0, 15), t, false);
      expect(tick.maxSpeedKmh).toBe(20);
      expect(tick.wrongWay).toBe(false);
      expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
      expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
      expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
    }
  });
});

describe("lot-perp-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadLotRaw() as TrafficDistrict;
  });

  it("builds the lane graph: approach only (service aisle excluded), loopable", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // 1 routable two-way edge → 2 directed lanes, both in the SCC (a dead-end
    // U-turn closes the loop).
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    expect(graph.crossingSignalNode.size).toBe(0);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty scenario lot)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: -105 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    expect(traffic.stats.laneCount).toBe(2);
    // The empty system updates without error and reports a clear road.
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: -105 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.pedestrians.length).toBe(0);
    expect(traffic.leadGapMeters(0, -105, 0)).toBe(Infinity);
    expect(traffic.conflictNear(0, -30, 20, 0)).toBe(false);
  });

  it("can still stage a scripted actor on the approach (future demos)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: -105 },
      anchorRadiusM: 400,
    });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "lot-test-car",
      pathNodes: ["lot-n-start", "lot-n-gate"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 4,
    });
    expect(staged).not.toBeNull();
    traffic.stagedCommand("lot-test-car", { type: "cruise" });
    for (let i = 0; i < 240; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    expect(traffic.staged("lot-test-car")!.s).toBeGreaterThan(5);
  });
});
