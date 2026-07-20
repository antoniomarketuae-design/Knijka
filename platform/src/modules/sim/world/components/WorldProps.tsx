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
 * Draw calls (WorldProps only; CityBuildings is separate + chunked):
 *   signals 2 (housing + lamps) + signs 8 (4 kinds × body+face)
 *   + streetlights 2 (housing + glow)
 *   + trees 4 (palm + ornamental + leafy_a + leafy_b)
 *   + furniture 4 (bench + bollard + trash_bin + planter)
 *   + billboards 4 (large/small × body+face) + bus stops 2 (body + face)
 *   + parking kit 1 (merged cluster) = 27  (was 18).
 * Zone-sign kinds (SIGN-ASSET drop) add draws ONLY on maps whose zones place
 * them (+2 per textured kind, +1 for the geometry-only crossbuck);
 * zones-less districts render exactly the fixed set above.
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
import type {
  BillboardSize,
  SignKind,
  StaticTransform,
  TreeKind,
  TreePlacement,
  WorldGeometry,
} from "../types";
import { createGltfLoader } from "./gltfLoader";
import {
  createInstancedMesh,
  createOffsetInstancedMesh,
  disposeAll,
  mergeSafe,
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
  limit50: "sign_speed_limit_50",
  roundabout: "sign_roundabout",
  // Zone-driven posts (SIGN-ASSET drop, tools/blender/signs_v2.py). Loaded
  // TOLERANTLY: a missing GLB logs once and its kind simply doesn't render,
  // so the sim never hard-fails on a partially shipped kit.
  noOvertaking: "sign_no_overtaking",
  noStopping: "sign_no_stopping",
  slippery: "sign_slippery",
  curve: "sign_warning_bend", // А1 — the shipped v1 asset serves curveAdvisory
  railGuarded: "sign_rail_guarded",
  railUnguarded: "sign_rail_unguarded",
  railCross: "sign_rail_cross", // geometry-only crossbuck (no face_* prim)
  barrier: "rail_barrier", // striped arm — ANIMATED (RailBarriers), never instanced
};
const SIGN_KINDS = Object.keys(SIGN_GLB) as SignKind[];
/** The v1 four load strictly (as always); everything after them is tolerant. */
const CORE_SIGN_KINDS: readonly SignKind[] = ["stop", "giveWay", "limit50", "roundabout"];
const ZONE_SIGN_KINDS: readonly SignKind[] = SIGN_KINDS.filter(
  (k) => !CORE_SIGN_KINDS.includes(k),
);

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
  streetlightHousing: THREE.BufferGeometry;
  streetlightGlow: THREE.BufferGeometry;
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

const TREE_KINDS: TreeKind[] = ["palm", "ornamental", "leafyA", "leafyB"];

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

  const zoneSignsPromise = Promise.all(
    ZONE_SIGN_KINDS.map((kind) => loadOptional(SIGN_BASE, SIGN_GLB[kind])),
  );

  const [
    stop,
    giveWay,
    limit50,
    roundabout,
    signal,
    lamp,
    palm,
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
  ] = await Promise.all([
    load(SIGN_BASE, SIGN_GLB.stop),
    load(SIGN_BASE, SIGN_GLB.giveWay),
    load(SIGN_BASE, SIGN_GLB.limit50),
    load(SIGN_BASE, SIGN_GLB.roundabout),
    load(SIGN_BASE, "signal_head_3"),
    load(STREET_BASE, "street_lamp"),
    load(STREET_BASE, "palm_tree"),
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

  const zoneSignGltfs = await zoneSignsPromise;
  const signs: Record<SignKind, SignAsset | null> = {
    stop: bakeSign(stop),
    giveWay: bakeSign(giveWay),
    limit50: bakeSign(limit50),
    roundabout: bakeSign(roundabout),
    noOvertaking: null,
    noStopping: null,
    slippery: null,
    curve: null,
    railGuarded: null,
    railUnguarded: null,
    railCross: null,
    barrier: null,
  };
  let railBarrier: PropAssets["railBarrier"] = null;
  ZONE_SIGN_KINDS.forEach((kind, i) => {
    const gltf = zoneSignGltfs[i];
    if (!gltf) return;
    if (kind === "barrier") {
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
    signs[kind] = bakeSign(gltf);
  });

  const signalHousing = bakeVertexColored(signal.scene, {
    include: (n) => !n.startsWith("lamp_"),
    rotateY: Math.PI,
  });

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
    streetlightHousing,
    streetlightGlow,
    trees: {
      palm: bakeVertexColored(palm.scene, { centerXZ: true }),
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
  for (const kind of SIGN_KINDS) {
    const s = a.signs[kind];
    if (!s) continue; // tolerated missing zone-sign kit
    s.body.dispose();
    s.faceGeometry?.dispose();
    s.faceMaterial?.map?.dispose();
    s.faceMaterial?.dispose();
  }
  if (a.railBarrier) disposeAll([a.railBarrier.post, a.railBarrier.arm]);
  disposeAll([
    a.signalHousing,
    a.streetlightHousing,
    a.streetlightGlow,
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

const LAMP_ON = {
  red: new THREE.Color(0xff3b30),
  yellow: new THREE.Color(0xffb300),
  green: new THREE.Color(0x30d158),
} as const;
const LAMP_OFF = {
  red: LAMP_ON.red.clone().multiplyScalar(0.1),
  yellow: LAMP_ON.yellow.clone().multiplyScalar(0.1),
  green: LAMP_ON.green.clone().multiplyScalar(0.1),
} as const;

/**
 * Lens colors for a lamp state (doc 62 S1): "dark" = every lens unlit
 * (загаснал светофар); "amberFlashOn"/"amberFlashOff" = the flashing-amber
 * blink pair driven by the runtime's signal clock (the getter alternates the
 * STATE, so the per-lamp change cache below repaints exactly on blink edges —
 * no extra render-side timer, no per-frame writes while steady).
 * Writes into a module-scoped scratch tuple (returned for convenience): blink
 * edges recur at 2 Hz inside useFrame, and the perf law is zero useFrame
 * allocations — callers must consume the tuple before the next call.
 */
const LAMP_COLORS_SCRATCH: [THREE.Color, THREE.Color, THREE.Color] = [
  LAMP_OFF.red,
  LAMP_OFF.yellow,
  LAMP_OFF.green,
];
function lampColorsFor(state: SignalLampState): [THREE.Color, THREE.Color, THREE.Color] {
  const red = state === "red" || state === "redYellow";
  const yellow = state === "yellow" || state === "redYellow" || state === "amberFlashOn";
  const green = state === "green";
  LAMP_COLORS_SCRATCH[0] = red ? LAMP_ON.red : LAMP_OFF.red;
  LAMP_COLORS_SCRATCH[1] = yellow ? LAMP_ON.yellow : LAMP_OFF.yellow;
  LAMP_COLORS_SCRATCH[2] = green ? LAMP_ON.green : LAMP_OFF.green;
  return LAMP_COLORS_SCRATCH;
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
  const lights = world.trafficLights;

  const housing = useMemo(() => {
    const mesh = createInstancedMesh(assets.signalHousing, assets.materials.signalHousing, lights, {
      castShadow: preset.castShadows === "full",
      name: "traffic-light-housings",
    });
    return mesh;
  }, [assets, lights, preset.castShadows]);
  useEffect(() => () => housing.dispose(), [housing]);

  const lamps = useMemo(() => {
    // r 0.13 (was 0.085): the lens must read from a 50+ m approach on the
    // 2.5×-scaled roads — founder R3 "no visible traffic light" (doc 62 S1).
    const geometry = new THREE.SphereGeometry(0.13, 10, 8);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
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

  useFrame(() => {
    const mesh = lampsRef.current;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < lights.length; i++) {
      const light = lights[i]!;
      const state: SignalLampState =
        getSignalPhase?.(light.nodeId, light.approachBearingDeg) ?? "green";
      if (lastPhases.current[i] === state) continue;
      lastPhases.current[i] = state;
      const colors = lampColorsFor(state);
      mesh.setColorAt(i * 3, colors[0]);
      mesh.setColorAt(i * 3 + 1, colors[1]);
      mesh.setColorAt(i * 3 + 2, colors[2]);
      dirty = true;
    }
    if (dirty && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <group name="traffic-lights">
      <primitive object={housing} />
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

  const meshes = useMemo(() => {
    const castShadow = preset.castShadows === "full";
    const out: THREE.InstancedMesh[] = [];
    for (const kind of SIGN_KINDS) {
      const placements = signs.filter((s) => s.kind === kind);
      if (placements.length === 0) continue;
      const a = assets.signs[kind];
      if (!a) continue; // kit missing (tolerated) — skip the kind's posts
      out.push(
        createInstancedMesh(a.body, assets.materials.signBody, placements, {
          castShadow,
          name: `signs-${kind}-body`,
        }),
      );
      if (a.faceGeometry && a.faceMaterial) {
        out.push(
          createInstancedMesh(a.faceGeometry, a.faceMaterial, placements, {
            castShadow: false,
            name: `signs-${kind}-face`,
          }),
        );
      }
    }
    return out;
  }, [assets, signs, preset.castShadows]);
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
// (the traffic-lamp on/off color pattern, LAMP_ON/LAMP_OFF.red).
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
      lampMaterial.color.copy(LAMP_OFF.red);
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
      r.lampMaterial.color.copy(lit ? LAMP_ON.red : LAMP_OFF.red);
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
// Trees (palm + ornamental + leafy_a/b GLBs, bucketed by builder-decided kind)
// ---------------------------------------------------------------------------

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
      palm: [],
      ornamental: [],
      leafyA: [],
      leafyB: [],
    };
    for (const t of kept) buckets[t.kind].push(t);
    return TREE_KINDS.map((kind) =>
      createInstancedMesh(assets.trees[kind], assets.materials.tree, buckets[kind], {
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
          <StreetscapeV2 world={world} assets={assets} preset={preset} night={night} />
        </>
      ) : null}
    </group>
  );
}
