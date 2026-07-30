/**
 * guidanceRoute unit tests — the A7 route-derivation helper.
 *
 * Two layers:
 *  1. A synthetic mini-district (hand-checkable geometry) for the graph
 *     mechanics: shortest path, oneway legality, straightest-ahead walk,
 *     turn extraction, per-frame lookups.
 *  2. The REAL district-v1.json + the shipped LESSONS: every guidance goal
 *     resolves as designed and every derived route lands on the road network
 *     near its target.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LESSONS, lessonById, type LessonSpec } from "@/modules/sim/lessons";
import {
  ROUTE_MAX_SAMPLES,
  buildRouteGraph,
  deriveGuidanceRoute,
  guidanceGoalFor,
  nearestArcOnRoute,
  routePointAt,
  snapToRoad,
  type DerivedRoute,
  type RouteDistrictLike,
} from "./guidanceRoute";

// ---------------------------------------------------------------------------
// Synthetic district:
//
//        C (100,100)
//        │
//  A ─── B ───── D          A(0,0)  B(100,0)  D(220,0)
//  (two-way A–B by default; B–C and B–D two-way)
// ---------------------------------------------------------------------------

function edge(
  id: string,
  from: string,
  to: string,
  geometry: [number, number][],
  oneway = false,
) {
  return { id, from, to, oneway, geometry };
}

function syntheticDistrict(onewayAB = false): RouteDistrictLike {
  return {
    roads: {
      nodes: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 100, y: 0 },
        { id: "C", x: 100, y: 100 },
        { id: "D", x: 220, y: 0 },
      ],
      edges: [
        edge("eAB", "A", "B", [[0, 0], [100, 0]], onewayAB),
        edge("eBC", "B", "C", [[100, 0], [100, 100]]),
        edge("eBD", "B", "D", [[100, 0], [220, 0]]),
      ],
    },
  };
}

function endPoint(route: DerivedRoute): { x: number; y: number } {
  return {
    x: route.pts[(route.count - 1) * 2],
    y: route.pts[(route.count - 1) * 2 + 1],
  };
}

function arcsAreMonotonic(route: DerivedRoute): boolean {
  for (let i = 1; i < route.count; i++) {
    if (route.arc[i] <= route.arc[i - 1] - 1e-6) return false;
  }
  return true;
}

describe("shortest-path derivation (synthetic)", () => {
  const graph = buildRouteGraph(syntheticDistrict());

  it("routes A→C through B and flags the left turn there", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 100, y: 60 },
    );
    expect(route).not.toBeNull();
    expect(arcsAreMonotonic(route!)).toBe(true);
    // ~90 m along A–B + ~60 m up B–C, minus a rounded corner.
    expect(route!.totalLen).toBeGreaterThan(130);
    expect(route!.totalLen).toBeLessThan(160);
    const end = endPoint(route!);
    expect(end.x).toBeCloseTo(100, 0);
    expect(end.y).toBeCloseTo(60, 0);
    // East → north is a LEFT turn at B (positive rotation in x-east/y-north).
    expect(route!.turns).toHaveLength(1);
    expect(route!.turns[0].side).toBe("left");
    expect(route!.turns[0].x).toBeCloseTo(100, 0);
    expect(route!.turns[0].y).toBeCloseTo(0, 0);
    expect(route!.turns[0].s).toBeGreaterThan(70);
    expect(route!.turns[0].s).toBeLessThan(105);
    // Exit direction points north.
    expect(route!.turns[0].dirY).toBeGreaterThan(0.9);
  });

  it("routes along a single edge without inventing turns", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 80, y: 0 },
    );
    expect(route).not.toBeNull();
    expect(route!.totalLen).toBeCloseTo(70, 0);
    expect(route!.turns).toHaveLength(0);
  });

  it("never routes backwards down a oneway edge", () => {
    const onewayGraph = buildRouteGraph(syntheticDistrict(true));
    // Target BEHIND the start on the oneway A→B, no loop exists → no route.
    const route = deriveGuidanceRoute(
      onewayGraph,
      { x: 50, y: 0, headingDeg: 90 },
      { kind: "point", x: 10, y: 0 },
    );
    expect(route).toBeNull();
  });

  it("straightest-ahead walk continues B→D, not into the 90° B→C turn", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "ahead", meters: 150 },
    );
    expect(route).not.toBeNull();
    expect(route!.totalLen).toBeGreaterThanOrEqual(150);
    const end = endPoint(route!);
    expect(end.y).toBeCloseTo(0, 1); // stayed on the east–west road
    expect(end.x).toBeGreaterThan(150);
    expect(route!.turns).toHaveLength(0); // straight through B
  });

  it("ahead walk respects the vehicle heading (westbound goes toward A)", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 80, y: 0, headingDeg: 270 },
      { kind: "ahead", meters: 60 },
    );
    expect(route).not.toBeNull();
    const end = endPoint(route!);
    expect(end.x).toBeLessThan(30); // walked west toward A
  });

  it("per-frame lookups are consistent with the derived geometry", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 10, y: 0, headingDeg: 90 },
      { kind: "point", x: 100, y: 60 },
    )!;
    // Head projection: standing 3 m off the road at x=40 reads arclength ~30.
    const s = nearestArcOnRoute(route, 40, 3);
    expect(s).toBeGreaterThan(25);
    expect(s).toBeLessThan(35);
    const out = { x: 0, y: 0 };
    routePointAt(route, s, out);
    expect(out.x).toBeCloseTo(40, 0);
    expect(out.y).toBeCloseTo(0, 0);
    // Clamped at both ends.
    routePointAt(route, -50, out);
    expect(out.x).toBeCloseTo(10, 0);
    routePointAt(route, 1e9, out);
    expect(out.x).toBeCloseTo(100, 0);
  });

  it("caps the sample count at the ribbon capacity", () => {
    const route = deriveGuidanceRoute(
      graph,
      { x: 0, y: 0, headingDeg: 90 },
      { kind: "ahead", meters: 1e6 },
    );
    expect(route).not.toBeNull();
    expect(route!.count).toBeLessThanOrEqual(ROUTE_MAX_SAMPLES);
  });
});

// ---------------------------------------------------------------------------
// Goal resolution against the shipped lesson specs
// ---------------------------------------------------------------------------

describe("guidanceGoalFor (shipped lessons)", () => {
  const byId = (id: string): LessonSpec => {
    const lesson = lessonById(id);
    if (!lesson) throw new Error(`missing lesson ${id}`);
    return lesson;
  };

  it("free drive has no goals at all", () => {
    expect(guidanceGoalFor(byId("l0-free-drive"), 0)).toBeNull();
  });

  it("out-of-range index (all objectives done) yields null", () => {
    const l2 = byId("l2-intersections");
    expect(guidanceGoalFor(l2, l2.objectives.length)).toBeNull();
  });

  it("passSignal with no world context falls back to the AUTHORED node anchor", () => {
    // The two-argument form is the pure-data reading — what the author wrote.
    // With a district's graded stop lines in hand the marker moves onto the
    // approach's line instead (doc 86 T3; guidance-geometry.test.ts owns that
    // invariant over all 155 scenarios).
    const goal = guidanceGoalFor(byId("l2-intersections"), 0);
    expect(goal).toEqual({
      kind: "point",
      x: 383.17,
      y: 65.76,
      marker: true,
      affordance: "halt",
      shape: { kind: "zone", radiusM: 30 },
      acceptRadiusM: 30,
      labelBg: "Спри на стоп-линията",
    });
  });

  it("driveDistance becomes an 'ahead' goal beyond the odometer mark", () => {
    const goal = guidanceGoalFor(byId("l1-preparation"), 0);
    expect(goal?.kind).toBe("ahead");
    if (goal?.kind === "ahead") expect(goal.meters).toBeGreaterThan(300);
  });

  it("smoothStop has no target — guidance stands down", () => {
    expect(guidanceGoalFor(byId("l1-preparation"), 1)).toBeNull();
    expect(guidanceGoalFor(byId("l6-night-driving"), 1)).toBeNull();
  });

  it("emergencyStop guides ahead down the stimulus corridor", () => {
    const goal = guidanceGoalFor(byId("l5-emergency-braking"), 1);
    expect(goal?.kind).toBe("ahead");
  });

  it("parkInBay targets the authored bay, ringed at the CENTRE tolerance", () => {
    // The gate is „centre within centerTolM of the bay centre" — the ring is
    // that half-metre, not a decorative 1.85 m. The bay rect itself is painted
    // into the world (lessonWorldRecipe paintBays), so the two read together.
    const goal = guidanceGoalFor(byId("l7-parking"), 1);
    expect(goal).toEqual({
      kind: "point",
      x: 681.26,
      y: -199.54,
      marker: true,
      affordance: "halt",
      shape: { kind: "zone", radiusM: 0.5 },
      acceptRadiusM: 0.5,
      labelBg: "Паркирай тук",
    });
  });

  it("roundabout maneuver is a ribbon-only point goal (no pillar)", () => {
    const goal = guidanceGoalFor(byId("l3-roundabout"), 1);
    expect(goal).toMatchObject({
      kind: "point",
      x: -38.03,
      y: -342.96,
      marker: false,
      labelBg: "Влез в кръговото",
    });
  });
});

// ---------------------------------------------------------------------------
// Real district: every lesson's first-objective route derives and lands on
// the network near its goal.
// ---------------------------------------------------------------------------

describe("derivation on the real district", () => {
  const file = path.resolve(__dirname, "../../../../public/world/district-v1.json");
  const district = JSON.parse(fs.readFileSync(file, "utf8")) as RouteDistrictLike & {
    spawnPoints: { id: string; x: number; y: number; heading: number }[];
  };
  const graph = buildRouteGraph(district);

  const spawnOf = (lesson: LessonSpec) => {
    const p = district.spawnPoints.find((s) => s.id === lesson.spawn.pointId);
    if (!p) throw new Error(`missing spawn ${lesson.spawn.pointId}`);
    return { x: p.x, y: p.y, headingDeg: p.heading };
  };

  it("derives a route for the active objective of every lesson that wants one", () => {
    for (const lesson of LESSONS) {
      for (let i = 0; i < lesson.objectives.length; i++) {
        const goal = guidanceGoalFor(lesson, i);
        if (goal === null) continue; // smoothStop etc. — by design
        // Start every check from the lesson spawn (the runtime recomputes
        // from the live pose on objective change; spawn is the worst case).
        const route = deriveGuidanceRoute(graph, spawnOf(lesson), goal);
        expect(route, `${lesson.id} objective ${i}`).not.toBeNull();
        expect(arcsAreMonotonic(route!), `${lesson.id} objective ${i} arc`).toBe(true);
        expect(route!.totalLen).toBeGreaterThan(6);
        if (goal.kind === "point") {
          // Route ends at the target's on-road projection.
          const snapped = snapToRoad(graph, goal.x, goal.y)!;
          const end = endPoint(route!);
          const gap = Math.hypot(end.x - goal.x, end.y - goal.y);
          expect(gap, `${lesson.id} objective ${i} end gap`).toBeLessThan(
            snapped.distM + 6,
          );
        } else {
          expect(route!.totalLen).toBeGreaterThanOrEqual(Math.min(goal.meters, 60));
        }
      }
    }
  });

  it("L2 route heads north from spawn-4 to the Б2 stop node", () => {
    const l2 = lessonById("l2-intersections")!;
    const route = deriveGuidanceRoute(graph, spawnOf(l2), guidanceGoalFor(l2, 0))!;
    expect(route.totalLen).toBeGreaterThan(120);
    expect(route.totalLen).toBeLessThan(300);
    const end = endPoint(route);
    expect(Math.hypot(end.x - 383.17, end.y - 65.76)).toBeLessThan(10);
  });

  it("every route sample stays inside the district bounds", () => {
    const l4 = lessonById("l4-crossings")!;
    const route = deriveGuidanceRoute(graph, spawnOf(l4), guidanceGoalFor(l4, 0))!;
    for (let i = 0; i < route.count; i++) {
      expect(Math.abs(route.pts[i * 2])).toBeLessThan(2000);
      expect(Math.abs(route.pts[i * 2 + 1])).toBeLessThan(2000);
    }
  });
});

// ---------------------------------------------------------------------------
// Полигон (B3 multi-map): guidance derives on poligon-v1 exactly like on the
// city — the graph builder takes whatever district the scene loaded.
// ---------------------------------------------------------------------------

describe("derivation on the полигон (poligon-v1)", () => {
  const file = path.resolve(__dirname, "../../../../public/world/poligon-v1.json");
  const district = JSON.parse(fs.readFileSync(file, "utf8")) as RouteDistrictLike & {
    spawnPoints: { id: string; x: number; y: number; heading: number }[];
  };
  const graph = buildRouteGraph(district);
  const l8 = lessonById("l8-poligon")!;
  const spawn = (() => {
    const p = district.spawnPoints.find((s) => s.id === l8.spawn.pointId);
    if (!p) throw new Error(`missing полигон spawn ${l8.spawn.pointId}`);
    return { x: p.x, y: p.y, headingDeg: p.heading };
  })();

  it("derives a route for every l8 objective that wants one", () => {
    for (let i = 0; i < l8.objectives.length; i++) {
      const goal = guidanceGoalFor(l8, i);
      if (goal === null) continue; // smoothStop — by design
      const route = deriveGuidanceRoute(graph, spawn, goal);
      expect(route, `l8 objective ${i}`).not.toBeNull();
      expect(route!.totalLen).toBeGreaterThan(6);
      if (goal.kind === "point") {
        const snapped = snapToRoad(graph, goal.x, goal.y)!;
        const end = endPoint(route!);
        const gap = Math.hypot(end.x - goal.x, end.y - goal.y);
        expect(gap, `l8 objective ${i} end gap`).toBeLessThan(snapped.distM + 6);
      }
    }
  });

  it("the circuit drive walks ahead along the perimeter, the park targets the apron bay", () => {
    const ahead = guidanceGoalFor(l8, 0);
    expect(ahead?.kind).toBe("ahead");
    const park = guidanceGoalFor(l8, 1);
    expect(park).toMatchObject({ kind: "point", x: 98.5, y: -70, marker: true });
    // The bay snaps onto the parking apron, well inside the полигон bounds.
    const snapped = snapToRoad(graph, 98.5, -70)!;
    expect(snapped.distM).toBeLessThan(8);
  });
});
