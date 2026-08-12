// =============================================================================
// wave3-drive.mjs — JUDGE THE TOUCH LAYOUT AS A CONTROL SYSTEM, MID-DRIVE.
//
// Every number this repo has published about the phone layout so far was taken
// on a PARKED car. That is not the screen the founder complains about: the deck
// auto-plays, the speed chip counts, the objective banner swaps, and the road
// under the UI is moving — which is the entire reason "is the middle clear?" is
// a question at all. So this probe DRIVES first (`__driveRig.run`, closed loop,
// 22 km/h) and refuses any row where the car was not actually moving when the
// frame was taken. `movingKmh` is printed on every state for exactly that.
//
// It measures, per profile, in four states (deck × sheet):
//   · control-over-control overlap px² and DEAD controls (elementFromPoint at a
//     control's own centre answering something else)
//   · TEXT-over-control px² — the pass/fail
//   · under-44 px and off-screen
//   · COVERAGE, two honest currencies:
//       INK      union of every UI rect, on a 4 px grid
//       TAP      elementFromPoint on a 12 px grid: can a finger reach the road?
//     both whole-screen and inside the centre 50 %×50 % box, and the TAP column
//     is recomputed from wave 1's own stored control rects so the BEFORE is a
//     measurement rather than a reconstruction.
//   · a planted NEGATIVE CONTROL, so a green column can still go red.
//
// And it exercises the controls it is judging:
//   · the three graded mirror glances in PIXELS, cockpit AND chase, against a
//     HELD-Q positive control — sampled INSIDE the 0.9 s tap hold, which is the
//     mistake that produced two contradictory wave-2 verdicts.
//   · the camera control, in pixels, not by attribute.
//   · the absolute pad at dead centre, which must return EXACTLY 0.000 km/h.
//
//   node wave3-drive.mjs                       # all six profiles
//   node wave3-drive.mjs --device iphone16-landscape
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner, assertInsetsApplied } from "./lib/insets.mjs";
import { decodePng } from "./lib/ready.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3200");
const TAG = arg("tag", "w3");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave3-drive`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? [only] : undefined);
const SCENARIO = arg("scenario", "sc-zebra-approach");
const MIN = 44;

// ── the page-side probe ──────────────────────────────────────────────────────
function probeBody(cfg) {
  const MINPX = cfg.min;
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  const visible = (el) => {
    let n = el;
    while (n) {
      const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (Number.parseFloat(s.opacity) <= 0.01) return false;
      n = n.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  };
  // HIT AREA, NOT INK — the 44 px floor is bought with negative-inset ::before
  // pseudo-elements in this app, so the painted box understates the target.
  const hitBox = (el) => {
    const r = el.getBoundingClientRect();
    let { width: w, height: h } = r;
    for (const p of ["::before", "::after"]) {
      const ps = getComputedStyle(el, p);
      if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
      const px = (v) => Number.parseFloat(v) || 0;
      h += Math.max(0, -px(ps.top)) + Math.max(0, -px(ps.bottom));
      w += Math.max(0, -px(ps.left)) + Math.max(0, -px(ps.right));
    }
    return { x: r.x, y: r.y, w: r.width, h: r.height, hitW: w, hitH: h };
  };
  // A caption inside a short overflow-y-auto box paints only the slice its
  // scroller shows; getBoundingClientRect on the text leaf reports the WHOLE
  // line box. Clipping can only SHRINK a rect, so it cannot hide a real
  // overlap — the planted control has no clipping ancestor and still fires.
  const clipToAncestors = (el, r) => {
    let x0 = r.x, y0 = r.y, x1 = r.x + r.width, y1 = r.y + r.height;
    let n = el.parentElement;
    while (n) {
      const cs = getComputedStyle(n);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const c = n.getBoundingClientRect();
        if (cs.overflowX !== "visible") { x0 = Math.max(x0, c.x); x1 = Math.min(x1, c.x + c.width); }
        if (cs.overflowY !== "visible") { y0 = Math.max(y0, c.y); y1 = Math.min(y1, c.y + c.height); }
      }
      n = n.parentElement;
    }
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  };

  const sel = 'button, a[href], [role="button"], [role="slider"], [role="switch"], input, select';
  const controls = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const b = hitBox(el);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const hit = document.elementFromPoint(cx, cy);
    const covered = !!hit && hit !== el && !el.contains(hit) && !hit.contains(el);
    let coveredBy = null;
    if (covered) {
      let n = hit, chain = [];
      while (n && chain.length < 4) {
        const al = n.getAttribute?.("aria-label");
        chain.push(al ? `[${al}]` : (n.tagName + (n.getAttribute?.("data-hud") ? `@${n.getAttribute("data-hud")}` : "")));
        n = n.parentElement;
      }
      coveredBy = chain.join("<");
    }
    controls.push({
      label: ((el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim()).slice(0, 40),
      inHud: !!el.closest('[data-hud="touch-controls"]'),
      x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h),
      hitW: Math.round(b.hitW), hitH: Math.round(b.hitH),
      small: b.hitW < MINPX - 0.5 || b.hitH < MINPX - 0.5,
      covered, coveredBy,
      offscreen: b.x < -0.5 || b.y < -0.5 || b.x + b.w > vw + 0.5 || b.y + b.h > vh + 0.5,
    });
  }

  const overlaps = [];
  for (let i = 0; i < controls.length; i += 1) {
    for (let j = i + 1; j < controls.length; j += 1) {
      const a = controls[i], b = controls[j];
      const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (ox > 0 && oy > 0) overlaps.push({ a: a.label, b: b.label, px2: Math.round(ox * oy) });
    }
  }
  overlaps.sort((p, q) => q.px2 - p.px2);

  // TEXT over a control — the founder's actual complaint, which control-vs-
  // control accounting cannot see.
  const inkNodes = [];
  for (const el of document.querySelectorAll("span, p, div, h1, h2, h3, li, label, strong, em")) {
    if (el.closest("button, a[href], [role='button']")) continue;
    const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (txt.length === 0) continue;
    let childHasText = false;
    for (const c of el.children) if ((c.textContent || "").trim().length > 0) { childHasText = true; break; }
    if (childHasText) continue;
    if (!visible(el)) continue;
    const c = clipToAncestors(el, el.getBoundingClientRect());
    if (c.w < 0.5 || c.h < 0.5) continue;
    inkNodes.push({ txt: txt.slice(0, 46), x: c.x, y: c.y, w: c.w, h: c.h });
  }
  const textOverControl = [];
  for (const ink of inkNodes) {
    for (const c of controls) {
      const ox = Math.min(ink.x + ink.w, c.x + c.w) - Math.max(ink.x, c.x);
      const oy = Math.min(ink.y + ink.h, c.y + c.h) - Math.max(ink.y, c.y);
      if (ox > 0 && oy > 0) textOverControl.push({ text: ink.txt, control: c.label, px2: Math.round(ox * oy) });
    }
  }
  textOverControl.sort((p, q) => q.px2 - p.px2);

  // ── COVERAGE ─────────────────────────────────────────────────────────────
  // INK: union of every UI rect (controls' painted boxes + text leaves + any
  // element with a non-transparent background inside a [data-hud] subtree), on
  // a 4 px grid. TAP: elementFromPoint on a 12 px grid — a cell counts as
  // intercepted when the topmost element there is not the canvas/stage. That
  // second one is the currency that matters: it is literally "can my finger
  // reach the road here".
  const uiRects = [];
  for (const c of controls) uiRects.push({ x: c.x, y: c.y, w: c.w, h: c.h });
  for (const i of inkNodes) uiRects.push(i);
  for (const el of document.querySelectorAll('[data-hud] *, [data-hud]')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor || "";
    const m = bg.match(/rgba?\(([^)]+)\)/);
    const alpha = m ? (m[1].split(",")[3] !== undefined ? Number.parseFloat(m[1].split(",")[3]) : 1) : 0;
    if (alpha <= 0.05) continue;
    const r = clipToAncestors(el, el.getBoundingClientRect());
    if (r.w < 1 || r.h < 1) continue;
    uiRects.push(r);
  }
  const G = 4;
  const gw = Math.ceil(vw / G), gh = Math.ceil(vh / G);
  const inkGrid = new Uint8Array(gw * gh);
  for (const r of uiRects) {
    const x0 = Math.max(0, Math.floor(r.x / G)), x1 = Math.min(gw - 1, Math.floor((r.x + r.w) / G));
    const y0 = Math.max(0, Math.floor(r.y / G)), y1 = Math.min(gh - 1, Math.floor((r.y + r.h) / G));
    for (let y = y0; y <= y1; y += 1) for (let x = x0; x <= x1; x += 1) inkGrid[y * gw + x] = 1;
  }
  const cbX0 = vw * 0.25, cbX1 = vw * 0.75, cbY0 = vh * 0.25, cbY1 = vh * 0.75;
  let inkAll = 0, inkCentre = 0, cellsCentre = 0;
  for (let y = 0; y < gh; y += 1) for (let x = 0; x < gw; x += 1) {
    const on = inkGrid[y * gw + x];
    if (on) inkAll += 1;
    const px = x * G + G / 2, py = y * G + G / 2;
    if (px >= cbX0 && px < cbX1 && py >= cbY0 && py < cbY1) { cellsCentre += 1; if (on) inkCentre += 1; }
  }

  const T = 12;
  const isStage = (el) => {
    if (!el) return true;
    if (el.tagName === "CANVAS") return true;
    if (el === document.body || el === document.documentElement) return true;
    // A pointer-events:none decorative wrapper is not an interception either.
    return false;
  };
  let tapAll = 0, tapAllN = 0, tapCentre = 0, tapCentreN = 0;
  const interceptors = new Map();
  for (let py = T / 2; py < vh; py += T) for (let px = T / 2; px < vw; px += T) {
    const el = document.elementFromPoint(px, py);
    const blocked = !isStage(el);
    tapAllN += 1; if (blocked) tapAll += 1;
    if (blocked) {
      const owner = el.closest("[data-hud]")?.getAttribute("data-hud") || el.tagName;
      interceptors.set(owner, (interceptors.get(owner) || 0) + 1);
    }
    if (px >= cbX0 && px < cbX1 && py >= cbY0 && py < cbY1) { tapCentreN += 1; if (blocked) tapCentre += 1; }
  }

  const boxOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), floorPx: Math.round(vh - r.bottom) };
  };
  const deckEl = document.querySelector('[data-hud="demo-deck"]');
  const sheetEl = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');

  return {
    vw, vh,
    textOverControl: textOverControl.slice(0, 8),
    textOverControlCount: textOverControl.length,
    textOverControlPx2: textOverControl.reduce((s, o) => s + o.px2, 0),
    anyPointerCoarse: matchMedia("(any-pointer: coarse)").matches,
    compact: document.querySelector('[data-sim-compact]')?.getAttribute("data-sim-compact") ?? null,
    hudMounted: !!document.querySelector('[data-hud="touch-controls"]'),
    controlCount: controls.length,
    small: controls.filter((c) => c.small),
    dead: controls.filter((c) => c.covered),
    offscreen: controls.filter((c) => c.offscreen),
    overlaps: overlaps.slice(0, 10),
    overlapCount: overlaps.length,
    overlapPx2Total: overlaps.reduce((s, o) => s + o.px2, 0),
    deck: boxOf(deckEl),
    deckPresent: !!deckEl && deckEl.getBoundingClientRect().width > 0,
    deckOpen: deckEl?.getAttribute("data-deck-open") ?? null,
    sheet: boxOf(sheetEl),
    sheetPresent: !!sheetEl && sheetEl.getBoundingClientRect().width > 0,
    coverage: {
      inkPct: +(100 * inkAll / (gw * gh)).toFixed(2),
      inkCentrePct: +(100 * inkCentre / Math.max(1, cellsCentre)).toFixed(2),
      tapPct: +(100 * tapAll / Math.max(1, tapAllN)).toFixed(2),
      tapCentrePct: +(100 * tapCentre / Math.max(1, tapCentreN)).toFixed(2),
      topInterceptors: [...interceptors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    },
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    clientHeight: document.documentElement.clientHeight,
    controls,
  };
}

function plantDefects() {
  const mk = (id, x, y, w, h) => {
    const b = document.createElement("button");
    b.id = id; b.setAttribute("aria-label", id); b.textContent = id;
    b.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${w}px;height:${h}px;z-index:9999;background:#f0f`;
    document.body.appendChild(b); return b;
  };
  mk("NEGCTL-a", 10, 10, 60, 60);
  mk("NEGCTL-b", 40, 10, 60, 60);              // overlaps a by 30x60 = 1800 px²
  mk("NEGCTL-small", 200, 10, 20, 20);
  mk("NEGCTL-buried", 300, 10, 60, 60);
  mk("NEGCTL-lid", 300, 10, 60, 60).style.zIndex = "10000";
  const ink = document.createElement("span");
  ink.id = "NEGCTL-ink"; ink.textContent = "NEGCTL-ink-over-a-control";
  ink.style.cssText = "position:fixed;left:30px;top:10px;width:40px;height:60px;z-index:10001;color:#0f0";
  document.body.appendChild(ink);
  return true;
}
function removeDefects() {
  document.getElementById("NEGCTL-ink")?.remove();
  for (const id of ["NEGCTL-a", "NEGCTL-b", "NEGCTL-small", "NEGCTL-buried", "NEGCTL-lid"]) document.getElementById(id)?.remove();
}

// ── pixel diff over a band of the road ───────────────────────────────────────
function diffFraction(a, b) {
  const A = decodePng(a), B = decodePng(b);
  if (A.width !== B.width || A.height !== B.height) return 1;
  let changed = 0;
  const n = A.width * A.height;
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    if (Math.abs(A.data[o] - B.data[o]) > 8 || Math.abs(A.data[o + 1] - B.data[o + 1]) > 8 || Math.abs(A.data[o + 2] - B.data[o + 2]) > 8) changed += 1;
  }
  return changed / n;
}

// `l0-free-drive` IS THE ONLY LESSON THAT CAN CARRY A SWEEP THIS LONG, and
// finding that out cost a whole run. On `sc-zebra-approach` a scripted 22 km/h
// cruise walks straight through a pedestrian crossing: the run banked 10
// penalty points, the lesson ENDED («Неиздържан — виж разбора»), the world went
// black, and every row after that point was a photograph of a debrief screen
// with the telemetry frozen at its last value. l0 spawns ready-to-drive
// (`vehicleStart: "ready"`), has NO objectives and no crossing — but the rules
// still apply, so this file drives in SHORT BURSTS and stops between states
// rather than holding the throttle for five minutes.
const LESSON = arg("lesson", "l0-free-drive");
// …but l0 carries NO DEMONSTRATION, so it cannot answer the deck questions at
// all: `deckPresent` is false in every state on every profile there. Use
// `--scenario-route` for the deck/sheet surfaces, where a deck actually exists.
const WARM = process.argv.includes("--scenario-route")
  ? `${BASE}/dev/drive-rig?scenario=${SCENARIO}&level=1&quality=low&readout=0`
  : `${BASE}/dev/drive-rig?lesson=${LESSON}&quality=low&readout=0`;
try { const r = await fetch(WARM); await r.arrayBuffer(); console.log(`[w3] warmed route: ${r.status}`); }
catch (e) { console.log(`[w3] warm failed (${e.message})`); }

const browser = await webkit.launch();
const all = [];

for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real" });
  await context.addInitScript(() => {
    try { window.localStorage.setItem("sim.touchHintSeen", "1"); } catch { /* private mode */ }
    // PLAYWRIGHT'S WEBKIT IS THE DESKTOP PORT AND HAS NO GAMEPAD API AT ALL.
    // `__driveRig` drives through a synthetic standard-mapping pad (rig.ts
    // chose a pad over synthetic keys because a learner needs ANALOG pedals to
    // hold 22 km/h instead of oscillating around it), and its install path does
    // `navigator.getGamepads.bind(navigator)` — which throws on undefined and
    // takes the whole probe down before the first measurement. This is the
    // empty stub the spec says a pad-less machine should have. It changes
    // nothing about the app: SimInput merges keyboard ∪ gamepad ∪ touch and an
    // empty list contributes nothing until the rig installs its own pad over
    // the top. Without it, this file can only measure a PARKED car — which is
    // the screen every previous wave measured and the founder does not use.
    if (typeof navigator.getGamepads !== "function") {
      Object.defineProperty(navigator, "getGamepads", { configurable: true, writable: true, value: () => [] });
    }
  });
  const page = await context.newPage();
  const rec = { device: device.id, label: device.label, viewport: `${device.width}x${device.height}`, states: {} };
  console.log(`\n${"=".repeat(90)}\n${device.label} — ${device.width}x${device.height} dpr${device.dpr} · WEBKIT · MID-DRIVE`);
  console.log(insetBanner(device, inset));

  await page.goto(WARM, { waitUntil: "domcontentloaded", timeout: 240_000 });
  let booted = false;
  for (let a = 1; a <= 3 && !booted; a += 1) {
    try { await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 150_000 }); booted = true; }
    catch { console.log(`  boot attempt ${a} timed out — reloading`); await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 }).catch(() => {}); }
  }
  if (!booted) {
    console.log(`  *** ${device.id}: rig never became ready — SKIPPED, no numbers claimed ***`);
    all.push({ ...rec, skipped: "rig never became ready" });
    await context.close(); continue;
  }
  const applied = await assertInsetsApplied(page, inset);
  console.log(`inset: rewrote ${applied.agent.declarations}+${applied.agent.inlineDeclarations} decls · body l${applied.body.left} r${applied.body.right} b${applied.body.bottom}`);
  await page.waitForTimeout(2200);

  // ── A TEACH CARD MAKES THE WHOLE TOUCH OVERLAY INERT ─────────────────────
  // TouchControls.tsx:930 `const visible = !hidden && !keyboardActive` — when a
  // teach card arrives the overlay goes inert and the sheet is not rendered at
  // all. That is DESIGNED (the card pauses the world; you should not be able to
  // drive through it) and it is also why the first run of this file measured
  // FOUR controls on a phone: «Движение без предпазен колан» fires within ten
  // seconds of every drive and takes the pads, the rail and all five flank
  // stations off the screen with it. Every previous sweep seeded
  // `sim.touchHintSeen` and believed that was enough; it is not — that key
  // suppresses the first-run THUMB HINT, which is a different surface.
  const clearCards = async () => {
    for (let i = 0; i < 6; i += 1) {
      const hit = await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          const t = (b.textContent || "").trim();
          if (/^(Разбрах|Продължи|Затвори)$/.test(t)) { b.click(); return t; }
        }
        return null;
      });
      if (!hit) return i;
      await page.waitForTimeout(650);
    }
    return 6;
  };
  const cleared = await clearCards();
  await page.waitForTimeout(900);

  // FASTEN THE BELT — and check the wave-2 contract that «Колан» is a rail cell
  // that exists ONLY while unbuckled. This is also what stops the teach card
  // re-arriving every few seconds and hiding the layout under measurement.
  const beltBefore = await page.evaluate(() => !!document.querySelector('[aria-label="Закопчай предпазния колан"]'));
  if (beltBefore) {
    const r = await page.evaluate(() => {
      const b = document.querySelector('[aria-label="Закопчай предпазния колан"]');
      const q = b.getBoundingClientRect();
      return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
    });
    await page.touchscreen.tap(r.x, r.y);   // a real finger, not .click()
    await page.waitForTimeout(700);
  }
  const beltAfter = await page.evaluate(() => !!document.querySelector('[aria-label="Закопчай предпазния колан"]'));
  rec.belt = { cardsCleared: cleared, railCellBefore: beltBefore, railCellAfter: beltAfter };
  console.log(`  TEACH CARDS cleared: ${cleared} · «КОЛАН» rail cell present ${beltBefore} → after a thumb tap ${beltAfter}`);

  // THE LESSON CAN END UNDER THE PROBE. When it does, the world goes black and
  // `__driveRig.last` freezes at its final value — which reads exactly like a
  // clean, still screen. Any row taken after this point is REFUSED rather than
  // published; that is the difference between a measurement and a screenshot of
  // a debrief.
  const lessonOver = () => page.evaluate(() =>
    [...document.querySelectorAll("button")].some((b) => /^(Резултат|РЕЗУЛТАТ)$/.test((b.textContent || "").trim()))
    || /Неиздържан|Издържан/.test(document.body.innerText || ""));

  // ── DRIVE, IN BURSTS. Everything after this is measured on a MOVING car. ──
  const burst = async (sec = 14, kmh = 20) => {
    await page.evaluate((s) => window.__driveRig.run([{ label: "cruise", speedKmh: s.kmh, forSec: s.sec }]), { kmh, sec });
    await page.waitForTimeout(4200);
  };
  const halt = () => page.evaluate(() => window.__driveRig.stop());

  await burst();
  await clearCards();
  await page.waitForTimeout(400);
  const moving = await page.evaluate(() => window.__driveRig?.last?.speedKmh ?? -1);
  console.log(`  DRIVING: ${moving.toFixed(2)} km/h ${moving > 5 ? "· the car is moving" : "· *** NOT MOVING — rows below are SUSPECT ***"}`);
  rec.movingKmh = +moving.toFixed(2);

  const openDeck = () => page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) if (/Демонстрация/.test(b.textContent || "")) { b.click(); return true; }
    return false;
  });
  const openSheet = () => page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) if ((b.getAttribute("aria-label") || "") === "Контроли на автомобила") { b.click(); return true; }
    return false;
  });
  const closeSheet = () => page.evaluate(() => {
    for (const b of document.querySelectorAll("button")) if ((b.getAttribute("aria-label") || "") === "Затвори контролите") { b.click(); return true; }
    return false;
  });

  const measure = async (state, noteIn = "") => {
    let note = noteIn;
    // A card that arrived since the last state would take the whole overlay off
    // screen and turn this row into a photograph of an empty corridor.
    await clearCards();
    if (await lessonOver()) {
      console.log(`  ${state.padEnd(12)} *** REFUSED: the lesson ended before this row — no numbers claimed ***`);
      rec.states[state] = { refused: "lesson ended (debrief on screen)" };
      await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__${state}__REFUSED.png`, timeout: 120_000 });
      return null;
    }
    await burst();                        // MOVING at the instant of capture
    await clearCards();
    await page.waitForTimeout(300);
    const kmh = await page.evaluate(() => window.__driveRig?.last?.speedKmh ?? -1);
    const m = await page.evaluate(probeBody, { min: MIN });
    m.kmhAtCapture = +kmh.toFixed(2);
    rec.states[state] = m;
    const c = m.coverage;
    console.log(
      `  ${state.padEnd(12)} ${String(m.kmhAtCapture).padStart(6)} km/h · ctl ${String(m.controlCount).padStart(2)} · ` +
      `DEAD ${String(m.dead.length).padStart(2)} · ovl ${String(m.overlapCount).padStart(2)}/${String(m.overlapPx2Total).padStart(6)}px² · ` +
      `TEXT ${String(m.textOverControlCount).padStart(2)}/${String(m.textOverControlPx2).padStart(6)}px² · ` +
      `<44 ${m.small.length} · off ${m.offscreen.length} · ink ${String(c.inkPct).padStart(5)}% tap ${String(c.tapPct).padStart(5)}% · ` +
      `CENTRE ink ${String(c.inkCentrePct).padStart(5)}% tap ${String(c.tapCentrePct).padStart(5)}%${note}`
    );
    // A DECK STATE WITH NO DECK ON SCREEN IS NOT A DECK MEASUREMENT. `l0-free-
    // drive` carries no demonstration at all, so the first full sweep reported
    // „deck+sheet: 0 dead, 0 px²" six times for a screen that never had a deck
    // on it — the same false green wave 2 caught in its own probe. The row is
    // still recorded, but it is STAMPED, and the summary refuses to print it.
    // A DECK STATE WITH NO DECK ON SCREEN IS NOT A DECK MEASUREMENT — but there
    // are TWO different reasons it can be empty and they mean opposite things:
    //   deckOpen null  → the lesson carries no demonstration at all (l0), so the
    //                    row is blind and worthless. This is the false green
    //                    the first full sweep published six times.
    //   deckOpen true  → the deck IS open and the SHEET is deliberately hiding
    //                    it (PlayAreaStyles' mutual exclusion). That is the
    //                    designed behaviour and the row is a real result: the
    //                    two surfaces cannot collide because they are never on
    //                    screen together.
    if (/deck/.test(state) && !m.deckPresent) {
      m.suspect = m.deckOpen === "true"
        ? "DECK OPEN BUT SUPPRESSED BY THE SHEET — mutual exclusion working; 0 px² is real, not blind"
        : "NO DECK ON SCREEN and none open — this lesson carries no demonstration; row is BLIND";
      note += m.deckOpen === "true" ? "  (deck suppressed by the sheet — by design)" : "  *** BLIND: no deck present ***";
    }
    if (state === "deck+sheet" && !m.sheetPresent) {
      m.suspect = "THE SHEET NEVER OPENED — not a deck+sheet measurement";
      note += "  *** BLIND: sheet not open ***";
    }
    if (m.dead.length) for (const d of m.dead.slice(0, 4)) console.log(`      DEAD «${d.label}» under ${d.coveredBy}`);
    if (m.textOverControlPx2) for (const t of m.textOverControl.slice(0, 4)) console.log(`      TEXT "${t.text}" over «${t.control}» ${t.px2}px²`);
    await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__${state}.png`, timeout: 120_000 });
    return m;
  };

  // 1 · THE STEADY DRIVING SCREEN — nothing open, car moving. The frame the
  //     founder judges by eye.
  await measure("driving");

  // 2 · deck open
  const deckOpened = await openDeck();
  await page.waitForTimeout(1200);
  await measure("deck-open", deckOpened ? "" : "  (deck toggle NOT FOUND)");

  // 3 · deck + sheet together — wave 1's worst surface
  const sheetOpened = await openSheet();
  await page.waitForTimeout(900);
  await measure("deck+sheet", sheetOpened ? "" : "  (sheet toggle NOT FOUND)");

  // 4 · sheet alone
  await closeSheet(); await page.waitForTimeout(600);
  await openDeck().catch(() => {}); // toggle the deck back off
  await page.waitForTimeout(600);
  await openSheet(); await page.waitForTimeout(900);
  await measure("sheet-open");
  await closeSheet(); await page.waitForTimeout(700);

  // 5 · NEGATIVE CONTROL — can this detector still go red?
  await page.evaluate(plantDefects);
  await page.waitForTimeout(250);
  const neg = await page.evaluate(probeBody, { min: MIN });
  await page.evaluate(removeDefects);
  const negOverlap = neg.overlaps.find((o) => /NEGCTL-a/.test(o.a + o.b) && /NEGCTL-b/.test(o.a + o.b));
  const negText = neg.textOverControl.find((t) => /NEGCTL-ink/.test(t.text));
  const negSmall = neg.small.some((s) => s.label.includes("NEGCTL-small"));
  const negDead = neg.dead.some((d) => d.label.includes("NEGCTL-buried"));
  rec.negativeControl = {
    overlapPx2: negOverlap?.px2 ?? 0, expectOverlap: 1800,
    textPx2: negText?.px2 ?? 0, expectText: 2400,
    smallCaught: negSmall, buriedCaught: negDead,
  };
  console.log(`  NEGCTL       overlap ${negOverlap?.px2 ?? 0}px² (expect 1800) · text ${negText?.px2 ?? 0}px² (expect 2400) · <44 ${negSmall} · buried ${negDead}`);

  // 6 · THE GLANCE, IN PIXELS — cockpit AND chase, sampled INSIDE the 0.9 s
  //     hold. A held key is a different event from a tap and that difference is
  //     what produced two contradictory verdicts in wave 2.
  const camBox = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  });
  // A band across the middle of the canvas: the road, not the UI.
  const band = camBox ? {
    x: Math.round(camBox.x + camBox.w * 0.18), y: Math.round(camBox.y + camBox.h * 0.34),
    width: Math.round(camBox.w * 0.64), height: Math.round(camBox.h * 0.30),
  } : null;
  const shotBand = () => page.screenshot({ clip: band, timeout: 120_000 });

  const tapByLabel = (label) => page.evaluate((l) => {
    for (const b of document.querySelectorAll("button")) if ((b.getAttribute("aria-label") || "") === l) { b.click(); return true; }
    return false;
  }, label);
  // A REAL FINGER, not .click() — a covered button refuses a touch and accepts
  // a click, so the two arms answer different questions.
  const touchByLabel = async (label) => {
    const r = await page.evaluate((l) => {
      for (const b of document.querySelectorAll("button")) if ((b.getAttribute("aria-label") || "") === l) {
        const q = b.getBoundingClientRect();
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2) };
      }
      return null;
    }, label);
    if (!r) return false;
    await page.touchscreen.tap(r.x, r.y);
    return true;
  };

  const glanceRun = async (view) => {
    const out = { view, baselineDriftPct: null, arms: {}, cardsClearedDuringRun: 0 };
    // A fault card arriving mid-run takes every flank station off the screen
    // (visible = !hidden), so an arm that finds no button would be scored as a
    // null and read like a dead control. Clear before every arm and COUNT it —
    // the count is itself a finding about driving with this HUD.
    const armReady = async () => {
      out.cardsClearedDuringRun += await clearCards();
      if (await lessonOver()) { out.refused = "lesson ended mid-run"; return false; }
      await burst(26, 18);                 // every glance arm is taken ON THE MOVE
      return true;
    };
    // The world is MOVING, so two frames differ with no input at all. That is
    // the floor every arm below is judged against, and on a driving car it is
    // not small.
    if (!(await armReady())) return out;
    const b0 = await shotBand(); await page.waitForTimeout(400);
    const b1 = await shotBand();
    out.baselineDriftPct = +(diffFraction(b0, b1) * 100).toFixed(1);

    // POSITIVE CONTROL — a HELD key. This is the 83.5 % the brief quotes.
    let before = await shotBand();
    await page.evaluate(() => window.__driveRig.press("KeyQ"));
    await page.waitForTimeout(400);
    let after = await shotBand();
    out.arms.heldQ = +(diffFraction(before, after) * 100).toFixed(1);
    await page.evaluate(() => window.__driveRig.release("KeyQ"));
    await page.waitForTimeout(1400);

    for (const [name, label] of [["Л", "Поглед в лявото огледало"], ["З", "Поглед в огледалото за задно виждане"], ["Д", "Поглед в дясното огледало"]]) {
      // by real touch
      if (!(await armReady())) return out;
      before = await shotBand();
      const okT = await touchByLabel(label);
      await page.waitForTimeout(400);              // INSIDE the 0.9 s hold
      after = await shotBand();
      out.arms[`${name}-touch`] = okT ? +(diffFraction(before, after) * 100).toFixed(1) : null;
      await page.waitForTimeout(1500);
      // by DOM click, and one sample PAST the hold — the cell that reads 0 and
      // is not a defect.
      if (!(await armReady())) return out;
      before = await shotBand();
      const okC = await tapByLabel(label);
      await page.waitForTimeout(400);
      after = await shotBand();
      out.arms[`${name}-click`] = okC ? +(diffFraction(before, after) * 100).toFixed(1) : null;
      await page.waitForTimeout(1600);
      before = await shotBand();
      await tapByLabel(label);
      await page.waitForTimeout(1800);             // PAST the hold — expect baseline
      after = await shotBand();
      out.arms[`${name}-past-hold`] = +(diffFraction(before, after) * 100).toFixed(1);
      await page.waitForTimeout(900);
    }
    return out;
  };

  const armReadyOuter = async () => { await clearCards(); await burst(26, 18); };

  // `--layout-only` re-runs just the four surface states on a lesson that has a
  // demonstration, without paying for the glance/camera/pad passes again.
  if (process.argv.includes("--layout-only")) {
    all.push(rec);
    writeFileSync(`${OUT}/wave3-${TAG}.json`, JSON.stringify(all, null, 1));
    await context.close();
    continue;
  }

  if (band) {
    console.log(`  GLANCE band ${band.width}x${band.height} at ${band.x},${band.y}`);
    const cockpit = await glanceRun("cockpit");
    rec.glanceCockpit = cockpit;
    console.log(`  COCKPIT drift ${cockpit.baselineDriftPct}% · heldQ ${cockpit.arms.heldQ}% · ` +
      Object.entries(cockpit.arms).filter(([k]) => k !== "heldQ").map(([k, v]) => `${k} ${v}%`).join(" · "));

    // → CHASE. The camera control is exercised here in PIXELS: switching view
    //   must change the frame, and by more than a moving world does on its own.
    await armReadyOuter();
    const beforeCam = await shotBand();
    const camBefore = await page.evaluate(() => document.querySelector('[data-sim-camera]')?.getAttribute("data-sim-camera") ?? null);
    // The rail cell says what is LIVE: «Изглед (камера) — сега: кабина». Match
    // the prefix, not the whole string — the suffix is the state it reports.
    const camSwitched = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) if (/^Изглед/.test(b.getAttribute("aria-label") || "")) { b.click(); return true; }
      return false;
    });
    await page.waitForTimeout(500);
    // The rail's «Изглед» opens a popover in the shipped build — pick «Отвън».
    const chosen = await page.evaluate(() => {
      for (const b of document.querySelectorAll("button")) {
        const t = (b.textContent || "") + (b.getAttribute("aria-label") || "");
        if (/Отвън/.test(t)) { b.click(); return "Отвън"; }
      }
      return null;
    });
    await page.waitForTimeout(1500);
    const afterCam = await shotBand();
    const camPct = +(diffFraction(beforeCam, afterCam) * 100).toFixed(1);
    const camMode = await page.evaluate(() => document.querySelector("[data-sim-camera]")?.getAttribute("data-sim-camera")
      ?? window.__camProbe?.mode ?? null);
    rec.camera = { railFound: camSwitched, chose: chosen, pixelChangePct: camPct, modeBefore: camBefore, mode: camMode };
    console.log(`  CAMERA rail ${camSwitched} · chose ${chosen ?? "(cycle)"} · mode ${camBefore} → ${camMode} · ${camPct}% of the band changed`);
    await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__chase.png`, timeout: 120_000 });

    const chase = await glanceRun("chase");
    rec.glanceChase = chase;
    console.log(`  CHASE   drift ${chase.baselineDriftPct}% · heldQ ${chase.arms.heldQ}% · ` +
      Object.entries(chase.arms).filter(([k]) => k !== "heldQ").map(([k, v]) => `${k} ${v}%`).join(" · "));
  }

  // 7 · WAVE-1 REGRESSIONS
  //   (a) THE ABSOLUTE PAD RETURNS EXACTLY 0.000 km/h AT DEAD CENTRE.
  //   The car has to be STOPPED first or this measures a roll-out, not a pad:
  //   the first version of this file read 21.4 km/h and 0.218 throttle two and
  //   a half seconds after `stop()` and nearly filed it as a regression. The
  //   pad's zero is `box.top + box.height/2` (seatDriveCentre), so the test is
  //   a thumb planted exactly there, HELD, with the car already at rest.
  // A FRESH CAR, DELIBERATELY. By this point the sweep has driven for minutes
  // and `__driveRig` shapes SPEED but not STEERING, so the car reliably ends up
  // nose-first in a building — where nothing moves it, not the touch pad, not a
  // held KeyW, not the rig's own synthetic pad. The first version of this file
  // measured the pad in that state and was one line away from filing „the thumb
  // cannot drive the car" as a regression. l0 spawns ready-to-drive, so a
  // reload is the cheapest pristine standing start there is.
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.waitForFunction(() => window.__driveRig?.ready === true, null, { timeout: 150_000 });
  await page.waitForTimeout(2500);
  await clearCards();
  await page.waitForTimeout(500);
  const restKmh = await page.evaluate(() => window.__driveRig?.last?.speedKmh ?? -1);
  // `DriveRigSample.throttle` IS THE COMMAND THE RIG INJECTED, not the merged
  // axis — rig.ts says so in its own comment ("0/0/0 when not scripted"). So it
  // can say nothing at all about a thumb on the touch pad, and reading it as if
  // it could is how this file first reported the pad as "not exactly zero". The
  // only honest end-to-end evidence is the SPEED with the thumb held down, plus
  // a POSITIVE CONTROL: a thumb ABOVE centre must make the car go, or "0.000 at
  // dead centre" is indistinguishable from a pad that does nothing at all.
  const padZero = await page.evaluate(async () => {
    // THE DRIVE PAD, not the steering pad — `driveAxisLabelBg()` always opens
    // with „Ход". The first version of this probe matched the steering pad and
    // reported its label as if it were the throttle's.
    const pad = [...document.querySelectorAll("[aria-label]")]
      .find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
    if (!pad) return { found: false };
    const r = pad.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;   // the pad's OWN zero
    const id = 7;
    const mk = (t, x, y) => new PointerEvent(t, { pointerId: id, pointerType: "touch", clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true });
    const speed = () => window.__driveRig?.last?.speedKmh ?? null;
    // The knob is what the STUDENT sees; driveApply writes an inline
    // translateY in PIXELS on it, so a `-50%` match is some other wrapper.
    const knobOf = () => [...pad.querySelectorAll("*")].find((e) => /translateY\([-\d.]+px\)/.test(e.style.transform || "")) ?? null;

    // ── ARM 1: DEAD CENTRE, HELD ──────────────────────────────────────────
    const kmhBefore = speed();
    pad.dispatchEvent(mk("pointerdown", cx, cy));
    await new Promise((r2) => setTimeout(r2, 2500));          // HELD, not tapped
    const k1 = knobOf();
    const centre = {
      kmhBefore, kmhHeld: speed(),
      knobTransform: k1 ? k1.style.transform : null,
      knobBorder: k1 ? k1.style.borderColor : null,
    };
    pad.dispatchEvent(mk("pointerup", cx, cy));
    await new Promise((r2) => setTimeout(r2, 800));

    // ── ARM 2: POSITIVE CONTROL — a thumb ABOVE centre must make it GO ────
    pad.dispatchEvent(mk("pointerdown", cx, cy - Math.min(70, r.height / 2 - 6)));
    await new Promise((r2) => setTimeout(r2, 2500));
    const k2 = knobOf();
    const up = { kmhHeld: speed(), knobTransform: k2 ? k2.style.transform : null, knobBorder: k2 ? k2.style.borderColor : null };
    pad.dispatchEvent(mk("pointerup", cx, cy - 70));
    await new Promise((r2) => setTimeout(r2, 1500));

    const s = window.__driveRig?.last ?? {};
    return {
      found: true, label: (pad.getAttribute("aria-label") || "").slice(0, 34), centre, up,
      kmhAfterRelease: speed(),
      // WAS THE WORLD STILL LIVE? `phase` goes to completed/aborted when the
      // lesson ends and `wallMs` stops advancing when anything pauses onTick.
      phase: s.phase ?? null, gear: s.gear ?? null, handbrakeOn: s.handbrakeOn ?? null,
      eventCount: s.eventCount ?? null, wallMs: s.wallMs ?? null,
    };
  });
  padZero.restKmhBeforeTouch = +restKmh.toFixed(3);
  rec.padDeadCentre = padZero;
  // EXACTLY ZERO means the thumb added nothing: the speed did not move off
  // rest, and the knob sat at translateY(0.0px) in the neutral colour.
  const c = padZero.centre ?? {};
  const exact = padZero.found && Math.abs(c.kmhHeld ?? 9) < 0.05 && /translateY\(0(\.0)?px\)/.test(c.knobTransform || "");
  const padLive = (padZero.up?.kmhHeld ?? 0) > 1;
  rec.padExactZero = exact; rec.padPositiveControl = padLive;
  console.log(`  PAD (rest ${restKmh.toFixed(3)} km/h) dead centre held 2.5 s → ${c.kmhHeld?.toFixed(3)} km/h · knob ${c.knobTransform} ${c.knobBorder} · ZERO: ${exact}`);
  console.log(`  PAD positive control — thumb ABOVE centre held 2.5 s → ${padZero.up?.kmhHeld?.toFixed(3)} km/h · knob ${padZero.up?.knobTransform} ${padZero.up?.knobBorder} · the pad is LIVE: ${padLive}`);
  console.log(`  PAD world state: phase=${padZero.phase} gear=${padZero.gear} handbrake=${padZero.handbrakeOn} events=${padZero.eventCount} lessonOver=${await lessonOver()}`);
  // CONTROL FOR THE CONTROL. If a HELD KEY cannot move the car from this state
  // either, then "the thumb does not move the car" is a fact about the car, not
  // about the pad, and must not be reported as a touch defect.
  await page.evaluate(() => window.__driveRig.press("KeyW"));
  await page.waitForTimeout(2500);
  const keyKmh = await page.evaluate(() => window.__driveRig?.last?.speedKmh ?? -1);
  await page.evaluate(() => window.__driveRig.release("KeyW"));
  rec.padKeyControl = +keyKmh.toFixed(3);
  console.log(`  KEY control — KeyW held 2.5 s from the same rest state → ${keyKmh.toFixed(3)} km/h`);

  await page.screenshot({ path: `${OUT}/shots/W3__${device.id}__pad.png`, timeout: 120_000 });

  //   (b) the page still does not scroll or pinch
  const scrollGate = await page.evaluate(() => {
    const de = document.documentElement;
    const before = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(500, 500);
    const after = { x: window.scrollX, y: window.scrollY };
    window.scrollTo(before.x, before.y);
    const vp = document.querySelector('meta[name="viewport"]')?.getAttribute("content") || "";
    return {
      widerThanClient: de.scrollWidth > de.clientWidth + 1,
      tallerThanClient: de.scrollHeight > de.clientHeight + 1,
      moved: after.x !== before.x || after.y !== before.y,
      viewportMeta: vp,
      userScalableLocked: /user-scalable\s*=\s*(no|0)/i.test(vp) || /maximum-scale\s*=\s*1/i.test(vp),
      touchAction: getComputedStyle(document.body).touchAction,
      overscroll: getComputedStyle(document.body).overscrollBehavior,
    };
  });
  rec.scrollGate = scrollGate;
  console.log(`  SCROLL/PINCH: ${JSON.stringify(scrollGate)}`);

  all.push(rec);
  writeFileSync(`${OUT}/wave3-${TAG}.json`, JSON.stringify(all, null, 1));
  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/wave3-${TAG}.json`, JSON.stringify(all, null, 1));

// ── the table the founder reads ─────────────────────────────────────────────
console.log(`\n${"=".repeat(90)}\nTEXT-OVER-CONTROL px² — THE PASS/FAIL (0 required in every state)`);
const states = ["driving", "deck-open", "deck+sheet", "sheet-open"];
console.log(`${"profile".padEnd(30)}${states.map((s) => s.padStart(12)).join("")}`);
const cell = (m, v) => (m?.suspect ? "SUSPECT" : String(v ?? "-"));
for (const r of all) {
  if (r.skipped) { console.log(`${r.device.padEnd(30)}  SKIPPED: ${r.skipped}`); continue; }
  console.log(`${r.device.padEnd(30)}${states.map((s) => cell(r.states[s], r.states[s]?.textOverControlPx2).padStart(12)).join("")}`);
}
console.log(`\nDEAD CONTROLS`);
for (const r of all) {
  if (r.skipped) continue;
  console.log(`${r.device.padEnd(30)}${states.map((s) => cell(r.states[s], r.states[s]?.dead?.length).padStart(12)).join("")}`);
}
console.log(`\nCONTROL-OVER-CONTROL OVERLAP px²`);
for (const r of all) {
  if (r.skipped) continue;
  console.log(`${r.device.padEnd(30)}${states.map((s) => cell(r.states[s], r.states[s]?.overlapPx2Total).padStart(12)).join("")}`);
}
console.log(`\nCOVERAGE on the STEADY DRIVING SCREEN (car moving)`);
console.log(`${"profile".padEnd(30)}${"km/h".padStart(8)}${"ink%".padStart(8)}${"tap%".padStart(8)}${"C-ink%".padStart(9)}${"C-tap%".padStart(9)}`);
for (const r of all) {
  if (r.skipped) continue;
  const d = r.states.driving; if (!d) continue;
  const c = d.coverage;
  console.log(`${r.device.padEnd(30)}${String(d.kmhAtCapture).padStart(8)}${String(c.inkPct).padStart(8)}${String(c.tapPct).padStart(8)}${String(c.inkCentrePct).padStart(9)}${String(c.tapCentrePct).padStart(9)}`);
}
console.log(`\nGLANCE, % of the road band that moved (cockpit / chase)`);
for (const r of all) {
  if (r.skipped || !r.glanceCockpit) continue;
  const c = r.glanceCockpit, h = r.glanceChase;
  const f = (o) => o ? `drift ${o.baselineDriftPct} · Q ${o.arms.heldQ} · Л ${o.arms["Л-touch"]}/${o.arms["Л-click"]} · З ${o.arms["З-touch"]}/${o.arms["З-click"]} · Д ${o.arms["Д-touch"]}/${o.arms["Д-click"]} · past-hold ${o.arms["Л-past-hold"]}/${o.arms["З-past-hold"]}/${o.arms["Д-past-hold"]}` : "-";
  console.log(`  ${r.device}\n     cockpit ${f(c)}\n     chase   ${f(h)}`);
}
console.log(`\nwrote ${OUT}/wave3-${TAG}.json and ${OUT}/shots/`);
