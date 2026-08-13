#!/usr/bin/env node
// =============================================================================
// wave11-rotate-card.mjs — THE CARD THAT TELLS HIM TO ROTATE, AND WHY NO SWEEP
// HAS EVER SEEN IT.
//
// His frame shows «Завърти телефона хоризонтално» rendering as three cut
// fragments — „авърт / елефон / изонта" — i.e. the sentence broken one word per
// line inside a box narrower than the words, with the overflow hidden.
//
// EVERY SWEEP THAT LOOKED FOR IT MEASURED A FRAME WHERE IT IS `display:none`.
// That is not a miss, it is a rule, and it is in the shipped stylesheet:
//
//     [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="touch-hint"]
//       { display: none; }                       (PlayAreaStyles.tsx §ROW C1)
//
// A lesson OPENS with an overlay up and the queue refills it, so on the landing
// frame and on the frame after «Разбрах» the hint is suppressed. To see the
// card at all the queue has to be DRAINED first — which is what this probe
// does, and it refuses to report anything until `data-sim-overlay-active` is
// actually off and the hint has a non-zero rect.
//
// Then it measures the sentence the way a reader does: the <p>'s own box, the
// box of every ancestor that could clip it, the rect of every LINE, and the
// characters that survive — plus the same reading at three larger text sizes,
// because iOS Safari's per-site text-size and Dynamic Type are the one lever
// the founder has that this engine does not model, and a sentence that fits at
// 100% and shatters at 150% is a defect with a name rather than a mystery.
//
//   node tools/mobile/wave11-rotate-card.mjs --base https://…trycloudflare.com
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
const TAG = arg("tag", "rotate");
const ENGINE_NAME = arg("engine", "webkit");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave11-seeing-eye`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Everything about the hint a human would need to judge it. */
const HINT = () => {
  const el = document.querySelector('[data-hud="touch-hint"]');
  const stage = document.querySelector("[data-sim-stage]");
  const overlayActive =
    document.querySelector('[data-sim-overlay-active="on"]') !== null ||
    (stage && stage.getAttribute("data-sim-overlay-active")) ||
    document.documentElement.getAttribute("data-sim-overlay-active");
  if (!el) return { present: false, overlayActive };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const R = (n) => Math.round(n * 10) / 10;
  const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
  const area = (b) => Math.max(0, b.right - b.left) * Math.max(0, b.bottom - b.top);
  const VIEWPORT = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  const CLIPS = /^(hidden|clip|auto|scroll|overlay)$/;

  const paras = [...el.querySelectorAll("p, span, button")].map((p) => {
    const pcs = getComputedStyle(p);
    const pr = p.getBoundingClientRect();
    // every clipping ancestor, up the tree, exactly as the census does
    let eff = { ...VIEWPORT };
    const clippers = [];
    for (let a = p; a && a.nodeType === 1 && a !== document.documentElement; a = a.parentElement) {
      const acs = getComputedStyle(a);
      const cx = CLIPS.test(acs.overflowX);
      const cy = CLIPS.test(acs.overflowY);
      if (!cx && !cy) continue;
      const ar = a.getBoundingClientRect();
      const bx = {
        left: cx ? ar.left + (parseFloat(acs.borderLeftWidth) || 0) : -Infinity,
        right: cx ? ar.right - (parseFloat(acs.borderRightWidth) || 0) : Infinity,
        top: cy ? ar.top + (parseFloat(acs.borderTopWidth) || 0) : -Infinity,
        bottom: cy ? ar.bottom - (parseFloat(acs.borderBottomWidth) || 0) : Infinity,
      };
      clippers.push({ tag: a.tagName.toLowerCase(), cls: (a.getAttribute("class") || "").slice(0, 60), overflow: `${acs.overflowX}/${acs.overflowY}` });
      eff = inter(eff, bx);
    }
    // per-line rects of the text inside
    const range = document.createRange();
    const lines = [];
    let visibleText = "";
    for (const node of [...p.childNodes].filter((n) => n.nodeType === 3 && /\S/.test(n.nodeValue))) {
      range.selectNodeContents(node);
      for (const lr of range.getClientRects()) {
        if (lr.width < 0.5 || lr.height < 0.5) continue;
        const v = inter(lr, eff);
        lines.push({ rect: { l: R(lr.left), t: R(lr.top), r: R(lr.right), b: R(lr.bottom) }, visibleFraction: R((area(v) / (area(lr) || 1)) * 100) / 100 });
      }
      const s = node.nodeValue;
      for (let i = 0; i < Math.min(s.length, 200); i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const cr = [...range.getClientRects()][0];
        if (!cr) { visibleText += s[i]; continue; }
        visibleText += area(inter(cr, eff)) / (area(cr) || 1) >= 0.985 ? s[i] : "·";
      }
    }
    return {
      tag: p.tagName.toLowerCase(),
      display: pcs.display,
      fontSize: pcs.fontSize,
      text: (p.textContent || "").trim().slice(0, 90),
      rect: { l: R(pr.left), t: R(pr.top), r: R(pr.right), b: R(pr.bottom), w: R(pr.width), h: R(pr.height) },
      scrollVsClient: { sw: p.scrollWidth, cw: p.clientWidth, sh: p.scrollHeight, ch: p.clientHeight },
      clippers,
      effective: { l: R(eff.left), t: R(eff.top), r: R(eff.right), b: R(eff.bottom) },
      lines,
      rendered: visibleText.trim(),
      cutAnywhere: lines.some((l) => l.visibleFraction < 0.995),
    };
  });

  return {
    present: true,
    overlayActive,
    display: cs.display,
    visibility: cs.visibility,
    opacity: cs.opacity,
    rect: { l: R(r.left), t: R(r.top), r: R(r.right), b: R(r.bottom), w: R(r.width), h: R(r.height) },
    viewport: { w: innerWidth, h: innerHeight },
    rootFontSize: getComputedStyle(document.documentElement).fontSize,
    paras: paras.filter((p) => p.display !== "none" && p.text),
  };
};

const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch();
console.log(`[w11-rotate] engine ${ENGINE_NAME} · base ${BASE} · route ${ROUTE}`);
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
  const rec = { device: device.id, orientation: device.orientation, steps: [] };
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
    rec.gate = gate;
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || !gate.touchControls) {
      rec.fatal = "no live canvas";
      results.push(rec);
      await context.close();
      continue;
    }

    // ── DRAIN THE OVERLAY QUEUE. Nothing about the hint is knowable until
    //    `data-sim-overlay-active` is off, because until then it is display:none.
    let drained = false;
    for (let i = 0; i < 24; i += 1) {
      const state = await page.evaluate(HINT);
      if (state.present && state.display !== "none") { drained = true; break; }
      const target = await page.evaluate(() => {
        const pick =
          [...document.querySelectorAll("button")].find((n) => /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim())) ||
          document.querySelector("[data-hud-close]") ||
          document.querySelector('[data-sim-overlay-card="button"]');
        if (!pick) return null;
        const r = pick.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), what: (pick.textContent || pick.getAttribute("aria-label") || "?").trim().slice(0, 40) };
      });
      if (!target) { await sleep(900); continue; }
      await page.mouse.move(target.x, target.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(650);
    }
    const state = await page.evaluate(HINT);
    rec.drained = drained;
    rec.hint = state;
    console.log(`  QUEUE DRAINED · ${drained} · overlayActive=${JSON.stringify(state.overlayActive)} · hint display=${state.display} rect=${JSON.stringify(state.rect)}`);
    if (!drained) {
      console.log(`  ⚠ THE ROTATE CARD IS display:none ON THIS PROFILE — [data-sim-compact="on"][data-sim-overlay-active="on"] [data-hud="touch-hint"] { display:none } (PlayAreaStyles §ROW C1). NOTHING ABOUT IT CAN BE MEASURED IN THIS STATE, AND NO PREVIOUS SWEEP SAID SO.`);
    } else {
      for (const p of state.paras) {
        console.log(`  ${p.cutAnywhere ? "✂" : "·"} <${p.tag}> ${p.fontSize} rect ${JSON.stringify(p.rect)} sw/cw ${p.scrollVsClient.sw}/${p.scrollVsClient.cw} sh/ch ${p.scrollVsClient.sh}/${p.scrollVsClient.ch}`);
        console.log(`      FULL     «${p.text}»`);
        console.log(`      RENDERED «${p.rendered}»`);
        console.log(`      ${p.lines.length} line box(es); clippers: ${p.clippers.length === 0 ? "NONE" : p.clippers.map((c) => `${c.tag}(${c.overflow})`).join(" → ")}`);
      }
      const p = `${OUT}/${TAG}-${device.id}-hint.png`;
      const r = state.rect;
      await page.screenshot({ path: p, scale: "device", clip: { x: Math.max(0, r.l - 6), y: Math.max(0, r.t - 6), width: Math.min(device.width, r.w + 12), height: Math.min(device.height, r.h + 12) } });
      await page.screenshot({ path: `${OUT}/${TAG}-${device.id}-full.png`, scale: "device" });
      console.log(`  shot ${p}`);
    }

    // ── THE ONE LEVER SAFARI HAS AND THIS ENGINE DOES NOT: text size.
    //    Per-site page zoom / Dynamic Type is not emulable in Playwright, but
    //    the FONT half of it is: scale the root font size and re-read. If the
    //    sentence shatters at 130–200% that is a real, nameable fragility, and
    //    it is the only mechanism found that produces one word per line.
    if (drained) {
      rec.textSize = [];
      for (const pct of [130, 150, 200]) {
        await page.evaluate((p) => { document.documentElement.style.fontSize = `${(16 * p) / 100}px`; document.documentElement.style.setProperty("-webkit-text-size-adjust", `${p}%`); }, pct);
        await sleep(700);
        const s = await page.evaluate(HINT);
        const worst = s.paras?.[0];
        rec.textSize.push({ pct, paras: s.paras });
        console.log(`  TEXT ${pct}% · <p> rect ${JSON.stringify(worst?.rect)} · lines ${worst?.lines?.length} · cut ${worst?.cutAnywhere} · RENDERED «${worst?.rendered}»`);
        await page.screenshot({ path: `${OUT}/${TAG}-${device.id}-text${pct}.png`, scale: "device" });
      }
      await page.evaluate(() => { document.documentElement.style.fontSize = ""; document.documentElement.style.removeProperty("-webkit-text-size-adjust"); });
    }
  } catch (err) {
    rec.error = String(err?.message ?? err);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  await context.close();
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 2));
console.log(`\n[w11-rotate] wrote ${OUT}/${TAG}.json`);
await browser.close();
