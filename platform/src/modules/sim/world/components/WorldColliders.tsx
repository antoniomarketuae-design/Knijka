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
 * THREE BODIES, NOT ONE — 2026-09-02 sc-merge-from-property:ab353b86, then
 * sc-roundabout-entry:4ab693eb. `VehicleRig` picks a contact's grading
 * threshold off `other.rigidBody.userData`, which is per-BODY, so the
 * ground/kerb surface a car legitimately mounts and the concrete it may never
 * reach cannot share one. The GROUND and the pavement-height part of the
 * sidewalk trimesh go in the tagged surface body; the BUILDING trimesh and the
 * raised KERB WALLS split out of that same trimesh (`DRIVE_OVER_MAX_Y`) stay
 * untagged and keep the strict threshold every authored obstacle has.
 */

import { CuboidCollider, RigidBody, TrimeshCollider } from "@react-three/rapier";
import { CURB_CHAMFER_M, SIDEWALK_TOP_Y } from "../builders/constants";
import type { ColliderMesh, WorldColliderSet } from "../types";

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

/**
 * Highest a triangle of `colliders.sidewalks` may reach and still be something
 * a car is ENTITLED to drive over — sc-roundabout-entry:4ab693eb.
 *
 * `colliders.sidewalks` is one accumulator carrying two physical classes,
 * because they share the concrete material: the 12 cm pavement lip, and the
 * roundabout central island's 0.45 m planter WALL (`ISLAND_WALL_RISE_M`, whose
 * header says in as many words that pavement height is „a boundary a car is
 * ENTITLED to cross" and that the island is the one piece of raised concrete in
 * this world that a car must never mount). Tagging the whole accumulator as the
 * drive-over surface therefore let the island wall off the ПТП it is: a student
 * who rolls into it below `COLLISION_MIN_KMH` is billed nothing, so no
 * terminating violation arms `lessons/engine.ts`'s crash pin, `advisor.ts`'s
 * `routeHoldForSession` never fires, and the coach goes on ordering «Излез от
 * кръговото с десен мигач» at a bonnet full of grass, with no ending.
 *
 * MEASURED, not chosen (all 106 shipped districts, `colliders.sidewalks`, max
 * triangle vertex): 0.140 m everywhere — SIDEWALK_TOP_Y exactly, pavements and
 * crossing refuge islands alike — except the five ring districts, which reach
 * 0.590 m (`ISLAND_WALL_TOP_Y`) on 576 triangles each. One chamfer of margin
 * above the pavement top separates the two classes with 0.43 m to spare, and
 * leaves the other 101 districts with an empty wall body.
 */
export const DRIVE_OVER_MAX_Y = SIDEWALK_TOP_Y + CURB_CHAMFER_M;

/** The sidewalk collider split by height: what a car may mount, and what it
 *  may not. Both halves index the SAME position buffer — only the triangle
 *  lists differ — so nothing is duplicated into physics. */
export interface DriveOverSplit {
  driveOver: ColliderMesh;
  walls: ColliderMesh;
}

/** Cache keyed on the mesh identity: `WorldColliders` takes no hooks (its own
 *  suite calls it as a plain function), and a district's collider set is built
 *  once, so this is the memo. */
const SPLIT_CACHE = new WeakMap<ColliderMesh, DriveOverSplit>();

/**
 * Partition a sidewalk collider into the drive-over surface and the raised
 * walls. A triangle is a wall as soon as ANY of its vertices clears `cutY` —
 * the island wall's vertical face is footed on the asphalt, so testing the
 * maximum is what keeps the face with its own rim.
 */
export function splitDriveOverSurface(
  mesh: ColliderMesh,
  cutY: number = DRIVE_OVER_MAX_Y,
): DriveOverSplit {
  const cached = SPLIT_CACHE.get(mesh);
  if (cached !== undefined && cutY === DRIVE_OVER_MAX_Y) return cached;
  const low: number[] = [];
  const high: number[] = [];
  const { positions, indices } = mesh;
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]!;
    const b = indices[t + 1]!;
    const c = indices[t + 2]!;
    const top = Math.max(positions[a * 3 + 1]!, positions[b * 3 + 1]!, positions[c * 3 + 1]!);
    (top > cutY ? high : low).push(a, b, c);
  }
  const split: DriveOverSplit = {
    driveOver: { positions, indices: new Uint32Array(low) },
    walls: { positions, indices: new Uint32Array(high) },
  };
  if (cutY === DRIVE_OVER_MAX_Y) SPLIT_CACHE.set(mesh, split);
  return split;
}

export function WorldColliders({ colliders }: { colliders: WorldColliderSet }) {
  const { ground, sidewalks, buildings } = colliders;
  const { driveOver, walls } = splitDriveOverSurface(sidewalks);
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
        {driveOver.indices.length > 0 && (
          <TrimeshCollider
            args={[driveOver.positions, driveOver.indices]}
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
      {/* Same concrete, same friction as the pavement — a SEPARATE body only so
          the surface tag does not reach it, and a car that strikes the central
          island is graded like the wall it is instead of like a kerb it could
          have mounted. Mounted LAST so the two bodies that existed before keep
          their positions for anything that reads this tree by index. */}
      {walls.indices.length > 0 && (
        <RigidBody type="fixed" colliders={false} name="district-kerb-walls">
          <TrimeshCollider
            args={[walls.positions, walls.indices]}
            friction={0.95}
            restitution={0.02}
          />
        </RigidBody>
      )}
    </>
  );
}
