// =============================================================================
// wave4-playable.mjs — TWO QUESTIONS A PASSING UNIT TEST CANNOT ANSWER.
//
// A · THE DECK, UNDER A SECOND FINGER. `tap-activation.test.ts` can prove the
//     handlers are BOUND; only a browser with two real touch points can prove
//     the deck actually transports while a thumb is on the road. Run this
//     against a build with the fix and against one without it — «Пусни» must
//     become «Пауза» with the second finger down, and must not have before.
//
// B · «НАПРЕДНАЛ», MOVED OFF BY THUMB, AND THE TAP COUNT. „Technically
//     playable" and „practically playable" are different claims. A manual car
//     moves off on the clutch AND the throttle TOGETHER — one thumb on «СЪЕД»
//     in the ⚙ sheet, one on the drivetrain pad — so this drives it that way
//     and reports the number of deliberate presses it took.
//
//   node wave4-playable.mjs --base http://localhost:3242 [--device …]
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
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave4-playable`;
mkdirSync(`${OUT}/shots`, { recursive: true });

const user = await ensureHarnessUser();
const devices = resolveDevices(arg("device", null) ? [arg("device", null)] : undefined);
const browser = await chromium.launch();
const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, inset: insetBanner(device, inset) };
  console.log(`\n${"=".repeat(90)}\n${device.label}\n  ${rec.inset}`);

  const act = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const down = async (id, x, y) => { act.set(id, { x, y }); await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...act.entries()].map(([i, p]) => pt(i, p)) }); };
  const up = async (id) => { const p = act.get(id); if (!p) return; act.delete(id); await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] }); };

  const centre = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "") && !rx.test((el.textContent || "").trim())) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, self: !!hit && (hit === el || el.contains(hit)), label: el.getAttribute("aria-label") };
    }
    return null;
  }, re);
  const tap = async (re) => { const c = await centre(re); if (!c) return false; await down(9, c.x, c.y); await page.waitForTimeout(80); await up(9); await page.waitForTimeout(420); return true; };
  const clearCards = async () => { for (let i = 0; i < 8; i += 1) { const h = await page.evaluate(() => { for (const b of document.querySelectorAll("button")) if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; } return false; }); if (!h) return i; await page.waitForTimeout(500); } return 8; };
  const speed = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скорост "]');
    const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
    return m ? Number(m[1].replace(",", ".")) : null;
  });
  const gear = () => page.evaluate(() => document.querySelector('[aria-label^="Скоростен лост:"]')?.getAttribute("aria-label").split(":")[1].trim() ?? null);
  const sheetOpen = () => page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));

  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  await clearCards();
  await page.waitForTimeout(600);

  // ── A · THE DECK UNDER A SECOND FINGER ───────────────────────────────────
  const deckToggle = await centre("Демонстрац");
  const deck = { toggleFound: !!deckToggle };
  if (deckToggle) {
    await tap("Демонстрац");
    await page.waitForTimeout(900);
    const playBefore = await centre("^(Пусни|Пауза)$");
    deck.transportFound = !!playBefore;
    if (playBefore) {
      deck.labelBefore = playBefore.label;
      // ONE FINGER ON THE ROAD, then the deck's ▶ with the other.
      await down(1, Math.round(device.width / 2), Math.round(device.height * 0.3));
      await page.waitForTimeout(200);
      await down(2, playBefore.x, playBefore.y);
      await page.waitForTimeout(110);
      await up(2);
      await page.waitForTimeout(600);
      deck.labelAfter = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) => /^(Пусни|Пауза)$/.test(n.getAttribute("aria-label") || ""));
        return b ? b.getAttribute("aria-label") : null;
      });
      deck.transportedUnderSecondFinger = deck.labelBefore !== deck.labelAfter;
      // …AND IT MUST ALSO SHUT. Finger 1 is still on the road: a deck that
      // pauses but cannot be closed under a thumb is the worse half of a half
      // fix, so the close is measured in the same held-finger state.
      const closer = await centre("^Затвори демонстрацията$");
      deck.closerFound = !!closer;
      deck.closerReachable = closer?.self ?? null;
      if (closer) {
        // THE WITNESS IS `aria-expanded`, NOT THE ABSENCE OF THE TRANSPORT.
        // The deck is HIDDEN, not unmounted — `LessonScene` says so in the
        // effect right above the toggle („`display: none` hides a panel; it
        // does not stop a replay"), so its buttons are still in the DOM after
        // it closes and „are the transport controls gone?" answered `false` on
        // all six profiles for a toggle that had in fact worked.
        const before = await page.evaluate(() => document.querySelector('[aria-label="Затвори демонстрацията"]')?.getAttribute("aria-expanded") ?? null);
        await down(2, closer.x, closer.y);
        await page.waitForTimeout(110);
        await up(2);
        await page.waitForTimeout(600);
        const after = await page.evaluate(() => {
          const el = document.querySelector('[aria-expanded]');
          return el ? el.getAttribute("aria-expanded") : null;
        });
        deck.expandedBefore = before;
        deck.expandedAfter = after;
        deck.closedUnderSecondFinger = before === "true" && after === "false";
      }
      await up(1);
    }
  }
  rec.deck = deck;
  console.log(`  DECK · toggle ${deck.toggleFound} · transport ${deck.transportFound} · «${deck.labelBefore}» → «${deck.labelAfter}» · TRANSPORT UNDER A SECOND FINGER: ${deck.transportedUnderSecondFinger} · CLOSES UNDER A SECOND FINGER: ${deck.closedUnderSecondFinger}`);

  // ── B · MOVE OFF ON «НАПРЕДНАЛ», THUMB ONLY ──────────────────────────────
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  await clearCards();
  await page.waitForTimeout(600);

  let taps = 0;
  const press = async (re, note) => { const ok = await tap(re); taps += ok ? 1 : 0; return { note, ok }; };
  const walk = [];
  walk.push(await press("^Контроли на автомобила$", "open the ⚙ sheet"));
  for (let i = 0; i < 4; i += 1) {
    const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
    if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
    walk.push(await press("^Ниво на помощта", "cycle the tier to «Напреднал»"));
  }
  await page.waitForTimeout(1500);
  await clearCards();
  if (!(await sheetOpen())) walk.push(await press("^Контроли на автомобила$", "re-open the sheet"));
  const sw = await page.evaluate(() => { const o = {}; for (const b of document.querySelectorAll("button")) { const l = b.getAttribute("aria-label") || ""; if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) o[l] = b.getAttribute("aria-pressed"); } return o; });
  if (sw["Предпазен колан"] === "false") walk.push(await press("^Предпазен колан$", "fasten the seatbelt"));
  if (sw["Двигател"] === "false") walk.push(await press("^Двигател$", "start the engine"));
  if (sw["Ръчна спирачка"] === "true") walk.push(await press("^Ръчна спирачка$", "release the handbrake"));
  await page.waitForTimeout(600);

  // FIRST GEAR, then MOVE OFF WITHOUT LETTING THE CLUTCH GO FIRST. A manual car
  // needs the clutch and the throttle at the same time; releasing the clutch at
  // idle in gear is a stall, which is the driveline being right, not broken.
  const move = { gearBefore: await gear() };
  const c = await centre("^Съединител"), u = await centre("към по-висока предавка");
  move.cells = { clutch: c, up: u };
  if (c && u) {
    await down(1, c.x, c.y); taps += 1;                       // thumb 1: clutch, HELD
    await page.waitForTimeout(300);
    await down(2, u.x, u.y); taps += 1;                       // thumb 2: M►
    await page.waitForTimeout(140);
    await up(2);
    await page.waitForTimeout(450);
    move.gearAfterShift = await gear();
    // Thumb 2 moves to the throttle while thumb 1 still holds the clutch.
    const pad = await page.evaluate(() => {
      const p = [...document.querySelectorAll("[aria-label]")].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), h: Math.round(r.height) };
    });
    move.padFound = !!pad;
    if (pad) {
      const ty = pad.y - Math.min(70, pad.h / 2 - 6);
      await down(2, pad.x, ty); taps += 1;                    // thumb 2: throttle
      await page.waitForTimeout(900);
      await up(1);                                            // clutch comes up under power
      await page.waitForTimeout(5000);
      move.speedKmh = await speed();
      move.gearAtSpeed = await gear();
      await up(2);
    }
  }
  move.taps = taps;
  move.moved = (move.speedKmh ?? 0) > 1;
  rec.moveOff = { walk, ...move };
  console.log(`  MOVE  · ${taps} presses · gear ${move.gearBefore} → ${move.gearAfterShift} → ${move.gearAtSpeed} · ${move.speedKmh} km/h · MOVED ${move.moved}`);
  for (const w of walk) console.log(`         ${w.ok ? "·" : "MISSED"} ${w.note}`);
  await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 });

  results.push(rec);
  writeFileSync(`${OUT}/playable.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(90)}\nSUMMARY`);
for (const r of results) {
  console.log(`${r.device.padEnd(32)} deck transport ${String(r.deck?.transportedUnderSecondFinger).padEnd(6)} · deck close ${String(r.deck?.closedUnderSecondFinger).padEnd(6)} · move off ${String(r.moveOff?.moved).padEnd(6)} at ${r.moveOff?.speedKmh} km/h in ${r.moveOff?.taps} presses`);
}
