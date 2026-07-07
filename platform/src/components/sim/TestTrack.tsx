"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { ConeCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { Object3D, type InstancedMesh } from "three";

// ---------------------------------------------------------------------------
// „Тестово каране" ground: a rounded-rectangle road loop with curbs and a
// cone slalom — the spike's flat slab upgraded just enough to exercise the
// physics envelope (corners, curb strikes, lane changes) with a draw-call
// budget an integrated GPU laughs at (~25 calls for the whole track).
//
// World layout (Y-up, matches tuning.SPAWN on the south straight, facing +X):
//   straight centrelines: z = ±40 (south/north), x = ±60 (east/west)
//   corner arc centres:   (±42, ±22), radius 18, road width 8
// ---------------------------------------------------------------------------

const ROAD_W = 8;
const HALF_W = ROAD_W / 2;
const CORNER_R = 18;
const CX = 42; // corner centre |x|
const CZ = 22; // corner centre |z|

const COLOR_GROUND = "#2f3b33";
const COLOR_ASPHALT = "#3a424e";
const COLOR_MARKING = "#dfe6ee";
const COLOR_CURB = "#b8c2cf";
const COLOR_CONE = "#ff8a3d";
const COLOR_PRACTICE_CURB = "#ffb02e";

/** Dashed centre line as ONE instanced draw call. */
function CenterDashes() {
  const ref = useRef<InstancedMesh>(null);
  const dashes = useMemo(() => {
    const list: Array<{ x: number; z: number; rotY: number }> = [];
    for (let x = -39; x <= 39; x += 6) {
      list.push({ x, z: -40, rotY: 0 }); // south straight (runs along X)
      list.push({ x, z: 40, rotY: 0 }); // north straight
    }
    for (let z = -18; z <= 18; z += 6) {
      list.push({ x: -60, z, rotY: Math.PI / 2 }); // west straight (runs along Z)
      list.push({ x: 60, z, rotY: Math.PI / 2 }); // east straight
    }
    return list;
  }, []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const helper = new Object3D();
    dashes.forEach((d, i) => {
      helper.position.set(d.x, 0.045, d.z);
      // Lay the dash flat, then yaw it along the travel direction.
      helper.rotation.set(-Math.PI / 2, 0, d.rotY);
      helper.updateMatrix();
      mesh.setMatrixAt(i, helper.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [dashes]);

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, dashes.length]}>
      <planeGeometry args={[2, 0.18]} />
      <meshBasicMaterial color={COLOR_MARKING} />
    </instancedMesh>
  );
}

/** Knockable traffic cone (dynamic body, sleeps until hit). */
function TrafficCone({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody colliders={false} position={position}>
      <ConeCollider args={[0.26, 0.17]} position={[0, 0.26, 0]} mass={0.6} friction={0.7} />
      <mesh position={[0, 0.26, 0]}>
        <coneGeometry args={[0.17, 0.52, 12]} />
        <meshStandardMaterial color={COLOR_CONE} roughness={0.7} />
      </mesh>
    </RigidBody>
  );
}

/** Static curb: visual box + matching fixed collider. */
function Curb({
  size,
  position,
  rotationY = 0,
  color = COLOR_CURB,
}: {
  size: [number, number, number];
  position: [number, number, number];
  rotationY?: number;
  color?: string;
}) {
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} friction={0.9} />
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
    </group>
  );
}

export function TestTrack() {
  // Corner ring quarter-arcs. After rotation-x = -PI/2, a ring vertex at
  // polar angle θ lands at world (cosθ, 0, -sinθ) — hence the theta starts.
  const corners: Array<{ x: number; z: number; thetaStart: number }> = [
    { x: CX, z: CZ, thetaStart: -Math.PI / 2 }, // NE
    { x: CX, z: -CZ, thetaStart: 0 }, // SE
    { x: -CX, z: -CZ, thetaStart: Math.PI / 2 }, // SW
    { x: -CX, z: CZ, thetaStart: Math.PI }, // NW
  ];

  // Apex curbs on the inside of each corner (45° tangent).
  const apexR = CORNER_R - HALF_W - 0.2;
  const apexCurbs = corners.map((c) => ({
    x: c.x + (Math.sign(c.x) * apexR) / Math.SQRT2,
    z: c.z + (Math.sign(c.z) * apexR) / Math.SQRT2,
    rotY: (Math.sign(c.x) === Math.sign(c.z) ? 1 : -1) * (Math.PI / 4),
  }));

  // Cone slalom on the north straight (approached after two corners).
  const cones: Array<[number, number, number]> = [
    [-30, 0, 38.8],
    [-18, 0, 41.2],
    [-6, 0, 38.8],
    [6, 0, 41.2],
    [18, 0, 38.8],
    [30, 0, 41.2],
  ];

  return (
    <group>
      {/* Ground slab: one collider for the whole world. */}
      <CuboidCollider args={[300, 1, 300]} position={[0, -1, 0]} friction={1} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={COLOR_GROUND} roughness={1} />
      </mesh>

      {/* Road straights (visual only — the slab is the driving surface). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -40]}>
        <planeGeometry args={[84, ROAD_W]} />
        <meshStandardMaterial color={COLOR_ASPHALT} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 40]}>
        <planeGeometry args={[84, ROAD_W]} />
        <meshStandardMaterial color={COLOR_ASPHALT} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[60, 0.02, 0]}>
        <planeGeometry args={[ROAD_W, 44]} />
        <meshStandardMaterial color={COLOR_ASPHALT} roughness={0.95} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-60, 0.02, 0]}>
        <planeGeometry args={[ROAD_W, 44]} />
        <meshStandardMaterial color={COLOR_ASPHALT} roughness={0.95} />
      </mesh>

      {/* Corner quarter-rings. */}
      {corners.map((c, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[c.x, 0.02, c.z]}>
          <ringGeometry args={[CORNER_R - HALF_W, CORNER_R + HALF_W, 24, 1, c.thetaStart, Math.PI / 2]} />
          <meshStandardMaterial color={COLOR_ASPHALT} roughness={0.95} />
        </mesh>
      ))}

      <CenterDashes />

      {/* Start line just ahead of the spawn point. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-16, 0.04, -40]}>
        <planeGeometry args={[0.6, ROAD_W]} />
        <meshBasicMaterial color={COLOR_MARKING} />
      </mesh>

      {/* Outer-edge curbs along the four straights (12 cm, drivable). */}
      <Curb size={[84, 0.12, 0.25]} position={[0, 0.06, -44.13]} />
      <Curb size={[84, 0.12, 0.25]} position={[0, 0.06, 44.13]} />
      <Curb size={[0.25, 0.12, 44]} position={[64.13, 0.06, 0]} />
      <Curb size={[0.25, 0.12, 44]} position={[-64.13, 0.06, 0]} />

      {/* Apex curbs on the corner insides. */}
      {apexCurbs.map((c, i) => (
        <Curb key={i} size={[3, 0.12, 0.4]} position={[c.x, 0.06, c.z]} rotationY={c.rotY} />
      ))}

      {/* Practice curb strike: the EXACT harness scenario — a 12 cm slab
          under the right wheels on the south straight, hit at ~50-57 km/h
          when accelerating from spawn. Amber so testers aim for it. */}
      <Curb
        size={[2, 0.12, 1.6]}
        position={[25, 0.06, -39.3]}
        color={COLOR_PRACTICE_CURB}
      />

      {/* Cone slalom on the north straight. */}
      {cones.map((p, i) => (
        <TrafficCone key={i} position={p} />
      ))}
    </group>
  );
}
