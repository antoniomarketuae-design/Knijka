// =============================================================================
// wave5-card-text.mjs — ITEM 4: WHAT THE «НАПРЕДНАЛ» CARD ACTUALLY SAYS, TO
// EACH READER, ON THE SAME PRODUCTION BUILD.
//
// `controlPhrases.test.ts` proves the two sentences exist and teach the same
// decision. It cannot prove the shell SELECTS between them, because the
// selector is `hintInputFor(hasTouchScreen())` — a browser media query. So this
// raises the card twice on one build, one route, one code path, and the only
// thing that differs is the viewport:
//
//   a phone   → «СЪЕД» / «M►» / „Тези бутони са зад „Кола“ горе на екрана."
//   a desktop → съединителя (Z) / с клавиш ]
//
// The card is read off its OWN element rather than out of `body.innerText`:
// the notification card is a clipped box and innerText skips what it clips,
// which is how a first attempt printed "(no card on screen)" for a card that
// was plainly on screen and 141×98 px.
//
//   node wave5-card-text.mjs --base http://localhost:3491
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3491");
const ROUTE = "/simulator?scenario=sc-zebra-approach&level=1";
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/j5-cardtext`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROOMY = {
  id: "desktop-roomy", label: "Desktop — 1264x619 (the keyboard reader)",
  width: 1264, height: 619, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
  ua: undefined, orientation: "landscape",
};
const devices = process.argv.includes("--only-desktop") ? [ROOMY] : [...resolveDevices((arg("device", "galaxy-gesturebar-portrait")).split(",")), ROOMY];

const user = await ensureHarnessUser();
const browser = await chromium.launch({ args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const { context: authContext } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authContext.newPage();
await signIn(authPage, { email: user.email, password: user.password }, BASE);
const storageState = await authContext.storageState();
await authContext.close();

const rows = [];
for (const device of devices) {
  const roomy = device.id === "desktop-roomy";
  // ⚠ THE DESKTOP ROW MUST TURN TOUCH OFF EXPLICITLY, AND THIS COST ME A RUN.
  // `lib/devices.mjs:contextOptions` hard-codes `isMobile: true, hasTouch: true`
  // for EVERY profile — sensible for a phone ladder, wrong for the one row whose
  // whole job is to be a keyboard reader. A first attempt opened this viewport
  // with touch emulation on, `(any-pointer: coarse)` answered TRUE at 1264×619,
  // and the app quite correctly handed a "desktop" the touch copy. The control
  // was not a control. `newDeviceContext` spreads its extra options AFTER
  // `contextOptions`, so these two override.
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: roomy ? "none" : "real",
    storageState,
    ...(roomy ? { isMobile: false, hasTouch: false } : {}),
  });
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${insetBanner(device, inset)}`);

  const tap = async (x, y) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 3, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(90);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x, y, id: 3, radiusX: 12, radiusY: 12, force: 1 }] });
    await sleep(430);
  };
  const tapLabel = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll("button,[aria-label]")) {
        if (!rx.test(el.getAttribute("aria-label") || "")) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
      }
      return null;
    }, re);
    if (!c) return false;
    await tap(c.x, c.y);
    return true;
  };

  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"], canvas', { timeout: 240_000 });
  await sleep(4000);
  for (let i = 0; i < 6; i += 1) {
    const hit = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
      return false;
    });
    if (!hit) break;
    await sleep(460);
  }
  await sleep(600);

  const predicate = await page.evaluate(() => ({
    coarse: window.matchMedia("(any-pointer: coarse)").matches,
    finePointer: window.matchMedia("(pointer: fine)").matches,
    maxTouchPoints: navigator.maxTouchPoints,
    compact: document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
    touchOverlay: !!document.querySelector('[data-hud="touch-controls"]'),
  }));
  console.log(`  PREDICATE · (any-pointer:coarse)=${predicate.coarse} · (pointer:fine)=${predicate.finePointer} · maxTouchPoints=${predicate.maxTouchPoints} · compact=${predicate.compact} · touch overlay mounted=${predicate.touchOverlay}`);

  if (roomy) {
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^Напреднал$/.test((x.textContent || "").trim()));
      if (b) b.click();
    });
  } else {
    await tapLabel(/^Контроли на автомобила$/);
    await sleep(600);
    for (let i = 0; i < 4; i += 1) {
      const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
      if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
      await tapLabel(/^Ниво на помощта/);
      await sleep(500);
    }
  }
  await sleep(1400);

  // ── THE CARD ARRIVES COLLAPSED ON A PHONE, AND THAT IS THE REAL ITEM-4 STORY.
  // Looked at rather than asserted (R0): on every phone profile the frame shows
  // ONLY the title «Скоростният лост е на N» plus a «ЗАЩО» chip and a ✕. The
  // 400-character sentence that names «СЪЕД» and «M►» is behind «ЗАЩО». On the
  // desktop row the same card renders its body inline. So the copy is measured
  // TWICE: as it first appears, and after the one press that opens it.
  const anywhere = await page.evaluate(() => {
    const t = (document.body.innerText || "").replace(/s+/g, " ");
    return /„Напреднал“ е с ръчна[^]{0,460}/.exec(t)?.[0] ?? null;
  });
  console.log(`  ANYWHERE ON THE PAGE · ${anywhere ?? "(not found)"}`);
  const collapsedText = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[aria-label]")].find((n) => /^Скоростният лост е на/.test(n.getAttribute("aria-label") || ""));
    return el ? (el.textContent || "").replace(/\s+/g, " ").trim() : null;
  });
  const whyPressed = await tapLabel(/^Защо|^ЗАЩО/) || await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /^ЗАЩО$/i.test((x.textContent || "").trim()));
    if (b) { b.click(); return true; }
    return false;
  });
  await sleep(1200);

  // OFF THE CARD'S OWN ELEMENT. A notification card is a clipped box and
  // `body.innerText` omits what it clips — the reason a first attempt reported
  // "(no card on screen)" for a card 141×98 px and plainly visible.
  const card = await page.evaluate(() => {
    const el = [...document.querySelectorAll("[aria-label]")].find((n) => /^Скоростният лост е на/.test(n.getAttribute("aria-label") || ""));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      label: el.getAttribute("aria-label"),
      text: (el.textContent || "").replace(/\s+/g, " ").trim(),
      box: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      // Is the whole sentence actually rendered, or is the box clipping it?
      clipped: el.scrollHeight > el.clientHeight + 1,
      scrollH: el.scrollHeight, clientH: el.clientHeight,
    };
  });
  const namesTouch = card ? /„СЪЕД“|«СЪЕД»|СЪЕД/.test(card.text) && /„M►“|M►/.test(card.text) : false;
  const namesKeys = card ? /\(Z\)|клавиш \]/.test(card.text) : false;
  console.log(`  CARD  «${card?.label ?? "(none)"}» [${card?.box.x},${card?.box.y} ${card?.box.w}x${card?.box.h}] clipped=${card?.clipped}`);
  console.log(`  TEXT  ${card?.text ?? "(none)"}`);
  console.log(`  NAMES the touch cells: ${namesTouch} · names the KEYS: ${namesKeys}`);
  await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 }).catch(() => {});
  console.log(`  COLLAPSED (as it arrives): ${collapsedText ?? "(none)"}`);
  console.log(`  «ЗАЩО» pressed: ${whyPressed}`);
  const src = card?.text || anywhere || "";
  const nt = /„СЪЕД“|СЪЕД/.test(src) && /„M►“|M►/.test(src);
  const nk = /(Z)|клавиш ]/.test(src);
  console.log(`  FINAL · names touch cells ${nt} · names keys ${nk}`);
  rows.push({ device: device.id, label: device.label, predicate, collapsedText, anywhere, whyPressed, card, namesTouch: nt, namesKeys: nk });
  writeFileSync(`${OUT}/cardtext.json`, JSON.stringify(rows, null, 1));
  await context.close();
}
await browser.close();
console.log(`\n${"=".repeat(94)}\nSUMMARY`);
for (const r of rows) console.log(`${r.device.padEnd(30)} coarse=${r.predicate.coarse} → touch cells named ${r.namesTouch} · keys named ${r.namesKeys}`);
