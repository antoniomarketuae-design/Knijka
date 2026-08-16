#!/usr/bin/env node
// =============================================================================
// brief-fold.mjs — HOW MUCH OF A BRIEFING STEP THE STUDENT ACTUALLY SEES.
//
// Not „is the card clipped" (wave11 proved that) but: WHERE IS THE FOLD, in
// AUTHORED CHARACTERS, for the line (step 1) and for the body (steps 2..n)?
//
// Method — Range-per-character, so the answer is in the units the author types:
//   walk every character of the rendered text node, take its client rect,
//   and call it VISIBLE when its rect lies inside the scroll window's own
//   visible band (top..top+clientHeight) AND inside the mask's opaque part
//   (the last TEXT_FADE_PX are a gradient, not text).
// The first character that fails is THE FOLD. Everything after it exists in
// the DOM and is invisible until the student discovers he can scroll a peek.
// =============================================================================
import { webkit } from "./lib/pw.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";

const BASE = "https://icon-undertaken-earliest-zope.trycloudflare.com";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const SCENARIO = arg("scenario", "sc-zebra-approach");
const LEVEL = arg("level", "1");
const DEVICE_IDS = arg("device", "iphone16-landscape,iphone16-portrait,small-landscape").split(",");
const FADE_PX = 10;

const PROBE = (FADE) => {
  const R = (n) => Math.round(n * 10) / 10;
  const win = document.querySelector("[data-sim-overlay-text]");
  if (!win) return { error: "no [data-sim-overlay-text] on the page" };
  const winRect = win.getBoundingClientRect();
  // The window's own VISIBLE band: its box minus the mask's fade tail.
  const bandTop = winRect.top;
  const bandBottom = winRect.top + win.clientHeight - FADE;

  function foldOf(el) {
    if (!el) return null;
    const text = el.textContent || "";
    const node = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode();
    if (!node) return { text, chars: text.length, visibleChars: 0 };
    // Walk EVERY text node of the element in order (the body is one node, the
    // line is one node, but do not assume it).
    const nodes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) nodes.push(n);
    let idx = 0;
    let fold = null;
    let visible = 0;
    for (const n of nodes) {
      const s = n.nodeValue || "";
      for (let i = 0; i < s.length; i++) {
        const r = document.createRange();
        r.setStart(n, i);
        r.setEnd(n, i + 1);
        const rect = r.getBoundingClientRect();
        const ok = rect.height === 0 || (rect.top >= bandTop - 0.5 && rect.bottom <= bandBottom + 0.5);
        if (ok) visible = idx + 1;
        else if (fold === null) fold = idx;
        idx++;
      }
    }
    return {
      chars: text.length,
      visibleChars: fold === null ? text.length : fold,
      firstHiddenIndex: fold,
      seen: text.slice(0, fold === null ? text.length : fold),
      lost: fold === null ? "" : text.slice(fold),
      scrollH: el.scrollHeight,
      clientH: el.clientHeight,
      lineHeightPx: R(parseFloat(getComputedStyle(el).lineHeight)),
      boxW: R(el.getBoundingClientRect().width),
    };
  }

  const line = document.querySelector("[data-sim-overlay-text] > span");
  const body = document.querySelector("[data-sim-overlay-body]");
  return {
    viewport: { w: innerWidth, h: innerHeight },
    window: {
      boxW: R(winRect.width),
      boxH: R(winRect.height),
      clientH: win.clientHeight,
      scrollH: win.scrollHeight,
      overflowPx: win.scrollHeight - win.clientHeight,
      visibleBandPx: R(bandBottom - bandTop),
    },
    line: foldOf(line),
    body: foldOf(body),
  };
};

const browser = await webkit.launch({ headless: true });
const { context: authCtx } = await newDeviceContext(browser, DEVICES[DEVICE_IDS[0]], { motion: "allow" });
const ap = await authCtx.newPage();
await signIn(ap, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

for (const id of DEVICE_IDS) {
  const { context } = await newDeviceContext(browser, DEVICES[id], { motion: "allow", storageState });
  const page = await context.newPage();
  console.log(`\n${"=".repeat(92)}\n${id}  ${SCENARIO}@L${LEVEL}`);
  try {
    await page.goto(`${BASE}/simulator?scenario=${SCENARIO}&level=${LEVEL}`, {
      waitUntil: "domcontentloaded",
      timeout: 300000,
    });
    await page.waitForTimeout(22000);
    const speed = await page.evaluate(() => {
      const el = document.querySelector('[aria-label^="Скорост "]');
      return el ? el.getAttribute("aria-label") : "NO SPEEDOMETER HOOK";
    });
    console.log(`  speedometer at rest: ${speed}`);
    const d = await page.evaluate(PROBE, FADE_PX);
    if (d.error) {
      console.log(`  ${d.error}`);
    } else {
      console.log(`  viewport ${d.viewport.w}x${d.viewport.h}`);
      console.log(
        `  text window ${d.window.boxW}x${d.window.boxH} · clientH ${d.window.clientH} · scrollH ${d.window.scrollH} · OVERFLOW ${d.window.overflowPx}px · visible band ${d.window.visibleBandPx}px`,
      );
      for (const [name, r] of [["LINE (step 1)", d.line], ["BODY (steps 2..n)", d.body]]) {
        if (!r) {
          console.log(`  ${name}: absent`);
          continue;
        }
        console.log(
          `  ${name}: ${r.chars} chars authored · ${r.visibleChars} VISIBLE (${r.chars ? Math.round((100 * r.visibleChars) / r.chars) : 0}%) · box ${r.boxW}px · line-height ${r.lineHeightPx}px`,
        );
        console.log(`      seen: «${r.seen}»`);
        if (r.lost) console.log(`      LOST: «${r.lost}»`);
      }
    }
  } catch (e) {
    console.log(`  ERROR ${e.message}`);
  }
  await context.close();
}
await browser.close();
