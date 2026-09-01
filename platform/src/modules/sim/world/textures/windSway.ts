/**
 * WIND YOU CAN SEE — the canopy bend that makes `physics.crosswind` visible.
 *
 * WHY THIS FILE EXISTS — sweep161 `sc-ac-crosswind:e0b9507e`, critical: „wind
 * is never depicted in any form: no swaying trees, no drifting debris, no
 * leaning vehicles". The copy half of that row was repaired in
 * `lessons/scenario/templates-conditions.ts` (the bridge, the exposed span and
 * the lorry are gone, and `conditions-sweep161-truth.test.ts` keeps them gone).
 * The DEPICTION half was not, and `environment/weather.ts` §4 and §5 routed it
 * here in as many words: „the disturbance has to be shown where it already
 * exists — the world props and the car's own attitude", and „a fifth 0..1 in
 * [the weather] store would have no author and no reader, i.e. the dead
 * predicate this lane exists to stop shipping."
 *
 * So the wind is not given a weather channel. It is given the only author it
 * has ever had — `VehicleSim`'s own wind term, the exact newtons the chassis
 * is being pushed with this frame — and the trees bend on THAT. Picture and
 * force cannot drift apart, because they are one number: `VehicleSim.step()`
 * and `VehicleSim.windLateralNow` both read `currentWindN()`.
 *
 * WHAT THE STUDENT GETS, AND WHY IT IS PEDAGOGY AND NOT DECORATION. AC-12's
 * hardest instruction is „отпусни корекцията плавно, щом поривът отслабне" —
 * release the counter-steer as the gust dies. On a screen there is no seat and
 * no wheel-weight, so before this hook a student had NO channel through which
 * to know when the gust was dying; he could only discover it after the car had
 * already moved, which is the exact reflex („вторият замах") the lesson is
 * trying to break. The canopies lean the way the car is being pushed and
 * breathe on the gust's own 5 s sine, so the cue arrives BEFORE the push —
 * which is what reading the road actually means.
 *
 * WHY THE VERTEX STAGE AND WHY WORLD SPACE. Trees are instanced with a
 * per-instance YAW and a non-uniform variant scale (`WorldProps`
 * `createTreeInstancedMesh`), so a displacement written in the model's own X
 * would point in 40 different compass directions down one street. The bend is
 * therefore computed against the vertex's WORLD height and applied along the
 * WORLD X axis, carried into view space as `viewMatrix[0].xyz` — the image of
 * world +X under the view transform.
 *
 * WHAT IT DELIBERATELY DOES NOT TOUCH.
 *  - Only `materials.tree` carries the hook. A bending bollard or a rippling
 *    sign plate would be worse than a still street: the surfaces the rule
 *    engine grades the student on stay rigid and legible, the same discipline
 *    `snowCover.ts` states for sign faces and signal lenses.
 *  - `transformed` itself is NOT moved, so world position, normals, the
 *    depth/shadow pass and the colliders are all untouched. The canopy's
 *    SHADOW does not sway. That is a known, bounded shortfall — shadows are
 *    cast by trees only at quality "high" (`preset.castShadows === "full"`) —
 *    and it is preferred to bending the depth material, which would put a
 *    second, independently-compiled copy of this maths in the frame.
 *
 * PROVABLY FREE ON EVERY OTHER LESSON, which is what makes it shippable
 * without looking at 150 scenarios: `uWindSway` is 0 unless a lesson authors
 * `physics.crosswind` (the corpus authors it twice), and the injected term is
 * `mvPosition.xyz += 0.0 * viewMatrix[0].xyz` — an exact identity, not an
 * approximate one. `windSway.test.ts` pins that shape.
 */

import * as THREE from "three";

/**
 * The force at which the canopies reach their full lean, newtons.
 *
 * This is the PEAK of the shipped crosswind: `tuning.CROSSWIND_BRIDGE_N`
 * (1200) + `tuning.CROSSWIND_GUST_AMPLITUDE_N` (500). It is written here as a
 * number rather than imported so that `sim/world` does not take a dependency
 * on `sim/vehicle` for one constant — and `windSway.test.ts` asserts the
 * equality against the real tuning constants, so a retune there turns this
 * red instead of quietly rescaling the picture.
 */
export const WIND_SWAY_REFERENCE_N = 1700;

/**
 * Lateral displacement of a fully exposed crown at `WIND_SWAY_REFERENCE_N`,
 * metres.
 *
 * WORKED, because a sway that cannot be seen repairs nothing and a sway that
 * can be laughed at is worse. The shipped gust runs the total force between
 * 700 N (lull) and 1700 N (peak), so the crown travels between 0.29 m and
 * 0.70 m — a 0.41 m swing with a 5 s period. On a 7 m street tree that is a
 * ~5.7° lean at peak: strong-wind posture, not a storm. Seen from the driving
 * position (~20 m to the nearest verge tree, ~35° of vertical FOV over a
 * 1440-wide frame) the swing subtends ≈ 0.02 rad ≈ 48 px of on-screen travel,
 * so the breathing is legible at a glance rather than sub-pixel.
 */
export const WIND_SWAY_MAX_M = 0.7;

/**
 * The bend window in WORLD metres above the ground. Below `TRUNK` a vertex is
 * in the trunk and does not move at all (a street tree pivots at the crown,
 * not at the root, and a sheared trunk reads as a bug); above `CROWN` it takes
 * the full lean. The streetscape kit's trees stand on y = 0 (`TreePlacement`
 * positions carry y = 0 and the GLBs are baked base-at-origin), so world Y is
 * height above the pavement with no per-instance base to subtract.
 */
export const WIND_SWAY_TRUNK_M = 1.6;
export const WIND_SWAY_CROWN_M = 6.0;

let uniforms: {
  uWindSway: { value: number };
  uWindHeight: { value: THREE.Vector2 };
} | null = null;

/**
 * Lazy singleton — ONE uniform set shared by every hooked material, so the
 * per-frame driver is a single float write. Same discipline as
 * `snowCover.ts` / `macroVariation.ts`: `onBeforeCompile` hands three the
 * uniform OBJECT by reference, so writing `.value` here reaches every
 * compiled program.
 */
function getWindSwayUniforms() {
  if (!uniforms) {
    uniforms = {
      uWindSway: { value: 0 },
      uWindHeight: { value: new THREE.Vector2(WIND_SWAY_TRUNK_M, WIND_SWAY_CROWN_M) },
    };
  }
  return uniforms;
}

/**
 * THE WRITER. `VehicleRig` calls this once per render frame with
 * `VehicleSim.windLateralNow` — the signed lateral force in newtons along
 * world +X that the chassis is being pushed with THIS FRAME (negative = the
 * wind blows west). Nothing else writes it.
 *
 * The newtons→metres mapping lives here, not at the call site, so the one
 * place that knows how far a tree bends is this file and a caller cannot
 * drive the crown past `WIND_SWAY_MAX_M`.
 */
export function setWindSway(lateralN: number): void {
  const n = Number.isFinite(lateralN) ? lateralN : 0;
  const ratio = n / WIND_SWAY_REFERENCE_N;
  const clamped = ratio < -1 ? -1 : ratio > 1 ? 1 : ratio;
  getWindSwayUniforms().uWindSway.value = clamped * WIND_SWAY_MAX_M;
}

/** Current crown displacement in metres (signed), for tests and assertions. */
export function getWindSway(): number {
  return getWindSwayUniforms().uWindSway.value;
}

/**
 * The two lines the vertex stage emits, exported so the test pins the exact
 * operation — a height-graded lean along world +X — rather than merely
 * „something was injected".
 */
export const WIND_SWAY_BEND_ANCHOR =
  "float windSwayBend = uWindSway * smoothstep( uWindHeight.x, uWindHeight.y, windSwayWorld.y );";
export const WIND_SWAY_VERTEX_ANCHOR = "mvPosition.xyz += windSwayBend * viewMatrix[ 0 ].xyz;";

/**
 * onBeforeCompile hook — attach together with `windSwayProgramCacheKey` so
 * three cannot hand a hooked material a program compiled without the hook.
 *
 * The splice brackets `#include <project_vertex>` instead of replacing it:
 * the chunk stays three's, and only the world position it needs is recomputed
 * ahead of it (the same two `#ifdef`s the chunk itself uses, so a batched or
 * instanced draw resolves identically). After the chunk, `mvPosition` is in
 * VIEW space and `gl_Position` is re-projected from it.
 */
export function windSwayOnBeforeCompile(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  const u = getWindSwayUniforms();
  shader.uniforms.uWindSway = u.uWindSway;
  shader.uniforms.uWindHeight = u.uWindHeight;

  shader.vertexShader = shader.vertexShader
    .replace(
      "#include <common>",
      "#include <common>\nuniform float uWindSway;\nuniform vec2 uWindHeight;",
    )
    .replace(
      "#include <project_vertex>",
      `vec4 windSwayLocal = vec4( transformed, 1.0 );
      #ifdef USE_BATCHING
        windSwayLocal = batchingMatrix * windSwayLocal;
      #endif
      #ifdef USE_INSTANCING
        windSwayLocal = instanceMatrix * windSwayLocal;
      #endif
      vec4 windSwayWorld = modelMatrix * windSwayLocal;
      ${WIND_SWAY_BEND_ANCHOR}
#include <project_vertex>
      ${WIND_SWAY_VERTEX_ANCHOR}
      gl_Position = projectionMatrix * mvPosition;`,
    );
}

/** Stable cache key — composed with the snow hook's on the tree material, so
 *  a swaying canopy never shares a program with a rigid bollard. */
export const windSwayProgramCacheKey = (): string => "prop-wind-sway-v1";
