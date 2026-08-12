// -----------------------------------------------------------------------------
// glance-events.mjs — WHAT DOES THE «Л» BUTTON ACTUALLY RECEIVE?
//
// `--method click` completes the graded pre-drive step and `--method touch`
// does not. Before that is called a defect it has to be shown NOT to be the
// instrument: `Input.dispatchTouchEvent` with `type:"touchEnd", touchPoints:[]`
// is the idiom the whole harness uses, and if Chrome synthesises that release
// at the wrong coordinates then `tapPointWithin` (hud/tapActivation.ts:159)
// would refuse a press that a real thumb would have made.
//
// So: record every pointer/click event the button sees, with the coordinates
// and the rect they are tested against, and print both.
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { newDeviceContext } from "./lib/insets.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:3200");
const DEVICE_ID = arg("device", "iphone16-landscape");
const LESSON = arg("lesson", "l1-preparation");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const device = DEVICES[DEVICE_ID];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

await page.goto(`${BASE}/dev/drive-rig?lesson=${LESSON}&readout=0&quality=low`, {
  waitUntil: "domcontentloaded",
  timeout: 240_000,
});
await page.waitForFunction(() => window.__glanceProbe !== undefined, null, { timeout: 300_000 });
await sleep(4000);

const L = "Поглед в лявото огледало";

const box = await page.evaluate((l) => {
  const b = document.querySelector(`[aria-label="${l}"]`);
  if (!b) return null;
  const r = b.getBoundingClientRect();
  window.__evLog = [];
  for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "touchstart", "touchend"]) {
    b.addEventListener(
      type,
      (e) => {
        window.__evLog.push({
          type,
          pointerId: e.pointerId ?? null,
          pointerType: e.pointerType ?? null,
          x: e.clientX ?? null,
          y: e.clientY ?? null,
          detail: e.detail ?? null,
          rect: (() => {
            const q = e.currentTarget.getBoundingClientRect();
            return [Math.round(q.left), Math.round(q.top), Math.round(q.right), Math.round(q.bottom)];
          })(),
        });
      },
      true,
    );
  }
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: [r.left, r.top, r.right, r.bottom] };
}, L);
console.log(`«Л» centre ${box.x.toFixed(1)},${box.y.toFixed(1)} rect ${box.rect.map((n) => n.toFixed(1)).join(",")}`);

console.log("\n--- A: touchEnd with an EMPTY touchPoints array (the harness idiom) ---");
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: box.x, y: box.y, id: 6, radiusX: 12, radiusY: 12, force: 1 }],
});
await sleep(120);
await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await sleep(400);
let log = await page.evaluate(() => {
  const l = window.__evLog;
  window.__evLog = [];
  return l;
});
for (const e of log) console.log(`  ${e.type.padEnd(14)} id=${e.pointerId} type=${e.pointerType} at ${e.x},${e.y} detail=${e.detail} rect=[${e.rect}]`);
console.log(`  envelope now: ${JSON.stringify(await page.evaluate(() => window.__glanceProbe))}`);

await sleep(2500);
console.log("\n--- B: touchEnd carrying the released point's coordinates ---");
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: box.x, y: box.y, id: 9, radiusX: 12, radiusY: 12, force: 1 }],
});
await sleep(120);
await cdp.send("Input.dispatchTouchEvent", {
  type: "touchEnd",
  touchPoints: [{ x: box.x, y: box.y, id: 9, radiusX: 12, radiusY: 12, force: 1 }],
});
await sleep(400);
log = await page.evaluate(() => {
  const l = window.__evLog;
  window.__evLog = [];
  return l;
});
for (const e of log) console.log(`  ${e.type.padEnd(14)} id=${e.pointerId} type=${e.pointerType} at ${e.x},${e.y} detail=${e.detail} rect=[${e.rect}]`);
console.log(`  envelope now: ${JSON.stringify(await page.evaluate(() => window.__glanceProbe))}`);

await sleep(2500);
console.log("\n--- C: Playwright's own page.tap() ---");
await page.tap(`[aria-label="${L}"]`).catch((e) => console.log(`  tap threw: ${e.message}`));
await sleep(400);
log = await page.evaluate(() => {
  const l = window.__evLog;
  window.__evLog = [];
  return l;
});
for (const e of log) console.log(`  ${e.type.padEnd(14)} id=${e.pointerId} type=${e.pointerType} at ${e.x},${e.y} detail=${e.detail} rect=[${e.rect}]`);
console.log(`  envelope now: ${JSON.stringify(await page.evaluate(() => window.__glanceProbe))}`);

await browser.close();
