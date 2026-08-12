/**
 * ARROW-LANE SIGNALIZED X contract battery (Scenario Studio doc 76 §3; the
 * sx-district.test.ts pattern) — content/world/ln-arrows-v1.json, the committed
 * 3+3 boulevard × 1+1 street signalized junction of tools/maps/gen_ln_arrows.mjs.
 *
 * The map exists so a lane-arrow drill (SN-04/JU-14) has THREE distinct
 * approach lanes under one signal. The battery pins exactly what
 * sc-ln-turn-lane-arrows depends on:
 *   1. shape   — 3+3 N–S arterial, 1+1 E–W street, one signalized degree-4 node,
 *                the curb-lane spawn, no crossings (no pedestrian grading noise);
 *   2. signals — ONE single-node cluster, FOUR trafficLight stop lines (one per
 *                approach, correct dirSign), the phase dial the traces pin;
 *   3. lanes   — the locator resolves each authored northbound lane center to
 *                its laneId at offset ≈ 0, and the west exit's westbound lane
 *                center likewise: the drive scripts' constants ARE these;
 *   4. arrows  — meta.scenario.laneArrows is the authored lane-intent truth the
 *                ScenarioSpec teaches from (no runtime layer consumes it; the
 *                lane-intent zone kind is doc 72 N3 work still outstanding).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { SIGNAL_TIMING } from "../../runtime/signals";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** Northbound lane centers of the arrow approach (laneId 0 = curb lane). */
const NS_LANE_X = [20.31, 12.19, 4.06];
/** Westbound lane center of the west exit street. */
const EW_WEST_Y = 4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ln-arrows-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ln-arrows-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `ln-arrows-v1.json not found (run: node tools/maps/gen_ln_arrows.mjs) in: ${candidates.join(", ")}`,
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

interface LaneArrowsMeta {
  edgeId: string;
  travelDir: number;
  fromM: number;
  toM: number;
  lanes: Array<{ laneId: number; centerM: number; arrow: string; labelBg: string }>;
}

describe("ln-arrows-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (3+3 arterial × 1+1 street)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(5);
    expect(district.roads.edges.length).toBe(4);
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "ln-n-c", degree: 4, signalized: true });
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    // The arrow approach is what the whole template rests on: 6 lanes two-way.
    expect(byId.get("ln-e-s")).toMatchObject({ lanes: 6, oneway: false, class: "secondary", maxspeed: 50 });
    expect(byId.get("ln-e-n")).toMatchObject({ lanes: 6, oneway: false });
    expect(byId.get("ln-e-w")).toMatchObject({ lanes: 2, oneway: false, class: "residential", maxspeed: 40 });
    expect(byId.get("ln-e-e")).toMatchObject({ lanes: 2, oneway: false });
  });

  it("spawns the drill in the CURB lane of the arrow approach", () => {
    const spawn = district.spawnPoints.find((s) => s.id === "ln-spawn-south")!;
    expect(spawn).toBeDefined();
    expect(spawn.edgeId).toBe("ln-e-s");
    expect(spawn.x).toBe(NS_LANE_X[0]);
    expect(spawn.y).toBe(-135); // armSouthM 150 − 15
    expect(spawn.heading).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ln-spawn-east",
      "ln-spawn-south",
      "ln-spawn-west",
    ]);
  });

  it("carries the authored lane-arrow truth in meta.scenario (pedagogy, not a data layer)", () => {
    const sc = district.meta.scenario as { laneArrows: LaneArrowsMeta; nsLaneCentersM: number[]; ewWestboundLaneY: number };
    expect(sc.nsLaneCentersM).toEqual(NS_LANE_X);
    expect(sc.ewWestboundLaneY).toBe(EW_WEST_Y);
    expect(sc.laneArrows.edgeId).toBe("ln-e-s");
    expect(sc.laneArrows.travelDir).toBe(1);
    expect(sc.laneArrows.lanes.map((l) => l.arrow)).toEqual(["right", "through", "left"]);
    expect(sc.laneArrows.lanes.map((l) => l.centerM)).toEqual(NS_LANE_X);
    for (const l of sc.laneArrows.lanes) expect(l.labelBg).toMatch(/[Ѐ-ӿ]/);
    // The painted span reaches ~120 m back from the junction: the drill reads
    // the arrows with room to reposition across two lanes before the line.
    expect(sc.laneArrows.toM - sc.laneArrows.fromM).toBe(120);
    expect(sc.laneArrows.toM).toBe(150);
    // NO zone layer: district-v1 has no lane-intent kind (doc 72 N3 outstanding).
    expect(district.zones).toBeUndefined();
  });

  it("covers every edge with a ribbon and patches the junction", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(4);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
  });

  it("hosts a signalized junction: lamp heads on every incoming approach, no signs, no zebras", () => {
    // 4 approaches × 2 heads since the R3 signal-visibility fix: every incoming
    // approach gets its near head PLUS the far-side companion a driver waiting
    // AT the line actually sees (the sx/pe-jay/sig-wave batteries pin the same).
    expect(world.trafficLights.length).toBe(8);
    for (const tl of world.trafficLights) expect(tl.nodeId).toBe("ln-n-c");
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
    for (const list of [world.trafficLights, world.signs, world.streetlights, world.trees, world.busStops]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("stays inside the performance budget (micro-map)", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });
});

describe("ln-arrows-v1 through the world runtime — signals + the three arrow lanes", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ONE single-node cluster whose axis-group is the arterial's", () => {
    const clusters = runtime.debugSignalClusters();
    expect(clusters.length).toBe(1);
    expect(clusters[0].id).toBe("ln-n-c");
    expect(clusters[0].memberNodeIds).toEqual(["ln-n-c"]);
    expect(runtime.signalPhaseForApproach("ln-n-c", 0)).toBeTruthy();
  });

  it("derives FOUR trafficLight stop lines — one per approach, correct dirSign", () => {
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(4);
    expect(new Set(lines.map((l) => l.control))).toEqual(new Set(["trafficLight"]));
    const south = lines.find((l) => l.id.startsWith("ln-e-s@"))!;
    expect(south).toMatchObject({ group: "ns", dirSign: 1 });
    // Widest half-width (3+3 travel 24.375 + 4 m parking band) + arterial corner
    // 15 + paint inset 0.6 → 43.975 m back from the node on the south approach.
    expect(south.sM).toBeCloseTo(150 - 43.975, 2);
    expect(lines.find((l) => l.id.startsWith("ln-e-n@"))).toMatchObject({ group: "ns", dirSign: -1 });
    expect(lines.find((l) => l.id.startsWith("ln-e-w@"))).toMatchObject({ group: "ew", dirSign: 1 });
    expect(lines.find((l) => l.id.startsWith("ln-e-e@"))).toMatchObject({ group: "ew", dirSign: -1 });
    // Signalized + guarded → NOT a right-hand-rule junction (no RHR grading).
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
  });

  it("resolves each authored northbound lane center to its laneId, centred", () => {
    // laneId 0 = curb lane; the ScenarioSpec + trace scripts pin exactly these x.
    NS_LANE_X.forEach((x, laneId) => {
      const fix = runtime.locate({ x, y: -100 });
      expect(fix.edgeId, `lane ${laneId}`).toBe("ln-e-s");
      expect(fix.laneId, `lane ${laneId}`).toBe(laneId);
      expect(Math.abs(fix.laneOffsetM), `lane ${laneId}`).toBeLessThan(0.05);
    });
  });

  it("resolves the west exit's westbound lane, and the off-centre demo position", () => {
    const centred = runtime.locate({ x: -60, y: EW_WEST_Y });
    expect(centred.edgeId).toBe("ln-e-w");
    expect(centred.laneId).toBe(0);
    expect(Math.abs(centred.laneOffsetM)).toBeLessThan(0.05);
    // The „Ляв завой от лента само направо" demo rides the curb edge of the
    // west exit — beyond the 3.25 m lane-keeping tolerance, toward the CURB, so
    // it grades POOR_LANE_KEEPING and never CENTER_LINE_TOUCHED.
    const wide = runtime.locate({ x: -60, y: 7.7 });
    expect(wide.edgeId).toBe("ln-e-w");
    expect(wide.laneOffsetM).toBeLessThan(-3.25);
  });

  it("runs the two-phase machine: opposite axis-groups never green together", () => {
    const rt = createWorldRuntime(loadRaw());
    let bothGreen = 0;
    let nsGreenSeen = 0;
    for (let i = 0; i < 60 * SIGNAL_TIMING.cycleSec; i++) {
      rt.update(1 / 60);
      const ns = rt.signalPhaseForApproach("ln-n-c", 0);
      const ew = rt.signalPhaseForApproach("ln-n-c", 90);
      if (ns === "green") nsGreenSeen++;
      if (ns === "green" && ew === "green") bothGreen++;
    }
    expect(bothGreen).toBe(0);
    expect(nsGreenSeen).toBeGreaterThan(0);
  });

  it("the phase dial the traces rely on: offset 0 puts the ns approach on GREEN from t = 0", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setSignalClusterOffset("ln-n-c", 0);
    expect(rt.signalPhaseForApproach("ln-n-c", 0)).toBe("green");
    // Green runs the full SIGNAL_TIMING.greenSec — the whole approach + turn of
    // every authored drive lands inside it (no red-light noise in the demos).
    const info = rt.signalPhaseInfo("ln-n-c", 0);
    expect(info.timeToChangeSec).toBeCloseTo(SIGNAL_TIMING.greenSec, 5);
  });

  it("a northbound left-lane crossing reports the lamp state AT the line", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setSignalClusterOffset("ln-n-c", 0);
    let seen: string | null = null;
    let t = 0;
    for (let y = -60; y <= -20; y += 1.5) {
      t += 0.12;
      rt.update(0.12);
      const tick = rt.sample(sample(NS_LANE_X[2], y, 0, 40), t, false);
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") seen = e.lightState ?? null;
      }
    }
    expect(seen).toBe("green");
  });

  it("resolves the tagged speed limits per axis", () => {
    expect(runtime.speedLimitAt({ x: NS_LANE_X[1], y: -100 })).toBe(50); // secondary N–S
    expect(runtime.speedLimitAt({ x: -80, y: EW_WEST_Y })).toBe(40); // residential E–W
  });
});

describe("ln-arrows-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 two-way edges → 8 directed lanes, loopable", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(8);
    expect(graph.loopLanes.size).toBe(8);
    expect(graph.crossingLanes.size).toBe(0);
    expect(graph.junctionRadiusM.get("ln-n-c")).toBeGreaterThan(0);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (the drill's ambient law)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: NS_LANE_X[0], y: -135 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: NS_LANE_X[0], y: -135 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.leadGapMeters(NS_LANE_X[0], -135, 0)).toBe(Infinity);
  });
});
