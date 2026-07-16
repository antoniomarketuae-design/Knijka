/**
 * Street prop placement (pure data — instancing transforms):
 * - Traffic-light poles at signalized junction approaches (lamp state is
 *   read at render time from WorldRuntime.signalPhase via a callback; this
 *   layer only decides WHERE lights stand and which node id they belong to).
 * - BG sign poles: Б2 stop / Б1 give-way at unsignalized minor approaches,
 *   Б1 + Д11 at roundabout entries, В26-50 at district entry roads, plus the
 *   hand-placed Б2 overrides mirrored from runtime STOP_LINE_OVERRIDES (QW4).
 * - Streetlights along arterials, alternating sides.
 * - Trees v2 (doc 70 REF 3): leafy rows along arterial + residential streets,
 *   palms reserved for the deterministically-picked "palm streets" (the
 *   longest primary-class boulevards), ornamental accents + park fill.
 * - Billboards on poles along primary roadsides (sparse, deterministic).
 * - Bus-stop shelters on primary/secondary sidewalks, >= 25 m past a junction
 *   mouth, capped district-wide.
 * - Surface-parking dressing kits at hand-anchored paved-courtyard sites.
 *
 * All positions in world space; yaw points local +Z at the viewer the prop
 * addresses (approaching traffic).
 */

import { STOP_LINE_OVERRIDES } from "../../runtime/stoplines";
import type {
  BillboardPlacement,
  District,
  SignKind,
  SignPlacement,
  StaticTransform,
  TrafficLightPlacement,
  TreeKind,
  TreePlacement,
} from "../types";
import {
  ARTERIAL_CLASSES,
  ARTERIAL_TREE_SPACING_M,
  BILLBOARD_END_INSET_M,
  BILLBOARD_MIN_SPACING_M,
  BUS_STOP_FROM_MOUTH_M,
  BUS_STOP_MAX_COUNT,
  BUS_STOP_MIN_SEPARATION_M,
  CLASS_RANK,
  PALM_STREET_COUNT,
  PARK_TREE_GRID_M,
  ROAD_Y,
  SIDEWALK_TOP_Y,
  SIDEWALK_WIDTH_M,
  STREET_TREE_SPACING_M,
  STREETLIGHT_SPACING_M,
} from "./constants";
import {
  add,
  dist,
  hashString,
  mul,
  mulberry32,
  perpRight,
  pointAlong,
  polylineLength,
  projectOntoPolyline,
  SegmentGrid,
  sub,
  norm,
  type Vec2,
} from "./math2d";
import { toWorld, yawFromFacing } from "./mesh";
import type { Approach, RoadNetwork } from "./network";
import { buildZoneSigns } from "./zoneSigns";

export interface PropBuildResult {
  trafficLights: TrafficLightPlacement[];
  signs: SignPlacement[];
  streetlights: StaticTransform[];
  trees: TreePlacement[];
  billboards: BillboardPlacement[];
  busStops: StaticTransform[];
  parkingKits: StaticTransform[];
  /** "<nodeId>:<edgeId>" keys of approaches that got a stop sign. */
  stopSignApproaches: Set<string>;
  /** Same for give-way signs. */
  giveWayApproaches: Set<string>;
}

/**
 * Hand-anchored surface-parking dressing sites (doc 70 REF 1 midground),
 * DISTRICT space (x east, y north). The paved-courtyard terrain zoning
 * (TERRAIN_PAVE_NEAR_BUILDING_M) is a per-cell predicate, not a queryable
 * anchor list, so per the streetscape-v2 brief these are hand-picked instead
 * of new zoning logic. Each was machine-verified against district-v1.json:
 * 10–18 m from the nearest building AABB (inside the paved zone, clear of the
 * facade), >= carriageway half-width + sidewalk + 9 m from every road
 * centerline (the kit never touches asphalt/sidewalk), and <= 28 m from one
 * (inside the flat-terrain band, so the kit sits on level paved ground).
 * Sites outside a district's bounds are skipped, so synthetic test districts
 * simply get none.
 */
const PARKING_KIT_SITES: readonly Vec2[] = [
  [-594.8, -184.8], // SW quarter: 13.5 m off a building, 21 m off the road
  [-558.8, 235.2], // NW quarter: 16.2 m off a building, 26 m off the road
  [149.2, 307.2], // NE quarter: 14.7 m off a building, 25 m off the road
];

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

/**
 * "Palm streets": the PALM_STREET_COUNT longest primary-class streets (edges
 * grouped by name; unnamed edges group alone). Deterministic — total length
 * ranks, name breaks ties. Their street trees are palms (the premium
 * boulevard flavor); every other arterial gets leafy rows (REF 3).
 */
function pickPalmStreetEdges(network: RoadNetwork): Set<string> {
  const groups = new Map<string, { len: number; edgeIds: string[] }>();
  for (const eb of network.edges) {
    const cls = eb.edge.class;
    if (cls !== "primary" && cls !== "primary_link") continue;
    const key = eb.edge.name ?? `#${eb.edge.id}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { len: 0, edgeIds: [] }));
    g.len += eb.edge.length;
    g.edgeIds.push(eb.edge.id);
  }
  const ranked = [...groups.entries()].sort(
    (a, b) => b[1].len - a[1].len || (a[0] < b[0] ? -1 : 1),
  );
  const palmEdges = new Set<string>();
  for (const [, g] of ranked.slice(0, PALM_STREET_COUNT)) {
    for (const id of g.edgeIds) palmEdges.add(id);
  }
  return palmEdges;
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
  const billboards: BillboardPlacement[] = [];
  const busStops: StaticTransform[] = [];
  const parkingKits: StaticTransform[] = [];
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

  // -- trees (streetscape v2 mix, doc 70 REF 3) ---------------------------------
  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  const insideBuilding = (p: Vec2, pad: number) =>
    buildingAabbs.some(
      ([minX, minY, maxX, maxY]) =>
        p[0] > minX - pad && p[0] < maxX + pad && p[1] > minY - pad && p[1] < maxY + pad,
    );

  const pushTree = (p: Vec2, kind: TreeKind) => {
    trees.push({
      position: toWorld(p[0], p[1], 0),
      yaw: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.5,
      variant: Math.floor(rng() * 3) as 0 | 1 | 2,
      kind,
    });
  };

  const palmStreetEdges = pickPalmStreetEdges(network);

  // Arterial rows: regularly-spaced leafy trees both sides (REF 3's tree-lined
  // boulevards); the palm streets keep their palms. Per-edge dominant leafy
  // species so a street reads as one planted row, not confetti.
  for (const eb of network.edges) {
    if (!eb.line || eb.edge.roundabout || !ARTERIAL_CLASSES.has(eb.edge.class)) continue;
    const palmStreet = palmStreetEdges.has(eb.edge.id);
    const dominant: TreeKind = hashString(eb.edge.id) % 2 === 0 ? "leafyA" : "leafyB";
    const other: TreeKind = dominant === "leafyA" ? "leafyB" : "leafyA";
    const total = polylineLength(eb.line);
    for (let s = ARTERIAL_TREE_SPACING_M / 2; s < total; s += ARTERIAL_TREE_SPACING_M) {
      const { point, tangent } = pointAlong(eb.line, s);
      const r = perpRight(tangent);
      for (const side of [1, -1]) {
        if (rng() > 0.9 * options.treeDensity) continue;
        const p = add(point, mul(r, side * (eb.halfWidth + SIDEWALK_WIDTH_M + 1.4 + rng() * 0.8)));
        if (insideBuilding(p, 1.8)) continue;
        const pick = rng();
        const kind: TreeKind = palmStreet
          ? "palm"
          : pick < 0.8
            ? dominant
            : pick < 0.92
              ? other
              : "ornamental";
        pushTree(p, kind);
      }
    }
  }

  // Street trees on residential-ish streets, outside the sidewalk — leafy mix
  // with ornamental accents (palms are reserved for the palm streets).
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
      const pick = rng();
      pushTree(p, pick < 0.4 ? "leafyA" : pick < 0.75 ? "leafyB" : "ornamental");
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
      const pick = rng();
      pushTree(p, pick < 0.45 ? "ornamental" : pick < 0.75 ? "leafyA" : "leafyB");
    }
  }

  // -- billboards along primary roadsides (sparse, REF 3) ------------------------
  // Candidate stations every ~40 m along each primary ribbon; a station is
  // accepted only when the nearest already-placed billboard is
  // >= BILLBOARD_MIN_SPACING_M away, so the boulevard fills at one per
  // ~150–200 m regardless of how OSM chops it into edges. (Dual-carriageway
  // twins fall inside each other's spacing radius — one board serves both.)
  const billboardAnchors: Vec2[] = [];
  let billboardCounter = 0;
  const BILLBOARD_STATION_M = 40;
  for (const eb of network.edges) {
    if (!eb.line || eb.edge.roundabout || eb.edge.class !== "primary") continue;
    const total = polylineLength(eb.line);
    for (
      let s = Math.min(BILLBOARD_END_INSET_M, total / 2);
      s <= total - BILLBOARD_END_INSET_M;
      s += BILLBOARD_STATION_M
    ) {
      const { point, tangent } = pointAlong(eb.line, s);
      if (billboardAnchors.some((q) => dist(q, point) < BILLBOARD_MIN_SPACING_M)) continue;
      const side = billboardCounter % 2 === 0 ? 1 : -1;
      const r = perpRight(tangent);
      const p = add(point, mul(r, side * (eb.halfWidth + SIDEWALK_WIDTH_M + 2.4)));
      if (insideBuilding(p, 2.5)) continue;
      billboardAnchors.push(point);
      billboards.push({
        size: billboardCounter % 3 === 2 ? "small" : "large",
        position: toWorld(p[0], p[1], 0),
        // Ad face addresses the near-side (right-hand traffic) oncoming drivers.
        yaw: yawFromFacing(mul(tangent, -side)),
      });
      billboardCounter++;
    }
  }

  // -- bus-stop shelters (primary/secondary, past the junction mouth) ------------
  // Candidates sit BUS_STOP_FROM_MOUTH_M along the junction-trimmed ribbon
  // (the trim IS the mouth, so >= 25 m is guaranteed), on the right-of-travel
  // sidewalk, opening toward the roadway. Deterministic edge-id-hash order +
  // a spacing gate cap the district at BUS_STOP_MAX_COUNT shelters.
  interface BusStopCandidate {
    order: number;
    p: Vec2;
    yaw: number;
  }
  const busStopCandidates: BusStopCandidate[] = [];
  for (const eb of network.edges) {
    if (!eb.line || eb.edge.roundabout) continue;
    const cls = eb.edge.class;
    if (cls !== "primary" && cls !== "secondary") continue;
    const total = polylineLength(eb.line);
    if (total < BUS_STOP_FROM_MOUTH_M + 15) continue;
    // Anchor to whichever edge end is a real junction (degree >= 3).
    const fromJunction = (network.nodes.get(eb.edge.from)?.degree ?? 0) >= 3;
    const toJunction = (network.nodes.get(eb.edge.to)?.degree ?? 0) >= 3;
    let s: number;
    if (fromJunction) s = BUS_STOP_FROM_MOUTH_M;
    else if (toJunction) s = total - BUS_STOP_FROM_MOUTH_M;
    else continue;
    const { point, tangent } = pointAlong(eb.line, s);
    const r = perpRight(tangent);
    // Shelter (1.7 m deep) parked at the back of the 3.5 m sidewalk.
    const p = add(point, mul(r, eb.halfWidth + SIDEWALK_WIDTH_M - 1.35));
    if (insideBuilding(p, 1.2)) continue;
    busStopCandidates.push({
      order: hashString(eb.edge.id),
      p,
      yaw: yawFromFacing(mul(r, -1)), // open side faces the roadway
    });
  }
  busStopCandidates.sort((a, b) => a.order - b.order);
  const acceptedStops: Vec2[] = [];
  for (const c of busStopCandidates) {
    if (busStops.length >= BUS_STOP_MAX_COUNT) break;
    if (acceptedStops.some((q) => dist(q, c.p) < BUS_STOP_MIN_SEPARATION_M)) continue;
    acceptedStops.push(c.p);
    busStops.push({ position: toWorld(c.p[0], c.p[1], SIDEWALK_TOP_Y), yaw: c.yaw });
  }

  // -- zone-driven posts (SIGN-ASSET drop) ---------------------------------------
  // One post per authored District.zones span (rail spans place the full
  // crossing furniture). Pure + additive: zones-less districts add nothing.
  signs.push(...buildZoneSigns(district, network));

  // -- surface-parking dressing kits (hand-anchored, doc 70 REF 1) ---------------
  for (const site of PARKING_KIT_SITES) {
    if (
      site[0] < bounds.minX ||
      site[0] > bounds.maxX ||
      site[1] < bounds.minY ||
      site[1] > bounds.maxY
    ) {
      continue; // not this district (synthetic test worlds get none)
    }
    // Entrance (cluster local +Z) faces the nearest road.
    let facing: Vec2 = [0, 1];
    let best = Infinity;
    for (const eb of network.edges) {
      const proj = projectOntoPolyline(eb.edge.geometry as Vec2[], site);
      if (proj.distance < best) {
        best = proj.distance;
        facing = norm(sub(proj.point, site));
      }
    }
    parkingKits.push({ position: toWorld(site[0], site[1], 0), yaw: yawFromFacing(facing) });
  }

  return {
    trafficLights,
    signs,
    streetlights,
    trees,
    billboards,
    busStops,
    parkingKits,
    stopSignApproaches,
    giveWayApproaches,
  };
}
