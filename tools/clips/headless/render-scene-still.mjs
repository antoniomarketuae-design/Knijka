// Offline renderer for theory scene-stills (PILOT).
//
// Drives /dev/scene-still in HEADLESS Chromium (real GPU via ANGLE→D3D11, with
// SwiftShader as the legal fallback — same GL args as the clip rig), waits for
// the scene's `window.__sceneStill.state === "ready"`, and screenshots the
// static canvas straight off the WebGL backbuffer (preserveDrawingBuffer is on)
// into platform/public/scene-stills/<id>.png.
//
// Unlike render-clip.mjs there is no clock, no seek, no ffmpeg — a scene-still
// is a single deterministic frame, so we just wait for ready and grab it.
//
// Usage (from tools/clips/headless, dev server already on :3000):
//   node render-scene-still.mjs <questionId> [<questionId> …] [--base URL]
//
// Inline spec (renders a SceneStillMedia JSON via the route's ?spec= path, so a
// pilot can carry marks the committed question doesn't — no content edit):
//   node render-scene-still.mjs --spec-file <path.json> --out <name> [--base URL]
//
// Exit 0 = all stills written; non-zero = at least one failed (stderr message).

import { chromium } from "./pw.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const OUT_DIR = join(REPO, "platform/public/scene-stills");

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const VALUE_FLAGS = new Set(["--base", "--spec-file", "--out"]);
const optAt = (flag) => {
  const i = argv.indexOf(flag);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
};
// Positional args are question ids; skip flags AND the value that follows a
// value-taking flag (so "--out foo" doesn't leak "foo" into the id list).
const ids = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    if (VALUE_FLAGS.has(a)) i++;
    continue;
  }
  ids.push(a);
}
const BASE = optAt("--base") ?? "http://localhost:3000";
const SPEC_FILE = optAt("--spec-file");
const OUT_NAME = optAt("--out");
if (ids.length === 0 && !SPEC_FILE) {
  console.error(
    "usage: node render-scene-still.mjs <questionId> [<questionId> …] [--base URL]\n" +
      "       node render-scene-still.mjs --spec-file <path.json> --out <name> [--base URL]",
  );
  process.exit(64);
}
if (SPEC_FILE && !OUT_NAME) {
  console.error("--spec-file requires --out <name>");
  process.exit(64);
}

// Prefer the real GPU (ANGLE→D3D11), SwiftShader as legal fallback (clip rig parity).
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const CANVAS_W = 1280;
const CANVAS_H = 720;

function log(m) {
  process.stderr.write(`[scene-still] ${m}\n`);
}

async function renderOne(page, url, outName) {
  log(`loading ${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const a = window.__sceneStill;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: 120_000 },
  );
  const snap = await page.evaluate(() => ({
    state: window.__sceneStill.state,
    error: window.__sceneStill.error ?? null,
  }));
  if (snap.state === "error") throw new Error(`scene error: ${snap.error}`);

  // Static scene — a short settle lets any late props/textures land, then the
  // backbuffer holds a single deterministic frame.
  await page.waitForTimeout(600);

  const canvas = page.locator('main[data-scene-still="scene"] canvas');
  const dataUrl = await canvas.evaluate((el) => el.toDataURL("image/png"));
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const out = join(OUT_DIR, `${outName}.png`);
  writeFileSync(out, Buffer.from(b64, "base64"));
  log(`DONE · ${out}`);
  return out;
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: CANVAS_W, height: CANVAS_H },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  // Build the render list: committed questions (?id) + an optional inline spec
  // (?spec=<base64 JSON> — the route decodes it server-side).
  const jobs = ids.map((id) => ({
    name: id,
    url: `${BASE}/dev/scene-still?id=${encodeURIComponent(id)}`,
  }));
  if (SPEC_FILE) {
    const json = readFileSync(resolve(SPEC_FILE), "utf-8");
    const b64 = Buffer.from(json, "utf-8").toString("base64");
    jobs.push({
      name: OUT_NAME,
      url: `${BASE}/dev/scene-still?spec=${encodeURIComponent(b64)}`,
    });
  }

  const failures = [];
  for (const job of jobs) {
    try {
      await renderOne(page, job.url, job.name);
    } catch (err) {
      failures.push(job.name);
      log(`FAIL ${job.name}: ${err.message}`);
    }
  }
  await browser.close();
  if (failures.length > 0) {
    log(`FAILED: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
