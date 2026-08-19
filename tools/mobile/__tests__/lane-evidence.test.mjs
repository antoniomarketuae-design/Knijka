// -----------------------------------------------------------------------------
// lane-evidence.test.mjs — THE BELT. A DRIVE THAT HAPPENED AND WAS
// PHOTOGRAPHED IS NOT THROWN AWAY BECAUSE THE PROCESS DIED ON ITS WAY OUT.
//
//   node --test tools/mobile/__tests__/lane-evidence.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// `lesson-audit.mjs` writes `_audit-status.json` before sign-in and rewrites it
// at every phase change, and its header states the rule: "READ `exit` OUT OF
// `_audit-status.json`, and treat a process code that disagrees with it as
// evidence about node, not about the lesson." The rule was written down and
// nothing read it. `cli.mjs --judge-lane` is the reader; this file is the proof
// that it survives the thing it exists for.
//
// THE COST OF NOT HAVING IT, counted from the sweep's own ledger:
//
//   .audit-frames/sweep161/progress.txt  ->  28 exit=0 · 4 exit=127 · 2 exit=1
//
// and all four of the 127s had FINISHED — MACHINE SUMMARY, verdict, objectives,
// 20/29/30/41 frames on disk. `sc-ov-narrow/mobile-wrong` is a convicted
// collision at 10 наказателни точки, НЕИЗДЪРЖАН. A dispatcher that believes the
// process code re-drives or discards four healthy lanes and that finding with
// them. A false failure puts the defect back in the product just as surely as a
// false certificate takes it out of the report.
//
// BOTH DIRECTIONS ARE ASSERTED HERE, because the belt is only worth having if
// it can also say NO:
//   · a lane whose ledger says complete/exit 0 is judgeable even when the
//     process aborted — and the abort is FORCED in this file, not imagined;
//   · a lane whose ledger says exit 2 is NOT judgeable even when the process
//     exited 0. Counting files in a folder is the false pass the ledger exists
//     to end, and "the process said fine" is that same false pass wearing a
//     number.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { judgeLaneEvidence, LANE_JUDGEABLE, LANE_NOT_JUDGEABLE } from "../cli.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "..", "cli.mjs");
const SCRATCH = mkdtempSync(join(tmpdir(), "knijka-lane-evidence-"));
process.on("exit", () => rmSync(SCRATCH, { recursive: true, force: true }));

/** The status file sc-ov-narrow/mobile-wrong would have written today: it drove,
 *  it was photographed, it was judged, and then the process died. */
const COMPLETE = {
  scenario: "sc-ov-narrow",
  platform: "mobile",
  mode: "wrong",
  phase: "complete",
  framesWritten: 29,
  framesLost: 0,
  lostFrames: [],
  stdoutBroken: null,
  ended: true,
  verdict: "НЕИЗДЪРЖАН",
  score: 10,
  exit: 0,
};

let lanes = 0;
function lane(status, { files = ["01-arrival.png", "08-debrief.png"] } = {}) {
  const dir = join(SCRATCH, `lane-${lanes++}`);
  mkdirSync(dir, { recursive: true });
  for (const f of files) writeFileSync(join(dir, f), "PNG");
  if (status !== null) writeFileSync(join(dir, "_audit-status.json"), JSON.stringify(status, null, 2));
  return dir;
}

function runCli(args) {
  return new Promise((resolve) => {
    execFile(process.execPath, [CLI, ...args], { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE RECOVERY, WITH THE ABORT ACTUALLY FORCED. A recovery path nobody has
//    triggered is not a recovery path.
// ─────────────────────────────────────────────────────────────────────────────

test("a lane that finished and then ABORTED keeps its evidence, and is judged off the ledger", async (t) => {
  // 2 MiB, because the abort is a race that needs a response still tearing
  // down; at 2 bytes it did not fire once in 25 trials. Same fixture as
  // lib/__tests__/exit-integrity.test.mjs, and the same reason.
  const body = Buffer.alloc(2 * 1024 * 1024, 0x61);
  const server = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(body);
  });
  const base = await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
  });
  server.unref();

  const dir = join(SCRATCH, "aborting-lane");
  mkdirSync(dir, { recursive: true });
  const child = join(SCRATCH, "aborting-lane.mjs");
  // A LANE, IN MINIATURE, IN THE ORDER THE REAL ONE DOES IT: warm the route
  // from node, drive, photograph, write the ledger LAST at phase complete, then
  // end. `lesson-audit.mjs` closes the browser and sets `process.exitCode`; the
  // `process.exit()` here stands in for every dispatcher and wrapper that does
  // not, and forces the death this test is about.
  writeFileSync(
    child,
    `
    import { writeFileSync } from "node:fs";
    const r = await fetch(${JSON.stringify(base)}, { signal: AbortSignal.timeout(30000), redirect: "manual" });
    await r.arrayBuffer();
    writeFileSync(${JSON.stringify(join(dir, "01-arrival.png").replace(/\\/g, "\\\\"))}, "PNG");
    writeFileSync(${JSON.stringify(join(dir, "08-debrief.png").replace(/\\/g, "\\\\"))}, "PNG");
    writeFileSync(
      ${JSON.stringify(join(dir, "_audit-status.json").replace(/\\/g, "\\\\"))},
      ${JSON.stringify(JSON.stringify(COMPLETE, null, 2))},
    );
    process.exit(0);
    `,
  );

  const ran = await new Promise((resolve) => {
    execFile(process.execPath, [child], { windowsHide: true }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stderr: String(stderr) });
    });
  });
  server.close();

  if (ran.code === 0) {
    // Not a pass. If the abort will not fire, this test proves nothing about
    // recovery and must say so out loud rather than go green.
    t.diagnostic(`the abort did not fire (code ${ran.code}); the classification below is still asserted`);
  } else {
    assert.match(ran.stderr, /UV_HANDLE_CLOSING/, "the death must be the one O25 names");
  }

  // THE EVIDENCE SURVIVED THE DEATH. This is the whole belt: the ledger was on
  // disk before teardown, and teardown cannot rewrite it.
  const onDisk = JSON.parse(readFileSync(join(dir, "_audit-status.json"), "utf8"));
  assert.equal(onDisk.phase, "complete");
  assert.equal(onDisk.exit, 0);
  assert.equal(onDisk.verdict, "НЕИЗДЪРЖАН");
  assert.equal(readFileSync(join(dir, "08-debrief.png"), "utf8"), "PNG");

  // AND IT IS CLASSIFIED OFF THE LEDGER, not off the corpse. 127 is what a bash
  // dispatcher sees for this death and what sweep161's progress.txt recorded.
  const verdict = judgeLaneEvidence({ dir, processExit: 127 });
  assert.equal(verdict.judgeable, true, "the lane drove, was photographed and was judged — it is evidence");
  assert.equal(verdict.state, "judgeable");
  assert.equal(verdict.disagreed, true);
  assert.match(verdict.why, /evidence about node, not about the lesson/);

  const cli = await runCli(["--judge-lane", dir, "--lane-exit", "127"]);
  assert.equal(cli.code, LANE_JUDGEABLE, "and the dispatcher-facing exit code says keep it");
  assert.match(cli.stdout, /JUDGEABLE/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE OTHER DIRECTION. Each of these is the mutation for the test above: the
//    same shape with one field changed, and each must FLIP the answer.
// ─────────────────────────────────────────────────────────────────────────────

test("a clean process code cannot rescue a lane whose own ledger says the evidence is short", () => {
  // MUTATION of the case above: exit 2 instead of 0, process exited 0. If the
  // process code were consulted at all, this would come back judgeable — and a
  // lane with three missing frames would be scored as tested, which is the
  // false pass the ledger was added to end.
  const dir = lane({ ...COMPLETE, exit: 2, framesLost: 3, lostFrames: ["04-t012s.png", "04-t017s.png", "08-debrief.png"] });
  const verdict = judgeLaneEvidence({ dir, processExit: 0 });
  assert.equal(verdict.judgeable, false);
  assert.equal(verdict.state, "evidence-incomplete");
  assert.match(verdict.why, /3 frame\(s\) lost/);
  assert.equal(verdict.disagreed, true, "0 against a ledger that says 2 is a disagreement and must be named");
});

test("a lane that died mid-drive is not judgeable, however it exited", () => {
  // MUTATION: phase "drive" instead of "complete". sc-sig-controller-live is
  // this lane exactly — 5 whole PNGs, 20 empty ones, no MACHINE SUMMARY.
  for (const processExit of [0, 1, 127]) {
    const dir = lane({ ...COMPLETE, phase: "drive", exit: null });
    const verdict = judgeLaneEvidence({ dir, processExit });
    assert.equal(verdict.judgeable, false, `process exit ${processExit}`);
    assert.equal(verdict.state, "died");
    assert.match(verdict.why, /died at phase "drive"/);
  }
});

test("a torn status file is unknown, not fine — the one thing an abort can do to the ledger", () => {
  const dir = lane(null);
  writeFileSync(join(dir, "_audit-status.json"), '{"phase":"complete","exit":0,"frames');
  const verdict = judgeLaneEvidence({ dir, processExit: 0 });
  assert.equal(verdict.judgeable, false);
  assert.equal(verdict.state, "unreadable");
});

test("phase complete with no exit recorded is not a pass", () => {
  // MUTATION: the `exit` key emptied three ways. THIS ONE CAUGHT A REAL BUG in
  // the first draft of `judgeLaneEvidence` — it asked `Number.isFinite(Number(x))`,
  // and `Number(null)` is 0, so `exit: null` (which is precisely what
  // lesson-audit.mjs initialises the field to) certified the lane as a clean
  // finish. A field nobody wrote, read as the best possible answer.
  //
  // A string "0" is refused for the same reason and not because it is
  // unparseable: the ledger is JSON this repo writes, an exit is a number
  // there, and a guard that starts coercing shapes it did not expect is a guard
  // that will eventually coerce one it should have refused.
  const { exit, ...noExit } = COMPLETE;
  for (const status of [noExit, { ...COMPLETE, exit: null }, { ...COMPLETE, exit: "0" }, { ...COMPLETE, exit: "" }]) {
    const verdict = judgeLaneEvidence({ dir: lane(status), processExit: 0 });
    assert.equal(verdict.judgeable, false, `exit: ${JSON.stringify(status.exit)}`);
    assert.equal(verdict.state, "no-verdict", `exit: ${JSON.stringify(status.exit)}`);
  }
  // And the ledger's own 0 — a real number — still passes, so this is not a
  // guard that refuses everything.
  assert.equal(judgeLaneEvidence({ dir: lane(COMPLETE), processExit: 0 }).judgeable, true);
});

test("an unknown process code is unknown, not zero — no disagreement is invented", () => {
  // The same `Number()` trap on the other argument: `Number(null)` is 0, so a
  // caller that does not know how the process exited would have been recorded
  // as having seen a clean 0, and a lane whose ledger says exit 2 would report
  // a disagreement that nobody observed.
  const short = judgeLaneEvidence({ dir: lane({ ...COMPLETE, exit: 2, framesLost: 1 }) });
  assert.equal(short.judgeable, false);
  assert.equal(short.disagreed, false, "nothing was seen, so nothing disagreed");
});

test("no ledger is never a pass, and the message does not claim to know which kind of nothing it is", () => {
  const empty = lane(null, { files: [] });
  const withFrames = lane(null);

  const a = judgeLaneEvidence({ dir: empty, processExit: 0 });
  assert.equal(a.judgeable, false);
  assert.match(a.why, /never dispatched/);

  // sweep161's folders PREDATE the ledger and hold real frames. Calling that
  // "never dispatched" would be a confident lie about a lane that plainly ran —
  // the reassuring-sounding kind this harness keeps being caught by.
  const b = judgeLaneEvidence({ dir: withFrames, processExit: 127 });
  assert.equal(b.judgeable, false);
  assert.doesNotMatch(b.why, /never dispatched/);
  assert.match(b.why, /predates the ledger|died before it wrote one/);
});

test("a lane that finished cleanly and exited cleanly is judgeable and claims no disagreement", () => {
  const verdict = judgeLaneEvidence({ dir: lane(COMPLETE), processExit: 0 });
  assert.equal(verdict.judgeable, true);
  assert.equal(verdict.disagreed, false);
  assert.doesNotMatch(verdict.why, /node/, "there is nothing to blame on node here and it must not say so");
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. THE DISPATCHER-FACING CONTRACT — the exit codes a bash loop branches on.
// ─────────────────────────────────────────────────────────────────────────────

test("--judge-lane answers with a code a shell can branch on, in both directions", async () => {
  const good = await runCli(["--judge-lane", lane(COMPLETE), "--lane-exit", "127"]);
  assert.equal(good.code, LANE_JUDGEABLE);
  assert.equal(LANE_JUDGEABLE, 0);

  const bad = await runCli(["--judge-lane", lane({ ...COMPLETE, exit: 2, framesLost: 1 }), "--lane-exit", "0"]);
  assert.equal(bad.code, LANE_NOT_JUDGEABLE);
  assert.match(bad.stdout, /NOT JUDGEABLE/);
  // 3, not 1: 1 is this CLI failing to answer, and a dispatcher that cannot
  // tell "re-drive that lane" from "the judge itself is broken" will do the
  // wrong one of the two.
  assert.equal(LANE_NOT_JUDGEABLE, 3);
  assert.notEqual(LANE_NOT_JUDGEABLE, 1);
});

test("importing cli.mjs does not run the CLI — the guard that makes any of this testable", async () => {
  // If the entry guard were dropped, importing this module at the top of this
  // file would have started a WebKit sweep against node --test's argv. The
  // import above is the assertion; this states what it is protecting.
  assert.equal(typeof judgeLaneEvidence, "function");
  const listed = await runCli(["--list"]);
  assert.equal(listed.code, 0, "and it still runs when it IS the command");
  assert.match(listed.stdout, /ROUTES/);
  assert.doesNotMatch(listed.stdout, /starting next dev/, "--list must return before any server is started");
});
