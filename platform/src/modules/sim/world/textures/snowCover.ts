/**
 * SNOW THAT LIES ON SOMETHING OTHER THAN THE ROAD.
 *
 * WHY THIS FILE EXISTS — sweep w11, `sc-ac-snow:cfb2d46d`, critical: „No snow
 * has accumulated on any off-carriageway surface in shot — kerbs, pavements,
 * guard rail and building faces are all bare", re-judged on the w11 re-drive as
 * „the green full-leaf tree carries nothing … the dark railing run beside the
 * pavement carries nothing — beside a verge and pavement that are now white".
 *
 * THE ROOT CAUSE, measured in the tree rather than inferred from the frame.
 * Until this file, the ENTIRE renderer had exactly ONE place where lying snow
 * changed a surface: `environment/weather.ts`'s `roadSurfaceToParams`, read by
 * `StaticWorld.tsx` for the asphalt and the road decals and by nothing else.
 * Measured 2026-08-26, BEFORE this file existed:
 * `grep -rn "useSnowIntensity|getSnowIntensity|roadSurfaceToParams" src`
 * returned SimEnvironment, SkyDome, SnowFlakes and StaticWorld — sky, haze,
 * light, flakes, road. (`DistrictWorld` joins that list as of this change; it
 * is the writer below.) So a snow lesson could brighten its carriageway and not
 * put one flake's worth of white on a tree, a railing, a bollard, a bench, a
 * lamp column or a signal visor. That is not four separate symptoms on four
 * surfaces; it is one missing term, and this is that term.
 *
 * WHY A SHADER HOOK AND NOT A MATERIAL COLOR. `roadSurfaceToParams` works for
 * the road because a carriageway is flat: every fragment of it faces the sky,
 * so a whole-material albedo multiply is physically the right answer. A tree is
 * not flat. Multiplying the canopy material toward white gives a mint-green
 * tree lit from below as brightly as from above — a worse picture than the bare
 * one, because it no longer reads as anything. Snow lies on what FACES UP, so
 * the term has to be evaluated per fragment against the world-space normal.
 * That is what this hook does and it is the whole of it: one `smoothstep` on
 * `worldNormal.y`, one `mix` toward the preset's own snow colour.
 *
 * PROVABLY FREE OUTSIDE A SNOW LESSON, which is why this can ship without a
 * browser look at all 150 scenarios. `uSnowCover` is 0 unless the weather
 * store's snow channel is up, and GLSL `mix(x, y, 0.0)` is `x * 1.0 + y * 0.0`
 * — bit-identical, not merely close. Re-counted 2026-08-26 over
 * `src/modules/sim/lessons`: the corpus authors `weather: "snow"` exactly ONCE
 * (`templates-conditions.ts:1060`, sc-ac-snow) and `environment.snow` is set
 * from nowhere else (`compile.ts:1148` is the only writer), which matches
 * `weather.ts` §3's own census. So the blast radius of this file is that one
 * lesson family, and every other lesson renders the bytes it rendered before.
 * `snowCover.test.ts` pins the identity.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH — the surfaces the rule engine grades on.
 * The hook is attached in `WorldProps.makeSharedMaterials()`, to the five
 * shared PROP materials only. Sign FACES carry their own per-numeral
 * `faceMaterial` (WorldProps :715/:783) and traffic-signal lenses their own
 * `MeshBasicMaterial` (:1214) — neither is hooked, so a В26 numeral and a red
 * lamp stay exactly as legible in the snow lesson as in the dry one. Same
 * discipline `StaticWorld` already applies when it keeps road PAINT on the
 * rain-only mapping: a picture that buries the thing the student is graded on
 * fails them for a skill it just took away.
 *
 * Anchors verified against three 0.185.1 (`node_modules/three/src/renderers/
 * shaders/`): the vertex stage's `#include <defaultnormal_vertex>` leaves
 * `transformedNormal` in VIEW space (it folds in `instanceMatrix` for the
 * instanced prop meshes, which is exactly why the normal is taken from there
 * and not recomputed), and `<common>` supplies
 * `transformNormalByInverseViewMatrix` to carry it back to world space. The
 * fragment stage's `<color_fragment>` is the anchor rather than
 * `<map_fragment>`, and the difference is load-bearing: the prop materials are
 * `vertexColors: true`, three applies vColor AFTER the map, and a `mix` does
 * not commute with the multiply that follows it. `snowCover.test.ts` fails if
 * a three upgrade renames any of the four.
 */

import * as THREE from "three";

/**
 * How white a fully snow-covered, perfectly up-facing fragment goes at
 * snowIntensity 1. NOT 1.0 on purpose: a canopy mixed the whole way to the
 * snow colour stops being a tree and becomes a white blob, and street trees are
 * the landmark a student navigates a residential street by. At 0.85 the top of
 * the canopy reads as snow lying on foliage — the dark green still shows
 * through, which is what a laden tree actually looks like.
 */
export const SNOW_COVER_MAX = 0.85;

/**
 * The snow albedo. This is the DAY preset's own `snowWeather.color`
 * (`environment/presets.ts:300`), reused deliberately rather than picked:
 * the haze in the far field, the sky wash and the hemisphere ground bounce are
 * all already lerping toward this exact grey-white, so accumulation painted in
 * the same colour reads as one weather instead of as a second one.
 *
 * WHAT THAT MEANS IN THE NUMBERS, worked through rather than asserted, because
 * the one thing a unit test cannot catch here is a white sheet (the round-2 wet
 * retune shipped exactly that and the founder caught it, twice). #e8ebef is
 * ~0.807 in the linear working space three's ColorManagement converts it to. A
 * canopy fragment starts near 0.06 and mixes 0.85 of the way, landing at
 * ~0.695. The snowed CARRIAGEWAY, by `weather.ts`'s own worked figure, lands at
 * `SNOW_ROAD_BRIGHTEN 1.8 × ROAD_ALBEDO_TINT 0.72 × t` ≈ 0.58 for a mid-grey
 * asphalt map. So untrodden snow on a tree comes out ~19 % brighter than
 * trodden snow on the road, which is the correct direction and a small margin.
 * The empirical ceiling anchor is that this scene already renders near-white
 * sign plates (`bakeSignFace`, higher albedo than this) every lesson without
 * blowing out or tripping the composer's 0.9 bloom threshold.
 *
 * THE R0 LOOK IS OWED AND HAS NOT BEEN DONE. That arithmetic bounds the risk;
 * it does not photograph it. Nothing here was checked on a frame, because this
 * lane could not run a drive. The look that settles it is `sc-ac-snow`
 * `pc-right/04-t102s.png` re-driven at this commit, cropped 3× on the region
 * (620,250 340×220) — the crop the w11 judge used to convict the bare canopy
 * and the bare railing. Two criteria: the canopy must read as snow ON foliage
 * (green still visible on its flanks and underside, not a white blob), and no
 * prop may out-brighten the snowed carriageway by more than it does in life.
 */
export const SNOW_COVER_COLOR = 0xe8ebef;

/**
 * The facing window, in world normal.y. Below `LO` a surface is vertical
 * enough to shed everything (building walls, sign plates, tree trunks, the
 * sides of a railing panel — all correctly bare); above `HI` it is flat enough
 * to hold a full cap. A 45° face (`y ≈ 0.707`) lands at ~86 % of the cap,
 * which is the behaviour a pitched roof and the shoulder of a canopy want.
 */
export const SNOW_COVER_FACING_LO = 0.25;
export const SNOW_COVER_FACING_HI = 0.85;

/** Snow is the mattest surface a street ever has — no gloss survives it. */
export const SNOW_COVER_ROUGHNESS = 0.95;

let uniforms: {
  uSnowCover: { value: number };
  uSnowColor: { value: THREE.Color };
  uSnowFacing: { value: THREE.Vector2 };
  uSnowRoughness: { value: number };
} | null = null;

/**
 * Lazy singleton — ONE uniform set shared by every hooked material, so the
 * per-frame driver is a single float write no matter how many prop families
 * mounted. Mirrors `macroVariation.ts`'s shared-uniform discipline for the
 * same reason: `onBeforeCompile` hands three the uniform OBJECT by reference,
 * so writing `.value` here reaches every compiled program.
 */
function getSnowCoverUniforms() {
  if (!uniforms) {
    uniforms = {
      uSnowCover: { value: 0 },
      uSnowColor: { value: new THREE.Color(SNOW_COVER_COLOR) },
      uSnowFacing: { value: new THREE.Vector2(SNOW_COVER_FACING_LO, SNOW_COVER_FACING_HI) },
      uSnowRoughness: { value: SNOW_COVER_ROUGHNESS },
    };
  }
  return uniforms;
}

/**
 * THE WRITER. `DistrictWorld` calls this once per frame with the weather
 * store's snow channel (`getSnowIntensity()`); nothing else writes it.
 *
 * Takes the RAW 0..1 channel and applies `SNOW_COVER_MAX` here rather than at
 * the call site, so the one place that knows how white snow gets is this file
 * and a caller cannot accidentally drive the cap past it.
 */
export function setSnowCover(snowIntensity01: number): void {
  const s = snowIntensity01 < 0 ? 0 : snowIntensity01 > 1 ? 1 : snowIntensity01;
  getSnowCoverUniforms().uSnowCover.value = s * SNOW_COVER_MAX;
}

/** Current cap-scaled cover, for tests and for the driver's own assertions. */
export function getSnowCover(): number {
  return getSnowCoverUniforms().uSnowCover.value;
}

/** The line the fragment stage emits — exported so the test pins the exact
 *  operation (a `mix`, at cover, toward the snow colour) rather than merely
 *  „something was injected". */
export const SNOW_COVER_FRAGMENT_ANCHOR =
  "diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColor, snowCoverAmount );";

/**
 * onBeforeCompile hook — attach together with `snowCoverProgramCacheKey` so
 * three cannot hand a hooked material a program compiled without the hook (the
 * five prop materials differ only in uniform values, so their built-in program
 * parameters collide with every other unmapped vertex-coloured standard
 * material in the app).
 */
export function snowCoverOnBeforeCompile(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  const u = getSnowCoverUniforms();
  shader.uniforms.uSnowCover = u.uSnowCover;
  shader.uniforms.uSnowColor = u.uSnowColor;
  shader.uniforms.uSnowFacing = u.uSnowFacing;
  shader.uniforms.uSnowRoughness = u.uSnowRoughness;

  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\nvarying float vSnowUp;")
    .replace(
      "#include <defaultnormal_vertex>",
      // transformedNormal is VIEW space here and already carries instanceMatrix
      // for the instanced prop meshes; carry it back to world space so „up" is
      // the world's up and not the camera's.
      "#include <defaultnormal_vertex>\nvSnowUp = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix ).y;",
    );

  shader.fragmentShader = shader.fragmentShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uSnowCover;\nuniform vec3 uSnowColor;\nuniform vec2 uSnowFacing;\nuniform float uSnowRoughness;\nvarying float vSnowUp;",
    )
    .replace(
      // AFTER color_fragment: the prop materials are vertexColors:true and a
      // mix does not commute with the vColor multiply.
      "#include <color_fragment>",
      `#include <color_fragment>
      float snowCoverAmount = uSnowCover * smoothstep( uSnowFacing.x, uSnowFacing.y, vSnowUp );
      ${SNOW_COVER_FRAGMENT_ANCHOR}`,
    )
    .replace(
      "#include <roughnessmap_fragment>",
      "#include <roughnessmap_fragment>\nroughnessFactor = mix( roughnessFactor, uSnowRoughness, snowCoverAmount );",
    )
    .replace(
      // Snow is a dielectric. Without this the galvanised steel of a railing or
      // a lamp column (metalness 0.45) would tint its SPECULAR white and read
      // as painted chrome instead of as snow lying on metal.
      "#include <metalnessmap_fragment>",
      "#include <metalnessmap_fragment>\nmetalnessFactor = mix( metalnessFactor, 0.0, snowCoverAmount );",
    );
}

/** Stable cache key: every snow-hooked material shares one program per
 *  built-in-parameter combination (three still keys on defines). */
export const snowCoverProgramCacheKey = (): string => "prop-snow-cover-v1";
