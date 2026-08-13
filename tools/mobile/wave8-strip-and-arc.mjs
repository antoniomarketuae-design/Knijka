// =============================================================================
// wave8-strip-and-arc.mjs — TWO QUESTIONS THE CENSUS RAISED AND COULD NOT CLOSE.
//
// 1. WHICH PANEL BURIES THE RAIL, AND DOES IT COME UP ON ITS OWN? The census
//    found every dead control answering «Коланът не е поставен» — the BELT
//    warning, not the instruction panel §I11 named. If that card raises itself
//    (it is the pre-drive checklist speaking, not a stray tap), then the trap
//    is not „a student expanded something": it is the DEFAULT state of the
//    first minute of every lesson. That changes what the redesign must do, so
//    it gets measured rather than assumed. THE PREVIOUS COMMIT IN THIS REPO IS
//    LITERALLY „the burial census was counting controls nobody can see" — the
//    identity of the burying layer is exactly the thing to get right.
//
// 2. DOES THE SPACING CHANGE, OR ONLY THE POSITION? A control that slides is
//    bad. An arc whose stations move by DIFFERENT amounts re-shapes under the
//    thumb, and that is his „it is not stabilized". So: adjacent-station GAPS
//    at three viewport heights, per profile.
//
//   node wave8-strip-and-arc.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave8-census`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await webkit.launch();
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w8-strip] signed in ONCE against ${BASE}`);

// Every layer that is not a control and not the canvas, with its identity.
const LAYERS = () => {
  const out = [];
  const vw = window.innerWidth, vh = window.innerHeight;
  for (const el of document.querySelectorAll("[data-sim-overlay],[data-hud],[role='status'],[role='alert'],[role='alertdialog'],[role='dialog'],[role='toolbar']")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.02) continue;
    out.push({
      hud: el.getAttribute("data-hud"),
      overlay: el.getAttribute("data-sim-overlay"),
      state: el.getAttribute("data-sim-overlay-state"),
      role: el.getAttribute("role"),
      z: cs.zIndex,
      pe: cs.pointerEvents,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      coversPct: Math.round(((Math.max(0, Math.min(vw, r.x + r.width) - Math.max(0, r.x)) * Math.max(0, Math.min(vh, r.y + r.height) - Math.max(0, r.y))) / (vw * vh)) * 1000) / 10,
      text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 110),
    });
  }
  return out;
};

// Which controls does layer L bury? elementFromPoint at each control's own centre.
const BURIED = () => {
  const SEL = 'button,[role="slider"]';
  const out = [];
  for (const el of document.querySelectorAll(SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const mine = !!hit && (hit === el || el.contains(hit));
    if (mine) continue;
    const layer = hit?.closest("[data-sim-overlay],[data-hud],[role='toolbar']");
    out.push({
      label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
      rail: el.closest('[data-hud="top-rail"]') !== null,
      byHud: layer?.getAttribute("data-hud") ?? null,
      byOverlay: layer?.getAttribute("data-sim-overlay") ?? null,
      byState: layer?.getAttribute("data-sim-overlay-state") ?? null,
      byText: (hit?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70),
    });
  }
  return out;
};

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  const rec = { device: device.id, orientation: device.orientation, inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height } };
  console.log(`\n${"=".repeat(100)}\n${device.id} ${device.width}x${device.height}\n  ${rec.inset}`);
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(5200);
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (getComputedStyle(c).display === "none") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return { hasCanvas: !!best, canvas: best, rail: !!document.querySelector('[data-hud="top-rail"]') };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} ${JSON.stringify(gate.canvas)} · rail ${gate.rail}`);
    if (!gate.hasCanvas || gate.canvas.w < 40) { rec.fatal = "no live canvas"; results.push(rec); await context.close(); continue; }

    // dismiss the first-run hint, then TOUCH NOTHING
    for (let i = 0; i < 6; i += 1) {
      const c = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button")) {
          if (!/^(Разбрах|Продължи|Започни|Ясно)$/.test((el.textContent || "").trim())) continue;
          const q = el.getBoundingClientRect();
          if (q.width < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
        return null;
      });
      if (!c) break;
      await page.touchscreen.tap(c.x, c.y);
      await sleep(500);
    }

    // ── Q1 · THE UNPROMPTED TIMELINE. No taps at all from here. ─────────────
    rec.timeline = [];
    for (const t of [0, 6, 14, 26, 40]) {
      if (t > 0) await sleep((t - rec.timeline[rec.timeline.length - 1].t) * 1000);
      const layers = await page.evaluate(LAYERS);
      const buried = await page.evaluate(BURIED);
      rec.timeline.push({ t, layers, buried });
      const big = layers.filter((l) => l.coversPct >= 1.5);
      console.log(`  t+${t}s · ${buried.length} controls buried (${buried.filter((b) => b.rail).length} of them in the TOP RAIL)`);
      for (const b of buried) console.log(`         «${b.label}» ← ${b.byHud || b.byOverlay || "?"} [${b.byState || "-"}] „${b.byText}"`);
      for (const l of big) console.log(`         LAYER hud=${l.hud} overlay=${l.overlay} state=${l.state} z=${l.z} pe=${l.pe} [${l.x},${l.y},${l.w}x${l.h}] ${l.coversPct}% „${l.text.slice(0, 60)}"`);
      await page.screenshot({ path: `${OUT}/shots/${device.id}__t${t}.png`, timeout: 120_000 }).catch(() => {});
    }

    // ── Q2 · THE ARC'S SPACING, NOT JUST ITS POSITION ───────────────────────
    const stations = () => page.evaluate(() => {
      const want = ["Мигач наляво", "Мигач надясно", "Поглед в дясното огледало", "Поглед в огледалото за задно виждане", "Поглед в лявото огледало", "Волан — плъзни наляво или надясно"];
      const out = {};
      for (const el of document.querySelectorAll("button,[role='slider']")) {
        const l = el.getAttribute("aria-label") || "";
        const k = want.find((w) => l.startsWith(w.slice(0, 18)));
        if (!k || out[k]) continue;
        const r = el.getBoundingClientRect();
        out[k] = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2), top: Math.round(r.y) };
      }
      const pad = document.querySelector('[role="slider"][aria-label^="Ход"]');
      const pr = pad?.getBoundingClientRect();
      return { out, h: window.innerHeight, padTop: pr ? Math.round(pr.y) : null, padH: pr ? Math.round(pr.height) : null,
        simVh: getComputedStyle(document.documentElement).getPropertyValue("--sim-vh").trim() || null };
    });
    rec.arc = [];
    for (const delta of [0, -44, -90]) {
      if (delta !== 0) { await page.setViewportSize({ width: device.width, height: device.height + delta }); await sleep(1500); }
      const s = await stations();
      // the three RIGHT-flank mirror stations, in screen order, and their gaps
      const mirrors = ["Поглед в лявото огледало", "Поглед в огледалото за задно виждане", "Поглед в дясното огледало"]
        .map((k) => s.out[k]).filter(Boolean);
      const indics = ["Мигач надясно", "Мигач наляво"].map((k) => s.out[k]).filter(Boolean);
      const gapsM = mirrors.slice(1).map((m, i) => m.cy - mirrors[i].cy);
      const gapsI = indics.slice(1).map((m, i) => m.cy - indics[i].cy);
      const padGap = mirrors.length && s.padTop !== null ? s.padTop - mirrors[mirrors.length - 1].cy : null;
      rec.arc.push({ delta, innerH: s.h, simVh: s.simVh, padTop: s.padTop, padH: s.padH, stations: s.out, mirrorGaps: gapsM, indicatorGaps: gapsI, padGap });
      console.log(`  ARC · h ${s.h} (${delta}) · padTop ${s.padTop} padH ${s.padH} · mirror gaps ${JSON.stringify(gapsM)} · indicator gaps ${JSON.stringify(gapsI)} · lowest-station→pad ${padGap}px · --sim-vh ${s.simVh}`);
    }
    await page.setViewportSize({ width: device.width, height: device.height });
  } catch (e) {
    rec.error = String(e?.message || e).split("\n")[0];
    console.log(`  ERROR ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/strip-arc.json`, JSON.stringify(results, null, 1));
  await context.close();
}
writeFileSync(`${OUT}/strip-arc.json`, JSON.stringify(results, null, 1));
console.log(`\n[w8-strip] wrote ${OUT}/strip-arc.json`);
await browser.close();
