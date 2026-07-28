/**
 * What ships out of platform/public, and how heavy it is allowed to be.
 * (Audit 2026-07-24, findings M-28 and M-29.)
 *
 * TWO PROBLEMS, ONE DECLARATION.
 *
 * M-28 — the deploy carries ~330 MB nobody ever requests. `deploy.sh` puts the
 * live tree on the target commit with `git reset --hard`, so EVERY tracked
 * byte under public/ lands on the VPS: the 210 keyframe PNGs that exist only
 * as the founder's R0 vision evidence (247 MB), the scene-stills consumed by
 * dev routes that 404 in production (57.7 MB), and the source PNGs the KTX2
 * encoder was fed (21.6 MB). None of them is reachable from a student session.
 *
 * M-29 — nothing stops it growing back. `next/image` is used zero times, the
 * generators write whatever they write, and the 1.1 MB posters that H-10 had
 * to undo got in exactly that way. A ceiling only works if something fails
 * when it is crossed, so `check-asset-budget.mjs` exits non-zero and runs in
 * the same vitest gate as everything else.
 *
 * THE RULE THAT MAKES THIS SURVIVE: every file under public/ must match a
 * bucket. An unclassified path is a FAILURE, not a default. That is what makes
 * the next `public/whatever/` dir a deliberate decision — someone has to state
 * whether it ships and what it may weigh.
 *
 * `ship: "dev"` does NOT mean "delete": these are working assets (encoder
 * sources, review evidence) that belong in the repo. It means the deploy
 * prunes them from the live tree — see prune-public.mjs.
 */

import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Buckets, matched IN ORDER — the first matching bucket wins, so narrow rules
 * come before the directory they live in.
 *
 *   match         (rel) => boolean, on a POSIX-style path relative to public/
 *   ship          "prod" = deployed · "dev" = pruned from the live tree
 *   maxBytes      ceiling for the bucket's total
 *   maxFileBytes  ceiling for any SINGLE file in it (optional)
 *   why           what it is and who reads it
 *
 * Ceilings sit ~15-30% above today's measured weight: enough headroom that
 * ordinary authoring does not trip them, tight enough that a category mistake
 * (a PNG where a WebP belongs) does.
 */
export const BUCKETS = [
  {
    id: "clips-video",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".webm"),
    ship: "prod",
    maxBytes: 140_000_000,
    // ~2.6 MB average today. A reel that lands at 10 MB is a render-settings
    // slip, not a longer clip.
    maxFileBytes: 8_000_000,
    why: "The mistake reels themselves — the product's biggest differentiator.",
  },
  {
    id: "clips-poster",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".webp"),
    ship: "prod",
    maxBytes: 8_000_000,
    // THE H-10 TRIPWIRE. The posters this replaced averaged 1,150.9 KB each
    // and were displayed in a box clamped to 140-240 px high — a 36-74x
    // overshoot that shipped because nothing measured it. 120 KB is roughly
    // 4x the current average: generous for a wider frame, impossible for a
    // full-size screenshot.
    maxFileBytes: 120_000,
    why: "Fault-keyframe posters (WebP q78 @854px) shown before a reel plays.",
  },
  {
    id: "clips-keyframes",
    match: (rel) => rel.startsWith("clips/") && rel.endsWith(".png"),
    ship: "dev",
    maxBytes: 300_000_000,
    why: "R0 vision evidence (doc 66): the founder + Claude inspect these. Never fetched by a student — the manifest points at the WebP.",
  },
  {
    id: "clips-manifest",
    match: (rel) => rel === "clips/manifest.json",
    ship: "prod",
    maxBytes: 1_000_000,
    why: "The reel index the learning module resolves questions against.",
  },
  {
    id: "clips-docs",
    match: (rel) => rel.startsWith("clips/"),
    ship: "dev",
    maxBytes: 100_000,
    why: "READMEs and stray working files next to the reels.",
  },
  {
    id: "scene-stills",
    match: (rel) => rel.startsWith("scene-stills/"),
    ship: "dev",
    maxBytes: 80_000_000,
    why: "Consumed only by /dev/verdict-board and /dev/scene-still, which do not exist in production.",
  },
  {
    id: "gallery-stills",
    match: (rel) => rel.startsWith("gallery-stills/"),
    // SHIPS, unlike scene-stills: /review/gallery is an admin route on the
    // real app (the founder reviews on staging, on his phone), not a /dev one.
    ship: "prod",
    // 155 stills at the 854 px / q78 poster contract measure 2.2 MB total,
    // ~14 KB each. The ceiling is ~3× that so the catalogue can keep growing;
    // a single still over 200 KB means the WebP encode step was skipped.
    maxBytes: 7_000_000,
    maxFileBytes: 200_000,
    why: "One review still per scenario template — the founder's visual verdict surface (/review/gallery).",
  },
  {
    id: "sim-textures-ktx2",
    match: (rel) => rel.startsWith("sim/textures/") && !rel.endsWith(".png"),
    ship: "prod",
    maxBytes: 5_200_000,
    // The two normal maps are ~1.26 MB each; anything larger means a UASTC
    // setting slipped.
    maxFileBytes: 1_600_000,
    why: "The shipping ground PBR sets. Tier-gated since H-11: low pulls 509,615 B of this, high 4,465,053 B.",
  },
  {
    id: "sim-textures-src",
    match: (rel) => rel.startsWith("sim/textures/") && rel.endsWith(".png"),
    ship: "dev",
    maxBytes: 30_000_000,
    why: "The source PNGs the KTX2 encoder was fed (tools/glb/pack_ground_textures.mjs). They are also the loader's last-resort fallback — but that path already degrades further, to the procedural canvas textures, so production does not need 21.6 MB standing by for it.",
  },
  {
    id: "sim-env",
    match: (rel) => rel.startsWith("sim/env/"),
    ship: "prod",
    maxBytes: 6_000_000,
    maxFileBytes: 2_000_000,
    why: "HDRI environments for image-based lighting. Not fetched at the low tier (H-11).",
  },
  {
    id: "sim-models",
    match: (rel) => rel.startsWith("sim/"),
    ship: "prod",
    maxBytes: 3_000_000,
    why: "The district kit: buildings, vehicles, signs, streetscape props, vegetation — Draco-compressed GLB.",
  },
  {
    id: "world",
    match: (rel) => rel.startsWith("world/"),
    ship: "prod",
    maxBytes: 1_500_000,
    why: "District JSON — the drivable topology every lesson loads.",
  },
  {
    id: "traces",
    match: (rel) => rel.startsWith("traces/"),
    ship: "prod",
    maxBytes: 80_000_000,
    why: "Recorded drives (S1 shadow-drive + follow-line). Fetched ONE at a time, per lesson — heavy on disk, light on the wire.",
  },
  {
    id: "decoders",
    match: (rel) => rel.startsWith("basis/") || rel.startsWith("draco/"),
    ship: "prod",
    maxBytes: 3_000_000,
    why: "KTX2/Draco wasm transcoders. On the critical path to the first frame.",
  },
  {
    id: "app-models",
    match: (rel) => rel.startsWith("models/"),
    ship: "prod",
    maxBytes: 1_000_000,
    why: "Non-district GLB used outside the simulator canvas.",
  },
  {
    id: "hero-loop",
    match: (rel) => rel.startsWith("hero/"),
    ship: "prod",
    maxBytes: 1_500_000,
    // THE TRIPWIRE THAT MATTERS HERE. This is the only asset in the tree that
    // a visitor fetches before they have read a word, on a phone, on mobile
    // data — it is the still plate's replacement, and the moment it stops
    // being cheap it stops being worth having (the plate is 0 requests). Two
    // sources are declared, ONE is fetched: the browser picks the first
    // <source> it can decode, so the per-file ceiling is the real budget and
    // the bucket ceiling only stops a third rendition creeping in.
    maxFileBytes: 700_000,
    why: "The pre-rendered marketing hero loop (VP9 + H.264) every phone gets instead of a still plate — see components/marketing/hero/HeroLoopVideo.tsx.",
  },
  {
    // Before `brand`, because it lives inside icons/ — the header's "narrow
    // rules come before the directory they live in" rule.
    id: "pwa-splash",
    match: (rel) => rel.startsWith("icons/splash/"),
    ship: "prod",
    // 18 plates (9 iPhone form factors x 2 orientations) measure 228 KB total,
    // ~13 KB each: they are a flat #05070c ground with the mark on it, so an
    // 8-bit palette PNG is effectively lossless. The ceiling is ~3x that, which
    // leaves room for iPads later and still fails loudly if someone re-renders
    // them in truecolour — that alone would be ~4.5 MB.
    maxBytes: 700_000,
    // A single plate over 60 KB means the flat ground grew a gradient and the
    // palette started dithering. See scripts/generate-icons.mjs.
    maxFileBytes: 60_000,
    why: "iOS launch images (apple-touch-startup-image). Without them a standalone launch flashes WHITE before the cockpit paints.",
  },
  {
    id: "app-shell",
    match: (rel) => rel === "sw.js" || rel === "offline.html",
    ship: "prod",
    // Two hand-written text files. The ceiling is here to make it obvious if
    // someone ever bundles a framework into the service worker.
    maxBytes: 60_000,
    why: "The service worker and the self-contained offline page it serves when the network is gone.",
  },
  {
    id: "brand",
    match: (rel) => rel.startsWith("icons/") || rel === "og.png",
    ship: "prod",
    maxBytes: 400_000,
    maxFileBytes: 150_000,
    why: "Favicons, PWA icons and the OG card — every one of them is on the landing page's critical path.",
  },
];

/** POSIX-ise a path so the rules read the same on Windows and on the VPS. */
export function toRel(root, absPath) {
  return path.relative(root, absPath).split(path.sep).join("/");
}

/** The bucket a public/-relative path belongs to, or null if undeclared. */
export function classify(rel) {
  return BUCKETS.find((b) => b.match(rel)) ?? null;
}

/** Every file under `dir`, as public/-relative POSIX paths. */
export function walk(root, dir = root) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, abs));
    else if (entry.isFile()) out.push(toRel(root, abs));
  }
  return out;
}

/**
 * Weigh public/ against the declaration.
 *
 * Returns per-bucket totals plus the two things a gate acts on: `violations`
 * (a hard failure) and `unclassified` (also a hard failure — see the header).
 */
export function scanPublic(root) {
  const files = walk(root);
  const byBucket = new Map(
    BUCKETS.map((b) => [b.id, { bucket: b, bytes: 0, files: 0, biggest: { rel: "", bytes: 0 } }]),
  );
  const unclassified = [];
  const oversizeFiles = [];

  for (const rel of files) {
    const bucket = classify(rel);
    const bytes = statSync(path.join(root, rel)).size;
    if (!bucket) {
      unclassified.push({ rel, bytes });
      continue;
    }
    const acc = byBucket.get(bucket.id);
    acc.bytes += bytes;
    acc.files += 1;
    if (bytes > acc.biggest.bytes) acc.biggest = { rel, bytes };
    if (bucket.maxFileBytes && bytes > bucket.maxFileBytes) {
      oversizeFiles.push({ rel, bytes, bucket: bucket.id, limit: bucket.maxFileBytes });
    }
  }

  const buckets = [...byBucket.values()];
  const violations = [
    ...buckets
      .filter((b) => b.bytes > b.bucket.maxBytes)
      .map((b) => ({
        kind: "bucket",
        id: b.bucket.id,
        bytes: b.bytes,
        limit: b.bucket.maxBytes,
      })),
    ...oversizeFiles.map((f) => ({
      kind: "file",
      id: `${f.bucket}: ${f.rel}`,
      bytes: f.bytes,
      limit: f.limit,
    })),
  ];

  const sum = (ship) =>
    buckets.filter((b) => b.bucket.ship === ship).reduce((n, b) => n + b.bytes, 0);

  return {
    buckets,
    unclassified,
    violations,
    totalBytes: buckets.reduce((n, b) => n + b.bytes, 0) + unclassified.reduce((n, f) => n + f.bytes, 0),
    prodBytes: sum("prod"),
    devBytes: sum("dev"),
  };
}

export function mb(bytes) {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
