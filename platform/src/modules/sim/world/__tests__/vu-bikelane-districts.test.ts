/**
 * VU-bikelane archetype contract battery (Scenario Studio doc 76 §3; the
 * vu-cyclist-district.test.ts pattern).
 *
 * content/world/vu-bikelane-v1.json is the „Десен завой през велоалея" host
 * (tools/maps/gen_vu_bikelane.mjs — an uncontrolled T-junction with a
 * curb-separated TWO-WAY cycle track along the through road's SOUTH edge). The
 * battery proves the file satisfies the FULL engine contract with the
 * archetype's REASON TO EXIST verified: the junction derives ZERO stop lines
 * (so ONLY the staged cyclistRightHook directors grade the hooks), and BOTH
 * cycle directions are routable for the traffic staging port — the eastbound
 * with-flow path (vu-n-w → vu-n-c → vu-n-e) AND the WESTBOUND counter-flow path
 * (vu-n-e → vu-n-c → vu-n-w), the reversed chain the template's second rider
 * rides, which is the whole point of the map.
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

/** Pinned lane centers (denormalized into templates-vru2.ts as VBL_THROUGH_Y /
 *  VBL_STEM_X) and the two-way cycle-track lines (meta.scenario.cycleTrack). */
const THROUGH_LANE_Y = -4.06;
const STEM_LANE_X = -4.06;
const CYCLE_WITH_FLOW_Y = -6.66; // eastbound rider line (VBL_WF_Y)
const CYCLE_COUNTER_FLOW_Y = -8.26; // westbound rider line (VBL_CF_Y)

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "vu-bikelane-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "vu-bikelane-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `vu-bikelane-v1.json not found (run: node tools/maps/gen_vu_bikelane.mjs) in: ${candidates.join(", ")}`,
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

describe("vu-bikelane-v1 through the world builder", () => {
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

  it("pins the two-way cycle track meta the template denormalizes", () => {
    const ct = (district.meta as unknown as { scenario: { cycleTrack: Record<string, unknown>; laneHalfM: number } })
      .scenario;
    expect(ct.laneHalfM).toBeCloseTo(4.06, 2);
    expect(ct.cycleTrack.side).toBe("south");
    expect(ct.cycleTrack.twoWay).toBe(true);
    expect(ct.cycleTrack.withFlowYM).toBeCloseTo(CYCLE_WITH_FLOW_Y, 2);
    expect(ct.cycleTrack.counterFlowYM).toBeCloseTo(CYCLE_COUNTER_FLOW_Y, 2);
    // Both cycle lines are SOUTH of the driver's own lane (the side the right
    // turn crosses), with the counter-flow line further out than the with-flow.
    expect(CYCLE_WITH_FLOW_Y).toBeLessThan(THROUGH_LANE_Y);
    expect(CYCLE_COUNTER_FLOW_Y).toBeLessThan(CYCLE_WITH_FLOW_Y);
    // The with-flow curb line clears the 2.2 m contact radius (safe overtake).
    expect(Math.abs(CYCLE_WITH_FLOW_Y - THROUGH_LANE_Y)).toBeGreaterThan(2.2);
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

describe("vu-bikelane-v1 through the runtime + rule engine", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives an UNCONTROLLED junction (no stop line on any approach)", () => {
    // Approaching vu-n-c eastbound in the through lane: no Б2 line crossing is
    // ever reported (the whole reason the cyclist runners, not a stop rule,
    // grade this scenario).
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

describe("vu-bikelane-v1 lane graph + both staged cycle directions", () => {
  it("BOTH the with-flow (W→C→E) and counter-flow (E→C→W) chains are routable", () => {
    const district = assertDistrict(loadRaw()) as unknown as TrafficDistrict;
    const graph = buildLaneGraph(district, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // With-flow (eastbound) rider: vu-n-w → vu-n-c → vu-n-e.
    const outW = graph.nodeOut.get("vu-n-w");
    expect([...(outW ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-c")).toBe(true);
    const outC = graph.nodeOut.get("vu-n-c");
    expect([...(outC ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-e")).toBe(true);
    // Counter-flow (WESTBOUND) rider — the reversed chain: vu-n-e → vu-n-c → vu-n-w.
    const outE = graph.nodeOut.get("vu-n-e");
    expect([...(outE ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-c")).toBe(true);
    expect([...(outC ?? [])].some((li) => graph.lanes[li].toNode === "vu-n-w")).toBe(true);
    // The traffic system stages actors on this district without throwing.
    const traffic = createTrafficSystem(district, { ...DEFAULT_TRAFFIC_CONFIG, seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic).toBeTruthy();
  });

  it("the counter-flow rider's negative offset lands it on the SOUTH track, untagged", () => {
    // The reversed (westbound) path rides the +4.06 lane; a negative
    // extraRightOffsetM carries it SOUTH onto the two-way track, and a
    // non-positive offset leaves it OFF the cyclistNear feed (correct: it is
    // graded only by its own right-hook runner, never the vulnerable-pass one).
    const district = assertDistrict(loadRaw()) as unknown as TrafficDistrict;
    const traffic = createTrafficSystem(district, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const cf = traffic.stage({
      kind: "vehicle",
      id: "probe-cf",
      pathNodes: ["vu-n-e", "vu-n-c", "vu-n-w"],
      hold: { nodeIndex: 1, offsetM: -20 }, // 20 m east of the node
      cruiseSpeedMps: 4,
      extraRightOffsetM: CYCLE_COUNTER_FLOW_Y - 4.06, // −12.32
    });
    expect(cf).not.toBeNull();
    const view = traffic.staged("probe-cf")!;
    expect(view.y).toBeCloseTo(CYCLE_COUNTER_FLOW_Y, 1); // on the south track
    expect(view.x).toBeCloseTo(20, 1); // 20 m east of the node
  });
});
