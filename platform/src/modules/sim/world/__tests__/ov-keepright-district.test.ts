/**
 * OV keep-right archetype contract battery (Scenario Studio doc 76 §3; the
 * ln-district.test.ts pattern).
 *
 * content/world/ov-keepright-v1.json is the lane-discipline generated micro-map
 * (tools/maps/gen_ov_keepright.mjs — one straight 2+2 boulevard, 360 m, 50 km/h).
 * The battery proves the file satisfies the FULL engine contract, with the
 * archetype's REASON TO EXIST verified end-to-end: the runtime's laneId /
 * laneCount surface feeds the rule engine's keep-right grading (NOT_KEEPING_RIGHT
 * — sustained non-rightmost-lane cruising; a right-lane cruise stays clean).
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

/** Drawn lane centers of the northbound bank (8.125 m lane, centerline x=0). */
const LANE_RIGHT_X = 12.19;
const LANE_LEFT_X = 4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-keepright-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-keepright-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `ov-keepright-v1.json not found (run: node tools/maps/gen_ov_keepright.mjs) in: ${candidates.join(", ")}`,
  );
}

const sample = (
  x: number,
  y: number,
  headingDeg: number,
  speedKmh: number,
  extra?: Partial<VehicleSample>,
): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "off",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
  ...extra,
});

describe("ov-keepright-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (2+2 boulevard shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(4);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(50);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ov-kr-spawn-finish",
      "ov-kr-spawn-left",
      "ov-kr-spawn-start",
    ]);
    // The R3 #45 redesign spawn: the LEFT lane, so „дръж вдясно" is an act.
    const left = district.spawnPoints.find((s) => s.id === "ov-kr-spawn-left")!;
    expect(left.x).toBe(LANE_LEFT_X);
    expect(left.y).toBe(15);
  });

  it("hosts a plain boulevard: no lights, no stop signs, no zebras", () => {
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
      path.join(process.cwd(), "content", "world", "ov-keepright-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-keepright-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-keepright-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-keepright-v1 through the world runtime — the laneId/laneCount surface", () => {
  it("derives ZERO signals, stop lines and junction trackers", () => {
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("numbers the northbound bank right→left: laneId 0 @ x=12.19, laneId 1 @ x=4.06, laneCount 2", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const right = rt.sample(sample(LANE_RIGHT_X, 100, 0, 40), 1, false);
    expect(right.edgeId).toBe("ov-kr-road");
    expect(right.laneId).toBe(0);
    expect(right.laneCount).toBe(2);
    expect(Math.abs(right.laneOffsetM)).toBeLessThan(0.2);
    expect(right.maxSpeedKmh).toBe(50);
    expect(right.oneway).toBe(false);

    const left = rt.sample(sample(LANE_LEFT_X, 110, 0, 40), 2, false);
    expect(left.laneId).toBe(1);
    expect(left.laneCount).toBe(2);
    expect(Math.abs(left.laneOffsetM)).toBeLessThan(0.2);
  });

  it("grades keep-right through the REAL reducer: left-lane hog = NOT_KEEPING_RIGHT; right-lane cruise = clean", () => {
    const cruise = (x: number): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      // ~15 s of forward cruising at 40 km/h in the given lane (past the 12 s
      // keep-right sustain).
      for (let y = 15; y < 15 + 40 / 3.6 * 15; y += (40 / 3.6) * dt) {
        t += dt;
        rt.update(dt);
        const tick = rt.sample(sample(x, y, 0, 40), t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      }
      return out;
    };

    const rightLane = cruise(LANE_RIGHT_X);
    expect(rightLane.filter((e) => e.kind === "violation")).toEqual([]);

    const leftLane = cruise(LANE_LEFT_X);
    const codes = leftLane.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("NOT_KEEPING_RIGHT");
    expect([...new Set(codes)]).toEqual(["NOT_KEEPING_RIGHT"]);
  });
});

describe("ov-keepright-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 directed lanes", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(2);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty boulevard)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LANE_RIGHT_X, y: 15 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    expect(traffic.leadGapMeters(LANE_RIGHT_X, 15, 0)).toBe(Infinity);
  });
});
