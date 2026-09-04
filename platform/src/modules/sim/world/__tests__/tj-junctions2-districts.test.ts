/**
 * T-JUNCTION archetype contract battery — S3 batch-4 maps
 * (tools/maps/gen_ju_junctions2.mjs; the tj-districts.test.ts pattern):
 *
 *   - tj-emerge-v1   — control "stop": PRIMARY priority road + residential
 *     stem → the stop-sign heuristic derives the Б2 line at the stem mouth
 *     NATURALLY and the world builder paints the VISIBLE Б2 sign. Host of
 *     JU-04 (a priority car crosses the main road; the give-way conflictNear
 *     adjudication at the Б2 line grades the emerge fault).
 *   - tj-occluded-v1 — control "none": equal residential roads → the runtime
 *     derives ZERO stop lines and tj-n-c is an UNCONTROLLED right-hand-rule
 *     junction (the JU-17 host). Its lone building sits in the SE quadrant,
 *     walling off the driver's view of the car coming from the RIGHT.
 *   - tj-scan-v1    — control "stop", the JU-23 host (sc-junction-scan, the
 *     ляво-дясно-ляво drill). Added for `sc-junction-scan:28e782ab`: the scan
 *     drill used to declare tj-stop-v1, the JU-03 stop drill's map, so the two
 *     were one street under two titles. Its own arms (130 m / 110 m) put the
 *     streetwall pass's slots elsewhere, so it reads as its own place.
 *
 * All three files must satisfy the FULL engine contract every district drives
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

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ju_junctions2.mjs) in: ${candidates.join(", ")}`);
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

interface Case {
  id: "tj-emerge-v1" | "tj-occluded-v1" | "tj-scan-v1";
  isStop: boolean;
  priorityArmM: number;
  minorArmM: number;
  priorityMaxKmh: number;
  minorMaxKmh: number;
  /** Derived Б2 line s along the stem (minorArmM − 27.725), stop variant. */
  stopLineSM: number;
  /**
   * Пешеходни пътеки the instance authors — and therefore the зебри the world
   * builder must PAINT and the crossing lanes the traffic graph must know.
   *
   * It was a hard-coded 0 in three places, which was true of all three maps and
   * is the reason `sc-junction-blind:76e3924c` („the junction paints no
   * pedestrian crossing") could stand: `markings.ts` paints every crossing a
   * district declares and this generator declared none. Pinned per case rather
   * than relaxed — the two Б2 maps still assert exactly zero.
   */
  crossings: number;
}

const CASES: Case[] = [
  { id: "tj-emerge-v1", isStop: true, priorityArmM: 160, minorArmM: 100, priorityMaxKmh: 50, minorMaxKmh: 40, stopLineSM: 72.275, crossings: 0 },
  { id: "tj-occluded-v1", isStop: false, priorityArmM: 140, minorArmM: 130, priorityMaxKmh: 40, minorMaxKmh: 40, stopLineSM: 0, crossings: 3 },
  { id: "tj-scan-v1", isStop: true, priorityArmM: 130, minorArmM: 110, priorityMaxKmh: 50, minorMaxKmh: 40, stopLineSM: 82.275, crossings: 0 },
];

/**
 * THE Б2 LINE IS THE ONE THING THAT MAY NOT MOVE BETWEEN THE THREE Б2 T-MAPS —
 * `sc-junction-scan:28e782ab`. That row is closed by giving the JU-23 scan
 * drill its own junction (tj-scan-v1: 130 m / 110 m arms, its own frontage)
 * instead of sharing tj-stop-v1 with the JU-03 stop drill. The DERIVED stop
 * line has to stay at 27.725 m from the node all the same, because the drill's
 * three gates and its three committed traces are pinned to it — so the arms
 * moved and the line did not, and this asserts exactly that rather than
 * trusting it. (`stopLineSM` above is measured along the stem from tj-n-s, so
 * the invariant is minorArmM − s.)
 */
const DERIVED_STOP_LINE_M = 27.725;
describe("the three Б2 T-junctions derive the SAME stop-line distance", () => {
  for (const c of CASES.filter((x) => x.isStop)) {
    it(`${c.id}: ${c.minorArmM} m stem − ${c.stopLineSM} m = ${DERIVED_STOP_LINE_M} m from the node`, () => {
      expect(c.minorArmM - c.stopLineSM).toBeCloseTo(DERIVED_STOP_LINE_M, 3);
    });
  }
});

for (const c of CASES) {
  const { id, isStop } = c;

  describe(`${id} through the world builder`, () => {
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      district = assertDistrict(loadRaw(id));
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid district-v1 document (T shape)", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(4);
      expect(district.roads.edges.length).toBe(3);
      expect(district.intersections.length).toBe(1);
      expect(district.intersections[0]).toMatchObject({ id: "tj-n-c", degree: 3, signalized: false });
      expect(district.crossings.length).toBe(c.crossings);
      expect(district.roundabouts.length).toBe(0);
      expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
        "tj-spawn-east",
        "tj-spawn-south",
        "tj-spawn-west",
      ]);
    });

    it("covers every edge with a ribbon and patches the junction", () => {
      expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(3);
      expect(world.stats.skippedRibbons).toBe(0);
      expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(1);
    });

    it(
      isStop
        ? "control stop: the VISIBLE Б2 sign exists (grading never references invisible control)"
        : "control none: no signs of priority anywhere (equal junction = right-hand rule)",
      () => {
        expect(world.trafficLights.length).toBe(0);
        // The paint, not the priority: an equal junction still has пътеки, and
        // a зебра is not a sign of priority. Signals stay 0 on all three.
        expect(world.stats.zebraCrossings).toBe(c.crossings);
        if (isStop) {
          expect(world.stats.signs.stop).toBe(1);
          expect(world.stats.signs.giveWay).toBe(0);
        } else {
          expect(world.stats.signs.stop).toBe(0);
          expect(world.stats.signs.giveWay).toBe(0);
        }
      },
    );

    if (!isStop) {
      it("JU-17 dressing: the lone building sits SE — right of the stem, hiding the east approach", () => {
        expect(district.buildings.length).toBe(1);
        const b = district.buildings[0];
        expect(b.id).toBe("tj-b-occluder");
        // Every footprint vertex is in the SE quadrant (x > 0, y < 0) and clears
        // the carriageway+sidewalk (|x|,|y| >= 16) — occlusion, not obstruction.
        for (const [x, y] of b.footprint) {
          expect(x).toBeGreaterThan(0);
          expect(y).toBeLessThan(0);
          expect(Math.max(Math.abs(x), Math.abs(y))).toBeGreaterThanOrEqual(16);
        }
      });
    }

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
      expect(g.halfExtents[0]).toBeGreaterThan(c.priorityArmM - 20);
      expect(g.halfExtents[2]).toBeGreaterThan(40);
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

  describe(`${id} through the world runtime`, () => {
    let runtime: DistrictWorldRuntime;

    beforeAll(() => {
      runtime = createWorldRuntime(loadRaw(id));
    });

    it(
      isStop
        ? "derives EXACTLY the Б2 line at the stem mouth — heuristic only, zero overrides"
        : "derives ZERO stop lines and ONE uncontrolled right-hand-rule junction",
      () => {
        expect(runtime.debugSignalClusters().length).toBe(0);
        const lines = runtime.debugStopLines();
        if (isStop) {
          expect(lines.length).toBe(1);
          const line = lines[0];
          expect(line.control).toBe("stopSign");
          expect(line.junctionNodeId).toBe("tj-n-c");
          expect(line.sM).toBeCloseTo(c.stopLineSM, 3);
          expect(line.dirSign).toBe(1);
          expect(line.approachBearingDeg).toBeCloseTo(0, 5);
          expect(runtime.debugUncontrolledJunctions()).toEqual([]);
        } else {
          expect(lines).toEqual([]);
          expect(runtime.debugUncontrolledJunctions()).toEqual([{ id: "tj-n-c", x: 0, y: 0 }]);
        }
      },
    );

    it("resolves the tagged speed limits per road", () => {
      expect(runtime.speedLimitAt({ x: 0, y: -(c.minorArmM - 5) })).toBe(c.minorMaxKmh); // stem
      expect(runtime.speedLimitAt({ x: 100, y: 0 })).toBe(c.priorityMaxKmh); // priority road
    });

    it("locates every spawn point on its authored edge", () => {
      expect(runtime.locate({ x: 0, y: -(c.minorArmM - 5) }).edgeId).toBe("tj-e-s");
      expect(runtime.locate({ x: c.priorityArmM - 5, y: 0 }).edgeId).toBe("tj-e-e");
      expect(runtime.locate({ x: -(c.priorityArmM - 5), y: 0 }).edgeId).toBe("tj-e-w");
    });

    it("STOP_LINE_OVERRIDES stays skip-safe on this foreign map (doc 74 §5.6)", () => {
      expect(STOP_LINE_OVERRIDES.length).toBeGreaterThan(0);
      const raw = loadRaw(id) as { roads: { edges: Array<{ id: string }> } };
      const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
      for (const ov of STOP_LINE_OVERRIDES) {
        expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
      }
    });

    it("samples a clean northbound run up the stem short of the mouth (no phantom events)", () => {
      runtime.update(1 / 60);
      let t = 0;
      // Stop at y = -(minorArmM - 20): before the Б2 line (-27.7 from node).
      for (let y = -(c.minorArmM - 5); y <= -40; y += 5) {
        t += 0.5;
        const tick = runtime.sample(sample(4.0625, y, 0, 20), t, false);
        expect(tick.maxSpeedKmh).toBe(c.minorMaxKmh);
        expect(tick.wrongWay).toBe(false);
        expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
        expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
        expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
      }
    });

    if (isStop) {
      it("crossing the stem mouth emits stopLineCrossed(stopSign) exactly once", () => {
        const rt = createWorldRuntime(loadRaw(id));
        rt.update(1 / 60);
        let crossings = 0;
        let t = 0;
        for (let y = -60; y <= -10; y += 1.5) {
          t += 0.12;
          const tick = rt.sample(sample(4.0625, y, 0, 25), t, false);
          for (const e of tick.events) {
            if (e.kind === "stopLineCrossed") {
              expect(e.control).toBe("stopSign");
              crossings++;
            }
          }
        }
        expect(crossings).toBe(1);
      });
    } else {
      it("the right-hand-rule tracker adjudicates a staged conflict from the right", () => {
        const rt = createWorldRuntime(loadRaw(id));
        const traffic = createTrafficSystem(loadRaw(id) as TrafficDistrict, {
          seed: 3,
          vehicleCount: 0,
          pedestrianCount: 0,
        });
        rt.setRightConflictQuery((jx, jy, px, py, h, r, s) => traffic.conflictFromRight(jx, jy, px, py, h, r, s));
        const staged = traffic.stage({
          kind: "vehicle",
          id: "tj-probe-car",
          pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
          hold: { nodeIndex: 1, offsetM: -30 },
          cruiseSpeedMps: 8,
        });
        expect(staged).not.toBeNull();
        traffic.stagedCommand("tj-probe-car", { type: "cruise" });
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
            playerPos: { x: 4.0625, y },
            playerSpeedKmh: 18,
            playerHeadingDeg: 0,
          });
          const tick = rt.sample(sample(4.0625, y, 0, 18), t, false);
          for (const e of tick.events) {
            if (e.kind === "prioritySituation") codes.push(`${e.situation}:${String(e.violated)}`);
          }
          if (y > 45) break;
        }
        expect(codes).toEqual(["right-hand-rule:true"]);
      });
    }
  });

  describe(`${id} through the traffic lane graph + system`, () => {
    let raw: TrafficDistrict;

    beforeAll(() => {
      raw = loadRaw(id) as TrafficDistrict;
    });

    it("builds the lane graph: 3 two-way edges → 6 directed lanes, loopable", () => {
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(6);
      expect(graph.loopLanes.size).toBe(6);
      // Keyed by crossing id (graph.ts:270), so one entry per authored пътека.
      expect(graph.crossingLanes.size).toBe(c.crossings);
      expect(graph.junctionRadiusM.get("tj-n-c")).toBeGreaterThan(0);
    });

    it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (scenario micro-map)", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 11,
        vehicleCount: 0,
        pedestrianCount: 0,
        anchor: { x: 0, y: -(c.minorArmM - 5) },
        anchorRadiusM: 400,
      });
      expect(traffic.stats.vehicleCount).toBe(0);
      expect(traffic.stats.pedestrianCount).toBe(0);
      for (let i = 0; i < 120; i++) {
        traffic.update(1 / 60, {
          signalPhase: () => "green",
          playerPos: { x: 0, y: -(c.minorArmM - 5) },
          playerSpeedKmh: 10,
        });
      }
      expect(traffic.vehicles.length).toBe(0);
      expect(traffic.conflictNear(0, 0, 20, 0)).toBe(false);
    });

    it("stages a priority-road conflict path and it advances", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 3,
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      const staged = traffic.stage({
        kind: "vehicle",
        id: "tj-test-car",
        pathNodes: ["tj-n-w", "tj-n-c", "tj-n-e"],
        hold: { nodeIndex: 0, offsetM: 0 },
        cruiseSpeedMps: 8,
      });
      expect(staged).not.toBeNull();
      expect(staged!.nodeS.length).toBe(3);
      traffic.stagedCommand("tj-test-car", { type: "cruise" });
      for (let i = 0; i < 300; i++) {
        traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      }
      expect(traffic.staged("tj-test-car")!.s).toBeGreaterThan(20);
    });
  });
}
