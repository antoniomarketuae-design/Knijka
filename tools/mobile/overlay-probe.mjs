#!/usr/bin/env node
// =============================================================================
// overlay-probe.mjs — does the in-sim overlay layer keep its budget, in WebKit,
// on the founder's phone, in BOTH orientations?
//
//   node tools/mobile/overlay-probe.mjs
//   node tools/mobile/overlay-probe.mjs --base-url http://localhost:3490
//   node tools/mobile/overlay-probe.mjs --engine chromium     (second opinion)
//
// It runs on top of the phase-0 harness (lib/pw, lib/devices, lib/auth,
// lib/routes, lib/probe) so it inherits every rule that harness enforces:
// WebKit and not Chromium-in-a-costume, a real authenticated session with the
// landed path asserted, the strict "any pixel a UI element paints on is not
// road" accounting, and the device profiles' REAL safe-area insets.
//
// WHAT IT ASSERTS (founder review 2026-07-29, phase 4):
//   1. never more than ONE overlay on screen at once
//   2. the default (peek) state costs <= 12 % of the viewport
//   3. nothing paints inside the CENTRE BAND — that is the road
//   4. every overlay that names a mistake can still show its law-cited WHY
//      (THEO-4, requirement zero — asserted from the DOM, not from intent)
//
// The four fractions below are literals because a .mjs cannot import the
// TypeScript that owns them; `overlay-queue.test.ts` pins the same values, so
// a change on one side reddens the other.
//
// STATES. An overlay layer measured only in its resting state is not measured.
// This drives the car: it dismisses the intro popups, then holds the throttle,
// which on a scene that spawns ready-to-drive with the belt off is the shortest
// honest path to a live cabin warning and a first-encounter teach moment.
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./lib/pw.mjs";
import { contextOptions, resolveDevices } from "./lib/devices.mjs";
import { resolveRoutes } from "./lib/routes.mjs";
import { probeBody } from "./lib/probe.mjs";
import { gotoAuthenticated, signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, ".out", "overlays");

/** Mirrors modules/sim/hud/overlayQueue.ts — pinned by overlay-queue.test.ts. */
const OVERLAY_PEEK_MAX_FRACTION = 0.12;
const CENTRE_BAND = { x0: 0.16, x1: 0.84, y0: 0.2, y1: 0.74 };

function parseArgs(argv) {
  const out = { devices: [], flags: new Set() };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--base-url") out.baseUrl = argv[++i];
    else if (a === "--engine") out.engine = argv[++i];
    else if (a === "--device" || a === "-d") out.devices.push(argv[++i]);
    else if (a.startsWith("--")) out.flags.add(a.slice(2));
  }
  return out;
}

// -----------------------------------------------------------------------------
// The in-page half. Runs inside WebKit; may not reference Node.
// -----------------------------------------------------------------------------
function overlayProbeBody(config) {
  const { band, peekMax } = config;
  const VW = Math.round(window.innerWidth);
  const VH = Math.round(window.innerHeight);
  const AREA = VW * VH;

  const bandRect = {
    left: VW * band.x0,
    right: VW * band.x1,
    top: VH * band.y0,
    bottom: VH * band.y1,
  };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    let node = el;
    while (node) {
      const s = getComputedStyle(node);
      if (s.display === "none" || s.visibility === "hidden") return false;
      if (Number.parseFloat(s.opacity) <= 0) return false;
      node = node.parentElement;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < VH && r.right > 0 && r.left < VW;
  };

  const roots = Array.from(document.querySelectorAll("[data-sim-overlay]")).filter(visible);

  // Union of every pixel painted by the overlay layer, rasterised at 1 CSS px —
  // the same accounting the coverage probe uses, so a translucent pill is
  // charged for its rectangle exactly like a solid card would be.
  const mask = new Uint8Array(AREA);
  const clampi = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  let overlayPx = 0;
  let bandPx = 0;
  const boxes = [];
  for (const root of roots) {
    // The root is a positioning wrapper (pointer-events-none, no paint of its
    // own). What COSTS screen is every painting descendant, so charge those.
    const painters = [root, ...root.querySelectorAll("*")].filter(visible);
    for (const el of painters) {
      const cs = getComputedStyle(el);
      const paints =
        (cs.backgroundColor && !/rgba\(.*,\s*0\)/.test(cs.backgroundColor) &&
          cs.backgroundColor !== "transparent") ||
        (cs.backgroundImage && cs.backgroundImage !== "none") ||
        (cs.backdropFilter && cs.backdropFilter !== "none") ||
        (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") ||
        (cs.boxShadow && cs.boxShadow !== "none") ||
        Number.parseFloat(cs.borderTopWidth) > 0 ||
        Number.parseFloat(cs.borderBottomWidth) > 0;
      if (!paints) continue;
      const r = el.getBoundingClientRect();
      const left = clampi(Math.floor(r.left), 0, VW);
      const top = clampi(Math.floor(r.top), 0, VH);
      const right = clampi(Math.ceil(r.right), 0, VW);
      const bottom = clampi(Math.ceil(r.bottom), 0, VH);
      if (right <= left || bottom <= top) continue;
      boxes.push({
        kind: root.getAttribute("data-sim-overlay"),
        state: root.getAttribute("data-sim-overlay-state"),
        x: left,
        y: top,
        w: right - left,
        h: bottom - top,
      });
      for (let y = top; y < bottom; y += 1) {
        const row = y * VW;
        for (let x = left; x < right; x += 1) {
          const i = row + x;
          if (mask[i]) continue;
          mask[i] = 1;
          overlayPx += 1;
          if (
            x >= bandRect.left && x < bandRect.right &&
            y >= bandRect.top && y < bandRect.bottom
          ) {
            bandPx += 1;
          }
        }
      }
    }
  }

  // THEO-4, asserted from the DOM. An overlay that names a mistake must offer a
  // way to the authored WHY — a „Защо" control, or an already-open sheet.
  const MISTAKE_KINDS = ["teach", "violation", "hint", "warning"];
  const theo4 = roots
    .filter((r) => MISTAKE_KINDS.includes(r.getAttribute("data-sim-overlay")))
    .map((r) => {
      const state = r.getAttribute("data-sim-overlay-state");
      const buttons = Array.from(r.querySelectorAll("button")).map((b) =>
        (b.textContent || "").trim(),
      );
      return {
        kind: r.getAttribute("data-sim-overlay"),
        state,
        reachableWhy: state === "open" || buttons.some((t) => /Защо|Списък/.test(t)),
        buttons,
      };
    });

  // Every interactive control inside the layer must still be a 44 px target.
  const smallTargets = [];
  for (const root of roots) {
    for (const b of root.querySelectorAll('button,a[href],[role="button"]')) {
      if (!visible(b)) continue;
      const r = b.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        smallTargets.push({
          label: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 32),
          w: Math.round(r.width),
          h: Math.round(r.height),
        });
      }
    }
  }

  return {
    viewport: { width: VW, height: VH },
    overlayCount: roots.length,
    kinds: roots.map((r) => ({
      kind: r.getAttribute("data-sim-overlay"),
      state: r.getAttribute("data-sim-overlay-state"),
      text: (r.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90),
    })),
    boxes,
    overlayPx,
    overlayFraction: Number((overlayPx / AREA).toFixed(4)),
    withinPeekBudget: overlayPx / AREA <= peekMax,
    centreBandPx: bandPx,
    clearsCentreBand: bandPx === 0,
    theo4,
    smallTargets,
    // Legacy panels this redesign retired on a phone. Any of them visible means
    // the old racing-panel layout is back.
    legacyVisible: [
      ['[data-hud="telltale-pings"]', "telltale edge chips"],
      ['[aria-label="Протокол — наказателни точки"]', "exam tally panel"],
    ]
      .filter(([sel]) => Array.from(document.querySelectorAll(sel)).some(visible))
      .map(([, name]) => name),
  };
}

// -----------------------------------------------------------------------------
async function dismissIntro(page) {
  const route = resolveRoutes(["simulator-drive"])[0];
  await route.prepare(page);
}

/**
 * Hold the throttle. The scene spawns ready to drive with the belt off, so this
 * is the shortest honest route to a live cabin warning and a first-encounter
 * teach moment.
 *
 * CAVEAT, STATED SO NOBODY MISREADS THE TABLE: the touch controls hide
 * themselves the moment a keyboard is used, so the `road=` figure in the
 * `driving` row is measured WITHOUT them and is therefore optimistic about the
 * screen as a whole. The `ambient` row is the honest full-layout number, and
 * the columns this script exists for — overlays / layer / band — are unaffected
 * either way, because the overlay layer does not change when the controls hide.
 */
async function drive(page, ms) {
  await page.keyboard.down("w");
  await page.waitForTimeout(ms);
  await page.keyboard.up("w");
  await page.waitForTimeout(600);
}

async function measure(page, label, device, shotDir) {
  const overlay = await page.evaluate(overlayProbeBody, {
    band: CENTRE_BAND,
    peekMax: OVERLAY_PEEK_MAX_FRACTION,
  });
  const coverage = await page.evaluate(probeBody, {
    contentSelectors: ["canvas"],
    mustFit: [],
    safeArea: device.safeArea,
    safeEdgeMargin: 8,
    minTouch: 44,
  });
  await page.screenshot({ path: join(shotDir, `${device.id}__${label}.png`) });
  return {
    state: label,
    device: device.id,
    ...overlay,
    roadFraction: coverage.coverage.contentFraction,
    chromeFraction: coverage.coverage.chromeFraction,
    topContributors: coverage.coverage.topContributors.slice(0, 6),
  };
}

const args = parseArgs(process.argv.slice(2));
const engine = engineByName(args.engine || "webkit");
const url = args.baseUrl || process.env.KNIJKA_MOBILE_BASE_URL || "http://localhost:3490";
const devices = resolveDevices(
  args.devices.length > 0 ? args.devices : ["iphone16-landscape", "iphone16-portrait"],
);
const route = resolveRoutes(["simulator-drive"])[0];

mkdirSync(OUT_DIR, { recursive: true });

const credentials =
  process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
    ? { email: process.env.KNIJKA_MOBILE_EMAIL, password: process.env.KNIJKA_MOBILE_PASSWORD }
    : await ensureHarnessUser();

/**
 * COMPILE THE ROUTES FROM NODE BEFORE THE BROWSER SEES THEM.
 *
 * Measured on this box, twice: a browser navigation to an uncompiled route in a
 * fresh `next dev` blew a 180 s Playwright timeout and screenshotted a blank
 * page, while a plain `curl` of the same URL simply waited and got a 200. A
 * fetch has no navigation timeout and no service worker in front of it (see the
 * harness's own warmRoutes, and the /offline.html trap documented there), so it
 * is the right thing to make wait. `cookieJar` is empty for /login and carries
 * the session for the authenticated routes.
 */
async function warm(target, cookie = "") {
  const startedAt = Date.now();
  try {
    const res = await fetch(target, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    await res.arrayBuffer();
    console.log(
      `[overlay-probe] warmed ${target} -> ${res.status} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`,
    );
  } catch (error) {
    console.log(`[overlay-probe] warm ${target} failed: ${error.message}`);
  }
}

await warm(new URL("/login", url).toString());

const browser = await engine.launcher.launch();
const rows = [];
let storageState;
try {
  for (const device of devices) {
    const context = await browser.newContext({
      ...contextOptions(device),
      ...(storageState ? { storageState } : {}),
    });
    const page = await context.newPage();
    // Playwright's 30 s default is a fact about Playwright, not about this box.
    // `signIn` navigates with waitUntil:"load", which waits for every chunk a
    // `next dev` is still compiling; measured here, that blew the default while
    // a plain curl of the same URL answered in one second. A 30 s cap turns a
    // slow disk into "the login page is broken".
    page.setDefaultTimeout(180_000);
    page.setDefaultNavigationTimeout(180_000);
    try {
      if (!storageState) {
        await signIn(page, credentials, url);
        storageState = await context.storageState();
        // …and now that there is a session, compile the driving route the same
        // patient way. A cold /simulator behind a 3D bundle is the slowest page
        // in the app; letting the BROWSER discover that is how the first two
        // runs of this script produced blank screenshots.
        const cookies = await context.cookies();
        await warm(
          new URL(route.path, url).toString(),
          cookies.map((c) => `${c.name}=${c.value}`).join("; "),
        );
      }
      await gotoAuthenticated(page, url, route);
      await page.waitForSelector("canvas", { timeout: 180_000, state: "attached" });
      await page.waitForTimeout(6000);
      await dismissIntro(page);
      await page.waitForTimeout(1500);

      rows.push(await measure(page, "ambient", device, OUT_DIR));
      await drive(page, 9000);
      rows.push(await measure(page, "driving", device, OUT_DIR));
    } catch (error) {
      rows.push({ state: "ERROR", device: device.id, error: String(error?.message || error) });
      await page
        .screenshot({ path: join(OUT_DIR, `FAILED__${device.id}.png`) })
        .catch(() => {});
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

writeFileSync(
  join(OUT_DIR, "overlays.json"),
  JSON.stringify({ engine: engine.name, baseUrl: url, rows }, null, 2),
);

let failed = false;
console.log(`\nOVERLAY BUDGET — ${engine.name} @ ${url}\n`);
for (const r of rows) {
  if (r.error) {
    failed = true;
    console.log(`  ${r.device.padEnd(20)} ${r.state.padEnd(9)} ERROR ${r.error}`);
    continue;
  }
  const problems = [];
  if (r.overlayCount > 1) problems.push(`${r.overlayCount} OVERLAYS AT ONCE`);
  if (!r.withinPeekBudget) problems.push(`over budget`);
  if (!r.clearsCentreBand) problems.push(`${r.centreBandPx}px IN THE CENTRE BAND`);
  if (r.smallTargets.length > 0) problems.push(`${r.smallTargets.length} targets <44px`);
  if (r.legacyVisible.length > 0) problems.push(`legacy: ${r.legacyVisible.join(", ")}`);
  for (const t of r.theo4) {
    if (!t.reachableWhy) problems.push(`THEO-4: ${t.kind} has no reachable WHY`);
  }
  if (problems.length > 0) failed = true;
  console.log(
    `  ${r.device.padEnd(20)} ${r.state.padEnd(9)} overlays=${r.overlayCount} ` +
      `layer=${(r.overlayFraction * 100).toFixed(1)}% band=${r.centreBandPx}px ` +
      `road=${(r.roadFraction * 100).toFixed(1)}% chrome=${(r.chromeFraction * 100).toFixed(1)}%` +
      (problems.length > 0 ? `   <-- ${problems.join(" · ")}` : "   ok"),
  );
  for (const k of r.kinds) console.log(`      ${k.kind}/${k.state}: ${k.text}`);
}
console.log(`\n  captures: ${OUT_DIR}`);
process.exit(failed ? 1 : 0);
