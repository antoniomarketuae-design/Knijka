#!/usr/bin/env node
// =============================================================================
// clip-rig.mjs — THE one command that renders a mistake reel.
//
//   node clip-rig.mjs <templateId> <mistakeIndex> [options]
//   node clip-rig.mjs --status | --stop | --prune | --warm
//
// WHY THIS EXISTS (measured 2026-07-27, not reported second-hand)
// ---------------------------------------------------------------------------
// render-clip.mjs drives /dev/clip-headless on the SHARED `next dev` server at
// :3000. That stopped working: a GET of that route returned nothing for 433 s
// and then died with the server. Earlier attempts sat at "○ Compiling
// /dev/clip-headless ..." for 35+ minutes and never resolved. Two agents
// concluded the route was broken. It is not.
//
// The cause is I/O, not compilation. Turbopack keeps a persistent LSM dev cache
// under `<distDir>/dev/cache/turbopack`. On this box it had grown to 12.4 GB
// across 19,447 files, unpruned since 2026-07-10, and `.next` sits on E: — a
// 7200 rpm MECHANICAL disk where a random 4 KB read costs ~79 ms (0.33 ms on
// C:, 240x). The dev server burned ~0 CPU with a request pending: it was
// blocked on seeks. Next's own log agrees — "⚠ Slow filesystem detected". A
// 5-module, 17 KB /dev/cluster took 112 s on that same server, while
// /dev/ghost-demo — a BIGGER module graph than clip-headless, sim and all —
// compiled in ~1 s once its entry happened to be cache-warm. Nothing about
// this route's module graph is implicated.
//
// So the fix is not "shrink the graph" and not "make it a production build".
// It is: give the render path its OWN build directory, keep that directory
// small, and keep a server warm on it.
//
// WHAT THIS SCRIPT DOES
// ---------------------------------------------------------------------------
//   1. Prunes the rig's Turbopack cache when it exceeds --cache-limit GB
//      (default 2). This is the whole disease: the cache is never pruned, so it
//      grows until every lookup is a seek. Pruning a BUILD cache cannot change
//      emitted output.
//   2. Starts (or reuses) a `next dev` on --port 3200 with
//      KNIJKA_DIST_DIR=.next-rig. Never :3000 — other agents live there, and
//      this is exactly why the rig must not depend on their server's health.
//   3. Warms /dev/clip-headless once, with a bounded timeout, and reports the
//      compile seconds so a regression is visible instead of mysterious.
//   4. Runs render-clip.mjs against the rig, unchanged. Same page, same
//      CaptureScene, same seek sequence, same ffmpeg invocation — the rig moves
//      WHERE the bytes are compiled, never HOW the frames are produced.
//   5. Leaves the server up, so the next render skips steps 1-3 entirely.
//
// WHAT IT DELIBERATELY DOES NOT DO
// ---------------------------------------------------------------------------
// It does not build for production and it does not touch the /dev/* production
// gate. A production build would run the whole app with
// NODE_ENV === "production", and this codebase branches on that in the sim
// layer (LessonScene's perf probe + ghost demo, engine/input's key log). None
// of those are on CaptureScene's path today, but "none of them are on the path
// today" is not a proof of pixel equality, and doc 66 R0 says look before you
// ship. The rig stays in development mode, so the render runs the same code the
// clips have always been rendered with — byte-faithfulness is preserved by
// construction rather than by argument. See docs/development/69.
// =============================================================================

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const PLATFORM = join(REPO, "platform");
const TSCONFIG = join(PLATFORM, "tsconfig.json");
const STATE_DIR = join(__dirname, ".rig");
const STATE_FILE = join(STATE_DIR, "server.json");
const LOG_FILE = join(STATE_DIR, "server.log");

/** The rig's private build dir, relative to platform/ (gitignored). */
const DIST_DIR = ".next-rig";
/** 3000-3005 are the shared dev servers, 3100 is knijka staging. 3200 is ours. */
const DEFAULT_PORT = 3200;
/**
 * MUST be "localhost", never "127.0.0.1".
 *
 * Next 16 blocks cross-origin requests to `/_next/*` dev resources by default
 * (allowedDevOrigins). A dev server started as `next dev -p 3200` considers
 * `localhost` its own origin and `127.0.0.1` a foreign host — so browsing the
 * IP form gets the HTML but every dev chunk and the HMR socket are refused.
 * The symptom is silent and extremely misleading: the page returns 200,
 * `window.__clipHeadless` never appears, and render-clip.mjs times out at
 * waitForFunction after 120 s looking exactly like "the scene is broken".
 * Cost me one full render cycle; the server log is where it actually says so.
 */
const HOST = "localhost";

// ---- args -------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const PORT = Number(opt("port", String(DEFAULT_PORT)));
const BASE = `http://${HOST}:${PORT}`;
const CACHE_LIMIT_GB = Number(opt("cache-limit", "2"));
/** A cold compile of this route on a pruned cache measured 25 s. 10 min is a
 *  "something is wrong" ceiling, not an expectation. */
const WARM_TIMEOUT_MS = Number(opt("warm-timeout", "600")) * 1000;
const READY_TIMEOUT_MS = 180_000;

const t0 = Date.now();
const sec = (ms) => (ms / 1000).toFixed(1);
const log = (m) => process.stderr.write(`[rig +${sec(Date.now() - t0)}s] ${m}\n`);

// ---- server state -----------------------------------------------------------
function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

/** Is a Next dev server answering on our port? Cheap, and it is the only
 *  liveness signal that matters — a recorded pid can be stale or recycled. */
async function serverUp(timeoutMs = 2000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    // "/" is compiled by every session anyway and is not the route we time.
    const r = await fetch(`${BASE}/api/health?probe=liveness`, { signal: ac.signal });
    return r.status < 600; // any HTTP answer proves the listener is a server
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ---- cache pruning ----------------------------------------------------------
async function dirSize(dir) {
  let bytes = 0;
  let files = 0;
  const walk = async (d) => {
    let entries;
    try {
      entries = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else {
        try {
          bytes += (await stat(p)).size;
          files++;
        } catch {}
      }
    }
  };
  await walk(dir);
  return { bytes, files };
}

/**
 * The recurring prune the diagnosis asked for. Deleting a Turbopack cache is
 * safe by definition: it is derived state, rebuilt from source on demand. It
 * cannot change what the compiler emits, so it cannot change a rendered frame.
 */
async function pruneIfBloated({ force = false } = {}) {
  const cacheDir = join(PLATFORM, DIST_DIR, "dev", "cache", "turbopack");
  if (!existsSync(cacheDir)) return { pruned: false, reason: "no cache yet" };
  const { bytes, files } = await dirSize(cacheDir);
  const gb = bytes / 1024 ** 3;
  if (!force && gb <= CACHE_LIMIT_GB) {
    return { pruned: false, gb: +gb.toFixed(2), files };
  }
  log(`pruning rig Turbopack cache: ${gb.toFixed(2)} GB / ${files} files > ${CACHE_LIMIT_GB} GB limit`);
  rmSync(cacheDir, { recursive: true, force: true });
  return { pruned: true, gb: +gb.toFixed(2), files };
}

// ---- tsconfig.json is TRACKED, and `next dev` rewrites it -------------------
/**
 * On startup Next notices that `tsconfig.json` does not `include` its distDir's
 * generated types and helpfully edits the file — adding
 * `.next-rig/{types,dev/types}/**‍/*.ts` AND reformatting every inline array in
 * the file while it is there. That is a 14-line diff in a COMMITTED file,
 * caused by a render, describing a gitignored directory that only this rig ever
 * creates. Two developers share this repo (doc 61) and a third agent running
 * `git status` would find it and have no idea where it came from.
 *
 * So: snapshot the bytes, let Next do what it wants, put them back once the
 * server is up. Restoring does not disturb the running server — Next reads
 * tsconfig at boot, and the rig's own type-checking is not the point of the
 * exercise; `npm run typecheck` still runs against the real `.next`.
 */
function snapshotTsconfig() {
  try {
    return readFileSync(TSCONFIG);
  } catch {
    return null;
  }
}

function restoreTsconfig(before) {
  if (!before) return false;
  let after;
  try {
    after = readFileSync(TSCONFIG);
  } catch {
    return false;
  }
  if (after.equals(before)) return false;
  writeFileSync(TSCONFIG, before);
  return true;
}

// ---- server lifecycle -------------------------------------------------------
async function startServer() {
  mkdirSync(STATE_DIR, { recursive: true });
  const out = openSync(LOG_FILE, "a");
  // Spawn Next's bin with THIS node rather than `npx`/`next.cmd`: since Node 20
  // spawning a .cmd without a shell is EINVAL on Windows, and going through a
  // shell would put cmd.exe between us and the pid we later have to kill.
  const nextBin = join(PLATFORM, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) throw new Error(`next binary not found at ${nextBin} — run npm install in platform/`);
  const child = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
    cwd: PLATFORM,
    env: {
      ...process.env,
      KNIJKA_DIST_DIR: DIST_DIR,
      // The dev box's C: is chronically near-full (doc: dev-machine-health) and
      // E: is the big disk — same reasoning as pw.mjs.
      TEMP: "E:\\tmp",
      TMP: "E:\\tmp",
      // Next opens a browser tab on first start otherwise; this rig is headless
      // by definition and a stray tab is a GPU context we did not ask for.
      BROWSER: "none",
    },
    detached: true,
    windowsHide: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  writeFileSync(STATE_FILE, JSON.stringify({ pid: child.pid, port: PORT, startedAt: new Date().toISOString() }, null, 2));
  log(`spawned next dev pid ${child.pid} on :${PORT} (distDir ${DIST_DIR}) → ${LOG_FILE}`);

  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`rig server did not become ready within ${READY_TIMEOUT_MS / 1000}s — see ${LOG_FILE}`);
}

function stopServer() {
  const st = readState();
  if (!st?.pid) {
    log("no recorded rig server");
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(st.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-st.pid, "SIGTERM");
    } catch {}
  }
  rmSync(STATE_FILE, { force: true });
  log(`stopped rig server pid ${st.pid}`);
}

/**
 * Compile /dev/clip-headless once and report how long it took. This is the
 * number that used to be "35+ minutes and never finished"; printing it every
 * run means a regression shows up as a number instead of as a hang.
 */
async function warmRoute() {
  const url = `${BASE}/dev/clip-headless`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), WARM_TIMEOUT_MS);
  const w0 = Date.now();
  try {
    const res = await fetch(url, { signal: ac.signal });
    await res.arrayBuffer();
    if (res.status !== 200) throw new Error(`/dev/clip-headless returned ${res.status}`);
    return Date.now() - w0;
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        `/dev/clip-headless did not compile within ${WARM_TIMEOUT_MS / 1000}s. ` +
          `That is the original symptom — check ${LOG_FILE} and run --prune --force.`,
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureRig() {
  if (await serverUp()) {
    log(`reusing rig server on :${PORT}`);
    return { started: false, warmMs: null };
  }
  const p = await pruneIfBloated();
  if (!p.pruned && p.gb !== undefined) log(`rig cache ${p.gb} GB / ${p.files} files (limit ${CACHE_LIMIT_GB} GB)`);
  const tsBefore = snapshotTsconfig();
  await startServer();
  if (restoreTsconfig(tsBefore)) log("restored platform/tsconfig.json (next dev had rewritten it for the rig distDir)");
  log("server ready — warming /dev/clip-headless…");
  const warmMs = await warmRoute();
  log(`/dev/clip-headless compiled in ${sec(warmMs)}s`);
  return { started: true, warmMs };
}

// ---- render -----------------------------------------------------------------
function renderClip(templateId, mistakeIndex, extra) {
  const args = [join(__dirname, "render-clip.mjs"), templateId, String(mistakeIndex), "--base", BASE, ...extra];
  const r = spawnSync(process.execPath, args, { cwd: __dirname, stdio: "inherit" });
  return r.status ?? 1;
}

/** The unattended batch — render-all.mjs already speaks --base, so the rig only
 *  has to point it at itself and pass everything else through. */
function renderAll(extra) {
  const args = [join(__dirname, "render-all.mjs"), "--base", BASE, ...extra];
  const r = spawnSync(process.execPath, args, { cwd: __dirname, stdio: "inherit" });
  return r.status ?? 1;
}

/**
 * Reclaim the SHARED dev server's Turbopack cache — the 11+ GB that started
 * this whole investigation.
 *
 * Refuses while anything is listening on :3000. That server is other agents'
 * working surface (and deleting the cache under a live Turbopack is how you get
 * a dev server that half-works and lies about why). The founder or whoever owns
 * :3000 stops it, runs this, and starts it again; the first compile afterwards
 * is slow exactly once.
 */
async function pruneShared() {
  const busy = await (async () => {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 1500);
    try {
      await fetch("http://localhost:3000/", { signal: ac.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  })();
  if (busy) {
    console.error(
      "REFUSING: something is serving on :3000. That is the shared dev server other agents are using.\n" +
        "Stop it first, then re-run `node clip-rig.mjs --prune-shared`.",
    );
    return 2;
  }
  const cacheDir = join(PLATFORM, ".next", "dev", "cache", "turbopack");
  const { bytes, files } = await dirSize(cacheDir);
  rmSync(cacheDir, { recursive: true, force: true });
  console.log(JSON.stringify({ pruned: cacheDir, freedGB: +(bytes / 1024 ** 3).toFixed(2), files }, null, 2));
  return 0;
}

// ---- main -------------------------------------------------------------------
async function main() {
  if (flag("stop")) {
    stopServer();
    return 0;
  }
  if (flag("status")) {
    const up = await serverUp();
    const st = readState();
    const { bytes, files } = await dirSize(join(PLATFORM, DIST_DIR, "dev", "cache", "turbopack"));
    const shared = await dirSize(join(PLATFORM, ".next", "dev", "cache", "turbopack"));
    console.log(
      JSON.stringify(
        {
          rigPort: PORT,
          rigUp: up,
          rigPid: st?.pid ?? null,
          rigStartedAt: st?.startedAt ?? null,
          rigCacheGB: +(bytes / 1024 ** 3).toFixed(2),
          rigCacheFiles: files,
          sharedDevCacheGB: +(shared.bytes / 1024 ** 3).toFixed(2),
          sharedDevCacheFiles: shared.files,
          cacheLimitGB: CACHE_LIMIT_GB,
        },
        null,
        2,
      ),
    );
    return 0;
  }
  if (flag("prune-shared")) return await pruneShared();
  if (flag("prune")) {
    const p = await pruneIfBloated({ force: flag("force") });
    console.log(JSON.stringify(p, null, 2));
    return 0;
  }
  if (flag("warm")) {
    await ensureRig();
    return 0;
  }
  if (flag("all")) {
    const tStart = Date.now();
    const { started, warmMs } = await ensureRig();
    const tReady = Date.now();
    // Everything except the flags the rig owns goes through to render-all.
    const passthrough = argv.filter(
      (a, i) => !["--all", "--port", "--cache-limit", "--warm-timeout"].includes(a) && !["--port", "--cache-limit", "--warm-timeout"].includes(argv[i - 1]),
    );
    const status = renderAll(passthrough);
    log(
      `WALL: total ${sec(Date.now() - tStart)}s = server ${sec(tReady - tStart)}s ` +
        `(${started ? `cold start + ${sec(warmMs)}s route compile` : "reused, 0s"}) + batch ${sec(Date.now() - tReady)}s`,
    );
    return status;
  }

  const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--")));
  const [templateId, mistakeRaw] = positional;
  if (!templateId || mistakeRaw === undefined) {
    console.error(
      [
        "usage: node clip-rig.mjs <templateId> <mistakeIndex> [--fps N] [--port 3200] [--cache-limit GB]",
        "       node clip-rig.mjs --all [--only-missing] [--from N] [--limit N]   # the whole pilot",
        "       node clip-rig.mjs --status | --warm | --prune [--force] | --stop",
        "       node clip-rig.mjs --prune-shared          # reclaim :3000's cache (refuses while :3000 is up)",
      ].join("\n"),
    );
    return 64;
  }

  const tStart = Date.now();
  const { started, warmMs } = await ensureRig();
  const tReady = Date.now();
  // Pass through anything render-clip.mjs understands except --base/--port,
  // which the rig owns.
  const extra = [];
  const fps = opt("fps", null);
  if (fps) extra.push("--fps", fps);

  const status = renderClip(templateId, Number(mistakeRaw), extra);
  const tDone = Date.now();

  log(
    `WALL: total ${sec(tDone - tStart)}s = server ${sec(tReady - tStart)}s ` +
      `(${started ? `cold start + ${sec(warmMs)}s route compile` : "reused, 0s"}) + render ${sec(tDone - tReady)}s`,
  );
  if (status === 0) log(`next render on this warm rig skips the server step entirely.`);
  return status;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    log(`FAIL: ${e.message}`);
    process.exit(1);
  });
