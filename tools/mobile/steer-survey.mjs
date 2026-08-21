/**
 * steer-survey.mjs — WHAT DOES THE PAGE PUBLISH THAT A CONTROL LAW COULD USE?
 *
 * Throwaway measurement, not part of any sweep. Round 2 surveyed this by
 * reading the DOM once and named three candidates; this programme has been
 * damaged repeatedly by inherited claims, so it is measured again, on a moving
 * car, on both viewports.
 *
 *   node tools/mobile/steer-survey.mjs <outDir> <scenarioId> [mobile|pc]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { decodePng } from "./lib/png.mjs";
import { newDeviceContext } from "./lib/insets.mjs";
import { DEVICES } from "./lib/devices.mjs";
import { signIn } from "./lib/auth.mjs";
import { resolveBase } from "./lib/target.mjs";

const [OUT, SCENARIO = "sc-ov-lane-keeping", PLATFORM = "mobile"] = process.argv.slice(2);
const BASE = resolveBase();
mkdirSync(OUT, { recursive: true });
const log = [];
const note = (s) => { log.push(s); console.log(s); };

const { webkit, chromium } = await import("./lib/pw.mjs");
let browser, context;
if (PLATFORM === "pc") {
  browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"] });
  // The `mobile` branch below IS a phone and goes through newDeviceContext, so
  // the notch rule still binds where it means anything.
  // insets-exempt: the pc leg is the 1440×900 desktop, which has no safe areas.
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
} else {
  browser = await webkit.launch({ headless: true });
  ({ context } = await newDeviceContext(browser, DEVICES["iphone16-landscape"], { motion: "allow" }));
}
const page = await context.newPage();
await signIn(page, { email: "founder@knijka.ai", password: "Knijka2026!" }, BASE);
await page.goto(`${BASE}/simulator?scenario=${SCENARIO}&level=1`, { waitUntil: "domcontentloaded", timeout: 300_000 });
await page.waitForTimeout(9000);

const drain = async () => {
  for (let k = 0; k < 12; k++) {
    const hit = await page.evaluate(() => {
      const sel = '[data-sim-overlay="teach"], [role="dialog"][aria-modal="true"]';
      const up = [...document.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); return r.width > 1 && r.height > 1; });
      if (!up) return false;
      const b = [...up.querySelectorAll("button")].find((x) => /Разбрах|Продължи|Започни|Готово|ОК/i.test(x.textContent || ""));
      if (b) { b.click(); return true; }
      return false;
    }).catch(() => false);
    if (!hit) break;
    await page.waitForTimeout(400);
  }
};
await drain();

/* ── 1. WHAT IS ON THE GLASS, EXHAUSTIVELY ────────────────────────────────── */
const census = async (tag) => {
  const c = await page.evaluate(() => {
    const out = { hud: [], numericAttrs: [], canvases: [] };
    for (const el of document.querySelectorAll("[data-hud]")) {
      const r = el.getBoundingClientRect();
      out.hud.push({ hud: el.getAttribute("data-hud"), box: [Math.round(r.width), Math.round(r.height)] });
    }
    for (const el of document.querySelectorAll("*")) {
      for (const a of el.attributes) {
        if (!/^(data-|aria-)/.test(a.name)) continue;
        if (!/-?\d/.test(a.value)) continue;
        if (/^(data-testid|data-reactroot|aria-level|aria-posinset|aria-setsize|data-nextjs|data-precedence)/.test(a.name)) continue;
        out.numericAttrs.push(`${el.tagName.toLowerCase()}[${a.name}="${a.value.slice(0, 70)}"]`);
      }
    }
    for (const cv of document.querySelectorAll("canvas")) {
      const r = cv.getBoundingClientRect();
      let ctxKind = "unknown";
      try { ctxKind = cv.getContext("2d") ? "2d-readable" : "not-2d"; } catch (e) { ctxKind = "throws"; }
      out.canvases.push({ box: [Math.round(r.width), Math.round(r.height)], ctxKind, parentHud: cv.closest("[data-hud]")?.getAttribute("data-hud") ?? null });
    }
    out.numericAttrs = [...new Set(out.numericAttrs)];
    out.globals = Object.keys(window).filter((k) => /^__|drive|rig|knijka/i.test(k));
    out.camProbe = window.__camProbe ? { ...window.__camProbe } : null;
    return out;
  });
  note(`\n── CENSUS ${tag} ───────────────────────────────────────────`);
  note(`  data-hud on glass: ${c.hud.map((h) => `${h.hud}[${h.box.join("x")}]`).join(" ")}`);
  note(`  canvases: ${JSON.stringify(c.canvases)}`);
  note(`  page globals: ${JSON.stringify(c.globals)}`);
  note(`  __camProbe: ${c.camProbe ? JSON.stringify(c.camProbe) : "ABSENT"}`);
  note(`  numeric data-/aria- attributes (${c.numericAttrs.length}):`);
  for (const a of c.numericAttrs.slice(0, 40)) note(`     ${a}`);
  return c;
};
const before = await census("at rest");

/* ── 2. THE RIBBON, PHOTOGRAPHED, DECODED IN NODE ─────────────────────────── */
// --accent-2 #17e1c4 is what RouteGuidance paints the ghost ribbon, the turn
// chevron and the objective marker with. Decoding with sharp keeps the pixels
// out of the page entirely: no base64 round trip, no createImageBitmap.
const vp = page.viewportSize();
const BAND = { x: 0, y: Math.round(vp.height * 0.40), width: vp.width, height: Math.round(vp.height * 0.32) };
const ribbonScan = async (tag, keep = null) => {
  const t = Date.now();
  const png = await page.screenshot({ clip: BAND });
  const shotMs = Date.now() - t;
  const t2 = Date.now();
  const { data, width: W, height: H, channels: C } = decodePng(png);
  let n = 0, sx = 0;
  const rowN = new Array(H).fill(0);
  const rowSx = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * C;
      const R = data[i], G = data[i + 1], B = data[i + 2];
      if (G > 110 && G - R > 55 && B - R > 25 && G >= B) { n++; sx += x; rowN[y]++; rowSx[y] += x; }
    }
  }
  const decodeMs = Date.now() - t2;
  // near = bottom third of the band (closest road), far = top third
  const seg = (a, b) => {
    let nn = 0, ss = 0;
    for (let y = a; y < b; y++) { nn += rowN[y]; ss += rowSx[y]; }
    return nn ? ss / nn - W / 2 : null;
  };
  const near = seg(Math.floor(H * 0.66), H);
  const far = seg(0, Math.floor(H * 0.34));
  note(`  RIBBON ${tag}: ${n} cyan px of ${W}x${H} · centroid off-centre ${n ? (sx / n - W / 2).toFixed(1) : "-"} px ` +
    `· near ${near === null ? "-" : near.toFixed(1)} far ${far === null ? "-" : far.toFixed(1)} · shot ${shotMs}ms decode ${decodeMs}ms`);
  if (keep) { try { writeFileSync(keep, png); } catch (e) { /* best effort */ } }
  return { n, off: n ? sx / n - W / 2 : null, near, far, W, H, shotMs, decodeMs };
};
await ribbonScan("at rest", `${OUT}/band-rest.png`);

/* ── 3. THE MINIMAP — IS IT LIVE DURING THE DRIVE, AND IS IT READABLE? ────── */
await page.keyboard.press("KeyP").catch(() => {});
await page.waitForTimeout(1200);
const mapProbe = async (tag) => {
  const t = Date.now();
  const r = await page.evaluate(() => {
    const col = document.querySelector('[data-hud="minimap-column"]');
    if (!col) return { present: false };
    const rc = col.getBoundingClientRect();
    const cv = col.querySelector("canvas");
    if (!cv) return { present: true, colBox: [Math.round(rc.width), Math.round(rc.height)], canvas: false };
    let read = null;
    try {
      const cx = cv.getContext("2d");
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let nonBlank = 0;
      for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 8) nonBlank++;
      read = { ok: true, nonBlank, of: d.length / 4 };
    } catch (e) { read = { ok: false, why: String(e).slice(0, 80) }; }
    return { present: true, colBox: [Math.round(rc.width), Math.round(rc.height)], canvas: true, w: cv.width, h: cv.height, read };
  });
  note(`  MINIMAP ${tag}: ${JSON.stringify(r)} · ${Date.now() - t}ms`);
  return r;
};
await mapProbe("at rest, after KeyP");

/* ── 4. THE COST OF A CAMPROBE READ, WHICH IS THE CHEAP ALTERNATIVE ───────── */
const camRead = async () => {
  const t = Date.now();
  const v = await page.evaluate(() => {
    const p = window.__camProbe;
    return p ? { x: p.chassisX, y: p.chassisY, z: p.chassisZ, lx: p.localX, lz: p.localZ, cx: p.camX, cz: p.camZ, kmh: p.speedKmh } : null;
  });
  return { v, ms: Date.now() - t };
};
const c0 = await camRead();
note(`  CAMPROBE read: ${JSON.stringify(c0.v)} · ${c0.ms}ms`);

/* ── 5. NOW DRIVE, AND ASK THE SAME QUESTIONS OF A MOVING CAR ─────────────── */
note(`\n── driving forward ───────────────────────────────────────`);
await page.keyboard.down("KeyW");
const samples = [];
for (let i = 0; i < 8; i++) {
  await page.waitForTimeout(1500);
  await drain();
  const kmh = await page.evaluate(() => {
    const sp = document.querySelector('[aria-label^="Скорост "]');
    return sp ? Number((sp.getAttribute("aria-label").match(/Скорост (\d+)/) || [0, -1])[1]) : -1;
  });
  const rb = await ribbonScan(`t${i}@${kmh}km/h`, i === 3 ? `${OUT}/band-moving.png` : null);
  const cp = await camRead();
  samples.push({ i, kmh, ...rb, cam: cp.v, camMs: cp.ms });
}
await page.keyboard.up("KeyW");
await mapProbe("moving");
const during = await census("moving");

writeFileSync(`${OUT}/_survey.json`, JSON.stringify({ scenario: SCENARIO, platform: PLATFORM, band: BAND, before, during, samples }, null, 2));
writeFileSync(`${OUT}/_survey.log`, `${log.join("\n")}\n`);
await page.screenshot({ path: `${OUT}/survey-view.png` }).catch(() => {});
note(`\nwrote ${OUT}/_survey.json`);
await browser.close();
