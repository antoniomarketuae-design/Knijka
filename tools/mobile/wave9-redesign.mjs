// =============================================================================
// wave9-redesign.mjs — THE CONTROL REDESIGN, MEASURED AND PHOTOGRAPHED.
//
// HIS RULING WAS „the buttons need absolute redesign", and the number he asked
// for is the share of the DRIVING VIEW the UI takes — before and after, per
// profile. So this probe is `wave8-control-census.mjs`'s instrument, verbatim,
// pointed at a screen that has been rebuilt: same grid, same 6 px step, same
// elementFromPoint classification, same thumb model. A redesign measured with a
// new ruler is not measured at all.
//
// WHAT IT ADDS TO THE CENSUS, AND WHY EACH ONE IS LOAD-BEARING:
//
//   1. IT DRIVES. Every previous coverage number in this project was taken on a
//      PARKED car, and „the frames are the deliverable" means frames of the
//      thing he is judging. The probe walks the pre-drive the way a student
//      does — belt, engine, handbrake, throttle — and screenshots WITH SPEED ON
//      THE CLOCK. That also makes it a functional test of the redesign: if the
//      belt or the ⚙ dock cannot be found in their new homes, the car does not
//      move and the run says so.
//
//   2. IT SWEEPS THE VIEWPORT HEIGHT. Defect 1 was an arc that reshaped under
//      his thumb as Safari's URL bar slid. `-44` and `-90` are the two deltas
//      §N1 measured; the number that matters is the SPREAD — if two controls
//      move by different amounts, the layout is still breathing.
//
//   3. IT OPENS THE READ MODE AND COUNTS WHAT IS BURIED. §I11's residue: the
//      expanded panel buried 7 controls in landscape and 3 in portrait, the
//      seatbelt among them. The answer is not a z-order — it is that the read
//      mode stops the car — so the check is „is anything LIVE underneath it",
//      and the honest witness is that the driving controls are inert.
//
//   4. IT MEASURES THUMB REACH FOR THE GRADED CONTROLS BY NAME. 6.04 CSS px/mm
//      (460 ppi / dpr 3 / 25.4), the conversion doc 91 uses when it calls a
//      44 px target „7.3 mm". The belt was 101.6 mm away in portrait. That is
//      the row this whole wave exists to move.
//
// ENGINES. WebKit is the founder's and the one the before-numbers were taken
// in, so it is the default and it is what the coverage table should be quoted
// from. Chromium is worth a second run for the FRAMES — its WebGL frames are
// the ones that reliably contain a road — and the split is printed per run so
// the two never get mixed in one table.
//
// GATE, per §O.5: hasCanvas === true AND a non-zero canvas rect AND a mounted
// [data-hud="touch-controls"] before a single number is believed. Six probes in
// this project have reported „0 defects" off a page with no simulator on it.
//
//   node wave9-redesign.mjs --base https://…trycloudflare.com
//   node wave9-redesign.mjs --engine chromium --tag after-chromium
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
const TAG = arg("tag", "after");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave9-redesign`;
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

/** 460 ppi / dpr 3 / 25.4 — doc 91's own conversion. */
const PX_PER_MM = 6.04;

// -----------------------------------------------------------------------------
// THE PAGE-SIDE CENSUS — wave8-control-census.mjs's, unchanged, so the before
// and after columns are the same measurement of two different screens.
// -----------------------------------------------------------------------------
const CENSUS = (opts) => {
  const { pxPerMm, gridStep } = opts;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let canvas = null;
  for (const c of document.querySelectorAll("canvas")) {
    const r = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!canvas || r.width * r.height > canvas.w * canvas.h) {
      canvas = {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
        el: c,
      };
    }
  }
  const canvasEl = canvas?.el ?? null;
  if (canvas) delete canvas.el;

  const effOpacity = (el) => {
    let o = 1;
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      const v = Number(getComputedStyle(n).opacity);
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
    const bgA = alphaOf(cs.backgroundColor);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some(
      (s) => parseFloat(cs[`border${s}Width`]) > 0.4 && alphaOf(cs[`border${s}Color`]) > 0.02,
    );
    const hasImage = cs.backgroundImage && cs.backgroundImage !== "none";
    const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
    const ownText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0,
    );
    return { bgAlpha: Math.round(bgA * 100) / 100, hasBorder, hasImage, hasShadow, ownText };
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

  const SEL =
    'button,[role="slider"],[role="menuitem"],[role="switch"],a[href],input,select,[tabindex]:not([tabindex="-1"])';
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
    const cx = Math.round(r.x + r.width / 2);
    const cy = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(cx, cy);
    const paints = paintOf(el);
    const label = (el.getAttribute("aria-label") || el.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 46);
    const t = thumbClass(cx, cy);
    let inkShare = null;
    {
      const step = Math.max(4, Math.round(Math.min(r.width, r.height) / 10));
      let n = 0;
      let painted = 0;
      for (let yy = r.y + step / 2; yy < r.y + r.height; yy += step) {
        for (let xx = r.x + step / 2; xx < r.x + r.width; xx += step) {
          if (xx < 0 || yy < 0 || xx >= vw || yy >= vh) continue;
          const h = document.elementFromPoint(Math.round(xx), Math.round(yy));
          n += 1;
          if (!h) continue;
          const p2 = paintOf(h);
          if (
            effOpacity(h) > 0.02 &&
            (p2.bgAlpha > 0.02 || p2.hasBorder || p2.hasImage || p2.ownText)
          ) {
            painted += 1;
          }
        }
      }
      inkShare = n ? Math.round((painted / n) * 1000) / 10 : null;
    }
    controls.push({
      inkSharePct: inkShare,
      label: label || el.tagName,
      hud: el.closest("[data-hud]")?.getAttribute("data-hud") ?? null,
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      cx,
      cy,
      opacity: effOpacity(el),
      pointerEvents: cs.pointerEvents,
      thirdX: thirdX(cx),
      thirdY: thirdY(cy),
      thumb: t.band,
      thumbMm: t.mm,
      thumbPivot: t.pivot,
      under44: Math.min(r.width, r.height) < 43.5,
      offscreen:
        Math.round(r.x) < -0.5 ||
        Math.round(r.y) < -0.5 ||
        Math.round(r.x + r.width) > vw + 0.5 ||
        Math.round(r.y + r.height) > vh + 0.5,
      self: !!hit && (hit === el || el.contains(hit) || el.contains(hit?.parentElement ?? null)),
      onTop: hit
        ? hit.closest("[aria-label]")?.getAttribute("aria-label") ||
          hit.closest("[data-hud]")?.getAttribute("data-hud") ||
          (hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40) ||
          hit.tagName
        : null,
    });
  }

  let grid = null;
  if (canvas) {
    const x0 = Math.max(0, canvas.x);
    const y0 = Math.max(0, canvas.y);
    const x1 = Math.min(vw, canvas.x + canvas.w);
    const y1 = Math.min(vh, canvas.y + canvas.h);
    let total = 0;
    let road = 0;
    let inkCtl = 0;
    let ghostCtl = 0;
    let panel = 0;
    let midTotal = 0;
    let midUi = 0;
    let boxTotal = 0;
    let boxUi = 0;
    const bx0 = x0 + (x1 - x0) * 0.25;
    const bx1 = x0 + (x1 - x0) * 0.75;
    const by0 = y0 + (y1 - y0) * 0.25;
    const by1 = y0 + (y1 - y0) * 0.75;
    const my0 = y0 + (y1 - y0) / 3;
    const my1 = y0 + (2 * (y1 - y0)) / 3;
    for (let y = y0 + gridStep / 2; y < y1; y += gridStep) {
      for (let x = x0 + gridStep / 2; x < x1; x += gridStep) {
        const hit = document.elementFromPoint(Math.round(x), Math.round(y));
        total += 1;
        const inMid = y >= my0 && y < my1;
        const inBox = x >= bx0 && x < bx1 && y >= by0 && y < by1;
        if (inMid) midTotal += 1;
        if (inBox) boxTotal += 1;
        if (
          !hit ||
          hit === canvasEl ||
          hit === document.body ||
          hit === document.documentElement
        ) {
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
      step: gridStep,
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
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
    };
  };

  return {
    vw,
    vh,
    canvas,
    controls,
    grid,
    strips: {
      topRail: boxOf('[data-hud="top-rail"]'),
      notifyPeek: boxOf('[data-hud="notify-column"]'),
      readMode: boxOf('[data-sim-overlay-state="open"]'),
      sheet: boxOf('[role="toolbar"][aria-label="Контроли на автомобила"]'),
      playMenu: boxOf('[data-hud="play-menu"]'),
    },
    speedKmh: (() => {
      const el = document.querySelector('[aria-label^="Скорост "]');
      const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
      return m ? Number(m[1].replace(",", ".")) : null;
    })(),
  };
};

/** The controls the rule engine can penalise a student for missing. */
const GRADED = [
  ["Мигач наляво", /^Мигач наляво/],
  ["Мигач надясно", /^Мигач надясно/],
  ["Огледало Д", /дясното огледало/],
  ["Огледало З", /задно виждане/],
  ["Огледало Л", /лявото огледало/],
  ["Колан", /Закопчай предпазния колан|^Предпазен колан$/],
  ["Клаксон", /^Клаксон/],
  ["Кола ⚙", /^Контроли на автомобила$/],
];

const launcher = ENGINE_NAME === "chromium" ? chromium : webkit;
const browser = await launcher.launch(ENGINE_NAME === "chromium" ? { args: GL } : {});
console.log(
  `[w9] engine ${ENGINE_NAME}${
    ENGINE_NAME === "webkit"
      ? " (the founder's engine — QUOTE THE COVERAGE TABLE FROM THIS RUN)"
      : " (SECOND OPINION — frames only, not an iPhone)"
  }`,
);
console.log(`[w9] base ${BASE} · route ${ROUTE}`);

const { context: authCtx } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
});
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w9] signed in ONCE as ${EMAIL}`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    inset: insetBanner(device, inset),
    viewport: { w: device.width, h: device.height },
  };
  console.log(`\n${"=".repeat(100)}\n${device.label}\n  ${rec.inset}`);

  const census = (label) =>
    page.evaluate(CENSUS, { pxPerMm: PX_PER_MM, gridStep: 6 }).then((r) => ({ state: label, ...r }));

  const centre = (re) =>
    page.evaluate((r) => {
      const rx = new RegExp(r);
      for (const el of document.querySelectorAll("button,[aria-label]")) {
        const l = el.getAttribute("aria-label") || "";
        const t = (el.textContent || "").replace(/\s+/g, " ").trim();
        if (!rx.test(l) && !rx.test(t)) continue;
        const q = el.getBoundingClientRect();
        if (q.width < 1) continue;
        const x = Math.round(q.x + q.width / 2);
        const y = Math.round(q.y + q.height / 2);
        const hit = document.elementFromPoint(x, y);
        return {
          x,
          y,
          label: l || t,
          pressed: el.getAttribute("aria-pressed"),
          self: !!hit && (hit === el || el.contains(hit)),
        };
      }
      return null;
    }, re.source ?? re);

  // A REAL PRESS, and it must be a POINTER one: `click()` is a compatibility
  // mouse event that only the primary touch point gets (doc 91 §C2), which is
  // the exact defect this screen was fixed for. Mouse down/up produces the same
  // `pointerdown`/`pointerup` pair every control here is bound to.
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
    await sleep(420);
    console.log(`         · ${note} → «${c.label}» at [${c.x},${c.y}]`);
    return { ok: true, note, at: c };
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
        if (!best || r.width * r.height > best.w * best.h) {
          best = {
            x: Math.round(r.x),
            y: Math.round(r.y),
            w: Math.round(r.width),
            h: Math.round(r.height),
          };
        }
      }
      return {
        hasCanvas: best !== null,
        canvas: best,
        url: location.pathname + location.search,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        loading: /Зареждане на|Светът не се зареди/.test(document.body.innerText || ""),
      };
    });
    rec.gate = gate;
    console.log(
      `  GATE · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · touchControls ${gate.touchControls} · url ${gate.url}`,
    );
    if (
      !gate.hasCanvas ||
      !gate.canvas ||
      gate.canvas.w < 40 ||
      gate.canvas.h < 40 ||
      gate.loading ||
      !gate.touchControls
    ) {
      rec.fatal = "NO LIVE CANVAS / NO TOUCH CONTROLS — refusing to report geometry";
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
      await context.close();
      continue;
    }

    await clearCards();
    await sleep(900);

    // ── STATE P · THE BELT IS STILL OFF, SO THE BELT IS STILL ON SCREEN ─────
    // Taken BEFORE the walk on purpose. «Закопчай предпазния колан» is a control
    // that exists exactly while it is needed, so a census taken after the walk
    // reports it missing — which is true and useless. This is the state the
    // number he cares about lives in: how far is the belt from a thumb.
    rec.P = await census("P-predrive");
    await page.screenshot({ path: `${OUT}/shots/${device.id}__predrive.png`, timeout: 120_000 });
    const beltRow = rec.P.controls.find((c) => /Закопчай предпазния колан/.test(c.label));
    rec.beltAtRest = beltRow
      ? {
          rect: [beltRow.x, beltRow.y, beltRow.w, beltRow.h],
          mm: beltRow.thumbMm,
          band: beltRow.thumb,
          ink: beltRow.inkSharePct,
          hud: beltRow.hud,
          alive: beltRow.self,
        }
      : null;
    console.log(
      `  BELT  · ${rec.beltAtRest ? `[${rec.beltAtRest.rect}] ${rec.beltAtRest.mm}mm ${rec.beltAtRest.band} · ink ${rec.beltAtRest.ink}% · in ${rec.beltAtRest.hud}` : "NOT ON SCREEN"}`,
    );

    // ── THE WALK — the pre-drive, pressed where the redesign now puts it ────
    // This is a functional test of the redesign as much as a setup step: if the
    // belt is not findable on the arc, or the ⚙ dock does not open from its new
    // station, the walk misses and the car never moves.
    const walk = [];
    console.log("  WALK  · the pre-drive, through the redesigned controls");
    const belt = await centre(/Закопчай предпазния колан/);
    rec.beltStation = belt;
    if (belt) walk.push(await press(/Закопчай предпазния колан/, "fasten the belt (arc station 0)"));
    await sleep(500);
    walk.push(await press(/^Контроли на автомобила$/, "open the ⚙ dock (arc station 0)"));
    await sleep(500);
    const switches = await page.evaluate(() => {
      const o = {};
      for (const b of document.querySelectorAll("button")) {
        const l = b.getAttribute("aria-label") || "";
        if (/^(Двигател|Ръчна спирачка|Предпазен колан)$/.test(l)) o[l] = b.getAttribute("aria-pressed");
      }
      return o;
    });
    rec.switches = switches;
    if (switches["Предпазен колан"] === "false") walk.push(await press(/^Предпазен колан$/, "belt (dock fallback)"));
    if (switches["Двигател"] === "false") walk.push(await press(/^Двигател$/, "start the engine"));
    if (switches["Ръчна спирачка"] === "true") walk.push(await press(/^Ръчна спирачка$/, "release the handbrake"));
    await sleep(400);
    walk.push(await press(/^Затвори контролите$/, "close the ⚙ dock"));
    await sleep(600);
    await clearCards();
    rec.walk = walk;

    // ── DRIVE. Thumb on the throttle, held, and the census taken UNDER it. ──
    const pad = await page.evaluate(() => {
      const p = [...document.querySelectorAll("[aria-label]")].find((e) =>
        /^Ход/.test(e.getAttribute("aria-label") || ""),
      );
      if (!p) return null;
      const r = p.getBoundingClientRect();
      return {
        x: Math.round(r.x + r.width / 2),
        y: Math.round(r.y + r.height / 2),
        h: Math.round(r.height),
      };
    });
    rec.drivePad = pad;
    let moving = false;
    if (pad) {
      const ty = pad.y - Math.min(60, pad.h / 2 - 8);
      await page.mouse.move(pad.x, pad.y);
      await page.mouse.down();
      await page.mouse.move(pad.x, ty, { steps: 6 });
      await sleep(6000);
      rec.speedKmhDriving = await page.evaluate(() => {
        const el = document.querySelector('[aria-label^="Скорост "]');
        const m = el ? /Скорост (\d+(?:[.,]\d+)?)/.exec(el.getAttribute("aria-label")) : null;
        return m ? Number(m[1].replace(",", ".")) : null;
      });
      moving = (rec.speedKmhDriving ?? 0) > 1;
      console.log(
        `  DRIVE · thumb held above centre · ${rec.speedKmhDriving} km/h · MOVING ${moving}`,
      );

      // ── THE FRAME HE JUDGES BY EYE, taken with the wheels turning ────────
      await page.screenshot({
        path: `${OUT}/shots/${device.id}__driving.png`,
        timeout: 120_000,
      });
      rec.A = await census("A-driving");
      printState(rec.A, "A · DRIVING, THUMB DOWN");
      await page.mouse.up();
      await sleep(700);
    }
    rec.moving = moving;

    // ── THE GRADED CONTROLS, BY NAME, IN MILLIMETRES ────────────────────────
    const byLabel = (re) => rec.A?.controls.find((c) => re.test(c.label)) ?? null;
    rec.graded = GRADED.map(([name, re]) => {
      const c = byLabel(re);
      return c
        ? {
            name,
            rect: [c.x, c.y, c.w, c.h],
            mm: c.thumbMm,
            band: c.thumb,
            ink: c.inkSharePct,
            alive: c.self,
            under44: c.under44,
            offscreen: c.offscreen,
          }
        : { name, missing: true };
    });
    console.log("  GRADED · every control the rule engine can mark you down for");
    for (const g of rec.graded) {
      console.log(
        g.missing
          ? `         «${g.name}» NOT ON SCREEN`
          : `         «${g.name}» [${g.rect}] ${g.mm}mm ${g.band} · ink ${g.ink}% · ${g.alive ? "alive" : "DEAD"}${g.under44 ? " UNDER44" : ""}${g.offscreen ? " OFFSCREEN" : ""}`,
      );
    }

    // ── THE READ MODE, AND WHAT IS LIVE UNDERNEATH IT ───────────────────────
    // The panel only exists behind a card, and after `clearCards` the column is
    // quiet for a while. Wait for one rather than reporting „no defect" off a
    // screen with nothing on it — that summary is what the previous commit in
    // this repo is named after.
    let whyChip = null;
    for (let i = 0; i < 14 && whyChip === null; i += 1) {
      whyChip = await centre(/^(Защо|ЗАЩО|Инструкции|СПИСЪК)$/);
      if (whyChip === null) await sleep(1500);
    }
    rec.whyChip = whyChip;
    if (whyChip === null) console.log("  READ  · no card offered «Защо» in 21 s — read mode NOT exercised");
    const why = whyChip ? await press(/^(Защо|ЗАЩО|Инструкции|СПИСЪК)$/, "open the read mode") : null;
    await sleep(1200);
    rec.read = await census("B-read");
    rec.readMode = {
      opened: rec.read.strips.readMode,
      // The honest witness: while this surface is up the car is stopped and the
      // driving controls are INERT, so „buried" is the wrong question — the
      // right one is whether anything LIVE is underneath. `pointer-events` on
      // the touch root and the absence of a live speed answer it.
      touchInert: await page.evaluate(
        () => document.querySelector('[data-sim-touch-inert="on"]') !== null,
      ),
      liveControlsUnder: rec.read.controls.filter(
        (c) => !c.self && c.pointerEvents !== "none" && c.hud !== "touch-controls",
      ).length,
      ackClipped: await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^(Разбрах|Затвори)$/.test((n.textContent || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return r.bottom > window.innerHeight + 0.5 || r.top < -0.5;
      }),
    };
    console.log(
      `  READ  · surface ${JSON.stringify(rec.readMode.opened)} · touch inert ${rec.readMode.touchInert} · live controls buried ${rec.readMode.liveControlsUnder} · ack clipped ${rec.readMode.ackClipped}`,
    );
    await page.screenshot({ path: `${OUT}/shots/${device.id}__read.png`, timeout: 120_000 });
    await press(/^(Затвори|Разбрах)$/, "close the read mode");
    await sleep(900);

    // ── DEFECT 1 · SWEEP THE HEIGHT THE WAY THE URL BAR DOES ────────────────
    const stationsAt = () =>
      page.evaluate(() => {
        const out = {};
        for (const el of document.querySelectorAll("button,[role='slider'],[aria-label]")) {
          const l = el.getAttribute("aria-label");
          if (!l) continue;
          const r = el.getBoundingClientRect();
          if (r.width < 20 || r.height < 20) continue;
          const k = l.slice(0, 44);
          if (out[k]) continue;
          out[k] = {
            cx: Math.round(r.x + r.width / 2),
            cy: Math.round(r.y + r.height / 2),
            h: Math.round(r.height),
          };
        }
        return { h: window.innerHeight, out };
      });
    const base = await stationsAt();
    const shifts = [];
    for (const delta of [-44, -90]) {
      await page.setViewportSize({ width: device.width, height: device.height + delta });
      await sleep(1400);
      const now = await stationsAt();
      // ── WHAT „IT IS NOT STABILIZED" ACTUALLY MEANS, AS TWO NUMBERS ───────
      //
      // A bottom-anchored control moving WITH the bottom edge is correct, and a
      // top-anchored one staying put is correct too — so a raw „how far did it
      // move" flags the layout working. The defect §N1 measured is different and
      // narrower: the SPACING between controls changing, and a control changing
      // SIZE. Both are zero for any layout built from constants, at any height,
      // and both were non-zero on the build this replaces.
      const rows = [];
      for (const [k, v] of Object.entries(now.out)) {
        const b = base.out[k];
        if (!b) continue;
        rows.push({ label: k, dy: v.cy - b.cy, dh: v.h - b.h, cy: v.cy, was: b.cy });
      }
      let worstGap = { pair: null, delta: 0 };
      for (let a = 0; a < rows.length; a += 1) {
        for (let b2 = a + 1; b2 < rows.length; b2 += 1) {
          const gapNow = Math.abs(rows[a].cy - rows[b2].cy);
          const gapWas = Math.abs(rows[a].was - rows[b2].was);
          const d = Math.round((gapNow - gapWas) * 10) / 10;
          if (Math.abs(d) > Math.abs(worstGap.delta)) {
            worstGap = { pair: `«${rows[a].label}» ↔ «${rows[b2].label}»`, delta: d };
          }
        }
      }
      const resized = rows.filter((r) => Math.abs(r.dh) > 0.5);
      shifts.push({
        delta,
        innerHeight: now.h,
        controls: rows.length,
        worstGapChangePx: worstGap.delta,
        worstGapPair: worstGap.pair,
        resizedCount: resized.length,
        resized: resized.map((r) => ({ label: r.label, dh: r.dh })),
      });
      console.log(
        `  SWEEP · ${delta} px → worst SPACING change ${worstGap.delta} px ${worstGap.pair ?? ""} · controls RESIZED ${resized.length}/${rows.length}${resized.length ? ` (${resized.map((r) => `«${r.label}» ${r.dh > 0 ? "+" : ""}${r.dh}px`).join(", ")})` : ""}`,
      );
    }
    await page.setViewportSize({ width: device.width, height: device.height });
    rec.sweep = shifts;
  } catch (error) {
    rec.error = String(error?.message || error).split("\n")[0];
    console.log(`  ERROR · ${rec.error}`);
  }
  results.push(rec);
  writeFileSync(`${OUT}/${TAG}.json`, JSON.stringify(results, null, 1));
  await context.close();
}

function printState(s, title) {
  console.log(`  --- ${title} · ${s.controls.length} controls · ${s.speedKmh} km/h ---`);
  if (s.grid) {
    console.log(
      `  COVER · road ${s.grid.roadPct}% · UI intercepts ${s.grid.interceptPct}% (ink ${s.grid.inkControlPct}% · ghost ${s.grid.ghostControlPct}% · panels ${s.grid.panelPct}%) · middle third ${s.grid.middleThirdUiPct}% · centre box ${s.grid.centreBoxUiPct}%`,
    );
  }
  console.log(`  STRIP · ${JSON.stringify(s.strips)}`);
  const dead = s.controls.filter((c) => !c.self);
  console.log(`  DEAD  · ${dead.length}/${s.controls.length}`);
  for (const c of dead) console.log(`         «${c.label}» [${c.x},${c.y}] → «${c.onTop}»`);
  const small = s.controls.filter((c) => c.under44);
  const off = s.controls.filter((c) => c.offscreen);
  console.log(`  FLOOR · under 44 px: ${small.length} · off-screen: ${off.length}`);
  for (const c of [...small, ...off]) console.log(`         «${c.label}» [${c.x},${c.y},${c.w}x${c.h}]`);
}

// ── THE TABLE HE ASKED FOR ────────────────────────────────────────────────────
console.log(`\n${"=".repeat(100)}\nCOVERAGE OF THE DRIVING VIEW — ${ENGINE_NAME}, ${TAG}`);
console.log(
  "profile".padEnd(30) +
    "road%".padStart(8) +
    "UI%".padStart(8) +
    "ink%".padStart(8) +
    "ghost%".padStart(8) +
    "panel%".padStart(8) +
    "mid3rd%".padStart(9) +
    "centre%".padStart(9) +
    "km/h".padStart(7),
);
for (const r of results) {
  const g = r.A?.grid;
  if (!g) {
    console.log(`${r.device.padEnd(30)}${(r.fatal ?? r.error ?? "no census").padStart(8)}`);
    continue;
  }
  console.log(
    r.device.padEnd(30) +
      String(g.roadPct).padStart(8) +
      String(g.interceptPct).padStart(8) +
      String(g.inkControlPct).padStart(8) +
      String(g.ghostControlPct).padStart(8) +
      String(g.panelPct).padStart(8) +
      String(g.middleThirdUiPct).padStart(9) +
      String(g.centreBoxUiPct).padStart(9) +
      String(r.speedKmhDriving ?? "-").padStart(7),
  );
}
console.log(`\nwrote ${OUT}/${TAG}.json and ${OUT}/shots/`);
await browser.close();
