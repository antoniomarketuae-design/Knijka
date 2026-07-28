// R0 phone review harness (throwaway). Renders the real LessonPlayShell on a
// phone profile and MEASURES the frame from pixels, not from layout maths.
import { chromium } from "./pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const sharp = (await import(
  pathToFileURL("E:/AI driver/platform/node_modules/sharp/dist/index.cjs").href
)).default;

const OUT = "E:/AI driver/.r0phone";
mkdirSync(OUT, { recursive: true });

const PORT = process.env.R0_PORT ?? "3360";
const BASE = `http://localhost:${PORT}`;

const browser = await chromium.launch({
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

/** iPhone Safari has no Fullscreen API for non-video elements. */
const safariInit = (standalone) => `
  try { delete Element.prototype.requestFullscreen; } catch {}
  try { delete Element.prototype.webkitRequestFullscreen; } catch {}
  try { delete Document.prototype.exitFullscreen; } catch {}
  try { Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true }); } catch {}
  try { localStorage.setItem("sim.quality", "low"); } catch {}
  try { localStorage.setItem("sim.touchHintSeen", "1"); } catch {}
  ${
    standalone
      ? `
  // iOS home-screen launch: navigator.standalone is the only truthful signal
  // Safari has ever given, and the app reads it. Also fake the standard MQ.
  try { Object.defineProperty(window.navigator, "standalone", { value: true, configurable: true }); } catch {}
  (function () {
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
      if (/display-mode:\\s*standalone/.test(q)) {
        return { matches: true, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } };
      }
      if (/display-mode:\\s*browser/.test(q)) {
        return { matches: false, media: q, onchange: null, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}, dispatchEvent(){ return false; } };
      }
      return orig(q);
    };
  })();`
      : ""
  }
`;

async function shot(page, file) {
  const buf = await page.screenshot({ timeout: 180_000, animations: "disabled" });
  writeFileSync(`${OUT}/${file}`, buf);
  return buf;
}

async function raw(buf) {
  return sharp(buf).raw().toBuffer({ resolveWithObject: true });
}

function maskOf(a, b, tol = 12) {
  const { width, height, channels } = a.info;
  const mask = new Uint8Array(width * height);
  let n = 0;
  for (let i = 0, p = 0; p < mask.length; i += channels, p++) {
    const d =
      Math.abs(a.data[i] - b.data[i]) +
      Math.abs(a.data[i + 1] - b.data[i + 1]) +
      Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (d > tol) {
      mask[p] = 1;
      n++;
    }
  }
  return { mask, width, height, n };
}

const GEOM = () => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const canvas = document.querySelector("canvas");
  const cr = canvas ? canvas.getBoundingClientRect() : null;
  const boxes = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.tagName === "CANVAS") continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const paints =
      cs.backgroundColor !== "rgba(0, 0, 0, 0)" ||
      cs.borderTopWidth !== "0px" ||
      cs.backdropFilter !== "none";
    if (!paints) continue;
    boxes.push({
      tag: el.tagName,
      cls: String(el.className).slice(0, 70),
      hud: el.getAttribute("data-hud") ?? "",
      label: el.getAttribute("aria-label") ?? (el.textContent ?? "").trim().slice(0, 36),
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      bg: cs.backgroundColor,
      pe: cs.pointerEvents,
    });
  }
  const overflow = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    if (r.bottom > vh + 1 || r.right > vw + 1 || r.top < -1 || r.left < -1) {
      overflow.push({
        tag: el.tagName,
        cls: String(el.className).slice(0, 55),
        hud: el.getAttribute("data-hud") ?? "",
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
      });
    }
  }
  const se = document.scrollingElement;
  return {
    vw,
    vh,
    dpr: window.devicePixelRatio,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true,
    coarse: window.matchMedia("(pointer: coarse)").matches,
    visualViewport: window.visualViewport
      ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height) }
      : null,
    canvas: cr
      ? { x: Math.round(cr.x), y: Math.round(cr.y), w: Math.round(cr.width), h: Math.round(cr.height) }
      : null,
    scroll: { w: se.scrollWidth, h: se.scrollHeight },
    cssVars: (() => {
      const root = document.querySelector("[data-sim-compact]");
      if (!root) return null;
      const cs = getComputedStyle(root);
      return {
        dashH: cs.getPropertyValue("--sim-dash-h").trim(),
        hudFloor: cs.getPropertyValue("--sim-hud-floor").trim(),
        vh: cs.getPropertyValue("--sim-vh").trim(),
      };
    })(),
    teach: (() => {
      const el =
        document.querySelector('[aria-label*="Учебен"], [data-teach], [role="dialog"]') ?? null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute("aria-label") ?? "",
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    })(),
    boxes,
    overflow: overflow.slice(0, 30),
    quality: (() => {
      try {
        return localStorage.getItem("sim.quality");
      } catch {
        return null;
      }
    })(),
  };
};

async function run({ name, width, height, standalone, url }) {
  const context = await browser.newContext({
    storageState: `${OUT}/state.json`,
    viewport: { width, height },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });
  await context.addInitScript(safariInit(standalone));
  const page = await context.newPage();
  if (standalone) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      media: "screen",
      features: [{ name: "display-mode", value: "standalone" }],
    });
  }
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForSelector("canvas", { timeout: 180_000 });
  await page.waitForTimeout(16_000);
  if (!page.url().includes("/dev/hud-ux")) throw new Error(`navigated away: ${page.url()}`);
  if ((await page.locator("canvas").count()) === 0) throw new Error("no canvas after settle");

  // -- the TEACH state, if the engine has queued a moment ---------------------
  const teachGeom = await page.evaluate(() => {
    const btn = [...document.querySelectorAll("button")].find(
      (b) => (b.textContent ?? "").trim() === "Разбрах",
    );
    if (!btn) return null;
    // the teach sheet = the positioned ancestor that actually paints
    let el = btn;
    while (el && el.parentElement) {
      const cs = getComputedStyle(el);
      if (cs.position === "absolute" || cs.position === "fixed") break;
      el = el.parentElement;
    }
    const r = el.getBoundingClientRect();
    const dash = document.querySelector('[aria-label="Табло на автомобила"]');
    const dr = dash ? dash.getBoundingClientRect() : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      card: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      cardPctOfViewport: +(((r.width * r.height) / (vw * vh)) * 100).toFixed(1),
      cardHeightPct: +((r.height / vh) * 100).toFixed(1),
      belowFold: Math.round(r.bottom - vh),
      dash: dr
        ? { x: Math.round(dr.x), y: Math.round(dr.y), w: Math.round(dr.width), h: Math.round(dr.height) }
        : null,
      overlapPx: dr ? Math.round(Math.max(0, Math.min(r.bottom, dr.bottom) - Math.max(r.top, dr.top))) : null,
    };
  });
  if (teachGeom) await shot(page, `${name}_teach.png`);

  // Acknowledge every queued teach moment so the headline measurement is of a
  // student who is actually DRIVING, not of a paused mini-lesson.
  for (let i = 0; i < 8; i++) {
    const btn = page.locator('button:text-is("Разбрах")');
    if ((await btn.count()) === 0) break;
    await btn.first().click({ timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(900);
  }
  await page.waitForTimeout(3500);

  const geom = await page.evaluate(GEOM);
  const a1 = await shot(page, `${name}_A.png`);
  const a2 = await shot(page, `${name}_A2.png`);

  // Everything except the canvas (and its ancestors) goes invisible.
  await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    for (const el of document.querySelectorAll("body *")) {
      if (el === canvas || el.contains(canvas)) continue;
      el.setAttribute("data-r0-hidden", "1");
      el.style.setProperty("visibility", "hidden", "important");
    }
  });
  await page.waitForTimeout(2500);
  const bare = await shot(page, `${name}_bare.png`);

  // …then bring the touch driving controls back, alone.
  const hasTouchControls = await page.evaluate(() => {
    const tc = document.querySelector('[data-hud="touch-controls"]');
    if (!tc) return false;
    tc.style.setProperty("visibility", "visible", "important");
    for (const el of tc.querySelectorAll("*")) el.style.setProperty("visibility", "visible", "important");
    return true;
  });
  await page.waitForTimeout(1200);
  const withTouch = hasTouchControls ? await shot(page, `${name}_touch.png`) : bare;

  const [ra1, ra2, rbare, rtouch] = await Promise.all([raw(a1), raw(a2), raw(bare), raw(withTouch)]);
  const noise = maskOf(ra1, ra2);
  const chrome = maskOf(ra1, rbare);
  const touch = maskOf(rbare, rtouch);

  // chrome minus touch controls
  let chromeNoTouch = 0;
  for (let i = 0; i < chrome.mask.length; i++) if (chrome.mask[i] && !touch.mask[i]) chromeNoTouch++;

  const total = chrome.width * chrome.height;
  const rows = [];
  for (let y = 0; y < chrome.height; y++) {
    let c = 0;
    for (let x = 0; x < chrome.width; x++) if (chrome.mask[y * chrome.width + x]) c++;
    rows.push(+(c / chrome.width).toFixed(3));
  }
  await context.close();
  return {
    name,
    geom,
    teachGeom,
    errors: errors.slice(0, 5),
    px: { w: chrome.width, h: chrome.height, total },
    noisePct: +((noise.n / total) * 100).toFixed(2),
    chromePct: +((chrome.n / total) * 100).toFixed(2),
    touchPct: +((touch.n / total) * 100).toFixed(2),
    livePct: +(100 - (chrome.n / total) * 100).toFixed(2),
    liveInclTouchPct: +(100 - (chromeNoTouch / total) * 100).toFixed(2),
    rowProfile: rows,
  };
}

// -- log in once (the harness pulls a server action that requires a user) ----
{
  const c = await browser.newContext();
  const p = await c.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await p.waitForTimeout(4000); // a controlled input ignores a pre-hydration fill
  await p.click("#email");
  await p.locator("#email").pressSequentially("founder@knijka.ai", { delay: 12 });
  await p.click("#password");
  await p
    .locator("#password")
    .pressSequentially(process.env.SEED_FOUNDER_PASSWORD ?? "founder-dev", { delay: 12 });
  await p.click("button[type=submit]");
  for (let i = 0; i < 60 && new URL(p.url()).pathname.startsWith("/login"); i++) {
    await p.waitForTimeout(1000);
  }
  if (new URL(p.url()).pathname.startsWith("/login")) {
    const txt = await p.evaluate(() => document.body.innerText.slice(0, 400));
    throw new Error("login failed: " + txt.replace(/\s+/g, " "));
  }
  console.log("logged in ->", p.url());
  await c.storageState({ path: `${OUT}/state.json` });
  await c.close();
}

const url = process.env.R0_URL ?? `${BASE}/dev/hud-ux?quality=low&chrome=dashboard`;
const only = process.env.R0_ONLY ? process.env.R0_ONLY.split(",") : null;
const configs = [
  { name: "safaritab", width: 844, height: 316, standalone: false },
];
const results = [];
for (const cfg of configs) {
  if (only && !only.includes(cfg.name)) continue;
  console.log("running", cfg.name);
  results.push(await run({ ...cfg, url }));
}
writeFileSync(`${OUT}/measure.json`, JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(
    r.name,
    "vp", r.geom.vw + "x" + r.geom.vh,
    "canvas", JSON.stringify(r.geom.canvas),
    "standalone", r.geom.standalone,
    "live%", r.livePct,
    "live+touch%", r.liveInclTouchPct,
    "touch%", r.touchPct,
    "noise%", r.noisePct,
    "scroll", JSON.stringify(r.geom.scroll),
    "vars", JSON.stringify(r.geom.cssVars),
    "overflow", r.geom.overflow.length,
    "err", r.errors.length,
  );
}
await browser.close();
