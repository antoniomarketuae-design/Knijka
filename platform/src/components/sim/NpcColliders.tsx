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
} from "@/modules/sim/traffic";
import { CHASSIS_HALF_EXTENTS } from "@/modules/sim/vehicle";

// --- Shell-pool budget (doc 68 A11). Keep these small and fixed: every shell
// is a rapier body for the WHOLE session; the pool IS the perf contract.
export const VEHICLE_SHELL_COUNT = 8;
export const PED_SHELL_COUNT = 4;
/** Rebind shells to the nearest agents on this cadence, s. */
const REASSIGN_INTERVAL_SEC = 0.5;
/** Agents beyond these radii stay ghosts (unreachable within ~2 s anyway). */
const VEHICLE_SHELL_RADIUS_M = 130;
const PED_SHELL_RADIUS_M = 70;

// --- Shell geometry (one size fits the whole GLB fleet — colliders are sized
// once; per-model fitting would force collider swaps on rebind).
const VEH_HALF_W = 0.92; // ~1.84 m wide
const VEH_HALF_H = 0.7; // box spans 0..1.4 m above the tarmac
const VEH_HALF_L = 2.1; // ~4.2 m long
const PED_CAPSULE_HALF_HEIGHT = 0.55;
const PED_CAPSULE_RADIUS = 0.3; // capsule spans 0..1.7 m
const VEH_CENTER_Y = VEH_HALF_H;
const PED_CENTER_Y = PED_CAPSULE_HALF_HEIGHT + PED_CAPSULE_RADIUS;
/** Dormant shells rest here — far below the district AND the player's kill
 *  plane, so a parked shell can never be touched. */
const PARK_Y = -120;

// --- Near-miss body envelopes (meters). Player from the chassis collider;
// NPC vehicles match the shell; pedestrians ~capsule radius + a margin.
const NEAR_MISS_VEH_HALF_W = VEH_HALF_W;
const NEAR_MISS_VEH_HALF_L = VEH_HALF_L;
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
          <CuboidCollider
            args={[VEH_HALF_W, VEH_HALF_H, VEH_HALF_L]}
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
