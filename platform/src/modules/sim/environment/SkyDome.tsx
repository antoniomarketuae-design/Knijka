"use client";

// Gradient sky dome + sun/moon disc + procedural stars. One draw call, a few
// dozen ALU ops per sky pixel — cheaper and far more art-directable across
// day/dusk/night than drei's <Sky> (a daytime scattering model). The dome
// follows the camera so it can never be approached or clipped.
//
// All uniforms are damped toward the active preset every frame (first frame
// snaps), so time-of-day switches crossfade instead of popping; rain
// desaturates the gradient and hides the stars via the shared weather channel.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  BackSide,
  Color,
  MathUtils,
  Vector3,
  type Group,
  type ShaderMaterial,
  type ShaderMaterialParameters,
} from "three";
import { ENVIRONMENT_PRESETS, sunDirection, type TimeOfDay } from "./presets";
import { getFogIntensity, getRainIntensity, getSnowIntensity } from "./weather";

/** How far the FOG weather pulls the whole sky gradient toward the fog color
 *  at full intensity — near-total: in dense fog there IS no sky, only the
 *  bank (0.85 keeps a hint of gradient so the dome never reads flat-painted). */
const FOG_SKY_WASH = 0.85;

/** How far SNOW weather pulls the sky toward its cold snow-haze color —
 *  lighter than the fog wash: a snow overcast is a bright white sheet with a
 *  little gradient left, not a bank you cannot see through. Applied BEFORE
 *  the fog wash so fog wins a foggy snow. */
const SNOW_SKY_WASH = 0.75;

/** Damping stiffness for preset crossfades (≈2 s to settle). */
const FADE_LAMBDA = 2.2;

/** How far RAIN pulls the sky gradient toward its cool overcast grey at full
 *  intensity (0 = keep the dry hue, 1 = flat overcast). Raised from the shipped
 *  inline 0.55 — the founder v4 read the rained-out sky as a bright warm day
 *  because it kept nearly half its cream/blue. At 0.8 the warm dry gradient is
 *  mostly gone and the dome reads as a grey sheet. RAIN-ONLY (gated by `rain`),
 *  so dry/fog/snow skies are byte-identical. */
const RAIN_SKY_GRAY = 0.8;
/** Luminance multiplier of the rain overcast grey target — below 1 so the
 *  rained-out sky sits DARKER than the dry gradient's own brightness (a gloomy
 *  sheet, not a bright silver one). Was inline 0.85. */
const RAIN_SKY_LUMA = 0.55;
/** Cool cast of the overcast grey (r,g,b multipliers): a rain sky is faintly
 *  blue-cool, the opposite of the warm dry haze — the cue that sells „rain" over
 *  „dim". Kept subtle so the dome never reads tinted-blue, just un-warm. */
const RAIN_SKY_COOL_R = 0.94;
const RAIN_SKY_COOL_G = 0.98;
const RAIN_SKY_COOL_B = 1.06;
/** Rain hides the sun disc almost entirely (was 0.85) — a light-rain overcast
 *  has no sun disc at all, only a vague bright patch the glow still hints at. */
const RAIN_SUN_DISC_DIM = 0.97;
/** …and cuts the wide glow hard (was 0.7): the diffuse brightness stays as a
 *  faint hotspot so the sun's rough position still reads, without the dry beam. */
const RAIN_SUN_GLOW_DIM = 0.88;

/** Scene name of the dome mesh. The A4 mirror rig (MirrorRig.tsx) looks it up
 *  to temporarily SHRINK the dome inside its short mirror-camera far plane
 *  during RTT passes — safe because the shader is scale-invariant (vDir is the
 *  normalized unit-sphere position; nothing samples world distance). */
export const SKY_DOME_NAME = "sim-sky-dome";

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position; // unit sphere in object space = view direction
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
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
uniform float uTime;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
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

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

function dampColor(cur: Color, goal: Color, lambda: number, dt: number): void {
  cur.r = MathUtils.damp(cur.r, goal.r, lambda, dt);
  cur.g = MathUtils.damp(cur.g, goal.g, lambda, dt);
  cur.b = MathUtils.damp(cur.b, goal.b, lambda, dt);
}

export function SkyDome({ timeOfDay, radius = 520 }: { timeOfDay: TimeOfDay; radius?: number }) {
  const groupRef = useRef<Group>(null);
  const materialRef = useRef<ShaderMaterial>(null);
  const initialized = useRef(false);

  // Material constructor args — created once; real values are written into
  // the uniforms on the first frame (snap) and damped every frame after.
  const materialArgs = useMemo<[ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uZenith: { value: new Color("#000000") },
          uHorizon: { value: new Color("#000000") },
          uHorizonCurve: { value: 1.7 },
          uSunDir: { value: new Vector3(0, 1, 0) },
          uSunColor: { value: new Color("#000000") },
          uSunDiscCos: { value: 1 },
          uSunDiscIntensity: { value: 0 },
          uGlow: { value: 0 },
          uGlowPower: { value: 16 },
          uStars: { value: 0 },
          uTime: { value: 0 },
        },
        side: BackSide,
        depthWrite: false,
        fog: false,
      },
    ],
    [],
  );

  // Damped base values (pre-rain), separate from the uniforms which carry the
  // final rain-adjusted colors. Scratch never allocates in useFrame.
  const scratchRef = useRef({
    zenith: new Color("#000000"),
    horizon: new Color("#000000"),
    sun: new Color("#000000"),
    sunDir: new Vector3(0, 1, 0),
    gray: new Color(),
    fogWash: new Color(),
    snowWash: new Color(),
  });

  // Goal values re-derived only when the preset changes.
  const goal = useMemo(() => {
    const p = ENVIRONMENT_PRESETS[timeOfDay];
    const s = sunDirection(p.light.sun);
    return {
      zenith: new Color(p.sky.zenith),
      horizon: new Color(p.sky.horizon),
      sun: new Color(p.sky.sunTint),
      fogWeather: new Color(p.fogWeather.color),
      snowWeather: new Color(p.snowWeather.color),
      sunDir: new Vector3(s.x, s.y, s.z),
      horizonCurve: p.sky.horizonCurve,
      discCos: Math.cos((p.sky.sunDiscDeg * Math.PI) / 180),
      discIntensity: p.sky.sunDiscIntensity,
      glow: p.sky.sunGlowIntensity,
      glowPower: p.sky.sunGlowPower,
      stars: p.sky.starsIntensity,
    };
  }, [timeOfDay]);

  useFrame((state, delta) => {
    if (groupRef.current) groupRef.current.position.copy(state.camera.position);
    const material = materialRef.current;
    if (!material) return;

    // First frame snaps straight to the preset (damp with dt→∞ lands exactly).
    const dt = initialized.current ? Math.min(delta, 0.1) : 1000;
    initialized.current = true;

    const u = material.uniforms;
    const base = scratchRef.current;
    const rain = getRainIntensity();
    const fog = getFogIntensity();
    const snow = getSnowIntensity();

    dampColor(base.zenith, goal.zenith, FADE_LAMBDA, dt);
    dampColor(base.horizon, goal.horizon, FADE_LAMBDA, dt);
    dampColor(base.sun, goal.sun, FADE_LAMBDA, dt);
    base.sunDir.x = MathUtils.damp(base.sunDir.x, goal.sunDir.x, FADE_LAMBDA, dt);
    base.sunDir.y = MathUtils.damp(base.sunDir.y, goal.sunDir.y, FADE_LAMBDA, dt);
    base.sunDir.z = MathUtils.damp(base.sunDir.z, goal.sunDir.z, FADE_LAMBDA, dt);

    // Rain: pull the gradient toward its own luminance (overcast gray),
    // soften the sun, hide the stars. SNOW weather then washes the gradient
    // toward its cold snow-haze color (a bright winter sheet), and FOG
    // weather washes over BOTH toward the preset's fog color (in a dense
    // bank there is no sky) — applied last so fog wins a foggy rain/snow.
    const grayOut = (target: Color, from: Color, amount: number) => {
      const l = (0.299 * from.r + 0.587 * from.g + 0.114 * from.b) * RAIN_SKY_LUMA;
      base.gray.setRGB(l * RAIN_SKY_COOL_R, l * RAIN_SKY_COOL_G, l * RAIN_SKY_COOL_B);
      target.copy(from).lerp(base.gray, rain * amount);
      target.lerp(base.snowWash.copy(goal.snowWeather), snow * SNOW_SKY_WASH);
      target.lerp(base.fogWash.copy(goal.fogWeather), fog * FOG_SKY_WASH);
    };
    grayOut(u.uZenith.value as Color, base.zenith, RAIN_SKY_GRAY);
    grayOut(u.uHorizon.value as Color, base.horizon, RAIN_SKY_GRAY);
    (u.uSunColor.value as Color).copy(base.sun);
    (u.uSunDir.value as Vector3).copy(base.sunDir).normalize();

    u.uHorizonCurve.value = MathUtils.damp(u.uHorizonCurve.value as number, goal.horizonCurve, FADE_LAMBDA, dt);
    u.uSunDiscCos.value = MathUtils.damp(u.uSunDiscCos.value as number, goal.discCos, FADE_LAMBDA, dt);
    u.uSunDiscIntensity.value = MathUtils.damp(
      u.uSunDiscIntensity.value as number,
      goal.discIntensity * (1 - RAIN_SUN_DISC_DIM * rain) * (1 - fog) * (1 - 0.9 * snow),
      FADE_LAMBDA,
      dt,
    );
    u.uGlow.value = MathUtils.damp(
      u.uGlow.value as number,
      goal.glow * (1 - RAIN_SUN_GLOW_DIM * rain) * (1 - fog) * (1 - 0.8 * snow),
      FADE_LAMBDA,
      dt,
    );
    u.uGlowPower.value = MathUtils.damp(u.uGlowPower.value as number, goal.glowPower, FADE_LAMBDA, dt);
    u.uStars.value = MathUtils.damp(
      u.uStars.value as number,
      goal.stars * (1 - rain) * (1 - fog) * (1 - snow),
      FADE_LAMBDA,
      dt,
    );
    u.uTime.value = state.clock.elapsedTime;
  });

  return (
    <group ref={groupRef}>
      <mesh name={SKY_DOME_NAME} scale={radius} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
        <shaderMaterial ref={materialRef} args={materialArgs} />
      </mesh>
    </group>
  );
}
