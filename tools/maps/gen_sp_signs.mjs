/**
 * gen_sp_signs.mjs — the SIGN-SCOPE micro-map (Scenario Studio, doc 76 §3; doc
 * 72 §8 archetype SP-03 read from its OTHER end) → content/world/<districtId>
 * .json (+ byte-identical publish to platform/public/world/).
 *
 * gen_sp_transition.mjs teaches where a В26 restriction STARTS. This map teaches
 * where it ENDS — the scope rule (ЗДвП чл. 21; Наредба № РД-02-21-1/2023): a
 * posted limit runs until an explicit end plate OR until the next junction, and
 * nothing else cancels it. So the street carries TWO В26-40 spans with TWO
 * DIFFERENT legal endpoints, back to back:
 *
 *   span 1 (limit1) dies at a JUNCTION      — a real degree-3 node, not a sign;
 *   span 2 (limit2) dies at an END PLATE    — a plain degree-2 node, no junction.
 *
 * Both endpoints are encoded the only way the engine grades speed: as the
 * PER-EDGE `maxspeed` surface (runtime/worldRuntime.ts speedLimitAt →
 * edgeRt.edge.maxspeed). The route reads 50 → 40 → 50 → 40 → 50, so the shipped
 * speeding detectors grade BOTH endpoint rules with zero new code — accelerating
 * before either endpoint fires against the LOCAL 40, not the 50 ahead.
 *
 * Sign posts are NARRATIVE, exactly as in gen_sp_transition.mjs: no District
 * .zones kind encodes a speed span and no SignKind renders a В26-40 or an end
 * plate today (world/types.ts SignKind + builders/zoneSigns.ts), so the map
 * authors NO zones. The props.ts district-entry pass posts its `limit50` plate
 * at each boundary dead-end; all three dead-end edges here are posted 50, so
 * every rendered plate states the truth of the edge it stands on.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     sp-sg-n-end (0, 800)                        total = 800
 *         │  TAIL — maxspeed 50 (sp-sg-e-end)
 *     sp-sg-n-endsign (0, 700)   ← ENDPOINT 2: the end-of-restriction plate
 *         │  LIMIT 2 — maxspeed 40 (sp-sg-e-limit2)
 *     sp-sg-n-limit2 (0, 460)    ← the second В26-40
 *         │  BETWEEN — maxspeed 50 (sp-sg-e-between)
 *     sp-sg-n-junction (0, 340)  ← ENDPOINT 1: the junction ───── sp-sg-n-side (60, 340)
 *         │  LIMIT 1 — maxspeed 40 (sp-sg-e-limit1)        sp-sg-e-side (50)
 *     sp-sg-n-limit1 (0, 100)    ← the first В26-40
 *         │  APPROACH — maxspeed 50 (sp-sg-e-approach)
 *     sp-sg-spawn-approach (4.06, 15)
 *         │
 *     sp-sg-n-start (0, 0)
 *
 * The side arm exists ONLY to make endpoint 1 a genuine junction (degree 3 —
 * the runtime's own uncontrolled-junction gate) and is never driven. Every edge
 * is `residential` (rank 2): with no arterial the stop-line heuristic derives NO
 * stop line, so the junction cancels the limit without adding a control the
 * drill does not teach. The right-hand-rule tracker DOES arm at that node, but
 * it convicts only on a vehicle approaching from the right — ambient traffic is
 * ZERO by every drive (seed 7) and no actor is staged, so the ONLY gradable
 * fault on this map remains the driver's own speed against the segment-local
 * limit. No signals, no crossings.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_sp_signs.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/sp-signs-district.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** PERCEPTUAL_ROAD_SCALE × textbook lane — the drawn lane width, m. */
const SCALED_LANE_W = 3.25 * 2.5;

/** Class rank the runtime's stop-line heuristic reads (≥ 4 = arterial). */
const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };

const r2 = (v) => Math.round(v * 100) / 100;

function segLength(a, b) {
  return r2(Math.hypot(b[0] - a[0], b[1] - a[1]));
}

/**
 * @param {{
 *   districtId: string,   // output file name + map.districtId
 *   label: string,        // human label (meta)
 *   approachM: number,    // 50 km/h run-up before the first В26 (80..400)
 *   limit1M: number,      // the В26-40 span that dies at the junction (120..400)
 *   betweenM: number,     // 50 km/h stretch past the junction (80..400)
 *   limit2M: number,      // the В26-40 span that dies at the end plate (120..400)
 *   tailM: number,        // 50 km/h stretch past the end plate (80..400)
 *   baseKmh: number,      // the limit outside both spans (50|60)
 *   limitKmh: number,     // the В26 posted limit inside both spans (30|40)
 *   sideArmM: number,     // the side stub that makes endpoint 1 a junction (30..120)
 * }} params
 */
export function buildSpSignsStreet(params) {
  const errors = [];
  const { districtId, label, approachM, limit1M, betweenM, limit2M, tailM, baseKmh, limitKmh, sideArmM } =
    params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  for (const [k, v, lo, hi] of [
    ["approachM", approachM, 80, 400],
    ["limit1M", limit1M, 120, 400],
    ["betweenM", betweenM, 80, 400],
    ["limit2M", limit2M, 120, 400],
    ["tailM", tailM, 80, 400],
    ["sideArmM", sideArmM, 30, 120],
  ]) {
    if (!(v >= lo && v <= hi)) errors.push(`${k} must be within ${lo}..${hi} m, got ${v}`);
  }
  if (![50, 60].includes(baseKmh)) errors.push(`baseKmh must be 50|60, got ${baseKmh}`);
  if (![30, 40].includes(limitKmh)) errors.push(`limitKmh must be 30|40 (the В26 plate), got ${limitKmh}`);
  if (limitKmh >= baseKmh) errors.push(`limitKmh (${limitKmh}) must be BELOW baseKmh (${baseKmh}) — В26 restricts`);
  // The scope lesson needs room to accelerate too early INSIDE a span: a demo
  // that lifts 200 m before the endpoint must still be inside it.
  if (Math.min(limit1M, limit2M) < 150) errors.push(`each В26 span needs >= 150 m for an early-acceleration demo`);
  if (errors.length > 0) throw new Error(`gen_sp_signs params invalid:\n  - ${errors.join("\n  - ")}`);

  // -- The five collinear segments (the driven route) + the side stub.
  const yLimit1 = approachM;
  const yJunction = approachM + limit1M;
  const yLimit2 = yJunction + betweenM;
  const yEndSign = yLimit2 + limit2M;
  const totalM = yEndSign + tailM;

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  const NODES = {
    "sp-sg-n-start": [0, 0],
    "sp-sg-n-limit1": [0, yLimit1],
    "sp-sg-n-junction": [0, yJunction],
    "sp-sg-n-limit2": [0, yLimit2],
    "sp-sg-n-endsign": [0, yEndSign],
    "sp-sg-n-end": [0, totalM],
    "sp-sg-n-side": [sideArmM, yJunction],
  };

  /** One two-way 1+1 residential segment between two nodes. */
  const seg = (id, from, to, maxspeed, name) => {
    const geometry = [NODES[from], NODES[to]];
    return {
      id,
      from,
      to,
      class: "residential",
      name,
      oneway: false,
      roundabout: false,
      lanes: 2,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: segLength(geometry[0], geometry[1]),
      geometry,
    };
  };

  const EDGES = [
    seg("sp-sg-e-approach", "sp-sg-n-start", "sp-sg-n-limit1", baseKmh, "Права улица — подход преди първия знак В26"),
    seg("sp-sg-e-limit1", "sp-sg-n-limit1", "sp-sg-n-junction", limitKmh, `Зона В26 ${limitKmh} — до кръстовището`),
    seg("sp-sg-e-between", "sp-sg-n-junction", "sp-sg-n-limit2", baseKmh, "Права улица — след кръстовището ограничението е отменено"),
    seg("sp-sg-e-limit2", "sp-sg-n-limit2", "sp-sg-n-endsign", limitKmh, `Зона В26 ${limitKmh} — до знака за край`),
    seg("sp-sg-e-end", "sp-sg-n-endsign", "sp-sg-n-end", baseKmh, "Права улица — след знака за край на забраната"),
    // The stub: it is what makes endpoint 1 a JUNCTION rather than a sign.
    seg("sp-sg-e-side", "sp-sg-n-junction", "sp-sg-n-side", baseKmh, "Странична улица — кръстовището, което отменя В26"),
  ];

  /** The driven route, south → north — the speed sequence IS the lesson. */
  const ROUTE_EDGE_IDS = ["sp-sg-e-approach", "sp-sg-e-limit1", "sp-sg-e-between", "sp-sg-e-limit2", "sp-sg-e-end"];

  // Endpoint 1 is a real junction (degree 3, uncontrolled — the runtime's own
  // gate). Endpoint 2 is a plain degree-2 node: a plate, not an intersection.
  const INTERSECTIONS = [{ id: "sp-sg-n-junction", x: 0, y: yJunction, degree: 3, signalized: false }];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  const SPAWN_POINTS = [
    {
      id: "sp-sg-spawn-approach",
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: "sp-sg-e-approach",
      name: "Начало на отсечката — преди първия знак В26",
    },
    {
      id: "sp-sg-spawn-limit1",
      x: laneCenterM,
      y: r2(yLimit1 + 20),
      heading: 0,
      edgeId: "sp-sg-e-limit1",
      name: "Контролна точка — в първата зона (край: кръстовището)",
    },
    {
      id: "sp-sg-spawn-limit2",
      x: laneCenterM,
      y: r2(yLimit2 + 20),
      heading: 0,
      edgeId: "sp-sg-e-limit2",
      name: "Контролна точка — във втората зона (край: знакът за край)",
    },
  ];

  // One block west of the second В26 span (visual anchor, clear of both
  // carriageways + sidewalks).
  const BUILDINGS = [
    {
      id: "sp-sg-b-block",
      height: 11,
      heightSource: "default",
      footprint: [
        [r2(-(halfRoadM + 24)), r2(yLimit2 + 40)],
        [r2(-(halfRoadM + 8)), r2(yLimit2 + 40)],
        [r2(-(halfRoadM + 8)), r2(yLimit2 + 90)],
        [r2(-(halfRoadM + 24)), r2(yLimit2 + 90)],
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
      generator: "tools/maps/gen_sp_signs.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебна улица с две зони В26 и два различни края (кръстовище / знак за край) — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        // Off-road / fallback default — the segments carry their own limits.
        maxspeedUrbanKmh: baseKmh,
        note: `Обхват на знака: В26 ${limitKmh} важи до кръстовището (първата зона) и до знака за край (втората).`,
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
        // MapArchetype vocabulary: the DRIVEN stage is one straight street (five
        // collinear segments). The side stub is never driven — it exists so
        // endpoint 1 is a junction in the runtime's own terms.
        archetype: "straight-street",
        params: { approachM, limit1M, betweenM, limit2M, tailM, baseKmh, limitKmh, sideArmM },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
        routeEdgeIds: ROUTE_EDGE_IDS,
        /** The two В26 spans and the two DIFFERENT legal endpoints. */
        limit1: { fromY: yLimit1, toY: yJunction, endsAt: "junction" },
        limit2: { fromY: yLimit2, toY: yEndSign, endsAt: "endSign" },
        junctionY: yJunction,
        junctionNodeId: "sp-sg-n-junction",
        endSignY: yEndSign,
        /** The route's speed sequence — what speedLimitAt must resolve. */
        routeLimitsKmh: ROUTE_EDGE_IDS.map((id) => EDGES.find((e) => e.id === id).maxspeed),
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
  // Self-validation (the gen_sp_transition invariants + the scope-map crux)
  // -------------------------------------------------------------------------
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

  // THE CRUX — two В26 spans, two DIFFERENT endpoint kinds:
  //   endpoint 1 = a junction node (degree 3, declared as an intersection);
  //   endpoint 2 = a plain plate node (degree 2, NOT an intersection).
  if ((degree.get("sp-sg-n-junction") ?? 0) !== 3) {
    post.push(`sp-sg-n-junction must join limit1 + between + the side arm (degree 3)`);
  }
  if ((degree.get("sp-sg-n-endsign") ?? 0) !== 2) {
    post.push(`sp-sg-n-endsign must be a plain plate node (degree 2) — a sign is not a junction`);
  }
  if (INTERSECTIONS.length !== 1 || INTERSECTIONS[0].id !== "sp-sg-n-junction") {
    post.push(`exactly ONE intersection (the В26 endpoint) must be declared`);
  }
  if (INTERSECTIONS.some((it) => it.signalized)) {
    post.push(`the endpoint junction must stay unsignalized — a signal is a control the drill does not teach`);
  }
  // Both spans must be terminated: the 40 must give way to the base limit at
  // BOTH endpoints, or the map teaches only one of the two rules.
  const routeLimits = ROUTE_EDGE_IDS.map((id) => EDGES.find((e) => e.id === id).maxspeed);
  const expected = [baseKmh, limitKmh, baseKmh, limitKmh, baseKmh];
  if (routeLimits.join(",") !== expected.join(",")) {
    post.push(`route limits ${routeLimits.join("→")} must read ${expected.join("→")} (В26 dies at BOTH endpoints)`);
  }
  // No arterial edge → the runtime derives no stop line at the junction, so the
  // limit is cancelled by the junction alone (the rule under test).
  if (Math.max(...EDGES.map((e) => RANK[e.class] ?? 2)) >= 4) {
    post.push(`an arterial edge would derive a stop line at the junction — the drill teaches scope, not control`);
  }
  // The side stub must not intrude on the driven street's carriageway.
  if (sideArmM <= halfRoadM + 6) post.push(`sideArmM ${sideArmM} must clear the main carriageway`);

  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > totalM ? y - totalM : 0);
  for (const s of SPAWN_POINTS) {
    if (!EDGES.some((e) => e.id === s.edgeId)) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // Each control spawn must sit INSIDE the span its edge names.
  for (const [id, lo, hi] of [
    ["sp-sg-spawn-limit1", yLimit1, yJunction],
    ["sp-sg-spawn-limit2", yLimit2, yEndSign],
  ]) {
    const s = SPAWN_POINTS.find((p) => p.id === id);
    if (!s || !(s.y > lo && s.y < hi)) post.push(`${id}: must sit inside its В26 span (${lo}..${hi})`);
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  // The building must clear both carriageways + sidewalks.
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) <= halfRoadM + 4 && y >= -4 && y <= totalM + 4) post.push(`${bl.id}: footprint on the main street`);
      if (Math.abs(y - yJunction) <= halfRoadM + 4 && x >= -4 && x <= sideArmM + 4) {
        post.push(`${bl.id}: footprint on the side arm`);
      }
    }
  }
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) throw new Error(`gen_sp_signs self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the sign-scope micro-map)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "sp-signs-v1",
    label: "Учебна улица — обхват на В26: край при кръстовище и край при знак (сценарий SP-03)",
    approachM: 100,
    // 240 m per span: the taught fault is „ускоряване 200 м преди края на
    // зоната", so 200 m before either endpoint must still be well INSIDE it.
    limit1M: 240,
    betweenM: 120,
    limit2M: 240,
    tailM: 100,
    baseKmh: 50,
    limitKmh: 40,
    sideArmM: 60,
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildSpSignsStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out);

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out);

  const sc = district.meta.scenario;
  console.log(`=== sp-signs build: ${params.districtId} ===`);
  line("route limits", sc.routeLimitsKmh.join(" → "));
  line("В26 span 1", `y ${sc.limit1.fromY}..${sc.limit1.toY} → ends at the JUNCTION`);
  line("В26 span 2", `y ${sc.limit2.fromY}..${sc.limit2.toY} → ends at the END PLATE`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
