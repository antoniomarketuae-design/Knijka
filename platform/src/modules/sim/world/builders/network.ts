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
  /** Sides with no pavement/street furniture (null = the full city section). */
  bareVerge: BareVergeSide | null;
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

/**
 * Sides of an edge whose verge is BARE: no pavement, no street furniture
 * (streetlights, roadside trees, billboards, bus shelters). "left"/"right" are
 * relative to the edge's travel direction (`right` = perpRight of from→to).
 *
 * Two real cross-sections need it, and the shipped class sets cannot express
 * either — they are per-CLASS, and both of these are per-SIDE facts about one
 * particular carriageway:
 *   - a DIVIDED street's median kerb (lc-gantry-v1's two one-way carriageways
 *     are the two halves of ONE boulevard): the median carries lamp columns
 *     for BOTH halves, not a pavement for each — and at any realistic
 *     carriageway pitch, per-edge sidewalks both sides put the pavement of one
 *     carriageway on the asphalt of the other, and its lamp columns in the
 *     other's travel lane;
 *   - a motorway връзка's grass verge (mw-entry-v1's on-ramp): a `_link` road
 *     is arterial-classed, so it grew a city pavement and lamp arm that swept
 *     across the carriageway it merges into.
 *
 * The curbside PARKING band is symmetric by construction (`ribbonCrossSection`
 * mirrors it about the centreline), so it stays a CLASS decision by default —
 * but a map may opt one edge in explicitly; see `edgeParkingBand` below.
 */
export type BareVergeSide = "left" | "right" | "both";

/** Read the (optional) bare-verge tag off a district edge. Absent ⇒ the full
 *  city cross-section, i.e. every existing map builds byte-identically. */
export function edgeBareVerge(edge: object): BareVergeSide | null {
  const v = (edge as { bareVerge?: unknown }).bareVerge;
  return v === "left" || v === "right" || v === "both" ? v : null;
}

/** True when `side` (+1 right of travel, −1 left) is a bare verge on `edge`. */
export function isBareVergeSide(bare: BareVergeSide | null, side: 1 | -1): boolean {
  if (bare === null) return false;
  if (bare === "both") return true;
  return bare === (side === 1 ? "right" : "left");
}

/**
 * Read the (optional) per-edge curbside-parking opt-in.
 *
 * WHY IT EXISTS — founder item FR-21, the car half. `PARKING_LANE_CLASSES` is
 * `{primary, secondary, tertiary}`, but `traffic/TrafficLayer.PARK_CLASSES` —
 * the set the procedural curb pass actually parks cars along — is that set
 * PLUS `{residential, living_street, unclassified}`. The two sets disagreeing
 * IS the defect: the pass seats every body at `travelHalf + 2.0 m`, which on a
 * class with no band is 2 m PAST the kerb, i.e. in the middle of the 3.5 m
 * pavement, at road level, sunk 0.12 m into the footway it stands on.
 *
 * Measured over the 100 committed districts (scratch census, this lane):
 * **2605 of 3799 bodies — 68.6% — stand fully on the footway, on 83 of the 100
 * districts** (2140 on `residential` edges, 465 on `unclassified`). His words,
 * three times over: „he goes trough a car which is standing on the sidewalk",
 * „passes like a ghost trough some car", and — the one that costs a lesson —
 * „I cant see the car coming on the right because of the cars that have
 * stopped on the side walk".
 *
 * WHY A TAG AND NOT A CLASS SET. Two cheaper-looking fixes were measured and
 * rejected before this one:
 *   - moving the bodies INTO the carriageway (flank against the kerb) puts
 *     **21 committed traces inside a body footprint**, three of them
 *     `shadow-correct` — the demonstrated-correct drive would drive through a
 *     parked car. The parking/manoeuvre drills legitimately use that strip;
 *   - adding `residential` to `PARKING_LANE_CLASSES` grows `edgeHalfWidth` by
 *     4 m on 83 districts, which moves every kerb, pavement, junction mouth and
 *     baked building footprint at once — a 100-district regeneration.
 *
 * The tag lets ONE map declare the band its own parked row already assumes.
 * The bodies do not move at all (the pass already seats them at the band's
 * centre line, `travelHalf + PARKING_LANE_WIDTH_M / 2`); the KERB moves out
 * from under them, and the frontage moves out with it. Absent ⇒ every existing
 * map builds byte-identically.
 */
export function edgeParkingBand(edge: object): boolean | null {
  const v = (edge as { parkingBand?: unknown }).parkingBand;
  return v === true || v === false ? v : null;
}

/** Parking band width per side of an edge (0 for non-arterial/roundabout).
 *  An explicit `parkingBand` OVERRIDES the class in both directions — a
 *  collector with no kerbside parking is as real as a residential street with
 *  it, and FR-21 needs both answers available to a map author. */
export function edgeParkingWidthM(edge: JunctionEdgeLike): number {
  if (edge.roundabout) return 0;
  const declared = edgeParkingBand(edge);
  if (declared !== null) return declared ? PARKING_LANE_WIDTH_M : 0;
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

/** Priority obligation a posted BG sign puts on one approach into a node. */
export type PriorityControl = "stopSign" | "giveWay";

/**
 * Structural view of one approach into a node — exactly what the priority rule
 * needs, so the world builder (which holds `Approach`) and the runtime (which
 * holds an edge index + the node id) can both feed it without sharing a type.
 */
export interface PriorityApproachLike {
  edgeId: string;
  /** OSM highway class of the approach edge; keys CLASS_RANK. */
  class: string;
  /** Traffic can travel TOWARD the node on this edge (i.e. a real approach). */
  incoming: boolean;
  /** The edge is part of a roundabout ring. */
  roundabout: boolean;
}

/**
 * Б1/Б2 priority control per approach at an UNSIGNALIZED node — the SINGLE
 * definition of who yields here, keyed by edge id.
 *
 * Audit C-4: this used to be two heuristics. The world builder painted the
 * VISIBLE sign with `maxRank >= 5 ? Б2 : Б1`, while the runtime's graded stop
 * line was hardcoded to Б2 at every minor×arterial meeting — so four approaches
 * on the shipped district (one of them traversed twice per lap by the practical
 * exam route) posted „Пропусни движението" and instant-failed the student for
 * not making the full stop the sign in front of them never demanded. A driving
 * product may be wrong about a junction; it may never be wrong in TWO
 * directions at once. Both consumers now read this function, so the painted
 * sign and the graded obligation cannot drift apart again
 * (runtime/__tests__/priority-sign-agreement.test.ts locks it per district).
 *
 * The rule itself is unchanged from the sign painter's:
 * - degree < 3 is a bend or a dead end, not a junction — nothing posted;
 * - a roundabout node yields on every non-ring approach (Б1 + Д11 entry);
 * - equal ranks = равнозначно кръстовище → priority to the right, no sign;
 * - otherwise the LOWEST-ranked approaches yield, and only an arterial worth a
 *   full stop (rank >= 5, i.e. primary) makes that a Б2 rather than a Б1.
 */
export function junctionPriorityControls(
  approaches: readonly PriorityApproachLike[],
): Map<string, PriorityControl> {
  const out = new Map<string, PriorityControl>();
  if (approaches.length < 3) return out;

  if (approaches.some((a) => a.roundabout)) {
    for (const a of approaches) {
      if (!a.roundabout && a.incoming) out.set(a.edgeId, "giveWay");
    }
    return out;
  }

  const ranks = approaches.map((a) => CLASS_RANK[a.class] ?? 2);
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  if (maxRank - minRank < 1) return out;
  const control: PriorityControl = maxRank >= 5 ? "stopSign" : "giveWay";
  for (let i = 0; i < approaches.length; i++) {
    const a = approaches[i]!;
    if (ranks[i] !== minRank || !a.incoming) continue;
    out.set(a.edgeId, control);
  }
  return out;
}

/**
 * Structural view of one arm at a node for the В1 rule — the same "feed it
 * without sharing a type" shape as PriorityApproachLike above.
 */
export interface OneWayApproachLike {
  edgeId: string;
  /** The arm is tagged one-way. */
  oneway: boolean;
  /** The arm is part of a roundabout ring. */
  roundabout: boolean;
  /** Traffic can travel TOWARD the node on this arm. */
  incoming: boolean;
  /** Traffic can leave the node via this arm. */
  outgoing: boolean;
}

/**
 * В1 „Забранено е влизането" per arm at a node — the SINGLE definition of
 * which mouths a driver may not enter, keyed by edge id.
 *
 * The junctionPriorityControls failure mode (audit C-4) one layer over: the
 * runtime already grades WRONG_WAY from the edge's `oneway` tag against the
 * driver's heading, but the world posted NOTHING at the forbidden mouth. On
 * ov-oneway-v1 that left the one-way street stated by lane arrows on the
 * approach and by nothing else — the founder's verdict-board note („there is
 * no signal showing that this is 1 way lane — only road marking; there are
 * specific signs stating entering forbidden"). Grading a driver against a
 * control the world never showed him is the same divergence as painting Б1
 * over a graded Б2 line, so both sides now read this one function.
 *
 * The rule: an arm you can only travel TOWARD the node on (incoming, never
 * outgoing) is a one-way street whose flow points back at you — entering it
 * from this node is движение в забранена посока, which is exactly what В1
 * forbids. Roundabout rings are excluded: every ring arm is one-way by
 * construction and its entries carry Б1 + Д11 (props.ts), never В1. Below
 * degree 3 there is no entry CHOICE to sign — that is a bend or a joint.
 */
export function onewayNoEntryArms(approaches: readonly OneWayApproachLike[]): Set<string> {
  const out = new Set<string>();
  if (approaches.length < 3) return out;
  if (approaches.some((a) => a.roundabout)) return out;
  for (const a of approaches) {
    if (a.oneway && a.incoming && !a.outgoing) out.add(a.edgeId);
  }
  return out;
}

/**
 * THE OTHER ILLEGAL MOUTH: the DOWNSTREAM END of a one-way edge that ends in a
 * terminal rather than in a junction.
 *
 * `onewayNoEntryArms` above answers „which arm of a JUNCTION may a driver not
 * turn into". It is silent on the commonest one-way shape in this catalog,
 * because most scenario micro-maps have no junction at all: a motorway
 * carriageway, a lane-drop merge, a roadworks shift, a gantry street. Measured
 * on 2026-07-31 by the world-referent gate: WRONG_WAY convicted on 19 scenarios
 * / 88 rungs with „В1 faces built = 0", and thirteen of those nineteen sit on
 * exactly this shape — a single one-way edge whose end nodes have degree < 3.
 * The rule engine grades the wrong-way movement on those maps
 * (runtime/worldRuntime WRONG_WAY_ANGLE_DEG against the edge's `oneway` tag),
 * so a student was failed for entering a street the world never forbade.
 *
 * The mouth is the edge's DOWNSTREAM terminal: the point a driver would enter
 * from if he came at it against the flow. The plate stands there facing BACK
 * along the flow, which is how a Bulgarian one-way street is actually signed —
 * a legal driver sees the back of the post as he leaves, and only a driver
 * pointed the wrong way ever reads the face.
 *
 * Excluded, and each for a reason the sign kit would otherwise falsify:
 *  - ROUNDABOUT rings. Every ring arm is one-way by construction and its
 *    entries carry Б1 + Г12; В1 at a ring mouth would state a different (and
 *    on an entry arm, false) prohibition.
 *  - JUNCTION ends (degree >= 3). Those are `onewayNoEntryArms`'s job, and
 *    posting both would put two В1 on one mouth.
 *  - MID-STREET JOINTS where the one-way continues. If the downstream node
 *    carries another OUTGOING one-way edge, the flow simply carries on and the
 *    „mouth" is a continuation, not an entry — the original degree-2 exclusion,
 *    kept intact.
 */
export function onewayTerminalNoEntryEdges(
  edges: readonly {
    id: string;
    oneway: boolean;
    roundabout: boolean;
    /** Node the edge's flow LEAVES from (geometry `from`). */
    upstreamNodeId: string;
    /** Node the edge's flow ENDS at (geometry `to`). */
    downstreamNodeId: string;
    downstreamDegree: number;
  }[],
): Set<string> {
  // Nodes a one-way flow CARRIES ON from — i.e. some one-way edge starts there.
  const flowLeaves = new Set<string>();
  for (const e of edges) {
    if (e.oneway && !e.roundabout) flowLeaves.add(e.upstreamNodeId);
  }
  const out = new Set<string>();
  for (const e of edges) {
    if (!e.oneway || e.roundabout) continue;
    if (e.downstreamDegree >= 3) continue; // the junction rule owns this mouth
    if (flowLeaves.has(e.downstreamNodeId)) continue; // a joint, not a mouth
    out.add(e.id);
  }
  return out;
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
      bareVerge: edgeBareVerge(edge),
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
