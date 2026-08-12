// -----------------------------------------------------------------------------
// glance-envelope.mjs — THE HEAD TURN, SAMPLED AT FRAME RATE.
//
// `window.__glanceProbe` (CameraRig, dev only) publishes the two numbers the
// camera's head rotation is actually driven by: the mirror `GlanceHold` is
// holding, and its 0..1 envelope. This walks every way a student can ask for a
// glance and records what the envelope did, so „the button does nothing" is a
// curve rather than an opinion.
//
// WHY NOT PIXELS HERE. Pixels are the ground truth and the positive control
// stays pixel-measured in glance-probe.mjs — but a lesson's own overlays take
// the frame at unpredictable moments (measured: 98.8 % of the road changing
// with nothing pressed), and a single late frame cannot tell „never turned"
// from „turned and came home". The envelope can, and it is the same number the
// rotation is built from three lines later.
//
//   node tools/mobile/glance-envelope.mjs --base http://localhost:3200
// -----------------------------------------------------------------------------
import { chromium } from "./lib/pw.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const BASE = arg("base", "http://localhost:3200");
const DEVICE_ID = arg("device", "iphone16-landscape");
const SCENARIO = arg("scenario", "sc-junction-left");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const device = DEVICES[DEVICE_ID];
if (!device) throw new Error(`unknown device ${DEVICE_ID}`);

// The repo's own headless-GL recipe (tools/clips/headless/door-mirror-shot.mjs).
// Without it Chromium falls back to SwiftShader and this scene runs at 0.4 fps —
// measured — which is slower than the 0.9 s hold being measured and therefore
// cannot resolve it.
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const { context, inset } = await newDeviceContext(browser, device, {
  motion: "allow",
  insets: "real",
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);

console.log(`[glance-envelope] ${device.label} · chromium (CDP touch) · ${BASE}`);
console.log(`[glance-envelope] ${insetBanner(device, inset)}`);

await page.goto(`${BASE}/dev/drive-rig?scenario=${SCENARIO}&level=1&readout=0&quality=low`, {
  waitUntil: "domcontentloaded",
  timeout: 240_000,
});
await page.waitForFunction(() => window.__glanceProbe !== undefined, null, { timeout: 300_000 });
await sleep(3000);
console.log(`probe: ${JSON.stringify(await page.evaluate(() => window.__glanceProbe))}`);

/**
 * Start recording the envelope inside the page (rAF, so it is sampled at the
 * rig's own frame rate rather than at a polling script's mercy), run `action`,
 * and return the trace.
 */
async function record(ms) {
  await page.evaluate((duration) => {
    // `setInterval`, NOT `requestAnimationFrame`. rAF is starved on this box
    // (measured: 3 callbacks in 2.6 s), and a sampler slower than the thing it
    // samples cannot tell „never happened" from „happened between my samples".
    // A timer cannot miss a blip either, because `__glanceProbe` is only
    // overwritten on the rig's NEXT frame — so a one-frame glance stays
    // readable for a whole frame period.
    window.__glanceTrace = [];
    window.__glanceFrames = new Set();
    const t0 = performance.now();
    const id = setInterval(() => {
      const p = window.__glanceProbe;
      if (p) window.__glanceFrames.add(p.at);
      window.__glanceTrace.push([
        Math.round(performance.now() - t0),
        p?.mirror ?? null,
        Number((p?.strength ?? 0).toFixed(3)),
      ]);
      if (performance.now() - t0 >= duration) clearInterval(id);
    }, 8);
  }, ms);
}

function summarise(trace) {
  const peak = trace.reduce((m, r) => Math.max(m, r[2]), 0);
  const held = trace.filter((r) => r[2] > 0.5);
  const firstOver = trace.find((r) => r[2] > 0.5);
  const lastOver = held.length ? held[held.length - 1] : null;
  const mirrors = [...new Set(trace.map((r) => r[1]).filter(Boolean))];
  return {
    frames: trace.length,
    peak: peak.toFixed(3),
    mirrors: mirrors.join(",") || "(none)",
    aboveHalfMs: firstOver && lastOver ? lastOver[0] - firstOver[0] : 0,
    firstOverMs: firstOver ? firstOver[0] : null,
  };
}

async function arm(label, action, windowMs = 2600) {
  await sleep(1200);
  await record(windowMs);
  await sleep(80);
  await action();
  await sleep(windowMs + 250);
  const { trace, rigFrames } = await page.evaluate(() => ({
    trace: window.__glanceTrace,
    rigFrames: window.__glanceFrames.size,
  }));
  const s = summarise(trace);
  console.log(
    `\n${label}\n  samples=${s.frames} · RIG FRAMES in the window=${rigFrames}` +
      ` (${(rigFrames / (windowMs / 1000)).toFixed(1)} fps)` +
      `\n  peak envelope=${s.peak} mirror=${s.mirrors}` +
      ` · >0.5 for ${s.aboveHalfMs} ms (first crossed at +${s.firstOverMs ?? "-"} ms)`,
  );
  const nz = trace.filter((r) => r[2] > 0);
  console.log(
    nz.length === 0
      ? "  the envelope NEVER left 0 — the head never started to turn"
      : `  non-zero window: +${nz[0][0]} ms … +${nz[nz.length - 1][0]} ms (${nz[nz.length - 1][0] - nz[0][0]} ms), values ${[...new Set(nz.map((r) => r[2]))].slice(0, 8).join(",")}`,
  );
  return s;
}

async function station(labelBg) {
  return page.evaluate((l) => {
    const b = document.querySelector(`[aria-label="${l}"]`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, labelBg);
}

const L = "Поглед в лявото огледало";

await arm("POSITIVE CONTROL — Q held for 900 ms then released", async () => {
  await page.evaluate(() => window.__driveRig.press("KeyQ"));
  await sleep(900);
  await page.evaluate(() => window.__driveRig.release("KeyQ"));
});

await arm("KEY TAP — Q down+up in the same task (no hold at all)", async () => {
  await page.evaluate(() => {
    window.__driveRig.press("KeyQ");
    window.__driveRig.release("KeyQ");
  });
});

await arm("«Л» — DOM .click()", async () => {
  const ok = await page.evaluate((l) => {
    const b = document.querySelector(`[aria-label="${l}"]`);
    if (!b) return false;
    b.click();
    return true;
  }, L);
  if (!ok) console.log("  ⚠ «Л» was not in the DOM at press time");
});

await arm("«Л» — real CDP touch tap", async () => {
  const box = await station(L);
  if (!box) {
    console.log("  ⚠ «Л» was not in the DOM at press time");
    return;
  }
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: box.x, y: box.y, id: 7, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});

await arm("«Л» — real CDP touch tap WITH A SECOND THUMB ALREADY ON THE GLASS", async () => {
  const box = await station(L);
  if (!box) {
    console.log("  ⚠ «Л» was not in the DOM at press time");
    return;
  }
  const anchor = { x: Math.round(device.width * 0.5), y: Math.round(device.height * 0.5) };
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: anchor.x, y: anchor.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [
      { x: anchor.x, y: anchor.y, id: 1, radiusX: 12, radiusY: 12, force: 1 },
      { x: box.x, y: box.y, id: 8, radiusX: 12, radiusY: 12, force: 1 },
    ],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [{ x: anchor.x, y: anchor.y, id: 1, radiusX: 12, radiusY: 12, force: 1 }],
  });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
});

await browser.close();
