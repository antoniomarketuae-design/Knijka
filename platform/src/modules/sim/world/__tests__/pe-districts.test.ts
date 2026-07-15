/**
 * PE-family crossing micro-map contract battery (Scenario Studio doc 76 §3;
 * the zb-district.test.ts pattern, parametrized over the S3 batch-1 maps).
 *
 * content/world/{pe-clear,pe-slow,pe-rain}-v1.json are the pedestrian-family
 * generated micro-maps (tools/maps/gen_pe_crossings.mjs — one straight
 * two-lane street, ONE unsignalized marked zebra each). The battery proves
 * every file satisfies the FULL engine contract each district drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: the zebra painted
 *                (stats.zebraCrossings), no lights/stop signs, zero errors;
 *   2. runtime — createWorldRuntime derives the CrossingZoneTracker zone from
 *                crossings[]: the zone ARMS (~35 m), tracks the installed
 *                pedestrian query, and fires crossingPassed — the exact events
 *                the PEDESTRIAN_* rule detectors grade;
 *   3. traffic — buildLaneGraph maps the crossing onto both directed lanes; a
 *                STAGED pedestrian's road-span occupancy drives
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

interface PeMapCase {
  id: string;
  crossingY: number;
  limitKmh: number;
  lengthM: number;
}

const CASES: PeMapCase[] = [
  { id: "pe-clear-v1", crossingY: 90, limitKmh: 50, lengthM: 150 },
  { id: "pe-slow-v1", crossingY: 85, limitKmh: 40, lengthM: 145 },
  { id: "pe-rain-v1", crossingY: 95, limitKmh: 50, lengthM: 155 },
];

const X_LANE = 4.06; // right-lane center of a 2-lane street (drawn lane 8.125 m)

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pe_crossings.mjs) in: ${candidates.join(", ")}`);
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

    it("is a structurally valid district-v1 document (street shape)", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      expect(district.roads.edges[0].maxspeed).toBe(c.limitKmh);
      expect(district.roads.edges[0].length).toBe(c.lengthM);
      expect(district.intersections.length).toBe(0); // straight street = degree 2
      expect(district.roundabouts.length).toBe(0);
      expect(district.crossings.map((cr) => cr.id)).toEqual(["pe-x-1"]);
      const cross = district.crossings[0];
      expect(cross.kind).toBe("marked");
      expect(cross.signalized).toBe(false);
      expect(cross.edgeId).toBe("pe-e-street");
      expect(cross.x).toBe(0);
      expect(cross.y).toBe(c.crossingY);
      expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
        "pe-spawn-approach",
        "pe-spawn-finish",
      ]);
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

  describe(`${c.id} through the world runtime — the crossing-zone chain`, () => {
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
      expect(runtime.speedLimitAt({ x: X_LANE, y: c.crossingY + 30 })).toBe(c.limitKmh);
    });

    it("CrossingZoneTracker arms pe-x-1 ~35 m out, tracks the pedestrian flag and fires crossingPassed", () => {
      const rt = createWorldRuntime(loadRaw(c.id));
      let pedOn = false;
      rt.setPedestrianQuery((id) => (id === "pe-x-1" ? pedOn : false));

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

      // Approach with nobody on the crossing: zone arms near d = 35.
      const first = drive(15, c.crossingY - 19, 0);
      const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "pe-x-1");
      expect(entered).toBeDefined();
      expect(entered!.flag).toBe(false);
      expect(Math.abs(c.crossingY - entered!.y - 35)).toBeLessThanOrEqual(4); // ~35 m before the crossing

      // The pedestrian steps on WHILE the vehicle is inside the zone: the
      // contract re-emits the zone event with the flipped flag.
      pedOn = true;
      const second = drive(c.crossingY - 17, c.crossingY - 11, 8);
      const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "pe-x-1");
      expect(reEmit).toBeDefined();
      expect(reEmit!.flag).toBe(true);

      // She clears; passing over the crossing fires crossingPassed(false) —
      // exactly what the reducer turns into PEDESTRIAN_YIELDED after a slow-down.
      pedOn = false;
      const third = drive(c.crossingY - 9, c.crossingY + 11, 12);
      const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "pe-x-1");
      expect(passed).toBeDefined();
      expect(passed!.flag).toBe(false);
    });
  });

  describe(`${c.id} through the traffic lane graph + system`, () => {
    let raw: TrafficDistrict;

    beforeAll(() => {
      raw = loadRaw(c.id) as TrafficDistrict;
    });

    it("builds the lane graph: 2 directed lanes, the crossing on both lanes", () => {
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(2);
      expect(graph.loopLanes.size).toBe(2);
      expect(graph.crossingLanes.get("pe-x-1")?.length).toBe(2);
      expect(graph.crossingSignalNode.size).toBe(0); // unsignalized zebra
    });

    it("a STAGED pedestrian's road span drives pedestrianOnCrossing (the dart-out chain)", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 3,
        vehicleCount: 0,
        pedestrianCount: 0,
        anchor: { x: X_LANE, y: 15 },
        anchorRadiusM: 400,
      });
      // West curb → across the 16.25 m carriageway → east walk-out (the same
      // geometry the PE templates stage at pe-x-1).
      const staged = traffic.stage({
        kind: "pedestrian",
        id: "pe-test-ped",
        path: [
          { x: -9.73, y: c.crossingY },
          { x: 13.73, y: c.crossingY },
        ],
        speedMps: 1.4,
        crossingId: "pe-x-1",
        roadFromM: 1.6,
        roadToM: 17.85,
      });
      expect(staged).not.toBeNull();
      expect(traffic.pedestrianOnCrossing("pe-x-1")).toBe(false);

      traffic.stagedCommand("pe-test-ped", { type: "cruise" });
      const onFlags: boolean[] = [];
      for (let i = 0; i < 60 * 18; i++) {
        traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
        if (i % 30 === 0) onFlags.push(traffic.pedestrianOnCrossing("pe-x-1"));
      }
      // Off the road at the start, ON while walking the span, off after.
      expect(onFlags[0]).toBe(false);
      expect(onFlags).toContain(true);
      expect(onFlags[onFlags.length - 1]).toBe(false);
      expect(traffic.staged("pe-test-ped")!.finished).toBe(true);
    });
  });
}
