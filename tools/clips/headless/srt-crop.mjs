// srt-crop.mjs — zoom into a region of a captured PNG so a detail can be
// JUDGED rather than guessed (doc 66 R0: look at what you built).
//
//   node srt-crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
//
// Loads the PNG into a headless page, draws the crop into a canvas at `scale`
// with smoothing off, and screenshots that canvas. No image library needed.

import { chromium } from "./pw.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [inPath, outPath, xs, ys, ws, hs, ss] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error("usage: node srt-crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]");
  process.exit(64);
}
const x = Number(xs ?? 0);
const y = Number(ys ?? 0);
const w = Number(ws ?? 320);
const h = Number(hs ?? 180);
const scale = Number(ss ?? 3);

const b64 = readFileSync(resolve(inPath)).toString("base64");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: Math.round(w * scale), height: Math.round(h * scale) },
});
await page.setContent(
  `<body style="margin:0"><canvas id="c" width="${Math.round(w * scale)}" height="${Math.round(
    h * scale,
  )}"></canvas></body>`,
);
await page.evaluate(
  async ({ b64, x, y, w, h, scale }) => {
    const img = new Image();
    img.src = "data:image/png;base64," + b64;
    await img.decode();
    const c = document.getElementById("c");
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
  },
  { b64, x, y, w, h, scale },
);
writeFileSync(resolve(outPath), await page.locator("#c").screenshot());
await browser.close();
console.error(`[crop] ${outPath}  (${x},${y} ${w}x${h} @${scale}x)`);
