/**
 * BLIND-CURVE OVERTAKING-BAN archetype contract battery (the curve-districts /
 * ban-districts pattern) — doc 72 §10 OV-06 × OV-05 × SP-05, ЗДвП чл. 43.
 *
 * content/world/ov-crest-v1.json (tools/maps/gen_ov_crest.mjs) is the first map
 * that carries TWO zone kinds at once on ONE edge: a В24 "noOvertaking" span
 * that starts 90 m BEFORE the arc and an А1 "curveAdvisory" span that IS the
 * arc, both ending together where the sightline reopens. The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - both spans surface on the tick EXACTLY where they are authored, and the
 *    LEGAL WINDOW past them is genuinely free of both — the passing straight
 *    the scenario sends the driver to is span-less by construction, not by
 *    hope;
 *  - the LOCATOR BEHAVES ON THE ARC (the sp-curve precedent) on BOTH banks —
 *    including the opposing-bank flip the overtake-corridor tracker needs;
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    holding ~54 km/h through the advisory-40 arc grades exactly
 *    SPEED_TOO_FAST_FOR_CURVE, never a turn code and never a speeding code;
 *  - THE STRUCTURAL LIMIT that shapes the scenario (the load-bearing negative):
 *    on a 1+1 the opposing-bank flip renumbers NO lane (laneId 0 on both banks
 *    — locator.ts), and OVERTAKING_IN_BAN_ZONE fires only off a laneId DELTA
 *    (rules/engine.ts stage 3). So the В24 span here GRADES NOTHING, by
 *    construction: it posts the sign, feeds tick.noOvertakeZone, and carries
 *    the teach copy, while the conviction for passing in the blind curve comes
 *    from the corridor tracker (OVERTAKE_INSUFFICIENT_GAP). This test pins that
 *    fact so the day the detector learns about 1+1 banks, it fails LOUDLY here
 *    and the template gains its code deliberately.
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

/** ov-crest-v1 truths (generator params — asserted against the file below). */
const LANE_X = 4.06; // right-lane center offset (1+1)
const APPROACH_M = 240;
const RADIUS_M = 135;
const EXIT_M = 450;
const ADVISORY_KMH = 40;
const LIMIT_KMH = 90;
const BAN_AHEAD_M = 90;
const BAN_FROM = 150;
const ARC_FROM = 240;
const ARC_TO = 452.04;
const LEGAL_WINDOW_M = 450;
const EDGE_ID = "ovc-e-road";
/** Arc center + inside-lane radius. */
const CX = RADIUS_M;
const CY = APPROACH_M;
const R_LANE = RADIUS_M - LANE_X; // 130.94
/** Exit-leg lane centers: own (eastbound, south side) and the oncoming bank. */
const EXIT_LANE_Y = APPROACH_M + RADIUS_M - LANE_X; // 370.94
const EXIT_ONCOMING_LANE_Y = APPROACH_M + RADIUS_M + LANE_X; // 379.06

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_ov_crest.mjs) in: ${candidates.join(", ")}`);
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

/**
 * Pose on the INSIDE-LANE path (approach lane → inside arc → exit lane) at
 * arclength s, meters. `bank` −1 mirrors the lane across the centerline onto
 * the OPPOSING bank at the same arclength (the overtake excursion's pose).
 */
const ARC_LANE_LEN = (R_LANE * Math.PI) / 2; // 205.70
function lanePose(s: number, bank: 1 | -1 = 1): { x: number; y: number; headingDeg: number } {
  const off = bank * LANE_X;
  if (s <= APPROACH_M) return { x: off, y: s, headingDeg: 0 };
  const rLane = RADIUS_M - off;
  const sArc = s - APPROACH_M;
  const arcLen = (rLane * Math.PI) / 2;
  if (sArc <= arcLen) {
    const th = sArc / rLane; // radians swept
    return {
      x: CX - rLane * Math.cos(th),
      y: CY + rLane * Math.sin(th),
      headingDeg: (th * 180) / Math.PI,
    };
  }
  const sExit = sArc - arcLen;
  return { x: CX + sExit, y: CY + rLane, headingDeg: 90 };
}

describe("ov-crest-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw("ov-crest-v1");
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document carrying TWO authored spans", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.id).toBe(EDGE_ID);
    expect(road.lanes).toBe(2); // 1+1 — the rural blind curve, not a boulevard
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(LIMIT_KMH); // the honest extra-urban 90
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
    expect(district.zones).toHaveLength(2);

    const ban = district.zones![0];
    expect(ban.kind).toBe("noOvertaking");
    expect(ban.signRef).toBe("В24");
    expect(ban.edgeId).toBe(EDGE_ID);
    expect(ban.fromM).toBe(BAN_FROM);
    expect(ban.toM).toBe(ARC_TO);
    expect(ban.advisoryKmh).toBeUndefined(); // the span IS the ban

    const curve = district.zones![1];
    expect(curve.kind).toBe("curveAdvisory");
    expect(curve.signRef).toBe("А1");
    expect(curve.edgeId).toBe(EDGE_ID);
    expect(curve.fromM).toBe(ARC_FROM);
    expect(curve.toM).toBe(ARC_TO);
    expect(curve.advisoryKmh).toBe(ADVISORY_KMH);
  });

  it("the ban starts at the SIGN and both spans end together where the sight reopens", () => {
    const [ban, curve] = district.zones!;
    // „Маневрата трябва да ЗАВЪРШИ преди зоната" — the ban reaches back
    // banAheadM before the bend so a pass begun „on the edge" is already
    // inside it.
    expect(curve.fromM - ban.fromM).toBeCloseTo(BAN_AHEAD_M, 2);
    expect(ban.toM).toBe(curve.toM);
    // …and the exit straight past them is the LEGAL window — long enough for a
    // whole pass, which is what makes „изчакай до правата" an instruction and
    // not a taunt.
    const sc = district.meta.scenario as { legalWindowM?: number } | undefined;
    expect(sc?.legalWindowM).toBe(LEGAL_WINDOW_M);
    expect(district.roads.edges[0].length - ban.toM).toBeCloseTo(LEGAL_WINDOW_M, 2);
  });

  it("meta.scenario mirrors the geometry the templates pin by value (the L7 copy law)", () => {
    const sc = district.meta.scenario as {
      archetype?: string;
      laneCenterRightM?: number;
      laneCurveMid?: { x: number; y: number };
      exitLaneY?: number;
      exitOncomingLaneY?: number;
      params?: Record<string, number>;
    };
    expect(sc.archetype).toBe("rural-curve");
    expect(sc.laneCenterRightM).toBe(LANE_X);
    expect(sc.exitLaneY).toBeCloseTo(EXIT_LANE_Y, 2);
    expect(sc.exitOncomingLaneY).toBeCloseTo(EXIT_ONCOMING_LANE_Y, 2);
    expect(sc.params).toMatchObject({
      approachM: APPROACH_M,
      radiusM: RADIUS_M,
      sweepDeg: 90,
      exitM: EXIT_M,
      maxspeedKmh: LIMIT_KMH,
      advisoryKmh: ADVISORY_KMH,
      banAheadM: BAN_AHEAD_M,
    });
    // The mid-arc patience gate the ScenarioSpec pins — must BE the lane.
    const mid = lanePose(APPROACH_M + ARC_LANE_LEN / 2);
    expect(sc.laneCurveMid!.x).toBeCloseTo(mid.x, 1);
    expect(sc.laneCurveMid!.y).toBeCloseTo(mid.y, 1);
  });

  it("the arc is a well-sampled polyline (≤ 10 m chords) between the straights", () => {
    const g = district.roads.edges[0].geometry;
    expect(g.length).toBeGreaterThan(30); // 2 straight ends + 36 arc chords
    for (let i = 2; i < g.length - 1; i++) {
      const chord = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      expect(chord, `chord ${i}`).toBeLessThanOrEqual(10);
    }
    // The spans match the polyline's own arclength metric (the sM measure).
    let cum = 0;
    for (let i = 1; i < g.length; i++) cum += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    expect(Math.abs(cum - district.roads.edges[0].length)).toBeLessThan(0.05);
  });

  it("hosts a plain rural road: no lights, no stop signs, no zebras, no junctions", () => {
    expect(district.intersections.length).toBe(0); // the turn-detector gate
    expect(world.trafficLights.length).toBe(0);
    expect(world.stats.signs.stop).toBe(0);
    expect(world.stats.signs.giveWay).toBe(0);
    expect(world.stats.zebraCrossings).toBe(0);
  });

  it("POSTS the signs the law implies — В24 at the ban (+ one in-zone repeat), one А1 at the arc", () => {
    // The sign-asset drop's zone pass: the driver SEES what the spans grade.
    // The 302 m В24 span carries the entry post plus one repeat deep in the
    // zone (doc 66 R2 — the ban stays in frame where it is broken).
    expect(world.stats.signs.noOvertaking).toBe(2);
    expect(world.stats.signs.curve).toBe(1);
    expect(world.stats.signs.noStopping).toBe(0);
    expect(world.stats.signs.slippery).toBe(0);
    expect(world.signs.filter((s) => s.kind === "noOvertaking" || s.kind === "curve")).toHaveLength(3);
  });

  it("the slope block sits INSIDE the arc — the only reason this curve is blind", () => {
    // No elevation exists in the engine, so the blindness is a building on the
    // inside of the bend. It must never touch the carriageway.
    const slope = district.buildings.find((b) => b.id === "ovc-b-slope");
    expect(slope).toBeDefined();
    for (const [x, y] of slope!.footprint) {
      expect(Math.hypot(x - CX, y - CY), `corner ${x},${y}`).toBeLessThan(RADIUS_M - 8.125);
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
      path.join(process.cwd(), "content", "world", "ov-crest-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "ov-crest-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "ov-crest-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("ov-crest-v1 through the world runtime — both spans on the tick + the Locator on the arc", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("ov-crest-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("surfaces the В24 ban EXACTLY inside its span — and NEVER in the legal window", () => {
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    let t = 0;
    const banAt = (s: number): boolean | undefined => {
      t += 1;
      rt.update(1 / 60);
      const p = lanePose(s);
      return rt.sample(sample(p.x, p.y, p.headingDeg, 50), t, false).noOvertakeZone;
    };
    expect(banAt(100)).toBeUndefined(); // free approach — passing is legal here
    expect(banAt(BAN_FROM + 20)).toBe(true); // from the sign on
    expect(banAt(APPROACH_M + 40)).toBe(true); // through the blind arc
    expect(banAt(APPROACH_M + ARC_LANE_LEN - 10)).toBe(true); // to its very end
    expect(banAt(APPROACH_M + ARC_LANE_LEN + 60)).toBeUndefined(); // THE WINDOW
    expect(banAt(APPROACH_M + ARC_LANE_LEN + 300)).toBeUndefined();
  });

  it("surfaces the А1 advisory EXACTLY inside the arc (the ban reaches further back)", () => {
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    let t = 0;
    const advisoryAt = (s: number): number | undefined => {
      t += 1;
      rt.update(1 / 60);
      const p = lanePose(s);
      return rt.sample(sample(p.x, p.y, p.headingDeg, 40), t, false).curveAdvisoryKmh;
    };
    expect(advisoryAt(100)).toBeUndefined();
    // The 90 m between the В24 and the bend: banned to overtake, but the
    // envelope is still the posted 90 — two spans, two laws.
    expect(advisoryAt(BAN_FROM + 20)).toBeUndefined();
    expect(advisoryAt(APPROACH_M - 15)).toBeUndefined();
    expect(advisoryAt(APPROACH_M + 40)).toBe(ADVISORY_KMH);
    expect(advisoryAt(APPROACH_M + ARC_LANE_LEN / 2)).toBe(ADVISORY_KMH);
    expect(advisoryAt(APPROACH_M + ARC_LANE_LEN + 40)).toBeUndefined();
  });

  it("the Locator keeps a stable lane fix ALONG the whole arc (edge lock, laneId 0, small offset)", () => {
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    const step = 2; // meters of lane arclength per frame
    let t = 0;
    let maxAbsOffset = 0;
    for (let s = 20; s <= APPROACH_M + ARC_LANE_LEN + 200; s += step) {
      t += 0.1;
      rt.update(0.1);
      const p = lanePose(s);
      const tick = rt.sample(sample(p.x, p.y, p.headingDeg, 55), t, false);
      expect(tick.edgeId, `s=${s}`).toBe(EDGE_ID);
      expect(tick.laneId, `s=${s}`).toBe(0);
      maxAbsOffset = Math.max(maxAbsOffset, Math.abs(tick.laneOffsetM));
    }
    // Chord sagitta + rounding only — far inside the 3.25 m lane-keep band.
    expect(maxAbsOffset).toBeLessThan(0.6);
  });

  it("the OPPOSING-BANK flip resolves on the arc — the overtake corridor's armed context", () => {
    // The excursion the whole scenario turns on: driving the arc on the wrong
    // side must set tick.opposingBank (headingSign !== fix.travelDir), or the
    // corridor tracker could never arm mid-curve.
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    let t = 0;
    for (const s of [APPROACH_M + 30, APPROACH_M + ARC_LANE_LEN / 2, APPROACH_M + ARC_LANE_LEN - 30]) {
      t += 0.1;
      rt.update(0.1);
      const p = lanePose(s, -1);
      const tick = rt.sample(sample(p.x, p.y, p.headingDeg, 44), t, false);
      expect(tick.edgeId, `s=${s}`).toBe(EDGE_ID);
      expect(tick.opposingBank, `s=${s}`).toBe(true);
      expect(tick.noOvertakeZone, `s=${s}`).toBe(true); // …and inside the В24
      expect(tick.solidCenterLine, `s=${s}`).toBeUndefined(); // dashed — the
      // corridor tracker's armed context (an М1 span would be a different act)
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("ov-crest-v1 — curve-overspeed adjudication through the real reducer", () => {
  /** Drive the inside-lane path with a per-arclength speed profile (km/h). */
  const curveDrive = (speedAt: (s: number) => number, bank: 1 | -1 = 1): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    let s = 15;
    const end = APPROACH_M + ARC_LANE_LEN + 150;
    while (s < end) {
      const v = speedAt(s);
      s += (v / 3.6) * dt;
      t += dt;
      rt.update(dt);
      const p = lanePose(s, bank);
      const tick: SimTick = rt.sample(sample(p.x, p.y, p.headingDeg, v), t, false);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  const violations = (events: RuleEvent[]) =>
    events.filter((e) => e.kind === "violation").map((e) => e.code);

  it("holding ~54 km/h through the advisory-40 arc grades exactly SPEED_TOO_FAST_FOR_CURVE", () => {
    // 54 is the AUTHORED guilty speed of the trace demo: above advisory + the
    // 5 km/h grace, under the recorder's √(2.4·R) curve cap (≈ 63.8 km/h on
    // this radius), and far under the posted 90 — one act, one bill.
    const events = curveDrive((s) => (s < APPROACH_M - 40 ? 55 : 54));
    const codes = violations(events);
    expect(codes).toEqual(["SPEED_TOO_FAST_FOR_CURVE"]);
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR"); // the interplay proof
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 55 « 90: approach legal
  });

  it("the adapted drive (at the advisory through the arc) is fully innocent", () => {
    expect(violations(curveDrive((s) => (s < APPROACH_M - 40 ? 55 : 40)))).toEqual([]);
  });

  it("inside the grace band (44 ≤ 40+5) stays innocent — the mistake-1 pull-out speed", () => {
    // The blind-curve pass demo runs at 44 km/h so the ONLY thing it can be
    // billed for is the corridor gap. If this ever bills, that demo's exact
    // code assert would silently gain a second code.
    expect(violations(curveDrive((s) => (s < APPROACH_M - 40 ? 55 : 44)))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The structural limit the scenario is built around (the load-bearing negative)
// ---------------------------------------------------------------------------

describe("ov-crest-v1 — the В24 span posts and teaches, but cannot grade on a 1+1", () => {
  it("the opposing-bank excursion inside the ban emits NO lane-change signal at all", () => {
    // locator.ts: laneId is „rightmost lane OF THE VEHICLE'S CARRIAGEWAY", so
    // with lanesPerDir = 1 it is 0 on BOTH banks — crossing the осева changes
    // travelDir, never laneId. rules/engine.ts stage 3 hangs OVERTAKING_IN_BAN_ZONE
    // (and every lane-change code) off a laneId DELTA. Hence: a pass in this
    // blind curve is convicted by the CORRIDOR (OVERTAKE_INSUFFICIENT_GAP),
    // never by the ban span. Pinning it here means the day the detector learns
    // 1+1 banks, this test fails and sc-ov-crest-curve gains its second code on
    // purpose — instead of a template silently changing meaning.
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    let rules = createRuleEngine();
    const codes: string[] = [];
    const dt = 0.1;
    let t = 0;
    const laneIds = new Set<number>();
    // Straight through the ban span, wandering from the own bank onto the
    // opposing one and back — mirrors the demo's excursion, in the ban.
    for (let s = 160; s < 430; s += 1.2) {
      t += dt;
      rt.update(dt);
      const inExcursion = s > 260 && s < 340;
      const p = lanePose(s, inExcursion ? -1 : 1);
      const tick = rt.sample(sample(p.x, p.y, p.headingDeg, 44), t, false);
      laneIds.add(tick.laneId);
      const r = reduceTick(rules, tick);
      rules = r.state;
      for (const e of r.events) if (e.kind === "violation") codes.push(e.code);
    }
    expect([...laneIds]).toEqual([0]); // both banks are lane 0 — the whole point
    expect(codes).not.toContain("OVERTAKING_IN_BAN_ZONE");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_INDICATOR");
    expect(codes).not.toContain("LANE_CHANGE_WITHOUT_MIRROR_CHECK");
  });

  it("…yet the ban is real DATA: the span is on the tick and the В24 is on the verge", () => {
    // The negative above is about the DETECTOR, not the map. Everything a
    // future code needs is already authored and rendered.
    const rt = createWorldRuntime(loadRaw("ov-crest-v1"));
    rt.update(1 / 60);
    const p = lanePose(APPROACH_M + 40, -1);
    expect(rt.sample(sample(p.x, p.y, p.headingDeg, 44), 1, false).noOvertakeZone).toBe(true);
    const world = buildWorldGeometry(assertDistrict(loadRaw("ov-crest-v1")), { seed: 7 });
    expect(world.signs.some((s) => s.kind === "noOvertaking")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("ov-crest-v1 through the traffic lane graph + system", () => {
  it("builds the 1+1 lane graph over the curved edge; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("ov-crest-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2); // one per direction — the staged lead
    // rides the northbound lane, the oncoming stream the southbound one
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(LANE_X, 15, 0)).toBe(Infinity);
  });
});
