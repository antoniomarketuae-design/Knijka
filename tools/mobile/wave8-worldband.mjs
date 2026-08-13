// =============================================================================
// wave8-worldband.mjs — WHAT PORTRAIT ACTUALLY GETS, in pixels of ROAD.
//
// The redesign has to answer „should the rotate-nag go". That question is not
// about the HUD: doc 91 §N6 („in portrait the 3D view is a horizontal band with
// black above and below") is still marked UNEXPLAINED AND UNMEASURED, and the
// panel-open screenshot from this wave shows exactly that — a portrait frame
// whose top third is headliner and whose bottom half is dashboard.
//
// A DOM rect cannot see it: the <canvas> is 393x852 and „94 % of the stage is
// canvas" is true and useless. So this walks the canvas in horizontal bands and
// classifies each as WORLD (bright AND textured) or CABIN (dark or flat), using
// the harness's own WORLD_FRAME thresholds — the same instrument wave 6 used,
// pointed at the question wave 8 has to answer.
//
// Reported per orientation: the largest contiguous run of world bands, in px
// and as a share of the canvas. THAT is the number the rotate-nag lives or dies
// by, and it is comparable across orientations, which a DOM rect is not.
//
//   node wave8-worldband.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices, DEVICES } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { frameVitals } from "./lib/ready.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave8-census`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--block-fullscreen"];

const browser = await chromium.launch({ args: GL });
console.log("[w8-world] CHROMIUM — a luma measurement of a WebGL frame, not a layout claim; the DOM numbers in this wave are WebKit.");
const devices = resolveDevices(null);
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

const results = [];
const RUNS = [
  ...devices.map((d) => ({ id: d.id, base: d, w: d.width, h: d.height })),
  { id: "iPhone16Pro-portrait", base: DEVICES["iphone16-portrait"], w: 402, h: 874, note: "his handset's CSS dimensions" },
  { id: "iPhone16Pro-landscape", base: DEVICES["iphone16-landscape"], w: 874, h: 402, note: "his handset's CSS dimensions" },
];

for (const run of RUNS) {
  const { context, inset } = await newDeviceContext(browser, run.base, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  const rec = { id: run.id, viewport: { w: run.w, h: run.h }, note: run.note ?? null, inset: insetBanner(run.base, inset) };
  console.log(`\n${"=".repeat(96)}\n${run.id} ${run.w}x${run.h}${run.note ? `  [${run.note}]` : ""}`);
  try {
    await page.setViewportSize({ width: run.w, height: run.h });
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6000);
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (getComputedStyle(c).display === "none") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return { hasCanvas: !!best, canvas: best, loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || "") };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} ${JSON.stringify(gate.canvas)} loading ${gate.loading}`);
    if (!gate.hasCanvas || gate.canvas.w < 40 || gate.loading) { rec.fatal = "no live canvas"; results.push(rec); await context.close(); continue; }
    for (let i = 0; i < 6; i += 1) {
      const c = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button")) {
          if (!/^(Разбрах|Продължи|Започни|Ясно)$/.test((el.textContent || "").trim())) continue;
          const q = el.getBoundingClientRect(); if (q.width < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
        return null;
      });
      if (!c) break; await page.touchscreen.tap(c.x, c.y).catch(() => page.mouse.click(c.x, c.y)); await sleep(500);
    }
    await sleep(1500);
    const canvas = gate.canvas;
    const path = `${OUT}/shots/${run.id}__world.png`;
    await page.screenshot({ path, timeout: 120_000 });
    const png = readFileSync(path);
    const scale = run.base.dpr;
    const BANDS = 32;
    const bandH = (canvas.h * scale) / BANDS;
    const rows = [];
    for (let i = 0; i < BANDS; i += 1) {
      const v = frameVitals(png, { x: canvas.x * scale, y: canvas.y * scale + i * bandH, width: canvas.w * scale, height: Math.max(1, Math.floor(bandH)) });
      rows.push({ band: i, meanLuma: Math.round(v.meanLuma * 10) / 10, busyShare: Math.round(v.busyShare * 1000) / 1000, darkShare: Math.round(v.darkShare * 1000) / 1000 });
    }
    const isWorld = (r) => r.darkShare <= 0.6 && r.busyShare >= 0.06;
    const flags = rows.map(isWorld);
    let best = { s: -1, l: 0 }, cur = { s: -1, l: 0 };
    flags.forEach((wl, i) => { if (wl) { if (cur.l === 0) cur.s = i; cur.l += 1; if (cur.l > best.l) best = { ...cur }; } else cur = { s: -1, l: 0 }; });
    rec.world = {
      bands: BANDS, worldBands: flags.filter(Boolean).length,
      worldSharePct: Math.round((flags.filter(Boolean).length / BANDS) * 1000) / 10,
      runBands: best.l, runPx: Math.round((best.l / BANDS) * canvas.h),
      runTopPx: best.s >= 0 ? Math.round(canvas.y + (best.s / BANDS) * canvas.h) : null,
      runSharePct: Math.round((best.l / BANDS) * 1000) / 10,
      profile: flags.map((f) => (f ? "#" : ".")).join(""),
      canvas,
    };
    console.log(`  WORLD · largest contiguous road band ${rec.world.runPx}px of ${canvas.h}px = ${rec.world.runSharePct}% (top at y ${rec.world.runTopPx}) · total world bands ${rec.world.worldBands}/${BANDS} = ${rec.world.worldSharePct}%`);
    console.log(`  PROFILE ${rec.world.profile}   (# = road, . = cabin/letterbox)`);
  } catch (e) { rec.error = String(e?.message || e).split("\n")[0]; console.log(`  ERROR ${rec.error}`); }
  results.push(rec);
  writeFileSync(`${OUT}/worldband.json`, JSON.stringify(results, null, 1));
  await context.close();
}
writeFileSync(`${OUT}/worldband.json`, JSON.stringify(results, null, 1));
console.log(`\n[w8-world] wrote ${OUT}/worldband.json`);
await browser.close();
