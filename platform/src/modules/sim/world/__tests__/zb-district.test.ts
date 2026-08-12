/**
 * ZEBRA-STREET archetype contract battery (Scenario Studio doc 76 §3; the
 * lot-perp-district.test.ts pattern).
 *
 * content/world/zb-v1.json is the pedestrian-family generated micro-map
 * (tools/maps/gen_zebra_street.mjs — one straight two-lane street, TWO
 * unsignalized marked zebras at y = 90 / 160). The battery proves the file
 * satisfies the FULL engine contract every district drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: both zebras painted
 *                (stats.zebraCrossings), no lights/stop signs, zero errors;
 *   2. runtime — createWorldRuntime derives BOTH CrossingZoneTracker zones
 *                from crossings[]: the zone ARMS (~35 m), tracks the
 *                installed pedestrian query, and fires crossingPassed — the
 *                exact events the PEDESTRIAN_* rule detectors grade;
 *   3. traffic — buildLaneGraph maps both crossings onto both directed
 *                lanes; a STAGED pedestrian's road-span occupancy drives
 *                pedestrianOnCrossing (the dart-out grading chain).
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

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "zb-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "zb-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `zb-v1.json not found (run: node tools/maps/gen_zebra_street.mjs) in: ${candidates.join(", ")}`,
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

describe("zb-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (street shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    expect(district.intersections.length).toBe(0); // straight street = degree 2
    expect(district.roundabouts.length).toBe(0);
    expect(district.crossings.map((c) => c.id)).toEqual(["zb-x-1", "zb-x-2"]);
    for (const c of district.crossings) {
      expect(c.kind).toBe("marked");
      expect(c.signalized).toBe(false);
      expect(c.edgeId).toBe("zb-e-street");
    }
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "zb-spawn-approach",
      "zb-spawn-finish",
    ]);
  });

  it("paints BOTH zebras and hosts no lights or stop signs", () => {
    expect(world.stats.zebraCrossings).toBe(2);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "zb-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "zb-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "zb-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("zb-v1 through the world runtime — the crossing-zone chain", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored 50 km/h everywhere on the street", () => {
    expect(runtime.speedLimitAt({ x: 4.06, y: 15 })).toBe(50);
    expect(runtime.speedLimitAt({ x: 4.06, y: 200 })).toBe(50);
  });

  it("CrossingZoneTracker arms zb-x-1 ~35 m out, tracks the pedestrian flag and fires crossingPassed", () => {
    const rt = createWorldRuntime(loadRaw());
    let pedOn = false;
    rt.setPedestrianQuery((id) => (id === "zb-x-1" ? pedOn : false));

    const drive = (yFrom: number, yTo: number, t0: number) => {
      const collected: Array<{ y: number; kind: string; flag?: boolean; id?: string }> = [];
      let t = t0;
      for (let y = yFrom; y <= yTo; y += 2) {
        t += 0.2;
        rt.update(0.2);
        const tick = rt.sample(sample(4.06, y, 0, 25), t, false);
        for (const e of tick.events) {
          if (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") {
            collected.push({ y, kind: e.kind, flag: e.pedestrianOnCrossing, id: e.crossingId });
          }
        }
      }
      return collected;
    };

    // Approach with nobody on the crossing: zone arms near d = 35 (y ≈ 55).
    const first = drive(15, 71, 0);
    const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "zb-x-1");
    expect(entered).toBeDefined();
    expect(entered!.flag).toBe(false);
    expect(Math.abs(90 - entered!.y - 35)).toBeLessThanOrEqual(4); // ~35 m before y=90

    // The pedestrian steps on WHILE the vehicle is inside the zone: the
    // contract re-emits the zone event with the flipped flag.
    pedOn = true;
    const second = drive(73, 79, 8);
    const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "zb-x-1");
    expect(reEmit).toBeDefined();
    expect(reEmit!.flag).toBe(true);

    // She clears; passing over the crossing fires crossingPassed(false) —
    // exactly what the reducer turns into PEDESTRIAN_YIELDED after a slow-down.
    pedOn = false;
    const third = drive(81, 101, 12);
    const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "zb-x-1");
    expect(passed).toBeDefined();
    expect(passed!.flag).toBe(false);

    // Continuing north arms the SECOND zone independently.
    const fourth = drive(103, 151, 20);
    const entered2 = fourth.find((e) => e.kind === "crossingZoneEntered" && e.id === "zb-x-2");
    expect(entered2).toBeDefined();
  });
});

describe("zb-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 directed lanes, both crossings on both lanes", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(2);
    expect(graph.crossingLanes.get("zb-x-1")?.length).toBe(2);
    expect(graph.crossingLanes.get("zb-x-2")?.length).toBe(2);
    expect(graph.crossingSignalNode.size).toBe(0); // unsignalized zebras
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty scenario street)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 4.06, y: 15 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 4.06, y: 15 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.pedestrianOnCrossing("zb-x-1")).toBe(false);
  });

  it("a STAGED pedestrian's road span drives pedestrianOnCrossing (the dart-out chain)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 4.06, y: 15 },
      anchorRadiusM: 400,
    });
    // West curb → across the 16.25 m carriageway → east walk-out (the same
    // geometry the sc-zebra-approach template stages at zb-x-1).
    const staged = traffic.stage({
      kind: "pedestrian",
      id: "zb-test-ped",
      path: [
        { x: -9.73, y: 90 },
        { x: 13.73, y: 90 },
      ],
      speedMps: 1.4,
      crossingId: "zb-x-1",
      roadFromM: 1.6,
      roadToM: 17.85,
    });
    expect(staged).not.toBeNull();
    expect(traffic.pedestrianOnCrossing("zb-x-1")).toBe(false);

    traffic.stagedCommand("zb-test-ped", { type: "cruise" });
    const onFlags: boolean[] = [];
    for (let i = 0; i < 60 * 18; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      if (i % 30 === 0) onFlags.push(traffic.pedestrianOnCrossing("zb-x-1"));
    }
    // Off the road at the start, ON while walking the span, off after.
    expect(onFlags[0]).toBe(false);
    expect(onFlags).toContain(true);
    expect(onFlags[onFlags.length - 1]).toBe(false);
    expect(traffic.staged("zb-test-ped")!.finished).toBe(true);
  });
});
