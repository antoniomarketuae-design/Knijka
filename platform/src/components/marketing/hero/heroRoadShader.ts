/**
 * The road surface — the GLSL <HeroRoad/> splices, and the numbers it is
 * built from. Pure strings & data, no three.js and no React (the
 * groundBackdropShader.ts / GroundBackdrop.tsx split, for the same reason).
 *
 * WHY SPLICE INSTEAD OF A ShaderMaterial. A raw ShaderMaterial would have to
 * reimplement the two things that make the shot sit in its own world: the
 * FogExp2 the sky dome's horizon is tuned against, and the AgX tone map the
 * whole product is graded in. Splicing into MeshStandardMaterial's chunks
 * gets both for free and forever — when the environment's fog or exposure
 * moves, the road moves with it and nobody has to remember this file exists.
 *
 * WHY NO TEXTURE. The simulator's asphalt set is 1.8 MB of KTX2 plus the
 * Basis transcoder (public/sim/textures/road), which is most of a phone's
 * whole first-playable budget spent on a marketing prop. Everything here is
 * arithmetic: one hash-based value noise for the macro variation the audit
 * asks for (doc 82 §1.2 item 7 — "beyond ~15 m it mips to flat grey"), and
 * analytic bands for the paint. Zero bytes on the wire, and the markings
 * stay crisp at any distance instead of mipping away.
 *
 * WHY THE PAINT FADES WITH DISTANCE. Doc 82 §2.2 warns that lane markings
 * "crawl" without MSAA at an upscale. This scene renders with canvas MSAA and
 * no composer, so the far field is exactly where a 0.15 m line becomes a
 * sub-pixel strobe. `uPaintFade*` dissolves the paint into the asphalt before
 * it can alias — which is also what real paint does under aerial perspective.
 */

// ---------------------------------------------------------------------------
// Splice anchors — three.js chunk includes, matched verbatim
// ---------------------------------------------------------------------------

/** Vertex: after this, `uv` is in scope and untouched. */
export const HERO_ROAD_VERTEX_UV_ANCHOR = "#include <uv_vertex>";
/** Vertex: after this, `mvPosition` holds the view-space position. */
export const HERO_ROAD_VERTEX_DEPTH_ANCHOR = "#include <project_vertex>";
/** Fragment: after this, `diffuseColor` holds the albedo. */
export const HERO_ROAD_FRAGMENT_ALBEDO_ANCHOR = "#include <map_fragment>";
/** Fragment: after this, `roughnessFactor` is set and not yet consumed. */
export const HERO_ROAD_FRAGMENT_ROUGHNESS_ANCHOR = "#include <roughnessmap_fragment>";

// ---------------------------------------------------------------------------
// Surface constants
// ---------------------------------------------------------------------------

/**
 * Base asphalt albedo. Darker than the simulator's mid-grey because this road
 * is damp at dusk — and because a dark road is what lets the paint, the sky
 * band and the tail lights carry the frame.
 */
export const HERO_ASPHALT_ALBEDO = "#15161b";
/** Lane paint albedo. Not pure white: fresh white reads as plastic tape. */
export const HERO_PAINT_ALBEDO = "#cfd4dc";

/** Dry-ish asphalt roughness; the paint is smoother, so it catches the sun. */
export const HERO_ASPHALT_ROUGHNESS = 0.62;
export const HERO_PAINT_ROUGHNESS = 0.34;

/** Where the paint starts and finishes dissolving into the asphalt, m. */
export const HERO_PAINT_FADE_START_M = 45;
export const HERO_PAINT_FADE_END_M = 150;

/** Peak-to-peak albedo swing of the macro variation (±12 %). */
export const HERO_ASPHALT_VARIATION = 0.24;
/** Feature size of the macro variation, m. Roughly a car length. */
export const HERO_ASPHALT_VARIATION_SCALE_M = 4.5;

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/**
 * Vertex splices. Two varyings rather than reusing three's `vViewPosition`:
 * that varying is declared by the lighting chunks and its presence depends on
 * material flags we do not control, so a road that silently stopped compiling
 * the day a flag changed is not worth the four saved bytes.
 */
export const HERO_ROAD_VERTEX_DECL = /* glsl */ `
varying vec2 vHeroUv;
varying float vHeroDepth;
`;

export const HERO_ROAD_VERTEX_UV = /* glsl */ `
  vHeroUv = uv;
`;

export const HERO_ROAD_VERTEX_DEPTH = /* glsl */ `
  vHeroDepth = -mvPosition.z;
`;

export const HERO_ROAD_FRAGMENT_DECL = /* glsl */ `
varying vec2 vHeroUv;
varying float vHeroDepth;

uniform float uScrollM;
uniform float uRoadWidthM;
uniform float uRoadLengthM;
uniform float uDashPeriodM;
uniform float uDashDuty;
uniform float uMarkWidthM;
uniform float uLaneWidthM;
uniform vec3  uPaintColor;
uniform float uPaintRoughness;
uniform float uPaintFadeStartM;
uniform float uPaintFadeEndM;
uniform float uVariation;
uniform float uVariationScaleM;

/** Hash-based value noise. One octave is enough: this is macro variation,
 *  not a detail map, and a second octave costs a fragment for nothing at the
 *  4.5 m feature size the camera actually stares at. */
float heroHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float heroNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(heroHash(i), heroHash(i + vec2(1.0, 0.0)), u.x),
    mix(heroHash(i + vec2(0.0, 1.0)), heroHash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

/** 1 inside a band of half-width \`halfWidth\` centred on \`centre\`,
 *  antialiased over one screen pixel of the coordinate (fwidth), so a 0.15 m
 *  line never hard-edges into stair-steps at grazing angles. (\`half\` is a
 *  RESERVED word in GLSL ES — naming the parameter that fails to compile.) */
float heroBand(float x, float centre, float halfWidth) {
  float d = abs(x - centre);
  float aa = max(fwidth(x), 1e-4);
  return 1.0 - smoothstep(halfWidth - aa, halfWidth + aa, d);
}

/** How much paint is on this fragment: broken centre line + two edge lines. */
float heroPaintMask(float xM, float zM) {
  float dash = step(fract(zM / uDashPeriodM), uDashDuty);
  float centre = heroBand(xM, 0.0, uMarkWidthM * 0.5) * dash;
  float edgeX = uLaneWidthM;
  float edges =
    heroBand(xM, -edgeX, uMarkWidthM * 0.5) + heroBand(xM, edgeX, uMarkWidthM * 0.5);
  return clamp(centre + edges, 0.0, 1.0);
}

/** Road-space metres for this fragment: x across (0 = centre line), z along
 *  (already scrolled). Shared by the albedo and roughness splices so the two
 *  can never disagree about where the paint is. */
vec2 heroRoadMetres() {
  return vec2((vHeroUv.x - 0.5) * uRoadWidthM, vHeroUv.y * uRoadLengthM + uScrollM);
}

float heroPaintHere() {
  vec2 m = heroRoadMetres();
  float fade = 1.0 - smoothstep(uPaintFadeStartM, uPaintFadeEndM, vHeroDepth);
  return heroPaintMask(m.x, m.y) * fade;
}
`;

export const HERO_ROAD_FRAGMENT_ALBEDO = /* glsl */ `
  {
    vec2 heroM = heroRoadMetres();
    // Macro variation: patches, old repairs, the tar-seam tone shift. Centred
    // on 1.0 so the authored albedo stays the mean, never darkened overall.
    float n = heroNoise(heroM / uVariationScaleM);
    diffuseColor.rgb *= 1.0 + (n - 0.5) * uVariation;
    diffuseColor.rgb = mix(diffuseColor.rgb, uPaintColor, heroPaintHere());
  }
`;

export const HERO_ROAD_FRAGMENT_ROUGHNESS = /* glsl */ `
  roughnessFactor = mix(roughnessFactor, uPaintRoughness, heroPaintHere());
`;

/**
 * Every uniform name the fragment declares. Exported so the test can assert
 * the component's uniform object and the GLSL cannot drift apart — the
 * failure mode otherwise is a silent black road, because three leaves an
 * undeclared uniform at zero.
 */
export const HERO_ROAD_UNIFORM_NAMES: readonly string[] = [
  "uScrollM",
  "uRoadWidthM",
  "uRoadLengthM",
  "uDashPeriodM",
  "uDashDuty",
  "uMarkWidthM",
  "uLaneWidthM",
  "uPaintColor",
  "uPaintRoughness",
  "uPaintFadeStartM",
  "uPaintFadeEndM",
  "uVariation",
  "uVariationScaleM",
];

/** One program, compiled once — three's cache key for this material. */
export const HERO_ROAD_PROGRAM_CACHE_KEY = "marketing-hero-road";
