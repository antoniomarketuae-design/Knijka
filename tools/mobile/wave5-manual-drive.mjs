// =============================================================================
// wave5-manual-drive.mjs — «НАПРЕДНАЛ», END TO END, BY THUMB, ON PRODUCTION.
//
// The four-arm §C2 proof answered "does the upshift cell fire". This answers
// the founder's question instead: CAN A STUDENT DRIVE THE MANUAL TIER WITH TWO
// THUMBS AND NOTHING ELSE — tier, clutch, first gear, move off, change up —
// and how many deliberate presses does it cost him.
//
// ── THE INSTRUMENT, AND THE TWO WAYS IT HAS ALREADY LIED ────────────────────
// 1. `.click()` and `touchscreen.tap()` are SINGLE-POINT. A `.click()` on the
//    gear cell while the clutch is "held" releases nothing; a `tap()` lifts the
//    first finger before the second lands. Both read exactly like the defect.
// 2. CDP's `Input.dispatchTouchEvent` releases the points LISTED in
//    `touchPoints` on a `touchEnd`. Passing the REMAINING points (the reading
//    that looks natural) releases the clutch and leaves the gear cell down —
//    wave 3's four-arm proof died on that line and published a defect that does
//    not exist. `touchPoints` on a touchEnd is THE SET BEING RELEASED.
//
// So: two genuine CDP touch points, never a `.click()` on anything under test,
// and the run REFUSES to report an arm it cannot prove was two-fingered — a
// page-side recorder counts `TouchEvent.touches.length` and the arm is void
// unless it saw 2, and void again unless the GEAR CELL was released before the
// clutch.
//
// ── THE THIRD TRAP: THE READOUT IS SLOWER THAN THE GEAR ─────────────────────
// `CABIN_POLL_MS` is 250 ms and this box renders at single-digit fps, so a
// 420 ms read prints "N" for a shift that already happened. Every read below
// waits 700 ms+. Two of wave 4's own intermediate "the cell did not fire"
// readings were this and nothing else.
//
//   node wave5-manual-drive.mjs --base http://localhost:3491
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
// PRODUCTION HAS NO /dev/drive-rig — `page.tsx` calls notFound() when NODE_ENV
// is production, on purpose. This is the surface the student is sold.
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/j5-manual`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const devices = resolveDevices(arg("device", null) ? arg("device", null).split(",") : undefined);

// Real GPU or this scene runs at 0.4 fps and a 0.9 s event falls between two
// frames. Same recipe as tools/clips/headless/door-mirror-shot.mjs.
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const UP_RE = "към по-висока предавка";
const CLUTCH_RE = "^Съединител";
const REFUSAL = "Предавката не влезе";

const user = await ensureHarnessUser();
const browser = await chromium.launch({ args: GL_ARGS });
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
  console.log(`\n${"=".repeat(92)}\n${device.label}\n  ${rec.inset}`);

  // ── the fingers ───────────────────────────────────────────────────────────
  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const down = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [...active.entries()].map(([i, p]) => pt(i, p)) });
  };
  const up = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };

  const centre = (re) => page.evaluate((r) => {
    const rx = new RegExp(r);
    for (const el of document.querySelectorAll("button,[aria-label]")) {
      if (!rx.test(el.getAttribute("aria-label") || "")) continue;
      const q = el.getBoundingClientRect();
      if (q.width < 1) continue;
      const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, w: Math.round(q.width), h: Math.round(q.height),
        // A finger presses what is PAINTED there; `.click()` presses the button
        // whatever stands on it. That difference is a class of false green.
        self: !!hit && (hit === el || el.contains(hit)),
        onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label") ?? hit.tagName) : null,
        label: el.getAttribute("aria-label"),
      };
    }
    return null;
  }, re);

  let taps = 0;                 // every deliberate press, from the cold page
  let tapsSinceTier = null;     // …and the founder's number: tier → moving
  // EVERY PRESS IS NAMED. A bare number cannot be audited, and two of the
  // presses in this run are the harness's own fault (my negative-control arm
  // raises a card that shuts the ⚙ sheet, so it has to be re-opened). Naming
  // them lets the report separate the STUDENT's journey from the PROBE's.
  const journey = [];
  const bump = (note, blame = "student") => {
    taps += 1;
    if (tapsSinceTier !== null) tapsSinceTier += 1;
    journey.push({ n: taps, note, blame });
  };

  const tap = async (re, note = String(re), blame = "student") => {
    const c = await centre(re);
    if (!c) return null;
    bump(note, blame);
    await down(9, c.x, c.y);
    await page.waitForTimeout(90);
    await up(9);
    await page.waitForTimeout(430);
    return c;
  };
  const gearNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скоростен лост:"]');
    return el ? (el.getAttribute("aria-label").split(":")[1] || "").trim() : null;
  });
  const speedNow = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Скорост "]');
    const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
    return m ? Number(m[1].replace(",", ".")) : null;
  });
  // THE CLUTCH, READ OFF THE GLASS — `/simulator` publishes no telemetry hook,
  // so the witness is the cell's own paint (`glyphStyle(held,"warning")`),
  // which is also the only signal the student gets.
  const clutchPaint = () => page.evaluate(() => {
    const el = document.querySelector('[aria-label^="Съединител"]');
    return el ? getComputedStyle(el).color : null;
  });
  const refusalNow = () => page.evaluate(() => /Предавката не влезе/.test(document.body.innerText || ""));
  const sheetOpen = () => page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
  // Harness plumbing ONLY — never a control under test. Dismissing a teaching
  // card is not the question; every cell under test is pressed with a finger.
  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          if (/^(Разбрах|Продължи|Започни)$/.test((b.textContent || "").trim())) { b.click(); return true; }
        }
        return false;
      });
      if (!hit) return i;
      await page.waitForTimeout(480);
    }
    return 8;
  };

  // ── stage ─────────────────────────────────────────────────────────────────
  await signIn(page, { email: user.email, password: user.password }, BASE);
  await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
  await page.waitForTimeout(3400);
  rec.cardsCleared = await clearCards();
  await page.waitForTimeout(600);

  // the touch-truth recorder + the event tap
  await page.evaluate(() => {
    window.__w5 = { log: [], maxTouches: 0 };
    const nm = (t) => { const el = t instanceof Element ? t.closest("[aria-label]") : null; return el ? el.getAttribute("aria-label").slice(0, 34) : (t?.tagName ?? "?"); };
    for (const type of ["pointerdown", "pointerup", "pointercancel", "click"]) {
      document.addEventListener(type, (e) => window.__w5.log.push({ type, on: nm(e.target), id: e.pointerId ?? null, t: Math.round(performance.now()) }), true);
    }
    for (const type of ["touchstart", "touchmove", "touchend"]) {
      document.addEventListener(type, (e) => {
        window.__w5.maxTouches = Math.max(window.__w5.maxTouches, e.touches.length);
        window.__w5.log.push({ type, on: nm(e.target), touches: e.touches.length, t: Math.round(performance.now()) });
      }, true);
    }
  });
  const drain = () => page.evaluate(() => { const l = window.__w5.log.slice(); window.__w5.log.length = 0; return l; });

  // ── 1 · THE TIER, BY THUMB ────────────────────────────────────────────────
  await tap(/^Контроли на автомобила$/, "open the ⚙ sheet");
  await page.waitForTimeout(600);
  let tierOk = false;
  for (let i = 0; i < 4 && !tierOk; i += 1) {
    const on = await page.evaluate(() => document.querySelector('[aria-label^="Ниво на помощта"]')?.getAttribute("aria-label") ?? null);
    if (on === null) break;
    // «Ниво на помощта: Нормален — натисни за Напреднал» CONTAINS the next
    // rung's name. A loose match reported the manual tier as reached while the
    // box was still automatic, and every clutch reading after it was about the
    // wrong gearbox.
    if (/^Ниво на помощта: Напреднал/.test(on)) { tierOk = true; break; }
    await tap(/^Ниво на помощта/, "cycle the difficulty tier");
    await page.waitForTimeout(500);
  }
  rec.tierReached = tierOk;
  rec.tapsToTier = taps;
  tapsSinceTier = 0;                       // ← the founder's counter starts HERE
  await page.waitForTimeout(1400);
  await clearCards();
  if (!(await sheetOpen())) await tap(/^Контроли на автомобила$/, "re-open the ⚙ sheet after the tier re-seat");
  await page.waitForTimeout(500);
  console.log(`  TIER · «Напреднал» reached ${tierOk} in ${rec.tapsToTier} presses from a cold page`);

  // ── 2 · THE NEGATIVE CONTROL, FIRST ───────────────────────────────────────
  // An upshift with NO clutch must be refused. This runs BEFORE the real move
  // so the arm cannot be explained by a car that was already in gear.
  await drain();
  const negBefore = await gearNow();
  const upCell = await centre(UP_RE);
  const neg = { cell: upCell, gearBefore: negBefore };
  if (upCell) {
    await down(1, upCell.x, upCell.y);
    await page.waitForTimeout(130);
    await up(1);
    await page.waitForTimeout(800);
    neg.gearAfter = await gearNow();
    neg.refusalShown = await refusalNow();
    neg.log = await drain();
  }
  neg.pass = !!upCell && neg.gearAfter === negBefore && neg.refusalShown === true;
  rec.negativeControl = neg;
  console.log(`  NEG  · «M►» with NO clutch: ${neg.gearBefore} → ${neg.gearAfter} · «${REFUSAL}» shown ${neg.refusalShown} · REFUSED CORRECTLY ${neg.pass}`);

  await clearCards();
  await page.waitForTimeout(500);
  if (!(await sheetOpen())) await tap(/^Контроли на автомобила$/, "re-open the ⚙ sheet the refusal card shut", "probe");

  // ── 3 · THE PRE-DRIVE SWITCHES, BY THUMB ──────────────────────────────────
  const switches = await page.evaluate(() => {
    const out = {};
    for (const b of document.querySelectorAll("button")) {
      const l = b.getAttribute("aria-label") || "";
      if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) out[l] = b.getAttribute("aria-pressed");
    }
    return out;
  });
  rec.switchesBefore = switches;
  if (switches["Предпазен колан"] === "false") await tap(/^Предпазен колан$/, "seatbelt");
  if (switches["Двигател"] === "false") await tap(/^Двигател$/, "start the engine");
  if (switches["Ръчна спирачка"] === "true") await tap(/^Ръчна спирачка$/, "release the handbrake");
  await page.waitForTimeout(700);
  await clearCards();
  if (!(await sheetOpen())) await tap(/^Контроли на автомобила$/, "re-open the ⚙ sheet a pre-drive card shut", "probe");
  await page.waitForTimeout(400);

  // ── 4 · FIRST GEAR — TWO FINGERS, AT THE SAME INSTANT ─────────────────────
  await drain();
  const cCell = await centre(CLUTCH_RE);
  const uCell = await centre(UP_RE);
  const first = { clutchCell: cCell, upCell: uCell, gearBefore: await gearNow() };
  if (cCell && uCell) {
    await down(1, cCell.x, cCell.y); bump("hold «СЪЕД» (finger 1)");   // HELD, never released by a tap
    await page.waitForTimeout(300);
    first.clutchPaintHeld = await clutchPaint();
    // RE-HIT-TEST AT THE INSTANT OF THE PRESS. The refusal card moved «M►» once
    // already; a cached coordinate is how a live cell gets published as dead.
    const uNow = await centre(UP_RE);
    first.upCellAtPress = uNow;
    if (uNow) {
      await down(2, uNow.x, uNow.y); bump("press «M►» into 1st (finger 2)");
      await page.waitForTimeout(150);
      await up(2);                                 // …released FIRST
      await page.waitForTimeout(760);
    }
    first.gearAfter = await gearNow();
    first.clutchPaintStillHeld = await clutchPaint();
    first.maxTouches = await page.evaluate(() => window.__w5.maxTouches);
    first.log = await drain();
    const iUp = first.log.findIndex((e) => e.type === "pointerup" && /по-висока/.test(e.on));
    const iCl = first.log.findIndex((e) => e.type === "pointerup" && /Съединител/.test(e.on));
    first.armValid = first.maxTouches >= 2 && iUp >= 0 && (iCl < 0 || iUp < iCl);
  }
  rec.firstGear = first;
  console.log(`  GEAR · «СЪЕД» held + «M►» by touch: ${first.gearBefore} → ${first.gearAfter} · touches ${first.maxTouches} · ARM VALID ${first.armValid}`);
  console.log(`         clutch paint held ${first.clutchPaintHeld} → at the shift ${first.clutchPaintStillHeld}`);

  // ── 5 · MOVE OFF — CLUTCH UP AS THE THROTTLE COMES ON ─────────────────────
  // The move only works if the clutch is still down when the throttle arrives.
  // Wave 4's first walk released it first, stalled, and read the cell as dead.
  // That is the driveline being RIGHT about manual cars.
  const pad = await centre("^Ход");
  const move = { pad, sheetOpenDuringDrive: await sheetOpen() };
  if (pad) {
    const ty = pad.y - Math.min(70, Math.round(pad.h / 2) - 6);   // upper half = throttle
    await down(3, pad.x, ty); bump("throttle on the drive pad");   // finger 3
    await page.waitForTimeout(900);
    await up(1);                                                   // clutch comes up (no press)
    await page.waitForTimeout(5200);
    move.speedKmh = await speedNow();
    move.gearWhileMoving = await gearNow();
    console.log(`  MOVE · throttle on, clutch released → ${move.speedKmh} km/h in ${move.gearWhileMoving}`);

    // ── 6 · CHANGE UP, WHILE MOVING, TWO FINGERS AGAIN ──────────────────────
    await drain();
    const c2 = await centre(CLUTCH_RE);
    move.clutchCellWhileMoving = c2;
    if (c2) {
      await up(3);                            // lift off, as a driver does
      await page.waitForTimeout(220);
      await down(1, c2.x, c2.y); bump("hold «СЪЕД» again, at speed");
      await page.waitForTimeout(320);
      const u2 = await centre(UP_RE);
      move.upCellWhileMoving = u2;
      if (u2) {
        await down(2, u2.x, u2.y); bump("press «M►» into 2nd");
        await page.waitForTimeout(150);
        await up(2);
        await page.waitForTimeout(780);
      }
      move.gearAfterUpshift = await gearNow();
      move.maxTouches = await page.evaluate(() => window.__w5.maxTouches);
      move.log = await drain();
      const iUp = move.log.findIndex((e) => e.type === "pointerup" && /по-висока/.test(e.on));
      const iCl = move.log.findIndex((e) => e.type === "pointerup" && /Съединител/.test(e.on));
      move.armValid = move.maxTouches >= 2 && iUp >= 0 && (iCl < 0 || iUp < iCl);
      // …and back on the throttle so the shift is not judged on a coasting car.
      await down(3, pad.x, ty);
      await page.waitForTimeout(320);
      await up(1);
      await page.waitForTimeout(3600);
      move.speedAfterUpshift = await speedNow();
      move.gearAfterSettle = await gearNow();
      await up(3);
    }
  }
  rec.moveOff = move;
  console.log(`  UP   · while moving: ${move.gearWhileMoving} → ${move.gearAfterUpshift} (settled ${move.gearAfterSettle}) · ${move.speedAfterUpshift} km/h · ARM VALID ${move.armValid}`);
  rec.taps = taps;
  rec.tapsTierToMoving = tapsSinceTier;
  rec.journey = journey;
  rec.tapsStudentOnly = journey.filter((j) => j.blame === "student").length;
  rec.drivable = (move.speedKmh ?? 0) > 1 && first.gearAfter === "M1";
  console.log(`  TOTAL· ${taps} presses from a cold page · ${tapsSinceTier} from the tier switch to a moving car · DRIVABLE ${rec.drivable}`);

  await page.screenshot({ path: `${OUT}/shots/${device.id}.png`, timeout: 120_000 }).catch(() => {});
  results.push(rec);
  writeFileSync(`${OUT}/manual.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

console.log(`\n${"=".repeat(92)}\nSUMMARY — «Напреднал», thumb only, production`);
for (const r of results) {
  console.log(
    `${r.device.padEnd(30)} tier ${r.tierReached ? "OK" : "NO"} · neg ${r.negativeControl?.pass ? "REFUSED" : "!!!"} · 1st ${r.firstGear?.gearBefore}→${r.firstGear?.gearAfter}` +
    ` · ${r.moveOff?.speedKmh ?? "-"} km/h · up ${r.moveOff?.gearWhileMoving}→${r.moveOff?.gearAfterUpshift}` +
    ` · taps ${r.tapsTierToMoving} (tier→moving) / ${r.taps} total · DRIVABLE ${r.drivable}`,
  );
}
writeFileSync(`${OUT}/manual.json`, JSON.stringify(results, null, 1));
