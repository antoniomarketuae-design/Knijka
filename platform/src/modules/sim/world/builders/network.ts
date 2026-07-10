/**
 * Network analysis — turns district roads (graph + polylines) into the
 * intermediate structure every other builder consumes: per-edge widths and
 * junction-trimmed polylines, and per-node approach lists with exact
 * cut cross-sections (so junction patches share vertices with ribbons).
 */

import type { District, DistrictEdge } from "../types";
import {
  CLASS_RANK,
  JOINT_SETBACK_M,
  junctionCornerRadiusM,
  LANE_WIDTH_M,
  PARKING_LANE_CLASSES,
  PARKING_LANE_WIDTH_M,
} from "./constants";
import {
  add,
  dist,
  mul,
  norm,
  perpRight,
  pointAlong,
  polylineLength,
  sub,
  trimPolyline,
  type Vec2,
} from "./math2d";

export interface Approach {
  edgeId: string;
  edge: DistrictEdge;
  /** Unit direction pointing AWAY from the node along the edge. */
  dir: Vec2;
  halfWidth: number;
  /** Parking band width inside halfWidth (0 on non-arterial edges). */
  parkingM: number;
  /** Trim distance from the node along this edge. */
  setback: number;
  /** Cross-section at the cut: point on centerline + left/right extremes. */
  cut: Vec2;
  cutTangentAway: Vec2;
  left: Vec2;
  right: Vec2;
  /** Traffic can travel TOWARD the node on this edge. */
  incoming: boolean;
  /** Traffic can leave the node via this edge. */
  outgoing: boolean;
}

export interface NodeInfo {
  id: string;
  pos: Vec2;
  degree: number;
  signalized: boolean;
  approaches: Approach[];
  /** Open-area radius used for the junction patch. */
  radius: number;
}

export interface EdgeBuild {
  edge: DistrictEdge;
  halfWidth: number;
  /** Parking band width inside halfWidth on each side (0 = no band). */
  parkingM: number;
  /** Junction-trimmed centerline (null when the whole edge is junction area). */
  line: Vec2[] | null;
  trimFrom: number;
  trimTo: number;
}

export interface RoadNetwork {
  nodes: Map<string, NodeInfo>;
  edges: EdgeBuild[];
  edgeById: Map<string, EdgeBuild>;
  /** Node ids that appear as endpoints of exactly one edge. */
  deadEnds: Set<string>;
  roundaboutEdgeIds: Set<string>;
}

/**
 * Structural subset of an edge that the width/junction math needs. Kept
 * structural so the runtime (runtime/district) and traffic (traffic/types)
 * edge types can reuse EXACTLY this math — grading, NPC stop points and the
 * drawn world must agree on where a junction mouth is (perceptual road
 * scale: detectors misfire if they disagree).
 */
export interface JunctionEdgeLike {
  class: string;
  lanes: number;
  roundabout: boolean;
}

/** Parking band width per side of an edge (0 for non-arterial/roundabout). */
export function edgeParkingWidthM(edge: JunctionEdgeLike): number {
  if (edge.roundabout) return 0;
  return PARKING_LANE_CLASSES.has(edge.class) ? PARKING_LANE_WIDTH_M : 0;
}

/** Travel-lane half width (lanes × LANE_WIDTH_M / 2) — the graded carriageway. */
export function edgeTravelHalfWidth(edge: JunctionEdgeLike): number {
  const lanes = Math.max(1, edge.lanes);
  let half = (lanes * LANE_WIDTH_M) / 2;
  // Single-lane roundabout rings read too thin — BG ring lanes are wide.
  if (edge.roundabout) half = Math.max(half, 2.4);
  return half;
}

/**
 * Full curb-to-curb half width: travel lanes + the curbside parking band on
 * arterial classes (doc 68 QW3). Everything derived from it — ribbons,
 * junction patches, sidewalks, colliders, prop lateral offsets — shifts out
 * consistently; markings use the travel width via EdgeBuild/Approach.parkingM.
 */
export function edgeHalfWidth(edge: JunctionEdgeLike): number {
  return edgeTravelHalfWidth(edge) + edgeParkingWidthM(edge);
}

/** Junction trim never eats more than this fraction of an edge's length. */
export const JUNCTION_TRIM_MAX_FRACTION = 0.45;
/** Stop lines (painted AND graded) sit this far outside the junction cut. */
export const STOP_LINE_BEYOND_CUT_M = 0.6;

/**
 * Open-area radius of a node — how far the junction patch reaches along each
 * incident edge (before the per-edge JUNCTION_TRIM_MAX_FRACTION clamp).
 * SHARED source of truth: analyzeNetwork (ribbons/patches), runtime
 * stop-line derivation and the traffic system's junction stop offsets all
 * call this, so the graded line, the painted line and NPC stop points agree.
 */
export function nodeOpenRadiusM(touched: readonly JunctionEdgeLike[], degree: number): number {
  if (degree <= 1 || touched.length === 0) return 0;
  const maxHalf = Math.max(...touched.map(edgeHalfWidth));
  if (degree >= 3) {
    const maxRank = Math.max(...touched.map((e) => CLASS_RANK[e.class] ?? 2));
    return maxHalf + junctionCornerRadiusM(maxRank);
  }
  return Math.max(JOINT_SETBACK_M, maxHalf * 0.25);
}

/** Direction pointing away from `nodeId` along the edge geometry. */
function dirAwayFromNode(edge: DistrictEdge, nodeId: string): Vec2 {
  const g = edge.geometry;
  const first = g[0] as Vec2;
  const second = g[1] as Vec2;
  const last = g[g.length - 1] as Vec2;
  const beforeLast = g[g.length - 2] as Vec2;
  return edge.from === nodeId ? norm(sub(second, first)) : norm(sub(beforeLast, last));
}

export function analyzeNetwork(
  district: District,
  junctionRadiusOverrides?: Record<string, number>,
): RoadNetwork {
  const { nodes, edges } = district.roads;
  const nodePos = new Map<string, Vec2>(nodes.map((n) => [n.id, [n.x, n.y] as Vec2]));
  const signalizedIds = new Set(
    district.intersections.filter((i) => i.signalized).map((i) => i.id),
  );

  // Node degree from edge endpoints (intersections[] only lists degree >= 3).
  const touching = new Map<string, DistrictEdge[]>();
  for (const e of edges) {
    for (const id of [e.from, e.to]) {
      let bucket = touching.get(id);
      if (!bucket) touching.set(id, (bucket = []));
      bucket.push(e);
    }
  }

  const roundaboutEdgeIds = new Set<string>();
  for (const rb of district.roundabouts) for (const id of rb.edgeIds) roundaboutEdgeIds.add(id);

  // -- per-node open radius --------------------------------------------------
  const nodeInfos = new Map<string, NodeInfo>();
  const deadEnds = new Set<string>();
  for (const [id, touched] of touching) {
    const pos = nodePos.get(id);
    if (!pos) continue;
    const degree = touched.length;
    if (degree === 1) deadEnds.add(id);
    let radius = nodeOpenRadiusM(touched, degree);
    const override = junctionRadiusOverrides?.[id];
    if (override !== undefined) radius = override;
    nodeInfos.set(id, {
      id,
      pos,
      degree,
      signalized: signalizedIds.has(id),
      approaches: [],
      radius,
    });
  }

  // -- per-edge trim + cross-sections ---------------------------------------
  const edgeBuilds: EdgeBuild[] = [];
  const edgeById = new Map<string, EdgeBuild>();

  for (const edge of edges) {
    const g = edge.geometry as Vec2[];
    if (g.length < 2) continue;
    const total = polylineLength(g);
    const fromInfo = nodeInfos.get(edge.from);
    const toInfo = nodeInfos.get(edge.to);
    let sFrom = Math.min(fromInfo?.radius ?? 0, total * JUNCTION_TRIM_MAX_FRACTION);
    let sTo = Math.min(toInfo?.radius ?? 0, total * JUNCTION_TRIM_MAX_FRACTION);

    let line = trimPolyline(g, sFrom, sTo, 0.5);
    if (!line) {
      // Whole edge swallowed by its junctions: cut at midpoint so both
      // patches meet at a shared cross-section and the ribbon is skipped.
      sFrom = total / 2;
      sTo = total / 2;
      line = null;
    }

    const build: EdgeBuild = {
      edge,
      halfWidth: edgeHalfWidth(edge),
      parkingM: edgeParkingWidthM(edge),
      line,
      trimFrom: sFrom,
      trimTo: sTo,
    };
    edgeBuilds.push(build);
    edgeById.set(edge.id, build);

    // Cross-sections at both cuts (from the ORIGINAL geometry, so patches and
    // ribbons share exact endpoints).
    const registerApproach = (nodeId: string, atStart: boolean) => {
      const info = nodeInfos.get(nodeId);
      if (!info) return;
      const s = atStart ? sFrom : total - sTo;
      const { point, tangent } = pointAlong(g, s);
      // tangent points from `from` toward `to`; away-from-node direction:
      const away = atStart ? tangent : mul(tangent, -1);
      const rightOfAway = perpRight(away);
      const hw = build.halfWidth;
      const incoming = !edge.oneway || edge.to === nodeId;
      const outgoing = !edge.oneway || edge.from === nodeId;
      info.approaches.push({
        edgeId: edge.id,
        edge,
        dir: dirAwayFromNode(edge, nodeId),
        halfWidth: hw,
        parkingM: build.parkingM,
        setback: atStart ? sFrom : sTo,
        cut: point,
        cutTangentAway: away,
        left: add(point, mul(rightOfAway, -hw)),
        right: add(point, mul(rightOfAway, hw)),
        incoming,
        outgoing,
      });
    };
    registerApproach(edge.from, true);
    registerApproach(edge.to, false);
  }

  // Sort approaches CCW so junction patch polygons come out ordered.
  for (const info of nodeInfos.values()) {
    info.approaches.sort(
      (a, b) =>
        Math.atan2(a.cutTangentAway[1], a.cutTangentAway[0]) -
        Math.atan2(b.cutTangentAway[1], b.cutTangentAway[0]),
    );
    // Guard against zero-length dirs on degenerate edges.
    info.approaches = info.approaches.filter((ap) => dist(ap.left, ap.right) > 1e-6);
  }

  return { nodes: nodeInfos, edges: edgeBuilds, edgeById, deadEnds, roundaboutEdgeIds };
}
