// SPEED-RAIN-TRUCK LOOK RIG (doc 87 rows B57, B59-B69, B71, B72).
//
// Opens a drill in the REAL cockpit through /dev/ghost-demo?scenario=<id>&level=N
// — no login, no recorded trace — drives it forward for a while, and writes
// frames a human can open. Doc 66 R0: „fixed" without a frame is not fixed.
//
//   node srt-look.mjs --base http://localhost:3743 --only sc-follow-rain-gap
//   node srt-look.mjs --lights            (rain rows: shoot lights-OFF then L, lights-ON)
//
// Writes PNGs under tools/clips/headless/.srt/.

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".srt");

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = opt("base", "http://localhost:3743");
const ONLY = opt("only", null);
const LEVEL = opt("level", "1");
const WARM_MS = Number(opt("warm", "16000"));
const DRIVE_MS = Number(opt("drive", "9000"));
const TAG = opt("tag", "");

/** Every drill this lane owns, in doc-87 row order. */
const DRILLS = [
  "sc-speed-creep", // B57  — „no actual Sign stating 30 … just written on the road"
  "sc-speed-zone", // B59/60/61 — school zone: sign, kids, school building
  "sc-speed-transition", // B62/63 — 50→30, and „same as 31"
  "sc-sp-harsh-brake", // B64/65 — „stopping out of nowhere, but why?" + raw map
  "sc-sp-curve", // B66  — „no sign exists, not 90 not 50 … should be A1"
  "sc-mw-discipline", // B67  — „I cant go more than 100-105"
  "sc-follow-distance", // B68  — regression
  "sc-follow-brake", // B69  — regression
  "sc-follow-rain-gap", // B71  — RAIN + headlights (the priority row)
  "sc-follow-truck", // B72  — the truck's matchPlayer rubber band
];

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const log = (m) => process.stderr.write(`[srt] ${m}\n`);

/** Read the live speed off the DOM cluster (the roomy StatusDashboard). */
async function readSpeed(page) {
  return page
    .evaluate(() => {
      const t = document.body?.innerText ?? "";
      const m = [...t.matchAll(/(\d+)\s*км\/ч/g)].map((x) => Number(x[1]));
      return m;
    })
    .catch(() => []);
}

async function shot(page, name) {
  const f = join(OUT, `${name}.png`);
  writeFileSync(f, await page.screenshot());
  log(`  → ${name}.png`);
}

async function open(page, id, level) {
  const url = `${BASE}/dev/ghost-demo?scenario=${encodeURIComponent(id)}&level=${level}`;
  log(`${id} L${level}: loading`);
  await page.goto(url, { waitUntil: "load", timeout: 300_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  await page.waitForTimeout(WARM_MS);
}

async function shoot(page, id) {
  const pre = TAG ? `${TAG}-` : "";
  await open(page, id, LEVEL);
  await shot(page, `${pre}${id}-L${LEVEL}-spawn`);

  // Drive. Keys go to the document (the sim's input listener); NEVER click the
  // canvas — the cabin is clickable and a centre click hits a cockpit hotspot.
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(DRIVE_MS);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(900);
  const speeds = await readSpeed(page);
  log(`  speeds on screen: ${JSON.stringify(speeds)}`);
  await shot(page, `${pre}${id}-L${LEVEL}-drive`);

  // Overhead („виж мястото отгоре" G) — the whole street at once: signs on the
  // verge, kerb furniture, whether a school/kids exist at all.
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(3500);
  await shot(page, `${pre}${id}-L${LEVEL}-overhead`);
  return speeds;
}

/**
 * The B71 protocol: the SAME pose photographed lights-OFF → ON → OFF, in BOTH
 * the cockpit and the exterior view.
 *
 * Why the car is stopped for the A/B: the founder's claim is „we turn them on
 * and nothing changes". A pair shot while rolling changes the pose as well as
 * the lamps, so any difference is unattributable. Stopped, the ONLY variable
 * between two consecutive frames is the L keypress — which is what makes the
 * OFF→ON→OFF triple a measurement rather than an impression.
 */
async function shootLights(page, id) {
  const pre = TAG ? `${TAG}-` : "";
  await open(page, id, LEVEL);
  await shot(page, `${pre}${id}-L${LEVEL}-A-spawn-lights-off`);
  // NO driving between the OFF and ON frames. A pair shot while rolling changes
  // the pose as well as the lamps, so any difference is unattributable — and
  // hard throttle+brake on a wet street put the car on its roof, which is how
  // the first attempt at this pair was lost. Stationary at spawn, the ONLY
  // variable between two consecutive frames is the L keypress.
  await shot(page, `${pre}${id}-L${LEVEL}-B-cockpit-OFF`);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(2600);
  await shot(page, `${pre}${id}-L${LEVEL}-C-cockpit-ON`);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(2600);
  await shot(page, `${pre}${id}-L${LEVEL}-D-cockpit-OFF-again`);

  // Exterior („изглед: кокпит / отвън / отгоре" — C). The lamps themselves are
  // only ever visible from outside; from the cockpit the student sees the beam
  // pool, never the headlight.
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(3000);
  await shot(page, `${pre}${id}-L${LEVEL}-E-exterior-OFF`);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(2600);
  await shot(page, `${pre}${id}-L${LEVEL}-F-exterior-ON`);
  await page.keyboard.press("KeyL");
  await page.waitForTimeout(2600);
  await shot(page, `${pre}${id}-L${LEVEL}-G-exterior-OFF-again`);

  // Back to the cockpit and roll, lights ON — „does it still read as rain once
  // the world is moving past you" is a different question from the still.
  await page.keyboard.press("KeyC");
  await page.keyboard.press("KeyC");
  await page.waitForTimeout(1500);
  await page.keyboard.press("KeyL");
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(4500);
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(1200);
  await shot(page, `${pre}${id}-L${LEVEL}-H-cockpit-rolling-ON`);
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  // Pin the render tier.
  //
  // ⚠ Writing `sim.quality` alone does NOT pin what this harness renders:
  // `sim.quality` is QUALITY_STORAGE_KEY (lesson-ui/types) and only the REAL
  // /simulator shell reads it — /dev/ghost-demo hardcodes quality="medium" into
  // LessonScene. The environment module keeps its own key,
  // `aidrive.sim.quality.v1` ({setting,recommendation}), which HeroCarBody /
  // VehicleRig / MirrorRig gate their own cost on. Both are written here.
  // It MATTERS which tier a rain frame is shot at: QUALITY_PRESETS.low
  // .rainParticles === 0 — at `low` there is no rain in the world at all.
  const TIER = opt("tier", "medium"); // low | medium | high
  await context.addInitScript((tier) => {
    try {
      const envTier = tier === "medium" ? "med" : tier;
      window.localStorage.setItem(
        "aidrive.sim.quality.v1",
        JSON.stringify({ setting: envTier, recommendation: envTier }),
      );
      window.localStorage.setItem("sim.quality", tier);
    } catch {}
  }, TIER);
  log(`tier pinned: ${TIER} (note: /dev/ghost-demo passes quality="medium" to LessonScene)`);
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console: ${m.text().slice(0, 200)}`);
  });
  for (const id of DRILLS) {
    if (ONLY && id !== ONLY) continue;
    try {
      if (flag("lights")) await shootLights(page, id);
      else await shoot(page, id);
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
