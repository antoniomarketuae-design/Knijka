"use client";

// Instanced rain streaks in a camera-following box. Entirely GPU-driven:
// instance seeds are static; the vertex shader scrolls them down over time
// and wraps them around the camera (toroidal box), so the per-frame CPU cost
// is four uniform writes and the draw is a single call regardless of count.
//
// Streaks are cylindrically billboarded quads aligned with the fall+wind
// velocity, alpha-faded at both ends. Opacity follows the shared rain
// intensity channel so rain fades in/out instead of popping.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import {
  Color,
  DoubleSide,
  MathUtils,
  Vector3,
  type ShaderMaterial,
  type ShaderMaterialParameters,
} from "three";
import type { TimeOfDay } from "./presets";
import { getRainIntensity } from "./weather";

/** Half-extents of the streak box around the camera, meters. */
const AREA_HALF = { x: 20, y: 12, z: 20 };
/** Base fall speed, m/s (jittered ±25% per streak in the shader). */
const FALL_SPEED = 9.5;
/** Horizontal wind drift, m/s (x, z). */
const WIND = { x: 1.8, z: 0.4 };

/** Streak tint per time of day — rain is dark at night, pale silver by day. */
const STREAK_COLOR: Record<TimeOfDay, string> = {
  day: "#aebfd2",
  dusk: "#b39a86",
  night: "#3a4557",
};

/** One unit quad: x = width axis (-0.5..0.5), y = length axis (-0.5..0.5). */
const QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
]);
const QUAD_INDEX = new Uint16Array([0, 1, 2, 2, 1, 3]);

const VERTEX = /* glsl */ `
attribute vec3 aSeed;   // random point in [0,1)^3
attribute vec2 aRand;   // x: speed jitter, y: length jitter
uniform float uTime;
uniform vec3 uCenter;   // camera position
uniform vec3 uHalf;     // box half extents
uniform vec3 uWind;     // (windX, -fallSpeed, windZ) — un-normalized velocity
varying float vAlong;   // -0.5..0.5 along the streak

void main() {
  vec3 span = uHalf * 2.0;
  float speed = -uWind.y * (0.75 + 0.5 * aRand.x);

  // Static column, scrolled down over time, wrapped into a box centered on
  // the camera (toroidal wrap — imperceptible for rain).
  vec3 base = aSeed * span;
  base.y -= uTime * speed;
  vec3 rel = mod(base - uCenter, span) - uHalf;
  vec3 world = uCenter + rel;

  // Cylindrical billboard: width axis ⟂ (velocity, view), length along velocity.
  vec3 vel = normalize(vec3(uWind.x, uWind.y, uWind.z));
  vec3 toCam = cameraPosition - world;
  vec3 right = normalize(cross(vel, toCam));
  float len = 0.55 * (0.7 + 0.6 * aRand.y);
  vec3 p = world + right * (position.x * 0.014) + vel * (position.y * len);

  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;

void main() {
  float a = smoothstep(0.5, 0.3, abs(vAlong)) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Deterministic PRNG (mulberry32) — render must be pure, and a stable
 *  streak layout per count is a feature, not a bug. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function RainStreaks({ count, timeOfDay }: { count: number; timeOfDay: TimeOfDay }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const initialized = useRef(false);

  // Static per-instance randomness; regenerated only if count changes.
  const instanceData = useMemo(() => {
    const rng = mulberry32(0xa1d0 ^ count);
    const seeds = new Float32Array(count * 3);
    const rand = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = rng();
      seeds[i * 3 + 1] = rng();
      seeds[i * 3 + 2] = rng();
      rand[i * 2] = rng();
      rand[i * 2 + 1] = rng();
    }
    return { seeds, rand };
  }, [count]);

  const materialArgs = useMemo<[ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uCenter: { value: new Vector3() },
          uHalf: { value: new Vector3(AREA_HALF.x, AREA_HALF.y, AREA_HALF.z) },
          uWind: { value: new Vector3(WIND.x, -FALL_SPEED, WIND.z) },
          uColor: { value: new Color("#000000") },
          uOpacity: { value: 0 },
        },
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        fog: false,
      },
    ],
    [],
  );

  const goalColor = useMemo(() => new Color(STREAK_COLOR[timeOfDay]), [timeOfDay]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const dt = initialized.current ? Math.min(delta, 0.1) : 1000;
    initialized.current = true;

    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    (u.uCenter.value as Vector3).copy(state.camera.position);
    u.uOpacity.value = getRainIntensity() * 0.75;
    const c = u.uColor.value as Color;
    c.r = MathUtils.damp(c.r, goalColor.r, 2.2, dt);
    c.g = MathUtils.damp(c.g, goalColor.g, 2.2, dt);
    c.b = MathUtils.damp(c.b, goalColor.b, 2.2, dt);
  });

  return (
    <mesh frustumCulled={false}>
      <instancedBufferGeometry key={count} instanceCount={count}>
        <bufferAttribute attach="index" args={[QUAD_INDEX, 1]} />
        <bufferAttribute attach="attributes-position" args={[QUAD_POSITIONS, 3]} />
        <instancedBufferAttribute attach="attributes-aSeed" args={[instanceData.seeds, 3]} />
        <instancedBufferAttribute attach="attributes-aRand" args={[instanceData.rand, 2]} />
      </instancedBufferGeometry>
      <shaderMaterial ref={materialRef} args={materialArgs} />
    </mesh>
  );
}
