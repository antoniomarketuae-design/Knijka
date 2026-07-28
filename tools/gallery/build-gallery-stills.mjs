// build-gallery-stills.mjs — the data build script behind /review/gallery.
//
// WHY. The founder cannot finish his verdict on the scenario catalogue because
// the verdict board lists 150 templates and shows him nothing to look at. A
// full mistake reel is minutes of render each — hours for the set, which is why
// only 42 of them exist. A scene still is well under a second. So this script
// renders ONE deterministic frame per template: the real committed district,
// framed on the learner's car where the recorded shadow drive actually is
// mid-drill. 150 of those is a couple of minutes and it unblocks the review.
//
// HOW. The job list (template → base64 SceneStillMedia) is derived server-side
// and served by /dev/gallery-index, because the scenario templates are TS
// modules and the pose rule lives in galleryStillSpec.ts — the dev server has
// already compiled both. Each job is then rendered through the EXISTING
// /dev/scene-still rig (?spec=<base64>), screenshotted, and encoded to WebP at
// the shared poster contract (854 px / q78, tools/clips/headless/webp.mjs) —
// the founder reviews on his PHONE, so a folder of 1.1 MB PNGs would be a
// 170 MB download.
//
// Output: platform/public/gallery-stills/<key>.webp + manifest.json (the pose
// provenance per still + the honest gap list). Both are gitignored like the
// clip binaries; the gallery degrades to "не е рендиран" for anything absent.
//
// Usage (dev server already running — use YOUR OWN lane's port):
//   node tools/gallery/build-gallery-stills.mjs --base http://localhost:3260
//   node tools/gallery/build-gallery-stills.mjs --only sc-park-perp-rev,sc-ac-fog
//   node tools/gallery/build-gallery-stills.mjs --limit 10        # smoke run
//   node tools/gallery/build-gallery-stills.mjs --force           # re-render all
//
// Exit 0 = every requested still is on disk; non-zero = at least one failed.

import { chromium } from "../clips/headless/pw.mjs";
import { encodeKeyframeWebp, resolveFfmpeg } from "../clips/headless/webp.mjs";
import { existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
const OUT_DIR = join(REPO, "platform/public/gallery-stills");
const MANIFEST = join(OUT_DIR, "manifest.json");

// ---- args -----------------------------------------------------------------

const argv = process.argv.slice(2);
const optAt = (flag, fallback = null) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const BASE = optAt("--base", "http://localhost:3260");
const ONLY = (optAt("--only") ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const LIMIT = Number(optAt("--limit", "0")) || 0;
const FORCE = argv.includes("--force");

// Real GPU through ANGLE→D3D11 by default (the render-scene-still.mjs arg set),
// with SwiftShader kept as the legal fallback flag. This is not a style choice:
// MEASURED on this box, a district still costs ~6 s on the GPU and ~180 s in
// software — 16 minutes for the catalogue versus eight hours. `--swiftshader`
// forces the software path for a machine with no usable GPU.
const GL_ARGS = argv.includes("--swiftshader")
  ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]
  : ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const CANVAS_W = 1280;
const CANVAS_H = 720;
/** The scene fires ready after its warmup frames; SwiftShader needs headroom. */
const READY_TIMEOUT_MS = 180_000;

function log(m) {
  process.stderr.write(`[gallery-stills] ${m}\n`);
}

// ---- render ---------------------------------------------------------------

async function renderOne(page, job, ffmpeg) {
  const url = `${BASE}/dev/scene-still?spec=${encodeURIComponent(job.specB64)}`;
  await page.goto(url, { waitUntil: "load", timeout: 120_000 });

  await page.waitForFunction(
    () => {
      const a = window.__sceneStill;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: READY_TIMEOUT_MS },
  );
  const snap = await page.evaluate(() => ({
    state: window.__sceneStill.state,
    error: window.__sceneStill.error ?? null,
  }));
  if (snap.state === "error") throw new Error(`scene error: ${snap.error}`);

  // A short settle lets late GLB/texture work land before the shot.
  await page.waitForTimeout(400);

  // Element screenshot, NOT canvas.toDataURL(): the read-back comes out blank
  // on the software path, while the compositor screenshot is real on both.
  const tmpPng = join(OUT_DIR, `.tmp-${job.key}.png`);
  await page
    .locator('main[data-scene-still="scene"] canvas')
    .screenshot({ path: tmpPng, timeout: 180_000, animations: "disabled" });

  const out = join(OUT_DIR, `${job.key}.webp`);
  const bytes = encodeKeyframeWebp(ffmpeg, tmpPng, out);
  rmSync(tmpPng, { force: true });
  return bytes;
}

// ---- main -----------------------------------------------------------------

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const ffmpeg = resolveFfmpeg();

  log(`fetching job list from ${BASE}/dev/gallery-index`);
  const res = await fetch(`${BASE}/dev/gallery-index`);
  if (!res.ok) {
    throw new Error(
      `job feed ${res.status} — is the dev server up on ${BASE}? (it must be a DEV build)`,
    );
  }
  const { jobs, gaps } = await res.json();
  log(`${jobs.length} renderable · ${gaps.length} with no resolvable pose`);

  let queue = jobs;
  if (ONLY.length > 0) queue = queue.filter((j) => ONLY.includes(j.templateId));
  if (!FORCE) {
    queue = queue.filter((j) => {
      const p = join(OUT_DIR, `${j.key}.webp`);
      return !(existsSync(p) && statSync(p).size > 0);
    });
  }
  if (LIMIT > 0) queue = queue.slice(0, LIMIT);
  log(`${queue.length} to render (${FORCE ? "forced" : "skipping already-rendered"})`);

  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: CANVAS_W, height: CANVAS_H },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  const failures = [];
  let totalBytes = 0;
  const t0 = Date.now();
  for (let i = 0; i < queue.length; i++) {
    const job = queue[i];
    try {
      const bytes = await renderOne(page, job, ffmpeg);
      totalBytes += bytes;
      log(`${i + 1}/${queue.length} ✓ ${job.templateId} (${(bytes / 1024).toFixed(0)} KB)`);
    } catch (err) {
      failures.push(job.templateId);
      log(`${i + 1}/${queue.length} ✗ ${job.templateId}: ${err.message}`);
    }
  }
  await browser.close();

  // ---- manifest: pose provenance + the honest gap list --------------------
  const sources = {};
  const rendered = [];
  for (const j of jobs) {
    if (existsSync(join(OUT_DIR, `${j.key}.webp`))) {
      sources[j.key] = j.source;
      rendered.push(j.templateId);
    }
  }
  const notRendered = [
    ...gaps.map((g) => ({ templateId: g.templateId, reason: g.reason })),
    ...jobs
      .filter((j) => !existsSync(join(OUT_DIR, `${j.key}.webp`)))
      .map((j) => ({ templateId: j.templateId, reason: "render-failed-or-not-run" })),
  ];
  writeFileSync(
    MANIFEST,
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        renderedCount: rendered.length,
        sources,
        notRendered,
      },
      null,
      2,
    ) + "\n",
  );

  const mins = ((Date.now() - t0) / 60_000).toFixed(1);
  log(
    `DONE in ${mins} min · ${rendered.length} stills on disk · ` +
      `${(totalBytes / 1_000_000).toFixed(2)} MB written this run · ` +
      `${notRendered.length} still missing`,
  );
  if (failures.length > 0) {
    log(`FAILED: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
