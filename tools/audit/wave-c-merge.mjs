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
import { execFileSync } from "node:child_process";
import { classifyLeg, LEG_STATES } from "./verdict-surface.mjs";

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


// --- one BUILD only, which is not the same as one commit ----------------------
/**
 * THE RULE IS "ONE BUILD", AND THE COMMIT HASH IS ONLY A PROXY FOR IT.
 *
 * Pooling drives taken against different code into one verdict corpus is the
 * error this guard exists to prevent, and it is a real one. But it used to
 * compare commit hashes, and a commit can differ from another in ways the drive
 * cannot possibly have seen: a change under tools/, or docs/, or a generator.
 *
 * It bit exactly that way. A 195-drive proof run attested dd4e5983f63f; four
 * drives had to be re-taken afterwards and attested 641a4475c0ac, because a
 * single file under tools/audit/ had been committed between them.
 * `git diff --name-only dd4e598 641a447 -- platform/ content/` returns ZERO
 * files: the two runs measured byte-identical product code. Refusing there
 * would have meant re-driving 195 lessons — twelve hours — over a tools file,
 * and the alternative of overriding the guard by hand would have set the
 * precedent that this check is advisory.
 *
 * So the guard now asks the question it means: did the PRODUCT change between
 * these commits? Only `platform/` and `content/` are served to a drive. If they
 * are identical the pool is sound and the reasoning is printed, with every
 * commit involved recorded on the merged rows so a later reader can re-check it
 * rather than take this comment's word. If git cannot answer — a shallow clone,
 * a missing object — it refuses, because an unverifiable claim is not a
 * verified one.
 */
const heads = [...new Set(rows.map((r) => String(r.head)))];
if (heads.length > 1) {
  const sorted = [...heads].sort();
  let productDiff = null;
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", sorted[0], sorted[sorted.length - 1], "--", "platform/", "content/"],
      { cwd: findRepo(), encoding: "utf8" },
    );
    productDiff = out.split("\n").filter((l) => l.trim());
  } catch {
    productDiff = null;
  }
  if (productDiff === null || productDiff.length) {
    console.error("REFUSING: the halves attest " + heads.length + " different commits:");
    for (const h of heads) console.error("   " + h.slice(0, 12) + "  (" + rows.filter((r) => r.head === h).length + " drives)");
    if (productDiff === null) {
      console.error("and git could not be asked whether platform/ or content/ differ between them.");
      console.error("An unverifiable claim of sameness is not a verified one.");
    } else {
      console.error("and " + productDiff.length + " file(s) under platform/ or content/ DIFFER:");
      for (const f of productDiff.slice(0, 10)) console.error("   " + f);
      console.error("They measured different code and must not be pooled into one verdict corpus.");
    }
    process.exit(1);
  }
  console.log("NOTE: " + heads.length + " commits are present, and the PRODUCT is identical across them.");
  for (const h of heads) console.log("   " + h.slice(0, 12) + "  (" + rows.filter((r) => r.head === h).length + " drives)");
  console.log("   git diff --name-only " + sorted[0].slice(0, 12) + " " + sorted[sorted.length - 1].slice(0, 12) +
    " -- platform/ content/  ->  0 files");
  console.log("   Pooled on that basis. Every row keeps its own `head`; `heads` lists them all.");
}

/**
 * PASS 2 — MOVE, AND ONLY NOW.
 *
 * This used to sit ABOVE the build check, so a merge that refused on two commits
 * had already relocated every frame directory before saying no. Watched happen:
 * a refused merge reported "REFUSING" and left 195 frame dirs in the
 * destination, and the next run reported "0 (moved)" because the move was
 * already done. That is the same shape as the collision guard bug one level up —
 * a check that runs after the act is a report, not a guard.
 */
for (const [to, from] of pending) {
  if (COPY) fs.cpSync(from, to, { recursive: true });
  else fs.renameSync(from, to);
  framesMoved++;
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
// A missing debrief is a missing FRAME, not a missing verdict string.
const noDebrief = merged.filter(
  (r) => r.exit === 0 && !fs.existsSync(path.join(r.out, "08-debrief.png")),
);

// THE "unfinished" BUCKET WAS COMPENSATING FOR A BUG THAT NO LONGER EXISTS —
// 2026-08-21.
//
// It counted `exit === 0 && (!verdict || verdict === "(none)") && the debrief
// frame exists` and printed it as «НЕЗАВЪРШЕН — debrief IS present and
// judgeable». That was true of the corpus it was written against, because the
// harness's matcher could not read the word «Незавършен» and recorded it as
// null. With the matcher fixed at source, a null verdict on a NEW drive means
// one of: the surface mounted with no pill, there is no surface, or the reader
// threw. The first two are PRODUCT DEFECTS and the third is an instrument
// failure — and this bucket would have announced all three as "unfinished and
// judgeable", which is the reassuring direction.
//
// It is now a breakdown by the lane's own `verdictSurface`, via the one ladder
// in ./verdict-surface.mjs. The bucket that used to exist is `pre-matcher`, and
// it means exactly what it says: on a drive made before that field existed,
// «НЕЗАВЪРШЕН» and a pill-less card ARE the same silence, so the count is a
// count of unknowns to re-drive, not of unfinished lessons.
//
// The 08-debrief.png existence test is gone from here too: the harness writes
// that frame unconditionally, so it was true on all 376 drives of the standing
// corpus and could not discriminate anything.
const states = new Map();
const stateRows = new Map();
for (const r of merged.filter((r) => r.exit === 0 && !r.treeMoved)) {
  const c = classifyLeg(r);
  states.set(c.state, (states.get(c.state) ?? 0) + 1);
  if (!stateRows.has(c.state)) stateRows.set(c.state, []);
  stateRows.get(c.state).push(r);
}
const lessons = new Set(merged.map((r) => r.lesson));

console.log("merged " + merged.length + " drive(s) into " + DEST);
console.log("  lessons          : " + lessons.size);
console.log("  frames dirs      : " + framesMoved + (COPY ? " (copied)" : " (moved)"));
console.log("  attested commit  : " + (heads[0] || "-").slice(0, 12));
console.log("  non-zero exit    : " + bad.length + (bad.length ? "   <-- certify nothing" : ""));
console.log("  treeMoved        : " + moved.length + (moved.length ? "   <-- certify nothing" : ""));
console.log("  no debrief frame : " + noDebrief.length + "   (these close nothing)");

// One line per state that actually occurred, with WHO the state is about, so a
// product defect can never again be totalled together with an instrument fault
// or with an unfinished lesson.
const WHAT = {
  verdict: "a pill was read off the debrief — judgeable",
  "not-reached": "the ladder never reached a verdict card — closes nothing",
  "no-pill": "PRODUCT DEFECT: result screen mounted, NO verdict pill — file it",
  "no-surface": "PRODUCT DEFECT: no result surface in the DOM — file it",
  "reader-threw": "INSTRUMENT: the debrief reader threw — says nothing either way",
  "pre-matcher": "UNKNOWN: drove before verdictSurface existed — «НЕЗАВЪРШЕН» and a pill-less card are indistinguishable here; re-drive",
  "no-ledger": "INSTRUMENT: no readable _audit-status.json — certifies nothing",
  disagreement: "INSTRUMENT: the row and the lane ledger disagree — certifies nothing",
  "unknown-surface": "INSTRUMENT: unrecognised verdictSurface value",
  died: "INSTRUMENT: the ledger records a phase other than «complete» — a fragment, not an answer",
  "evidence-incomplete": "INSTRUMENT: the ledger's OWN exit is non-zero — the lane says its evidence is incomplete",
};
console.log("  verdict surface  : (certifiable drives only — exit 0 and a still tree)");
for (const state of Object.keys(LEG_STATES)) {
  const n = states.get(state) ?? 0;
  if (!n) continue;
  console.log("     " + String(n).padStart(4) + "  " + state.padEnd(16) + WHAT[state]);
  // Name the product defects. A count of them is a number; a list of them is a
  // work item, and these are the ones somebody has to open.
  if (LEG_STATES[state].about === "product") {
    for (const r of stateRows.get(state).slice(0, 12)) console.log("            " + r.lesson + " " + r.leg);
    if (stateRows.get(state).length > 12) console.log("            ...and " + (stateRows.get(state).length - 12) + " more");
  }
}
if (dupes.length) {
  console.log("  DUPLICATE keys   : " + dupes.length + "   <-- the halves were not disjoint");
  for (const d of [...new Set(dupes)].slice(0, 10)) console.log("     " + d);
}
for (const r of bad.slice(0, 10)) console.log("    exit=" + r.exit + "  " + r.lesson + " " + r.leg);
for (const r of moved.slice(0, 10)) console.log("    treeMoved  " + r.lesson + " " + r.leg);
