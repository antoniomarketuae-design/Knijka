// =============================================================================
// wave4-upshift.mjs — §C2, ASKED WITH TWO FINGERS THAT ACTUALLY EXIST.
//
// THE INSTRUMENT IS THE WHOLE POINT. Playwright's `mouse` and
// `touchscreen.tap()` are SINGLE-POINT. A `.click()` on the gear cell while the
// clutch is "held" releases nothing and proves nothing; a `touchscreen.tap()`
// LIFTS the first finger before the second lands. Both produce the same reading
// as the defect and neither is the defect. So this probe drives Chromium's
// `Input.dispatchTouchEvent` over CDP with an explicit `touchPoints` array and
// two ids, and it PROVES the second finger exists before it believes any arm:
// the page counts `TouchEvent.touches.length` and the run refuses to report if
// that count never reached 2.
//
// WHY CHROMIUM AND NOT WEBKIT (house rule: WebKit is primary). WebKit's
// Playwright driver has no CDP and no multi-touch injection at all — the
// question cannot be put to it. This is a QUESTION ABOUT EVENT SEMANTICS
// (which element receives pointerup while a second pointer is down), not about
// geometry or paint, so the engine that can express it is the right one. Every
// geometric number in this file is still read from the page's own layout.
//
//   node wave4-upshift.mjs --base http://localhost:3241 [--device iphone16-portrait]
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
// PRODUCTION HAS NO /dev/drive-rig — `page.tsx` calls `notFound()` when
// NODE_ENV is production, on purpose. So the surface measured here is the one
// the student actually gets, which is also the one the house rule asks for.
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave4-upshift`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);

const UP_RE = "към по-висока предавка";
const CLUTCH_RE = "^Съединител";

const user = await ensureHarnessUser();
const browser = await chromium.launch();
const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => {
    try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private mode */ }
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, writable: true, value: () => [] });
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset) };
  console.log(`\n${"=".repeat(88)}\n${device.label}\n  ${rec.inset}`);

  // ── the CDP finger ────────────────────────────────────────────────────────
  //
  // ⚠ THE CONTRACT, MEASURED, BECAUSE GETTING IT WRONG MANUFACTURES THE DEFECT.
  // The first version of this file passed the REMAINING points to `touchEnd`,
  // on the reading that `touchPoints` is "the active set after the event" and
  // Chromium diffs it. It does not. The page's own listeners printed the order:
  //
  //   pointerdown СЪЕД id5 · pointerdown M► id6 · pointerup СЪЕД · pointerup M►
  //
  // — i.e. passing `[clutch]` to `touchEnd` RELEASED THE CLUTCH, one second
  // before the gear cell was released, and the run then reported a dead upshift
  // cell. That is the same false defect the brief attributes to `.click()`,
  // arrived at down a different road. `touchPoints` on a `touchEnd` is THE SET
  // BEING RELEASED; the fingers that stay down are simply not mentioned.
  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const fingerDown = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)),
    });
  };
  const fingerUp = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };

  const evalCentre = (labelRe) => page.evaluate((re) => {
    const rx = new RegExp(re);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, w: Math.round(q.width), h: Math.round(q.height),
        // IS ANYTHING ON TOP OF IT? A finger presses what is painted over the
        // button; `.click()` presses the button. That difference is a whole
        // class of false green in this repo.
        topmostIsSelf: !!hit && (hit === el || el.contains(hit)),
        topmostLabel: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label") ?? hit.tagName) : null,
      };
    }
    return null;
  }, labelRe);

  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи|Започни)$/.test(t)) { b.click(); return t; }
        }
        return null;
      });
      if (!hit) return i;
      await page.waitForTimeout(500);
    }
    return 8;
  };
  const tap = async (labelRe) => {
    const c = await evalCentre(labelRe);
    if (!c) return null;
    await fingerDown(9, c.x, c.y);
    await page.waitForTimeout(80);
    await fingerUp(9);
    await page.waitForTimeout(400);
    return c;
  };
  const gearNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скоростен лост:"]');
    return el ? (el.getAttribute("aria-label").split(":")[1] || "").trim() : null;
  });
  // THE CLUTCH, READ OFF THE GLASS. `/simulator` publishes no telemetry hook,
  // so the witness is the cell's own paint: `glyphStyle(held, "warning")` gives
  // it `--warning` while it is down and `--foreground` while it is up. That is
  // the same fact the student sees, which is the right one to hold the product
  // to anyway.
  const clutchNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Съединител"]');
    if (!el) return null;
    const c = getComputedStyle(el);
    return { color: c.color, opacity: c.opacity };
  });
  const toastNow = () => page.evaluate(() => {
    const t = document.body.innerText || "";
    return /Предавката не влезе/.test(t) ? "Предавката не влезе" : null;
  });

  // ── set the stage ─────────────────────────────────────────────────────────
  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  await clearCards();
  await page.waitForTimeout(600);

  // THE TIER, BY THUMB, AND COUNT THE TAPS. Item 4 of the brief asks for the
  // number, so it is counted here rather than estimated later.
  let taps = 0;
  let tierOk = false;
  const openSheet = async () => { taps += 1; return tap(/^Контроли на автомобила$/); };
  await openSheet();
  await page.waitForTimeout(500);
  for (let i = 0; i < 4 && !tierOk; i += 1) {
    const on = await page.evaluate(() => {
      const el = [...document.querySelectorAll("[aria-label]")].find((e) => (e.getAttribute("aria-label") || "").startsWith("Ниво на помощта"));
      return el ? el.getAttribute("aria-label") : null;
    });
    if (on === null) break;
    // `Ниво на помощта: Нормален — натисни за Напреднал` CONTAINS the word
    // «Напреднал» as the NEXT rung's name. Matching it loosely reported the
    // manual tier as reached while the box was still automatic, and every
    // clutch reading after that would have been about the wrong gearbox.
    if (/^Ниво на помощта: Напреднал/.test(on)) { tierOk = true; break; }
    taps += 1;
    await tap(/^Ниво на помощта/);
    await page.waitForTimeout(400);
  }
  rec.tierOk = tierOk;
  rec.tapsToTier = taps;
  await page.waitForTimeout(1200);
  await clearCards();
  const sheetOpen = () => page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
  if (!(await sheetOpen())) { await openSheet(); await page.waitForTimeout(600); }

  // ── the event tap: what does the up-cell actually RECEIVE? ────────────────
  await page.evaluate((re) => {
    window.__w4 = { log: [], maxTouches: 0 };
    const rx = new RegExp(re);
    const name = (t) => {
      const el = t instanceof Element ? t.closest("[aria-label]") : null;
      return el ? el.getAttribute("aria-label").slice(0, 34) : (t?.tagName ?? "?");
    };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "lostpointercapture"]) {
      document.addEventListener(type, (e) => {
        window.__w4.log.push({ type, on: name(e.target), id: e.pointerId ?? null, detail: e.detail ?? null, t: Math.round(performance.now()) });
      }, true);
    }
    for (const type of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
      document.addEventListener(type, (e) => {
        window.__w4.maxTouches = Math.max(window.__w4.maxTouches, e.touches.length);
        window.__w4.log.push({ type, on: name(e.target), touches: e.touches.length, t: Math.round(performance.now()) });
      }, true);
    }
    window.__w4.re = rx.source;
  }, UP_RE);
  const drainLog = () => page.evaluate(() => { const l = window.__w4.log.slice(); window.__w4.log.length = 0; return l; });

  const arms = {};
  const geom = { up: await evalCentre(UP_RE), clutch: await evalCentre(CLUTCH_RE) };
  rec.geom = geom;
  console.log(`  GEOM · «M►» ${JSON.stringify(geom.up)}`);
  console.log(`  GEOM · «СЪЕД» ${JSON.stringify(geom.clutch)}`);

  if (!geom.up || !geom.clutch) {
    rec.fatal = !geom.up ? "no gear-up cell on screen" : "no clutch cell on screen";
    rec.labels = await page.evaluate(() => [...document.querySelectorAll("[aria-label]")].map((e) => `${e.tagName}:${e.getAttribute("aria-label")}`));
    console.log(`  FATAL · ${rec.fatal} · tierOk ${tierOk} · taps ${taps} · sheet ${await sheetOpen()}`);
    console.log(`  LABELS · ${JSON.stringify(rec.labels)}`);
    results.push(rec); writeFileSync(`${OUT}/upshift.json`, JSON.stringify(results, null, 1)); await context.close(); continue;
  }

  // ARM 1 — «M►» alone, no clutch. MUST refuse: this is the arm that proves the
  // measurement can fail, and it is also the arm that raises the card.
  await drainLog();
  const g0 = await gearNow();
  await fingerDown(1, geom.up.x, geom.up.y);
  await page.waitForTimeout(120);
  await fingerUp(1);
  await page.waitForTimeout(700);
  arms.alone = { gearBefore: g0, gearAfter: await gearNow(), toast: await toastNow(), log: await drainLog() };
  console.log(`  ARM 1 · «M►» alone: ${arms.alone.gearBefore} → ${arms.alone.gearAfter} · toast ${arms.alone.toast}`);

  // …AND WHAT THE CARD DID TO THE SCREEN. This is the reading the four-arm
  // proof never took: after a refusal, is the cell still THERE and still on top?
  arms.afterCard = {
    up: await evalCentre(UP_RE),
    clutch: await evalCentre(CLUTCH_RE),
    sheetStillOpen: await sheetOpen(),
    overlayVisible: await page.evaluate(() => !!document.querySelector('[data-hud="touch-controls"]')),
  };
  console.log(`  ARM 1 · after the refusal card: sheet ${arms.afterCard.sheetStillOpen} · overlay ${arms.afterCard.overlayVisible} · «M►» ${JSON.stringify(arms.afterCard.up)}`);

  // Put the screen back the way a student would before arm 2.
  await clearCards();
  await page.waitForTimeout(500);
  if (!(await sheetOpen())) { await openSheet(); await page.waitForTimeout(600); }
  const geom2 = { up: await evalCentre(UP_RE), clutch: await evalCentre(CLUTCH_RE) };
  rec.geomAfterClear = geom2;

  // ARM 2 — THE DEFECT ARM. Clutch HELD by finger 1, «M►» pressed by finger 2,
  // both on the glass at the same instant.
  if (geom2.up && geom2.clutch) {
    await drainLog();
    const gA = await gearNow();
    await fingerDown(1, geom2.clutch.x, geom2.clutch.y);
    await page.waitForTimeout(320);
    const clutchDuring = await clutchNow();
    await fingerDown(2, geom2.up.x, geom2.up.y);
    await page.waitForTimeout(140);
    const clutchAtPress = await clutchNow();
    await fingerUp(2);
    await page.waitForTimeout(220);
    const clutchAtRelease = await clutchNow();
    await fingerUp(1);
    await page.waitForTimeout(700);
    arms.twoFinger = {
      gearBefore: gA, gearAfter: await gearNow(), toast: await toastNow(),
      clutchAfterFirstFinger: clutchDuring, clutchWhileSecondDown: clutchAtPress, clutchAtSecondRelease: clutchAtRelease,
      maxTouches: await page.evaluate(() => window.__w4.maxTouches),
      log: await drainLog(),
    };
    // SAMPLE INTEGRITY. Two things must be true or the arm says nothing, and
    // both have already been false once in this file's life:
    //   · two fingers were really on the glass at the same instant, and
    //   · the GEAR CELL was released FIRST, with the clutch still down.
    const l = arms.twoFinger.log;
    const iUp = l.findIndex((e) => e.type === "pointerup" && /по-висока/.test(e.on));
    const iClutch = l.findIndex((e) => e.type === "pointerup" && /Съединител/.test(e.on));
    arms.twoFinger.valid =
      arms.twoFinger.maxTouches >= 2 && iUp >= 0 && (iClutch < 0 || iUp < iClutch);
    console.log(`  ARM 2 · СЪЕД held + M► by touch: ${arms.twoFinger.gearBefore} → ${arms.twoFinger.gearAfter} · max simultaneous touches ${arms.twoFinger.maxTouches} · ARM VALID: ${arms.twoFinger.valid}`);
    console.log(`  ARM 2 · clutch paint  after finger 1 ${JSON.stringify(clutchDuring)} · while finger 2 down ${JSON.stringify(clutchAtPress)} · at its release ${JSON.stringify(clutchAtRelease)}`);
    for (const e of l) console.log(`         ${JSON.stringify(e)}`);
  }

  await clearCards();
  if (!(await sheetOpen())) { await openSheet(); await page.waitForTimeout(600); }
  const geom3 = { up: await evalCentre(UP_RE), clutch: await evalCentre(CLUTCH_RE) };

  // ARM 3 — clutch by TOUCH, «M►» by KEYBOARD. The control that isolates the
  // cell from the driveline.
  if (geom3.clutch) {
    await drainLog();
    const gB = await gearNow();
    await fingerDown(1, geom3.clutch.x, geom3.clutch.y);
    await page.waitForTimeout(320);
    await page.keyboard.press("BracketRight");
    await page.waitForTimeout(400);
    await fingerUp(1);
    await page.waitForTimeout(600);
    arms.touchClutchKeyUp = { gearBefore: gB, gearAfter: await gearNow(), toast: await toastNow() };
    console.log(`  ARM 3 · СЪЕД by touch + ] by key: ${arms.touchClutchKeyUp.gearBefore} → ${arms.touchClutchKeyUp.gearAfter}`);
  }

  await clearCards();
  // ARM 4 — keyboard only. The driveline control.
  const gC = await gearNow();
  await page.keyboard.down("KeyZ");
  await page.waitForTimeout(200);
  await page.keyboard.press("BracketRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("KeyZ");
  await page.waitForTimeout(500);
  arms.keyboardOnly = { gearBefore: gC, gearAfter: await gearNow() };
  console.log(`  ARM 4 · keyboard only (Z + ]): ${arms.keyboardOnly.gearBefore} → ${arms.keyboardOnly.gearAfter}`);

  // ══ THUMB ONLY, FROM A COLD PAGE, AND COUNT THE TAPS ═════════════════════
  // „Technically playable" and „practically playable" are different claims and
  // the founder asked us to stop blurring them. The number below is the whole
  // distinction: how many deliberate presses stand between a student choosing
  // «Напреднал» and the car actually moving.
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 180_000 });
  await page.waitForTimeout(3200);
  const cards = await clearCards();
  await page.waitForTimeout(600);
  // The recorder died with the old document; put it back, or the one pass that
  // fails is the one pass with no evidence.
  await page.evaluate(() => {
    window.__w4 = { log: [], maxTouches: 0 };
    const nm = (t) => { const el = t instanceof Element ? t.closest("[aria-label]") : null; return el ? el.getAttribute("aria-label").slice(0, 30) : (t?.tagName ?? "?"); };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "lostpointercapture"]) {
      document.addEventListener(type, (e) => window.__w4.log.push({ type, on: nm(e.target), id: e.pointerId ?? null, detail: e.detail ?? null, t: Math.round(performance.now()) }), true);
    }
  });

  let n = 0;
  const step = async (labelRe, note) => { const c = await tap(labelRe); n += c ? 1 : 0; return { note, hit: !!c }; };
  const journey = [];
  journey.push(await step(/^Контроли на автомобила$/, "open the ⚙ sheet"));
  for (let i = 0; i < 4; i += 1) {
    const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
    if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
    journey.push(await step(/^Ниво на помощта/, "cycle the tier"));
  }
  await page.waitForTimeout(1400);
  await clearCards();
  if (!(await sheetOpen())) journey.push(await step(/^Контроли на автомобила$/, "re-open the sheet after the tier re-seat"));
  const sw = await page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll("button")) {
      const l = b.getAttribute("aria-label") || "";
      if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) out[l] = b.getAttribute("aria-pressed");
    }
    return out;
  });
  if (sw["Предпазен колан"] === "false") journey.push(await step(/^Предпазен колан$/, "seatbelt"));
  if (sw["Двигател"] === "false") journey.push(await step(/^Двигател$/, "start the engine"));
  if (sw["Ръчна спирачка"] === "true") journey.push(await step(/^Ръчна спирачка$/, "release the handbrake"));
  await page.waitForTimeout(500);

  // FIRST GEAR: the two-finger move this whole item is about.
  const gA = await evalCentre(CLUTCH_RE), gU = await evalCentre(UP_RE);
  const firstGear = {
    clutchCell: gA, upCell: gU,
    gearBefore: await gearNow(),
    switches: sw,
    sheetOpenBefore: await sheetOpen(),
  };
  let gearAfterFirst = firstGear.gearBefore;
  if (gA && gU) {
    await page.evaluate(() => { window.__w4.log.length = 0; });
    await fingerDown(1, gA.x, gA.y); n += 1;
    await page.waitForTimeout(250);
    firstGear.clutchPaintWhileHeld = await clutchNow();
    firstGear.upCellAtPress = await evalCentre(UP_RE);
    await fingerDown(2, gU.x, gU.y); n += 1;
    await page.waitForTimeout(140);
    await fingerUp(2);
    await page.waitForTimeout(400);
    gearAfterFirst = await gearNow();
    firstGear.sheetOpenAfter = await sheetOpen();
    firstGear.toast = await toastNow();
    firstGear.log = await page.evaluate(() => window.__w4.log.slice());
    await fingerUp(1);                       // the clutch comes up: no extra tap
    await page.waitForTimeout(500);
  }
  firstGear.gearAfter = gearAfterFirst;
  rec.firstGear = firstGear;
  console.log(`  THUMB · first gear ${firstGear.gearBefore} → ${gearAfterFirst} · clutch paint ${JSON.stringify(firstGear.clutchPaintWhileHeld)} · up-cell at press ${JSON.stringify(firstGear.upCellAtPress)} · toast ${firstGear.toast}`);
  for (const e of firstGear.log ?? []) console.log(`         ${JSON.stringify(e)}`);
  // …then close the sheet and drive, which is one more press.
  if (await sheetOpen()) journey.push(await step(/^Затвори контролите$/, "close the sheet"));
  const drove = await page.evaluate(async () => {
    const pad = [...document.querySelectorAll("[aria-label]")].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
    if (!pad) return { found: false };
    const r = pad.getBoundingClientRect();
    return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), h: Math.round(r.height) };
  });
  let speed = null;
  if (drove.found) {
    const ty = drove.y - Math.min(70, drove.h / 2 - 6);
    await fingerDown(4, drove.x, ty); n += 1;
    await page.waitForTimeout(5000);
    speed = await page.evaluate(() => {
      const el = document.querySelector('[aria-label^="Скорост "]');
      const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
      return m ? Number(m[1].replace(",", ".")) : null;
    });
    await fingerUp(4);
  }
  rec.thumbOnly = { cardsCleared: cards, journey, taps: n, gearAfterFirst, speedKmh: speed, moved: (speed ?? 0) > 1 };
  console.log(`  THUMB · ${n} presses from a cold page to a moving car · gear ${gearAfterFirst} · ${speed} km/h · MOVED ${rec.thumbOnly.moved}`);
  for (const j of journey) console.log(`         ${j.hit ? "·" : "MISSED"} ${j.note}`);

  rec.arms = arms;
  await page.screenshot({ path: `${OUT}/shots/W4__${device.id}__upshift.png`, timeout: 120_000 });
  results.push(rec);
  writeFileSync(`${OUT}/upshift.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(88)}\nSUMMARY`);
for (const r of results) {
  const a = r.arms ?? {};
  console.log(
    `${r.device.padEnd(30)} alone ${a.alone?.gearBefore}→${a.alone?.gearAfter}  ·  2-finger ${a.twoFinger?.gearBefore}→${a.twoFinger?.gearAfter} (touches ${a.twoFinger?.maxTouches}, valid ${a.twoFinger?.valid})  ·  touch+key ${a.touchClutchKeyUp?.gearBefore}→${a.touchClutchKeyUp?.gearAfter}  ·  keys ${a.keyboardOnly?.gearBefore}→${a.keyboardOnly?.gearAfter}  ·  thumb ${r.thumbOnly?.taps} taps → ${r.thumbOnly?.speedKmh} km/h${r.fatal ? `  · FATAL ${r.fatal}` : ""}`,
  );
}
