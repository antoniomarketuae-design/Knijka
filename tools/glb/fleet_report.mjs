#!/usr/bin/env node
/**
 * FLEET COST REPORT — the numbers the founder's "the cars look too simple"
 * question actually turns on (doc 82 §3 V6).
 *
 * For every GLB in a fleet directory it reports, per model:
 *   - triangles (body + the four wheel nodes, as authored)
 *   - the DRAW CALLS the simulator will actually issue for that model, computed
 *     with `vehicleFleet.ts`'s real grouping rules rather than a naive material
 *     count: lamp materials are dropped (TrafficLayer draws them as overlays),
 *     `plate`/`cladding`/`checker_black` fold into `trim`, the paint shell is
 *     split into its own instanced draw, and the wheels are ONE shared rig
 *     (tire + hubcap) for the whole fleet rather than per-model.
 *   - file bytes, texture count, texture bytes
 *
 * Usage:
 *   node tools/glb/fleet_report.mjs <dir> [<dir2> ...]      # compare two dirs
 *   node tools/glb/fleet_report.mjs --json <dir>
 *
 * Why it exists: V6 says "zero extra draw calls". That is a claim a script can
 * check, and this is the script.
 */

import { readdirSync, statSync } from "node:fs";
import { join as joinPath, resolve as resolvePath, basename } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import process from "node:process";

const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const importFromPlatform = (spec) =>
  import(pathToFileURL(requireFromPlatform.resolve(spec)).href);

const { NodeIO } = await importFromPlatform("@gltf-transform/core");
const { ALL_EXTENSIONS } = await importFromPlatform("@gltf-transform/extensions");
const draco3d = requireFromPlatform("draco3dgltf");

// ---- the runtime's grouping rules (mirrors vehicleFleet.ts) -----------------
const SKIP_BODY_MATERIALS = new Set(["headlight", "taillight"]);
const FOLD_BODY_MATERIALS = {
  plate: "trim",
  cladding: "trim",
  checker_black: "trim",
  mesh_dark: "matte_black",
  brake_steel: "silver_satin",
};
const GENERIC_WHEEL_MATERIAL_RE = /^(tire|hubcap)/;
const WHEEL_NODE_RE = /^wheel_(FL|FR|RL|RR)$/;

/** Models palettes.json tints per-instance — their paint is a separate draw. */
const PALETTE_MODELS = new Set([
  "vela_h3", "pino", "corva_s", "dret_90", "corva_sw", "arden_x",
  "kolos", "corva_l", "tarpan", "kargo_v", "kargo_m", "taxi",
]);

function primTriangles(prim) {
  const indices = prim.getIndices();
  const count = indices ? indices.getCount() : (prim.getAttribute("POSITION")?.getCount() ?? 0);
  return Math.floor(count / 3);
}

function isUnderWheelNode(node) {
  for (let n = node; n; n = n.getParentNode?.() ?? null) {
    if (WHEEL_NODE_RE.test(n.getName())) return true;
  }
  return false;
}

async function readDoc(io, path) {
  return io.read(path);
}

function analyse(document, modelName) {
  const root = document.getRoot();
  let bodyTris = 0;
  let wheelTris = 0;
  const bodyMats = new Set();
  const wheelMats = new Set();
  const droppedMats = new Set();

  // Walk nodes so wheel-subtree exclusion matches the runtime (by NODE, not
  // by material name).
  const visit = (node, underWheel) => {
    const wheel = underWheel || WHEEL_NODE_RE.test(node.getName());
    const mesh = node.getMesh();
    if (mesh) {
      for (const prim of mesh.listPrimitives()) {
        const tris = primTriangles(prim);
        const matName = (prim.getMaterial()?.getName() ?? "").toLowerCase();
        if (wheel) {
          wheelTris += tris;
          wheelMats.add(matName);
        } else if (SKIP_BODY_MATERIALS.has(matName)) {
          droppedMats.add(matName);
        } else {
          bodyTris += tris;
          bodyMats.add(FOLD_BODY_MATERIALS[matName] ?? matName);
        }
      }
    }
    for (const child of node.listChildren()) visit(child, wheel);
  };
  for (const scene of root.listScenes()) {
    for (const node of scene.listChildren()) visit(node, false);
  }

  // Draw calls the model contributes when instanced (per pass):
  //   body groups (post-fold, minus the split paint) + 1 paint draw when the
  //   model is palette-tinted. Wheels are shared fleet-wide (counted once).
  const paintMats = [...bodyMats].filter((m) => m.startsWith("paint"));
  const tinted = PALETTE_MODELS.has(modelName);
  const bodyGroups = tinted ? bodyMats.size - paintMats.length : bodyMats.size;
  const paintGroups = tinted && paintMats.length > 0 ? 1 : 0;

  let texBytes = 0;
  for (const tex of root.listTextures()) texBytes += tex.getImage()?.byteLength ?? 0;

  return {
    bodyTris,
    wheelTris,
    tris: bodyTris + wheelTris,
    bodyMaterials: [...bodyMats].sort(),
    wheelMaterials: [...wheelMats].sort(),
    droppedMaterials: [...droppedMats].sort(),
    drawCalls: bodyGroups + paintGroups,
    bodyGroups,
    paintGroups,
    textures: root.listTextures().length,
    texBytes,
    genericWheel: [...wheelMats].every((m) => GENERIC_WHEEL_MATERIAL_RE.test(m)),
  };
}

async function reportDir(io, dir) {
  const abs = resolvePath(dir);
  const files = readdirSync(abs).filter((f) => f.endsWith(".glb")).sort();
  const rows = [];
  for (const f of files) {
    const name = basename(f, ".glb");
    const doc = await readDoc(io, joinPath(abs, f));
    const a = analyse(doc, name);
    a.name = name;
    a.bytes = statSync(joinPath(abs, f)).size;
    rows.push(a);
  }
  return { dir: abs, rows };
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const dirs = args.filter((a) => !a.startsWith("--"));
if (dirs.length === 0) {
  console.error("Usage: node tools/glb/fleet_report.mjs <dir> [<dir2>] [--json]");
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const reports = [];
for (const d of dirs) reports.push(await reportDir(io, d));

if (asJson) {
  console.log(JSON.stringify(reports, null, 2));
} else {
  for (const r of reports) {
    console.log(`\n=== ${r.dir}`);
    console.log(
      "model        tris  body  wheel  draws  body/paint  tex  bytes    materials",
    );
    let tris = 0, bytes = 0, draws = 0;
    for (const m of r.rows) {
      tris += m.tris;
      bytes += m.bytes;
      draws += m.drawCalls;
      console.log(
        `${m.name.padEnd(12)} ${String(m.tris).padStart(5)} ${String(m.bodyTris).padStart(5)} ` +
          `${String(m.wheelTris).padStart(6)} ${String(m.drawCalls).padStart(6)} ` +
          `${String(m.bodyGroups).padStart(5)}/${m.paintGroups} ${String(m.textures).padStart(5)} ` +
          `${String(m.bytes).padStart(8)}  ${m.bodyMaterials.join(",")} | wheel:${m.wheelMaterials.join(",")}`,
      );
    }
    console.log(
      `TOTAL        ${String(tris).padStart(5)} ${" ".repeat(12)} ${String(draws).padStart(6)} ` +
        `${" ".repeat(13)}${String(bytes).padStart(8)}`,
    );
  }
}
