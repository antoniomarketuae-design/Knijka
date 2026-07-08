"use client";

import { useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Euler, Quaternion, Vector3, type Group, type PerspectiveCamera } from "three";
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
  COCKPIT_LEAN_LATERAL,
  COCKPIT_LEAN_LONGITUDINAL,
  COCKPIT_ROLL_GAIN,
  COCKPIT_PITCH_GAIN,
  COCKPIT_LOOK_INTO_TURN,
  COCKPIT_LEAN_DAMPING,
  ESTIMATE_WHEELBASE,
  STEER_MAX_ANGLE,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import { FpsMeter, type SimTelemetry } from "@/modules/sim/engine";
import type { CabinControls, MirrorGlanceKind } from "./cabin";

export type CameraMode = "chase" | "cockpit";

/** Clamp to [-limit, +limit]. */
function clampAbs(v: number, limit: number): number {
  return v < -limit ? -limit : v > limit ? limit : v;
}

/** 180° about +Y: cameras look down -Z, the car drives along +Z. */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/** Cockpit orientation damping (1/s) — softer than the eye position so the
 * view leans gently instead of transmitting every suspension tick. */
const COCKPIT_ROT_DAMPING = 16;
/** Chase look-target smoothing (1/s). */
const CHASE_LOOK_DAMPING = 10;
/** Speed-based FOV widening (deg at ~130 km/h) and its blend rate (1/s). */
const FOV_WIDEN_CHASE = 6;
const FOV_WIDEN_COCKPIT = 5;
const FOV_DAMPING = 3;

/**
 * Mirror-glance head turns (rad), derived from the cockpit geometry:
 * eye (0.34, 0.62, 0.15) vs door mirrors (±0.90, 0.28, 0.55) and the
 * interior mirror (0, 0.68, 0.55). Positive yaw looks toward car-left.
 */
const GLANCE_OFFSETS: Record<MirrorGlanceKind, { yaw: number; pitch: number }> = {
  left: { yaw: 0.95, pitch: -0.32 },
  right: { yaw: -1.26, pitch: -0.22 },
  rear: { yaw: -0.62, pitch: 0.14 },
};

/**
 * Chase / cockpit camera driving the default R3F camera, plus the per-frame
 * telemetry bridge (speed/gear/fps → mutable channel, no React state).
 *
 * Follows the INTERPOLATED chassis group (not the raw rigid body), so camera
 * motion inherits @react-three/rapier's fixed-step render interpolation.
 * Cockpit eye position AND orientation are exponentially damped (FEEL-NOTES:
 * rigid cockpit cams transmit every suspension tick into the viewer's neck);
 * both cameras get a subtle speed-based FOV widen, and the cockpit performs
 * the 350 ms mirror-glance look (Q/E/F) that feeds the rule engine's
 * mirror-check detector.
 */
export function CameraRig({
  chassisGroupRef,
  simRef,
  cameraModeRef,
  cabinRef,
  telemetryRef,
}: {
  chassisGroupRef: RefObject<Group | null>;
  simRef: RefObject<VehicleSim | null>;
  cameraModeRef: RefObject<CameraMode>;
  cabinRef: RefObject<CabinControls | null>;
  telemetryRef: RefObject<SimTelemetry>;
}) {
  const fpsMeterRef = useRef(new FpsMeter());
  const lastMode = useRef<CameraMode | null>(null);
  // Smoothed G-force lean state (cockpit head motion).
  const leanRef = useRef({ latG: 0, longG: 0, prevSpeedMps: 0 });

  // Scratch objects — never allocate in useFrame.
  const scratchRef = useRef({
    pos: new Vector3(),
    quat: new Quaternion(),
    fwd: new Vector3(),
    fwdFlat: new Vector3(),
    desired: new Vector3(),
    look: new Vector3(),
    lookSmooth: new Vector3(),
    eye: new Vector3(),
    rotSmooth: new Quaternion(),
    glanceQuat: new Quaternion(),
    glanceEuler: new Euler(),
    sway: new Vector3(),
    leanQuat: new Quaternion(),
    leanEuler: new Euler(),
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

    const { pos, quat, fwd, fwdFlat, desired, look, lookSmooth, eye, rotSmooth, glanceQuat, glanceEuler, sway, leanQuat, leanEuler } =
      scratchRef.current;
    chassis.getWorldPosition(pos);
    chassis.getWorldQuaternion(quat);
    fwd.set(0, 0, 1).applyQuaternion(quat);

    // Subtle speed-based FOV widen (both cameras).
    const speedNorm = Math.min(Math.abs(sim?.speedKmh ?? 0) / 130, 1) ** 1.4;
    const baseFov = mode === "chase" ? CHASE_FOV : COCKPIT_FOV;
    const widen = mode === "chase" ? FOV_WIDEN_CHASE : FOV_WIDEN_COCKPIT;
    const targetFov = baseFov + widen * speedNorm;
    if (Math.abs(cam.fov - targetFov) > 0.02) {
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-FOV_DAMPING * delta));
      cam.updateProjectionMatrix();
    }

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
      const kl = switched ? 1 : 1 - Math.exp(-CHASE_LOOK_DAMPING * delta);
      lookSmooth.lerp(look, kl);
      cam.up.set(0, 1, 0);
      cam.lookAt(lookSmooth);
    } else {
      // --- G-force head motion (immersion; doc 63 §2). Estimate lateral G
      // kinematically (a = v²·tan(steer)/L) and longitudinal G from the speed
      // delta, then heavily damp — never feed raw per-frame values. -----------
      const lean = leanRef.current;
      const vMps = (sim?.speedKmh ?? 0) / 3.6;
      const steer = sim?.steerRad ?? 0;
      const latAccel = (vMps * vMps * Math.tan(steer)) / ESTIMATE_WHEELBASE;
      const longAccel = (vMps - lean.prevSpeedMps) / Math.max(delta, 1e-3);
      lean.prevSpeedMps = vMps;
      const latGTarget = clampAbs(latAccel / 9.81, 1.2);
      const longGTarget = clampAbs(longAccel / 9.81, 1.2);
      const kg = switched ? 1 : 1 - Math.exp(-COCKPIT_LEAN_DAMPING * delta);
      lean.latG += (latGTarget - lean.latG) * kg;
      lean.longG += (longGTarget - lean.longG) * kg;
      if (switched) {
        lean.latG = latGTarget;
        lean.longG = longGTarget;
      }

      // Eye position + car-local sway (body thrown OUT of the corner, forward
      // under braking). +X is car-left, +Z forward.
      sway.set(
        -lean.latG * COCKPIT_LEAN_LATERAL,
        0,
        -lean.longG * COCKPIT_LEAN_LONGITUDINAL,
      );
      eye
        .set(
          COCKPIT_EYE.x + sway.x,
          COCKPIT_EYE.y + sway.y,
          COCKPIT_EYE.z + sway.z,
        )
        .applyQuaternion(quat)
        .add(pos);
      const k = switched ? 1 : 1 - Math.exp(-COCKPIT_DAMPING * delta);
      cam.position.lerp(eye, k);

      // Damped head orientation instead of a rigid bolt to the chassis.
      const kr = switched ? 1 : 1 - Math.exp(-COCKPIT_ROT_DAMPING * delta);
      rotSmooth.slerp(quat, kr);
      cam.quaternion.copy(rotSmooth).multiply(FLIP_Y);

      // Head roll INTO the corner, nose-dive pitch on braking, look-into-turn
      // yaw — small camera-local rotation (YXZ), applied after base orientation.
      const steerNorm = clampAbs(steer / STEER_MAX_ANGLE, 1);
      leanEuler.set(
        lean.longG * COCKPIT_PITCH_GAIN,
        steerNorm * COCKPIT_LOOK_INTO_TURN,
        lean.latG * COCKPIT_ROLL_GAIN,
        "YXZ",
      );
      leanQuat.setFromEuler(leanEuler);
      cam.quaternion.multiply(leanQuat);

      // Mirror glance: 350 ms ease-out-and-back head turn toward the mirror.
      const cabin = cabinRef.current;
      const progress = cabin?.glanceProgress() ?? -1;
      const mirror = cabin?.glanceMirror;
      if (progress >= 0 && mirror) {
        const env = Math.sin(Math.PI * progress) ** 0.8;
        const o = GLANCE_OFFSETS[mirror];
        glanceEuler.set(o.pitch * env, o.yaw * env, 0, "YXZ");
        glanceQuat.setFromEuler(glanceEuler);
        cam.quaternion.multiply(glanceQuat);
      }
    }
  });

  return null;
}
