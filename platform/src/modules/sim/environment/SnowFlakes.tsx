"use client";

// Instanced snowfall in a camera-following box — RainStreaks' sibling: the
// same toroidal-wrap lifecycle, the same static-seed / GPU-scrolled design,
// the same "four uniform writes + one draw call" per-frame budget. Flake
// physics instead of streaks: slow fall, per-flake sine drift, round
// soft-edged spherical billboards.
//
// THE CALL (founder: winter questions exist but the map shows no snow —
// implement or remove): we IMPLEMENT the look instead of deleting the winter
// story. The snow-grip physics (0.4), the MIN-composed conditions speed
// envelopes and the чл.-cited winter lessons are already built and gated —
// only the VISUAL was missing (the honest scope cut documented in presets.ts
// / SimEnvironmentProps at the time). This file + the cold ground-bounce
// blend in SimEnvironment close that gap. White ground COVER (snow textures /
// meshes on the road) remains world-module asset work.
//
// Determinism: instance seeds come from the same mulberry32 PRNG at mount;
// runtime motion is a pure function of (uTime, seed) — sine sway phased by
// the seed, no Math.random in any frame path, zero useFrame allocations.

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
import { getSnowIntensity } from "./weather";

/** Half-extents of the flake box around the camera, meters (matches rain). */
const AREA_HALF = { x: 20, y: 12, z: 20 };
/** Base fall speed, m/s (jittered ±30% per flake in the shader) — real
 *  snowflakes drift down at ~1–2 m/s, nothing like rain's 9.5. */
const FALL_SPEED = 1.6;
/** Base flake quad size, meters (jittered per flake). Slightly larger than a
 *  real flake so it reads at cockpit distance — same cheat as the sun disc. */
const FLAKE_SIZE = 0.028;

/** Flake tint per time of day — bright cold white by day, dimly-lit cool grey
 *  at night (headlights and streetlights carry it there). */
const FLAKE_COLOR: Record<TimeOfDay, string> = {
  day: "#f7fafc",
  dusk: "#e9e6e2",
  night: "#96a2b5",
};

/** One unit quad: x/y in -0.5..0.5, billboarded in the vertex shader. */
const QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
]);
const QUAD_INDEX = new Uint16Array([0, 1, 2, 2, 1, 3]);

const VERTEX = /* glsl */ `
attribute vec3 aSeed;   // random point in [0,1)^3
attribute vec2 aRand;   // x: fall-speed jitter, y: size/sway jitter
uniform float uTime;
uniform vec3 uCenter;   // camera position
uniform vec3 uHalf;     // box half extents
uniform float uFall;    // base fall speed, m/s
varying vec2 vOffset;   // quad-local offset for the round alpha falloff

void main() {
  vec3 span = uHalf * 2.0;
  float speed = uFall * (0.7 + 0.6 * aRand.x);

  // Static column scrolled down over time, plus a deterministic seed-phased
  // sine sway (flakes flutter, they don't fall straight), wrapped into a box
  // centered on the camera — the RainStreaks toroidal pattern.
  vec3 base = aSeed * span;
  base.y -= uTime * speed;
  float phase = aSeed.x * 6.28318 + aSeed.z * 12.56637;
  float freq = 0.6 + 0.8 * aRand.y;
  base.x += sin(uTime * freq + phase) * 0.55;
  base.z += cos(uTime * freq * 0.83 + phase) * 0.4;
  vec3 rel = mod(base - uCenter, span) - uHalf;
  vec3 world = uCenter + rel;

  // Spherical billboard from the view-matrix basis (flakes face the camera).
  vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 camUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float size = ${FLAKE_SIZE.toFixed(4)} * (0.7 + 0.6 * aRand.y);
  vec3 p = world + (camRight * position.x + camUp * position.y) * size;

  vOffset = position.xy;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vOffset;

void main() {
  // Round soft-edged flake: near-solid core, feathered rim.
  float a = smoothstep(0.5, 0.18, length(vOffset)) * uOpacity;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Deterministic PRNG (mulberry32) — same contract as RainStreaks: render is
 *  pure, and a stable flake layout per count is a feature. */
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

export function SnowFlakes({ count, timeOfDay }: { count: number; timeOfDay: TimeOfDay }) {
  const materialRef = useRef<ShaderMaterial>(null);
  const initialized = useRef(false);

  // Static per-instance randomness; regenerated only if count changes.
  // Different seed constant than rain so co-mounted systems never correlate.
  const instanceData = useMemo(() => {
    const rng = mulberry32(0x5e0f ^ count);
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
          uFall: { value: FALL_SPEED },
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

  const goalColor = useMemo(() => new Color(FLAKE_COLOR[timeOfDay]), [timeOfDay]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const dt = initialized.current ? Math.min(delta, 0.1) : 1000;
    initialized.current = true;

    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    (u.uCenter.value as Vector3).copy(state.camera.position);
    u.uOpacity.value = getSnowIntensity() * 0.85;
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
