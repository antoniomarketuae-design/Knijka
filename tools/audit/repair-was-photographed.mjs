#!/usr/bin/env node
/**
 * DID THE SWEEP ACTUALLY PHOTOGRAPH THE REPAIR THE LANE IS CLAIMING?
 *
 *   node tools/audit/repair-was-photographed.mjs <reportsDir> [sweptCommit]
 *
 * WHY THIS EXISTS. Repair wave 44 came back with 17 of 25 lanes reporting
 * MISROUTED and 13 reporting ALREADY-FIXED, and almost no product code written.
 * That is not a failed wave — it is the wave saying the open list's problem is
 * no longer missing repairs. The closure path is therefore to JUDGE the
 * already-fixed claims rather than to repair again.
 *
 * BUT A CLAIM IS NOT A CLOSURE, AND THE ORDER MATTERS. A row retires only when
 * the product is repaired, a drive PHOTOGRAPHS the repaired code, a judge rules
 * on that photograph, and an adversarial pass fails to overturn it. So before
 * any of those claims is worth a judge's time, one mechanical question has to be
 * answered: **was the claimed repair already in the tree the sweep drove?**
 *
 *   repair is an ancestor of the swept commit  →  the frames ARE post-repair,
 *                                                 and the row is judgeable NOW
 *                                                 from evidence already on disk
 *   repair is NOT an ancestor                  →  the frames predate it, the
 *                                                 lane is describing code no
 *                                                 drive has ever exercised, and
 *                                                 the row needs a RE-DRIVE
 *
 * That distinction has been made by eye until now, and getting it wrong is how
 * a wave "closes" rows against a build nobody photographed — the exact error
 * `harness-change-is-not-a-repair` records, where platform/src was
 * BYTE-IDENTICAL between two sweeps and closures were written anyway.
 *
 * It reads the lane reports as text and pulls every 7-40 char hex that resolves
 * to a real commit. It does NOT try to decide which commit a lane meant when it
 * names several — it reports them all, with their ancestry, and leaves the
 * judgement to a judge. An extraction that guessed would be one more layer
 * between a claim and its evidence.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = process.argv[2] || ".audit-frames/w44-reports";
const SWEPT = process.argv[3] || "177c4ba";

if (!existsSync(DIR)) {
  console.error(`no reports directory at ${DIR}`);
  process.exit(2);
}

const git = (args) => {
  try {
    return execFileSync("git", args, { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
};

const sweptFull = git(["rev-parse", SWEPT]);
if (!sweptFull) {
  console.error(`${SWEPT} does not resolve to a commit`);
  process.exit(2);
}
console.log(`swept commit: ${SWEPT} (${sweptFull.slice(0, 12)})`);
console.log(`  «${git(["log", "-1", "--format=%s", sweptFull])}»\n`);

const isAncestor = (c) => {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", c, sweptFull], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};

const rows = [];
for (const f of readdirSync(DIR).sort()) {
  if (!f.endsWith(".md")) continue;
  const txt = readFileSync(`${DIR}/${f}`, "utf8");
  const ids = [...new Set(txt.match(/[a-z0-9-]+:[0-9a-f]{8}/g) || [])];
  // A finding id ends in exactly 8 hex, so strip those before hunting commits,
  // or every row id reads as a candidate sha.
  const stripped = txt.replace(/[a-z0-9-]+:[0-9a-f]{8}/g, " ");
  const shas = [...new Set(stripped.match(/\b[0-9a-f]{7,40}\b/g) || [])];
  const resolved = [];
  for (const s of shas) {
    const full = git(["rev-parse", "--verify", "--quiet", `${s}^{commit}`]);
    if (!full) continue;
    resolved.push({ sha: s, full, anc: isAncestor(full), subject: git(["log", "-1", "--format=%s", full]) });
  }
  const claimsFixed = /ALREADY-FIXED|already fixed|REFUTED/i.test(txt.slice(0, 600));
  rows.push({ file: f, ids, resolved, claimsFixed });
}

let judgeable = 0;
let needsRedrive = 0;
let noCommit = 0;

for (const r of rows) {
  const head = `${r.file}  ${r.claimsFixed ? "[claims fixed/refuted]" : ""}`;
  console.log(head);
  console.log(`   rows: ${r.ids.join(", ") || "(none named)"}`);
  if (!r.resolved.length) {
    noCommit++;
    console.log(`   !! NAMES NO RESOLVABLE COMMIT. Rule 0 is «before writing ALREADY-FIXED, diff the owning file`);
    console.log(`      and NAME the repairing commit». A claim without one cannot be checked and must not be judged on.`);
  } else {
    const anc = r.resolved.filter((x) => x.anc);
    const notAnc = r.resolved.filter((x) => !x.anc);
    if (anc.length) {
      judgeable++;
      for (const x of anc.slice(0, 4)) {
        console.log(`   OK  ${x.sha.slice(0, 9)} is IN the swept tree — «${String(x.subject).slice(0, 62)}»`);
      }
    }
    if (notAnc.length) {
      if (!anc.length) needsRedrive++;
      for (const x of notAnc.slice(0, 4)) {
        console.log(`   !!  ${x.sha.slice(0, 9)} is NOT in the swept tree — no drive has exercised it («${String(x.subject).slice(0, 48)}»)`);
      }
    }
  }
  console.log("");
}

console.log("─".repeat(72));
console.log(`lanes naming a commit already photographed by the sweep : ${judgeable}`);
console.log(`lanes naming ONLY commits the sweep never saw           : ${needsRedrive}`);
console.log(`lanes naming no resolvable commit at all               : ${noCommit}`);
console.log("");
console.log("The first group is judgeable NOW from frames already on disk. The second");
console.log("needs a re-drive before any verdict, however convincing the prose. The");
console.log("third fails Rule 0 and must be sent back rather than believed.");
