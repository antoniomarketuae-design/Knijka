/**
 * gen_jx_giveway.mjs — the GIVE-WAY (Б1) TWO-MOUTH map (Scenario Studio,
 * doc 76 §3) → content/world/<districtId>.json (+ byte-identical publish to
 * platform/public/world/).
 *
 * The 150th template's host. Standalone from tools/maps/gen_t_junction.mjs (its
 * closest basedOn) so running it never rewrites the shipped T instances (those
 * write on import). It shares gen_t_junction's district-v1 shape and, crucially,
 * REMOVES gen_t_junction's `control "giveWay"` rejection: the runtime NOW grades
 * a Б1 „Пропусни движението" line (giveWay control) — a rolling pass through a
 * CLEAR mouth is zero violations, an unyielded conflict is FAILED_TO_YIELD, no
 * full stop is ever demanded (ЗДвП чл. 50; rules/engine.ts give-way branch).
 *
 * THE TOPOLOGY (why a Б1 whose VISIBLE sign agrees needs SECONDARY arms meeting
 * a TERTIARY minor, proven from source):
 *   - the stop-sign heuristic (runtime/stoplines.ts) fires only for a minor of
 *     rank <= MINOR_MAX_RANK (2); a TERTIARY minor is rank 3, so it derives NO
 *     line — the giveWay STOP_LINE_OVERRIDES entry is then the SOLE source of a
 *     grading line, and it makes the node "guarded" (NOT an uncontrolled
 *     right-hand-rule junction, so the RHR tracker never double-grades);
 *   - the world builder's sign pass (world/builders/props.ts ~198-208) paints
 *     kind = maxRank >= 5 ? "stop" : "giveWay"; with SECONDARY arms the junction
 *     maxRank is 4 < 5, so it paints a VISIBLE Б1 on the same minor approach —
 *     graded control (giveWay) and the painted sign agree, with ZERO edits to
 *     props.ts. (tertiary+primary would paint "stop"; residential+secondary
 *     would DERIVE a stopSign line — both MISMATCH the giveWay grade.)
 *
 * THE SHAPE — a TERTIARY north-south street (the player's route) crossing TWO
 * SECONDARY east-west boulevards, so ONE route carries TWO give-way mouths:
 *
 *   jxg-n-w1 ───── jxg-n-j1 ───── jxg-n-e1     secondary boulevard (mouth 1)
 *                     │
 *                     │  tertiary (player's route, S → N)
 *                     │
 *   jxg-n-w2 ───── jxg-n-j2 ───── jxg-n-e2     secondary boulevard (mouth 2)
 *                     │
 *                  jxg-n-s (spawn, southbound approach)
 *
 * (drawn top-down; jxg-n-j2 is NORTH of jxg-n-j1, and jxg-n-s is south of both.)
 *
 * Mouth 1 (jxg-n-j1) is CLEAR — no staged actor reaches it — so the shadow
 * ROLLS through it at a yield pace with a full ляво-дясно scan and grades zero
 * (the crux: Б1 ≠ „спри винаги"). Mouth 2 (jxg-n-j2) is CONFLICTED by the
 * template's staged priorityFromRight car, so the shadow WAITS there and only
 * then crosses. Unique node/edge ids (jxg-*) keep the two giveWay
 * STOP_LINE_OVERRIDES entries skip-safe on every foreign shipped map.
 *
 * No signals, no crossings, no roundabouts (doc 76 §3 — a junction map teaches
 * priority, nothing else). Deterministic: same params → byte-identical JSON.
 * No randomness, no OSM. Run:  node tools/maps/gen_jx_giveway.mjs
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
// The generator
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,          // output file name + LessonSpec.world.districtId
 *   label: string,               // human label (meta)
 *   southArmM: number,           // spawn stem: jxg-n-s → jxg-n-j1 (60..400)
 *   midArmM: number,             // between the mouths: jxg-n-j1 → jxg-n-j2 (60..400)
 *   northArmM: number,           // exit: jxg-n-j2 → jxg-n-n (60..400)
 *   ewArmM: number,              // each secondary boulevard arm from its node (60..400)
 *   lanes: number,               // marked lanes per edge, both directions (2 only)
 *   minorMaxKmh: number,         // maxspeed on the TERTIARY NS street
 *   priorityMaxKmh: number,      // maxspeed on the SECONDARY EW boulevards
 * }} params
 */
export function buildGiveWayDistrict(params) {
  const errors = [];
  const {
    districtId,
    label,
    southArmM,
    midArmM,
    northArmM,
    ewArmM,
    lanes,
    minorMaxKmh,
    priorityMaxKmh,
  } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  for (const [k, v] of [
    ["southArmM", southArmM],
    ["midArmM", midArmM],
    ["northArmM", northArmM],
    ["ewArmM", ewArmM],
  ]) {
    if (!(v >= 60 && v <= 400)) errors.push(`${k} must be within 60..400 m, got ${v}`);
  }
  if (lanes !== 2) errors.push(`lanes must be 2 (one per direction — the scenario junction standard), got ${lanes}`);
  if (![30, 40, 50].includes(minorMaxKmh)) errors.push(`minorMaxKmh must be 30|40|50, got ${minorMaxKmh}`);
  if (![30, 40, 50].includes(priorityMaxKmh)) errors.push(`priorityMaxKmh must be 30|40|50, got ${priorityMaxKmh}`);
  if (errors.length > 0) throw new Error(`gen_jx_giveway params invalid:\n  - ${errors.join("\n  - ")}`);

  // Classes: the NS street is TERTIARY (the minor — rank 3, so the stop-sign
  // heuristic skips it and the giveWay override is the sole grading line), the
  // EW boulevards SECONDARY (rank 4 — arterial, so props paints a Б1 not a Б2).
  const minorClass = "tertiary";
  const priorityClass = "secondary";

  const y1 = 0;
  const y2 = midArmM;
  const NODES = {
    "jxg-n-s": [0, -southArmM],
    "jxg-n-j1": [0, y1],
    "jxg-n-j2": [0, y2],
    "jxg-n-n": [0, y2 + northArmM],
    "jxg-n-w1": [-ewArmM, y1],
    "jxg-n-e1": [ewArmM, y1],
    "jxg-n-w2": [-ewArmM, y2],
    "jxg-n-e2": [ewArmM, y2],
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

  // Tertiary NS street (the player's route: s → j1 → j2 → n, geometry pointing
  // NORTH so a northbound approach crosses each giveWay line with dirSign +1).
  const EDGES = [
    edge("jxg-e-s", "jxg-n-s", "jxg-n-j1", minorClass, minorMaxKmh, "ул. Второстепенна — подход"),
    edge("jxg-e-m", "jxg-n-j1", "jxg-n-j2", minorClass, minorMaxKmh, "ул. Второстепенна — между кръстовищата"),
    edge("jxg-e-n", "jxg-n-j2", "jxg-n-n", minorClass, minorMaxKmh, "ул. Второстепенна — изход"),
    // Secondary EW boulevards (priority roads).
    edge("jxg-e-w1", "jxg-n-w1", "jxg-n-j1", priorityClass, priorityMaxKmh, "бул. Първи — запад"),
    edge("jxg-e-e1", "jxg-n-j1", "jxg-n-e1", priorityClass, priorityMaxKmh, "бул. Първи — изток"),
    edge("jxg-e-w2", "jxg-n-w2", "jxg-n-j2", priorityClass, priorityMaxKmh, "бул. Втори — запад"),
    edge("jxg-e-e2", "jxg-n-j2", "jxg-n-e2", priorityClass, priorityMaxKmh, "бул. Втори — изток"),
  ];

  const INTERSECTIONS = [
    { id: "jxg-n-j1", x: 0, y: y1, degree: 4, signalized: false },
    { id: "jxg-n-j2", x: 0, y: y2, degree: 4, signalized: false },
  ];
  const CROSSINGS = [];
  const ROUNDABOUTS = [];

  // Visual anchors clear of every carriageway + sidewalk (secondary half-width
  // <= 12.13 m + ~4 m sidewalk → keep vertices >= 26 from the NS line at x=0
  // and >= 26 from each EW line at y = y1 / y2). Both sit in the block between
  // the mouths, away from all four sight triangles.
  const BUILDINGS = [
    {
      id: "jxg-b-mid-e",
      height: 5,
      heightSource: "default",
      footprint: [
        [30, r2(y1 + 40)],
        [46, r2(y1 + 40)],
        [46, r2(y1 + 56)],
        [30, r2(y1 + 56)],
      ],
    },
    {
      id: "jxg-b-mid-w",
      height: 5,
      heightSource: "default",
      footprint: [
        [-46, r2(y2 - 56)],
        [-30, r2(y2 - 56)],
        [-30, r2(y2 - 40)],
        [-46, r2(y2 - 40)],
      ],
    },
  ];

  // Spawns: 15 m inside the arm end (the gen_t_junction convention — on the
  // road centerline of the host edge, facing the junction).
  // doc 87 T2 — a spawn pose belongs in the CURB LANE of the edge it faces
  // along, not on its centreline: the old convention handed the student a car
  // already straddling the осева and the rule engine convicted him of
  // «Настъпване на осевата линия» seconds later, for a pose he never chose.
  // toCurbLane() leaves a deliberately off-centre pose exactly where it is.
  const SPAWN_POINTS = toCurbLane(
    [
      {
        id: "jxg-spawn-south",
        x: 0,
        y: r2(-(southArmM - 15)),
        heading: 0,
        edgeId: "jxg-e-s",
        name: "Второстепенна улица — подход към първото кръстовище",
      },
      {
        id: "jxg-spawn-e2",
        x: r2(ewArmM - 15),
        y: y2,
        heading: 270,
        edgeId: "jxg-e-e2",
        name: "Булевард с предимство — подход от изток",
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
      generator: "tools/maps/gen_jx_giveway.mjs",
      boundsLocalMeters: bounds,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна улица с два знака Б1 „Пропусни движението“ — оригинален параметричен дизайн (без данни от OpenStreetMap)",
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
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the derived
       * control truth so specs/tests cross-check the generator's intent
       * against the runtime derivation. The give-way lines themselves are
       * authored in runtime STOP_LINE_OVERRIDES (control "giveWay"), keyed to
       * the two jxg-* approach edges below — the heuristic manufactures none.
       */
      scenario: {
        archetype: "x-junction",
        params: {
          southArmM,
          midArmM,
          northArmM,
          ewArmM,
          lanes,
          minorMaxKmh,
          priorityMaxKmh,
        },
        junctionNodeIds: ["jxg-n-j1", "jxg-n-j2"],
        /** The player's give-way approach edge into each mouth (STOP_LINE_OVERRIDES keys). */
        giveWayApproaches: [
          { nodeId: "jxg-n-j1", edgeId: "jxg-e-s" },
          { nodeId: "jxg-n-j2", edgeId: "jxg-e-m" },
        ],
        /** What the runtime must derive at each mouth: a Б1 give-way line (from
         *  the override), NOT a Б2 stop line — and the junction stays guarded. */
        expectedControl: "giveWayOnMinor",
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
  // Self-validation (the invariants tools/osm/build.mjs + gen_t_junction enforce)
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
  // The two-mouth contract: each centre node carries FOUR arms (degree 4) and
  // every arm end is a leaf.
  for (const j of ["jxg-n-j1", "jxg-n-j2"]) {
    if ((degree.get(j) ?? 0) !== 4) post.push(`${j} degree is ${degree.get(j) ?? 0}, must be 4`);
  }
  for (const leaf of ["jxg-n-s", "jxg-n-n", "jxg-n-w1", "jxg-n-e1", "jxg-n-w2", "jxg-n-e2"]) {
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
  // Control-derivation preconditions (mirrors runtime/stoplines.ts +
  // world/builders/props.ts ranks — the whole reason this topology yields a
  // graded Б1 whose visible sign agrees):
  const RANK = { primary: 5, secondary: 4, tertiary: 3, unclassified: 2, residential: 2, service: 1 };
  for (const j of INTERSECTIONS) {
    const incident = EDGES.filter((e) => e.from === j.id || e.to === j.id);
    const ranks = incident.map((e) => RANK[e.class] ?? 2);
    const maxRank = Math.max(...ranks);
    const minRank = Math.min(...ranks);
    // (a) an arterial arm exists (secondary rank 4) so props paints a priority
    //     sign on the minor at all…
    if (maxRank < 4) post.push(`${j.id}: no arterial arm — props paints no priority sign`);
    // (b) …the minor is TERTIARY (rank 3), so the stop-sign heuristic SKIPS it
    //     (rank 3 > MINOR_MAX_RANK 2) and derives NO line — the giveWay
    //     override is the sole grading source…
    if (minRank <= 2) post.push(`${j.id}: a rank<=2 minor exists — the stop-sign heuristic would DERIVE a Б2 line`);
    if (minRank !== 3) post.push(`${j.id}: the minor must be tertiary (rank 3), got minRank ${minRank}`);
    // (c) …and the junction maxRank < 5, so props paints "giveWay" (Б1), not
    //     "stop" (Б2). A primary arm would flip it to a visible Б2 mismatch.
    if (maxRank >= 5) post.push(`${j.id}: maxRank ${maxRank} >= 5 — props would paint a Б2 (stop), not a Б1`);
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
    throw new Error(`gen_jx_giveway self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// Committed instance (the 150th template: sc-jx-giveway-b1)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    // sc-jx-giveway-b1 host: a tertiary street with TWO Б1 mouths — mouth 1
    // clear (the rolling-pass crux), mouth 2 conflicted (the yield). The 150 m
    // mid arm keeps the mouth-2 priority runner idle while the player handles
    // mouth 1 (its armDistM ~65 m << 150 m), and leaves room for a fresh scan.
    districtId: "jxg-giveway-v1",
    label: "Учебна улица с два знака Б1 „Пропусни движението“ (сценарий JU-02)",
    southArmM: 130,
    midArmM: 150,
    northArmM: 90,
    ewArmM: 120,
    lanes: 2,
    minorMaxKmh: 40,
    priorityMaxKmh: 50,
  },
];

for (const params of INSTANCES) {
  const district = buildGiveWayDistrict(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);
  console.log(`=== jx-giveway build: ${params.districtId} ===`);
  line("mouths", `${district.meta.scenario.junctionNodeIds.join(", ")} → ${district.meta.scenario.expectedControl}`);
  line("arms (S / mid / N / EW)", `${params.southArmM} / ${params.midArmM} / ${params.northArmM} / ${params.ewArmM} m`);
  line("nodes / edges", `${district.meta.stats.nodes} / ${district.meta.stats.edges}`);
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("bounds", `${r2(district.meta.boundsLocalMeters.maxX - district.meta.boundsLocalMeters.minX)} x ${r2(district.meta.boundsLocalMeters.maxY - district.meta.boundsLocalMeters.minY)} m`);
  line("output", `${CONTENT_FILE} (+ public copy)`);
  console.log("Validation OK.");
}
