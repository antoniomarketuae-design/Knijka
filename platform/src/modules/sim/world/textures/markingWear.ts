/**
 * Road-paint surface treatment for the merged markings mesh (doc 82 §3.2 V1).
 *
 * Every other ground mesh in StaticWorld already had `receiveShadow` and a
 * real PBR set; the markings mesh had neither, so the paint GLOWED THROUGH
 * building and car shadows and read as fresh plastic tape laid on top of the
 * world rather than as paint rolled onto asphalt. `receiveShadow` fixes the
 * light; this hook fixes the surface, in four moves and two extra texture
 * fetches — the fourth is snow, it arrived with `PAINT_SNOW_DRIFT_LO`, and it
 * costs nothing outside a snow lesson:
 *
 *  1. MICRO-RELIEF AT THE ASPHALT'S OWN SCALE. Road paint is 0.3 mm of
 *     thermoplastic on a coarse aggregate — it inherits the surface it was
 *     rolled onto. The markings mesh can therefore bind the SAME asphalt
 *     normal/roughness maps the road already uploaded (no new download, no
 *     new upload, no new draw call), but its UVs are per-quad 0..1 (one full
 *     tile smeared across every dash), so the hook rewrites `vNormalMapUv` /
 *     `vRoughnessMapUv` in WORLD XZ divided by ROAD_TILE_SPAN_M — the exact
 *     scale the carriageway 12 mm below is running at. (It follows the road's
 *     span, not the photo size: when doc 82 F4 halved the span for optic flow
 *     the paint had to halve with it or paint and asphalt would tile at
 *     different rates, which is the decal read V1 exists to remove.)
 *
 *  2. GRIME. The shared macro noise field (macroVariation.ts — the same
 *     64 KB texture, resampled at PAINT_WEAR_TILE_M instead of 80 m) darkens
 *     the paint where the asphalt around it is already dark. Subtractive
 *     only: paint is never brighter than authored.
 *
 *  3. EDGE EROSION. Every markings builder writes U ACROSS the painted quad
 *     (0 at one long edge, 1 at the other — paintQuad / paintSolidLine /
 *     the arrow and speed-glyph quads all agree), so `min(u, 1-u)` is a
 *     distance-to-edge signal with no new attribute. Only the outer
 *     PAINT_EDGE_BAND of the half-width is allowed to fall below alphaTest,
 *     so a stop line keeps a solid body and loses only its razor edge.
 *
 *  4. SNOW LYING OVER THE STRIPE, in a snow lesson and nowhere else. The same
 *     drift field the carriageway and the road decals sample, at the same
 *     metres-per-tile, thresholded high and spent on ALPHA — so the stripe is
 *     interrupted where the drifts cross it and every fragment that survives
 *     keeps the value it had. `PAINT_SNOW_DRIFT_LO` carries the derivation.
 *
 * GRADING IS UNTOUCHED. The rule engine reads district data, never rendered
 * pixels; the markings GEOMETRY is byte-identical (no builder changed). This
 * file only decides how those triangles are shaded.
 *
 * Cost: two extra texture fetches on paint fragments (a few percent of one
 * ground mesh) plus a `discard` on the eroded fringe. r0.185 anchors verified
 * against three/src/renderers/shaders/ShaderChunk — `#include <uv_vertex>`,
 * `#include <worldpos_vertex>`, `#include <map_fragment>`, and the
 * `vNormalMapUv` / `vRoughnessMapUv` varyings declared by uv_pars_vertex.
 * Re-verify after any three upgrade; the test in __tests__ fails loudly if an
 * anchor is renamed.
 */

import type * as THREE from "three";
import { ROAD_TILE_SPAN_M } from "./groundScale";
import { getMacroNoiseTexture } from "./macroVariation";
import { ROAD_SNOW_PATCH_TILE_M } from "./roadSurface";
import { bindSnowPaintUniforms } from "./snowCover";

/** One noise tile per this many metres. Paint wears at the 1–3 m scale the
 *  cockpit camera stares at, not the 80 m scale the ground macro works at. */
export const PAINT_WEAR_TILE_M = 3.2;
/** How far the grimiest patch darkens the paint (0.30 = 30 % down). */
export const PAINT_WEAR_STRENGTH = 0.3;
/** Fraction of the stripe's HALF-width that may erode, measured from the
 *  edge inward. 0.3 = the outer ~15 % of a stripe can chip; the middle 70 %
 *  is a hard alpha 1.0 and can never be punched through. */
export const PAINT_EDGE_BAND = 0.3;
/** alphaTest for the eroded fringe (doc 82 V1's ruled value). Applied on the
 *  MATERIAL, not here — the hook only writes `diffuseColor.a`. */
export const PAINT_ALPHA_TEST = 0.35;
/**
 * normalScale for the borrowed asphalt normal. Well under 1: the aggregate
 * shows THROUGH a paint film, it is not bare stone — at full strength the
 * stripes read as gravel and the „paint" cue is lost.
 */
export const PAINT_NORMAL_SCALE = 0.55;

/**
 * SNOW LYING OVER THE PAINT — the second clause of `sc-ac-snow:f1673b60`
 * („the carriageway renders as bare grey asphalt WITH CLEAN UNBROKEN WHITE
 * EDGE AND LANE MARKINGS while instruction 1 tells the student «пътят е
 * заснежен»"). The asphalt clause is closed by `roadSurface.ts`'s drift mix;
 * this is the stripe, and it is a different operation for the reason
 * `snowCover.ts`'s `getSnowPaintCover` block sets out: covering paint is an
 * ALPHA term, never an albedo one, so what survives is exactly as bright as it
 * was and „the lane line is still the brightest thing in the carriageway"
 * cannot be spent by this change.
 *
 * SAME FIELD, SAME SCALE, DIFFERENT WINDOW — and each third of that is load-
 * bearing. Same field and scale (`ROAD_SNOW_PATCH_TILE_M`, sampled off this
 * hook's own world-XZ varying) because `roadSurface.ts` argues it for the
 * decals and the argument is stronger here: a drift that whitens the asphalt
 * and steps politely over the stripe in it is a second weather, not snow.
 * Different window because the two surfaces answer different questions — the
 * asphalt asks „how white", spending the field's whole p10…p90 range, while
 * the stripe asks „buried or not", which only the deepest drifts do.
 *
 * DERIVED, NOT PICKED: these are the shared field's own q60 and q95, which put
 * 19 % of a stripe's body under snow at full snowfall, and put it precisely
 * where the carriageway is whitest — over those texels the road's own drift
 * weight averages 0.994 of its cap and never falls below 0.964, so the paint
 * goes exactly where the snow beside it is deepest. `markingWear.test.ts`
 * recomputes both quantiles and both figures from the shipped generator, so
 * the window can never drift off the field the shader samples.
 *
 * 19 % IS THE NUMBER THIS PAIR IS FOR, and it is bounded from both ends by
 * something the product needs. Below it the row's own word — „unbroken" —
 * survives: a stripe that loses only its fringe is still a continuous line and
 * still teaches a student that paint is a thing you can steer by on snow,
 * which is the habit that puts a car off a winter road. Above it the stripe
 * stops being followable, and «не спирай върху маркировката», stop lines and
 * lane discipline are skills the picture would have taken away. Four fifths of
 * the line, broken at the metre scale, is what a driven snowed street looks
 * like and what this drill is about.
 *
 * ITS R0 LOOK IS OWED — this lane may not start a server. The frame that
 * settles it is `sc-ac-snow` `pc-right/03-ready.png` re-driven at this commit
 * (NOT `01-arrival`, which `presets.ts` measured photographing the ground
 * loader). Two criteria: the dashed line and the right-hand edge line must
 * both be visibly interrupted where the drifts cross them, and both must still
 * be traceable the length of the block.
 */
export const PAINT_SNOW_DRIFT_LO = 0.58;
/** The upper end of the same window — see `PAINT_SNOW_DRIFT_LO`. */
export const PAINT_SNOW_DRIFT_HI = 0.84;

/** Lazy singleton — one uniform set shared by the one markings material per
 *  scene (kept in this shape to match macroVariation's contract). */
let paintUniforms: {
  uPaintWear: { value: THREE.DataTexture };
  uPaintWearScale: { value: number };
  uPaintWearStrength: { value: number };
  uPaintTileScale: { value: number };
  uPaintEdgeBand: { value: number };
  uPaintSnowScale: { value: number };
  uPaintSnowLo: { value: number };
  uPaintSnowHi: { value: number };
} | null = null;

function getPaintUniforms() {
  if (!paintUniforms) {
    paintUniforms = {
      uPaintWear: { value: getMacroNoiseTexture() },
      uPaintWearScale: { value: 1 / PAINT_WEAR_TILE_M },
      uPaintWearStrength: { value: PAINT_WEAR_STRENGTH },
      uPaintTileScale: { value: 1 / ROAD_TILE_SPAN_M },
      uPaintEdgeBand: { value: PAINT_EDGE_BAND },
      // The DRIFT's scale, not the wear's: the same metres-per-tile the
      // asphalt and the road decals read the same field at, so one drift
      // crosses road, decal and stripe as one shape.
      uPaintSnowScale: { value: 1 / ROAD_SNOW_PATCH_TILE_M },
      uPaintSnowLo: { value: PAINT_SNOW_DRIFT_LO },
      uPaintSnowHi: { value: PAINT_SNOW_DRIFT_HI },
    };
  }
  return paintUniforms;
}

/**
 * onBeforeCompile hook for the markings material — pair it with
 * `customProgramCacheKey={markingWearProgramCacheKey}` so the one paint
 * program is compiled once and never collides with the ground-macro program.
 */
export function markingWearOnBeforeCompile(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  const u = getPaintUniforms();
  shader.uniforms.uPaintWear = u.uPaintWear;
  shader.uniforms.uPaintWearScale = u.uPaintWearScale;
  shader.uniforms.uPaintWearStrength = u.uPaintWearStrength;
  shader.uniforms.uPaintTileScale = u.uPaintTileScale;
  shader.uniforms.uPaintEdgeBand = u.uPaintEdgeBand;
  shader.uniforms.uPaintSnowScale = u.uPaintSnowScale;
  shader.uniforms.uPaintSnowLo = u.uPaintSnowLo;
  shader.uniforms.uPaintSnowHi = u.uPaintSnowHi;
  // `uSnowPaint`, by reference, from the one file that owns the snow channels
  // and the one writer `DistrictWorld` already ticks each frame.
  bindSnowPaintUniforms(shader);

  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uPaintTileScale;\nvarying vec2 vPaintXZ;\nvarying vec2 vPaintUv;",
    )
    // The builders' per-quad 0..1 UV survives as its own varying: three's own
    // vUv only exists when USE_UV is defined, which depends on which maps the
    // tier happened to fetch.
    .replace("#include <uv_vertex>", "#include <uv_vertex>\n\tvPaintUv = uv;")
    // uv_vertex runs BEFORE worldpos_vertex, so re-pointing the map UVs here
    // overwrites three's own assignment. The #ifdefs mirror uv_pars_vertex:
    // at tier low no normal/roughness map is fetched at all and the varyings
    // do not exist, so both blocks compile away and the authored material
    // constants rule (exactly as they already do on the road).
    .replace(
      "#include <worldpos_vertex>",
      `#include <worldpos_vertex>
\tvPaintXZ = (modelMatrix * vec4( position, 1.0 )).xz;
\t#ifdef USE_NORMALMAP
\t\tvNormalMapUv = vPaintXZ * uPaintTileScale;
\t#endif
\t#ifdef USE_ROUGHNESSMAP
\t\tvRoughnessMapUv = vPaintXZ * uPaintTileScale;
\t#endif`,
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform sampler2D uPaintWear;\nuniform float uPaintWearScale;\nuniform float uPaintWearStrength;\nuniform float uPaintEdgeBand;\nuniform float uPaintSnowScale;\nuniform float uPaintSnowLo;\nuniform float uPaintSnowHi;\nuniform float uSnowPaint;\nvarying vec2 vPaintXZ;\nvarying vec2 vPaintUv;",
    )
    .replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float paintWear = texture2D( uPaintWear, vPaintXZ * uPaintWearScale ).r;
      diffuseColor.rgb *= mix( 1.0 - uPaintWearStrength, 1.0, paintWear );
      float paintEdge = smoothstep(
        0.0, uPaintEdgeBand, min( vPaintUv.x, 1.0 - vPaintUv.x ) * 2.0 );
      diffuseColor.a *= mix( paintWear, 1.0, paintEdge );
      ${PAINT_SNOW_FRAGMENT_ANCHOR}`,
    );
}

/**
 * The snow line the fragment stage emits — exported so the test pins the exact
 * operation (an ALPHA multiply, never a colour one) rather than merely „the
 * snow uniform is bound". `roadSurface.ts` exports its own anchor for the same
 * reason: this is the op that distinguishes covering paint from tinting it,
 * and tinting it is the thing `StaticWorld`'s `paintWet` block forbids.
 *
 * FREE OUTSIDE A SNOW LESSON, on the same argument the other two hooks make
 * and by the same arithmetic: `uSnowPaint` is 0 unless the weather store's snow
 * channel is up, and `a *= 1.0 - 0.0 * patch` is `a * 1.0` — bit-identical, not
 * merely close. The corpus authors `weather: "snow"` exactly once. The cost is
 * one extra fetch of a texture this material already has bound, on the paint
 * fragments only — the thinnest ground mesh in the scene.
 */
export const PAINT_SNOW_FRAGMENT_ANCHOR =
  `float paintSnow = smoothstep( uPaintSnowLo, uPaintSnowHi,
        texture2D( uPaintWear, vPaintXZ * uPaintSnowScale ).r );
      diffuseColor.a *= 1.0 - uSnowPaint * paintSnow;`;

/** Stable cache key — one paint program for the whole app. v2: v1 was compiled
 *  before the stripe could be snowed over, and a markings mesh handed the old
 *  program would keep a clean unbroken line in a lesson whose road is white. */
export const markingWearProgramCacheKey = (): string => "marking-wear-v2";
