/**
 * OV one-way archetype contract battery (Scenario Studio doc 76 §3; the
 * sp-districts.test.ts pattern).
 *
 * content/world/ov-oneway-v1.json is — since the founder R3 redesign (doc 62
 * #47) — a T-JUNCTION micro-map (tools/maps/gen_ov_oneway.mjs): a 200 m
 * two-way approach stem meets a single-lane one-way cross street flowing EAST
 * (±140 m arms, 50 km/h). The battery proves the file satisfies the FULL
 * engine contract, with the archetype's REASON TO EXIST verified end-to-end:
 * the runtime's oneway / wrongWay surface feeds the rule engine's WRONG_WAY
 * grading on the bar (heading WEST = against the flow), the with-flow
 * eastbound drive stays clean, the stem stays two-way, and the approach lane
 * carries the authored М10 right-only arrows (meta.scenario.laneArrows) that
 * make the legal entry readable from the road.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const X_STEM = 4.06; // approach stem, northbound lane center
const BAR_Y = 200; // the one-way bar's polyline (lane center)

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`ov-oneway-v1.json not found (run: node tools/maps/gen_ov_oneway.mjs) in: ${candidates.join(", ")}`);
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

describe("ov-oneway-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 T-junction (two-way stem + one-way bar flowing east)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    const stem = district.roads.edges.find((e) => e.id === "ov-ow-approach")!;
    expect(stem.lanes).toBe(2);
    expect(stem.oneway).toBe(false);
    expect(stem.length).toBe(200);
    for (const id of ["ov-ow-oneway-w", "ov-ow-oneway-e"]) {
      const bar = district.roads.edges.find((e) => e.id === id)!;
      expect(bar.lanes).toBe(1);
      expect(bar.oneway).toBe(true);
      expect(bar.maxspeed).toBe(50);
      expect(bar.length).toBe(140);
      // Flow EAST: geometry x strictly increasing from → to.
      const g = bar.geometry as Array<[number, number]>;
      expect(g[g.length - 1][0]).toBeGreaterThan(g[0][0]);
    }
    expect(district.intersections.length).toBe(1);
    expect(district.intersections[0]).toMatchObject({ id: "ov-ow-n-junction", degree: 3 });
    expect(district.crossings.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "ov-ow-spawn-east",
      "ov-ow-spawn-entry",
    ]);
  });

  it("authors the М10 right-only arrows on the approach lane (the readable legal entry)", () => {
    const sc = district.meta.scenario as {
      laneArrows?: { edgeId?: string; lanes?: Array<{ centerM?: number; arrow?: string }> };
      gates?: Record<string, { x: number; y: number }>;
      onewayFlow?: string;
    };
    expect(sc.onewayFlow).toBe("east");
    expect(sc.laneArrows?.edgeId).toBe("ov-ow-approach");
    expect(sc.laneArrows?.lanes).toEqual([{ centerM: X_STEM, arrow: "right" }]);
    // The gates the ScenarioSpec pins by value (the L7 copy law).
    expect(sc.gates?.mouth).toEqual({ x: X_STEM, y: 170 });
    expect(sc.gates?.legalEntry).toEqual({ x: 60, y: BAR_Y });
    expect(sc.gates?.finish).toEqual({ x: 125, y: BAR_Y });
    // …and the arrows actually PAINT: stripping the authored laneArrows from
    // the meta must remove marking quads (the markings.ts SN-04 pass).
    const stripped = JSON.parse(JSON.stringify(raw)) as { meta: { scenario: Record<string, unknown> } };
    delete stripped.meta.scenario.laneArrows;
    const bare = buildWorldGeometry(assertDistrict(stripped), { seed: 7 });
    expect(world.stats.markingQuads).toBeGreaterThan(bare.stats.markingQuads);
  });

  it("hosts no lights, no stop signs, no zebras (direction choice, not priority)", () => {
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
      path.join(process.cwd(), "content", "world", "ov-oneway-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-oneway-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-oneway-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-oneway-v1 through the world runtime — the oneway/wrongWay surface at the T", () => {
  it("derives NO stop lines and NO signals (all-residential T; the uncontrolled tracker may arm)", () => {
    const runtime = createWorldRuntime(loadRaw());
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
  });

  it("keeps the stem two-way and flags only the against-flow bar heading as wrongWay", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.update(1 / 60);
    const stem = rt.sample(sample(X_STEM, 100, 0, 40), 1, false); // northbound approach
    expect(stem.edgeId).toBe("ov-ow-approach");
    expect(stem.oneway).toBe(false);
    expect(stem.wrongWay).toBe(false);

    const east = createWorldRuntime(loadRaw());
    east.update(1 / 60);
    const withFlow = east.sample(sample(60, BAR_Y, 90, 40), 1, false); // heading east = flow
    expect(withFlow.oneway).toBe(true);
    expect(withFlow.wrongWay).toBe(false);

    const west = createWorldRuntime(loadRaw());
    west.update(1 / 60);
    const against = west.sample(sample(-60, BAR_Y, 270, 40), 1, false); // heading west = against
    expect(against.oneway).toBe(true);
    expect(against.wrongWay).toBe(true);
  });

  it("grades direction through the REAL reducer: west on the bar = WRONG_WAY; east = clean", () => {
    const drive = (headingDeg: number, x0: number, xStep: number): RuleEvent[] => {
      const rt = createWorldRuntime(loadRaw());
      let rules = createRuleEngine();
      const out: RuleEvent[] = [];
      const dt = 0.1;
      let t = 0;
      let x = x0;
      // ~3 s of forward driving at 40 km/h along the bar (past the 1.5 s
      // wrong-way sustain).
      for (let i = 0; i < 30; i++) {
        t += dt;
        x += xStep;
        rt.update(dt);
        const tick = rt.sample(sample(x, BAR_Y, headingDeg, 40), t, false);
        const r = reduceTick(rules, tick);
        rules = r.state;
        out.push(...r.events);
      }
      return out;
    };

    const withFlow = drive(90, 30, (40 / 3.6) * 0.1); // east, x increasing
    expect(withFlow.filter((e) => e.kind === "violation")).toEqual([]);

    const against = drive(270, -30, -(40 / 3.6) * 0.1); // west, x decreasing
    const codes = against.filter((e) => e.kind === "violation").map((e) => e.code);
    expect([...new Set(codes)]).toEqual(["WRONG_WAY"]);
  });
});

describe("ov-oneway-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 2 stem lanes + 1 per one-way arm", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(4);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty junction)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 7,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_STEM, y: 15 },
      anchorRadiusM: 500,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_STEM, 15, 0)).toBe(Infinity);
  });
});
