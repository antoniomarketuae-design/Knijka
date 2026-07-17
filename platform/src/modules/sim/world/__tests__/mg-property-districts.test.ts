/**
 * PROPERTY-EXIT micro-map contract battery (the mg-busstop-districts.test.ts
 * pattern) — doc 72 §10 OV-15 „Включване в движението", ЗДвП чл. 25.
 *
 * content/world/mg-property-v1.json (tools/maps/gen_mg_property.mjs) is the
 * merging family's only JUNCTION-shaped map, and the only one whose grading
 * hangs entirely on things the runtime DERIVES rather than the file declares.
 * So this battery does not merely check that the JSON parses — it re-proves,
 * against the real runtime, the three derivations the template is written on:
 *
 *  1. THE Б2 EXISTS, AND ONLY ON THE EXIT. The boulevard is `primary` (rank 5)
 *     and the exit is `service` (rank 1), so the minor-meets-arterial heuristic
 *     (runtime/stoplines.ts) derives a stopSign line at the exit's mouth — and
 *     at no other approach. That line is the ONLY shipped way to convict „не
 *     пропуснах потока на изхода от имот": чл. 25 has no dedicated detector,
 *     and the uncontrolled right-hand-rule tracker would acquit exactly the car
 *     this drill is about (it comes from the player's LEFT). Drop the line and
 *     the template silently stops grading its own lesson.
 *
 *  2. IT DERIVES AT x = 27.73. Not a taste — the arithmetic: the primary's
 *     half-width (8.125 travel + 4.0 parking band) + the arterial corner radius
 *     15 = the 27.125 open radius, + STOP_LINE_BEYOND_CUT_M 0.6. The generator
 *     recomputes it and refuses to ship a layout that contradicts it; this
 *     battery proves the RUNTIME agrees, because the template's success gates
 *     and both trace scripts are written against that number.
 *
 *  3. THE ORDERING LAW. The тротоар (x = 34) sits OUTSIDE that line, so the
 *     taught sequence is walk-band → знак → платно and the two mistake demos
 *     fail on two different beats. If the crossing ever slid inside the line,
 *     the pavement demo would start leaking STOP_SIGN_NO_FULL_STOP and both
 *     cards would blur — so the ordering is asserted here, not assumed.
 *
 * Plus the archetype's own laws: the SERVICE exit carries no lane in the
 * traffic graph (excludedRoadClasses), so no ambient or staged actor can ever
 * drive the forecourt — the exit is the player's alone and the потокът stays on
 * the boulevard; and the map is otherwise clean (no signals, no roundabouts,
 * one crossing), so nothing competes with the two channels this template grades.
 */
import fs from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { VehicleSample } from "../../contracts";
import { createRuleEngine, reduceTick, type RuleEvent, type SimTick } from "../../rules";
import { createWorldRuntime, type DistrictWorldRuntime } from "../../runtime";
import { buildLaneGraph } from "../../traffic/graph";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../../traffic/types";
import { buildWorldGeometry } from "../builders/buildWorldGeometry";
import { assertDistrict, type District, type WorldGeometry } from "../types";

/** mg-property-v1 truths (generator params — asserted against the file below). */
const SOUTH_M = 260;
const NORTH_M = 140;
const EXIT_M = 68;
const STREET_KMH = 50;
const EXIT_KMH = 20;
/** The DERIVED Б2 arclength on the exit approach — the template's spine. */
const X_LINE = 27.725;
/** The тротоар band, OUTSIDE it. */
const X_WALK = 34;
/** The EXACT lane-graph centers the ScenarioSpec/trace scripts pin by value. */
const X_LANE_NB = 4.0625; // the потокът's bank — and the player's after the merge
const X_LANE_SB = -4.0625;
/** The outbound exit-lane center: driving WEST, the right half is the NORTH one. */
const Y_EXIT = 4.0625;

const NODE = "mgp-n-c";
const EXIT_EDGE = "mgp-e-drive";
const CROSSING = "mgp-x-walk";

function loadRaw(id: string): unknown {
  const candidates = [
    path.join(process.cwd(), "content", "world", `${id}.json`),
    path.resolve(process.cwd(), "..", "content", "world", `${id}.json`),
  ];
  for (const file of candidates) {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as unknown;
  }
  throw new Error(`${id}.json not found (run: node tools/maps/gen_mg_property.mjs) in: ${candidates.join(", ")}`);
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

describe("mg-property-v1 through the world builder", () => {
  let district: District;
  let world: WorldGeometry;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mg-property-v1"));
    world = buildWorldGeometry(district, { seed: 7 });
  });

  it("is a structurally valid district-v1 document: a T with the exit node at the ORIGIN", () => {
    expect(district.meta.attribution.text).toContain("оригинален");
    expect(district.roads.nodes.length).toBe(4);
    expect(district.roads.edges.length).toBe(3);
    const byId = Object.fromEntries(district.roads.nodes.map((n) => [n.id, n]));
    expect([byId["mgp-n-c"].x, byId["mgp-n-c"].y]).toEqual([0, 0]);
    expect([byId["mgp-n-s"].x, byId["mgp-n-s"].y]).toEqual([0, -SOUTH_M]);
    expect([byId["mgp-n-n"].x, byId["mgp-n-n"].y]).toEqual([0, NORTH_M]);
    expect([byId["mgp-n-fore"].x, byId["mgp-n-fore"].y]).toEqual([EXIT_M, 0]);
    expect(district.intersections).toHaveLength(1);
    expect(district.intersections[0]).toMatchObject({ id: NODE, degree: 3, signalized: false });
  });

  it("THE CLASS LAW: a PRIMARY boulevard meeting a SERVICE exit — the Б2's only precondition", () => {
    const byId = Object.fromEntries(district.roads.edges.map((e) => [e.id, e]));
    for (const id of ["mgp-e-street-s", "mgp-e-street-n"]) {
      // rank 5, not 4: secondary would still GRADE a stop line but the world
      // builder would paint Б1 „Пропусни" over it (props.ts maxRank >= 5 →
      // "stop"), and a junction whose sign and law disagree teaches a lie.
      expect(byId[id].class, id).toBe("primary");
      expect(byId[id].maxspeed, id).toBe(STREET_KMH);
      expect(byId[id].lanes, id).toBe(2);
      expect(byId[id].oneway, id).toBe(false);
    }
    // rank 1 — the minor side of the heuristic, AND the class the traffic graph
    // excludes (see the lane-graph test below).
    expect(byId[EXIT_EDGE].class).toBe("service");
    expect(byId[EXIT_EDGE].maxspeed).toBe(EXIT_KMH);
    expect(byId[EXIT_EDGE].length).toBe(EXIT_M);
    // The exit runs EAST from the node, so an exiting driver travels against
    // the geometry — which is why its derived line carries dirSign −1.
    expect(byId[EXIT_EDGE].from).toBe(NODE);
    expect(byId[EXIT_EDGE].to).toBe("mgp-n-fore");
  });

  it("carries the тротоар as a real CROSSING on the exit edge — the duty is measured, not narrated", () => {
    expect(district.crossings).toHaveLength(1);
    const c = district.crossings[0];
    expect(c.id).toBe(CROSSING);
    expect([c.x, c.y]).toEqual([X_WALK, 0]);
    expect(c.edgeId).toBe(EXIT_EDGE); // the band the PLAYER crosses, not a street zebra
    expect(c.signalized).toBe(false);
    // "marked" is a deliberate, flagged choice (gen_mg_property.mjs's header):
    // legally a тротоар is not a пешеходна пътека, but "unmarked" paints
    // nothing and a student cannot stop short of a band he cannot see. The
    // CrossingZoneTracker filters on edgeId alone, so the kind is visual only.
    expect(c.kind).toBe("marked");
  });

  it("pins the derived truths in meta.scenario (the L7 copy law the template is written against)", () => {
    const sc = district.meta.scenario as {
      archetype: string;
      junctionNodeId: string;
      expectedControl: string;
      lanesPerDirection: number;
      laneCenterRightM: number;
      exitLaneCenterY: number;
      streamRunUpM: number;
      stopLineX: number;
      primaryCrossingId: string;
      params: Record<string, number>;
    };
    expect(sc.archetype).toBe("t-junction");
    expect(sc.junctionNodeId).toBe(NODE);
    expect(sc.expectedControl).toBe("stopSignOnExit");
    expect(sc.lanesPerDirection).toBe(1);
    expect(sc.laneCenterRightM).toBe(4.06); // the rounded display of X_LANE_NB
    expect(sc.exitLaneCenterY).toBe(4.06);
    expect(sc.primaryCrossingId).toBe(CROSSING);
    // The number the template's gates and BOTH trace scripts are written on.
    expect(sc.stopLineX).toBe(27.73);
    // The потокът's run-up IS the encounter's clock: released by the player's
    // roll-off, the column needs southM / 14 m/s ≈ 18.6 s to reach the mouth,
    // which is what lets the тротоар beat finish first. Shorten it and the two
    // taught beats collapse into one (gen_mg_property.mjs's header).
    expect(sc.streamRunUpM).toBe(SOUTH_M);
    expect(sc.params).toMatchObject({
      southM: SOUTH_M,
      northM: NORTH_M,
      exitM: EXIT_M,
      walkX: X_WALK,
      streetKmh: STREET_KMH,
      exitKmh: EXIT_KMH,
    });
  });

  it("THE ORDERING LAW: the тротоар sits OUTSIDE the Б2 — the two demos' separation, in metres", () => {
    // The whole reason the pavement demo can never leak a stop-sign code and
    // the flow demo can never leak a pedestrian one. 6+ m is one car length of
    // apron: enough for the taught drive to rest short of the band, clear it,
    // and only then meet the sign.
    expect(X_WALK).toBeGreaterThan(X_LINE);
    expect(X_WALK - X_LINE).toBeGreaterThan(5);
  });

  it("the spawns the template pins: the player starts INSIDE the property, facing the boulevard", () => {
    const start = district.spawnPoints.find((s) => s.id === "mgp-spawn-forecourt")!;
    expect([start.x, start.y, start.heading]).toEqual([EXIT_M - 6, 4.06, 270]);
    expect(start.edgeId).toBe(EXIT_EDGE);
    // He starts BEYOND the тротоар, on the property side — or there would be
    // no pavement to cross and no lesson.
    expect(start.x).toBeGreaterThan(X_WALK);
    const finish = district.spawnPoints.find((s) => s.id === "mgp-spawn-finish")!;
    expect([finish.x, finish.y, finish.heading]).toEqual([4.06, NORTH_M - 15, 0]);
  });

  it("builds a world with the visible Б2 the derived line matches — no invisible controls", () => {
    // props.ts places the sign on the minor approach at maxRank >= 5. Grading
    // and paint agree BY CONSTRUCTION here (the gen_t_junction ruling); this is
    // the assert that says so out loud.
    // Exactly one Б2, and NO Б1: props.ts paints "stop" only when the junction's
    // maxRank >= 5, which is the entire reason the boulevard is primary rather
    // than secondary. A Б1 here would mean the student sees „Пропусни" while the
    // engine grades a full stop.
    expect(world.stats.signs.stop).toBe(1);
    expect(world.stats.signs.giveWay ?? 0).toBe(0);
    // …and it stands on the EXIT approach — east of the node, out where the
    // derived line is — not on either boulevard arm. Same junction, same law,
    // same metre: paint and grading agree by construction.
    const stops = world.signs.filter((s) => s.kind === "stop");
    expect(stops).toHaveLength(1);
    const [wx, , wz] = stops[0].position;
    expect(wx).toBeGreaterThan(12); // clear of the boulevard's own carriageway…
    expect(Math.abs(wz)).toBeLessThan(20); // …and level with the exit lane
  });
});

describe("mg-property-v1 through the runtime (the derivations the template is built on)", () => {
  let district: District;
  let runtime: DistrictWorldRuntime;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mg-property-v1"));
    runtime = createWorldRuntime(district);
  });

  it("DERIVATION 1+2: exactly ONE stop line — a Б2 on the exit, at x = 27.73, facing west", () => {
    const lines = runtime.debugStopLines();
    expect(lines).toHaveLength(1);
    const l = lines[0];
    expect(l.control).toBe("stopSign");
    expect(l.junctionNodeId).toBe(NODE);
    // On the exit edge, and on no other approach: the boulevard's own arms are
    // the PRIORITY road and must never be stopped.
    expect(district.roads.edges[l.edgeIdx].id).toBe(EXIT_EDGE);
    // The arithmetic, proved rather than trusted: 8.125 + 4.0 (parking band)
    // + 15 (arterial corner) = 27.125 open radius, + 0.6 beyond-cut.
    expect(l.sM).toBeCloseTo(X_LINE, 3);
    // Travel AGAINST the exit's geometry (node → forecourt), i.e. westbound out
    // of the property — the direction the player actually leaves in.
    expect(l.dirSign).toBe(-1);
    expect(l.approachBearingDeg).toBeCloseTo(270, 3);
  });

  it("…and the node is therefore NOT an uncontrolled right-hand-rule junction", () => {
    // The design call, made checkable. An uncontrolled node would hand this
    // drill to the RHR tracker — which grades traffic from the RIGHT, and the
    // потокът this template is about comes from the player's LEFT. The drill
    // would acquit its own lesson.
    expect(runtime.debugUncontrolledJunctions().map((j) => j.id)).not.toContain(NODE);
  });

  it("the LOCATOR resolves the player's exit pose onto the exit edge, not the boulevard", () => {
    // If the boulevard ever won the nearest-edge fix at the forecourt, the
    // player would spawn „on the main road" and the Б2 would never fire.
    for (const x of [62, 45, X_WALK, 30]) {
      const fix = runtime.locate({ x, y: Y_EXIT });
      expect(fix?.edgeId, `x=${x}`).toBe(EXIT_EDGE);
    }
    // …and once round the corner he is on the boulevard's northbound arm.
    expect(runtime.locate({ x: X_LANE_NB, y: 60 }).edgeId).toBe("mgp-e-street-n");
  });

  it("the speed limits the drill is paced against", () => {
    expect(runtime.speedLimitAt({ x: 50, y: Y_EXIT })).toBe(EXIT_KMH);
    expect(runtime.speedLimitAt({ x: X_LANE_NB, y: 60 })).toBe(STREET_KMH);
  });

  it("the clean-room law: no signals, no roundabouts, one crossing — nothing competes", () => {
    expect(district.roundabouts).toHaveLength(0);
    expect(district.intersections.filter((i) => i.signalized)).toHaveLength(0);
    expect(district.crossings).toHaveLength(1);
    expect(district.zones ?? []).toHaveLength(0);
  });
});

describe("mg-property-v1 through the traffic graph", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mg-property-v1"));
  });

  it("THE SERVICE LAW: the boulevard carries lanes both ways; the EXIT carries none", () => {
    const g = buildLaneGraph(district as unknown as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    // Four lanes: both arms, both directions. Nothing on mgp-e-drive.
    expect(g.lanes.map((l) => l.edgeId).filter((id) => id === EXIT_EDGE)).toHaveLength(0);
    expect(g.lanes).toHaveLength(4);
    // The exit being unroutable is a FEATURE, not a limitation: no ambient car
    // and no staged actor can ever drive out of the forecourt, so the exit is
    // the player's alone and the потокът stays where the drill needs it.
    const nb = g.lanes.filter((l) => l.startDirY === 1);
    const sb = g.lanes.filter((l) => l.startDirY === -1);
    expect(nb).toHaveLength(2);
    expect(sb).toHaveLength(2);
    for (const l of nb) for (const x of l.px) expect(x).toBeCloseTo(X_LANE_NB, 4);
    for (const l of sb) for (const x of l.px) expect(x).toBeCloseTo(X_LANE_SB, 4);
  });

  it("the потокът's path exists end to end: mgp-n-s → mgp-n-c → mgp-n-n on the near bank", () => {
    const g = buildLaneGraph(district as unknown as TrafficDistrict, {
      laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
      excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
      crossingSignalRadiusM: 45,
    });
    const south = g.lanes.find((l) => l.fromNode === "mgp-n-s" && l.toNode === NODE)!;
    const north = g.lanes.find((l) => l.fromNode === NODE && l.toNode === "mgp-n-n")!;
    expect(south).toBeDefined();
    expect(north).toBeDefined();
    // The run-up the encounter's clock is measured on (see meta.streamRunUpM).
    expect(south.length).toBe(SOUTH_M);
    expect(north.length).toBe(NORTH_M);
    // The near bank: this is the lane a right-turner out of the property
    // crosses into, which is what makes the column a real conflict.
    expect(south.px[0]).toBeCloseTo(X_LANE_NB, 4);
  });
});

describe("mg-property-v1 — the archetype's reason to exist, through the REAL reducer", () => {
  let district: District;

  beforeAll(() => {
    district = assertDistrict(loadRaw("mg-property-v1"));
  });

  /** Drive the exit lane westward across the Б2 and reduce every tick. */
  function crossTheLine(conflict: boolean): string[] {
    const runtime = createWorldRuntime(district);
    runtime.setJunctionConflictQuery(() => conflict);
    const events: RuleEvent[] = [];
    let state = createRuleEngine();
    let t = 0;
    // Rest ON the line first (the taught full stop), then roll over it.
    for (const [x, v] of [
      [30, 0],
      [29.5, 0],
      [29, 0],
      [28.5, 4],
      [X_LINE, 6],
      [26, 8],
      [22, 8],
    ] as const) {
      const tick: SimTick = runtime.sample(sample(x, Y_EXIT, 270, v), t, false);
      const step = reduceTick(state, tick);
      state = step.state;
      events.push(...step.events);
      t += 0.6;
    }
    return events.map((e) => e.code);
  }

  it("crossing the Б2 with the boulevard EMPTY is innocent — and the full stop is commended", () => {
    const codes = crossTheLine(false);
    expect(codes).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(codes).not.toContain("FAILED_TO_YIELD");
    expect(codes).not.toContain("STOP_SIGN_NO_FULL_STOP");
  });

  it("THE ARCHETYPE: crossing it with the поток coming grades exactly FAILED_TO_YIELD (чл. 25)", () => {
    // The map's whole purpose in one assert. Note that the SAME drive — same
    // speeds, same full stop, same metres — is innocent above and convicted
    // here: the only variable is whether someone was coming. That is чл. 25
    // exactly, and it is why this template needed a junction rather than the
    // straight street the backlog first pointed at.
    const codes = crossTheLine(true);
    expect(codes).toContain("FAILED_TO_YIELD");
    // …and the driver is still credited for the stop he genuinely made: the
    // fault is the priority, not the sign. That split is what lets the
    // „с мигача“ demo carry exactly one code.
    expect(codes).toContain("FULL_STOP_AT_STOP_SIGN");
    expect(codes.filter((c) => c === "FAILED_TO_YIELD")).toHaveLength(1);
  });
});
