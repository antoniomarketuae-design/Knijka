/**
 * Route loops for vehicle agents.
 *
 * A route is a CLOSED sequence of directed lanes (lane[i].toNode ===
 * lane[i+1].fromNode, wrapping). Built once at init: a seeded random walk
 * through the largest SCC of the lane graph until a target length, then
 * closed with a deterministic BFS back to the start node. Agents just follow
 * arc length around the loop forever — no per-frame pathfinding.
 */

import type { DirectedLane, LaneGraph } from "./graph";
import { rngRange, type Rng } from "./rng";

export interface TrafficRoute {
  laneIndices: number[];
  /** Start arc length of each lane within the loop. */
  laneStartS: Float64Array;
  totalLength: number;
}

export interface RouteOptions {
  /** Random-walk target length before closing the loop, meters. */
  minWalkM: number;
  maxWalkM: number;
  /** Reject loops shorter than this (agents would visibly orbit), meters. */
  minLoopM: number;
}

export const DEFAULT_ROUTE_OPTIONS: RouteOptions = {
  minWalkM: 350,
  maxWalkM: 800,
  minLoopM: 150,
};

export function buildRoutes(
  graph: LaneGraph,
  count: number,
  rng: Rng,
  opts: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  /** Prefer loop seeds whose start point is near here (keeps traffic where the
   *  driver is). Falls back to the nearest lanes if too few are in radius. */
  preferNear?: { x: number; y: number; radiusM: number },
): TrafficRoute[] {
  let pool = [...graph.loopLanes].sort((a, b) => a - b);
  if (pool.length === 0) return [];

  if (preferNear) {
    const { x, y, radiusM } = preferNear;
    const d2 = (li: number) => {
      const lane = graph.lanes[li];
      const dx = lane.px[0] - x;
      const dy = lane.py[0] - y;
      return dx * dx + dy * dy;
    };
    const byDist = [...pool].sort((a, b) => d2(a) - d2(b));
    const inRadius = byDist.filter((li) => d2(li) <= radiusM * radiusM);
    // Enough nearby seeds → use them; otherwise take the nearest handful so
    // traffic still clusters toward the anchor rather than scattering.
    pool = inRadius.length >= Math.max(6, count * 2)
      ? inRadius
      : byDist.slice(0, Math.max(12, count * 3));
  }
  const routes: TrafficRoute[] = [];
  const usedStartNodes = new Set<string>();

  for (let r = 0; r < count; r++) {
    let route: TrafficRoute | null = null;
    for (let attempt = 0; attempt < 8 && !route; attempt++) {
      // Prefer start lanes at nodes no other route starts from.
      let start = pool[Math.floor(rng() * pool.length)];
      for (let probe = 0; probe < pool.length; probe++) {
        const candidate = pool[(pool.indexOf(start) + probe) % pool.length];
        if (!usedStartNodes.has(graph.lanes[candidate].fromNode)) {
          start = candidate;
          break;
        }
      }
      route = tryBuildLoop(graph, start, rng, opts);
    }
    if (!route) continue;
    usedStartNodes.add(graph.lanes[route.laneIndices[0]].fromNode);
    routes.push(route);
  }
  return routes;
}

function tryBuildLoop(
  graph: LaneGraph,
  startLane: number,
  rng: Rng,
  opts: RouteOptions,
): TrafficRoute | null {
  const { lanes, nodeOut, loopLanes } = graph;
  const startNode = lanes[startLane].fromNode;
  const targetLen = rngRange(rng, opts.minWalkM, opts.maxWalkM);

  const laneIndices: number[] = [startLane];
  let walked = lanes[startLane].length;
  let current = startLane;
  for (let step = 0; step < 200 && walked < targetLen; step++) {
    const next = pickNext(graph, current, rng);
    if (next === -1) break;
    laneIndices.push(next);
    walked += lanes[next].length;
    current = next;
  }

  // Close the loop: BFS (in lane hops) from the walk's end node back to the
  // start node, restricted to the SCC — always succeeds inside one SCC.
  const endNode = lanes[current].toNode;
  if (endNode !== startNode) {
    const back = bfsPath(endNode, startNode, nodeOut, lanes, loopLanes);
    if (!back) return null;
    for (const li of back) laneIndices.push(li);
  }

  const laneStartS = new Float64Array(laneIndices.length);
  let total = 0;
  for (let i = 0; i < laneIndices.length; i++) {
    laneStartS[i] = total;
    total += lanes[laneIndices[i]].length;
  }
  if (total < opts.minLoopM) return null;
  return { laneIndices, laneStartS, totalLength: total };
}

/** Next lane out of current.toNode; avoids the immediate U-turn if possible. */
function pickNext(graph: LaneGraph, current: number, rng: Rng): number {
  const lane = graph.lanes[current];
  const out = graph.nodeOut.get(lane.toNode);
  if (!out) return -1;
  let candidateCount = 0;
  let onlyReverse = -1;
  for (const li of out) {
    if (!graph.loopLanes.has(li)) continue;
    if (li === lane.reverse) {
      onlyReverse = li;
      continue;
    }
    candidateCount++;
  }
  if (candidateCount === 0) return onlyReverse; // dead end: allowed U-turn
  let pick = Math.floor(rng() * candidateCount);
  for (const li of out) {
    if (!graph.loopLanes.has(li) || li === lane.reverse) continue;
    if (pick === 0) return li;
    pick--;
  }
  return -1;
}

/** Deterministic BFS over lanes (fixed adjacency order). Returns lane path. */
function bfsPath(
  from: string,
  to: string,
  nodeOut: Map<string, number[]>,
  lanes: DirectedLane[],
  allowed: Set<number>,
): number[] | null {
  const prevLane = new Map<string, number>(); // node -> lane that reached it
  const queue: string[] = [from];
  const visited = new Set<string>([from]);
  let head = 0;
  while (head < queue.length) {
    const node = queue[head++];
    if (node === to) break;
    const out = nodeOut.get(node);
    if (!out) continue;
    for (const li of out) {
      if (!allowed.has(li)) continue;
      const nextNode = lanes[li].toNode;
      if (visited.has(nextNode)) continue;
      visited.add(nextNode);
      prevLane.set(nextNode, li);
      queue.push(nextNode);
    }
  }
  if (!visited.has(to)) return null;
  const path: number[] = [];
  let node = to;
  while (node !== from) {
    const li = prevLane.get(node);
    if (li === undefined) return null;
    path.push(li);
    node = lanes[li].fromNode;
  }
  path.reverse();
  return path;
}
