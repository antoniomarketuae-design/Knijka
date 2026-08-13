// =============================================================================
// wave8-panel-and-pro.mjs — THREE THINGS THE FIRST TWO PROBES MADE NECESSARY.
//
// A · THE HONEST §I11 REPRODUCTION. The census pressed «Защо» while the BELT
//     WARNING happened to be the current card, so what buried the rail was the
//     expanded warning. `wave8-strip-and-arc` then showed the warning ages out
//     into the instruction hint after ~6 s and that NOTHING buries the rail
//     unprompted over 40 s. So this probe waits for the hint, THEN expands, and
//     measures what §I11 actually describes: the instruction panel („Потегли по
//     улицата…") standing on the rail. Same instrument, no timing confound.
//
// B · HIS PHONE, NOT THE LADDER'S. The ladder models an iPhone 16 (393x852).
//     He tests on an iPhone 16 PRO — 1206x2622 at 460 ppi, dpr 3, i.e.
//     402x874 CSS px, 9 px wider and 22 px taller. That extra height matters
//     to exactly one number: ARC_RISE = clamp(20px, (stage − 352px) × 0.5,
//     132px) sits at its FLOOR on the 393 px ladder phone and slightly ABOVE
//     it at 402 px. Whether the arc reshapes on HIS handset is therefore a
//     different question from whether it reshapes on the ladder's, and it is
//     answered here by resizing to his dimensions and re-reading the gaps.
//     LABELLED, always: this is the iPhone 16 context at Pro dimensions.
//
// C · WHAT THE LESSON MENU HOLDS TODAY. The proposal has to place the
//     demonstration deck, the minimap and the quality setting, and those are
//     not on the driving surface — they are behind «Меню на урока». Counting
//     them from the source would be a guess; this opens it.
//
//   node wave8-panel-and-pro.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices, DEVICES } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave8-census`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const devices = resolveDevices(null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await webkit.launch();
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w8-panel] signed in ONCE against ${BASE}`);

const BURIED = () => {
  const out = [];
  for (const el of document.querySelectorAll('button,[role="slider"]')) {
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    if (hit && (hit === el || el.contains(hit))) continue;
    const layer = hit?.closest("[data-sim-overlay],[data-hud],[role='toolbar']");
    out.push({
      label: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 42),
      rail: el.closest('[data-hud="top-rail"]') !== null,
      by: layer?.getAttribute("data-hud") ?? layer?.getAttribute("data-sim-overlay") ?? "?",
      byState: layer?.getAttribute("data-sim-overlay-state") ?? null,
      byText: (hit?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
    });
  }
  return out;
};
const PANEL = () => {
  const el = document.querySelector('[data-hud="notify-column"], [data-sim-overlay][data-sim-overlay-state]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight;
  return {
    state: el.getAttribute("data-sim-overlay-state"), kind: el.getAttribute("data-sim-overlay"),
    x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
    coversPct: Math.round(((r.width * r.height) / (vw * vh)) * 1000) / 10,
    fullBleed: r.width >= vw - 2,
    text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 100),
  };
};

const results = [];

// ── A · the honest §I11, on all six ─────────────────────────────────────────
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
    if (!gate.hasCanvas || gate.canvas.w < 40 || !gate.rail) { rec.fatal = "no live canvas / no rail"; results.push(rec); await context.close(); continue; }

    for (let i = 0; i < 6; i += 1) {
      const c = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button")) {
          if (!/^(Разбрах|Продължи|Започни|Ясно)$/.test((el.textContent || "").trim())) continue;
          const q = el.getBoundingClientRect(); if (q.width < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
        return null;
      });
      if (!c) break; await page.touchscreen.tap(c.x, c.y); await sleep(500);
    }
    // WAIT for the belt warning to age out into the instruction hint.
    for (let i = 0; i < 20; i += 1) {
      const kind = await page.evaluate(() => document.querySelector("[data-sim-overlay]")?.getAttribute("data-sim-overlay") ?? null);
      if (kind === "hint") break;
      await sleep(1000);
    }
    rec.beforeKind = await page.evaluate(() => document.querySelector("[data-sim-overlay]")?.getAttribute("data-sim-overlay") ?? null);
    rec.panelPeek = await page.evaluate(PANEL);
    console.log(`  PEEK  · kind=${rec.beforeKind} ${JSON.stringify(rec.panelPeek)}`);

    const why = await page.evaluate(() => {
      for (const el of document.querySelectorAll("button")) {
        if (!/^(Защо|Инструкции)$/.test((el.textContent || "").trim())) continue;
        const q = el.getBoundingClientRect(); if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), text: (el.textContent || "").trim() };
      }
      return null;
    });
    if (why) { await page.touchscreen.tap(why.x, why.y); await sleep(1300); }
    rec.why = why;
    rec.panelOpen = await page.evaluate(PANEL);
    rec.buried = await page.evaluate(BURIED);
    console.log(`  OPEN  · «${why?.text ?? "NOT FOUND"}» → ${JSON.stringify(rec.panelOpen)}`);
    console.log(`  BURIED· ${rec.buried.length} controls (${rec.buried.filter((b) => b.rail).length} in the TOP RAIL)`);
    for (const b of rec.buried) console.log(`          «${b.label}» ← ${b.by}[${b.byState || "-"}] „${b.byText}"`);
    await page.screenshot({ path: `${OUT}/shots/${device.id}__panel-open.png`, timeout: 120_000 }).catch(() => {});
  } catch (e) { rec.error = String(e?.message || e).split("\n")[0]; console.log(`  ERROR ${rec.error}`); }
  results.push(rec);
  writeFileSync(`${OUT}/panel-pro.json`, JSON.stringify(results, null, 1));
  await context.close();
}

// ── B · HIS PHONE'S DIMENSIONS ──────────────────────────────────────────────
// iPhone 16 Pro: 1206x2622 @460 ppi, dpr 3 → 402x874 CSS px.
for (const [id, w, h] of [["pro-landscape", 874, 402], ["pro-portrait", 402, 874]]) {
  const base = DEVICES[id.endsWith("landscape") ? "iphone16-landscape" : "iphone16-portrait"];
  const { context, inset } = await newDeviceContext(browser, base, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  const rec = { device: `iPhone16Pro-${id}`, note: "the iPhone 16 profile RESIZED to iPhone 16 Pro CSS dimensions (402x874) — his handset", viewport: { w, h }, inset: insetBanner(base, inset) };
  console.log(`\n${"=".repeat(100)}\n${rec.device} ${w}x${h}  [${rec.note}]`);
  try {
    await page.setViewportSize({ width: w, height: h });
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
    for (let i = 0; i < 6; i += 1) {
      const c = await page.evaluate(() => {
        for (const el of document.querySelectorAll("button")) {
          if (!/^(Разбрах|Продължи|Започни|Ясно)$/.test((el.textContent || "").trim())) continue;
          const q = el.getBoundingClientRect(); if (q.width < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
        return null;
      });
      if (!c) break; await page.touchscreen.tap(c.x, c.y); await sleep(500);
    }

    const stations = () => page.evaluate(() => {
      const want = ["Мигач наляво", "Мигач надясно", "Поглед в дясното огледало", "Поглед в огледалото за задно виждане", "Поглед в лявото огледало"];
      const out = {};
      for (const el of document.querySelectorAll("button")) {
        const l = el.getAttribute("aria-label") || "";
        const k = want.find((wnt) => l.startsWith(wnt.slice(0, 18)));
        if (!k || out[k]) continue;
        const r = el.getBoundingClientRect();
        out[k] = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      }
      const pad = document.querySelector('[role="slider"][aria-label^="Ход"]');
      const steer = document.querySelector('[role="slider"][aria-label^="Волан"]');
      const pr = pad?.getBoundingClientRect(); const sr = steer?.getBoundingClientRect();
      return { out, h: window.innerHeight,
        pad: pr ? { top: Math.round(pr.y), h: Math.round(pr.height), w: Math.round(pr.width) } : null,
        steer: sr ? { top: Math.round(sr.y), h: Math.round(sr.height), w: Math.round(sr.width) } : null };
    });
    rec.arc = [];
    // Safari's toolbar on iOS 18 is ~44-51 px in landscape and ~44-92 px in
    // portrait depending on whether it is collapsed or expanded.
    for (const delta of [0, -44, -90]) {
      if (delta !== 0) { await page.setViewportSize({ width: w, height: h + delta }); await sleep(1500); }
      const s = await stations();
      const mirrors = ["Поглед в лявото огледало", "Поглед в огледалото за задно виждане", "Поглед в дясното огледало"].map((k) => s.out[k]).filter(Boolean);
      const indics = ["Мигач надясно", "Мигач наляво"].map((k) => s.out[k]).filter(Boolean);
      const gapsM = mirrors.slice(1).map((m, i) => m.cy - mirrors[i].cy);
      const gapsI = indics.slice(1).map((m, i) => m.cy - indics[i].cy);
      rec.arc.push({ delta, innerH: s.h, pad: s.pad, steer: s.steer, mirrorGaps: gapsM, indicatorGaps: gapsI, stations: s.out });
      console.log(`  ARC · h ${s.h} (${delta}) · drive pad ${JSON.stringify(s.pad)} · steer ${JSON.stringify(s.steer)} · mirror gaps ${JSON.stringify(gapsM)} · indicator gap ${JSON.stringify(gapsI)}`);
    }
    await page.setViewportSize({ width: w, height: h });

    // ── C · THE LESSON MENU, opened ───────────────────────────────────────
    const menu = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((e) => /Меню на урока/.test(e.getAttribute("aria-label") || ""));
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    });
    if (menu) { await page.touchscreen.tap(menu.x, menu.y); await sleep(1100); }
    rec.menu = await page.evaluate(() => {
      const items = [];
      for (const el of document.querySelectorAll('button,[role="menuitem"],a')) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!t) continue;
        items.push({ text: t.slice(0, 48), h: Math.round(r.height), w: Math.round(r.width), y: Math.round(r.y), under44: Math.min(r.width, r.height) < 43.5 });
      }
      return items;
    });
    console.log(`  MENU  · ${rec.menu.length} labelled controls on screen with the menu open:`);
    for (const m of rec.menu) console.log(`          „${m.text}" ${m.w}x${m.h}${m.under44 ? "  UNDER44" : ""}`);
    await page.screenshot({ path: `${OUT}/shots/${rec.device}__menu.png`, timeout: 120_000 }).catch(() => {});
  } catch (e) { rec.error = String(e?.message || e).split("\n")[0]; console.log(`  ERROR ${rec.error}`); }
  results.push(rec);
  writeFileSync(`${OUT}/panel-pro.json`, JSON.stringify(results, null, 1));
  await context.close();
}
writeFileSync(`${OUT}/panel-pro.json`, JSON.stringify(results, null, 1));
console.log(`\n[w8-panel] wrote ${OUT}/panel-pro.json`);
await browser.close();
