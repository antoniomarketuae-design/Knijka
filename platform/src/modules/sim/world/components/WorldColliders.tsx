"use client";

/**
 * Static physics for the district (@react-three/rapier, fixed bodies):
 * - one flat ground box whose TOP face is exactly the road surface height,
 * - a sidewalk/curb trimesh (12 cm curbs — drivable-over per the vehicle
 *   harness envelope in sim/vehicle),
 * - a building-wall trimesh.
 *
 * Mount inside <Physics>. DistrictWorld includes this by default
 * (physics prop); pass physics={false} to mount it separately.
 */

import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import type { WorldColliderSet } from "../types";

export function WorldColliders({ colliders }: { colliders: WorldColliderSet }) {
  const { ground, sidewalks, buildings } = colliders;
  return (
    <RigidBody type="fixed" colliders={false} name="district-static">
      <CuboidCollider
        args={ground.halfExtents}
        position={ground.position}
        friction={1}
        restitution={0.02}
      />
      {sidewalks.indices.length > 0 && (
        <TrimeshCollider
          args={[sidewalks.positions, sidewalks.indices]}
          friction={0.95}
          restitution={0.02}
        />
      )}
      {buildings.indices.length > 0 && (
        <TrimeshCollider
          args={[buildings.positions, buildings.indices]}
          friction={0.4}
          restitution={0.05}
        />
      )}
    </RigidBody>
  );
}
