// GIVE-WAY / ROUNDABOUT LOOK RIG (doc 66 R0 — „fixed" without a frame is not fixed).
//
// Opens a scenario rung (or an authored lesson) in the REAL cockpit through
// /dev/gw-shell (LessonPlayShell — banner, objectives, fault cards) or
// /dev/ghost-demo (bare LessonScene), plays a scripted timeline of key holds
// and screenshots, and dumps the visible HUD TEXT next to every frame so a
// verdict can quote what was on screen instead of paraphrasing it.
//
//   node gw-probe.mjs --plan <plan.json> [--base http://localhost:3745]
//
// Plan shape:
//   { "out": "B29", "url": "/dev/gw-shell?scenario=…&level=1",
//     "warmMs": 12000, "viewport": [1280,720],
//     "blockServerActions": true,                 // default; see main()
//     "steps": [ {"hold":"KeyW","ms":4000}, {"press":"KeyE"},
//                {"down":"KeyE"}, {"wait":1500},
//                {"shot":"t12-glance-right","clip":[640,120,640,480]},
//                {"up":"KeyE"} ] }
//
// Steps: `hold` (down → wait → up, self-contained), `down`/`up` (a hold that
// OUTLIVES the step, so a frame can be shot mid-glance — Q/E/F are hold-to-
// look), `press`, `click` (by visible text), `wait`, `shot` (+ optional `clip`
// crop).
//
// Every `shot` writes <out>-<name>.png AND appends the page's visible text —
// plus `window.__ghostDemo` telemetry when the route publishes it — to
// <out>-hud.txt, tagged with the frame name. Nothing here is clever: it is a
// keyboard and a camera.

import { chromium } from "./pw.mjs";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, isAbsolute } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : def;
};
const BASE = opt("base", "http://localhost:3745");
const PLAN_PATH = opt("plan", null);
const OUT_DIR = opt("outdir", join(__dirname, ".gw"));
if (!PLAN_PATH) {
  console.error("usage: node gw-probe.mjs --plan <plan.json> [--base URL] [--outdir DIR]");
  process.exit(64);
}

const GL_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
];

const t0 = Date.now();
const log = (m) => process.stderr.write(`[gw +${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}\n`);

const plan = JSON.parse(readFileSync(isAbsolute(PLAN_PATH) ? PLAN_PATH : join(process.cwd(), PLAN_PATH), "utf8"));
const OUT = plan.outdir ? plan.outdir : OUT_DIR;
mkdirSync(OUT, { recursive: true });
const HUD_LOG = join(OUT, `${plan.out}-hud.txt`);
writeFileSync(HUD_LOG, `# ${plan.out}\n# ${BASE}${plan.url}\n# ${new Date().toISOString()}\n`);

async function hudText(page) {
  try {
    return await page.evaluate(() => {
      const t = document.body?.innerText ?? "";
      return t.replace(/\n{3,}/g, "\n\n").slice(0, 4000);
    });
  } catch (e) {
    return `<hud read failed: ${e.message}>`;
  }
}

/**
 * /dev/ghost-demo publishes per-tick drive telemetry on `window.__ghostDemo`
 * (t, speedKmh, x, y, headingDeg, gear, travelledM). Dumping it beside every
 * frame turns „the car looks like it is near the line" into a coordinate — and
 * a coordinate is what a give-way verdict needs, because the whole question is
 * where you were standing when you looked. Absent on other routes; harmless.
 */
async function telemetry(page) {
  try {
    const t = await page.evaluate(() => window.__ghostDemo ?? null);
    return t ? `[telemetry] ${JSON.stringify(t)}\n` : "";
  } catch {
    return "";
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  const [w, h] = plan.viewport ?? [1280, 720];
  const context = await browser.newContext({
    viewport: { width: w, height: h },
    deviceScaleFactor: 1,
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.quality", "high");
    } catch {}
  });

  /**
   * BLOCK SERVER ACTIONS — without this the rig cannot photograph the shell.
   *
   * MEASURED 2026-08-02, not assumed. /dev/gw-shell is NOT in proxy.ts's
   * matcher, so `GET /dev/gw-shell?...` answers 200 with the real
   * LessonPlayShell. But the shell imports three server actions from
   * (dashboard)/simulator, and one of them fires from a mount effect. That POST
   * DOES hit an authed path, `requireUser()` redirects it, and Next follows the
   * action's 303 by navigating the WHOLE PAGE to /login — about 20 s after the
   * canvas is already up. Every frame after that is the login card. Three rows
   * in doc 87 (B5, B19, B22) were filed „three dev servers died first / never
   * reached" against exactly this, and the symptom looks nothing like its
   * cause: the route is fine, the compile is fine, the scene mounts, and then
   * the page walks away from it.
   *
   * Aborting requests that carry the `Next-Action` header leaves the mounted
   * scene exactly as it is. Nothing a look-rig needs is on the other side of
   * those calls — they persist a finished attempt, fetch a micro-quiz deck and
   * record a self-prediction; the drive, the HUD, the objectives and the fault
   * cards are all client-side. Set `"blockServerActions": false` in a plan that
   * genuinely needs the round-trip (and then bring a session cookie).
   */
  if (plan.blockServerActions !== false) {
    await context.route("**/*", async (route) => {
      const h = route.request().headers();
      if (h["next-action"]) {
        log(`blocked server action → ${route.request().url()}`);
        await route.abort();
        return;
      }
      await route.continue();
    });
  }

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => {
    errors.push(`pageerror: ${e.message}`);
    log(`pageerror: ${e.message.slice(0, 160)}`);
  });
  page.on("console", (m) => {
    if (m.type() === "error") {
      errors.push(`console: ${m.text().slice(0, 300)}`);
    }
  });

  log(`goto ${plan.url}`);
  await page.goto(`${BASE}${plan.url}`, { waitUntil: "load", timeout: 600_000 });
  await page.waitForSelector("canvas", { timeout: 600_000 });
  log(`canvas up; warm ${plan.warmMs ?? 12000}ms`);
  await page.waitForTimeout(plan.warmMs ?? 12000);

  let shotN = 0;
  for (const step of plan.steps) {
    if (step.shot !== undefined) {
      shotN += 1;
      const name = `${plan.out}-${String(shotN).padStart(2, "0")}-${step.shot}`;
      const png = join(OUT, `${name}.png`);
      // `clip` = [x, y, w, h] in CSS px — a zoom crop, for reading a sign or a
      // sightline at pixel scale instead of squinting at a 1280-wide frame.
      const shotOpts = Array.isArray(step.clip)
        ? { clip: { x: step.clip[0], y: step.clip[1], width: step.clip[2], height: step.clip[3] } }
        : {};
      writeFileSync(png, await page.screenshot(shotOpts));
      const txt = await hudText(page);
      const tel = await telemetry(page);
      appendFileSync(HUD_LOG, `\n===== ${name} =====\n${tel}${txt}\n`);
      log(`shot ${name}${tel ? ` ${tel.trim()}` : ""}`);
      continue;
    }
    if (step.click !== undefined) {
      // Click a DOM element by visible text (shell buttons: „Продължи", „Старт").
      try {
        await page.getByText(step.click, { exact: false }).first().click({ timeout: 5000 });
        log(`clicked "${step.click}"`);
      } catch (e) {
        log(`click "${step.click}" FAILED: ${e.message.slice(0, 120)}`);
        appendFileSync(HUD_LOG, `\n!! click "${step.click}" failed: ${e.message.slice(0, 200)}\n`);
      }
      continue;
    }
    if (step.press !== undefined) {
      await page.keyboard.press(step.press);
      log(`press ${step.press}`);
      continue;
    }
    if (step.hold !== undefined) {
      const keys = Array.isArray(step.hold) ? step.hold : [step.hold];
      for (const k of keys) await page.keyboard.down(k);
      await page.waitForTimeout(step.ms ?? 1000);
      for (const k of keys) await page.keyboard.up(k);
      log(`hold ${keys.join("+")} ${step.ms ?? 1000}ms`);
      continue;
    }
    // `down` / `up` — a hold that OUTLIVES the step, so a frame can be shot
    // WHILE the key is still down. The mirror glances (Q/E/F) are hold-to-look
    // (cabin.ts GlanceHold): `hold` releases before the next step runs, so it
    // can never photograph what the driver sees mid-glance. doc 87 B29/B30 are
    // exactly that question ("I stopped and looked right and saw nothing"), so
    // the rig has to be able to hold the look and shoot it.
    if (step.down !== undefined) {
      for (const k of Array.isArray(step.down) ? step.down : [step.down]) await page.keyboard.down(k);
      log(`down ${step.down}`);
      continue;
    }
    if (step.up !== undefined) {
      for (const k of Array.isArray(step.up) ? step.up : [step.up]) await page.keyboard.up(k);
      log(`up ${step.up}`);
      continue;
    }
    if (step.wait !== undefined) {
      await page.waitForTimeout(step.wait);
      continue;
    }
    log(`unknown step ${JSON.stringify(step)}`);
  }

  appendFileSync(HUD_LOG, `\n===== ERRORS (${errors.length}) =====\n${errors.slice(0, 40).join("\n")}\n`);
  await browser.close();
  log(`done — ${shotN} frames in ${OUT}`);
}

main().catch((e) => {
  log(`fatal ${e.stack ?? e}`);
  process.exit(1);
});
