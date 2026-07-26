#!/usr/bin/env node
/**
 * gen_streetwall.mjs — the POPULATE post-pass (doc 82 V7 / phase P5).
 *
 * THE FINDING (doc 82 §1.2 items 1–2, verified from the shipped files):
 * `d2-v1` — the flagship city map, 1.93 × 1.63 km, 21.7 km of road, 102
 * intersections — ships `"buildings": []`, and a test asserted it. The other 87
 * scenario maps carry ONE to FIVE prisms each. That is why the frames read as
 * „roads floating on an infinite lawn": there is nothing standing beside the
 * road to tell the eye this is a place. It is a data gap, and this generator
 * closes it with data.
 *
 * WHY A POST-PASS (the gen_exam_district_zones.mjs mold). Nine different
 * archetype generators own the 87 scenario maps and a tenth (the OSM pipeline)
 * owns d2. Teaching all ten to stamp a street wall would fork the logic ten
 * ways; a post-pass that reads the SHIPPED district and appends `sw-` prefixed
 * footprints keeps ONE implementation of the clearance law
 * (`lib/streetwall.mjs`) and re-runs cleanly after any base rebuild:
 *
 *     node tools/maps/build_district_d2.mjs        # rebuilds d2-v1 (buildings lost)
 *     node tools/maps/gen_exam_district_zones.mjs  # re-attaches the zone layer
 *     node tools/maps/gen_streetwall.mjs           # <- re-attaches the buildings
 *
 * Idempotent and deterministic: it strips the previous `sw-` set before
 * regenerating, never touches authored buildings or any other key, and writes
 * each file back in that file's OWN shipped byte layout — so a re-run on an
 * already-populated repo is a zero-byte diff.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO:
 *   - It does not move `meta.boundsLocalMeters`. Those seed the Locator's
 *     spatial grid (`runtime/spatial.ts`) and therefore the rule engine.
 *     Footprints fit inside bounds + TERRAIN_MARGIN_M instead (streetwall.mjs
 *     rule 2), which is ground the builder already draws.
 *   - It does not populate every map. The exclusion table below names each
 *     skipped family and why — a полигон is a fenced training ground, a
 *     motorway has no urban fabric, and three maps' buildings ARE their lesson.
 *   - It does not change PERCEPTUAL_ROAD_SCALE. Doc 82 §6.2 P5 says to
 *     re-evaluate that only AFTER a populated street exists to judge it on.
 *
 * Run:  node tools/maps/gen_streetwall.mjs            (writes)
 *       node tools/maps/gen_streetwall.mjs --check    (report only, no writes)
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  generateStreetwall,
  serializeDistrict,
  stripStreetwall,
  STREETWALL_ID_PREFIX,
} from "./lib/streetwall.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Config presets
// ---------------------------------------------------------------------------

/**
 * CITY — the OSM cut. Short blocks (median edge 51 m) and 102 junctions, so
 * the wall is fine-grained and every junction keeps a 24 m × 9 m corner splay:
 * with 283 edges the sight rule is doing real work here, and a flush corner
 * would hide the cross traffic the right-hand rule is graded on.
 */
const CITY = {
  frontageM: 18,
  frontageJitterM: 8,
  gapM: 6,
  depthM: 14,
  depthJitterM: 6,
  setbackM: 5,
  setbackJitterM: 3,
  sightLegM: 24,
  sightSplayM: 9,
};

/**
 * STREET — the straight scenario micro-maps (one edge, 140–420 m). These are
 * the frames students actually see: a single 12 × 18 m prism beside 400 m of
 * asphalt is what „test level" looks like. A continuous wall both sides at a
 * shallow setback is the whole point, so the plots are longer and closer than
 * the city's.
 */
const STREET = {
  frontageM: 24,
  frontageJitterM: 10,
  gapM: 7,
  depthM: 16,
  depthJitterM: 8,
  setbackM: 4,
  setbackJitterM: 3,
  sightLegM: 20,
  sightSplayM: 8,
  // A micro-map's spawn points and crossings sit ON the carriageway, so the
  // CITY preset's 18 m radial keep-out would veto a wall that is only ever
  // 16 m to one SIDE of them. 10 m keeps the first thing a student sees from
  // being a facade without emptying a 140 m street.
  spawnClearM: 10,
  crossingClearM: 10,
};

/**
 * JUNCTION — scenario junction/roundabout maps. Same fabric as STREET but with
 * the corner splay opened well past it: the hand-authored equal-junction
 * contract (`jx-equal-districts.test.ts`: „OPEN CORNERS are the contract")
 * keeps 30 m clear of both arms, and on a micro-map the junction IS the lesson
 * — the approach must stay readable from the full braking distance. This is
 * deliberately the most conservative row, and it is why sx-v1 earns a third of
 * the plots a straight street of the same length would.
 */
const JUNCTION = {
  ...STREET,
  frontageM: 20,
  frontageJitterM: 8,
  sightLegM: 30,
  sightSplayM: 10,
  spawnClearM: 12,
  crossingClearM: 12,
};

/**
 * ROUNDABOUT — the ring itself is excluded from hosting (roundabout edges are
 * skipped by the generator), and entry judgement is made from inside the
 * approach at low speed rather than across a corner, so the arms carry the
 * STREET splay. With the JUNCTION row they carried ONE building on 116 m arms,
 * which is not a populated map.
 */
const ROUNDABOUT = {
  ...STREET,
  sightLegM: 24,
  sightSplayM: 10,
  spawnClearM: 12,
  crossingClearM: 12,
};

// ---------------------------------------------------------------------------
// Targets — the flagship city + the ~20 maps the 150 scenario templates run in
// most often (counted from `districtId:` across
// platform/src/modules/sim/lessons/scenario/templates*.ts).
// ---------------------------------------------------------------------------

const TARGETS = [
  { id: "d2-v1", style: "records", cfg: CITY, why: "the exam city — 21.7 km of road, zero buildings" },
  { id: "sx-v1", style: "compact", cfg: JUNCTION, why: "signalised X — 12 templates, the busiest map in the catalog" },
  { id: "ln-v1", style: "compact", cfg: STREET, why: "2+2 boulevard — 9 templates (lane change family)" },
  { id: "mw-fo-follow-placeholder", skip: true },
  { id: "fo-follow-v1", style: "compact", cfg: STREET, why: "following-distance street — 6 templates" },
  { id: "rb-mini-v1", style: "compact", cfg: ROUNDABOUT, why: "mini roundabout — 4 templates" },
  { id: "vp-ready-v1", style: "compact", cfg: STREET, why: "vehicle-preparation street — 4 templates" },
  { id: "hz-obstacle-v1", style: "compact", cfg: STREET, why: "hazard/obstacle street — 4 templates" },
  { id: "ac-rain-v1", style: "compact", cfg: STREET, why: "rain conditions street — 4 templates" },
  { id: "tj-stop-v1", style: "compact", cfg: JUNCTION, why: "Б2 T-junction — 3 templates" },
  { id: "ov-narrow-v1", style: "compact", cfg: STREET, why: "narrow-street overtaking — 3 templates" },
  { id: "tj-rhr-v1", style: "compact", cfg: JUNCTION, why: "right-hand-rule T — 2 templates" },
  { id: "tj-emerge-v1", style: "compact", cfg: JUNCTION, why: "emerging onto a priority road — 2 templates" },
  { id: "wb-boulevard-v1", style: "compact", cfg: STREET, why: "wide boulevard — 2 templates" },
  { id: "vu-pass-v1", style: "compact", cfg: STREET, why: "passing a vulnerable user — 2 templates" },
  { id: "sp-rain-v1", style: "compact", cfg: STREET, why: "speed in rain — 2 templates" },
  { id: "pe-jay-v1", style: "compact", cfg: JUNCTION, why: "jaywalking junction — 2 templates" },
  { id: "pe-dart-v1", style: "compact", cfg: STREET, why: "darting pedestrian — 2 templates" },
  { id: "pe-child-v1", style: "compact", cfg: STREET, why: "child at the kerb — 2 templates" },
  { id: "fo-brake-v1", style: "compact", cfg: STREET, why: "lead-car braking — 2 templates" },
  { id: "pe-zone-v1", style: "compact", cfg: STREET, why: "живее зона — the shipped clip frame doc 82 §1.2 opens with" },
  { id: "zb-v1", style: "compact", cfg: STREET, why: "zebra street — the pedestrian-crossing archetype" },
  { id: "sp-zone30-v1", style: "compact", cfg: STREET, why: "Зона 30 — a signed urban zone must look urban" },
].filter((t) => !t.skip);

/**
 * NOT POPULATED, and why. Kept in the source because „which maps did you skip"
 * is the first question this pass raises, and a silent omission would read as
 * an oversight rather than a decision.
 */
const EXCLUDED = [
  ["mw-v1 / mw-entry-v1 / mw-exit-v1", "автомагистрала — no sidewalks, no urban fabric by design (gen_motorway)"],
  ["poligon-v1 / poligon chain", "полигон — a fenced training ground, not a street"],
  ["lot-*-v1", "parking lots — the surrounding fabric is authored as the lot itself"],
  ["ov-oncoming-v1 / ov-crest-v1", "authored as open country: the rural sightline IS the overtaking lesson"],
  ["tj-occluded-v1", "its ONE corner building is the JU-17 occluder — the lesson is the peek"],
  ["jx-equal-v1", "„OPEN CORNERS are the contract" + " — four authored corners, battery-pinned"],
  ["ac-bridge-v1 / ac-ice-v1 / ac-aqua-v1", "surface + structure lessons; ac-bridge's 4 blocks encode the deck"],
  ["district-v1", "already 248 authored footprints — the one map that reads as a real place"],
];

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const checkOnly = process.argv.includes("--check");
const line = (k, v) => console.log(`  ${String(k).padEnd(34)} ${v}`);

console.log("=== streetwall populate (doc 82 V7) ===");

let totalPlaced = 0;
let changed = 0;
const errors = [];

for (const target of TARGETS) {
  const contentFile = path.join(REPO_ROOT, "content", "world", `${target.id}.json`);
  const publicFile = path.join(REPO_ROOT, "platform", "public", "world", `${target.id}.json`);
  const before = readFileSync(contentFile, "utf8");
  const district = JSON.parse(before);

  const authored = stripStreetwall(district.buildings);
  const { buildings, report } = generateStreetwall(district, target.cfg);
  district.buildings = [...authored, ...buildings];

  // Rule 1, proved rather than asserted: the ONLY key this pass may move is
  // `buildings`, so a diff of everything else must be empty.
  const untouched = JSON.parse(before);
  untouched.buildings = district.buildings;
  if (JSON.stringify(untouched) !== JSON.stringify(district)) {
    errors.push(`${target.id}: the pass changed a key other than buildings`);
  }

  const out = serializeDistrict(district, target.style);
  JSON.parse(out); // validity self-check
  if (out !== before) changed++;
  if (!checkOnly) {
    writeFileSync(contentFile, out);
    writeFileSync(publicFile, out); // byte-identical publish (the fleet law)
  }

  totalPlaced += report.placed;
  line(
    target.id,
    `+${String(report.placed).padStart(3)} (authored ${authored.length}) ` +
      `rejected corridor ${report.rejected.corridor} / sight ${report.rejected.sight} / ` +
      `neighbour ${report.rejected.neighbour} / keep-out ${report.rejected.keepOut}`,
  );
}

console.log("");
line("maps populated", TARGETS.length);
line("buildings generated", totalPlaced);
line("files rewritten", checkOnly ? "0 (--check)" : changed);
line("id prefix", STREETWALL_ID_PREFIX);
console.log("\n  not populated:");
for (const [what, why] of EXCLUDED) console.log(`    ${what.padEnd(38)} ${why}`);

if (errors.length > 0) {
  console.error(`\nstreetwall FAILED:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}
console.log("\nValidation OK.");
