/**
 * gen_vu_child.mjs — the CHILD-CYCLIST scenario micro-map (doc 72 §7 „Family VU",
 * archetypes VU-03 „Колелото завива около дупка" + VU-02 „Тясно изпреварване на
 * колело") → content/world/vu-child-v1.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * The gen_vu_cyclist.mjs mold (params → validate → build → self-validate →
 * two identical writes), but the LAYOUT is the gen_vu_streets „pass" bones: a
 * жилищна улица, not a junction. sc-vu-child-cyclist needs a canvas where the
 * ONLY gradeable act is the lateral clearance the driver sets past a child who
 * does not hold his line, so the street carries nothing else at all:
 *
 *   vuc-n-start (0,0) ──────────── 300 m, 1+1, residential, 30 km/h ──────────► vuc-n-end (0,300)
 *                                   │
 *                       lane center x = 4.06 (northbound, the driver)
 *                       curb line   x = 6.66 (the child, hold y = 45)
 *                       WOBBLE      x 6.66 → 4.66 over y 100 → 106.5
 *
 * WHY EVERY OMISSION IS LOAD-BEARING (the vu-pass-v1 precedent, restated
 * because this map must satisfy the SAME three runtime laws):
 *  - NO intersections: the runtime's vulnerable-pass tracker DISCARDS its
 *    episode inside a junction area (worldRuntime `nearestIx` gate), so a
 *    junction would carve dead zones out of the pass corridor.
 *  - NO zones: no М1 span exists ⇒ CROSSED_SOLID_LINE cannot arm ⇒ the taught
 *    wide line (which genuinely crosses the crown) is FREE.
 *  - residential class only ⇒ rank 2 ⇒ the runtime derives ZERO stop lines.
 *  - Straight geometry: the tracker measures the cyclist's drift against the
 *    line it FROZE at arm, and curved-road drift stands the episode down. A
 *    bend anywhere on this street would silently un-grade the whole template.
 *
 * THE WOBBLE (meta.scenario.wobble + meta.scenario.childPath) — the map's own
 * design record and the single truth templates-vru2.ts denormalizes. The arc is
 * authored HERE, in district space, because it is map design (where on the
 * street the drain is), not actor tuning; the template's staged laneShift pulse
 * is pinned to it and the district battery asserts the two agree to the
 * centimetre. Its shape is fixed by the runtime it must survive:
 *  - amplitude 2.0 m: far past VULNERABLE_PASS_SWERVE_M (0.6) — a REAL swerve,
 *    which is why the drives must let it finish BEFORE they commit to a pass;
 *  - apex x = 4.66: 0.6 m east of the lane center, i.e. the child ends up IN
 *    the driver's lane. That is the whole лекция — the margin is budgeted for
 *    where the child GOES, never for where he started;
 *  - trigger y = 100: mid-block, 100 m past the spawn (room to read the child
 *    and hang back) and 200 m short of the end (room for one honest pass).
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_vu_child.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/vu-child-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × the textbook BG lane — the DRAWN lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/**
 * @param {{
 *   districtId: string,        // output file name + ScenarioSpec.map.districtId
 *   label: string,             // human label (meta)
 *   idPrefix: string,          // node/edge/spawn id prefix ("vuc")
 *   lengthM: number,           // street length (200..600)
 *   maxspeedKmh: number,       // legal limit (30..50 — a residential street)
 *   childCurbOffsetM: number,  // the child's line, right of the lane center (1..3.4)
 *   wobble: {                  // the authored mid-block swerve-out (VU-03)
 *     triggerYM: number,       //   district y at which the child swings out
 *     triggerRadiusM: number,  //   trigger tolerance around it, m
 *     amplitudeM: number,      //   lateral travel toward the crown, m (> 0)
 *     arcM: number,            //   forward travel the swerve takes, m
 *   },
 *   noteBg: string,
 * }} params
 */
export function buildVuChildDistrict(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, childCurbOffsetM, wobble, noteBg } =
    params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 600)) errors.push(`lengthM must be within 200..600 m, got ${lengthM}`);
  if (![30, 40, 50].includes(maxspeedKmh)) errors.push(`maxspeedKmh must be 30|40|50, got ${maxspeedKmh}`);
  if (!(childCurbOffsetM >= 1 && childCurbOffsetM <= 3.4)) {
    errors.push(`childCurbOffsetM must be within 1..3.4 m, got ${childCurbOffsetM}`);
  }
  if (!wobble) errors.push(`wobble is required`);
  else {
    if (!(wobble.triggerYM >= 60 && wobble.triggerYM <= lengthM - 120)) {
      errors.push(`wobble.triggerYM must leave 60 m of read-up and 120 m of pass room, got ${wobble.triggerYM}`);
    }
    if (!(wobble.triggerRadiusM > 0 && wobble.triggerRadiusM <= 5)) {
      errors.push(`wobble.triggerRadiusM must be within (0, 5] m, got ${wobble.triggerRadiusM}`);
    }
    if (!(wobble.amplitudeM > 0)) errors.push(`wobble.amplitudeM must be > 0, got ${wobble.amplitudeM}`);
    if (!(wobble.arcM > 0)) errors.push(`wobble.arcM must be > 0, got ${wobble.arcM}`);
  }
  if (errors.length > 0) throw new Error(`gen_vu_child params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 street — the northbound right lane
  // (laneId 0) centers half a DRAWN lane east of the centerline.
  const lanesPerDir = 1;
  const laneRightM = r2(0.5 * SCALED_LANE_W); // 4.06
  const halfRoadM = lanesPerDir * SCALED_LANE_W; // 8.125

  // The child's two lines. Published ROUNDED (the L7 copy truth the template
  // denormalizes); the traffic system's own offset math is what the battery
  // compares real staged poses against.
  const curbXM = r2(0.5 * SCALED_LANE_W + childCurbOffsetM); // 6.66
  const apexXM = r2(0.5 * SCALED_LANE_W + childCurbOffsetM - wobble.amplitudeM); // 4.66

  const edgeId = `${idPrefix}-e-street`;
  const NODES = {
    [`${idPrefix}-n-start`]: [0, 0],
    [`${idPrefix}-n-end`]: [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: edgeId,
      from: `${idPrefix}-n-start`,
      to: `${idPrefix}-n-end`,
      class: "residential",
      name: label,
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed: maxspeedKmh,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    },
  ];

  const INTERSECTIONS = [];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];
  const ZONES = [];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — дясна лента",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — край на отсечката",
    },
  ];

  // Two visual anchors west of the street — a residential street reads as one
  // only if something lines it. Both clear of the carriageway + sidewalk.
  const BUILDINGS = [1, 2].map((n) => ({
    id: `${idPrefix}-b-block-${n}`,
    height: 8,
    heightSource: "default",
    footprint: [
      [r2(-(halfRoadM + 22)), r2(wobble.triggerYM - 70 + (n - 1) * 90)],
      [r2(-(halfRoadM + 8)), r2(wobble.triggerYM - 70 + (n - 1) * 90)],
      [r2(-(halfRoadM + 8)), r2(wobble.triggerYM - 30 + (n - 1) * 90)],
      [r2(-(halfRoadM + 22)), r2(wobble.triggerYM - 30 + (n - 1) * 90)],
    ],
  }));

  const bounds = {
    minX: r2(-(halfRoadM + 28)),
    minY: -6,
    maxX: r2(halfRoadM + 6),
    maxY: r2(lengthM + 6),
  };

  /**
   * THE CHILD'S DESIGNED LINE, district space — the curb line, the authored
   * mid-block swerve-out toward the crown, and the line he holds afterwards.
   * The template's staged actor reproduces this exactly (a constant curb offset
   * + one laneShift pulse fired at `wobble.triggerYM`); this polyline is the
   * DESIGN, and the battery asserts the actor lands on it.
   */
  const childPath = [
    [curbXM, 0],
    [curbXM, r2(wobble.triggerYM)],
    [apexXM, r2(wobble.triggerYM + wobble.arcM)],
    [apexXM, r2(lengthM)],
  ];

  const scenario = {
    archetype: "straight-street",
    params: { lengthM, maxspeedKmh, variant: "child" },
    lanesPerDirection: lanesPerDir,
    laneCenterRightM: laneRightM,
    wobble: {
      curbXM,
      apexXM,
      amplitudeM: r2(wobble.amplitudeM),
      triggerYM: r2(wobble.triggerYM),
      triggerRadiusM: r2(wobble.triggerRadiusM),
      arcM: r2(wobble.arcM),
    },
    childPath,
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-vru",
      generator: "tools/maps/gen_vu_child.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна жилищна улица с дете на велосипед — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: noteBg,
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
      scenario,
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

  // -- Self-validation (the gen_vu_streets invariants + the VU-03 laws) -------
  const post = [];
  const nodeIds = new Set(Object.keys(NODES));
  for (const e of EDGES) {
    if (!nodeIds.has(e.from)) post.push(`${e.id}: unknown from ${e.from}`);
    if (!nodeIds.has(e.to)) post.push(`${e.id}: unknown to ${e.to}`);
    const g0 = e.geometry[0];
    const gn = e.geometry[e.geometry.length - 1];
    if (g0[0] !== NODES[e.from][0] || g0[1] !== NODES[e.from][1]) post.push(`${e.id}: geometry[0] != from node`);
    if (gn[0] !== NODES[e.to][0] || gn[1] !== NODES[e.to][1]) post.push(`${e.id}: geometry[-1] != to node`);
    if (Math.abs(polylineLength(e.geometry) - e.length) > 0.01) post.push(`${e.id}: length mismatch`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: 1+1 two-way street expected`);
    if (e.class !== "residential") post.push(`${e.id}: residential class expected (no derived stop lines)`);
    // The tracker freezes the cyclist's line at arm and stands the episode down
    // on drift: a bend would read as a phantom swerve and un-grade the drill.
    if (e.geometry.length !== 2 || e.geometry[0][0] !== 0 || e.geometry[1][0] !== 0) {
      post.push(`${e.id}: the street must be geometrically STRAIGHT on x = 0`);
    }
  }
  // The vulnerable-pass tracker discards inside junction areas — this street
  // must not have any, ever (the vu-pass-v1 law).
  if (INTERSECTIONS.length !== 0) post.push(`intersections must be empty on a VU street`);
  if (CROSSINGS.length !== 0) post.push(`crossings must be empty on a VU street`);
  if (ZONES.length !== 0) post.push(`zones must be empty — the wide pass line crosses the crown`);

  // The wobble must be a real swerve INTO the driver's lane, and must fit.
  if (!(apexXM < curbXM)) post.push(`wobble apex ${apexXM} is not left of the curb line ${curbXM}`);
  if (!(apexXM > 0 && apexXM < halfRoadM)) post.push(`wobble apex ${apexXM} is outside the northbound bank`);
  if (!(apexXM < laneRightM + 1)) {
    post.push(`wobble apex ${apexXM} does not reach the driver's lane (center ${laneRightM})`);
  }
  if (!(curbXM > laneRightM && curbXM < halfRoadM)) {
    post.push(`curb line ${curbXM} outside the northbound bank's curb half`);
  }
  if (!(wobble.amplitudeM >= 1)) post.push(`wobble amplitude ${wobble.amplitudeM} m is not a swerve a driver must budget for`);
  if (!(wobble.triggerYM + wobble.arcM < lengthM - 100)) {
    post.push(`the swerve must finish 100 m short of the street's end (pass room)`);
  }
  // childPath is the design record: it must BE the two lines + the arc.
  if (childPath.length !== 4) post.push(`childPath must be curb → trigger → apex → end`);
  if (childPath[0][0] !== curbXM || childPath[1][0] !== curbXM) post.push(`childPath does not start on the curb line`);
  if (childPath[2][0] !== apexXM || childPath[3][0] !== apexXM) post.push(`childPath does not settle on the apex line`);
  if (childPath[3][1] !== r2(lengthM)) post.push(`childPath does not run the whole street`);
  for (let i = 1; i < childPath.length; i++) {
    if (!(childPath[i][1] > childPath[i - 1][1])) post.push(`childPath point ${i} does not advance northbound`);
  }

  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`right lane center ${laneRightM} outside the northbound bank`);
  for (const b of BUILDINGS) {
    for (const [x] of b.footprint) {
      if (!(x < -(halfRoadM + 3.5))) post.push(`${b.id}: footprint reaches the carriageway/sidewalk`);
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_vu_child self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (wave 7: VU-03 „Дете на колело лъкатуши")
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "vu-child-v1",
    label: "Учебна жилищна улица — дете на велосипед (сценарий VU-03)",
    idPrefix: "vuc",
    lengthM: 300,
    // 30 km/h: a жилищна улица where children ride. It is also the number the
    // objective teaches — „скорост, с която можеш да спреш веднага" — and it
    // keeps every authored drive structurally inside the посочен режим.
    maxspeedKmh: 30,
    // 2.6 m right of the lane center = x 6.66, the SAME curb line
    // sc-vu-pass-clearance and sc-vu-cyclist-group ride. Reused deliberately:
    // three templates, one cyclist line, one set of proven lateral numbers.
    childCurbOffsetM: 2.6,
    wobble: { triggerYM: 100, triggerRadiusM: 2, amplitudeM: 2.0, arcM: 6.5 },
    noteBg:
      "По десния бордюр кара дете на велосипед. Децата не държат линия: остави му двойно повече място и скорост, с която спираш веднага.",
  },
];

for (const params of INSTANCES) {
  const district = buildVuChildDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const line = (k, v) => console.log(`  ${String(k).padEnd(26)} ${v}`);
  const w = district.meta.scenario.wobble;
  console.log(`=== vu-child build: ${params.districtId} ===`);
  line("street", `${params.lengthM} m, 1+1 residential, ${params.maxspeedKmh} km/h`);
  line("lane center / curb line", `${district.meta.scenario.laneCenterRightM} / ${w.curbXM}`);
  line("wobble", `x ${w.curbXM} → ${w.apexXM} (${w.amplitudeM} m) over y ${w.triggerYM} → ${w.triggerYM + w.arcM}`);
  line("nodes / edges / spawns", `${district.meta.stats.nodes} / ${district.meta.stats.edges} / ${district.meta.stats.spawnPoints}`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
