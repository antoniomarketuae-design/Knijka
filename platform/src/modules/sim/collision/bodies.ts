/**
 * sim/collision/bodies — the BODIES the exact geometry is run on.
 *
 * One rule governs every number in this file: it is measured off something the
 * product already ships, and it is cross-checked by a test. Nothing here is a
 * fresh estimate. The three sources are
 *
 *   1. the player's own rapier collider — vehicle/tuning CHASSIS_HALF_EXTENTS
 *      (1.70 m × 4.04 m). This is the body that produces the REAL contact in
 *      the browser, so the grader must not measure a different car;
 *   2. the NPC physics shell — the kinematic cuboid NpcColliders binds to the
 *      nearest agents (1.84 m × 4.20 m). The two collision emitters (rapier
 *      contact → worldRuntime.pushCollision, and the orchestrator's own
 *      geometric test) now agree on the same body;
 *   3. the fleet rigs — traffic/types VEHICLE_PROFILE_LENGTH_M and
 *      VEHICLE_PROFILE_WIDTH_M, which mirror vehicleFleet.ts's authored
 *      dimensions per profile (truck 7.5 × 2.4, tram 14 × 2.3, bicycle
 *      1.8 × 0.46, …). A bus graded with car dimensions is the same bug in a
 *      different hat, so the actor's OWN profile picks its box.
 *
 * PEDESTRIANS ARE NOT RECTANGLES. A walker has no meaningful body heading and
 * their physics presence is a capsule, so they are a DISC of
 * PEDESTRIAN_BODY_RADIUS_M and the test is box-vs-disc. The cyclist proxy is
 * NOT: audit C3's v1 cyclist is a narrow curb-riding VEHICLE agent rendered on
 * the bicycle rig, it has a real heading, and it is five times longer than it
 * is wide (1.8 × 0.46) — a disc would have to over- or under-state it by half a
 * metre. It gets the same exact OBB every other vehicle gets, sized from the
 * bicycle rig.
 *
 * Pure TypeScript — vitest-safe (no three/rapier import; the tuning module is
 * plain constants).
 */

import {
  vehicleHalfLengthM,
  vehicleHalfWidthM,
  type VehicleProfile,
} from "../traffic/types";
import { CHASSIS_HALF_EXTENTS } from "../vehicle/tuning";
import type { Obb2D } from "./obb";

/** The player's half-width, m — the rapier chassis collider's own x extent. */
export const PLAYER_HALF_WIDTH_M = CHASSIS_HALF_EXTENTS.x;
/** The player's half-length, m — the rapier chassis collider's own z extent. */
export const PLAYER_HALF_LENGTH_M = CHASSIS_HALF_EXTENTS.z;

/**
 * Half-extents of the kinematic NPC vehicle shell (NpcColliders), m. Declared
 * here so the sim module owns the number and the component imports it: the
 * physics body and the grading body must be one fact, not two.
 */
export const NPC_VEHICLE_SHELL_HALF_WIDTH_M = 0.92;
export const NPC_VEHICLE_SHELL_HALF_LENGTH_M = 2.1;

/**
 * Ground-plane radius of a pedestrian, m — the NPC pedestrian capsule's own
 * radius (NpcColliders PED_CAPSULE_RADIUS). Child figures render at 0.72 scale
 * but the shell does not shrink and StagedActorView does not publish the
 * variant, so every walker is graded at the adult radius: over-covering a child
 * by 8 cm errs toward calling a contact, which is the safe direction.
 */
export const PEDESTRIAN_BODY_RADIUS_M = 0.3;

/** District heading of a unit travel direction, degrees (0 = north, cw). */
export function headingOfDir(dirX: number, dirY: number): number {
  return (Math.atan2(dirX, dirY) * 180) / Math.PI;
}

/** The player's body box at a pose. */
export function playerObb(x: number, y: number, headingDeg: number): Obb2D {
  return {
    x,
    y,
    headingDeg,
    halfLengthM: PLAYER_HALF_LENGTH_M,
    halfWidthM: PLAYER_HALF_WIDTH_M,
  };
}

/** Minimal pose an actor must publish to be boxed (StagedActorView satisfies
 *  it structurally — the orchestrator keeps its narrow port). */
export interface ActorPose {
  readonly x: number;
  readonly y: number;
  /** Unit travel direction, district space. */
  readonly dirX: number;
  readonly dirY: number;
}

/**
 * A staged actor's body box, sized from its OWN profile (absent = "car").
 * Heading comes from its published travel direction, so a car held at the kerb
 * is a rectangle lying along the kerb — which is the whole point: 1.0 m of air
 * beside it is 1.0 m of air, and 1.0 m behind its tail is not "ran over".
 */
export function actorObb(pose: ActorPose, profile?: VehicleProfile): Obb2D {
  return {
    x: pose.x,
    y: pose.y,
    headingDeg: headingOfDir(pose.dirX, pose.dirY),
    halfLengthM: vehicleHalfLengthM(profile),
    halfWidthM: vehicleHalfWidthM(profile),
  };
}
