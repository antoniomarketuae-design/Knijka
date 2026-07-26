/**
 * ui-zoom.mjs — capture individual sections of a page at 2x so details can be
 * judged (type, hairlines, contrast) rather than guessed from a page-height
 * screenshot where everything is 30 px tall.
 *
 * Usage: node ui-zoom.mjs <outDir> [path]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "./ui-zoom";
const PATHNAME = process.argv[3] ?? "/";
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

/** [label, css selector] — one shot per section. */
const TARGETS = [
  ["rail", "section[aria-label='Накратко']"],
  ["proof", "#razbor"],
  ["what", "section[aria-labelledby='what-title']"],
  ["credibility", "#za-roditeli"],
  ["schools", "section[aria-labelledby='schools-title']"],
  ["close", "section[aria-labelledby='close-title']"],
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();
await page.goto(BASE + PATHNAME, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);

// Wake every scroll reveal before cropping anything.
const height = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= height; y += 700) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await page.waitForTimeout(200);
}
await page.waitForTimeout(700);

for (const [label, selector] of TARGETS) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) {
    console.log(`skip ${label} (no ${selector})`);
    continue;
  }
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  const file = join(OUT, `zoom_${label}.png`);
  await el.screenshot({ path: file });
  console.log(`ok ${label} -> ${file}`);
}

await browser.close();
