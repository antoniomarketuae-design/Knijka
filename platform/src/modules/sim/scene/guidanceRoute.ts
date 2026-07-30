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
 *
 * GUIDANCE GEOMETRY (doc 86 T3 / T8 / L5, 2026-07-30). Three rules the founder
 * review made non-negotiable, all of them enforced by guidance-geometry.test.ts:
 *
 *  1. A marker never stands past a stop line the same lesson grades. A
 *     `passSignal` objective is authored as the junction NODE (10 of the 11 in
 *     the catalog are literally `x: 0, y: 0`) and the graded cut is the derived
 *     stop line 27.7 m out on the approach — so the old marker told a beginner
 *     to stop 27.7 m INSIDE the box. The marker is now resolved against the
 *     runtime's own `debugStopLines()` — the same lines the rule engine
 *     convicts on — so the class of defect is unauthorable rather than fixed
 *     nine times.
 *  2. The marker states its own contract. It carries the objective's
 *     acceptance radius and its speed cap, and it says whether the student
 *     drives THROUGH it or STOPS on it. A ring drawn at a fixed 1.85 m over a
 *     radius-3.5 gate with a hidden ≤5 km/h cap is why „стоях точно на кръга и
 *     нищо не стана" was never a tolerance problem.
 *  3. Guidance looks AHEAD. The ribbon and its turn chevrons run through the
 *     active waypoint into objective n+1, so „надясно на следващото
 *     кръстовище" is announced before the junction — not after the nose has
 *     already committed and TURN_WITHOUT_INDICATOR has been billed.
 */

import { parseObjectiveParams, type LessonSpec } from "@/modules/sim/lessons";
import { LANE_WIDTH_M, createWorldRuntime } from "@/modules/sim/runtime";
import { DistrictIndex } from "@/modules/sim/runtime/spatial";

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

/**
 * Setback of a STOP bar from the graded line: the exam phrasing is «спри на
 * 1–2 метра ПРЕДИ стоп-линията» (templates-junctions.ts:331), and
 * `stopOvershootCenterM` is 1.2 m, so a car whose centre rests on the bar has
 * its nose at the paint and its centre inside tolerance.
 */
export const STOP_BAR_BEFORE_LINE_M = 2;
/**
 * Setback of a THROUGH gate. It reads as standing ON the line while its centre
 * stays on the lawful side of it — the invariant guidance-geometry.test.ts
 * asserts for every marker in the catalog.
 */
export const THROUGH_GATE_BEFORE_LINE_M = 0.8;
/** Half-width of a stop-line gate bar: one lane of the perceptual carriageway. */
export const GATE_HALF_WIDTH_M = LANE_WIDTH_M / 2;
/**
 * A derived stop line is anchored on the edge's CENTRELINE. The bar belongs in
 * the lane the student is actually in, so it is slid sideways by the driver's
 * own measured offset — bounded here so a car parked off the carriageway (or
 * one still behind a bend) cannot fling the marker off the road.
 */
export const GATE_LATERAL_MAX_M = LANE_WIDTH_M * 0.75;
/**
 * A `reachZone` cap at or below this reads as „спри", not „намали" — the halt
 * objectives in the catalog author 5 or 6 km/h (doc 86 B5).
 */
export const HALT_CAP_KMH = 6;
/** Hard cap on the look-ahead leg appended for objective n+1. */
export const LOOKAHEAD_MAX_M = 170;

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

/**
 * A graded stop line flattened into the plane guidance reasons in. Built from
 * `worldRuntime.debugStopLines()` — the SAME lines `rules/engine.ts` convicts
 * `STOP_LINE_OVERSHOOT` / `RED_LIGHT_CROSSED` on, never a second derivation.
 */
export interface GuidanceStopLine {
  id: string;
  /** Where the line crosses the carriageway, district meters. */
  x: number;
  y: number;
  /** Unit direction of TRAVEL across the line (approach → junction). */
  dirX: number;
  dirY: number;
  control: "trafficLight" | "stopSign" | "giveWay";
  junctionNodeId: string;
  edgeId: string;
}

/** Does the student drive THROUGH this marker, or come to rest ON it? */
export type MarkerAffordance = "through" | "halt";

/**
 * The marker's footprint on the ground.
 *  - `zone`: the objective's acceptance CIRCLE. `radiusM` is the engine's own
 *    `radiusM`, so what the student sees is what the gate tests.
 *  - `gate`: a bar across the lane at a stop line. A `passSignal`'s `radiusM`
 *    is a 40–50 m PROXIMITY radius (how near the node a `stopLineCrossed`
 *    event still counts), not a target — drawing it as a ring would be a
 *    second lie on top of the one T3 fixed.
 */
export type MarkerShape =
  | { kind: "zone"; radiusM: number }
  | { kind: "gate"; halfWidthM: number; dirX: number; dirY: number };

/** What the active objective asks the guidance layer to show. */
export interface GuidancePointGoal {
  kind: "point";
  x: number;
  y: number;
  marker: boolean;
  affordance: MarkerAffordance;
  shape: MarkerShape;
  /** The radius the ENGINE tests — always the objective's own `radiusM`. */
  acceptRadiusM: number;
  /** The objective's hidden speed contract, km/h. Undefined = uncapped. */
  maxSpeedKmh?: number;
  /** Instructor-voice line rendered at the marker (never a bare verdict). */
  labelBg: string;
  /** The stop line this marker was resolved against, when it was one. */
  stopLineId?: string;
}

export type GuidanceGoal = GuidancePointGoal | { kind: "ahead"; meters: number };

/** All path derivation needs — the marker vocabulary is irrelevant to routing. */
export type RouteTarget =
  | { kind: "point"; x: number; y: number }
  | { kind: "ahead"; meters: number };

/**
 * World knowledge the goal resolver may use. Absent = the pure-data reading of
 * the spec (what the AUTHOR wrote); present = the corrected marker (what the
 * student must actually see). Both are meaningful: `world/referents.ts` calls
 * the two-argument form deliberately, because its T3 census counts authored
 * anchors, not rendered markers.
 */
export interface GuidanceContext {
  stopLines?: readonly GuidanceStopLine[];
  /** The driver's pose — picks WHICH arm's stop line the marker belongs to. */
  from?: { x: number; y: number };
}

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
  /**
   * Arclength at which the ACTIVE objective's marker sits. Equals `totalLen`
   * when no look-ahead leg was appended; everything past it is objective n+1's
   * leg, which the ribbon draws dimmer (doc 86 L5 — the turn must be visible
   * BEFORE the current waypoint, but it is not yet the task).
   */
  goalS: number;
}

// ---------------------------------------------------------------------------
// Goal resolution (reads lesson specs; additive-only contract respected)
// ---------------------------------------------------------------------------

/**
 * Which graded stop line does this `passSignal` objective mean? The objective
 * names its junction node and the control it grades; the world derives one
 * line per APPROACH into that node. The driver's own pose picks the arm — and
 * a line the driver has already crossed is heavily penalised, never chosen
 * over one still ahead, so a re-derivation mid-junction (a `requireRedMet`
 * objective still open after the crossing) does not jump the marker to the
 * opposite arm.
 */
function approachStopLine(
  ctx: GuidanceContext | undefined,
  nodeId: string,
  control: "trafficLight" | "stopSign",
): GuidanceStopLine | null {
  const lines = ctx?.stopLines;
  if (!lines || lines.length === 0) return null;
  const atNode = lines.filter((l) => l.junctionNodeId === nodeId);
  // Exact control first. A Б1 „Пропусни движението" line is accepted for a
  // stopSign objective only as a last resort: the paint the student can SEE
  // beats a marker floating at the node, even though `stepPassSignal` then
  // never fires (that is a template defect, and Lane 9's to fix, not ours).
  let pool = atNode.filter((l) => l.control === control);
  if (pool.length === 0 && control === "stopSign") {
    pool = atNode.filter((l) => l.control === "giveWay");
  }
  if (pool.length === 0) return null;
  const from = ctx?.from;
  if (!from) return pool[0]!;
  let best: GuidanceStopLine | null = null;
  let bestScore = Infinity;
  for (const l of pool) {
    const dx = from.x - l.x;
    const dy = from.y - l.y;
    // > 0 ⇒ the driver is already PAST this line (travelling across it).
    const past = dx * l.dirX + dy * l.dirY > 0;
    const score = Math.hypot(dx, dy) + (past ? 1e4 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = l;
    }
  }
  return best;
}

/** Ring radii the renderer draws for a zone marker: the OUTER radius is the
 *  objective's acceptance radius, exactly. Null for a stop-line gate, which is
 *  a bar across the lane and has no acceptance circle to draw. */
export function markerRingRadii(goal: GuidancePointGoal): { innerM: number; outerM: number } | null {
  if (goal.shape.kind !== "zone") return null;
  const outerM = goal.shape.radiusM;
  const band = Math.min(1.25, Math.max(0.35, outerM * 0.14));
  return { innerM: Math.max(0.05, outerM - band), outerM };
}

export function guidanceGoalFor(
  lesson: LessonSpec,
  objectiveIndex: number,
  ctx?: GuidanceContext,
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
    case "reachZone": {
      const halt = params.maxSpeedKmh !== undefined && params.maxSpeedKmh <= HALT_CAP_KMH;
      const goal: GuidancePointGoal = {
        kind: "point",
        x: params.x,
        y: params.y,
        marker: true,
        affordance: halt ? "halt" : "through",
        shape: { kind: "zone", radiusM: params.radiusM },
        acceptRadiusM: params.radiusM,
        labelBg: halt ? "Спри тук" : "Карай дотук",
      };
      if (params.maxSpeedKmh !== undefined) goal.maxSpeedKmh = params.maxSpeedKmh;
      return goal;
    }
    case "passSignal": {
      const halt = params.control === "stopSign";
      const line = approachStopLine(ctx, params.nodeId, params.control);
      if (line) {
        const back = halt ? STOP_BAR_BEFORE_LINE_M : THROUGH_GATE_BEFORE_LINE_M;
        // Slide the bar into the driver's own lane: the line is anchored on
        // the edge centreline, and a «спри тук» bar straddling the осева would
        // be its own small lie.
        const lat = ctx?.from
          ? clamp(
              (ctx.from.x - line.x) * -line.dirY + (ctx.from.y - line.y) * line.dirX,
              -GATE_LATERAL_MAX_M,
              GATE_LATERAL_MAX_M,
            )
          : 0;
        return {
          kind: "point",
          x: line.x - line.dirX * back - line.dirY * lat,
          y: line.y - line.dirY * back + line.dirX * lat,
          marker: true,
          affordance: halt ? "halt" : "through",
          shape: { kind: "gate", halfWidthM: GATE_HALF_WIDTH_M, dirX: line.dirX, dirY: line.dirY },
          acceptRadiusM: params.radiusM,
          labelBg: halt ? "Спри на стоп-линията" : "Премини на зелено",
          stopLineId: line.id,
        };
      }
      // No world context, or no graded line at the named node. The authored
      // anchor is all there is — and its acceptance radius is drawn honestly,
      // so a 45 m ring at a junction centre reads as the data defect it is.
      return {
        kind: "point",
        x: params.x,
        y: params.y,
        marker: true,
        affordance: halt ? "halt" : "through",
        shape: { kind: "zone", radiusM: params.radiusM },
        acceptRadiusM: params.radiusM,
        labelBg: halt ? "Спри на стоп-линията" : "Премини на зелено",
      };
    }
    case "driveDistance":
      return { kind: "ahead", meters: params.meters + AHEAD_BUFFER_M };
    case "completeManeuver":
      switch (params.maneuver) {
        case "roundabout":
          // Ribbon to the ring; no pillar — any exit completes the maneuver.
          return {
            kind: "point",
            x: params.x,
            y: params.y,
            marker: false,
            affordance: "through",
            shape: { kind: "zone", radiusM: params.enterRadiusM },
            acceptRadiusM: params.enterRadiusM,
            labelBg: "Влез в кръговото",
          };
        case "parkInBay":
          return lesson.parkingBay
            ? {
                kind: "point",
                x: lesson.parkingBay.x,
                y: lesson.parkingBay.y,
                marker: true,
                affordance: "halt",
                // The gate is „centre within centerTolM of the bay centre" —
                // that circle, not the painted rect, is what completes.
                shape: { kind: "zone", radiusM: params.centerTolM },
                acceptRadiusM: params.centerTolM,
                labelBg: "Паркирай тук",
              }
            : null;
        case "emergencyStop":
          return { kind: "ahead", meters: EMERGENCY_AHEAD_M };
        case "smoothStop":
          return null;
        case "threePointTurn": {
          // The corridor is a RECT; the ring is its inscribed circle, so a car
          // on the ring is always inside the box the evaluator tests.
          const r = Math.min(params.corridor.halfWidthM, params.corridor.halfLengthM);
          return {
            kind: "point",
            x: params.corridor.x,
            y: params.corridor.y,
            marker: true,
            affordance: "halt",
            shape: { kind: "zone", radiusM: r },
            acceptRadiusM: r,
            labelBg: "Обърни тук",
          };
        }
      }
  }
}

// ---------------------------------------------------------------------------
// Graded stop lines for a district (the runtime's own, never a second
// derivation — see the header note on T3)
// ---------------------------------------------------------------------------

const stopLineCache = new WeakMap<object, readonly GuidanceStopLine[]>();

/**
 * Flatten `worldRuntime.debugStopLines()` for the guidance layer. Memoized per
 * district OBJECT, so a scene mount pays it once. A district the runtime
 * refuses to parse (the synthetic fixtures in the unit tests, a partial
 * document) yields an empty list and guidance falls back to authored anchors —
 * it degrades, it never throws inside a render.
 */
export function stopLinesForGuidance(district: unknown): readonly GuidanceStopLine[] {
  if (typeof district !== "object" || district === null) return [];
  const hit = stopLineCache.get(district);
  if (hit) return hit;
  let out: GuidanceStopLine[] = [];
  try {
    const runtime = createWorldRuntime(district);
    const index = new DistrictIndex(runtime.district);
    out = runtime.debugStopLines().map((l) => {
      const [x, y] = index.pointAt(l.edgeIdx, l.sM);
      const [tx, ty] = index.tangentAt(l.edgeIdx, l.sM);
      return {
        id: l.id,
        x,
        y,
        dirX: tx * l.dirSign,
        dirY: ty * l.dirSign,
        control: l.control,
        junctionNodeId: l.junctionNodeId,
        edgeId: index.edges[l.edgeIdx]!.edge.id,
      };
    });
  } catch {
    out = [];
  }
  stopLineCache.set(district, out);
  return out;
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

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
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
 * are 2.5×-scaled — a hard kink in the ribbon there reads broken).
 * `keepIdx` (the active waypoint, when a look-ahead leg is appended) is
 * tracked through the rewrite so `goalS` stays exact instead of estimated. */
function roundCorners(
  points: [number, number][],
  keepIdx: number,
): { points: [number, number][]; keptAt: number } {
  if (points.length < 3) return { points, keptAt: Math.min(keepIdx, points.length - 1) };
  const out: [number, number][] = [points[0]];
  let keptAt = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i];
    const prev = out[out.length - 1];
    const next = points[i + 1];
    const inLen = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    const outLen = Math.hypot(next[0] - p[0], next[1] - p[1]);
    if (inLen < EPS || outLen < EPS) {
      if (i === keepIdx) keptAt = out.length - 1;
      continue;
    }
    const inDir: [number, number] = [(p[0] - prev[0]) / inLen, (p[1] - prev[1]) / inLen];
    const outDir: [number, number] = [(next[0] - p[0]) / outLen, (next[1] - p[1]) / outLen];
    if (Math.abs(signedAngle(inDir, outDir)) < CORNER_MIN_RAD) {
      out.push(p);
      if (i === keepIdx) keptAt = out.length - 1;
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
      // The apex sample stands in for the vertex the bezier replaced.
      if (i === keepIdx && k === 3) keptAt = out.length - 1;
    }
  }
  out.push(points[points.length - 1]);
  if (keepIdx >= points.length - 1) keptAt = out.length - 1;
  return { points: out, keptAt };
}

/** Cut a raw route at `maxM` of arclength (the look-ahead leg never runs to
 *  the horizon — the chevron horizon is 140 m). */
function trimRawTo(raw: RawRoute, maxM: number): RawRoute {
  if (maxM <= 0) return { points: [], jointIdx: [] };
  const points: [number, number][] = [];
  let acc = 0;
  for (let i = 0; i < raw.points.length; i++) {
    if (i === 0) {
      points.push(raw.points[0]);
      continue;
    }
    const seg = Math.hypot(
      raw.points[i][0] - raw.points[i - 1][0],
      raw.points[i][1] - raw.points[i - 1][1],
    );
    if (acc + seg >= maxM) {
      const t = seg > EPS ? (maxM - acc) / seg : 0;
      points.push([
        raw.points[i - 1][0] + (raw.points[i][0] - raw.points[i - 1][0]) * t,
        raw.points[i - 1][1] + (raw.points[i][1] - raw.points[i - 1][1]) * t,
      ]);
      acc = maxM;
      break;
    }
    acc += seg;
    points.push(raw.points[i]);
  }
  const cut = points.length - 1;
  return { points, jointIdx: raw.jointIdx.filter((j) => j < cut) };
}

/** Append the look-ahead leg. Returns the joined route and the index of the
 *  ACTIVE objective's marker inside it. */
function concatRaw(a: RawRoute, b: RawRoute): { raw: RawRoute; splitIdx: number } {
  const points = a.points.slice();
  const jointIdx = a.jointIdx.slice();
  const splitIdx = points.length - 1;
  const last = points[splitIdx];
  let startAt = 0;
  if (
    last &&
    b.points.length > 0 &&
    Math.abs(last[0] - b.points[0][0]) < EPS &&
    Math.abs(last[1] - b.points[0][1]) < EPS
  ) {
    startAt = 1;
  }
  const shift = points.length - startAt;
  for (let i = startAt; i < b.points.length; i++) points.push(b.points[i]);
  for (const j of b.jointIdx) {
    const nj = j + shift;
    if (nj > splitIdx && nj < points.length - 1) jointIdx.push(nj);
  }
  jointIdx.sort((p, q) => p - q);
  return { raw: { points, jointIdx }, splitIdx };
}

function finalizeRoute(raw: RawRoute, splitIdx?: number): DerivedRoute | null {
  const pending = turnsFromRaw(raw);
  const keepIdx = splitIdx ?? raw.points.length - 1;
  const { points: rounded, keptAt } = roundCorners(raw.points, keepIdx);
  // Arclength of the ACTIVE waypoint along the rounded polyline — the frame
  // densify measures in, so `goalS` lands on a real sample rather than an
  // estimate. (Everything past it is objective n+1's look-ahead leg.)
  let roundedSplitLen = 0;
  for (let i = 1; i <= Math.min(keptAt, rounded.length - 1); i++) {
    roundedSplitLen += Math.hypot(
      rounded[i][0] - rounded[i - 1][0],
      rounded[i][1] - rounded[i - 1][1],
    );
  }

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

  // Samples sit every DENSIFY_STEP_M of ROUNDED arclength, so the waypoint's
  // rounded arclength indexes straight into the final (smoothed) arc array.
  const splitSample = Math.max(
    0,
    Math.min(count - 1, Math.round(roundedSplitLen / DENSIFY_STEP_M)),
  );
  const goalS = splitIdx === undefined ? totalLen : arc[splitSample];

  return { pts, arc, count, totalLen, turns, goalS };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface DeriveRouteOptions {
  /**
   * Objective n+1's target. The ribbon and its turn chevrons run THROUGH the
   * active waypoint into it, so the turn at the junction is announced while
   * the student is still approaching — doc 86 L5, the founder's item 9
   * („зелената линия става надясно чак след като пресека маркировката").
   * Null / absent = the old behaviour, route ends at the active waypoint.
   */
  lookahead?: RouteTarget | null;
  /** Hard cap on the appended leg, meters (default LOOKAHEAD_MAX_M). */
  lookaheadMaxM?: number;
}

/**
 * Derive the guidance route for one objective. Called on objective change
 * only — never per frame.
 */
export function deriveGuidanceRoute(
  graph: RouteGraph,
  start: { x: number; y: number; headingDeg: number },
  goal: RouteTarget | null,
  opts?: DeriveRouteOptions,
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

  // Look-ahead leg: only for point goals (an "ahead" walk has no waypoint to
  // continue FROM), and only when it actually adds road.
  const next = opts?.lookahead;
  if (goal.kind === "point" && next && next.kind === "point") {
    const fromSnap = snapToRoad(graph, goal.x, goal.y);
    const toSnap = snapToRoad(graph, next.x, next.y);
    const cont =
      fromSnap && toSnap && !(fromSnap.edgeIdx === toSnap.edgeIdx && Math.abs(fromSnap.sM - toSnap.sM) < 1)
        ? shortestPathRaw(graph, fromSnap, toSnap)
        : null;
    if (cont) {
      const trimmed = trimRawTo(cont, opts?.lookaheadMaxM ?? LOOKAHEAD_MAX_M);
      if (trimmed.points.length >= 2) {
        const joined = concatRaw(raw, trimmed);
        return finalizeRoute(joined.raw, joined.splitIdx);
      }
    }
  }
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
