/**
 * MOTORWAY-SEGMENT archetype contract battery (the curve-districts.test.ts
 * pattern) — doc 72 §8 SP-10 „Минимална скорост на магистрала" + OV-11
 * keep-right at speed + the чл. 58, т. 3 emergency-lane ban.
 *
 * content/world/mw-v1.json (tools/maps/gen_motorway.mjs) is the first
 * DIVIDED-carriageway micro-map (two one-way 3-lane edges around a median),
 * the first map carrying the edge-level `motorway: true` tag and the first
 * carrying "emergencyLane" zone spans. The battery proves:
 *  - the file satisfies the full engine contract (builder / runtime / traffic);
 *  - the LOCATOR resolves the 3-lane one-way bank exactly as authored
 *    (emergency x=8.13 → laneId 0, cruise x=0 → laneId 1, left x=-8.12 →
 *    laneId 2) and holds a stable lock at 130 km/h along the full kilometre
 *    — the northbound fix never wanders across the median;
 *  - tick.motorway + tick.emergencyLaneRight surface from data, and
 *    maxSpeedKmh carries the honest АМ 140 (SPEEDING_* need zero new code);
 *  - the archetype's REASON TO EXIST end-to-end through the REAL reducer:
 *    the causeless 40 km/h crawl grades exactly DRIVING_TOO_SLOW_FOR_MOTORWAY,
 *    the 130 km/h left-lane hog grades exactly NOT_KEEPING_RIGHT (the ln-v1
 *    precedent at motorway speed — keep-right needed NO new code), and the
 *    sustained emergency-lane cruise grades exactly EMERGENCY_LANE_DRIVING;
 *    the disciplined 125 cruise in the right TRAVEL lane is fully innocent
 *    (the emergencyLaneRight keep-right exemption — laneId 1 is the rightmost
 *    REQUIRED lane);
 *  - the tolerance law: shipped v1 maps never carry either new tick field.
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

/**
 * mw-v1 truths (generator params — asserted against the file below).
 *
 * 1000 → 2600 m per carriageway (doc 87 B67). His sentence on catalog 37 was
 * „I can't go more than 100-105" on a lesson that asks him to hold BELOW 125,
 * and the register's measurement found the map underneath it: a drag-limited
 * drivetrain needs ~1.7 km to reach 160 and ~2.4 km to reach 170, so on a
 * 1000 m carriageway the road ended before the car finished accelerating. The
 * generator now REFUSES a segment posted >= 130 that is shorter than 2400 m.
 */
const LENGTH_M = 2600;
const LIMIT_KMH = 140;
const X_EMERG = 8.13; // laneId 0 — the emergency lane
const X_CRUISE = 0; // laneId 1 — the right TRAVEL lane
const X_LEFT = -8.12; // laneId 2 — the overtaking lane
const NB_EDGE = "mw-e-nb";
const SB_EDGE = "mw-e-sb";

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_motorway.mjs) in: ${candidates.join(", ")}`);
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

describe("mw-v1 through the world builder", () => {
  let raw: unknown;
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    raw = loadRaw("mw-v1");
    district = assertDistrict(raw);
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: divided 2+2, motorway-tagged, emergency spans", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(2);
    for (const id of [NB_EDGE, SB_EDGE]) {
      const e = district.roads.edges.find((x) => x.id === id)!;
      expect(e, id).toBeDefined();
      expect(e.oneway, id).toBe(true);
      expect(e.lanes, id).toBe(3); // emergency + 2 travel
      expect(e.maxspeed, id).toBe(LIMIT_KMH); // the honest АМ 140
      expect(e.motorway, id).toBe(true);
      expect(e.length, id).toBe(LENGTH_M);
    }
    expect((district.meta as { zonesVersion?: number }).zonesVersion).toBe(1);
    expect(district.zones).toHaveLength(2);
    for (const z of district.zones!) {
      expect(z.kind).toBe("emergencyLane");
      expect(z.signRef).toBe("М2");
      expect(z.fromM).toBe(0);
      expect(z.toM).toBe(LENGTH_M);
      expect([NB_EDGE, SB_EDGE]).toContain(z.edgeId);
    }
  });

  it("pins the authored lane centers in meta.scenario (the L7 copy truth)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      laneEmergencyX: number;
      laneCruiseX: number;
      laneLeftX: number;
      lanesPerDirection: number;
    };
    expect(sc.archetype).toBe("motorway-segment");
    expect(sc.lanesPerDirection).toBe(2);
    expect(sc.laneEmergencyX).toBe(X_EMERG);
    expect(sc.laneCruiseX).toBe(X_CRUISE);
    expect(sc.laneLeftX).toBe(X_LEFT);
  });

  it("hosts a plain motorway segment: no lights, no stop signs, no zebras, no junctions", () => {
    expect(district.intersections.length).toBe(0);
    expect(district.crossings.length).toBe(0);
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
      path.join(process.cwd(), "content", "world", "mw-v1.json"),
      path.resolve(process.cwd(), "..", "content", "world", "mw-v1.json"),
    ];
    const src = srcCandidates.find((f) => fs.existsSync(f))!;
    const pub = path.resolve(path.dirname(src), "..", "..", "platform", "public", "world", "mw-v1.json");
    expect(fs.existsSync(pub)).toBe(true);
    expect(fs.readFileSync(pub).equals(fs.readFileSync(src))).toBe(true);
  });
});

describe("mw-v1 through the world runtime — the motorway context on the tick + the Locator on the bank", () => {
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    runtime = createWorldRuntime(loadRaw("mw-v1"));
  });

  it("derives ZERO signals, stop lines and junction trackers", () => {
    expect(runtime.debugSignalClusters().length).toBe(0);
    expect(runtime.debugStopLines().length).toBe(0);
    expect(runtime.debugUncontrolledJunctions().length).toBe(0);
  });

  it("resolves the authored lane centers to laneIds 0/1/2 with the motorway + emergency context", () => {
    const rt = createWorldRuntime(loadRaw("mw-v1"));
    let t = 0;
    const at = (x: number): SimTick => {
      t += 1;
      rt.update(1 / 60);
      return rt.sample(sample(x, 400, 0, 100), t, false);
    };
    const emerg = at(X_EMERG);
    expect(emerg.edgeId).toBe(NB_EDGE);
    expect(emerg.laneId).toBe(0);
    expect(emerg.laneCount).toBe(3);
    expect(emerg.motorway).toBe(true);
    expect(emerg.emergencyLaneRight).toBe(true);
    expect(emerg.maxSpeedKmh).toBe(LIMIT_KMH);
    const cruise = at(X_CRUISE);
    expect(cruise.laneId).toBe(1);
    expect(cruise.emergencyLaneRight).toBe(true); // the flag names the CURB lane's legality
    const left = at(X_LEFT);
    expect(left.laneId).toBe(2);
    expect(left.motorway).toBe(true);
  });

  it("keeps a stable northbound lock at 130 km/h along the full kilometre (never steals across the median)", () => {
    const rt = createWorldRuntime(loadRaw("mw-v1"));
    const step = 3.6; // 130 km/h at 10 Hz
    let t = 0;
    for (let y = 15; y <= LENGTH_M - 15; y += step) {
      t += 0.1;
      rt.update(0.1);
      const tick = rt.sample(sample(X_CRUISE, y, 0, 130), t, false);
      expect(tick.edgeId, `y=${y}`).toBe(NB_EDGE);
      expect(tick.laneId, `y=${y}`).toBe(1);
      expect(Math.abs(tick.laneOffsetM), `y=${y}`).toBeLessThan(0.6);
      expect(tick.wrongWay, `y=${y}`).not.toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// The archetype's reason to exist — end-to-end through the REAL reducer
// ---------------------------------------------------------------------------

describe("mw-v1 — motorway adjudication through the real reducer", () => {
  /**
   * Drive north at per-arclength lane/speed profiles. Kinematic: dt 0.1 s,
   * y advances by v·dt — the curve-battery discipline.
   */
  const motorwayDrive = (
    profile: (y: number) => { x: number; kmh: number },
    endY = LENGTH_M - 40,
  ): RuleEvent[] => {
    const rt = createWorldRuntime(loadRaw("mw-v1"));
    let rules = createRuleEngine();
    const out: RuleEvent[] = [];
    const dt = 0.1;
    let t = 0;
    let y = 15;
    while (y < endY) {
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

  it("the disciplined cruise — 125 in the right TRAVEL lane — is fully innocent (keep-right exempts lane 1)", () => {
    const events = motorwayDrive(() => ({ x: X_CRUISE, kmh: 125 }));
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(true);
  });

  it("the causeless 40 km/h crawl grades exactly DRIVING_TOO_SLOW_FOR_MOTORWAY — once", () => {
    const events = motorwayDrive(() => ({ x: X_CRUISE, kmh: 40 }), 400);
    expect(violations(events)).toEqual(["DRIVING_TOO_SLOW_FOR_MOTORWAY"]);
  });

  it("the 130 km/h left-lane hog grades exactly NOT_KEEPING_RIGHT (OV-11 at speed, zero new code)", () => {
    const events = motorwayDrive(() => ({ x: X_LEFT, kmh: 130 }));
    expect(violations(events)).toEqual(["NOT_KEEPING_RIGHT"]);
  });

  it("the sustained emergency-lane cruise grades exactly EMERGENCY_LANE_DRIVING — once per excursion", () => {
    const events = motorwayDrive((y) => ({ x: y > 300 && y < 700 ? X_EMERG : X_CRUISE, kmh: 100 }));
    // The unsignalled lane drift into/out of laneId 0 is a lane change — the
    // profile teleports laterally, so exclude the lane-change codes from the
    // assertion surface by driving the WHOLE way in the emergency lane instead.
    const cruise = motorwayDrive(() => ({ x: X_EMERG, kmh: 100 }), 500);
    expect(violations(cruise)).toEqual(["EMERGENCY_LANE_DRIVING"]);
    expect(violations(events)).toContain("EMERGENCY_LANE_DRIVING");
  });

  it("SPEEDING_DANGEROUS still rides the edge maxspeed: 152 on the 140 motorway convicts (the empty minor band)", () => {
    // At 140 the 10% grace (154) exceeds the +10 dangerous threshold (150),
    // so the second-degree band is empty — the dangerous rule alone governs
    // (the documented speedingGraceRatio note; nothing new for SP-10).
    const events = motorwayDrive(() => ({ x: X_CRUISE, kmh: 152 }), 500);
    expect(violations(events)).toContain("SPEEDING_DANGEROUS");
    expect(violations(events)).not.toContain("SPEEDING_OVER_LIMIT");
  });

  // The COMPOUND fault — the invariant sc-mw-min-speed's second demo is built
  // on (templates-speed2.ts). The cases above prove each code alone: the crawl
  // in the right lane, the 130 hog in the left. Neither proves they STACK, and
  // stacking is not obvious — the two detectors share the same tick and each
  // carries its own exemptions (the crawl's queue/transition innocence, the
  // keep-right emergencyLaneRight seam), so a future guard on either could
  // silently swallow the other and leave the template's demo grading one code
  // while its card promises two.
  it("the causeless 40 km/h crawl IN THE LEFT LANE grades BOTH codes — once each", () => {
    const events = motorwayDrive(() => ({ x: X_LEFT, kmh: 40 }), 400);
    expect([...violations(events)].sort()).toEqual([
      "DRIVING_TOO_SLOW_FOR_MOTORWAY",
      "NOT_KEEPING_RIGHT",
    ]);
  });

  it("…and the low speed is no excuse for the lane: keep-right does not need motorway pace", () => {
    // The mirror of the case above, stated as its own claim: NOT_KEEPING_RIGHT
    // is a LANE rule, and a driver crawling in the overtaking lane must not get
    // an implicit pass on it just because he is slow (the sc-mw-min-speed card
    // tells the student the bill is double — this is why that is true).
    const crawlLeft = motorwayDrive(() => ({ x: X_LEFT, kmh: 40 }), 400);
    const hogLeft = motorwayDrive(() => ({ x: X_LEFT, kmh: 130 }));
    for (const events of [crawlLeft, hogLeft]) {
      expect(violations(events)).toContain("NOT_KEEPING_RIGHT");
    }
  });
});

// ---------------------------------------------------------------------------
// Tolerance + v1-unchanged proofs — the additive contract
// ---------------------------------------------------------------------------

describe("motorway tolerance — the additive contract", () => {
  it("a shipped v1 map parses unchanged and its ticks never carry the new fields", () => {
    const raw = loadRaw("sp-creep-v1") as District;
    expect(raw.zones).toBeUndefined();
    const rt = createWorldRuntime(raw);
    for (const y of [15, 120, 300]) {
      rt.update(1 / 60);
      const tick = rt.sample(sample(4.06, y, 0, 48), y, false);
      expect(tick.motorway).toBeUndefined();
      expect("motorway" in tick).toBe(false);
      expect(tick.emergencyLaneRight).toBeUndefined();
      expect("emergencyLaneRight" in tick).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// Traffic layer
// ---------------------------------------------------------------------------

describe("mw-v1 through the traffic lane graph + system", () => {
  it("builds the divided lane graph (one graph lane per carriageway); zero traffic is a LEGAL config", () => {
    const raw = loadRaw("mw-v1") as TrafficDistrict;
    const graph = buildLaneGraph(raw, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    expect(graph.lanes.length).toBe(2); // one per one-way carriageway (the graph is per-direction)
    expect(graph.crossingLanes.size).toBe(0);
    const traffic = createTrafficSystem(raw, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
    expect(traffic.stats.vehicleCount).toBe(0);
    expect(traffic.leadGapMeters(X_CRUISE, 15, 0)).toBe(Infinity);
  });
});
