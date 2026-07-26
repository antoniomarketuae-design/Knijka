/**
 * reel-probe.mjs — prove the stop-motion reel actually animates, and that a
 * reduced-motion visitor never DOWNLOADS the four frames they cannot see.
 *
 * The reel hands its frame URLs in as a custom property and only USES them
 * inside `@media (prefers-reduced-motion: no-preference)`. That is the whole
 * trick, and it fails silently: if the declaration never resolves, the reel is
 * just a still and no screenshot would ever show the difference. So this
 * checks the computed background-image and the animation, and counts the
 * actual network requests for .k*.webp under both motion preferences.
 */
import { chromium } from "./pw.mjs";

const BASE = process.env.UI_BASE ?? "http://localhost:3000";
const browser = await chromium.launch({ headless: true });

for (const motion of ["no-preference", "reduce"]) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: motion,
  });
  const page = await ctx.newPage();
  const frameRequests = new Set();
  page.on("request", (r) => {
    const u = r.url();
    if (/\/clips\/.*\.k\d\.webp$/.test(u)) frameRequests.add(u.split("/").pop());
  });

  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);
  // Scroll the reel into view so its images are actually fetched.
  await page.locator("#razbor").scrollIntoViewIfNeeded();
  await page.waitForTimeout(2500);

  const frames = await page.$$eval(".reel-frame", (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        slot: cs.getPropertyValue("--reel-slot").trim(),
        hasImage: cs.backgroundImage !== "none",
        animation: cs.animationName,
        delay: cs.animationDelay,
        duration: cs.animationDuration,
      };
    }),
  );

  console.log(`\n=== prefers-reduced-motion: ${motion} ===`);
  for (const f of frames) {
    console.log(
      `  slot ${f.slot}  bg=${f.hasImage ? "yes" : "NO "}  anim=${f.animation}  delay=${f.delay}  dur=${f.duration}`,
    );
  }
  const distinct = [...frameRequests].sort();
  console.log(`  keyframe .webp requested: ${distinct.length}`);
  console.log(`    ${distinct.join(", ") || "(none)"}`);
  await ctx.close();
}

await browser.close();
