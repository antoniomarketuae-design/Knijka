/**
 * RURAL-CURVE archetype contract battery (the ban-districts.test.ts pattern) —
 * doc 72 §8 SP-05 „Скорост в завой".
 *
 * content/world/sp-curve-v1.json (tools/maps/gen_rural_curve.mjs) is the first
 * CURVED-geometry micro-map (a 90° chorded arc between two straights) and the
 * first map carrying a "curveAdvisory" zone span (advisoryKmh 50 under the А1
 * warning, on a 90 km/h extra-urban road). The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - the LOCATOR BEHAVES ON THE ARC (the roundabout-ring precedent, now for a
 *    mid-edge arc): stable edge lock, laneId 0 throughout, small lane offset;
 *  - the advisory surfaces on the tick EXACTLY inside the arc span — the
 *    approach BEFORE the curve and the exit AFTER it stay envelope-free;
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    holding ~70 km/h through the advisory-50 arc grades exactly
 *    SPEED_TOO_FAST_FOR_CURVE — and NEVER TURN_WITHOUT_INDICATOR (the
 *    no-double-bill interplay proof: zero intersections disarm the junction
 *    gate, and the window math stays far under 55°/3 s — see the generator
 *    header); the adapted 48 km/h drive and a brief corrected entry overshoot
 *    stay innocent;
 *  - the tolerance law: a curveAdvisory span with a MISSING advisory is inert,
 *    and shipped v1 maps never carry the tick field.
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

/** sp-curve-v1 truths (generator params — asserted against the file below). */
const LANE_X = 4.06; // right-lane center offset (1+1)
const APPROACH_M = 220;
const RADIUS_M = 170;
const EXIT_M = 200;
const ADVISORY_KMH = 50;
const LIMIT_KMH = 90;
const SPAN_FROM = 220;
const SPAN_TO = 487.02;
const EDGE_ID = "spc-e-road";
/** Arc center + inside-lane radius. */
const CX = RADIUS_M;
const CY = APPROACH_M;
const R_LANE = RADIUS_M - LANE_X;
/** Exit-leg lane center (southern lane of the eastbound leg). */
const EXIT_LANE_Y = APPROACH_M + RADIUS_M - LANE_X;

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_rural_curve.mjs) in: ${candidates.join(", ")}`);
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
 * arclength s, meters. Piecewise: straight x = LANE_X from y = 0, the R_LANE
 * arc, then the straight y = EXIT_LANE_Y east.
 */
const ARC_LANE_LEN = (R_LANE * Math.PI) / 2;
function lanePose(s: number): { x: number; y: number; headingDeg: number } {
  if (s <= APPROACH_M) return { x: LANE_X, y: s, headingDeg: 0 };
  const sArc = s - APPROACH_M;
  if (sArc <= ARC_LANE_LEN) {
    const th = sArc / R_LANE; // radians swept
    return {
      x: CX - R_LANE * Math.cos(th),
      y: CY + R_LANE * Math.sin(th),
      headingDeg: (th * 180) / Math.PI,
    };
  }
  const sExit = sArc - ARC_LANE_LEN;
  return { x: CX + sExit, y: EXIT_LANE_Y, headingDeg: 90 };
}

describe("sp-curve-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw("sp-curve-v1");
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document carrying ONE authored curve-advisory span", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(2);
    expect(district.roads.edges.length).toBe(1);
    const road = district.roads.edges[0];
    expect(road.id).toBe(EDGE_ID);
    expect(road.lanes).toBe(2);
    expect(road.oneway).toBe(false);
    expect(road.maxspeed).toBe(LIMIT_KMH); // the honest extra-urban 90
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
    expect(district.zones).toHaveLength(1);
    const z = district.zones![0];
    expect(z.kind).toBe("curveAdvisory");
    expect(z.signRef).toBe("А1");
    expect(z.edgeId).toBe(EDGE_ID);
    expect(z.fromM).toBe(SPAN_FROM);
    expect(z.toM).toBe(SPAN_TO);
    expect(z.advisoryKmh).toBe(ADVISORY_KMH);
  });

  it("the arc is a well-sampled polyline (≤ 10 m chords) between the straights", () => {
    const g = district.roads.edges[0].geometry;
    expect(g.length).toBeGreaterThan(30); // 2 straight ends + 36 arc chords
    // Every interior chord stays short enough for the Locator's projection.
    for (let i = 2; i < g.length - 1; i++) {
      const chord = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      expect(chord, `chord ${i}`).toBeLessThanOrEqual(10);
    }
    // The span matches the polyline's own arclength metric (the sM measure).
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
      path.join(process.cwd(), "content", "world", "sp-curve-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "sp-curve-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "sp-curve-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("sp-curve-v1 through the world runtime — the advisory on the tick + the Locator on the arc", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("sp-curve-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("surfaces the advisory EXACTLY inside the arc span (before / inside / after)", () => {
    const rt = createWorldRuntime(loadRaw("sp-curve-v1"));
    let t = 0;
    const advisoryAt = (s: number): number | undefined => {
      t += 1;
      rt.update(1 / 60);
      const p = lanePose(s);
      return rt.sample(sample(p.x, p.y, p.headingDeg, 40), t, false).curveAdvisoryKmh;
    };
    expect(advisoryAt(100)).toBeUndefined(); // the approach is unrestricted
    expect(advisoryAt(APPROACH_M - 15)).toBeUndefined(); // right up to the arc
    expect(advisoryAt(APPROACH_M + 40)).toBe(ADVISORY_KMH); // early arc
    expect(advisoryAt(APPROACH_M + ARC_LANE_LEN / 2)).toBe(ADVISORY_KMH); // mid-arc
    expect(advisoryAt(APPROACH_M + ARC_LANE_LEN + 40)).toBeUndefined(); // exit leg
  });

  it("the Locator keeps a stable lane fix ALONG the whole arc (edge lock, laneId 0, small offset)", () => {
    const rt = createWorldRuntime(loadRaw("sp-curve-v1"));
    const step = 2; // meters of lane arclength per frame (~72 km/h at 10 Hz)
    let t = 0;
    let maxAbsOffset = 0;
    for (let s = 20; s <= APPROACH_M + ARC_LANE_LEN + 120; s += step) {
      t += 0.1;
      rt.update(0.1);
      const p = lanePose(s);
      const tick = rt.sample(sample(p.x, p.y, p.headingDeg, 70), t, false);
      expect(tick.edgeId, `s=${s}`).toBe(EDGE_ID);
      expect(tick.laneId, `s=${s}`).toBe(0);
      maxAbsOffset = Math.max(maxAbsOffset, Math.abs(tick.laneOffsetM));
    }
    // Chord sagitta + rounding only — far inside the 3.25 m lane-keep band.
    expect(maxAbsOffset).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("sp-curve-v1 — curve-overspeed adjudication through the real reducer", () => {
  /**
   * Drive the inside-lane path with a per-arclength speed profile (km/h).
   * Kinematic: dt 0.1 s, s advances by v·dt — the ban-battery discipline.
   */
  const curveDrive = (speedAt: (s: number) => number): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("sp-curve-v1"));
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
      const p = lanePose(s);
      const tick: SimTick = rt.sample(sample(p.x, p.y, p.headingDeg, v), t, false);
      const r = reduceTick(rules, tick);
      rules = r.state;
      out.push(...r.events);
    }
    return out;
  };
  const violations = (events: RuleEvent[]) =>
    events.filter((e) => e.kind === "violation").map((e) => e.code);

  it("holding ~70 km/h through the advisory-50 arc grades exactly SPEED_TOO_FAST_FOR_CURVE — once, and never a turn code", () => {
    // 85 on the approach (legal — limit 90), eased to 70 before the arc, 70 held
    // through it: the SP-05 guilty drive.
    const events = curveDrive((s) => (s < APPROACH_M - 40 ? 85 : 70));
    const codes = violations(events);
    expect(codes).toEqual(["SPEED_TOO_FAST_FOR_CURVE"]); // exactly one bill
    expect(codes).not.toContain("TURN_WITHOUT_INDICATOR"); // the interplay proof
    expect(codes).not.toContain("SPEEDING_OVER_LIMIT"); // 85 < 90: approach legal
  });

  it("the adapted drive (brake to 48 BEFORE the arc, hold through) is fully innocent", () => {
    const events = curveDrive((s) => (s < APPROACH_M - 60 ? 85 : 48));
    expect(violations(events)).toEqual([]);
  });

  it("a brief entry overshoot corrected within the sustain stays innocent (A12)", () => {
    // ~58 km/h across the first ~20 m of the arc (≈ 1.2 s), then at-advisory.
    const events = curveDrive((s) => {
      if (s < APPROACH_M - 40) return 85;
      if (s < APPROACH_M + 20) return 58;
      return 50;
    });
    expect(violations(events)).toEqual([]);
  });

  it("at-the-advisory and inside the grace band (54 ≤ 50+5) stays innocent", () => {
    const events = curveDrive((s) => (s < APPROACH_M - 60 ? 85 : 54));
    expect(violations(events)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tolerance + v1-unchanged proofs — the additive contract
// ---------------------------------------------------------------------------

describe("curveAdvisory tolerance — the additive contract", () => {
  it("a curveAdvisory span WITHOUT advisoryKmh is inert (nothing to grade — A12)", () => {
    const raw = loadRaw("sp-curve-v1") as District & {
      zones: Array<{ advisoryKmh?: number }>;
    };
    const crippled = JSON.parse(JSON.stringify(raw)) as typeof raw;
    delete crippled.zones[0].advisoryKmh;
    const rt = createWorldRuntime(crippled);
    rt.update(1 / 60);
    const p = lanePose(APPROACH_M + ARC_LANE_LEN / 2);
    const tick = rt.sample(sample(p.x, p.y, p.headingDeg, 70), 1, false);
    expect(tick.curveAdvisoryKmh).toBeUndefined();
    expect("curveAdvisoryKmh" in tick).toBe(false);
  });

  it("a shipped zones-less v1 map parses unchanged and its ticks never carry the field", () => {
    const raw = loadRaw("sp-creep-v1") as District;
    expect(raw.zones).toBeUndefined();
    const rt = createWorldRuntime(raw);
    for (const y of [15, 120, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(LANE_X, y, 0, 48), y, false);
      expect(tick.curveAdvisoryKmh).toBeUndefined();
      expect("curveAdvisoryKmh" in tick).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("sp-curve-v1 through the traffic lane graph + system", () => {
  it("builds the 1+1 lane graph over the curved edge; zero traffic is a LEGAL config", () => {
    const raw = loadRaw("sp-curve-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2); // one per direction
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(LANE_X, 15, 0)).toBe(Infinity);
  });
});
