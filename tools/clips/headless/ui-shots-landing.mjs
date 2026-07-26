/**
 * ui-shots-landing.mjs — look at the rebuilt marketing surfaces before shipping
 * them (doc 66 R0), across the states that actually differ.
 *
 * Sibling of ui-shots.mjs; separate because the landing rebuild has to be
 * judged in FOUR states, not one: desktop (where the live 3D hero engages),
 * mobile (where it must not), reduced motion (where nothing may move and the
 * reel must rest on its fault frame), and the schools page.
 *
 * It also prints the hero's own decision attributes, so "did the 3D actually
 * come up, and if not why" is answered by the run rather than by squinting.
 *
 * Usage:  node ui-shots-landing.mjs [outDir]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2] ?? "./ui-shots-landing";
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

const SHOTS = [
  {
    name: "landing-desktop",
    url: "/",
    viewport: { width: 1440, height: 900 },
    full: true,
    settle: 4000,
  },
  {
    name: "landing-hero-desktop",
    url: "/",
    viewport: { width: 1440, height: 900 },
    full: false,
    settle: 5000,
  },
  {
    name: "landing-mobile",
    url: "/",
    viewport: { width: 390, height: 844 },
    full: true,
    settle: 2500,
    mobile: true,
  },
  {
    name: "landing-reduced-motion",
    url: "/",
    viewport: { width: 1440, height: 900 },
    full: true,
    settle: 2500,
    reducedMotion: "reduce",
  },
  {
    name: "schools-desktop",
    url: "/za-avtoshkoli",
    viewport: { width: 1440, height: 900 },
    full: true,
    settle: 2000,
  },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const shot of SHOTS) {
  const ctx = await browser.newContext({
    viewport: shot.viewport,
    reducedMotion: shot.reducedMotion ?? "no-preference",
    hasTouch: shot.mobile === true,
    isMobile: shot.mobile === true,
    deviceScaleFactor: shot.mobile === true ? 2 : 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 160));
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message).slice(0, 160)));
  // A 404 on a clip still is the failure mode this rebuild is guarding against.
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url().slice(0, 110)}`);
  });

  try {
    await page.goto(BASE + shot.url, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForTimeout(shot.settle);

    // Scroll the whole page before a full-page capture, then return to the top.
    // Playwright's fullPage stitches the document WITHOUT scrolling it, so a
    // scroll-linked <Reveal> never intersects and the shot comes back blank —
    // a capture artifact that looks exactly like a broken page. Verified with
    // reveal-probe.mjs: after a real scroll every node is shown/opacity 1.
    if (shot.full) {
      const height = await page.evaluate(() => document.body.scrollHeight);
      for (let y = 0; y <= height; y += Math.round(shot.viewport.height * 0.8)) {
        await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
        await page.waitForTimeout(220);
      }
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.waitForTimeout(600);
    }

    const hero = await page
      .locator("[data-hero-mode]")
      .first()
      .evaluate((el) => ({
        mode: el.getAttribute("data-hero-mode"),
        decline: el.getAttribute("data-hero-decline"),
      }))
      .catch(() => null);

    const file = join(OUT, `${shot.name}.png`);
    await page.screenshot({ path: file, fullPage: shot.full });
    console.log(
      `ok ${shot.name.padEnd(24)} hero=${hero ? `${hero.mode}${hero.decline ? `/${hero.decline}` : ""}` : "n/a"}` +
        (errors.length ? `  ISSUES: ${[...new Set(errors)].slice(0, 4).join(" | ")}` : "  (no console/network errors)"),
    );
  } catch (e) {
    console.log(`FAIL ${shot.name}: ${String(e.message).slice(0, 160)}`);
  }
  await ctx.close();
}

await browser.close();
