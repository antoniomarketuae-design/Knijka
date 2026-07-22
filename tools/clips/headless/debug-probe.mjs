import { chromium } from "./pw.mjs";

const template = process.argv[2] ?? "sc-roundabout-entry";
const mistake = process.argv[3] ?? "0";
const BASE = "http://localhost:3000";
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await ctx.addInitScript(() => { try { window.localStorage.setItem("sim.quality", "high"); } catch {} });
const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
const url = `${BASE}/dev/clip-headless?template=${encodeURIComponent(template)}&mistake=${mistake}`;
await page.goto(url, { waitUntil: "load", timeout: 60000 });
await page.waitForFunction(() => {
  const a = window.__clipHeadless;
  return a && (a.state === "ready" || a.state === "error");
}, undefined, { timeout: 120000 });
const meta = await page.evaluate(() => ({ state: window.__clipHeadless.state, error: window.__clipHeadless.error ?? null, meta: window.__clipHeadless.meta ?? null }));
console.log("state", meta.state, meta.error ?? "");
console.log("meta", JSON.stringify(meta.meta));
if (meta.state !== "ready") { await browser.close(); process.exit(1); }
const { startSec, endSec } = meta.meta;

const frameCount = () => page.evaluate(() => window.__clipHeadless.frameCount);
const seek = (t) => page.evaluate((tt) => window.__clipHeadless.seek(tt), t);
// Seek forward in small steps so the stepper advances through the whole beat.
await seek(startSec);
let base = await frameCount();
await page.waitForFunction((t) => window.__clipHeadless.frameCount >= t, base + 4, { timeout: 20000 });
const step = (endSec - startSec) / 300;
for (let t = startSec; t <= endSec + 1e-6; t += step) {
  const before = await frameCount();
  await seek(Math.min(t, endSec));
  await page.waitForFunction((tgt) => window.__clipHeadless.frameCount >= tgt, before + 2, { timeout: 20000 });
}
const dbg = await page.evaluate(() => window.__clipHeadless.readDebug());
await browser.close();
console.log("vehicles peak:", dbg.vehicles, "pedestrians:", dbg.pedestrians, "profiles:", JSON.stringify(dbg.profiles), "framedKinds:", JSON.stringify(dbg.framedKinds));
console.log("debugFrames:", dbg.debugFrames.length);
for (const f of dbg.debugFrames) {
  const cars = f.cars.map((c) => `(${c.x.toFixed(1)},${c.y.toFixed(1)})${c.inFrame ? "*IN*" : ""}`).join(" ");
  console.log(`t=${f.t.toFixed(2)} ghost=(${f.gx.toFixed(2)},${f.gy.toFixed(2)}) hdg=${f.gh.toFixed(1)} cars=[${cars || "none"}]`);
}
