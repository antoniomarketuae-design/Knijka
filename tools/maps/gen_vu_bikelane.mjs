/**
 * gen_vu_bikelane.mjs — the VULNERABLE-ROAD-USER „two-way bike-path right hook"
 * micro-map (Scenario Studio, doc 76 §3; doc 72 §7 „Family VU") →
 * content/world/vu-bikelane-v1.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * VU „Десен завой през велоалея" host: an uncontrolled T-junction where the
 * driver rides the through road (west→east) and turns RIGHT onto the south
 * stem, crossing a curb-separated TWO-WAY cycle track that runs along the
 * through road's SOUTH edge. The whole point vs the live VU-01 host
 * (vu-cyclist-v1, a curb rider going the DRIVER'S OWN direction) is the
 * COUNTER-FLOW half: a rider approaching from AHEAD (eastbound arm, riding
 * WESTWARD on the same south track) crosses the turn mouth from the driver's
 * FRONT-RIGHT — the direction a "look back over the shoulder" check never
 * covers.
 *
 * Layout (local meters, x = east, y = north, origin at the junction node):
 *
 *   vu-n-w ───────────── vu-n-c ───────────── vu-n-e   through road (W–E); the
 *     ·  ·  ·  ·  ·  ·  ·  ·  │  ·  ·  ·  ·  ·  ·  ·  ·   two-way cycle track runs
 *      (two-way cycle track,  │                          along its SOUTH edge and
 *       south edge)        vu-n-s  south stem (the        crosses the mouth of the
 *                                  driver turns right)    south stem
 *
 * BOTH cycle directions ride the through road's south side; the driver crosses
 * the whole track as the right turn lands on the stem. Because the cycle
 * riders travel the through road's own axis, the runtime's conflictFromRight
 * same-direction filter ignores them (orchestrator/runners.ts
 * CyclistRightHookRunner is the ONLY adjudicator — prioritySituation
 * "cyclist-right-hook" → FAILED_TO_YIELD / YIELDED_TO_PRIORITY, collision →
 * COLLISION). Every edge is residential (rank 2) → control "none", so the
 * runtime derives ZERO stop lines (an UNCONTROLLED junction): no signal/sign/
 * priority code can pollute the demo.
 *
 * SCENE DESCOPE (honest, the sc-vu-door-zone precedent): the "green paint +
 * elephant-feet" cycle-crossing markings are a RENDER overlay only — the
 * district schema has no cycleway/bike-lane primitive, and adding a routable
 * cycle edge would change the junction degree/classification. The cycle track
 * is realised MECHANICALLY: the two counter-directional staged cyclists ride
 * the through road's south curb line (extraRightOffsetM), and the paint is a
 * later render-polish item (meta.scenario.cycleTrack carries the intent).
 *
 * No signals, no crossings, no roundabouts. Deterministic: same params →
 * byte-identical JSON. No randomness, no OSM. Run:
 *   node tools/maps/gen_vu_bikelane.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/vu-bikelane-districts.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

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
 *   districtId: string,          // output file name + map.districtId
 *   label: string,               // human label (meta)
 *   throughArmM: number,         // west/east arm length from the node (60..400)
 *   stemArmM: number,            // south stem length from the node (60..400)
 *   throughMaxKmh: number,       // maxspeed on the W–E through road
 *   stemMaxKmh: number,          // maxspeed on the stem
 * }} params
 */
export function buildVuBikelaneDistrict(params) {
  const errors = [];
  const { districtId, label, throughArmM, stemArmM, throughMaxKmh, stemMaxKmh } = params;

  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!(throughArmM >= 60 && throughArmM <= 400)) errors.push(`throughArmM must be within 60..400 m, got ${throughArmM}`);
  if (!(stemArmM >= 60 && stemArmM <= 400)) errors.push(`stemArmM must be within 60..400 m, got ${stemArmM}`);
  if (![30, 40, 50].includes(throughMaxKmh)) errors.push(`throughMaxKmh must be 30|40|50, got ${throughMaxKmh}`);
  if (![30, 40, 50].includes(stemMaxKmh)) errors.push(`stemMaxKmh must be 30|40|50, got ${stemMaxKmh}`);
  if (errors.length > 0) throw new Error(`gen_vu_bikelane params invalid:\n  - ${errors.join("\n  - ")}`);

  // Uncontrolled junction: every edge residential (rank 2) → zero stop lines.
  const cls = "residential";

  const NODES = {
    "vu-n-w": [-throughArmM, 0],
    "vu-n-c": [0, 0],
    "vu-n-e": [throughArmM, 0],
    "vu-n-s": [0, -stemArmM],
  };

  const edge = (id, from, to, maxspeed, name) => {
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
    edge("vu-e-w", "vu-n-w", "vu-n-c", throughMaxKmh, "Улица с велоалея — запад"),
    edge("vu-e-e", "vu-n-c", "vu-n-e", throughMaxKmh, "Улица с велоалея — изток"),
    edge("vu-e-s", "vu-n-s", "vu-n-c", stemMaxKmh, "Странична улица"),
  ];

  const INTERSECTIONS = [{ id: "vu-n-c", x: 0, y: 0, degree: 3, signalized: false }];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Visual anchor, clear of both carriageways + the south cycle track (NW quad).
  const BUILDINGS = [
    {
      id: "vu-b-corner",
      height: 5,
      heightSource: "default",
      footprint: [
        [-40, 26],
        [-26, 26],
        [-26, 40],
        [-40, 40],
      ],
    },
  ];

  // Spawns: 15 m inside each arm end, on the road centerline, facing the node.
  const SPAWN_POINTS = [
    {
      id: "vu-spawn-west",
      x: r2(-(throughArmM - 15)),
      y: 0,
      heading: 90,
      edgeId: "vu-e-w",
      name: "Улица с велоалея — подход от запад",
    },
    {
      id: "vu-spawn-east",
      x: r2(throughArmM - 15),
      y: 0,
      heading: 270,
      edgeId: "vu-e-e",
      name: "Улица с велоалея — подход от изток",
    },
    {
      id: "vu-spawn-south",
      x: 0,
      y: r2(-(stemArmM - 15)),
      heading: 0,
      edgeId: "vu-e-s",
      name: "Странична улица — подход към кръстовището",
    },
  ];

  // Bounds.
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const e of EDGES) {
    for (const [x, y] of e.geometry) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const totalKm = r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000);

  // Cycle-track line: half of the drawn lane (8.125 m) is 4.0625 m; the
  // south-side (eastbound) lane center sits at y = −4.06, and the two-way
  // track rides just curb-side of it. Pinned here so the template + battery
  // read one truth (meta.scenario), never the runtime.
  const laneHalf = r2(8.125 / 2); // 4.06
  // With-flow (eastbound) rides the SAME proven curb line as vu-cyclist-v1
  // (lane center + 2.6): 2.6 m of centers clears the 2.2 m contact radius, so
  // the driver overtakes it before the mouth without a spurious touch.
  const cycleWithFlowYM = r2(-laneHalf - 2.6); // −6.66 — eastbound sub-lane
  const cycleCounterFlowYM = r2(-laneHalf - 4.2); // −8.26 — westbound sub-lane (the star)

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-vru-bikelane",
      generator: "tools/maps/gen_vu_bikelane.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно кръстовище с двупосочна велоалея — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(throughMaxKmh, stemMaxKmh),
        note: "Учебно кръстовище: ограниченията идват от таговете на улиците.",
      },
      stats: {
        roadKm: totalKm,
        nodes: Object.keys(NODES).length,
        edges: EDGES.length,
        intersections: INTERSECTIONS.length,
        crossings: CROSSINGS.length,
        buildings: BUILDINGS.length,
        spawnPoints: SPAWN_POINTS.length,
      },
      scenario: {
        archetype: "t-junction",
        params: { control: "none", throughArmM, stemArmM, throughMaxKmh, stemMaxKmh },
        junctionNodeId: "vu-n-c",
        expectedControl: "rightHandRule",
        laneHalfM: laneHalf,
        // The two-way cycle track (render overlay; realised mechanically by the
        // two staged counter-directional cyclists — see the generator header).
        cycleTrack: {
          side: "south",
          twoWay: true,
          withFlowYM: cycleWithFlowYM, // eastbound rider line
          counterFlowYM: cycleCounterFlowYM, // westbound rider line (the star)
          marking: "green-paint+elephant-feet (render overlay, descoped)",
        },
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

  // Self-validation (mirrors gen_vu_cyclist / gen_t_junction invariants).
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
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
  }
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
  for (const s of SPAWN_POINTS) {
    const host = EDGES.find((e) => e.id === s.edgeId);
    if (!host) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    else if (distToEdge(host, s.x, s.y) > 1) post.push(`${s.id}: not on its edge`);
  }
  // Uncontrolled precondition: no arterial-class edge (heuristic would derive a line).
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  const ranks = EDGES.map((e) => RANK[e.class] ?? 2);
  if (Math.max(...ranks) >= 4) post.push(`an arterial-class edge exists — the heuristic would derive a stop line`);
  // Routable connectivity: one component.
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
  if (post.length > 0) throw new Error(`gen_vu_bikelane self-validation FAILED:\n  - ${post.join("\n  - ")}`);

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (wave 8: the two-way bike-path right-hook host)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "vu-bikelane-v1",
    label: "Учебно Т-кръстовище с двупосочна велоалея по южния бордюр (сценарий VU — велоалея)",
    throughArmM: 150,
    stemArmM: 90,
    throughMaxKmh: 50,
    stemMaxKmh: 50,
  },
];

for (const params of INSTANCES) {
  const district = buildVuBikelaneDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
  console.log(`=== vu-bikelane build: ${params.districtId} ===`);
  line("through / stem arms", `${params.throughArmM} m / ${params.stemArmM} m`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("cycle track (S)", `withFlow y=${district.meta.scenario.cycleTrack.withFlowYM}, counterFlow y=${district.meta.scenario.cycleTrack.counterFlowYM}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
