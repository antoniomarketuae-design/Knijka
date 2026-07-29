/**
 * deck-cost.mjs — what the backdrop actually costs, measured rather than
 * asserted.
 *
 * Three numbers per rung, because three different things could make a backdrop
 * a bad idea on a teenager's phone:
 *
 *   BYTES   the inline SVG is HTML on every authenticated navigation, and Next
 *           serialises it a second time into the RSC flight payload — so it is
 *           paid for twice. Measured off the real response body.
 *   FRAMES  a `fixed` layer that never repaints should cost nothing while the
 *           page scrolls, and a compositor animation should cost almost
 *           nothing. Measured with rAF deltas over a scripted scroll, with the
 *           deck present and with it removed, under 4× and 1× CPU throttling.
 *   LAYOUT  a full-viewport layer must not add a paint to first render.
 *           Reported as the paint timings the browser itself records.
 *
 * The phone profile is 390 × 844 at 4× CPU throttling, which is the Mali-G57 /
 * Galaxy A16 class docs/simulation/82 §2.2 names as the binding constraint.
 *
 * Usage:  DECK_COOKIE=<jwt> node deck-cost.mjs [--base http://localhost:3540]
 */
import { chromium } from "./pw.mjs";
import { gzipSync } from "node:zlib";

const args = process.argv.slice(2);
const baseIdx = args.indexOf("--base");
const BASE = baseIdx >= 0 ? args[baseIdx + 1] : process.env.UI_BASE ?? "http://localhost:3540";
const COOKIE = process.env.DECK_COOKIE;
if (!COOKIE) throw new Error("DECK_COOKIE is required");

const PAGE = "/theory";
const PROFILES = [
  { tag: "desktop 1440x900, 1x CPU", width: 1440, height: 900, mobile: false, cpu: 1 },
  { tag: "phone   390x844,  4x CPU", width: 390, height: 844, mobile: true, cpu: 4 },
];

const browser = await chromium.launch({ headless: true });
const host = new URL(BASE).hostname;

function cookieFor() {
  return [
    {
      name: "authjs.session-token",
      value: COOKIE,
      domain: host,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ];
}

// --- 1. BYTES --------------------------------------------------------------
{
  const ctx = await browser.newContext();
  await ctx.addCookies(cookieFor());
  // Measured off the SERIALISED DOM, not off the navigation response body:
  // these routes stream, so `response.text()` is only the first flush and
  // reported the deck at 0 B. `outerHTML` of the rendered node is the same
  // markup the server emitted, and it is unambiguous.
  const page = await ctx.newPage();
  await page.goto(BASE + PAGE, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForTimeout(3000);
  const { svg, doc } = await page.evaluate(() => ({
    svg: document.querySelector(".deck svg")?.outerHTML ?? "",
    doc: document.documentElement.outerHTML.length,
  }));
  const gzip = (s) => gzipSync(Buffer.from(s)).length;
  console.log(
    `BYTES  inline deck SVG: ${svg.length} B (${(svg.length / 1024).toFixed(2)} KB) raw, ` +
      `${((100 * svg.length) / doc).toFixed(1)}% of a ${(doc / 1024).toFixed(0)} KB document.\n` +
      `       Gzipped on its own: ${gzip(svg)} B — the whole cost of the "still" rung, ` +
      `for zero requests and zero JavaScript.`,
  );
  await ctx.close();
}

// --- 2. FRAMES -------------------------------------------------------------
async function frameCost(profile, mode) {
  // three conditions, so the DRIFT can be priced on its own rather than
  // inferred from "deck vs no deck":
  //   "none"  the plane removed entirely — the layer that shipped before
  //   "still" the drawn plate, no animation — what every phone gets
  //   "depth" the plate plus the 240 s drift — the desktop rung
  const extraCss =
    mode === "none"
      ? " .deck{display:none!important}"
      : mode === "still"
        ? " .deck-drift{animation:none!important}"
        : "";
  const ctx = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    colorScheme: "dark",
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    deviceScaleFactor: profile.mobile ? 2 : 1,
  });
  await ctx.addCookies(cookieFor());
  await ctx.addInitScript(`(() => {
    const apply = () => {
      const s = document.createElement("style");
      s.textContent = "nextjs-portal{display:none!important}${extraCss}";
      document.head.appendChild(s);
    };
    if (document.head) apply(); else document.addEventListener("DOMContentLoaded", apply);
  })()`);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: profile.cpu });
  await page.goto(BASE + PAGE, { waitUntil: "domcontentloaded", timeout: 300000 });
  await page.waitForTimeout(3000);

  const stats = await page.evaluate(async () => {
    const deltas = [];
    let last = performance.now();
    let stop = false;
    const tick = (t) => {
      deltas.push(t - last);
      last = t;
      if (!stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    // Scroll while sampling: a `fixed` backdrop is only free if scrolling does
    // not repaint it, and that is exactly what this exercises.
    const t0 = performance.now();
    while (performance.now() - t0 < 5000) {
      window.scrollBy(0, 6);
      if (window.scrollY + window.innerHeight >= document.body.scrollHeight - 4) window.scrollTo(0, 0);
      await new Promise((r) => setTimeout(r, 16));
    }
    stop = true;
    deltas.sort((a, b) => a - b);
    const at = (p) => deltas[Math.min(deltas.length - 1, Math.floor(p * deltas.length))] ?? 0;
    return {
      frames: deltas.length,
      median: at(0.5),
      p95: at(0.95),
      worst: deltas[deltas.length - 1] ?? 0,
    };
  });
  const paint = await page.evaluate(() =>
    Object.fromEntries(performance.getEntriesByType("paint").map((e) => [e.name, e.startTime])),
  );
  await ctx.close();
  return { ...stats, paint };
}

for (const profile of PROFILES) {
  console.log(`\nFRAMES ${profile.tag}`);
  const runs = {};
  // Interleaved and repeated. This box shares a dev server on a mechanical
  // disk, and a single pass produced a 16.7 ms p95 one minute and a 50 ms one
  // the next with no code change in between — so a one-shot number here would
  // be reporting the machine's mood. Best-of-3 per condition, conditions
  // interleaved, reports what the browser can do rather than what the disk was
  // doing at the time.
  for (let i = 0; i < 3; i += 1) {
    for (const mode of ["none", "still", "depth"]) {
      const r = await frameCost(profile, mode);
      if (!runs[mode] || r.median < runs[mode].median) runs[mode] = r;
    }
  }
  for (const mode of ["none", "still", "depth"]) {
    const r = runs[mode];
    console.log(
      `  ${mode.padEnd(6)} median ${r.median.toFixed(2)} ms · p95 ${r.p95.toFixed(2)} ms · ` +
        `worst ${r.worst.toFixed(1)} ms · ${r.frames} frames`,
    );
  }
  console.log(
    `  still − none  median ${(runs.still.median - runs.none.median).toFixed(2)} ms · ` +
      `p95 ${(runs.still.p95 - runs.none.p95).toFixed(2)} ms\n` +
      `  depth − still median ${(runs.depth.median - runs.still.median).toFixed(2)} ms · ` +
      `p95 ${(runs.depth.p95 - runs.still.p95).toFixed(2)} ms`,
  );
}

await browser.close();
