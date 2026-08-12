/**
 * PE SCHOOL-FRONT micro-map contract battery (Scenario Studio doc 76 §3; the
 * pe-districts.test.ts + sp-transition-district.test.ts patterns fused, because
 * the map itself is that fusion).
 *
 * content/world/pe-school-v1.json (tools/maps/gen_pe_school.mjs) is a straight
 * two-way street whose limit falls 50 → 30 at a mid-block node, with ONE
 * unsignalized marked zebra deep inside the 30 zone. The battery proves the
 * FULL engine contract sc-pe-school-patrol drives through:
 *
 *   1. world   — assertDistrict + buildWorldGeometry: the zebra painted, no
 *                lights/stop signs, zero non-finite coordinates;
 *   2. runtime — the PER-EDGE limit surface really resolves 50 before the
 *                entry and 30 after it (the „бърз подход" demo grades against
 *                30, the whole point of the two-segment shape), AND the
 *                CrossingZoneTracker arms pes-x-1 ~35 m out, tracks the
 *                installed pedestrian query and fires crossingPassed — the
 *                exact events the PEDESTRIAN_* detectors grade;
 *   3. the SPEED-ONLY WINDOW — the structural invariant the mistake demo is
 *                tuned against: the ~35 m crossing zone arms WHOLLY inside the
 *                30 zone, leaving a stretch where speed alone is gradable and
 *                no crossing code can contaminate it;
 *   4. traffic — buildLaneGraph maps the zebra onto the zone edge's directed
 *                lanes; a STAGED pedestrian's road-span occupancy drives
 *                pedestrianOnCrossing (the dart-out grading chain);
 *   5. the PATROL POST — the meta.scenario curb spot the template's policeStop
 *                warden stands on is off the carriageway (scenery, never an
 *                obstacle) and inside the school zone.
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

const ID = "pe-school-v1";

/** The generator's committed recipe — pinned by value (the L7 pattern). */
const ZONE_ENTRY_Y = 140;
const CROSSING_Y = 250;
const TOTAL_M = 310;
const APPROACH_KMH = 50;
const ZONE_KMH = 30;
/** Right-lane center of a 2-lane street (drawn lane 8.125 m). */
const X_LANE = 4.06;
/** The west curb the patrol warden + the child group stand on. */
const CURB_X = -9.72;
/** The CrossingZoneTracker's arming radius. */
const CROSSING_ZONE_M = 35;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pe_school.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document (two-segment school street)", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.map((n) => n.id).sort()).toEqual([
      "pes-n-end",
      "pes-n-mid",
      "pes-n-start",
    ]);
    expect(district.roads.edges.map((e) => e.id)).toEqual(["pes-e-approach", "pes-e-zone"]);
    expect(district.intersections.length).toBe(0); // degree-2 limit change, not a junction
    expect(district.roundabouts.length).toBe(0);
    expect(district.spawnPoints.map((s) => s.id).sort()).toEqual([
      "pes-spawn-approach",
      "pes-spawn-finish",
    ]);
  });

  it("posts 50 on the approach and 30 + the school tag on the zone segment", () => {
    const approach = district.roads.edges.find((e) => e.id === "pes-e-approach")!;
    const zone = district.roads.edges.find((e) => e.id === "pes-e-zone")!;
    expect(approach.maxspeed).toBe(APPROACH_KMH);
    expect(approach.zone).toBeUndefined();
    expect(approach.length).toBe(ZONE_ENTRY_Y);
    expect(zone.maxspeed).toBe(ZONE_KMH);
    // The additive legality tag (doc 72 N3) — the REDUCED limit is in maxspeed.
    expect(zone.zone).toBe("school");
    expect(zone.length).toBe(TOTAL_M - ZONE_ENTRY_Y);
  });

  it("hosts the zebra INSIDE the 30 zone, on the zone edge", () => {
    expect(district.crossings.map((c) => c.id)).toEqual(["pes-x-1"]);
    const cross = district.crossings[0];
    expect(cross.kind).toBe("marked");
    expect(cross.signalized).toBe(false);
    expect(cross.x).toBe(0);
    expect(cross.y).toBe(CROSSING_Y);
    // The zebra belongs to the school zone, not the 50 approach.
    expect(cross.edgeId).toBe("pes-e-zone");
    expect(cross.y).toBeGreaterThan(ZONE_ENTRY_Y);
  });

  it("meta.scenario pins the values the ScenarioSpec copies by value", () => {
    const s = district.meta.scenario as Record<string, unknown>;
    expect(s.archetype).toBe("zebra-block");
    expect(s.primaryCrossingId).toBe("pes-x-1");
    expect(s.laneCenterRightM).toBe(X_LANE);
    expect(s.curbXWest).toBe(CURB_X);
    expect(s.zoneEntryY).toBe(ZONE_ENTRY_Y);
    expect(s.crossingY).toBe(CROSSING_Y);
    expect(s.patrolPost).toEqual({ x: CURB_X, y: CROSSING_Y - 4 });
  });

  it("paints the zebra and hosts no lights or stop signs", () => {
    expect(world.stats.zebraCrossings).toBe(1);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
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
    expect(Array.from(again.markings.positions.slice(0, 300))).toEqual(
      Array.from(world.markings.positions.slice(0, 300)),
    );
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

describe(`${ID} through the world runtime — the per-edge limit surface`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junction trackers (street by design)", () => {
    // The mid node is a limit change, not an intersection: no arterial edge
    // exists, so the stop-sign heuristic derives nothing there.
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves 50 before the school-zone entry and 30 after it", () => {
    // This IS the lesson's grading surface: the „бърз подход" demo fires the
    // speeding codes against 30, not against 50.
    expect(runtime.speedLimitAt({ x: X_LANE, y: 15 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_ENTRY_Y - 20 })).toBe(APPROACH_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: ZONE_ENTRY_Y + 20 })).toBe(ZONE_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: CROSSING_Y })).toBe(ZONE_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE, y: TOTAL_M - 15 })).toBe(ZONE_KMH);
  });

  it("CrossingZoneTracker arms pes-x-1 ~35 m out, tracks the pedestrian flag and fires crossingPassed", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let pedOn = false;
    rt.setPedestrianQuery((id) => (id === "pes-x-1" ? pedOn : false));

    const drive = (yFrom: number, yTo: number, t0: number) => {
      const collected: Array<{ y: number; kind: string; flag?: boolean; id?: string }> = [];
      let t = t0;
      for (let y = yFrom; y <= yTo; y += 2) {
        t += 0.2;
        rt.update(0.2);
        const tick = rt.sample(sample(X_LANE, y, 0, 25), t, false);
        for (const e of tick.events) {
          if (e.kind === "crossingZoneEntered" || e.kind === "crossingPassed") {
            collected.push({ y, kind: e.kind, flag: e.pedestrianOnCrossing, id: e.crossingId });
          }
        }
      }
      return collected;
    };

    // Approach with nobody on the crossing: the zone arms near d = 35.
    const first = drive(ZONE_ENTRY_Y, CROSSING_Y - 19, 0);
    const entered = first.find((e) => e.kind === "crossingZoneEntered" && e.id === "pes-x-1");
    expect(entered).toBeDefined();
    expect(entered!.flag).toBe(false);
    expect(Math.abs(CROSSING_Y - entered!.y - CROSSING_ZONE_M)).toBeLessThanOrEqual(4);

    // The child steps on WHILE the vehicle is inside the zone: the contract
    // re-emits the zone event with the flipped flag.
    pedOn = true;
    const second = drive(CROSSING_Y - 17, CROSSING_Y - 11, 8);
    const reEmit = second.find((e) => e.kind === "crossingZoneEntered" && e.id === "pes-x-1");
    expect(reEmit).toBeDefined();
    expect(reEmit!.flag).toBe(true);

    // She clears; passing over the crossing fires crossingPassed(false) — what
    // the reducer turns into PEDESTRIAN_YIELDED after a slow-down.
    pedOn = false;
    const third = drive(CROSSING_Y - 9, CROSSING_Y + 11, 12);
    const passed = third.find((e) => e.kind === "crossingPassed" && e.id === "pes-x-1");
    expect(passed).toBeDefined();
    expect(passed!.flag).toBe(false);
  });
});

describe(`${ID} — the SPEED-ONLY WINDOW (the invariant the mistake demo is tuned against)`, () => {
  it("the ~35 m crossing zone arms WHOLLY inside the 30 zone", () => {
    // If the crossing zone reached back past the entry, a fast approach would
    // be graded by the crossing chain instead of (or as well as) the speeding
    // chain, and the „бърз подход" demo could not assert EXACTLY
    // SPEEDING_OVER_LIMIT. The generator enforces >= 55 m; assert the ship.
    expect(CROSSING_Y - CROSSING_ZONE_M).toBeGreaterThan(ZONE_ENTRY_Y);
  });

  it("leaves a real stretch of 30 zone where speed alone is gradable", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    rt.setPedestrianQuery(() => false);
    // Drive the window at a school-zone-illegal 38 km/h: the limit surface says
    // 30 the whole way, and the crossing zone never arms — no crossing event
    // exists to contaminate the speeding episode.
    const events: string[] = [];
    let t = 0;
    for (let y = ZONE_ENTRY_Y + 2; y <= CROSSING_Y - CROSSING_ZONE_M - 5; y += 2) {
      t += 0.2;
      rt.update(0.2);
      const tick = rt.sample(sample(X_LANE, y, 0, 38), t, false);
      expect(tick.maxSpeedKmh).toBe(ZONE_KMH);
      for (const e of tick.events) events.push(e.kind);
    }
    expect(events).not.toContain("crossingZoneEntered");
    expect(events).not.toContain("crossingPassed");
    // …and the window is long enough to sustain the 2 s episode at 38 km/h
    // (~21 m) with room to spare.
    expect(CROSSING_Y - CROSSING_ZONE_M - ZONE_ENTRY_Y).toBeGreaterThanOrEqual(40);
  });
});

describe(`${ID} — the patrol post (the policeStop warden's curb spot)`, () => {
  it("stands off the carriageway, inside the school zone, beside the zebra", () => {
    const district = assertDistrict(loadRaw(ID));
    const post = (district.meta.scenario as { patrolPost: { x: number; y: number } }).patrolPost;
    // Off the 16.25 m carriageway: the warden is scenery, never an obstacle.
    expect(Math.abs(post.x)).toBeGreaterThan(8.125);
    expect(post.y).toBeGreaterThan(ZONE_ENTRY_Y);
    expect(post.y).toBeLessThan(TOTAL_M);
    // Close enough to the zebra to read as its warden.
    expect(Math.abs(post.y - CROSSING_Y)).toBeLessThanOrEqual(6);
  });
});

describe(`${ID} through the traffic lane graph + system`, () => {
  let raw: TrafficDistrict;

  beforeAll(() => {
    raw = loadRaw(ID) as TrafficDistrict;
  });

  it("builds the lane graph: 4 directed lanes (2 segments × 2), the zebra on the zone edge's pair", () => {
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(4);
    expect(graph.crossingLanes.get("pes-x-1")?.length).toBe(2);
    expect(graph.crossingSignalNode.size).toBe(0); // unsignalized zebra
  });

  it("a STAGED pedestrian's road span drives pedestrianOnCrossing (the dart-out chain)", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    // West curb → across the 16.25 m carriageway → east walk-out (the exact
    // geometry the template stages the child group on, at pes-x-1).
    const staged = traffic.stage({
      kind: "pedestrian",
      id: "pes-test-ped",
      path: [
        { x: CURB_X, y: CROSSING_Y },
        { x: 13.73, y: CROSSING_Y },
      ],
      speedMps: 1.4,
      crossingId: "pes-x-1",
      roadFromM: 1.6,
      roadToM: 17.85,
    });
    expect(staged).not.toBeNull();
    expect(traffic.pedestrianOnCrossing("pes-x-1")).toBe(false);

    traffic.stagedCommand("pes-test-ped", { type: "cruise" });
    const onFlags: boolean[] = [];
    for (let i = 0; i < 60 * 18; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
      if (i % 30 === 0) onFlags.push(traffic.pedestrianOnCrossing("pes-x-1"));
    }
    // Off the road at the start, ON while walking the span, off after.
    expect(onFlags[0]).toBe(false);
    expect(onFlags).toContain(true);
    expect(onFlags[onFlags.length - 1]).toBe(false);
    expect(traffic.staged("pes-test-ped")!.finished).toBe(true);
  });

  it("stages the patrol warden as a NEVER-WALKING figure at its post", () => {
    const traffic = createTrafficSystem(raw, {
      seed: 3,
      vehicleCount: 0,
      pedestrianCount: 0,
      anchor: { x: X_LANE, y: 15 },
      anchorRadiusM: 400,
    });
    // The PoliceStopRunner's staging shape (orchestrator/runners.ts): a 1.5 m
    // facing path, speed 0, pose stopSignal — and it is NEVER commanded.
    const warden = traffic.stage({
      kind: "pedestrian",
      id: "pes-test-warden",
      path: [
        { x: CURB_X, y: CROSSING_Y - 4 },
        { x: CURB_X + 1.5, y: CROSSING_Y - 4 },
      ],
      speedMps: 0,
      colorIndex: 0,
      pose: "stopSignal",
    });
    expect(warden).not.toBeNull();
    // The pose lives on the pedestrian VIEW (the police-stop battery's shape).
    const figure = traffic.pedestrians.find((p) => p.pose === "stopSignal")!;
    expect(figure).toBeDefined();
    expect(figure.x).toBeCloseTo(CURB_X, 3);
    expect(figure.y).toBeCloseTo(CROSSING_Y - 4, 3);
    for (let i = 0; i < 60 * 5; i++) {
      traffic.update(1 / 60, { signalPhase: () => "green", playerPos: null });
    }
    // Still at the post after 5 s — the warden is scenery, never commanded.
    expect(figure.x).toBeCloseTo(CURB_X, 3);
    expect(figure.speedMps).toBe(0);
    // …and no crossing occupancy is ever claimed by the warden.
    expect(traffic.pedestrianOnCrossing("pes-x-1")).toBe(false);
  });
});
