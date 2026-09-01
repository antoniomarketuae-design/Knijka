"use client";

// Instanced wind-blown dust in a camera-following box — RainStreaks' and
// SnowFlakes' third sibling: the same toroidal-wrap lifecycle, the same
// static-seed / GPU-scrolled design, the same "a handful of uniform writes and
// ONE draw call" per-frame budget, whatever the mote count.
//
// The difference is what drives it. Rain and snow read a 0..1 weather channel;
// this reads the LIVE lateral wind force out of the physics
// (`VehicleSim.windLateralNow`, handed down as `readLateralN`), because the
// wind is physics and not a weather tag — `environment/weather.ts` §5 refuses
// it a store channel for exactly that reason, and the picture must not be able
// to disagree with the push. The force→look mapping is `./windDrift`.
//
// The motes SCROLL BY ACCUMULATED DISTANCE, not by `time × speed`: the gust
// speed changes every frame, and `uTime * speed` teleports the whole field
// whenever the speed moves. One float integrated on the CPU keeps the drift
// continuous through the gust.

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
import { windDriftLook } from "./windDrift";

/**
 * Half-extents of the mote box around the camera, meters — TIGHTER than the
 * rain box (20/12/20) across and much flatter, because dust hugs the ground and
 * because density is what makes this legible at all.
 *
 * MEASURED, not guessed, and the measurement is the point — a depiction that
 * ships invisible repairs nothing. The material was compiled on a real GL
 * driver (ANGLE D3D11) with these exact shaders and the med-tier instance
 * count, camera at eye height looking down the road, and the painted pixels
 * counted against a flat background at 640×360:
 *
 *   26/7/26 box, 0.030 m mote, 0.34 m streak →   429 px (0.19% of frame)
 *   18/6/18 box, 0.045 m mote, 0.55 m streak → 1,319 px (0.57% of frame)
 *
 * The first is a hundred faint dashes that would vanish against a carriageway;
 * the second is a legible field of streaming motes that still leaves the lane
 * paint and the truck fully readable through it. The volume is the cheapest of
 * the levers (each side cut by a third triples the density at the same instance
 * count), so it was pulled first and the mote size second.
 */
const AREA_HALF = { x: 18, y: 6, z: 18 };

/** Streak thickness, meters — a mote, not a ribbon (see AREA_HALF). */
const MOTE_THICKNESS_M = 0.045;

/** Near fade: a mote is invisible inside this radius of the eye and fully drawn
 *  beyond the second — see the note at `vNear` in the vertex shader. */
const NEAR_FADE_START_M = 1.4;
const NEAR_FADE_END_M = 4;

/** Dust tint per time of day: dry warm road grit by day, cooler at dusk, and
 *  a dim grey at night where only the beams would catch it. */
const DUST_COLOR: Record<TimeOfDay, string> = {
  day: "#cbbda4",
  dusk: "#b8a189",
  night: "#59606d",
};

/** One unit quad: x = thickness axis (-0.5..0.5), y = length axis. */
const QUAD_POSITIONS = new Float32Array([
  -0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0,
]);
const QUAD_INDEX = new Uint16Array([0, 1, 2, 2, 1, 3]);

const VERTEX = /* glsl */ `
attribute vec3 aSeed;   // random point in [0,1)^3
attribute vec2 aRand;   // x: drift-speed jitter, y: length/bob jitter
uniform float uTime;
uniform float uDrift;   // accumulated air travel along world +X, meters
uniform float uDir;     // +1 / -1 — which way the air is going
uniform float uStreak;  // streak half-length at this gust strength, meters
uniform vec3 uCenter;   // camera position
uniform vec3 uHalf;     // box half extents
varying float vAlong;   // -0.5..0.5 along the streak
varying float vNear;    // 0 inside the cabin, 1 out in the world

void main() {
  vec3 span = uHalf * 2.0;

  // Static cloud, carried along world X by the accumulated drift and wrapped
  // into a box centered on the camera (the RainStreaks toroidal pattern). The
  // per-mote jitter multiplies the SAME accumulated distance, so the field
  // shears instead of marching in lockstep and still never teleports when the
  // gust changes speed.
  vec3 base = aSeed * span;
  base.x += uDrift * (0.75 + 0.5 * aRand.x);

  // Blown dust is not a rigid sheet: a slow seed-phased bob in height and
  // along the road breaks the plane up without costing a second system.
  float phase = aSeed.x * 6.28318 + aSeed.z * 12.56637;
  base.y += sin(uTime * (0.5 + 0.5 * aRand.y) + phase) * 0.6;
  base.z += cos(uTime * 0.37 + phase) * 0.9;

  vec3 rel = mod(base - uCenter, span) - uHalf;
  vec3 world = uCenter + rel;

  // Cylindrical billboard: length along the wind, width across the view. The
  // wind is HORIZONTAL, so a mote sitting due east/west of the camera makes
  // cross(vel, toCam) degenerate — unlike rain, that is a case this system
  // actually reaches, and an un-guarded normalize() there is a NaN vertex.
  vec3 vel = vec3(uDir, 0.0, 0.0);
  vec3 toCam = cameraPosition - world;
  vec3 rightRaw = cross(vel, toCam);
  float rightLen = length(rightRaw);
  vec3 right = rightLen > 1e-4 ? rightRaw / rightLen : vec3(0.0, 1.0, 0.0);

  float len = uStreak * (0.7 + 0.6 * aRand.y);
  vec3 p = world + right * (position.x * ${MOTE_THICKNESS_M.toFixed(4)}) + vel * (position.y * len);

  // The box is centred on the CAMERA, so without this the nearest motes are
  // inside the cabin with the student — a 0.34 m streak half a metre from the
  // eye reads as a smear on the glass, not as dust on the road. Fade them in
  // over the first few metres instead, which is also where a real mote would be
  // too fast and too close to resolve.
  vNear = smoothstep(${NEAR_FADE_START_M.toFixed(2)}, ${NEAR_FADE_END_M.toFixed(2)}, length(toCam));

  vAlong = position.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlong;
varying float vNear;

void main() {
  float a = smoothstep(0.5, 0.25, abs(vAlong)) * uOpacity * vNear;
  gl_FragColor = vec4(uColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Deterministic PRNG (mulberry32) — the RainStreaks/SnowFlakes contract:
 *  render is pure and a stable mote layout per count is a feature. */
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

export function WindDust({
  count,
  timeOfDay,
  readLateralN,
}: {
  count: number;
  timeOfDay: TimeOfDay;
  /** The LIVE lateral wind force on the student's chassis, N along world +X
   *  (`VehicleSim.windLateralNow`). Read per frame — never cached — so the
   *  picture and the push are one number. */
  readLateralN: () => number;
}) {
  const materialRef = useRef<ShaderMaterial>(null);
  const initialized = useRef(false);
  /** Metres of air travel since mount — the scroll term (see the header). */
  const driftM = useRef(0);
  /** Last non-zero wind direction, so a momentary 0 N does not flip the
   *  streaks end-over-end. */
  const lastDir = useRef(-1);

  // Static per-instance randomness; regenerated only if count changes. A seed
  // constant of its own so a co-mounted rain/snow field never correlates.
  const instanceData = useMemo(() => {
    const rng = mulberry32(0x7d15 ^ count);
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
          uDrift: { value: 0 },
          uDir: { value: -1 },
          uStreak: { value: 0 },
          uCenter: { value: new Vector3() },
          uHalf: { value: new Vector3(AREA_HALF.x, AREA_HALF.y, AREA_HALF.z) },
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

  const goalColor = useMemo(() => new Color(DUST_COLOR[timeOfDay]), [timeOfDay]);

  useFrame((state, delta) => {
    const material = materialRef.current;
    if (!material) return;
    const dt = Math.min(delta, 0.1);
    const colorDt = initialized.current ? dt : 1000;
    initialized.current = true;

    const look = windDriftLook(readLateralN());
    driftM.current += look.speedMps * dt;
    if (look.speedMps !== 0) lastDir.current = look.speedMps < 0 ? -1 : 1;

    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uDrift.value = driftM.current;
    u.uDir.value = lastDir.current;
    u.uStreak.value = look.streakM;
    u.uOpacity.value = look.opacity;
    (u.uCenter.value as Vector3).copy(state.camera.position);
    const c = u.uColor.value as Color;
    c.r = MathUtils.damp(c.r, goalColor.r, 2.2, colorDt);
    c.g = MathUtils.damp(c.g, goalColor.g, 2.2, colorDt);
    c.b = MathUtils.damp(c.b, goalColor.b, 2.2, colorDt);
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
