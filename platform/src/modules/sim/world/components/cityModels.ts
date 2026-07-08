/**
 * Kenney "City Kit Commercial" (CC0) building geometry loader — CLIENT ONLY
 * (GLTFLoader needs the DOM). Loads every model in CITY_MODELS, merges each
 * GLB's primitives into one geometry (keeping UVs), and normalises it to unit
 * height with its footprint centred on x/z and base at y=0 — the exact contract
 * the pure placement builder (cityBuildings.ts) assumes when it fits footprints.
 *
 * All models share one small colour-atlas (colormap.png), so the renderer uses
 * a single textured material across every instanced mesh. Loading model mirrors
 * treeModels.ts: a reference-counted module cache that loads + bakes once,
 * shares the results, and disposes them when the last consumer unmounts.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { CITY_MODELS } from "../builders/cityBuildings";
import { mergeSafe } from "./three-helpers";

const BASE_URL = "/sim/city";

export interface CityAssets {
  /** Baked geometries, index === CITY_MODELS index. */
  geometries: THREE.BufferGeometry[];
  /** Shared colour atlas for every model. */
  texture: THREE.Texture;
}

/** Merge a GLB scene's mesh primitives into one geometry, keeping UVs, then
 *  normalise to base y=0, centred x/z, height = 1. */
function bakeBuilding(scene: THREE.Object3D): THREE.BufferGeometry {
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
    if (src.index) g.setIndex(src.index.clone());
    g.applyMatrix4(mesh.matrixWorld);

    // Keep UVs (index into the shared atlas); synth a zero fallback so every
    // part carries the same attribute set (mergeSafe requires consistency).
    const uv = src.getAttribute("uv");
    if (uv) g.setAttribute("uv", uv.clone());
    else g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(posAttr.count * 2), 2));

    const nor = src.getAttribute("normal");
    if (nor) g.setAttribute("normal", nor.clone());
    else g.computeVertexNormals();

    parts.push(g);
  });

  if (parts.length === 0) throw new Error("bakeBuilding: GLB scene has no mesh geometry");

  const merged = mergeSafe(parts, false);
  for (const p of parts) p.dispose();

  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;
  merged.translate(-cx, -bb.min.y, -cz);
  const h = bb.max.y - bb.min.y;
  if (h > 1e-4) merged.scale(1 / h, 1 / h, 1 / h);
  merged.computeBoundingSphere();
  return merged;
}

function loadTexture(): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      `${BASE_URL}/colormap.png`,
      (tex) => {
        // glTF UVs assume flipY=false; the atlas is small colour swatches, so
        // nearest filtering avoids neighbour-swatch bleed.
        tex.flipY = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        resolve(tex);
      },
      undefined,
      (err) => reject(err instanceof Error ? err : new Error("colormap load failed")),
    );
  });
}

function buildAssets(): Promise<CityAssets> {
  const loader = new GLTFLoader();
  const geometries = Promise.all(
    CITY_MODELS.map(
      (m) =>
        new Promise<THREE.BufferGeometry>((resolve, reject) => {
          loader.load(
            `${BASE_URL}/${m.file}.glb`,
            (gltf: GLTF) => {
              try {
                resolve(bakeBuilding(gltf.scene));
              } catch (err) {
                reject(err instanceof Error ? err : new Error(String(err)));
              }
            },
            undefined,
            (err) => reject(err instanceof Error ? err : new Error(`load failed: ${m.file}.glb`)),
          );
        }),
    ),
  );
  return Promise.all([geometries, loadTexture()]).then(([geoms, texture]) => ({
    geometries: geoms,
    texture,
  }));
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
        for (const g of assets.geometries) g.dispose();
        assets.texture.dispose();
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
 * Returns the baked building geometries + shared atlas, or null until they load
 * / on the server. Assets are cache-owned — do NOT dispose them from consumers.
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
