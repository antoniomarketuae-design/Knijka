// =============================================================================
// w9-symptoms.mjs — HIS FOUR SENTENCES, DRIVEN. NOT A CHECKLIST.
//
// After a deploy that claimed all of this was fixed, verbatim:
//
//   „page still sliding, what i see is again eaten on sides, again when
//    notifications appear nothing happens nothing shows just everything stop,
//    resolution quality is brutally low ultra bad not like the pc."
//
// Four complaints, four sections, and each one is driven on the real
// authenticated `/simulator` of a PRODUCTION build with a live canvas asserted
// before a single number is believed. Three earlier mobile waves published
// figures taken off `/dev/drive-rig` (404 in production) or off a login
// redirect; the gate below exists because of them.
//
// ── §A · THE SLIDE ──────────────────────────────────────────────────────────
// The last wave shipped `touch-action: pan-y` on the shell root and measured
// pinch 6/6 clean. He says it still slides. So this section stops asking the
// ONE question the fix was written for and asks FIVE, separately, because
// `touch-action` governs different gestures differently and because the harness
// cannot see three of the mechanisms at all:
//
//     drag1      one finger, horizontal   — document pan / overscroll
//     drag2      two fingers, parallel    — a pan the engine may route to the
//                                           visual viewport rather than the doc
//     pinch      two fingers, diverging   — the gesture the shipped fix targets
//     dbltap     two fast taps            — iOS double-tap-to-zoom
//     edgeswipe  one finger from x≈0      — iOS interactive back. NOT
//                                           preventable by any CSS: it is a
//                                           UIKit screen-edge recogniser that
//                                           lives above the web content. If his
//                                           slide is this, no code in this repo
//                                           can stop it, and saying so is the
//                                           finding.
//
// Each is fired at THREE targets — the road, a card, the top rail — because
// `touch-action` is intersected across the elements the touch points are over,
// so they are three different experiments and only one of them is what the
// shipped fix was scoped to.
//
// EVERY sample records `visualViewport.scale/offsetLeft/offsetTop`,
// `window.scrollX/scrollY` and `documentElement.scrollWidth/clientWidth`
// before AND after, plus the resolved `touch-action` chain under the finger.
//
// AND IT CARRIES ITS OWN POSITIVE CONTROL. `/theory` is a page that certainly
// permits pinch. If the control does not zoom, the instrument is dead and every
// zero in this file is worthless — doc 91 §T1 records exactly that happening
// ("the instrument was blind. All of it"). The control runs in the same
// session, on the same CDP client, right after the driving samples.
//
// ── §B · THE SIDES ──────────────────────────────────────────────────────────
// Every PAINTED LEAF measured against the SAFE-AREA box, not against the
// viewport box: a `position: fixed` surface is not laid out inside <body>'s
// padding and never receives the payback globals.css does there. Three states
// (idle · card up · menu open), a frame each, and the safe-area values are
// SUBSTITUTED into the page by lib/insets.mjs because Playwright's WebKit is
// the desktop port and has no notch.
//
// ── §C · THE NOTIFICATIONS ──────────────────────────────────────────────────
// „when notifications appear nothing happens nothing shows just everything
// stop" is at least two different bugs and the sentence fits both. So this
// drives it and reports all four facts separately:
//
//     shows?      the card's own text, its rect, and whether that rect is
//                 inside the viewport and inside the safe-area box
//     answers?    the throttle is HELD across the card — does the speed move
//     dismiss?    the ack pressed with a real TOUCH (not a mouse click), and
//                 `elementFromPoint` at its centre asserted first, because a
//                 control buried under another surface is „nothing happens"
//     resumes?    the speed AND a canvas pixel hash after the dismissal —
//                 „everything stop" may be the world pausing and never coming
//                 back, which is a different bug from a blank card
//
// The canvas hash is taken from a real screenshot of the canvas rect rather
// than `toDataURL` (the drawing buffer is not preserved, so toDataURL on this
// Canvas answers with an empty frame and would report every world as frozen).
//
// ── §D · THE RESOLUTION ─────────────────────────────────────────────────────
// Applied dpr read off the LIVE DRAWING BUFFER (`canvas.width / rect.width` —
// what THREE actually asked the GPU for, which a store that changed and a
// renderer that did not cannot fake), per tier, with the backing store, the
// per-frame GPU time from the app's own pass timer and the harness's own rAF
// frame rate beside it. And a FULL-RES SCREENSHOT at each rung, because the
// deliverable for „brutally low" is a picture he can compare, not a number.
//
// THE ROW THAT MATTERS MOST IS `auto`: what his phone renders with nothing
// seeded and nothing pressed. „We shipped dpr 3" and „his phone renders dpr 3"
// are two different sentences.
//
//   node tools/mobile/w9-symptoms.mjs --base http://localhost:3482 --tag after
//   node tools/mobile/w9-symptoms.mjs --base https://….trycloudflare.com \
//        --section res --tag staging
// =============================================================================
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, insetsFor, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "http://localhost:3482");
const EMAIL = arg("email", process.env.KNIJKA_PERF_EMAIL || "founder@knijka.ai");
const PASSWORD = arg("password", process.env.KNIJKA_PERF_PASSWORD || "Knijka2026!");
const TAG = arg("tag", "run");
const ONLY = arg("device", null);
/** slide | sides | notify | res | all */
const SECTIONS = arg("section", "all").split(",");
const TIERS = arg("tier", "auto,low,med,high").split(",").filter(Boolean);
const SETTLE_MS = Number(arg("settle", "11000"));
const OUT = join(HERE, ".out", "w9-symptoms");
mkdirSync(join(OUT, "shots"), { recursive: true });

const devices = resolveDevices(ONLY ? ONLY.split(",") : undefined);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(`[w9] ${m}`);
const want = (s) => SECTIONS.includes("all") || SECTIONS.includes(s);
const GL = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
const PILL_BG = { low: "Ниско", med: "Средно", high: "Високо" };

// -----------------------------------------------------------------------------
// The page-side instrument. Installed BEFORE the app's first module runs.
// -----------------------------------------------------------------------------
function pageInstrument(seed) {
  try {
    window.localStorage.setItem("sim.touchHintSeen", "1");
    // EVERY ROW STARTS FROM A DEVICE THAT HAS NEVER BEEN TOLD ANYTHING.
    // A preset or a ledger left by an earlier row silently decides the row that
    // was supposed to measure the app deciding for itself.
    window.localStorage.removeItem("aidrive.sim.quality.v1");
    window.localStorage.removeItem("sim.quality");
    window.localStorage.removeItem("aidrive.sim.quality.ledger.v1");
    if (seed.tier === "auto-earned") {
      // ── THE ROW THAT DESCRIBES HIS ACTUAL SECOND SESSION ──────────────────
      // `auto` with a LEDGER, and nothing else: no preset, no manual pick. This
      // is the state a phone is in from its second visit onward, because
      // `useAutoQualityProbe` writes exactly this record after one window that
      // cleared 57 fps. It is the only row that answers "what will he see
      // tomorrow without touching anything", and it cannot be produced by
      // seeding a tier — seeding a tier is the thing we are trying NOT to
      // measure. `measurementAllowed()` refuses to run the probe under
      // `navigator.webdriver`, so the ledger it would have written is placed
      // here by hand; the code path being exercised (`levelFromLedger` →
      // `canvasMaxDpr`) is the shipped one, untouched.
      window.localStorage.setItem(
        "aidrive.sim.quality.ledger.v1",
        JSON.stringify({ earned: "med", failedAt: null }),
      );
    } else if (seed.tier && seed.tier !== "auto") {
      window.localStorage.setItem(
        "aidrive.sim.quality.v1",
        JSON.stringify({ setting: seed.tier, recommendation: seed.tier }),
      );
      window.localStorage.setItem("sim.quality", seed.tier === "med" ? "medium" : seed.tier);
    }
  } catch {
    /* private mode */
  }
  const w = { frames: 0 };
  window.__w9 = w;
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => {
    w.frames += 1;
    raf(tick);
  };
  raf(tick);
  window.__w9Start = () => {
    w.at = w.frames;
    w.t0 = performance.now();
  };
  window.__w9Stop = () => ({ frames: w.frames - w.at, wallMs: performance.now() - w.t0 });
}

/** The viewport facts every gesture sample is judged on. */
const VIEWPORT_PROBE = () => ({
  scale: +(window.visualViewport?.scale ?? 1).toFixed(3),
  offsetLeft: Math.round(window.visualViewport?.offsetLeft ?? 0),
  offsetTop: Math.round(window.visualViewport?.offsetTop ?? 0),
  scrollX: Math.round(window.scrollX),
  scrollY: Math.round(window.scrollY),
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
  scrollHeight: document.documentElement.scrollHeight,
  clientHeight: document.documentElement.clientHeight,
});

/** Assert there is a simulator on this page before believing anything. */
async function gate(page) {
  const live = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return { hasCanvas: false, path: location.pathname };
    const r = c.getBoundingClientRect();
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    let renderer = null;
    try {
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch {
      /* blocked */
    }
    return {
      hasCanvas: true,
      path: location.pathname,
      css: { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) },
      buf: { w: gl?.drawingBufferWidth ?? c.width, h: gl?.drawingBufferHeight ?? c.height },
      panelDpr: window.devicePixelRatio,
      renderer,
      simPerf: typeof window.__simPerf?.gpu === "function",
      compact: document.querySelector("[data-sim-compact]")?.getAttribute("data-sim-compact") ?? null,
    };
  });
  if (!live.hasCanvas || !(live.css?.w > 0) || !(live.css?.h > 0)) {
    throw new Error(`GATE FAILED — no live simulator (${JSON.stringify(live)})`);
  }
  if (/swiftshader|software|llvmpipe/i.test(String(live.renderer))) {
    throw new Error(`GATE FAILED — SwiftShader (${live.renderer})`);
  }
  return live;
}

/** Get to a driving surface: free drive, pre-drive dismissed, belt on. */
async function enterDrive(page, base, { tier } = {}) {
  await page.goto(`${base}/simulator?simPerf=1`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  const freeDrive = page.getByRole("button", { name: /Карай свободно/ }).first();
  await freeDrive.waitFor({ state: "visible", timeout: 120_000 });
  let pill = null;
  if (tier && tier !== "auto") {
    // Pressed like a student presses it — `radio`, then aria-checked asserted.
    const r = page.getByRole("radio", { name: PILL_BG[tier] }).first();
    const seen = await r
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (seen) {
      await r.click({ timeout: 15_000 }).catch(() => {});
      await page.waitForTimeout(400);
      pill = { visible: true, checked: (await r.getAttribute("aria-checked").catch(() => null)) === "true" };
    } else {
      pill = { visible: false, checked: false };
    }
  }
  await freeDrive.click();
  await page.waitForSelector("canvas", { timeout: 120_000 });
  await page.waitForTimeout(SETTLE_MS);
  await page.getByRole("button", { name: /^Разбрах$/ }).first().click({ timeout: 6_000 }).catch(() => {});
  await page.waitForTimeout(400);
  return pill;
}

/** Fasten the belt so its teach moment cannot contaminate a later window. */
async function clearBelt(page) {
  await page.keyboard.down("KeyW");
  await page
    .locator('[role="dialog"], [role="alertdialog"]')
    .first()
    .waitFor({ state: "visible", timeout: 20_000 })
    .catch(() => {});
  await page.keyboard.up("KeyW");
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /РАЗБРАХ|Разбрах/ }).first().click({ timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(500);
  const belted = await page
    .getByRole("button", { name: /Закопчай предпазния колан/ })
    .first()
    .click({ timeout: 8_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(800);
  return belted;
}

// =============================================================================
// §A · THE SLIDE
// =============================================================================
async function sectionSlide(page, cdp, device, rec) {
  const pts = (arr) => arr.map((p, i) => ({ x: Math.round(p[0]), y: Math.round(p[1]), id: 30 + i, radiusX: 12, radiusY: 12, force: 1 }));
  const send = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts(points) });

  const chainAt = (x, y) =>
    page.evaluate(([px, py]) => {
      let el = document.elementFromPoint(px, py);
      const first = el;
      const chain = [];
      while (el && el !== document.documentElement) {
        chain.push(`${el.tagName.toLowerCase()}${el.getAttribute("data-hud") ? `[${el.getAttribute("data-hud")}]` : ""}:${getComputedStyle(el).touchAction}`);
        el = el.parentElement;
      }
      return { on: first ? `${first.tagName.toLowerCase()}${first.getAttribute("data-hud") ? `[${first.getAttribute("data-hud")}]` : ""}` : null, resolved: getComputedStyle(first ?? document.body).touchAction, chain: chain.slice(0, 5) };
    }, [x, y]);

  /** Put the visual viewport back where it started so samples do not compound. */
  const reset = async (cx, cy) => {
    await send("touchStart", [[cx - 120, cy], [cx + 120, cy]]);
    for (const s of [90, 60, 30, 10]) {
      await send("touchMove", [[cx - s, cy], [cx + s, cy]]);
      await sleep(40);
    }
    await send("touchEnd", []);
    await sleep(400);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await sleep(200);
  };

  const GESTURES = {
    // One finger, horizontal — a document pan / rubber-band overscroll.
    drag1: async (cx, cy) => {
      await send("touchStart", [[cx + 110, cy]]);
      for (const dx of [80, 40, 0, -40, -80, -110]) {
        await send("touchMove", [[cx + dx, cy]]);
        await sleep(35);
      }
      await send("touchEnd", []);
    },
    // Two fingers moving together — some engines route this to the visual
    // viewport even when one finger would have been swallowed by the canvas.
    drag2: async (cx, cy) => {
      const off = 45;
      await send("touchStart", [[cx + 110 - off, cy], [cx + 110 + off, cy]]);
      for (const dx of [80, 40, 0, -40, -80, -110]) {
        await send("touchMove", [[cx + dx - off, cy], [cx + dx + off, cy]]);
        await sleep(35);
      }
      await send("touchEnd", []);
    },
    // The gesture the shipped fix was written for.
    pinch: async (cx, cy, spread = 120) => {
      await send("touchStart", [[cx - 12, cy], [cx + 12, cy]]);
      for (const s of [30, 55, 80, 100, spread]) {
        await send("touchMove", [[cx - s, cy], [cx + s, cy]]);
        await sleep(45);
      }
      await send("touchEnd", []);
    },
    // iOS double-tap-to-zoom. `manipulation` kills it; `auto` does not.
    dbltap: async (cx, cy) => {
      for (let i = 0; i < 2; i += 1) {
        await send("touchStart", [[cx, cy]]);
        await sleep(30);
        await send("touchEnd", []);
        await sleep(90);
      }
    },
    // THE SCREEN-EDGE SWIPE. On iOS this is a UIKit interactive-pop recogniser
    // that lives ABOVE the web content: no `touch-action`, no
    // `preventDefault()`, no meta tag can cancel it, and Chromium has no such
    // recogniser at all. What this row can honestly report is whether the PAGE
    // moves — not whether Safari's back gesture fires.
    edgeswipe: async (_cx, cy) => {
      await send("touchStart", [[2, cy]]);
      for (const x of [20, 60, 110, 170, 230]) {
        await send("touchMove", [[x, cy]]);
        await sleep(35);
      }
      await send("touchEnd", []);
    },
  };

  const targets = await page.evaluate(() => {
    const out = {};
    const c = document.querySelector("canvas");
    if (c) {
      const r = c.getBoundingClientRect();
      out.road = [Math.round(r.x + r.width / 2), Math.round(r.y + r.height * 0.42)];
    }
    for (const sel of ["[data-sim-overlay-card]", '[data-hud="notify-column"]', '[role="dialog"]']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 24 && r.height > 24 && getComputedStyle(el).display !== "none") {
        out.card = [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
        out.cardSel = sel;
        break;
      }
    }
    const rail = document.querySelector('[data-hud="top-rail"]') ?? document.querySelector("header");
    out.rail = rail
      ? (() => {
          const r = rail.getBoundingClientRect();
          return [Math.round(r.x + r.width / 2), Math.round(r.y + Math.min(r.height, 44) / 2)];
        })()
      : [Math.round(innerWidth / 2), 24];
    return out;
  });
  rec.slide = { targets, samples: [] };

  for (const [tname, pt] of Object.entries(targets)) {
    if (!Array.isArray(pt)) continue;
    for (const [gname, fire] of Object.entries(GESTURES)) {
      const before = await page.evaluate(VIEWPORT_PROBE);
      const chain = await chainAt(pt[0], pt[1]);
      await fire(pt[0], pt[1]);
      await sleep(500);
      const after = await page.evaluate(VIEWPORT_PROBE);
      rec.slide.samples.push({
        target: tname,
        gesture: gname,
        at: pt,
        touch: chain,
        before,
        after,
        moved:
          after.scale > before.scale + 0.02 ||
          Math.abs(after.offsetLeft - before.offsetLeft) > 2 ||
          Math.abs(after.offsetTop - before.offsetTop) > 2 ||
          Math.abs(after.scrollX - before.scrollX) > 2 ||
          Math.abs(after.scrollY - before.scrollY) > 2,
        overflowX: after.scrollWidth - after.clientWidth,
      });
      await reset(pt[0], pt[1]);
    }
  }
  const moved = rec.slide.samples.filter((s) => s.moved);
  log(`  §A slide — ${rec.slide.samples.length} gesture×target samples, ${moved.length} MOVED${moved.length ? `: ${moved.map((m) => `${m.target}/${m.gesture}`).join(", ")}` : ""}`);
}

/**
 * §A2 · THE OTHER „IT MOVES", AND THE ONE DOC 91 SAYS IS STILL OPEN.
 *
 * §L2/§N1: „Every driving control moves under his thumb when the browser chrome
 * changes. A −44 px viewport-height change (Safari's URL bar appearing — a
 * routine event) moved all ten controls 43–44 px; −90 px moved them 71–75 px;
 * +44 px moved them by DIFFERENT amounts per station (pad +44, «Пауза» +22), so
 * the arc bunches and spreads as well as slides." §N1 calls it „⚠ THE MOST
 * IMPORTANT OMISSION IN §I" — his own sentence, root-caused to file and line,
 * and no fix row was ever written.
 *
 * A pinch is not the only thing that makes a page look like it is sliding, and
 * this one happens WITHOUT HIM TOUCHING ANYTHING: Safari's URL bar retracts as
 * he drives. So the height is changed under a live session and every control is
 * re-measured at its own centre. `setViewportSize` is the honest emulation —
 * it moves `innerHeight` AND `visualViewport.height` together, which is what
 * the browser chrome does.
 */
async function sectionChrome(page, cdp, device, rec) {
  // `page.setViewportSize` refuses on a maximized browser window
  // ("To resize minimized/maximized/fullscreen window, restore it first"), so
  // the height is moved through the emulation layer instead — which is also
  // the truer model: Safari's chrome does not resize the WINDOW, it changes the
  // viewport the page is given.
  const setH = async (h) => {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: device.width,
      height: h,
      deviceScaleFactor: device.dpr,
      mobile: true,
    });
  };
  const census = () =>
    page.evaluate(() => {
      const out = {};
      for (const el of document.querySelectorAll("button,[role=slider],[role=button]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) continue;
        const key = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("data-hud") || "").replace(/\s+/g, " ").trim().slice(0, 28);
        if (!key || out[key]) continue;
        out[key] = [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
      }
      return { controls: out, innerH: window.innerHeight, vvH: Math.round(window.visualViewport?.height ?? window.innerHeight), simVh: getComputedStyle(document.documentElement).getPropertyValue("--sim-vh").trim() };
    });

  const base = await census();
  const out = { base: { innerH: base.innerH, vvH: base.vvH, simVh: base.simVh, n: Object.keys(base.controls).length }, deltas: [] };
  for (const dh of [-44, -90, 44]) {
    await setH(device.height + dh);
    await sleep(900);
    const now = await census();
    const moves = [];
    for (const [k, p] of Object.entries(base.controls)) {
      const q = now.controls[k];
      if (!q) {
        moves.push({ control: k, gone: true });
        continue;
      }
      moves.push({ control: k, dx: q[0] - p[0], dy: q[1] - p[1] });
    }
    const dys = moves.filter((m) => !m.gone).map((m) => Math.abs(m.dy));
    out.deltas.push({
      viewportDelta: dh,
      innerH: now.innerH,
      simVh: now.simVh,
      moved: moves.filter((m) => !m.gone && (Math.abs(m.dy) > 2 || Math.abs(m.dx) > 2)).length,
      of: moves.length,
      minDy: dys.length ? Math.min(...dys) : null,
      maxDy: dys.length ? Math.max(...dys) : null,
      // The tell that it BUNCHES rather than merely slides: the stations move
      // by DIFFERENT amounts, so the arc's spacing changes as well as its place.
      spread: dys.length ? Math.max(...dys) - Math.min(...dys) : null,
      samples: moves.slice(0, 12),
    });
    await setH(device.height);
    await sleep(700);
  }
  await cdp.send("Emulation.clearDeviceMetricsOverride").catch(() => {});
  rec.chrome = out;
  for (const d of out.deltas) {
    log(`  §A2 chrome ${String(d.viewportDelta).padStart(3)}px → ${d.moved}/${d.of} controls moved, |dy| ${d.minDy}–${d.maxDy} px (spread ${d.spread})`);
  }
}

/**
 * THE POSITIVE CONTROL. Doc 91 §T1: "the instrument was blind. All of it."
 * A pinch on /theory MUST zoom. If it does not, every zero above is worthless
 * and this run must say so rather than publish them.
 */
async function pinchControl(page, cdp, base) {
  await page.goto(`${base}/theory`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
  await sleep(2500);
  const before = await page.evaluate(VIEWPORT_PROBE);
  const cx = await page.evaluate(() => Math.round(innerWidth / 2));
  const cy = await page.evaluate(() => Math.round(innerHeight / 2));
  const pts = (s) => [
    { x: cx - s, y: cy, id: 71, radiusX: 12, radiusY: 12, force: 1 },
    { x: cx + s, y: cy, id: 72, radiusX: 12, radiusY: 12, force: 1 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pts(12) });
  for (const s of [30, 55, 80, 105, 130]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: pts(s) });
    await sleep(45);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(600);
  const after = await page.evaluate(VIEWPORT_PROBE);
  return { path: "/theory", before, after, zoomed: after.scale > before.scale + 0.05 };
}

// =============================================================================
// §B · THE SIDES — every painted leaf against the SAFE-AREA box
// =============================================================================
const LEAF_SWEEP = (safe) =>
  ((s) => {
    const box = { left: s.left, top: s.top, right: innerWidth - s.right, bottom: innerHeight - s.bottom };
    const out = [];
    const walk = (el) => {
      if (!(el instanceof Element)) return;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return;
      const kids = Array.from(el.children);
      // ── SVG INTERNALS ARE NOT PAINTED LEAVES, AND COUNTING THEM WAS THE
      //    FIRST VERSION'S BUG. A <polygon> inside an <svg> reports a
      //    getBoundingClientRect in the SVG's own user space; the first run of
      //    this file reported "18 leaves outside the safe box, worst 1879.7 px"
      //    and every one of the top ten was a <polygon>/<path>/<rect> whose
      //    parent <svg> clips it to a 40 px icon. Recurse INTO the <svg>
      //    element itself (it is a real box) and stop there.
      if (el.ownerSVGElement) return;
      const r = el.getBoundingClientRect();
      const painted =
        r.width >= 6 &&
        r.height >= 6 &&
        (kids.length === 0 ||
          (cs.backgroundImage !== "none") ||
          (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") ||
          el.tagName === "CANVAS" ||
          el.tagName === "IMG" ||
          el.tagName === "SVG");
      if (painted && !el.closest("[hidden]")) {
        const overL = box.left - r.left;
        const overR = r.right - box.right;
        const overT = box.top - r.top;
        const overB = r.bottom - box.bottom;
        const worst = Math.max(overL, overR, overT, overB);
        if (worst > 1) {
          out.push({
            tag: el.tagName.toLowerCase(),
            hud: el.getAttribute("data-hud") ?? el.getAttribute("data-sim-overlay") ?? null,
            cls: (el.getAttribute("class") ?? "").slice(0, 60),
            text: (el.textContent ?? "").trim().slice(0, 40),
            rect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
            out: { l: +overL.toFixed(1), r: +overR.toFixed(1), t: +overT.toFixed(1), b: +overB.toFixed(1) },
            worst: +worst.toFixed(1),
            pos: cs.position,
          });
        }
      }
      for (const k of kids) walk(k);
    };
    walk(document.body);
    return {
      box,
      viewport: { w: innerWidth, h: innerHeight },
      envSeenByEngine: (() => {
        const p = document.createElement("div");
        p.style.cssText = "position:fixed;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
        document.body.appendChild(p);
        const c = getComputedStyle(p);
        const v = [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((x) => Math.round(parseFloat(x) || 0));
        p.remove();
        return v;
      })(),
      // HIS WORD IS „SIDES", SO THE SIDES GET THEIR OWN COUNT. The top band is
      // deliberately NOT paid back (devices.mjs: globals.css pays left/right/
      // bottom on <body> and not top, because in a Safari tab the browser
      // chrome already owns that strip and env(safe-area-inset-top) is 0
      // there). Folding that design decision into one "offenders" number would
      // report <body> itself as a defect on every run for ever.
      sideOffenders: out.filter((o) => o.out.l > 1 || o.out.r > 1).sort((a, b) => Math.max(b.out.l, b.out.r) - Math.max(a.out.l, a.out.r)).slice(0, 10),
      sideCount: out.filter((o) => o.out.l > 1 || o.out.r > 1).length,
      bottomCount: out.filter((o) => o.out.b > 1).length,
      offenders: out.sort((a, b) => b.worst - a.worst).slice(0, 12),
      count: out.length,
    };
  })(safe);

// =============================================================================
// §C · THE NOTIFICATIONS
// =============================================================================
const CARD_PROBE = () => {
  const shell = document.querySelector("[data-sim-shell]");
  const card =
    document.querySelector("[data-sim-overlay-card]") ??
    document.querySelector('[role="alertdialog"]') ??
    document.querySelector('[role="dialog"]') ??
    document.querySelector('[data-hud="notify-column"]');
  if (!card) {
    return {
      cardFound: false,
      overlayActive: shell?.getAttribute("data-sim-overlay-active") ?? null,
      overlayKind: null,
    };
  }
  const r = card.getBoundingClientRect();
  const cs = getComputedStyle(card);
  const text = (card.textContent ?? "").replace(/\s+/g, " ").trim();
  // The acknowledgement, and whether anything is standing on it.
  let ack = null;
  for (const b of card.querySelectorAll("button")) {
    const t = (b.textContent ?? "").trim();
    if (/разбрах/i.test(t) || b.hasAttribute("data-hud-close")) {
      const br = b.getBoundingClientRect();
      const cx = Math.round(br.x + br.width / 2);
      const cy = Math.round(br.y + br.height / 2);
      const hit = document.elementFromPoint(cx, cy);
      ack = {
        label: t.slice(0, 40),
        rect: [+br.x.toFixed(1), +br.y.toFixed(1), +br.width.toFixed(1), +br.height.toFixed(1)],
        centre: [cx, cy],
        inViewport: br.x >= 0 && br.y >= 0 && br.right <= innerWidth + 1 && br.bottom <= innerHeight + 1,
        // „nothing happens" when you press it: the press lands on something else.
        hitIsSelf: hit === b || b.contains(hit),
        hitIs: hit ? `${hit.tagName.toLowerCase()}${hit.getAttribute("data-hud") ? `[${hit.getAttribute("data-hud")}]` : ""}` : null,
      };
      break;
    }
  }
  return {
    cardFound: true,
    overlayActive: shell?.getAttribute("data-sim-overlay-active") ?? null,
    overlayKind: card.getAttribute("data-sim-overlay") ?? card.getAttribute("role") ?? null,
    rect: [+r.x.toFixed(1), +r.y.toFixed(1), +r.width.toFixed(1), +r.height.toFixed(1)],
    // „nothing shows" — an empty card and an off-screen card are different bugs.
    textLen: text.length,
    text: text.slice(0, 220),
    visible: cs.display !== "none" && cs.visibility !== "hidden" && Number(cs.opacity) > 0.05,
    opacity: Number(cs.opacity),
    inViewport: r.x > -1 && r.y > -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
    clippedBy: [
      r.x < 0 ? `left ${Math.round(-r.x)}` : null,
      r.right > innerWidth ? `right ${Math.round(r.right - innerWidth)}` : null,
      r.y < 0 ? `top ${Math.round(-r.y)}` : null,
      r.bottom > innerHeight ? `bottom ${Math.round(r.bottom - innerHeight)}` : null,
    ].filter(Boolean),
    ack,
  };
};

/**
 * The speed the STUDENT reads, off the instrument cluster's own aria-label
 * („Скорост 23 километра в час" — StatusDashboard.tsx:433). Not a private hook:
 * if this label ever stops describing the number on the glass, a screen-reader
 * user is being lied to and the probe should break.
 */
const SPEED_PROBE = () => {
  for (const el of document.querySelectorAll('[aria-label^="Скорост "]')) {
    const m = (el.getAttribute("aria-label") ?? "").match(/Скорост\s+([\d.,]+)/);
    if (m) return Number(m[1].replace(",", "."));
  }
  const m = (document.body.innerText || "").match(/(\d+)\s*\n?\s*км\/ч/);
  return m ? Number(m[1]) : null;
};

async function canvasHash(page) {
  const box = await page.evaluate(() => {
    const c = document.querySelector("canvas");
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return { x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)), width: Math.max(8, Math.round(r.width)), height: Math.max(8, Math.round(r.height)) };
  });
  if (!box) return null;
  const buf = await page.screenshot({ clip: box }).catch(() => null);
  return buf ? createHash("sha1").update(buf).digest("hex").slice(0, 12) : null;
}

async function sectionNotify(page, cdp, device, rec) {
  const out = { steps: [] };
  // Provoke a teach moment the way a student does: hold the throttle.
  await page.keyboard.down("KeyW");
  const appeared = await page
    .locator('[data-sim-overlay-card], [role="dialog"], [role="alertdialog"]')
    .first()
    .waitFor({ state: "visible", timeout: 25_000 })
    .then(() => true)
    .catch(() => false);
  out.cardAppeared = appeared;
  await sleep(300);

  // ── DOES ANYTHING SHOW? ────────────────────────────────────────────────────
  out.card = await page.evaluate(CARD_PROBE);
  // A FRAME OF THE SCREEN WITH THE CARD ON IT. „nothing shows" is a claim about
  // a picture; a JSON field saying `visible: true` is not an answer to it.
  out.shot = join(OUT, "shots", `${TAG}-${device.id}-notify-cardup.png`);
  await page.screenshot({ path: out.shot }).catch(() => {});

  // ── „NOTHING HAPPENS" — THE OTHER READING, AND THE ONE THE AUDIT ALREADY
  //    FOUND ONCE. Doc 91 §W2: with an expanded panel up, `elementFromPoint`
  //    at each rail button's OWN CENTRE answered the card — „iPhone 16
  //    landscape 4 of 4 buried". A student pressing «Клаксон» while a
  //    notification is on screen presses the notification. Nothing happens,
  //    exactly as he says, and nothing about the card looks wrong in a
  //    screenshot. So: hit-test EVERY control at its own centre, with the card
  //    up, and name what answers instead.
  out.buried = await page.evaluate(() => {
    const rows = [];
    for (const el of document.querySelectorAll("button,[role=slider],[role=button],[role=radio]")) {
      const r = el.getBoundingClientRect();
      if (r.width < 20 || r.height < 20) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) continue;
      const cx = Math.round(r.x + r.width / 2);
      const cy = Math.round(r.y + r.height / 2);
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) {
        rows.push({ control: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30), offscreen: true });
        continue;
      }
      const hit = document.elementFromPoint(cx, cy);
      const mine = hit === el || el.contains(hit) || (hit && hit.contains(el));
      if (!mine) {
        let owner = hit;
        let tag = null;
        while (owner && owner !== document.body) {
          const d = owner.getAttribute("data-hud") || owner.getAttribute("data-sim-overlay") || owner.getAttribute("data-sim-overlay-card");
          if (d) {
            tag = d;
            break;
          }
          owner = owner.parentElement;
        }
        rows.push({
          control: (el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 30),
          rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
          answeredBy: hit ? `${hit.tagName.toLowerCase()}${tag ? `[${tag}]` : ""}` : null,
          answeredText: (hit?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40),
        });
      }
    }
    return { dead: rows, total: document.querySelectorAll("button,[role=slider],[role=button],[role=radio]").length };
  });

  // ── DOES THE CAR STILL ANSWER THE PEDAL? The throttle is STILL HELD. ───────
  const s0 = await page.evaluate(SPEED_PROBE);
  const h0 = await canvasHash(page);
  await sleep(1600);
  const s1 = await page.evaluate(SPEED_PROBE);
  const h1 = await canvasHash(page);
  out.withCardUp = {
    throttleHeld: true,
    speedStart: s0,
    speedEnd: s1,
    speedMoved: s0 !== null && s1 !== null ? Math.abs(s1 - s0) > 0.4 : null,
    canvasHashStart: h0,
    canvasHashEnd: h1,
    // The literal reading of „everything stop": the picture is not changing.
    worldFrozen: h0 !== null && h0 === h1,
  };
  await page.keyboard.up("KeyW");
  await sleep(300);

  // ── CAN A THUMB DISMISS IT? A REAL TOUCH, not a mouse click. ──────────────
  const ack = out.card?.ack ?? null;
  if (ack && cdp) {
    const p = [{ x: ack.centre[0], y: ack.centre[1], id: 91, radiusX: 14, radiusY: 14, force: 1 }];
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: p });
    await sleep(70);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await sleep(900);
  }
  const after = await page.evaluate(CARD_PROBE);
  out.dismissedByThumb = ack ? !after.cardFound || after.overlayKind !== out.card.overlayKind : null;
  out.afterThumb = after;

  // ── DOES THE WORLD COME BACK? „everything stop" may be a pause that never
  //    lifts, which is a different bug from a blank card. ────────────────────
  await page.keyboard.down("KeyW");
  const r0 = await page.evaluate(SPEED_PROBE);
  const g0 = await canvasHash(page);
  await sleep(1800);
  const r1 = await page.evaluate(SPEED_PROBE);
  const g1 = await canvasHash(page);
  await page.keyboard.up("KeyW");
  out.afterDismiss = {
    speedStart: r0,
    speedEnd: r1,
    speedMoved: r0 !== null && r1 !== null ? Math.abs(r1 - r0) > 0.4 : null,
    canvasHashStart: g0,
    canvasHashEnd: g1,
    worldFrozen: g0 !== null && g0 === g1,
  };
  rec.notify = out;
  log(
    `  §C notify — card=${out.cardAppeared} shows=${out.card?.visible ?? "n/a"} textLen=${out.card?.textLen ?? 0} ` +
      `inViewport=${out.card?.inViewport ?? "n/a"} ackHitsSelf=${ack?.hitIsSelf ?? "n/a"} ` +
      `frozenWithCard=${out.withCardUp.worldFrozen} thumbDismissed=${out.dismissedByThumb} resumed=${!out.afterDismiss.worldFrozen}`,
  );
  log(
    `  §C buried — ${out.buried.dead.length} of ${out.buried.total} controls do NOT answer at their own centre while the card is up` +
      (out.buried.dead.length
        ? `: ${out.buried.dead.slice(0, 6).map((d) => `${d.control || "?"}→${d.answeredBy ?? (d.offscreen ? "OFFSCREEN" : "?")}`).join(" · ")}`
        : ""),
  );
}

// =============================================================================
// MAIN
// =============================================================================
const browser = await chromium.launch({ args: GL });
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();
log(`signed in ONCE as ${EMAIL} against ${BASE} · tag "${TAG}" · sections ${SECTIONS.join(",")}`);

const results = [];

for (const device of devices) {
  const inset = insetsFor(device, { mode: "real" });

  // ── §D · RESOLUTION — one context per tier, because the tier is read at mount
  if (want("res")) {
    for (const tier of TIERS) {
      const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
      await context.addInitScript(pageInstrument, { tier });
      const page = await context.newPage();
      const row = { device: device.id, section: "res", tag: TAG, tier, viewport: `${device.width}x${device.height}`, panelDpr: device.dpr, inset: insetBanner(device, inset) };
      try {
        await enterDrive(page, BASE, {});
        const live = await gate(page);
        row.path = live.path;
        row.css = `${live.css.w}x${live.css.h}`;
        row.backingStore = `${live.buf.w}x${live.buf.h}`;
        row.megapixels = +((live.buf.w * live.buf.h) / 1e6).toFixed(2);
        row.appliedDpr = +(live.buf.w / live.css.w).toFixed(3);
        row.panelDprSeen = live.panelDpr;
        row.renderer = live.renderer;
        row.storedPreset = await page.evaluate(() => window.localStorage.getItem("sim.quality"));
        row.ledger = await page.evaluate(() => window.localStorage.getItem("aidrive.sim.quality.ledger.v1"));
        await clearBelt(page);
        // Coast, do not hold: holding reaches ~55 км/ч in a 50 zone and
        // «Несъобразена скорост» pauses the world mid-window.
        await page.keyboard.down("KeyW");
        await sleep(1400);
        await page.keyboard.up("KeyW");
        await sleep(1600);
        await page.getByRole("button", { name: /РАЗБРАХ|Разбрах/ }).first().click({ timeout: 4_000 }).catch(() => {});
        await sleep(700);
        await page.evaluate(() => window.__w9Start());
        const report = await page.evaluate(async () => (await window.__simPerf?.gpu(5)) ?? null);
        const harness = await page.evaluate(() => window.__w9Stop());
        // `gpuMsPerFrameTotal` is the app timer's own name for the sum over
        // every pass; `rows[]` carries the per-pass breakdown. Reading a key
        // that does not exist and printing "?" is how a perf column becomes
        // decoration — perf-passes.mjs shipped exactly that defect.
        row.gpuMsPerFrame = report?.gpuMsPerFrameTotal != null ? +report.gpuMsPerFrameTotal.toFixed(2) : null;
        row.drawsPerFrame = Array.isArray(report?.rows)
          ? +report.rows.reduce((a, r) => a + (r.drawsPerFrame || 0), 0).toFixed(1)
          : null;
        row.wallMsPerFrame = report?.wallMsPerFrame != null ? +report.wallMsPerFrame.toFixed(2) : null;
        row.harnessFps = harness.wallMs > 0 ? +(harness.frames / (harness.wallMs / 1000)).toFixed(1) : 0;
        row.passes = Array.isArray(report?.rows)
          ? report.rows
              .slice(0, 8)
              .map((r) => ({ key: r.key, label: r.label, ms: +Number(r.gpuMsPerFrame).toFixed(3), draws: +Number(r.drawsPerFrame).toFixed(1) }))
          : null;
        const shot = join(OUT, "shots", `${TAG}-${device.id}-${tier}.png`);
        await page.screenshot({ path: shot });
        row.shot = shot;
        log(`  §D res ${device.id} ${tier.padEnd(4)} → dpr ${String(row.appliedDpr).padEnd(5)} ${row.backingStore.padEnd(11)} ${row.megapixels}MP  gpu ${row.gpuMsPerFrame ?? "?"}ms  draws ${row.drawsPerFrame ?? "?"}  fps ${row.harnessFps}`);
      } catch (e) {
        row.error = String(e.message).slice(0, 300);
        log(`  §D res ${device.id} ${tier} REFUSED — ${row.error}`);
      }
      results.push(row);
      await context.close();
    }
  }

  // ── §A/§B/§C — one driving session carries all three
  if (want("slide") || want("sides") || want("notify")) {
    const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
    await context.addInitScript(pageInstrument, { tier: "auto" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const rec = { device: device.id, section: "symptoms", tag: TAG, viewport: `${device.width}x${device.height}`, panelDpr: device.dpr, inset: insetBanner(device, inset), safeArea: inset };
    console.log(`\n${"=".repeat(90)}\n${device.label}\n  ${rec.inset}`);
    try {
      await enterDrive(page, BASE, {});
      const live = await gate(page);
      rec.gate = { path: live.path, canvas: live.css, buf: live.buf, appliedDpr: +(live.buf.w / live.css.w).toFixed(3), compact: live.compact };
      log(`  gate OK — ${live.path} canvas ${live.css.w}×${live.css.h}, buffer ${live.buf.w}×${live.buf.h} (dpr ${rec.gate.appliedDpr})`);

      if (want("sides")) {
        rec.sides = {};
        for (const state of ["idle", "card", "menu"]) {
          if (state === "card") {
            await page.keyboard.down("KeyW");
            await page.locator("[data-sim-overlay-card], [role=dialog]").first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
            await page.keyboard.up("KeyW");
            await sleep(500);
          }
          if (state === "menu") {
            await page.getByRole("button", { name: /Меню|Menu/ }).first().click({ timeout: 6_000 }).catch(() => {});
            await sleep(600);
          }
          rec.sides[state] = await page.evaluate(LEAF_SWEEP, { top: inset.top, right: inset.right, bottom: inset.bottom, left: inset.left });
          const shot = join(OUT, "shots", `${TAG}-${device.id}-sides-${state}.png`);
          await page.screenshot({ path: shot });
          rec.sides[state].shot = shot;
          log(`  §B sides/${state.padEnd(4)} — ${rec.sides[state].count} painted leaves outside the safe box (worst ${rec.sides[state].offenders[0]?.worst ?? 0} px: ${rec.sides[state].offenders[0]?.hud ?? rec.sides[state].offenders[0]?.tag ?? "—"})`);
          if (state === "menu") await page.keyboard.press("Escape").catch(() => {});
          await sleep(400);
        }
      }

      if (want("slide")) await sectionSlide(page, cdp, device, rec);
      if (want("slide")) await sectionChrome(page, cdp, device, rec);
      if (want("slide")) {
        rec.pinchControl = await pinchControl(page, cdp, BASE);
        log(`  §A control — /theory pinch ${rec.pinchControl.before.scale} → ${rec.pinchControl.after.scale} (${rec.pinchControl.zoomed ? "INSTRUMENT ALIVE" : "INSTRUMENT DEAD — every zero above is worthless"})`);
      }
    } catch (e) {
      rec.error = String(e.message).slice(0, 400);
      log(`  REFUSED — ${rec.error}`);
    }
    results.push(rec);
    await context.close();
  }

  // ── §C · NOTIFICATIONS — ITS OWN SESSION, AND THAT IS NOT TIDINESS.
  //    The first run of this file ran §C after §B on the same page and caught
  //    „Сесията завърши — първо се самооцени": §B's card state holds the
  //    throttle and its menu state opens the lesson menu, and by the time §C
  //    asked for a teach card the SESSION HAD ENDED. It then reported a frozen
  //    world and a card with no acknowledgement — both true, and both about the
  //    end-of-session line rather than about a notification. A fresh context is
  //    the only way "raise a teach card MID-DRIVE" means what it says.
  if (want("notify")) {
    const { context } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
    await context.addInitScript(pageInstrument, { tier: "auto" });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const rec = { device: device.id, section: "notify", tag: TAG, viewport: `${device.width}x${device.height}`, inset: insetBanner(device, inset) };
    try {
      await enterDrive(page, BASE, {});
      const live = await gate(page);
      rec.gate = { path: live.path, canvas: live.css };
      await sectionNotify(page, cdp, device, rec);
      const shot = join(OUT, "shots", `${TAG}-${device.id}-notify-card.png`);
      rec.shot = shot;
    } catch (e) {
      rec.error = String(e.message).slice(0, 400);
      log(`  §C REFUSED — ${rec.error}`);
    }
    results.push(rec);
    await context.close();
  }
}

await browser.close();
const file = join(OUT, `${TAG}.json`);
writeFileSync(file, JSON.stringify(results, null, 2));
log(`\nwrote ${file}`);
