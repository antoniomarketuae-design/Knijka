/**
 * sc-roundabout-entry:08a0b701 (lane npcstep) — THE NPC SHELLS LIVE ON THE
 * SESSION GRID.
 *
 * A «shell» is the rapier body a road user wears: one of a FIXED pool of
 * kinematic-position bodies (8 vehicle cuboids + 4 pedestrian capsules,
 * components/sim/NpcColliders mounts them) that follow the agents nearest the
 * student, so driving into traffic is a physical contact. Through 8cb0707 the
 * pool was moved by NpcColliders' own `useFrame`:
 *
 *   · ONCE PER RENDER FRAME, to where the frame's last grid point had left
 *     each agent — and rapier moved the body there in the next frame's FIRST
 *     physics step and derived its velocity from that one move. Inside a frame
 *     of n steps the shell therefore leapt n steps' worth in one step (n times
 *     the agent's speed) and then stood still for the other n − 1;
 *   · and WHICH agents hold a shell was re-chosen on the component's own clock
 *     (`min(delta, 0.1)` summed to 0.5 s), from the frame's drawn chassis.
 *
 * So one drive met a different body on a different display. Measured in
 * process on 8cb0707 (lessons/scenario/__tests__/npc-contact-cadence.census,
 * 200 cells × four long-frame cadences: 543 of 800 rows differed from their
 * own 60 Hz drive): a car following a moving lead struck the shell up to 41
 * steps EARLIER than at 60 Hz (sc-follow-rain-gap, gap-melts, L1: step 1669
 * against 1710 — the shell stood where the lead had been), the judged impact
 * of one touch read 1.82 км/ч at 60 Hz and 86.06 км/ч on a long frame (the
 * leap), and where the car came to rest, whether it then struck a wall, and
 * when — or whether — the lesson ended all moved with the frame length. A
 * shell that does not move (a stopped car) agreed on every cadence.
 *
 * NOW: `NpcShellPool.step(k, student, …)` runs ONCE PER GRADED GRID POINT k,
 * after the point (the session grid's `shells` hook, scene/gradeGrid.ts), with
 * the student the grid read AT k:
 *
 *   · every bound shell is given the agent's pose at k as its next kinematic
 *     pose — rapier moves it there in physics step k + 1 and derives its
 *     velocity from ONE step's displacement: the agent's own;
 *   · the choice of which agents hold a shell is made at the grid points
 *     k ≡ 0 (mod NPC_SHELL_REBIND_POINTS) and at the pool's first point, from
 *     the student at k — an integer of the grid, never a sum of frame deltas.
 *
 * For that to be the SAME body on every display the world at k must exist
 * before rapier takes step k + 1. It does: the scene grades every physics
 * step before the next one is taken (LessonScene's RuntimeDriver — at the
 * frame's end for the frame's last step, as it always did, and inside the
 * step loop for the earlier steps of a frame that owes several).
 *
 * ROUND 2 (2026-10-13) added two things the pool is told and no longer
 * infers: WHAT KIND OF ROAD USER a staged body is — the director's own cast,
 * so the rapier contact and the director's sentinel report one touch as one
 * kind (`NpcShellCast`) — and A RESPAWN (`NpcShellPool.respawn`): the staged
 * actors jump back to their holds, and a shell must not cross that jump in
 * one physics step.
 *
 * AT ONE STEP PER FRAME NOTHING MOVED: the pose written is the pose
 * NpcColliders wrote (the world after the frame's one grid point), written at
 * the same place in the frame (after that point was graded), consumed by the
 * same physics step. Only the rebind's phase differs (a fixed multiple of 30
 * grid points instead of a float sum that crossed 0.5 s on the 31st or 32nd
 * frame) — and «one step per frame» is a fact about a FRAME, not a display: a
 * 60 Hz monitor draws two-step frames too (a 20 ms frame after a 13 ms one),
 * and those are graded point by point like any longer frame.
 *
 * WHAT IT COSTS: per grid point, 12 integer compares when no agent is bound;
 * for each bound shell one size probe and two pose writes — what the frame
 * loop did per frame, so a 60 Hz display pays what it paid and a slow one pays
 * per step what it used to pay per frame. Plus one O(agents) nearest-N scan
 * per 30 points (it was one per 0.5 s). Measured: scene/__tests__/
 * npc-shells.test.ts prints it.
 *
 * Pure: no React, no rapier import (the bodies are structural), no frame.
 */

import type { VehicleSample } from "@/modules/sim/contracts";
import { actorObb, PEDESTRIAN_BODY_RADIUS_M } from "@/modules/sim/collision";
import type { ContactCastMember } from "@/modules/sim/orchestrator";
import { assignPool, selectNearest, type TrafficSystem, type VehicleProfile } from "@/modules/sim/traffic";
import { FIXED_DT } from "@/modules/sim/vehicle/tuning";

// --- Shell-pool budget (doc 68 A11). Keep these small and fixed: every shell
// is a rapier body for the WHOLE session; the pool IS the perf contract.
export const VEHICLE_SHELL_COUNT = 8;
export const PED_SHELL_COUNT = 4;
/** Rebind shells to the nearest agents on this cadence, s. */
export const NPC_SHELL_REBIND_SEC = 0.5;
/**
 * …which is this many grid points: 0.5 s ÷ FIXED_DT (1/60 s) = 30. Derived,
 * not chosen — the interval is the one the pool has always had; only its
 * clock changed (the grid's index instead of a sum of frame deltas).
 */
export const NPC_SHELL_REBIND_POINTS = Math.round(NPC_SHELL_REBIND_SEC / FIXED_DT);
/** Agents beyond these radii stay ghosts (unreachable within ~2 s anyway). */
export const VEHICLE_SHELL_RADIUS_M = 130;
export const PED_SHELL_RADIUS_M = 70;

// --- Shell geometry (see components/sim/NpcColliders.tsx for the history of
// «one size fits the fleet» and why the extents are read off `actorObb`).
export const NPC_VEHICLE_SHELL_HALF_HEIGHT_M = 0.7; // box spans 0..1.4 m above the tarmac
export const NPC_PED_CAPSULE_HALF_HEIGHT_M = 0.55;
export const NPC_PED_CAPSULE_RADIUS_M = PEDESTRIAN_BODY_RADIUS_M; // 0.3 — capsule spans 0..1.7 m
const VEH_CENTER_Y = NPC_VEHICLE_SHELL_HALF_HEIGHT_M;
const PED_CENTER_Y = NPC_PED_CAPSULE_HALF_HEIGHT_M + NPC_PED_CAPSULE_RADIUS_M;
/** Dormant shells rest here — far below the district AND the player's kill
 *  plane, so a parked shell can never be touched. */
export const NPC_SHELL_PARK_Y = -120;
/** Where shell `k` of each kind parks (three.js space) — the mount pose too. */
export const vehicleShellParkX = (k: number): number => k * 12;
export const pedShellParkX = (k: number): number => 200 + k * 12;

/** Pose the sizing probe is taken at — only the extents are read back, so the
 *  position and heading are arbitrary and constant. */
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

/** Mutable collision tag on each shell body — VehicleRig's ear reads it off
 *  the struck body (`StepContact.otherUserData`). The object identity is
 *  stable for the shell's lifetime; rebinds mutate it in place. */
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

type Vec3 = { x: number; y: number; z: number };
type Quat = { x: number; y: number; z: number; w: number };

/**
 * The two methods a shell body has to have for `fitVehicleShell` — declared
 * structurally rather than as `RapierRigidBody` because `@react-three/rapier`
 * carries its OWN nested `@dimforge/rapier3d-compat`, so the two copies' class
 * types are not assignable to each other (they differ on a private field). A
 * headless harness holding the top-level rapier could therefore never call
 * this function, and a fix nobody can drive is a fix nobody can check.
 */
interface FittableShellBody {
  numColliders(): number;
  collider(i: number): { setHalfExtents(v: Vec3): void };
}

/** A shell body, as far as the pool drives it (structural, for the same
 *  reason: the product's rapier copy and a harness's both satisfy it). */
export interface NpcShellBody extends FittableShellBody {
  setTranslation(v: Vec3, wakeUp: boolean): void;
  setRotation(q: Quat, wakeUp: boolean): void;
  setNextKinematicTranslation(v: Vec3): void;
  setNextKinematicRotation(q: Quat): void;
}

/**
 * Re-fit shell `body`'s cuboid to `profile` and return the half-length it now
 * carries (−1 when there is no cuboid to fit — a body mid-mount).
 *
 * `setHalfExtents` is a no-op on a non-cuboid shape by rapier's own contract,
 * and these bodies carry exactly one `<CuboidCollider>`, so the guard is the
 * mount race and nothing else. `scratch` is the caller's per-system vector —
 * the step allocates nothing for it.
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
  body: FittableShellBody,
  profile: VehicleProfile | undefined,
  scratch: Vec3,
): number {
  if (body.numColliders() < 1) return -1;
  const half = npcShellHalfExtents(profile);
  scratch.x = half.halfWidthM;
  scratch.y = NPC_VEHICLE_SHELL_HALF_HEIGHT_M;
  scratch.z = half.halfLengthM;
  body.collider(0).setHalfExtents(scratch);
  return half.halfLengthM;
}

/** The slice of the traffic system the pool reads: the published agent arrays
 *  — GRID state (where the last `update` left every agent), never the drawn
 *  poses — which staged actor a state is, and `vehicleCollisionKind` (for the
 *  states no cast names). */
export type NpcShellTraffic = Pick<
  TrafficSystem,
  "vehicles" | "pedestrians" | "vehicleCollisionKind" | "stagedActorId"
>;

/**
 * THE LESSON'S STAGED CAST, as far as the pool reads it — the director's own
 * record of what each staged body is (`directorContactCast`).
 *
 * ONE TOUCH, ONE KIND (round 2). A staged road user has two reporters on one
 * wire: the director's sentinel, which reports the cast's `withWhat` under
 * the cast's `actorId`, and the rapier contact, which reports the SHELL'S TAG
 * and is then named from the cast — among the candidates OF THAT KIND
 * (LessonScene `nameLiveContact`). The tag used to come from the traffic
 * system's curb-offset marker (`vehicleCollisionKind`), a second answer to
 * the same question, and where the two disagreed the rapier report found no
 * candidate of its kind, stayed anonymous, and the rule engine — which merges
 * a named and an anonymous report only within one kind — billed one touch
 * twice, one grid point apart: «cyclist» from the sentinel, «vehicle» from the
 * shell (sc-vu-bikelane-turn, points 1157/1158; 15 of 784 cast members in the
 * catalogue). A shell bound to a cast member is tagged with the cast's kind
 * now, so both reports carry one kind and one name.
 *
 * A state NO cast names — an ambient agent, or a staged actor whose runner
 * casts nothing (the rail vehicles, the tailgater, the police car) — has one
 * reporter only, the rapier contact; it keeps the traffic system's marker.
 *
 * ROUND 3: the traffic system's own `vehicleCollisionKind` answers the cast's
 * kind for a cast vehicle too (the director registers its cast there at
 * creation — `setStagedContactKind`), so the rear badge and the near-miss
 * stat name a staged body as this tag and the bill do. For a cast vehicle the
 * two lookups below therefore give one answer from one source (pinned over
 * the catalogue by lessons/scenario/__tests__/npc-shell-cast-kind.test.ts);
 * the pool keeps the cast for the walkers, which the traffic system has no
 * kind function for.
 */
export type NpcShellCast = ReadonlyArray<Pick<ContactCastMember, "actorId" | "withWhat">>;

/** What the grid hands the pool at a graded point: where the student is there. */
export type NpcShellStudent = Pick<Readonly<VehicleSample>, "position">;

/**
 * The grid's `shells` hook, as the scene forwards it to the mounted pool:
 * grid point `k` has been graded — pose the bodies physics step k + 1 meets.
 * `respawned`: this is the first point since a respawn (`GradeGrid.reset`) —
 * re-choose and re-seat every shell now.
 */
export type NpcShellStep = (k: number, student: NpcShellStudent, respawned: boolean) => void;

/** `vehBound` / `pedBound` value of a shell whose seat is unknown to the
 *  pool — never an agent index (≥ 0) and never «parked» (−1), so the next
 *  step re-seats it whichever of the two its new assignment is. */
const SEAT_UNKNOWN = -2;

/**
 * The pool's bindings and its one operation. One per traffic system (the
 * bindings are INDICES into its agent arrays).
 */
export class NpcShellPool {
  private readonly vehAssign = new Int32Array(VEHICLE_SHELL_COUNT).fill(-1);
  private readonly vehBound = new Int32Array(VEHICLE_SHELL_COUNT).fill(-1);
  private readonly vehSelIdx = new Int32Array(VEHICLE_SHELL_COUNT);
  private readonly vehSelD2 = new Float64Array(VEHICLE_SHELL_COUNT);
  private readonly pedAssign = new Int32Array(PED_SHELL_COUNT).fill(-1);
  private readonly pedBound = new Int32Array(PED_SHELL_COUNT).fill(-1);
  private readonly pedSelIdx = new Int32Array(PED_SHELL_COUNT);
  private readonly pedSelD2 = new Float64Array(PED_SHELL_COUNT);
  private readonly pos: Vec3 = { x: 0, y: NPC_SHELL_PARK_Y, z: 0 };
  private readonly rot: Quat = { x: 0, y: 0, z: 0, w: 1 };
  private readonly half: Vec3 = { x: 0, y: NPC_VEHICLE_SHELL_HALF_HEIGHT_M, z: 0 };
  /** Shell re-fitting state. `vehFitBody` is an IDENTITY witness, not a
   *  convenience: a remount hands the pool brand-new car-sized colliders while
   *  `vehBound` still says "already bound", and a truck wearing a car box is
   *  the exact defect the per-agent fit exists to end. */
  private readonly vehFitBody = new Array<FittableShellBody | null>(VEHICLE_SHELL_COUNT).fill(null);
  private readonly vehFitHalfL = new Float64Array(VEHICLE_SHELL_COUNT).fill(-1);
  /** The cast's kind by staged actor id (see `NpcShellCast`). */
  private readonly castKind = new Map<string, NpcColliderUserData["kind"]>();
  /** No point stepped yet: the first one binds, whatever its index. */
  private fresh = true;
  /** Nearest-N selections made (the rebinds) — a counter for the tests and
   *  the cost statement; nothing in the product reads it. */
  rebinds = 0;

  constructor(
    private readonly traffic: NpcShellTraffic,
    /** The bodies' tags — owned by whoever mounted the bodies (their identity
     *  must outlive a pool), mutated here on a rebind. */
    readonly vehTags: NpcColliderUserData[],
    readonly pedTags: NpcColliderUserData[],
    /** The director's contact cast — what each staged body IS. Empty for a
     *  lesson that stages nothing (every shell then reads the marker). */
    cast: NpcShellCast = [],
  ) {
    for (const m of cast) this.castKind.set(m.actorId, m.withWhat);
  }

  /** What the cast says the state `stateId` is, or undefined when no cast
   *  names it. Asked on a rebind only (≤ 12 map reads per 30 grid points). */
  private castKindOf(stateId: number): NpcColliderUserData["kind"] | undefined {
    const actorId = this.traffic.stagedActorId(stateId);
    return actorId === null ? undefined : this.castKind.get(actorId);
  }

  /**
   * A RESPAWN (round 2): the next `step` re-chooses who holds a shell from
   * its student, whatever the rebind phase, and TELEPORTS every shell — the
   * ones that keep their agent too. The director re-stages its actors with a
   * respawn (their published poses jump back to their holds), and a shell
   * that glided after its actor would cross that distance in one physics
   * step: a body with the jump's speed, for one step, wherever the car
   * happens to stand (measured on sc-follow-distance: 3,394 m/s for the
   * lead's 56 m). Through 8cb0707 (and round 1) nothing told the pool about a
   * respawn; the shells followed the jump.
   *
   * …AND THE POINT AFTER CHOOSES AGAIN (`step` re-arms `fresh`): a respawn
   * made by a grid point's own tick is shown to the pool at THAT point, whose
   * student is still the car before it was lifted away; the next point's
   * student is the car on its spawn, and the road users near it must not wait
   * out the rebind interval as ghosts. That second choice glides whoever
   * keeps its agent — only the respawn point itself teleports.
   */
  respawn(): void {
    this.fresh = true;
    this.vehBound.fill(SEAT_UNKNOWN);
    this.pedBound.fill(SEAT_UNKNOWN);
  }

  /**
   * GRID POINT `k` HAS BEEN GRADED: choose who holds a shell (on the rebind
   * points only) and give every bound shell its agent's pose AT k as the next
   * kinematic pose — the pose physics step k + 1 moves it to, at the agent's
   * own one-step velocity. A shell that CHANGES agent teleports instead (no
   * implied velocity — a rebind must never read as a ram). `student` is the
   * grid's student at k; nothing here reads a frame.
   */
  step(
    k: number,
    student: NpcShellStudent,
    vehBodies: ReadonlyArray<NpcShellBody | null>,
    pedBodies: ReadonlyArray<NpcShellBody | null>,
    respawned = false,
  ): void {
    if (respawned) this.respawn();
    const traffic = this.traffic;
    // --- Rebind cadence, on the grid's own index.
    if (this.fresh || k % NPC_SHELL_REBIND_POINTS === 0) {
      this.fresh = false;
      this.rebinds++;
      const px = student.position.x;
      const py = student.position.y;
      const nVeh = selectNearest(traffic.vehicles, px, py, VEHICLE_SHELL_RADIUS_M, this.vehSelIdx, this.vehSelD2);
      assignPool(this.vehAssign, this.vehSelIdx, nVeh);
      const nPed = selectNearest(traffic.pedestrians, px, py, PED_SHELL_RADIUS_M, this.pedSelIdx, this.pedSelD2);
      assignPool(this.pedAssign, this.pedSelIdx, nPed);
    }

    const pos = this.pos;
    const rot = this.rot;
    const vehTags = this.vehTags;
    const pedTags = this.pedTags;

    // --- Vehicle shells follow their bound agents.
    for (let s = 0; s < VEHICLE_SHELL_COUNT; s++) {
      const body = vehBodies[s];
      if (!body) continue;
      const idx = this.vehAssign[s];
      const rebound = idx !== this.vehBound[s];
      if (idx < 0) {
        if (rebound) {
          this.vehBound[s] = -1;
          vehTags[s].npcId = -1;
          pos.x = vehicleShellParkX(s);
          pos.y = NPC_SHELL_PARK_Y;
          pos.z = 0;
          body.setTranslation(pos, false);
        }
        continue;
      }
      const v = traffic.vehicles[idx];
      // THE SHELL IS THIS AGENT'S OWN BODY, not the fleet average. Re-fitted
      // when the binding changes, when the collider itself is new (remount),
      // or when the size it should carry has moved — never otherwise.
      const wantHalfL = actorObb(SIZING_POSE, v.profile).halfLengthM;
      if (rebound || this.vehFitBody[s] !== body || this.vehFitHalfL[s] !== wantHalfL) {
        const fitted = fitVehicleShell(body, v.profile, this.half);
        this.vehFitBody[s] = fitted < 0 ? null : body;
        this.vehFitHalfL[s] = fitted;
      }
      const yaw = Math.atan2(v.dirX, -v.dirY);
      pos.x = v.x;
      pos.y = VEH_CENTER_Y;
      pos.z = -v.y;
      rot.y = Math.sin(yaw / 2);
      rot.w = Math.cos(yaw / 2);
      if (rebound) {
        // Teleport (no implied velocity) — a rebind must never read as a ram.
        this.vehBound[s] = idx;
        // THE KIND THE STRUCK BODY IS REPORTED AS: the cast's, for a body the
        // director's sentinel also watches — one touch, one kind; the traffic
        // system's marker for every other state (one reporter, nothing to
        // disagree with).
        vehTags[s].kind = this.castKindOf(v.id) ?? traffic.vehicleCollisionKind(v.id);
        vehTags[s].npcId = v.id;
        body.setTranslation(pos, true);
        body.setRotation(rot, true);
      } else {
        body.setNextKinematicTranslation(pos);
        body.setNextKinematicRotation(rot);
      }
    }

    // --- Pedestrian shells (capsules are yaw-symmetric — translation only).
    for (let s = 0; s < PED_SHELL_COUNT; s++) {
      const body = pedBodies[s];
      if (!body) continue;
      const idx = this.pedAssign[s];
      const rebound = idx !== this.pedBound[s];
      if (idx < 0) {
        if (rebound) {
          this.pedBound[s] = -1;
          pedTags[s].npcId = -1;
          pos.x = pedShellParkX(s);
          pos.y = NPC_SHELL_PARK_Y;
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
        this.pedBound[s] = idx;
        pedTags[s].kind = this.castKindOf(p.id) ?? "pedestrian";
        pedTags[s].npcId = p.id;
        body.setTranslation(pos, true);
      } else {
        body.setNextKinematicTranslation(pos);
      }
    }
    // The point after a respawn chooses again, from ITS student (see
    // `respawn`).
    if (respawned) this.fresh = true;
  }
}

/** A dormant tag for shell bodies of `kind` (mount-time). */
export function createNpcShellTags(count: number, kind: "vehicle" | "pedestrian"): NpcColliderUserData[] {
  return Array.from({ length: count }, () => ({ npcCollider: true as const, kind, npcId: -1 }));
}
