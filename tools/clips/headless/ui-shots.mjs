/**
 * ui-shots.mjs — screenshot the platform's public surfaces so they can be judged
 * by eye (the doc-66 R0 "look before you ship" discipline, applied to UI).
 *
 * Captures DESKTOP (1440x900) and MOBILE (390x844) for every page: mobile is the
 * real target device for a 17-year-old in Bulgaria, so a desktop-only capture
 * would hide the view that matters most.
 *
 * Also forces `prefers-color-scheme: dark` by default. The brand's cluster theme
 * is the intended look; a headless browser defaults to LIGHT, which is exactly
 * how an earlier review mistook the light-mode fallback for the design. Pass
 * `--light` to capture the light rendering deliberately.
 *
 * Uses the same pw.mjs wrapper as the clip renderer (it points Chromium's temp
 * dir at E: — the C: drive on this box is chronically full).
 *
 * Usage:  node ui-shots.mjs [outDir] [--light]
 */
import { chromium } from "./pw.mjs";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith("--")) ?? "./ui-shots";
const scheme = args.includes("--light") ? "light" : "dark";
const BASE = process.env.UI_BASE ?? "http://localhost:3000";

const PAGES = [
  { name: "landing", url: "/", full: true },
  { name: "login", url: "/login", full: false },
  { name: "pricing", url: "/pricing", full: true },
];

const VIEWPORTS = [
  { tag: "desktop", width: 1440, height: 900 },
  { tag: "mobile", width: 390, height: 844 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: scheme,
    isMobile: vp.tag === "mobile",
    hasTouch: vp.tag === "mobile",
    deviceScaleFactor: vp.tag === "mobile" ? 2 : 1,
  });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    try {
      await page.goto(BASE + p.url, { waitUntil: "networkidle", timeout: 120000 });
      // Let entrance/reveal choreography settle so the capture is the resting state,
      // not a half-played animation.
      await page.waitForTimeout(2500);
      const file = join(OUT, `ui_${p.name}_${vp.tag}.png`);
      await page.screenshot({ path: file, fullPage: p.full });
      console.log(`ok ${p.name}/${vp.tag} -> ${file}`);
    } catch (e) {
      console.log(`FAIL ${p.name}/${vp.tag}: ${String(e.message).slice(0, 140)}`);
    }
  }
  await ctx.close();
}

await browser.close();
