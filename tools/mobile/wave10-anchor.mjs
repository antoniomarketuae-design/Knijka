// =============================================================================
// wave10-anchor.mjs — DOES THE ARC STILL RESHAPE UNDER THE THUMB?
//
// THE BRIEF: „CDP viewport-height changes of −44, −90 and +44 px, six profiles:
// report every control's |dy| and THE SPREAD. Spread 0 is the pass."
//
// THIS PROBE RUNS THAT SWEEP AND ONE MORE, AND THE SECOND ONE IS THE POINT.
// The reason is arithmetic, not evasion, and it is stated here so the numbers
// below are read correctly:
//
//   `Emulation.setDeviceMetricsOverride` shrinks THE GLASS. Every viewport unit
//   goes with it — `svh`, `lvh`, `dvh` are all the emulated height, because
//   emulation has no browser chrome to be shown or hidden. So under that
//   instrument a top-anchored control moves 0 and a bottom-anchored one moves Δ,
//   FOR EVERY LAYOUT THAT IS ENTIRELY ON SCREEN. Overall spread ≡ |Δ| is forced.
//   The only way to score 0 is to push a control off the glass, which is
//   non-negotiable #4. The probe proves this rather than asserting it: SWEEP A
//   carries two RULERS, one pinned to the top edge and one to the bottom, whose
//   |dy| are 0 and |Δ| by construction.
//
//   WHAT SAFARI ACTUALLY DOES IS DIFFERENT. The glass never changes. What moves
//   is how much of it the page owns — `visualViewport.height`, which this app
//   reads in `useVisualViewportHeight` and publishes as `--sim-vh`. `svh` stays
//   put, by definition. So SWEEP B holds the glass (and therefore `svh`) fixed
//   and drives `visualViewport.height` by the same −44 / −90 / +44, through the
//   app's own hook, its own state, its own CSS variable and its own cascade.
//   THAT is the sweep in which „spread 0" is both meaningful and achievable,
//   and it is the sweep that answers his defect.
//
// AND IT CARRIES A NEGATIVE CONTROL, because five sweeps in this project have
// come back green off an instrument that could not see the defect. Two hidden
// elements are injected into the touch root carrying the geometry THIS WAVE
// DELETED — `min(44%, 9.5rem)` for the pad and
// `clamp(1.25rem, (100% − 22rem) × 0.5, 8.25rem)` for the arc rise, resolved by
// the same engine against the same box in the same frame. If those two do not
// MOVE and RESIZE while the shipped controls hold still, the instrument is
// blind and the run says so instead of printing a zero.
//
//   node wave10-anchor.mjs --base https://…trycloudflare.com --tag after
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium, webkit } from "./lib/pw.mjs";
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
const TAG = arg("tag", "after");
const ENGINE_NAME = arg("engine", "chromium");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave10-anchor`;
mkdirSync(OUT, { recursive: true });
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
// ── THE FOUR DELTAS, AND WHAT EACH ONE PHYSICALLY IS ────────────────────────
// The harness's rest state has NO browser chrome, so at rest
// `visualViewport.height === innerHeight === 100svh`. On a real phone that is
// the BAR-SHOWN state — `svh` is by definition the smallest the page area gets.
// So, in SWEEP B:
//
//   +44 / +90  THE URL BAR RETRACTING. The page area grows past `svh`; the
//              glass does not move. This is the defect he feels, and the pass
//              is that NOTHING ON THE SCREEN MOVES AT ALL — dy 0, spread 0.
//   −44 / −90  BELOW `svh`: an on-screen keyboard, or a pinch. The band is
//              SUPPOSED to follow the shrinking bottom edge here — that is what
//              `max(0px, …)` in the lift is for, and the alternative is a
//              throttle under the keyboard. So the band moves as one rigid body
//              and the top-anchored chrome does not, which reads as spread |Δ|
//              and is correct. Band spread and shape must still be 0.
//
// Both directions are run and both are reported. Reporting only the flattering
// half is the failure mode this harness exists to end.
const DELTAS = [-44, -90, 44, 90];
const MEANING = {
  "-44": "keyboard/pinch — band SHOULD track",
  "-90": "keyboard/pinch — band SHOULD track",
  "44": "URL BAR RETRACTS — nothing may move",
  "90": "URL BAR RETRACTS — nothing may move",
};

// ── THE RULERS AND THE NEGATIVE CONTROL, INJECTED ONCE PER PAGE ─────────────
// Appended to `[data-hud="touch-controls"]`, which is `absolute inset-0` inside
// the stage — the SAME containing block the deleted pads resolved their
// percentages against. Anywhere else and the negative control models nothing.
const INSTALL = () => {
  const root = document.querySelector('[data-hud="touch-controls"]');
  if (!root) return false;
  for (const id of ["__w10_ncPad", "__w10_ncArc", "__w10_topRuler", "__w10_botRuler"]) {
    document.getElementById(id)?.remove();
  }
  const mk = (id, style) => {
    const d = document.createElement("div");
    d.id = id;
    d.setAttribute("data-w10-instrument", "");
    d.style.cssText = `position:absolute;left:0;width:6px;pointer-events:none;opacity:0;${style}`;
    root.appendChild(d);
    return d;
  };
  // THE DELETED GEOMETRY, verbatim: the drive pad's old height and the old arc
  // rise stacked on top of it, both bottom-anchored to the live stage the way
  // they were before this wave.
  mk("__w10_ncPad", "bottom:0;height:min(44%, 9.5rem);");
  mk(
    "__w10_ncArc",
    "height:6px;bottom:calc(min(44%, 9.5rem) + clamp(1.25rem, (100% - 22rem) * 0.5, 8.25rem));",
  );
  // Two rulers that CANNOT be fixed by any layout: one welded to the top of the
  // viewport, one to the bottom. Their dy is the arithmetic floor of „overall
  // spread" under a metrics override.
  const t = document.createElement("div");
  t.id = "__w10_topRuler";
  t.setAttribute("data-w10-instrument", "");
  t.style.cssText = "position:fixed;left:0;top:0;width:6px;height:6px;pointer-events:none;opacity:0";
  document.body.appendChild(t);
  const b = document.createElement("div");
  b.id = "__w10_botRuler";
  b.setAttribute("data-w10-instrument", "");
  b.style.cssText =
    "position:fixed;left:0;bottom:0;width:6px;height:6px;pointer-events:none;opacity:0";
  document.body.appendChild(b);
  return true;
};

// ── ONE READING OF THE WHOLE SCREEN'S GEOMETRY ──────────────────────────────
const GEOM = () => {
  const out = {};
  const add = (key, el, band) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    if (out[key]) return;
    out[key] = {
      cx: Math.round((r.x + r.width / 2) * 10) / 10,
      cy: Math.round((r.y + r.height / 2) * 10) / 10,
      w: Math.round(r.width * 10) / 10,
      h: Math.round(r.height * 10) / 10,
      top: Math.round(r.y * 10) / 10,
      bottom: Math.round(r.bottom * 10) / 10,
      band,
    };
  };
  const SEL = 'button,[role="slider"],[role="menuitem"],[role="switch"],a[href]';
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const l = (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim();
    if (!l) continue;
    // ── THREE ANCHOR CLASSES, AND THE SPLIT IS NOT COSMETIC ────────────────
    // «ПАУЗА» and «ИЗГЛЕД» live INSIDE `[data-hud="touch-controls"]` but are
    // `top:`-anchored — they are the corner, not the band. Counting them as
    // band members made the first run of this probe report „band spread 44",
    // which is the corner staying put while the band moved: the layout working.
    // The band is the arc stations and the two pads, i.e. the touch root MINUS
    // the rail. That is the set that must move as one rigid body.
    const inTouch = el.closest('[data-hud="touch-controls"]') !== null;
    const inRail = el.closest('[data-hud="top-rail"]') !== null;
    add(l.slice(0, 44), el, inRail ? "rail" : inTouch ? "band" : "chrome");
  }
  for (const id of ["__w10_ncPad", "__w10_ncArc", "__w10_topRuler", "__w10_botRuler"]) {
    const el = document.getElementById(id);
    if (el) add(id, el, "instrument");
  }
  // The two viewport quantities the whole argument turns on, read from the
  // engine rather than assumed.
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:100svh;pointer-events:none;opacity:0";
  document.body.appendChild(probe);
  const svh = Math.round(probe.getBoundingClientRect().height * 10) / 10;
  probe.remove();
  const stage = document.querySelector("[data-sim-stage]");
  // THE SELF-CHECK. `[data-sim-shell]` is the element the app sizes from
  // `visualViewport.height`; if its inline height is empty the page is on the
  // fullscreen arm and NOTHING measured here is about the founder's phone.
  const shell = document.querySelector("[data-sim-shell]");
  const padEl = document.querySelector('[aria-label^="Ход"]');
  return {
    out,
    innerHeight: window.innerHeight,
    vvHeight: window.visualViewport ? Math.round(window.visualViewport.height * 10) / 10 : null,
    svhPx: svh,
    simVh: stage ? getComputedStyle(stage).getPropertyValue("--sim-vh").trim() : null,
    simSvh: stage ? getComputedStyle(stage).getPropertyValue("--sim-svh").trim() : null,
    stageH: stage ? Math.round(stage.getBoundingClientRect().height * 10) / 10 : null,
    shellInlineH: shell ? shell.style.height || "" : null,
    shellH: shell ? Math.round(shell.getBoundingClientRect().height * 10) / 10 : null,
    // The lift itself, as the engine resolved it — the one number the whole fix
    // is. 0 with the bar shown, 44 with it retracted.
    padBottomUsed: padEl ? getComputedStyle(padEl).bottom : null,
  };
};

/** Drive `visualViewport.height` — and nothing else — the way a toolbar does. */
const VV_SET = (h) => {
  const vv = window.visualViewport;
  if (!vv) return { ok: false, why: "no visualViewport" };
  if (h === null) {
    delete vv.height;
    vv.dispatchEvent(new Event("resize"));
    return { ok: true, height: vv.height };
  }
  Object.defineProperty(vv, "height", { configurable: true, get: () => h });
  vv.dispatchEvent(new Event("resize"));
  window.dispatchEvent(new Event("resize"));
  return { ok: true, height: vv.height };
};

function compare(base, now) {
  const rows = [];
  for (const [k, v] of Object.entries(now.out)) {
    const b = base.out[k];
    if (!b) continue;
    rows.push({
      label: k,
      band: v.band,
      dy: Math.round((v.cy - b.cy) * 10) / 10,
      dh: Math.round((v.h - b.h) * 10) / 10,
      dw: Math.round((v.w - b.w) * 10) / 10,
      cy: v.cy,
      was: b.cy,
    });
  }
  const spreadOf = (rs) => {
    if (rs.length === 0) return null;
    const ds = rs.map((r) => r.dy);
    return Math.round((Math.max(...ds) - Math.min(...ds)) * 10) / 10;
  };
  const touch = rows.filter((r) => r.band === "band");
  const product = rows.filter((r) => r.band !== "instrument");
  // SHAPE: every pair inside the control band. This is what „reshapes" means —
  // a gap between two stations, or between a station and the pad, changing.
  let worstGap = { pair: null, delta: 0 };
  for (let a = 0; a < touch.length; a += 1) {
    for (let b2 = a + 1; b2 < touch.length; b2 += 1) {
      const d =
        Math.round((Math.abs(touch[a].cy - touch[b2].cy) - Math.abs(touch[a].was - touch[b2].was)) * 10) /
        10;
      if (Math.abs(d) > Math.abs(worstGap.delta)) {
        worstGap = { pair: `«${touch[a].label}» ↔ «${touch[b2].label}»`, delta: d };
      }
    }
  }
  const resized = rows.filter((r) => r.band !== "instrument" && (Math.abs(r.dh) > 0.5 || Math.abs(r.dw) > 0.5));
  const nc = (id) => rows.find((r) => r.label === id) ?? null;
  return {
    controls: product.length,
    touchControls: touch.length,
    bandSpreadPx: spreadOf(touch),
    overallSpreadPx: spreadOf(product),
    maxAbsDyPx: product.length ? Math.max(...product.map((r) => Math.abs(r.dy))) : null,
    worstGapChangePx: worstGap.delta,
    worstGapPair: worstGap.pair,
    resizedCount: resized.length,
    resized: resized.map((r) => ({ label: r.label, dh: r.dh, dw: r.dw })),
    rulers: { top: nc("__w10_topRuler"), bottom: nc("__w10_botRuler") },
    negativeControl: { oldPad: nc("__w10_ncPad"), oldArcRise: nc("__w10_ncArc") },
    rows: rows.filter((r) => r.band !== "instrument"),
  };
}

// ══ THE INSTRUMENT DEFECT THIS PROBE FOUND IN ITSELF, FIRST ══════════════════
//
// The first run of this file reported dy 0 and spread 0 on EVERY control in
// sweep B — and 0 for the negative control too, which is what gave it away.
// Cause, diagnosed on the deployed page: Chromium GRANTS `requestFullscreen`
// for a <div>. iOS Safari refuses it (`fullscreen.ts`: „not a rejected promise,
// a TypeError"). So the shell took its `isFullscreen` arm, where the UA sizes
// the element and the app deliberately does NOT apply
// `height: var(--sim-vh)` — the stage was welded to the glass, `visualViewport`
// could not move it, and the sweep was measuring a screen on which the defect
// cannot occur. It would have printed a perfect score about nothing.
//
// So both engines are put on the founder's path, by the mechanism this app's
// own `immersive.ts` already documents: `Element.prototype.requestFullscreen`
// deleted before first script. Emulation, stated out loud, exactly like the
// safe-area insets — and, like them, it must be able to fail: the run below
// prints the shell's resolved `height` at rest, and if that is not a px number
// tracking `--sim-vh` the numbers are not to be believed.
const NO_FULLSCREEN = () => {
  for (const k of ["requestFullscreen", "webkitRequestFullscreen", "webkitRequestFullScreen"]) {
    try {
      delete Element.prototype[k];
    } catch {
      /* frozen prototype — reported by the rest-state check below */
    }
  }
  try {
    Object.defineProperty(document, "fullscreenEnabled", { get: () => false, configurable: true });
  } catch {
    /* ditto */
  }
};

const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch(ENGINE_NAME === "webkit" ? {} : { args: GL });
console.log(
  `[w10-anchor] engine ${ENGINE_NAME}${ENGINE_NAME === "webkit" ? " (THE FOUNDER'S ENGINE — sweep A uses setViewportSize, which changes the layout viewport and every viewport unit exactly as the CDP override does)" : " (CDP, as briefed)"}`,
);
console.log(`[w10-anchor] base ${BASE} · route ${ROUTE}`);
const { context: authCtx } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
});
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
console.log(`[w10-anchor] signed in ONCE as ${EMAIL}`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
  });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = {
    device: device.id,
    label: device.label,
    orientation: device.orientation,
    engine: ENGINE_NAME,
    inset: insetBanner(device, inset),
    viewport: { w: device.width, h: device.height },
  };
  console.log(`\n${"=".repeat(104)}\n${device.label}\n  ${rec.inset}`);
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
        if (!best || r.width * r.height > best.w * best.h) {
          best = { w: Math.round(r.width), h: Math.round(r.height) };
        }
      }
      return {
        hasCanvas: best !== null,
        canvas: best,
        touchControls: !!document.querySelector('[data-hud="touch-controls"]'),
        url: location.pathname + location.search,
      };
    });
    rec.gate = gate;
    console.log(
      `  GATE  · hasCanvas ${gate.hasCanvas} · canvas ${JSON.stringify(gate.canvas)} · touchControls ${gate.touchControls}`,
    );
    if (!gate.hasCanvas || !gate.canvas || gate.canvas.w < 40 || !gate.touchControls) {
      rec.fatal = "NO LIVE CANVAS / NO TOUCH CONTROLS — refusing to report geometry";
      console.log(`  FATAL · ${rec.fatal}`);
      results.push(rec);
      await context.close();
      continue;
    }
    // Clear the pre-drive cards so the sweep measures the driving screen and
    // not a modal. Presses are pointer presses (a `click()` is a compatibility
    // mouse event only the primary touch point gets).
    for (let i = 0; i < 8; i += 1) {
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^(Разбрах|Продължи|Започни|Ясно)$/.test((n.textContent || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(420);
    }
    await sleep(900);

    rec.installed = await page.evaluate(INSTALL);
    const base = await page.evaluate(GEOM);
    rec.rest = {
      innerHeight: base.innerHeight,
      vvHeight: base.vvHeight,
      svhPx: base.svhPx,
      simVh: base.simVh,
      simSvh: base.simSvh,
      stageH: base.stageH,
      shellInlineH: base.shellInlineH,
      padBottomUsed: base.padBottomUsed,
      controls: Object.keys(base.out).length,
    };
    rec.onFounderPath = /px$/.test(base.shellInlineH || "");
    console.log(
      `  REST  · innerHeight ${base.innerHeight} · visualViewport ${base.vvHeight} · 100svh ${base.svhPx} · --sim-svh «${base.simSvh}» · --sim-vh ${base.simVh} · stage ${base.stageH} · pad bottom «${base.padBottomUsed}» · ${rec.rest.controls} boxes`,
    );
    console.log(
      `  PATH  · shell inline height «${base.shellInlineH}» → ${rec.onFounderPath ? "IMMERSIVE (the founder's arm — the stage tracks visualViewport)" : "⚠ FULLSCREEN ARM — the stage is welded to the glass, SWEEP B CANNOT SEE THE DEFECT"}`,
    );

    // ══ SWEEP A — THE BRIEFED ONE. A metrics override: CDP in Chromium,
    //    `setViewportSize` in WebKit. Both change the layout viewport and with
    //    it every viewport unit, which is the property the argument turns on.
    const cdp = ENGINE_NAME === "webkit" ? null : await context.newCDPSession(page);
    const setHeight = async (h) => {
      if (cdp) {
        await cdp.send("Emulation.setDeviceMetricsOverride", {
          width: device.width,
          height: h,
          deviceScaleFactor: device.dpr,
          mobile: true,
        });
      } else {
        await page.setViewportSize({ width: device.width, height: h });
      }
    };
    const sweepA = [];
    for (const delta of DELTAS) {
      await setHeight(device.height + delta);
      await sleep(1500);
      await page.evaluate(INSTALL);
      const now = await page.evaluate(GEOM);
      const c = compare(base, now);
      sweepA.push({ delta, innerHeight: now.innerHeight, svhPx: now.svhPx, ...c });
      console.log(
        `  A ${String(delta).padStart(3)} · svh ${now.svhPx} · BAND SPREAD ${c.bandSpreadPx} · overall ${c.overallSpreadPx} · shape ${c.worstGapChangePx} px · resized ${c.resizedCount}` +
          ` · rulers top ${c.rulers.top?.dy} / bottom ${c.rulers.bottom?.dy}` +
          ` · OLD pad dy ${c.negativeControl.oldPad?.dy} dh ${c.negativeControl.oldPad?.dh} · OLD rise dy ${c.negativeControl.oldArcRise?.dy}`,
      );
    }
    await setHeight(device.height);
    await sleep(1200);
    rec.sweepCdp = sweepA;

    // ══ SWEEP B — THE FAITHFUL ONE. The glass (and svh) held; only the page's
    //    share of it moves, through the app's own visualViewport path. ════════
    await page.evaluate(INSTALL);
    const baseB = await page.evaluate(GEOM);
    const sweepB = [];
    for (const delta of DELTAS) {
      const applied = await page.evaluate(VV_SET, device.height + delta);
      await sleep(1500);
      await page.evaluate(INSTALL);
      const now = await page.evaluate(GEOM);
      const c = compare(baseB, now);
      sweepB.push({
        delta,
        applied,
        innerHeight: now.innerHeight,
        svhPx: now.svhPx,
        vvHeight: now.vvHeight,
        simVh: now.simVh,
        stageH: now.stageH,
        ...c,
      });
      console.log(
        `  B ${String(delta).padStart(3)} [${MEANING[String(delta)]}] · svh ${now.svhPx} (HELD) · --sim-vh ${now.simVh} · SPREAD ${c.overallSpreadPx} · band ${c.bandSpreadPx} · maxAbsDy ${c.maxAbsDyPx} · shape ${c.worstGapChangePx} px · resized ${c.resizedCount}` +
          ` · OLD pad dy ${c.negativeControl.oldPad?.dy} dh ${c.negativeControl.oldPad?.dh} · OLD rise dy ${c.negativeControl.oldArcRise?.dy}`,
      );
      if (c.rows.some((r) => Math.abs(r.dy) > 0.5)) {
        for (const r of c.rows.filter((x) => Math.abs(x.dy) > 0.5)) {
          console.log(`        MOVED «${r.label}» dy ${r.dy} (${r.was} → ${r.cy})`);
        }
      }
    }
    await page.evaluate(VV_SET, null);
    rec.sweepVisualViewport = sweepB;
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
console.log(`\n${"=".repeat(104)}\nWAVE 10 · DEFECT 1 — DOES THE ARC RESHAPE?\n`);
const live = results.filter((r) => !r.fatal && !r.error && r.sweepVisualViewport);
let passBar = true; //  the URL-bar direction: NOTHING may move
let passBand = true; // every direction: the band is one rigid body, shape frozen
let ncSaw = true;
for (const r of live) {
  for (const s of [...(r.sweepVisualViewport ?? []), ...(r.sweepCdp ?? [])]) {
    if ((s.bandSpreadPx ?? 99) > 0.5 || Math.abs(s.worstGapChangePx ?? 99) > 0.5 || (s.resizedCount ?? 99) > 0) {
      passBand = false;
    }
  }
  for (const s of r.sweepVisualViewport) {
    if (s.delta > 0 && ((s.overallSpreadPx ?? 99) > 0.5 || (s.maxAbsDyPx ?? 99) > 0.5)) passBar = false;
    if (Math.abs(s.negativeControl.oldPad?.dy ?? 0) < 0.5 && Math.abs(s.negativeControl.oldArcRise?.dy ?? 0) < 0.5) {
      ncSaw = false;
    }
  }
}
const shapeA = live.flatMap((r) => (r.sweepCdp ?? []).map((s) => Math.abs(s.worstGapChangePx ?? 0)));
const bandA = live.flatMap((r) => (r.sweepCdp ?? []).map((s) => Math.abs(s.bandSpreadPx ?? 0)));
const resA = live.flatMap((r) => (r.sweepCdp ?? []).map((s) => s.resizedCount ?? 0));
console.log(
  `SWEEP A (CDP metrics override, ${live.length} profiles × ${DELTAS.length} deltas)\n` +
    `  band spread   max ${Math.max(0, ...bandA)} px   (every touch control moves as ONE rigid body)\n` +
    `  shape change  max ${Math.max(0, ...shapeA)} px   (no gap between any two band controls changes)\n` +
    `  resized       max ${Math.max(0, ...resA)} controls\n` +
    `  overall spread is |Δ| by construction here — the two rulers prove it, see the header.`,
);
console.log(
  `\nSWEEP B (glass and svh HELD, visualViewport driven — what Safari's URL bar does)\n` +
    `  URL-BAR DIRECTION (+44, +90): every control dy 0 and SPREAD 0, all profiles: ${passBar ? "PASS" : "FAIL"}\n` +
    `  KEYBOARD DIRECTION (−44, −90): the band tracks the shrinking glass by design (max(0px, …) in the lift)\n` +
    `\nACROSS BOTH SWEEPS AND ALL ${DELTAS.length} DELTAS\n` +
    `  band spread 0 · shape change 0 px · 0 controls resized: ${passBand ? "PASS — the arc does not reshape" : "FAIL"}\n` +
    `  negative control (the deleted geometry, same engine, same frame) MOVED: ${ncSaw ? "yes — the instrument CAN see the defect" : "NO — INSTRUMENT IS BLIND, DISBELIEVE THE ZERO"}`,
);
console.log(`\nraw → ${OUT}/${TAG}.json`);
