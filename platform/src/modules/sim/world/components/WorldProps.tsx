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
 * Draw calls (WorldProps only; CityBuildings is separate + chunked):
 *   signals 2 (housing + lamps) + signs 8 (4 kinds × body+face)
 *   + streetlights 2 (housing + glow) + trees 2 (palm + ornamental)
 *   + furniture 4 (bench + bollard + trash_bin + planter) = 18  (was 13).
 * All fixed + instanced; low tier decimates trees via preset.treeFraction.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SignalPhase } from "../../contracts";
import type { SignKind, StaticTransform, TreePlacement, WorldGeometry } from "../types";
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

/** sim SignKind → authored 3D sign GLB (correct Bulgarian face baked in). */
const SIGN_GLB: Record<SignKind, string> = {
  stop: "sign_stop",
  giveWay: "sign_give_way",
  limit50: "sign_speed_limit_50",
  roundabout: "sign_roundabout",
};
const SIGN_KINDS = Object.keys(SIGN_GLB) as SignKind[];

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
  const dx = opts.centerXZ ? (bb.min.x + bb.max.x) / 2 : 0;
  const dz = opts.centerXZ ? (bb.min.z + bb.max.z) / 2 : 0;
  const dy = bb.min.y; // base to y=0
  if (dx || dy || dz) merged.translate(-dx, -dy, -dz);
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Extract the sign's textured face primitive (material name starts with
 * "face_") as its own geometry + a cloned material that keeps the baked webp
 * face (alphaMode MASK → alphaTest 0.5). Same Y-rotation as the body so they
 * stay aligned.
 */
function bakeSignFace(
  scene: THREE.Object3D,
  rotateY: number,
): { geometry: THREE.BufferGeometry; material: THREE.MeshStandardMaterial } {
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

  if (!out) throw new Error("bakeSignFace: no face_* primitive found");
  return out;
}

// ---------------------------------------------------------------------------
// Prop asset cache (reference-counted, mirrors cityModels.ts)
// ---------------------------------------------------------------------------

interface SignAsset {
  body: THREE.BufferGeometry;
  faceGeometry: THREE.BufferGeometry;
  faceMaterial: THREE.MeshStandardMaterial;
}

interface PropAssets {
  signs: Record<SignKind, SignAsset>;
  signalHousing: THREE.BufferGeometry;
  streetlightHousing: THREE.BufferGeometry;
  streetlightGlow: THREE.BufferGeometry;
  palm: THREE.BufferGeometry;
  ornamental: THREE.BufferGeometry;
  furniture: {
    bench: THREE.BufferGeometry;
    bollard: THREE.BufferGeometry;
    trashBin: THREE.BufferGeometry;
    planter: THREE.BufferGeometry;
  };
  /** Shared vertex-colour materials (one per prop family). */
  materials: {
    signBody: THREE.MeshStandardMaterial;
    signalHousing: THREE.MeshStandardMaterial;
    streetSteel: THREE.MeshStandardMaterial;
    tree: THREE.MeshStandardMaterial;
    furniture: THREE.MeshStandardMaterial;
  };
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
  ]);

  const bakeSign = (gltf: GLTF): SignAsset => {
    const body = bakeVertexColored(gltf.scene, {
      include: (n) => !n.startsWith("face_"),
      rotateY: Math.PI,
    });
    const face = bakeSignFace(gltf.scene, Math.PI);
    return { body, faceGeometry: face.geometry, faceMaterial: face.material };
  };

  const signs: Record<SignKind, SignAsset> = {
    stop: bakeSign(stop),
    giveWay: bakeSign(giveWay),
    limit50: bakeSign(limit50),
    roundabout: bakeSign(roundabout),
  };

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

  return {
    signs,
    signalHousing,
    streetlightHousing,
    streetlightGlow,
    palm: bakeVertexColored(palm.scene, { centerXZ: true }),
    ornamental: bakeVertexColored(ornamental.scene, { centerXZ: true }),
    furniture: {
      bench: bakeVertexColored(bench.scene, { centerXZ: true }),
      bollard: bakeVertexColored(bollard.scene, { centerXZ: true }),
      trashBin: bakeVertexColored(trashBin.scene, { centerXZ: true }),
      planter: bakeVertexColored(planter.scene, { centerXZ: true }),
    },
    materials: makeSharedMaterials(),
  };
}

function disposePropAssets(a: PropAssets): void {
  for (const kind of SIGN_KINDS) {
    a.signs[kind].body.dispose();
    a.signs[kind].faceGeometry.dispose();
    a.signs[kind].faceMaterial.map?.dispose();
    a.signs[kind].faceMaterial.dispose();
  }
  disposeAll([
    a.signalHousing,
    a.streetlightHousing,
    a.streetlightGlow,
    a.palm,
    a.ornamental,
    a.furniture.bench,
    a.furniture.bollard,
    a.furniture.trashBin,
    a.furniture.planter,
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

function lampColorsFor(phase: SignalPhase): [THREE.Color, THREE.Color, THREE.Color] {
  const red = phase === "red" || phase === "redYellow";
  const yellow = phase === "yellow" || phase === "redYellow";
  const green = phase === "green";
  return [
    red ? LAMP_ON.red : LAMP_OFF.red,
    yellow ? LAMP_ON.yellow : LAMP_OFF.yellow,
    green ? LAMP_ON.green : LAMP_OFF.green,
  ];
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
  getSignalPhase?: (signalNodeId: string) => SignalPhase;
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
    const geometry = new THREE.SphereGeometry(0.085, 10, 8);
    const material = new THREE.MeshBasicMaterial({ toneMapped: false });
    const mesh = createOffsetInstancedMesh(geometry, material, lights, LAMP_OFFSETS);
    mesh.name = "traffic-light-lamps";
    const initial = lampColorsFor("green");
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
  const lastPhases = useRef<(SignalPhase | null)[]>([]);
  useEffect(() => {
    lastPhases.current = new Array<SignalPhase | null>(lights.length).fill(null);
  }, [lights, lamps]);

  useFrame(() => {
    const mesh = lampsRef.current;
    if (!mesh) return;
    let dirty = false;
    for (let i = 0; i < lights.length; i++) {
      const phase: SignalPhase = getSignalPhase?.(lights[i]!.nodeId) ?? "green";
      if (lastPhases.current[i] === phase) continue;
      lastPhases.current[i] = phase;
      const colors = lampColorsFor(phase);
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
      out.push(
        createInstancedMesh(a.body, assets.materials.signBody, placements, {
          castShadow,
          name: `signs-${kind}-body`,
        }),
      );
      out.push(
        createInstancedMesh(a.faceGeometry, a.faceMaterial, placements, {
          castShadow: false,
          name: `signs-${kind}-face`,
        }),
      );
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
// Trees (palm + ornamental GLBs, mixed deterministically)
// ---------------------------------------------------------------------------

/** Deterministic 2-way bucket folded with a hash of the (already deterministic)
 *  world position, so both models are used and placement stays reproducible. */
function isPalm(t: TreePlacement): boolean {
  const hx = Math.imul(Math.floor(t.position[0]), 73856093);
  const hz = Math.imul(Math.floor(t.position[2]), 19349663);
  return ((t.variant + (Math.abs(hx ^ hz) % 2)) % 2) === 0;
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
    const palm: TreePlacement[] = [];
    const orn: TreePlacement[] = [];
    for (const t of kept) (isPalm(t) ? palm : orn).push(t);
    return [
      createInstancedMesh(assets.palm, assets.materials.tree, palm, { castShadow, name: "trees-palm" }),
      createInstancedMesh(assets.ornamental, assets.materials.tree, orn, {
        castShadow,
        name: "trees-ornamental",
      }),
    ];
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

export function WorldPropsGroup({
  world,
  preset,
  night,
  getSignalPhase,
}: {
  world: WorldGeometry;
  preset: QualityPreset;
  night: boolean;
  getSignalPhase?: (signalNodeId: string) => SignalPhase;
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
          <Streetlights world={world} assets={assets} preset={preset} night={night} />
          <Trees world={world} assets={assets} preset={preset} />
          <Furniture world={world} assets={assets} preset={preset} />
        </>
      ) : null}
    </group>
  );
}
