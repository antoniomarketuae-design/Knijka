/**
 * SP-transition micro-map contract battery (Scenario Studio doc 76 §3; the
 * nm-district.test.ts pattern, here for a TWO-SEGMENT street whose limit drops
 * mid-route).
 *
 * content/world/sp-trans-v1.json is the 50→30 zone-transition generated
 * micro-map (tools/maps/gen_sp_transition.mjs — a 160 m approach @ 50 then a
 * 200 m zone @ 30, meeting at a degree-2 mid node). The battery proves the file
 * satisfies the FULL engine contract AND the crux of SP-03: the runtime grades
 * PER EDGE, so the local limit is 50 before the transition and 30 after it, with
 * no stop line or junction derived at the mid node.
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

const ID = "sp-trans-v1";
const APPROACH_KMH = 50;
const ZONE_KMH = 30;
const TRANSITION_Y = 160;
const TOTAL_M = 360;
const X_LANE = 4.06;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_sp_transition.mjs)`);
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

  it("is a structurally valid district-v1 document (two collinear segments)", () => {
    expect(district.roads.nodes.length).toBe(3);
    expect(district.roads.edges.length).toBe(2);
    const approach = district.roads.edges.find((e) => e.id === "sp-tr-e-approach")!;
    const zone = district.roads.edges.find((e) => e.id === "sp-tr-e-zone")!;
    expect(approach.maxspeed).toBe(APPROACH_KMH);
    expect(zone.maxspeed).toBe(ZONE_KMH);
    expect(approach.lanes).toBe(2);
    expect(zone.lanes).toBe(2);
    expect(zone.zone).toBe("school");
    // The mid node is a plain limit change, NOT an intersection.
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
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

describe(`${ID} through the world runtime — the PER-EDGE speed-limit surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO stop lines and junction trackers at the mid node (limit change, not a junction)", () => {
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
    expect(runtime.debugSignalClusters().length).toBe(0);
  });

  it("resolves 50 on the approach and 30 in the zone (the local limit drops mid-route)", () => {
    expect(runtime.speedLimitAt({ x: X_LANE, y: 80 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: TRANSITION_Y + 100 })).toBe(ZONE_KMH);
  });

  it("a tracked drive sees the limit drop across the transition (edge-local maxSpeedKmh)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let onApproach = -1;
    let inZone = -1;
    for (let y = 20; y < TOTAL_M - 10; y += 4) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(X_LANE, y, 0, 25), y, false);
      if (y < TRANSITION_Y - 10) onApproach = tick.maxSpeedKmh;
      if (y > TRANSITION_Y + 20) inZone = tick.maxSpeedKmh;
    }
    expect(onApproach).toBe(APPROACH_KMH);
    expect(inZone).toBe(ZONE_KMH);
  });
});

describe(`${ID} through the traffic lane graph`, () => {
  it("builds the lane graph across both segments with no crossing bindings", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // Two 1+1 segments → 4 directed lanes.
    expect(graph.lanes.length).toBe(4);
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
  });
});
