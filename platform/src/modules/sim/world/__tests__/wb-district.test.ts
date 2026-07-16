/**
 * WB wide-boulevard micro-map contract battery (Scenario Studio doc 76 §3; the
 * nm-district.test.ts pattern for a plain two-way street, here 2 lanes per
 * direction).
 *
 * content/world/wb-boulevard-v1.json is the wide-boulevard generated micro-map
 * (tools/maps/gen_wide_boulevard.mjs — one straight two-way boulevard, TWO lanes
 * per direction, a posted limit and NOTHING else). The kerbs + the U-turn are
 * STAGED lesson data (sc-maneuver-uturn); the map only hosts the street. The
 * battery proves the file satisfies the FULL engine contract: world builder,
 * runtime speed-limit surface, traffic graph.
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

const ID = "wb-boulevard-v1";
const LIMIT_KMH = 40;
const LENGTH_M = 200;
const X_OUT = 12.19; // outer-lane center of a 2+2 boulevard
const X_IN = 4.06; // inner-lane center

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_wide_boulevard.mjs)`);
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

  it("is a structurally valid district-v1 document (2+2 two-way boulevard)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(4);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(LIMIT_KMH);
    expect(road.length).toBe(LENGTH_M);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
  });

  it("hosts a plain boulevard: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
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

describe(`${ID} through the world runtime — the speed-limit surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (boulevard by design)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored limit everywhere and surfaces both northbound lanes", () => {
    expect(runtime.speedLimitAt({ x: X_OUT, y: 15 })).toBe(LIMIT_KMH);
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    // Outer lane = laneId 0; inner lane = laneId 1 (locator: 0 = outermost).
    const tOut = rt.sample(sample(X_OUT, 100, 0, 20), 1, false);
    expect(tOut.edgeId).toBe("wb-e-street");
    expect(tOut.laneId).toBe(0);
    expect(tOut.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(tOut.oneway).toBe(false);
    const rt2 = createWorldRuntime(loadRaw(ID));
    rt2.update(1 / 60);
    const tIn = rt2.sample(sample(X_IN, 100, 0, 20), 1, false);
    expect(tIn.laneId).toBe(1);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph (1 routable lane per direction over the single edge), no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // The traffic router uses one lane per direction per edge; the boulevard's
    // 2+2 marking drives the runtime's procedural banks (locator), not this graph.
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});
