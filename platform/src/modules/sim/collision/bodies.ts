/**
 * sim/collision/bodies — the BODIES the exact geometry is run on.
 *
 * One rule governs every number in this file: it is measured off something the
 * product already ships, and it is cross-checked by a test. Nothing here is a
 * fresh estimate. The two sources are
 *
 *   1. the player's own rapier collider — vehicle/tuning CHASSIS_HALF_EXTENTS
 *      (1.70 m × 4.04 m). This is the body that produces the REAL contact in
 *      the browser, so the grader must not measure a different car;
 *   2. the fleet rigs — traffic/types VEHICLE_PROFILE_LENGTH_M and
 *      VEHICLE_PROFILE_WIDTH_M, which mirror vehicleFleet.ts's authored
 *      dimensions per profile (truck 7.5 × 2.4, tram 14 × 2.3, bicycle
 *      1.8 × 0.46, …). A bus graded with car dimensions is the same bug in a
 *      different hat, so the actor's OWN profile picks its box — and since
 *      audit O31 that same table sizes the KINEMATIC SHELL rapier binds, so
 *      „the actor's own profile" is one fact rather than two agreeing ones.
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
 *
 * THIS IS ALSO THE BOX RAPIER BINDS. Since audit O31, NpcColliders sizes the
 * kinematic NPC shell by calling this very function
 * (`npcShellHalfExtents(profile)` → `actorObb`) and pushing the result through
 * `collider.setHalfExtents` on rebind. So there is ONE answer to both of the
 * questions the collision layer asks — "how big is this body?" (the director's
 * geometric ContactSentinel) and "how big is the collider that just fired?"
 * (LessonScene's naming of a contact rapier declared) — and there is no second
 * function that a future rig resize can leave behind.
 *
 * ── WHY THAT LAST SENTENCE IS THE WHOLE POINT (three rounds, one defect) ────
 *
 * This file used to export `npcShellObb` plus NPC_VEHICLE_SHELL_HALF_WIDTH_M /
 * _LENGTH_M (0.92 × 2.10) for the second question, on the true premise that the
 * shell was one size for the whole fleet. Twice that pair went out of step with
 * the collider, in opposite directions, and both times the report a student's
 * debrief printed was wrong:
 *
 *   round 3 — the shell was 2.10 and `actorObb(pose, "cyclist")` was 0.90, so
 *     naming a rider needed 1.20 m of penetration PAST the collider's own face
 *     and the solver exists to prevent exactly that. A cyclist could never be
 *     named. Fixed by naming from the shell constants;
 *   round 8 — the collider became per-profile (a truck stops the player instead
 *     of being driven through, which is right) and the constants did not move.
 *     Now the LARGE bodies were unnameable. MEASURED at the rear enter edge,
 *     player half-length 2.02, against the 0.90 m naming reach:
 *
 *       profile   collider halfL   fires at   2.10-box touches at    gap
 *       car            2.05           4.07           4.12          −0.05
 *       van            2.60           4.62           4.12           0.50
 *       truck          3.75           5.77           4.12           1.65  ← lost
 *       tram           7.00           9.02           4.12           4.90  ← lost
 *       train         17.20          19.22           4.12          15.10  ← lost
 *       cyclist        0.90           2.92           4.12          −1.20
 *
 *     A POSITIVE gap is the silent one: rapier fires while the grading box
 *     still reports metres of clear air, the candidate scan matches nothing and
 *     the report stays anonymous — so a student who rear-ends the staged truck
 *     in „Зад камион", or the 14 m tram in `sc-rx-tram-left`, was billed for an
 *     accident with no body named, and TWO tram bodies in one pass billed ONE
 *     «ПТП» instead of two. A NEGATIVE gap is not innocent either: an oversized
 *     box overlaps bodies the player is clear of, and two overlapping
 *     candidates trip the naming refusal, so the body he DID hit goes unnamed.
 *
 * The rule was written down after round 3 and is now structural rather than
 * agreed: THE PHYSICS BODY AND THE GRADING BODY ARE ONE FACT, NOT TWO. One
 * function, one source. Anything that needs the collider's extents calls this.
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
