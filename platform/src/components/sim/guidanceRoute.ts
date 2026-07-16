/**
 * guidanceRoute — PURE route derivation for A7 "in-world route guidance"
 * (doc 68 Pillar 2; audit finding B9: attention belongs on traffic, not
 * wayfinding). No three.js here — RouteGuidance.tsx renders what this derives,
 * and the unit tests run in plain node.
 *
 * Per-lesson derivation model (specs stay DATA-only, nothing added to them):
 *  - reachZone / passSignal   → shortest legal on-road path to the target
 *                               point + a light-pillar marker there.
 *  - roundabout maneuver      → shortest path toward the island center
 *                               (ribbon only — any exit completes it).
 *  - parkInBay maneuver       → shortest path to lesson.parkingBay + marker.
 *  - driveDistance            → no target exists, so guide "ahead": follow the
 *                               road from the current pose, choosing the
 *                               straightest legal continuation at each node,
 *                               for `meters` + a small buffer.
 *  - emergencyStop            → "ahead" along the stimulus corridor (L5).
 *  - smoothStop               → null (stop where you are — nothing to find).
 *
 * Derivation runs ONLY on objective change; the per-frame helpers at the
 * bottom (nearestArcOnRoute / routePointAt) are allocation-free.
 */

import { parseObjectiveParams, type LessonSpec } from "@/modules/sim/lessons";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------

/** Geometry capacity of the preallocated ribbon (samples along the route). */
export const ROUTE_MAX_SAMPLES = 1024;

const DENSIFY_STEP_M = 2.5;
const MAX_ROUTE_LEN_M = (ROUTE_MAX_SAMPLES - 1) * DENSIFY_STEP_M;
const MIN_ROUTE_LEN_M = 6;
/** Junction heading change that counts as "a turn" (arrow-worthy). */
const TURN_MIN_RAD = (30 * Math.PI) / 180;
/** Corner sharpness above which the polyline gets a rounding arc. */
const CORNER_MIN_RAD = (18 * Math.PI) / 180;
const CORNER_CUT_MAX_M = 8;
/** Window over which junction in/out directions are measured (noise-proof). */
const TURN_DIR_WINDOW_M = 6;
/** driveDistance routes extend past the odometer mark so the ribbon never
 * ends exactly where the counter will complete. */
const AHEAD_BUFFER_M = 30;
/** emergencyStop is coordinate-free — guide down the corridor this far. */
const EMERGENCY_AHEAD_M = 150;
const MAX_WALK_EDGES = 64;
const EPS = 1e-6;
const DEG2RAD = Math.PI / 180;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Structural view of the district pieces this module reads (the world and
 * runtime modules each own richer types; we depend on neither). */
export interface RouteEdgeLike {
  id: string;
  from: string;
  to: string;
  oneway: boolean;
  /** Polyline [x, y][] in district meters; endpoints = from/to nodes. */
  geometry: [number, number][];
}
export interface RouteDistrictLike {
  roads: { nodes: { id: string; x: number; y: number }[]; edges: RouteEdgeLike[] };
}

/** What the active objective asks the guidance layer to show. */
export type GuidanceGoal =
  | { kind: "point"; x: number; y: number; marker: boolean }
  | { kind: "ahead"; meters: number };

export interface RouteTurn {
  /** Arclength along the derived route where the junction sits, meters. */
  s: number;
  x: number;
  y: number;
  side: "left" | "right";
  /** Unit exit direction at the junction (district coords, x east y north). */
  dirX: number;
  dirY: number;
}

export interface DerivedRoute {
  /** Flat [x0, y0, x1, y1, …] district-coord samples (2.5 m spacing). */
  pts: Float32Array;
  /** Cumulative arclength per sample, meters. */
  arc: Float32Array;
  count: number;
  totalLen: number;
  turns: RouteTurn[];
}

// ---------------------------------------------------------------------------
// Goal resolution (reads lesson specs; additive-only contract respected)
// ---------------------------------------------------------------------------

export function guidanceGoalFor(
  lesson: LessonSpec,
  objectiveIndex: number,
): GuidanceGoal | null {
  const objective = lesson.objectives[objectiveIndex];
  if (!objective) return null;
  let params;
  try {
    params = parseObjectiveParams(objective);
  } catch {
    return null; // malformed spec — guidance silently stands down
  }
  switch (params.kind) {
    case "reachZone":
      return { kind: "point", x: params.x, y: params.y, marker: true };
    case "passSignal":
      return { kind: "point", x: params.x, y: params.y, marker: true };
    case "driveDistance":
      return { kind: "ahead", meters: params.meters + AHEAD_BUFFER_M };
    case "completeManeuver":
      switch (params.maneuver) {
        case "roundabout":
          // Ribbon to the ring; no pillar — any exit completes the maneuver.
          return { kind: "point", x: params.x, y: params.y, marker: false };
        case "parkInBay":
          return lesson.parkingBay
            ? { kind: "point", x: lesson.parkingBay.x, y: lesson.parkingBay.y, marker: true }
            : null;
        case "emergencyStop":
          return { kind: "ahead", meters: EMERGENCY_AHEAD_M };
        case "smoothStop":
          return null;
        case "threePointTurn":
          // Ribbon to the turn box; the marker sits at the corridor centre.
          return { kind: "point", x: params.corridor.x, y: params.corridor.y, marker: true };
      }
  }
}

// ---------------------------------------------------------------------------
// Road graph
// ---------------------------------------------------------------------------

interface GraphEdge {
  idx: number;
  raw: RouteEdgeLike;
  /** Flat vertex buffer [x0, y0, x1, y1, …]. */
  pts: Float64Array;
  /** Cumulative arclength per vertex. */
  cum: Float64Array;
  totalLen: number;
}

interface GraphArc {
  edgeIdx: number;
  toNode: string;
  len: number;
}

export interface RouteGraph {
  edges: GraphEdge[];
  /** Directed adjacency (oneway edges only run from → to). */
  adj: Map<string, GraphArc[]>;
}

/** Build once per district (mount-time); reused across objective changes. */
export function buildRouteGraph(district: RouteDistrictLike): RouteGraph {
  const edges: GraphEdge[] = [];
  const adj = new Map<string, GraphArc[]>();
  const arc = (node: string, a: GraphArc) => {
    let list = adj.get(node);
    if (!list) adj.set(node, (list = []));
    list.push(a);
  };
  for (const raw of district.roads.edges) {
    const n = raw.geometry.length;
    if (n < 2) continue;
    const pts = new Float64Array(n * 2);
    const cum = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      pts[i * 2] = raw.geometry[i][0];
      pts[i * 2 + 1] = raw.geometry[i][1];
      if (i > 0) {
        cum[i] =
          cum[i - 1] +
          Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
      }
    }
    const totalLen = cum[n - 1];
    if (totalLen <= EPS) continue;
    const idx = edges.length;
    edges.push({ idx, raw, pts, cum, totalLen });
    if (raw.from !== raw.to) {
      arc(raw.from, { edgeIdx: idx, toNode: raw.to, len: totalLen });
      if (!raw.oneway) arc(raw.to, { edgeIdx: idx, toNode: raw.from, len: totalLen });
    }
  }
  return { edges, adj };
}

// ---------------------------------------------------------------------------
// Snapping + edge geometry
// ---------------------------------------------------------------------------

export interface RoadSnap {
  edgeIdx: number;
  /** Arclength of the projection along the edge, meters. */
  sM: number;
  distM: number;
}

/** Nearest point on any edge (global scan — build-time only, never per frame). */
export function snapToRoad(graph: RouteGraph, x: number, y: number): RoadSnap | null {
  let best: RoadSnap | null = null;
  let bestD2 = Infinity;
  for (const e of graph.edges) {
    const segs = e.cum.length - 1;
    for (let s = 0; s < segs; s++) {
      const ax = e.pts[s * 2];
      const ay = e.pts[s * 2 + 1];
      const bx = e.pts[s * 2 + 2];
      const by = e.pts[s * 2 + 3];
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d2 = (x - px) * (x - px) + (y - py) * (y - py);
      if (d2 < bestD2) {
        bestD2 = d2;
        best = { edgeIdx: e.idx, sM: e.cum[s] + t * (e.cum[s + 1] - e.cum[s]), distM: Math.sqrt(d2) };
      }
    }
  }
  return best;
}

function pointOnEdge(e: GraphEdge, s: number): [number, number] {
  const ss = Math.max(0, Math.min(e.totalLen, s));
  const n = e.cum.length;
  let seg = 0;
  while (seg < n - 2 && e.cum[seg + 1] < ss) seg++;
  const segLen = e.cum[seg + 1] - e.cum[seg];
  const t = segLen > 0 ? (ss - e.cum[seg]) / segLen : 0;
  return [
    e.pts[seg * 2] + t * (e.pts[seg * 2 + 2] - e.pts[seg * 2]),
    e.pts[seg * 2 + 1] + t * (e.pts[seg * 2 + 3] - e.pts[seg * 2 + 1]),
  ];
}

function tangentOnEdge(e: GraphEdge, s: number): [number, number] {
  const n = e.cum.length;
  let seg = 0;
  while (seg < n - 2 && e.cum[seg + 1] < s) seg++;
  const dx = e.pts[seg * 2 + 2] - e.pts[seg * 2];
  const dy = e.pts[seg * 2 + 3] - e.pts[seg * 2 + 1];
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [0, 1];
}

/** Sub-polyline of an edge between two arclengths; s1 < s0 ⇒ reversed. */
function slicePolyline(e: GraphEdge, s0: number, s1: number): [number, number][] {
  const lo = Math.min(s0, s1);
  const hi = Math.max(s0, s1);
  const out: [number, number][] = [pointOnEdge(e, lo)];
  for (let i = 0; i < e.cum.length; i++) {
    if (e.cum[i] > lo + EPS && e.cum[i] < hi - EPS) out.push([e.pts[i * 2], e.pts[i * 2 + 1]]);
  }
  out.push(pointOnEdge(e, hi));
  if (s1 < s0) out.reverse();
  return out;
}

// ---------------------------------------------------------------------------
// Raw route assembly (points + junction markers)
// ---------------------------------------------------------------------------

interface RawRoute {
  points: [number, number][];
  /** Indices into `points` where a graph node (junction) sits. */
  jointIdx: number[];
}

function appendPiece(raw: RawRoute, pts: [number, number][]): void {
  for (const p of pts) {
    const last = raw.points[raw.points.length - 1];
    if (last && Math.abs(last[0] - p[0]) < EPS && Math.abs(last[1] - p[1]) < EPS) continue;
    raw.points.push(p);
  }
}

/**
 * Dijkstra over the directed road graph (≈300 nodes — a naive scan-min is
 * instant at objective-change frequency). Start/target are edge snaps; oneway
 * edges are traversable from → to only, so guidance never routes a student
 * against a одностранна улица.
 */
function shortestPathRaw(graph: RouteGraph, start: RoadSnap, target: RoadSnap): RawRoute | null {
  const eS = graph.edges[start.edgeIdx];
  const eT = graph.edges[target.edgeIdx];

  // Same edge, legal direction → direct slice, no graph walk.
  if (start.edgeIdx === target.edgeIdx && (target.sM >= start.sM - EPS || !eS.raw.oneway)) {
    return { points: slicePolyline(eS, start.sM, target.sM), jointIdx: [] };
  }

  const dist = new Map<string, number>();
  const prevNode = new Map<string, string | null>(); // null ⇒ seeded from the start edge
  const prevEdge = new Map<string, number>();
  const settled = new Set<string>();
  const seed = (node: string, d: number) => {
    if (d < (dist.get(node) ?? Infinity)) {
      dist.set(node, d);
      prevNode.set(node, null);
      prevEdge.set(node, start.edgeIdx);
    }
  };
  seed(eS.raw.to, eS.totalLen - start.sM);
  if (!eS.raw.oneway) seed(eS.raw.from, start.sM);

  for (;;) {
    let u: string | null = null;
    let du = Infinity;
    for (const [node, d] of dist) {
      if (!settled.has(node) && d < du) {
        du = d;
        u = node;
      }
    }
    if (u === null) break;
    settled.add(u);
    const arcs = graph.adj.get(u);
    if (!arcs) continue;
    for (const a of arcs) {
      const nd = du + a.len;
      if (nd < (dist.get(a.toNode) ?? Infinity) - EPS) {
        dist.set(a.toNode, nd);
        prevNode.set(a.toNode, u);
        prevEdge.set(a.toNode, a.edgeIdx);
      }
    }
  }

  // Enter the target edge at whichever endpoint is legally + cheaply reachable.
  const viaFrom = (dist.get(eT.raw.from) ?? Infinity) + target.sM;
  const viaTo = eT.raw.oneway
    ? Infinity
    : (dist.get(eT.raw.to) ?? Infinity) + (eT.totalLen - target.sM);
  if (!Number.isFinite(viaFrom) && !Number.isFinite(viaTo)) return null;
  const entry = viaFrom <= viaTo ? eT.raw.from : eT.raw.to;

  // Backtrack node chain to a seed.
  const chainNodes: string[] = [];
  const chainEdges: number[] = [];
  let node: string = entry;
  for (;;) {
    chainNodes.push(node);
    const pe = prevEdge.get(node);
    if (pe === undefined) return null; // defensive — entry was reachable, so a chain exists
    chainEdges.push(pe);
    const pn = prevNode.get(node);
    if (pn === null || pn === undefined) break;
    node = pn;
  }
  chainNodes.reverse();
  chainEdges.reverse();

  const raw: RawRoute = { points: [], jointIdx: [] };
  // 1. Start edge: from the snap point to the seeded endpoint.
  const seedNode = chainNodes[0];
  appendPiece(raw, slicePolyline(eS, start.sM, seedNode === eS.raw.to ? eS.totalLen : 0));
  // 2. Middle edges, oriented along traversal.
  for (let i = 1; i < chainNodes.length; i++) {
    const e = graph.edges[chainEdges[i]];
    raw.jointIdx.push(raw.points.length - 1);
    appendPiece(
      raw,
      e.raw.from === chainNodes[i - 1]
        ? slicePolyline(e, 0, e.totalLen)
        : slicePolyline(e, e.totalLen, 0),
    );
  }
  // 3. Target edge: from the entry node to the target snap point.
  raw.jointIdx.push(raw.points.length - 1);
  appendPiece(
    raw,
    entry === eT.raw.from ? slicePolyline(eT, 0, target.sM) : slicePolyline(eT, eT.totalLen, target.sM),
  );
  return raw.points.length >= 2 ? raw : null;
}

function dirAtTail(points: [number, number][]): [number, number] {
  for (let i = points.length - 1; i > 0; i--) {
    const dx = points[i][0] - points[i - 1][0];
    const dy = points[i][1] - points[i - 1][1];
    const len = Math.hypot(dx, dy);
    if (len > EPS) return [dx / len, dy / len];
  }
  return [0, 1];
}

/** Initial travel direction when leaving `node` along an edge. */
function outgoingDir(e: GraphEdge, node: string): [number, number] {
  const n = e.cum.length;
  const forward = e.raw.from === node;
  const dx = forward ? e.pts[2] - e.pts[0] : e.pts[(n - 2) * 2] - e.pts[(n - 1) * 2];
  const dy = forward ? e.pts[3] - e.pts[1] : e.pts[(n - 2) * 2 + 1] - e.pts[(n - 1) * 2 + 1];
  const len = Math.hypot(dx, dy);
  return len > 0 ? [dx / len, dy / len] : [0, 1];
}

function signedAngle(a: [number, number], b: [number, number]): number {
  return Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
}

/**
 * "Ahead" walk for target-less objectives (driveDistance / emergencyStop):
 * from the pose, follow the road and take the straightest legal continuation
 * at every node (no U-turns) until `meters` of route are assembled.
 */
function walkAheadRaw(
  graph: RouteGraph,
  start: RoadSnap,
  headingDeg: number,
  meters: number,
): RawRoute | null {
  let e = graph.edges[start.edgeIdx];
  const hx = Math.sin(headingDeg * DEG2RAD);
  const hy = Math.cos(headingDeg * DEG2RAD);
  const [tx, ty] = tangentOnEdge(e, start.sM);
  // Travel with the vehicle heading; oneway forces the legal direction.
  let forward = e.raw.oneway ? true : tx * hx + ty * hy >= 0;
  let sFrom = start.sM;
  let acc = 0;

  const raw: RawRoute = { points: [], jointIdx: [] };
  for (let hop = 0; hop < MAX_WALK_EDGES; hop++) {
    const sTo = forward ? e.totalLen : 0;
    if (hop > 0) raw.jointIdx.push(raw.points.length - 1);
    appendPiece(raw, slicePolyline(e, sFrom, sTo));
    acc += Math.abs(sTo - sFrom);
    if (acc >= meters) break;

    const node = forward ? e.raw.to : e.raw.from;
    const arcs = graph.adj.get(node);
    if (!arcs || arcs.length === 0) break; // dead end — the route just ends
    const inDir = dirAtTail(raw.points);
    let best: GraphArc | null = null;
    let bestAng = Infinity;
    for (const a of arcs) {
      if (a.edgeIdx === e.idx) continue; // never U-turn back onto the same edge
      const cand = graph.edges[a.edgeIdx];
      const ang = Math.abs(signedAngle(inDir, outgoingDir(cand, node)));
      if (ang < bestAng) {
        bestAng = ang;
        best = a;
      }
    }
    if (!best) break;
    e = graph.edges[best.edgeIdx];
    forward = e.raw.from === node;
    sFrom = forward ? 0 : e.totalLen;
  }
  return raw.points.length >= 2 ? raw : null;
}

// ---------------------------------------------------------------------------
// Finalization: turns → corner rounding → densify → smooth → arclengths
// ---------------------------------------------------------------------------

/** Average direction over ~`windowM` of polyline walking from `j` by `step`. */
function dirOverWindow(
  points: [number, number][],
  j: number,
  step: 1 | -1,
  windowM: number,
): [number, number] {
  let x = 0;
  let y = 0;
  let acc = 0;
  let i = j;
  while (acc < windowM && i + step >= 0 && i + step < points.length) {
    const dx = points[i + step][0] - points[i][0];
    const dy = points[i + step][1] - points[i][1];
    x += dx * step;
    y += dy * step;
    acc += Math.hypot(dx, dy);
    i += step;
  }
  const len = Math.hypot(x, y);
  return len > EPS ? [x / len, y / len] : [0, 1];
}

interface PendingTurn {
  x: number;
  y: number;
  side: "left" | "right";
  dirX: number;
  dirY: number;
}

function turnsFromRaw(raw: RawRoute): PendingTurn[] {
  const out: PendingTurn[] = [];
  for (const j of raw.jointIdx) {
    if (j <= 0 || j >= raw.points.length - 1) continue;
    const inDir = dirOverWindow(raw.points, j, -1, TURN_DIR_WINDOW_M);
    const outDir = dirOverWindow(raw.points, j, 1, TURN_DIR_WINDOW_M);
    const ang = signedAngle(inDir, outDir);
    if (Math.abs(ang) < TURN_MIN_RAD) continue;
    out.push({
      x: raw.points[j][0],
      y: raw.points[j][1],
      // x-east/y-north plane: positive (counter-clockwise) rotation = left turn.
      side: ang > 0 ? "left" : "right",
      dirX: outDir[0],
      dirY: outDir[1],
    });
  }
  return out;
}

/** Replace sharp vertices with a small quadratic-bezier arc (junction mouths
 * are 2.5×-scaled — a hard kink in the ribbon there reads broken). */
function roundCorners(points: [number, number][]): [number, number][] {
  if (points.length < 3) return points;
  const out: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const prev = out[out.length - 1];
    const next = points[i + 1];
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (inLen < EPS || outLen < EPS) continue;
    const inDir: [number, number] = [(p[0] - prev[0]) / inLen, (p[1] - prev[1]) / inLen];
    const outDir: [number, number] = [(next[0] - p[0]) / outLen, (next[1] - p[1]) / outLen];
    if (Math.abs(signedAngle(inDir, outDir)) < CORNER_MIN_RAD) {
      out.push(p);
      continue;
    }
    const cut = Math.min(CORNER_CUT_MAX_M, inLen * 0.5, outLen * 0.5);
    const a: [number, number] = [p[0] - inDir[0] * cut, p[1] - inDir[1] * cut];
    const b: [number, number] = [p[0] + outDir[0] * cut, p[1] + outDir[1] * cut];
    // Quadratic bezier a → b with control p.
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const mt = 1 - t;
      out.push([
        mt * mt * a[0] + 2 * mt * t * p[0] + t * t * b[0],
        mt * mt * a[1] + 2 * mt * t * p[1] + t * t * b[1],
      ]);
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

function finalizeRoute(raw: RawRoute): DerivedRoute | null {
  const pending = turnsFromRaw(raw);
  const rounded = roundCorners(raw.points);

  // Densify at a fixed step (capped by the preallocated ribbon capacity).
  const xs: number[] = [rounded[0][0]];
  const ys: number[] = [rounded[0][1]];
  let carried = 0;
  let total = 0;
  outer: for (let i = 1; i < rounded.length; i++) {
    let ax = rounded[i - 1][0];
    let ay = rounded[i - 1][1];
    const bx = rounded[i][0];
    const by = rounded[i][1];
    let segLen = Math.hypot(bx - ax, by - ay);
    while (carried + segLen >= DENSIFY_STEP_M) {
      const t = (DENSIFY_STEP_M - carried) / segLen;
      ax += (bx - ax) * t;
      ay += (by - ay) * t;
      segLen = Math.hypot(bx - ax, by - ay);
      carried = 0;
      total += DENSIFY_STEP_M;
      xs.push(ax);
      ys.push(ay);
      if (xs.length >= ROUTE_MAX_SAMPLES || total >= MAX_ROUTE_LEN_M) break outer;
    }
    carried += segLen;
  }
  if (carried > 0.5 && xs.length < ROUTE_MAX_SAMPLES) {
    xs.push(rounded[rounded.length - 1][0]);
    ys.push(rounded[rounded.length - 1][1]);
  }
  const count = xs.length;
  if (count < 2) return null;

  // One gentle 3-tap pass over interior samples (micro-kink polish).
  const sx = xs.slice();
  const sy = ys.slice();
  for (let i = 1; i < count - 1; i++) {
    sx[i] = xs[i - 1] * 0.25 + xs[i] * 0.5 + xs[i + 1] * 0.25;
    sy[i] = ys[i - 1] * 0.25 + ys[i] * 0.5 + ys[i + 1] * 0.25;
  }

  const pts = new Float32Array(count * 2);
  const arc = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pts[i * 2] = sx[i];
    pts[i * 2 + 1] = sy[i];
    if (i > 0) arc[i] = arc[i - 1] + Math.hypot(sx[i] - sx[i - 1], sy[i] - sy[i - 1]);
  }
  const totalLen = arc[count - 1];
  if (totalLen < MIN_ROUTE_LEN_M) return null;

  // Anchor each turn to the nearest surviving sample (drops turns lost to the
  // capacity truncation).
  const turns: RouteTurn[] = [];
  for (const t of pending) {
    let best = -1;
    let bestD2 = 20 * 20;
    for (let i = 0; i < count; i++) {
      const dx = pts[i * 2] - t.x;
      const dy = pts[i * 2 + 1] - t.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    if (best >= 0) {
      turns.push({ s: arc[best], x: t.x, y: t.y, side: t.side, dirX: t.dirX, dirY: t.dirY });
    }
  }
  turns.sort((a, b) => a.s - b.s);

  return { pts, arc, count, totalLen, turns };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Derive the guidance route for one objective. Called on objective change
 * only — never per frame.
 */
export function deriveGuidanceRoute(
  graph: RouteGraph,
  start: { x: number; y: number; headingDeg: number },
  goal: GuidanceGoal | null,
): DerivedRoute | null {
  if (!goal || graph.edges.length === 0) return null;
  const snap = snapToRoad(graph, start.x, start.y);
  if (!snap) return null;
  let raw: RawRoute | null;
  if (goal.kind === "ahead") {
    raw = walkAheadRaw(graph, snap, start.headingDeg, goal.meters);
  } else {
    const targetSnap = snapToRoad(graph, goal.x, goal.y);
    raw = targetSnap ? shortestPathRaw(graph, snap, targetSnap) : null;
  }
  if (!raw) return null;
  return finalizeRoute(raw);
}

// ---------------------------------------------------------------------------
// Per-frame helpers (allocation-free)
// ---------------------------------------------------------------------------

/** Arclength of the route sample nearest to (x, y) — the "head" the ribbon
 * fades around. Full scan over ≤1024 samples: trivial, zero allocation. */
export function nearestArcOnRoute(route: DerivedRoute, x: number, y: number): number {
  const { pts, count } = route;
  let best = 0;
  let bestD2 = Infinity;
  for (let i = 0; i < count; i++) {
    const dx = pts[i * 2] - x;
    const dy = pts[i * 2 + 1] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return route.arc[best];
}

/** Point at arclength `s` (clamped), written into `out` — zero allocation. */
export function routePointAt(
  route: DerivedRoute,
  s: number,
  out: { x: number; y: number },
): void {
  const { arc, pts, count } = route;
  const ss = Math.max(0, Math.min(route.totalLen, s));
  let lo = 0;
  let hi = count - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] <= ss) lo = mid;
    else hi = mid;
  }
  const span = arc[hi] - arc[lo];
  const t = span > 0 ? (ss - arc[lo]) / span : 0;
  out.x = pts[lo * 2] + t * (pts[hi * 2] - pts[lo * 2]);
  out.y = pts[lo * 2 + 1] + t * (pts[hi * 2 + 1] - pts[lo * 2 + 1]);
}
