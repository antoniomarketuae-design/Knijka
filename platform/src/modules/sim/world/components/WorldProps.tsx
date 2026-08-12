"use client";

/**
 * Instanced street props — now dressed with the authored 3D GLB kits
 * (public/sim/signs + public/sim/streetscape, Draco-compressed) instead of the
 * old flat SVG plates + primitive poles.
 *
 * Every prop family is still INSTANCED (one InstancedMesh per model + material
 * group) and placed at the exact positions the pure builder emits
 * (world.signs / trafficLights / streetlights / trees). The GLBs load once
 * through a reference-counted module cache (mirrors cityModels.ts); each is
 * baked into a single vertex-coloured geometry per solid-colour body (baseColor
 * → vertex colour, so a multi-material prop draws in ONE call) plus, for signs,
 * a separate textured "face" group that keeps the correct baked Bulgarian sign
 * graphic (fixes the old roundabout wrong-face bug inherently — sign_roundabout
 * carries г12 "кръгово движение").
 *
 * Facing: authored props address the driver on their local -Z; the placement
 * convention is local +Z → driver (yawFromFacing). We therefore bake a 180°
 * yaw into the sign + signal geometry, and -90° into the street lamp (its arm
 * is modelled along +X and must reach over the road on local +Z).
 *
 * Metal/glass materials get a modest envMapIntensity bump so they catch the
 * scene HDRI (scene.environment, set by the scene's <Environment>).
 *
 * Streetscape v2 (doc 70 REF 1 + REF 3): leafy street trees (2 new models),
 * roadside billboards, bus-stop shelters and a pre-merged surface-parking
 * dressing cluster (kiosk + barrier arm + y/b bollards + wheel-stop rows —
 * merged into ONE geometry at bake time so all sites cost a single draw).
 * Ad faces (billboards + shelter panel) bake into a separate vertex-coloured
 * pass whose material gets a soft emissive lift at night, mirroring the
 * streetlight-glow gating. The v2 kit's signage_strip is NOT placed: it is a
 * podium-facade band with no free-standing support, so it has no standalone
 * streetside reading (buildings are outside this component's scope).
 *
 * Sign FACES (doc 86 T4): a plate whose art is fixed but whose NUMBER varies —
 * В26 „скорост", В33 „край на забраната" — is not a new GLB. All thirteen В26
 * numerals share `sign_speed_limit_50`'s body and face geometry; only the face
 * TEXTURE is per-numeral, re-rasterised at load time from the project's own
 * law-cited content/signs/svg/v26.svg (signFaces.ts), so the В26 in the cockpit
 * is the В26 in the student's theory question. Д4 rides Е7's square plate the
 * same way. A face that fails to build drops its KIND rather than falling back
 * to another numeral: doc 86 T4 is the defect where 82 shipped plates stated a
 * limit the reducer does not grade, and a fallback face would recreate it.
 *
 * Draw calls (WorldProps only; CityBuildings is separate + chunked):
 * THE TALLY THAT USED TO SIT HERE IS GONE ON PURPOSE. It read „… = 28 (was
 * 27)", and `buildWorldGeometry` carried a second copy of the same tally that
 * said 27, and neither of them counted the pedestrian-signal trio. Two prose
 * copies of one number is a drift generator, so the count now lives in exactly
 * one place and is DERIVED from the placement lists this component gates on:
 * `world/builders/drawSlots.ts` → `staticDrawSlotTerms`. Add a mesh here and
 * add its term there; there is no third number to forget.
 * Each family is mounted only where its list is non-empty, so a district that
 * posts no billboards mounts no billboard meshes and is charged for none —
 * including each В26 NUMERAL, which is its own instanced face (the „50" plate
 * on a 40 street cost the same two draws and told the student the wrong
 * number).
 * The guarded-crossing BARRIER is the one ANIMATED world prop: post + arm +
 * blink lamp as plain meshes (+3 draws per guarded map, 1–2 barriers ever),
 * the arm pose driven per frame by the runtime's graded timetable
 * (getRailBarrierDown → WorldRuntime.railBarrierDownAt — single truth).
 * All fixed + instanced; low tier decimates trees via preset.treeFraction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SignalLampState } from "../../contracts";
import {
  SIGN_KINDS,
  TREE_KINDS,
  type BillboardSize,
  type SignKind,
  type SignPlacement,
  type StaticTransform,
  type TrafficLightPlacement,
  type TreeKind,
  type TreePlacement,
  type UtilityPolePlacement,
  type WorldGeometry,
} from "../types";
import {
  UTILITY_ARM_HALF_M,
  UTILITY_POLE_HEIGHT_M,
  UTILITY_WIRE_SAG_M,
} from "../builders/constants";
import { createGltfLoader } from "./gltfLoader";
import { makeSignFaceTexture, type SignFaceArt } from "./signFaces";
import {
  SIGNAL_HEAD_LABELS,
  SIGNAL_LABEL_MAX_DIST_M,
  signalLabelKindFor,
  type SignalLabelKind,
} from "./signalHeadLabels";
import {
  LAMP_ON_HEX,
  LENS_EMISSIVE_R_M,
  LENS_GLASS_HEX,
  LENS_R_M,
} from "./signalLensLook";
import {
  drawWorldLabel,
  WORLD_LABEL_GAP_M,
  WORLD_LABEL_H_M,
  WORLD_LABEL_MAX_SCALE,
  WORLD_LABEL_REF_DIST_M,
  WORLD_LABEL_TEX_H,
  WORLD_LABEL_TEX_W,
  WORLD_LABEL_W_M,
} from "./worldLabel";
import {
  chunkTransforms,
  createInstancedMesh,
  createOffsetInstancedMesh,
  disposeAll,
  enableInstancedCulling,
  mergeSafe,
  paintGeometry,
} from "./three-helpers";
import { CityBuildings } from "./CityBuildings";
import type { QualityPreset } from "./quality";

const SIGN_BASE = "/sim/signs";
const STREET_BASE = "/sim/streetscape";
const STREET_V2_BASE = "/sim/streetscape-v2";

/** sim SignKind → authored 3D sign GLB (correct Bulgarian face baked in). */
const SIGN_GLB: Record<SignKind, string> = {
  stop: "sign_stop",
  giveWay: "sign_give_way",
  roundabout: "sign_roundabout",
  // В26 „…скорост, по-висока от означената" — ONE body, one face texture per
  // numeral. The kit's single baked face (В26-50) stays exactly as it shipped;
  // every other numeral rasterises content/signs/svg/v26.svg at load time
  // (signFaces.ts) onto the same circle_pro plate. Doc 86 T4: a plate that
  // states a limit the reducer does not grade is worse than no plate, so a
  // numeral whose face cannot be built is DROPPED, never substituted.
  limit20: "sign_speed_limit_50",
  limit30: "sign_speed_limit_50",
  limit40: "sign_speed_limit_50",
  limit50: "sign_speed_limit_50",
  limit60: "sign_speed_limit_50",
  limit70: "sign_speed_limit_50",
  limit80: "sign_speed_limit_50",
  limit90: "sign_speed_limit_50",
  limit100: "sign_speed_limit_50",
  limit110: "sign_speed_limit_50",
  limit120: "sign_speed_limit_50",
  limit130: "sign_speed_limit_50",
  limit140: "sign_speed_limit_50",
  limitEnd: "sign_speed_limit_50", // В33 — same plate, v33.svg face
  // Zone-driven posts (SIGN-ASSET drop, tools/blender/signs_v2.py). Loaded
  // TOLERANTLY: a missing GLB logs once and its kind simply doesn't render,
  // so the sim never hard-fails on a partially shipped kit.
  noOvertaking: "sign_no_overtaking",
  noStopping: "sign_no_stopping",
  // В28 rides the В27 body — byte-identical plate circle in the source art, one
  // diagonal instead of two (see signFaces.ts). No new GLB.
  noParking: "sign_no_stopping", // В28 — v28.svg face
  slippery: "sign_slippery",
  curve: "sign_warning_bend", // А1 — the shipped v1 asset serves curveAdvisory
  railGuarded: "sign_rail_guarded",
  railUnguarded: "sign_rail_unguarded",
  railCross: "sign_rail_cross", // geometry-only crossbuck (no face_* prim)
  barrier: "rail_barrier", // striped arm — ANIMATED (RailBarriers), never instanced
  noEntry: "sign_no_entry", // В1 — the v1 kit asset (tools/blender/signs.py)
  oneWay: "sign_service_fuel", // Д4 — the square info plate, d4.svg face
  // Г2/Г3 ride the ROUND BLUE plate the Г12 roundabout sign is baked on: the
  // source art is the same disc (circle r=90 + white ring r=84), so only the
  // face texture differs. No new GLB, and the plate a student meets here is
  // pixel-identical to the Г2 in his theory question.
  mandatoryRight: "sign_roundabout", // Г2 — g2.svg face
  mandatoryLeft: "sign_roundabout", // Г3 — g3.svg face
  // А19 „Деца" rides the А18 body: identical warning-triangle plate in the
  // source art, only the pictogram differs (a19.svg face). Founder item 61 —
  // a училищна зона must carry the sign that states WHY its limit is 30.
  children: "sign_pedestrian", // А19 — a19.svg face
  // Doc 86 D5 — four finished GLBs that shipped with no SignKind at all, so no
  // pass could reach them. They are now placeable kinds.
  pedestrianCrossing: "sign_pedestrian", // А18
  priorityRoad: "sign_priority_road", // Б3 (the жълт ромб)
  settlement: "sign_settlement", // Д11
  fuel: "sign_service_fuel", // Е7
};

/**
 * Kinds whose face is NOT the one baked into their GLB: the art is rasterised
 * from the law-cited SVG at load time and the numeral (В26/В33) substituted.
 * `limit50` is deliberately absent — it keeps its shipped baked face, so the
 * common plate is byte-identical to what the founder has already reviewed.
 */
const SIGN_FACE_OVERRIDE: Partial<Record<SignKind, { art: SignFaceArt; numeral?: number }>> = {
  limit20: { art: "v26", numeral: 20 },
  limit30: { art: "v26", numeral: 30 },
  limit40: { art: "v26", numeral: 40 },
  limit60: { art: "v26", numeral: 60 },
  limit70: { art: "v26", numeral: 70 },
  limit80: { art: "v26", numeral: 80 },
  limit90: { art: "v26", numeral: 90 },
  limit100: { art: "v26", numeral: 100 },
  limit110: { art: "v26", numeral: 110 },
  limit120: { art: "v26", numeral: 120 },
  limit130: { art: "v26", numeral: 130 },
  limit140: { art: "v26", numeral: 140 },
  oneWay: { art: "d4" },
  mandatoryRight: { art: "g2" },
  mandatoryLeft: { art: "g3" },
  children: { art: "a19" },
  noParking: { art: "v28" },
};
/** В33 numerals are per-placement, so its faces are built on demand (below). */
const LIMIT_END_ART: SignFaceArt = "v33";

/** The v1 four load strictly (as always); everything after them is tolerant. */
const CORE_SIGN_GLBS: readonly string[] = [
  "sign_stop",
  "sign_give_way",
  "sign_speed_limit_50",
  "sign_roundabout",
];

// ---------------------------------------------------------------------------
// GLB baking
// ---------------------------------------------------------------------------

/**
 * Merge the selected mesh primitives of a loaded GLB scene into ONE geometry
 * whose per-vertex colour is baked from each primitive's glTF baseColorFactor
 * (linear → linear, copies straight across). Optional Y-rotation is applied
 * before normalisation so facing + centring land in the final frame.
 */
function bakeVertexColored(
  scene: THREE.Object3D,
  opts: {
    include?: (materialName: string) => boolean;
    rotateY?: number;
    centerXZ?: boolean;
    /** Skip the base-to-y=0 translation — REQUIRED for partial bakes (e.g. an
     *  elevated ad face) that must stay aligned with their body geometry. */
    normalize?: boolean;
  } = {},
): THREE.BufferGeometry {
  scene.updateWorldMatrix(true, true);
  const parts: THREE.BufferGeometry[] = [];

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const pos = src.getAttribute("position");
    if (!pos) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    if (opts.include && !opts.include(mat?.name ?? "")) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", pos.clone());
    const nor = src.getAttribute("normal");
    if (nor) g.setAttribute("normal", nor.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    if (!nor) g.computeVertexNormals();

    const color = mat?.color ?? new THREE.Color(0xffffff);
    const count = pos.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });

  if (parts.length === 0) throw new Error("bakeVertexColored: no matching geometry");
  const merged = mergeSafe(parts, false);
  for (const p of parts) p.dispose();
  if (opts.rotateY) merged.rotateY(opts.rotateY);

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const normalize = opts.normalize ?? true;
  const dx = normalize && opts.centerXZ ? (bb.min.x + bb.max.x) / 2 : 0;
  const dz = normalize && opts.centerXZ ? (bb.min.z + bb.max.z) / 2 : 0;
  const dy = normalize ? bb.min.y : 0; // base to y=0
  if (dx || dy || dz) merged.translate(-dx, -dy, -dz);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Extract the sign's textured face primitive (material name starts with
 * "face_") as its own geometry + a cloned material that keeps the baked webp
 * face (alphaMode MASK → alphaTest 0.5). Same Y-rotation as the body so they
 * stay aligned. Returns null for geometry-only assemblies (crossbuck,
 * barrier arm) that carry no face primitive.
 */
function bakeSignFace(
  scene: THREE.Object3D,
  rotateY: number,
): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } | null {
  scene.updateWorldMatrix(true, true);
  let out: { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } | null = null;

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || out) return;
    const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as
      | THREE.MeshStandardMaterial
      | undefined;
    if (!mat || !mat.name.startsWith("face_")) return;

    const src = mesh.geometry;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", src.getAttribute("position").clone());
    const nor = src.getAttribute("normal");
    if (nor) g.setAttribute("normal", nor.clone());
    const uv = src.getAttribute("uv");
    if (uv) g.setAttribute("uv", uv.clone());
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(mesh.matrixWorld);
    if (!nor) g.computeVertexNormals();
    if (rotateY) g.rotateY(rotateY);
    g.computeBoundingSphere();

    const material = mat.clone();
    material.envMapIntensity = 1.2; // modest HDRI catch on the retroreflective face
    material.needsUpdate = true;
    out = { geometry: g, material };
  });

  return out;
}

// ---------------------------------------------------------------------------
// Prop asset cache (reference-counted, mirrors cityModels.ts)
// ---------------------------------------------------------------------------

interface SignAsset {
  body: THREE.BufferGeometry;
  /** null for geometry-only assemblies (crossbuck / barrier arm). */
  faceGeometry: THREE.BufferGeometry | null;
  faceMaterial: THREE.MeshStandardMaterial | null;
}

/** Body + separately-baked emissive ad face (aligned, same frame). */
interface AdPropAsset {
  body: THREE.BufferGeometry;
  face: THREE.BufferGeometry;
}

interface PropAssets {
  /** null = the kind's GLB failed to load (tolerated for zone kinds only —
   *  its placements are simply skipped; the core four still load strictly).
   *  `barrier` is ALWAYS null here — its GLB bakes into `railBarrier` below
   *  instead, so the static instanced pass structurally skips the kind. */
  signs: Record<SignKind, SignAsset | null>;
  /** Guarded-crossing barrier, split for animation: static post + arm
   *  assembly (hub/counterweight/stripes) re-based so the arm PIVOT sits at
   *  the geometry origin (rotate z = swing). Baked from the same rail_barrier
   *  GLB in the same authored frame; null = kit missing/bake failed
   *  (tolerated — the crossing shows no arm, exactly like a missing kind). */
  railBarrier: { post: THREE.BufferGeometry; arm: THREE.BufferGeometry } | null;
  signalHousing: THREE.BufferGeometry;
  /** Two-lens pedestrian head (doc 86 L3) — pole + housing, code geometry.
   *  There is no pedestrian GLB in the kit and a three-lens vehicle head with a
   *  dead middle lamp is not a pedestrian signal, so the housing is built here
   *  from primitives and shares the signal-housing material. */
  pedSignalHousing: THREE.BufferGeometry;
  streetlightHousing: THREE.BufferGeometry;
  streetlightGlow: THREE.BufferGeometry;
  /** Overhead-line column + crossarm (B65) — code geometry, no new asset. */
  utilityPole: THREE.BufferGeometry;
  /** Pavement parapet panel — the shipped, never-placed railing_run_6m.glb
   *  (B65); null when the GLB is missing, which skips the pass entirely
   *  rather than substituting a fake fence. */
  railingPanel: THREE.BufferGeometry | null;
  trees: Record<TreeKind, THREE.BufferGeometry>;
  furniture: {
    bench: THREE.BufferGeometry;
    bollard: THREE.BufferGeometry;
    trashBin: THREE.BufferGeometry;
    planter: THREE.BufferGeometry;
  };
  billboards: Record<BillboardSize, AdPropAsset>;
  busStop: AdPropAsset;
  /** Whole parking-dressing cluster merged into one geometry (one draw). */
  parkingKit: THREE.BufferGeometry;
  /** Shared vertex-colour materials (one per prop family). */
  materials: {
    signBody: THREE.MeshStandardMaterial;
    signalHousing: THREE.MeshStandardMaterial;
    streetSteel: THREE.MeshStandardMaterial;
    tree: THREE.MeshStandardMaterial;
    furniture: THREE.MeshStandardMaterial;
  };
}

/**
 * Boulevard linden (липа): the uniform species the builder plants along the
 * picked boulevards. There is no dedicated linden GLB yet, so it is derived
 * from leafy_tree_b — the tall OVAL deciduous silhouette, the closest of the
 * authored trees — narrowed and lifted into the clear-trunk avenue profile a
 * pruned Sofia boulevard linden carries. That keeps the boulevard row visually
 * distinct from the mixed street trees (which use leafy_tree_b unstretched)
 * without shipping another asset, and it still costs ONE instanced draw.
 * Narrowing (never widening) also guarantees the canopy cannot start
 * overhanging the carriageway that leafy_tree_b already clears.
 * `geometry.scale()` routes through applyMatrix4, which applies the normal
 * matrix and refreshes the bounds, so shading and frustum culling stay correct.
 * TODO(assets): author a real linden/кестен GLB in streetscape_v2.py.
 */
function bakeBoulevardLinden(scene: THREE.Object3D): THREE.BufferGeometry {
  return bakeVertexColored(scene, { centerXZ: true }).scale(0.76, 1.1, 0.76);
}

/**
 * OVERHEAD-LINE COLUMN (founder register B65 — „no wires, no poles").
 *
 * Code geometry, deliberately: the kit has no pole asset, public/ has a size
 * ceiling with a test behind it (tools/assets/publicBudget.test.mjs), and a
 * tapered concrete column with a crossarm is four primitives. It costs zero
 * bytes on the wire and it cannot carry a brand (ADR-001).
 *
 * Built in the streetlight's own local frame: +X runs ALONG the street, so the
 * crossarm sits ACROSS it and the three insulator tips are where the spans
 * hang from. 168 triangles at these segment counts — three of them fit inside
 * one lamp column's budget.
 */
function buildUtilityPole(): THREE.BufferGeometry {
  const h = UTILITY_POLE_HEIGHT_M;
  const parts: THREE.BufferGeometry[] = [];
  // Tapered column (a Bulgarian concrete СтБ column is visibly narrower up top).
  const shaft = new THREE.CylinderGeometry(0.11, 0.17, h, 6, 1);
  shaft.translate(0, h / 2, 0);
  parts.push(shaft);
  // Crossarm across the street (local Z), a little below the crown.
  const arm = new THREE.BoxGeometry(0.09, 0.09, UTILITY_ARM_HALF_M * 2);
  arm.translate(0, h - 0.7, 0);
  parts.push(arm);
  // Three insulators: the two arm tips + the crown.
  for (const [ax, ay, az] of [
    [0, h - 0.52, UTILITY_ARM_HALF_M],
    [0, h - 0.52, -UTILITY_ARM_HALF_M],
    [0, h + 0.14, 0],
  ] as const) {
    const ins = new THREE.CylinderGeometry(0.05, 0.06, 0.2, 5, 1);
    ins.translate(ax, ay, az);
    parts.push(ins);
  }
  const merged = mergeSafe(parts, false);
  disposeAll(parts);
  paintGeometry(merged, 0x9c9a95); // weathered concrete
  merged.computeBoundingSphere();
  return merged;
}

/**
 * THE SPANS, as ONE merged mesh for the whole district = ONE draw call.
 *
 * They cannot be instanced: a span's length is the gap to the next column, and
 * `StaticTransform` carries a single uniform scale, so instancing would either
 * stretch the wire's THICKNESS with its length or force one instanced draw per
 * distinct span. Merging is the cheaper answer and it is what markings.ts and
 * decals.ts already do for the same reason.
 *
 * Each span is three catenaries — the two arm tips and the crown — drawn as
 * thin triangle ribbons that always face up. The sag matters: a dead-straight
 * line between two poles reads as a wireframe artefact, and UTILITY_WIRE_SAG_M
 * is what makes it read as a cable.
 */
function buildUtilityWires(poles: readonly UtilityPolePlacement[]): THREE.BufferGeometry | null {
  const spans = poles.filter((p) => p.spanM > 0);
  if (spans.length === 0) return null;
  const SEGMENTS = 8;
  /**
   * Half-width of the ribbon, m — and it is a CROSS, not a flat strip.
   *
   * MEASURED IN THE FIRST RENDER, not reasoned about afterwards: the first cut
   * drew each wire as a single HORIZONTAL ribbon, and the frame came back with
   * the poles plainly visible and the cables gone. Of course it did. A driver's
   * eye is at 1.2 m and the wire hangs at 8.5 m, so over a 37 m span he looks
   * at a horizontal ribbon from ~11° BELOW it — a 0.056 m strip projects to
   * about a centimetre, i.e. nothing, and at 100 m to nothing at all.
   *
   * Two ribbons per conductor — one horizontal, one vertical — cost four extra
   * triangles per span per wire and give a silhouette that survives any
   * approach angle. The width is a legibility figure, not a conductor gauge: a
   * real 10 mm cable is invisible in this engine and the road itself is drawn
   * at 2.5× perceptual scale, so the wire is drawn at the scale it is read at.
   */
  const HALF_W = 0.05;
  const h = UTILITY_POLE_HEIGHT_M;
  const hangers: [number, number][] = [
    [h - 0.42, UTILITY_ARM_HALF_M],
    [h - 0.42, -UTILITY_ARM_HALF_M],
    [h + 0.24, 0],
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] = [];

  for (const pole of spans) {
    const yaw = pole.yaw;
    // Local +X (along the street, toward the next column) and local +Z.
    const ax = Math.cos(yaw);
    const az = -Math.sin(yaw);
    const zx = Math.sin(yaw);
    const zz = Math.cos(yaw);
    for (const [hy, hz] of hangers) {
      // plane 0 = horizontal (offset across the run), plane 1 = vertical.
      for (const plane of [0, 1] as const) {
        const base = positions.length / 3;
        for (let i = 0; i <= SEGMENTS; i++) {
          const t = i / SEGMENTS;
          // Parabolic sag — visually indistinguishable from a catenary at these
          // spans and one multiply instead of a cosh.
          const sag = UTILITY_WIRE_SAG_M * 4 * t * (1 - t);
          const along = t * pole.spanM;
          const px = pole.position[0] + ax * along + zx * hz;
          const py = pole.position[1] + hy - sag;
          const pz = pole.position[2] + az * along + zz * hz;
          for (const side of [-1, 1] as const) {
            const o = HALF_W * side;
            positions.push(
              px + (plane === 0 ? zx * o : 0),
              py + (plane === 1 ? o : 0),
              pz + (plane === 0 ? zz * o : 0),
            );
            normals.push(plane === 0 ? 0 : zx, plane === 0 ? 1 : 0, plane === 0 ? 0 : zz);
            uvs.push(t, side < 0 ? 0 : 1);
            colors.push(0.11, 0.11, 0.12);
          }
        }
        for (let i = 0; i < SEGMENTS; i++) {
          const a = base + i * 2;
          indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
        }
      }
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uvs), 2));
  g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(colors), 3));
  g.setIndex(indices);
  g.computeBoundingSphere();
  return g;
}

// rail_barrier GLB frame (tools/blender/signs_v2.py build_rail_barrier): the
// pivot hub sits at Blender (0.09, 0, arm_z=1.0) → after the π yaw bake the
// pivot lands at (-0.09, 1.0, 0); the arm spans local -X (the driver's left,
// across the incoming lane). Post primitives carry the "galv_pole" material;
// everything else (hub + counterweight + red/white stripes) IS the swinging
// assembly.
const BARRIER_PIVOT_X = -0.09;
const BARRIER_PIVOT_Y = 1.0;
const BARRIER_POST_MAT = "galv_pole";

/**
 * Merge already-baked part geometries at local offsets into one cluster
 * geometry (parts stay vertex-coloured, so the cluster renders in ONE
 * instanced draw for all sites). Inputs are NOT disposed.
 */
function composeCluster(
  parts: { geometry: THREE.BufferGeometry; x: number; z: number; yaw?: number }[],
): THREE.BufferGeometry {
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const yAxis = new THREE.Vector3(0, 1, 0);
  const placed = parts.map((part) => {
    const g = part.geometry.clone();
    quat.setFromAxisAngle(yAxis, part.yaw ?? 0);
    mat.compose(new THREE.Vector3(part.x, 0, part.z), quat, new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(mat);
    return g;
  });
  const merged = mergeSafe(placed, false);
  for (const g of placed) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Local layout of one surface-parking dressing site (doc 70 REF 1 midground):
 * ticket kiosk + barrier arm + y/b bollards guard the entrance on local +Z
 * (the builder aims +Z at the nearest road); two wheel-stop rows mark the
 * stall rows behind (1.8 m stops on a 2.7 m stall pitch). Extents stay inside
 * the ~9 m clearance radius the hand-picked sites were verified against.
 */
function composeParkingKit(pieces: {
  kiosk: THREE.BufferGeometry;
  barrier: THREE.BufferGeometry;
  bollard: THREE.BufferGeometry;
  wheelStop: THREE.BufferGeometry;
}): THREE.BufferGeometry {
  const parts: { geometry: THREE.BufferGeometry; x: number; z: number; yaw?: number }[] = [
    { geometry: pieces.kiosk, x: -2.5, z: 6.5 },
    { geometry: pieces.barrier, x: 0.6, z: 6.5 }, // arm spans the entrance lane (+X)
    { geometry: pieces.bollard, x: -0.7, z: 7.0 },
    { geometry: pieces.bollard, x: 4.3, z: 7.0 },
  ];
  for (let i = 0; i < 5; i++) parts.push({ geometry: pieces.wheelStop, x: (i - 2) * 2.7, z: -3.5 });
  for (let i = 0; i < 4; i++) {
    parts.push({ geometry: pieces.wheelStop, x: (i - 1.5) * 2.7, z: -8.5 });
  }
  return composeCluster(parts);
}

function makeSharedMaterials(): PropAssets["materials"] {
  const std = (metalness: number, roughness: number, envMapIntensity: number) =>
    new THREE.MeshStandardMaterial({ vertexColors: true, metalness, roughness, envMapIntensity });
  return {
    signBody: std(0.5, 0.5, 1.4), // galvanised poles/brackets catch the sky
    signalHousing: std(0.3, 0.55, 1.3),
    streetSteel: std(0.45, 0.5, 1.3),
    tree: std(0.0, 0.9, 1.0),
    furniture: std(0.3, 0.6, 1.2),
  };
}

async function buildPropAssets(): Promise<PropAssets> {
  const loader = createGltfLoader();
  const load = (base: string, file: string): Promise<GLTF> => loader.loadAsync(`${base}/${file}.glb`);
  /** Zone-sign kits load tolerantly: a missing/broken GLB skips its kind. */
  const loadOptional = async (base: string, file: string): Promise<GLTF | null> => {
    try {
      return await load(base, file);
    } catch {
      console.warn(`sim/world: optional sign GLB missing — ${base}/${file}.glb (kind skipped)`);
      return null;
    }
  };

  // GLBs load ONCE PER FILE, not per kind: the В26 numeral set is thirteen
  // kinds sharing one body (doc 86 T4), and Д4/Е7 share the square info plate.
  const optionalGlbFiles = [...new Set(Object.values(SIGN_GLB))].filter(
    (f) => !CORE_SIGN_GLBS.includes(f),
  );
  const optionalGlbsPromise = Promise.all(
    optionalGlbFiles.map((file) => loadOptional(SIGN_BASE, file)),
  );

  const [
    stop,
    giveWay,
    limit50,
    roundabout,
    signal,
    lamp,
    ornamental,
    bench,
    bollard,
    trashBin,
    planter,
    leafyA,
    leafyB,
    billboardLarge,
    billboardSmall,
    busStopShelter,
    ticketKiosk,
    barrierArm,
    bollardYb,
    wheelStop,
    railingRun,
  ] = await Promise.all([
    load(SIGN_BASE, SIGN_GLB.stop),
    load(SIGN_BASE, SIGN_GLB.giveWay),
    load(SIGN_BASE, SIGN_GLB.limit50),
    load(SIGN_BASE, SIGN_GLB.roundabout),
    load(SIGN_BASE, "signal_head_3"),
    load(STREET_BASE, "street_lamp"),
    load(STREET_BASE, "ornamental_tree"),
    load(STREET_BASE, "bench"),
    load(STREET_BASE, "bollard"),
    load(STREET_BASE, "trash_bin"),
    load(STREET_BASE, "planter"),
    load(STREET_V2_BASE, "leafy_tree_a"),
    load(STREET_V2_BASE, "leafy_tree_b"),
    load(STREET_V2_BASE, "billboard_large"),
    load(STREET_V2_BASE, "billboard_small"),
    load(STREET_V2_BASE, "bus_stop_shelter"),
    load(STREET_V2_BASE, "ticket_kiosk"),
    load(STREET_V2_BASE, "barrier_arm"),
    load(STREET_V2_BASE, "bollard_yb"),
    load(STREET_V2_BASE, "wheel_stop"),
    // B65 — the parapet. Loaded TOLERANTLY (loadOptional) like the zone-sign
    // kits: a missing GLB skips the pass, and a street with no fence is a
    // smaller lie than a street with a fence made of something else.
    loadOptional(STREET_V2_BASE, "railing_run_6m"),
  ]);

  const bakeSign = (gltf: GLTF): SignAsset => {
    const body = bakeVertexColored(gltf.scene, {
      include: (n) => !n.startsWith("face_"),
      rotateY: Math.PI,
    });
    const face = bakeSignFace(gltf.scene, Math.PI);
    return {
      body,
      faceGeometry: face ? face.geometry : null,
      faceMaterial: face ? face.material : null,
    };
  };

  const optionalGltfs = await optionalGlbsPromise;
  /** file name → its ONE bake, shared by every kind that names that file. */
  const bakedByFile = new Map<string, SignAsset>();
  bakedByFile.set(SIGN_GLB.stop, bakeSign(stop));
  bakedByFile.set(SIGN_GLB.giveWay, bakeSign(giveWay));
  bakedByFile.set(SIGN_GLB.limit50, bakeSign(limit50));
  bakedByFile.set(SIGN_GLB.roundabout, bakeSign(roundabout));

  let railBarrier: PropAssets["railBarrier"] = null;
  optionalGlbFiles.forEach((file, i) => {
    const gltf = optionalGltfs[i];
    if (!gltf) return;
    if (file === SIGN_GLB.barrier) {
      // Animated prop: post and arm bake SEPARATELY in the shared authored
      // frame (normalize off — the arm floats at pivot height and must not be
      // dropped to y=0), then the arm re-bases so its pivot is the origin.
      // signs.barrier stays null → the instanced pass skips the kind.
      try {
        const post = bakeVertexColored(gltf.scene, {
          include: (n) => n === BARRIER_POST_MAT,
          rotateY: Math.PI,
          normalize: false,
        });
        const arm = bakeVertexColored(gltf.scene, {
          include: (n) => n !== BARRIER_POST_MAT,
          rotateY: Math.PI,
          normalize: false,
        });
        arm.translate(-BARRIER_PIVOT_X, -BARRIER_PIVOT_Y, 0);
        arm.computeBoundingSphere();
        railBarrier = { post, arm };
      } catch {
        console.warn("sim/world: rail_barrier bake failed (barrier kind skipped)");
      }
      return;
    }
    bakedByFile.set(file, bakeSign(gltf));
  });

  const signs = Object.fromEntries(
    SIGN_KINDS.map((kind) => [
      kind,
      kind === "barrier" ? null : (bakedByFile.get(SIGN_GLB[kind]) ?? null),
    ]),
  ) as Record<SignKind, SignAsset | null>;

  // -- swapped faces (doc 86 T4 / D5) -----------------------------------------
  // A kind whose face is NOT the one baked into its GLB gets a clone of that
  // GLB's face material carrying a texture rasterised from the law-cited SVG.
  // Body + face GEOMETRY stay shared with the source kind; only the material is
  // per-kind, so thirteen В26 numerals cost thirteen small textures and nothing
  // else. A face that fails to build sets the kind to null — the placement pass
  // then renders NO post there, which is the whole point: doc 86 T4 is about a
  // plate that stated the wrong number, and a fallback face would restage it.
  await Promise.all(
    (Object.entries(SIGN_FACE_OVERRIDE) as [SignKind, { art: SignFaceArt; numeral?: number }][])
      .filter(([kind]) => signs[kind] !== null)
      .map(async ([kind, spec]) => {
        const base = signs[kind]!;
        const tex = await makeSignFaceTexture(spec.art, spec.numeral);
        if (!tex || !base.faceMaterial || !base.faceGeometry) {
          signs[kind] = null;
          return;
        }
        const material = base.faceMaterial.clone();
        material.map = tex;
        material.needsUpdate = true;
        signs[kind] = { body: base.body, faceGeometry: base.faceGeometry, faceMaterial: material };
      }),
  );

  const signalHousing = bakeVertexColored(signal.scene, {
    include: (n) => !n.startsWith("lamp_"),
    rotateY: Math.PI,
  });
  const pedSignalHousing = buildPedSignalHousing();

  const streetlightHousing = bakeVertexColored(lamp.scene, {
    include: (n) => n !== "lamp_lit",
    rotateY: -Math.PI / 2,
  });
  const streetlightGlow = bakeVertexColored(lamp.scene, {
    include: (n) => n === "lamp_lit",
    rotateY: -Math.PI / 2,
  });

  // Ad-carrying v2 props: vertex-coloured body + the "ad_face" primitive as a
  // separately-instanced emissive pass. The face bake must NOT re-normalize
  // (its bbox differs from the body's), or the panel drops to ground level.
  // v2 kit follows the v1 facing convention (props address local -Z → bake π).
  const bakeAdProp = (gltf: GLTF): AdPropAsset => ({
    body: bakeVertexColored(gltf.scene, {
      include: (n) => n !== "ad_face",
      rotateY: Math.PI,
    }),
    face: bakeVertexColored(gltf.scene, {
      include: (n) => n === "ad_face",
      rotateY: Math.PI,
      normalize: false,
    }),
  });

  // Parking kit: bake each piece, merge the authored site layout into ONE
  // cluster geometry, drop the per-piece bakes (only the cluster instances).
  const kioskG = bakeVertexColored(ticketKiosk.scene, { rotateY: Math.PI, centerXZ: true });
  const barrierG = bakeVertexColored(barrierArm.scene, {});
  const bollardYbG = bakeVertexColored(bollardYb.scene, { centerXZ: true });
  const wheelStopG = bakeVertexColored(wheelStop.scene, { centerXZ: true });
  const parkingKit = composeParkingKit({
    kiosk: kioskG,
    barrier: barrierG,
    bollard: bollardYbG,
    wheelStop: wheelStopG,
  });
  disposeAll([kioskG, barrierG, bollardYbG, wheelStopG]);

  return {
    signs,
    railBarrier,
    signalHousing,
    pedSignalHousing,
    streetlightHousing,
    streetlightGlow,
    utilityPole: buildUtilityPole(),
    // The GLB's run axis is already local X (bbox ±3.0275) and it stands on
    // y = 0, so it bakes UNROTATED and UNNORMALISED: a normalising bake would
    // rescale the panel and change the 6.055 m the builder spaces them at.
    railingPanel: railingRun
      ? bakeVertexColored(railingRun.scene, { normalize: false })
      : null,
    trees: {
      linden: bakeBoulevardLinden(leafyB.scene),
      ornamental: bakeVertexColored(ornamental.scene, { centerXZ: true }),
      leafyA: bakeVertexColored(leafyA.scene, { centerXZ: true }),
      leafyB: bakeVertexColored(leafyB.scene, { centerXZ: true }),
    },
    furniture: {
      bench: bakeVertexColored(bench.scene, { centerXZ: true }),
      bollard: bakeVertexColored(bollard.scene, { centerXZ: true }),
      trashBin: bakeVertexColored(trashBin.scene, { centerXZ: true }),
      planter: bakeVertexColored(planter.scene, { centerXZ: true }),
    },
    billboards: {
      large: bakeAdProp(billboardLarge),
      small: bakeAdProp(billboardSmall),
    },
    busStop: bakeAdProp(busStopShelter),
    parkingKit,
    materials: makeSharedMaterials(),
  };
}

function disposePropAssets(a: PropAssets): void {
  // Bodies and face GEOMETRIES are shared across kinds now (thirteen В26
  // numerals on one plate), so dispose by identity — a double dispose is
  // harmless but a leaked shared geometry is not.
  const seen = new Set<{ dispose(): void }>();
  const disposeOnce = (o: { dispose(): void } | null | undefined) => {
    if (!o || seen.has(o)) return;
    seen.add(o);
    o.dispose();
  };
  for (const kind of SIGN_KINDS) {
    const s = a.signs[kind];
    if (!s) continue; // tolerated missing zone-sign kit
    disposeOnce(s.body);
    disposeOnce(s.faceGeometry);
    disposeOnce(s.faceMaterial?.map);
    disposeOnce(s.faceMaterial);
  }
  if (a.railBarrier) disposeAll([a.railBarrier.post, a.railBarrier.arm]);
  disposeAll([
    a.signalHousing,
    a.pedSignalHousing,
    a.streetlightHousing,
    a.streetlightGlow,
    a.utilityPole,
    a.railingPanel,
    ...Object.values(a.trees),
    a.furniture.bench,
    a.furniture.bollard,
    a.furniture.trashBin,
    a.furniture.planter,
    a.billboards.large.body,
    a.billboards.large.face,
    a.billboards.small.body,
    a.billboards.small.face,
    a.busStop.body,
    a.busStop.face,
    a.parkingKit,
    ...Object.values(a.materials),
  ]);
}

interface CacheEntry {
  assets: PropAssets | null;
  promise: Promise<PropAssets>;
  refs: number;
}
let entry: CacheEntry | null = null;

function ensureEntry(): CacheEntry {
  if (!entry) {
    const promise = buildPropAssets().then((assets) => {
      if (entry) entry.assets = assets;
      return assets;
    });
    entry = { assets: null, promise, refs: 0 };
  }
  return entry;
}
function acquire(): Promise<PropAssets> {
  const e = ensureEntry();
  e.refs += 1;
  return e.promise;
}
function release(): void {
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    const e = entry;
    entry = null;
    e.promise.then(disposePropAssets).catch(() => {
      /* load failed — nothing to dispose */
    });
  }
}

/** Warm the cache as soon as this module loads (no-op on the server). */
function preloadPropModels(): void {
  if (typeof window === "undefined") return;
  ensureEntry();
}
preloadPropModels();

/** Returns the baked prop assets, or null until they load / on the server. */
function usePropModels(): PropAssets | null {
  const [assets, setAssets] = useState<PropAssets | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    acquire().then((a) => {
      if (active) setAssets(a);
    });
    return () => {
      active = false;
      setAssets(null);
      release();
    };
  }, []);
  return assets;
}

// ---------------------------------------------------------------------------
// Traffic lights (GLB housing + per-frame lens emissives)
// ---------------------------------------------------------------------------

// Lens local offsets on the housing (rotated frame): red top, yellow, green.
const LAMP_OFFSETS: [number, number, number][] = [
  [0, 2.85, 0.15],
  [0, 2.55, 0.15],
  [0, 2.25, 0.15],
];

/**
 * Top of the vehicle head's housing, m — the anchor the B35 caption hangs
 * above. Derived from the lens the housing is built around rather than typed
 * twice: the red lens centre is `LAMP_OFFSETS[0].y` with r `LENS_R_M`, and the
 * GLB's hood carries ~0.15 m of visor over it.
 */
const SIGNAL_HEAD_TOP_M = LAMP_OFFSETS[0]![1] + LENS_R_M + 0.15;

/**
 * Pedestrian head (doc 86 L3): TWO lenses, red over green, on a shorter pole —
 * the silhouette that tells a driver at a glance that this lamp is not his.
 * Mounted lower than the vehicle head (lenses at 2.30 / 2.00 m vs 2.85–2.25) so
 * the two never read as one signal on the same kerb.
 *
 * WHY THE LENS SITS PROUD OF THE BOX (doc 87 B55, open half). The head faces
 * ACROSS the carriageway — that is what a pedestrian head is for — so the
 * driver never sees it square on: measured at 65–77° off-normal on `pe-jay-v1`.
 * At the shipped geometry (r 0.105 at z 0.12 inside a housing whose front face
 * is at z 0.19) only **0.035 m of sphere cleared the box**, and the whole of
 * that sliver was silhouetted AGAINST THE DARK HOUSING. Projected width of the
 * visible sliver at 77° off-normal, taken off the circle rather than guessed:
 * **0.054 m** — 2 px at a 30 m approach, which is the „1–2 px sliver" the
 * register photographed at 14×.
 *
 * The remedy is the one the VEHICLE head already had forced on it for the same
 * complaint (r 0.085 → 0.13, founder R3 „no visible traffic light", doc 62 S1):
 * a bigger lens carried further forward. At r 0.13 / z 0.20 the same
 * measurement gives **0.169 m**, 3.1× wider — and 0.10 m of it now clears the
 * BOX's own silhouette, so the lit lens reads against the sky instead of
 * against black paint. The sphere's back is still at z 0.07, i.e. 0.12 m of it
 * remains inside the 0.2 m-deep box: it seats like a lens in a hood, it does
 * not float. Nothing else moves — the housing, the pole, the mounting heights
 * and the phase source are untouched, so the „not your lamp" silhouette and
 * `pedLampColors` are exactly as they were.
 */
/** Lens centre, m in front of the housing origin (front face at z 0.19). */
const PED_LENS_Z_M = 0.2;
/** Lens radius, m — the vehicle head's value, for the vehicle head's reason. */
const PED_LENS_R_M = LENS_R_M;
const PED_LAMP_OFFSETS: [number, number, number][] = [
  [0, 2.3, PED_LENS_Z_M],
  [0, 2.0, PED_LENS_Z_M],
];
const PED_POLE_TOP_M = 2.5;
const PED_HOUSING_MID_M = 2.15;

/**
 * Pole + lamp box for a pedestrian head, merged into ONE geometry so the pass
 * costs a single instanced draw. Vertex-coloured to ride the shared
 * `signalHousing` material (dark galvanised body), exactly like the GLB head it
 * stands beside.
 */
function buildPedSignalHousing(): THREE.BufferGeometry {
  const pole = new THREE.CylinderGeometry(0.055, 0.065, PED_POLE_TOP_M, 8);
  pole.translate(0, PED_POLE_TOP_M / 2, 0);
  const box = new THREE.BoxGeometry(0.34, 0.72, 0.2);
  box.translate(0, PED_HOUSING_MID_M, 0.09);
  const merged = mergeSafe([paintGeometry(pole, 0x2b2f33), paintGeometry(box, 0x1f2226)], false);
  pole.dispose();
  box.dispose();
  merged.computeBoundingSphere();
  return merged;
}

const LAMP_ON = {
  red: new THREE.Color(LAMP_ON_HEX.red),
  yellow: new THREE.Color(LAMP_ON_HEX.yellow),
  green: new THREE.Color(LAMP_ON_HEX.green),
} as const;

/**
 * WHY A DEAD HEAD LOOKED ALIVE, AND WHAT ACTUALLY FIXES IT — doc 87 B35.
 *
 * The four numbers themselves live in `signalLensLook.ts`, with the measured
 * before/after and the arithmetic gate that stops them drifting back.
 *
 * MEASURED FIRST, on the shipped frames the row was refused on
 * (`RR/b35/b35-y-50.png`, sc-signal-dead, the captioned head at 24.7 m, and
 * `b35-y-70.png` at 43.8 m — sampled at each lens's own projected rect, not by
 * eye). Every lens on that head WAS in the unlit branch below, and the pixels
 * prove it: red rgb(138,17,7), amber rgb(133,87,0), green rgb(21,107,37) —
 * exactly `LAMP_OFF` as it was authored. The lens colours were never the lie.
 * TWO other properties were:
 *
 *   1. SATURATION. Those three samples sit at 0.948 / 1.000 / 0.801 HSV
 *      saturation. Nothing in the physical world is a pure, fully saturated
 *      hue except a light source; paint and glass are not. And two of the
 *      three „off" lamps were BRIGHTER than the housing they were set in
 *      (relative luminance 0.118 and 0.108 against 0.066), so this was never
 *      going to yield to darkening alone. Desaturating is what it needed.
 *   2. THE MATERIAL WAS EMISSIVE. One `MeshBasicMaterial` with
 *      `toneMapped: false` drew the lit AND the unlit lens, so an unlit lens
 *      was a flat, constant, un-shaded, un-tone-mapped patch of colour: it did
 *      not darken in shadow, did not brighten in sun, had no gradient and no
 *      highlight. That is the exact signature of something that emits. Between
 *      the 24.7 m and 43.8 m frames the scene-lit housing went from luminance
 *      0.066 to 0.213 — 3.2× — while the dead red lens moved 0.058 to 0.063.
 *      The head's own dead lens was the one part of the scene the sun could
 *      not touch.
 *
 * So the pass is split in two, which is also what the object really is:
 *
 *   `traffic-light-lens-glass` — every lens, always, on the SCENE-LIT
 *      standard material. Dark desaturated glass that takes the sun, the sky
 *      HDRI and a specular highlight like the housing it is set into. It can
 *      never look self-luminous, because its brightness tracks its
 *      surroundings. This is the „dark, desaturated, slightly reflective, not
 *      a black hole" read, and it costs ONE extra instanced draw for the whole
 *      district (header budget above: signals 2 → 3).
 *   `traffic-light-lamps` — the LIT lens only, additively blended over the
 *      glass. „Off" is `LAMP_DARK` (black), and black adds nothing, so an
 *      unlit lens is not drawn at all rather than drawn dim. The emissive
 *      sphere is a hair larger than the glass one so it wins the depth test
 *      it now has to pass (0.004 m ≈ 0.15 px at 25 m).
 *
 * WHAT THIS DOES NOT DO. It does not re-open doc 86 L2 — „no traffic light
 * exists" on lessons 17/18/19/21/29 — which was a BLACK head with no read at
 * all. The glass tints below are deliberately lighter than the housing paint
 * (`buildPedSignalHousing`: 0x1f2226 / 0x2b2f33), so three discs are still
 * plainly there; they are simply no longer pure hues.
 */
const LENS_GLASS = {
  red: new THREE.Color(LENS_GLASS_HEX.red),
  yellow: new THREE.Color(LENS_GLASS_HEX.yellow),
  green: new THREE.Color(LENS_GLASS_HEX.green),
} as const;
/** Additive „this lens is not lit": black contributes nothing. */
const LAMP_DARK = new THREE.Color(0x000000);
/** Glass tints per lens, in `LAMP_OFFSETS` order (red, amber, green). */
const LENS_GLASS_TINTS: readonly THREE.Color[] = [
  LENS_GLASS.red,
  LENS_GLASS.yellow,
  LENS_GLASS.green,
];
/** Pedestrian head: red over green, no amber lens (see `pedLampColors`). */
const PED_LENS_GLASS_TINTS: readonly THREE.Color[] = [LENS_GLASS.red, LENS_GLASS.green];

/**
 * EMISSIVE contribution per lens for a lamp state (doc 62 S1): "dark" = no
 * lens emits (загаснал светофар); "amberFlashOn"/"amberFlashOff" = the
 * flashing-amber blink pair driven by the runtime's signal clock (the getter
 * alternates the STATE, so the per-lamp change cache below repaints exactly on
 * blink edges — no extra render-side timer, no per-frame writes while steady).
 * Writes into a module-scoped scratch tuple (returned for convenience): blink
 * edges recur at 2 Hz inside useFrame, and the perf law is zero useFrame
 * allocations — callers must consume the tuple before the next call.
 */
const LAMP_COLORS_SCRATCH: [THREE.Color, THREE.Color, THREE.Color] = [
  LAMP_DARK,
  LAMP_DARK,
  LAMP_DARK,
];
function lampColorsFor(state: SignalLampState): [THREE.Color, THREE.Color, THREE.Color] {
  const red = state === "red" || state === "redYellow";
  const yellow = state === "yellow" || state === "redYellow" || state === "amberFlashOn";
  const green = state === "green";
  LAMP_COLORS_SCRATCH[0] = red ? LAMP_ON.red : LAMP_DARK;
  LAMP_COLORS_SCRATCH[1] = yellow ? LAMP_ON.yellow : LAMP_DARK;
  LAMP_COLORS_SCRATCH[2] = green ? LAMP_ON.green : LAMP_DARK;
  return LAMP_COLORS_SCRATCH;
}

/**
 * The always-present glass lens pass. Scene-lit (so it has a gradient, a
 * highlight and a sun/shadow response), low roughness and a sky-catching
 * envMapIntensity like the other glass/metal in this file.
 */
function createLensGlass(
  lights: readonly StaticTransform[],
  offsets: readonly [number, number, number][],
  tints: readonly THREE.Color[],
  name: string,
): { geometry: THREE.BufferGeometry; material: THREE.Material; mesh: THREE.InstancedMesh } {
  const geometry = new THREE.SphereGeometry(LENS_R_M, 10, 8);
  const material = new THREE.MeshStandardMaterial({
    metalness: 0.0,
    roughness: 0.22,
    envMapIntensity: 1.2,
  });
  const mesh = createOffsetInstancedMesh(geometry, material, lights, offsets);
  mesh.name = name;
  // The tint never changes — a lens is the colour of its glass whether or not
  // the bulb behind it is on — so this is written once, not per frame.
  for (let i = 0; i < lights.length; i++) {
    for (let j = 0; j < offsets.length; j++) mesh.setColorAt(i * offsets.length + j, tints[j]!);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return { geometry, material, mesh };
}

/**
 * The lit-lens pass: additive over the glass, so „off" (black) draws nothing
 * and a lit lens is a glow on top of the same lens the driver sees when it is
 * dead — not a different object swapped in.
 */
function createLampEmissiveMaterial(): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    toneMapped: false,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

function TrafficLights({
  world,
  assets,
  preset,
  getSignalPhase,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
  getSignalPhase?: (signalNodeId: string, approachBearingDeg: number) => SignalLampState;
}) {
  // A pedestrian head is a different object with a different lamp count and a
  // different phase, so the two never share an instanced pass (doc 86 L3).
  const lights = useMemo(
    () => world.trafficLights.filter((l) => l.head !== "pedestrian"),
    [world.trafficLights],
  );
  const pedLights = useMemo(
    () => world.trafficLights.filter((l) => l.head === "pedestrian"),
    [world.trafficLights],
  );

  const housing = useMemo(() => {
    const mesh = createInstancedMesh(assets.signalHousing, assets.materials.signalHousing, lights, {
      castShadow: preset.castShadows === "full",
      name: "traffic-light-housings",
    });
    return mesh;
  }, [assets, lights, preset.castShadows]);
  useEffect(() => () => housing.dispose(), [housing]);

  // The dark tinted glass every lens is made of, lit or not (see LENS_GLASS).
  const glass = useMemo(
    () => createLensGlass(lights, LAMP_OFFSETS, LENS_GLASS_TINTS, "traffic-light-lens-glass"),
    [lights],
  );
  useEffect(
    () => () => {
      disposeAll([glass.geometry, glass.material]);
      glass.mesh.dispose();
    },
    [glass],
  );

  const lamps = useMemo(() => {
    // r 0.13 (was 0.085): the lens must read from a 50+ m approach on the
    // 2.5×-scaled roads — founder R3 "no visible traffic light" (doc 62 S1).
    const geometry = new THREE.SphereGeometry(LENS_EMISSIVE_R_M, 10, 8);
    const material = createLampEmissiveMaterial();
    const mesh = createOffsetInstancedMesh(geometry, material, lights, LAMP_OFFSETS);
    mesh.name = "traffic-light-lamps";
    // Mount unlit ("dark") — the first frame paints the true state; a wrong
    // pre-wiring green must never flash (the S1 dead-drill-shows-green trap).
    const initial = lampColorsFor("dark");
    for (let i = 0; i < lights.length; i++) {
      mesh.setColorAt(i * 3, initial[0]);
      mesh.setColorAt(i * 3 + 1, initial[1]);
      mesh.setColorAt(i * 3 + 2, initial[2]);
    }
    return { geometry, material, mesh };
  }, [lights]);
  useEffect(
    () => () => {
      disposeAll([lamps.geometry, lamps.material]);
      lamps.mesh.dispose();
    },
    [lamps],
  );

  const lampsRef = useRef<THREE.InstancedMesh | null>(null);
  const lastPhases = useRef<(SignalLampState | null)[]>([]);
  useEffect(() => {
    lastPhases.current = new Array<SignalLampState | null>(lights.length).fill(null);
  }, [lights, lamps]);

  // B35 — the caption for a head whose lenses cannot be read (see below).
  const labelRef = useRef<THREE.Mesh | null>(null);
  const labelTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = WORLD_LABEL_TEX_W;
    c.height = WORLD_LABEL_TEX_H;
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => labelTex.dispose(), [labelTex]);
  /** Which caption is currently PAINTED into the canvas (null = never). */
  const paintedLabel = useRef<SignalLabelKind | null>(null);

  useFrame((frame) => {
    const mesh = lampsRef.current;
    if (!mesh) return;
    let dirty = false;
    // --- B35 label selection, folded into the loop that already asks every
    // head for its state: zero extra `getSignalPhase` calls, zero allocations.
    const e = frame.camera.matrixWorld.elements;
    // The camera's forward is -Z of its own basis, and its position is the
    // translation column — read straight off the matrix so no Vector3 is
    // allocated inside useFrame (the perf law this file already keeps).
    const fwdX = -e[8]!;
    const fwdZ = -e[10]!;
    const camX = e[12]!;
    const camZ = e[14]!;
    let labelIndex = -1;
    let labelDist = 0;
    let labelScore = Infinity;
    let labelKind: SignalLabelKind | null = null;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!;
      // B35 — THE FALLBACK WAS `?? "green"`, i.e. a head with no phase source
      // rendered a bright, saturated GO. The engine layer forbids exactly this
      // in as many words (signals.ts lampState: „Unknown ids fail exactly like
      // phase(): 'red' (never a phantom green)"), and the render layer was
      // quietly doing the opposite of the module it draws.
      //
      // It is the worst possible default for this product: on «Загаснал
      // светофар» — a lesson whose ENTIRE subject is that an extinguished head
      // means равнозначно кръстовище and правилото на дясното (ЗДвП чл. 6) —
      // the most conspicuous thing on the head was a green lamp. A student
      // reads „green, go" and drives into a junction the lesson is teaching him
      // to yield at. That is the north-star test failed in a single token.
      //
      // "dark" is the honest read for "no phase source": a wired runtime never
      // reaches this branch (signalLampState is non-nullable and answers "red"
      // for an unknown id), so this only fires on scenes mounted without a
      // signal runtime — scene-still among them — where an unlit head is
      // exactly what an unsimulated signal is, and is visibly „no data" rather
      // than a false instruction.
      const state: SignalLampState =
        getSignalPhase?.(light.nodeId, light.approachBearingDeg) ?? "dark";

      // Caption candidate. `getSignalPhase` MUST be present: without a runtime
      // every head falls back to "dark" above, and captioning those would put
      // «ЗАГАСНАЛ СВЕТОФАР» over every head on /dev/scene-still — a statement
      // about the LAW made from the absence of data. Unlit-because-unsimulated
      // is not загаснал, and only a wired runtime can tell the two apart.
      if (getSignalPhase) {
        const kind = signalLabelKindFor(state);
        if (kind !== null) {
          const dx = light.position[0] - camX;
          const dz = light.position[2] - camZ;
          // Ahead of the driver only. A head he has already driven past is
          // behind his head, and a caption there is a billboard in the mirror.
          const along = dx * fwdX + dz * fwdZ;
          if (along > 0) {
            const d2 = dx * dx + dz * dz;
            const d = Math.sqrt(d2);
            // WHICH HEAD GETS THE CAPTION, and why it is not simply the
            // nearest. A signalized X-junction carries EIGHT heads on one node
            // (sx-v1, measured), and at the stop line the nearest of them is
            // the near-side head 9 m away and 80° off the view axis — beside
            // the driver's shoulder, where a caption is off the edge of the
            // windscreen. The head he actually reads there is the far-side
            // companion, 58 m away and 9° off axis.
            //
            // So the score is an effective distance that penalises being off
            // the view axis: `d / cos²θ`, which is `d³ / along²`. It picks the
            // far companion at the line and the near kerbside head on the
            // approach, which is what a driver's eye does; and because it is
            // still a distance, a dark junction 20 m ahead always beats one
            // 70 m further up the same boulevard.
            const score = (d * d2) / (along * along);
            if (score < labelScore && d <= SIGNAL_LABEL_MAX_DIST_M) {
              labelScore = score;
              labelDist = d;
              labelIndex = i;
              labelKind = kind;
            }
          }
        }
      }

      if (lastPhases.current[i] === state) continue;
      lastPhases.current[i] = state;
      const colors = lampColorsFor(state);
      mesh.setColorAt(i * 3, colors[0]);
      mesh.setColorAt(i * 3 + 1, colors[1]);
      mesh.setColorAt(i * 3 + 2, colors[2]);
      dirty = true;
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    // --- B35: place the caption on the nearest unreadable head ahead.
    const label = labelRef.current;
    if (label) {
      if (labelIndex < 0 || labelKind === null) {
        label.visible = false;
      } else {
        if (paintedLabel.current !== labelKind) {
          paintedLabel.current = labelKind;
          drawWorldLabel(labelTex.image as HTMLCanvasElement, SIGNAL_HEAD_LABELS[labelKind]);
          labelTex.needsUpdate = true;
        }
        const light = lights[labelIndex]!;
        // Constant apparent size past the reference distance — the caption has
        // to be readable at the 45 m where the drill's own card says «намали
        // отрано», not only at the line where the decision is already made.
        const s = Math.min(
          WORLD_LABEL_MAX_SCALE,
          Math.max(1, labelDist / WORLD_LABEL_REF_DIST_M),
        );
        // THE HEAD'S OWN SCALE, and it is not a detail: every signal placement
        // in the product is emitted at `scale 1.5` (sx-v1 and pe-jay-v1 both
        // measured through `buildWorldGeometry`), so the housing crown stands
        // at 1.5 × SIGNAL_HEAD_TOP_M. The first cut of this anchored at the
        // unscaled height and the card rendered INSIDE the housing — present
        // in the scene graph, invisible in the frame, and it took a measured
        // placement dump rather than a second look to find.
        const headTop = light.position[1] + SIGNAL_HEAD_TOP_M * (light.scale ?? 1);
        label.position.set(
          light.position[0],
          // The card hangs clear above the crown and grows UPWARD, never
          // downward into the junction he is trying to see.
          headTop + WORLD_LABEL_GAP_M + (WORLD_LABEL_H_M * s) / 2,
          light.position[2],
        );
        label.scale.set(s, s, 1);
        label.quaternion.copy(frame.camera.quaternion); // billboard
        label.visible = true;
      }
    }
  });

  return (
    <group name="traffic-lights">
      <primitive object={housing} />
      <primitive object={glass.mesh} />
      <primitive object={lamps.mesh} ref={lampsRef} />
      {/* B35 — the „this one is off" affordance, world-anchored over the head.
          Mounted always and hidden by one boolean per frame on the ~150
          scenarios whose heads are all readable.

          WHY IT DOES NOT DEPTH-TEST, which is the one place this departs from
          the B42 bubble and is not a shortcut. Measured on this row's own
          drive: the cockpit's INTERIOR REAR-VIEW MIRROR is camera-parked at an
          identical 251 × 150 px rect — x 794–1045, y 200–350 on a 1280 × 720
          canvas — in every frame of the approach (y −59, −37, −29.7 all
          measured, `scratchpad/fourrows/b35c/rect-*.png`). In view angles that
          is 7.6°–19.5° to the right of the axis, and a head on the RIGHT VERGE
          sits at 8.5° at 60 m and 19° at 27 m. The mirror therefore covers the
          right-verge sight line for the whole approach: with the caption
          depth-tested, more than half of it was behind the mirror glass at
          every pose. (That is the register's own row 7 / B58 finding, measured
          a third time here — it is filed, not hidden.)

          A bus hiding the officer is meaningful occlusion; the driver's own
          cabin hiding the instruction is the cabin eating the message, and
          this row has been refused twice for a caption a student cannot read.
          depthWrite stays off so it carves no hole, the distance is capped at
          SIGNAL_LABEL_MAX_DIST_M so it cannot float over a building three
          blocks away, and it is drawn transparent — i.e. after the opaque
          pass — so it lands on top of the cabin rather than under it. */}
      <mesh
        name="signal-head-label"
        ref={labelRef}
        visible={false}
        renderOrder={7}
        frustumCulled={false}
      >
        <planeGeometry args={[WORLD_LABEL_W_M, WORLD_LABEL_H_M]} />
        <meshBasicMaterial
          map={labelTex}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {pedLights.length > 0 ? (
        <PedestrianSignals
          lights={pedLights}
          assets={assets}
          preset={preset}
          getSignalPhase={getSignalPhase}
        />
      ) : null}
    </group>
  );
}

/**
 * Pedestrian heads at signalized crossings (doc 86 L3, founder item 29).
 *
 * THE PHASE IS NOT ITS OWN CLOCK. `getSignalPhase` is called with the CROSSING
 * id — a real signal node in runtime/signals.ts — and returns the VEHICLE state
 * there; the walker's green is the vehicle's red, which is verbatim the
 * predicate `traffic/pedestrians.crossingGateOpen` uses to release the figure.
 * So the lamp a student reads and the walker he is watching can never disagree,
 * and no new timer exists to drift.
 *
 * Amber has no pedestrian lens: a Bulgarian pedestrian head is red over green.
 * `redYellow` and the amber-flash pair therefore fall back to the pedestrian
 * RED — during a vehicle amber the crossing is closing, and „still red for you"
 * is the honest read. A dark junction (загаснал светофар) leaves both lenses
 * unlit, which is exactly what the crossing then is: uncontrolled.
 */
function pedLampColors(state: SignalLampState): [THREE.Color, THREE.Color] {
  if (state === "dark") return [LAMP_DARK, LAMP_DARK];
  // Vehicles stopped ⇒ the walker has his green.
  const walkerGo = state === "red";
  return walkerGo ? [LAMP_DARK, LAMP_ON.green] : [LAMP_ON.red, LAMP_DARK];
}

function PedestrianSignals({
  lights,
  assets,
  preset,
  getSignalPhase,
}: {
  lights: readonly TrafficLightPlacement[];
  assets: PropAssets;
  preset: QualityPreset;
  getSignalPhase?: (signalNodeId: string, approachBearingDeg: number) => SignalLampState;
}) {
  const housing = useMemo(
    () =>
      createInstancedMesh(assets.pedSignalHousing, assets.materials.signalHousing, lights, {
        castShadow: preset.castShadows === "full",
        name: "pedestrian-signal-housings",
      }),
    [assets, lights, preset.castShadows],
  );
  useEffect(() => () => housing.dispose(), [housing]);

  // The walker's head is made of the same glass as the driver's: a dark
  // pedestrian head that shows two saturated discs is the same lie as B35.
  const glass = useMemo(
    () =>
      createLensGlass(lights, PED_LAMP_OFFSETS, PED_LENS_GLASS_TINTS, "pedestrian-lens-glass"),
    [lights],
  );
  useEffect(
    () => () => {
      disposeAll([glass.geometry, glass.material]);
      glass.mesh.dispose();
    },
    [glass],
  );

  const lamps = useMemo(() => {
    const geometry = new THREE.SphereGeometry(LENS_EMISSIVE_R_M, 10, 8);
    const material = createLampEmissiveMaterial();
    const mesh = createOffsetInstancedMesh(geometry, material, lights, PED_LAMP_OFFSETS);
    mesh.name = "pedestrian-signal-lamps";
    for (let i = 0; i < lights.length; i++) {
      mesh.setColorAt(i * 2, LAMP_DARK);
      mesh.setColorAt(i * 2 + 1, LAMP_DARK);
    }
    return { geometry, material, mesh };
  }, [lights]);
  useEffect(
    () => () => {
      disposeAll([lamps.geometry, lamps.material]);
      lamps.mesh.dispose();
    },
    [lamps],
  );

  const lampsRef = useRef<THREE.InstancedMesh | null>(null);
  const lastPhases = useRef<(SignalLampState | null)[]>([]);
  useEffect(() => {
    lastPhases.current = new Array<SignalLampState | null>(lights.length).fill(null);
  }, [lights, lamps]);

  useFrame(() => {
    const mesh = lampsRef.current;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!;
      const state: SignalLampState =
        getSignalPhase?.(light.nodeId, light.approachBearingDeg) ?? "dark";
      if (lastPhases.current[i] === state) continue;
      lastPhases.current[i] = state;
      const colors = pedLampColors(state);
      mesh.setColorAt(i * 2, colors[0]);
      mesh.setColorAt(i * 2 + 1, colors[1]);
      dirty = true;
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="pedestrian-signals">
      <primitive object={housing} />
      <primitive object={glass.mesh} />
      <primitive object={lamps.mesh} ref={lampsRef} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Signs (3D GLB: vertex-coloured body + textured face, per kind)
// ---------------------------------------------------------------------------

function Signs({
  world,
  assets,
  preset,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
}) {
  const signs = world.signs;

  // В33 „Край на забраната" states the limit it LIFTS, so its numeral is
  // per-placement (SignPlacement.speedKmh) rather than per-kind. Its faces are
  // therefore built lazily, for exactly the numerals this district uses — never
  // thirteen 512² textures on every map.
  const endNumerals = useMemo(() => {
    const set = new Set<number>();
    for (const s of signs) {
      if (s.kind === "limitEnd" && typeof s.speedKmh === "number") set.add(s.speedKmh);
    }
    return [...set].sort((a, b) => a - b);
  }, [signs]);

  const [endFaces, setEndFaces] = useState<ReadonlyMap<number, THREE.MeshStandardMaterial>>(
    () => new Map(),
  );
  useEffect(() => {
    const baseFace = assets.signs.limitEnd?.faceMaterial ?? null;
    if (endNumerals.length === 0 || baseFace === null) {
      setEndFaces(new Map());
      return;
    }
    let alive = true;
    const built = new Map<number, THREE.MeshStandardMaterial>();
    void (async () => {
      for (const numeral of endNumerals) {
        const tex = await makeSignFaceTexture(LIMIT_END_ART, numeral);
        // No face → no post. A В33 wearing the baked „50" would state that a
        // 50 restriction ends where a 40 one does (doc 86 T4's failure mode).
        if (!tex) continue;
        const material = baseFace.clone();
        material.map = tex;
        material.needsUpdate = true;
        built.set(numeral, material);
      }
      if (alive) setEndFaces(built);
      else for (const m of built.values()) [m.map, m].forEach((o) => o?.dispose());
    })();
    return () => {
      alive = false;
    };
  }, [assets, endNumerals]);
  useEffect(
    () => () => {
      for (const m of endFaces.values()) {
        m.map?.dispose();
        m.dispose();
      }
    },
    [endFaces],
  );

  const meshes = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const out: THREE.InstancedMesh[] = [];
    const emit = (
      kind: SignKind,
      suffix: string,
      placements: SignPlacement[],
      faceMaterial: THREE.MeshStandardMaterial | null,
    ) => {
      const a = assets.signs[kind];
      if (!a || placements.length === 0) return;
      out.push(
        createInstancedMesh(a.body, assets.materials.signBody, placements, {
          castShadow,
          name: `signs-${kind}${suffix}-body`,
        }),
      );
      if (a.faceGeometry && faceMaterial) {
        out.push(
          createInstancedMesh(a.faceGeometry, faceMaterial, placements, {
            castShadow: false,
            name: `signs-${kind}${suffix}-face`,
          }),
        );
      }
    };
    for (const kind of SIGN_KINDS) {
      const placements = signs.filter((s) => s.kind === kind);
      if (placements.length === 0) continue;
      if (kind === "limitEnd") {
        // One bucket per numeral; a numeral whose face has not built yet (or
        // failed) renders nothing at all rather than the wrong number.
        for (const numeral of endNumerals) {
          const material = endFaces.get(numeral);
          if (!material) continue;
          emit(
            kind,
            `-${numeral}`,
            placements.filter((s) => s.speedKmh === numeral),
            material,
          );
        }
        continue;
      }
      emit(kind, "", placements, assets.signs[kind]?.faceMaterial ?? null);
    }
    return out;
  }, [assets, signs, preset.castShadows, endFaces, endNumerals]);
  useEffect(() => () => disposeAll(meshes), [meshes]);

  return (
    <group name="signs">
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Rail barriers — the guarded-crossing arm, the one MOVING world prop.
//
// Pose truth: the runtime's graded timetable, read per frame through
// getRailBarrierDown (LessonScene wires it to WorldRuntime.railBarrierDownAt,
// which evaluates at the last GRADED clock) — never a second clock, so the
// rendered arm and tick.railBarred cannot disagree. Down = the authored pose
// (rotation 0); up = ~86°; exponential damp gives the ~2.5 s real-РЖ swing,
// no snap. A red lamp on the arm blinks while the barrier is down or moving
// (the traffic-lamp on/off color pattern, LAMP_ON.red over the same dark
// tinted glass an unlit signal lens is made of, LENS_GLASS.red).
//
// Perf: 1–2 barriers per map ever → plain meshes (shared signBody material,
// cache-owned geometry; only the tiny lamp geometry + its materials are owned
// here). Zero per-frame allocations: pose + blink mutate group rotation and
// a preallocated material color.
// ---------------------------------------------------------------------------

/** Arm swing target when open: ~86° up (negative z-rotation lifts the -X arm). */
const BARRIER_ARM_UP_RAD = -1.5;
/** Exponential damp λ — full swing reads as ~2–3 s, soft at both ends. */
const BARRIER_ARM_DAMP = 2.0;
/** Arm counts as "moving" (lamp keeps blinking) until this close to target. */
const BARRIER_ARM_SETTLED_RAD = 0.03;
const BARRIER_BLINK_PERIOD_SEC = 0.9;
const BARRIER_BLINK_ON_SEC = 0.45;

interface BarrierRig {
  root: THREE.Group;
  pivot: THREE.Group;
  lampMaterial: THREE.MeshBasicMaterial;
  /** District-space prop position (world [x, h, -y]) for the runtime query. */
  dx: number;
  dy: number;
}

function RailBarriers({
  world,
  assets,
  preset,
  getRailBarrierDown,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
  getRailBarrierDown?: (x: number, y: number) => boolean;
}) {
  const placements = useMemo(
    () => world.signs.filter((s) => s.kind === "barrier"),
    [world.signs],
  );

  const built = useMemo(() => {
    const rb = assets.railBarrier;
    if (!rb || placements.length === 0) return null;
    const lampGeometry = new THREE.SphereGeometry(0.055, 10, 8);
    const castShadow = preset.castShadows === "full";
    const rigs: BarrierRig[] = placements.map((p, i) => {
      const root = new THREE.Group();
      root.name = `rail-barrier-${i}`;
      root.position.set(p.position[0], p.position[1], p.position[2]);
      root.rotation.y = p.yaw;
      const post = new THREE.Mesh(rb.post, assets.materials.signBody);
      post.castShadow = castShadow;
      const pivot = new THREE.Group();
      pivot.position.set(BARRIER_PIVOT_X, BARRIER_PIVOT_Y, 0);
      const arm = new THREE.Mesh(rb.arm, assets.materials.signBody);
      arm.castShadow = castShadow;
      const lampMaterial = new THREE.MeshBasicMaterial({ toneMapped: false });
      lampMaterial.color.copy(LENS_GLASS.red);
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.position.set(-1.05, 0, 0.1); // 1 m out on the arm, proud of its face
      pivot.add(arm);
      pivot.add(lamp);
      root.add(post);
      root.add(pivot);
      const dx = p.position[0];
      const dy = -p.position[2];
      // Snap to the truthful pose at mount (no phantom swing on spawn); no
      // wiring (standalone world mounts) keeps the authored down pose.
      const down = getRailBarrierDown ? getRailBarrierDown(dx, dy) : true;
      pivot.rotation.z = down ? 0 : BARRIER_ARM_UP_RAD;
      return { root, pivot, lampMaterial, dx, dy };
    });
    return { rigs, lampGeometry };
  }, [assets, placements, preset.castShadows, getRailBarrierDown]);
  // Per-frame pose writes go through a ref (the TrafficLights lampsRef
  // grammar — render values stay immutable for the compiler).
  const rigsRef = useRef<BarrierRig[] | null>(null);
  useEffect(() => {
    if (!built) return;
    rigsRef.current = built.rigs;
    return () => {
      rigsRef.current = null;
      built.lampGeometry.dispose();
      for (const r of built.rigs) r.lampMaterial.dispose();
    };
  }, [built]);

  useFrame((state, delta) => {
    const rigs = rigsRef.current;
    if (!rigs) return;
    for (let i = 0; i < rigs.length; i++) {
      const r = rigs[i]!;
      const down = getRailBarrierDown ? getRailBarrierDown(r.dx, r.dy) : true;
      const target = down ? 0 : BARRIER_ARM_UP_RAD;
      const z = THREE.MathUtils.damp(r.pivot.rotation.z, target, BARRIER_ARM_DAMP, delta);
      r.pivot.rotation.z = z;
      const moving = Math.abs(z - target) > BARRIER_ARM_SETTLED_RAD;
      const lit =
        (down || moving) &&
        state.clock.elapsedTime % BARRIER_BLINK_PERIOD_SEC < BARRIER_BLINK_ON_SEC;
      r.lampMaterial.color.copy(lit ? LAMP_ON.red : LENS_GLASS.red);
    }
  });

  if (!built) return null;
  return (
    <group name="rail-barriers">
      {built.rigs.map((r, i) => (
        <primitive key={i} object={r.root} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Streetlights (GLB housing + emissive head gated on night)
// ---------------------------------------------------------------------------

function Streetlights({
  world,
  assets,
  preset,
  night,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
  night: boolean;
}) {
  const lights = world.streetlights;

  const housing = useMemo(
    () =>
      createInstancedMesh(assets.streetlightHousing, assets.materials.streetSteel, lights, {
        castShadow: preset.castShadows === "full",
        name: "streetlight-housings",
      }),
    [assets, lights, preset.castShadows],
  );
  useEffect(() => () => housing.dispose(), [housing]);

  // Rebuilds on night toggle (rare, cheap) — keeps the material immutable.
  const glow = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      emissive: 0xffe6c2,
      emissiveIntensity: night ? 2.6 : 0,
      roughness: 0.4,
    });
    const mesh = createInstancedMesh(assets.streetlightGlow, material, lights, {
      name: "streetlight-glow",
    });
    return { material, mesh };
  }, [assets, lights, night]);
  useEffect(
    () => () => {
      glow.material.dispose();
      glow.mesh.dispose();
    },
    [glow],
  );

  return (
    <group name="streetlights">
      <primitive object={housing} />
      <primitive object={glow.mesh} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Trees (boulevard linden + ornamental + leafy_a/b, bucketed by builder kind)
// ---------------------------------------------------------------------------

/**
 * FOUR MODELS WERE NOT FOUR TREES — founder register B65, „the trees are one
 * repeated model".
 *
 * `TreePlacement.variant` (0|1|2) has existed since streetscape v2 and NOTHING
 * EVER READ IT: the renderer bucketed by `kind` alone and handed every
 * instance to `createInstancedMesh`, whose only per-instance freedoms are yaw
 * and a UNIFORM scale. A uniform scale is the one transform that cannot change
 * a silhouette — a big leafyA and a small leafyA are the same tree at two
 * distances — so a residential street planted from three kinds still read as
 * one model repeated down the verge, which is exactly what he said.
 *
 * The fix costs nothing: bucket by kind as before (still four instanced draws,
 * still four geometries, no new asset and no new byte in public/) and apply
 * the variant as a NON-UNIFORM scale in the instance matrix. Variant 0 is the
 * authored proportions verbatim; 1 is a narrow, taller tree; 2 is a squat,
 * broader one. Crowns therefore differ in outline, not merely in size — and
 * because the builder already jitters `scale` and `yaw`, no two neighbours
 * repeat.
 *
 * Widening only in xz would push a canopy over the kerb, so the broad variant
 * is held to +12% while the narrow one takes most of the spread — the same
 * caution `bakeBoulevardLinden` states for the linden avenue.
 */
const TREE_VARIANT_SCALE: readonly [number, number, number][] = [
  [1.0, 1.0, 1.0],
  [0.84, 1.22, 0.84],
  [1.12, 0.86, 1.12],
];

function createTreeInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly TreePlacement[],
  options: { castShadow?: boolean; name?: string },
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  const yAxis = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < placements.length; i++) {
    const t = placements[i]!;
    const v = TREE_VARIANT_SCALE[t.variant] ?? TREE_VARIANT_SCALE[0]!;
    const s = t.scale ?? 1;
    pos.set(t.position[0], t.position[1], t.position[2]);
    quat.setFromAxisAngle(yAxis, t.yaw);
    scl.set(s * v[0], s * v[1], s * v[2]);
    mat.compose(pos, quat, scl);
    mesh.setMatrixAt(i, mat);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = options.castShadow ?? false;
  mesh.matrixAutoUpdate = false;
  enableInstancedCulling(mesh); // see three-helpers.createInstancedMesh
  if (options.name) mesh.name = options.name;
  return mesh;
}

/**
 * Trees are the single largest triangle bill in the product — measured, with
 * my own raw GL counter, at 891,372 triangles per frame in d2-v1 at tier LOW
 * (50.3 % of the entire frame) from four unculled district-wide InstancedMeshes.
 * They are also the prop family a district plants most of, so this is where the
 * chunk grid earns its extra submissions. Same decimation, same models, same
 * placements — the student sees the identical street; the frame stops carrying
 * the half of it that is behind the car.
 */
function createTreeInstancedMeshes(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  placements: readonly TreePlacement[],
  options: { castShadow?: boolean; name?: string },
): THREE.InstancedMesh[] {
  const groups = chunkTransforms(placements);
  if (groups.length <= 1) {
    return placements.length > 0
      ? [createTreeInstancedMesh(geometry, material, placements, options)]
      : [];
  }
  return groups.map((g, i) =>
    createTreeInstancedMesh(geometry, material, g, {
      ...options,
      name: options.name ? `${options.name}-c${i}` : undefined,
    }),
  );
}

function Trees({
  world,
  assets,
  preset,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
}) {
  // Quality decimation: deterministic slice of the placement list (far-prop LOD).
  const kept = useMemo(() => {
    if (preset.treeFraction >= 1) return world.trees;
    const keepEvery = Math.round(1 / (1 - preset.treeFraction));
    return world.trees.filter((_, i) => i % keepEvery !== 0);
  }, [world.trees, preset.treeFraction]);

  const meshes = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const buckets: Record<TreeKind, TreePlacement[]> = {
      linden: [],
      ornamental: [],
      leafyA: [],
      leafyB: [],
    };
    for (const t of kept) buckets[t.kind].push(t);
    return TREE_KINDS.flatMap((kind) =>
      createTreeInstancedMeshes(assets.trees[kind]!, assets.materials.tree, buckets[kind]!, {
        castShadow,
        name: `trees-${kind}`,
      }),
    );
  }, [assets, kept, preset.castShadows]);
  useEffect(() => () => disposeAll(meshes), [meshes]);

  return (
    <group name="trees">
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Street furniture (derived from streetlight placements, low density)
// ---------------------------------------------------------------------------

/**
 * Derive bench/bin/planter/bollard poses from the streetlight run along the
 * arterials. Each is offset along the road tangent (streetlight local +X) so it
 * sits beside the pole on the sidewalk, sharing the light's yaw + height. Modulo
 * gates keep the counts modest and fully deterministic.
 */
function furniturePlacements(streetlights: readonly StaticTransform[]) {
  const bench: StaticTransform[] = [];
  const bollard: StaticTransform[] = [];
  const trashBin: StaticTransform[] = [];
  const planter: StaticTransform[] = [];
  for (let i = 0; i < streetlights.length; i++) {
    const s = streetlights[i]!;
    const [x, y, z] = s.position;
    const yaw = s.yaw;
    // Road tangent = streetlight local +X.
    const tx = Math.cos(yaw);
    const tz = -Math.sin(yaw);
    const at = (along: number): StaticTransform => ({
      position: [x + tx * along, y, z + tz * along],
      yaw,
    });
    if (i % 9 === 0) bench.push(at(2.6));
    if (i % 9 === 4) trashBin.push(at(-2.2));
    if (i % 7 === 3) planter.push(at(1.8));
    if (i % 5 === 2) bollard.push(at(-1.2));
  }
  return { bench, bollard, trashBin, planter };
}

function Furniture({
  world,
  assets,
  preset,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
}) {
  const meshes = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const p = furniturePlacements(world.streetlights);
    const mat = assets.materials.furniture;
    return [
      createInstancedMesh(assets.furniture.bench, mat, p.bench, { castShadow, name: "furniture-bench" }),
      createInstancedMesh(assets.furniture.planter, mat, p.planter, {
        castShadow,
        name: "furniture-planter",
      }),
      createInstancedMesh(assets.furniture.trashBin, mat, p.trashBin, {
        castShadow,
        name: "furniture-trash-bin",
      }),
      createInstancedMesh(assets.furniture.bollard, mat, p.bollard, {
        castShadow,
        name: "furniture-bollard",
      }),
    ];
  }, [assets, world.streetlights, preset.castShadows]);
  useEffect(() => () => disposeAll(meshes), [meshes]);

  return (
    <group name="furniture">
      {meshes.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// B65 street furniture — the overhead line and the pavement parapet
// ---------------------------------------------------------------------------

/**
 * „no wires, no poles, no fences, no barriers" — the three named absences that
 * no builder pass could produce, rendered in THREE draws total and mounted
 * only when the district actually has them.
 *
 * The `length > 0` guards are load-bearing, not tidiness: every city, exam and
 * полигон district returns empty lists (see constants.SCENARIO_LIT_CLASSES),
 * so those maps mount nothing here at all.
 *
 * The old wording of this paragraph said a count-0 InstancedMesh „still costs a
 * draw call submission". It does not, in the three this repo ships:
 * `WebGLBufferRenderer.renderInstances` returns on `primcount === 0` before
 * touching gl (`renderers/webgl/WebGLBufferRenderer.js:19-21`). What a count-0
 * mesh does cost is the CPU walk and the program/state setup that precede it,
 * which is a real cost on the weak-CPU device this product targets — so the
 * guards stay. They are just not worth a draw call each, and the draw budget
 * was never the reason to keep them.
 */
function B65Furniture({
  world,
  assets,
  preset,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
}) {
  const meshes = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const out: THREE.Object3D[] = [];
    const disposables: { dispose(): void }[] = [];
    if (world.utilityPoles.length > 0) {
      out.push(
        createInstancedMesh(assets.utilityPole, assets.materials.streetSteel, world.utilityPoles, {
          castShadow,
          name: "utility-poles",
        }),
      );
      const wires = buildUtilityWires(world.utilityPoles);
      if (wires) {
        // Wires are unlit thin ribbons: a MeshStandard wire at 8.5 m reads as a
        // flickering white thread when the sun catches it edge-on. Basic +
        // vertex colour keeps it a constant dark cable at every heading.
        // DoubleSide: the cross's vertical ribbon is back-facing from one side
        // of the street, and a wire that disappears when you change lane is a
        // worse artefact than the one it replaced.
        const material = new THREE.MeshBasicMaterial({
          vertexColors: true,
          side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(wires, material);
        mesh.name = "utility-wires";
        // A plain Mesh CAN cull on its own geometry sphere (unlike an
        // InstancedMesh it has no instance matrices to confuse it), and the
        // wire run is one merged ribbon whose sphere covers exactly the run.
        // Leaving culling off submitted it from behind the car every frame.
        out.push(mesh);
        disposables.push(wires, material);
      }
    }
    if (world.railings.length > 0 && assets.railingPanel) {
      out.push(
        createInstancedMesh(assets.railingPanel, assets.materials.streetSteel, world.railings, {
          castShadow,
          name: "pavement-parapet",
        }),
      );
    }
    return { out, disposables };
  }, [assets, world.utilityPoles, world.railings, preset.castShadows]);

  useEffect(
    () => () => {
      for (const o of meshes.out) {
        if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
      }
      disposeAll(meshes.disposables);
    },
    [meshes],
  );

  if (meshes.out.length === 0) return null;
  return (
    <group name="b65-street-furniture">
      {meshes.out.map((m, i) => (
        <primitive key={i} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Streetscape v2 — billboards, bus stops, parking-lot dressing (doc 70)
// ---------------------------------------------------------------------------

function StreetscapeV2({
  world,
  assets,
  preset,
  night,
}: {
  world: WorldGeometry;
  assets: PropAssets;
  preset: QualityPreset;
  night: boolean;
}) {
  const bySize = useMemo(
    () => ({
      large: world.billboards.filter((b) => b.size === "large"),
      small: world.billboards.filter((b) => b.size === "small"),
    }),
    [world.billboards],
  );

  const bodies = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const out: THREE.InstancedMesh[] = [];
    for (const size of ["large", "small"] as const) {
      if (bySize[size].length === 0) continue;
      out.push(
        createInstancedMesh(assets.billboards[size].body, assets.materials.streetSteel, bySize[size], {
          castShadow,
          name: `billboards-${size}-body`,
        }),
      );
    }
    if (world.busStops.length > 0) {
      out.push(
        createInstancedMesh(assets.busStop.body, assets.materials.streetSteel, world.busStops, {
          castShadow,
          name: "bus-stops-body",
        }),
      );
    }
    if (world.parkingKits.length > 0) {
      out.push(
        createInstancedMesh(assets.parkingKit, assets.materials.furniture, world.parkingKits, {
          castShadow,
          name: "parking-kits",
        }),
      );
    }
    return out;
  }, [assets, bySize, world.busStops, world.parkingKits, preset.castShadows]);
  useEffect(() => () => disposeAll(bodies), [bodies]);

  // Ad faces: one shared material, softly emissive at night (REF 1 lit-panel
  // flavor). Rebuilds on night toggle like the streetlight glow — rare, cheap.
  const adFaces = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      emissive: 0xfff1d4,
      emissiveIntensity: night ? 1.4 : 0,
      roughness: 0.4,
      envMapIntensity: 1.2,
    });
    const meshes: THREE.InstancedMesh[] = [];
    for (const size of ["large", "small"] as const) {
      if (bySize[size].length === 0) continue;
      meshes.push(
        createInstancedMesh(assets.billboards[size].face, material, bySize[size], {
          name: `billboards-${size}-face`,
        }),
      );
    }
    if (world.busStops.length > 0) {
      meshes.push(
        createInstancedMesh(assets.busStop.face, material, world.busStops, {
          name: "bus-stops-face",
        }),
      );
    }
    return { material, meshes };
  }, [assets, bySize, world.busStops, night]);
  useEffect(
    () => () => {
      adFaces.material.dispose();
      disposeAll(adFaces.meshes);
    },
    [adFaces],
  );

  return (
    <group name="streetscape-v2">
      {bodies.map((m, i) => (
        <primitive key={`b${i}`} object={m} />
      ))}
      {adFaces.meshes.map((m, i) => (
        <primitive key={`f${i}`} object={m} />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export function WorldPropsGroup({
  world,
  preset,
  night,
  getSignalPhase,
  getRailBarrierDown,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night: boolean;
  /** Lamp state per head — wire to WorldRuntime.signalLampState (mode- and
   *  approach-aware, doc 62 S1). Absent = all green (standalone mounts). */
  getSignalPhase?: (signalNodeId: string, approachBearingDeg: number) => SignalLampState;
  /** Barrier-arm state per guarded crossing (district meters) — wire to
   *  WorldRuntime.railBarrierDownAt. Absent = arms hold the authored down pose. */
  getRailBarrierDown?: (x: number, y: number) => boolean;
  /** Retained for the DistrictWorld prop contract; the 3D sign faces are baked
   *  into the GLBs now, so the SVG catalog is no longer consulted. */
  signSvgBaseUrl?: string | null;
}) {
  const assets = usePropModels();
  return (
    <group name="world-props">
      <CityBuildings world={world} preset={preset} night={night} />
      {assets ? (
        <>
          <TrafficLights
            world={world}
            assets={assets}
            preset={preset}
            getSignalPhase={getSignalPhase}
          />
          <Signs world={world} assets={assets} preset={preset} />
          <RailBarriers
            world={world}
            assets={assets}
            preset={preset}
            getRailBarrierDown={getRailBarrierDown}
          />
          <Streetlights world={world} assets={assets} preset={preset} night={night} />
          <Trees world={world} assets={assets} preset={preset} />
          <Furniture world={world} assets={assets} preset={preset} />
          <B65Furniture world={world} assets={assets} preset={preset} />
          <StreetscapeV2 world={world} assets={assets} preset={preset} night={night} />
        </>
      ) : null}
    </group>
  );
}
