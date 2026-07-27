/**
 * Photograph the REAL cockpit instrument cluster at a chosen speed.
 *
 * WHY. /dev/ghost-demo drives a GHOST car; the player's own vehicle is parked,
 * so every frame of this cluster ever captured read „0 км/ч". The speed readout
 * — the one element the founder said he could not read — had therefore never
 * been seen at two or three digits, which are the widths that can actually run
 * into the „км/ч" caption, the divider and the gear letter.
 *
 * `?clusterSpeed=` / `?clusterGear=` (modules/sim/cockpit/clusterDevSeed.ts,
 * null in production builds) seed the cluster's per-frame display inputs, and
 * nothing else — no vehicle, no rule engine, no trace. This script drives that
 * flag and writes one frame per (speed × viewport).
 *
 *   node tools/clips/headless/cluster-seed-shot.mjs [outDir]
 *
 * Requires the shared dev server on :3000 (do not start a second one — the
 * /dev/clip-* routes take 40+ minutes to compile on the founder's box).
 * Non-obvious bits, all of them load-bearing:
 *   - Playwright + browsers live on E:; import chromium from ./pw.mjs.
 *   - SwiftShader is a CPU rasteriser, so sim.quality must be "low".
 *   - canvas.toDataURL() comes back BLANK (no preserveDrawingBuffer).
 *   - page.screenshot() hangs on "waiting for fonts to load..." here; the frame
 *     is grabbed over CDP Page.captureScreenshot instead.
 *   - both 1100×900 and 1440×900: a fix at one width is not a fix.
 */

import { chromium } from "file:///E:/AI%20driver/tools/clips/headless/pw.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const OUTDIR = process.argv[2] ?? "E:/AI driver/tools/clips/headless/r0";
mkdirSync(OUTDIR, { recursive: true });

/** 0 is the control (it is what every previous capture showed); 58 and 132 are
 *  the two- and three-digit cases the layout is actually judged on. */
const SPEEDS = [
  ["0", "D"],
  ["58", "D"],
  ["132", "D"],
];
const VIEWPORTS = [
  [1100, 900],
  [1440, 900],
];

const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--ignore-gpu-blocklist",
  ],
});

for (const [speed, gear] of SPEEDS) {
  for (const [W, H] of VIEWPORTS) {
    const out = `${OUTDIR}/seed${speed}_${W}x${H}.png`;
    const url =
      `http://localhost:3000/dev/ghost-demo?ghost=demo` +
      `&clusterSpeed=${speed}&clusterGear=${gear}`;
    console.log(`\n=== ${speed} км/ч · ${W}×${H}`);

    const ctx = await browser.newContext({
      viewport: { width: W, height: H },
      deviceScaleFactor: 1,
      colorScheme: "dark",
    });
    await ctx.addInitScript(() => {
      try {
        window.localStorage.setItem("sim.quality", "low");
      } catch {}
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 300_000 });
    // NB: the options bag is the THIRD argument — passing it second makes it the
    // page-function's argument and silently leaves the 30 s default in place.
    await page.waitForFunction(
      () => {
        const c = document.querySelector("canvas");
        return !!c && c.width > 100;
      },
      undefined,
      { timeout: 300_000 },
    );
    await page.waitForTimeout(9000);

    for (const label of ["Разбрах", "Клавиши"]) {
      try {
        const el = page.getByText(label, { exact: false }).first();
        if (await el.isVisible({ timeout: 2500 })) {
          await el.click({ timeout: 4000 });
          console.log("  dismissed:", label);
          await page.waitForTimeout(1000);
        }
      } catch {
        console.log("  (no control:", label + ")");
      }
    }

    // The „ДЕМОНСТРАЦИЯ" transport bar sits directly over the instrument.
    const hidden = await page.evaluate(() => {
      let n = 0;
      for (const el of document.querySelectorAll("div,section,aside")) {
        const t = el.textContent || "";
        if (
          /ДЕМОНСТРАЦИЯ\s*—|0:\d\d\s*\/\s*0:\d\d/.test(t) &&
          el.clientHeight < 260 &&
          el.clientHeight > 40
        ) {
          el.style.visibility = "hidden";
          n++;
        }
      }
      return n;
    });
    console.log("  hid", hidden, "overlay node(s); url:", page.url());
    await page.waitForTimeout(2500);

    const cdp = await ctx.newCDPSession(page);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const buf = Buffer.from(data, "base64");
    writeFileSync(out, buf);
    console.log("  wrote", out, buf.length, "bytes");
    await ctx.close();
  }
}

await browser.close();
console.log(
  "\nJudge them: ffmpeg -i seedNNN_1100x900.png " +
    '-vf "crop=280:120:325:560,scale=iw*4:ih*4:flags=neighbor" zoom.png',
);
