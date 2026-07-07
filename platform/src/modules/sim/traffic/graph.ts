/**
 * District road graph -> directed lane graph.
 *
 * Each drivable edge becomes one directed lane per travel direction (two for
 * bidirectional edges, one for oneway), with its centerline polyline offset
 * to the right of travel so agents drive lane-center under right-hand rules.
 * Lanes carry everything the per-frame agent update needs precomputed:
 * cumulative arc lengths, end-node signal/intersection info, and the arc
 * position of every pedestrian crossing on the edge.
 *
 * Routes are restricted to the largest strongly connected component so every
 * random walk can always be closed into a loop.
 */

import type { TrafficDistrict, DistrictEdge } from "./types";

export interface LaneCrossing {
  crossingId: string;
  /** Arc length of the crossing along this lane's offset polyline. */
  s: number;
}

export interface DirectedLane {
  index: number;
  edgeId: string;
  fromNode: string;
  toNode: string;
  maxspeedKmh: number;
  /** Total arc length of the offset polyline, meters. */
  length: number;
  /** Offset polyline (lane center), travel order. */
  px: Float64Array;
  py: Float64Array;
  /** Cumulative arc length per point; cum[0] = 0, cum[n-1] = length. */
  cum: Float64Array;
  /** Index of the opposite-direction lane on the same edge, or -1. */
  reverse: number;
  /** toNode id when it is a signalized intersection, else null. */
  endSignalNodeId: string | null;
  /** Degree of toNode when it is an unsignalized intersection (>= 3), else 0. */
  endYieldDegree: number;
  /** Unit direction of the first segment. */
  startDirX: number;
  startDirY: number;
  /** Unit direction of the last segment. */
  endDirX: number;
  endDirY: number;
  crossings: LaneCrossing[];
}

/** Where a crossing sits on a lane — used by pedestrian gap checks. */
export interface CrossingLaneRef {
  laneIndex: number;
  s: number;
}

export interface LaneGraph {
  lanes: DirectedLane[];
  /** nodeId -> indices of lanes starting at that node. */
  nodeOut: Map<string, number[]>;
  /** Lane indices inside the largest strongly connected component. */
  loopLanes: Set<number>;
  /** crossingId -> signal node id (nearest signalized intersection), if any. */
  crossingSignalNode: Map<string, string>;
  /** crossingId -> lanes it spans (for pedestrian vehicle-gap checks). */
  crossingLanes: Map<string, CrossingLaneRef[]>;
}

export interface LaneGraphOptions {
  laneWidthM: number;
  excludedRoadClasses: string[];
  /** Crossings map to a signalized intersection within this radius. */
  crossingSignalRadiusM: number;
}

interface OffsetPolyline {
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
  length: number;
}

/**
 * Offset a polyline to the RIGHT of travel by `offset` meters using averaged
 * per-point segment normals (right normal of direction (dx, dy) is (dy, -dx)).
 */
export function offsetPolyline(points: number[][], offset: number): OffsetPolyline {
  const n = points.length;
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  // Per-segment unit directions.
  const sdx = new Float64Array(n - 1);
  const sdy = new Float64Array(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dx = points[i + 1][0] - points[i][0];
    const dy = points[i + 1][1] - points[i][1];
    const len = Math.hypot(dx, dy) || 1;
    sdx[i] = dx / len;
    sdy[i] = dy / len;
  }
  for (let i = 0; i < n; i++) {
    let dx: number;
    let dy: number;
    if (i === 0) {
      dx = sdx[0];
      dy = sdy[0];
    } else if (i === n - 1) {
      dx = sdx[n - 2];
      dy = sdy[n - 2];
    } else {
      dx = sdx[i - 1] + sdx[i];
      dy = sdy[i - 1] + sdy[i];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
    }
    px[i] = points[i][0] + dy * offset;
    py[i] = points[i][1] - dx * offset;
  }
  const cum = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], py[i] - py[i - 1]);
  }
  return { px, py, cum, length: cum[n - 1] };
}

/** Arc length of the closest point on the polyline to (x, y), plus distance. */
export function projectOntoPolyline(
  px: Float64Array,
  py: Float64Array,
  cum: Float64Array,
  x: number,
  y: number,
): { s: number; dist: number } {
  let bestS = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < px.length - 1; i++) {
    const ax = px[i];
    const ay = py[i];
    const bx = px[i + 1];
    const by = py[i + 1];
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby;
    let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + abx * t;
    const qy = ay + aby * t;
    const d2 = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = cum[i] + Math.sqrt(len2) * t;
    }
  }
  return { s: bestS, dist: Math.sqrt(bestD2) };
}

/** Lane-center offset from the edge centerline for the driving lane. */
function laneOffsetFor(edge: DistrictEdge, laneWidthM: number): number {
  if (edge.oneway) {
    // Geometry is the centerline of the whole oneway roadway; drive the
    // rightmost lane.
    return ((edge.lanes - 1) / 2) * laneWidthM;
  }
  // Bidirectional: our direction owns the right half. lanes=1 shared alleys
  // get offset 0 (documented limitation: opposing agents may overlap there).
  if (edge.lanes <= 1) return 0;
  const perDir = Math.max(1, Math.floor(edge.lanes / 2));
  return (perDir - 0.5) * laneWidthM;
}

export function buildLaneGraph(district: TrafficDistrict, opts: LaneGraphOptions): LaneGraph {
  const excluded = new Set(opts.excludedRoadClasses);
  const intersectionById = new Map(district.intersections.map((i) => [i.id, i]));

  const lanes: DirectedLane[] = [];
  const nodeOut = new Map<string, number[]>();
  const lanesByEdge = new Map<string, number[]>();

  const pushLane = (edge: DistrictEdge, forward: boolean): number => {
    const geometry = forward ? edge.geometry : [...edge.geometry].reverse();
    const off = offsetPolyline(geometry, laneOffsetFor(edge, opts.laneWidthM));
    const fromNode = forward ? edge.from : edge.to;
    const toNode = forward ? edge.to : edge.from;
    const endIx = intersectionById.get(toNode);
    const n = off.px.length;
    const lane: DirectedLane = {
      index: lanes.length,
      edgeId: edge.id,
      fromNode,
      toNode,
      maxspeedKmh: edge.roundabout ? Math.min(edge.maxspeed, 30) : edge.maxspeed,
      length: off.length,
      px: off.px,
      py: off.py,
      cum: off.cum,
      reverse: -1,
      endSignalNodeId: endIx?.signalized ? toNode : null,
      endYieldDegree: endIx && !endIx.signalized && endIx.degree >= 3 ? endIx.degree : 0,
      startDirX: (off.px[1] - off.px[0]) / (off.cum[1] - off.cum[0] || 1),
      startDirY: (off.py[1] - off.py[0]) / (off.cum[1] - off.cum[0] || 1),
      endDirX: (off.px[n - 1] - off.px[n - 2]) / (off.cum[n - 1] - off.cum[n - 2] || 1),
      endDirY: (off.py[n - 1] - off.py[n - 2]) / (off.cum[n - 1] - off.cum[n - 2] || 1),
      crossings: [],
    };
    lanes.push(lane);
    let out = nodeOut.get(fromNode);
    if (!out) nodeOut.set(fromNode, (out = []));
    out.push(lane.index);
    let byEdge = lanesByEdge.get(edge.id);
    if (!byEdge) lanesByEdge.set(edge.id, (byEdge = []));
    byEdge.push(lane.index);
    return lane.index;
  };

  for (const edge of district.roads.edges) {
    if (excluded.has(edge.class)) continue;
    if (edge.geometry.length < 2 || edge.length <= 0) continue;
    const f = pushLane(edge, true);
    if (!edge.oneway) {
      const b = pushLane(edge, false);
      lanes[f].reverse = b;
      lanes[b].reverse = f;
    }
  }

  // Pedestrian crossings: arc position on each lane of their edge + the
  // signal node (nearest signalized intersection) for signalized ones.
  const crossingSignalNode = new Map<string, string>();
  const crossingLanes = new Map<string, CrossingLaneRef[]>();
  const signalized = district.intersections.filter((i) => i.signalized);
  for (const crossing of district.crossings) {
    const laneIdxs = lanesByEdge.get(crossing.edgeId);
    if (laneIdxs) {
      const refs: CrossingLaneRef[] = [];
      for (const li of laneIdxs) {
        const lane = lanes[li];
        const proj = projectOntoPolyline(lane.px, lane.py, lane.cum, crossing.x, crossing.y);
        if (proj.dist <= 15) {
          lane.crossings.push({ crossingId: crossing.id, s: proj.s });
          refs.push({ laneIndex: li, s: proj.s });
        }
      }
      if (refs.length > 0) crossingLanes.set(crossing.id, refs);
    }
    if (crossing.signalized) {
      let best: string | null = null;
      let bestD2 = opts.crossingSignalRadiusM * opts.crossingSignalRadiusM;
      for (const ix of signalized) {
        const d2 = (ix.x - crossing.x) ** 2 + (ix.y - crossing.y) ** 2;
        if (d2 < bestD2) {
          bestD2 = d2;
          best = ix.id;
        }
      }
      if (best) crossingSignalNode.set(crossing.id, best);
    }
  }
  // Keep per-lane crossing lists sorted by arc position for lookahead scans.
  for (const lane of lanes) lane.crossings.sort((a, b) => a.s - b.s);

  return {
    lanes,
    nodeOut,
    loopLanes: largestScc(lanes, nodeOut),
    crossingSignalNode,
    crossingLanes,
  };
}

/**
 * Largest strongly connected component over lanes (lane -> lanes starting at
 * its toNode). Iterative Tarjan — deterministic, no recursion limits.
 */
function largestScc(lanes: DirectedLane[], nodeOut: Map<string, number[]>): Set<number> {
  const n = lanes.length;
  const indexOf = new Int32Array(n).fill(-1);
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const stack: number[] = [];
  let counter = 0;
  let best: number[] = [];

  const succ = (v: number): number[] => nodeOut.get(lanes[v].toNode) ?? [];

  for (let root = 0; root < n; root++) {
    if (indexOf[root] !== -1) continue;
    // Explicit DFS stack: [vertex, child pointer].
    const work: Array<[number, number]> = [[root, 0]];
    while (work.length > 0) {
      const frame = work[work.length - 1];
      const v = frame[0];
      if (frame[1] === 0) {
        indexOf[v] = counter;
        lowlink[v] = counter;
        counter++;
        stack.push(v);
        onStack[v] = 1;
      }
      const out = succ(v);
      let advanced = false;
      while (frame[1] < out.length) {
        const w = out[frame[1]];
        frame[1]++;
        if (indexOf[w] === -1) {
          work.push([w, 0]);
          advanced = true;
          break;
        }
        if (onStack[w]) lowlink[v] = Math.min(lowlink[v], indexOf[w]);
      }
      if (advanced) continue;
      // v is finished.
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        lowlink[parent] = Math.min(lowlink[parent], lowlink[v]);
      }
      if (lowlink[v] === indexOf[v]) {
        const comp: number[] = [];
        for (;;) {
          const w = stack.pop() as number;
          onStack[w] = 0;
          comp.push(w);
          if (w === v) break;
        }
        if (comp.length > best.length) best = comp;
      }
    }
  }
  return new Set(best);
}

/** Any sampled polyline path (DirectedLane, PedSegment, ...). */
export interface SampledPath {
  px: Float64Array;
  py: Float64Array;
  cum: Float64Array;
}

/** Position + direction at arc length s. segHint caches the segment index. */
export function sampleLane(
  lane: SampledPath,
  s: number,
  segHint: number,
  out: { x: number; y: number; dirX: number; dirY: number; segHint: number },
): void {
  const { px, py, cum } = lane;
  const last = px.length - 2;
  let i = segHint < 0 ? 0 : segHint > last ? last : segHint;
  while (i > 0 && s < cum[i]) i--;
  while (i < last && s > cum[i + 1]) i++;
  const segLen = cum[i + 1] - cum[i];
  const t = segLen > 0 ? (s - cum[i]) / segLen : 0;
  const dx = px[i + 1] - px[i];
  const dy = py[i + 1] - py[i];
  const inv = segLen > 0 ? 1 / segLen : 0;
  out.x = px[i] + dx * t;
  out.y = py[i] + dy * t;
  out.dirX = dx * inv;
  out.dirY = dy * inv;
  out.segHint = i;
}
