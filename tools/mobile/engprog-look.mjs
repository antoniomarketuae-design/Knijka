// -----------------------------------------------------------------------------
// engprog-look.mjs — THROWAWAY look rig for the ENGINE-PROGRESSION lane.
//
// Three questions, one signed-in session, PNGs on disk:
//
//   1. B-NEW-1 — park a scenario at spawn, touch nothing for 75 s, and record
//      whether the session ends itself. (`--case parked`)
//   2. B24 — hold the throttle and sample the HUD: does distance accumulate,
//      does the objective advance, does the car's own position move?
//      (`--case drive`)
//   3. C7 — desktop cockpit: how many speed readouts are on the glass.
//      (`--case c7`)
//   4. C1/C2 — mobile portrait landing band. (`--case mobile`)
//
// Not committed as tooling; delete with the lane's scratch dir.
//   node engprog-look.mjs --case parked --scenario sc-roundabout-entry --level 1
// -----------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, ".engprog");
const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const BASE = opt("base", "http://localhost:3771");
const CASE = opt("case", "parked");
const SCENARIO = opt("scenario", "sc-roundabout-entry");
const LEVEL = opt("level", "1");
const SECONDS = Number(opt("seconds", "75"));
const log = (m) => process.stderr.write(`[engprog] ${m}\n`);

const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

/** Read the things the register argues about, straight off the DOM. */
const PROBE = `(() => {
  const txt = (sel) => Array.from(document.querySelectorAll(sel)).map((e) => (e.innerText || "").trim());
  const seen = (sel) => Array.from(document.querySelectorAll(sel)).filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(e).display !== "none";
  });
  const rect = (e) => { const r = e.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), x: +r.x.toFixed(1), y: +r.y.toFixed(1) }; };
  const body = document.body.innerText || "";
  const speeds = Array.from(document.querySelectorAll("[aria-label]"))
    .filter((e) => /^Скорост \\d/.test(e.getAttribute("aria-label") || ""))
    .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; })
    .map((e) => ({ label: e.getAttribute("aria-label"), ...rect(e) }));
  return {
    ended: /Разбор|Резултат|Издържан|Неиздържан|Край на маршрута|Прекратена сесия/.test(body),
    endBadge: txt('[data-sim-overlay="end"]').slice(0, 2),
    task: (txt('[data-hud="objective-stack"]')[0] || "").slice(0, 160),
    bodyHead: body.slice(0, 420).replace(/\\n+/g, " | "),
    speedReadouts: speeds,
    speedText: speeds.map((s) => s.label),
    guidance: (txt('[data-hud="guidance-distance"]')[0] || null),
    audioPrompt: seen('[data-hud="audio-prompt"]').map(rect),
    audioDismiss: seen('[data-hud="audio-prompt"] button').map((e) => ({ text: e.innerText.trim(), ...rect(e) })),
    touchHint: seen('[data-hud="touch-hint"]').map(rect),
    difficulty: seen('[data-hud="difficulty"]').map(rect),
    overlay: seen("[data-sim-overlay]").map((e) => ({ kind: e.getAttribute("data-sim-overlay"), ...rect(e) })),
  };
})()`;

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { email, password } = await ensureHarnessUser();
  const browser = await chromium.launch({ args: GL });
  const mobile = CASE === "mobile";
  const ctx = await browser.newContext(
    mobile
      ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") log(`console.error ${m.text().slice(0, 160)}`);
  });
  await signIn(page, { email, password }, BASE);

  const url = `${BASE}/simulator?scenario=${SCENARIO}&level=${LEVEL}`;
  log(`goto ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
  // The canvas is the thing being measured — wait for it, then let the world load.
  await page.waitForSelector("canvas", { timeout: 300_000 });
  await page.waitForTimeout(20_000);

  const shot = async (tag) => {
    const p = join(OUT, `${CASE}-${SCENARIO}-L${LEVEL}-${tag}.png`);
    await page.screenshot({ path: p });
    return p;
  };
  const sample = async (tag) => {
    const s = await page.evaluate(PROBE);
    log(`${tag}: ${JSON.stringify(s)}`);
    return s;
  };

  await sample("t0");
  log(await shot("t0"));

  if (CASE === "drive") {
    // Hold the throttle. Key events only — exactly what a student's keyboard
    // does, and what the register's "scripted drive" claimed to do.
    // Chase camera: the DOM speed readout only exists outside the cockpit
    // (row C7), and the register's evidence for B24 is a HUD speed series.
    await page.keyboard.press("c");
    await page.waitForTimeout(2000);
    await page.mouse.click(720, 500); // focus the canvas so keys reach the rig
    await page.keyboard.down("w");
    for (let i = 1; i <= 10; i++) {
      await page.waitForTimeout(3000);
      await sample(`drive+${i * 3}s`);
      if (i % 3 === 0) log(await shot(`drive-${i * 3}s`));
    }
    await page.keyboard.up("w");
    log(await shot("driven"));
  } else if (CASE === "parked") {
    const step = 15_000;
    for (let t = step; t <= SECONDS * 1000; t += step) {
      await page.waitForTimeout(step);
      const s = await sample(`t+${t / 1000}s`);
      if (s.ended) {
        log(`*** SESSION ENDED BY ITSELF at ~${t / 1000}s`);
        log(await shot(`ended-${t / 1000}s`));
        break;
      }
    }
    log(await shot("final"));
  } else if (CASE === "teach") {
    // B24, the separation the register asked for: drive until the first teach
    // card freezes the sim, dismiss it, and see whether the drive RESUMES from
    // where it stopped or is rewound.
    await page.keyboard.press("c");
    await page.waitForTimeout(2000);
    await page.mouse.click(720, 500);
    await page.keyboard.down("w");
    for (let i = 1; i <= 4; i++) {
      await page.waitForTimeout(2500);
      await sample(`pre+${i * 2.5}s`);
    }
    log(await shot("frozen"));
    // Dismiss and keep the throttle down.
    await page.keyboard.press("Space");
    await page.waitForTimeout(1500);
    await sample("dismissed");
    log(await shot("dismissed"));
    for (let i = 1; i <= 8; i++) {
      await page.waitForTimeout(2500);
      await sample(`post+${i * 2.5}s`);
    }
    await page.keyboard.up("w");
    log(await shot("resumed"));
  } else if (CASE === "c7") {
    // The camera cycle: cockpit (default) → chase → top-down. The DOM readout
    // must fold in the cockpit (the 3D cluster draws it) and come back in the
    // other two, where the cluster is not in frame at all.
    log(await shot("cockpit"));
    await page.keyboard.press("c");
    await page.waitForTimeout(2500);
    await sample("chase");
    log(await shot("chase"));
    await page.keyboard.press("c");
    await page.waitForTimeout(2500);
    await sample("topdown");
    log(await shot("topdown"));
  } else {
    log(await shot("look"));
  }

  await sample("end");
  await browser.close();
}

main().catch((e) => {
  log(`FAILED ${e?.stack || e}`);
  process.exit(1);
});
