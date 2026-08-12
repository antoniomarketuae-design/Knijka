/**
 * TWO-LANE-ROAD archetype contract battery (Scenario Studio doc 76 §3; the
 * lot-perp-district.test.ts pattern).
 *
 * content/world/ln-v1.json is the lanes-family generated micro-map
 * (tools/maps/gen_two_lane_road.mjs — one straight 2+2 boulevard, 400 m,
 * 50 km/h). The battery proves the file satisfies the FULL engine contract,
 * with the archetype's REASON TO EXIST verified end-to-end: the runtime's
 * laneId / laneCount / edgeId surface feeds the rule engine's lane-change
 * grading (LANE_CHANGE_WITHOUT_INDICATOR / _MIRROR_CHECK / SAFE_LANE_CHANGE).
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
    path.join(process.cwd(), "content", "world", "ln-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ln-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `ln-v1.json not found (run: node tools/maps/gen_two_lane_road.mjs) in: ${candidates.join(", ")}`,
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

describe("ln-v1 through the world builder", () => {
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
      "ln-spawn-finish",
      "ln-spawn-start",
    ]);
  });

  it("hosts a plain boulevard: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(1);
    expect(world.stats.skippedRibbons).toBe(0);
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
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "ln-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ln-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ln-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ln-v1 through the world runtime — the laneId/laneCount surface", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("numbers the northbound bank right→left: laneId 0 @ x=12.19, laneId 1 @ x=4.06, laneCount 2", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const right = rt.sample(sample(LANE_RIGHT_X, 100, 0, 40), 1, false);
    expect(right.edgeId).toBe("ln-e-road");
    expect(right.laneId).toBe(0);
    expect(right.laneCount).toBe(2);
    expect(Math.abs(right.laneOffsetM)).toBeLessThan(0.2);
    expect(right.maxSpeedKmh).toBe(50);
    expect(right.oneway).toBe(false);

    const left = rt.sample(sample(LANE_LEFT_X, 110, 0, 40), 2, false);
    expect(left.laneId).toBe(1);
    expect(left.laneCount).toBe(2);
    expect(Math.abs(left.laneOffsetM)).toBeLessThan(0.2);

    // The opposing bank mirrors: southbound curb lane is ITS laneId 0.
    const rt2 = createWorldRuntime(loadRaw());
    rt2.update(1 / 60);
    const south = rt2.sample(sample(-LANE_RIGHT_X, 200, 180, 40), 1, false);
    expect(south.laneId).toBe(0);
    expect(south.laneCount).toBe(2);
  });

  it("grades a full lane change through the REAL reducer: signalled+mirrored = SAFE_LANE_CHANGE; blind = both violations", () => {
    const drive = (opts: { indicator: boolean; glance: boolean }): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      const feed = (v: VehicleSample) => {
        t += dt;
        rt.update(dt);
        const tick = rt.sample(v, t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      };
      // Cruise the right lane at 40 km/h (11.1 m/s ≈ 1.11 m per frame).
      for (let y = 15; y < 150; y += 1.11) feed(sample(LANE_RIGHT_X, y, 0, 40));
      // Mirror + indicator just before the move (the taught ritual).
      if (opts.glance) feed(sample(LANE_RIGHT_X, 150, 0, 40, { mirrorGlance: "left" }));
      const ind = opts.indicator ? ("left" as const) : ("off" as const);
      // Smooth diagonal into the left lane (~8.1 m lateral over ~45 m).
      for (let i = 0; i <= 40; i++) {
        const y = 151 + i * 1.11;
        const x = LANE_RIGHT_X - (LANE_RIGHT_X - LANE_LEFT_X) * (i / 40);
        feed(sample(x, y, 350, 40, { indicator: ind }));
      }
      // Settle in the left lane long enough for the joint-grace hold to emit.
      for (let y = 196; y < 240; y += 1.11) feed(sample(LANE_LEFT_X, y, 0, 40, { indicator: ind }));
      return out;
    };

    const clean = drive({ indicator: true, glance: true });
    expect(clean.filter((e) => e.kind === "violation")).toEqual([]);
    expect(clean.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")).toBe(true);

    const blind = drive({ indicator: false, glance: false });
    const codes = blind.filter((e) => e.kind === "violation").map((e) => e.code);
    expect(codes).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
    expect(blind.some((e) => e.kind === "commendation" && e.code === "SAFE_LANE_CHANGE")).toBe(false);
  });
});

describe("ln-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 directed lanes riding the RIGHT lane centers (±12.19)", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(2);
    for (const lane of graph.lanes) {
      // Ambient/staged agents drive the curb lane of their bank by default:
      // offset (perDir − 0.5) × 8.125 = 12.19 to the right of travel.
      expect(Math.abs(Math.abs(lane.px[0]) - 12.19)).toBeLessThan(0.05);
    }
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
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: LANE_RIGHT_X, y: 15 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.leadGapMeters(LANE_RIGHT_X, 15, 0)).toBe(Infinity);
  });

  it("stages TARGET-LANE traffic: extraRightOffsetM −8.125 puts the actor on the LEFT lane center", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: LANE_RIGHT_X, y: 15 },
      anchorRadiusM: 400,
    });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "ln-test-leftlane",
      pathNodes: ["ln-n-start", "ln-n-end"],
      hold: { nodeIndex: 0, offsetM: 20 },
      cruiseSpeedMps: 9,
      extraRightOffsetM: -8.125, // one drawn lane to the LEFT of the curb lane
    });
    expect(staged).not.toBeNull();
    expect(Math.abs(traffic.staged("ln-test-leftlane")!.x - LANE_LEFT_X)).toBeLessThan(0.05);
    traffic.stagedCommand("ln-test-leftlane", { type: "cruise" });
    for (let i = 0; i < 240; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    const view = traffic.staged("ln-test-leftlane")!;
    expect(view.s).toBeGreaterThan(20);
    expect(Math.abs(view.x - LANE_LEFT_X)).toBeLessThan(0.05); // stays in the target lane
  });
});
