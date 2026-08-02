// PARK10 LOOK RIG (doc 66 R0 — „fixed" without a frame is not fixed).
//
// Opens each parking-depth drill in the REAL cockpit through
// /dev/ghost-demo?scenario=<id>&level=N, waits for the scene to settle, and
// writes a cockpit frame plus an overhead frame (G) so the bay row, the van,
// the wall, the zebra and the В27 post can be looked at rather than asserted.
//
//   node park10-look.mjs [--base http://localhost:3741] [--only sc-park-van]
//
// Writes PNGs under tools/clips/headless/.park10/.

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".park10");

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3741");
const ONLY = opt("only", null);
const LEVEL = opt("level", "1");

const DRILLS = [
  "sc-park-gap-short",
  "sc-park-gap-long",
  "sc-park-van",
  "sc-park-45-rev",
  "sc-park-left",
  "sc-park-zebra",
  "sc-park-wall",
  "sc-park-night",
  "sc-park-double",
  "sc-park-judge",
];

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const log = (m) => process.stderr.write(`[park10] ${m}\n`);

/**
 * The interesting frame is the END of the shadow drive — the car IN the bay,
 * with the whole row in shot. At 14 s of wall clock the L1 ghost is still on
 * the approach road and every drill's overhead looks like every other drill's
 * approach road, which is exactly the „district recolour" mistake seen from
 * the wrong second. So: wait out the demo (33–50 s of playback), then shoot.
 */
async function shoot(page, id) {
  const url = `${BASE}/dev/ghost-demo?scenario=${encodeURIComponent(id)}&level=${LEVEL}`;
  log(`${id}: loading`);
  await page.goto(url, { waitUntil: "load", timeout: 300_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  await page.waitForTimeout(Number(opt("warm", "14000")));
  // DRIVE IT. The ghost plays, the ego does not: parked at the spawn, every
  // drill's cockpit shows the same 90 m approach road, which is precisely the
  // frame that cannot tell ten situations apart. So hold W up the approach
  // (residential 20 km/h) until the car is level with the bay row.
  // NO canvas click: the cabin is clickable (doc 87 FR-25) and a click in the
  // middle of the screen lands on a cockpit hotspot, which swings the view
  // round to the seat back. Keys go to the document, which is where the sim's
  // input listener lives.
  await page.keyboard.down("KeyW");
  // ~11 s of full throttle ≈ 110 m on the „Нормален" tier (50 km/h cap): the
  // spawn is 105 m south of the bay row. 26 s put the car 90 m past the end of
  // the aisle and off the world, which is what the seat-back frames were.
  // lot-night-v1's approach is 60 m, every other lot's is 90.
  await page.waitForTimeout(id === "sc-park-night" ? 8_000 : Number(opt("drive", "11000")));
  await page.keyboard.up("KeyW");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(2200);
  await page.keyboard.up("KeyS");
  await page.waitForTimeout(1200);
  writeFileSync(join(OUT, `${id}-cockpit.png`), await page.screenshot());
  // G = the overhead „виж мястото отгоре" camera: the whole bay row at once.
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(4000);
  writeFileSync(join(OUT, `${id}-overhead.png`), await page.screenshot());
  log(`${id}: written`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.quality", "high");
    } catch {}
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console: ${m.text().slice(0, 200)}`);
  });
  for (const id of DRILLS) {
    if (ONLY && id !== ONLY) continue;
    try {
      await shoot(page, id);
    } catch (e) {
      log(`${id}: FAILED ${e.message}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  log(`fatal ${e.stack ?? e}`);
  process.exit(1);
});
