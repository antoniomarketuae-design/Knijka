/**
 * Real low-poly tree geometry from the Kenney CC0 GLBs (public/sim/veg) —
 * CLIENT ONLY (GLTFLoader needs the DOM). Replaces the procedural icosahedron
 * "blob" trees.
 *
 * Each GLB is a single mesh split into 2-3 solid-colour primitives (trunk /
 * leaves / detail), with no textures. To render them all as ONE instanced
 * draw call per variant we bake each primitive's glTF baseColorFactor into a
 * vertex-colour attribute and merge the primitives into a single geometry.
 * glTF baseColorFactor is linear and three treats vertex colours as linear,
 * so the colour copies straight across.
 *
 * Each baked geometry is normalised so its base sits at y=0, it is centred on
 * x/z, and its height equals TARGET_HEIGHT_M[variant]. The deterministic
 * per-instance scale jitter (0.8-1.3, from the builder) then multiplies that,
 * landing trees around ~4-8 m tall.
 *
 * Loading model mirrors pbrTextures.ts: a reference-counted module cache that
 * loads + bakes once, shares the geometries across all instanced meshes, and
 * disposes them when the last consumer unmounts.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeSafe } from "./three-helpers";

/** GLB basenames under public/sim/veg — index === tree variant/model index. */
export const TREE_MODEL_FILES = [
  "tree_round",
  "tree_oak",
  "tree_pine",
  "tree_detailed",
] as const;

/** Normalised base height per model (metres) before per-instance jitter. */
const TARGET_HEIGHT_M = [5.0, 6.0, 6.5, 5.5];

const BASE_URL = "/sim/veg";

/**
 * Merge every mesh primitive of a loaded GLB scene into a single vertex-
 * coloured geometry, then normalise it to sit on y=0 at `targetHeight` tall.
 */
function bakeModel(scene: THREE.Object3D, targetHeight: number): THREE.BufferGeometry {
  scene.updateWorldMatrix(true, true);
  const parts: THREE.BufferGeometry[] = [];

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.geometry;
    const posAttr = src.getAttribute("position");
    if (!posAttr) return;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", posAttr.clone());
    const norAttr = src.getAttribute("normal");
    if (norAttr) g.setAttribute("normal", norAttr.clone());
    if (src.index) g.setIndex(src.index.clone());
    // Bake the node's world transform into the positions/normals.
    g.applyMatrix4(mesh.matrixWorld);
    if (!norAttr) g.computeVertexNormals();

    // Bake the material's base colour (linear) into a vertex-colour attribute.
    const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
    const color = (Array.isArray(mat) ? mat[0]?.color : mat?.color) ?? new THREE.Color(0xffffff);
    const count = g.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    parts.push(g);
  });

  if (parts.length === 0) throw new Error("bakeModel: GLB scene has no mesh geometry");

  const merged = mergeSafe(parts, false);
  for (const p of parts) p.dispose();

  // Normalise: base to y=0, centred on x/z, scaled to the target height.
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  merged.translate(-cx, -bb.min.y, -cz);
  const h = bb.max.y - bb.min.y;
  if (h > 1e-4) {
    const f = targetHeight / h;
    merged.scale(f, f, f);
  }
  merged.computeBoundingSphere();
  return merged;
}

function buildModels(): Promise<THREE.BufferGeometry[]> {
  const loader = new GLTFLoader();
  return Promise.all(
    TREE_MODEL_FILES.map(
      (name, i) =>
        new Promise<THREE.BufferGeometry>((resolve, reject) => {
          loader.load(
            `${BASE_URL}/${name}.glb`,
            (gltf: GLTF) => {
              try {
                resolve(bakeModel(gltf.scene, TARGET_HEIGHT_M[i]!));
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(`load failed: ${name}.glb`)),
          );
        }),
    ),
  );
}

// ---------------------------------------------------------------------------
// Reference-counted module cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  models: THREE.BufferGeometry[] | null;
  promise: Promise<THREE.BufferGeometry[]>;
  refs: number;
}

let entry: CacheEntry | null = null;

function ensureEntry(): CacheEntry {
  if (!entry) {
    const promise = buildModels().then((models) => {
      if (entry) entry.models = models;
      return models;
    });
    entry = { models: null, promise, refs: 0 };
  }
  return entry;
}

function acquire(): Promise<THREE.BufferGeometry[]> {
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
      .then((models) => {
        for (const g of models) g.dispose();
      })
      .catch(() => {
        /* load failed — nothing to dispose */
      });
  }
}

/** Warm the cache before any <Trees/> mounts (no ref held). */
export function preloadTreeModels(): void {
  if (typeof window === "undefined") return;
  ensureEntry();
}

/**
 * Returns the 4 baked, normalised tree geometries (index === model index), or
 * null until they load / on the server. Geometries are cache-owned — do NOT
 * dispose them from the consumer.
 */
export function useTreeModels(): THREE.BufferGeometry[] | null {
  const [models, setModels] = useState<THREE.BufferGeometry[] | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    acquire().then((m) => {
      if (active) setModels(m);
    });
    return () => {
      active = false;
      setModels(null);
      release();
    };
  }, []);
  return models;
}
