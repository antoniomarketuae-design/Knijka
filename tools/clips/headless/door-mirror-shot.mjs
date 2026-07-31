// =============================================================================
// door-mirror-shot.mjs — LOOK AT THE Q/E DOOR-MIRROR WINDOWS (founder item 45).
//
//   node door-mirror-shot.mjs [--base http://localhost:3742] [--quality medium]
//
// Opens /dev/ghost-demo (the real LessonScene, полигон free-drive, cockpit is
// the default camera), then photographs three states:
//
//   rest  — no key down: no window, the permanent centre mirror only
//   q     — Q HELD: a window on the LEFT of the screen
//   e     — E HELD: a window on the RIGHT of the screen
//
// …plus a 2x crop of each window so it can actually be read. Writes PNGs under
// .doormirror/. Reads nothing, changes nothing.
//
// QUALITY MATTERS HERE. The default preset is `medium`, and on medium
// MirrorRig's activeKindsFor() gives the DOOR glass no RTT feed at all — that
// is the founder's "I press E but nothing much is seen". So medium is the shot
// that proves the window, not high.
// =============================================================================

import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".doormirror");

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3742");
const QUALITY = opt("quality", "medium");
const W = Number(opt("width", "1440"));
const H = Number(opt("height", "900"));
const log = (m) => process.stderr.write(`[door-mirror] ${m}\n`);

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

/** Where each window lives, as fractions of the viewport — from
 *  scene/cockpitDoorMirror.ts (height 0.27 × pixel aspect 1.6, margin 0.035,
 *  centre y NDC −0.08). Used only to crop a legible zoom. */
function windowBox(side) {
  const aspect = W / H;
  const hf = 0.27;
  const wf = (hf * 1.6) / aspect;
  const marginX = 0.035 / aspect;
  const cxNdc = (side === "left" ? -1 : 1) * (1 - marginX * 2 - wf);
  const cx = ((cxNdc + 1) / 2) * W;
  const cy = ((1 - -0.24) / 2) * H;
  const w = wf * W;
  const h = hf * H;
  const pad = 26;
  return {
    x: Math.max(0, Math.round(cx - w / 2 - pad)),
    y: Math.max(0, Math.round(cy - h / 2 - pad)),
    width: Math.min(W, Math.round(w + pad * 2)),
    height: Math.min(H, Math.round(h + pad * 2)),
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });
  await context.addInitScript((q) => {
    try {
      window.localStorage.setItem("sim.quality", q);
    } catch {}
  }, QUALITY);
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console.error: ${m.text().slice(0, 200)}`);
  });

  log(`goto ${BASE}/dev/ghost-demo (quality=${QUALITY}, ${W}x${H})`);
  const t0 = Date.now();
  await page.goto(`${BASE}/dev/ghost-demo`, { waitUntil: "load", timeout: 300_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  log(`canvas up after ${((Date.now() - t0) / 1000).toFixed(1)}s — letting the world settle`);
  // The district streams in; the mirror passes need a few frames of a live
  // scene before the target holds anything but the clear colour.
  // The ghost demonstration auto-plays for ~25 s on this route and the player
  // car sits in N until it is done; a proof frame of an empty mirror because
  // the demo was still running is not a proof of anything.
  await page.waitForTimeout(Number(opt("settle", "30000")));

  // The camera published by CameraRig — proves we are in the cockpit and not
  // photographing the chase window by mistake.
  const camera = await page.evaluate(() => document.documentElement.dataset.simCamera ?? null);
  log(`data-sim-camera = ${camera}`);
  await page.focus("canvas").catch(() => {});

  const shoot = async (name, box) => {
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    if (box) await page.screenshot({ path: join(OUT, `${name}-zoom.png`), clip: box });
    log(`shot ${name}`);
  };

  await shoot("rest", null);

  // DRIVE PAST SOMETHING FIRST. A mirror aimed at an empty training ground
  // proves the pass runs; it does not prove the founder can „see whats
  // happening behind". The полигон spawn has parked vehicles and buildings
  // ahead and to the right — hold W long enough to put them BEHIND the car,
  // then look. Belt first so nothing nags mid-drive.
  await page.keyboard.press("b");
  // Gate the selector to D (DRIVELINE_KEYS.gearUp = "]", one gate step per
  // press, clamped at D) — a scene that spawns in N does not move under W, and
  // a proof frame must not depend on which way the spawn happened to land.
  for (let i = 0; i < 3; i += 1) {
    await page.keyboard.press("BracketRight");
    await page.waitForTimeout(220);
  }
  await page.keyboard.down("w");
  await page.waitForTimeout(Number(opt("drive", "9000")));
  await page.keyboard.up("w");
  await page.waitForTimeout(600);
  await shoot("driven-rest", null);

  for (const [key, side] of [
    ["q", "left"],
    ["e", "right"],
  ]) {
    await page.keyboard.down(key);
    // GLANCE_EASE_S plus a couple of pass cadences, so the window is fully open
    // AND the target has been rendered into at least twice.
    await page.waitForTimeout(1600);
    await shoot(key, windowBox(side));
    await page.keyboard.up(key);
    await page.waitForTimeout(900);
  }

  // …and back to rest, to prove the window closes again.
  await shoot("rest-after", null);

  // C → the CHASE camera, then Q again. The chase view has had its own rear
  // window since row B74; this proves the cockpit one does not ALSO appear
  // there, i.e. that a student never gets two mirrors for one glance.
  await page.keyboard.press("c");
  await page.waitForTimeout(1200);
  await page.keyboard.down("q");
  await page.waitForTimeout(1400);
  const chaseCamera = await page.evaluate(
    () => document.documentElement.dataset.simCamera ?? null,
  );
  log(`data-sim-camera = ${chaseCamera} (expect chase)`);
  await shoot("chase-q", null);
  await page.keyboard.up("q");

  await browser.close();
  log(`done → ${OUT}`);
}

main().catch((e) => {
  log(`FAILED: ${e.message}`);
  process.exit(1);
});
