/**
 * SURFACE-PATCH micro-map contract battery (the ac-vp-districts /
 * curve-districts pattern) — doc 72 §13 AC-07-full „Аквапланинг" + AC-08
 * „Лед по моста".
 *
 * content/world/ac-aqua-v1.json and ac-ice-v1.json
 * (tools/maps/gen_ac_surface.mjs) are the first maps carrying the
 * `waterPatch` / `icePatch` zone kinds — the ONLY zone vocabulary consumed
 * by the PHYSICS RIG instead of the rule-engine tick. The battery proves:
 *  - both files satisfy the full engine contract (builder / runtime /
 *    traffic) with clean plain-street geometry (no lights, signs, zebras,
 *    junctions — nothing else gradable);
 *  - the authored spans are pinned BY VALUE against the tuning constants
 *    (patchGripFactor = AQUAPLANE_/ICE_PATCH_GRIP_FACTOR, the water float
 *    gate = AQUAPLANE_ABOVE_KMH) — tuning.ts stays the documented truth;
 *  - the runtime treats the kinds as unknown (inert on the tick — the
 *    additive contract; the rig-side seam is covered by
 *    runtime/__tests__/surface-patches.test.ts);
 *  - determinism + byte-identical public copies.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import {
  AQUAPLANE_ABOVE_KMH,
  AQUAPLANE_PATCH_GRIP_FACTOR,
  ICE_PATCH_GRIP_FACTOR,
} from "../../vehicle";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** Shared truths of both instances (generator params — asserted below). */
const LANE_X = 4.06;

interface InstanceSpec {
  id: string;
  lengthM: number;
  maxspeedKmh: number;
  edgeId: string;
  spawnId: string;
  zone: {
    kind: "waterPatch" | "icePatch";
    fromM: number;
    toM: number;
    patchGripFactor: number;
    aquaplaneAboveKmh?: number;
  };
}

const INSTANCES: InstanceSpec[] = [
  {
    id: "ac-aqua-v1",
    lengthM: 520,
    maxspeedKmh: 90,
    edgeId: "ac-aqua-e-street",
    spawnId: "ac-aqua-spawn-approach",
    zone: {
      kind: "waterPatch",
      fromM: 240,
      toM: 280,
      patchGripFactor: AQUAPLANE_PATCH_GRIP_FACTOR,
      aquaplaneAboveKmh: AQUAPLANE_ABOVE_KMH,
    },
  },
  {
    id: "ac-ice-v1",
    lengthM: 360,
    maxspeedKmh: 50,
    edgeId: "ac-ice-e-street",
    spawnId: "ac-ice-spawn-approach",
    zone: {
      kind: "icePatch",
      fromM: 210,
      toM: 300,
      patchGripFactor: ICE_PATCH_GRIP_FACTOR,
    },
  },
];

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ac_surface.mjs) in: ${candidates.join(", ")}`);
}

const sample = (x: number, y: number, headingDeg: number, speedKmh: number): VehicleSample => ({
  position: { x, y },
  headingDeg,
  speedKmh,
  indicator: "off",
  headlights: "low",
  seatbeltOn: true,
  handbrakeOn: false,
  gear: 1,
  mirrorGlance: null,
});

for (const spec of INSTANCES) {
  describe(`${spec.id} through the world builder`, () => {
    let raw: unknown;
    let district: District;
    let world: WorldGeometry;

    beforeAll(() => {
      raw = loadRaw(spec.id);
      district = assertDistrict(raw);
      world = buildWorldGeometry(district, { seed: 7 });
    });

    it("is a structurally valid district-v1 document carrying ONE authored surface span", () => {
      expect(district.meta.attribution.text).toContain("оригинален");
      expect(district.roads.nodes.length).toBe(2);
      expect(district.roads.edges.length).toBe(1);
      const road = district.roads.edges[0];
      expect(road.id).toBe(spec.edgeId);
      expect(road.lanes).toBe(2);
      expect(road.oneway).toBe(false);
      expect(road.maxspeed).toBe(spec.maxspeedKmh);
      expect(road.length).toBe(spec.lengthM);
      expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
      const zones = (district as { zones?: unknown[] }).zones as Array<{
        kind: string;
        edgeId: string;
        fromM: number;
        toM: number;
        signRef: string;
        patchGripFactor?: number;
        aquaplaneAboveKmh?: number;
      }>;
      expect(zones).toHaveLength(1);
      const z = zones[0];
      expect(z.kind).toBe(spec.zone.kind);
      expect(z.edgeId).toBe(spec.edgeId);
      expect(z.fromM).toBe(spec.zone.fromM);
      expect(z.toM).toBe(spec.zone.toM);
      expect(z.signRef).toBe("А15"); // „Опасност от хлъзгане" — provenance only
      // The map VALUES equal the tuning constants — tuning.ts stays the
      // single documented truth (the LANE_X by-value discipline).
      expect(z.patchGripFactor).toBe(spec.zone.patchGripFactor);
      expect(z.aquaplaneAboveKmh).toBe(spec.zone.aquaplaneAboveKmh);
    });

    it("hosts a plain street: no lights, no stop signs, no zebras, no junctions", () => {
      expect(district.intersections.length).toBe(0);
      expect(world.trafficLights.length).toBe(0);
      expect(world.stats.signs.stop).toBe(0);
      expect(world.stats.signs.giveWay).toBe(0);
      expect(world.stats.zebraCrossings).toBe(0);
    });

    it("pins the scenario payload the templates denormalize", () => {
      const meta = district.meta as {
        scenario?: { laneCenterRightM?: number; params?: Record<string, number> };
      };
      expect(meta.scenario?.laneCenterRightM).toBe(LANE_X);
      expect(meta.scenario?.params).toEqual({
        lengthM: spec.lengthM,
        maxspeedKmh: spec.maxspeedKmh,
      });
      const spawn = district.spawnPoints.find((s) => s.id === spec.spawnId)!;
      expect(spawn).toBeTruthy();
      expect(spawn.x).toBe(LANE_X);
      expect(spawn.y).toBe(15);
      expect(spawn.heading).toBe(0);
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
    });

    it("the published copy is byte-identical to the content source", () => {
      const srcCandidates = [
        path.join(process.cwd(), "content", "world", `${spec.id}.json`),
        path.resolve(process.cwd(), "..", "content", "world", `${spec.id}.json`),
      ];
      const src = srcCandidates.find((f) => fs.existsSync(f))!;
      const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${spec.id}.json`);
      expect(fs.existsSync(pub)).toBe(true);
      expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
    });
  });

  describe(`${spec.id} through the world runtime — the kinds stay tick-inert (additive contract)`, () => {
    it("derives ZERO signals, stop lines and junction trackers; the span adds NOTHING to the tick", () => {
      const rt = createWorldRuntime(loadRaw(spec.id));
      expect(rt.debugSignalClusters().length).toBe(0);
      expect(rt.debugStopLines().length).toBe(0);
      expect(rt.debugUncontrolledJunctions().length).toBe(0);
      // Lane fix on / before / after the span — and no surface vocabulary on
      // the tick: the PHYSICS RIG is the consumer of these kinds
      // (runtime/surface.ts; surface-patches.test.ts covers that seam).
      let t = 0;
      for (const y of [spec.zone.fromM - 20, (spec.zone.fromM + spec.zone.toM) / 2, spec.zone.toM + 15]) {
        t += 1;
        rt.update(1 / 60);
        const tick = rt.sample(sample(LANE_X, y, 0, 40), t, false);
        expect(tick.edgeId, `y=${y}`).toBe(spec.edgeId);
        expect(tick.laneId, `y=${y}`).toBe(0);
        expect(tick.maxSpeedKmh, `y=${y}`).toBe(spec.maxspeedKmh);
        expect("waterPatch" in tick).toBe(false);
        expect("icePatch" in tick).toBe(false);
      }
    });
  });

  describe(`${spec.id} through the traffic lane graph + system`, () => {
    it("builds the 1+1 lane graph; zero traffic is a LEGAL config", () => {
      const raw = loadRaw(spec.id) as TrafficDistrict;
      const graph = buildLaneGraph(raw, {
        laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
        excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
        crossingSignalRadiusM: 45,
      });
      expect(graph.lanes.length).toBe(2); // one per direction
      expect(graph.crossingLanes.size).toBe(0);
      const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
      expect(traffic.stats.vehicleCount).toBe(0);
      expect(traffic.leadGapMeters(LANE_X, 15, 0)).toBe(Infinity);
    });
  });
}
