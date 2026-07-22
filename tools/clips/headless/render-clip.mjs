// Offline, deterministic renderer for ONE why-panel mistake clip.
//
// Drives /dev/clip-headless in HEADLESS Chromium (SwiftShader — no GPU, no
// visible tab, no human): steps the shared clock start→end at a fixed dt,
// screenshots each frame, stitches them to a seekable VP9 .webm with ffmpeg,
// saves the five R0 keyframes, and upserts the clip into public/clips/manifest.json.
// Enforces the R1 actor gate exactly like the real-time rig (a clip whose
// required actors never framed FAILS — nothing is written).
//
// Usage (from tools/clips/headless, dev server already on :3000):
//   node render-clip.mjs <templateId> <mistakeIndex> [--fps 30] [--base http://localhost:3000]
//
// Exit 0 = clip written; non-zero = failed (message on stderr), manifest untouched.

import { chromium } from "./pw.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const CLIPS_DIR = join(REPO, "platform/public/clips");
const MANIFEST = join(CLIPS_DIR, "manifest.json");

// ---- args -----------------------------------------------------------------
const [templateId, mistakeRaw, ...rest] = process.argv.slice(2);
if (!templateId || mistakeRaw === undefined) {
  console.error("usage: node render-clip.mjs <templateId> <mistakeIndex> [--fps N] [--base URL]");
  process.exit(64);
}
const mistakeIndex = Number(mistakeRaw);
const opt = (name, def) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 && rest[i + 1] ? rest[i + 1] : def;
};
const FPS = Number(opt("fps", "30"));
const BASE = opt("base", "http://localhost:3000");
const id = `${templateId}__m${mistakeIndex}`;

// ---- ffmpeg resolution ----------------------------------------------------
function resolveFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  const winget =
    "C:/Users/Ljh/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe";
  if (existsSync(winget)) return winget;
  throw new Error("ffmpeg not found (set $FFMPEG)");
}
const FFMPEG = resolveFfmpeg();

// Prefer the real GPU (ANGLE→D3D11) — ~30× faster than software on this box's
// GTX 1060 (measured 29.9 fps vs ~1 fps). SwiftShader stays as a legal fallback
// via --enable-unsafe-swiftshader so WebGL never hard-fails on a GPU-less host.
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const CANVAS_W = 1280;
const CANVAS_H = 720;

function log(m) {
  process.stderr.write(`[${id}] ${m}\n`);
}

async function main() {
  const framesDir = join(CLIPS_DIR, `.frames_${id}`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  mkdirSync(CLIPS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: CANVAS_W, height: CANVAS_H },
    deviceScaleFactor: 1,
  });
  // Founder-parity render preset (exposure/AO/bloom) in the fresh profile.
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.quality", "high");
    } catch {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  const url = `${BASE}/dev/clip-headless?template=${encodeURIComponent(templateId)}&mistake=${mistakeIndex}`;
  log(`loading ${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });

  // Wait for the scene to build + warm (ReadyProbe → state "ready").
  await page.waitForFunction(
    () => {
      const a = window.__clipHeadless;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: 120_000 },
  );
  // Read only the DATA fields — the surface also holds functions + a getter
  // that don't survive structured-clone.
  const snap = await page.evaluate(() => ({
    state: window.__clipHeadless.state,
    error: window.__clipHeadless.error ?? null,
    meta: window.__clipHeadless.meta ?? null,
  }));
  if (snap.state === "error") throw new Error(`scene error: ${snap.error}`);
  if (!snap.meta) throw new Error("no meta on ready");
  const m = snap.meta;
  const { startSec, endSec, durationSec, faultTimeSec, keyframeAt } = m;
  log(`ready · window ${startSec.toFixed(2)}–${endSec.toFixed(2)}s · fault @${faultTimeSec.toFixed(2)}s · view ${m.view}`);

  const N = Math.max(2, Math.round(durationSec * FPS));
  const dt = durationSec / (N - 1);

  const frameCount = () => page.evaluate(() => window.__clipHeadless.frameCount);
  const settle = async (n) => {
    const base = await frameCount();
    await page.waitForFunction((t) => window.__clipHeadless.frameCount >= t, base + n, {
      timeout: 20_000,
    });
  };
  const seek = (t) => page.evaluate((tt) => window.__clipHeadless.seek(tt), t);

  // Prime the start pose (a few solid frames before the first capture).
  await seek(startSec);
  await settle(8);

  const canvas = page.locator('main[data-headless="scene"] canvas');
  const pad = (i) => String(i).padStart(5, "0");

  // Read pixels straight off the WebGL backbuffer (preserveDrawingBuffer is on
  // in CaptureScene) rather than Playwright's element screenshot: the canvas
  // re-renders every rAF, so locator.screenshot's "wait for element to be
  // stable" never settles. toDataURL is position-independent, needs no clip
  // math, and captures the exact frame the clock is seeked to.
  const grab = async (path) => {
    const dataUrl = await canvas.evaluate((el) => el.toDataURL("image/png"));
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    writeFileSync(path, Buffer.from(b64, "base64"));
  };

  log(`rendering ${N} frames @ ${FPS}fps…`);
  for (let i = 0; i < N; i++) {
    const t = i === N - 1 ? endSec : startSec + i * dt;
    const before = await frameCount();
    await seek(t);
    // ≥2 fresh renders guarantees the new clock is on screen (world stepped,
    // camera + overlays are pure functions of the clock).
    await page.waitForFunction((tgt) => window.__clipHeadless.frameCount >= tgt, before + 2, {
      timeout: 20_000,
    });
    await grab(join(framesDir, `frame_${pad(i)}.png`));
    if (i % 30 === 0) log(`  frame ${i}/${N}`);
  }

  // R1 gate — required actors must have framed at the fault beat.
  const actors = await page.evaluate(() => window.__clipHeadless.readChecklist());
  await browser.close();
  const missing = actors.filter((a) => !a.present);
  if (missing.length > 0) {
    rmSync(framesDir, { recursive: true, force: true });
    throw new Error(`R1: липсва ${missing.map((m) => m.kind).join(", ")}`);
  }

  // Stitch → seekable VP9 webm (proper duration index, unlike MediaRecorder).
  const webmOut = join(CLIPS_DIR, `${id}.webm`);
  log("ffmpeg → webm…");
  const ff = spawnSync(
    FFMPEG,
    [
      "-y",
      "-framerate", String(FPS),
      "-start_number", "0",
      "-i", join(framesDir, "frame_%05d.png"),
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuv420p",
      "-b:v", "0",
      "-crf", "32",
      "-deadline", "good",
      "-cpu-used", "3",
      "-an",
      webmOut,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (ff.status !== 0) throw new Error(`ffmpeg exit ${ff.status}`);

  // Five R0 keyframes = the frames nearest each planned time.
  const keyframes = keyframeAt.map((kt, j) => {
    const idx = Math.max(0, Math.min(N - 1, Math.round((kt - startSec) / dt)));
    copyFileSync(join(framesDir, `frame_${pad(idx)}.png`), join(CLIPS_DIR, `${id}.k${j}.png`));
    return `/clips/${id}.k${j}.png`;
  });

  rmSync(framesDir, { recursive: true, force: true });

  // Upsert the manifest entry (byte-shape identical to the real-time rig).
  const manifest = existsSync(MANIFEST)
    ? JSON.parse(readFileSync(MANIFEST, "utf8"))
    : { version: 1, clips: [] };
  const entry = {
    id,
    templateId,
    mistakeIndex,
    tracePath: m.tracePath,
    src: `/clips/${id}.webm`,
    durationSec,
    recordedAt: new Date().toISOString(),
    titleBg: m.titleBg,
    keyframes,
    actors,
    view: m.view,
    quality: "high",
  };
  const at = manifest.clips.findIndex((c) => c.id === id);
  if (at >= 0) manifest.clips[at] = entry;
  else manifest.clips.push(entry);
  manifest.clips.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  log(`DONE · ${webmOut} · ${keyframes.length} keyframes · actors ${actors.filter((a) => a.present).length}/${actors.length}`);
}

main().catch((e) => {
  log(`FAIL: ${e.message}`);
  process.exit(1);
});
