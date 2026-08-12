/**
 * EQUAL X-JUNCTION archetype contract battery — wave-1 map
 * (tools/maps/gen_jx_equal.mjs; the tj-junctions2-districts.test.ts pattern):
 *
 *   - jx-equal-v1 — control "none": four equal residential arms → the runtime
 *     derives ZERO stop lines and jx-n-c is an UNCONTROLLED right-hand-rule
 *     junction at DEGREE 4. Host of sc-jx-equal-left („Ляв завой на
 *     равнозначно кръстовище", ЗДвП чл. 37 + чл. 48).
 *
 * Beyond the shape, this battery pins the TWO invariants the scenario is built
 * on — the reason the map is an X and not a T:
 *
 *   1. BOTH adjudicators have a home at jx-n-c: the RHR tracker grades the car
 *      from the east arm, the N1 left-turn tracker grades the car from the
 *      north arm.
 *   2. They are DISJOINT. The bearing gates (traffic/system.ts) keep each car
 *      invisible to the other's query, so the template can SEQUENCE the two
 *      conflicts in time instead of fusing them into one unteachable card.
 *
 * The file must satisfy the FULL engine contract every district drives
 * through: world builder (ribbons, colliders, props), runtime (control
 * derivation, speed zones, clean ticks) and traffic (lane graph, empty-config
 * legality, staged actors for the scenario director).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "jx-equal-v1";
const EW_ARM_M = 130;
const NS_ARM_M = 130;
const MAX_KMH = 40;
const SIGHT_CLEAR_M = 30;
/** Drawn lane-center offset from the road centerline (laneWidth 3.25 ×
 *  PERCEPTUAL_ROAD_SCALE 2.5 / 2) — the junction-map constant. */
const LANE = 4.0625;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_jx_equal.mjs) in: ${candidates.join(", ")}`);
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

describe(`${ID} through the world builder`, () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (X shape, degree 4)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(5);
    expect(district.roads.edges.length).toBe(4);
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "jx-n-c", degree: 4, signalized: false });
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "jx-spawn-east",
      "jx-spawn-north",
      "jx-spawn-south",
      "jx-spawn-west",
    ]);
  });

  it("равнозначно: all four arms carry ONE class and ONE limit (no road is главна)", () => {
    expect(new Set(district.roads.edges.map((e) => e.class))).toEqual(new Set(["residential"]));
    expect(new Set(district.roads.edges.map((e) => e.maxspeed))).toEqual(new Set([MAX_KMH]));
    expect(district.roads.edges.map((e) => e.id).sort()).toEqual(["jx-e-e", "jx-e-n", "jx-e-s", "jx-e-w"]);
  });

  it("covers every edge with a ribbon and patches the junction", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(4);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
  });

  it("control none: no signs, no lights, no zebras anywhere (equal = right-hand rule)", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
  });

  it("OPEN CORNERS are the contract: every building vertex clears both sight triangles", () => {
    expect(district.buildings.length).toBe(4);
    expect(district.buildings.map((b) => b.id).sort()).toEqual([
      "jx-b-ne",
      "jx-b-nw",
      "jx-b-se",
      "jx-b-sw",
    ]);
    // The INVERSE of the JU-17 occluder: nothing may sit inside a corner sight
    // triangle, so the RHR lesson is the priority ladder, not the peek.
    for (const b of district.buildings) {
      for (const [x, y] of b.footprint) {
        expect(Math.min(Math.abs(x), Math.abs(y))).toBeGreaterThanOrEqual(SIGHT_CLEAR_M);
      }
    }
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
    expect(g.halfExtents[0]).toBeGreaterThan(EW_ARM_M - 20);
    expect(g.halfExtents[2]).toBeGreaterThan(NS_ARM_M - 20);
    for (const col of [world.colliders.sidewalks, world.colliders.buildings]) {
      expect(col.positions.length % 3).toBe(0);
      expect(col.indices.length % 3).toBe(0);
      if (col.indices.length > 0) {
        const maxIdx = Math.max(...Array.from(col.indices));
        expect(maxIdx).toBeLessThan(col.positions.length / 3);
      }
    }
  });

  it("stays trivially inside the performance budget (micro-map)", () => {
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

describe(`${ID} through the world runtime`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO stop lines and ONE uncontrolled right-hand-rule junction", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines()).toEqual([]);
    expect(runtime.debugUncontrolledJunctions()).toEqual([{ id: "jx-n-c", x: 0, y: 0 }]);
  });

  it("resolves the same tagged limit on every arm", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -(NS_ARM_M - 5) })).toBe(MAX_KMH); // south
    expect(runtime.speedLimitAt({ x: 0, y: NS_ARM_M - 5 })).toBe(MAX_KMH); // north
    expect(runtime.speedLimitAt({ x: EW_ARM_M - 5, y: 0 })).toBe(MAX_KMH); // east
    expect(runtime.speedLimitAt({ x: -(EW_ARM_M - 5), y: 0 })).toBe(MAX_KMH); // west
  });

  it("locates every spawn point on its authored edge", () => {
    expect(runtime.locate({ x: 0, y: -(NS_ARM_M - 5) }).edgeId).toBe("jx-e-s");
    expect(runtime.locate({ x: 0, y: NS_ARM_M - 5 }).edgeId).toBe("jx-e-n");
    expect(runtime.locate({ x: EW_ARM_M - 5, y: 0 }).edgeId).toBe("jx-e-e");
    expect(runtime.locate({ x: -(EW_ARM_M - 5), y: 0 }).edgeId).toBe("jx-e-w");
  });

  it("STOP_LINE_OVERRIDES stays skip-safe on this foreign map (doc 74 §5.6)", () => {
    expect(STOP_LINE_OVERRIDES.length).toBeGreaterThan(0);
    const raw = loadRaw(ID) as { roads: { edges: Array<{ id: string }> } };
    const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
    for (const ov of STOP_LINE_OVERRIDES) {
      expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
    }
  });

  it("samples a clean northbound run up the south arm (no phantom events)", () => {
    runtime.update(1 / 60);
    let t = 0;
    for (let y = -(NS_ARM_M - 5); y <= -40; y += 5) {
      t += 0.5;
      const tick = runtime.sample(sample(LANE, y, 0, 20), t, false);
      expect(tick.maxSpeedKmh).toBe(MAX_KMH);
      expect(tick.wrongWay).toBe(false);
      expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
      expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
      expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
    }
  });

  it("the RIGHT-HAND-RULE tracker adjudicates a staged conflict from the EAST arm", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const traffic = createTrafficSystem(loadRaw(ID) as TrafficDistrict, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    rt.setRightConflictQuery((jx, jy, px, py, h, r) => traffic.conflictFromRight(jx, jy, px, py, h, r));
    const staged = traffic.stage({
      kind: "vehicle",
      id: "jx-probe-right",
      pathNodes: ["jx-n-e", "jx-n-c", "jx-n-w"],
      hold: { nodeIndex: 1, offsetM: -30 },
      cruiseSpeedMps: 8,
    });
    expect(staged).not.toBeNull();
    traffic.stagedCommand("jx-probe-right", { type: "cruise" });
    let t = 0;
    let y = -30;
    const codes: string[] = [];
    for (let i = 0; i < 60 * 8; i++) {
      const dt = 1 / 60;
      t += dt;
      y += (18 / 3.6) * dt;
      rt.update(dt);
      traffic.update(dt, {
        signalPhase: () => "green",
        playerPos: { x: LANE, y },
        playerSpeedKmh: 18,
        playerHeadingDeg: 0,
      });
      const tick = rt.sample(sample(LANE, y, 0, 18), t, false);
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") codes.push(`${e.situation}:${String(e.violated)}`);
      }
      if (y > 45) break;
    }
    expect(codes).toEqual(["right-hand-rule:true"]);
  });

  it("the two adjudicators are DISJOINT: the east car is never 'oncoming', the north car never a 'right conflict'", () => {
    // The invariant that lets an X host BOTH trackers at one node — the whole
    // reason sc-jx-equal-left can sequence its two conflicts instead of
    // stacking them. Bearing gates: ONCOMING_MIN_DEG 130 rejects the
    // perpendicular east car; RIGHT_MIN_M 1.5 rejects the north car (it runs
    // the far lane, x = −LANE, so it is never to a northbound player's right).
    const traffic = createTrafficSystem(loadRaw(ID) as TrafficDistrict, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    traffic.stage({
      kind: "vehicle",
      id: "jx-east-car",
      pathNodes: ["jx-n-e", "jx-n-c", "jx-n-w"],
      hold: { nodeIndex: 1, offsetM: -20 },
      cruiseSpeedMps: 8,
    });
    traffic.stagedCommand("jx-east-car", { type: "cruise" });
    for (let i = 0; i < 30; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: { x: LANE, y: -20 } });
    }
    // Player northbound at the mouth: the east car IS a right conflict…
    expect(traffic.conflictFromRight(0, 0, LANE, -20, 0, 26)).toBe(true);
    // …and is NOT oncoming (perpendicular — 90° < ONCOMING_MIN_DEG 130).
    expect(traffic.oncomingNear(0, 0, 0, 36)).toBe(null);

    const t2 = createTrafficSystem(loadRaw(ID) as TrafficDistrict, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    t2.stage({
      kind: "vehicle",
      id: "jx-north-car",
      pathNodes: ["jx-n-n", "jx-n-c", "jx-n-s"],
      hold: { nodeIndex: 1, offsetM: -20 },
      cruiseSpeedMps: 8,
    });
    t2.stagedCommand("jx-north-car", { type: "cruise" });
    for (let i = 0; i < 30; i++) {
      t2.update(1 / 60, { signalPhase: () => "green", playerPos: { x: LANE, y: -20 } });
    }
    // The north car IS oncoming to a northbound player…
    expect(t2.oncomingNear(0, 0, 0, 36)).not.toBe(null);
    // …and is NOT a conflict from the right (it runs the far lane).
    expect(t2.conflictFromRight(0, 0, LANE, -20, 0, 26)).toBe(false);
  });
});

describe(`${ID} through the traffic lane graph + system`, () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw(ID) as TrafficDistrict;
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
    expect(graph.junctionRadiusM.get("jx-n-c")).toBeGreaterThan(0);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (scenario micro-map)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: -(NS_ARM_M - 5) },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: -(NS_ARM_M - 5) },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.conflictNear(0, 0, 20, 0)).toBe(false);
  });

  it("stages BOTH scenario actor paths (east→west and north→south) and they advance", () => {
    const traffic = createTrafficSystem(raw, { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const right = traffic.stage({
      kind: "vehicle",
      id: "jx-test-right",
      pathNodes: ["jx-n-e", "jx-n-c", "jx-n-w"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 8,
    });
    const oncoming = traffic.stage({
      kind: "vehicle",
      id: "jx-test-oncoming",
      pathNodes: ["jx-n-n", "jx-n-c", "jx-n-s"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 8,
    });
    expect(right).not.toBeNull();
    expect(oncoming).not.toBeNull();
    expect(right!.nodeS.length).toBe(3);
    expect(oncoming!.nodeS.length).toBe(3);
    traffic.stagedCommand("jx-test-right", { type: "cruise" });
    traffic.stagedCommand("jx-test-oncoming", { type: "cruise" });
    for (let i = 0; i < 300; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    expect(traffic.staged("jx-test-right")!.s).toBeGreaterThan(20);
    expect(traffic.staged("jx-test-oncoming")!.s).toBeGreaterThan(20);
  });
});
