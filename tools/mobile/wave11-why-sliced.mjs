#!/usr/bin/env node
// =============================================================================
// wave11-why-sliced.mjs — NOT „IS IT SLICED" BUT „WHICH BOX DID IT".
//
// wave11-seeing-eye.mjs proves the glyphs are cut and prints the surviving
// letters. This one walks the box chain of the two clamped rows in the overlay
// card and prints, for each ancestor, the height it ASKED for against the height
// it GOT, so the cap that does the cutting is named rather than inferred.
//
// The hypothesis being tested — and it must be able to fail:
//   `line-clamp` compiles to `display:-webkit-box; overflow:hidden`. `overflow`
//   other than `visible` sets a flex item's AUTOMATIC MINIMUM SIZE to 0. So in a
//   height-capped flex column the text rows are free to shrink below one line
//   box, and `overflow:hidden` then slices the glyph row through the waist
//   instead of dropping a whole line.
// If that is right, each row's clientHeight will be LESS than its line-height
// while its scrollHeight is a whole number of lines, and some ancestor will show
// a max-height that the content exceeds.
//
//   node tools/mobile/wave11-why-sliced.mjs --base https://…trycloudflare.com
// =============================================================================
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { webkit, chromium } from "./lib/pw.mjs";
import { resolveDevices } from "./lib/devices.mjs";
import { insetBanner, newDeviceContext } from "./lib/insets.mjs";
import { signIn } from "./lib/auth.mjs";

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const BASE = arg("base", "https://icon-undertaken-earliest-zope.trycloudflare.com");
const EMAIL = arg("email", "founder@knijka.ai");
const PASSWORD = arg("password", "Knijka2026!");
const ROUTE = arg("route", "/simulator?scenario=sc-zebra-approach&level=1");
const ENGINE_NAME = arg("engine", "webkit");
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave11-seeing-eye`;
mkdirSync(OUT, { recursive: true });
const devices = resolveDevices((arg("device", null) || "iphone16-landscape,galaxy-gesturebar-landscape,iphone16-portrait").split(","));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHAIN = () => {
  const R = (n) => Math.round(n * 10) / 10;
  const rows = [...document.querySelectorAll('[data-sim-overlay-card] .line-clamp-3, [data-sim-overlay-card] .line-clamp-6, [data-sim-overlay-card] [class*="line-clamp"]')];
  const out = [];
  for (const row of rows) {
    const chain = [];
    for (let a = row; a && a.nodeType === 1 && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      const r = a.getBoundingClientRect();
      chain.push({
        tag: a.tagName.toLowerCase(),
        cls: (a.getAttribute("class") || "").split(/\s+/).slice(0, 5).join(" "),
        hud: a.getAttribute("data-hud") || a.getAttribute("data-sim-overlay-card") || null,
        display: cs.display,
        flexDirection: cs.flexDirection,
        overflowY: cs.overflowY,
        minHeight: cs.minHeight,
        maxHeight: cs.maxHeight,
        height: cs.height,
        flexShrink: cs.flexShrink,
        lineHeight: cs.lineHeight,
        rect: { w: R(r.width), h: R(r.height) },
        clientH: a.clientHeight,
        scrollH: a.scrollHeight,
        // THE TELL: a box whose content is taller than the box it got.
        shortfall: a.scrollHeight - a.clientHeight,
      });
      if (chain.length > 9) break;
    }
    out.push({
      text: (row.textContent || "").trim().slice(0, 50),
      lineHeightPx: R(parseFloat(getComputedStyle(row).lineHeight)),
      clampedTo: getComputedStyle(row).webkitLineClamp,
      chain,
    });
  }
  return { rows: out, viewport: { w: innerWidth, h: innerHeight } };
};

const launcher = ENGINE_NAME === "webkit" ? webkit : chromium;
const browser = await launcher.launch();
const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: "allow", insets: "real" });
const ap = await authCtx.newPage();
await signIn(ap, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

const all = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: "allow", insets: "real", storageState });
  const page = await context.newPage();
  console.log(`\n${"═".repeat(96)}\n${device.label}\n  ${insetBanner(device, inset)}`);
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6500);
    const d = await page.evaluate(CHAIN);
    all.push({ device: device.id, ...d });
    for (const row of d.rows) {
      console.log(`\n  ROW «${row.text}» · line-height ${row.lineHeightPx}px · clamp ${row.clampedTo}`);
      for (const c of row.chain) {
        console.log(
          `    ${(c.hud ? `[${c.hud}] ` : "") + c.tag}${c.cls ? `.${c.cls.replace(/\s+/g, ".")}` : ""}`.slice(0, 96),
        );
        console.log(
          `        display ${c.display} · flex-shrink ${c.flexShrink} · min-height ${c.minHeight} · max-height ${c.maxHeight} · overflow-y ${c.overflowY}`,
        );
        console.log(
          `        box ${c.rect.w}×${c.rect.h} · clientH ${c.clientH} · scrollH ${c.scrollH} · SHORTFALL ${c.shortfall}px${c.shortfall > 0 ? "  ← content taller than the box it got" : ""}`,
        );
      }
    }
  } catch (e) {
    console.log(`  ERROR ${e.message}`);
  }
  await context.close();
}
writeFileSync(`${OUT}/why-sliced.json`, JSON.stringify(all, null, 2));
console.log(`\n[w11-why] wrote ${OUT}/why-sliced.json`);
await browser.close();
