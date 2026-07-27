// Offline, deterministic renderer for the MARKETING HERO LOOP — the short
// silent video every phone gets in place of the still dusk plate.
//
// WHY THIS EXISTS. The founder opened the landing page on his phone: "the car
// and the road dont move at all so this dont work". The plate was behaving as
// designed; a motionless hero on a page selling a driving simulator simply
// reads as broken. The live 3D is not the answer — it is a three.js runtime, a
// Draco decoder and a GLB, which is precisely what heroCapability.ts refuses
// to send to a phone. So the phone gets the same shot, pre-rendered once here,
// as a few hundred KB of video that fixed-function silicon decodes for free.
//
// Drives /dev/hero-loop in HEADLESS Chromium on the real GPU (ANGLE→D3D11,
// SwiftShader as the legal fallback — same GL args as the clip rig), seeks the
// scene to each frame's exact scene time, screenshots the viewport, and
// encodes two sources: VP9/WebM (small, and what almost everyone gets) and
// H.264/MP4 (the fallback that covers older iOS).
//
// THE SEAM. The window rendered here is chosen by heroScene.ts — read
// HERO_LOOP_VIDEO_DASH_PERIODS there for the full argument. In one paragraph:
// the road repeats every 0.9 s and the camera every 26 s, whose LCM is 234 s,
// so the loop is an exact whole number of DASH periods (the hard-edged thing
// the eye would catch) centred on the camera move's turning point, where
// `pingPong`'s symmetry makes the first and last camera poses bit-identical.
// The tyres are the residue: their period is 2πr/v = 2π·0.34/13.33 ≈ 0.1602 s,
// and 7.2/0.1602 = 44.94 turns, so the seam pops them by 0.06 turn ≈ 23°. At
// 6.2 rev/s sampled at 25 fps the wheels are already an aliased blur 10 m from
// camera; 23° is under a third of a frame of apparent motion, and there is no
// length that fixes it (the ratio 12/(2πr) = 5.617 is irrational).
//
// SUPERSAMPLING. Frames are captured at 2× the delivered width and downscaled
// with lanczos at encode time. The frame is mostly a smooth gradient with two
// 0.15 m painted lines converging into fog — the exact content where 1× MSAA
// crawls and where a downscale buys both a cleaner image AND a smaller file
// (less high-frequency noise for the encoder to spend bits on).
//
// Usage (from tools/clips/headless, dev server already on :3000):
//   node render-hero-loop.mjs [--crf N] [--width N] [--base URL] [--keep-frames]
//
// Exit 0 = both sources written to platform/public/hero/.

import { chromium } from "./pw.mjs";
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { resolveFfmpeg } from "./webp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const OUT_DIR = join(REPO, "platform/public/hero");
const BASENAME = "hero-loop";

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3000");
const KEEP_FRAMES = argv.includes("--keep-frames");

/**
 * Delivered width, px. The height follows from the plate's own 2.5 : 1 viewBox
 * (heroScene.ts PLATE_VIEWBOX_W/H) — the video has to be the same shape as the
 * drawing it fades over, or the crossfade reframes the shot.
 *
 * 1200 is set by the crop, not by the phone's width: on a narrow screen both
 * layers show only the right ~43 % of the composition (`object-cover` /
 * `xMaxYMax slice`), so a 390 px-wide viewport at DPR 3 is asking for ~1170 px
 * of pixels out of that slice. Going wider pays for pixels the crop throws
 * away on the device this file exists for.
 */
const OUT_W = Number(opt("width", "1200"));
const OUT_H = Math.round((OUT_W * 640) / 1600);

/** Supersample factor for the capture (see the header). */
const SS = 2;
const CAP_W = OUT_W * SS;
const CAP_H = OUT_H * SS;

/**
 * VP9 quality. 40 is deliberately soft: this plays behind body copy under
 * LiveHero's reading scrim and its own film grain, at a third of the screen's
 * width, and every byte here is spent on a 17-year-old's mobile data before
 * they have read a word of the page. Measured on this shot — see the byte
 * table this script prints.
 */
const CRF_VP9 = Number(opt("crf", "40"));
/** x264 is a different scale; ~ the same perceptual point as VP9 crf 40. */
const CRF_X264 = Number(opt("crf-x264", "32"));

const FFMPEG = resolveFfmpeg();

// Prefer the real GPU, SwiftShader as the legal fallback (clip-rig parity).
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

function log(m) {
  process.stderr.write(`[hero-loop] ${m}\n`);
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function run(args, label) {
  const r = spawnSync(FFMPEG, args, { stdio: ["ignore", "ignore", "inherit"] });
  if (r.status !== 0) throw new Error(`${label}: ffmpeg exit ${r.status}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  // Frames live OUTSIDE public/ on purpose: ~180 × 1 MB of PNG under a
  // budgeted asset tree would trip tools/assets/check-asset-budget.mjs, and a
  // crashed run would leave them there to be committed by accident.
  const framesDir = join(process.env.TEMP || tmpdir(), `hero-loop-frames`);
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: CAP_W, height: CAP_H },
    // The scene must render at exactly the viewport's pixel count: HeroScene3D
    // caps dpr at 1.5, so a scale factor above 1 would silently change the
    // supersample ratio the encode assumes.
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  const url = `${BASE}/dev/hero-loop`;
  log(`loading ${url} at ${CAP_W}×${CAP_H} (${SS}× supersample)`);
  await page.goto(url, { waitUntil: "load", timeout: 60_000 });

  await page.waitForFunction(
    () => {
      const a = window.__heroLoop;
      return a && (a.state === "ready" || a.state === "error");
    },
    undefined,
    { timeout: 120_000 },
  );
  const meta = await page.evaluate(() => ({
    state: window.__heroLoop.state,
    error: window.__heroLoop.error ?? null,
    fps: window.__heroLoop.fps,
    times: window.__heroLoop.times,
  }));
  if (meta.state === "error") throw new Error(`scene error: ${meta.error}`);

  const { fps, times } = meta;
  log(
    `ready · ${times.length} frames @ ${fps}fps · scene ` +
      `${times[0].toFixed(2)}–${times[times.length - 1].toFixed(2)}s`,
  );

  // Let the GLB's materials, the generated environment map and the road
  // program finish compiling before the first capture: a shader that compiles
  // on frame 3 renders frames 1–2 differently, and frame 0 is the one the loop
  // returns to forever.
  await page.waitForTimeout(1200);

  const pad = (i) => String(i).padStart(5, "0");
  for (let i = 0; i < times.length; i += 1) {
    await page.evaluate((idx) => window.__heroLoop.seek(idx), i);
    // The scene is a PURE function of the seeked time (heroCapture.ts), so
    // once React has committed the new prop every subsequent frame is
    // identical — two animation frames is proof the new one is on screen, and
    // no amount of extra waiting can change the pixels.
    await page.evaluate(
      () =>
        new Promise((done) => {
          requestAnimationFrame(() => requestAnimationFrame(() => done(null)));
        }),
    );
    await page.screenshot({ path: join(framesDir, `frame_${pad(i)}.png`) });
    if (i % 30 === 0) log(`  frame ${i}/${times.length}`);
  }
  await browser.close();

  const captured = readdirSync(framesDir).filter((f) => f.endsWith(".png")).length;
  if (captured !== times.length) {
    throw new Error(`captured ${captured} frames, expected ${times.length}`);
  }

  const scale = `scale=${OUT_W}:${OUT_H}:flags=lanczos`;
  const input = ["-framerate", String(fps), "-start_number", "0", "-i", join(framesDir, "frame_%05d.png")];

  // One keyframe, at frame 0. A browser loops by seeking to the start, so that
  // frame MUST be a keyframe; every additional one is bytes spent on a seek
  // nobody performs.
  const gop = String(times.length);

  const webm = join(OUT_DIR, `${BASENAME}.webm`);
  log(`ffmpeg → webm (VP9 crf ${CRF_VP9})…`);
  run(
    [
      "-y", "-hide_banner", "-loglevel", "error",
      ...input,
      "-vf", scale,
      "-c:v", "libvpx-vp9",
      "-pix_fmt", "yuv420p",
      "-b:v", "0",
      "-crf", String(CRF_VP9),
      "-g", gop,
      "-deadline", "good",
      "-cpu-used", "1",
      "-row-mt", "1",
      // Silent by contract: a muted autoplaying video is the only kind
      // browsers allow, and an empty audio track would be bytes and a decoder
      // for nothing.
      "-an",
      webm,
    ],
    "vp9",
  );

  const mp4 = join(OUT_DIR, `${BASENAME}.mp4`);
  log(`ffmpeg → mp4 (x264 crf ${CRF_X264})…`);
  run(
    [
      "-y", "-hide_banner", "-loglevel", "error",
      ...input,
      "-vf", scale,
      "-c:v", "libx264",
      // Baseline-ish profile + yuv420p is the combination every iOS decoder
      // takes; this file exists only for the browsers that refuse the WebM.
      "-profile:v", "main",
      "-level", "4.0",
      "-pix_fmt", "yuv420p",
      "-crf", String(CRF_X264),
      "-preset", "veryslow",
      "-g", gop,
      // The moov atom in front, so the loop can start before the whole file
      // has arrived.
      "-movflags", "+faststart",
      "-an",
      mp4,
    ],
    "x264",
  );

  if (!KEEP_FRAMES) rmSync(framesDir, { recursive: true, force: true });

  const sizes = [webm, mp4].map((p) => ({ path: p, bytes: statSync(p).size }));
  log(`DONE · ${OUT_W}×${OUT_H} · ${times.length} frames @ ${fps}fps`);
  for (const s of sizes) log(`  ${s.path.split(/[\\/]/).pop().padEnd(16)} ${kb(s.bytes)}`);

  // A machine-readable line for whatever runs this next (and for the report
  // that has to quote the byte cost).
  writeFileSync(
    join(OUT_DIR, `${BASENAME}.json`),
    JSON.stringify(
      {
        width: OUT_W,
        height: OUT_H,
        fps,
        frames: times.length,
        seconds: times.length / fps,
        crf: { vp9: CRF_VP9, x264: CRF_X264 },
        bytes: Object.fromEntries(sizes.map((s) => [s.path.endsWith(".webm") ? "webm" : "mp4", s.bytes])),
        renderedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
}

main().catch((e) => {
  log(`FAIL: ${e.message}`);
  process.exit(1);
});
