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

/**
 * Where loop seeds are drawn from.
 *
 * ONE POINT IS NOT ENOUGH FOR A LESSON THAT TRAVELS (2026-09-01,
 * `sc-ed-d2-priority-run:76d2e929` — „a priority lesson with ZERO moving
 * traffic … the right drive burned 90 s of «lawful waits» standing still for a
 * car that never comes").
 *
 * Routes are built ONCE, at construction, from lanes near `{x, y}` — the
 * player's spawn — and every agent then orbits its loop forever. On a micro-map
 * that is the whole world and the anchor is invisible. On a 927 m exam cut of
 * real Лозенец it is a defect with a shape: measured over the committed
 * shadow drive of `sc-ed-d2-priority-run` (150 s, spawn → Златовръх), with the
 * anchor at the spawn and six cars, the nearest ambient vehicle went
 *
 *   t=0 s   13 m …  t=50 s   90 m │ t=60 s  223 m … t=150 s  630 m
 *
 * — a busy first minute, and then a street that empties out and never refills,
 * because the student drives 900 m away from the only place cars were ever
 * seeded. Raising the COUNT does not answer it (the far end is out of radius at
 * any density) and raising the RADIUS answers it worse (the pool then spreads
 * over the whole 21.7 km cut and the corridor gets thinner, not fuller).
 *
 * So `alongPath` names the rest of the lesson's own route. Each station gets
 * its own pool, and the routes are dealt across the stations evenly, so a
 * corridor with three loops in it puts one near the start, one in the middle
 * and one at the finish rather than three at the kerb the student left.
 *
 * `alongPath` absent (or empty) ⇒ ONE station ⇒ the pool, the rng draw order
 * and therefore every route are bit-identical to before. Every caller that does
 * not opt in — the recorder, the clip feeds, ~50 fixtures, all 105 districts —
 * is untouched by construction.
 */
export interface RoutePreference {
  x: number;
  y: number;
  radiusM: number;
  /** Further stations along the lesson's route, in route order. */
  alongPath?: readonly { x: number; y: number }[];
}

export function buildRoutes(
  graph: LaneGraph,
  count: number,
  rng: Rng,
  opts: RouteOptions = DEFAULT_ROUTE_OPTIONS,
  /** Prefer loop seeds whose start point is near here (keeps traffic where the
   *  driver is). Falls back to the nearest lanes if too few are in radius. */
  preferNear?: RoutePreference,
): TrafficRoute[] {
  const all = [...graph.loopLanes].sort((a, b) => a - b);
  if (all.length === 0) return [];

  // One seed pool per station — `[anchor, ...alongPath]`, or the whole graph
  // when nobody said where the driver is going to be.
  const radiusM = preferNear ? preferNear.radiusM : 0;
  const stations = preferNear
    ? [{ x: preferNear.x, y: preferNear.y }, ...(preferNear.alongPath ?? [])]
    : [];
  // Each station serves its share of the loops, so the „enough nearby seeds"
  // bar is measured against what THIS station is being asked for. With one
  // station that share is `count` and the arithmetic below is the original.
  const perStation = Math.ceil(count / Math.max(1, stations.length));
  const pools: number[][] = [];
  for (const station of stations) {
    const d2 = (li: number) => {
      const lane = graph.lanes[li];
      const dx = lane.px[0] - station.x;
      const dy = lane.py[0] - station.y;
      return dx * dx + dy * dy;
    };
    const byDist = [...all].sort((a, b) => d2(a) - d2(b));
    const inRadius = byDist.filter((li) => d2(li) <= radiusM * radiusM);
    if (stations.length === 1) {
      // Enough nearby seeds → use them; otherwise take the nearest handful so
      // traffic still clusters toward the anchor rather than scattering.
      pools.push(
        inRadius.length >= Math.max(6, perStation * 2)
          ? inRadius
          : byDist.slice(0, Math.max(12, perStation * 3)),
      );
      continue;
    }
    // A CORRIDOR STATION DRAWS FROM ITS NEAREST LANES, NOT FROM ITS WHOLE DISC.
    // The single-anchor rule above picks uniformly out of everything inside the
    // radius, which is right when that disc IS the lesson; along a 900 m
    // corridor it hands each station a 300 m-wide lottery and the four stations
    // end up drawing from largely the same lanes. Measured on
    // sc-ed-d2-priority-run with 8 cars, that left the last 40 s of the drive
    // with nothing inside 160 m — the same empty street, moved. `inRadius` is a
    // PREFIX of `byDist` (same order, filtered by distance), so this is simply
    // „the nearest few, and never past the radius unless the station is
    // genuinely lane-poor".
    pools.push(
      (inRadius.length >= 4 ? inRadius : byDist).slice(0, Math.max(8, perStation * 3)),
    );
  }
  if (pools.length === 0) pools.push(all);
  const routes: TrafficRoute[] = [];
  const usedStartNodes = new Set<string>();

  for (let r = 0; r < count; r++) {
    // Deal the loops ACROSS the corridor rather than round-robin: with fewer
    // loops than stations, `r % pools.length` would crowd the first few and
    // leave the finish empty — which is the defect this exists to end.
    const pool = pools[Math.min(pools.length - 1, Math.floor((r * pools.length) / count))];
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
