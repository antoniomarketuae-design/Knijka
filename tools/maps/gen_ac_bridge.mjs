/**
 * gen_ac_bridge.mjs — the BRIDGE-DECK micro-map (the „мостът замръзва пръв"
 * slice; Scenario Studio doc 76 §3; doc 72 §13 AC-08 ice band). The exact
 * straight-street shape of gen_ac_surface.mjs — ONE plain two-way street (one
 * marked lane per direction) carrying a posted limit and NOTHING else: no
 * crossing, no junction, no signal — PLUS one authored `icePatch` span.
 *
 * WHY A SECOND ICE MAP AND NOT ac-ice-v1 (read before "consolidating" these):
 * ac-ice-v1's „bridge" is NARRATIVE — a flat 360 m street whose span happens to
 * be called a bridge, with one block of set dressing 100 m away from it. That
 * map teaches ICE RESPONSE (sc-ac-ice: you are already on it — now be smooth).
 * This map teaches ICE ANTICIPATION: the deck has to be READABLE AS A BRIDGE
 * from the approach, because the whole skill is lifting off BEFORE you reach it.
 * Three data facts do that work here, and none of them exists on ac-ice-v1:
 *
 *   1. THE VOID. The district-v1 schema has no bridge primitive (no deck, no
 *      pier, no water — see the report note). What it does have is buildings,
 *      and their ABSENCE reads as a gorge: this map lines BOTH banks of the
 *      approach and BOTH banks of the far side with blocks, and leaves y ∈
 *      (210, 380) completely empty. The driver crests the last block, the city
 *      falls away on both sides for 170 m, and the deck is the thing spanning
 *      it. The generator ASSERTS that void (see the self-validation below) —
 *      a future editor who drops a block into the gap fails the build.
 *   2. THE POST. The icePatch span places its А15 („Опасност от хлъзгане")
 *      post at the span START by the shipped zone-sign pass
 *      (world/builders/zoneSigns.ts: icePatch -> "slippery"), i.e. at the near
 *      abutment — the approach warning sign, free, from the same data that
 *      grades. The battery pins it there.
 *   3. THE ROOM. 520 m, deck [250, 340]: 250 m of dry approach to read the
 *      cues in, a 90 m deck (long enough that the 3 s POOR_LANE_KEEPING
 *      sustain fits inside it at road speed) and 180 m of dry far side to
 *      demonstrate that acceleration belongs PAST the abutment, not on it.
 *
 * The span is consumed by the PHYSICS RIG (runtime/surface.ts → VehicleRig →
 * VehicleSim.setSurfaceGripFactor), NOT by the rule-engine tick — worldRuntime
 * ignores the kind (unknown-kind tolerance), so this map adds NO grading
 * channel: the physical outcome (a tail that steps out, a slide into the
 * parapet) is graded by shipped machinery.
 *
 * The exact district-v1 format buildWorldGeometry (world), createWorldRuntime
 * (runtime) and buildLaneGraph/createTrafficSystem (traffic) already consume.
 * Contract battery: platform/src/modules/sim/world/__tests__/
 * ac-bridge-districts.test.ts.
 *
 * Layout (x = east, y = north; the street runs south → north on x = 0):
 *
 *     <p>-n-end (0, L)                     L = lengthM
 *         │
 *     ▓▓  │  ▓▓   far bank blocks (y >= 390) — the city resumes
 *         │
 *     ────┼────   far abutment (deck.toM)
 *         │
 *         ▓▓▓     THE DECK: icePatch [fromM, toM], the void on both sides
 *         │
 *     ────┼────   near abutment (deck.fromM) — the А15 post stands here
 *         │
 *     ▓▓  │  ▓▓   approach bank blocks (y <= 200)
 *         │
 *     <p>-spawn-approach (4.06, 15)
 *         │
 *     <p>-n-start (0, 0)
 *
 * Ambient traffic is authored to ZERO by every drive (seed 7). Deterministic:
 * same params → byte-identical JSON. No randomness, no OSM.
 * Run:  node tools/maps/gen_ac_bridge.mjs
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

/** The void the generator enforces around the deck: no building footprint may
 *  come within this many meters of the abutments (the gorge IS the visual). */
const DECK_VOID_PAD_M = 40;

const r2 = (v) => Math.round(v * 100) / 100;

function polylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  }
  return r2(len);
}

// ---------------------------------------------------------------------------
// The generator (one straight two-way street + ONE icePatch deck span + the
// two banks that make the deck read as a bridge)
// ---------------------------------------------------------------------------

/**
 * @param {{
 *   districtId: string,   // output file name + LessonSpec.world.districtId
 *   idPrefix: string,     // node/edge/spawn id prefix (kebab-case)
 *   label: string,        // human label (meta)
 *   nameBg: string,       // street display name (edge.name)
 *   roadClass: string,    // OSM-style class ("residential" | "unclassified")
 *   lengthM: number,      // street length (200..1000)
 *   maxspeedKmh: number,  // legal limit on the street (30..90)
 *   deck: {
 *     fromM: number, toM: number,     // the bridge deck = the icePatch span
 *     patchGripFactor: number,        // tuning.ICE_PATCH_GRIP_FACTOR copy
 *     signRef: string,                // provenance ("А15" — Опасност от хлъзгане)
 *     noteBg: string,                 // meta provenance note
 *   },
 * }} params
 */
export function buildBridgeStreet(params) {
  const errors = [];
  const { districtId, idPrefix, label, nameBg, roadClass, lengthM, maxspeedKmh, deck } = params;

  // -- Parameter validation (actionable — the assembly line runs unattended).
  if (!/^[a-z0-9-]+$/.test(districtId ?? "")) errors.push(`districtId "${districtId}" must be kebab-case`);
  if (!/^[a-z0-9-]+$/.test(idPrefix ?? "")) errors.push(`idPrefix "${idPrefix}" must be kebab-case`);
  if (!(lengthM >= 200 && lengthM <= 1000)) errors.push(`lengthM must be within 200..1000 m, got ${lengthM}`);
  if (!(maxspeedKmh >= 30 && maxspeedKmh <= 90)) errors.push(`maxspeedKmh must be within 30..90, got ${maxspeedKmh}`);
  if (!["residential", "unclassified"].includes(roadClass)) errors.push(`roadClass "${roadClass}" must be residential|unclassified`);
  if (!deck) {
    errors.push(`deck is required`);
  } else {
    // The deck needs a READABLE approach (the anticipation is the lesson) and a
    // far side long enough to prove where acceleration belongs.
    if (!(deck.fromM >= 150 && deck.fromM < deck.toM && deck.toM <= lengthM - 120)) {
      errors.push(
        `deck span [${deck.fromM}, ${deck.toM}] must satisfy 150 <= from < to <= length-120 ` +
          `(a bridge you cannot read from afar teaches nothing)`,
      );
    }
    if (!(deck.toM - deck.fromM >= 60)) {
      errors.push(`deck must be >= 60 m long (the 3 s lane-keeping sustain has to fit on it), got ${deck.toM - deck.fromM}`);
    }
    if (!(deck.patchGripFactor > 0 && deck.patchGripFactor < 1)) {
      errors.push(`deck.patchGripFactor must be in (0, 1), got ${deck.patchGripFactor}`);
    }
    if (deck.aquaplaneAboveKmh !== undefined) {
      errors.push(`an icePatch must NOT carry aquaplaneAboveKmh (ice bites at any speed)`);
    }
  }
  if (errors.length > 0) throw new Error(`gen_ac_bridge params invalid:\n  - ${errors.join("\n  - ")}`);

  const halfRoadM = SCALED_LANE_W; // 2 lanes total → half-width = one drawn lane
  const laneCenterM = r2(SCALED_LANE_W / 2); // right-lane center offset from x=0

  const EDGE_ID = `${idPrefix}-e-street`;
  const NODE_START = `${idPrefix}-n-start`;
  const NODE_END = `${idPrefix}-n-end`;
  const SPAWN_APPROACH = `${idPrefix}-spawn-approach`;
  const SPAWN_FINISH = `${idPrefix}-spawn-finish`;

  // -- Nodes / edge (one straight street; no junctions).
  const NODES = {
    [NODE_START]: [0, 0],
    [NODE_END]: [0, lengthM],
  };
  const geometry = [
    [0, 0],
    [0, lengthM],
  ];
  const EDGES = [
    {
      id: EDGE_ID,
      from: NODE_START,
      to: NODE_END,
      class: roadClass,
      name: nameBg,
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

  const INTERSECTIONS = []; // degree-2 street — none by the OSM-build convention
  const CROSSINGS = []; // a pure surface drill carries no crossing
  const ROUNDABOUTS = [];

  // -- The deck (the reason this generator exists): ONE icePatch span. The
  // zone-sign pass turns fromM into the А15 post on the near abutment.
  const ZONES = [
    {
      id: `${idPrefix}-z-deck-ice`,
      kind: "icePatch",
      edgeId: EDGE_ID,
      fromM: deck.fromM,
      toM: deck.toM,
      signRef: deck.signRef,
      patchGripFactor: deck.patchGripFactor,
    },
  ];

  // -- Spawns: approach start (right-lane center) + a finish reference point.
  const SPAWN_POINTS = [
    {
      id: SPAWN_APPROACH,
      x: laneCenterM,
      y: 15,
      heading: 0,
      edgeId: EDGE_ID,
      name: "Начало на отсечката — преди моста",
    },
    {
      id: SPAWN_FINISH,
      x: laneCenterM,
      y: r2(lengthM - 15),
      heading: 0,
      edgeId: EDGE_ID,
      name: "Контролна точка — след отсрещния устой",
    },
  ];

  // -- THE TWO BANKS. Blocks flank both sides of the approach and both sides of
  // the far end; the deck's 170 m window stays empty (see DECK_VOID_PAD_M) so
  // the gorge — and therefore the bridge — is legible from the approach. This
  // is the ONLY visual channel the district-v1 schema offers for a bridge.
  const blockNearX = r2(halfRoadM + 8); // clear of carriageway + ~4 m sidewalk
  const blockFarX = r2(halfRoadM + 20);
  const bank = (id, xInner, xOuter, y0, y1) => ({
    id: `${idPrefix}-b-${id}`,
    height: 9,
    heightSource: "default",
    footprint: [
      [xInner, y0],
      [xOuter, y0],
      [xOuter, y1],
      [xInner, y1],
    ],
  });
  const APPROACH_Y = [110, 200];
  const FAR_Y = [390, 465];
  const BUILDINGS = [
    bank("approach-w", r2(-blockNearX), r2(-blockFarX), APPROACH_Y[0], APPROACH_Y[1]),
    bank("approach-e", blockNearX, blockFarX, APPROACH_Y[0], APPROACH_Y[1]),
    bank("far-w", r2(-blockNearX), r2(-blockFarX), FAR_Y[0], FAR_Y[1]),
    bank("far-e", blockNearX, blockFarX, FAR_Y[0], FAR_Y[1]),
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
      generator: "tools/maps/gen_ac_bridge.mjs",
      boundsLocalMeters: bounds,
      // Zone layer marker (ADR-006 stage 2a version contract): existing
      // vocabulary, same shape — zonesVersion stays 1.
      zonesVersion: 1,
      attribution: {
        // Original, parametric layout — NOT derived from OpenStreetMap.
        text: "Учебна права улица с мостово съоръжение и заледена настилка на моста — оригинален параметричен дизайн (без данни от OpenStreetMap)",
        license: "All rights reserved",
        licenseUrl: "/",
        copyrightUrl: "/",
        obligation: "none — original work, no ODbL attribution required for this map",
      },
      defaults: {
        maxspeedUrbanKmh: maxspeedKmh,
        note: deck.noteBg,
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
      /**
       * Scenario Studio payload (doc 76): the archetype recipe + the lane
       * truth. ScenarioSpecs pin the right-lane center by value and the
       * contract battery asserts the copy matches this file. The deck span is
       * NOT duplicated here — zones[0] is its single truth.
       */
      scenario: {
        archetype: "straight-street",
        params: { lengthM, maxspeedKmh },
        lanesPerDirection: 1,
        laneCenterRightM: laneCenterM,
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
    zones: ZONES,
  };

  // -------------------------------------------------------------------------
  // Self-validation (the invariants tools/osm/build.mjs + gen_ac_surface
  // enforce, PLUS the void that makes this map a bridge and not a street)
  // -------------------------------------------------------------------------
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
    if (e.length <= 0) post.push(`${e.id}: zero length`);
    if (e.lanes !== 2 || e.oneway) post.push(`${e.id}: the archetype is a two-way 1+1 street (lanes 2)`);
  }
  for (const z of ZONES) {
    if (z.edgeId !== EDGE_ID) post.push(`${z.id}: unknown edgeId ${z.edgeId}`);
    if (!(z.fromM >= 0 && z.fromM < z.toM && z.toM <= lengthM)) post.push(`${z.id}: span outside the edge`);
    if (z.kind !== "icePatch") post.push(`${z.id}: this generator authors exactly one icePatch deck span`);
  }
  const distToStreet = (x, y) => Math.abs(x) + (y < 0 ? -y : y > lengthM ? y - lengthM : 0);
  for (const s of SPAWN_POINTS) {
    if (s.edgeId !== EDGE_ID) post.push(`${s.id}: unknown edgeId ${s.edgeId}`);
    if (distToStreet(s.x, s.y) > halfRoadM) post.push(`${s.id}: not on the carriageway`);
  }
  // THE VOID (this generator's own invariant): nothing may stand within
  // DECK_VOID_PAD_M of either abutment. Buildings beside the deck would read as
  // a street with a slippery patch — which is the map this one exists to NOT be.
  const voidFrom = deck.fromM - DECK_VOID_PAD_M;
  const voidTo = deck.toM + DECK_VOID_PAD_M;
  for (const bl of BUILDINGS) {
    for (const [x, y] of bl.footprint) {
      if (y > voidFrom && y < voidTo) {
        post.push(`${bl.id}: footprint point (${x}, ${y}) stands in the deck void [${voidFrom}, ${voidTo}] — the gorge IS the bridge`);
      }
      if (Math.abs(x) <= halfRoadM + 4) post.push(`${bl.id}: footprint point (${x}, ${y}) overlaps the carriageway/sidewalk`);
    }
  }
  // Both banks, both sides — a bridge with a city on one side only is a cliff.
  for (const side of ["approach", "far"]) {
    for (const dir of ["w", "e"]) {
      if (!BUILDINGS.some((b) => b.id === `${idPrefix}-b-${side}-${dir}`)) {
        post.push(`missing the ${side}-${dir} bank block — both banks must be dressed on both sides`);
      }
    }
  }
  if (laneCenterM <= 0 || laneCenterM >= halfRoadM) post.push(`right-lane center ${laneCenterM} outside the northbound bank`);
  if (!Number.isFinite(bounds.minX) || bounds.maxX <= bounds.minX || bounds.maxY <= bounds.minY) {
    post.push("degenerate bounds");
  }
  if (post.length > 0) {
    throw new Error(`gen_ac_bridge self-validation FAILED:\n  - ${post.join("\n  - ")}`);
  }

  return district;
}

// ---------------------------------------------------------------------------
// The committed instance (the „мостът замръзва пръв" drill)
// ---------------------------------------------------------------------------

const INSTANCES = [
  {
    districtId: "ac-bridge-v1",
    idPrefix: "ac-bridge",
    label: "Учебна улица с мост — заледена настилка на съоръжението (сценарий AC-08, антиципация)",
    nameBg: "Улица с мост над дерето",
    roadClass: "residential",
    lengthM: 520,
    maxspeedKmh: 50,
    deck: {
      fromM: 250,
      toM: 340,
      // COPY of tuning.ICE_PATCH_GRIP_FACTOR — battery-pinned (the LANE_X
      // by-value discipline: tuning.ts stays the single documented truth).
      patchGripFactor: 0.15,
      signRef: "А15",
      noteBg:
        "Права улица (50 км/ч) с мост при [250, 340] м: улицата е суха, но настилката на съоръжението е заледена — под нея няма топла земя. Сцеплението на моста е ~15% от сухото при всяка скорост; знакът А15 „Опасност от хлъзгане“ стои на близкия устой.",
    },
  },
];

const line = (k, v) => console.log(`  ${String(k).padEnd(28)} ${v}`);

for (const params of INSTANCES) {
  const district = buildBridgeStreet(params);
  const out = JSON.stringify(district, null, 1) + "\n";
  JSON.parse(out); // JSON validity self-check

  const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${params.districtId}.json`);
  const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${params.districtId}.json`);
  mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
  mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
  writeFileSync(CONTENT_FILE, out);
  writeFileSync(PUBLIC_FILE, out); // byte-identical publish

  console.log(`=== ac-bridge build: ${params.districtId} ===`);
  line("length / limit", `${params.lengthM} m / ${params.maxspeedKmh} km/h`);
  line("deck (icePatch)", `[${params.deck.fromM}, ${params.deck.toM}] grip ${params.deck.patchGripFactor}`);
  line("deck void", `[${params.deck.fromM - DECK_VOID_PAD_M}, ${params.deck.toM + DECK_VOID_PAD_M}] — asserted empty`);
  line("right-lane center", `${district.meta.scenario.laneCenterRightM} m east`);
  line("banks", district.buildings.map((b) => b.id).join(", "));
  line("spawns", district.spawnPoints.map((s) => s.id).join(", "));
  line("output", `${CONTENT_FILE} (+ public copy)`);
}
console.log("Validation OK.");
