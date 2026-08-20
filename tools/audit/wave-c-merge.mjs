#!/usr/bin/env node
/**
 * Merge the parallel phase-1 halves into the single directory phase 2 reads.
 *
 * Phase 1 runs two drivers over disjoint lesson sets against ONE dev server, so
 * the work lands in `.audit-frames/wave-c-a/` and `-b/`. Everything downstream —
 * make-verdicts2.mjs, and every judge prompt — names `.audit-frames/wave-c/`.
 *
 * THE FOUR THINGS THIS REFUSES TO DO QUIETLY, because each would produce a
 * plausible-looking corpus that is wrong in the reassuring direction:
 *
 *  1. MERGE OVERLAPPING HALVES. The split is supposed to be disjoint. A frame
 *     directory present in both halves means it was not, and one drive would
 *     silently overwrite the other.
 *  2. MERGE ACROSS BUILDS. If the halves attest different commits, they measured
 *     different code and must not be pooled into one verdict corpus.
 *  3. HIDE UNCERTIFIABLE DRIVES. Non-zero exits and treeMoved rows are carried
 *     through and COUNTED OUT LOUD, because a judge handed one closes nothing.
 *  4. LOSE A DRIVE TO A DUPLICATE KEY. Same lesson/leg twice is reported, not
 *     silently deduped to whichever happened to be last.
 *
 *   node tools/audit/wave-c-merge.mjs [--root DIR] [--halves a,b] [--dest wave-c]
 *                                     [--copy]   keep the halves (default: move)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
function findRepo() {
  let d = HERE;
  for (;;) {
    if (fs.existsSync(path.join(d, ".audit-frames"))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return process.cwd();
}
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const flag = (f, d = null) => {
  const i = argv.indexOf(f);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const ROOT = flag("--root", path.join(findRepo(), ".audit-frames"));
const HALVES = (flag("--halves", "wave-c-a,wave-c-b") || "").split(",").filter(Boolean);
const DEST = path.join(ROOT, flag("--dest", "wave-c"));
const COPY = has("--copy");

fs.mkdirSync(path.join(DEST, "frames"), { recursive: true });

const rows = [];
const collisions = [];
let framesMoved = 0;
/** planned moves, target -> source; nothing is touched until every half is read */
const pending = new Map();

for (const h of HALVES) {
  const hdir = path.join(ROOT, h);
  const rp = path.join(hdir, "wave-c-results.jsonl");
  if (!fs.existsSync(rp)) {
    console.log("!! no results at " + rp + " — skipping this half");
    continue;
  }
  for (const l of fs.readFileSync(rp, "utf8").split("\n")) {
    if (!l.trim()) continue;
    try {
      rows.push({ ...JSON.parse(l), __half: h });
    } catch {
      /* a torn tail line is not a reason to drop the half */
    }
  }

  // PASS 1 — only LOOK. This used to move as it went and refuse afterwards, so
  // the refusal printed "Nothing further was written" having already moved 342
  // directories. A guard that acts before it checks is not a guard, and it left
  // the destination holding a mix of fresh frames and stale ones from a
  // superseded build — which is worse than either failing or succeeding.
  const fdir = path.join(hdir, "frames");
  if (!fs.existsSync(fdir)) continue;
  for (const d of fs.readdirSync(fdir)) {
    const from = path.join(fdir, d);
    const to = path.join(DEST, "frames", d);
    if (fs.existsSync(to)) {
      collisions.push(d + "  (already in " + path.basename(DEST) + ")");
      continue;
    }
    if (pending.has(to)) {
      collisions.push(d + "  (in two halves at once)");
      continue;
    }
    pending.set(to, from);
  }
}

if (collisions.length) {
  console.error("REFUSING: " + collisions.length + " frame directory collision(s).");
  for (const c of collisions.slice(0, 12)) console.error("   " + c);
  if (collisions.length > 12) console.error("   ...and " + (collisions.length - 12) + " more");
  console.error("");
  console.error("NOTHING HAS BEEN MOVED — this check runs before any filesystem change.");
  console.error("Either the halves were not disjoint, or the destination still holds frames");
  console.error("from an earlier run. A destination left over from a superseded build is the");
  console.error("dangerous case: the merged corpus would look complete while some frames came");
  console.error("from different code. Clear it deliberately, then re-run.");
  process.exit(1);
}

// PASS 2 — now, and only now, move.
for (const [to, from] of pending) {
  if (COPY) fs.cpSync(from, to, { recursive: true });
  else fs.renameSync(from, to);
  framesMoved++;
}

// --- one build only -----------------------------------------------------------
const heads = [...new Set(rows.map((r) => String(r.head)))];
if (heads.length > 1) {
  console.error("REFUSING: the halves attest " + heads.length + " different commits:");
  for (const h of heads) console.error("   " + h.slice(0, 12) + "  (" + rows.filter((r) => r.head === h).length + " drives)");
  console.error("They measured different code and must not be pooled into one verdict corpus.");
  process.exit(1);
}

// --- no drive lost to a duplicate key ------------------------------------------
const seen = new Map();
const dupes = [];
for (const r of rows) {
  const k = r.lesson + "/" + r.leg;
  if (seen.has(k)) dupes.push(k);
  seen.set(k, r);
}
const merged = [...seen.values()];

// The frames have MOVED, so `out` — which every judge follows to find the new
// frames — now points at a directory that no longer exists. Rewriting it here
// is the whole reason the merge cannot be a `cat`.
for (const r of merged) r.out = path.join(DEST, "frames", r.lesson + "__" + r.leg);

fs.writeFileSync(
  path.join(DEST, "wave-c-results.jsonl"),
  merged.map((r) => JSON.stringify(r)).join("\n") + "\n",
);

const bad = merged.filter((r) => r.exit !== 0);
const moved = merged.filter((r) => r.treeMoved);
// A missing debrief is a missing FRAME, not a missing verdict string. The
// harness reports `VERDICT: (none)` for a lesson that ends «НЕЗАВЪРШЕН»
// (unfinished) because its extractor knows only ИЗДЪРЖАН and НЕИЗДЪРЖАН — and
// those drives captured 08-debrief.png like every other. Counting them as
// "no debrief" understated what was judgeable by about a fifth.
const noDebrief = merged.filter(
  (r) => r.exit === 0 && !fs.existsSync(path.join(r.out, "08-debrief.png")),
);
const unfinished = merged.filter(
  (r) => r.exit === 0 && (!r.verdict || r.verdict === "(none)") && fs.existsSync(path.join(r.out, "08-debrief.png")),
);
const lessons = new Set(merged.map((r) => r.lesson));

console.log("merged " + merged.length + " drive(s) into " + DEST);
console.log("  lessons          : " + lessons.size);
console.log("  frames dirs      : " + framesMoved + (COPY ? " (copied)" : " (moved)"));
console.log("  attested commit  : " + (heads[0] || "-").slice(0, 12));
console.log("  non-zero exit    : " + bad.length + (bad.length ? "   <-- certify nothing" : ""));
console.log("  treeMoved        : " + moved.length + (moved.length ? "   <-- certify nothing" : ""));
console.log("  no debrief frame : " + noDebrief.length + "   (these close nothing)");
console.log("  unfinished       : " + unfinished.length + "   (НЕЗАВЪРШЕН — debrief IS present and judgeable)");
if (dupes.length) {
  console.log("  DUPLICATE keys   : " + dupes.length + "   <-- the halves were not disjoint");
  for (const d of [...new Set(dupes)].slice(0, 10)) console.log("     " + d);
}
for (const r of bad.slice(0, 10)) console.log("    exit=" + r.exit + "  " + r.lesson + " " + r.leg);
for (const r of moved.slice(0, 10)) console.log("    treeMoved  " + r.lesson + " " + r.leg);
