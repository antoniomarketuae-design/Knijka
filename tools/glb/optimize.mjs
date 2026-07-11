#!/usr/bin/env node
/**
 * Web-optimize an authored GLB for the Книжка.AI simulator's phone/browser budget.
 *
 * The audit (docs/simulation/66_SIMULATOR_UPGRADE_PLAN.md §1, §5) flagged 26 MB of
 * uncompressed RGBA textures as load-bearing-critical: nothing we author in Blender
 * (tools/blender/) may ship until it survives the mid-range-Android budget. This is
 * that gate. Run it on EVERY authored GLB before it lands in platform/public/sim/.
 *
 * Pipeline (all via @gltf-transform, no network):
 *   1. dedup    — merge duplicate accessors / meshes / materials / textures
 *   2. weld     — index + merge coincident verts (required before Draco)
 *   3. prune    — drop unused nodes / materials / textures / empty leaves
 *   4. resample — collapse redundant animation keyframes (no-op for static props)
 *   5. textures — KTX2/BasisU IF a `toktx` (KTX-Software) binary is on PATH,
 *                 otherwise a webp + resize fallback (always available via sharp)
 *   6. draco    — KHR_draco_mesh_compression geometry compression (draco3dgltf)
 *
 * KTX2 note: gltf-transform encodes KTX2 by shelling out to the native KTX-Software
 * `toktx` binary — there is no bundled wasm encoder. If `toktx` is absent we skip
 * KTX2 (clear console note) and fall back to webp+resize so Draco + a real texture
 * pass still run. Draco decoding in the sim is wired via
 * platform/src/modules/sim/world/components/gltfLoader.ts (createGltfLoader()).
 *
 * Usage:
 *   node tools/glb/optimize.mjs <input.glb> <output.glb> [--max-texture <px>] [--no-ktx2]
 *
 * Examples:
 *   node tools/glb/optimize.mjs in.glb out.glb
 *   node tools/glb/optimize.mjs in.glb out.glb --max-texture 2048
 *   node tools/glb/optimize.mjs in.glb out.glb --no-ktx2       # force webp fallback
 */

import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath, join as joinPath } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import process from "node:process";
import { findToktx, envWithToktx } from "./ktx.mjs";

// This script lives outside the `platform/` package, but its heavy deps
// (@gltf-transform/*, draco3dgltf, sharp) are installed in platform/node_modules.
// Node's ESM resolver anchors bare specifiers to THIS file's location, so we
// anchor resolution to platform/package.json instead (works via `npm run
// glb:optimize` from platform/ and via a direct `node tools/glb/optimize.mjs`).
const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const importFromPlatform = (spec) =>
  import(pathToFileURL(requireFromPlatform.resolve(spec)).href);

const { NodeIO } = await importFromPlatform("@gltf-transform/core");
const { ALL_EXTENSIONS } = await importFromPlatform("@gltf-transform/extensions");
const { dedup, prune, weld, resample, textureCompress, draco } =
  await importFromPlatform("@gltf-transform/functions");
const draco3d = requireFromPlatform("draco3dgltf"); // CJS
const sharp = requireFromPlatform("sharp"); // CJS

// ---- args ------------------------------------------------------------------

function parseArgs(argv) {
  const positional = [];
  let maxTexture = 1024;
  let ktx2 = true;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--no-ktx2") ktx2 = false;
    else if (a === "--max-texture") maxTexture = Number(argv[++i]);
    else if (a.startsWith("--max-texture=")) maxTexture = Number(a.split("=")[1]);
    else positional.push(a);
  }
  if (positional.length < 2) {
    console.error(
      "Usage: node tools/glb/optimize.mjs <input.glb> <output.glb> [--max-texture <px>] [--no-ktx2]",
    );
    process.exit(1);
  }
  if (!Number.isFinite(maxTexture) || maxTexture < 16) {
    console.error(`Invalid --max-texture value: ${maxTexture}`);
    process.exit(1);
  }
  return { input: positional[0], output: positional[1], maxTexture, ktx2 };
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// toktx detection lives in ./ktx.mjs (probes PATH, the KTX-Software installer
// dir and E:\ktx*) — shared with pack_textures.mjs so both pipelines upgrade
// to KTX2 automatically the moment the founder's KTX-Software install lands.

// ---- main ------------------------------------------------------------------

async function main() {
  const { input, output, maxTexture, ktx2 } = parseArgs(process.argv.slice(2));
  const inputPath = resolvePath(input);
  const outputPath = resolvePath(output);

  if (!existsSync(inputPath)) {
    console.error(`Input not found: ${inputPath}`);
    process.exit(1);
  }

  const beforeBytes = statSync(inputPath).size;
  console.log(`\n▶ optimizing  ${inputPath}`);
  console.log(`  input size:  ${fmtBytes(beforeBytes)}`);

  // Register every glTF extension so anything the source uses (KHR_texture_transform,
  // KHR_materials_*, Draco, BasisU, …) round-trips instead of being silently dropped.
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      "draco3d.decoder": await draco3d.createDecoderModule(),
      "draco3d.encoder": await draco3d.createEncoderModule(),
    });

  const document = await io.read(inputPath);
  const textureCount = document.getRoot().listTextures().length;

  // Blender's glTF exporter (5.x, "all vertex colors") duplicates the active
  // color attribute into COLOR_1+ — dead weight no runtime reads. Drop the
  // extras up front; dedup/prune below clean the orphaned accessors.
  for (const mesh of document.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      for (const semantic of prim.listSemantics()) {
        if (/^COLOR_(?:[1-9]\d*)$/.test(semantic)) prim.setAttribute(semantic, null);
      }
    }
  }

  // Decide the texture strategy up front so we can log one clear line.
  const wantKtx2 = ktx2;
  const toktx = wantKtx2 ? findToktx() : null;
  const useKtx2 = wantKtx2 && toktx !== null;

  if (!wantKtx2) {
    console.log("  textures:    KTX2 disabled (--no-ktx2) — using webp + resize fallback");
  } else if (useKtx2) {
    console.log(`  textures:    KTX2/BasisU via toktx (${toktx.bin})`);
  } else {
    console.log(
      "  textures:    KTX2 SKIPPED — no `toktx`/`basisu` (KTX-Software) binary on PATH;\n" +
        "               falling back to webp + resize. Install KTX-Software and re-run to\n" +
        "               get KTX2/BasisU (much smaller VRAM). Draco still applied below.",
    );
  }
  if (textureCount === 0) {
    console.log("  textures:    (none embedded in this GLB — texture pass is a no-op)");
  }

  // ---- geometry + housekeeping transforms (always) ----
  // prune keepAttributes: the district-kit GLBs ship IMAGE-FREE materials
  // (shared textures are wired at runtime by material name), so their
  // TEXCOORD_0/COLOR_0 look "unused" to prune's material analysis — default
  // v4 behaviour (keepAttributes false) silently strips the facade UVs.
  // keepUniqueNames: the district-kit GLBs carry IMAGE-FREE facade materials
  // (bay_grid/bay_strip/bay_curtain/bay_band/trim) that the runtime wires the
  // shared textures onto BY NAME (facadeTextures.ts / CityBuildings). With the
  // images stripped at export they are byte-identical glTF materials, so a
  // value-based dedup collapses all five into one (keeping whichever name comes
  // first — `trim`), silently destroying the bay-system distinction the sim
  // depends on. Preserving uniquely-named properties keeps the wiring intact.
  const transforms = [
    dedup({ keepUniqueNames: true }),
    weld(),
    prune({ keepAttributes: true }),
    resample(),
  ];

  // ---- texture transform: webp+resize unless KTX2 will run as a post-pass ----
  if (!useKtx2 && textureCount > 0) {
    transforms.push(
      textureCompress({
        encoder: sharp,
        targetFormat: "webp",
        resize: [maxTexture, maxTexture],
      }),
    );
  }

  // ---- Draco geometry compression (always) ----
  // quantizeTexcoord 14 (default 12): tiling facade UVs run past 0–1; 12 bits
  // over the UV range = ~15 px swim at 2K on long facades (doc 71 §4.5). The
  // generators also floor-subtract per-face UVs to keep magnitudes small.
  transforms.push(draco({ quantizeTexcoord: 14 }));

  await document.transform(...transforms);
  await io.write(outputPath, document);

  // ---- optional KTX2 finishing pass via the gltf-transform CLI ----
  // gltf-transform's KTX2 encoder is the native toktx binary, invoked through its
  // CLI (not cleanly importable). Only reached when toktx is actually present.
  if (useKtx2 && textureCount > 0) {
    try {
      const bin = process.platform === "win32" ? "gltf-transform.cmd" : "gltf-transform";
      const binPath = joinPath(platformDir, "node_modules", ".bin", bin);
      const cli = existsSync(binPath) ? binPath : bin;
      const env = envWithToktx(toktx);
      // Per-slot codec policy (doc 71 §4.7): ETC1S for color-ish maps (4 bpp),
      // UASTC for normal maps (ETC1S bands normal vectors). Run ETC1S first on
      // the explicit non-normal slots, then UASTC on normals only.
      execFileSync(
        cli,
        [
          "etc1s", outputPath, outputPath,
          "--slots", "{baseColorTexture,emissiveTexture,occlusionTexture,metallicRoughnessTexture}",
          "--quality", "160",
        ],
        { stdio: "inherit", env },
      );
      execFileSync(
        cli,
        ["uastc", outputPath, outputPath, "--slots", "{normalTexture}", "--level", "2", "--rdo", "--zstd", "18"],
        { stdio: "inherit", env },
      );
      console.log("  textures:    KTX2/BasisU applied (etc1s color + uastc normals)");
    } catch (err) {
      console.warn(
        `  textures:    KTX2 pass failed (${err.message}) — output has Draco + un-KTX2 textures`,
      );
    }
  }

  const afterBytes = statSync(outputPath).size;
  const saved = beforeBytes - afterBytes;
  const pct = beforeBytes > 0 ? ((saved / beforeBytes) * 100).toFixed(1) : "0.0";

  console.log(`  output:      ${outputPath}`);
  console.log(`  output size: ${fmtBytes(afterBytes)}`);
  console.log(
    `✔ ${fmtBytes(beforeBytes)} → ${fmtBytes(afterBytes)}  (${saved >= 0 ? "-" : "+"}${fmtBytes(
      Math.abs(saved),
    )}, ${pct}% smaller)\n`,
  );
}

main().catch((err) => {
  console.error("\n✖ optimize failed:", err);
  process.exit(1);
});
