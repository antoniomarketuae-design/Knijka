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
 *
 * TWO BODIES, NOT ONE — 2026-09-02, sc-merge-from-property:ab353b86.
 * `VehicleRig` picks a contact's grading threshold off `other.rigidBody
 * .userData`, which is per-BODY, so the ground/kerb surface a car legitimately
 * mounts and the facade it may never reach cannot share one. The GROUND and
 * SIDEWALK go in the tagged surface body; the BUILDING trimesh stays untagged
 * and therefore keeps the strict threshold every authored obstacle has.
 */

import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import type { WorldColliderSet } from "../types";

/**
 * The tag on the district's DRIVE-OVER surface (ground plane + kerb/pavement
 * trimesh) — the two shapes a car can touch by leaving the carriageway rather
 * than by hitting something.
 *
 * Read by `components/sim/VehicleRig`'s `onCollisionEnter` through
 * `isDistrictSurfaceUserData`. A frozen module constant so the `userData`
 * identity is stable for the body's lifetime (the `NpcColliderUserData`
 * convention).
 */
export const DISTRICT_SURFACE_USER_DATA = Object.freeze({ districtSurface: true as const });

/** Narrowing reader for collision handlers (unknown → is it the surface?). */
export function isDistrictSurfaceUserData(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === "object" &&
    (value as { districtSurface?: unknown }).districtSurface === true
  );
}

export function WorldColliders({ colliders }: { colliders: WorldColliderSet }) {
  const { ground, sidewalks, buildings } = colliders;
  return (
    <>
      <RigidBody
        type="fixed"
        colliders={false}
        name="district-surface"
        userData={DISTRICT_SURFACE_USER_DATA}
      >
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
      </RigidBody>
      {buildings.indices.length > 0 && (
        <RigidBody type="fixed" colliders={false} name="district-buildings">
          <TrimeshCollider
            args={[buildings.positions, buildings.indices]}
            friction={0.4}
            restitution={0.05}
          />
        </RigidBody>
      )}
    </>
  );
}
