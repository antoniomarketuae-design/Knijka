import { describe, expect, it } from "vitest";
import { buildLaneGraph } from "../graph";
import { mulberry32 } from "../rng";
import { buildRoutes } from "../routes";
import { DEFAULT_TRAFFIC_CONFIG } from "../types";
import { loadRealDistrict } from "./fixtures";

function buildReal() {
  return buildLaneGraph(loadRealDistrict(), {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
}

describe("route loops through the real district", () => {
  const graph = buildReal();

  it("produces the requested number of valid closed loops", () => {
    const routes = buildRoutes(graph, 6, mulberry32(42));
    expect(routes.length).toBeGreaterThanOrEqual(4);

    for (const route of routes) {
      expect(route.laneIndices.length).toBeGreaterThan(1);
      expect(route.totalLength).toBeGreaterThanOrEqual(150);

      // Every consecutive pair of lanes connects, INCLUDING the wrap — that
      // is what makes the loop drivable forever.
      for (let i = 0; i < route.laneIndices.length; i++) {
        const cur = graph.lanes[route.laneIndices[i]];
        const next = graph.lanes[route.laneIndices[(i + 1) % route.laneIndices.length]];
        expect(next.fromNode).toBe(cur.toNode);
      }

      // Routes never leave the loop-safe SCC.
      for (const li of route.laneIndices) {
        expect(graph.loopLanes.has(li)).toBe(true);
      }

      // laneStartS is the cumulative arc length prefix.
      let acc = 0;
      for (let i = 0; i < route.laneIndices.length; i++) {
        expect(route.laneStartS[i]).toBeCloseTo(acc, 6);
        acc += graph.lanes[route.laneIndices[i]].length;
      }
      expect(route.totalLength).toBeCloseTo(acc, 6);
    }
  });

  it("is deterministic per seed", () => {
    const a = buildRoutes(graph, 5, mulberry32(7));
    const b = buildRoutes(graph, 5, mulberry32(7));
    expect(a.map((r) => r.laneIndices)).toEqual(b.map((r) => r.laneIndices));

    const c = buildRoutes(graph, 5, mulberry32(8));
    const same = a.every(
      (r, i) =>
        c[i] &&
        r.laneIndices.length === c[i].laneIndices.length &&
        r.laneIndices.every((li, j) => li === c[i].laneIndices[j]),
    );
    expect(same).toBe(false);
  });
});
