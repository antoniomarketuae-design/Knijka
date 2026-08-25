"use client";

/**
 * TrafficLayer — instanced R3F presentation for the traffic system.
 *
 * Phase-1 "traffic life" pass (docs/simulation/66 §5): the agents used to be
 * un-grounded Lambert primitives with frozen wheels that slid through turns —
 * the audit's #1 believability killer. This layer now:
 *  - grounds every agent with a soft blob-shadow decal (+ real castShadow on
 *    capable tiers) so cars/pedestrians stop floating,
 *  - rolls the wheels from speed·dt/r and steers the front pair from the turn
 *    rate, so "sliding boxes" read as driving cars,
 *  - slerp-smooths each vehicle's yaw so NPCs stop snapping through corners,
 *  - lights emissive head/tail lamps (gated on the optional `night` flag) and
 *    amber blinkers driven from the derived turn direction,
 *  - renders the authored GLB fleet (./vehicleFleet — fleet v2, doc 70 REF 3:
 *    12 v2 models + v1 police + the REF-4 hero boxy luxury SUV): each agent is
 *    assigned a model deterministically from its id (police ~1-in-15, research-
 *    weighted mix, taxi ~1-in-10, hero SUV ~1-in-20 capped), same-model agents
 *    share an InstancedMesh, palette-listed models carry a per-instance paint
 *    tint on a split paint shell, and ALL standard wheels are one shared
 *    InstancedMesh (spun/steered per frame; the hero SUV spins its own
 *    side-mirrored custom wheel meshes) — so real cars cost a fixed handful
 *    of draws, not one per agent,
 *  - and (when the district is supplied) drops a deterministic parked-car pass
 *    along residential/arterial curbs so the streets aren't deserted.
 *
 * A5 visual-floor pass (doc 68): the parked cars are the same GLB kit as
 * the moving fleet — static per-model InstancedMeshes (parked pool only:
 * no police/minibus/hero SUV, curb taxis allowed — see vehicleFleet)
 * + a static shared wheel mesh + blob shadows, placed once. Pedestrians are
 * articulated: six instanced parts (torso, head, 2 arms, 2 legs) with a
 * counter-phase leg/arm swing driven by each agent's walkPhase/speed, and
 * deterministic per-id height/build variation. The layer also renders the L5
 * sudden-obstacle stimulus (a bright ball darting across the road) when the
 * lesson supplies `hazard` — dormant until the A8 orchestrator flips
 * `hazardActiveRef` true.
 *
 * JU-18 controller figure (doc 72 регулировчик): when `controllerFigure`
 * supplies the runtime's schedule read model, the staged "directTraffic"
 * officer is a LIVE rig — it faces the currently halted axis (chest/back =
 * стоп, side profile = премини), raises an arm through the pre-flip
 * „внимание" window and turns smoothly at the authored flip. One schedule
 * read per frame into a reused record; the same clock the grading reads.
 *
 * ADR-001: all vehicles are FICTIONAL — no real car-brand names anywhere.
 *
 * Draw-call budget stays flat in agent count: a fixed handful of instanced
 * draws total. Agents beyond `maxDrawDistanceM` from the camera are culled by
 * writing a zero-scale matrix (no scene-graph churn).
 *
 * Coordinates: district (x = east, y = north) -> three.js (x, -z), y-up —
 * the same mapping district-v1.json documents. Vehicle geometry noses +Z in
 * local space; yaw = atan2(dirX, -dirY) points it along the travel direction.
 *
 * When `runtime` is passed the layer drives `system.update` itself inside its
 * useFrame (fine for drop-in use). For explicit frame ordering next to the
 * rule engine, omit `runtime` and call `system.update` yourself — the layer
 * then only renders state.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  CanvasTexture,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  Object3D,
  type Matrix4,
  Quaternion,
  Mesh,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
  type Object3D as AnyObject3D,
} from "three";
import {
  PERCEPTUAL_ROAD_SCALE,
  type ActorLabelSpec,
  type HazardStimulusSpec,
  type SignalPhase,
} from "../contracts";
import { edgeTravelHalfWidth, isMotorwayEdge, nodeOpenRadiusM } from "../world/builders/network";
// B40(a) — the EXTRACTED world-label channel (doc 87 B35). This layer keeps its
// own painter for the B42 officer bubble on purpose (that row is closed and
// photographed; moving it would put it back at risk for nothing the founder can
// see, and `worldLabel.ts` carries the note that says so). The STAGED-ACTOR
// caption is new work, so it adopts the shared channel rather than becoming a
// third painter.
import {
  drawWorldLabel,
  WORLD_LABEL_GAP_M,
  WORLD_LABEL_H_M,
  WORLD_LABEL_TEX_H,
  WORLD_LABEL_TEX_W,
  WORLD_LABEL_W_M,
} from "../world/components/worldLabel";
import {
  STAGED_ACTOR_LABEL_MAX_DIST_M,
  STAGED_ACTOR_LABEL_MAX_SCALE,
  STAGED_ACTOR_LABEL_REF_DIST_M,
  STAGED_ACTOR_LABEL_ROOF_M,
  STAGED_ACTOR_LABEL_STILL_MPS,
  STAGED_ACTOR_LABELS,
} from "./stagedActorLabels";
import {
  BUBBLE_ARM_RAISED,
  BUBBLE_CHEST_OR_BACK,
  BUBBLE_SIDE_PROFILE,
  CONTROLLER_BUBBLES,
  type ControllerBubbleCopy,
} from "./controllerGestures";
import type {
  DistrictEdge,
  TrafficDistrict,
  TrafficSystem,
  TrafficUpdateContext,
  VehicleIndicator,
} from "./types";
import {
  assignCivilianModel,
  BOXY_MAX_INSTANCES,
  BOXY_MAX_INSTANCES_LOW,
  buildAnimalRig,
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET,
  FLEET_URLS,
  updateEmergencyStrobe,
} from "./vehicleFleet";

// Pedestrian palettes: tops (existing 4 variants) + trousers per variant.
const PED_COLORS = ["#b8895a", "#6d8a67", "#7a6f9b", "#a0524d"];
const PED_LEG_COLORS = ["#3a4150", "#4d4439", "#565a5f", "#2f3a4a"];
// VP-11 "stopSignal" / JU-18 "directTraffic" poses (doc 72 — the officer
// figures): generic hi-vis vest over dark trousers, NO real insignia
// (ADR-001 fictional).
const PED_POSE_HIVIS = "#cadd2e";
const PED_POSE_LEGS = "#22304a";
const BRAKE_ON = "#ff2a1a"; // brake pressed
const TAIL_ON = "#7c130b"; // dim tail glow when lights are on at night
const BRAKE_OFF = "#3a0f0b"; // unlit lens (day)
const HEAD_COLOR = "#fff2cf"; // warm headlight glow (night)
const BLINK_ON = "#ff9a1f";
const BLINK_OFF = "#2a1c08";

// Car body/wheel/lamp offsets come from each GLB model's rig (./vehicleFleet).
const BLOB_Y = 0.03;

// Articulated pedestrian skeleton — scale-1 person ≈ 1.73 m; every joint Y
// scales with the per-id height factor, lateral offsets with the build factor.
// Limb geometry is baked origin-at-joint (see pedGeoms) so a single instance
// matrix (yaw · swing about local X) both places and swings each limb.
const PED_HIP_Y = 0.76;
const PED_SHOULDER_Y = 1.42;
export const PED_HEAD_Y = 1.6;
export const PED_SHOULDER_HALF = 0.21; // arm lateral offset from spine
const PED_HIP_HALF = 0.09; // leg lateral offset from spine
/** Torso capsule radius at scale 1, m — also the figure's silhouette half-depth
 *  seen in profile (a capsule is rotationally symmetric about its own axis).
 *  Exported: the officer-arm legibility measurement is stated against it. */
export const PED_TORSO_RADIUS_M = 0.155;
const PED_ARM_RADIUS_M = 0.048;
const PED_ARM_CYL_M = 0.5;
/** Shoulder joint → fingertip at scale 1, m: the arm capsule's full length
 *  (cylinder + both caps), which is why the geometry is translated by half of
 *  it to bake the origin at the shoulder. Exported for the same reason. */
export const PED_ARM_REACH_M = PED_ARM_CYL_M + 2 * PED_ARM_RADIUS_M; // 0.596
const PED_LEG_SWING_RAD = 0.55;
const PED_ARM_SWING_RAD = 0.3;
/** Walking speed (m/s) at which the swing reaches full amplitude. */
const PED_SWING_FULL_SPEED_MPS = 1.1;
/** "stopSignal" pose: the RIGHT arm held rotated ~166° about the shoulder —
 *  raised nearly straight up, the стоп-сигнал gesture (VP-11 officer). */
export const PED_POSE_ARM_RAISE_RAD = 2.9;
/** "directTraffic" pose (JU-18 регулировчик): the RIGHT arm held rotated 90°
 *  about the shoulder — extended horizontally along the facing direction.
 *  LEGACY STATIC fallback only — with a `controllerFigure` channel wired the
 *  officer runs the live OFC_* rig below instead. */
const PED_POSE_ARM_EXTEND_RAD = Math.PI / 2;

// JU-18 scheduled officer rig (doc 72 / ППЗДвП чл. 66 — the posture alphabet
// the controller templates teach). Driven from the SAME schedule + clock the
// stop-line adjudication grades (props.controllerFigure — never a second
// clock): the figure FACES the currently halted axis — chest/back = стоп —
// with BOTH arms out sideways, a wall across the halted path; the permitted
// axis sees his side profile, the arm extended along its travel direction
// (the wave-through). Through the last OFC_RAISE_LEAD_SEC before the authored
// flip the right arm goes straight up — „внимание, сменям посоките", the
// raised-arm phase both templates warn about — then the figure turns smoothly
// (~1 s damp, no teleport) onto the new halted axis.
/**
 * B41 / ledger L4 — „we spoke as well that we will make them bigger but I now
 * see you have not done that".
 *
 * The officer used to take the ordinary walker's hashed height
 * (0.9–1.12 of a ~1.73 m skeleton), so on the controller drills he was one
 * more pedestrian standing in a junction whose apron is drawn at
 * PERCEPTUAL_ROAD_SCALE 2.5 — and `sc-sig-controller-postures`, whose whole
 * teach goal is «разчети позата», asked the student to resolve a gesture on a
 * 1.7 m figure 27 m away. These are PINNED (no hash jitter, the child/elder
 * precedent) so the same figure reads identically on every attempt.
 *
 * A deliberately imposing ~2.1 m officer with a heavier build, which is the
 * silhouette a uniformed figure has to have to be found at all in a busy
 * junction. The caption bubble above him does the rest at distance.
 */
const PED_OFFICER_HEIGHT = 1.22;
const PED_OFFICER_BUILD = 1.18;
/**
 * B41 again, 2026-08-10 — „we spoke that we will make them bigger but I now
 * see you have not done that", said AFTER the 1.22 above shipped.
 *
 * The number is BORROWED, not invented. `world/builders/constants.ts` already
 * carries his ruling for exactly this problem, in his own words — „those signs
 * must be big because they are a major part" — as `SCENARIO_SIGN_SCALE = 1.5`,
 * with the reason written beside it: *„Real-size signs read miniature against
 * the 2.5× perceptually scaled road; the drills' own signs must be
 * unmissable."*
 *
 * On the three controller drills the регулировчик IS the sign. The lamps are
 * dark (`SC_SIG_CONTROLLER_POSTURES`) or actively misleading (the other two pin
 * a green while he halts you), so his body is the whole law source at that
 * junction — and he was rendering at 1.22× real, BELOW the prominence every
 * lesson-critical Б2 and Д11 in the product already gets. Now he carries the
 * same multiplier they do: 1.5 × the 1.73 m skeleton = 2.6 m.
 *
 * MEASURED, not predicted — same drill, same seat, same stop at y = −31.8,
 * officer 20.8 m ahead, canvas 1028×577 inside a 1280×720 frame: the figure
 * goes from 79 px (`b41/base/B41base-step04`) to 99 px (`b41/fix1/
 * B41fix-step01`), i.e. +25 % tall and +56 % silhouette. The arm scales with
 * the height too, so the both-arms-out halt — the thing «разчети позата»
 * actually asks him to resolve — spans ~2.3 m instead of ~1.9 m.
 *
 * WHY IT IS A SEPARATE CONSTANT FROM `PED_OFFICER_*`, and not simply a bigger
 * number up there: `pedHeight` is keyed on `p.pose !== undefined`, and the
 * OTHER pose is VP-11 „stopSignal" — the patrol warden who stands at a school
 * curb (`templates-pe2.ts`) a few metres from the windscreen, beside children
 * rendered at 0.72 (~1.25 m). He has no legibility problem to solve and a
 * 2.6 m warden next to 1.25 m children would be a new defect in someone else's
 * photographed row. The prominence goes to the figure whose posture is the
 * lesson, at the range the lesson grades it from.
 *
 * BUILD 1.30 WAS CLAIMED TO BE „free of the arm-legibility question" HERE, and
 * sweep161 photographed the opposite — see OFC_ARM_FWD_RAD below, which is the
 * repair. What 1.30 does buy is honest and narrower than the old sentence: it
 * scales the torso capsule radius and the shoulder offset by the SAME factor,
 * so a heavier officer is not a more FUSED one.
 *
 * His FACE, hands and uniform are a modelling job on the founder's own machine
 * (FR-35/FR-43) and are not something these constants can fix.
 */
export const PED_CONTROLLER_HEIGHT = 1.5;
export const PED_CONTROLLER_BUILD = 1.3;
export const OFC_ARM_OUT_RAD = 1.47; // both-arms-out sideways raise (about local Z)
/**
 * FR-OFC-ARMS (sweep161, `sc-signal-controller/mobile-right/04-t053s.png`) —
 * THE ARMS THE WHOLE DRILL ASKS HIM TO READ SUBTEND ZERO WIDTH FROM THE SEAT.
 *
 * The finding, in the auditor's words: *„through the whole approach (t017s to
 * t058s, i.e. the entire decision window) he renders as a featureless olive
 * capsule with a bare head on a dark post: at 300–400 % zoom on 04-t053s there
 * are no arms visible at all"*, and *„the code comment in TrafficLayer.tsx
 * claims 'BUILD 1.30 is free of the arm-legibility question'; the frames say it
 * is not"*. Confirmed by looking: at 8× on that frame the near arm is behind
 * the torso and the far arm is a two-pixel nub.
 *
 * THE CAUSE IS GEOMETRIC AND WAS ALWAYS GOING TO HAPPEN. `OFC_ARM_OUT_RAD`
 * swings both arms out along the officer's own LATERAL axis. The лекция's
 * „премини" posture is the one where the driver sees his SIDE PROFILE — and a
 * driver seeing the profile is, by definition, standing on that lateral axis.
 * The arms therefore point straight at his eye and straight away from it, and
 * a foreshortened capsule is a dot: reach × sin(0) = 0.000 m of silhouette,
 * against a torso that hides 0.202 m of it. Zero arms is not a small arm.
 *
 * THE FIX IS A SAGITTAL TILT, NOT A LONGER ARM: both extended arms are also
 * pitched FORWARD (toward the chest) by this angle, so no viewing direction
 * can ever be parallel to them. Composition is qYaw · qLat · qRoll, so the
 * tip's local direction is (cosθ·sinφ, −cosθ·cosφ, −sinθ) with φ =
 * ±OFC_ARM_OUT_RAD — i.e. the tilt spends `sinθ` of the reach on the officer's
 * FORWARD axis (local −Z is his chest direction) and keeps `cosθ` of it
 * lateral.
 *
 * MEASURED at the pinned controller scale (reach 0.596 × height 1.50 =
 * 0.894 m; torso 0.155 × build 1.30 = 0.202 m of silhouette to clear):
 *   • profile-visible arm, θ = 0.00 → 0.894 × sin 0    = 0.000 m — invisible,
 *   • profile-visible arm, θ = 0.44 → 0.894 × sin 0.44 = 0.381 m, i.e. 0.179 m
 *     of clear air BEYOND the torso outline: ≈ 24 px on the audited 2556 px
 *     phone frame at the 27 m the drill grades from, ≈ 16 px at 40 m;
 *   • the cost, in the direction a „fix" must not break: the chest-on halt
 *     wall spans 2 × (0.21 × 1.30 + 0.894 × cos θ × sin 1.47) = 2.325 m at
 *     θ = 0 and 2.156 m at θ = 0.44 — 7.3 % narrower, and that photographed
 *     silhouette is why the angle is 0.44 rad (25°) and not the 45° that would
 *     read the arms best in profile and cost 23 % of the wall.
 *
 * ППЗДвП/ЗДвП чл. 7 is not touched by this: the article's own wording for the
 * permitting posture is „ръце, изпънати настрани ИЛИ СПУСНАТИ" — the signal is
 * carried by which side of him you are on, not by the exact arm angle. A 25°
 * forward tilt renders the same posture legibly; a 0° one renders it not at
 * all, which is the only reading a student can actually get wrong.
 */
export const OFC_ARM_FWD_RAD = 0.44;
/** „Внимание" window before the flip, s — sized to the recorded narrations:
 *  the postures shadow's „ръката му се вдига" lands ≈ t 19 on the flip-30
 *  drills (raise = 30 − 11), and the live drill's shadow crosses at ≈ t 13,
 *  safely before its own raise at 26 − 11 = 15. */
const OFC_RAISE_LEAD_SEC = 11;
const OFC_TURN_RATE = 3.2; // whole-figure yaw damp toward the halted axis, 1/s
const OFC_ARM_RATE = 4.2; // posture damp, 1/s

// R3 #25–28 pedestrian BODY VARIANTS (doc 62 P6 — „better NPC actors where
// the actor IS the lesson"): the CHILD follows the child-cyclist proportion
// precedent (CHILD_CYCLIST_SCALE 0.72, head ratio ×~1.18 — vehicleFleet.ts);
// the ELDER is slightly stooped and carries the WHITE CANE (PE-14's признак —
// the cane IS the recognition cue). Variant body factors are PINNED (no
// per-id jitter) so the cane geometry and the child silhouette read
// identically on every attempt; variant-less pedestrians keep the hashed
// height/build variation byte-identically.
const PED_CHILD_HEIGHT = 0.72; // the child-cyclist scale — ~1.25 m figure
const PED_CHILD_BUILD = 0.8;
/** Absolute head scale: smaller than the adult head, but a BIGGER ratio to
 *  the 0.72 body (0.72 × ~1.19 — the childCyclist headScale recipe). */
const PED_CHILD_HEAD_SCALE = 0.86;
const PED_CHILD_TOP = "#e0562f"; // bright jacket — the small figure must read
const PED_CHILD_LEGS = "#37517d";
const PED_ELDER_HEIGHT = 0.93;
const PED_ELDER_STOOP_RAD = 0.16; // forward pitch of torso + head
const PED_ELDER_TOP = "#9a938a"; // muted overcoat
const PED_ELDER_LEGS = "#4a453f";
// The white cane: a thin white cylinder from the right hand to the tarmac
// ahead, sweeping laterally with the walk phase (the tapping read). Pitch is
// tuned so the tip grazes the ground at the pinned elder height:
// (1.42 − 0.5) × 0.93 ≈ 0.86 m grip height ≈ 1.05 × cos(0.62).
const CANE_LEN_M = 1.05;
const CANE_RADIUS_M = 0.013;
const CANE_PITCH_RAD = 0.62; // forward reach from vertical
const CANE_SWEEP_RAD = 0.14; // lateral tap amplitude (walk-phase driven)
const CANE_HAND_DROP = 0.5; // grip below the shoulder joint (pre-height-scale)
const CANE_HAND_FWD = 0.28; // grip forward of the shoulder (the extended arm)
/** Elder right arm held forward toward the cane grip instead of swinging. */
const PED_ELDER_ARM_FWD_RAD = 0.55;

// L5 hazard ball (doc 68 A5): bright, big enough to read at speed.
const HAZARD_BALL_RADIUS_M = 0.36;
const HAZARD_BOUNCE_HEIGHT_M = 0.45;
const HAZARD_BOUNCE_WAVELENGTH_M = 2.8;

// Cosmetic wheel-steer + turn-signal derivation (visual only — the traffic
// system carries no steer/turn state, so we read it off the smoothed yaw rate).
const YAW_SMOOTH_RATE = 9; // slerp toward the target heading (1/s)
const STEER_FROM_YAWRATE = 0.55; // rad steer per rad/s of yaw rate
const MAX_STEER = 0.5; // visual front-wheel lock (rad)
const STEER_SMOOTH_RATE = 8;
const BLINK_STEER_THRESH = 0.07; // |steer| above this arms a turn signal
const BLINK_PERIOD_S = 0.9; // full cycle
const BLINK_DUTY = 0.55; // fraction "on"

const UP = new Vector3(0, 1, 0);
const AXIS_X = new Vector3(1, 0, 0); // wheel spin axis (GLB wheels are X-axial)
const AXIS_Z = new Vector3(0, 0, 1); // officer lateral arm-raise axis

/**
 * Which turn-signal lamps are armed this frame (ledger L6/L8/L11, founder items
 * 43/44). Exported so the handoff is unit-testable without a renderer.
 *
 * `indicator` is the PUBLISHED command from the traffic system — present and
 * meaningful only on staged actors, which are the only cars a lesson scripts a
 * manoeuvre for. It wins outright: a commanded lamp is a fact about what that
 * driver has announced, and no geometric guess may override or suppress it.
 *
 * `steer` is the old yaw-rate inference, kept as the FALLBACK for cars nobody
 * commands. It stays because an ambient NPC physically turning a corner should
 * still blink — a student reads the traffic around him off exactly these lamps.
 * What it can no longer do is stand in for a commanded signal: a lateral lane
 * change never reaches the arming threshold (the shipped cut-in peaks at 0.0624
 * against 0.07), which is why the founder saw no blinker at all on lesson 43.
 */
export function blinkerSides(
  indicator: VehicleIndicator | undefined,
  steer: number,
): { left: boolean; right: boolean } {
  return {
    left: indicator === "left" || (indicator !== "right" && steer > BLINK_STEER_THRESH),
    right: indicator === "right" || (indicator !== "left" && steer < -BLINK_STEER_THRESH),
  };
}

/** Where one of the live officer's arms is asked to be, in his own joint
 *  angles: `lat` = the sideways raise about local Z, `sag` = the sagittal
 *  pitch about local X (positive = toward his chest). */
export interface OfficerArmTarget {
  lat: number;
  sag: number;
}

/**
 * The JU-18 officer's arm pose, as a target pair (FR-OFC-ARMS).
 *
 * Extracted because the rule is stated TWICE in the frame loop — once when the
 * figure is first sighted (land IN pose, no settle-in at session start) and
 * once as the per-frame damp target — and the sweep161 defect was exactly a
 * rule that has to hold in both places. `out` is a caller-owned record so the
 * hot path keeps its zero-allocation law.
 *
 * `side` follows the limb loop: 0 = left (sign +1), 1 = right (sign −1).
 */
export function officerArmTarget(
  attention: boolean,
  side: number,
  out: OfficerArmTarget,
): void {
  const sign = side === 0 ? 1 : -1;
  // „Внимание": right arm straight up, left dropped, neither one out.
  // Otherwise: both out sideways AND pitched forward, so the posture has a
  // silhouette from every viewing direction (see OFC_ARM_FWD_RAD).
  out.lat = attention ? 0 : sign * OFC_ARM_OUT_RAD;
  out.sag = attention ? (side === 1 ? PED_POSE_ARM_RAISE_RAD : 0) : OFC_ARM_FWD_RAD;
}

/** Shortest-signed angular difference a-b wrapped to (-pi, pi]. */
function wrapPi(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Deterministic 32-bit mix — pedestrian height/build variation per id. */
function hash32(n: number): number {
  let h = (n + 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// ---------------------------------------------------------------------------
// Parked cars — deterministic instanced placement along residential/arterial
// curbs, reusing the district edge polylines + lane-width offset (the same
// curb math the props/sidewalk pass uses). Rendered as the authored GLB kit
// (static per-model instances, civilian models only — ./vehicleFleet). Gated
// on the optional `district` prop being supplied.
// ---------------------------------------------------------------------------
const PARK_CLASSES = new Set([
  "residential",
  "living_street",
  "unclassified",
  "tertiary",
  "secondary",
  "primary",
]);
const PARK_SPACING_M = 6.6;
const PARK_END_MARGIN_M = 11;
/** Parked-car center offset past the travel lanes: middle of the 4.0 m
 * curbside parking band (world PARKING_LANE_WIDTH_M / 2 — keep in sync). */
const PARK_BAND_CENTER_M = 2.0;
const PARK_CAP = 150;

// --- FR-21, the car half: PARK_CLASSES ⊋ world PARKING_LANE_CLASSES ---------
//
// The band this pass centres its bodies in (`PARK_BAND_CENTER_M`) exists only
// on `{primary, secondary, tertiary}` — `world/builders/constants`
// PARKING_LANE_CLASSES. On the other three classes above there is no band, so
// `travelHalf + 2.0` is 2 m PAST the kerb: the body stands in the middle of the
// 3.5 m pavement, at road level, sunk 0.12 m into the footway (the transform
// below plants every body at y = 0 regardless of the surface under it).
//
// Censused over the 100 committed districts: **2605 of 3799 bodies — 68.6% —
// stand fully on the footway, on 83 of the 100 districts** (2140 `residential`,
// 465 `unclassified`). His sentence, three lessons running: „he goes trough a
// car which is standing on the sidewalk", and the one that costs a drill: „I
// cant see the car coming on the right because of the cars that have stopped on
// the side walk".
//
// A map fixes it by declaring what its own street really carries, and this pass
// honours the declaration (`world/builders/network.edgeParkingBand`):
//   • `parkingBand: true`  — the world draws the 4 m band, the kerb moves out
//     from under the row and the SAME bodies land on asphalt. No body moves:
//     `travelHalf + 2.0` IS the band's centre line. Traces are untouched.
//   • `parkingBand: false` — this street has no kerbside parking at all, so the
//     pass places nothing (an industrial frontage, a wall-to-wall canyon).
//   • absent — today's behaviour, byte for byte.
//
// Why not a global rule. Both cheaper fixes were measured and rejected: seating
// the bodies INSIDE the carriageway (flank against the kerb) puts 21 committed
// traces inside a body footprint — three of them `shadow-correct`, i.e. the
// demonstrated-correct drive would drive through a parked car; and adding
// `residential` to PARKING_LANE_CLASSES moves every kerb, pavement, junction
// mouth and baked building footprint on 83 districts at once.
//
// The residual is a tracked, shrinking budget: `__tests__/parked-on-footway`.

/** A district edge that has opted out of the procedural curb row entirely.
 *  Exported because a walk line can only be „inside the parked row" on a street
 *  that HAS one: `__tests__/ped-through-parked` asks this before it compares a
 *  pavement offset against `travelHalf + PARK_BAND_CENTER_M`, so the witness and
 *  the pass that seats the bodies cannot drift apart. */
export function parkingOptedOut(edge: DistrictEdge): boolean {
  return (edge as { parkingBand?: unknown }).parkingBand === false;
}

/**
 * WHICH KERB THE ROW STANDS ON (doc 87 B50/B53/B54 — the sign error).
 *
 * MEASURED, not argued. Until this tag existed the walk below took the
 * right-hand normal (`nx = dy; ny = -dx`) and nothing else, so EVERY body in
 * the world stood on the right kerb. On the seven-district PE family that is
 * literally one number: all 16 bodies of the six bayed districts sat at
 * **x = +10.13**, six streets deep — while `network.ribbonCrossSection`
 * mirrors the parking band about the centreline, i.e. the bay is DRAWN on both
 * sides and FILLED on one. The left band is tarmac nobody ever parks on, in
 * every district in the product, and it is a large part of why the founder
 * read six consecutive crossing lessons as one street.
 *
 * The tag mirrors `network.BareVergeSide` exactly — same vocabulary, same
 * per-SIDE-of-one-carriageway meaning, same "absent ⇒ unchanged" contract.
 * ABSENT ⇒ `"right"`, i.e. every one of the 90 committed districts keeps
 * byte-identical placement and every pinned census still holds; a map that
 * wants the other kerb, or both, says so.
 *
 * `parkingBand: false` still wins outright (`parkingOptedOut` above): a street
 * with no lawful band parks nobody on either side.
 */
export type ParkedSide = "left" | "right" | "both";

/** Read the per-edge parked-row side. Absent/garbage ⇒ `"right"` (today). */
export function parkedSideOf(edge: DistrictEdge): ParkedSide {
  const v = (edge as { parkingSide?: unknown }).parkingSide;
  return v === "left" || v === "both" ? v : "right";
}

/** The normal multipliers `parkedSideOf` resolves to. +1 = right of travel. */
const SIDE_SIGNS: Readonly<Record<ParkedSide, readonly (1 | -1)[]>> = {
  right: [1],
  left: [-1],
  both: [1, -1],
};

/**
 * THE SAME THREE CARS, IN THE SAME ORDER, ON STREET AFTER STREET
 * (doc 87 B50/B53/B54 — measured from the driving seat, not reasoned about).
 *
 * The placement hash below is `(e * 73856093) ^ (slot * 19349663)`: the EDGE
 * INDEX inside the district and the SLOT INDEX along it. Nothing in it names
 * the district. So two maps whose parked segment happens to be the same edge
 * index — which, on a family of generated streets, is *every* map — get the
 * same hash, therefore the same `assignCivilianModel` pick and the same paint
 * seed, in the same order.
 *
 * Measured on the shipped PE family before this salt existed, right kerb:
 *
 *   pe-cane   m=1 s=654 | m=1 s=35 | m=4 s=133
 *   pe-bus    m=1 s=654 | m=1 s=35 | m=4 s=133
 *   pe-child  m=1 s=654 | m=1 s=35
 *
 * — and the left kerb was `m=3 s=398 | m=4 s=421` on pe-dart, pe-slow AND
 * pe-bus. Three consecutive lessons, a red car then a white one then a dark
 * one, at the same kerb, in the same order. Photographed:
 * `base__28-pe-cane__y15.png` beside `base__29-pe-bus__y15.png`.
 *
 * THE SALT IS ON THE APPEARANCE ONLY, AND THAT IS THE WHOLE POINT. `h` still
 * decides the 1-in-5 gap skip and therefore WHERE every body stands, so every
 * committed district keeps byte-identical coordinates, count, yaw and every
 * pinned census; only which car is standing there changes.
 * `__tests__/parked-appearance.test.ts` asserts exactly that split — over all
 * 90 shipped districts, by running the pass twice with the salt present and
 * absent — rather than asking anyone to trust this comment.
 */
function districtParkedSalt(district: TrafficDistrict): number {
  const id = (district as { meta?: { district?: unknown } }).meta?.district;
  if (typeof id !== "string" || id.length === 0) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Avalanche the placement hash with the district salt — appearance only. */
function parkedLookHash(placementHash: number, salt: number): number {
  let x = (placementHash ^ salt) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * WHAT KIND OF VEHICLE STANDS AT THIS KERB (doc 87 B50/B53/B54).
 *
 * The salt above makes the row a DIFFERENT row on every street. It cannot make
 * it a different KIND of row: `assignCivilianModel` draws from one pool with
 * one set of weights, so a freight collector outside a depot gate and a
 * между-блоково courtyard both get the same mix of hatchbacks and saloons, and
 * from the driving seat a kerb of hatchbacks looks like a kerb of hatchbacks
 * wherever it stands.
 *
 * A mix is an ALLOWED SET, not new weights, and it is chosen off the same look
 * hash — so no body moves, none is added or removed, and a street that names no
 * mix (every district in the product except the PE family) is byte-identical.
 * The names are the ones a Bulgarian street explains itself with.
 */
const PARKED_MIXES: Readonly<Record<string, readonly string[]>> = {
  /**
   * Товарна улица пред портал на база — панелен бус, пикап, боксав джип.
   *
   * ORDER IS NOT DECORATION HERE. The pick is `look % set.length`, so the
   * position a model occupies decides which slot gets it — and the slot that
   * matters is the one nearest the seat. Measured on pe-bus at three
   * orderings: `[kargo_v, tarpan, kolos]` seated a 4x4 first, and
   * `[kargo_v, tarpan, kolos, kargo_v]` seated three identical vans, which is
   * the very defect this whole axis is about. This ordering puts the PANEL VAN
   * at 18 m — the body whose roofline you cannot mistake for a hatchback — and
   * the pickups behind it.
   */
  freight: ["kolos", "tarpan", "kargo_v"],
  /** Междублоково / еднопосочна градска — малки градски коли. */
  compact: ["vela_h3", "pino"],
  /** Стара улица — комби и седани от предишното поколение, пикап. */
  veteran: ["dret_90", "corva_sw", "tarpan"],
};

/** FLEET indices per mix, resolved once (FLEET is a frozen const tuple). */
const PARKED_MIX_INDICES: Readonly<Record<string, readonly number[]>> = Object.fromEntries(
  Object.entries(PARKED_MIXES).map(([k, names]) => [
    k,
    names.map((n) => (FLEET as readonly string[]).indexOf(n)).filter((i) => i >= 0),
  ]),
);

/** Read the per-edge kerb mix. Absent/unknown ⇒ the unbiased parked pool. */
function parkedMixOf(edge: DistrictEdge): readonly number[] | null {
  const v = (edge as { parkingMix?: unknown }).parkingMix;
  if (typeof v !== "string") return null;
  const idx = PARKED_MIX_INDICES[v];
  return idx && idx.length > 0 ? idx : null;
}

/** `District.zones` kinds that forbid leaving a car at the kerb (ЗДвП чл. 98:
 *  В27 „забранено е спирането" forbids stopping, and therefore parking too).
 *  A body inside one of these spans is a sign the world contradicts. */
const PARK_BAN_ZONE_KINDS = new Set(["noStopping", "noParking"]);
/** Stable default for the optional clear-zone prop (memo identity). */
const EMPTY_CLEAR_ZONES: readonly ParkedClearZoneLike[] = [];

// --- ЗДвП чл. 98 legality of the curb pass (doc 86 T6 / L9 / D10) -----------
//
// The curb walk used to measure from the RAW edge polyline: it started
// slotting bodies PARK_END_MARGIN_M = 11 m from the node while the road
// ribbon is trimmed at the junction mouth `nodeOpenRadiusM` (up to 27.125 m
// on an arterial X). Slots at arc 11 / 17.6 / 24.2 therefore landed on the
// junction APRON — no carriageway drawn under them, sitting straight across
// the give-way sightline every junction lesson grades, and modelling parking
// INSIDE an intersection as ordinary street scenery. Census on the seven
// junction districts: 45 such bodies (doc 86 §2 T6 says 58 because it applied
// the arterial 27.125 m mouth to all seven; three of them are residential-
// cornered and trim at 17.125 m).
//
// The two frames are now the SAME frame. The lawful band on an edge starts at
// the junction mouth `nodeOpenRadiusM` opens — the SAME call analyzeNetwork
// trims ribbons with and buildLaneGraph stops NPCs at — minus чл. 98's two
// no-parking bands:
//   • within 5 m of a junction  (ЗДвП чл. 98 ал. 1 т. 2) — the same 5 m the
//     world builder already insets the painted parking band by
//     (world/builders/constants PARKING_LANE_END_INSET_M), so the bodies now
//     stand exactly where the paint says they may. Tested twice: along the
//     edge's own arclength from each of its two end nodes, AND radially
//     against every degree >= 3 node in the district — чл. 98 measures from
//     the corner of the intersecting roads, so a body on an edge that merely
//     PASSES a junction (real-OSM district-v1 has three such nodes) is just
//     as illegal as one on an arm of it;
//   • on a pedestrian crossing or within 5 m of one (чл. 98 ал. 1 т. 1) —
//     applied SYMMETRICALLY, because a two-way street parks cars facing both
//     ways and the occlusion harm the rule exists to prevent is symmetric.
// Both bands are widened by the body's own half-length so a FOOTPRINT, not a
// centre, stays out of them.
//
// A third rule closes the case the first two cannot see: a body must not sit
// on ANY edge's travel carriageway, not merely off its own. The curb offset is
// computed per edge, so where two carriageways run close (mw-exit-v1's exit
// ramp leaves the 3-lane motorway at the gore and passes straight under the
// motorway's own curb band) the pass seated bodies in the neighbouring road.
// Measured: `content/traces/sc-merge-motorway-exit/shadow-correct.trace.json`
// — the DEMONSTRATED-CORRECT drive — put 15 samples inside the footprint of
// the body at (14.19, 850.60), driving the ghost through a parked car.
//
// All three run AFTER the deterministic hash walk (the same law the
// clearZones filter follows): slot indices, hashes, models and every
// surviving body's coordinates are byte-identical. Total across the 90
// committed districts: 4011 bodies before, 3723 after.
//
// ONE honest exception to "it can only remove": PARK_CAP truncates the walk
// at 150 bodies, so on a district that hits the cap a removal earlier in the
// walk lets a later, LAWFUL slot through that the cap used to cut off. Four
// districts are affected — `poligon-v1` (150 -> 134) and `sig-wave-v1`
// (150 -> 119) now fall under the cap; `d2-v1` and `district-v1` still cap at
// 150 with 33 and 48 of those bodies newly reached. The cap is arbitrary
// truncation, so trading a body inside a junction for a body further down a
// legal curb is the right trade; it is recorded here because it is the only
// place the surviving SET is not a strict subset.

/** Worst-case parked-body half-length of the civilian kit, m. */
const PARKED_HALF_LEN_M = 2.25;
/** Parked-body half-width, m (world/builders/constants sizes the parking band
 *  against this same 0.95). */
const PARKED_HALF_W_M = 0.95;
/** ЗДвП чл. 98 no-parking band before a junction / a pedestrian crossing, m.
 *  Same value as world/builders/constants PARKING_LANE_END_INSET_M. */
const PARK_LEGAL_CLEAR_M = 5;
/** Half the zebra's extent along the road (world ZEBRA_LENGTH_M / 2), m. */
const ZEBRA_HALF_LEN_M = 3;
/** A crossing's own footprint + чл. 98's 5 m + the body half-length. */
export const PARK_CROSSING_CLEAR_M =
  ZEBRA_HALF_LEN_M + PARK_LEGAL_CLEAR_M + PARKED_HALF_LEN_M;
/** A junction mouth's чл. 98 band + the body half-length. */
export const PARK_JUNCTION_CLEAR_M = PARK_LEGAL_CLEAR_M + PARKED_HALF_LEN_M;

/** Arclength of `p` projected onto a polyline, plus its perpendicular miss. */
function projectArc(geo: readonly number[][], px: number, py: number): {
  s: number;
  dist: number;
} {
  let bestS = 0;
  let bestD2 = Infinity;
  let arc = 0;
  for (let i = 0; i < geo.length - 1; i++) {
    const ax = geo[i][0];
    const ay = geo[i][1];
    const bx = geo[i + 1][0] - ax;
    const by = geo[i + 1][1] - ay;
    const len2 = bx * bx + by * by;
    let t = len2 > 0 ? ((px - ax) * bx + (py - ay) * by) / len2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + bx * t;
    const qy = ay + by * t;
    const d2 = (px - qx) * (px - qx) + (py - qy) * (py - qy);
    if (d2 < bestD2) {
      bestD2 = d2;
      bestS = arc + Math.sqrt(len2) * t;
    }
    arc += Math.sqrt(len2);
  }
  return { s: bestS, dist: Math.sqrt(bestD2) };
}

/**
 * Per-node drawn junction open radius — `nodeOpenRadiusM` over the edges that
 * actually touch each node. The SAME call `analyzeNetwork` trims ribbons with
 * and `buildLaneGraph` stops NPCs at, so decoration, asphalt and traffic all
 * read one junction mouth.
 */
function junctionRadiiOf(district: TrafficDistrict): {
  byNode: Map<string, number>;
  /** Degree >= 3 nodes only, with their чл. 98 keep-out circle. */
  keepOut: Array<{ x: number; y: number; r: number }>;
} {
  const touching = new Map<string, DistrictEdge[]>();
  for (const edge of district.roads?.edges ?? []) {
    for (const id of [edge.from, edge.to]) {
      let bucket = touching.get(id);
      if (!bucket) touching.set(id, (bucket = []));
      bucket.push(edge);
    }
  }
  const byNode = new Map<string, number>();
  const pos = new Map((district.roads?.nodes ?? []).map((n) => [n.id, n]));
  const keepOut: Array<{ x: number; y: number; r: number }> = [];
  for (const [id, touched] of touching) {
    const r = nodeOpenRadiusM(touched, touched.length);
    byNode.set(id, r);
    const p = pos.get(id);
    if (touched.length >= 3 && p) {
      keepOut.push({ x: p.x, y: p.y, r: r + PARK_JUNCTION_CLEAR_M });
    }
  }
  return { byNode, keepOut };
}

/**
 * True when a body centred at (px, py) would overlap the DRIVEN carriageway of
 * any edge — its own included. Travel half-width only (`edgeTravelHalfWidth`):
 * the curbside parking band is exactly where a parked car belongs, so a body
 * inside its own band must stay.
 */
function onAnyCarriageway(
  edges: readonly DistrictEdge[],
  px: number,
  py: number,
): boolean {
  for (const other of edges) {
    const geo = other.geometry;
    if (!geo || geo.length < 2) continue;
    const limit = edgeTravelHalfWidth(other) + PARKED_HALF_W_M;
    // Cheap reject on the polyline's bounding box before the segment walk.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of geo) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
    if (px < minX - limit || px > maxX + limit || py < minY - limit || py > maxY + limit) {
      continue;
    }
    if (projectArc(geo, px, py).dist < limit) return true;
  }
  return false;
}

export interface ParkedCar {
  x: number;
  y: number;
  yaw: number;
  /** Fleet model index (parked pool only — no police/minibus/hero SUV). */
  model: number;
  /** Stable placement hash — picks the paint palette color. */
  seed: number;
}

/** A circle no parked decoration body may center inside (structural twin of
 *  components/sim scenarioSceneryProps.ParkedClearZone — the zones are
 *  CONTENT, authored per template there; this layer only honors them). */
export interface ParkedClearZoneLike {
  x: number;
  y: number;
  radiusM: number;
}

/**
 * The deterministic curb pass.
 *
 * Placement is a pure hash walk along each parkable edge — unchanged since
 * the pass shipped. Everything else is a FILTER applied after the walk, so
 * slot indices, model picks and every surviving body's coordinates are
 * byte-identical to the unfiltered pass; a filter can only remove:
 *
 *  1. the ЗДвП чл. 98 legality bands (doc 86 T6/L9/D10 — see the block
 *     comment above): every junction mouth, every authored pedestrian
 *     crossing, and every other edge's travel carriageway;
 *  2. `clearZones` — the SCENARIO-side corridors the district cannot know
 *     about (scene/scenarioSceneryProps.parkedClearZonesFor derives one per
 *     staged pedestrian's authored walk line). `[]` = today's placement.
 */
export function computeParkedCars(
  district: TrafficDistrict,
  laneWidthM: number,
  clearZones: readonly ParkedClearZoneLike[] = [],
): ParkedCar[] {
  const out: ParkedCar[] = [];
  const edges = district.roads?.edges ?? [];
  const junctionRadii = junctionRadiiOf(district);
  // Appearance only — see districtParkedSalt. Placement is deliberately not
  // salted, so no committed body moves.
  const salt = districtParkedSalt(district);
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    if (edge.roundabout) continue;
    if (!PARK_CLASSES.has(edge.class)) continue;
    // ── NOBODY PARKS ON A МАГИСТРАЛА, and it is the law this product bills
    //    from: ЗДвП чл. 58, т. 2–3 forbids stopping and parking on a motorway
    //    outside the emergency lane in a breakdown, and `catalog.ts`'s own
    //    аварийна-лента row prices it at three months and 1000 лв.
    //
    //    mw-exit-v1 types its four 140 км/ч carriageways `primary` while
    //    carrying `motorway: true`, and `primary` is in PARK_CLASSES — so this
    //    pass laid a continuous kerbside rank of parked cars along a live
    //    motorway. `.audit-frames/w10-2/frames/sc-merge-motorway-exit__
    //    mobile-right/05-stopped.png` shows the row beside a chip reading
    //    «140 · РЕЖИМ Нормален ≤150». `isMotorwayEdge` (world/builders/network)
    //    carries the three-district table and why the flag is asked instead of
    //    the class. No body on any non-motorway district moves.
    if (isMotorwayEdge(edge)) continue;
    if (parkingOptedOut(edge)) continue; // FR-21: this street parks nobody
    const geo = edge.geometry;
    if (!geo || geo.length < 2) continue;

    // Total polyline length.
    let total = 0;
    for (let s = 0; s < geo.length - 1; s++) {
      total += Math.hypot(geo[s + 1][0] - geo[s][0], geo[s + 1][1] - geo[s][1]);
    }
    if (total < 2 * PARK_END_MARGIN_M + PARK_SPACING_M) continue;

    // The junction mouths this edge runs between (the SAME nodeOpenRadiusM
    // the ribbon is trimmed at and NPCs stop at), pulled in by чл. 98's 5 m
    // junction band and the body's own half-length. Deliberately the
    // UNCLAMPED radius, not analyzeNetwork's `JUNCTION_TRIM_MAX_FRACTION`
    // clamp: on a short stub the ribbon is drawn further in than the mouth,
    // but чл. 98 measures from the corner of the intersecting roads, not from
    // wherever the asphalt happened to be cut.
    const lawfulFrom = (junctionRadii.byNode.get(edge.from) ?? 0) + PARK_JUNCTION_CLEAR_M;
    const lawfulTo = total - (junctionRadii.byNode.get(edge.to) ?? 0) - PARK_JUNCTION_CLEAR_M;

    // Arclengths of this edge's authored pedestrian crossings (the 25 m miss
    // guard is markings.ts's own data-glitch guard, same frame, same rule).
    const crossingArcs: number[] = [];
    for (const crossing of district.crossings ?? []) {
      if (crossing.edgeId !== edge.id) continue;
      const proj = projectArc(geo, crossing.x, crossing.y);
      if (proj.dist > 25) continue;
      crossingArcs.push(proj.s);
    }

    // Arclength spans this edge declares as a STOPPING ban (ЗДвП чл. 98 — the
    // same article the junction and crossing bands above come from, here
    // posted on a В27/В28 face instead of derived from geometry). A row of
    // parked bodies standing under a „no stopping" post is a falsehood a
    // student can see from the seat, and it is the kind the founder catches
    // first. Widened by the body's own half-length, so a FOOTPRINT stays out.
    const banSpans: Array<[number, number]> = [];
    for (const zone of district.zones ?? []) {
      if (zone.edgeId !== edge.id) continue;
      if (!PARK_BAN_ZONE_KINDS.has(zone.kind)) continue;
      banSpans.push([zone.fromM - PARKED_HALF_LEN_M, zone.toM + PARKED_HALF_LEN_M]);
    }

    const offset = laneWidthM * Math.max(1, edge.lanes) * 0.5 + PARK_BAND_CENTER_M;
    // The kerb(s) this street parks on. The RIGHT side is walked first and at
    // phase 0, so a `right` street (and every district written before the tag,
    // which resolves to `right`) emits the same bodies in the same order with
    // the same coordinates, models and seeds as the pre-tag pass.
    const sides = SIDE_SIGNS[parkedSideOf(edge)];
    const mix = parkedMixOf(edge);
    const stop = total - PARK_END_MARGIN_M;
    for (const side of sides) {
      // A HALF-SLOT PHASE on the left kerb, and it is not a nicety. Sharing the
      // station list put a left car exactly abreast of a right car at every
      // station: measured on the first build of this tag, `pe-clear` came out
      // as four exact facing PAIRS (R11/L11, R18/L18, R24/L24, R31/L31) and
      // `pe-bus` as two — a corridor of gates, which is a fresh copy of the
      // "one row seen twice" this tag exists to end. Phased, the two rows
      // interleave the way a real street's kerbs do.
      const phase = side === 1 ? 0 : PARK_SPACING_M / 2;
      let nextAt = PARK_END_MARGIN_M + phase;
      let arc = 0;
      let slot = 0;
      for (let s = 0; s < geo.length - 1 && nextAt <= stop; s++) {
        const ax = geo[s][0];
        const ay = geo[s][1];
        let dx = geo[s + 1][0] - ax;
        let dy = geo[s + 1][1] - ay;
        const segLen = Math.hypot(dx, dy);
        if (segLen < 1e-3) continue;
        dx /= segLen;
        dy /= segLen;
        const nx = dy; // right-hand normal of the travel direction
        const ny = -dx;
        while (nextAt < arc + segLen && nextAt <= stop) {
          const t = nextAt - arc;
          // Deterministic hash: skip ~1 in 5 slots for natural gaps + pick
          // model. The left kerb salts it, so its gaps and models are not the
          // right row's read back at an offset.
          const h0 = ((e * 73856093) ^ (slot * 19349663)) >>> 0;
          const h = side === 1 ? h0 : (h0 ^ 0x9e3779b9) >>> 0;
          const lawful =
            nextAt >= lawfulFrom &&
            nextAt <= lawfulTo &&
            !crossingArcs.some((cs) => Math.abs(nextAt - cs) < PARK_CROSSING_CLEAR_M) &&
            !banSpans.some(([a, b]) => nextAt >= a && nextAt <= b);
          if (lawful && h % 5 !== 0) {
            const px = ax + dx * t + nx * side * offset;
            const py = ay + dy * t + ny * side * offset;
            if (
              !junctionRadii.keepOut.some((j) => Math.hypot(px - j.x, py - j.y) < j.r) &&
              !onAnyCarriageway(edges, px, py) &&
              !clearZones.some((z) => Math.hypot(px - z.x, py - z.y) < z.radiusM)
            ) {
              // A car at the LEFT kerb of a two-way street is parked against
              // the oncoming lane's direction of travel, i.e. nose the other
              // way. On a one-way street both kerbs face the one direction.
              const yaw = Math.atan2(dx, -dy);
              // WHICH car stands here — salted with the district's own name so
              // two maps that share an edge index do not share a row. `h`
              // (position, gaps, count) is untouched: see districtParkedSalt.
              const look = parkedLookHash(h, salt);
              out.push({
                x: px,
                y: py,
                yaw: side === 1 || edge.oneway ? yaw : yaw + Math.PI,
                model: mix ? mix[look % mix.length] : assignCivilianModel(look),
                seed: look,
              });
              if (out.length >= PARK_CAP) return out;
            }
          }
          nextAt += PARK_SPACING_M;
          slot++;
        }
        arc += segLen;
      }
    }
  }
  return out;
}

/** Soft radial-gradient decal for the fake ground shadow (code-only, no asset). */
function makeBlobTexture(): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 1, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.55, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  return new CanvasTexture(c);
}

// ---------------------------------------------------------------------------
// B42 / ledger L4 — the gesture bubble above the регулировчик's head.
//
// Founder item 20, twice: „each position the traffic officers shows on top of
// his head some bubble must appear stating what exactly he is pointing, who is
// he letting go, whos turn its to pass." A world-anchored caption, not a HUD
// card: it belongs ON the thing he is being asked to read, and the register's
// other rows show what happens to DOM overlays here — they land on top of each
// other. This is a billboarded plane painted from a canvas, so it costs one
// draw and obeys occlusion. What it does NOT do is „cannot collide with any HUD
// layer", which this comment used to claim: a world plane and a screen-space
// HUD share the same pixels, and sweep161 photographed the card's surviving
// bottom lines lying across the „МЕНЮ" button. See `bubbleWhollyVisible`.
//
// Sized to stay LEGIBLE, which is the whole point of the ask: at
// BUBBLE_REF_DIST_M and closer it is its natural size; beyond that it grows
// with distance up to BUBBLE_MAX_SCALE so its apparent size stays constant —
// the student can read the posture's meaning from the approach, at the distance
// where he still has time to act on it, which is exactly where
// `sc-sig-controller-postures` grades him.
// ---------------------------------------------------------------------------
export const BUBBLE_W_M = 3.6;
/**
 * DELIBERATELY UNCHANGED when the sixth line landed (B41, 2026-08-10). The
 * card gained `priorityBg` and the obvious move was to grow it — 540 → 576 px
 * of texture, 1.9 → 2.025 m of plane. It was tried, rendered and REJECTED off
 * the frame: the card rides `BUBBLE_GAP_M` above a head that this same change
 * raised by 0.45 m, and its top leaves the windscreen at close range. With the
 * taller card the clip started at ≈ 12.9 m instead of ≈ 10.9 m (eye 1.20 m,
 * hFOV-locked vFOV, 1264×620), and `b41/near/B41near-step06` — 7.8 m out —
 * showed a card with its headline cut off. The six lines fit the 540 px card
 * as it is: the old rhythm left ~60 px of dead space below the law line, which
 * is exactly where the sixth line went. Keeping the plane at its photographed
 * size costs nothing and gives back 2 m of approach.
 */
export const BUBBLE_H_M = 1.9;
export const BUBBLE_TEX_W = 1024;
export const BUBBLE_TEX_H = 540;
/** Bubble base sits this far above the figure's head. */
export const BUBBLE_GAP_M = 0.42;
/**
 * Distance at which the bubble is drawn at 1:1 world size, m — i.e. the
 * apparent size the whole band is pinned to.
 *
 * FR-OFC-CARD (sweep161, `sc-sig-controller-live/mobile-right/04-t012s.png`):
 * *„only the headline word resolves during the approach; the five body lines
 * that carry the actual rule are a low-resolution texture that blurs to
 * unreadable mush even at 600 % zoom … they only become readable once the car
 * is nearly at the stop line — after the stop/go choice has been made."*
 *
 * MEASURED on `sc-signal-controller/mobile-right/04-t053s.png` (2556 × 1179):
 * the card spans ≈ 383 device px, so a 46 px body line in a 540 px texture
 * lands at 46/540 × 383 × (1.9/3.6) ≈ 17 px of em, ≈ 12 px of Cyrillic cap
 * height, against a 116 px headline at ≈ 30 px of cap height — which is
 * exactly the split the auditor describes, headline crisp and body mush.
 *
 * The lever is the REFERENCE DISTANCE, not the type: `bubbleLine` already
 * shrinks-to-fit at BUBBLE_MIN_FONT_SCALE, so growing the authored point sizes
 * mostly buys shrink (the longest line, „Предимството е ТВОЕ — дори на
 * червено", is already within ~12 % of the 936 px ink box). Pinning the
 * apparent size to 11.5 m instead of 16 m makes every glyph 16/11.5 = 1.39×
 * bigger at EVERY range in the band: ≈ 17 px of cap height, across the floor.
 * BUBBLE_MAX_SCALE moves with it so the band still runs to 11.5 × 4.75 ≈ 54.6 m
 * (it was 16 × 3.4 = 54.4 m) — the far end is unchanged, only the size is.
 *
 * What this costs, stated in both directions:
 *  - the plane is a bigger world object (17.1 m wide at the cap, was 12.2 m).
 *    Nobody but the student ever sees it, and he sees it at a fixed 17.4°;
 *  - a taller card reaches higher above a fixed head, so the range at which it
 *    stops fitting the windscreen moves out from ≈ 11.2 m to ≈ 11.7 m on the
 *    audited phone aspect. That is half a metre of the very end of the
 *    approach, and the лекция's own stop line is SIGNAL_SETBACK_M = 17.5 m
 *    back — so the card is whole everywhere the drill actually grades the
 *    read, which `officer-and-caption-legibility.test.ts` pins.
 */
export const BUBBLE_REF_DIST_M = 11.5;
export const BUBBLE_MAX_SCALE = 4.75;
/**
 * World scale of the gesture card at `eyeD` metres from the camera.
 *
 * Exported because it IS the legibility law of the caption, and FR-OFC-CARD's
 * far half is a finding about this one line.
 *
 * A LOWER FLOOR WAS TRIED AND REJECTED, and the arithmetic is recorded here so
 * the next reader does not try it again. The obvious answer to the near half of
 * the same finding — the card growing into the HUD — is to let it shrink below
 * the reference distance too. It cannot work: the officer's HEAD climbs the
 * frame as the driver closes, and it is the head, not the card, that dominates.
 * The card's top sits at (2.40 head + 0.42 gap + 1.90·s) m against an eye at
 * 1.20 m, so staying inside the audited phone's 16.9° vertical half-FOV needs
 * s ≤ (0.3038·d − 1.62)/1.90: that is s ≤ 0.75 at 10 m, s ≤ 0.43 at 8 m and
 * s ≤ 0.11 at 6 m. A 0.11 card is 0.21 m of plane — the type is gone long
 * before the plane fits. No monotone floor satisfies it, and the honest rule is
 * the one `bubbleWhollyVisible` states instead.
 */
export function bubbleScale(eyeD: number): number {
  return Math.min(BUBBLE_MAX_SCALE, Math.max(1, eyeD / BUBBLE_REF_DIST_M));
}

/** NDC half-extent a corner may reach and still count as on screen. Two values
 *  = hysteresis, the same device the ANFAS thresholds above use: a caption that
 *  blinks on and off as the driver steers is its own defect. */
const BUBBLE_ON_SCREEN_ENTER = 0.97;
const BUBBLE_ON_SCREEN_EXIT = 1.03;

/** The minimum a projection needs from a camera. Structural, so the test can
 *  hand this a real `PerspectiveCamera` and the frame loop its live one. */
export interface BubbleCamera {
  matrixWorld: { elements: ArrayLike<number> };
  matrixWorldInverse: Matrix4;
  projectionMatrix: Matrix4;
}

/**
 * Is the WHOLE card on screen? (FR-OFC-CARD, near half.)
 *
 * A clipped caption is not a caption. sweep161's `04-t076s.png` shows what the
 * half of one does instead: its surviving bottom lines land on the HUD's
 * top-left corner and make the „МЕНЮ" button illegible. Below ~10 m no scale
 * law can keep the card whole — the officer's own head climbs the frame as the
 * driver closes, and shrinking the card fast enough to compensate would make it
 * unreadable before it went off the edge (the arithmetic is under
 * `bubbleScale`) — so the honest rule is the one this function states: show it
 * while it can be read whole, and otherwise not at all. It never hides a card
 * that fits, so no readable caption is lost, and the range where it does hide
 * (≈ 11.7 m and in, on the audited phone) is INSIDE the лекция's own stop line
 * at SIGNAL_SETBACK_M = 17.5 m — i.e. past the point where the posture read is
 * still a decision. What it removes is the half-card the frame photographed
 * lying across the „МЕНЮ" button.
 *
 * The card is billboarded, so its plane axes ARE the camera's right/up; the
 * four corners come off `matrixWorld` without a quaternion or an allocation.
 * `tmp` is caller-owned (the frame-loop zero-allocation law).
 */
export function bubbleWhollyVisible(
  camera: BubbleCamera,
  cx: number,
  cy: number,
  cz: number,
  halfW: number,
  halfH: number,
  wasVisible: boolean,
  tmp: Vector3,
): boolean {
  const e = camera.matrixWorld.elements;
  const rx = e[0] * halfW;
  const ry = e[1] * halfW;
  const rz = e[2] * halfW;
  const ux = e[4] * halfH;
  const uy = e[5] * halfH;
  const uz = e[6] * halfH;
  const m = wasVisible ? BUBBLE_ON_SCREEN_EXIT : BUBBLE_ON_SCREEN_ENTER;
  for (let k = 0; k < 4; k++) {
    const sr = k & 1 ? 1 : -1;
    const su = k & 2 ? 1 : -1;
    tmp.set(cx + sr * rx + su * ux, cy + sr * ry + su * uy, cz + sr * rz + su * uz);
    tmp.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
    // z outside (-1, 1) is behind the eye or past the far plane; either way the
    // projected x/y are not a position on this screen.
    if (tmp.z <= -1 || tmp.z >= 1) return false;
    if (tmp.x < -m || tmp.x > m || tmp.y < -m || tmp.y > m) return false;
  }
  return true;
}

/** |cos| between the officer's facing and the direction to the camera above
 *  which the student is seeing him ANFAS (chest or back). Two thresholds =
 *  hysteresis, so the caption cannot flicker while he turns at a phase flip.
 *  0.5 is 60° either side of head-on — the band in which a human silhouette
 *  genuinely stops reading as a profile. */
const BUBBLE_ANFAS_ENTER = 0.55;
const BUBBLE_ANFAS_EXIT = 0.45;

/** Left+right ink margin inside the card, px of the 1024 px canvas. The
 *  border stroke is 7 px and the corner radius 34, so 44 keeps a centred line
 *  clear of the rounded accent frame rather than merely inside the bitmap. */
export const BUBBLE_PAD_X = 44;

/**
 * Authored type size of each card line, px of the BUBBLE_TEX_H-tall canvas.
 *
 * Exported and read by the painter rather than written inline, because the
 * FR-OFC-CARD measurement is stated in these numbers: the finding is that the
 * headline resolves on the approach and the five body lines do not, and a
 * legibility gate that quoted 46 from its own copy of the layout would keep
 * passing after someone edited the painter. One source, both readers.
 */
export const BUBBLE_LINE_PX = {
  headline: 116,
  pose: 44,
  go: 46,
  stop: 46,
  priority: 44,
  law: 38,
} as const;

/**
 * Paint one centred line, SHRUNK TO FIT (doc 87 B41).
 *
 * Every line here was a bare `fillText` — centred, no wrap, no measurement —
 * so a string longer than the card simply ran off both sides. It was not
 * hypothetical: on 2026-08-09 the law line grew from „ППЗДвП чл. 29, ал. 3;
 * ЗДвП чл. 7" (32 chars) to „ППЗДвП сигнали на регулировчика; ЗДвП чл. 7"
 * (43) when the article numbers came off the two acts the corpus does not
 * hold, and nothing re-rendered the bubble to see it. `controller-bubble.test`
 * guards the STRINGS with a character budget and says in its own comment that
 * the honest fix is a `measureText` clamp in the painter. This is it.
 *
 * Shrink, never ellipsize: this is the one place in the product where a law
 * reference is read FROM THE DRIVING SEAT (ADR-002 — retrieved and cited,
 * never recalled), and „ППЗДвП сигнали на регул…" is a worse failure than a
 * couple of points of type. The floor is 0.62 of the authored size, below
 * which the line would stop being legible at BUBBLE_REF_DIST_M and the copy
 * — not the painter — is what needs fixing; at the floor it clamps with
 * canvas' own `maxWidth` squeeze so the ink can never leave the card.
 */
export const BUBBLE_MIN_FONT_SCALE = 0.62;

function bubbleLine(
  g: CanvasRenderingContext2D,
  text: string,
  weight: number,
  sizePx: number,
  y: number,
  W: number,
): void {
  const FONT = '"Segoe UI", system-ui, "Noto Sans", sans-serif';
  const maxW = W - 2 * BUBBLE_PAD_X;
  g.font = `${weight} ${sizePx}px ${FONT}`;
  const measured = g.measureText(text).width;
  if (measured > maxW) {
    const scaled = Math.max(BUBBLE_MIN_FONT_SCALE, maxW / measured);
    g.font = `${weight} ${Math.floor(sizePx * scaled)}px ${FONT}`;
  }
  // `maxWidth` is the belt to the shrink's braces — at the floor, or if a
  // font substitution measures differently from what it rasterises, the
  // browser squeezes the glyphs instead of letting them overhang.
  g.fillText(text, W / 2, y, maxW);
}

/** Paint one posture's caption into the bubble canvas (called only when the
 *  posture actually changes — never per frame). Exported for
 *  `__tests__/controller-bubble.test.ts`, which drives it against a recording
 *  2D context — the painter is the thing that can overflow, so the painter is
 *  the thing the gate has to hold. */
export function drawControllerBubble(c: HTMLCanvasElement, copy: ControllerBubbleCopy): void {
  const g = c.getContext("2d");
  if (!g) return;
  const W = c.width;
  const H = c.height;
  const tail = 34; // pointer height, reserved at the bottom
  const bodyH = H - tail;
  const r = 34;
  g.clearRect(0, 0, W, H);
  // Card + accent border.
  g.beginPath();
  g.moveTo(r, 0);
  g.lineTo(W - r, 0);
  g.quadraticCurveTo(W, 0, W, r);
  g.lineTo(W, bodyH - r);
  g.quadraticCurveTo(W, bodyH, W - r, bodyH);
  g.lineTo(W / 2 + 40, bodyH);
  g.lineTo(W / 2, H);
  g.lineTo(W / 2 - 40, bodyH);
  g.lineTo(r, bodyH);
  g.quadraticCurveTo(0, bodyH, 0, bodyH - r);
  g.lineTo(0, r);
  g.quadraticCurveTo(0, 0, r, 0);
  g.closePath();
  // Near-opaque: rendered against a bright dawn sky at 0.93 the card washed
  // out and the grey law line stopped reading (frame ZOOM-OFC-bubble.png).
  g.fillStyle = "rgba(9,14,25,0.97)";
  g.fill();
  g.lineWidth = 7;
  g.strokeStyle = copy.accent;
  g.stroke();

  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  // The six answers, each in its own colour so the SLOT is learnable: a student
  // who has read one bubble knows where „who goes" lives on the next one.
  // Green = movement, red = the halt, WHITE-ON-ACCENT = whose priority it is —
  // deliberately the accent, because that line is the one that decides whether
  // he moves, and it is the one the card used not to carry at all.
  // Six lines in the 540 px card the five used to rattle around in: the old
  // rhythm put the law line's baseline at 404 and the body's edge at 506, i.e.
  // ~60 px of nothing. The gaps tighten from 68/78/66/70 to an even
  // 66/64/64/62/64 and every type size is untouched, so nothing that was
  // legible in a shipped frame got smaller.
  g.fillStyle = copy.accent;
  bubbleLine(g, copy.headlineBg, 700, BUBBLE_LINE_PX.headline, 120, W);
  g.fillStyle = "#dbe5f2";
  bubbleLine(g, copy.poseBg, 600, BUBBLE_LINE_PX.pose, 186, W);
  g.fillStyle = "#9ff0c4";
  bubbleLine(g, copy.goBg, 500, BUBBLE_LINE_PX.go, 250, W);
  g.fillStyle = "#ffc9c2";
  bubbleLine(g, copy.stopBg, 500, BUBBLE_LINE_PX.stop, 314, W);
  g.fillStyle = copy.accent;
  bubbleLine(g, copy.priorityBg, 600, BUBBLE_LINE_PX.priority, 376, W);
  g.fillStyle = "#8ea3bd";
  bubbleLine(g, copy.lawRef, 500, BUBBLE_LINE_PX.law, 440, W);
}

/** Structural slice of the runtime's JU-18 read model (module boundary: the
 *  presentation depends on the shape, not the runtime barrel — the same
 *  pattern as the `runtime` prop). `signalControllerFigure` writes the posted
 *  controller's live truth into `out` and returns false when none is posted. */
export interface ControllerFigureRead {
  signalControllerFigure(out: { halted: "ns" | "ew"; secToFlip: number }): boolean;
}

export interface TrafficLayerProps {
  system: TrafficSystem;
  /** When provided, the layer calls system.update each frame (drop-in mode). */
  runtime?: { signalPhase(signalNodeId: string): SignalPhase };
  /** Player chassis object (three space); read for position each frame. */
  playerRef?: RefObject<AnyObject3D | null>;
  /** Player speed for pedestrian gap logic (drop-in mode). */
  playerSpeedKmhRef?: RefObject<number>;
  /** Player heading (0 = north, cw) so agents follow rather than tailgate. */
  playerHeadingDegRef?: RefObject<number>;
  /** Cull radius around the camera, meters. */
  maxDrawDistanceM?: number;
  /**
   * Night flag — lights the emissive head/tail lamps. Wire from the lesson's
   * `isNight` (`<TrafficLayer ... night={isNight} />`). Blinkers/grounding/
   * rolling wheels are night-independent, so the layer still improves the
   * scene when this is left at its default (false).
   */
  night?: boolean;
  /**
   * District geometry — enables the deterministic parked-car curb pass. Wire
   * from the built world (`<TrafficLayer ... district={district} />`). Omit to
   * skip parked cars entirely.
   */
  district?: TrafficDistrict | null;
  /** Lane width used to offset parked cars to the curb (default: the
   *  perceptually scaled 3.25 m × PERCEPTUAL_ROAD_SCALE — must match the
   *  drawn world or parked cars land inside the travel lanes). */
  laneWidthM?: number;
  /**
   * Authored clear zones for the parked-car curb pass (doc 66 R5 — content
   * lives in components/sim scenarioSceneryProps.parkedClearZonesFor and
   * flows here through LessonWorldCore so drill and capture stay one recipe).
   * Omit/[] = today's placement, byte-identical.
   */
  parkedClearZones?: readonly ParkedClearZoneLike[];
  /**
   * L5 sudden-obstacle stimulus (lesson spec `hazard`, doc 68 A5). Render-only:
   * the ball stays hidden until `hazardActiveRef.current` flips true. Omit on
   * lessons without a staged hazard.
   */
  hazard?: HazardStimulusSpec | null;
  /**
   * Trigger for the hazard stimulus — the A8 scenario orchestrator sets this
   * true when the encounter fires (e.g. player up to speed and within trigger
   * range) and back to false to reset/re-stage. The layer animates the ball
   * from the spec's origin along its dart direction while true.
   */
  hazardActiveRef?: RefObject<boolean>;
  /** Whether the premium boxy-SUV spawn gets the expensive MeshPhysical
   *  clearcoat paint (doc 71 perf tiering — high only). Default true keeps the
   *  full look; LessonScene passes `level === "high"`. */
  clearcoat?: boolean;
  /**
   * Drop the 22,672-triangle / 16-material hero boxy SUV from the moving pool
   * entirely (doc 82 §2.3). LessonScene passes `level === "low"`. Default
   * false = the shipped ≤2-instance cap. Overflow already becomes a kolos, so
   * the vehicle population, ids, lanes and speeds are byte-identical either
   * way — only the GLB drawn for those picks changes. */
  dropHeavyFleetModels?: boolean;
  /**
   * JU-18 officer-figure schedule channel — pass the world runtime (its
   * `signalControllerFigure` is the SAME schedule + clock the stop-line
   * adjudication reads, so the figure never runs a second clock). With a
   * controller posted, the staged "directTraffic" figure faces the LIVE
   * halted axis (chest = стоп, profile = премини), raises the right arm
   * through the pre-flip „внимание" window and turns smoothly at the flip.
   * Omit = the legacy static pose and zero extra per-frame work.
   */
  controllerFigure?: ControllerFigureRead | null;
  /**
   * Doc 87 B40(a) — captions anchored to a staged actor (`LessonSpec.actorLabels`).
   *
   * Render-only and honesty-gated: a caption is drawn only while its actor is
   * genuinely stationary (`STAGED_ACTOR_LABEL_STILL_MPS`, read off the live
   * pose — never off a runner phase), so a card that says „тя стои" cannot
   * survive the car pulling away. Omit/[] on every other lesson: the block
   * costs one array-length check per frame.
   */
  actorLabels?: readonly ActorLabelSpec[] | null;
}

export function TrafficLayer({
  system,
  runtime,
  playerRef,
  playerSpeedKmhRef,
  playerHeadingDegRef,
  maxDrawDistanceM = 150,
  night = false,
  district = null,
  laneWidthM = 3.25 * PERCEPTUAL_ROAD_SCALE,
  parkedClearZones = EMPTY_CLEAR_ZONES,
  hazard = null,
  hazardActiveRef,
  clearcoat = true,
  dropHeavyFleetModels = false,
  controllerFigure = null,
  actorLabels = null,
}: TrafficLayerProps) {
  const nVeh = system.vehicles.length;
  const nPed = system.pedestrians.length;

  const parked = useMemo(
    () => (district ? computeParkedCars(district, laneWidthM, parkedClearZones) : []),
    [district, laneWidthM, parkedClearZones],
  );
  const nPark = parked.length;

  const blobTex = useMemo(() => makeBlobTexture(), []);
  // Passed as a prop (not a JSX child), so dispose it ourselves on unmount.
  useEffect(() => () => blobTex.dispose(), [blobTex]);

  // Moving agents. Bodies + wheels are the authored GLB fleet (built below);
  // the blob shadow and the emissive lamp overlays stay as code-geometry
  // InstancedMeshes so blinkers / brake lights / night gating keep per-vehicle
  // (or global-night) control that baked-in GLB emissive can't give per instance.
  const vehBlobRef = useRef<InstancedMesh>(null);
  const brakeRef = useRef<InstancedMesh>(null);
  const headRef = useRef<InstancedMesh>(null);
  const blinkRef = useRef<InstancedMesh>(null);
  // Articulated pedestrians: one InstancedMesh per part (arms/legs hold 2
  // instances per agent — index 2i left, 2i+1 right).
  const pedBlobRef = useRef<InstancedMesh>(null);
  const pedTorsoRef = useRef<InstancedMesh>(null);
  const pedHeadRef = useRef<InstancedMesh>(null);
  const pedArmRef = useRef<InstancedMesh>(null);
  const pedLegRef = useRef<InstancedMesh>(null);
  // PE-14 white cane (1 instance per agent; zero-scaled unless variant elder).
  const pedCaneRef = useRef<InstancedMesh>(null);
  // B42 — the officer's gesture caption. One billboarded plane; the lessons
  // that stage a регулировчик stage exactly one figure, so one is enough.
  const bubbleRef = useRef<Mesh>(null);
  const bubbleTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = BUBBLE_TEX_W;
    c.height = BUBBLE_TEX_H;
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => bubbleTex.dispose(), [bubbleTex]);
  // B40(a) — the staged-actor caption. One billboarded plane: no lesson in the
  // catalogue labels two actors, and if one ever does, the nearest standing one
  // wins (see the frame block).
  const actorLabelRef = useRef<Mesh>(null);
  const actorLabelTex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = WORLD_LABEL_TEX_W;
    c.height = WORLD_LABEL_TEX_H;
    return new CanvasTexture(c);
  }, []);
  useEffect(() => () => actorLabelTex.dispose(), [actorLabelTex]);
  /** Which copy is currently painted into `actorLabelTex` (null = nothing). */
  const paintedActorLabel = useRef<string | null>(null);
  // L5 hazard ball (single mesh — one per lesson at most).
  const hazardBallRef = useRef<Mesh>(null);
  const hazardBlobRef = useRef<Mesh>(null);
  // Animal-hazard variant (hazard.presentation === "animal"): the quadruped
  // rig mounted on the SAME dart integrator as the ball. Built once per lesson;
  // owns its geometry + materials (disposed on teardown).
  const hazardAnimal = useMemo(() => {
    if (hazard?.presentation !== "animal") return null;
    const rig = buildAnimalRig();
    const mesh = new Mesh(rig.bodyGeometry, rig.bodyMaterials);
    mesh.castShadow = true;
    mesh.visible = false;
    return { mesh, rig };
  }, [hazard?.presentation]);
  useEffect(
    () => () => {
      if (!hazardAnimal) return;
      hazardAnimal.rig.bodyGeometry.dispose();
      for (const m of hazardAnimal.rig.ownedMaterials) m.dispose();
    },
    [hazardAnimal],
  );

  // Authored GLB fleet: load the kit (Draco), then instance it — moving bodies
  // + wheels AND the static parked pass over the same rigs. Rebuilt only on
  // remount / system / placement swap; disposed (buffers + merged geometry) on
  // teardown.
  const gltfs = useGLTF(FLEET_URLS, DRACO_DECODER_PATH) as unknown as Array<{
    scene: AnyObject3D;
  }>;
  const fleet = useMemo(
    () =>
      buildTrafficFleet(
        gltfs.map((g) => g.scene),
        system.vehicles,
        parked.map((p) => ({ model: p.model, seed: p.seed })),
        {
          clearcoat,
          boxyMaxInstances: dropHeavyFleetModels
            ? BOXY_MAX_INSTANCES_LOW
            : BOXY_MAX_INSTANCES,
        },
      ),
    [gltfs, system, parked, clearcoat, dropHeavyFleetModels],
  );
  useEffect(() => () => disposeTrafficFleet(fleet), [fleet]);
  // Parked-car blob shadows (static, placed with the parked pass).
  const parkBlobRef = useRef<InstancedMesh>(null);

  // Pedestrian part geometries — origin baked at the joint (shoulder/hip) so
  // one instance matrix swings the limb; torso origin at the hips. Owned here,
  // disposed on unmount.
  const pedGeoms = useMemo(() => {
    const torso = new CapsuleGeometry(PED_TORSO_RADIUS_M, 0.44, 4, 10);
    torso.translate(0, 0.375, 0); // origin at the hips, extends up
    const head = new SphereGeometry(0.135, 10, 8);
    const arm = new CapsuleGeometry(PED_ARM_RADIUS_M, PED_ARM_CYL_M, 3, 8);
    arm.translate(0, -PED_ARM_REACH_M / 2, 0); // origin at the shoulder, hangs down
    const leg = new CapsuleGeometry(0.068, 0.62, 3, 8);
    leg.translate(0, -0.378, 0); // origin at the hip, hangs down
    // PE-14 white cane (elder variant only — everyone else zero-scales it).
    const cane = new CylinderGeometry(CANE_RADIUS_M, CANE_RADIUS_M, CANE_LEN_M, 6);
    cane.translate(0, -CANE_LEN_M / 2, 0); // origin at the grip, hangs down
    return { torso, head, arm, leg, cane };
  }, []);
  useEffect(
    () => () => {
      pedGeoms.torso.dispose();
      pedGeoms.head.dispose();
      pedGeoms.arm.dispose();
      pedGeoms.leg.dispose();
      pedGeoms.cane.dispose();
    },
    [pedGeoms],
  );

  // Reused mutable scratch — lives in a ref (the frame loop mutates it every
  // frame, which render-scoped useMemo values must not do) and is (re)built
  // in the layout effect below.
  interface Scratch {
    dummy: Object3D;
    color: Color;
    playerPos: { x: number; y: number };
    // Per-vehicle cosmetic state.
    dispYaw: Float32Array; // slerp-smoothed heading
    prevYaw: Float32Array; // previous smoothed heading (for steer rate)
    steer: Float32Array; // smoothed visual front-wheel angle
    roll: Float32Array; // accumulated wheel roll angle
    seeded: Uint8Array; // dispYaw initialised yet?
    brakeState: Int8Array; // cached tail-lamp state key
    blinkState: Int8Array; // cached per-lamp (nVeh*2) lit flag
    blinkClock: number;
    // Per-pedestrian deterministic body variation (id-hashed).
    pedHeight: Float32Array; // 0.90..1.12 height scale
    pedBuild: Float32Array; // 0.88..1.14 lateral build scale
    // R3 #25–28 body variants (set once from state.variant in the layout
    // effect — the frame loop only reads).
    pedHeadScale: Float32Array; // absolute head scale (child: bigger ratio)
    pedStoop: Float32Array; // forward torso/head pitch, rad (elder)
    pedCaneOn: Uint8Array; // 1 = render the white cane (elder)
    // JU-18 scheduled officer rig ("directTraffic" + a posted schedule).
    ofcSeeded: Uint8Array; // officer state initialised yet?
    ofcYaw: Float32Array; // damped whole-figure facing
    ofcArmLat: Float32Array; // nPed*2 — damped sideways arm raise (local Z)
    ofcArmSag: Float32Array; // nPed*2 — damped sagittal arm raise (local X)
    /** Reused out-record for officerArmTarget (frame loop allocates nothing). */
    armTarget: OfficerArmTarget;
    /** Reused out-record for the once-per-frame signalControllerFigure read. */
    figure: { halted: "ns" | "ew"; secToFlip: number };
    /** B42 caption: index into CONTROLLER_BUBBLES currently painted into the
     *  canvas (-1 = never painted). Repaint only on a real posture change. */
    bubblePosture: number;
    /** Was the caption wholly on screen last frame? (FR-OFC-CARD hysteresis.) */
    bubbleWhole: boolean;
    /** Reused projection scratch for bubbleWhollyVisible. */
    v3: Vector3;
    // L5 hazard animation clock (seconds since hazardActiveRef went true).
    hazardT: number;
    // Reused rotation scratch.
    qYaw: Quaternion;
    qRoll: Quaternion; // wheel roll about local X
    qWheel: Quaternion;
    qFlat: Quaternion; // Rx(-90): lays a decal flat on the ground
    qBlob: Quaternion;
    qLat: Quaternion; // officer lateral arm raise about local Z
    ctx: TrafficUpdateContext;
  }
  const scratchRef = useRef<Scratch | null>(null);

  // Bound once per runtime — the frame loop must not allocate closures.
  const boundSignalPhase = useMemo(
    () => (runtime ? (id: string) => runtime.signalPhase(id) : null),
    [runtime],
  );

  // Instanced-buffer setup + scratch (re)build.
  useLayoutEffect(() => {
    const color = new Color();
    const qFlat = new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);
    const scratch: Scratch = {
      dummy: new Object3D(),
      color,
      playerPos: { x: 0, y: 0 },
      dispYaw: new Float32Array(nVeh),
      prevYaw: new Float32Array(nVeh),
      steer: new Float32Array(nVeh),
      roll: new Float32Array(nVeh),
      seeded: new Uint8Array(nVeh),
      brakeState: new Int8Array(nVeh).fill(-1),
      blinkState: new Int8Array(nVeh * 2).fill(-1),
      blinkClock: 0,
      pedHeight: new Float32Array(nPed),
      pedBuild: new Float32Array(nPed),
      pedHeadScale: new Float32Array(nPed),
      pedStoop: new Float32Array(nPed),
      pedCaneOn: new Uint8Array(nPed),
      ofcSeeded: new Uint8Array(nPed),
      ofcYaw: new Float32Array(nPed),
      ofcArmLat: new Float32Array(nPed * 2),
      ofcArmSag: new Float32Array(nPed * 2),
      armTarget: { lat: 0, sag: 0 },
      figure: { halted: "ns", secToFlip: Infinity },
      bubblePosture: -1,
      bubbleWhole: false,
      v3: new Vector3(),
      hazardT: 0,
      qYaw: new Quaternion(),
      qRoll: new Quaternion(),
      qWheel: new Quaternion(),
      qFlat,
      qBlob: new Quaternion(),
      qLat: new Quaternion(),
      ctx: { signalPhase: () => "green", playerPos: null },
    };
    scratchRef.current = scratch;
    // Bodies/wheels (the GLB fleet) manage their own draw usage; only the
    // code-geometry overlays need the dynamic hint here.
    const dynamic = [
      vehBlobRef,
      brakeRef,
      headRef,
      blinkRef,
      pedBlobRef,
      pedTorsoRef,
      pedHeadRef,
      pedArmRef,
      pedLegRef,
      pedCaneRef,
    ];
    for (const ref of dynamic) {
      ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    // Pedestrian variation + clothing colours (set once): torso/arms share the
    // top colour, legs read as trousers from a darker per-variant palette.
    const torso = pedTorsoRef.current;
    const arm = pedArmRef.current;
    const leg = pedLegRef.current;
    for (let i = 0; i < nPed; i++) {
      const p = system.pedestrians[i];
      const h = hash32(p.id);
      scratch.pedHeight[i] = 0.9 + ((h & 0xff) / 255) * 0.22;
      scratch.pedBuild[i] = 0.88 + (((h >>> 8) & 0xff) / 255) * 0.26;
      scratch.pedHeadScale[i] = 1;
      scratch.pedStoop[i] = 0;
      scratch.pedCaneOn[i] = 0;
      // B41: an officer figure is PINNED bigger than any walker, and the JU-18
      // регулировчик bigger again — he is the lesson's SIGN, read from the stop
      // line (see PED_CONTROLLER_HEIGHT). Checked before the body variants
      // because no shipped actor authors both, and the uniform already wins the
      // same way.
      if (p.pose === "directTraffic") {
        scratch.pedHeight[i] = PED_CONTROLLER_HEIGHT;
        scratch.pedBuild[i] = PED_CONTROLLER_BUILD;
        scratch.pedHeadScale[i] = PED_CONTROLLER_HEIGHT;
      } else if (p.pose !== undefined) {
        scratch.pedHeight[i] = PED_OFFICER_HEIGHT;
        scratch.pedBuild[i] = PED_OFFICER_BUILD;
        scratch.pedHeadScale[i] = PED_OFFICER_HEIGHT;
      } else if (p.variant === "child") {
        scratch.pedHeight[i] = PED_CHILD_HEIGHT;
        scratch.pedBuild[i] = PED_CHILD_BUILD;
        scratch.pedHeadScale[i] = PED_CHILD_HEAD_SCALE;
      } else if (p.variant === "elder") {
        scratch.pedHeight[i] = PED_ELDER_HEIGHT;
        scratch.pedBuild[i] = 1;
        scratch.pedStoop[i] = PED_ELDER_STOOP_RAD;
        scratch.pedCaneOn[i] = 1;
      }
      // VP-11 / JU-18 officer figures: hi-vis vest + dark trousers (ADR-001
      // fictional) — any authored pose wears the uniform (and wins over a
      // variant colourway; no shipped actor authors both).
      const top =
        p.pose !== undefined
          ? PED_POSE_HIVIS
          : p.variant === "child"
            ? PED_CHILD_TOP
            : p.variant === "elder"
              ? PED_ELDER_TOP
              : PED_COLORS[p.colorIndex % PED_COLORS.length];
      torso?.setColorAt(i, color.set(top));
      color.set(top).multiplyScalar(0.92); // sleeves a touch darker
      arm?.setColorAt(i * 2, color);
      arm?.setColorAt(i * 2 + 1, color);
      color.set(
        p.pose !== undefined
          ? PED_POSE_LEGS
          : p.variant === "child"
            ? PED_CHILD_LEGS
            : p.variant === "elder"
              ? PED_ELDER_LEGS
              : PED_LEG_COLORS[p.colorIndex % PED_LEG_COLORS.length],
      );
      leg?.setColorAt(i * 2, color);
      leg?.setColorAt(i * 2 + 1, color);
    }
    for (const mesh of [torso, arm, leg]) {
      if (mesh?.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [system, nVeh, nPed]);

  // Parked cars: static GLB instances — matrices written ONCE per fleet /
  // placement change (body at the tarmac, 4 wheels at the rig hubs with a
  // deterministic roll phase so hubcaps don't align, elliptical blob shadow).
  useLayoutEffect(() => {
    if (nPark === 0) return;
    const dummy = new Object3D();
    const qYaw = new Quaternion();
    const qRoll = new Quaternion();
    const qFlat = new Quaternion().setFromAxisAngle(AXIS_X, -Math.PI / 2);
    const blob = parkBlobRef.current;
    const wheel = fleet.parkedWheel;
    for (let i = 0; i < nPark; i++) {
      const c = parked[i];
      const m = fleet.parkedAssign[i];
      const rig = fleet.models[m].rig;
      const mesh = fleet.parkedMeshes[m];
      const s = fleet.parkedSlot[i];
      const tx = c.x;
      const tz = -c.y;
      const cos = Math.cos(c.yaw);
      const sin = Math.sin(c.yaw);
      // Body + palette-tinted paint shell (GLB authored ground-relative —
      // origin on the tarmac; both meshes share the slot space).
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.position.set(tx, 0, tz);
      dummy.updateMatrix();
      mesh?.setMatrixAt(s, dummy.matrix);
      fleet.parkedPaintMeshes[m]?.setMatrixAt(s, dummy.matrix);
      // Wheels: static but rendered — yaw · fixed roll phase, model-scaled.
      const ws = fleet.parkedWheelScale[i];
      qYaw.setFromAxisAngle(UP, c.yaw);
      for (let w = 0; w < 4; w++) {
        const off = rig.wheelOffsets[w];
        qRoll.setFromAxisAngle(AXIS_X, (i * 4 + w) * 2.4);
        dummy.quaternion.copy(qYaw).multiply(qRoll);
        dummy.scale.set(ws, ws, ws);
        dummy.position.set(
          tx + off.x * cos + off.z * sin,
          off.y,
          tz - off.x * sin + off.z * cos,
        );
        dummy.updateMatrix();
        wheel?.setMatrixAt(i * 4 + w, dummy.matrix);
      }
      // Blob shadow (same grounding as the moving fleet).
      if (blob) {
        dummy.quaternion.copy(qYaw).multiply(qFlat);
        dummy.scale.set(rig.halfWidth + 0.34, rig.halfLength + 0.4, 1);
        dummy.position.set(tx, BLOB_Y, tz);
        dummy.updateMatrix();
        blob.setMatrixAt(i, dummy.matrix);
      }
    }
    for (const mesh of fleet.parkedMeshes) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const mesh of fleet.parkedPaintMeshes) {
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
    if (wheel) wheel.instanceMatrix.needsUpdate = true;
    if (blob) blob.instanceMatrix.needsUpdate = true;
  }, [fleet, parked, nPark]);

  useFrame((frame, dt) => {
    const scratch = scratchRef.current;
    if (!scratch) return;
    // --- Drop-in drive mode.
    if (boundSignalPhase) {
      const ctx = scratch.ctx;
      ctx.signalPhase = boundSignalPhase;
      const player = playerRef?.current;
      if (player) {
        scratch.playerPos.x = player.position.x;
        scratch.playerPos.y = -player.position.z; // three -> district
        ctx.playerPos = scratch.playerPos;
        ctx.playerSpeedKmh = playerSpeedKmhRef?.current;
        ctx.playerHeadingDeg = playerHeadingDegRef?.current;
      } else {
        ctx.playerPos = null;
      }
      system.update(dt, ctx);
    }

    const cam = frame.camera.position;
    const maxD2 = maxDrawDistanceM * maxDrawDistanceM;
    const dummy = scratch.dummy;
    const color = scratch.color;
    const dtc = Math.min(dt, 0.1);
    scratch.blinkClock += dtc;
    const blinkOn = scratch.blinkClock % BLINK_PERIOD_S < BLINK_PERIOD_S * BLINK_DUTY;
    // Emergency beacon strobe (VU-09): anti-phase blue lamp flip off the same
    // clock — shared materials, two color writes per edge, no-op without an
    // emergency actor (see vehicleFleet.updateEmergencyStrobe).
    updateEmergencyStrobe(fleet, scratch.blinkClock);
    const yawT = 1 - Math.exp(-YAW_SMOOTH_RATE * dtc);
    const steerT = 1 - Math.exp(-STEER_SMOOTH_RATE * dtc);

    // --- Vehicles (GLB fleet bodies + shared wheels + code-geometry overlays).
    const vehBlob = vehBlobRef.current;
    const brake = brakeRef.current;
    const head = headRef.current;
    const blink = blinkRef.current;
    const wheel = fleet.wheel;
    if (vehBlob && brake && head && blink && wheel) {
      let blinkColorDirty = false;
      for (let i = 0; i < nVeh; i++) {
        const v = system.vehicles[i];
        const tx = v.x;
        const tz = -v.y;

        // Smooth the heading (kills the snap through turns) — do this even when
        // culled so re-entry doesn't pop.
        const targetYaw = Math.atan2(v.dirX, -v.dirY);
        if (!scratch.seeded[i]) {
          scratch.dispYaw[i] = targetYaw;
          scratch.prevYaw[i] = targetYaw;
          scratch.seeded[i] = 1;
        } else {
          scratch.dispYaw[i] += wrapPi(targetYaw - scratch.dispYaw[i]) * yawT;
        }
        const yaw = scratch.dispYaw[i];

        // Model + its rig (body InstancedMesh, paint shell, wheel meshes).
        const mIdx = fleet.assign[i];
        const model = fleet.models[mIdx];
        const rig = model.rig;
        const bodyMesh = model.mesh;
        const paintMesh = fleet.paintMeshes[mIdx];
        // Custom-wheel models (hero SUV) spin their own side-mirrored meshes;
        // their shared-wheel slots stay at the zero matrix forever.
        const cwL = fleet.customWheelL[mIdx];
        const cwR = fleet.customWheelR[mIdx];
        const s = fleet.slot[i];

        const dx = tx - cam.x;
        const dz = tz - cam.z;
        const visible = dx * dx + dz * dz <= maxD2;
        if (!visible) {
          dummy.position.set(tx, 0, tz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          bodyMesh?.setMatrixAt(s, dummy.matrix);
          paintMesh?.setMatrixAt(s, dummy.matrix);
          vehBlob.setMatrixAt(i, dummy.matrix);
          brake.setMatrixAt(i, dummy.matrix);
          head.setMatrixAt(i, dummy.matrix);
          blink.setMatrixAt(i * 2, dummy.matrix);
          blink.setMatrixAt(i * 2 + 1, dummy.matrix);
          if (cwL && cwR) {
            for (let w = 0; w < 2; w++) {
              cwL.setMatrixAt(s * 2 + w, dummy.matrix);
              cwR.setMatrixAt(s * 2 + w, dummy.matrix);
            }
          } else {
            for (let w = 0; w < 4; w++) wheel.setMatrixAt(i * 4 + w, dummy.matrix);
          }
          scratch.prevYaw[i] = yaw;
          continue;
        }

        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);

        // Cosmetic steer from the smoothed yaw rate; roll from ground speed over
        // this model's wheel radius.
        const yawRate = dtc > 1e-4 ? wrapPi(yaw - scratch.prevYaw[i]) / dtc : 0;
        scratch.prevYaw[i] = yaw;
        const steerTarget = Math.max(
          -MAX_STEER,
          Math.min(MAX_STEER, yawRate * STEER_FROM_YAWRATE),
        );
        scratch.steer[i] += (steerTarget - scratch.steer[i]) * steerT;
        const steer = scratch.steer[i];
        scratch.roll[i] += (v.speedMps * dtc) / fleet.wheelRadius[i];
        const roll = scratch.roll[i];

        // Blob shadow (elliptical, laid flat, sized to the model footprint).
        scratch.qYaw.setFromAxisAngle(UP, yaw);
        scratch.qBlob.copy(scratch.qYaw).multiply(scratch.qFlat);
        dummy.quaternion.copy(scratch.qBlob);
        dummy.scale.set(rig.halfWidth + 0.34, rig.halfLength + 0.4, 1);
        dummy.position.set(tx, BLOB_Y, tz);
        dummy.updateMatrix();
        vehBlob.setMatrixAt(i, dummy.matrix);

        // Body + paint shell (GLB is authored ground-relative — origin on the
        // tarmac at Y = 0; the paint shell shares the body's slot space).
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, yaw, 0);
        dummy.position.set(tx, 0, tz);
        dummy.updateMatrix();
        bodyMesh?.setMatrixAt(s, dummy.matrix);
        paintMesh?.setMatrixAt(s, dummy.matrix);

        // Tail/brake bar (rear, per-model Z) — X-scaled to the model width
        // (the v2 fleet spans 1.54 m city cars to 2.04 m minibuses).
        dummy.scale.set(rig.halfWidth * 1.64 / 1.5, 1, 1); // bar geo is 1.5 wide
        dummy.position.set(tx + rig.rearZ * sin, rig.lampY, tz + rig.rearZ * cos);
        dummy.updateMatrix();
        brake.setMatrixAt(i, dummy.matrix);
        // Headlight bar (front) — only drawn at night, matrix kept fresh anyway.
        dummy.scale.set(rig.halfWidth * 1.44 / 1.3, 1, 1); // bar geo is 1.3 wide
        dummy.position.set(tx + rig.frontZ * sin, rig.headY, tz + rig.frontZ * cos);
        dummy.updateMatrix();
        head.setMatrixAt(i, dummy.matrix);
        // Rear blinker lamps (index 2i = left +X, 2i+1 = right -X).
        dummy.scale.set(1, 1, 1);
        const blinkOx = rig.halfWidth * 0.82;
        const blinkZ = rig.rearZ + 0.05;
        for (let side = 0; side < 2; side++) {
          const ox = side === 0 ? blinkOx : -blinkOx;
          dummy.position.set(
            tx + ox * cos + blinkZ * sin,
            rig.lampY,
            tz - ox * sin + blinkZ * cos,
          );
          dummy.updateMatrix();
          blink.setMatrixAt(i * 2 + side, dummy.matrix);
        }
        // Wheels — qYaw(+steer on fronts) * roll about local X. Standard
        // models: the shared X-axial geometry scaled to the model radius.
        // Custom-wheel models (hero SUV): the model's own left/right meshes
        // at scale 1 (FL/RL -> left mesh slots s*2/s*2+1, FR/RR -> right).
        const wscale = fleet.wheelScale[i];
        for (let w = 0; w < 4; w++) {
          const front = w < 2;
          const off = rig.wheelOffsets[w];
          scratch.qYaw.setFromAxisAngle(UP, yaw + (front ? steer : 0));
          scratch.qRoll.setFromAxisAngle(AXIS_X, roll);
          scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qRoll);
          dummy.quaternion.copy(scratch.qWheel);
          dummy.scale.set(wscale, wscale, wscale);
          dummy.position.set(
            tx + off.x * cos + off.z * sin,
            off.y,
            tz - off.x * sin + off.z * cos,
          );
          dummy.updateMatrix();
          if (cwL && cwR) {
            (w % 2 === 0 ? cwL : cwR).setMatrixAt(s * 2 + (w >> 1), dummy.matrix);
          } else {
            wheel.setMatrixAt(i * 4 + w, dummy.matrix);
          }
        }

        // Tail-lamp colour: braking > night-tail > unlit. Cache the state key
        // so the colour buffer only rewrites on change.
        const tailKey = v.braking ? 2 : night ? 1 : 0;
        if (scratch.brakeState[i] !== tailKey) {
          scratch.brakeState[i] = tailKey;
          brake.setColorAt(i, color.set(tailKey === 2 ? BRAKE_ON : tailKey === 1 ? TAIL_ON : BRAKE_OFF));
          if (brake.instanceColor) brake.instanceColor.needsUpdate = true;
        }

        // Blinkers — the PUBLISHED indicator wins; the yaw guess is only the
        // fallback for cars nobody commands (ledger L6/L8/L11, founder items
        // 43/44: „it is turning on the right signal very very very late").
        //
        // Why the guess alone was not late but ABSENT: a staged laneShift is a
        // lateral GLIDE. The shipped cut-in moves 8.125 m over 1.5 s at 11 m/s,
        // so the smoothed steer peaks at 0.0624 against this file's own 0.07
        // arming threshold — the lamp never lit at all, at any point, and the
        // student could not anticipate a merge the car never announced. The
        // engine now publishes what the actor is ACTUALLY indicating
        // (TrafficVehicleState.indicator, armed INDICATOR_LEAD_SEC ahead of the
        // wheel by the cut-in runner), so the renderer reads it instead of
        // inferring it.
        //
        // A commanded lamp can never be suppressed by the guess, and an
        // uncommanded actor keeps the guess: an ambient NPC physically turning
        // a corner still blinks, which is what a real driver does and what a
        // student must be able to read off the traffic around him. `indicator`
        // is absent on every ambient agent and "off" on an unarmed staged one —
        // both fall through to the geometry. See blinkerSides().
        const sides = blinkerSides(v.indicator, steer);
        const turnLeft = sides.left;
        const turnRight = sides.right;
        const leftLit = turnLeft && blinkOn ? 1 : 0;
        const rightLit = turnRight && blinkOn ? 1 : 0;
        if (scratch.blinkState[i * 2] !== leftLit) {
          scratch.blinkState[i * 2] = leftLit;
          blink.setColorAt(i * 2, color.set(leftLit ? BLINK_ON : BLINK_OFF));
          blinkColorDirty = true;
        }
        if (scratch.blinkState[i * 2 + 1] !== rightLit) {
          scratch.blinkState[i * 2 + 1] = rightLit;
          blink.setColorAt(i * 2 + 1, color.set(rightLit ? BLINK_ON : BLINK_OFF));
          blinkColorDirty = true;
        }
      }
      for (const model of fleet.models) {
        if (model.mesh) model.mesh.instanceMatrix.needsUpdate = true;
      }
      for (const pm of fleet.paintMeshes) {
        if (pm) pm.instanceMatrix.needsUpdate = true;
      }
      for (let m = 0; m < fleet.customWheelL.length; m++) {
        const l = fleet.customWheelL[m];
        const r = fleet.customWheelR[m];
        if (l) l.instanceMatrix.needsUpdate = true;
        if (r) r.instanceMatrix.needsUpdate = true;
      }
      wheel.instanceMatrix.needsUpdate = true;
      vehBlob.instanceMatrix.needsUpdate = true;
      brake.instanceMatrix.needsUpdate = true;
      head.instanceMatrix.needsUpdate = true;
      blink.instanceMatrix.needsUpdate = true;
      if (blinkColorDirty && blink.instanceColor) blink.instanceColor.needsUpdate = true;
    }

    // --- Pedestrians (articulated: torso + head + 2 arms + 2 legs).
    const pedBlob = pedBlobRef.current;
    const pedTorso = pedTorsoRef.current;
    const pedHead = pedHeadRef.current;
    const pedArm = pedArmRef.current;
    const pedLeg = pedLegRef.current;
    const pedCane = pedCaneRef.current;
    if (pedBlob && pedTorso && pedHead && pedArm && pedLeg && pedCane) {
      // JU-18: ONE schedule read per frame through the runtime channel (the
      // reused out-record keeps the loop allocation-free). figOn false — no
      // channel wired or no controller posted — renders every pose exactly
      // as before.
      const fig = scratch.figure;
      const figOn = controllerFigure !== null && controllerFigure.signalControllerFigure(fig);
      const ofcTurnT = 1 - Math.exp(-OFC_TURN_RATE * dtc);
      const ofcArmT = 1 - Math.exp(-OFC_ARM_RATE * dtc);
      // B42: the caption follows whichever officer figure is on the map. Reset
      // each frame; the loop claims it when it renders one.
      let bubbleOwner = -1;
      let bubblePosture = -1;
      for (let i = 0; i < nPed; i++) {
        const p = system.pedestrians[i];
        const tx = p.x;
        const tz = -p.y;
        const dx = tx - cam.x;
        const dz = tz - cam.z;
        if (dx * dx + dz * dz > maxD2) {
          dummy.position.set(tx, 0, tz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          pedBlob.setMatrixAt(i, dummy.matrix);
          pedTorso.setMatrixAt(i, dummy.matrix);
          pedHead.setMatrixAt(i, dummy.matrix);
          pedArm.setMatrixAt(i * 2, dummy.matrix);
          pedArm.setMatrixAt(i * 2 + 1, dummy.matrix);
          pedLeg.setMatrixAt(i * 2, dummy.matrix);
          pedLeg.setMatrixAt(i * 2 + 1, dummy.matrix);
          pedCane.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const hgt = scratch.pedHeight[i];
        const bld = scratch.pedBuild[i];
        const bob = p.speedMps > 0.01 ? Math.sin(p.walkPhase) * 0.04 : 0;
        let yaw = Math.atan2(p.dirX, -p.dirY);
        // JU-18 scheduled officer: re-aim the WHOLE figure at the axis the
        // controller halts right now (chest-on = стоп; the permitted axis
        // sees the profile). The published dir is the authored `facing` (the
        // staged standing path), so: halted axis == facing axis → face it;
        // otherwise face it rotated 90°. Damped — the flip is a smooth turn,
        // never a teleport.
        const officer = figOn && p.pose === "directTraffic";
        const attention = officer && fig.secToFlip <= OFC_RAISE_LEAD_SEC;
        if (officer) {
          const facingNs = Math.abs(p.dirY) >= Math.abs(p.dirX);
          const haltMatches = (fig.halted === "ns") === facingNs;
          const hx = haltMatches ? p.dirX : p.dirY;
          const hy = haltMatches ? p.dirY : -p.dirX;
          const targetYaw = Math.atan2(hx, -hy);
          if (!scratch.ofcSeeded[i]) {
            // First sighting: land IN pose (no settle-in at session start).
            scratch.ofcSeeded[i] = 1;
            scratch.ofcYaw[i] = targetYaw;
            for (let side = 0; side < 2; side++) {
              officerArmTarget(attention, side, scratch.armTarget);
              scratch.ofcArmLat[i * 2 + side] = scratch.armTarget.lat;
              scratch.ofcArmSag[i * 2 + side] = scratch.armTarget.sag;
            }
          } else {
            scratch.ofcYaw[i] += wrapPi(targetYaw - scratch.ofcYaw[i]) * ofcTurnT;
          }
          yaw = scratch.ofcYaw[i];
        }
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        // B42 — which posture is this student looking at RIGHT NOW? Read off
        // the rendered pose, not off the schedule: the caption must describe
        // the figure in front of the windscreen, and "chest-on" or "profile"
        // is a fact about the angle between his facing and the eye, which is
        // exactly what the driver has to learn to read. `stopSignal` is the
        // raised-arm gesture by definition; the scheduled officer's „внимание"
        // window is the same gesture; everything else is геометрия.
        if (p.pose !== undefined && bubbleOwner < 0) {
          bubbleOwner = i;
          if (attention || p.pose === "stopSignal") {
            bubblePosture = BUBBLE_ARM_RAISED;
          } else {
            // Officer forward in three-space is (sin yaw, −cos yaw).
            const toEyeX = cam.x - tx;
            const toEyeZ = cam.z - tz;
            const inv = 1 / Math.max(1e-3, Math.hypot(toEyeX, toEyeZ));
            const facing = Math.abs((toEyeX * sin + toEyeZ * -cos) * inv);
            const was = scratch.bubblePosture === BUBBLE_CHEST_OR_BACK;
            bubblePosture =
              facing >= (was ? BUBBLE_ANFAS_EXIT : BUBBLE_ANFAS_ENTER)
                ? BUBBLE_CHEST_OR_BACK
                : BUBBLE_SIDE_PROFILE;
          }
        }
        // Counter-phase swing from the accumulated walk phase, damped to zero
        // as the agent slows (standing pedestrians hold their limbs still).
        const swing =
          Math.sin(p.walkPhase) *
          Math.min(1, p.speedMps / PED_SWING_FULL_SPEED_MPS);
        // Blob (round, laid flat, sized with the build).
        dummy.quaternion.copy(scratch.qFlat);
        dummy.scale.set(0.42 * bld, 0.42 * bld, 1);
        dummy.position.set(tx, BLOB_Y, tz);
        dummy.updateMatrix();
        pedBlob.setMatrixAt(i, dummy.matrix);
        // Torso (origin at the hips; the elder variant pitches forward).
        scratch.qYaw.setFromAxisAngle(UP, yaw);
        const stoop = scratch.pedStoop[i];
        if (stoop !== 0) {
          scratch.qRoll.setFromAxisAngle(AXIS_X, stoop);
          dummy.quaternion.copy(scratch.qYaw).multiply(scratch.qRoll);
        } else {
          dummy.rotation.set(0, yaw, 0);
        }
        dummy.scale.set(bld, hgt, bld);
        dummy.position.set(tx, PED_HIP_Y * hgt + bob, tz);
        dummy.updateMatrix();
        pedTorso.setMatrixAt(i, dummy.matrix);
        // Head (per-variant scale — the child reads through the head ratio;
        // the elder's head follows the stooped torso top).
        let headY = PED_HEAD_Y * hgt;
        let headFwd = 0;
        if (stoop !== 0) {
          const lever = (PED_HEAD_Y - PED_HIP_Y) * hgt;
          headY = PED_HIP_Y * hgt + Math.cos(stoop) * lever;
          headFwd = Math.sin(stoop) * lever;
        }
        const hs = scratch.pedHeadScale[i];
        dummy.scale.set(hs, hs, hs);
        dummy.position.set(tx + sin * headFwd, headY + bob, tz + cos * headFwd);
        dummy.updateMatrix();
        pedHead.setMatrixAt(i, dummy.matrix);
        // Limbs: instance = yaw · swing about the local side axis; geometry is
        // origin-at-joint so the same matrix places AND swings. Left limbs at
        // 2i, right at 2i+1; arms counter-swing their side's leg.
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? 1 : -1;
          const armX = sign * PED_SHOULDER_HALF * bld;
          const legX = sign * PED_HIP_HALF * bld;
          // Arm — the VP-11 "stopSignal" pose holds side 1 raised (the
          // стоп-сигнал gesture), the JU-18 "directTraffic" pose holds it
          // extended horizontally (static fallback — the scheduled officer
          // branch below replaces it); everything else swings with the walk.
          if (officer) {
            // Live officer arms: both out sideways AND pitched forward (the
            // halt wall / the wave-through profile — FR-OFC-ARMS), except the
            // „внимание" window: right arm straight up, left dropped. Damped
            // per-side toward the target the shared rule states.
            const li = i * 2 + side;
            officerArmTarget(attention, side, scratch.armTarget);
            const latTarget = scratch.armTarget.lat;
            const sagTarget = scratch.armTarget.sag;
            scratch.ofcArmLat[li] += (latTarget - scratch.ofcArmLat[li]) * ofcArmT;
            scratch.ofcArmSag[li] += (sagTarget - scratch.ofcArmSag[li]) * ofcArmT;
            scratch.qLat.setFromAxisAngle(AXIS_Z, scratch.ofcArmLat[li]);
            scratch.qRoll.setFromAxisAngle(AXIS_X, scratch.ofcArmSag[li]);
            scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qLat).multiply(scratch.qRoll);
          } else {
            const armRad =
              p.pose === "stopSignal" && side === 1
                ? PED_POSE_ARM_RAISE_RAD
                : p.pose === "directTraffic" && side === 1
                  ? PED_POSE_ARM_EXTEND_RAD
                  : scratch.pedCaneOn[i] === 1 && side === 1
                    ? PED_ELDER_ARM_FWD_RAD // the cane hand, held forward
                    : -sign * swing * PED_ARM_SWING_RAD;
            scratch.qRoll.setFromAxisAngle(AXIS_X, armRad);
            scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qRoll);
          }
          dummy.quaternion.copy(scratch.qWheel);
          dummy.scale.set(bld, hgt, bld);
          dummy.position.set(
            tx + armX * cos,
            PED_SHOULDER_Y * hgt + bob,
            tz - armX * sin,
          );
          dummy.updateMatrix();
          pedArm.setMatrixAt(i * 2 + side, dummy.matrix);
          // Leg.
          scratch.qRoll.setFromAxisAngle(AXIS_X, sign * swing * PED_LEG_SWING_RAD);
          scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qRoll);
          dummy.quaternion.copy(scratch.qWheel);
          dummy.position.set(
            tx + legX * cos,
            PED_HIP_Y * hgt + bob,
            tz - legX * sin,
          );
          dummy.updateMatrix();
          pedLeg.setMatrixAt(i * 2 + side, dummy.matrix);
        }
        // White cane (PE-14, elder variant): a thin white rod from the right
        // hand to the tarmac ahead, sweeping laterally with the walk phase —
        // the tapping read. Everyone else zero-scales the instance.
        if (scratch.pedCaneOn[i] === 1) {
          const handX = -PED_SHOULDER_HALF * bld; // right side (limb sign −1)
          const fwd = CANE_HAND_FWD * hgt;
          scratch.qLat.setFromAxisAngle(AXIS_Z, Math.sin(p.walkPhase) * CANE_SWEEP_RAD);
          scratch.qRoll.setFromAxisAngle(AXIS_X, CANE_PITCH_RAD);
          scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qLat).multiply(scratch.qRoll);
          dummy.quaternion.copy(scratch.qWheel);
          dummy.scale.set(1, 1, 1);
          dummy.position.set(
            tx + handX * cos + sin * fwd,
            (PED_SHOULDER_Y - CANE_HAND_DROP) * hgt + bob,
            tz - handX * sin + cos * fwd,
          );
          dummy.updateMatrix();
          pedCane.setMatrixAt(i, dummy.matrix);
        } else {
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          pedCane.setMatrixAt(i, dummy.matrix);
        }
      }
      pedBlob.instanceMatrix.needsUpdate = true;
      pedTorso.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;
      pedArm.instanceMatrix.needsUpdate = true;
      pedLeg.instanceMatrix.needsUpdate = true;
      pedCane.instanceMatrix.needsUpdate = true;

      // --- B42 gesture caption. Hidden on every lesson with no officer, so
      // this whole block is a single boolean for the other ~150 scenarios.
      const bubble = bubbleRef.current;
      if (bubble) {
        if (bubbleOwner < 0 || bubblePosture < 0) {
          bubble.visible = false;
        } else {
          const owner = system.pedestrians[bubbleOwner];
          if (bubblePosture !== scratch.bubblePosture) {
            scratch.bubblePosture = bubblePosture;
            drawControllerBubble(
              bubbleTex.image as HTMLCanvasElement,
              CONTROLLER_BUBBLES[bubblePosture],
            );
            bubbleTex.needsUpdate = true;
          }
          const ox = owner.x;
          const oz = -owner.y;
          const eyeD = Math.hypot(ox - cam.x, oz - cam.z);
          // Constant APPARENT size past the reference distance: the whole
          // point of the ask is that he can read it while there is still road
          // left to act on it.
          const s = bubbleScale(eyeD);
          // The owner's OWN height — the tail has to point at the head it is
          // captioning, and since B41 the JU-18 регулировчик and the VP-11
          // curb warden are no longer the same size. Reading it back out of the
          // per-actor scratch is what keeps the two from ever drifting apart.
          const headY = PED_HEAD_Y * scratch.pedHeight[bubbleOwner];
          const cy = headY + BUBBLE_GAP_M + (BUBBLE_H_M * s) / 2;
          bubble.position.set(ox, cy, oz);
          bubble.scale.set(s, s, 1);
          bubble.quaternion.copy(frame.camera.quaternion); // billboard
          // …and drawn only while it can be read WHOLE (FR-OFC-CARD): a card
          // clipped by the top of the windscreen spends its remainder on the
          // HUD, which is the defect sweep161 photographed over the „МЕНЮ"
          // button. The live camera answers it exactly, on every aspect.
          scratch.bubbleWhole = bubbleWhollyVisible(
            frame.camera,
            ox,
            cy,
            oz,
            (BUBBLE_W_M * s) / 2,
            (BUBBLE_H_M * s) / 2,
            scratch.bubbleWhole,
            scratch.v3,
          );
          bubble.visible = scratch.bubbleWhole;
        }
      }
    }

    // --- B40(a): the STAGED-ACTOR caption. «Спане на зелено» stages one car
    // NOSE-ON at 62 m, where it measures 26 px — no cue that lives on the body
    // survives that, so the affordance is words on a plane that grows with
    // range. Two gates, both read off the LIVE pose:
    //   • it must be standing (the card cannot outlive its own claim), and
    //   • it must be inside STAGED_ACTOR_LABEL_MAX_DIST_M (a caption 134 m out
    //     at the spawn would answer the question before he has looked).
    // Hidden on ~166 of 167 templates by a single array-length check.
    {
      const actorLabel = actorLabelRef.current;
      if (actorLabel) {
        let bestKind: string | null = null;
        let bestX = 0;
        let bestZ = 0;
        let bestDist = Infinity;
        if (actorLabels && actorLabels.length > 0) {
          for (const spec of actorLabels) {
            const view = system.staged(spec.actorId);
            if (!view || view.kind !== "vehicle") continue;
            if (Math.abs(view.speedMps) > STAGED_ACTOR_LABEL_STILL_MPS) continue;
            const ax = view.x;
            const az = -view.y;
            const d = Math.hypot(ax - cam.x, az - cam.z);
            if (d > STAGED_ACTOR_LABEL_MAX_DIST_M || d >= bestDist) continue;
            bestKind = spec.kind;
            bestX = ax;
            bestZ = az;
            bestDist = d;
          }
        }
        if (bestKind === null) {
          actorLabel.visible = false;
        } else {
          if (paintedActorLabel.current !== bestKind) {
            paintedActorLabel.current = bestKind;
            drawWorldLabel(
              actorLabelTex.image as HTMLCanvasElement,
              STAGED_ACTOR_LABELS[bestKind as keyof typeof STAGED_ACTOR_LABELS],
            );
            actorLabelTex.needsUpdate = true;
          }
          const s = Math.min(
            STAGED_ACTOR_LABEL_MAX_SCALE,
            Math.max(1, bestDist / STAGED_ACTOR_LABEL_REF_DIST_M),
          );
          actorLabel.position.set(
            bestX,
            // Clear of the roof and growing UPWARD, never down over the car it
            // is pointing at — the B35 anchoring lesson, applied to a body
            // instead of a signal housing.
            STAGED_ACTOR_LABEL_ROOF_M + WORLD_LABEL_GAP_M + (WORLD_LABEL_H_M * s) / 2,
            bestZ,
          );
          actorLabel.scale.set(s, s, 1);
          actorLabel.quaternion.copy(frame.camera.quaternion); // billboard
          actorLabel.visible = true;
        }
      }
    }

    // --- L5 hazard dart (render-only; A8 owns the trigger). The ball and the
    // animal variant ride the SAME (x,y,dir,speed,travel) integrator.
    const ball = hazardBallRef.current;
    const ballBlob = hazardBlobRef.current;
    const animalMesh = hazardAnimal?.mesh ?? null;
    if (hazard && (animalMesh || (ball && ballBlob))) {
      if (hazardActiveRef?.current) {
        scratch.hazardT += dtc;
        const travelled = Math.min(hazard.speedMps * scratch.hazardT, hazard.travelM);
        const rolling = travelled < hazard.travelM;
        const bx = hazard.x + hazard.dirX * travelled;
        const by = hazard.y + hazard.dirY * travelled;
        if (animalMesh) {
          animalMesh.visible = true;
          animalMesh.position.set(bx, 0, -by); // Y = 0 = hooves on the tarmac
          // Nose +Z faces the dart direction (the district→three yaw law).
          animalMesh.rotation.y = Math.atan2(hazard.dirX, -hazard.dirY);
        } else if (ball && ballBlob) {
          const bounce = rolling
            ? Math.abs(Math.sin((travelled / HAZARD_BOUNCE_WAVELENGTH_M) * Math.PI)) *
              HAZARD_BOUNCE_HEIGHT_M
            : 0;
          ball.visible = true;
          ballBlob.visible = true;
          ball.position.set(bx, HAZARD_BALL_RADIUS_M + bounce, -by);
          ballBlob.position.set(bx, BLOB_Y, -by);
        }
      } else {
        scratch.hazardT = 0;
        if (animalMesh) animalMesh.visible = false;
        if (ball) ball.visible = false;
        if (ballBlob) ballBlob.visible = false;
      }
    }
  });

  return (
    <group>
      {/* Fake ground shadow so agents stop floating (blob decal — always on,
          reads on every tier; capable tiers also get real castShadow below). */}
      <instancedMesh ref={vehBlobRef} args={[undefined, undefined, nVeh]} frustumCulled={false}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial
          color="#000000"
          alphaMap={blobTex}
          transparent
          opacity={0.5}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </instancedMesh>

      {/* Authored GLB fleet: per-model body InstancedMeshes + one shared wheel
          InstancedMesh, built imperatively in `fleet`. dispose={null} keeps the
          drei-cached geometry/materials alive across remounts — the buffers we
          own are freed in the disposeTrafficFleet cleanup effect above. */}
      <primitive object={fleet.group} dispose={null} />
      {/* Tail/brake bar — unlit basic material so per-instance colour reads as
          light (brake red / night tail glow / unlit lens). */}
      <instancedMesh ref={brakeRef} args={[undefined, undefined, nVeh]} frustumCulled={false}>
        <boxGeometry args={[1.5, 0.14, 0.08]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>
      {/* Headlight bar — only drawn at night (warm glow, blooms if enabled). */}
      <instancedMesh
        ref={headRef}
        args={[undefined, undefined, nVeh]}
        frustumCulled={false}
        visible={night}
      >
        <boxGeometry args={[1.3, 0.12, 0.06]} />
        <meshBasicMaterial color={HEAD_COLOR} toneMapped={false} />
      </instancedMesh>
      {/* Amber turn signals (2 lamps per vehicle: index 2i left, 2i+1 right). */}
      <instancedMesh ref={blinkRef} args={[undefined, undefined, nVeh * 2]} frustumCulled={false}>
        <boxGeometry args={[0.12, 0.1, 0.08]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </instancedMesh>

      {/* Pedestrians — articulated six-part skeleton, one InstancedMesh per
          part (arms/legs pack 2 instances per agent). */}
      <instancedMesh ref={pedBlobRef} args={[undefined, undefined, nPed]} frustumCulled={false}>
        <circleGeometry args={[1, 16]} />
        <meshBasicMaterial
          color="#000000"
          alphaMap={blobTex}
          transparent
          opacity={0.45}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-2}
        />
      </instancedMesh>
      <instancedMesh
        ref={pedTorsoRef}
        args={[undefined, undefined, nPed]}
        geometry={pedGeoms.torso}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={pedHeadRef}
        args={[undefined, undefined, nPed]}
        geometry={pedGeoms.head}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#c9a184" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={pedArmRef}
        args={[undefined, undefined, nPed * 2]}
        geometry={pedGeoms.arm}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <instancedMesh
        ref={pedLegRef}
        args={[undefined, undefined, nPed * 2]}
        geometry={pedGeoms.leg}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      {/* PE-14 white cane — one instance per agent, zero-scaled except on the
          elder variant (the бял бастун recognition cue). */}
      <instancedMesh
        ref={pedCaneRef}
        args={[undefined, undefined, nPed]}
        geometry={pedGeoms.cane}
        frustumCulled={false}
        castShadow
      >
        <meshStandardMaterial color="#f4f2ec" roughness={0.35} />
      </instancedMesh>

      {/* B42 — the регулировчик's gesture caption, billboarded above his head.
          Mounted always, `visible` only while an officer figure is on the map
          (one boolean per frame on every other lesson). depthWrite off so it
          never carves a hole in what is behind it; it still depth-TESTS, so a
          bus between you and him hides it exactly like it hides him. */}
      <mesh ref={bubbleRef} visible={false} renderOrder={7} frustumCulled={false}>
        <planeGeometry args={[BUBBLE_W_M, BUBBLE_H_M]} />
        <meshBasicMaterial map={bubbleTex} transparent depthWrite={false} toneMapped={false} />
      </mesh>

      {/* B40(a) — the staged-actor caption, billboarded over the car it names.
          Named so a placement dump can find it (the B35 lesson: a caption can
          be present in the scene graph and invisible in the frame, and only a
          measured dump tells them apart). `depthTest` OFF, unlike the officer
          bubble: this subject stands 62 m out with the junction furniture and a
          signal head between it and the eye, and a caption the junction eats is
          the defect this row already refused once. depthWrite stays off so it
          carves no hole in what is behind it. */}
      <mesh
        name="staged-actor-label"
        ref={actorLabelRef}
        visible={false}
        renderOrder={7}
        frustumCulled={false}
      >
        <planeGeometry args={[WORLD_LABEL_W_M, WORLD_LABEL_H_M]} />
        <meshBasicMaterial
          map={actorLabelTex}
          transparent
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Parked-car blob shadows — the GLB bodies + wheels themselves live in
          fleet.group (static per-model InstancedMeshes, placed once above). */}
      {nPark > 0 ? (
        <instancedMesh ref={parkBlobRef} args={[undefined, undefined, nPark]} frustumCulled={false}>
          <circleGeometry args={[1, 20]} />
          <meshBasicMaterial
            color="#000000"
            alphaMap={blobTex}
            transparent
            opacity={0.5}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </instancedMesh>
      ) : null}

      {/* L5 sudden-obstacle dart — hidden until the A8 orchestrator flips
          hazardActiveRef; mounted only when the lesson stages a hazard. The
          "animal" presentation mounts the quadruped rig on the same path. */}
      {hazard && hazardAnimal ? <primitive object={hazardAnimal.mesh} /> : null}
      {hazard && !hazardAnimal ? (
        <>
          <mesh ref={hazardBallRef} visible={false} castShadow>
            <sphereGeometry args={[HAZARD_BALL_RADIUS_M, 16, 12]} />
            <meshStandardMaterial
              color="#ff4b1f"
              emissive="#7e1600"
              emissiveIntensity={0.4}
              roughness={0.55}
            />
          </mesh>
          <mesh ref={hazardBlobRef} visible={false} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.5, 16]} />
            <meshBasicMaterial
              color="#000000"
              alphaMap={blobTex}
              transparent
              opacity={0.5}
              depthWrite={false}
              polygonOffset
              polygonOffsetFactor={-2}
            />
          </mesh>
        </>
      ) : null}
    </group>
  );
}

// Warm the drei GLTF cache so the fleet is decoded before the first lesson mounts
// (Draco decode happens off the render path). Matches HeroCarBody's preload.
useGLTF.preload(FLEET_URLS, DRACO_DECODER_PATH);
