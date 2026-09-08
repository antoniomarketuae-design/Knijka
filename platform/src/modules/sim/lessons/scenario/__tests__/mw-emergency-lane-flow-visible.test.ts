/**
 * THE МАГИСТРАЛА HAS TRAFFIC ON IT — sc-mw-emergency-lane:63336390 (major).
 *
 * THE ROW, frame `.audit-frames/sweep161/sc-mw-emergency-lane/mobile-right/
 * 01-arrival.png`: „2600 m of motorway carrying exactly one vehicle — the
 * staged broken-down car. No other traffic in either direction across 67 mobile
 * and 74 pc frames … It does not read as a магистрала."
 *
 * Three of its clauses were closed before this file existed and are gated
 * elsewhere, not here: the median barrier (`world/__tests__/mw-district.test.ts`
 * — 429 continuous panels down x = −15.185, wave 8 / f91dd1c) and the Д5
 * «Автомагистрала» plate on each carriageway (same file, wave 20 / b8b1ce4).
 * What this file measures is the clause that opened the row: the road was
 * EMPTY, and the repair (`templates-lanes.ts`, MWE_FLOW_* + MWE_ONCOMING_
 * STREAM) is what put cars on it.
 *
 * Modelled on `sp-mw-flow-visible.test.ts`, which measures the same repair on
 * the sibling drill (sc-mw-discipline) on this same map. Four sections, and
 * three of them exist because a car added to a graded lesson is a hazard until
 * it is proven not to be:
 *
 *   §1 WHY IT IS STAGED AND NOT AMBIENT — the measurement that makes
 *      `traffic.vehicleCount` a dead knob on this district. It goes red if
 *      anyone ever wires the two carriageways together, which is the day the
 *      author of that change needs to know the design premise moved.
 *   §2 THE FLOW IS THERE, out the windscreen, for the whole graded route, in
 *      both directions.
 *   §3 EVERY ADDED CAR IS IN THE RIGHT LANE — and the one that matters most is
 *      the oncoming column, because an UNOFFSET actor on the southbound path
 *      lands on the southbound EMERGENCY lane, and a lesson whose whole subject
 *      is that nobody drives there cannot show four cars streaming down one.
 *   §4 NOTHING ADDED CAN BE TOUCHED OR GRADED, on any leg this lesson ships —
 *      including both mistake demos, which drive the emergency lane.
 *
 * WATCHED RED on the way in: with `extraRightOffsetM` omitted from the oncoming
 * stream (the shape `OVG_STREAM` ships, because ov-oncoming-v1 has one lane per
 * direction and needs none) §3's southbound assertion fails at x = −38.50 —
 * the sb shoulder — which is the defect this lesson exists to teach against.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createWorldRuntime } from "../../../runtime";
import { createTrafficSystem } from "../../../traffic/system";
import { buildLaneGraph } from "../../../traffic/graph";
import { buildRoutes, DEFAULT_ROUTE_OPTIONS } from "../../../traffic/routes";
import { mulberry32 } from "../../../traffic/rng";
import type { TrafficDistrict } from "../../../traffic/types";
import { createRuleEngine } from "../../../rules";
import { createScenarioDirector } from "../../../orchestrator/director";
import { DT, stepFrame, type Stack } from "../../../orchestrator/__tests__/helpers";
import type { StagedEventSpec } from "../../../contracts";
import { SC_MW_EMERGENCY_LANE } from "../templates-lanes";

const REPO_ROOT = join(process.cwd(), "..");
const RAW = JSON.parse(
  readFileSync(
    join(REPO_ROOT, "content", "world", `${SC_MW_EMERGENCY_LANE.map.districtId}.json`),
    "utf-8",
  ),
) as TrafficDistrict & {
  meta?: { scenario?: { laneCruiseX?: number; laneLeftX?: number; laneEmergencyX?: number } };
};

/** The map's own lane centres — the template's copies are pinned against these. */
const X_CRUISE = RAW.meta!.scenario!.laneCruiseX!;
const X_LEFT = RAW.meta!.scenario!.laneLeftX!;
const X_EMERG = RAW.meta!.scenario!.laneEmergencyX!;
/** The southbound carriageway's own centreline (roads.edges mw-e-sb). */
const SB_CENTRE_X = RAW.roads.edges.find((e) => e.id === "mw-e-sb")!.geometry![0][0];

const SHIPPED_STAGED = (SC_MW_EMERGENCY_LANE.staged ?? []) as readonly StagedEventSpec[];
/** The lesson as it was BEFORE this repair — the breakdown car alone. The
 *  A/B control §4 uses to prove the added cars change no grade. */
const BREAKDOWN_ONLY = SHIPPED_STAGED.filter((s) => s.id === "sc-mwe-breakdown");

const FLOW_IDS = ["sc-mwe-flow-near", "sc-mwe-flow-far"] as const;
/** OncomingStreamRunner stages `${id}-<i>` — the ids the traffic port knows. */
const ONCOMING_IDS = [0, 1, 2, 3].map((i) => `sc-mwe-oncoming-${i}`);

/** LessonScene draws traffic to 420 m (`maxDrawDistanceM`). */
const DRAW_DISTANCE_M = 420;
/** The lesson's last graded gate (the finish reachZone). */
const FINISH_Y = Math.max(
  ...SC_MW_EMERGENCY_LANE.success.map((o) => (o.params.kind === "reachZone" ? o.params.y : 0)),
);

function makeStack(staged: readonly StagedEventSpec[]): Stack {
  const runtime = createWorldRuntime(RAW);
  const traffic = createTrafficSystem(RAW, { seed: 7, vehicleCount: 0, pedestrianCount: 0 });
  runtime.setPedestrianQuery((id) => traffic.pedestrianOnCrossing(id));
  runtime.setJunctionConflictQuery((x, y, r, b) => traffic.conflictNear(x, y, r, b));
  runtime.setOncomingQuery((px, py, h, r) => traffic.oncomingNear(px, py, h, r));
  runtime.setRightConflictQuery((jx, jy, px, py, h, r, s) =>
    traffic.conflictFromRight(jx, jy, px, py, h, r, s),
  );
  runtime.setCirculatingQuery((cx, cy, px, py, h, r) =>
    traffic.circulatingConflict(cx, cy, px, py, h, r),
  );
  return {
    runtime,
    traffic,
    director: createScenarioDirector([...staged], traffic, { seed: 7, signals: runtime }),
    rules: createRuleEngine(),
    ruleEvents: [],
    ticks: [],
    outcomes: [],
    t: 0,
  };
}

interface Leg {
  frames: number;
  /** Frames on which SOME added car was inside the camera's draw distance. */
  framesWithCompany: number;
  /** Northbound flow: smallest |Δx| to the student's line, and centre gap. */
  flowMinLateralM: number;
  flowMinSepM: number;
  /** Did either northbound flow car ever fall BEHIND the student? */
  flowEverAstern: boolean;
  flowTopKmh: number;
  /** Northbound flow lane occupancy: the x values it was ever seen at. */
  flowXs: number[];
  /** The oncoming column: x values, closest approach, and how many met him. */
  oncomingXs: number[];
  oncomingMinSepM: number;
  oncomingPassed: number;
  violationCodes: string[];
  contacts: string[];
}

/** Drive one leg of this lesson and watch every added car. `laneAt` is the
 *  student's x at a given y, so a leg can ride the shoulder over the same span
 *  its committed recording does and rejoin the flow where that one does. */
function drive(
  laneAt: (y: number) => number,
  kmh: number,
  seconds = 90,
  staged: readonly StagedEventSpec[] = SHIPPED_STAGED,
): Leg {
  const stack = makeStack(staged);
  let y = 15;
  let v = 0;
  const leg: Leg = {
    frames: 0,
    framesWithCompany: 0,
    flowMinLateralM: Infinity,
    flowMinSepM: Infinity,
    flowEverAstern: false,
    flowTopKmh: 0,
    flowXs: [],
    oncomingXs: [],
    oncomingMinSepM: Infinity,
    oncomingPassed: 0,
    violationCodes: [],
    contacts: [],
  };
  const met = new Set<string>();
  for (let i = 0; i < Math.round(seconds / DT) && y < FINISH_Y; i++) {
    const target = kmh / 3.6;
    if (v < target) v = Math.min(target, v + 2.2 * DT);
    else v = Math.max(target, v - 4.6 * DT);
    y += v * DT;
    const laneX = laneAt(y);
    const tick = stepFrame(
      stack,
      { x: laneX, y, headingDeg: 0, speedKmh: v * 3.6, brakePedal: 0 },
      { leadGapM: stack.traffic.leadGapMeters(laneX, y, 0) },
    );
    for (const e of tick.events) {
      if (e.kind === "collision") leg.contacts.push((e as { actorId?: string }).actorId ?? "?");
    }
    leg.frames++;
    let company = false;
    for (const id of FLOW_IDS) {
      const a = stack.traffic.staged(id);
      if (!a) continue;
      leg.flowXs.push(+a.x.toFixed(2));
      leg.flowMinLateralM = Math.min(leg.flowMinLateralM, Math.abs(a.x - laneX));
      leg.flowMinSepM = Math.min(leg.flowMinSepM, Math.hypot(a.x - laneX, a.y - y));
      leg.flowTopKmh = Math.max(leg.flowTopKmh, a.speedMps * 3.6);
      const aheadM = a.y - y;
      if (aheadM <= 0) leg.flowEverAstern = true;
      else if (aheadM <= DRAW_DISTANCE_M) company = true;
    }
    for (const id of ONCOMING_IDS) {
      const a = stack.traffic.staged(id);
      if (!a) continue;
      leg.oncomingXs.push(+a.x.toFixed(2));
      leg.oncomingMinSepM = Math.min(leg.oncomingMinSepM, Math.hypot(a.x - laneX, a.y - y));
      const aheadM = a.y - y;
      if (aheadM > 0 && aheadM <= DRAW_DISTANCE_M) company = true;
      // "Met and passed" — it crossed him going the other way.
      if (aheadM < -5) met.add(id);
    }
    if (company) leg.framesWithCompany++;
  }
  leg.oncomingPassed = met.size;
  leg.violationCodes = [
    ...new Set(stack.ruleEvents.filter((e) => e.kind === "violation").map((e) => e.code)),
  ];
  return leg;
}

/**
 * The three drives this lesson ships (traces/scMwEmergencyLane.ts): the taught
 * one in the cruise lane, and the two demos that ride the emergency lane.
 *
 * The demos' shoulder spans are the RECORDED ones, and they are load-bearing
 * rather than decorative: both scripts leave the shoulder well before the
 * stalled car at y = 780 („the demos teach the ban, not a crash" —
 * scMwEmergencyLane.ts). A straight-line leg that rides x = 8.13 the whole way
 * drives THROUGH the breakdown and books a COLLISION that no shipped recording
 * contains; measured red exactly that way on the way in.
 */
const CRUISE_LINE = () => X_CRUISE;
/** `mistake-undertake` rides x = 8.13 over y ∈ [361, 659]. */
const UNDERTAKE_LINE = (y: number) => (y >= 361 && y <= 659 ? X_EMERG : X_CRUISE);
/** `mistake-shoulder-cruise` rides it over y ∈ [281, 690]. */
const SHOULDER_LINE = (y: number) => (y >= 281 && y <= 690 ? X_EMERG : X_CRUISE);

const SHADOW = () => drive(CRUISE_LINE, 105);
const UNDERTAKE = () => drive(UNDERTAKE_LINE, 105);
const SHOULDER = () => drive(SHOULDER_LINE, 95);

// ---------------------------------------------------------------------------
// §1 Why it is staged and can never be ambient
// ---------------------------------------------------------------------------

describe("§1 mw-v1 cannot carry an ambient car at any density", () => {
  it("the lane graph has no closed loop, so buildRoutes returns nothing", () => {
    const graph = buildLaneGraph(RAW, {
      laneWidthM: 8.127,
      excludedRoadClasses: [],
      crossingSignalRadiusM: 45,
    });
    // Two disjoint one-way edges, four distinct nodes, no connector: the
    // largest SCC is a SINGLE lane and `tryBuildLoop`'s closing BFS can never
    // get home from it.
    expect(graph.lanes.length).toBe(2);
    expect(graph.loopLanes.size).toBe(1);
    for (let count = 1; count <= 8; count++) {
      const routes = buildRoutes(graph, count, mulberry32(7), DEFAULT_ROUTE_OPTIONS, {
        x: 0,
        y: 15,
        radiusM: 400,
      });
      expect(routes.length, `vehicleCount ${count}`).toBe(0);
    }
  });

  it("…so the template authors no ambient count, and its flow is staged", () => {
    expect(SC_MW_EMERGENCY_LANE.traffic?.vehicleCount ?? 0).toBe(0);
    // The breakdown, two northbound flow cars, one oncoming column.
    const ids = (SC_MW_EMERGENCY_LANE.staged ?? []).map((s) => s.id);
    expect(ids).toContain("sc-mwe-breakdown");
    for (const id of FLOW_IDS) expect(ids).toContain(id);
    expect(ids).toContain("sc-mwe-oncoming");
  });
});

// ---------------------------------------------------------------------------
// §2 The flow is out the windscreen
// ---------------------------------------------------------------------------

describe("§2 there is traffic in both directions, for the whole graded route", () => {
  it("some other vehicle is in the draw distance on every frame of the taught drive", () => {
    const leg = SHADOW();
    expect(leg.frames).toBeGreaterThan(100);
    // The row counted 141 frames with nothing in them. Not one frame of the
    // taught drive may be one of those now.
    expect(leg.framesWithCompany).toBe(leg.frames);
  });

  it("the northbound flow is ahead of him the whole way, at motorway pace", () => {
    const leg = SHADOW();
    expect(leg.flowEverAstern).toBe(false);
    // ~129.6 км/ч — faster than the 110 the briefing asks of him (so the gap
    // only ever opens) and lawful under the posted 140.
    expect(leg.flowTopKmh).toBeGreaterThan(128);
    expect(leg.flowTopKmh).toBeLessThan(140);
  });

  it("…and the other carriageway is alive: the column meets him and goes past", () => {
    const leg = SHADOW();
    // All four of them, spaced by the authored 480 m gaps, cross the windscreen
    // inside the graded route.
    expect(leg.oncomingPassed).toBe(ONCOMING_IDS.length);
  });
});

// ---------------------------------------------------------------------------
// §3 Every added car is in the lane the lesson can defend
// ---------------------------------------------------------------------------

describe("§3 the lanes — and the one an unoffset actor would have got wrong", () => {
  it("the northbound flow rides the OVERTAKING lane, never the cruise or emergency lane", () => {
    const leg = SHADOW();
    expect(leg.flowXs.length).toBeGreaterThan(0);
    for (const x of new Set(leg.flowXs)) {
      expect(Math.abs(x - X_LEFT), `flow car at x=${x}`).toBeLessThan(0.6);
    }
    // …which is a whole lane pitch off the student's line at all times.
    expect(leg.flowMinLateralM).toBeGreaterThan(6);
  });

  it("the oncoming column rides the sb TRAVEL lane, NOT the sb emergency lane", () => {
    const leg = SHADOW();
    expect(leg.oncomingXs.length).toBeGreaterThan(0);
    const pitch = X_EMERG - X_CRUISE; // 8.13 — one drawn lane of this map
    for (const x of new Set(leg.oncomingXs)) {
      expect(Math.abs(x - SB_CENTRE_X), `oncoming car at x=${x}`).toBeLessThan(0.6);
      // NON-VACUITY, and the whole reason `extraRightOffsetM` is authored: an
      // unoffset actor on this path lands one pitch further out, on the
      // southbound лента за принудително спиране — the lane this lesson exists
      // to keep empty. Nothing may be within half a lane of it.
      expect(Math.abs(x - (SB_CENTRE_X - pitch)), `oncoming car at x=${x}`).toBeGreaterThan(
        pitch / 2,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// §4 Nothing added can be touched, and nothing added grades
// ---------------------------------------------------------------------------

describe("§4 the added traffic is unreachable on every leg this lesson ships", () => {
  for (const [name, leg] of [
    ["the taught drive (cruise lane, 105)", SHADOW],
    ["«Изпреварване през аварийната лента» (shoulder, 105)", UNDERTAKE],
    ["«Каране по аварийната лента» (shoulder, 95)", SHOULDER],
  ] as const) {
    it(`${name}: no contact, and metres of clearance to every added car`, () => {
      const l = leg();
      expect(l.contacts).toEqual([]);
      // The northbound flow is one lane pitch away from the cruise lane and two
      // from the shoulder; the oncoming column is on the far side of the median
      // barrier. Both bounds are far outside the 6 m playerGuard corridor and
      // every contact envelope in the kit.
      expect(l.flowMinSepM).toBeGreaterThan(6);
      expect(l.oncomingMinSepM).toBeGreaterThan(20);
    });
  }

  it("the taught drive still grades clean with all seven cars staged", () => {
    // The trace gate (traces/__tests__/sc-mw-emergency-lane-traces.test.ts)
    // owns the authored recordings; this is the same claim made against the
    // straight-line harness leg, so a future actor that starts billing the
    // student fails here as well as there.
    expect(SHADOW().violationCodes).toEqual([]);
  });

  it("…and the added cars change NO grade on any leg — the A/B against the old lesson", () => {
    // The strongest form of "it grades nothing", and the only one this harness
    // can make honestly. It cannot assert the demos book EXACTLY
    // EMERGENCY_LANE_DRIVING — it teleports across the lane line with no
    // indicator and no mirror glance, so it also books
    // LANE_CHANGE_WITHOUT_INDICATOR / _WITHOUT_MIRROR_CHECK, which the
    // committed recordings do not (they signal and glance, and the trace gate
    // pins the exact single code). Those artefacts are the HARNESS's, so what
    // is measured here instead is the DIFFERENCE the repair makes: the same leg
    // driven against the lesson as it shipped before (the breakdown car alone)
    // and against the lesson as it ships now.
    for (const [name, line, kmh] of [
      ["shadow", CRUISE_LINE, 105],
      ["undertake", UNDERTAKE_LINE, 105],
      ["shoulder-cruise", SHOULDER_LINE, 95],
    ] as const) {
      const before = drive(line, kmh, 90, BREAKDOWN_ONLY);
      const after = drive(line, kmh, 90, SHIPPED_STAGED);
      expect(after.violationCodes.sort(), name).toEqual(before.violationCodes.sort());
      expect(after.contacts, name).toEqual(before.contacts);
    }
  });

  it("…and the fault this lesson exists to teach is still reached on both demos", () => {
    // The control for the A/B above: a pair of identical EMPTY lists would
    // satisfy it, so the fault has to be shown present rather than merely equal.
    for (const leg of [UNDERTAKE(), SHOULDER()]) {
      expect(leg.violationCodes).toContain("EMERGENCY_LANE_DRIVING");
      expect(leg.violationCodes).not.toContain("COLLISION");
    }
  });
});
