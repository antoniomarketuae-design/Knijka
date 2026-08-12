// =============================================================================
// wave4-firstgear.mjs — THE ONE MOVE «НАПРЕДНАЛ» CANNOT BE STARTED WITHOUT,
// DONE THE WAY A STUDENT DOES IT AND NOT THE WAY A PROBE DOES IT.
//
// `wave4-upshift.mjs`'s four arms all pass: the gear cell fires under a second
// finger. Its THUMB-ONLY pass, which walks the same screen the way a student
// walks it (⚙ → tier → seatbelt → clutch + M►), does NOT: the gear stays N,
// with the clutch painted down, both cells hit-testing to themselves and NO
// refusal toast — i.e. `gearUp()` was never called at all.
//
// Two runs of the same two fingers on the same two cells, one passing and one
// not, differ only in what happened on the screen in the second before them.
// So this file records what the cells actually RECEIVE, and re-hit-tests them
// at the instant of the press rather than half a second earlier.
//
//   node wave4-firstgear.mjs --base http://localhost:3242 [--device …]
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
const BASE = arg("base", "http://localhost:3242");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave4-firstgear`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const UP_RE = "към по-висока предавка";
const CLUTCH_RE = "^Съединител";

const user = await ensureHarnessUser();
const devices = resolveDevices(arg("device", null) ? [arg("device", null)] : undefined);
const browser = await chromium.launch();
const out = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, inset: insetBanner(device, inset) };
  console.log(`\n${"=".repeat(90)}\n${device.label}\n  ${rec.inset}`);

  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const down = async (id, x, y) => { active.set(id, { x, y }); await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) }); };
  const up = async (id) => { const p = active.get(id); if (!p) return; active.delete(id); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] }); };

  const centre = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, self: !!hit && (hit === el || el.contains(hit)), over: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label") ?? hit.tagName) : null };
    }
    return null;
  }, re);
  const tap = async (re) => { const c = await centre(re); if (!c) return false; await down(9, c.x, c.y); await page.waitForTimeout(80); await up(9); await page.waitForTimeout(420); return true; };
  const gear = () => page.evaluate(() => document.querySelector('[aria-label^="Скоростен лост:"]')?.getAttribute("aria-label").split(":")[1].trim() ?? null);
  const clearCards = async () => { for (let i = 0; i < 8; i += 1) { const h = await page.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; } return false; }); if (!h) return i; await page.waitForTimeout(500); } return 8; };

  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  await clearCards();
  await page.waitForTimeout(600);

  await page.evaluate(() => {
    window.__fg = [];
    const nm = (t) => { const el = t instanceof Element ? t.closest("[aria-label]") : null; return el ? el.getAttribute("aria-label").slice(0, 30) : (t?.tagName ?? "?"); };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "lostpointercapture"]) {
      document.addEventListener(type, (e) => window.__fg.push({ type, on: nm(e.target), id: e.pointerId ?? null, detail: e.detail ?? null, t: Math.round(performance.now()) }), true);
    }
  });
  const drain = () => page.evaluate(() => { const l = window.__fg.slice(); window.__fg.length = 0; return l; });

  await tap("^Контроли на автомобила$");
  for (let i = 0; i < 4; i += 1) {
    const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
    if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
    await tap("^Ниво на помощта");
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(1400);
  await clearCards();
  if (!(await page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]')))) await tap("^Контроли на автомобила$");

  // TWO PASSES ON THE SAME SCREEN. Pass A does the seatbelt first, exactly as
  // the thumb-only walk does; pass B goes straight to the two fingers. If A
  // fails and B passes, the seatbelt press is the variable — which is a real
  // defect, because fastening the belt is a step the product REQUIRES first.
  for (const pass of ["after the seatbelt press", "straight to the two fingers"]) {
    if (pass.startsWith("after")) {
      const belt = await page.evaluate(() => document.querySelector('[aria-label="Предпазен колан"]')?.getAttribute("aria-pressed") ?? null);
      if (belt === "false") await tap("^Предпазен колан$");
      await page.waitForTimeout(500);
    }
    await drain();
    const g0 = await gear();
    const c1 = await centre(CLUTCH_RE), u1 = await centre(UP_RE);
    if (!c1 || !u1) { console.log(`  ${pass}: cells missing (${JSON.stringify({ c1, u1 })})`); continue; }
    await down(1, c1.x, c1.y);
    await page.waitForTimeout(260);
    // RE-HIT-TEST AT THE INSTANT OF THE PRESS, not half a second before it.
    const u2 = await centre(UP_RE);
    await down(2, u2.x, u2.y);
    await page.waitForTimeout(140);
    await up(2);
    await page.waitForTimeout(420);
    const g1 = await gear();
    const log = await drain();
    await up(1);
    await page.waitForTimeout(500);
    const toast = await page.evaluate(() => /Предавката не влезе/.test(document.body.innerText || ""));
    const row = { pass, gear: `${g0} → ${g1}`, clutchCell: c1, upCellBefore: u1, upCellAtPress: u2, toast, log };
    (rec.passes ??= []).push(row);
    console.log(`  ${pass}: gear ${g0} → ${g1} · toast ${toast} · up-cell topmost at press ${u2.self} (${u2.over})`);
    for (const e of log) console.log(`        ${JSON.stringify(e)}`);
    await clearCards();
    if (!(await page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]')))) await tap("^Контроли на автомобила$");
  }
  await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 });
  out.push(rec);
  writeFileSync(`${OUT}/firstgear.json`, JSON.stringify(out, null, 1));
  await context.close();
}
await browser.close();
