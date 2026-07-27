/**
 * gen_lc_gantry.mjs — lc-gantry-v1: the lane-control-signal boulevard (doc 72
 * LC, sc-lane-control-signal). A DIVIDED boulevard modelled as two ONE-WAY
 * carriageways so the shipped WRONG_WAY detector alone convicts a driver who
 * rides the X-closed lane (the LOCKED decision: the X-closed lane IS oncoming
 * traffic; NO new lane-signal engine code):
 *   - lcg-e-open   : the OPEN carriageway at x = +6, one-way NORTH (green ↓).
 *   - lcg-e-closed : the CLOSED carriageway at x = −6, one-way SOUTH (red ✕) —
 *     the oncoming bank. A northbound driver who swaps into it drives against a
 *     one-way's flow → tick.wrongWay → WRONG_WAY, and meets the oncoming stream
 *     head-on → COLLISION.
 * The overhead gantry itself is render-only (meta.scenario.laneGantry, drawn by
 * world/components/LaneSignalGantry.tsx) — a passthrough meta block, so this map
 * loads and grades with the ordinary straight-street machinery.
 *
 * ---------------------------------------------------------------------------
 * FOUNDER REVIEW 2026-07-27 — THE CROSS-SECTION REDESIGN
 * ---------------------------------------------------------------------------
 * Verbatim: „the car is moving on top of the street lights and also the traffic
 * cars are moving on top of the side bars where the people walk on the road".
 * He was right, and the arithmetic says exactly why. The carriageway pitch here
 * is 12 m (x = ±6), but the drawn cross-section of a `secondary` edge is
 *   halfWidth = lanes×LANE_WIDTH_M/2 + PARKING_LANE_WIDTH_M = 4.06 + 4.00 = 8.06 m
 * (LANE_WIDTH_M is 3.25 m × PERCEPTUAL_ROAD_SCALE = 8.125 m), and the city
 * dressing hangs off that:
 *   - the two 16.1 m ribbons OVERLAPPED across x ∈ [−2.06, +2.06] — road on road;
 *   - each carriageway's INNER pavement (halfWidth → halfWidth+3.5) landed on
 *     the other's travel lane, so the ambient stream drove on the pavement;
 *   - each carriageway's lamp row (halfWidth+3.5+0.4 = 11.96 m out, alternating
 *     sides) put a column at x = ∓5.96 — 4 cm off the OTHER carriageway's lane
 *     centre. That is the streetlight the ego drove through;
 *   - the curbside parked-car row (TrafficLayer PARK_CLASSES, travelHalf+2.0 m)
 *     parked cars at x ≈ ∓0.06 — two rows interpenetrating in the median;
 *   - the gantry's own posts (x = ±halfSpanM = ±9) stood ON the asphalt.
 *
 * The redesign keeps every graded number and fixes the cross-section:
 *   1. class `secondary_link`, not `secondary`. Still MARKED (lane paint) and
 *      ARTERIAL (lamp row) — but outside PARKING_LANE_CLASSES and outside
 *      TrafficLayer's PARK_CLASSES, so the ribbon is exactly its one 8.125 m
 *      lane (halfWidth 4.06) and nothing parks on a boulevard whose kerbs are a
 *      median and a bus-less verge. A 1-lane carriageway simply cannot carry a
 *      4 m parking band at a 12 m pitch: that band alone is what overlapped.
 *   2. `bareVerge: "left"` on BOTH carriageways (world/builders/network.ts).
 *      The median is the left verge of each (open travels north, closed south),
 *      and a median kerb carries no pavement and no lamp row — the columns for
 *      both halves stand on the OUTER verges, arms reaching in, which is what a
 *      Sofia boulevard actually looks like.
 *   3. the gantry span widened past the new kerb line so its posts stand on the
 *      outer pavement instead of in the ego's lane.
 *
 * GRADING IS UNTOUCHED — deliberately, and asserted below: the lane centres
 * stay x = ±6, the edge/node/spawn ids, the one-way directions, `lanes`, the
 * 50 km/h limit and the 360 m length are all as they were, so the recorded
 * traces, the success zone (x=6, y=345) and the WRONG_WAY conviction land
 * exactly where they did. Only the DRESSING moved.
 *
 * Dual-write (content/world + platform/public/world), the gen_ov_solid2 mold.
 * Run:  node tools/maps/gen_lc_gantry.mjs
 *
 * Contract battery: platform/src/modules/sim/world/__tests__/lane-gantry.test.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const DISTRICT_ID = "lc-gantry-v1";
const LEN = 360; // carriageway length, m

// --- the builder's cross-section, mirrored so this file can self-validate ---
// (platform/src/modules/sim/world/builders/constants.ts + props.ts — keep in
// sync; the battery re-derives the same numbers from the REAL builder output,
// so a drift there fails the test, not just this generator.)
const SCALED_LANE_W = 3.25 * 2.5; // LANE_WIDTH_M = 3.25 m × PERCEPTUAL_ROAD_SCALE
const SIDEWALK_WIDTH_M = 3.5;
const SIDEWALK_SKIRT_M = 0.35;
const STREETLIGHT_VERGE_M = SIDEWALK_WIDTH_M + 0.4; // past halfWidth
const ENTRY_SIGN_VERGE_M = 0.8; // past halfWidth
const GANTRY_POST_HALF_M = 0.16; // BoxGeometry(0.32, …) in LaneSignalGantry

// Single-lane carriageways, well apart, so the runtime snaps the ego cleanly to
// ONE edge (x=+6 open / x=−6 closed) — the edge-fix must not read x=−6 as the
// far lane of the open ribbon (that grades a lane change, not WRONG_WAY).
const LANE_X = 6; // open carriageway centre (east); closed is its mirror
const HALF_WIDTH = SCALED_LANE_W / 2; // 4.0625 — one lane, no parking band
const KERB_INNER_X = LANE_X - HALF_WIDTH; // 1.9375 — the median kerb line
const KERB_OUTER_X = LANE_X + HALF_WIDTH; // 10.0625 — the outer kerb line
const WALK_OUTER_X = KERB_OUTER_X + SIDEWALK_WIDTH_M; // 13.5625

const GANTRY_Y = 48; // beam crosses right where WRONG_WAY convicts (~t2.1s, y≈40)
// so the red-✕ hangs OVER the ego at the fault keyframe (and is already visible
// ahead on approach), not a distant speck at y=200. Still inside the window.
// Posts must clear the outer kerb and land on the pavement, never on asphalt.
const GANTRY_HALF_SPAN = 11.8;

// Buildings sit BEYOND the pavement skirt on both outer verges — midground for
// the shot, and (asserted) nowhere near a drivable surface.
const BUILD_INNER_X = WALK_OUTER_X + SIDEWALK_SKIRT_M + 2.5; // 16.41
const BUILD_OUTER_X = BUILD_INNER_X + 8;
const BOUND_X = BUILD_OUTER_X + 6;

const r2 = (v) => Math.round(v * 100) / 100;

const buildings = [
  {
    id: "lcg-b-office",
    height: 9,
    heightSource: "default",
    footprint: [
      [r2(-BUILD_OUTER_X), 120],
      [r2(-BUILD_INNER_X), 120],
      [r2(-BUILD_INNER_X), 150],
      [r2(-BUILD_OUTER_X), 150],
    ],
  },
  {
    id: "lcg-b-block",
    height: 12,
    heightSource: "default",
    footprint: [
      [r2(BUILD_INNER_X), 210],
      [r2(BUILD_OUTER_X), 210],
      [r2(BUILD_OUTER_X), 248],
      [r2(BUILD_INNER_X), 248],
    ],
  },
];

const district = {
  format: "district-v1",
  meta: {
    district: "lc-gantry",
    label: "Учебен булевард — сигнал над лентата (X) (сценарий LC)",
    mapKind: "scenario-street",
    generator: "tools/maps/gen_lc_gantry.mjs",
    boundsLocalMeters: { minX: r2(-BOUND_X), minY: -6, maxX: r2(BOUND_X), maxY: LEN + 6 },
    attribution: {
      text: "Учебен разделен булевард с еднопосочни платна и сигнален портал над лентите — оригинален параметричен дизайн (без данни от OpenStreetMap)",
      license: "All rights reserved",
      licenseUrl: "/",
      copyrightUrl: "/",
      obligation: "none — original work, no ODbL attribution required for this map",
    },
    defaults: {
      maxspeedUrbanKmh: 50,
      note: "Зелена стрелка ↓ над отвореното платно (x=+6); червен X над затвореното (x=−6), което е насрещно.",
    },
    stats: {
      roadKm: (LEN * 2) / 1000,
      nodes: 4,
      edges: 2,
      intersections: 0,
      crossings: 0,
      buildings: buildings.length,
      spawnPoints: 2,
    },
    scenario: {
      archetype: "straight-street",
      params: { lengthM: LEN, maxspeedKmh: 50 },
      lanesPerDirection: 1,
      laneCenterRightM: LANE_X,
      // The lesson hero is OVERHEAD (the red-✕ / green-↓ signal gantry). The
      // straight-street archetype otherwise lines both verges with procedural
      // roadside trees (world/builders/props.ts arterial rows on these
      // carriageways), and a west-verge canopy near y=200 buries the chase
      // camera trailing the ego up the CLOSED lane — the gantry vanishes behind
      // foliage. This flag opts THIS teaching micro-map out of every roadside
      // tree pass so the under-the-gantry shot stays clean. Read only by
      // buildProps to skip trees; scoped to this district, no other map changes.
      suppressRoadsideTrees: true,
      // Render-only overhead gantry (LaneSignalGantry): green ↓ over the open
      // lane, red ✕ over the closed one. NOT graded — the WRONG_WAY detector on
      // the closed one-way carriageway carries the conviction.
      laneGantry: {
        y: GANTRY_Y,
        x: 0,
        halfSpanM: GANTRY_HALF_SPAN,
        heightM: 5.6,
        openLaneX: LANE_X,
        closedLaneX: -LANE_X,
      },
    },
  },
  roads: {
    nodes: [
      { id: "lcg-n-open-s", x: LANE_X, y: 0 },
      { id: "lcg-n-open-n", x: LANE_X, y: LEN },
      { id: "lcg-n-closed-n", x: -LANE_X, y: LEN },
      { id: "lcg-n-closed-s", x: -LANE_X, y: 0 },
    ],
    edges: [
      {
        id: "lcg-e-open",
        from: "lcg-n-open-s",
        to: "lcg-n-open-n",
        // `secondary_link`, NOT `secondary` — see the header: it keeps the lane
        // paint and the lamp row but drops the 4 m curbside parking band and
        // the parked-car row that made the two carriageways overlap.
        class: "secondary_link",
        name: "Булевард — отворено платно (север)",
        oneway: true,
        roundabout: false,
        lanes: 1,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
        // Travelling NORTH, so the median (west) is this carriageway's LEFT
        // verge: no pavement and no lamp column there.
        bareVerge: "left",
        length: LEN,
        geometry: [
          [LANE_X, 0],
          [LANE_X, LEN],
        ],
      },
      {
        id: "lcg-e-closed",
        from: "lcg-n-closed-n",
        to: "lcg-n-closed-s",
        class: "secondary_link",
        name: "Булевард — затворено платно (юг, насрещно)",
        oneway: true,
        roundabout: false,
        lanes: 1,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
        // Travelling SOUTH, so the median (east) is ALSO its left verge.
        bareVerge: "left",
        length: LEN,
        geometry: [
          [-LANE_X, LEN],
          [-LANE_X, 0],
        ],
      },
    ],
  },
  intersections: [],
  crossings: [],
  roundabouts: [],
  buildings,
  spawnPoints: [
    {
      id: "lcg-spawn-start",
      x: LANE_X,
      y: 15,
      heading: 0,
      edgeId: "lcg-e-open",
      name: "Начало — отворено платно",
    },
    {
      id: "lcg-spawn-finish",
      x: LANE_X,
      y: LEN - 15,
      heading: 0,
      edgeId: "lcg-e-open",
      name: "Контролна точка — отворено платно",
    },
  ],
};

// ---------------------------------------------------------------------------
// Self-validation — the cross-section laws the founder review turned into
// build-time invariants. A pitch/width change that puts furniture back on the
// asphalt now fails the BUILD, not the reel.
// ---------------------------------------------------------------------------
const post = [];

/** Ribbon span [min, max] of a carriageway centred on `cx`. */
const ribbon = (cx) => [cx - HALF_WIDTH, cx + HALF_WIDTH];
const RIBBONS = [ribbon(LANE_X), ribbon(-LANE_X)];
/** Is `x` inside ANY drivable ribbon (with a clearance pad)? */
const onAsphalt = (x, pad = 0) => RIBBONS.some(([lo, hi]) => x > lo - pad && x < hi + pad);

// 1. The graded numbers are frozen: lane centres, ids, directions, limits.
if (LANE_X !== 6) {
  post.push("lane centres must stay x = ±6 — the recorded traces and the success zone pin them");
}
for (const e of district.roads.edges) {
  if (e.lanes !== 1) post.push(`${e.id}: one lane per carriageway (the locator snaps the ego to its centre)`);
  if (!e.oneway) post.push(`${e.id}: the WRONG_WAY conviction needs a one-way carriageway`);
  if (e.maxspeed !== 50) post.push(`${e.id}: maxspeed must stay 50`);
  if (e.length !== LEN) post.push(`${e.id}: length must stay ${LEN}`);
  if (Math.abs(Math.abs(e.geometry[0][0]) - LANE_X) > 1e-9) post.push(`${e.id}: not on a lane centre`);
  if (e.geometry[0][0] !== e.geometry[1][0]) post.push(`${e.id}: carriageways run straight north/south`);
  if (e.bareVerge !== "left") post.push(`${e.id}: the median is the LEFT verge of both carriageways`);
}
for (const s of district.spawnPoints) {
  if (s.x !== LANE_X) post.push(`${s.id}: spawns sit on the OPEN carriageway centre`);
}

// 2. The two ribbons must not touch — a median, not an overlap.
const medianM = 2 * KERB_INNER_X;
if (!(medianM > 1)) {
  post.push(`the carriageways overlap (median ${r2(medianM)} m): drop the parking band or widen the pitch`);
}

// 3. Nothing the builder dresses the verges with may land on asphalt. Lamp
//    columns and pavements exist ONLY on the outer verge (bareVerge: "left"),
//    so both are measured outward from the outer kerb.
const lampX = KERB_OUTER_X + STREETLIGHT_VERGE_M;
for (const x of [lampX, -lampX]) {
  if (onAsphalt(x, 0.5)) post.push(`lamp column at x=${r2(x)} stands on a carriageway`);
}
const signX = KERB_OUTER_X + ENTRY_SIGN_VERGE_M;
if (onAsphalt(signX, 0.2)) post.push(`entry sign at x=${r2(signX)} stands on a carriageway`);
if (signX > WALK_OUTER_X) post.push(`entry sign at x=${r2(signX)} misses the pavement`);
// The (outer-verge-only) pavement must stay clear of the far carriageway.
if (onAsphalt(KERB_OUTER_X + 0.001) || onAsphalt(WALK_OUTER_X)) {
  post.push("the outer pavement overlaps a carriageway");
}

// 4. The gantry posts must stand on the pavement, never in a lane.
if (onAsphalt(GANTRY_HALF_SPAN, GANTRY_POST_HALF_M)) {
  post.push(`gantry post at x=±${GANTRY_HALF_SPAN} stands on a carriageway — widen halfSpanM`);
}
if (
  GANTRY_HALF_SPAN - GANTRY_POST_HALF_M < KERB_OUTER_X ||
  GANTRY_HALF_SPAN + GANTRY_POST_HALF_M > WALK_OUTER_X
) {
  post.push(
    `gantry post at x=±${GANTRY_HALF_SPAN} is off the pavement [${r2(KERB_OUTER_X)}, ${r2(WALK_OUTER_X)}]`,
  );
}
if (GANTRY_HALF_SPAN < LANE_X) post.push("the beam must span both signalled lanes");
if (GANTRY_Y <= 0 || GANTRY_Y >= LEN) post.push("the gantry must cross inside the carriageway");

// 5. Buildings clear of every drivable surface AND of the pavement.
for (const b of district.buildings) {
  for (const [x, y] of b.footprint) {
    if (Math.abs(x) <= WALK_OUTER_X + SIDEWALK_SKIRT_M) {
      post.push(`${b.id}: footprint on the road/pavement at x=${x}`);
    }
    if (Math.abs(x) > BOUND_X || y < -6 || y > LEN + 6) post.push(`${b.id}: footprint outside bounds`);
  }
}

// 6. Bounds actually contain the dressing (the old ±14 cut the entry signs off).
const widest = Math.max(lampX, WALK_OUTER_X + SIDEWALK_SKIRT_M, BUILD_OUTER_X);
if (BOUND_X < widest) post.push(`bounds ±${BOUND_X} clip the streetscape (needs ±${r2(widest)})`);

// 7. Stats must describe the file.
const st = district.meta.stats;
if (st.nodes !== district.roads.nodes.length) post.push("stats.nodes mismatch");
if (st.edges !== district.roads.edges.length) post.push("stats.edges mismatch");
if (st.buildings !== district.buildings.length) post.push("stats.buildings mismatch");
if (st.spawnPoints !== district.spawnPoints.length) post.push("stats.spawnPoints mismatch");

if (post.length > 0) {
  throw new Error(`gen_lc_gantry self-validation FAILED:\n  - ${post.join("\n  - ")}`);
}

const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${DISTRICT_ID}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${DISTRICT_ID}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

console.log(`wrote ${DISTRICT_ID}: 2 one-way carriageways @ x=±${LANE_X}, gantry @ y=${GANTRY_Y}`);
console.log(`  ribbon           x ∈ ±[${r2(KERB_INNER_X)}, ${r2(KERB_OUTER_X)}]  (median ${r2(medianM)} m)`);
console.log(`  outer pavement   x ∈ ±[${r2(KERB_OUTER_X)}, ${r2(WALK_OUTER_X)}]  (median side bare)`);
console.log(`  lamp row / signs x = ±${r2(lampX)} / ±${r2(signX)}`);
console.log(`  gantry posts     x = ±${GANTRY_HALF_SPAN} (on the pavement)`);
console.log(`  ${CONTENT_FILE}`);
console.log(`  ${PUBLIC_FILE}`);
console.log("Validation OK.");
