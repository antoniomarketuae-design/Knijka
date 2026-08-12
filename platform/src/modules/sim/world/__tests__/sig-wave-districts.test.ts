/**
 * SIGNAL-WAVE archetype contract battery (Scenario Studio doc 76 §3; the
 * sx-district battery pattern) — content/world/sig-wave-v1.json, the committed
 * three-signal avenue of tools/maps/gen_sig_wave.mjs and the host of
 * sc-sig-green-wave.
 *
 * Everything the sx battery asserts about ONE `signalized: true` flag holds
 * here three times over. What is NEW — and what this file exists to nail down —
 * is that the GREEN WAVE IS A PROPERTY OF THE MAP:
 *
 *   the runtime derives each single-node cluster's phase offset as
 *   fnv1a(nodeId) % 50, so the signal node IDS decide the offsets (36/17/48);
 *   19 s apart, and 19 s at 50 km/h is the authored 264 m block.
 *
 * Nothing pins those offsets at runtime (the template authors no signalPlan and
 * the traces pass no signalOffsets), so if a rename, a spacing tweak or a change
 * to SIGNAL_TIMING/fnv1a ever moved them, the lesson would silently degrade into
 * three unrelated lights and its shadow would still "look fine". These tests are
 * the tripwire — they assert the wave END-TO-END by sweeping a virtual 50 km/h
 * rider through the real runtime and demanding green at all three lines.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { SIGNAL_TIMING } from "../../runtime/signals";
import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "sig-wave-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "sig-wave-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `sig-wave-v1.json not found (run: node tools/maps/gen_sig_wave.mjs) in: ${candidates.join(", ")}`,
  );
}

/** Northbound right-lane center of the avenue, m. */
const LANE = 4.0625;
/** Signal nodes, south → north. */
const SIGNALS = ["sw-n-tl1", "sw-n-tl2", "sw-n-tl3"] as const;
/** Their northbound stop lines (27.725 m before each node — the mouth cut). */
const LINES = [-27.725, 236.275, 500.275] as const;

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

describe("sig-wave-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document (three-signal avenue shape)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    // 3 signals × (node + 2 cross ends) + the two avenue ends.
    expect(district.roads.nodes.length).toBe(11);
    // 4 avenue segments + 3 × 2 cross arms.
    expect(district.roads.edges.length).toBe(10);
    expect(district.intersections.length).toBe(3);
    for (let i = 0; i < SIGNALS.length; i++) {
      expect(district.intersections[i]).toMatchObject({
        id: SIGNALS[i],
        x: 0,
        y: i * 264,
        degree: 4,
        signalized: true,
      });
    }
    // No zebra by design — a crossing would join a cluster and add pedestrian
    // grading noise to a pure signal-timing drill.
    expect(district.crossings.length).toBe(0);
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "sw-spawn-cross2-west",
      "sw-spawn-south",
    ]);
  });

  it("publishes the wave payload the template and the traces are authored against", () => {
    const sc = district.meta.scenario as unknown as {
      archetype: string;
      junctionNodeIds: string[];
      expectedClusterGroup: string;
      wave: { speedKmh: number; blockTravelSec: number; naturalOffsetsSec: number[] };
    };
    expect(sc.archetype).toBe("signal-wave");
    expect(sc.junctionNodeIds).toEqual([...SIGNALS]);
    expect(sc.expectedClusterGroup).toBe("ns");
    expect(sc.wave.speedKmh).toBe(50);
    expect(sc.wave.naturalOffsetsSec).toEqual([36, 17, 48]);
    // 264 m at 13.889 m/s. Consecutive offsets are 19 s apart, so a rider at
    // the wave speed re-meets the identical cycle-local phase at every lamp.
    expect(sc.wave.blockTravelSec).toBeCloseTo(19.01, 2);
    for (let i = 0; i < 2; i++) {
      const gap =
        ((sc.wave.naturalOffsetsSec[i] - sc.wave.naturalOffsetsSec[i + 1]) % SIGNAL_TIMING.cycleSec +
          SIGNAL_TIMING.cycleSec) %
        SIGNAL_TIMING.cycleSec;
      expect(Math.abs(sc.wave.blockTravelSec - gap)).toBeLessThan(0.25);
    }
  });

  it("covers every edge with a ribbon and patches all three junctions", () => {
    expect(world.stats.ribbons + world.stats.skippedRibbons).toBe(10);
    expect(world.stats.skippedRibbons).toBe(0);
    expect(world.stats.junctionPatches).toBeGreaterThanOrEqual(3);
  });

  it("hosts three signalized junctions: near + far-side lamp heads per approach, no signs, no zebras", () => {
    // 3 junctions × 4 incoming approaches × (near head + far-side companion,
    // doc 62 S1/#19 — the head a driver waiting at the line actually sees).
    expect(world.trafficLights.length).toBe(24);
    expect(new Set(world.trafficLights.map((t) => t.nodeId))).toEqual(new Set(SIGNALS));
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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
    for (const list of [world.trafficLights, world.signs, world.streetlights, world.trees, world.busStops]) {
      for (const t of list) {
        if (!t.position.every(Number.isFinite) || !Number.isFinite(t.yaw)) nonFinite++;
      }
    }
    expect(nonFinite).toBe(0);
  });

  it("stays inside the performance budget (micro-map, ~1.5 km of road)", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(300);
    expect(world.stats.triangles).toBeLessThan(600_000);
  });

  it("is deterministic for a fixed seed", () => {
    const again = buildWorldGeometry(district, { seed: 7 });
    expect(again.stats).toEqual(world.stats);
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
  });
});

describe("sig-wave-v1 through the world runtime — THREE clusters, one wave", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw());
  });

  it("derives THREE separate single-node clusters (264 m >> the 40 m link radius)", () => {
    const clusters = runtime.debugSignalClusters();
    expect(clusters.length).toBe(3);
    expect(clusters.map((c) => c.id)).toEqual([...SIGNALS]);
    for (const c of clusters) expect(c.memberNodeIds.length).toBe(1);
  });

  it("THE WAVE: the natural fnv1a offsets are 36 / 17 / 48 — exactly 19 s apart", () => {
    // The whole template rests on these three numbers: nothing pins them at
    // runtime, so this is the load-bearing assertion of the district.
    const offsets = runtime.debugSignalClusters().map((c) => c.offsetSec);
    expect(offsets).toEqual([36, 17, 48]);
    const cycle = SIGNAL_TIMING.cycleSec;
    expect(((offsets[0] - offsets[1]) % cycle + cycle) % cycle).toBe(19);
    expect(((offsets[1] - offsets[2]) % cycle + cycle) % cycle).toBe(19);
  });

  it("derives TWELVE trafficLight stop lines — four per junction, all at the mouths", () => {
    const lines = runtime.debugStopLines();
    expect(lines.length).toBe(12);
    expect(new Set(lines.map((l) => l.control))).toEqual(new Set(["trafficLight"]));
    const byId = new Map(lines.map((l) => [l.id, l]));
    // Secondary half-width 12.125 + arterial corner 15 + paint inset 0.6 →
    // 27.725 m from every node (shared nodeOpenRadiusM math, as on sx-v1).
    // The three NORTHBOUND lines the player actually meets:
    expect(byId.get("sw-e-a0@276.3:trafficLight")).toMatchObject({ group: "ns", dirSign: 1, junctionNodeId: "sw-n-tl1" });
    expect(byId.get("sw-e-a1@236.3:trafficLight")).toMatchObject({ group: "ns", dirSign: 1, junctionNodeId: "sw-n-tl2" });
    expect(byId.get("sw-e-a2@236.3:trafficLight")).toMatchObject({ group: "ns", dirSign: 1, junctionNodeId: "sw-n-tl3" });
    // Each avenue segment between two DIFFERENT clusters keeps its lines (the
    // C1 "no lines inside a cluster" rule must not eat them here).
    expect(lines.filter((l) => l.edgeIdx === 1).length).toBe(2);
    // Signalized + guarded → no right-hand-rule junction anywhere.
    expect(runtime.debugUncontrolledJunctions()).toEqual([]);
  });

  it("every cluster serves the AVENUE on the ns axis (dominant class wins)", () => {
    // Each node's OWN axis-group falls back to its dominant incident class —
    // the secondary avenue, never the residential cross street. Read it through
    // the public API: signalPhase() uses the node's own group, so it must agree
    // with the phase an avenue-bound (bearing 0) approach sees, and disagree
    // with the cross street's, at some point in the cycle.
    const rt = createWorldRuntime(loadRaw());
    let disagreedWithCross = 0;
    for (let i = 0; i < 60 * SIGNAL_TIMING.cycleSec; i++) {
      rt.update(1 / 60);
      for (const id of SIGNALS) {
        expect(rt.signalPhase(id)).toBe(rt.signalPhaseForApproach(id, 0));
        if (rt.signalPhase(id) !== rt.signalPhaseForApproach(id, 90)) disagreedWithCross++;
      }
    }
    expect(disagreedWithCross).toBeGreaterThan(0);
    // And the graded stop lines agree: avenue approaches adjudicate on "ns",
    // cross-street approaches on "ew".
    for (const l of runtime.debugStopLines()) {
      expect(l.group).toBe(l.edgeIdx <= 3 ? "ns" : "ew");
    }
  });

  it("the two-phase machine runs per cluster: avenue and cross street never green together", () => {
    const rt = createWorldRuntime(loadRaw());
    let bothGreen = 0;
    for (let i = 0; i < 60 * SIGNAL_TIMING.cycleSec; i++) {
      rt.update(1 / 60);
      for (const id of SIGNALS) {
        if (rt.signalPhaseForApproach(id, 0) === "green" && rt.signalPhaseForApproach(id, 90) === "green") {
          bothGreen++;
        }
      }
    }
    expect(bothGreen).toBe(0);
  });

  it("the three lamps are NOT synchronized — they are offset (a wave, not a block)", () => {
    const rt = createWorldRuntime(loadRaw());
    let differed = 0;
    for (let i = 0; i < 60 * SIGNAL_TIMING.cycleSec; i++) {
      rt.update(1 / 60);
      const phases = SIGNALS.map((id) => rt.signalPhaseForApproach(id, 0));
      if (new Set(phases).size > 1) differed++;
    }
    expect(differed).toBeGreaterThan(0);
  });

  it("END TO END: a steady 50 km/h rider crosses all THREE lines on GREEN", () => {
    // The district's promise, swept through the real runtime: depart y = −289
    // at t = 0, hold 13.889 m/s, and read the lamp AT each stop line. This is
    // what a live student's session does — no offsets are pinned anywhere.
    const rt = createWorldRuntime(loadRaw());
    const V = 50 / 3.6;
    const dt = 1 / 60;
    const seen: string[] = [];
    let y = -289;
    let t = 0;
    // The bot's 2.2 m/s² ramp to 50 (recorder SCRIPT_ACCEL) — the wave is
    // authored around a prompt departure, so the sweep must model it.
    let v = 0;
    for (let i = 0; i < 90 / dt && y < 620; i++) {
      v = Math.min(V, v + 2.2 * dt);
      y += v * dt;
      t += dt;
      rt.update(dt);
      const tick = rt.sample(sample(LANE, y, 0, v * 3.6), t, false);
      for (const e of tick.events) {
        if (e.kind === "stopLineCrossed" && e.control === "trafficLight") seen.push(e.lightState ?? "?");
      }
    }
    expect(seen).toEqual(["green", "green", "green"]);
  });

  it("COUNTER-PROOF: the same rider at 58 km/h meets RED on the approaches", () => {
    // A green wave punishes the EARLY: sprinting arrives before the phase does.
    // (The 58 km/h sweep still slips through the greens it outruns — the
    // measured cost is TIME, which the trace gate asserts; what this proves is
    // that the sprinter genuinely faces red windscreens the rider never sees.)
    const rt = createWorldRuntime(loadRaw());
    const V = 58 / 3.6;
    const dt = 1 / 60;
    let y = -289;
    let t = 0;
    let v = 0;
    let redSeenAhead = 0;
    let riderRedSeen = 0;
    for (let i = 0; i < 90 / dt && y < 620; i++) {
      v = Math.min(V, v + 2.2 * dt);
      y += v * dt;
      t += dt;
      rt.update(dt);
      const tick = rt.sample(sample(LANE, y, 0, v * 3.6), t, false);
      if (tick.nextStopLineState === "red") redSeenAhead++;
    }
    // And the wave rider, on a fresh runtime, sees essentially none.
    const rt2 = createWorldRuntime(loadRaw());
    let y2 = -289;
    let t2 = 0;
    let v2 = 0;
    for (let i = 0; i < 90 / dt && y2 < 620; i++) {
      v2 = Math.min(50 / 3.6, v2 + 2.2 * dt);
      y2 += v2 * dt;
      t2 += dt;
      rt2.update(dt);
      const tick = rt2.sample(sample(LANE, y2, 0, v2 * 3.6), t2, false);
      if (tick.nextStopLineState === "red") riderRedSeen++;
    }
    expect(redSeenAhead).toBeGreaterThan(0);
    expect(riderRedSeen).toBe(0);
  });

  it("resolves the tagged speed limits per axis", () => {
    expect(runtime.speedLimitAt({ x: 0, y: -100 })).toBe(50); // secondary avenue
    expect(runtime.speedLimitAt({ x: 70, y: 264 })).toBe(40); // residential cross
  });

  it("locates the spawn points on their authored edges", () => {
    expect(runtime.locate({ x: 0, y: -289 }).edgeId).toBe("sw-e-a0");
    expect(runtime.locate({ x: -75, y: 264 }).edgeId).toBe("sw-e-w2");
  });

  it("the authored stop-line constants the traces are pinned to are real", () => {
    const northbound = runtime
      .debugStopLines()
      .filter((l) => l.group === "ns" && l.dirSign === 1)
      .sort((a, b) => a.junctionNodeId.localeCompare(b.junctionNodeId));
    expect(northbound.length).toBe(3);
    // sM → world y on each host edge (a0 starts at −304; a1 at 0; a2 at 264).
    const starts = [-304, 0, 264];
    northbound.forEach((l, i) => {
      expect(starts[i] + l.sM).toBeCloseTo(LINES[i], 3);
    });
  });

  it("STOP_LINE_OVERRIDES stays skip-safe on this foreign map (doc 74 §5.6)", () => {
    expect(STOP_LINE_OVERRIDES.length).toBeGreaterThan(0);
    const raw = loadRaw() as { roads: { edges: Array<{ id: string }> } };
    const edgeIds = new Set(raw.roads.edges.map((e) => e.id));
    for (const ov of STOP_LINE_OVERRIDES) {
      expect(edgeIds.has(ov.edgeId), ov.edgeId).toBe(false);
    }
  });
});

describe("sig-wave-v1 through the traffic lane graph + system", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 10 two-way edges → 20 directed lanes", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(20);
    expect(graph.crossingLanes.size).toBe(0);
    for (const id of SIGNALS) expect(graph.junctionRadiusM.get(id)).toBeGreaterThan(0);
  });

  it("vehicleCount 0 / pedestrianCount 0 is a LEGAL config (scenario micro-map)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 11,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: 0, y: -289 },
      anchorRadiusM: 700,
    });
    expect(traffic.stats.vehicleCount).toBe(0);
    for (let i = 0; i < 120; i++) {
      traffic.update(1 / 60, {
        signalPhase: () => "green",
        playerPos: { x: 0, y: -289 },
        playerSpeedKmh: 10,
      });
    }
    expect(traffic.vehicles.length).toBe(0);
    expect(traffic.leadGapMeters(LANE, -289, 0)).toBe(Infinity);
  });
});
