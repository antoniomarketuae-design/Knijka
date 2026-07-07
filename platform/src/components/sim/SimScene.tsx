"use client";

import { Suspense, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import type { Group } from "three";
import { FIXED_DT, GRAVITY, SPAWN, CHASE_FOV, type VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput, SimTelemetry } from "@/modules/sim/engine";
import { CameraRig, type CameraMode } from "./CameraRig";
import { TestTrack } from "./TestTrack";
import { VehicleRig } from "./VehicleRig";

const SKY = "#8fb4dc";

/**
 * The R3F canvas: physics world + track + vehicle + camera.
 *
 * Performance budget (60 fps on integrated GPUs):
 *  - ~40 draw calls total, dpr capped at 1.5, no shadow maps, no
 *    postprocessing, fog instead of a skybox.
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
}: {
  paused: boolean;
  sessionKey: number;
  telemetryRef: RefObject<SimTelemetry>;
  inputRef: RefObject<SimInput | null>;
  simRef: RefObject<VehicleSim | null>;
  chassisGroupRef: RefObject<Group | null>;
  cameraModeRef: RefObject<CameraMode>;
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
      <color attach="background" args={[SKY]} />
      <fog attach="fog" args={[SKY, 150, 550]} />
      <hemisphereLight args={["#cfe5ff", "#3a4438", 0.9]} />
      <directionalLight position={[80, 120, 40]} intensity={1.4} color="#fff2df" />
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
            <VehicleRig simRef={simRef} chassisGroupRef={chassisGroupRef} inputRef={inputRef} />
          </group>
        </Physics>
      </Suspense>
      <CameraRig
        chassisGroupRef={chassisGroupRef}
        simRef={simRef}
        cameraModeRef={cameraModeRef}
        telemetryRef={telemetryRef}
      />
    </Canvas>
  );
}
