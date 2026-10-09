/**
 * sc-roundabout-entry:7b747c15 round 7 (the round-6 verifier's condition C1) —
 * THE NEAR-MISS STAT, STEPPED ON THE SESSION GRID.
 *
 * A near miss is the A11 session stat «мина на косъм»: the student squeezing
 * past a MOVING road user with almost no lateral clearance. It is not a
 * ViolationCode and scores nothing, but the student is SHOWN it: the count and
 * the closest pass reach `session.nearMisses`, the result screen's row and the
 * debrief sentence «имаше N разминавания на косъм, най-близкото …»
 * (lessons/engine.ts `applyNearMiss` → lessons/debrief.ts).
 *
 * Through round 6 the detector was stepped by components/sim/NpcColliders,
 * once per RENDER FRAME, from the frame's drawn chassis and the traffic poses
 * of that frame, with its own clock (the frame's delta capped at 0.1 s). So
 * what a student was told about one drive depended on his display: a pass
 * that lasts a few tenths of a second is sampled thirty times at 60 Hz and
 * once, or never, inside a phone's 0.5 s frame (the verifier's model: the count
 * differs from 60 Hz on 15 of 503 committed demos on a phone's cadence, 12 at a
 * steady 0.5 s).
 *
 * Now `GradeGrid` steps it, once per grid point, from the student AT grid point
 * k and the traffic system's state at k — the very pose and world the rule
 * engine grades at that point. The detector itself (traffic/proximity.ts
 * `stepNearMiss`), its thresholds and its body envelopes are unchanged; only
 * WHEN it looks, and at which pose, changed. An event's `tSec` is the grid
 * point's session time (it was NpcColliders' private clock, which ran slow
 * against the session on any frame longer than 0.1 s).
 *
 * Not the rapier shells: NpcColliders still owns the kinematic collider pool
 * (physical contact) and still moves it once per frame.
 */

import type { NearMissEvent, NearMissStats, VehicleSample } from "@/modules/sim/contracts";
import { actorObb, PLAYER_HALF_LENGTH_M, PLAYER_HALF_WIDTH_M } from "@/modules/sim/collision";
import {
  createNearMissTracker,
  DEFAULT_NEAR_MISS_CONFIG,
  stepNearMiss,
  type NearMissTracker,
  type TrafficSystem,
} from "@/modules/sim/traffic";

/** The slice of the traffic system the stat reads: the published agent
 *  arrays (grid state — never the drawn poses) and the cyclist marker. */
export type NearMissTraffic = Pick<TrafficSystem, "vehicles" | "pedestrians" | "vehicleCollisionKind">;

// --- Body envelopes (metres) — the ones NpcColliders stepped the detector
// with. One envelope for the whole vehicle array by design: a session STAT
// sweeps all ~50 agents with one number (the CAR profile, read off `actorObb`,
// the function contact itself is graded with); it is not the contact body.
const CAR_BOX = actorObb({ x: 0, y: 0, dirX: 0, dirY: 1 });
export const NEAR_MISS_VEHICLE_HALF_WIDTH_M = CAR_BOX.halfWidthM;
export const NEAR_MISS_VEHICLE_HALF_LENGTH_M = CAR_BOX.halfLengthM;
export const NEAR_MISS_PEDESTRIAN_ENVELOPE_M = 0.35;

export class GridNearMissMeter {
  /** The running session aggregate (`worst` = the tightest pass). */
  readonly stats: NearMissStats = { count: 0, worst: null };
  private traffic: NearMissTraffic | null = null;
  private vehTracker: NearMissTracker = createNearMissTracker(0);
  private pedTracker: NearMissTracker = createNearMissTracker(0);
  private readonly player = {
    x: 0,
    y: 0,
    headingDeg: 0,
    speedMps: 0,
    halfWidthM: PLAYER_HALF_WIDTH_M,
    halfLengthM: PLAYER_HALF_LENGTH_M,
  };
  private tSec = 0;
  private out: NearMissEvent[] | null = null;
  // Emit adapters — bound once; a resolved encounter is rare, so the per-event
  // object is the only allocation (the per-point path allocates nothing).
  private readonly emitVehicle = (i: number, clearanceM: number, relSpeedMps: number): void => {
    const traffic = this.traffic;
    if (!traffic) return;
    const state = traffic.vehicles[i];
    this.report({
      tSec: this.tSec,
      kind: traffic.vehicleCollisionKind(state.id),
      npcId: state.id,
      clearanceM,
      relSpeedMps,
    });
  };
  private readonly emitPedestrian = (i: number, clearanceM: number, relSpeedMps: number): void => {
    const traffic = this.traffic;
    if (!traffic) return;
    this.report({
      tSec: this.tSec,
      kind: "pedestrian",
      npcId: traffic.pedestrians[i].id,
      clearanceM,
      relSpeedMps,
    });
  };

  private report(event: NearMissEvent): void {
    const stats = this.stats;
    stats.count += 1;
    if (!stats.worst || event.clearanceM < stats.worst.clearanceM) stats.worst = event;
    this.out?.push(event);
  }

  /**
   * A respawn (round 8, `GradeGrid.reset`): every encounter still OPEN is
   * forgotten — the trackers are made anew at the next point — so a window that
   * was open when the car was put back on its spawn point can neither resolve
   * as a pass nor be continued by the next drive. What already RESOLVED stays
   * in `stats`: the session it belongs to runs on.
   */
  reset(): void {
    this.traffic = null;
  }

  /**
   * One grid point: the student where the grid put him at session time
   * `tSec`, `dtSec` since the previous point, against the traffic system's
   * state at this point. Encounters that RESOLVED here (the bodies separated)
   * are appended to `out`.
   */
  step(
    tSec: number,
    dtSec: number,
    student: Readonly<VehicleSample>,
    traffic: NearMissTraffic,
    out: NearMissEvent[],
  ): void {
    if (
      traffic !== this.traffic ||
      traffic.vehicles.length > this.vehTracker.active.length ||
      traffic.pedestrians.length > this.pedTracker.active.length
    ) {
      // A new traffic system (or one that grew — staged actors are placed
      // before the first frame, so this is the first point of a session): a
      // window open against the old arrays is not an encounter with the new.
      this.traffic = traffic;
      this.vehTracker = createNearMissTracker(traffic.vehicles.length);
      this.pedTracker = createNearMissTracker(traffic.pedestrians.length);
    }
    const player = this.player;
    player.x = student.position.x;
    player.y = student.position.y;
    player.headingDeg = student.headingDeg;
    player.speedMps = student.speedKmh / 3.6;
    this.tSec = tSec;
    this.out = out;
    stepNearMiss(
      this.vehTracker,
      dtSec,
      player,
      traffic.vehicles,
      NEAR_MISS_VEHICLE_HALF_WIDTH_M,
      NEAR_MISS_VEHICLE_HALF_LENGTH_M,
      DEFAULT_NEAR_MISS_CONFIG,
      this.emitVehicle,
    );
    stepNearMiss(
      this.pedTracker,
      dtSec,
      player,
      traffic.pedestrians,
      NEAR_MISS_PEDESTRIAN_ENVELOPE_M,
      NEAR_MISS_PEDESTRIAN_ENVELOPE_M,
      DEFAULT_NEAR_MISS_CONFIG,
      this.emitPedestrian,
    );
    this.out = null;
  }
}
