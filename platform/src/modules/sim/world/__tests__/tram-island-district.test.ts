/**
 * RAIL-PACK ACTOR-SLICE district battery (ADR-006 stage 3b; the pe-districts
 * mold, one map).
 *
 * content/world/rx-tram-island-v1.json is the RX-04 host (doc 72 §12
 * „Трамвайна спирка с остров", tools/maps/gen_tram_street.mjs): a straight
 * 1+1 street with ONE marked unsignalized crossing (rxt-x-1 @ y = 90) where
 * passengers cross to the stop island, the island itself as a LOW extruded
 * block on the shipped buildings channel, and meta.scenario.tramStop as the
 * pinned staging truth. The battery proves:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: zebra painted, island
 *                block present and CURB-low, no lights/stop signs, finite
 *                buffers, deterministic;
 *   2. runtime — the CrossingZoneTracker chain the PEDESTRIAN_* grading
 *                reads (zone arms ~35 m, flag tracks, crossingPassed fires);
 *   3. traffic — the lane graph carries BOTH directed lanes (the southbound
 *                one IS the tram corridor — a tram is a path-locked staged
 *                actor; no separate rail physics, honestly), and a HALTED
 *                tram prop (profile "tram", cruise 0, never commanded)
 *                stages at the authored hold pose and STAYS there.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "rx-tram-island-v1";
const CROSSING_Y = 90;
const LIMIT_KMH = 40;
const LENGTH_M = 150;
const X_LANE = 4.06; // northbound right-lane center
const TRAM_LANE = -4.06; // southbound lane center — the tram corridor
const TRAM_HOLD_Y = 101; // halted tram body center (meta.scenario.tramStop)

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_tram_street.mjs) in: ${candidates.join(", ")}`);
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
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw(ID);
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (street + crossing + island)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    expect(district.roads.edges[0].maxspeed).toBe(LIMIT_KMH);
    expect(district.roads.edges[0].length).toBe(LENGTH_M);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.map((cr) => cr.id)).toEqual(["rxt-x-1"]);
    const cross = district.crossings[0];
    expect(cross.kind).toBe("marked");
    expect(cross.signalized).toBe(false);
    expect(cross.x).toBe(0);
    expect(cross.y).toBe(CROSSING_Y);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "rxt-spawn-approach",
      "rxt-spawn-finish",
    ]);
  });

  it("carries the stop island as a LOW platform block, clear of both corridors", () => {
    const island = district.buildings.find((b) => b.id === "rxt-b-island");
    expect(island).toBeDefined();
    expect(island!.height).toBeLessThanOrEqual(0.4); // a curb, not a wall
    const xs = island!.footprint.map(([x]) => x);
    const ys = island!.footprint.map(([, y]) => y);
    // North of the zebra (the crossing path stays clear)…
    expect(Math.min(...ys)).toBeGreaterThan(CROSSING_Y + 1);
    // …between the tram body edge (−4.06 + 1.15) and the player lane.
    expect(Math.min(...xs)).toBeGreaterThan(TRAM_LANE + 1.15);
    expect(Math.max(...xs)).toBeLessThan(X_LANE - 3);
  });

  it("pins the tram-stop staging truth in meta.scenario.tramStop", () => {
    const meta = (raw as { meta: { scenario?: { tramStop?: Record<string, unknown> } } }).meta;
    expect(meta.scenario?.tramStop).toEqual({
      islandId: "rxt-b-island",
      islandFromY: 92,
      islandToY: 106,
      tramLaneCenterM: TRAM_LANE,
      tramHoldY: TRAM_HOLD_Y,
    });
    // Halted tram fully north of the zebra: 14 m body, nose >= 2 m clear.
    expect(TRAM_HOLD_Y - 7).toBeGreaterThanOrEqual(CROSSING_Y + 2);
  });

  it("paints the zebra and hosts no lights or stop signs", () => {
    expect(world.stats.zebraCrossings).toBe(1);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", `${ID}.json`),
      path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${ID}.json`);
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe(`${ID} through the world runtime — the crossing-zone chain`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored limit everywhere on the street", () => {
    expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(LIMIT_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: CROSSING_Y + 30 })).toBe(LIMIT_KMH);
  });

  it("CrossingZoneTracker arms rxt-x-1 ~35 m out, tracks the flag and fires crossingPassed", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let pedOn = false;
    rt.setPedestrianQuery((id) => (id === "rxt-x-1" ? pedOn : false));

    const drive = (yFrom: number, yTo: number, t0: number) => {
      const collected: Array<{ y: number; kind: string; flag?: boolean; id?: string }> = [];
      let t = t0;
      for (let y = yFrom; y <= yTo; y += 2) {
        t += 0.2;
        rt.update(0.2);
        const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
        for (const e of tick.events) {
          if (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") {
            collected.push({ y, kind: e.kind, flag: e.pedestrianOnCrossing, id: e.crossingId });
          }
        }
      }
      return collected;
    };

    const first = drive(15, CROSSING_Y - 19, 0);
    const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "rxt-x-1");
    expect(entered).toBeDefined();
    expect(entered!.flag).toBe(false);
    expect(Math.abs(CROSSING_Y - entered!.y - 35)).toBeLessThanOrEqual(4);

    pedOn = true;
    const second = drive(CROSSING_Y - 17, CROSSING_Y - 11, 8);
    const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "rxt-x-1");
    expect(reEmit).toBeDefined();
    expect(reEmit!.flag).toBe(true);

    pedOn = false;
    const third = drive(CROSSING_Y - 9, CROSSING_Y + 11, 12);
    const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "rxt-x-1");
    expect(passed).toBeDefined();
    expect(passed!.flag).toBe(false);
  });
});

describe(`${ID} through the traffic lane graph + system — the tram corridor`, () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw(ID) as TrafficDistrict;
  });

  it("builds the lane graph: 2 directed lanes, the crossing on both", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.get("rxt-x-1")?.length).toBe(2);
    expect(graph.crossingSignalNode.size).toBe(0); // unsignalized zebra
  });

  it("a HALTED tram prop stages at the authored hold pose and stays put (profile published)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    // The template's exact prop recipe: end → start (southbound), hold at
    // arc 49 → body center y = 150 − 49 = 101, cruise 0, NEVER commanded.
    const staged = traffic.stage({
      kind: "vehicle",
      id: "rxt-test-tram",
      pathNodes: ["rxt-n-end", "rxt-n-start"],
      hold: { nodeIndex: 0, offsetM: 49 },
      cruiseSpeedMps: 0,
      profile: "tram",
    });
    expect(staged).not.toBeNull();
    expect(staged!.x).toBeCloseTo(TRAM_LANE, 1);
    expect(staged!.y).toBeCloseTo(TRAM_HOLD_Y, 1);
    // The published state carries the profile — the fleet renders the rig.
    const state = traffic.vehicles.find((v) => v.id >= 1000)!;
    expect(state.profile).toBe("tram");
    // Never commanded → it holds for the whole session.
    for (let i = 0; i < 60 * 10; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: { x: X_LANE, y: 60 } });
    }
    const after = traffic.staged("rxt-test-tram")!;
    expect(after.x).toBeCloseTo(TRAM_LANE, 1);
    expect(after.y).toBeCloseTo(TRAM_HOLD_Y, 1);
    expect(after.speedMps).toBe(0);
    // A11: the tram prop reads as a VEHICLE in a collision (no curb offset).
    expect(traffic.vehicleCollisionKind(state.id)).toBe("vehicle");
  });
});
