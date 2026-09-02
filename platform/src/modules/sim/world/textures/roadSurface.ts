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
import { bindSnowRoadUniforms } from "./snowCover";

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

/**
 * FINE WEATHERING BREAK (art pass 2026-08-03). The review's ground verdict was
 * *"the ground is flat matte grey with no aggregate, no wear, no tyre marks"*,
 * and the tier it is truest of is `low`: there the road fetches colour only, so
 * the detail normal above never compiles and the ONLY variation left on the
 * asphalt is the 80 m ground macro — a blob so large that a whole street sits
 * inside one value. Between 80 m and the base tile's 1.5 m there was nothing.
 *
 * This fills that octave: the SAME shared 64 KB noise field, resampled at
 * ROAD_FINE_TILE_M, multiplied into albedo. It is patchy weathering at the
 * scale a driver actually reads asphalt at — polished-vs-coarse aggregate,
 * bleed, old sealant — and unlike the detail normal it is an ALBEDO term, so
 * it survives at `low` where there is no relief to light.
 *
 * Cost: one extra fetch of a texture the ground materials have already
 * uploaded and are already sampling twice, on asphalt fragments only. It mips
 * to flat grey with distance (LinearMipmapLinear on a 256² field at a 2.6 m
 * tile), which is the correct behaviour: near-field texture, no far-field
 * shimmer to alias against the lane markings the rule engine grades on.
 */
export const ROAD_FINE_TILE_M = 2.6;
/** ± albedo swing of the fine break. Half the 80 m macro's 0.22: this octave
 *  is a texture cue, not a lighting cue, and above ~0.12 wet asphalt starts
 *  reading as camouflage. */
export const ROAD_FINE_STRENGTH = 0.1;

/**
 * SNOW LYING ON THE CARRIAGEWAY — the drift scale.
 *
 * `sc-ac-snow:f1673b60` (critical): „the carriageway renders as bare grey
 * asphalt … while instruction 1 tells the student «пътят е заснежен»". The
 * light rig cannot close it (`presets.ts`'s `snowWeather` block: every lever
 * there moves road and pavement together, so the ratio survives every value)
 * and the whole-material multiply cannot either — `SNOW_ROAD_BRIGHTEN` would
 * need ≈ 2.7 against the `< 2` bound `weather.test.ts` pins, and a multiply
 * SCALES the asphalt map, so it makes the baked wheel-track wear blotchy long
 * before the surface goes white. Both files route the remainder to one line: a
 * per-fragment snow MIX on the asphalt material. This is that mix; the cap it
 * spends is `snowCover.ts`'s `SNOW_ROAD_COVER_MAX`, which is where the
 * arithmetic and the three orderings it has to keep are written down.
 *
 * WHY IT IS PATCHY AND NOT A FLAT LIFT. A uniform mix reads as a paler grey
 * road, which is the same picture the audit convicted with one more shade of
 * paint on it. Snow on a street in use is drifted and ploughed and trodden: it
 * survives at the kerb line and between the wheel tracks and is scrubbed off
 * where the tyres run. Modulating the cover by the shared noise field puts that
 * unevenness in at the metre scale a driver reads a road at, and it is what
 * makes the surface read as snow ON tarmac rather than as tarmac tinted.
 *
 * THE SCALE, 6 m, sits deliberately between the two octaves already on this
 * material — the 14 m detile and the 2.6 m fine break — so the three do not
 * beat against each other and the drifts are longer than a car and shorter than
 * a block. The SAME 64 KB field again: no new upload, and the snow lies where
 * the asphalt is already dark, which is where standing snow actually survives.
 */
export const ROAD_SNOW_PATCH_TILE_M = 6;
/**
 * The floor of the patch weight — how much cover the most trodden band still
 * keeps. NOT 0: a wheel track on a street being driven in falling snow is
 * slush, not clean tarmac, and a floor of zero would put bare summer asphalt
 * back on the two strips the cockpit camera stares down, which is the picture
 * `sc-ac-snow:f1673b60` convicted. At 0.4 the mean weight is `mix(0.4, 1, 0.5)`
 * = 0.70 of the cap, which is the number `SNOW_ROAD_COVER_MAX`'s derivation is
 * worked against, and the spread it leaves (0.44 … 0.55 linear against a bare
 * 0.36) is wide enough to read as drifts rather than as dither.
 */
export const ROAD_SNOW_PATCH_FLOOR = 0.4;

/**
 * The line the fragment stage emits — exported so the test pins the exact
 * operation (a MIX toward the snow albedo, at the road's own cover) rather than
 * merely „something was injected". Same discipline as
 * `SNOW_COVER_FRAGMENT_ANCHOR` next door, and for the same reason: this is the
 * op that distinguishes covering a surface from tinting one.
 */
export const ROAD_SNOW_FRAGMENT_ANCHOR =
  "diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, roadSnowAmount );";

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
  uRoadFineScale: { value: number };
  uRoadFineStrength: { value: number };
  uRoadSnowScale: { value: number };
  uRoadSnowFloor: { value: number };
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
      uRoadFineScale: { value: 1 / ROAD_FINE_TILE_M },
      uRoadFineStrength: { value: ROAD_FINE_STRENGTH },
      uRoadSnowScale: { value: 1 / ROAD_SNOW_PATCH_TILE_M },
      uRoadSnowFloor: { value: ROAD_SNOW_PATCH_FLOOR },
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
  shader.uniforms.uRoadFineScale = u.uRoadFineScale;
  shader.uniforms.uRoadFineStrength = u.uRoadFineStrength;
  shader.uniforms.uRoadSnowScale = u.uRoadSnowScale;
  shader.uniforms.uRoadSnowFloor = u.uRoadSnowFloor;
  // `uSnowRoad` + `uSnowColor`, by reference, from the one file that owns how
  // white snow gets and the one writer DistrictWorld already ticks each frame.
  bindSnowRoadUniforms(shader);

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uRoadTap;\nuniform float uRoadTapScale;\nuniform float uRoadTapMixMax;\nuniform float uRoadDetailScale;\nuniform float uRoadDetailStrength;\nuniform float uRoadFineScale;\nuniform float uRoadFineStrength;\nuniform float uRoadSnowScale;\nuniform float uRoadSnowFloor;\nuniform float uSnowRoad;\nuniform vec3 uSnowColor;",
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
      #endif
      // Fine weathering octave — the one surface cue that survives at tier
      // \`low\`, where there is no normal map and the 80 m macro is the only
      // other variation on the whole carriageway. Outside the USE_MAP guard on
      // purpose: it must apply to the procedural fallback asphalt too.
      float roadFine = texture2D( uRoadTap, vGroundMacroXZ * uRoadFineScale ).r;
      diffuseColor.rgb *= mix( 1.0 - uRoadFineStrength, 1.0 + uRoadFineStrength, roadFine );`,
    )
    // ── SNOW ON THE CARRIAGEWAY (sc-ac-snow:f1673b60). See
    //    ROAD_SNOW_PATCH_TILE_M above for why it is a mix and why it is patchy,
    //    and snowCover.ts's SNOW_ROAD_COVER_MAX for the cap's arithmetic.
    //
    //    AFTER `<color_fragment>` AND NOT AT THE MACRO ANCHOR, which is the one
    //    placement decision here. The road ribbons are `vertexColors` — the
    //    builders bake wheel-track wear and gutter grime into them
    //    (StaticWorld's own comment at that mesh) — and three multiplies vColor
    //    in at `<color_fragment>`, AFTER the map. A mix does not commute with a
    //    multiply, so spliced any earlier the vColor pass would re-amplify
    //    exactly the variance this term exists to compress, and the snow would
    //    come out blotchy in the wheel tracks. Covering is the last thing that
    //    happens to a road surface, so it is the last thing in the albedo
    //    chain. (The junction and parking meshes carry no vColor; three still
    //    emits the include, so one splice serves all three asphalt materials.)
    //
    //    FREE OUTSIDE A SNOW LESSON, and free in the fetch as well as in the
    //    arithmetic: the branch is on a UNIFORM, so it is uniform control flow
    //    (legal around a sampler in both GLSL ES 1.00 and 3.00) and it is not
    //    taken at all on the 149 of 150 scenarios that author no snow — the
    //    corpus authors `weather: "snow"` exactly once. Inside it, `mix(x, y,
    //    0.0)` would be bit-identical anyway, so a driver that never ticks the
    //    uniform renders the bytes it rendered before.
    .replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      if ( uSnowRoad > 0.0 ) {
        float roadSnowPatch = texture2D( uRoadTap, vGroundMacroXZ * uRoadSnowScale ).r;
        float roadSnowAmount = uSnowRoad * mix( uRoadSnowFloor, 1.0, roadSnowPatch );
        ${ROAD_SNOW_FRAGMENT_ANCHOR}
      }`,
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
 *  the plain ground-macro program the terrain and sidewalks compile. Bumped to
 *  v2 when the carriageway snow mix landed: a cached v1 program carries neither
 *  `uSnowRoad` nor the splice, so a warm page would hand a hooked material the
 *  old program and the fix would change no pixel. Same reason
 *  `snowCoverProgramCacheKey` moved to v2 for the winter term. */
export const roadSurfaceProgramCacheKey = (): string => "road-surface-v2";
