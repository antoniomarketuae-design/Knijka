/**
 * THE FRAME: `.audit-frames/sweep161/sc-ov-keep-right/mobile-right/04-t118s.png`.
 *
 * The green ribbon — the one the on-screen legend names «зелена — маршрутът до
 * целта» — runs down the LEFT lane for the whole approach while the blue
 * shadow-car ribbon runs in the far RIGHT lane, and the lesson's only task is
 * «Престрой се в дясната лента». The line labelled „the route to the goal"
 * pointed into the exact lane the lesson orders the student out of.
 *
 * THE MEASUREMENT that identified the cause, reproduced by §1 below.
 * `ov-keepright-v1` is a single edge (0,0)→(0,360): the whole 2+2 boulevard is
 * one centreline at x = 0. `snapToRoad` measures the goal's lateral offset
 * (12.19 m — `KR_RIGHT`, templates-lanes.ts:64) and returns it as `distM`, and
 * nothing downstream ever read it. The derived route came back x = 0.00 at
 * EVERY sample, ending 12.19 m — one and a half lane pitches — from the lane
 * it claimed to lead to. Lane was not wrong; it was inexpressible, so the
 * ribbon for a right-lane goal was byte-identical to one for a left-lane goal.
 *
 * WHY THIS FILE ASSERTS BOTH DIRECTIONS. Making the ribbon "go right" would
 * pass §1 and be worthless — a constant is not a fix. §2 drives the same
 * geometry at a LEFT-lane goal and requires the ribbon to follow it there, so
 * only a route that actually reads the objective can be green in both. §3–§5
 * hold the three bounds that stop the alignment lying somewhere else instead.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { obbSeparationM } from "../../collision";
import { compileScenario } from "../../lessons/scenario/compile";
import { SC_PARK_WALL } from "../../lessons/scenario/templates-parking3";
import { parkDepthObstacles } from "../../traces/scParkDepth";
import { CHASSIS_HALF_EXTENTS } from "../../vehicle/tuning";
import {
  LANE_ALIGN_MAX_M,
  LANE_ALIGN_RAMP_M,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  snapToRoad,
  type DerivedRoute,
  type RouteDistrictLike,
} from "../guidanceRoute";

// The authored lane centres of ov-keepright-v1 (templates-lanes.ts:64-65).
const KR_RIGHT = 12.19;
const KR_LEFT = 4.06;

function keepRightGraph() {
  const file = path.resolve(__dirname, "../../../../../public/world/ov-keepright-v1.json");
  const district = JSON.parse(fs.readFileSync(file, "utf8")) as RouteDistrictLike;
  return buildRouteGraph(district);
}

/** x of the ribbon at the sample nearest a given y. */
function xAtY(route: DerivedRoute, y: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < route.count; i++) {
    const d = Math.abs(route.pts[i * 2 + 1] - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return route.pts[best * 2];
}

function endPoint(route: DerivedRoute): { x: number; y: number } {
  const i = route.count - 1;
  return { x: route.pts[i * 2], y: route.pts[i * 2 + 1] };
}

describe("§0 the district really is one centreline — the premise of the defect", () => {
  it("ov-keepright-v1 is a single edge at x = 0, and both lanes are offsets off it", () => {
    const graph = keepRightGraph();
    expect(graph.edges).toHaveLength(1);
    // Both authored lane centres snap to the SAME edge at the same arclength —
    // which is precisely why an edge-index-plus-arclength route cannot tell
    // them apart without the lateral term.
    const right = snapToRoad(graph, KR_RIGHT, 150)!;
    const left = snapToRoad(graph, KR_LEFT, 150)!;
    expect(right.edgeIdx).toBe(left.edgeIdx);
    expect(right.sM).toBeCloseTo(left.sM, 6);
    expect(right.distM).toBeCloseTo(12.19, 2);
    expect(left.distM).toBeCloseTo(4.06, 2);
  });
});

describe("§1 the founder's frame — the ribbon arrives in the lane the task names", () => {
  const graph = keepRightGraph();
  // The lesson's own objective 1: reachZone at (KR_RIGHT, 150), radius 4.
  const route = deriveGuidanceRoute(
    graph,
    { x: KR_LEFT, y: 20, headingDeg: 0 },
    { kind: "point", x: KR_RIGHT, y: 150 },
  )!;

  it("the ribbon ends ON the goal lane, not 12.19 m beside it", () => {
    const end = endPoint(route);
    // Was x = 0.00 — the carriageway centreline, left of even the LEFT lane.
    expect(Math.abs(end.x - KR_RIGHT)).toBeLessThan(0.5);
    expect(end.y).toBeCloseTo(150, 0);
  });

  it("it is settled in the right lane well before the goal, not swerving at it", () => {
    // Step 4 of the briefing is «Не отлагай» — a ribbon that only reaches the
    // right lane at the last metre would teach the opposite.
    for (const y of [80, 100, 120, 140]) {
      expect(Math.abs(xAtY(route, y) - KR_RIGHT), `at y=${y}`).toBeLessThan(0.5);
    }
  });

  it("and it is never further left than the lane the student starts in", () => {
    // The old ribbon sat at x = 0, i.e. 4.06 m LEFT of the left lane itself.
    for (let i = 0; i < route.count; i++) {
      expect(route.pts[i * 2], `sample ${i}`).toBeGreaterThan(-0.01);
    }
  });

  it("the ease-in is a lane change, not a teleport", () => {
    // Consecutive samples never jump sideways by more than the ramp allows.
    for (let i = 1; i < route.count; i++) {
      const dx = Math.abs(route.pts[i * 2] - route.pts[(i - 1) * 2]);
      expect(dx, `sample ${i}`).toBeLessThan(2.5);
    }
    // …and the move is done inside a sane distance of where it began.
    expect(xAtY(route, 20 + LANE_ALIGN_RAMP_M + 25)).toBeCloseTo(KR_RIGHT, 0);
  });
});

describe("§2 MUTATION GUARD — the ribbon follows the OBJECTIVE, not a constant", () => {
  const graph = keepRightGraph();

  it("a LEFT-lane goal on the same road takes the ribbon left, not right", () => {
    // If §1 were satisfied by hard-coding „go right", or by copying the
    // driver's own pose, this is the case that exposes it.
    const route = deriveGuidanceRoute(
      graph,
      { x: KR_RIGHT, y: 20, headingDeg: 0 },
      { kind: "point", x: KR_LEFT, y: 150 },
    )!;
    const end = endPoint(route);
    expect(Math.abs(end.x - KR_LEFT)).toBeLessThan(0.5);
    // …and decisively NOT the right lane.
    expect(Math.abs(end.x - KR_RIGHT)).toBeGreaterThan(4);
  });

  it("a goal already on the centreline is left exactly where it was", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 0, y: 20, headingDeg: 0 },
      { kind: "point", x: 0, y: 150 },
    )!;
    for (let i = 0; i < route.count; i++) {
      expect(Math.abs(route.pts[i * 2]), `sample ${i}`).toBeLessThan(0.05);
    }
  });
});

describe("§3 BOUND — a gate goal is never aligned (guidance must lead, not follow)", () => {
  it("a `gate` shape leaves the route on the centreline", () => {
    const graph = keepRightGraph();
    const plain = deriveGuidanceRoute(
      graph,
      { x: KR_LEFT, y: 20, headingDeg: 0 },
      { kind: "point", x: KR_RIGHT, y: 150 },
    )!;
    const gated = deriveGuidanceRoute(graph, { x: KR_LEFT, y: 20, headingDeg: 0 }, {
      kind: "point",
      x: KR_RIGHT,
      y: 150,
      shape: { kind: "gate", halfWidthM: 4, dirX: 0, dirY: 1 },
    })!;
    // A gate's coordinates are the graded stop line slid sideways by the
    // DRIVER'S own measured offset, so aligning to it would point the ribbon
    // wherever the student already is — on a keep-right drill, straight back
    // into the lane he was told to leave.
    expect(Math.abs(endPoint(gated).x)).toBeLessThan(0.05);
    expect(Math.abs(endPoint(plain).x - KR_RIGHT)).toBeLessThan(0.5);
  });
});

describe("§4 BOUND — an off-road target is not a lane", () => {
  it("a goal beyond LANE_ALIGN_MAX_M leaves the ribbon on the tarmac", () => {
    const graph = keepRightGraph();
    // A parking bay / driveway sits off the carriageway by design; the marker
    // shows those. Dragging the ribbon there would drive the student at a kerb.
    const farOff = LANE_ALIGN_MAX_M + 5;
    const route = deriveGuidanceRoute(
      graph,
      { x: KR_LEFT, y: 20, headingDeg: 0 },
      { kind: "point", x: farOff, y: 150 },
    )!;
    for (let i = 0; i < route.count; i++) {
      expect(Math.abs(route.pts[i * 2]), `sample ${i}`).toBeLessThan(0.05);
    }
  });
});

// ---------------------------------------------------------------------------
// §4b — the same bound, on the ten drills §4 was written FOR.
//
// §4 above states the rule in the vocabulary of a distance and then tests it at
// LANE_ALIGN_MAX_M + 5 = 21.25 m. No parking bay this product ships is anywhere
// near that: the perpendicular rows sit 4.80–5.03 m off their aisle centreline
// and the parallel ones 6.28 m, so every one of them passed the distance test
// as „a lane" and had the ribbon slid onto it. On sc-park-wall that ribbon ran
// from the halt mark straight through the garage end wall.
//
// This section is the same claim as §4, made against the product's own bays and
// the product's own collision geometry. It is the case the distance form of the
// bound could not express.
// ---------------------------------------------------------------------------

describe("§4b BOUND — a parking bay is off-road BY KIND, not by distance (sc-park-wall:2bf89308)", () => {
  const lesson = compileScenario(SC_PARK_WALL, 3);
  const wallDistrict = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "../../../../../public/world/lot-wall-v1.json"), "utf8"),
  );
  /** Where the drill's own reference drive is standing when „Задача 2" goes
   *  live: the last forward sample of `shadow-correct.trace.json`. */
  const HALT = { x: 0.9, y: 11.66, headingDeg: 0 };
  const bayGoal = guidanceGoalFor(lesson, 1, { stopLines: [], from: HALT })!;

  it("PREMISE — the bay is well inside the distance bound, so §4 can never fire on it", () => {
    expect(bayGoal.kind).toBe("point");
    if (bayGoal.kind !== "point") return;
    // lot-wall-v1's row is at x = 5.03; the aisle centreline is x = 0.
    expect(Math.abs(bayGoal.x)).toBeLessThan(LANE_ALIGN_MAX_M);
    expect(bayGoal.offRoad).toBe(true);
  });

  it("the «Паркирай тук» ribbon clears every body the drill arms", () => {
    const graph = buildRouteGraph(wallDistrict as RouteDistrictLike);
    const route = deriveGuidanceRoute(graph, HALT, bayGoal)!;
    expect(route).not.toBeNull();
    const obstacles = parkDepthObstacles(wallDistrict, "sc-park-wall");
    let worst = Infinity;
    let where = "";
    for (let i = 0; i < route.count; i++) {
      const x = route.pts[i * 2];
      const y = route.pts[i * 2 + 1];
      const px = i > 0 ? route.pts[(i - 1) * 2] : x;
      const py = i > 0 ? route.pts[(i - 1) * 2 + 1] : y;
      const headingDeg = (Math.atan2(x - px, y - py) * 180) / Math.PI;
      for (const o of obstacles) {
        const sep = obbSeparationM(
          {
            x,
            y,
            headingDeg,
            halfWidthM: CHASSIS_HALF_EXTENTS.x,
            halfLengthM: CHASSIS_HALF_EXTENTS.z,
          },
          {
            x: o.x,
            y: o.y,
            headingDeg: o.headingDeg,
            halfWidthM: o.halfWidthM,
            halfLengthM: o.halfLengthM,
          },
        );
        if (sep < worst) {
          worst = sep;
          where = `(${x.toFixed(2)}, ${y.toFixed(2)}) vs ${String(o.withWhat)}`;
        }
      }
    }
    // Was −1.346 m at (2.27, 9.61) — 1.35 m INSIDE the garage end wall, which
    // grades `staticObject` and bills «Пътнотранспортно произшествие · ОПАСНА
    // ГРЕШКА · −10 изпитни т.» on the leg the student is told to imitate.
    expect(worst, `the ribbon is inside a body at ${where}`).toBeGreaterThan(0);
  });

  it("and nothing about WHERE to park is lost — the marker still stands on the bay", () => {
    // The bound's whole premise: the ribbon stays on the tarmac BECAUSE the
    // marker shows the off-road target. If that stopped being true, refusing
    // the alignment would take the destination away instead of the lie.
    if (bayGoal.kind !== "point") throw new Error("bay goal is not a point");
    expect(bayGoal.marker).toBe(true);
    expect(bayGoal.labelBg).toBe("Паркирай тук");
    expect([bayGoal.x, bayGoal.y]).toEqual([lesson.parkingBay!.x, lesson.parkingBay!.y]);
  });
});

describe("§5 BOUND — the shift never carries back across a junction", () => {
  // Synthetic: A(0,0) ─ B(100,0) ─ D(220,0), goal 6 m off the B–D leg.
  const district: RouteDistrictLike = {
    roads: {
      nodes: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 100, y: 0 },
        { id: "D", x: 220, y: 0 },
      ],
      edges: [
        { id: "eAB", from: "A", to: "B", oneway: false, geometry: [[0, 0], [100, 0]] },
        { id: "eBD", from: "B", to: "D", oneway: false, geometry: [[100, 0], [220, 0]] },
      ],
    },
  } as unknown as RouteDistrictLike;

  it("samples before the junction keep the centreline they were derived on", () => {
    const graph = buildRouteGraph(district);
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 180, y: 6 },
    )!;
    // The shift is applied along the LOCAL normal, so carrying it back through
    // B would hold the ribbon 6 m to the side of edge A–B as well — off the
    // carriageway of a road the objective is not even on.
    for (let i = 0; i < route.count; i++) {
      const x = route.pts[i * 2];
      const y = route.pts[i * 2 + 1];
      if (x < 95) expect(Math.abs(y), `sample at x=${x.toFixed(1)}`).toBeLessThan(0.05);
    }
    // …while the goal end still arrives in its lane.
    expect(endPoint(route).y).toBeCloseTo(6, 0);
  });
});
