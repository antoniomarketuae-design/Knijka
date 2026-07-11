#!/usr/bin/env node
/**
 * interior_ao_cleanup.mjs — scope the baked cockpit AO to the visible shell /
 * seats / console / wheel only.
 *
 * hero_interior_ao_bake.py wires the baked occlusion into the six SHARED
 * int_* materials via the "glTF Material Output" node group. Because the
 * screens (screen_cluster/center), mirror glass (hotspot_mirror_*) and the
 * hotspot control meshes reuse those same materials but have no Lightmap UV,
 * Blender's exporter splits each into a texCoord=1 variant (the shell/seats/
 * wheel, correct) AND a texCoord=0 variant (the screens/mirrors/hotspots,
 * which would then sample the AO atlas at their planar quad UVs — a garbled
 * darkening on screen_center and the low-tier mirror glass).
 *
 * This pass removes the occlusion slot from every material that is used by a
 * NON-target mesh (and not also by a target), leaving the AO exclusively on
 * interior_shell / interior_seats / steering_wheel_mesh — exactly the meshes
 * that carry TEXCOORD_1. Screens/mirrors/hotspots become behaviourally
 * identical to the pre-AO GLB (no occlusion, authored UVMap untouched, so
 * VitokCockpit's runtime material swaps and ensureQuadUVs are unaffected).
 *
 * Runs BEFORE tools/glb/optimize.mjs (Draco/KTX2) — it only edits material
 * references, never geometry. Usage: node interior_ao_cleanup.mjs <in.glb> [out.glb]
 */
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join as joinPath, resolve } from "node:path";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const req = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const imp = (s) => import(pathToFileURL(req.resolve(s)).href);
const { NodeIO } = await imp("@gltf-transform/core");
const { ALL_EXTENSIONS } = await imp("@gltf-transform/extensions");
const { textureCompress } = await imp("@gltf-transform/functions");
const draco3d = req("draco3dgltf");
const sharp = req("sharp");

const TARGETS = new Set(["interior_shell", "interior_seats", "steering_wheel_mesh"]);

const input = resolve(process.argv[2]);
const output = resolve(process.argv[3] ?? process.argv[2]);

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});
const doc = await io.read(input);
const root = doc.getRoot();

const usedByTarget = new Set();
const usedByOther = new Set();
for (const node of root.listNodes()) {
  const mesh = node.getMesh();
  if (!mesh) continue;
  const bucket = TARGETS.has(node.getName()) ? usedByTarget : usedByOther;
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (mat) bucket.add(mat);
  }
}

let cleaned = 0;
let kept = 0;
for (const mat of root.listMaterials()) {
  if (!mat.getOcclusionTexture()) continue;
  // Keep AO only where the material is used exclusively by target meshes.
  if (usedByOther.has(mat) && !usedByTarget.has(mat)) {
    mat.setOcclusionTexture(null);
    cleaned++;
  } else {
    kept++;
  }
}

// Compress the AO atlas to WebP here (sharp, no subprocess) so the asset meets
// its <250 KB budget even when optimize.mjs's KTX2 post-pass can't run (the
// gltf-transform CLI shells out to toktx via a Windows .cmd, which recent Node
// blocks in execFileSync). GLTFLoader reads WebP occlusion via EXT_texture_webp,
// same as the sim's ground textures. If KTX2 later succeeds it supersedes this.
await doc.transform(
  textureCompress({ encoder: sharp, targetFormat: "webp", slots: /occlusionTexture/, quality: 90 }),
);
await io.write(output, doc);
console.log(
  `interior AO cleanup: kept occlusion on ${kept} target material(s), ` +
    `stripped from ${cleaned} non-target variant(s), AO->webp -> ${output}`,
);
