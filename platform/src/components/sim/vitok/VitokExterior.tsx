"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import type { MeshStandardMaterial, Object3D, SpotLight as ThreeSpotLight } from "three";
import type { VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { CabinControls } from "../cabin";
import { BODY_OFFSET, BODY_SCALE, BODY_URL } from "./parts";

// Lamp positions (chassis-local). Body front/rear faces land exactly on the
// collider ends (z ±2.02) after BODY_SCALE/BODY_OFFSET, so lamps sit at ±2.03.
const LAMP_Z_FRONT = 2.03;
const LAMP_Z_REAR = -2.03;

type Mat = MeshStandardMaterial | null;

/**
 * „Виток" exterior: the CC0 base body (baked wheels hidden — wheels are
 * driven from physics in VitokWheels), plus our lamp set and door mirrors.
 *
 * Working lights, all driven per frame through material refs (zero React
 * state, zero re-renders):
 *  - brake lamps  — lit exactly when the physics state machine is braking
 *    (S while rolling forward, or W while rolling backwards),
 *  - reverse lamp — lit while the cosmetic gear shows R,
 *  - indicators   — front+rear amber per side on the shared 600 ms cabin
 *    blink clock (same phase as the dashboard arrows),
 *  - head/tail    — emissive lamps at low/high beam + max TWO real
 *    spotlights (the scene's entire dynamic-light budget for the car).
 */
export function VitokExterior({
  simRef,
  inputRef,
  cabinRef,
}: {
  simRef: RefObject<VehicleSim | null>;
  inputRef: RefObject<SimInput | null>;
  cabinRef: RefObject<CabinControls | null>;
}) {
  const gltf = useGLTF(BODY_URL);
  const body = useMemo(() => {
    const s = gltf.scene.clone(true);
    // The source model ships baked wheel nodes; physics-driven wheels replace them.
    s.traverse((o: Object3D) => {
      if (o.name.startsWith("wheel")) o.visible = false;
    });
    return s;
  }, [gltf]);

  // Lamp materials by FUNCTION (mutated per frame via refs).
  const headMats = useRef<Mat[]>([null, null]);
  const brakeMats = useRef<Mat[]>([null, null]);
  const indLeftMats = useRef<Mat[]>([null, null]); // front, rear
  const indRightMats = useRef<Mat[]>([null, null]);
  const reverseMat = useRef<Mat>(null);

  const spotL = useRef<ThreeSpotLight>(null);
  const spotR = useRef<ThreeSpotLight>(null);
  const targetL = useRef<Object3D>(null);
  const targetR = useRef<Object3D>(null);

  useEffect(() => {
    if (spotL.current && targetL.current) spotL.current.target = targetL.current;
    if (spotR.current && targetR.current) spotR.current.target = targetR.current;
  }, []);

  useFrame(() => {
    const sim = simRef.current;
    const cabin = cabinRef.current;
    const input = inputRef.current?.read() ?? null;
    if (!sim) return;
    const speed = sim.speedKmh;

    // Brake lamps mirror VehicleSim's throttle/brake/reverse state machine:
    // the pedal that actually BRAKES lights the lamp.
    let braking = false;
    if (input) {
      if (input.throttle > 0) braking = speed < -0.5;
      else if (input.brake > 0) braking = speed > 0.5;
    }
    const lights = cabin?.headlights ?? "off";
    const tail = lights !== "off";
    const set = (mats: Mat[], v: number) => {
      for (const m of mats) if (m) m.emissiveIntensity = v;
    };
    set(brakeMats.current, braking ? 3.4 : tail ? 0.8 : 0.05);
    if (reverseMat.current) reverseMat.current.emissiveIntensity = sim.gear === "R" ? 2.6 : 0.05;

    const blink = cabin?.blinkOn ?? false;
    set(indLeftMats.current, blink && cabin?.indicator === "left" ? 3.2 : 0.05);
    set(indRightMats.current, blink && cabin?.indicator === "right" ? 3.2 : 0.05);

    set(headMats.current, lights === "off" ? 0.05 : lights === "low" ? 1.8 : 3.2);

    // Headlight spotlights (2 = the whole budget). Low: short, wide, warm,
    // dipped onto the tarmac. High: long, narrow, cold, lifted.
    const high = lights === "high";
    for (const [spot, target, side] of [
      [spotL.current, targetL.current, 1],
      [spotR.current, targetR.current, -1],
    ] as const) {
      if (!spot || !target) continue;
      spot.visible = lights !== "off";
      if (!spot.visible) continue;
      spot.intensity = high ? 120 : 45;
      spot.angle = high ? 0.38 : 0.55;
      spot.distance = high ? 85 : 38;
      spot.color.set(high ? "#eef4ff" : "#ffedc2");
      target.position.set(side * 0.45, high ? -0.2 : -0.58, high ? 45 : 14);
    }
  });

  return (
    <group>
      {/* dispose={null}: the clone shares geometry/materials with drei's
          GLTF cache — R3F must not dispose them on restart remounts. */}
      <primitive
        object={body}
        dispose={null}
        position={[BODY_OFFSET[0], BODY_OFFSET[1], BODY_OFFSET[2]]}
        scale={[BODY_SCALE[0], BODY_SCALE[1], BODY_SCALE[2]]}
      />

      {/* Head lamps */}
      <mesh position={[0.55, -0.08, LAMP_Z_FRONT]}>
        <boxGeometry args={[0.3, 0.11, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            headMats.current[0] = m;
          }}
          color="#e8ecef"
          emissive="#fff3c8"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[-0.55, -0.08, LAMP_Z_FRONT]}>
        <boxGeometry args={[0.3, 0.11, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            headMats.current[1] = m;
          }}
          color="#e8ecef"
          emissive="#fff3c8"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Indicators — front + rear per side (+X = left side of the car) */}
      <mesh position={[0.74, -0.1, LAMP_Z_FRONT]}>
        <boxGeometry args={[0.1, 0.09, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            indLeftMats.current[0] = m;
          }}
          color="#b06414"
          emissive="#ffa022"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[-0.74, -0.1, LAMP_Z_FRONT]}>
        <boxGeometry args={[0.1, 0.09, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            indRightMats.current[0] = m;
          }}
          color="#b06414"
          emissive="#ffa022"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0.76, 0.0, LAMP_Z_REAR]}>
        <boxGeometry args={[0.11, 0.1, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            indLeftMats.current[1] = m;
          }}
          color="#b06414"
          emissive="#ffa022"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[-0.76, 0.0, LAMP_Z_REAR]}>
        <boxGeometry args={[0.11, 0.1, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            indRightMats.current[1] = m;
          }}
          color="#b06414"
          emissive="#ffa022"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Brake/tail clusters */}
      <mesh position={[0.58, 0.0, LAMP_Z_REAR]}>
        <boxGeometry args={[0.22, 0.12, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            brakeMats.current[0] = m;
          }}
          color="#7a1010"
          emissive="#ff2211"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[-0.58, 0.0, LAMP_Z_REAR]}>
        <boxGeometry args={[0.22, 0.12, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            brakeMats.current[1] = m;
          }}
          color="#7a1010"
          emissive="#ff2211"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Reverse lamp — right-hand rear (right = -X) */}
      <mesh position={[-0.42, 0.0, LAMP_Z_REAR]}>
        <boxGeometry args={[0.1, 0.09, 0.05]} />
        <meshStandardMaterial
          ref={(m) => {
            reverseMat.current = m;
          }}
          color="#cfd4d9"
          emissive="#ffffff"
          emissiveIntensity={0.05}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>

      {/* Door mirror housings (glance targets; glass faces rearward) */}
      {([1, -1] as const).map((side) => (
        <group key={side} position={[side * 0.9, 0.28, 0.55]}>
          <mesh position={[side * -0.05, 0, 0]}>
            <boxGeometry args={[0.1, 0.03, 0.04]} />
            <meshStandardMaterial color="#161a20" roughness={0.8} />
          </mesh>
          <mesh>
            <boxGeometry args={[0.16, 0.11, 0.055]} />
            <meshStandardMaterial color="#161a20" roughness={0.8} />
          </mesh>
          <mesh position={[0, 0, -0.03]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[0.13, 0.085]} />
            <meshStandardMaterial color="#5b6b85" roughness={0.15} metalness={0.85} />
          </mesh>
        </group>
      ))}

      {/* Headlight spotlights + their aim targets (children of the chassis,
          so they follow the interpolated body pose). */}
      <spotLight
        ref={spotL}
        position={[0.55, -0.08, LAMP_Z_FRONT]}
        visible={false}
        penumbra={0.55}
        decay={1.2}
      />
      <spotLight
        ref={spotR}
        position={[-0.55, -0.08, LAMP_Z_FRONT]}
        visible={false}
        penumbra={0.55}
        decay={1.2}
      />
      <object3D ref={targetL} position={[0.45, -0.58, 14]} />
      <object3D ref={targetR} position={[-0.45, -0.58, 14]} />
    </group>
  );
}

useGLTF.preload(BODY_URL);
