/**
 * A VEHICLE'S PLANNED ROUTE THROUGH A NODE (traffic/plannedRoute.ts; lane
 * slowturn, integrator ruling R13''' 2026-11-06). Read-only: the movement and
 * the centre-line come from the route the model already drives the vehicle on
 * — an ambient agent's lane loop, a staged actor's resolved lane path — on the
 * sx-v1 junction sc-turn-left-oncoming is driven at.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLaneGraph, type DirectedLane, type LaneGraph } from "../graph";
import { ambientRouteThrough, emptyPlannedRoute, plannedMovement, stagedRouteThrough } from "../plannedRoute";
import type { TrafficRoute } from "../routes";
import { resolveStagedVehiclePath, type StagedVehicleAgent } from "../staged";
import { DEFAULT_TRAFFIC_CONFIG, type TrafficDistrict } from "../types";
import { createVehicleAgent, type VehicleAgent } from "../vehicles";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORLD = path.resolve(HERE, "../../../../../../content/world");
const sx = (): TrafficDistrict => JSON.parse(readFileSync(path.join(WORLD, "sx-v1.json"), "utf-8"));

function graphOf(d: TrafficDistrict): LaneGraph {
  return buildLaneGraph(d, {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
}
function laneOf(g: LaneGraph, from: string, to: string): DirectedLane {
  const l = g.lanes.find((x) => x.fromNode === from && x.toNode === to);
  if (!l) throw new Error(`no lane ${from}>${to}`);
  return l;
}
function routeOf(lanes: DirectedLane[]): TrafficRoute {
  const laneStartS = new Float64Array(lanes.length);
  let total = 0;
  lanes.forEach((l, i) => {
    laneStartS[i] = total;
    total += l.length;
  });
  return { laneIndices: lanes.map((l) => l.index), laneStartS, totalLength: total };
}
/** An ambient agent on `lanes`, `toNodeM` metres short of the end of the first lane. */
function ambient(g: LaneGraph, lanes: DirectedLane[], toNodeM: number): VehicleAgent {
  const a = createVehicleAgent(5, routeOf(lanes), lanes[0].length - toNodeM, 1, 0);
  return a;
}
/** A staged vehicle on `pathNodes` at arc `s` (only the fields the reader touches). */
function staged(g: LaneGraph, pathNodes: string[], s: number): StagedVehicleAgent {
  const p = resolveStagedVehiclePath(g, pathNodes, 0);
  if (!p) throw new Error("path");
  let i = 0;
  while (i < p.cum.length - 2 && p.cum[i + 1] < s) i++;
  const u = (s - p.cum[i]) / (p.cum[i + 1] - p.cum[i]);
  const x = p.px[i] + (p.px[i + 1] - p.px[i]) * u;
  const y = p.py[i] + (p.py[i + 1] - p.py[i]) * u;
  return { spec: { kind: "vehicle", id: "t", pathNodes, hold: { nodeIndex: 0, offsetM: 0 }, cruiseSpeedMps: 10 }, path: p, s, finished: false, state: { id: 1000, x, y } } as unknown as StagedVehicleAgent;
}

describe("plannedMovement reads turnSpeedCap's bands on the two lanes", () => {
  const g = graphOf(sx());
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  it("eastbound into sx-n-c: on east straight, south right, north left, back west a U-turn", () => {
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-e"))).toBe("straight");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-s"))).toBe("right");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-n"))).toBe("left");
    expect(plannedMovement(eb, laneOf(g, "sx-n-c", "sx-n-w"))).toBe("uturn");
  });
});

describe("ambientRouteThrough — the agent's own lane loop", () => {
  const g = graphOf(sx());
  const eb = laneOf(g, "sx-n-w", "sx-n-c");
  const sb = laneOf(g, "sx-n-c", "sx-n-s");
  const nb = laneOf(g, "sx-n-c", "sx-n-n");
  const R = g.junctionRadiusM.get("sx-n-c") as number;

  it("an eastbound RIGHT-turner 30 m short of the node: movement right, arriving eastbound, its centre-line from its centre round the connector into the south arm", () => {
    const row = emptyPlannedRoute();
    const a = ambient(g, [eb, sb], 30);
    expect(ambientRouteThrough(g, a, "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("right");
    expect([row.approachDirX, row.approachDirY]).toEqual([eb.endDirX, eb.endDirY]);
    expect(row.junctionRadiusM).toBe(R);
    expect([row.px[0], row.py[0]]).toEqual([a.state.x, a.state.y]);
    // It ends on the south arm's lane, heading south.
    expect(row.py[row.n - 1]).toBeLessThan(row.py[0] - 20);
    expect(Math.abs(row.px[row.n - 1] - sb.px[0])).toBeLessThan(0.5);
  });

  it("an eastbound LEFT-turner: movement left (its route turns away into the north arm)", () => {
    const row = emptyPlannedRoute();
    expect(ambientRouteThrough(g, ambient(g, [eb, nb], 30), "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("left");
    expect(row.py[row.n - 1]).toBeGreaterThan(20);
  });

  it("null once it is on the lane it leaves by (it has passed the node), for a node not on its loop, and beyond the reach", () => {
    const row = emptyPlannedRoute();
    const passed = ambient(g, [sb, eb], sb.length - 1); // on the south arm's lane, 1 m out of the node
    expect(ambientRouteThrough(g, passed, "sx-n-c", 36, row)).toBe(false);
    expect(ambientRouteThrough(g, ambient(g, [eb, sb], 30), "no-such-node", 36, row)).toBe(false);
    expect(ambientRouteThrough(g, ambient(g, [eb, sb], 90), "sx-n-c", 36, row)).toBe(false);
  });
});

describe("stagedRouteThrough — the staged actor's resolved lane path", () => {
  const g = graphOf(sx());
  const nodes = ["sx-n-w", "sx-n-c", "sx-n-e"];
  const p = resolveStagedVehiclePath(g, nodes, 0)!;
  const sNode = p.nodeS[1];

  it("eastbound straight through sx-n-c, 8 m short of the node: movement straight, its line on through the node", () => {
    const row = emptyPlannedRoute();
    const a = staged(g, nodes, sNode - 8);
    expect(stagedRouteThrough(g, a, "sx-n-c", 36, row)).toBe(true);
    expect(row.movement).toBe("straight");
    expect(row.px[row.n - 1]).toBeGreaterThan(20);
  });

  it("PASSED THE NODE at the shared joint of two straight lanes: null 1 m past it (the resolver dedupes that joint — the measured r6w1 defect: a car at x 10.1 read as still approaching)", () => {
    const row = emptyPlannedRoute();
    expect(stagedRouteThrough(g, staged(g, nodes, sNode + 1), "sx-n-c", 36, row)).toBe(false);
    expect(stagedRouteThrough(g, staged(g, nodes, sNode + 10.1), "sx-n-c", 36, row)).toBe(false);
  });

  it("null beyond the reach, and for an authored rail line", () => {
    const row = emptyPlannedRoute();
    expect(stagedRouteThrough(g, staged(g, nodes, sNode - 40), "sx-n-c", 36, row)).toBe(false);
    const rail = staged(g, nodes, sNode - 8);
    (rail.spec as { railPath?: unknown }).railPath = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(stagedRouteThrough(g, rail, "sx-n-c", 36, row)).toBe(false);
  });
});
