/**
 * MERGE-LANE archetype contract battery (the mw-district.test.ts pattern) —
 * doc 72 §10 OV-15 „Включване в движението" at motorway scale + §8 SP-10.
 *
 * content/world/mw-entry-v1.json (tools/maps/gen_mw_entry.mjs) is the first
 * "merge-lane" micro-map: a divided 2+2 motorway whose northbound carriageway
 * is SPLIT into three collinear segments at plain degree-2 nodes, plus an
 * un-tagged on-ramp that lands on the curb-lane center at the nose. The
 * battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - THE ARCHETYPE'S WHOLE IDEA — the emergencyLane span is interrupted for
 *    exactly the 200 m of the acceleration lane, so the SAME curb lane reads
 *    as a legal travel lane between nose and taper and as the аварийна лента
 *    on either side of it. That one data gap is what makes the merge gradable
 *    with zero new engine code;
 *  - the LOCATOR resolves the authored line the trace scripts drive: ramp →
 *    curb lane → laneId 1, with the hand-off at y ≈ 273 and no lock ever
 *    stolen across the median;
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    riding the acceleration lane is INNOCENT, cruising laneId 1 past the
 *    taper is INNOCENT (the resumed span exempts keep-right), and failing to
 *    merge — riding the curb lane past the taper — grades exactly
 *    EMERGENCY_LANE_DRIVING;
 *  - the ramp is NOT motorway-tagged, so building speed from rest on it can
 *    never grade DRIVING_TOO_SLOW_FOR_MOTORWAY.
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

/** mw-entry-v1 truths (generator params — asserted against the file below). */
const NOSE_Y = 260;
const TAPER_Y = 460;
const END_Y = 960;
const LIMIT_KMH = 140;
const RAMP_KMH = 90;
const X_CURB = 8.13; // laneId 0 — accel lane between nose/taper, аварийна elsewhere
const X_CRUISE = 0; // laneId 1 — the merge target
const X_LEFT = -8.12; // laneId 2 — the overtaking lane
const APPROACH_EDGE = "mwe-e-nb-approach";
const ACCEL_EDGE = "mwe-e-nb-accel";
const MAIN_EDGE = "mwe-e-nb-main";
const SB_EDGE = "mwe-e-sb";
const RAMP_EDGE = "mwe-e-ramp";
const NB_EDGES = [APPROACH_EDGE, ACCEL_EDGE, MAIN_EDGE];

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_mw_entry.mjs) in: ${candidates.join(", ")}`);
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

describe("mw-entry-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mw-entry-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: a 2+2 motorway split into three collinear nb segments + a ramp", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(8);
    expect(district.roads.edges.length).toBe(5);
    for (const id of [...NB_EDGES, SB_EDGE]) {
      const e = district.roads.edges.find((x) => x.id === id)!;
      expect(e, id).toBeDefined();
      expect(e.oneway, id).toBe(true);
      expect(e.lanes, id).toBe(3); // curb + 2 travel
      expect(e.maxspeed, id).toBe(LIMIT_KMH); // the honest АМ 140
      expect(e.motorway, id).toBe(true);
    }
    // The nb split: approach → accel (~200 m, the brief's taper distance) → main.
    const seg = (id: string) => district.roads.edges.find((e) => e.id === id)!;
    expect(seg(APPROACH_EDGE).length).toBe(NOSE_Y);
    expect(seg(ACCEL_EDGE).length).toBe(TAPER_Y - NOSE_Y);
    expect(seg(MAIN_EDGE).length).toBe(END_Y - TAPER_Y);
    for (const id of NB_EDGES) for (const [x] of seg(id).geometry) expect(x, id).toBe(0);
    // The joints are plain degree-2 vertices (a data boundary, not a junction).
    for (const nodeId of ["mwe-n-nose", "mwe-n-taper"]) {
      const degree = district.roads.edges.filter((e) => e.from === nodeId || e.to === nodeId).length;
      expect(degree, nodeId).toBe(2);
    }
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
  });

  it("THE ARCHETYPE: the emergencyLane span is interrupted for exactly the acceleration lane", () => {
    expect(district.zones).toHaveLength(3);
    const hosts = district.zones!.map((z) => z.edgeId).sort();
    expect(hosts).toEqual([APPROACH_EDGE, MAIN_EDGE, SB_EDGE].sort());
    // The acceleration segment carries NO span — its curb lane is a LEGAL
    // travel lane. This single gap is the whole map.
    expect(hosts).not.toContain(ACCEL_EDGE);
    for (const z of district.zones!) {
      expect(z.kind).toBe("emergencyLane");
      expect(z.signRef).toBe("М2");
      expect(z.fromM).toBe(0);
      expect(z.toM).toBe(district.roads.edges.find((e) => e.id === z.edgeId)!.length);
    }
  });

  it("the ramp is a plain un-tagged връзка: one lane, чл. 21 90, landing on the curb-lane center at the nose", () => {
    const ramp = district.roads.edges.find((e) => e.id === RAMP_EDGE)!;
    expect(ramp.oneway).toBe(true);
    expect(ramp.lanes).toBe(1);
    expect(ramp.maxspeed).toBe(RAMP_KMH);
    expect(ramp.class).toBe("secondary_link");
    // NOT motorway-tagged: building speed from rest here is entering, not
    // crawling on the carriageway (the SP-10 detector must stay disarmed).
    expect(ramp.motorway).toBeUndefined();
    expect(ramp.geometry[ramp.geometry.length - 1]).toEqual([X_CURB, NOSE_Y]);
  });

  it("pins the authored lane centers + story arclengths in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      laneCurbX: number;
      laneCruiseX: number;
      laneLeftX: number;
      lanesPerDirection: number;
      noseY: number;
      taperY: number;
      endY: number;
      accelEdgeId: string;
      rampSpawn: [number, number, number];
    };
    expect(sc.archetype).toBe("merge-lane");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneCurbX).toBe(X_CURB);
    expect(sc.laneCruiseX).toBe(X_CRUISE);
    expect(sc.laneLeftX).toBe(X_LEFT);
    expect(sc.noseY).toBe(NOSE_Y);
    expect(sc.taperY).toBe(TAPER_Y);
    expect(sc.endY).toBe(END_Y);
    expect(sc.accelEdgeId).toBe(ACCEL_EDGE);
    // The spawn the ScenarioSpec/trace scripts pin by value.
    const spawn = district.spawnPoints.find((s) => s.id === "mwe-spawn-ramp")!;
    expect([spawn.x, spawn.y, spawn.heading]).toEqual(sc.rampSpawn);
    expect(spawn.edgeId).toBe(RAMP_EDGE);
    const finish = district.spawnPoints.find((s) => s.id === "mwe-spawn-finish")!;
    expect(finish.x).toBe(X_CRUISE);
    expect(finish.y).toBeGreaterThan(TAPER_Y);
  });

  it("hosts a plain motorway entry: no lights, no stop signs, no zebras, no junctions", () => {
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(world.trafficLights.length).toBe(0);
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
      path.join(process.cwd(), "content", "world", "mw-entry-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "mw-entry-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "mw-entry-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("mw-entry-v1 through the world runtime — the entry context on the tick", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("mw-entry-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers (collinear splits are not junctions)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("THE DATA GAP on the tick: the curb lane is a travel lane between nose and taper, the аварийна лента outside it", () => {
    const at = (y: number): SimTick => {
      const rt = createWorldRuntime(loadRaw("mw-entry-v1"));
      rt.update(1 / 60);
      return rt.sample(sample(X_CURB, y, 0, 90), 1, false);
    };
    const before = at(NOSE_Y - 60);
    expect(before.edgeId).toBe(APPROACH_EDGE);
    expect(before.laneId).toBe(0);
    expect(before.emergencyLaneRight).toBe(true); // хард шолдър — not a travel lane
    const inLane = at(NOSE_Y + 80);
    expect(inLane.edgeId).toBe(ACCEL_EDGE);
    expect(inLane.laneId).toBe(0);
    expect(inLane.laneCount).toBe(3);
    expect(inLane.motorway).toBe(true);
    expect(inLane.maxSpeedKmh).toBe(LIMIT_KMH);
    expect(inLane.emergencyLaneRight).toBeUndefined(); // ЛЕНТА ЗА УСКОРЯВАНЕ
    const after = at(TAPER_Y + 60);
    expect(after.edgeId).toBe(MAIN_EDGE);
    expect(after.laneId).toBe(0);
    expect(after.emergencyLaneRight).toBe(true); // the span resumes at the taper
  });

  it("resolves the merge target and the overtaking lane to laneIds 1/2 on every nb segment", () => {
    for (const [y, edgeId] of [
      [NOSE_Y - 60, APPROACH_EDGE],
      [NOSE_Y + 80, ACCEL_EDGE],
      [TAPER_Y + 60, MAIN_EDGE],
    ] as Array<[number, string]>) {
      const rt = createWorldRuntime(loadRaw("mw-entry-v1"));
      rt.update(1 / 60);
      const cruise = rt.sample(sample(X_CRUISE, y, 0, 110), 1, false);
      expect(cruise.edgeId, edgeId).toBe(edgeId);
      expect(cruise.laneId, edgeId).toBe(1);
      const rt2 = createWorldRuntime(loadRaw("mw-entry-v1"));
      rt2.update(1 / 60);
      const left = rt2.sample(sample(X_LEFT, y, 0, 110), 1, false);
      expect(left.laneId, edgeId).toBe(2);
      expect(left.motorway, edgeId).toBe(true);
    }
  });

  it("the RAMP: its own un-tagged context, handed to the acceleration segment just past the nose", () => {
    const rt = createWorldRuntime(loadRaw("mw-entry-v1"));
    let t = 0;
    const at = (x: number, y: number, h: number): SimTick => {
      t += 0.1;
      rt.update(0.1);
      return rt.sample(sample(x, y, h, 70), t, false);
    };
    // Up the ramp centerline (x = 8.13 + 31.87 × (260 − y)/140).
    let handedOverAtY = Infinity;
    for (let y = 139.5; y <= 300; y += 1) {
      const onRamp = y < NOSE_Y;
      const x = onRamp ? 8.13 + 31.87 * ((NOSE_Y - y) / 140) : X_CURB;
      const tick = at(x, y, onRamp ? 347.18 : 0);
      if (tick.edgeId === ACCEL_EDGE) {
        handedOverAtY = Math.min(handedOverAtY, y);
        break;
      }
      expect(tick.edgeId, `y=${y}`).toBe(RAMP_EDGE);
      expect(tick.maxSpeedKmh, `y=${y}`).toBe(RAMP_KMH);
      // The ramp must never arm the motorway detectors — a driver builds speed
      // from REST here, and the SP-10 flow floor is about the carriageway.
      expect(tick.motorway, `y=${y}`).toBeUndefined();
      expect(tick.emergencyLaneRight, `y=${y}`).toBeUndefined();
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
      // …and the ramp centerline is never mistaken for a wandering lane.
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(3.25);
    }
    // The hand-off lands just past the nose (the trace scripts hold ≤ 70 km/h
    // until here so nothing can grade as speeding on the връзка).
    expect(handedOverAtY).toBeGreaterThan(NOSE_Y);
    expect(handedOverAtY).toBeLessThan(NOSE_Y + 20);
  });

  it("keeps a stable northbound lock at 110 km/h from the nose to the end (never steals across the median)", () => {
    const rt = createWorldRuntime(loadRaw("mw-entry-v1"));
    const step = 3.05; // 110 km/h at 10 Hz
    let t = 0;
    for (let y = TAPER_Y + 5; y <= END_Y - 15; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_CRUISE, y, 0, 110), t, false);
      expect(tick.edgeId, `y=${y}`).toBe(MAIN_EDGE);
      expect(tick.laneId, `y=${y}`).toBe(1);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("mw-entry-v1 — merge adjudication through the real reducer", () => {
  /** Drive north at per-arclength lane/speed profiles (the curve-battery
   *  discipline: dt 0.1 s, y advances by v·dt). */
  const entryDrive = (
    profile: (y: number) => { x: number; kmh: number },
    fromY: number,
    toY: number,
  ): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("mw-entry-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    let y = fromY;
    while (y < toY) {
      const { x, kmh } = profile(y);
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
  const violations = (events: RuleEvent[]) =>
    events.filter((e) => e.kind === "violation").map((e) => e.code);

  it("riding the ACCELERATION lane at flow speed is fully innocent (no span ⇒ no чл. 58 excursion, no keep-right)", () => {
    const events = entryDrive(() => ({ x: X_CURB, kmh: 95 }), NOSE_Y + 5, TAPER_Y - 5);
    expect(violations(events)).toEqual([]);
  });

  it("cruising laneId 1 past the taper is fully innocent (the resumed span exempts keep-right)", () => {
    const events = entryDrive(() => ({ x: X_CRUISE, kmh: 120 }), TAPER_Y + 5, END_Y - 20);
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(true);
  });

  it("THE TAPER'S CONSEQUENCE: never merging — riding the curb lane past the taper — grades exactly EMERGENCY_LANE_DRIVING", () => {
    const events = entryDrive(() => ({ x: X_CURB, kmh: 95 }), TAPER_Y + 5, END_Y - 20);
    expect(violations(events)).toEqual(["EMERGENCY_LANE_DRIVING"]);
  });

  it("the 120 km/h left-lane hog past the taper still grades exactly NOT_KEEPING_RIGHT (OV-11 unharmed)", () => {
    const events = entryDrive(() => ({ x: X_LEFT, kmh: 120 }), TAPER_Y + 5, END_Y - 20);
    expect(violations(events)).toEqual(["NOT_KEEPING_RIGHT"]);
  });

  it("the causeless 40 km/h crawl on the CARRIAGEWAY grades DRIVING_TOO_SLOW_FOR_MOTORWAY (the SP-10 floor is armed)", () => {
    const events = entryDrive(() => ({ x: X_CRUISE, kmh: 40 }), TAPER_Y + 5, TAPER_Y + 200);
    expect(violations(events)).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY"]);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer — the staged mainline car's path must resolve
// ---------------------------------------------------------------------------

describe("mw-entry-v1 through the traffic lane graph + system", () => {
  it("chains the three nb segments into a continuous staged path and keeps the ramp its own lane", () => {
    const raw = loadRaw("mw-entry-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(5); // one per oneway edge (3 nb + sb + ramp)
    expect(graph.crossingLanes.size).toBe(0);
    // The staged mainline car of SC_MERGE_ACCEL_LANE walks nb-start → nose →
    // taper → nb-end: every hop must be lane-graph-connected.
    const hops: Array<[string, string]> = [
      ["mwe-n-nb-start", "mwe-n-nose"],
      ["mwe-n-nose", "mwe-n-taper"],
      ["mwe-n-taper", "mwe-n-nb-end"],
    ];
    for (const [from, to] of hops) {
      const out = graph.nodeOut.get(from) ?? [];
      expect(out.some((li) => graph.lanes[li].toNode === to), `${from} → ${to}`).toBe(true);
    }
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_CRUISE, TAPER_Y, 0)).toBe(Infinity);
  });
});
