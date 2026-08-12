#!/usr/bin/env node
// =============================================================================
// perf-passes.mjs — WHERE THE TIER-LOW GPU FRAME ACTUALLY GOES, PER PASS, ON
// THE PRODUCTION BUILD, AND WHAT THE OVERLAYS ASK THE COMPOSITOR FOR.
//
// ── WHY IT EXISTS ───────────────────────────────────────────────────────────
// `frame-cost.mjs` answers "what does a frame cost and how many draws is it".
// It cannot answer the two questions doc 91 §I21 and §I20 are about:
//
//   §I21 / §D12f — THE MIRROR RTT. The rear-mirror render target is a fixed
//     256×96, so unlike the main pass its cost does not shrink with the
//     viewport. §D12f measured it at 0.61-1.13 ms of a 2.4-3.2 ms tier-low GPU
//     frame — 25-34 % of the whole budget for 7 % of the canvas pixels — and
//     §J-10 predicted that once §I19 landed it would be the largest single
//     remaining per-frame GPU line at `low`. A draw COUNT cannot see it (the
//     pass is ~25 draws out of ~210) and a frame TIME cannot attribute it. The
//     app's own per-pass GPU timer can: `__simPerf.gpu(n)` wraps
//     `bindFramebuffer` and brackets every region in an
//     EXT_disjoint_timer_query_webgl2 query, keyed `fb<id>@<w>x<h>` — so the
//     mirror is the row whose key is 256×96 and NOTHING ELSE IS.
//
//   §I20 / §D12d — THE BACKDROP FILTER. §G6 states why it has never appeared
//     in any budget this project has published: "it runs in the browser
//     compositor, outside both the page's WebGL timer and CDP's main-thread
//     metrics. Provable that it is there; not priceable from here." This tool
//     does not pretend otherwise. It PROVES PRESENCE OR ABSENCE, on the real
//     surface, with the card up: for every element on top of the canvas it
//     reads the COMPUTED `backdrop-filter` and the box it covers, and reports
//     the pixel area the compositor is being asked to blur — a property of what
//     the page asks for, like a draw call, and therefore one that transfers to
//     a phone even though the milliseconds here do not.
//
// ── HOUSE RULES IT OBEYS ────────────────────────────────────────────────────
//  · `hasCanvas === true` AND a non-zero canvas rect are asserted before any
//    number is believed. Five probes have reported "0 overflow" from a page
//    with no simulator on it.
//  · The renderer string is read at runtime and printed on every row; a
//    SwiftShader fallback is REFUSED, not reported.
//  · The harness's own fps is printed beside every timing (§G0 — a false defect
//    was published from a rig running at 0.4 fps).
//  · The driving window is verified overlay-free the same way `frame-cost.mjs`
//    does it, and the belt is fastened first (§N7 trap 1).
//  · Production only. `/dev/*` calls notFound() under NODE_ENV=production and
//    no row may be closed on one (§O.5).
//
// ── HOW TO RUN ──────────────────────────────────────────────────────────────
//   node tools/mobile/perf-passes.mjs --base http://localhost:3479 \
//     --email <account> --password <pw> --tag before
//   --device <id>   one profile instead of all six
//   --seconds 6     length of the GPU timing window
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

const BASE = arg("base", "http://localhost:3479");
const EMAIL = arg("email", process.env.KNIJKA_PERF_EMAIL || "");
const PASSWORD = arg("password", process.env.KNIJKA_PERF_PASSWORD || "");
const TIER = arg("tier", "low");
const SECONDS = Number(arg("seconds", "6"));
const SETTLE_MS = Number(arg("settle", "11000"));
const ONLY = arg("device", null);
const TAG = arg("tag", "run");
const OUT = join(HERE, ".out", "perf-passes");
mkdirSync(OUT, { recursive: true });

/** The repo's own GPU recipe. A run that falls back to SwiftShader is refused. */
const GL_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"];
const log = (m) => console.log(`[perf-passes] ${m}`);

/** Seed the tier and arm the app's own perf probe before the first module runs. */
function pageInstrument(seed) {
  try {
    window.localStorage.setItem(
      "aidrive.sim.quality.v1",
      JSON.stringify({ setting: seed.envTier, recommendation: seed.envTier }),
    );
    window.localStorage.setItem("sim.quality", seed.uiTier);
    window.localStorage.removeItem("aidrive.sim.quality.ledger.v1");
    // `?simPerf=1`'s twin (LessonScene.tsx:234) — arms PerfProbe, which is what
    // publishes `window.__simPerf`. Set here rather than on the URL because the
    // deep link is consumed and rewritten by the client.
    window.localStorage.setItem("sim.perfLog", "1");
  } catch {}
  // A frame counter of our own, so the app's GPU report can be printed beside
  // the rate the HARNESS was running at (§G0).
  const w = { frames: 0 };
  window.__pp = w;
  const raf = window.requestAnimationFrame.bind(window);
  const tick = () => {
    w.frames += 1;
    raf(tick);
  };
  raf(tick);
  window.__ppStart = () => {
    w.at = w.frames;
    w.t0 = performance.now();
  };
  window.__ppStop = () => ({
    frames: w.frames - w.at,
    wallMs: performance.now() - w.t0,
  });
}

/**
 * Every element painted over the canvas that asks the compositor for a
 * `backdrop-filter`, with the area it covers.
 *
 * Read from COMPUTED style, not from the class list: `backdrop-blur-sm` is a
 * Tailwind name and what matters is what the compositor is handed. Reported as
 * pixels because that is the device-independent half of this cost — the
 * milliseconds are a phone's, not this box's (§G6).
 */
function readBackdropCensus() {
  const out = [];
  // Authored intent, beside computed reality: an element whose CLASS asks for a
  // blur but whose computed style says `none` is either not rendered or the
  // utility did not emit — and a census that shows only one of the two numbers
  // cannot tell "we removed it" from "we never rendered it here".
  out.classHits = 0;
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    if (/backdrop-blur/.test(String(el.className || ""))) out.classHits += 1;
  }
  for (const el of Array.from(document.querySelectorAll("body *"))) {
    const cs = getComputedStyle(el);
    // `getPropertyValue`, not the camelCase property: the camelCase alias is
    // not exposed on every engine and reading it returns undefined rather than
    // throwing — which is a census that quietly reports zero. That failure
    // shape is the whole reason this file exists, so read the CSS name.
    const filter =
      cs.getPropertyValue("backdrop-filter") ||
      cs.getPropertyValue("-webkit-backdrop-filter") ||
      "none";
    if (filter === "none" || filter.trim() === "") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    out.push({
      filter,
      w: Math.round(r.width),
      h: Math.round(r.height),
      px: Math.round(r.width * r.height),
      opaqueScrim: cs.backgroundColor,
      tag: `${el.tagName.toLowerCase()}${el.getAttribute("data-hud") ? `[data-hud=${el.getAttribute("data-hud")}]` : ""}`,
      role: el.getAttribute("role"),
      cls: String(el.className || "").slice(0, 110),
    });
  }
  return { elements: out, classHits: out.classHits };
}

async function measure(browser, device, storageState) {
  const uiTier = TIER === "med" ? "medium" : TIER;
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    storageState,
  });
  await context.addInitScript(pageInstrument, { envTier: TIER, uiTier });
  const page = await context.newPage();
  const row = {
    device: device.id,
    viewport: `${device.width}x${device.height}`,
    tier: TIER,
    tag: TAG,
    inset: `${inset.top}/${inset.right}/${inset.bottom}/${inset.left}`,
  };
  try {
    // `?simPerf=1` and NOT the localStorage twin: `shouldLogPerf()`
    // (LessonScene.tsx:229) deliberately disables the localStorage path when
    // NODE_ENV === "production" so a stray key cannot make a student's session
    // log forever. The URL flag is the one that works on the build this row is
    // required to be taken on, and doc 82 §6.2 says why it must.
    await page.goto(`${BASE}/simulator?simPerf=1`, {
      waitUntil: "domcontentloaded",
      timeout: 180_000,
    });
    const freeDrive = page.getByRole("button", { name: /Карай свободно/ }).first();
    await freeDrive.waitFor({ state: "visible", timeout: 120_000 });
    await freeDrive.click();
    await page.waitForSelector("canvas", { timeout: 120_000 });
    await page.waitForTimeout(SETTLE_MS);

    // ---- HOUSE RULE: prove there is a simulator on this page --------------
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
        renderer,
        simPerf: typeof window.__simPerf?.gpu === "function",
      };
    });
    row.canvas = canvas;
    if (!canvas.hasCanvas || canvas.w < 1 || canvas.h < 1) {
      row.refused = `no canvas / zero rect (${canvas.w}x${canvas.h}) — refusing to report numbers`;
      await context.close();
      return row;
    }
    if (/swiftshader|software|llvmpipe/i.test(String(canvas.renderer))) {
      row.refused = `SwiftShader fallback (${canvas.renderer})`;
      await context.close();
      return row;
    }

    // ---- §I20: the compositor census, IN THREE STATES ---------------------
    // Three, because the row's own list turned out to be state-dependent: on a
    // compact viewport `TeachMomentOverlay` is ROOMY-ONLY (the shell renders it
    // under `!compact` at LessonPlayShell.tsx:3472 and routes the same
    // TeachMoment through the one-line `SimOverlay` instead), so a census taken
    // only behind a teach card would report zero on a phone and prove nothing.
    row.viewportPx = canvas.w * canvas.h;

    // (a) IDLE / HUD — every backdrop-filter that sits over a LIVE canvas.
    await page
      .getByRole("button", { name: /^Разбрах$/ })
      .first()
      .click({ timeout: 6_000 })
      .catch(() => {});
    await page.waitForTimeout(700);
    row.idle = await page.evaluate(readBackdropCensus);

    // (b) «ПАУЗА» FIRST, BECAUSE THE RAIL IS ONLY IN THE DOM WHEN NOTHING ELSE
    //     IS. LessonScene.tsx:1808 `menuPaused` is the FIFTH full-viewport
    //     scrim (§I20 named four) and, per §N7, one of the two pauses the
    //     product actually uses; it is also the only one of the five that a
    //     compact viewport reaches in a single tap. Measured AFTER the teach
    //     card it read zero every time — not because the scrim was gone but
    //     because `data-sim-overlay-active` stands the rail down, so the button
    //     the click was looking for was not in the document. A census of the
    //     wrong screen is exactly the failure this harness exists to stop, so
    //     the order moved rather than the conclusion.
    //
    //     Clicked through the DOM rather than through Playwright's
    //     actionability checks: what this step needs is the STATE. The claim
    //     made from it is "with the pause overlay mounted, N backdrop-filters
    //     cover M px", never "a thumb can reach it".
    row.pauseOpened = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Пауза/.test(b.getAttribute("aria-label") || b.textContent || ""),
      );
      if (!btn) return false;
      btn.click();
      return true;
    });
    await page.waitForTimeout(700);
    row.paused = await page.evaluate(readBackdropCensus);
    row.pausedPx = row.paused.elements.reduce((s, b) => s + b.px, 0);
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find((b) =>
        /Продължи|Пауза/.test(b.getAttribute("aria-label") || b.textContent || ""),
      );
      btn?.click();
    });
    await page.waitForTimeout(700);

    // (c) TEACH CARD UP — frame-cost's reproduction: hold the throttle with the
    //     belt undone and «УЧЕБЕН МОМЕНТ — Движение без предпазен колан» fires
    //     within two seconds and sets `paused`.
    await page.keyboard.down("KeyW");
    row.cardUp = await page
      .locator('[role="dialog"], [role="alertdialog"]')
      .first()
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    await page.keyboard.up("KeyW");
    await page.waitForTimeout(700);
    row.card = await page.evaluate(readBackdropCensus);
    row.cardPx = row.card.elements.reduce((s, b) => s + b.px, 0);

    // ---- §I21: the per-pass GPU table, DRIVING ---------------------------
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

    await page.keyboard.down("KeyW");
    await page.waitForTimeout(1200);
    await page.evaluate(() => window.__ppStart());
    const report = await page.evaluate(
      async (s) => (await window.__simPerf?.gpu(s)) ?? null,
      SECONDS,
    );
    const harness = await page.evaluate(() => window.__ppStop());
    // The overlay flag AFTER the window: a teach card firing mid-window makes
    // this a different measurement, and doc 91's rule is to refuse the row.
    row.overlayAfter = await page.evaluate(
      () =>
        document.querySelector("[data-sim-shell]")?.getAttribute("data-sim-overlay-active") !==
          null || document.querySelector('[role="dialog"],[role="alertdialog"]') !== null,
    );
    await page.keyboard.up("KeyW");

    row.harnessFps = harness.wallMs > 0 ? Number((harness.frames / (harness.wallMs / 1000)).toFixed(1)) : 0;
    if (report === null) {
      row.gpuUnavailable =
        "EXT_disjoint_timer_query_webgl2 not exposed, or __simPerf absent — no per-pass row";
    } else {
      row.glRenderer = report.glRenderer;
      row.gpuFrames = report.frames;
      row.gpuMsPerFrameTotal = Number(report.gpuMsPerFrameTotal.toFixed(3));
      row.drawingBuffer = report.drawingBuffer;
      row.passes = report.rows.map((r) => ({
        key: r.key,
        size: `${r.width ?? "?"}x${r.height ?? "?"}`,
        defaultFb: r.defaultFb,
        drawsPerFrame: Number(r.drawsPerFrame?.toFixed?.(1) ?? r.drawsPerFrame),
        entriesPerFrame: Number(r.entriesPerFrame?.toFixed?.(2) ?? r.entriesPerFrame),
        gpuMsPerFrame: Number(r.gpuMsPerFrame.toFixed(3)),
        pct: report.gpuMsPerFrameTotal > 0
          ? Number(((100 * r.gpuMsPerFrame) / report.gpuMsPerFrameTotal).toFixed(1))
          : 0,
        shader: r.shader ? String(r.shader).slice(0, 60) : null,
      }));
      // THE MIRROR IS THE 256×96 REGION AND NOTHING ELSE IS — the rear RTT is a
      // fixed 256×96 target (MirrorRig.tsx), the only non-default framebuffer
      // at tier low, and the region key carries its own dimensions.
      const mirror = row.passes.find((p) => /@256x96$/.test(p.key));
      row.mirror = mirror ?? null;
    }
  } catch (error) {
    row.error = String(error?.message || error).split("\n")[0].slice(0, 200);
  }
  await context.close();
  return row;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error("[perf-passes] --email and --password are required (/simulator is gated).");
  }
  const devices = resolveDevices(ONLY ? [ONLY] : undefined);
  log(`base=${BASE} tier=${TIER} window=${SECONDS}s devices=${devices.map((d) => d.id).join(",")}`);
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
    const row = await measure(browser, device, storageState);
    rows.push(row);
    if (row.error || row.refused) {
      log(`${device.id.padEnd(28)} ${row.error ? `ERROR ${row.error}` : `REFUSED ${row.refused}`}`);
    } else {
      log(
        `${device.id.padEnd(28)} harnessFps=${String(row.harnessFps).padStart(6)} ` +
          `GPU=${row.gpuMsPerFrameTotal} ms/frame over ${row.gpuFrames} frames | ` +
          `MIRROR ${row.mirror ? `${row.mirror.gpuMsPerFrame} ms (${row.mirror.pct} %) ` +
            `draws/f=${row.mirror.drawsPerFrame} entries/f=${row.mirror.entriesPerFrame}` : "ABSENT"} | ` +
          `bdf idle=${row.idle?.elements.length}/${row.idle?.classHits}cls ` +
          `card=${row.card?.elements.length}(${row.cardPx}px) ` +
          `PAUSE=${row.paused?.elements.length}(${row.pausedPx}px of ${row.viewportPx}) ` +
          `cardUp=${row.cardUp} pauseOpened=${row.pauseOpened} ovl=${row.overlayAfter}`,
      );
    }
    writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
  }
  await browser.close();
  writeFileSync(join(OUT, `${TAG}.json`), JSON.stringify(rows, null, 2));
  log(`wrote ${join(OUT, `${TAG}.json`)} (${rows.length} rows)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
