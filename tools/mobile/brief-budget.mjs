#!/usr/bin/env node
// =============================================================================
// brief-budget.mjs — THE CARD'S BUDGET IN AUTHORED CHARACTERS.
//
// brief-fold.mjs measures the SHIPPED copy. This one measures the BOX: it puts
// candidate strings into the real card, in the real font, at the real width, on
// the real device profile, and reports how many wrapped line boxes each length
// costs and where the fold lands. React is not given a chance to re-render
// between the write and the read (one synchronous page.evaluate), so what is
// measured is the production layout with substituted text.
//
// Output answers exactly two questions:
//   1. How many characters of the LINE row cost how many line boxes?
//   2. Given a LINE of N characters, how many characters of the BODY survive
//      above the fold — i.e. does step 2's verb reach the student?
// =============================================================================
import { webkit } from "./lib/pw.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";
import { readFileSync } from "node:fs";

const BASE = "https://icon-undertaken-earliest-zope.trycloudflare.com";
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const CASES = JSON.parse(readFileSync(arg("cases"), "utf8"));
const DEVICE_IDS = arg("device", "iphone16-portrait,iphone16-landscape").split(",");
const FADE_PX = 10;

const PROBE = (cases) => {
  const FADE = 10;
  const win = document.querySelector("[data-sim-overlay-text]");
  const line = document.querySelector("[data-sim-overlay-text] > span");
  const body = document.querySelector("[data-sim-overlay-body]");
  if (!win || !line || !body) return { error: "card rows missing" };
  const out = [];
  for (const c of cases) {
    line.textContent = c.line;
    body.textContent = c.body;
    // force layout
    void win.offsetHeight;
    const winRect = win.getBoundingClientRect();
    const bandTop = winRect.top;
    const bandBottom = winRect.top + win.clientHeight - FADE;
    const visibleChars = (el) => {
      const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let idx = 0;
      let fold = null;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        const s = n.nodeValue || "";
        for (let i = 0; i < s.length; i++) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + 1);
          const rect = r.getBoundingClientRect();
          const ok =
            rect.height === 0 || (rect.top >= bandTop - 0.5 && rect.bottom <= bandBottom + 0.5);
          if (!ok && fold === null) fold = idx;
          idx++;
        }
      }
      return fold === null ? idx : fold;
    };
    const lh = parseFloat(getComputedStyle(line).lineHeight);
    const bh = parseFloat(getComputedStyle(body).lineHeight);
    const lineVis = visibleChars(line);
    const bodyVis = visibleChars(body);
    out.push({
      id: c.id,
      lineChars: c.line.length,
      lineBoxes: Math.round(line.getBoundingClientRect().height / lh),
      lineVisible: lineVis,
      bodyChars: c.body.length,
      bodyBoxes: Math.round(body.getBoundingClientRect().height / bh),
      bodyVisible: bodyVis,
      bodySeen: c.body.slice(0, bodyVis),
      bandPx: Math.round(bandBottom - bandTop),
      boxW: Math.round(winRect.width * 10) / 10,
    });
  }
  return { out };
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
  console.log(`\n${"=".repeat(96)}\n${id}`);
  try {
    await page.goto(`${BASE}/simulator?scenario=sc-zebra-approach&level=1`, {
      waitUntil: "domcontentloaded",
      timeout: 300000,
    });
    await page.waitForTimeout(22000);
    const speed = await page.evaluate(() =>
      (document.querySelector('[aria-label^="Скорост "]') || {}).getAttribute?.("aria-label"),
    );
    console.log(`  speedometer at rest: ${speed}`);
    const r = await page.evaluate(PROBE, CASES);
    if (r.error) console.log(`  ${r.error}`);
    else
      for (const row of r.out) {
        console.log(
          `  [${row.id}] box ${row.boxW}px band ${row.bandPx}px | LINE ${row.lineChars}ch -> ${row.lineBoxes} boxes, ${row.lineVisible} visible | BODY ${row.bodyChars}ch -> ${row.bodyBoxes} boxes, ${row.bodyVisible} visible`,
        );
        if (row.bodyVisible > 0) console.log(`        body seen: «${row.bodySeen.replace(/\n/g, " ⏎ ")}»`);
      }
  } catch (e) {
    console.log(`  ERROR ${e.message}`);
  }
  await context.close();
}
await browser.close();
