/**
 * pk-rail-v1 contract battery (the pk-busstop-districts.test.ts pattern) — the
 * RAIL-CROSSING ban map behind sc-pk-rail-ban (PK-06 + RX-03; ЗДвП чл. 98).
 *
 * Every other чл. 98 map bans with ONE data layer. This one is the first
 * district where the ban spans and a railCrossing band share a street, and its
 * whole claim is that the two layers SPLIT the geography on the rail edge:
 *  - the чл. 98 spans own the approach [150, 200] and the run-out [206, 256] —
 *    a rest there is основна (ILLEGAL_STOP_IN_BAN_ZONE);
 *  - the band [200, 206] carries NO ban span, because the rail zone's
 *    rest-on-tracks arm already owns it with a HEAVIER code (опасна,
 *    RAIL_CROSSING_VIOLATION detail "stopped-on-track") and — the asymmetry
 *    that is the whole lesson — with NO queue exemption.
 * Together they cover y ∈ [150, 256] with no legal metre anywhere between, each
 * metre billing exactly one code. This battery proves the file earns that.
 *
 * It also pins the two structural preconditions the map is built on:
 *  - the TOTAL FP-armor precondition (gen_pk_banx's, verbatim): ZERO
 *    intersections, ZERO crossings, one `residential` edge — so no stop line
 *    derives and CrossingZoneTracker can never arm;
 *  - the BARRIER-UP law: the authored timetable falls at t = 480 s, outside the
 *    180 s drill window, because a lawful barrier wait inside a ban span would
 *    convict (ILLEGAL_STOP_IN_BAN_ZONE has no rail-phase armor — named in the
 *    generator header, not taken).
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent } from "../../rules";
import { createWorldRuntime, RAIL_APPROACH_M, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "pk-rail-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const BAN_BEFORE_FROM_Y = 150;
const BAND_FROM_Y = 200;
const BAND_TO_Y = 206;
const BAN_AFTER_TO_Y = 256;
const BAY_Y = 330;
const STOP_LINE_Y = 195;
/** Where the two mistake demos rest — one per detector. */
const REST_BAN_Y = 175;
const REST_RAILS_Y = 203;
/** The authored barrier timetable + the window every drive must fit inside. */
const BARRIER = { cycleSec: 600, downFromSec: 480, downToSec: 540 };
const DRILL_WINDOW_SEC = 180;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pk_rail.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying TWO чл. 98 spans + ONE rail band", () => {
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
    expect(district.zones).toHaveLength(3);
    expect(district.zones!.map((z) => z.id)).toEqual([
      "pkr-z-ban-before",
      "pkr-z-railcrossing",
      "pkr-z-ban-after",
    ]);
    for (const z of district.zones!) expect(z.edgeId).toBe("pkr-e-street");
    const [before, rail, after] = district.zones!;
    // The street is ONE edge on x = 0, so arclength EQUALS district y.
    expect(before.kind).toBe("noStopping");
    expect([before.fromM, before.toM]).toEqual([BAN_BEFORE_FROM_Y, BAND_FROM_Y]);
    expect(rail.kind).toBe("railCrossing");
    expect([rail.fromM, rail.toM]).toEqual([BAND_FROM_Y, BAND_TO_Y]);
    expect(after.kind).toBe("noStopping");
    expect([after.fromM, after.toM]).toEqual([BAND_TO_Y, BAN_AFTER_TO_Y]);
  });

  it("the two layers ABUT the band and never overlap it — the map's central law, as data", () => {
    const [before, rail, after] = district.zones!;
    // No legal metre between y = 150 and y = 256…
    expect(before.toM).toBe(rail.fromM);
    expect(rail.toM).toBe(after.fromM);
    // …and no metre of the band is claimed by a ban span, so a rest on the rails
    // bills the опасна rail code ALONE. A noStopping span over the band would
    // double-bill one fault under two codes and flatten the severity difference.
    for (const z of [before, after]) {
      expect(z.fromM < rail.toM && z.toM > rail.fromM, `${z.id} overlaps the band interior`).toBe(
        false,
      );
    }
  });

  it("the crossing is GUARDED (А34) and its barrier never falls inside the drill window", () => {
    const rail = district.zones![1];
    // А35 (unguarded) would impose the чл. 52 full-stop duty — INSIDE the ban
    // span — i.e. the law would order the fault this map grades. Guarded-open
    // asks no stop at all, so the correct drive is one unbroken motion.
    expect(rail.signRef).toBe("А34");
    expect(rail.guarded).toBe(true);
    expect(rail.barrier).toEqual(BARRIER);
    // The barrier-up law: a lawful wait at a lowered barrier inside a ban span
    // would grade ILLEGAL_STOP_IN_BAN_ZONE (the detector's innocent-context set
    // reads stop lines and signals, never the rail phase). So the timetable is
    // authored out of every drive's reach rather than the assert weakened.
    expect(BARRIER.downFromSec).toBeGreaterThanOrEqual(DRILL_WINDOW_SEC);
  });

  it("carries ZERO junction furniture — the TOTAL FP-armor precondition, as data", () => {
    // A crossing anywhere would arm CrossingZoneTracker within ~35 m and acquit a
    // rest as a possibly-lawful yielding stop (`s.crossing === null` is a hard
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
      legalBayY: number;
      params: {
        lengthM: number;
        maxspeedKmh: number;
        bandFromM: number;
        bandToM: number;
        banReachM: number;
        legalBayY: number;
        banBasis: string;
        guarded: string;
      };
      railCrossing: {
        id: string;
        signRef: string;
        fromM: number;
        toM: number;
        guarded: boolean;
        stopLineY: number;
        barrier: { cycleSec: number; downFromSec: number; downToSec: number };
        drillWindowSec: number;
      };
      banZonesY: Array<{ id: string; lawRef: string; fromY: number; toY: number }>;
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.params.lengthM).toBe(400);
    expect(s.params.maxspeedKmh).toBe(50);
    expect(s.params.bandFromM).toBe(BAND_FROM_Y);
    expect(s.params.bandToM).toBe(BAND_TO_Y);
    expect(s.params.banReachM).toBe(50);
    expect(s.params.legalBayY).toBe(BAY_Y);
    expect(s.legalBayY).toBe(BAY_Y);
    // The template's whole claim: this ban comes from the LAW, not from a plate.
    expect(s.params.banBasis).toBe("law");
    expect(s.params.guarded).toBe("guarded");
    expect(s.railCrossing.stopLineY).toBe(STOP_LINE_Y);
    expect(s.railCrossing.barrier).toEqual(BARRIER);
    expect(s.railCrossing.drillWindowSec).toBe(DRILL_WINDOW_SEC);
    // banZonesY lists the чл. 98 spans ONLY — the band is not a ban span.
    expect(s.banZonesY.map((z) => z.id)).toEqual(["pkr-z-ban-before", "pkr-z-ban-after"]);
    for (const z of s.banZonesY) expect(z.lawRef).toMatch(/^ЗДвП чл\. 98/);
    // The ban reaches the same distance on both sides — the law is symmetric.
    expect(s.banZonesY[0].toY - s.banZonesY[0].fromY).toBe(s.banZonesY[1].toY - s.banZonesY[1].fromY);
  });

  it("the spawns are both legal ground (a drill may not start or finish in a ban)", () => {
    const inZone = (y: number) => (district.zones ?? []).some((z) => y >= z.fromM && y <= z.toM);
    const start = district.spawnPoints.find((s) => s.id === "pkr-spawn-start")!;
    const bay = district.spawnPoints.find((s) => s.id === "pkr-spawn-bay")!;
    expect(start.y).toBe(15);
    expect(inZone(start.y)).toBe(false);
    expect(bay.y).toBe(BAY_Y);
    expect(inZone(bay.y)).toBe(false);
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

describe(`${ID} through the world runtime — the two layers on the tick`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals and ZERO stop lines — nothing can acquit a rest as traffic-shaped", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    // The load-bearing one: a stop line within 25 m of a rest makes
    // ILLEGAL_STOP_IN_BAN_ZONE structurally innocent (banZoneControl). The
    // stop-sign heuristic only walks district.intersections — and there are none.
    // NOTE the honest consequence: meta.scenario.railCrossing.stopLineY (195) is
    // an AUTHORING anchor for the copy and the trace scripts, not a derived stop
    // line — the СТОП cross renders and grades nothing (the generator's gap note).
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("flags noStopZone EXACTLY across the two чл. 98 spans — and NOT on the band", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagOf = (y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, y, 0, 30), y, false).noStopZone;
    };
    // Clear road on the approach — where the driver decides.
    expect(flagOf(100)).toBeUndefined();
    expect(flagOf(BAN_BEFORE_FROM_Y - 2)).toBeUndefined();
    // The approach ban.
    expect(flagOf(REST_BAN_Y)).toBe(true);
    expect(flagOf(BAND_FROM_Y - 1)).toBe(true);
    // THE BAND: no ban flag — the rail zone owns these six metres alone.
    expect(flagOf(REST_RAILS_Y)).toBeUndefined();
    // The run-out ban, immediately past the far rail.
    expect(flagOf(BAND_TO_Y + 1)).toBe(true);
    expect(flagOf(BAN_AFTER_TO_Y - 1)).toBe(true);
    // Past the zone: legal road again.
    expect(flagOf(BAN_AFTER_TO_Y + 5)).toBeUndefined();
    // The legal bay: the ONE place the drill may rest.
    expect(flagOf(BAY_Y)).toBeUndefined();
    // Nothing else leaks onto the tick.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, REST_BAN_Y, 0, 30), 1, false);
    expect(t.noParkZone).toBeUndefined();
    expect(t.noOvertakeZone).toBeUndefined();
    expect(t.solidCenterLine).toBeUndefined();
  });

  it("phases the rail band exactly, and the ban span reaches BEYOND the approach window", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const phaseOf = (y: number) => {
      rt.update(1 / 60);
      const t = rt.sample(sample(LANE, y, 0, 25), 1, false);
      return { phase: t.railCrossing, guarded: t.railGuarded, barred: t.railBarred };
    };
    // Absent before the approach window opens (30 m out = y 170)…
    expect(phaseOf(BAND_FROM_Y - RAIL_APPROACH_M - 5).phase).toBeUndefined();
    // …"approach" inside it — and the ban span already started 20 m EARLIER
    // (y = 150), which is the drill's shape: you are forbidden to stop before
    // the crossing even announces itself to the reducer.
    expect(phaseOf(BAND_FROM_Y - RAIL_APPROACH_M + 5).phase).toBe("approach");
    expect(phaseOf(REST_BAN_Y).phase).toBe("approach");
    expect(phaseOf(REST_RAILS_Y).phase).toBe("on");
    expect(phaseOf(BAND_TO_Y + 2).phase).toBeUndefined();
    // Guarded throughout the zone; NEVER barred inside the drill window.
    expect(phaseOf(REST_RAILS_Y).guarded).toBe(true);
    expect(phaseOf(REST_RAILS_Y).barred).toBeUndefined();
  });

  it("the barrier stays UP for the entire drill window and falls exactly on schedule after it", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const barredAt = (tSec: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, BAND_FROM_Y - 8, 0, 20), tSec, false).railBarred;
    };
    for (let t = 0; t <= DRILL_WINDOW_SEC; t += 10) {
      expect(barredAt(t), `t=${t}`).toBeUndefined();
    }
    // The timetable is real data, not a disabled flag: the train does come.
    expect(barredAt(BARRIER.downFromSec + 1)).toBe(true);
    expect(barredAt(BARRIER.downToSec + 1)).toBeUndefined();
    // …and it is periodic, so the second cycle repeats it exactly.
    expect(barredAt(BARRIER.cycleSec + BARRIER.downFromSec + 1)).toBe(true);
  });

  it("the ONE metre where both layers touch: the near rail carries both flags", () => {
    // Documentation-as-assertion, not a wish. The approach ban ends AT y = 200
    // and the band starts AT y = 200 (spans are inclusive both ends), so a fix
    // landing exactly on the near rail reads noStopZone AND railCrossing "on".
    // Measure-zero and unreachable by either demo (they rest at 175 and 203),
    // and both readings are legally true of that metre — but if a future demo
    // ever parks there, it will bill two codes, and this test says why.
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, BAND_FROM_Y, 0, 20), 1, false);
    expect(t.noStopZone).toBe(true);
    expect(t.railCrossing).toBe("on");
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
  for (let y = restY; y < 390; y += (30 / 3.6) * dt) step(y, 30, Infinity);
  return out;
}

const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe(`${ID} — the two detectors split the geography (the real reducer)`, () => {
  it("a casual 6 s rest in the APPROACH ban grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    // „Само ще изчакам тук пред прелеза" — the misconception, convicted.
    expect(violations(restDrive(REST_BAN_Y))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a casual 6 s rest in the RUN-OUT ban grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    // The ban is symmetric: „минах прелеза, вече може" is the same fault.
    expect(violations(restDrive(BAND_TO_Y + 20))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a 6 s rest ON THE BAND grades exactly RAIL_CROSSING_VIOLATION — and no ban code", () => {
    const events = restDrive(REST_RAILS_Y);
    expect(violations(events)).toEqual(["RAIL_CROSSING_VIOLATION"]);
    const rail = events.filter((e) => e.kind === "violation" && e.code === "RAIL_CROSSING_VIOLATION");
    expect(rail).toHaveLength(1);
    // The rail code carries three arms; this map may only ever produce the third
    // (the "no-stop" arm is guarded-exempt, "entered-barred" is out of window).
    expect((rail[0] as { detail?: string }).detail).toBe("stopped-on-track");
  });

  it("THE ASYMMETRY: a queue lead acquits the ban rest — and never acquits the rails rest", () => {
    // The lesson, proven rather than asserted. A lead within banZoneStopQueueGapM
    // makes a чл. 98 rest queue-shaped and innocent (you may legitimately be
    // stuck in traffic before a crossing). The rail arm has NO queue exemption
    // by deliberate design — following the column onto the tracks IS the taught
    // kill — so the SAME excuse changes nothing six metres later. That gap
    // between the two spans is the entire template.
    expect(violations(restDrive(REST_BAN_Y, 6))).toEqual([]);
    expect(violations(restDrive(REST_RAILS_Y, 6))).toEqual(["RAIL_CROSSING_VIOLATION"]);
  });

  it("a brief 2 s stop in the ban stays innocent (under the 4 s sustain)", () => {
    expect(violations(restDrive(REST_BAN_Y, Infinity, 2))).toEqual([]);
  });

  it("the rest at the LEGAL BAY past the zone never bills — the drill's goal is provably lawful", () => {
    expect(violations(restDrive(BAY_Y))).toEqual([]);
  });

  it("ONE rest bills ONCE, and the drive on across the rails adds nothing", () => {
    // The ban rest is followed by a full transit of the band — the guarded-open
    // crossing asks no stop (чл. 52), so the transit itself must cost nothing.
    const codes = restDrive(REST_BAN_Y).filter((e) => e.kind === "violation");
    expect(codes).toHaveLength(1);
  });

  it("a pass-through drive with no rest stays innocent (the shadow's spine)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = 15; y < 390; y += (30 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(LANE, y, 0, 30), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    // The чл. 52 legal asymmetry, end-to-end: crossing a GUARDED-OPEN band
    // without stopping is lawful, so a clean transit bills nothing at all.
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Known render gaps — the furniture this map should and should not have
// ---------------------------------------------------------------------------

describe(`${ID} — rail + ban furniture (KNOWN GAPS, pinned)`, () => {
  it("posts one В27 face per чл. 98 span, though these two bans carry no plate in reality", () => {
    // builders/zoneSigns.ts places a В27 at every noStopping span start. Here the
    // ban is law-implied, so these two posts are wrong-but-harmless furniture:
    // render-only, and grading reads the spans, never the posts. FIX: a
    // `posted?: boolean` on DistrictZone (default true ⇒ every shipped map
    // byte-identical) that zoneSigns honours; then this expects 0.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.noStopping).toBe(2);
  });

  it("posts the FULL guarded-crossing set — А34 + Андреевски кръст + barrier arm", () => {
    // Corrected at wave-7 integration. This assertion previously read
    // `signs.railCrossing ?? 0` and expected 0 — but `railCrossing` is not a
    // SignKind (the kinds are railGuarded/railUnguarded/railCross/barrier), so
    // it was `undefined ?? 0` and passed vacuously while claiming the crossing
    // renders as plain asphalt. It does NOT: the sign-asset drop's zoneSigns
    // pass (builders/zoneSigns.ts) places the whole guarded set off the band,
    // so this map's furniture is byte-identical to shipped rx-guarded-v1's.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.railGuarded).toBe(1);
    expect(world.stats.signs.railCross).toBe(1);
    expect(world.stats.signs.barrier).toBe(1);
    // The guarded band never posts the unguarded А35 warning.
    expect(world.stats.signs.railUnguarded).toBe(0);
  });

  it("renders NO track bed — the rails themselves are still copy-only", () => {
    // The one gap that IS real: WorldGeometry has no track/sleeper primitive at
    // all (world/types.ts), so the crossing GRADES exactly (authored band +
    // timetable) while the rails are implied by the posts alone. Pinned as
    // documentation: `stats` exposes signs only, no track channel to count.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(Object.keys(world.stats)).not.toContain("track");
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
    // No lead anywhere: the drill stages nothing, so nothing is queue-innocent.
    expect(traffic.leadGapMeters(LANE, 15, 0)).toBe(Infinity);
  });
});
