/**
 * HZ accident-scene micro-map contract battery (Scenario Studio doc 76 §3; the
 * hz-obstacle-district / ban-districts pattern for a plain two-way 1+1 street
 * carrying a single В27 noStopping span).
 *
 * content/world/hz-accident-v1.json is the accident-scene generated micro-map
 * (tools/maps/gen_hz_accident.mjs — one straight two-way street, ONE lane per
 * direction, a posted limit, a noStopping span through the scene and NOTHING
 * else). The wreck tableau + bystander are STAGED lesson data
 * (sc-hz-accident-scene); the map only hosts the street and the ban span. The
 * battery proves the file satisfies the FULL engine contract and pins the four
 * absences the template's grading design rests on.
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

const ID = "hz-accident-v1";
const LIMIT_KMH = 50;
const LENGTH_M = 260;
const X_LANE = 4.06;
/** The В27 span the template's ILLEGAL_STOP grading rides (gen_hz_accident). */
const BAN_FROM_M = 120;
const BAN_TO_M = 195;
/** The wide-pass line the shadow arcs onto to clear the wreck (templates-hazards2). */
const X_WIDE = 2.0;
/** Mid-scene y (the wreck tableau sits here — recorder data, not map data). */
const SCENE_Y = 155;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_hz_accident.mjs)`);
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

  it("is a structurally valid district-v1 document (plain two-way street)", () => {
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(LIMIT_KMH);
    expect(road.length).toBe(LENGTH_M);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
  });

  it("hosts a plain street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("carries EXACTLY one В27 noStopping span through the scene (the zones slice)", () => {
    expect(district.meta.zonesVersion).toBe(1);
    expect(district.zones).toHaveLength(1);
    const z = district.zones![0];
    expect(z.kind).toBe("noStopping");
    expect(z.signRef).toBe("В27");
    expect(z.edgeId).toBe("hza-e-street");
    expect(z.fromM).toBe(BAN_FROM_M);
    expect(z.toM).toBe(BAN_TO_M);
  });

  it("produces no NaN/infinite coordinates in the core buffers", () => {
    const buffers = [world.roadSurface, world.markings, world.sidewalks, world.terrain];
    let nonFinite = 0;
    for (const mesh of buffers) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
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

describe(`${ID} through the world runtime — the В27 span on the tick`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored limit and the single northbound lane", () => {
    expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(LIMIT_KMH);
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    const tick = rt.sample(sample(X_LANE, 100, 0, 30), 1, false);
    expect(tick.edgeId).toBe("hza-e-street");
    expect(tick.laneId).toBe(0);
    expect(tick.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(tick.oneway).toBe(false);
  });

  it("flags noStopZone EXACTLY inside the span (before / inside / after)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagOf = (y: number) => {
      rt.update(1 / 60);
      const tick = rt.sample(sample(X_LANE, y, 0, 30), y, false);
      return {
        noStopZone: tick.noStopZone,
        noParkZone: tick.noParkZone,
        noOvertakeZone: tick.noOvertakeZone,
      };
    };

    const before = flagOf(BAN_FROM_M - 20);
    expect(before.noStopZone).toBeUndefined();

    // The gawk-stop mark (y = 140, templates-hazards2) is INSIDE the span, so a
    // stop there grades ILLEGAL_STOP_IN_BAN_ZONE; the scene centre is too.
    for (const y of [140, SCENE_Y, (BAN_FROM_M + BAN_TO_M) / 2]) {
      const inside = flagOf(y);
      expect(inside.noStopZone, `y=${y}`).toBe(true);
      // Only THE zone's flag — nothing else leaks.
      expect(inside.noParkZone, `y=${y}`).toBeUndefined();
      expect(inside.noOvertakeZone, `y=${y}`).toBeUndefined();
    }

    // The finish mark (y = 235) sits BEYOND the span, so the shadow's final rest
    // is not billed.
    const after = flagOf(BAN_TO_M + 20);
    expect(after.noStopZone).toBeUndefined();
    expect(after.noParkZone).toBeUndefined();
    expect(after.noOvertakeZone).toBeUndefined();
  });
});

describe(`${ID} — the invariants sc-hz-accident-scene depends on (wave-8 VP-12)`, () => {
  // The template stages a curb-side wreck + a bystander on a street with NO
  // crossing. Its whole grading design rests on the absences below — if any of
  // them ever appears here, the drill silently changes shape:
  //  - a crossing would arm the CrossingZoneTracker and start billing
  //    PEDESTRIAN_* on the bystander (the mistake codeRefs are exact — the
  //    tight-and-fast demo must grade COLLISION, never a zebra duty);
  //  - a junction/stop line would feed the ban-zone detector's control
  //    acquittal, dissolving the gawk-stop's ILLEGAL_STOP_IN_BAN_ZONE grade.
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
  });

  it("carries NO crossing or junction: the drill grades the В27 stop + contact, not a zebra duty", () => {
    expect(district.crossings.length).toBe(0);
    expect(district.intersections.length).toBe(0);
    const rt = createWorldRuntime(loadRaw(ID));
    expect(rt.debugSignalClusters().length).toBe(0);
    expect(rt.debugStopLines().length).toBe(0);
    expect(rt.debugUncontrolledJunctions().length).toBe(0);
  });

  it("hosts the scene geometry: the wide-pass line, the driving line and the wreck are on the street", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    // The driving line sits at lane centre; the wide-pass line (x = 2.0) is
    // still within the lane-keep tolerance (|offset| < 3.25 toward the crown),
    // so the shadow's arc around the wreck bills no POOR_LANE_KEEPING.
    const onLine = rt.sample(sample(X_LANE, SCENE_Y, 0, 30), 1, false);
    expect(onLine.laneOffsetM).toBeCloseTo(0, 2);
    expect(onLine.laneId).toBe(0);
    const wide = rt.sample(sample(X_WIDE, SCENE_Y, 0, 30), 1.1, false);
    expect(Math.abs(wide.laneOffsetM)).toBeLessThan(3.25);
    expect(wide.laneId).toBe(0);
    // …and the curb-side wreck line (x = 7.0) is still on the carriageway (the
    // tight-and-fast pass that clips it grades COLLISION off a real position).
    const wreck = rt.sample(sample(7.0, SCENE_Y, 0, 30), 1.2, false);
    expect(wreck.edgeId).toBe("hza-e-street");
    // The scene spans y ∈ [150, 165]; the В27 span must cover all of it.
    expect(BAN_FROM_M).toBeLessThan(150);
    expect(BAN_TO_M).toBeGreaterThan(165);
    // The finish runs out beyond the span, inside the street.
    expect(LENGTH_M).toBeGreaterThan(235);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph: 2 directed lanes, no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});
