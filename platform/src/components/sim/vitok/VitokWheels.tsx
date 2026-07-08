"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { Object3D } from "three";
import {
  STEERED_WHEELS,
  SUSPENSION_REST_LENGTH,
  WHEEL_POSITIONS,
  type VehicleSim,
} from "@/modules/sim/vehicle";
import { WHEEL_ANCHORS, WHEEL_SCALE, WHEEL_URL } from "./parts";

/**
 * Four physics-bound wheels (position + steer + spin), index-matched to
 * tuning.WHEEL_POSITIONS (FL, FR, RL, RR).
 *
 * Hierarchy per wheel: pivot (suspension travel + steer yaw) -> spin
 * (rolling about the +X axle) -> orient (rotates right-side wheels 180° so
 * the rim face points outward WITHOUT flipping the spin direction — the
 * mirror lives BELOW the spin node) -> the CC0 wheel mesh.
 *
 * SIGN CONVENTIONS (verified headlessly against the real rapier physics,
 * 2026-07: wheelRotation measured 0 -> +94.6 rad over 4 s of forward
 * driving and decreasing in reverse):
 *  - rapier's accumulated wheelRotation is POSITIVE rolling forward;
 *  - rolling forward (+Z) is a NEGATIVE rotation about the +X axle
 *    (ω × r = v with r = (0,-R,0), v = +Z ⇒ ω = -v/R about +X);
 *  => spin.rotation.x = -wheelRotationRad.
 *  - steer input +1 (left) measured steerRad = +0.55 with the chassis yawing
 *    toward car-left (+X); pivot.rotation.y = +steerRad yaws the wheel the
 *    same way.
 */
export function VitokWheels({ simRef }: { simRef: RefObject<VehicleSim | null> }) {
  const gltf = useGLTF(WHEEL_URL);
  // Clones share geometry + material: 4 wheels, 1 material, 4 draw calls.
  const instances = useMemo(
    () => WHEEL_ANCHORS.map(() => gltf.scene.clone(true)),
    [gltf],
  );

  const pivots = useRef<(Object3D | null)[]>([null, null, null, null]);
  const spins = useRef<(Object3D | null)[]>([null, null, null, null]);

  useFrame(() => {
    const sim = simRef.current;
    if (!sim) return;
    for (let i = 0; i < WHEEL_ANCHORS.length; i++) {
      const pivot = pivots.current[i];
      const spin = spins.current[i];
      const anchor = WHEEL_ANCHORS[i];
      const p = WHEEL_POSITIONS[i];
      if (!pivot || !spin || !anchor || !p) continue;
      pivot.position.set(anchor.x, p.y - sim.wheelSuspensionLength(i), anchor.z);
      pivot.rotation.y = (STEERED_WHEELS as readonly number[]).includes(i) ? sim.steerRad : 0;
      spin.rotation.x = -sim.wheelRotationRad(i);
    }
  });

  return (
    <group>
      {instances.map((obj, i) => {
        const anchor = WHEEL_ANCHORS[i];
        const p = WHEEL_POSITIONS[i];
        if (!anchor || !p) return null;
        const isRightSide = anchor.x < 0;
        return (
          <group
            key={i}
            ref={(el) => {
              pivots.current[i] = el;
            }}
            position={[anchor.x, p.y - SUSPENSION_REST_LENGTH, anchor.z]}
          >
            <group
              ref={(el) => {
                spins.current[i] = el;
              }}
            >
              {/* dispose={null}: clones share geometry/materials with drei's
                  GLTF cache — must survive restart remounts. */}
              <group rotation={[0, isRightSide ? Math.PI : 0, 0]} scale={WHEEL_SCALE}>
                <primitive object={obj} dispose={null} />
              </group>
            </group>
          </group>
        );
      })}
    </group>
  );
}

useGLTF.preload(WHEEL_URL);
