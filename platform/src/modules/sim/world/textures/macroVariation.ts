/**
 * Shared world-space macro albedo variation for the ground materials
 * (doc 71 §4.4 / lane 05 §4a). ONE procedurally generated 256² tileable
 * noise texture (no asset download), sampled in WORLD XZ at very low
 * frequency by every ground material through one `onBeforeCompile` hook —
 * ±22 % albedo modulation at a ~40–80 m feature scale so large uniform
 * surfaces (asphalt, lawns, courtyards) stop reading flat, and — because
 * road, junctions, parking lanes, sidewalks and terrain all sample the SAME
 * noise field — the surfaces knit together instead of seaming at material
 * boundaries.
 *
 * Cost: exactly ONE extra texture fetch on ground fragments. Zero per-frame
 * JS. The hook multiplies `diffuseColor` right after `map_fragment`, so it
 * composes multiplicatively with the wetness `color` darken and the baked
 * vertex-color wear, and NEVER touches roughness — the wet-road roughness
 * lerp (doc 71 §4.4 damp-asphalt look) is unaffected.
 *
 * r0.185 anchors verified against three/src/renderers/shaders/ShaderLib/
 * meshphysical.glsl.js: `#include <worldpos_vertex>` (vertex) and
 * `#include <map_fragment>` (fragment). Re-verify after any three upgrade.
 */

import * as THREE from "three";

/** Noise texture edge (px). 256² single-channel = 64 KB — trivial. */
const MACRO_TEXTURE_SIZE = 256;
/** One noise tile per this many metres (dominant blobs land at ~40–80 m). */
const MACRO_TILE_M = 80;
/** ±albedo swing (0.22 = the plan's ruled value). */
const MACRO_STRENGTH = 0.22;

// ---------------------------------------------------------------------------
// Tileable fBm value noise (deterministic — same field every session)
// ---------------------------------------------------------------------------

function hashLattice(x: number, y: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ x, 0x85ebca6b);
  h = Math.imul(h ^ y, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Periodic value noise: lattice indices wrap at `period` -> seamless tile. */
function periodicValueNoise(u: number, v: number, period: number, seed: number): number {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const sx = xf * xf * (3 - 2 * xf);
  const sy = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % period) + period) % period;
  const y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period;
  const y1 = (y0 + 1) % period;
  const v00 = hashLattice(x0, y0, seed);
  const v10 = hashLattice(x1, y0, seed);
  const v01 = hashLattice(x0, y1, seed);
  const v11 = hashLattice(x1, y1, seed);
  const a = v00 + (v10 - v00) * sx;
  const b = v01 + (v11 - v01) * sx;
  return a + (b - a) * sy;
}

function makeMacroNoiseTexture(): THREE.DataTexture {
  const size = MACRO_TEXTURE_SIZE;
  const data = new Uint8Array(size * size);
  // fBm: base 2 cells/tile (features ~MACRO_TILE_M/2 = 40 m) + finer octaves.
  const octaves: [period: number, weight: number][] = [
    [2, 0.5],
    [4, 0.27],
    [8, 0.15],
    [16, 0.08],
  ];
  let min = Infinity;
  let max = -Infinity;
  const raw = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const u = i / size;
      const v = j / size;
      let n = 0;
      for (const [period, weight] of octaves) {
        n += periodicValueNoise(u, v, period, 0x9e3779b9 + period) * weight;
      }
      raw[j * size + i] = n;
      if (n < min) min = n;
      if (n > max) max = n;
    }
  }
  // Stretch to the full 0..255 range so uMacroStrength means what it says.
  const inv = max > min ? 1 / (max - min) : 1;
  for (let k = 0; k < raw.length; k++) {
    data[k] = Math.round(((raw[k]! - min) * inv) * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Shared uniforms + the onBeforeCompile hook
// ---------------------------------------------------------------------------

let macroUniforms: {
  uMacro: { value: THREE.DataTexture };
  uMacroScale: { value: number };
  uMacroStrength: { value: number };
} | null = null;

/** Lazy singleton — ONE texture + uniform set shared by every ground
 *  material, for the whole app lifetime (64 KB; never disposed). */
function getMacroUniforms() {
  if (!macroUniforms) {
    macroUniforms = {
      uMacro: { value: makeMacroNoiseTexture() },
      uMacroScale: { value: 1 / MACRO_TILE_M },
      uMacroStrength: { value: MACRO_STRENGTH },
    };
  }
  return macroUniforms;
}

/**
 * onBeforeCompile hook — pass to `<meshStandardMaterial onBeforeCompile=...>`
 * together with `customProgramCacheKey={macroProgramCacheKey}` (all ground
 * materials share ONE program cache key -> one compile, no per-instance
 * recompiles).
 */
export function macroOnBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms): void {
  const u = getMacroUniforms();
  shader.uniforms.uMacro = u.uMacro;
  shader.uniforms.uMacroScale = u.uMacroScale;
  shader.uniforms.uMacroStrength = u.uMacroStrength;
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying vec2 vGroundMacroXZ;")
    .replace(
      "#include <worldpos_vertex>",
      "#include <worldpos_vertex>\nvGroundMacroXZ = (modelMatrix * vec4( position, 1.0 )).xz;",
    );
  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uMacro;\nuniform float uMacroScale;\nuniform float uMacroStrength;\nvarying vec2 vGroundMacroXZ;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float groundMacro = texture2D( uMacro, vGroundMacroXZ * uMacroScale ).r;
      diffuseColor.rgb *= mix( 1.0 - uMacroStrength, 1.0 + uMacroStrength, groundMacro );`,
    );
}

/** Stable cache key: all macro-hooked standard materials share one program
 *  per built-in-parameter combination (three still keys on defines). */
export const macroProgramCacheKey = (): string => "ground-macro-v1";
