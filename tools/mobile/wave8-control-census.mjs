// =============================================================================
// wave8-control-census.mjs — THE BEFORE-STATE OF THE CONTROL SYSTEM.
//
// WHAT THIS MEASURES, AND WHY IT IS NOT ANOTHER OVERLAP PROBE.
//
// The founder's ruling is „the buttons need absolute redesign". A redesign
// needs a census, not a defect list: for EVERY control on the driving screen,
// where it is, what it paints, which third of the screen it occupies, whether
// a thumb can reach it, and — the currency the reference screenshot is really
// about — how much of the DRIVING VIEW the UI takes away.
//
// FOUR THINGS NO PREVIOUS PROBE IN THIS PROJECT HAS DONE:
//
//   1. EFFECTIVE OPACITY, not computed opacity. A control inside a 0.35-opacity
//      wrapper reads `opacity: 1` on itself. The census multiplies the chain up
//      to <body> so „invisible edge zone" is a measured fact and not a guess.
//
//   2. INK vs INTERCEPT, sampled on the same grid. Every 6 CSS px of the canvas
//      is probed with elementFromPoint and classified: road, a control that
//      PAINTS, a control that paints NOTHING (an invisible edge zone), or a
//      panel. Doc 91 §F says ink is already at 3.2 % and tap-interception is at
//      22-32 % — „the second coverage currency, and the damning one". This
//      instrument reports both from one pass so they cannot drift apart.
//
//   3. A THUMB MODEL WITH ITS PIVOT AND RADII WRITTEN DOWN. 6.04 CSS px per mm
//      on this device class (460 ppi / dpr 3 / 25.4). Reach classes are stated
//      in MILLIMETRES, converted once, so the numbers can be argued with.
//
//   4. THE ARC UNDER A MOVING VIEWPORT, per station, with SPACING deltas. §D6
//      root-caused it; §R never re-fired it. A control that moves is bad; an
//      arc whose stations move by DIFFERENT amounts is the defect he described
//      as „it is not stabilized".
//
// THREE STATES, because 5 of 10 controls die in two of them (§I11, §R2·W2):
//   A · driving      — the hint dismissed, nothing raised
//   B · card up      — an instruction panel expanded over the rail
//   C · sheet open   — the ⚙ car-controls sheet
//
// GATE, per the rule §O.5 installed: hasCanvas === true AND a non-zero canvas
// rect AND a mounted [data-hud="touch-controls"] before a single number is
// believed. Six probes in this project have reported „0 defects" off a page
// with no simulator on it.
//
//   node wave8-control-census.mjs --base https://…trycloudflare.com
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit, chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const ENGINE_NAME = arg("engine", "webkit");
const TAG = arg("tag", "census");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave8-census`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader", "--block-fullscreen"];

const launcher = ENGINE_NAME === "chromium" ? chromium : webkit;
const browser = await launcher.launch(ENGINE_NAME === "chromium" ? { args: GL } : {});
console.log(`[w8-census] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " (the founder's engine — primary)" : " (SECOND OPINION, not an iPhone)"}`);

// ONE SIGN-IN FOR THE WHOLE SWEEP — /login is budgeted 10 per 10 min per IP.
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w8-census] signed in ONCE as ${EMAIL} against ${BASE}`);

// -----------------------------------------------------------------------------
// THE PAGE-SIDE CENSUS. One function, serialised into the page, so state A, B
// and C are measured by exactly the same code and can be subtracted.
// -----------------------------------------------------------------------------
const CENSUS = (opts) => {
  const { pxPerMm, gridStep } = opts;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // ── the canvas: the DRIVING VIEW, and the denominator of every share ──────
  let canvas = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!canvas || r.width * r.height > canvas.w * canvas.h) {
      canvas = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), el: c };
    }
  }
  const canvasEl = canvas?.el ?? null;
  if (canvas) delete canvas.el;

  // ── EFFECTIVE opacity: the product of the chain, not the element's own ────
  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const v = Number(getComputedStyle(n).opacity);
      if (Number.isFinite(v)) o *= v;
      if (o <= 0.001) return 0;
    }
    return Math.round(o * 1000) / 1000;
  };

  // ── does this element PAINT anything of its own? ──────────────────────────
  const alphaOf = (colour) => {
    const m = /rgba?\(([^)]+)\)/.exec(colour || "");
    if (!m) return 0;
    const p = m[1].split(",").map((s) => Number(s.trim()));
    return p.length >= 4 ? p[3] : 1;
  };
  const paintOf = (el) => {
    const cs = getComputedStyle(el);
    const bgA = alphaOf(cs.backgroundColor);
    const hasBorder =
      ["Top", "Right", "Bottom", "Left"].some(
        (s) => parseFloat(cs[`border${s}Width`]) > 0.4 && alphaOf(cs[`border${s}Color`]) > 0.02,
      );
    const hasImage = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0);
    return { bgAlpha: Math.round(bgA * 100) / 100, hasBorder, hasImage, hasShadow, ownText };
  };

  // ── THE THUMB MODEL. Stated, not assumed. ────────────────────────────────
  // Pivot = the thumb's MCP joint where the hand grips. Landscape: a two-handed
  // grip, one pivot per end, at the outer edge and 38 % up from the bottom.
  // Portrait: a two-handed grip is what a driving game gets, so the pivots sit
  // at the bottom corners, 9 mm in and 9 mm up.
  const landscape = vw > vh;
  const mm = (v) => v * pxPerMm;
  const pivots = landscape
    ? [
        { id: "L", x: mm(4), y: vh - mm(0.38 * (vh / pxPerMm)) },
        { id: "R", x: vw - mm(4), y: vh - mm(0.38 * (vh / pxPerMm)) },
      ]
    : [
        { id: "L", x: mm(9), y: vh - mm(9) },
        { id: "R", x: vw - mm(9), y: vh - mm(9) },
      ];
  // Radii in mm: the literature's comfortable sweep, then stretch, then regrip.
  const BANDS = [
    { id: "easy", mm: 45 },
    { id: "reach", mm: 60 },
    { id: "stretch", mm: 75 },
  ];
  const thumbClass = (cx, cy) => {
    let best = { band: "regrip", mm: Infinity, pivot: null };
    for (const p of pivots) {
      const d = Math.hypot(cx - p.x, cy - p.y) / pxPerMm;
      if (d < best.mm) {
        const band = BANDS.find((b) => d <= b.mm)?.id ?? "regrip";
        best = { band, mm: Math.round(d * 10) / 10, pivot: p.id };
      }
    }
    return best;
  };

  const thirdX = (cx) => (cx < vw / 3 ? "left" : cx < (2 * vw) / 3 ? "centre" : "right");
  const thirdY = (cy) => (cy < vh / 3 ? "top" : cy < (2 * vh) / 3 ? "middle" : "bottom");

  // ── EVERY CONTROL ON THE SCREEN ──────────────────────────────────────────
  const SEL = 'button,[role="slider"],[role="menuitem"],[role="switch"],a[href],input,select,[tabindex]:not([tabindex="-1"])';
  const seen = new Set();
  const controls = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    // the sr-only skip link is a 1x1 clipped box BY DESIGN — excluded, loudly
    if (r.width <= 2 && r.height <= 2) continue;
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const paints = paintOf(el);
    const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 46);
    const t = thumbClass(cx, cy);
    // ── HOW MUCH OF ITS OWN BOX DOES IT PAINT? The „invisible edge zone"
    //    question, answered per control instead of per screen. Sampled on the
    //    control's own rect, topmost-element-wins, so a ghost pad under a
    //    22 px mark reports the mark and nothing else.
    let inkShare = null;
    {
      const step = Math.max(4, Math.round(Math.min(r.width, r.height) / 10));
      let n = 0, painted = 0;
      for (let yy = r.y + step / 2; yy < r.y + r.height; yy += step) {
        for (let xx = r.x + step / 2; xx < r.x + r.width; xx += step) {
          if (xx < 0 || yy < 0 || xx >= vw || yy >= vh) continue;
          const h = document.elementFromPoint(Math.round(xx), Math.round(yy));
          n += 1;
          if (!h) continue;
          const p2 = paintOf(h);
          if (effOpacity(h) > 0.02 && (p2.bgAlpha > 0.02 || p2.hasBorder || p2.hasImage || p2.ownText)) painted += 1;
        }
      }
      inkShare = n ? Math.round((painted / n) * 1000) / 10 : null;
    }
    controls.push({
      inkSharePct: inkShare,
      label: label || el.tagName,
      hud: el.closest("[data-hud]")?.getAttribute("data-hud") ?? null,
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), cx, cy,
      opacity: effOpacity(el),
      ownOpacity: Math.round(Number(cs.opacity) * 100) / 100,
      pointerEvents: cs.pointerEvents,
      paints,
      // does it paint AT ALL? an invisible edge zone paints nothing of its own
      // and holds no visible text either.
      inkless: paints.bgAlpha <= 0.02 && !paints.hasBorder && !paints.hasImage && effOpacity(el) <= 0.02,
      thirdX: thirdX(cx), thirdY: thirdY(cy),
      thumb: t.band, thumbMm: t.mm, thumbPivot: t.pivot,
      under44: Math.min(r.width, r.height) < 43.5,
      self: !!hit && (hit === el || el.contains(hit) || el.contains(hit?.parentElement ?? null)),
      onTop: hit ? (hit.closest("[aria-label]")?.getAttribute("aria-label") || hit.closest("[data-hud]")?.getAttribute("data-hud") || (hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) || hit.tagName) : null,
    });
  }

  // ── THE GRID. Ink vs intercept vs road, over the DRIVING VIEW. ────────────
  let grid = null;
  if (canvas) {
    const x0 = Math.max(0, canvas.x), y0 = Math.max(0, canvas.y);
    const x1 = Math.min(vw, canvas.x + canvas.w), y1 = Math.min(vh, canvas.y + canvas.h);
    let total = 0, road = 0, inkCtl = 0, ghostCtl = 0, panel = 0, otherInk = 0;
    let midTotal = 0, midUi = 0;          // centre horizontal third of the canvas
    let boxTotal = 0, boxUi = 0;          // the centre 50 % x 50 % box
    const bx0 = x0 + (x1 - x0) * 0.25, bx1 = x0 + (x1 - x0) * 0.75;
    const by0 = y0 + (y1 - y0) * 0.25, by1 = y0 + (y1 - y0) * 0.75;
    const my0 = y0 + (y1 - y0) / 3, my1 = y0 + (2 * (y1 - y0)) / 3;
    for (let y = y0 + gridStep / 2; y < y1; y += gridStep) {
      for (let x = x0 + gridStep / 2; x < x1; x += gridStep) {
        const hit = document.elementFromPoint(Math.round(x), Math.round(y));
        total += 1;
        const inMid = y >= my0 && y < my1;
        const inBox = x >= bx0 && x < bx1 && y >= by0 && y < by1;
        if (inMid) midTotal += 1;
        if (inBox) boxTotal += 1;
        if (!hit || hit === canvasEl || hit === document.body || hit === document.documentElement) { road += 1; continue; }
        const ctl = hit.closest(SEL);
        const p = paintOf(hit);
        const o = effOpacity(hit);
        const paintsHere = o > 0.02 && (p.bgAlpha > 0.02 || p.hasBorder || p.hasImage || p.ownText);
        if (ctl) { if (paintsHere) inkCtl += 1; else ghostCtl += 1; }
        else if (paintsHere) panel += 1;
        else { road += 1; continue; }   // a transparent non-control layer is road
        if (inMid) midUi += 1;
        if (inBox) boxUi += 1;
      }
    }
    const pc = (n) => Math.round((n / Math.max(1, total)) * 1000) / 10;
    grid = {
      step: gridStep, samples: total,
      roadPct: pc(road),
      uiPct: Math.round(((inkCtl + ghostCtl + panel) / Math.max(1, total)) * 1000) / 10,
      inkControlPct: pc(inkCtl),
      ghostControlPct: pc(ghostCtl),
      panelPct: pc(panel),
      interceptPct: Math.round(((inkCtl + ghostCtl + panel) / Math.max(1, total)) * 1000) / 10,
      middleThirdUiPct: Math.round((midUi / Math.max(1, midTotal)) * 1000) / 10,
      centreBoxUiPct: Math.round((boxUi / Math.max(1, boxTotal)) * 1000) / 10,
    };
  }

  // ── THE TWO BOXES THAT CONTEND FOR THE SAME STRIP ────────────────────────
  const boxOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const strips = {
    topRail: boxOf('[data-hud="top-rail"]'),
    notifyPeek: boxOf('[data-hud="notify-column"]'),
    overlayPanel: boxOf('[data-sim-overlay-state="open"], [data-sim-overlay][data-sim-overlay-state]:not([data-sim-overlay-state="peek"])'),
    sheet: boxOf('[role="toolbar"][aria-label="Контроли на автомобила"]'),
    dash: boxOf('[aria-label="Табло на автомобила"]'),
  };

  return {
    vw, vh, canvas, controls, grid, strips,
    simVh: getComputedStyle(document.documentElement).getPropertyValue("--sim-vh").trim() || null,
    visualViewportH: window.visualViewport ? Math.round(window.visualViewport.height) : null,
    pivots: pivots.map((p) => ({ id: p.id, x: Math.round(p.x), y: Math.round(p.y) })),
    bodyText: (document.body.innerText || "").replace(/\s+/g, " ").trim().slice(0, 200),
  };
};

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  const rec = {
    device: device.id, label: device.label, orientation: device.orientation,
    inset: insetBanner(device, inset), viewport: { w: device.width, h: device.height }, engine: ENGINE_NAME,
  };
  console.log(`\n${"=".repeat(100)}\n${device.label}\n  ${rec.inset}`);

  // 6.04 CSS px per mm — 460 ppi / dpr 3 / 25.4. Same conversion doc 91 uses
  // when it calls a 44 px target „7.3 mm".
  const PX_PER_MM = 6.04;
  const census = (label) => page.evaluate(CENSUS, { pxPerMm: PX_PER_MM, gridStep: 6 }).then((r) => ({ state: label, ...r }));

  const tapAt = async (x, y) => {
    // A real touch, not .click() — §I2's whole point.
    await page.touchscreen.tap(x, y).catch(async () => { await page.mouse.click(x, y).catch(() => {}); });
    await sleep(420);
  };
  const tapText = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll('button,[role="menuitem"],a')) {
        if (!rx.test((el.textContent || "").replace(/\s+/g, " ").trim())) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), text: (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 34) };
      }
      return null;
    }, re.source ?? re);
    if (!c) return null;
    await tapAt(c.x, c.y);
    return c;
  };
  const tapLabel = async (re) => {
    const c = await page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll("button,[aria-label]")) {
        if (!rx.test(el.getAttribute("aria-label") || "")) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), label: el.getAttribute("aria-label").slice(0, 40) };
      }
      return null;
    }, re.source ?? re);
    if (!c) return null;
    await tapAt(c.x, c.y);
    return c;
  };

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(5200);

    // ── THE GATE ────────────────────────────────────────────────────────────
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      }
      return {
        hasCanvas: best !== null, canvas: best,
        url: location.pathname + location.search,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || ""),
      };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · touchControls ${gate.touchControls} · url ${gate.url} · loading ${gate.loading}`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || gate.canvas.h < 40 || gate.loading || !gate.touchControls) {
      rec.fatal = "NO LIVE CANVAS / NO TOUCH CONTROLS — refusing to report geometry";
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec); writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1)); await context.close(); continue;
    }

    // ── dismiss the first-run hint the way a student does ───────────────────
    for (let i = 0; i < 6; i += 1) {
      const hit = await tapText(/^(Разбрах|Продължи|Започни|Ясно)$/);
      if (!hit) break;
      await sleep(450);
    }
    await sleep(1000);

    // ── STATE A · DRIVING ───────────────────────────────────────────────────
    rec.A = await census("A-driving");
    await page.screenshot({ path: `${OUT}/shots/${device.id}__A-driving.png`, timeout: 120_000 }).catch(() => {});
    printState(rec.A, "A · DRIVING");

    // ── STATE B · THE PANEL EXPANDED. §I11's residue, verbatim: „every dead
    //    control answers the expanded instruction panel". «Защо» is the
    //    expander (SimOverlay.tsx:493 `aria-expanded={open}`), and expanding is
    //    what a student does when told to — it is the checklist, not a stray
    //    tap. Confirmed by aria-expanded, not by hope.
    const why = await tapText(/^(Защо|ЗАЩО)$/);
    await sleep(1100);
    rec.cardTrigger = {
      why,
      expanded: await page.evaluate(() => document.querySelector('[aria-expanded="true"]') !== null),
      panelText: await page.evaluate(() => {
        const p = document.querySelector('[data-sim-overlay-body], [data-hud="notify-column"]');
        return p ? (p.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120) : null;
      }),
    };
    console.log(`  STATE B · «Защо» ${why ? "pressed" : "NOT FOUND"} · aria-expanded=true present: ${rec.cardTrigger.expanded} · panel says „${rec.cardTrigger.panelText}"`);
    rec.B = await census("B-card");
    await page.screenshot({ path: `${OUT}/shots/${device.id}__B-card.png`, timeout: 120_000 }).catch(() => {});
    printState(rec.B, "B · CARD UP");

    // ── STATE C · THE ⚙ SHEET ───────────────────────────────────────────────
    const sheet = await tapLabel(/Контроли на автомобила/);
    await sleep(900);
    rec.sheetTrigger = sheet;
    rec.C = await census("C-sheet");
    await page.screenshot({ path: `${OUT}/shots/${device.id}__C-sheet.png`, timeout: 120_000 }).catch(() => {});
    printState(rec.C, "C · SHEET OPEN");

    // close it again before the arc test
    if (sheet) await tapAt(sheet.x, sheet.y);
    await sleep(700);

    // ── THE ARC UNDER A MOVING VIEWPORT ─────────────────────────────────────
    // Safari's URL bar sliding = a viewport-height change. The app resolves
    // ARC_RISE against that height, so the STATIONS MOVE — and by different
    // amounts, which is the „it is not stabilized" complaint.
    const stationsAt = () => page.evaluate(() => {
      const out = {};
      for (const el of document.querySelectorAll("button,[role='slider'],[aria-label]")) {
        const l = el.getAttribute("aria-label");
        if (!l) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        const k = l.slice(0, 44);
        if (out[k]) continue;
        out[k] = { cx: Math.round(r.x + r.width / 2), cy: Math.round(r.y + r.height / 2) };
      }
      return { h: window.innerHeight, vvh: window.visualViewport ? Math.round(window.visualViewport.height) : null, out };
    });
    const base = await stationsAt();
    const shifts = [];
    for (const delta of [-44, -90]) {
      await page.setViewportSize({ width: device.width, height: device.height + delta });
      await sleep(1400);
      const now = await stationsAt();
      const moved = [];
      for (const [k, v] of Object.entries(now.out)) {
        const b = base.out[k];
        if (!b) continue;
        moved.push({ label: k, dy: v.cy - b.cy, dx: v.cx - b.cx, from: b.cy, to: v.cy });
      }
      moved.sort((a, b2) => Math.abs(b2.dy) - Math.abs(a.dy));
      const ds = moved.map((m) => m.dy);
      shifts.push({
        delta, innerHeight: now.h, visualViewportH: now.vvh,
        movedCount: ds.filter((d) => Math.abs(d) > 1).length, totalControls: moved.length,
        minDy: Math.min(...ds), maxDy: Math.max(...ds),
        spread: Math.max(...ds) - Math.min(...ds),
        rows: moved,
      });
      console.log(`  ARC · viewport ${delta} px → ${ds.filter((d) => Math.abs(d) > 1).length}/${moved.length} controls moved · dy ${Math.min(...ds)}..${Math.max(...ds)} · SPREAD ${Math.max(...ds) - Math.min(...ds)} px`);
      for (const m of moved.slice(0, 8)) console.log(`        «${m.label}» y ${m.from} → ${m.to}  (${m.dy >= 0 ? "+" : ""}${m.dy})`);
    }
    await page.setViewportSize({ width: device.width, height: device.height });
    rec.arcShift = shifts;
  } catch (error) {
    rec.error = String(error?.message || error).split("\n")[0];
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}

function printState(s, title) {
  console.log(`  --- ${title} · ${s.controls.length} controls · canvas ${JSON.stringify(s.canvas)} ---`);
  if (s.grid) {
    console.log(`  COVER · road ${s.grid.roadPct}% · UI intercepts ${s.grid.interceptPct}% (ink-controls ${s.grid.inkControlPct}% · GHOST controls ${s.grid.ghostControlPct}% · panels ${s.grid.panelPct}%) · middle third ${s.grid.middleThirdUiPct}% · centre box ${s.grid.centreBoxUiPct}%`);
  }
  if (s.strips) {
    console.log(`  STRIP · top-rail ${JSON.stringify(s.strips.topRail)} · notify ${JSON.stringify(s.strips.notifyPeek)} · panel ${JSON.stringify(s.strips.overlayPanel)} · sheet ${JSON.stringify(s.strips.sheet)} · dash ${JSON.stringify(s.strips.dash)}`);
  }
  const dead = s.controls.filter((c) => !c.self);
  console.log(`  DEAD  · ${dead.length}/${s.controls.length} controls do not answer their own centre`);
  for (const c of dead) console.log(`        «${c.label}» [${c.x},${c.y},${c.w}x${c.h}] → answered by «${c.onTop}»`);
  const byBand = {};
  for (const c of s.controls) byBand[c.thumb] = (byBand[c.thumb] ?? 0) + 1;
  console.log(`  THUMB · ${Object.entries(byBand).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  const mid = s.controls.filter((c) => c.thirdY === "middle");
  console.log(`  BAND  · ${mid.length}/${s.controls.length} controls in the MIDDLE vertical third${mid.length ? `: ${mid.map((c) => c.label.slice(0, 18)).join(", ")}` : ""}`);
  for (const c of s.controls) {
    console.log(
      `        «${c.label}» [${c.x},${c.y},${c.w}x${c.h}] op ${c.opacity} ink ${c.inkSharePct}% · ${c.thirdX}/${c.thirdY} · thumb ${c.thumb} ${c.thumbMm}mm(${c.thumbPivot}) · ${c.under44 ? "UNDER44 " : ""}${c.self ? "self" : `DEAD→${c.onTop}`}`,
    );
  }
}

writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
console.log(`\n[w8-census] wrote ${OUT}/${TAG}.json`);
await browser.close();
