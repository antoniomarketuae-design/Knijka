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
 *  - EVERY corridor template's staged actor paths resolve against the real
 *    lane graph with their holds inside the path (the timing single truth) —
 *    the day pair (OV-05/OV-08) and the NIGHT drill (sc-ov-night-gap), which
 *    reuses this district in the dark;
 *  - the published copy is byte-identical (the map pipeline law).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { OncomingStreamSpec, VehicleSample } from "../../contracts";
import { SC_OV_ABORT, SC_OV_ONCOMING_GAP } from "../../lessons/scenario/templates-lanes";
import { SC_OV_BEING_OVERTAKEN, SC_OV_NIGHT_GAP } from "../../lessons/scenario/templates-lanes2";
import { DEFAULT_RULE_CONFIG } from "../../rules";
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

/** Every template that lives on this district — the day corridor pair, the
 *  night drill (sc-ov-night-gap) and the BEING-overtaken drill
 *  (sc-ov-being-overtaken), both templates-lanes2. */
const CORRIDOR_TEMPLATES = [
  SC_OV_ONCOMING_GAP,
  SC_OV_ABORT,
  SC_OV_NIGHT_GAP,
  SC_OV_BEING_OVERTAKEN,
];

describe("ov-oncoming-v1 — the corridor templates' staged paths resolve (single truth)", () => {
  it("every template's actor paths resolve on the real lane graph with holds inside the path", () => {
    const graph = buildLaneGraph(loadRaw() as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    for (const spec of CORRIDOR_TEMPLATES) {
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

  it("every template pins THIS district and the generator recipe (the L7 copy truth)", () => {
    const d = loadRaw() as {
      meta: { scenario?: { laneCenterRightM?: number; laneCenterOncomingM?: number; params?: Record<string, number> } };
    };
    for (const spec of CORRIDOR_TEMPLATES) {
      expect(spec.map.districtId).toBe("ov-oncoming-v1");
      expect(d.meta.scenario?.params?.lengthM).toBe(spec.map.params.lengthM);
      expect(d.meta.scenario?.params?.maxspeedKmh).toBe(spec.map.params.maxspeedKmh);
    }
    expect(d.meta.scenario?.laneCenterRightM).toBe(X_OWN);
    expect(d.meta.scenario?.laneCenterOncomingM).toBe(X_ONCOMING);
  });
});

describe("ov-oncoming-v1 — the invariants the NIGHT drill rests on (sc-ov-night-gap)", () => {
  it("nothing but the GAP is gradable here — the night drill inherits the corridor's silence", () => {
    // The night template's honesty rests on this: no zones (crossing the осева
    // is legal), no signals, no zebras. So „не започвай срещу фаровете" cannot
    // be passed by obeying a painted line — the only thing that can convict is
    // the measured oncoming window. The lesson is the JUDGEMENT, not the sign.
    const d = assertDistrict(loadRaw());
    expect(d.zones).toBeUndefined();
    const world = buildWorldGeometry(d, { seed: 7 });
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("the night drill starts on the own-lane spawn both day templates use", () => {
    const d = loadRaw() as { spawnPoints: Array<{ id: string; x: number; y: number; heading: number }> };
    const spawn = d.spawnPoints.find((s) => s.id === SC_OV_NIGHT_GAP.start.spawnPointId);
    expect(spawn, `${String(SC_OV_NIGHT_GAP.start.spawnPointId)} must exist on ov-oncoming-v1`).toBeDefined();
    expect(spawn!.x).toBe(X_OWN);
    expect(spawn!.heading).toBe(0); // northbound — the oncoming bank is the other one
  });

  it("the BEING-overtaken drill starts on the same own-lane spawn", () => {
    const d = loadRaw() as { spawnPoints: Array<{ id: string; x: number; heading: number }> };
    const spawn = d.spawnPoints.find((s) => s.id === SC_OV_BEING_OVERTAKEN.start.spawnPointId);
    expect(spawn, "sc-ov-being-overtaken must spawn on ov-oncoming-v1").toBeDefined();
    expect(spawn!.x).toBe(X_OWN);
    expect(spawn!.heading).toBe(0); // northbound — the overtaker comes from behind
  });

  it("the night stream's TWO holds — the trap and the dark window — fit the 900 m path", () => {
    // The generic staged-path loop above proves resolvability; this pins the
    // AUTHORED story: car 0 near the follow zone, car 1 far enough behind that
    // the pass window is real (both in instant-cruise terms — see the template).
    const stream = (SC_OV_NIGHT_GAP.staged ?? []).find((s) => s.kind === "oncomingStream") as
      | OncomingStreamSpec
      | undefined;
    expect(stream).toBeDefined();
    expect(stream!.count).toBe(2);
    expect(stream!.gapsM).toEqual([560]);
    // Hold is measured from ovg-n-end southbound: 900 − 282 ⇒ instant model y 310.
    expect(stream!.actor.hold.offsetM).toBe(618);
    // …and the trailing car, held 560 m BEHIND the head on the SAME path, still
    // starts ON it (offset 58). A gap > the head's hold would silently push it
    // off the path's start — the generic loop above is the law, this is the WHY.
    expect(stream!.actor.hold.offsetM - stream!.gapsM[0]).toBeGreaterThanOrEqual(0);
  });
});

describe("ov-oncoming-v1 — the lane geometry sc-ov-being-overtaken's OV-12 code rests on", () => {
  /** laneKeepMaxOffsetM = 1.3 × PERCEPTUAL_ROAD_SCALE — the off-centre band. */
  const MAX_OFF = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM;

  it("laneOffsetM is measured from the NEAREST lane centre and PEAKS on the осева", () => {
    // The template's whole code choice depends on this shape. Offset (+ = left)
    // grows as the car leans toward the осева, tops out at the half-pitch on
    // x = 0, and SHRINKS again past it (the other lane's centre takes over) —
    // which is why a driver sitting fully on the oncoming bank is graded by
    // opposingBank, not by lane-keeping.
    const rt = createWorldRuntime(loadRaw());
    const offsetAt = (x: number): number => {
      rt.update(1 / 60);
      return rt.sample(sample(x, 300, 0, 70), 1, false).laneOffsetM;
    };
    expect(offsetAt(X_OWN)).toBeCloseTo(0, 1); // own centre
    expect(offsetAt(0)).toBeGreaterThan(MAX_OFF); // the осева itself — peak
    expect(offsetAt(0)).toBeCloseTo(4.06, 1);
    expect(offsetAt(-2.5)).toBeLessThan(MAX_OFF); // past it: the OTHER centre governs
  });

  it("the CENTER-LINE band is a narrow corridor on the own side of the осева", () => {
    // sc-ov-being-overtaken's „Ляво дърпане" demo rides x = 0.3. It must clear
    // the band (offset > MAX_OFF) while STAYING on the own bank — a drift that
    // slipped past x = 0 would be graded as an opposing-bank excursion instead,
    // a different lesson entirely.
    const rt = createWorldRuntime(loadRaw());
    const at = (x: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(x, 300, 0, 65), 1, false);
    };
    const ride = at(0.3);
    expect(ride.laneOffsetM).toBeGreaterThan(MAX_OFF);
    expect(ride.opposingBank).toBeUndefined(); // still legally on our own side
    // …and a car merely right-of-centre (the shadow's hug) is nowhere near it.
    expect(Math.abs(at(5.6).laneOffsetM)).toBeLessThan(MAX_OFF);
  });

  it("no lane RENUMBERS anywhere across the road — laneId 0 / laneCount 1 throughout", () => {
    // The proof behind every „no lane-change code can exist here" assertion in
    // the sc-ov-night-gap and sc-ov-being-overtaken gates: on this 1+1 the bank
    // flip does not change laneId, so the lane-change tracker has no edge to
    // fire on — in EITHER direction, positive or negative.
    const rt = createWorldRuntime(loadRaw());
    for (let x = -6; x <= 8; x += 0.5) {
      rt.update(1 / 60);
      const s = rt.sample(sample(x, 300, 0, 70), 1, false);
      expect(s.laneId, `laneId at x=${x}`).toBe(0);
      expect(s.laneCount, `laneCount at x=${x}`).toBe(1);
    }
  });

  it("sc-ov-being-overtaken's success zones sit in the own lane, inside the road", () => {
    for (const objective of SC_OV_BEING_OVERTAKEN.success) {
      const p = objective.params as { x: number; y: number; radiusM: number };
      expect(p.x).toBe(X_OWN);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(900); // inside the committed 900 m road
      // Radius under the lane pitch: unsatisfiable from the oncoming bank.
      expect(p.radiusM).toBeLessThan(8.125);
    }
  });
});
