"use client";

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  Euler,
  FogExp2,
  HalfFloatType,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera as PerspectiveCameraImpl,
  PlaneGeometry,
  Quaternion,
  Vector3,
  WebGLRenderTarget,
  type Group,
  type Object3D,
  type PerspectiveCamera,
} from "three";
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
import type { CabinControls, MirrorGlanceKind } from "@/modules/sim/scene/cabin";
import { SKY_DOME_NAME } from "@/modules/sim/environment";
import { CABIN_LOOK_POSES } from "@/modules/sim/scene/vitok/cabinLook";
import { getCabinLook, resetCabinLook } from "@/modules/sim/scene/vitok/cabinLookStore";
import { renderMirrorPass } from "@/modules/sim/scene/vitok/mirrorPass";
import { cullInstancedForMirror } from "@/modules/sim/scene/vitok/mirrorInstanceCull";
import {
  rearViewBottomFraction,
  rearViewQuadHalfSize,
  rearViewQuadOffset,
  REAR_VIEW_CADENCE,
  REAR_VIEW_EYE,
  REAR_VIEW_FAR_M,
  REAR_VIEW_FOG_MIN_DENSITY,
  REAR_VIEW_FOV_DEG,
  REAR_VIEW_IDLE_CADENCE,
  REAR_VIEW_IDLE_OPACITY,
  REAR_VIEW_IDLE_SCALE,
  REAR_VIEW_NEAR_M,
  REAR_VIEW_SKY_RADIUS_M,
  REAR_VIEW_TARGET_HEIGHT,
  REAR_VIEW_TARGET_WIDTH,
  REAR_VIEW_YAW_RAD,
} from "@/modules/sim/scene/chaseRearView";
import {
  doorMirrorQuadHalfSize,
  doorMirrorQuadOffset,
  DOOR_MIRROR_CADENCE,
  DOOR_MIRROR_CADENCE_PHASE,
  DOOR_MIRROR_EYE,
  DOOR_MIRROR_FAR_M,
  DOOR_MIRROR_FOG_MIN_DENSITY,
  DOOR_MIRROR_FOV_DEG,
  DOOR_MIRROR_NEAR_M,
  DOOR_MIRROR_OPEN_SCALE,
  DOOR_MIRROR_PITCH_RAD,
  DOOR_MIRROR_SKY_RADIUS_M,
  DOOR_MIRROR_TARGET_HEIGHT,
  DOOR_MIRROR_TARGET_WIDTH,
  DOOR_MIRROR_YAW_RAD,
  type DoorMirrorSide,
} from "@/modules/sim/scene/cockpitDoorMirror";

export type CameraMode = "chase" | "cockpit" | "topdown";

/**
 * The two TOP-DOWN AIDS, as an imperative handle — the touch view rail's door
 * to what only `G` and `N` could reach (doc 91 §E rows 22–23: "NONE / NO").
 *
 * Each action returns the value it just set, which is the whole reason it is
 * shaped this way: a caller can render "40 м" or "СЕВЕР" from the return of
 * the tap that produced it, and never has to read a mutable ref while React is
 * rendering.
 */
export interface TopdownAidHandle {
  /** Next zoom preset. Returns the new visible ground width, m. */
  cycleZoom: () => number;
  /** North-up ⇄ heading-up. Returns true when the new state is HEADING-up. */
  toggleOrientation: () => boolean;
  /** Current preset width, m — for seeding a label when the rail opens. */
  readZoomM: () => number;
  /** True when the frame is currently HEADING-up. */
  readHeadingUp: () => boolean;
}

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

// ---------------------------------------------------------------------------
// THE ONE THING THE DOM HAS TO KNOW ABOUT THE CAMERA (rows B74 / B76 / C7).
//
// Everything the rig draws is inside the WebGL canvas, and every HUD card is a
// DOM element painted over that canvas. No renderOrder can change that, so a
// scene instrument and a DOM panel cannot negotiate — one of them simply
// covers the other. Three register rows are that collision:
//
//   B76  the „Клавиши" legend over 60 % of the Q window; the toast card over
//        half of the E one; the objective chips over the top 40 % of F.
//   B74  the mirror has nowhere to hang, because the top rail is occupied.
//   C7   the compact speed readout draws a SECOND speedometer over the 3D
//        cluster, because it cannot tell which camera is live.
//
// So the rig publishes three facts on <html> and the shell's stylesheet reads
// them (PlayAreaStyles): which camera, whether a glance is held and on which
// side, and how tall the persistent mirror is in CSS pixels. Attributes and a
// custom property rather than React state on purpose — this runs in useFrame,
// and a 60 Hz setState would be a rendering bug, not a feature. Writes happen
// only on CHANGE, so a steady drive touches the DOM zero times per frame.
// ---------------------------------------------------------------------------
const VIEW_ATTR = "simCamera";
const GLANCE_ATTR = "simGlance";
/** Lower edge of the PERSISTENT mirror, px from the top of the play area. */
const MIRROR_VAR = "--sim-mirror-h";
/** …and of the OPEN window, which is the one a held glance has to clear. */
const GLANCE_VAR = "--sim-glance-h";

/** Last published values — module-scope so the writes are change-only. */
const published: {
  camera: string | null;
  glance: string | null;
  mirrorPx: number;
  glancePx: number;
} = { camera: null, glance: null, mirrorPx: -1, glancePx: -1 };

/** Dev-only glance readout (see the write site in the frame loop). One
 *  module-scope object, mutated in place — nothing allocates per frame. */
const glanceProbe: {
  mode: string | null;
  mirror: string | null;
  strength: number;
  at: number;
} = { mode: null, mirror: null, strength: 0, at: 0 };

function publishCameraMode(mode: CameraMode | null) {
  if (typeof document === "undefined" || published.camera === mode) return;
  published.camera = mode;
  const root = document.documentElement;
  if (mode === null) delete root.dataset[VIEW_ATTR];
  else root.dataset[VIEW_ATTR] = mode;
}

/**
 * @param side  the glance being HELD, or null (idle mirror / no mirror)
 * @param mirrorPx  the persistent mirror's lower edge, in CSS px from the top
 *                  of the play area — 0 when there is no mirror at all.
 * @param glancePx  the same edge for the fully OPEN window.
 */
function publishRearView(side: MirrorGlanceKind | null, mirrorPx: number, glancePx: number) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (published.glance !== side) {
    published.glance = side;
    if (side === null) delete root.dataset[GLANCE_ATTR];
    else root.dataset[GLANCE_ATTR] = side;
  }
  const setPx = (name: string, value: number, key: "mirrorPx" | "glancePx") => {
    const px = Math.round(value);
    if (published[key] === px) return;
    published[key] = px;
    if (px <= 0) root.style.removeProperty(name);
    else root.style.setProperty(name, `${px}px`);
  };
  setPx(MIRROR_VAR, mirrorPx, "mirrorPx");
  setPx(GLANCE_VAR, glancePx, "glancePx");
}

/** Leave no attribute behind: the lesson-select screen and the theory reader
 *  must not inherit a camera that is no longer on the page. */
function clearPublishedViewState() {
  publishCameraMode(null);
  publishRearView(null, 0, 0);
}

/** Cockpit orientation damping (1/s) — softer than the eye position so the
 * view leans gently instead of transmitting every suspension tick. */
const COCKPIT_ROT_DAMPING = 16;
/** Chase look-target smoothing (1/s). */
const CHASE_LOOK_DAMPING = 10;
/** Speed-based FOV widening (deg at ~130 km/h) and its blend rate (1/s). */
// CHASE IS NOW FIXED — 0, founder-reported 2026-08-03. A speed-linked FOV is a
// racing-game device: it sells velocity by making the frame breathe. In a
// trainer it means the view silently changes scale while the student is trying
// to judge a distance, and he described it exactly — "when the user drives it
// dynamically goes wider more to the back, we must push it most to the back and
// FIX IT THERE." A camera that moves on its own is a camera you cannot learn
// to judge from. The cockpit keeps its 5 deg: there the widening is small and
// the instrument panel gives a fixed reference the chase view has no equivalent
// of.
const FOV_WIDEN_CHASE = 0;
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
 * CABIN LOOK smoothing (1/s) — how fast the head eases to (and back from) a
 * look pose. Slower than the glance's own envelope on purpose: a glance is a
 * flick, a cabin look is a deliberate turn to find a control, and a student
 * who cannot see the movement cannot learn where the control WAS.
 * ~0.35 s to settle at 9/s.
 */
const CABIN_LOOK_DAMPING = 9;
/** Below this the eased look is treated as home (avoids a permanent epsilon
 *  rotation, and lets the cheap `headYaw === 0` fast path stay reachable). */
const CABIN_LOOK_EPSILON = 1e-4;

/** Distance (m) the rear-view quad is parked in front of the main camera. Any
 *  value clear of the 0.1 m near plane works — the quad is sized from the live
 *  FOV at this distance, so the on-screen fraction is distance-independent. */
const REAR_VIEW_QUAD_DISTANCE_M = 0.5;
/** Bezel thickness as a fraction of the window's height — a dark surround so
 *  the inset reads as an instrument instead of a hole punched in the sky. */
const REAR_VIEW_BEZEL_FRACTION = 0.08;
/** Bezel colour (near-black, matches the cockpit mirror housing). */
const REAR_VIEW_BEZEL_COLOR = 0x0a0c0f;

/**
 * Render layer of the cockpit door-mirror windows — `VitokCockpit.INTERIOR_LAYER`,
 * duplicated as a literal for the same reason MirrorRig duplicates the interior
 * mount offset: importing it would be a module cycle through a `"use client"`
 * component this file is mounted alongside.
 *
 * THIS IS THE RECURSION GUARD, not decoration. The window quad lives in the
 * same scene as the world, and MirrorRig's three mirror cameras keep the default
 * layer-0 mask — so a quad on layer 0 would appear INSIDE the rear-view mirror,
 * showing the mirror showing the mirror. On the cabin layer no mirror pass can
 * ever see it (and neither can the window's own pass), so nothing has to be
 * toggled invisible around a render. The main camera has this layer enabled for
 * the whole life of the scene (VitokCockpit mounts unconditionally and only
 * gates its GROUP on `cockpitView`).
 */
const COCKPIT_HUD_LAYER = 2;

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
  topdownAidRef,
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
  /**
   * G AND N GET A DOOR THAT IS NOT A KEYBOARD — doc 91 §E rows 22–23, §I23.
   *
   * The two top-down aids have lived in the refs below since they were
   * written, reachable only through the `KeyG` / `KeyN` window listener — so
   * on a phone the zoom is pinned at 40 m forever, on the one view the
   * codebase itself says reverse-park is unreadable without.
   *
   * The state does NOT move out of this component to fix that: it is read once
   * per frame by the block below and moving it into React would put a render
   * on a camera tick. Instead the parent hands in a ref and this rig fills it
   * with the same two actions the keys call — the `cabinRef` idiom, one tree
   * over. Each action RETURNS the new value, so a caller can show it without
   * reading a mutable ref during render.
   */
  topdownAidRef?: RefObject<TopdownAidHandle | null>;
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
  /** Eased CABIN LOOK (rows FR-17/FR-25): the head turn a student asks for
   *  with the mouse to bring an out-of-frame control into the picture. Target
   *  comes from the module store; this is the smoothed value the camera uses. */
  const cabinLookRef = useRef({ yaw: 0, pitch: 0 });
  // Top-down state (refs — render-free): zoom preset index + orientation.
  const topdownZoomRef = useRef(TOPDOWN_DEFAULT_ZOOM);
  const topdownHeadingUpRef = useRef(false); // false = north-up

  // Top-down hotkeys (legend rows in LessonScene): G cycles the zoom preset,
  // N toggles north-up / heading-up. From ANOTHER view they first SWITCH into
  // top-down (when the lesson allows it), so the keys always do something
  // instead of silently no-op'ing — the founder-reported "G/N don't work".
  // On exam rungs (topdownAllowed=false) they stay inert, and the legend
  // doesn't advertise them.
  //
  // BOTH DOORS CALL THE SAME TWO FUNCTIONS. `cycleZoom` / `toggleOrientation`
  // are defined once and used by the key listener AND by the handle the touch
  // view rail holds, so a phone and a keyboard can never step the presets
  // differently — the same discipline the cabin buttons follow (one
  // CabinControls call path for keys, hotspots and the touch overlay).
  const cycleZoom = useCallback(() => {
    topdownZoomRef.current = (topdownZoomRef.current + 1) % TOPDOWN_WIDTHS_M.length;
    return TOPDOWN_WIDTHS_M[topdownZoomRef.current];
  }, []);
  const toggleOrientation = useCallback(() => {
    topdownHeadingUpRef.current = !topdownHeadingUpRef.current;
    return topdownHeadingUpRef.current;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code !== "KeyG" && e.code !== "KeyN") return;
      if (cameraModeRef.current !== "topdown") {
        if (!topdownAllowed) return;
        enterTopdown?.();
      }
      if (e.code === "KeyG") cycleZoom();
      else toggleOrientation();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cameraModeRef, topdownAllowed, enterTopdown, cycleZoom, toggleOrientation]);

  // …and the same two, published for the touch rail. Cleared on unmount so a
  // stale handle can never be called against a rig that is gone.
  useEffect(() => {
    if (!topdownAidRef) return;
    topdownAidRef.current = {
      cycleZoom,
      toggleOrientation,
      readZoomM: () => TOPDOWN_WIDTHS_M[topdownZoomRef.current],
      readHeadingUp: () => topdownHeadingUpRef.current,
    };
    return () => {
      topdownAidRef.current = null;
    };
  }, [topdownAidRef, cycleZoom, toggleOrientation]);

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

  // -------------------------------------------------------------------------
  // CHASE REAR-VIEW WINDOW (doc 86 L16 — founder items 44/45). The cockpit's
  // MirrorRig is mounted `active={cockpitView}`, so the chase POV — the one he
  // plays in — has never had a mirror of any kind, and Q/E only nudged the
  // camera a few degrees (chaseGlanceOrbit). One shared 384×160 render target
  // is aimed backward from the car and shown as a small camera-locked quad:
  // left on Q, right on E, centred on F, ≤10 % of the screen (the geometry and
  // that contract live in scene/chaseRearView.ts, unit-tested there).
  //
  // Everything here mirrors MirrorRig's proven budget: HalfFloat target so the
  // composer tone-maps it identically to the direct view, a 200 m far plane so
  // the CityBuildings chunk grid culls, a floored fog density so nothing pops
  // at that boundary, the sky dome shrunk inside the frustum, frozen shadow
  // maps, and `renderMirrorPass` owning `autoClear` — without which the raw
  // gl.render draws into an uncleared depth buffer and the window is a solid
  // black rectangle (doc 82 §3.2, fixed in 8442b91 and reused here rather than
  // re-derived). Only one glance is held at a time, so one target serves all
  // three sides.
  //
  // GRADING IS UNTOUCHED: the graded signal is still the Q/E/F press latched by
  // CabinControls.glance(). This only makes the graded press honest.
  // -------------------------------------------------------------------------
  const scene = useThree((s) => s.scene);
  const rearView = useMemo(() => {
    const target = new WebGLRenderTarget(REAR_VIEW_TARGET_WIDTH, REAR_VIEW_TARGET_HEIGHT, {
      stencilBuffer: false,
      type: HalfFloatType,
    });
    // MIRROR-IMAGE FLIP. The pass camera keeps chassis +X — which is car-LEFT —
    // as image-right, so an unflipped window would show the car we just passed
    // on our left sitting on the window's right. Real glass reverses it, and a
    // student who learns to read this window must be learning to read a mirror.
    // u → 1 − u on the texture we own; the geometry is untouched.
    target.texture.center.set(0.5, 0.5);
    target.texture.repeat.set(-1, 1);
    const camera = new PerspectiveCameraImpl(
      REAR_VIEW_FOV_DEG.rear,
      REAR_VIEW_TARGET_WIDTH / REAR_VIEW_TARGET_HEIGHT,
      REAR_VIEW_NEAR_M,
      REAR_VIEW_FAR_M,
    );
    const material = new MeshBasicMaterial({
      map: target.texture,
      toneMapped: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const bezelMaterial = new MeshBasicMaterial({
      color: REAR_VIEW_BEZEL_COLOR,
      toneMapped: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new PlaneGeometry(1, 1);
    const glass = new Mesh(geometry, material);
    const bezel = new Mesh(geometry, bezelMaterial);
    for (const m of [glass, bezel]) {
      m.frustumCulled = false;
      m.visible = false;
      m.matrixAutoUpdate = true;
    }
    // depthTest is off, so paint order is renderOrder alone: bezel first.
    bezel.renderOrder = 9_998;
    glass.renderOrder = 9_999;
    return { target, camera, material, bezelMaterial, geometry, glass, bezel };
  }, []);

  useEffect(() => {
    scene.add(rearView.bezel, rearView.glass);
    return () => {
      scene.remove(rearView.bezel, rearView.glass);
      rearView.target.dispose();
      rearView.material.dispose();
      rearView.bezelMaterial.dispose();
      rearView.geometry.dispose();
    };
  }, [scene, rearView]);

  // -------------------------------------------------------------------------
  // THE COCKPIT DOOR-MIRROR WINDOWS (founder item 45 — the half never built).
  //
  // His words: „when the user clicks Q or E … we must pop some Small window on
  // the screen on the right side if he press right and on the left side if he
  // press left, which small window will be rear view window showing whats
  // happening behind … not more than 10% of the screen … because currently I
  // cant see whats happening behind."
  //
  // The block at the bottom of this file built that for the CHASE camera and it
  // works. It is `null` in every other camera — `mode === "chase" ? … : null` —
  // so in the COCKPIT, Q and E have only ever turned the head. What the head
  // turns toward is the GLB door glass, and MirrorRig's `activeKindsFor` gives
  // the doors an RTT feed ONLY on the `high` preset while the shipped default is
  // `medium`: on the preset almost everybody plays, a mirror check lands on
  // authored dark gloss. That is the whole of „I press E but nothing much is
  // seen", and it is why this window renders its own pass instead of sampling
  // MirrorRig's glass target — it then behaves identically on low, medium and
  // high, and it leaves the glass's own budget decision alone.
  //
  // The pass camera sits at the GLB DOOR-GLASS position, ±0.905 m outboard.
  // That vantage is what makes it a door mirror rather than a second rear-view:
  // the adjacent lane, the blind-spot quarter and the car's own flank as the
  // reference. Every other constant follows MirrorRig's proven budget — a
  // HalfFloat target so the composer tone-maps it like the direct view, a 200 m
  // far plane so the CityBuildings chunk grid culls, a floored fog density so
  // nothing pops at that boundary, the sky dome shrunk inside the frustum, and
  // `renderMirrorPass` owning `autoClear`, without which the raw gl.render draws
  // into an uncleared depth buffer and the window is a black rectangle.
  //
  // GRADING IS UNTOUCHED: the graded mirror-check signal is still the Q/E press
  // latched by CabinControls.glance(). This makes the graded press honest —
  // a student told to check his mirror and shown dark gloss learns to press a
  // key; shown the lane beside him, he learns to check his mirror.
  // -------------------------------------------------------------------------
  const doorMirror = useMemo(() => {
    const target = new WebGLRenderTarget(DOOR_MIRROR_TARGET_WIDTH, DOOR_MIRROR_TARGET_HEIGHT, {
      stencilBuffer: false,
      type: HalfFloatType,
    });
    // MIRROR-IMAGE FLIP. The pass camera keeps chassis +X — car-LEFT, i.e.
    // OUTBOARD for the left mirror — as image-right, so unflipped the window
    // would show the adjacent lane on the right and our own flank on the left:
    // the exact reverse of the glass it is standing in for. Real mirrors
    // reverse it, and a student learning to read this window must be learning
    // to read a mirror. u → 1 − u on the texture we own; geometry untouched.
    target.texture.center.set(0.5, 0.5);
    target.texture.repeat.set(-1, 1);
    const camera = new PerspectiveCameraImpl(
      DOOR_MIRROR_FOV_DEG,
      DOOR_MIRROR_TARGET_WIDTH / DOOR_MIRROR_TARGET_HEIGHT,
      DOOR_MIRROR_NEAR_M,
      DOOR_MIRROR_FAR_M,
    );
    const material = new MeshBasicMaterial({
      map: target.texture,
      toneMapped: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const bezelMaterial = new MeshBasicMaterial({
      color: REAR_VIEW_BEZEL_COLOR,
      toneMapped: false,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const geometry = new PlaneGeometry(1, 1);
    const glass = new Mesh(geometry, material);
    const bezel = new Mesh(geometry, bezelMaterial);
    for (const m of [glass, bezel]) {
      m.frustumCulled = false;
      m.visible = false;
      m.matrixAutoUpdate = true;
      m.layers.set(COCKPIT_HUD_LAYER); // see the constant: recursion guard
    }
    // depthTest is off, so paint order is renderOrder alone: bezel first. Above
    // the chase window's pair, which is never visible at the same time anyway.
    bezel.renderOrder = 10_000;
    glass.renderOrder = 10_001;
    return { target, camera, material, bezelMaterial, geometry, glass, bezel };
  }, []);

  useEffect(() => {
    scene.add(doorMirror.bezel, doorMirror.glass);
    return () => {
      scene.remove(doorMirror.bezel, doorMirror.glass);
      doorMirror.target.dispose();
      doorMirror.material.dispose();
      doorMirror.bezelMaterial.dispose();
      doorMirror.geometry.dispose();
    };
  }, [scene, doorMirror]);

  // The published view state is global (on <html>), so it must be withdrawn
  // when the rig leaves — otherwise /simulator's lesson shelf would still be
  // told it is sitting in a cockpit. The cabin-look store is module-level for
  // the same reason and gets the same treatment: a head turned toward the
  // seat belt must never survive into the next lesson.
  useEffect(() => {
    resetCabinLook();
    return () => {
      clearPublishedViewState();
      resetCabinLook();
    };
  }, []);

  /** Frame counter for REAR_VIEW_CADENCE. */
  const rearViewFrameRef = useRef(0);
  /** …and for DOOR_MIRROR_CADENCE (counts only while a window is open). */
  const doorMirrorFrameRef = useRef(0);
  /** Which side the door-mirror target currently HOLDS. One target serves both
   *  windows, so a student who releases Q and presses E inside one cadence gap
   *  would otherwise be shown the LEFT mirror's pixels inside the RIGHT window —
   *  a mirror that lies about which way you are looking. */
  const doorMirrorSideRef = useRef<DoorMirrorSide | null>(null);
  /** The SkyDome, resolved lazily by name (it mounts in a sibling tree). */
  const skyRef = useRef<Object3D | null>(null);

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
    // Rear-view window: pass-camera eye, its yaw, and the quad's world pose.
    rvEye: new Vector3(),
    rvYaw: new Quaternion(),
    rvQuad: new Vector3(),
    // Cockpit door-mirror window: the same three, for the outboard pass.
    dmEye: new Vector3(),
    dmPitch: new Quaternion(),
    dmQuad: new Vector3(),
    // B67 probe scratch — the camera's offset expressed in the CAR's frame.
    probeLocal: new Vector3(),
    probeInv: new Quaternion(),
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
    publishCameraMode(mode);

    const switched = mode !== lastMode.current;
    if (switched) {
      lastMode.current = mode;
      // A cabin look belongs to the cockpit. Leaving it (C → chase/top-down)
      // drops the pose, so coming back never snaps the student's head into a
      // look he asked for two views ago.
      if (mode !== "cockpit") resetCabinLook();
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
    // --- GLANCE PROBE (dev builds only; never on the founder's build) --------
    // Same argument as the B67 probe below, for the control the exam GRADES.
    // „«Л»/«З»/«Д» produce no camera movement" could only ever be argued about
    // by diffing screenshots of a world that is never still — and a diff cannot
    // tell a head that did not turn from a head that turned and came home
    // before the shutter (a TAP holds for GLANCE_TAP_HOLD_S = 0.9 s and then
    // eases back on its own). Two numbers end that argument: the mirror the
    // state machine is holding and the 0..1 envelope the head turn is actually
    // driven by. Published in EVERY mode on purpose — `data-sim-glance` is
    // written only in chase (see publishRearView's caller below), so a probe
    // that reads it reports every cockpit glance dead.
    if (process.env.NODE_ENV !== "production") {
      const probe = glanceProbe;
      probe.mode = mode;
      probe.mirror = cabin?.glanceMirror ?? null;
      probe.strength = glanceS;
      probe.at = performance.now();
      (window as unknown as { __glanceProbe?: unknown }).__glanceProbe = probe;
    }
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

    const { pos, quat, fwd, fwdFlat, desired, look, lookSmooth, eye, rotSmooth, glanceQuat, glanceEuler, sway, leanQuat, leanEuler, prevPos, upSmooth, rvEye, rvYaw, rvQuad, dmEye, dmPitch, dmQuad } =
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
      //  · Cabin look: a pose the student ASKED for with the mouse, because
      //    the control the lesson names is not in the windscreen frame — the
      //    seat-belt buckle (80° straight down) and the right door mirror
      //    (a third of a screen off the right edge). See
      //    scene/vitok/cabinLook.ts for the projection that proves it, and
      //    cabinLookStore for who sets it. Eased separately and CROSSFADED
      //    with the glance on the same envelope, so a held mirror always wins
      //    the neck and, for the right mirror, wins it at the identical angle
      //    (the pose IS GLANCE_OFFSETS.right) — no jump at the handover.
      const mirror = cabin?.glanceMirror;
      const lookPose = CABIN_LOOK_POSES[getCabinLook()];
      const cabinLook = cabinLookRef.current;
      const kLook = switched ? 1 : 1 - Math.exp(-CABIN_LOOK_DAMPING * delta);
      cabinLook.yaw += (lookPose.yaw - cabinLook.yaw) * kLook;
      cabinLook.pitch += (lookPose.pitch - cabinLook.pitch) * kLook;
      if (Math.abs(cabinLook.yaw) < CABIN_LOOK_EPSILON) cabinLook.yaw = 0;
      if (Math.abs(cabinLook.pitch) < CABIN_LOOK_EPSILON) cabinLook.pitch = 0;
      let headYaw = 0;
      let headPitch = 0;
      const glanceEnv =
        glanceS > 0 && mirror ? glanceS * glanceS * (3 - 2 * glanceS) : 0;
      if (glanceEnv > 0 && mirror) {
        const o = GLANCE_OFFSETS[mirror];
        headYaw += o.yaw * glanceEnv;
        headPitch += o.pitch * glanceEnv;
      }
      if (cabinLook.yaw !== 0 || cabinLook.pitch !== 0) {
        headYaw += cabinLook.yaw * (1 - glanceEnv);
        headPitch += cabinLook.pitch * (1 - glanceEnv);
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

      // --- B67 PROBE (dev builds only; never on the founder's build) ---------
      // Register B67's verification clause is explicit: "verify the fix with a
      // POSITIONAL assertion (camera-to-COCKPIT_EYE under 0.15 m while holding
      // 145 km/h), not by eye — the previous fix passed by eye at 76 km/h and
      // fails at 145." There was no way to read that number from outside the
      // canvas, so the back-seat POV could only ever be argued about. This
      // publishes the camera's offset IN THE CAR'S OWN FRAME, which is exactly
      // the quantity COCKPIT_EYE names, plus the chassis pose it was measured
      // against so a harness can tell a mis-CONVERGED camera (offset wrong)
      // from a STALE-READ one (offset right, car drawn somewhere else).
      if (process.env.NODE_ENV !== "production") {
        const { probeLocal, probeInv } = scratchRef.current;
        probeLocal.copy(cam.position).sub(pos).applyQuaternion(probeInv.copy(quat).invert());
        (window as unknown as { __camProbe?: unknown }).__camProbe = {
          speedKmh: sim?.speedKmh ?? 0,
          delta,
          // Camera position expressed car-local (+X car-left, +Y up, +Z fwd).
          localX: probeLocal.x,
          localY: probeLocal.y,
          localZ: probeLocal.z,
          // Signed error against the authored eye — negative Z is REARWARD.
          errX: probeLocal.x - COCKPIT_EYE.x,
          errY: probeLocal.y - COCKPIT_EYE.y,
          errZ: probeLocal.z - COCKPIT_EYE.z,
          errM: Math.hypot(
            probeLocal.x - COCKPIT_EYE.x,
            probeLocal.y - COCKPIT_EYE.y,
            probeLocal.z - COCKPIT_EYE.z,
          ),
          chassisX: pos.x,
          chassisY: pos.y,
          chassisZ: pos.z,
          camX: cam.position.x,
          camY: cam.position.y,
          camZ: cam.position.z,
        };
      }
    }

    // --- Chase rear-view window (doc 86 L16; second pass = rows B74/B76).
    // Runs LAST, so the quad is parked against the pose this frame actually
    // renders with.
    //
    // B74: the window is no longer bound to the glance HOLD. In the chase POV
    // it is ALWAYS there — a small interior mirror at REAR_VIEW_IDLE_SCALE —
    // because that is what „put Rear Mirror … in the POV after pressing C"
    // asks for, and because the drill this failed on (sc-follow-tailgater) is
    // played blind if you have to know a key to see behind you. A held glance
    // then GROWS it to full size, swings the pass camera into that quarter and
    // slides it to that side of the screen (item 45, unchanged) — one
    // continuous instrument leaning toward the glass, not two widgets.
    // -----------------------------------------------------------------------
    const rv = rearView;
    const heldSide = glanceS > 0 ? (cabin?.glanceMirror ?? null) : null;
    const rvSide: MirrorGlanceKind | null =
      mode === "chase" ? (heldSide ?? "rear") : null;
    if (rvSide === null) {
      rv.glass.visible = false;
      rv.bezel.visible = false;
      rearViewFrameRef.current = 0;
      publishRearView(null, 0, 0);
    } else {
      // Smoothstepped with the same envelope the head turn uses, so the window
      // opens and closes on exactly the glance's rhythm. `env` is 0 for the
      // idle mirror and 1 at a full hold; everything below interpolates on it.
      const env = heldSide === null ? 0 : glanceS * glanceS * (3 - 2 * glanceS);
      const scale = REAR_VIEW_IDLE_SCALE + (1 - REAR_VIEW_IDLE_SCALE) * env;

      // 1. Aim the pass camera from the CAR (not from the chase vantage 8 m
      //    behind it — from there the car's own boot would fill the window).
      //    Idle it looks straight back through the interior mirror's narrow
      //    FOV; the glance widens it and yaws it into the quarter.
      const fovDeg =
        REAR_VIEW_FOV_DEG.rear + (REAR_VIEW_FOV_DEG[rvSide] - REAR_VIEW_FOV_DEG.rear) * env;
      if (rv.camera.fov !== fovDeg) {
        rv.camera.fov = fovDeg;
        rv.camera.updateProjectionMatrix();
      }
      rvEye
        .set(REAR_VIEW_EYE.x, REAR_VIEW_EYE.y, REAR_VIEW_EYE.z)
        .applyQuaternion(quat)
        .add(pos);
      rv.camera.position.copy(rvEye);
      // A camera carrying the chassis quaternion looks down chassis −Z, i.e.
      // straight back (the car drives +Z); the per-side yaw swings it into the
      // glanced quarter. See REAR_VIEW_YAW_RAD for the sign derivation.
      rvYaw.setFromAxisAngle(UP_AXIS, REAR_VIEW_YAW_RAD[rvSide] * env);
      rv.camera.quaternion.copy(quat).multiply(rvYaw);

      // 2. The RTT pass, on cadence — a quarter-rate one while nobody is
      //    looking (REAR_VIEW_IDLE_CADENCE). The quad is hidden for the
      //    duration: it is in the same scene, and a window that can see itself
      //    is a feedback loop.
      const cadence = env > 0 ? REAR_VIEW_CADENCE : REAR_VIEW_IDLE_CADENCE;
      if (rearViewFrameRef.current++ % cadence === 0) {
        rv.glass.visible = false;
        rv.bezel.visible = false;
        let sky = skyRef.current;
        if (!sky || !sky.parent) {
          sky = state.scene.getObjectByName(SKY_DOME_NAME) ?? null;
          skyRef.current = sky;
        }
        // Per-instance cull, same reason as MirrorRig's (mirrorInstanceCull.ts):
        // three rejects an InstancedMesh on ONE sphere that unions every
        // instance, and this world's sets are 800-1100 m across, so a backward
        // camera was sent the whole district for a 384×160 window. The camera
        // is parentless, so `updateWorldMatrix` is what refreshes the
        // `matrixWorldInverse` the frustum is extracted from — three does it
        // inside `render()`, which is too late for a cull that runs before it.
        rv.camera.updateWorldMatrix(true, false);
        const cull = cullInstancedForMirror(state.scene, rv.camera);
        try {
          renderMirrorPass(state.gl, {
            target: rv.target,
            scene: state.scene as never,
            camera: rv.camera as never,
            fog: state.scene.fog instanceof FogExp2 ? state.scene.fog : null,
            fogMinDensity: REAR_VIEW_FOG_MIN_DENSITY,
            sky,
            skyRadius: REAR_VIEW_SKY_RADIUS_M,
          });
        } finally {
          cull.restore();
        }
      }

      // 3. Park the quad in front of the main camera, sized from the LIVE fov
      //    and aspect so the on-screen fraction holds through the speed-widen
      //    and through any window shape. The horizontal offset rides `env`
      //    too: at rest the mirror hangs in the middle where a real interior
      //    one does, and it SLIDES to the glanced side as the hold eases in.
      const vFov = (cam.fov * Math.PI) / 180;
      const { halfWidth, halfHeight } = rearViewQuadHalfSize(
        REAR_VIEW_QUAD_DISTANCE_M,
        vFov,
        cam.aspect,
        scale,
      );
      const off = rearViewQuadOffset(rvSide, REAR_VIEW_QUAD_DISTANCE_M, vFov, cam.aspect, scale);
      const bezel = halfHeight * 2 * REAR_VIEW_BEZEL_FRACTION;
      rv.glass.scale.set(halfWidth * 2, halfHeight * 2, 1);
      rv.bezel.scale.set(halfWidth * 2 + bezel, halfHeight * 2 + bezel, 1);
      rvQuad
        .set(off.x * env, off.y, -REAR_VIEW_QUAD_DISTANCE_M)
        .applyQuaternion(cam.quaternion)
        .add(cam.position);
      rv.glass.position.copy(rvQuad);
      rv.bezel.position.copy(rvQuad);
      rv.glass.quaternion.copy(cam.quaternion);
      rv.bezel.quaternion.copy(cam.quaternion);
      const opacity = REAR_VIEW_IDLE_OPACITY + (1 - REAR_VIEW_IDLE_OPACITY) * env;
      rv.material.opacity = opacity;
      rv.bezelMaterial.opacity = opacity * 0.9;
      rv.glass.visible = true;
      rv.bezel.visible = true;

      // 4. Tell the DOM. The quad lives INSIDE the scene, so no renderOrder can
      //    lift it above a HUD card — B76's frames have the „Клавиши" legend
      //    over 60 % of the Q window and the objective chips over the top 40 %
      //    of the F one. The shell reads these two attributes and the published
      //    height (see PlayAreaStyles) to step its top rail below the mirror and
      //    to stand its side panels down for the second a glance is held.
      publishRearView(
        heldSide,
        rearViewBottomFraction(cam.aspect, REAR_VIEW_IDLE_SCALE) * state.size.height,
        rearViewBottomFraction(cam.aspect) * state.size.height,
      );
    }

    // --- Cockpit door-mirror windows (founder item 45; see the rig above).
    // Q → a window on the LEFT of the screen, E → on the RIGHT, each showing
    // what is behind through that door mirror. Runs after the chase block for
    // the same reason it does: the quad is parked against the pose this frame
    // actually renders with.
    //
    // The head turn STAYS. It is not in the window's way — the quad is
    // camera-locked, so it holds its side of the frame however far the neck
    // swings — and the two together are one act: you turn your head toward the
    // mirror and the mirror is legible when you get there. He asked for the
    // window, not for the glance to be taken away.
    //
    // The permanent centre mirror also stays, untouched: in the cockpit that is
    // the physical GLB rear-view glass, which MirrorRig feeds on every preset.
    // Only the two DOOR mirrors were dead, and only they get a window.
    // -----------------------------------------------------------------------
    const dm = doorMirror;
    const dmMirror = cabin?.glanceMirror;
    const dmSide: DoorMirrorSide | null =
      mode === "cockpit" && glanceS > 0 && (dmMirror === "left" || dmMirror === "right")
        ? dmMirror
        : null;
    if (dmSide === null) {
      dm.glass.visible = false;
      dm.bezel.visible = false;
      doorMirrorFrameRef.current = 0;
      doorMirrorSideRef.current = null;
    } else {
      // Same smoothstep the head turn runs on, so the window opens and closes
      // on exactly the glance's rhythm instead of snapping into the frame.
      const env = glanceS * glanceS * (3 - 2 * glanceS);

      // 1. Aim: the GLB door-glass position (chassis-local, +X is car-LEFT),
      //    carried into world space by the chassis pose. A camera holding the
      //    chassis quaternion already looks down chassis −Z — straight back —
      //    and the authored 4.6° droop keeps road in the lower two thirds.
      const dmEyeLocal = DOOR_MIRROR_EYE[dmSide];
      dmEye.set(dmEyeLocal.x, dmEyeLocal.y, dmEyeLocal.z).applyQuaternion(quat).add(pos);
      dm.camera.position.copy(dmEye);
      dmPitch.setFromAxisAngle(UP_AXIS, DOOR_MIRROR_YAW_RAD);
      dm.camera.quaternion.copy(quat).multiply(dmPitch);
      dm.camera.rotateX(DOOR_MIRROR_PITCH_RAD);

      // 2. The RTT pass, on cadence. No visibility juggling is needed around it:
      //    the quad is on COCKPIT_HUD_LAYER and every mirror camera in the scene
      //    (MirrorRig's three, and this one) keeps the default layer-0 mask, so
      //    no pass can see it and no feedback loop is possible.
      //    The side change forces a pass off-cadence: one target serves both
      //    windows, so opening the RIGHT one on a target still holding the LEFT
      //    view would show a mirror that lies about which way you are looking.
      const tick = doorMirrorFrameRef.current++;
      const sideChanged = doorMirrorSideRef.current !== dmSide;
      if (sideChanged || tick % DOOR_MIRROR_CADENCE === DOOR_MIRROR_CADENCE_PHASE) {
        doorMirrorSideRef.current = dmSide;
        let sky = skyRef.current;
        if (!sky || !sky.parent) {
          sky = state.scene.getObjectByName(SKY_DOME_NAME) ?? null;
          skyRef.current = sky;
        }
        // Per-instance cull — see the rear-view pass above and
        // mirrorInstanceCull.ts. This window is only open during a held glance,
        // which is exactly when the frame can least afford a second full
        // submission of the district.
        dm.camera.updateWorldMatrix(true, false);
        const cull = cullInstancedForMirror(state.scene, dm.camera);
        try {
          renderMirrorPass(state.gl, {
            target: dm.target,
            scene: state.scene as never,
            camera: dm.camera as never,
            fog: state.scene.fog instanceof FogExp2 ? state.scene.fog : null,
            fogMinDensity: DOOR_MIRROR_FOG_MIN_DENSITY,
            sky,
            skyRadius: DOOR_MIRROR_SKY_RADIUS_M,
          });
        } finally {
          cull.restore();
        }
      }

      // 3. Park the quad in front of the main camera, sized from the LIVE fov
      //    and aspect so the ≤10 % share holds through the cockpit's speed-widen
      //    and on any window shape. It grows a little as the look settles, so
      //    the window reads as leaning toward the glass rather than a panel
      //    being switched on.
      const scale = DOOR_MIRROR_OPEN_SCALE + (1 - DOOR_MIRROR_OPEN_SCALE) * env;
      const vFov = (cam.fov * Math.PI) / 180;
      const { halfWidth, halfHeight } = doorMirrorQuadHalfSize(
        REAR_VIEW_QUAD_DISTANCE_M,
        vFov,
        cam.aspect,
        scale,
      );
      const off = doorMirrorQuadOffset(
        dmSide,
        REAR_VIEW_QUAD_DISTANCE_M,
        vFov,
        cam.aspect,
        scale,
      );
      const bezel = halfHeight * 2 * REAR_VIEW_BEZEL_FRACTION;
      dm.glass.scale.set(halfWidth * 2, halfHeight * 2, 1);
      dm.bezel.scale.set(halfWidth * 2 + bezel, halfHeight * 2 + bezel, 1);
      dmQuad
        .set(off.x, off.y, -REAR_VIEW_QUAD_DISTANCE_M)
        .applyQuaternion(cam.quaternion)
        .add(cam.position);
      dm.glass.position.copy(dmQuad);
      dm.bezel.position.copy(dmQuad);
      dm.glass.quaternion.copy(cam.quaternion);
      dm.bezel.quaternion.copy(cam.quaternion);
      dm.material.opacity = env;
      dm.bezelMaterial.opacity = env * 0.9;
      dm.glass.visible = env > 0.01;
      dm.bezel.visible = dm.glass.visible;
    }
  });

  return null;
}
