// R0 phone review, pass 2: interaction states, the cluster at speed, the
// install affordance, and the theory surfaces the founder already signed off.
import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "E:/AI driver/.r0phone";
mkdirSync(OUT, { recursive: true });
const BASE = `http://localhost:${process.env.R0_PORT ?? "3360"}`;

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

const INIT = `
  try { delete Element.prototype.requestFullscreen; } catch {}
  try { delete Element.prototype.webkitRequestFullscreen; } catch {}
  try { localStorage.setItem("sim.quality", "low"); } catch {}
  try { localStorage.setItem("sim.touchHintSeen", "1"); } catch {}
`;

async function phone(landscape = true) {
  const ctx = await browser.newContext({
    storageState: `${OUT}/state.json`,
    viewport: landscape ? { width: 844, height: 390 } : { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await ctx.addInitScript(INIT);
  return ctx;
}

async function simPage(ctx, query) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/hud-ux?quality=low&chrome=dashboard${query}`, {
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
  return page;
}

const report = {};

// -- 1. the 3D cluster at 0 / 58 / 132 --------------------------------------
{
  const ctx = await phone(true);
  for (const s of ["0", "58", "132"]) {
    const page = await simPage(ctx, `&clusterSpeed=${s}&clusterGear=D`);
    writeFileSync(`${OUT}/cluster_${s}.png`, await page.screenshot({ timeout: 180_000, animations: "disabled" }));
    await page.close();
  }
  await ctx.close();
  console.log("cluster shots done");
}

// -- 2. the micro menu open, and the teach card expanded ---------------------
{
  const ctx = await phone(true);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/dev/hud-ux?quality=low&chrome=dashboard`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await page.waitForSelector("canvas", { timeout: 180_000 });
  await page.waitForTimeout(16_000);

  // teach card present? expand it before acknowledging.
  const more = page.locator('button:has-text("Повече")');
  if ((await more.count()) > 0) {
    await more.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
    report.teachExpanded = await page.evaluate(() => {
      const btn = [...document.querySelectorAll("button")].find(
        (b) => (b.textContent ?? "").trim() === "Разбрах",
      );
      if (!btn) return null;
      let el = btn;
      while (el && el.parentElement) {
        const cs = getComputedStyle(el);
        if (cs.position === "absolute" || cs.position === "fixed") break;
        el = el.parentElement;
      }
      const r = el.getBoundingClientRect();
      const dash = document.querySelector('[aria-label="Табло на автомобила"]');
      const dr = dash ? dash.getBoundingClientRect() : null;
      return {
        x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
        pctOfViewport: +((r.height / window.innerHeight) * 100).toFixed(1),
        belowFold: Math.round(r.bottom - window.innerHeight),
        overlapWithDash: dr ? Math.round(Math.max(0, Math.min(r.bottom, dr.bottom) - Math.max(r.top, dr.top))) : null,
      };
    });
    writeFileSync(`${OUT}/teach_expanded.png`, await page.screenshot({ timeout: 180_000, animations: "disabled" }));
  }
  for (let i = 0; i < 6; i++) {
    const b = page.locator('button:text-is("Разбрах")');
    if ((await b.count()) === 0) break;
    await b.first().click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(2000);

  await page.locator('button[aria-label="Меню на урока"]').click({ timeout: 10_000 });
  await page.waitForTimeout(900);
  report.menu = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"]');
    if (!m) return null;
    const r = m.getBoundingClientRect();
    const items = [...m.querySelectorAll('[role="menuitem"]')].map((b) => {
      const br = b.getBoundingClientRect();
      return { label: (b.textContent ?? "").trim().slice(0, 28), h: Math.round(br.height), w: Math.round(br.width) };
    });
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      pctOfViewport: +(((r.width * r.height) / (window.innerWidth * window.innerHeight)) * 100).toFixed(1),
      belowFold: Math.round(r.bottom - window.innerHeight),
      items,
      scrolls: m.scrollHeight > m.clientHeight + 1,
    };
  });
  writeFileSync(`${OUT}/menu_open.png`, await page.screenshot({ timeout: 180_000, animations: "disabled" }));
  await page.close();
  await ctx.close();
  console.log("menu/teach done");
}

// -- 3. install affordance + where it does/doesn't render --------------------
for (const [tag, land] of [["land", true], ["port", false]]) {
  const ctx = await phone(land);
  const page = await ctx.newPage();
  const seen = {};
  for (const route of ["/dashboard", "/simulator", "/theory"]) {
    await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForTimeout(6000);
    seen[route] = await page.evaluate(() => {
      const hits = [...document.querySelectorAll("*")].filter((el) =>
        /Инсталирай|начален екран|На екрана|Добави/i.test(el.textContent ?? ""),
      );
      const el = hits.length ? hits[hits.length - 1] : null;
      if (!el) return null;
      let box = el;
      while (box && box.parentElement) {
        const cs = getComputedStyle(box);
        if (cs.position === "fixed" || cs.position === "sticky") break;
        box = box.parentElement;
      }
      const r = box.getBoundingClientRect();
      return {
        text: (el.textContent ?? "").trim().slice(0, 80),
        h: Math.round(r.height),
        pctOfViewport: +((r.height / window.innerHeight) * 100).toFixed(1),
      };
    });
    writeFileSync(
      `${OUT}/inst_${tag}_${route.replace(/\//g, "_")}.png`,
      await page.screenshot({ timeout: 120_000, animations: "disabled" }),
    );
  }
  report[`install_${tag}`] = seen;
  await page.close();
  await ctx.close();
}
console.log("install done");

// -- 4. theory practice: answer controls + mastery ink ----------------------
{
  const ctx = await phone(false);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/theory/practice`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(9000);
  writeFileSync(`${OUT}/theory_practice.png`, await page.screenshot({ timeout: 120_000, animations: "disabled", fullPage: false }));
  report.practice = await page.evaluate(() => ({
    url: location.pathname,
    text: document.body.innerText.slice(0, 300).replace(/\s+/g, " "),
    inputs: document.querySelectorAll('input[type=radio],input[type=checkbox],button').length,
  }));
  await page.close();
  await ctx.close();
}

writeFileSync(`${OUT}/measure2.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
