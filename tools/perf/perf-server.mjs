#!/usr/bin/env node
// perf-server.mjs — a DETACHED `next dev` for gpu-pass-timer.mjs.
//
//   node perf-server.mjs --start [--port 4162] [--dist .next-t2fps]
//   node perf-server.mjs --status
//   node perf-server.mjs --stop
//
// WHY DETACHED. The measurement needs a server that outlives the shell that
// started it: a page load on this box can cost 5-15 minutes of Turbopack
// recompile (E: is a 7200 rpm disk — see tools/clips/headless/clip-rig.mjs for
// the full diagnosis), and any harness that reaps long-running child processes
// kills the server mid-warm. Three sweeps were lost that way. Same pattern the
// clip rig uses, and for the same reason.
//
// It also keeps the perf runs off :3000/:3200 — those belong to other agents,
// and this rig must not depend on their server's health or damage it.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
const PLATFORM = join(REPO, "platform");
const STATE_DIR = join(__dirname, ".server");
const STATE_FILE = join(STATE_DIR, "state.json");
const LOG_FILE = join(STATE_DIR, "server.log");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};

const PORT = Number(opt("port", "4162"));
const DIST = opt("dist", ".next-t2fps");

async function up() {
  try {
    const r = await fetch(`http://localhost:${PORT}/`, {
      method: "HEAD",
      signal: AbortSignal.timeout(4000),
    });
    return r.status > 0;
  } catch {
    return false;
  }
}

function readState() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

if (flag("status")) {
  console.log(JSON.stringify({ state: readState(), listening: await up() }, null, 2));
  process.exit(0);
}

if (flag("stop")) {
  const s = readState();
  if (s?.pid) {
    try {
      process.kill(s.pid);
      console.log(`stopped pid ${s.pid}`);
    } catch (e) {
      console.log(`pid ${s.pid} not running (${e.code ?? e.message})`);
    }
  } else {
    console.log("no recorded pid");
  }
  process.exit(0);
}

if (await up()) {
  console.log(`already listening on :${PORT}`);
  process.exit(0);
}

mkdirSync(STATE_DIR, { recursive: true });
const nextBin = join(PLATFORM, "node_modules", "next", "dist", "bin", "next");
if (!existsSync(nextBin)) {
  console.error(`next binary not found at ${nextBin}`);
  process.exit(65);
}
const out = openSync(LOG_FILE, "a");
const child = spawn(process.execPath, [nextBin, "dev", "-p", String(PORT)], {
  cwd: PLATFORM,
  env: {
    ...process.env,
    KNIJKA_DIST_DIR: DIST,
    // C: is chronically near-full on this box; E: is the big disk.
    TEMP: "E:\\tmp",
    TMP: "E:\\tmp",
    BROWSER: "none",
  },
  detached: true,
  windowsHide: true,
  stdio: ["ignore", out, out],
});
child.unref();
writeFileSync(
  STATE_FILE,
  JSON.stringify({ pid: child.pid, port: PORT, dist: DIST, startedAt: new Date().toISOString() }, null, 2),
);
console.log(`spawned detached next dev pid ${child.pid} on :${PORT} (distDir ${DIST}) → ${LOG_FILE}`);
