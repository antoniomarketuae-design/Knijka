#!/usr/bin/env node
/**
 * WAVE C — re-drive every lesson whose finding a repair round closed, and read
 * the verdict off the DEBRIEF rather than off a metric.
 *
 * WHY THIS EXISTS AS A SCRIPT AND NOT AS A LANE. 145 lessons carry a standing
 * BROKEN finding and each has up to four legs (pc/mobile x right/wrong) — 376
 * drives. An agent per lesson would spend its whole context on process; this is
 * mechanical work with one judgement per drive, and the judgement is already
 * written down: did the debrief stop saying the thing the finding says it says.
 *
 * THREE RULES THIS SCRIPT ENFORCES, each bought with a wave that had to be
 * thrown away:
 *
 *  1. IT WILL NOT RUN AGAINST STAGING. `lesson-audit.mjs` used to default
 *     KNIJKA_BASE to a hardcoded quick-tunnel hostname, so a drive returned real
 *     frames and a real verdict FOR A DIFFERENT BUILD, without erroring. Every
 *     "I drove it and it passed" in this audit that did not set that variable
 *     measured the deployed build. This script requires an explicit base and
 *     passes KNIJKA_EXPECT_COMMIT so the harness attests what it measured.
 *
 *  2. IT WILL NOT RUN ON A MOVING TREE. The harness stamps the worktree hash at
 *     the start and end of every drive and refuses to certify when they differ —
 *     "the frames are whole, but they span two states of the code". That refusal
 *     is correct and it fires the moment a repair workflow is running beside it,
 *     so this checks for a dirty tree up front and stops rather than producing
 *     376 uncertifiable drives.
 *
 *  3. IT READS THE EXIT CODE OF THE THING IT RAN. Not a pipe's, not a wrapper's.
 *     A red suite was once reported here as EXIT:0 through a pipe, and a
 *     backgrounded run later reported 0 from its harness while vitest's own $?
 *     was 1.
 *
 * USAGE
 *   node tools/mobile/wave-c.mjs --base http://localhost:3460 [--limit N]
 *                                [--legs pc-right,pc-wrong] [--out DIR]
 *                                [--lessons a,b,c] [--allow-dirty]
 *
 * OUTPUT
 *   <out>/wave-c-results.jsonl — one row per drive: lesson, leg, exit, verdict,
 *   score, stars, frames, lost, endedNaturally, forcedBy, attested commit.
 *   Append-only, so an interrupted run resumes without losing what it measured.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");

// --- argv -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};
const has = (name) => argv.includes(name);

const BASE = flag("--base", process.env.KNIJKA_BASE);
const OUT = flag("--out", path.join(REPO, ".audit-frames", "wave-c"));
const LIMIT = Number(flag("--limit", "0")) || 0;
const LEGS = (flag("--legs", "pc-right,pc-wrong,mobile-right,mobile-wrong") || "").split(",");
const ONLY = (flag("--lessons", "") || "").split(",").filter(Boolean);

if (!BASE) {
  console.error(
    [
      "[wave-c] --base is required, and there is no default ON PURPOSE.",
      "  The old default was a hardcoded quick-tunnel hostname pointing at STAGING;",
      "  a drive against it returns real frames and a real verdict for a build that",
      "  is not yours, and does not error. Start a server from THIS tree first:",
      "",
      "    node -e \"import('./tools/mobile/lib/server.mjs').then(m=>m.ensureServer({}))\"",
      "    node tools/mobile/wave-c.mjs --base http://localhost:3460",
    ].join("\n"),
  );
  process.exit(2);
}

// --- rule 2: the tree must be still ----------------------------------------
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf8" }).trim();
const HEAD = git(["rev-parse", "HEAD"]);
const dirty = git(["status", "--porcelain"]).split("\n").filter(Boolean);
if (dirty.length && !has("--allow-dirty")) {
  console.error(
    [
      `[wave-c] the working tree has ${dirty.length} uncommitted path(s), so this run would`,
      "  produce drives the harness itself refuses to certify: it stamps the worktree hash",
      "  at the start and end of each drive and reports",
      "    !! THE SOURCE TREE MOVED DURING THIS DRIVE … must NOT be used to certify a closure",
      "  A repair workflow running beside Wave C is the usual cause. Commit or wait, then",
      "  re-run. --allow-dirty is available for a deliberate spot check that certifies nothing.",
    ].join("\n"),
  );
  process.exit(3);
}

// --- the re-drive set -------------------------------------------------------
const setPath = path.join(REPO, ".audit-frames", "waveC-redrive.json");
if (!existsSync(setPath)) {
  console.error(`[wave-c] ${setPath} not found — run scratchpad/derive-waveC.js first.`);
  process.exit(2);
}
/** @type {Array<{lesson:string,total:number,critical:number,legs:string[]}>} */
let rows = JSON.parse(readFileSync(setPath, "utf8"));
if (ONLY.length) rows = rows.filter((r) => ONLY.includes(r.lesson));
if (LIMIT) rows = rows.slice(0, LIMIT);

mkdirSync(OUT, { recursive: true });
const resultsPath = path.join(OUT, "wave-c-results.jsonl");

/** Rows already measured at THIS commit — so an interrupted run resumes. */
const done = new Set();
if (existsSync(resultsPath)) {
  for (const line of readFileSync(resultsPath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const j = JSON.parse(line);
      if (j.head === HEAD) done.add(`${j.lesson}/${j.leg}`);
    } catch {
      /* a torn tail line is not a reason to re-drive everything */
    }
  }
}

const planned = [];
for (const r of rows) {
  // A lesson whose findings named no leg is re-driven on all four: the finding
  // could be on any of them, and guessing is how coverage counts go wrong.
  const legs = r.legs && r.legs.length ? r.legs : LEGS;
  for (const leg of legs) {
    if (!LEGS.includes(leg)) continue;
    if (done.has(`${r.lesson}/${leg}`)) continue;
    planned.push({ lesson: r.lesson, leg, critical: r.critical, total: r.total });
  }
}

console.log(
  `[wave-c] ${rows.length} lesson(s) · ${planned.length} drive(s) to run · ` +
    `${done.size} already measured at ${HEAD.slice(0, 12)}`,
);
console.log(`[wave-c] target ${BASE}, attesting commit ${HEAD.slice(0, 12)}`);

// --- drive ------------------------------------------------------------------
/** Pull the machine summary the harness prints, which is the judgeable surface. */
function parseSummary(stdout) {
  const grab = (re) => {
    const m = re.exec(stdout);
    return m ? m[1].trim() : null;
  };
  return {
    verdict: grab(/VERDICT:\s*(.+?)\s*·/),
    score: grab(/SCORE:\s*(\d+)\s*наказателни/),
    stars: grab(/(\d+)\s*от\s*3\s*звезди/),
    frames: grab(/frames:\s*(\d+)\s*captured/),
    lost: grab(/captured\s*·\s*(\d+)\s*LOST/),
    endedNaturally: /endedNaturally:\s*true/.test(stdout),
    forcedBy: grab(/forcedBy:\s*(.+?)\s*$/m),
    treeMoved: /THE SOURCE TREE MOVED DURING THIS DRIVE/.test(stdout),
    attested: grab(/serving\s+([0-9a-f]{12})/),
  };
}

let ran = 0;
let refused = 0;
for (const p of planned) {
  const [platform, mode] = p.leg.split("-");
  const outDir = path.join(OUT, "frames", `${p.lesson}__${p.leg}`);
  const started = Date.now();
  const res = spawnSync(
    process.execPath,
    [path.join(HERE, "lesson-audit.mjs"), outDir, p.lesson, platform, mode],
    {
      cwd: REPO,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, KNIJKA_BASE: BASE, KNIJKA_EXPECT_COMMIT: HEAD },
    },
  );
  const stdout = (res.stdout || "") + (res.stderr || "");

  // KEEP THE TRANSCRIPT. This used to parse the harness output and throw it
  // away, so Wave C produced 0 run logs where sweep161 produced 520 — and a
  // verifier trying to settle whether a guard had fired found the tick report,
  // the DOM listing and the whole drive trace simply gone. sweep161 findings
  // can cite `run.log:120`; nothing from this wave could. The frames are the
  // evidence, but the log is what says WHY the frames look like that.
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, "run.log"), stdout);
  } catch {
    /* a drive that produced frames is not void because its log could not be written */
  }

  const s = parseSummary(stdout);
  if (s.treeMoved) refused++;
  ran++;

  appendFileSync(
    resultsPath,
    JSON.stringify({
      head: HEAD,
      lesson: p.lesson,
      leg: p.leg,
      critical: p.critical,
      total: p.total,
      // The harness's own code, not a wrapper's and not a pipe's.
      exit: res.status,
      ...s,
      ms: Date.now() - started,
      out: outDir,
    }) + "\n",
  );

  console.log(
    `[${String(ran).padStart(3)}/${planned.length}] ${p.lesson} ${p.leg} ` +
      `exit=${res.status} verdict=${s.verdict ?? "-"} score=${s.score ?? "-"} ` +
      `frames=${s.frames ?? "-"}${s.lost && s.lost !== "0" ? ` LOST=${s.lost}` : ""}` +
      (s.treeMoved ? "  !! TREE MOVED — certifies nothing" : ""),
  );
}

console.log("");
console.log(`[wave-c] ${ran} drive(s) written to ${resultsPath}`);
if (refused) {
  console.log(
    `[wave-c] ${refused} of them span two states of the code and CERTIFY NOTHING. ` +
      "Something edited the tree mid-run; re-drive those on a still tree.",
  );
  process.exit(1);
}
