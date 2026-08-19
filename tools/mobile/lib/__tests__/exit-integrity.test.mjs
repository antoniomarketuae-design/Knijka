// -----------------------------------------------------------------------------
// exit-integrity.test.mjs — O25: A NODE ABORT MUST NOT BE ABLE TO DISCARD A
// LANE THAT DROVE, WAS PHOTOGRAPHED AND WAS JUDGED.
//
//   node --test tools/mobile/lib/__tests__/exit-integrity.test.mjs
//   (or `node scripts/tools-tests.mjs` from platform/, which discovers it)
//
// THE DEFECT, counted from the sweep's own ledger rather than described:
//
//   .audit-frames/sweep161/progress.txt  ->  28 exit=0 · 4 exit=127 · 2 exit=1
//
// 127 is not a code this harness has ever returned. All four of those lanes had
// FINISHED — each holds a complete MACHINE SUMMARY with a verdict, objectives
// and 20–41 frames on disk:
//
//   sc-ov-narrow/mobile-wrong          НЕИЗДЪРЖАН · 10 наказателни точки ·
//                                      «Пътнотранспортно произшествие» convicted
//   sc-ov-narrow/mobile-right          НЕИЗДЪРЖАН · 20 т.
//   sc-ov-crossing-overtake/mobile-wrong  НЕИЗДЪРЖАН · 161 т.
//   sc-ov-lane-keeping/mobile-wrong    НЕИЗДЪРЖАН · 22 т.
//
// Read as process codes they are four failures and a dispatcher re-drives or
// bins them; one real finding — a collision — goes with them. That is a FALSE
// FAILURE, the mirror of the false certificate this audit exists to end.
//
// THE CAUSE IS NODE'S, AND IT IS REPRODUCED HERE RATHER THAN BELIEVED. On
// node v24.18.0 / Windows a SUCCESSFUL global `fetch` leaves an undici handle
// mid-teardown; touching the process's exit on top of it aborts:
//
//     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
//       file src\win\async.c, line 94
//
// and the code the caller chose is gone. WHAT THAT DEATH IS CALLED DEPENDS ON
// WHO READS IT, which the O25 report did not say and this file measured:
// 3221226505 (0xC0000409, the Windows fail-fast status) to node's execFile and
// to cmd, and 127 to Git Bash — which is the shell sweep161 was dispatched
// from, and therefore the number in its progress.txt. Same death, two names.
//
// Measured on this box, 2026-08-19, against a loopback server answering 2 MiB:
// 25 aborts in 25 with `process.exit(6)` immediately after the fetch; 0 in 25
// when the body is 2 bytes; 0 in 8 when 100 ms pass first; 0 in 15 for either
// remedy. It is a RACE — which is why sweep161 lost four lanes of thirty-four
// and not all of them, and why a test may not simply assume it will fire.
//
// WHICH IS WHY THE CONTROL IS AN ASSERTION AND NOT A COMMENT. `forceAbort`
// below is the eye-verified case: if it stops aborting, this file goes RED
// rather than quietly green, because every remedy assertion under it would
// otherwise be passing for the wrong reason — the exact instrument bug this
// project keeps paying for, in the exact reassuring direction.
//
// THE TWO REMEDIES, both landed, both proved by mutation against that control:
//   1. TRANSPORT — `lib/auth.mjs` and `lib/server.mjs` do their HTTP on
//      `node:http` with `agent:false`. No undici, nothing to tear down.
//   2. EXIT — `cli.mjs` returns a code and assigns `process.exitCode`; it does
//      not call `process.exit()`.
// Each is tested against the same server, in the same shape, with only the
// thing under test swapped. The mutation IS the control.
// -----------------------------------------------------------------------------
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { httpGet, warmFromNode } from "../auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUTH = pathToFileURL(join(HERE, "..", "auth.mjs")).href;
const SERVER = pathToFileURL(join(HERE, "..", "server.mjs")).href;

const SCRATCH = mkdtempSync(join(tmpdir(), "knijka-o25-"));
process.on("exit", () => rmSync(SCRATCH, { recursive: true, force: true }));

// 2 MiB. The size is load-bearing: at 2 bytes the abort did not reproduce once
// in 25 trials, because the race needs a response still tearing down when the
// process ends. A "cheaper" fixture here would make every test below pass for
// no reason.
const BIG = Buffer.alloc(2 * 1024 * 1024, 0x61);

/** The lanes' own shape: a page that answers, plus a cookie jar to read. */
const requests = [];
const server = createServer((req, res) => {
  requests.push({ url: req.url, cookie: req.headers.cookie ?? null });
  if ((req.url ?? "").startsWith("/slow")) return; // accepted, never answered
  if ((req.url ?? "").startsWith("/boom")) {
    res.writeHead(500, { "content-type": "text/html" });
    res.end("<html>500</html>");
    return;
  }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(BIG);
});
const BASE = await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${server.address().port}`));
});
server.unref();

/** A port nothing listens on — the same one navigation.test.mjs uses. */
const DEAD = "http://127.0.0.1:9";

/** Run a child that ends with the given code, and report what it really did. */
function runChild(source, { trials = 1, env = {} } = {}) {
  const file = join(SCRATCH, `child-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(file, source);
  const once = () =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [file],
        { windowsHide: true, env: { ...process.env, ...env } },
        (error, stdout, stderr) => {
          resolve({ code: error?.code ?? 0, stdout: String(stdout), stderr: String(stderr) });
        },
      );
    });
  return (async () => {
    const runs = [];
    for (let i = 0; i < trials; i += 1) runs.push(await once());
    return runs;
  })();
}

/** THE CONTROL. Global fetch, then `process.exit(6)` — the report's mechanism. */
const forceAbort = (url) => `
  const r = await fetch(${JSON.stringify(url)}, {
    signal: AbortSignal.timeout(30000), redirect: "manual",
  });
  await r.arrayBuffer();
  process.exit(6);
`;

// ─────────────────────────────────────────────────────────────────────────────
// 0. THE CONTROL — verified by eye first (the assertion string is in the file
//    header verbatim), asserted here so it cannot rot into a comment.
// ─────────────────────────────────────────────────────────────────────────────

test("the abort is real on this runtime: a successful global fetch + process.exit() does not exit 6", async (t) => {
  if (process.platform !== "win32") {
    // The assertion is in src\win\async.c. Elsewhere there is nothing to force,
    // and a test that forces nothing must say so rather than pass.
    t.skip("the O25 abort is a libuv/Windows race; the remedies below are still asserted");
    return;
  }
  const runs = await runChild(forceAbort(BASE), { trials: 3 });
  const aborted = runs.filter((r) => r.code !== 6);
  assert.ok(
    aborted.length > 0,
    `all ${runs.length} control runs exited 6 cleanly. Either node fixed the abort — in which case ` +
      `delete this test and say so in the header — or this fixture stopped reproducing it, in which ` +
      `case every remedy assertion below is passing for the wrong reason. Codes: ` +
      runs.map((r) => r.code).join(", "),
  );
  assert.match(
    aborted[0].stderr,
    /UV_HANDLE_CLOSING/,
    "the abort must be the one O25 names, not some other way of dying",
  );
  // AND THE NUMBER DEPENDS ON WHO IS ASKING, which the O25 report did not say
  // and this test found. Measured 2026-08-19, one death, three readers:
  //   · node's own execFile   -> 3221226505 = 0xC0000409, the Windows fail-fast
  //                              status an abort() raises
  //   · Git Bash / MSYS       -> 127
  //   · `%ERRORLEVEL%` in cmd -> 0xC0000409 as well
  // sweep161 was dispatched from a bash loop, which is why its progress.txt
  // reads `exit=127` — the report's number is right about the LAYER IT WAS
  // READ AT and would have been wrong asserted here. The claim that matters is
  // the one above: the code the process chose did not survive.
  assert.equal(
    aborted[0].code,
    0xc0000409,
    "the raw status of this death; a bash dispatcher reports the same death as 127",
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. REMEDY B — the transport. `warmFromNode` is the call that put global fetch
//    into every lane process; it runs before every sign-in and on every
//    navigation retry.
// ─────────────────────────────────────────────────────────────────────────────

test("warmFromNode drains a real 2 MiB page and the process still exits with the code it chose", async () => {
  const runs = await runChild(
    `
    const { warmFromNode } = await import(${JSON.stringify(AUTH)});
    const page = { context: () => ({ cookies: async () => [{ name: "authjs.session-token", value: "x" }] }) };
    await warmFromNode(page, ${JSON.stringify(`${BASE}/simulator/drive`)});
    process.exit(6);
    `,
    { trials: 3 },
  );
  // The mutation is the control above: identical child, identical server,
  // identical body, `fetch` instead of `warmFromNode` — 127.
  for (const r of runs) {
    assert.equal(r.code, 6, `warmFromNode must not cost the caller its exit code (stderr: ${r.stderr.slice(0, 300)})`);
  }
});

test("the liveness probe answers on the status line alone, in both directions", async () => {
  // THIS TEST DOES NOT GUARD THE TRANSPORT, AND SAYS SO. The first version of
  // it asserted that `ensureServer` no longer poisons the process, and the
  // mutation run showed it stayed GREEN with the old global fetch restored —
  // because an un-drained fetch does not abort (12 trials of 12; server.mjs's
  // header carries the numbers). An assertion that cannot fail is worth
  // nothing, so it was replaced by the contract that CAN: what the probe
  // decides, which is the thing a wrong answer here has already cost this
  // project — a 2 s version declared a healthy server dead and killed a sweep
  // on EADDRINUSE.
  const { ensureServer } = await import(SERVER);
  const previous = process.env.KNIJKA_MOBILE_BASE_URL;

  // A 302 is a server that is UP. The old fetch said so through
  // `redirect: "manual"`; the replacement must not start following redirects
  // and mistake a /login bounce for something to spawn a second server over.
  const redirector = createServer((_req, res) => {
    res.writeHead(302, { location: "/login" });
    res.end();
  });
  const redirectUrl = await new Promise((resolve) => {
    redirector.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${redirector.address().port}`));
  });
  redirector.unref();

  try {
    process.env.KNIJKA_MOBILE_BASE_URL = BASE;
    const live = await ensureServer({ quiet: true });
    assert.equal(live.started, false, "an answering server is REUSED, never re-spawned");
    assert.equal(live.url, BASE);

    process.env.KNIJKA_MOBILE_BASE_URL = redirectUrl;
    const bounced = await ensureServer({ quiet: true });
    assert.equal(bounced.started, false, "a 302 is a live server, not a reason to start another one");
    assert.equal(bounced.url, redirectUrl);
  } finally {
    process.env.KNIJKA_MOBILE_BASE_URL = previous;
    redirector.close();
  }
});

test("a base URL that is not answering is refused, not silently replaced by a new server", async () => {
  // The false-pass direction: `KNIJKA_MOBILE_BASE_URL` names a server somebody
  // meant to measure. If it is dead, spawning our own and measuring THAT would
  // report numbers for a build nobody asked about — the same class of error as
  // driving staging and calling it your tree.
  const { ensureServer } = await import(SERVER);
  const previous = process.env.KNIJKA_MOBILE_BASE_URL;
  process.env.KNIJKA_MOBILE_BASE_URL = DEAD;
  try {
    await assert.rejects(() => ensureServer({ quiet: true }), /is not answering/);
  } finally {
    process.env.KNIJKA_MOBILE_BASE_URL = previous;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. AND THE TRANSPORT STILL DOES ITS JOB — a fix that stopped warming would
//    trade an abort for a five-minute navigation timeout, which is the same
//    accounting error one layer along.
// ─────────────────────────────────────────────────────────────────────────────

test("the warm is a real warm: the whole body is read, with the page's cookies on it", async () => {
  requests.length = 0;
  const page = {
    context: () => ({ cookies: async () => [{ name: "authjs.session-token", value: "abc" }, { name: "csrf", value: "d" }] }),
  };
  await warmFromNode(page, `${BASE}/theory`);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "/theory");
  assert.equal(
    requests[0].cookie,
    "authjs.session-token=abc; csrf=d",
    "the warm compiles the route AS THE SIGNED-IN USER — without the jar it warms the login page instead",
  );
  const res = await httpGet(`${BASE}/theory`, { maxBytes: 0 });
  assert.equal(res.bytes, BIG.length, "the body must be read to the end — reading it IS the warm");
  assert.equal(res.body, "", "and none of it kept");
});

test("a warm that cannot connect is swallowed, exactly as before — the retry has the better message", async () => {
  const page = { context: () => ({ cookies: async () => [] }) };
  await warmFromNode(page, `${DEAD}/theory`); // must not throw
  // A 500 is an ANSWER about this route, not a transport failure, and must not
  // throw either: `gotoAuthenticated` decides what a 500 page means.
  const res = await httpGet(`${BASE}/boom`, { maxBytes: 32 });
  assert.equal(res.status, 500);
});

test("httpGet's budget is TOTAL, so a server that answers nothing cannot hold a lane for ever", async () => {
  // node's own `timeout` option is an inactivity timer; the `AbortSignal.timeout`
  // this replaced was total. A silent socket is the case that tells them apart.
  const started = Date.now();
  await assert.rejects(
    () => httpGet(`${BASE}/slow`, { timeoutMs: 400 }),
    (error) => error.name === "AbortError",
  );
  const spent = Date.now() - started;
  assert.ok(spent >= 300 && spent < 5_000, `gave up after ${spent}ms on a 400ms budget`);
});

test("the total budget is not restarted by data arriving — a trickle is not a reason to wait for ever", async () => {
  // The mutation this catches: `timeout: timeoutMs` on the request instead of a
  // deadline. Under it this test hangs until the trickle ends (2.5 s of chunks
  // 250 ms apart), because every chunk resets node's socket timer.
  const trickle = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    let sent = 0;
    const tick = setInterval(() => {
      if (sent++ >= 10) {
        clearInterval(tick);
        res.end();
        return;
      }
      res.write("x".repeat(64));
    }, 250);
    res.on("close", () => clearInterval(tick));
  });
  const url = await new Promise((resolve) => {
    trickle.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${trickle.address().port}`));
  });
  trickle.unref();
  const started = Date.now();
  try {
    await assert.rejects(() => httpGet(`${url}/`, { timeoutMs: 600 }), (error) => error.name === "AbortError");
    const spent = Date.now() - started;
    assert.ok(spent < 2_000, `waited ${spent}ms for a 600ms budget — the deadline is being reset by traffic`);
  } finally {
    trickle.close();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. REMEDY A — the exit. `process.exitCode` survives what `process.exit()`
//    does not, and it is what `cli.mjs` now uses.
// ─────────────────────────────────────────────────────────────────────────────

test("process.exitCode survives the very fetch that aborts process.exit()", async () => {
  const runs = await runChild(
    `
    const r = await fetch(${JSON.stringify(BASE)}, { signal: AbortSignal.timeout(30000), redirect: "manual" });
    await r.arrayBuffer();
    process.exitCode = 6;    // the ONLY difference from the control
    `,
    { trials: 3 },
  );
  for (const r of runs) assert.equal(r.code, 6, `stderr: ${r.stderr.slice(0, 300)}`);
});

test("cli.mjs contains no process.exit() — a forced exit is the thing that publishes 127", async () => {
  // STRUCTURAL, and it is red before this lane and green after: the file held
  // four `process.exit()` calls, one of them on the sweep's own verdict, and
  // every path to them fetches first. Comments are stripped so the paragraph
  // explaining the defect cannot satisfy the rule that forbids it — the same
  // trap scripts/tools-tests.mjs documents.
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(join(HERE, "..", "..", "cli.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.doesNotMatch(source, /process\s*\.\s*exit\s*\(/, "cli.mjs must set process.exitCode, never call process.exit()");
  assert.match(source, /process\.exitCode\s*=/, "and it must still publish a code");
});
