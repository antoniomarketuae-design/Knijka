/**
 * reveal-probe.mjs — does a REAL scrolling visitor ever see the landing page's
 * <Reveal> content, or does it stay at opacity 0?
 *
 * A full-page screenshot answered "blank", but a full-page capture is not a
 * visitor: Playwright stitches it without ever scrolling the document, so an
 * IntersectionObserver has no reason to fire. This probe scrolls for real and
 * reads the attribute + the computed opacity, which is the only version of the
 * question that matters.
 */
import { chromium } from "./pw.mjs";

const BASE = process.env.UI_BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "no-preference",
});
const page = await ctx.newPage();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const snapshot = async (label) => {
  const rows = await page.$$eval("[data-reveal]", (els) =>
    els.map((el) => ({
      state: el.getAttribute("data-reveal"),
      opacity: getComputedStyle(el).opacity,
      top: Math.round(el.getBoundingClientRect().top),
      text: (el.textContent ?? "").trim().slice(0, 34),
    })),
  );
  const none = await page.$$eval("section, div", (els) => els.filter((e) => e.hasAttribute("data-reveal")).length);
  console.log(`\n--- ${label} (${rows.length} reveal nodes, ${none} attributed) ---`);
  for (const r of rows) console.log(`  ${String(r.state).padEnd(7)} opacity=${r.opacity.padEnd(5)} top=${String(r.top).padStart(6)}  ${r.text}`);
};

await snapshot("at load, no scroll");

// Scroll the way a person does, in steps, letting the observer breathe.
for (let y = 0; y <= 4200; y += 700) {
  await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
  await page.waitForTimeout(350);
}
await page.waitForTimeout(800);
await snapshot("after scrolling to the bottom");

await browser.close();
