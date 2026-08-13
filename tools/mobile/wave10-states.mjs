// =============================================================================
// wave10-states.mjs — IS ANY CONTROL BURIED, IN ANY STATE? AND WHAT DOES THE
// SCREEN ACTUALLY LOOK LIKE WHILE THE CAR IS MOVING?
//
// THE BRIEF, items 2–4:
//   „elementFromPoint at every control centre, six profiles × idle / card up /
//    sheet open / menu open / «Напреднал» chosen. Before: 5 of 10 dead in
//    landscape, 3 of 10 portrait."
//   „Every profile, mid-drive, car moving, portrait AND landscape. Plus the
//    percentage of the driving view covered by UI, before and after."
//   plus the no-regression battery.
//
// FOUR THINGS THIS INSTRUMENT DOES THAT THE LAST ONE DID NOT, each because a
// previous wave got them wrong and reported a number about nothing:
//
//   1. IT PROVES IT REACHED THE STATE BEFORE IT MEASURES IT. Every state has a
//      WITNESS in the DOM — the sheet's own toolbar node, `aria-expanded` on
//      the menu button, the tier's own label. A state that was not entered is
//      printed as NOT ENTERED, never as „0 dead". Wave 9's dead-control census
//      found three bugs of exactly this shape IN ITSELF, and one of them was
//      reporting „0 dead" about an empty screen.
//
//   2. IT DISTINGUISHES DEAD FROM INERT. When a surface stops the car, the
//      driving controls go `opacity:0` + `pointer-events:none` and are NOT
//      live — nothing is buried because nothing is there. So the census counts
//      LIVE controls only (`pointer-events` reachable, effective opacity > 0.02)
//      and prints the paused flag next to every number. „Buried" without
//      „was the clock running" is not a finding.
//
//   3. IT MEASURES THE HIT RECT, NOT THE BORDER BOX. `[data-hud-close]` and the
//      deck pill carry their 44 px in an unpainted `::before`, so
//      `getBoundingClientRect()` on the button reports 134×27 and the thumb
//      gets 134×51. Wave 9 flagged «🎬Демонстрация ▸» as the one thing between
//      its report and a clean „0 under 44 px" and did not resolve it. This
//      walks outward from each control's centre with `elementFromPoint` until
//      the answer stops being that control — which is what a thumb actually
//      gets, including the truncation a neighbour imposes.
//
//   4. IT DRIVES. Coverage on a parked car is not the number he judges.
//
//   node wave10-states.mjs --base https://…trycloudflare.com --tag after
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
const BASE = arg("base", "https://rrp-barrel-listprice-qualified.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const ENGINE_NAME = arg("engine", "webkit");
const TAG = arg("tag", "after");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave10-states`;
mkdirSync(`${OUT}/shots`, { recursive: true });
const only = arg("device", null);
const devices = resolveDevices(only ? only.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GL = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-unsafe-swiftshader",
  "--block-fullscreen",
];

/** iPhone 16: 460 ppi ÷ dpr 3 ÷ 25.4 — the conversion doc 91 uses. */
const PX_PER_MM = 6.04;

/** iOS Safari refuses `requestFullscreen` for a <div>; Chromium grants it, and
 *  the app then takes an arm whose stage is welded to the glass. See the long
 *  block in wave10-anchor.mjs — the same emulation, for the same reason. */
const NO_FULLSCREEN = () => {
  for (const k of ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"]) {
    try {
      delete Element.prototype[k];
    } catch {
      /* reported by the PATH line */
    }
  }
  try {
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false, configurable: true });
  } catch {
    /* ditto */
  }
};

// ── THE CENSUS ──────────────────────────────────────────────────────────────
const CENSUS = (opts) => {
  const { pxPerMm, gridStep, wantGrid } = opts;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let canvas = null;
  let canvasEl = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!canvas || r.width * r.height > canvas.w * canvas.h) {
      canvas = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      canvasEl = c;
    }
  }

  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === "hidden" || cs.display === "none") return 0;
      const v = Number(cs.opacity);
      if (Number.isFinite(v)) o *= v;
      if (o <= 0.001) return 0;
    }
    return Math.round(o * 1000) / 1000;
  };
  const alphaOf = (colour) => {
    const m = /rgba?\(([^)]+)\)/.exec(colour || "");
    if (!m) return 0;
    const p = m[1].split(",").map((s) => Number(s.trim()));
    return p.length >= 4 ? p[3] : 1;
  };
  const paintOf = (el) => {
    const cs = getComputedStyle(el);
    return {
      bgAlpha: alphaOf(cs.backgroundColor),
      hasBorder: ["Top", "Right", "Bottom", "Left"].some(
        (s) => parseFloat(cs[`border${s}Width`]) > 0.4 && alphaOf(cs[`border${s}Color`]) > 0.02,
      ),
      hasImage: cs.backgroundImage && cs.backgroundImage !== "none",
      ownText: [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0),
    };
  };

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
  const BANDS = [
    { id: "easy", mm: 45 },
    { id: "reach", mm: 60 },
    { id: "stretch", mm: 75 },
  ];
  const thumbClass = (cx, cy) => {
    let best = { band: "regrip", mm: Infinity };
    for (const p of pivots) {
      const d = Math.hypot(cx - p.x, cy - p.y) / pxPerMm;
      if (d < best.mm) best = { band: BANDS.find((b) => d <= b.mm)?.id ?? "regrip", mm: Math.round(d * 10) / 10 };
    }
    return best;
  };

  const SEL = 'button,[role="slider"],[role="menuitem"],[role="switch"],a[href],input,select,[tabindex]:not([tabindex="-1"])';
  const answersFor = (x, y, el) => {
    const h = document.elementFromPoint(Math.round(x), Math.round(y));
    if (!h) return false;
    return h === el || el.contains(h) || h.closest(SEL) === el;
  };
  /** THE HIT RECT — walked, not read. An unpainted `::before` can carry a
   *  control's 44 px (rows C2/A6), and a neighbour can steal it back; only a
   *  walk sees both. Steps of 1 px out to 30 px past the border box. */
  const hitRect = (el, r) => {
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    if (!answersFor(cx, cy, el)) return null;
    const grow = (dx, dy, limit) => {
      let last = 0;
      for (let s = 1; s <= limit; s += 1) {
        const x = cx + dx * s;
        const y = cy + dy * s;
        if (x < 0 || y < 0 || x >= vw || y >= vh) break;
        if (!answersFor(x, y, el)) break;
        last = s;
      }
      return last;
    };
    const up = grow(0, -1, Math.ceil(r.height / 2) + 30);
    const down = grow(0, 1, Math.ceil(r.height / 2) + 30);
    const left = grow(-1, 0, Math.ceil(r.width / 2) + 30);
    const right = grow(1, 0, Math.ceil(r.width / 2) + 30);
    return { w: left + right + 1, h: up + down + 1 };
  };

  const seen = new Set();
  const controls = [];
  for (const el of document.querySelectorAll(SEL)) {
    if (seen.has(el)) continue;
    seen.add(el);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (r.width <= 2 && r.height <= 2) continue;
    const o = effOpacity(el);
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const self = !!hit && (hit === el || el.contains(hit) || hit.closest(SEL) === el);
    // LIVE = a student can actually press it right now. `pointer-events:none`
    // anywhere up the chain, or opacity 0, means the control is INERT, and an
    // inert control cannot be buried — there is nothing there to bury.
    let pe = "auto";
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (getComputedStyle(n).pointerEvents === "none") {
        pe = "none";
        break;
      }
      if (getComputedStyle(n).pointerEvents === "auto") break;
    }
    const live = o > 0.02 && cs.pointerEvents !== "none" && pe !== "none";
    const hr = live ? hitRect(el, r) : null;
    const label = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 46);
    const t = thumbClass(cx, cy);
    controls.push({
      label: label || el.tagName,
      hud: el.closest("[data-hud]")?.getAttribute("data-hud") ?? null,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      hitW: hr?.w ?? null,
      hitH: hr?.h ?? null,
      opacity: o,
      live,
      self,
      thumb: t.band,
      thumbMm: t.mm,
      under44: live ? Math.min(hr?.w ?? r.width, hr?.h ?? r.height) < 43.5 : false,
      offscreen:
        live &&
        (Math.round(r.x) < -0.5 ||
          Math.round(r.y) < -0.5 ||
          Math.round(r.x + r.width) > vw + 0.5 ||
          Math.round(r.y + r.height) > vh + 0.5),
      onTop: hit
        ? hit.closest("[aria-label]")?.getAttribute("aria-label") ||
          hit.closest("[data-hud]")?.getAttribute("data-hud") ||
          (hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) ||
          hit.tagName
        : null,
    });
  }

  // ── TEXT OVER A CONTROL, in px² ───────────────────────────────────────────
  let textOverControlPx2 = 0;
  const liveCtl = controls.filter((c) => c.live);
  for (const el of document.querySelectorAll("p,span,h1,h2,h3,li,label,div")) {
    if (el.closest(SEL)) continue;
    if (![...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0)) continue;
    if (effOpacity(el) <= 0.02) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    for (const c of liveCtl) {
      const ow = Math.max(0, Math.min(r.right, c.x + c.w) - Math.max(r.x, c.x));
      const oh = Math.max(0, Math.min(r.bottom, c.y + c.h) - Math.max(r.y, c.y));
      textOverControlPx2 += ow * oh;
    }
  }

  let grid = null;
  if (canvas && wantGrid) {
    const x0 = Math.max(0, canvas.x);
    const y0 = Math.max(0, canvas.y);
    const x1 = Math.min(vw, canvas.x + canvas.w);
    const y1 = Math.min(vh, canvas.y + canvas.h);
    let total = 0, road = 0, inkCtl = 0, ghostCtl = 0, panel = 0, midTotal = 0, midUi = 0, boxTotal = 0, boxUi = 0;
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
        if (!hit || hit === canvasEl || hit === document.body || hit === document.documentElement) {
          road += 1;
          continue;
        }
        const ctl = hit.closest(SEL);
        const p = paintOf(hit);
        const o = effOpacity(hit);
        const paintsHere = o > 0.02 && (p.bgAlpha > 0.02 || p.hasBorder || p.hasImage || p.ownText);
        if (ctl) {
          if (paintsHere) inkCtl += 1;
          else ghostCtl += 1;
        } else if (paintsHere) panel += 1;
        else {
          road += 1;
          continue;
        }
        if (inMid) midUi += 1;
        if (inBox) boxUi += 1;
      }
    }
    const pc = (n) => Math.round((n / Math.max(1, total)) * 1000) / 10;
    grid = {
      samples: total,
      roadPct: pc(road),
      interceptPct: Math.round(((inkCtl + ghostCtl + panel) / Math.max(1, total)) * 1000) / 10,
      inkControlPct: pc(inkCtl),
      ghostControlPct: pc(ghostCtl),
      panelPct: pc(panel),
      middleThirdUiPct: Math.round((midUi / Math.max(1, midTotal)) * 1000) / 10,
      centreBoxUiPct: Math.round((boxUi / Math.max(1, boxTotal)) * 1000) / 10,
    };
  }

  const boxOf = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width < 1 || r.height < 1 ? null : { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const speed = (() => {
    const el = document.querySelector('[aria-label^="Скорост "]');
    const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
    return m ? Number(m[1].replace(",", ".")) : null;
  })();

  return {
    vw,
    vh,
    canvas,
    controls,
    grid,
    textOverControlPx2: Math.round(textOverControlPx2),
    speedKmh: speed,
    // ── THE WITNESSES. A state is only measured if its own witness is present.
    witness: {
      paused: document.querySelector('[data-sim-touch-inert="on"]') !== null,
      sheet: boxOf('[role="toolbar"][aria-label="Контроли на автомобила"]') !== null,
      menu: (() => {
        const b = [...document.querySelectorAll("button")].find((n) => /Затвори менюто на урока|Меню на урока/.test(n.getAttribute("aria-label") || ""));
        return b ? b.getAttribute("aria-expanded") === "true" : null;
      })(),
      readMode: boxOf('[data-sim-overlay-state="open"]') !== null,
      card: !!document.querySelector('[data-hud="notify-column"]')?.textContent?.trim(),
      tier: (() => {
        const b = [...document.querySelectorAll("button,[role=menuitem]")].find((n) => /Ниво на помощта/.test((n.textContent || "") + (n.getAttribute("aria-label") || "")));
        return b ? (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60) : null;
      })(),
      clutch: !!document.querySelector('[aria-label="Съединител"]'),
    },
    strips: {
      topRail: boxOf('[data-hud="top-rail"]'),
      notifyColumn: boxOf('[data-hud="notify-column"]'),
      readMode: boxOf('[data-sim-overlay-state="open"]'),
      sheet: boxOf('[role="toolbar"][aria-label="Контроли на автомобила"]'),
      playMenu: boxOf('[role="menu"][aria-label="Меню на урока"]'),
    },
  };
};

const GRADED = [
  ["Мигач наляво", /^Мигач наляво/],
  ["Мигач надясно", /^Мигач надясно/],
  ["Огледало Д", /дясното огледало/],
  ["Огледало З", /задно виждане/],
  ["Огледало Л", /лявото огледало/],
  ["Клаксон", /^Клаксон/],
  ["Кола ⚙", /^Контроли на автомобила$/],
];

const launcher = ENGINE_NAME === "chromium" ? chromium : webkit;
const browser = await launcher.launch(ENGINE_NAME === "chromium" ? { args: GL } : {});
console.log(`[w10-states] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " (THE FOUNDER'S — quote the coverage table from this run)" : " (second opinion)"}`);
console.log(`[w10-states] base ${BASE} · route ${ROUTE}`);
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w10-states] signed in ONCE as ${EMAIL}`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    inset: insetBanner(device, inset),
    viewport: { w: device.width, h: device.height },
    states: {},
  };
  console.log(`\n${"=".repeat(104)}\n${device.label}\n  ${rec.inset}`);

  const census = (label, wantGrid = false) =>
    page.evaluate(CENSUS, { pxPerMm: PX_PER_MM, gridStep: 6, wantGrid }).then((r) => ({ state: label, ...r }));
  const centre = (re) =>
    page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll('button,[role="menuitem"],[aria-label]')) {
        const l = el.getAttribute("aria-label") || "";
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!rx.test(l) && !rx.test(t)) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        return { x: Math.round(q.x + q.width / 2), y: Math.round(q.y + q.height / 2), label: l || t };
      }
      return null;
    }, re.source ?? re);
  const press = async (re, note) => {
    const c = await centre(re);
    if (!c) {
      console.log(`         MISSED ${note}`);
      return { ok: false, note };
    }
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();
    await sleep(430);
    return { ok: true, note, at: c, label: c.label };
  };
  const clearCards = async () => {
    for (let i = 0; i < 8; i += 1) {
      const c = await centre(/^(Разбрах|Продължи|Започни|Ясно)$/);
      if (!c) return i;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(450);
    }
    return 8;
  };
  const report = (s, title, expect) => {
    const live = s.controls.filter((c) => c.live);
    const dead = live.filter((c) => !c.self);
    rec.states[s.state] = {
      entered: expect(s.witness),
      paused: s.witness.paused,
      liveControls: live.length,
      dead: dead.map((c) => ({ label: c.label, rect: [c.x, c.y, c.w, c.h], onTop: c.onTop, hud: c.hud })),
      under44: live.filter((c) => c.under44).map((c) => ({ label: c.label, box: [c.w, c.h], hit: [c.hitW, c.hitH] })),
      offscreen: live.filter((c) => c.offscreen).map((c) => c.label),
      textOverControlPx2: s.textOverControlPx2,
      strips: s.strips,
      grid: s.grid,
      witness: s.witness,
      speedKmh: s.speedKmh,
    };
    const e = rec.states[s.state];
    console.log(
      `  ${title.padEnd(26)} ${e.entered ? "ENTERED" : "⚠ NOT ENTERED"} · paused ${e.paused} · live ${e.liveControls} · DEAD ${e.dead.length} · <44px ${e.under44.length} · offscreen ${e.offscreen.length} · text-over-control ${e.textOverControlPx2} px²`,
    );
    for (const d of e.dead) console.log(`         DEAD «${d.label}» [${d.rect}] → «${d.onTop}»`);
    for (const u of e.under44) console.log(`         <44 «${u.label}» box ${u.box} hit ${u.hit}`);
    return e;
  };

  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(5200);
    const gate = await page.evaluate(() => {
      let best = null;
      for (const c of document.querySelectorAll("canvas")) {
        const r = c.getBoundingClientRect();
        const cs = getComputedStyle(c);
        if (cs.display === "none" || cs.visibility === "hidden") continue;
        if (!best || r.width * r.height > best.w * best.h) best = { w: Math.round(r.width), h: Math.round(r.height) };
      }
      const shell = document.querySelector("[data-sim-shell]");
      return {
        hasCanvas: best !== null,
        canvas: best,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        shellInlineH: shell ? shell.style.height || "" : null,
        loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || ""),
      };
    });
    rec.gate = gate;
    console.log(`  GATE · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · touchControls ${gate.touchControls} · shell height «${gate.shellInlineH}»`);
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || gate.loading || !gate.touchControls) {
      rec.fatal = "NO LIVE CANVAS / NO TOUCH CONTROLS — refusing to report geometry";
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
      await context.close();
      continue;
    }

    // ── PRE-DRIVE: the belt is still on the arc, so measure it there ────────
    await clearCards();
    await sleep(900);
    const pre = await census("predrive");
    const beltRow = pre.controls.find((c) => /Закопчай предпазния колан/.test(c.label));
    rec.beltAtRest = beltRow ? { rect: [beltRow.x, beltRow.y, beltRow.w, beltRow.h], mm: beltRow.thumbMm, band: beltRow.thumb, alive: beltRow.self, hud: beltRow.hud } : null;
    console.log(`  BELT · ${rec.beltAtRest ? `[${rec.beltAtRest.rect}] ${rec.beltAtRest.mm} mm ${rec.beltAtRest.band} · in ${rec.beltAtRest.hud} · ${rec.beltAtRest.alive ? "alive" : "DEAD"}` : "NOT ON SCREEN"}`);

    // ── THE WALK ───────────────────────────────────────────────────────────
    const walk = [];
    walk.push(await press(/Закопчай предпазния колан/, "belt (arc station)"));
    await sleep(400);
    walk.push(await press(/^Контроли на автомобила$/, "open the ⚙ dock"));
    await sleep(500);
    const sw = await page.evaluate(() => {
      const o = {};
      for (const b of document.querySelectorAll("button")) {
        const l = b.getAttribute("aria-label") || "";
        if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) o[l] = b.getAttribute("aria-pressed");
      }
      return o;
    });
    if (sw["Предпазен колан"] === "false") walk.push(await press(/^Предпазен колан$/, "belt (dock fallback)"));
    if (sw["Двигател"] === "false") walk.push(await press(/^Двигател$/, "engine"));
    if (sw["Ръчна спирачка"] === "true") walk.push(await press(/^Ръчна спирачка$/, "handbrake off"));
    await sleep(400);
    walk.push(await press(/^Затвори контролите$/, "close the ⚙ dock"));
    await sleep(600);
    await clearCards();
    rec.walk = walk.map((w) => ({ note: w.note, ok: w.ok, label: w.label ?? null }));

    // ══ STATE A · IDLE, CAR MOVING — the frame he judges + the coverage ═════
    const pad = await page.evaluate(() => {
      const p = [...document.querySelectorAll("[aria-label]")].find((e) => /^Ход/.test(e.getAttribute("aria-label") || ""));
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), h: Math.round(r.height), w: Math.round(r.width), top: Math.round(r.y), bottom: Math.round(r.bottom) };
    });
    rec.drivePad = pad;

    // ── REGRESSION · THE ABSOLUTE PAD READS EXACTLY 0 AT DEAD CENTRE ────────
    // Press and hold at the pad's own centre, change nothing, read the axis.
    if (pad) {
      await page.mouse.move(pad.x, pad.y);
      await page.mouse.down();
      await sleep(900);
      rec.absoluteZero = await page.evaluate(() => {
        const el = document.querySelector('[aria-label^="Ход"]');
        const now = el?.getAttribute("aria-valuenow");
        const sp = document.querySelector('[aria-label^="Скорост "]');
        const m = sp ? /Скорост (\d+(?:[.,]\d+)?)/.exec(sp.getAttribute("aria-label")) : null;
        return { valuenow: now === null || now === undefined ? null : Number(now), speedKmh: m ? Number(m[1].replace(",", ".")) : null };
      });
      await page.mouse.up();
      await sleep(500);
      console.log(`  ZERO · pad held at dead centre → aria-valuenow ${rec.absoluteZero.valuenow} · speed ${rec.absoluteZero.speedKmh} km/h`);
    }

    let moving = false;
    if (pad) {
      const ty = pad.y - Math.min(60, pad.h / 2 - 8);
      await page.mouse.move(pad.x, pad.y);
      await page.mouse.down();
      await page.mouse.move(pad.x, ty, { steps: 6 });
      await sleep(6200);
      const a = await census("A-idle-driving", true);
      moving = (a.speedKmh ?? 0) > 1;
      await page.screenshot({ path: `${OUT}/shots/${device.id}__driving.png`, timeout: 120_000 });
      report(a, "A · DRIVING (idle HUD)", (w) => !w.sheet && !w.readMode && !w.menu);
      rec.states["A-idle-driving"].movingKmh = a.speedKmh;
      console.log(`  COVER · road ${a.grid?.roadPct}% · UI intercepts ${a.grid?.interceptPct}% (ink ${a.grid?.inkControlPct}% · ghost ${a.grid?.ghostControlPct}% · panels ${a.grid?.panelPct}%) · middle third ${a.grid?.middleThirdUiPct}% · centre box ${a.grid?.centreBoxUiPct}% · ${a.speedKmh} km/h`);
      rec.graded = GRADED.map(([name, re]) => {
        const c = a.controls.find((x) => re.test(x.label));
        return c ? { name, rect: [c.x, c.y, c.w, c.h], mm: c.thumbMm, band: c.thumb, alive: c.self, live: c.live, under44: c.under44 } : { name, missing: true };
      });
      for (const g of rec.graded) {
        console.log(g.missing ? `         «${g.name}» NOT ON SCREEN` : `         «${g.name}» [${g.rect}] ${g.mm} mm ${g.band} · ${g.alive ? "alive" : "DEAD"}${g.under44 ? " UNDER44" : ""}`);
      }

      // ── REGRESSION · THE PEDAL SURVIVES A CARD ──────────────────────────
      // The thumb never lifts. A card arrives (or is summoned), is dismissed,
      // and the SAME held thumb must command the car again — the §I3
      // „inert, not gone" path. Recovery is driven by the next pointermove.
      const cardBefore = await centre(/^(Разбрах|Продължи|Ясно)$/);
      if (cardBefore) {
        await page.mouse.move(cardBefore.x, cardBefore.y);
        await page.mouse.down();
        await sleep(80);
        await page.mouse.up();
        await sleep(600);
      }
      await page.mouse.move(pad.x, ty + 2, { steps: 2 });
      await page.mouse.move(pad.x, ty, { steps: 2 });
      await sleep(2600);
      rec.pedalSurvivesCard = await page.evaluate(() => {
        const sp = document.querySelector('[aria-label^="Скорост "]');
        const m = sp ? /Скорост (\d+(?:[.,]\d+)?)/.exec(sp.getAttribute("aria-label")) : null;
        return { cardWasUp: true, speedKmh: m ? Number(m[1].replace(",", ".")) : null };
      });
      console.log(`  CARD · thumb never lifted, card dismissed → ${rec.pedalSurvivesCard.speedKmh} km/h`);

      // ── REGRESSION · EVERY BUTTON FIRES WITH A SECOND THUMB DOWN ────────
      // The steering thumb stays planted; a mouse press is a second pointer.
      // `useTapActivation`'s pointer path is what must answer.
      const horn = await centre(/^Клаксон/);
      if (horn) {
        const before = await page.evaluate(() => document.querySelector('[aria-label^="Клаксон"]')?.getAttribute("aria-pressed"));
        await page.mouse.move(horn.x, horn.y);
        await page.mouse.down();
        await sleep(260);
        const during = await page.evaluate(() => document.querySelector('[aria-label^="Клаксон"]')?.getAttribute("aria-pressed"));
        await page.mouse.up();
        rec.secondThumb = { control: "Клаксон", before, during, fired: before !== during || during === "true" };
        console.log(`  2ND  · «Клаксон» with the drive thumb still down → aria-pressed ${before} → ${during} · fired ${rec.secondThumb.fired}`);
      }
      await page.mouse.up();
      await sleep(700);
    }
    rec.moving = moving;

    // ── REGRESSION · THE REVERSE GUARD ─────────────────────────────────────
    // LAW 1: reverse needs a FRESH press below centre with the car braked. A
    // continuous drag down from a forward hold must NOT engage R.
    if (pad) {
      await page.mouse.move(pad.x, pad.y - 40);
      await page.mouse.down();
      await sleep(700);
      await page.mouse.move(pad.x, pad.y + 55, { steps: 10 });
      await sleep(1500);
      rec.reverseGuard = await page.evaluate(() => {
        // `Скоростен лост: <gearLabel>` — StatusDashboard's own accessible name
        // for the selector. It is the only place the driveline's live gear is
        // in the DOM on a compact stage.
        const g = document.querySelector('[aria-label^="Скоростен лост"]');
        const aria = g?.getAttribute("aria-label") ?? null;
        const txt = (document.querySelector('[data-hud="dash-dock"]')?.textContent || "").replace(/\s+/g, " ");
        return {
          gearAria: aria,
          dash: txt.slice(0, 90),
          reverseEngaged: /Скоростен лост:\s*R\b/.test(aria || ""),
        };
      });
      await page.mouse.up();
      await sleep(600);
      console.log(`  REV  · drag from forward-hold through centre to below → reverse engaged ${rec.reverseGuard.reverseEngaged} · «${rec.reverseGuard.gearAria}»`);
    }

    // ══ STATE B · A CARD IS UP ══════════════════════════════════════════════
    let card = null;
    for (let i = 0; i < 12 && card === null; i += 1) {
      card = await centre(/^(Защо|ЗАЩО|Инструкции|СПИСЪК)$/);
      if (card === null) await sleep(1500);
    }
    const b = await census("B-card-up");
    report(b, "B · CARD UP", (w) => w.card);

    // ══ STATE C · THE READ MODE (the card, opened) ══════════════════════════
    if (card) {
      await press(/^(Защо|ЗАЩО|Инструкции|СПИСЪК)$/, "open the read mode");
      await sleep(1100);
      const opened = await page.evaluate(() => document.documentElement.dataset.simOverlayRead === "open");
      if (!opened) {
        await press(/^(Защо|ЗАЩО|Инструкции|СПИСЪК)$/, "open the read mode (retry)");
        await sleep(1100);
      }
      const c = await census("C-read-open");
      report(c, "C · READ MODE", (w) => w.readMode);
      rec.states["C-read-open"].ackClipped = await page.evaluate(() => {
        const btn = [...document.querySelectorAll("button")].find((n) => /^(Разбрах|Затвори)$/.test((n.textContent || "").trim()));
        if (!btn) return null;
        const r = btn.getBoundingClientRect();
        return r.bottom > window.innerHeight + 0.5 || r.top < -0.5 || r.right > window.innerWidth + 0.5;
      });
      await page.screenshot({ path: `${OUT}/shots/${device.id}__read.png`, timeout: 120_000 });
      // CLOSE IT, AND PROVE IT CLOSED. The first run of this probe pressed
      // «Затвори» and matched the LESSON MENU's own «Затвори» instead — so
      // states D, E and F were all measured with the read mode still up and
      // the car still stopped. Three states of nothing, reported as „0 dead".
      // The close is now scoped to the read surface and verified against the
      // attribute, with a retry.
      for (let i = 0; i < 3; i += 1) {
        const still = await page.evaluate(() => document.documentElement.dataset.simOverlayRead === "open");
        if (!still) break;
        const c = await page.evaluate(() => {
          const surf = document.querySelector('[data-sim-overlay-state="open"]');
          const btn = surf ? [...surf.querySelectorAll("button")].find((n) => /^(Затвори|Разбрах)$/.test((n.textContent || "").trim())) : null;
          if (!btn) return null;
          const r = btn.getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        });
        if (!c) break;
        await page.mouse.move(c.x, c.y);
        await page.mouse.down();
        await sleep(90);
        await page.mouse.up();
        await sleep(800);
      }
      rec.readClosed = !(await page.evaluate(() => document.documentElement.dataset.simOverlayRead === "open"));
      console.log(`         read mode closed: ${rec.readClosed}`);
      await clearCards();
      await sleep(700);
    } else {
      console.log("  C · READ MODE               ⚠ NOT ENTERED — no card offered «Защо» in 18 s");
      rec.states["C-read-open"] = { entered: false, why: "no card offered «Защо»" };
    }

    // ══ STATE D · THE ⚙ CAR SHEET ═══════════════════════════════════════════
    await press(/^Контроли на автомобила$/, "open the ⚙ dock");
    await sleep(700);
    const d = await census("D-sheet-open");
    report(d, "D · ⚙ SHEET OPEN", (w) => w.sheet);
    await page.screenshot({ path: `${OUT}/shots/${device.id}__sheet.png`, timeout: 120_000 });
    await press(/^Затвори контролите$/, "close the ⚙ dock");
    await sleep(700);

    // ══ STATE E · THE LESSON MENU ═══════════════════════════════════════════
    await press(/^Меню$/, "open «Меню на урока»");
    await sleep(800);
    const e = await census("E-menu-open");
    report(e, "E · LESSON MENU OPEN", (w) => w.menu === true);
    await page.screenshot({ path: `${OUT}/shots/${device.id}__menu.png`, timeout: 120_000 });
    const menuOpenNow = e.witness.menu === true;

    // ══ STATE F · «НАПРЕДНАЛ» ═══════════════════════════════════════════════
    // THE TIER LIVES IN THE ⚙ SHEET, NOT IN THE LESSON MENU — `tierCellLabelBg`
    // has exactly one call site and it is a `SheetCell`. The first run of this
    // probe hunted it in the menu and reported `TIER null`, which reads exactly
    // like „the tier picker is gone".
    //
    // AND THE MATCH IS ANCHORED. The cell's accessible name is
    // „Ниво на помощта: <now> — натисни за <next>", so a bare /Напреднал/ hits
    // the SECOND half and stops one tier early. Wave 9 shipped that bug and it
    // reported the clutch as absent, i.e. „the manual tier is unplayable".
    if (menuOpenNow) {
      await press(/^Затвори$/, "close the lesson menu");
      await sleep(700);
    }
    await press(/^Контроли на автомобила$/, "open the ⚙ dock to reach the tier");
    await sleep(700);
    let tierNow = null;
    for (let i = 0; i < 4; i += 1) {
      tierNow = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) => /Ниво на помощта/.test(n.getAttribute("aria-label") || ""));
        return b ? b.getAttribute("aria-label") : null;
      });
      if (tierNow && /Ниво на помощта:\s*Напреднал\b/.test(tierNow)) break;
      const hit = await centre(/Ниво на помощта/);
      if (!hit) break;
      await page.mouse.move(hit.x, hit.y);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      await sleep(750);
      const sheetStill = await page.evaluate(() => !!document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]'));
      if (!sheetStill) {
        await press(/^Контроли на автомобила$/, "re-open the ⚙ dock");
        await sleep(700);
      }
    }
    rec.tierLabel = tierNow;
    console.log(`  TIER · «${tierNow}»`);
    const onAdvanced = /Ниво на помощта:\s*Напреднал\b/.test(tierNow || "");

    // F2 first, because the clutch only exists while the sheet is open.
    const fSheet = await census("F-advanced-sheet");
    const clutch = fSheet.controls.find((c) => /Съединител/.test(c.label));
    rec.clutch = clutch ? { rect: [clutch.x, clutch.y, clutch.w, clutch.h], mm: clutch.thumbMm, band: clutch.thumb, alive: clutch.self, live: clutch.live } : null;
    report(fSheet, "F2 · «НАПРЕДНАЛ» + ⚙", (w) => w.sheet && onAdvanced);
    console.log(`  CLUTCH · ${rec.clutch ? `«СЪЕД» [${rec.clutch.rect}] ${rec.clutch.mm} mm ${rec.clutch.band} · ${rec.clutch.alive ? "alive" : "DEAD"}` : "NOT ON SCREEN"}`);
    await page.screenshot({ path: `${OUT}/shots/${device.id}__advanced-sheet.png`, timeout: 120_000 });
    await press(/^Затвори контролите$/, "close the ⚙ dock");
    await sleep(700);
    await clearCards();
    await sleep(700);
    const f = await census("F-advanced", true);
    report(f, "F · «НАПРЕДНАЛ»", () => onAdvanced);
    rec.states["F-advanced"].clutchPresent = f.witness.clutch;
    await page.screenshot({ path: `${OUT}/shots/${device.id}__advanced.png`, timeout: 120_000 });
  } catch (error) {
    rec.error = String(error?.message || error).split("\n")[0];
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}
await browser.close();

// ── THE VERDICT ─────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(104)}\nWAVE 10 · DEFECT 2 — IS ANY CONTROL BURIED, IN ANY STATE?\n`);
const live = results.filter((r) => !r.fatal && !r.error);
const STATES = ["A-idle-driving", "B-card-up", "C-read-open", "D-sheet-open", "E-menu-open", "F-advanced", "F-advanced-sheet"];
let totalDead = 0;
let notEntered = 0;
for (const st of STATES) {
  const rows = live.map((r) => r.states[st]).filter(Boolean);
  const entered = rows.filter((x) => x.entered).length;
  const dead = rows.reduce((n, x) => n + (x.dead?.length ?? 0), 0);
  const running = rows.filter((x) => (x.dead?.length ?? 0) > 0 && x.paused === false).length;
  totalDead += dead;
  notEntered += rows.length - entered;
  console.log(`  ${st.padEnd(18)} entered ${entered}/${rows.length} · DEAD ${dead} · profiles with a dead control AND THE CLOCK RUNNING ${running}`);
}
const under44 = live.flatMap((r) => Object.values(r.states).flatMap((s) => s.under44 ?? []));
const off = live.flatMap((r) => Object.values(r.states).flatMap((s) => s.offscreen ?? []));
const tOver = live.flatMap((r) => Object.values(r.states).map((s) => s.textOverControlPx2 ?? 0));
console.log(
  `\n  TOTAL dead across ${live.length} profiles × ${STATES.length} states: ${totalDead}` +
    `\n  under 44 px (HIT rect, not border box): ${under44.length}${under44.length ? " — " + under44.map((u) => `«${u.label}» hit ${u.hit}`).join(", ") : ""}` +
    `\n  offscreen: ${off.length}${off.length ? " — " + off.join(", ") : ""}` +
    `\n  text over a live control: max ${Math.max(0, ...tOver)} px²` +
    `\n  states not entered (measured nothing): ${notEntered}`,
);
console.log("\n  COVERAGE, CAR MOVING — the number he judges");
for (const r of live) {
  const a = r.states["A-idle-driving"];
  if (!a?.grid) continue;
  console.log(`    ${r.device.padEnd(28)} UI ${String(a.grid.interceptPct).padStart(5)}% (ink ${a.grid.inkControlPct}% ghost ${a.grid.ghostControlPct}% panel ${a.grid.panelPct}%) · road ${a.grid.roadPct}% · mid-third ${a.grid.middleThirdUiPct}% · centre ${a.grid.centreBoxUiPct}% · ${a.movingKmh} km/h`);
}
console.log(`\nraw → ${OUT}/${TAG}.json · frames → ${OUT}/shots/`);
