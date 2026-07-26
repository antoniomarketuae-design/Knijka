/**
 * ui-region.mjs — capture a rectangle of the page in PAGE coordinates,
 * expanded around a selector.
 *
 * Element screenshots crop to the element's own box, which lies about any
 * child that overflows it (a negative-margin panel, a lifted card). This
 * captures the neighbourhood instead, so what you see is what a visitor sees.
 *
 * Usage: node ui-region.mjs <outFile> <selector> [padPx] [path]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const [outFile, selector, padArg, pathArg] = process.argv.slice(2);
const PAD = Number(padArg ?? 60);
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

mkdirSync(dirname(outFile), { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();
await page.goto(BASE + (pathArg ?? "/"), { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= height; y += 700) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await page.waitForTimeout(200);
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(600);

const box = await page.locator(selector).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
});

await page.screenshot({
  path: outFile,
  fullPage: true,
  clip: {
    x: Math.max(0, box.x - PAD),
    y: Math.max(0, box.y - PAD),
    width: box.width + PAD * 2,
    height: box.height + PAD * 2,
  },
});
console.log(`ok -> ${outFile}  (element box ${JSON.stringify(box)})`);
await browser.close();
