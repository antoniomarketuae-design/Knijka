/**
 * gen_jx_equal.mjs — the EQUAL X-JUNCTION map (Scenario Studio, doc 76 §3) →
 * content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A THIRD junction generator, standalone from tools/maps/gen_t_junction.mjs and
 * tools/maps/gen_ju_junctions2.mjs so running it never rewrites their shipped
 * instances (those files write on import). It shares gen_ju_junctions2's exact
 * district-v1 shape and control→class derivation, and changes ONE structural
 * thing: the stem becomes a THROUGH road, so the centre node has degree 4 —
 * the four-arm equal crossroads the Т shape cannot express.
 *
 * That degree-4 shape is the whole point. On a T, a left-turning player meets
 * ONE adjudicator; on an X the opposing arm exists, so the runtime's RHR
 * tracker (car from the RIGHT — east arm) AND its N1 left-turn-across-path
 * tracker (car OPPOSING — north arm) both have a home at the same node. The
 * bearing gates keep them disjoint (traffic/system.ts: ONCOMING_MIN_DEG 130
 * rejects the perpendicular east car; RIGHT_MIN_M 1.5 rejects the north car,
 * which sits in the far lane), so the two conflicts are SEQUENCED in time by
 * the scenario, not fused by the geometry.
 *
 * One committed instance:
 *
 *  - jx-equal-v1 — control "none" (four equal residential arms → the runtime
 *    derives ZERO stop lines and an UNCONTROLLED right-hand-rule junction at
 *    degree 4). Host of sc-jx-equal-left „Ляв завой на равнозначно кръстовище"
 *    (ЗДвП чл. 37: пропусни идващия отдясно; чл. 48: и насрещния направо).
 *
 * SIGHTLINES ARE THE INVARIANT. gen_ju_junctions2's JU-17 instance WANTS a
 * corner building walling off the approach; this map wants the opposite — the
 * lesson is the priority ladder, not the peek. So `sightClearM` is a validated
 * parameter: every building vertex must clear it on BOTH axes (min(|x|,|y|) >=
 * sightClearM), which keeps all four corner sight triangles empty. The
 * buildings stay as visual anchors only — the RHR tracker never reads them
 * (doc 72 JU-17: "world dressing, zero grading change").
 *
 * Contract battery:
 * platform/src/modules/sim/world/__tests__/jx-equal-districts.test.ts.
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_jx_equal.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { curbLaneOffsetM, toCurbLane } from "./lib/lane.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (gen_ju_junctions2's core, X-shaped)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,          // output file name + LessonSpec.world.districtId
 *   label: string,               // human label (meta)
 *   control: "none",             // equal crossroads only — see the validation
 *   ewArmM: number,              // west/east arm length from the node (60..400)
 *   nsArmM: number,              // south/north arm length from the node (60..400)
 *   lanes: number,               // marked lanes per edge, both directions (2 only)
 *   maxKmh: number,              // maxspeed on EVERY arm (equal junction)
 *   sightClearM: number,         // min |x| AND |y| of any building vertex (>= 24)
 *   buildingFootprints: Array<{ id: string, footprint: number[][] }>, // corner props
 * }} params
 */
export function buildEqualXDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    control,
    ewArmM,
    nsArmM,
    lanes,
    maxKmh,
    sightClearM,
    buildingFootprints,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (control !== "none") {
    errors.push(
      `control "${control}" is not generatable here: this generator builds the EQUAL crossroads ` +
        `(all four arms same class, same speed → the runtime derives right-hand rule). ` +
        `For a signed junction use tools/maps/gen_ju_junctions2.mjs (control "stop" → Б2 on a stem); ` +
        `"giveWay" is not generatable anywhere (stoplines.ts grades stop lines as Б2 full stops).`,
    );
  }
  if (!(ewArmM >= 60 && ewArmM <= 400)) errors.push(`ewArmM must be within 60..400 m, got ${ewArmM}`);
  if (!(nsArmM >= 60 && nsArmM <= 400)) errors.push(`nsArmM must be within 60..400 m, got ${nsArmM}`);
  if (lanes !== 2) errors.push(`lanes must be 2 (one per direction — the scenario junction standard), got ${lanes}`);
  if (![30, 40, 50].includes(maxKmh)) errors.push(`maxKmh must be 30|40|50, got ${maxKmh}`);
  // 24 m = the junction-area floor: below it a prop starts eating the approach
  // sightline the RHR lesson depends on (16 m only clears the carriageway).
  if (!(sightClearM >= 24)) errors.push(`sightClearM must be >= 24 m (open corners are this map's contract), got ${sightClearM}`);
  if (!Array.isArray(buildingFootprints) || buildingFootprints.length === 0) {
    errors.push(`buildingFootprints must be a non-empty array of { id, footprint }`);
  }
  if (errors.length > 0) throw new Error(`gen_jx_equal params invalid:\n  - ${errors.join("\n  - ")}`);

  // Control → classes. "none" needs EVERY arm at rank <= 2 or the
  // minor-meets-arterial heuristic (runtime/stoplines.ts) derives a stop line
  // and the junction stops being equal.
  const armClass = "residential";

  const NODES = {
    "jx-n-w": [-ewArmM, 0],
    "jx-n-c": [0, 0],
    "jx-n-e": [ewArmM, 0],
    "jx-n-s": [0, -nsArmM],
    "jx-n-n": [0, nsArmM],
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
      lanes,
      lanesSource: "tag",
      maxspeed,
      maxspeedSource: "tag",
      length: polylineLength(geometry),
      geometry,
    };
  };

  // Four arms into jx-n-c → degree 4. Both streets are named as equals: the
  // Bulgarian curriculum word for this junction is „равнозначно" — neither
  // road is главна.
  const EDGES = [
    edge("jx-e-w", "jx-n-w", "jx-n-c", armClass, maxKmh, "Западна улица"),
    edge("jx-e-e", "jx-n-c", "jx-n-e", armClass, maxKmh, "Източна улица"),
    edge("jx-e-s", "jx-n-s", "jx-n-c", armClass, maxKmh, "Южна улица"),
    edge("jx-e-n", "jx-n-c", "jx-n-n", armClass, maxKmh, "Северна улица"),
  ];

  const INTERSECTIONS = [
    { id: "jx-n-c", x: 0, y: 0, degree: 4, signalized: false },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  const BUILDINGS = buildingFootprints.map((b) => ({
    id: b.id,
    height: 5,
    heightSource: "default",
    footprint: b.footprint.map(([x, y]) => [r2(x), r2(y)]),
  }));

  // Spawns: 15 m inside each arm end (the gen_t_junction convention — on the
  // road centerline of the host edge, facing the junction).
  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: "jx-spawn-south",
        x: 0,
        y: r2(-(nsArmM - 15)),
        heading: 0,
        edgeId: "jx-e-s",
        name: "Южна улица — подход към кръстовището",
      },
      {
        id: "jx-spawn-north",
        x: 0,
        y: r2(nsArmM - 15),
        heading: 180,
        edgeId: "jx-e-n",
        name: "Северна улица — подход към кръстовището",
      },
      {
        id: "jx-spawn-east",
        x: r2(ewArmM - 15),
        y: 0,
        heading: 270,
        edgeId: "jx-e-e",
        name: "Източна улица — подход към кръстовището",
      },
      {
        id: "jx-spawn-west",
        x: r2(-(ewArmM - 15)),
        y: 0,
        heading: 90,
        edgeId: "jx-e-w",
        name: "Западна улица — подход към кръстовището",
      },
    ],
    EDGES,
  );

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
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }

  const totalKm = r2(EDGES.reduce((s, e) => s + e.length, 0) / 1000);

  const district = {
    format: "district-v1",
    meta: {
      district: districtId.replace(/-v\d+$/, ""),
      label,
      mapKind: "scenario-junction",
      generator: "tools/maps/gen_jx_equal.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно равнозначно кръстовище — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxKmh,
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
        archetype: "x-junction",
        params: {
          control,
          ewArmM,
          nsArmM,
          lanes,
          maxKmh,
          sightClearM,
        },
        junctionNodeId: "jx-n-c",
        expectedControl: "rightHandRule",
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
  // Self-validation (gen_ju_junctions2's invariants + the X/sightline ones)
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
  }
  for (const it of INTERSECTIONS) {
    if ((degree.get(it.id) ?? 0) !== it.degree) post.push(`${it.id}: degree mismatch`);
  }
  // The X contract: the centre node carries FOUR arms (a degree-3 centre is a
  // T and belongs to gen_ju_junctions2) and every arm end is a leaf.
  if ((degree.get("jx-n-c") ?? 0) !== 4) {
    post.push(`jx-n-c degree is ${degree.get("jx-n-c") ?? 0}, must be 4 (the equal-crossroads contract)`);
  }
  for (const leaf of ["jx-n-w", "jx-n-e", "jx-n-s", "jx-n-n"]) {
    if ((degree.get(leaf) ?? 0) !== 1) post.push(`${leaf}: arm end must be a leaf (degree 1)`);
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
    // doc 87 T2: "on its edge" used to mean "within a metre of its CENTRELINE",
    // i.e. the invariant enforced the defect it was supposed to catch.
    else if (Math.abs(distToEdge(host, s.x, s.y) - curbLaneOffsetM(host.lanes, host.oneway)) > 1)
      post.push(`${s.id}: not in its edge's curb lane`);
  }
  // Control derivation preconditions (mirrors runtime/stoplines.ts ranks):
  // ANY arterial-class arm would make the heuristic derive a stop line on the
  // others, and the junction would stop being равнозначно.
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  const ranks = EDGES.map((e) => RANK[e.class] ?? 2);
  if (Math.max(...ranks) >= 4) {
    post.push(`an arterial-class edge exists — the stop-sign heuristic would derive a line and break the equal junction`);
  }
  // Equality is the archetype: one class, one speed, all four arms.
  if (new Set(EDGES.map((e) => e.class)).size !== 1) post.push(`arms differ in class — an equal junction needs one class`);
  if (new Set(EDGES.map((e) => e.maxspeed)).size !== 1) post.push(`arms differ in maxspeed — an equal junction needs one limit`);
  // SIGHTLINES (this map's contract): every building vertex clears BOTH axes
  // by sightClearM, so all four corner sight triangles stay open. This
  // subsumes gen_ju_junctions2's carriageway check (sightClearM >= 24 > 16).
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.min(Math.abs(x), Math.abs(y)) < sightClearM) {
        post.push(
          `${bl.id}: footprint vertex (${x}, ${y}) intrudes on a corner sightline ` +
            `(min(|x|,|y|) = ${r2(Math.min(Math.abs(x), Math.abs(y)))} < sightClearM ${sightClearM})`,
        );
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
  if (post.length > 0) {
    throw new Error(`gen_jx_equal self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (wave 1: the equal-crossroads left turn)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // sc-jx-equal-left host: four equal residential arms, open corners. The
    // 130 m south arm puts the spawn at (0, −115) — the tj-occluded stem
    // geometry, so the approach tuning transfers; the 130 m west arm leaves
    // room to exit past the 40 m JUNCTION_AREA_RADIUS_M and collect the RHR
    // tracker's leaving-the-junction commendation.
    districtId: "jx-equal-v1",
    label: "Учебно равнозначно кръстовище с четири равностойни улици (сценарий JU-01/JU-10)",
    control: "none",
    ewArmM: 130,
    nsArmM: 130,
    lanes: 2,
    maxKmh: 40,
    sightClearM: 30,
    // Four quadrant anchors, symmetric — the „равнозначно" read is visual
    // before it is legal. All vertices sit at |x|,|y| >= 30: they frame the
    // junction without touching a single sight triangle.
    buildingFootprints: [
      { id: "jx-b-ne", footprint: [[30, 30], [46, 30], [46, 46], [30, 46]] },
      { id: "jx-b-nw", footprint: [[-46, 30], [-30, 30], [-30, 46], [-46, 46]] },
      { id: "jx-b-se", footprint: [[30, -46], [46, -46], [46, -30], [30, -30]] },
      { id: "jx-b-sw", footprint: [[-46, -46], [-30, -46], [-30, -30], [-46, -30]] },
    ],
  },
];

for (const params of INSTANCES) {
  const district = buildEqualXDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
  console.log(`=== jx-equal build: ${params.districtId} ===`);
  line("control", `${params.control} → ${district.meta.scenario.expectedControl}`);
  line("arms (E-W / N-S)", `${params.ewArmM} m / ${params.nsArmM} m`);
  line("centre degree", district.intersections[0].degree);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("sight clearance", `${params.sightClearM} m (all corners open)`);
  line("buildings", district.buildings.map((b) => b.id).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
