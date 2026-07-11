/**
 * Baked facade texture sets — CLIENT ONLY. The district-kit GLBs
 * (public/sim/city-v3) ship WITHOUT embedded images; these five shared sets
 * (bay_grid / bay_strip / bay_curtain / bay_band towers + the trim atlas)
 * are the single GPU copy, wired onto materials BY NAME in CityBuildings and
 * onto the 238 facade prisms in StaticWorld. Authored by
 * tools/blender/facade_gen.mjs (procedural Node/sharp raster: window grid +
 * real recess normals + AO + lit-window emissive), packed by
 * tools/glb/pack_textures.mjs.
 *
 * Format follows textures/manifest.json: "webp" today, "ktx2" automatically
 * once KTX-Software lands and the packer re-runs (ETC1S color / UASTC
 * normals; KTX2Loader transcodes with the wasm transcoder in public/basis/).
 *
 * Conventions:
 *  - flipY = false on every map — the tower GLB UVs are glTF-convention
 *    (v = 0 at image top); the prism builder emits negated V so the SAME
 *    textures serve both (see buildings.ts).
 *  - color/emissive sRGB; normal/orm linear. orm packs R=AO G=rough B=metal
 *    (three's aoMap/roughnessMap/metalnessMap read exactly those channels, so
 *    one texture fills three slots).
 *  - RepeatWrapping + anisotropy (doc 71 §4.5: grazing street views).
 *
 * Loading model mirrors pbrTextures.ts: module-level ref-counted cache, one
 * load + GPU upload shared by every consumer, disposed with the last one.
 * Returns null while loading / on the server / when the manifest is absent —
 * consumers keep their procedural fallback.
 */

import { useEffect, useState } from "react";
import * as THREE from "three";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";

export type FacadeSetName = "bay_grid" | "bay_strip" | "bay_curtain" | "bay_band" | "trim";

export interface FacadeTextureSet {
  color: THREE.Texture;
  normal: THREE.Texture;
  /** R=AO, G=roughness, B=metalness — assign to aoMap+roughnessMap+metalnessMap. */
  orm: THREE.Texture;
  emissive: THREE.Texture;
}

export type FacadeTextures = Record<FacadeSetName, FacadeTextureSet>;

const BASE_URL = "/sim/city-v3/textures";
/** basis_transcoder.{js,wasm} copied from three/examples/jsm/libs/basis. */
const BASIS_TRANSCODER_PATH = "/basis/";

const SET_NAMES: FacadeSetName[] = ["bay_grid", "bay_strip", "bay_curtain", "bay_band", "trim"];
const MAP_NAMES = ["color", "normal", "orm", "emissive"] as const;
type MapName = (typeof MAP_NAMES)[number];
const SRGB_MAPS: ReadonlySet<string> = new Set(["color", "emissive"]);

interface Manifest {
  version: number;
  format: "webp" | "ktx2" | "png";
  sets: Record<string, Partial<Record<MapName, string>>>;
}

function configure(tex: THREE.Texture, srgb: boolean, anisotropy: number): THREE.Texture {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.flipY = false; // glTF UV convention (tower GLBs); prisms emit negated V
  tex.anisotropy = anisotropy;
  tex.needsUpdate = true;
  return tex;
}

function buildAll(gl: THREE.WebGLRenderer, anisotropy: number): Promise<FacadeTextures | null> {
  return fetch(`${BASE_URL}/manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
    .then((manifest) => {
      if (!manifest) return null;

      let ktx2: KTX2Loader | null = null;
      let texLoader: THREE.TextureLoader | null = null;
      if (manifest.format === "ktx2") {
        ktx2 = new KTX2Loader()
          .setTranscoderPath(BASIS_TRANSCODER_PATH)
          .detectSupport(gl);
      } else {
        texLoader = new THREE.TextureLoader();
      }

      const loadOne = (file: string, srgb: boolean): Promise<THREE.Texture> =>
        new Promise((resolve, reject) => {
          const url = `${BASE_URL}/${file}`;
          const onLoad = (t: THREE.Texture) => resolve(configure(t, srgb, anisotropy));
          const onErr = (err: unknown) =>
            reject(err instanceof Error ? err : new Error(`load failed: ${url}`));
          if (ktx2) ktx2.load(url, onLoad, undefined, onErr);
          else texLoader!.load(url, onLoad, undefined, onErr);
        });

      return Promise.all(
        SET_NAMES.map((set) => {
          const entry = manifest.sets[set];
          if (!entry) throw new Error(`facade manifest missing set: ${set}`);
          return Promise.all(
            MAP_NAMES.map((map) => {
              const file = entry[map];
              if (!file) throw new Error(`facade manifest missing ${set}.${map}`);
              return loadOne(file, SRGB_MAPS.has(map));
            }),
          ).then(([color, normal, orm, emissive]) => ({ color, normal, orm, emissive }));
        }),
      ).then((sets) => {
        ktx2?.dispose();
        const out = {} as FacadeTextures;
        SET_NAMES.forEach((name, i) => {
          out[name] = sets[i]!;
        });
        return out;
      });
    })
    .catch(() => null); // no manifest / load failure -> procedural fallback
}

// ---------------------------------------------------------------------------
// Reference-counted module cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  promise: Promise<FacadeTextures | null>;
  refs: number;
}

let entry: CacheEntry | null = null;

function texturesOf(sets: FacadeTextures): THREE.Texture[] {
  return SET_NAMES.flatMap((name) => MAP_NAMES.map((m) => sets[name][m]));
}

function acquire(gl: THREE.WebGLRenderer, anisotropy: number): Promise<FacadeTextures | null> {
  if (!entry) {
    entry = { promise: buildAll(gl, anisotropy), refs: 0 };
  }
  entry.refs += 1;
  return entry.promise;
}

function release(): void {
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    const e = entry;
    entry = null;
    e.promise
      .then((sets) => {
        if (sets) for (const tex of texturesOf(sets)) tex.dispose();
      })
      .catch(() => {
        /* nothing to dispose */
      });
  }
}

/**
 * Loads (once, cached) the shared baked facade sets. Returns null until they
 * resolve, on the server, or when the packed textures are not present —
 * callers keep their existing fallback in that case. `gl` is needed for the
 * KTX2 transcoder target detection; `anisotropy` follows the quality preset
 * (clamped 4–8 like the ground PBR sets).
 */
export function useFacadeTextures(
  gl: THREE.WebGLRenderer,
  anisotropy: number,
): FacadeTextures | null {
  const [sets, setSets] = useState<FacadeTextures | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;
    const a = Math.min(8, Math.max(4, anisotropy));
    acquire(gl, a).then((s) => {
      if (active) setSets(s);
    });
    return () => {
      active = false;
      setSets(null);
      release();
    };
    // anisotropy changes are applied below without a reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl]);

  useEffect(() => {
    if (!sets) return;
    const a = Math.min(8, Math.max(4, anisotropy));
    for (const tex of texturesOf(sets)) {
      if (tex.anisotropy !== a) {
        tex.anisotropy = a;
        tex.needsUpdate = true;
      }
    }
  }, [sets, anisotropy]);

  return sets;
}
