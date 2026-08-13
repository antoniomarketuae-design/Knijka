#!/usr/bin/env node
// =============================================================================
// wave12-sheet.mjs — THE ONE STATE THE FLANK SWEEP CANNOT REACH.
//
// `wave12-flanks.mjs` measures the opening frame and the driving frame, and in
// both of them the ⚙ sheet is closed. But the sheet is the surface this wave
// changed second: it used to run edge to edge at `0.125rem` and it hangs from
// `TOUCH_CONTROLS_FLOOR`, which — now that the flanks are 132 px and 176 px
// tall — is INSIDE the band's vertical span on every profile (iPhone 16
// sideways: strip y 92–136, band y 44–220). If its new lane offsets are wrong
// it lands on three or four graded controls and no other probe would see it,
// because no other probe opens it.
//
// So: fasten the belt (station 0 on the throttle flank IS the belt while it is
// off — pressing it hands the same box back to the ⚙ dock), press ⚙, then ask
// `elementFromPoint` the same question the flank sweep asks, at every station's
// centre and its four corners.
//
//   node tools/mobile/wave12-sheet.mjs --device iphone16-landscape,iphone16-portrait
// =============================================================================
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { webkit } from "./lib/pw.mjs";
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
const MOTION = arg("motion", "allow"); // MANDATORY argument to newDeviceContext
const OUT = `${dirname(fileURLToPath(import.meta.url))}/.out/wave12-flanks`;
mkdirSync(OUT, { recursive: true });
const only = arg("device", "iphone16-landscape,iphone16-portrait");
const devices = resolveDevices(only.split(","));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const NO_FULLSCREEN = () => {
  try {
    Object.defineProperty(Document.prototype, "fullscreenEnabled", { get: () => false, configurable: true });
    Element.prototype.requestFullscreen = () => Promise.reject(new Error("blocked by probe"));
  } catch {
    /* engine without the descriptor */
  }
};

const PROBE = () => {
  const R = (r) => ({
    x: Math.round(r.left * 10) / 10,
    y: Math.round(r.top * 10) / 10,
    w: Math.round(r.width * 10) / 10,
    h: Math.round(r.height * 10) / 10,
  });
  const sheet = document.querySelector('[role="toolbar"][aria-label="Контроли на автомобила"]');
  const stations = [...document.querySelectorAll("[data-arc]")].map((el) => {
    const btn = el.querySelector("button") || el;
    const r = btn.getBoundingClientRect();
    const probe = (x, y) => {
      const hit = document.elementFromPoint(x, y);
      if (!hit) return "NONE";
      if (hit === btn || btn.contains(hit) || hit.contains(btn)) return "self";
      return `${hit.tagName.toLowerCase()}${hit.getAttribute("data-hud") ? `[${hit.getAttribute("data-hud")}]` : ""}:${(hit.textContent || "").replace(/\s+/g, " ").trim().slice(0, 28)}`;
    };
    return {
      side: el.getAttribute("data-arc-side"),
      index: Number(el.getAttribute("data-arc")),
      caption: (el.textContent || "").replace(/\s+/g, " ").trim(),
      box: R(r),
      centreHit: probe(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)),
      corners: [
        probe(Math.round(r.left) + 2, Math.round(r.top) + 2),
        probe(Math.round(r.right) - 2, Math.round(r.top) + 2),
        probe(Math.round(r.left) + 2, Math.round(r.bottom) - 2),
        probe(Math.round(r.right) - 2, Math.round(r.bottom) - 2),
      ],
    };
  });
  return {
    sheetOpen: !!sheet,
    sheetRect: sheet ? R(sheet.getBoundingClientRect()) : null,
    sheetCells: sheet ? sheet.querySelectorAll("button").length : 0,
    // The sheet's own cells must still be reachable — a lane that clears the
    // band by pushing a control off the screen has not fixed anything.
    sheetCellsOffStage: sheet
      ? [...sheet.querySelectorAll("button")].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.left < 0 || r.top < 0 || r.right > window.innerWidth || r.bottom > window.innerHeight;
        }).length
      : 0,
    viewport: { w: window.innerWidth, h: window.innerHeight },
    stations,
  };
};

const browser = await webkit.launch({});
console.log("█".repeat(96));
console.log("[w12-sheet] THE ⚙ SHEET AGAINST THE TWO BANDS — the state no other probe opens");
console.log(`[w12-sheet] base ${BASE}   route ${ROUTE}   motion ${MOTION}`);
console.log("█".repeat(96));

const { context: authCtx } = await newDeviceContext(browser, devices[0], { motion: MOTION, insets: "real" });
await authCtx.addInitScript(NO_FULLSCREEN);
const authPage = await authCtx.newPage();
await signIn(authPage, { email: EMAIL, password: PASSWORD }, BASE);
const storageState = await authCtx.storageState();
await authCtx.close();

const results = [];
for (const device of devices) {
  const { context, inset } = await newDeviceContext(browser, device, { motion: MOTION, insets: "real", storageState });
  await context.addInitScript(NO_FULLSCREEN);
  const page = await context.newPage();
  const rec = { device: device.id, insetBanner: insetBanner(device, inset) };
  console.log(`\n${"═".repeat(96)}\n${device.label}  ${device.width}x${device.height}\n  ${rec.insetBanner}`);
  try {
    await page.goto(`${BASE}${ROUTE}`, { waitUntil: "domcontentloaded", timeout: 240_000 });
    await page.waitForSelector('[data-hud="touch-controls"]', { timeout: 240_000 });
    await sleep(6000);
    // Dismiss the pre-drive cards so the sheet is not competing with an overlay.
    for (let i = 0; i < 8; i += 1) {
      const c = await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((n) =>
          /^(Разбрах|Продължи|Започни|Ясно|Хайде)$/.test((n.textContent || "").trim()),
        );
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      });
      if (!c) break;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(80);
      await page.mouse.up();
      await sleep(400);
    }
    // Fasten the belt, then open the dock. Both live on the SAME station box.
    const press = async (label) => {
      const c = await page.evaluate((l) => {
        const b = [...document.querySelectorAll("button")].find((n) => (n.getAttribute("aria-label") || "").startsWith(l));
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
      }, label);
      if (!c) return false;
      await page.mouse.move(c.x, c.y);
      await page.mouse.down();
      await sleep(90);
      await page.mouse.up();
      await sleep(700);
      return true;
    };
    rec.belt = await press("Закопчай предпазния колан");
    rec.dock = await press("Контроли на автомобила");
    const s = await page.evaluate(PROBE);
    rec.state = s;
    const shot = `${OUT}/sheet-${device.id}.png`;
    await page.screenshot({ path: shot });
    rec.shot = shot;
    console.log(`  belt pressed ${rec.belt} · dock pressed ${rec.dock}`);
    console.log(`  SHEET OPEN ${s.sheetOpen} · rect ${JSON.stringify(s.sheetRect)} · ${s.sheetCells} cells · ${s.sheetCellsOffStage} off the stage`);
    const covered = s.stations.filter((t) => t.centreHit !== "self" || t.corners.some((c) => c !== "self"));
    if (!s.sheetOpen) {
      console.log("  ✗ THE SHEET DID NOT OPEN — this run proves nothing about it");
    } else if (covered.length === 0) {
      console.log(`  ✓ with the sheet OPEN, nothing is on top of any of the ${s.stations.length} stations`);
    } else {
      for (const c of covered) {
        console.log(`  ✗ COVERED · ${c.caption} ${JSON.stringify(c.box)} · centre→${c.centreHit} · corners ${c.corners.join(" | ")}`);
      }
    }
    rec.covered = covered;
  } catch (e) {
    rec.fatal = e.message;
    console.log(`  FATAL · ${e.message}`);
  }
  results.push(rec);
  await context.close();
}
await browser.close();
writeFileSync(`${OUT}/sheet.json`, JSON.stringify({ base: BASE, route: ROUTE, results }, null, 2));
console.log(`\n[w12-sheet] → ${OUT}/sheet.json`);
