#!/usr/bin/env node
// =============================================================================
// toolbar-trace.mjs — WHY does the portrait driving screen not come back?
//
//   node tools/mobile/toolbar-trace.mjs --base-url http://localhost:3520
//
// The stability sweep reported the portrait play shell shifting 90px and never
// returning when the viewport is shortened by a toolbar's height and restored.
// A shift number says THAT it happened; this says WHAT the numbers were, over
// time, so the fix addresses the mechanism rather than the symptom.
//
// It reads, at each step: the layout viewport, window.visualViewport, the value
// the shell published as --sim-vh, and the shell root's own client height. If
// --sim-vh tracks and the root does not, the bug is in the CSS; if --sim-vh
// itself is stale, the bug is in the measurement.
// =============================================================================
import { engineByName } from "./lib/pw.mjs";
import { contextOptions, resolveDevices } from "./lib/devices.mjs";
import { ROUTES } from "./lib/routes.mjs";
import { gotoAuthenticated, signIn } from "./lib/auth.mjs";
import { ensureHarnessUser } from "./lib/user.mjs";

const args = process.argv.slice(2);
const baseUrl =
  args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : "http://localhost:3520";
const deviceId = args.includes("-d") ? args[args.indexOf("-d") + 1] : "iphone16-portrait";

const surface = ROUTES.find((r) => r.id === "simulator-drive");
const [device] = resolveDevices([deviceId]);
const engine = engineByName("webkit");

const credentials =
  process.env.KNIJKA_MOBILE_EMAIL && process.env.KNIJKA_MOBILE_PASSWORD
    ? { email: process.env.KNIJKA_MOBILE_EMAIL, password: process.env.KNIJKA_MOBILE_PASSWORD }
    : await ensureHarnessUser();

const read = () =>
  ({
    layout: { w: window.innerWidth, h: window.innerHeight },
    visual: window.visualViewport
      ? { w: Math.round(window.visualViewport.width), h: Math.round(window.visualViewport.height) }
      : null,
    // The shell publishes --sim-vh on its root; read it off the element that
    // declares it so a fallback from :root cannot be mistaken for a measurement.
    simVh: (() => {
      const root = document.querySelector("[data-sim-compact], [data-sim-play]");
      if (!root) return "(no shell root found)";
      return {
        inline: root.style.getPropertyValue("--sim-vh"),
        computedHeight: root.style.height,
        clientH: root.clientHeight,
        rectTop: Math.round(root.getBoundingClientRect().top),
        rectH: Math.round(root.getBoundingClientRect().height),
      };
    })(),
    cluster: (() => {
      const el = document.querySelector('[aria-label="Табло на автомобила"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) };
    })(),
  });

const browser = await engine.launcher.launch();
const context = await browser.newContext(contextOptions(device));
const page = await context.newPage();
page.setDefaultTimeout(180_000);
page.setDefaultNavigationTimeout(180_000);

const show = async (label) => {
  const v = await page.evaluate(read);
  console.log(`\n== ${label}`);
  console.log(JSON.stringify(v, null, 2));
};

try {
  await signIn(page, credentials, baseUrl);
  await gotoAuthenticated(page, baseUrl, surface);
  await page.waitForSelector("canvas", { state: "attached" });
  await surface.prepare(page);
  await page.waitForTimeout(surface.settleMs ?? 6000);

  await show(`BASE ${device.width}x${device.height}`);

  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: vp.height - 90 });
  await page.waitForTimeout(700);
  await show("SHRUNK by 90 (toolbar shown)");

  await page.setViewportSize(vp);
  for (const wait of [100, 600, 2000, 5000]) {
    await page.waitForTimeout(wait);
    await show(`RESTORED, cumulative wait ${100 + (wait > 100 ? wait : 0)}ms+`);
  }
} finally {
  await browser.close();
}
