/**
 * The road-surface pass (doc 82 §3.2 V5, with F4 folded in) — the shading
 * treatment for the three ASPHALT meshes only: ribbons, junction patches and
 * the curbside parking bands.
 *
 * Doc 82 calls the road surface "80 % of a driving game's screen" and doc 82
 * §1.2 item 7 lists what was wrong with ours: a near-uniform mid-grey photo
 * that mips to flat grey past ~15 m, no relief at all at the 0.5–3 m scale a
 * cockpit camera stares at, and a tint identical to the concrete pavement
 * beside it. Three moves, no new downloads and no new draw calls:
 *
 *  1. DETAIL NORMAL (UDN), reusing the road's OWN normal map at
 *     ROAD_DETAIL_UV_SCALE× the base rate. The high frequencies of an asphalt
 *     normal map are aggregate grain, and grain is scale-free — so the same
 *     texture, sampled small, is a physically sensible detail layer. This is
 *     what puts relief back at 0.375 m, and it is the near-field optic flow
 *     F4 asks for: at 50 km/h the detail layer sweeps past at ~37 Hz against
 *     the base tile's ~9 Hz. It is also the one speed cue that does NOT
 *     distort the 10–30 m distance judgements the rule engine grades — unlike
 *     widening the FOV, which COCKPIT_FOV_MAX = 56 forbids outright.
 *
 *     Gated off at tier `low` FOR FREE: `low` fetches colour only
 *     (textureBudget "colorOnly"), so `normalMap` is null, USE_NORMALMAP is
 *     never defined and the whole block preprocesses away. No runtime branch,
 *     no second program.
 *
 *  2. A 2-TAP ROTATED ALBEDO BLEND. Halving ROAD_TILE_SPAN_M for F4 doubles
 *     how often the photo repeats, and a repeating photo on a 21 km road
 *     network reads as wallpaper — the aggregate blotches line up on a
 *     visible grid. The standard fix: sample the same map a second time
 *     through a rotated, offset UV and cross-fade the two with a
 *     low-frequency weight, so the lattice never aligns with itself. The
 *     weight is the SHARED macro-noise field (macroVariation.ts) resampled at
 *     ROAD_TAP_TILE_M, which also means the blend follows the same large-scale
 *     variation the rest of the ground already knits to.
 *
 *  3. THE TINT. Fresh-laid Bulgarian wearing course is near-black; ours was
 *     the photo at full value beside a bright concrete pavement, which is why
 *     road and footway read as the same material at two widths. See
 *     ROAD_ALBEDO_TINT.
 *
 * GRADING IS UNTOUCHED. Nothing here moves a vertex or changes any world
 * datum: the rule engine reads District data, never rendered pixels. This
 * file only decides how asphalt triangles are shaded.
 *
 * Cost on asphalt fragments: +1 albedo tap, +1 noise tap at every tier, +1
 * normal tap at med/high. r0.185 anchors verified against
 * three/src/renderers/shaders/ShaderChunk — `#include <map_fragment>` (whose
 * `sampledDiffuseColor` is declared at FUNCTION scope inside a brace-less
 * `#ifdef`, so it is still live where we read it) and
 * `#include <normal_fragment_maps>` (whose `tbn` comes from
 * normal_fragment_begin under the same define). The test in __tests__ fails
 * loudly if any of that is renamed.
 */

import type * as THREE from "three";
import {
  getMacroNoiseTexture,
  macroOnBeforeCompile,
  MACRO_HOOK_FRAGMENT_ANCHOR,
} from "./macroVariation";

/**
 * Albedo multiplier on the asphalt meshes (doc 82 V5 „darken the road tint so
 * it separates from the concrete pavement").
 *
 * The road and the sidewalk were both drawn at the full value of their photo,
 * and the two photos are close in luminance — so a 32.5 m carriageway and a
 * 3.5 m footway read as one continuous grey field with a curb line drawn on
 * it. Real asphalt is much darker than real concrete: that contrast is what
 * makes a street read as a street from 100 m away, and it is the cue a
 * learner uses to see where the carriageway ends before they can resolve the
 * curb. 0.72 keeps the aggregate legible in shadow (going below ~0.65 crushes
 * it under AgX) while opening a clear step against the pavement.
 *
 * Multiplies the wetness darken rather than replacing it, so the wet-road
 * response and its ordering against the decals are unchanged.
 */
export const ROAD_ALBEDO_TINT = 0.72;

/**
 * Detail-normal UV multiplier. 4 × ROAD_TILE_SPAN_M (1.5 m) = a 0.375 m
 * detail tile — the absolute scale doc 82 V5 asks for ("~8× UV" was written
 * against the pre-F4 3 m span; the doc's number is the 0.375 m result, and
 * that is what is preserved here now that the span itself halved).
 */
export const ROAD_DETAIL_UV_SCALE = 4;
/**
 * How hard the detail layer perturbs, as a fraction of the material's own
 * `normalScale`. Well under 1: this is the same photo's grain shown twice, so
 * at full strength the two layers beat against each other and the road reads
 * as gravel rather than as asphalt.
 */
export const ROAD_DETAIL_STRENGTH = 0.55;

/** One noise tile per this many metres for the detile cross-fade weight.
 *  Far below the ground macro's 80 m — the blend has to vary WITHIN a block
 *  or the tiling grid is merely relocated, not broken. */
export const ROAD_TAP_TILE_M = 14;
/**
 * How far the cross-fade may swing toward the rotated tap. 0.5 would be a
 * plain average, which halves the aggregate contrast and turns the road to
 * porridge; 0.42 leaves each tap dominant somewhere while still guaranteeing
 * no patch of road is ever a pure copy of another.
 */
export const ROAD_TAP_MIX_MAX = 0.42;
/**
 * Rotation applied to the second tap's UV, in radians (~31.5°). Deliberately
 * far from any multiple of 90°: a square lattice rotated by 90° is the same
 * lattice, and near 45° the two taps' diagonals resonate.
 */
export const ROAD_TAP_ROTATION_RAD = 0.55;

const TAP_COS = Math.cos(ROAD_TAP_ROTATION_RAD).toFixed(6);
const TAP_SIN = Math.sin(ROAD_TAP_ROTATION_RAD).toFixed(6);

/** Lazy singleton — one uniform set shared by the three asphalt materials, so
 *  they compile once and upload nothing new (kept in this shape to match
 *  macroVariation's contract). */
let roadUniforms: {
  uRoadTap: { value: THREE.DataTexture };
  uRoadTapScale: { value: number };
  uRoadTapMixMax: { value: number };
  uRoadDetailScale: { value: number };
  uRoadDetailStrength: { value: number };
} | null = null;

function getRoadUniforms() {
  if (!roadUniforms) {
    roadUniforms = {
      // The SAME 64 KB field the ground macro and the paint wear already
      // sample — one upload for the whole world, whatever reads it.
      uRoadTap: { value: getMacroNoiseTexture() },
      uRoadTapScale: { value: 1 / ROAD_TAP_TILE_M },
      uRoadTapMixMax: { value: ROAD_TAP_MIX_MAX },
      uRoadDetailScale: { value: ROAD_DETAIL_UV_SCALE },
      uRoadDetailStrength: { value: ROAD_DETAIL_STRENGTH },
    };
  }
  return roadUniforms;
}

/**
 * onBeforeCompile hook for the asphalt materials — pair it with
 * `customProgramCacheKey={roadSurfaceProgramCacheKey}`. It is a SUPERSET of
 * the ground macro hook (which it calls first, so the asphalt keeps sampling
 * the identical noise field at the identical 80 m scale and still knits to
 * the sidewalks and terrain at the material boundary); the road-specific
 * edits are layered on top of it.
 */
export function roadSurfaceOnBeforeCompile(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  macroOnBeforeCompile(shader);

  const u = getRoadUniforms();
  shader.uniforms.uRoadTap = u.uRoadTap;
  shader.uniforms.uRoadTapScale = u.uRoadTapScale;
  shader.uniforms.uRoadTapMixMax = u.uRoadTapMixMax;
  shader.uniforms.uRoadDetailScale = u.uRoadDetailScale;
  shader.uniforms.uRoadDetailStrength = u.uRoadDetailStrength;

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uRoadTap;\nuniform float uRoadTapScale;\nuniform float uRoadTapMixMax;\nuniform float uRoadDetailScale;\nuniform float uRoadDetailStrength;",
    )
    // Anchored on the macro hook's OWN emitted line (not on a three chunk) so
    // the detile lands after `diffuseColor` already carries the map and the
    // macro modulation. Multiplying by mix(1, B/A, w) is exactly "replace the
    // map's contribution A with mix(A, B, w)" without having to reconstruct
    // what else has multiplied into diffuseColor since.
    .replace(
      MACRO_HOOK_FRAGMENT_ANCHOR,
      `${MACRO_HOOK_FRAGMENT_ANCHOR}
      #ifdef USE_MAP
        vec2 roadTapUv = vec2(
          vMapUv.x * ${TAP_COS} - vMapUv.y * ${TAP_SIN},
          vMapUv.x * ${TAP_SIN} + vMapUv.y * ${TAP_COS} ) + vec2( 0.37, 0.71 );
        vec3 roadTapA = max( sampledDiffuseColor.rgb, vec3( 1e-3 ) );
        vec3 roadTapB = texture2D( map, roadTapUv ).rgb;
        float roadTapW = texture2D( uRoadTap, vGroundMacroXZ * uRoadTapScale ).r * uRoadTapMixMax;
        diffuseColor.rgb *= mix( vec3( 1.0 ), roadTapB / roadTapA, roadTapW );
      #endif`,
    )
    // UDN detail normal. `normal` here is already tbn * base mapN, so adding
    // the detail's tangent-space XY through the same tbn columns is the UDN
    // blend (sum the XY, keep the base Z) written in the space three left us
    // in — no chunk replacement, and it disappears entirely at tier `low`.
    .replace(
      "#include <normal_fragment_maps>",
      `#include <normal_fragment_maps>
      #ifdef USE_NORMALMAP_TANGENTSPACE
        vec3 roadDetailN = texture2D( normalMap, vNormalMapUv * uRoadDetailScale ).xyz * 2.0 - 1.0;
        roadDetailN.xy *= normalScale * uRoadDetailStrength;
        normal = normalize( normal + tbn[ 0 ] * roadDetailN.x + tbn[ 1 ] * roadDetailN.y );
      #endif`,
    );
}

/** Stable cache key — one asphalt program for the whole app, distinct from
 *  the plain ground-macro program the terrain and sidewalks compile. */
export const roadSurfaceProgramCacheKey = (): string => "road-surface-v1";
