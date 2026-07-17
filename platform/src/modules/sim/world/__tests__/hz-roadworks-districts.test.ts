/**
 * ROADWORKS LANE-CLOSURE contract battery (the merge-districts.test.ts /
 * ln-merge pattern) — doc 72 §10 OV-16 „Цип-принцип" in its temporary-
 * signalling frame, staged for sc-merge-roadworks-shift.
 *
 * content/world/hz-roadworks-v1.json (tools/maps/gen_hz_roadworks.mjs) is a
 * one-way 2-lane city street whose curb lane is coned off, SPLIT into three
 * collinear segments at plain degree-2 nodes so the works can carry their own
 * posted 30. The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - THE ARCHETYPE'S WHOLE IDEA — every segment is the SAME 2-lane one-way
 *    carriageway, so the lane centers never move across a joint, and the merge
 *    stays an INTRA-edge laneId delta the shipped adjudicator grades;
 *  - the works segment's 30 is REAL law on the tick (not narration), and it
 *    ends exactly where the site does;
 *  - the SIZING LAWS the authored drives rest on (gen_hz_roadworks.mjs asserts
 *    them at build time; here they are re-proven against the REAL reducer):
 *    the correctly-merged driver is keep-right INNOCENT for the whole site,
 *    and the merge's flip clears the works joint by more than the joint grace;
 *  - THE CONE SET's geometry: the taper really closes the closed lane's
 *    driving line, and no cone can reach the open lane's — the invariant the
 *    shadow's zero-violation gate rests on.
 *
 * HONEST SCOPE (see the generator header, gap 1): the cones are DATA +
 * recorder rects. Nothing in the world builder or the rule engine reads
 * meta.scenario.cones, so this battery asserts their GEOMETRY, and the trace
 * gate (traces/__tests__/sc-merge-roadworks-shift-traces.test.ts) asserts what
 * hitting them grades.
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

/** hz-roadworks-v1 truths (generator params — asserted against the file below). */
const TAPER_FROM_Y = 216;
const TAPER_TO_Y = 240;
const WORKS_FROM_Y = 240;
const WORKS_TO_Y = 276;
const END_Y = 310;
const LIMIT_KMH = 50;
const WORKS_KMH = 30;
const X_CLOSED = 4.06; // laneId 0 — the coned curb lane
const X_OPEN = -4.06; // laneId 1 — the survivor
const APPROACH_EDGE = "hzr-e-approach";
const WORKS_EDGE = "hzr-e-works";
const EXIT_EDGE = "hzr-e-exit";
const EDGE_IDS = [APPROACH_EDGE, WORKS_EDGE, EXIT_EDGE];
/** Hero half-width (vehicle/tuning.ts CHASSIS_HALF_EXTENTS.x) + cone half. */
const HERO_HALF_W = 0.85;
const CONE_HALF_M = 0.3;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_hz_roadworks.mjs) in: ${candidates.join(", ")}`);
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

interface ConeSpec {
  id: string;
  x: number;
  y: number;
}
interface RoadworksScenario {
  archetype: string;
  laneClosedX: number;
  laneOpenX: number;
  lanesPerDirection: number;
  taperFromY: number;
  taperToY: number;
  worksFromY: number;
  worksToY: number;
  endY: number;
  approachEdgeId: string;
  worksEdgeId: string;
  exitEdgeId: string;
  spawnY: number;
  coneHalfM: number;
  coneLineX: number;
  cones: ConeSpec[];
}

describe("hz-roadworks-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("hz-roadworks-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: one 2-lane one-way street split into three collinear segments", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    for (const id of EDGE_IDS) {
      const e = district.roads.edges.find((x) => x.id === id)!;
      expect(e, id).toBeDefined();
      expect(e.oneway, id).toBe(true);
      expect(e.lanes, id).toBe(2);
      expect(e.roundabout, id).toBe(false);
      // Collinear on x = 0 — the whole map is one straight carriageway.
      for (const [x] of e.geometry) expect(x, id).toBe(0);
    }
    const seg = (id: string) => district.roads.edges.find((e) => e.id === id)!;
    expect(seg(APPROACH_EDGE).length).toBe(WORKS_FROM_Y);
    expect(seg(WORKS_EDGE).length).toBe(WORKS_TO_Y - WORKS_FROM_Y);
    expect(seg(EXIT_EDGE).length).toBe(END_Y - WORKS_TO_Y);
    // The joints are plain degree-2 vertices (a data boundary, not a junction).
    for (const nodeId of ["hzr-n-works-start", "hzr-n-works-end"]) {
      const degree = district.roads.edges.filter((e) => e.from === nodeId || e.to === nodeId).length;
      expect(degree, nodeId).toBe(2);
    }
  });

  it("THE TEMPORARY LIMIT: the works segment — and ONLY it — carries the 30", () => {
    const seg = (id: string) => district.roads.edges.find((e) => e.id === id)!;
    expect(seg(WORKS_EDGE).maxspeed).toBe(WORKS_KMH);
    expect(seg(WORKS_EDGE).maxspeedSource).toBe("tag");
    for (const id of [APPROACH_EDGE, EXIT_EDGE]) expect(seg(id).maxspeed, id).toBe(LIMIT_KMH);
  });

  it("carries NO zone spans — the keep-right budget is the map's answer, not an exempting span", () => {
    // An emergencyLane/busLane span would make laneId 1 the rightmost REQUIRED
    // lane and solve keep-right for free — at the price of dragging its own
    // code (EMERGENCY_LANE_DRIVING / bus lane) into the cone demo, whose whole
    // point is that the cones and the line are the consequence. The generator
    // sizes the street instead; this is that ruling, pinned.
    expect(district.zones ?? []).toEqual([]);
  });

  it("hosts a plain works street: no lights, no stop signs, no zebras, no junctions", () => {
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("pins the authored lane centers + story arclengths in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as unknown as RoadworksScenario;
    expect(sc.archetype).toBe("merge-lane");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneClosedX).toBe(X_CLOSED);
    expect(sc.laneOpenX).toBe(X_OPEN);
    expect(sc.taperFromY).toBe(TAPER_FROM_Y);
    expect(sc.taperToY).toBe(TAPER_TO_Y);
    expect(sc.worksFromY).toBe(WORKS_FROM_Y);
    expect(sc.worksToY).toBe(WORKS_TO_Y);
    expect(sc.endY).toBe(END_Y);
    expect(sc.approachEdgeId).toBe(APPROACH_EDGE);
    expect(sc.worksEdgeId).toBe(WORKS_EDGE);
    expect(sc.exitEdgeId).toBe(EXIT_EDGE);
    // The taper closes the lane exactly where the site begins.
    expect(sc.taperToY).toBe(sc.worksFromY);
    // The spawns the ScenarioSpec/trace scripts pin by value.
    const start = district.spawnPoints.find((s) => s.id === "hzr-spawn-closed-lane")!;
    expect([start.x, start.y, start.heading]).toEqual([X_CLOSED, sc.spawnY, 0]);
    expect(start.edgeId).toBe(APPROACH_EDGE);
    const finish = district.spawnPoints.find((s) => s.id === "hzr-spawn-finish")!;
    expect(finish.x).toBe(X_OPEN);
    expect(finish.y).toBeGreaterThan(WORKS_TO_Y);
  });

  it("THE CONE SET: the taper closes the closed lane, and NO cone can reach the open lane's driving line", () => {
    const sc = district.meta.scenario as unknown as RoadworksScenario;
    expect(sc.coneHalfM).toBe(CONE_HALF_M);
    expect(sc.cones.length).toBe(10);
    const taper = sc.cones.filter((c) => c.id.includes("-cone-taper-"));
    const works = sc.cones.filter((c) => c.id.includes("-cone-works-"));
    expect(taper.length).toBe(5);
    expect(works.length).toBe(5);
    // The taper spans the authored arc and walks from the curb to the line.
    expect(taper[0].y).toBe(TAPER_FROM_Y);
    expect(taper[taper.length - 1].y).toBe(TAPER_TO_Y);
    expect(taper[taper.length - 1].x).toBe(sc.coneLineX);
    for (let i = 1; i < taper.length; i++) {
      expect(taper[i].x, taper[i].id).toBeLessThan(taper[i - 1].x);
      expect(taper[i].y, taper[i].id).toBeGreaterThan(taper[i - 1].y);
    }
    // It really CLOSES lane 0: the taper begins curb-side of the closed lane's
    // driving line, so a car holding that line must meet a cone…
    expect(taper[0].x).toBeGreaterThan(X_CLOSED + HERO_HALF_W);
    // …and the boundary line lives INSIDE the closed lane.
    expect(sc.coneLineX).toBeGreaterThan(0);
    expect(sc.coneLineX).toBeLessThan(X_CLOSED);
    for (const c of works) {
      expect(c.x, c.id).toBe(sc.coneLineX);
      expect(c.y, c.id).toBeGreaterThan(WORKS_FROM_Y);
      expect(c.y, c.id).toBeLessThan(WORKS_TO_Y);
    }
    // THE SHADOW'S INNOCENCE INVARIANT: every cone stays more than a metre off
    // the open lane's driving line, so the taught drive can never clip one.
    for (const c of sc.cones) {
      const clearance = Math.abs(c.x - X_OPEN) - CONE_HALF_M - HERO_HALF_W;
      expect(clearance, c.id).toBeGreaterThan(1);
    }
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
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
    expect(buildWorldGeometry(district, { seed: 7 }).stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "hz-roadworks-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "hz-roadworks-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "hz-roadworks-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("hz-roadworks-v1 through the world runtime — the closure context on the tick", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("hz-roadworks-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers (collinear splits are not junctions)", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("THE LANE TRUTH: the same two lane centers resolve to laneIds 0/1 on EVERY segment (no hand-off)", () => {
    for (const [y, edgeId] of [
      [120, APPROACH_EDGE],
      [WORKS_FROM_Y + 18, WORKS_EDGE],
      [WORKS_TO_Y + 16, EXIT_EDGE],
    ] as Array<[number, string]>) {
      const rtClosed = createWorldRuntime(loadRaw("hz-roadworks-v1"));
      rtClosed.update(1 / 60);
      const closed = rtClosed.sample(sample(X_CLOSED, y, 0, 30), 1, false);
      expect(closed.edgeId, edgeId).toBe(edgeId);
      expect(closed.laneId, edgeId).toBe(0);
      expect(closed.laneCount, edgeId).toBe(2);
      expect(Math.abs(closed.laneOffsetM), edgeId).toBeLessThan(0.6);

      const rtOpen = createWorldRuntime(loadRaw("hz-roadworks-v1"));
      rtOpen.update(1 / 60);
      const open = rtOpen.sample(sample(X_OPEN, y, 0, 30), 1, false);
      expect(open.edgeId, edgeId).toBe(edgeId);
      expect(open.laneId, edgeId).toBe(1);
      expect(Math.abs(open.laneOffsetM), edgeId).toBeLessThan(0.6);
      expect(open.wrongWay, edgeId).not.toBe(true);
    }
  });

  it("THE TEMPORARY LIMIT reaches the tick: 30 inside the site, 50 on either side of it", () => {
    const at = (y: number): SimTick => {
      const rt = createWorldRuntime(loadRaw("hz-roadworks-v1"));
      rt.update(1 / 60);
      return rt.sample(sample(X_OPEN, y, 0, 28), 1, false);
    };
    expect(at(WORKS_FROM_Y - 40).maxSpeedKmh).toBe(LIMIT_KMH);
    expect(at(WORKS_FROM_Y + 6).maxSpeedKmh).toBe(WORKS_KMH);
    expect(at(WORKS_TO_Y - 6).maxSpeedKmh).toBe(WORKS_KMH);
    expect(at(WORKS_TO_Y + 12).maxSpeedKmh).toBe(LIMIT_KMH);
    // Nothing here is a motorway or an emergency lane — those detectors stay
    // disarmed on every segment.
    for (const y of [120, WORKS_FROM_Y + 18, WORKS_TO_Y + 16]) {
      expect(at(y).motorway, `y=${y}`).toBeUndefined();
      expect(at(y).emergencyLaneRight, `y=${y}`).toBeUndefined();
      expect(at(y).busLaneRight, `y=${y}`).toBeUndefined();
    }
  });

  it("keeps a stable lock along the open lane from the taper to the end (never steals across the joints)", () => {
    const rt = createWorldRuntime(loadRaw("hz-roadworks-v1"));
    const step = 0.78; // 28 km/h at 10 Hz
    let t = 0;
    for (let y = TAPER_TO_Y - 10; y <= END_Y - 12; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_OPEN, y, 0, 28), t, false);
      expect(EDGE_IDS, `y=${y}`).toContain(tick.edgeId);
      expect(tick.laneId, `y=${y}`).toBe(1);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
    }
  });

  it("THE STRADDLE the cone demo depends on: riding the boundary line reads far off-centre", () => {
    // „Провиране" threads the car between the cone line and the open lane. The
    // locator must report that as a real off-centre position (beyond the 3.25 m
    // laneKeepMaxOffsetM), or POOR_LANE_KEEPING could never grade the demo.
    const rt = createWorldRuntime(loadRaw("hz-roadworks-v1"));
    rt.update(1 / 60);
    const tick = rt.sample(sample(-0.25, WORKS_FROM_Y + 18, 0, 28), 1, false);
    expect(tick.edgeId).toBe(WORKS_EDGE);
    expect(Math.abs(tick.laneOffsetM)).toBeGreaterThan(1.3 * 2.5);
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("hz-roadworks-v1 — the closure adjudicated through the real reducer", () => {
  /** Drive north at per-arclength lane/speed profiles (the merge-districts
   *  discipline: dt 0.1 s, y advances by v·dt). */
  const drive = (
    profile: (y: number) => { x: number; kmh: number },
    fromY: number,
    toY: number,
  ): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("hz-roadworks-v1"));
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

  it("THE MAP'S SIZING LAW: the correctly-merged driver rides the open lane through the whole site INNOCENT", () => {
    // This is the false positive the street's length exists to prevent: on a
    // span-less 2-lane one-way, laneId 1 is a keep-right candidate, and a
    // driver doing exactly what the closure demands would collect
    // NOT_KEEPING_RIGHT after 12 s. gen_hz_roadworks.mjs sizes the geometry so
    // no authored pace can reach it — re-proven here against the real reducer,
    // from the earliest authored flip to the finish.
    const events = drive(
      (y) => ({ x: X_OPEN, kmh: y < WORKS_FROM_Y ? 35 : y < WORKS_TO_Y ? 28 : 42 }),
      213,
      294,
    );
    expect(violations(events)).toEqual([]);
  });

  it("the works' 30 has TEETH: carrying the street's 50 through the site grades SPEEDING", () => {
    // 38 km/h clears the 10% grace on 30 (33) without reaching the +10
    // dangerous band (40) — the second-degree фиш, exactly as posted.
    const events = drive(() => ({ x: X_OPEN, kmh: 38 }), WORKS_FROM_Y + 2, WORKS_TO_Y - 2);
    expect(violations(events)).toContain("SPEEDING_OVER_LIMIT");
    expect(violations(events)).not.toContain("SPEEDING_DANGEROUS");
  });

  it("…and the same 38 km/h on the APPROACH is innocent — the limit is the site's, not the street's", () => {
    const events = drive(() => ({ x: X_CLOSED, kmh: 38 }), 20, 200);
    expect(violations(events)).toEqual([]);
  });

  it("THE CONE DEMO'S OTHER HALF: threading the boundary line grades POOR_LANE_KEEPING (no cone needed)", () => {
    // The cones supply the COLLISION; the line supplies this. Proving it here
    // — with no obstacle rects in play at all — is what makes the trace gate's
    // two-code assert honest rather than a coincidence of the demo's pacing.
    const events = drive(() => ({ x: -0.25, kmh: 28 }), WORKS_FROM_Y + 2, WORKS_TO_Y - 2);
    expect(violations(events)).toContain("POOR_LANE_KEEPING");
    // A one-way street can never grade the two-way center-line codes.
    expect(violations(events)).not.toContain("CENTER_LINE_TOUCHED");
    expect(violations(events)).not.toContain("CROSSED_SOLID_LINE");
    expect(violations(events)).not.toContain("WRONG_WAY");
  });

  it("riding the CLOSED lane's line to the taper is innocent to the engine — the cones are the only consequence", () => {
    // Honest scope, pinned (generator gap 1): nothing in the rule engine knows
    // the curb lane is coned. Until the LessonScene cone seam lands, a live
    // student who holds the closed lane meets no contact — only the objective
    // gate and, once he threads the line, POOR_LANE_KEEPING. The trace gate is
    // where the cone contact is proven, because only the recorder stages them.
    const events = drive(() => ({ x: X_CLOSED, kmh: 40 }), 20, TAPER_FROM_Y);
    expect(violations(events)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer — the staged through-lane car's path must resolve
// ---------------------------------------------------------------------------

describe("hz-roadworks-v1 through the traffic lane graph + system", () => {
  it("chains the three segments into a continuous staged path", () => {
    const raw = loadRaw("hz-roadworks-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(3); // one per oneway edge
    expect(graph.crossingLanes.size).toBe(0);
    // The staged through-lane car of SC_MERGE_ROADWORKS_SHIFT walks start →
    // works-start → works-end → end: every hop must be lane-graph-connected.
    const hops: Array<[string, string]> = [
      ["hzr-n-start", "hzr-n-works-start"],
      ["hzr-n-works-start", "hzr-n-works-end"],
      ["hzr-n-works-end", "hzr-n-end"],
    ];
    for (const [from, to] of hops) {
      const out = graph.nodeOut.get(from) ?? [];
      expect(out.some((li) => graph.lanes[li].toNode === to), `${from} → ${to}`).toBe(true);
    }
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_OPEN, WORKS_FROM_Y, 0)).toBe(Infinity);
  });
});
