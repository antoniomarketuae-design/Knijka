/**
 * OV one-way archetype contract battery (Scenario Studio doc 76 §3; the
 * sp-districts.test.ts pattern).
 *
 * content/world/ov-oneway-v1.json is the lane-discipline generated micro-map
 * (tools/maps/gen_ov_oneway.mjs — one straight single-lane one-way street, 300 m,
 * 50 km/h, legal flow north). The battery proves the file satisfies the FULL
 * engine contract, with the archetype's REASON TO EXIST verified end-to-end: the
 * runtime's oneway / wrongWay surface feeds the rule engine's WRONG_WAY grading
 * (heading against the flow), and the with-flow drive stays clean.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const X_LANE = 0; // the one-way lane centers on the polyline

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ov-oneway-v1.json not found (run: node tools/maps/gen_ov_oneway.mjs) in: ${candidates.join(", ")}`);
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

describe("ov-oneway-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (single-lane one-way)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(1);
    expect(road.oneway).toBe(true);
    expect(road.maxspeed).toBe(50);
    expect(road.length).toBe(300);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ov-ow-spawn-entry",
      "ov-ow-spawn-finish",
    ]);
  });

  it("hosts a plain one-way street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
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

  it("stays trivially inside the performance budget (micro-map)", () => {
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-oneway-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-oneway-v1 through the world runtime — the oneway/wrongWay surface", () => {
  it("derives ZERO signals, stop lines and junction trackers", () => {
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("marks the edge oneway=true and flags the heading against the flow as wrongWay", () => {
    const withFlow = createWorldRuntime(loadRaw());
    withFlow.update(1 / 60);
    const north = withFlow.sample(sample(X_LANE, 100, 0, 40), 1, false); // heading north = flow
    expect(north.edgeId).toBe("ov-ow-street");
    expect(north.laneCount ?? 1).toBe(1);
    expect(north.oneway).toBe(true);
    expect(north.wrongWay).toBe(false);
    expect(Math.abs(north.laneOffsetM)).toBeLessThan(0.2);

    const against = createWorldRuntime(loadRaw());
    against.update(1 / 60);
    const south = against.sample(sample(X_LANE, 100, 180, 40), 1, false); // heading south = against
    expect(south.wrongWay).toBe(true);
  });

  it("grades direction through the REAL reducer: against the flow = WRONG_WAY; with the flow = clean", () => {
    const drive = (headingDeg: number, yStep: number): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      let y = 150;
      // ~3 s of forward driving at 40 km/h in the given heading (past the 1.5 s
      // wrong-way sustain).
      for (let i = 0; i < 30; i++) {
        t += dt;
        y += yStep;
        rt.update(dt);
        const tick = rt.sample(sample(X_LANE, y, headingDeg, 40), t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      }
      return out;
    };

    const withFlow = drive(0, (40 / 3.6) * 0.1); // north, y increasing
    expect(withFlow.filter((e) => e.kind === "violation")).toEqual([]);

    const against = drive(180, -(40 / 3.6) * 0.1); // south, y decreasing
    const codes = against.filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...new Set(codes)]).toEqual(["WRONG_WAY"]);
  });
});

describe("ov-oneway-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 1 directed lane (one-way)", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(1);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty street)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_LANE, 15, 0)).toBe(Infinity);
  });
});
