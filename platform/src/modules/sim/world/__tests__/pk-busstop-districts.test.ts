/**
 * pk-busstop-v1 contract battery (the pk-banx-districts.test.ts pattern) — the
 * BUS-STOP ban map behind sc-pk-busstop-ban (PK-06, ЗДвП чл. 98, ал. 1).
 *
 * pk-ban-v1 bans by SIGN (a В27 plate). pk-banx-v1 bans by LAW (the zebra and
 * the corner ARE the ban). This map bans by the STOP ZONE, and its whole claim
 * is that the zone is BIGGER than the shelter you can see: the зигзаг approach
 * (Наредба № 2/2001) is already the spirka. The battery proves the file earns
 * that claim:
 *  - the TOTAL FP-armor precondition: ZERO intersections and ZERO crossings, so
 *    no stop line derives and CrossingZoneTracker can never arm — a rest inside
 *    a span is the authored fault and nothing else (pk-banx had to route its
 *    demos around its own zebra's ~35 m arm; this map has no zebra);
 *  - the two spans surface on the tick exactly inside their arclength ranges,
 *    abutting into ONE continuous ban but attributable to different zones —
 *    which is what lets the two mistake demos mean different things;
 *  - the archetype's reason to exist end-to-end through the REAL reducer: a
 *    casual rest on the зигзаг OR in the pocket grades exactly
 *    ILLEGAL_STOP_IN_BAN_ZONE, while the SAME rest behind a queue lead stays
 *    innocent (which is exactly why no bus is staged in the pocket) and the
 *    legal bay never bills.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "pk-busstop-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const MARKING_FROM_Y = 150;
const POCKET_FROM_Y = 180;
const POCKET_TO_Y = 210;
const BAY_Y = 250;
/** Where the two mistake demos rest — one per span. */
const REST_MARKING_Y = 165;
const REST_POCKET_Y = 195;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pk_busstop.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying TWO чл. 98 bus-stop spans", () => {
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
    expect(district.zones).toHaveLength(2);
    for (const z of district.zones!) {
      // В28 (noParking) would grade NOTHING — престоят под В28 е разрешен.
      expect(z.kind).toBe("noStopping");
      expect(z.edgeId).toBe("pkbs-e-street");
    }
    expect(district.zones!.map((z) => z.id)).toEqual(["pkbs-z-stop-marking", "pkbs-z-stop-pocket"]);
    const [marking, pocket] = district.zones!;
    // The street is ONE edge on x = 0, so arclength EQUALS district y.
    expect(marking.fromM).toBe(MARKING_FROM_Y);
    expect(marking.toM).toBe(POCKET_FROM_Y);
    expect(pocket.fromM).toBe(POCKET_FROM_Y);
    expect(pocket.toM).toBe(POCKET_TO_Y);
    // Two zones, ONE continuous ban: the driver never crosses legal road
    // between the зигзаг and the bay — that IS the misconception being taught.
    expect(marking.toM).toBe(pocket.fromM);
  });

  it("carries ZERO junction furniture — the TOTAL FP-armor precondition, as data", () => {
    // The load-bearing structural claim of this map. A crossing anywhere would
    // arm CrossingZoneTracker within ~35 m and acquit a rest as a
    // possibly-lawful yielding stop (`s.crossing === null` is a hard
    // precondition of ILLEGAL_STOP_IN_BAN_ZONE); an intersection would feed
    // buildStopLines. Neither exists, so neither can.
    expect(district.intersections).toHaveLength(0);
    expect(district.crossings).toHaveLength(0);
    expect(district.roundabouts).toHaveLength(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("meta.scenario mirrors the committed geometry (the ScenarioSpec's single truth)", () => {
    const s = district.meta.scenario as {
      archetype: string;
      laneCenterRightM: number;
      params: {
        markingFromM: number;
        pocketFromM: number;
        pocketToM: number;
        legalBayY: number;
        banBasis: string;
      };
      busStopPocketY: { fromY: number; toY: number };
      legalBayY: number;
      banZonesY: Array<{ id: string; lawRef: string; fromY: number; toY: number }>;
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.params.markingFromM).toBe(MARKING_FROM_Y);
    expect(s.params.pocketFromM).toBe(POCKET_FROM_Y);
    expect(s.params.pocketToM).toBe(POCKET_TO_Y);
    expect(s.params.legalBayY).toBe(BAY_Y);
    // The template's whole claim: this ban comes from the LAW + the зигзаг, not
    // from a plate at the shelter.
    expect(s.params.banBasis).toBe("law");
    expect(s.busStopPocketY).toEqual({ fromY: POCKET_FROM_Y, toY: POCKET_TO_Y });
    expect(s.legalBayY).toBe(BAY_Y);
    expect(s.banZonesY).toHaveLength(2);
    for (const z of s.banZonesY) expect(z.lawRef).toMatch(/^ЗДвП чл\. 98/);
    // The backlog's contract: the legal bay sits 40 m past the stop zone.
    expect(s.legalBayY - s.params.pocketToM).toBe(40);
  });

  it("the spawns are both legal ground (a drill may not start or finish in a ban)", () => {
    const inBan = (y: number) =>
      (district.zones ?? []).some((z) => y >= z.fromM && y <= z.toM);
    const start = district.spawnPoints.find((s) => s.id === "pkbs-spawn-start")!;
    const bay = district.spawnPoints.find((s) => s.id === "pkbs-spawn-bay")!;
    expect(start.y).toBe(15);
    expect(inBan(start.y)).toBe(false);
    expect(bay.y).toBe(BAY_Y);
    expect(inBan(bay.y)).toBe(false);
    for (const s of district.spawnPoints) expect(s.x).toBe(LANE);
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

  it("flags noStopZone EXACTLY across the stop zone and nowhere else", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagOf = (y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, y, 0, 30), y, false).noStopZone;
    };
    // Clear road on the approach — where the driver decides.
    expect(flagOf(100)).toBeUndefined();
    expect(flagOf(MARKING_FROM_Y - 2)).toBeUndefined();
    // The зигзаг approach: already the spirka (the template's whole point).
    expect(flagOf(REST_MARKING_Y)).toBe(true);
    // The seam between the two spans is continuous ban, not a legal gap.
    expect(flagOf(POCKET_FROM_Y)).toBe(true);
    // The pocket itself.
    expect(flagOf(REST_POCKET_Y)).toBe(true);
    expect(flagOf(POCKET_TO_Y - 1)).toBe(true);
    // Past the zone: legal road again.
    expect(flagOf(POCKET_TO_Y + 5)).toBeUndefined();
    // The legal bay: the ONE place the drill may rest.
    expect(flagOf(BAY_Y)).toBeUndefined();
    // Nothing else leaks onto the tick.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, REST_POCKET_Y, 0, 30), 1, false);
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
  for (let y = restY; y < 330; y += (30 / 3.6) * dt) step(y, 30, Infinity);
  return out;
}

const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe(`${ID} — чл. 98 rest adjudication through the real reducer`, () => {
  it("a casual 6 s rest ON THE ЗИГЗАГ approach grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    // „Аз не съм на спирката, аз съм ПРЕД нея" — the misconception, convicted.
    expect(violations(restDrive(REST_MARKING_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a casual 6 s rest IN THE POCKET grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    expect(violations(restDrive(REST_POCKET_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the two demos really do rest in DIFFERENT authored spans", () => {
    const d = assertDistrict(loadRaw(ID));
    const zoneAt = (y: number) => d.zones!.find((z) => y >= z.fromM && y < z.toM)?.id;
    expect(zoneAt(REST_MARKING_Y)).toBe("pkbs-z-stop-marking");
    expect(zoneAt(REST_POCKET_Y)).toBe("pkbs-z-stop-pocket");
  });

  it("the SAME rest behind a queue lead (gap 6 m) stays innocent — WHY no bus is staged", () => {
    // The backlog's note, proven rather than asserted: a held bus in the pocket
    // would be a lead within banZoneStopQueueGapM, and every rest behind it
    // would read as queue-shaped. The empty pocket IS the drill.
    expect(violations(restDrive(REST_MARKING_Y, 6))).toEqual([]);
    expect(violations(restDrive(REST_POCKET_Y, 6))).toEqual([]);
  });

  it("a brief 2 s stop in the pocket stays innocent (under the 4 s sustain)", () => {
    expect(violations(restDrive(REST_POCKET_Y, Infinity, 2))).toEqual([]);
  });

  it("the rest at the LEGAL BAY past the zone never bills — the drill's goal is provably lawful", () => {
    expect(violations(restDrive(BAY_Y))).toEqual([]);
  });

  it("ONE rest bills ONCE, even though the ban is authored as two abutting spans", () => {
    // The reducer resets on leaving the zone or moving off, not on crossing an
    // authored span seam — so the two-span authoring is invisible to grading.
    const codes = restDrive(REST_MARKING_Y)
      .filter((e) => e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE");
    expect(codes).toHaveLength(1);
  });

  it("a pass-through drive with no rest stays innocent (the shadow's spine)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 330; y += (30 / 3.6) * dt) {
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

describe(`${ID} — bus-stop furniture (KNOWN GAPS, pinned)`, () => {
  it("posts one В27 face per span, though a real spirka is posted with a Д-group plate", () => {
    // builders/zoneSigns.ts places a В27 at every noStopping span start. Here
    // the ban is law+marking implied, so these two posts are wrong-but-harmless
    // furniture: render-only, and grading reads the spans, never the posts.
    // FIX: a `posted?: boolean` on DistrictZone (default true ⇒ every shipped
    // map byte-identical) that zoneSigns honours; then this expects 0.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.noStopping).toBe(2);
  });

  it("renders NO shelter and NO зигзаг — the teaching rides the copy, the grading rides the spans", () => {
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    // props.ts only places shelters on primary/secondary edges anchored to a
    // degree >= 3 node. Both are unavailable here BY DESIGN: arterial rank posts
    // stop lines and a junction posts stop lines — either would acquit the very
    // rest this map exists to convict. The pocket renders as plain curb.
    expect(world.busStops).toHaveLength(0);
    // markings.ts now reads District.zones — but only for the SOLID kinds
    // (solidCenterLine осева, bus/emergency curb seams). A noStopping span still
    // paints no зигзаг, so stripping THIS map's zones leaves the marking buffer
    // byte-identical: the зигзаг gap remains. FIX for both: a `busStop?: boolean`
    // on DistrictZone that props/markings honour.
    const zoneless = buildWorldGeometry(
      assertDistrict({ ...(loadRaw(ID) as District), zones: undefined }),
      { seed: 7 },
    );
    expect(world.stats.markingQuads).toBe(zoneless.stats.markingQuads);
    expect(world.markings.positions.length).toBe(zoneless.markings.positions.length);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the lane graph over the single street; zero traffic is a LEGAL config", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One graph lane per direction on the one edge (the traffic layer's convention).
    expect(graph.lanes.length).toBe(2);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    // No lead anywhere: the pocket is empty by design, so nothing is queue-innocent.
    expect(traffic.leadGapMeters(LANE, 15, 0)).toBe(Infinity);
  });
});
