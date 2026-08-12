/**
 * pk-double-v1 contract battery (the pk-busstop-districts.test.ts pattern) —
 * the DOUBLE-PARKING map behind sc-pk-double-park (PK-06, ЗДвП чл. 98, ал. 1).
 *
 * pk-ban-v1 bans by a PLATE. pk-banx-v1 bans by GEOMETRY (the zebra, the
 * corner). pk-busstop-v1 bans by the ЗИГЗАГ. pk-ban2-v1 bans by TWO plates.
 * This map bans by THE OTHER CARS: there is nothing to read at all — the ban
 * exists because the curb beside you is already full, and it ends the metre the
 * row does. The battery proves the file earns that claim:
 *  - the TOTAL FP-armor precondition, inherited: ZERO intersections and ZERO
 *    crossings, so no stop line derives and CrossingZoneTracker can never arm —
 *    a rest inside the span is the authored fault and nothing else;
 *  - THE BAN IS THE ROW: the span opens and closes within a few metres of the
 *    first and last parked car, so nothing is banned where nothing is parked;
 *  - the map's own new hazard, disproved: fourteen parked cars beside a resting
 *    hero do NOT read as a queue lead (bays are colliders, not traffic), so the
 *    row cannot acquit the rest it causes — while a REAL lead at 6 m still does;
 *  - the row is hittable but not in the way: precise colliders that clear a
 *    hero cruising at lane center, which is what makes „мини покрай тях" and
 *    „спри до тях" two different acts rather than one.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { scenarioBaysOf } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "pk-double-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const ROW_FROM_Y = 75;
const ROW_TO_Y = 205;
const BAN_FROM_Y = 70;
const BAN_TO_Y = 210;
const BAY_Y = 290;
/** |x| of both parked rows. */
const ROW_X = 6.8;
/** Where the two mistake demos rest — both second-line, at different marks. */
const REST_SECOND_LINE_Y = 130;
const REST_SQUEEZE_Y = 175;

/** The recorder's parked-car collider half-extents (traces/scParkPerpRev.ts)
 *  and the hero's own half-width (vehicle/tuning CHASSIS_HALF_EXTENTS.x) — the
 *  numbers the clearance claim below is actually checked against. */
const PARKED_HALF_W_M = 0.9;
const HERO_HALF_W_M = 0.85;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pk_double.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying ONE чл. 98 second-line span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.meta.zonesVersion).toBe(1);
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    for (const e of district.roads.edges) {
      // The no-stop-line law: an arterial rank here would post a stop line and
      // silently acquit every graded rest (buildStopLines).
      expect(e.class, e.id).toBe("residential");
      expect(e.lanes, e.id).toBe(2);
      expect(e.oneway, e.id).toBe(false);
      expect(e.maxspeed, e.id).toBe(50);
    }
    // ONE span, because there is one row: the ban is a RELATION to the parked
    // cars, not a place — it cannot be authored in pieces.
    expect(district.zones).toHaveLength(1);
    const [ban] = district.zones!;
    expect(ban.id).toBe("pkd-z-second-line");
    // В28 (noParking) would grade NOTHING — престоят под В28 е разрешен.
    expect(ban.kind).toBe("noStopping");
    expect(ban.edgeId).toBe("pkd-e-street");
    // The street is ONE edge on x = 0, so arclength EQUALS district y.
    expect(ban.fromM).toBe(BAN_FROM_Y);
    expect(ban.toM).toBe(BAN_TO_Y);
  });

  it("carries ZERO junction furniture — the TOTAL FP-armor precondition, as data", () => {
    // Inherited from pk-busstop-v1, and load-bearing for the same reason: a
    // crossing anywhere would arm CrossingZoneTracker within ~35 m and acquit a
    // rest as a possibly-lawful yielding stop (`s.crossing === null` is a hard
    // precondition of ILLEGAL_STOP_IN_BAN_ZONE); an intersection would feed
    // buildStopLines. Neither exists, so neither can.
    expect(district.intersections).toHaveLength(0);
    expect(district.crossings).toHaveLength(0);
    expect(district.roundabouts).toHaveLength(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("THE BAN IS THE ROW: the span opens and closes with the parked cars", () => {
    // The map's thesis. Authored wider, it would ban stopping where nothing is
    // parked (a fiction); authored narrower, a rest beside the last parked car
    // would acquit. Margins exist only so the ban does not end on a bumper.
    const occupied = scenarioBaysOf(loadRaw(ID)).filter((b) => b.occupied);
    const ys = occupied.map((b) => b.y);
    expect(Math.min(...ys)).toBe(ROW_FROM_Y);
    expect(Math.max(...ys)).toBe(ROW_TO_Y);
    expect(Math.min(...ys) - BAN_FROM_Y).toBeLessThanOrEqual(10);
    expect(BAN_TO_Y - Math.max(...ys)).toBeLessThanOrEqual(10);
    for (const b of occupied) {
      expect(b.y, b.id).toBeGreaterThanOrEqual(BAN_FROM_Y);
      expect(b.y, b.id).toBeLessThanOrEqual(BAN_TO_Y);
    }
  });

  it("lines BOTH curbs — the narrow street is what makes a double-parker fatal, not rude", () => {
    const bays = scenarioBaysOf(loadRaw(ID));
    const east = bays.filter((b) => b.occupied && b.x > 0);
    const west = bays.filter((b) => b.occupied && b.x < 0);
    expect(east.length).toBe(14);
    expect(west.length).toBe(13);
    for (const b of [...east, ...west]) {
      expect(Math.abs(b.x), b.id).toBe(ROW_X);
      expect(b.headingDeg, b.id).toBe(0); // parallel to the street
    }
    // One curb makes an obstacle; two curbs make a single shared passage — the
    // oncoming has nowhere to be but the stopper's half. That is the template.
    expect(west.length).toBeGreaterThan(10);
  });

  it("the row is hittable but not in the way (precise colliders that clear a cruising hero)", () => {
    // Occupied bays become precise parked cars — ScenarioObstacles in the scene,
    // ObstacleRect2D in the recorder. If they overlapped the travel lane, every
    // drive would grade a COLLISION and „мини покрай тях" would be impossible;
    // if they were decoration, „спри до тях" would cost nothing to demonstrate.
    for (const b of scenarioBaysOf(loadRaw(ID)).filter((x) => x.occupied)) {
      const clearance = Math.abs(b.x) - PARKED_HALF_W_M - (LANE + HERO_HALF_W_M);
      expect(clearance, b.id).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("exactly ONE free bay, past the ban, on the driver's own curb — the drill's answer", () => {
    const free = scenarioBaysOf(loadRaw(ID)).filter((b) => !b.occupied);
    expect(free).toHaveLength(1);
    expect(free[0].id).toBe("pkd-bay-free");
    expect(free[0].y).toBe(BAY_Y);
    expect(free[0].x).toBe(ROW_X);
    // The backlog's contract: 80 m past the ban.
    expect(free[0].y - BAN_TO_Y).toBe(80);
    // Nothing is parked where the hero parks.
    for (const b of scenarioBaysOf(loadRaw(ID)).filter((x) => x.occupied && x.x > 0)) {
      expect(Math.abs(b.y - BAY_Y), b.id).toBeGreaterThan(4.5);
    }
  });

  it("meta.scenario mirrors the committed geometry (the ScenarioSpec's single truth)", () => {
    const s = district.meta.scenario as {
      archetype: string;
      laneCenterRightM: number;
      laneCenterOncomingM: number;
      params: {
        rowFromM: number;
        rowToM: number;
        banFromM: number;
        banToM: number;
        legalBayY: number;
        banBasis: string;
      };
      parkedRowY: { fromY: number; toY: number };
      parkedRowX: { eastX: number; westX: number };
      legalBayY: number;
      banZonesY: Array<{ id: string; lawRef: string; fromY: number; toY: number }>;
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.laneCenterOncomingM).toBe(-LANE);
    expect(s.params.rowFromM).toBe(ROW_FROM_Y);
    expect(s.params.rowToM).toBe(ROW_TO_Y);
    expect(s.params.banFromM).toBe(BAN_FROM_Y);
    expect(s.params.banToM).toBe(BAN_TO_Y);
    expect(s.params.legalBayY).toBe(BAY_Y);
    // The template's whole claim: this ban comes from the LAW and the row, and
    // there is no plate anywhere to read.
    expect(s.params.banBasis).toBe("law");
    expect(s.parkedRowY).toEqual({ fromY: ROW_FROM_Y, toY: ROW_TO_Y });
    expect(s.parkedRowX).toEqual({ eastX: ROW_X, westX: -ROW_X });
    expect(s.legalBayY).toBe(BAY_Y);
    expect(s.banZonesY).toHaveLength(1);
    for (const z of s.banZonesY) expect(z.lawRef).toMatch(/^ЗДвП чл\. 98/);
    expect(s.legalBayY - s.params.banToM).toBe(80);
  });

  it("the spawns are both legal ground (a drill may not start or finish in a ban)", () => {
    const inBan = (y: number) => (district.zones ?? []).some((z) => y >= z.fromM && y <= z.toM);
    const start = district.spawnPoints.find((s) => s.id === "pkd-spawn-start")!;
    const bay = district.spawnPoints.find((s) => s.id === "pkd-spawn-bay")!;
    expect(start.y).toBe(15);
    expect(start.x).toBe(LANE);
    expect(inBan(start.y)).toBe(false);
    // The bay spawn sits at the CURB, not at lane center — it is a place to
    // leave the car, not a place to idle in the lane.
    expect(bay.y).toBe(BAY_Y);
    expect(bay.x).toBe(ROW_X);
    expect(inBan(bay.y)).toBe(false);
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
      path.join(process.cwd(), "content", "world", `${ID}.json`),
      path.resolve(process.cwd(), "..", "content", "world", `${ID}.json`),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", `${ID}.json`);
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe(`${ID} through the world runtime — the FP-armor precondition`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals and ZERO stop lines — nothing can acquit a rest as traffic-shaped", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    // The load-bearing one: a stop line within 25 m of a rest makes
    // ILLEGAL_STOP_IN_BAN_ZONE structurally innocent (banZoneControl). The
    // stop-sign heuristic only walks district.intersections — and there are none.
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("flags noStopZone EXACTLY across the parked row and nowhere else", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagOf = (y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, y, 0, 30), y, false).noStopZone;
    };
    // Clear road on the approach — where the driver decides.
    expect(flagOf(30)).toBeUndefined();
    expect(flagOf(BAN_FROM_Y - 2)).toBeUndefined();
    // Beside the row: the whole stretch is second line.
    expect(flagOf(REST_SECOND_LINE_Y)).toBe(true);
    expect(flagOf(REST_SQUEEZE_Y)).toBe(true);
    expect(flagOf(BAN_TO_Y - 1)).toBe(true);
    // Past the row: the curb is empty, so there is nothing to be second to.
    expect(flagOf(BAN_TO_Y + 5)).toBeUndefined();
    // The free bay: the ONE place the drill may rest.
    expect(flagOf(BAY_Y)).toBeUndefined();
    // Nothing else leaks onto the tick.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, REST_SECOND_LINE_Y, 0, 30), 1, false);
    expect(t.noParkZone).toBeUndefined();
    expect(t.noOvertakeZone).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

/** Drive north from y=15 to restY at 30 km/h, rest `restSec` there (with the
 *  given AT-REST lead-gap channel — a queue lead materializes as the car pulls
 *  up), then drive on to the end. */
function restDrive(restY: number, restLeadGapM: number = Infinity, restSec = 6): RuleEvent[] {
  const rt = createWorldRuntime(loadRaw(ID));
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  const dt = 0.1;
  let t = 0;
  const step = (y: number, speedKmh: number, leadGapM: number) => {
    t += dt;
    rt.update(dt);
    const tick = rt.sample(sample(LANE, y, 0, speedKmh), t, false, false, leadGapM);
    const r = reduceTick(rules, tick);
    rules = r.state;
    out.push(...r.events);
  };
  for (let y = 15; y < restY; y += (30 / 3.6) * dt) step(y, 30, Infinity);
  for (let i = 0; i < restSec / dt; i++) step(restY, 0, restLeadGapM);
  for (let y = restY; y < 340; y += (30 / 3.6) * dt) step(y, 30, Infinity);
  return out;
}

const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe(`${ID} — чл. 98 rest adjudication through the real reducer`, () => {
  it("a casual 6 s rest beside the row grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    // „Само за малко, до онази кола" — the misconception, convicted.
    expect(violations(restDrive(REST_SECOND_LINE_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the same rest deeper into the row grades the same code (the ban has no soft end)", () => {
    expect(violations(restDrive(REST_SQUEEZE_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("THE PARKED ROW CANNOT ACQUIT THE REST IT CAUSES — bays are colliders, not traffic", () => {
    // The one new hazard this map introduces vs its siblings. The detector's
    // queue armor reads leadGapM, which traffic/system.ts computes over the
    // TRAFFIC vehicle list; bays reach the sim as collider rects and never enter
    // it. A hero resting beside fourteen parked cars therefore still has
    // leadGapM === Infinity and convicts. If bays ever became traffic agents,
    // this template would silently grade nothing — and this test would fail first.
    const raw = loadRaw(ID) as TrafficDistrict;
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.leadGapMeters(LANE, REST_SECOND_LINE_Y, 0)).toBe(Infinity);
    expect(traffic.leadGapMeters(LANE, REST_SQUEEZE_Y, 0)).toBe(Infinity);
    expect(violations(restDrive(REST_SECOND_LINE_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a REAL lead at 6 m still acquits — the armor is intact, the row simply is not one", () => {
    // The mirror of the test above: nothing about this map weakens the queue
    // innocence that keeps a red-light/jam stop from billing.
    expect(violations(restDrive(REST_SECOND_LINE_Y, 6))).toEqual([]);
  });

  it("a brief 2 s stop beside the row stays innocent (under the 4 s sustain)", () => {
    expect(violations(restDrive(REST_SECOND_LINE_Y, Infinity, 2))).toEqual([]);
  });

  it("the rest at the FREE BAY past the row never bills — the drill's goal is provably lawful", () => {
    expect(violations(restDrive(BAY_Y))).toEqual([]);
  });

  it("ONE rest bills ONCE", () => {
    const billed = restDrive(REST_SECOND_LINE_Y).filter(
      (e) => e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
    );
    expect(billed).toHaveLength(1);
  });

  it("a pass-through drive with no rest stays innocent (the shadow's spine)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 340; y += (30 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(LANE, y, 0, 30), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Known render gaps — the furniture this map should and should not have
// ---------------------------------------------------------------------------

describe(`${ID} — furniture (KNOWN GAPS, pinned)`, () => {
  it("posts one В27 face at the span start, though чл. 98 second-line posts no plate at all", () => {
    // builders/zoneSigns.ts places a В27 at every noStopping span start. Here the
    // ban is the parked row itself, so this post is wrong-but-harmless furniture:
    // render-only, and grading reads the span, never the post. It is also the
    // ONE thing on this map that could teach the wrong lesson („значи има знак")
    // — the scenario copy says out loud that there is nothing to read.
    // FIX: a `posted?: boolean` on DistrictZone (default true ⇒ every shipped
    // map byte-identical) that zoneSigns honours; then this expects 0.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.noStopping).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the lane graph over the single street — the oncoming stream's path", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One graph lane per direction on the one edge (the traffic layer's
    // convention) — the southbound one is what the template stages its
    // oncomingStream along (pkd-n-end → pkd-n-start).
    expect(graph.lanes.length).toBe(2);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(LANE, 15, 0)).toBe(Infinity);
  });
});
