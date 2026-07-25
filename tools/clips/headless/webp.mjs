// THE POSTER-ENCODE CONTRACT — one place that decides what a keyframe still
// weighs, shared by the renderer (render-clip.mjs) and the back-converter
// (keyframes-to-webp.mjs) so a re-render can never disagree with a conversion.
//
// Why WebP at all (audit 80, H-10): the rig used to save the five R0 stills as
// full-res 1280×720 PNGs — ~1.15 MB each, 210 of them, 236 MiB on disk. The
// browser fetches a <video poster> EAGERLY even under preload="none", so every
// student who saw a wrong answer paid ~1.1 MB for an image the why-panel then
// draws into a box clamped to 140–240 px tall. That is a 36–74× overshoot on
// the single most-loaded student-facing asset in the product.
//
// Why 854 px: the poster box is at most 240 px tall, and a 2× DPR phone wants
// ~480 px of pixels — 854×480 covers it exactly, with the review gallery's
// keyframe strip (h-14) and the R0 contact sheets (380 px tiles) comfortably
// inside. Wider buys nothing anyone can see.
//
// Why q78: measured on the fault frame of sc-ac-crosswind__m1 — q72 12.1 KB,
// q78 14.8 KB, q85 22.2 KB. At q78 the ❌ fault marker and the lane lines stay
// crisp under vision inspection (doc 66 R0 is done on these very files), which
// is the constraint; below that the marker edges start to smear.
//
// No PNG/JPEG fallback is emitted on purpose: WebP is supported by every
// browser that can run this product at all (Safari 14+, 2020) — and a browser
// without WebP cannot render the R3F simulator these stills are frames of.

import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";

/** Long edge of a saved keyframe still, in CSS-independent pixels. */
export const POSTER_WIDTH = 854;

/** libwebp quality for the stills (see the header for the measurement). */
export const POSTER_QUALITY = 78;

/** Extension the manifest's `keyframes` URLs carry since the H-10 fix. */
export const POSTER_EXT = ".webp";

/** ffmpeg, from $FFMPEG → PATH → this box's winget build (rig convention). */
export function resolveFfmpeg() {
  if (process.env.FFMPEG && existsSync(process.env.FFMPEG)) return process.env.FFMPEG;
  if (spawnSync("ffmpeg", ["-version"]).status === 0) return "ffmpeg";
  const winget =
    "C:/Users/Ljh/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.0.1-full_build/bin/ffmpeg.exe";
  if (existsSync(winget)) return winget;
  throw new Error("ffmpeg not found (set $FFMPEG)");
}

/**
 * Encode one still (PNG in, WebP out) at the poster contract. Returns the
 * output size in bytes; throws on an ffmpeg failure so a caller that is
 * mid-manifest-write can abort before committing a URL to a file it never got.
 *
 * `min(POSTER_WIDTH,iw)` never upscales — a source already narrower than the
 * budget is re-encoded at its own width instead of being blown up.
 */
export function encodeKeyframeWebp(ffmpeg, srcPath, outPath) {
  const r = spawnSync(
    ffmpeg,
    [
      "-y",
      "-hide_banner",
      "-loglevel", "error",
      "-i", srcPath,
      "-vf", `scale='min(${POSTER_WIDTH},iw)':-2:flags=lanczos`,
      "-c:v", "libwebp",
      "-quality", String(POSTER_QUALITY),
      "-compression_level", "6",
      "-preset", "picture",
      "-frames:v", "1",
      outPath,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  if (r.status !== 0) throw new Error(`libwebp exit ${r.status} for ${srcPath}`);
  return statSync(outPath).size;
}

/** "1234567" → "1.2 MB" — the byte tables these scripts print. */
export function mb(bytes) {
  return `${(bytes / 1_000_000).toFixed(2)} MB`;
}
