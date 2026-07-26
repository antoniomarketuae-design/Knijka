/**
 * ui-mobile-zoom.mjs — the landing page on the device this product is actually
 * built for: a 390px-wide Android, touch-primary, at 2x.
 *
 * Captures viewport-sized slices down the page rather than one 12,000px-tall
 * image, because a full-page mobile screenshot scaled to fit is unreadable and
 * therefore useless for the R0 "look before you ship" check.
 *
 * Usage: node ui-mobile-zoom.mjs <outDir> [path] [slices]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "./ui-mobile";
const PATHNAME = process.argv[3] ?? "/";
const SLICES = Number(process.argv[4] ?? 6);
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();
await page.goto(BASE + PATHNAME, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const height = await page.evaluate(() => document.body.scrollHeight);
// Wake the reveals first, then come back and shoot slice by slice.
for (let y = 0; y <= height; y += 600) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await page.waitForTimeout(180);
}

const step = Math.floor(height / SLICES);
for (let i = 0; i < SLICES; i += 1) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), i * step);
  await page.waitForTimeout(450);
  const file = join(OUT, `m${String(i).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  console.log(`ok slice ${i} @ y=${i * step} -> ${file}`);
}

await browser.close();
