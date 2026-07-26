// The GROUND half of the horizon — the numbers <GroundBackdrop/> is built from
// and the GLSL it splices. Pure data & math, deliberately NO three.js and no
// React (the skyShader.ts-to-SkyDome.tsx split, for the same reason), so
// vitest exercises the geometry and the haze ramp in plain Node.
//
// WHY THIS EXISTS AT ALL — measured, not assumed.
//
// `public/clips/sc-junction-stop__m0.k2.webp` renders `tj-stop-v1`, whose
// bounds are 300 x 120 m. `world/builders/terrain.ts` covers those bounds plus
// TERRAIN_MARGIN_M (60 m) and nothing else, so the ground physically STOPS 60 m
// past the junction — ~75 m from the chase camera. Sampling that frame down
// the centre column: row 179 (grass) is (105,108,70), row 172 is (138,132,102),
// and row 171 is already (197,185,162) — the sky dome's below-horizon band.
// A ~90-value luminance step in ONE pixel row, running dead straight across the
// whole frame. That is the "diorama sitting on a table" read, and unlike the
// content failures doc 82 §1.2 catalogued it is in EVERY exterior frame on
// EVERY map.
//
// Fog cannot fix it: FogExp2 at the day preset's 0.0028 is 1 - e^-(0.0028·75)²
// = 4.3 % opaque at 75 m. The ground edge is fully saturated where it ends, so
// the ONLY fix is ground that reaches the distance at which the haze IS opaque.
//
// THE FIX: one camera-following disc, GROUND_BACKDROP_RADIUS_M across, sitting
// just under the terrain. It is lit by the same two-light rig and fogged by the
// same FogExp2 as the terrain it continues, so its near edge matches the
// terrain's tone at every time of day and in every weather with no tuning, and
// its far edge converges on the scene's own haze colour — which is what an
// aerial-perspective horizon IS. One draw call, GROUND_BACKDROP_SEGMENTS
// triangles, no textures, no colliders, no shadow work: doc 82 §2.2's phone
// budget is 70 draws / 250k triangles per frame.
//
// It is NOT gated by `skyline` (./skyline). That gate asks "does this scene
// have a far horizon to hang a 2,290 m massif on?" and answers no for the
// fenced полигон and the parking lots. This asks "does the world continue past
// the edge of the map?", and the answer there is yes everywhere — a car park
// with a visible rectangular end of the world is exactly as broken as a street
// with one.

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/**
 * Disc radius, m. Load-bearing UPPER bound: it must stay INSIDE the sky dome
 * (SKY_DOME_RADIUS_M), because the dome is a depth-TESTED mesh sitting at its
 * own radius from the camera. Anything drawn beyond it either loses the depth
 * test or gets painted over by it, depending on which happens to sort first —
 * so a backdrop that reached past the dome would terminate at the dome's radius
 * in a draw-order-dependent way, which is the original bug with extra steps.
 *
 * Load-bearing LOWER bound: at this distance the clear-day haze must already be
 * near-opaque, or the rim is just the old terminator moved outward. At 480 m
 * the day preset is 84 % opaque before the horizon fade below finishes the job.
 */
export const GROUND_BACKDROP_RADIUS_M = 480;

/**
 * Radial segments. The count is free — it is ONE draw call at any value — so
 * this is purely "how round is the rim". 64 puts a vertex every 5.6°, which is
 * well under a pixel of rim curvature error at the rim's own distance.
 */
export const GROUND_BACKDROP_SEGMENTS = 64;

/**
 * Disc height, m. terrain.ts emits its vertices at `h - 0.01` with h >= 0, so
 * the lowest terrain vertex in any world is y = -0.01: the disc has to sit
 * below THAT, not below zero, or it z-fights the terrain across the whole map.
 * 0.34 m of separation is ~25 depth-buffer LSBs at 100 m and still ~1 LSB at
 * 750 m (near 0.1 / far 900, 24-bit depth), i.e. clean everywhere the two
 * surfaces overlap; and where they meet it is a 0.34 m step seen at >= 60 m,
 * which subtends < 0.33° — the far ground simply resumes on the same screen row.
 * VISUAL ONLY: there is no collider here, and the physics ground is unchanged.
 */
export const GROUND_BACKDROP_Y = -0.35;

/** Local rotation that lays the disc flat, facing up (radians about X). */
export const GROUND_BACKDROP_ROTATION_X = -Math.PI / 2;

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Albedo. The disc's whole job at its near edge is to be indistinguishable
 * from the terrain it continues, and the terrain's outer margin is always the
 * grass material (world/builders/terrain.ts only paves cells within
 * TERRAIN_PAVE_NEAR_BUILDING_M of a footprint, and the 60 m margin is past
 * every building).
 *
 * DERIVED, not eyeballed: `public/sim/textures/ground/color.png` (ambientCG
 * Grass004) averaged in LINEAR space — which is what the GPU's top mip actually
 * resolves to, since sRGB textures are linearised before filtering — is
 * #647034. Times 0.88 for the terrain's baked AO map (mean 0.808, applied to
 * the indirect share only, ~60 % of the day rig's ground irradiance) gives the
 * value below. Everything else about the two materials already matches:
 * meshStandardMaterial, roughness 1, metalness 0, flat up-normal (terrain
 * relief is TERRAIN_MAX_RELIEF_M = 0.25 m and masked to zero near roads).
 *
 * Any residual error is bounded by the terrain's own macro-variation hook,
 * which swings its albedo +-22 % over 40–80 m patches — a few percent of tone
 * difference reads as one more patch boundary, not as an edge of the world.
 */
export const GROUND_BACKDROP_ALBEDO = "#5e6931";

// ---------------------------------------------------------------------------
// The horizon fade
// ---------------------------------------------------------------------------

/**
 * Extra haze applied ON TOP of the scene fog, over the last stretch before the
 * rim, so the rim itself is EXACTLY the fog colour and the disc has no visible
 * terminator of its own.
 *
 * The band is deliberately narrow and deliberately far out. Everywhere closer
 * than GROUND_BACKDROP_HAZE_START_M the disc renders byte-identically to plain
 * scene fog, which is what keeps the seam against the real terrain invisible on
 * every map whose ground ends within 430 m — that is every scenario micro-map
 * (the largest, tj-stop-v1 at 300 x 120 m plus margin, ends 75 m from the
 * driver). By 430 m the clear-day haze is already 77 % opaque, so all this band
 * removes is the last quarter of a colour nobody can resolve at that distance.
 */
export const GROUND_BACKDROP_HAZE_START_M = 430;
/**
 * …and it completes BEFORE the rim, so the outermost ring is pure haze even
 * where the rim is a shade farther than the radius (a camera at height h sees
 * its rim at sqrt(R² + h²)). The 10 m of slack costs nothing.
 */
export const GROUND_BACKDROP_HAZE_END_M = 470;

/**
 * The extra haze opacity at a radial distance from the camera, 0..1.
 * `smoothstep` (not a linear ramp) so the term arrives and leaves with zero
 * gradient — a linear ramp's kink at the start of the band is itself a faint
 * line, which is the exact class of artefact this whole module exists to kill.
 */
export function horizonHazeAt(distanceM: number): number {
  const t = Math.min(
    1,
    Math.max(
      0,
      (distanceM - GROUND_BACKDROP_HAZE_START_M) /
        (GROUND_BACKDROP_HAZE_END_M - GROUND_BACKDROP_HAZE_START_M),
    ),
  );
  return t * t * (3 - 2 * t);
}

/** FogExp2's own opacity at a distance — three's `1 - e^-(density·depth)²`. */
export function fogOpacityAt(distanceM: number, density: number): number {
  const d = distanceM * density;
  return 1 - Math.exp(-(d * d));
}

/**
 * How much of the backdrop's own colour is gone at a distance: the scene fog
 * and the horizon fade compose as two independent veils. 1 = pure haze, i.e.
 * indistinguishable from the sky the dome paints just above it.
 */
export function backdropHazeAt(distanceM: number, fogDensity: number): number {
  return 1 - (1 - fogOpacityAt(distanceM, fogDensity)) * (1 - horizonHazeAt(distanceM));
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/** Emit a GLSL float literal — an integer without a decimal point is an int,
 *  and every expression it touches fails to compile (skyShader.ts's rule). */
function f(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

/**
 * The fragment spliced in immediately AFTER three's `<fog_fragment>` chunk on
 * the backdrop material (and only on it). Being after that chunk is the whole
 * design: it runs in the same colour space, mixes toward the same `fogColor`
 * uniform, and therefore produces exactly the pixel more fog would have —
 * so the rim lands on the scene's haze whatever the preset or weather does.
 *
 * `length(vViewPosition)` and NOT `vFogDepth`: three's fog is planar depth
 * (`-mvPosition.z`), so on a disc of constant RADIUS the rim's fog depth falls
 * off with the cosine of the view angle and the fade would finish in the middle
 * of the screen and not at all in the corners. vViewPosition is declared and
 * written unconditionally by meshphysical's vertex stage (verified against
 * three r0.185 `ShaderLib/meshphysical.glsl.js:4,48,130`), so its length is the
 * true radial distance with no extra varying.
 *
 * The `#ifdef USE_FOG` guard is required, not defensive: `fogColor` and the
 * whole chunk only exist under it.
 */
export const HORIZON_HAZE_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor,
    smoothstep(${f(GROUND_BACKDROP_HAZE_START_M)}, ${f(GROUND_BACKDROP_HAZE_END_M)},
      length(vViewPosition)));
#endif
`;

/** The three chunk the fade is spliced after — exported so the component and
 *  the test name the same anchor instead of two drifting string literals. */
export const HORIZON_HAZE_ANCHOR = "#include <fog_fragment>";
