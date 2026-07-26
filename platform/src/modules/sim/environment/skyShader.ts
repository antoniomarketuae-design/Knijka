// SkyDome shader source + the numbers it is built from (doc 82 §3.2 V2/V3).
//
// Pure data & strings — deliberately NO three.js and no React imports, so
// vitest exercises the whole thing in plain Node (same rule as presets.ts).
// The GLSL is GENERATED from the constants below rather than hand-typed, so a
// test can assert the silhouette geometry and the shader can never drift from
// the documented numbers.
//
// WHY THIS EXISTS AT ALL. Doc 82 §1.2 measured the shipped dome at three
// terms — mix(zenith, horizon), a sun disc, procedural stars — over a
// permanent 22° sun, and 35–45 % of every frame was therefore a featureless
// sepia gradient carrying zero information. Two terms fix that inside the
// SAME fragment shader, with zero new draw calls, zero new textures and zero
// new dependencies:
//
//   V2  a two-octave domain-warped FBM cloud deck, and
//   V3  the Vitosha ridge — the cheapest Bulgaria-recognition cue that
//       exists. A 17-year-old in Sofia knows that silhouette; a razor-flat
//       horizon is what makes the sim read as generic-nowhere.
//
// Both are gated behind uniform branches (`if (uCloudDensity > 0.001)`,
// `if (uRidge > 0.001)`) exactly like the existing star branch, so they are
// coherent across the warp and cost nothing when damped to zero.

// ---------------------------------------------------------------------------
// The dome itself
// ---------------------------------------------------------------------------

/**
 * World radius of the sky dome, m (SkyDome's `radius` default). The shader is
 * scale-invariant — vDir is the normalised unit-sphere position and nothing
 * samples world distance — so this number is pure geometry, and it is pinned
 * here rather than inline in the component because TWO things now depend on it:
 *
 *  1. it must stay UNDER the main camera's far plane (900 m, LessonScene) or
 *     the dome is clipped to the clear colour (MirrorRig's REF 6 failure #1,
 *     which is why the mirror passes shrink it instead of raising their far);
 *  2. it must stay OVER GROUND_BACKDROP_RADIUS_M (./groundBackdropShader). The dome
 *     is depth-tested, so ground drawn beyond it terminates at its radius.
 */
export const SKY_DOME_RADIUS_M = 520;

// ---------------------------------------------------------------------------
// The Vitosha silhouette
// ---------------------------------------------------------------------------

/** One Gaussian hump of the far-horizon profile. */
export interface RidgeHump {
  /** Hump centre, degrees from DUE SOUTH, positive toward the west. */
  azimuthDeg: number;
  /** Gaussian half-width, degrees of azimuth. */
  widthDeg: number;
  /** Peak elevation above the true horizon, degrees. */
  elevationDeg: number;
}

/**
 * Sofia's horizon as a sum of Gaussians — the silhouette, not the map.
 *
 * Cherni Vrah is 2,290 m against a ~550 m city floor at ~15 km, so the summit
 * sits atan(1740 / 15000) ≈ 6.6° above the horizon and the massif fills
 * roughly SSW→SSE. The subsidiary humps are what stop it reading as one
 * symmetric bell: the long western shoulder falling toward Vladaya, the
 * eastern spur under Kopitoto, low Lyulin far to the west, and a faint Stara
 * Planina band across the north so the OPPOSITE horizon is not razor-flat
 * either (turn the car around and the world must still have edges).
 *
 * They SUM rather than max: overlapping tails are what make a massif read as
 * one connected ridge instead of separate mounds.
 */
export const VITOSHA_HUMPS: readonly RidgeHump[] = [
  { azimuthDeg: 4, widthDeg: 20, elevationDeg: 6.6 }, // Cherni Vrah
  { azimuthDeg: 26, widthDeg: 14, elevationDeg: 4.2 }, // western shoulder
  { azimuthDeg: -21, widthDeg: 13, elevationDeg: 3.4 }, // Kopitoto / east spur
  { azimuthDeg: 74, widthDeg: 16, elevationDeg: 1.5 }, // Lyulin
  { azimuthDeg: 180, widthDeg: 70, elevationDeg: 1.1 }, // Stara Planina
];

/** Signed azimuth difference wrapped into (−180, 180]. */
function wrapDeg(d: number): number {
  return d - 360 * Math.floor((d + 180) / 360);
}

/**
 * The SMOOTH crest elevation (degrees) at an azimuth measured from due south.
 * The shader evaluates exactly this sum and then adds up to
 * RIDGE_CREST_JITTER_DEG of hash-noise crest break-up on top, which is
 * silhouette detail only and deliberately not modelled here.
 */
export function ridgeElevationDeg(azimuthDeg: number): number {
  let e = 0;
  for (const h of VITOSHA_HUMPS) {
    const d = wrapDeg(azimuthDeg - h.azimuthDeg);
    e += h.elevationDeg * Math.exp(-((d / h.widthDeg) ** 2));
  }
  return e;
}

/** Peak-to-peak crest break-up added in the shader so the ridge line is not
 *  an analytically smooth curve (which reads as a vector graphic). */
export const RIDGE_CREST_JITTER_DEG = 0.16;
/** Half-width of the antialiasing band across the crest, in dir.y units.
 *  0.0016 ≈ 0.09°, about one pixel at the phone tier's 891 px / 75° hFOV. */
export const RIDGE_EDGE = 0.0016;
/** How far full rain swallows the massif (a rain curtain kills it long before
 *  it kills the sky gradient, so this is harsher than the sun-glow dim). */
export const RIDGE_RAIN_DIM = 0.75;
/** dir.y above which the ridge branch is skipped entirely. Must clear the
 *  tallest crest with margin; everything above it is pure sky. */
export const RIDGE_SKY_CUTOFF = 0.25;

// ---------------------------------------------------------------------------
// The cloud deck
// ---------------------------------------------------------------------------

/** Cell size of the base FBM octave on the projected cloud plane. */
export const CLOUD_SCALE = 1.6;
/** Guard added to dir.y before the projection divide. Together with
 *  CLOUD_HORIZON_FADE it bounds the plane coordinate near the horizon, which
 *  is where a 1/y projection would otherwise alias into shimmer. */
export const CLOUD_HORIZON_EPS = 0.045;
/** Below this dir.y the deck has faded out entirely (≈3.2° — just under the
 *  Vitosha crest, so cloud never paints over the ridge line). */
export const CLOUD_HORIZON_FADE = 0.055;
/** Domain-warp amplitude, in base-octave cells. This is the single term that
 *  turns concentric value-noise blobs into torn, wind-sheared cumulus. */
export const CLOUD_WARP = 1.15;
/** Width of the cover threshold ramp at the zenith. Widened toward the
 *  horizon (distant cloud loses contrast — and the wider ramp is also the
 *  antialiasing). */
export const CLOUD_SOFTNESS = 0.26;
/** Sun-side silver lining: how much sunTint is added to the cloud colour at
 *  the sun, and how tightly that falls off. */
export const CLOUD_SILVER = 0.9;
export const CLOUD_SILVER_POWER = 8;
/** Deck drift on the projected plane, cells per second. ~1 cell every two
 *  minutes: present in a 20 s clip, never distracting in a 10 min lesson. */
export const CLOUD_DRIFT_X = 0.0075;
export const CLOUD_DRIFT_Z = 0.0035;
/** Cover the deck grows to under full rain — a real overcast, which is what
 *  finally gives the rain lessons a sky that explains the light. */
export const RAIN_CLOUD_COVER = 0.92;

// ---------------------------------------------------------------------------
// Weather response (damped in SkyDome's useFrame, mirroring uStars/uGlow)
// ---------------------------------------------------------------------------

/**
 * Cover goal: rain pulls the deck toward overcast. Fog and snow are handled
 * on the DENSITY, not here — a fog bank hides the deck, it does not disperse
 * it.
 */
export function cloudCoverGoal(base: number, rain: number): number {
  return base + (RAIN_CLOUD_COVER - base) * rain;
}

/**
 * Density goal: the fog and snow washes replace the sky gradient wholesale
 * (SkyDome greys uZenith/uHorizon toward the bank colour), so the deck has to
 * disappear with them or it hangs INSIDE the fog bank.
 */
export function cloudDensityGoal(base: number, fog: number, snow: number): number {
  return base * (1 - fog) * (1 - snow);
}

/**
 * Ridge goal: same reasoning, plus rain. A 15 km sight line is the first
 * thing any weather takes away, so the massif fades well before the street
 * does.
 */
export function ridgeStrengthGoal(
  base: number,
  rain: number,
  fog: number,
  snow: number,
): number {
  return base * (1 - RIDGE_RAIN_DIM * rain) * (1 - fog) * (1 - snow);
}

// ---------------------------------------------------------------------------
// GLSL
// ---------------------------------------------------------------------------

/** Emit a GLSL float literal — integers must keep a decimal point or they
 *  become ints and every expression they touch fails to compile. */
function f(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

const RIDGE_SUM_GLSL = VITOSHA_HUMPS.map(
  (h) =>
    `  e += ridgeHump(azDeg, ${f(h.azimuthDeg)}, ${f(h.widthDeg)}, ${f(h.elevationDeg)});`,
).join("\n");

export const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position; // unit sphere in object space = view direction
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform float uHorizonCurve;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDiscCos;
uniform float uSunDiscIntensity;
uniform float uGlow;
uniform float uGlowPower;
uniform float uStars;
uniform float uCloudCover;
uniform float uCloudDensity;
uniform vec3 uCloudColor;
uniform float uRidge;
uniform vec3 uRidgeColor;
uniform float uTime;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

/** Smoothed 2D value noise — the FBM octave and the domain warp both use it. */
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 fr = fract(p);
  vec2 w = fr * fr * (3.0 - 2.0 * fr);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

/** Signed azimuth difference (degrees) wrapped into (-180, 180]. */
float ridgeDelta(float azDeg, float centreDeg) {
  float d = azDeg - centreDeg;
  return d - 360.0 * floor((d + 180.0) / 360.0);
}

/** One Gaussian hump, in degrees of elevation. The squaring is a MULTIPLY on
 *  purpose: GLSL's pow(x, y) is undefined for x < 0, and the wrapped azimuth
 *  delta is negative on half the horizon. */
float ridgeHump(float azDeg, float centreDeg, float widthDeg, float peakDeg) {
  float t = ridgeDelta(azDeg, centreDeg) / widthDeg;
  return peakDeg * exp(-t * t);
}

/** Crest elevation in DEGREES at an azimuth measured from due south. Sum of
 *  Gaussians generated from VITOSHA_HUMPS — see skyShader.ts. */
float ridgeElevationDeg(float azDeg) {
  float e = 0.0;
${RIDGE_SUM_GLSL}
  return e;
}

void main() {
  vec3 dir = normalize(vDir);
  float up = clamp(dir.y, 0.0, 1.0);
  vec3 col = mix(uZenith, uHorizon, pow(1.0 - up, uHorizonCurve));

  // Wide glow + hard disc around the sun/moon.
  float cosA = clamp(dot(dir, uSunDir), 0.0, 1.0);
  col += uSunColor * (uGlow * pow(cosA, uGlowPower));
  col += uSunColor * (uSunDiscIntensity *
    smoothstep(uSunDiscCos - 0.00012, uSunDiscCos + 0.00006, cosA));

  // Procedural stars: sparse 3D-cell hash, soft dots, slow twinkle.
  // uStars is a uniform, so this branch is coherent (free when 0).
  if (uStars > 0.001) {
    vec3 sp = dir * 90.0;
    vec3 cell = floor(sp);
    float h = hash13(cell);
    float star = step(0.9955, h);
    float d = length(fract(sp) - 0.5);
    float twinkle = 0.75 + 0.25 * sin(uTime * (1.5 + 4.0 * fract(h * 91.7)) + h * 40.0);
    star *= smoothstep(0.45, 0.05, d) * twinkle * smoothstep(0.03, 0.22, dir.y);
    col += vec3(0.9, 0.95, 1.0) * (star * uStars * (0.35 + 0.65 * fract(h * 57.3)));
  }

  // V2 — two-octave FBM cloud deck. Everything above is ADDITIVE, so the deck
  // composites over it with a mix() and correctly occludes the sun and stars
  // behind it.
  if (uCloudDensity > 0.001) {
    // Project onto a flat deck overhead. The 1/y divide IS the horizon
    // compression: cells stretch toward infinity at the horizon exactly the
    // way a real overcast crowds into a band before it runs out of sky.
    vec2 cp = dir.xz / (max(dir.y, 0.0) + ${f(CLOUD_HORIZON_EPS)}) * ${f(CLOUD_SCALE)};
    cp += vec2(${f(CLOUD_DRIFT_X)}, ${f(CLOUD_DRIFT_Z)}) * uTime;
    vec2 warp = vec2(vnoise(cp * 0.45), vnoise(cp * 0.45 + 19.7)) - 0.5;
    cp += warp * ${f(CLOUD_WARP)};
    float fbm = vnoise(cp) * 0.65 + vnoise(cp * 2.37 + 5.3) * 0.35;
    // Threshold ramp widens toward the horizon: distant cloud loses contrast,
    // and the same widening is what antialiases the compressed cells there.
    float soft = ${f(CLOUD_SOFTNESS)} + 0.5 * (1.0 - smoothstep(0.0, 0.35, dir.y));
    float cover = smoothstep(1.0 - uCloudCover, 1.0 - uCloudCover + soft, fbm);
    cover *= smoothstep(0.0, ${f(CLOUD_HORIZON_FADE)}, dir.y);
    vec3 cloudCol = uCloudColor +
      uSunColor * (${f(CLOUD_SILVER)} * pow(cosA, ${f(CLOUD_SILVER_POWER)}));
    col = mix(col, cloudCol, clamp(cover * uCloudDensity, 0.0, 1.0));
  }

  // V3 — the Vitosha ridge. Drawn LAST because the massif is 15 km away and
  // the deck is not: mountains occlude the clouds behind them.
  //
  // The dir.y ceiling is both an early-out (no crest can reach it, so the
  // whole upper sky skips the Gaussians) and the guard that keeps atan(0, 0)
  // — undefined, i.e. possibly NaN — off the zenith texel.
  if (uRidge > 0.001 && dir.y < ${f(RIDGE_SKY_CUTOFF)}) {
    // 0 = due south (+z, since district north maps to -z), positive west.
    float azDeg = degrees(atan(-dir.x, dir.z));
    float jitter = ${f(RIDGE_CREST_JITTER_DEG)} *
      (vnoise(vec2(azDeg * 0.9, 0.0)) - 0.5) * 2.0;
    float crest = sin(radians(ridgeElevationDeg(azDeg) + jitter));
    // NOT a reversed smoothstep: GLSL leaves edge0 >= edge1 undefined.
    float below = 1.0 - smoothstep(crest - ${f(RIDGE_EDGE)}, crest + ${f(RIDGE_EDGE)}, dir.y);
    // Aerial perspective, and the reason this is layered UNDER the fog wash:
    // uHorizon already carries the rain/snow/fog wash, so blending the
    // massif's feet into it drowns them in whatever haze the scene has, while
    // the crest keeps its own value. That gradient is the whole difference
    // between a mountain and a sticker.
    float aerial = smoothstep(-0.01, max(crest, 0.001), dir.y);
    vec3 ridgeCol = mix(uHorizon, uRidgeColor, 0.35 + 0.65 * aerial);
    col = mix(col, ridgeCol, below * uRidge);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
