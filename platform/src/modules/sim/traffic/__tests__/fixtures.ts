/**
 * Test fixtures: a minimal square-loop district (four oneway edges) that
 * exercises signals, crossings and following without the real district's
 * size, plus env builders for driving the agent update functions directly.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildLaneGraph, type DirectedLane, type LaneGraph } from "../graph";
import type { PedestrianEnv } from "../pedestrians";
import type { TrafficRoute } from "../routes";
import type { NodeReservation, VehicleAgent, VehicleEnv } from "../vehicles";
import {
  DEFAULT_TRAFFIC_CONFIG,
  type TrafficConfig,
  type TrafficDistrict,
} from "../types";

// ---------------------------------------------------------------------------
// Real district (content/world/district-v1.json lives outside platform/).
// ---------------------------------------------------------------------------

let realDistrictCache: TrafficDistrict | null = null;

export function loadRealDistrict(): TrafficDistrict {
  if (!realDistrictCache) {
    const path = fileURLToPath(
      new URL("../../../../../../content/world/district-v1.json", import.meta.url),
    );
    realDistrictCache = JSON.parse(readFileSync(path, "utf8")) as TrafficDistrict;
  }
  return realDistrictCache;
}

// ---------------------------------------------------------------------------
// Square fixture: A(0,0) -> B(300,0) -> C(300,300) -> D(0,300) -> A, oneway.
// ---------------------------------------------------------------------------

export interface SquareOptions {
  /** Make node B a signalized intersection. */
  signalAtB?: boolean;
  /** Add crossing "x1" mid-edge on AB at (150, 0), unsignalized. */
  crossingOnAB?: boolean;
  /** Add crossing "x2" near B at (280, 0), signalized (maps to B). */
  signalizedCrossingNearB?: boolean;
}

export function makeSquareDistrict(opts: SquareOptions = {}): TrafficDistrict {
  const crossings = [];
  if (opts.crossingOnAB) {
    crossings.push({
      id: "x1",
      x: 150,
      y: 0,
      kind: "marked",
      signalized: false,
      edgeId: "eAB",
    });
  }
  if (opts.signalizedCrossingNearB) {
    crossings.push({
      id: "x2",
      x: 280,
      y: 0,
      kind: "signals",
      signalized: true,
      edgeId: "eAB",
    });
  }
  const edge = (id: string, from: string, to: string, geometry: number[][]) => ({
    id,
    from,
    to,
    class: "residential",
    oneway: true,
    roundabout: false,
    lanes: 2,
    maxspeed: 50,
    length: 300,
    geometry,
  });
  return {
    roads: {
      nodes: [
        { id: "A", x: 0, y: 0 },
        { id: "B", x: 300, y: 0 },
        { id: "C", x: 300, y: 300 },
        { id: "D", x: 0, y: 300 },
      ],
      edges: [
        edge("eAB", "A", "B", [
          [0, 0],
          [300, 0],
        ]),
        edge("eBC", "B", "C", [
          [300, 0],
          [300, 300],
        ]),
        edge("eCD", "C", "D", [
          [300, 300],
          [0, 300],
        ]),
        edge("eDA", "D", "A", [
          [0, 300],
          [0, 0],
        ]),
      ],
    },
    intersections: opts.signalAtB ? [{ id: "B", x: 300, y: 0, degree: 2, signalized: true }] : [],
    crossings,
  };
}

export function buildSquareGraph(opts: SquareOptions = {}): {
  district: TrafficDistrict;
  graph: LaneGraph;
} {
  const district = makeSquareDistrict(opts);
  const graph = buildLaneGraph(district, {
    laneWidthM: DEFAULT_TRAFFIC_CONFIG.laneWidthM,
    excludedRoadClasses: DEFAULT_TRAFFIC_CONFIG.excludedRoadClasses,
    crossingSignalRadiusM: 45,
  });
  return { district, graph };
}

export function findLane(graph: LaneGraph, from: string, to: string): DirectedLane {
  const lane = graph.lanes.find((l) => l.fromNode === from && l.toNode === to);
  if (!lane) throw new Error(`no lane ${from} -> ${to}`);
  return lane;
}

/** The square loop as a route starting at lane A->B. */
export function squareRoute(graph: LaneGraph): TrafficRoute {
  const order = [
    findLane(graph, "A", "B"),
    findLane(graph, "B", "C"),
    findLane(graph, "C", "D"),
    findLane(graph, "D", "A"),
  ];
  const laneStartS = new Float64Array(order.length);
  let total = 0;
  for (let i = 0; i < order.length; i++) {
    laneStartS[i] = total;
    total += order[i].length;
  }
  return { laneIndices: order.map((l) => l.index), laneStartS, totalLength: total };
}

// ---------------------------------------------------------------------------
// Env builders
// ---------------------------------------------------------------------------

export function makeVehicleEnv(
  graph: LaneGraph,
  district: TrafficDistrict,
  agents: VehicleAgent[],
  cfg: TrafficConfig = DEFAULT_TRAFFIC_CONFIG,
): VehicleEnv {
  const reservations = new Map<string, NodeReservation>();
  for (const ix of district.intersections) {
    if (!ix.signalized && ix.degree >= 3) {
      reservations.set(ix.id, { holder: -1, renewedAt: -Infinity });
    }
  }
  const crossingCounts = new Map<string, number>();
  for (const c of district.crossings) crossingCounts.set(c.id, 0);
  return {
    cfg,
    graph,
    agents,
    reservations,
    crossingCounts,
    signalPhase: () => "green",
    timeSec: 0,
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedMps: 0,
    playerDirX: 0,
    playerDirY: 0,
  };
}

export function makePedestrianEnv(
  graph: LaneGraph,
  district: TrafficDistrict,
  vehicles: VehicleAgent[] = [],
  cfg: TrafficConfig = DEFAULT_TRAFFIC_CONFIG,
): PedestrianEnv {
  const crossingCounts = new Map<string, number>();
  for (const c of district.crossings) crossingCounts.set(c.id, 0);
  return {
    cfg,
    graph,
    vehicles,
    crossingCounts,
    signalPhase: () => "green",
    hasPlayer: false,
    playerX: 0,
    playerY: 0,
    playerSpeedKmh: 0,
  };
}
