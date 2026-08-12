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
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
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

/**
 * The WEST-EXIT battery — the invariants sc-rb-exit-signal (templates-
 * roundabout.ts, „Изход от кръгово с десен мигач“) pins BY VALUE. That drill
 * reuses this district and rides the ring from the south mouth to the THIRD
 * exit, so it depends on geometry the entry template never touches: that west
 * really is the third spoke CCW from south, that its outbound lane sits at
 * y = +4.06, and that the drill's authored exit blend lands on the arm's
 * carriageway beyond the objective's exit radius.
 */
describe("rb-mini-v1 — the west (third) exit sc-rb-exit-signal rides", () => {
  /** Ring point at circulation angle φ (deg from the SOUTH node, CCW through
   *  EAST) — the same helper traces/scRbExitSignal.ts authors its path with. */
  const ring = (phiDeg: number): [number, number] => {
    const a = (phiDeg * Math.PI) / 180;
    return [18 * Math.sin(a), -18 * Math.cos(a)];
  };

  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
  });

  it("west IS the third spoke counter-clockwise from the south entry", () => {
    // The drill enters at rbm-n-s and counts mouths: east (1st), north (2nd),
    // west (3rd). That order is the ring edge sequence, not an assumption.
    const rb = district.roundabouts[0];
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    const fromSouth = seq.findIndex((e) => e.from === "rbm-n-s");
    expect(fromSouth).toBeGreaterThanOrEqual(0);
    const order = [0, 1, 2].map((i) => seq[(fromSouth + i) % seq.length].to);
    expect(order).toEqual(["rbm-n-e", "rbm-n-n", "rbm-n-w"]);
  });

  it("the west arm exists and runs out to x = −108 on the y = 0 centerline", () => {
    const node = district.roads.nodes.find((n) => n.id === "rbm-n-w")!;
    expect(node).toMatchObject({ x: -18, y: 0 });
    const out = district.roads.nodes.find((n) => n.id === "rbm-n-w-out")!;
    expect(out).toMatchObject({ x: -108, y: 0 });
    const arm = district.roads.edges.find((e) => e.id === "rbm-e-arm-w")!;
    expect(arm).toMatchObject({ from: "rbm-n-w-out", to: "rbm-n-w", lanes: 2, oneway: false });
  });

  it("the drill's authored exit path rides the ring, then the west arm's OUTBOUND lane", () => {
    const laneCenter = 4.06; // meta.scenario.laneCenterRightM
    // The peel-off point (φ = 240°) is still on the ring centerline…
    const peel = ring(240);
    expect(Math.abs(Math.hypot(peel[0], peel[1]) - 18)).toBeLessThan(1e-6);
    expect(peel[0]).toBeLessThan(0); // west half
    // …and the blend settles on y = +4.06: driving WEST, north is the driver's
    // right, so the outbound lane centre is +laneCenter — the mirror of the
    // south arm's northbound x = +4.06 spawn (rbm-spawn-south).
    const spawn = district.spawnPoints.find((s) => s.id === "rbm-spawn-south")!;
    expect(spawn.x).toBeCloseTo(laneCenter, 6);
    for (const [x, y] of [
      [-30, laneCenter],
      [-40, laneCenter],
      [-52, laneCenter],
    ] as const) {
      // On the arm's carriageway: inside the drawn half-width (8.125 m) of the
      // y = 0 centerline, and between the ring and the arm's outer end.
      expect(Math.abs(y)).toBeLessThan(8.125);
      expect(x).toBeGreaterThan(-108);
      expect(x).toBeLessThan(-18);
    }
  });

  it("the drill's objective radii bracket the ring: reachZone on the ring, exit clear of it", () => {
    // success[0] „подмини първите два изхода“ — reachZone (0, 18) r = 6: the
    // north node, ON the ring centerline, one radius from the centre.
    const north = district.roads.nodes.find((n) => n.id === "rbm-n-n")!;
    expect(north).toMatchObject({ x: 0, y: 18 });
    expect(Math.hypot(north.x, north.y)).toBeCloseTo(18, 6);
    // success[1] roundabout maneuver — enterRadiusM 21 admits the whole ring
    // band, exitRadiusM 34 sits beyond it, and the drill's last authored point
    // (−52, 4.06) clears it with margin (so the traversal always resolves).
    expect(21).toBeGreaterThan(18);
    expect(Math.hypot(-52, 4.06)).toBeGreaterThan(34);
    // …while the ring itself never reaches the exit radius: circulating can
    // never accidentally complete the maneuver.
    for (let phi = 0; phi < 360; phi += 15) {
      const [x, y] = ring(phi);
      expect(Math.hypot(x, y)).toBeLessThan(34);
    }
  });

  it("the west arm resolves the 40 km/h arm limit (the drill never speeds at ring pace)", () => {
    const rt = createWorldRuntime(loadRaw());
    expect(rt.speedLimitAt({ x: -52, y: 4.06 })).toBe(40);
    expect(rt.speedLimitAt({ x: -18, y: 0 })).toBe(30); // ring
  });
});

/**
 * The CIRCULATE-PRIORITY battery — the invariants sc-rb-circulate-priority
 * (templates-roundabout.ts, „В кръга си с предимство“) pins BY VALUE. That
 * drill reuses this district, rides the ring from the south mouth to the SECOND
 * (north) exit, and parks a staged car at the WEST mouth for the whole run. It
 * therefore depends on three things no other rb-mini battery covers:
 *
 *  1. north really is the second spoke CCW from south, and its OUTBOUND lane is
 *     x = +4.06 (the lane rbm-spawn-finish already sits in);
 *  2. the west arm is long enough to hold the waiting car 12 m short of its ring
 *     node — inside the PriorityFromRightRunner's 28 m „staged and waiting" hold
 *     window, so the runner freezes it there instead of syncing it forward;
 *  3. the authored drive never comes within the runner's 22 m commit radius of
 *     that west mouth. THIS IS THE WHOLE LESSON'S PREMISE: inside 22 m the
 *     runner drives its car through the mouth (it is built for the opposite
 *     drill), which would invert „the waiting car yields to you" into a conflict.
 *
 * It also pins the geometric fact that forces the drill's panic-brake demo onto
 * the approach arm rather than into the ring (see the trace script's header).
 */
describe("rb-mini-v1 — the ring sc-rb-circulate-priority circulates", () => {
  /** Ring point at circulation angle φ (deg from the SOUTH node, CCW through
   *  EAST) — the same helper traces/scRbCirculatePriority.ts authors its path
   *  with. */
  const ring = (phiDeg: number, radius = 18): [number, number] => {
    const a = (phiDeg * Math.PI) / 180;
    return [radius * Math.sin(a), -radius * Math.cos(a)];
  };
  /** PriorityFromRightRunner constants the placement is solved against
   *  (orchestrator/runners.ts — mirrored here BY VALUE, asserted by behaviour in
   *  the trace gate's "the staged waiter never moves" battery). */
  const PRIORITY_COMMIT_PLAYER_M = 22;
  const PRIORITY_COMMIT_CAR_M = 25;

  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
  });

  it("north IS the second spoke counter-clockwise from the south entry", () => {
    const rb = district.roundabouts[0];
    const byId = new Map(district.roads.edges.map((e) => [e.id, e]));
    const seq = rb.edgeIds.map((id) => byId.get(id)!);
    const fromSouth = seq.findIndex((e) => e.from === "rbm-n-s");
    expect(fromSouth).toBeGreaterThanOrEqual(0);
    // east (1st), north (2nd) — the drill passes the first and takes the second.
    expect(seq[fromSouth % seq.length].to).toBe("rbm-n-e");
    expect(seq[(fromSouth + 1) % seq.length].to).toBe("rbm-n-n");
  });

  it("the drill's authored exit path rides the ring, then the north arm's OUTBOUND lane", () => {
    const laneCenter = 4.06; // meta.scenario.laneCenterRightM
    // The peel-off point (φ = 150°) is still on the ring centerline…
    const peel = ring(150);
    expect(Math.abs(Math.hypot(peel[0], peel[1]) - 18)).toBeLessThan(1e-6);
    expect(peel[1]).toBeGreaterThan(0); // north half
    // …and the blend settles on x = +4.06: driving NORTH, east is the driver's
    // right, so the outbound lane centre is +laneCenter — the SAME lane the
    // district's own finish checkpoint sits in. That is the pin: the drill does
    // not assert a lane, it lands in the one the generator published.
    const finish = district.spawnPoints.find((s) => s.id === "rbm-spawn-finish")!;
    expect(finish.x).toBeCloseTo(laneCenter, 6);
    expect(finish.y).toBeGreaterThan(18); // out on the north arm
    expect(finish.heading).toBe(0); // northbound — the drill's exit heading
    for (const [x, y] of [
      [laneCenter, 26],
      [laneCenter, 40],
      [laneCenter, 58],
    ] as const) {
      // On the arm's carriageway: inside the drawn half-width (8.125 m) of the
      // x = 0 centerline, and between the ring and the arm's outer end.
      expect(Math.abs(x)).toBeLessThan(8.125);
      expect(y).toBeGreaterThan(18);
      expect(y).toBeLessThan(108);
    }
    // The last authored point clears the objective's exitRadiusM 34, so the
    // roundabout traversal always resolves.
    expect(Math.hypot(laneCenter, 58)).toBeGreaterThan(34);
  });

  it("the west arm holds the waiting car 12 m short of its mouth (inside the runner's hold window)", () => {
    const arm = district.roads.edges.find((e) => e.id === "rbm-e-arm-w")!;
    // The waiter's path is rbm-n-w-out → rbm-n-w → …, held at offsetM 78 from
    // node 0. The arm must be 90 m for that to park it 12 m short of the ring.
    expect(arm.length).toBeCloseTo(90, 6);
    expect(arm.from).toBe("rbm-n-w-out");
    expect(arm.to).toBe("rbm-n-w");
    const holdOffsetM = 78;
    const carDistToNodeM = arm.length - holdOffsetM;
    expect(carDistToNodeM).toBeCloseTo(12, 6);
    // Inside PRIORITY_COMMIT_CAR_M + 3 ⇒ the runner commands `cruise 0` on its
    // first armed tick and the car never rolls forward.
    expect(carDistToNodeM).toBeLessThanOrEqual(PRIORITY_COMMIT_CAR_M + 3);
  });

  it("the authored drive NEVER enters the runner's 22 m commit radius of the west mouth", () => {
    // The lesson's premise, as geometry. Every authored waypoint of the drill —
    // approach, entry chord, ring, exit — measured against rbm-n-w.
    const west = district.roads.nodes.find((n) => n.id === "rbm-n-w")!;
    expect(west).toMatchObject({ x: -18, y: 0 });
    const path: Array<[number, number]> = [
      // south arm approach + entry chord (traces/scRbCirculatePriority.ts)
      [4.06, -93], [4.06, -60], [4.06, -40], [4.06, -27.5],
      [6.0, -23.0], [8.5, -18.5], [11.0, -15.0],
      // the ring stretch the drill rides, φ 48 → 150, sampled fine
      ...Array.from({ length: 35 }, (_, i) => ring(48 + i * 3)),
      // the north peel + outbound lane
      [7.5, 19.0], [5.5, 22.0], [4.06, 26.0], [4.06, 40.0], [4.06, 58.0],
    ];
    let min = Infinity;
    for (const [x, y] of path) {
      min = Math.min(min, Math.hypot(x - west.x, y - west.y));
    }
    expect(min).toBeGreaterThan(PRIORITY_COMMIT_PLAYER_M);
    // …with real margin, not a rounding win: the closest approach is the φ = 150
    // exit peel at ≈ 31 m. If a future edit drags this under ~22, the waiting
    // car starts driving into the ring and the template teaches the opposite.
    expect(min).toBeGreaterThan(28);
  });

  it("EVERY ring point sits inside 35 m of a mouth — why the panic-brake demo lives on the arm", () => {
    // HARSH_BRAKING_NO_CAUSE clears its cause ledger only when the nearest
    // intersection is further than harshBrakeJunctionClearM = 35 m (rules/
    // types.ts). On this ring the mouths are 25.5 m apart, so no point of it is
    // ever more than ~13.8 m from one: the detector's junction-proximity armor
    // is permanently ON inside the ring and a causeless stop there CANNOT grade.
    // The drill's demo therefore brakes out on the south arm — and this is the
    // measurement that says why.
    const nodes = district.intersections;
    let worst = 0;
    for (let phi = 0; phi < 360; phi += 2) {
      const [x, y] = ring(phi);
      const nearest = Math.min(...nodes.map((n) => Math.hypot(n.x - x, n.y - y)));
      worst = Math.max(worst, nearest);
    }
    expect(worst).toBeLessThan(35); // measured ≈ 13.8
    // …whereas the demo's authored brake point IS clear of the armor.
    const south = district.roads.nodes.find((n) => n.id === "rbm-n-s")!;
    for (const y of [-68, -60]) {
      expect(Math.hypot(4.06 - south.x, y - south.y)).toBeGreaterThan(35);
    }
  });

  it("the north arm resolves the 40 km/h arm limit (the drill never speeds at ring pace)", () => {
    const rt = createWorldRuntime(loadRaw());
    expect(rt.speedLimitAt({ x: 4.06, y: 58 })).toBe(40);
    expect(rt.speedLimitAt({ x: 0, y: 18 })).toBe(30); // ring
  });
});

/**
 * The PLATOON battery — the invariants sc-rb-busy-gap (templates-roundabout.ts,
 * „Пролука в натоварено кръгово“) pins BY VALUE. That drill reuses this district
 * and is the only ring template whose content is the RELATIVE PHASE of two staged
 * cars, so it leans on facts the other two never touch: that the lap is 112.79 m
 * (every `hold` station below is arithmetic on it), that a staged circulator's
 * angular rate is 9.27 °/s (which is what makes 12 km/h a rear-end and 9.5 km/h
 * station-keeping), and that the drill's yield-line gate sits on the south arm
 * inside the roundabout tracker's reach.
 */
describe("rb-mini-v1 — the platoon sc-rb-busy-gap reads", () => {
  /** The authored hold stations (templates-roundabout.ts RB_GAP_LEAD/FOLLOWER). */
  const LEAD_HOLD = 0; // on ["rbm-n-w", ...] ⇒ the west node, φ = 270°
  const FOLLOWER_HOLD = 20.04; // on ["rbm-n-n", ...] ⇒ φ = 244°
  const phi = (x: number, y: number) => (((Math.atan2(x, -y) * 180) / Math.PI) + 360) % 360;

  let raw: TrafficDistrict;
  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("the ring lap is 112.79 m — the constant every platoon phase is computed from", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const view = traffic.stage({
      kind: "vehicle",
      id: "rbm-platoon-probe",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 2.9,
      loop: true,
    })!;
    expect(view).not.toBeNull();
    // A quarter per arc, four arcs — the template's node arithmetic (28.2 / 56.4
    // / 84.6) is only valid because the ring is metrically even.
    expect(view.pathLengthM).toBeCloseTo(112.79, 1);
    for (let i = 0; i < 4; i++) expect(view.nodeS[i]).toBeCloseTo((112.79 / 4) * i, 1);
  });

  it("the authored hold stations place the platoon at φ = 270° / 244° — a rigid 26°", () => {
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    const lead = traffic.stage({
      kind: "vehicle",
      id: "rbm-lead-probe",
      pathNodes: ["rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n", "rbm-n-w"],
      hold: { nodeIndex: 0, offsetM: LEAD_HOLD },
      cruiseSpeedMps: 2.9,
      loop: true,
    })!;
    const foll = traffic.stage({
      kind: "vehicle",
      id: "rbm-foll-probe",
      pathNodes: ["rbm-n-n", "rbm-n-w", "rbm-n-s", "rbm-n-e", "rbm-n-n"],
      hold: { nodeIndex: 0, offsetM: FOLLOWER_HOLD },
      cruiseSpeedMps: 2.9,
      loop: true,
    })!;
    expect(phi(lead.x, lead.y)).toBeCloseTo(270, 0);
    expect(phi(foll.x, foll.y)).toBeCloseTo(244, 0);
    // The offset IS the lesson: the short gap the drill teaches you to refuse.
    const gap = (((phi(lead.x, lead.y) - phi(foll.x, foll.y)) % 360) + 360) % 360;
    expect(gap).toBeGreaterThan(25);
    expect(gap).toBeLessThan(27);
  });

  it("a 2.9 m/s circulator rides r ≈ 17.9 at 9.27 °/s — why the ring pace is 9.5, not 12", () => {
    // The drill sits ~2.5 s behind the follower, so the driver's angular rate
    // must not exceed the platoon's. From r = 18 the driver's rate is
    // 57.3·v/18 deg/s: 12 km/h ⇒ 10.61 (reels the follower in — measured
    // COLLISION), 9.5 km/h ⇒ 8.40 (the gap opens gently). This is the
    // measurement that picks the number.
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({
      kind: "vehicle",
      id: "rbm-rate-probe",
      pathNodes: RING_LOOP,
      hold: { nodeIndex: 0, offsetM: 0 },
      cruiseSpeedMps: 2.9,
      loop: true,
    });
    traffic.stagedCommand("rbm-rate-probe", { type: "cruise" });
    for (let i = 0; i < 60 * 2; i++) traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    const a = traffic.staged("rbm-rate-probe")!;
    const phi0 = phi(a.x, a.y);
    for (let i = 0; i < 60 * 5; i++) traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    const b = traffic.staged("rbm-rate-probe")!;
    const rate = ((((phi(b.x, b.y) - phi0) % 360) + 360) % 360) / 5;
    expect(rate).toBeCloseTo(9.27, 1);
    expect(Math.hypot(b.x, b.y)).toBeCloseTo(17.9, 0);
    // The driver's own rates, stated so the comparison is in the battery too.
    expect((9.5 / 3.6 / 18) * (180 / Math.PI)).toBeLessThan(rate); // 8.40 — trails
    expect((12 / 3.6 / 18) * (180 / Math.PI)).toBeGreaterThan(rate); // 10.61 — closes
  });

  it("the yield-line gate sits on the south arm's northbound lane, inside the tracker's reach", () => {
    // success[0] is reachZone (4.06, −26) r = 3, maxSpeedKmh 6. It must be on
    // the carriageway (so a lawful approach passes through it) AND inside the
    // roundabout tracker's 30 m decision zone (so the wait it certifies is the
    // wait the tracker is watching).
    const rt = createWorldRuntime(loadRaw());
    expect(rt.speedLimitAt({ x: 4.06, y: -26 })).toBe(40); // the arm, not the ring
    expect(Math.hypot(4.06, -26)).toBeLessThan(18 + 12); // ROUNDABOUT_ENTRY_MARGIN_M
    // …and the shadow's rest pose (4.06, −27.5) is inside the gate's 3 m radius.
    expect(Math.hypot(4.06 - 4.06, -27.5 + 26)).toBeLessThan(3);
    // The south arm really runs out to y = −108 on the x = 0 centerline, so the
    // 4.06 lane offset is the RIGHT-hand lane of a northbound approach.
    const out = (loadRaw() as TrafficDistrict).roads.nodes.find((n) => n.id === "rbm-n-s-out")!;
    expect(out.x).toBe(0);
    expect(out.y).toBe(-108);
  });
});
