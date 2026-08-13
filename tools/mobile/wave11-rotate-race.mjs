#!/usr/bin/env node
// =============================================================================
// wave11-rotate-race.mjs — CATCH THE ROTATE CARD IN THE ONE WINDOW IT EXISTS.
//
// wave11-rotate-card.mjs established the rule: in a lesson's steady state
// `[data-hud="touch-hint"]` is `display:none`, because the overlay queue is
// never empty and PlayAreaStyles §ROW C1 stands the hint down behind it. 24
// dismiss presses on three portrait profiles never opened a gap.
//
// But the card is mounted with `showTouchHint = true` on a first run, and the
// stylesheet only hides it WHILE an overlay is up. Between the scene mounting
// and the lesson's first card arriving there is a window — possibly a few
// hundred milliseconds — in which the card is on the screen. That window is
// where the founder's frame comes from, and it is invisible to any probe that
// waits six seconds for the scene to settle before it looks. Every sweep in
// this project waits six seconds.
//
// So this one does not wait. It polls from the first paint at 100 ms and
// screenshots the FIRST frame in which the card has a box.
//
//   node tools/mobile/wave11-rotate-race.mjs --base https://…trycloudflare.com
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
const TAG = arg("tag", "race");
const ENGINE_NAME = arg("engine", "webkit");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave11-seeing-eye`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PEEK = () => {
  const el = document.querySelector('[data-hud="touch-hint"]');
  if (!el) return { present: false };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const R = (n) => Math.round(n * 10) / 10;
  const CLIPS = /^(hidden|clip|auto|scroll|overlay)$/;
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const VIEWPORT = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const paras = [...el.querySelectorAll("p, button")]
    .filter((p) => getComputedStyle(p).display !== "none")
    .map((p) => {
      let eff = { ...VIEWPORT };
      const chain = [];
      for (let a = p; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
        const acs = getComputedStyle(a);
        const cx = CLIPS.test(acs.overflowX);
        const cy = CLIPS.test(acs.overflowY);
        if (!cx && !cy) continue;
        const ar = a.getBoundingClientRect();
        chain.push(`${a.tagName.toLowerCase()}(${acs.overflowX}/${acs.overflowY}) ${R(ar.width)}×${R(ar.height)}`);
        eff = inter(eff, {
          left: cx ? ar.left : -Infinity, right: cx ? ar.right : Infinity,
          top: cy ? ar.top : -Infinity, bottom: cy ? ar.bottom : Infinity,
        });
      }
      const range = document.createRange();
      let rendered = "";
      const lines = [];
      for (const n of [...p.childNodes].filter((n) => n.nodeType === 3 && /\S/.test(n.nodeValue))) {
        range.selectNodeContents(n);
        for (const lr of range.getClientRects()) {
          if (lr.width < 0.5) continue;
          lines.push({ l: R(lr.left), t: R(lr.top), r: R(lr.right), b: R(lr.bottom), vis: R((area(inter(lr, eff)) / (area(lr) || 1)) * 100) / 100 });
        }
        const s = n.nodeValue;
        for (let i = 0; i < Math.min(s.length, 200); i += 1) {
          range.setStart(n, i); range.setEnd(n, i + 1);
          const cr = [...range.getClientRects()][0];
          if (!cr) { rendered += s[i]; continue; }
          rendered += area(inter(cr, eff)) / (area(cr) || 1) >= 0.985 ? s[i] : "·";
        }
      }
      const pr = p.getBoundingClientRect();
      return {
        tag: p.tagName.toLowerCase(), fontSize: getComputedStyle(p).fontSize,
        text: (p.textContent || "").trim().slice(0, 80), rendered: rendered.trim(),
        rect: { l: R(pr.left), t: R(pr.top), r: R(pr.right), b: R(pr.bottom), w: R(pr.width), h: R(pr.height) },
        sw: p.scrollWidth, cw: p.clientWidth, lines, clipChain: chain,
        cut: lines.some((l) => l.vis < 0.995),
      };
    });
  return {
    present: true, display: cs.display, opacity: cs.opacity,
    rect: { l: R(r.left), t: R(r.top), r: R(r.right), b: R(r.bottom), w: R(r.width), h: R(r.height) },
    overlayActive: document.querySelector('[data-sim-overlay-active="on"]') !== null,
    viewport: { w: innerWidth, h: innerHeight },
    paras,
  };
};

const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch();
console.log(`[w11-race] engine ${ENGINE_NAME} · base ${BASE} · route ${ROUTE}`);
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
  const rec = { device: device.id, samples: [], caught: null };
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    // NO settle wait. Poll from the first paint.
    const t0 = Date.now();
    for (let i = 0; i < 220; i += 1) {
      let s;
      try { s = await page.evaluate(PEEK); } catch { await sleep(120); continue; }
      const ms = Date.now() - t0;
      if (s.present && s.display !== "none" && s.rect.w > 2) {
        rec.caught = { atMs: ms, ...s };
        const p = `${OUT}/${TAG}-${device.id}-caught.png`;
        await page.screenshot({ path: p, scale: "device" });
        const r = s.rect;
        await page.screenshot({
          path: `${OUT}/${TAG}-${device.id}-caught-crop.png`, scale: "device",
          clip: { x: Math.max(0, r.l - 8), y: Math.max(0, r.t - 8), width: Math.min(device.width, r.w + 16), height: Math.min(device.height, r.h + 16) },
        });
        console.log(`  ★ CAUGHT at +${ms} ms · rect ${JSON.stringify(r)} · overlayActive ${s.overlayActive}`);
        for (const pa of s.paras) {
          console.log(`      ${pa.cut ? "✂" : "·"} <${pa.tag}> ${pa.fontSize} ${JSON.stringify(pa.rect)} sw/cw ${pa.sw}/${pa.cw} lines ${pa.lines.length}`);
          console.log(`         FULL     «${pa.text}»`);
          console.log(`         RENDERED «${pa.rendered}»`);
          console.log(`         clip chain: ${pa.clipChain.length ? pa.clipChain.join(" → ") : "NONE"}`);
        }
        break;
      }
      rec.samples.push({ ms, present: s.present, display: s.display, overlayActive: s.overlayActive });
      await sleep(110);
      if (ms > 26_000) break;
    }
    if (!rec.caught) {
      const withHint = rec.samples.filter((s) => s.present).length;
      console.log(
        `  ✖ NEVER VISIBLE in ${rec.samples.length} samples over ${Math.round((rec.samples.at(-1)?.ms ?? 0) / 1000)} s ` +
          `(the node existed in ${withHint} of them, always display:none; overlay was active in ` +
          `${rec.samples.filter((s) => s.overlayActive).length}). THE ROTATE CARD DOES NOT RENDER IN THIS LESSON ON THIS BUILD.`,
      );
      await page.screenshot({ path: `${OUT}/${TAG}-${device.id}-never.png`, scale: "device" });
    }
  } catch (err) {
    rec.error = String(err?.message ?? err);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  await context.close();
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 2));
console.log(`\n[w11-race] wrote ${OUT}/${TAG}.json`);
await browser.close();
