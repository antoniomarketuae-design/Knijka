// Fast proof: load one clip headless, grab the START frame and the FAULT frame
// straight off the WebGL backbuffer. Lets me eyeball the real 3D scene without
// waiting for a full 300-frame render.
//   node probe-frame.mjs <templateId> <mistakeIndex>

import { chromium } from "./pw.mjs";
import { writeFileSync } from "node:fs";

const [templateId, mistakeRaw] = process.argv.slice(2);
const mistakeIndex = Number(mistakeRaw ?? "0");
const BASE = "http://localhost:3000";
const GL_ARGS = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
  "--ignore-gpu-blocklist",
];

const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
});
await context.addInitScript(() => {
  try { window.localStorage.setItem("sim.quality", "high"); } catch {}
});
const page = await context.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));

await page.goto(`${BASE}/dev/clip-headless?template=${templateId}&mistake=${mistakeIndex}`, {
  waitUntil: "load",
  timeout: 60_000,
});
await page.waitForFunction(
  () => window.__clipHeadless && (window.__clipHeadless.state === "ready" || window.__clipHeadless.state === "error"),
  undefined,
  { timeout: 120_000 },
);
const snap = await page.evaluate(() => ({
  state: window.__clipHeadless.state,
  error: window.__clipHeadless.error ?? null,
  meta: window.__clipHeadless.meta ?? null,
}));
if (snap.state === "error") { console.error("ERROR:", snap.error); await browser.close(); process.exit(1); }
console.log("ready:", JSON.stringify(snap.meta));

const canvas = page.locator('main[data-headless="scene"] canvas');
const frameCount = () => page.evaluate(() => window.__clipHeadless.frameCount);
const seek = (t) => page.evaluate((tt) => window.__clipHeadless.seek(tt), t);
const settle = async (n) => {
  const b = await frameCount();
  await page.waitForFunction((t) => window.__clipHeadless.frameCount >= t, b + n, { timeout: 20_000 });
};
const grab = async (path) => {
  const d = await canvas.evaluate((el) => el.toDataURL("image/png"));
  writeFileSync(path, Buffer.from(d.slice(d.indexOf(",") + 1), "base64"));
  console.log("wrote", path);
};

const { startSec, faultTimeSec } = snap.meta;
// Step forward in small increments to the fault so the world advances legally.
await seek(startSec);
await settle(6);
await grab("probe_start.png");
const step = 1 / 30;
for (let t = startSec; t <= faultTimeSec; t += step) {
  const b = await frameCount();
  await seek(Math.min(t, faultTimeSec));
  await page.waitForFunction((x) => window.__clipHeadless.frameCount >= x, b + 2, { timeout: 20_000 });
}
await settle(2);
await grab("probe_fault.png");

await browser.close();
console.log("done");
