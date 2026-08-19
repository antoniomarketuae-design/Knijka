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
 *   - Shells are re-bound to the nearest agents every REASSIGN_INTERVAL_SEC
 *     (~0.5 s) via the pure traffic/proximity helpers. A shell that keeps its
 *     agent glides with setNextKinematicTranslation/Rotation (the physics
 *     engine derives its velocity, so contacts with the player chassis push
 *     realistically). A shell that CHANGES agent teleports with
 *     setTranslation/setRotation instead — a teleport carries no implied
 *     velocity, so a rebind can never sweep through the player like a ram.
 *   - Dormant shells park far below the district (kinematic bodies never
 *     collide with the fixed world or each other, and the player's kill
 *     plane sits far above the parking depth).
 *   - Each shell carries a mutable `userData` tag ({ kind, npcId }) that
 *     VehicleRig's onCollisionEnter reads to classify the contact — so the
 *     rule engine finally grades collision withWhat "vehicle" / "pedestrian"
 *     / "cyclist" instead of everything being a static object. Staged
 *     cyclist proxies are tagged via traffic.vehicleCollisionKind (their
 *     staged spec's curb offset — audit C3's honest v1 cyclist model).
 *
 * Near-miss detection (no grading change): the pure stepNearMiss detector
 * runs over the FULL agent arrays (~50 agents — trivially cheap) so even
 * ghost NPCs register a squeeze. Encounters resolve into the additive
 * NearMissStats session stat (contracts) for A15's feedback map.
 *
 * Physics cost expectation: 12 colliders + 12 kinematic bodies added to the
 * world, at most 12 potential contact pairs (each shell vs the one dynamic
 * player chassis — kinematic-vs-fixed and kinematic-vs-kinematic pairs are
 * skipped by rapier). Per frame: <=12 kinematic pose writes + one O(agents)
 * scan per 0.5 s + one O(agents) near-miss pass. Well under 0.1 ms — no
 * measurable frame budget impact.
 *
 * Coordinates: district (x = east, y = north) -> three.js (x, -z), y-up;
 * yaw = atan2(dirX, -dirY) — the same mapping TrafficLayer renders with, so
 * shells sit exactly on the visuals.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import {
  CapsuleCollider,
  CuboidCollider,
  RigidBody,
  type RapierRigidBody,
} from "@react-three/rapier";
import type {
  NearMissEvent,
  NearMissStats,
  VehicleSample,
} from "@/modules/sim/contracts";
import {
  assignPool,
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  selectNearest,
  stepNearMiss,
  type TrafficSystem,
  type VehicleProfile,
} from "@/modules/sim/traffic";
import { CHASSIS_HALF_EXTENTS } from "@/modules/sim/vehicle";
import { actorObb, PEDESTRIAN_BODY_RADIUS_M } from "@/modules/sim/collision";

// --- Shell-pool budget (doc 68 A11). Keep these small and fixed: every shell
// is a rapier body for the WHOLE session; the pool IS the perf contract.
export const VEHICLE_SHELL_COUNT = 8;
export const PED_SHELL_COUNT = 4;
/** Rebind shells to the nearest agents on this cadence, s. */
const REASSIGN_INTERVAL_SEC = 0.5;
/** Agents beyond these radii stay ghosts (unreachable within ~2 s anyway). */
const VEHICLE_SHELL_RADIUS_M = 130;
const PED_SHELL_RADIUS_M = 70;

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
// Cost: one `actorObb` call + one `setHalfExtents` per REBIND, not per frame.
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
// `actorObb(pose, m.profile)` — literally the call below. One function, one
// source, nothing left in between for the next resize to leave behind.
const VEH_HALF_H = 0.7; // box spans 0..1.4 m above the tarmac
// Height stays one number on purpose: contact here is a GROUND-PLANE fact (the
// player's chassis box spans ~0.15–0.85 m above the tarmac at every pose), so
// 1.4 m of shell covers it for a bicycle and for a train alike. Making it
// profile-tall would change nothing a student can reach.
const PED_CAPSULE_HALF_HEIGHT = 0.55;
const PED_CAPSULE_RADIUS = PEDESTRIAN_BODY_RADIUS_M; // 0.3 — capsule spans 0..1.7 m
const VEH_CENTER_Y = VEH_HALF_H;
const PED_CENTER_Y = PED_CAPSULE_HALF_HEIGHT + PED_CAPSULE_RADIUS;
/** Dormant shells rest here — far below the district AND the player's kill
 *  plane, so a parked shell can never be touched. */
const PARK_Y = -120;

/** Pose the sizing probe is taken at — only the extents are read back, so the
 *  position and heading are arbitrary and constant (allocation-free intent:
 *  one frozen literal, not a per-call object). */
const SIZING_POSE = { x: 0, y: 0, dirX: 0, dirY: 1 } as const;

/**
 * THE SHELL'S GROUND-PLANE HALF-EXTENTS FOR ONE AGENT — read off `actorObb`,
 * the very function the director's ContactSentinel grades contact with.
 *
 * Not a parallel table and deliberately not a copy of one: a second table is
 * how the 0.92 × 2.10 constants outlived the fleet in the first place. If a
 * rig is resized, `traffic/types` VEHICLE_PROFILE_*_M moves, `actorObb` moves,
 * and the rapier body moves with them on the next rebind.
 *
 * `undefined` profile = "car", exactly as every other reader of that table
 * treats an ambient agent (ambient states never publish `profile`).
 */
export function npcShellHalfExtents(profile: VehicleProfile | undefined): {
  halfWidthM: number;
  halfLengthM: number;
} {
  const box = actorObb(SIZING_POSE, profile);
  return { halfWidthM: box.halfWidthM, halfLengthM: box.halfLengthM };
}

/** Car-sized shell — the declarative mount size and the near-miss envelope.
 *  Every shell is re-fitted to its agent on its first rebind, so this is only
 *  ever the size of a shell that is parked at PARK_Y and bound to nobody. */
const CAR_SHELL = npcShellHalfExtents(undefined);

// --- Near-miss body envelopes (meters). Player from the chassis collider;
// NPC vehicles at the CAR envelope; pedestrians ~capsule radius + a margin.
// One envelope for the whole array by design: `stepNearMiss` is a session
// STAT (contracts NearMissStats), never a ViolationCode, and it sweeps all
// ~50 agents with one number. It is NOT the contact body — that is the shell
// above, which is now per-profile — and this file does not widen a stat into
// a grading channel on the way past.
const NEAR_MISS_VEH_HALF_W = CAR_SHELL.halfWidthM;
const NEAR_MISS_VEH_HALF_L = CAR_SHELL.halfLengthM;
const NEAR_MISS_PED_ENVELOPE = 0.35;

/** Mutable collision tag on each shell body — VehicleRig reads it through
 *  the rapier collision payload (`other.rigidBody.userData`). The object
 *  identity is stable for the shell's lifetime; rebinds mutate it in place. */
export interface NpcColliderUserData {
  npcCollider: true;
  kind: "vehicle" | "pedestrian" | "cyclist";
  /** Bound TrafficVehicleState/TrafficPedestrianState id, or -1 dormant. */
  npcId: number;
}

/**
 * The two methods a shell body has to have for `fitVehicleShell` — declared
 * structurally rather than as `RapierRigidBody` because `@react-three/rapier`
 * carries its OWN nested `@dimforge/rapier3d-compat`, so the two copies' class
 * types are not assignable to each other (they differ on a private field). A
 * headless harness holding the top-level rapier could therefore never call
 * this function, and a fix nobody can drive is a fix nobody can check.
 */
interface ShellBody {
  numColliders(): number;
  collider(i: number): { setHalfExtents(v: { x: number; y: number; z: number }): void };
}

/**
 * Re-fit shell `body`'s cuboid to `profile` and return the half-length it now
 * carries (−1 when there is no cuboid to fit — a body mid-mount).
 *
 * `setHalfExtents` is a no-op on a non-cuboid shape by rapier's own contract,
 * and these bodies carry exactly one `<CuboidCollider>`, so the guard is the
 * mount race and nothing else. `scratch` is the caller's per-system vector —
 * the frame loop allocates nothing.
 *
 * EXPORTED FOR THE TEST TO CALL FOR REAL, not for convenience. The whole fix
 * rests on rapier honouring a live shape swap on a kinematic body: if
 * `setHalfExtents` were inert, a test that merely built its own correctly
 * sized collider would still be green while every browser kept the car box.
 * `stagedActorColliders.test.ts` drives the player into a shell created
 * car-sized and re-fitted through THIS function, so the swap is measured
 * rather than assumed.
 */
export function fitVehicleShell(
  body: ShellBody,
  profile: VehicleProfile | undefined,
  scratch: { x: number; y: number; z: number },
): number {
  if (body.numColliders() < 1) return -1;
  const half = npcShellHalfExtents(profile);
  scratch.x = half.halfWidthM;
  scratch.y = VEH_HALF_H;
  scratch.z = half.halfLengthM;
  body.collider(0).setHalfExtents(scratch);
  return half.halfLengthM;
}

/** Narrowing reader for collision handlers (unknown -> tag or null). */
export function readNpcColliderUserData(value: unknown): NpcColliderUserData | null {
  return value !== null &&
    typeof value === "object" &&
    (value as { npcCollider?: unknown }).npcCollider === true
    ? (value as NpcColliderUserData)
    : null;
}

export interface NpcCollidersProps {
  traffic: TrafficSystem;
  /** Player pose channel (district space) — LessonScene's shared sample. */
  sampleRef: React.RefObject<VehicleSample>;
  paused: boolean;
  /** A11 near-miss stat channel (additive; omit = stats still tracked, just
   *  unreported). Called once per resolved encounter with the running
   *  session aggregate. */
  onNearMiss?: (event: NearMissEvent, stats: NearMissStats) => void;
}

export function NpcColliders({ traffic, sampleRef, paused, onNearMiss }: NpcCollidersProps) {
  const vehBodies = useRef<(RapierRigidBody | null)[]>(
    Array.from({ length: VEHICLE_SHELL_COUNT }, () => null),
  );
  const pedBodies = useRef<(RapierRigidBody | null)[]>(
    Array.from({ length: PED_SHELL_COUNT }, () => null),
  );

  // Stable userData tags — mutated on rebind, never re-created.
  const [vehTags] = useState<NpcColliderUserData[]>(() =>
    Array.from({ length: VEHICLE_SHELL_COUNT }, () => ({
      npcCollider: true as const,
      kind: "vehicle" as const,
      npcId: -1,
    })),
  );
  const [pedTags] = useState<NpcColliderUserData[]>(() =>
    Array.from({ length: PED_SHELL_COUNT }, () => ({
      npcCollider: true as const,
      kind: "pedestrian" as const,
      npcId: -1,
    })),
  );

  // All per-frame buffers, allocated once per traffic system (agent-array
  // lengths are fixed after LessonScene stages the lesson's actors).
  const pools = useMemo(
    () => ({
      vehAssign: new Int32Array(VEHICLE_SHELL_COUNT).fill(-1),
      vehBound: new Int32Array(VEHICLE_SHELL_COUNT).fill(-1),
      vehSelIdx: new Int32Array(VEHICLE_SHELL_COUNT),
      vehSelD2: new Float64Array(VEHICLE_SHELL_COUNT),
      pedAssign: new Int32Array(PED_SHELL_COUNT).fill(-1),
      pedBound: new Int32Array(PED_SHELL_COUNT).fill(-1),
      pedSelIdx: new Int32Array(PED_SHELL_COUNT),
      pedSelD2: new Float64Array(PED_SHELL_COUNT),
      vehTracker: createNearMissTracker(traffic.vehicles.length),
      pedTracker: createNearMissTracker(traffic.pedestrians.length),
      player: {
        x: 0,
        y: 0,
        headingDeg: 0,
        speedMps: 0,
        halfWidthM: CHASSIS_HALF_EXTENTS.x,
        halfLengthM: CHASSIS_HALF_EXTENTS.z,
      },
      pos: { x: 0, y: PARK_Y, z: 0 },
      rot: { x: 0, y: 0, z: 0, w: 1 },
      // Shell re-fitting state. `vehFitBody` is an IDENTITY witness, not a
      // convenience: a remount hands this loop brand-new car-sized colliders
      // while `vehBound` still says "already bound", and a truck wearing a car
      // box is the exact defect this block exists to end. Comparing the body
      // the fit was applied to (and the size it produced) re-fits through a
      // remount, an HMR swap and StrictMode's double-mount alike, for two
      // scalar compares per shell per frame and no allocation.
      vehFitBody: new Array<RapierRigidBody | null>(VEHICLE_SHELL_COUNT).fill(null),
      vehFitHalfL: new Float64Array(VEHICLE_SHELL_COUNT).fill(-1),
      half: { x: 0, y: VEH_HALF_H, z: 0 },
    }),
    [traffic],
  );

  const clockRef = useRef(0);
  const reassignAtRef = useRef(0);
  const statsRef = useRef<NearMissStats>({ count: 0, worst: null });
  const onNearMissRef = useRef(onNearMiss);
  useEffect(() => {
    onNearMissRef.current = onNearMiss;
  }, [onNearMiss]);

  // Emit adapters — bound once per traffic system; a real near-miss is rare,
  // so the per-event object allocation is fine (the per-frame path is free).
  const emitters = useMemo(() => {
    const report = (event: NearMissEvent) => {
      const stats = statsRef.current;
      stats.count += 1;
      if (!stats.worst || event.clearanceM < stats.worst.clearanceM) {
        stats.worst = event;
      }
      onNearMissRef.current?.(event, stats);
    };
    return {
      vehicle: (i: number, clearanceM: number, relSpeedMps: number) => {
        const state = traffic.vehicles[i];
        report({
          tSec: clockRef.current,
          kind: traffic.vehicleCollisionKind(state.id),
          npcId: state.id,
          clearanceM,
          relSpeedMps,
        });
      },
      pedestrian: (i: number, clearanceM: number, relSpeedMps: number) => {
        report({
          tSec: clockRef.current,
          kind: "pedestrian" as const,
          npcId: traffic.pedestrians[i].id,
          clearanceM,
          relSpeedMps,
        });
      },
    };
  }, [traffic]);

  useFrame((_, delta) => {
    if (paused) return;
    const dt = Math.min(delta, 0.1);
    clockRef.current += dt;
    const sample = sampleRef.current;
    const px = sample.position.x;
    const py = sample.position.y;

    // --- Rebind cadence: nearest-N selection + stable pool assignment.
    reassignAtRef.current -= dt;
    if (reassignAtRef.current <= 0) {
      reassignAtRef.current = REASSIGN_INTERVAL_SEC;
      const nVeh = selectNearest(
        traffic.vehicles,
        px,
        py,
        VEHICLE_SHELL_RADIUS_M,
        pools.vehSelIdx,
        pools.vehSelD2,
      );
      assignPool(pools.vehAssign, pools.vehSelIdx, nVeh);
      const nPed = selectNearest(
        traffic.pedestrians,
        px,
        py,
        PED_SHELL_RADIUS_M,
        pools.pedSelIdx,
        pools.pedSelD2,
      );
      assignPool(pools.pedAssign, pools.pedSelIdx, nPed);
    }

    const pos = pools.pos;
    const rot = pools.rot;

    // --- Vehicle shells follow their bound agents.
    for (let k = 0; k < VEHICLE_SHELL_COUNT; k++) {
      const body = vehBodies.current[k];
      if (!body) continue;
      const idx = pools.vehAssign[k];
      const rebound = idx !== pools.vehBound[k];
      if (idx < 0) {
        if (rebound) {
          pools.vehBound[k] = -1;
          vehTags[k].npcId = -1;
          pos.x = k * 12;
          pos.y = PARK_Y;
          pos.z = 0;
          body.setTranslation(pos, false);
        }
        continue;
      }
      const v = traffic.vehicles[idx];
      // THE SHELL IS THIS AGENT'S OWN BODY, not the fleet average. Re-fitted
      // when the binding changes, when the collider itself is new (remount),
      // or when the size it should carry has moved — never otherwise, so a
      // shell that keeps its agent costs one float compare per frame.
      const wantHalfL = actorObb(SIZING_POSE, v.profile).halfLengthM;
      if (rebound || pools.vehFitBody[k] !== body || pools.vehFitHalfL[k] !== wantHalfL) {
        const fitted = fitVehicleShell(body, v.profile, pools.half);
        pools.vehFitBody[k] = fitted < 0 ? null : body;
        pools.vehFitHalfL[k] = fitted;
      }
      const yaw = Math.atan2(v.dirX, -v.dirY);
      pos.x = v.x;
      pos.y = VEH_CENTER_Y;
      pos.z = -v.y;
      rot.y = Math.sin(yaw / 2);
      rot.w = Math.cos(yaw / 2);
      if (rebound) {
        // Teleport (no implied velocity) — a rebind must never read as a ram.
        pools.vehBound[k] = idx;
        vehTags[k].kind = traffic.vehicleCollisionKind(v.id);
        vehTags[k].npcId = v.id;
        body.setTranslation(pos, true);
        body.setRotation(rot, true);
      } else {
        body.setNextKinematicTranslation(pos);
        body.setNextKinematicRotation(rot);
      }
    }

    // --- Pedestrian shells (capsules are yaw-symmetric — translation only).
    for (let k = 0; k < PED_SHELL_COUNT; k++) {
      const body = pedBodies.current[k];
      if (!body) continue;
      const idx = pools.pedAssign[k];
      const rebound = idx !== pools.pedBound[k];
      if (idx < 0) {
        if (rebound) {
          pools.pedBound[k] = -1;
          pedTags[k].npcId = -1;
          pos.x = 200 + k * 12;
          pos.y = PARK_Y;
          pos.z = 0;
          body.setTranslation(pos, false);
        }
        continue;
      }
      const p = traffic.pedestrians[idx];
      pos.x = p.x;
      pos.y = PED_CENTER_Y;
      pos.z = -p.y;
      if (rebound) {
        pools.pedBound[k] = idx;
        pedTags[k].npcId = p.id;
        body.setTranslation(pos, true);
      } else {
        body.setNextKinematicTranslation(pos);
      }
    }

    // --- Near-miss detection over the FULL agent arrays (ghosts included).
    const player = pools.player;
    player.x = px;
    player.y = py;
    player.headingDeg = sample.headingDeg;
    player.speedMps = sample.speedKmh / 3.6;
    stepNearMiss(
      pools.vehTracker,
      dt,
      player,
      traffic.vehicles,
      NEAR_MISS_VEH_HALF_W,
      NEAR_MISS_VEH_HALF_L,
      DEFAULT_NEAR_MISS_CONFIG,
      emitters.vehicle,
    );
    stepNearMiss(
      pools.pedTracker,
      dt,
      player,
      traffic.pedestrians,
      NEAR_MISS_PED_ENVELOPE,
      NEAR_MISS_PED_ENVELOPE,
      DEFAULT_NEAR_MISS_CONFIG,
      emitters.pedestrian,
    );
  });

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
          position={[k * 12, PARK_Y, 0]}
          userData={tag}
        >
          {/* Mount size = the car profile. Every shell is re-fitted to its
              own agent on the frame it binds one (see the frame loop), so
              this is only ever the size of a shell parked at PARK_Y with no
              agent — and it is a real size rather than a placeholder so a
              first frame that lands before the first rebind is a car, not a
              point. */}
          <CuboidCollider
            args={[CAR_SHELL.halfWidthM, VEH_HALF_H, CAR_SHELL.halfLengthM]}
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
          position={[200 + k * 12, PARK_Y, 0]}
          userData={tag}
        >
          <CapsuleCollider
            args={[PED_CAPSULE_HALF_HEIGHT, PED_CAPSULE_RADIUS]}
            friction={0.6}
            restitution={0}
          />
        </RigidBody>
      ))}
    </>
  );
}
