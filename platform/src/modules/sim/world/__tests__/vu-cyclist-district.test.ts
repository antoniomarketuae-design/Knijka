/**
 * VU-cyclist archetype contract battery (Scenario Studio doc 76 §3; the
 * tj-districts.test.ts pattern).
 *
 * content/world/vu-cyclist-v1.json is the VRU scenario micro-map
 * (tools/maps/gen_vu_cyclist.mjs — an uncontrolled T-junction: a W–E through
 * road the driver AND a curb-riding cyclist share, plus a south stem the driver
 * turns right onto). The battery proves the file satisfies the FULL engine
 * contract, with the archetype's REASON TO EXIST verified: the junction derives
 * ZERO stop lines (so ONLY the staged cyclistRightHook director grades the
 * right hook), and the cyclist's lane-graph path (vu-n-w → vu-n-c → vu-n-e) is
 * routable for the traffic staging port.
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

/** Pinned lane centers (denormalized into templates-vru.ts as THROUGH_Y / STEM_X). */
const THROUGH_LANE_Y = -4.06;
const STEM_LANE_X = -4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "vu-cyclist-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "vu-cyclist-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `vu-cyclist-v1.json not found (run: node tools/maps/gen_vu_cyclist.mjs) in: ${candidates.join(", ")}`,
  );
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

describe("vu-cyclist-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (uncontrolled T shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    expect(district.roads.edges.every((e) => e.class === "residential")).toBe(true);
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "vu-n-c", degree: 3, signalized: false });
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "vu-spawn-east",
      "vu-spawn-south",
      "vu-spawn-west",
    ]);
  });

  it("hosts an equal junction: no lights, no signs, no zebras (right-hand rule)", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("covers every edge with a ribbon and patches the junction", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(3);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
  });

  it("produces no NaN/infinite coordinates in the road/junction buffers", () => {
    let nonFinite = 0;
    for (const mesh of [world.roadSurface, world.junctionSurface, world.markings]) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });
});

describe("vu-cyclist-v1 through the runtime + rule engine", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives an UNCONTROLLED junction (no stop line on any approach)", () => {
    // Approaching vu-n-c eastbound in the through lane: no Б2 line crossing is
    // ever reported (the whole reason the cyclist runner, not a stop rule,
    // grades this scenario).
    let rules = createRuleEngine();
    const events: RuleEvent[] = [];
    for (let i = 0; i < 60; i++) {
      const y = THROUGH_LANE_Y;
      const x = -60 + i * 1.0;
      const tick = runtime.sample(sample(x, y, 90, 40), i * 0.2, false, false, undefined);
      const reduced = reduceTick(rules, tick);
      rules = reduced.state;
      events.push(...reduced.events);
    }
    expect(events.some((e) => e.kind === "violation" && e.code === "STOP_SIGN_NO_FULL_STOP")).toBe(false);
    expect(events.some((e) => e.kind === "violation" && e.code === "RED_LIGHT_CROSSED")).toBe(false);
  });
});

describe("vu-cyclist-v1 lane graph + staged cyclist path", () => {
  it("the curb cyclist's path (vu-n-w → vu-n-c → vu-n-e) is a routable lane-graph chain", () => {
    const district = assertDistrict(loadRaw()) as unknown as TrafficDistrict;
    const graph = buildLaneGraph(district, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // The eastbound through lane the cyclist rides exists and chains through the junction.
    const outW = graph.nodeOut.get("vu-n-w");
    expect(outW).toBeTruthy();
    expect([...(outW ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-c")).toBe(true);
    const outC = graph.nodeOut.get("vu-n-c");
    expect([...(outC ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-e")).toBe(true);
    // The traffic system stages actors on this district without throwing.
    const traffic = createTrafficSystem(district, { ...DEFAULT_TRAFFIC_CONFIG, seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic).toBeTruthy();
  });

  it("pins the lane centers the template denormalizes (THROUGH_Y / STEM_X)", () => {
    // Half of the drawn lane (8.125 m) either side of each centerline (y=0 / x=0).
    expect(Math.abs(THROUGH_LANE_Y) - 8.125 / 2).toBeLessThan(0.02);
    expect(Math.abs(STEM_LANE_X) - 8.125 / 2).toBeLessThan(0.02);
  });
});
