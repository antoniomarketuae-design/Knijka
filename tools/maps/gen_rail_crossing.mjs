/**
 * gen_rail_crossing.mjs — the RAILWAY-CROSSING micro-maps (ADR-006 stage 3a;
 * doc 72 §12 archetypes RX-01 „Прелез с бариери" and RX-02 „Неохраняем
 * прелез"). First maps carrying the `zones` kind "railCrossing": the TRACK
 * BAND is authored data (a span of edge arclength = the rails ± clearance),
 * never a heuristic — the same map-data-v2 discipline as the 2a ban zones.
 *
 *   - rx-unguarded-v1 „Неохраняем жп прелез" (RX-02): a 1+1 street crossed by
 *     an unguarded track band (А35 + СТОП cross) — the DRIVER is the barrier:
 *     mandatory full stop before the band, scan both ways, cross briskly
 *     without stopping ON it (ЗДвП чл. 51–53).
 *   - rx-guarded-v1   „Охраняем прелез с бариера" (RX-01): the same street,
 *     guarded variant (А34) with a DETERMINISTIC periodic barrier timetable
 *     (down [0, 40) s of every 90 s cycle — the signalOffsets discipline:
 *     same session, same phases, always). Entering while barred is the kill.
 *
 * Version contract (runtime/district.ts): format stays "district-v1"; the
 * `zones` array is optional and additive; kind vocabulary growth keeps
 * meta.zonesVersion = 1 (the 2b precedent — unknown kinds are inert in every
 * older consumer). NO shipped file is regenerated.
 *
 * KNOWN VISUAL GAP (honest, the 2a/2b precedent): the district renderer
 * instances authored GLB sign models keyed by SignKind (stop/giveWay/limit50/
 * roundabout) and the markings builder paints no span-scoped bands. No А34/
 * А35/СТОП-cross (Андреевски кръст) assets and no barrier-arm/РЖ-lamp prop
 * exist yet, so these crossings GRADE exactly (authored spans + timetable,
 * not paint reads) but render no track/posts/barrier; the scenario copy and
 * the shadow's narration carry the sign teaching until an asset drop extends
 * SignKind. A procedural barrier mesh was weighed and judged disproportionate
 * for this slice (it would touch the world-builder geometry contract for one
 * map) — the РЖ-lamp alternative equally needs the asset seam, so both wait.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_rail_crossing.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

/** signRef ↔ variant pairing law (self-validation): А34 posts the guarded
 *  crossing, А35 the unguarded one (Наредба № 18 warning signs). */
const SIGN_FOR = { guarded: "А34", unguarded: "А35" };

/**
 * @param {{
 *   districtId: string,     // output file name + ScenarioSpec.map.districtId
 *   label: string,          // human label (meta)
 *   idPrefix: string,       // node/edge/spawn id prefix (e.g. "rxu")
 *   lengthM: number,        // street length (200..1000)
 *   maxspeedKmh: number,    // legal limit (30..90)
 *   band: { fromM: number, toM: number },  // the track band (rails ± clearance)
 *   guarded: boolean,       // RX-01 (true) vs RX-02 (false)
 *   barrier?: { cycleSec: number, downFromSec: number, downToSec: number },
 *   noteBg: string,         // meta.defaults.note (Bulgarian)
 * }} params
 */
export function buildRailCrossingStreet(params) {
  const errors = [];
  const { districtId, label, idPrefix, lengthM, maxspeedKmh, band, guarded, barrier, noteBg } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be alphanumeric`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!band || !(band.fromM >= 60 && band.toM <= lengthM - 60 && band.fromM < band.toM)) {
    errors.push(`band must satisfy 60 <= fromM < toM <= ${lengthM - 60} (approach + run-out), got [${band?.fromM}, ${band?.toM}]`);
  }
  if (band && band.toM - band.fromM > 12) {
    errors.push(`band [${band.fromM}, ${band.toM}] wider than 12 m — a level crossing is a BAND, not a district`);
  }
  if (typeof guarded !== "boolean") errors.push(`guarded must be boolean`);
  if (guarded) {
    if (
      !barrier ||
      !(barrier.cycleSec > 0) ||
      !(barrier.downFromSec >= 0 && barrier.downFromSec < barrier.downToSec && barrier.downToSec <= barrier.cycleSec)
    ) {
      errors.push(`guarded crossing requires a valid barrier timetable (0 <= downFromSec < downToSec <= cycleSec), got ${JSON.stringify(barrier)}`);
    }
  } else if (barrier !== undefined) {
    errors.push(`unguarded crossing must not carry a barrier timetable`);
  }
  if (errors.length > 0) throw new Error(`gen_rail_crossing params invalid:\n  - ${errors.join("\n  - ")}`);

  // Lane bank math (runtime/spatial.ts): 1+1 street — northbound lane center
  // sits half a drawn lane east of the axis.
  const laneRightM = r2(0.5 * SCALED_LANE_W); // 4.06
  const halfRoadM = SCALED_LANE_W;

  // The СТОП-cross / barrier stop line: 5 m before the band (the authoring
  // anchor the templates + trace scripts pin — meta.scenario.stopLineY).
  const stopLineY = r2(band.fromM - 5);

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

  // The authored track band. The street runs south → north on x = 0, so edge
  // arclength (the runtime Locator's sM) EQUALS district y along the street.
  const signRef = guarded ? SIGN_FOR.guarded : SIGN_FOR.unguarded;
  const zone = {
    id: `${idPrefix}-z-railcrossing`,
    kind: "railCrossing",
    edgeId,
    fromM: r2(band.fromM),
    toM: r2(band.toM),
    signRef,
  };
  if (guarded) {
    zone.guarded = true;
    zone.barrier = {
      cycleSec: barrier.cycleSec,
      downFromSec: barrier.downFromSec,
      downToSec: barrier.downToSec,
    };
  }
  const ZONES = [zone];

  const SPAWN_POINTS = [
    {
      id: `${idPrefix}-spawn-start`,
      x: laneRightM,
      y: 15,
      heading: 0,
      edgeId,
      name: "Начало — преди прелеза",
    },
    {
      id: `${idPrefix}-spawn-finish`,
      x: laneRightM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId,
      name: "Контролна точка — след прелеза",
    },
  ];

  // One visual-anchor block west of the street, before the crossing (the
  // sign-reading moment), clear of carriageway + sidewalk.
  const BUILDINGS = [
    {
      id: `${idPrefix}-b-block`,
      height: 5,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 20)), r2(band.fromM - 60)],
        [r2(-(halfRoadM + 8)), r2(band.fromM - 60)],
        [r2(-(halfRoadM + 8)), r2(band.fromM - 44)],
        [r2(-(halfRoadM + 20)), r2(band.fromM - 44)],
      ],
    },
  ];

  const bounds = {
    minX: r2(-(halfRoadM + 26)),
    minY: -6,
    maxX: r2(halfRoadM + 6),
    maxY: r2(lengthM + 6),
  };

  // The PERPENDICULAR rail line the staged TRAIN rides (ADR-006 stage 3c —
  // the RX „жп прелез" gets a real train). The street runs south → north on
  // x = 0, so the track crosses EAST–WEST at the band centre (y = midpoint of
  // [fromM, toM]); it reaches far past both kerbs so the ~34 m consist enters
  // frame, crosses, and exits. Aligned with the rendered rail deck
  // (world/builders/railTrack.ts stamps the deck at the same band centre), so
  // the train runs ON the drawn rails. Authored data mirrored into the
  // template (templates-rail.ts) and pinned by the rail-district battery.
  const bandCenterY = r2((band.fromM + band.toM) / 2);
  const RAIL_PATH_HALF_M = 130; // west start → east end, both well off-frame
  const railPath = [
    [r2(-RAIL_PATH_HALF_M), bandCenterY],
    [r2(RAIL_PATH_HALF_M), bandCenterY],
  ];

  const scenario = {
    archetype: "straight-street",
    params: {
      lengthM,
      maxspeedKmh,
      crossingFromM: r2(band.fromM),
      crossingToM: r2(band.toM),
      guarded: guarded ? "guarded" : "unguarded",
    },
    lanesPerDirection: 1,
    laneCenterRightM: laneRightM,
    railCrossing: {
      id: zone.id,
      signRef,
      fromM: r2(band.fromM),
      toM: r2(band.toM),
      guarded,
      stopLineY,
      bandCenterY,
      railPath,
      ...(guarded ? { barrier: { ...zone.barrier } } : {}),
    },
  };

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-street",
      generator: "tools/maps/gen_rail_crossing.mjs",
      // ZONE schema marker (ADR-006 stage 2a version contract; kind growth
      // keeps 1 — the 2b precedent): this file carries the optional `zones`.
      zonesVersion: 1,
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с железопътен прелез — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
        zones: ZONES.length,
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
    zones: ZONES,
  };

  // -- Self-validation (the gen_ban_zones invariants + the rail pairing law).
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
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: two-way 1+1 street expected`);
  }
  const edgeIdSet = new Set(EDGES.map((e) => e.id));
  for (const z of ZONES) {
    if (!edgeIdSet.has(z.edgeId)) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span [${z.fromM}, ${z.toM}] outside 0..${lengthM}`);
    if (z.kind !== "railCrossing") post.push(`${z.id}: kind must be railCrossing`);
    if ((z.guarded === true ? SIGN_FOR.guarded : SIGN_FOR.unguarded) !== z.signRef) {
      post.push(`${z.id}: signRef ${z.signRef} does not post the ${z.guarded === true ? "guarded" : "unguarded"} variant`);
    }
    if (z.guarded === true) {
      const b = z.barrier;
      if (!b || !(b.cycleSec > 0 && b.downFromSec >= 0 && b.downFromSec < b.downToSec && b.downToSec <= b.cycleSec)) {
        post.push(`${z.id}: guarded span carries an invalid barrier timetable`);
      }
    } else if (z.barrier !== undefined) {
      post.push(`${z.id}: unguarded span must not carry a barrier timetable`);
    }
  }
  if (district.meta.zonesVersion !== 1) post.push("meta.zonesVersion must be 1 on a zones-carrying file");
  if (!(stopLineY > 0 && stopLineY < band.fromM)) post.push(`stop line ${stopLineY} must sit before the band start ${band.fromM}`);
  // Rail path: two endpoints on the band-centre line (y), symmetric across the
  // axis, reaching well past both kerbs (so a long consist enters + exits).
  const rp = scenario.railCrossing.railPath;
  if (!Array.isArray(rp) || rp.length !== 2) {
    post.push("railPath must be a 2-point [west, east] polyline");
  } else {
    if (rp[0][1] !== bandCenterY || rp[1][1] !== bandCenterY) post.push(`railPath endpoints must sit on the band centre y = ${bandCenterY}`);
    if (!(rp[0][0] < -halfRoadM && rp[1][0] > halfRoadM)) post.push(`railPath must cross the full carriageway (|x| > ${halfRoadM})`);
    if (rp[0][0] !== -rp[1][0]) post.push("railPath must be symmetric about the street axis");
    if (bandCenterY <= band.fromM || bandCenterY >= band.toM) post.push(`band centre ${bandCenterY} must lie inside [${band.fromM}, ${band.toM}]`);
  }
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== edgeId) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (Math.abs(s.x) > halfRoadM || s.y < 0 || s.y > lengthM) post.push(`${s.id}: not on the carriageway`);
  }
  if (!(laneRightM > 0 && laneRightM < halfRoadM)) post.push(`lane center ${laneRightM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_rail_crossing self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The two committed instances (RAIL PACK slice 1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // RX-02 host: unguarded crossing — the driver is the barrier. Track band
    // [150, 156]; the СТОП cross / stop line at y = 145.
    districtId: "rx-unguarded-v1",
    label: "Учебна улица — неохраняем жп прелез А35 (сценарий RX-02)",
    idPrefix: "rxu",
    lengthM: 300,
    maxspeedKmh: 50,
    band: { fromM: 150, toM: 156 },
    guarded: false,
    noteBg: "Неохраняем жп прелез на 150 м: спри напълно преди релсите, огледай се в двете посоки и премини решително, без да спираш върху коловоза.",
  },
  {
    // RX-01 host: guarded crossing with the deterministic barrier timetable —
    // down [0, 40) s of every 90 s cycle: a session-start arrival meets the
    // lowered barrier, waits, and crosses in the open window.
    districtId: "rx-guarded-v1",
    label: "Учебна улица — охраняем жп прелез с бариера А34 (сценарий RX-01)",
    idPrefix: "rxg",
    lengthM: 300,
    maxspeedKmh: 50,
    band: { fromM: 150, toM: 156 },
    guarded: true,
    barrier: { cycleSec: 90, downFromSec: 0, downToSec: 40 },
    noteBg: "Охраняем жп прелез на 150 м: при спуснати бариери изчакай зад стоп-линията; премини едва след пълното им вдигане, без да спираш върху релсите.",
  },
  {
    // RX-01 „спускане" host: guarded crossing whose barrier is OPEN at session
    // start and DESCENDS in front of the player — down [20, 60) of every 90 s
    // cycle. The whole trap moves into the drive: a t = 0 arrival meets the
    // OPEN barrier, watches it drop at t = 20, and must wait out the down-
    // window ([20, 60)) before crossing in the open window [60, 90). No per-
    // attempt director arming — the descent is world data, same session, same
    // phases, always (the rx-guarded-v1 timetable discipline, re-phased).
    districtId: "rx-drop-v1",
    label: "Учебна улица — охраняем жп прелез със спускаща се бариера А34 (сценарий RX-01)",
    idPrefix: "rxd",
    lengthM: 300,
    maxspeedKmh: 50,
    band: { fromM: 150, toM: 156 },
    guarded: true,
    barrier: { cycleSec: 90, downFromSec: 20, downToSec: 60 },
    noteBg: "Охраняем жп прелез на 150 м: бариерата е вдигната, но след малко тръгва надолу. Спри зад стоп-линията и изчакай пълното ѝ вдигане — не се гмуркай под спускащата се бариера и никога не спирай върху релсите.",
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildRailCrossingStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== rail-crossing build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("track band", `[${district.zones[0].fromM}, ${district.zones[0].toM}] m (${district.zones[0].signRef})`);
  line("variant", params.guarded ? `guarded — barrier down [${params.barrier.downFromSec}, ${params.barrier.downToSec}) of ${params.barrier.cycleSec} s` : "unguarded (mandatory stop)");
  line("stop line", `y = ${district.meta.scenario.railCrossing.stopLineY}`);
  line("zonesVersion", district.meta.zonesVersion);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
