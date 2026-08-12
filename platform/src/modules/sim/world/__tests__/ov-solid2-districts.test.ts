/**
 * ov-solid2-v1 contract battery (the pk-ban2-districts.test.ts pattern) — the
 * CLOSING-WINDOW road behind sc-ov-solid-return (OV-04 × OV-09 × SN-03; Наредба
 * № 2/2001 надлъжна маркировка М1/М2, ЗДвП чл. 42).
 *
 * ov-solid-v1 (shipped) puts its М1 span at y ∈ [90, 230] of a 340 m street and
 * hands the driver 75 m of dashed road — enough to teach „не пресичай" and not
 * one metre more. This map's whole claim is the opposite: the window in front of
 * the wall is REAL, generous and finite, so the drill can be the TIMING. The
 * battery proves the file earns that claim:
 *  - the window is long enough to hold a whole overtake AND the graded landing
 *    margin — the arithmetic that killed the reuse, pinned as an assertion;
 *  - the corridor CLEAN ROOM (the pk-ban2 precedent, pointed at a different
 *    detector): zero junction furniture, so nothing disarms the overtake
 *    trackers by geometry and the чл. 42 cut is convicted for the right reason;
 *  - the М1 seam surfaces on the tick exactly across its arclength — and, the
 *    load-bearing one, the DASHED road either side of it provably does NOT flag,
 *    because a solid flag at the landing meter would silently turn the
 *    late-cut demo into a solid-line demo;
 *  - the archetype's reason to exist end-to-end through the REAL reducer: the
 *    SAME wrong-bank excursion grades NOTHING at y = 200 (М2 — изпреварването е
 *    разрешено) and exactly CROSSED_SOLID_LINE at y = 350 (М1), on one road.
 *
 * М1 NOW RENDERED — the marking the drill needs a learner to SEE. The markings
 * builder reads district.zones and paints a solid осева over the М1 span
 * (suppressing the dashed centre line there); solidCenterLine remains a
 * marking-only kind with no sign face. Still RENDER-only (grading reads authored
 * spans, never paint). The last describe pins the closed gap so a regression
 * that stops the builder reading zones fails loudly. (The М2 „lengthened vs
 * wide" meaning conflict is a human content-review call, not resolved here.)
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

const ID = "ov-solid2-v1";
/** The single northbound lane center (1+1, PERCEPTUAL_ROAD_SCALE). */
const LANE = 4.06;
/** The committed-pass line on the oncoming bank (what the trace scripts ride). */
const OUT = -2.5;
/** Authored geometry — mirrored in meta.scenario (asserted below). */
const SPAWN_Y = 15;
const WARN_FROM_Y = 240;
const RETURN_BY_Y = 270;
const SOLID_FROM_Y = 300;
const SOLID_TO_Y = 500;
const LENGTH_M = 620;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ov_solid2.mjs) in: ${candidates.join(", ")}`);
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

  it("is a structurally valid district-v1 document: one rural 1+1 carrying ONE М1 span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.meta.zonesVersion).toBe(1);
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    for (const e of district.roads.edges) {
      // The corridor's own arming law (worldRuntime ocArmed): a two-way edge
      // with >= 2 marked lanes. A one-way or narrow road would hand every
      // excursion to a different adjudicator and this map would grade nothing.
      expect(e.lanes, e.id).toBe(2);
      expect(e.oneway, e.id).toBe(false);
      expect(e.maxspeed, e.id).toBe(90);
      expect(e.length, e.id).toBe(LENGTH_M);
    }
    expect(district.zones).toHaveLength(1);
    const [solid] = district.zones!;
    expect(solid.id).toBe("ovs2-z-solidcenterline");
    expect(solid.kind).toBe("solidCenterLine");
    expect(solid.signRef).toBe("М1");
    expect(solid.edgeId).toBe("ovs2-e-road");
    // The road is ONE edge on x = 0, so arclength EQUALS district y.
    expect(solid.fromM).toBe(SOLID_FROM_Y);
    expect(solid.toM).toBe(SOLID_TO_Y);
  });

  it("THE MAP'S REASON TO EXIST: the dashed window fits a whole overtake, ov-solid-v1's does not", () => {
    // The arithmetic that decided this file exists, as an assertion rather than
    // a paragraph. A ~62–80 km/h pass of an 11.1 m/s crawler needs ~100 m of
    // travel to gain its ~36 m of centers, plus pull-out and return arcs, plus
    // the 30 m landing margin the drill grades. ov-solid-v1 offers 75 m from
    // spawn to span — the maneuver does not fit before the wall AT ALL, which
    // is why the backlog's documented fallback was taken.
    const s = district.meta.scenario as { passWindowY: { fromY: number; toY: number; lengthM: number } };
    expect(s.passWindowY.fromY).toBe(SPAWN_Y);
    expect(s.passWindowY.toY).toBe(SOLID_FROM_Y);
    expect(s.passWindowY.lengthM).toBe(SOLID_FROM_Y - SPAWN_Y);
    expect(s.passWindowY.lengthM).toBeGreaterThanOrEqual(200);
    // …and the landing margin is real road, not a rounding: the meter the drill
    // asks you to be home by sits a full 30 m of dashes before the wall.
    expect(SOLID_FROM_Y - RETURN_BY_Y).toBe(30);
  });

  it("carries ZERO junction furniture — the overtake trackers' clean room, as data", () => {
    // The corridor AND the return tracker both disarm inside a junction area
    // (`nearestIx === null` is a hard precondition of ocArmed), and the return
    // adjudication discards its episode on any exit that is not a committed
    // return to the own bank. A junction near the window would therefore acquit
    // the чл. 42 cut this map exists to convict — silently, and for a reason
    // that has nothing to do with the law being taught.
    expect(district.intersections).toHaveLength(0);
    expect(district.crossings).toHaveLength(0);
    expect(district.roundabouts).toHaveLength(0);
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("meta.scenario mirrors the committed geometry (the ScenarioSpec's single truth)", () => {
    const s = district.meta.scenario as {
      archetype: string;
      lanesPerDirection: number;
      laneCenterRightM: number;
      laneCenterOncomingM: number;
      params: {
        lengthM: number;
        maxspeedKmh: number;
        banKind: string;
        banFromM: number;
        banToM: number;
        warnFromM: number;
        returnMarginM: number;
      };
      banZone: { id: string; kind: string; signRef: string; fromM: number; toM: number };
      warningDashSpanY: {
        fromY: number;
        toY: number;
        lengthM: number;
        markingRef: string;
        lawRef: string;
        graded: boolean;
      };
      returnByY: number;
    };
    expect(s.archetype).toBe("straight-street");
    expect(s.lanesPerDirection).toBe(1);
    expect(s.laneCenterRightM).toBe(LANE);
    expect(s.laneCenterOncomingM).toBe(-LANE);
    expect(s.params.lengthM).toBe(LENGTH_M);
    expect(s.params.maxspeedKmh).toBe(90);
    expect(s.params.banKind).toBe("solidCenterLine");
    expect(s.params.banFromM).toBe(SOLID_FROM_Y);
    expect(s.params.banToM).toBe(SOLID_TO_Y);
    expect(s.params.warnFromM).toBe(WARN_FROM_Y);
    expect(s.params.returnMarginM).toBe(30);
    expect(s.banZone.fromM).toBe(SOLID_FROM_Y);
    expect(s.banZone.toM).toBe(SOLID_TO_Y);
    expect(s.returnByY).toBe(RETURN_BY_Y);
    // The М2 предупредителна маркировка — the marking the whole template is
    // ABOUT, and the honest `graded: false` that says no detector reads it. It
    // runs INTO the solid span with no unmarked metre between (Наредба № 2):
    // that seam is what makes „остават ти шейсет метра" a true statement.
    expect(s.warningDashSpanY.fromY).toBe(WARN_FROM_Y);
    expect(s.warningDashSpanY.toY).toBe(SOLID_FROM_Y);
    expect(s.warningDashSpanY.toY).toBe(s.banZone.fromM);
    expect(s.warningDashSpanY.lengthM).toBe(60);
    expect(s.warningDashSpanY.markingRef).toBe("М2");
    expect(s.warningDashSpanY.graded).toBe(false);
    expect(s.warningDashSpanY.lawRef).toMatch(/^Наредба № 2\/2001/);
    // The warning must arrive before the meter it warns about, or it warns
    // nobody: the dashes lengthen 30 m before the drill's own landing mark.
    expect(s.warningDashSpanY.fromY).toBeLessThan(s.returnByY);
  });

  it("the spawns land where the drill needs them (start and landing on DASHED road, finish past the wall)", () => {
    const zoneAt = (y: number) => district.zones!.find((z) => y >= z.fromM && y < z.toM);
    const start = district.spawnPoints.find((s) => s.id === "ovs2-spawn-start")!;
    const returnBy = district.spawnPoints.find((s) => s.id === "ovs2-spawn-returnby")!;
    const finish = district.spawnPoints.find((s) => s.id === "ovs2-spawn-finish")!;
    expect(start.y).toBe(SPAWN_Y);
    expect(zoneAt(start.y)).toBeUndefined();
    // The contract as a coordinate: landing HERE is lawful — that is the point.
    expect(returnBy.y).toBe(RETURN_BY_Y);
    expect(zoneAt(returnBy.y)).toBeUndefined();
    expect(finish.y).toBe(LENGTH_M - 15);
    expect(zoneAt(finish.y)).toBeUndefined();
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

describe(`${ID} through the world runtime — one wall, and dashes either side of it`, () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw(ID));
  });

  it("derives ZERO signals, stop lines and junctions — nothing can disarm the corridor", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("flags solidCenterLine across the М1 span and NOWHERE else — the seam, meter by meter", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    const solidAt = (y: number) => {
      rt.update(1 / 60);
      return rt.sample(sample(LANE, y, 0, 60), y, false).solidCenterLine;
    };
    // The window: 285 m of dashed road, and every metre of it must stay clear.
    // This is the load-bearing half of the assertion — a solid flag leaking
    // backwards would turn the late-cut demo (which lands at y ≈ 284) into a
    // solid-line demo, and the two mistake cards would name the same fault.
    expect(solidAt(SPAWN_Y)).toBeUndefined();
    expect(solidAt(180)).toBeUndefined();
    expect(solidAt(WARN_FROM_Y)).toBeUndefined();
    expect(solidAt(RETURN_BY_Y)).toBeUndefined();
    expect(solidAt(SOLID_FROM_Y - 1)).toBeUndefined();
    // The wall.
    expect(solidAt(SOLID_FROM_Y + 1)).toBe(true);
    expect(solidAt(350)).toBe(true);
    expect(solidAt(SOLID_TO_Y - 1)).toBe(true);
    // The run-out: dashed again, so every drill can finish on legal road.
    expect(solidAt(SOLID_TO_Y + 5)).toBeUndefined();
    expect(solidAt(LENGTH_M - 15)).toBeUndefined();
    // Nothing else leaks onto the tick — this map bans nothing but the line.
    rt.update(1 / 60);
    const t = rt.sample(sample(LANE, 350, 0, 60), 1, false);
    expect(t.noOvertakeZone).toBeUndefined();
    expect(t.noStopZone).toBeUndefined();
    expect(t.noParkZone).toBeUndefined();
    expect(t.busLaneRight).toBeUndefined();
  });

  it("reports the opposing bank from the oncoming line the trace scripts ride", () => {
    // x = −2.5 is the committed-pass line every demo uses. If the locator ever
    // stopped calling it the opposing bank, CROSSED_SOLID_LINE would go silent
    // and the whole template would pass its shadow while grading nothing.
    const rt = createWorldRuntime(loadRaw(ID));
    rt.update(1 / 60);
    expect(rt.sample(sample(OUT, 350, 0, 60), 1, false).opposingBank).toBe(true);
    rt.update(1 / 60);
    expect(rt.sample(sample(LANE, 350, 0, 60), 2, false).opposingBank).not.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

/** Drive north in the OWN lane to `outY`, cross fully onto the oncoming bank,
 *  ride it for `rideM`, return, and drive on to the end — the shape of all
 *  three authored demos, reduced to its skeleton. */
function excursionDrive(outY: number, rideM: number): RuleEvent[] {
  const rt = createWorldRuntime(loadRaw(ID));
  let rules = createRuleEngine();
  const out: RuleEvent[] = [];
  const dt = 0.1;
  let t = 0;
  const kmh = 60;
  const step = (x: number, y: number) => {
    t += dt;
    rt.update(dt);
    const r = reduceTick(rules, rt.sample(sample(x, y, 0, kmh), t, false));
    rules = r.state;
    out.push(...r.events);
  };
  const dy = (kmh / 3.6) * dt;
  for (let y = SPAWN_Y; y < outY; y += dy) step(LANE, y);
  for (let y = outY; y < outY + rideM; y += dy) step(OUT, y);
  for (let y = outY + rideM; y < LENGTH_M - 20; y += dy) step(LANE, y);
  return out;
}

const violations = (events: RuleEvent[]) =>
  [...new Set(events.filter((e) => e.kind === "violation").map((e) => e.code))];

describe(`${ID} — the М2/М1 adjudication through the real reducer`, () => {
  it("THE TEMPLATE, IN ONE PAIR: the same excursion is innocent on М2 and опасна on М1", () => {
    // Identical maneuver, identical speed, identical everything but the METER.
    // This pair is the scenario's whole thesis, proven through the production
    // reducer rather than asserted in prose — and it is the pair ov-solid-v1
    // physically cannot host, because it has no lawful window to be innocent in.
    expect(violations(excursionDrive(150, 60))).toEqual([]);
    expect(violations(excursionDrive(330, 60))).toEqual(["CROSSED_SOLID_LINE"]);
  });

  it("an excursion that STARTS lawfully and ENDS on the wall still bills — the fault the template is named for", () => {
    // Out at y = 250 (dashed, lawful), still out at y = 310 (solid): exactly the
    // mistake-return-on-solid shape. „Започнах законно" is not a defense — the
    // marking grades where the maneuver IS, every metre of it.
    expect(violations(excursionDrive(250, 90))).toEqual(["CROSSED_SOLID_LINE"]);
  });

  it("a pass that lands on the very last dashed metre stays innocent — the window is real", () => {
    // The counter-proof that keeps the drill honest: the wall is not a scare,
    // it is a deadline. A driver who is home at y = 299 has broken nothing, and
    // the reducer says so. If this ever bills, the template would be teaching
    // „не изпреварвай" — which is sc-ov-solid-line's job, not this one's.
    expect(violations(excursionDrive(180, 115))).toEqual([]);
  });

  it("ONE excursion across the line bills ONCE (the return through the paint must not double-bill)", () => {
    const codes = excursionDrive(330, 60).filter(
      (e) => e.kind === "violation" && e.code === "CROSSED_SOLID_LINE",
    );
    expect(codes).toHaveLength(1);
  });

  it("a lane-holding drive the whole length stays innocent (the shadow's spine)", () => {
    const rt = createWorldRuntime(loadRaw(ID));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    for (let y = SPAWN_Y; y < LENGTH_M - 20; y += (70 / 3.6) * dt) {
      t += dt;
      rt.update(dt);
      const r = reduceTick(rules, rt.sample(sample(LANE, y, 0, 70), t, false));
      rules = r.state;
      out.push(...r.events);
    }
    expect(out.filter((e) => e.kind === "violation")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Known render gap — the marking the drill most needs a learner to SEE
// ---------------------------------------------------------------------------

describe(`${ID} — marking furniture (М1 осева now RENDERED)`, () => {
  it("paints the solid осева over the М1 span while posting no sign — the gap is closed", () => {
    // GAP CLOSED (zone-driven marking renderer, markings.ts): markings.ts now
    // reads district.zones and paints a SOLID осева over a solidCenterLine span
    // (suppressing the dashed centre line there), so the wall the drill asks a
    // learner to read is finally drawn. solidCenterLine stays a MARKING-ONLY
    // kind — it posts NO sign (zoneSigns.ts has no entry), and grading still
    // reads the authored span, never the paint. (The М2 „lengthened / wide"
    // meaning conflict between gen_ov_solid2 and gen_motorway is a human
    // content-review call and is NOT resolved here; ov-solid2 authors only the
    // one М1 span.)
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    // Still not one sign is derived from the zone layer: the М1 span posts
    // nothing, because marking kinds post nothing.
    for (const kind of ["noOvertaking", "noStopping", "slippery", "curve"] as const) {
      expect(world.stats.signs[kind] ?? 0, kind).toBe(0);
    }
    expect(zoneSignKindHandles("solidCenterLine")).toBe(false);
    // The builder now consults the zone layer, and the marking buffer differs
    // across the seam: stripping the zones drops the solid osева + restores the
    // dashes it replaced (fewer/other quads → a different buffer length).
    expect(markingsBuilderReadsZones()).toBe(true);
    const zoneless = buildWorldGeometry(assertDistrict({ ...(loadRaw(ID) as District), zones: undefined }), {
      seed: 7,
    });
    expect(world.stats.markingQuads).not.toBe(zoneless.stats.markingQuads);
    expect(world.markings.positions.length).not.toBe(zoneless.markings.positions.length);
  });

  it("posts the edge's OWN limit — the 50-plate-on-a-90-road quirk this test recorded is gone", () => {
    // WAS: „props.ts posts one speed plate per edge end, and its only limit
    // face is `limit50` — so a 90 km/h road gets two „50" plates it should not
    // have." That inherited quirk is doc 86 T4, and it was the single most
    // legible falsehood in the simulator: 82 of the 211 shipped plates, across
    // 37 districts, stated 50 on a road the reducer grades at 20/30/40/70/90/140.
    // A student who reads the plate and holds 50 on this road is not speeding —
    // but on a 40 street the same plate convicts him at 44.
    //
    // The face set is now one per numeral (types.ts SPEED_LIMIT_FACES_KMH,
    // rasterised from content/signs/svg/v26.svg), and props.ts derives the face
    // from ap.edge.maxspeed. So this map states 90, and NOTHING states 50.
    const world = buildWorldGeometry(assertDistrict(loadRaw(ID)), { seed: 7 });
    expect(world.stats.signs.limit50).toBe(0);
    expect(world.stats.signs.limit90).toBe(3); // 2 entry ends + the mid-route
    expect(world.signs.filter((s) => s.speedKmh !== undefined).every((s) => s.speedKmh === 90)).toBe(
      true,
    );
    const shipped = buildWorldGeometry(assertDistrict(loadRaw("ov-oncoming-v1")), { seed: 7 });
    expect(shipped.stats.signs.limit50).toBe(0);
    expect(shipped.stats.signs.limit90).toBeGreaterThanOrEqual(2);
  });
});

/** Documentation-as-assertion (the pk-ban2-districts.test.ts scoped-regex
 *  precedent): the sign builder's kind table has no solidCenterLine entry, so no
 *  authored М1 span can post a plate. Kept as a function so the claim above is
 *  checkable, not folklore. */
function zoneSignKindHandles(kind: string): boolean {
  const src = fs.readFileSync(path.resolve(__dirname, "..", "builders", "zoneSigns.ts"), "utf8");
  const from = src.indexOf("ZONE_SIGN_KIND");
  return new RegExp(`${kind}\\s*:`).test(src.slice(from, src.indexOf("};", from)));
}

/** Gap-closed check: the markings builder now reads district.zones, so an
 *  authored span changes what is painted (a solid осева over an М1 span). */
function markingsBuilderReadsZones(): boolean {
  const src = fs.readFileSync(path.resolve(__dirname, "..", "builders", "markings.ts"), "utf8");
  return /\bzones\b/.test(src);
}

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe(`${ID} through the traffic lane graph + system`, () => {
  it("builds the lane graph over the single road; zero ambient traffic is a LEGAL config", () => {
    const raw = loadRaw(ID) as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // One graph lane per direction on the one edge (the traffic layer's
    // convention) — the staged crawler rides the northbound one, the oncoming
    // stream the southbound one.
    expect(graph.lanes.length).toBe(2);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    // No ambient lead anywhere: the only car in front of the player is the one
    // the lesson stages, which is what makes the demos comparable.
    expect(traffic.leadGapMeters(LANE, SPAWN_Y, 0)).toBe(Infinity);
  });
});
