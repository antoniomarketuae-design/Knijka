/**
 * ROUNDABOUT-WITH-EXIT-ZEBRAS archetype contract battery (Scenario Studio
 * doc 76 §3; the rb-mini-district.test.ts pattern).
 *
 * content/world/rb-ped-v1.json is the roundabout family's THIRD generated
 * micro-map (tools/maps/gen_rb_ped.mjs — the rb-mini ring verbatim, plus a
 * marked zebra a car-length off each EXIT spoke). The battery proves the file
 * satisfies the FULL engine contract AND the invariants sc-rb-ped-exit's
 * teach is built on:
 *
 *   1. world    — assertDistrict + buildWorldGeometry: Б1 (give way) + Д11
 *                 (roundabout) signs at every entry, three painted zebras, no
 *                 stop signs/lights;
 *   2. POCKET   — the archetype's own contract: the clear span between the
 *                 circulatory carriageway and each zebra holds EXACTLY ONE car;
 *                 the entry arm carries none;
 *   3. runtime  — the roundabout tracker ARMS from roundabouts[]; the exit
 *                 zebra's crossing zone arms from the EXIT ARM but NOT from the
 *                 south approach (the gating `s.crossing === null` detectors on
 *                 the approach stay live — the harsh-brake demo depends on it);
 *   4. traffic  — the lane graph carries the ring (4 oneway lanes) + arms in
 *                 one SCC.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const RING_NODES = ["rbp-n-s", "rbp-n-e", "rbp-n-n", "rbp-n-w"];
/** The engine's own car length (orchestrator/runners.ts LEAD_CAR_LENGTH_M) —
 *  the unit the pocket is measured in. */
const CAR_LENGTH_M = 4.3;
/** rb-ped-v1 by value (the generator's RBP_PARAMS + resolved pocket). */
const R = 18;
const RING_OUTER_EDGE_M = 22.06; // R + drawn ring lane 8.125 / 2
const ZEBRA_R = 30; // R + crossingOffsetM 12
const POCKET_M = 7.94; // ZEBRA_R − RING_OUTER_EDGE_M
const X_ARM_LANE = 4.06;

function loadRaw(): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", "rb-ped-v1.json"),
    path.resolve(process.cwd(), "..", "content", "world", "rb-ped-v1.json"),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(
    `rb-ped-v1.json not found (run: node tools/maps/gen_rb_ped.mjs) in: ${candidates.join(", ")}`,
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

describe("rb-ped-v1 through the world builder", () => {
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
    expect(district.roundabouts).toHaveLength(1);
    const rb = district.roundabouts[0];
    expect(rb).toMatchObject({ id: "rbp-rb-1", x: 0, y: 0, radius: R });
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

  it("signs every entry: give way (Б1) + roundabout (Д11), three zebras, zero stop signs/lights", () => {
    expect(world.stats.signs.giveWay).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.roundabout).toBeGreaterThanOrEqual(4);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    // THE archetype delta against rb-mini-v1 (which paints zero).
    expect(world.stats.zebraCrossings).toBe(3);
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
      path.join(process.cwd(), "content", "world", "rb-ped-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "rb-ped-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "rb-ped-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// THE POCKET — the archetype's reason to exist (sc-rb-ped-exit's whole teach)
// ---------------------------------------------------------------------------

describe("rb-ped-v1 — the stop pocket between ring and zebra", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw());
  });

  it("puts a marked, unsignalized zebra on EVERY exit spoke — and none on the entry arm", () => {
    expect(district.crossings).toHaveLength(3);
    const byId = new Map(district.crossings.map((c) => [c.id, c]));
    expect([...byId.keys()].sort()).toEqual(["rbp-x-e", "rbp-x-n", "rbp-x-w"]);
    expect(byId.get("rbp-x-e")).toMatchObject({ x: ZEBRA_R, y: 0, edgeId: "rbp-e-arm-e" });
    expect(byId.get("rbp-x-n")).toMatchObject({ x: 0, y: ZEBRA_R, edgeId: "rbp-e-arm-n" });
    expect(byId.get("rbp-x-w")).toMatchObject({ x: -ZEBRA_R, y: 0, edgeId: "rbp-e-arm-w" });
    for (const c of district.crossings) {
      expect(c.kind, c.id).toBe("marked");
      expect(c.signalized, c.id).toBe(false);
      // The ENTRY arm stays zebra-free: a crossing zone armed over the approach
      // would mask the approach's own grading (gen_rb_ped's header).
      expect(c.edgeId, c.id).not.toBe("rbp-e-arm-s");
    }
  });

  it("leaves a pocket that holds EXACTLY ONE car — clear of the ring, unstackable", () => {
    for (const c of district.crossings) {
      const rC = Math.hypot(c.x, c.y);
      expect(rC, c.id).toBeCloseTo(ZEBRA_R, 2);
      const pocket = rC - RING_OUTER_EDGE_M;
      expect(pocket, c.id).toBeCloseTo(POCKET_M, 2);
      // Wall 1: a yielding car fits WITHOUT hanging into the circulatory
      // carriageway — the correct stop never blocks the ring.
      expect(pocket, c.id).toBeGreaterThanOrEqual(CAR_LENGTH_M);
      // Wall 2: two cars never stack — the driver behind must hold on the
      // approach, which is the other half of the lesson.
      expect(pocket, c.id).toBeLessThan(2 * CAR_LENGTH_M);
    }
  });

  it("every zebra clears the runtime's roundabout band (R + 9) — it is a street zebra, not a ring one", () => {
    for (const c of district.crossings) {
      expect(Math.hypot(c.x, c.y), c.id).toBeGreaterThan(R + 9);
    }
  });

  it("meta.scenario pins the geometry sc-rb-ped-exit denormalizes (the L7 copy)", () => {
    const s = district.meta.scenario as unknown as {
      params: Record<string, unknown>;
      center: { x: number; y: number };
      entryArm: string;
      exitArm: string;
      primaryCrossingId: string;
      exitOrderFromSouth: string[];
      laneCenterRightM: number;
      armHalfCarriagewayM: number;
      pocket: { ringOuterEdgeM: number; crossingRadiusM: number; lengthM: number; carLengthM: number };
    };
    expect(s.params).toMatchObject({
      ringRadiusM: R,
      arms: 4,
      armLengthM: 90,
      entryArm: "south",
      crossingOffsetM: 12,
      ringSpeedKmh: 30,
      armSpeedKmh: 40,
    });
    expect(s.center).toEqual({ x: 0, y: 0 });
    expect(s.entryArm).toBe("south");
    expect(s.exitArm).toBe("north");
    // The drill's crosser walks THIS zebra — the second (north) exit.
    expect(s.primaryCrossingId).toBe("rbp-x-n");
    expect(s.exitOrderFromSouth).toEqual(["rbp-n-e", "rbp-n-n", "rbp-n-w"]);
    expect(s.laneCenterRightM).toBe(X_ARM_LANE);
    expect(s.armHalfCarriagewayM).toBe(8.125);
    expect(s.pocket).toEqual({
      ringOuterEdgeM: RING_OUTER_EDGE_M,
      crossingRadiusM: ZEBRA_R,
      lengthM: POCKET_M,
      carLengthM: CAR_LENGTH_M,
    });
  });

  it("the finish reference sits past the exit zebra, in the north arm's outbound lane", () => {
    const finish = district.spawnPoints.find((s) => s.id === "rbp-spawn-finish")!;
    expect(finish.edgeId).toBe("rbp-e-arm-n");
    expect(finish.x).toBe(X_ARM_LANE);
    expect(finish.y).toBeGreaterThan(ZEBRA_R);
    const south = district.spawnPoints.find((s) => s.id === "rbp-spawn-south")!;
    expect(south).toMatchObject({ x: X_ARM_LANE, y: -93, heading: 0, edgeId: "rbp-e-arm-s" });
  });
});

describe("rb-ped-v1 through the world runtime", () => {
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
    expect(runtime.speedLimitAt({ x: 0, y: -R })).toBe(30); // ring
    expect(runtime.speedLimitAt({ x: X_ARM_LANE, y: -80 })).toBe(40); // south arm
    expect(runtime.speedLimitAt({ x: X_ARM_LANE, y: ZEBRA_R + 20 })).toBe(40); // north arm, past the zebra
  });

  it("a barging entry against circulating traffic grades prioritySituation roundabout/violated", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setCirculatingQuery(() => true); // a car is always on the ring band
    const events: Array<{ situation: string; violated: boolean }> = [];
    let t = 0;
    // Constant 22 km/h (6.1 m/s) straight at the south mouth — inward, fast,
    // never braking: the conflict is visible from d ≈ 30 (ring + 12 margin).
    for (let y = -60; y <= -10; y += 1) {
      t += 1 / 6.1;
      rt.update(1 / 6.1);
      const tick = rt.sample(sample(X_ARM_LANE, y, 0, 22), t, false);
      for (const e of tick.events) {
        if (e.kind === "prioritySituation") events.push({ situation: e.situation, violated: e.violated });
      }
    }
    const rbEvents = events.filter((e) => e.situation === "roundabout");
    expect(rbEvents.length).toBe(1); // once per approach
    expect(rbEvents[0].violated).toBe(true);
  });

  /**
   * THE ZONE GEOMETRY sc-rb-ped-exit's two demos both depend on.
   * CrossingZoneTracker arms a zone from its crossing's host edge AND every edge
   * sharing a node with it, within 35 m. The exit zebra must therefore be LIVE
   * from the north exit — and DEAD over the south approach, because the
   * harsh-brake demo needs `s.crossing === null` there (rules/engine.ts gates
   * HARSH_BRAKING_NO_CAUSE on it).
   */
  it("the exit zebra's zone arms from the north exit but NEVER from the south approach", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setPedestrianQuery(() => true); // someone is always on every zebra
    const armedOn = (x: number, y: number, headingDeg: number): string[] => {
      const codes: string[] = [];
      const tick = rt.sample(sample(x, y, headingDeg, 20), 1, false);
      for (const e of tick.events) {
        if (e.kind === "crossingZoneEntered") codes.push(e.crossingId);
      }
      return codes;
    };
    // The whole south approach: no zone may arm anywhere on it — the entry arm
    // has no zebra and shares no node with one.
    for (let y = -93; y <= -30; y += 3) {
      expect(armedOn(X_ARM_LANE, y, 0), `south arm y=${y}`).toEqual([]);
    }
    // …and the north exit arm arms rbp-x-n (fresh runtime — zones are sticky).
    const rt2 = createWorldRuntime(loadRaw());
    rt2.setPedestrianQuery(() => true);
    const seen: string[] = [];
    for (const [x, y] of [
      [X_ARM_LANE, 24],
      [X_ARM_LANE, 26],
      [X_ARM_LANE, 28],
    ] as const) {
      for (const e of rt2.sample(sample(x, y, 0, 10), 1, false).events) {
        if (e.kind === "crossingZoneEntered") seen.push(e.crossingId);
      }
    }
    expect(seen).toContain("rbp-x-n");
  });

  it("the harsh-brake cause ledger is genuinely CLEAR on the approach (nextJunctionM > 35, no crossing)", () => {
    const rt = createWorldRuntime(loadRaw());
    rt.setPedestrianQuery(() => true);
    // y = −68 is 50 m from the south node: past harshBrakeJunctionClearM (35),
    // and no zebra zone can reach it. This is where the demo's fault lands.
    const tick = rt.sample(sample(X_ARM_LANE, -68, 0, 38), 1, false);
    expect(tick.nextJunctionM).toBeGreaterThan(35);
    expect(tick.nextStopLineM).toBeUndefined();
    expect(tick.events.some((e) => e.kind === "crossingZoneEntered")).toBe(false);
  });

  /**
   * The counter-proof for the honest-scope note on the template's second
   * mistake: inside the ring the junction-proximity armor is PERMANENTLY on, so
   * HARSH_BRAKING_NO_CAUSE structurally cannot fire there. Every ring point is
   * within 2·R·sin(22.5°) = 13.8 m of a mouth.
   */
  it("inside the ring, nextJunctionM never clears the harsh-brake armor (35 m)", () => {
    const rt = createWorldRuntime(loadRaw());
    for (let phi = 0; phi < 360; phi += 5) {
      const a = (phi * Math.PI) / 180;
      const x = R * Math.sin(a);
      const y = -R * Math.cos(a);
      const tick = rt.sample(sample(x, y, (phi + 90) % 360, 12), 1 + phi, false);
      expect(tick.nextJunctionM, `φ=${phi}`).toBeLessThanOrEqual(13.8);
    }
  });
});

describe("rb-ped-v1 through the traffic lane graph", () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw() as TrafficDistrict;
  });

  it("builds the lane graph: 4 ring lanes + 8 arm lanes, every walk closes", () => {
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
});
