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
//
// ── 2026-08-19 · AND THE SECOND THING A LANE LEAVES BEHIND: WHAT IT DROVE ───
//
// Everything above is about a run that could not finish. This half is about a
// run that finishes PERFECTLY and is worthless, which is the harder failure and
// the one this harness shipped with:
//
//     export const BASE =
//       process.env.KNIJKA_BASE ?? "https://icon-undertaken-earliest-zope.trycloudflare.com";
//
// An unset variable — how nearly every lane was invoked — drove STAGING over a
// tunnel hostname baked into source, and returned EXIT_JUDGEABLE with real
// frames, a real debrief and a real verdict for a build that was not the one
// under test. MEASURED 2026-08-19, that literal URL still answers 200 in 961 ms
// and reports `"commit":"unknown"`, so it is a live trap and its frames could
// not have named their build even to a reader who asked.
//
// The refusals below are spawned against a node:http stub on 127.0.0.1, not
// against a real server: what is being tested is the harness's ARITHMETIC about
// exit codes and status files, and that must not depend on anybody's dev server
// being up. lib/__tests__/target.test.mjs owns the policy itself.
//
// EXIT 5 vs EXIT 6 is the distinction being bought here, and it is the same one
// exit 2 vs exit 4 buys above: 5 means nothing was dispatched (no target was
// named, no directory exists, fix the invocation) and 6 means a target was named
// and cannot be identified (a directory and a status file exist saying which of
// the four ways, fix the server or the expectation).
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const HARNESS = join(HERE, "..", "lesson-audit.mjs");
const REPO = join(HERE, "..", "..", "..");

/** The commit the harness will require of any target, read the same way the
 *  harness reads it. Not hardcoded: this file has to keep passing after the
 *  next commit. */
const HEAD = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();

const scratch = mkdtempSync(join(tmpdir(), "knijka-lesson-audit-"));
/** A browsers directory that exists and holds nothing — `launch()` throws
 *  "Executable doesn't exist at …" against it, fast and offline. */
const NO_BROWSERS = mkdtempSync(join(tmpdir(), "knijka-no-browsers-"));
process.on("exit", () => {
  for (const dir of [scratch, NO_BROWSERS]) rmSync(dir, { recursive: true, force: true });
});

/**
 * A server that answers /api/health with `health` and DESTROYS THE SOCKET on
 * every other path.
 *
 * The destroy is deliberate and it is what keeps these tests fast: a stub that
 * answered 404 would let `page.goto` "succeed" on WebKit's own error page and
 * auth.mjs would then sit on `waitForSelector("#email")` for its full budget —
 * the trap already recorded on the sign-in test below. A reset connection makes
 * the navigation throw at once.
 *
 * Returns `{ base, close }`.
 */
async function stubTarget(health, { stopAfterHealth = false } = {}) {
  // A FREE PORT IS CHOSEN HERE AND THE SERVER RUNS OVER THERE. The first
  // version of this helper listened in THIS process, and it was a broken
  // instrument of exactly the kind this file is about — it failed in the
  // refusing direction and it took a look at the process list to catch it,
  // because from the outside it was indistinguishable from a slow box:
  //
  //   `drive()` is `spawnSync`, which BLOCKS this process's event loop for the
  //   whole life of the child. A server in this process therefore cannot
  //   answer the child's GET /api/health while the child is running. Every
  //   lane then sat out the harness's full 300 s health budget and exited 6,
  //   including the ones asserting exit 4 and exit 3. MEASURED: one
  //   `sc-test-crash` lane — a lane whose whole job is to die in 426 ms — was
  //   still alive fifty minutes later.
  //
  // Moving the stub into its own process is the fix. The port is bound and
  // released here first; the reuse window is microseconds and the alternative
  // (parsing a port out of the child's stdout) buys nothing measurable.
  const picker = createServer();
  await new Promise((r) => picker.listen(0, "127.0.0.1", r));
  const port = picker.address().port;
  await new Promise((r) => picker.close(r));

  const source = `
    const http = require("node:http");
    const body = ${JSON.stringify(JSON.stringify(health))};
    const server = http.createServer((req, res) => {
      if (req.url === "/api/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(body);
        // \`stopAfterHealth\` makes every LATER request refuse the connection
        // outright. The sign-in test needs it: a socket that is merely reset
        // still costs auth.mjs its retry ladder, and this test is about the
        // exit code, not the ladder.
        ${stopAfterHealth ? "setImmediate(() => server.close());" : ""}
        return;
      }
      // Not 404: a 404 lets \`page.goto\` "succeed" on WebKit's own error page,
      // and auth.mjs then sits on waitForSelector("#email") for its full
      // budget. A reset connection makes the navigation throw at once.
      if (res.socket) res.socket.destroy();
    });
    server.listen(${port}, "127.0.0.1", () => console.log("READY"));
  `;
  const child = spawn(process.execPath, ["-e", source], {
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("the stub target never reported READY")), 30_000);
    child.stdout.on("data", (d) => {
      if (String(d).includes("READY")) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
  // AND THEN LET GO OF IT, or this file never ends. MEASURED: with the pipe
  // still open and the child still referenced, every test passed and the runner
  // then sat at 100 % idle for 25 MINUTES — a live stdout pipe and a referenced
  // child both hold the parent's event loop open, so `process.on("exit")` (which
  // is where these get killed) can never fire. A suite that hangs AFTER going
  // green is the most expensive kind of broken instrument: it looks exactly like
  // a slow box, which is the excuse this project has already spent an afternoon
  // on twice today.
  child.stdout.destroy();
  child.unref();
  return {
    base: `http://127.0.0.1:${port}`,
    close: async () => {
      child.kill();
    },
  };
}

let lane = 0;
/** Run the harness the way a sweep lane does and hand back everything it left. */
function drive(args, env = {}) {
  const out = join(scratch, `lane-${(lane += 1)}`);
  // BOTH TARGET VARIABLES ARE STRIPPED FIRST, then re-added by the caller.
  // Otherwise every assertion here would depend on whatever the shell that ran
  // the gate happened to export — and "the harness behaves differently
  // depending on an ambient variable nobody set" is the defect under test, not
  // a thing to inherit while testing it.
  const base = { ...process.env };
  delete base.KNIJKA_BASE;
  delete base.KNIJKA_EXPECT_COMMIT;
  const r = spawnSync(process.execPath, [HARNESS, out, ...args], {
    encoding: "utf8",
    env: {
      ...base,
      // 20 s, not the harness's 300 s default. That default is sized for a cold
      // `next dev` compile (MEASURED at 258.8 s to first answer); a stub on
      // loopback answers in single-digit milliseconds or never. Without this a
      // broken stub costs five minutes PER LANE and looks exactly like a busy
      // box — which is precisely how the first version of `stubTarget` hid its
      // own defect for the better part of an hour.
      KNIJKA_HEALTH_TIMEOUT_MS: "20000",
      ...env,
    },
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

/**
 * A target that attests, shared by every test that needs the harness to get
 * PAST the build check and fail somewhere else.
 *
 * It exists because the build check now runs BEFORE `open()`, which is the
 * right order — a sweep pointed at the wrong host must die in a second per lane
 * rather than after a browser, a sign-in and a drive — but it means a crash
 * test can no longer reach the crash without first naming a build. `unref()`
 * rather than `close()`: node:test has no async teardown hook here, and an
 * unreferenced listener does not hold the process open.
 */
const attesting = await stubTarget({ ok: true, probe: "readiness", commit: HEAD, uptimeSec: 1 });
process.on("exit", () => attesting.close());

/** The lane the poisoned browsers path produces, driven once and shared: it
 *  costs a playwright module load (~1 s) and four tests ask about it. */
const crashed = drive(["sc-test-crash", "mobile", "right"], {
  PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS,
  KNIJKA_BASE: attesting.base,
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
  //
  // `target-attested` and not `starting` since 2026-08-19: the build check runs
  // before `open()`, so a lane that dies opening a browser has already got past
  // it. That the phase MOVED is the point — the field is only worth anything if
  // it tracks where the run actually was.
  assert.equal(crashed.status?.diedDuring, "target-attested");
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
  // «target-attested», not «starting» — same reason as the phase assertion
  // above: the build check now runs before `open()`, so a lane that dies
  // launching a browser has already got past it. The phase in the loud line has
  // to be the phase it was actually in, or the line is decoration.
  assert.match(crashed.stdout, /!! THE HARNESS DIED \(uncaughtException\) DURING «target-attested»/);
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

test("a refused sign-in keeps its own name and its own exit code", { concurrency: 1 }, async (t) => {
  // A failure that already has a diagnosis must not be relabelled "the harness
  // died" — sc-rb-exit-signal/mobile-wrong failed at the login form, and the
  // fix for that lives in the rate-limiter, not here. This one needs a real
  // browser, so it stands aside where none is installed rather than failing for
  // a reason that is not the code's.
  // IT USED TO POINT AT `http://knijka-audit-test.invalid`, and that stopped
  // working for a GOOD reason: a host that does not resolve now fails the build
  // check first and exits 6, because a target that cannot be reached cannot be
  // identified either. Distinguishing the two is the whole point of the new
  // code, so this test has to reach the sign-in with a target that HAS been
  // identified — hence a stub that answers /api/health with this tree's own
  // commit and resets the connection on /login. That also keeps the original
  // measurement's lesson: a base that resolves but answers nothing (e.g.
  // http://127.0.0.1:1) does NOT make `goto` throw — WebKit renders its own
  // error page, the navigation "succeeds", and auth.mjs then sits on
  // `waitForSelector("#email")` for its full 120 s. So this stub answers the
  // build check and then STOPS LISTENING, which makes /login refuse the
  // connection — the one failure `page.goto` reports immediately.
  const stub = await stubTarget(
    { ok: true, probe: "readiness", commit: HEAD, uptimeSec: 1 },
    { stopAfterHealth: true },
  );
  try {
    const r = drive(["sc-test-signin", "mobile", "right"], {
      KNIJKA_BASE: stub.base,
      // auth.mjs's retry ladder is budgeted at 600 s per navigation
      // (NAV_BUDGET_MS), and a refused connection is retried inside it. This
      // test is about the EXIT CODE, not the ladder — which settle.test.mjs and
      // lib/__tests__/auth.test.mjs own — so it buys 20 s of it. MEASURED: the
      // suite sat here for over 40 minutes on the default budget.
      KNIJKA_NAV_BUDGET_MS: "20000",
    });
    if (r.status?.phase === "crashed" && /Executable doesn't exist|playwright/i.test(r.status.why ?? "")) {
      t.skip("no playwright browser on this machine — the sign-in path needs one");
      return;
    }
    assert.equal(r.status?.phase, "signin-refused");
    assert.equal(r.code, 3);
    assert.equal(r.status?.exit, 3);
    assert.match(r.stdout, /!! SIGN-IN WAS REFUSED/);
    // AND THE BUILD STAMP IS ALREADY ON DISK BY THEN. A lane that never reached
    // the lesson still has to say which build refused it — otherwise a re-drive
    // queue cannot tell "the login rate-limiter" from "the wrong server".
    assert.equal(r.status?.target?.attested, true);
    assert.equal(r.status?.target?.commit, HEAD);
  } finally {
    await stub.close();
  }
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

// ── WHAT THE LANE WAS POINTED AT ───────────────────────────────────────────

test("an unset KNIJKA_BASE refuses, exits 5, and leaves NO directory", () => {
  // THE DEFECT, exactly: this used to silently become
  // "https://icon-undertaken-earliest-zope.trycloudflare.com" and drive
  // staging. Against the old code every assertion here fails — it exited 0
  // with a full set of frames.
  //
  // No directory, for the same reason a missing argument leaves none: in this
  // sweep's vocabulary an empty folder means «never dispatched», and a lane
  // with no target WAS never dispatched. The exit code is what tells the
  // dispatcher which mis-invocation it was.
  const r = drive(["sc-test-nobase", "mobile", "right"]);
  assert.equal(r.code, 5);
  assert.equal(r.dirExists, false, "a lane with no target must not leave a folder behind");
  assert.match(r.stderr, /KNIJKA_BASE is not set/);
  // Actionable, because the thing reading this is an agent with only stderr.
  assert.match(r.stderr, /KNIJKA_EXPECT_COMMIT/);
  // And it must NOT print a host anybody can copy back in as a "default".
  assert.ok(
    !/trycloudflare/.test(r.stderr),
    `the refusal hands back the very hostname it exists to remove: ${r.stderr}`,
  );
});

test("a whitespace KNIJKA_BASE is not a KNIJKA_BASE", () => {
  // `??` would have accepted "" and "   " as "set". A dispatcher that
  // interpolates an empty variable would then have driven the string "/login".
  assert.equal(drive(["sc-test-blank", "mobile", "right"], { KNIJKA_BASE: "   " }).code, 5);
});

test("a target that cannot name its build is refused with 6 — and records why", async () => {
  // The live staging case, reproduced locally: 200, healthy, real product,
  // `commit: "unknown"`. MEASURED against the real tunnel on 2026-08-19, the
  // harness returns exactly this — EXIT=6 with the refusal in the status file.
  const stub = await stubTarget({ ok: true, probe: "readiness", commit: "unknown", uptimeSec: 116 });
  try {
    const r = drive(["sc-test-unstamped", "mobile", "right"], { KNIJKA_BASE: stub.base });
    assert.equal(r.code, 6);
    // Unlike exit 5, this one DOES leave evidence: a re-drive queue has to be
    // able to read "refused because the target could not name its build" off
    // the disk, and an empty folder would say «never dispatched» instead.
    assert.equal(r.dirExists, true);
    assert.equal(r.status?.phase, "target-unverified");
    assert.equal(r.status?.exit, 6);
    assert.equal(r.status?.target?.kind, "unstamped");
    assert.equal(r.status?.target?.commit, "unknown");
    assert.match(r.stdout, /!! THIS RUN CANNOT SAY WHAT IT WOULD BE PHOTOGRAPHING \(unstamped\)/);
    assert.match(r.stdout, /nothing was driven/);
    // The transcript survives beside it, for the same reason it does on a
    // crash: a piped stdout can be cut and this refusal is the whole record.
    assert.ok(r.files.includes("_audit-transcript.log"), JSON.stringify(r.files));
  } finally {
    await stub.close();
  }
});

test("a target serving a DIFFERENT build is refused, and both shas reach the disk", async () => {
  // The founder-facing version: a proof phase graded a build whose fixes had
  // never been deployed. A sha-shaped answer is not the same as the right one.
  const other = "0f1e2d3c4b5a69788796a5b4c3d2e1f098765432";
  const stub = await stubTarget({ ok: true, probe: "readiness", commit: other, uptimeSec: 3 });
  try {
    const r = drive(["sc-test-mismatch", "mobile", "right"], { KNIJKA_BASE: stub.base });
    assert.equal(r.code, 6);
    assert.equal(r.status?.target?.kind, "mismatch");
    assert.equal(r.status?.target?.commit, other);
    assert.equal(r.status?.target?.expected, HEAD, "the sha it required must be recorded, not just the one it got");
    assert.match(r.stdout, new RegExp(other));
  } finally {
    await stub.close();
  }
});

test("an unreachable target is refused as unreachable, not as unstamped", async () => {
  // Two problems, two remedies: "start your dev server" and "your server
  // cannot say what it is" must not arrive as one shrug. Both exit 6 — the
  // lane is equally undriveable — and the status file is where they separate.
  const r = drive(["sc-test-down", "mobile", "right"], { KNIJKA_BASE: "http://knijka-audit-test.invalid" });
  assert.equal(r.code, 6);
  assert.equal(r.status?.target?.kind, "unreachable");
  assert.match(r.status?.target?.why ?? "", /could not be reached/);
});

test("a named build IS driven — the refusals do not simply refuse everything", async () => {
  // THE OTHER DIRECTION, and the reason it is here rather than only in the unit
  // tests: a guard that fires on everything would be indistinguishable, from
  // the dispatcher's side, from one that works — every lane would exit 6 and
  // the sweep would report a tidy 644 refusals. So this proves the harness gets
  // PAST the check on a correctly stamped target and fails at the next thing
  // instead. The poisoned browsers path is that next thing.
  const r = drive(["sc-test-attested", "mobile", "right"], {
    KNIJKA_BASE: attesting.base,
    PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS,
  });
  assert.notEqual(r.code, 6, "an attested target was refused anyway");
  assert.equal(r.code, 4, "it should have got as far as failing to open a browser");
  assert.equal(r.status?.target?.attested, true);
  assert.equal(r.status?.target?.kind, "attested");
  assert.equal(r.status?.target?.commit, HEAD);
});

test("KNIJKA_EXPECT_COMMIT names a build deliberately, and cannot wave one through", async () => {
  const other = "0f1e2d3c4b5a69788796a5b4c3d2e1f098765432";
  const stub = await stubTarget({ ok: true, probe: "readiness", commit: other, uptimeSec: 3 });
  try {
    // Declared and matching -> driven, even though it is not this tree's HEAD.
    // That is the deploy-verification case and it must stay possible.
    const declared = drive(["sc-test-declared", "mobile", "right"], {
      KNIJKA_BASE: stub.base,
      KNIJKA_EXPECT_COMMIT: other,
      PLAYWRIGHT_BROWSERS_PATH: NO_BROWSERS,
    });
    assert.equal(declared.status?.target?.attested, true);
    assert.equal(declared.status?.target?.expectedFrom, "KNIJKA_EXPECT_COMMIT");
    assert.equal(declared.code, 4, "it should have got as far as failing to open a browser");

    // Declared and NOT matching -> still refused. The variable names a build;
    // it does not disable the check.
    const wrong = drive(["sc-test-declared-wrong", "mobile", "right"], {
      KNIJKA_BASE: stub.base,
      KNIJKA_EXPECT_COMMIT: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
    });
    assert.equal(wrong.code, 6);
    assert.equal(wrong.status?.target?.kind, "mismatch");
  } finally {
    await stub.close();
  }
});

test("the build stamp survives into a lane that dies later", async () => {
  // The stamp is worth nothing if it only appears on lanes that finish — the
  // frame ledger had exactly this hole and it published "0 written, 0 lost"
  // beside folders of real frames. A crashed lane must still say what it was
  // photographing.
  assert.equal(crashed.status?.target?.commit, HEAD);
  assert.equal(crashed.status?.target?.attested, true);
  assert.equal(typeof crashed.status?.target?.head, "string");
  // `dirty` is whatever this checkout is; what must be true is that the
  // question was ANSWERED rather than left undefined.
  assert.equal(typeof crashed.status?.target?.dirty, "boolean");
  assert.ok("worktree" in crashed.status.target);
});

test("the status file identifies its own lane", () => {
  // A re-drive queue reads these three fields to know what to re-run. They are
  // written before anything can fail, which is why they survive a crash.
  assert.equal(crashed.status?.scenario, "sc-test-crash");
  assert.equal(crashed.status?.platform, "mobile");
  assert.equal(crashed.status?.mode, "right");
});
