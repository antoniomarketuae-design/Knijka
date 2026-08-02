// =============================================================================
// jsig-look.mjs — LOOK AT the junction & signal lessons, from the driver's seat.
//
// Register 87 rows B24 B25 B27 B28 B32 B34 B36 B38 B40 B44 are all "what does
// the student SEE at this junction" questions — is the sign there, is there
// traffic, where does the green marker sit. Every one of them came back
// UNVERIFIABLE because the only login-free cockpit (/dev/ghost-demo) parks the
// car at the spawn, 100 m short of the junction the complaint is about.
//
// This drives it. `/dev/ghost-demo?scenario=<id>&level=N&objective=K` mounts the
// real LessonScene — DistrictWorld (signs), TrafficLayer (cars), RouteGuidance
// (the green ribbon + marker) — with no auth, and now publishes SimTick on
// `window.__ghostDemo`, so "the car did not move" is a measurement instead of a
// guess (register B24's escalated blocker).
//
//   node jsig-look.mjs [--base http://localhost:3200] [--only <shotId>]
//                      [--out DIR] [--list]
//
// Writes PNGs + a telemetry JSON per shot under tools/clips/headless/.jsig/.
// =============================================================================

import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:3200");
const OUT = opt("out", join(__dirname, ".jsig"));
const ONLY = opt("only", null);
const VIEWPORT = { width: 1280, height: 720 };
const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const log = (m) => process.stderr.write(`[jsig] ${m}\n`);

/**
 * A shot = one scenario rung, one objective, one drive plan.
 *
 * drive: [{ keys:[...], sec:N, shotAfter:"name" }]  — keys held for sec seconds,
 * with a screenshot after each leg. `keys: []` just waits (the car coasts).
 * `cam:"chase"` presses C once before driving (chase ↔ cockpit toggle).
 */
const SHOTS = [
  // --- B24 · catalog 9 „Знак Стоп" — the ribbon must announce the RIGHT turn
  //     BEFORE the stop line, and the drive must actually accumulate distance.
  {
    id: "B24-stop-ribbon-cockpit",
    row: "B24",
    scenario: "sc-junction-stop",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t09-rolling" },
      { keys: ["KeyW"], sec: 5, shot: "t14-approach" },
      { keys: [], sec: 3, shot: "t17-coast" },
      { keys: ["KeyS"], sec: 3, shot: "t20-at-line" },
    ],
  },
  {
    id: "B24-stop-ribbon-chase",
    row: "B24",
    scenario: "sc-junction-stop",
    level: 1,
    objective: 0,
    cam: "chase",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 8, shot: "t11-rolling" },
      { keys: ["KeyS"], sec: 4, shot: "t15-slowed" },
    ],
  },
  // --- B27 / B28 · catalog 12 „Оглеждане" — is the Б2 STOP sign there, and is
  //     there any traffic at all on the priority road, ever.
  {
    id: "B27-scan-signs",
    row: "B27/B28",
    scenario: "sc-junction-scan",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t09-rolling" },
      { keys: ["KeyW"], sec: 5, shot: "t14-near" },
      { keys: ["KeyS"], sec: 3, shot: "t17-atline" },
      { keys: [], sec: 6, shot: "t23-waiting" },
      { keys: [], sec: 6, shot: "t29-waiting2" },
    ],
  },
  // --- B32 · catalog 14 „Стоп и преценка" — „no Signs on the map"
  {
    id: "B32-gap-signs",
    row: "B32",
    scenario: "sc-junction-gap",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t09-rolling" },
      { keys: ["KeyW"], sec: 5, shot: "t14-near" },
      { keys: ["KeyS"], sec: 4, shot: "t18-atline" },
    ],
  },
  // --- B34 · catalog 16 „Ляв завой от Б2" — „no actual street signs anywhere"
  {
    id: "B34-left-signs",
    row: "B34",
    scenario: "sc-junction-left",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t09-rolling" },
      { keys: ["KeyW"], sec: 5, shot: "t14-near" },
      { keys: ["KeyS"], sec: 4, shot: "t18-atline" },
    ],
  },
  // --- B25 · catalog 10 „Светофар" — where does the marker for the SIGNAL
  //     objective sit: before the light, or in the middle of the crossroad.
  {
    id: "B25-signal-marker",
    row: "B25",
    scenario: "sc-signal-response",
    level: 1,
    objective: 1,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 4, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t10-rolling" },
      { keys: ["KeyW"], sec: 4, shot: "t14-near" },
      { keys: ["KeyS"], sec: 4, shot: "t18-atline" },
    ],
  },
  {
    id: "B25-signal-marker-chase",
    row: "B25",
    scenario: "sc-signal-response",
    level: 1,
    objective: 1,
    cam: "chase",
    drive: [
      { keys: [], sec: 4, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 7, shot: "t11-rolling" },
      { keys: ["KeyS"], sec: 4, shot: "t15-slowed" },
    ],
  },
  // --- B44 · catalog 21 „Тръгване на червено-жълто" — the same complaint again
  {
    id: "B44-redyellow-marker",
    row: "B44",
    scenario: "sc-signal-redyellow",
    level: 1,
    objective: 1,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 4, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 6, shot: "t10-rolling" },
      { keys: ["KeyW"], sec: 4, shot: "t14-near" },
      { keys: ["KeyS"], sec: 4, shot: "t18-atline" },
    ],
  },
  {
    id: "B44-redyellow-chase",
    row: "B44",
    scenario: "sc-signal-redyellow",
    level: 1,
    objective: 1,
    cam: "chase",
    drive: [
      { keys: [], sec: 4, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 7, shot: "t11-rolling" },
      { keys: ["KeyS"], sec: 4, shot: "t15-slowed" },
    ],
  },
  // --- B36 · catalog 17 „Загаснал светофар" — does the conflict car cross long
  //     before the player arrives, and is the head visibly DARK.
  {
    id: "B36-dead-timing",
    row: "B36",
    scenario: "sc-signal-dead",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 4, shot: "t07-a" },
      { keys: ["KeyW"], sec: 3, shot: "t10-b" },
      { keys: ["KeyW"], sec: 3, shot: "t13-c" },
      { keys: ["KeyS"], sec: 3, shot: "t16-d" },
      { keys: [], sec: 4, shot: "t20-e" },
    ],
  },
  // --- B38 · catalog 18 „Мигащо жълто" — „no second car, no third car"
  {
    id: "B38-flashing-traffic",
    row: "B38",
    scenario: "sc-signal-flashing",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 4, shot: "t07-a" },
      { keys: ["KeyW"], sec: 3, shot: "t10-b" },
      { keys: ["KeyW"], sec: 3, shot: "t13-c" },
      { keys: ["KeyS"], sec: 3, shot: "t16-d" },
      { keys: [], sec: 5, shot: "t21-e" },
      { keys: [], sec: 5, shot: "t26-f" },
    ],
  },
  // --- B40 · catalog 19 „Спане на зелено" — the third of three sx-v1 signal
  //     lessons in a row. Same spawn, same pose as B36/B38 on purpose: the row
  //     is „it is pretty similar to previous both questions", so the three
  //     frames have to be comparable.
  {
    id: "B40-hesitation-sameness",
    row: "B40",
    scenario: "sc-signal-hesitation",
    level: 1,
    objective: 0,
    cam: "cockpit",
    drive: [
      { keys: [], sec: 3, shot: "t00-spawn" },
      { keys: ["KeyW"], sec: 4, shot: "t07-a" },
      { keys: ["KeyW"], sec: 3, shot: "t10-b" },
      { keys: ["KeyW"], sec: 3, shot: "t13-c" },
      { keys: ["KeyS"], sec: 3, shot: "t16-d" },
      { keys: [], sec: 5, shot: "t21-e" },
    ],
  },
];

async function telemetry(page) {
  return page.evaluate(() => window.__ghostDemo ?? null);
}

async function shootOne(page, shot) {
  const dir = join(OUT, shot.id);
  mkdirSync(dir, { recursive: true });
  const url =
    `${BASE}/dev/ghost-demo?scenario=${shot.scenario}` +
    `&level=${shot.level}&objective=${shot.objective}`;
  const trace = [];
  log(`${shot.id}: ${url}`);
  await page.goto(url, { waitUntil: "load", timeout: 600_000 });
  // The scene mounts through a dynamic import + rapier wasm + district build.
  await page.waitForSelector("canvas", { timeout: 600_000 });
  // Wait until the sim is actually ticking — that is the real ready signal.
  await page.waitForFunction(() => window.__ghostDemo != null, undefined, {
    timeout: 600_000,
  });
  await page.waitForTimeout(2500);
  // Focus the canvas so the key listener (window-level, but the page must be
  // focused) receives the presses.
  await page.locator("canvas").first().click({ position: { x: 640, y: 620 } });
  await page.waitForTimeout(400);

  if (shot.cam === "chase") {
    await page.keyboard.press("KeyC");
    await page.waitForTimeout(1200);
  }

  let idx = 0;
  for (const leg of shot.drive) {
    for (const k of leg.keys) await page.keyboard.down(k);
    // Sample while the leg runs so a "the car never moved" claim is a series.
    const end = Date.now() + leg.sec * 1000;
    while (Date.now() < end) {
      await page.waitForTimeout(700);
      const t = await telemetry(page);
      if (t) trace.push({ leg: leg.shot, keys: leg.keys.join("+"), ...t });
    }
    for (const k of leg.keys) await page.keyboard.up(k);
    const t = await telemetry(page);
    const name = `${String(idx).padStart(2, "0")}-${leg.shot}.png`;
    writeFileSync(join(dir, name), await page.screenshot());
    log(
      `  ${name}  y=${t?.y?.toFixed(1)} x=${t?.x?.toFixed(1)} ` +
        `v=${t?.speedKmh?.toFixed(1)} km/h travelled=${t?.travelledM?.toFixed(1)} m`,
    );
    idx += 1;
  }
  writeFileSync(
    join(dir, "telemetry.json"),
    JSON.stringify({ shot: shot.id, row: shot.row, url, trace }, null, 1),
  );
}

async function main() {
  if (flag("list")) {
    for (const s of SHOTS) console.log(`${s.id}\t${s.row}\t${s.scenario} L${s.level} obj${s.objective}`);
    return;
  }
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") log(`console.error: ${m.text().slice(0, 200)}`);
  });
  for (const shot of SHOTS) {
    if (ONLY && shot.id !== ONLY && shot.row !== ONLY) continue;
    try {
      await shootOne(page, shot);
    } catch (e) {
      log(`${shot.id}: FAILED ${e.message}`);
    }
  }
  await browser.close();
}

main().catch((e) => {
  log(`fatal ${e.stack ?? e}`);
  process.exit(1);
});
