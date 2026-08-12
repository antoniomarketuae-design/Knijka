// =============================================================================
// wave6-controls.mjs — I1 · I2 · I3 · I24 · I25 ON THE DEPLOYED /simulator.
//
// EVERY ONE OF THESE ROWS WAS CLOSED ON `/dev/drive-rig` OR `/dev/pedal-rig`,
// AND BOTH `notFound()` IN PRODUCTION. So this file asks the same questions of
// the surface a student opens, with an instrument that can express them:
// Chromium's `Input.dispatchTouchEvent` with an explicit `touchPoints` array,
// because Playwright's `mouse` and `touchscreen.tap()` are SINGLE-POINT and a
// single point cannot state the question „does this button work while a thumb
// is already on the glass".
//
//   I1  the pad's pointer ownership survives a hide → the pedal comes back.
//   I3  the controls render INERT rather than `return null` while hidden.
//   I25 the drive axis is ABSOLUTE — a motionless press in the upper half is
//       throttle, the middle is stop, the lower half is brake. HIS RULING.
//   I24 «СЪЕД» exists on «Напреднал» and can be held.
//   I2  the survivor: «M►» pressed by a SECOND finger while «СЪЕД» is held.
//
//   node wave6-controls.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const TAG = arg("tag", "controls");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave6-controls`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const UP_RE = "към по-висока предавка";
const CLUTCH_RE = "^Съединител";

const browser = await chromium.launch({ args: GL });
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w6-controls] signed in ONCE as ${EMAIL} against ${BASE}`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  // The first-run hint is the founder's own screen, but it is not what these
  // rows are about, and leaving it up costs every arm a dismissal it can miss.
  await context.addInitScript(() => { try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private */ } });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height } };
  console.log(`\n${"=".repeat(96)}\n${device.label}\n  ${rec.inset}`);

  // ── the CDP fingers. `touchPoints` on touchEnd is THE SET BEING RELEASED. ─
  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const fingerDown = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) });
  };
  const fingerMove = async (id, x, y) => {
    if (!active.has(id)) return;
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) });
  };
  const fingerUp = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };
  const tap = async (x, y, id = 9) => { await fingerDown(id, x, y); await sleep(90); await fingerUp(id); await sleep(400); };

  const centreOf = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return { x, y, w: Math.round(q.width), h: Math.round(q.height), top: Math.round(q.y), bottom: Math.round(q.y + q.height),
        self: !!hit && (hit === el || el.contains(hit)),
        onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 50) ?? hit.tagName) : null };
    }
    return null;
  }, re);
  const tapLabel = async (re) => { const c = await centreOf(re); if (!c) return null; await tap(c.x, c.y); return c; };
  const tapText = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll("button,[role='menuitem'],a")) {
        if (!rx.test((el.textContent || "").trim())) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), text: (el.textContent || "").trim().slice(0, 24) };
      }
      return null;
    }, re);
    if (!c) return null;
    await tap(c.x, c.y);
    return c;
  };
  const clearCards = async () => { for (let i = 0; i < 8; i += 1) { const h = await tapText(/^(Разбрах|Продължи|Започни)$/); if (!h) return i; await sleep(420); } return 8; };
  const speedNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скорост "]');
    const m = el ? /Скорост ([\d.,]+)/.exec(el.getAttribute("aria-label")) : null;
    return m ? Number(m[1].replace(",", ".")) : null;
  });
  const gearNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скоростен лост:"]');
    return el ? (el.getAttribute("aria-label").split(":")[1] || "").trim() : null;
  });
  // THE DRIVE PAD, BY ITS OWN NAME — and this line is a correction, recorded
  // rather than quietly fixed. It used to be „the `[role=slider]` that is not
  // the wheel", and on all three PORTRAIT profiles the first such slider is
  // «Позиция в демонстрацията», the demonstration deck's SCRUB BAR: the probe
  // pressed the transport and reported the throttle as dead (1 → 1 km/h) on
  // exactly the orientation the founder is complaining about. That is the
  // shape of every false finding in this programme — an instrument that
  // measured something adjacent to the question — so the pad is now matched by
  // the label `driveAxisLabelBg()` actually writes, and the arm records
  // whether anything is painted on top of it before it presses.
  const drivePad = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('[role="slider"]')].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const upper = document.elementFromPoint(cx, Math.round(cy - 55));
    return {
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      cx, cy, label: el.getAttribute("aria-label").slice(0, 40),
      throttleSelf: !!upper && (upper === el || el.contains(upper)),
      throttleOnTop: upper ? (upper.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 46) ?? upper.tagName) : null,
    };
  });
  const touchControlsState = () => page.evaluate(() => {
    const root = document.querySelector('[data-hud="touch-controls"]');
    if (!root) return { present: false };
    const cs = getComputedStyle(root);
    const pads = [...document.querySelectorAll('[role="slider"]')].map((p) => ({
      label: p.getAttribute("aria-label")?.slice(0, 26),
      pointerEvents: getComputedStyle(p).pointerEvents,
    }));
    return {
      present: true,
      inertAttr: root.getAttribute("data-sim-touch-inert"),
      ariaHidden: root.getAttribute("aria-hidden"),
      opacity: cs.opacity,
      display: cs.display,
      pads,
    };
  });

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(4600);
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        if (!best || r.width * r.height > best.w * best.h) best = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      return { hasCanvas: !!best, canvas: best, url: location.pathname, loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || "") };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} ${JSON.stringify(gate.canvas)} · url ${gate.url} · loading ${gate.loading}`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || gate.loading) {
      rec.fatal = "NO LIVE CANVAS"; console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec); writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1)); await context.close(); continue;
    }
    await clearCards();
    await sleep(600);

    // ── GET THE CAR READY TO MOVE (automatic tier, by thumb only) ───────────
    const prep = { taps: 0 };
    const openSheet = async () => { prep.taps += 1; return tapLabel(/^Контроли на автомобила$/); };
    await openSheet(); await sleep(500);
    const switches = await page.evaluate(() => {
      const out = {};
      for (const b of document.querySelectorAll("button")) {
        const l = b.getAttribute("aria-label") || "";
        if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) out[l] = b.getAttribute("aria-pressed");
      }
      return out;
    });
    prep.switches = switches;
    if (switches["Предпазен колан"] === "false") { await tapLabel(/^Предпазен колан$/); prep.taps += 1; }
    if (switches["Двигател"] === "false") { await tapLabel(/^Двигател$/); prep.taps += 1; }
    if (switches["Ръчна спирачка"] === "true") { await tapLabel(/^Ръчна спирачка$/); prep.taps += 1; }
    await sleep(500);
    // ── THE ⚙ SHEET CENSUS, BEFORE ANYTHING IS CLOSED ──────────────────────
    // This is here because of a false finding this file produced on its first
    // run: on all three PORTRAIT profiles the probe „closed the sheet" by
    // pressing «Затвори контролите» at its own centre, the demonstration deck's
    // pill answered that point instead, a demonstration started PLAYING, and
    // the throttle then read 1 → 1 km/h on three profiles. The instrument had
    // pressed a different control — but the reason it could is a product fact,
    // so it is measured rather than stepped around.
    prep.sheetCensus = await page.evaluate(() => {
      const sheet = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
      if (!sheet) return null;
      return [...sheet.querySelectorAll("button")].map((b) => {
        const r = b.getBoundingClientRect();
        const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        return {
          label: b.getAttribute("aria-label")?.slice(0, 44), text: (b.textContent || "").trim().slice(0, 8),
          x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
          self: !!hit && (hit === b || b.contains(hit)),
          onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label")?.slice(0, 44) ?? hit.tagName) : null,
        };
      });
    });
    const buriedCells = (prep.sheetCensus ?? []).filter((c) => !c.self);
    console.log(`  ⚙ CENSUS · ${prep.sheetCensus?.length ?? 0} cells · buried ${buriedCells.length}`);
    for (const c of buriedCells) console.log(`  ⚙ CENSUS · BURIED «${c.text}» ${c.label} at [${c.x},${c.y}] → a finger there hits «${c.onTop}»`);

    // Close it with the ⚙ TOGGLE, not with the ✕: the ✕ is one of the cells
    // the census above may have just reported buried.
    await tapLabel(/^Контроли на автомобила$/); prep.taps += 1;
    await sleep(600);
    prep.sheetStillOpen = await page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
    await clearCards();
    prep.gear = await gearNow();
    rec.prep = prep;
    console.log(`  PREP · ${prep.taps} taps · switches ${JSON.stringify(switches)} · gear ${prep.gear}`);

    // ══ I25 · THE PAD IS ABSOLUTE — three motionless presses ════════════════
    // His ruling, verbatim: „up is forward, middle is stop, down is backwards".
    // No drag anywhere in this arm: finger DOWN, hold, read, finger UP.
    // A DEMONSTRATION DECK LEFT OPEN IS A SECOND SLIDER ON THE GLASS. Close it
    // before the pad arms, so „the pedal is dead" can never again be a probe
    // holding the wrong handle.
    const deckOpen = await page.evaluate(() => !!document.querySelector('[aria-label="Позиция в демонстрацията"]'));
    if (deckOpen) {
      // Stop it as well as fold it — a demonstration that is PLAYING drives
      // the scene, and a throttle measured under playback is not a throttle.
      await tapLabel(/^(Пауза на демонстрацията|Спри демонстрацията|Стоп)/).catch(() => null);
      await tapText(/Демонстрац/);
      await sleep(700);
    }
    rec.deckWasOpen = deckOpen;
    rec.deckStillOpen = await page.evaluate(() => !!document.querySelector('[aria-label="Позиция в демонстрацията"]'));

    const pad = await drivePad();
    rec.pad = pad;
    console.log(`  PAD · «${pad?.label}» ${JSON.stringify(pad)} · deck had to be closed first: ${deckOpen}`);
    const absolute = { pad };
    if (pad) {
      const press = async (dy, holdMs, note) => {
        const y = pad.cy + dy;
        const before = await speedNow();
        await fingerDown(3, pad.cx, y);
        await sleep(holdMs);
        const knob = await page.evaluate(() => {
          const el = [...document.querySelectorAll('[role="slider"]')].find((e) => !/Волан/.test(e.getAttribute("aria-label") || ""));
          const k = el?.querySelector("div div") ?? null;
          return k ? getComputedStyle(k).transform : null;
        });
        const during = await speedNow();
        await fingerUp(3);
        await sleep(700);
        const after = await speedNow();
        return { note, dy, y, before, during, after, knob };
      };
      absolute.up = await press(-55, 3200, "upper half (throttle)");
      console.log(`  I25 · press ${absolute.up.dy}px ABOVE centre → speed ${absolute.up.before} → ${absolute.up.during} km/h`);
      // let it roll, then the middle
      absolute.middle = await press(0, 2600, "dead centre (stop)");
      console.log(`  I25 · press at the CENTRE      → speed ${absolute.middle.before} → ${absolute.middle.during} km/h`);
      absolute.down = await press(+55, 2600, "lower half (brake)");
      console.log(`  I25 · press ${absolute.down.dy}px BELOW centre → speed ${absolute.down.before} → ${absolute.down.during} km/h`);
      absolute.verdict =
        (absolute.up.during ?? 0) > (absolute.up.before ?? 0) + 0.5 &&
        (absolute.middle.during ?? 99) <= (absolute.middle.before ?? 0) + 0.5 &&
        (absolute.down.during ?? 99) <= (absolute.down.before ?? 0) + 0.5;
      console.log(`  I25 · HIS RULING HOLDS ON /simulator: ${absolute.verdict}`);
    }
    rec.absolute = absolute;

    // ══ I3 + I1 · THE HIDE, AND THE PEDAL AFTERWARDS ════════════════════════
    // Sequence: throttle with finger 1 → PAUSE with finger 2 while finger 1 is
    // still down → read the DOM (I3) → lift finger 1 into the inert node →
    // resume → press again (I1). The old bug refused every later touch.
    const hide = {};
    if (pad) {
      hide.before = await touchControlsState();
      await fingerDown(1, pad.cx, pad.cy - 55);
      await sleep(1400);
      hide.speedWhileDriving = await speedNow();
      // PAUSE WITH A SECOND FINGER — and make sure it actually took, because a
      // pause that did not happen would be read below as „the controls did not
      // go inert", i.e. as §I3 failing when nothing was ever asked of it.
      const pause = await centreOf(/^Пауза$/);
      hide.pauseButton = pause;
      hide.pausePresses = 0;
      for (let i = 0; i < 3 && pause; i += 1) {
        await tap(pause.x, pause.y, 2);
        hide.pausePresses += 1;
        await sleep(900);
        const s = await touchControlsState();
        if (s.inertAttr === "on") break;
      }
      hide.duringHide = await touchControlsState();
      console.log(`  I3 · while paused: present ${hide.duringHide.present} · data-sim-touch-inert ${hide.duringHide.inertAttr} · aria-hidden ${hide.duringHide.ariaHidden} · opacity ${hide.duringHide.opacity} · pads ${JSON.stringify(hide.duringHide.pads)}`);
      hide.i3 =
        hide.duringHide.present === true &&
        hide.duringHide.inertAttr === "on" &&
        hide.duringHide.ariaHidden === "true" &&
        Number(hide.duringHide.opacity) === 0 &&
        (hide.duringHide.pads ?? []).every((p) => p.pointerEvents === "none");
      console.log(`  I3 · RENDERS INERT rather than returning null: ${hide.i3}`);

      // the finger lifts INTO the inert node — the exact event the old code lost
      await fingerUp(1);
      await sleep(500);
      // resume the way a student does
      const resume = (await tapText(/^(Продължи|Възобнови|Напред)$/)) ?? (await tapLabel(/^Пауза$/));
      hide.resumedBy = resume;
      await sleep(1200);
      hide.after = await touchControlsState();
      console.log(`  I1 · resumed via ${JSON.stringify(resume)} · controls back: inert ${hide.after.inertAttr ?? "(none)"} opacity ${hide.after.opacity}`);

      // I1 — DOES THE PEDAL ANSWER A BRAND-NEW PRESS?
      const pad2 = await drivePad();
      hide.padAfter = pad2;
      if (pad2) {
        const before = await speedNow();
        await fingerDown(1, pad2.cx, pad2.cy - 55);
        await sleep(3000);
        const during = await speedNow();
        await fingerUp(1);
        await sleep(600);
        hide.pedalAfterHide = { before, during, works: (during ?? 0) > (before ?? 0) + 0.5 };
        console.log(`  I1 · pedal after the hide: ${before} → ${during} km/h · WORKS ${hide.pedalAfterHide.works}`);
      }
    }
    rec.hide = hide;

    // ══ I24 + I2 · «Напреднал», «СЪЕД» AND THE SECOND FINGER ════════════════
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(4200);
    await clearCards();
    await sleep(500);
    const manual = { taps: 0 };
    await tapLabel(/^Контроли на автомобила$/); manual.taps += 1;
    await sleep(500);
    for (let i = 0; i < 4; i += 1) {
      const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
      if (on === null || /^Ниво на помощта: Напреднал/.test(on)) break;
      await tapLabel(/^Ниво на помощта/); manual.taps += 1;
      await sleep(500);
    }
    manual.tier = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
    await sleep(1200);
    const sheetOpen = () => page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
    if (!(await sheetOpen())) { await tapLabel(/^Контроли на автомобила$/); manual.taps += 1; await sleep(600); }

    manual.clutch = await centreOf(new RegExp(CLUTCH_RE));
    manual.up = await centreOf(new RegExp(UP_RE));
    console.log(`  I24 · tier ${manual.tier}`);
    console.log(`  I24 · «СЪЕД» ${JSON.stringify(manual.clutch)}`);
    console.log(`  I2  · «M►»  ${JSON.stringify(manual.up)}`);

    if (manual.clutch && manual.up) {
      // event recorder — so a refusal can be told apart from a swallowed press
      await page.evaluate(() => {
        window.__w6 = { log: [], maxTouches: 0 };
        const nm = (t) => { const el = t instanceof Element ? t.closest("[aria-label]") : null; return el ? el.getAttribute("aria-label").slice(0, 32) : (t?.tagName ?? "?"); };
        for (const type of ["pointerdown", "pointerup", "pointercancel", "click", "lostpointercapture"]) {
          document.addEventListener(type, (e) => window.__w6.log.push({ type, on: nm(e.target), id: e.pointerId ?? null, detail: e.detail ?? null, t: Math.round(performance.now()) }), true);
        }
        for (const type of ["touchstart", "touchmove", "touchend"]) {
          document.addEventListener(type, (e) => { window.__w6.maxTouches = Math.max(window.__w6.maxTouches, e.touches.length); }, true);
        }
      });
      const gBefore = await gearNow();
      await fingerDown(1, manual.clutch.x, manual.clutch.y);
      await sleep(340);
      manual.clutchPaint = await page.evaluate(() => {
        const el = document.querySelector('[aria-label^="Съединител"]');
        return el ? { color: getComputedStyle(el).color } : null;
      });
      manual.upAtPress = await centreOf(new RegExp(UP_RE));
      await fingerDown(2, manual.up.x, manual.up.y);
      await sleep(150);
      await fingerUp(2);
      await sleep(500);
      const gAfter = await gearNow();
      await fingerUp(1);
      await sleep(600);
      manual.twoFinger = {
        gearBefore: gBefore, gearAfter: gAfter,
        maxTouches: await page.evaluate(() => window.__w6.maxTouches),
        log: await page.evaluate(() => window.__w6.log.slice()),
      };
      manual.twoFinger.reachedGear = gBefore !== gAfter;
      console.log(`  I2  · СЪЕД held + «M►» BY TOUCH: ${gBefore} → ${gAfter} · simultaneous touches ${manual.twoFinger.maxTouches} · REACHED A GEAR ${manual.twoFinger.reachedGear}`);
      console.log(`  I2  · «M►» topmost at its own centre while the clutch is held: ${manual.upAtPress?.self} (top: ${manual.upAtPress?.onTop})`);
      for (const e of manual.twoFinger.log) console.log(`        ${JSON.stringify(e)}`);

      // CONTROL ARM — the same clutch, the upshift by KEYBOARD. If this
      // reaches a gear and the arm above does not, the defect is in the CELL,
      // not the driveline.
      await clearCards();
      if (!(await sheetOpen())) { await tapLabel(/^Контроли на автомобила$/); await sleep(600); }
      const c2 = await centreOf(new RegExp(CLUTCH_RE));
      if (c2) {
        const gB = await gearNow();
        await fingerDown(1, c2.x, c2.y);
        await sleep(340);
        await page.keyboard.press("BracketRight");
        await sleep(500);
        const gA = await gearNow();
        await fingerUp(1);
        await sleep(500);
        manual.touchClutchKeyUp = { gearBefore: gB, gearAfter: gA, reachedGear: gB !== gA };
        console.log(`  I2  · СЪЕД held + «]» BY KEYBOARD: ${gB} → ${gA} · REACHED A GEAR ${manual.touchClutchKeyUp.reachedGear}`);
      }
    }
    rec.manual = manual;
    await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 }).catch(() => {});
  } catch (e) {
    rec.error = String(e?.message || e).split("\n")[0].slice(0, 240);
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(96)}\nSUMMARY — deployed /simulator, ${BASE}`);
for (const r of results) {
  console.log(
    `${r.device.padEnd(30)} I25 absolute ${r.absolute?.verdict ?? "—"} · I3 inert ${r.hide?.i3 ?? "—"} · I1 pedal-after-hide ${r.hide?.pedalAfterHide?.works ?? "—"} · I24 «СЪЕД» ${r.manual?.clutch ? "present" : "ABSENT"} · I2 two-finger upshift ${r.manual?.twoFinger?.reachedGear ?? "—"} (keyboard control ${r.manual?.touchClutchKeyUp?.reachedGear ?? "—"})${r.fatal ? ` · FATAL ${r.fatal}` : ""}${r.error ? ` · ERROR ${r.error}` : ""}`,
  );
}
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
