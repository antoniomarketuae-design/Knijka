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
 *    along residential/arterial curbs so the streets aren't deserted (still the
 *    interim box car — GLB upgrade deferred to keep those always-on draws cheap).
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
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Object3D,
  Quaternion,
  Vector3,
  type InstancedMesh,
  type Object3D as AnyObject3D,
} from "three";
import type { SignalPhase } from "../contracts";
import type { TrafficDistrict, TrafficSystem, TrafficUpdateContext } from "./types";
import {
  buildTrafficFleet,
  disposeTrafficFleet,
  DRACO_DECODER_PATH,
  FLEET_URLS,
} from "./vehicleFleet";

// Paint palette — expanded to 10 fictional car colours (brick/blue/sand/slate
// originals + graphite, two silvers, dark green, maroon, muted gold).
const BODY_COLORS = [
  "#b9503f",
  "#4a7dbb",
  "#d8d3c8",
  "#46545d",
  "#2f343a",
  "#8f9499",
  "#b9bec2",
  "#3c5f3a",
  "#7a2f2a",
  "#c6a23e",
];
const PED_COLORS = ["#b8895a", "#6d8a67", "#7a6f9b", "#a0524d"];
const ROOF_COLOR = "#3d454e"; // opaque cabin/roof shell
const GLASS_COLOR = "#0f151d"; // tinted greenhouse glazing
const BRAKE_ON = "#ff2a1a"; // brake pressed
const TAIL_ON = "#7c130b"; // dim tail glow when lights are on at night
const BRAKE_OFF = "#3a0f0b"; // unlit lens (day)
const HEAD_COLOR = "#fff2cf"; // warm headlight glow (night)
const BLINK_ON = "#ff9a1f";
const BLINK_OFF = "#2a1c08";

// Local-space part offsets (nose = +Z). Moving-car body/wheel/lamp offsets now
// come from each GLB model's rig (./vehicleFleet); only the parked interim box
// car and the pedestrian primitives keep hard-coded offsets.
const CABIN_Y = 1.08; // parked box-car cabin
const CABIN_Z = -0.35; // parked box-car cabin
const PED_BODY_Y = 0.82;
const PED_HEAD_Y = 1.52;
const BLOB_Y = 0.03;

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

// ---------------------------------------------------------------------------
// Parked cars — deterministic instanced placement along residential/arterial
// curbs, reusing the district edge polylines + lane-width offset (the same
// curb math the props/sidewalk pass uses). Interim box car; upgrades to the
// GLB kit later. Gated on the optional `district` prop being supplied.
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
const PARK_CAR_HALF_W = 0.95;
const PARK_CAP = 150;

interface ParkedCar {
  x: number;
  y: number;
  yaw: number;
  colorIndex: number;
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

    const offset =
      laneWidthM * Math.max(1, edge.lanes) * 0.5 + PARK_CAR_HALF_W + 0.4;
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
        // Deterministic hash: skip ~1 in 5 slots for natural gaps + pick colour.
        const h = ((e * 73856093) ^ (slot * 19349663)) >>> 0;
        if (h % 5 !== 0) {
          out.push({
            x: ax + dx * t + nx * offset,
            y: ay + dy * t + ny * offset,
            yaw: Math.atan2(dx, -dy),
            colorIndex: h % BODY_COLORS.length,
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
  /** Lane width used to offset parked cars to the curb (default 3.25 m). */
  laneWidthM?: number;
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
  laneWidthM = 3.25,
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
  const pedBlobRef = useRef<InstancedMesh>(null);
  const pedBodyRef = useRef<InstancedMesh>(null);
  const pedHeadRef = useRef<InstancedMesh>(null);

  // Authored GLB fleet: load the kit (Draco), then instance it. Rebuilt only on
  // remount / system swap; disposed (buffers + merged geometry) on teardown.
  const gltfs = useGLTF(FLEET_URLS, DRACO_DECODER_PATH) as unknown as Array<{
    scene: AnyObject3D;
  }>;
  const fleet = useMemo(
    () => buildTrafficFleet(gltfs.map((g) => g.scene), system.vehicles),
    [gltfs, system],
  );
  useEffect(() => () => disposeTrafficFleet(fleet), [fleet]);
  // Parked (static).
  const parkBodyRef = useRef<InstancedMesh>(null);
  const parkCabinRef = useRef<InstancedMesh>(null);
  const parkGlassRef = useRef<InstancedMesh>(null);

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
    scratchRef.current = {
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
      qYaw: new Quaternion(),
      qRoll: new Quaternion(),
      qWheel: new Quaternion(),
      qFlat,
      qBlob: new Quaternion(),
      ctx: { signalPhase: () => "green", playerPos: null },
    };
    // Bodies/wheels (the GLB fleet) manage their own draw usage; only the
    // code-geometry overlays need the dynamic hint here.
    const dynamic = [
      vehBlobRef,
      brakeRef,
      headRef,
      blinkRef,
      pedBlobRef,
      pedBodyRef,
      pedHeadRef,
    ];
    for (const ref of dynamic) {
      ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    const pedBody = pedBodyRef.current;
    if (pedBody) {
      for (let i = 0; i < nPed; i++) {
        pedBody.setColorAt(i, color.set(PED_COLORS[system.pedestrians[i].colorIndex % PED_COLORS.length]));
      }
      if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;
    }
  }, [system, nVeh, nPed]);

  // Parked cars: static — placed once (and whenever the placement changes).
  useLayoutEffect(() => {
    const parkBody = parkBodyRef.current;
    const parkCabin = parkCabinRef.current;
    const parkGlass = parkGlassRef.current;
    if (!parkBody || nPark === 0) return;
    const dummy = new Object3D();
    const color = new Color();
    for (let i = 0; i < nPark; i++) {
      const c = parked[i];
      const tx = c.x;
      const tz = -c.y;
      const cos = Math.cos(c.yaw);
      const sin = Math.sin(c.yaw);
      dummy.scale.set(1, 1, 1);
      dummy.rotation.set(0, c.yaw, 0);
      dummy.position.set(tx, 0.62, tz);
      dummy.updateMatrix();
      parkBody.setMatrixAt(i, dummy.matrix);
      parkBody.setColorAt(i, color.set(BODY_COLORS[c.colorIndex % BODY_COLORS.length]));
      dummy.position.set(tx + CABIN_Z * sin, CABIN_Y, tz + CABIN_Z * cos);
      dummy.updateMatrix();
      parkCabin?.setMatrixAt(i, dummy.matrix);
      parkGlass?.setMatrixAt(i, dummy.matrix);
    }
    parkBody.instanceMatrix.needsUpdate = true;
    if (parkBody.instanceColor) parkBody.instanceColor.needsUpdate = true;
    if (parkCabin) parkCabin.instanceMatrix.needsUpdate = true;
    if (parkGlass) parkGlass.instanceMatrix.needsUpdate = true;
  }, [parked, nPark]);

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

    // --- Pedestrians.
    const pedBlob = pedBlobRef.current;
    const pedBody = pedBodyRef.current;
    const pedHead = pedHeadRef.current;
    if (pedBlob && pedBody && pedHead) {
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
          pedBody.setMatrixAt(i, dummy.matrix);
          pedHead.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const bob = p.speedMps > 0.01 ? Math.sin(p.walkPhase) * 0.04 : 0;
        const yaw = Math.atan2(p.dirX, -p.dirY);
        // Blob (round, laid flat).
        dummy.quaternion.copy(scratch.qFlat);
        dummy.scale.set(0.42, 0.42, 1);
        dummy.position.set(tx, BLOB_Y, tz);
        dummy.updateMatrix();
        pedBlob.setMatrixAt(i, dummy.matrix);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, yaw, 0);
        dummy.position.set(tx, PED_BODY_Y + bob, tz);
        dummy.updateMatrix();
        pedBody.setMatrixAt(i, dummy.matrix);
        dummy.position.set(tx, PED_HEAD_Y + bob, tz);
        dummy.updateMatrix();
        pedHead.setMatrixAt(i, dummy.matrix);
      }
      pedBlob.instanceMatrix.needsUpdate = true;
      pedBody.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;
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

      {/* Pedestrians. */}
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
      <instancedMesh ref={pedBodyRef} args={[undefined, undefined, nPed]} frustumCulled={false} castShadow>
        <capsuleGeometry args={[0.22, 0.75, 3, 8]} />
        <meshStandardMaterial color="#ffffff" roughness={0.85} />
      </instancedMesh>
      <instancedMesh ref={pedHeadRef} args={[undefined, undefined, nPed]} frustumCulled={false} castShadow>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color="#c9a184" roughness={0.85} />
      </instancedMesh>

      {/* Parked cars along the curbs (deterministic, static) — only when a
          district is supplied. */}
      {nPark > 0 ? (
        <>
          <instancedMesh ref={parkBodyRef} args={[undefined, undefined, nPark]} frustumCulled={false} castShadow>
            <boxGeometry args={[1.76, 0.62, 4.1]} />
            <meshStandardMaterial color="#ffffff" roughness={0.5} metalness={0.25} />
          </instancedMesh>
          <instancedMesh ref={parkCabinRef} args={[undefined, undefined, nPark]} frustumCulled={false} castShadow>
            <boxGeometry args={[1.55, 0.55, 2.05]} />
            <meshStandardMaterial color={ROOF_COLOR} roughness={0.55} metalness={0.25} />
          </instancedMesh>
          <instancedMesh ref={parkGlassRef} args={[undefined, undefined, nPark]} frustumCulled={false}>
            <boxGeometry args={[1.4, 0.5, 1.86]} />
            <meshStandardMaterial
              color={GLASS_COLOR}
              roughness={0.08}
              metalness={0.1}
              transparent
              opacity={0.62}
              side={DoubleSide}
            />
          </instancedMesh>
        </>
      ) : null}
    </group>
  );
}

// Warm the drei GLTF cache so the fleet is decoded before the first lesson mounts
// (Draco decode happens off the render path). Matches HeroCarBody's preload.
useGLTF.preload(FLEET_URLS, DRACO_DECODER_PATH);
