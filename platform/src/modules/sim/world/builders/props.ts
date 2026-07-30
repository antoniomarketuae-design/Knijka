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
import { speedLimitSignKind } from "../types";
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
import {
  isBareVergeSide,
  junctionPriorityControls,
  onewayNoEntryArms,
  type Approach,
  type RoadNetwork,
} from "./network";
import { buildZoneSigns, scenarioSignScale } from "./zoneSigns";
import { SCENARIO_SIGN_SCALE } from "./constants";

/** Every signal head, on every map, renders at this scale (doc 86 L2 — see
 *  `signalSized` in buildProps for why the head is not gated like the plates). */
const SIGNAL_HEAD_SCALE = SCENARIO_SIGN_SCALE;

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

/**
 * Г12 „Кръгово движение" stands this far BEHIND the Б1 it accompanies at a
 * roundabout entry (further from the junction = read first by the approaching
 * driver, which is the order the two signs teach: „ahead is a roundabout",
 * then „give way at the line").
 */
const ROUNDABOUT_SIGN_BACK_M = 3;
/** …and this much further off the curb, so the two posts never line up into
 *  one silhouette on the straight approach (same trick as the В26 advisory
 *  plate behind its А1 — zoneSigns CURVE_ADVISORY_PLATE_OUT_M). */
const ROUNDABOUT_SIGN_OUT_M = 1.2;

/** В1 stands just past the mouth of the arm it closes… */
const NO_ENTRY_ALONG_M = 1.4;
/** …at the same curb offset as the priority posts. */
const NO_ENTRY_LATERAL_M = 0.8;

/**
 * Б3 „Път с предимство" (жълт ромб) stands on the arm that HAS priority, at
 * the same station the yielding arms carry their Б1/Б2 — the pairing a driver
 * reads as one junction. Only ever placed where junctionPriorityControls
 * actually assigned a control, so an equal junction (tj-rhr / jx-equal) stays
 * correctly bare (doc 86 R1: „every district correctly has ZERO signs where
 * the lesson says the junction is equal" — that must not change).
 */
const PRIORITY_DIAMOND_ALONG_M = 1.4;
const PRIORITY_DIAMOND_LATERAL_M = 0.8;

/**
 * A18 „Пешеходна пътека" warns the driver BEFORE the zebra, never at it.
 * Same discipline as the rail warning triangle in zoneSigns (doc 86 T14): the
 * cue has to arrive while there is still road left to slow down on.
 */
const CROSSING_WARNING_AHEAD_M = 35;
/** …and it is pointless when the zebra is within this of the road's start —
 *  a post at metre 1 is behind the driver's spawn on every micro-map. */
const CROSSING_WARNING_MIN_ROOM_M = 20;

/**
 * Doc 86 T5 — „the only speed post on every junction micro-map stands 1 m
 * BEHIND the spawn, facing away". A district-entry plate is worth nothing if
 * the driver starts past it, so a post that would land closer than this AHEAD
 * of a spawn on its own edge is moved forward instead of being posted blind.
 */
const ENTRY_POST_MIN_AHEAD_OF_SPAWN_M = 25;
/** Where it is moved TO: far enough to be read, close enough to still be the
 *  entry statement rather than a mid-block plate. */
const ENTRY_POST_RELOCATE_AHEAD_M = 30;
/** …but never inside this of the far end of the arm (the junction mouth). */
const ENTRY_POST_END_CLEAR_M = 25;

/** How far ahead of a spawn its context plate goes, when nothing else on that
 *  edge already states the limit ahead of him. */
const SPAWN_CONTEXT_AHEAD_M = 30;

/** A В26 at a mid-route limit change stands just past the transition node, so
 *  the first metre it governs is the first metre it is visible on. */
const TRANSITION_POST_ALONG_M = 6;
/** The В33 „край на забраната" that accompanies a limit RISE gets its own
 *  post, set back like the Г12 does behind its Б1 (never two plates on one
 *  pole — sign-post-distinct.test.ts). */
const TRANSITION_END_BACK_M = 4.5;
const TRANSITION_END_OUT_M = 1.2;

/** Road classes that are never a „one-way street" in the Д4 sense, however
 *  the one-way tag reads: a motorway/trunk carriageway is signed Д5/Д6. */
const ONEWAY_STREET_EXCLUDED_CLASSES = new Set([
  "motorway",
  "motorway_link",
  "trunk",
  "trunk_link",
]);
/** Two anti-parallel one-way edges closer than this are the two halves of a
 *  DIVIDED road (how mw-v1 models its carriageways), not two one-way streets. */
const DIVIDED_TWIN_MAX_LATERAL_M = 60;

/** No two sign models may stand closer than this (sign-post-distinct.test.ts:33
 *  states the same number as a gate; the new passes enforce it by construction
 *  rather than hoping). */
const MIN_POST_SEPARATION_M = 0.75;

/** Numeral face for a limit, or null when the kit cannot state it truthfully. */
function speedPlate(kmh: number | undefined): { kind: SignKind; speedKmh: number } | null {
  const kind = speedLimitSignKind(kmh);
  return kind === null ? null : { kind, speedKmh: kmh as number };
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
  // …but the SIGNAL HEAD is scaled on EVERY map, city included (doc 86 L2).
  // The scale rule above exists so city sign PLACEMENTS stay byte-identical,
  // and that is right for a plate: a Б1 at 1x on a city street still reads.
  // A signal lens does not — it is a SphereGeometry(0.13) that subtends ~0.1°
  // from 76 m, and the 2.5x road exaggeration is global, not scenario-only. So
  // the one prop that is unreadable at 1x on ANY of these roads is the one
  // prop that always gets the lift; the exam routes run on district-v1 and
  // d2-v1, whose 90 heads were the worst instance of the defect.
  const signalSized = { scale: SIGNAL_HEAD_SCALE };

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
        // Doc 86 L2 — the ONE-WORD cause of „no traffic light exists at all"
        // on lessons 17/18/19/21/29: every signs.push in this file carried a
        // scale spread and these two calls did not, so a 0.13 m lens stood at
        // 1x on a 2.5x-exaggerated world while the В26 beside it got 1.5x.
        // StaticTransform.scale and createOffsetInstancedMesh's scaled lamp
        // offsets were built for exactly this and were never wired.
        ...signalSized,
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
          ...signalSized, // see the near head above (doc 86 L2)
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
      // Roundabout entries also carry the mandatory Г12 „Кръгово движение".
      // It gets its OWN post: the note that used to sit here claimed the
      // renderer offsets the plate by kind, and it never did — WorldProps
      // instances every kind at the placement transform verbatim, so pushing
      // Г12 at the Б1 pose stacked two whole sign models (pole and all) in the
      // same cubic metre. The founder read the result off the verdict board as
      // one plate carrying two signs. Two posts, two poses, the second set
      // back and further out exactly like the В26 advisory plate does behind
      // its А1 (ZONE constants below).
      if (isRoundabout) {
        const pose = approachPropPose(ap, 1.4 + ROUNDABOUT_SIGN_BACK_M, 0.8 + ROUNDABOUT_SIGN_OUT_M);
        signs.push({
          kind: "roundabout",
          position: toWorld(pose.p[0], pose.p[1], ROAD_Y),
          yaw: pose.yaw,
          ...lessonSized,
        });
      }
      (kind === "stop" ? stopSignApproaches : giveWayApproaches).add(`${node.id}:${ap.edgeId}`);
    }

    // Doc 86 D5 — sign_priority_road.glb (Б3, the жълт ромб) shipped finished
    // and unreachable: no SignKind, so no pass could place it. Its correct
    // home is the arm that HAS priority at a junction where somebody yields,
    // which is precisely the arms junctionPriorityControls left uncontrolled.
    // Roundabouts are excluded — a ring entry is signed Б1 + Г12, never Б3.
    //
    // Scenario micro-maps only, on the В1 pass's reasoning: the OSM city
    // districts would grow 120 diamonds between them (one per uncontrolled arm
    // of every controlled junction), which is both invented signage the source
    // never recorded and a wildly over-signed street — Б3 is posted once at the
    // head of a priority road, not on every approach of every junction.
    if (!isRoundabout && lessonScale !== undefined) {
      for (const ap of node.approaches) {
        if (!ap.incoming) continue;
        if (controls.get(ap.edgeId) !== undefined) continue; // this arm yields
        const { p, yaw } = approachPropPose(
          ap,
          PRIORITY_DIAMOND_ALONG_M,
          PRIORITY_DIAMOND_LATERAL_M,
        );
        signs.push({
          kind: "priorityRoad",
          position: toWorld(p[0], p[1], ROAD_Y),
          yaw,
          ...lessonSized,
        });
      }
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

  // -- В1 „Забранено е влизането" at one-way mouths ----------------------------
  // WHICH mouths lives in network.onewayNoEntryArms — the same one-way tag the
  // runtime's wrongWay surface grades WRONG_WAY from, so the sign a student is
  // failed for ignoring is now the sign he was shown (the junctionPriorityControls
  // discipline). Founder verdict-board note on sc-ov-oneway: the one-way street
  // was stated by lane arrows and nothing else, while the В1 GLB shipped unused.
  //
  // Gated to scenario micro-maps, and deliberately: the OSM city districts carry
  // ~150 one-way mouths whose REAL signage the source data never recorded, so
  // posting there would trade a missing sign for an invented one. The gate is
  // the lesson-scale gate (scenarioSignScale), reused rather than re-derived.
  if (lessonScale !== undefined) {
    for (const node of network.nodes.values()) {
      const banned = onewayNoEntryArms(
        node.approaches.map((ap) => ({
          edgeId: ap.edgeId,
          oneway: ap.edge.oneway,
          roundabout: ap.edge.roundabout,
          incoming: ap.incoming,
          outgoing: ap.outgoing,
        })),
      );
      if (banned.size === 0) continue;
      for (const ap of node.approaches) {
        if (!banned.has(ap.edgeId)) continue;
        // The MIRROR of approachPropPose: this post addresses the driver who
        // would turn INTO the arm, so it stands on THAT driver's right (right
        // of `away`, not of the incoming direction) and its face looks back at
        // the junction he is leaving — the same 1.4 m / 0.8 m curb pose the
        // priority posts use, so a mouth reads as one signed station.
        const away = ap.cutTangentAway;
        const p = add(
          add(ap.cut, mul(away, NO_ENTRY_ALONG_M)),
          mul(perpRight(away), ap.halfWidth + NO_ENTRY_LATERAL_M),
        );
        signs.push({
          kind: "noEntry",
          position: toWorld(p[0], p[1], ROAD_Y),
          yaw: yawFromFacing(mul(away, -1)),
          ...lessonSized,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Speed plates — В26 by NUMERAL, and never a numeral the road does not carry
  // ---------------------------------------------------------------------------
  // Doc 86 T4: the kit had exactly one speed face, so `kind: "limit50"` was
  // hard-coded here and 83 of 154 scenarios sat on a 30/40/90/140 street
  // wearing a „50" plate — at SCENARIO_SIGN_SCALE, i.e. the most legible object
  // on the map, contradicting the very number the reducer grades
  // (tick.maxSpeedKmh comes off the edge tag). The face set is now one per
  // numeral (types.ts SPEED_LIMIT_FACES_KMH, rasterised from the law-cited
  // content/signs/svg/v26.svg), so the plate simply STATES the edge tag.
  //
  // Two rules make the class of defect unauthorable rather than merely fixed:
  //   1. the numeral is derived from ap.edge.maxspeed — there is no literal to
  //      go stale;
  //   2. a limit the kit cannot state truthfully places NOTHING. The old
  //      `isDropTail` hack — which only ever fired on a collinear zone tail
  //      (`touchingFar.length === 2`), a condition a single-edge street can
  //      never satisfy — is deleted: it was a special case for the one lie the
  //      author happened to notice, and the general rule subsumes it.

  /** Posts that must keep their distance from each other (doc 62 #—, pinned by
   *  sign-post-distinct.test.ts). Seeded with everything placed so far. */
  const postAnchors: Vec2[] = signs.map((s) => [s.position[0], -s.position[2]] as Vec2);
  const pushSignAt = (
    p: Vec2,
    yaw: number,
    kind: SignKind,
    extra: { speedKmh?: number } = {},
  ): boolean => {
    if (postAnchors.some((q) => dist(q, p) < MIN_POST_SEPARATION_M)) return false;
    postAnchors.push(p);
    signs.push({ kind, position: toWorld(p[0], p[1], ROAD_Y), yaw, ...extra, ...lessonSized });
    return true;
  };

  /**
   * Every В26 this build has posted, as (edge, arclength ALONG THE TRAVEL it
   * addresses, numeral). The spawn-context pass below reads it to answer one
   * question: "does the driver who starts HERE have his limit posted ahead of
   * him?" — which is the founder's complaint (items 31/33/34/36, „no speed sign
   * anywhere") stated as an invariant instead of a symptom.
   */
  const platesAhead: { edgeId: string; sAlongTravel: number; dirSign: 1 | -1; kmh: number }[] = [];
  const recordPlate = (edgeId: string, sFromGeomStart: number, dirSign: 1 | -1, kmh: number) => {
    const eb = network.edgeById.get(edgeId);
    if (!eb) return;
    const len = polylineLength(eb.edge.geometry as Vec2[]);
    platesAhead.push({
      edgeId,
      sAlongTravel: dirSign === 1 ? sFromGeomStart : len - sFromGeomStart,
      dirSign,
      kmh,
    });
  };

  /**
   * Spawns that travel ALONG a given edge, as arclengths measured from the
   * edge's geometry start, tagged with whether they run with (+1) or against
   * (-1) the geometry. `heading` is a compass bearing (0 = +y, clockwise), the
   * same convention bearingDeg produces.
   */
  const spawnsByEdge = new Map<string, { s: number; dirSign: 1 | -1 }[]>();
  for (const sp of district.spawnPoints) {
    const eb = network.edgeById.get(sp.edgeId);
    if (!eb) continue;
    const g = eb.edge.geometry as Vec2[];
    const proj = projectOntoPolyline(g, [sp.x, sp.y]);
    const rad = (sp.heading * Math.PI) / 180;
    const heading: Vec2 = [Math.sin(rad), Math.cos(rad)];
    const dirSign: 1 | -1 =
      heading[0] * proj.tangent[0] + heading[1] * proj.tangent[1] >= 0 ? 1 : -1;
    const bucket = spawnsByEdge.get(sp.edgeId) ?? [];
    bucket.push({ s: proj.s, dirSign });
    spawnsByEdge.set(sp.edgeId, bucket);
  }

  /**
   * Where an entry post addressing a driver who enters `edge` at `fromNodeId`
   * should stand, as an arclength measured FROM that node along travel.
   *
   * Doc 86 T5: the shipped station (min(14, len·0.35)) put every junction
   * micro-map's only speed plate 1 m BEHIND the spawn, facing away — the
   * founder's „no speed sign anywhere" on items 31/33/34/36 is a sign standing
   * physically behind his head. A station that a spawn on the same edge has
   * already passed (or is about to, inside 25 m) is moved 30 m AHEAD of that
   * spawn instead. Returns null when the arm has no room left before its far
   * mouth — better no plate than one inside the junction.
   */
  const entryStationFromNode = (
    edge: { id: string; from: string; geometry: readonly Vec2[] },
    fromNodeId: string,
    len: number,
  ): number | null => {
    const base = Math.min(14, len * 0.35);
    const forward = edge.from === fromNodeId;
    let sFromNode = base;
    for (const sp of spawnsByEdge.get(edge.id) ?? []) {
      // Only a spawn DRIVING AWAY from this node can ever pass this post.
      if ((sp.dirSign === 1) !== forward) continue;
      const spawnFromNode = forward ? sp.s : len - sp.s;
      // A spawn DEFEATS the post only when it starts level with it: within one
      // reading distance either side. A spawn 400 m down the same street is a
      // different drill starting elsewhere and must not drag the entry plate
      // along with it (that emptied ac-aqua-v1's entry when the finish spawn
      // was counted).
      if (Math.abs(spawnFromNode - base) > ENTRY_POST_MIN_AHEAD_OF_SPAWN_M) continue;
      sFromNode = Math.max(sFromNode, spawnFromNode + ENTRY_POST_RELOCATE_AHEAD_M);
    }
    if (sFromNode > len - ENTRY_POST_END_CLEAR_M) return null;
    return sFromNode;
  };

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
    const plate = speedPlate(ap.edge.maxspeed);
    if (!plate) continue; // no truthful face for this limit — post nothing
    const g = ap.edge.geometry as Vec2[];
    const len = polylineLength(g);
    const sFromNode = entryStationFromNode(ap.edge, nodeId, len);
    if (sFromNode === null) continue;
    const s = ap.edge.from === nodeId ? sFromNode : len - sFromNode;
    const { point, tangent } = pointAlong(g, s);
    const travel = ap.edge.from === nodeId ? tangent : mul(tangent, -1); // into district
    const r = perpRight(travel);
    const p = add(point, mul(r, ap.halfWidth + 0.8));
    // Lesson-critical prominence on scenario micro-maps (doc 62 S4/#6): the
    // entry В26 IS the speed context, so it renders at scenario scale like
    // every other lesson sign — undefined elsewhere keeps city/exam placements
    // byte-identical.
    if (pushSignAt(p, yawFromFacing(mul(travel, -1)), plate.kind, { speedKmh: plate.speedKmh })) {
      recordPlate(ap.edge.id, s, ap.edge.from === nodeId ? 1 : -1, plate.speedKmh);
    }
  }

  // -- В26 / В33 at mid-route limit changes (doc 86 D6) -------------------------
  // props.ts iterated network.deadEnds ONLY, so a degree-2 transition node — the
  // whole subject of sc-sp-limit-end, sc-speed-zone, the school and живущи zones
  // — was structurally unreachable and shipped with zero plates: the student was
  // graded against a limit that changed under him with nothing in the world to
  // announce it.
  //
  // Scenario micro-maps only, on the same reasoning as the В1 pass above: every
  // edge tag on a micro-map is authored BY US and is the lesson, while an OSM
  // city district's degree-2 tag boundaries are mostly way-splitting artefacts
  // whose real signage the source never recorded (d2-v1 and district-v1 carry 19
  // between them). Posting there would trade a missing sign for an invented one.
  if (lessonScale !== undefined) {
    const touchingByNode = new Map<string, typeof network.edges>();
    for (const eb of network.edges) {
      for (const id of [eb.edge.from, eb.edge.to]) {
        const bucket = touchingByNode.get(id) ?? [];
        bucket.push(eb);
        touchingByNode.set(id, bucket);
      }
    }
    for (const [nodeId, touching] of [...touchingByNode.entries()].sort((a, b) =>
      a[0] < b[0] ? -1 : 1,
    )) {
      if (touching.length !== 2) continue;
      const [a, b] = touching as [(typeof network.edges)[number], (typeof network.edges)[number]];
      if (a.edge.roundabout || b.edge.roundabout) continue;
      const la = a.edge.maxspeed;
      const lb = b.edge.maxspeed;
      if (typeof la !== "number" || typeof lb !== "number" || la === lb) continue;
      // One plate per DIRECTION of travel through the node: a driver arriving
      // on `from` gets the plate that states `into`'s limit.
      for (const [from, into] of [
        [a, b],
        [b, a],
      ] as const) {
        const intoLimit = into.edge.maxspeed as number;
        const fromLimit = from.edge.maxspeed as number;
        const plate = speedPlate(intoLimit);
        if (!plate) continue;
        const g = into.edge.geometry as Vec2[];
        const len = polylineLength(g);
        if (len < TRANSITION_POST_ALONG_M + 2) continue;
        const forward = into.edge.from === nodeId;
        // Nobody drives this way on a one-way segment, so nobody would ever
        // see the plate — and a plate facing traffic that cannot legally exist
        // is scenery, not signing.
        if (into.edge.oneway && !forward) continue;
        if (from.edge.oneway && from.edge.from === nodeId) continue;
        const sFromNode = TRANSITION_POST_ALONG_M;
        const { point, tangent } = pointAlong(g, forward ? sFromNode : len - sFromNode);
        const travel = forward ? tangent : mul(tangent, -1);
        const r = perpRight(travel);
        const yaw = yawFromFacing(mul(travel, -1));
        if (
          pushSignAt(add(point, mul(r, into.halfWidth + 0.8)), yaw, plate.kind, {
            speedKmh: plate.speedKmh,
          })
        ) {
          recordPlate(
            into.edge.id,
            forward ? sFromNode : len - sFromNode,
            forward ? 1 : -1,
            plate.speedKmh,
          );
        }
        // A limit that RISES is a restriction LIFTING, and В33 „Край на
        // забраната…" is the sign whose entire subject is that scope — the one
        // sc-sp-limit-end is about. Its own post, set back like the Г12 behind
        // its Б1, so the pair never merges into one silhouette.
        if (intoLimit > fromLimit && speedLimitSignKind(fromLimit) !== null) {
          const back = pointAlong(
            g,
            forward
              ? sFromNode + TRANSITION_END_BACK_M
              : len - sFromNode - TRANSITION_END_BACK_M,
          );
          const backTravel = forward ? back.tangent : mul(back.tangent, -1);
          pushSignAt(
            add(back.point, mul(perpRight(backTravel), into.halfWidth + 0.8 + TRANSITION_END_OUT_M)),
            yawFromFacing(mul(backTravel, -1)),
            "limitEnd",
            { speedKmh: fromLimit },
          );
        }
      }
    }
  }

  // -- В26 repeated ahead of a spawn that starts inside a limited segment -------
  // Doc 86 T4/T5 stated as a POSITIVE invariant: a driver must be able to read
  // the limit he is graded on. A rung that spawns 20 m inside a зона-30 (
  // sp-sg-spawn-limit1/limit2, sp-tr-spawn-zone, sp-creep2) started PAST the
  // only В26 on its edge, so the founder's «Ограничението тук е 30 км/ч, не 50»
  // arrived with nothing in the world to back it. Bulgarian practice repeats
  // В26 through a long restricted stretch anyway (the same reasoning as
  // zoneSigns' ZONE_SIGN_REPEAT_M for В24), so the repeat is correct signing,
  // not a crutch. Truthful by construction: it states the spawn edge's own tag.
  if (lessonScale !== undefined) {
    for (const sp of district.spawnPoints) {
      const eb = network.edgeById.get(sp.edgeId);
      if (!eb) continue;
      const plate = speedPlate(eb.edge.maxspeed);
      if (!plate) continue;
      const g = eb.edge.geometry as Vec2[];
      const len = polylineLength(g);
      const proj = projectOntoPolyline(g, [sp.x, sp.y]);
      const rad = (sp.heading * Math.PI) / 180;
      const head: Vec2 = [Math.sin(rad), Math.cos(rad)];
      const dirSign: 1 | -1 = head[0] * proj.tangent[0] + head[1] * proj.tangent[1] >= 0 ? 1 : -1;
      const sSpawn = dirSign === 1 ? proj.s : len - proj.s;
      const alreadyAnnounced = platesAhead.some(
        (pl) =>
          pl.edgeId === sp.edgeId &&
          pl.dirSign === dirSign &&
          pl.kmh === plate.speedKmh &&
          pl.sAlongTravel > sSpawn + 3,
      );
      if (alreadyAnnounced) continue;
      const sPost = sSpawn + SPAWN_CONTEXT_AHEAD_M;
      if (sPost > len - ENTRY_POST_END_CLEAR_M) continue; // no room before the mouth
      const geomS = dirSign === 1 ? sPost : len - sPost;
      const { point, tangent } = pointAlong(g, geomS);
      const travel = dirSign === 1 ? tangent : mul(tangent, -1);
      const p = add(point, mul(perpRight(travel), eb.halfWidth + 0.8));
      if (pushSignAt(p, yawFromFacing(mul(travel, -1)), plate.kind, { speedKmh: plate.speedKmh })) {
        recordPlate(sp.edgeId, geomS, dirSign, plate.speedKmh);
      }
    }
  }

  // -- Д4 „Еднопосочно движение" at the LEGAL mouth of a one-way arm ------------
  // The В1 pass above closes the mouth a driver may not enter; Д4 is its twin
  // and the founder named it directly (item 47 — „the blue one way sign is
  // straight forward"). It shipped as neither a GLB nor a SignKind; the face is
  // now rasterised from content/signs/svg/d4.svg onto the square info plate.
  // Same scenario-map gate and same reasoning as В1.
  if (lessonScale !== undefined) {
    const onewayEdges = network.edges.filter((eb) => eb.edge.oneway && !eb.edge.roundabout);
    for (const eb of onewayEdges) {
      // Д4 means „this STREET is one-way", never „this is one carriageway of a
      // divided road" (that is Д5/Д6 territory) and never a motorway. Three
      // filters, in order of how wrong the sign would be:
      //  1. class — a motorway/trunk carriageway or a slip road is not a
      //     one-way street;
      if (ONEWAY_STREET_EXCLUDED_CLASSES.has(eb.edge.class) || eb.edge.class.endsWith("_link")) {
        continue;
      }
      const g = eb.edge.geometry as Vec2[];
      const len = polylineLength(g);
      if (len < 12) continue;
      const mid = pointAlong(g, len / 2);
      //  2. an ANTI-PARALLEL one-way twin running alongside = a divided road,
      //     which is how mw-v1's two carriageways are modelled;
      const hasTwin = onewayEdges.some((other) => {
        if (other.edge.id === eb.edge.id) return false;
        const proj = projectOntoPolyline(other.edge.geometry as Vec2[], mid.point);
        if (proj.distance > DIVIDED_TWIN_MAX_LATERAL_M) return false;
        return mid.tangent[0] * proj.tangent[0] + mid.tangent[1] * proj.tangent[1] < -0.8;
      });
      if (hasTwin) continue;
      //  3. the post belongs at the street's MOUTH — the `from` node of a
      //     one-way edge — and only where that node really is a mouth (a
      //     junction or a district boundary), never at the degree-2 seam
      //     between two collinear segments of the same street.
      const mouth = network.nodes.get(eb.edge.from);
      if (!mouth || (mouth.degree === 2 && !network.deadEnds.has(eb.edge.from))) continue;
      const { point, tangent } = pointAlong(g, Math.min(8, len * 0.2));
      const p = add(point, mul(perpRight(tangent), eb.halfWidth + 0.8));
      pushSignAt(p, yawFromFacing(mul(tangent, -1)), "oneWay");
    }
  }

  // -- А18 „Пешеходна пътека" in ADVANCE of an authored zebra --------------------
  // Doc 86 D5: sign_pedestrian.glb shipped finished with no SignKind. Placed on
  // the approach side, CROSSING_WARNING_AHEAD_M before the crossing — the same
  // discipline the rail warning already had and the hazard posts did not (T14).
  // Scenario maps only: an OSM district's crossings are data, not authored
  // teaching objects, and 90 city zebras would each grow a triangle the real
  // street does not have.
  if (lessonScale !== undefined) {
    for (const crossing of district.crossings) {
      if (!crossing.edgeId) continue;
      const eb = network.edgeById.get(crossing.edgeId);
      if (!eb) continue;
      const g = eb.edge.geometry as Vec2[];
      const len = polylineLength(g);
      const at = projectOntoPolyline(g, [crossing.x, crossing.y]);
      // One post per direction that has room to read it.
      for (const forward of [true, false] as const) {
        const sPost = forward ? at.s - CROSSING_WARNING_AHEAD_M : at.s + CROSSING_WARNING_AHEAD_M;
        if (forward && sPost < CROSSING_WARNING_MIN_ROOM_M) continue;
        if (!forward && sPost > len - CROSSING_WARNING_MIN_ROOM_M) continue;
        const { point, tangent } = pointAlong(g, sPost);
        const travel = forward ? tangent : mul(tangent, -1);
        const p = add(point, mul(perpRight(travel), eb.halfWidth + 0.8));
        pushSignAt(p, yawFromFacing(mul(travel, -1)), "pedestrianCrossing");
      }
    }
  }

  // -- streetlights along arterials --------------------------------------------
  for (const eb of network.edges) {
    if (!eb.line || !ARTERIAL_CLASSES.has(eb.edge.class)) continue;
    // Lamp columns stand on the verge — so a BARE verge (network.ts
    // BareVergeSide) never gets one. On a divided street that verge is the
    // median, whose columns belong to the OTHER carriageway's row; a column
    // planted for both halves stood one pole-width off the far carriageway's
    // kerb, i.e. in its travel lane. "both" (a motorway връзка) has no row.
    if (eb.bareVerge === "both") continue;
    const total = polylineLength(eb.line);
    // Alternating sides is the city look; with one verge bare the whole row
    // moves to the side that has one.
    const onlySide: 1 | -1 | null =
      eb.bareVerge === "left" ? 1 : eb.bareVerge === "right" ? -1 : null;
    let side: 1 | -1 = onlySide ?? 1;
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
      if (onlySide === null) side = (-side) as 1 | -1;
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
      for (const side of [1, -1] as const) {
        if (rng() > 0.9 * options.treeDensity) continue;
        const p = add(point, mul(r, side * (eb.halfWidth + SIDEWALK_WIDTH_M + 1.4 + rng() * 0.8)));
        // Bare verge (median kerb / motorway връзка) — tested AFTER both draws
        // so the shared per-district rng stream is untouched by the tag.
        if (isBareVergeSide(eb.bareVerge, side)) continue;
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
      if (isBareVergeSide(eb.bareVerge, side)) continue; // after the draws — see above
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
      // Alternate sides, but never plant on a bare verge: fall back to the
      // other side (and skip the station outright when both are bare) rather
      // than `continue`, which would stall the alternation on one side.
      let side: 1 | -1 = billboardCounter % 2 === 0 ? 1 : -1;
      if (isBareVergeSide(eb.bareVerge, side)) {
        side = (-side) as 1 | -1;
        if (isBareVergeSide(eb.bareVerge, side)) continue;
      }
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
    // The shelter is parked at the back of the RIGHT-of-travel sidewalk — a
    // bare right verge has no sidewalk to park it on.
    if (isBareVergeSide(eb.bareVerge, 1)) continue;
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
