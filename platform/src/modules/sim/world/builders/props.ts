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
 *   a single uniform linden species on the deterministically-picked "linden
 *   boulevards" (the longest primary-class streets), ornamental accents + park
 *   fill. Species are Sofia species — see TreeKind on why never a palm.
 * - Billboards on poles along primary roadsides (sparse, deterministic).
 * - Bus-stop shelters on primary/secondary sidewalks, >= 25 m past a junction
 *   mouth, capped district-wide.
 * - Surface-parking dressing kits at hand-anchored paved-courtyard sites.
 *
 * All positions in world space; yaw points local +Z at the viewer the prop
 * addresses (approaching traffic).
 */

import { bearingDeg } from "../../runtime/geometry";
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
  LINDEN_BOULEVARD_COUNT,
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
  AabbGrid,
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
import { junctionPriorityControls, type Approach, type RoadNetwork } from "./network";
import { buildZoneSigns, scenarioSignScale } from "./zoneSigns";

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
 * "Linden boulevards": the LINDEN_BOULEVARD_COUNT longest primary-class streets
 * (edges grouped by name; unnamed edges group alone). Deterministic — total
 * length ranks, name breaks ties. Every tree on them is the SAME species, which
 * is what makes a Sofia boulevard read as a planted avenue rather than a street
 * that happens to have trees; every other arterial gets the mixed leafy row
 * (REF 3).
 */
function pickLindenBoulevardEdges(network: RoadNetwork): Set<string> {
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
  const boulevardEdges = new Set<string>();
  for (const [, g] of ranked.slice(0, LINDEN_BOULEVARD_COUNT)) {
    for (const id of g.edgeIds) boulevardEdges.add(id);
  }
  return boulevardEdges;
}

/**
 * Scenario opt-out for the procedural roadside tree passes (LC gantry reel fix).
 * A teaching micro-map whose hero is an OVERHEAD element — the LC lane-signal
 * gantry (LaneSignalGantry, gated on meta.scenario.laneGantry) — sets
 * `meta.scenario.suppressRoadsideTrees: true` so the arterial / residential /
 * park tree rows never grow on its verges and bury the chase camera between the
 * ego and the red-✕ gantry. Default (flag absent / false) leaves every other
 * district's tree placement byte-identical: this is read ONLY to skip the three
 * tree passes below, nothing else about the build changes.
 */
function suppressRoadsideTreesOf(district: District): boolean {
  const scenario = (district.meta as { scenario?: unknown }).scenario as
    | { suppressRoadsideTrees?: unknown }
    | undefined;
  return scenario?.suppressRoadsideTrees === true;
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
  // Lesson-critical sign prominence (doc 62 S4/#6): scenario micro-maps scale
  // the signs that ARE the lesson; undefined elsewhere keeps placements
  // byte-identical (no `scale` key) on city/exam/полигон maps.
  const lessonScale = scenarioSignScale(district);
  const lessonSized = lessonScale !== undefined ? { scale: lessonScale } : {};

  // -- traffic lights at signalized junctions ---------------------------------
  // Two heads per incoming approach (doc 62 S1/#19 — „green appeared once and
  // never again"): the NEAR head stands right of the driver at the stop line
  // (the shipped pose), and a FAR-SIDE companion mirrors it through the node —
  // the far-left corner across the junction, the head a driver WAITING AT THE
  // LINE actually has in view (the near pole is abeam of the A-pillar there,
  // invisible from both cockpit and chase cameras). Both carry the approach's
  // own travel bearing so the render callback lights the arm's graded
  // axis-group (WorldRuntime.signalLampState), never the node's single group.
  // The companion is skipped when its mirrored point lands inside another
  // arm's corridor (organic OSM junctions are not orthogonal) — deterministic
  // geometry, no RNG.
  for (const node of network.nodes.values()) {
    if (!node.signalized || node.degree < 3) continue;
    let approachesLit = 0;
    for (const ap of node.approaches) {
      if (!ap.incoming || approachesLit >= 4) continue;
      const { p, yaw } = approachPropPose(ap, 1.0, 0.9);
      const travel = mul(ap.cutTangentAway, -1); // into the junction
      const approachBearingDeg = bearingDeg(travel[0], travel[1]);
      trafficLights.push({
        nodeId: node.id,
        position: toWorld(p[0], p[1], ROAD_Y),
        yaw,
        approachBearingDeg,
      });
      // Far-side companion: the mirror of the near head through the node.
      // Clearance check: must sit outside every arm's carriageway corridor
      // (projected in FRONT of the node toward that arm, lateral > halfWidth
      // + margin) — a pole may stand on a verge, never on asphalt.
      const m: Vec2 = [2 * node.pos[0] - p[0], 2 * node.pos[1] - p[1]];
      let clear = true;
      for (const other of node.approaches) {
        const dir = other.cutTangentAway;
        const vx = m[0] - node.pos[0];
        const vy = m[1] - node.pos[1];
        const proj = vx * dir[0] + vy * dir[1];
        if (proj <= 0) continue; // behind the node for this arm
        const lateral = Math.abs(dir[0] * vy - dir[1] * vx);
        if (lateral < other.halfWidth + 0.3) {
          clear = false;
          break;
        }
      }
      if (clear) {
        trafficLights.push({
          nodeId: node.id,
          position: toWorld(m[0], m[1], ROAD_Y),
          yaw, // same facing: it addresses the same incoming driver
          approachBearingDeg,
        });
      }
      approachesLit++;
    }
  }

  // -- priority signs at unsignalized junctions -------------------------------
  // The WHO-YIELDS rule lives in network.junctionPriorityControls — the same
  // call the runtime's graded stop lines make (audit C-4). Painting from one
  // table and grading from another is how „Пропусни движението" ended up over
  // a graded Б2 line on the exam route; there is now nothing left to diverge.
  for (const node of network.nodes.values()) {
    if (node.signalized) continue;
    const controls = junctionPriorityControls(
      node.approaches.map((ap) => ({
        edgeId: ap.edgeId,
        class: ap.edge.class,
        incoming: ap.incoming,
        roundabout: ap.edge.roundabout,
      })),
    );
    if (controls.size === 0) continue;
    const isRoundabout = node.approaches.some((ap) => ap.edge.roundabout);
    for (const ap of node.approaches) {
      const control = controls.get(ap.edgeId);
      if (control === undefined) continue;
      const kind: SignKind = control === "stopSign" ? "stop" : "giveWay";
      const { p, yaw } = approachPropPose(ap, 1.4, 0.8);
      signs.push({ kind, position: toWorld(p[0], p[1], ROAD_Y), yaw, ...lessonSized });
      // Roundabout entries also carry the mandatory Д11 (it renders higher on
      // the shared pole — the component offsets by kind).
      if (isRoundabout) {
        signs.push({ kind: "roundabout", position: toWorld(p[0], p[1], ROAD_Y), yaw, ...lessonSized });
      }
      (kind === "stop" ? stopSignApproaches : giveWayApproaches).add(`${node.id}:${ap.edgeId}`);
    }
  }

  // -- hand-placed Б2/Б1 signs (QW4) -------------------------------------------
  // Mirrors runtime STOP_LINE_OVERRIDES so every hard-placed graded line has a
  // visible sign here and a painted line in the markings pass — grading must
  // never reference invisible control. The sign MUST match the override's
  // control: a Б1 give-way override (control "giveWay") paints a Б1 sign, not a
  // Б2 „Стоп" (a Б2 sign over a give-way line teaches the opposite of the rule
  // the лесон grades — the sc-jx-giveway-b1 lesson's whole point is Б1≠Б2).
  for (const ov of STOP_LINE_OVERRIDES) {
    const key = `${ov.nodeId}:${ov.edgeId}`;
    if (stopSignApproaches.has(key) || giveWayApproaches.has(key)) continue;
    const info = network.nodes.get(ov.nodeId);
    const ap = info?.approaches.find((a) => a.edgeId === ov.edgeId);
    if (!ap || !ap.incoming) continue;
    const kind: SignKind = ov.control === "giveWay" ? "giveWay" : "stop";
    const { p, yaw } = approachPropPose(ap, 1.4, 0.8);
    signs.push({ kind, position: toWorld(p[0], p[1], ROAD_Y), yaw, ...lessonSized });
    (kind === "giveWay" ? giveWayApproaches : stopSignApproaches).add(key);
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
    // Derive the plate from the LOCAL limit instead of hard-coding 50. The kit
    // ships only the В26-50 face, so it stays honest on a >=50 edge (the
    // documented ov-* understating quirk is preserved). But on the LOW-SPEED
    // TAIL of a collinear zone transition — a reduced segment (e.g. the зона-30
    // end of a 50→30 creep/school street) whose far end is a plain degree-2
    // limit change back UP to a faster segment — a 50 face would OVERSTATE the
    // graded cap, so suppress it there rather than post a sign that lies.
    const localLimit = ap.edge.maxspeed;
    if (typeof localLimit === "number" && localLimit < 50) {
      const farId = ap.edge.from === nodeId ? ap.edge.to : ap.edge.from;
      const touchingFar = network.edges.filter(
        (eb) => eb.edge.from === farId || eb.edge.to === farId,
      );
      const continuation = touchingFar.filter((eb) => eb.edge.id !== ap.edge.id);
      const isDropTail =
        touchingFar.length === 2 &&
        continuation.length === 1 &&
        (continuation[0]!.edge.maxspeed ?? Infinity) > localLimit;
      if (isDropTail) continue;
    }
    const g = ap.edge.geometry as Vec2[];
    const len = polylineLength(g);
    const sFromNode = Math.min(14, len * 0.35);
    const s = ap.edge.from === nodeId ? sFromNode : len - sFromNode;
    const { point, tangent } = pointAlong(g, s);
    const travel = ap.edge.from === nodeId ? tangent : mul(tangent, -1); // into district
    const r = perpRight(travel);
    const p = add(point, mul(r, ap.halfWidth + 0.8));
    // Lesson-critical prominence on scenario micro-maps (doc 62 S4/#6): the
    // entry В26-50 IS the speed context, so it renders at scenario scale like
    // every other lesson sign — undefined elsewhere keeps city/exam placements
    // byte-identical.
    signs.push({
      kind: "limit50",
      position: toWorld(p[0], p[1], ROAD_Y),
      yaw: yawFromFacing(mul(travel, -1)),
      ...lessonSized,
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
  // A gantry-hero micro-map (lc-gantry-v1) opts every roadside tree pass out so
  // no canopy occludes the overhead-signal shot; every other district keeps its
  // trees (placeTrees stays true).
  const placeTrees = !suppressRoadsideTreesOf(district);
  const roadGrid = new SegmentGrid(24);
  for (const eb of network.edges) roadGrid.addPolyline(eb.edge.geometry as Vec2[]);

  // Bucketed, not scanned — see terrain.ts and AabbGrid's header: doc 82 V7's
  // street wall turns every prop candidate's linear footprint scan into a
  // 380-box one on the city map. The predicate itself is unchanged, so every
  // prop lands exactly where it did.
  const buildingGrid = new AabbGrid(24);
  for (const box of buildingAabbs) buildingGrid.add(box);
  const insideBuilding = (p: Vec2, pad: number) => buildingGrid.hits(p, pad);

  const pushTree = (p: Vec2, kind: TreeKind) => {
    trees.push({
      position: toWorld(p[0], p[1], 0),
      yaw: rng() * Math.PI * 2,
      scale: 0.8 + rng() * 0.5,
      variant: Math.floor(rng() * 3) as 0 | 1 | 2,
      kind,
    });
  };

  const lindenBoulevardEdges = pickLindenBoulevardEdges(network);

  // Arterial rows: regularly-spaced leafy trees both sides (REF 3's tree-lined
  // boulevards); the linden boulevards are planted single-species. Per-edge
  // dominant leafy species so a street reads as one planted row, not confetti.
  if (placeTrees)
    for (const eb of network.edges) {
    if (!eb.line || eb.edge.roundabout || !ARTERIAL_CLASSES.has(eb.edge.class)) continue;
    const lindenBoulevard = lindenBoulevardEdges.has(eb.edge.id);
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
        const kind: TreeKind = lindenBoulevard
          ? "linden"
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
  // with ornamental accents (the linden row is reserved for the boulevards, so
  // a side street never reads as a planted avenue).
  if (placeTrees)
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
  if (placeTrees)
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
