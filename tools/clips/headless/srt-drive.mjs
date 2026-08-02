// SPEED-RAIN-TRUCK DEEP-DRIVE RIG (doc 87 rows B57, B59-B69, B71, B72).
//
// srt-look.mjs opens a drill and holds W for a fixed number of seconds, which
// answers „what is at the spawn" and nothing else. Half of this lane's rows are
// about furniture that stands 150-350 m down the street — the school at
// sp-zone30-v1 y=196..240, the 30-sign at the sp-creep2-v1 zone boundary,
// the А1 before the sp-curve bend — so a fixed 11 s of throttle photographs the
// approach and reports „not there".
//
// This rig drives to POSITIONS instead. /dev/ghost-demo publishes live
// telemetry on `window.__ghostDemo` (x, y, speed, travelled) — added for
// register B24 — so the driver can:
//   * hold a lane by correcting x toward a target instead of drifting off,
//   * govern speed so the car does not spin on a wet street,
//   * shoot a frame WHEN THE CAR IS AT A GIVEN y, and stamp that y on the name.
//
// A frame named `...-y196-...` is a frame whose position is a measurement, not
// a guess, which is what „look at what you built" needs to mean for a row that
// says „there is no school".
//
//   node srt-drive.mjs --scenario sc-speed-zone --at 60,120,180,210,240 --lane 7
//   node srt-drive.mjs --scenario sc-sp-curve --at 100,160,200 --maxkmh 60
//
// Writes PNGs + a JSON telemetry log under tools/clips/headless/.srt/.

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".srt");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const flag = (n) => argv.includes(`--${n}`);

const BASE = opt("base", "http://localhost:3743");
const SCENARIO = opt("scenario", null);
const LEVEL = opt("level", "1");
const TAG = opt("tag", "d");
const WARM_MS = Number(opt("warm", "18000"));
const MAX_KMH = Number(opt("maxkmh", "42"));
const TIER = opt("tier", "medium");
/** Target lane-centre x, district metres. Empty ⇒ hold whatever x we spawn at. */
const LANE_X = opt("lane", null) === null ? null : Number(opt("lane", "0"));
/** y positions (district metres) to photograph at. */
const AT = (opt("at", "") || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n));
/** Seconds of wall clock before the drive is abandoned. */
const BUDGET_S = Number(opt("budget", "150"));
/** Also press these keys once, right after warm-up (e.g. L for headlights). */
const PRESS = (opt("press", "") || "").split(",").filter(Boolean);

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const log = (m) => process.stderr.write(`[drive] ${m}\n`);

async function telemetry(page) {
  return page.evaluate(() => window.__ghostDemo ?? null).catch(() => null);
}

async function shot(page, name) {
  writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
  log(`  → ${name}.png`);
}

async function main() {
  if (!SCENARIO) {
    console.error("usage: node srt-drive.mjs --scenario <templateId> [--at y1,y2,…]");
    process.exit(64);
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
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
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));

  const url = `${BASE}/dev/ghost-demo?scenario=${encodeURIComponent(SCENARIO)}&level=${LEVEL}`;
  log(`${SCENARIO} L${LEVEL}: loading`);
  await page.goto(url, { waitUntil: "load", timeout: 300_000 });
  await page.waitForSelector("canvas", { timeout: 300_000 });
  await page.waitForTimeout(WARM_MS);

  // `--difficulty Напреднал` clicks the tier pill. It is a DOM button in the
  // scene overlay, so clicking it is safe — a CANVAS click would hit a cockpit
  // hotspot. The tier is the top-speed authority (vehicle/difficulty.ts), so
  // B67 („I can't go more than 100–105") is not answerable on Нормален alone.
  const DIFF = opt("difficulty", null);
  if (DIFF) {
    const pill = page.getByRole("button", { name: DIFF, exact: true });
    if ((await pill.count()) > 0) {
      await pill.first().click({ timeout: 5000 }).catch((e) => log(`pill click failed: ${e}`));
      // Hand focus back to the document: the pill keeps it after a click and
      // the first attempt at this measured 0.0 km/h over 567 samples of held W.
      await page.evaluate(() => {
        const el = document.activeElement;
        if (el && typeof el.blur === "function") el.blur();
      });
      log(`difficulty → ${DIFF}`);
      // A tier change re-seats the drivetrain (the gear read 0 = P right after
      // the switch), so give the car time to be handed over again before W.
      await page.waitForTimeout(6000);
    } else {
      log(`difficulty pill „${DIFF}" NOT FOUND`);
    }
  }

  for (const k of PRESS) {
    await page.keyboard.press(k);
    await page.waitForTimeout(600);
  }

  const t0 = await telemetry(page);
  log(`spawn telemetry: ${JSON.stringify(t0)}`);
  await shot(page, `${TAG}-${SCENARIO}-y${Math.round(t0?.y ?? 0)}-spawn`);

  const targets = [...AT].sort((a, b) => a - b);
  const trace = [];
  const started = Date.now();
  let throttle = false;
  let steer = null;

  const setKey = async (code, want, cur) => {
    if (want === cur) return cur;
    if (want) await page.keyboard.down(code);
    else await page.keyboard.up(code);
    return want;
  };

  while (targets.length > 0 && (Date.now() - started) / 1000 < BUDGET_S) {
    const t = await telemetry(page);
    if (!t) {
      await page.waitForTimeout(300);
      continue;
    }
    trace.push({ ms: Date.now() - started, y: t.y, x: t.x, kmh: t.speedKmh });

    // Governor — a wet street plus full throttle is how the first attempt at
    // this ended on its roof.
    const wantThrottle = t.speedKmh < MAX_KMH;
    if (wantThrottle !== throttle) {
      throttle = await setKey("KeyW", wantThrottle, throttle);
    }

    // Lane hold. Steering is a keypress, so this is bang-bang with a dead band;
    // it only has to keep the car off the kerb for 300 m.
    if (LANE_X !== null) {
      const err = t.x - LANE_X;
      const want = Math.abs(err) < 0.45 ? null : err > 0 ? "KeyA" : "KeyD";
      if (want !== steer) {
        if (steer) await page.keyboard.up(steer);
        if (want) await page.keyboard.down(want);
        steer = want;
      }
    }

    if (t.y >= targets[0]) {
      const y = targets.shift();
      // Let go before the shot so the frame is not mid-correction.
      if (steer) {
        await page.keyboard.up(steer);
        steer = null;
      }
      await page.waitForTimeout(250);
      await shot(page, `${TAG}-${SCENARIO}-y${y}`);
    }
    await page.waitForTimeout(220);
  }

  if (throttle) await page.keyboard.up("KeyW");
  if (steer) await page.keyboard.up(steer);
  const tEnd = await telemetry(page);
  const topKmh = trace.reduce((m, s) => Math.max(m, s.kmh), 0);
  log(`end telemetry: ${JSON.stringify(tEnd)}`);
  log(`TOP SPEED REACHED: ${topKmh.toFixed(1)} km/h over ${trace.length} samples`);
  if (targets.length > 0) log(`NOT REACHED: y=${targets.join(",")} (budget ${BUDGET_S}s)`);

  // Overhead of wherever we stopped — the whole street at once.
  await page.keyboard.press("KeyG");
  await page.waitForTimeout(3500);
  await shot(page, `${TAG}-${SCENARIO}-y${Math.round(tEnd?.y ?? 0)}-overhead`);

  writeFileSync(
    join(OUT, `${TAG}-${SCENARIO}-trace.json`),
    JSON.stringify({ scenario: SCENARIO, level: LEVEL, tier: TIER, trace }, null, 1),
  );
  await browser.close();
}

main().catch((e) => {
  log(`fatal ${e.stack ?? e}`);
  process.exit(1);
});
