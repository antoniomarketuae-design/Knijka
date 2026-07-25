// One-shot back-conversion for clips rendered BEFORE the poster contract
// existed (audit 80, H-10): every `.k0..k4.png` still referenced by
// public/clips/manifest.json is re-encoded to `.k0..k4.webp` at the shared
// poster settings (webp.mjs) and the manifest's `keyframes` URLs are rewritten
// to point at the WebP.
//
// Idempotent: a clip whose keyframes already end in .webp is skipped, so it is
// safe to re-run after a partial render batch. The manifest is written ONCE,
// at the end, only if every conversion succeeded — a half-rewritten manifest
// would point students at files that do not exist.
//
// Usage (from tools/clips/headless):
//   node keyframes-to-webp.mjs             convert + rewrite the manifest
//   node keyframes-to-webp.mjs --dry-run   report the byte table, touch nothing
//   node keyframes-to-webp.mjs --prune     also delete the PNG masters
//
// The PNG masters are KEPT by default. They are gitignored and nothing
// references them once the manifest is rewritten, so they cost a student
// nothing — but re-deriving one means re-rendering its whole clip (minutes of
// GPU time each). --prune is for when the disk matters more than that.

import { existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { encodeKeyframeWebp, mb, resolveFfmpeg } from "./webp.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const CLIPS_DIR = join(REPO, "platform/public/clips");
const MANIFEST = join(CLIPS_DIR, "manifest.json");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const PRUNE = args.includes("--prune");

const FFMPEG = resolveFfmpeg();
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

/** "/clips/x__m0.k2.png" → the file beside the manifest. */
const fileFor = (url) => join(CLIPS_DIR, url.replace(/^\/clips\//, ""));

let pngBytes = 0;
let webpBytes = 0;
let converted = 0;
let skipped = 0;
const missing = [];
const pruneList = [];

for (const clip of manifest.clips) {
  const frames = clip.keyframes ?? [];
  if (frames.length === 0) continue;
  if (frames.every((u) => u.endsWith(".webp"))) {
    skipped++;
    continue;
  }
  const next = [];
  for (const url of frames) {
    if (url.endsWith(".webp")) {
      next.push(url);
      continue;
    }
    const src = fileFor(url);
    const outUrl = url.replace(/\.png$/, ".webp");
    const out = fileFor(outUrl);
    if (!existsSync(src)) {
      // The binaries live outside git (public/clips/README.md) — on a machine
      // that never received them there is nothing to convert. Point the
      // manifest at the .webp anyway so the URL contract is uniform; the
      // reader already hides a 404-ing still.
      missing.push(url);
      next.push(outUrl);
      continue;
    }
    const before = statSync(src).size;
    pngBytes += before;
    if (DRY_RUN) {
      next.push(outUrl);
      continue;
    }
    webpBytes += encodeKeyframeWebp(FFMPEG, src, out);
    pruneList.push(src);
    next.push(outUrl);
    converted++;
  }
  clip.keyframes = next;
}

if (DRY_RUN) {
  console.log(`dry run · ${pngBytes} B of PNG stills would be re-encoded`);
  console.log(`         ${missing.length} referenced stills are absent on this box`);
  process.exit(0);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

if (PRUNE) for (const f of pruneList) rmSync(f, { force: true });

console.log(`converted ${converted} stills across ${manifest.clips.length - skipped} clips`);
console.log(`  PNG  ${pngBytes} B (${mb(pngBytes)})`);
console.log(`  WebP ${webpBytes} B (${mb(webpBytes)})`);
if (pngBytes > 0) console.log(`  ratio ${(pngBytes / webpBytes).toFixed(1)}×`);
if (missing.length > 0) console.log(`  ${missing.length} stills absent on this box (URLs still rewritten)`);
if (PRUNE) console.log(`  pruned ${pruneList.length} PNG masters`);
