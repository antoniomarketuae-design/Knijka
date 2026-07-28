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
//   public/icons/apple-touch-icon.png      180×180, full bleed (iOS masks it itself)
//   public/icons/apple-touch-icon-152.png  iPad / iPad mini
//   public/icons/apple-touch-icon-167.png  iPad Pro
//   public/icons/splash/splash-<w>x<h>.png  iOS launch images (see SPLASH below)
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
const splashDir = path.join(iconsDir, "splash");
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
// iOS LAUNCH IMAGES ("splash screens").
//
// WHY THEY EXIST. Android paints the manifest's `background_color` + icon while
// an installed PWA boots. iOS does not: without an `apple-touch-startup-image`
// matching the device EXACTLY, Safari shows a blank white rectangle for the
// second or two the app takes to start — a white flash on the way into a
// product whose entire identity is a near-black instrument cluster.
//
// WHY THE TABLE IS EXPLICIT. iOS matches these by media query on the device's
// CSS dimensions AND its pixel ratio; a near-miss is not used at all, it is
// ignored. There is no "one big image" fallback, so the only way to have a
// launch image is to enumerate the devices. `device-width`/`device-height` do
// NOT swap when the phone is rotated — orientation is carried by the
// `orientation` term alone — which is why each entry produces two files from
// one pair of numbers.
//
// WHAT IS NOT HERE: iPads (the audience is 17–18-year-olds on phones), and
// anything older than the iPhone SE 2 / iPhone 8. Those devices simply get
// iOS's default blank launch, which is the honest trade for not shipping 40
// images to cover a handful of students.
// ---------------------------------------------------------------------------

/** [cssWidth, cssHeight, dpr, what it is] — portrait orientation, CSS pixels. */
const IOS_DEVICES = [
  [375, 667, 2, "iPhone SE (2nd/3rd gen), 8, 7, 6s"],
  [375, 812, 3, "iPhone X, XS, 11 Pro, 12 mini, 13 mini"],
  [390, 844, 3, "iPhone 12, 12 Pro, 13, 13 Pro, 14"],
  [393, 852, 3, "iPhone 14 Pro, 15, 15 Pro, 16"],
  [402, 874, 3, "iPhone 16 Pro"],
  [414, 896, 2, "iPhone XR, 11"],
  [428, 926, 3, "iPhone 12 Pro Max, 13 Pro Max, 14 Plus"],
  [430, 932, 3, "iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus"],
  [440, 956, 3, "iPhone 16 Pro Max"],
];

/**
 * The launch plate: cluster ground (#05070c, globals.css §CLUSTER) with the
 * same cool glow the app's `.haze` lays down, the mark, and the wordmark.
 * Sized off the SHORT edge so the portrait and landscape plates of one device
 * are visually identical rather than one being a stretched version of the other.
 */
function splashSvg(w, h) {
  const min = Math.min(w, h);
  const mark = Math.round(min * 0.2);
  const markX = Math.round((w - mark) / 2);
  const markY = Math.round(h / 2 - mark * 0.85);
  const fs = Math.round(min * 0.062);
  const textY = markY + mark + Math.round(fs * 1.5);
  const scale = mark / 512;

  // Explicit width/height, not just a viewBox: librsvg rasterises an SVG with
  // no intrinsic size at its own default, and sharp would then UPSCALE that
  // raster to the phone's resolution — a blurred launch screen that looks like
  // a broken asset. With both set, the render is native-resolution and the
  // `resize` below is a no-op assertion.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${DEFS}
  <!-- FLAT GROUND, NO HAZE — and that is a decision, not a shortcut.
       The app's haze is a wide radial gradient, and a wide gradient across a
       1320x2868 plate cannot survive an 8-bit palette: it dithers into visible
       concentric rings on exactly the kind of dark OLED phone this audience
       owns. Truecolour fixes the rings and costs ~250 KB per plate, i.e.
       ~4.5 MB for a picture that is on screen for under a second. Flat #05070c
       is the cluster ground (globals.css section CLUSTER) and the manifest's
       own background_color, so the launch plate and the first painted frame
       are the same colour — which is the only thing a launch image has to get
       right. -->
  <rect width="${w}" height="${h}" fill="#05070c" />
  <g transform="translate(${markX} ${markY}) scale(${scale})">
    <rect width="512" height="512" rx="116" fill="url(#bg)" />
    <rect width="512" height="512" rx="116" fill="url(#sheen)" />
${GLYPH}
  </g>
  <text x="${Math.round(w / 2)}" y="${textY}" text-anchor="middle"
    font-family="'Segoe UI', 'Helvetica Neue', Arial, sans-serif"
    font-size="${fs}" font-weight="800" fill="#e8eef8"
    >Книжка<tspan fill="#48a9ff">.AI</tspan></text>
</svg>`;
}

/** The `media` attribute iOS matches a launch image against. */
function splashMedia(cssW, cssH, dpr, orientation) {
  return (
    `(device-width: ${cssW}px) and (device-height: ${cssH}px) ` +
    `and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: ${orientation})`
  );
}

/** Every launch image the manifest/layout declares: file name + media query. */
function splashPlates() {
  return IOS_DEVICES.flatMap(([cssW, cssH, dpr, device]) => {
    const pw = cssW * dpr;
    const ph = cssH * dpr;
    return [
      {
        file: `splash-${pw}x${ph}.png`,
        width: pw,
        height: ph,
        media: splashMedia(cssW, cssH, dpr, "portrait"),
        device,
      },
      {
        file: `splash-${ph}x${pw}.png`,
        width: ph,
        height: pw,
        media: splashMedia(cssW, cssH, dpr, "landscape"),
        device,
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------

function renderPng(svg, size) {
  // density scales librsvg's rasterization so we never upscale a bitmap.
  const density = (72 * size) / 512;
  return sharp(Buffer.from(svg), { density }).resize(size, size).png().toBuffer();
}

/**
 * Rectangular render, for the launch plates. `palette: true` is the whole
 * reason 18 full-resolution phone screens weigh well under a megabyte: the
 * plate is a flat ground, one gradient and two glyph colours, so an 8-bit
 * palette is lossless in practice and roughly a tenth of the truecolour size.
 */
function renderPlate(svg, width, height) {
  return sharp(Buffer.from(svg), { density: 72 })
    .resize(width, height)
    .png({ palette: true, compressionLevel: 9, effort: 10 })
    .toBuffer();
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
    // 180 is the one iOS actually asks a phone for; 152 (iPad, iPad mini) and
    // 167 (iPad Pro) exist so a tablet does not upscale the phone icon.
    ["apple-touch-icon.png", fullBleedSvg, 180],
    ["apple-touch-icon-152.png", fullBleedSvg, 152],
    ["apple-touch-icon-167.png", fullBleedSvg, 167],
  ];
  for (const [name, svg, size] of jobs) {
    let pipeline = renderPng(svg, size);
    if (name.startsWith("apple-touch-icon")) {
      // iOS dislikes alpha in touch icons — flatten onto the brand blue.
      pipeline = sharp(await pipeline).flatten({ background: "#2384e8" }).png().toBuffer();
    }
    await writeFile(path.join(iconsDir, name), await pipeline);
    console.log("icons/" + name);
  }

  // --- iOS launch images + the module the layout declares them from --------
  const plates = splashPlates();
  await mkdir(splashDir, { recursive: true });
  let splashBytes = 0;
  for (const plate of plates) {
    const buf = await renderPlate(splashSvg(plate.width, plate.height), plate.width, plate.height);
    await writeFile(path.join(splashDir, plate.file), buf);
    splashBytes += buf.length;
  }
  console.log(
    `icons/splash/ — ${plates.length} launch images, ${(splashBytes / 1024).toFixed(0)} KB total`,
  );

  await writeFile(
    path.join(root, "src", "lib", "pwa", "iosSplash.generated.ts"),
    `// GENERATED by scripts/generate-icons.mjs — do not edit by hand.
//
// iOS launch images. The device table and the reasoning live in the generator;
// this file exists so app/layout.tsx declares exactly the plates that were
// actually rendered, and so pwa.test.ts can prove the two never drift.

export interface IosSplashPlate {
  /** Public URL of the rendered plate. */
  url: string;
  /** The media query iOS matches the device against — an exact match or nothing. */
  media: string;
  /** Rendered size in device pixels. */
  width: number;
  height: number;
  /** Which phones this plate is for (documentation only). */
  device: string;
}

export const IOS_SPLASH_PLATES: readonly IosSplashPlate[] = ${JSON.stringify(
      plates.map((p) => ({
        url: `/icons/splash/${p.file}`,
        media: p.media,
        width: p.width,
        height: p.height,
        device: p.device,
      })),
      null,
      2,
    )} as const;
`,
  );
  console.log("src/lib/pwa/iosSplash.generated.ts");

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
