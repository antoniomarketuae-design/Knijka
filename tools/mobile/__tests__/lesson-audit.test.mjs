// -----------------------------------------------------------------------------
// lesson-audit.test.mjs — WHAT A LANE LEAVES BEHIND WHEN IT DOES NOT FINISH.
//
//   node --test tools/mobile/__tests__/lesson-audit.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT. `.audit-frames/sweep161/sc-park-gap-short/pc-wrong/RUN.log` is
// the whole argument. Measured on disk: 57 PNGs, 54 of them 0 bytes, one
// truncated at exactly 524,288 — and the log's last two lines are
//
//     [04-t130s] 49 км/ч  card=-/-
//     Node.js v24.18.0
//
// with `grep -c "Error"` over the entire file returning ZERO. The process died
// mid-drive and the runtime's own obituary never reached the disk, so the audit
// that read the folder could only write: *"the node process then died outright
// at t130s with no error text in RUN.log … nothing in the log says why."* Four
// more lessons (sc-park-judge, sc-crossing-bus-shadow, sc-crossing-child-ball,
// sc-rx-queue-clear) were filed COULD_NOT_TEST off the same silence.
//
// A harness cannot borrow the runtime's dying words. It has to write its own,
// into a file it controls, small enough to land on a disk that just failed.
//
// THE TWO DIRECTIONS, because a guard that fires on everything is worth exactly
// as much as one that fires on nothing:
//
//   A DEATH MUST BE RECORDED — `_audit-status.json` says `phase: "crashed"`,
//   names the phase it died in, carries the reason, and the process exits 4.
//   Against the old code every one of these assertions FAILS: there was no
//   handler, so the status file froze at whatever phase it had reached, `why`
//   and `diedDuring` did not exist, and the exit code was Node's own 1 — the
//   same 1 a healthy lane returns when it merely loses a frame.
//
//   A FAILURE THAT ALREADY HAS A NAME MUST KEEP IT — a refused sign-in exits 3
//   and stays `signin-refused`, and a lane that was never dispatched leaves no
//   directory and no status file at all (exit 2). If the crash guard swallowed
//   those, the sweep would lose the distinction between "fix the harness",
//   "fix the login rate-limiter" and "this lesson was never driven" — which is
//   the distinction the whole status file exists to draw.
//
// HOW IT IS DRIVEN. The harness is a top-level-await script that exits on a
// missing argument, so it cannot be imported; every test here spawns the real
// file as the sweep does. The crash is forced by pointing
// PLAYWRIGHT_BROWSERS_PATH at an empty directory — measured at 426 ms to throw,
// no network, and it needs no browser to be installed, so it behaves the same
// on this box and on a CI runner that has never run `playwright install`.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, "..", "lesson-audit.mjs");

const scratch = mkdtempSync(join(tmpdir(), "knijka-lesson-audit-"));
/** A browsers directory that exists and holds nothing — `launch()` throws
 *  "Executable doesn't exist at …" against it, fast and offline. */
const NO_BROWSERS = mkdtempSync(join(tmpdir(), "knijka-no-browsers-"));
process.on("exit", () => {
  for (const dir of [scratch, NO_BROWSERS]) rmSync(dir, { recursive: true, force: true });
});

let lane = 0;
/** Run the harness the way a sweep lane does and hand back everything it left. */
function drive(args, env = {}) {
  const out = join(scratch, `lane-${(lane += 1)}`);
  const r = spawnSync(process.execPath, [HARNESS, out, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
    // No shell, and stdout is a PIPE rather than a file — the harsher of the
    // two, because a piped stdout is the one `process.exit()` can truncate.
    windowsHide: true,
  });
  const statusPath = join(out, "_audit-status.json");
  return {
    out,
    code: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    dirExists: existsSync(out),
    files: existsSync(out) ? readdirSync(out) : [],
    status: existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) : null,
  };
}

/** The lane the poisoned browsers path produces, driven once and shared: it
 *  costs a playwright module load (~1 s) and four tests ask about it. */
const crashed = drive(["sc-test-crash", "mobile", "right"], {
  PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS,
});

test("a harness death is recorded as a death, not left as a frozen phase", () => {
  // OLD BEHAVIOUR: no handler existed, so the status file kept whatever phase
  // it had reached — "starting" — which reads as a lane still in flight.
  assert.equal(crashed.status?.phase, "crashed");
  assert.notEqual(crashed.status?.phase, "complete");
});

test("the death names the phase it happened in", () => {
  // "died before it opened a browser" and "died at t130s of the drive" have to
  // be two different rows. sc-crossing-bus-shadow was the first and
  // sc-park-gap-short/pc-wrong the second, and the sweep could not tell them
  // apart. OLD BEHAVIOUR: `diedDuring` did not exist.
  assert.equal(crashed.status?.diedDuring, "starting");
  assert.equal(crashed.status?.kind, "uncaughtException");
});

test("the death carries a reason, in the file rather than in the lost stderr", () => {
  // The whole point: RUN.log for sc-park-gap-short/pc-wrong contains no error
  // text at all. OLD BEHAVIOUR: `why` did not exist, and the only evidence of
  // the death was Node's version banner on a stream that may not survive.
  const why = crashed.status?.why;
  assert.equal(typeof why, "string");
  assert.ok(why.length > 20, `the reason is too short to act on: ${JSON.stringify(why)}`);
  assert.match(why, /launch|playwright|Executable/i);
  // And it is a reason, not a picture: playwright's six-line advice box must
  // not be what a reader gets instead of the message.
  assert.ok(!/^[╔╗╚╝║═\s⏎]*$/.test(why), `the reason is box drawing: ${JSON.stringify(why)}`);
});

test("a crash exits 4 — a code no healthy lane can return", () => {
  // OLD BEHAVIOUR: an unhandled rejection exits 1, which is also what a lane
  // that merely lost a frame returns. A re-drive queue reading exit codes
  // could not separate "fix the harness" from "photograph it again".
  assert.equal(crashed.code, 4);
  assert.equal(crashed.status?.exit, 4);
});

test("the transcript is saved beside the frames, because a piped stdout can be cut", () => {
  // `process.exit()` truncates a piped stdout, and on this harness stdout IS
  // the evidence — sc-sig-controller-live's verdict survived only in its log.
  assert.ok(
    crashed.files.includes("_audit-transcript.log"),
    `no transcript among ${JSON.stringify(crashed.files)}`,
  );
  const transcript = readFileSync(join(crashed.out, "_audit-transcript.log"), "utf8");
  assert.match(transcript, /THE HARNESS DIED/);
  assert.match(transcript, /RE-DRIVE it/);
});

test("the run says out loud that its findings are worthless", () => {
  // A run that cannot answer its own question must never look like a quiet
  // pass. Both lines start with the harness's `!!` marker.
  assert.match(crashed.stdout, /!! THE HARNESS DIED \(uncaughtException\) DURING «starting»/);
  assert.match(crashed.stdout, /Nothing below is a finding about the lesson/);
});

// ── THE OTHER DIRECTION ────────────────────────────────────────────────────

test("a lane that was never dispatched leaves no directory and no status file", () => {
  // The state the guard must NOT manufacture. `_audit-status.json` is the
  // difference between sc-crossing-bus-shadow (dispatched, died) and
  // sc-crossing-let-pass (never dispatched); if a bad invocation created one,
  // that difference would be gone. Exit 2, not 4 — the crash guard is not
  // allowed to claim this.
  const out = join(scratch, "never-dispatched");
  const r = spawnSync(process.execPath, [HARNESS, out], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 2);
  assert.equal(existsSync(out), false, "a mis-dispatched lane must not leave a folder behind");
  assert.match(r.stderr, /usage: node tools\/mobile\/lesson-audit\.mjs/);
});

test("a refused sign-in keeps its own name and its own exit code", { concurrency: 1 }, (t) => {
  // A failure that already has a diagnosis must not be relabelled "the harness
  // died" — sc-rb-exit-signal/mobile-wrong failed at the login form, and the
  // fix for that lives in the rate-limiter, not here. This one needs a real
  // browser, so it stands aside where none is installed rather than failing for
  // a reason that is not the code's.
  const r = drive(["sc-test-signin", "mobile", "right"], {
    // `.invalid` never resolves (RFC 2606), so `page.goto` throws in ~4 s.
    // MEASURED, and the alternative is why it is spelled this way: a base that
    // resolves but answers nothing — http://127.0.0.1:1 — does NOT make
    // `goto` throw. WebKit renders its own error page, the navigation
    // "succeeds", and auth.mjs then sits on `waitForSelector("#email")` for its
    // full hardcoded 120 s. 122 s per dead lane, in a sweep of 644.
    KNIJKA_BASE: "http://knijka-audit-test.invalid",
  });
  if (r.status?.phase === "crashed" && /Executable doesn't exist|playwright/i.test(r.status.why ?? "")) {
    t.skip("no playwright browser on this machine — the sign-in path needs one");
    return;
  }
  assert.equal(r.status?.phase, "signin-refused");
  assert.equal(r.code, 3);
  assert.equal(r.status?.exit, 3);
  assert.match(r.stdout, /!! SIGN-IN WAS REFUSED/);
});

// ── THE LEDGER THE STATUS FILE PUBLISHES ───────────────────────────────────

test("the status file publishes the frame ledger at every phase, not only at the end", () => {
  // THE DEFECT: `framesWritten` was copied into the status by hand at two call
  // sites, so any lane that never reached `phase: "complete"` published
  // "0 written, 0 lost" — including sc-sig-controller-live/mobile-right, which
  // holds 5 whole PNGs, 20 empty ones and 4 truncated, and stops mid-drive.
  //
  // This crash happens before the camera exists, so the honest numbers here are
  // zeros; what is asserted is that the FIELDS ARE PRESENT AND CONSISTENT on a
  // non-complete lane, which is the property the hand-copying broke. The
  // counting itself is pinned in frames.test.mjs, against the ledger directly.
  for (const key of ["framesWritten", "framesLost", "lostFrames", "cameraStopped", "frames"]) {
    assert.ok(key in crashed.status, `${key} is missing from a crashed lane's status file`);
  }
  assert.equal(crashed.status.framesWritten, 0);
  assert.equal(crashed.status.framesLost, 0);
  assert.deepEqual(crashed.status.lostFrames, []);
  // The per-frame manifest — the only witness to what this process actually
  // wrote, and therefore the only way a truncation introduced by a later COPY
  // (sc-sig-controller-live and sc-signal-controller both lost frames that way)
  // can be told from one introduced by the capture.
  assert.deepEqual(crashed.status.frames, []);
});

test("the status file identifies its own lane", () => {
  // A re-drive queue reads these three fields to know what to re-run. They are
  // written before anything can fail, which is why they survive a crash.
  assert.equal(crashed.status?.scenario, "sc-test-crash");
  assert.equal(crashed.status?.platform, "mobile");
  assert.equal(crashed.status?.mode, "right");
});
