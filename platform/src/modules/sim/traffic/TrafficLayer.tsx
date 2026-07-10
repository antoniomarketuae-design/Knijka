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
 *  - replaces the interim box car with the authored low-poly GLB fleet
 *    (./vehicleFleet): each agent is assigned a model deterministically from its
 *    id (police rare), same-model agents share an InstancedMesh, and ALL wheels
 *    are one shared InstancedMesh (spun/steered per frame) — so real cars cost a
 *    fixed handful of draws, not one per agent,
 *  - and (when the district is supplied) drops a deterministic parked-car pass
 *    along residential/arterial curbs so the streets aren't deserted.
 *
 * A5 visual-floor pass (doc 68): the parked cars are now the same GLB kit as
 * the moving fleet — static per-model InstancedMeshes (civilian models only)
 * + a static shared wheel mesh + blob shadows, placed once. Pedestrians are
 * articulated: six instanced parts (torso, head, 2 arms, 2 legs) with a
 * counter-phase leg/arm swing driven by each agent's walkPhase/speed, and
 * deterministic per-id height/build variation. The layer also renders the L5
 * sudden-obstacle stimulus (a bright ball darting across the road) when the
 * lesson supplies `hazard` — dormant until the A8 orchestrator flips
 * `hazardActiveRef` true.
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
  DynamicDrawUsage,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
  type InstancedMesh,
  type Mesh,
  type Object3D as AnyObject3D,
} from "three";
import {
  PERCEPTUAL_ROAD_SCALE,
  type HazardStimulusSpec,
  type SignalPhase,
} from "../contracts";
import type { TrafficDistrict, TrafficSystem, TrafficUpdateContext } from "./types";
import {
  assignCivilianModel,
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET_URLS,
} from "./vehicleFleet";

// Pedestrian palettes: tops (existing 4 variants) + trousers per variant.
const PED_COLORS = ["#b8895a", "#6d8a67", "#7a6f9b", "#a0524d"];
const PED_LEG_COLORS = ["#3a4150", "#4d4439", "#565a5f", "#2f3a4a"];
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
const PED_HEAD_Y = 1.6;
const PED_SHOULDER_HALF = 0.21; // arm lateral offset from spine
const PED_HIP_HALF = 0.09; // leg lateral offset from spine
const PED_LEG_SWING_RAD = 0.55;
const PED_ARM_SWING_RAD = 0.3;
/** Walking speed (m/s) at which the swing reaches full amplitude. */
const PED_SWING_FULL_SPEED_MPS = 1.1;

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

interface ParkedCar {
  x: number;
  y: number;
  yaw: number;
  /** Fleet model index (civilian pool only — no parked police cruisers). */
  model: number;
}

function computeParkedCars(
  district: TrafficDistrict,
  laneWidthM: number,
): ParkedCar[] {
  const out: ParkedCar[] = [];
  const edges = district.roads?.edges ?? [];
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    if (edge.roundabout) continue;
    if (!PARK_CLASSES.has(edge.class)) continue;
    const geo = edge.geometry;
    if (!geo || geo.length < 2) continue;

    // Total polyline length.
    let total = 0;
    for (let s = 0; s < geo.length - 1; s++) {
      total += Math.hypot(geo[s + 1][0] - geo[s][0], geo[s + 1][1] - geo[s][1]);
    }
    if (total < 2 * PARK_END_MARGIN_M + PARK_SPACING_M) continue;

    const offset = laneWidthM * Math.max(1, edge.lanes) * 0.5 + PARK_BAND_CENTER_M;
    const stop = total - PARK_END_MARGIN_M;
    let nextAt = PARK_END_MARGIN_M;
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
        // Deterministic hash: skip ~1 in 5 slots for natural gaps + pick model.
        const h = ((e * 73856093) ^ (slot * 19349663)) >>> 0;
        if (h % 5 !== 0) {
          out.push({
            x: ax + dx * t + nx * offset,
            y: ay + dy * t + ny * offset,
            yaw: Math.atan2(dx, -dy),
            model: assignCivilianModel(h),
          });
          if (out.length >= PARK_CAP) return out;
        }
        nextAt += PARK_SPACING_M;
        slot++;
      }
      arc += segLen;
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
  hazard = null,
  hazardActiveRef,
}: TrafficLayerProps) {
  const nVeh = system.vehicles.length;
  const nPed = system.pedestrians.length;

  const parked = useMemo(
    () => (district ? computeParkedCars(district, laneWidthM) : []),
    [district, laneWidthM],
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
  // L5 hazard ball (single mesh — one per lesson at most).
  const hazardBallRef = useRef<Mesh>(null);
  const hazardBlobRef = useRef<Mesh>(null);

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
        parked.map((p) => p.model),
      ),
    [gltfs, system, parked],
  );
  useEffect(() => () => disposeTrafficFleet(fleet), [fleet]);
  // Parked-car blob shadows (static, placed with the parked pass).
  const parkBlobRef = useRef<InstancedMesh>(null);

  // Pedestrian part geometries — origin baked at the joint (shoulder/hip) so
  // one instance matrix swings the limb; torso origin at the hips. Owned here,
  // disposed on unmount.
  const pedGeoms = useMemo(() => {
    const torso = new CapsuleGeometry(0.155, 0.44, 4, 10);
    torso.translate(0, 0.375, 0); // origin at the hips, extends up
    const head = new SphereGeometry(0.135, 10, 8);
    const arm = new CapsuleGeometry(0.048, 0.5, 3, 8);
    arm.translate(0, -0.298, 0); // origin at the shoulder, hangs down
    const leg = new CapsuleGeometry(0.068, 0.62, 3, 8);
    leg.translate(0, -0.378, 0); // origin at the hip, hangs down
    return { torso, head, arm, leg };
  }, []);
  useEffect(
    () => () => {
      pedGeoms.torso.dispose();
      pedGeoms.head.dispose();
      pedGeoms.arm.dispose();
      pedGeoms.leg.dispose();
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
    // L5 hazard animation clock (seconds since hazardActiveRef went true).
    hazardT: number;
    // Reused rotation scratch.
    qYaw: Quaternion;
    qRoll: Quaternion; // wheel roll about local X
    qWheel: Quaternion;
    qFlat: Quaternion; // Rx(-90): lays a decal flat on the ground
    qBlob: Quaternion;
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
      hazardT: 0,
      qYaw: new Quaternion(),
      qRoll: new Quaternion(),
      qWheel: new Quaternion(),
      qFlat,
      qBlob: new Quaternion(),
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
      const top = PED_COLORS[p.colorIndex % PED_COLORS.length];
      torso?.setColorAt(i, color.set(top));
      color.set(top).multiplyScalar(0.92); // sleeves a touch darker
      arm?.setColorAt(i * 2, color);
      arm?.setColorAt(i * 2 + 1, color);
      color.set(PED_LEG_COLORS[p.colorIndex % PED_LEG_COLORS.length]);
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
      // Body (GLB authored ground-relative — origin on the tarmac).
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.position.set(tx, 0, tz);
      dummy.updateMatrix();
      mesh?.setMatrixAt(s, dummy.matrix);
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

        // Model + its rig (body InstancedMesh, wheel offsets, lamp placement).
        const model = fleet.models[fleet.assign[i]];
        const rig = model.rig;
        const bodyMesh = model.mesh;
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
          vehBlob.setMatrixAt(i, dummy.matrix);
          brake.setMatrixAt(i, dummy.matrix);
          head.setMatrixAt(i, dummy.matrix);
          blink.setMatrixAt(i * 2, dummy.matrix);
          blink.setMatrixAt(i * 2 + 1, dummy.matrix);
          for (let w = 0; w < 4; w++) wheel.setMatrixAt(i * 4 + w, dummy.matrix);
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

        // Body (GLB is authored ground-relative — origin on the tarmac at Y = 0).
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, yaw, 0);
        dummy.position.set(tx, 0, tz);
        dummy.updateMatrix();
        bodyMesh?.setMatrixAt(s, dummy.matrix);

        // Tail/brake bar (rear, per-model Z).
        dummy.position.set(tx + rig.rearZ * sin, rig.lampY, tz + rig.rearZ * cos);
        dummy.updateMatrix();
        brake.setMatrixAt(i, dummy.matrix);
        // Headlight bar (front) — only drawn at night, matrix kept fresh anyway.
        dummy.position.set(tx + rig.frontZ * sin, rig.headY, tz + rig.frontZ * cos);
        dummy.updateMatrix();
        head.setMatrixAt(i, dummy.matrix);
        // Rear blinker lamps (index 2i = left +X, 2i+1 = right -X).
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
        // Wheels: shared X-axial geometry, scaled to the model radius —
        // qYaw(+steer on fronts) * roll about local X. No cylinder tip needed.
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
          wheel.setMatrixAt(i * 4 + w, dummy.matrix);
        }

        // Tail-lamp colour: braking > night-tail > unlit. Cache the state key
        // so the colour buffer only rewrites on change.
        const tailKey = v.braking ? 2 : night ? 1 : 0;
        if (scratch.brakeState[i] !== tailKey) {
          scratch.brakeState[i] = tailKey;
          brake.setColorAt(i, color.set(tailKey === 2 ? BRAKE_ON : tailKey === 1 ? TAIL_ON : BRAKE_OFF));
          if (brake.instanceColor) brake.instanceColor.needsUpdate = true;
        }

        // Blinkers: |steer| over threshold arms the side; sign picks left/right.
        const turnLeft = steer > BLINK_STEER_THRESH;
        const turnRight = steer < -BLINK_STEER_THRESH;
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
    if (pedBlob && pedTorso && pedHead && pedArm && pedLeg) {
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
          continue;
        }
        const hgt = scratch.pedHeight[i];
        const bld = scratch.pedBuild[i];
        const bob = p.speedMps > 0.01 ? Math.sin(p.walkPhase) * 0.04 : 0;
        const yaw = Math.atan2(p.dirX, -p.dirY);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
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
        // Torso (origin at the hips).
        dummy.rotation.set(0, yaw, 0);
        dummy.scale.set(bld, hgt, bld);
        dummy.position.set(tx, PED_HIP_Y * hgt + bob, tz);
        dummy.updateMatrix();
        pedTorso.setMatrixAt(i, dummy.matrix);
        // Head (constant size — height variation reads through the joints).
        dummy.scale.set(1, 1, 1);
        dummy.position.set(tx, PED_HEAD_Y * hgt + bob, tz);
        dummy.updateMatrix();
        pedHead.setMatrixAt(i, dummy.matrix);
        // Limbs: instance = yaw · swing about the local side axis; geometry is
        // origin-at-joint so the same matrix places AND swings. Left limbs at
        // 2i, right at 2i+1; arms counter-swing their side's leg.
        scratch.qYaw.setFromAxisAngle(UP, yaw);
        for (let side = 0; side < 2; side++) {
          const sign = side === 0 ? 1 : -1;
          const armX = sign * PED_SHOULDER_HALF * bld;
          const legX = sign * PED_HIP_HALF * bld;
          // Arm.
          scratch.qRoll.setFromAxisAngle(AXIS_X, -sign * swing * PED_ARM_SWING_RAD);
          scratch.qWheel.copy(scratch.qYaw).multiply(scratch.qRoll);
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
      }
      pedBlob.instanceMatrix.needsUpdate = true;
      pedTorso.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;
      pedArm.instanceMatrix.needsUpdate = true;
      pedLeg.instanceMatrix.needsUpdate = true;
    }

    // --- L5 hazard ball (render-only; A8 owns the trigger).
    const ball = hazardBallRef.current;
    const ballBlob = hazardBlobRef.current;
    if (hazard && ball && ballBlob) {
      if (hazardActiveRef?.current) {
        scratch.hazardT += dtc;
        const travelled = Math.min(hazard.speedMps * scratch.hazardT, hazard.travelM);
        const rolling = travelled < hazard.travelM;
        const bounce = rolling
          ? Math.abs(Math.sin((travelled / HAZARD_BOUNCE_WAVELENGTH_M) * Math.PI)) *
            HAZARD_BOUNCE_HEIGHT_M
          : 0;
        const bx = hazard.x + hazard.dirX * travelled;
        const by = hazard.y + hazard.dirY * travelled;
        ball.visible = true;
        ballBlob.visible = true;
        ball.position.set(bx, HAZARD_BALL_RADIUS_M + bounce, -by);
        ballBlob.position.set(bx, BLOB_Y, -by);
      } else {
        scratch.hazardT = 0;
        ball.visible = false;
        ballBlob.visible = false;
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

      {/* L5 sudden-obstacle ball — hidden until the A8 orchestrator flips
          hazardActiveRef; mounted only when the lesson stages a hazard. */}
      {hazard ? (
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
