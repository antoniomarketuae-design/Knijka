/**
 * Real CC0 PBR texture sets (asphalt / concrete / grass) — CLIENT ONLY
 * (THREE.TextureLoader needs the DOM Image API). Files live under
 * public/sim/textures/{road,sidewalk,ground} and are the "free foundation"
 * upgrade from the procedural canvas textures.
 *
 * Loading model: a module-level, reference-counted cache. Each set is loaded
 * exactly once and SHARED across every mesh that uses it (road + junction
 * both consume the asphalt set), so the GPU upload happens once. Consumers
 * acquire on mount and release on unmount; when the last consumer leaves the
 * textures are disposed. Guarded for SSR — nothing touches the loader unless
 * `window` exists.
 *
 * Tiling: the builder gives road/junction planar UVs of meters/7 and terrain
 * meters/8 (see roads.ts / terrain.ts); sidewalks use a normalised 0..1
 * cross-section with V = metres/2. `repeat` below is therefore chosen so each
 * set tiles at a believable real-world scale (documented per group).
 *
 * aoMap channel: in three r0.185 Texture.channel defaults to 0, which maps to
 * the geometry's `uv` attribute — the SAME UVs the colour/normal/roughness
 * maps use. So the tiling detail-AO needs no separate uv2 set; it just tiles
 * with the surface, which is exactly what a tiling PBR set wants.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";

export type PbrGroup = "road" | "sidewalk" | "ground";

export interface PbrTextureSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
  /** null for concrete/sidewalk (no AO map shipped — treat AO as 1.0). */
  aoMap: THREE.Texture | null;
}

interface GroupConfig {
  /** Directory under public/sim/textures. */
  dir: string;
  /** true when an ao.png is present. */
  hasAo: boolean;
  /** UV repeat applied to every map in the set (see per-group notes). */
  repeat: [number, number];
}

const GROUPS: Record<PbrGroup, GroupConfig> = {
  // Asphalt: UV = metres/7, repeat 2 -> a full tile every ~3.5 m of road.
  road: { dir: "road", hasAo: true, repeat: [2, 2] },
  // Concrete: U is the 0..1 cross-section, V = metres/2. repeat [2,2] gives
  // ~1.2 m across the 2 m walkway and ~1 m along its length.
  sidewalk: { dir: "sidewalk", hasAo: false, repeat: [2, 2] },
  // Grass: UV = metres/8, repeat 3 -> a full tile every ~2.7 m of terrain.
  ground: { dir: "ground", hasAo: true, repeat: [3, 3] },
};

const BASE_URL = "/sim/textures";

function configureTexture(
  tex: THREE.Texture,
  srgb: boolean,
  repeat: [number, number],
): THREE.Texture {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4; // sensible default; usePbrSet() raises it per quality
  tex.needsUpdate = true;
  return tex;
}

function loadOne(
  loader: THREE.TextureLoader,
  url: string,
  srgb: boolean,
  repeat: [number, number],
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => resolve(configureTexture(tex, srgb, repeat)),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(`load failed: ${url}`)),
    );
  });
}

function buildSet(group: PbrGroup): Promise<PbrTextureSet> {
  const cfg = GROUPS[group];
  const base = `${BASE_URL}/${cfg.dir}`;
  const loader = new THREE.TextureLoader();
  return Promise.all([
    loadOne(loader, `${base}/color.png`, true, cfg.repeat),
    loadOne(loader, `${base}/normal.png`, false, cfg.repeat),
    loadOne(loader, `${base}/roughness.png`, false, cfg.repeat),
    cfg.hasAo
      ? loadOne(loader, `${base}/ao.png`, false, cfg.repeat)
      : Promise.resolve<THREE.Texture | null>(null),
  ]).then(([map, normalMap, roughnessMap, aoMap]) => ({
    map,
    normalMap,
    roughnessMap,
    aoMap,
  }));
}

// ---------------------------------------------------------------------------
// Reference-counted module cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  set: PbrTextureSet | null;
  promise: Promise<PbrTextureSet>;
  refs: number;
}

const cache = new Map<PbrGroup, CacheEntry>();

function texturesOf(set: PbrTextureSet): THREE.Texture[] {
  const list = [set.map, set.normalMap, set.roughnessMap];
  if (set.aoMap) list.push(set.aoMap);
  return list;
}

function acquire(group: PbrGroup): Promise<PbrTextureSet> {
  let entry = cache.get(group);
  if (!entry) {
    const promise = buildSet(group).then((set) => {
      const e = cache.get(group);
      if (e) e.set = set;
      return set;
    });
    entry = { set: null, promise, refs: 0 };
    cache.set(group, entry);
  }
  entry.refs += 1;
  return entry.promise;
}

function release(group: PbrGroup): void {
  const entry = cache.get(group);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    cache.delete(group);
    // Dispose once the (possibly still in-flight) load settles.
    entry.promise
      .then((set) => {
        for (const tex of texturesOf(set)) tex.dispose();
      })
      .catch(() => {
        /* load failed — nothing to dispose */
      });
  }
}

// ---------------------------------------------------------------------------
// React hook
// ---------------------------------------------------------------------------

/**
 * Loads (once, cached) the PBR set for `group` and returns it, or null until
 * it resolves / on the server. Callers should fall back to their procedural
 * texture while null. `anisotropy` (from the quality preset) is applied to the
 * shared textures; the CC0 sets look best at 4-8.
 */
export function usePbrSet(group: PbrGroup, anisotropy: number): PbrTextureSet | null {
  const [set, setSet] = useState<PbrTextureSet | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    acquire(group).then((s) => {
      if (active) setSet(s);
    });
    return () => {
      active = false;
      setSet(null);
      release(group);
    };
  }, [group]);

  useEffect(() => {
    if (!set) return;
    const a = Math.min(8, Math.max(4, anisotropy));
    for (const tex of texturesOf(set)) {
      if (tex.anisotropy !== a) {
        tex.anisotropy = a;
        tex.needsUpdate = true;
      }
    }
  }, [set, anisotropy]);

  return set;
}
