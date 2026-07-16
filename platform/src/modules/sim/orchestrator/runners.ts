/**
 * Event runners — one deterministic arm/trigger/adjudicate machine per staged
 * event kind (doc 68 A8; library context: docs/simulation/65).
 *
 * Shared shape: every runner
 *   1. stages its actor dormant (stage — also re-run per attempt with fresh
 *      seeded jitters, so retries vary within authored bounds yet replay
 *      bit-identically for the same seed+attempt),
 *   2. watches the player each frame (step) to ARM and then TRIGGER the
 *      encounter, commanding the actor through the narrow traffic port,
 *   3. adjudicates the outcome from the frame's SimTick events (the runtime's
 *      own detectors fire on staged actors) plus its own geometry, emitting
 *      ONLY existing SimTick vocabulary (prioritySituation, collision) where
 *      no runtime detector covers the situation.
 *
 * Grading stays in rules/engine.ts; a runner's StagedEventOutcome is the
 * additive measurement channel (reaction time & co) A10 builds on.
 */

import type {
  AmberDilemmaSpec,
  BrakingLeadCarSpec,
  CyclistRightHookSpec,
  NarrowMeetingSpec,
  OncomingLeftTurnSpec,
  PedestrianDartOutSpec,
  PriorityFromRightSpec,
  RoundaboutEntrySpec,
  StagedEventOutcome,
  StagedEventSpec,
} from "../contracts";
import type { SimTickEvent } from "../rules";
import type { Rng } from "../traffic/rng";
import type {
  DirectorInput,
  SignalDirectorPort,
  StagedEventPhase,
  StagedTrafficPort,
} from "./types";

/** Raw brake pedal at/above this = the student is braking (reaction onset). */
export const BRAKE_ONSET_THRESHOLD = 0.35;
/** Player heading must point within this many degrees of a target to count
 * as approaching it (loose — roads bend). */
const APPROACH_MAX_DEG = 80;
/** Center-to-center distance treated as vehicle/vehicle contact, m
 * (≈ two half-lengths of the 4.3 m fleet cars, minus overlap slack). */
const VEHICLE_CONTACT_M = 3.0;
/** Center-to-center distance treated as running over a pedestrian, m. */
const PEDESTRIAN_CONTACT_M = 1.5;
/** Center-to-center distance treated as striking the cyclist proxy, m. */
const CYCLIST_CONTACT_M = 2.2;

const KMH_TO_MPS = 1 / 3.6;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Is the player heading roughly toward (tx, ty)? */
function approaching(input: DirectorInput, tx: number, ty: number): boolean {
  const dx = tx - input.x;
  const dy = ty - input.y;
  const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
  const delta = Math.abs((((bearing - input.headingDeg) % 360) + 540) % 360 - 180);
  return delta <= APPROACH_MAX_DEG;
}

/** Signed forward distance of (tx, ty) in the player's frame, m (<0 = behind). */
function aheadOfPlayerM(input: DirectorInput, tx: number, ty: number): number {
  const rad = (input.headingDeg * Math.PI) / 180;
  return (tx - input.x) * Math.sin(rad) + (ty - input.y) * Math.cos(rad);
}

/** Positive-modulo loop arc. */
function loopArc(a: number, len: number): number {
  return ((a % len) + len) % len;
}

/** Stimulus→brake-onset stopwatch (deterministic; sampled per frame). */
class ReactionTimer {
  private t0: number | null = null;
  private onsetT: number | null = null;

  arm(tSec: number): void {
    this.t0 = tSec;
    this.onsetT = null;
  }

  reset(): void {
    this.t0 = null;
    this.onsetT = null;
  }

  sample(input: DirectorInput): void {
    if (this.t0 !== null && this.onsetT === null && input.brakePedal >= BRAKE_ONSET_THRESHOLD) {
      this.onsetT = input.tSec;
    }
  }

  get reactionSec(): number | undefined {
    return this.t0 !== null && this.onsetT !== null ? this.onsetT - this.t0 : undefined;
  }
}

export interface EventRunner {
  readonly spec: StagedEventSpec;
  phase: StagedEventPhase;
  outcome: StagedEventOutcome | null;
  /** True while this runner wants the lesson hazard visual animating. */
  hazardActive: boolean;
  /** (Re)stage the actor + redraw per-attempt jitters. `firstTime` stages the
   *  actor into the traffic system; later calls reset it to its hold pose. */
  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void;
  /** Advance one frame; returns the outcome exactly once, on resolution. */
  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null;
}

function outcomeOf(
  spec: StagedEventSpec,
  input: DirectorInput,
  success: boolean,
  detail: StagedEventOutcome["detail"],
  extra?: Partial<StagedEventOutcome>,
): StagedEventOutcome {
  return { eventId: spec.id, kind: spec.kind, success, detail, tSec: input.tSec, ...extra };
}

// ---------------------------------------------------------------------------
// 1. Pedestrian dart-out (L4)
// ---------------------------------------------------------------------------

export class PedestrianDartOutRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private triggerDistM = 0;
  private approachSpeedKmh = 0;
  private sawSlow = false;
  private readonly timer = new ReactionTimer();

  constructor(readonly spec: PedestrianDartOutSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const end = {
        x: s.start.x + s.dir.x * s.travelM,
        y: s.start.y + s.dir.y * s.travelM,
      };
      const view = traffic.stage({
        kind: "pedestrian",
        id: s.id,
        path: [s.start, end],
        speedMps: s.speedMps,
        crossingId: s.crossingId,
        roadFromM: s.roadFromM,
        roadToM: s.roadToM,
        colorIndex: 3,
      });
      if (!view) throw new Error(`staged event ${s.id}: pedestrian path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.triggerDistM = s.triggerDistM + (rng() * 2 - 1) * 3;
    this.phase = "armed";
    this.outcome = null;
    this.sawSlow = false;
    this.approachSpeedKmh = 0;
    this.timer.reset();
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const d = dist(input.x, input.y, s.crossing.x, s.crossing.y);

    if (this.phase === "armed") {
      // Player drove past the crossing without ever building trigger speed —
      // the encounter quietly never happens (no outcome, nothing to grade).
      // C1 revision: LOCAL passes only (d < 60) — without the distance cap,
      // any moment the route pointed away from a far-off site cancelled the
      // encounter (the exam bank's C9w/C10e darts died 500 m across town,
      // minutes before the player's actual approach leg).
      if (d > 8 && d < 60 && aheadOfPlayerM(input, s.crossing.x, s.crossing.y) < -5) {
        this.phase = "resolved";
        return null;
      }
      if (
        d <= this.triggerDistM &&
        input.speedKmh >= s.minTriggerSpeedKmh &&
        approaching(input, s.crossing.x, s.crossing.y)
      ) {
        traffic.stagedCommand(s.id, { type: "cruise" });
        this.phase = "triggered";
        this.timer.arm(input.tSec);
        this.approachSpeedKmh = input.speedKmh;
      }
      return null;
    }

    // triggered
    this.timer.sample(input);
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const onRoad = actor.s >= s.roadFromM && actor.s <= s.roadToM;
    if (onRoad && input.speedKmh <= 12) this.sawSlow = true;

    // Contact — the one adjudication no runtime detector can see (ambient
    // NPCs are unhittable; staged actors must not be).
    if (input.speedKmh > 5 && dist(input.x, input.y, actor.x, actor.y) < PEDESTRIAN_CONTACT_M) {
      out.push({ kind: "collision", withWhat: "pedestrian" });
      return this.resolve(input, false, "collision");
    }
    // Drove over the occupied crossing — the reducer grades
    // PEDESTRIAN_NOT_YIELDED off this same event; we only record the outcome.
    for (const e of input.tickEvents) {
      if (e.kind === "crossingPassed" && e.crossingId === s.crossingId && e.pedestrianOnCrossing) {
        return this.resolve(input, false, "violation");
      }
    }
    // Pedestrian cleared the roadway — encounter over.
    if (actor.s > s.roadToM + 0.5 || actor.finished) {
      return this.resolve(input, true, this.sawSlow ? "yielded" : "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail, {
      reactionTimeSec: this.timer.reactionSec,
      approachSpeedKmh: this.approachSpeedKmh,
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 2. Priority from the right (L2)
// ---------------------------------------------------------------------------

/** Sync clamps: the scripted car's plausible urban speed band, m/s. */
const PRIORITY_SYNC_MIN_MPS = 1.5;
const PRIORITY_SYNC_MAX_MPS = 11.5;
/** Commit (cruise through, stop syncing) once the car is this close, m. */
const PRIORITY_COMMIT_CAR_M = 25;
/** …or once the player is this close to their stop line, m. */
const PRIORITY_COMMIT_PLAYER_M = 22;
/** The car is "clear" once this far past the junction node, m — beyond the
 * runtime's PRIORITY_CONFLICT_RADIUS_M so a stopped-then-proceeding player
 * can never cross into a stale conflict. */
const PRIORITY_CLEAR_ARC_M = 30;

export class PriorityFromRightRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private leadSec = 0;
  private sawYield = false;

  constructor(readonly spec: PriorityFromRightSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        extraRightOffsetM: s.actor.extraRightOffsetM,
        loop: s.actor.loop,
        colorIndex: s.actor.colorIndex,
        playerGuard: true,
      });
      if (!view) throw new Error(`staged event ${s.id}: vehicle path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.leadSec = s.leadSec + (rng() * 2 - 1) * 0.12;
    this.phase = "armed";
    this.outcome = null;
    this.sawYield = false;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const d = dist(input.x, input.y, s.junction.x, s.junction.y);
    const carArc = actor.s - actor.nodeS[s.junctionNodeIndex]; // <0 before node
    const playerLineDist = Math.max(0, d - s.lineDistM);

    if (this.phase === "armed") {
      if (d > s.armDistM) return null;
      const carDist = -carArc;
      // COMMIT strictly on genuine player proximity to their own line —
      // straight-line ETA lies badly on L-shaped approaches (the player may
      // sit 50 m euclidean from the junction for the length of a whole
      // corner), so the car never crosses "unwitnessed" on a distance guess.
      if (playerLineDist <= PRIORITY_COMMIT_PLAYER_M) {
        traffic.stagedCommand(s.id, { type: "cruise" }); // through the box
        this.phase = "triggered";
        return null;
      }
      if (carDist <= PRIORITY_COMMIT_CAR_M + 3) {
        // Staged and waiting: hold just short of the box until the player
        // closes in (reads as a car pausing at the junction; a stationary
        // vehicle makes no priority claim, so no detector sees it early).
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: 0 });
        return null;
      }
      // Approach sync: bring the car toward its hold point so it arrives
      // `leadSec` before the player's projected (no-stop) line-crossing.
      const playerEta = playerLineDist / Math.max(input.speedKmh * KMH_TO_MPS, 3);
      const target = Math.min(
        PRIORITY_SYNC_MAX_MPS,
        Math.max(PRIORITY_SYNC_MIN_MPS, carDist / Math.max(playerEta - this.leadSec, 0.5)),
      );
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: target });
      return null;
    }

    // triggered — the car is committed through the junction.
    if (carArc > 6) {
      // Past the node: sprint out of the 26 m conflict radius so a correctly
      // yielding player can never cross into a stale "conflict".
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: s.clearSpeedMps });
    }
    if (playerLineDist <= 14 && input.speedKmh <= 8 && Math.abs(carArc) <= 26) {
      this.sawYield = true;
    }
    // Contact in the box.
    if (
      dist(input.x, input.y, actor.x, actor.y) < VEHICLE_CONTACT_M &&
      input.speedKmh + actor.speedMps * 3.6 > 5
    ) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(input, false, "collision");
    }
    // The runtime's own junction adjudication fired on our car: the stop-line
    // give-way check (conflictNear at line crossing) on guarded junctions, or
    // the right-hand-rule tracker (conflictFromRight) on uncontrolled ones —
    // the runner is junction-type agnostic.
    for (const e of input.tickEvents) {
      if (
        e.kind !== "prioritySituation" ||
        (e.situation !== "give-way" && e.situation !== "right-hand-rule")
      ) {
        continue;
      }
      if (e.violated && Math.abs(carArc) <= PRIORITY_CLEAR_ARC_M) {
        return this.resolve(input, false, "violation");
      }
      if (e.yielded) {
        // Uncontrolled junctions: the runtime's RHR tracker commends on its
        // own — just record the outcome.
        return this.resolve(input, true, "yielded");
      }
    }
    if (carArc > PRIORITY_CLEAR_ARC_M) {
      if (this.sawYield && (s.junctionControl ?? "stopLine") === "stopLine") {
        // The runtime emits yielded-commendations only for RHR/roundabout
        // trackers — the stop-line give-way case is ours to commend, with the
        // same existing vocabulary the reducer already grades.
        out.push({ kind: "prioritySituation", situation: "give-way", violated: false, yielded: true });
        return this.resolve(input, true, "yielded");
      }
      return this.resolve(input, true, this.sawYield ? "yielded" : "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail);
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 3. Braking lead car with measured reaction time (L5)
// ---------------------------------------------------------------------------

/** Player counts as fully stopped at/below this, km/h (matches objectives). */
const LEAD_STOPPED_KMH = 1.5;
/** Bumper-to-bumper approximation: two half-lengths of the 4.3 m cars, m. */
const LEAD_CAR_LENGTH_M = 4.3;

export class BrakingLeadCarRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private followGapM = 0;
  private approachSpeedKmh = 0;
  private resolvedAtSec: number | null = null;
  private resumed = false;
  private readonly timer = new ReactionTimer();

  constructor(readonly spec: BrakingLeadCarSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        colorIndex: s.actor.colorIndex,
        // FO-06: a "truck"/"van" lead publishes its size profile so the fleet
        // renders the large-vehicle rig (absent = car, byte-identical).
        profile: s.actor.profile,
        playerGuard: true,
      });
      if (!view) throw new Error(`staged event ${s.id}: vehicle path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.followGapM = s.followGapM + (rng() * 2 - 1) * 2;
    this.phase = "armed";
    this.outcome = null;
    this.hazardActive = false;
    this.approachSpeedKmh = 0;
    this.resolvedAtSec = null;
    this.resumed = false;
    this.timer.reset();
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    const actor = traffic.staged(s.id);
    if (!actor) return null;

    if (this.phase === "resolved") {
      // Housekeeping: after the debrief beat, the lead car drives on and the
      // ball visual retires (TrafficLayer resets it when the flag drops).
      if (
        !this.resumed &&
        this.resolvedAtSec !== null &&
        input.tSec - this.resolvedAtSec >= s.resumeAfterSec
      ) {
        traffic.stagedCommand(s.id, { type: "cruise" });
        this.hazardActive = false;
        this.resumed = true;
      }
      return null;
    }

    if (this.phase === "armed") {
      // C1 revision: mid-route corridors (armDistM present) arm only when
      // the player is actually NEAR the held lead. Without the gate, the
      // lead started rolling at the first player movement anywhere in the
      // city, drove its corridor alone, and later graded a phantom
      // "passedWithoutStopping" against a player minutes behind (exam-bank
      // B4/B6 sites). Spawn corridors (no armDistM) keep the legacy
      // speed-only arming — the player starts right behind the lead there.
      const nearLead =
        s.armDistM === undefined || dist(input.x, input.y, actor.x, actor.y) <= s.armDistM;
      if (nearLead && input.speedKmh > 4) {
        traffic.stagedCommand(s.id, {
          type: "matchPlayer",
          gapM: this.followGapM,
          maxSpeedMps: s.maxMatchSpeedMps,
        });
        this.phase = "triggered"; // following — the encounter is now live
      }
      return null;
    }

    // triggered: following until the staged slam point, then adjudicating.
    const atSlamPoint = dist(actor.x, actor.y, s.slamAt.x, s.slamAt.y) <= s.slamRadiusM;
    const playerGap = dist(input.x, input.y, actor.x, actor.y);
    if (this.approachSpeedKmh === 0) {
      // Not slammed yet.
      if (
        atSlamPoint &&
        (input.speedKmh >= s.minSlamSpeedKmh || playerGap <= s.proximityFallbackM)
      ) {
        traffic.stagedCommand(s.id, { type: "brake", decelMps2: s.slamDecelMps2 });
        if (s.triggersHazard) this.hazardActive = true;
        this.timer.arm(input.tSec);
        this.approachSpeedKmh = Math.max(1, input.speedKmh);
      }
      return null;
    }

    // Slammed — measure the stop.
    this.timer.sample(input);
    const gap = playerGap - LEAD_CAR_LENGTH_M;
    const relX = input.x - actor.x;
    const relY = input.y - actor.y;
    const playerAheadM = relX * actor.dirX + relY * actor.dirY;

    if (gap <= 0.3 && input.speedKmh > 2) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(input, false, "hitLeadCar", 0);
    }
    if (input.speedKmh <= LEAD_STOPPED_KMH) {
      return this.resolve(input, true, "stoppedInTime", Math.max(0, gap));
    }
    if (playerAheadM > 6) {
      // Swerved around the stimulus instead of stopping.
      return this.resolve(input, false, "passedWithoutStopping", Math.max(0, gap));
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
    stopGapM: number,
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.resolvedAtSec = input.tSec;
    this.outcome = outcomeOf(this.spec, input, success, detail, {
      reactionTimeSec: this.timer.reactionSec,
      stopGapM,
      approachSpeedKmh: this.approachSpeedKmh,
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 4. Cyclist right-hook (v1 actor-model caveat: a narrow scripted
//    vehicle-agent stands in for the cyclist — audit C3)
// ---------------------------------------------------------------------------

/** Cyclist is "clear of the hook zone" this far past the junction node, m. */
const CYCLIST_CLEAR_ARC_M = 8;
/** Player has passed the junction once nearer than this… */
const HOOK_PASS_NEAR_M = 16;
/** …and resolved once farther than this again, m. */
const HOOK_PASS_FAR_M = 22;

export class CyclistRightHookRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private releaseDistM = 0;
  private conflictExisted = false;
  private minPlayerJunctionM = Infinity;

  constructor(readonly spec: CyclistRightHookSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        extraRightOffsetM: s.actor.extraRightOffsetM,
        colorIndex: s.actor.colorIndex,
        playerGuard: true,
      });
      if (!view) throw new Error(`staged event ${s.id}: cyclist path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.releaseDistM = s.releaseDistM + (rng() * 2 - 1) * 5;
    this.phase = "armed";
    this.outcome = null;
    this.conflictExisted = false;
    this.minPlayerJunctionM = Infinity;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const dPJ = dist(input.x, input.y, s.junction.x, s.junction.y);

    if (this.phase === "armed") {
      if (dPJ <= this.releaseDistM && approaching(input, s.junction.x, s.junction.y)) {
        traffic.stagedCommand(s.id, { type: "cruise" });
        this.phase = "triggered";
      }
      return null;
    }

    // triggered
    const dPC = dist(input.x, input.y, actor.x, actor.y);
    const cyclistArc = actor.s - actor.nodeS[s.junctionNodeIndex];
    if (dPC <= s.conflictWindowM && dPJ <= 45) this.conflictExisted = true;
    if (dPJ < this.minPlayerJunctionM) this.minPlayerJunctionM = dPJ;

    // Contact — grades COLLISION (cyclist) through the existing reducer.
    if (dPC < CYCLIST_CONTACT_M && input.speedKmh > 3) {
      out.push({ kind: "collision", withWhat: "cyclist" });
      return this.resolve(input, false, "collision");
    }
    // The hook: right turn started at the junction with the cyclist alongside
    // and not yet clear. No runtime detector covers this (the cyclist rides
    // the player's own direction, so conflictFromRight's same-direction
    // filter correctly ignores it) — the director adjudicates and emits the
    // existing prioritySituation vocabulary (grades FAILED_TO_YIELD).
    for (const e of input.tickEvents) {
      if (e.kind === "turnStarted" && e.direction === "right" && dPJ <= 40) {
        if (cyclistArc < CYCLIST_CLEAR_ARC_M && dPC <= s.dangerRadiusM) {
          out.push({ kind: "prioritySituation", situation: "cyclist-right-hook", violated: true });
          return this.resolve(input, false, "violation");
        }
      }
    }
    // Player completed the junction passage cleanly.
    if (this.minPlayerJunctionM < HOOK_PASS_NEAR_M && dPJ > HOOK_PASS_FAR_M) {
      if (this.conflictExisted) {
        out.push({
          kind: "prioritySituation",
          situation: "cyclist-right-hook",
          violated: false,
          yielded: true,
        });
        return this.resolve(input, true, "yielded");
      }
      return this.resolve(input, true, "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail);
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 5. Roundabout entry conflict (L3)
// ---------------------------------------------------------------------------

/** Lock the circulation speed once the player is this close to the entry, m. */
const RB_LOCK_PLAYER_ENTRY_M = 14;
/** Resolve "clear" once the player is this far beyond the ring band, m. */
const RB_EXIT_MARGIN_M = 30;

export class RoundaboutEntryRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private conflictLeadM = 0;

  constructor(readonly spec: RoundaboutEntrySpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        loop: true,
        colorIndex: s.actor.colorIndex,
        playerGuard: true,
      });
      if (!view) throw new Error(`staged event ${s.id}: ring path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.conflictLeadM = s.conflictLeadM + (rng() * 2 - 1) * 3;
    this.phase = "armed";
    this.outcome = null;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null; // circulator keeps looping — ambient life
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const dCenter = dist(input.x, input.y, s.center.x, s.center.y);

    // The runtime's roundabout tracker adjudicates off the staged circulator
    // (circulatingConflict sees it like any NPC) — and it can fire already on
    // the APPROACH (its arm zone reaches 12 m beyond the ring), so listen in
    // every live phase, not just after the lock.
    for (const e of input.tickEvents) {
      if (e.kind === "prioritySituation" && e.situation === "roundabout") {
        if (e.violated) return this.resolve(input, false, "violation");
        if (e.yielded) return this.resolve(input, true, "yielded");
      }
    }

    if (this.phase === "armed") {
      if (dCenter > s.armDistM) return null;
      const dEntry = dist(input.x, input.y, s.entry.x, s.entry.y);
      if (dEntry <= RB_LOCK_PLAYER_ENTRY_M) {
        traffic.stagedCommand(s.id, { type: "cruise" }); // lock the circulation
        this.phase = "triggered";
        return null;
      }
      // Sync: be `conflictLeadM` upstream of the player's entry when they
      // reach the yield line — the "do I go or wait" moment, guaranteed.
      const conflictS = actor.nodeS[s.entryNodeIndex] - this.conflictLeadM;
      const arcToGo = loopArc(conflictS - actor.s, actor.pathLengthM);
      const eta = dEntry / Math.max(input.speedKmh * KMH_TO_MPS, 2.5);
      const target = Math.min(
        s.maxSyncSpeedMps,
        Math.max(s.minSyncSpeedMps, arcToGo / Math.max(eta, 0.6)),
      );
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: target });
      return null;
    }

    // triggered — waiting on the runtime adjudication scanned above.
    // Player struck the circulator (frontal — the player is the striker).
    const dPC = dist(input.x, input.y, actor.x, actor.y);
    if (dPC < VEHICLE_CONTACT_M && input.speedKmh > 3) {
      const rad = (input.headingDeg * Math.PI) / 180;
      const ahead = (actor.x - input.x) * Math.sin(rad) + (actor.y - input.y) * Math.cos(rad);
      if (ahead > 0) {
        out.push({ kind: "collision", withWhat: "vehicle" });
        return this.resolve(input, false, "collision");
      }
    }
    if (dCenter > s.ringRadiusM + RB_EXIT_MARGIN_M) {
      return this.resolve(input, true, "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail);
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 6. Amber dilemma (B1a — doc 72 JU-06, capability N2). No actor: the runner
//    pins the junction's signal-cluster offset when the player arms the
//    approach, so the green→yellow flip lands `flipEtaSec` (± seeded jitter)
//    of travel time before the stop line. Grading is 100% the existing
//    pipeline — the runtime's stopLineCrossed (yellow + `stoppable`
//    adjudication / redYellow / red) through the rule engine; the runner
//    only watches those same events to record the outcome.
// ---------------------------------------------------------------------------

/** Player counts as stopped for the dilemma resolution at/under this, km/h. */
const AMBER_STOPPED_KMH = 1.5;
/** Minimum assumed approach speed for the ETA projection, m/s. */
const AMBER_MIN_ETA_MPS = 3;

export class AmberDilemmaRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private flipEtaSec = 0;
  private approachSpeedKmh = 0;
  private approachBearingDeg = 0;

  constructor(
    readonly spec: AmberDilemmaSpec,
    private readonly signals: SignalDirectorPort | null,
  ) {}

  stage(_traffic: StagedTrafficPort, rng: Rng, _firstTime: boolean): void {
    // No actor to stage — only the per-attempt jitter draw (determinism:
    // same seed + attempt = same flip timing).
    this.flipEtaSec = this.spec.flipEtaSec + (rng() * 2 - 1) * 0.15;
    this.phase = "armed";
    this.outcome = null;
    this.approachSpeedKmh = 0;
    this.approachBearingDeg = 0;
  }

  step(_traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const d = dist(input.x, input.y, s.junction.x, s.junction.y);

    if (this.phase === "armed") {
      if (
        d <= s.armDistM &&
        input.speedKmh >= s.minTriggerSpeedKmh &&
        approaching(input, s.junction.x, s.junction.y)
      ) {
        // Pin the flip: yellow starts when the player is `flipEtaSec` of
        // travel time from THEIR stop line, projected at the current speed.
        const lineDistM = Math.max(0, d - s.lineDistM);
        const etaSec = lineDistM / Math.max(input.speedKmh * KMH_TO_MPS, AMBER_MIN_ETA_MPS);
        const flipInSec = Math.max(0, etaSec - this.flipEtaSec);
        this.approachBearingDeg = input.headingDeg;
        if (this.signals !== null) {
          const offset = this.signals.signalOffsetForPhaseStart(
            s.signalNodeId,
            this.approachBearingDeg,
            "yellow",
            flipInSec,
          );
          this.signals.setSignalClusterOffset(s.signalNodeId, offset);
        }
        this.approachSpeedKmh = input.speedKmh;
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — the flip is scheduled; the production pipeline grades.
    for (const e of input.tickEvents) {
      if (e.kind !== "stopLineCrossed" || e.control !== "trafficLight") continue;
      if (d > s.lineDistM + 60) continue; // some other junction's line
      if (e.lightState === "green") return this.resolve(input, true, "clear");
      if (e.lightState === "yellow") {
        // The runtime's amber adjudication decided: stoppable = the gamble
        // (graded YELLOW_LIGHT_NOT_STOPPED by the reducer); not stoppable /
        // unknown = the legal dilemma-zone clearance.
        return e.stoppable === true
          ? this.resolve(input, false, "violation")
          : this.resolve(input, true, "clear");
      }
      // red / redYellow — RED_LIGHT_CROSSED / RED_YELLOW_CROSSED graded.
      return this.resolve(input, false, "violation");
    }
    // Stopped before the line while the signal forbids entry = the correct
    // stop decision.
    if (
      input.speedKmh <= AMBER_STOPPED_KMH &&
      d >= s.lineDistM - 3 &&
      d <= s.armDistM &&
      this.signals !== null
    ) {
      const phase = this.signals.signalPhaseInfo(s.signalNodeId, this.approachBearingDeg).phase;
      if (phase === "yellow" || phase === "red") {
        return this.resolve(input, true, "yielded");
      }
    }
    // Defensive: drove past the junction without a line event.
    if (aheadOfPlayerM(input, s.junction.x, s.junction.y) < -20) {
      return this.resolve(input, true, "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail, {
      approachSpeedKmh: this.approachSpeedKmh,
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 7. Oncoming left turn (N1 — doc 72 JU-10, the left-turn-across-path
//    archetype). The runner is choreography + measurement only: it times an
//    oncoming actor STRAIGHT through the junction so it sits `gapSec` short
//    of the node at the player's projected node arrival, then lets the
//    runtime's own N1 tracker adjudicate ("left-turn-oncoming" →
//    FAILED_TO_YIELD / YIELDED_TO_PRIORITY). The ACCEPTED GAP (seconds to
//    the oncoming at the player's commit) is recorded on the outcome —
//    scenarios rubric < 3 s as the unsafe-but-legal advisory (doc 72 JU-10:
//    "< 4 s away" is the taught mistake; conviction lives at ≤ 2 s).
// ---------------------------------------------------------------------------

/** Sync cap: the oncoming's plausible urban speed band, m/s. */
const LTAP_SYNC_MAX_MPS = 11.5;
/** Position-feedback gain: m/s of speed correction per meter of lead error.
 * The sync holds the actor at (playerNodeEta + gapSec) × cruise metres from
 * the node, so it crosses AT CRUISE SPEED with the authored gap — a crawling
 * "oncoming" would be a soft target and a soft lesson. */
const LTAP_SYNC_GAIN = 0.35;
/** Player yielding at/under this speed commits the actor through, km/h. */
const LTAP_YIELD_KMH = 8;
/** The encounter is over this far past the node, m (beyond the runtime's
 * 36 m oncoming radius so a waiting player can never meet a stale conflict). */
const LTAP_CLEAR_ARC_M = 40;
/** turnStarted farther than this from the junction is some other corner, m. */
const LTAP_COMMIT_NEAR_M = 45;

export class OncomingLeftTurnRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private gapSec = 0;
  private committed = false;
  private sawYield = false;
  private acceptedGapSec: number | undefined;

  constructor(readonly spec: OncomingLeftTurnSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        loop: s.actor.loop,
        colorIndex: s.actor.colorIndex,
        playerGuard: true, // never ram the player — the guard-stopped victim
        // still convicts via the runtime's gap-memory latch
      });
      if (!view) throw new Error(`staged event ${s.id}: oncoming path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.gapSec = s.gapSec + (rng() * 2 - 1) * 0.15;
    this.phase = "armed";
    this.outcome = null;
    this.committed = false;
    this.sawYield = false;
    this.acceptedGapSec = undefined;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const d = dist(input.x, input.y, s.junction.x, s.junction.y);
    const carArc = actor.s - actor.nodeS[s.junctionNodeIndex]; // <0 before node

    // Adjudication watch — live in every phase (the runtime may fire early).
    // Event order within a tick: turnStarted (runtime step 4) precedes the
    // tracker's prioritySituation (step 4a'), so the gap measurement lands
    // before the resolution scan reads the grade.
    for (const e of input.tickEvents) {
      if (
        e.kind === "turnStarted" &&
        e.direction === "left" &&
        d <= LTAP_COMMIT_NEAR_M &&
        !this.committed
      ) {
        this.committed = true;
        if (carArc < -0.5 && actor.speedMps >= 1) {
          // Seconds until the oncoming reaches the junction — the accepted gap.
          this.acceptedGapSec = -carArc / actor.speedMps;
        }
      }
      if (e.kind === "prioritySituation" && e.situation === "left-turn-oncoming") {
        if (this.acceptedGapSec === undefined && e.gapSec !== undefined) {
          this.acceptedGapSec = e.gapSec;
        }
        if (e.violated) return this.resolve(input, false, "violation");
        if (e.yielded) return this.resolve(input, true, "yielded");
      }
    }

    // Contact in the box (frontal — the player crossed into the oncoming).
    if (
      dist(input.x, input.y, actor.x, actor.y) < VEHICLE_CONTACT_M &&
      input.speedKmh + actor.speedMps * 3.6 > 5
    ) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(input, false, "collision");
    }

    if (this.phase === "armed") {
      if (d > s.armDistM) return null;
      const carDist = -carArc;
      if (carDist <= 2) {
        // Through the node — sprint clear of the 36 m oncoming radius.
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: s.clearSpeedMps });
        this.phase = "triggered";
        return null;
      }
      if (this.committed || input.speedKmh <= LTAP_YIELD_KMH) {
        // The player decided (turned, or is yielding at the mouth): the
        // actor takes its priority at full cruise and the dilemma plays out.
        traffic.stagedCommand(s.id, { type: "cruise" });
        this.phase = "triggered";
        return null;
      }
      if (d <= 10) {
        // At the node — freeze the staging (last synced speed ≈ cruise) so
        // the delivered gap stays the authored tier; syncing against the
        // flattening corner distance would distort it.
        this.phase = "triggered";
        return null;
      }
      // Arrival sync (position feedback): hold the actor at
      // (playerNodeEta + gapSec) × cruise metres from the node, so at the
      // player's projected node arrival it is `gapSec` short — AT CRUISE.
      const playerNodeEta = d / Math.max(input.speedKmh * KMH_TO_MPS, 3);
      const desiredCarDist = (playerNodeEta + this.gapSec) * s.actor.cruiseSpeedMps;
      const target = Math.min(
        LTAP_SYNC_MAX_MPS,
        Math.max(0, s.actor.cruiseSpeedMps + LTAP_SYNC_GAIN * (carDist - desiredCarDist)),
      );
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: target });
      return null;
    }

    // triggered — the runtime tracker adjudicates; we only watch for the end.
    if (input.speedKmh <= LTAP_YIELD_KMH && Math.abs(carArc) <= 36 && d <= s.armDistM) {
      this.sawYield = true; // waited while the oncoming held the junction
    }
    if (carArc > 6) {
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: s.clearSpeedMps });
    }
    if (carArc > LTAP_CLEAR_ARC_M || actor.finished) {
      // A yielding player's commendation lands at their LATER commit — hold
      // the resolution open while they are still at the junction about to
      // take the (now clear) turn.
      if (this.sawYield && !this.committed && d <= 60) return null;
      // Otherwise: a clean-gap turn (accepted gap recorded for the rubric),
      // or the encounter dissolved without a commitment.
      return this.resolve(input, true, "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail, {
      ...(this.acceptedGapSec !== undefined ? { acceptedGapSec: this.acceptedGapSec } : {}),
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 8. Narrow-street meeting (N1 — doc 72 OV-14). A parked row leaves one
//    usable lane; an oncoming actor transits as the player arrives. ЗДвП
//    narrow-passage priority: the side WITH the obstruction yields. The
//    authored obstruction side lives only in the spec, so the ADJUDICATION
//    lives here (cyclist-right-hook precedent) — emitting ONLY the reserved
//    prioritySituation vocabulary ("narrow-meeting").
// ---------------------------------------------------------------------------

/** House disciplines (mirroring the runtime's yield adjudication): */
const NM_SUSTAIN_SEC = 0.9; // reaction window before any conviction
const NM_STANDDOWN_MAX_SEC = 3.0; // D1-bounded braking-response immunity
/** Forcing the oncoming to a guard standstill this long = the barge stands
 * even though the player stopped too (nose-to-nose stalemate they caused). */
const NM_BLOCK_CONVICT_SEC = 4.0;
/** Player over the centerline by more than this = in the oncoming lane, m. */
const NM_LANE_OVER_M = 1.2;
/** Moving faster than this while in conflict = barging, km/h. */
const NM_BARGE_MIN_KMH = 6;
/** The oncoming within this beyond its entrance counts as arriving, m. */
const NM_ONCOMING_NEAR_M = 25;
/** Yield credit is observable this far before the section start, m. */
const NM_WAIT_ZONE_M = 45;
/** Actor sync clamp, m/s. */
const NM_SYNC_MIN_MPS = 1.5;

export class NarrowMeetingRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  // Section frame (unit start→end + left normal), built once.
  private readonly ux: number;
  private readonly uy: number;
  private readonly lx: number;
  private readonly ly: number;
  private readonly lenM: number;

  private transitSpeedMps = 0;
  private condSince: number | null = null; // conflict-visible onset
  private convictSince: number | null = null; // live barge condition onset
  private blockSince: number | null = null; // oncoming guard-stopped onset
  private sawConflict = false;
  private sawWait = false;
  private holding = false; // obstructionSide "oncoming": actor holds at entry

  constructor(readonly spec: NarrowMeetingSpec) {
    const dx = spec.sectionEnd.x - spec.sectionStart.x;
    const dy = spec.sectionEnd.y - spec.sectionStart.y;
    this.lenM = Math.max(1, Math.hypot(dx, dy));
    this.ux = dx / this.lenM;
    this.uy = dy / this.lenM;
    // Left of travel (x east, y north): rotate (ux, uy) 90° CCW.
    this.lx = -this.uy;
    this.ly = this.ux;
  }

  private along(x: number, y: number): number {
    return (x - this.spec.sectionStart.x) * this.ux + (y - this.spec.sectionStart.y) * this.uy;
  }

  private lat(x: number, y: number): number {
    return (x - this.spec.sectionStart.x) * this.lx + (y - this.spec.sectionStart.y) * this.ly;
  }

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        colorIndex: s.actor.colorIndex,
        playerGuard: true, // never rams a player blocking its lane — the
        // guard standstill IS the barge evidence
      });
      if (!view) throw new Error(`staged event ${s.id}: oncoming path failed to stage`);
      for (let i = 0; i < (s.props?.length ?? 0); i++) {
        const p = s.props![i];
        const propView = traffic.stage({
          kind: "vehicle",
          id: `${s.id}-prop-${i}`,
          pathNodes: p.pathNodes,
          hold: p.hold,
          cruiseSpeedMps: 0, // parked row — never commanded
          // NOTE: keep prop offsets at 0/negative — a positive curb offset
          // tags the state as a cyclist proxy (A11 vehicleCollisionKind).
          extraRightOffsetM: p.extraRightOffsetM,
          colorIndex: p.colorIndex,
        });
        if (!propView) throw new Error(`staged event ${s.id}: prop ${i} failed to stage`);
      }
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
      for (let i = 0; i < (s.props?.length ?? 0); i++) {
        traffic.stagedCommand(`${s.id}-prop-${i}`, { type: "reset" });
      }
    }
    this.transitSpeedMps = (s.transitSpeedMps ?? s.actor.cruiseSpeedMps) + (rng() * 2 - 1) * 0.3;
    this.phase = "armed";
    this.outcome = null;
    this.condSince = null;
    this.convictSince = null;
    this.blockSince = null;
    this.sawConflict = false;
    this.sawWait = false;
    this.holding = false;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const entryArc = actor.nodeS[s.actorEntry.nodeIndex] + s.actorEntry.offsetM;
    const playerAlong = this.along(input.x, input.y);
    const playerLat = this.lat(input.x, input.y);
    const actorAlong = this.along(actor.x, actor.y);
    const dStart = dist(input.x, input.y, s.sectionStart.x, s.sectionStart.y);

    // Contact — the player squeezed into the oncoming.
    if (
      dist(input.x, input.y, actor.x, actor.y) < VEHICLE_CONTACT_M &&
      input.speedKmh + actor.speedMps * 3.6 > 4
    ) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(input, false, "collision");
    }

    if (s.obstructionSide === "oncoming") {
      // The ONCOMING carries the obstruction: it yields at ITS entrance while
      // the player transits with priority. Nothing about the player grades —
      // proceeding on your priority is simply correct (RHR precedent: no
      // commendation for taking priority, no violation either).
      if (this.phase === "armed") {
        if (dStart <= s.armDistM && approaching(input, s.sectionStart.x, s.sectionStart.y)) {
          traffic.stagedCommand(s.id, { type: "cruise" });
          this.phase = "triggered";
        }
        return null;
      }
      if (!this.holding && actor.s >= entryArc - 3) {
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: 0 }); // yields
        this.holding = true;
      }
      if (playerAlong > this.lenM + 3) {
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: this.transitSpeedMps });
        return this.resolve(input, true, "clear");
      }
      return null;
    }

    // Obstruction on the PLAYER's side — the player must yield.
    if (this.phase === "armed") {
      if (dStart > s.armDistM && playerAlong < -8) return null;
      const carDistToEntry = entryArc - actor.s;
      if (carDistToEntry <= 4 || playerAlong > -8) {
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: this.transitSpeedMps });
        this.phase = "triggered";
        return null;
      }
      // Sync the actor to reach its entrance about when the player reaches
      // theirs — the meeting is guaranteed mid-block.
      const playerEta = Math.max(0.6, (playerAlong < 0 ? -playerAlong : 0) / Math.max(input.speedKmh * KMH_TO_MPS, 2));
      const target = Math.min(
        this.transitSpeedMps,
        Math.max(NM_SYNC_MIN_MPS, carDistToEntry / playerEta),
      );
      traffic.stagedCommand(s.id, { type: "cruise", speedMps: target });
      return null;
    }

    // triggered — adjudicate.
    const actorCleared = actorAlong < playerAlong - 4 || actorAlong < -4 || actor.finished;
    const conflictLive = !actorCleared && actorAlong <= this.lenM + NM_ONCOMING_NEAR_M;
    if (conflictLive && this.condSince === null) this.condSince = input.tSec;
    if (conflictLive && dStart <= NM_WAIT_ZONE_M + this.lenM) this.sawConflict = true;
    if (
      this.sawConflict &&
      !actorCleared &&
      input.speedKmh <= LTAP_YIELD_KMH &&
      playerAlong < 4 &&
      playerLat <= NM_LANE_OVER_M
    ) {
      this.sawWait = true; // waiting at the widening, own side
    }

    const playerInSection = playerAlong >= -2 && playerAlong <= this.lenM + 2;
    const barging = conflictLive && playerInSection && playerLat > NM_LANE_OVER_M;
    if (barging && input.speedKmh > NM_BARGE_MIN_KMH) {
      if (this.convictSince === null) this.convictSince = input.tSec;
    } else {
      this.convictSince = null;
    }
    if (barging && actor.speedMps < 0.5) {
      if (this.blockSince === null) this.blockSince = input.tSec;
    } else {
      this.blockSince = null;
    }

    const standDown =
      input.brakePedal >= BRAKE_ONSET_THRESHOLD &&
      this.condSince !== null &&
      input.tSec - this.condSince <= NM_STANDDOWN_MAX_SEC;
    const visibleLongEnough =
      this.condSince !== null && input.tSec - this.condSince >= NM_SUSTAIN_SEC;
    const bargeSustained =
      this.convictSince !== null && input.tSec - this.convictSince >= NM_SUSTAIN_SEC;
    const blockedOut = this.blockSince !== null && input.tSec - this.blockSince >= NM_BLOCK_CONVICT_SEC;
    if (visibleLongEnough && ((bargeSustained && !standDown) || blockedOut)) {
      out.push({ kind: "prioritySituation", situation: "narrow-meeting", violated: true });
      return this.resolve(input, false, "violation");
    }

    if (actorCleared) {
      if (this.sawWait) {
        out.push({
          kind: "prioritySituation",
          situation: "narrow-meeting",
          violated: false,
          yielded: true,
        });
        return this.resolve(input, true, "yielded");
      }
      return this.resolve(input, true, "clear");
    }
    return null;
  }

  private resolve(
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail);
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------

export function createRunner(
  spec: StagedEventSpec,
  signals: SignalDirectorPort | null = null,
): EventRunner {
  switch (spec.kind) {
    case "pedestrianDartOut":
      return new PedestrianDartOutRunner(spec);
    case "priorityFromRight":
      return new PriorityFromRightRunner(spec);
    case "brakingLeadCar":
      return new BrakingLeadCarRunner(spec);
    case "cyclistRightHook":
      return new CyclistRightHookRunner(spec);
    case "roundaboutEntry":
      return new RoundaboutEntryRunner(spec);
    case "amberDilemma":
      return new AmberDilemmaRunner(spec, signals);
    case "oncomingLeftTurn":
      return new OncomingLeftTurnRunner(spec);
    case "narrowMeeting":
      return new NarrowMeetingRunner(spec);
  }
}
