#!/usr/bin/env node
// =============================================================================
// wave11-zoom.mjs — THE MAGNIFYING GLASS, AND THE ONE DEFECT NO DOM CAN SEE.
//
// wave11-seeing-eye.mjs answers „which characters can the student read" for
// every TEXT NODE. Two of the founder's five frames are not about text nodes:
//
//   · the instrument cluster's 40/80/120/160 are a TEXTURE INSIDE THE WEBGL
//     CANVAS. There is no node, no rect, no computed style. Detector A–E are
//     blind to it BY CONSTRUCTION and so was every sweep before them.
//   · «ДЯСН» printed across those numbers is a DOM label over a CANVAS
//     painting. One side of the collision has no box, so a rect-vs-rect
//     overprint test — even a correct one — returns nothing.
//
// The only instrument that sees either is a PICTURE, magnified enough to read.
// So this tool captures tight crops at device scale (3×, i.e. a 120 px CSS band
// arrives as a 360 px image) of the exact regions the founder photographed, and
// prints the DOM rects that land inside each region so the two can be argued
// against each other.
//
//   node tools/mobile/wave11-zoom.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit, chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "zoom");
const ENGINE_NAME = arg("engine", "webkit");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave11-seeing-eye`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The regions, as FRACTIONS of the viewport, so one table covers 393×852,
// 852×393, 360×780 and 780×360 without six hand-tuned copies.
const REGIONS_PORTRAIT = [
  { name: "cluster", x: 0, y: 0.66, w: 0.42, h: 0.11, why: "the analogue dial — canvas texture, chopped by the LEFT edge" },
  { name: "leftflank", x: 0, y: 0.58, w: 0.34, h: 0.24, why: "КЛАКС / ⇒ДЯСН / ⇐ЛЯВ, and whether they land on the dial" },
  { name: "rightflank", x: 0.7, y: 0.55, w: 0.3, h: 0.2, why: "Л ЛЯВО / З ЗАДН / Д ДЯСН against the right edge" },
  { name: "card", x: 0.55, y: 0.05, w: 0.45, h: 0.25, why: "the «ИНСТРУКЦИИ» card and its two truncated copies" },
  { name: "topedge", x: 0, y: 0, w: 1, h: 0.1, why: "the top edge — is anything sliced by the SCREEN" },
  { name: "bottomedge", x: 0, y: 0.94, w: 1, h: 0.06, why: "the bottom edge — the governor chip" },
];
const REGIONS_LANDSCAPE = [
  { name: "cluster", x: 0.3, y: 0.7, w: 0.26, h: 0.3, why: "the analogue dial — canvas texture" },
  { name: "leftflank", x: 0.03, y: 0.42, w: 0.22, h: 0.2, why: "КЛАКС / ⇒ДЯСН / ⇐ЛЯВ scattered across the road" },
  { name: "rightflank", x: 0.7, y: 0.38, w: 0.3, h: 0.2, why: "Л ЛЯВО / З ЗАДН / Д ДЯСН over the parked cars" },
  { name: "card", x: 0.6, y: 0, w: 0.4, h: 0.42, why: "the «ИНСТРУКЦИИ» card — the sliced headline" },
  { name: "topedge", x: 0, y: 0, w: 1, h: 0.16, why: "the top edge — is anything sliced by the SCREEN" },
  { name: "bottomedge", x: 0, y: 0.88, w: 1, h: 0.12, why: "the bottom edge" },
];

const RECTS = () => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (/\S/.test(n.nodeValue || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
  });
  const range = document.createRange();
  let n;
  while ((n = walker.nextNode())) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT)$/.test(p.tagName)) continue;
    range.selectNodeContents(n);
    const rs = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
    if (rs.length === 0) continue;
    const u = rs.reduce(
      (a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }),
      { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity },
    );
    out.push({
      text: (n.nodeValue || "").trim().slice(0, 40),
      l: Math.round(u.l), t: Math.round(u.t), r: Math.round(u.r), b: Math.round(u.b),
      hud: (() => { let e = p; while (e) { const h = e.getAttribute?.("data-hud") || e.getAttribute?.("aria-label"); if (h) return h.slice(0, 34); e = e.parentElement; } return null; })(),
    });
  }
  return out;
};

const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch();
console.log(`[w11-zoom] engine ${ENGINE_NAME} · base ${BASE} · route ${ROUTE}`);
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  console.log(`\n${"═".repeat(96)}\n${device.label}\n  ${insetBanner(device, inset)}`);
  const rec = { device: device.id, shots: [], regions: [] };
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6500);
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (getComputedStyle(c).display === "none") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      return { hasCanvas: best !== null, canvas: best, touchControls: !!document.querySelector('[data-hud="touch-controls"]') };
    });
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · touchControls ${gate.touchControls}`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || !gate.touchControls) {
      console.log(`  FATAL · no live canvas — nothing captured`);
      results.push({ ...rec, fatal: true });
      await context.close();
      continue;
    }
    // Dismiss the pre-drive cards: the rotate hint and the flank arc are
    // SUPPRESSED while an overlay is up (PlayAreaStyles: `[data-sim-overlay-
    // active="on"] [data-hud="touch-hint"] { … }`), so the frame with the hint
    // on it is the frame with no card on it — which is why a sweep that only
    // ever measured the opening frame never saw the rotate card at all.
    for (let i = 0; i < 10; i += 1) {
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) => /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim()));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(450);
    }
    await sleep(1500);

    const hint = await page.evaluate(() => {
      const el = document.querySelector('[data-hud="touch-hint"]');
      if (!el) return { present: false };
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        present: true,
        rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
        display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
        text: (el.textContent || "").trim().slice(0, 160),
      };
    });
    rec.rotateHint = hint;
    console.log(`  ROTATE CARD [data-hud="touch-hint"] · ${JSON.stringify(hint)}`);

    const rects = await page.evaluate(RECTS);
    const regions = device.orientation === "portrait" ? REGIONS_PORTRAIT : REGIONS_LANDSCAPE;
    for (const reg of regions) {
      const x = Math.round(reg.x * device.width);
      const y = Math.round(reg.y * device.height);
      const w = Math.min(device.width - x, Math.round(reg.w * device.width));
      const h = Math.min(device.height - y, Math.round(reg.h * device.height));
      if (w < 4 || h < 4) continue;
      const p = `${OUT}/${TAG}-${device.id}-${reg.name}.png`;
      await page.screenshot({ path: p, scale: "device", clip: { x, y, width: w, height: h } });
      const inside = rects.filter((t) => t.r > x && t.l < x + w && t.b > y && t.t < y + h);
      rec.shots.push(p);
      rec.regions.push({ name: reg.name, box: { x, y, w, h }, why: reg.why, domText: inside });
      console.log(`  ▣ ${reg.name.padEnd(11)} [${x},${y} ${w}×${h}] — ${reg.why}`);
      console.log(`      DOM text inside: ${inside.length === 0 ? "NONE — everything you see here is painted in the CANVAS" : inside.map((t) => `«${t.text}»@${t.l},${t.t}`).join("  ")}`);
    }
  } catch (err) {
    rec.error = String(err?.message ?? err);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  await context.close();
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 2));
console.log(`\n[w11-zoom] wrote ${OUT}/${TAG}.json`);
await browser.close();
