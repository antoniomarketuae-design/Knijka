// -----------------------------------------------------------------------------
// server.mjs — start/reuse a dev server the harness OWNS.
//
// WHY NOT :3000. Lanes run in parallel on this box and :3000..:3005, :3100,
// :8080, :8081, :8899 belong to other people. More importantly the shared
// server's Turbopack cache is the thing that made routes take 400+ seconds to
// compile on this mechanical disk (see tools/clips/headless/clip-rig.mjs for
// the measurement). A measurement rig whose numbers depend on another agent's
// cache health is not a rig. So: our own port, our own KNIJKA_DIST_DIR, and we
// delete the build dir when we are done because E: is a 7200 rpm disk.
//
// --hostname localhost is NOT optional: Next 16 refuses cross-origin /_next/*
// requests, and 127.0.0.1 vs localhost counts as cross-origin.
// -----------------------------------------------------------------------------
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { treeIdentity } from "./target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, "..", "..", "..");
export const PLATFORM = join(REPO, "platform");
const STATE_DIR = join(HERE, "..", ".out", ".server");

// AND THE PORT NUMBER IS NOT FREE TO CHANGE. next-auth v5 resolves its route
// against AUTH_URL from platform/.env, which names this port — a dev server on
// any other one answers /api/auth/providers with 404, sign-in silently fails,
// and the harness reports „no session cookie after sign-in" with an EMPTY form
// error, which reads exactly like a broken login page. Measured the hard way on
// :3461. If you need a second server for another lane, give it its own
// KNIJKA_DIST_DIR and its own AUTH_URL, not just its own port.
export const DEFAULT_PORT = 3460;
export const DIST_DIR = ".next-harness";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function baseUrl(port = DEFAULT_PORT) {
  return process.env.KNIJKA_MOBILE_BASE_URL || `http://localhost:${port}`;
}

/**
 * BE A GOOD CITIZEN ON A 10-SLOT DATABASE.
 *
 * The local dev DB is PGlite behind `npx prisma dev`, and its own log says
 * `max connections: 10` — for the WHOLE box, shared by every lane's dev server.
 * The URL in .env asks for `connection_limit=10`, so two dev servers can starve
 * everyone else; when that happens new connections are answered with a reset
 * (`read ECONNRESET`) and every page in every lane stalls. PGlite executes
 * queries serially anyway, so a big pool buys this harness nothing and costs
 * everyone else everything. Two is plenty.
 *
 * Only rewrites the parameter when a DATABASE_URL is present, and only for the
 * server WE spawn — nothing else in the repo is touched.
 */
function politeDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) return {};
  const polite = /connection_limit=\d+/.test(url)
    ? url.replace(/connection_limit=\d+/, "connection_limit=2")
    : `${url}${url.includes("?") ? "&" : "?"}connection_limit=2`;
  return { DATABASE_URL: polite };
}

/**
 * STAMP THE BUILD SO THE SERVER CAN SAY WHAT IT IS.
 *
 * `/api/health` reports `process.env.NEXT_PUBLIC_COMMIT_SHA || "unknown"`, and
 * its own header says «"unknown" locally is expected, not an error». For a
 * DEPLOY that is true. For an AUDIT it is fatal: frames that cannot name their
 * build are not evidence, and `lesson-audit.mjs` now refuses to drive a server
 * that answers "unknown" (tools/mobile/lib/target.mjs carries the measurement —
 * the hardcoded staging tunnel it used to default to answers exactly that).
 *
 * So every server this module starts is stamped with the HEAD it was started
 * from. MEASURED 2026-08-19: `next dev --port 3000` spawned with the variable
 * set answered `{"commit":"c72bcc27cd90cb0ff810eeee113c2e86c2b792ea", …}` — the
 * value survives into the route, so the harness can verify it.
 *
 * IT ALSO PROVES WE ARE TALKING TO OUR OWN PROCESS. `ensureServer` reuses
 * anything already answering on the port, including a server another lane left
 * running at an older commit. A stale one now reports a sha that does not match
 * this tree and the harness refuses it, instead of driving it and reporting the
 * result as a fact about code that was never loaded.
 *
 * A caller's own NEXT_PUBLIC_COMMIT_SHA wins — that is the deliberate "drive a
 * named build" case, and this must not overwrite an answer somebody gave on
 * purpose. Silent when git is unavailable: the refusal belongs in the harness,
 * where it can be reported, not in a helper that spawns servers for five tools.
 */
function buildStampEnv() {
  if (process.env.NEXT_PUBLIC_COMMIT_SHA) return {};
  const { head } = treeIdentity(REPO);
  return head ? { NEXT_PUBLIC_COMMIT_SHA: head } : {};
}

/**
 * 15 s, not 2 s. Under load this dev server takes a minute to render a page and
 * several seconds to answer anything at all; a 2 s probe declared a perfectly
 * healthy server dead, the harness then tried to start a second one, and the
 * whole sweep died on `EADDRINUSE ::1:3460`. A liveness check that is stricter
 * than the thing it is checking is just a random number generator.
 *
 * AND ON `node:http`, WHICH IS NOT THE O25 FIX AND MUST NOT BE SOLD AS ONE.
 *
 * O25 is the abort that turned four finished audit lanes into exit 127. It
 * needs a global fetch whose body is READ TO THE END; the remedy therefore
 * belongs to `lib/auth.mjs` `warmFromNode`, which reads one, and its header
 * carries the measurement. This function never read a body — `res.status > 0`
 * is the whole test — and the first draft of this comment claimed it was a
 * trigger anyway. MEASURED 2026-08-19 on the same fixture that aborts 25 times
 * out of 25 when drained:
 *
 *   fetch(url) then process.exit(6), body never read   -> 6, 12 trials of 12
 *   the same with `await res.body.cancel()`            -> 6, 12 of 12
 *   the same with `await res.arrayBuffer()`            -> ABORT, 12 of 12
 *
 * So this is a CONSISTENCY change, not a repair, and the honest reasons for it
 * are small and measured: 30 probes against a 2 MiB page cost 147 ms and
 * +8.9 MiB rss through undici against 90 ms and +3.2 MiB here, because an
 * un-drained fetch leaves the response pending in a pool this module has no
 * other use for. `lib/target.mjs` and `lib/auth.mjs` already do their HTTP this
 * way; one module left on undici is one place for the next person to copy from.
 *
 * THE REAL EXPOSURE IN THIS PROCESS IS NOT HERE. `lib/measure.mjs`
 * `warmRoutes()` does `await res.arrayBuffer()` on global fetch, once per
 * route, and `cli.mjs` runs it — so the abort is reachable from the mobile
 * sweep. That is why cli.mjs stopped calling `process.exit()`; the transport
 * half for measure.mjs belongs to whoever owns that file.
 *
 * HEADERS ARE THE ANSWER; THE BODY IS NOT ASKED FOR. `res.status > 0` was the
 * old test and it stays the test — a 302 to /login is a server that is up. The
 * request is destroyed as soon as the status line arrives, so a dev server's
 * HTML is neither transferred nor waited for, once per second for the whole of
 * a five-minute cold start.
 */
async function isUp(url, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    let settled = false;
    let req = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      req?.destroy();
      finish(false);
    }, timeoutMs);
    try {
      const client = url.startsWith("https:") ? https : http;
      req = client.get(url, { agent: false }, (res) => {
        // Attached before the destroy below: tearing down a live response emits
        // an error on it, and an unhandled 'error' on a stream ends the process
        // — the same class of death `lesson-audit.mjs` immunised stdout against.
        res.on("error", () => finish(false));
        const status = res.statusCode ?? 0;
        res.resume();
        req.destroy();
        finish(status > 0);
      });
      req.on("error", () => finish(false));
    } catch {
      finish(false); // a malformed URL is not a live server
    }
  });
}

/**
 * Ensure a dev server is answering on `port`. Reuses one that is already up
 * (including a server someone else started, or KNIJKA_MOBILE_BASE_URL pointing
 * at a `next start` in CI), otherwise spawns `next dev`.
 *
 * @returns {Promise<{url:string, started:boolean, stop:() => void}>}
 */
export async function ensureServer({ port = DEFAULT_PORT, quiet = false, timeoutMs = 300_000 } = {}) {
  const url = baseUrl(port);

  if (await isUp(url)) {
    if (!quiet) console.log(`[mobile-harness] reusing server at ${url}`);
    return { url, started: false, stop: () => {} };
  }
  if (process.env.KNIJKA_MOBILE_BASE_URL) {
    throw new Error(
      `[mobile-harness] KNIJKA_MOBILE_BASE_URL=${process.env.KNIJKA_MOBILE_BASE_URL} is not answering. ` +
        `Start it, or unset the variable to let the harness run its own dev server.`,
    );
  }

  mkdirSync(STATE_DIR, { recursive: true });
  const logFile = join(STATE_DIR, "server.log");
  const fd = openSync(logFile, "a");

  if (!quiet) {
    console.log(
      `[mobile-harness] starting next dev on :${port} (KNIJKA_DIST_DIR=${DIST_DIR}) — ` +
        `first compile on this mechanical disk can take minutes; log: ${logFile}`,
    );
  }

  const child = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["next", "dev", "--port", String(port), "--hostname", "localhost"],
    {
      cwd: PLATFORM,
      env: {
        ...process.env,
        KNIJKA_DIST_DIR: DIST_DIR,
        NODE_ENV: "development",
        ...buildStampEnv(),
        ...politeDatabaseUrl(),
      },
      stdio: ["ignore", fd, fd],
      detached: false,
      shell: process.platform === "win32",
    },
  );
  writeFileSync(join(STATE_DIR, "server.json"), JSON.stringify({ pid: child.pid, port }, null, 2));

  const stop = () => {
    try {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-child.pid, "SIGTERM");
      }
    } catch {
      /* already gone */
    }
  };

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isUp(url)) {
      if (!quiet) console.log(`[mobile-harness] server up at ${url}`);
      return { url, started: true, stop };
    }
    if (child.exitCode !== null) {
      const tail = existsSync(logFile) ? readFileSync(logFile, "utf8").slice(-2000) : "";
      // EADDRINUSE means somebody is already serving this port — almost always
      // a server we failed to detect because it was too busy to answer the
      // probe. Give it a long, patient look before declaring failure.
      if (/EADDRINUSE/.test(tail) && (await isUp(url, 60_000))) {
        if (!quiet) console.log(`[mobile-harness] port ${port} was already serving — reusing it`);
        return { url, started: false, stop: () => {} };
      }
      throw new Error(`[mobile-harness] next dev exited (${child.exitCode}).\n${tail}`);
    }
    await sleep(1000);
  }
  stop();
  throw new Error(`[mobile-harness] server did not come up within ${timeoutMs}ms — see ${logFile}`);
}
