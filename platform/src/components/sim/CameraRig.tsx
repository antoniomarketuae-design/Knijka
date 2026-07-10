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
  COCKPIT_FOV_MAX,
  cockpitVFovForAspect,
  COCKPIT_LEAN_LATERAL,
  COCKPIT_LEAN_LONGITUDINAL,
  COCKPIT_ROLL_GAIN,
  COCKPIT_PITCH_BASE,
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
 * Mirror-glance head turns (rad), derived from the doc-71 §4.9 pose as
 * revised by the founder world-first directive (2026-07-10): camera
 * COCKPIT_EYE (0.24, 0.71, −0.255) with the base view pitched
 * COCKPIT_PITCH_BASE (−5°) vs the door mirrors (±0.905, 0.455, 0.592) and
 * the interior mirror (0, 0.687, 0.575) — mirror positions UNCHANGED by the
 * v2 interior rebuild; only the camera moved (up +0.05, pitch −8°→−5°).
 * yaw = atan2(Δx, Δz) (positive looks toward car-left); pitch is measured
 * relative to the PITCHED view axis (glance rotation composes after the
 * base pitch), i.e. atan2(Δy, distXZ) − COCKPIT_PITCH_BASE. The mirrors are
 * already in frame at rest, so the turn centres the glass rather than the
 * old exaggerated whip.
 */
const GLANCE_OFFSETS: Record<MirrorGlanceKind, { yaw: number; pitch: number }> = {
  left: { yaw: 0.67, pitch: -0.15 },
  right: { yaw: -0.93, pitch: -0.09 },
  rear: { yaw: -0.28, pitch: 0.06 },
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
 * the HOLD-to-glance mirror look (Q/E/F held / hotspot pressed) that feeds
 * the rule engine's mirror-check detector once per hold.
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
      cam.fov = mode === "chase" ? CHASE_FOV : cockpitVFovForAspect(cam.aspect);
      cam.updateProjectionMatrix();
    }

    const { pos, quat, fwd, fwdFlat, desired, look, lookSmooth, eye, rotSmooth, glanceQuat, glanceEuler, sway, leanQuat, leanEuler } =
      scratchRef.current;
    chassis.getWorldPosition(pos);
    chassis.getWorldQuaternion(quat);
    fwd.set(0, 0, 1).applyQuaternion(quat);

    // Base FOV. Chase keeps three's default Hor+ resize (vFOV fixed). The
    // cockpit instead HOLDS ITS ~75.4° hFOV constant across window shapes
    // (doc 71 §4.9): vFOV is derived from the live aspect every frame (one
    // atan — R3F keeps cam.aspect current on resize), so ultrawide/portrait
    // windows keep the exact horizontal composition the camera contract is
    // authored for instead of gaining/losing world at the sides.
    const baseFov = mode === "chase" ? CHASE_FOV : cockpitVFovForAspect(cam.aspect);
    // Subtle speed-based FOV widen (both cameras). In the cockpit the result
    // is capped at COCKPIT_FOV_MAX — the lane-12 hard rule (vFOV > ~56 breaks
    // the graded 10–30 m distance judgments) outranks the widen effect.
    const speedNorm = Math.min(Math.abs(sim?.speedKmh ?? 0) / 130, 1) ** 1.4;
    const widen = mode === "chase" ? FOV_WIDEN_CHASE : FOV_WIDEN_COCKPIT;
    const targetFov =
      mode === "chase"
        ? baseFov + widen * speedNorm
        : Math.min(baseFov + widen * speedNorm, COCKPIT_FOV_MAX);
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
      // COCKPIT_PITCH_BASE rides the same X axis: the constant 8° down tilt
      // that puts the dash-top at ~44% of frame height (doc 71 §4.9 contract;
      // the full landmark table lives on the constant in tuning.ts, and the
      // cockpit-camera-contract test pins it).
      const steerNorm = clampAbs(steer / STEER_MAX_ANGLE, 1);
      leanEuler.set(
        COCKPIT_PITCH_BASE + lean.longG * COCKPIT_PITCH_GAIN,
        steerNorm * COCKPIT_LOOK_INTO_TURN,
        lean.latG * COCKPIT_ROLL_GAIN,
        "YXZ",
      );
      leanQuat.setFromEuler(leanEuler);
      cam.quaternion.multiply(leanQuat);

      // Mirror glance: head turns toward the mirror while the key/hotspot is
      // HELD (founder contract) — GlanceHold's 0..1 envelope, smoothstepped
      // here so the turn eases in, holds steady, and eases back on release.
      const cabin = cabinRef.current;
      const s = cabin?.glanceStrength() ?? 0;
      const mirror = cabin?.glanceMirror;
      if (s > 0 && mirror) {
        const env = s * s * (3 - 2 * s);
        const o = GLANCE_OFFSETS[mirror];
        glanceEuler.set(o.pitch * env, o.yaw * env, 0, "YXZ");
        glanceQuat.setFromEuler(glanceEuler);
        cam.quaternion.multiply(glanceQuat);
      }
    }
  });

  return null;
}
