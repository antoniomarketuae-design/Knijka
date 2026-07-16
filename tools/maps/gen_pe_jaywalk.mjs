/**
 * gen_pe_jaywalk.mjs — pe-jay-v1: the PE-13 jaywalker district (doc 72 §6).
 *
 * A STANDALONE generator (the S3-D discipline: shipped-instance generators are
 * never restructured) that REUSES buildSignalXDistrict for the signalized
 * X-junction and post-processes ONE addition: a marked, SIGNALIZED pedestrian
 * crossing on the north exit arm (sx-e-n) just past the junction mouth — the
 * classic jaywalk spot. `signalized: true` glues the crossing into the
 * junction's signal cluster (ambient pedestrians obey the vehicle phase); the
 * STAGED dart-out walker ignores phases by design — that IS the jaywalk. The
 * crossing-zone grading arms on OCCUPANCY, not phase — the ЗДвП чл. 120
 * reading: a pedestrian on the carriageway is protected even in violation.
 *
 * Node/edge/spawn ids keep the builder's sx-* names (ids are per-district
 * namespaces; sx-v1 itself is untouched — different districtId, different
 * file). Geometry mirrors sx-v1's junction so the stop lines sit at ±27.73.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSignalXDistrict } from "./gen_signal_x.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../..");

const PARAMS = {
  districtId: "pe-jay-v1",
  label: "PE-13 jaywalker — signalized X with a north-arm crossing",
  // Shorter east/west arms than sx-v1 (no oncoming staging here); the south
  // approach + north exit carry the story.
  armNorthM: 120,
  armSouthM: 120,
  armEastM: 90,
  armWestM: 90,
  nsClass: "secondary",
  ewClass: "residential",
  nsMaxKmh: 50,
  ewMaxKmh: 40,
};

/** The crossing center on the north exit arm, m north of the junction —
 *  past the mouth (stop lines at ±27.73), where the jaywalker steps out. */
const CROSSING_Y = 34;

const district = buildSignalXDistrict(PARAMS);

// -- the one post-processed addition -----------------------------------------
district.crossings.push({
  id: "pej-x-1",
  x: 0,
  y: CROSSING_Y,
  kind: "marked",
  signalized: true,
  edgeId: "sx-e-n",
});
district.meta.stats.crossings = district.crossings.length;
district.meta.scenario.crossingId = "pej-x-1";
district.meta.scenario.crossingY = CROSSING_Y;

// -- self-validation ----------------------------------------------------------
const errors = [];
if (!district.roads.edges.some((e) => e.id === "sx-e-n")) {
  errors.push("north arm edge sx-e-n missing — builder ids changed?");
}
if (CROSSING_Y <= 27.73 + 2) {
  errors.push(`crossing y ${CROSSING_Y} must clear the junction mouth (stop line 27.73)`);
}
if (CROSSING_Y >= PARAMS.armNorthM - 20) {
  errors.push(`crossing y ${CROSSING_Y} too close to the north end (arm ${PARAMS.armNorthM})`);
}
if (errors.length > 0) {
  throw new Error(`gen_pe_jaywalk invalid:\n  - ${errors.join("\n  - ")}`);
}

const out = JSON.stringify(district, null, 1) + "\n";
JSON.parse(out); // JSON validity self-check

const CONTENT_FILE = path.join(REPO_ROOT, "content", "world", `${PARAMS.districtId}.json`);
const PUBLIC_FILE = path.join(REPO_ROOT, "platform", "public", "world", `${PARAMS.districtId}.json`);
mkdirSync(path.dirname(CONTENT_FILE), { recursive: true });
mkdirSync(path.dirname(PUBLIC_FILE), { recursive: true });
writeFileSync(CONTENT_FILE, out);
writeFileSync(PUBLIC_FILE, out); // byte-identical publish

console.log(`=== pe-jaywalk build: ${PARAMS.districtId} ===`);
console.log(`  crossing pej-x-1 at (0, ${CROSSING_Y}) on sx-e-n (signalized)`);
console.log(`  nodes/edges/crossings     ${district.meta.stats.nodes}/${district.meta.stats.edges}/${district.meta.stats.crossings}`);
console.log(`  wrote ${CONTENT_FILE}`);
console.log(`  wrote ${PUBLIC_FILE}`);
