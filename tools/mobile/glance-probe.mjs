// -----------------------------------------------------------------------------
// glance-probe.mjs — DOES «Л»/«З»/«Д» MOVE THE CAMERA?
//
// Measured in PIXELS against a positive control (a HELD Q), and — the part the
// previous wave did not do — sampled INSIDE the tap's own hold window.
//
// WHY THE TIMING IS THE WHOLE INSTRUMENT. A key is HELD: the head stays turned
// for as long as the probe cares to look. A button is a TAP, and
// `GLANCE_TAP_HOLD_S = 0.9` (modules/sim/scene/cabin.ts) auto-releases it; the
// head then eases home over GLANCE_EASE_S = 0.18 s. A screenshot taken a second
// after the tap therefore shows a camera that is back where it started —
// indistinguishable, in a single frame diff, from a camera that never moved.
// So every capture here carries the delay it was taken at.
//
// INSTRUMENT NOTES
//  · `data-sim-glance` on <html> is published ONLY in chase mode
//    (CameraRig:966). It is read here as a SECONDARY channel and is expected to
//    be null in the cockpit — that is not a defect, and a probe that gates on
//    it reports every cockpit glance dead.
//  · The positive control is a held Q through `window.__driveRig.press`, which
//    dispatches a real KeyboardEvent — the same event a student's keyboard
//    sends (devrig/rig.ts:295).
//  · Chromium + CDP, because a real second finger needs
//    Input.dispatchTouchEvent. No layout claim is made from this file.
//
//   node tools/mobile/glance-probe.mjs --base http://localhost:3200
//   node tools/mobile/glance-probe.mjs --device iphone16-portrait --view chase
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";
import { decodePng } from "./lib/ready.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg("base", "http://localhost:3200");
const DEVICE_ID = arg("device", "iphone16-landscape");
const SCENARIO = arg("scenario", "sc-junction-left");
const LEVEL = arg("level", "1");
const HEADED = process.argv.includes("--headed");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Fraction of pixels that differ by more than `tol` on any channel. */
function diffFraction(aPng, bPng, tol = 10) {
  const a = decodePng(aPng);
  const b = decodePng(bPng);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`frame size changed ${a.width}x${a.height} -> ${b.width}x${b.height}`);
  }
  const n = a.width * a.height;
  let changed = 0;
  for (let i = 0; i < n; i += 1) {
    const o = i * a.channels;
    if (
      Math.abs(a.data[o] - b.data[o]) > tol ||
      Math.abs(a.data[o + 1] - b.data[o + 1]) > tol ||
      Math.abs(a.data[o + 2] - b.data[o + 2]) > tol
    ) {
      changed += 1;
    }
  }
  return changed / n;
}

const pct = (f) => `${(f * 100).toFixed(1)}%`;

const device = DEVICES[DEVICE_ID];
if (!device) throw new Error(`unknown device ${DEVICE_ID}`);

// ═══ THE FLAGS THAT DECIDE WHETHER THIS FILE MEASURES ANYTHING ═════════════
// Without them Chromium falls back to SwiftShader and this scene renders at
// 0.4 fps — measured, in this file's own „RIG FRAMES" column's sibling
// (glance-envelope.mjs). A HELD key survives any number of slow frames, so it
// photographs fine; a TAP holds for GLANCE_TAP_HOLD_S = 0.9 s and then eases
// home over GLANCE_EASE_S = 0.18 s, so at 0.4 fps the WHOLE glance falls
// between two rendered frames and cannot be photographed at all. That, and not
// the product, is what „a held key works and a tap does not" was.
// Recipe copied from tools/clips/headless/door-mirror-shot.mjs.
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({ headless: !HEADED, args: GL_ARGS });
const { context, inset } = await newDeviceContext(browser, device, {
  motion: "allow",
  insets: "real",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

console.log(`[glance-probe] ${device.label} · chromium (CDP touch) · ${BASE}`);
console.log(`[glance-probe] ${insetBanner(device, inset)}`);

await page.goto(`${BASE}/dev/drive-rig?scenario=${SCENARIO}&level=${LEVEL}&readout=0&quality=low`, {
  waitUntil: "domcontentloaded",
  timeout: 180_000,
});
await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 300_000 });
console.log("[glance-probe] rig ready");

await sleep(2500);

const coarse = await page.evaluate(() => window.matchMedia("(any-pointer: coarse)").matches);
const hudNodes = await page.evaluate(
  () => document.querySelectorAll('[data-hud="touch-controls"] *').length,
);
console.log(`[glance-probe] any-pointer:coarse=${coarse} · touch-controls DOM nodes=${hudNodes}`);
if (!coarse) throw new Error("not a coarse-pointer context — stop, this is not a phone");

const canvas = await page.evaluate(() => {
  let best = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    if (!best || r.width * r.height > best.width * best.height) {
      best = { x: r.x, y: r.y, width: r.width, height: r.height };
    }
  }
  return best;
});
if (!canvas) throw new Error("no canvas");
// The CENTRE BAND of the canvas: that is the road, and no control paints there.
const clip = {
  x: Math.round(canvas.x + canvas.width * 0.2),
  y: Math.round(canvas.y + canvas.height * 0.2),
  width: Math.round(canvas.width * 0.6),
  height: Math.round(canvas.height * 0.6),
};
console.log(`[glance-probe] road clip ${clip.width}x${clip.height} at ${clip.x},${clip.y}`);

const shoot = () => page.screenshot({ clip, animations: "allow" });
const glanceAttr = () =>
  page.evaluate(() => document.documentElement.getAttribute("data-sim-glance"));

/** The rig object goes away on an HMR reload; never evaluate against a corpse,
 *  and never sit on a 2-minute waitForFunction against one either — that alone
 *  turned a 6-minute run into a 40-minute one. */
async function waitRig() {
  for (let i = 0; i < 40; i += 1) {
    const alive = await page.evaluate(() => window.__driveRig?.ready === true).catch(() => false);
    if (alive) return true;
    await sleep(500);
  }
  throw new Error("window.__driveRig never came back (page reloaded?)");
}

// --- 0. BASELINE NOISE. The world is not still: traffic drives, lamps blink,
// and for the first seconds after load everything is still streaming in. Wait
// until it IS still, then state the residue — anything at or under it is
// „nothing moved", and the number is printed so no reader has to trust it.
let noise = [];
let noiseMax = 1;
for (let attempt = 0; attempt < 12; attempt += 1) {
  noise = [];
  for (let i = 0; i < 4; i += 1) {
    const a = await shoot();
    await sleep(300);
    const b = await shoot();
    noise.push(diffFraction(a, b));
  }
  noiseMax = Math.max(...noise);
  if (noiseMax < 0.12) break;
  await sleep(2500);
}
console.log(`\nBASELINE NOISE (nothing pressed): ${noise.map(pct).join(" · ")} → max ${pct(noiseMax)}`);
if (noiseMax >= 0.12) {
  console.log("  ⚠ the world never went still — read every number below against THIS floor");
}

async function cameraMode() {
  return page.evaluate(() => document.documentElement.getAttribute("data-sim-camera"));
}

/** Is the «Л» station on screen right now, and what is covering the play area? */
const stationState = () =>
  page.evaluate(() => {
    const b = document.querySelector('[aria-label="Поглед в лявото огледало"]');
    const r = b?.getBoundingClientRect();
    return {
      present: !!b,
      box: r ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null,
      pointerEvents: b ? getComputedStyle(b).pointerEvents : null,
      hudHidden: b ? !!b.closest("[aria-hidden='true']") : null,
      overlayActive: document.documentElement.dataset.simOverlayActive ?? null,
      speedKmh: window.__driveRig?.last?.speedKmh ?? null,
    };
  });

/** Run one action and photograph the road at each delay, one run per delay. */
async function measure(label, action, release, delays) {
  const rows = [];
  for (const delay of delays) {
    await sleep(1600); // fully home before the next arm
    await waitRig();
    const st = await stationState();
    const before = await shoot();
    await action();
    await sleep(delay);
    const after = await shoot();
    const attr = await glanceAttr();
    if (release) await release();
    rows.push({ delay, frac: diffFraction(before, after), attr, st });
  }
  console.log(`\n${label}`);
  for (const r of rows) {
    console.log(
      `  +${String(r.delay).padStart(4)} ms   road pixels changed ${pct(r.frac).padStart(6)}` +
        `   data-sim-glance=${String(r.attr ?? "(null)").padEnd(6)}` +
        ` «Л»=${r.st.present ? "on screen" : "ABSENT"}` +
        ` pe=${r.st.pointerEvents ?? "-"} overlay=${r.st.overlayActive ?? "-"}` +
        ` v=${r.st.speedKmh === null ? "-" : r.st.speedKmh.toFixed(2)}`,
    );
  }
  return rows;
}

// INSIDE the tap's own hold window (0.9 s), and one sample past it. The last
// row is the control for the control: by +1800 ms a tap has released and eased
// home, so it MUST read as baseline — a probe that only sampled there would
// call a perfectly live button dead, which is exactly what happened.
const DELAYS = [250, 600, 1800];

async function suite(viewLabel) {
  console.log(`\n===================== ${viewLabel} (data-sim-camera=${await cameraMode()}) =====================`);

  // POSITIVE CONTROL — a HELD Q. If this does not move the road, the
  // instrument is broken and no negative result below means anything.
  await measure(
    "POSITIVE CONTROL — keyboard Q HELD (never released during the capture)",
    () => page.evaluate(() => window.__driveRig.press("KeyQ")),
    () => page.evaluate(() => window.__driveRig.release("KeyQ")),
    DELAYS,
  );

  // KEY TAP — keydown+keyup immediately. This is the shape a BUTTON has
  // (an instant, not a hold) delivered through the path that is known to work.
  await measure(
    "KEY TAP — keydown+keyup on Q, released instantly (a key with a tap's shape)",
    async () => {
      await page.evaluate(() => {
        window.__driveRig.press("KeyQ");
        window.__driveRig.release("KeyQ");
      });
    },
    null,
    DELAYS,
  );

  // THE BUTTON, by DOM .click() — no pointer, no touch, no gesture.
  await measure(
    "«Л» BUTTON — DOM .click() (rules out every touch/pointer cause)",
    () =>
      page.evaluate(() => {
        document.querySelector('[aria-label="Поглед в лявото огледало"]')?.click();
      }),
    null,
    DELAYS,
  );

  // THE BUTTON, by a real finger.
  await measure(
    "«Л» BUTTON — real CDP touch tap on the station",
    async () => {
      const st = await stationState();
      if (!st.box) return;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: st.box.x, y: st.box.y, id: 3, radiusX: 12, radiusY: 12, force: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    },
    null,
    DELAYS,
  );
}

await suite("DEFAULT VIEW");

// Switch to chase (C) and repeat — chase is where `data-sim-glance` exists.
await page.evaluate(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyC", key: "c", bubbles: true }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyC", key: "c", bubbles: true }));
});
await sleep(2000);
await suite("AFTER ONE PRESS OF C");

await browser.close();
