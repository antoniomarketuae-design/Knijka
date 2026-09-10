/**
 * pk-rail-v1 contract battery (the pk-busstop-districts.test.ts pattern) — the
 * RAIL-CROSSING ban map behind sc-pk-rail-ban (PK-06 + RX-03; ЗДвП чл. 98).
 *
 * Every other чл. 98 map bans with ONE data layer. This one is the first
 * district where the ban spans and a railCrossing band share a street, and its
 * whole claim is that the two layers SPLIT the geography on the band edge:
 *  - the чл. 98, ал. 1, т. 4 spans own [199.21, 200] and [206, 206.79] — the
 *    part of the act's two metres that lies outside the band — and a rest there
 *    is основна (ILLEGAL_STOP_IN_BAN_ZONE);
 *  - the band [200, 206] carries NO ban span, because the rail zone's
 *    rest-on-tracks arm already owns it with a HEAVIER code (опасна,
 *    RAIL_CROSSING_VIOLATION detail "stopped-on-track") and — the asymmetry
 *    that is the whole lesson — with NO queue exemption.
 *
 * THE SPANS ARE ANCHORED TO THE FIRST/LAST RAIL, NOT THE BAND EDGE, and the two
 * are 1.20625 m apart: builders/railTrack.ts draws the rails at the band centre
 * ∓ RAIL_GAUGE_M / 2 = 203 ∓ 1.79375. Anchoring to the band edge (the first cut
 * of the 2026-09-10 re-cut) made the convicted ground start 3.21 m from the
 * steel while the card it prints quotes чл. 51, ал. 4 «не по-малко от 2 метра
 * преди първата релса» — card and world disagreeing about a number, which is
 * the defect the re-cut existed to remove. `the act's two metres are measured
 * from the rails the renderer draws` below pins the derivation against the real
 * RAIL_GAUGE_M, so the boundary cannot drift when a drawing constant moves.
 *
 * AND EVERY METRE BILLS EXACTLY ONE CODE — proven by driving the whole stretch
 * through `createWorldRuntime` in `THE CENSUS`, not asserted in a comment. It
 * does not follow from the spans abutting: the band is read from the lane fix
 * (a POINT) and a no-stopping span from the vehicle's reach (a BODY), so a car
 * resting on the deck used to overhang the span behind it and arm both flags —
 * 4.04 m of a 6 m band billed twice. `runtime/worldRuntime.ts` now refuses to
 * arm a noStopping span on any metre a railCrossing span covers.
 *
 * THE SPANS WERE [150, 200] AND [206, 256] UNTIL 2026-09-10, i.e. 50 m either
 * side of the band, and this battery pinned that number as though it were law.
 * It is not: ЗДвП чл. 98, ал. 1, т. 4 states a FUNCTIONAL test with no metre in
 * it («в такава близост до тях, която може да затрудни движението на релсовите
 * превозни средства»), and the only rail distance the act gives for a standing
 * vehicle is 2 m — чл. 51, ал. 4 («не по-малко от 2 метра преди първата релса»),
 * чл. 53, ал. 2 and чл. 54, ал. 1. The project's own question bank had already
 * ruled: q-spirane-i-parkirane-056 keys «Няма мярка в метри» CORRECT and «на
 * по-малко от 50 метра от двете му страни» false, calling it «ИЗМИСЛЕНО ЧИСЛО».
 * So the numbers below moved to the retrieved ones, and the assertions that
 * could only pass while the myth held were CHANGED rather than deleted — each
 * carries its own note.
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
import { PLAYER_HALF_LENGTH_M } from "../../collision/bodies";
import { RAIL_GAUGE_M } from "../builders/railTrack";
import { buildLaneGraph } from "../../traffic/graph";
import { createTrafficSystem } from "../../traffic/system";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

const ID = "pk-rail-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const BAN_BEFORE_FROM_Y = 199.21;
const BAND_FROM_Y = 200;
const BAND_TO_Y = 206;
const BAN_AFTER_TO_Y = 206.79;
const BAY_Y = 330;
const STOP_LINE_Y = 195;
/** The act's own rail clearance — the reach of each span, measured from the
 *  RAIL rather than the band edge (see the header). */
const LAW_RAIL_CLEAR_M = 2;
/** Where builders/railTrack.ts draws the steel: the band centre ∓ half the
 *  gauge. Imported, never typed — this is what makes the boundary derived. */
const FIRST_RAIL_Y = (BAND_FROM_Y + BAND_TO_Y) / 2 - RAIL_GAUGE_M / 2;
const LAST_RAIL_Y = (BAND_FROM_Y + BAND_TO_Y) / 2 + RAIL_GAUGE_M / 2;
/** Where the two mistake demos rest — one per detector. The ban demo's CENTRE
 *  is short of the span; its NOSE is 1.19 m from the first rail, which is what
 *  чл. 51, ал. 4 measures and what the runtime's body test reads. */
const REST_BAN_Y = 198;
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

  it("the act's two metres are measured from the RAILS the renderer draws, not from the band edge", () => {
    // F1, pinned against the real drawing constant. `RAIL_GAUGE_M` is imported
    // from builders/railTrack.ts — the module that lays the steel — so if the
    // gauge ever moves, this fails until tools/maps/gen_pk_rail.mjs is re-run.
    // The band edge is NOT the rail: 200 vs 201.20625, a 1.20625 m difference
    // that would make the card's «не по-малко от 2 метра преди първата релса»
    // (чл. 51, ал. 4) describe ground the map does not convict.
    const [before, , after] = district.zones!;
    expect(FIRST_RAIL_Y).toBeCloseTo(201.20625, 6);
    expect(LAST_RAIL_Y).toBeCloseTo(204.79375, 6);
    // Stored to the centimetre and rounded INWARD, so the convicted strip is
    // never longer than the article — 1.99625 m here, 3.75 mm short of 2.
    expect(FIRST_RAIL_Y - before.fromM).toBeLessThanOrEqual(LAW_RAIL_CLEAR_M);
    expect(FIRST_RAIL_Y - before.fromM).toBeGreaterThan(LAW_RAIL_CLEAR_M - 0.02);
    expect(after.toM - LAST_RAIL_Y).toBeLessThanOrEqual(LAW_RAIL_CLEAR_M);
    expect(after.toM - LAST_RAIL_Y).toBeGreaterThan(LAW_RAIL_CLEAR_M - 0.02);
    // The map publishes the rail coordinates rather than making every reader
    // recompute them (meta.scenario.railCrossing).
    const rc = (district.meta.scenario as { railCrossing: Record<string, number> }).railCrossing;
    expect(rc.firstRailM).toBeCloseTo(FIRST_RAIL_Y, 2);
    expect(rc.lastRailM).toBeCloseTo(LAST_RAIL_Y, 2);
  });

  it("the two layers ABUT the band and never overlap it — the map's central law, as data", () => {
    const [before, rail, after] = district.zones!;
    // No legal metre between y = 199.21 and y = 206.79…
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
    // RETRIEVED, not chosen: чл. 51, ал. 4 / чл. 53, ал. 2 / чл. 54, ал. 1. Any
    // larger number here is the map asserting a distance no article contains.
    // It is a reach FROM THE RAIL, so each span is the 2 m less the 1.20625 m
    // the band already owns — 0.79 m of чл. 98 ground on each side, and the
    // remainder convicted by the heavier rail code.
    expect(s.params.banReachM).toBe(LAW_RAIL_CLEAR_M);
    /** The act's reach less the band-edge-to-rail inset the band already owns. */
    const spanLenM = LAW_RAIL_CLEAR_M - (FIRST_RAIL_Y - BAND_FROM_Y);
    expect(spanLenM).toBeCloseTo(0.79375, 6);
    expect(BAND_FROM_Y - BAN_BEFORE_FROM_Y).toBeCloseTo(spanLenM, 2);
    expect(BAN_AFTER_TO_Y - BAND_TO_Y).toBeCloseTo(spanLenM, 2);
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
    // The точка, not a bare «чл. 98»: т. 4 is the rail clause, and the card the
    // student reads resolves off it (rules/catalog.ts NO_STOP_BASIS_COPY).
    for (const z of s.banZonesY) expect(z.lawRef).toBe("ЗДвП чл. 98, ал. 1, т. 4");
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
    // THE BOUNDARY IS THE CAR'S, NOT THE CENTRE'S (2026-09-10). This probe read
    // `toBeUndefined()` while the runtime tested the lane fix — a POINT —
    // against the span; it now tests the vehicle's reach along the edge
    // (PLAYER_HALF_LENGTH_M = 2.02 m, headingDeg 0 ⇒ exactly that). чл. 98,
    // ал. 1, т. 4 bans standing «върху трамвайни и железопътни линии или в
    // такава близост до тях, която може да затрудни движението на релсовите
    // превозни средства» (retrieved: content/law/acts/zdvp.json, unit ref
    // "чл. 98") — a bumper inside the run-up is what затруднява the tram, and
    // it is the bumper the article is about.
    //
    // TIGHTENED, NOT RELAXED: pinned from both sides, and against the ARTICLE
    // rather than against a span coordinate. Because the referent is the body,
    // the flag arms exactly when the car's nearest part comes within
    // LAW_RAIL_CLEAR_M of the steel — which is how «спират на разстояние не
    // по-малко от 2 метра преди първата релса» is measured in the first place.
    const noseAt = (gapToRailM: number) => FIRST_RAIL_Y - gapToRailM - PLAYER_HALF_LENGTH_M;
    expect(flagOf(noseAt(LAW_RAIL_CLEAR_M - 0.05))).toBe(true); // nose 1.95 m out
    expect(flagOf(noseAt(LAW_RAIL_CLEAR_M + 0.05))).toBeUndefined(); // nose 2.05 m out
    // The approach ban, and the demo's own rest (nose 1.19 m from the rail).
    expect(flagOf(REST_BAN_Y)).toBe(true);
    expect(flagOf(BAND_FROM_Y - 1)).toBe(true);
    // THE BAND: no ban flag — the rail zone owns these six metres alone, and
    // THE CENSUS below drives every one of them to prove it.
    expect(flagOf(REST_RAILS_Y)).toBeUndefined();
    // The run-out ban: the mirror, measured from the LAST rail (чл. 54, ал. 1
    // says «преди първата ИЛИ след последната релса» in one breath).
    const tailAt = (gapToRailM: number) => LAST_RAIL_Y + gapToRailM + PLAYER_HALF_LENGTH_M;
    expect(flagOf(BAND_TO_Y + 1)).toBe(true);
    expect(flagOf(tailAt(LAW_RAIL_CLEAR_M - 0.05))).toBe(true);
    expect(flagOf(tailAt(LAW_RAIL_CLEAR_M + 0.05))).toBeUndefined();
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

  it("phases the rail band exactly, and the ban span sits INSIDE the approach window", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const phaseOf = (y: number) => {
      rt.update(1 / 60);
      const t = rt.sample(sample(LANE, y, 0, 25), 1, false);
      return { phase: t.railCrossing, guarded: t.railGuarded, barred: t.railBarred };
    };
    // Absent before the approach window opens (30 m out = y 170)…
    expect(phaseOf(BAND_FROM_Y - RAIL_APPROACH_M - 5).phase).toBeUndefined();
    // …"approach" inside it. THIS EXPECTATION WAS INVERTED 2026-09-10 and the
    // inversion is the finding, not a weakening. It used to read „the ban span
    // already started 20 m EARLIER (y = 150) … you are forbidden to stop before
    // the crossing even announces itself" — a shape that only existed because
    // the map banned 50 m, which no article gives. The road out here is LEGAL
    // road: the reducer calls it an approach, and the student may stop on it.
    // What must hold is the containment — every metre the ban convicts is
    // already inside the phase window, so the two layers agree about where the
    // crossing's influence begins.
    expect(phaseOf(BAND_FROM_Y - RAIL_APPROACH_M + 5).phase).toBe("approach");
    const rt2 = createWorldRuntime(loadRaw(ID));
    rt2.update(1 / 60);
    expect(rt2.sample(sample(LANE, BAND_FROM_Y - RAIL_APPROACH_M + 5, 0, 25), 1, false).noStopZone)
      .toBeUndefined();
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

  it("THE CENSUS: every position from the run-up to the run-out bills EXACTLY ONE code", () => {
    // F2, and it is DRIVEN rather than asserted. The header's claim — „no legal
    // metre between and no double-billed one either" — does not follow from the
    // spans abutting in the data, because the two layers have different
    // referents: `railCrossing` is read from the lane fix (a POINT) and a
    // noStopping span from the vehicle's reach (a BODY). Measured on the first
    // cut of this change, at heading 0 where the body half-extent is
    // PLAYER_HALF_LENGTH_M = 2.02 m exactly: y = 200, 201, 202, 204, 205 and 206
    // ALL reported noStopZone true while inside the band — 4.04 m of a 6 m deck
    // carrying both flags, i.e. ILLEGAL_STOP_IN_BAN_ZONE (основна 3) and
    // RAIL_CROSSING_VIOLATION (опасна 10) for one act, with nothing in
    // rules/engine.ts to notice. worldRuntime.ts now refuses to arm a
    // noStopping span on any metre a railCrossing span covers.
    const rt = createWorldRuntime(loadRaw(ID));
    const at = (y: number) => {
      rt.update(1 / 60);
      const t = rt.sample(sample(LANE, y, 0, 20), 1, false);
      return { ban: t.noStopZone === true, onBand: t.railCrossing === "on" };
    };
    /** The outermost centre positions that still convict — the body reach. */
    const BAN_OPENS_Y = BAN_BEFORE_FROM_Y - PLAYER_HALF_LENGTH_M; // 197.19
    const BAN_CLOSES_Y = BAN_AFTER_TO_Y + PLAYER_HALF_LENGTH_M; // 208.81
    const both: number[] = [];
    const neither: number[] = [];
    for (let y = BAN_OPENS_Y; y <= BAN_CLOSES_Y + 1e-9; y = Math.round((y + 0.05) * 1e6) / 1e6) {
      const { ban, onBand } = at(y);
      if (ban && onBand) both.push(y);
      if (!ban && !onBand) neither.push(y);
    }
    // NOT ONE position carries both codes…
    expect(both).toEqual([]);
    // …and not one carries neither: the convicted stretch is unbroken from the
    // first metre the nose enters the act's 2 m to the last the tail leaves it.
    expect(neither).toEqual([]);
    // The split itself, spot-checked at the exact metres the audit measured.
    for (const y of [200, 201, 202, 203, 204, 205, 206]) {
      expect(at(y), `y=${y} must be the rail zone's alone`).toEqual({ ban: false, onBand: true });
    }
    for (const y of [197.5, 198, 199, 199.9]) {
      expect(at(y), `y=${y} must be чл. 98 ground`).toEqual({ ban: true, onBand: false });
    }
    for (const y of [206.5, 207, 208, 208.8]) {
      expect(at(y), `y=${y} must be чл. 98 ground`).toEqual({ ban: true, onBand: false });
    }
    // And the ground outside is legal on BOTH counts — the 50 m myth, refuted
    // as geometry rather than as prose.
    for (const y of [190, 197, 209, 230]) {
      expect(at(y), `y=${y} must be legal road`).toEqual({ ban: false, onBand: false });
    }
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
    // The ban is symmetric — чл. 54, ал. 1 says «преди първата ИЛИ след
    // последната релса» in one breath — so „минах прелеза, вече може" is the
    // same fault ONE metre past the band. It was measured at +20 m while the
    // map banned 50; +20 is legal road now, and the case below proves it is,
    // rather than leaving the change as a silently smaller number.
    expect(violations(restDrive(BAND_TO_Y + 1))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("…and a rest 20 m past the band bills NOTHING — the 50 m myth, refuted here", () => {
    // The single most load-bearing case in this file after the re-cut. A car
    // standing 20 m clear of a level crossing on an empty residential street
    // breaks no article in content/law/acts/: чл. 98, ал. 1, т. 4 asks whether
    // it hinders rail traffic, and nothing in this engine says it does. Until
    // 2026-09-10 the sim convicted it anyway, while the theory bank taught that
    // the number behind that conviction is a myth (q-spirane-i-parkirane-056).
    expect(violations(restDrive(BAND_TO_Y + 20))).toEqual([]);
    expect(violations(restDrive(BAND_FROM_Y - 25))).toEqual([]);
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

  it("a rest on the deck EDGE bills the rail code ALONE — one act is never two bills", () => {
    // F2, end to end through the reducer. y = 201 and y = 205 are the positions
    // where the car's body (± PLAYER_HALF_LENGTH_M) overhangs a чл. 98 span
    // while its centre stands on the band. Before the fix each of them produced
    // BOTH events: ILLEGAL_STOP_IN_BAN_ZONE (основна 3) and
    // RAIL_CROSSING_VIOLATION (опасна 10) for one stop, 13 точки for a single
    // act. The band is the graver and the more specific rule, so it takes the
    // ground outright.
    for (const y of [BAND_FROM_Y + 1, BAND_TO_Y - 1]) {
      const events = restDrive(y).filter((e) => e.kind === "violation");
      expect(events.map((e) => e.code), `y=${y}`).toEqual(["RAIL_CROSSING_VIOLATION"]);
    }
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
