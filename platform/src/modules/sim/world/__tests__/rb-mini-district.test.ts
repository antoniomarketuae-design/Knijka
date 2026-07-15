/**
 * MINI-ROUNDABOUT archetype contract battery (Scenario Studio doc 76 §3; the
 * lot-perp-district.test.ts pattern).
 *
 * content/world/rb-mini-v1.json is the roundabout-family generated micro-map
 * (tools/maps/gen_mini_roundabout.mjs — single-lane CCW ring R=18 encoded
 * with district-v1's rb-1 conventions: oneway `roundabout: true` ring edges
 * + roundabouts[] registration + uncontrolled degree-3 joints). The battery
 * proves the file satisfies the FULL engine contract:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: Б1 (give way) + Д11
 *                (roundabout) signs at every entry, no stop signs/lights;
 *   2. runtime — the roundabout tracker ARMS from roundabouts[]: a barging
 *                entry against a circulating vehicle grades prioritySituation
 *                "roundabout" violated; a yielding approach earns the
 *                yielded commendation event on departure (circulatingConflict
 *                machinery end-to-end);
 *   3. traffic — the lane graph carries the ring (4 oneway lanes) + arms in
 *                one SCC; a staged loop actor circulates and wraps.
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

const RING_NODES = ["rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"];
const RING_LOOP = [...RING_NODES, "rbm-n-s"];

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "rb-mini-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "rb-mini-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `rb-mini-v1.json not found (run: node tools/maps/gen_mini_roundabout.mjs) in: ${candidates.join(", ")}`,
  );
}

const sample = (
  x: number,
  y: number,
  headingDeg: number,
  speedKmh: number,
): VehicleSample => ({
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

describe("rb-mini-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw();
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (rb-1 ring conventions)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(8);
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts).toHaveLength(1);
    const rb = district.roundabouts[0];
    expect(rb).toMatchObject({ id: "rbm-rb-1", x: 0, y: 0, radius: 18 });
    expect(rb.edgeIds).toHaveLength(4);
    // Every registered ring edge is oneway + roundabout + single-lane and the
    // sequence closes CCW (s → e → n → w → s) — the rb-1 encoding.
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    for (let i = 0; i < seq.length; i++) {
      expect(seq[i].oneway, seq[i].id).toBe(true);
      expect(seq[i].roundabout, seq[i].id).toBe(true);
      expect(seq[i].lanes, seq[i].id).toBe(1);
      expect(seq[i].to).toBe(seq[(i + 1) % seq.length].from);
    }
    expect(seq.map((e) => e.from)).toEqual(RING_NODES);
    // All four arm↔ring joints are unsignalized degree-3 intersections.
    expect(district.intersections.map((i) => i.id).sort()).toEqual([...RING_NODES].sort());
    for (const ix of district.intersections) {
      expect(ix.signalized).toBe(false);
      expect(ix.degree).toBe(3);
    }
  });

  it("signs every entry: give way (Б1) + roundabout (Д11), zero stop signs/lights", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(8);
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
      path.join(process.cwd(), "content", "world", "rb-mini-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "rb-mini-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "rb-mini-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("rb-mini-v1 through the world runtime — circulatingConflict machinery", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives no signals/stop lines; the 4 ring joints stay uncontrolled", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0); // heuristic skips roundabout nodes
    expect(runtime.debugUncontrolledJunctions().map((j) => j.id).sort()).toEqual(
      [...RING_NODES].sort(),
    );
  });

  it("resolves the ring 30 / arm 40 limits", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -18 })).toBe(30); // ring
    expect(runtime.speedLimitAt({ x: 4.06, y: -80 })).toBe(40); // south arm
  });

  it("a barging entry against circulating traffic grades prioritySituation roundabout/violated", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setCirculatingQuery(() => true); // a car is always on the ring band
    const events: Array<{ situation: string; violated: boolean }> = [];
    let t = 0;
    // Constant 22 km/h (6.1 m/s) straight at the south mouth — inward, fast,
    // never braking: the conflict is visible from d ≈ 30 (ring + 12 margin),
    // giving > 0.9 s of sustain before the core.
    for (let y = -60; y <= -10; y += 1) {
      t += 1 / 6.1;
      rt.update(1 / 6.1);
      const tick = rt.sample(sample(4.06, y, 0, 22), t, false);
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") events.push({ situation: e.situation, violated: e.violated });
      }
    }
    const rbEvents = events.filter((e) => e.situation === "roundabout");
    expect(rbEvents.length).toBe(1); // once per approach
    expect(rbEvents[0].violated).toBe(true);
  });

  it("a yielding approach (slows, conflict passes, enters clear) earns the yielded event", () => {
    const rt = createWorldRuntime(loadRaw());
    let circulating = true;
    rt.setCirculatingQuery(() => circulating);
    const events: Array<{ violated: boolean; yielded?: boolean }> = [];
    const push = (tickEvents: { kind: string; situation?: string; violated?: boolean; yielded?: boolean }[]) => {
      for (const e of tickEvents) {
        if (e.kind === "prioritySituation" && e.situation === "roundabout") {
          events.push({ violated: e.violated!, yielded: e.yielded });
        }
      }
    };
    let t = 0;
    const step = (x: number, y: number, h: number, v: number, dt: number) => {
      t += dt;
      rt.update(dt);
      push(rt.sample(sample(x, y, h, v), t, false).events as never);
    };
    // Slow approach to the mouth (the decision zone reaches ring + 12 = 30 m
    // from the center — the yield line sits INSIDE it)…
    for (let y = -45; y <= -28; y += 1) step(4.06, y, 0, 12, 0.3);
    // …hold at the yield line at walking pace while the ring is busy…
    for (let i = 0; i < 12; i++) step(4.06, -27, 0, 2, 0.25);
    // …the circulating car clears…
    circulating = false;
    for (let i = 0; i < 4; i++) step(4.06, -27, 0, 2, 0.25);
    // …enter and transit the east side of the ring (CCW), then leave north.
    const arc = [
      [6, -26, 20], [9, -21, 35], [13, -15, 55], [16.5, -8, 70], [18, 0, 0],
      [16.5, 8, -30], [13, 15, -45], [9, 21, -30], [6, 26, -10], [4.06, 34, 0],
      [4.06, 44, 0], [4.06, 52, 0],
    ] as const;
    for (const [x, y, h] of arc) step(x, y, ((h % 360) + 360) % 360, 15, 0.5);
    expect(events.some((e) => e.violated)).toBe(false);
    const yielded = events.find((e) => e.yielded === true);
    expect(yielded).toBeDefined();
  });
});

describe("rb-mini-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 ring lanes + 8 arm lanes, one SCC", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(12); // 4 oneway ring + 4 × 2 arm directions
    expect(graph.loopLanes.size).toBe(12); // ring + arm U-turns close every walk
    // Ring lanes are speed-capped to 30 (graph convention for roundabout edges).
    for (const lane of graph.lanes) {
      if (raw.roads.edges.find((e) => e.id === lane.edgeId)?.roundabout) {
        expect(lane.maxspeedKmh).toBeLessThanOrEqual(30);
      }
    }
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (empty ring)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 4.06, y: -93 },
      anchorRadiusM: 400,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.stats.pedestrianCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 4.06, y: -93 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.circulatingConflict(0, 0, 4.06, -30, 0, 27)).toBe(false);
  });

  it("a staged loop actor circulates the ring, wraps, and registers as a circulating conflict", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 4.06, y: -93 },
      anchorRadiusM: 400,
    });
    const staged = traffic.stage({
      kind: "vehicle",
      id: "rbm-test-circ",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 6,
      loop: true,
    });
    expect(staged).not.toBeNull();
    traffic.stagedCommand("rbm-test-circ", { type: "cruise" });
    let sawConflict = false;
    let maxS = 0;
    let wrapped = false;
    for (let i = 0; i < 60 * 25; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      const view = traffic.staged("rbm-test-circ")!;
      if (view.s < maxS - 20) wrapped = true; // loop wrap (s resets)
      maxS = Math.max(maxS, view.s);
      // Probe from the south mouth, northbound — the entering driver's frame.
      if (traffic.circulatingConflict(0, 0, 4.06, -30, 0, 27)) sawConflict = true;
    }
    expect(wrapped).toBe(true); // 25 s at 6 m/s > the 113 m circumference
    expect(sawConflict).toBe(true);
    // The actor stays glued to the ring radius the whole time.
    const view = traffic.staged("rbm-test-circ")!;
    expect(Math.abs(Math.hypot(view.x, view.y) - 18)).toBeLessThan(1.5);
  });
});
