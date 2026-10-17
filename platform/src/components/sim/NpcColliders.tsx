"use client";

/**
 * NpcColliders — A11 "hittable traffic" (doc 68 row A11; audit finding C1:
 * NPC vehicles/pedestrians had NO physics presence — the player drove
 * straight through them, which teaches invincibility).
 *
 * Design: a FIXED pool of kinematic-position rapier bodies ("shells") that
 * follow the NPC agents nearest the player:
 *
 *   - 8 vehicle shells (car-size cuboids) + 4 pedestrian shells (capsules).
 *     Budget rationale: the player can physically reach only the handful of
 *     agents around them within the next second or two; everything farther
 *     stays a ghost (documented, deliberate). A fixed pool means a constant
 *     rapier world size — zero allocation churn, no solver-island growth.
 *   - Shells are re-bound to the nearest agents every 0.5 s of the SESSION
 *     GRID (30 grid points) via the pure traffic/proximity helpers. A shell
 *     that keeps its agent glides with setNextKinematicTranslation/Rotation
 *     (the physics engine derives its velocity, so contacts with the player
 *     chassis push realistically). A shell that CHANGES agent teleports with
 *     setTranslation/setRotation instead — a teleport carries no implied
 *     velocity, so a rebind can never sweep through the player like a ram.
 *   - Dormant shells park far below the district (kinematic bodies never
 *     collide with the fixed world or each other, and the player's kill
 *     plane sits far above the parking depth).
 *   - Each shell carries a mutable `userData` tag ({ kind, npcId }) that
 *     VehicleRig's contact ear reads to classify the contact — so the
 *     rule engine finally grades collision withWhat "vehicle" / "pedestrian"
 *     / "cyclist" instead of everything being a static object. A shell
 *     bound to a member of the lesson's staged cast carries the CAST's kind
 *     (the director's record — one touch, one kind for both reporters;
 *     scene/npcShells.ts); any other state reads the traffic system's marker
 *     (traffic.vehicleCollisionKind — the staged spec's curb offset, audit
 *     C3's honest v1 cyclist model).
 *
 * Near-miss detection is NOT here any more (sc-roundabout-entry:7b747c15
 * round 7). This component stepped the pure stepNearMiss detector once per
 * render frame from the frame's drawn chassis, so the «мина на косъм» count a
 * student was shown depended on his display's frame length. The session grid
 * steps it now, once per grid point, from the car and the traffic state AT
 * that point (scene/nearMissMeter.ts, run by scene/gradeGrid.ts) — over the
 * same FULL agent arrays, ghosts included.
 *
 * THE POOL IS NOT MOVED HERE ANY MORE EITHER (sc-roundabout-entry:08a0b701,
 * lane npcstep). This component moved it in its own `useFrame`: once per
 * render frame, so inside a frame of several physics steps a shell leapt the
 * whole frame's distance in one step and then stood still, and which agents
 * held a shell was re-chosen on this component's own clock from the frame's
 * drawn chassis — one drive met a different body on a different display
 * (scene/npcShells.ts carries the measurements). The pool is stepped by the
 * session grid now, once per graded grid point, from the student at that
 * point (`NpcShellPool.step`, reached through the grid's `shells` hook and
 * the `shellsRef` this component fills). This file MOUNTS the twelve bodies
 * and hands the pool to the scene; it reads no frame, no pose and no clock.
 *
 * Physics cost expectation: 12 colliders + 12 kinematic bodies added to the
 * world, at most 12 potential contact pairs (each shell vs the one dynamic
 * player chassis — kinematic-vs-fixed and kinematic-vs-kinematic pairs are
 * skipped by rapier). Per physics step: <=12 kinematic pose writes + one
 * O(agents) scan per 30 steps — what a 60 Hz display always paid per frame
 * (scene/__tests__/npc-shells.test.ts measures it).
 *
 * Coordinates: district (x = east, y = north) -> three.js (x, -z), y-up;
 * yaw = atan2(dirX, -dirY) — the same mapping TrafficLayer renders with, so
 * shells sit exactly on the visuals.
 */

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CapsuleCollider,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import type { TrafficSystem } from "@/modules/sim/traffic";
import {
  createNpcShellTags,
  NPC_PED_CAPSULE_HALF_HEIGHT_M,
  NPC_PED_CAPSULE_RADIUS_M,
  NPC_SHELL_PARK_Y,
  NPC_VEHICLE_SHELL_HALF_HEIGHT_M,
  NpcShellPool,
  npcShellHalfExtents,
  PED_SHELL_COUNT,
  pedShellParkX,
  VEHICLE_SHELL_COUNT,
  vehicleShellParkX,
  type NpcColliderUserData,
  type NpcShellCast,
  type NpcShellStep,
} from "@/modules/sim/scene/npcShells";

// The pool's numbers, its sizing and its tag live with the pool
// (scene/npcShells.ts); re-exported here because this file is where VehicleRig,
// ScenarioObstacles and the collider tests have always imported them from.
export {
  fitVehicleShell,
  NpcShellPool,
  npcShellHalfExtents,
  PED_SHELL_COUNT,
  readNpcColliderUserData,
  VEHICLE_SHELL_COUNT,
  type NpcColliderUserData,
} from "@/modules/sim/scene/npcShells";

// --- Shell geometry.
//
// ── 2026-08-19 · THE SHELL WAS ONE SIZE AND THE FLEET IS NOT (audit O31) ───
//
// This block used to read "one size fits the whole GLB fleet — colliders are
// sized once; per-model fitting would force collider swaps on rebind", and
// bound a 0.92 × 2.10 m cuboid to every `traffic.vehicles` entry whatever it
// was. The fleet the student SEES is `traffic/types` VEHICLE_PROFILE_*_M, and
// the two disagree in BOTH directions. The three ★ rows below were DRIVEN —
// real rapier + the real VehicleSim into a kinematic shell, at 30–50 км/ч
// (`stagedActorColliders.test.ts`, which re-drives them on every run); the
// rest are the same overhang plus the ~0.15 m of solver overlap those three
// measured, and are marked as the arithmetic they are:
//
//   profile      real half-L   shell was   the player's nose ended up
// ★ car               2.05        2.10      0.15 m into the shell — right
//   van               2.60        2.10      0.65 m inside the visible van
//   emergency         2.80        2.10      0.85 m inside
// ★ truck             3.75        2.10      1.80 m INSIDE THE VISIBLE TRUCK
// ★ tram              7.00        2.10      4.99 m inside
//   train            17.20        2.10     15.25 m inside
//
// …and the mirror image, which is the founder's own complaint pointing the
// other way. The cyclist proxy is a 0.23 × 0.90 m bicycle wearing a
// 0.92 × 2.10 m box, so passing one needed 1.77 m of lateral centre-to-centre
// where the bicycle itself needs 1.08 m. DRIVEN on the same harness: a player
// passing a staged cyclist at 1.00 m and at 1.40 m of real clearance was
// STOPPED DEAD by air (he travelled 35.9 m / 36.0 m and halted; only 1.80 m
// of offset got him through). The committed drive uses 1.20 m — 12 cm CLEAR
// of the bicycle's own 1.08 m, and 57 cm inside the box that shipped. Being
// stopped like that fires VehicleRig's onCollisionEnter, so the student is
// billed «сблъсък» with a cyclist he never touched.
//
// THE FIX IS TO STOP HAVING TWO SOURCES. The half-extents are now read off
// `actorObb` — the SAME function the director's ContactSentinel grades with —
// per bound agent, at rebind (≤ 2 Hz per shell), through
// `collider.setHalfExtents`. The physics body and the graded body are one
// fact, and a rig resize moves both at once.
//
// Cost: one `actorObb` call + one `setHalfExtents` per REBIND, not per step.
// A shell that keeps its agent (the common case) re-sizes nothing.
//
// THE FOLLOW-UP THIS ROUTED, AND WHY IT WAS NOT OPTIONAL. This block shipped
// saying `collision/bodies.ts` `npcShellObb` still answered "how big is the
// collider that just fired?" with the retired 0.92 × 2.10 constants, and that
// until it was moved a truck/tram/train contact would report ANONYMOUS rather
// than named — "nothing about the BILL changes, because the sentinel's own
// per-body key is unaffected". THE SECOND HALF OF THAT WAS WRONG. The rapier
// channel and the sentinel are two reporters on one wire, and the rule engine
// keys an episode on `actorId` when it has one and on `kind:<withWhat>` when it
// does not — so anonymous reports from every large body fell under ONE latch,
// and two tram bodies touched in one pass billed ONE «ПТП» instead of two. A
// missing name is not free; it merges victims.
//
// It has landed: `npcShellObb` and both constants are DELETED, and
// `LessonScene.liveContactBodies` sizes its candidates with
// `actorObb(pose, m.profile)` — literally the call the pool sizes with
// (scene/npcShells.ts). One function, one source, nothing left in between for
// the next resize to leave behind.

/** Car-sized shell — the declarative mount size. Every shell is re-fitted to
 *  its agent on its first rebind, so this is only ever the size of a shell
 *  that is parked at NPC_SHELL_PARK_Y and bound to nobody. (The near-miss
 *  stat's body envelopes moved with the detector: scene/nearMissMeter.ts.) */
const CAR_SHELL = npcShellHalfExtents(undefined);

export interface NpcCollidersProps {
  traffic: TrafficSystem;
  /**
   * WHERE THE SCENE REACHES THE POOL: this component points the ref at the
   * mounted pool's step, and the session grid's `shells` hook (LessonScene's
   * RuntimeDriver) calls it once per graded grid point with that point's
   * student. Null while nothing is mounted — the grid then poses nothing.
   * There is NO sample, pose or pause prop: the pool reads the grid's student
   * and is stepped only when a grid point is graded.
   */
  shellsRef: React.RefObject<NpcShellStep | null>;
  /**
   * THE LESSON'S STAGED CAST — the director's own record of what each staged
   * body is (`directorContactCast(director)`, a stable array per director). A
   * shell bound to a cast member is tagged with the cast's kind, so the rapier
   * contact and the director's sentinel report one touch as one kind
   * (scene/npcShells.ts `NpcShellCast`). Empty with no director.
   */
  cast: NpcShellCast;
}

export function NpcColliders({ traffic, shellsRef, cast }: NpcCollidersProps) {
  const vehBodies = useRef<(RapierRigidBody | null)[]>(
    Array.from({ length: VEHICLE_SHELL_COUNT }, () => null),
  );
  const pedBodies = useRef<(RapierRigidBody | null)[]>(
    Array.from({ length: PED_SHELL_COUNT }, () => null),
  );

  // Stable userData tags — mutated on rebind, never re-created.
  const [vehTags] = useState<NpcColliderUserData[]>(() => createNpcShellTags(VEHICLE_SHELL_COUNT, "vehicle"));
  const [pedTags] = useState<NpcColliderUserData[]>(() => createNpcShellTags(PED_SHELL_COUNT, "pedestrian"));

  // The pool's bindings are INDICES into the traffic system's agent arrays, so
  // a new traffic system gets a new pool (agent-array lengths are fixed after
  // LessonScene stages the lesson's actors).
  const pool = useMemo(
    () => new NpcShellPool(traffic, vehTags, pedTags, cast),
    [traffic, vehTags, pedTags, cast],
  );

  // Hand the scene this pool's step — and take it back on unmount, or when the
  // pool changes, so the grid never poses bodies that are gone.
  useLayoutEffect(() => {
    const step: NpcShellStep = (k, student, respawned) =>
      pool.step(k, student, vehBodies.current, pedBodies.current, respawned);
    shellsRef.current = step;
    return () => {
      if (shellsRef.current === step) shellsRef.current = null;
    };
  }, [pool, shellsRef]);

  return (
    <>
      {vehTags.map((tag, k) => (
        <RigidBody
          key={`npc-veh-${k}`}
          ref={(body) => {
            vehBodies.current[k] = body;
          }}
          type="kinematicPosition"
          colliders={false}
          position={[vehicleShellParkX(k), NPC_SHELL_PARK_Y, 0]}
          userData={tag}
        >
          {/* Mount size = the car profile. Every shell is re-fitted to its
              own agent on the grid point it binds one (NpcShellPool.step), so
              this is only ever the size of a shell parked at NPC_SHELL_PARK_Y
              with no agent — and it is a real size rather than a placeholder
              so a first step that lands before the first rebind is a car, not
              a point. */}
          <CuboidCollider
            args={[CAR_SHELL.halfWidthM, NPC_VEHICLE_SHELL_HALF_HEIGHT_M, CAR_SHELL.halfLengthM]}
            friction={0.5}
            restitution={0.05}
          />
        </RigidBody>
      ))}
      {pedTags.map((tag, k) => (
        <RigidBody
          key={`npc-ped-${k}`}
          ref={(body) => {
            pedBodies.current[k] = body;
          }}
          type="kinematicPosition"
          colliders={false}
          position={[pedShellParkX(k), NPC_SHELL_PARK_Y, 0]}
          userData={tag}
        >
          <CapsuleCollider
            args={[NPC_PED_CAPSULE_HALF_HEIGHT_M, NPC_PED_CAPSULE_RADIUS_M]}
            friction={0.6}
            restitution={0}
          />
        </RigidBody>
      ))}
    </>
  );
}
