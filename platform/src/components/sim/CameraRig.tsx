"use client";

import { useEffect, useRef, type RefObject } from "react";
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
import {
  FpsMeter,
  chaseGlanceOrbit,
  chaseOrbitLock,
  getReverseViewEnabled,
  glanceOrbitLock,
  reverseSwingEnvelope,
  reverseViewTarget,
  stepReverseSwing,
  toggleReverseViewEnabled,
  CHASE_REVERSE_ORBIT_RAD,
  COCKPIT_SHOULDER_PITCH,
  COCKPIT_SHOULDER_YAW,
  type SimTelemetry,
} from "@/modules/sim/engine";
import type { CabinControls, MirrorGlanceKind } from "./cabin";

export type CameraMode = "chase" | "cockpit" | "topdown";

/**
 * S0-View top-down mode (doc 76 §4 — "one world, N cameras", founder-
 * confirmed first-class POV). INTEGRATION CHOICE: a PERSPECTIVE camera from
 * high altitude with a NARROW FOV (15° ≈ near-orthographic foreshortening),
 * not a true OrthographicCamera. Rationale: the R3F Canvas owns ONE default
 * camera shared by all modes (chase/cockpit mutate its fov/pose every
 * frame); swapping camera TYPE per mode would churn `state.camera` for
 * every consumer (composer passes, mirror RTT, drei helpers) and double the
 * resize handling. The camera flies at a CONSTANT altitude and zooms by
 * deriving the vFOV from the preset width at the live aspect (one atan per
 * frame — the cockpit's own hFOV-hold pattern): constant height keeps the
 * scene fog/lighting identical across presets (at 300 m the world was fog-
 * washed), and at the preset widths the FOV lands at ~7–30° — visually flat,
 * exactly the doc's "perspective from high with narrow FOV" alternative.
 * View-only: grading never reads the camera. FOG WEATHER (doc 72 AC-03) is
 * the one condition dense enough to wash even this altitude — SimEnvironment
 * caps the fog-weather density by camera height (FOG_TOPDOWN_MAX_OPTICAL) so
 * the topdown aid view reads a fog wash, never a solid sheet.
 */
const TOPDOWN_HEIGHT_M = 110;
/** Zoom presets: visible ground WIDTH at the car's plane, m (doc 76 §4). */
const TOPDOWN_WIDTHS_M = [20, 40, 80] as const;
const TOPDOWN_DEFAULT_ZOOM = 1; // 40 m
/** Fallback fov on mode entry (the per-frame derivation replaces it). */
const TOPDOWN_FOV_FALLBACK = 15;
/** Position follow stiffness (1/s) + screen-up orientation damping (1/s). */
const TOPDOWN_STIFFNESS = 5;
const TOPDOWN_UP_DAMPING = 4;

/** Clamp to [-limit, +limit]. */
function clampAbs(v: number, limit: number): number {
  return v < -limit ? -limit : v > limit ? limit : v;
}

/** 180° about +Y: cameras look down -Z, the car drives along +Z. */
const FLIP_Y = new Quaternion(0, 1, 0, 0);

/** World up — the axis the chase camera orbits about while reversing.
 *  Module-level: `applyAxisAngle` must never allocate one per frame. */
const UP_AXIS = new Vector3(0, 1, 0);

/** K — toggle the automatic reversing POV (persisted setting, default ON).
 *  Sits with G/N (the view keys the rig owns), clear of every binding in
 *  cabin.ts CABIN_KEYS / DRIVELINE_KEYS and engine/input.ts. */
const REVERSE_VIEW_KEY = "KeyK";

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
 * the rule engine's mirror-check detector once per hold. In the CHASE view
 * the same held glance ORBITS the camera toward the glanced quarter
 * (engine/glanceView.ts — the founder glance-payoff law: a graded press must
 * SHOW something), on exam rungs too; top-down needs nothing, it sees all.
 *
 * REVERSING POV: while the selector is in R the view turns to look back — the
 * chase camera orbits to the car's rear-facing aspect, the cockpit does the
 * over-the-shoulder check — and swings home on the way back to D/P/N. Every
 * rule and constant is in engine/reverseView.ts (pure, unit-tested); this file
 * only renders the resulting 0..1 swing. K opts out (persisted).
 */
export function CameraRig({
  chassisGroupRef,
  simRef,
  cameraModeRef,
  cabinRef,
  telemetryRef,
  topdownAllowed = true,
  enterTopdown,
  driveLocked = false,
}: {
  chassisGroupRef: RefObject<Group | null>;
  simRef: RefObject<VehicleSim | null>;
  cameraModeRef: RefObject<CameraMode>;
  cabinRef: RefObject<CabinControls | null>;
  telemetryRef: RefObject<SimTelemetry>;
  /** Whether top-down is reachable this lesson (false on exam rungs). */
  topdownAllowed?: boolean;
  /** Switch the shared view state into top-down (parent owns cockpit state). */
  enterTopdown?: () => void;
  /** QW10 pre-drive gate is up: the car cannot move and a held brake is a
   *  procedure step — never a reverse. Vetoes the reversing POV. */
  driveLocked?: boolean;
}) {
  const fpsMeterRef = useRef(new FpsMeter());
  const lastMode = useRef<CameraMode | null>(null);
  /** Reversing-POV swing, 0 = looking forward … 1 = looking back
   *  (engine/reverseView.ts owns every rule and constant behind it). */
  const swingRef = useRef(0);
  /** Chase orbit angle rendered LAST frame (reverse + glance, rad about +Y) —
   *  feeds glanceOrbitLock's observed-rate arc lock (engine/glanceView.ts). */
  const chasePrevOrbitRef = useRef(0);
  // Smoothed G-force lean state (cockpit head motion).
  const leanRef = useRef({ latG: 0, longG: 0, prevSpeedMps: 0 });
  // Top-down state (refs — render-free): zoom preset index + orientation.
  const topdownZoomRef = useRef(TOPDOWN_DEFAULT_ZOOM);
  const topdownHeadingUpRef = useRef(false); // false = north-up

  // Top-down hotkeys (legend rows in LessonScene): G cycles the zoom preset,
  // N toggles north-up / heading-up. From ANOTHER view they first SWITCH into
  // top-down (when the lesson allows it), so the keys always do something
  // instead of silently no-op'ing — the founder-reported "G/N don't work".
  // On exam rungs (topdownAllowed=false) they stay inert, and the legend
  // doesn't advertise them.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== "KeyG" && e.code !== "KeyN") return;
      if (cameraModeRef.current !== "topdown") {
        if (!topdownAllowed) return;
        enterTopdown?.();
      }
      if (e.code === "KeyG") {
        topdownZoomRef.current = (topdownZoomRef.current + 1) % TOPDOWN_WIDTHS_M.length;
      } else {
        topdownHeadingUpRef.current = !topdownHeadingUpRef.current;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraModeRef, topdownAllowed, enterTopdown]);

  // K — opt out of (or back into) the automatic reversing POV. Persisted, so
  // the choice survives the lesson; live from the next frame (the rig reads
  // the setting per frame, it does not subscribe). Available in every view and
  // on every rung — a POV is not an aid.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code !== REVERSE_VIEW_KEY) return;
      toggleReverseViewEnabled();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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
    // Chassis position last frame — the cockpit smoother compensates the
    // car's own displacement so smoothing happens in the CAR frame (see the
    // back-seat-POV fix below).
    prevPos: new Vector3(),
    // Top-down screen-up vector, damped (north-up ↔ heading-up transitions).
    upSmooth: new Vector3(0, 0, -1),
  });
  const prevPosValid = useRef(false);

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
      cam.fov =
        mode === "chase"
          ? CHASE_FOV
          : mode === "topdown"
            ? TOPDOWN_FOV_FALLBACK
            : cockpitVFovForAspect(cam.aspect);
      cam.updateProjectionMatrix();
    }

    // --- Reversing POV (founder 2026-07-17). One damped 0..1 swing, shared by
    // every view: engine/reverseView.ts decides WHETHER to look back (selector
    // / speed / mode / glance / setting / pre-drive gate), this rig decides
    // what looking back LOOKS like per view. A mode switch snaps it, like
    // every other state here. ------------------------------------------------
    const cabin = cabinRef.current;
    const glanceS = cabin?.glanceStrength() ?? 0;
    const swingTarget = reverseViewTarget({
      selector: cabin?.driveline.selector ?? "P",
      speedKmh: sim?.speedKmh ?? 0,
      mode,
      glanceHeld: glanceS > 0,
      enabled: getReverseViewEnabled(),
      driveLocked,
    });
    swingRef.current = switched
      ? swingTarget
      : stepReverseSwing(swingRef.current, swingTarget, delta);
    // Smoothstepped so the swing eases in as well as out (the glance's easing).
    const swing = reverseSwingEnvelope(swingRef.current);

    const { pos, quat, fwd, fwdFlat, desired, look, lookSmooth, eye, rotSmooth, glanceQuat, glanceEuler, sway, leanQuat, leanEuler, prevPos, upSmooth } =
      scratchRef.current;
    chassis.getWorldPosition(pos);
    chassis.getWorldQuaternion(quat);
    fwd.set(0, 0, 1).applyQuaternion(quat);

    if (mode !== "topdown") {
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
      // Top-down holds TOPDOWN_FOV constant — zoom is the height, never fov.
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
    }

    if (mode === "topdown") {
      // Centered-on-car bird view at CONSTANT altitude; the zoom preset's
      // visible ground WIDTH derives the vFOV at the live aspect per frame,
      // so resize/rotation keep the promised meters across the screen while
      // the fog/lighting stay identical across presets.
      fwdFlat.set(fwd.x, 0, fwd.z);
      if (fwdFlat.lengthSq() < 1e-6) fwdFlat.set(0, 0, 1);
      fwdFlat.normalize();
      const widthM = TOPDOWN_WIDTHS_M[topdownZoomRef.current];
      const aspect = Math.max(cam.aspect, 0.2);
      const targetFov =
        (Math.atan(widthM / (2 * TOPDOWN_HEIGHT_M * aspect)) * 360) / Math.PI;
      if (Math.abs(cam.fov - targetFov) > 0.05) {
        cam.fov += (targetFov - cam.fov) * (switched ? 1 : 1 - Math.exp(-8 * delta));
        cam.updateProjectionMatrix();
      }
      desired.set(pos.x, pos.y + TOPDOWN_HEIGHT_M, pos.z);
      const k = switched ? 1 : 1 - Math.exp(-TOPDOWN_STIFFNESS * delta);
      cam.position.lerp(desired, k);
      // Screen-up: world north (three −Z) or the car's heading — damped so
      // heading-up rotates the frame smoothly instead of snapping per tick.
      look.set(0, 0, -1); // scratch reuse: the up TARGET this frame
      const upTarget = topdownHeadingUpRef.current ? fwdFlat : look;
      const ku = switched ? 1 : 1 - Math.exp(-TOPDOWN_UP_DAMPING * delta);
      upSmooth.lerp(upTarget, ku);
      if (upSmooth.lengthSq() < 1e-4) upSmooth.copy(upTarget);
      upSmooth.normalize();
      cam.up.copy(upSmooth);
      cam.lookAt(pos.x, pos.y, pos.z);
    } else if (mode === "chase") {
      fwdFlat.set(fwd.x, 0, fwd.z);
      if (fwdFlat.lengthSq() < 1e-6) fwdFlat.set(0, 0, 1);
      fwdFlat.normalize();
      // Reversing: ORBIT the whole rig around the car by rotating its view
      // axis about +Y (in place — fwdFlat is rebuilt every frame). At swing 1
      // the axis is reversed, i.e. the exact mirror of the forward chase: the
      // camera sits off the NOSE looking back down the car, so the car fills
      // the lower frame with the boot at its far edge and the reversing path
      // opens beyond it. Halfway through, the axis points car-left (+X) and
      // the camera is therefore at the car's RIGHT flank — the same side as
      // the cockpit's shoulder check, and never a path through the car.
      //
      // CHASE GLANCES (doc 62 #44 tailgater / #7 #13 "make the button real"):
      // a held Q/E/F adds its own orbit share on the SAME axis —
      // engine/glanceView.ts decides how much (reverse swing keeps priority;
      // REAR aims at the identical over-the-boot aspect, so F reveals a close
      // tailgater; sides show the glanced quarter). Grading is untouched —
      // the mirrorGlance sample latched on the press, exactly as before.
      const orbitRad =
        swing * CHASE_REVERSE_ORBIT_RAD +
        chaseGlanceOrbit(mode, cabin?.glanceMirror ?? null, glanceS, swing);
      if (orbitRad !== 0) fwdFlat.applyAxisAngle(UP_AXIS, orbitRad);
      desired.copy(pos).addScaledVector(fwdFlat, -CHASE_DISTANCE);
      desired.y += CHASE_HEIGHT;
      // The chase lerp trails its target by v/rate — far too slack to track an
      // orbiting desired (it would be dragged across the car instead of round
      // it), so the swing locks the follow onto the arc while it is in motion
      // and hands the trailing feel back as it settles. The glance's share has
      // no 0/1 target to measure from — its lock keys on the observed orbital
      // RATE instead (glanceOrbitLock); take the stronger of the two.
      const lock = Math.max(
        chaseOrbitLock(swingRef.current, swingTarget),
        glanceOrbitLock(chasePrevOrbitRef.current, orbitRad, delta),
      );
      chasePrevOrbitRef.current = orbitRad;
      const k = switched ? 1 : Math.max(1 - Math.exp(-CHASE_STIFFNESS * delta), lock);
      cam.position.lerp(desired, k);
      look.copy(pos).addScaledVector(fwdFlat, CHASE_LOOK_AHEAD);
      look.y += CHASE_LOOK_HEIGHT;
      const kl = switched ? 1 : Math.max(1 - Math.exp(-CHASE_LOOK_DAMPING * delta), lock);
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
      // BACK-SEAT-POV FIX (founder-reported): a plain world-space lerp toward
      // a target that moves with the car has a steady-state tracking error of
      // v/rate — at 76 km/h with COCKPIT_DAMPING 25 that is ~0.84 m REARWARD,
      // which put the camera behind the seat headrest under acceleration.
      // Carry the camera along with the chassis's own frame displacement
      // FIRST, so the lerp only smooths car-local jitter (suspension tick),
      // never the car's travel: zero lag at any speed.
      if (prevPosValid.current && !switched) {
        cam.position.add(pos).sub(prevPos);
      }
      prevPos.copy(pos);
      prevPosValid.current = true;
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

      // Head turn — ONE rotation, two sources that share the neck:
      //  · Mirror glance: toward the mirror while the key/hotspot is HELD
      //    (founder contract) — GlanceHold's 0..1 envelope, smoothstepped here
      //    so the turn eases in, holds steady, and eases back on release.
      //  · Reversing shoulder check: over the right shoulder while in R.
      // They are summed, not fought over: an explicit glance already zeroes the
      // swing TARGET (reverseViewTarget), so the shoulder is easing home over
      // the same ~0.5 s the glance is easing in and the neck reads one
      // continuous motion — no snap at the handover, in either direction.
      const mirror = cabin?.glanceMirror;
      let headYaw = 0;
      let headPitch = 0;
      if (glanceS > 0 && mirror) {
        const env = glanceS * glanceS * (3 - 2 * glanceS);
        const o = GLANCE_OFFSETS[mirror];
        headYaw += o.yaw * env;
        headPitch += o.pitch * env;
      }
      if (swing > 0) {
        headYaw += COCKPIT_SHOULDER_YAW * swing;
        headPitch += COCKPIT_SHOULDER_PITCH * swing;
      }
      if (headYaw !== 0 || headPitch !== 0) {
        glanceEuler.set(headPitch, headYaw, 0, "YXZ");
        glanceQuat.setFromEuler(glanceEuler);
        cam.quaternion.multiply(glanceQuat);
      }
    }
  });

  return null;
}
