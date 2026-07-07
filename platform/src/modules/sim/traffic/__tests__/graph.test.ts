import { describe, expect, it } from "vitest";
import { buildLaneGraph } from "../graph";
import { DEFAULT_TRAFFIC_CONFIG } from "../types";
import { buildSquareGraph, findLane, loadRealDistrict } from "./fixtures";

function buildReal() {
  return buildLaneGraph(loadRealDistrict(), {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
}

describe("lane graph from the real district", () => {
  const graph = buildReal();

  it("builds a substantial directed lane set", () => {
    expect(graph.lanes.length).toBeGreaterThan(200);
  });

  it("every lane has valid geometry and arc lengths", () => {
    for (const lane of graph.lanes) {
      expect(lane.length).toBeGreaterThan(0);
      expect(Number.isFinite(lane.px[0])).toBe(true);
      expect(Number.isFinite(lane.py[lane.py.length - 1])).toBe(true);
      for (let i = 1; i < lane.cum.length; i++) {
        expect(lane.cum[i]).toBeGreaterThanOrEqual(lane.cum[i - 1]);
      }
      expect(lane.cum[lane.cum.length - 1]).toBeCloseTo(lane.length, 6);
      // Unit direction vectors.
      expect(Math.hypot(lane.startDirX, lane.startDirY)).toBeCloseTo(1, 2);
      expect(Math.hypot(lane.endDirX, lane.endDirY)).toBeCloseTo(1, 2);
    }
  });

  it("reverse lanes pair up consistently", () => {
    for (const lane of graph.lanes) {
      if (lane.reverse === -1) continue;
      const rev = graph.lanes[lane.reverse];
      expect(rev.reverse).toBe(lane.index);
      expect(rev.fromNode).toBe(lane.toNode);
      expect(rev.toNode).toBe(lane.fromNode);
      expect(rev.edgeId).toBe(lane.edgeId);
    }
  });

  it("lane crossings sit within the lane and are sorted", () => {
    let total = 0;
    for (const lane of graph.lanes) {
      for (let i = 0; i < lane.crossings.length; i++) {
        const c = lane.crossings[i];
        expect(c.s).toBeGreaterThanOrEqual(0);
        expect(c.s).toBeLessThanOrEqual(lane.length + 0.001);
        if (i > 0) expect(c.s).toBeGreaterThanOrEqual(lane.crossings[i - 1].s);
        total++;
      }
    }
    expect(total).toBeGreaterThan(20); // 54 crossings in the district
  });

  it("finds a dominant strongly connected component for loops", () => {
    expect(graph.loopLanes.size).toBeGreaterThan(graph.lanes.length * 0.5);
    // Every loop lane can continue to another loop lane.
    for (const li of graph.loopLanes) {
      const out = graph.nodeOut.get(graph.lanes[li].toNode) ?? [];
      expect(out.some((o) => graph.loopLanes.has(o))).toBe(true);
    }
  });

  it("maps signalized crossings to nearby signal nodes", () => {
    const district = loadRealDistrict();
    const signalized = new Set(
      district.intersections.filter((i) => i.signalized).map((i) => i.id),
    );
    expect(graph.crossingSignalNode.size).toBeGreaterThan(0);
    for (const [, nodeId] of graph.crossingSignalNode) {
      expect(signalized.has(nodeId)).toBe(true);
    }
  });
});

describe("lane graph offsets (square fixture)", () => {
  it("offsets the driving lane to the right of travel", () => {
    const { graph } = buildSquareGraph();
    // eAB is oneway with 2 lanes: rightmost lane center = 1.625 m right of
    // the centerline. Direction (1, 0) -> right normal (0, -1) -> y = -1.625.
    const ab = findLane(graph, "A", "B");
    expect(ab.py[0]).toBeCloseTo(-1.625, 3);
    expect(ab.py[ab.py.length - 1]).toBeCloseTo(-1.625, 3);
    expect(ab.length).toBeCloseTo(300, 1);
  });

  it("marks signalized lane ends and projects crossings", () => {
    const { graph } = buildSquareGraph({ signalAtB: true, crossingOnAB: true });
    const ab = findLane(graph, "A", "B");
    expect(ab.endSignalNodeId).toBe("B");
    expect(ab.crossings.length).toBe(1);
    expect(ab.crossings[0].crossingId).toBe("x1");
    expect(ab.crossings[0].s).toBeCloseTo(150, 1);
    const bc = findLane(graph, "B", "C");
    expect(bc.endSignalNodeId).toBeNull();
  });

  it("maps a signalized crossing near B to signal node B", () => {
    const { graph } = buildSquareGraph({ signalAtB: true, signalizedCrossingNearB: true });
    expect(graph.crossingSignalNode.get("x2")).toBe("B");
  });
});
