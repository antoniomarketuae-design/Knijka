"use client";

import { Suspense, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import type { Group } from "three";
import { FIXED_DT, GRAVITY, SPAWN, CHASE_FOV, type VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput, SimTelemetry } from "@/modules/sim/engine";
import type { VehicleSample } from "@/modules/sim/contracts";
import type { CabinControls } from "./cabin";
import type { SimAudio } from "./simAudio";
import { CameraRig, type CameraMode } from "./CameraRig";
import { SceneLighting } from "./SceneLighting";
import { TestTrack } from "./TestTrack";
import { VehicleRig } from "./VehicleRig";

/**
 * The R3F canvas: physics world + track + vehicle + camera.
 *
 * Performance budget (60 fps on integrated GPUs):
 *  - dpr capped at 1.5, no shadow maps, no postprocessing, fog instead of a
 *    skybox; the „Виток" car adds ~25 draw calls (body GLB + 4 wheels +
 *    lamps + two merged cockpit meshes) and at most 2 real spotlights
 *    (headlights) — ~70 draw calls total.
 *  - Physics: fixed 60 Hz timestep with @react-three/rapier's accumulator
 *    loop + render interpolation (kills 144 Hz micro-stutter, FEEL-NOTES).
 *  - R3F disposes the GL context and scene graph on unmount (route leave);
 *    VehicleRig/Physics clean up their rapier resources in effect teardown.
 *
 * `sessionKey` remounts track + vehicle inside the SAME physics world —
 * that is the „Рестарт" implementation (fresh cones, fresh car at spawn).
 */
export function SimScene({
  paused,
  sessionKey,
  telemetryRef,
  inputRef,
  simRef,
  chassisGroupRef,
  cameraModeRef,
  cabinRef,
  audioRef,
  sampleRef,
}: {
  paused: boolean;
  sessionKey: number;
  telemetryRef: RefObject<SimTelemetry>;
  inputRef: RefObject<SimInput | null>;
  simRef: RefObject<VehicleSim | null>;
  chassisGroupRef: RefObject<Group | null>;
  cameraModeRef: RefObject<CameraMode>;
  cabinRef: RefObject<CabinControls | null>;
  audioRef: RefObject<SimAudio | null>;
  sampleRef: RefObject<VehicleSample>;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{
        fov: CHASE_FOV,
        near: 0.1,
        far: 700,
        position: [SPAWN.x - 6, SPAWN.y + 2.3, SPAWN.z],
      }}
      gl={{ antialias: true, powerPreference: "high-performance", stencil: false }}
    >
      <SceneLighting cabinRef={cabinRef} />
      <Suspense fallback={null}>
        <Physics
          gravity={[0, GRAVITY, 0]}
          timeStep={FIXED_DT}
          interpolate
          paused={paused}
          updateLoop="follow"
        >
          <group key={sessionKey}>
            <TestTrack />
            <VehicleRig
              simRef={simRef}
              chassisGroupRef={chassisGroupRef}
              inputRef={inputRef}
              cabinRef={cabinRef}
              audioRef={audioRef}
              sampleRef={sampleRef}
              paused={paused}
            />
          </group>
        </Physics>
      </Suspense>
      <CameraRig
        chassisGroupRef={chassisGroupRef}
        simRef={simRef}
        cameraModeRef={cameraModeRef}
        cabinRef={cabinRef}
        telemetryRef={telemetryRef}
      />
    </Canvas>
  );
}
