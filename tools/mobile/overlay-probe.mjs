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

/**
 * EVERY SURFACE THAT CAN CLAIM THE TOP OF THE SCREEN — not just the queue's.
 *
 * This list is why the probe used to certify a screen it had not looked at.
 * `[data-sim-overlay]` is the queue's own root, and the queue behaves: it
 * showed `overlays=0, layer 0.0%` and exit 0 while the founder's landing frame
 * carried FOUR painted surfaces on top of each other. Three of the four are
 * mounted in the SCENE tree and never enter the queue, so a probe that looks
 * only for the queue's marker cannot see the defect it exists to catch — and
 * doc 87 row C1 had to be judged by eye instead.
 *
 * A surface belongs here when it can appear WITHOUT the student asking for it.
 * `touch-controls` is excluded on purpose: the student's thumbs are not a popup.
 */
const CONTENDERS = [
  ['[data-sim-overlay]', "queue"],
  ['[data-hud="touch-hint"]', "touch-hint"],
  ['[data-hud="audio-prompt"]', "audio-prompt"],
  ['[data-hud="difficulty"]', "tier-picker"],
  ['[data-hud="demo-deck"]', "demo-deck"],
  ['[data-hud="telltale-pings"]', "telltale-pings"],
  ['[data-hud="toasts"]', "toasts"],
  ['[data-hud="objective-stack"]', "objective-stack"],
  ['[data-hud="predrive-checklist"]', "predrive-checklist"],
  ['[role="dialog"]', "dialog"],
];

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
  const { band, peekMax, contenders } = config;
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

  // ---- EVERY CONTENDER FOR THE SCREEN, not only the queue's own roots ------
  // Measured separately from `roots` so the queue's numbers keep their old
  // meaning and the new ones cannot be confused with them. Nested matches are
  // dropped (a dialog that contains a queue root is one surface, not two).
  const clampi2 = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const contenderNodes = [];
  for (const [selector, name] of contenders || []) {
    for (const el of document.querySelectorAll(selector)) {
      if (!visible(el)) continue;
      if (contenderNodes.some((c) => c.el.contains(el) || el.contains(c.el))) continue;
      contenderNodes.push({ el, name });
    }
  }
  const surfaceMask = new Uint8Array(AREA);
  let surfacePx = 0;
  let surfaceBandPx = 0;
  const surfaces = [];
  const surfaceSmallTargets = [];
  for (const { el: root, name } of contenderNodes) {
    let ownPx = 0;
    for (const el of [root, ...root.querySelectorAll("*")]) {
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      const bg = cs.backgroundColor || "";
      const paintsBox =
        (bg && bg !== "transparent" && !/rgba\(.*,\s*0\)$/.test(bg)) ||
        (cs.backgroundImage && cs.backgroundImage !== "none") ||
        (cs.backdropFilter && cs.backdropFilter !== "none") ||
        (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== "none") ||
        (cs.boxShadow && cs.boxShadow !== "none") ||
        Number.parseFloat(cs.borderTopWidth) > 0 ||
        Number.parseFloat(cs.borderBottomWidth) > 0 ||
        Number.parseFloat(cs.borderLeftWidth) > 0 ||
        Number.parseFloat(cs.borderRightWidth) > 0;
      if (!paintsBox) continue;
      const r = el.getBoundingClientRect();
      const left = clampi2(Math.floor(r.left), 0, VW);
      const top = clampi2(Math.floor(r.top), 0, VH);
      const right = clampi2(Math.ceil(r.right), 0, VW);
      const bottom = clampi2(Math.ceil(r.bottom), 0, VH);
      if (right <= left || bottom <= top) continue;
      for (let y = top; y < bottom; y += 1) {
        const row = y * VW;
        for (let x = left; x < right; x += 1) {
          const i = row + x;
          if (surfaceMask[i]) continue;
          surfaceMask[i] = 1;
          surfacePx += 1;
          ownPx += 1;
          if (
            x >= bandRect.left && x < bandRect.right &&
            y >= bandRect.top && y < bandRect.bottom
          ) {
            surfaceBandPx += 1;
          }
        }
      }
    }
    const rr = root.getBoundingClientRect();
    surfaces.push({
      name,
      label: (root.getAttribute("aria-label") || "").slice(0, 48),
      text: (root.textContent || "").replace(/\s+/g, " ").trim().slice(0, 70),
      rect: {
        x: Math.round(rr.left),
        y: Math.round(rr.top),
        w: Math.round(rr.width),
        h: Math.round(rr.height),
      },
      paintedPx: ownPx,
      paintedPct: Number(((ownPx / AREA) * 100).toFixed(2)),
    });
    // THE CONTROL THAT CLEARS THE POPUP IS THE ONE THAT MUST BE PRESSABLE.
    // Row C2: «Разбрах» measured 62.9 x 24.9 and was painted over by the
    // surface stacked on it, so the student could not dismiss the thing
    // covering his road. Hit area, not ink — ::before insets count, which is
    // how the app buys 44 px without buying 44 px of chrome.
    for (const b of root.querySelectorAll('button,a[href],[role="button"]')) {
      if (!visible(b)) continue;
      let box = b.getBoundingClientRect();
      let w = box.width;
      let h = box.height;
      for (const pseudo of ["::before", "::after"]) {
        const ps = getComputedStyle(b, pseudo);
        if (!ps || ps.content === "none" || ps.position !== "absolute") continue;
        const px = (v) => Number.parseFloat(v) || 0;
        h += Math.max(0, -px(ps.top)) + Math.max(0, -px(ps.bottom));
        w += Math.max(0, -px(ps.left)) + Math.max(0, -px(ps.right));
      }
      // COVERED IS AS BAD AS SMALL. elementFromPoint at the control's centre
      // is what a thumb does; if it lands on something else, the button is
      // decorative. This is the harness's own «Разбрах» warning, promoted from
      // a console line to a measurement.
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      const covered = !!hit && hit !== b && !b.contains(hit) && !hit.contains(b);
      if (w < 44 || h < 44 || covered) {
        surfaceSmallTargets.push({
          surface: name,
          label: (b.textContent || b.getAttribute("aria-label") || "").trim().slice(0, 32),
          w: Math.round(w),
          h: Math.round(h),
          covered,
        });
      }
    }
  }

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
      const left = clampi2(Math.floor(r.left), 0, VW);
      const top = clampi2(Math.floor(r.top), 0, VH);
      const right = clampi2(Math.ceil(r.right), 0, VW);
      const bottom = clampi2(Math.ceil(r.bottom), 0, VH);
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
    // The queue's own accounting — unchanged meaning.
    overlayCount: roots.length,
    // Row C1's accounting: everything competing for the screen at this instant.
    surfaceCount: contenderNodes.length,
    surfaces,
    surfacePx,
    surfaceFraction: Number((surfacePx / AREA).toFixed(4)),
    surfaceCentreBandPx: surfaceBandPx,
    surfaceSmallTargets,
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
    contenders: CONTENDERS,
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
      ...contextOptions(device, { motion: "reduce" }),
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

      // ── THE STATE HE ACTUALLY OPENS ON, MEASURED FIRST ──────────────────
      // This row did not exist, and its absence is why the overlay budget
      // reported exit 0 for a screen the founder called „not playable at all".
      // The probe used to dismiss the intro and then measure — i.e. it stepped
      // over the one frame row C1 is about. Measured before anything is
      // dismissed, and BEFORE `driving`, because a student cannot skip it.
      rows.push(await measure(page, "landing", device, OUT_DIR));

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
  // ROW C1 — MUTUAL EXCLUSION ACROSS BOTH TREES, and it counts on every state.
  // „ONE overlay visible at a time" was the phase-4 acceptance; it was only
  // ever enforced against the queue's own roots, which is how four surfaces
  // could stack while the probe printed overlays=0.
  if (r.surfaceCount > 1) {
    problems.push(
      `${r.surfaceCount} SURFACES AT ONCE (${r.surfaces.map((s) => s.name).join("+")})`,
    );
  }
  // ROW C2 — and the harness's own „«Разбрах» was not tappable" warning, which
  // used to be a console line nothing could fail on.
  for (const t of r.surfaceSmallTargets || []) {
    problems.push(
      t.covered
        ? `«${t.label}» on ${t.surface} is PAINTED OVER`
        : `«${t.label}» on ${t.surface} is ${t.w}x${t.h}`,
    );
  }
  if (problems.length > 0) failed = true;
  console.log(
    `  ${r.device.padEnd(20)} ${r.state.padEnd(9)} surfaces=${r.surfaceCount} ` +
      `overlays=${r.overlayCount} ` +
      `layer=${(r.surfaceFraction * 100).toFixed(1)}% band=${r.surfaceCentreBandPx}px ` +
      `road=${(r.roadFraction * 100).toFixed(1)}% chrome=${(r.chromeFraction * 100).toFixed(1)}%` +
      (problems.length > 0 ? `   <-- ${problems.join(" · ")}` : "   ok"),
  );
  for (const s of r.surfaces || []) {
    console.log(
      `      ${String(s.name).padEnd(20)} ${String(s.rect.w + "x" + s.rect.h).padEnd(9)} ` +
        `at ${s.rect.x},${s.rect.y}  ${String(s.paintedPct).padStart(5)}% ink  ${s.text}`,
    );
  }
}
console.log(`\n  captures: ${OUT_DIR}`);
process.exit(failed ? 1 : 0);
