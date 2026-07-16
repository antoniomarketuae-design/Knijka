/**
 * OVERTAKE-CORRIDOR archetype contract battery (doc 72 OV-05/OV-08; the
 * line-districts.test.ts pattern).
 *
 * content/world/ov-oncoming-v1.json (900 m extra-urban 1+1, dashed осева,
 * limit 90 — tools/maps/gen_ov_oncoming.mjs) is the corridor's home ground
 * and DELIBERATELY carries NO `zones` array: crossing the осева is legal
 * here, which is what makes the graded quantity the ONCOMING GAP (the
 * runtime's overtake-corridor tracker), never the marking. The battery
 * proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - the corridor context surfaces on the tick exactly as designed
 *    (opposingBank on the oncoming bank; NO zone flag anywhere);
 *  - BOTH corridor templates' staged actor paths resolve against the real
 *    lane graph with their holds inside the path (the timing single truth);
 *  - the published copy is byte-identical (the map pipeline law).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { OncomingStreamSpec, VehicleSample } from "../../contracts";
import { SC_OV_ABORT, SC_OV_ONCOMING_GAP } from "../../lessons/scenario/templates-lanes";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { resolveStagedVehiclePath } from "../../traffic/staged";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** ov-oncoming-v1 lane centers (meta.scenario — the L7 copy truth). */
const X_OWN = 4.06;
const X_ONCOMING = -4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-oncoming-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-oncoming-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ov-oncoming-v1.json not found (run: node tools/maps/gen_ov_oncoming.mjs)`);
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

describe("ov-oncoming-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document with NO zones (dashed осева by design)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.id).toBe("ovg-e-road");
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(90);
    expect(road.length).toBe(900);
    expect(district.meta.zonesVersion).toBeUndefined();
    expect(district.zones).toBeUndefined();
  });

  it("hosts a plain rural road: no lights, no stop signs, no zebras, no junctions", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(district.intersections.length).toBe(0);
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
      path.join(process.cwd(), "content", "world", "ov-oncoming-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-oncoming-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-oncoming-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-oncoming-v1 through the world runtime — the corridor context", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("the own lane carries NO corridor context; the oncoming bank sets opposingBank and nothing else", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const own = rt.sample(sample(X_OWN, 300, 0, 50), 1, false);
    expect(own.opposingBank).toBeUndefined();
    expect(own.oneway).toBe(false);
    expect(own.solidCenterLine).toBeUndefined();
    expect(own.narrowTwoWay).toBeUndefined(); // 1+1 = 2 marked lanes, not narrow
    expect(own.maxSpeedKmh).toBe(90);
    rt.update(1 / 60);
    const out = rt.sample(sample(-2.5, 320, 0, 55), 2, false);
    expect(out.opposingBank).toBe(true);
    expect(out.solidCenterLine).toBeUndefined();
    // A southbound driver in ITS own (western) lane is NOT on an opposing bank.
    rt.update(1 / 60);
    const oncoming = rt.sample(sample(X_ONCOMING, 340, 180, 50), 3, false);
    expect(oncoming.opposingBank).toBeUndefined();
  });
});

describe("ov-oncoming-v1 — the corridor templates' staged paths resolve (single truth)", () => {
  it("both templates' actor paths resolve on the real lane graph with holds inside the path", () => {
    const graph = buildLaneGraph(loadRaw() as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    for (const spec of [SC_OV_ONCOMING_GAP, SC_OV_ABORT]) {
      for (const staged of spec.staged ?? []) {
        if (!("actor" in staged) || staged.actor === undefined || !("pathNodes" in staged.actor)) continue;
        const actor = staged.actor;
        const resolved = resolveStagedVehiclePath(graph, actor.pathNodes, actor.extraRightOffsetM ?? 0);
        expect(resolved, `${spec.id}/${staged.id} path must resolve`).not.toBeNull();
        const holdArc = resolved!.nodeS[actor.hold.nodeIndex] + actor.hold.offsetM;
        expect(holdArc, `${spec.id}/${staged.id} hold inside path`).toBeGreaterThanOrEqual(0);
        expect(holdArc).toBeLessThanOrEqual(resolved!.length);
        // The oncoming stream's staggered holds must fit the path too.
        if (staged.kind === "oncomingStream") {
          const stream = staged as OncomingStreamSpec;
          expect(stream.gapsM).toHaveLength(stream.count - 1);
          for (const g of stream.gapsM) {
            expect(holdArc - g).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
  });

  it("both templates pin THIS district and the generator recipe (the L7 copy truth)", () => {
    const d = loadRaw() as {
      meta: { scenario?: { laneCenterRightM?: number; laneCenterOncomingM?: number; params?: Record<string, number> } };
    };
    for (const spec of [SC_OV_ONCOMING_GAP, SC_OV_ABORT]) {
      expect(spec.map.districtId).toBe("ov-oncoming-v1");
      expect(d.meta.scenario?.params?.lengthM).toBe(spec.map.params.lengthM);
      expect(d.meta.scenario?.params?.maxspeedKmh).toBe(spec.map.params.maxspeedKmh);
    }
    expect(d.meta.scenario?.laneCenterRightM).toBe(X_OWN);
    expect(d.meta.scenario?.laneCenterOncomingM).toBe(X_ONCOMING);
  });
});
