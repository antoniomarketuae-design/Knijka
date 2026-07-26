"use client";

// The ground half of the horizon: ONE camera-following disc, lit by the same
// rig and fogged by the same FogExp2 as the terrain, that carries the world
// from the edge of the district's own ground out to the distance at which the
// haze is opaque — so no frame ever shows where the map stops.
//
// The measurement that justifies it, the constants and the fade maths all live
// in ./groundBackdropShader (three-free, so vitest owns them). This file is
// only the three.js/R3F wiring, exactly like SkyDome vs skyShader.
//
// Mounted by SimEnvironment next to <SkyDome/>, and it is the same shape of
// object: camera-following, backdrop-only, no collider, no shadow work, no
// texture, one draw call. It must NEVER be given a collider or a raycast — the
// vehicle drives on the physics ground plane and the rule engine grades on
// geometry the world module owns; this is scenery for the eye and nothing else.

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh, WebGLProgramParametersWithUniforms } from "three";
import {
  GROUND_BACKDROP_ALBEDO,
  GROUND_BACKDROP_RADIUS_M,
  GROUND_BACKDROP_ROTATION_X,
  GROUND_BACKDROP_SEGMENTS,
  GROUND_BACKDROP_Y,
  HORIZON_HAZE_ANCHOR,
  HORIZON_HAZE_FRAGMENT,
} from "./groundBackdropShader";

/** Scene name of the disc — a handle for debug tooling, mirroring
 *  SKY_DOME_NAME. Nothing in the render path looks it up. */
export const GROUND_BACKDROP_NAME = "sim-ground-backdrop";

/** Lays the disc flat, facing up. Hoisted so the tuple identity is stable. */
const ROTATION: [number, number, number] = [GROUND_BACKDROP_ROTATION_X, 0, 0];

/** The disc is scenery: it must never intercept a pointer pick, and it is the
 *  largest object in the scene, so leaving the default raycast in place would
 *  put it in front of every ray that misses everything else. */
const NO_RAYCAST = () => {};

/**
 * Splice the horizon fade in after three's own fog chunk — see
 * HORIZON_HAZE_FRAGMENT for why it goes there and why it measures radial
 * distance rather than fog depth.
 */
function horizonHazeOnBeforeCompile(shader: WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    HORIZON_HAZE_ANCHOR,
    `${HORIZON_HAZE_ANCHOR}\n${HORIZON_HAZE_FRAGMENT}`,
  );
}

/** Its own cache key: exactly one program, compiled once, shared by nothing
 *  else (the ground materials keep theirs — see world/textures/macroVariation). */
function horizonHazeProgramCacheKey(): string {
  return "sim-ground-backdrop-horizon-haze";
}

export function GroundBackdrop() {
  const meshRef = useRef<Mesh>(null);
  const geometryArgs = useMemo<[number, number]>(
    () => [GROUND_BACKDROP_RADIUS_M, GROUND_BACKDROP_SEGMENTS],
    [],
  );

  // Follow the camera in XZ only (the SkyDome pattern), so the horizon sits at
  // the same distance in every direction from wherever the driver is — a disc
  // pinned to the district would run out on one side of a long map. Y is
  // FIXED: this is ground, and it is the one thing about it that must not
  // move. The colour is flat, so sliding under the camera cannot swim.
  useFrame((state) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.position.set(state.camera.position.x, GROUND_BACKDROP_Y, state.camera.position.z);
  });

  return (
    <mesh
      ref={meshRef}
      name={GROUND_BACKDROP_NAME}
      rotation={ROTATION}
      // Centred on the camera, so it is always in frame; skipping the test
      // costs one bounding-sphere transform per frame less.
      frustumCulled={false}
      raycast={NO_RAYCAST}
      // No shadow work in either direction: it is beyond the shadow frustum
      // (350 m far) everywhere it is visible, and receiving would add a
      // shadow-sampling variant of the program for nothing.
      castShadow={false}
      receiveShadow={false}
    >
      <circleGeometry args={geometryArgs} />
      <meshStandardMaterial
        color={GROUND_BACKDROP_ALBEDO}
        roughness={1}
        metalness={0}
        onBeforeCompile={horizonHazeOnBeforeCompile}
        customProgramCacheKey={horizonHazeProgramCacheKey}
      />
    </mesh>
  );
}
