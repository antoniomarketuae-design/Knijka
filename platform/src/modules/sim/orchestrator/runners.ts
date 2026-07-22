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
  CutInLeadCarSpec,
  CyclistRightHookSpec,
  EmergencyApproachSpec,
  NarrowMeetingSpec,
  OncomingLeftTurnSpec,
  OncomingStreamSpec,
  PedestrianDartOutSpec,
  PoliceStopSpec,
  PriorityFromRightSpec,
  RearTailgaterSpec,
  RoundaboutEntrySpec,
  StagedEventOutcome,
  StagedEventSpec,
  TelltaleStimulusSpec,
  TrafficControllerSpec,
  TrainPassSpec,
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

/** Fold a compass bearing (0 = north, cw) onto the N-S / E-W axis it is closest
 *  to (45° split). Mirrors runtime/geometry axisOfBearing WITHOUT a cross-module
 *  import — the orchestrator keeps its own tiny geometry (aheadOfPlayerM &co).
 *  Used by the traffic-controller runner to attribute the halt to the player's
 *  OWN approach axis regardless of which group the schedule halts. */
function axisOfBearing(deg: number): "ns" | "ew" {
  const folded = (((deg % 360) + 360) % 360) % 180; // [0, 180)
  return folded <= 45 || folded >= 135 ? "ns" : "ew";
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
  /** N11 cockpit-lamp channel (telltaleStimulus only): true while the staged
   *  dashboard warning telltale is lit — the director ORs it into its own
   *  `telltaleLit` scene seam (the hazardActive twin; the cluster and the
   *  L1/L2 HUD cue read it). Absent on every other runner. */
  readonly telltaleLit?: boolean;
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
  /** Ball-lead walker release clock (spec.ballLeadSec): tSec at/after which
   *  the walker cruises; null = released (or no ball authored). */
  private releaseAtSec: number | null = null;
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
        // R3 #25–28 body variant (child / elder+white-cane) — render-side
        // mapping only; absent = the adult rig, byte-identical staging.
        ...(s.variant !== undefined ? { variant: s.variant } : {}),
      });
      if (!view) throw new Error(`staged event ${s.id}: pedestrian path failed to stage`);
      // Stationary prop vehicles (ADR-006 stage 3b — RX-04's halted tram at
      // the island stop): the narrowMeeting-props recipe verbatim — staged
      // held actors, cruise 0, NEVER commanded; `profile` renders the rig.
      for (let i = 0; i < (s.props?.length ?? 0); i++) {
        const p = s.props![i];
        const propView = traffic.stage({
          kind: "vehicle",
          id: `${s.id}-prop-${i}`,
          pathNodes: p.pathNodes,
          hold: p.hold,
          cruiseSpeedMps: 0, // halted scenery — never commanded
          // NOTE: keep prop offsets at 0/negative — a positive curb offset
          // tags the state as a cyclist proxy (A11 vehicleCollisionKind).
          extraRightOffsetM: p.extraRightOffsetM,
          colorIndex: p.colorIndex,
          profile: p.profile,
        });
        if (!propView) throw new Error(`staged event ${s.id}: prop ${i} failed to stage`);
      }
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
      for (let i = 0; i < (s.props?.length ?? 0); i++) {
        traffic.stagedCommand(`${s.id}-prop-${i}`, { type: "reset" });
      }
    }
    this.triggerDistM = s.triggerDistM + (rng() * 2 - 1) * 3;
    this.phase = "armed";
    this.outcome = null;
    this.sawSlow = false;
    this.approachSpeedKmh = 0;
    this.hazardActive = false;
    this.releaseAtSec = null;
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
        // R3 #27 ball cue: with `ballLeadSec` authored, the trigger first
        // rolls the lesson's hazard ball (the WARNING the anticipation
        // lesson teaches) and releases the walker a beat later; the
        // reaction stopwatch arms at the BALL — that is the stimulus.
        // Without it: the walker releases now, byte-identical.
        if (s.ballLeadSec !== undefined) {
          this.hazardActive = true;
          this.releaseAtSec = input.tSec + s.ballLeadSec;
        } else {
          traffic.stagedCommand(s.id, { type: "cruise" });
        }
        this.phase = "triggered";
        this.timer.arm(input.tSec);
        this.approachSpeedKmh = input.speedKmh;
      }
      return null;
    }

    // triggered
    if (this.releaseAtSec !== null && input.tSec >= this.releaseAtSec) {
      traffic.stagedCommand(s.id, { type: "cruise" });
      this.releaseAtSec = null;
    }
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
/** Witness-gate ETA floor, m/s — low on purpose (unlike the sync's 3 m/s
 * floor): a stopped/creeping student must read as NOT arriving, so the held
 * car keeps waiting for them instead of crossing an empty box (doc 62 S2). */
const WITNESS_MIN_SPEED_MPS = 0.5;

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
        // VU-10: a crossing EMERGENCY actor publishes its profile so the
        // fleet renders the special-regime rig (absent = car, byte-identical
        // — every pre-VU-10 priority spec authors no profile).
        profile: s.actor.profile,
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
        // S2 witness gate (doc 62 founder R3 #15/#16/#17/#18): the distance
        // gate alone still lies about ARRIVAL — a hesitant live student 22 m
        // out can be half a minute from the line, and a car released now has
        // long cleared the box when they finally arrive ("waits for
        // nothing"). When the spec opts in, defer the release until the
        // player is truly about to witness it: raw (unfloored) ETA at/under
        // etaSec, or physically at the mouth (nearLineM). A scripted-pace
        // approach passes the ETA test on the same frame the distance gate
        // fires, so recorded choreography is untouched.
        const w = s.witnessArm;
        const rawEtaSec =
          playerLineDist / Math.max(input.speedKmh * KMH_TO_MPS, WITNESS_MIN_SPEED_MPS);
        if (w === undefined || playerLineDist <= w.nearLineM || rawEtaSec <= w.etaSec) {
          traffic.stagedCommand(s.id, { type: "cruise" }); // through the box
          this.phase = "triggered";
          return null;
        }
        // Not committed: fall through — the hold/sync branches below keep
        // walking the car to (and pin it at) its hold short of the box, so
        // the eventual release is always a short, fully visible crossing.
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
        // The authored lane offset (≤ 0 — a positive curb offset would tag the
        // actor as a cyclist proxy, A11 vehicleCollisionKind). Forwarded like
        // CutInLeadCarRunner does: a lane-locked lead (sc-lane-change's
        // blind-spot pace car authors −8.125 to sit in the TARGET lane) must
        // stage in that lane, not the player's own.
        extraRightOffsetM: s.actor.extraRightOffsetM,
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
        // A cyclistRightHook actor IS a cyclist by definition — default the
        // RENDER profile to the bicycle rig at stage time (runtime only, so
        // compiled LessonSpecs stay byte-identical; covers the counter-flow
        // rider too, whose NEGATIVE curb offset the A11 grading tag ignores
        // on purpose). Authored profiles (e.g. "childCyclist") win.
        profile: s.actor.profile ?? "cyclist",
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
        // RX-05: an oncoming TRAM publishes its profile so the fleet renders
        // the articulated rig (absent = car, byte-identical — every pre-tram
        // oncoming spec authors no profile). The N1 gap adjudication is
        // untouched: the tram is a point-based path actor like any oncoming.
        profile: s.actor.profile,
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
// 9. Emergency approach (ADR-006 stage 1b — doc 72 §15 N9, VU-09 „Линейка
//    отзад", ЗДвП чл. 91). The emergency actor (profile "emergency") closes
//    from behind on the player's left edge; the graded duty is to MAKE WAY —
//    ease right and/or slow so it can pass, never block. Every runtime
//    priority query looks AHEAD of the player, so the adjudication lives here
//    (cyclist-right-hook precedent), emitting ONLY the reserved
//    prioritySituation vocabulary ("emergency" → EMERGENCY_NOT_YIELDED /
//    YIELDED_TO_PRIORITY through the existing reducer).
//
//    Bias away from false positives (the A12 law):
//     - the duty arms ONLY for this staged actor, behind within armBehindM
//       and genuinely closing — ambient traffic can never arm it;
//     - the response window is generous (authored 6–8 s), and conviction
//       requires the window to EXPIRE with the player still centered at
//       speed — a rightward shift ≥ yieldShiftM, slowing to ≤ yieldSlowKmh
//       while keeping right, or simply standing (stopped at the curb) all
//       latch the yield permanently;
//     - an active brake pedal at expiry DEFERS the conviction (a student
//       mid-response is responding, not refusing);
//     - once the actor has passed, the runner stands down — one adjudication
//       per approach; an EV that got by cleanly convicts nobody.
// ---------------------------------------------------------------------------

/** Actor must be faster than the player by this to count as closing, km/h. */
const EM_CLOSING_MIN_KMH = 3;
/** Player at/under this is standing — the immediate yield response, km/h. */
const EM_STOPPED_KMH = 3;
/** Slowing counts while not drifted LEFT of the baseline by more than this, m. */
const EM_KEEP_RIGHT_TOL_M = 0.4;
/** Conviction needs the player above yieldSlowKmh by this margin, km/h. */
const EM_SPEED_MARGIN_KMH = 2;
/** Guard-stopped actor pinned behind a drifted-left player this long = the
 *  block stands even at low speed (nose-to-tail stalemate they caused), s. */
const EM_BLOCK_CONVICT_SEC = 3;
/** Actor still counts as behind/alongside beyond this player-frame arc, m. */
const EM_STILL_BEHIND_M = 2;

export class EmergencyApproachRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private releaseGapM = 0;
  private responseWindowSec = 0;
  private dutyArmedAt: number | null = null;
  private blockSince: number | null = null;
  private sawYield = false;
  private approachSpeedKmh = 0;
  // Signed lateral drift since duty-arm, ACCUMULATED in the vehicle frame
  // (+ = right). Incremental — each frame adds the position delta projected
  // on the mid-heading right axis, so forward travel along a CURVING road
  // never bleeds into the measure (a fixed world-frame baseline would decay
  // over a bending block and rob a slowing yielder of the latch).
  private shiftRightM = 0;
  private prevX = 0;
  private prevY = 0;
  private prevHeadingDeg = 0;

  constructor(readonly spec: EmergencyApproachSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        // VU-09: hold the actor to the player's launch pace (author ≤ the
        // ghost's ramp) so an early-released ambulance rides the player's tail
        // through the slow launch instead of surging past it — the yield duty
        // then arms only once the player is at cruise and still in the corridor.
        ...(s.actor.accelMps2 !== undefined ? { accelMps2: s.actor.accelMps2 } : {}),
        extraRightOffsetM: s.actor.extraRightOffsetM,
        colorIndex: s.actor.colorIndex,
        // VU-09: publish the emergency profile so the fleet renders the
        // white special-regime rig with the blue light bar (ADR-001).
        profile: s.actor.profile,
        playerGuard: true, // never rams a player blocking its corridor — the
        // guard standstill IS the blocking evidence
      });
      if (!view) throw new Error(`staged event ${s.id}: emergency path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.releaseGapM = s.releaseGapM + (rng() * 2 - 1) * 4;
    this.responseWindowSec = s.responseWindowSec + (rng() * 2 - 1) * 0.4;
    this.phase = "armed";
    this.outcome = null;
    this.dutyArmedAt = null;
    this.blockSince = null;
    this.sawYield = false;
    this.approachSpeedKmh = 0;
    this.shiftRightM = 0;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;

    // Player-frame arc of the actor: > 0 = the actor is ahead of the player.
    const actorAheadM = aheadOfPlayerM(input, actor.x, actor.y);
    const behindM = -actorAheadM;

    // Contact — the player steered into the passing actor (the rear is
    // covered by the player guard; a side swipe is the player's doing).
    if (
      dist(input.x, input.y, actor.x, actor.y) < VEHICLE_CONTACT_M &&
      input.speedKmh + actor.speedMps * 3.6 > 5
    ) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(traffic, input, false, "collision");
    }

    if (this.phase === "armed") {
      // Release the run once the player is far enough ahead along the road
      // and travelling the actor's direction (a reversed/lost player never
      // stages a rear approach at their face).
      const actorBearing = (Math.atan2(actor.dirX, actor.dirY) * 180) / Math.PI;
      const delta = Math.abs((((actorBearing - input.headingDeg) % 360) + 540) % 360 - 180);
      if (behindM >= this.releaseGapM && delta <= APPROACH_MAX_DEG) {
        traffic.stagedCommand(s.id, { type: "cruise" });
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — the actor is running.
    if (this.dutyArmedAt === null) {
      const closing = actor.speedMps * 3.6 > input.speedKmh + EM_CLOSING_MIN_KMH;
      if (behindM > EM_STILL_BEHIND_M && behindM <= s.armBehindM && closing) {
        this.dutyArmedAt = input.tSec;
        this.approachSpeedKmh = input.speedKmh;
        this.shiftRightM = 0;
        this.prevX = input.x;
        this.prevY = input.y;
        this.prevHeadingDeg = input.headingDeg;
      }
    } else {
      // Accumulate the lateral drift on the mid-heading right axis
      // (x east, y north; heading 0 = north, cw ⇒ right = (cos θ, −sin θ)).
      const dh = ((input.headingDeg - this.prevHeadingDeg) % 360 + 540) % 360 - 180;
      const midRad = ((this.prevHeadingDeg + dh / 2) * Math.PI) / 180;
      this.shiftRightM +=
        (input.x - this.prevX) * Math.cos(midRad) - (input.y - this.prevY) * Math.sin(midRad);
      this.prevX = input.x;
      this.prevY = input.y;
      this.prevHeadingDeg = input.headingDeg;
    }

    // Yield watch — latched permanently once observed during the approach.
    const rightShift = this.shiftRightM;
    if (this.dutyArmedAt !== null) {
      const slowedKeepingRight =
        input.speedKmh <= s.yieldSlowKmh && rightShift >= -EM_KEEP_RIGHT_TOL_M;
      if (
        rightShift >= s.yieldShiftM ||
        slowedKeepingRight ||
        input.speedKmh <= EM_STOPPED_KMH
      ) {
        this.sawYield = true;
      }
    }

    // Passed — stand down (one adjudication per approach), clear ahead & away.
    if (actorAheadM >= s.passAheadM) {
      if (this.dutyArmedAt !== null && this.sawYield) {
        out.push({ kind: "prioritySituation", situation: "emergency", violated: false, yielded: true });
        return this.resolve(traffic, input, true, "yielded");
      }
      // No duty ever armed (or a fast pass beat the window): nothing grades.
      return this.resolve(traffic, input, true, "clear");
    }

    if (this.dutyArmedAt === null) {
      // Defensive: the run dissolved without ever arming (actor parked at its
      // path end far behind a sprinting player).
      if (actor.finished) return this.resolve(traffic, input, true, "clear");
      return null;
    }

    // Blocking evidence: the guard-stopped actor pinned behind a player who
    // drifted into its corridor (only possible while unyielding).
    const blocked =
      !this.sawYield && actor.speedMps < 0.5 && behindM > EM_STILL_BEHIND_M && behindM < 25;
    if (blocked) {
      if (this.blockSince === null) this.blockSince = input.tSec;
    } else {
      this.blockSince = null;
    }
    const blockedOut =
      this.blockSince !== null && input.tSec - this.blockSince >= EM_BLOCK_CONVICT_SEC;

    const windowExpired = input.tSec - this.dutyArmedAt >= this.responseWindowSec;
    const respondingOnBrake = input.brakePedal >= BRAKE_ONSET_THRESHOLD;
    if (
      !this.sawYield &&
      windowExpired &&
      ((input.speedKmh > s.yieldSlowKmh + EM_SPEED_MARGIN_KMH &&
        rightShift < s.yieldShiftM &&
        !respondingOnBrake) ||
        blockedOut)
    ) {
      out.push({ kind: "prioritySituation", situation: "emergency", violated: true });
      return this.resolve(traffic, input, false, "violation");
    }
    return null;
  }

  private resolve(
    traffic: StagedTrafficPort,
    input: DirectorInput,
    success: boolean,
    detail: StagedEventOutcome["detail"],
  ): StagedEventOutcome {
    // Clear ahead and away regardless of the grade — the encounter is over.
    traffic.stagedCommand(this.spec.id, {
      type: "cruise",
      speedMps: this.spec.clearSpeedMps ?? this.spec.actor.cruiseSpeedMps,
    });
    this.phase = "resolved";
    this.outcome = outcomeOf(this.spec, input, success, detail, {
      ...(this.approachSpeedKmh > 0 ? { approachSpeedKmh: this.approachSpeedKmh } : {}),
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 10. Police stop (ADR-006 stage 1c — doc 72 §3 VP-11 „Спиране по полицейски
//     сигнал", Наредба-38 / ЗДвП чл. 170). SCENERY + MEASUREMENT ONLY: the
//     runner stages the officer FIGURE (a staged pedestrian that never walks —
//     pose "stopSignal" renders the raised arm + hi-vis vest, ADR-001) and
//     records the outcome, but emits ZERO SimTick events — no violation can
//     ever grade from this runner (the A12 bias: an unmodelled duty must not
//     convict; the graded contract is the scenario's low-speed curb-side
//     reachZone objective, the sc-pk-smooth-stop stop-mark pattern).
// ---------------------------------------------------------------------------

/** Short standing path for the officer figure (buildStagedPedPath needs a
 *  polyline > 0.2 m; the figure holds at its start forever), m. */
const POLICE_FACING_PATH_M = 1.5;

export class PoliceStopRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  constructor(readonly spec: PoliceStopSpec) {}

  stage(traffic: StagedTrafficPort, _rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "pedestrian",
        id: s.id,
        // Standing at `officer`, facing along `facing` (toward the roadway).
        // The walk is NEVER commanded — the figure stands for the session.
        path: [
          { x: s.officer.x, y: s.officer.y },
          {
            x: s.officer.x + s.facing.x * POLICE_FACING_PATH_M,
            y: s.officer.y + s.facing.y * POLICE_FACING_PATH_M,
          },
        ],
        speedMps: 0,
        colorIndex: 0,
        pose: "stopSignal",
      });
      if (!view) throw new Error(`staged event ${s.id}: officer figure failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    // No jitter draw: the officer is scenery — nothing about it varies.
    this.phase = "armed";
    this.outcome = null;
  }

  step(_traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    // Complied: at rest (≤ stopSpeedKmh) inside the halt zone — the same
    // radius/speed contract the scenario's stop objective grades (by value).
    if (
      input.speedKmh <= s.stopSpeedKmh &&
      dist(input.x, input.y, s.stop.x, s.stop.y) <= s.stopRadiusM
    ) {
      return this.resolve(input, true, "yielded");
    }
    // Ignored: the officer fell passBeyondM behind without a compliant stop.
    // Outcome only — NO event is emitted, nothing grades (see class doc).
    if (aheadOfPlayerM(input, s.officer.x, s.officer.y) < -s.passBeyondM) {
      return this.resolve(input, false, "passedWithoutStopping");
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
// 11. Traffic controller (ADR-006 stage 1d — doc 72 §3 JU-18 „Регулировчик",
//     ЗДвП чл. 7: сигналите на регулировчика са над светофара; Н38
//     termination item). The runner ARMS the whole mechanic at session start
//     (the signalOffsets/signalModes discipline — authored constants, no
//     step-time RNG): the cluster's controller schedule + optional lamp-phase
//     pin through the SignalDirectorPort, and the posed officer FIGURE (a
//     staged pedestrian that never walks — pose "directTraffic", ADR-001).
//     GRADING IS 100% THE PRODUCTION PIPELINE: the runtime's stopLineCrossed
//     carries the controller permission and the reducer grades it (halt →
//     CONTROLLER_SIGNAL_VIOLATED even on green lamps; proceed → innocent even
//     on red). The runner emits ZERO SimTick events — it only watches those
//     same events to record the outcome (the amberDilemma precedent), so it
//     can never convict on its own (A12).
// ---------------------------------------------------------------------------

/** Short standing path for the controller figure (buildStagedPedPath needs a
 *  polyline > 0.2 m; the figure holds at its start forever), m. */
const CONTROLLER_FACING_PATH_M = 1.5;
/** Player counts as holding at the line at/under this, km/h. */
const CONTROLLER_HOLD_KMH = 4;
/** Holding is observable within this far beyond the stop-line setback, m. */
const CONTROLLER_HOLD_ZONE_M = 12;
/** A line event farther than lineDistM + this from the junction is some
 *  other junction's line, m (the amberDilemma ownership window). */
const CONTROLLER_LINE_OWN_M = 60;

export class TrafficControllerRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private sawHold = false;

  constructor(
    readonly spec: TrafficControllerSpec,
    private readonly signals: SignalDirectorPort | null,
  ) {}

  stage(traffic: StagedTrafficPort, _rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "pedestrian",
        id: s.id,
        // Standing at the junction post, facing the halted approach. The walk
        // is NEVER commanded — the figure stands for the session.
        path: [
          { x: s.officer.x, y: s.officer.y },
          {
            x: s.officer.x + s.facing.x * CONTROLLER_FACING_PATH_M,
            y: s.officer.y + s.facing.y * CONTROLLER_FACING_PATH_M,
          },
        ],
        speedMps: 0,
        colorIndex: 0,
        pose: "directTraffic",
      });
      if (!view) throw new Error(`staged event ${s.id}: controller figure failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    // Arm the signal mechanics — session-start dials, re-applied per attempt
    // exactly like the director's signalOffsets. No jitter draw: everything
    // about the controller is authored (deterministic per (seed, offsets)).
    if (this.signals !== null) {
      if (s.signalOffsetSec !== undefined) {
        this.signals.setSignalClusterOffset(s.signalNodeId, s.signalOffsetSec);
      }
      this.signals.setSignalClusterController?.(s.signalNodeId, {
        haltedGroup: s.haltedGroup,
        ...(s.flipAtSec !== undefined ? { flipAtSec: s.flipAtSec } : {}),
      });
    }
    this.phase = "armed";
    this.outcome = null;
    this.sawHold = false;
  }

  step(_traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const d = dist(input.x, input.y, s.junction.x, s.junction.y);

    // Holding at the line while the player's OWN approach is HALTED (authored
    // schedule — a pure function of session time, same truth the runtime
    // reads): latches the "waited for the controller" credit. The player's
    // axis comes from their heading; the controller halts `haltedGroup` from
    // session start and, at flipAtSec, moves the halt to the OTHER axis
    // (mirrors SignalController.controllerPermission). The former code assumed
    // haltedGroup WAS the player's axis (halted ⟺ before the flip), which
    // mislabels the outcome for any INVERTED schedule — sc-sig-controller-live
    // halts "ew" while the player approaches on "ns", so the player is PERMITTED
    // before the flip and HALTED after, the exact opposite of that assumption.
    const playerAxis = axisOfBearing(input.headingDeg);
    const flipped = s.flipAtSec !== undefined && input.tSec >= s.flipAtSec;
    const haltedAxis = flipped ? (s.haltedGroup === "ns" ? "ew" : "ns") : s.haltedGroup;
    const halted = playerAxis === haltedAxis;
    if (
      halted &&
      input.speedKmh <= CONTROLLER_HOLD_KMH &&
      d <= s.lineDistM + CONTROLLER_HOLD_ZONE_M
    ) {
      this.sawHold = true;
      this.phase = "triggered";
    }

    // The production adjudication: OUR junction's stop line crossed — the
    // runtime attached the controller permission, the reducer already graded.
    for (const e of input.tickEvents) {
      if (e.kind !== "stopLineCrossed" || e.control !== "trafficLight") continue;
      if (e.controller === undefined) continue; // some live junction's line
      if (d > s.lineDistM + CONTROLLER_LINE_OWN_M) continue;
      if (e.controller === "halt") return this.resolve(input, false, "violation");
      return this.resolve(input, true, this.sawHold ? "yielded" : "clear");
    }

    // Defensive: drove past the junction without a line event.
    if (aheadOfPlayerM(input, s.junction.x, s.junction.y) < -CONTROLLER_LINE_OWN_M) {
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
// 12. Cut-in lead car (doc 72 §9 FO-03 „Вклиняване" — the FOLLOWING family's
//     cut-in actor). Choreography + measurement only: the actor paces the
//     player from the ADJACENT lane (matchPlayer — slaved to the player's own
//     progress, deterministic), then at the staged cut point locks a plain
//     cruise and executes the traffic port's laneShift glide into the
//     player's lane, landing ~paceAheadM of centers ahead — the stolen
//     2-second cushion. GRADING IS 100% THE SHIPPED PIPELINE (doc 72: "the
//     grading is fully ready"): FOLLOWING_TOO_CLOSE and its
//     followRecoveryRateMps guard — the innocent stolen-gap phase (gap being
//     re-opened) never bills, HOLDING the stolen gap bills exactly once, and
//     a panic-slam is exempt because the cut-in itself is a forward cause in
//     the harsh-brake ledger (the honest A12 read). The runner emits ONLY a
//     collision on physical contact (rear-ending the cutter — the
//     brakingLeadCar precedent); everything else is outcome measurement.
// ---------------------------------------------------------------------------

/** Bumper-gap threshold ratio + seconds mirrored from the rule engine's
 * followFireRatio × followSafeSeconds — measurement only (the runner never
 * emits off these; the reducer's own detector is the grade). */
const CUTIN_SAFE_SECONDS = 1.8;
const CUTIN_FIRE_RATIO = 0.7;
const CUTIN_MIN_GAP_M = 4;
/** Sustained sub-threshold hold that marks the outcome "violation", s —
 * looser than the engine's 2 s sustain (measurement, biased innocent). */
const CUTIN_HELD_SEC = 3;
/** Gap opening at/above this = the driver is rebuilding, m/s (engine's
 * followRecoveryRateMps). */
const CUTIN_RECOVERY_MPS = 0.5;
/** Player under this speed is not "holding at speed" (engine's follow floor), km/h. */
const CUTIN_MIN_SPEED_KMH = 20;

export class CutInLeadCarRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private paceAheadM = 0;
  private cutAtSec: number | null = null;
  private approachSpeedKmh = 0;
  private prevGapM: number | null = null;
  private prevTSec: number | null = null;
  private heldSince: number | null = null;
  private sawHold = false;
  private sawRecovery = false;

  constructor(readonly spec: CutInLeadCarSpec) {}

  stage(traffic: StagedTrafficPort, rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: s.actor.pathNodes,
        hold: s.actor.hold,
        cruiseSpeedMps: s.actor.cruiseSpeedMps,
        // The ADJACENT lane (≤ 0 — a positive curb offset would tag the actor
        // as a cyclist proxy, A11 vehicleCollisionKind).
        extraRightOffsetM: s.actor.extraRightOffsetM,
        colorIndex: s.actor.colorIndex,
        profile: s.actor.profile,
        playerGuard: true, // the player stays BEHIND the cutter — inert here,
        // kept on as the house safety default
      });
      if (!view) throw new Error(`staged event ${s.id}: cut-in path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.paceAheadM = s.paceAheadM + (rng() * 2 - 1) * 1.0;
    this.phase = "armed";
    this.outcome = null;
    this.cutAtSec = null;
    this.approachSpeedKmh = 0;
    this.prevGapM = null;
    this.prevTSec = null;
    this.heldSince = null;
    this.sawHold = false;
    this.sawRecovery = false;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;

    if (this.phase === "armed") {
      // First player movement starts the adjacent-lane pacing (the
      // brakingLeadCar spawn-corridor arming — the spawn IS the corridor).
      if (input.speedKmh > 4) {
        traffic.stagedCommand(s.id, {
          type: "matchPlayer",
          gapM: this.paceAheadM,
          maxSpeedMps: s.maxMatchSpeedMps,
        });
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — pacing alongside until the staged cut, then adjudicating.
    if (this.cutAtSec === null) {
      const atCutPoint = dist(actor.x, actor.y, s.cutAt.x, s.cutAt.y) <= s.cutRadiusM;
      if (atCutPoint && input.speedKmh >= s.minCutSpeedKmh) {
        // The cut: lock a PLAIN cruise (the player's lift must genuinely
        // re-open the gap — matchPlayer would keep stealing it) and glide
        // into the player's lane over the authored ramp.
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: s.cutSpeedMps });
        traffic.stagedCommand(s.id, {
          type: "laneShift",
          toOffsetM: s.cutShiftM,
          rampSec: s.cutRampSec,
        });
        this.cutAtSec = input.tSec;
        this.approachSpeedKmh = input.speedKmh;
      }
      return null;
    }

    // Cut executed — the production FOLLOWING_TOO_CLOSE pipeline grades; the
    // runner only measures and covers physical contact.
    const centerGap = dist(input.x, input.y, actor.x, actor.y);
    if (centerGap < VEHICLE_CONTACT_M && input.speedKmh + actor.speedMps * 3.6 > 5) {
      out.push({ kind: "collision", withWhat: "vehicle" });
      return this.resolve(input, false, "collision");
    }
    const bumperGap = Math.max(0, centerGap - LEAD_CAR_LENGTH_M);
    const speedMps = input.speedKmh * KMH_TO_MPS;
    const safeGapM = Math.max(CUTIN_MIN_GAP_M, speedMps * CUTIN_SAFE_SECONDS);
    const dt = this.prevTSec !== null ? input.tSec - this.prevTSec : 0;
    const opening =
      this.prevGapM !== null && dt > 0 ? (bumperGap - this.prevGapM) / dt : 0;
    this.prevGapM = bumperGap;
    this.prevTSec = input.tSec;

    const holding =
      input.speedKmh >= CUTIN_MIN_SPEED_KMH &&
      bumperGap < safeGapM * CUTIN_FIRE_RATIO &&
      opening < CUTIN_RECOVERY_MPS;
    if (holding) {
      if (this.heldSince === null) this.heldSince = input.tSec;
      if (input.tSec - this.heldSince >= CUTIN_HELD_SEC) this.sawHold = true;
    } else {
      this.heldSince = null;
    }
    if (bumperGap >= safeGapM * CUTIN_FIRE_RATIO && actor.speedMps > 1) {
      this.sawRecovery = true; // the cushion is rebuilt (or never lost)
    }

    const actorAheadM = aheadOfPlayerM(input, actor.x, actor.y);
    if (actorAheadM >= s.clearAheadM || actor.finished) {
      return this.resolve(
        input,
        !this.sawHold,
        this.sawHold ? "violation" : this.sawRecovery ? "yielded" : "clear",
      );
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
      ...(this.approachSpeedKmh > 0 ? { approachSpeedKmh: this.approachSpeedKmh } : {}),
    });
    return this.outcome;
  }
}

// ---------------------------------------------------------------------------
// 13. Rear tailgater (doc 72 §9 FO-07 „Лепка отзад" — the FOLLOWING family's
//     rear actor). PRESSURE SCENERY under the learn-only policy: the runner
//     emits ZERO SimTick events, ever — no violation OR collision can grade
//     from it (the policeStop discipline; an unmodelled duty must not
//     convict, A12). The actor matchPlayer-paces a NEGATIVE gap (the
//     emergencyApproach rear-sync precedent, in the player's OWN lane), holds
//     the glued pose for pressureSec, then laneShift-passes on the left and
//     drives off. The taught mistake (brake-check) grades through the
//     SHIPPED HARSH_BRAKING_NO_CAUSE — a rear car is not a forward cause
//     (the ledger reads only the forward leadGap channel); the taught
//     response (ease off / grow the front gap) reads on the outcome only.
//
//     playerGuard OFF by design: the guard's stop-6-m-short corridor forbids
//     the sub-6 m лепка pose. Safety is structural — the matchPlayer
//     proportional law backs off as the gap error flips, and the authored
//     decel cap (12 m/s²) out-brakes any player slam, so the actor stops
//     inside its own cushion even against a 12 m/s² brake-check.
// ---------------------------------------------------------------------------

/** The tailgater's driveline caps — authored constants (not spec surface):
 * decel must be ≥ the hero's max brake so a brake-check never produces a
 * staged rear-end; accel keeps it glued through player speed changes. */
const TAILGATER_DECEL_MPS2 = 12;
const TAILGATER_ACCEL_MPS2 = 3.5;
/** Latch window: glued once within followBehindM + this many meters, m. */
const TAILGATER_LATCH_SLACK_M = 4;

export class RearTailgaterRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  private releaseGapM = 0;
  private followBehindM = 0;
  private pressureSec = 0;
  private latchedAt: number | null = null;
  private latchSpeedKmh = 0;
  private passCommanded = false;
  private sawYield = false;

  constructor(readonly spec: RearTailgaterSpec) {}

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
        profile: s.actor.profile,
        accelMps2: TAILGATER_ACCEL_MPS2,
        decelMps2: TAILGATER_DECEL_MPS2,
        playerGuard: false, // see the class doc — the лепка pose IS sub-guard
      });
      if (!view) throw new Error(`staged event ${s.id}: tailgater path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.releaseGapM = s.releaseGapM + (rng() * 2 - 1) * 2;
    this.followBehindM = s.followBehindM + (rng() * 2 - 1) * 0.5;
    this.pressureSec = s.pressureSec + (rng() * 2 - 1) * 0.5;
    this.phase = "armed";
    this.outcome = null;
    this.latchedAt = null;
    this.latchSpeedKmh = 0;
    this.passCommanded = false;
    this.sawYield = false;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;
    const actorAheadM = aheadOfPlayerM(input, actor.x, actor.y);
    const behindM = -actorAheadM;

    if (this.phase === "armed") {
      // Release once the player is genuinely ahead along the road and
      // travelling the actor's direction (the emergencyApproach discipline).
      const actorBearing = (Math.atan2(actor.dirX, actor.dirY) * 180) / Math.PI;
      const delta = Math.abs((((actorBearing - input.headingDeg) % 360) + 540) % 360 - 180);
      if (behindM >= this.releaseGapM && delta <= APPROACH_MAX_DEG) {
        traffic.stagedCommand(s.id, {
          type: "matchPlayer",
          gapM: -this.followBehindM,
          maxSpeedMps: s.maxMatchSpeedMps,
        });
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — glued pressure, then the pass, then the resolution.
    // NO adjudication and NO events: pressure scenery (learn-only, A12).
    if (this.latchedAt === null) {
      if (
        !this.passCommanded &&
        behindM > 0 &&
        behindM <= this.followBehindM + TAILGATER_LATCH_SLACK_M
      ) {
        this.latchedAt = input.tSec;
        this.latchSpeedKmh = input.speedKmh;
      }
    } else {
      // Outcome measurement only: the taught ease-off (grow the front gap /
      // shed guilt-free speed) latches "yielded" — nothing grades off it.
      // Only the PRESSURE phase counts (easing after the pass began is just
      // the drive winding down, not a response to the tailgater).
      if (!this.passCommanded && input.speedKmh <= this.latchSpeedKmh - s.easeKmh) {
        this.sawYield = true;
      }
      if (!this.passCommanded && input.tSec - this.latchedAt >= this.pressureSec) {
        traffic.stagedCommand(s.id, { type: "cruise", speedMps: s.passSpeedMps });
        traffic.stagedCommand(s.id, {
          type: "laneShift",
          toOffsetM: s.passShiftM,
          rampSec: 1.5,
        });
        this.passCommanded = true;
      }
    }

    if ((this.passCommanded && actorAheadM >= s.passAheadM) || actor.finished) {
      this.phase = "resolved";
      this.outcome = outcomeOf(this.spec, input, true, this.sawYield ? "yielded" : "clear");
      return this.outcome;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// 14. Telltale stimulus (N11 cockpit-stimuli — doc 72 §3 VP-06 „Контролна
//     лампа по време на движение", ЗДвП чл. 20 / чл. 139, library
//     ev-warning-light). STIMULUS + MEASUREMENT ONLY (the policeStop
//     discipline): NO actor is staged — at the authored trigger the runner
//     lights the director's cockpit-lamp channel (`telltaleLit`, the
//     hazardActive-style scene seam: the cluster's red temperature lamp +
//     the L1/L2 HUD cue) and records the outcome — "yielded" for a compliant
//     curb-side rest (reactionTimeSec = stimulus→first-brake respondedSec),
//     "passedWithoutStopping" for driving on ignoreBeyondM past the lamp —
//     but emits ZERO SimTick events: no violation can ever grade from this
//     runner (A12). The graded duty lives in the scenario's curb-side
//     low-speed reachZone objective (sc-vp-police-stop stop-mark pattern);
//     the panic-slam mistake grades through the SHIPPED
//     HARSH_BRAKING_NO_CAUSE (a dashboard lamp is not a forward cause in the
//     harsh-brake ledger — the honest read: red lamp = PLANNED pull-over).
//     The lamp stays LIT through and after resolution (a real coolant fault
//     does not clear because you stopped); reset() re-arms it dark.
// ---------------------------------------------------------------------------

/** Player at/above this counts as driving for the trigger, km/h (the lamp
 *  must light mid-DRIVE, and the crawl backstop below covers the rest). */
const TELLTALE_MOVING_KMH = 3;

export class TelltaleStimulusRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;
  /** The cockpit-lamp channel the director ORs into `telltaleLit`. */
  telltaleLit = false;

  private approachSpeedKmh = 0;
  private readonly timer = new ReactionTimer();

  constructor(readonly spec: TelltaleStimulusSpec) {}

  stage(_traffic: StagedTrafficPort, _rng: Rng, _firstTime: boolean): void {
    // No actor and no jitter draw: the stimulus is authored scenery-of-state
    // (the policeStop no-jitter discipline) — nothing about it varies.
    this.phase = "armed";
    this.outcome = null;
    this.telltaleLit = false;
    this.approachSpeedKmh = 0;
    this.timer.reset();
  }

  step(_traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    // The lamp stays lit after resolution — only reset() clears it.
    if (this.phase === "resolved") return null;

    if (this.phase === "armed") {
      const d = dist(input.x, input.y, s.trigger.x, s.trigger.y);
      // Fire within the trigger radius while moving, OR once the trigger is
      // behind the player (backstop: a crawler below the radius check still
      // can never reach the stop zone unlit).
      const passed = aheadOfPlayerM(input, s.trigger.x, s.trigger.y) < -1;
      if ((d <= s.triggerDistM || passed) && input.speedKmh >= TELLTALE_MOVING_KMH) {
        this.telltaleLit = true;
        this.timer.arm(input.tSec);
        this.approachSpeedKmh = input.speedKmh;
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — measure the response. Outcome only, NO events (class doc).
    this.timer.sample(input);
    if (
      input.speedKmh <= s.stopSpeedKmh &&
      dist(input.x, input.y, s.stop.x, s.stop.y) <= s.stopRadiusM
    ) {
      return this.resolve(input, true, "yielded");
    }
    if (aheadOfPlayerM(input, s.trigger.x, s.trigger.y) < -s.ignoreBeyondM) {
      return this.resolve(input, false, "passedWithoutStopping");
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
// 15. Oncoming stream (doc 72 OV-05/OV-08 — the overtake-corridor's staged
//     oncoming machinery). PURE CHOREOGRAPHY: `count` cars on the oncoming
//     bank, held at authored arc gaps, ALL released at fixed cruise on the
//     player's first movement — deterministic clockwork the trace scripts are
//     authored against. The runner emits ZERO SimTick events except the
//     contact collision (the oncomingLeftTurn check): every gap adjudication
//     lives in the runtime's overtake-corridor tracker, which sees these cars
//     through the SAME TrafficSystem.oncomingNear query ambient traffic
//     rides. No jitter draw (the policeStop discipline) — the tight/safe
//     windows are authored data (OncomingStreamSpec.gapsM), and loosening
//     them per-attempt would move the lesson itself.
// ---------------------------------------------------------------------------

/** The whole stream this far behind the player (its own travel frame) or
 *  finished = the encounter is over, m. */
const STREAM_CLEAR_BEHIND_M = 25;

export class OncomingStreamRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  constructor(readonly spec: OncomingStreamSpec) {}

  private carId(i: number): string {
    return `${this.spec.id}-${i}`;
  }

  stage(traffic: StagedTrafficPort, _rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      for (let i = 0; i < s.count; i++) {
        const gap = i === 0 ? 0 : s.gapsM[i - 1];
        const view = traffic.stage({
          kind: "vehicle",
          id: this.carId(i),
          pathNodes: s.actor.pathNodes,
          hold: {
            nodeIndex: s.actor.hold.nodeIndex,
            // Car i holds gapsM[i-1] m BEHIND the stream head along travel.
            offsetM: s.actor.hold.offsetM - gap,
          },
          cruiseSpeedMps: s.actor.cruiseSpeedMps,
          extraRightOffsetM: s.actor.extraRightOffsetM,
          colorIndex: ((s.actor.colorIndex ?? 0) + i) % 4,
          profile: s.actor.profile,
          playerGuard: true, // never ram the gambler — the runtime's
          // gap-memory latch keeps the conviction honest past the rescue
        });
        if (!view) throw new Error(`staged event ${s.id}: oncoming car ${i} failed to stage`);
        // A gap wider than the head's own hold arc drives this car to a NEGATIVE
        // path arc, which clampArc pins to the path start — the intended column
        // silently collapses to a nose-to-tail clump, and a gap-window drill that
        // relied on the spacing then grades nothing. The ov-oncoming battery pins
        // the same law statically (holdArc − gap ≥ 0); this is its stage-time
        // twin, so a gap-drill spec the battery does not cover can never collapse
        // in silence. Guarded on a POSITIVE head arc: a stream authored with its
        // head AT the path origin (holdArc 0) has no room behind by construction
        // — that is the deliberate "release a clump from the spawn" pattern
        // (sc-mfp-stream: a property-exit give-way drill graded off ANY oncoming
        // car, not a measured window), not the over-gapped-deep-head accident
        // this guard exists to catch.
        const holdArc = view.nodeS[s.actor.hold.nodeIndex] + s.actor.hold.offsetM;
        if (holdArc > 0 && holdArc - gap < 0) {
          throw new Error(
            `staged event ${s.id}: oncoming car ${i} gap ${gap} m exceeds head hold arc ` +
              `${holdArc} m — the car falls off the path start (stream collapse)`,
          );
        }
      }
    } else {
      for (let i = 0; i < s.count; i++) {
        traffic.stagedCommand(this.carId(i), { type: "reset" });
      }
    }
    this.phase = "armed";
    this.outcome = null;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;

    if (this.phase === "armed") {
      if (input.speedKmh >= s.releaseKmh) {
        for (let i = 0; i < s.count; i++) {
          traffic.stagedCommand(this.carId(i), { type: "cruise" });
        }
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — clockwork in motion; watch only for contact and completion.
    let allClear = true;
    for (let i = 0; i < s.count; i++) {
      const car = traffic.staged(this.carId(i));
      if (!car) continue;
      if (
        dist(input.x, input.y, car.x, car.y) < VEHICLE_CONTACT_M &&
        input.speedKmh + car.speedMps * 3.6 > 5
      ) {
        // Head-on contact — the one event this runner ever emits.
        out.push({ kind: "collision", withWhat: "vehicle" });
        this.phase = "resolved";
        this.outcome = outcomeOf(s, input, false, "collision");
        return this.outcome;
      }
      // Behind the CAR's own travel frame = already met and passed.
      const relAlong =
        (input.x - car.x) * car.dirX + (input.y - car.y) * car.dirY;
      if (!car.finished && !(relAlong < -STREAM_CLEAR_BEHIND_M)) allClear = false;
    }
    if (allClear) {
      this.phase = "resolved";
      this.outcome = outcomeOf(s, input, true, "clear");
      return this.outcome;
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// 16. Train pass (RX-02/RX-01 — doc 72 §12 „жп прелез"). A real TRAIN crosses
//     the road at the level crossing, timed to the player's approach so the
//     „stop and look" ritual meets a genuine hazard. PURE CHOREOGRAPHY: the
//     runner stages a path-locked train on the authored PERPENDICULAR rail
//     polyline, releases it when the player nears the crossing, and emits ZERO
//     SimTick events — the world-data rail detectors alone grade the crossing,
//     so this actor is byte-neutral to grading (the policeStop discipline).
//     playerGuard is OFF: a train does not brake for cars.
// ---------------------------------------------------------------------------

export class TrainPassRunner implements EventRunner {
  phase: StagedEventPhase = "idle";
  outcome: StagedEventOutcome | null = null;
  hazardActive = false;

  constructor(readonly spec: TrainPassSpec) {}

  stage(traffic: StagedTrafficPort, _rng: Rng, firstTime: boolean): void {
    const s = this.spec;
    if (firstTime) {
      const view = traffic.stage({
        kind: "vehicle",
        id: s.id,
        pathNodes: [], // the rail line is authored, not a lane-graph path
        railPath: s.railPath,
        hold: { nodeIndex: 0, offsetM: s.holdOffsetM },
        cruiseSpeedMps: s.cruiseSpeedMps,
        accelMps2: s.accelMps2,
        colorIndex: s.colorIndex,
        profile: "train",
        playerGuard: false, // the train is the hazard — it never yields to a car
      });
      if (!view) throw new Error(`staged event ${s.id}: rail path failed to stage`);
    } else {
      traffic.stagedCommand(s.id, { type: "reset" });
    }
    this.phase = "armed";
    this.outcome = null;
  }

  step(traffic: StagedTrafficPort, input: DirectorInput, _out: SimTickEvent[]): StagedEventOutcome | null {
    const s = this.spec;
    if (this.phase === "resolved") return null;
    const actor = traffic.staged(s.id);
    if (!actor) return null;

    if (this.phase === "armed") {
      const d = dist(input.x, input.y, s.crossing.x, s.crossing.y);
      if (d <= s.triggerPlayerDistM && approaching(input, s.crossing.x, s.crossing.y)) {
        traffic.stagedCommand(s.id, { type: "cruise" }); // commit — no sync, no guard
        this.phase = "triggered";
      }
      return null;
    }

    // triggered — the train runs its line to the far side; no events emitted.
    if (actor.finished) {
      this.phase = "resolved";
      this.outcome = outcomeOf(s, input, true, "clear");
      return this.outcome;
    }
    return null;
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
    case "emergencyApproach":
      return new EmergencyApproachRunner(spec);
    case "policeStop":
      return new PoliceStopRunner(spec);
    case "trafficController":
      return new TrafficControllerRunner(spec, signals);
    case "cutInLeadCar":
      return new CutInLeadCarRunner(spec);
    case "rearTailgater":
      return new RearTailgaterRunner(spec);
    case "telltaleStimulus":
      return new TelltaleStimulusRunner(spec);
    case "oncomingStream":
      return new OncomingStreamRunner(spec);
    case "trainPass":
      return new TrainPassRunner(spec);
  }
}
