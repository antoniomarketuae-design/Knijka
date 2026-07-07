// Generates the full Книжка.AI icon + OG image set from a single SVG mark.
//
//   node scripts/generate-icons.mjs
//
// Outputs (all committed — the script only needs re-running when the mark changes):
//   public/icons/icon.svg            master mark (rounded square, scalable)
//   public/icons/icon-192.png        manifest icon, purpose "any"
//   public/icons/icon-512.png        manifest icon, purpose "any"
//   public/icons/maskable-192.png    manifest icon, purpose "maskable" (safe zone)
//   public/icons/maskable-512.png    manifest icon, purpose "maskable" (safe zone)
//   public/icons/apple-touch-icon.png  180×180, full bleed (iOS applies its own mask)
//   public/og.png                    1200×630 Open Graph card
//   src/app/favicon.ico              16/32/48 multi-size ICO (PNG-encoded entries)
//
// Design: bold geometric „К" on an electric-blue rounded square — tokens from
// src/app/globals.css (--accent family). The К is drawn as paths, not <text>,
// so rendering never depends on installed fonts.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = path.join(root, "public", "icons");
const publicDir = path.join(root, "public");
const appDir = path.join(root, "src", "app");

// ---------------------------------------------------------------------------
// The mark. 512×512 viewBox. Gradient of the accent blue, dark-navy К
// (matches the in-app logo: bg-accent square + accent-foreground glyph).
// ---------------------------------------------------------------------------

const GLYPH = `
  <g stroke="#06122a" stroke-width="58" stroke-linecap="round"
     stroke-linejoin="round" fill="none">
    <path d="M186 142 V 370" />
    <path d="M330 142 L 212 256 L 330 370" />
  </g>`;

const DEFS = `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5cb2ff" />
      <stop offset="1" stop-color="#2384e8" />
    </linearGradient>
    <radialGradient id="sheen" cx="0.32" cy="0.1" r="1">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.30" />
      <stop offset="0.55" stop-color="#ffffff" stop-opacity="0" />
    </radialGradient>
  </defs>`;

/** Rounded-square mark, transparent corners (purpose "any" + favicon). */
const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
${DEFS}
  <rect width="512" height="512" rx="116" fill="url(#bg)" />
  <rect width="512" height="512" rx="116" fill="url(#sheen)" />
${GLYPH}
</svg>`;

/**
 * Full-bleed variant: square background, glyph shrunk into the maskable safe
 * zone (inner 80% circle). Used for purpose "maskable" and apple-touch-icon,
 * where the OS applies its own corner mask.
 */
const fullBleedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
${DEFS}
  <rect width="512" height="512" fill="url(#bg)" />
  <rect width="512" height="512" fill="url(#sheen)" />
  <g transform="translate(256 256) scale(0.72) translate(-256 -256)">${GLYPH}</g>
</svg>`;

// ---------------------------------------------------------------------------
// OG card: 1200×630, dark navy, glow, mark + wordmark. Wordmark text uses the
// system font stack — verified visually after generation.
// ---------------------------------------------------------------------------

const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
${DEFS}
  <radialGradient id="glow" cx="0.5" cy="0.05" r="0.9">
    <stop offset="0" stop-color="#3fa1ff" stop-opacity="0.35" />
    <stop offset="1" stop-color="#3fa1ff" stop-opacity="0" />
  </radialGradient>
  <rect width="1200" height="630" fill="#0a101e" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- mark -->
  <g transform="translate(120 150) scale(0.3125)">
    <rect width="512" height="512" rx="116" fill="url(#bg)" />
    <rect width="512" height="512" rx="116" fill="url(#sheen)" />
${GLYPH}
  </g>

  <!-- wordmark + tagline -->
  <g font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif">
    <text x="310" y="262" font-size="92" font-weight="800" fill="#e6edf7"
      >Книжка<tspan fill="#3fa1ff">.AI</tspan></text>
    <text x="122" y="410" font-size="44" font-weight="700" fill="#e6edf7"
      >Вземи книжка. С AI учител до теб.</text>
    <text x="122" y="470" font-size="28" fill="#8fa3bf"
      >Адаптивна теория · Пробни изпити · AI учител, който цитира закона</text>
  </g>

  <!-- exam-format chip -->
  <g>
    <rect x="122" y="516" width="470" height="54" rx="27" fill="#111b2e"
      stroke="#24334d" />
    <text x="150" y="551" font-family="'Segoe UI', Arial, sans-serif"
      font-size="24" font-weight="700" fill="#7cc4ff"
      >45 въпроса · 97 точки · 40 минути</text>
  </g>
</svg>`;

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderPng(svg, size) {
  // density scales librsvg's rasterization so we never upscale a bitmap.
  const density = (72 * size) / 512;
  return sharp(Buffer.from(svg), { density }).resize(size, size).png().toBuffer();
}

/** Multi-size ICO with PNG-encoded entries (supported by all modern browsers). */
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(count, 4);

  const entries = [];
  let offset = 6 + 16 * count;
  for (const { size, buf } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // height
    e.writeUInt8(0, 2); // palette
    e.writeUInt8(0, 3); // reserved
    e.writeUInt16LE(1, 4); // color planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(buf.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += buf.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.buf)]);
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(iconsDir, { recursive: true });

  await writeFile(path.join(iconsDir, "icon.svg"), markSvg.trim() + "\n");

  const jobs = [
    ["icon-192.png", markSvg, 192],
    ["icon-512.png", markSvg, 512],
    ["maskable-192.png", fullBleedSvg, 192],
    ["maskable-512.png", fullBleedSvg, 512],
    ["apple-touch-icon.png", fullBleedSvg, 180],
  ];
  for (const [name, svg, size] of jobs) {
    let pipeline = renderPng(svg, size);
    if (name === "apple-touch-icon.png") {
      // iOS dislikes alpha in touch icons — flatten onto the brand blue.
      pipeline = sharp(await pipeline).flatten({ background: "#2384e8" }).png().toBuffer();
    }
    await writeFile(path.join(iconsDir, name), await pipeline);
    console.log("icons/" + name);
  }

  const favSizes = [16, 32, 48];
  const favPngs = [];
  for (const size of favSizes) {
    favPngs.push({ size, buf: await renderPng(markSvg, size) });
  }
  await writeFile(path.join(appDir, "favicon.ico"), buildIco(favPngs));
  console.log("src/app/favicon.ico (16/32/48)");

  const og = await sharp(Buffer.from(ogSvg), { density: 144 })
    .resize(1200, 630)
    .png()
    .toBuffer();
  await writeFile(path.join(publicDir, "og.png"), og);
  console.log("og.png (1200x630)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
