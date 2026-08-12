// =============================================================================
// wave7-ledger.mjs — THE ROWS NOBODY HAD EVER FIRED ON /simulator.
//
// WHY THIS FILE EXISTS. Doc 91 §O.1 invented the verdict DONE-UNVERIFIED for a
// row that is provably in the source and has never been exercised on the page a
// student opens. Six rows carried it (I1, I3, I6, I13, I16, I25) and three more
// (I2, I10, I23, I24, I26c) had only a partial answer. Their evidence was a unit
// test, a source read, or `/dev/drive-rig` — which calls `notFound()` under
// NODE_ENV=production. This probe closes that gap the only way it can be closed:
// by pressing the controls with real touch points on the authenticated
// /simulator of a production build, on the six-profile ladder.
//
// THE GATE, FIRST. Five probes in this project have reported „0 overflow" from a
// page with no simulator on it. Nothing below records a number before
//   hasCanvas === true  AND  a non-zero canvas rect  AND  [data-hud=touch-controls]
// and the row is written as `refused` if any of them fails.
//
// THE INSTRUMENT. Chromium, because CDP `Input.dispatchTouchEvent` is the only
// way to express TWO touch points and half of these rows are about what happens
// with a second finger down. Playwright's `touchscreen` is single-tap and
// `.click()` presses a button through whatever is standing on it — which is how
// this project published a defect that did not exist (see wave5-manual-drive's
// header). Every press below is a real touch point at a control's own centre,
// and `elementFromPoint` at that centre is recorded beside it, so „the control
// fired" and „the control is reachable" stay separate facts.
//
// ROWS OWNED HERE (doc 91 §I / §O):
//   I1   the pedal comes back after the card that hid it — with the thumb DOWN
//   I2   a button still fires while a second finger is on a pad
//   I3   the controls go INERT, they do not unmount
//   I10  the minimap is off the thumb band
//   I23  «Изглед» is a labelled top-rail button and answers its own centre
//   I24  «СЪЕД» exists, and the card that teaches «M►» does not stand on it
//   I25  the drive pad is ABSOLUTE — centre is stop, up is forward, down is brake
//   I26c is the quality preset reachable from the lesson menu
//   REG  the reverse guard · nothing under 44 px · his session still drives
//
//   node tools/mobile/wave7-ledger.mjs --base http://localhost:3493
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3493");
// ── THE DRIVING SURFACE HAS TO BE «СВОБОДНО КАРАНЕ», AND THAT COST A RUN. ────
// The obvious deep link — `?scenario=sc-zebra-approach&level=1` — is a GRADED
// scenario, and holding the throttle on it drives straight through a pedestrian
// crossing: the run banks the penalty, the lesson ENDS, and the telemetry
// FREEZES at its last value. Three of this probe's own smoke runs read
// „13 km/h" for twenty-five consecutive samples and reported the brake broken,
// «Изглед» absent and four painted controls — on a product where all three are
// fine. `l0-free-drive` spawns ready-to-drive, has no objectives and no
// crossing, and is the only lesson that can carry a sweep this long
// (tools/mobile/wave3-drive.mjs learned the same thing the same way).
const DRIVE_LESSON_BG = arg("drive-lesson", "Свободно каране");
const LESSON_BG = "Подготовка и потегляне";
const TAG = arg("tag", "after");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave7-ledger`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const devices = resolveDevices(arg("device", null) ? arg("device", null).split(",") : undefined);

// A real GPU, or this scene runs at 0.4 fps and a 900 ms gesture falls between
// two frames — the same recipe tools/clips/headless uses.
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"];

const EMAIL = arg("email", null);
const PASSWORD = arg("password", null);
const user = EMAIL && PASSWORD ? { email: EMAIL, password: PASSWORD } : await ensureHarnessUser();

const browser = await chromium.launch({ args: GL_ARGS });
const { context: authContext } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
});
const authPage = await authContext.newPage();
await signIn(authPage, user, BASE);
const storageState = await authContext.storageState();
await authContext.close();

/** The ::before/::after-aware hit rect — the ruler lib/probe.mjs uses. */
const HIT_RECT_FN = `
  function hitRect(el) {
    const r = el.getBoundingClientRect();
    let hit = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    for (const pseudo of ["::before", "::after"]) {
      const ps = getComputedStyle(el, pseudo);
      if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
      if (ps.pointerEvents === "none") continue;
      const px = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? n : 0; };
      hit = {
        left: Math.min(hit.left, r.left + px(ps.left)),
        top: Math.min(hit.top, r.top + px(ps.top)),
        right: Math.max(hit.right, r.right - px(ps.right)),
        bottom: Math.max(hit.bottom, r.bottom - px(ps.bottom)),
      };
    }
    return { x: Math.round(hit.left), y: Math.round(hit.top),
             w: Math.round((hit.right - hit.left) * 10) / 10,
             h: Math.round((hit.bottom - hit.top) * 10) / 10 };
  }`;

const rows = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
    } catch {
      /* private mode */
    }
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, writable: true, value: () => [] });
    }
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  const rec = { device: device.id, label: device.label, inset: insetBanner(device, inset), tag: TAG };
  console.log(`\n${"=".repeat(94)}\n${device.label}\n  ${rec.inset}`);

  // ── the fingers. `touchPoints` on a touchEnd is THE SET BEING RELEASED —
  //    passing the remaining points releases the wrong finger, which is how a
  //    previous wave published a defect that did not exist.
  const active = new Map();
  const pt = (id, p) => ({ id, x: p.x, y: p.y, radiusX: 12, radiusY: 12, force: 1 });
  const all = () => [...active.entries()].map(([i, p]) => pt(i, p));
  const down = async (id, x, y) => {
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: all() });
  };
  const moveTo = async (id, x, y) => {
    if (!active.has(id)) return;
    active.set(id, { x, y });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: all() });
  };
  const up = async (id) => {
    const p = active.get(id);
    if (!p) return;
    active.delete(id);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [pt(id, p)] });
  };
  const tapAt = async (x, y, id = 9) => {
    await down(id, x, y);
    await sleep(100);
    await up(id);
    await sleep(450);
  };

  /**
   * A control's own centre, plus what is PAINTED there.
   *
   * THE LABEL AND THE TEXT ARE TESTED SEPARATELY, and that is not tidiness.
   * The first version concatenated them, so «Изглед» — whose `aria-label` is
   * „Изглед (камера) — сега: кабина" and whose text is „Изглед" — became
   * „Изглед (камера) … Изглед" and `^Изглед$` did not match. The probe reported
   * the camera button ABSENT on a surface where it is 60×44 px at 123,8. An
   * anchored pattern must be allowed to anchor to ONE of the two strings.
   *
   * AND THE DEFAULT SELECTOR IS `button`, WHICH IS THE SECOND HALF OF THE SAME
   * LESSON. With `[role]` in the net, `^Изглед` matched the RAIL TOOLBAR —
   * `role="toolbar"`, text „ИзгледПаузаКлаксонКолаКолан", `pointer-events:none`
   * — so the probe pressed the toolbar's centre, hit «Кола», opened the ⚙ sheet
   * and reported „«Изглед» did not fire". Same for the pause dialog, whose text
   * begins „ПаузаПродължи": the resume press landed on the dialog, the sim
   * never resumed, and §I1 was scored NO on a working product. A press is a
   * press on a BUTTON.
   */
  const centre = (re, selector = "button") =>
    page.evaluate(
      ({ re, selector }) => {
        const rx = new RegExp(re);
        for (const el of document.querySelectorAll(selector)) {
          const label = (el.getAttribute("aria-label") || "").trim();
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (!rx.test(label) && !rx.test(text)) continue;
          const q = el.getBoundingClientRect();
          if (q.width < 1 || q.height < 1) continue;
          const x = Math.round(q.x + q.width / 2);
          const y = Math.round(q.y + q.height / 2);
          const hit = document.elementFromPoint(x, y);
          return {
            x, y,
            w: Math.round(q.width), h: Math.round(q.height),
            label: (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 60),
            self: !!hit && (hit === el || el.contains(hit) || hit.contains(el)),
            onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label") ?? hit.tagName).slice(0, 50) : null,
          };
        }
        return null;
      },
      { re, selector },
    );

  const speedNow = () =>
    page.evaluate(() => {
      const el = document.querySelector('[aria-label^="Скорост "]');
      const m = el ? /Скорост\s+(-?\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
      return m ? Number(m[1].replace(",", ".")) : null;
    });
  /**
   * SAMPLE, DO NOT SNAPSHOT. `CABIN_POLL_MS` is 250 ms and this scene renders
   * in single digits under load, so one read taken 2.6 s after a press can
   * still be the value from before it. A braking claim decided by one sample
   * is a coin toss; the series shows the direction.
   */
  const speedSeries = async (ms, every = 400) => {
    const out = [];
    for (let t = 0; t < ms; t += every) {
      out.push(await speedNow());
      await sleep(every);
    }
    return out;
  };
  const gearNow = () =>
    page.evaluate(() => {
      const el = document.querySelector('[aria-label^="Скоростен лост:"]');
      return el ? (el.getAttribute("aria-label").split(":")[1] || "").trim() : null;
    });

  const gateOf = () =>
    page.evaluate(() => {
      const c = document.querySelector("canvas");
      const r = c?.getBoundingClientRect();
      return {
        url: location.pathname + location.search,
        hasCanvas: !!c,
        canvas: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        touchOverlay: !!document.querySelector('[data-hud="touch-controls"]'),
        compact: document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS A — THE DRIVING SURFACE (deep link, no pre-drive in the way)
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    if (page.url().includes("/login")) throw new Error("redirected to /login");
    await page.waitForSelector("article, [aria-label]", { timeout: 300_000 }).catch(() => {});
    rec.entered = await page.evaluate((titleBg) => {
      for (const el of document.querySelectorAll("[aria-label]")) {
        if (!(el.getAttribute("aria-label") || "").includes(titleBg)) continue;
        // «КАРАЙ СВОБОДНО» IS ITS OWN BUTTON TEXT, and leaving it out cost a
        // five-minute `waitForSelector` timeout: `LessonCard.tsx:88` labels the
        // free-drive entry «Карай свободно» and only the numbered lessons
        // «Започни урока» / «Карай отново».
        const b = [...el.querySelectorAll("button")].find((x) =>
          /Карай свободно|Започни урока|Карай отново|Продължи урока/.test((x.textContent || "").trim()),
        );
        if (b) { b.click(); return true; }
      }
      return false;
    }, DRIVE_LESSON_BG);
    await page.waitForSelector("canvas", { timeout: 300_000 });
    await sleep(8000);

    const gate = await gateOf();
    rec.gate = gate;
    const live = gate.hasCanvas && (gate.canvas?.w ?? 0) > 0 && (gate.canvas?.h ?? 0) > 0 && gate.touchOverlay;
    console.log(
      `  GATE · ${gate.url} · canvas=${gate.canvas ? `${gate.canvas.w}×${gate.canvas.h}` : "none"} · ` +
        `touchOverlay=${gate.touchOverlay} · compact=${gate.compact} · ${gate.vw}×${gate.vh}`,
    );
    if (!live) {
      rec.refused = "no live simulator on the page";
      rows.push(rec);
      await context.close();
      continue;
    }

    // ── FASTEN THE BELT, AND CLEAR THE CARD IT RAISES ───────────────────────
    //
    // THIS IS NOT TIDYING; WITHOUT IT EVERY ROW BELOW IS A PHOTOGRAPH OF A
    // PAUSED SIMULATOR. Driving off unbelted raises the teach moment
    // «Движение без предпазен колан», which sets `physicsPaused` → the touch
    // overlay goes inert and the speed readout freezes at whatever it held.
    // Three smoke runs reported „the brake does not brake" and „«Изглед» is
    // ABSENT" from exactly that state — on a product where both are fine. The
    // instructor was right and the probe was wrong. So: belt first, like a
    // student, and clear any card before each phase.
    const clearCards = async (tries = 3) => {
      for (let i = 0; i < tries; i += 1) {
        const c = (await centre("^Разбрах")) || (await centre("^Продължи$"));
        if (!c) return i;
        await tapAt(c.x, c.y, 9);
        await sleep(600);
      }
      return tries;
    };
    await clearCards();
    const belt = await centre("Закопчай предпазния колан");
    rec.beltButton = belt;
    if (belt) {
      await tapAt(belt.x, belt.y, 9);
      await sleep(900);
    }
    await clearCards();

    // ── pad geometry ────────────────────────────────────────────────────────
    const pads = await page.evaluate(() => {
      const box = (re) => {
        for (const el of document.querySelectorAll('[role="slider"]')) {
          if (!new RegExp(re).test(el.getAttribute("aria-label") || "")) continue;
          const q = el.getBoundingClientRect();
          return {
            x: Math.round(q.x), y: Math.round(q.y),
            w: Math.round(q.width), h: Math.round(q.height),
            cx: Math.round(q.x + q.width / 2), cy: Math.round(q.y + q.height / 2),
            pe: getComputedStyle(el).pointerEvents,
          };
        }
        return null;
      };
      return { drive: box("^Ход"), steer: box("^Волан") };
    });
    rec.pads = pads;

    // ── I25 · THE PAD IS ABSOLUTE, and the regression that guards it ────────
    // Three presses, each held long enough for the physics to answer, each read
    // from the HUD the student reads. Dead centre FIRST, because „the pad reads
    // 0 at dead centre" is the one that a relative pad would fail.
    if (pads.drive) {
      const d = pads.drive;
      const i25 = { padBox: d };
      await sleep(400);
      i25.speedBefore = await speedNow();

      // (1) DEAD CENTRE — hold 2.2 s. Must not command anything.
      await down(1, d.cx, d.cy);
      await sleep(400);
      await moveTo(1, d.cx, d.cy + 1); // a real thumb wobbles; the pad's middle is neutral
      await sleep(1800);
      i25.centreSpeed = await speedNow();
      await up(1);
      await sleep(700);

      // (2) UPPER HALF — a motionless press, no drag. His specification.
      const upY = Math.max(d.y + 6, d.cy - Math.min(60, Math.round(d.h / 2) - 8));
      await down(1, d.cx, upY);
      await sleep(2600);
      i25.upperSpeed = await speedNow();
      i25.gearWhileMoving = await gearNow();
      await up(1);
      await sleep(400);

      // (3) LOWER HALF while moving — must brake. Sampled, not snapshotted.
      const lowY = Math.min(d.y + d.h - 6, d.cy + Math.min(60, Math.round(d.h / 2) - 8));
      await down(1, d.cx, lowY);
      i25.brakeSeries = await speedSeries(6000);
      i25.lowerSpeedFromMoving = i25.brakeSeries[i25.brakeSeries.length - 1];

      // (4) THE REVERSE GUARD — d7ec746: „a correct stop no longer reverses the
      //     car into traffic". The thumb NEVER LEFT the low half; the car is now
      //     at rest under it. One continuous press must not become reverse.
      //
      //     AND THE TELLTALE IS THE GEAR, NOT THE PAD'S LABEL. The pad's own
      //     aria-label contains the word „назад" at ALL times, because it is
      //     TEACHING the reverse gesture („спряла кола: пусни и натисни пак
      //     надолу за назад"). A first version of this row matched that string
      //     and reported the guard broken on a car sitting in D.
      i25.restSeries = await speedSeries(4000);
      i25.gearAtRestUnderBrake = await gearNow();
      i25.speedAfterHoldingBrakeAtRest = i25.restSeries[i25.restSeries.length - 1];
      await up(1);
      await sleep(700);
      i25.gearAfterRelease = await gearNow();

      i25.centreIsNeutral = i25.centreSpeed !== null && Math.abs(i25.centreSpeed) < 0.6;
      i25.upIsForward = (i25.upperSpeed ?? 0) > 1;
      i25.downBrakes =
        i25.upperSpeed !== null && (i25.lowerSpeedFromMoving ?? 99) < (i25.upperSpeed ?? 0);
      // AND THE HONESTY STAMP. If a teach moment fired mid-gesture the
      // simulator paused, the readout froze, and every number above is the
      // value it happened to hold — which is exactly how three smoke runs
      // „measured" a brake that does not brake. A frozen readout must void the
      // row, not decorate it.
      i25.interruptedByACard = await page.evaluate(
        () => document.querySelector('[data-hud="touch-controls"]')?.getAttribute("data-sim-touch-inert") === "on",
      );
      i25.reverseGuardHolds =
        !i25.interruptedByACard &&
        i25.gearAtRestUnderBrake !== "R" && (i25.speedAfterHoldingBrakeAtRest ?? 99) >= -0.4 &&
        Math.abs(i25.speedAfterHoldingBrakeAtRest ?? 0) < 0.6;
      rec.i25 = i25;
      console.log(
        `  I25 · centre ${i25.centreSpeed} km/h (neutral=${i25.centreIsNeutral}) · up ${i25.upperSpeed} km/h ` +
          `(forward=${i25.upIsForward}) · brake [${(i25.brakeSeries || []).join(",")}] (brakes=${i25.downBrakes}) · ` +
          `card interrupted=${i25.interruptedByACard} · ` +
          `REVERSE GUARD ${i25.reverseGuardHolds} — at rest under the brake, gear=${i25.gearAtRestUnderBrake}, ` +
          `speed [${(i25.restSeries || []).join(",")}]`,
      );
    }

    await clearCards();

    // ── I2 · a button under a second finger ─────────────────────────────────
    // The steering thumb stays down; the other hand presses «Изглед». A single
    // `onClick` surface answers a mouse and ignores this.
    if (pads.steer) {
      const s = pads.steer;
      const i2 = {};
      // THE RECORDER GOES IN FIRST. A first version installed it, waited, and
      // only THEN pressed the second control — so the window had closed before
      // the two-finger touchstart happened and it reported „max touches 0" for
      // a genuinely two-fingered press. A witness that is not watching is not a
      // witness.
      await page.evaluate(() => {
        window.__w7max = 0;
        const on = (e) => { window.__w7max = Math.max(window.__w7max, e.touches.length); };
        window.addEventListener("touchstart", on, true);
        window.addEventListener("touchmove", on, true);
      });
      await down(4, s.cx, s.cy);
      await sleep(400);
      await moveTo(4, s.cx + 2, s.cy);
      const view = await centre("^Изглед");
      i2.viewButton = view;
      if (view) {
        await tapAt(view.x, view.y, 5);
        i2.viewMenuOpened = await page.evaluate(() => !!document.querySelector('[data-hud="view-menu"]'));
        if (i2.viewMenuOpened) await tapAt(view.x, view.y, 5); // close it again
      }
      i2.touchesSeen = await page.evaluate(() => window.__w7max ?? null);
      await up(4);
      await sleep(400);
      rec.i2 = i2;
      console.log(`  I2  · second finger down (max touches seen ${i2.touchesSeen}) · «Изглед» fired = ${i2.viewMenuOpened}`);
    }

    // ── I23 · «Изглед» is a labelled top-rail button that answers its centre ─
    rec.i23 = await centre("^Изглед");
    console.log(
      `  I23 · «Изглед» ${rec.i23 ? `${rec.i23.w}×${rec.i23.h} @${rec.i23.x},${rec.i23.y} self=${rec.i23.self} onTop=${rec.i23.onTop}` : "ABSENT"}`,
    );

    // ── I26c · is the quality preset reachable from the lesson menu? ────────
    //    …and, in the same visit, TURN THE MINIMAP ON, because §I10 is about a
    //    widget that is off by default: measuring „0 px² of overlap" against a
    //    0×0 minimap is the same class of false green this whole document is
    //    about. The row is only answerable with the map painted.
    const menuBtn = (await centre("Меню на урока")) || (await centre("^Меню$"));
    rec.i26c = { menuButton: menuBtn };
    if (menuBtn) {
      await tapAt(menuBtn.x, menuBtn.y, 6);
      await sleep(600);
      // ONLY THE MENU'S OWN ROWS. `PlayMenuRow` renders `role="menuitem"`;
      // a census of every button on the page swept the ⚙ sheet's cells in and
      // reported 29 „menu rows", which would have made this row unreadable.
      rec.i26c.rows = await page.evaluate(() =>
        [...document.querySelectorAll('[role="menuitem"]')].map((el) =>
          (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 46),
        ),
      );
      rec.i26c.hasQualityRow = (rec.i26c.rows || []).some((t) =>
        /Качеств|качеств|График|график|детайл|Детайл|FPS|кадр/i.test(t),
      );
      const map = await centre("^Карта", '[role="menuitem"]');
      if (map) {
        await tapAt(map.x, map.y, 6);
        rec.i26c.minimapToggled = true;
        await sleep(900);
      }
      // CLOSE IT, AND CHECK THAT IT CLOSED. The first version looked for
      // «Прекрати»/«Изход от урока» to decide whether the menu was still open —
      // rows this menu does not have. So it never closed, the 240×326 menu
      // panel stayed over the scene for the rest of the run, and the pause
      // card's «Продължи» was underneath it: §I1 scored NO three times because
      // of one wrong string. The menu's own rows are `role="menuitem"`.
      const menuOpen = () => page.evaluate(() => document.querySelectorAll('[role="menuitem"]').length > 0);
      for (let i = 0; i < 3 && (await menuOpen()); i += 1) {
        await tapAt(menuBtn.x, menuBtn.y, 6);
        await sleep(600);
      }
      rec.i26c.closedAfter = !(await menuOpen());
    }
    console.log(
      `  I26c· lesson menu rows = ${(rec.i26c.rows || []).length} · quality entry = ${rec.i26c.hasQualityRow ?? "menu not found"} · menu closed after = ${rec.i26c.closedAfter}` +
        (rec.i26c.rows ? `\n        ${rec.i26c.rows.join(" · ")}` : ""),
    );

    // ── I10 · the minimap against the thumb band ────────────────────────────
    rec.i10 = await page.evaluate(() => {
      const mini = document.querySelector('[data-hud="minimap-column"]');
      const root = document.querySelector('[data-hud="touch-controls"]');
      if (!mini || !root) return { minimap: !!mini, controls: !!root };
      const m = mini.getBoundingClientRect();
      // OVERLAP IS SUMMED PER CONTROL, NOT AGAINST THEIR UNION — and the first
      // version did the latter. The union of the left steering pad, the right
      // drive pad and the top rail is a rectangle covering most of the screen,
      // so ANY widget anywhere „overlaps the thumb band" by 64,515 px². That
      // number says nothing about whether a thumb is obstructed. What matters
      // is whether the minimap lies on a CONTROL.
      let overlap = 0;
      let band = null;
      const controls = [];
      for (const el of root.querySelectorAll("*")) {
        if (getComputedStyle(el).pointerEvents !== "auto") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        controls.push(el);
        overlap +=
          Math.max(0, Math.min(m.right, r.right) - Math.max(m.left, r.left)) *
          Math.max(0, Math.min(m.bottom, r.bottom) - Math.max(m.top, r.top));
        band = band
          ? { left: Math.min(band.left, r.left), top: Math.min(band.top, r.top),
              right: Math.max(band.right, r.right), bottom: Math.max(band.bottom, r.bottom) }
          : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      }
      // …and the honest question: does a thumb pressed at a CONTROL's centre
      // get the control, or the minimap?
      const stolen = [];
      for (const el of root.querySelectorAll("*")) {
        if (getComputedStyle(el).pointerEvents !== "auto") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
        const hit = document.elementFromPoint(x, y);
        if (hit && mini.contains(hit)) stolen.push(el.getAttribute("aria-label") || el.tagName);
      }
      return {
        minimapRect: { x: Math.round(m.x), y: Math.round(m.y), w: Math.round(m.width), h: Math.round(m.height) },
        bandRect: band && { x: Math.round(band.left), y: Math.round(band.top),
                            w: Math.round(band.right - band.left), h: Math.round(band.bottom - band.top) },
        overlapPx2: Math.round(overlap),
        controlsStolenByMinimap: stolen,
        minimapBottomCss: getComputedStyle(mini).bottom,
      };
    });
    console.log(
      `  I10 · minimap ${rec.i10.minimapRect ? `${rec.i10.minimapRect.w}×${rec.i10.minimapRect.h} @${rec.i10.minimapRect.x},${rec.i10.minimapRect.y} bottom=${rec.i10.minimapBottomCss}` : "ABSENT"} · ` +
        `overlap ${rec.i10.overlapPx2 ?? "-"} px² · controls it steals: ${(rec.i10.controlsStolenByMinimap || []).length}`,
    );

    // ── REG · nothing under 44 px, on the surface he drives ────────────────
    rec.hitRects = await page.evaluate(`(() => {
      ${HIT_RECT_FN}
      const out = [];
      const seen = new Set();
      for (const el of document.querySelectorAll('button,[role="button"],[role="menuitem"],a[href]')) {
        const cs = getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
        // SR-ONLY IS NOT A HIT RECT. The skip link („Към съдържанието") is a
        // 1×1 clipped box by design — WCAG's own recipe — and counting it as a
        // sub-44 px control is a false positive that hides the real ones.
        if (cs.clipPath === "inset(50%)" || cs.clip === "rect(0px, 0px, 0px, 0px)") continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
        const h = hitRect(el);
        const name = (el.getAttribute("aria-label") || el.textContent || "").replace(/\\s+/g," ").trim().slice(0, 38);
        const key = name + h.x + "," + h.y;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ name, w: h.w, h: h.h });
      }
      return out;
    })()`);
    rec.under44 = rec.hitRects.filter((r) => r.w < 44 || r.h < 44);
    console.log(`  REG · ${rec.hitRects.length} controls painted · under 44 px: ${rec.under44.length}` +
      (rec.under44.length ? ` → ${rec.under44.map((r) => `${r.name} ${r.w}×${r.h}`).join(" | ")}` : ""));

    // ═══ THE PAUSE BLOCK — I3 · I1 · I20, AND IT RUNS LAST ON PURPOSE ══════
    //
    // A first version put this in the middle, and the resume press missed. Every
    // row after it then measured a PAUSED simulator: the speed readout froze at
    // 13 km/h for fifteen consecutive samples, the top rail was not painted, and
    // the probe reported «Изглед» ABSENT and the brake „not braking" on a
    // product where both work. A frozen number is the most convincing kind of
    // wrong number, so this block now (a) runs after everything else and
    // (b) refuses to claim I1 unless it can show the sim RESUMED.
    const pauseBtn2 = await centre("^Пауза$");
    if (pauseBtn2 && pads.drive) {
      const d = pads.drive;
      const upY = Math.max(d.y + 6, d.cy - Math.min(60, Math.round(d.h / 2) - 8));
      const i13 = {};

      // his session: the thumb is ON the pedal when the card arrives.
      await down(2, d.cx, upY);
      await sleep(2200);
      i13.speedWithThumbDown = await speedNow();

      // the SECOND finger presses «Пауза» while the first stays on the pedal —
      // §I2's question asked on the control that matters most.
      await tapAt(pauseBtn2.x, pauseBtn2.y, 8);
      await sleep(900);
      i13.inert = await page.evaluate(() => {
        const root = document.querySelector('[data-hud="touch-controls"]');
        const pad = document.querySelector('[role="slider"][aria-label^="Ход"]');
        return {
          nodeStillInDom: !!root,
          inertFlag: root?.getAttribute("data-sim-touch-inert") ?? null,
          ariaHidden: root?.getAttribute("aria-hidden") ?? null,
          opacity: root ? getComputedStyle(root).opacity : null,
          padPointerEvents: pad ? getComputedStyle(pad).pointerEvents : null,
          padStillInDom: !!pad,
        };
      });
      i13.i3Holds =
        i13.inert.nodeStillInDom === true &&
        i13.inert.inertFlag === "on" &&
        i13.inert.padPointerEvents === "none" &&
        i13.inert.padStillInDom === true;
      console.log(
        `  I3  · node kept=${i13.inert.nodeStillInDom} inert=${i13.inert.inertFlag} ` +
          `pad pointer-events=${i13.inert.padPointerEvents} opacity=${i13.inert.opacity} → ${i13.i3Holds}`,
      );

      // PROVE THE PAUSE OPENED. It did not, once: the transmission hint card
      // «Скоростният лост е на N» was standing ON «Пауза» (that is doc 91 §O.3
      // N4, measured here by accident), the press went into the card, and the
      // census then described a LIVE canvas while the field said `pauseUp`.
      i13.pauseDialogOpen = await page.evaluate(
        () => !!document.querySelector('[role="dialog"][aria-label="Пауза"]'),
      );
      i13.pauseButtonOnTop = pauseBtn2.onTop;

      rec.i20 = await page.evaluate((pauseUp) => {
        const canvas = document.querySelector("canvas")?.getBoundingClientRect();
        const hits = [];
        let px2 = 0;
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          const bf = cs.backdropFilter || cs.webkitBackdropFilter || "none";
          if (!bf || bf === "none") continue;
          const r = el.getBoundingClientRect();
          if (r.width < 8 || r.height < 8) continue;
          const over = canvas
            ? Math.max(0, Math.min(r.right, canvas.right) - Math.max(r.left, canvas.left)) *
              Math.max(0, Math.min(r.bottom, canvas.bottom) - Math.max(r.top, canvas.top))
            : 0;
          if (over <= 0) continue;
          px2 += over;
          hits.push({
            filter: bf,
            box: `${Math.round(r.width)}×${Math.round(r.height)}`,
            what: el.getAttribute("data-hud") || el.getAttribute("aria-label") || el.className?.toString?.().slice(0, 40) || el.tagName,
            overCanvasPx2: Math.round(over),
          });
        }
        return { pauseUp, blurElements: hits.length, blurOverCanvasPx2: Math.round(px2), hits: hits.slice(0, 6) };
      }, i13.pauseDialogOpen);
      await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}-pause.png` }).catch(() => {});
      console.log(
        `  I20 · pause dialog open=${i13.pauseDialogOpen} (button onTop=${i13.pauseButtonOnTop}) · ` +
          `${rec.i20.blurElements} element(s) blurring the canvas, ${rec.i20.blurOverCanvasPx2} px²` +
          (rec.i20.hits.length ? ` → ${rec.i20.hits.map((h) => `${h.what} ${h.box}`).join(" | ")}` : ""),
      );

      // ── and back. THE THUMB HAS NOT LEFT THE PAD SINCE BEFORE THE CARD. ───
      i13.speedUnderCard = await speedNow();
      // THE PAUSE CARD'S OWN BUTTON, addressed through the dialog. „Продължи"
      // on its own matched other buttons on the page and the sim never resumed
      // — which scored §I1 NO twice on a working product.
      const back =
        (await centre("^Продължи$", '[role="dialog"][aria-label="Пауза"] button')) ||
        (await centre("^Продължи$")) ||
        (await centre("^Пауза$"));
      i13.resumeButton = back;
      if (back) await tapAt(back.x, back.y, 8);
      await sleep(1200);

      // PROVE THE SIM RESUMED BEFORE BELIEVING ANY NUMBER FROM IT. The pad is
      // live again exactly when `data-sim-touch-inert` is gone.
      i13.resumed = await page.evaluate(() => {
        const root = document.querySelector('[data-hud="touch-controls"]');
        const pad = document.querySelector('[role="slider"][aria-label^="Ход"]');
        return (
          !!root &&
          root.getAttribute("data-sim-touch-inert") === null &&
          !!pad &&
          getComputedStyle(pad).pointerEvents === "auto"
        );
      });

      // ── AND IF IT DID NOT RESUME, ASK WHY, DO NOT JUST SCORE IT ──────────
      // Measured: with the pedal thumb still down, «Продължи» on the pause card
      // does nothing. Lift that finger and the same press works. That is §I2's
      // defect — a button that only answers `onClick` — on a control the §I2
      // fix never reached, so it is worth separating from §I1 rather than
      // charging §I1 for it.
      i13.resumeNeededTheThumbLifted = false;
      if (i13.resumed === false) {
        await up(2);
        await sleep(400);
        const again =
          (await centre("^Продължи$", '[role="dialog"][aria-label="Пауза"] button')) ||
          (await centre("^Продължи$"));
        if (again) await tapAt(again.x, again.y, 8);
        await sleep(1200);
        const nowResumed = await page.evaluate(
          () => document.querySelector('[data-hud="touch-controls"]')?.getAttribute("data-sim-touch-inert") === null,
        );
        i13.resumeNeededTheThumbLifted = nowResumed === true;
        i13.resumed = nowResumed;
        // put the thumb back on the pedal so §I1's own question can still be
        // asked — it is „does the pad re-arm", and it deserves a fair press.
        if (nowResumed) {
          await down(2, d.cx, upY);
          await sleep(600);
        }
      }

      // §I1's own caveat: recovery is driven by the next pointer event, and a
      // real thumb wobbles ±3 px. One pixel is all we give it.
      await moveTo(2, d.cx, upY - 2);
      i13.recoverySeries = await speedSeries(5000);
      i13.speedAfterCardWithThumbNeverLifted = i13.recoverySeries[i13.recoverySeries.length - 1];
      await up(2);
      await sleep(500);

      i13.i1Holds =
        i13.resumed === true &&
        (i13.speedAfterCardWithThumbNeverLifted ?? 0) > 1 &&
        // …and it has to be MOVING, not frozen at the number it had when the
        // card arrived. A constant series is the failure that fooled the first
        // version of this probe.
        new Set(i13.recoverySeries).size > 1;
      rec.i3i1 = i13;
      console.log(
        `  I1  · thumb down ${i13.speedWithThumbDown} km/h → under the card ${i13.speedUnderCard} → resumed=${i13.resumed}` +
          (i13.resumeNeededTheThumbLifted ? ` (ONLY AFTER LIFTING THE PEDAL THUMB — «Продължи» is onClick-only)` : "") +
          ` → [${i13.recoverySeries.join(",")}] → ${i13.i1Holds}`,
      );
    }

    // §I24 RUNS LAST, AND THAT IS A CORRECTNESS FIX, NOT A REORDER.
    // Reaching «СЪЕД» means cycling the tier to «Напреднал», which is a MANUAL
    // gearbox: the car then sits at 0 km/h until a clutch and a gear are chosen,
    // so every speed-based row measured after it reads zero and scores NO. It
    // also raises the «Скоростният лост е на N» card, which is the thing that
    // buries the rail. Both were happening to §I1 and §I3.
    // ── I24 · «СЪЕД» in the ⚙ sheet, and whether the gear cell is buried ────
    //    «СЪЕД» ONLY EXISTS IN «НАПРЕДНАЛ». The default tier is automatic and
    //    has no clutch to show, so a probe that opens the sheet and looks for
    //    «СЪЕД» reports it ABSENT on a product that ships it — which is what the
    //    first three runs of this file did.
    // AND CLEAR THE CARD FIRST. §I1's own recovery test ends with the car at
    // 46–54 km/h in a 50 zone, which raises «Несъобразена скорост в завой» —
    // physics pauses, the overlay goes inert, and the ⚙ button is unreachable.
    // Two ladder rows reported «СЪЕД» ABSENT for that reason alone.
    await clearCards(4);
    const sheetOpenNow = () =>
      page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
    const gearBtn = await centre("Контроли на автомобила");
    rec.i24 = { sheetButton: gearBtn };
    if (gearBtn) {
      if (!(await sheetOpenNow())) await tapAt(gearBtn.x, gearBtn.y, 6);
      await sleep(800);
      rec.i24.sheetOpen = await sheetOpenNow();
      // CYCLE THE TIER CELL TO «НАПРЕДНАЛ». A first version pressed «РЪЧНА»,
      // which is the HANDBRAKE, not the manual gearbox — the car then sat at
      // 0 km/h for the rest of the run and §I1 was scored NO because of it.
      // The tier lives on `tierCellLabelBg` (TouchControls.tsx:957) and it is a
      // RING: «Начинаещ» → «Нормален» → «Напреднал».
      rec.i24.tierSteps = [];
      for (let i = 0; i < 3; i += 1) {
        const tier = await centre("^Ниво на помощта");
        if (!tier) break;
        rec.i24.tierSteps.push(tier.label);
        if (/Ниво на помощта: Напреднал/.test(tier.label)) break;
        await tapAt(tier.x, tier.y, 6);
        await sleep(900);
        if (!(await sheetOpenNow())) {
          await tapAt(gearBtn.x, gearBtn.y, 6);
          await sleep(700);
        }
      }
      rec.i24.tierNow = (await centre("^Ниво на помощта"))?.label ?? null;
      rec.i24.clutch = await centre("^Съединител|^СЪЕД$");
      rec.i24.gearCell = await centre("Скоростен лост|^M►$|^◄P$|^D►$");
      const close = await centre("Затвори контролите");
      if (close) await tapAt(close.x, close.y, 6);
      await sleep(600);
      rec.i24.sheetClosedAfter = !(await sheetOpenNow());

      // ── N4 · THE CARD THAT TEACHES «M►» STANDS ON THE RAIL ────────────────
      // §O.3 N4 has no §I row, and this run keeps reproducing it by accident:
      // choosing «Напреднал» raises «Скоростният лост е на N», and with it up,
      // `elementFromPoint` at a rail button's own centre answers the CARD.
      // Measured here on purpose instead of stumbled over.
      rec.n4 = await page.evaluate(() => {
        const rail = document.querySelector('[data-hud="top-rail"]');
        if (!rail) return { rail: false };
        const buried = [];
        const live = [];
        for (const el of rail.querySelectorAll("button")) {
          const q = el.getBoundingClientRect();
          if (q.width < 4) continue;
          const x = Math.round(q.x + q.width / 2), y = Math.round(q.y + q.height / 2);
          const hit = document.elementFromPoint(x, y);
          const mine = !!hit && (hit === el || el.contains(hit));
          const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 34);
          (mine ? live : buried).push(
            mine ? name : `${name} ← ${(hit?.closest("[aria-label],[role]")?.getAttribute("aria-label") || hit?.tagName || "?").slice(0, 30)}`,
          );
        }
        return { rail: true, buried, live, cardUp: !!document.querySelector('[role="alertdialog"], [role="status"]') };
      });
      console.log(
        `  N4  · with «Напреднал» chosen: ${rec.n4.live?.length ?? "-"} rail controls answer their own centre, ` +
          `${rec.n4.buried?.length ?? "-"} are BURIED${rec.n4.buried?.length ? ` → ${rec.n4.buried.join(" | ")}` : ""}`,
      );
    }
    console.log(
      `  I24 · sheet=${rec.i24.sheetOpen} · tier=${rec.i24.tierNow} · «СЪЕД» ${rec.i24.clutch ? `${rec.i24.clutch.w}×${rec.i24.clutch.h} self=${rec.i24.clutch.self} onTop=${rec.i24.clutch.onTop}` : "ABSENT"} · ` +
        `gear cell ${rec.i24.gearCell ? `[${rec.i24.gearCell.label}] self=${rec.i24.gearCell.self} onTop=${rec.i24.gearCell.onTop}` : "ABSENT"} · closed after=${rec.i24.sheetClosedAfter}`,
    );

    await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}-drive.png` }).catch(() => {});
  } catch (error) {
    rec.driveError = String(error?.message || error).split("\n")[0];
    console.log(`  ✖ DRIVE PASS FAILED · ${rec.driveError}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PASS B — HIS SESSION: the pre-drive, with a thumb on the pedal throughout
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 300_000 });
    await page.waitForSelector("article, [aria-label]", { timeout: 240_000 }).catch(() => {});
    const started = await page.evaluate((titleBg) => {
      for (const el of document.querySelectorAll("[aria-label]")) {
        if (!(el.getAttribute("aria-label") || "").includes(titleBg)) continue;
        const b = [...el.querySelectorAll("button")].find((x) =>
          /Започни урока|Карай отново/.test((x.textContent || "").trim()),
        );
        if (b) { b.click(); return true; }
      }
      return false;
    }, LESSON_BG);
    await page.waitForSelector("canvas", { timeout: 300_000 });
    await sleep(6500);
    const gateB = await gateOf();
    rec.predrive = { started, gate: gateB };
    if (!(gateB.hasCanvas && (gateB.canvas?.w ?? 0) > 0 && gateB.touchOverlay)) {
      rec.predrive.refused = "no live simulator";
    } else {
      // The card the founder called ultra-hard, measured as it stands.
      rec.predrive.card = await page.evaluate(() => {
        const body = document.querySelector("[data-sim-overlay-body]");
        const r = body?.getBoundingClientRect();
        // ✕ MUST BE LOOKED FOR INSIDE THE PRE-DRIVE CARD, NOT ON THE PAGE.
        // A first version accepted any ✕ inside any `[data-hud]`, and the
        // driving surface carries «Скрий съвета» and «Скрий инструкциите» —
        // both of which are a bare ✕. It therefore reported the pre-drive line
        // as dismissable (§I5a OPEN) on all six profiles, on a build where the
        // pre-drive item carries `noDismiss` and the advisor's ✕ is a
        // different control that is SUPPOSED to be there.
        const card = body ? body.closest("[data-sim-overlay], [role='alertdialog'], [role='status']") : null;
        const xInCard = card
          ? [...card.querySelectorAll("button")].filter((b) => /^(✕|×)$/.test((b.textContent || "").trim()))
          : [];
        const xOnPage = [...document.querySelectorAll("button")].filter((b) =>
          /^(✕|×)$/.test((b.textContent || "").trim()),
        );
        return {
          bodyPresent: !!body,
          bodyRect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
          bodyText: (body?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
          dismissXPresent: xInCard.length > 0,
          xElsewhereOnPage: xOnPage.map((b) => (b.getAttribute("aria-label") || "?").slice(0, 30)),
          autoModal: !!document.querySelector('[role="dialog"] [data-sim-tutorial], [data-sim-tutorial]'),
        };
      });
      // …and the regression: a thumb that was on the pedal before the card and
      // is still there after it.
      const padB = await page.evaluate(() => {
        const el = document.querySelector('[role="slider"][aria-label^="Ход"]');
        if (!el) return null;
        const q = el.getBoundingClientRect();
        return { cx: Math.round(q.x + q.width / 2), cy: Math.round(q.y + q.height / 2),
                 y: Math.round(q.y), h: Math.round(q.height) };
      });
      if (padB) {
        const upY = Math.max(padB.y + 6, padB.cy - Math.min(60, Math.round(padB.h / 2) - 8));
        await down(2, padB.cx, upY);
        await sleep(1500);
        rec.predrive.speedUnderPreDriveCard = await speedNow();
        // dismiss/complete the way a student does — press whatever confirms
        for (const re of ["Разбрах", "Потвърди", "Продължи"]) {
          const c = await centre(re);
          if (c) { await tapAt(c.x, c.y, 7); break; }
        }
        await sleep(800);
        await moveTo(2, padB.cx, upY - 2);
        await sleep(2600);
        rec.predrive.speedAfterCardThumbNeverLifted = await speedNow();
        await up(2);
      }
      await page.screenshot({ path: `${OUT}/shots/${TAG}-${device.id}-predrive.png` }).catch(() => {});
    }
    console.log(
      `  PRE · started=${started} · body=${rec.predrive.card?.bodyPresent} ${rec.predrive.card?.bodyRect ? `${rec.predrive.card.bodyRect.w}×${rec.predrive.card.bodyRect.h}` : ""} · ` +
        `✕ IN THE CARD=${rec.predrive.card?.dismissXPresent} (elsewhere on the page: ${(rec.predrive.card?.xElsewhereOnPage || []).join(", ") || "none"}) · ` +
        `pedal during the pre-drive ${rec.predrive.speedUnderPreDriveCard} → ${rec.predrive.speedAfterCardThumbNeverLifted} km/h (the car is LOCKED until the checklist is done — see wave7-predrive.mjs)`,
    );
  } catch (error) {
    rec.predriveError = String(error?.message || error).split("\n")[0];
    console.log(`  ✖ PRE-DRIVE PASS FAILED · ${rec.predriveError}`);
  }

  rows.push(rec);
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify({ base: BASE, tag: TAG, rows }, null, 2));
console.log(`\n${"=".repeat(94)}\nwrote ${OUT}/${TAG}.json`);

// ── the table ────────────────────────────────────────────────────────────────
const yn = (v) => (v === true ? "YES" : v === false ? "NO" : "—");
console.log(
  ["device", "I25 abs", "REV grd", "I3 inert", "I1 back", "I2 2nd", "I23", "I10 px²", "I24", "I26c", "<44"].join(" | "),
);
for (const r of rows) {
  console.log(
    [
      r.device.padEnd(26),
      yn(r.i25?.centreIsNeutral && r.i25?.upIsForward && r.i25?.downBrakes),
      yn(r.i25?.reverseGuardHolds),
      yn(r.i3i1?.i3Holds),
      yn(r.i3i1?.i1Holds),
      yn(r.i2?.viewMenuOpened),
      yn(!!r.i23?.self),
      String(r.i10?.overlapPx2 ?? "—"),
      yn(!!r.i24?.clutch),
      yn(r.i26c?.hasQualityRow),
      String(r.under44?.length ?? "—"),
    ].join(" | "),
  );
}
