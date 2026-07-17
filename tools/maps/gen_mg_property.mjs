/**
 * gen_mg_property.mjs — the FORWARD PROPERTY-EXIT micro-map (Scenario Studio,
 * doc 76 §3; doc 72 §10 archetype OV-15 „Включване в движението", the
 * бензиностанция form) → content/world/<districtId>.json (+ byte-identical
 * publish to platform/public/world/).
 *
 * Structurally the gen_pk_driveway.mjs mold (a residential street + a property
 * on one kerb), with the one thing that map deliberately has NOT: the driveway
 * is a REAL EDGE meeting the street at a REAL NODE. That is not decoration —
 * it is the whole reason this district exists (see WHY A NEW MAP below).
 *
 * Layout (x = east, y = north; ORIGIN AT THE EXIT NODE — the gen_t_junction
 * convention, so every scenario number is a plain offset from the mouth):
 *
 *              mgp-n-n (0, northM)
 *                  │
 *                  │  boulevard: PRIMARY, 1 lane per direction.
 *                  │  Northbound (the потокът) rides x = +4.06.
 *                  │
 *      ┌───────────┼──────────────────────────────────────────┐
 *      │        mgp-n-c (0, 0) ═══════════ mgp-e-drive ═══════╪══ mgp-n-fore
 *      │           │       ▲               ▲             ▲    │      (exitM, 0)
 *      └───────────┼───────│───────────────│─────────────│────┘
 *                  │     Б2 line       mgp-x-walk   mgp-spawn-forecourt
 *                  │    (derived,       (walkX, 0)      (exitM−6, +4.06)
 *                  │     x = 27.73)     тротоарът
 *                  │
 *              mgp-n-s (0, −southM)
 *
 * southM is DELIBERATELY the long arm: it is the потокът's run-up. The stream
 * is released by the player's own first metres off the forecourt (the
 * OncomingStreamRunner's releaseKmh latch), so the arc between mgp-n-s and the
 * mouth IS how many seconds pass before the flow reaches the exit — and the
 * whole drill is „изчакай потока". A short arm would land the cars at the
 * mouth while the student is still busy with the тротоар, collapsing the two
 * taught beats into one.
 *
 * WHY A NEW MAP (the backlog's own fallback, taken after the check it asks
 * for): the brief reuses pk-drive-v1 „if its driveway mouth supports a
 * pavement dart path". It does not, and cannot without breaking the live
 * template that owns it. pk-drive-v1 is 2 nodes / 1 edge / 0 crossings /
 * 0 intersections: its „driveway" is a ScenarioSpec OVERLAY (pinned rect +
 * fence colliders — gen_pk_driveway.mjs's own header), not map data, so there
 * is no mouth to cross, no crossing to arm a dart on, no node to adjudicate a
 * give-way at, and no spawn off the carriageway. The one off-street feature is
 * a garage BLOCK sitting exactly where a forecourt would go. Editing the
 * generator would rewrite the committed JSON and break sc-pk-driveway's
 * byte-identical trace gate. So: new district, same mold.
 *
 * WHAT THE MAP GRADES FOR FREE (everything below is DERIVED — no overrides):
 *
 *  1. THE Б2 AT THE MOUTH. The boulevard is `primary` (CLASS_RANK 5) and the
 *     exit is `service` (rank 1), so the runtime's minor-meets-arterial
 *     heuristic (runtime/stoplines.ts source 2) derives a stopSign line on the
 *     exit approach NATURALLY, and the world builder's sign pass paints the
 *     visible Б2 on the same approach (maxRank >= 5 → kind "stop"; the
 *     gen_t_junction.mjs ruling: rank 4 would grade a stop and paint Б1 —
 *     that mismatch is why this map is primary, not secondary). The line is
 *     what makes чл. 25 GRADABLE: crossing it while a conflicting vehicle sits
 *     inside PRIORITY_CONFLICT_RADIUS_M emits prioritySituation "give-way"
 *     violated → FAILED_TO_YIELD, and conflictNearFor excludes only
 *     SAME-DIRECTION traffic — which is exactly чл. 25's „пропусни всички,
 *     които се движат по пътя", from either side.
 *
 *     Its position is DERIVED, not chosen: nodeOpenRadiusM = maxHalf (the
 *     primary's 8.125 travel + 4.0 parking band = 12.125) + the arterial
 *     corner radius 15 = 27.125, + STOP_LINE_BEYOND_CUT_M 0.6 ⇒ sM = 27.73 on
 *     the exit edge (the pe-jay-v1 / sx-v1 number, same arithmetic). The
 *     self-validation below PINS that, because the whole scenario's ordering
 *     hangs on it.
 *
 *  2. THE ТРОТОАР, OUTSIDE THE LINE. mgp-x-walk sits at x = walkX > 27.73 —
 *     the property line, BEYOND the junction mouth. That ordering is the
 *     template's spine and the reason walkX is a validated parameter rather
 *     than a taste: the taught sequence is тротоар → Б2 → платно (пешеходците
 *     първи, чл. 25, ал. 2 — after them the потокът), and it lets the two
 *     mistake demos live on DIFFERENT beats — the pavement demo never reaches
 *     the line (so it can never leak STOP_SIGN_NO_FULL_STOP), the flow demo
 *     clears the pavement first (so it can never leak PEDESTRIAN_*).
 *
 * HONEST GAPS (flagged, not hidden — ADR-002 discipline):
 *  - ВЕЛОАЛЕЯТА IS NOT MAP DATA. DistrictZoneKind has no cycle-lane member
 *    (runtime/district.ts: noStopping | noParking | noOvertaking |
 *    solidCenterLine | busLane | railCrossing | curveAdvisory |
 *    emergencyLane | waterPatch | icePatch) and the world builder paints no
 *    cycle track, so the велоалея named in the card copy is the REAL-WORLD
 *    scene the чл. 25 duty covers — it is taught, never graded. Nothing in
 *    this map or its template pretends otherwise.
 *  - THE CROSSING KIND IS "marked". Legally a тротоар crossing a property
 *    exit is a тротоар, not a пешеходна пътека — the duty is чл. 25, ал. 2,
 *    not чл. 119. "unmarked" would be the truer word but paints nothing, and
 *    a student cannot stop short of a band he cannot see. "marked" renders the
 *    continuation band Bulgarian station exits actually carry; the
 *    CrossingZoneTracker treats every kind identically (it filters on edgeId
 *    only), so the choice is visual, not grading.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_mg_property.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** world/builders/constants.ts — the curbside band on arterial classes, m. */
const PARKING_LANE_WIDTH_M = 4.0;
/** world/builders/constants.ts — JUNCTION_CORNER_RADIUS_ARTERIAL_M. */
const JUNCTION_CORNER_RADIUS_ARTERIAL_M = 15;
/** world/builders/network.ts — STOP_LINE_BEYOND_CUT_M. */
const STOP_LINE_BEYOND_CUT_M = 0.6;
/** world/builders/network.ts — JUNCTION_TRIM_MAX_FRACTION. */
const JUNCTION_TRIM_MAX_FRACTION = 0.45;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/**
 * The runtime's derived Б2 setback on the exit approach, m — the same
 * arithmetic runtime/stoplines.ts runs (mouthSetbackM), reproduced here so the
 * generator can PIN it and refuse to ship a layout whose тротоар would land on
 * the wrong side of it.
 */
function derivedStopLineSetbackM(exitLenM) {
  const primaryHalfM = SCALED_LANE_W + PARKING_LANE_WIDTH_M; // (2 × laneW)/2 + parking
  const openRadiusM = primaryHalfM + JUNCTION_CORNER_RADIUS_ARTERIAL_M;
  const cut = Math.min(openRadiusM, exitLenM * JUNCTION_TRIM_MAX_FRACTION);
  return Math.min(cut + STOP_LINE_BEYOND_CUT_M, exitLenM / 2);
}

/**
 * @param {{
 *   districtId: string,   // output file name + map.districtId
 *   label: string,        // human label (meta)
 *   southM: number,       // boulevard south of the exit node — the потокът's run-up (60..400)
 *   northM: number,       // …and north of it, the run-out (60..400)
 *   exitM: number,        // property-exit edge length, node → forecourt (40..120)
 *   walkX: number,        // x of the тротоар band across the exit (must clear the Б2)
 *   streetKmh: number,    // legal limit on the boulevard (30..90)
 *   exitKmh: number,      // legal limit on the exit lane (10..30)
 * }} params
 */
export function buildMgProperty(params) {
  const errors = [];
  const { districtId, label, southM, northM, exitM, walkX, streetKmh, exitKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(southM >= 60 && southM <= 400)) errors.push(`southM must be within 60..400 m, got ${southM}`);
  if (!(northM >= 60 && northM <= 400)) errors.push(`northM must be within 60..400 m, got ${northM}`);
  if (!(exitM >= 40 && exitM <= 120)) errors.push(`exitM must be within 40..120 m, got ${exitM}`);
  if (!(streetKmh >= 30 && streetKmh <= 90)) errors.push(`streetKmh must be within 30..90, got ${streetKmh}`);
  if (!(exitKmh >= 10 && exitKmh <= 30)) errors.push(`exitKmh must be within 10..30, got ${exitKmh}`);
  if (errors.length === 0) {
    // The ordering law (see the header §2): тротоар OUTSIDE the derived Б2,
    // with room for a car to rest between them, and clear of the forecourt end.
    const lineX = derivedStopLineSetbackM(exitM);
    if (!(walkX >= lineX + 5)) {
      errors.push(`walkX ${walkX} must clear the derived Б2 line (${r2(lineX)}) by >= 5 m — the тротоар is BEFORE the sign`);
    }
    if (!(walkX <= exitM - 20)) {
      errors.push(`walkX ${walkX} leaves < 20 m of forecourt approach (exitM ${exitM})`);
    }
  }
  if (errors.length > 0) throw new Error(`gen_mg_property params invalid:\n  - ${errors.join("\n  - ")}`);

  const laneCenterM = r2(SCALED_LANE_W / 2); // 4.06 — one lane per direction

  // Origin AT the exit node (the gen_t_junction convention).
  const NODES = {
    "mgp-n-s": [0, -southM],
    "mgp-n-c": [0, 0],
    "mgp-n-n": [0, northM],
    "mgp-n-fore": [exitM, 0],
  };

  const edge = (id, from, to, cls, maxspeed, name) => {
    const geometry = [
      [r2(NODES[from][0]), r2(NODES[from][1])],
      [r2(NODES[to][0]), r2(NODES[to][1])],
    ];
    return {
      id,
      from,
      to,
      class: cls,
      name,
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  const EDGES = [
    edge("mgp-e-street-s", "mgp-n-s", "mgp-n-c", "primary", streetKmh, "Булевард — южен подход"),
    edge("mgp-e-street-n", "mgp-n-c", "mgp-n-n", "primary", streetKmh, "Булевард — северен изход"),
    // `service` (rank 1) is what makes the Б2 derive on THIS approach and only
    // this one; it is also excluded from the lane graph (traffic/types.ts
    // excludedRoadClasses), so no ambient or staged actor can ever drive the
    // forecourt exit — which is correct: the exit is the PLAYER's, and the
    // потокът belongs on the boulevard.
    edge("mgp-e-drive", "mgp-n-c", "mgp-n-fore", "service", exitKmh, "Изход от бензиностанция"),
  ];

  const INTERSECTIONS = [{ id: "mgp-n-c", x: 0, y: 0, degree: 3, signalized: false }];

  // The тротоар: the band the pavement (and, in the real scene, the велоалея
  // beside it) carries ACROSS the exit — the single geometric truth the
  // CrossingZoneTracker, the markings builder and the ScenarioSpec all read.
  const CROSSINGS = [
    {
      id: "mgp-x-walk",
      x: r2(walkX),
      y: 0,
      kind: "marked",
      signalized: false,
      edgeId: "mgp-e-drive",
    },
  ];
  const ROUNDABOUTS = [];

  // Spawns. The player's is INSIDE the property, on the exit lane's outbound
  // (northern) half — heading 270 = west, toward the boulevard: driving WEST,
  // the right-hand lane is the NORTH one (perpRight of (−1,0) is (0,+1)).
  const SPAWN_POINTS = [
    {
      id: "mgp-spawn-forecourt",
      x: r2(exitM - 6),
      y: laneCenterM,
      heading: 270,
      edgeId: "mgp-e-drive",
      name: "Изход на бензиностанцията",
    },
    {
      id: "mgp-spawn-finish",
      x: laneCenterM,
      y: r2(northM - 15),
      heading: 0,
      edgeId: "mgp-e-street-n",
      name: "Контролна точка — по булеварда след изхода",
    },
  ];

  // The station canopy + shop, north of the exit lane and clear of both
  // carriageways: it is what makes the exit READ as a property (and what makes
  // the northbound потокът worth looking for — the blind side of a forecourt).
  const BUILDINGS = [
    {
      id: "mgp-b-shop",
      height: 5,
      heightSource: "default",
      footprint: [
        [r2(walkX + 4), 14],
        [r2(exitM + 10), 14],
        [r2(exitM + 10), 34],
        [r2(walkX + 4), 34],
      ],
    },
  ];

  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  // Road bodies + buildings outgrow the centerlines — cover them.
  const halfRoadM = SCALED_LANE_W + PARKING_LANE_WIDTH_M;
  bounds.minX = Math.min(bounds.minX, -halfRoadM - 6);
  bounds.maxX = Math.max(bounds.maxX, halfRoadM + 6);
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-junction",
      generator: "tools/maps/gen_mg_property.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебен изход от имот (бензиностанция) към булевард — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: streetKmh,
        note: "Изход от имот: тротоарът се пресича преди знака Б2, а предимството на булеварда е на движещите се по него (ЗДвП чл. 25).",
      },
      stats: {
        roadKm: r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000),
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
      },
      /**
       * Scenario Studio payload (doc 76): the recipe + the DERIVED truths the
       * ScenarioSpec pins by value and the district battery re-proves against
       * the runtime — the copy in the template must never drift from this file.
       */
      scenario: {
        archetype: "t-junction",
        params: { southM, northM, exitM, walkX, streetKmh, exitKmh },
        junctionNodeId: "mgp-n-c",
        expectedControl: "stopSignOnExit",
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
        /** Outbound (westbound) exit-lane center — the player's whole approach. */
        exitLaneCenterY: laneCenterM,
        /** Arc of the exit node along the потокът's northbound path, m — its
         *  run-up, and therefore the encounter's clock (see the header). */
        streamRunUpM: southM,
        /** Derived Б2 arclength on mgp-e-drive, measured from mgp-n-c. */
        stopLineX: r2(derivedStopLineSetbackM(exitM)),
        primaryCrossingId: "mgp-x-walk",
        crossings: CROSSINGS.map((c) => ({ id: c.id, x: c.x, y: c.y, kind: c.kind })),
      },
    },
    roads: {
      nodes: Object.entries(NODES)
        .map(([id, [x, y]]) => ({ id, x: r2(x), y: r2(y) }))
        .sort((a, b) => (a.id < b.id ? -1 : 1)),
      edges: EDGES,
    },
    intersections: INTERSECTIONS,
    crossings: CROSSINGS,
    roundabouts: ROUNDABOUTS,
    buildings: BUILDINGS,
    spawnPoints: SPAWN_POINTS,
  };

  // -------------------------------------------------------------------------
  // Self-validation (the gen_t_junction / gen_pk_driveway invariants + the two
  // this district's whole scenario hangs on: the Б2 derives, and it derives
  // INSIDE the тротоар).
  // -------------------------------------------------------------------------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const edgeIds = new Set();
  const degree = new Map();
  for (const e of EDGES) {
    if (edgeIds.has(e.id)) post.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== r2(NODES[e.from][0]) || g0[1] !== r2(NODES[e.from][1])) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== r2(NODES[e.to][0]) || gn[1] !== r2(NODES[e.to][1])) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.oneway) post.push(`${e.id}: every edge of this archetype is two-way`);
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
  }

  // Control derivation preconditions (mirrors runtime/stoplines.ts ranks +
  // world/builders/props.ts's sign rank): the Б2 must derive on the EXIT and
  // nowhere else, and it must be painted as Б2, not Б1.
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  const ARTERIAL_MIN_RANK = 4;
  const MINOR_MAX_RANK = 2;
  const atNode = EDGES.filter((e) => e.from === "mgp-n-c" || e.to === "mgp-n-c");
  const ranks = atNode.map((e) => RANK[e.class] ?? 2);
  if (!ranks.some((r) => r >= ARTERIAL_MIN_RANK)) post.push("no arterial at mgp-n-c — the Б2 heuristic would never fire");
  if (Math.max(...ranks) < 5) post.push("the boulevard must be PRIMARY: rank 4 grades a stop line but paints Б1 (props.ts)");
  const minors = atNode.filter((e) => (RANK[e.class] ?? 2) <= MINOR_MAX_RANK);
  if (minors.length !== 1 || minors[0].id !== "mgp-e-drive") {
    post.push(`exactly one minor approach expected (mgp-e-drive), got ${minors.map((e) => e.id).join(", ")}`);
  }

  // THE ORDERING LAW — the тротоар is crossed BEFORE the Б2 (header §2).
  const lineX = derivedStopLineSetbackM(exitM);
  if (!(CROSSINGS[0].x > lineX)) {
    post.push(`тротоарът (x ${CROSSINGS[0].x}) must sit OUTSIDE the derived Б2 line (x ${r2(lineX)})`);
  }
  if (Math.abs(district.meta.scenario.stopLineX - r2(lineX)) > 0.01) post.push("meta.scenario.stopLineX drifted");

  // Crossing + spawns sit on their host edge's carriageway.
  const distToEdge = (host, x, y) => {
    let best = Infinity;
    const g = host.geometry;
    for (let i = 0; i < g.length - 1; i++) {
      const [ax, ay] = g[i];
      const [bx, by] = g[i + 1];
      const abx = bx - ax;
      const aby = by - ay;
      const len2 = abx * abx + aby * aby;
      let t = len2 > 0 ? ((x - ax) * abx + (y - ay) * aby) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (ax + abx * t), y - (ay + aby * t)));
    }
    return best;
  };
  for (const c of CROSSINGS) {
    const host = EDGES.find((e) => e.id === c.edgeId);
    if (!host) post.push(`${c.id}: unknown edgeId ${c.edgeId}`);
    else if (distToEdge(host, c.x, c.y) > 0.01) post.push(`${c.id}: not on its host edge centerline`);
  }
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    else if (distToEdge(host, s.x, s.y) > SCALED_LANE_W) post.push(`${s.id}: not on the carriageway of ${s.edgeId}`);
  }
  // The forecourt spawn must be the NEAREST-edge fix of mgp-e-drive (or the
  // locator would put the player on the boulevard from frame one).
  {
    const s = SPAWN_POINTS[0];
    for (const e of EDGES) {
      if (e.id === "mgp-e-drive") continue;
      if (distToEdge(e, s.x, s.y) <= distToEdge(EDGES.find((x) => x.id === "mgp-e-drive"), s.x, s.y)) {
        post.push(`${s.id}: ${e.id} is at least as near as mgp-e-drive`);
      }
    }
  }
  // Buildings clear of every carriageway (half-width + a 4 m pavement).
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      for (const e of EDGES) {
        if (distToEdge(e, x, y) < SCALED_LANE_W + 4) post.push(`${bl.id}: corner (${x}, ${y}) overlaps ${e.id}`);
      }
    }
  }
  // Routable (non-service) connectivity: one component.
  {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    const routable = EDGES.filter((e) => e.class !== "service");
    for (const e of routable) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const start = routable[0].from;
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const v = queue.pop();
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
    }
    const routableNodes = new Set(routable.flatMap((e) => [e.from, e.to]));
    if (seen.size !== routableNodes.size) post.push("routable network split");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_mg_property self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the sc-merge-from-property micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "mg-property-v1",
    // exitM 68 ⇒ the trim clamp (68 × 0.45 = 30.6) never binds, so the Б2
    // derives at the full open-radius cut: 27.125 + 0.6 = 27.73. walkX 34
    // clears it by 6.3 m — one car length of apron between тротоар and знак.
    // southM 260 is the потокът's run-up (header): at the posted 50 (14 m/s)
    // the flow needs ~18 s to reach the mouth, which is exactly long enough
    // for the тротоар beat to finish first.
    label: "Учебен изход от бензиностанция към булевард (сценарий OV-15)",
    southM: 260,
    northM: 140,
    exitM: 68,
    walkX: 34,
    streetKmh: 50,
    exitKmh: 20,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildMgProperty(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  console.log(`=== mg-property build: ${params.districtId} ===`);
  line("boulevard (S / N of exit)", `${params.southM} m / ${params.northM} m @ ${params.streetKmh} km/h`);
  line("exit lane", `${params.exitM} m @ ${params.exitKmh} km/h (service)`);
  line("тротоар / derived Б2", `x = ${district.crossings[0].x} / x = ${district.meta.scenario.stopLineX}`);
  line("exit lane center (west)", `y = ${district.meta.scenario.exitLaneCenterY}`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
