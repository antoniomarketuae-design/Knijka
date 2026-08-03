/**
 * gen_sp_transition.mjs — the SPEED-ZONE TRANSITION micro-map (Scenario Studio,
 * doc 76 §3; doc 72 §8 archetype SP-03 „Преходът на зони / Zone-transition
 * blindness (50→30)") → content/world/<districtId>.json (+ byte-identical
 * publish to platform/public/world/).
 *
 * A single straight two-way street built from TWO collinear edges that meet at
 * a mid-block node, so the posted limit DROPS mid-route: a 50 km/h APPROACH
 * segment, then a 30 km/h ZONE segment (school / residential). This exercises
 * the runtime's PER-EDGE speed-limit surface (runtime/worldRuntime.ts
 * speedLimitAt → edgeRt.edge.maxspeed): the rule engine grades the driver's
 * speed against the LOCAL segment's limit, so keeping the boulevard speed past
 * the transition sign fires the speeding codes against 30, NOT against 50.
 *
 * The mid node is a plain degree-2 vertex (both edges residential class rank 2,
 * no arterial) → the stop-sign heuristic (rank ≥ 4 vs ≤ 2) derives NO stop line
 * and no junction tracker there; it is a limit change, not an intersection. The
 * zone edge carries the additive `zone: "school"` legality tag (district.ts
 * EdgeZone) as surface context; the REDUCED limit itself lives in `maxspeed`.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     sp-tr-n-end (0, L)                 L = approachM + zoneM
 *         │  ZONE segment — maxspeed 30 (sp-tr-e-zone)
 *     sp-tr-n-mid (0, approachM)  ← the В26 „Зона 30" transition sign
 *         │  APPROACH segment — maxspeed 50 (sp-tr-e-approach)
 *     sp-tr-spawn-approach (4.06, 15)
 *         │
 *     sp-tr-n-start (0, 0)
 *
 * No signals, stop lines, junctions or crossings; ambient traffic ZERO by every
 * drive (seed 7): the ONLY gradable fault is the driver's own speed against the
 * segment-local limit. Deterministic: same params → byte-identical JSON.
 * Run:  node tools/maps/gen_sp_transition.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/sp-transition-district.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** constants.PARKING_LANE_WIDTH_M — the curbside band, per side, m. */
const PARKING_LANE_WIDTH_M = 4.0;
/** constants.SIDEWALK_SKIRT_M + SIDEWALK_WIDTH_M — kerb to the pavement's back. */
const PAVEMENT_DEPTH_M = 0.35 + 3.5;

const r2 = (v) => Math.round(v * 100) / 100;

function segLength(a, b) {
  return r2(Math.hypot(b[0] - a[0], b[1] - a[1]));
}

// ---------------------------------------------------------------------------
// Frontages (doc 87 B63) — WHY THIS FILE GREW A SECOND AXIS
// ---------------------------------------------------------------------------

/**
 * HIS SENTENCE, on catalog 33 against catalog 36: „absolutely same as 31, no
 * difference at all". The re-look put the two spawn frames side by side and
 * confirmed it in pixels: „same building line left, same street tree, same
 * billboard at the same screen coordinates, same parked row right, same sky,
 * same road width, same spawn pose. They diverge only in length."
 *
 * He was right, and the generator is why: it took SIX numbers, four of which
 * were speeds and lengths, and emitted the same frontage recipe — inner face at
 * `halfRoad + 8`, 22 m deep, 46 m pitch, alternating sides, one heights array —
 * for both instances. Two lessons, one picture.
 *
 * A frontage is therefore now named per instance, and it moves the four things
 * a driver reads through the windscreen in the first second: how FAR BACK the
 * buildings stand (which is what makes a street feel fast or tight), how DENSE
 * the row is, how TALL it is, and what stands at the far end. Combined with
 * `parkingBand` — which decides whether there is a parked row at the kerb at
 * all, and therefore how wide the asphalt is — the two maps no longer share a
 * cross-section OR a skyline.
 *
 * `build(ctx)` gets `{ halfRoadM, approachM, zoneM, totalM, kerbM, clearX }`
 * where `kerbM` is the real kerb (travel lanes + whatever band this street
 * carries) and `clearX` is the nearest x a volume may occupy. Post-validated.
 */
const FRONTAGES = {
  /**
   * SP-03 „Преходът на зони": a TIGHT terrace, hard up against the pavement on
   * both sides, with a continuous street wall on the west. This is the street a
   * зона 30 is actually posted on — you cannot see past the parked row, the
   * doors open onto the pavement, and the buildings are close enough to read
   * the ground floors. The 30 is obvious from the seat.
   */
  "tight-terrace": {
    noteBg:
      "Плътна улична стена от двете страни, залепена за тротоара, и паркирана редица покрай бордюра: тук 30 не е каприз на знака — оттам, където си, просто не виждаш нищо зад колите.",
    build: (ctx) => {
      const out = [];
      const xi = r2(ctx.clearX);
      const xo = r2(ctx.clearX + 15);
      // West: ONE continuous terrace up the whole approach — a street wall.
      out.push({
        id: "sp-tr-b-terrace-w",
        height: 16,
        heightSource: "default",
        footprint: [
          [r2(-xo), 26],
          [r2(-xi), 26],
          [r2(-xi), r2(ctx.approachM - 18)],
          [r2(-xo), r2(ctx.approachM - 18)],
        ],
      });
      // East: a broken row of narrow shop-fronts (short pitch, low).
      const heights = [8, 11, 9, 12, 10, 9, 13, 10];
      let i = 0;
      for (let cy = 34; cy <= ctx.approachM - 22; cy += 30, i++) {
        out.push({
          id: `sp-tr-b-approach-${i}`,
          height: heights[i % heights.length],
          heightSource: "default",
          footprint: [
            [xi, r2(cy - 11)],
            [xo, r2(cy - 11)],
            [xo, r2(cy + 11)],
            [xi, r2(cy + 11)],
          ],
        });
      }
      // The zone segment keeps its school, and the street ENDS in a slab.
      out.push({
        id: "sp-tr-b-endslab",
        height: 18,
        heightSource: "default",
        footprint: [
          [-34, r2(ctx.totalM + 16)],
          [34, r2(ctx.totalM + 16)],
          [34, r2(ctx.totalM + 50)],
          [-34, r2(ctx.totalM + 50)],
        ],
      });
      return out;
    },
  },
  /**
   * SP-01/SP-03 „Пълзящо превишаване": the OPPOSITE street, and the opposite
   * for a reason. The needle creeps because nothing tells you it should not:
   * panel blocks set 28 m back behind green, wide gaps between them, no parked
   * row at the kerb at all. It is a road that FEELS like 70 and is posted 50 —
   * which is the whole lesson, and it is now built into the map instead of
   * being asserted by the copy.
   */
  "setback-panel-blocks": {
    noteBg:
      "Панелни блокове, отдръпнати на близо тридесет метра зад зеленина, широки междублокови процепи и НУЛА паркирани коли на бордюра: улицата изглежда като седемдесет и е ограничена на петдесет. Точно затова стрелката пълзи сама.",
    build: (ctx) => {
      const out = [];
      const xi = r2(Math.max(ctx.clearX, ctx.kerbM + 20));
      const xo = r2(xi + 24);
      // Tall slabs, LONG pitch, alternating — big holes of sky between them.
      const heights = [24, 27, 22, 26, 23];
      let i = 0;
      for (let cy = 60; cy <= ctx.approachM - 40; cy += 96, i++) {
        const s = i % 2 === 0 ? 1 : -1;
        const yA = r2(cy - 26);
        const yB = r2(cy + 26);
        out.push({
          id: `sp-tr-b-approach-${i}`,
          height: heights[i % heights.length],
          heightSource: "default",
          footprint:
            s > 0
              ? [[xi, yA], [xo, yA], [xo, yB], [xi, yB]]
              : [[r2(-xo), yA], [r2(-xi), yA], [r2(-xi), yB], [r2(-xo), yB]],
        });
      }
      // The far end opens onto a low park wall, not a building: a horizon LINE.
      out.push({
        id: "sp-tr-b-parkwall",
        height: 2.4,
        heightSource: "default",
        footprint: [
          [-60, r2(ctx.totalM + 44)],
          [60, r2(ctx.totalM + 44)],
          [60, r2(ctx.totalM + 47.6)],
          [-60, r2(ctx.totalM + 47.6)],
        ],
      });
      return out;
    },
  },
};

/**
 * @param {{
 *   districtId: string,      // output file name + map.districtId
 *   label: string,           // human label (meta)
 *   approachM: number,       // length of the 50 km/h approach (120..600)
 *   zoneM: number,           // length of the 30 km/h zone (120..600)
 *   approachKmh: number,     // approach limit (must be > zoneKmh; 40|50|60)
 *   zoneKmh: number,         // zone limit (30)
 * }} params
 */
export function buildSpTransitionStreet(params) {
  const errors = [];
  const { districtId, label, approachM, zoneM, approachKmh, zoneKmh, frontage, parkingBand } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(approachM >= 120 && approachM <= 600)) errors.push(`approachM must be within 120..600 m, got ${approachM}`);
  if (!(zoneM >= 120 && zoneM <= 600)) errors.push(`zoneM must be within 120..600 m, got ${zoneM}`);
  if (![40, 50, 60].includes(approachKmh)) errors.push(`approachKmh must be 40|50|60, got ${approachKmh}`);
  if (zoneKmh !== 30) errors.push(`zoneKmh must be 30 (the зона 30 archetype), got ${zoneKmh}`);
  if (approachKmh <= zoneKmh) errors.push(`approachKmh (${approachKmh}) must exceed zoneKmh (${zoneKmh})`);
  if (!FRONTAGES[frontage]) {
    errors.push(
      `frontage "${frontage}" unknown — pick one of ${Object.keys(FRONTAGES).join(", ")} ` +
        `(doc 87 B63: two instances sharing a frontage open on the SAME PICTURE, which is ` +
        `exactly what the founder photographed side by side for catalog 33 and 36)`,
    );
  }
  if (typeof parkingBand !== "boolean") {
    errors.push(
      `parkingBand must be an explicit boolean (FR-21): true = draw the 4 m kerbside band so ` +
        `the procedural row stands on ASPHALT, false = this street has no kerbside parking and ` +
        `the row is not placed at all. Absent used to mean "residential ⇒ no band, row on the ` +
        `pavement", which is the defect.`,
    );
  }
  if (errors.length > 0) throw new Error(`gen_sp_transition params invalid:\n  - ${errors.join("\n  - ")}`);

  const totalM = approachM + zoneM;
  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  const NODES = {
    "sp-tr-n-start": [0, 0],
    "sp-tr-n-mid": [0, approachM],
    "sp-tr-n-end": [0, totalM],
  };
  const approachGeom = [
    [0, 0],
    [0, approachM],
  ];
  const zoneGeom = [
    [0, approachM],
    [0, totalM],
  ];
  const EDGES = [
    {
      id: "sp-tr-e-approach",
      from: "sp-tr-n-start",
      to: "sp-tr-n-mid",
      class: "residential",
      name: "Права улица — подход преди зоната",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: approachKmh,
      maxspeedSource: "tag",
      parkingBand,
      length: segLength(approachGeom[0], approachGeom[1]),
      geometry: approachGeom,
    },
    {
      id: "sp-tr-e-zone",
      from: "sp-tr-n-mid",
      to: "sp-tr-n-end",
      class: "residential",
      name: "Права улица — зона 30 (училище/жилищна)",
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: zoneKmh,
      maxspeedSource: "tag",
      // Additive legality tag (doc 72 N3) — the reduced limit is in `maxspeed`.
      zone: "school",
      parkingBand,
      length: segLength(zoneGeom[0], zoneGeom[1]),
      geometry: zoneGeom,
    },
  ];

  const INTERSECTIONS = []; // the mid node is a degree-2 limit change, not a junction
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "sp-tr-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "sp-tr-e-approach",
      name: "Начало на отсечката — преди зоната",
    },
    {
      id: "sp-tr-spawn-zone",
      x: laneCenterM,
      y: r2(approachM + 20),
      heading: 0,
      edgeId: "sp-tr-e-zone",
      name: "Контролна точка — в зоната",
    },
  ];

  // FR-21 (the car half) + B63: the kerb is the travel lanes PLUS whatever
  // curbside band this street declares, and the frontage stands back from THAT.
  // `parkingBand: true` moves the kerb out 4 m from under the procedurally
  // parked row — the bodies do not move, the pavement does — so the row that
  // used to stand in the middle of the footway now stands on asphalt.
  const bandM = parkingBand ? PARKING_LANE_WIDTH_M : 0;
  const kerbM = r2(halfRoadM + bandM);
  const clearX = r2(kerbM + PAVEMENT_DEPTH_M + 0.5);
  const recipe = FRONTAGES[frontage];

  const BUILDINGS = [
    {
      // A school block flanking the zone segment (west side, clear of the road).
      id: "sp-tr-b-school",
      height: 9,
      heightSource: "default",
      footprint: [
        [r2(-(clearX + 14)), r2(approachM + 40)],
        [r2(-clearX), r2(approachM + 40)],
        [r2(-clearX), r2(approachM + 70)],
        [r2(-(clearX + 14)), r2(approachM + 70)],
      ],
    },
    ...recipe.build({ halfRoadM, approachM, zoneM, totalM, kerbM, clearX }),
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
  bounds.minX = Math.min(bounds.minX, -kerbM - 6);
  bounds.maxX = Math.max(bounds.maxX, kerbM + 6);
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
      generator: "tools/maps/gen_sp_transition.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с преход 50→30 (зона 30) — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // Off-road / fallback default — the segments carry their own limits.
        maxspeedUrbanKmh: approachKmh,
        note: "Преход на зони: ограничението пада от 50 на 30 на средния възел (знак В26 „Зона 30“).",
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
      scenario: {
        // MapArchetype vocabulary: a straight two-way street (two segments).
        archetype: "straight-street",
        params: { approachM, zoneM, approachKmh, zoneKmh },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
        transitionY: approachM,
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

  // Self-validation (mirrors gen_sp_speed invariants; TWO edges here).
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  const degree = new Map();
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    degree.set(e.from, (degree.get(e.from) ?? 0) + 1);
    degree.set(e.to, (degree.get(e.to) ?? 0) + 1);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(segLength(g0, gn) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: each segment is a two-way 1+1 street (lanes 2)`);
  }
  // The mid node must join exactly the two segments (degree 2 = collinear split).
  if ((degree.get("sp-tr-n-mid") ?? 0) !== 2) post.push(`sp-tr-n-mid must join both segments (degree 2)`);
  // No arterial edge exists → the runtime derives no stop line at the mid node.
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  if (Math.max(...EDGES.map((e) => RANK[e.class] ?? 2)) >= 4) post.push(`an arterial edge would derive a stop line at the mid node`);
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > totalM ? y - totalM : 0);
  for (const s of SPAWN_POINTS) {
    if (!EDGES.some((e) => e.id === s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_sp_transition self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instances (the SP-03 50→30 transition micro-map + the founder-P5
// long creep road — doc 62 #30: „a LONG road: sign 50 → hold under 50 → sign
// 30 → drop to 30. Signed, staged, failable — not an empty cap.")
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "sp-trans-v1",
    label: "Учебна улица — преход 50→30, зона 30 (сценарий SP-03)",
    approachM: 160,
    zoneM: 200,
    approachKmh: 50,
    zoneKmh: 30,
    // doc 87 B63: the TIGHT street, 24.25 m curb to curb with a parked row on
    // the asphalt — the picture a зона 30 belongs to.
    frontage: "tight-terrace",
    parkingBand: true,
  },
  {
    // sc-speed-creep's P5 redesign host (doc 62 #30/P5): the same two-segment
    // shape, stretched LONG — 400 m of 50 where the needle creeps up, then
    // 280 m of zone 30 where the carried speed becomes the graded fault. The
    // В26-50 plate derives at the entry (props.ts district-entry pass) and the
    // zone edge's tagged 30 paints the road numerals (markings.ts speed
    // glyphs), so both caps are VISIBLE world truth, not copy.
    districtId: "sp-creep2-v1",
    label: "Учебна дълга улица — пълзящо превишаване 50→30 (сценарий SP-01/SP-03, док. 62 P5)",
    approachM: 400,
    zoneM: 280,
    approachKmh: 50,
    zoneKmh: 30,
    // doc 87 B63: the OPEN street, 16.25 m curb to curb and NOT ONE parked car
    // — the road that feels like 70 and is posted 50, which is the lesson.
    frontage: "setback-panel-blocks",
    parkingBand: false,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildSpTransitionStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  console.log(`=== sp-transition build: ${params.districtId} ===`);
  line("approach / zone", `${params.approachM} m @ ${params.approachKmh} → ${params.zoneM} m @ ${params.zoneKmh}`);
  line("transition Y", `${district.meta.scenario.transitionY} m`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
