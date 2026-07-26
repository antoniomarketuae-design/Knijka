/**
 * ui-scroll.mjs — capture a page the way a HUMAN sees it: scroll down in
 * viewport-sized steps, pausing for scroll-triggered reveal choreography.
 *
 * Why this exists: a `fullPage` screenshot never scrolls, so any content gated
 * on an IntersectionObserver reveal stays at opacity 0 and the capture shows
 * huge empty voids that a real visitor would never see. This distinguishes a
 * capture artifact from an actual blank-section bug.
 *
 * Usage: node ui-scroll.mjs <url> <outDir> [viewportTag]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const [url = "http://localhost:3000/", OUT = "./ui-scroll", tag = "desktop"] = process.argv.slice(2);
const vp = tag === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: vp,
  colorScheme: "dark",
  isMobile: tag === "mobile",
  hasTouch: tag === "mobile",
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2000);

const total = await page.evaluate(() => document.body.scrollHeight);
const steps = Math.min(12, Math.ceil(total / vp.height));
console.log(`page height ${total}px -> ${steps} screens at ${vp.width}x${vp.height}`);

for (let i = 0; i < steps; i++) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), i * vp.height);
  // Long enough for reveal + stagger (--stagger 70ms x a few children) to settle.
  await page.waitForTimeout(1400);
  const file = join(OUT, `${tag}_${String(i).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  console.log(`  screen ${i} -> ${file}`);
}

// Report how many reveal nodes are still hidden after a full scroll-through —
// anything left hidden here is a REAL bug, not a capture artifact.
const stuck = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("[data-reveal]")];
  const hidden = nodes.filter((n) => getComputedStyle(n).opacity === "0");
  return { total: nodes.length, hidden: hidden.length };
});
console.log(`reveal nodes: ${stuck.total}, still hidden after scroll: ${stuck.hidden}`);

await browser.close();
