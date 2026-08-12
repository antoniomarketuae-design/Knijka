/**
 * pk-banx-v1 contract battery (the ban-districts.test.ts pattern) — the
 * LAW-IMPLIED ban map behind sc-pk-crossing-ban (PK-06, ЗДвП чл. 98, ал. 1).
 *
 * pk-ban-v1 bans by SIGN (a В27 plate marks the span). This map bans by LAW:
 * the zebra and the junction corner ARE the ban, and no plate posts them. The
 * battery proves the file earns that claim:
 *  - the topology the ban's REASON needs: a real degree-4 unsignalized
 *    junction + a real marked crossing (not decoration);
 *  - the FP-armor precondition: ZERO stop lines and ZERO signals derive, so a
 *    rest inside a span is the authored fault and nothing else;
 *  - the spans surface on the tick exactly inside their arclength ranges, on
 *    the right host edges (the junction ban is TWO spans because the node
 *    splits the street — the schema forces it, the law justifies it);
 *  - the archetype's reason to exist end-to-end through the REAL reducer: a
 *    casual rest on either junction span grades exactly
 *    ILLEGAL_STOP_IN_BAN_ZONE, while the SAME rest behind a queue lead stays
 *    innocent and the legal bay never bills.
 *
 * It also PINS the one thing this map cannot yet teach — see the
 * „crossing-arm armor" describe block at the bottom.
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

const ID = "pk-banx-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const JUNCTION_Y = 150;
const ZEBRA_Y = 260;
const BAY_Y = 300;
/** The junction ban reaches halfRoad (8.125) + the statutory 5 m. */
const JX_BAN_M = 13.13;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_pk_banx.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document carrying THREE чл. 98 ban spans", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.meta.zonesVersion).toBe(1);
    expect(district.roads.nodes.length).toBe(5);
    expect(district.roads.edges.length).toBe(4);
    for (const e of district.roads.edges) {
      // The no-stop-line law: an arterial rank here would post a stop sign and
      // silently acquit every graded rest (buildStopLines).
      expect(e.class, e.id).toBe("residential");
      expect(e.lanes, e.id).toBe(2);
      expect(e.oneway, e.id).toBe(false);
      expect(e.maxspeed, e.id).toBe(50);
    }
    expect(district.zones).toHaveLength(3);
    for (const z of district.zones!) expect(z.kind).toBe("noStopping");
    expect(district.zones!.map((z) => z.id)).toEqual([
      "pkx-z-jx-before",
      "pkx-z-jx-after",
      "pkx-z-zebra",
    ]);
    // The junction ban is TWO spans on the two approach edges — the node
    // splits the street, so one legal rule needs two authored halves.
    const [before, after, zebra] = district.zones!;
    expect(before.edgeId).toBe("pkx-e-street-s");
    expect(before.toM).toBe(JUNCTION_Y);
    expect(before.fromM).toBeCloseTo(JUNCTION_Y - JX_BAN_M, 1);
    expect(after.edgeId).toBe("pkx-e-street-n");
    expect(after.fromM).toBe(0);
    expect(after.toM).toBeCloseTo(JX_BAN_M, 1);
    // The zebra span is authored in the HOST EDGE's arclength (street-n starts
    // at the junction), covering the 5 m before the band and the band itself.
    expect(zebra.edgeId).toBe("pkx-e-street-n");
    expect(zebra.fromM).toBeCloseTo(ZEBRA_Y - JUNCTION_Y - 5, 1);
    expect(zebra.toM).toBeCloseTo(ZEBRA_Y - JUNCTION_Y + 2.5, 1);
  });

  it("hosts the ban's REASON: a real degree-4 unsignalized junction + a real marked zebra", () => {
    expect(district.intersections).toHaveLength(1);
    const jx = district.intersections[0];
    expect(jx.id).toBe("pkx-n-jx");
    expect(jx.degree).toBe(4);
    expect(jx.signalized).toBe(false);
    expect(jx.y).toBe(JUNCTION_Y);
    // Four edges really do meet there (a declared degree is not a degree).
    const incident = district.roads.edges.filter((e) => e.from === jx.id || e.to === jx.id);
    expect(incident).toHaveLength(4);

    expect(district.crossings).toHaveLength(1);
    const zebra = district.crossings[0];
    expect(zebra.kind).toBe("marked");
    expect(zebra.signalized).toBe(false);
    expect(zebra.y).toBe(ZEBRA_Y);
    expect(zebra.x).toBe(0);
    expect(zebra.edgeId).toBe("pkx-e-street-n");

    expect(world.stats.zebraCrossings).toBeGreaterThanOrEqual(1);
    expect(world.trafficLights.length).toBe(0);
  });

  it("meta.scenario mirrors the committed geometry (the ScenarioSpec's single truth)", () => {
    const s = district.meta.scenario as {
      archetype: string;
      laneCenterRightM: number;
      params: { junctionY: number; zebraY: number; legalBayY: number; banBasis: string };
      banZonesY: Array<{ id: string; lawRef: string; fromY: number; toY: number }>;
    };
    expect(s.archetype).toBe("x-junction");
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.params.junctionY).toBe(JUNCTION_Y);
    expect(s.params.zebraY).toBe(ZEBRA_Y);
    expect(s.params.legalBayY).toBe(BAY_Y);
    expect(s.params.banBasis).toBe("law");
    expect(s.banZonesY).toHaveLength(3);
    for (const z of s.banZonesY) expect(z.lawRef).toMatch(/^ЗДвП чл\. 98/);
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
    // ILLEGAL_STOP_IN_BAN_ZONE structurally innocent (banZoneControl). All
    // four edges are `residential`, so the stop-sign heuristic never fires.
    expect(runtime.debugStopLines().length).toBe(0);
  });

  it("registers the junction as UNCONTROLLED (right-hand rule) — a real equal junction", () => {
    const uncontrolled = runtime.debugUncontrolledJunctions();
    expect(uncontrolled.map((j) => j.id)).toEqual(["pkx-n-jx"]);
  });

  it("flags noStopZone EXACTLY inside each authored span and nowhere else", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const flagOf = (y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, y, 0, 30), y, false).noStopZone;
    };
    // Clear road before the junction ban.
    expect(flagOf(100)).toBeUndefined();
    // чл. 98 т. 2 — both halves of the junction ban.
    expect(flagOf(JUNCTION_Y - 8)).toBe(true);
    expect(flagOf(JUNCTION_Y + 8)).toBe(true);
    // The gap between the junction ban and the zebra ban is legal road.
    expect(flagOf(200)).toBeUndefined();
    // чл. 98 т. 1 — the zebra approach + band.
    expect(flagOf(ZEBRA_Y - 3)).toBe(true);
    expect(flagOf(ZEBRA_Y + 1)).toBe(true);
    // The legal bay: the ONE place the drill may rest.
    expect(flagOf(BAY_Y)).toBeUndefined();
    // Nothing else leaks onto the tick.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, JUNCTION_Y - 8, 0, 30), 1, false);
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
  it("a casual 6 s rest BEFORE the junction (чл. 98 т. 2) grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    expect(violations(restDrive(140))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("a casual 6 s rest ON THE CORNER past the junction (чл. 98 т. 2) grades exactly ILLEGAL_STOP_IN_BAN_ZONE", () => {
    expect(violations(restDrive(160))).toEqual(["ILLEGAL_STOP_IN_BAN_ZONE"]);
  });

  it("the two demos really do rest in DIFFERENT authored spans", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const zoneAt = (y: number) => {
      rt.update(1 / 60);
      rt.sample(sample(LANE, y, 0, 0), y, false);
      const d = assertDistrict(loadRaw(ID));
      const edgeId = y <= JUNCTION_Y ? "pkx-e-street-s" : "pkx-e-street-n";
      const s = y <= JUNCTION_Y ? y : y - JUNCTION_Y;
      return d.zones!.find((z) => z.edgeId === edgeId && s >= z.fromM && s <= z.toM)?.id;
    };
    expect(zoneAt(140)).toBe("pkx-z-jx-before");
    expect(zoneAt(160)).toBe("pkx-z-jx-after");
  });

  it("the SAME junction rest behind a queue lead (gap 6 m) stays innocent — structural, not tuned", () => {
    expect(violations(restDrive(140, 6))).toEqual([]);
    expect(violations(restDrive(160, 6))).toEqual([]);
  });

  it("a brief 2 s junction stop stays innocent (under the 4 s sustain)", () => {
    expect(violations(restDrive(160, Infinity, 2))).toEqual([]);
  });

  it("the rest at the LEGAL BAY past the zebra never bills — the drill's goal is provably lawful", () => {
    expect(violations(restDrive(BAY_Y))).toEqual([]);
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
// The pinned gap — what this map cannot yet teach, and why
// ---------------------------------------------------------------------------

describe(`${ID} — the crossing-arm armor (PINNED current behaviour, not a wish)`, () => {
  it("a rest in the чл. 98 т. 1 zebra span does NOT convict today — the detector acquits it", () => {
    // WHY: ILLEGAL_STOP_IN_BAN_ZONE requires `s.crossing === null`, and
    // CrossingZoneTracker arms ~35 m out from any zebra and only disarms on
    // crossingPassed. So EVERY rest in the 5 m before a crossing — the exact
    // fault чл. 98 ал. 1 т. 1 names — reads as a possibly-lawful yielding stop
    // and is structurally innocent. The span is authored anyway: it is correct
    // law data and the geometry the fix will grade.
    //
    // THE FIX (rules/engine.ts, one clause): the armor is meant to protect a
    // driver who stopped FOR someone. Narrow `s.crossing === null` to
    // `!(s.crossing?.pedestrianSeen)` — an EMPTY crossing stops acquitting.
    // The locked contract case (ban-zone-detectors.test.ts, „a stop inside an
    // ARMED CROSSING ZONE never fires") arms with pedestrianOnCrossing: true,
    // so it stays green under that narrowing.
    //
    // WHEN THAT LANDS: this expectation flips to ["ILLEGAL_STOP_IN_BAN_ZONE"]
    // and sc-pk-crossing-ban's mistake demo can move to the zebra span. The
    // flip must be deliberate and visible — that is what this test buys.
    expect(violations(restDrive(ZEBRA_Y - 3))).toEqual([]);
  });

  it("the acquittal really is the crossing armor, not a missing span", () => {
    // Same rest, same map: the span IS flagged on the tick — so the zone data
    // is right and only the reducer's armor stands between it and a conviction.
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    expect(rt.sample(sample(LANE, ZEBRA_Y - 3, 0, 0), 1, false).noStopZone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Known render gap — the plate this map should not have
// ---------------------------------------------------------------------------

describe(`${ID} — zone sign posts (KNOWN GAP, pinned)`, () => {
  it("posts one В27 face per noStopping span, though чл. 98 posts no plate at all", () => {
    // builders/zoneSigns.ts places a В27 at every noStopping span start,
    // because until this map every such span WAS sign-posted. Here the bans are
    // law-implied, so these three posts are wrong-but-harmless furniture:
    // render-only, and grading reads the spans, never the posts.
    // FIX: a `posted?: boolean` on DistrictZone (default true ⇒ every shipped
    // map byte-identical) that zoneSigns honours; then this expects 0.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.noStopping).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the lane graph over the four-edge cross; zero traffic is a LEGAL config", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One graph lane per direction per edge (the traffic layer's convention).
    expect(graph.lanes.length).toBe(8);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(LANE, 15, 0)).toBe(Infinity);
  });
});
