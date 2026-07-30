/**
 * gen_ju_junctions2.mjs — S3 batch-4 T-JUNCTION maps (Scenario Studio, doc 76
 * §3) → content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * A SECOND junction generator, deliberately standalone from
 * tools/maps/gen_t_junction.mjs so running it never rewrites the shipped
 * tj-rhr-v1 / tj-stop-v1 instances (that file writes on import). It shares
 * gen_t_junction's exact district-v1 shape and control→class derivation, and
 * adds ONE knob the shipped generator lacks: `buildingFootprints`, so a
 * restricted-view junction can place its sight-blocking corner building on the
 * approach side that matters (JU-17). Contract battery:
 * platform/src/modules/sim/world/__tests__/tj-junctions2-districts.test.ts.
 *
 * Two committed instances:
 *
 *  - tj-emerge-v1  — control "stop" (Б2 on the stem, PRIMARY priority road).
 *    Host of JU-04 „Спрях, но потеглих в дупка, която я няма": a priority car
 *    crosses from the main road and the give-way conflictNear adjudication at
 *    the Б2 line grades FAILED_TO_YIELD when the player emerges into it after
 *    a theatrical stop. Same derivation as tj-stop-v1, different arms
 *    (160 m / 100 m) so the trace is its own map.
 *
 *  - tj-occluded-v1 — control "none" (equal residential roads → the runtime
 *    derives ZERO stop lines and an UNCONTROLLED right-hand-rule junction).
 *    Host of JU-17 „Т-образно с ограничена видимост": IDENTICAL grading to the
 *    tj-rhr JU-01 host, but the corner building sits in the SE quadrant,
 *    walling off the driver's view of the car approaching from the RIGHT
 *    (east) — the creep-and-peek scenario. World dressing only; the RHR
 *    tracker never reads it (doc 72 JU-17: "world dressing, zero grading
 *    change").
 *
 * Deterministic: same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ju_junctions2.mjs
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
// The generator (gen_t_junction's core + a buildingFootprints override)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,          // output file name + LessonSpec.world.districtId
 *   label: string,               // human label (meta)
 *   control: "none"|"stop",      // priority control ("giveWay" rejected — see gen_t_junction)
 *   priorityArmM: number,        // west/east arm length from the node (60..400)
 *   minorArmM: number,           // stem length from the node (60..400)
 *   lanes: number,               // marked lanes per edge, both directions (2 only)
 *   priorityMaxKmh: number,      // maxspeed on the W–E road
 *   minorMaxKmh: number,         // maxspeed on the stem
 *   buildingFootprints: Array<{ id: string, footprint: number[][] }>, // corner props
 * }} params
 */
export function buildJunction2District(params) {
  const errors = [];
  const {
    districtId,
    label,
    control,
    priorityArmM,
    minorArmM,
    lanes,
    priorityMaxKmh,
    minorMaxKmh,
    buildingFootprints,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (control === "giveWay") {
    errors.push(
      `control "giveWay" is not generatable: the runtime grades stop lines as Б2 full stops ` +
        `(stoplines.ts excludes yield semantics by design). Use "none" (right-hand rule) or "stop" (Б2).`,
    );
  } else if (!["none", "stop"].includes(control)) {
    errors.push(`control must be "none" | "stop", got ${control}`);
  }
  if (!(priorityArmM >= 60 && priorityArmM <= 400)) errors.push(`priorityArmM must be within 60..400 m, got ${priorityArmM}`);
  if (!(minorArmM >= 60 && minorArmM <= 400)) errors.push(`minorArmM must be within 60..400 m, got ${minorArmM}`);
  if (lanes !== 2) errors.push(`lanes must be 2 (one per direction — the scenario junction standard), got ${lanes}`);
  if (![30, 40, 50].includes(priorityMaxKmh)) errors.push(`priorityMaxKmh must be 30|40|50, got ${priorityMaxKmh}`);
  if (![30, 40, 50].includes(minorMaxKmh)) errors.push(`minorMaxKmh must be 30|40|50, got ${minorMaxKmh}`);
  if (!Array.isArray(buildingFootprints) || buildingFootprints.length === 0) {
    errors.push(`buildingFootprints must be a non-empty array of { id, footprint }`);
  }
  if (errors.length > 0) throw new Error(`gen_ju_junctions2 params invalid:\n  - ${errors.join("\n  - ")}`);

  // Control → classes (gen_t_junction header: the runtime DERIVES the control).
  const priorityClass = control === "stop" ? "primary" : "residential";
  const minorClass = "residential";

  const NODES = {
    "tj-n-w": [-priorityArmM, 0],
    "tj-n-c": [0, 0],
    "tj-n-e": [priorityArmM, 0],
    "tj-n-s": [0, -minorArmM],
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

  const EDGES = [
    edge("tj-e-w", "tj-n-w", "tj-n-c", priorityClass, priorityMaxKmh, "Главна улица — запад"),
    edge("tj-e-e", "tj-n-c", "tj-n-e", priorityClass, priorityMaxKmh, "Главна улица — изток"),
    edge("tj-e-s", "tj-n-s", "tj-n-c", minorClass, minorMaxKmh, "Странична улица"),
  ];

  const INTERSECTIONS = [
    { id: "tj-n-c", x: 0, y: 0, degree: 3, signalized: false },
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
        id: "tj-spawn-south",
        x: 0,
        y: r2(-(minorArmM - 15)),
        heading: 0,
        edgeId: "tj-e-s",
        name: "Странична улица — подход към кръстовището",
      },
      {
        id: "tj-spawn-east",
        x: r2(priorityArmM - 15),
        y: 0,
        heading: 270,
        edgeId: "tj-e-e",
        name: "Главна улица — подход от изток",
      },
      {
        id: "tj-spawn-west",
        x: r2(-(priorityArmM - 15)),
        y: 0,
        heading: 90,
        edgeId: "tj-e-w",
        name: "Главна улица — подход от запад",
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
      generator: "tools/maps/gen_ju_junctions2.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        text: "Учебно Т-образно кръстовище — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: Math.max(priorityMaxKmh, minorMaxKmh),
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
        params: {
          control,
          priorityArmM,
          minorArmM,
          lanes,
          priorityMaxKmh,
          minorMaxKmh,
        },
        junctionNodeId: "tj-n-c",
        expectedControl: control === "stop" ? "stopSignOnMinor" : "rightHandRule",
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
  // Self-validation (mirrors gen_t_junction's invariants)
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
  // Control derivation preconditions (mirrors runtime/stoplines.ts ranks).
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  const ranks = EDGES.map((e) => RANK[e.class] ?? 2);
  if (control === "none" && Math.max(...ranks) >= 4) {
    post.push(`control "none" but an arterial-class edge exists — the heuristic would derive a stop line`);
  }
  if (control === "stop") {
    if (Math.max(...ranks) < 5) post.push(`control "stop" needs a PRIMARY priority road (visible Б2 sign, props.ts maxRank >= 5)`);
    if (RANK[minorClass] > 2) post.push(`control "stop": the stem must stay rank <= 2 for the heuristic to fire`);
  }
  // Building footprints must clear both carriageways + sidewalks (|x|,|y| >= 16).
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (Math.abs(x) < 16 && Math.abs(y) < 16) {
        post.push(`${bl.id}: footprint vertex (${x}, ${y}) intrudes on a carriageway/sidewalk`);
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
    throw new Error(`gen_ju_junctions2 self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instances (S3 batch 4: the second JUNCTION scenario wave)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // JU-04 host: Б2 „Спри!" on the stem; a priority car crosses the main road.
    districtId: "tj-emerge-v1",
    label: "Учебно Т-кръстовище със знак Б2 и преминаваща кола по главния път (сценарий JU-04)",
    control: "stop",
    priorityArmM: 160,
    minorArmM: 100,
    lanes: 2,
    priorityMaxKmh: 50,
    minorMaxKmh: 40,
    // The SW anchor building (gen_t_junction's default corner) — a visual mark,
    // clear of both carriageways.
    buildingFootprints: [
      { id: "tj-b-corner", footprint: [[-40, -40], [-26, -40], [-26, -26], [-40, -26]] },
    ],
  },
  {
    // JU-17 host: equal residential roads (right-hand rule) + a SE corner
    // building that walls off the view of the car approaching from the RIGHT.
    districtId: "tj-occluded-v1",
    label: "Учебно равнозначно Т-кръстовище с ограничена видимост надясно (сценарий JU-17)",
    control: "none",
    priorityArmM: 140,
    minorArmM: 130,
    lanes: 2,
    priorityMaxKmh: 40,
    minorMaxKmh: 40,
    // The sight-blocking building: SE quadrant (x>0, y<0), hugging the corner
    // but clearing the carriageway+sidewalk (|x|,|y| >= 20) — it hides the
    // east-arm car from a driver emerging north up the stem.
    buildingFootprints: [
      { id: "tj-b-occluder", footprint: [[20, -46], [46, -46], [46, -20], [20, -20]] },
    ],
  },
];

for (const params of INSTANCES) {
  const district = buildJunction2District(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
  console.log(`=== ju-junction2 build: ${params.districtId} ===`);
  line("control", `${params.control} → ${district.meta.scenario.expectedControl}`);
  line("arms (priority / minor)", `${params.priorityArmM} m / ${params.minorArmM} m`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("buildings", district.buildings.map((b) => b.id).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
