#!/usr/bin/env node
// ---------------------------------------------------------------------------
// RAISE THE CABIN'S INTERIOR REAR-VIEW MIRROR — founder register B58, FIX B.
//
// WHY THIS EXISTS AS A TOOL AND NOT AS A BARE BINARY DIFF
// ---------------------------------------------------------------------------
// The founder played „Превишаване над +10 км/ч" and the В26 «50» that the
// lesson's own instruction 2 tells him to read („скоростта се чете от знака и
// скоростомера, не от гърба на предния") is never in the windscreen: it sits
// behind the cabin's own interior mirror at every distance on the approach. He
// was offered two fixes and chose this one deliberately — FIX A would have
// stopped SCENARIO_SIGN_SCALE scaling the sign's MOUNTING HEIGHT along with its
// size, which partly undoes his own earlier ruling that the drills' signs must
// be big.
//
// The mirror station lives in TWO places in hero_interior.glb: the
// `hotspot_mirror_rear` glass quad (its own node) and 168 vertices of
// `interior_shell` — the casing block, the four-strip dress and the stalk, all
// merged into one Draco-compressed mesh by tools/blender/hero_interior_v3.py.
// Moving the quad alone does nothing: the authored CASING then becomes the
// occluder, ~200 x 90 mm of dark block sitting exactly where the plate is.
// Both have to move together, so this is a vertex edit — and a vertex edit
// inside a Draco buffer is an unreviewable binary diff unless the script that
// made it is checked in beside it.
//
// WHAT IT DOES, EXACTLY
//   1. `hotspot_mirror_rear` node translation.y += RAISE_M
//   2. every `interior_shell` POSITION vertex inside MIRROR_STATION (authored
//      GLB space) gets += RAISE_M on Y.
// Nothing else is touched: a pure translation leaves normals alone, and UVs,
// materials and the baked AO are untouched by construction.
//
// THE NUMBER IS MEASURED, NOT INHERITED — and both halves of the figure that
// was handed down turned out to be wrong in different directions.
//
// The register said „~94 mm so the glass bottom edge sits at least 7 degrees
// above the horizon". Projected through the shipped cockpit camera
// (COCKPIT_EYE (0.24, 0.71, -0.255), vFOV 47 at 16:9, pitch -4 deg — the same
// math as vehicle/cockpit-camera-contract.test.ts, validated to the pixel
// against a measured frame), those two halves do not describe the same fix:
//
//   · 7 deg at the glass bottom needs only 47.7 mm of raise, and at 47.7 mm the
//     plate is STILL hidden from 26.8 m to 17.5 m — precisely the band the
//     register itself photographed as 100 % occluded. The angle is not the
//     criterion; whether the plate clears the assembly is.
//   · 94 mm is very nearly right and for the right reason, but it is 1.2 mm
//     above a cliff. Two things the first estimate missed: MirrorRig's 60 mm
//     lift runs along the EYE RAY, and a raised node makes that ray steeper, so
//     6.8 mm of every 94 is spent pulling the glass back down; and the raise
//     has to clear the AUTHORED CASING, not just the glass. Swept at 50 mm
//     steps of car position along `ov-keepright-v1`, the true threshold is
//     92.8 mm of node raise.
//
// A 1.2 mm margin is not a margin. The threshold moves with the student: the
// same sweep at ±0.75 m of lane drift gives 82.9 mm (drifting left, away from
// the plate) to 104.6 mm (drifting right, toward it). 105 mm is therefore the
// shipped figure — the founder's 94 rounded up to cover the lane he is actually
// graded on rather than only its exact centre line. It is aspect-independent
// (occlusion is a ray question, identical at 16:9, 16:10, 21:9 and the phone),
// and it puts the glass bottom at 10.7 deg, which is about what a real cabin
// mirror subtends from the driver's eye.
//
//   node tools/glb/raise_interior_mirror.mjs [--dry] [--file <glb>]
//
// Idempotent by refusal: the tool reads the node's current Y and stops if the
// station has already been raised, so a second run cannot double it.
//
// The code side of the same change is VitokCockpit's ROOF_Y / STALK block and
// `scene/vitok/hotspots.ts`'s rear-mirror click proxy — see the MIRROR STATION
// RAISE comment there. Asset and code move together or not at all.
// ---------------------------------------------------------------------------

import { statSync } from "node:fs";
import { join as joinPath } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

// This script lives outside the `platform/` package but its deps
// (@gltf-transform/*, draco3dgltf) are installed in platform/node_modules —
// same anchoring trick as optimize.mjs, and for the same reason.
const platformDir = fileURLToPath(new URL("../../platform/", import.meta.url));
const requireFromPlatform = createRequire(pathToFileURL(joinPath(platformDir, "package.json")));
const importFromPlatform = (spec) =>
  import(pathToFileURL(requireFromPlatform.resolve(spec)).href);
const { NodeIO } = await importFromPlatform("@gltf-transform/core");
const { ALL_EXTENSIONS } = await importFromPlatform("@gltf-transform/extensions");
const draco3d = requireFromPlatform("draco3dgltf"); // CJS

const DEFAULT_GLB = fileURLToPath(
  new URL("../../platform/public/sim/vehicles/hero_interior.glb", import.meta.url),
);

/** The raise, metres. See the block above for how it was measured. */
const RAISE_M = 0.105;

/**
 * The mirror station in AUTHORED GLB space (the file is Y-up with the car
 * facing -Z; chassis = (-x, y - 0.55, -z) through VitokCockpit's mount).
 *
 * Measured by decoding the Draco buffers, not guessed. Everything inside the
 * box is `interior_shell/int_dark` and it is exactly 168 vertices:
 *   z -0.58…-0.46  the casing block + the four-strip dress + the stalk's TIP
 *                  ring        (chassis y 0.759…0.850, z 0.46…0.58)
 *   z -0.16…-0.15  the stalk's ROOT ring, |x| <= 0.0099
 *                  (chassis y 0.8551…0.8750)
 * The nearest geometry OUTSIDE the box is the overhead console at authored
 * z >= -0.07 — 60 mm of clear air — so it cannot catch the ceiling kit by
 * accident, and the grab handles (the cabin's tallest geometry) are at
 * |x| 0.688…0.753, five times the box's half-width away.
 */
const MIRROR_STATION = {
  x: [-0.2, 0.2],
  y: [1.24, 1.46],
  z: [-0.68, -0.13],
};
/** Authored Y of `hotspot_mirror_rear` BEFORE the raise (hero_interior v3). */
const AUTHORED_NODE_Y = 1.353;
/** Vertices the box is expected to hold. A mismatch means the asset changed
 *  under this tool, and the box must be re-measured before it is trusted. */
const EXPECTED_VERTS = 168;

function inStation(a) {
  return (
    a[0] > MIRROR_STATION.x[0] && a[0] < MIRROR_STATION.x[1] &&
    a[1] > MIRROR_STATION.y[0] && a[1] < MIRROR_STATION.y[1] &&
    a[2] > MIRROR_STATION.z[0] && a[2] < MIRROR_STATION.z[1]
  );
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d;
  };
  const file = opt("file", DEFAULT_GLB);
  const dry = argv.includes("--dry");

  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    "draco3d.decoder": await draco3d.createDecoderModule(),
    "draco3d.encoder": await draco3d.createEncoderModule(),
  });
  const doc = await io.read(file);
  const root = doc.getRoot();

  const node = root.listNodes().find((n) => n.getName() === "hotspot_mirror_rear");
  if (!node) throw new Error("hero_interior.glb has no `hotspot_mirror_rear` node");
  const t = node.getTranslation();
  if (Math.abs(t[1] - AUTHORED_NODE_Y) > 1e-4) {
    throw new Error(
      `hotspot_mirror_rear sits at y ${t[1].toFixed(4)}, not the authored ${AUTHORED_NODE_Y} — ` +
        "already raised, or the asset was rebuilt. Refusing to move it again.",
    );
  }

  const shell = root.listMeshes().find((m) => m.getName() === "interior_shell");
  if (!shell) throw new Error("hero_interior.glb has no `interior_shell` mesh");

  let moved = 0;
  const seen = new Set();
  for (const prim of shell.listPrimitives()) {
    const pos = prim.getAttribute("POSITION");
    if (!pos || seen.has(pos)) continue; // an accessor shared by two prims moves once
    seen.add(pos);
    const a = [0, 0, 0];
    for (let i = 0; i < pos.getCount(); i++) {
      pos.getElement(i, a);
      if (!inStation(a)) continue;
      moved++;
      if (!dry) pos.setElement(i, [a[0], a[1] + RAISE_M, a[2]]);
    }
  }
  if (moved !== EXPECTED_VERTS) {
    throw new Error(
      `expected ${EXPECTED_VERTS} interior_shell vertices in the mirror station, found ${moved}. ` +
        "The asset changed — re-measure MIRROR_STATION before running this.",
    );
  }

  if (!dry) {
    node.setTranslation([t[0], t[1] + RAISE_M, t[2]]);
    await io.write(file, doc);
  }
  const size = statSync(file).size;
  console.log(
    `${dry ? "[dry] " : ""}hotspot_mirror_rear y ${t[1].toFixed(4)} -> ` +
      `${(t[1] + RAISE_M).toFixed(4)}  ·  interior_shell verts moved: ${moved}  ·  ` +
      `${file} (${(size / 1024).toFixed(1)} KB)`,
  );
}

main().catch((e) => {
  console.error(String(e?.message ?? e));
  process.exit(1);
});
