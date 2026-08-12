#!/usr/bin/env node
/**
 * Cut the hero car's EXTERIOR shell down to what the game actually looks at.
 *
 *   node tools/glb/decimate_hero.mjs                       # in place, preset k3
 *   node tools/glb/decimate_hero.mjs --in a.glb --out b.glb --preset k3
 *   node tools/glb/decimate_hero.mjs --dry                 # report, write nothing
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT TOUCHES ONLY THE EXTERIOR
 * ---------------------------------------------------------------------------
 * `hero_car.glb` is a Rodin voxel-rebuild (tools/blender/HERO_CAR_RODIN_BRIEF.md).
 * Measured, its 65,434 triangles are a near-UNIFORM 35 mm grid over the whole
 * 29 m² shell — longest-edge percentiles 26.3 / 35.2 / 40.6 mm, 442 mm² per
 * triangle — i.e. a flat door panel is paid for at the same rate as a wheel
 * arch. 67.6 % of it is `car_paint` and a further 22.7 % is `car_glass`. That is
 * a remesh artifact, not authored detail, and it decimates enormously.
 *
 * WHERE THAT SHELL IS ACTUALLY SEEN — this is the part that decides the target:
 *   · COCKPIT VIEW: nowhere. `HeroCarBody` renders inside `<group
 *     visible={!cockpitView}>`, so from the driving seat the player's own shell
 *     is not submitted at all. Confirmed on the running product: at
 *     pe-cane-v1 / low / rung 3 the census finds 0 exterior triangles visible.
 *   · COCKPIT VIEW AT RUNG 1: only as the ShadowCar GHOST — `ShadowCar` loads
 *     the SAME GLB — translucent at 0.45 opacity, tinted, ahead of the car.
 *   · CHASE VIEW: the player's car, ~8 m astern.
 *   · The marketing landing page (`HeroScene3D`) orbits it at 10.5–13.5 m.
 * So the closest any camera ever gets to this mesh is the chase camera, and
 * there is NO cockpit-range view of it to protect. One LOD, tuned for 8 m, is
 * the whole requirement — a second, finer LOD would have no camera to serve.
 *
 * WHY THE INTERIOR IS NOT IN THIS SCRIPT. `hero_interior.glb` is the opposite
 * kind of mesh: authored, feature-adaptive (1,742 mm²/triangle, edges from
 * 6.8 mm to 2.6 m) and seen from 40 cm. Measured from the seat, a global
 * simplifier ratio of 0.75 with a 0.005 error budget — the gentlest setting
 * tried, worth only 15 % of its triangles — already deforms the air-vent bezel
 * and puts a spike on the door-card sill: 3.6 % of the cabin's pixels move
 * against a 1.5 % same-frame noise floor. At ratio 0.40 the vent bezel is gone
 * entirely and 18.0 % of cabin pixels move. The interior's real cost is DRAW
 * CALLS (40.4 of them, measured by ablation) against ~13.7k triangles — a
 * primitive-merge problem, not a decimation one. Do not point this script at it.
 *
 * WHY THE AUTHORED NORMALS ARE KEPT. Recomputing them after the collapse
 * (`normals({overwrite:true})`) was tried and MEASURED WORSE at every ratio:
 * the clearcoat highlight breaks into visible facets across the boot lid and
 * the car-region pixel delta roughly doubles (mean channel delta 0.573 → 1.192
 * at the same triangle count). The simplifier's interpolated authored normals
 * are what keep the paint reading as paint.
 *
 * THE HIGH-POLY SOURCE is the previous revision of the shipped file — recover it
 * with `git show <commit>:platform/public/sim/vehicles/hero_car.glb` if a future
 * pass wants a different target. This script REFUSES to run on an already-
 * decimated file so it can never be applied twice by accident.
 */

import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { statSync } from "node:fs";
import process from "node:process";

// Same anchoring trick as optimize.mjs: this script lives outside `platform/`
// but its deps are installed there.
const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(join(platformDir, "package.json")));
const importFromPlatform = (spec) => import(pathToFileURL(requireFromPlatform.resolve(spec)).href);

const { NodeIO } = await importFromPlatform("@gltf-transform/core");
const { ALL_EXTENSIONS } = await importFromPlatform("@gltf-transform/extensions");
const { weld, prune, dedup, draco, simplifyPrimitive, getBounds } =
  await importFromPlatform("@gltf-transform/functions");
const { MeshoptSimplifier } = await importFromPlatform("meshoptimizer");
const draco3d = requireFromPlatform("draco3dgltf");

const argv = process.argv.slice(2);
const opt = (n, d) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
};
const flag = (n) => argv.includes(`--${n}`);

const DEFAULT_GLB = fileURLToPath(
  new URL("../../platform/public/sim/vehicles/hero_car.glb", import.meta.url),
);
const IN = opt("in", DEFAULT_GLB);
const OUT = opt("out", IN);
const DRY = flag("dry");

/**
 * Per-MATERIAL [ratio, error]. Not one global ratio: `car_paint` and
 * `car_glass` are 90.3 % of the mesh and are the uniform-grid part, while the
 * 12-triangle brake caliper and the 156-triangle tyre are already minimal and
 * running a simplifier over them only risks a visible dent for nothing.
 *
 * `ratio` = fraction of indices to keep. `error` = fraction of mesh radius the
 * collapse may spend; too tight and it stops early, too loose and it walks a
 * vertex across the boot-lid crease and breaks the specular band.
 */
const PRESETS = {
  /**
   * SHIPPED. 65,434 → 11,220 scene triangles (−82.9 %). Chosen from a five-point
   * sweep (17,387 / 15,028 / 13,593 / 11,220 / 9,444) photographed from the
   * chase camera at one station in a single browser session and pixel-diffed
   * against the un-decimated frame over the car's own 420×280 region:
   *
   *     variant   tris    pixels changed >8/255    mean channel delta
   *     (floor)      —    2.331 %                  0.421
   *     15,028          2.308 %                  0.573   ← faceted crease on the boot
   *     17,387          2.806 %                  0.649
   *     13,593          3.219 %                  0.766
   *     11,220          2.674 %                  0.609   ← SHIPPED: cleanest of the set
   *      9,444          3.921 %                  0.886
   *
   * The floor is the same run photographed twice; the positive control (the
   * hero hidden outright) moves 46.0 % of that region, so the instrument is not
   * blind to a change. 11,220 is not simply "the smallest that passed": the
   * artifacts are NOT monotone in triangle count — where the collapse lands
   * relative to the boot crease matters more than how many collapses there are,
   * and 11,220 landed cleaner than both 15,028 and 13,593.
   */
  k3: {
    car_paint: [0.13, 0.04],
    car_glass: [0.08, 0.05],
    grille: [0.4, 0.03],
    diffuser: [0.4, 0.03],
    tail: [0.6, 0.02],
    drl: [0.6, 0.02],
    _default: [1, 0],
  },
  /** Kept for a future re-tune: the most conservative point of the sweep. */
  x50: { car_paint: [0.18, 0.03], car_glass: [0.12, 0.03], grille: [0.5, 0.02], diffuser: [0.5, 0.02], _default: [1, 0] },
};

const PRESET = opt("preset", "k3");
const TABLE = PRESETS[PRESET];
if (!TABLE) {
  console.error(`unknown preset "${PRESET}" — have ${Object.keys(PRESETS).join(", ")}`);
  process.exit(2);
}

await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  "draco3d.decoder": await draco3d.createDecoderModule(),
  "draco3d.encoder": await draco3d.createEncoderModule(),
});

const triStats = (doc) => {
  let total = 0;
  const per = new Map();
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      const c = (idx ? idx.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
      total += c;
      const k = prim.getMaterial()?.getName() ?? "(none)";
      per.set(k, (per.get(k) ?? 0) + c);
    }
  return { total, per };
};

/** Scene triangles: a mesh referenced by N nodes is submitted N times. */
const sceneTris = (doc) => {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  let n = 0;
  const walk = (node) => {
    const mesh = node.getMesh();
    if (mesh)
      for (const prim of mesh.listPrimitives()) {
        const idx = prim.getIndices();
        n += (idx ? idx.getCount() : prim.getAttribute("POSITION").getCount()) / 3;
      }
    for (const c of node.listChildren()) walk(c);
  };
  for (const c of scene.listChildren()) walk(c);
  return n;
};

/**
 * THE INVARIANTS THE RUNTIME DEPENDS ON. Nothing in the sim reads a vertex
 * count, but four things would break silently if the transform moved them:
 *  · node names — `HeroCarBody` / `ShadowCar` find `wheel_FL/FR/RL/RR` by name
 *    to roll and steer them;
 *  · material names — the paint swap (`/paint/i`), the controllable `drl` and
 *    `tail` lamp clones and the `envMapIntensity` bump are all name-keyed;
 *  · doubleSided — the A3 cockpit contract;
 *  · THE BOUNDING BOX. `HeroCarBody` auto-fits: `fitScale = colliderWidth /
 *    bbox.width` and `offsetY = -halfY - bbox.min.y * fitScale`. Shave a
 *    millimetre off the widest point and the whole car silently rescales and
 *    lifts or sinks. Measured: k3 leaves fitScale and offsetY BIT-IDENTICAL
 *    (0.817299 / −0.349837); a harsher preset that cost 4.3 mm of width moved
 *    fitScale by 0.2 %. This function is why that is a gate and not a hope.
 */
function invariants(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const b = getBounds(scene);
  const width = b.max[0] - b.min[0];
  const HALF = { x: 0.85, y: 0.35 }; // CHASSIS_HALF_EXTENTS (vehicle/tuning.ts)
  const fitScale = (HALF.x * 2) / width;
  return {
    nodes: doc.getRoot().listNodes().map((n) => n.getName()).sort(),
    materials: doc.getRoot().listMaterials().map((m) => `${m.getName()}:${m.getDoubleSided() ? 1 : 0}`).sort(),
    fitScale: Number(fitScale.toFixed(6)),
    offsetY: Number((-HALF.y - b.min[1] * fitScale).toFixed(6)),
  };
}

const doc = await io.read(IN);
const before = triStats(doc);
const beforeScene = sceneTris(doc);
const beforeInv = invariants(doc);

const paint = before.per.get("car_paint") ?? 0;
if (paint < 20_000) {
  console.error(
    `refusing: ${IN} has only ${paint} car_paint triangles — this looks ALREADY decimated.\n` +
      `Recover the high-poly source from git history and run the script on that.`,
  );
  process.exit(3);
}

// Weld first: meshopt needs a welded, indexed mesh or the collapse barely moves.
await doc.transform(weld());
for (const mesh of doc.getRoot().listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial()?.getName() ?? "(none)";
    const [ratio, error] = TABLE[mat] ?? TABLE._default ?? [1, 0];
    if (ratio >= 1) continue;
    simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error, lockBorder: false });
  }
await doc.transform(prune(), dedup(), draco());

const after = triStats(doc);
const afterScene = sceneTris(doc);
const afterInv = invariants(doc);

console.log(`${IN}  [preset ${PRESET}]`);
console.log(`  scene triangles ${beforeScene.toLocaleString()} -> ${afterScene.toLocaleString()}  (${(100 * (afterScene / beforeScene - 1)).toFixed(1)} %)`);
for (const k of new Set([...before.per.keys(), ...after.per.keys()])) {
  const b = before.per.get(k) ?? 0;
  const a = after.per.get(k) ?? 0;
  if (b !== a) console.log(`     ${k.padEnd(12)} ${String(b).padStart(6)} -> ${String(a).padStart(6)}  (${(100 * (a / b - 1)).toFixed(1)} %)`);
}

const problems = [];
if (beforeInv.nodes.join("|") !== afterInv.nodes.join("|"))
  problems.push(`node names changed:\n    ${beforeInv.nodes.join(", ")}\n -> ${afterInv.nodes.join(", ")}`);
if (beforeInv.materials.join("|") !== afterInv.materials.join("|"))
  problems.push(`materials / doubleSided changed:\n    ${beforeInv.materials.join(", ")}\n -> ${afterInv.materials.join(", ")}`);
if (beforeInv.fitScale !== afterInv.fitScale)
  problems.push(`auto-fit SCALE moved ${beforeInv.fitScale} -> ${afterInv.fitScale} — the car would render a different size`);
if (beforeInv.offsetY !== afterInv.offsetY)
  problems.push(`auto-fit GROUND OFFSET moved ${beforeInv.offsetY} -> ${afterInv.offsetY} — the car would float or sink`);
console.log(`  invariants: fitScale ${afterInv.fitScale} (was ${beforeInv.fitScale}) · offsetY ${afterInv.offsetY} (was ${beforeInv.offsetY}) · ${afterInv.nodes.length} nodes · ${afterInv.materials.length} materials`);
if (problems.length > 0) {
  console.error(`\nREFUSING TO WRITE — the transform moved something the runtime reads:`);
  for (const p of problems) console.error(`  * ${p}`);
  process.exit(4);
}

if (DRY) {
  console.log(`  --dry: nothing written`);
} else {
  await io.write(OUT, doc);
  console.log(`  wrote ${OUT}  ${(statSync(OUT).size / 1024).toFixed(0)} KB`);
}
