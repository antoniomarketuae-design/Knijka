// srt-diff.mjs — measure how much two frames differ inside a region, and write
// an amplified difference image.
//
//   node srt-diff.mjs <a.png> <b.png> <out.png> <x> <y> <w> <h> [gain]
//
// „The headlights change something" is an impression until it is a number. This
// prints mean/max luminance delta over the region and the share of pixels that
// moved more than 8/255, and saves the diff ×gain so the shape of the change is
// visible (a beam pool has a shape; a global exposure shift does not).

import { chromium } from "./pw.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [aPath, bPath, outPath, xs, ys, ws, hs, gs] = process.argv.slice(2);
if (!aPath || !bPath || !outPath) {
  console.error("usage: node srt-diff.mjs <a.png> <b.png> <out.png> <x> <y> <w> <h> [gain]");
  process.exit(64);
}
const x = Number(xs ?? 0),
  y = Number(ys ?? 0),
  w = Number(ws ?? 640),
  h = Number(hs ?? 360),
  gain = Number(gs ?? 6);

const a64 = readFileSync(resolve(aPath)).toString("base64");
const b64 = readFileSync(resolve(bPath)).toString("base64");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.setContent(`<body style="margin:0"><canvas id="c" width="${w}" height="${h}"></canvas></body>`);
const stats = await page.evaluate(
  async ({ a64, b64, x, y, w, h, gain }) => {
    const load = async (b64) => {
      const img = new Image();
      img.src = "data:image/png;base64," + b64;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const g = c.getContext("2d", { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      return g.getImageData(x, y, w, h).data;
    };
    const A = await load(a64);
    const B = await load(b64);
    const out = document.getElementById("c").getContext("2d");
    const im = out.createImageData(w, h);
    const lum = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    let sum = 0,
      max = 0,
      moved = 0;
    const n = w * h;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      const d = lum(B, j) - lum(A, j);
      const ad = Math.abs(d);
      sum += ad;
      if (ad > max) max = ad;
      if (ad > 8) moved++;
      // brighter-in-B = warm, darker-in-B = cool, so the direction is readable
      const v = Math.min(255, ad * gain);
      im.data[j] = d > 0 ? v : 0;
      im.data[j + 1] = v * 0.6;
      im.data[j + 2] = d < 0 ? v : 0;
      im.data[j + 3] = 255;
    }
    out.putImageData(im, 0, 0);
    return { meanAbs: sum / n, max, movedPct: (100 * moved) / n };
  },
  { a64, b64, x, y, w, h, gain },
);
writeFileSync(resolve(outPath), await page.locator("#c").screenshot());
await browser.close();
console.log(
  `[diff] region ${x},${y} ${w}x${h}  meanΔluma=${stats.meanAbs.toFixed(2)}/255  max=${stats.max.toFixed(
    0,
  )}  pixels moved >8: ${stats.movedPct.toFixed(1)}%  → ${outPath}`,
);
