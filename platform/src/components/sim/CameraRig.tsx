"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3, type Group, type PerspectiveCamera } from "three";
import {
  CHASE_DISTANCE,
  CHASE_FOV,
  CHASE_HEIGHT,
  CHASE_LOOK_AHEAD,
  CHASE_LOOK_HEIGHT,
  CHASE_STIFFNESS,
  COCKPIT_DAMPING,
  COCKPIT_EYE,
  COCKPIT_FOV,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import { FpsMeter, type SimTelemetry } from "@/modules/sim/engine";

export type CameraMode = "chase" | "cockpit";

/** 180° about +Y: cameras look down -Z, the car drives along +Z. */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/**
 * Chase / cockpit camera driving the default R3F camera, plus the per-frame
 * telemetry bridge (speed/gear/fps → mutable channel, no React state).
 *
 * Follows the INTERPOLATED chassis group (not the raw rigid body), so camera
 * motion inherits @react-three/rapier's fixed-step render interpolation.
 * Cockpit eye position is exponentially damped (FEEL-NOTES: rigid cockpit
 * cams transmit every suspension tick into the viewer's neck).
 */
export function CameraRig({
  chassisGroupRef,
  simRef,
  cameraModeRef,
  telemetryRef,
}: {
  chassisGroupRef: RefObject<Group | null>;
  simRef: RefObject<VehicleSim | null>;
  cameraModeRef: RefObject<CameraMode>;
  telemetryRef: RefObject<SimTelemetry>;
}) {
  const fpsMeterRef = useRef(new FpsMeter());
  const lastMode = useRef<CameraMode | null>(null);

  // Scratch objects — never allocate in useFrame.
  const scratchRef = useRef({
    pos: new Vector3(),
    quat: new Quaternion(),
    fwd: new Vector3(),
    fwdFlat: new Vector3(),
    desired: new Vector3(),
    look: new Vector3(),
    eye: new Vector3(),
  });

  useFrame((state, delta) => {
    const telemetry = telemetryRef.current;
    telemetry.fps = fpsMeterRef.current.sample(delta);
    const sim = simRef.current;
    if (sim) {
      telemetry.speedKmh = sim.speedKmh;
      telemetry.gear = sim.gear;
    }

    const chassis = chassisGroupRef.current;
    if (!chassis) return;
    const cam = state.camera as PerspectiveCamera;
    const mode = cameraModeRef.current ?? "chase";

    const switched = mode !== lastMode.current;
    if (switched) {
      lastMode.current = mode;
      cam.fov = mode === "chase" ? CHASE_FOV : COCKPIT_FOV;
      cam.updateProjectionMatrix();
    }

    const { pos, quat, fwd, fwdFlat, desired, look, eye } = scratchRef.current;
    chassis.getWorldPosition(pos);
    chassis.getWorldQuaternion(quat);
    fwd.set(0, 0, 1).applyQuaternion(quat);

    if (mode === "chase") {
      fwdFlat.set(fwd.x, 0, fwd.z);
      if (fwdFlat.lengthSq() < 1e-6) fwdFlat.set(0, 0, 1);
      fwdFlat.normalize();
      desired.copy(pos).addScaledVector(fwdFlat, -CHASE_DISTANCE);
      desired.y += CHASE_HEIGHT;
      const k = switched ? 1 : 1 - Math.exp(-CHASE_STIFFNESS * delta);
      cam.position.lerp(desired, k);
      look.copy(pos).addScaledVector(fwdFlat, CHASE_LOOK_AHEAD);
      look.y += CHASE_LOOK_HEIGHT;
      cam.up.set(0, 1, 0);
      cam.lookAt(look);
    } else {
      eye
        .set(COCKPIT_EYE.x, COCKPIT_EYE.y, COCKPIT_EYE.z)
        .applyQuaternion(quat)
        .add(pos);
      const k = switched ? 1 : 1 - Math.exp(-COCKPIT_DAMPING * delta);
      cam.position.lerp(eye, k);
      cam.quaternion.copy(quat).multiply(FLIP_Y);
    }
  });

  return null;
}
