// -----------------------------------------------------------------------------
// wire-probe.mjs — WHAT A PHONE DOWNLOADS BEFORE IT CAN DRIVE.
//
// J-WAVE-3 / I26a. The mobile audit's single largest transferable number is
// „script bytes 4,247 KB against a 1,200 KB budget" (doc 91 §G4). Every figure
// in that wave was taken on a `next dev` (Turbopack) build. A dev build serves
// UNMINIFIED, UNCOMPRESSED JS plus the HMR/refresh runtime and React's dev-only
// JSX factory, so quoting it against `PERF_BUDGETS.med.jsGzKb` — a field whose
// own doc comment says „of which JS, GZIPPED, KB" — compares a raw dev byte to
// a compressed production budget. This file measures the same thing on both
// builds with one instrument so the comparison is real.
//
// THREE INSTRUMENT CHOICES, EACH ONE MADE BECAUSE THE OBVIOUS ONE IS WRONG.
//
// 1. THE RESOURCE-TIMING BUFFER IS 250 ENTRIES BY DEFAULT AND THE SIM BLOWS
//    THROUGH IT. `performance.getEntriesByType("resource")` silently stops
//    recording at 250; a dev build of the driving screen fetches far more than
//    that. Any total read without raising the buffer first is an UNDERCOUNT of
//    unknown size. `setResourceTimingBufferSize(20000)` runs in an init script,
//    before the document's first byte, and `onresourcetimingbufferfull` is
//    latched so the report can say whether it still overflowed.
//
// 2. `initiatorType === "script"` IS NOT „ALL THE JAVASCRIPT". That is what
//    PerfProbe.tsx reads (environment/PerfProbe.tsx:697) and it is the right
//    call inside the app, but Next also pulls chunks through
//    `<link rel="preload" as="script">` and `<link rel="modulepreload">`, which
//    Resource Timing reports with initiatorType "link". So this file reports
//    BOTH: `byInitiator` (what the app's own probe would say, for continuity
//    with §G4) and `byUrl` (every `.js` under /_next/, which is the honest
//    parse cost). Where they differ, the difference is itself the finding.
//
// 3. COLD CACHE, OR THE NUMBER IS FICTION. Signing in loads /login, which
//    shares the framework and shared-runtime chunks with /simulator. Measured
//    in the same context, those chunks come back from cache with
//    `transferSize: 0` and the driving screen looks free. So sign-in happens
//    once, in a throwaway context, and every measured profile gets a FRESH
//    context carrying only the storage state — cold HTTP cache, warm session.
//
// NO FRAME-TIME CLAIM IS MADE ANYWHERE IN THIS FILE. It measures bytes, which
// are a property of what the build asks for and transfer identically at 0.4 fps
// and at 60 — the one class of number a headless WebKit on this box can state
// about the founder's handset without lying. Wave 2's FPS trap does not reach
// it. (`observedFps` is printed anyway, as context, so nobody later mistakes
// this run for a performance measurement.)
//
// USAGE
//   node tools/mobile/wire-probe.mjs --base http://localhost:3471 --label prod
//   node tools/mobile/wire-probe.mjs --base http://localhost:3472 --label dev \
//        --devices iphone16-landscape
// -----------------------------------------------------------------------------
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { webkit } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, ".out", "wire");

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : fallback;
};

const BASE = arg("base", "http://localhost:3471");
const LABEL = arg("label", "run");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const DEVICE_IDS = (arg("devices", "") || "").split(",").filter(Boolean);
const QUIET_MS = Number(arg("quiet", "6000"));
const MAX_WAIT_MS = Number(arg("max-wait", "240000"));

const devices = resolveDevices(DEVICE_IDS);

/**
 * Raise the resource-timing buffer and latch an overflow flag, BEFORE the
 * document loads. See instrument note 1 — without this the totals are capped
 * at 250 entries and nothing tells you.
 */
const INIT = () => {
  try {
    window.__wireOverflow = false;
    performance.setResourceTimingBufferSize(20000);
    performance.addEventListener("resourcetimingbufferfull", () => {
      window.__wireOverflow = true;
    });
  } catch {
    /* older engine — the report says `bufferRaised: false` */
  }
  try {
    // The touch hint otherwise sits over the canvas on first run; it changes
    // nothing about what is fetched, but it keeps the frames readable.
    window.localStorage.setItem("sim.touchHintSeen", "1");
  } catch {
    /* private mode */
  }
};

/** Everything the page fetched, classified two ways. Runs in the page. */
const READ_WIRE = () => {
  const nav = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const rows = resources.map((r) => ({
    name: r.name,
    initiatorType: r.initiatorType,
    transferSize: r.transferSize || 0,
    encodedBodySize: r.encodedBodySize || 0,
    decodedBodySize: r.decodedBodySize || 0,
  }));
  // EXTENSION, NOT DIRECTORY. `/_next/static/chunks/` looks like the obvious
  // test and it is wrong: Turbopack emits the 587 KB Rapier `.wasm` and the
  // route `.css` into that same directory, so a directory rule reports 1,865 KB
  // of "script" where there are 1,256 KB of JavaScript. wasm is stream-compiled
  // rather than parsed, so counting it against a PARSE budget inflates the
  // headline by 48% — the exact shape of error this whole run exists to correct.
  const isJs = (u) => /\.[cm]?js(\?|$)/.test(u);
  const isWasm = (u) => /\.wasm(\?|$)/.test(u);
  const sum = (list, key) => list.reduce((n, r) => n + r[key], 0);
  const jsRows = rows.filter((r) => isJs(r.name));
  const wasmRows = rows.filter((r) => isWasm(r.name));
  const initiatorRows = rows.filter((r) => r.initiatorType === "script");
  return {
    bufferRaised: typeof performance.setResourceTimingBufferSize === "function",
    overflowed: window.__wireOverflow === true,
    entries: rows.length,
    navTransfer: nav ? nav.transferSize || 0 : 0,
    navDecoded: nav ? nav.decodedBodySize || 0 : 0,
    totalTransfer: (nav ? nav.transferSize || 0 : 0) + sum(rows, "transferSize"),
    // What PerfProbe.tsx itself would report — kept for continuity with §G4.
    byInitiator: {
      transfer: sum(initiatorRows, "transferSize"),
      decoded: sum(initiatorRows, "decodedBodySize"),
      count: initiatorRows.length,
    },
    // Every .js the document pulled, however it was pulled.
    byUrl: {
      transfer: sum(jsRows, "transferSize"),
      decoded: sum(jsRows, "decodedBodySize"),
      count: jsRows.length,
    },
    // Reported beside the JS, never inside it — see isJs above.
    wasm: {
      transfer: sum(wasmRows, "transferSize"),
      decoded: sum(wasmRows, "decodedBodySize"),
      count: wasmRows.length,
    },
    rows,
  };
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (b) => `${(b / 1000).toFixed(0)} KB`;
const mb = (b) => `${(b / 1_048_576).toFixed(2)} MB`;

async function warm(url) {
  try {
    const r = await fetch(url);
    await r.arrayBuffer();
    return r.status;
  } catch (e) {
    return `warm failed: ${e.message}`;
  }
}

/**
 * Wait until the scene is mounted AND the network has been quiet for
 * `QUIET_MS`. „First playable" is defined here as „the canvas exists and
 * nothing new has been fetched for six seconds" — stated rather than implied,
 * because every byte after that point is a lazy fetch the student triggered.
 */
async function waitForQuiescence(page) {
  const started = Date.now();
  let lastCount = -1;
  let lastChange = Date.now();
  let sawCanvas = false;
  for (;;) {
    const state = await page.evaluate(() => ({
      count: performance.getEntriesByType("resource").length,
      canvas: document.querySelectorAll("canvas").length,
    }));
    if (state.canvas > 0) sawCanvas = true;
    if (state.count !== lastCount) {
      lastCount = state.count;
      lastChange = Date.now();
    }
    if (sawCanvas && Date.now() - lastChange > QUIET_MS) {
      return { quiet: true, sawCanvas, waitedMs: Date.now() - started };
    }
    if (Date.now() - started > MAX_WAIT_MS) {
      return { quiet: false, sawCanvas, waitedMs: Date.now() - started };
    }
    await sleep(500);
  }
}

/** Frames per second, as CONTEXT ONLY — this file makes no timing claim. */
async function observeFps(page, ms = 2000) {
  return page.evaluate(
    (window_ms) =>
      new Promise((resolve) => {
        let frames = 0;
        const t0 = performance.now();
        const tick = () => {
          frames += 1;
          if (performance.now() - t0 < window_ms) requestAnimationFrame(tick);
          else resolve(+(frames / ((performance.now() - t0) / 1000)).toFixed(1));
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

// ── sign in once, cold-cache everything after ────────────────────────────────
const user = await ensureHarnessUser();
console.log(`[wire] base=${BASE} label=${LABEL} route=${ROUTE}`);
console.log(`[wire] warm ${ROUTE}: ${await warm(`${BASE}${ROUTE}`)}`);

const browser = await webkit.launch();
// The sign-in context goes through the SAME door as every measured one
// (`insets.test.mjs` enforces that there is only one), on the primary profile:
// /login is a phone screen too, and a desktop-shaped context types into a
// differently laid-out form.
const { context: authContext } = await newDeviceContext(browser, devices[0], {
  motion: "allow",
  insets: "real",
  ignoreHTTPSErrors: true,
});
const authPage = await authContext.newPage();
await signIn(authPage, { email: user.email, password: user.password }, BASE);
const storageState = await authContext.storageState();
await authContext.close();
console.log(`[wire] signed in as ${user.email}; storage state captured`);

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, {
    motion: "allow",
    insets: "real",
    storageState,
    // THE PRODUCTION BUILD CANNOT BE MEASURED OVER PLAIN HTTP. The enforced CSP
    // adds `upgrade-insecure-requests` whenever NODE_ENV === "production"
    // (next.config.ts), so every chunk a `next start` on http://localhost
    // serves is rewritten to https:// and dies with SSL connect error — the
    // page loads zero JavaScript and the login form silently never submits.
    // Measured 2026-08-12; the run goes through a self-signed TLS front
    // instead, which is why the cert has to be tolerated here.
    ignoreHTTPSErrors: true,
  });
  await context.addInitScript(INIT);
  const page = await context.newPage();

  console.log(`\n${"=".repeat(88)}`);
  console.log(`${device.label} — ${device.width}x${device.height} dpr${device.dpr} · WEBKIT · ${LABEL}`);
  console.log(insetBanner(device, inset));

  const row = { label: LABEL, device: device.id, deviceLabel: device.label, route: ROUTE };
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: MAX_WAIT_MS });
    const settle = await waitForQuiescence(page);
    row.settle = settle;
    row.observedFps = await observeFps(page);
    const wire = await page.evaluate(READ_WIRE);
    row.wire = wire;

    console.log(
      `  canvas=${settle.sawCanvas} quiet=${settle.quiet} after ${(settle.waitedMs / 1000).toFixed(1)}s · ` +
        `observedFps=${row.observedFps} (CONTEXT ONLY — no timing claim is made from this run)`,
    );
    console.log(
      `  resource entries ${wire.entries}` +
        (wire.overflowed ? "  *** BUFFER OVERFLOWED — totals are a floor ***" : ""),
    );
    console.log(`  script bytes (initiatorType=script, as PerfProbe reads it): ${kb(wire.byInitiator.transfer)} transferred / ${kb(wire.byInitiator.decoded)} decoded  [${wire.byInitiator.count} files]`);
    console.log(`  script bytes (every .js the document pulled):               ${kb(wire.byUrl.transfer)} transferred / ${kb(wire.byUrl.decoded)} decoded  [${wire.byUrl.count} files]`);
    console.log(`  wasm — stream-compiled, NOT part of the parse budget:       ${kb(wire.wasm.transfer)} transferred / ${kb(wire.wasm.decoded)} decoded  [${wire.wasm.count} files]`);
    console.log(`  first-playable wire (everything, incl. document):           ${mb(wire.totalTransfer)}`);
  } catch (e) {
    row.error = e.message;
    console.log(`  FAILED: ${e.message}`);
  }
  results.push(row);
  await context.close();
}

await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
const out = join(OUT_DIR, `${LABEL}.json`);
writeFileSync(out, `${JSON.stringify({ base: BASE, route: ROUTE, at: new Date().toISOString(), results }, null, 2)}\n`);
console.log(`\n[wire] wrote ${out}`);
