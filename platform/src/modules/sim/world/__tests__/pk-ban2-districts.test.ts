/**
 * pk-ban2-v1 contract battery (the pk-busstop-districts.test.ts pattern) — the
 * В27-vs-В28 reading map behind sc-pk-stop-vs-park (PK-06; ЗДвП чл. 93 + чл.
 * 98, Наредба № РД-02-21-1/2023).
 *
 * pk-ban-v1 posts ONE В27 span. pk-banx-v1 posts nothing (the zebra and the
 * corner ARE the ban). pk-busstop-v1 posts the зигзаг. This map is the first
 * and only district in content/world that authors TWO spans OF DIFFERENT KIND —
 * В28 handing over to В27 on one meter — and its whole claim is that the two
 * plates mean different things. The battery proves the file earns that claim:
 *  - the TOTAL FP-armor precondition (the pk-busstop clean room): ZERO
 *    intersections and ZERO crossings, so no stop line derives and
 *    CrossingZoneTracker can never arm — a rest in the В27 span is the authored
 *    fault and nothing else, and the В28 acquittal is earned from the LAW, not
 *    from armor that happened to fire;
 *  - the two spans surface on the tick as DIFFERENT flags across their exact
 *    arclength ranges, and the seam flips one to the other with no legal meter
 *    between — which is what makes „мислех, че още важи В28" a real fault;
 *  - the archetype's reason to exist end-to-end through the REAL reducer: the
 *    SAME 6 s rest grades NOTHING at y = 120 (В28 — престоят е разрешен) and
 *    exactly ILLEGAL_STOP_IN_BAN_ZONE at y = 200 (В27), ten meters of plate
 *    apart.
 *
 * PINNED GAP — the В28 long stay. The reducer reads `tick.noStopZone` only;
 * `tick.noParkZone` surfaces and grades nothing (engine.ts says so out loud).
 * That is CORRECT for a passenger stop and WRONG for a 60 s паркиране, which is
 * a real чл. 93 fault this drill cannot bill. „the В28 span grades NOTHING even
 * at 60 s" below is that gap, pinned as an assertion rather than a comment: the
 * day a noParking rest-duration threshold lands, this test fails loudly and
 * tells its author exactly which template is waiting for it.
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

const ID = "pk-ban2-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const PARK_FROM_Y = 70;
/** The seam: В28 ends and В27 begins on this meter. */
const SEAM_Y = 170;
const STOP_TO_Y = 290;
const BAY_Y = 330;
/** Where the shadow makes its lawful passenger stop (mid-В28). */
const DROPOFF_Y = 120;
/** Where the two mistake demos rest — both inside В27, different excuses. */
const REST_SEAM_Y = 180;
const REST_MID_Y = 230;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pk_ban2.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying ONE В28 span and ONE В27 span", () => {
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
    expect(district.zones!.map((z) => z.id)).toEqual(["pkb2-z-noparking", "pkb2-z-nostopping"]);
    const [park, stop] = district.zones!;
    // THE reason this map exists: no other district in content/world authors a
    // noParking span at all, so no other district can teach the difference.
    expect(park.kind).toBe("noParking");
    expect(park.signRef).toBe("В28");
    expect(stop.kind).toBe("noStopping");
    expect(stop.signRef).toBe("В27");
    for (const z of district.zones!) expect(z.edgeId).toBe("pkb2-e-street");
    // The street is ONE edge on x = 0, so arclength EQUALS district y.
    expect(park.fromM).toBe(PARK_FROM_Y);
    expect(park.toM).toBe(SEAM_Y);
    expect(stop.fromM).toBe(SEAM_Y);
    expect(stop.toM).toBe(STOP_TO_Y);
    // The seam: no legal meter between the plates. A gap here would let a
    // careless rest land on innocent road and grade nothing — the fault
    // „пренесох правилото на В28 отвъд знака" would stop existing.
    expect(park.toM).toBe(stop.fromM);
  });

  it("carries ZERO junction furniture — the TOTAL FP-armor precondition, as data", () => {
    // The load-bearing structural claim (the gen_pk_busstop clean-room
    // precedent). A crossing anywhere would arm CrossingZoneTracker within
    // ~35 m and acquit a rest as a possibly-lawful yielding stop
    // (`s.crossing === null` is a hard precondition of
    // ILLEGAL_STOP_IN_BAN_ZONE); an intersection would feed buildStopLines.
    // Here it cuts BOTH ways: without it the В28 acquittal below would prove
    // nothing about the law, only about the armor.
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
        parkFromM: number;
        parkToM: number;
        stopToM: number;
        legalBayY: number;
        banKind: string;
        banBasis: string;
      };
      dropoffSpanY: { fromY: number; toY: number };
      legalBayY: number;
      signSeamY: number;
      banZonesY: Array<{ id: string; signRef: string; lawRef: string; fromY: number; toY: number; graded: boolean }>;
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.params.parkFromM).toBe(PARK_FROM_Y);
    expect(s.params.parkToM).toBe(SEAM_Y);
    expect(s.params.stopToM).toBe(STOP_TO_Y);
    expect(s.params.legalBayY).toBe(BAY_Y);
    // The template's whole claim: this street bans by PLATE, twice, differently.
    expect(s.params.banKind).toBe("noParking+noStopping");
    expect(s.params.banBasis).toBe("sign");
    expect(s.dropoffSpanY).toEqual({ fromY: PARK_FROM_Y, toY: SEAM_Y });
    expect(s.signSeamY).toBe(SEAM_Y);
    expect(s.legalBayY).toBe(BAY_Y);
    expect(s.banZonesY).toHaveLength(2);
    expect(s.banZonesY.map((z) => z.signRef)).toEqual(["В28", "В27"]);
    // The honest `graded` flag: the В28 span is data the engine reads and does
    // not bill. Stated in the map so no future template mistakes it for one.
    expect(s.banZonesY.map((z) => z.graded)).toEqual([false, true]);
    expect(s.banZonesY[0].lawRef).toMatch(/^ЗДвП чл\. 93/);
    expect(s.banZonesY[1].lawRef).toMatch(/^ЗДвП чл\. 98/);
    // The bay sits 40 m past the LAST ban (the pk-busstop contract).
    expect(s.legalBayY - s.params.stopToM).toBe(40);
  });

  it("the spawns land where the drill needs them (start clear, drop-off under В28, bay past both)", () => {
    const zoneAt = (y: number) => district.zones!.find((z) => y >= z.fromM && y < z.toM);
    const start = district.spawnPoints.find((s) => s.id === "pkb2-spawn-start")!;
    const dropoff = district.spawnPoints.find((s) => s.id === "pkb2-spawn-dropoff")!;
    const bay = district.spawnPoints.find((s) => s.id === "pkb2-spawn-bay")!;
    expect(start.y).toBe(15);
    expect(zoneAt(start.y)).toBeUndefined();
    // The drop-off spawn IS the В28 teaching, pinned as a coordinate: „тук
    // може, стига да не оставяш колата".
    expect(zoneAt(dropoff.y)?.kind).toBe("noParking");
    expect(bay.y).toBe(BAY_Y);
    expect(zoneAt(bay.y)).toBeUndefined();
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
    expect(world.stats.drawCallEstimate).toBeLessThanOrEqual(150);
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

describe(`${ID} through the world runtime — two plates, two flags`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals and ZERO stop lines — nothing can acquit a rest as traffic-shaped", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    // The load-bearing one: a stop line within 25 m of a rest makes
    // ILLEGAL_STOP_IN_BAN_ZONE structurally innocent (banZoneControl).
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("flags noParkZone across В28 and noStopZone across В27 — never both, never neither", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagsOf = (y: number) => {
      rt.update(1 / 60);
      const t = rt.sample(sample(LANE, y, 0, 30), y, false);
      return { park: t.noParkZone, stop: t.noStopZone };
    };
    // Clear road on the approach — where the driver reads the first plate.
    expect(flagsOf(50)).toEqual({ park: undefined, stop: undefined });
    expect(flagsOf(PARK_FROM_Y - 2)).toEqual({ park: undefined, stop: undefined });
    // The В28 half: паркирането е забранено, престоят НЕ Е.
    expect(flagsOf(PARK_FROM_Y + 5)).toEqual({ park: true, stop: undefined });
    expect(flagsOf(DROPOFF_Y)).toEqual({ park: true, stop: undefined });
    expect(flagsOf(SEAM_Y - 5)).toEqual({ park: true, stop: undefined });
    // The seam — ten meters of plate apart, the whole rulebook changes.
    expect(flagsOf(SEAM_Y + 5)).toEqual({ park: undefined, stop: true });
    expect(flagsOf(REST_SEAM_Y)).toEqual({ park: undefined, stop: true });
    expect(flagsOf(REST_MID_Y)).toEqual({ park: undefined, stop: true });
    expect(flagsOf(STOP_TO_Y - 1)).toEqual({ park: undefined, stop: true });
    // Past both plates: legal road again.
    expect(flagsOf(STOP_TO_Y + 5)).toEqual({ park: undefined, stop: undefined });
    expect(flagsOf(BAY_Y)).toEqual({ park: undefined, stop: undefined });
    // Nothing else leaks onto the tick.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, REST_MID_Y, 0, 30), 1, false);
    expect(t.noOvertakeZone).toBeUndefined();
    expect(t.solidCenterLine).toBeUndefined();
    expect(t.busLaneRight).toBeUndefined();
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
  for (let y = restY; y < 370; y += (30 / 3.6) * dt) step(y, 30, Infinity);
  return out;
}

const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe(`${ID} — В27 vs В28 adjudication through the real reducer`, () => {
  it("THE TEMPLATE, IN ONE PAIR: the same 6 s rest is innocent under В28 and основна under В27", () => {
    // Identical drive, identical duration, identical everything but the plate.
    // This pair is the scenario's whole thesis, proven through the production
    // reducer rather than asserted in prose.
    expect(violations(restDrive(DROPOFF_Y))).toEqual([]);
    expect(violations(restDrive(REST_MID_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a rest just PAST the seam grades exactly ILLEGAL_STOP_IN_BAN_ZONE — В28's permission does not travel", () => {
    // „Мислех, че още важи В28" — the fault the abutting spans exist to create.
    expect(violations(restDrive(REST_SEAM_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the two demos rest in the SAME В27 span at marks that mean different things", () => {
    const d = assertDistrict(loadRaw(ID));
    const zoneAt = (y: number) => d.zones!.find((z) => y >= z.fromM && y < z.toM)?.id;
    expect(zoneAt(REST_SEAM_Y)).toBe("pkb2-z-nostopping");
    expect(zoneAt(REST_MID_Y)).toBe("pkb2-z-nostopping");
    // …and the shadow's rest is in the OTHER span, which is the point.
    expect(zoneAt(DROPOFF_Y)).toBe("pkb2-z-noparking");
  });

  it("the В28 span grades NOTHING even at 60 s — the KNOWN GAP, pinned", () => {
    // A minute at the curb under В28 is паркиране (ЗДвП чл. 93: престой is
    // а stop for boarding/loading with the driver present), and the plate bans
    // exactly that. The reducer cannot bill it: it reads `tick.noStopZone`
    // only, and engine.ts states the reason — parking vs престой is
    // indistinguishable with current telemetry (the same A12 bar).
    // WHEN A noParking REST-DURATION THRESHOLD LANDS, THIS TEST FAILS. That is
    // the intent: it is the tripwire that tells its author sc-pk-stop-vs-park
    // is waiting to grow its third mistake demo.
    expect(violations(restDrive(DROPOFF_Y, Infinity, 60))).toEqual([]);
  });

  it("a brief 2 s stop under В27 stays innocent (under the 4 s sustain) — the drill is not a stopwatch", () => {
    expect(violations(restDrive(REST_MID_Y, Infinity, 2))).toEqual([]);
  });

  it("the SAME В27 rest behind a queue lead (gap 6 m) stays innocent — traffic is never the fault", () => {
    expect(violations(restDrive(REST_MID_Y, 6))).toEqual([]);
    expect(violations(restDrive(REST_SEAM_Y, 6))).toEqual([]);
  });

  it("parking at the LEGAL BAY past both plates never bills — the drill's goal is provably lawful", () => {
    expect(violations(restDrive(BAY_Y, Infinity, 30))).toEqual([]);
  });

  it("ONE В27 rest bills ONCE (the later legal park must not double-bill)", () => {
    const codes = restDrive(REST_MID_Y).filter(
      (e) => e.kind === "violation" && e.code === "ILLEGAL_STOP_IN_BAN_ZONE",
    );
    expect(codes).toHaveLength(1);
  });

  it("a pass-through drive with no rest stays innocent (the shadow's spine)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 370; y += (30 / 3.6) * dt) {
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
// Known render gap — the plate the drill most needs a learner to SEE
// ---------------------------------------------------------------------------

describe(`${ID} — plate furniture (GAP CLOSED)`, () => {
  it("posts BOTH plates — one В28 over the parking ban, one В27 over the stopping ban", () => {
    // WAS „posts the В27 face and NOTHING for В28 — exactly backwards from what
    // the drill wants shown", pinned as a KNOWN GAP because a В28 SignKind
    // touches shared files. It has been taken: `noParking` is a SignKind, it
    // rides the В27 GLB (the two source SVGs open with a byte-identical plate
    // circle and differ only in the face — one diagonal instead of the X), and
    // `ZONE_SIGN_KIND.noParking` posts it. This map's own data was already
    // asking for it: the zone carries `signRef: "В28"` and a spawn point is
    // literally named „Място за престой — под В28".
    // Render-only, exactly as before: grading reads the spans, never the posts.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.noStopping).toBe(1);
    expect(world.stats.signs.noParking).toBe(1);
    expect(zoneSignsPlaceNoParking()).toBe(true);
  });

  it("…and each plate stands at the first metre of the span it governs", () => {
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    // World space is (x, y, −districtY), so the district metre is −z.
    const at = (kind: "noParking" | "noStopping") =>
      world.signs.filter((s) => s.kind === kind).map((s) => -s.position[2]);
    expect(at("noParking")).toEqual([PARK_FROM_Y]);
    expect(at("noStopping")).toEqual([SEAM_Y]);
  });
});

/** Documentation-as-assertion: the sign builder's kind table maps the noParking
 *  zone to a post. Kept as a function so the claim above is checkable, not
 *  folklore. */
function zoneSignsPlaceNoParking(): boolean {
  const src = fs.readFileSync(path.resolve(__dirname, "..", "builders", "zoneSigns.ts"), "utf8");
  return /ZONE_SIGN_KIND[\s\S]*?noParking\s*:/.test(src.slice(src.indexOf("ZONE_SIGN_KIND"), src.indexOf("};", src.indexOf("ZONE_SIGN_KIND"))));
}

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
    // No lead anywhere: nothing on this street is queue-innocent by accident.
    expect(traffic.leadGapMeters(LANE, 15, 0)).toBe(Infinity);
  });
});
