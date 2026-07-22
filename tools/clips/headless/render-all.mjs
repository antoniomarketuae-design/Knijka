// Batch offline renderer — produces EVERY pilot mistake clip with no human and
// no visible browser. Reads the authoritative pilot list off /dev/clip-headless
// (list mode), then renders each clip in its OWN child process (fresh node +
// fresh headless Chromium per clip = perfect isolation, zero memory pile-up —
// the exact failure that killed the real-time batch four rounds).
//
// Usage (from tools/clips/headless, dev server on :3000):
//   node render-all.mjs [--fps 30] [--base URL] [--only-missing] [--from N] [--limit N]
//
// Sequential by design (the manifest upsert is not locked). Prints a PASS/FAIL
// roster at the end; a failed clip never blocks the rest.

import { chromium } from "./pw.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const CLIPS_DIR = join(REPO, "platform/public/clips");
const MANIFEST = join(CLIPS_DIR, "manifest.json");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const has = (name) => args.includes(`--${name}`);
const FPS = opt("fps", "30");
const BASE = opt("base", "http://localhost:3000");
const ONLY_MISSING = has("only-missing");
const FROM = Number(opt("from", "0"));
const LIMIT = Number(opt("limit", "0")); // 0 = all

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

function existingWebmIds() {
  if (!existsSync(MANIFEST)) return new Set();
  try {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    return new Set(
      m.clips
        .filter((c) => existsSync(join(CLIPS_DIR, `${c.id}.webm`)))
        .map((c) => c.id),
    );
  } catch {
    return new Set();
  }
}

async function readPilot() {
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/dev/clip-headless`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction(() => window.__clipHeadless?.state === "ready", undefined, {
      timeout: 120_000,
    });
    return await page.evaluate(() => window.__clipHeadless.pilot ?? []);
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("reading pilot list…");
  let pilot = await readPilot();
  console.log(`pilot: ${pilot.length} clips`);
  if (FROM > 0) pilot = pilot.slice(FROM);
  if (LIMIT > 0) pilot = pilot.slice(0, LIMIT);

  const have = ONLY_MISSING ? existingWebmIds() : new Set();
  const pass = [];
  const fail = [];
  const skip = [];

  for (let i = 0; i < pilot.length; i++) {
    const e = pilot[i];
    if (ONLY_MISSING && have.has(e.id)) {
      skip.push(e.id);
      console.log(`[${i + 1}/${pilot.length}] SKIP ${e.id} (already has webm)`);
      continue;
    }
    console.log(`[${i + 1}/${pilot.length}] ▶ ${e.id}`);
    const r = spawnSync(
      process.execPath,
      [join(__dirname, "render-clip.mjs"), e.template, String(e.mistake), "--fps", FPS, "--base", BASE],
      { stdio: "inherit" },
    );
    if (r.status === 0) pass.push(e.id);
    else fail.push(e.id);
  }

  console.log("\n──────── ГОТОВО ────────");
  console.log(`PASS ${pass.length}/${pilot.length}${skip.length ? ` · SKIP ${skip.length}` : ""}`);
  if (fail.length) {
    console.log(`FAIL ${fail.length}:`);
    for (const id of fail) console.log(`  ✗ ${id}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`render-all fatal: ${e.message}`);
  process.exit(1);
});
