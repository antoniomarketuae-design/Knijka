// =============================================================================
// parity-e.mjs — RE-DERIVE DOC 91 §E FROM THE RUNNING PRODUCT.
//
// §E is a table of judgements ("practically usable") that was written by
// reading code in a state the code is no longer in: rows 21–23 say the camera
// is "2 taps deep, unreachable while driving" and that G and N have NO mobile
// equivalent, and all three have been a one-tap top-rail button since
// 2026-08-12. A stale gap table costs more than no table: it prices work that
// is already done and hides work that is not.
//
// So this file does not read the code. It DRIVES the product, on a PRODUCTION
// build, on the real authenticated /simulator, across all six profiles, and
// answers four questions per control with a measurement rather than a reading:
//
//   EXISTS   is the control in the DOM on the driving screen (at some depth)?
//   WORKS    does a real touch change the state it claims to change?
//   REACH    how many taps from the driving screen — 0 (always on), 1, 2?
//            …and is its own centre occluded by something else (elementFromPoint)?
//   LIVE     *** DOES IT STILL FIRE WITH A SECOND FINGER PLANTED ON THE GLASS ***
//            Two explicit CDP touchPoints. Playwright's `mouse`, `.click()` and
//            `touchscreen.tap` are ALL single-point: a `.click()` silently
//            releases the first finger, which looks exactly like the C2 defect
//            and is not one. That mistake is the reason wave 1 published
//            "every button fires with a second thumb planted" and wave 3 found
//            one that does not.
//
// THE RIG PROVES ITSELF BEFORE IT JUDGES ANYTHING. A page-side listener counts
// `e.touches.length` on every touch event; if the run never observes a moment
// with TWO simultaneous touch points, every LIVE column is refused rather than
// printed green. A single-point rig that reports "all live" is the exact
// failure mode this file exists to avoid.
//
//   node tools/mobile/parity-e.mjs --base http://localhost:3481 \
//        --email <harness account> --password <password>
//   --device iphone16-portrait   one profile instead of all six
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner, assertInsetsApplied } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3481");
const EMAIL = arg("email", process.env.KNIJKA_MOBILE_EMAIL || "");
const PASSWORD = arg("password", process.env.KNIJKA_MOBILE_PASSWORD || "");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/parity-e`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);
const MIN = 44;

if (!EMAIL || !PASSWORD) {
  console.error("[parity-e] --email and --password are required (/simulator is gated).");
  process.exit(2);
}

// ── page-side helpers, injected as strings ──────────────────────────────────

/** Every control this overlay owns, with its rect, its 44 px verdict and the
 *  element that actually answers a finger at its own centre. */
function enumerateBody() {
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const shown = (el) => {
    let n = el;
    while (n) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (Number.parseFloat(s.opacity) <= 0.01) return false;
      n = n.parentElement;
    }
    return true;
  };
  const name = (el) =>
    (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70);
  const out = [];
  for (const el of document.querySelectorAll('button, [role="menuitem"], [role="option"], a[href]')) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    if (r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) continue;
    const cx = Math.round(r.left + r.width / 2);
    const cy = Math.round(r.top + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const self = hit !== null && (hit === el || el.contains(hit));
    out.push({
      label: name(el),
      x: Math.round(r.left),
      y: Math.round(r.top),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx,
      cy,
      under44: r.width < 43.5 || r.height < 43.5,
      offscreen: r.left < -0.5 || r.top < -0.5 || r.right > vw + 0.5 || r.bottom > vh + 0.5,
      self,
      blockedBy: self ? null : name(hit ?? document.body) || (hit ? hit.tagName : "nothing"),
      pressed: el.getAttribute("aria-pressed"),
      inTouchOverlay: !!el.closest('[data-hud="touch-controls"]'),
      inRail: !!el.closest('[data-hud="top-rail"]'),
      inViewMenu: !!el.closest('[data-hud="view-menu"]'),
      inSheet: !!el.closest('[role="toolbar"][aria-label="Контроли на автомобила"]'),
      inCard: !!el.closest('[data-sim-overlay], [role="dialog"], [role="alertdialog"], [data-hud="sim-overlay"]'),
    });
  }
  return { vw, vh, controls: out };
}

/** Install the touch-truth recorder. Nothing here changes app behaviour: the
 *  listeners are passive and on the capture phase of `window`. */
function installTouchTruth() {
  const w = window;
  w.__parityTouch = { max: 0, events: [], pointers: 0, maxPointers: 0 };
  const push = (t, e) => {
    const n = e.touches ? e.touches.length : 0;
    if (n > w.__parityTouch.max) w.__parityTouch.max = n;
    if (w.__parityTouch.events.length < 400) w.__parityTouch.events.push(`${t}:${n}`);
  };
  for (const t of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
    window.addEventListener(t, (e) => push(t, e), { capture: true, passive: true });
  }
  const live = new Set();
  window.addEventListener("pointerdown", (e) => {
    live.add(e.pointerId);
    w.__parityTouch.pointers = live.size;
    if (live.size > w.__parityTouch.maxPointers) w.__parityTouch.maxPointers = live.size;
  }, { capture: true, passive: true });
  for (const t of ["pointerup", "pointercancel"]) {
    window.addEventListener(t, (e) => { live.delete(e.pointerId); w.__parityTouch.pointers = live.size; }, { capture: true, passive: true });
  }
}

// ── CDP two-finger primitives ───────────────────────────────────────────────
// Chromium diffs the point list against the previous dispatch. Adding a finger
// is a `touchStart` listing EVERY active point; lifting one is a `touchEnd`
// listing the point(s) that went away. Both shapes are asserted by the
// touch-truth recorder before any verdict is drawn from them.

async function fingerDown(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })),
  });
}
async function fingerMove(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id, radiusX: 12, radiusY: 12, force: 1 })),
  });
}
async function fingerUp(cdp, pts) {
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: pts.map((p) => ({ x: p.x, y: p.y, id: p.id })),
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── main ────────────────────────────────────────────────────────────────────

const browser = await chromium.launch();

// Sign in ONCE and reuse the cookie jar — six sign-ins on this box is minutes.
console.log("[parity-e] signing in once for the whole sweep…");
// Every MEASURING context below goes through newDeviceContext with
// insets:"real"; the storageState harvested here is handed to them.
// insets-exempt: sign-in only — this context types a password into /login and
// is closed the moment the cookie exists. The simulator is never laid out in it.
const authCtx = await browser.newContext();
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log("[parity-e] signed in.");

const all = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  await context.addInitScript(() => {
    try {
      window.localStorage.setItem("sim.touchHintSeen", "1");
      // TIER LOW, EXPLICITLY. Not to flatter a number — nothing here is timed —
      // but because this box renders through SwiftShader at ~2 fps and the
      // overlay's own cabin readout is a 250 ms `setInterval`. On a starved main
      // thread that poll lags seconds behind the control it is reporting, and a
      // late readout is indistinguishable from a dead button. Low is also the
      // tier a cheap phone actually gets (quality.ts seed rule).
      window.localStorage.setItem("aidrive.sim.quality.v1", JSON.stringify({ setting: "low" }));
    } catch { /* private mode */ }
  });
  await context.addInitScript(installTouchTruth);
  const page = await context.newPage();
  const rec = { device: device.id, label: device.label, viewport: `${device.width}x${device.height}`, rows: {}, live: {} };
  console.log(`\n${"=".repeat(96)}\n${device.label} — ${device.width}x${device.height} dpr${device.dpr} · CHROMIUM · PRODUCTION · /simulator`);
  console.log(insetBanner(device, inset));

  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    const freeDrive = page.getByRole("button", { name: /Карай свободно/ }).first();
    await freeDrive.waitFor({ state: "visible", timeout: 180_000 });
    await freeDrive.click();
    await page.waitForSelector("canvas", { timeout: 180_000 });
    await page.waitForTimeout(8000); // §G5: the first six seconds are a stall.

    const applied = await assertInsetsApplied(page, inset);
    console.log(`inset: rewrote ${applied.agent.declarations}+${applied.agent.inlineDeclarations} decls · body l${applied.body.left} r${applied.body.right} b${applied.body.bottom}`);

    // Harness honesty: renderer + a frame count over one second.
    const rig = await page.evaluate(async () => {
      const c = document.querySelector("canvas");
      const gl = c && (c.getContext("webgl2") || c.getContext("webgl"));
      const dbg = gl && gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "unknown";
      let n = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const tick = () => { n += 1; if (performance.now() - t0 > 1000) res(); else requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      return { renderer: String(renderer), fps: Math.round((n * 1000) / (performance.now() - t0)),
               coarse: matchMedia("(any-pointer: coarse)").matches, maxTouchPoints: navigator.maxTouchPoints,
               compact: document.querySelector("[data-sim-compact]") !== null };
    });
    rec.rig = rig;
    console.log(`  HARNESS: ${rig.renderer} · ${rig.fps} fps · any-pointer:coarse=${rig.coarse} · maxTouchPoints=${rig.maxTouchPoints} · compact HUD=${rig.compact}`);
    if (!rig.compact) {
      console.log("  *** COMPACT HUD IS NOT ON — this is not the phone layout. REFUSED. ***");
      rec.refused = "compact HUD absent";
      all.push(rec); await context.close(); continue;
    }

    // Clear whatever card is speaking, then fasten the belt from the rail.
    for (let i = 0; i < 6; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи|Затвори)$/.test(t)) { b.click(); return t; }
        }
        return null;
      });
      if (!hit) break;
      await page.waitForTimeout(500);
    }
    // ── THE TEACH CARD, MEASURED BEFORE IT IS DISMISSED ─────────────────────
    // Row 39 («РАЗБРАХ») is the audit's "session-killer" and it can only be
    // measured while a card is actually speaking. Driving with the belt undone
    // raises «Движение без предпазен колан» within seconds, every time, on
    // every profile — the most reproducible card the product has.
    rec.card = await page.evaluate(() => {
      const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const out = [];
      for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent || "").replace(/\s+/g, " ").trim();
        const l = (b.getAttribute("aria-label") || "").trim();
        if (!/^(Разбрах|Защо|ЗАЩО|РАЗБРАХ|✕|×)$/i.test(t) && !/Скрий известието|Затвори/.test(l)) continue;
        if (!shown(b)) continue;
        const r = b.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        out.push({ text: t, label: l, w: Math.round(r.width), h: Math.round(r.height), cx, cy,
                   self: hit !== null && (hit === b || b.contains(hit)),
                   blocker: hit ? String(hit.getAttribute("aria-label") || hit.className || hit.tagName).slice(0, 36) : "nothing" });
      }
      return { present: out.length > 0, chips: out };
    });
    if (rec.card.present) {
      console.log(`\n  A TEACH CARD IS SPEAKING — its chips: ${rec.card.chips.map((c) => `«${c.text || c.label}» ${c.w}x${c.h}${c.self ? "" : ` BLOCKED by ${c.blocker}`}`).join(" · ")}`);
    }

    const beltBtn = await page.$('[aria-label="Закопчай предпазния колан"]');
    if (beltBtn) { await beltBtn.click(); await page.waitForTimeout(500); }

    const lessonOver = () => page.evaluate(() =>
      /Неиздържан|Издържан|Виж разбора/.test(document.body.innerText || ""));
    if (await lessonOver()) { rec.refused = "lesson ended before measurement"; all.push(rec); await context.close(); continue; }

    // ── DEPTH 0 — what is on the driving screen with nothing open ────────────
    rec.depth0 = await page.evaluate(enumerateBody);
    console.log(`\n  DEPTH 0 — always on screen (${rec.depth0.controls.length} controls):`);
    for (const c of rec.depth0.controls) {
      console.log(`    ${c.self ? " " : "!"} ${c.label.padEnd(46)} ${String(c.w).padStart(3)}x${String(c.h).padStart(3)} @${String(c.x).padStart(4)},${String(c.y).padStart(4)}${c.under44 ? "  UNDER-44" : ""}${c.self ? "" : `  BLOCKED BY «${c.blockedBy}»`}`);
    }

    // ── DEPTH 1 — one tap: the «Кола» sheet ─────────────────────────────────
    const tapByLabel = async (label) => {
      const el = await page.$(`[aria-label="${label}"]`);
      if (!el) return false;
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(450);
      return true;
    };
    await tapByLabel("Контроли на автомобила");
    if (!(await page.$('[role="toolbar"][aria-label="Контроли на автомобила"]'))) {
      await tapByLabel("Контроли на автомобила"); // one retry, then it is a finding
    }
    rec.sheet = await page.evaluate(enumerateBody);
    const sheetCells = rec.sheet.controls.filter((c) => c.inSheet);
    console.log(`\n  DEPTH 1 — «Кола» sheet, one tap (${sheetCells.length} cells):`);
    for (const c of sheetCells) {
      console.log(`    ${c.self ? " " : "!"} ${c.label.padEnd(46)} ${String(c.w).padStart(3)}x${String(c.h).padStart(3)} @${String(c.x).padStart(4)},${String(c.y).padStart(4)}${c.self ? "" : `  BLOCKED BY «${c.blockedBy}»`}`);
    }
    await tapByLabel("Контроли на автомобила"); // close

    // ── DEPTH 1 — one tap: the «Изглед» popover, and G/N inside it ──────────
    const viewProbe = { opened: false, views: [], aidsBeforeTopdown: [], aidsInTopdown: [], zoom: [], orientation: [] };
    const viewBtn = await page.$('[aria-label^="Изглед (камера)"]');
    if (viewBtn) {
      await viewBtn.click().catch(() => {});
      await page.waitForTimeout(450);
      const menu = await page.evaluate(() => {
        const m = document.querySelector('[data-hud="view-menu"]');
        if (!m) return null;
        return [...m.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { label: (b.getAttribute("aria-label") || "").trim(), word: (b.textContent || "").trim(),
                   w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
        });
      });
      viewProbe.opened = menu !== null;
      viewProbe.views = menu ?? [];
      viewProbe.aidsBeforeTopdown = (menu ?? []).filter((b) => /Мащаб|Отгоре: /.test(b.label)).map((b) => b.word);
      // Enter «Отгоре», re-open, and CYCLE the two aids — proving G and N.
      const top = await page.$('[aria-label="Изглед: отгоре"]');
      if (top) {
        await top.click().catch(() => {});
        await page.waitForTimeout(900);
        const vb2 = await page.$('[aria-label^="Изглед (камера)"]');
        if (vb2) { await vb2.click().catch(() => {}); await page.waitForTimeout(400); }
        const readAids = () => page.evaluate(() => {
          const m = document.querySelector('[data-hud="view-menu"]');
          if (!m) return null;
          const b = [...m.querySelectorAll("button")];
          const z = b.find((n) => /Мащаб отгоре/.test(n.getAttribute("aria-label") || ""));
          const o = b.find((n) => /^Отгоре: /.test(n.getAttribute("aria-label") || ""));
          const box = (n) => { const r = n.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
          return { zoom: z ? (z.textContent || "").trim() : null, zoomBox: z ? box(z) : null,
                   orient: o ? (o.textContent || "").trim() : null, orientBox: o ? box(o) : null };
        });
        const a0 = await readAids();
        viewProbe.aidsInTopdown = a0;
        if (a0 && a0.zoom !== null) {
          for (let i = 0; i < 3; i += 1) {
            const z = await page.$('[aria-label^="Мащаб отгоре"]');
            if (!z) break;
            await z.click().catch(() => {});
            await page.waitForTimeout(350);
            const a = await readAids();
            viewProbe.zoom.push(a ? a.zoom : null);
          }
        }
        if (a0 && a0.orient !== null) {
          for (let i = 0; i < 2; i += 1) {
            const o = await page.$('[aria-label^="Отгоре: "]');
            if (!o) break;
            await o.click().catch(() => {});
            await page.waitForTimeout(350);
            const a = await readAids();
            viewProbe.orientation.push(a ? a.orient : null);
          }
        }
        // back to the cockpit
        const back = await page.$('[aria-label="Изглед: кабина"]');
        if (back) { await back.click().catch(() => {}); await page.waitForTimeout(700); }
      }
    }
    rec.view = viewProbe;
    console.log(`\n  DEPTH 1 — «Изглед» popover: opened=${viewProbe.opened} · views=[${viewProbe.views.map((v) => v.word).join(", ")}]`);
    console.log(`    aids while NOT top-down: [${viewProbe.aidsBeforeTopdown.join(", ")}] (expected empty — progressive disclosure)`);
    console.log(`    aids while top-down:     ${JSON.stringify(viewProbe.aidsInTopdown)}`);
    console.log(`    G (Зум)  cycled → ${JSON.stringify(viewProbe.zoom)}`);
    console.log(`    N (Посока/Север) → ${JSON.stringify(viewProbe.orientation)}`);

    // ── DEPTH 1 — the lesson «Меню» ─────────────────────────────────────────
    const menuBtn = await page.$('[aria-label="Меню на урока"]');
    let menuRows = [];
    if (menuBtn) {
      await menuBtn.click().catch(() => {});
      await page.waitForTimeout(450);
      menuRows = await page.evaluate(() => {
        const holder = [...document.querySelectorAll('[role="menu"], [role="dialog"]')]
          .find((n) => /Карай|Карта|Всички уроци|Прекрати|Съветник/.test(n.textContent || ""));
        const scope = holder ?? document;
        return [...scope.querySelectorAll("button")].map((b) => {
          const r = b.getBoundingClientRect();
          return { label: (b.getAttribute("aria-label") || b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60),
                   w: Math.round(r.width), h: Math.round(r.height) };
        }).filter((b) => b.h > 0);
      });
      const close = await page.$('[aria-label="Затвори менюто на урока"]');
      if (close) { await close.click().catch(() => {}); await page.waitForTimeout(350); }
    }
    rec.menu = menuRows;
    console.log(`\n  DEPTH 1 — lesson «Меню» (${menuRows.length} rows):`);
    for (const r of menuRows) console.log(`      ${r.label.padEnd(46)} ${String(r.w).padStart(3)}x${String(r.h).padStart(3)}${r.h < 43.5 ? "  UNDER-44" : ""}`);

    // ── THE LIVE COLUMN — two genuine CDP touch points ──────────────────────
    const cdp = await context.newCDPSession(page);
    await page.evaluate(() => { window.__parityTouch = { max: 0, events: [], pointers: 0, maxPointers: 0 }; });

    // Finger 1: the drivetrain pad, pressed UP (throttle) and held there for
    // the whole of the rest of this run. This is a student accelerating.
    const pad = await page.evaluate(() => {
      const p = document.querySelector('[aria-label^="Газ"], [aria-label*="спирачка"], [aria-label*="назад"]');
      const el = p ?? document.querySelector('[data-hud="touch-controls"] div[style*="right: 0"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2),
               top: Math.round(r.top + r.height * 0.2), label: el.getAttribute("aria-label") };
    });
    rec.padAnchor = pad;
    let twoFingerOk = false;
    if (pad) {
      await fingerDown(cdp, [{ x: pad.x, y: pad.y, id: 1 }]);
      await fingerMove(cdp, [{ x: pad.x, y: pad.top, id: 1 }]); // drag up = throttle
      await sleep(500);
      // a probe touch somewhere harmless, purely to prove two points exist
      await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }, { x: Math.round(rec.depth0.vw / 2), y: Math.round(rec.depth0.vh / 2), id: 2 }]);
      await sleep(120);
      await fingerUp(cdp, [{ x: Math.round(rec.depth0.vw / 2), y: Math.round(rec.depth0.vh / 2), id: 2 }]);
      await sleep(120);
      const truth = await page.evaluate(() => window.__parityTouch);
      twoFingerOk = truth.max >= 2 || truth.maxPointers >= 2;
      rec.touchTruth = { maxTouches: truth.max, maxPointers: truth.maxPointers, sample: truth.events.slice(0, 12) };
      console.log(`\n  TOUCH-TRUTH: max simultaneous touches observed = ${truth.max}, max simultaneous pointers = ${truth.maxPointers} → ${twoFingerOk ? "TWO-FINGER RIG CONFIRMED" : "*** SINGLE-POINT RIG — EVERY LIVE VERDICT REFUSED ***"}`);
    }

    /** Two-finger tap: finger 1 stays planted, finger 2 taps `target`. */
    const twoFingerTap = async (x, y) => {
      await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }, { x, y, id: 2 }]);
      await sleep(90);
      await fingerUp(cdp, [{ x, y, id: 2 }]);
      await sleep(420);
    };

    // The observable-state probes. Each returns a string; a control is LIVE if
    // the string changes across the two-finger tap.
    const readState = () => page.evaluate(() => {
      const q = (sel) => document.querySelector(sel);
      const pressed = (sel) => { const e = q(sel); return e ? e.getAttribute("aria-pressed") : "absent"; };
      const text = (sel) => { const e = q(sel); return e ? (e.textContent || "").trim() : "absent"; };
      return {
        indicatorL: pressed('[aria-label="Мигач наляво"]'),
        indicatorR: pressed('[aria-label="Мигач надясно"]'),
        sheetOpen: q('[aria-label="Контроли на автомобила"][role="toolbar"]') !== null,
        sheetBtn: pressed('button[aria-label="Контроли на автомобила"]'),
        viewOpen: pressed('[aria-label^="Изглед (камера)"]'),
        viewName: (q('[aria-label^="Изглед (камера)"]')?.getAttribute("aria-label") || "").replace(/^.*сега: /, ""),
        wipers: pressed('[aria-label="Чистачки"]'),
        hazards: pressed('[aria-label="Аварийни светлини"]'),
        lights: text('[aria-label^="Светлини"]'),
        handbrake: pressed('[aria-label="Ръчна спирачка"]'),
        menuOpen: q('[aria-label="Затвори менюто на урока"]') !== null,
        hornHeld: (q('[aria-label="Клаксон — задръж"]')?.className || "").includes("border-accent"),
        paused: /Пауза|Продължи урока/.test(document.body.innerText || "") && q('[role="dialog"]') !== null,
      };
    });

    /**
     * Read `key` until it stops matching `was`, or until the budget runs out.
     *
     * THE READOUT IS SLOWER THAN THE CONTROL AND THAT IS NOT THE CONTROL'S
     * FAULT. TouchControls polls the cabin at 250 ms (CABIN_POLL_MS) and this
     * rig's main thread is shared with a SwiftShader frame that takes half a
     * second, so a button that fired instantly can still be reporting its old
     * `aria-pressed` 400 ms later. A fixed sleep therefore prints DEAD for a
     * live control — which is exactly the class of false defect §G0 exists
     * about. Wait for the transition, and print how long it took.
     */
    const waitForChange = async (key, was, budgetMs = 5000) => {
      const t0 = Date.now();
      for (;;) {
        const s = await readState();
        if (String(s[key]) !== String(was)) return { value: s[key], ms: Date.now() - t0 };
        if (Date.now() - t0 > budgetMs) return { value: s[key], ms: Date.now() - t0, timedOut: true };
        await sleep(150);
      }
    };

    const liveCheck = async (rowName, label, key, opts = {}) => {
      if (!twoFingerOk) { rec.live[rowName] = "REFUSED (single-point rig)"; return; }
      const box = await page.evaluate((l) => {
        const e = document.querySelector(`[aria-label="${l}"]`) || document.querySelector(`[aria-label^="${l}"]`);
        if (!e) return null;
        const r = e.getBoundingClientRect();
        const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(cx, cy);
        return { cx, cy, w: Math.round(r.width), h: Math.round(r.height),
                 self: hit !== null && (hit === e || e.contains(hit)),
                 blocker: hit ? (hit.getAttribute("aria-label") || hit.className || hit.tagName).toString().slice(0, 40) : "nothing" };
      }, label);
      if (!box) { rec.live[rowName] = "control absent"; console.log(`    ${rowName.padEnd(30)} ABSENT`); return; }
      const before = await readState();
      await twoFingerTap(box.cx, box.cy);
      const seen = await waitForChange(key, before[key]);
      const changed = !seen.timedOut;
      rec.live[rowName] = { fired: changed, before: before[key], after: seen.value, latencyMs: seen.ms, box };
      console.log(`    ${rowName.padEnd(30)} ${changed ? "LIVE  " : "DEAD  "} ${String(before[key])} → ${String(seen.value)}  (${seen.ms} ms)  [${box.w}x${box.h}${box.self ? "" : ` BLOCKED by ${box.blocker}`}]`);
      if (opts.restore && changed) {
        await twoFingerTap(box.cx, box.cy);
        await waitForChange(key, seen.value);
      }
    };

    console.log(`\n  LIVE UNDER A SECOND FINGER (finger 1 held on the throttle at ${pad ? `${pad.x},${pad.top}` : "?"}):`);
    await liveCheck("arc · indicator left", "Мигач наляво", "indicatorL", { restore: true });
    await liveCheck("arc · indicator right", "Мигач надясно", "indicatorR", { restore: true });
    await liveCheck("rail · Изглед (camera)", "Изглед (камера)", "viewOpen", { restore: true });
    await liveCheck("rail · Кола (sheet)", "Контроли на автомобила", "sheetBtn");
    // The sheet's own geometry, measured while it is genuinely open — the
    // earlier depth-1 pass reads it through a Playwright `.click()`, which is a
    // mouse and is not what a student has.
    rec.sheetOpen = await page.evaluate(() => {
      const t = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
      if (!t) return null;
      const tr = t.getBoundingClientRect();
      return {
        band: { x: Math.round(tr.left), y: Math.round(tr.top), w: Math.round(tr.width), h: Math.round(tr.height) },
        cells: [...t.querySelectorAll("button, span[aria-label]")].map((b) => {
          const r = b.getBoundingClientRect();
          const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
          const hit = document.elementFromPoint(cx, cy);
          return { label: (b.getAttribute("aria-label") || "").slice(0, 46), text: (b.textContent || "").trim(),
                   w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top),
                   self: hit !== null && (hit === b || b.contains(hit)),
                   blocker: hit ? String(hit.getAttribute("aria-label") || hit.className || hit.tagName).slice(0, 36) : "nothing" };
        }),
      };
    });
    if (rec.sheetOpen) {
      console.log(`\n  «Кола» SHEET, OPEN AND MEASURED — band ${rec.sheetOpen.band.w}x${rec.sheetOpen.band.h} @${rec.sheetOpen.band.x},${rec.sheetOpen.band.y}, ${rec.sheetOpen.cells.length} cells:`);
      for (const c of rec.sheetOpen.cells) {
        console.log(`      ${(c.text || c.label).padEnd(10)} ${c.label.padEnd(46)} ${String(c.w).padStart(3)}x${String(c.h).padStart(3)} @${String(c.x).padStart(4)},${String(c.y).padStart(4)}${c.self ? "" : `  BLOCKED BY «${c.blocker}»`}`);
      }
    }
    // ── THE TIER CELL, AND WHAT IT MAKES APPEAR ─────────────────────────────
    // Row 34 (difficulty) and row 8 (clutch) both claim things about a tier
    // this table has never actually switched into on a phone. One tap on
    // «НОРМ» is the whole journey. The clutch's LIVENESS is §C2 and another
    // lane's; its EXISTENCE is a §E fact and is recorded here.
    if (rec.sheetOpen) {
      const tierCell = rec.sheetOpen.cells.find((c) => /Ниво на помощта/.test(c.label));
      if (tierCell) {
        for (let i = 0; i < 3; i += 1) {
          const now = await page.evaluate(() => {
            const t = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
            const c = t && [...t.querySelectorAll("button")].find((b) => /Ниво на помощта/.test(b.getAttribute("aria-label") || ""));
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { text: (c.textContent || "").trim(), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
          });
          if (!now || /НАПР/i.test(now.text)) break;
          await twoFingerTap(now.cx, now.cy);
          await sleep(900);
        }
        rec.manualTier = await page.evaluate(() => {
          const t = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
          if (!t) return null;
          const cells = [...t.querySelectorAll("button, span[aria-label]")].map((b) => {
            const r = b.getBoundingClientRect();
            return { text: (b.textContent || "").trim(), label: (b.getAttribute("aria-label") || "").slice(0, 60),
                     w: Math.round(r.width), h: Math.round(r.height) };
          });
          return { tier: cells.find((c) => /Ниво на помощта/.test(c.label))?.text ?? null,
                   clutch: cells.find((c) => /Съединител/.test(c.label)) ?? null,
                   upshift: cells.find((c) => /по-висока предавка/.test(c.label)) ?? null,
                   cells: cells.length };
        });
        console.log(`\n  TIER CELL → «${rec.manualTier?.tier}» · «СЪЕД» clutch cell: ${rec.manualTier?.clutch ? `PRESENT ${rec.manualTier.clutch.w}x${rec.manualTier.clutch.h}` : "ABSENT"} · upshift: ${rec.manualTier?.upshift ? `«${rec.manualTier.upshift.text}»` : "ABSENT"} · ${rec.manualTier?.cells} cells`);
        // …and back, so the rest of the run is on the tier the table describes.
        for (let i = 0; i < 4; i += 1) {
          const now = await page.evaluate(() => {
            const t = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
            const c = t && [...t.querySelectorAll("button")].find((b) => /Ниво на помощта/.test(b.getAttribute("aria-label") || ""));
            if (!c) return null;
            const r = c.getBoundingClientRect();
            return { text: (c.textContent || "").trim(), cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
          });
          if (!now || /НОРМ/i.test(now.text)) break;
          await twoFingerTap(now.cx, now.cy);
          await sleep(900);
        }
      }
    }

    // With the sheet now open, the cells:
    await liveCheck("sheet · ЧИСТ wipers", "Чистачки", "wipers", { restore: true });
    await liveCheck("sheet · АВАР hazards", "Аварийни светлини", "hazards", { restore: true });
    await liveCheck("sheet · СВЕТЛ headlights", "Светлини", "lights");
    await liveCheck("sheet · РЪЧНА handbrake", "Ръчна спирачка", "handbrake", { restore: true });
    await liveCheck("rail · Кола (close)", "Контроли на автомобила", "sheetBtn");
    await liveCheck("shell · Меню", "Меню на урока", "menuOpen");
    if ((await readState()).menuOpen) {
      const c = await page.$('[aria-label="Затвори менюто на урока"]');
      if (c) { await c.click().catch(() => {}); await page.waitForTimeout(350); }
    }
    // The horn is a HOLD, so it gets its own shape: press and read while down.
    if (twoFingerOk) {
      const hb = await page.evaluate(() => {
        const e = document.querySelector('[aria-label="Клаксон — задръж"]');
        if (!e) return null; const r = e.getBoundingClientRect();
        return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
      });
      if (hb) {
        await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }, { x: hb.cx, y: hb.cy, id: 2 }]);
        await sleep(300);
        const during = await readState();
        await fingerUp(cdp, [{ x: hb.cx, y: hb.cy, id: 2 }]);
        await sleep(300);
        const post = await readState();
        rec.live["rail · Клаксон (hold)"] = { fired: during.hornHeld && !post.hornHeld, during: during.hornHeld, after: post.hornHeld };
        console.log(`    ${"rail · Клаксон (hold)".padEnd(30)} ${during.hornHeld && !post.hornHeld ? "LIVE  " : "DEAD  "} held=${during.hornHeld} released=${!post.hornHeld}`);
      }
    }

    // ── THE PAUSED-OVERLAY CLASS — rows 39/42/43, tested as one shape ───────
    //
    // A quiz, a teach card, the consequence card and the pause menu all PAUSE
    // the world, and pausing takes the touch overlay inert. What it does NOT do
    // is lift the student's thumb: the finger that was on the throttle when the
    // card arrived is still physically on the glass, so the tap that answers
    // the card is the browser's SECOND touch point and gets no compatibility
    // mouse `click`. Any control on those cards that is `onClick`-only is
    // therefore dead in the one state it exists for. This drives that exact
    // sequence: finger 1 planted THROUGH the card's arrival, finger 2 answers.
    if (twoFingerOk && pad) {
      const pauseTest = { raised: false, dismissed: null, chips: [] };
      await fingerDown(cdp, [{ x: pad.x, y: pad.y, id: 1 }]);
      await fingerMove(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
      await sleep(500);
      const pb = await page.evaluate(() => {
        const e = document.querySelector('[aria-label="Пауза"]');
        if (!e) return null; const r = e.getBoundingClientRect();
        return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2) };
      });
      if (pb) {
        await twoFingerTap(pb.cx, pb.cy);
        await sleep(1200);
        pauseTest.chips = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
          if (!d) return null;
          return [...d.querySelectorAll("button")].map((b) => {
            const r = b.getBoundingClientRect();
            const cx = Math.round(r.left + r.width / 2), cy = Math.round(r.top + r.height / 2);
            return { text: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40),
                     w: Math.round(r.width), h: Math.round(r.height), cx, cy };
          });
        });
        pauseTest.raised = Array.isArray(pauseTest.chips) && pauseTest.chips.length > 0;
        pauseTest.dialog = await page.evaluate(() => {
          const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
          if (!d) return null;
          return { label: d.getAttribute("aria-label") || "", text: (d.textContent || "").replace(/\s+/g, " ").trim().slice(0, 140) };
        });
        if (pauseTest.raised) {
          // Answer it with the SECOND finger, first finger still planted.
          const resume = pauseTest.chips.find((c) => /Продължи|Затвори|Назад към урока/i.test(c.text)) ?? pauseTest.chips[0];
          await twoFingerTap(resume.cx, resume.cy);
          await sleep(1500);
          pauseTest.dismissed = await page.evaluate(() =>
            document.querySelector('[role="dialog"], [role="alertdialog"]') === null);
          pauseTest.answeredWith = resume.text;
          // *** THE POSITIVE CONTROL, AND WITHOUT IT THIS ROW IS WORTHLESS. ***
          // A control that did not fire may be dead, or the tap may have missed.
          // Lift finger 1 and press exactly the same pixel with ONE finger: if
          // it dismisses now, the only variable was the second finger.
          if (!pauseTest.dismissed) {
            await fingerUp(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
            await sleep(400);
            await fingerDown(cdp, [{ x: resume.cx, y: resume.cy, id: 3 }]);
            await sleep(90);
            await fingerUp(cdp, [{ x: resume.cx, y: resume.cy, id: 3 }]);
            await sleep(1500);
            pauseTest.dismissedWithOneFinger = await page.evaluate(() =>
              document.querySelector('[role="dialog"], [role="alertdialog"]') === null);
            // put finger 1 back so the caller's release is symmetric
            await fingerDown(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
            await sleep(150);
          }
        }
      }
      rec.pausedOverlay = pauseTest;
      console.log(`\n  PAUSED-OVERLAY UNDER A PLANTED THUMB: raised=${pauseTest.raised} · dialog=${JSON.stringify(pauseTest.dialog)}`);
      console.log(`    answered «${pauseTest.answeredWith}» with a SECOND finger → dismissed=${pauseTest.dismissed}` +
        (pauseTest.dismissedWithOneFinger === undefined ? "" : ` · POSITIVE CONTROL (same pixel, ONE finger) → dismissed=${pauseTest.dismissedWithOneFinger}`));
      if (Array.isArray(pauseTest.chips)) console.log(`    buttons: ${pauseTest.chips.map((c) => `«${c.text}» ${c.w}x${c.h}`).join(", ")}`);
      // If it is still up, get out of it with a plain click so the run continues.
      await page.evaluate(() => {
        const d = document.querySelector('[role="dialog"], [role="alertdialog"]');
        const b = d && [...d.querySelectorAll("button")].find((n) => /Продължи|Затвори/i.test(n.textContent || ""));
        if (b) b.click();
      }).catch(() => {});
    }

    // Release finger 1.
    await fingerUp(cdp, [{ x: pad.x, y: pad.top, id: 1 }]);
    await sleep(400);

    // ── WHAT IS SIMPLY NOT THERE — searched for by every name it could have ──
    rec.absent = await page.evaluate(() => {
      const txt = (document.body.innerText || "");
      const labels = [...document.querySelectorAll("button,[role='menuitem']")]
        .map((b) => `${b.getAttribute("aria-label") || ""} ${b.textContent || ""}`).join(" | ");
      const has = (re) => re.test(labels) || re.test(txt);
      return {
        muteAnywhere: has(/заглуш|звук|mute|тишина|Без звук/i),
        notifyQuiet: has(/Извести/i),
        reverseViewK: has(/поглед назад|заден ход.*поглед|автоматичен поглед/i),
        gearTowardPGesture: has(/◄P/),
        qualityPreset: has(/Качество|График/i),
        tierCell: has(/Начинаещ|Норм|Напреднал|Изпит/i),
      };
    });
    console.log(`\n  SEARCHED FOR AND NOT FOUND ON THE DRIVING SCREEN: ${JSON.stringify(rec.absent)}`);

    await page.screenshot({ path: `${OUT}/shots/${device.id}.png` }).catch(() => {});
  } catch (e) {
    rec.error = String(e && e.message ? e.message : e);
    console.log(`  *** ${device.id} FAILED: ${rec.error}`);
  }
  all.push(rec);
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/report.json`, JSON.stringify({ base: BASE, when: new Date().toISOString(), all }, null, 2));
console.log(`\n[parity-e] wrote ${OUT}/report.json`);
