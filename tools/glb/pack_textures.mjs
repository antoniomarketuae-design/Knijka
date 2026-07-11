#!/usr/bin/env node
/**
 * Pack the baked facade textures (tools/blender/facade_atlas.py output) into
 * the runtime formats under platform/public/sim/city-v3/textures/ and write
 * the manifest.json the sim's facade texture loader consumes.
 *
 * The 16 district-kit GLBs ship WITHOUT embedded images (each embedding its
 * own copy would multiply texture VRAM by the model count) — these files are
 * the single shared copy, wired onto the named materials (bay_* / trim) at
 * runtime by material name.
 *
 * Formats (doc 71 §4.7 policy):
 *   toktx (KTX-Software) found  -> KTX2: ETC1S for color/orm/emissive,
 *                                  UASTC for normals. manifest format "ktx2".
 *   toktx absent                -> WebP: lossy for color/emissive, LOSSLESS
 *                                  for normal + orm (lossy WebP is YUV420 —
 *                                  chroma subsampling wrecks vector/packed
 *                                  data). manifest format "webp".
 * The founder is installing KTX-Software; re-running this script after the
 * install upgrades the shipped set automatically (the runtime loader follows
 * the manifest).
 *
 * Usage: node tools/glb/pack_textures.mjs [bakeDir] [outDir]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join as joinPath } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import process from "node:process";
import { findToktx } from "./ktx.mjs";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const sharp = requireFromPlatform("sharp");

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const bakeDir = process.argv[2] ?? joinPath(repoRoot, "tools", "blender", "work", "facade_bakes");
const outDir =
  process.argv[3] ?? joinPath(platformDir, "public", "sim", "city-v3", "textures");

const SETS = ["bay_grid", "bay_strip", "bay_curtain", "bay_band", "trim"];
/** map -> { srgb, kind } ; kind drives the codec choice. */
const MAPS = {
  color: { srgb: true, kind: "color" },
  normal: { srgb: false, kind: "normal" },
  orm: { srgb: false, kind: "data" },
  emissive: { srgb: true, kind: "color" },
};

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  if (!existsSync(bakeDir)) {
    console.error(`bake dir not found: ${bakeDir} — run facade_atlas.py first`);
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });

  const toktx = findToktx();
  const format = toktx ? "ktx2" : "webp";
  if (toktx) {
    console.log(`textures: KTX2 via toktx (${toktx.bin})`);
  } else {
    console.log(
      "textures: KTX2 SKIPPED — no toktx (KTX-Software) found on PATH,\n" +
        "  C:\\Program Files\\KTX-Software\\bin or E:\\ktx*. Falling back to WebP\n" +
        "  (fine on desktop; ~4-8x more texture VRAM than KTX2). Install\n" +
        "  KTX-Software and re-run this script to upgrade automatically.",
    );
  }

  const manifest = { version: 1, format, sets: {} };
  let total = 0;

  for (const set of SETS) {
    manifest.sets[set] = {};
    for (const [map, cfg] of Object.entries(MAPS)) {
      const src = joinPath(bakeDir, set, `${map}.png`);
      if (!existsSync(src)) {
        console.warn(`  missing ${set}/${map}.png — skipped`);
        continue;
      }
      const outName = `${set}_${map}.${format}`;
      const dst = joinPath(outDir, outName);

      if (toktx) {
        // KTX-Software v4.4.2: the mip filter flag is `--filter` (older
        // builds used `--mipmap_filter`, which v4.4.x rejects).
        const args = ["--genmipmap", "--filter", "lanczos4"];
        if (cfg.kind === "normal") {
          args.push("--encode", "uastc", "--uastc_quality", "2", "--zcmp", "18");
        } else {
          args.push("--encode", "etc1s", "--clevel", "1", "--qlevel", "160");
        }
        args.push("--assign_oetf", cfg.srgb ? "srgb" : "linear");
        args.push(dst, src);
        execFileSync(toktx.bin, args, { stdio: "inherit" });
      } else {
        const img = sharp(src);
        if (cfg.kind === "color") {
          await img.webp({ quality: map === "color" ? 82 : 75, effort: 6 }).toFile(dst);
        } else {
          // normals + ORM: lossless (lossy WebP chroma subsampling corrupts
          // per-channel data / normal vectors)
          await img.webp({ lossless: true, effort: 6 }).toFile(dst);
        }
      }
      const size = statSync(dst).size;
      total += size;
      manifest.sets[set][map] = outName;
      console.log(`  ${outName.padEnd(28)} ${fmtKB(size)}`);
    }
  }

  // carry the tile contract along for consumers/debugging
  const layoutPath = joinPath(bakeDir, "layout.json");
  if (existsSync(layoutPath)) {
    manifest.layout = JSON.parse(readFileSync(layoutPath, "utf-8"));
  }

  writeFileSync(joinPath(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✔ ${SETS.length} sets -> ${outDir}`);
  console.log(`  format: ${format}   total on disk: ${fmtKB(total)}`);
}

main().catch((err) => {
  console.error("\n✖ pack_textures failed:", err);
  process.exit(1);
});
