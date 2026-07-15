/**
 * OV lane-keeping archetype contract battery (Scenario Studio doc 76 §3; the
 * sp-districts.test.ts pattern).
 *
 * content/world/ov-lane-v1.json is the lane-discipline generated micro-map
 * (tools/maps/gen_ov_lanekeep.mjs — one straight 1+1 two-way street, 300 m,
 * 50 km/h). The battery proves the file satisfies the FULL engine contract, with
 * the archetype's REASON TO EXIST verified end-to-end: the runtime's
 * laneOffsetM / oneway surface feeds the rule engine's lane-keeping grading
 * (POOR_LANE_KEEPING toward the curb; CENTER_LINE_TOUCHED toward oncoming), and
 * the centered drive stays clean.
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

const X_LANE = 4.06; // right-lane center of a 1+1 street (drawn lane 8.125 m)
const X_CURB_EDGE = 7.7; // toward the curb (offset ≈ −3.64)
const X_CENTER_LINE = 0.5; // toward the осева линия (offset ≈ +3.56)

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-lane-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-lane-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ov-lane-v1.json not found (run: node tools/maps/gen_ov_lanekeep.mjs) in: ${candidates.join(", ")}`);
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

describe("ov-lane-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (plain 1+1 street)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(50);
    expect(road.length).toBe(300);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ov-ln-spawn-approach",
      "ov-ln-spawn-finish",
    ]);
  });

  it("hosts a plain street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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
      path.join(process.cwd(), "content", "world", "ov-lane-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-lane-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-lane-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-lane-v1 through the world runtime — the laneOffset surface", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("surfaces the single northbound lane (laneId 0, laneCount 1, oneway=false)", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const tick = rt.sample(sample(X_LANE, 100, 0, 40), 1, false);
    expect(tick.edgeId).toBe("ov-ln-street");
    expect(tick.laneId).toBe(0);
    expect(tick.laneCount ?? 1).toBe(1); // 1 lane per direction — keep-right never applies
    expect(Math.abs(tick.laneOffsetM)).toBeLessThan(0.2);
    expect(tick.maxSpeedKmh).toBe(50);
    expect(tick.oneway).toBe(false);
  });

  it("grades lane position through the REAL reducer: curb-edge = POOR_LANE_KEEPING; center-line = CENTER_LINE_TOUCHED; centered = clean", () => {
    const cruise = (x: number): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      // ~6 s of forward cruising at 30 km/h at the given lateral position (past
      // both the 3 s lane-keep and 3.5 s center-line sustains).
      for (let y = 15; y < 15 + 30 / 3.6 * 6; y += (30 / 3.6) * dt) {
        t += dt;
        rt.update(dt);
        const tick = rt.sample(sample(x, y, 0, 30), t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      }
      return out;
    };

    const centered = cruise(X_LANE);
    expect(centered.filter((e) => e.kind === "violation")).toEqual([]);

    const curb = cruise(X_CURB_EDGE).filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...new Set(curb)]).toEqual(["POOR_LANE_KEEPING"]);

    const centerLine = cruise(X_CENTER_LINE).filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...new Set(centerLine)]).toEqual(["CENTER_LINE_TOUCHED"]);
  });
});

describe("ov-lane-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 directed lanes, no crossing bindings", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
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
