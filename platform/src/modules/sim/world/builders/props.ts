/**
 * Street prop placement (pure data — instancing transforms):
 * - Traffic-light poles at signalized junction approaches (lamp state is
 *   read at render time from WorldRuntime.signalPhase via a callback; this
 *   layer only decides WHERE lights stand and which node id they belong to).
 * - BG sign poles: Б2 stop / Б1 give-way at unsignalized minor approaches,
 *   Б1 + Д11 at roundabout entries, В26-50 at district entry roads, plus the
 *   hand-placed Б2 overrides mirrored from runtime STOP_LINE_OVERRIDES (QW4).
 * - Streetlights along arterials, alternating sides.
 * - Trees: along residential streets + park fill between blocks.
 *
 * All positions in world space; yaw points local +Z at the viewer the prop
 * addresses (approaching traffic).
 */

import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import type {
  District,
  SignKind,
  SignPlacement,
  StaticTransform,
  TrafficLightPlacement,
  TreePlacement,
} from "../types";
import {
  ARTERIAL_CLASSES,
  CLASS_RANK,
  PARK_TREE_GRID_M,
  ROAD_Y,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
  STREET_TREE_SPACING_M,
  STREETLIGHT_SPACING_M,
} from "./constants";
import {
  add,
  mul,
  mulberry32,
  perpRight,
  pointAlong,
  polylineLength,
  SegmentGrid,
  type Vec2,
} from "./math2d";
import { toWorld, yawFromFacing } from "./mesh";
import type { Approach, RoadNetwork } from "./network";

export interface PropBuildResult {
  trafficLights: TrafficLightPlacement[];
  signs: SignPlacement[];
  streetlights: StaticTransform[];
  trees: TreePlacement[];
  /** "<nodeId>:<edgeId>" keys of approaches that got a stop sign. */
  stopSignApproaches: Set<string>;
  /** Same for give-way signs. */
  giveWayApproaches: Set<string>;
}

/** Prop standing right of the incoming traffic at a junction approach. */
function approachPropPose(ap: Approach, alongExtra: number, lateralExtra: number) {
  const away = ap.cutTangentAway;
  const rightOfAway = perpRight(away);
  // Incoming traffic's right side = LEFT of the away direction.
  const p = add(
    add(ap.cut, mul(away, alongExtra)),
    mul(rightOfAway, -(ap.halfWidth + lateralExtra)),
  );
  // Face the incoming driver: normal points away from the junction.
  return { p, yaw: yawFromFacing(away) };
}

export function buildProps(
  district: District,
  network: RoadNetwork,
  buildingAabbs: [number, number, number, number][],
  options: { treeDensity: number; seed: number },
): PropBuildResult {
  const rng = mulberry32(options.seed);
  const trafficLights: TrafficLightPlacement[] = [];
  const signs: SignPlacement[] = [];
  const streetlights: StaticTransform[] = [];
  const trees: TreePlacement[] = [];
  const stopSignApproaches = new Set<string>();
  const giveWayApproaches = new Set<string>();

  // -- roundabout membership --------------------------------------------------
  const roundaboutNodes = new Set<string>();
  for (const rb of district.roundabouts) {
    for (const edgeId of rb.edgeIds) {
      const eb = network.edgeById.get(edgeId);
      if (eb) {
        roundaboutNodes.add(eb.edge.from);
        roundaboutNodes.add(eb.edge.to);
      }
    }
  }

  // -- traffic lights at signalized junctions ---------------------------------
  for (const node of network.nodes.values()) {
    if (!node.signalized || node.degree < 3) continue;
    let placed = 0;
    for (const ap of node.approaches) {
      if (!ap.incoming || placed >= 4) continue;
      const { p, yaw } = approachPropPose(ap, 1.0, 0.9);
      trafficLights.push({ nodeId: node.id, position: toWorld(p[0], p[1], ROAD_Y), yaw });
      placed++;
    }
  }

  // -- priority signs at unsignalized junctions -------------------------------
  for (const node of network.nodes.values()) {
    if (node.degree < 3 || node.signalized) continue;
    if (roundaboutNodes.has(node.id)) {
      // Roundabout entries: give way + mandatory roundabout sign (Д11 renders
      // higher on the shared pole — the component offsets by kind).
      for (const ap of node.approaches) {
        if (ap.edge.roundabout || !ap.incoming) continue;
        const { p, yaw } = approachPropPose(ap, 1.4, 0.8);
        signs.push({ kind: "giveWay", position: toWorld(p[0], p[1], ROAD_Y), yaw });
        signs.push({ kind: "roundabout", position: toWorld(p[0], p[1], ROAD_Y), yaw });
        giveWayApproaches.add(`${node.id}:${ap.edgeId}`);
      }
      continue;
    }
    const ranks = node.approaches.map((ap) => CLASS_RANK[ap.edge.class] ?? 2);
    const maxRank = Math.max(...ranks);
    const minRank = Math.min(...ranks);
    if (maxRank - minRank < 1) continue; // equal roads: priority-to-the-right
    for (let i = 0; i < node.approaches.length; i++) {
      const ap = node.approaches[i]!;
      if (ranks[i] !== minRank || !ap.incoming) continue;
      const kind: SignKind = maxRank >= 5 ? "stop" : "giveWay";
      const { p, yaw } = approachPropPose(ap, 1.4, 0.8);
      signs.push({ kind, position: toWorld(p[0], p[1], ROAD_Y), yaw });
      (kind === "stop" ? stopSignApproaches : giveWayApproaches).add(`${node.id}:${ap.edgeId}`);
    }
  }

  // -- hand-placed Б2 signs (QW4) ----------------------------------------------
  // Mirrors runtime STOP_LINE_OVERRIDES so every hard-placed graded stop line
  // has a visible Б2 sign here and a painted line in the markings pass (which
  // reads stopSignApproaches) — grading must never reference invisible control.
  for (const ov of STOP_LINE_OVERRIDES) {
    const key = `${ov.nodeId}:${ov.edgeId}`;
    if (stopSignApproaches.has(key)) continue;
    const info = network.nodes.get(ov.nodeId);
    const ap = info?.approaches.find((a) => a.edgeId === ov.edgeId);
    if (!ap || !ap.incoming) continue;
    const { p, yaw } = approachPropPose(ap, 1.4, 0.8);
    signs.push({ kind: "stop", position: toWorld(p[0], p[1], ROAD_Y), yaw });
    stopSignApproaches.add(key);
  }

  // -- speed limit 50 at district entries -------------------------------------
  const bounds = district.meta.boundsLocalMeters;
  const margin = 40;
  const nearBoundary = (p: Vec2) =>
    p[0] < bounds.minX + margin ||
    p[0] > bounds.maxX - margin ||
    p[1] < bounds.minY + margin ||
    p[1] > bounds.maxY - margin;
  const nodePos = new Map(district.roads.nodes.map((n) => [n.id, [n.x, n.y] as Vec2]));
  for (const nodeId of network.deadEnds) {
    const pos = nodePos.get(nodeId);
    if (!pos || !nearBoundary(pos)) continue;
    const info = network.nodes.get(nodeId);
    const ap = info?.approaches[0];
    if (!ap) continue;
    // Entering traffic flows AWAY from the boundary node; needs `outgoing`.
    if (ap.edge.oneway && ap.edge.to === nodeId) continue;
    if ((CLASS_RANK[ap.edge.class] ?? 2) < 2) continue; // skip service stubs
    const g = ap.edge.geometry as Vec2[];
    const len = polylineLength(g);
    const sFromNode = Math.min(14, len * 0.35);
    const s = ap.edge.from === nodeId ? sFromNode : len - sFromNode;
    const { point, tangent } = pointAlong(g, s);
    const travel = ap.edge.from === nodeId ? tangent : mul(tangent, -1); // into district
    const r = perpRight(travel);
    const p = add(point, mul(r, ap.halfWidth + 0.8));
    signs.push({
      kind: "limit50",
      position: toWorld(p[0], p[1], ROAD_Y),
      yaw: yawFromFacing(mul(travel, -1)),
    });
  }

  // -- streetlights along arterials --------------------------------------------
  for (const eb of network.edges) {
    if (!eb.line || !ARTERIAL_CLASSES.has(eb.edge.class)) continue;
    const total = polylineLength(eb.line);
    let side = 1;
    for (let s = STREETLIGHT_SPACING_M / 2; s < total; s += STREETLIGHT_SPACING_M) {
      const { point, tangent } = pointAlong(eb.line, s);
      const r = perpRight(tangent);
      const p = add(point, mul(r, side * (eb.halfWidth + SIDEWALK_WIDTH_M + 0.4)));
      // Arm reaches over the road: face toward the centerline.
      const facing = mul(r, -side);
      streetlights.push({
        position: toWorld(p[0], p[1], SIDEWALK_TOP_Y),
        yaw: yawFromFacing(facing),
      });
      side = -side;
    }
  }

  // -- trees --------------------------------------------------------------------
  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  const insideBuilding = (p: Vec2, pad: number) =>
    buildingAabbs.some(
      ([minX, minY, maxX, maxY]) =>
        p[0] > minX - pad && p[0] < maxX + pad && p[1] > minY - pad && p[1] < maxY + pad,
    );

  const pushTree = (p: Vec2) => {
    trees.push({
      position: toWorld(p[0], p[1], 0),
      yaw: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.5,
      variant: Math.floor(rng() * 3) as 0 | 1 | 2,
    });
  };

  // Street trees on residential-ish streets, outside the sidewalk.
  for (const eb of network.edges) {
    if (!eb.line) continue;
    const cls = eb.edge.class;
    if (cls !== "residential" && cls !== "unclassified" && cls !== "living_street") continue;
    const total = polylineLength(eb.line);
    for (let s = STREET_TREE_SPACING_M / 2; s < total; s += STREET_TREE_SPACING_M) {
      if (rng() > 0.75 * options.treeDensity) continue;
      const { point, tangent } = pointAlong(eb.line, s);
      const r = perpRight(tangent);
      const side = rng() < 0.5 ? 1 : -1;
      const p = add(point, mul(r, side * (eb.halfWidth + SIDEWALK_WIDTH_M + 1.6 + rng() * 1.5)));
      if (insideBuilding(p, 1.8)) continue;
      pushTree(p);
    }
  }

  // Park fill between blocks (jittered grid, away from roads and buildings).
  const step = PARK_TREE_GRID_M;
  for (let gx = bounds.minX; gx < bounds.maxX; gx += step) {
    for (let gy = bounds.minY; gy < bounds.maxY; gy += step) {
      if (rng() > 0.55 * options.treeDensity) continue;
      const p: Vec2 = [gx + rng() * step, gy + rng() * step];
      // Gate measures to the CENTERLINE: must exceed the widest scaled
      // carriageway half-width (~28 m) or park trees sprout on the asphalt.
      if (roadGrid.distanceTo(p, 31) < 30) continue;
      if (insideBuilding(p, 2.5)) continue;
      pushTree(p);
    }
  }

  return { trafficLights, signs, streetlights, trees, stopSignApproaches, giveWayApproaches };
}
