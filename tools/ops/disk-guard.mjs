#!/usr/bin/env node
// Disk guard for the dev box.
//
// WHY THIS EXISTS
// ---------------
// On 2026-07-29 the C: drive fell to 1.58 GB free of 118.6 GB and MCP servers
// began failing to spawn ("UtilityProcess spawn timeout after 5000ms"). The
// cause was a single file:
//
//   %LOCALAPPDATA%\prisma-dev-nodejs\Data\durable-streams\default\
//     durable-streams.sqlite   =  25.61 GB
//
// `prisma dev` (the local Prisma Postgres) writes every database mutation into
// a `wal` table inside that sqlite file, and a background compaction job is
// meant to roll those rows into the `segments` table and truncate the WAL.
// That job had never run: `wal` held 24,761,558 rows while `segments` held 0.
// `freelist_count` was 13 pages, so the rows were LIVE and VACUUM would have
// reclaimed nothing (and could not run anyway — VACUUM needs free space equal
// to the database size, which was the very thing we had run out of).
//
// The database it describes is 8.4 MB across 9 tables — 557 rows of actual
// application data had produced ~24.7 million journal entries. The journal is
// derived state: the Postgres data lives in Data/<name>/.pglite, and deleting
// the journal cost nothing. Verified by dumping every table before and after:
// all 9 counts identical, admin accounts intact.
//
// USAGE
//   node tools/ops/disk-guard.mjs            # report
//   node tools/ops/disk-guard.mjs --purge    # stop daemon, delete journal, restart
//
// --purge takes a full logical dump AND a copy of the .pglite directory to
// E:\ai-driver-backups\ before deleting anything, and refuses to run if the
// database has open connections.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const WARN_GB = 2; // journal size that earns a warning
const FAIL_GB = 8; // journal size that should be purged now

const DATA = path.join(
  process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
  "prisma-dev-nodejs",
  "Data",
);
const GB = (n) => n / 1073741824;
const fmt = (n) => GB(n).toFixed(2) + " GB";

function dirSize(p) {
  if (!fs.existsSync(p)) return 0;
  let total = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) {
      try {
        total += fs.statSync(path.join(e.parentPath ?? e.path, e.name)).size;
      } catch {}
    }
  }
  return total;
}

/** Every prisma-dev namespace on this machine and the size of its journal. */
function namespaces() {
  const root = path.join(DATA, "durable-streams");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root).map((name) => {
    const dir = path.join(root, name);
    const sqlite = path.join(dir, "durable-streams.sqlite");
    const journal = dirSize(dir);
    const data = dirSize(path.join(DATA, name, ".pglite"));
    let walRows = null;
    let segRows = null;
    if (fs.existsSync(sqlite)) {
      try {
        const db = new DatabaseSync(sqlite, { readOnly: true });
        try {
          walRows = db.prepare("SELECT count(*) c FROM wal").get().c;
        } catch {}
        try {
          segRows = db.prepare("SELECT count(*) c FROM segments").get().c;
        } catch {}
        db.close();
      } catch {}
    }
    return { name, dir, sqlite, journal, data, walRows, segRows };
  });
}

function freeOnC() {
  try {
    const out = execFileSync(
      "powershell",
      ["-NoProfile", "-Command", "(Get-PSDrive C).Free"],
      { encoding: "utf8" },
    );
    return Number(out.trim());
  } catch {
    return null;
  }
}

const nss = namespaces();
const free = freeOnC();

console.log("prisma dev journal report");
console.log("=========================");
if (free !== null) console.log("C: free:", fmt(free));
console.log();

let worst = 0;
for (const n of nss) {
  console.log(`namespace: ${n.name}`);
  console.log(`   journal   : ${fmt(n.journal)}`);
  console.log(`   pg data   : ${fmt(n.data)}`);
  if (n.walRows !== null)
    console.log(
      `   wal rows  : ${n.walRows.toLocaleString()}   segments: ${n.segRows ?? "?"}` +
        (n.segRows === 0 && n.walRows > 0 ? "   <-- compaction has never run" : ""),
    );
  if (n.data > 0) {
    const ratio = n.journal / n.data;
    console.log(`   ratio     : ${ratio.toFixed(0)}x the data it describes`);
  }
  console.log();
  worst = Math.max(worst, n.journal);
}

if (!process.argv.includes("--purge")) {
  if (GB(worst) >= FAIL_GB) {
    console.log(`FAIL: a journal is ${fmt(worst)}. Purge it:`);
    console.log("   node tools/ops/disk-guard.mjs --purge");
    process.exit(1);
  }
  if (GB(worst) >= WARN_GB) {
    console.log(`WARN: a journal has reached ${fmt(worst)}. Purge when convenient.`);
    process.exit(0);
  }
  console.log("OK — journals are within budget.");
  process.exit(0);
}

// ---------------------------------------------------------------- purge ----
console.log("PURGE requested.\n");

const stamp = new Date().toISOString().slice(0, 10);
const backup = `E:\\ai-driver-backups\\prisma-dev-${stamp}`;

// 1. Refuse if anything is connected — a live app mid-write is not our call.
const conns = execFileSync(
  "powershell",
  [
    "-NoProfile",
    "-Command",
    "@(Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | " +
      "Where-Object { $_.LocalPort -in 51214,51215 }).Count",
  ],
  { encoding: "utf8" },
).trim();
if (Number(conns) > 0) {
  console.error(
    `REFUSING: ${conns} open connection(s) to the dev database. Stop the dev servers first.`,
  );
  process.exit(1);
}

// 2. Back up the Postgres data dir for every namespace.
fs.mkdirSync(backup, { recursive: true });
for (const n of nss) {
  const src = path.join(DATA, n.name, ".pglite");
  if (!fs.existsSync(src)) continue;
  const dst = path.join(backup, `${n.name}-pglite`);
  fs.cpSync(src, dst, { recursive: true });
  console.log(`backed up ${n.name}/.pglite -> ${dst}  (${fmt(dirSize(dst))})`);
}

// 3. Stop the daemon.
console.log("\nstopping prisma dev daemon...");
execFileSync("powershell", [
  "-NoProfile",
  "-Command",
  "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    "Where-Object { $_.CommandLine -match 'prisma.*dev.*daemon' } | " +
    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }",
]);
await new Promise((r) => setTimeout(r, 3000));

// 4. Delete the journals, keeping server.json / server.lock.
let freed = 0;
for (const n of nss) {
  for (const suffix of ["", "-wal", "-shm"]) {
    const f = n.sqlite + suffix;
    if (fs.existsSync(f)) {
      const sz = fs.statSync(f).size;
      fs.rmSync(f, { force: true });
      freed += sz;
      console.log(`removed ${fmt(sz).padStart(10)}  ${path.basename(f)} (${n.name})`);
    }
  }
}
console.log(`\nfreed ${fmt(freed)}`);

// 5. Restart.
console.log("\nrestarting prisma dev...");
const child = spawn("npx", ["prisma", "dev", "--name", "default"], {
  cwd: "E:\\AI driver\\platform",
  detached: true,
  stdio: "ignore",
  shell: true,
});
child.unref();
console.log("restarted (detached). Verify with: node tools/ops/disk-guard.mjs");
console.log(`backups kept at: ${backup}`);
