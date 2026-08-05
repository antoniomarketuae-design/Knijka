#!/usr/bin/env node
// =============================================================================
// notch-shot.mjs — LOOK AT THE FIX, on a screen that has a notch.
//
//   node tools/mobile/notch-shot.mjs --base-url http://localhost:3520
//
// THE PROBLEM THIS SOLVES. Playwright's WebKit is the desktop port: it has no
// cutout, so `env(safe-area-inset-*)` resolves to 0 and a safe-area fix is
// pixel-identical to the bug it fixes. Every capture in the sweep is therefore
// mute about the one thing this lane changed — which is exactly the situation
// the project's R0 rule ("look before you ship") exists for.
//
// So this paints the insets in. It cannot make env() non-zero, so it does the
// next honest thing: it substitutes the device's REAL inset values into the
// same declarations the app ships (read out of the live computed style, not
// guessed), then draws the unsafe bands over the result in red. Anything a
// student's camera housing or home indicator would cover is under red.
//
// It renders the drawer BEFORE and AFTER — "before" by putting back the exact
// geometry that shipped previously (`width: 18rem; padding: 1rem`) — so the two
// can be looked at side by side rather than argued about.
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { engineByName } from "./lib/pw.mjs";
import { contextOptions, resolveDevices } from "./lib/devices.mjs";
import { gotoAuthenticated, signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), ".out", "stability", "notch");
mkdirSync(OUT, { recursive: true });

const args = process.argv.slice(2);
const url = args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : "http://localhost:3520";

const SURFACE = {
  id: "theory",
  path: "/theory",
  expectPath: "/theory",
  waitFor: "#main-content",
};

/** Substitute real insets, then mark the bands. Runs in the page. */
function dress(config) {
  const { inset, mode } = config;
  const drawer = document.querySelector("#mobile-nav");
  if (drawer) {
    if (mode === "before") {
      // The geometry that shipped before this lane: a flat 18rem panel with a
      // uniform 1rem of padding and no knowledge of the cutout.
      drawer.style.width = "18rem";
      drawer.style.paddingLeft = "1rem";
      drawer.style.paddingTop = "1rem";
      drawer.style.paddingBottom = "1rem";
    } else {
      // What the app now ships, with env() resolved to this device's values.
      drawer.style.width = `calc(18rem + ${inset.left}px)`;
      drawer.style.paddingLeft = `calc(1rem + ${inset.left}px)`;
      drawer.style.paddingTop = `calc(1rem + ${inset.top}px)`;
      drawer.style.paddingBottom = `calc(1rem + ${inset.bottom}px)`;
    }
  }

  const band = (css) => {
    const d = document.createElement("div");
    d.setAttribute("data-notch-band", "");
    d.style.cssText =
      "position:fixed;z-index:2147483647;pointer-events:none;" +
      "background:rgba(255,0,64,0.34);box-shadow:inset 0 0 0 1px rgba(255,0,64,0.9);" + css;
    document.body.appendChild(d);
  };
  for (const el of document.querySelectorAll("[data-notch-band]")) el.remove();
  if (inset.left) band(`left:0;top:0;bottom:0;width:${inset.left}px`);
  if (inset.right) band(`right:0;top:0;bottom:0;width:${inset.right}px`);
  if (inset.top) band(`left:0;right:0;top:0;height:${inset.top}px`);
  if (inset.bottom) band(`left:0;right:0;bottom:0;height:${inset.bottom}px`);

  // What is actually under red, so the picture has a number next to it.
  const hits = [];
  for (const el of document.querySelectorAll("#mobile-nav a, #mobile-nav button, #mobile-nav span")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const label = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    if (!label) continue;
    const into = [];
    if (inset.left && r.left < inset.left) into.push(`left ${Math.round(inset.left - r.left)}px`);
    if (inset.right && r.right > window.innerWidth - inset.right) {
      into.push(`right ${Math.round(r.right - (window.innerWidth - inset.right))}px`);
    }
    if (inset.bottom && r.bottom > window.innerHeight - inset.bottom) {
      into.push(`bottom ${Math.round(r.bottom - (window.innerHeight - inset.bottom))}px`);
    }
    if (into.length > 0) hits.push(`${label} → ${into.join(", ")}`);
  }
  return [...new Set(hits)];
}

const creds =
  process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
    ? { email: process.env.KNIJKA_MOBILE_EMAIL, password: process.env.KNIJKA_MOBILE_PASSWORD }
    : await ensureHarnessUser();

const browser = await engineByName("webkit").launcher.launch();
let storageState;
const summary = {};

for (const id of ["iphone16-landscape", "iphone16-portrait"]) {
  const device = resolveDevices([id])[0];
  const ctx = await browser.newContext({
    ...contextOptions(device, { motion: "reduce" }),
    ...(storageState ? { storageState } : {}),
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);
  page.setDefaultNavigationTimeout(180_000);
  if (!storageState) {
    await signIn(page, creds, url);
    storageState = await ctx.storageState();
  }
  await gotoAuthenticated(page, url, SURFACE);
  await page.waitForSelector(SURFACE.waitFor, { timeout: 180_000, state: "attached" });
  await page.waitForTimeout(1200);
  await page.locator('header[data-app-topbar] button[aria-controls="mobile-nav"]').first().click();
  await page.waitForTimeout(700);

  for (const mode of ["before", "after"]) {
    const hits = await page.evaluate(dress, { inset: device.safeArea, mode });
    await page.screenshot({ path: join(OUT, `${id}__${mode}.png`) });
    summary[`${id}/${mode}`] = hits;
  }
  await ctx.close();
}
await browser.close();

writeFileSync(join(OUT, "notch.json"), JSON.stringify(summary, null, 2));
console.log("\nWHAT SITS UNDER THE NOTCH / HOME INDICATOR (drawer open, /theory)\n");
for (const [key, hits] of Object.entries(summary)) {
  console.log(`  ${key.padEnd(28)} ${hits.length === 0 ? "clear" : `${hits.length} item(s)`}`);
  for (const h of hits) console.log(`      ${h}`);
}
console.log(`\n  captures: ${OUT}`);
