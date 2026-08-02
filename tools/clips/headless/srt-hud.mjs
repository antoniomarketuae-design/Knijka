// srt-hud.mjs — the lights A/B through /dev/hud-ux, which mounts the REAL
// LessonPlayShell (the StatusDashboard bar with the „КЪСИ" telltale).
//
// WHY A SECOND HARNESS. /dev/ghost-demo mounts a bare <LessonScene>. The
// headlight TELLTALE a student actually reads lives in hud/StatusDashboard.tsx,
// mounted by LessonPlayShell — so a ghost-demo frame can show the beam on the
// road and the lamps on the car and still not answer „does the cockpit tell me
// they are on".
//
// WHY ONE LOAD PER FRAME. /dev/hud-ux is not in the proxy's auth matcher and
// serves 200, but ~7 s after hydration the mounted shell client-navigates to
// /login, so an unauthenticated harness renders the whole cockpit and then
// loses it. Aborting the /login request does not help — the client router has
// already moved. So each frame is its own page load: warm ~4.5 s, send the L
// key N times, shoot at ~6 s. Deterministic, and it never needs a session.
//
// THE PRESS COUNT IS NOT THE LAMP STATE. L cycles off → low → high → off
// (cabin.ts:381) and a rain/night/fog lesson handed over „ready" now spawns
// already on „low" (initialHeadlightsFor). The state is therefore READ off the
// HUD's own aria-label and stamped into the filename.
//
//   node srt-hud.mjs --base http://localhost:3743 --scenario sc-follow-rain-gap
//
// Writes PNGs under tools/clips/headless/.srt/.

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
const BASE = opt("base", "http://localhost:3743");
const SCENARIO = opt("scenario", "sc-follow-rain-gap");
const TAG = opt("tag", "hud");
const QUALITY = opt("quality", "medium");
/** ms after load before the keys are sent — the shell renders the cockpit at
 *  ~4 s on a warm server and drops to /login at ~7 s. */
const SETTLE_MS = Number(opt("settle", "4300"));
const PRESSES = (opt("presses", "0,1,2") || "").split(",").map(Number);
/** Extra keys pressed once with the L presses (e.g. T for wipers). */
const ALSO = (opt("also", "") || "").split(",").filter(Boolean);

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];
const log = (m) => process.stderr.write(`[hud] ${m}\n`);

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, args: GL_ARGS });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
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
}, QUALITY);

const url = `${BASE}/dev/hud-ux?scenario=${encodeURIComponent(SCENARIO)}&quality=${QUALITY}`;

for (const n of PRESSES) {
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`pageerror: ${e.message}`));
  // The shell fires a SERVER ACTION (a POST to its own route) a few seconds in
  // — the lesson-start wire — and that action calls requireUser(), which
  // redirects an anonymous caller to /login and takes the cockpit with it.
  // Aborting the action POST keeps the page. It touches nothing the scene
  // renders: what is lost is server-side attempt persistence, which a look-rig
  // must not be writing anyway. No session, no credentials, purely local.
  await page.route(
    (u) => u.pathname.startsWith("/dev/hud-ux"),
    (route) => (route.request().method() === "POST" ? route.abort() : route.continue()),
  );
  await page.goto(url, { waitUntil: "commit", timeout: 900_000 });
  // Act the MOMENT the dashboard exists rather than on a fixed delay: the
  // window between „cockpit is up" and „client-navigated to /login" is only a
  // few seconds and it moves with how warm the server is.
  await page
    .waitForSelector('[aria-label^="Светлини"]', { timeout: 300_000 })
    .catch(() => log("dashboard never appeared"));
  await page.waitForTimeout(SETTLE_MS);
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("KeyL");
    await page.waitForTimeout(140);
  }
  for (const k of ALSO) await page.keyboard.press(k);
  await page.waitForTimeout(1200);
  const state = await page
    .evaluate(() => {
      const el = document.querySelector('[aria-label^="Светлини"]');
      return el?.getAttribute("aria-label") ?? "(no dashboard)";
    })
    .catch(() => "(unreadable)");
  const slug = state.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 40);
  const name = `${TAG}-${SCENARIO}-L${n}-${slug}`;
  writeFileSync(join(OUT, `${name}.png`), await page.screenshot());
  log(`L×${n} → ${state}   → ${name}.png   (url ${page.url()})`);
  await page.close();
}

await browser.close();
