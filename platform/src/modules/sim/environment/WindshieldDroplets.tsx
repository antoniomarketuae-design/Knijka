"use client";

// Subtle windshield droplet overlay for the cockpit camera. A single
// fullscreen triangle drawn last (renderOrder 999, no depth test) with a
// procedural two-scale droplet field; each drop appears, sits, and evaporates
// on its own phase so the glass feels alive without animated trails.
//
// The integrator mounts this inside the Canvas ONLY while the cockpit view is
// active. Intensity follows the shared weather channel by default (droplets
// while raining, a faint residue while the world dries) and can be overridden
// via the `intensity` prop. Renders nothing when dry or on the low preset.
//
// WIPED ARC (doc 62 #24): when a `wiperRef` channel is provided (VehicleRig
// writes the live blade state into it), the droplet field inside the blades'
// swept sector is suppressed by the channel's `clearing` level — the arc
// stays clear while the wipers run and droplets creep back after they stop.
// Two extra uniforms; the sector test is a handful of fragment ALU ops.

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial, ShaderMaterialParameters } from "three";
import { useQuality } from "./qualityStore";
import { getRainIntensity, getWetness, useRainIntensity, useWetness } from "./weather";

/** Fullscreen triangle in clip space (vertex shader passes it through). */
const TRIANGLE_POSITIONS = new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]);

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform float uIntensity;
uniform float uTime;
uniform float uAspect;
uniform float uWipeLevel;
varying vec2 vUv;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// One grid layer of droplets: ~18% of cells hold a drop with its own size,
// offset and lifecycle phase.
float dropLayer(vec2 uv, float cells, float t, float seed) {
  vec2 g = vec2(uv.x * uAspect, uv.y) * cells;
  vec2 id = floor(g);
  vec2 f = fract(g) - 0.5;
  float h = hash21(id + seed);
  float has = step(0.82, h);
  vec2 off = (vec2(fract(h * 17.13), fract(h * 31.7)) - 0.5) * 0.55;
  float r = 0.06 + 0.10 * fract(h * 7.31);
  float d = length(f - off);
  float phase = fract(t * (0.05 + 0.08 * fract(h * 3.7)) + h);
  float life = smoothstep(0.0, 0.1, phase) * (1.0 - smoothstep(0.75, 1.0, phase));
  float core = smoothstep(r, r * 0.55, d);
  float rim = smoothstep(r * 1.25, r, d) - smoothstep(r, r * 0.7, d);
  return has * life * (core * 0.55 + rim * 0.9);
}

void main() {
  float a = dropLayer(vUv, 22.0, uTime, 3.1)
          + dropLayer(vUv, 38.0, uTime * 1.3, 7.7) * 0.7;
  // Slightly denser toward the edges — reads as windshield, not screen dirt.
  float edge = 0.65 + 0.35 * smoothstep(0.25, 0.95, distance(vUv, vec2(0.5, 0.45)));
  // Wiped arc (doc 62 #24): a sector around the blade pivot (below the frame's
  // bottom centre) is kept clear while uWipeLevel is up. The angular band spans
  // the blades' sweep; soft radial + angular edges so the boundary reads as a
  // wipe line, not a mask. uWipeLevel = 0 compiles to a no-op multiply.
  vec2 pv = vec2((vUv.x - 0.5) * uAspect, vUv.y + 0.18);
  float ang = atan(pv.x, pv.y); // 0 = straight up, +right / -left
  float inSweep = (1.0 - smoothstep(0.9, 1.15, abs(ang - 0.12)))
                * smoothstep(0.10, 0.22, length(pv))
                * (1.0 - smoothstep(1.05, 1.3, length(pv)));
  a *= 1.0 - uWipeLevel * 0.92 * inSweep;
  gl_FragColor = vec4(vec3(0.82, 0.88, 0.96), a * edge * uIntensity * 0.16);
}
`;

export function WindshieldDroplets({
  intensity,
  wiperRef,
}: {
  intensity?: number;
  /** Live wiper state (doc 62 #24) — written per frame by VehicleRig.
   *  `clearing` 0..1 drives the wiped-arc droplet suppression. Absent =
   *  the shipped always-wet glass. */
  wiperRef?: RefObject<{ sweep01: number; clearing: number }>;
}) {
  const { level } = useQuality();
  const rain = useRainIntensity();
  const wetness = useWetness();
  const materialRef = useRef<ShaderMaterial>(null);

  const materialArgs = useMemo<[ShaderMaterialParameters]>(
    () => [
      {
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        uniforms: {
          uIntensity: { value: 0 },
          uTime: { value: 0 },
          uAspect: { value: 1 },
          uWipeLevel: { value: 0 },
        },
        transparent: true,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
      },
    ],
    [],
  );

  useFrame((state) => {
    const material = materialRef.current;
    if (!material) return;
    material.uniforms.uTime.value = state.clock.elapsedTime;
    material.uniforms.uAspect.value = state.size.width / Math.max(state.size.height, 1);
    material.uniforms.uIntensity.value =
      intensity ?? Math.max(getRainIntensity(), getWetness() * 0.3);
    material.uniforms.uWipeLevel.value = wiperRef?.current?.clearing ?? 0;
  });

  // Rain visuals are med+ (matching the streaks); skip entirely when dry.
  const effective = intensity ?? Math.max(rain, wetness * 0.3);
  if (level === "low" || effective <= 0.01) return null;

  return (
    <mesh frustumCulled={false} renderOrder={999}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[TRIANGLE_POSITIONS, 3]} />
      </bufferGeometry>
      <shaderMaterial ref={materialRef} args={materialArgs} />
    </mesh>
  );
}
