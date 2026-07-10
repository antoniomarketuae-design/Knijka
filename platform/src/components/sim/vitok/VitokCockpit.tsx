"use client";

import { useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { SRGBColorSpace, type CanvasTexture, type Group, type Object3D } from "three";
import { COCKPIT_EYE, type VehicleSim } from "@/modules/sim/vehicle";
import type { SimInput } from "@/modules/sim/engine";
import type { CabinControls } from "../cabin";
import {
  CLUSTER_H,
  CLUSTER_W,
  clusterHash,
  drawCluster,
  needleAngleRad,
  type ClusterData,
} from "./cluster";
import { mergedBoxes, steeringWheelGeometry, type BoxSpec } from "./parts";

// ---------------------------------------------------------------------------
// Static interior shell — merged into TWO meshes (plastics + seats) so the
// whole cockpit costs a handful of draw calls. All chassis-local metres;
// ground at rest is y=-0.63, the driver eye sits at COCKPIT_EYE (LHD).
// ---------------------------------------------------------------------------
const SHELL: readonly BoxSpec[] = [
  { size: [1.56, 0.18, 0.3], pos: [0, 0.35, 0.66] }, // dash body
  { size: [1.56, 0.06, 0.16], pos: [0, 0.45, 0.58] }, // dash upper lip
  { size: [0.4, 0.05, 0.2], pos: [0.34, 0.5, 0.62] }, // instrument binnacle hood
  { size: [0.07, 0.07, 0.3], pos: [0.34, 0.22, 0.42], rot: [-0.45, 0, 0] }, // steering column
  { size: [1.56, 0.06, 0.14], pos: [0, 0.47, 0.82] }, // cowl (seals dash->hood)
  { size: [1.5, 0.05, 2.0], pos: [0, -0.28, -0.15] }, // floor
  { size: [0.28, 0.16, 0.75], pos: [0, 0.05, 0.18] }, // centre console
  { size: [0.035, 0.16, 0.035], pos: [0, 0.18, 0.25], rot: [0.25, 0, 0] }, // gear lever
  { size: [0.06, 0.05, 0.06], pos: [0, 0.26, 0.23] }, // gear knob
  { size: [0.07, 0.46, 0.09], pos: [0.72, 0.6, 0.67], rot: [-0.84, 0, 0] }, // A-pillar L
  { size: [0.07, 0.46, 0.09], pos: [-0.72, 0.6, 0.67], rot: [-0.84, 0, 0] }, // A-pillar R
  { size: [1.46, 0.04, 1.15], pos: [0, 0.76, -0.05] }, // headliner
  { size: [1.46, 0.07, 0.1], pos: [0, 0.74, 0.5] }, // windshield header
  { size: [0.06, 0.52, 1.15], pos: [0.75, 0.16, 0.15] }, // door card L
  { size: [0.06, 0.52, 1.15], pos: [-0.75, 0.16, 0.15] }, // door card R
  { size: [1.4, 0.05, 0.45], pos: [0, 0.28, -1.15] }, // rear parcel shelf
  { size: [1.4, 0.42, 0.12], pos: [0, 0.05, -0.92] }, // rear seat back
];

function seatSpecs(x: number): BoxSpec[] {
  return [
    { size: [0.5, 0.14, 0.52], pos: [x, -0.05, -0.05] },
    { size: [0.5, 0.58, 0.13], pos: [x, 0.22, -0.32], rot: [-0.12, 0, 0] },
    { size: [0.26, 0.17, 0.1], pos: [x, 0.58, -0.38] },
  ];
}

/**
 * Visual steering ratio (hands-to-roadwheel-visual). The shared physics
 * constant STEERING_WHEEL_VISUAL_RATIO was 13×, which whipped the rim to
 * implausible lock for a normal steer input; a realistic wheel turns only
 * ~1.5 turns lock-to-lock, so a modest ~3.5× reads far better. Kept local
 * (visual-only) to avoid touching the physics tuning module.
 */
const WHEEL_VISUAL_RATIO = 3.5;

// Cluster plane: 0.30 x 0.15 m mapping the 512x256 canvas -> 0.000586 m/px.
const PX = 0.3 / CLUSTER_W;
const NEEDLE_PIVOT_X = (140 - CLUSTER_W / 2) * PX; // dial centre (140,132)
const NEEDLE_PIVOT_Y = (CLUSTER_H / 2 - 132) * PX;

/** Mutable cluster redraw state, created lazily on first frame and owned by
 * a plain ref (per-frame mutation is only legal on ref contents). The
 * CanvasTexture itself is JSX-owned so R3F disposes it on unmount. */
interface ClusterRuntime {
  ctx: CanvasRenderingContext2D | null;
  lastHash: string;
  cooldown: number;
  data: ClusterData;
}

function makeClusterRuntime(canvas: HTMLCanvasElement): ClusterRuntime {
  return {
    ctx: canvas.getContext("2d"),
    lastHash: "",
    cooldown: 0,
    data: {
      gear: "N",
      indicatorLeftLit: false,
      indicatorRightLit: false,
      seatbeltOn: false,
      handbrakeOn: false,
      headlights: "off",
    },
  };
}

/**
 * „Виток" cockpit: enclosing interior shell, working instrument cluster
 * (speedo needle at frame rate; gear / indicators / belt / handbrake /
 * headlight telltales + static fuel on a low-rate CanvasTexture), animated
 * steering wheel, and the interior rear-view mirror.
 *
 * STEERING WHEEL SIGN (verified: headless probe measured steer input +1
 * (KeyA/left) => steerRad = +0.55 AND chassis yaw toward car-left): the
 * wheel group's local +Z faces forward-away from the driver, so a NEGATIVE
 * rotation about it appears COUNTER-CLOCKWISE from the driver's seat —
 * which is how a real wheel turns for a left turn. Hence
 * `rotation.z = -steerRad * WHEEL_VISUAL_RATIO`.
 */
export function VitokCockpit({
  simRef,
  inputRef,
  cabinRef,
}: {
  simRef: RefObject<VehicleSim | null>;
  inputRef: RefObject<SimInput | null>;
  cabinRef: RefObject<CabinControls | null>;
}) {
  const steeringRef = useRef<Group>(null);
  const needleRef = useRef<Object3D>(null);
  const runtimeRef = useRef<ClusterRuntime | null>(null);
  const textureRef = useRef<CanvasTexture>(null);

  const shellGeometry = useMemo(() => mergedBoxes(SHELL), []);
  const seatGeometry = useMemo(
    () => mergedBoxes([...seatSpecs(0.34), ...seatSpecs(-0.36)]),
    [],
  );
  const wheelGeometry = useMemo(() => steeringWheelGeometry(), []);
  const clusterCanvas = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = CLUSTER_W;
    canvas.height = CLUSTER_H;
    return canvas;
  }, []);

  useFrame((_, delta) => {
    const sim = simRef.current;
    const cabin = cabinRef.current;
    if (!sim) return;

    if (steeringRef.current) {
      steeringRef.current.rotation.z = -sim.steerRad * WHEEL_VISUAL_RATIO;
    }
    if (needleRef.current) {
      needleRef.current.rotation.z = needleAngleRad(sim.speedKmh);
    }

    // Cluster face: redrawn only when a telltale changes (blink edges /
    // gear / lamp toggles — capped at 10 Hz). Runtime state lives in a ref.
    let rt = runtimeRef.current;
    if (!rt) {
      rt = makeClusterRuntime(clusterCanvas);
      runtimeRef.current = rt;
    }
    rt.cooldown -= delta;
    if (rt.ctx && rt.cooldown <= 0) {
      rt.cooldown = 0.1;
      const input = inputRef.current?.read() ?? null;
      const blink = cabin?.blinkOn ?? false;
      const hazardBlink = cabin?.hazardBlinkOn ?? false;
      const d = rt.data;
      // A1: the cluster reads the REAL driveline — selector letter (P R N D /
      // M2), stateful parking-brake lamp, hazard flashers on both arrows.
      d.gear = cabin ? cabin.driveline.gearLabel : sim.gear;
      d.indicatorLeftLit = (blink && cabin?.indicator === "left") || hazardBlink;
      d.indicatorRightLit = (blink && cabin?.indicator === "right") || hazardBlink;
      d.seatbeltOn = cabin?.seatbeltOn ?? false;
      d.handbrakeOn =
        (cabin?.driveline.parkingBrakeOn ?? false) || (input?.handbrake ?? false);
      d.headlights = cabin?.headlights ?? "off";
      const hash = clusterHash(d);
      if (hash !== rt.lastHash) {
        rt.lastHash = hash;
        drawCluster(rt.ctx, d);
        const texture = textureRef.current;
        if (texture) texture.needsUpdate = true;
      }
    }
  });

  return (
    <group>
      {/* Interior shell + seats: two merged meshes, two draw calls. */}
      <mesh geometry={shellGeometry}>
        <meshStandardMaterial color="#171b21" roughness={0.9} />
      </mesh>
      <mesh geometry={seatGeometry}>
        <meshStandardMaterial color="#232a33" roughness={0.95} />
      </mesh>

      {/* Instrument cluster: canvas face + 3D speedo needle.
          The group is yawed 180° so its local +Z (the plane's front face)
          points at the driver — the texture reads unmirrored. */}
      <group position={[0.34, 0.435, 0.625]} rotation={[0, Math.PI, 0]}>
        <group rotation={[-0.12, 0, 0]}>
          <mesh>
            <planeGeometry args={[0.3, 0.15]} />
            <meshBasicMaterial toneMapped={false}>
              <canvasTexture
                ref={textureRef}
                attach="map"
                args={[clusterCanvas]}
                colorSpace={SRGBColorSpace}
                anisotropy={4}
              />
            </meshBasicMaterial>
          </mesh>
          <group ref={needleRef} position={[NEEDLE_PIVOT_X, NEEDLE_PIVOT_Y, 0.004]}>
            <mesh position={[0.025, 0, 0]}>
              <boxGeometry args={[0.066, 0.006, 0.003]} />
              <meshBasicMaterial color="#ff5533" toneMapped={false} />
            </mesh>
          </group>
        </group>
      </group>

      {/* Steering wheel (tilted toward the driver, animated by steerRad). */}
      <group position={[COCKPIT_EYE.x, 0.3, 0.52]} rotation={[-0.45, 0, 0]}>
        <group ref={steeringRef}>
          <mesh geometry={wheelGeometry}>
            <meshStandardMaterial color="#10141a" roughness={0.85} />
          </mesh>
        </group>
      </group>

      {/* Interior rear-view mirror, hung from the windshield header and
          angled toward the driver (glance target of KeyF). */}
      <group position={[0, 0.68, 0.55]} rotation={[0.08, -0.15, 0]}>
        <mesh position={[0, 0.05, 0.01]}>
          <boxGeometry args={[0.04, 0.06, 0.03]} />
          <meshStandardMaterial color="#171b21" roughness={0.9} />
        </mesh>
        <mesh>
          <boxGeometry args={[0.36, 0.11, 0.03]} />
          <meshStandardMaterial color="#171b21" roughness={0.9} />
        </mesh>
        <mesh position={[0, 0, -0.017]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.33, 0.09]} />
          <meshStandardMaterial color="#5b6b85" roughness={0.15} metalness={0.85} />
        </mesh>
      </group>
    </group>
  );
}
