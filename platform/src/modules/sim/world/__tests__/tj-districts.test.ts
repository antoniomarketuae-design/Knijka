/**
 * T-JUNCTION archetype contract battery (Scenario Studio doc 76 §3; the
 * lot-perp-district.test.ts pattern, one battery for BOTH committed control
 * variants of tools/maps/gen_t_junction.mjs):
 *
 *   - tj-rhr-v1  — control "none": every edge residential → the runtime
 *     derives ZERO stop lines and tj-n-c becomes an UNCONTROLLED right-hand-
 *     rule junction (the JU-01 host);
 *   - tj-stop-v1 — control "stop": PRIMARY priority road + residential stem →
 *     the stop-sign heuristic derives the Б2 line at the stem mouth NATURALLY
 *     (no STOP_LINE_OVERRIDES entry), and the world builder places the
 *     matching VISIBLE Б2 sign (props.ts maxRank >= 5) — graded control and
 *     visuals agree by construction.
 *
 * Both files must satisfy the FULL engine contract every district drives
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
  throw new Error(`${id}.json not found (run: node tools/maps/gen_t_junction.mjs) in: ${candidates.join(", ")}`);
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

for (const id of ["tj-rhr-v1", "tj-stop-v1"] as const) {
  const isStop = id === "tj-stop-v1";

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
      expect(district.crossings.length).toBe(0);
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
        expect(world.stats.zebraCrossings).toBe(0);
        if (isStop) {
          // props.ts: minor approach into a maxRank >= 5 junction → Б2.
          expect(world.stats.signs.stop).toBe(1);
          expect(world.stats.signs.giveWay).toBe(0);
        } else {
          expect(world.stats.signs.stop).toBe(0);
          expect(world.stats.signs.giveWay).toBe(0);
        }
      },
    );

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
      expect(g.halfExtents[0]).toBeGreaterThan(140);
      expect(g.halfExtents[2]).toBeGreaterThan(50);
      for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
        expect(c.positions.length % 3).toBe(0);
        expect(c.indices.length % 3).toBe(0);
        if (c.indices.length > 0) {
          const maxIdx = Math.max(...Array.from(c.indices));
          expect(maxIdx).toBeLessThan(c.positions.length / 3);
        }
      }
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
          expect(line.id).toBe("tj-e-s@92.3:stopSign");
          // Junction-mouth derivation: the primary half-width (12.125 m) +
          // arterial corner (15 m) + paint inset (0.6 m) → 27.725 m from the
          // node on the 120 m stem → sM = 92.275, crossing northbound.
          expect(line.sM).toBeCloseTo(92.275, 3);
          expect(line.dirSign).toBe(1);
          expect(line.approachBearingDeg).toBeCloseTo(0, 5);
          // The guarded node is NOT an RHR junction.
          expect(runtime.debugUncontrolledJunctions()).toEqual([]);
        } else {
          expect(lines).toEqual([]);
          expect(runtime.debugUncontrolledJunctions()).toEqual([{ id: "tj-n-c", x: 0, y: 0 }]);
        }
      },
    );

    it("resolves the tagged speed limits per road", () => {
      expect(runtime.speedLimitAt({ x: 0, y: -100 })).toBe(40); // stem
      expect(runtime.speedLimitAt({ x: 100, y: 0 })).toBe(isStop ? 50 : 40); // priority road
    });

    it("locates every spawn point on its authored edge", () => {
      expect(runtime.locate({ x: 0, y: -105 }).edgeId).toBe("tj-e-s");
      expect(runtime.locate({ x: 135, y: 0 }).edgeId).toBe("tj-e-e");
      expect(runtime.locate({ x: -135, y: 0 }).edgeId).toBe("tj-e-w");
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
      // Stop at y = -40: before the Б2 line (-27.7) on the stop variant.
      for (let y = -100; y <= -40; y += 5) {
        t += 0.5;
        const tick = runtime.sample(sample(4.0625, y, 0, 20), t, false);
        expect(tick.maxSpeedKmh).toBe(40);
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

      it("the next-stop-line context (B1a) reports the Б2 ahead on the approach", () => {
        const rt = createWorldRuntime(loadRaw(id));
        rt.update(1 / 60);
        const tick = rt.sample(sample(4.0625, -60, 0, 20), 0.5, false);
        expect(tick.nextStopLineControl).toBe("stopSign");
        expect(tick.nextStopLineM).toBeCloseTo(60 - 27.725, 0);
        // Stop signs carry no lamp state — the JU-15 red-light overshoot
        // detector (rules/engine.ts) is structurally silent on this map.
        expect(tick.nextStopLineState).toBeUndefined();
      });
    } else {
      it("the right-hand-rule tracker adjudicates a staged conflict from the right", () => {
        const rt = createWorldRuntime(loadRaw(id));
        const traffic = createTrafficSystem(loadRaw(id) as TrafficDistrict, {
          seed: 3,
          vehicleCount: 0,
          pedestrianCount: 0,
        });
        rt.setRightConflictQuery((jx, jy, px, py, h, r) => traffic.conflictFromRight(jx, jy, px, py, h, r));
        const staged = traffic.stage({
          kind: "vehicle",
          id: "tj-probe-car",
          pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
          hold: { nodeIndex: 1, offsetM: -30 },
          cruiseSpeedMps: 8,
        });
        expect(staged).not.toBeNull();
        traffic.stagedCommand("tj-probe-car", { type: "cruise" });
        // Player barges north through the core at 18 km/h while the car
        // crosses from the right — the tracker must convict exactly once.
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
      expect(graph.crossingLanes.size).toBe(0);
      expect(graph.junctionRadiusM.get("tj-n-c")).toBeGreaterThan(0);
    });

    it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (scenario micro-map)", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 11,
        vehicleCount: 0,
        pedestrianCount: 0,
        anchor: { x: 0, y: -105 },
        anchorRadiusM: 400,
      });
      expect(traffic.stats.vehicleCount).toBe(0);
      expect(traffic.stats.pedestrianCount).toBe(0);
      for (let i = 0; i < 120; i++) {
        traffic.update(1 / 60, {
          signalPhase: () => "green",
          playerPos: { x: 0, y: -105 },
          playerSpeedKmh: 10,
        });
      }
      expect(traffic.vehicles.length).toBe(0);
      expect(traffic.leadGapMeters(0, -105, 0)).toBe(Infinity);
      expect(traffic.conflictNear(0, 0, 20, 0)).toBe(false);
    });

    it("stages the JU-01 conflict path (east → center → west) and it advances", () => {
      const traffic = createTrafficSystem(raw, {
        seed: 3,
        vehicleCount: 0,
        pedestrianCount: 0,
      });
      const staged = traffic.stage({
        kind: "vehicle",
        id: "tj-test-car",
        pathNodes: ["tj-n-e", "tj-n-c", "tj-n-w"],
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
