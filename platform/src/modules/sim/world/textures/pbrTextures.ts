/**
 * Real CC0 PBR texture sets (asphalt / concrete / grass) — CLIENT ONLY
 * (THREE.TextureLoader / KTX2Loader need the DOM / a WebGL context). Files live
 * under public/sim/textures/{road,sidewalk,ground} and are the "free
 * foundation" upgrade from the procedural canvas textures.
 *
 * Format (doc 71 §2.1/§13 — the VRAM budget enabler): KTX2 when
 * textures/manifest.json declares `format:"ktx2"` (ETC1S albedo/roughness/ao,
 * UASTC normals; transcoded to a GPU-compressed format at load so the maps stay
 * compressed in VRAM — ~6× less than the RGBA8 the PNGs decode to). The source
 * PNGs stay on disk as the FALLBACK: a map with no KTX2 in the manifest, or a
 * KTX2 that fails to load at runtime, transparently loads its .png. No manifest
 * (or a non-ktx2 one) → the whole set loads PNGs exactly as before. Mirrors the
 * facade loader (facadeTextures.ts) — KTX2Loader + the wasm transcoder in
 * public/basis/.
 *
 * COLORSPACE + WRAP are set explicitly here and are AUTHORITATIVE regardless of
 * format (a lost sRGB flag washes/darkens the ground; a lost RepeatWrapping
 * shreds the tiling): albedo sRGB, normal/roughness/ao linear; wrapS/wrapT
 * RepeatWrapping with the COMPUTED `repeat` (see below). The KTX2 files carry
 * their own mip chain (toktx --genmipmap) — WebGL can't regenerate mips for a
 * compressed format, so `generateMipmaps` is left off for KTX2 and on for PNG.
 *
 * Loading model: a module-level, reference-counted cache. Each set is loaded
 * exactly once and SHARED across every mesh that uses it (road + junction
 * both consume the asphalt set), so the GPU upload happens once. Consumers
 * acquire on mount and release on unmount; when the last consumer leaves the
 * textures are disposed. Guarded for SSR — nothing touches the loader unless
 * `window` exists.
 *
 * Tiling — the texel-scale contract (doc 71 §4.4, lane 05 §3):
 *
 *     repeat = uvMetresPerUnit / textureRealWorldMetres
 *
 * The builder gives road/junction planar UVs of meters/7 and terrain
 * meters/8 (see roads.ts / terrain.ts); sidewalks use a normalised 0..1
 * cross-section with V = metres/2. Each group declares the REAL metres its
 * texture photograph covers (`realWorldSizeM`, from the source page/API) and
 * the metres one UV unit spans on the consuming meshes (`uvMetresPerUnit`) —
 * the repeat is COMPUTED, so swapping textures can never silently break
 * world scale again (the old hand-tuned repeats had grass ~2x stretched).
 *
 * aoMap channel: in three r0.185 Texture.channel defaults to 0, which maps to
 * the geometry's `uv` attribute — the SAME UVs the colour/normal/roughness
 * maps use. So the tiling detail-AO needs no separate uv2 set; it just tiles
 * with the surface, which is exactly what a tiling PBR set wants.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

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
  /** Real-world metres one texture tile covers [x, y] (source page/API). */
  realWorldSizeM: [number, number];
  /** Metres of surface represented by ONE UV unit on the consumers [u, v]. */
  uvMetresPerUnit: [number, number];
}

const GROUPS: Record<PbrGroup, GroupConfig> = {
  // Asphalt031 (ambientCG) publishes NO physical size (API dimension 0) —
  // adopt doc 71 §4.4's ruling for road-asphalt photo tiles: 3 m. Road and
  // junction UVs are planar metres/7, so repeat = 7/3 ≈ 2.33 (a full tile
  // every 3 m of road). Was hand-tuned [2,2] = tiles every 3.5 m (~17%
  // oversized aggregate).
  road: {
    dir: "road",
    hasAo: true,
    realWorldSizeM: [3, 3],
    uvMetresPerUnit: [7, 7],
  },
  // Concrete034 (ambientCG API): the photographed patch is 1.10 x 0.55 m.
  // Sidewalk strips: U is the 0..1 cross-section (the 0.1..0.9 walkway band
  // spans SIDEWALK_WIDTH_M 3.5 m -> ~4.375 m per U unit), V = metres/2.
  // repeat = [4.375/1.1, 2/0.55] ≈ [3.98, 3.64] -> true-scale square texels
  // on the strips. Was [2,2]: ~2x stretched across AND along. The paved
  // terrain (courtyards) shares this set at planar metres/4 — its tile
  // comes out ~1.0 x 1.1 m in-world (V stretched 2x vs the 0.55 m photo,
  // invisible on this featureless smooth plaster; strips win the trade —
  // they fill the cockpit view).
  sidewalk: {
    dir: "sidewalk",
    hasAo: false,
    realWorldSizeM: [1.1, 0.55],
    uvMetresPerUnit: [3.5 / 0.8, 2],
  },
  // Grass004 (ambientCG API): 1.40 x 1.40 m. Terrain UVs are planar
  // metres/8 -> repeat = 8/1.4 ≈ 5.71 (a tile every 1.4 m). Was [3,3] =
  // tiles every 2.67 m — the ~2x-stretched "mushy lawn" texel-scale bug.
  ground: {
    dir: "ground",
    hasAo: true,
    realWorldSizeM: [1.4, 1.4],
    uvMetresPerUnit: [8, 8],
  },
};

/** repeat = uvMetresPerUnit / textureRealWorldMetres (per axis). */
function repeatOf(cfg: GroupConfig): [number, number] {
  return [
    cfg.uvMetresPerUnit[0] / cfg.realWorldSizeM[0],
    cfg.uvMetresPerUnit[1] / cfg.realWorldSizeM[1],
  ];
}

const BASE_URL = "/sim/textures";
/** basis_transcoder.{js,wasm} copied from three/examples/jsm/libs/basis. */
const BASIS_TRANSCODER_PATH = "/basis/";

type MapName = "color" | "normal" | "roughness" | "ao";

interface Manifest {
  version: number;
  format: "ktx2" | "png";
  /** group -> { map -> file path relative to BASE_URL }. */
  sets: Record<string, Partial<Record<MapName, string>>>;
}

/**
 * colorSpace + wrap are AUTHORITATIVE here (doc 71 §3 CRITICAL): albedo sRGB,
 * everything else linear; RepeatWrapping + the computed tiling repeat. Applied
 * identically to KTX2 and PNG textures so the swap is invisible. `compressed`
 * (KTX2) textures carry a baked mip chain — WebGL can't regenerate mips for a
 * compressed format, so leave generateMipmaps off and trust KTX2Loader's
 * mip-aware minFilter; PNG textures generate mips at upload as before.
 */
function configureTexture(
  tex: THREE.Texture,
  srgb: boolean,
  repeat: [number, number],
  compressed: boolean,
): THREE.Texture {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter; // trilinear over the mip chain
  if (!compressed) tex.generateMipmaps = true; // KTX2 ships its own mips
  tex.anisotropy = 4; // sensible default; usePbrSet() raises it per quality
  tex.needsUpdate = true;
  return tex;
}

function loadPng(
  loader: THREE.TextureLoader,
  url: string,
  srgb: boolean,
  repeat: [number, number],
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => resolve(configureTexture(tex, srgb, repeat, false)),
      undefined,
      (err) => reject(err instanceof Error ? err : new Error(`load failed: ${url}`)),
    );
  });
}

/** Load a KTX2 map; on any load/transcode error fall back to the source PNG. */
function loadKtx2(
  ktx2: KTX2Loader,
  pngLoader: THREE.TextureLoader,
  ktx2Url: string,
  pngUrl: string,
  srgb: boolean,
  repeat: [number, number],
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    ktx2.load(
      ktx2Url,
      (tex) => resolve(configureTexture(tex, srgb, repeat, true)),
      undefined,
      () => {
        // KTX2 missing / corrupt / untranscodable — fall back to the PNG.
        loadPng(pngLoader, pngUrl, srgb, repeat).then(resolve, reject);
      },
    );
  });
}

// Manifest is shared across all three groups — fetch it once.
let manifestPromise: Promise<Manifest | null> | null = null;
function loadManifest(): Promise<Manifest | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${BASE_URL}/manifest.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
      .then((m) => (m && m.format === "ktx2" ? m : null))
      .catch(() => null); // no manifest / not ktx2 -> PNG path
  }
  return manifestPromise;
}

function buildSet(group: PbrGroup, gl: THREE.WebGLRenderer): Promise<PbrTextureSet> {
  const cfg = GROUPS[group];
  const base = `${BASE_URL}/${cfg.dir}`;
  const repeat = repeatOf(cfg);
  const pngLoader = new THREE.TextureLoader();

  return loadManifest().then((manifest) => {
    const entry = manifest?.sets?.[group];
    const ktx2 = entry
      ? new KTX2Loader().setTranscoderPath(BASIS_TRANSCODER_PATH).detectSupport(gl)
      : null;

    const loadMap = (map: MapName, srgb: boolean): Promise<THREE.Texture> => {
      const pngUrl = `${base}/${map}.png`;
      const ktx2File = entry?.[map];
      return ktx2 && ktx2File
        ? loadKtx2(ktx2, pngLoader, `${BASE_URL}/${ktx2File}`, pngUrl, srgb, repeat)
        : loadPng(pngLoader, pngUrl, srgb, repeat);
    };

    return Promise.all([
      loadMap("color", true), // sRGB albedo
      loadMap("normal", false), // linear
      loadMap("roughness", false), // linear
      cfg.hasAo ? loadMap("ao", false) : Promise.resolve<THREE.Texture | null>(null),
    ]).then(([map, normalMap, roughnessMap, aoMap]) => {
      ktx2?.dispose();
      return { map, normalMap, roughnessMap, aoMap };
    });
  });
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

function acquire(group: PbrGroup, gl: THREE.WebGLRenderer): Promise<PbrTextureSet> {
  let entry = cache.get(group);
  if (!entry) {
    const promise = buildSet(group, gl).then((set) => {
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
 * shared textures; the CC0 sets look best at 4-8. `gl` (from `useThree`) is
 * needed to detect the GPU's transcode-target formats for the KTX2 path.
 */
export function usePbrSet(
  group: PbrGroup,
  anisotropy: number,
  gl: THREE.WebGLRenderer,
): PbrTextureSet | null {
  const [set, setSet] = useState<PbrTextureSet | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    acquire(group, gl).then((s) => {
      if (active) setSet(s);
    });
    return () => {
      active = false;
      setSet(null);
      release(group);
    };
  }, [group, gl]);

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
