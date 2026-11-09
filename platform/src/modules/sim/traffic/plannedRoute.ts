/**
 * A VEHICLE'S PLANNED ROUTE THROUGH ONE JUNCTION NODE — read-only, from the
 * route the traffic model already drives it on (lane slowturn, integrator
 * ruling R13''' 2026-11-06; sc-turn-left-oncoming:1613ef2c).
 *
 * WHY THIS EXISTS. The runtime's N1 tracker (runtime/worldRuntime.ts
 * LEFT_TURN_FORCED_SHED_MPS) convicts a SLOW left turn that made a vehicle he
 * had to give way to brake for him. Rounds 4 and 5 decided «the car he cut
 * across» from a car's heading and closing alone, and kept admitting cars whose
 * own path never met his — an oncoming LEFT-turner still in its approach lane
 * (heading opposite, closing on the node, its route turning away into the
 * north arm 20 m before his crossing). R13''' decides it from the car's OWN
 * route through the node as the traffic model plans it. Nothing here is new
 * planning: every fact is one the model already drives by.
 *
 *  · AN AMBIENT AGENT (traffic/vehicles.ts `VehicleAgent`) drives the closed
 *    lane loop `route.laneIndices` (vehicles.ts:40) from `routePos` at arc `s`
 *    (vehicles.ts:42-44); it leaves each lane at its connector's `exitS`, drives
 *    the connector (graph.ts `laneConnector`) and joins the next lane at
 *    `entryS` (vehicles.ts updateVehicle, «Lane transitions»). It is «still
 *    APPROACHING the box» while its current lane ends at the node
 *    (`curLane.toNode === heldNode`, vehicles.ts reservation lifecycle) — on
 *    the connector included, since `routePos` advances only at its end.
 *  · A STAGED vehicle (traffic/staged.ts `StagedVehicleAgent`) drives the
 *    resolved polyline `path` (lane centre-lines of `spec.pathNodes`, each
 *    lane's last point at `path.nodeS[i]`, the next lane's first point after
 *    it — staged.ts resolveStagedVehiclePath) at arc `s`. An authored rail
 *    line (`spec.railPath`) has no lanes and no movement at a node: null.
 *
 * THE MOVEMENT is `turnSpeedCap`'s own bands (vehicles.ts), read on the lane it
 * arrives by and the lane it leaves by: their cosine below −0.17 a U-turn,
 * below 0.57 a proper turn (left when the exit lies to the left of travel),
 * otherwise straight through (a bend of less than ~55° is not a turn there).
 *
 * PURE: reads the agent and the graph, writes only the caller's row.
 */
import { laneConnector, type DirectedLane, type LaneGraph } from "./graph";
import type { StagedVehicleAgent } from "./staged";
import type { PlannedMovement, PlannedRouteThroughNode } from "./types";
import type { VehicleAgent } from "./vehicles";

/** turnSpeedCap's U-turn band (vehicles.ts: «cos < −0.17 … > ~100°: near U-turn»). */
const UTURN_COS = -0.17;
/** turnSpeedCap's proper-turn band (vehicles.ts: «cos < 0.57 … > ~55°: proper turn»). */
const TURN_COS = 0.57;

/** The movement from lane `cur` onto lane `next`, by `turnSpeedCap`'s bands. */
export function plannedMovement(cur: DirectedLane, next: DirectedLane): PlannedMovement {
  const cos = cur.endDirX * next.startDirX + cur.endDirY * next.startDirY;
  if (cos < UTURN_COS) return "uturn";
  if (cos < TURN_COS) {
    // 0° = north = +y, x east: a positive cross product turns the travel to the LEFT
    // (vehicles.ts studentComing: «cross > 0 … to the left»).
    const cross = cur.endDirX * next.startDirY - cur.endDirY * next.startDirX;
    return cross > 0 ? "left" : "right";
  }
  return "straight";
}

/** A fresh row (the system keeps one and overwrites it per call). */
export function emptyPlannedRoute(): PlannedRouteThroughNode {
  return {
    id: 0,
    movement: "straight",
    approachDirX: 0,
    approachDirY: 0,
    halfWidthM: 0,
    px: [],
    py: [],
    n: 0,
    junctionRadiusM: 0,
  };
}

function push(row: PlannedRouteThroughNode, x: number, y: number): void {
  const n = row.n;
  if (n > 0 && Math.abs(row.px[n - 1] - x) < 1e-9 && Math.abs(row.py[n - 1] - y) < 1e-9) return;
  row.px[n] = x;
  row.py[n] = y;
  row.n = n + 1;
}

/** Push the polyline (px, py, cum) between arcs s0 < s1: the point at s0, the vertices strictly between, the point at s1. */
function pushRange(
  row: PlannedRouteThroughNode,
  px: ArrayLike<number>,
  py: ArrayLike<number>,
  cum: ArrayLike<number>,
  s0: number,
  s1: number,
): void {
  const last = cum.length - 1;
  if (last < 1) return;
  const len = cum[last];
  const a = Math.max(0, Math.min(len, s0));
  const b = Math.max(0, Math.min(len, s1));
  if (!(b > a)) return;
  let i = 0;
  while (i < last - 1 && cum[i + 1] <= a) i++;
  const at = (s: number, j: number): void => {
    const seg = cum[j + 1] - cum[j];
    const u = seg > 0 ? (s - cum[j]) / seg : 0;
    push(row, px[j] + (px[j + 1] - px[j]) * u, py[j] + (py[j + 1] - py[j]) * u);
  };
  at(a, i);
  let j = i + 1;
  while (j <= last && cum[j] < b) {
    push(row, px[j], py[j]);
    j++;
  }
  let k = i;
  while (k < last - 1 && cum[k + 1] < b) k++;
  at(b, k);
}

/**
 * The ambient agent's planned route through `nodeId`, or false when its route
 * does not arrive there within `reachM` of arc ahead of it (it has passed it,
 * or the node is further on, or not on its loop at all).
 */
export function ambientRouteThrough(
  graph: LaneGraph,
  agent: VehicleAgent,
  nodeId: string,
  reachM: number,
  row: PlannedRouteThroughNode,
): boolean {
  const idxs = agent.route.laneIndices;
  const count = idxs.length;
  if (count < 2) return false;
  // Find the lane (k ≥ 0 lanes ahead) that ENDS at the node, within reach.
  let found = -1;
  let toCut = 0; // arc from the car to where it leaves that lane's line
  let startS = agent.s;
  for (let k = 0; k < count; k++) {
    const lk = graph.lanes[idxs[(agent.routePos + k) % count]];
    const nk = graph.lanes[idxs[(agent.routePos + k + 1) % count]];
    const conn = laneConnector(graph, lk, nk);
    if (lk.toNode === nodeId) {
      toCut += Math.max(0, conn.exitS - startS);
      if (toCut <= reachM) found = k;
      break;
    }
    toCut += Math.max(0, conn.exitS - startS) + Math.max(0, conn.length - Math.max(0, startS - conn.exitS));
    if (toCut > reachM) break;
    startS = conn.entryS;
  }
  if (found < 0) return false;
  row.id = agent.state.id;
  row.n = 0;
  row.halfWidthM = 0;
  push(row, agent.state.x, agent.state.y);
  startS = agent.s;
  for (let k = 0; k <= found; k++) {
    const lk = graph.lanes[idxs[(agent.routePos + k) % count]];
    const nk = graph.lanes[idxs[(agent.routePos + k + 1) % count]];
    const conn = laneConnector(graph, lk, nk);
    if (startS < conn.exitS) pushRange(row, lk.px, lk.py, lk.cum, startS, conn.exitS);
    if (k === found) {
      row.movement = plannedMovement(lk, nk);
      row.approachDirX = lk.endDirX;
      row.approachDirY = lk.endDirY;
    }
    if (conn.length > 0) pushRange(row, conn.px, conn.py, conn.cum, Math.max(0, startS - conn.exitS), conn.length);
    if (k === found) pushRange(row, nk.px, nk.py, nk.cum, conn.entryS, conn.entryS + reachM);
    startS = conn.entryS;
  }
  row.junctionRadiusM = graph.junctionRadiusM.get(nodeId) ?? 0;
  return row.n >= 2;
}

/** The directed lane `from → to` the staged path was resolved on (staged.ts resolveStagedVehiclePath's own lookup). */
function laneBetween(graph: LaneGraph, from: string, to: string): DirectedLane | null {
  const out = graph.nodeOut.get(from);
  if (!out) return null;
  for (const li of out) if (graph.lanes[li].toNode === to) return graph.lanes[li];
  return null;
}

/** The staged vehicle's planned route through `nodeId` (see ambientRouteThrough). */
export function stagedRouteThrough(
  graph: LaneGraph,
  agent: StagedVehicleAgent,
  nodeId: string,
  reachM: number,
  row: PlannedRouteThroughNode,
): boolean {
  if (agent.spec.railPath !== undefined || agent.finished) return false;
  const nodes = agent.spec.pathNodes;
  const path = agent.path;
  const cum = path.cum;
  for (let i = 1; i < nodes.length - 1; i++) {
    if (nodes[i] !== nodeId) continue;
    const sCut = path.nodeS[i]; // its approach lane's last point
    if (sCut === undefined) continue;
    const inLane = laneBetween(graph, nodes[i - 1], nodes[i]);
    const outLane = laneBetween(graph, nodes[i], nodes[i + 1]);
    if (inLane === null || outLane === null) return false;
    // The exit lane starts where the straight join from the approach lane's
    // last point reaches the exit lane's first one — at sCut itself when the
    // two lanes share that point (equal-offset lanes of one straight road: the
    // resolver dedupes the joint, so the next path vertex is already the exit
    // lane's SECOND point and cannot mark the join).
    const last = inLane.px.length - 1;
    const sJoin = sCut + Math.hypot(outLane.px[0] - inLane.px[last], outLane.py[0] - inLane.py[last]);
    if (agent.s >= sJoin) continue; // on its exit lane: it has passed this node
    if (sCut - agent.s > reachM) return false;
    row.id = agent.state.id;
    row.n = 0;
    row.halfWidthM = 0;
    row.movement = plannedMovement(inLane, outLane);
    row.approachDirX = inLane.endDirX;
    row.approachDirY = inLane.endDirY;
    push(row, agent.state.x, agent.state.y);
    if (agent.s < sCut) pushRange(row, path.px, path.py, cum, agent.s, sCut);
    row.junctionRadiusM = graph.junctionRadiusM.get(nodeId) ?? 0;
    const sEnd = Math.min(sJoin + reachM, i + 1 < path.nodeS.length ? path.nodeS[i + 1] : path.length);
    pushRange(row, path.px, path.py, cum, Math.max(agent.s, sCut), sEnd);
    return row.n >= 2;
  }
  return false;
}
