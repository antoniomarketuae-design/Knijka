/**
 * District-kit geometry loader — CLIENT ONLY (GLTFLoader needs the DOM).
 *
 * Loads every model in CITY_MODELS (the authored district kit under
 * public/sim/city-v3: `t_*.glb` towers + `pav_*.glb` retail pavilions,
 * Draco-compressed by the asset pipeline — hence createGltfLoader(), NOT a bare
 * GLTFLoader which throws "no DRACOLoader instance provided"). The v4 kit
 * ships IMAGE-FREE named materials: `bay_grid`/`bay_strip`/`bay_curtain`/
 * `bay_band` (tower shafts) + `trim` (podium/retail/parapet/signage) receive
 * the shared baked facade textures at runtime (CityBuildings wires them from
 * useFacadeTextures BY NAME — one GPU copy district-wide), plus flat
 * `glass_dark` (lobbies), `glass_bronze`/`bronze_metal`/`stone_dark`
 * (pavilions) and `roof_dark`. This loader bakes each GLB into one
 * `{ geometry, material }` group PER material so the renderer can instance
 * them separately and the glass reflects `scene.environment` (set by the
 * scene's <Environment>) via MeshStandardMaterial's envMap sampling.
 *
 * Every group of a model shares one normalisation (computed over the WHOLE
 * model's bbox): base y=0, footprint centred on x/z, height = 1 — the exact
 * contract the pure placement builder (cityBuildings.ts) assumes when it fits
 * footprints, so all of a tower's material groups stay perfectly aligned.
 *
 * Loading model mirrors treeModels.ts: a reference-counted module cache that
 * loads + bakes once, shares the results across every instanced mesh, and
 * disposes them (geometry + material) when the last consumer unmounts.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CITY_MODELS } from "../builders/cityBuildings";
import { createGltfLoader } from "./gltfLoader";
import { mergeSafe } from "./three-helpers";

const BASE_URL = "/sim/city-v3";

/** One bake result per glTF material: geometry + its own PBR material. */
export interface CityMaterialGroup {
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  /** glTF material name (e.g. "glass_dark", "conc_beige", "glass_lit"). */
  name: string;
}

export interface CityAssets {
  /** Per model (index === CITY_MODELS index): its material groups. */
  models: CityMaterialGroup[][];
}

/**
 * Clone a glTF-loaded material (so we own + can tweak/dispose it) and give the
 * glossy glass extra envMap punch so the HDRI reflection reads as real glass.
 * three already builds correct metalness/roughness/emissive from the glTF (incl.
 * KHR_materials_emissive_strength → emissiveIntensity on `glass_lit`/`sign_red`,
 * and KHR_materials_clearcoat on the glass → MeshPhysicalMaterial, a
 * MeshStandardMaterial subclass — clone() keeps it).
 */
function prepMaterial(src: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = src.clone();
  // Reflective glass (glass_dark rough 0.06, glass_bronze 0.07) is very
  // smooth; push its environment reflection so towers mirror the sky/scene.
  // Rebalanced for the golden-hour HDRI (doc 71 §4.4): glass up 1.8 → 2.2
  // (the unclipped sun smears across curtain walls), matte down 1.2 → 1.0
  // (the warm env over-lights concrete otherwise — shells should be lit by
  // the sun/hemisphere rig, not mirror-lit).
  m.envMapIntensity = m.roughness <= 0.12 ? 2.2 : 1.0;
  m.needsUpdate = true;
  return m;
}

/**
 * Bake a tower GLB scene into one `{ geometry, material }` group per material.
 * All groups share a single normalisation over the whole model's bounding box:
 * base y=0, centred on x/z, height = 1.
 */
function bakeTowerGroups(scene: THREE.Object3D): CityMaterialGroup[] {
  scene.updateWorldMatrix(true, true);

  interface RawPart {
    geom: THREE.BufferGeometry;
    material: THREE.MeshStandardMaterial;
  }
  const parts: RawPart[] = [];
  const bbox = new THREE.Box3();
  bbox.makeEmpty();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const posAttr = src.getAttribute("position");
    if (!posAttr) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", posAttr.clone());
    if (src.index) g.setIndex(src.index.clone());
    const nor = src.getAttribute("normal");
    if (nor) g.setAttribute("normal", nor.clone());
    const uv = src.getAttribute("uv");
    if (uv) g.setAttribute("uv", uv.clone());
    // COLOR_0: per-face facade tints (beige/grey concrete, cream/white
    // parapets) multiplied over the NEUTRAL baked textures — the v4 kit's
    // per-system variety channel. Dropping it would grey out the district.
    const col = src.getAttribute("color");
    if (col) g.setAttribute("color", col.clone());
    // Bake the node's world transform into the positions/normals.
    g.applyMatrix4(mesh.matrixWorld);
    if (!nor) g.computeVertexNormals();
    // Synth a zero UV fallback so a material group with mixed primitives keeps a
    // consistent attribute set (mergeSafe requires it).
    if (!g.getAttribute("uv")) {
      g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2));
    }

    g.computeBoundingBox();
    if (g.boundingBox) bbox.union(g.boundingBox);

    const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    parts.push({ geom: g, material: mat as THREE.MeshStandardMaterial });
  });

  if (parts.length === 0) throw new Error("bakeTowerGroups: GLB scene has no mesh geometry");

  // Whole-model normalisation shared by every group.
  const cx = (bbox.min.x + bbox.max.x) / 2;
  const cz = (bbox.min.z + bbox.max.z) / 2;
  const minY = bbox.min.y;
  const h = bbox.max.y - bbox.min.y;
  const inv = h > 1e-4 ? 1 / h : 1;

  // Group parts by their (shared) material instance.
  const groups = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
  for (const p of parts) {
    let list = groups.get(p.material);
    if (!list) {
      list = [];
      groups.set(p.material, list);
    }
    list.push(p.geom);
  }

  const out: CityMaterialGroup[] = [];
  for (const [material, geoms] of groups) {
    const merged = mergeSafe(geoms, false);
    for (const g of geoms) g.dispose();
    merged.translate(-cx, -minY, -cz);
    if (h > 1e-4) merged.scale(inv, inv, inv);
    merged.computeBoundingSphere();
    out.push({ geometry: merged, material: prepMaterial(material), name: material.name ?? "" });
  }
  return out;
}

function buildAssets(): Promise<CityAssets> {
  const loader = createGltfLoader();
  return Promise.all(
    CITY_MODELS.map(
      (m) =>
        new Promise<CityMaterialGroup[]>((resolve, reject) => {
          loader.load(
            `${BASE_URL}/${m.file}.glb`,
            (gltf: GLTF) => {
              try {
                resolve(bakeTowerGroups(gltf.scene));
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(`load failed: ${m.file}.glb`)),
          );
        }),
    ),
  ).then((models) => ({ models }));
}

// ---------------------------------------------------------------------------
// Reference-counted module cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  assets: CityAssets | null;
  promise: Promise<CityAssets>;
  refs: number;
}

let entry: CacheEntry | null = null;

function ensureEntry(): CacheEntry {
  if (!entry) {
    const promise = buildAssets().then((assets) => {
      if (entry) entry.assets = assets;
      return assets;
    });
    entry = { assets: null, promise, refs: 0 };
  }
  return entry;
}

function acquire(): Promise<CityAssets> {
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
    e.promise
      .then((assets) => {
        for (const groups of assets.models) {
          for (const g of groups) {
            g.geometry.dispose();
            g.material.dispose();
          }
        }
      })
      .catch(() => {
        /* load failed — nothing to dispose */
      });
  }
}

/** Warm the cache before any <CityBuildings/> mounts (no ref held). */
export function preloadCityModels(): void {
  if (typeof window === "undefined") return;
  ensureEntry();
}

/**
 * Returns the baked per-material tower groups, or null until they load / on the
 * server. Assets are cache-owned — do NOT dispose them from consumers.
 */
export function useCityModels(): CityAssets | null {
  const [assets, setAssets] = useState<CityAssets | null>(null);
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
