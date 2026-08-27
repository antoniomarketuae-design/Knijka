/**
 * BUS-PULLOUT micro-map contract battery (the merge-districts.test.ts pattern)
 * — doc 72 §15 VU-11 „Потеглящ автобус", ЗДвП чл. 67.
 *
 * content/world/mg-busstop-v1.json (tools/maps/gen_mg_busstop.mjs) is the
 * merging family's only ZONE-shaped map: a 2+2 city street whose northbound
 * CURB lane is a бус лента over the FULL edge, with the спирка inside it. The
 * battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - THE ARCHETYPE'S WHOLE IDEA — the busLane span covers the whole street, so
 *    tick.busLaneRight is true on every frame and the keep-right detector reads
 *    rightmostRequiredLane = 1: a car that cruises the general lane for all
 *    400 m is INNOCENT, which is what makes „не се кара по спирката" the
 *    map's baseline instead of the map's trap. That one span is the whole map;
 *  - the LOCATOR resolves the two lanes the template pins by value: the бус
 *    лента at x = 12.1875 (laneId 0 — the staged bus's own path) and the
 *    general lane at x = 4.0625 (laneId 1 — the player's whole drive);
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    cruising the general lane is innocent, and riding the бус лента instead
 *    grades exactly DRIVING_IN_BUS_LANE;
 *  - the LEAD-CORRIDOR law the whole drill is timed against: a bus sitting in
 *    the бус лента is 8.125 m off the general lane — beyond LEAD_CORRIDOR_M
 *    (4 m) — so it is NOT the player's lead until it actually pulls out. The
 *    following-distance duty starts at the merge, not at the bay;
 *  - the clean-room law: zero signals, stop lines, junctions and crossings, so
 *    nothing competes with the speed/gap channels this template grades.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent, type SimTick } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** mg-busstop-v1 truths (generator params — asserted against the file below). */
const LENGTH_M = 400;
const LIMIT_KMH = 50;
const BAY_FROM_Y = 130;
const BAY_TO_Y = 176;
/** The EXACT lane-graph centers the ScenarioSpec/trace scripts pin by value. */
const X_BUS = 12.1875; // laneId 0 — the бус лента; the staged bus rides it
const X_GENERAL = 4.0625; // laneId 1 — the general lane; the player rides it
const STREET_EDGE = "mgb-e-street";
const BUS_LANE_ZONE = "mgb-z-buslane";

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_mg_busstop.mjs) in: ${candidates.join(", ")}`);
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

describe("mg-busstop-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mg-busstop-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: one straight 2+2 city street on x = 0", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const e = district.roads.edges[0];
    expect(e.id).toBe(STREET_EDGE);
    expect(e.oneway).toBe(false);
    expect(e.lanes).toBe(4); // a бус лента needs a general lane BESIDE it
    expect(e.class).toBe("tertiary");
    expect(e.maxspeed).toBe(LIMIT_KMH); // населено място — the чл. 67 scope
    expect(e.length).toBe(LENGTH_M);
    for (const [x] of e.geometry) expect(x).toBe(0);
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
  });

  it("THE ARCHETYPE: one busLane span, covering the FULL edge", () => {
    expect(district.zones).toHaveLength(1);
    const z = district.zones![0];
    expect(z.id).toBe(BUS_LANE_ZONE);
    expect(z.kind).toBe("busLane");
    expect(z.signRef).toBe("BUS"); // Наредба № 2 надпис, never a В-plate
    expect(z.edgeId).toBe(STREET_EDGE);
    // The whole map: a partial span would make the player's own lane illegal
    // on the approach (NOT_KEEPING_RIGHT), and a drill that convicts the
    // student for being where the law put him teaches nothing.
    expect([z.fromM, z.toM]).toEqual([0, LENGTH_M]);
  });

  it("pins the authored lane centers + the bay window in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      lanesPerDirection: number;
      laneCenterRightM: number;
      laneCenterLeftM: number;
      actorLaneX: number;
      actorShiftM: number;
      busBayY: { fromY: number; toY: number };
      busLaneY: { id: string; fromY: number; toY: number };
    };
    expect(sc.archetype).toBe("straight-street");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneCenterRightM).toBe(12.19); // the rounded display of X_BUS
    expect(sc.laneCenterLeftM).toBe(4.06); // …and of X_GENERAL
    // The EXACT values the ScenarioSpec's cutAt/cutShiftM are written against.
    expect(sc.actorLaneX).toBe(X_BUS);
    expect(sc.actorShiftM).toBe(-8.125);
    expect(sc.actorLaneX + sc.actorShiftM).toBe(X_GENERAL);
    expect(sc.busBayY).toEqual({ fromY: BAY_FROM_Y, toY: BAY_TO_Y });
    expect(sc.busLaneY.id).toBe(BUS_LANE_ZONE);
    expect([sc.busLaneY.fromY, sc.busLaneY.toY]).toEqual([0, LENGTH_M]);
  });

  it("the spawns the template pins: the car starts in the GENERAL lane, only the bay mark sits in the бус лента", () => {
    const start = district.spawnPoints.find((s) => s.id === "mgb-spawn-start")!;
    expect([start.x, start.y, start.heading]).toEqual([4.06, 15, 0]);
    expect(start.edgeId).toBe(STREET_EDGE);
    // The drill's premise: the curb lane is the bus's, not the student's.
    const bay = district.spawnPoints.find((s) => s.id === "mgb-spawn-bay")!;
    expect(bay.x).toBe(12.19);
    expect(bay.y).toBeGreaterThan(BAY_FROM_Y);
    expect(bay.y).toBeLessThan(BAY_TO_Y);
    const finish = district.spawnPoints.find((s) => s.id === "mgb-spawn-finish")!;
    expect(finish.x).toBe(4.06);
    expect(finish.y).toBeGreaterThan(BAY_TO_Y);
    // The sightline law (gen_mg_busstop's build-time assert, re-proved here):
    // the bay is readable from >= 100 m back.
    expect(BAY_FROM_Y - start.y).toBeGreaterThanOrEqual(100);
  });

  it("the CLEAN ROOM: no lights, no stop signs, no zebras, no junctions, no bus-stop shelter", () => {
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
    // Honest, and pinned so it can never silently change (gen_mg_busstop's
    // header, gaps 2+3): props.ts wants a primary/secondary edge on a degree
    // >= 3 node for a shelter — both forbidden here — and zoneSigns.ts posts
    // NOTHING for a marking-only busLane span. The bay is plain curb + a block.
    expect(world.busStops.length).toBe(0);
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

  it("stays trivially inside the performance budget (micro-map) and is deterministic for a fixed seed", () => {
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
    expect(buildWorldGeometry(district, { seed: 7 }).stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "mg-busstop-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "mg-busstop-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "mg-busstop-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("mg-busstop-v1 through the world runtime — the бус-лента context on the tick", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("mg-busstop-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers (a degree-2 street is not a junction)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("THE SPAN on the tick: busLaneRight is true on EVERY frame of both northbound lanes", () => {
    const at = (x: number, y: number): SimTick => {
      const rt = createWorldRuntime(loadRaw("mg-busstop-v1"));
      rt.update(1 / 60);
      return rt.sample(sample(x, y, 0, 45), 1, false);
    };
    for (const y of [15, BAY_FROM_Y, BAY_TO_Y, LENGTH_M - 15]) {
      const general = at(X_GENERAL, y);
      expect(general.edgeId, `general y=${y}`).toBe(STREET_EDGE);
      expect(general.laneId, `general y=${y}`).toBe(1);
      expect(general.laneCount, `general y=${y}`).toBe(2); // per bank
      expect(general.maxSpeedKmh, `general y=${y}`).toBe(LIMIT_KMH);
      // The flag names the LANE's legality, not the driver's fault — the
      // reducer's laneId gate decides that (rules/engine.ts).
      expect(general.busLaneRight, `general y=${y}`).toBe(true);
      expect(general.wrongWay, `general y=${y}`).not.toBe(true);
      const bus = at(X_BUS, y);
      expect(bus.laneId, `bus y=${y}`).toBe(0);
      expect(bus.busLaneRight, `bus y=${y}`).toBe(true);
    }
  });

  it("keeps a stable general-lane lock from spawn to finish (never steals across the осева)", () => {
    const rt = createWorldRuntime(loadRaw("mg-busstop-v1"));
    const step = 1.25; // 45 km/h at 10 Hz
    let t = 0;
    for (let y = 15; y <= LENGTH_M - 15; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_GENERAL, y, 0, 45), t, false);
      expect(tick.edgeId, `y=${y}`).toBe(STREET_EDGE);
      expect(tick.laneId, `y=${y}`).toBe(1);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("mg-busstop-v1 — lane adjudication through the real reducer", () => {
  /** Drive north at a fixed lane/speed (the curve-battery discipline: dt 0.1 s,
   *  y advances by v·dt). */
  const drive = (x: number, kmh: number, fromY: number, toY: number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("mg-busstop-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    let y = fromY;
    while (y < toY) {
      y += (kmh / 3.6) * dt;
      t += dt;
      rt.update(dt);
      const tick: SimTick = rt.sample(sample(x, y, 0, kmh), t, false);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  // Ignore re-grade events — 2026-08-27. The bus-lane accrual emits a second
  // event marked `regrade: true`; lessons/engine.ts drops it where the code was
  // already charged, so it never reaches a student. Counting it here would read
  // one continuous offence as two. The assertions below are unchanged.
  const violations = (events: RuleEvent[]) => events.filter((e) => e.kind === "violation" && e.regrade !== true).map((e) => e.code);

  it("THE MAP'S BASELINE: cruising the GENERAL lane end-to-end is fully innocent (the span exempts keep-right)", () => {
    // 400 m at 45 km/h ≈ 32 s — nearly three times keepRightSustainSec (12 s).
    // Without the span this drive would grade NOT_KEEPING_RIGHT, and the whole
    // template would be teaching the student to sit in a bus bay.
    const events = drive(X_GENERAL, 45, 15, LENGTH_M - 15);
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(true);
  });

  it("THE SPAN'S CONSEQUENCE: riding the бус лента instead grades exactly DRIVING_IN_BUS_LANE", () => {
    const events = drive(X_BUS, 45, 15, LENGTH_M - 15);
    expect(violations(events)).toEqual(["DRIVING_IN_BUS_LANE"]);
  });

  it("the urban limit is real on the general lane: 58 grades SPEEDING_OVER_LIMIT, 75 the опасна band", () => {
    // The bound the authored drives are tuned under — nothing in this template
    // may be won with throttle, and the „форсиране покрай автобуса" demo has to
    // stay UNDER it so its only code is the contact it earns.
    // Distinct codes: M-16 re-bills a long UNBROKEN episode on the repeat
    // cadence, so a full-length run at 58 is billed more than once — which is
    // the point (sustained speeding must not stay a one-point flat fee).
    expect([...new Set(violations(drive(X_GENERAL, 58, 15, LENGTH_M - 15)))]).toEqual([
      "SPEEDING_OVER_LIMIT",
    ]);
    expect([...new Set(violations(drive(X_GENERAL, 75, 15, LENGTH_M - 15)))]).toEqual([
      "SPEEDING_DANGEROUS",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer — the staged bus's path, and the corridor law that times it
// ---------------------------------------------------------------------------

describe("mg-busstop-v1 through the traffic lane graph + system", () => {
  it("stages the bus on the бус лента by DEFAULT (offset 0 = the curb lane — never a cyclist proxy)", () => {
    const raw = loadRaw("mg-busstop-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One lane per direction of travel on the single two-way edge.
    expect(graph.lanes.length).toBe(2);
    expect(graph.crossingLanes.size).toBe(0);
    // The staged bus of SC_MERGE_BUS_PULLOUT walks n-start → n-end: the hop
    // must be lane-graph-connected or stage() returns null.
    const out = graph.nodeOut.get("mgb-n-start") ?? [];
    expect(out.some((li) => graph.lanes[li].toNode === "mgb-n-end")).toBe(true);

    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    const view = traffic.stage({
      kind: "vehicle",
      id: "probe-bus",
      pathNodes: ["mgb-n-start", "mgb-n-end"],
      hold: { nodeIndex: 0, offsetM: 140 },
      cruiseSpeedMps: 9,
      extraRightOffsetM: 0,
      profile: "truck",
    });
    expect(view).not.toBeNull();
    // THE TEMPLATE'S KEY GEOMETRY, proved rather than assumed: the graph rides
    // a two-way edge's lane on the CURB lane, so an extraRightOffsetM of ZERO
    // parks the bus in the бус лента — which is also why it can never be
    // mis-tagged as the A11 cyclist proxy (that needs a POSITIVE offset).
    expect(view!.x).toBeCloseTo(X_BUS, 4);
    expect(view!.y).toBeCloseTo(140, 4);
    // …and the behavioural half of the same law: a POSITIVE curb offset is what
    // tags a staged actor as the A11 cyclist proxy, so a zero-offset bus is
    // invisible to the vulnerable-road-user tracker. It must be: a 12 m rig
    // read as a cyclist would make „минах покрай автобуса" grade as
    // VULNERABLE_PASS_TOO_CLOSE, i.e. the wrong lesson under the right title.
    expect(traffic.cyclistNear(X_GENERAL, 100, 0, 80)).toBeNull();
  });

  it("THE CORRIDOR LAW: a bus in the bay is NOT the general lane's lead — it becomes one by pulling out", () => {
    const raw = loadRaw("mg-busstop-v1") as TrafficDistrict;
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    traffic.stage({
      kind: "vehicle",
      id: "probe-bus",
      pathNodes: ["mgb-n-start", "mgb-n-end"],
      hold: { nodeIndex: 0, offsetM: 150 },
      cruiseSpeedMps: 9,
      extraRightOffsetM: 0,
      profile: "truck",
    });
    // 8.125 m of lateral separation is beyond LEAD_CORRIDOR_M (4 m): the whole
    // approach, the following-distance duty simply does not exist yet — which
    // is exactly why this template's FOLLOWING_TOO_CLOSE demo can only bill
    // AFTER the merge, and why the shadow's approach is never billed for
    // closing on a stationary bus.
    expect(traffic.leadGapMeters(X_GENERAL, 120, 0)).toBe(Infinity);
    // …and the same bus, once it has glided into the general lane, IS the lead.
    const merged = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    merged.stage({
      kind: "vehicle",
      id: "probe-bus",
      pathNodes: ["mgb-n-start", "mgb-n-end"],
      hold: { nodeIndex: 0, offsetM: 150 },
      cruiseSpeedMps: 9,
      extraRightOffsetM: -8.125, // the pull-out's destination
      profile: "truck",
    });
    expect(merged.leadGapMeters(X_GENERAL, 120, 0)).toBeLessThan(30);
  });
});
