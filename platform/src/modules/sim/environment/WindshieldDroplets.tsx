"use client";

// Subtle windshield droplet overlay for the cockpit camera. A single
// fullscreen triangle drawn last (renderOrder 999) with a procedural two-scale
// droplet field; each drop appears, sits, and evaporates on its own phase so
// the glass feels alive without animated trails.
//
// ═══════════════════════════════════════════════════════════════════════════
// THE DROPLETS WERE INSIDE THE CABIN — sweep 161, sc-ac-rain-lights.
//
// „Rain particles are drawn inside the cabin. On PC the same round droplets
//  that fill the sky also pepper the dashboard, the steering wheel boss and
//  the area around the cockpit control labels — one sits directly beside
//  СВЕТЛИНИ and another below КОЛАН. The precipitation layer is not clipped
//  to the glass."
//
// Opened at 1440 × 900 (.audit-frames/sweep161/sc-ac-rain-lights/pc-right/
// 04-t090s.png) and cropped to the instrument binnacle, it is all of that and
// one thing the finding did not record: a droplet sits ON THE SPEEDOMETER
// DIAL FACE, and another on the wheel rim. This is a rain lesson whose task
// line is „дръж под 47 км/ч" — the layer was putting specks over the exact
// readout the objective is graded from. Filed `minor`; it is not.
//
// THE CAUSE WAS ONE FLAG. The sheet is a clip-space fullscreen triangle, and
// it shipped `depthTest: false` — so it composited over every pixel of the
// frame, cabin included. (Turning the flag on alone would have changed
// nothing: the vertex shader emitted `gl_Position.z = 0.0`, which under this
// scene's projection is 0.2 m from the eye — nearer than any part of the car,
// so the sheet still wins every comparison. The DEPTH is the fix; the flag is
// only what lets it be read.)
//
// WHERE THE SHEET NOW SITS, and why a flat depth is enough. The cockpit
// camera is rigidly mounted, so the cabin occupies a fixed band of view-space
// distance. Measured from the shipped constants — COCKPIT_EYE (0.24, 0.71,
// −0.255) against the windshield plane VehicleRig rakes through the A3
// aperture (centre 0, 0.66, 0.76 · rotX −0.62 · 1.5 × 0.55 m) and the door
// mirror housings (±0.905, 0.455, 0.592):
//
//     wheel rim / cluster    ≈ 0.5 – 0.7 m
//     glass header edge      ≈ 0.905 m
//     glass cowl edge        ≈ 1.230 m
//     LEFT mirror housing    ≈ 1.447 m   ← the FARTHEST thing in the cabin
//     ─────────────────────────────────────────────────────────────────────
//     nearest tarmac the driver can see over the cowl   ≈ 4.537 m
//
// Everything the student must not see droplets on is nearer than 1.447 m;
// everything seen THROUGH the glass is farther than 4.537 m. That gap is wide
// and it does not move, so the sheet does not need to be the glass — it only
// needs to sit inside the gap, and then the depth buffer does the clipping
// exactly, per pixel, for free. GLASS_SHEET_DISTANCE_M is the geometric
// midpoint of the two bounds (max log-margin: 1.73× clear of the mirror,
// 1.81× clear of the tarmac).
//
// WHAT A FLAT SHEET COSTS, stated rather than discovered later: world geometry
// closer than GLASS_SHEET_DISTANCE_M loses its droplets — i.e. a bumper under
// ~2.5 m from the driver's eye, which is a collision, not a following
// distance. The alternative (per-pixel depth of the real raked plane) buys
// that back for a `gl_FragDepth` write on every pixel of a fullscreen pass,
// which kills early-Z on exactly the 4 GB phones doc 82 §2.3 is written for.
// Not worth it for a case the student only reaches by crashing.
// ═══════════════════════════════════════════════════════════════════════════
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

/**
 * View-space distance the droplet sheet is depth-tested at, metres.
 *
 * The geometric midpoint of the two measured bounds in the header block —
 * √(1.447 × 4.537) = 2.56 — rounded to the 10 cm the source measurements are
 * good to. Farther than every part of the cabin, nearer than anything the
 * driver sees through the glass.
 */
export const GLASS_SHEET_DISTANCE_M = 2.5;

/**
 * NDC depth of a view-space distance under this scene's projection — pure, so
 * the ordering the fix depends on is held by a test and not by the paragraph
 * above (`__tests__/windshieldDroplets.test.ts`).
 *
 * Standard, non-reversed, non-logarithmic perspective depth. Both hold here
 * and neither is incidental: the Canvas passes no `logarithmicDepthBuffer`,
 * and three r185 leaves `reversedDepthBuffer` off unless asked. If either ever
 * changes, this mapping inverts or curves and the sheet lands in the wrong
 * place — which is why the test pins the two plane endpoints exactly.
 *
 * THE CLAMP IS NOT DEFENSIVE DECORATION. An unclamped distance beyond `far`
 * returns ndc > 1, and a clip-space triangle outside [−1, 1] is DEPTH-CLIPPED
 * — the whole rain layer would vanish silently, which is this fix failing in
 * the reassuring direction. The distance is pulled just inside the frustum
 * instead, so a misconfigured camera costs a wrong-looking sheet, never an
 * absent one.
 */
export function ndcDepthForDistance(distanceM: number, near: number, far: number): number {
  if (!Number.isFinite(near) || !Number.isFinite(far) || !(far > near) || !(near > 0)) return 0;
  const d = Number.isFinite(distanceM)
    ? Math.min(Math.max(distanceM, near * 1.001), far * 0.999)
    : near * 1.001;
  return (far + near) / (far - near) - (2 * far * near) / ((far - near) * d);
}

const VERTEX = /* glsl */ `
uniform float uDepthNdc;
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  // The z that makes the cabin occlude the rain. See GLASS_SHEET_DISTANCE_M.
  gl_Position = vec4(position.xy, uDepthNdc, 1.0);
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
          uDepthNdc: { value: 0 },
        },
        transparent: true,
        // ON, so the cabin can occlude the rain — see the header block. Still
        // no depth WRITE: the sheet must not stop anything drawn after it.
        depthTest: true,
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
    // Read per frame rather than once: the cockpit rig mutates the shared
    // camera's fov every frame, and a lesson that switches view swaps which
    // camera this is. near/far are what the mapping needs and they are cheap.
    const cam = state.camera as { near?: number; far?: number };
    material.uniforms.uDepthNdc.value = ndcDepthForDistance(
      GLASS_SHEET_DISTANCE_M,
      cam.near ?? 0.1,
      cam.far ?? 900,
    );
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
