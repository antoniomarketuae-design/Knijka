/**
 * PARKING-LOT contract battery — the S2-A wave districts (doc 76 §3; the
 * lot-perp-district.test.ts pattern, parameterized):
 *
 *   lot-par-v1    — angle "parallel" (sc-park-parallel)
 *   lot-45-v1     — angle "45"       (sc-park-45)
 *   lot-narrow-v1 — angle "90" @ 2.5 (sc-park-narrow)
 *
 * Every file must satisfy the FULL engine contract every district drives
 * through: world (assertDistrict + buildWorldGeometry with the 5 painted
 * scenario bays, zero errors), runtime (no signals / stop lines / junctions,
 * 20 km/h everywhere, clean approach ticks) and traffic (approach-only lane
 * graph; an EMPTY lot is a legal config). Plus the publication law: the
 * platform/public copy is byte-identical to the content source.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ParkingBaySpec, VehicleSample } from "../../contracts";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict } from "../types";

const WAVE = [
  { districtId: "lot-par-v1", angle: "parallel", bayWidthM: 2.5 },
  { districtId: "lot-45-v1", angle: "45", bayWidthM: 2.7 },
  { districtId: "lot-narrow-v1", angle: "90", bayWidthM: 2.5 },
] as const;

function repoRoot(): string {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];
  for (const root of candidates) {
    if (fs.existsSync(path.join(root, "content", "world"))) return root;
  }
  throw new Error("content/world not found from " + process.cwd());
}

function loadRaw(districtId: string): unknown {
  const file = path.join(repoRoot(), "content", "world", `${districtId}.json`);
  if (!fs.existsSync(file)) {
    throw new Error(`${file} not found (run: node tools/maps/gen_parking_lot.mjs)`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
}

interface LotScenarioMeta {
  archetype: string;
  params: Record<string, number | string>;
  targetBayId: string;
  bays: Array<ParkingBaySpec & { id: string; occupied: boolean }>;
}

function scenarioMeta(raw: unknown): LotScenarioMeta {
  return (raw as { meta: { scenario: LotScenarioMeta } }).meta.scenario;
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

for (const { districtId, angle, bayWidthM } of WAVE) {
  describe(`${districtId} — the S2-A parking-lot contract battery`, () => {
    const raw = loadRaw(districtId);
    const district = assertDistrict(raw);
    const meta = scenarioMeta(raw);
    const bays: ParkingBaySpec[] = meta.bays.map(({ x, y, headingDeg, widthM, lengthM }) => ({
      x,
      y,
      headingDeg,
      widthM,
      lengthM,
    }));
    const world = buildWorldGeometry(district, { seed: 7, parkingBays: bays });

    it("is a structurally valid district-v1 lot with the wave's recipe", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(3);
      expect(district.roads.edges.length).toBe(2);
      expect(district.intersections.length).toBe(0);
      expect(district.crossings.length).toBe(0);
      expect(district.roundabouts.length).toBe(0);
      expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
        "lot-spawn-approach",
        "lot-spawn-finish",
      ]);
      expect(meta.archetype).toBe("parking-lot");
      expect(meta.params.angle).toBe(angle);
      expect(meta.params.bayWidthM).toBe(bayWidthM);
    });

    it("has exactly ONE free target bay (XX_XX) and it matches targetBayId", () => {
      expect(meta.bays).toHaveLength(5);
      expect(meta.bays.filter((b) => b.occupied)).toHaveLength(4);
      const free = meta.bays.filter((b) => !b.occupied);
      expect(free).toHaveLength(1);
      expect(free[0].id).toBe(meta.targetBayId);
    });

    it("covers both edges with ribbons and paints all 5 scenario bays", () => {
      expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(2);
      expect(world.stats.skippedRibbons).toBe(0);
      expect(world.stats.parkingBays).toBe(5);
      // The bay U-paint rides the markings mesh: 3 quads per bay (L7 pattern).
      const bare = buildWorldGeometry(district, { seed: 7, parkingBays: [] });
      expect(bare.stats.parkingBays).toBe(0);
      expect(world.stats.markingQuads).toBe(bare.stats.markingQuads + 15);
    });

    it("hosts a parking lot, not a street: no lights, no stop signs, no zebras", () => {
      expect(world.trafficLights.length).toBe(0);
      expect(world.stats.signs.stop).toBe(0);
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

    it("builds valid colliders and stays inside the micro-map budget", () => {
      const g = world.colliders.ground;
      expect(g.halfExtents[0]).toBeGreaterThan(10);
      expect(g.halfExtents[2]).toBeGreaterThan(80);
      for (const c of [world.colliders.sidewalks, world.colliders.buildings]) {
        expect(c.positions.length % 3).toBe(0);
        expect(c.indices.length % 3).toBe(0);
        if (c.indices.length > 0) {
          const maxIdx = Math.max(...Array.from(c.indices));
          expect(maxIdx).toBeLessThan(c.positions.length / 3);
        }
      }
      expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
      expect(world.stats.triangles).toBeLessThan(300_000);
    });

    it("is deterministic for a fixed seed", () => {
      const again = buildWorldGeometry(district, { seed: 7, parkingBays: bays });
      expect(again.stats).toEqual(world.stats);
      expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
        Array.from(world.markings.positions.slice(0, 300)),
      );
    });

    it("runtime: zero signals/stop lines/junctions, 20 km/h, clean approach run", () => {
      const runtime = createWorldRuntime(raw);
      expect(runtime.debugSignalClusters().length).toBe(0);
      expect(runtime.debugStopLines().length).toBe(0);
      expect(runtime.debugUncontrolledJunctions().length).toBe(0);
      expect(runtime.speedLimitAt({ x: 0, y: -105 })).toBe(20);
      expect(runtime.speedLimitAt({ x: 0, y: 10 })).toBe(20);
      expect(runtime.locate({ x: 0, y: -105 }).edgeId).toBe("lot-e-approach");
      runtime.update(1 / 60);
      let t = 0;
      for (let y = -115; y <= -35; y += 5) {
        t += 0.5;
        const tick = runtime.sample(sample(0, y, 0, 15), t, false);
        expect(tick.maxSpeedKmh).toBe(20);
        expect(tick.wrongWay).toBe(false);
        expect(tick.events.filter((e) => e.kind === "stopLineCrossed")).toEqual([]);
        expect(tick.events.filter((e) => e.kind === "prioritySituation")).toEqual([]);
        expect(Number.isFinite(tick.laneOffsetM)).toBe(true);
      }
    });

    it("traffic: approach-only lane graph; an EMPTY lot is a legal config", () => {
      const graph = buildLaneGraph(raw as TrafficDistrict, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(2);
      expect(graph.loopLanes.size).toBe(2);
      expect(graph.crossingLanes.size).toBe(0);
      const traffic = createTrafficSystem(raw as TrafficDistrict, {
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
      expect(traffic.pedestrians.length).toBe(0);
      expect(traffic.leadGapMeters(0, -105, 0)).toBe(Infinity);
    });

    it("the published copy is byte-identical to the content source", () => {
      const root = repoRoot();
      const src = fs.readFileSync(path.join(root, "content", "world", `${districtId}.json`));
      const pub = path.join(root, "platform", "public", "world", `${districtId}.json`);
      expect(fs.existsSync(pub)).toBe(true);
      expect(fs.readFileSync(pub).equals(src)).toBe(true);
    });
  });
}
