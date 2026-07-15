/**
 * PK precision-stop archetype contract battery (Scenario Studio doc 76 §3; the
 * fo-districts.test.ts pattern).
 *
 * content/world/pk-stop-v1.json is the precision-stop micro-map
 * (tools/maps/gen_pk_smoothstop.mjs — one plain straight 1+1 street, 200 m,
 * 50 km/h; the van the driver stops short of is a recorder obstacle rect, not a
 * map prop). The battery proves the file satisfies the FULL engine contract and
 * pins the right-lane center the template denormalizes.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** Right-lane center denormalized into templates-pk.ts as LANE_X. */
const LANE_X = 4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "pk-stop-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "pk-stop-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `pk-stop-v1.json not found (run: node tools/maps/gen_pk_smoothstop.mjs) in: ${candidates.join(", ")}`,
  );
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

describe("pk-stop-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (plain straight street)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(50);
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "pk-spawn-approach",
      "pk-spawn-finish",
    ]);
    expect((district.meta.scenario as { laneCenterRightM: number }).laneCenterRightM).toBe(LANE_X);
  });

  it("hosts a plain street: no lights, no stop signs, no zebras", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("produces no NaN/infinite coordinates in the road buffers", () => {
    let nonFinite = 0;
    for (const mesh of [world.roadSurface, world.markings]) {
      for (let i = 0; i < mesh.positions.length; i++) {
        if (!Number.isFinite(mesh.positions[i])) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });
});

describe("pk-stop-v1 through the runtime + rule engine", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("resolves the 50 km/h limit along the lane and grades nothing on a calm cruise", () => {
    let rules = createRuleEngine();
    const events: RuleEvent[] = [];
    for (let i = 0; i < 40; i++) {
      const tick = runtime.sample(sample(LANE_X, 20 + i * 2, 0, 30), i * 0.2, false, false, undefined);
      expect(tick.maxSpeedKmh).toBe(50);
      const reduced = reduceTick(rules, tick);
      rules = reduced.state;
      events.push(...reduced.events);
    }
    expect(events.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

describe("pk-stop-v1 lane graph", () => {
  it("builds the northbound lane the driver approaches in", () => {
    const district = assertDistrict(loadRaw()) as unknown as TrafficDistrict;
    const graph = buildLaneGraph(district, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    const out = graph.nodeOut.get("pk-n-start");
    expect(out).toBeTruthy();
    expect([...(out ?? [])].some((li) => graph.lanes[li].toNode === "pk-n-end")).toBe(true);
  });
});
