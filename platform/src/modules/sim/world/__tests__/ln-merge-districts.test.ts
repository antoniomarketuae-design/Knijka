/**
 * LANE-DROP archetype contract battery (the merge-districts.test.ts pattern) —
 * doc 72 §10 OV-16 „Цип-принцип / Zipper merge at a lane drop" + OV-01/OV-02.
 *
 * content/world/ln-merge-v1.json (tools/maps/gen_ln_merge.mjs) is the second
 * "merge-lane" micro-map and the first LANE-DROP one: a ONE-WAY 2-lane city
 * street, authored as a SINGLE edge, whose right (curb) lane tapers out over
 * 60 m. The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - THE ARCHETYPE'S WHOLE IDEA — one edge, two lanes, so the merge the drill
 *    teaches is an INTRA-edge laneId 0 → 1 delta the shipped lane-change
 *    adjudicator grades. Cross-edge deltas never grade and deltas near a joint
 *    are dropped (rules/engine.ts C1 revision), so the absence of a second
 *    edge is a load-bearing design choice, not an omission;
 *  - THE OBJECTIVE GATE has teeth: the through-lane center is a full 8.125 m
 *    lane pitch from the ending-lane center, so a reachZone of radius 3.5 on
 *    it is unsatisfiable from the lane that dies;
 *  - THE KEEP-RIGHT BUDGET (the map's sizing law): the correctly-merged driver
 *    riding laneId 1 from the taper to the end of the street is INNOCENT at
 *    the authored pace — and the counter-proof pins WHY the street is only
 *    280 m long (the doc-72 OV-16 lane-drop zone does not exist, so the engine
 *    cannot know the curb lane is dying; hold laneId 1 for 12 s and it grades
 *    NOT_KEEPING_RIGHT). That residual is the archetype's honest capability
 *    gap; the map answers it structurally, by being short.
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
import { LANE_WIDTH_M } from "../builders/constants";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** ln-merge-v1 truths (generator params — asserted against the file below). */
const TAPER_FROM_Y = 180;
const TAPER_TO_Y = 240;
const END_Y = 280;
const SPAWN_Y = 12;
const LIMIT_KMH = 50;
const X_ENDING = 4.06; // laneId 0 — the curb lane the drill starts in; it dies
const X_THROUGH = -4.06; // laneId 1 — the survivor
const STREET_EDGE = "lnm-e-street";
/** The reachZone radius the ScenarioSpec's merge gate uses. */
const GATE_RADIUS_M = 3.5;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ln_merge.mjs) in: ${candidates.join(", ")}`);
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

describe("ln-merge-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("ln-merge-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: ONE oneway 2-lane street on x = 0", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    // THE ARCHETYPE'S SHAPE: exactly one edge — the merge must be intra-edge.
    expect(district.roads.edges.length).toBe(1);
    const street = district.roads.edges[0];
    expect(street.id).toBe(STREET_EDGE);
    expect(street.oneway).toBe(true);
    expect(street.lanes).toBe(2);
    expect(street.maxspeed).toBe(LIMIT_KMH);
    expect(street.length).toBe(END_Y);
    for (const [x] of street.geometry) expect(x).toBe(0);
    // Nothing on this street may excuse a stop or arm a junction tracker.
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
    expect(district.zones ?? []).toHaveLength(0);
  });

  it("pins the lane truth + the taper's arclengths in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      lanesPerDirection: number;
      laneEndingX: number;
      laneThroughX: number;
      taperFromY: number;
      taperToY: number;
      endY: number;
      streetEdgeId: string;
      spawnY: number;
      params: { lanesBefore: number; lanesAfter: number; taperM: number };
    };
    expect(sc.archetype).toBe("merge-lane");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneEndingX).toBe(X_ENDING);
    expect(sc.laneThroughX).toBe(X_THROUGH);
    expect(sc.taperFromY).toBe(TAPER_FROM_Y);
    expect(sc.taperToY).toBe(TAPER_TO_Y);
    expect(sc.endY).toBe(END_Y);
    expect(sc.spawnY).toBe(SPAWN_Y);
    expect(sc.streetEdgeId).toBe(STREET_EDGE);
    // The taper is the brief's „~60 m", and the drop is 2 → 1.
    expect(sc.params.taperM).toBe(TAPER_TO_Y - TAPER_FROM_Y);
    expect([sc.params.lanesBefore, sc.params.lanesAfter]).toEqual([2, 1]);
  });

  it("spawns the drill IN the dying lane and pins the through-lane references", () => {
    const spawn = district.spawnPoints.find((s) => s.id === "lnm-spawn-ending-lane")!;
    expect([spawn.x, spawn.y, spawn.heading]).toEqual([X_ENDING, SPAWN_Y, 0]);
    expect(spawn.edgeId).toBe(STREET_EDGE);
    const finish = district.spawnPoints.find((s) => s.id === "lnm-spawn-finish")!;
    expect(finish.x).toBe(X_THROUGH);
    expect(finish.y).toBeGreaterThan(TAPER_TO_Y);
    expect(finish.y).toBeLessThan(END_Y);
  });

  it("THE GATE HAS TEETH: the merge reachZone radius cannot be reached from the lane that dies", () => {
    // The ScenarioSpec's gate sits on the through-lane center just short of
    // the taper's end. A car still riding the ending lane is one full lane
    // pitch away — the gate is geometrically unsatisfiable for it.
    const lanePitchM = X_ENDING - X_THROUGH;
    expect(lanePitchM).toBeCloseTo(8.125, 1);
    expect(GATE_RADIUS_M).toBeLessThan(lanePitchM / 2);
  });

  it("hosts a plain street: no lights, no stop signs, no zebras, no junctions", () => {
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  /**
   * THE LANE HAS TO END WHERE A STUDENT CAN SEE IT — sc-merge-lane-end:ae6166e2,
   * major: „the lesson's own event never happens: the lane does not end. Across
   * the whole pc-right sequence the carriageway keeps its width — no taper, no
   * chevrons, no lane-ends sign, no merge arrow on the tarmac."
   *
   * The COPY half was closed in `traces/scMergeLaneEnd.ts` (W16) by making the
   * demo captions stop naming furniture the world does not draw. Its own note
   * ends „WHAT THIS DOES NOT CLOSE … the WORLD half. A student still sees no
   * taper", and this is what says he does. Read off the MESH, not off a
   * counter: `markings.ts`'s own paint-truth census records at length why a
   * booking is not paint.
   *
   * The SIGN half stays open and is not asserted here: the А-group „пътно
   * стеснение" plate has no face in the kit and no row in
   * content/signs/signs.json, so there is no SignKind to place and writing a
   * law citation for one is what ADR-002 forbids.
   */
  it("DRAWS the lane ending: a closing line that crosses the dying lane over the authored taper", () => {
    // District space out of the markings buffer: toWorld(x, y, h) = [x, h, −y].
    const p = world.markings.positions;
    const at: Array<{ x: number; y: number }> = [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      at.push({ x: p[i] as number, y: -(p[i + 2] as number) });
    }
    expect(at.length).toBeGreaterThan(0);

    /** The closing line's own x at world `y`, taken as the mean of the paint
     *  standing there on the DYING side of the carriageway. */
    const closingXAt = (y: number): number | null => {
      const near = at.filter((v) => Math.abs(v.y - y) < 0.05 && v.x > -1);
      if (near.length === 0) return null;
      return near.reduce((s, v) => s + v.x, 0) / near.length;
    };

    // At the start of the taper the line stands ON the kerb-side М1 edge line;
    // at the end it has reached the boundary between the two lanes, i.e. the
    // street's own axis. This street is a "primary", so it carries a curbside
    // parking band and its М1 sits ON the travel/parking boundary at the travel
    // half width (two 8.125 m lanes → 8.125), not inset from a curb.
    const head = closingXAt(TAPER_FROM_Y);
    const tail = closingXAt(TAPER_TO_Y);
    expect(head, `no paint at the taper's start (y = ${TAPER_FROM_Y})`).not.toBeNull();
    expect(tail, `no paint at the taper's end (y = ${TAPER_TO_Y})`).not.toBeNull();
    expect(head as number).toBeCloseTo(LANE_WIDTH_M, 2);
    expect(Math.abs(tail as number)).toBeLessThan(0.2);

    // …and it closes MONOTONICALLY across the whole 60 m, which is what makes it
    // readable as a narrowing from the seat rather than as two unrelated lines.
    let previous = Infinity;
    for (let y = TAPER_FROM_Y; y <= TAPER_TO_Y; y += 5) {
      const x = closingXAt(y);
      expect(x, `no closing paint at y = ${y}`).not.toBeNull();
      expect(x as number).toBeLessThan(previous + 1e-6);
      previous = x as number;
    }

    // THE HATCH: oblique bars inside the wedge the line closes, so the dead
    // lane reads as dead. Counted as paint standing strictly between the
    // closing line and the edge line, at a y no boundary of this street has.
    const wedge = at.filter(
      (v) => v.y > TAPER_FROM_Y + 2 && v.y < TAPER_TO_Y && v.x > 0.5 && v.x < LANE_WIDTH_M - 0.4,
    );
    expect(wedge.length).toBeGreaterThan(8);
  });

  it("stops dashing the boundary the taper turns into a carriageway edge", () => {
    // Past the taper the dying lane's inner boundary IS the road's edge. A
    // BROKEN line there invites the lane change into a lane that no longer
    // exists — the same crime `markings.ts` records against a dashed осева over
    // a В24 span. So the paint at x ≈ 0 past TAPER_TO_Y must be continuous.
    const p = world.markings.positions;
    const onAxis: number[] = [];
    for (let i = 0; i + 2 < p.length; i += 3) {
      const x = p[i] as number;
      const y = -(p[i + 2] as number);
      if (Math.abs(x) < 0.2 && y > TAPER_TO_Y + 1 && y < END_Y - 1) onAxis.push(y);
    }
    onAxis.sort((a, b) => a - b);
    expect(onAxis.length).toBeGreaterThan(4);
    // A dashed line leaves DASH_GAP_M (8 m) of bare road between strokes; the
    // solid replacement is sampled every 5 m, so no gap may exceed that pitch
    // by more than a rounding.
    for (let i = 1; i < onAxis.length; i++) {
      expect(
        (onAxis[i] as number) - (onAxis[i - 1] as number),
        `a ${((onAxis[i] as number) - (onAxis[i - 1] as number)).toFixed(1)} m gap at y = ${onAxis[i]}`,
      ).toBeLessThan(5.5);
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
    expect(world.stats.staticDrawSlots).toBeLessThanOrEqual(150);
    expect(world.stats.triangles).toBeLessThan(300_000);
    expect(buildWorldGeometry(district, { seed: 7 }).stats).toEqual(world.stats);
  });

  it("the published copy is byte-identical to the content source", () => {
    const srcCandidates = [
      path.join(process.cwd(), "content", "world", "ln-merge-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ln-merge-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ln-merge-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ln-merge-v1 through the world runtime — the lane-drop context on the tick", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("ln-merge-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the two lanes the drill is about, on ONE edge, over the whole street", () => {
    const at = (x: number, y: number): SimTick => {
      const rt = createWorldRuntime(loadRaw("ln-merge-v1"));
      rt.update(1 / 60);
      return rt.sample(sample(x, y, 0, 45), 1, false);
    };
    for (const y of [SPAWN_Y, TAPER_FROM_Y, TAPER_TO_Y, END_Y - 10]) {
      const ending = at(X_ENDING, y);
      expect(ending.edgeId, `ending y=${y}`).toBe(STREET_EDGE);
      expect(ending.laneId, `ending y=${y}`).toBe(0);
      expect(ending.laneCount, `ending y=${y}`).toBe(2);
      expect(ending.oneway, `ending y=${y}`).toBe(true);
      expect(ending.maxSpeedKmh, `ending y=${y}`).toBe(LIMIT_KMH);
      expect(Math.abs(ending.laneOffsetM), `ending y=${y}`).toBeLessThan(0.2);
      // No span exists on this map — the curb lane is a plain travel lane.
      expect(ending.emergencyLaneRight, `ending y=${y}`).toBeUndefined();
      expect(ending.busLaneRight, `ending y=${y}`).toBeUndefined();

      const through = at(X_THROUGH, y);
      expect(through.laneId, `through y=${y}`).toBe(1);
      expect(Math.abs(through.laneOffsetM), `through y=${y}`).toBeLessThan(0.2);
      expect(through.wrongWay, `through y=${y}`).not.toBe(true);
    }
  });

  it("keeps a stable lock along the ending lane at the authored pace (no phantom lane wander)", () => {
    const rt = createWorldRuntime(loadRaw("ln-merge-v1"));
    const step = 1.25; // 45 km/h at 10 Hz
    let t = 0;
    for (let y = SPAWN_Y; y <= TAPER_TO_Y; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_ENDING, y, 0, 45), t, false);
      expect(tick.edgeId, `y=${y}`).toBe(STREET_EDGE);
      expect(tick.laneId, `y=${y}`).toBe(0);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("ln-merge-v1 — the lane drop through the real reducer", () => {
  /** Drive north at per-arclength lane/speed profiles (the merge-districts
   *  discipline: dt 0.1 s, y advances by v·dt). */
  const dropDrive = (
    profile: (y: number) => { x: number; kmh: number },
    fromY: number,
    toY: number,
  ): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("ln-merge-v1"));
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

  it("riding the ENDING lane down the approach is fully innocent (it is the rightmost lane)", () => {
    const events = dropDrive(() => ({ x: X_ENDING, kmh: 45 }), SPAWN_Y, TAPER_FROM_Y);
    expect(violations(events)).toEqual([]);
  });

  it("THE MAP'S SIZING LAW: the merged driver holds laneId 1 from the taper to the end — innocent", () => {
    // 100 m at the authored 45 km/h = 8 s: inside keepRightSustainSec (12 s)
    // by design. gen_ln_merge asserts this budget at BUILD time.
    const events = dropDrive(() => ({ x: X_THROUGH, kmh: 45 }), TAPER_FROM_Y, END_Y - 5);
    expect(violations(events)).toEqual([]);
  });

  it("THE HONEST GAP (doc 72 OV-16 🔴): the engine cannot know the curb lane dies — 12 s in laneId 1 grades NOT_KEEPING_RIGHT", () => {
    // The counter-proof that pins WHY the street is short: no lane-drop zone
    // kind exists, so rightmostRequiredLane stays 0 and a long dawdle in the
    // survivor lane convicts a driver doing exactly what the drop demands.
    // 270 m at 45 km/h ≈ 21 s — past the sustain window.
    const events = dropDrive(() => ({ x: X_THROUGH, kmh: 45 }), 5, END_Y - 3);
    expect(violations(events)).toEqual(["NOT_KEEPING_RIGHT"]);
  });

  it("the авторед merge line is a lane change, not a swerve: the 34 m commit never grades POOR_LANE_KEEPING", () => {
    // The exact lateral profile traces/scMergeLaneEnd.ts drives, replayed
    // through the reducer: 8.125 m of lateral over 34 m of arc at 35 km/h.
    const FROM_Y = 182;
    const RUN_M = 34;
    const events = dropDrive(
      (y) => {
        const s = Math.max(0, Math.min(1, (y - FROM_Y) / RUN_M));
        return { x: X_ENDING + (X_THROUGH - X_ENDING) * s, kmh: 35 };
      },
      160,
      END_Y - 5,
    );
    expect(violations(events)).not.toContain("POOR_LANE_KEEPING");
    expect(violations(events)).not.toContain("CENTER_LINE_TOUCHED");
    expect(violations(events)).not.toContain("NOT_KEEPING_RIGHT");
    // …and the merge really is graded as a lane change (no indicator/mirror
    // here, so the shipped adjudicator convicts — the mistake demos' engine).
    expect(violations(events)).toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(violations(events)).toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });
});

// ---------------------------------------------------------------------------
// Traffic layer — the staged through-lane car's path must resolve
// ---------------------------------------------------------------------------

describe("ln-merge-v1 through the traffic lane graph + system", () => {
  it("carries one lane whose graph offset is the ENDING lane (the staged car shifts one lane left of it)", () => {
    const raw = loadRaw("ln-merge-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(1); // one oneway edge
    expect(graph.crossingLanes.size).toBe(0);
    // The staged through-lane car of SC_MERGE_LANE_END walks start → end.
    const out = graph.nodeOut.get("lnm-n-start") ?? [];
    expect(out.some((li) => graph.lanes[li].toNode === "lnm-n-end")).toBe(true);
    // buildLaneGraph puts a oneway edge's lane ((lanes-1)/2 × W right of the
    // centerline) on the ENDING lane — which is why the ScenarioSpec arms the
    // actor with extraRightOffsetM = −one lane pitch to reach the THROUGH one.
    const lane = graph.lanes[out[0]];
    expect(lane.px[0]).toBeCloseTo(X_ENDING, 1);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_ENDING, SPAWN_Y, 0)).toBe(Infinity);
  });
});
