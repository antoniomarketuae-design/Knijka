/**
 * FO-family following micro-map contract battery (Scenario Studio doc 76 §3;
 * the sp-districts.test.ts pattern, parametrized over the S3 batch-3 maps).
 *
 * content/world/{fo-follow,fo-brake}-v1.json are the following/gap-management
 * generated micro-maps (tools/maps/gen_fo_follow.mjs — one straight two-way
 * street, ONE lane per direction, a posted limit and NOTHING else: no zebra,
 * no lights, no junctions). The battery proves every file satisfies the FULL
 * engine contract each district drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: a plain street, zero
 *                lights/stop signs/zebras, zero errors;
 *   2. runtime — createWorldRuntime resolves the posted limit everywhere and
 *                surfaces the single northbound lane (laneId 0, laneCount 1);
 *   3. traffic — buildLaneGraph maps the street onto two directed lanes; an
 *                empty district is a legal config, and the northbound lane
 *                fo-n-start → fo-n-end resolves for staging the lead car.
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

interface FoMapCase {
  id: string;
  limitKmh: number;
  lengthM: number;
}

const CASES: FoMapCase[] = [
  { id: "fo-follow-v1", limitKmh: 50, lengthM: 360 },
  { id: "fo-brake-v1", limitKmh: 50, lengthM: 420 },
];

const X_LANE = 4.06; // right-lane center of a 1+1 street (drawn lane 8.125 m)

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_fo_follow.mjs) in: ${candidates.join(", ")}`);
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

for (const c of CASES) {
  describe(`${c.id} through the world builder`, () => {
    let raw: unknown;
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      raw = loadRaw(c.id);
      district = assertDistrict(raw);
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid district-v1 document (plain two-way street)", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.lanes).toBe(2);
      expect(road.oneway).toBe(false);
      expect(road.maxspeed).toBe(c.limitKmh);
      expect(road.length).toBe(c.lengthM);
      expect(district.intersections.length).toBe(0); // straight street = degree 2
      expect(district.crossings.length).toBe(0); // a pure following street: no zebra
      expect(district.roundabouts.length).toBe(0);
      expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
        "fo-spawn-approach",
        "fo-spawn-finish",
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
      expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
        Array.from(world.markings.positions.slice(0, 300)),
      );
    });

    it("the published copy is byte-identical to the content source", () => {
      const srcCandidates = [
        path.join(process.cwd(), "content", "world", `${c.id}.json`),
        path.resolve(process.cwd(), "..", "content", "world", `${c.id}.json`),
      ];
      const src = srcCandidates.find((f) => fs.existsSync(f))!;
      const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${c.id}.json`);
      expect(fs.existsSync(pub)).toBe(true);
      expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
    });
  });

  describe(`${c.id} through the world runtime — the speed-limit surface`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(c.id));
    });

    it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    });

    it("resolves the authored limit everywhere on the street", () => {
      expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(c.limitKmh);
      expect(runtime.speedLimitAt({ x: X_LANE, y: c.lengthM - 30 })).toBe(c.limitKmh);
    });

    it("surfaces the single northbound lane (laneId 0, laneCount 1) with the posted maxSpeedKmh", () => {
      const rt = createWorldRuntime(loadRaw(c.id));
      rt.update(1 / 60);
      const tick = rt.sample(sample(X_LANE, 100, 0, 40), 1, false);
      expect(tick.edgeId).toBe("fo-e-street");
      expect(tick.laneId).toBe(0);
      expect(tick.laneCount ?? 1).toBe(1); // 1 lane per direction — keep-right never applies
      expect(Math.abs(tick.laneOffsetM)).toBeLessThan(0.2);
      expect(tick.maxSpeedKmh).toBe(c.limitKmh);
      expect(tick.oneway).toBe(false);
    });
  });

  describe(`${c.id} through the traffic lane graph + system`, () => {
    let raw: TrafficDistrict;

    beforeAll(() => {
      raw = loadRaw(c.id) as TrafficDistrict;
    });

    it("builds the lane graph: 2 directed lanes, the northbound lane resolves for staging", () => {
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(2);
      expect(graph.loopLanes.size).toBe(2);
      expect(graph.crossingLanes.size).toBe(0); // no zebra to bind
      // The lead car stages on fo-n-start → fo-n-end (the player's northbound lane).
      const out = graph.nodeOut.get("fo-n-start");
      expect(out).toBeTruthy();
      expect([...(out ?? [])].some((li) => graph.lanes[li].toNode === "fo-n-end")).toBe(true);
    });

    it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty street, leadGap = ∞)", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 7,
        vehicleCount: 0,
        pedestrianCount: 0,
        anchor: { x: X_LANE, y: 15 },
        anchorRadiusM: 400,
      });
      expect(traffic.stats.vehicleCount).toBe(0);
      expect(traffic.stats.pedestrianCount).toBe(0);
      for (let i = 0; i < 120; i++) {
        traffic.update(1 / 60, {
          signalPhase: () => "green",
          playerPos: { x: X_LANE, y: 15 },
          playerSpeedKmh: 10,
        });
      }
      expect(traffic.leadGapMeters(X_LANE, 15, 0)).toBe(Infinity);
    });
  });
}
