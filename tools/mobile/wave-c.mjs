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
 *   score, stars, frames, lost, endedNaturally, forcedBy, attested commit, the
 *   two INPUT guards — lostKeys, refusedReversePress — that say whether the
 *   drive's own pedals arrived (lib/summary.mjs; sc-speed-creep:84ba5dbf), and
 *   the CHANNEL those pedals arrived on — inputChannel, driveKeyEvents,
 *   touchEvents, touchOverlay (sc-speed-creep:dff70553). `touchEvents: 0` on a
 *   mobile row is the fact that refuses a finding addressed to
 *   TouchControls.tsx: this harness drives a phone-sized viewport with a
 *   KEYBOARD, so no drive it takes can exercise a thumb pad.
 *   Append-only, so an interrupted run resumes without losing what it measured.
 *   <out>/frames/<lesson>__<leg>/run.log — the whole transcript, kept.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseSummary } from "./lib/summary.mjs";
import { measuredLegs } from "./lib/resume.mjs";
import { DRIVE_TIMEOUT_MS } from "./lib/limits.mjs";

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

/**
 * Rows already measured at THIS commit — so an interrupted run resumes.
 *
 * The predicate lives in lib/resume.mjs and consults the EXIT CODE, which
 * this block did not: a drive that crashed before it ever reached the lesson
 * was filed as measured for ever, so a sweep could report 204/204 over holes.
 * Three did exactly that on 2026-08-26.
 */
const done = existsSync(resultsPath) ? measuredLegs(readFileSync(resultsPath, "utf8"), HEAD) : new Set();

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
//
// `parseSummary` LIVES IN lib/summary.mjs AND NOT HERE, and the move is the
// whole reason the two new counters below can be gated at all. This file has
// top-level side effects — it reads argv, refuses a dirty tree and then drives
// 376 lessons — so a test that imported it to check the parser would start a
// wave. Nothing could exercise the reader, which is how it went fifteen rounds
// lifting nine fields and dropping two. `__tests__/wave-c-summary.test.mjs`
// now drives it against real transcripts out of the corpus.

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
      // WITHOUT THIS, A DEAD BROWSER IS INDISTINGUISHABLE FROM A SLOW DRIVE.
      // Three shards blocked here for eleven hours on 2026-08-25 while the
      // server stayed healthy. The bound is measured, not guessed — see
      // lib/limits.mjs. A killed drive records exit null, which resume.mjs
      // correctly refuses to count as measured, so it is re-driven.
      timeout: DRIVE_TIMEOUT_MS,
    },
  );
  const stdout = (res.stdout || "") + (res.stderr || "");
  const timedOut = Boolean(res.error && res.error.code === "ETIMEDOUT");

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
      timedOut,
      ...s,
      ms: Date.now() - started,
      out: outDir,
    }) + "\n",
  );

  console.log(
    `[${String(ran).padStart(3)}/${planned.length}] ${p.lesson} ${p.leg} ` +
      `exit=${res.status} verdict=${s.verdict ?? "-"} score=${s.score ?? "-"} ` +
      `frames=${s.frames ?? "-"}${s.lost && s.lost !== "0" ? ` LOST=${s.lost}` : ""}` +
      // The channel, on the console line and not only in the row: a dispatcher
      // reading this scroll is the reader who routes the finding. `pad=` is the
      // other half (sc-speed-creep:dff70553) — whether the drivetrain pad was
      // reached at all, and whether it still owned the finger after the hold.
      // «unreached» is the state that forbids addressing a row to a touch file;
      // «DROPPED» is the brake-drop family's own question, answered.
      ` in=${s.inputChannel ?? "?"}/touch=${s.touchEvents ?? "?"}` +
      ` pad=${
        s.touchProbe === null
          ? "?"
          : s.touchProbe !== "actuated"
            ? "unreached"
            : s.touchProbeHold === "survived"
              ? "held"
              : "DROPPED"
      }` +
      (s.treeMoved ? "  !! TREE MOVED — certifies nothing" : "") +
      (timedOut ? "  !! KILLED at the drive timeout — re-drive it" : ""),
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
