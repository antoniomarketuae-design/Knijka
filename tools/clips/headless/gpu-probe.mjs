// Measure the real render speed of the clip scene headless, and report which
// GL backend Chromium actually used. Tries a named flag profile so I can
// compare SwiftShader (software) vs the box's GTX 1060 (GPU).
//   node gpu-probe.mjs <profile>   profile = swiftshader | gpu | gpu-edge
//
// Prints: renderer string + frames/sec over 24 stepped frames + writes gpu_probe_<profile>.png

import { chromium } from "./pw.mjs";
import { writeFileSync } from "node:fs";

const profile = process.argv[2] ?? "gpu";
const TEMPLATE = "sc-ac-night-lights";
const MISTAKE = 0;
const BASE = "http://localhost:3000";

const PROFILES = {
  swiftshader: {
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
  },
  gpu: {
    // Let ANGLE pick the D3D11 path onto the discrete GPU; keep swiftshader as
    // a legal fallback so WebGL never hard-fails.
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  },
  "gpu-edge": {
    channel: "msedge",
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"],
  },
};

const cfg = PROFILES[profile];
if (!cfg) { console.error("unknown profile", profile); process.exit(64); }

const t0 = Date.now();
const browser = await chromium.launch({ headless: true, ...cfg });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await context.addInitScript(() => { try { window.localStorage.setItem("sim.quality", "high"); } catch {} });
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(`${BASE}/dev/clip-headless?template=${TEMPLATE}&mistake=${MISTAKE}`, { waitUntil: "load", timeout: 60_000 });
await page.waitForFunction(() => {
  const a = window.__clipHeadless; return a && (a.state === "ready" || a.state === "error");
}, undefined, { timeout: 120_000 });

// Which GL backend did Chromium actually use for a fresh context?
const renderer = await page.evaluate(() => {
  const c = document.createElement("canvas");
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  if (!gl) return "(no webgl)";
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  return dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
});
const readySec = ((Date.now() - t0) / 1000).toFixed(1);

const meta = await page.evaluate(() => window.__clipHeadless.meta);
const frameCount = () => page.evaluate(() => window.__clipHeadless.frameCount);
const seek = (t) => page.evaluate((tt) => window.__clipHeadless.seek(tt), t);

// Time 24 stepped frames from the window start.
const N = 24, step = 1 / 30;
await seek(meta.startSec);
{ const b = await frameCount(); await page.waitForFunction((t) => window.__clipHeadless.frameCount >= t, b + 6, { timeout: 30_000 }); }
const tStep0 = Date.now();
for (let i = 0; i < N; i++) {
  const b = await frameCount();
  await seek(meta.startSec + i * step);
  await page.waitForFunction((t) => window.__clipHeadless.frameCount >= t, b + 2, { timeout: 30_000 });
}
const stepMs = Date.now() - tStep0;
const fps = (N / (stepMs / 1000)).toFixed(1);

const canvas = page.locator('main[data-headless="scene"] canvas');
const d = await canvas.evaluate((el) => el.toDataURL("image/png"));
writeFileSync(`gpu_probe_${profile}.png`, Buffer.from(d.slice(d.indexOf(",") + 1), "base64"));

await browser.close();
console.log(JSON.stringify({ profile, renderer, readySec, stepFramesPerSec: Number(fps), msPerStep: Math.round(stepMs / N) }, null, 2));
