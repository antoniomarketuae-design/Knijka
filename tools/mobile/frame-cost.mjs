#!/usr/bin/env node
// =============================================================================
// frame-cost.mjs — WHAT A FRAME COSTS ON A PHONE-SHAPED VIEWPORT, ON THE REAL
// PRODUCTION BUILD, WITH THE INSTRUMENT'S OWN HEALTH PRINTED BESIDE EVERY
// NUMBER.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
// Doc 91 §G measured the phone frame on a `next dev` build and found that
// 32-36 % of CPU self time was React's dev-only JSX factory. A third of the
// cost disappearing in production does not scale the profile down — it changes
// its SHAPE, so every optimisation sized against those numbers was sized
// against noise. §J Wave 0b says so in one line: "Build production once and
// repeat the perf sweep."
//
// And doc 91 §G0 is the other half: the same viewport, same machine, produced
// 3.1 / 12.1 / 47.6 / 57.8 fps in four different lanes. Wave 1 published "the
// mirror glances are dead" from a rig running at 0.4 fps. So this tool refuses
// to print a millisecond without printing, on the same row, what the harness
// itself was doing: the WebGL renderer string, the frames it actually saw, and
// the wall time it saw them over. A timing measured at 0.4 fps is not a
// measurement, and a reader must be able to see that from the table.
//
// ── WHAT IT MEASURES, PER PROFILE × TIER ────────────────────────────────────
//  1. Frame time distribution — median / p95 / worst, from rAF deltas, in TWO
//     regimes because they answer different questions:
//       · CAPPED   (vsync on)  — what a 60 Hz panel shows. Saturates at
//         16.7 ms: an 8 ms frame and a 15 ms frame are the same number here.
//         This is the one that answers "is it smooth".
//       · UNCAPPED (--disable-gpu-vsync --disable-frame-rate-limit) — the CPU
//         submission rate with the wait removed. This is the one that answers
//         "how much main-thread work is in a frame", which is the question
//         doc 91 §G2 says is binding. It is a CPU number and is labelled as
//         one; it is NOT fps.
//  2. The BACKING STORE — gl.drawingBufferWidth/Height read off the live
//     context, beside the CSS size and window.devicePixelRatio. Doc 91 §C asks
//     whether the render scale is clamped on mobile at all; this answers it
//     with the number the GPU actually fills, not with the preset's intent.
//  3. DRAW CALLS PER FRAME, counted by patching the WebGL prototypes before the
//     page's first script runs — so it counts every pass (shadow map, mirror
//     RTT, composer), not a static estimate of world meshes.
//  4. THE PAUSED-OVERLAY A/B — the same counters with a real product overlay up
//     and the world paused. If draws/frame does not fall, the scene is being
//     rendered at full cost underneath a card the student is reading.
//  5. REACT COMMITS/s, per reconciler root (react-dom vs the R3F renderer),
//     via a __REACT_DEVTOOLS_GLOBAL_HOOK__ shim installed before React loads.
//  6. rAF LOOP CENSUS — callbacks scheduled per frame, minus this tool's own
//     recorder. >1 means more than one animation loop is driving the page.
//  7. LISTENER CENSUS — addEventListener calls by type, cumulative.
//
// ── HOW TO RUN ──────────────────────────────────────────────────────────────
//   1. Build and serve production (dev routes 404 there, so this drives the
//      REAL authenticated /simulator, which is the surface the founder uses):
//        cd platform
//        KNIJKA_DIST_DIR=.next-w3prod npx next build
//        KNIJKA_DIST_DIR=.next-w3prod npx next start --port 3477 --hostname localhost
//   2. node tools/mobile/frame-cost.mjs --base http://localhost:3477 \
//        --email <admin account> --password <password> --build prod
//
//   --device <id>     one profile instead of all six
//   --tier low,med    tiers to sweep (default low,med)
//   --regime capped,uncapped
//   --seconds 6       length of each measurement window
//
// ── THE INSTRUMENT'S OWN COST, DECLARED ─────────────────────────────────────
// `watchOverlay` runs one trivial `document.querySelector` through CDP every
// 250 ms inside each measurement window — 24 evaluations across a 6-second,
// ~360-frame window. It is declared rather than hidden because a probe that
// perturbs its subject and does not say so is how §G0 happened. It is not
// removable: without it a paused window can wear a driving label, which is a
// much larger error than 24 DOM reads.
//
// ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────────
// NOT ONE MILLISECOND HERE DESCRIBES THE FOUNDER'S HANDSET. Emulation
// reproduces viewport, DPR, touch model, UA and insets. It does not emulate a
// GPU or a mobile memory bus. Every millisecond below is "this desktop at phone
// dimensions". Draw counts, triangle counts and backing-store dimensions ARE
// properties of what the scene asks for, and those transfer.
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner, insetsFor } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { decodePng } from "./lib/ready.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d;
};
const flag = (n) => process.argv.includes(`--${n}`);

const BASE = arg("base", "http://localhost:3477");
const EMAIL = arg("email", process.env.KNIJKA_PERF_EMAIL || "");
const PASSWORD = arg("password", process.env.KNIJKA_PERF_PASSWORD || "");
const BUILD = arg("build", "prod");
const TIERS = arg("tier", "low,med").split(",").filter(Boolean);
const REGIMES = arg("regime", "capped,uncapped").split(",").filter(Boolean);
const SECONDS = Number(arg("seconds", "6"));
const SETTLE_MS = Number(arg("settle", "11000"));
const ONLY = arg("device", null);
const TAG = arg("tag", BUILD);
const OUT = join(HERE, ".out", "frame-cost");
mkdirSync(OUT, { recursive: true });

/** The repo's own GPU recipe (tools/clips/headless/door-mirror-shot.mjs). A run
 *  that falls back to SwiftShader is refused, not reported. */
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
const NOVSYNC_ARGS = [
  "--disable-frame-rate-limit",
  "--disable-gpu-vsync",
  "--disable-gpu-frame-rate-limit",
];

const log = (m) => console.log(`[frame-cost] ${m}`);

// ---------------------------------------------------------------------------
// The page-side instrument. Installed with addInitScript so every patch is in
// place before the app's first module evaluates — a draw counter attached after
// three.js has taken its context reference counts nothing.
// ---------------------------------------------------------------------------
function pageInstrument(seed) {
  try {
    window.localStorage.setItem(
      "aidrive.sim.quality.v1",
      JSON.stringify({ setting: seed.envTier, recommendation: seed.envTier }),
    );
    window.localStorage.setItem("sim.quality", seed.uiTier);
    // The ledger is what `seedQualityLevel()` reads FIRST. Left over from an
    // earlier row it would silently overrule the tier this row is measuring.
    window.localStorage.removeItem("aidrive.sim.quality.ledger.v1");
  } catch {}

  const w3 = {
    draws: 0,
    rafCalls: 0,
    listeners: Object.create(null),
    commits: Object.create(null),
    frames: [],
    drawMarks: [],
    recording: false,
    contexts: [],
  };
  window.__w3 = w3;

  // ---- draw calls, every pass -------------------------------------------
  for (const Proto of [
    typeof WebGL2RenderingContext !== "undefined" ? WebGL2RenderingContext.prototype : null,
    typeof WebGLRenderingContext !== "undefined" ? WebGLRenderingContext.prototype : null,
  ]) {
    if (!Proto) continue;
    for (const name of [
      "drawArrays",
      "drawElements",
      "drawArraysInstanced",
      "drawElementsInstanced",
      "drawRangeElements",
    ]) {
      const original = Proto[name];
      if (typeof original !== "function") continue;
      Proto[name] = function patched(...args) {
        w3.draws += 1;
        return original.apply(this, args);
      };
    }
  }
  // Remember every context so the backing store can be read from the one the
  // simulator actually drew into rather than from a canvas we guessed at.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function patchedGetContext(type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (ctx && /webgl/i.test(String(type))) w3.contexts.push(ctx);
    return ctx;
  };

  // ---- React commits, per reconciler ------------------------------------
  // React looks for this hook at module-evaluation time and calls
  // onCommitFiberRoot once per committed root per commit. Two renderers mount
  // here: react-dom (the HUD) and the R3F reconciler (the canvas tree).
  const hook = {
    renderers: new Map(),
    supportsFiber: true,
    _next: 1,
    inject(renderer) {
      const id = hook._next++;
      hook.renderers.set(id, renderer);
      return id;
    },
    onCommitFiberRoot(id) {
      w3.commits[id] = (w3.commits[id] || 0) + 1;
    },
    onPostCommitFiberRoot() {},
    onCommitFiberUnmount() {},
    checkDCE() {},
    on() {},
    off() {},
    sub() {
      return () => {};
    },
    emit() {},
    getFiberRoots() {
      return new Set();
    },
    isDisabled: false,
  };
  try {
    Object.defineProperty(window, "__REACT_DEVTOOLS_GLOBAL_HOOK__", {
      value: hook,
      configurable: true,
      writable: true,
    });
  } catch {}

  // ---- rAF census --------------------------------------------------------
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = function patchedRaf(cb) {
    w3.rafCalls += 1;
    return raf(cb);
  };

  // ---- listener census ---------------------------------------------------
  const addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function patchedAdd(type, ...rest) {
    w3.listeners[type] = (w3.listeners[type] || 0) + 1;
    return addEventListener.call(this, type, ...rest);
  };

  // ---- the recorder ------------------------------------------------------
  // Its own rAF, so it samples the same cadence the page is running at. Every
  // sample carries the draw counter, so draws/frame is a per-window statistic
  // and not an average over a session that included a paused overlay.
  const tick = (now) => {
    if (w3.recording) {
      w3.frames.push(now);
      w3.drawMarks.push(w3.draws);
    }
    raf(tick);
  };
  raf(tick);

  window.__w3start = () => {
    w3.frames.length = 0;
    w3.drawMarks.length = 0;
    w3.rafAtStart = w3.rafCalls;
    w3.commitsAtStart = JSON.parse(JSON.stringify(w3.commits));
    w3.recording = true;
    w3.t0 = performance.now();
  };
  window.__w3stop = () => {
    w3.recording = false;
    const t1 = performance.now();
    const deltas = [];
    for (let i = 1; i < w3.frames.length; i += 1) deltas.push(w3.frames[i] - w3.frames[i - 1]);
    const drawsInWindow =
      w3.drawMarks.length > 1 ? w3.drawMarks[w3.drawMarks.length - 1] - w3.drawMarks[0] : 0;
    const commitsDelta = {};
    for (const [id, n] of Object.entries(w3.commits)) {
      commitsDelta[id] = n - (w3.commitsAtStart[id] || 0);
    }
    const wallMs = t1 - w3.t0;
    return {
      wallMs,
      frames: w3.frames.length,
      deltas,
      drawsInWindow,
      drawsPerFrame: w3.frames.length > 1 ? drawsInWindow / (w3.frames.length - 1) : 0,
      commitsDelta,
      // Page-side rAF calls per recorded frame, MINUS the one the renderer
      // legitimately schedules to draw. 0.00 = exactly one animation loop is
      // driving the page; > 0 = a second loop is running alongside it. The
      // recorder itself is invisible to this counter: it captured the original
      // `requestAnimationFrame` before the patch went on.
      rafPerFrame:
        w3.frames.length > 1 ? (w3.rafCalls - w3.rafAtStart) / (w3.frames.length - 1) - 1 : 0,
    };
  };

  window.__w3gl = () => {
    const canvas = document.querySelector("canvas");
    const ctx =
      w3.contexts.find((c) => c.canvas === canvas) || w3.contexts[w3.contexts.length - 1] || null;
    let renderer = null;
    if (ctx) {
      try {
        const ext = ctx.getExtension("WEBGL_debug_renderer_info");
        if (ext) renderer = ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      } catch {}
    }
    const rect = canvas ? canvas.getBoundingClientRect() : null;
    return {
      renderer,
      dpr: window.devicePixelRatio,
      cssW: rect ? Math.round(rect.width) : null,
      cssH: rect ? Math.round(rect.height) : null,
      bufW: ctx ? ctx.drawingBufferWidth : null,
      bufH: ctx ? ctx.drawingBufferHeight : null,
      attrW: canvas ? canvas.width : null,
      attrH: canvas ? canvas.height : null,
      contexts: w3.contexts.length,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      listeners: { ...w3.listeners },
      renderers: [...hook.renderers.entries()].map(([id, r]) => ({
        id,
        pkg: r?.rendererPackageName ?? null,
        version: r?.version ?? null,
      })),
    };
  };
}

// ---------------------------------------------------------------------------
// statistics
// ---------------------------------------------------------------------------
const pct = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i];
};
/**
 * Poll the shell's own overlay flag for `ms`, and answer with the FRACTION of
 * samples that had one up.
 *
 * `data-sim-overlay-active` is the shell's existing one-overlay-at-a-time
 * switch, and a `[role=dialog]` catches anything not enrolled in it. Sampling
 * rather than checking once at the end is the point: a teach card that fires at
 * second 3 of a 6-second window and is gone by second 6 would otherwise be
 * invisible, and half the samples would be paused frames wearing a driving
 * label.
 */
function watchOverlay(page, ms) {
  const step = 250;
  return (async () => {
    let seen = 0;
    let n = 0;
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const up = await page
        .evaluate(
          () =>
            document.querySelector("[data-sim-shell]")?.getAttribute("data-sim-overlay-active") !==
              null || document.querySelector('[role="dialog"],[role="alertdialog"]') !== null,
        )
        .catch(() => false);
      if (up) seen += 1;
      n += 1;
      await page.waitForTimeout(step).catch(() => {});
    }
    return n === 0 ? 0 : Number((seen / n).toFixed(2));
  })();
}

/** Fraction of a presented frame that is not near-black, 0–100. */
function inkPercent(png) {
  const { width, height, channels, data } = png;
  let lit = 0;
  let n = 0;
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      const i = y * width * channels + x * channels;
      if (data[i] + data[i + 1] + data[i + 2] > 24) lit += 1;
      n += 1;
    }
  }
  return n === 0 ? 0 : Number(((lit / n) * 100).toFixed(1));
}

function dist(deltas) {
  const s = [...deltas].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: pct(s, 50),
    p95: pct(s, 95),
    max: s.length ? s[s.length - 1] : 0,
  };
}

// ---------------------------------------------------------------------------
// One row
// ---------------------------------------------------------------------------
async function measureRow(browser, device, tier, regime, storageState) {
  const uiTier = tier === "med" ? "medium" : tier;
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    storageState,
  });
  await context.addInitScript(pageInstrument, { envTier: tier, uiTier });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(e.message.slice(0, 120)));

  const row = {
    device: device.id,
    viewport: `${device.width}x${device.height}`,
    profileDpr: device.dpr,
    tier,
    regime,
    build: BUILD,
    inset: `${inset.top}/${inset.right}/${inset.bottom}/${inset.left}`,
  };

  try {
    await page.goto(`${BASE}/simulator`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    // "Карай свободно" is l0-free-drive — the ONLY long-run-safe lesson. Doc 91
    // instrument warning 2: any scenario with a hazard ENDS the lesson, after
    // which __driveRig freezes at its last value and reads like a clean idle.
    const freeDrive = page.getByRole("button", { name: /Карай свободно/ }).first();
    await freeDrive.waitFor({ state: "visible", timeout: 120_000 });
    await freeDrive.click();
    await page.waitForSelector("canvas", { timeout: 120_000 });

    // Doc 91 §G5: the first six seconds of every session are shader compile and
    // texture upload — individual frames of 3.2 s and 4.2 s. Measuring through
    // that window prices a stall, not a frame.
    await page.waitForTimeout(SETTLE_MS);

    // Dismiss the touch-tutorial line so it is not sitting over the controls.
    // (It does not pause the world — verified: `data-sim-overlay-active` is
    // null and the scene renders at full rate behind it.)
    await page
      .getByRole("button", { name: /^Разбрах$/ })
      .first()
      .click({ timeout: 6_000 })
      .catch(() => {});
    await page.waitForTimeout(600);

    const gl = await page.evaluate(() => window.__w3gl());
    row.renderer = gl.renderer;
    row.dprReported = gl.dpr;
    row.css = `${gl.cssW}x${gl.cssH}`;
    row.backingStore = `${gl.bufW}x${gl.bufH}`;
    row.backingPixels = gl.bufW && gl.bufH ? gl.bufW * gl.bufH : null;
    row.cssPixels = gl.cssW && gl.cssH ? gl.cssW * gl.cssH : null;
    row.appliedDpr =
      gl.bufW && gl.cssW ? Number((gl.bufW / gl.cssW).toFixed(3)) : null;
    row.glContexts = gl.contexts;
    row.reactRenderers = gl.renderers;

    if (/swiftshader|software|llvmpipe/i.test(String(gl.renderer))) {
      row.refused = `SwiftShader fallback (${gl.renderer}) — no timing may be quoted`;
      await context.close();
      return row;
    }

    // ---- window B FIRST: the world paused, by the card that really does it --
    //
    // The order is deliberate. `l0-free-drive` hands us a perfectly
    // reproducible paused state for free: drive with the belt undone and within
    // two seconds «УЧЕБЕН МОМЕНТ — Движение без предпазен колан» fires and sets
    // `paused`. That is the exact state the question is about — a teach card
    // the student is reading — and it needs no fragile control hunting.
    //
    // NOT the «МЕНЮ» popover, which was the obvious candidate and is wrong:
    // measured, opening the lesson menu leaves the world running (214.5
    // draws/frame with it open against 216.1 driving), so a "paused" window
    // taken behind the menu would have measured nothing at all.
    const pausedMs = Math.max(3, Math.round(SECONDS * 0.7)) * 1000;
    await page.keyboard.down("KeyW");
    row.overlayOpened = await page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__w3start());
    const pausedWatch = watchOverlay(page, pausedMs);
    await page.waitForTimeout(pausedMs);
    const paused = await page.evaluate(() => window.__w3stop());
    row.paused = { ...dist(paused.deltas), ...summarize(paused), overlaySeen: await pausedWatch };

    // R0, LOOK BEFORE YOU SHIP: a "demand" frameloop that renders nothing is
    // indistinguishable from a saving in the counters and obvious to the eye.
    // The shot is of the PAGE, from the compositor, not a `drawImage` readback
    // of the canvas: `preserveDrawingBuffer` is false, so a readback taken
    // outside a paint returns an empty buffer and reads as "black screen" on a
    // scene that is perfectly visible. Measured: the readback said 0 % ink on a
    // frame the compositor screenshot shows in full colour. What is on the
    // student's screen is what the compositor presented.
    mkdirSync(join(OUT, "shots"), { recursive: true });
    row.pausedShot = join(OUT, "shots", `${TAG}-${device.id}-${tier}-${regime}-paused.png`);
    const shot = await page.screenshot().catch(() => null);
    if (shot) {
      writeFileSync(row.pausedShot, shot);
      try {
        row.pausedInk = inkPercent(decodePng(shot));
      } catch {
        row.pausedInk = null;
      }
    } else {
      row.pausedShot = null;
    }

    // ---- window A: driving, and the proof the loop comes back --------------
    //
    // Dismiss the card, fasten the belt so it cannot fire again, and drive. A
    // "demand" frameloop's real risk is not a slow scene, it is a scene that
    // never restarts — so this window is both the driving measurement and the
    // resume check, and the watchdog has to read 0 for it to count as either.
    //
    // Keyboard, not the touch pad: the pad is a pointer gesture that has to be
    // held by a real finger, and doc 91 instrument warning 4 records two waves
    // publishing false verdicts from the rig's injected throttle.
    await page
      .getByRole("button", { name: /РАЗБРАХ|Разбрах/ })
      .first()
      .click({ timeout: 8_000 })
      .catch(() => {});
    await page.waitForTimeout(600);
    row.beltFastened = await page
      .getByRole("button", { name: /Закопчай предпазния колан/ })
      .first()
      .click({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(900);

    // Up to three attempts: a teach card firing mid-window does not make the
    // box slow, it makes the row a different measurement, and doc 91's
    // instrument rule is to REFUSE the row rather than publish it.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__w3start());
      const watch = watchOverlay(page, SECONDS * 1000);
      await page.waitForTimeout(SECONDS * 1000);
      const drive = await page.evaluate(() => window.__w3stop());
      await page.keyboard.up("KeyW");
      const overlaySeen = await watch;
      row.drive = { ...dist(drive.deltas), ...summarize(drive), overlaySeen, attempt };
      if (overlaySeen === 0) break;
      await page
        .getByRole("button", { name: /РАЗБРАХ|Разбрах/ })
        .first()
        .click({ timeout: 6_000 })
        .catch(() => {});
      await page.waitForTimeout(900);
    }
    if (row.drive.overlaySeen > 0) {
      row.driveRefused =
        `an overlay was up for ${(row.drive.overlaySeen * 100).toFixed(0)} % of the window ` +
        `after 3 attempts — this row is NOT a driving measurement`;
    }

    const gl2 = await page.evaluate(() => window.__w3gl());
    row.listenerTotal = Object.values(gl2.listeners).reduce((a, b) => a + b, 0);
    row.listenerTop = Object.entries(gl2.listeners)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t, n]) => `${t}:${n}`)
      .join(" ");
  } catch (error) {
    row.error = String(error?.message || error).split("\n")[0].slice(0, 200);
  }
  if (consoleErrors.length) row.pageErrors = consoleErrors.slice(0, 3);
  await context.close();
  return row;
}

function summarize(w) {
  const fps = w.wallMs > 0 ? (w.frames - 1) / (w.wallMs / 1000) : 0;
  const commits = Object.entries(w.commitsDelta).map(
    ([id, n]) => `${id}:${(n / (w.wallMs / 1000)).toFixed(1)}/s`,
  );
  return {
    wallMs: Math.round(w.wallMs),
    observedFps: Number(fps.toFixed(1)),
    drawsPerFrame: Number(w.drawsPerFrame.toFixed(1)),
    drawsPerSecond: Math.round(w.drawsInWindow / (w.wallMs / 1000)),
    commitsPerSecond: commits.join(" "),
    rafPerFrame: Number(w.rafPerFrame.toFixed(2)),
  };
}

// ---------------------------------------------------------------------------
async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "[frame-cost] --email and --password are required: /simulator is behind the entitlement " +
        "gate and an unauthenticated sweep measures the login page.",
    );
  }
  const devices = resolveDevices(ONLY ? [ONLY] : undefined);
  log(`base=${BASE} build=${BUILD} tiers=${TIERS.join(",")} regimes=${REGIMES.join(",")}`);
  log(`window=${SECONDS}s settle=${SETTLE_MS}ms devices=${devices.map((d) => d.id).join(",")}`);
  // House rule: the inset model is printed, never assumed.
  for (const device of devices) {
    const { inset } = { inset: insetsFor(device, { mode: "real" }) };
    log(insetBanner(device, inset));
  }

  // Sign in ONCE and reuse the storage state: 24 fresh sign-ins on this box is
  // minutes of measurement time spent typing into a form.
  //
  // Through `newDeviceContext`, not `browser.newContext`, even though this
  // context only fills in a login form and is thrown away. `insets.test.mjs`
  // makes that a hard rule for every probe in this directory and it is right to:
  // the exception that "this one does not measure anything" is exactly how a
  // context that DOES measure something ends up laid out on a phone with no
  // notch. One door, no exemptions.
  const authBrowser = await chromium.launch({ headless: true, args: GL_ARGS });
  const { context: authCtx } = await newDeviceContext(authBrowser, devices[0], {
    motion: "allow",
  });
  const authPage = await authCtx.newPage();
  await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
  const storageState = await authCtx.storageState();
  await authBrowser.close();
  log(`signed in as ${EMAIL}`);

  const rows = [];
  for (const regime of REGIMES) {
    const args = regime === "uncapped" ? [...GL_ARGS, ...NOVSYNC_ARGS] : GL_ARGS;
    const browser = await chromium.launch({ headless: true, args });
    for (const device of devices) {
      for (const tier of TIERS) {
        const started = Date.now();
        const row = await measureRow(browser, device, tier, regime, storageState);
        row.rowSeconds = Math.round((Date.now() - started) / 1000);
        rows.push(row);
        const d = row.drive;
        log(
          `${regime.padEnd(8)} ${device.id.padEnd(28)} ${tier.padEnd(4)} ` +
            (row.error
              ? `ERROR ${row.error}`
              : row.refused
                ? `REFUSED ${row.refused}`
                : `fps=${String(d.observedFps).padStart(5)} p50=${d.p50.toFixed(1)} ` +
                  `p95=${d.p95.toFixed(1)} max=${d.max.toFixed(1)} draws/f=${d.drawsPerFrame} ` +
                  `buf=${row.backingStore} dpr=${row.appliedDpr} ` +
                  `ovl=${row.drive?.overlaySeen} att=${row.drive?.attempt} ` +
                  `| CARD UP: draws/f=${row.paused?.drawsPerFrame} ` +
                  `draws/s=${row.paused?.drawsPerSecond} ink=${row.pausedInk}%`),
        );
        writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
      }
    }
    await browser.close();
  }

  writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
  log(`wrote ${join(OUT, `${TAG}.json`)} (${rows.length} rows)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
