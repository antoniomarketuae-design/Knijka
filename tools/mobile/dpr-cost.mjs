#!/usr/bin/env node
// =============================================================================
// dpr-cost.mjs — WHAT RESOLUTION COSTS, PER PROFILE × TIER × dpr, ON THE REAL
// AUTHENTICATED /simulator OF A PRODUCTION BUILD.
//
// ── THE QUESTION IT EXISTS TO ANSWER ────────────────────────────────────────
// `TOUCH_MAX_DPR = 1.0` (quality.ts) hard-clamps every touch device to dpr 1 on
// every tier. On an iPhone 16 Pro that renders 393×852 and lets the panel
// upscale it onto 1179×2556 — one rendered pixel over nine real ones, which is
// the founder's "resolution is brutally low". Lifting the clamp is arithmetically
// 9× the fragments, and the whole argument for lifting it is that fragments are
// not all equally expensive: tier `low` has no shadow map, no composer, and a
// two-fetch facade shader, so its frame may be bound by its ~210 draw calls
// rather than by fill.
//
// That is a MEASUREMENT, not an opinion, and nothing in this repo could take it:
// `frame-cost.mjs` prices a frame but cannot attribute it to a pass, and
// `perf-passes.mjs` attributes it but sweeps ONE tier at the ONE dpr the shipped
// clamp allows. This tool sweeps the dpr axis itself.
//
// ── HOW IT MOVES THE dpr, AND WHY THAT IS THE HONEST WAY ────────────────────
// It does NOT add a debug hook to the product. R3F is wired `dpr={[1, cap]}`,
// which means the applied ratio is `clamp(window.devicePixelRatio, 1, cap)` —
// so with a build whose cap is C, patching `window.devicePixelRatio` to any
// value ≤ C selects that ratio THROUGH THE SHIPPED CODE PATH. The patch is
// installed with `addInitScript`, i.e. before the app's first module evaluates,
// because a ratio read after the Canvas has mounted changes nothing.
//
// The consequence, stated so no row is over-read: this tool can only measure
// ratios the build under test already permits. A build clamped at 1.0 has
// exactly one row per tier, and that is the BEFORE table.
//
// ── WHAT IT REPORTS, PER ROW ────────────────────────────────────────────────
//   appliedDpr      bufW / cssW, read off the live context — what the GPU was
//                   actually handed, never what a preset intended.
//   backingStore    gl.drawingBufferWidth × Height, and the pixel count.
//   gpuMsPerFrame   Σ of the app's own per-pass EXT_disjoint_timer_query rows.
//   drawsPerFrame   Σ of the same rows' draw counts — dpr-independent by
//                   construction, so it is the control: if it moves between two
//                   dpr rows of the same tier, something other than resolution
//                   changed and the pair is not comparable.
//   harnessFps      THIS TOOL's own rAF rate over the same window (§G0: a false
//                   verdict was once published from a rig running at 0.4 fps).
//   passes[]        every render-target region, keyed `fb<id>@<w>x<h>`, so the
//                   fixed-size backing stores are visible as fixed: the mirror
//                   RTT is the 256×96 row and the shadow map is the 1024²/2048²
//                   row, and NEITHER scales with dpr. That is the answer to
//                   "should the mirror render at native too" — it never did.
//
// ── WHAT IT FOUND, 2026-08-13, production build, six profiles ───────────────
// (this machine — GTX 1060 through ANGLE/D3D11 — at phone dimensions)
//
// 1 · IT IS NOT 9×. `high`, iPhone-16 portrait, one build, the dpr swept and
//     NOTHING else. The last column is the mirror + shadow-map total, which
//     CANNOT depend on dpr and is therefore this table's own noise gauge:
//
//       dpr 1.0    393×852   0.33 MP    6.89 ms/f   535.9 draws/f   fixed 1.98
//       dpr 1.5    589×1278  0.75 MP    9.71 ms/f   534.8 draws/f   fixed 2.52
//       dpr 2.0    786×1704  1.34 MP    9.88 ms/f   534.9 draws/f   fixed 1.91
//       dpr 3.0   1179×2556  3.01 MP   11.36 ms/f   535.9 draws/f   fixed 1.50
//
//     **9.1× the pixels bought 1.65× the GPU time.** draws/frame moved by one
//     part in five hundred across the whole sweep — that is the control, and it
//     says the only thing that changed was the buffer. Net of the fixed passes
//     the four points fit ≈ 4.3 ms of draw/vertex work + ≈ 1.85 ms per
//     megapixel, so the whole frame is ≈ 6.3 ms that dpr cannot touch plus
//     1.85 ms/MP that it can. The 9× arithmetic was applied to the wrong
//     number: it multiplies the FILL, and the fill was never what this frame
//     was made of — 535 draw calls were.
//
//     Across all six profiles with the pill actually pressed, `high` at native
//     landed at 10.75–14.47 ms/frame (2.53–3.01 MP) with the harness holding
//     59.3–60.0 fps and an overlay-free window on every row. The 1.50–2.52 ms
//     spread in the fixed column is the box, not the change, and it is the
//     honest error bar on every millisecond above.
//
// 2 · WHERE THE NATIVE FRAME GOES (iPhone-16 portrait, `high`, dpr 3):
//       1179×2556  main scene + composer   10.56 ms  72.9 %   301 draws/f
//       2048×2048  shadow map (FIXED)       1.25 ms   8.6 %   181 draws/f
//       589×1278   N8AO half-res            0.89 ms   6.1 %
//       256×96     rear mirror RTT (FIXED)  0.77 ms   5.3 %
//       160×96     door mirrors ×2 (FIXED)  0.70 ms   4.9 %
//       590×1278 … 5×10  SMAA + bloom mips  0.31 ms   2.1 %
//     81 % of the frame follows the drawing buffer; 19 % is authored at a
//     constant size and does not move with dpr at all.
//
// 3 · THE MIRRORS NEVER SCALED, so "render the world at 3 and the mirror at
//     1.5" is already over-satisfied. `MirrorRig` allocates 256×96 and 160×96
//     targets as literals — 55,296 px, **1.8 % of the canvas pixels at native**
//     — i.e. an effective device ratio of 0.22 on a 1179-wide panel. They cost
//     1.48 ms (10.2 % of the frame) and cost exactly the same at dpr 1. The
//     shadow map is the same story from the other end: 2048² is 4.19 MP, LARGER
//     than the 3.01 MP canvas it shades, and equally dpr-blind.
//
// 4 · NO HIDDEN MULTISAMPLE STORE AT NATIVE. `low` is the one tier that asks
//     the Canvas for MSAA (`antialias: !postprocessing`), and `low` is exactly
//     the tier whose cap stays 1.0 — so nothing ever multisamples a 3 MP
//     buffer. At `high` the composer owns AA through SMAA and `antialias` is
//     already false.
//
// 5 · WHAT NATIVE COSTS IN MEMORY, WHICH IS THE PART NOBODY PRICED. The region
//     census at `high`/dpr 3 shows **ten distinct framebuffers at 1179×2556**
//     (composer ping-pong, SMAA, the fullscreen passes) beside the 2048² shadow
//     map. At RGBA16F that is ~23 MB apiece. This tool counts framebuffer
//     BINDINGS, not allocations, so it cannot state a VRAM figure — but the
//     order of magnitude moves from tens of MB at dpr 1 to a hundred-plus at
//     native, and on a 4 GB Android that is the failure mode `GlContextGuard`
//     exists for: not a slow frame, a black canvas. A real VRAM measurement is
//     the follow-up this wave did NOT take.
//
// 6 · AND THE ONE THAT DECIDES WHETHER ANY OF IT REACHES HIM: with nothing
//     seeded and nothing pressed — `--select none`, the path a student is
//     actually on — every phone profile still comes up `low` at **dpr 1.0** on
//     a panel reporting 3, on localhost AND on the deployed staging build.
//     `autoQualityCeiling` pins `auto` at `med` on every handset forever and
//     both of those rungs are 1.0, so native is reachable only by a deliberate
//     press on «Високо». That is the shipped design working as designed; it is
//     also the reason "we shipped dpr 3" and "his phone renders dpr 3" are two
//     different sentences.
//
// ── WHAT NO NUMBER HERE CLAIMS ──────────────────────────────────────────────
// NOT ONE MILLISECOND DESCRIBES THE FOUNDER'S HANDSET. Emulation reproduces the
// viewport, the device ratio, the touch model, the UA and the insets. It does
// not emulate a GPU. Every millisecond is "this desktop, through ANGLE/D3D11, at
// phone dimensions"; an A18 Pro may well be FASTER per fragment than this box.
// Draw counts, backing-store dimensions and the SHAPE of the scaling curve are
// properties of what the scene asks for, and those transfer.
//
// ── HOW TO RUN ──────────────────────────────────────────────────────────────
//   cd platform && KNIJKA_DIST_DIR=.next-dpr npx next build
//   KNIJKA_DIST_DIR=.next-dpr npx next start --port 3481 --hostname localhost
//   node tools/mobile/dpr-cost.mjs --base http://localhost:3481 \
//     --email <account> --password <pw> --tier low,med,high --dpr native --tag before
//
//   --device <id>       one profile instead of all six
//   --tier low,med,high tiers to sweep
//   --dpr native,1,1.5  device ratios to sweep ("native" = leave it alone)
//   --seconds 6         length of the GPU timing window
// =============================================================================

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { newDeviceContext, insetBanner, insetsFor } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] !== undefined ? process.argv[i + 1] : d;
};

const BASE = arg("base", "http://localhost:3481");
const EMAIL = arg("email", process.env.KNIJKA_PERF_EMAIL || "");
const PASSWORD = arg("password", process.env.KNIJKA_PERF_PASSWORD || "");
const TIERS = arg("tier", "low,med,high").split(",").filter(Boolean);
const DPRS = arg("dpr", "native").split(",").filter(Boolean);
/**
 * How the tier under test is selected — and `pick` is the only one of the three
 * that is a claim about the PRODUCT.
 *
 *   seed — write the two localStorage keys before boot. Fast, deterministic, and
 *          what every perf sweep in this directory has always done. It proves
 *          what a tier COSTS; it proves nothing about whether a student can get
 *          there.
 *   none — write nothing. The app's own cold-start rule decides, so this row
 *          answers the only question that decides whether a ruling was actually
 *          delivered: WHAT DOES THE PHONE DO WHEN NOBODY HELPS IT.
 *   pick — land on /simulator and press the «Ниско/Средно/Високо» pill with a
 *          real click, exactly as a student would, then start the lesson.
 */
const SELECT = arg("select", "seed");
const PILL_BG = { low: "Ниско", med: "Средно", high: "Високо" };
const SECONDS = Number(arg("seconds", "6"));
const SETTLE_MS = Number(arg("settle", "11000"));
const ONLY = arg("device", null);
const TAG = arg("tag", "run");
const OUT = join(HERE, ".out", "dpr-cost");
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "shots"), { recursive: true });

/** The repo's own GPU recipe. A run that falls back to SwiftShader is refused. */
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
const log = (m) => console.log(`[dpr-cost] ${m}`);

/**
 * Seed the tier, arm the app's perf probe, and (optionally) select the device
 * ratio — all before the app's first module runs.
 */
function pageInstrument(seed) {
  try {
    if (seed.select === "seed") {
      window.localStorage.setItem(
        "aidrive.sim.quality.v1",
        JSON.stringify({ setting: seed.envTier, recommendation: seed.envTier }),
      );
      window.localStorage.setItem("sim.quality", seed.uiTier);
    } else {
      // `none` and `pick` must both start from a device that has never been
      // told anything — otherwise a key left by an earlier row silently decides
      // the row that was supposed to measure the app deciding for itself.
      window.localStorage.removeItem("aidrive.sim.quality.v1");
      window.localStorage.removeItem("sim.quality");
    }
    // Left over from an earlier row the ledger would silently overrule the tier
    // this row is measuring (`seedQualityLevel` reads it FIRST).
    window.localStorage.removeItem("aidrive.sim.quality.ledger.v1");
    window.localStorage.setItem("sim.perfLog", "1");
  } catch {}

  if (typeof seed.dpr === "number") {
    try {
      Object.defineProperty(window, "devicePixelRatio", {
        configurable: true,
        get: () => seed.dpr,
      });
    } catch {}
  }

  const w = { frames: 0 };
  window.__dc = w;
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => {
    w.frames += 1;
    raf(tick);
  };
  raf(tick);
  window.__dcStart = () => {
    w.at = w.frames;
    w.t0 = performance.now();
  };
  window.__dcStop = () => ({ frames: w.frames - w.at, wallMs: performance.now() - w.t0 });
}

/**
 * Poll the shell's own one-overlay-at-a-time flag for `ms` and answer with the
 * FRACTION of samples that had a card up. Sampling rather than checking once at
 * the end is the whole point: a teach moment that fires at second 2 of a
 * 6-second window and is gone by second 6 is invisible to a single check, and
 * a third of the samples would be paused frames wearing a driving label.
 *
 * ITS OWN COST, DECLARED: one `document.querySelector` through CDP every 250 ms
 * — 24 evaluations across a ~360-frame window. Not removable; a paused window
 * wearing a driving label is a much larger error than 24 DOM reads.
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

async function measureRow(browser, device, tier, dprLabel, storageState) {
  const uiTier = tier === "med" ? "medium" : tier;
  const dpr = dprLabel === "native" ? null : Number(dprLabel);
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    storageState,
  });
  await context.addInitScript(pageInstrument, { envTier: tier, uiTier, dpr, select: SELECT });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e.message).slice(0, 120)));

  const row = {
    device: device.id,
    viewport: `${device.width}x${device.height}`,
    profileDpr: device.dpr,
    dprRequested: dprLabel,
    tier,
    select: SELECT,
    tag: TAG,
    inset: `${inset.top}/${inset.right}/${inset.bottom}/${inset.left}`,
  };

  try {
    // `?simPerf=1` and NOT the localStorage twin: `shouldLogPerf()` disables the
    // storage path under NODE_ENV=production, and production is the only build
    // a row may be closed on (/dev/* 404s there).
    await page.goto(`${BASE}/simulator?simPerf=1`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    const freeDrive = page.getByRole("button", { name: /Карай свободно/ }).first();
    await freeDrive.waitFor({ state: "visible", timeout: 120_000 });

    // THE PILL, PRESSED LIKE A STUDENT PRESSES IT. `radio` and not `button`:
    // the selector is a radiogroup, and the assertion that matters is
    // aria-checked afterwards — a click that lands on a pill and does not check
    // it is a control that LOOKS reachable on a phone and is not.
    if (SELECT === "pick") {
      const pill = page.getByRole("radio", { name: PILL_BG[tier] }).first();
      row.pillVisible = await pill
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(() => true)
        .catch(() => false);
      if (row.pillVisible) {
        row.pillBox = await pill.boundingBox().catch(() => null);
        await pill.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(500);
        row.pillChecked = (await pill.getAttribute("aria-checked").catch(() => null)) === "true";
      }
      row.storedPreset = await page
        .evaluate(() => window.localStorage.getItem("sim.quality"))
        .catch(() => null);
    }

    await freeDrive.click();
    await page.waitForSelector("canvas", { timeout: 120_000 });
    // The first six seconds of a session are shader compile and texture upload —
    // individual frames of seconds. Measuring through that prices a stall.
    await page.waitForTimeout(SETTLE_MS);

    // ---- HOUSE RULE: prove there is a simulator on this page ---------------
    const canvas = await page.evaluate(() => {
      const c = document.querySelector("canvas");
      if (!c) return { hasCanvas: false };
      const r = c.getBoundingClientRect();
      const gl = c.getContext("webgl2") || c.getContext("webgl");
      let renderer = null;
      try {
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        if (ext) renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      } catch {}
      return {
        hasCanvas: true,
        w: Math.round(r.width),
        h: Math.round(r.height),
        bufW: gl?.drawingBufferWidth ?? null,
        bufH: gl?.drawingBufferHeight ?? null,
        attrW: c.width,
        attrH: c.height,
        dprSeen: window.devicePixelRatio,
        renderer,
        simPerf: typeof window.__simPerf?.gpu === "function",
        path: window.location.pathname,
      };
    });
    row.canvas = canvas;
    if (!canvas.hasCanvas || !(canvas.w > 0) || !(canvas.h > 0)) {
      row.refused =
        `hasCanvas=${canvas.hasCanvas} rect=${canvas.w}x${canvas.h} — refusing to report numbers ` +
        `(three mobile waves published figures taken off a login redirect)`;
      await context.close();
      return row;
    }
    if (/swiftshader|software|llvmpipe/i.test(String(canvas.renderer))) {
      row.refused = `SwiftShader fallback (${canvas.renderer})`;
      await context.close();
      return row;
    }
    row.css = `${canvas.w}x${canvas.h}`;
    row.backingStore = `${canvas.bufW}x${canvas.bufH}`;
    row.backingPixels = canvas.bufW * canvas.bufH;
    row.appliedDpr = Number((canvas.bufW / canvas.w).toFixed(3));

    // ---- driving window, overlay-free, belt fastened ------------------------
    await page
      .getByRole("button", { name: /^Разбрах$/ })
      .first()
      .click({ timeout: 6_000 })
      .catch(() => {});
    await page.waitForTimeout(500);
    // Hold the throttle with the belt undone → «УЧЕБЕН МОМЕНТ» fires within two
    // seconds and pauses the world. Dismiss it and fasten the belt so it cannot
    // fire again inside the measurement window.
    await page.keyboard.down("KeyW");
    row.cardUp = await page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(500);
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

    // ---- THE WINDOW, AND WHY IT IS MEASURED COASTING -----------------------
    //
    // THE FIRST VERSION OF THIS HELD KeyW THROUGH THE WHOLE WINDOW, exactly as
    // `frame-cost.mjs` does, and 14 of its 18 rows finished with a card on
    // screen. The card is not the seatbelt one that recipe was written for and
    // no amount of belt-fastening prevents it: holding the throttle on
    // `l0-free-drive` reaches ~55 км/ч in a 50 zone within seconds and
    // «УЧЕБЕН МОМЕНТ — Несъобразена скорост» fires, which sets `physicsPaused`,
    // which puts the Canvas on `frameloop="demand"`. A window that straddles
    // that is not a driving window.
    //
    // So: a short pull to get the car rolling, then RELEASE and measure while
    // it coasts. The scene is unchanged — the frame draws the same district
    // whatever the speedometer says (202 draws/frame moving, 202 stationary) —
    // but nothing can trip a speed teach moment, so the window stays clean.
    // The overlay flag is sampled THROUGHOUT rather than read once at the end,
    // because a card that fires at second 2 and is dismissed by second 6 is
    // invisible to a single check and would take a third of the samples with
    // it. Three attempts, then the row is REFUSED rather than published.
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.keyboard.down("KeyW");
      await page.waitForTimeout(1400);
      await page.keyboard.up("KeyW");
      // Let any card the pull provoked arrive and be dismissed before the
      // window opens, and let the speed fall back under the limit.
      await page.waitForTimeout(1500);
      await page
        .getByRole("button", { name: /РАЗБРАХ|Разбрах/ })
        .first()
        .click({ timeout: 4_000 })
        .catch(() => {});
      await page.waitForTimeout(800);

      await page.evaluate(() => window.__dcStart());
      const watch = watchOverlay(page, SECONDS * 1000);
      const report = await page.evaluate(
        async (s) => (await window.__simPerf?.gpu(s)) ?? null,
        SECONDS,
      );
      const harness = await page.evaluate(() => window.__dcStop());
      const overlaySeen = await watch;
      row.attempt = attempt;
      row.overlaySeen = overlaySeen;
      row.report = report;
      row.harnessFps =
        harness.wallMs > 0 ? Number((harness.frames / (harness.wallMs / 1000)).toFixed(1)) : 0;
      if (overlaySeen === 0) break;
      await page
        .getByRole("button", { name: /РАЗБРАХ|Разбрах/ })
        .first()
        .click({ timeout: 4_000 })
        .catch(() => {});
      await page.waitForTimeout(900);
    }
    const report = row.report;
    delete row.report;
    if (row.overlaySeen > 0) {
      row.windowRefused =
        `an overlay was up for ${(row.overlaySeen * 100).toFixed(0)} % of the window after ` +
        `3 attempts — this row is NOT a clean driving measurement`;
    }

    if (report === null) {
      row.gpuUnavailable =
        "EXT_disjoint_timer_query_webgl2 not exposed, or __simPerf absent — no GPU row";
    } else {
      // THE TIER THE APP SAYS IT RENDERED, never the one this row asked for.
      // In `none`/`pick` mode they are different questions and the whole point
      // is to see which one the product answered.
      row.tierApplied = report.tier;
      row.glRenderer = report.glRenderer;
      row.gpuFrames = report.frames;
      row.gpuMsPerFrame = Number(report.gpuMsPerFrameTotal.toFixed(3));
      row.wallMsPerFrame = Number(report.wallMsPerFrame.toFixed(3));
      row.droppedQueries = report.droppedQueries;
      row.disjointEvents = report.disjointEvents;
      row.drawingBufferSeenByApp = report.drawingBuffer;
      // SIZE COMES OUT OF THE KEY, NOT OFF THE ROW. `GpuPassRow` carries no
      // width/height — `perf-passes.mjs` reads `r.width ?? "?"` and has been
      // printing `?x?` for every pass it ever measured, which is the one column
      // that decides whether a backing store scales with dpr. The key IS the
      // dimensions: PerfProbe builds it `fb<id>@<w>x<h>`.
      row.passes = report.rows.map((r) => ({
        key: r.key,
        label: r.label,
        // Decimals are REQUIRED in this pattern, not defensive: a half-res AO
        // target on an odd-width buffer is `fb8@196.5x426`, and an integer-only
        // regex drops exactly the rows that scale with dpr.
        size: /@([\d.]+)x([\d.]+)$/.exec(r.key)?.slice(1, 3).join("x") ?? "?x?",
        drawsPerFrame: Number(r.drawsPerFrame.toFixed(1)),
        entriesPerFrame: Number(r.entriesPerFrame.toFixed(2)),
        gpuMsPerFrame: Number(r.gpuMsPerFrame.toFixed(3)),
        pct:
          report.gpuMsPerFrameTotal > 0
            ? Number(((100 * r.gpuMsPerFrame) / report.gpuMsPerFrameTotal).toFixed(1))
            : 0,
        samples: r.samples,
      }));
      row.drawsPerFrame = Number(
        row.passes.reduce((s, p) => s + p.drawsPerFrame, 0).toFixed(1),
      );
      // The two fixed-size backing stores, named so a reader can see they do NOT
      // move with dpr: the mirror RTT is 256×96 and the shadow map is square.
      const mirror = row.passes.find((p) => /@256x96$/.test(p.key));
      row.mirror = mirror ?? null;
      row.shadowMap = row.passes.find((p) => p.label === "shadow map") ?? null;
    }

    // R0, look before you ship: a probe that reports numbers off a black canvas
    // is the failure this whole harness exists to end.
    row.shot = join(OUT, "shots", `${TAG}-${device.id}-${tier}-dpr${dprLabel}.png`);
    const shot = await page.screenshot().catch(() => null);
    if (shot) writeFileSync(row.shot, shot);
    else row.shot = null;
  } catch (error) {
    row.error = String(error?.message || error).split("\n")[0].slice(0, 200);
  }
  if (pageErrors.length) row.pageErrors = pageErrors.slice(0, 3);
  await context.close();
  return row;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("[dpr-cost] --email and --password are required (/simulator is gated).");
  }
  // A COMMA LIST, because `--device a,b` is what every other flag here takes
  // and `resolveDevices` throws on the joined string rather than splitting it —
  // which cost this lane a whole staging sweep that died after the sign-in.
  const devices = resolveDevices(ONLY ? ONLY.split(",").filter(Boolean) : undefined);
  log(
    `base=${BASE} tiers=${TIERS.join(",")} dprs=${DPRS.join(",")} window=${SECONDS}s ` +
      `devices=${devices.map((d) => d.id).join(",")}`,
  );
  log(
    "EVERY MILLISECOND BELOW IS THIS MACHINE (ANGLE/D3D11) AT PHONE DIMENSIONS — not a handset.",
  );
  for (const device of devices) log(insetBanner(device, insetsFor(device, { mode: "real" })));

  const authBrowser = await chromium.launch({ headless: true, args: GL_ARGS });
  const { context: authCtx } = await newDeviceContext(authBrowser, devices[0], { motion: "allow" });
  const authPage = await authCtx.newPage();
  await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
  const storageState = await authCtx.storageState();
  await authBrowser.close();
  log(`signed in as ${EMAIL}`);

  const rows = [];
  const browser = await chromium.launch({ headless: true, args: GL_ARGS });
  for (const device of devices) {
    for (const tier of TIERS) {
      for (const dprLabel of DPRS) {
        const started = Date.now();
        const row = await measureRow(browser, device, tier, dprLabel, storageState);
        row.rowSeconds = Math.round((Date.now() - started) / 1000);
        rows.push(row);
        if (row.error || row.refused) {
          log(
            `${device.id.padEnd(28)} ${tier.padEnd(4)} dpr=${dprLabel.padEnd(6)} ` +
              (row.error ? `ERROR ${row.error}` : `REFUSED ${row.refused}`),
          );
        } else {
          log(
            `${device.id.padEnd(28)} ${SELECT}:${tier.padEnd(4)}→${String(row.tierApplied).padEnd(4)} ` +
              `dpr=${dprLabel.padEnd(6)} ` +
              `applied=${String(row.appliedDpr).padStart(5)} buf=${row.backingStore.padEnd(10)} ` +
              `(${(row.backingPixels / 1e6).toFixed(2)} MP) ` +
              `GPU=${String(row.gpuMsPerFrame).padStart(7)} ms/f ` +
              `draws/f=${String(row.drawsPerFrame).padStart(6)} ` +
              `harnessFps=${String(row.harnessFps).padStart(5)} ` +
              `mirror=${row.mirror ? `${row.mirror.gpuMsPerFrame}ms@${row.mirror.size}` : "-"} ` +
              `shadow=${row.shadowMap ? `${row.shadowMap.gpuMsPerFrame}ms@${row.shadowMap.size}` : "-"} ` +
              `ovl=${row.overlaySeen} att=${row.attempt}` +
              (row.windowRefused ? ` *** ${row.windowRefused}` : ""),
          );
        }
        writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
      }
    }
  }
  await browser.close();
  writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
  log(`wrote ${join(OUT, `${TAG}.json`)} (${rows.length} rows)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
