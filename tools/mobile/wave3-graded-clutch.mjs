// =============================================================================
// wave3-graded-clutch.mjs — TWO THINGS A PIXEL CANNOT ANSWER.
//
// 1. THE GRADED LOOP. A camera that moves but does not SCORE is the same bug one
//    layer up. `procedures/performedSteps.ts:337-339` needs three DISTINCT
//    mirror glances before it emits `adjust-mirrors`, so the witness is the
//    pre-drive checklist's own counter — «Всички стъпки (N/13)» — read before
//    and after three real touch taps, with a same-wall-time idle NEGATIVE
//    CONTROL that must not move it.
//
// 2. THE CLUTCH. «Напреднал» is the manual tier and its gear-up cell is gated on
//    the clutch. Two-sided: «M►» with NO clutch must REFUSE (that is the gate
//    proving the test can fail), and «СЪЕД» held + «M►» must shift. Then the
//    thumb has to actually make the car GO — a tier that shifts but cannot be
//    driven is not playable.
//
//   node wave3-graded-clutch.mjs [--device iphone16-landscape]
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext } from "./lib/insets.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "http://localhost:3200");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave3-drive`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);

const browser = await webkit.launch();
const results = [];

for (const device of devices) {
  const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => {
    try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private mode */ }
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, writable: true, value: () => [] });
    }
  });
  const page = await context.newPage();
  const rec = { device: device.id, label: device.label };
  console.log(`\n${"=".repeat(84)}\n${device.label}`);

  const clearCards = async () => {
    for (let i = 0; i < 6; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи)$/.test(t)) { b.click(); return t; }
        }
        return null;
      });
      if (!hit) return i;
      await page.waitForTimeout(600);
    }
    return 6;
  };
  // A REAL FINGER. `.click()` activates a covered button and a finger does not,
  // so a probe that only clicks reports a BURIED control as healthy.
  const touch = async (labelRe) => {
    const r = await page.evaluate((re) => {
      const rx = new RegExp(re);
      for (const b of document.querySelectorAll("button")) {
        if (rx.test(b.getAttribute("aria-label") || "") || rx.test((b.textContent || "").trim())) {
          const q = b.getBoundingClientRect();
          if (q.width < 1) continue;
          return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
        }
      }
      return null;
    }, labelRe.source ?? labelRe);
    if (!r) return false;
    await page.touchscreen.tap(r.x, r.y);
    await page.waitForTimeout(450);
    return true;
  };

  // ── 1 · THE GRADED LOOP ──────────────────────────────────────────────────
  await page.goto(`${BASE}/dev/drive-rig?lesson=l1-preparation&quality=low&readout=0`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 150_000 });
  await page.waitForTimeout(2600);
  await clearCards();
  await page.waitForTimeout(600);

  const stepCount = () => page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) {
      const m = (b.textContent || "").match(/Всички стъпки \((\d+)\/(\d+)\)/);
      if (m) return { done: Number(m[1]), total: Number(m[2]) };
    }
    return null;
  });

  // NEGATIVE CONTROL FIRST — the same wall time with nothing pressed. If the
  // counter moves on its own, the arm below proves nothing.
  const idle0 = await stepCount();
  await page.waitForTimeout(3200);
  const idle1 = await stepCount();

  // …and the card control: it must not already be up before the taps, or its
  // presence afterwards proves nothing.
  const cardBefore = await page.evaluate(() => /Нарушен ред/.test(document.body.innerText || ""));
  const before = await stepCount();
  const tapped = {
    left: await touch(/^Поглед в лявото огледало$/),
    rear: await touch(/^Поглед в огледалото за задно виждане$/),
    right: await touch(/^Поглед в дясното огледало$/),
  };
  await page.waitForTimeout(1200);
  const after = await stepCount();
  const wrongOrderCard = await page.evaluate(() => /Нарушен ред/.test(document.body.innerText || ""));

  rec.graded = {
    idleBefore: idle0, idleAfter: idle1,
    cardBefore, before, after, tapped, wrongOrderCard,
    counterMoved: !!(before && after && after.done > before.done),
    idleMoved: !!(idle0 && idle1 && idle1.done !== idle0.done),
    // The witness is the out-of-order card «Нарушен ред: настройка на
    // огледалата». Only the procedure observer raises it, and
    // performedSteps.ts:337-339 needs THREE DISTINCT mirror glances before it
    // will — so a card that was not there before the taps and is there after
    // them is the grader confirming it received all three from a finger.
    graderSawThumb: !cardBefore && wrongOrderCard,
  };
  console.log(`  GRADED · idle control ${JSON.stringify(idle0)} → ${JSON.stringify(idle1)} · card before the taps: ${cardBefore} (both must be unchanged/false)`);
  console.log(`  GRADED · three touch glances ${JSON.stringify(tapped)} · counter ${JSON.stringify(before)} → ${JSON.stringify(after)} · out-of-order card after: ${wrongOrderCard}`);
  console.log(`  GRADED · THE GRADER SAW THE THUMB: ${rec.graded.graderSawThumb || rec.graded.counterMoved}`);
  await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__graded.png`, timeout: 120_000 });

  // ── 2 · THE CLUTCH ───────────────────────────────────────────────────────
  await page.goto(`${BASE}/dev/drive-rig?lesson=l0-free-drive&quality=low&readout=0`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 150_000 });
  await page.waitForTimeout(2600);
  await clearCards();
  await page.waitForTimeout(500);

  // THE TIER PICKER IS A RANK-3 SURFACE. PlayAreaStyles:950-953 gives it
  // `display: none` whenever an audio prompt or the first-run touch hint is on
  // screen, so „«Напреднал» not found" can mean the picker is merely standing
  // down for something else this second. Wait for it rather than concluding.
  let pickerVisible = false;
  for (let i = 0; i < 20 && !pickerVisible; i += 1) {
    pickerVisible = await page.evaluate(() => {
      const d = document.querySelector('[data-hud="difficulty"]');
      return !!d && getComputedStyle(d).display !== "none" && d.getBoundingClientRect().width > 0;
    });
    if (!pickerVisible) { await clearCards(); await page.waitForTimeout(1000); }
  }
  rec.tierPickerVisible = pickerVisible;
  // …AND SINCE J-WAVE-3 THE PILL IS NOT ON A PHONE AT ALL. It is
  // `display: none` on every compact stage (PlayAreaStyles — 255 px of
  // segmented control against a 167.5 px rail lane, and it was making «Пауза»
  // answer for «Начинаещ»); the tier lives in the ⚙ sheet, one tap behind
  // «Кола». Without this fallback the run below reports „«Напреднал» not
  // tapped" and every clutch number after it is a measurement of the
  // AUTOMATIC box — a green-looking row about the wrong gearbox.
  let tierOk = pickerVisible ? await touch(/^Напреднал$/) : false;
  let tierVia = tierOk ? "picker" : null;
  if (!tierOk) {
    // The cell CYCLES, so tap it until the car says it is on the manual tier
    // — never a fixed number of taps, which would silently land on the wrong
    // rung the day DEFAULT_DIFFICULTY moves.
    await touch(/^Контроли на автомобила$/);
    await page.waitForTimeout(500);
    for (let i = 0; i < 3; i += 1) {
      const on = await page.evaluate(() => {
        const el = [...document.querySelectorAll("[aria-label]")].find((e) =>
          (e.getAttribute("aria-label") || "").startsWith("Ниво на помощта"),
        );
        return el ? el.getAttribute("aria-label") : null;
      });
      if (on === null) break;
      if (/Ниво на помощта: Напреднал/.test(on)) { tierOk = true; tierVia = "sheet-cell"; break; }
      await touch(/^Ниво на помощта/);
      await page.waitForTimeout(350);
    }
  }
  rec.tierVia = tierVia;
  await page.waitForTimeout(1600);
  await clearCards();
  // THE GEAR CELL IS `readOnly`, SO IT IS NOT A <button>. Querying buttons
  // returned null for every gear reading on all six profiles and made the
  // clutch's two-sided test vacuous — both arms "changed nothing" because both
  // arms were reading nothing. Query by the label, on any element.
  const gearNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скоростен лост:"]');
    if (el) return (el.getAttribute("aria-label").split(":")[1] || "").trim();
    return null;
  });
  const openSheet = () => touch(/^Контроли на автомобила$/);
  await openSheet();
  await page.waitForTimeout(700);
  const clutchPresent = await page.evaluate(() => !!document.querySelector('[aria-label^="Съединител"]'));
  const gear0 = await gearNow();

  // NEGATIVE CONTROL: «M►» with NO clutch must refuse.
  await touch(/^Скоростен лост — към по-висока предавка/);
  await page.waitForTimeout(700);
  const gearNoClutch = await gearNow();

  // THE REAL THING: hold «СЪЕД» with one thumb, tap «M►» with the other.
  const shifted = await page.evaluate(async () => {
    const clutch = document.querySelector('[aria-label^="Съединител"]');
    const up = [...document.querySelectorAll("button")].find((b) => /към по-висока предавка/.test(b.getAttribute("aria-label") || ""));
    if (!clutch || !up) return { ok: false, why: !clutch ? "no clutch cell" : "no gear-up cell" };
    const rc = clutch.getBoundingClientRect();
    const mk = (t, el, id, x, y) => el.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: id === 1 }));
    mk("pointerdown", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);   // thumb one, HELD
    await new Promise((r) => setTimeout(r, 350));
    up.click();                                                                 // thumb two
    await new Promise((r) => setTimeout(r, 500));
    mk("pointerup", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);
    return { ok: true };
  });
  await page.waitForTimeout(800);
  const gearWithClutch = await gearNow();

  // AND IT HAS TO DRIVE. A tier that shifts but cannot be moved by a thumb is
  // not playable. Switching tier re-seats the car on the A1 COLD-START policy
  // (engine off, handbrake on), so „M1 and the thumb does nothing" is the
  // expected reading until the student has also started it — by thumb. Read the
  // switches, work them, and record the whole sequence rather than scoring the
  // first arm as a defect.
  const switchState = () => page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll("button")) {
      const l = b.getAttribute("aria-label") || "";
      if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) out[l] = b.getAttribute("aria-pressed");
    }
    return out;
  });
  // Re-open the sheet: the gear cells close it, so the first attempt at this
  // read came back `{}` and said nothing at all.
  const sheetStillOpen = await page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
  if (!sheetStillOpen) { await openSheet(); await page.waitForTimeout(700); }
  const beforeStart = await switchState();
  const started = { engine: false, handbrake: false };
  if (beforeStart["Двигател"] === "false") started.engine = await touch(/^Двигател$/);
  if (beforeStart["Ръчна спирачка"] === "true") started.handbrake = await touch(/^Ръчна спирачка$/);
  await page.waitForTimeout(700);
  const afterStart = await switchState();
  rec.coldStart = { beforeStart, tapped: started, afterStart };
  console.log(`  CLUTCH · cold-start switches ${JSON.stringify(beforeStart)} → tapped ${JSON.stringify(started)} → ${JSON.stringify(afterStart)}`);

  await touch(/^Затвори контролите$/);
  await page.waitForTimeout(500);
  const drove = await page.evaluate(async () => {
    const pad = [...document.querySelectorAll("[aria-label]")].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
    if (!pad) return { found: false };
    const r = pad.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const mk = (t, x, y) => pad.dispatchEvent(new PointerEvent(t, { pointerId: 3, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
    const t0 = window.__driveRig?.last?.speedKmh ?? 0;
    mk("pointerdown", cx, cy - Math.min(70, r.height / 2 - 6));
    await new Promise((r2) => setTimeout(r2, 4000));
    const t1 = window.__driveRig?.last?.speedKmh ?? 0;
    mk("pointerup", cx, cy - 70);
    return { found: true, from: t0, to: t1 };
  });

  rec.clutch = {
    tierTapped: tierOk, clutchCellPresent: clutchPresent,
    gearAtStart: gear0, gearAfterNoClutch: gearNoClutch, gearAfterClutch: gearWithClutch,
    refusedWithoutClutch: gear0 === gearNoClutch,
    shiftedWithClutch: gearWithClutch !== gearNoClutch,
    shiftMechanics: shifted, drove,
    playable: gear0 === gearNoClutch && gearWithClutch !== gearNoClutch && (drove.to ?? 0) > 1,
  };
  rec.clutch.tierPickerVisible = pickerVisible;
  console.log(`  CLUTCH · tier picker visible ${pickerVisible} · «Напреднал» tapped ${tierOk} · «СЪЕД» present ${clutchPresent}`);
  console.log(`  CLUTCH · gear ${gear0} → (M► no clutch) ${gearNoClutch} → (СЪЕД held + M►) ${gearWithClutch}`);
  console.log(`  CLUTCH · thumb on the pad: ${drove.from?.toFixed(2)} → ${drove.to?.toFixed(2)} km/h`);
  console.log(`  CLUTCH · «НАПРЕДНАЛ» IS PLAYABLE BY THUMB: ${rec.clutch.playable}`);
  await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__clutch.png`, timeout: 120_000 });

  // ── 3 · DOES A REAL FINGER DRAG THE PAGE? ────────────────────────────────
  // The sweep found the document is taller than the viewport by EXACTLY the
  // bottom safe-area inset on every profile that has one, and `window.scrollTo`
  // moves it. That is geometry plus a programmatic scroll — neither is a thumb.
  // This drags on the ROAD (the middle of the stage, away from both pads) and
  // reads the scroll offset, which is what a student's finger would do.
  const dragScroll = await page.evaluate(() => {
    const de = document.documentElement;
    const stage = document.querySelector("[data-sim-stage]") ?? document.body;
    return {
      stageTouchAction: getComputedStyle(stage).touchAction,
      bodyTouchAction: getComputedStyle(document.body).touchAction,
      stageOverscroll: getComputedStyle(stage).overscrollBehavior,
      scrollHeight: de.scrollHeight, clientHeight: de.clientHeight,
      startY: window.scrollY,
    };
  });
  const vw = device.width, vh = device.height;
  await page.touchscreen.tap(Math.round(vw / 2), Math.round(vh * 0.35));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0, 0));
  // A slow, deliberate upward drag in the middle of the road.
  await page.mouse.move(Math.round(vw / 2), Math.round(vh * 0.45));
  await page.mouse.down();
  for (let i = 1; i <= 8; i += 1) await page.mouse.move(Math.round(vw / 2), Math.round(vh * 0.45 - i * 8));
  await page.mouse.up();
  await page.waitForTimeout(400);
  dragScroll.afterDragY = await page.evaluate(() => window.scrollY);
  rec.scroll = dragScroll;
  console.log(`  SCROLL · doc ${dragScroll.scrollHeight} vs viewport ${dragScroll.clientHeight} (+${dragScroll.scrollHeight - dragScroll.clientHeight}) · stage touch-action ${dragScroll.stageTouchAction} · drag on the road moved scrollY to ${dragScroll.afterDragY}`);

  results.push(rec);
  writeFileSync(`${OUT}/graded-clutch.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(84)}\nSUMMARY`);
for (const r of results) {
  console.log(`${r.device.padEnd(30)} graded ${r.graded.counterMoved || r.graded.wrongOrderCard ? "YES" : "NO "} (idle moved: ${r.graded.idleMoved})  ·  clutch playable ${r.clutch.playable ? "YES" : "NO "} (refused w/o clutch: ${r.clutch.refusedWithoutClutch})`);
}
