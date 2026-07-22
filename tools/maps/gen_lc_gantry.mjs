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
 * Dual-write (content/world + platform/public/world), the gen_ov_solid2 mold.
 * Run:  node tools/maps/gen_lc_gantry.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "..", "..");

const DISTRICT_ID = "lc-gantry-v1";
const LEN = 360; // carriageway length, m
// Single-lane carriageways, well apart, so the runtime snaps the ego cleanly to
// ONE edge (x=+6 open / x=−6 closed) — the edge-fix must not read x=−6 as the
// far lane of the open ribbon (that grades a lane change, not WRONG_WAY).
const LANE_X = 6; // open carriageway centre (east); closed is its mirror
const GANTRY_Y = 48; // beam crosses right where WRONG_WAY convicts (~t2.1s, y≈40)
// so the red-✕ hangs OVER the ego at the fault keyframe (and is already visible
// ahead on approach), not a distant speck at y=200. Still inside the window.

const district = {
  format: "district-v1",
  meta: {
    district: "lc-gantry",
    label: "Учебен булевард — сигнал над лентата (X) (сценарий LC)",
    mapKind: "scenario-street",
    generator: "tools/maps/gen_lc_gantry.mjs",
    boundsLocalMeters: { minX: -14, minY: -6, maxX: 14, maxY: LEN + 6 },
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
      buildings: 1,
      spawnPoints: 2,
    },
    scenario: {
      archetype: "straight-street",
      params: { lengthM: LEN, maxspeedKmh: 50 },
      lanesPerDirection: 1,
      laneCenterRightM: LANE_X,
      // The lesson hero is OVERHEAD (the red-✕ / green-↓ signal gantry). The
      // straight-street archetype otherwise lines both verges with procedural
      // roadside trees (world/builders/props.ts arterial rows on these secondary
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
        halfSpanM: 9,
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
        class: "secondary",
        name: "Булевард — отворено платно (север)",
        oneway: true,
        roundabout: false,
        lanes: 1,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
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
        class: "secondary",
        name: "Булевард — затворено платно (юг, насрещно)",
        oneway: true,
        roundabout: false,
        lanes: 1,
        lanesSource: "tag",
        maxspeed: 50,
        maxspeedSource: "tag",
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
  buildings: [
    {
      id: "lcg-b-office",
      height: 9,
      heightSource: "default",
      footprint: [
        [-13.5, 120],
        [-9.5, 120],
        [-9.5, 150],
        [-13.5, 150],
      ],
    },
  ],
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

const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${DISTRICT_ID}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${DISTRICT_ID}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

console.log(`wrote ${DISTRICT_ID}: 2 one-way carriageways, gantry @ y=${GANTRY_Y}`);
console.log(`  ${CONTENT_FILE}`);
console.log(`  ${PUBLIC_FILE}`);
