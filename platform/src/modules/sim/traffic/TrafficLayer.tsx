"use client";

/**
 * TrafficLayer — instanced R3F presentation for the traffic system.
 *
 * Draw-call budget: 6 instanced draws total (vehicle bodies, cabins, wheels,
 * brake-light bars, pedestrian bodies, pedestrian heads), regardless of agent
 * count. Low-poly primitives in the district's muted palette; brake bars are
 * unlit so they read as lights. Agents beyond `maxDrawDistanceM` from the
 * camera are culled by writing a zero-scale matrix (no scene-graph churn).
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

import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, DynamicDrawUsage, Object3D, type InstancedMesh, type Object3D as AnyObject3D } from "three";
import type { SignalPhase } from "../contracts";
import type { TrafficSystem, TrafficUpdateContext } from "./types";

const BODY_COLORS = ["#b9503f", "#4a7dbb", "#d8d3c8", "#46545d"];
const PED_COLORS = ["#b8895a", "#6d8a67", "#7a6f9b", "#a0524d"];
const BRAKE_ON = "#ff2a1a";
const BRAKE_OFF = "#4a120d";

// Local-space part offsets (nose = +Z).
const CABIN_Y = 1.08;
const CABIN_Z = -0.35;
const WHEEL_X = 0.74;
const WHEEL_Y = 0.3;
const WHEEL_Z = 1.32;
const BRAKE_Y = 0.72;
const BRAKE_Z = -2.03;
const PED_BODY_Y = 0.82;
const PED_HEAD_Y = 1.52;

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
}

export function TrafficLayer({
  system,
  runtime,
  playerRef,
  playerSpeedKmhRef,
  playerHeadingDegRef,
  maxDrawDistanceM = 150,
}: TrafficLayerProps) {
  const nVeh = system.vehicles.length;
  const nPed = system.pedestrians.length;

  const bodyRef = useRef<InstancedMesh>(null);
  const cabinRef = useRef<InstancedMesh>(null);
  const wheelRef = useRef<InstancedMesh>(null);
  const brakeRef = useRef<InstancedMesh>(null);
  const pedBodyRef = useRef<InstancedMesh>(null);
  const pedHeadRef = useRef<InstancedMesh>(null);

  // Reused mutable scratch — lives in a ref (the frame loop mutates it every
  // frame, which render-scoped useMemo values must not do) and is (re)built
  // in the layout effect below.
  interface Scratch {
    dummy: Object3D;
    color: Color;
    playerPos: { x: number; y: number };
    brakeState: Int8Array;
    ctx: TrafficUpdateContext;
  }
  const scratchRef = useRef<Scratch | null>(null);

  // Bound once per runtime — the frame loop must not allocate closures.
  const boundSignalPhase = useMemo(
    () => (runtime ? (id: string) => runtime.signalPhase(id) : null),
    [runtime],
  );

  // Instanced-buffer setup + scratch (re)build: dynamic usage, per-instance
  // colors, brake state sized to the vehicle count.
  useLayoutEffect(() => {
    const color = new Color();
    scratchRef.current = {
      dummy: new Object3D(),
      color,
      playerPos: { x: 0, y: 0 },
      brakeState: new Int8Array(nVeh).fill(-1), // forces brake-color write
      ctx: { signalPhase: () => "green", playerPos: null },
    };
    const meshes = [bodyRef, cabinRef, wheelRef, brakeRef, pedBodyRef, pedHeadRef];
    for (const ref of meshes) {
      ref.current?.instanceMatrix.setUsage(DynamicDrawUsage);
    }
    const body = bodyRef.current;
    if (body) {
      for (let i = 0; i < nVeh; i++) {
        body.setColorAt(i, color.set(BODY_COLORS[system.vehicles[i].colorIndex % BODY_COLORS.length]));
      }
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
    }
    const pedBody = pedBodyRef.current;
    if (pedBody) {
      for (let i = 0; i < nPed; i++) {
        pedBody.setColorAt(i, color.set(PED_COLORS[system.pedestrians[i].colorIndex % PED_COLORS.length]));
      }
      if (pedBody.instanceColor) pedBody.instanceColor.needsUpdate = true;
    }
  }, [system, nVeh, nPed]);

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

    // --- Vehicles.
    const body = bodyRef.current;
    const cabin = cabinRef.current;
    const wheel = wheelRef.current;
    const brake = brakeRef.current;
    if (body && cabin && wheel && brake) {
      for (let i = 0; i < nVeh; i++) {
        const v = system.vehicles[i];
        const tx = v.x;
        const tz = -v.y;
        const dx = tx - cam.x;
        const dz = tz - cam.z;
        const visible = dx * dx + dz * dz <= maxD2;
        if (!visible) {
          dummy.position.set(tx, 0, tz);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          body.setMatrixAt(i, dummy.matrix);
          cabin.setMatrixAt(i, dummy.matrix);
          brake.setMatrixAt(i, dummy.matrix);
          for (let w = 0; w < 4; w++) wheel.setMatrixAt(i * 4 + w, dummy.matrix);
          continue;
        }
        const yaw = Math.atan2(v.dirX, -v.dirY);
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        dummy.scale.set(1, 1, 1);
        // Body.
        dummy.position.set(tx, 0.62, tz);
        dummy.rotation.set(0, yaw, 0);
        dummy.updateMatrix();
        body.setMatrixAt(i, dummy.matrix);
        // Cabin (local offset rotated by yaw).
        dummy.position.set(tx + CABIN_Z * sin, CABIN_Y, tz + CABIN_Z * cos);
        dummy.updateMatrix();
        cabin.setMatrixAt(i, dummy.matrix);
        // Brake bar.
        dummy.position.set(tx + BRAKE_Z * sin, BRAKE_Y, tz + BRAKE_Z * cos);
        dummy.updateMatrix();
        brake.setMatrixAt(i, dummy.matrix);
        // Wheels (cylinder axis Y -> roll to lateral X, then yaw).
        dummy.rotation.set(0, yaw, Math.PI / 2);
        for (let w = 0; w < 4; w++) {
          const ox = w % 2 === 0 ? WHEEL_X : -WHEEL_X;
          const oz = w < 2 ? WHEEL_Z : -WHEEL_Z;
          dummy.position.set(tx + ox * cos + oz * sin, WHEEL_Y, tz - ox * sin + oz * cos);
          dummy.updateMatrix();
          wheel.setMatrixAt(i * 4 + w, dummy.matrix);
        }
        // Brake light state (only rewrite the color buffer on change).
        const braking = v.braking ? 1 : 0;
        if (scratch.brakeState[i] !== braking) {
          scratch.brakeState[i] = braking;
          brake.setColorAt(i, color.set(braking ? BRAKE_ON : BRAKE_OFF));
          if (brake.instanceColor) brake.instanceColor.needsUpdate = true;
        }
      }
      body.instanceMatrix.needsUpdate = true;
      cabin.instanceMatrix.needsUpdate = true;
      wheel.instanceMatrix.needsUpdate = true;
      brake.instanceMatrix.needsUpdate = true;
    }

    // --- Pedestrians.
    const pedBody = pedBodyRef.current;
    const pedHead = pedHeadRef.current;
    if (pedBody && pedHead) {
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
          pedBody.setMatrixAt(i, dummy.matrix);
          pedHead.setMatrixAt(i, dummy.matrix);
          continue;
        }
        const bob = p.speedMps > 0.01 ? Math.sin(p.walkPhase) * 0.04 : 0;
        const yaw = Math.atan2(p.dirX, -p.dirY);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, yaw, 0);
        dummy.position.set(tx, PED_BODY_Y + bob, tz);
        dummy.updateMatrix();
        pedBody.setMatrixAt(i, dummy.matrix);
        dummy.position.set(tx, PED_HEAD_Y + bob, tz);
        dummy.updateMatrix();
        pedHead.setMatrixAt(i, dummy.matrix);
      }
      pedBody.instanceMatrix.needsUpdate = true;
      pedHead.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group>
      <instancedMesh ref={bodyRef} args={[undefined, undefined, nVeh]} frustumCulled={false}>
        <boxGeometry args={[1.76, 0.62, 4.1]} />
        <meshLambertMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={cabinRef} args={[undefined, undefined, nVeh]} frustumCulled={false}>
        <boxGeometry args={[1.55, 0.55, 2.05]} />
        <meshLambertMaterial color="#5a6672" />
      </instancedMesh>
      <instancedMesh ref={wheelRef} args={[undefined, undefined, nVeh * 4]} frustumCulled={false}>
        <cylinderGeometry args={[0.3, 0.3, 0.24, 10]} />
        <meshLambertMaterial color="#20242a" />
      </instancedMesh>
      <instancedMesh ref={brakeRef} args={[undefined, undefined, nVeh]} frustumCulled={false}>
        <boxGeometry args={[1.5, 0.14, 0.08]} />
        <meshBasicMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={pedBodyRef} args={[undefined, undefined, nPed]} frustumCulled={false}>
        <capsuleGeometry args={[0.22, 0.75, 3, 8]} />
        <meshLambertMaterial color="#ffffff" />
      </instancedMesh>
      <instancedMesh ref={pedHeadRef} args={[undefined, undefined, nPed]} frustumCulled={false}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshLambertMaterial color="#c9a184" />
      </instancedMesh>
    </group>
  );
}
