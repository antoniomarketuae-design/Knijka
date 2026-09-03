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
  /**
   * THE CRAWL IS BILLED TWICE, and the assertions below say so in full rather
   * than collapsing to a set — a count that stops being asserted is a count
   * nothing protects.
   *
   * `DRIVING_TOO_SLOW_FOR_MOTORWAY` is второстепенна and rides the w11 re-grade
   * (rules/engine.ts `MOTORWAY_CRAWL_REGRADE_SEC`): a CONTINUING crawl produces
   * the teach the founder-approved free mini-lesson spends, and then the marked
   * charge it consumed — which `lessons/engine.ts` drops wherever the code was
   * already charged, so the изпитен лист still prices it once. Never a third:
   * that ceiling is pinned in `rules/__tests__/motorway-crawl-regrade.test.ts`.
   */
  const CRAWL_BILLS = ["DRIVING_TOO_SLOW_FOR_MOTORWAY", "DRIVING_TOO_SLOW_FOR_MOTORWAY"];

  it("the disciplined cruise — 125 in the right TRAVEL lane — is fully innocent (keep-right exempts lane 1)", () => {
    const events = motorwayDrive(() => ({ x: X_CRUISE, kmh: 125 }));
    expect(violations(events)).toEqual([]);
    expect(events.some((e) => e.kind === "commendation" && e.code === "CLEAN_DRIVING")).toBe(true);
  });

  it("the causeless 40 km/h crawl grades exactly DRIVING_TOO_SLOW_FOR_MOTORWAY — taught, then charged", () => {
    const events = motorwayDrive(() => ({ x: X_CRUISE, kmh: 40 }), 400);
    expect(violations(events)).toEqual(CRAWL_BILLS);
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
  it("the causeless 40 km/h crawl IN THE LEFT LANE grades BOTH codes — neither swallows the other", () => {
    const events = motorwayDrive(() => ({ x: X_LEFT, kmh: 40 }), 400);
    expect([...violations(events)].sort()).toEqual([...CRAWL_BILLS, "NOT_KEEPING_RIGHT"]);
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

/**
 * SWEEP-161 FINDING (sc-mw-emergency-lane, mobile-right, major) — the district
 * half REFUTED, the rest ROUTED. Recorded here because `public/world/mw-v1.json`
 * is JSON and generated (`meta.generator = tools/maps/gen_motorway.mjs`), so it
 * can carry neither a comment nor a surviving hand-edit.
 *
 * THE CLAIM: „2600 m of motorway carrying exactly one vehicle … No other
 * traffic in either direction across 67 mobile and 74 pc frames, no median
 * barrier between the carriageways, no motorway sign, no gantry, no distance
 * boards. It does not read as a магистрала.", filed with
 * `endedBecause: wrong drive ticked both tasks in 58 s`.
 *
 * 1. THE „WRONG DRIVE PASSED" HALF IS AN INSTRUMENT ARTEFACT, NOT A FALSE
 *    CERTIFICATE — and this matters, because reporting a grading bug that is
 *    not there is the same crime as missing one. `tools/mobile/lesson-audit.mjs`
 *    defines wrong mode, in its own words, as „one act: hold the throttle and
 *    never touch the brake", and a census of that harness for KeyA / KeyD /
 *    ArrowLeft / ArrowRight returns ZERO — it has no lateral control at all.
 *    The offence this lesson grades is LATERAL: leave the travel lane
 *    (X_CRUISE = 0) for the emergency lane (X_EMERG = 8.13). The wrong drive
 *    spawns at `mw-spawn-approach` x = 0 — already in the correct lane — and
 *    cannot leave it. Its own frame at t033s reads 135 км/ч against a posted
 *    140 / HUD ≤150, i.e. legal, in the right lane, passing the broken-down car
 *    in its own lane, which is what instruction 3 actually asks for. The
 *    debrief's „0 наказателни точки · ИЗДЪРЖАН" is an HONEST verdict on what
 *    that car did. What is worthless is the wrong COLUMN for this lesson: it
 *    cannot commit the offence, so it certifies nothing either way.
 *
 *    That the grading itself works is asserted above, not assumed: „the
 *    sustained emergency-lane cruise grades exactly EMERGENCY_LANE_DRIVING".
 *    Mutation-checked — emptying `zones` in mw-v1.json turns 5 tests in this
 *    file red, that conviction among them, so the verdict is carried by the
 *    authored `emergencyLane` spans and by nothing else.
 *
 * 2. THE WORLD-DRESSING HALF CANNOT BE AUTHORED IN THIS FILE. `DistrictZoneKind`
 *    is exactly {noStopping, noParking, noOvertaking, solidCenterLine, busLane,
 *    railCrossing, curveAdvisory, emergencyLane, waterPatch, icePatch} and
 *    `SignKind` carries no Д5 „магистрала" — there is no median-barrier, gantry
 *    or distance-board kind to author, and traffic density is a RUNTIME config
 *    (`createTrafficSystem({vehicleCount})`, 0 here by design and asserted
 *    legal above), not district data. Adding any of them is a schema + builder
 *    + runtime change:
 *      · platform/src/modules/sim/world/types.ts (DistrictZoneKind / SignKind)
 *      · platform/src/modules/sim/world/builders/zoneSigns.ts (post it)
 *      · platform/src/modules/sim/traffic/system.ts (populate the carriageways)
 *    None of those is this lane's file, and none of them is mw-v1.json.
 *
 * WHAT THIS BLOCK PINS is the half the finding got wrong about the map itself:
 * that it „does not read as a магистрала" because the carriageways are not
 * there. They are — both of them, full length, divided.
 */
describe("mw-v1: the divided carriageway the finding says is missing", () => {
  it("authors BOTH carriageways over the full 2600 m, separated by a real median gap", () => {
    const district = assertDistrict(loadRaw("mw-v1"));
    const nodes = new Map(district.roads.nodes.map((n) => [n.id, n]));
    // Northbound runs 0 → 2600 at x = 0; southbound runs 2600 → 0 beside it.
    expect([nodes.get("mw-n-nb-start")!.x, nodes.get("mw-n-nb-start")!.y]).toEqual([0, 0]);
    expect([nodes.get("mw-n-nb-end")!.x, nodes.get("mw-n-nb-end")!.y]).toEqual([0, LENGTH_M]);
    const sbX = nodes.get("mw-n-sb-start")!.x;
    expect(nodes.get("mw-n-sb-start")!.y).toBe(LENGTH_M);
    expect(nodes.get("mw-n-sb-end")!.y).toBe(0);
    // The two banks are genuinely apart — wider than the 3-lane bank itself, so
    // this is a divided road and not two edges drawn on top of each other.
    expect(Math.abs(sbX)).toBeGreaterThan(Math.abs(X_EMERG) + Math.abs(X_LEFT));
    // Both carry the emergency-lane ban for their whole length.
    const spans = (district.zones ?? []).filter((z) => z.kind === "emergencyLane");
    expect(spans.map((z) => z.edgeId).sort()).toEqual(["mw-e-nb", "mw-e-sb"]);
    for (const z of spans) {
      expect(z.fromM).toBe(0);
      expect(z.toM).toBe(LENGTH_M);
    }
  });
});

/**
 * WAVE 8 — THE РАЗДЕЛИТЕЛНА ИВИЦА.
 *
 * sc-mw-emergency-lane (major): «2600 m of motorway carrying exactly one
 * vehicle — the staged broken-down car. No other traffic in either direction
 * across 67 mobile and 74 pc frames, NO MEDIAN BARRIER BETWEEN THE CARRIAGEWAYS,
 * no motorway sign, no gantry, no distance boards. It does not read as a
 * магистрала.»
 *
 * Of the four objects it names, the barrier was the one the kit could draw
 * honestly at the time — the gantry and the distance boards are still faces
 * `SIGN_KINDS` does not hold, and this module's law is to place nothing rather
 * than guess a face. It is also the one that is a DRIVING fact rather than a
 * label: a barrier is why the oncoming direction may be treated as gone, why
 * there is no turning round, and why a stop is only ever to the right.
 *
 * Д5 IS NO LONGER ON THAT LIST — see the block at the bottom of this file. The
 * face shipped all along in `content/signs/svg/d5.svg`; what was missing was a
 * `SignKind` to place it with.
 */
describe("mw-v1 — the motorway has a median barrier between its carriageways", () => {
  const district = assertDistrict(loadRaw("mw-v1"));
  const world = buildWorldGeometry(district, { seed: 7 });

  it("runs continuously down the median for the whole 2.6 km", () => {
    expect(world.stats.medianBarriers).toBe(world.medianBarriers.length);
    // 2600 m at RAILING_RUN_M (6.055) = 429 whole panels, centred on the run.
    expect(world.medianBarriers.length).toBe(429);
    // CONTINUOUS, not the parapet's 5-on/4-off rhythm: consecutive panels are
    // exactly one run apart with no gap anywhere. A guard rail with holes in it
    // is not a guard rail.
    const ys = world.medianBarriers.map((t) => -t.position[2]).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) {
      expect(ys[i] - ys[i - 1]).toBeCloseTo(6.055, 3);
    }
    expect(ys[0]).toBeGreaterThan(0);
    expect(ys[ys.length - 1]).toBeLessThan(2600);
  });

  it("stands in the median, clear of both carriageways", () => {
    // The two carriageways are the district's own: mw-e-nb on x = 0 and
    // mw-e-sb on x = −30.37, each 3 lanes wide (halfWidth 12.19), so the median
    // is x ∈ [−18.18, −12.19] and its centre is −15.185.
    const xs = [...new Set(world.medianBarriers.map((t) => +t.position[0].toFixed(3)))];
    expect(xs).toHaveLength(1);
    expect(xs[0]).toBeCloseTo(-15.185, 2);
    // …which is 2.995 m of clearance to each ribbon edge — the 6 m median the
    // generator's own params.medianM names, halved.
    expect(Math.abs(xs[0]) - 12.19).toBeGreaterThan(2.9);
    expect(30.37 - Math.abs(xs[0]) - 12.19).toBeGreaterThan(2.9);
  });

  it("ADDITIVE: an undivided road gets none, and neither does a lone carriageway", () => {
    // The control that matters is a district with motorway edges that are NOT
    // an anti-parallel pair, and one with no motorway at all.
    for (const id of ["zb-v1", "pk-busstop-v1", "hz-roadworks-v1"]) {
      expect(buildWorldGeometry(assertDistrict(loadRaw(id)), { seed: 7 }).stats.medianBarriers, id)
        .toBe(0);
    }
  });

  it("NON-VACUITY: delete the second carriageway and the barrier goes with it", () => {
    const oneWay: District = {
      ...district,
      roads: {
        ...district.roads,
        edges: district.roads.edges.filter((e) => e.id !== "mw-e-sb"),
      },
    };
    expect(buildWorldGeometry(oneWay, { seed: 7 }).stats.medianBarriers).toBe(0);
  });
});

/**
 * sc-ac-truck-spray:c042440d — „no motorway signage anywhere on the route the
 * briefing calls a motorway".
 *
 * MEASURED on the built world before the repair: mw-v1 produced FOUR signs —
 * two В26 «140» and two В1 — and stated „магистрала" nowhere, while its own
 * instruction 2 reads «магистралата е с ограничение 140» and the mw traces
 * narrate «Автомагистрала, ограничение 140» out loud. ЗДвП чл. 55, ал. 1 makes
 * the plate constitutive, not decorative: the motorway rules apply „на път,
 * обозначен като автомагистрала … СЪС СЪОТВЕТНИЯ ПЪТЕН ЗНАК".
 *
 * The pass lives at the bottom of `builders/props.ts` (deliberately last, so no
 * existing post moves); this is its gate.
 */
describe("Д5 (Автомагистрала) — the motorway now says so", () => {
  const world = buildWorldGeometry(assertDistrict(loadRaw("mw-v1")), { seed: 7 });
  const plates = world.signs.filter((s) => s.kind === "motorwayStart");

  it("posts one plate per carriageway, on the right-hand verge, facing the driver", () => {
    expect(plates).toHaveLength(2);
    expect(world.stats.signs.motorwayStart).toBe(2);

    // Northbound (x = 0, travel +y): right of travel is +x, and the plate
    // stands clear of the 12.19 m ribbon — never on the emergency lane.
    const nb = plates.find((p) => Math.abs(p.yaw) < 1e-6);
    expect(nb, "a plate facing the northbound driver").toBeDefined();
    expect(nb!.position[0]).toBeGreaterThan(12.19);
    // Southbound (x = -30.37, travel -y): right of travel is -x.
    const sb = plates.find((p) => Math.abs(Math.abs(p.yaw) - Math.PI) < 1e-6);
    expect(sb, "a plate facing the southbound driver").toBeDefined();
    expect(sb!.position[0]).toBeLessThan(-30.37 - 12.19);
  });

  it("stands where the driver can read it: ahead of his spawn and before the В26", () => {
    // The one placement a student actually drives past. `mw-spawn-approach` is
    // at y = 15; doc 86 T5 is the defect of a plate behind the driver's head.
    const nbY = -plates.find((p) => Math.abs(p.yaw) < 1e-6)!.position[2];
    expect(nbY).toBeGreaterThan(15 + 3);
    // …and it is read FIRST: „this is a motorway", then „140".
    const limitY = -world.signs
      .filter((s) => s.kind === "limit140" && Math.abs(s.yaw) < 1e-6)
      .map((s) => s.position[2])
      .sort((a, b) => b - a)[0]!;
    expect(nbY).toBeLessThan(limitY);
    // Two posts, not one silhouette (sign-post-distinct's bar with headroom).
    const d5 = plates.find((p) => Math.abs(p.yaw) < 1e-6)!;
    const v26 = world.signs.find(
      (s) => s.kind === "limit140" && Math.abs(s.yaw) < 1e-6 && -s.position[2] === limitY,
    )!;
    expect(Math.hypot(d5.position[0] - v26.position[0], d5.position[2] - v26.position[2]))
      .toBeGreaterThan(1.2);
  });

  it("ADDITIVE: a district with no motorway carriageway posts none", () => {
    for (const id of ["zb-v1", "pk-busstop-v1", "hz-roadworks-v1", "district-v1"]) {
      expect(
        buildWorldGeometry(assertDistrict(loadRaw(id)), { seed: 7 }).stats.signs.motorwayStart,
        id,
      ).toBe(0);
    }
  });

  it("NON-VACUITY: drop the motorway tag and class, and the plate goes with it", () => {
    const raw = assertDistrict(loadRaw("mw-v1"));
    const plain: District = {
      ...raw,
      roads: {
        ...raw.roads,
        edges: raw.roads.edges.map((e) => ({ ...e, motorway: false, class: "primary" })),
      },
    };
    expect(buildWorldGeometry(plain, { seed: 7 }).stats.signs.motorwayStart).toBe(0);
  });
});

/**
 * sc-merge-accel-lane:09e6d6f4 — „at arrival … no ramp and no acceleration
 * lane … while the briefing says «Потегли по рампата»".
 *
 * The ramp and the acceleration lane are both in mw-entry-v1 (`mwe-e-ramp`,
 * `mwe-e-nb-accel`; the merge-districts battery pins their geometry). What the
 * arrival frame had none of is the WORD: the carriageway pass above signs the
 * map boundary a driver enters through, and the ramp driver passes no such
 * boundary — mw-entry-v1's two carriageway plates stand at y ≈ 9.5 and
 * y ≈ 950.5, on ground this lesson never drives, one of them facing away.
 *
 * ЗДвП чл. 55, ал. 1 makes it constitutive, not decorative: the motorway regime
 * exists „на път, обозначен като автомагистрала … СЪС СЪОТВЕТНИЯ ПЪТЕН ЗНАК",
 * and every rule this lesson teaches — the чл. 21 140 column, the чл. 56 duty
 * to let the flow through, the аварийна лента past the taper — hangs on it.
 */
describe("Д5 on the вход — the ramp says what it leads to", () => {
  const world = buildWorldGeometry(assertDistrict(loadRaw("mw-entry-v1")), { seed: 7 });
  const plates = world.signs.filter((s) => s.kind === "motorwayStart");
  /** mw-entry-v1 meta.scenario: the ramp runs (40, 120) → (8.13, 260). */
  const RAMP_SPAWN_Y = 139.5;
  const NOSE_Y = 260;

  it("posts one on the ramp, ahead of the spawn, before the nose, facing the driver", () => {
    // Two carriageway plates (unchanged) plus the ramp's.
    expect(plates).toHaveLength(3);
    // The two carriageway plates run due north / due south (yaw 0 and ±π); the
    // ramp's is the only one skewed, because the ramp is.
    const onRamp = plates.filter((p) => Math.abs(p.yaw) > 0.05 && Math.abs(p.yaw) < Math.PI - 0.05);
    expect(onRamp, "exactly one plate on the ramp").toHaveLength(1);
    const d5 = onRamp[0]!;
    const y = -d5.position[2];
    // Ahead of the student's own bumper (doc 86 T5) and clear of the nose, so
    // it is read BEFORE the merge rather than during it.
    expect(y).toBeGreaterThan(RAMP_SPAWN_Y);
    expect(y).toBeLessThan(NOSE_Y - 20);
    // Right of the ramp's travel (which runs up and to the LEFT), off the
    // ribbon: the ramp centre at this station is x ≈ 15.9 with a 4.06 m half
    // width, so a post at 21.8 stands on the verge, not in the lane.
    expect(d5.position[0]).toBeGreaterThan(15.9 + 4.06);
    // Facing back down the ramp: the ramp's bearing is 347.18°, so a plate
    // facing its driver is yawed ~ +0.22 rad, not 0 (the carriageway plates).
    expect(d5.yaw).toBeGreaterThan(0.1);
  });

  it("EXIT ramps get none: mw-exit-v1 keeps its two carriageway plates", () => {
    const exitWorld = buildWorldGeometry(assertDistrict(loadRaw("mw-exit-v1")), { seed: 7 });
    expect(exitWorld.stats.signs.motorwayStart).toBe(2);
    // `mwx-e-ramp` is the same class and the same one-way link shape; the only
    // difference is which END touches the carriageway, and that is the whole
    // test. Its far end is 123.8 m clear, so no plate may stand on it.
    const rampPlates = exitWorld.signs.filter(
      (s) => s.kind === "motorwayStart" && s.position[0] > 20,
    );
    expect(rampPlates).toHaveLength(0);
  });

  it("NON-VACUITY: pull the nose off the carriageway and the ramp plate goes", () => {
    const raw = assertDistrict(loadRaw("mw-entry-v1"));
    const detached: District = {
      ...raw,
      roads: {
        ...raw.roads,
        edges: raw.roads.edges.map((e) =>
          e.id === "mwe-e-ramp"
            ? { ...e, geometry: (e.geometry as [number, number][]).map(([x, y]) => [x + 60, y]) }
            : e,
        ),
      },
    };
    expect(buildWorldGeometry(detached, { seed: 7 }).stats.signs.motorwayStart).toBe(2);
  });
});
