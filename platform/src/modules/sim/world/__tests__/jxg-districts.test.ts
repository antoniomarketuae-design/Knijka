/**
 * GIVE-WAY (Б1) two-mouth archetype contract battery (Scenario Studio doc 76 §3;
 * the tj-districts.test.ts pattern) for tools/maps/gen_jx_giveway.mjs →
 * jxg-giveway-v1, the host of sc-jx-giveway-b1 („Б1 не значи спри винаги", the
 * 150th template).
 *
 * The whole topology exists to yield a GRADED Б1 whose VISIBLE sign agrees: a
 * TERTIARY north-south street crossing TWO SECONDARY boulevards, so at each
 * mouth the stop-sign heuristic derives NOTHING (a tertiary minor is rank 3 >
 * MINOR_MAX_RANK 2 — skipped) and the two giveWay STOP_LINE_OVERRIDES entries
 * are the SOLE grading lines. Each line makes its node GUARDED (NOT an
 * uncontrolled right-hand-rule junction), and the world builder paints a
 * VISIBLE Б1 on the same minor approach (props.ts: junction maxRank 4 < 5 →
 * "giveWay"). Both files drive the FULL engine contract: world builder,
 * runtime (control derivation, speed zones, clean ticks) and traffic (lane
 * graph, empty-config legality, staged actor for the scenario director).
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

const ID = "jxg-giveway-v1";

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_jx_giveway.mjs) in: ${candidates.join(", ")}`);
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
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw(ID));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (two-mouth give-way shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    const scenarioMeta = district.meta.scenario as { expectedControl?: string } | undefined;
    expect(scenarioMeta?.expectedControl).toBe("giveWayOnMinor");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(7);
    expect(district.intersections.length).toBe(2);
    for (const j of ["jxg-n-j1", "jxg-n-j2"]) {
      expect(district.intersections.find((it) => it.id === j)).toMatchObject({
        degree: 4,
        signalized: false,
      });
    }
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual(["jxg-spawn-e2", "jxg-spawn-south"]);
  });

  it("covers every edge with a ribbon and patches BOTH junctions", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(7);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(2);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("paints a VISIBLE Б1 on each minor approach (grading never references invisible control)", () => {
    // The sign heuristic (props.ts) paints "giveWay" (maxRank 4 < 5) on every
    // tertiary approach into each mouth — 2 approaches × 2 junctions = 4. That
    // is the visible Б1 the player's give-way grading rides.
    expect(world.stats.signs.giveWay).toBe(4);
    // The hand-placed-override sign loop in props.ts now branches on ov.control,
    // so a Б1 give-way override no longer paints a phantom Б2 „Стоп" over the
    // line — grading reads the runtime giveWay lines (control "giveWay",
    // asserted below), and the VISIBLE sign is a Б1 that agrees with them. A Б2
    // here would teach the opposite of the rule this lesson grades.
    expect(world.stats.signs.stop).toBe(0);
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

  it("stays inside the performance budget (micro-map)", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
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

describe(`${ID} through the world runtime`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives EXACTLY the two Б1 give-way lines — override only, and BOTH nodes stay guarded", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(2);
    const byNode = new Map(lines.map((l) => [l.junctionNodeId, l]));

    const m1 = byNode.get("jxg-n-j1")!;
    expect(m1).toBeDefined();
    expect(m1.control).toBe("giveWay");
    expect(m1.id).toBe("jxg-e-s@102.3:giveWay");
    // 130 m stem, secondary-mouth cut 27.725 m short of the node → sM 102.275,
    // crossing northbound (the player's approach into mouth 1).
    expect(m1.sM).toBeCloseTo(102.275, 3);
    expect(m1.dirSign).toBe(1);
    expect(m1.approachBearingDeg).toBeCloseTo(0, 5);

    const m2 = byNode.get("jxg-n-j2")!;
    expect(m2).toBeDefined();
    expect(m2.control).toBe("giveWay");
    expect(m2.id).toBe("jxg-e-m@122.3:giveWay");
    // 150 m mid arm, same 27.725 m cut → sM 122.275, crossing northbound.
    expect(m2.sM).toBeCloseTo(122.275, 3);
    expect(m2.dirSign).toBe(1);
    expect(m2.approachBearingDeg).toBeCloseTo(0, 5);

    // The load-bearing fact: a give-way line makes its node GUARDED, so the
    // right-hand-rule tracker never arms and never double-grades the encounter.
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
  });

  it("resolves the tagged speed limits per road (tertiary 40 / secondary 50)", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -60 })).toBe(40); // stem (tertiary)
    expect(runtime.speedLimitAt({ x: 0, y: 75 })).toBe(40); // mid arm (tertiary)
    expect(runtime.speedLimitAt({ x: 60, y: 0 })).toBe(50); // boulevard (secondary)
    expect(runtime.speedLimitAt({ x: 60, y: 150 })).toBe(50); // boulevard (secondary)
  });

  it("locates every spawn point on its authored edge", () => {
    expect(runtime.locate({ x: 0, y: -115 }).edgeId).toBe("jxg-e-s");
    expect(runtime.locate({ x: 105, y: 150 }).edgeId).toBe("jxg-e-e2");
  });

  it("the two give-way overrides key THIS map's edges; the shipped Б2 override stays skip-safe", () => {
    const raw = loadRaw(ID) as { roads: { edges: Array<{ id: string }> } };
    const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
    const giveWay = STOP_LINE_OVERRIDES.filter((o) => o.control === "giveWay");
    expect(giveWay.map((o) => `${o.nodeId}:${o.edgeId}`).sort()).toEqual([
      "jxg-n-j1:jxg-e-s",
      "jxg-n-j2:jxg-e-m",
    ]);
    for (const ov of giveWay) expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(true);
    // The pre-existing Б2 override (n331942490) belongs to a different map — it
    // must not touch any jxg edge (the idempotent-override law, doc 74 §5.6).
    for (const ov of STOP_LINE_OVERRIDES.filter((o) => (o.control ?? "stopSign") === "stopSign")) {
      expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
    }
  });

  it("samples a clean northbound run up the stem short of mouth 1 (no phantom events)", () => {
    runtime.update(1 / 60);
    let t = 0;
    // Stop at y = −40: before the mouth-1 Б1 line (−27.725).
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

  it("crossing mouth 1 emits stopLineCrossed(giveWay) once — and NOTHING on the full-stop axis", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    let crossings = 0;
    let t = 0;
    // Roll northbound through the mouth-1 line (y = −27.725) WITHOUT stopping —
    // a clear Б1 mouth: the only event is the give-way crossing itself.
    for (let y = -50; y <= -5; y += 1.5) {
      t += 0.12;
      const tick = rt.sample(sample(4.0625, y, 0, 18), t, false);
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed") {
          expect(e.control).toBe("giveWay");
          crossings++;
        }
        // No conflict staged here → no give-way priority situation.
        expect(e.kind).not.toBe("prioritySituation");
      }
    }
    expect(crossings).toBe(1);
  });

  it("the next-stop-line context reports the Б1 ahead (control giveWay, no lamp state)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    const tick = rt.sample(sample(4.0625, -60, 0, 20), 0.5, false);
    expect(tick.nextStopLineControl).toBe("giveWay");
    expect(tick.nextStopLineM).toBeCloseTo(60 - 27.725, 0);
    expect(tick.nextStopLineState).toBeUndefined();
  });

  it("a staged car on the priority boulevard makes crossing mouth 2 a FAILED_TO_YIELD (give-way)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const traffic = createTrafficSystem(loadRaw(ID) as TrafficDistrict, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
    });
    rt.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
    const staged = traffic.stage({
      kind: "vehicle",
      id: "jxg-probe-car",
      pathNodes: ["jxg-n-e2", "jxg-n-j2", "jxg-n-w2"],
      hold: { nodeIndex: 1, offsetM: -12 },
      cruiseSpeedMps: 8,
    });
    expect(staged).not.toBeNull();
    traffic.stagedCommand("jxg-probe-car", { type: "cruise" });
    // Player rolls north through the mouth-2 line (y = 122.275) while the car
    // crosses jxg-n-j2 from the right — the give-way check must convict once.
    let t = 0;
    let y = 108;
    const situations: string[] = [];
    for (let i = 0; i < 60 * 8; i++) {
      const dt = 1 / 60;
      t += dt;
      y += (16 / 3.6) * dt;
      rt.update(dt);
      traffic.update(dt, {
        signalPhase: () => "green",
        playerPos: { x: 4.0625, y },
        playerSpeedKmh: 16,
        playerHeadingDeg: 0,
      });
      const tick = rt.sample(sample(4.0625, y, 0, 16), t, false);
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") situations.push(`${e.situation}:${String(e.violated)}`);
      }
      if (y > 150) break;
    }
    expect(situations).toContain("give-way:true");
  });
});

describe(`${ID} through the traffic lane graph + system`, () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw(ID) as TrafficDistrict;
  });

  it("builds the lane graph: 7 two-way edges → 14 directed lanes, loopable", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(14);
    expect(graph.crossingLanes.size).toBe(0);
    expect(graph.junctionRadiusM.get("jxg-n-j1")).toBeGreaterThan(0);
    expect(graph.junctionRadiusM.get("jxg-n-j2")).toBeGreaterThan(0);
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
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: -105 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.conflictNear(0, 150, 26, 0)).toBe(false);
  });

  it("stages the JU-02 conflict path (east → mouth 2 → west) and it advances", () => {
    const traffic = createTrafficSystem(raw, { seed: 3, vehicleCount: 0, pedestrianCount: 0 });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "jxg-test-car",
      pathNodes: ["jxg-n-e2", "jxg-n-j2", "jxg-n-w2"],
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 8,
    });
    expect(staged).not.toBeNull();
    expect(staged!.nodeS.length).toBe(3);
    traffic.stagedCommand("jxg-test-car", { type: "cruise" });
    for (let i = 0; i < 300; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    expect(traffic.staged("jxg-test-car")!.s).toBeGreaterThan(20);
  });
});
