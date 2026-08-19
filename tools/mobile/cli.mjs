#!/usr/bin/env node
// =============================================================================
// The mobile harness — one command, real numbers, on the founder's phone.
//
//   node tools/mobile/cli.mjs                       full sweep, WebKit
//   node tools/mobile/cli.mjs --route simulator-drive --device iphone16-landscape
//   node tools/mobile/cli.mjs --list                 routes + devices
//   node tools/mobile/cli.mjs --engine chromium      SECOND opinion only
//   node tools/mobile/cli.mjs --json                 machine-readable report
//   node tools/mobile/cli.mjs --cleanup-user         delete the throwaway account
//   node tools/mobile/cli.mjs --judge-lane <dir> [--lane-exit <code>]
//                                                   is an audit lane judgeable?
//
// Routes are named by ID, never by path, on purpose: Git Bash on Windows
// rewrites any argument that starts with "/" into a C:\Program Files\Git\...
// path, so `--route /theory` silently becomes a navigation to
// http://localhost:3460C:/Program Files/Git/theory. Measured, not guessed.
//
// EXIT CODE. 0 when every route met its budget, 1 when any budget failed or any
// route errored — so this is usable as a gate step directly, not only through
// vitest.
//
// ── AND THE EXIT CODE IS SET, NEVER FORCED — O25 ────────────────────────────
//
// This file used to end on `process.exit(verdict.pass ? 0 : 1)`, and four other
// `process.exit()` calls stood above it. On node v24.18.0 / Windows that is a
// way to publish a number nobody chose: a SUCCESSFUL global fetch leaves an
// undici handle mid-teardown and `process.exit()` on top of it aborts with
//
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
//       file src\win\async.c, line 94
//
// measured 25 times out of 25, and reported as 0xC0000409 by node and by cmd
// but as 127 by Git Bash, which is what sweep161's progress.txt was written by
// (the full measurement is in `lib/auth.mjs` `httpGet`). Every path through
// this file fetches before it exits — `isUp()`
// inside `ensureServer`, then one warm per route inside `sweep()` — so the
// verdict this harness exists to produce could be replaced by 127 on the way
// out, in EITHER direction: a passing sweep reported as broken, a failing one
// reported as neither. `.audit-frames/sweep161/progress.txt` is what that looks
// like at scale — 28 exit=0 · 4 exit=127 · 2 exit=1, and all four of the 127s
// had finished, one of them carrying a collision and a НЕИЗДЪРЖАН verdict.
//
// So this file no longer calls `process.exit()`: `main()` RETURNS a code, and
// the entry block below assigns it to `process.exitCode`.
//
// THE THING THAT COULD HAVE GONE WRONG WITH THAT, MEASURED RATHER THAN HOPED.
// `process.exit()` also forced this process to end while the dev server it
// spawned kept running, which is the whole of `--keep-server`. A natural exit
// only does that if the child does not hold the parent's event loop open, and a
// referenced child handle would have turned `--keep-server` into a hang. So it
// was measured on 2026-08-19 with a long-lived child spawned through
// `lib/server.mjs`'s exact options (`stdio: ["ignore", fd, fd]`,
// `detached: false`, `shell: true` on win32): the parent exited in ~200 ms,
// child still alive, with and without `unref()`. No `unref()` was needed and
// none was added.
//
// Returning a code instead of forcing one also made this file importable, and
// that is what `--judge-lane` is: the READER half of the rule
// `lesson-audit.mjs` writes down — see `judgeLaneEvidence`.
// =============================================================================
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { DEVICES } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";
import { sweep } from "./lib/measure.mjs";
import { ensureServer, DEFAULT_PORT } from "./lib/server.mjs";
import { dropHarnessUser, HARNESS_EMAIL } from "./lib/user.mjs";
import { evaluate, formatDelta, formatReport, summarize } from "./lib/budget.mjs";

/** Tracked on purpose: later phases are measured against this file. */
const BASELINE_FILE = join(dirname(fileURLToPath(import.meta.url)), "baseline.json");

/** `--judge-lane` said the lane can be judged; its frames are evidence. */
export const LANE_JUDGEABLE = 0;
/** `--judge-lane` said it cannot; re-drive this lane. Distinct from 1, which is
 *  this CLI failing rather than answering. */
export const LANE_NOT_JUDGEABLE = 3;

function parseArgs(argv) {
  const out = { routes: [], devices: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === "--route" || arg === "-r") out.routes.push(next());
    else if (arg === "--device" || arg === "-d") out.devices.push(next());
    else if (arg === "--engine") out.engine = next();
    else if (arg === "--port") out.port = Number(next());
    else if (arg === "--base-url") out.baseUrl = next();
    else if (arg === "--judge-lane") out.judgeLane = next();
    else if (arg === "--lane-exit") out.laneExit = next();
    else if (arg.startsWith("--")) out.flags.add(arg.slice(2));
    else out.routes.push(arg);
  }
  return out;
}

/**
 * AN EXIT CODE, OR NOTHING — AND `Number()` IS NOT THE WAY TO ASK.
 *
 * Caught by this lane's own mutation test rather than by review, which is the
 * only reason it is not still in here: `Number(null)` is 0 and `Number("")` is
 * 0, so `Number.isFinite(Number(x))` reads BOTH of them as a clean exit. A
 * ledger carrying `exit: null` — which is exactly what `lesson-audit.mjs`
 * initialises the field to, before the lane has decided anything — was
 * therefore certified as a lane that finished at exit 0. A field nobody wrote,
 * read as the best possible answer: the false certificate this whole audit is
 * about, reproduced inside the guard against it.
 *
 * `strings: false` for the ledger, which is JSON we wrote and where a string is
 * a shape nobody meant; strings allowed for `--lane-exit`, which arrives from
 * argv and is a string by construction.
 */
function asExitCode(value, { strings = true } = {}) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (strings && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

/**
 * THE BELT. A DRIVE THAT HAPPENED AND WAS PHOTOGRAPHED IS NOT THROWN AWAY
 * BECAUSE THE PROCESS DIED ON ITS WAY OUT.
 *
 * `lesson-audit.mjs` writes `_audit-status.json` first, before sign-in, and
 * rewrites it at every phase change; `phase: "complete"` carries the `exit` the
 * lane CHOSE. That file is on disk before the process teardown that can abort,
 * so no abort can rewrite it. Its own header states the rule this function is:
 * "READ `exit` OUT OF `_audit-status.json`, and treat a process code that
 * disagrees with it as evidence about node, not about the lesson."
 *
 * It was written down and never read. Four lanes of sweep161 —
 * `sc-ov-narrow` both modes, `sc-ov-crossing-overtake/mobile-wrong`,
 * `sc-ov-lane-keeping/mobile-wrong` — exited 127 with COMPLETE evidence on
 * disk: MACHINE SUMMARY, verdict, objectives, 20/29/30/41 frames. Read as a
 * process code they are four failures. Read off the ledger they are four
 * findings, one of them a convicted collision at 10 наказателни точки.
 *
 * BOTH DIRECTIONS, because the reassuring answer is the dangerous one here as
 * everywhere else in this harness:
 *   · the STATUS FILE is authoritative, not the process code — a lane whose
 *     ledger says `complete, exit 0` is judgeable even if the process said 127;
 *   · and it is authoritative in the OTHER direction too — a lane whose ledger
 *     says `exit 2` (frames lost, or a transcript that never reached disk) is
 *     NOT judgeable even if the process exited 0. Frames counted by listing a
 *     folder is exactly the false pass the status file was added to end.
 * Anything doubtful — no file, unreadable file, a phase that never reached
 * `complete`, an `exit` that is not a number — is NOT judgeable, because the
 * cost of re-driving a good lane is minutes and the cost of scoring an empty
 * one as tested is a lesson nobody ever looked at.
 *
 * @param {{dir:string, processExit?:number|null}} args
 * @returns {{judgeable:boolean, state:string, why:string, status:object|null,
 *            ledgerExit:number|null, disagreed:boolean}}
 */
export function judgeLaneEvidence({ dir, processExit = null }) {
  const file = join(dir, "_audit-status.json");
  const seen = asExitCode(processExit);
  const no = (state, why) => ({
    judgeable: false, state, why, status: null, ledgerExit: null, disagreed: false,
  });

  if (!existsSync(file)) {
    // The distinction sc-crossing-bus-shadow's four EMPTY FOLDERS and
    // sc-crossing-let-pass's absence collapsed into one before the status file
    // existed: dispatched-and-died looks exactly like never-dispatched when all
    // you do is list a directory.
    //
    // AND THIS MESSAGE MUST NOT CLAIM MORE THAN IT KNOWS. The sweep161 folders
    // PREDATE the ledger — `sc-ov-narrow/mobile-wrong` holds 29 frames and a
    // whole MACHINE SUMMARY — so "never dispatched" would be a confident lie
    // about a lane that plainly ran. Either way the answer is the same and it
    // is the safe one: without the ledger nothing here can say how many frames
    // were lost, so nothing here may certify the lane.
    const holdsFiles = (() => {
      try {
        return readdirSync(dir).length > 0;
      } catch {
        return false;
      }
    })();
    return no(
      "no-ledger",
      holdsFiles
        ? `no ${file}, but the folder is not empty — either the lane died before it wrote one, or it ` +
          `was driven by a build that predates the ledger (sweep161). Its frame count is unknowable from here.`
        : `no ${file} and nothing in the folder — this lane was never dispatched`,
    );
  }

  let status;
  try {
    status = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    // A torn write is the one thing an abort CAN do to this file. Unreadable is
    // not "fine", and it is not "broken lesson" either — it is unknown, and
    // unknown re-drives.
    return no("unreadable", `${file} did not parse (${String(error?.message || error)})`);
  }
  if (!status || typeof status !== "object") {
    return no("unreadable", `${file} is not an object`);
  }

  const ledgerExit = asExitCode(status.exit, { strings: false });
  const disagreed = seen !== null && ledgerExit !== null && seen !== ledgerExit;
  const shared = { status, ledgerExit, disagreed };

  if (status.phase !== "complete") {
    return {
      ...shared,
      judgeable: false,
      state: "died",
      why:
        `the harness started and died at phase "${status.phase ?? "(none)"}" — ` +
        `whatever is in this folder is a fragment, not an answer`,
    };
  }
  if (ledgerExit === null) {
    return { ...shared, judgeable: false, state: "no-verdict", why: "phase is complete but the ledger wrote no exit" };
  }
  if (ledgerExit !== 0) {
    return {
      ...shared,
      judgeable: false,
      state: "evidence-incomplete",
      why:
        `the lane itself recorded exit ${ledgerExit} — ` +
        `${status.framesLost ?? "?"} frame(s) lost${status.stdoutBroken ? `, stdout broken (${status.stdoutBroken})` : ""}`,
    };
  }
  return {
    ...shared,
    judgeable: true,
    state: "judgeable",
    why: disagreed
      ? `the lane recorded exit 0 with ${status.framesWritten ?? "?"} frame(s) written; ` +
        `the process said ${seen}, which is evidence about node, not about the lesson`
      : `the lane recorded exit 0 with ${status.framesWritten ?? "?"} frame(s) written`,
  };
}

/**
 * Everything the CLI does, as a value rather than as a side effect on the
 * process. RETURNS the exit code; never calls `process.exit()` — see the header.
 */
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.flags.has("help") || args.flags.has("h")) {
    console.log(
      [
        "node tools/mobile/cli.mjs [options]",
        "",
        "  -r, --route <id>     route id (repeatable). Default: all",
        "  -d, --device <id>    device id (repeatable). Default: iPhone 16 portrait + landscape + small",
        "      --engine <name>  webkit (default) | chromium | firefox",
        "      --port <n>       dev server port (default 3460)",
        "      --base-url <url> measure an already-running server instead",
        "      --no-screenshots skip PNG capture",
        "      --no-server      fail instead of starting a dev server",
        "      --keep-server    leave the dev server running for the next run",
        "      --json           print the raw report",
        "      --save-baseline  write tools/mobile/baseline.json from this run",
        "      --list           list routes and devices, then exit",
        "      --cleanup-user   delete the throwaway harness account, then exit",
        "      --judge-lane <d> read <d>/_audit-status.json and say whether that",
        "                       audit lane can be judged. Exit 0 yes, 3 no.",
        "      --lane-exit <n>  the process code that lane exited with, so a",
        "                       disagreement can be named instead of believed",
        "",
        "Routes:  " + ROUTES.map((r) => r.id).join(", "),
        "Devices: " + Object.keys(DEVICES).join(", "),
      ].join("\n"),
    );
    return 0;
  }

  if (args.flags.has("list")) {
    console.log("ROUTES");
    for (const r of ROUTES) {
      console.log(
        `  ${r.id.padEnd(18)} ${r.path.padEnd(46)} content=${r.contentSelectors.join("+")} ` +
          `budget>=${Math.round(r.budget.contentMin * 100)}%${r.budget.foldMustPass ? " fold" : ""}`,
      );
    }
    console.log("\nDEVICES");
    for (const d of Object.values(DEVICES)) {
      console.log(
        `  ${d.id.padEnd(20)} ${d.width}x${d.height} dpr${d.dpr}  safe-area ` +
          `t${d.safeArea.top} r${d.safeArea.right} b${d.safeArea.bottom} l${d.safeArea.left}` +
          (d.primary ? "   <- founder's device" : ""),
      );
    }
    return 0;
  }

  if (args.judgeLane) {
    const verdict = judgeLaneEvidence({ dir: args.judgeLane, processExit: args.laneExit });
    console.log(
      `[lane-evidence] ${verdict.judgeable ? "JUDGEABLE" : "NOT JUDGEABLE"} ` +
        `${args.judgeLane} — ${verdict.state}: ${verdict.why}`,
    );
    if (verdict.disagreed) {
      console.log(
        `[lane-evidence] the process exited ${args.laneExit} and the lane's own ledger says ` +
          `exit ${verdict.ledgerExit}. The ledger was on disk first and no abort can rewrite it.`,
      );
    }
    return verdict.judgeable ? LANE_JUDGEABLE : LANE_NOT_JUDGEABLE;
  }

  if (args.flags.has("cleanup-user")) {
    const result = await dropHarnessUser();
    console.log(
      result.deleted
        ? `[mobile-harness] deleted ${result.email}`
        : `[mobile-harness] no account named ${HARNESS_EMAIL} to delete`,
    );
    return 0;
  }

  const port = args.port || DEFAULT_PORT;
  let server = { started: false, stop: () => {}, url: args.baseUrl };

  if (!args.baseUrl) {
    if (args.flags.has("no-server")) {
      throw new Error("[mobile-harness] --no-server given but no --base-url to measure");
    }
    server = await ensureServer({ port });
  }

  let report;
  try {
    report = await sweep({
      routes: args.routes,
      devices: args.devices,
      engine: args.engine,
      baseUrl: server.url,
      screenshots: !args.flags.has("no-screenshots"),
      onResult: (r) =>
        console.log(
          r.ok
            ? `  ${r.route.padEnd(18)} ${r.device.padEnd(20)} content ` +
              `${(r.coverage.contentFraction * 100).toFixed(1)}%  chrome ` +
              `${(r.coverage.chromeFraction * 100).toFixed(1)}%  fold ${r.fold.pass ? "ok" : "FAIL"}` +
              `  touch<44 ${r.touch.violations.length}`
            : `  ${r.route.padEnd(18)} ${r.device.padEnd(20)} ERROR ${r.error}`,
        ),
    });
  } finally {
    if (server.started && !args.flags.has("keep-server")) server.stop();
  }

  const baseline = existsSync(BASELINE_FILE)
    ? JSON.parse(readFileSync(BASELINE_FILE, "utf8"))
    : null;

  const verdict = evaluate(report);
  if (args.flags.has("json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report, verdict));
    // The baseline is the whole point of a harness that runs more than once.
    if (baseline) console.log(formatDelta(baseline, report));
  }

  if (args.flags.has("save-baseline")) {
    writeFileSync(BASELINE_FILE, `${JSON.stringify(summarize(report, baseline), null, 2)}\n`);
    console.log(`  baseline written: ${BASELINE_FILE}`);
  }

  return verdict.pass ? 0 : 1;
}

// Only when this file IS the command. Without the guard, importing it to test
// `judgeLaneEvidence` would run a whole WebKit sweep against the test runner's
// argv — which is how the previous shape of this file made itself untestable.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    // Loud, and still a number somebody chose. The old top-level `throw` became
    // an unhandled rejection, which prints a stack and exits 1 — the same code
    // a failed budget uses, so a broken harness and a failing route were
    // indistinguishable to whatever read the code.
    console.error(String(error?.stack || error));
    process.exitCode = 1;
  }
}
