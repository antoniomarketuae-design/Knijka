// =============================================================================
// wave3-tier-switches.mjs — READ THE CAR'S OWN SWITCHES.
//
// WHY THIS EXISTS. J-WAVE-2 proved the clutch gate two-sided by touch («M►»
// alone REFUSES, «СЪЕД» + «M►» takes N → M1, 6/6) and then found the car would
// not move: a thumb on the pad for 4 s gave 0.00 → 0.00 km/h. It called that
// INCONCLUSIVE and offered a hypothesis — „switching tier re-seats the car on
// the A1 cold-start policy (engine off, handbrake on)".
//
// ITS OWN INSTRUMENT NEVER TESTED THAT HYPOTHESIS. `wave3-graded-clutch.mjs`
// reads the switches off the ⚙ sheet's `aria-pressed`, and its recorded result
// is `"beforeStart": {}` on every row. An empty object is not „the engine was
// off"; it is „the sheet was shut and I read nothing". The conclusion was drawn
// from a blank.
//
// SO THIS FILE READS THE SWITCHES, AT EVERY STEP, WITH A CLOCK ON EACH READING,
// and every reading carries `sheetOpen` so a blank can never again be mistaken
// for a state. The stall window is sampled deliberately (t+0.05 / +0.8 / +2.0 s
// after the clutch comes up) because `driveline.ts` STALL_GRACE_S is 0.7 —
// anything that samples once, later, sees a dead engine and cannot say what
// killed it.
//
// THREE ARMS, THREE FRESH PAGES, because the state each one needs is destroyed
// by the one before it:
//
//   1  REPRODUCTION   the tier switch on a STANDING car, then the shift, then
//                     the stall window, then what a thumb can do about it.
//                     (The first cut of this file drove the positive control
//                     first, left the car at 16 km/h, and `switchTransmission`
//                     took its MOVING branch — a different code path and not
//                     the state J-WAVE-2 was in.)
//   2  THE MANUAL     clutch DOWN → gear → throttle → clutch OUT: the sequence
//      SEQUENCE       a person who can drive a manual would actually use, and
//                     the only one that answers „is the tier drivable".
//   3  CONTROL        the pad on Нормален, on a fresh page. Without it a
//                     0.00 → 0.00 anywhere above says nothing about the tier.
//
//   node wave3-tier-switches.mjs [--device iphone16-portrait] [--base http://localhost:3200]
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner } from "./lib/insets.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave3-tier`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);

const browser = await webkit.launch();
const results = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
    } catch {
      /* private mode */
    }
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", {
        configurable: true,
        writable: true,
        value: () => [],
      });
    }
  });
  const page = await context.newPage();
  const rec = { device: device.id, label: device.label, reads: [] };
  console.log(`\n${"=".repeat(88)}\n${device.label}`);
  console.log(`  ${insetBanner(device, inset)}`);

  // ── the instrument ───────────────────────────────────────────────────────
  const readState = async (tag) => {
    const s = await page.evaluate(() => {
      const all = [...document.querySelectorAll("[aria-label]")];
      const exact = (l) => all.find((e) => (e.getAttribute("aria-label") || "") === l) ?? null;
      const starts = (p) => all.find((e) => (e.getAttribute("aria-label") || "").startsWith(p)) ?? null;
      const pressed = (l) => {
        const e = exact(l);
        return e === null ? null : e.getAttribute("aria-pressed");
      };
      const gearEl = starts("Скоростен лост:");
      const rig = window.__driveRig?.last ?? null;
      const text = document.body.innerText || "";
      return {
        wall: Math.round(performance.now()),
        sheetOpen: !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'),
        gear: gearEl ? (gearEl.getAttribute("aria-label").split(":")[1] || "").trim() : null,
        engine: pressed("Двигател"),
        handbrake: pressed("Ръчна спирачка"),
        belt: pressed("Предпазен колан"),
        clutchCell: !!starts("Съединител"),
        speedKmh: rig ? Number(rig.speedKmh.toFixed(3)) : null,
        rigHandbrake: rig ? rig.handbrakeOn : null,
        phase: rig ? rig.phase : null,
        // A MODAL IS A STATE TOO. The stall raises a teach card that PAUSES the
        // sim and covers the sheet — which is why every switch reads null from
        // here on, and why a probe that does not record this concludes „dead".
        modal: /Разбрах|Продължи/.test(text) && /Загасване|Нарушен|Внимание/.test(text),
        // THE LESSON-OVER GUARD (J-WAVE-2 warning 2): a terminated lesson
        // freezes `__driveRig.last` and reads exactly like a clean idle screen.
        lessonOver: /Неиздържан|Издържан|Разбор на урока/.test(text),
        says: text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) =>
            /двигател|Двигател|съединител|Съединител|предавк|Предавк|неутрал|Неутрал|загасн|Загасн|угасн|Угасн/i.test(l),
          )
          .slice(0, 6),
      };
    });
    s.tag = tag;
    rec.reads.push(s);
    console.log(
      `    ${tag.padEnd(30)} sheet:${s.sheetOpen ? "open" : "SHUT"} gear:${String(s.gear).padEnd(4)}` +
        `ДВИГ:${String(s.engine).padEnd(6)}РЪЧНА:${String(s.handbrake).padEnd(6)}v:${String(s.speedKmh).padEnd(8)}` +
        (s.modal ? "MODAL " : "") +
        (s.says.length ? `says: ${JSON.stringify(s.says)}` : ""),
    );
    return s;
  };

  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи)$/.test(t)) {
            b.click();
            return t;
          }
        }
        return null;
      });
      if (!hit) return i;
      await page.waitForTimeout(500);
    }
    return 8;
  };

  // A REAL FINGER, and it COUNTS. `.click()` activates a covered button and a
  // finger does not — and the tap tally is half of what this run is for.
  let taps = 0;
  const touch = async (labelRe, { count = true } = {}) => {
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
    if (count) taps += 1;
    await page.waitForTimeout(420);
    return true;
  };

  // …AND THE SHEET RETRIES. The first cut read `sheet:SHUT` mid-sequence and
  // every switch came back `null` — the exact blank J-WAVE-2 mistook for
  // „engine off, handbrake on". One tap is not a state.
  const sheetIsOpen = () =>
    page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
  const openSheet = async () => {
    for (let i = 0; i < 4; i += 1) {
      if (await sheetIsOpen()) return true;
      await touch(/^Контроли на автомобила$/, { count: false });
      await page.waitForTimeout(350);
    }
    return sheetIsOpen();
  };

  const load = async () => {
    await page.goto(`${BASE}/dev/drive-rig?lesson=l0-free-drive&quality=low&readout=0`, {
      waitUntil: "domcontentloaded",
      timeout: 240_000,
    });
    await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 180_000 });
    await page.waitForTimeout(2600);
    await clearCards();
    await page.waitForTimeout(450);
  };

  // ONE TAP on the tier control, whichever surface carries it.
  //
  // BOTH SURFACES, because which one exists depends on the stage. On a ROOMY
  // stage it is the three-segment pill, and that pill was a rank-3 surface
  // that could be standing down for a card this second — so „«Напреднал» not
  // found" is waited out rather than concluded. On a COMPACT stage it is the
  // ⚙ sheet's «Ниво на помощта» cell (J-WAVE-3: 255 px of pill does not fit a
  // 167.5 px rail lane, and it was making «Пауза» answer for «Начинаещ»). The
  // short wait is deliberate — on a phone the pill will never appear and a long
  // one would just be dead time before the fallback.
  const goAdvanced = async () => {
    let visible = false;
    for (let i = 0; i < 4 && !visible; i += 1) {
      visible = await page.evaluate(() => {
        const d = document.querySelector('[data-hud="difficulty"]');
        return !!d && getComputedStyle(d).display !== "none" && d.getBoundingClientRect().width > 0;
      });
      if (!visible) {
        await clearCards();
        await page.waitForTimeout(600);
      }
    }
    if (visible && (await touch(/^Напреднал$/))) return { via: "picker", pickerVisible: true };
    // …or the ⚙ sheet cell, if this build carries the tier there instead.
    await openSheet();
    if (await touch(/^Ниво на помощта/)) return { via: "sheet-cell", pickerVisible: visible };
    return { via: null, pickerVisible: visible };
  };

  const padPush = (ms) =>
    page.evaluate(async (hold) => {
      const pad = [...document.querySelectorAll("[aria-label]")].find((e) =>
        /^Ход/.test(e.getAttribute("aria-label") || ""),
      );
      if (!pad) return { found: false };
      const r = pad.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const up = Math.min(70, r.height / 2 - 6);
      const mk = (t, x, y) =>
        pad.dispatchEvent(
          new PointerEvent(t, {
            pointerId: 9,
            pointerType: "touch",
            clientX: x,
            clientY: y,
            bubbles: true,
            cancelable: true,
            isPrimary: true,
          }),
        );
      const from = window.__driveRig?.last?.speedKmh ?? 0;
      mk("pointerdown", cx, cy - up);
      await new Promise((z) => setTimeout(z, hold));
      const to = window.__driveRig?.last?.speedKmh ?? 0;
      mk("pointerup", cx, cy - up);
      return { found: true, from: Number(from.toFixed(3)), to: Number(to.toFixed(3)) };
    }, ms);

  // ═══ ARM 1 · REPRODUCTION ════════════════════════════════════════════════
  console.log("\n  ARM 1 — the reproduction: tier switch on a STANDING car");
  await load();
  await openSheet();
  await page.waitForTimeout(500);
  const s0 = await readState("0 standing, Нормален");

  const tier = await goAdvanced();
  rec.tier = tier;
  console.log(`    tier via ${tier.via} (picker visible ${tier.pickerVisible}) · taps ${taps}`);
  await openSheet();
  await page.waitForTimeout(250);
  const s1 = await readState("1 after «Напреднал»");
  await page.waitForTimeout(1000);
  const s1b = await readState("1b +1.0 s");
  await page.waitForTimeout(1600);
  const s1c = await readState("1c +2.6 s");

  // «M►» with no clutch — the negative control on the gate.
  await openSheet();
  await touch(/^Скоростен лост — към по-висока предавка/);
  await openSheet();
  await page.waitForTimeout(250);
  const s2 = await readState("2 M► no clutch");

  // «СЪЕД» held + «M►», then the clutch comes UP with no throttle.
  const shift = await page.evaluate(async () => {
    const clutch = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").startsWith("Съединител"),
    );
    const up = [...document.querySelectorAll("button")].find((b) =>
      /към по-висока предавка/.test(b.getAttribute("aria-label") || ""),
    );
    if (!clutch || !up) return { ok: false, why: !clutch ? "no clutch cell" : "no gear-up cell" };
    const rc = clutch.getBoundingClientRect();
    const mk = (t, el, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(t, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          isPrimary: id === 1,
        }),
      );
    mk("pointerdown", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);
    await new Promise((r) => setTimeout(r, 320));
    up.click();
    await new Promise((r) => setTimeout(r, 320));
    mk("pointerup", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);
    return { ok: true };
  });
  taps += 2;
  rec.shiftMechanics = shift;
  await page.waitForTimeout(60);
  const s3 = await readState("3 M1, clutch up +0.05 s");
  await page.waitForTimeout(750);
  const s3b = await readState("3b +0.8 s (grace is 0.7)");
  await page.waitForTimeout(1200);
  const s3c = await readState("3c +2.0 s");
  const padDead = await padPush(4000);
  const s4 = await readState("4 after 4 s of thumb");
  console.log(`    pad after the stall: ${padDead.from} → ${padDead.to} km/h`);
  await page.screenshot({ path: `${OUT}/shots/arm1__${device.id}.png`, timeout: 120_000 });

  // …and what it costs a thumb to come back from it.
  const tapsAtStall = taps;
  await clearCards();
  await page.waitForTimeout(400);
  await openSheet();
  await page.waitForTimeout(300);
  const s5 = await readState("5 card dismissed");
  const restart = await page.evaluate(async () => {
    const clutch = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").startsWith("Съединител"),
    );
    const eng = [...document.querySelectorAll("button")].find(
      (b) => (b.getAttribute("aria-label") || "") === "Двигател",
    );
    if (!clutch || !eng) return { ok: false, why: !clutch ? "no clutch" : "no starter" };
    const rc = clutch.getBoundingClientRect();
    const mk = (t, el, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(t, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          isPrimary: id === 1,
        }),
      );
    mk("pointerdown", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);
    await new Promise((r) => setTimeout(r, 300));
    eng.click();
    await new Promise((r) => setTimeout(r, 300));
    mk("pointerup", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2);
    return { ok: true };
  });
  taps += 2;
  await openSheet();
  await page.waitForTimeout(250);
  const s6 = await readState("6 СЪЕД + ДВИГ (restart)");
  rec.restart = { restart, tapsToRestart: taps - tapsAtStall };

  rec.arm1 = { s0, s1, s1b, s1c, s2, s3, s3b, s3c, s4, s5, s6, padDead, tapsToStall: tapsAtStall };

  // ═══ ARM 2 · THE SEQUENCE A MANUAL DRIVER WOULD USE ══════════════════════
  // Clutch DOWN the whole time: select the gear, bring the throttle in, and
  // only then let the clutch out. There is no 0.7 s window to lose here — the
  // stall timer never arms while the clutch is down.
  console.log("\n  ARM 2 — clutch down → M1 → throttle → clutch out");
  taps = 0;
  await load();
  const tier2 = await goAdvanced();
  await openSheet();
  await page.waitForTimeout(300);
  const m0 = await readState("m0 after «Напреднал»");
  const manual = await page.evaluate(async () => {
    const clutch = [...document.querySelectorAll("button")].find((b) =>
      (b.getAttribute("aria-label") || "").startsWith("Съединител"),
    );
    const up = [...document.querySelectorAll("button")].find((b) =>
      /към по-висока предавка/.test(b.getAttribute("aria-label") || ""),
    );
    const pad = [...document.querySelectorAll("[aria-label]")].find((e) =>
      /^Ход/.test(e.getAttribute("aria-label") || ""),
    );
    if (!clutch || !up || !pad) {
      return { ok: false, why: !clutch ? "no clutch" : !up ? "no gear-up" : "no pad" };
    }
    const rc = clutch.getBoundingClientRect();
    const rp = pad.getBoundingClientRect();
    const px = rp.x + rp.width / 2;
    const py = rp.y + rp.height / 2 - Math.min(70, rp.height / 2 - 6);
    const mk = (t, el, id, x, y) =>
      el.dispatchEvent(
        new PointerEvent(t, {
          pointerId: id,
          pointerType: "touch",
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          isPrimary: id === 1,
        }),
      );
    mk("pointerdown", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2); // clutch DOWN
    await new Promise((r) => setTimeout(r, 300));
    up.click(); // …into M1
    await new Promise((r) => setTimeout(r, 300));
    mk("pointerdown", pad, 2, px, py); // throttle ON, clutch still down
    await new Promise((r) => setTimeout(r, 450));
    const atBite = window.__driveRig?.last?.speedKmh ?? 0;
    mk("pointerup", clutch, 1, rc.x + rc.width / 2, rc.y + rc.height / 2); // clutch OUT
    await new Promise((r) => setTimeout(r, 3500));
    const after = window.__driveRig?.last?.speedKmh ?? 0;
    mk("pointerup", pad, 2, px, py);
    return { ok: true, atBite: Number(atBite.toFixed(3)), after: Number(after.toFixed(3)) };
  });
  taps += 3; // clutch hold, gear-up, throttle thumb
  await openSheet();
  await page.waitForTimeout(300);
  const m1 = await readState("m1 after the sequence");
  rec.arm2 = { tier: tier2, m0, m1, manual, taps };
  rec.tapsToMoving = taps;
  rec.movedOnManualSequence = (manual.after ?? 0) > 1;
  console.log(
    `    at bite ${manual.atBite} → after 3.5 s ${manual.after} km/h · taps from tier to moving: ${taps}`,
  );
  await page.screenshot({ path: `${OUT}/shots/arm2__${device.id}.png`, timeout: 120_000 });

  // ═══ ARM 3 · POSITIVE CONTROL ════════════════════════════════════════════
  await load();
  const control = await padPush(3500);
  rec.control = control;
  console.log(`\n  ARM 3 — control, Нормален, same pad, same thumb: ${control.from} → ${control.to} km/h`);

  rec.coldStartHypothesis =
    s1.engine === null ? "UNREADABLE" : s1.engine === "false" && s1.handbrake === "true" ? "CONFIRMED" : "REFUTED";
  rec.stalledAfterShift =
    s3.engine === "true" && (s3b.says.some((l) => /Загасване/i.test(l)) || s3b.engine === "false");
  rec.controlOk = (control.to ?? 0) > 1;

  console.log(
    `\n  VERDICT · cold-start: ${rec.coldStartHypothesis} · stalled after the shift: ${rec.stalledAfterShift} ` +
      `· manual sequence drives: ${rec.movedOnManualSequence} (${rec.tapsToMoving} taps) · control ok: ${rec.controlOk}`,
  );

  results.push(rec);
  writeFileSync(`${OUT}/tier-switches.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(88)}\nSUMMARY`);
for (const r of results) {
  console.log(
    `${r.device.padEnd(30)} cold-start:${r.coldStartHypothesis.padEnd(10)}stalled:${String(r.stalledAfterShift).padEnd(6)}` +
      `drives:${String(r.movedOnManualSequence).padEnd(6)}taps:${String(r.tapsToMoving).padEnd(4)}control:${r.controlOk}`,
  );
}
