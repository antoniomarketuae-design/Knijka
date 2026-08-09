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
 * THAT LAST SENTENCE IS NOW UNDER TEST, because it was false. On 2026-08-09 a
 * plain re-run rewrote `d2-v1` (380 → 378 sw- plots) and `tj-emerge-v1`
 * (14 → 13) — a later pass had moved those two maps' `spawnPoints` and the
 * wall was never re-stamped, so five shipped buildings were standing inside a
 * spawn keep-out. The generator was right; the repo was stale. But because a
 * run said nothing about it, anyone regenerating ANY map silently moved
 * colliders on those two — which is how an earlier wave collected four
 * trace-determinism failures and lost a day hunting them in the traces.
 *
 * Two things changed as a result, and both live outside this file so they
 * cannot drift from it:
 *   - the plan and the byte-for-byte transform are `lib/streetwall-plan.mjs`;
 *   - `../streetwall.test.mjs` asserts `applyStreetwall(shipped) === shipped`
 *     for EVERY target, so the tree stopping being a fixed point is a red test
 *     rather than a surprise diff.
 * And `--check` now EXITS 1 when a target has drifted, so it is a gate and not
 * a printout.
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

import { STREETWALL_ID_PREFIX } from "./lib/streetwall.mjs";
// The plan and the transform are a SEPARATE module so the test can run the
// exact bytes this driver writes instead of a re-implementation of them
// (lib/streetwall-plan.mjs explains what that cost the last time).
import { applyStreetwall, EXCLUDED, isStreetwallCurrent, TARGETS } from "./lib/streetwall-plan.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const checkOnly = process.argv.includes("--check");
/**
 * `--only a-v1,b-v1` — rewrite just those targets.
 *
 * Added because the unfiltered pass rewrites all 23 district JSONs, and this
 * repo is worked by more than one agent at a time: adding ONE map to the table
 * meant re-serialising twenty-two files somebody else might be mid-edit in,
 * which is how a good change lands as somebody else's merge conflict. The
 * default is unchanged (no flag = every target), and the pass is idempotent
 * either way, so a full run still reproduces the committed set byte for byte.
 */
const onlyArg = process.argv[process.argv.indexOf("--only") + 1];
const onlyIds =
  process.argv.includes("--only") && onlyArg
    ? new Set(onlyArg.split(",").map((s) => s.trim()).filter(Boolean))
    : null;
const line = (k, v) => console.log(`  ${String(k).padEnd(34)} ${v}`);

console.log("=== streetwall populate (doc 82 V7) ===");
if (onlyIds) console.log(`  (--only ${[...onlyIds].join(", ")})`);

let totalPlaced = 0;
/** Targets whose SHIPPED bytes are not what the pass produces. */
const drifted = [];
/** Targets whose `platform/public` mirror is not the content copy. */
const mirrorDrift = [];
const errors = [];

for (const target of TARGETS) {
  if (onlyIds && !onlyIds.has(target.id)) continue;
  const contentFile = path.join(REPO_ROOT, "content", "world", `${target.id}.json`);
  const publicFile = path.join(REPO_ROOT, "platform", "public", "world", `${target.id}.json`);
  const before = readFileSync(contentFile, "utf8");

  let out;
  let report;
  let authored;
  let moved;
  try {
    ({ text: out, report, authored, changed: moved } = applyStreetwall(before, target));
  } catch (e) {
    errors.push(e?.message ?? String(e));
    continue;
  }

  if (moved) drifted.push(target.id);
  if (!isStreetwallCurrent(readFileSync(publicFile, "utf8"), target)) mirrorDrift.push(target.id);
  if (!checkOnly) {
    writeFileSync(contentFile, out);
    writeFileSync(publicFile, out); // byte-identical publish (the fleet law)
  }

  totalPlaced += report.placed;
  line(
    target.id,
    `+${String(report.placed).padStart(3)} (authored ${authored}) ` +
      `rejected corridor ${report.rejected.corridor} / sight ${report.rejected.sight} / ` +
      `neighbour ${report.rejected.neighbour} / keep-out ${report.rejected.keepOut}` +
      (moved ? "   <- DRIFTED" : ""),
  );
}

console.log("");
line("maps populated", onlyIds ? TARGETS.filter((t) => onlyIds.has(t.id)).length : TARGETS.length);
line("buildings generated", totalPlaced);
line("files rewritten", checkOnly ? `0 (--check; ${drifted.length} would change)` : drifted.length);
line("id prefix", STREETWALL_ID_PREFIX);
console.log("\n  not populated:");
for (const [what, why] of EXCLUDED) console.log(`    ${what.padEnd(38)} ${why}`);

if (errors.length > 0) {
  console.error(`\nstreetwall FAILED:\n  - ${errors.join("\n  - ")}`);
  process.exit(1);
}

// A WRITE PASS SAYS WHAT IT MOVED; A --check IS A GATE.
//
// The old code counted `changed` and printed „files rewritten 0 (--check)" —
// so the one question worth asking („would this run touch anything?") had no
// answer, and a write run buried the answer in a number nobody read. Two
// districts were rewritten on every invocation for weeks that way.
if (drifted.length > 0 || mirrorDrift.length > 0) {
  const what = [
    drifted.length > 0 ? `${drifted.length} district(s) not at the pass's fixed point: ${drifted.join(", ")}` : null,
    mirrorDrift.length > 0 ? `${mirrorDrift.length} public mirror(s) out of step: ${mirrorDrift.join(", ")}` : null,
  ].filter(Boolean);
  if (checkOnly) {
    console.error(
      `\nstreetwall --check FAILED:\n  - ${what.join("\n  - ")}\n\n` +
        `  A shipped district that is not this pass's fixed point means the next\n` +
        `  person to run this tool — for ANY map — silently moves colliders here.\n` +
        `  Re-run without --check (add --only <id> to keep the diff to these maps),\n` +
        `  then look at what moved and why before committing it.`,
    );
    process.exit(1);
  }
  console.log(`\n  rewritten: ${what.join("; ")}`);
}
console.log("\nValidation OK.");
