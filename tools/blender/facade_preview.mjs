#!/usr/bin/env node
/**
 * Contact sheet for the procedurally-authored facade sets (facade_gen.mjs).
 * Composites, per set, the color map (2x2-tiled to prove seamlessness) beside
 * its normal / orm / emissive, plus a tall "applied to a tower" mock of each
 * bay system — so quality can be judged from ONE read without the browser.
 *
 *   node tools/blender/facade_preview.mjs  ->  tools/blender/previews/facade_v2.png
 */
import { mkdirSync } from "node:fs";
import { join as joinPath } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const sharp = requireFromPlatform("sharp");
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const bakeDir = joinPath(repoRoot, "tools", "blender", "work", "facade_bakes");
const outDir = joinPath(repoRoot, "tools", "blender", "previews");
mkdirSync(outDir, { recursive: true });

const CELL = 200; // px per map thumbnail
const PAD = 12;
const LABEL_H = 22;
const BAYS = ["bay_grid", "bay_strip", "bay_curtain", "bay_band"];
const SETS = [...BAYS, "trim"];
const MAPS = ["color", "normal", "orm", "emissive"];

async function tile2x2(file, size) {
  const half = Math.round(size / 2);
  const t = await sharp(file).resize(half, half).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: t, top: 0, left: 0 },
      { input: t, top: 0, left: half },
      { input: t, top: half, left: 0 },
      { input: t, top: half, left: half },
    ])
    .png()
    .toBuffer();
}

async function towerMock(system, w, h) {
  // vertical tiling of the color map onto a tall strip + a soft top-down shade
  const tileW = w;
  const tileH = Math.round(w * 0.95);
  const nY = Math.ceil(h / tileH);
  const tile = await sharp(joinPath(bakeDir, system, "color.png")).resize(tileW, tileH).toBuffer();
  const comps = [];
  for (let y = 0; y < nY; y++) comps.push({ input: tile, top: y * tileH, left: 0 });
  const base = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(comps)
    .png()
    .toBuffer();
  // vertical sky-shade gradient (lighter at top) via an SVG overlay
  const grad = Buffer.from(
    `<svg width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0" stop-color="#ffd9a0" stop-opacity="0.28"/>` +
      `<stop offset="0.5" stop-color="#ffffff" stop-opacity="0.04"/>` +
      `<stop offset="1" stop-color="#102030" stop-opacity="0.30"/></linearGradient></defs>` +
      `<rect width="${w}" height="${h}" fill="url(#g)"/></svg>`,
  );
  return sharp(base).composite([{ input: grad, blend: "over" }]).png().toBuffer();
}

function label(text, w, h = LABEL_H) {
  const svg = `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="#1b1b1f"/>` +
    `<text x="6" y="${h - 7}" font-family="monospace" font-size="14" fill="#e8e8ea">${text}</text></svg>`;
  return Buffer.from(svg);
}

async function main() {
  const rows = [];
  // one row per set: [color2x2] [normal] [orm] [emissive]
  const rowW = PAD + (CELL + PAD) * (MAPS.length + 1); // +1 for the label col width baked into layout
  const gridW = PAD + (CELL + PAD) * MAPS.length + 160;
  for (const set of SETS) {
    const comps = [];
    // set label
    comps.push({ input: label(set, 150, CELL), top: 0, left: 0 });
    for (let mi = 0; mi < MAPS.length; mi++) {
      const map = MAPS[mi];
      const file = joinPath(bakeDir, set, `${map}.png`);
      let thumb;
      if (map === "color") thumb = await tile2x2(file, CELL);
      else thumb = await sharp(file).resize(CELL, CELL).png().toBuffer();
      const left = 160 + mi * (CELL + PAD);
      comps.push({ input: thumb, top: 0, left });
      comps.push({ input: label(`${map}${map === "color" ? " (2x2 tiled)" : ""}`, CELL, LABEL_H), top: CELL - LABEL_H, left });
    }
    const row = await sharp({ create: { width: gridW, height: CELL, channels: 3, background: { r: 20, g: 20, b: 24 } } })
      .composite(comps)
      .png()
      .toBuffer();
    rows.push(row);
  }

  // tower mocks row
  const TW = 150;
  const TH = CELL * 2;
  const towerComps = [];
  towerComps.push({ input: label("towers (system tiled)", 150, TH), top: 0, left: 0 });
  for (let i = 0; i < BAYS.length; i++) {
    const m = await towerMock(BAYS[i], TW, TH);
    const left = 160 + i * (TW + PAD);
    towerComps.push({ input: m, top: 0, left });
    towerComps.push({ input: label(BAYS[i].replace("bay_", ""), TW, LABEL_H), top: TH - LABEL_H, left });
  }
  const towerRow = await sharp({ create: { width: gridW, height: TH, channels: 3, background: { r: 20, g: 20, b: 24 } } })
    .composite(towerComps)
    .png()
    .toBuffer();

  // stack all rows
  const allRows = [...rows, towerRow];
  const meta = await Promise.all(allRows.map((r) => sharp(r).metadata()));
  const totalH = meta.reduce((a, m) => a + m.height + PAD, PAD);
  const totalW = gridW;
  const stackComps = [];
  let top = PAD;
  for (let i = 0; i < allRows.length; i++) {
    stackComps.push({ input: allRows[i], top, left: 0 });
    top += meta[i].height + PAD;
  }
  await sharp({ create: { width: totalW, height: totalH, channels: 3, background: { r: 12, g: 12, b: 14 } } })
    .composite(stackComps)
    .png()
    .toFile(joinPath(outDir, "facade_v2.png"));
  console.log(`facade_v2.png written (${totalW}x${totalH})`);
  void rowW;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
