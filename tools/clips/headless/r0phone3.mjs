// R0 phone review, pass 3: the mirror glance, the band at three digits, and
// the end screen on a landscape phone.
import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "E:/AI driver/.r0phone";
mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.R0_PORT ?? "3360"}`;

const browser = await chromium.launch({
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const INIT = `
  try { delete Element.prototype.requestFullscreen; } catch {}
  try { localStorage.setItem("sim.quality", "low"); } catch {}
  try { localStorage.setItem("sim.touchHintSeen", "1"); } catch {}
`;

async function open(landscape) {
  const ctx = await browser.newContext({
    storageState: `${OUT}/state.json`,
    viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/hud-ux?quality=low&chrome=dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await page.waitForSelector("canvas", { timeout: 180_000 });
  await page.waitForTimeout(16_000);
  for (let i = 0; i < 6; i++) {
    const b = page.locator('button:text-is("Разбрах")');
    if ((await b.count()) === 0) break;
    await b.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(2500);
  return { ctx, page };
}

const report = {};

// -- band at three digits ----------------------------------------------------
for (const [tag, land] of [["land", true], ["port", false]]) {
  const { ctx, page } = await open(land);
  report[`band_${tag}`] = await page.evaluate(() => {
    const bar = document.querySelector('[aria-label="Табло на автомобила"]');
    if (!bar) return null;
    const before = {
      scrollW: bar.scrollWidth,
      clientW: bar.clientWidth,
      h: Math.round(bar.getBoundingClientRect().height),
    };
    // The speed number lives in a tabular-nums span; find the one that reads a
    // pure integer and widen it to three digits, then re-measure synchronously
    // (the bar repaints from its own 100 ms poll right after).
    const spans = [...bar.querySelectorAll("span")];
    const num = spans.find((s) => /^\d{1,3}$/.test((s.textContent ?? "").trim()));
    if (!num) return { before, widened: null };
    num.textContent = "132";
    const widened = {
      scrollW: bar.scrollWidth,
      clientW: bar.clientWidth,
      overflows: bar.scrollWidth > bar.clientWidth + 1,
    };
    return { before, widened };
  });
  writeFileSync(`${OUT}/band3_${tag}.png`, await page.screenshot({ timeout: 120_000 }));
  await ctx.close();
}

// -- mirror glance -----------------------------------------------------------
{
  const { ctx, page } = await open(true);
  const btn = page.locator('button[aria-label*="огледалото за задно"]');
  report.mirrorButton = (await btn.count()) > 0;
  if (report.mirrorButton) {
    await btn.first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1800);
    writeFileSync(`${OUT}/mirror_glance.png`, await page.screenshot({ timeout: 120_000 }));
    await page.mouse.up().catch(() => {});
  }
  // left mirror too
  const lb = page.locator('button[aria-label*="лявото огледало"]');
  if ((await lb.count()) > 0) {
    await lb.first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1800);
    writeFileSync(`${OUT}/mirror_left.png`, await page.screenshot({ timeout: 120_000 }));
  }
  await ctx.close();
}

// -- end screen --------------------------------------------------------------
{
  const { ctx, page } = await open(true);
  await page.locator('button[aria-label="Меню на урока"]').click({ timeout: 10_000 });
  await page.waitForTimeout(800);
  const finish = page.locator('[role="menuitem"]:has-text("Завърши сесията")');
  if ((await finish.count()) > 0) {
    await finish.first().click({ timeout: 10_000 });
    await page.waitForTimeout(6000);
    writeFileSync(`${OUT}/end_screen.png`, await page.screenshot({ timeout: 120_000 }));
    report.end = await page.evaluate(() => {
      const se = document.scrollingElement;
      const root = document.querySelector("[data-sim-compact]");
      const cs = root ? getComputedStyle(root) : null;
      return {
        scroll: { w: se.scrollWidth, h: se.scrollHeight },
        vp: { w: window.innerWidth, h: window.innerHeight },
        dashH: cs ? cs.getPropertyValue("--sim-dash-h").trim() : null,
        text: document.body.innerText.slice(0, 260).replace(/\s+/g, " "),
        dashVisible: !!document.querySelector('[aria-label="Табло на автомобила"]'),
      };
    });
  }
  await ctx.close();
}

writeFileSync(`${OUT}/measure3.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
