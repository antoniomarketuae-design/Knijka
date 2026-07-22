/**
 * gen_pe_zone.mjs — the LIVING-ZONE („жилищна зона", Д15/Д16) micro-map
 * (Scenario Studio, doc 76 §3; doc 72 §6 family PE, archetype PE-15) →
 * content/world/<districtId>.json (+ the byte-identical publish to
 * platform/public/world/).
 *
 * tools/maps/gen_zebra_street.mjs's straight-street mold, extended along the
 * two axes PE-15 actually needs and nothing else:
 *
 *   1. A ZONE SEGMENT. The street is split at a degree-2 mid node into a
 *      normal 50 approach and the zone itself, whose own edge posts
 *      `maxspeed: zoneKmh` (20 — the чл. 63 walking-pace-plus cap the content
 *      bank pins: q-speed-026 / q-uyazvimi-042) and carries the additive
 *      `zone: "residential"` legality tag (doc 72 N3 — the tag was already
 *      RESERVED in world/types.ts; this is its first shipped user). Grading
 *      needs no engine change: runtime speedLimitAt reads the segment's own
 *      maxspeed, so a квартална-улица-с-50 blast fires the speeding codes
 *      against 20, not against 50 (the SP-03 / gen_pe_school precedent).
 *
 *   2. AN EXIT MOUTH. The zone ends at a real degree-3 node where a normal
 *      cross street joins from the EAST (the driver's RIGHT) and the street
 *      continues north as an ordinary 50 road. Every arm is rank <= 3, so the
 *      runtime derives ZERO stop lines (stoplines.ts excludes tertiary
 *      meetings deliberately) and the node resolves as an UNCONTROLLED
 *      right-hand-rule junction — see the honest gap below.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     pz-n-end (0, L)                    L = approachM + zoneM + outArmM
 *         │  pz-e-out — ordinary street again, maxspeed 50
 *     pz-n-exit (0, exitY) ──────────── pz-n-e (crossArmM, exitY)
 *         │       the Д16 EXIT MOUTH        pz-e-cross — the street you
 *         │       (degree 3, uncontrolled)  join; its traffic comes from
 *         │  ZONE — maxspeed 20, zone "residential" (pz-e-zone)   your RIGHT
 *         ═  pz-x-1 (0, crossingY)       UNMARKED crossing — see below
 *         │
 *     pz-n-entry (0, approachM)          the Д15 entry: 50 → 20
 *         │  APPROACH — maxspeed 50 (pz-e-approach)
 *     pz-spawn-approach (4.06, 15)
 *         │
 *     pz-n-start (0, 0)
 *
 * WHY THE CROSSING IS `kind: "unmarked"` (the design crux — read before
 * editing). A living zone has NO zebra: чл. 62–63 lets pedestrians use the
 * WHOLE carriageway, so painting a pedestrian pathway here would teach the
 * opposite of the law. But the shipped yield duty grades off crossing events
 * only — PEDESTRIAN_NOT_YIELDED fires from `crossingPassed` with occupancy,
 * and the CrossingZoneTracker derives its zones from `crossings[]` (the
 * sc-hz-emergency-stop finding). `kind: "unmarked"` is exactly the seam:
 * world/builders/markings.ts paints ONLY "marked" | "signals", so this
 * crossing renders as bare asphalt while the runtime still arms the zone and
 * fires the pass event. The result is honest in both directions — the driver
 * sees an ordinary stretch of residential road with people walking on it, and
 * the engine grades the duty those people are owed.
 *
 * TWO HONEST GAPS, both reported, neither faked:
 *  - Д15/Д16 have no SignKind and no GLB in the shipped kit (world/types.ts
 *    SignKind), so the zone has no plate. Its visual anchor is the
 *    residential blocks + the automatic boundary В26-50 posts. Render-only —
 *    grading reads `maxspeed` and the crossing, never a sign placement (the
 *    same call gen_pe_school.mjs made for А19).
 *  - The EXIT DUTY is чл. 25's „включване в движението — пропускаш всички"
 *    (the content bank's q-signs-049). The runtime has no such adjudicator;
 *    the closest shipped one is the right-hand-rule tracker, which grades the
 *    from-the-RIGHT subset of that duty. So the cross street joins from the
 *    EAST — a northbound driver's right — and the modelled subset agrees with
 *    the law instead of contradicting it. The FULL duty is taught and gated by
 *    an objective, never billed by a detector that does not exist (A12).
 *    The class ranks pay a dividend here: props.ts places a Б1 „Пропусни
 *    движещите се" on the minor approach whenever a node's ranks differ and
 *    the top rank is below 5, so the exit mouth gets a REAL give-way plate +
 *    painted line for free (battery-asserted, signs.giveWay === 1). Visible
 *    duty, zero grading — exactly the honest split this map wants.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_pe_zone.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/pe-zone-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Shared constants (must mirror the engine's perceptual scale — contracts.ts)
// ---------------------------------------------------------------------------

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;
/** L4 curb-start convention: half-carriageway + 0.4 curb + 1.2 stand-back. */
const CURB_STANDBACK_M = 1.6;
/** The CrossingZoneTracker's arming radius (runtime/zones.ts). */
const CROSSING_ZONE_M = 35;
/** Minimum speed-only window inside the zone before the crossing zone arms. */
const SPEED_WINDOW_MIN_M = 20;
/** Buildings stand clear of the carriageway AND of the dart's walk-out end. */
const BUILDING_CLEAR_M = 18;
/** Stop-line ranks — mirrors runtime/spatial.ts CLASS_RANK. */
const RANK = { primary: 5, secondary: 4, secondary_link: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };

const r2 = (v) => Math.round(v * 100) / 100;

function segLength(a, b) {
  return r2(Math.hypot(b[0] - a[0], b[1] - a[1]));
}

// ---------------------------------------------------------------------------
// The generator (approach + living zone + exit mouth onto an ordinary street)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,       // output file name + LessonSpec.world.districtId
 *   label: string,            // human label (meta)
 *   approachM: number,        // ordinary street before the Д15 entry (60..400)
 *   zoneCrossingM: number,    // Д15 entry → the walkers' crossing (>= 55)
 *   crossingExitM: number,    // crossing → the Д16 exit mouth (>= 55)
 *   outArmM: number,          // exit mouth → street end, ordinary again (>= 40)
 *   crossArmM: number,        // east arm of the joined street (>= 40)
 *   approachKmh: number,      // ordinary-street limit (40|50|60)
 *   zoneKmh: number,          // living-zone cap (20 — ЗДвП чл. 63)
 * }} params
 */
export function buildPeZoneDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    approachM,
    zoneCrossingM,
    crossingExitM,
    outArmM,
    crossArmM,
    approachKmh,
    zoneKmh,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 60 && approachM <= 400)) errors.push(`approachM must be within 60..400 m, got ${approachM}`);
  if (!(zoneCrossingM >= CROSSING_ZONE_M + SPEED_WINDOW_MIN_M && zoneCrossingM <= 400)) {
    errors.push(
      `zoneCrossingM must be within ${CROSSING_ZONE_M + SPEED_WINDOW_MIN_M}..400 m (the ${CROSSING_ZONE_M} m ` +
        `crossing zone must arm INSIDE the living zone and still leave a >= ${SPEED_WINDOW_MIN_M} m speed-only ` +
        `window), got ${zoneCrossingM}`,
    );
  }
  if (!(crossingExitM >= CROSSING_ZONE_M + 20 && crossingExitM <= 400)) {
    errors.push(
      `crossingExitM must be within ${CROSSING_ZONE_M + 20}..400 m (the crossing zone must NOT reach the exit ` +
        `mouth, or a junction event would land inside the yield encounter), got ${crossingExitM}`,
    );
  }
  if (!(outArmM >= 40 && outArmM <= 300)) errors.push(`outArmM must be within 40..300 m, got ${outArmM}`);
  if (!(crossArmM >= 40 && crossArmM <= 300)) errors.push(`crossArmM must be within 40..300 m, got ${crossArmM}`);
  if (![40, 50, 60].includes(approachKmh)) errors.push(`approachKmh must be 40|50|60, got ${approachKmh}`);
  // 20 is the law (ЗДвП чл. 63 — content bank q-speed-026 / q-uyazvimi-042);
  // the whole template is that number. A different cap is a different lesson.
  if (zoneKmh !== 20) errors.push(`zoneKmh must be 20 (the жилищна-зона archetype — ЗДвП чл. 63), got ${zoneKmh}`);
  if (errors.length > 0) throw new Error(`gen_pe_zone params invalid:\n  - ${errors.join("\n  - ")}`);

  const crossingY = approachM + zoneCrossingM;
  const exitY = crossingY + crossingExitM;
  const totalM = exitY + outArmM;
  const zoneM = zoneCrossingM + crossingExitM;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0
  const curbXWest = r2(-(halfRoadM + CURB_STANDBACK_M));
  const curbXEast = r2(halfRoadM + CURB_STANDBACK_M);

  // -- Nodes / edges. The entry is a degree-2 collinear split (a limit change,
  // never a junction — gen_sp_transition's ruling); the exit is a real T.
  const NODES = {
    "pz-n-start": [0, 0],
    "pz-n-entry": [0, approachM],
    "pz-n-exit": [0, exitY],
    "pz-n-end": [0, totalM],
    "pz-n-e": [crossArmM, exitY],
  };

  const edge = (id, from, to, cls, maxspeed, name, extra) => {
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
      ...(extra ?? {}),
      length: segLength(geometry[0], geometry[1]),
      geometry,
    };
  };

  const EDGES = [
    edge("pz-e-approach", "pz-n-start", "pz-n-entry", "tertiary", approachKmh, "Улица преди жилищната зона"),
    // The zone: its OWN maxspeed is the grading surface; `zone` is the additive
    // legality tag (doc 72 N3) — the reduced limit lives in maxspeed.
    edge("pz-e-zone", "pz-n-entry", "pz-n-exit", "residential", zoneKmh, "Жилищна зона", {
      zone: "residential",
    }),
    edge("pz-e-out", "pz-n-exit", "pz-n-end", "tertiary", approachKmh, "Улицата извън зоната"),
    edge("pz-e-cross", "pz-n-exit", "pz-n-e", "tertiary", approachKmh, "Напречна улица — движението, което пропускаш"),
  ];

  // -- The crossing: `unmarked` on purpose (see the header). Single geometric
  // truth for the CrossingZoneTracker, the lane graph and the ScenarioSpec.
  const CROSSINGS = [
    {
      id: "pz-x-1",
      x: 0,
      y: r2(crossingY),
      kind: "unmarked",
      signalized: false,
      edgeId: "pz-e-zone",
    },
  ];

  // Only the exit mouth is a junction; the Д15 entry is a degree-2 limit change.
  const INTERSECTIONS = [{ id: "pz-n-exit", x: 0, y: r2(exitY), degree: 3, signalized: false }];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "pz-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "pz-e-approach",
      name: "Начало на отсечката — преди жилищната зона",
    },
    {
      id: "pz-spawn-finish",
      x: laneCenterM,
      y: r2(totalM - 15),
      heading: 0,
      edgeId: "pz-e-out",
      name: "Контролна точка — след изхода от зоната",
    },
  ];

  // -- Residential blocks flanking the zone (the зона's visual anchor, since
  // Д15 has no sign asset). Clear of the carriageway, of the dart's walk-out
  // end and of the cross street — enforced below.
  const BUILDINGS = [
    // Approach blocks flanking BOTH curbs BEFORE the entry — so the drive INTO
    // the zone reads as entering a built-up quarter (the sc-speed-creep town
    // context the founder R0 asks for; grading never reads buildings).
    {
      id: "pz-b-west-approach",
      height: 12,
      heightSource: "default",
      footprint: [
        [-36, r2(approachM - 62)],
        [-20, r2(approachM - 62)],
        [-20, r2(approachM - 12)],
        [-36, r2(approachM - 12)],
      ],
    },
    {
      id: "pz-b-east-approach",
      height: 12,
      heightSource: "default",
      footprint: [
        [20, r2(approachM - 58)],
        [36, r2(approachM - 58)],
        [36, r2(approachM - 10)],
        [20, r2(approachM - 10)],
      ],
    },
    {
      id: "pz-b-west",
      height: 12,
      heightSource: "default",
      footprint: [
        [-36, r2(approachM + 15)],
        [-20, r2(approachM + 15)],
        [-20, r2(approachM + 65)],
        [-36, r2(approachM + 65)],
      ],
    },
    // East block flanking the FAULT window (~y128..185) — mirrors pz-b-west so
    // the speeding-fault frame has residential blocks on BOTH sides, not an
    // empty east verge (the R0 „looks like a normal street" defect).
    {
      id: "pz-b-east-fault",
      height: 12,
      heightSource: "default",
      footprint: [
        [20, r2(approachM + 8)],
        [36, r2(approachM + 8)],
        [36, r2(approachM + 65)],
        [20, r2(approachM + 65)],
      ],
    },
    {
      id: "pz-b-east",
      height: 12,
      heightSource: "default",
      footprint: [
        [20, r2(crossingY + 10)],
        [36, r2(crossingY + 10)],
        [36, r2(crossingY + 45)],
        [20, r2(crossingY + 45)],
      ],
    },
  ];

  // -- Bounds + stats.
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  // Road body + buildings can outgrow the centerline bounds — cover them.
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
      mapKind: "scenario-street",
      generator: "tools/maps/gen_pe_zone.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна жилищна зона (Д15/Д16) с изход на обикновена улица — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // Off-road / fallback default — the segments carry their own limits.
        maxspeedUrbanKmh: approachKmh,
        note: "Жилищна зона: ограничението пада от 50 на 20 на входа и важи до изхода; пешеходците ползват цялото платно.",
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
       * Scenario Studio payload (doc 76): the archetype recipe + the pinned
       * truths. The ScenarioSpec copies these BY VALUE and the contract
       * battery asserts the copies match this file.
       */
      scenario: {
        archetype: "zebra-block",
        params: { crossings: 1, signalized: "no", approachM, zoneCrossingM, crossingExitM, zoneKmh },
        primaryCrossingId: "pz-x-1",
        laneCenterRightM: laneCenterM,
        curbXWest,
        curbXEast,
        /** The Д15 entry (50 → 20) and the Д16 exit mouth. */
        zoneEntryY: approachM,
        zoneExitY: r2(exitY),
        crossingY: r2(crossingY),
        /** The uncontrolled T the exit duty is demonstrated at. */
        exitJunctionNodeId: "pz-n-exit",
        expectedExitControl: "rightHandRule",
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
  // Self-validation (gen_pe_school's invariants + the zone/exit-mouth ones)
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
    if (Math.abs(segLength(g0, gn) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: every street here is a two-way 1+1 (lanes 2)`);
  }
  // The Д15 entry joins exactly the two collinear segments — a limit change,
  // not an intersection; the exit mouth is the map's ONLY junction.
  if ((degree.get("pz-n-entry") ?? 0) !== 2) post.push(`pz-n-entry must join both street segments (degree 2)`);
  if ((degree.get("pz-n-exit") ?? 0) !== 3) post.push(`pz-n-exit must be the T mouth (degree 3)`);
  for (const leaf of ["pz-n-start", "pz-n-end", "pz-n-e"]) {
    if ((degree.get(leaf) ?? 0) !== 1) post.push(`${leaf}: arm end must be a leaf (degree 1)`);
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
    const n = NODES[it.id];
    if (!n || r2(n[0]) !== it.x || r2(n[1]) !== it.y) post.push(`${it.id}: intersection position != node position`);
  }
  // NO arterial arm exists → runtime/stoplines.ts derives no stop line at the
  // exit mouth, and the node resolves as an uncontrolled RHR junction. An
  // arterial cross street would make the exit a Б2 full stop — a different
  // (and legally wrong) lesson.
  if (Math.max(...EDGES.map((e) => RANK[e.class] ?? 2)) >= 4) {
    post.push(`an arterial-class edge exists — the stop-sign heuristic would derive a Б2 line at the exit mouth`);
  }
  // The zone is the SLOW segment and carries the residential legality tag.
  const zoneEdge = EDGES.find((e) => e.id === "pz-e-zone");
  if (zoneEdge.maxspeed !== zoneKmh) post.push(`pz-e-zone must post ${zoneKmh}`);
  if (zoneEdge.zone !== "residential") post.push(`pz-e-zone must carry the residential legality tag`);
  if (Math.abs(zoneEdge.length - zoneM) > 0.01) post.push(`pz-e-zone length != approachM..exit span`);
  for (const id of ["pz-e-approach", "pz-e-out", "pz-e-cross"]) {
    const e = EDGES.find((x) => x.id === id);
    if (e.maxspeed <= zoneKmh) post.push(`${id}: the ordinary streets must be FASTER than the zone`);
    if (e.zone !== undefined) post.push(`${id}: only the zone segment carries a zone tag`);
  }
  const onStreet = (x, y) => Math.abs(x) <= halfRoadM && y >= -0.01 && y <= totalM + 0.01;
  const onCross = (x, y) => Math.abs(y - exitY) <= halfRoadM && x >= -0.01 && x <= crossArmM + 0.01;
  for (const s of SPAWN_POINTS) {
    if (!EDGES.some((e) => e.id === s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (!onStreet(s.x, s.y)) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  // The crossing must sit ON the centerline, INSIDE the zone, with the whole
  // ~35 m crossing zone armed inside it (so the speed-only window is real),
  // and far enough from the exit mouth that the two encounters never overlap.
  for (const c of CROSSINGS) {
    if (c.x !== 0) post.push(`${c.id}: crossing off the centerline (x=${c.x})`);
    if (c.edgeId !== "pz-e-zone") post.push(`${c.id}: the crossing must host on the ZONE edge`);
    // The зона has no zebra (чл. 62–63: the whole carriageway is shared) —
    // a painted crossing here would teach the opposite of the law.
    if (c.kind !== "unmarked") post.push(`${c.id}: a living zone has no painted crossing — kind must be "unmarked"`);
    if (c.signalized !== false) post.push(`${c.id}: the living zone has no signals`);
    if (c.y - approachM < CROSSING_ZONE_M + SPEED_WINDOW_MIN_M) {
      post.push(
        `${c.id}: needs >= ${CROSSING_ZONE_M + SPEED_WINDOW_MIN_M} m of zone before it (the ${CROSSING_ZONE_M} m ` +
          `crossing zone must arm inside the zone, leaving a speed-only window)`,
      );
    }
    if (exitY - c.y < CROSSING_ZONE_M + 20) {
      post.push(`${c.id}: needs >= ${CROSSING_ZONE_M + 20} m between it and the exit mouth`);
    }
  }
  // The curbs the walkers step off must be OFF the carriageway (they are the
  // dart's stand-back points, never obstacles).
  if (Math.abs(curbXWest) <= halfRoadM || Math.abs(curbXEast) <= halfRoadM) {
    post.push(`the curb stand-backs must sit off the ${r2(halfRoadM * 2)} m carriageway`);
  }
  // Buildings clear the street corridor, the dart's walk-out end AND the
  // cross street's own corridor.
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) < BUILDING_CLEAR_M) post.push(`${bl.id}: footprint vertex (${x}, ${y}) intrudes on the street corridor / walk-out`);
      if (onCross(x, y)) post.push(`${bl.id}: footprint vertex (${x}, ${y}) sits on the cross street`);
      if (Math.abs(y - exitY) <= halfRoadM + 4 && x > 0) post.push(`${bl.id}: footprint vertex (${x}, ${y}) crowds the cross street`);
    }
  }
  // Routable (non-service) connectivity: one component.
  {
    const adj = new Map();
    const link = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    for (const e of EDGES) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    const seen = new Set(["pz-n-start"]);
    const queue = ["pz-n-start"];
    while (queue.length) {
      const v = queue.pop();
      for (const w of adj.get(v) ?? []) if (!seen.has(w)) (seen.add(w), queue.push(w));
    }
    if (seen.size !== nodeIds.size) post.push("routable network split");
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_pe_zone self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (sc-pe-zone-living — „Жилищна зона")
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "pe-zone-v1",
    label: "Учебна жилищна зона (Д15/Д16) с изход на обикновена улица (сценарий PE-15)",
    approachM: 120,
    // 95 = the 35 m crossing zone + a 60 m speed-only window (the „квартална
    // улица с 50" demo's clean stretch — see the trace script's header).
    zoneCrossingM: 95,
    crossingExitM: 70,
    outArmM: 80,
    crossArmM: 70,
    approachKmh: 50,
    zoneKmh: 20,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildPeZoneDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const s = district.meta.scenario;
  console.log(`=== pe-zone build: ${params.districtId} ===`);
  line("approach / zone / out", `${params.approachM} m @ ${params.approachKmh} → ${params.zoneCrossingM + params.crossingExitM} m @ ${params.zoneKmh} → ${params.outArmM} m @ ${params.approachKmh}`);
  line("Д15 entry / Д16 exit", `y = ${s.zoneEntryY} / y = ${s.zoneExitY}`);
  line("crossing (unmarked)", district.crossings.map((c) => `${c.id}@y=${c.y} (${c.kind})`).join(", "));
  line("speed-only window", `y ${params.approachM}..${s.crossingY - 35} (before the crossing zone arms)`);
  line("exit mouth", `${s.exitJunctionNodeId} degree ${district.intersections[0].degree} → ${s.expectedExitControl}`);
  line("curbs (W / E)", `${s.curbXWest} / ${s.curbXEast}`);
  line("street length", `${district.roads.edges.filter((e) => e.id !== "pz-e-cross").reduce((a, e) => a + e.length, 0)} m`);
  line("spawns", district.spawnPoints.map((p) => p.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
