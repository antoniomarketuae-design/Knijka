#!/usr/bin/env node
/**
 * Pack the ground PBR texture sets (road / sidewalk / ground — the ambientCG
 * CC0 sets under platform/public/sim/textures/**) to KTX2 and write the
 * manifest.json the sim's ground texture loader (pbrTextures.ts) consumes.
 *
 * This is a pure VRAM reduction (doc 71 §13 budget ≤96/256 MB; §2.1 KTX2
 * enabler) — NO visual change, NO new draw calls. The source PNGs stay in
 * place as the fallback: pbrTextures.ts loads a KTX2 when the manifest names
 * one and silently falls back to the PNG otherwise.
 *
 * Codec policy (doc 71 §2.1 / §4.7):
 *   albedo (color)      -> ETC1S  (sRGB) — 4 bpp
 *   roughness, ao (data)-> ETC1S  (linear) — grayscale data; qlevel 160 keeps
 *                          banding down (same setting the shipped facade ORM
 *                          uses). Bump to UASTC here if banding appears.
 *   normal              -> UASTC  (linear) — ETC1S bands normal vectors
 *
 * The KTX2 files ship a full mip chain (--genmipmap lanczos4) so the tiling
 * ground samples trilinear without the runtime generating mips (WebGL can't
 * for a compressed format).
 *
 * Colorspace/OETF is ASSIGNED, not converted: the PNG bytes are already in
 * their natural encoding (color = sRGB-encoded, data/normal = linear), so
 * --assign_oetf tags the transfer function without touching pixel values.
 * pbrTextures.ts ALSO sets tex.colorSpace explicitly (sRGB albedo / linear
 * rest) — the authoritative runtime signal — so a mis-tag here can't wash the
 * ground; this OETF just keeps the encoder's perceptual weighting correct.
 *
 * Usage: node tools/glb/pack_ground_textures.mjs [texturesDir]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join as joinPath } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { findToktx } from "./ktx.mjs";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const texturesDir =
  process.argv[2] ?? joinPath(platformDir, "public", "sim", "textures");

/** dir -> { hasAo }. Mirrors GROUPS in pbrTextures.ts. */
const SETS = {
  road: { hasAo: true },
  sidewalk: { hasAo: false },
  ground: { hasAo: true },
};

/** map -> { srgb, kind } ; kind drives the codec choice. */
const MAPS = {
  color: { srgb: true, kind: "color" }, // ETC1S sRGB
  normal: { srgb: false, kind: "normal" }, // UASTC linear
  roughness: { srgb: false, kind: "data" }, // ETC1S linear
  ao: { srgb: false, kind: "data" }, // ETC1S linear
};

function fmtKB(bytes) {
  return `${(bytes / 1024).toFixed(0)} KB`;
}

async function main() {
  if (!existsSync(texturesDir)) {
    console.error(`textures dir not found: ${texturesDir}`);
    process.exit(1);
  }

  const toktx = findToktx();
  if (!toktx) {
    console.error(
      "KTX2 SKIPPED — no toktx (KTX-Software) found on PATH,\n" +
        "  C:\\Program Files\\KTX-Software\\bin or E:\\**\\KTX-Software\\bin.\n" +
        "  Install KTX-Software (>=4.3) and re-run. The ground stays on PNG.",
    );
    process.exit(1);
  }
  console.log(`ground textures: KTX2 via toktx (${toktx.bin})\n`);

  const manifest = { version: 1, format: "ktx2", sets: {} };
  let total = 0;

  for (const [set, setCfg] of Object.entries(SETS)) {
    manifest.sets[set] = {};
    const setDir = joinPath(texturesDir, set);
    for (const [map, cfg] of Object.entries(MAPS)) {
      if (map === "ao" && !setCfg.hasAo) continue;
      const src = joinPath(setDir, `${map}.png`);
      if (!existsSync(src)) {
        console.warn(`  missing ${set}/${map}.png — skipped`);
        continue;
      }
      const outName = `${map}.ktx2`;
      const dst = joinPath(setDir, outName);

      // Mirror tools/glb/pack_textures.mjs exactly (proven on the facade set).
      const args = ["--genmipmap", "--filter", "lanczos4"];
      if (cfg.kind === "normal") {
        args.push("--encode", "uastc", "--uastc_quality", "2", "--zcmp", "18");
      } else {
        args.push("--encode", "etc1s", "--clevel", "1", "--qlevel", "160");
      }
      args.push("--assign_oetf", cfg.srgb ? "srgb" : "linear");
      args.push(dst, src);
      execFileSync(toktx.bin, args, { stdio: "inherit" });

      const size = statSync(dst).size;
      total += size;
      // manifest path is relative to the loader's BASE_URL (/sim/textures)
      manifest.sets[set][map] = `${set}/${outName}`;
      console.log(
        `  ${`${set}/${outName}`.padEnd(24)} ${cfg.kind === "normal" ? "UASTC" : "ETC1S"}  ${fmtKB(
          size,
        )}`,
      );
    }
  }

  writeFileSync(joinPath(texturesDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✔ ${Object.keys(SETS).length} sets -> ${texturesDir}`);
  console.log(`  format: ktx2   total on disk: ${fmtKB(total)}`);
}

main().catch((err) => {
  console.error("\n✖ pack_ground_textures failed:", err);
  process.exit(1);
});
