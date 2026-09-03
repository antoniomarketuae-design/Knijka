/**
 * FR-LANE-HOLD (sc-follow-tailgater:41a625d1) — THE RIBBON MAY NOT INVENT A
 * LANE CHANGE AND THEN LET THE ENGINE CONVICT THE STUDENT FOR IT.
 *
 * THE FRAME: `.audit-frames/w24/frames/sc-follow-tailgater__pc-right` — the
 * CORRECT leg of „Лепка отзад", the drive a student is told to imitate, books
 * «Смяна на лента без проверка в огледалото» ×2, «Смяна на лента без мигач» and
 * «Неустойчиво движение в лентата» at 1:44 / 1:49 / 1:49 / 2:07, «Общо
 * (допустими 9) 4 10», НЕИЗДЪРЖАН — on a 400 m straight boulevard whose
 * instruction 7 is «Дръж десния край на лентата и я остави да те изпревари».
 *
 * THE CAUSE, measured through `deriveGuidanceRoute` on the lesson's own spec
 * and district (ln-v1 is ONE edge at x = 0; the right lane is x = 12.19; the
 * two waypoints are (12.19, 200) and (12.19, 340); the car spawns at
 * (12.19, 15)). Before the repair the ribbon the student is told to follow ran:
 *   objective 0 active   y=15 x=0.00 · y=53 x=11.61 · y=63…193 x=12.19 ·
 *                        y=213 x=8.35 · y=241…340 x=0.00
 *   objective 1 active   y=205 x=0.00 · y=243 x=11.61 · y=253…340 x=12.19
 * Three fabricated 12,19 m crossings — out of the lane at the start, out of it
 * again past waypoint 1, and back in when waypoint 2 went live — because the
 * ease-in opened on the CENTRELINE under a car already in the goal's lane, and
 * the decay past the goal ran even though the next waypoint was the same lane
 * of the same street.
 *
 * §1 is that measurement. §2–§5 are the four ways the repair could be wrong: a
 * hold that ignores the next waypoint's lane, an ease-in that follows the
 * driver instead of leading him, a seed that endorses a place no lane is, and a
 * hold that carries the shift across a junction.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_FOLLOW_TAILGATER } from "../../lessons/scenario/templates-following";
import {
  LANE_ALIGN_RAMP_M,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  type DerivedRoute,
  type GuidanceGoal,
  type RouteDistrictLike,
} from "../guidanceRoute";

/** ln-v1's authored lane centres (content/world/ln-v1.json meta.scenario). */
const RIGHT = 12.19;
const LEFT = 4.06;

function districtGraph(id: string) {
  const file = path.resolve(__dirname, `../../../../../public/world/${id}.json`);
  return buildRouteGraph(JSON.parse(fs.readFileSync(file, "utf8")) as RouteDistrictLike);
}

/** The lateral coordinate of the ribbon sample nearest a given y. */
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

/** The route RouteGuidance.tsx builds for objective `idx` — same goal resolver,
 *  same look-ahead chain, driver pose `from`. */
function lessonRoute(idx: number, from: { x: number; y: number }): DerivedRoute {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
  const graph = districtGraph("ln-v1");
  const goal = guidanceGoalFor(lesson, idx, { stopLines: [], from });
  const lookahead: GuidanceGoal[] = [];
  let cursor = goal && goal.kind === "point" ? { x: goal.x, y: goal.y } : from;
  for (let k = 1; k <= 3; k++) {
    const next = guidanceGoalFor(lesson, idx + k, { stopLines: [], from: cursor });
    if (!next || next.kind !== "point") break;
    lookahead.push(next);
    cursor = { x: next.x, y: next.y };
  }
  const route = deriveGuidanceRoute(graph, { ...from, headingDeg: 0 }, goal, { lookahead });
  expect(route, `no route for objective ${idx}`).not.toBeNull();
  return route!;
}

describe("§1 sc-follow-tailgater — the ribbon stays in the lane the lesson orders", () => {
  it("objective 1 active: every sample is in the right lane, spawn to route end", () => {
    const route = lessonRoute(0, { x: RIGHT, y: 15 });
    for (let i = 0; i < route.count; i++) {
      expect(route.pts[i * 2], `sample ${i} at y=${route.pts[i * 2 + 1].toFixed(0)}`).toBeGreaterThan(
        RIGHT - 0.5,
      );
    }
    // The look-ahead leg is objective 2, the SAME lane of the same street: the
    // ribbon used to decay to the carriageway centreline over it.
    expect(xAtY(route, 250)).toBeCloseTo(RIGHT, 1);
    expect(xAtY(route, 340)).toBeCloseTo(RIGHT, 1);
  });

  it("objective 2 active: the re-derivation does not swerve out of the lane either", () => {
    // The car is where objective 1 left it. This route used to open at x = 0.00
    // under a car sitting at 12.19 and ramp back in over 40 m — the two mirror
    // faults the sheet books at 1:44 and 1:49.
    const route = lessonRoute(1, { x: RIGHT, y: 205 });
    for (let i = 0; i < route.count; i++) {
      expect(route.pts[i * 2], `sample ${i}`).toBeGreaterThan(RIGHT - 0.5);
    }
  });

  it("no sample ever asks for a lateral move a lane change would not make", () => {
    // A crossing shows up as a lateral run; with the lane held there is none.
    const route = lessonRoute(0, { x: RIGHT, y: 15 });
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < route.count; i++) {
      minX = Math.min(minX, route.pts[i * 2]);
      maxX = Math.max(maxX, route.pts[i * 2]);
    }
    expect(maxX - minX).toBeLessThan(0.5);
  });
});

describe("§2 MUTATION GUARD — the hold reads the next waypoint's LANE, not a constant", () => {
  it("a look-ahead waypoint in the OTHER lane still lets the ribbon leave this one", () => {
    // If §1 were satisfied by holding the offset unconditionally, this is the
    // case that exposes it: the ribbon must not stay right when the next
    // waypoint is the left lane.
    const graph = districtGraph("ln-v1");
    const route = deriveGuidanceRoute(
      graph,
      { x: RIGHT, y: 15, headingDeg: 0 },
      { kind: "point", x: RIGHT, y: 150 },
      { lookahead: [{ kind: "point", x: LEFT, y: 340 }] },
    )!;
    expect(xAtY(route, 145)).toBeGreaterThan(RIGHT - 0.5);
    expect(xAtY(route, 250)).toBeLessThan(RIGHT - 4);
  });
});

describe("§3 BOUND — the ease-in still LEADS: a driver out of lane is taken across", () => {
  it("from the left lane to a right-lane goal the ribbon eases over, as it always did", () => {
    const graph = districtGraph("ln-v1");
    const route = deriveGuidanceRoute(
      graph,
      { x: LEFT, y: 20, headingDeg: 0 },
      { kind: "point", x: RIGHT, y: 300 },
    )!;
    // It opens under his wheels…
    expect(xAtY(route, 20)).toBeCloseTo(LEFT, 1);
    // …and is settled in the goal's lane within the ramp, not swerving at the end.
    expect(xAtY(route, 20 + LANE_ALIGN_RAMP_M + 25)).toBeCloseTo(RIGHT, 0);
    expect(xAtY(route, 300)).toBeCloseTo(RIGHT, 1);
  });
});

describe("§4 BOUND — the seed never endorses a place that is not the goal's lane", () => {
  const graph = districtGraph("ln-v1");

  it("a driver further out than the goal's lane does not drag the ribbon out with him", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: RIGHT + 8, y: 20, headingDeg: 0 },
      { kind: "point", x: RIGHT, y: 300 },
    )!;
    for (let i = 0; i < route.count; i++) {
      expect(route.pts[i * 2], `sample ${i}`).toBeLessThan(RIGHT + 0.5);
    }
  });

  it("a driver on the WRONG side of the centreline is never followed there", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: -8, y: 20, headingDeg: 0 },
      { kind: "point", x: RIGHT, y: 300 },
    )!;
    for (let i = 0; i < route.count; i++) {
      expect(route.pts[i * 2], `sample ${i}`).toBeGreaterThan(-0.01);
    }
    // …and the ribbon still opens on the centreline and leads him right.
    expect(xAtY(route, 20)).toBeCloseTo(0, 1);
    expect(xAtY(route, 300)).toBeCloseTo(RIGHT, 1);
  });
});

describe("§5 BOUND — the hold never carries the shift across a junction", () => {
  // A(0,0) ─ B(100,0) ─ D(220,0); the lane offset is 6 m in +y.
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
  const graph = buildRouteGraph(district);

  /** y of the ribbon sample nearest a given x (the offset axis here). */
  const yAtX = (route: DerivedRoute, x: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < route.count; i++) {
      const d = Math.abs(route.pts[i * 2] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return route.pts[best * 2 + 1];
  };

  it("a look-ahead waypoint BEYOND the junction does not hold the shift through it", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 60, y: 6 },
      { lookahead: [{ kind: "point", x: 180, y: 6 }] },
    )!;
    expect(yAtX(route, 60)).toBeCloseTo(6, 0);
    // Decayed back onto the centreline it was derived on before B (x = 100).
    expect(Math.abs(yAtX(route, 110))).toBeLessThan(0.5);
  });

  it("…but one on the SAME leg does hold it, which is the whole point", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 55, y: 6 },
      { lookahead: [{ kind: "point", x: 90, y: 6 }] },
    )!;
    expect(yAtX(route, 55)).toBeCloseTo(6, 0);
    expect(yAtX(route, 85)).toBeCloseTo(6, 0);
  });
});
