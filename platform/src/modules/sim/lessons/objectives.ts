/**
 * Objective evaluators — pure functions that decide, tick by tick, whether
 * the ACTIVE lesson objective just completed.
 *
 * Design decisions (documented):
 *  - Objectives are strictly SEQUENTIAL: only the active one advances. The
 *    banner always shows exactly one task; a student can never "accidentally"
 *    complete objective 3 while objective 1 is open.
 *  - Objectives verify THE BEHAVIOR THEY NAME (A10). v1 measured raw
 *    progression only, which left cheat paths open (audit D4): parkInBay
 *    completed on any reverse + stop anywhere, emergencyStop on any hard stop
 *    with no stimulus, L2 could luck three greens, L3 never checked the exit
 *    indicator. The hardened evaluators bind each objective to its promised
 *    skill: park = at rest inside the authored bay, aligned, via reverse;
 *    emergency stop = resolved staged encounter with measured reaction time;
 *    signals = a met red in the run; roundabout = exit under right indicator.
 *    Where progression and correctness still SPLIT (e.g. crossing on red
 *    completes a plain passSignal and earns RED_LIGHT_CROSSED), the rule
 *    engine keeps adjudicating the law separately — the final verdict
 *    combines both.
 *  - Evaluators read SimTick frames plus the session-level ObjectiveContext
 *    (staged-encounter outcomes, run-wide reds tally), so the whole lesson
 *    engine stays testable without a WorldRuntime; the runtime's job is to
 *    emit honest ticks (contracts.ts) and the orchestrator's to resolve
 *    honest StagedEventOutcomes.
 */

import type { LessonObjective, ParkingBaySpec, StagedEventOutcome } from "../contracts";
import type { SimTick } from "../rules";
import type {
  ObjectiveDetail,
  ObjectiveEvalState,
  ObjectiveParams,
  ParkAlignment,
  ParkInBayParams,
  PassSignalParams,
  ReactionBand,
  ReachZoneParams,
  ThreePointTurnParams,
} from "./types";

// ---------------------------------------------------------------------------
// Param parsing — specs are data (Record<string, unknown> by contract);
// narrow them once at session start and fail loudly on malformed specs.
// ---------------------------------------------------------------------------

class ObjectiveSpecError extends Error {
  constructor(objectiveId: string, message: string) {
    super(`Invalid objective spec "${objectiveId}": ${message}`);
    this.name = "ObjectiveSpecError";
  }
}

function num(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Narrow an untyped `bay` param to a ParkingBaySpec, null when malformed. */
function parseBay(v: unknown): ParkingBaySpec | null {
  if (typeof v !== "object" || v === null) return null;
  const b = v as Record<string, unknown>;
  if (
    !num(b.x) ||
    !num(b.y) ||
    !num(b.headingDeg) ||
    !num(b.widthM) ||
    !num(b.lengthM) ||
    b.widthM <= 0 ||
    b.lengthM <= 0
  ) {
    return null;
  }
  return { x: b.x, y: b.y, headingDeg: b.headingDeg, widthM: b.widthM, lengthM: b.lengthM };
}

/** Narrow an untyped `corridor` param to a ThreePointTurnCorridor, null when malformed. */
function parseTurnCorridor(v: unknown): ThreePointTurnParams["corridor"] | null {
  if (typeof v !== "object" || v === null) return null;
  const c = v as Record<string, unknown>;
  if (
    !num(c.x) ||
    !num(c.y) ||
    !num(c.halfWidthM) ||
    !num(c.halfLengthM) ||
    c.halfWidthM <= 0 ||
    c.halfLengthM <= 0
  ) {
    return null;
  }
  return { x: c.x, y: c.y, halfWidthM: c.halfWidthM, halfLengthM: c.halfLengthM };
}

/** Narrow a LessonObjective's untyped params to a typed evaluator config. */
export function parseObjectiveParams(objective: LessonObjective): ObjectiveParams {
  const p = objective.params;
  switch (objective.kind) {
    case "reachZone": {
      if (!num(p.x) || !num(p.y) || !num(p.radiusM) || p.radiusM <= 0) {
        throw new ObjectiveSpecError(objective.id, "reachZone needs x, y, radiusM > 0");
      }
      const out: WitnessedReachZoneParams = {
        kind: "reachZone",
        x: p.x,
        y: p.y,
        radiusM: p.radiusM,
      };
      if (num(p.maxSpeedKmh)) out.maxSpeedKmh = p.maxSpeedKmh;
      // THE ARRIVAL CONTRACT'S TWO STATE DEMANDS (see the block comment on
      // `WitnessedReachZoneParams`). AUTHORED WINS, TITLE FILLS IN: a template
      // that states the demand outright gets exactly what it asked for; one
      // that only PROMISES it in the banner gets the promise enforced, because
      // the banner is the certificate the student reads and the gate may not
      // certify less than the banner says.
      const lamps =
        p.requireLamps === undefined
          ? deriveLampDemand(objective.titleBg)
          : parseLampDemand(objective, p.requireLamps);
      if (lamps !== undefined) out.requireLamps = lamps;
      const gear =
        p.requireGear === undefined
          ? deriveGearDemand(objective.titleBg)
          : parseGearDemand(objective, p.requireGear);
      if (gear !== undefined) out.requireGear = gear;
      // THE OFFICER'S PERMISSION, same law: authored wins, the title fills in.
      // An AUTHORED key that cannot be honoured throws (the author asked for it
      // in so many words); a DERIVED one that cannot be honoured is dropped and
      // the build-time gate names the row — the same asymmetry
      // `acceptBeforeMarkM` above states, and for the same reason: a bad
      // authoring must fall back to shipped behaviour rather than brick a lesson
      // for a student, while `controller-claim-gates.test.ts` fails the build.
      if (p.requireControllerProceed !== undefined) {
        // `out`, not `p` — the conflict is with the demands this parse RESOLVED
        // (a title-derived `requireLamps` collides exactly as an authored one
        // does), which the raw param record cannot see.
        out.requireControllerProceed = parseControllerDemand(
          objective,
          p.requireControllerProceed,
          out,
        );
      } else if (deriveControllerDemand(objective.titleBg) && !hasAtMarkDemand(out)) {
        out.requireControllerProceed = true;
      }
      // THE RAISED ARM (ReachZoneParams.requireRailClear — lessons/types.ts
      // carries the finding and the three files that routed it here). AUTHORED
      // ONLY, and for a blunter reason than the contact term's: a rail claim
      // derived from a banner would be a demand nothing can spend on the 1,718
      // catalogue gates whose district has no track band at all, and a demand
      // nothing can spend is a lesson nobody can finish. It is written on the
      // two discs whose map ships a timetable, and `rail-cross-when-clear
      // .test.ts` pins that census in both directions.
      if (p.requireRailClear !== undefined) {
        out.requireRailClear = parseRailClearDemand(objective, p.requireRailClear);
      }
      // THE HALT MADE FOR A PERSON ON FOOT (requireHaltForVru), same law as the
      // waited-for person below it: authored wins, the title fills in.
      if (p.requireHaltForVru !== undefined) {
        if (p.requireHaltForVru !== true) {
          throw new ObjectiveSpecError(objective.id, "reachZone requireHaltForVru must be true");
        }
        out.requireHaltForVru = true;
      } else if (deriveHaltForVruDemand(objective.titleBg)) {
        out.requireHaltForVru = true;
      }
      // THE WAITED-FOR PERSON, same law: authored wins, the title fills in.
      // No conflict guard is needed — this demand never touches the `capMet`
      // latch (see `ReachZoneWitnessDemands`), so it can share a zone with any
      // of the other four demands without the single-frame conjunction problem
      // `parseControllerDemand` exists to refuse.
      if (p.requireVruUntouched !== undefined) {
        if (p.requireVruUntouched !== true) {
          throw new ObjectiveSpecError(
            objective.id,
            "reachZone requireVruUntouched must be true",
          );
        }
        out.requireVruUntouched = true;
      } else if (deriveVruWaitDemand(objective.titleBg)) {
        out.requireVruUntouched = true;
      }
      // THE CONTACT TERM (ReachZoneParams.requireNoContact — lessons/types.ts
      // carries the finding and the routing note it answers). AUTHORED ONLY,
      // and deliberately so: the four demands above may be filled in from the
      // banner because their populations were CENSUSED over all 395 catalogue
      // objectives, and a census is what stops a matcher from inventing a
      // demand nobody can spend. The contact census (2026-08-26, every
      // `titleBg:` in `templates-*.ts` against /закач|удар|засегн|блъсн|допр/)
      // returns exactly ONE reachZone-adjacent title, and it is a parkInBay
      // («паркирай на заден ход, без да опираш буса»). One member is not a
      // population; a matcher built on it would be a guess wearing a census's
      // clothes. So the key is written where it is meant, and
      // `hazard-obstacle-claims.test.ts` holds the other direction — a title
      // that CLAIMS contact without this key fails the build.
      if (p.requireNoContact !== undefined) {
        if (p.requireNoContact !== true) {
          throw new ObjectiveSpecError(objective.id, "reachZone requireNoContact must be true");
        }
        out.requireNoContact = true;
      }
      // THE YIELD THE BANNER SAYS HAPPENED (see `ReachZoneWitnessDemands.
      // requireYieldClean` for the drive, the census and the window). AUTHORED
      // WINS, TITLE FILLS IN — the same law the lamp, gear, officer and
      // waited-for-person demands are parsed under, and for the same reason:
      // the banner is the certificate the student reads, so the gate may not
      // certify less than the banner says.
      if (p.requireYieldClean !== undefined) {
        out.requireYieldClean = parseYieldDemand(objective, p.requireYieldClean);
      } else {
        const yielded = deriveYieldDemand(objective.titleBg);
        if (yielded !== undefined) out.requireYieldClean = yielded;
      }
      // SIGNED (FR-24): + = the mark sits past the paint, − = the paint is
      // ahead of the mark. The only rejected value is one that would empty the
      // acceptance disc — a cut deeper than the radius leaves nowhere legal to
      // stop, which is „стоях точно на маркера и нищо не стана" with extra
      // steps. Rejecting it here means a bad authoring falls back to the old
      // uncut behaviour instead of bricking the lesson, and
      // stop-line-grading.test.ts fails the build for it.
      if (num(p.acceptBeforeMarkM) && p.acceptBeforeMarkM <= p.radiusM) {
        out.acceptBeforeMarkM = p.acceptBeforeMarkM;
      }
      return out;
    }
    case "passSignal": {
      if (
        typeof p.nodeId !== "string" ||
        !num(p.x) ||
        !num(p.y) ||
        !num(p.radiusM) ||
        p.radiusM <= 0 ||
        (p.control !== "trafficLight" && p.control !== "stopSign")
      ) {
        throw new ObjectiveSpecError(
          objective.id,
          "passSignal needs nodeId, x, y, radiusM > 0, control trafficLight|stopSign",
        );
      }
      const out: PassSignalParams = {
        kind: "passSignal",
        nodeId: p.nodeId,
        x: p.x,
        y: p.y,
        radiusM: p.radiusM,
        control: p.control,
      };
      if (p.requireRedMet !== undefined) {
        // Red-light handling only exists at traffic lights — a stop sign
        // carrying the gate would deadlock the objective forever.
        if (p.requireRedMet !== true || p.control !== "trafficLight") {
          throw new ObjectiveSpecError(
            objective.id,
            "requireRedMet must be true and is only valid with control trafficLight",
          );
        }
        out.requireRedMet = true;
      }
      return out;
    }
    case "driveDistance": {
      if (!num(p.meters) || p.meters <= 0) {
        throw new ObjectiveSpecError(objective.id, "driveDistance needs meters > 0");
      }
      return { kind: "driveDistance", meters: p.meters };
    }
    case "completeManeuver": {
      if (p.maneuver === "smoothStop") {
        return {
          kind: "completeManeuver",
          maneuver: "smoothStop",
          minApproachKmh: num(p.minApproachKmh) ? p.minApproachKmh : 20,
          maxDecelMs2: num(p.maxDecelMs2) ? p.maxDecelMs2 : 3.5,
        };
      }
      if (p.maneuver === "emergencyStop") {
        // A10: stimulus-locked — the objective grades from the staged
        // encounter's outcome; a speed-only spec is a cheat path, not a spec.
        if (typeof p.stagedEventId !== "string" || p.stagedEventId.length === 0) {
          throw new ObjectiveSpecError(
            objective.id,
            "emergencyStop needs stagedEventId (the staged encounter it grades from)",
          );
        }
        return {
          kind: "completeManeuver",
          maneuver: "emergencyStop",
          stagedEventId: p.stagedEventId,
        };
      }
      if (p.maneuver === "parkInBay") {
        // A10: bay-locked — the park must land in the authored rect.
        const bay = parseBay(p.bay);
        if (bay === null) {
          throw new ObjectiveSpecError(
            objective.id,
            "parkInBay needs bay { x, y, headingDeg, widthM > 0, lengthM > 0 }",
          );
        }
        const params: ParkInBayParams = {
          kind: "completeManeuver",
          maneuver: "parkInBay",
          holdSec: num(p.holdSec) && p.holdSec > 0 ? p.holdSec : 1.5,
          bay,
          centerTolM: num(p.centerTolM) && p.centerTolM > 0 ? p.centerTolM : PARK_CENTER_TOL_M,
          headingTolDeg:
            num(p.headingTolDeg) && p.headingTolDeg > 0 ? p.headingTolDeg : PARK_HEADING_TOL_DEG,
        };
        // S2 (additive): the entry-gear gate — absent = the reverse default.
        if (p.entry !== undefined) {
          if (p.entry !== "reverse" && p.entry !== "forward") {
            throw new ObjectiveSpecError(
              objective.id,
              'parkInBay entry must be "reverse" | "forward" when present',
            );
          }
          params.entry = p.entry;
        }
        return params;
      }
      if (p.maneuver === "roundabout") {
        if (
          !num(p.x) ||
          !num(p.y) ||
          !num(p.enterRadiusM) ||
          !num(p.exitRadiusM) ||
          p.enterRadiusM <= 0 ||
          p.exitRadiusM <= p.enterRadiusM
        ) {
          throw new ObjectiveSpecError(
            objective.id,
            "roundabout needs x, y, 0 < enterRadiusM < exitRadiusM",
          );
        }
        return {
          kind: "completeManeuver",
          maneuver: "roundabout",
          x: p.x,
          y: p.y,
          enterRadiusM: p.enterRadiusM,
          exitRadiusM: p.exitRadiusM,
        };
      }
      if (p.maneuver === "threePointTurn") {
        // Corridor-locked (the parkInBay pattern): the ~180° reversal must land
        // inside the authored turn box.
        const corridor = parseTurnCorridor(p.corridor);
        if (corridor === null) {
          throw new ObjectiveSpecError(
            objective.id,
            "threePointTurn needs corridor { x, y, halfWidthM > 0, halfLengthM > 0 }",
          );
        }
        if (!num(p.startHeadingDeg)) {
          throw new ObjectiveSpecError(objective.id, "threePointTurn needs startHeadingDeg");
        }
        return {
          kind: "completeManeuver",
          maneuver: "threePointTurn",
          corridor,
          startHeadingDeg: p.startHeadingDeg,
          toleranceDeg:
            num(p.toleranceDeg) && p.toleranceDeg > 0 ? p.toleranceDeg : TURN_TOLERANCE_DEG,
          holdSec: num(p.holdSec) && p.holdSec > 0 ? p.holdSec : TURN_HOLD_SEC,
        };
      }
      throw new ObjectiveSpecError(
        objective.id,
        `unknown maneuver ${String(p.maneuver)}`,
      );
    }
  }
}

/** Fresh evaluator memory for a parsed objective. */
export function createEvalState(params: ObjectiveParams): ObjectiveEvalState {
  switch (params.kind) {
    case "reachZone":
      return {
        type: "reachZone",
        reached: false,
        // A zone that demands NOTHING has no arrival contract to satisfy —
        // start it met so the fold below stays one expression and a demandless
        // waypoint behaves EXACTLY as it did before B4 (done ⇔ inside the
        // authored radius). `capMet` now carries the WHOLE arrival contract —
        // speed cap, lamps, direction — because `ObjectiveEvalState` lives in
        // lessons/types.ts and this lane may not add a field to it; the three
        // are latched and spent together, which is also what an arrival
        // contract means (see `stepReachZone`).
        capMet: !hasArrivalDemand(params),
        overCapNoted: false,
        approachFrom: null,
        prevPos: null,
        everOutside: false,
      };
    case "passSignal":
      return {
        type: "passSignal",
        crossed: false,
        stoppedInZoneVisit: false,
        redMet: false,
        redMetVia: null,
      };
    case "driveDistance":
      return { type: "driveDistance", accumulatedM: 0, prevPos: null };
    case "completeManeuver":
      switch (params.maneuver) {
        case "smoothStop":
          return {
            type: "smoothStop",
            armed: false,
            maxDecelMs2: 0,
            prevSpeedKmh: null,
            prevT: null,
          };
        case "emergencyStop":
          return { type: "emergencyStop" };
        case "parkInBay":
          return {
            type: "parkInBay",
            usedReverse: false,
            enteredForward: false,
            stoppedSinceT: null,
            inBay: false,
            attempts: 0,
          };
        case "roundabout":
          return {
            type: "roundabout",
            entered: false,
            exitSignaled: false,
            ringSignalArcDeg: null,
            prevAzimuthDeg: null,
            // null, not 0: nothing has been watched yet, and an objective that
            // starts evaluating with the car already on the ring must not be
            // owed a passage it could not see (see the field's doc in types.ts).
            traversalArcDeg: null,
            insideAzimuthDeg: null,
            voidedExits: 0,
          };
        case "threePointTurn":
          return {
            type: "threePointTurn",
            entered: false,
            lastDir: 0,
            reversals: 0,
            stoppedSinceT: null,
          };
      }
  }
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Session-level facts the hardened evaluators need beyond the tick (A10).
 * Built by the engine from LessonSessionState on every step.
 */
export interface ObjectiveContext {
  /** Resolved staged-encounter outcomes so far (A8 measurement channel). */
  stagedOutcomes: readonly StagedEventOutcome[];
  /**
   * Reds met across the run so far — count of passSignal eval states with
   * redMet (completed objectives keep their final state, so a red met at an
   * earlier junction satisfies a later requireRedMet gate).
   */
  redsMetInRun: number;
  /**
   * Has this drive struck a person on foot or on a bicycle, anywhere, at any
   * point? Session-monotone (a contact never un-happens), so it needs no
   * eval-state memory of its own — the same property `stagedOutcomes` has.
   *
   * OPTIONAL, and absent means „unknown", never „yes": every hand-built caller
   * (the rigs, the fixtures, `EMPTY_CONTEXT`) omits it and behaves exactly as
   * shipped. See `vruWaitHonoured` for the frame that made it necessary.
   */
  struckAPersonInRun?: boolean;
  /**
   * Has this drive struck ANY body — a vehicle, a person, a cyclist or an
   * authored static obstacle — anywhere, at any point? The same session-monotone
   * fact as `struckAPersonInRun` one category wider, read off the same scored
   * ledger, and the only thing `ReachZoneParams.requireNoContact` consults.
   *
   * A SUPERSET, NOT A REPLACEMENT. `struckAPersonInRun` stays its own field
   * because it answers a different question — «беше ли прегазен човекът, за
   * когото пишеш, че си изчакал» — and because the two gates must be able to
   * disagree: a drill may forbid touching the stalled car it routes you round
   * without making any claim about a pedestrian, and vice versa.
   *
   * OPTIONAL, and absent means „unknown", never „yes": every hand-built caller
   * (the rigs, the fixtures, `EMPTY_CONTEXT`) omits it and behaves exactly as
   * shipped.
   */
  struckABodyInRun?: boolean;
  /**
   * Has this drive been billed for going onto a level crossing with the arm
   * down — `RAIL_CROSSING_VIOLATION` detail `"entered-barred"`, the 10-point
   * terminating опасна of ЗДвП чл. 52? The one fact
   * `ReachZoneParams.requireRailClear` consults.
   *
   * READ OFF THE VERDICT, WHICH IS UNUSUAL HERE AND IS ARGUED IN
   * `railClearHonoured`. Every other field on this context is a fact about the
   * drive (an outcome resolved, a body struck); this one is a fact about the
   * drive's PROTOCOL. The reason is that the entry is a TRANSITION — the
   * approach→on edge — and the reducer that owns that edge has already
   * adjudicated it once, with the approach guard and the reverse exemption that
   * make it honest. A second adjudicator reading raw `railBarred` frames is how
   * the first cut of this demand acquitted the creep that crossed under the
   * boom and was still on the rails when it lifted.
   *
   * OPTIONAL, and absent means „unknown", never „yes".
   */
  enteredRailBarredInRun?: boolean;
  /**
   * Every billed failure-to-yield in the run so far, with the session second it
   * was billed on — the ledger `ReachZoneParams.requireYieldClean` consults.
   * Read off the SCORED events (`lessons/engine.ts isYieldFault`), so what
   * reaches this field is a fault the protocol already prints and explains,
   * never a raw tracker frame.
   *
   * OPTIONAL, and absent means „unknown", never „none was billed"— it simply
   * leaves the demand met, exactly like the four fields above it.
   */
  yieldFaults?: readonly YieldFaultRecord[];
  /**
   * When the objective being stepped BECAME the active one, in session seconds.
   * The chain is strictly sequential, so this is the moment its predecessor
   * completed (0 for the first). It is the lower bound of the window
   * `requireYieldClean` refuses inside, and nothing else reads it.
   *
   * OPTIONAL, and absent means „the caller cannot say", which leaves the yield
   * demand met rather than refusing on an unknown window. `EMPTY_CONTEXT` and
   * every hand-built caller omit it and behave exactly as shipped.
   */
  objectiveActiveSinceSec?: number;
}

const EMPTY_CONTEXT: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0 };

export interface ObjectiveStepResult {
  done: boolean;
  /** 0..1 for HUD progress (1 exactly when done for progressive objectives). */
  progress: number;
  evalState: ObjectiveEvalState;
  /** A10 measurement channel (attempts, reaction band, …); hardened evaluators only. */
  detail?: ObjectiveDetail;
}

const KMH_TO_MS = 1 / 3.6;
const DEG_TO_RAD = Math.PI / 180;
/** Position jumps above this per tick are treated as teleports (reset/respawn). */
const TELEPORT_JUMP_M = 50;
/** At/below this speed the vehicle counts as stopped for maneuvers, km/h. */
const STOPPED_SPEED_KMH = 1;

/**
 * B4/B5 (doc 86 §3, 2026-07-30) — the reach-zone GRACE ring, meters, and it
 * only ever extends the mark BACKWARD, toward the driver. That asymmetry is
 * the whole design; the rest is arithmetic.
 *
 * WHAT WAS BROKEN. The evaluator demanded `inZone && slowEnough` on the same
 * frame, against a circle of radius 3.5–6 m. Two students were trapped by it
 * and neither was driving badly:
 *
 *  - B5, the forced pose. Founder, verbatim: „if I don't stop on the green
 *    circle I can't do anything, I must do a violation and go back to the
 *    green circle." He had stopped SHORT of a give-way mark — the pose with
 *    the better sightline, the pose an instructor asks for — and the drill
 *    refused it, then demanded he creep forward into the one position that
 *    cannot see. `sc-jxgb-yield` is the case: a radius-4 circle admitting the
 *    last 8 m of a lawful stopping band metres long, and doc 86 T6 shows the
 *    conflict car is occluded from exactly that spot.
 *  - B4, the discipline shown early. Braking to the cap on the approach and
 *    coasting through a shade above it read as failure, though the taught
 *    behaviour — slow down BEFORE the hazard — had been performed.
 *
 * WHY IT DOES NOT EXTEND FORWARD, which the first draft of this fix got wrong
 * and three counter-proof suites caught: on a „спри на маркировката" drill the
 * OVERSHOOT IS THE GRADED FAILURE. `sc-ac-wet-braking`'s whole subject is that
 * wet grip needs an earlier braking point, and its mistake demo slides past
 * the mark into a collision; `sc-pk-ban-stop`'s mistake demo rests five metres
 * beyond the legal spot. Crediting either would have taught, at scale, that
 * stopping past the line is stopping at it. Short of the mark is better
 * driving and counts; past the mark is the mistake and does not.
 *
 * WHY IT DOES NOT EXTEND SIDEWAYS either. finish.ts treats a car standing one
 * lane over (8.13 m) at the end of the route as STUCK — that is the entire B3
 * fix — so an evaluator that called the same car ARRIVED would have the module
 * arguing with itself. The grace is therefore a CAPSULE along the approach
 * axis: extra length behind the mark, the authored radius and no more across
 * it.
 *
 * 5 m is a car length and a bit — the amount by which a learner misjudges
 * „here", and no more. It was 8 m in the first draft and that was measurably
 * too much: `sc-vp-police-stop`'s panic slam rests 10.1 m short of a radius-3
 * kerbside mark, which is not „a shade early", it is the failed pull-over the
 * drill is about. A grace big enough to swallow that is a grace big enough to
 * swallow the lesson.
 *
 * The standstill arm additionally requires the cap to be a genuine STOP
 * demand (REACH_ZONE_HALT_CAP_KMH). A cap of 20 km/h on a roundabout chord is
 * a flow envelope, not „stop here" — `sc-rb-busy-gap` says so in its own
 * comment — so a car that came to rest near it (in that drill, by crashing)
 * has demonstrated nothing about reaching the mouth.
 *
 * A student who DOES overshoot is still not trapped — he is simply not
 * credited. finish.ts ends the drive at the route's end (B1/B2/B3) and
 * progress.ts lets him take the next rung anyway (B9), so the cost of the
 * mistake is the mistake, not the afternoon.
 *
 * This LOOSENS PROGRESSION ONLY. Not one line of law moves: the rule engine
 * still grades speed, overshoot and yield exactly as before — the
 * progression/correctness split documented at the top of this file.
 */
export const REACH_ZONE_GRACE_M = 5;

/**
 * A WAYPOINT IS CROSSED, NOT SAMPLED — 2026-08-16, measured on staging.
 *
 * `stepReachZone` asked one question per tick: „is the car's CENTRE POINT
 * inside the authored circle right now". A point test on a discretely sampled
 * path only works while the sample spacing is small next to the target, and
 * since d1f5e18 („one frame, one clock") the spacing is stated outright:
 * `PHYSICS_MAX_FRAME_DT = 0.5`, so one tick advances the world by up to half a
 * second of travel, however long the frame took in wall time.
 *
 *      0.5 s at 30 km/h = 4.17 m      0.5 s at  50 km/h =  6.94 m
 *      0.5 s at 60 km/h = 8.33 m      0.5 s at 130 km/h = 18.06 m
 *
 * And that is not a headless artefact. The render graph in LessonScene's own
 * measurement costs 2.33 s/frame at dsf1 and 3.57 s/frame at dsf2 on the
 * founder's PC profile; this box measured `sc-lane-change` L1 on staging at
 * 0.46 fps and `sc-roundabout-entry` L1 at 0.33 fps, i.e. every single tick
 * spending the whole 0.5 s clamp. Every device slower than 2 fps is here.
 *
 * AGAINST THE SHIPPED CATALOGUE (674 terminal reachZone rungs; radius min 2.2,
 * median 10, max 23), counting rungs whose whole acceptance disc is narrower
 * than one tick of travel:
 *
 *      speed      diameter < one tick        radius < one tick
 *      30 km/h            0                          70
 *      50 km/h           17                         177
 *      60 km/h           70                         235
 *      90 km/h          167                         524
 *
 * A rung in the first column can be driven through DEAD CENTRE with no sample
 * inside it at all; one in the second is missed by any line more than a metre
 * or two off the mark. `sc-lane-change` L3-L5 is the founder's own case:
 * radius 4, no cap, on a 50 km/h street — 8 m of disc against a 6.94 m tick, so
 * every approach further than 1.2 m off the mark's own line has a chord shorter
 * than one step. Across all 1,720 reachZone gates in the catalogue, 71 are
 * narrower than a single 50 km/h tick.
 *
 * THE FIX ADDS NO TOLERANCE. It replaces „was a sample inside the circle" with
 * „did the path cross the circle" — the segment from the previous tick's
 * position to this one, which the evaluator already stores (`prevPos`, kept for
 * the grace capsule's approach axis). Nothing outside the authored disc is
 * credited, at any rung, at any speed; a car that never drove through it still
 * gets nothing.
 *
 * The straight segment is honest at this cadence: the deviation of a real arc
 * from its chord over a tick is a·T²/8, and at the sim's lateral-grip ceiling
 * (~3 m/s²) over 0.5 s that is 0.09 m — two orders under the smallest authored
 * radius in the catalogue.
 *
 * Guarded by TELEPORT_JUMP_M so a reset/respawn cannot draw an acceptance line
 * across the district, and applied ONLY to the authored disc: the grace capsule,
 * the `acceptBeforeMarkM` cut and the speed cap are evaluated at the tick's own
 * position exactly as before. That ordering matters for B18/FR-24 — a car that
 * sweeps through a stop-line waypoint and ENDS past the paint is still refused,
 * because `beyondMark` reads where the car actually is.
 *
 * (No constant to tune: the swept test IS the arrival test. See `segmentDist`
 * and its one call site in `stepReachZone`.)
 */

/**
 * The standstill arm of the grace only applies to a zone whose cap is a STOP
 * demand. At or below walking-plus pace the objective is „спри тук" and
 * stopping short of it is the same act done earlier; above it the cap is a
 * flow envelope (a ring chord at 20, a rain approach at 42) and coming to
 * rest nearby proves nothing about having reached the place.
 */
export const REACH_ZONE_HALT_CAP_KMH = 8;

/**
 * A CAP IS A CONTRACT ON THE APPROACH, NOT A MOMENT — sweep 161, 2026-08-18.
 * How far over its own cap a car may be AT the mark and still keep a cap
 * honoured earlier on the approach, km/h.
 *
 * WHAT WAS BROKEN. `capMet` latched on „the cap was honoured at least once
 * inside the authored radius, OR on the approach to it" (B4, above) and was
 * never asked again. B4 was written for a car that BRAKES: it slows to the cap
 * before the hazard and drifts a shade over as it arrives. Nothing in it
 * considered the car that crosses the same speed FROM BELOW — every drive
 * starts at rest, so an accelerating car passes through „at or under the cap"
 * somewhere inside the capsule as a matter of arithmetic, and banked the whole
 * speed contract on its way past. The faster it then arrives, the less it is
 * asked.
 *
 * Five shipped drills, both platforms, all from the same sweep — every one an
 * authored cap, a mistake-demo drive that never braked, and a green tick:
 *
 *   drill                      cap   arrived   the protocol printed beside it
 *   sc-crossing-dart            40    51–59    «Твърде бързо приближаване към
 *                                              пешеходна пътека» −10 ОПАСНА
 *   sc-crossing-white-cane      40    59       0 full stops, ✓ at 0:37
 *   sc-crossing-bus-shadow      30    57       0 full stops, ✓ at 0:33
 *   sc-hazard-obstacle          46    59       ИЗДЪРЖАН ★★★ +100 XP
 *   sc-hz-breakdown-pulloff    130   145       «Превишена скорост» × 4
 *
 * `sc-crossing-dart/mobile-wrong/04-t007s.png` is the whole defect in one
 * frame: the ✓ toast «Приближи пътеката с готовност за спиране» sitting over a
 * cluster reading 51 км/ч, with the zebra still ahead of the bonnet.
 *
 * THE CODE NOW SAYS WHAT THE HUD ALREADY PROMISED. lessons/engine.ts renders
 * this exact sentence off `overCapNoted`: «Задачата иска да си тук с не повече
 * от N км/ч, а стигна дотук с M км/ч … Ако я подминеш с тази скорост,
 * задачата остава неизпълнена.» (It said «а в момента караш M км/ч» until
 * 2026-08-25 — a present tense over a frozen sample, which the card's own
 * «Намали СЕГА» falsified; see the block at that string. The middle clause has
 * a second form, «а върху точката вдигна скоростта до M км/ч», for the frame
 * this latch fires on a car that ARRIVED legally and lost the speed after —
 * which is what the 29 gates carrying a `requireLamps`/`requireGear` demand
 * beside their cap do on their mistake lane.) Passing it at that
 * speed did NOT leave the
 * task unfulfilled whenever the latch had already been banked — the card was
 * describing behaviour the evaluator did not have.
 *
 * AND THE REFUSAL IS NOT SILENT, which is the bar doc 86 B4 set for this whole
 * evaluator. That card fires on `overCapNoted`, and `overCapNoted` is gated on
 * `!done` — so on exactly these drives it used to stay quiet, because the
 * banked latch made `done` true on the arrival frame. The same fix that stops
 * the tick starts the sentence, on the frame it happens.
 *
 * WHY 5 AND NOT ZERO. Zero revokes B4/B5, the founder's own rescue: the
 * shipped counter-proof arrives 3 км/ч over a 6 км/ч halt gate after stopping
 * short, and refusing that is the failure he ranks worst. 5 is not a new
 * number — it is the rule engine's `speedingGraceMaxKmh` (DEFAULT_RULE_CONFIG,
 * rules/types.ts), whose own comment states the reasoning this borrows:
 * „speedometer/physics slack, which does not grow because the road is faster".
 * approach-cap-contract.test.ts pins the two together so a change to one is a
 * failing test rather than a drift.
 *
 * NOT the engine's RATIO form (10 % of the limit, capped at 5). Against a halt
 * gate of 6 that is 0.6 км/ч — under the founder's 3 — so the proportional
 * reading would have re-broken B5 at exactly the drills B5 was written for.
 * The measured driveline wobble this must not trip on is 0.06–0.12 км/ч
 * (SMOOTH_STOP_DECEL_WINDOW_SEC's table), i.e. 5 clears noise by forty times.
 *
 * IT CANNOT TRAP ANYONE, and that is checked rather than asserted: the
 * withdrawal is not a latch. Braking to the cap while still on the mark
 * re-earns it on the next frame, and so does a fresh approach — the same two
 * ways out a student who never met the cap has always had.
 */
export const REACH_ZONE_CAP_SLACK_KMH = 5;

/**
 * THE ARRIVAL CONTRACT GAINS THE TWO THINGS A DISC WAS NEVER ASKED FOR — sweep
 * 161, 2026-08-19: the state of the car's OWN LAMPS, and the DIRECTION it is
 * travelling in.
 *
 * WHAT WAS BROKEN. `stepReachZone` is handed (params, prev, tick) and grades a
 * PLACE and a SPEED, and `ReachZoneParams` has no field with which a template
 * can demand anything else — so a title that promises more than that is a
 * certificate nobody signed. Five shipped drills, both platforms, all from the
 * same sweep, every one a green tick for the lesson's own subject:
 *
 *   drill / gate                          the banner said        what ticked
 *   sc-ac-night-lights/sc-acn-lit         «…зона осветен»        СВЕТЛИНИ dim in
 *                                                                t011/t063/t116/t183,
 *                                                                ИЗДЪРЖАН, 0 т.
 *   sc-ac-rain-lights/sc-acr-lit          «…осветен и съобразен» СВЕТЛИНИ + ЧИСТАЧКИ
 *                                                                dim all run, 3/3 ★
 *   sc-ac-highbeam-lead/sc-ahl-follow     «…с къси светлини»     mobile-WRONG ticked
 *                                                                it at 1:11 on a run
 *                                                                with 18 collisions
 *   sc-ed-reverse-line/sc-edrl-reverse-mid «…по средата на       the WRONG run ticked
 *                                          заден ход»            it at 0:59 driving
 *                                                                FORWARD in D at 60
 *   sc-park-bay-exit-rev/sc-pbe-out       «излез … на заден ход» graded on place + a
 *                                                                cap of 8 alone
 *
 * `sc-ac-night-lights/pc-right/04-t116s.png` is the whole class in one frame:
 * the ✓ «Мини контролната зона осветен» over a dim СВЕТЛИНИ telltale and a road
 * with no headlight pool on it, in the lesson whose entire subject is reaching
 * for that switch.
 *
 * THE CHANNEL WAS NEVER BLIND, and that claim is the reason this went unfixed.
 * Doc 88 §2.6 O3 recorded the class as unclosable — „the night/lamp channel
 * reaches NEITHER grader, so a lamp gate in `stepReachZone` would read the same
 * blind channel and change nothing" — reasoning from the rule engine's silence
 * (`HEADLIGHTS_OFF_AT_NIGHT` fired zero times on the same drive). READ OUT OF
 * THE TREE INSTEAD OF INFERRED, the path is whole and every hop is a line:
 *
 *   cabin.ts `cycleHeadlights` / TouchControls' СВЕТЛ cell
 *     → scene/vehicleSample.ts  VehicleSample.headlights
 *     → runtime/worldRuntime.ts:1886  `headlights: v.headlights`
 *     → SimTick.headlights ────────────────┐
 *   LessonScene.tsx:1111 `timeOfDay === "night"`  → :3163 runtime.sample(…, isNight, …)
 *     → SimTick.isNight ───────────────────┴──→ stepObjective(params, prev, TICK)
 *
 * `SimTick.headlights` is a REQUIRED field of the contract, not an optional
 * one — every caller must fill it — and this evaluator has been handed it on
 * every frame since the contract existed. The rule engine's silence is a
 * separate defect in a separate file; it is not evidence about this one, and
 * treating it as evidence is what left five green ticks standing for a year.
 *
 * WHY THE TITLE MAY FILL THE DEMAND IN. The alternative — an authored-only
 * param — closes nothing today, because the fix would then live in six template
 * files this lane does not own, which is the shape doc 88 §2.6 says produced
 * nine of its nineteen unclosed rows. Deriving the demand from `titleBg` makes
 * the invariant structural instead: THE GATE MEASURES WHAT THE BANNER PROMISES,
 * and a promise cannot be written that nothing enforces. An explicit param
 * still wins, which is how the two rows this cannot reach are meant to be
 * spent (`sc-ac-fog`, `sc-ac-snow` — their banners name a SPEED and their
 * briefings name the lamps, so only an authored `requireLamps` can bind them).
 *
 * IT CANNOT TRAP ANYONE, and that is the half that was checked before the half
 * that refuses. The switch is reachable on both platforms — `KeyL` /
 * `CABIN_KEYS.headlights` on desktop, the always-mounted СВЕТЛ and МЪГЛА cells
 * of the TouchControls flank strip on mobile — and the latch is not a one-shot:
 * lighting up at the mark earns it on the next frame, exactly as braking to a
 * cap re-earns that one. A student is never asked to have done something he can
 * no longer do.
 *
 * WHAT IS DELIBERATELY NOT HERE. Nothing infers the demand from the WEATHER.
 * `tick.isNight || tick.rain || tick.fog` is the LAW's trigger (ЗДвП чл. 70,
 * 71) and the rule engine already grades it there; hanging it on every
 * reachZone would refuse «Стигни края на отсечката» to a car that did reach the
 * end, which is a lie about geometry to punish an offence that already has a
 * grader. A place gate grades place; this adds only what the gate's own title
 * put its name to.
 */
export type ReachZoneLampDemand = "lit" | "low" | "high" | "fog";
/** The only direction demand a disc can witness: the car went through BACKWARDS. */
export type ReachZoneGearDemand = "reverse";

/**
 * The demands `ReachZoneParams` could not express.
 *
 * DECLARED HERE, NOT IN `lessons/types.ts`, and that is a routing note rather
 * than a preference: `ReachZoneParams` lives in another lane's file, and this
 * is the same copy law `PARK_CAR_HALF_LENGTH_M` above states — the extension is
 * additive and optional, so `ReachZoneParams` is assignable to it and every
 * existing caller compiles untouched. WHEN A LANE OWNS `lessons/types.ts`, fold
 * these optional fields into `ReachZoneParams` itself and delete this
 * intersection; `reach-zone-witness.test.ts` pins the behaviour either way.
 */
export interface ReachZoneWitnessDemands {
  /** The lamps the gate's own banner promises. Absent = the gate promises none. */
  requireLamps?: ReachZoneLampDemand;
  /** The travel direction the gate's own banner promises. Absent = any. */
  requireGear?: ReachZoneGearDemand;
  /**
   * THE OFFICER'S PERMISSION, for a gate whose banner promises it — the third
   * demand, and the only one that is not a state AT the mark (2026-08-19).
   *
   * WHAT WAS BROKEN, measured through the production evaluator on the shipped
   * recordings of `sc-sig-controller-postures` (the drive-through-the-officer
   * demos this template ships as its own counter-examples):
   *
   *   drive                        stopLineCrossed carried   sc-sctp-cross
   *   shadow-correct               trafficLight/red/proceed   ✓ @46.8 s
   *   mistake-barge-chest          trafficLight/green/halt    ✓ @25.7 s
   *   mistake-start-on-raised-arm  trafficLight/yellow/halt   ✓ @34.2 s
   *
   * The banner is «Премини кръстовището, когато позата разреши посоката ти» and
   * the gate was a bare disc 45 m north of the junction, so the two drives that
   * bill CONTROLLER_SIGNAL_VIOLATED — the 10-point опасна this whole template
   * exists to forbid — collected a written certificate that the posture had
   * released them. Its sibling `sc-sig-controller-live` was never in this state:
   * `sc-sctl-cross` is a `passSignal` whose `requireRedMet` reads the same
   * `controller` field, and the same probe measures it refusing both of ITS
   * mistake drives. The postures template simply had no gate that read it.
   *
   * THE CHANNEL WAS ALREADY ON THE TICK. `SimTickEvent.stopLineCrossed.
   * controller` is documented in rules/types.ts as „the EFFECTIVE signal …
   * overrides `lightState` ENTIRELY (ЗДвП чл. 7)", and the table above is that
   * field read straight off the recordings — not inferred from the rule
   * engine's verdict, which is a different module's opinion about the same
   * frames.
   *
   * EARNED BY THE EVENT, SPENT BY THE EVENT, so no new eval-state field is
   * needed: the permission is observed on the frame the line is crossed, and
   * `capMet` carries it from there. Crossing again on „proceed" after a halted
   * crossing earns it back — a student who barges and comes round is not
   * trapped, which is the half that had to be checked before the half that
   * refuses.
   */
  requireControllerProceed?: boolean;
  /**
   * THE PERSON THE BANNER SAYS WAS WAITED FOR WAS NOT RUN OVER — the fourth
   * demand, and like the officer's permission it is a claim about the JOURNEY,
   * not a state at the mark (2026-08-24, sc-hz-emergency-stop:5b697845).
   *
   * WHAT WAS BROKEN, on the proof2 frame (mobile-right, TRACKED 98%):
   * «✓ Спри преди детето — с пълна спирачка, в лентата 1:40», «Удар в пешеходец
   * −10 изпитни т. ОПАСНА ГРЕШКА … в 1:48», «✓ Изчакай детето и продължи до
   * края на отсечката 2:14» — one protocol that congratulates the wait and
   * convicts the strike, eight seconds apart. `sc-hzes-finish` is a bare disc
   * at (LANE_X, 220), so arrival was the whole certificate.
   *
   * THE CHANNEL WAS ALREADY ONE PARAMETER AWAY. `stop-claim-gates.test.ts`
   * ruled this row unwitnessable — „stepReachZone receives no ObjectiveContext,
   * so no value of any param can make one of these true" — which repeated the
   * lamp entry's mistake of reasoning from a silence instead of the tree:
   * the child IS a staged encounter (`SC_HZ_EMERGENCY_STOP_DART`), her runner
   * resolves `detail: "collision"` on contact (orchestrator/runners.ts), the
   * shell folds it (`LessonPlayShell.tsx` → `applyStagedOutcome`) and the
   * engine hands the outcomes to `stepObjective` on every frame. Only the
   * forwarding into `stepReachZone` was missing.
   *
   * WHAT IT REFUSES AND WHAT IT DOES NOT — both directions, measured in
   * `reach-zone-vru-untouched.test.ts`:
   *  · REFUSED: the tick while the run's latest resolved dart encounter reads
   *    `detail: "collision"` — the drive whose own record says the person the
   *    banner names was struck. Permanent for the run unless a LATER encounter
   *    resolves clean (self-correction is the one thing a drill must never
   *    punish — the re-latch law above).
   *  · UNTOUCHED: no outcome yet (the dart never released — a crawl below
   *    `minTriggerSpeedKmh` keeps its tick exactly as shipped, and the staged
   *    channel's own «тази ситуация не се случи» debrief line keeps owning
   *    that case), any non-collision resolution, and every gate whose banner
   *    makes no wait-for-a-person claim (the census in `deriveVruWaitDemand`).
   *
   * It does NOT ride the `capMet` latch: outcomes are session-monotone, so the
   * refusal needs no eval-state memory — it is a pure per-frame read of the
   * same `ObjectiveContext` that `requireRedMet` and `emergencyStop` already
   * consume. What it still cannot witness is the POSITIVE half („waited out"),
   * so the row keeps its retitle debt in `ACTOR_CLAIM_KNOWN_OPEN`.
   */
  requireVruUntouched?: boolean;
  /**
   * NOTHING WAS STRUCK ON THE WAY HERE — the fifth demand, declared on
   * `ReachZoneParams` itself (lessons/types.ts, which carries the finding, the
   * routing note it answers and the reason the ledger is read whole) and
   * restated here so the five demands read as one set.
   *
   * It is listed with its siblings and behaves like the fourth: a claim about
   * the JOURNEY, read per frame off `ObjectiveContext.struckABodyInRun`,
   * outside the `capMet` latch, and absent on every zone that does not author
   * it. See `noContactHonoured` for the read and `contactVoidsObjective` for
   * the permanence the finish gate has to know about.
   */
  requireNoContact?: true;
  /**
   * THE ARM WAS UP WHEN THE CAR WENT OVER THE RAILS — the sixth demand,
   * declared on `ReachZoneParams` itself (lessons/types.ts, which carries the
   * finding and the three files that routed it here) and restated here so the
   * set reads as one.
   *
   * A claim about the JOURNEY, like the fourth and the fifth: a per-frame read
   * of `ObjectiveContext.enteredRailBarredInRun`, outside the `capMet` latch,
   * absent on every zone that does not author it. See `railClearHonoured` for
   * the read — and, more usefully, for the per-frame design this replaced and
   * the recorded drive that killed it.
   */
  requireRailClear?: true;
  /**
   * THE YIELD THE BANNER SAYS HAPPENED — the seventh demand, and the first one
   * whose refusal is bounded by a WINDOW rather than by the whole run
   * (2026-08-27, sc-signal-flashing:fe1889f5).
   *
   * WHAT IS BROKEN, read off `w11/frames/sc-signal-flashing__mobile-right`
   * (31 frames, TRACKED 100 %, steered, ended naturally, EVIDENCE complete).
   * `_audit-debrief.json` prints, on one screen:
   *
   *   Задачи от маршрута  ✓ Приближи мигащото жълто бавно…       1:04
   *                       ✓ Премини правó напред, СЛЕД КАТО
   *                         ПРОПУСНЕШ идващия отдясно            1:48
   *   Грешки (2)          ✗ Непропускане на пътно превозно
   *                         средство с предимство −10 изпитни т.
   *                         ОПАСНА ГРЕШКА                    в 1:43
   *   Разбор              «…допусната е опасна грешка: „Непропускане на пътно
   *                       превозно средство с предимство“ … ЗАДАЧИТЕ ОТ
   *                       МАРШРУТА СА ИЗПЪЛНЕНИ.»
   *
   * Five seconds. The instructor convicts the student of not giving way and
   * then certifies, twice, that he gave way. The frames carry the same order
   * with no clock to argue about: at `04-t092s` the −10 card is on the glass
   * with «Задача 2/2 … след като пропуснеш идващия отдясно» still OPEN, and at
   * `04-t099s` that very task is ticked. `sc-sflash-cross` is
   * `{kind:"reachZone", x:4.06, y:45, radiusM:9}` — a bare disc 45 m north of
   * the junction. Arrival was the whole certificate.
   *
   * THE CHANNEL IS THE LESSON'S OWN. `SC_SIGNAL_FLASHING.mistakes[]` cites
   * `FAILED_TO_YIELD` twice, by name, as the fault this drill exists to teach;
   * the rule engine bills it («Непропускане на пътно превозно средство с
   * предимство», ЗДвП чл. 47/48/50) and `lessons/engine.ts` already holds that
   * ledger — both halves of it, `prev.events` and the events of the frame being
   * stepped. Nothing new observes anything: the gate reads the verdict the
   * grader that owns this duty has already written, exactly as
   * `requireRailClear` does and for the same reason argued in
   * `railClearHonoured`.
   *
   * A WINDOW, NOT THE RUN, and this is the one place this file departs from its
   * three session-monotone demands. «Пропусни колата с предимство НА ВТОРОТО
   * кръстовище» (`sc-jx-giveway-b1/sc-jxgb-yield`) is a drill with two Б1
   * junctions in a row: a student who barged the FIRST one and then gave way
   * properly at the second told the truth about the second, and a run-wide read
   * would call him a liar. So the refusal is bounded below by the moment this
   * objective BECAME the active one — the chain is strictly sequential, so that
   * moment is exactly when its predecessor completed
   * (`ObjectiveContext.objectiveActiveSinceSec`, filled in by
   * `lessons/engine.ts`). On the drive above the window is [1:04, 1:48] and the
   * fault at 1:43 sits inside it; at `sc-jxgb-yield` the first junction's
   * failure falls before `sc-jxgb-roll` completes and is outside it.
   *
   * WHICH LEDGER ROWS FALSIFY WHICH BANNER — `traffic` reads
   * FAILED_TO_YIELD + EMERGENCY_NOT_YIELDED, `pedestrian` reads
   * PEDESTRIAN_NOT_YIELDED. Split rather than pooled because a banner that
   * promises a pedestrian was let through is not falsified by a vehicle the
   * same student cut up: the certificate would be withdrawn for something it
   * never claimed, and a false refusal is the crime this programme exists to
   * end. `ReachZoneYieldDemand` carries the third, pooled kind that was cut
   * before it shipped, and the drill that would have suffered from it.
   *
   * IT IS NOT A SILENT VERDICT (THEO-4). The withheld tick never arrives alone:
   * the same drive is holding the rule engine's own −10 card, with the
   * catalogue's explanation and its «✔ Правилното действие» corrective, raised
   * five seconds earlier and repeated on the debrief with its law refs. This
   * demand removes a contradiction from a protocol that already explains
   * itself; it does not introduce a new unexplained one.
   *
   * OUTSIDE THE `capMet` LATCH, like the fourth, fifth and sixth: the ledger is
   * append-only within a window, so the read is pure per frame and needs no
   * eval-state memory. UNKNOWN IS NEVER A REFUSAL — a context that carries no
   * window (every fixture, rig and hand-built replay, and `EMPTY_CONTEXT`)
   * leaves the demand met, so every such caller is bit-identical to shipped.
   */
  requireYieldClean?: ReachZoneYieldDemand;
  /**
   * «СПРИ ПРЕД ЧОВЕКА» — the eighth demand, and the first that is not a NEW
   * question but the fourth one's OTHER banner family (2026-08-27,
   * sc-hz-emergency-stop:42c93d49 / :a15ebca4).
   *
   * WHAT IS BROKEN, measured on `w13/frames/sc-hz-emergency-stop__mobile-right`
   * and not inferred from a summary. Beat `04-t064s` carries «Задача 2/3 Спри
   * преди детето — с пълна спирачка, в лентата». The NEXT beat, `04-t070s`,
   * carries BOTH of these on one screen:
   *
   *   −10 изпитни т.  Удар в пешеходец   (a fresh card, "+2" badge)
   *   ✓ Спри преди детето — с пълна спирачка, в лентата
   *
   * and the sheet closes «Задачи от маршрута ✓ Спри преди детето … 1:27» over
   * «Грешки (2)» whose first row is that strike. The drive ran the child down
   * and was told, in the same instant, that it had stopped before her.
   * `sc-hzes-stop` is `{kind:"reachZone", x:LANE_X, y:146, radiusM:4,
   * maxSpeedKmh:6}` — a halt disc four metres short of her line. Coming to rest
   * near the mark was the whole certificate; nothing asked whether she was
   * still standing.
   *
   * A SEPARATE KEY FROM `requireVruUntouched`, DELIBERATELY, and it reads the
   * SAME fact. `deriveVruWaitDemand`'s census, its eleven-title teeth and its
   * «Спри преди детето does NOT match» row are all pinned in
   * `reach-zone-vru-untouched.test.ts` against the ONE gate that families of
   * drills depend on; widening that matcher in place would have rewritten a
   * shipped census to close a different row. Two keys, two matchers, two teeth
   * tests, one context field — and the two may diverge later without either
   * having to argue with the other's frames.
   *
   * AND THE ARGUMENT THAT KEPT IT OUT IS ANSWERED, not ignored. That census
   * excluded this title because „its certificate was true when issued … the car
   * DID stop before her; the strike came on the move-off, which is objective 3's
   * claim". That is a fact about ONE recorded drive, and the ordering is not a
   * property of the drill: the frames above show the strike arriving BEFORE the
   * tick, on the same beat. A demand read per frame answers both orderings
   * correctly — a strike already on the ledger refuses the certificate, and a
   * strike that comes afterwards cannot touch it, because a completed objective
   * is never re-stepped.
   *
   * IT CANNOT COST ANYONE A PASS. `COLLISION` with a person is опасна and
   * terminating (Наредба № 38 чл. 48, ал. 3) — every drive this can refuse was
   * already НЕИЗДЪРЖАН before the objective was consulted. What the refusal
   * removes is the CONTRADICTION between the two halves of one sheet, never a
   * verdict.
   *
   * AND IT IS NOT A SILENT VERDICT (THEO-4): the same drive is holding the
   * −10 «Удар в пешеходец» card with its catalogue explanation, its «✔
   * Правилното действие» corrective and its law refs, and the debrief repeats
   * all three. This removes a contradiction from a protocol that already
   * explains itself.
   *
   * Outside the `capMet` latch, like the fourth, fifth and sixth: a struck
   * person is session-monotone, so the read is pure per frame.
   */
  requireHaltForVru?: true;
}

/**
 * The three ledger rows that can falsify a «пропусни …» banner, named here
 * rather than imported from `rules/types.ts` so this evaluator keeps its one
 * dependency on that module (`SimTick`). `lessons/engine.ts` is the only
 * producer and its `isYieldFault` predicate is pinned against the real
 * `ViolationCode` union, so a rename over there fails the build rather than
 * quietly emptying this gate.
 */
export type YieldFaultCode =
  | "FAILED_TO_YIELD"
  | "EMERGENCY_NOT_YIELDED"
  | "PEDESTRIAN_NOT_YIELDED";

/**
 * Which road user the banner claims was let through.
 *
 * TWO KINDS AND NOT THREE. A pooled „either" kind was cut before it shipped:
 * its only candidate was `sc-pzl-exit` («Пълзи до устието на изхода и пропусни
 * улицата»), and pooling would have let a PEDESTRIAN_NOT_YIELDED billed inside
 * the living zone — where the drill's own objectives 2 and 3 are about people
 * in the carriageway — withdraw a certificate about joining the STREET. That is
 * a certificate withheld for something it never claimed, which is the false
 * refusal this split exists to prevent. The narrower demand forgoes a refusal;
 * the wider one invents one, and only the second is a defect.
 */
export type ReachZoneYieldDemand = "traffic" | "pedestrian";

/** One billed yield failure, as `lessons/engine.ts` reads it off the ledger. */
export interface YieldFaultRecord {
  code: YieldFaultCode;
  /** Session seconds — the same `tick.t` clock `completedAtSec` is stamped on. */
  tSec: number;
}

const YIELD_DEMAND_CODES: Record<ReachZoneYieldDemand, readonly YieldFaultCode[]> = {
  traffic: ["FAILED_TO_YIELD", "EMERGENCY_NOT_YIELDED"],
  pedestrian: ["PEDESTRIAN_NOT_YIELDED"],
};

export type WitnessedReachZoneParams = ReachZoneParams & ReachZoneWitnessDemands;

/**
 * THE BANNER'S OWN WORDS, and the boundaries are spelled out in Unicode classes
 * because JS `\b` is ASCII-only — which matters here more than anywhere: three
 * shipped rows describe an unlit PLACE with the same six letters that name a lit
 * CAR, and a place is exactly what a disc can be drawn around.
 *
 *   «Мини контролната зона осветен»                     ← the car   → demand
 *   «Мини неосветения участък със съобразена…скорост»   ← the road  → none
 *   «Спри на позицията, в рамките на осветеното»        ← the road  → none
 *   «Приближи неосветената пътека със скорост…»         ← the road  → none
 *
 * The lookbehind kills «неосветен…», the lookahead kills every attributive
 * ending («-ия/-ата/-ото/-о»), and what survives is the predicate adjective —
 * „go through it LIT". Both halves are pinned by `reach-zone-witness.test.ts`
 * against these four exact strings, so a matcher that quietly stopped matching
 * (the instrument bug this programme has shipped four times) fails the build
 * instead of silently emptying the census.
 *
 * ORDER IS SIGNIFICANT — the specific beams before the generic „lit", and the
 * fog lamps before both, since «фарове за мъгла» contains «фарове».
 */
const LAMP_TITLE_FOG = /фаров(?:е|ете) за мъгла/iu;
const LAMP_TITLE_LOW = /къси светлини/iu;
const LAMP_TITLE_HIGH = /дълги светлини/iu;
const LAMP_TITLE_LIT = /(?<![\p{L}])осветен(?![\p{L}])/u;

/**
 * «НА заден ход» is the act; «ЗА заден ход» is the reason — one letter, and the
 * difference between a gate the car reaches backwards and one it reaches
 * forwards in order to START reversing. `sc-edpc-setup` is the second kind
 * («Заеми изходната позиция ЗА заден ход по права», a radius-3 mark at 6 км/ч
 * the car noses into facing forward), so demanding reverse there would refuse a
 * correct drive — the failure the founder ranks worst — and the exclusion below
 * is what stops it. Both strings are pinned in the teeth test.
 */
const GEAR_TITLE_REVERSE = /(?<![\p{L}])на заден ход(?![\p{L}])/u;
const GEAR_TITLE_REVERSE_PURPOSE = /за заден ход/u;

/** The banner's lamp promise, or undefined when it makes none. */
export function deriveLampDemand(titleBg: string): ReachZoneLampDemand | undefined {
  if (LAMP_TITLE_FOG.test(titleBg)) return "fog";
  if (LAMP_TITLE_LOW.test(titleBg)) return "low";
  if (LAMP_TITLE_HIGH.test(titleBg)) return "high";
  if (LAMP_TITLE_LIT.test(titleBg)) return "lit";
  return undefined;
}

/** The banner's direction promise, or undefined when it makes none. */
export function deriveGearDemand(titleBg: string): ReachZoneGearDemand | undefined {
  if (GEAR_TITLE_REVERSE_PURPOSE.test(titleBg)) return undefined;
  return GEAR_TITLE_REVERSE.test(titleBg) ? "reverse" : undefined;
}

/**
 * THE OFFICER LET ME THROUGH — the banner claim, and it is a claim about ANOTHER
 * PERSON'S decision, which is why it needs its own matcher rather than riding
 * the permission verb.
 *
 * CENSUSED OVER THE WHOLE CATALOGUE (395 objectives, 357 of them reachZone,
 * 2026-08-19) rather than guessed, because the risk here is a false REFUSAL —
 * a gate that demands a stop-line crossing on a lesson that has no stop line
 * can never be completed by anybody. The two populations the matcher has to
 * separate are both real and both shipped:
 *
 *   4 titles name the регулировчик or his поза
 *     ✓ «Премини кръстовището, когато позата разреши посоката ти»   sc-sctp-cross
 *     ✓ «Премини кръстовището след разрешение от регулировчика»     sc-sctrl-cross
 *     ✓ «Премини стоп-линията ПО РАЗРЕШЕНИЕ на регулировчика …»     sc-sctl-cross
 *     ✗ «Приближи кръстовището с регулировчика с готовност за спиране»
 *        — he is a LANDMARK here and the promise is the driver's own readiness;
 *          demanding a permitted crossing of an APPROACH gate would refuse every
 *          correct drive, which is the failure the founder ranks worst.
 *   23 titles carry a permission verb and name nobody
 *     «Мини участъка с РАЗРЕШЕНАТА скорост» · «Спри на РАЗРЕШЕНОТО място» ·
 *     «Приближи завоя с готовност да ПРОПУСНЕШ» … — the road's permission, not a
 *     person's. None of them may acquire this demand and none of them matches.
 *
 * So the matcher asks for the two together: the OFFICER (or his posture) AND a
 * grant of permission. `deriveLampDemand`'s own teeth test is the model, and
 * `controller-claim-gates.test.ts` pins all four strings above so a matcher that
 * quietly stopped matching fails the build rather than emptying the gate.
 */
const CONTROLLER_TITLE_PERMISSION =
  /разрешение (?:от|на) регулировчика|(?:позата|регулировчикът)[^.,;]{0,24}разреш/iu;

/** True when the banner says the officer released this crossing. */
export function deriveControllerDemand(titleBg: string): boolean {
  return CONTROLLER_TITLE_PERMISSION.test(titleBg);
}

/**
 * «ИЗЧАКАЙ + a person on foot» — the banner claims the driver WAITED FOR a
 * human being, which is a claim about that human's fate the disc cannot make
 * alone. CENSUSED over every `titleBg` in the catalogue (2026-08-24) rather
 * than guessed, like the officer matcher above and for the same reason — a false
 * refusal from an over-wide matcher is the failure the founder ranks worst.
 * Eleven shipped titles carry the imperative «изчакай»; exactly ONE pairs it
 * with a person on foot:
 *
 *   ✓ «Изчакай детето и продължи до края на отсечката»      sc-hzes-finish
 *   ✗ «Изчакай червения сигнал…» / «Изчакай червеното…»      — a signal
 *   ✗ «Спри и изчакай на разширението (под 6 км/ч)»          — a place
 *   ✗ «Изчакай зад стоп-линията пред бариерата» (×2)         — a place
 *   ✗ «Изчакай пътеката да се освободи»                      — the crossing
 *   ✗ «Изчакай зад бавната кола…» / «…зад камиона…» /
 *     «Изчакай колата…» / «Изчакай моториста…»               — road users the
 *       dart channel cannot witness (no `pedestrianDartOut` outcome exists for
 *       them), so binding them would author a demand nothing can ever spend —
 *       they stay `ACTOR_CLAIM_KNOWN_OPEN` retitle debts, deliberately.
 *
 * «Спри преди детето…» does NOT match (no wait imperative) — its certificate
 * was true when issued on the very frame this fix was cut from: the car DID
 * stop before her; the strike came on the move-off, which is objective 3's
 * claim. Both halves of the matcher are pinned by the teeth test in
 * `reach-zone-vru-untouched.test.ts`, so a matcher that quietly stopped
 * matching fails the build instead of silently emptying the census.
 */
const VRU_WAIT_TITLE =
  /(?<![\p{L}])изчакай(?![\p{L}])[^.;!?]{0,40}?(?<![\p{L}])(?:дете(?:то)?|децата|пешеходец(?:а|ът)?|пешеходц(?:и|ите))(?![\p{L}])/iu;

/** True when the banner claims a person on foot was waited for. */
export function deriveVruWaitDemand(titleBg: string): boolean {
  return VRU_WAIT_TITLE.test(titleBg);
}

/**
 * «СПРИ ПРЕД/ПРЕДИ + a person on foot» — the OTHER banner family that makes a
 * claim about a human being's fate (see `ReachZoneWitnessDemands.
 * requireHaltForVru` for the frame). CENSUSED over every `titleBg:` in
 * `scenario/templates-*.ts` (2026-08-27) rather than guessed, exactly like the
 * officer, waited-for-person and yield matchers above, because an over-wide
 * matcher here would withhold a certificate a student earned — the failure the
 * founder ranks worst. TWENTY-SEVEN titles in the catalogue name a person on
 * foot; four of them are objective titles that also carry a halt imperative,
 * and three claim the halt was FOR that person:
 *
 *   CLAIMS (→ demand)
 *     «Спри преди детето — с пълна спирачка, в лентата»  sc-hzes-stop   2 of 3
 *     «Спри пред пътеката за появилия се пешеходец»      sc-pnu-halt    2 of 3
 *     «Спри пред тротоара и пропусни пешеходеца»         sc-mfp-walk-yield 1 of N
 *
 *   NOT CLAIMED (→ none)
 *     «Остани зад детето, докато лъкатуши»    sc-vucc-hold-back — a claim about
 *       relative POSITION behind a moving rider, not a halt. Refusing it on a
 *       struck body would be right in every reading I can construct, and that is
 *       exactly why it is left out: no frame has asked for it, and this file
 *       adds demands that a measured drive requires, not demands that sound
 *       correct. Recorded here so the next census starts from the answer.
 *     «Спри напълно на стоп-линията преди релсите» / «Спри пред релсите…» —
 *       a halt before a PLACE; the person alternatives below never match them.
 *     Every «Удар в …», «Непропускане на …», «Преминаване през …» — those are
 *       the rule engine's own FAULT titles and a mistake demo's name. They can
 *       never reach this matcher (it is called with `objective.titleBg` alone),
 *       and the negative lookbehind on «спри» keeps «Спиране …» out regardless.
 *
 * The 40-character window between the verb and the person is the same bound
 * `VRU_WAIT_TITLE` uses, and for the same reason: it keeps «Спри на маркера и
 * изчакай, докато отсрещният поток … пешеходец» — a sentence that mentions a
 * walker in a later clause — from acquiring a demand about him.
 *
 * Both halves are pinned by the teeth rows in
 * `__tests__/reach-zone-halt-for-vru.test.ts`, so a matcher that quietly
 * stopped matching fails the build instead of silently emptying the census.
 */
const HALT_FOR_VRU_TITLE =
  /(?<![\p{L}])спри(?![\p{L}])[^.;!?]{0,40}?(?<![\p{L}])(?:преди|пред)(?![\p{L}])[^.;!?]{0,40}?(?<![\p{L}])(?:дете(?:то)?|децата|пешеходец(?:а|ът)?|пешеходеца|пешеходц(?:и|ите)|незрящия)(?![\p{L}])/iu;

/** True when the banner claims the car halted FOR a person on foot. */
export function deriveHaltForVruDemand(titleBg: string): boolean {
  return HALT_FOR_VRU_TITLE.test(titleBg);
}

/**
 * «ПРОПУСНИ / ПРОПУСНЕШ» — the banner states outright that another road user
 * was let through. CENSUSED over every `titleBg:` in `scenario/templates-*.ts`
 * (2026-08-27) rather than guessed, exactly like the officer and the
 * waited-for-person matchers above, because an over-wide matcher here would
 * withhold a certificate a student earned — the failure the founder ranks
 * worst. NINE objective titles in the catalogue carry the verb; six of them
 * claim the act and three name only a READINESS to perform it:
 *
 *   CLAIMS (→ demand)
 *     «Премини правó напред, след като пропуснеш идващия отдясно»  sc-sflash-cross
 *     «Премини наляво, след като пропуснеш идващия отдясно»        sc-sdead-cross
 *     «Пропусни колата с предимство на второто кръстовище»         sc-jxgb-yield
 *     «Намали, за да пропуснеш потеглящия автобус»                 sc-mgb-ease
 *     «Спри пред тротоара и пропусни пешеходеца»                   sc-mfp-walk-yield
 *     «Пълзи до устието на изхода и пропусни улицата»              sc-pzl-exit
 *
 *   READINESS ONLY (→ none; the graded half is the authored cap, and these
 *   three sit deliberately outside the matcher for the same reason
 *   `ACTOR_CLAIM` in `stop-claim-gates.test.ts` spares an actor named as
 *   scenery — «готовност» is a state of the driver, not a fate of the actor)
 *     «Приближи равнозначното кръстовище с готовност да пропуснеш»
 *     «Приближи завоя с готовност да пропуснеш»
 *     «Приближи завоя бавно, готов да пропуснеш и двете посоки»
 *
 * The lookbehind kills «Непропускане …» (the rule engine's own fault titles,
 * which must never author a demand on an objective), and the inflection list is
 * closed to the imperative and the 2nd-person present the catalogue actually
 * uses. Both halves are pinned by the teeth rows in
 * `__tests__/reach-zone-yield-clean.test.ts`, so a matcher that quietly stopped
 * matching fails the build instead of silently emptying the census.
 */
const YIELD_TITLE = /(?<![\p{L}])пропусн(?:и|еш|ете)(?![\p{L}])/iu;
/** «с готовност да пропуснеш» / «готов да пропуснеш» — a posture, not a fate. */
const YIELD_TITLE_READINESS = /готов(?:ност|а|о|и)?\s+(?:да\s+)?пропусн/iu;
/**
 * The banner names a person on foot as the one let through. The census has ONE
 * member — «Спри пред тротоара и пропусни пешеходеца» — and the `дете`
 * alternatives are not census members but a ROUTING guard: if a template is
 * ever retitled «пропусни детето», this sends it to the pedestrian ledger
 * instead of letting it fall through to the vehicle one, where the demand would
 * consult a row that drill can never bill. An unmatched title is inert; a
 * MISrouted one certifies against the wrong grader, which is worse.
 */
const YIELD_TITLE_PEDESTRIAN = /пешеходец|пешеходц|пешеходка|дете(?:то)?|децата/iu;

/**
 * Which yield, if any, this banner certifies. `undefined` = it certifies none,
 * and every gate that gets `undefined` is bit-identical to shipped.
 *
 * «Пропусни УЛИЦАТА» (`sc-pzl-exit`) falls through to `traffic` deliberately —
 * see `ReachZoneYieldDemand` for the pooled kind that was cut and why.
 */
export function deriveYieldDemand(titleBg: string): ReachZoneYieldDemand | undefined {
  if (!YIELD_TITLE.test(titleBg)) return undefined;
  if (YIELD_TITLE_READINESS.test(titleBg)) return undefined;
  if (YIELD_TITLE_PEDESTRIAN.test(titleBg)) return "pedestrian";
  return "traffic";
}

function parseLampDemand(objective: LessonObjective, v: unknown): ReachZoneLampDemand {
  if (v === "lit" || v === "low" || v === "high" || v === "fog") return v;
  throw new ObjectiveSpecError(
    objective.id,
    'reachZone requireLamps must be "lit" | "low" | "high" | "fog"',
  );
}

function parseGearDemand(objective: LessonObjective, v: unknown): ReachZoneGearDemand {
  if (v === "reverse") return v;
  throw new ObjectiveSpecError(objective.id, 'reachZone requireGear must be "reverse"');
}

/**
 * ONE LATCH CANNOT HOLD TWO INDEPENDENTLY-EARNED HALVES, and this throws rather
 * than quietly producing a gate nobody can complete.
 *
 * `ObjectiveEvalState.reachZone` (lessons/types.ts, another lane's file) has
 * exactly one contract bit, `capMet`, so `contractEarned` is a conjunction
 * evaluated on ONE frame. The cap/lamp/gear arms are all states AT the mark and
 * therefore coincide there; the officer's permission is observed at the STOP
 * LINE, tens of seconds and tens of metres earlier. Author both on one zone and
 * the conjunction can never be true on any single frame — the gate would be
 * unreachable at run time, silently, which is the founder's worst failure mode
 * wearing the opposite mask.
 *
 * FAILING HERE IS THE POINT: `parseObjectiveParams` runs at compile/session
 * start, and every template in the catalogue is parsed by the catalogue-
 * integrity sweep, so the combination cannot reach a student. THE FIX WHEN IT IS
 * WANTED is one boolean in `ObjectiveEvalState.reachZone` (`crossingPermitted`),
 * at which point this guard and the single-frame conjunction both go away.
 */
function hasAtMarkDemand(p: WitnessedReachZoneParams): boolean {
  return (
    p.maxSpeedKmh !== undefined || p.requireLamps !== undefined || p.requireGear !== undefined
  );
}

function parseControllerDemand(
  objective: LessonObjective,
  v: unknown,
  p: WitnessedReachZoneParams,
): true {
  if (v !== true) {
    throw new ObjectiveSpecError(objective.id, "reachZone requireControllerProceed must be true");
  }
  if (hasAtMarkDemand(p)) {
    throw new ObjectiveSpecError(
      objective.id,
      "reachZone requireControllerProceed cannot share a zone with maxSpeedKmh / requireLamps / " +
        "requireGear — one capMet latch, two moments (see parseControllerDemand)",
    );
  }
  return true;
}

/**
 * THE RAISED ARM. No conflict guard is needed and that is a fact about the
 * final design rather than an omission: like `requireVruUntouched` and
 * `requireNoContact`, this demand never touches the `capMet` latch (see
 * `railClearHonoured`), so it can share a zone with any at-mark demand without
 * the single-frame conjunction problem `parseControllerDemand` exists to
 * refuse. What is still refused is a malformed value — a `false` here would
 * read as „no demand" and silently un-gate a crossing.
 */
function parseRailClearDemand(objective: LessonObjective, v: unknown): true {
  if (v !== true) {
    throw new ObjectiveSpecError(objective.id, "reachZone requireRailClear must be true");
  }
  return true;
}

/**
 * THE YIELD. No conflict guard, for the same reason as the raised arm above:
 * this demand never touches the `capMet` latch, so it can share a zone with any
 * at-mark demand without the single-frame conjunction problem
 * `parseControllerDemand` exists to refuse. What is refused is a malformed
 * value — a stray string here would otherwise read as „no demand" and silently
 * un-gate a give-way certificate.
 */
function parseYieldDemand(objective: LessonObjective, v: unknown): ReachZoneYieldDemand {
  if (v === "traffic" || v === "pedestrian") return v;
  throw new ObjectiveSpecError(
    objective.id,
    'reachZone requireYieldClean must be "traffic" | "pedestrian"',
  );
}

/**
 * Is the lamp demand honoured on THIS frame? „fog" is the чл. 74 pairing — the
 * fog lamps are an ADDITION to the dipped beams, never a substitute for them,
 * so it asks for both. `fogLightsOn` is optional on the contract and absent
 * means unknown; unknown is treated as OFF here (the demand is only ever
 * derived from a banner that names the fog lamps outright, so the caller that
 * omits the channel is a hand-built tick, not a drive).
 */
function lampDemandMet(demand: ReachZoneLampDemand, tick: SimTick): boolean {
  const lit = tick.headlights === "low" || tick.headlights === "high";
  switch (demand) {
    case "lit":
      return lit;
    case "low":
      return tick.headlights === "low";
    case "high":
      return tick.headlights === "high";
    case "fog":
      return lit && tick.fogLightsOn === true;
  }
}

/**
 * Did THIS frame's events carry the officer's answer for the crossing, and
 * which one? `controller` is optional by the SimTick contract and absent on
 * every junction without an officer, so a tick that cannot answer leaves the
 * demand exactly where it was — the byte-identity law every additive channel in
 * this file is held to.
 */
function controllerVerdictHere(tick: SimTick): "proceed" | "halt" | null {
  let verdict: "proceed" | "halt" | null = null;
  for (const e of tick.events) {
    if (e.kind !== "stopLineCrossed" || e.controller === undefined) continue;
    // A halt seen anywhere in the frame wins: the frame in which a student both
    // obeyed and disobeyed is not a frame in which he obeyed.
    if (e.controller === "halt") return "halt";
    verdict = "proceed";
  }
  return verdict;
}

/**
 * DID THIS DRIVE GO ONTO THE RAILS WITH THE ARM DOWN?
 *
 * ── THE FIRST DESIGN AND WHY THE MEASUREMENT KILLED IT (wave 2) ─────────────
 *
 * This started as `requireControllerProceed`'s twin: a per-frame read of
 * `tick.railCrossing === "on" && tick.railBarred !== true`, earned on the band,
 * spent on the band, carried by `capMet`. It type-checked, it refused the
 * blast-through demo, and it was WRONG — and it was wrong in the direction that
 * matters, which is why it was driven before it was believed.
 *
 * `mistake-creep-barred` — the drive whose own copy is «Водачът спря учтиво
 * пред прелеза, но не изчака: пропълзя напред и се промъкна през коловоза при
 * още спуснати бариери» — went onto the band inside the barred window [0, 40)
 * and was STILL ON IT when the arm lifted at cyclePos 40, because that is what
 * creeping means. The lift re-earned the latch under a car that was already
 * between the rails. Replayed through `applyTick`, it collected the certificate
 * exactly as it had before the demand existed: the gate refused the driver who
 * raced the boom and acquitted the one who crept under it, which is the
 * distinction the drill exists to teach and the one the copy calls „учтивото
 * спиране не оправдава нищо".
 *
 * ── WHAT IT READS INSTEAD ──────────────────────────────────────────────────
 *
 * The ENTRY, adjudicated once, by the grader that already owns it.
 * `rules/engine.ts` bills `RAIL_CROSSING_VIOLATION` detail `"entered-barred"`
 * on the approach→on transition and nowhere else — „convicts regardless of any
 * stop made first (weaving past the barrier after a polite stop is the kill)" —
 * so the fact this demand needs is a fact the protocol has already printed.
 * Nothing here re-adjudicates a law; it reads one line of the drive's own
 * ledger, the way `requireVruUntouched` reads the struck-person line.
 *
 * SESSION-MONOTONE, AND THAT PERMANENCE IS DELIBERATE. This is the second
 * refusal in this file that cannot be taken back, and it is in the first one's
 * company for a reason: entering a barred crossing is a terminating опасна
 * (Наредба № 38 чл. 48, ал. 3 — «само тази грешка спира и самия изпит»),
 * because on the other side of the boom is a train that can neither stop nor
 * swerve. The re-latch law this file applies everywhere else — „self-correction
 * is the one thing a drill must never punish" — is about acts a student can
 * perform again properly. Driving under a lowered boom is not one of them, and
 * a certificate reading «стигни края на отсечката ОТВЪД ПРЕЛЕЗА» may not be
 * issued for a crossing the same protocol convicts.
 *
 * A REFUSAL MAY NOT DOUBLE AS A TRAP: `sc-rxg-finish` and `sc-rxd-finish` are
 * both TERMINAL, so `railBarredVoidsObjective` below tells `lessons/engine.ts`
 * to release the stalled-chain gate — the certificate stays refused and only
 * the strand goes, exactly as for the struck person.
 *
 * OPTIONAL, and absent means „unknown", never „yes": every hand-built caller
 * omits it and behaves exactly as shipped.
 */
function railClearHonoured(ctx: ObjectiveContext): boolean {
  return ctx.enteredRailBarredInRun !== true;
}

/**
 * Was the halt the banner promises still a halt FOR a living person? Reads the
 * one fact `vruWaitHonoured` reads first and for the identical reason — a
 * struck person is session-monotone and outranks everything — but it does NOT
 * consult the dart record.
 *
 * THAT OMISSION IS THE DESIGN, not an oversight. `vruWaitHonoured` asks about
 * an ENCOUNTER («изчакай детето» — did the staged child resolve clean), so a
 * later encounter resolving clean redeems the run. This demand asks about an
 * ACT the student either performed or did not («спри преди детето»), and the
 * three gates in its census sit on drills where the person may be staged
 * (`sc-hzes-stop`) or ambient (`sc-mfp-walk-yield`, `sc-pnu-halt`) — an ambient
 * walker has no `pedestrianDartOut` outcome at all, so reading the dart record
 * here would leave two of the three gates witnessing nothing. The struck body
 * is a fact about the drive that both kinds produce.
 */
function haltForVruHonoured(ctx: ObjectiveContext): boolean {
  return ctx.struckAPersonInRun !== true;
}

/** True when the demands a reachZone makes are met by the whole zone contract. */
function hasArrivalDemand(params: WitnessedReachZoneParams): boolean {
  // `requireVruUntouched`, `requireNoContact`, `requireRailClear`,
  // `requireYieldClean` and `requireHaltForVru` are deliberately absent: none
  // of them rides the `capMet` latch (every one of those facts is
  // session-monotone, or monotone within its window, so none needs eval-state
  // memory), and folding any of them in would flip `capMet`'s initial value on
  // a demand the latch arithmetic cannot spend or re-earn.
  return (
    params.maxSpeedKmh !== undefined ||
    params.requireLamps !== undefined ||
    params.requireGear !== undefined ||
    params.requireControllerProceed === true
  );
}

/**
 * Was the wait the banner promised honoured, as far as the dart channel can
 * see? Reads the LATEST resolved `pedestrianDartOut` encounter and refuses
 * only `detail: "collision"` — the one resolution that makes «изчакай + a
 * person» a false certificate on the drive's own record. Latest, not any:
 * a later re-released encounter that resolved clean redeems the run, because
 * self-correction is the one thing a drill must never punish. No outcome at
 * all leaves the demand met — an encounter that never happened is unmeasured,
 * and unmeasured must not become a refusal (the `notEncountered` debrief line
 * owns saying «тази ситуация не се случи»).
 *
 * ── …AND A STRUCK PERSON IS NOT „UNMEASURED" (round 10, 2026-08-24) ────────
 *
 * `w10-1/frames/sc-hz-emergency-stop/pc-right/08-debrief-p4.png` and its
 * `_audit-debrief.json`, read together: «✓ Изчакай детето и продължи до края на
 * отсечката 2:24» in a protocol whose ONE fault is «Удар в пешеходец −10
 * изпитни т. ОПАСНА ГРЕШКА», with the card's own citation beside it — „Тази
 * грешка спира самия изпит … при допускане на ПТП" (Наредба № 38, чл. 48,
 * ал. 3). The title is the one this whole demand was written for
 * (`VRU_WAIT_TITLE`'s census names it as the single match in the catalogue),
 * the wiring is live (`LessonPlayShell.tsx:3327` → `applyStagedOutcome` →
 * `ObjectiveContext`), and the certificate was issued anyway.
 *
 * IT IS THE „NO OUTCOME" ARM THAT ISSUED IT. The dart is released only when
 * the player is ~30 m out AND doing at least `minTriggerSpeedKmh` (25 for
 * `SC_HZ_EMERGENCY_STOP_DART`); a drive that never reaches that speed never
 * arms the encounter, so the runner never resolves, `stagedOutcomes` stays
 * empty on this kind, and the loop above falls through to `true` — while the
 * child is standing on the kerb where the car then reaches her. „The encounter
 * did not happen" and „the person was hit before it could" are the same state
 * as far as this loop can see, and they are opposite answers to the question
 * the banner asks.
 *
 * So the CONTACT is consulted as well, and it is a different channel from a
 * different grader: `tick.events` carries `{kind:"collision", withWhat}` on
 * every impact, `rules/engine.ts` bills it per struck body, and the engine
 * folds „did this drive ever strike a person or a cyclist" into the context.
 * Nothing here reads a verdict, a score or a star — only whether a human body
 * was hit, which is a fact about the drive and not an opinion about it.
 *
 * IT CANNOT REFUSE A CORRECT DRIVE, which is the bar every arm in this file is
 * held to: a drive that hits nobody is bit-identical to shipped, and the only
 * drive it refuses is one the same debrief already convicts of the gravest
 * fault the catalogue has. Absent (`undefined`) is „unknown" and keeps the old
 * answer, so every fixture, rig and replay is untouched.
 */
function noContactHonoured(ctx: ObjectiveContext): boolean {
  // `true` is the only refusing value: `undefined` is „the caller cannot
  // answer" (every fixture, rig and replay), and unknown must never become a
  // refusal — the same polarity `struckAPersonInRun` ships with.
  return ctx.struckABodyInRun !== true;
}

/**
 * Was the yield the banner promised billed as a FAILURE inside this
 * objective's own window? (see `ReachZoneWitnessDemands.requireYieldClean` for
 * the drive, the census and why the window exists.)
 *
 * THREE WAYS TO ANSWER „MET", and all three are the same law this file states
 * everywhere else — unknown must never become a refusal:
 *   · no ledger on the context at all (fixture, rig, replay, EMPTY_CONTEXT);
 *   · no window on the context (the caller cannot say when the gate opened);
 *   · a ledger that carries nothing of this demand's kind inside the window.
 *
 * `>=` on the lower bound is deliberate: a failure billed on the very frame the
 * previous objective completed is the barge that ENDED that approach and BEGAN
 * this one, and it belongs to the certificate being issued now. There is no
 * upper bound to test — the engine hands over the ledger as it stands on the
 * frame being stepped, so „so far" is the whole of it.
 */
function yieldCleanHonoured(demand: ReachZoneYieldDemand, ctx: ObjectiveContext): boolean {
  const faults = ctx.yieldFaults;
  if (faults === undefined || faults.length === 0) return true;
  const since = ctx.objectiveActiveSinceSec;
  if (since === undefined) return true;
  const codes = YIELD_DEMAND_CODES[demand];
  for (const f of faults) {
    if (f.tSec >= since && codes.includes(f.code)) return false;
  }
  return true;
}

function vruWaitHonoured(ctx: ObjectiveContext): boolean {
  // A struck person outranks the encounter record in both directions: it
  // refuses a run the dart never armed for, and it refuses one whose LAST dart
  // resolved clean after an earlier body was already hit.
  if (ctx.struckAPersonInRun === true) return false;
  for (let i = ctx.stagedOutcomes.length - 1; i >= 0; i--) {
    const o = ctx.stagedOutcomes[i];
    if (o.kind !== "pedestrianDartOut") continue;
    return o.detail !== "collision";
  }
  return true;
}

/**
 * IS THIS OBJECTIVE UNEARNABLE FOR THE REST OF THE RUN? (2026-08-25.)
 *
 * The one refusal in this file that can never be taken back. Every other arm is
 * a per-frame read that a later frame can answer differently — a cap is met on
 * arrival, a lamp is switched on, a dart re-latches clean — but a struck person
 * is session-monotone by construction, so a `requireVruUntouched` gate that has
 * seen one is closed for good.
 *
 * `lessons/engine.ts` asks, because that permanence is the difference between
 * REFUSING a certificate and STRANDING a drive: when the unearnable gate is the
 * last one in the chain, nothing advances `currentIndex` and the session loses
 * its ordinary ending. The engine's own comment at the finish gate carries the
 * measurement and what it does about it. Nothing here decides an ending — this
 * answers one question about one objective and the caller does the rest.
 *
 * The cast is this suite's own idiom (`reach-zone-witness.test.ts`,
 * `reach-zone-vru-untouched.test.ts`): `parseObjectiveParams` BUILDS a
 * `WitnessedReachZoneParams` and returns it under the narrower union type, so
 * the demands are present at runtime on every parsed reachZone and absent from
 * the compile-time union. Reading it back is what the parse promised.
 */
export function personContactVoidsObjective(
  params: ObjectiveParams,
  struckAPersonInRun: boolean,
): boolean {
  if (!struckAPersonInRun || params.kind !== "reachZone") return false;
  return (params as WitnessedReachZoneParams).requireVruUntouched === true;
}

/**
 * THE SAME QUESTION FOR THE CONTACT TERM, and it is asked for the same reason:
 * a `requireNoContact` gate that has seen a billed collision is closed for the
 * rest of the run, so when it is the LAST objective in the chain nothing
 * advances `currentIndex` and the drive loses its ordinary ending.
 *
 * ONE REFUSAL, NEVER A TRAP — the law the block above states and the reason
 * `lessons/engine.ts` folds both of these into one `terminalUnearnable`. The
 * certificate is still withheld (`buildLessonResult` reports
 * finished-and-failed on an objective left `active`); only the strand goes, so
 * a student who struck the obstacle can still reach the debrief that explains
 * the fault instead of having to quit and forfeit the attempt.
 *
 * Kept separate from `personContactVoidsObjective` rather than merged into one
 * three-argument predicate: the two demands read two different facts and a
 * caller that knows only one of them must be able to ask only that one.
 */
export function contactVoidsObjective(
  params: ObjectiveParams,
  struckABodyInRun: boolean,
): boolean {
  if (!struckABodyInRun || params.kind !== "reachZone") return false;
  return (params as WitnessedReachZoneParams).requireNoContact === true;
}

/**
 * …AND THE SAME QUESTION FOR THE RAISED ARM, which is the one where it is not
 * optional: `sc-rxg-finish` and `sc-rxd-finish` are both the LAST objective of
 * their drill, so without this the student who drove under the boom would reach
 * the protocol that teaches him чл. 52 only by quitting — forfeiting the
 * attempt's XP and its calibration for having been shown the fault the lesson
 * exists to show him.
 *
 * The certificate is still refused (the objective stays `active` and
 * `buildLessonResult` reports finished-and-failed). Only the strand goes.
 */
export function railBarredVoidsObjective(
  params: ObjectiveParams,
  enteredRailBarredInRun: boolean,
): boolean {
  if (!enteredRailBarredInRun || params.kind !== "reachZone") return false;
  return (params as WitnessedReachZoneParams).requireRailClear === true;
}

/**
 * …AND THE SAME QUESTION FOR THE YIELD, WHICH IS THE ONE THAT WOULD OTHERWISE
 * HAVE SHIPPED A NEW DEFECT WITH THE FIX.
 *
 * `requireYieldClean` is monotone WITHIN its window — the ledger only appends,
 * and the window's lower bound is a completed predecessor's timestamp, which
 * cannot move — so once the failure is billed the gate is shut for the rest of
 * the run. BOTH the drives this demand was written for put that gate LAST:
 * `sc-sflash-cross` is 2 of 2 and `sc-sdead-cross` is 2 of 2. Without this arm
 * the chain would never advance, `currentIndex` would never reach
 * `objectives.length`, the run-out would never arm — and a student who failed
 * to give way could reach the −10 «Непропускане на пътно превозно средство с
 * предимство» card that teaches him чл. 47/48/50 only by quitting, forfeiting
 * the attempt's XP and its calibration. That is the exact trap
 * `personContactVoidsObjective` was written to avoid, one demand later; a
 * repair that removes a false certificate by creating a drive that cannot end
 * has not repaired anything.
 *
 * ONE REFUSAL, NEVER A TRAP: the objective keeps its honest `active` status and
 * `buildLessonResult` still reports finished-and-failed, so the certificate is
 * withheld and only the strand goes.
 *
 * Takes the two context fields rather than a boolean because the answer depends
 * on WHICH yield the banner claimed and WHEN the gate opened, and only the
 * evaluator that owns `YIELD_DEMAND_CODES` should be deciding either.
 */
export function yieldFailedVoidsObjective(
  params: ObjectiveParams,
  ctx: Pick<ObjectiveContext, "yieldFaults" | "objectiveActiveSinceSec">,
): boolean {
  if (params.kind !== "reachZone") return false;
  const demand = (params as WitnessedReachZoneParams).requireYieldClean;
  if (demand === undefined) return false;
  return !yieldCleanHonoured(demand, { ...EMPTY_CONTEXT, ...ctx });
}

/**
 * …AND THE SAME QUESTION FOR «СПРИ ПРЕД ЧОВЕКА», asked BEFORE it was needed
 * rather than after.
 *
 * NO CENSUS MEMBER IS TERMINAL TODAY — `sc-hzes-stop` is 2 of 3, `sc-pnu-halt`
 * is 2 of 3 and `sc-mfp-walk-yield` is the first of its chain — so `engine.ts`'s
 * `!onTerminal` arm already lets a refused drive reach its protocol and this
 * predicate is inert at HEAD. It is written anyway, and that is the lesson
 * `yieldFailedVoidsObjective` records in its own title: both gates IT covers
 * happened to be last, and a repair that removes a false certificate by
 * creating a drive that cannot end has not repaired anything. A template that
 * moves this claim onto its final rung must not be able to re-open that trap
 * silently.
 *
 * Kept separate from `personContactVoidsObjective` rather than merged, on the
 * same rule as their four neighbours: the two demands are two different claims
 * about the same fact, and a gate carrying one must not be answered for by the
 * other.
 */
export function personHaltVoidsObjective(
  params: ObjectiveParams,
  struckAPersonInRun: boolean,
): boolean {
  if (!struckAPersonInRun || params.kind !== "reachZone") return false;
  return (params as WitnessedReachZoneParams).requireHaltForVru === true;
}

/** Which half of the arrival contract's STATE demand is being refused. */
export type ReachZoneStateRefusal =
  | { kind: "lamps"; demand: ReachZoneLampDemand }
  | { kind: "gear" };

/**
 * WHY THE STATE HALF OF THE ARRIVAL CONTRACT IS REFUSING ON THIS FRAME — the
 * read `lessons/engine.ts objectiveNotice` needs to say so out loud, and the
 * reason it did not exist until now (round 12, 2026-08-27).
 *
 * WHAT WAS BROKEN, and it is a THEO-4 hole rather than a grading one. The lamp
 * and gear demands shipped on 2026-08-19 (`ReachZoneWitnessDemands`) and are
 * derived from the banner, so 29 shipped gates acquired one without anybody
 * authoring a key — `objectiveNotice`'s own census names them: sc-acn-lit ×5,
 * sc-acr-lit ×4, sc-ahl-follow ×5, sc-acf-adapted ×5, sc-acs-approach ×5,
 * sc-pbe-out ×5. Every one of those gates ALSO carries a cap, and the ONE card
 * this evaluator can raise is the cap card, gated on `overCapNoted` — which
 * latches only when `speedKmh > cap`.
 *
 * So the drive those 29 gates exist to teach — arriving LAWFULLY, at or under
 * the cap, with the switch still unmoved — was refused its certificate and told
 * NOTHING. Not by this file, and not by the rule engine either: the demand's own
 * docblock records `HEADLIGHTS_OFF_AT_NIGHT` firing zero times on the same
 * drive, which is the silence that left five green ticks standing for a year.
 * `sc-ac-night-lights/pc-right/04-t116s.png` is the frame the demand was cut
 * from; the repair stopped the false ✓ and put nothing in its place, so on the
 * lesson whose entire subject is reaching for that switch the student now gets
 * a task that simply never ticks. Doc 64 THEO-4 forbids exactly that: «no bare
 * correct/wrong verdicts anywhere, ever».
 *
 * IT GRADES NOTHING. This is a pure read of the same two demands
 * `stepReachZone` already evaluates, called by the notice composer and by
 * nothing else; no term of `done`, `capMet` or any latch consults it, so no
 * drive changes verdict. A caller that cannot answer (a hand-built tick with no
 * `headlights`) is handled by `lampDemandMet`'s own „unknown is OFF" rule,
 * which is the polarity the demand is authored under — and such a caller has no
 * HUD to raise a card on anyway.
 *
 * THE GEAR ARM REPORTS ONLY THE FORWARD CASE, deliberately. `gearOk` is
 * „IN REVERSE AND MOVING", so a car standing still in R fails it — and a
 * reverse manoeuvre legitimately pauses. Announcing «стигна на преден ход» to a
 * student who is stopped mid-shunt with the lever already on R would be a false
 * statement about the cockpit, and a false card is worse than a missing one.
 * The pause resolves itself the moment he moves; the forward arrival does not.
 */
export function reachZoneStateRefusal(
  params: ObjectiveParams,
  tick: SimTick,
): ReachZoneStateRefusal | null {
  if (params.kind !== "reachZone") return null;
  const p = params as WitnessedReachZoneParams;
  if (p.requireLamps !== undefined && !lampDemandMet(p.requireLamps, tick)) {
    return { kind: "lamps", demand: p.requireLamps };
  }
  if (p.requireGear !== undefined && tick.gear >= 0) return { kind: "gear" };
  return null;
}

/**
 * Default centring tolerance at rest, m — the authored CENTRING bar, and since
 * sweep 161 no longer the whole acceptance. See `PARK_CAR_HALF_LENGTH_M` for
 * the shape it is now composed with and for the measured reason.
 */
export const PARK_CENTER_TOL_M = 0.5;
/** Default max |heading − bay axis| at rest, degrees. */
export const PARK_HEADING_TOL_DEG = 10;
/** Reverse-gear credit for the park accrues only within this radius of the bay, m. */
export const PARK_MANEUVER_ZONE_M = 15;

/**
 * A BAY IS A RECTANGLE AND SO IS THE CAR — sweep 161, 2026-08-18. The ego
 * footprint's half-extents in metres, along and across.
 *
 * PINNED BY VALUE from `vehicle/tuning.ts` CHASSIS_HALF_EXTENTS (z = 2.02
 * along, x = 0.85 across) — the rapier collider every cabin session actually
 * drives, i.e. a 4.04 × 1.70 m compact. Copied rather than imported for the
 * same reason the templates copy their district geometry (the L7 copy law):
 * this evaluator is a pure function of a tick and stays free of the driveline.
 * `objectives.test.ts` asserts the copy against tuning, so it cannot drift.
 *
 * WHAT WAS BROKEN. `stepParkInBay` accepted on ONE number — the Euclidean
 * distance from the car centre to the bay centre, against `centerTolM`. A disc
 * cannot describe a rectangle, and the shipped bays are not square: measured
 * across all 85 compiled parking rungs in the catalogue, what is left of a bay
 * once this car is squarely inside it is
 *
 *     bay (l × w)   drills                                depth   across
 *     6.5 × 2.5     sc-park-gap-long                     ±1.23    ±0.40
 *     5.5 × 2.5     sc-park-zebra · -night · -parallel   ±0.73    ±0.40
 *     5.0 × 2.7     eleven drills, incl. -left · -wall   ±0.48    ±0.50
 *     5.0 × 2.5     sc-park-narrow                       ±0.48    ±0.40
 *     4.5 × 2.5     sc-park-gap-short                    ±0.23    ±0.40
 *     4.2 × 2.5     sc-park-judge                        ±0.08    ±0.40
 *
 * against an authored `centerTolM` of 0.5 at L3–L5, widened by the aid ladder
 * to 0.63 at L2 and 0.75 at L1. So the one number was simultaneously
 *
 *  · TOO TIGHT IN DEPTH. On sc-park-zebra a car reversed fully home — square,
 *    entirely between the lines, 0.73 m back of centre, which is the pose an
 *    instructor asks for so the nose does not overhang the aisle — is 46 % over
 *    a 0.5 m disc. It is refused, and `alignment` calls it „sloppy". On
 *    sc-park-gap-long the legitimate span is 2.46 m of a 6.5 m gap and the disc
 *    admits the middle metre of it.
 *  · TOO LOOSE ACROSS. On every 2.5 m bay the disc reaches 0.5 m sideways where
 *    the paint allows 0.40 — and at L1 „Пълна помощ", the rung every sweep-161
 *    leg was driven at, it reaches 0.75, putting a third of a metre of the car
 *    inside the neighbouring bay with a green tick on «паркирай в мястото».
 *
 * THE FIX IS ONE TRUE STATEMENT SPLIT ONTO THE TWO AXES, and the asymmetry is
 * the point — the two over-runs do not cost the same thing:
 *
 *  · ACROSS, `min(centerTolM, widthSlack)`: over the line sideways is INTO THE
 *    NEIGHBOUR. Nothing may credit it, and the aid ladder may not widen past
 *    the paint — the same ruling FR-24 made when the L1 ladder widened a
 *    stop-line disc 9.72 m into the junction. This half only ever REFUSES.
 *  · IN DEPTH, `max(centerTolM, depthSlack)`: over-run there costs aisle, not a
 *    neighbour, and under-run is simply parked further back. A car whose
 *    footprint is inside the painted bay has performed «паркирай в гнездото»,
 *    so it is credited — while `alignment` keeps grading the centring, so the
 *    polish this gives up is reported rather than lost (a fully-home park reads
 *    „acceptable", not „centered").
 *
 * THE SLACKS ARE COMPUTED SQUARE, not at the car's actual yaw, and that is
 * deliberate. Folding the yaw in is more exact — at 15° this car sweeps 2.69 m
 * across, so a 2.5 m bay has NEGATIVE room — but it would make the aid ladder's
 * own `headingTolDeg` of 15 unreachable on every 2.5 m bay and turn a beginner
 * rung into a refusal machine. The residual it leaves (a park at the tolerance
 * yaw AND at the tolerance offset is marginally over the line) is the authored
 * ladder's choice, and `headingTolDeg` is what grades it.
 */
export const PARK_CAR_HALF_LENGTH_M = 2.02;
/** @see PARK_CAR_HALF_LENGTH_M — the across half-extent of the same footprint. */
export const PARK_CAR_HALF_WIDTH_M = 0.85;

/**
 * B21-RB (2026-08-11) — how far round the island an EXTINGUISHED right
 * indicator still counts as the exit signal, DEGREES of arc about the ring
 * centre.
 *
 * WHY DEGREES AND NOT SECONDS. The first cut of this fix used seconds (5, the
 * rule engine's `indicatorLookbackSec`), and seconds cannot do the job — not
 * at any value. Measured over 64 drives of the real Rapier car through the
 * real CabinControls, on all four shipped ring geometries, at 12/15/18/22 km/h
 * and in both input styles, the interval from the stalk's last lit frame to
 * the exitRadiusM crossing was:
 *
 *      textbook signal (just after the exit BEFORE mine)   1.53 – 13.57 s
 *      flicked once at the ring entrance and forgotten    10.20 – 33.70 s
 *
 * The two populations OVERLAP over 10.2–13.6 s, so every threshold either
 * fails a correct slow driver or credits a silent one. In degrees of arc the
 * same 64 drives separate completely:
 *
 *      textbook signal                                      1.1 – 87.7°
 *      flicked at the entrance and forgotten              152.1 – 231.4°
 *
 * — a 64° dead band, and 120 sits in the middle of it (+32° over the worst
 * honest drive, −32° under the cheapest cheat). The reason is structural, not
 * lucky: seconds measure how SLOWLY the student drove, degrees measure how far
 * past his signal he has travelled, and only the second one is the thing the
 * drivers waiting at the mouths actually see. It is also why a lawful HALT
 * cannot expire the credit — sc-rb-ped-exit makes the student stop between the
 * ring and the zebra and wait the pedestrian out, and a stationary car sweeps
 * no arc at all, while it burns seconds by the dozen.
 *
 * 120° is also the rule as it is taught: signal after the exit BEFORE yours.
 * On a four-arm ring that is one 90° span plus slack; on district-v1's six-arm
 * ring it is two. Signalling two exits early is not a stricter kind of correct
 * — it tells the drivers at the intervening mouth that you are coming out at
 * theirs, which is the RB-06 fault the sibling template exists to teach.
 */
export const ROUNDABOUT_EXIT_SIGNAL_ARC_DEG = 120;

/**
 * 2026-08-17 — how much of the island a car must actually have gone AROUND
 * before leaving counts as «Премини през кръговото», in net degrees of arc
 * swept while inside `enterRadiusM`.
 *
 * THE HOLE THIS FILLS, on the FIXED code (the reverse-gear guard below closed
 * only the half that needed a deliberate R selection). A car rolls up to the
 * give-way line — d = 25 against an `enterRadiusM` of 26 — decides against the
 * roundabout, and turns RIGHT down the near side road with its right stalk lit,
 * because that turn genuinely needs the stalk. It drives away FORWARDS, crosses
 * `exitRadiusM`, and collects «✓ Премини през кръговото и излез с десен мигач».
 * Nothing was faked: `entered` latches at d ≤ enterRadiusM, and enterRadiusM is
 * authored 6–11 m OUTSIDE the circulatory carriageway on every shipped ring, so
 * „entered the roundabout" was satisfied by APPROACHING one. This is the same
 * residual the gear fix named and left open — „the objective still measures no
 * ARC" — now measured and closed.
 *
 * WHY ARC AND NOT DEPTH, which is the tempting one-liner. „He must get closer
 * than some fraction of enterRadiusM" cannot be authored safely: on rb-2lane
 * the OUTER ring lane rides 28.5 m against enterRadiusM 33 (0.86 of it) while
 * the false pass above sits at 0.96 — no threshold fits between a correct
 * two-lane traversal and a car at the give-way line on every geometry at once,
 * and getting it wrong costs a green tick for correct driving, which is the
 * failure the founder ranks worst. Arc has no such conflict: going round the
 * island is what the objective's own title promises, and it is the one thing
 * the turn-away never does.
 *
 * MEASURED on the shipped geometry, not reasoned — every path below is walked
 * off the registered polylines (district-v1 rb-1) or off the generated rings'
 * own radii and lane offsets, sampled at 0.2 m:
 *
 *   LEGITIMATE, the SHORTEST passage each ring allows (first exit):
 *     district-v1 r19.83 · enter 26 · mouths 290°→351°      78.3 – 99.1°
 *     rb-mini     r18    · enter 24 · arm lane 4.06              70.5°
 *     rb-ped      r18    · enter 29 · arm lane 4.06              73.8°
 *     rb-2lane    r26    · enter 33 · outer / inner lane   71.6 / 83.9°
 *
 *   THE TURN-AWAY, same four rings, junction at the give-way line, 8 m
 *   right-hander, the side road leading away as a side road does:
 *     district-v1 41.2° · rb-mini 45.7° · rb-ped 37.8° · rb-2lane 33.8°
 *   and pessimistically, the same turn taken tight enough to CUT across the
 *   circulatory carriageway on its way out (minD 15–26 m): 35.2 – 59.0°.
 *
 * 45° is deliberately NOT the midpoint. It sits 36 % under the worst honest
 * traversal and only just over the pessimistic turn-away, because the two
 * errors are not equal: refusing a correct drive is the one the founder is
 * angriest about, so the slack is spent on that side. What stays admissible is
 * named rather than hidden — a car that carves through the carriageway itself
 * on a wide right-hander sweeps 45–59° and can still be credited. That drive
 * really was on the ring; it is a lane fault, and lane faults are the rule
 * engine's to grade, not this latch's.
 *
 * NET, not gross, degrees: a car shuffling at the give-way line, or a stationary
 * one whose position jitters, cancels itself out; only rotation ABOUT the island
 * survives. Direction is not required — |net| is compared — so a wrong-way ring
 * (its own violation, graded elsewhere) is not silently re-punished here.
 */
export const ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG = 45;

/**
 * SMOOTH STOP — the window the deceleration is measured over, SECONDS
 * (2026-08-16; the rule engine's audit M-18 fix, finally applied to this file).
 *
 * WHAT WAS BROKEN. `stepSmoothStop` differentiated speed between CONSECUTIVE
 * FRAMES, and the frames it is fed are RENDER frames: `onTick` runs inside
 * `useFrame` (LessonScene), and `tick.speedKmh` is the raw Rapier `linvel`
 * projected on the body's forward axis (VehicleSim) — unsmoothed, and the
 * projection swings as the chassis pitches, which is exactly what a braking
 * car does. At 120 fps a frame lasts ~8 ms, so the repo's own measured
 * driveline wobble of 0.06 km/h differentiates to ~2.1 m/s² of pure noise —
 * and the evaluator keeps the PEAK over hundreds of frames, so it collects the
 * worst sample of the whole stop, not a typical one.
 *
 * Measured on a constant 2.5 m/s² stop against the shipped 3.5 cap, 20 trials
 * per cell, wobble amplitude in km/h (one deterministic seed of the same shape
 * is pinned in lost-credit-objectives.test.ts, which fails on the old code):
 *
 *      tick rate    0        0.03      0.06      0.12
 *      20 Hz     20/20     20/20     20/20      2/20
 *      60 Hz     20/20     20/20      0/20      0/20
 *     120 Hz     20/20      0/20      0/20      0/20
 *
 * The whole trace suite is KINEMATIC (recorder.ts computes speed analytically
 * ⇒ wobble exactly 0), which is why every gate was green while only the live
 * car failed. And the failure is worse than „not credited": a rejected attempt
 * disarms, so the student must accelerate back over the approach speed and try
 * again at the same odds — on `l1-smooth-stop`, lesson one, objective two.
 *
 * THE FIX is the rule engine's, one file over: anchor the derivative on a
 * sample at least a WINDOW old instead of on the previous frame, and never let
 * the denominator fall below the window. Noise then divides by 0.5 s instead of
 * by 8 ms — 2 × 0.12 km/h of wobble becomes 0.13 m/s², under a seventh of the
 * 1.0 m/s² headroom the cap leaves a textbook stop — while a real slam is
 * untouched: 0.5 s is a fifth of the ~2.5 s a genuine emergency stop from
 * 40 km/h takes, so every window inside the slam reads the slam's own rate.
 *
 * 0.5 s and not the engine's `accelWindowSec` (0.04): that window feeds gates
 * with a 7 m/s² threshold and no peak-hold, this one has 1 m/s² of headroom and
 * keeps the maximum over the whole attempt, where the extreme value — not the
 * typical one — is what decides.
 *
 * At the 1 Hz trace/replay rate the span already exceeds the window on every
 * frame, so recorded drives differentiate EXACTLY as before (the objectives
 * suite is unchanged, harsh stops included).
 */
export const SMOOTH_STOP_DECEL_WINDOW_SEC = 0.5;

/**
 * How far BEHIND a passSignal node a stop still counts as „waiting at its red",
 * metres, measured both from the node and from the stop line the tick reports
 * ahead (2026-08-16 — the queue arm of signature 2 in stepPassSignal).
 *
 * 60 m is the queue the radius cannot see. The shipped templates author 40–50 m
 * node radii, which covers the first six or seven cars; a Sofia light routinely
 * holds twice that, and the student who joins the tail is the one being asked to
 * do it right. Past 60 m of a line he is not queueing at this junction — he is
 * somewhere else on the street — and the bound stays tight enough that the
 * neighbouring junction's red can never certify this one.
 */
export const PASS_SIGNAL_QUEUE_REACH_M = 60;

/** Default max |final heading − (start + 180°)| for a three-point turn, deg. */
export const TURN_TOLERANCE_DEG = 20;
/** Default continuous seconds at rest (facing back, in the corridor) to finish a turn. */
export const TURN_HOLD_SEC = 0.6;

/**
 * Reaction grade bands on StagedEventOutcome.reactionTimeSec (A10; the
 * measurement itself is the orchestrator's — we only band it, no new
 * scoring): < 0.8 s отличен · < 1.2 s добър · else бавен.
 */
export const REACTION_BAND_EXCELLENT_MAX_S = 0.8;
export const REACTION_BAND_GOOD_MAX_S = 1.2;

export const REACTION_BAND_LABELS_BG: Record<ReactionBand, string> = {
  otlichen: "отличен",
  dobur: "добър",
  baven: "бавен",
};

function reactionBand(reactionTimeSec: number | undefined): ReactionBand | null {
  if (reactionTimeSec === undefined || !Number.isFinite(reactionTimeSec)) return null;
  if (reactionTimeSec < REACTION_BAND_EXCELLENT_MAX_S) return "otlichen";
  if (reactionTimeSec < REACTION_BAND_GOOD_MAX_S) return "dobur";
  return "baven";
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Closest distance from (px, py) to the segment a→b — the swept arrival test. */
function segmentDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-12) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * vx + (py - ay) * vy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

/**
 * Advance the ACTIVE objective by one tick. Pure — returns fresh eval state.
 * `ctx` carries the session-level facts (staged outcomes, reds tally); the
 * engine always supplies it, standalone callers may omit it.
 */
export function stepObjective(
  params: ObjectiveParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext = EMPTY_CONTEXT,
): ObjectiveStepResult {
  switch (params.kind) {
    case "reachZone":
      return stepReachZone(params, prev, tick, ctx);

    case "passSignal":
      return stepPassSignal(params, prev, tick, ctx);

    case "driveDistance": {
      if (prev.type !== "driveDistance") return { done: false, progress: 0, evalState: prev };
      let accumulated = prev.accumulatedM;
      if (prev.prevPos !== null) {
        const d = dist(tick.position.x, tick.position.y, prev.prevPos.x, prev.prevPos.y);
        if (d < TELEPORT_JUMP_M) accumulated += d;
      }
      const done = accumulated >= params.meters;
      return {
        done,
        progress: Math.min(1, accumulated / params.meters),
        evalState: {
          type: "driveDistance",
          accumulatedM: accumulated,
          prevPos: { x: tick.position.x, y: tick.position.y },
        },
      };
    }

    case "completeManeuver":
      switch (params.maneuver) {
        case "smoothStop":
          return stepSmoothStop(params.minApproachKmh, params.maxDecelMs2, prev, tick);
        case "emergencyStop":
          return stepEmergencyStop(params.stagedEventId, prev, ctx);
        case "parkInBay":
          return stepParkInBay(params, prev, tick);
        case "roundabout":
          return stepRoundabout(
            params.x,
            params.y,
            params.enterRadiusM,
            params.exitRadiusM,
            prev,
            tick,
          );
        case "threePointTurn":
          return stepThreePointTurn(params, prev, tick);
      }
  }
}

/**
 * Reach a waypoint (B4/B5-hardened, 2026-07-30) — two INDEPENDENT latches
 * instead of one same-frame conjunction:
 *
 *   reached — the car was inside the authored radius, OR (on a zone whose cap
 *             is a genuine stop demand) came to a FULL STOP inside the
 *             approach capsule. Monotonic. The second arm is what lets a
 *             student stop SHORT of a halt mark with the better sightline and
 *             still be credited: the drill is „stop here", and stopping four
 *             metres earlier is stopping here, done better.
 *   capMet  — the arrival speed cap was honoured inside the authored radius or
 *             on the approach to it, AND not thrown away again before arriving
 *             (REACH_ZONE_CAP_SLACK_KMH — the one place this latch can fall
 *             back, and the sweep-161 fix). Uncapped zones start met (see
 *             createEvalState), so an uncapped waypoint is bit-identical to
 *             the pre-B4 evaluator: done exactly when the car is inside the
 *             authored radius, at any speed, on any frame.
 *
 * The grace is not a ring but a CAPSULE: the authored circle stretched back
 * down the approach and not one centimetre sideways (see REACH_ZONE_GRACE_M
 * for why, and for the four counter-proof drills that would otherwise have
 * been taught backwards). Inside the AUTHORED radius nothing changes at all —
 * that acceptance is the template's own and is untouched.
 *
 * `overCapNoted` latches the first frame the car is genuinely AT the mark and
 * still over the cap. The engine turns that transition into one explaining
 * card (THEO-4): the founder's «I am stopping on top of the green circle and
 * nothing happens» was never a tolerance problem — it was an invisible speed
 * contract, and the silence is the part that has to go.
 */
function stepReachZone(
  params: WitnessedReachZoneParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  const st: Extract<ObjectiveEvalState, { type: "reachZone" }> =
    prev.type === "reachZone"
      ? prev
      : {
          type: "reachZone",
          reached: false,
          capMet: !hasArrivalDemand(params),
          overCapNoted: false,
          approachFrom: null,
          prevPos: null,
          everOutside: false,
        };

  const d = dist(tick.position.x, tick.position.y, params.x, params.y);
  const speedKmh = Math.abs(tick.speedKmh); // reverse reads negative
  const inZone = d <= params.radiusM;
  // A WAYPOINT IS CROSSED, NOT SAMPLED (2026-08-16 — the block comment of the
  // same name in the constants section above). The disc is additionally tested
  // against the SEGMENT the car covered since the previous tick, because at the
  // frame rates this product actually runs at the whole disc fits between two
  // consecutive samples.
  //
  // POSITION IS SWEPT; SPEED IS NOT. This flag feeds the ARRIVAL latch only.
  // A segment says where the car went, and nothing at all about how fast it was
  // at each point of it, so letting it satisfy the speed cap would credit „I
  // slowed down at the mark" to a car that slid through the mark at 30 and came
  // to rest five metres past it — the B5 counter-proof, which is a shipped
  // regression test one screen down and stays red under any looser reading.
  const sweptZone =
    inZone ||
    (st.prevPos !== null &&
      dist(st.prevPos.x, st.prevPos.y, tick.position.x, tick.position.y) < TELEPORT_JUMP_M &&
      segmentDist(
        params.x,
        params.y,
        st.prevPos.x,
        st.prevPos.y,
        tick.position.x,
        tick.position.y,
      ) <= params.radiusM);
  const cap = params.maxSpeedKmh;
  // B18/FR-24: a `stopBeforeMark` zone needs the approach direction too, so
  // its ring arms on proximity alone rather than on carrying a speed cap.
  //
  // ── WHAT ARMING THIS RING CAN AND CANNOT DO, since a wave was spent getting
  //    it wrong in both directions (2026-08-18) ────────────────────────────
  //
  // It arms on „this zone has a speed contract or a paint boundary", and the
  // 2026-08-17 catalogue sweep read that as „carrying a cap WIDENS the zone by
  // REACH_ZONE_GRACE_M" and deleted a cap to close it. It does not, and the
  // arithmetic is worth stating once so nobody deletes another one:
  //
  //   · `reached` — untouched. Its only grace arm is `graceArmed && halted &&
  //     isHaltDemand`, so on a FLOW cap (20, 42, 55, 80 km/h) the arrival is
  //     the authored disc, swept, and nothing else. The capsule cannot let a
  //     car that never entered the disc claim it.
  //   · `capMet`  — this is what the ring is for, and it is B4 by design: „the
  //     cap was honoured inside the authored radius, OR on the approach to it".
  //     `objectives.test.ts` („slowing to the cap on the APPROACH counts") and
  //     the world-referent gate's own `reachZoneProbe` both pin it; narrowing
  //     it to halt demands turns the B4 census from 0 back to 150 scenarios,
  //     which is how this was measured. What the ring does NOT do since sweep
  //     161 is bank that credit against the arrival: honouring the cap while
  //     accelerating through it and then arriving 19 км/ч over spends the
  //     latch again (REACH_ZONE_CAP_SLACK_KMH).
  //
  // So `done = reached && capMet` with a cap is a strict SUBSET of `done`
  // without one: adding a cap can refuse people, and can credit nobody the
  // uncapped zone did not already credit. That monotonicity is the property
  // `objectives.test.ts` now sweeps, rather than restating it here.
  const inGraceRing =
    (cap !== undefined || params.acceptBeforeMarkM !== undefined) &&
    d <= params.radiusM + REACH_ZONE_GRACE_M;

  // Which way the student came from: where he was on the frame before he
  // entered the proximity ring. That direction turns the grace from a CIRCLE
  // into a CAPSULE stretched back down the approach — extra room along the
  // road, none at all across it.
  //
  // The lateral bound is not a detail: it is what keeps this evaluator from
  // contradicting the B3 rescue next door. finish.ts treats a car standing one
  // lane over (8.13 m) at the end of the route as STUCK and lets it out with
  // the objective marked undone. A circular grace on a radius-6 waypoint would
  // have reached 11 m and called that same car ARRIVED. Stopping short of a
  // mark on the same line is stopping there, done earlier; stopping in a
  // different lane is a different place, and both halves of the module have to
  // say so with one voice.
  //
  // RE-LATCHED ON EVERY FRESH APPROACH (2026-08-16). The axis used to be frozen
  // on FIRST contact and never revised, so a student who touched the ring badly
  // — came in off the line, or clipped it while still cornering — then backed
  // off and re-approached properly down the road was judged with a capsule
  // built for the attempt he ABANDONED: `lateral` measured across the wrong
  // axis, and on an `acceptBeforeMarkM` waypoint `along` too, so a stop
  // genuinely short of the paint could read as past it. Self-correction is the
  // one thing a drill must never punish.
  //
  // The re-latch fires on the RING ENTRY EDGE (outside last frame, inside this
  // one) and reads the same thing the first latch read — the previous frame's
  // position, outside the ring. Everything between entries is byte-identical to
  // shipped: the axis is frozen for the whole time the car is near the mark,
  // which is what makes the grace a capsule instead of a circle.
  //
  // IT MAY NOT TURN AROUND, and that guard is the whole safety of the change:
  // the re-latch is refused when the fresh direction opposes the latched one
  // (dot ≤ 0). Without it, a car that overshot the paint, left the ring and came
  // back the other way would have „short of the mark" redefined to the far side
  // of the line, and B18/FR-24 („I have to stop BEFORE the line not after it")
  // would hand credit for the exact stop it exists to refuse. Under 90° the
  // acceptance half-plane can only rotate toward the honest approach; it can
  // never flip.
  const here = { x: tick.position.x, y: tick.position.y };
  const prevInGraceRing =
    st.prevPos !== null &&
    dist(st.prevPos.x, st.prevPos.y, params.x, params.y) <= params.radiusM + REACH_ZONE_GRACE_M;
  let approachFrom = st.approachFrom;
  // A FRESH APPROACH IS THE ONE WAY BACK, and it is exactly the edge the axis
  // re-latches on — the same event, the same direction guard, so the two can
  // never disagree about whether the student is „coming at it again". Consumed
  // by `approachBlown` below; the axis itself is unchanged.
  let freshApproach = false;
  if (inGraceRing && !prevInGraceRing) {
    const entryFrom = st.prevPos ?? here;
    if (approachFrom === null) {
      approachFrom = entryFrom;
      freshApproach = true;
    } else {
      const oldX = params.x - approachFrom.x;
      const oldY = params.y - approachFrom.y;
      const newX = params.x - entryFrom.x;
      const newY = params.y - entryFrom.y;
      if (oldX * newX + oldY * newY > 0) {
        approachFrom = entryFrom;
        freshApproach = true;
      }
    }
  }
  let inApproachGrace = false;
  let beyondMark = false;
  // AT OR PAST THE MARK ON THE STUDENT'S OWN APPROACH AXIS — the one thing
  // `beyondMark` cannot say, because that flag exists only for waypoints that
  // declared a paint boundary. Null when the axis is unknown (no ring entry
  // yet, or an entry latched on top of the mark itself), and null is read as
  // „still approaching" everywhere below: an unknown must never become a
  // refusal. Consumed by `approachBlown`.
  let alongMark: number | null = null;
  if (approachFrom !== null) {
    const ax = params.x - approachFrom.x;
    const ay = params.y - approachFrom.y;
    const m = Math.hypot(ax, ay);
    if (m >= 1e-6) {
      const ux = ax / m;
      const uy = ay / m;
      const rx = tick.position.x - params.x;
      const ry = tick.position.y - params.y;
      const along = rx * ux + ry * uy; // + = beyond the mark
      alongMark = along;
      const lateral = Math.abs(rx * uy - ry * ux); // across the approach
      // B18/FR-24 — where the ACCEPTANCE ends, on this same axis and sign
      // convention. `acceptBeforeMarkM` is the SIGNED offset from the paint to
      // the authored mark, so credit stops at the LINE instead of at the mark:
      //   + (mark inside the junction) pulls the boundary BACK off the paint;
      //   − (paint ahead of the mark)  pushes it FORWARD onto the paint.
      // Both are the same sentence — „the acceptance ends at the line" — and
      // the arithmetic below needs no branch to say it. Opt-in: absent ⇒ the
      // boundary is the mark itself ⇒ every other waypoint in the library
      // evaluates bit-identically.
      const bound = params.acceptBeforeMarkM;
      const cut = bound ?? 0;
      // The grace capsule shares the boundary — it is „extra room BEHIND the
      // acceptance", and behind now begins at the paint. Without this the cut
      // leaks: a car that barges the mouth at 40 and settles to a legal speed
      // one metre past the bars is standing inside the capsule, which would
      // hand it the speed half of the task it just failed. The capsule KEEPS
      // its length (radius + grace) and slides so its far end is the paint —
      // so a negative cut buys forgiveness ahead of the mark without inventing
      // any extra room behind it.
      inApproachGrace =
        lateral <= params.radiusM &&
        along <= -cut &&
        along >= -(cut + params.radiusM + REACH_ZONE_GRACE_M);
      // Only a waypoint that DECLARED a paint boundary refuses the far side.
      // Everywhere else `inZone` is the whole acceptance, exactly as shipped —
      // a plain reachZone is a place you get to, from any direction.
      beyondMark = bound !== undefined && along > -bound;
    }
  }
  const halted = speedKmh <= STOPPED_SPEED_KMH;
  const isHaltDemand = cap !== undefined && cap <= REACH_ZONE_HALT_CAP_KMH;

  // A conceded arrival needs an arrival to concede (doc 87 B3/B10/B11). The
  // grace capsule exists so that stopping four metres SHORT of a halt mark
  // still counts as stopping there — it was never meant to credit a student
  // who was parked inside it before the objective opened and never moved.
  // Two exit drills shipped exactly that: sc-park-parallel-exit spawns 3.20 m
  // from its own 2.85 m halt gate and sc-park-bay-exit-rev 5.04 m from its
  // 3.75 m one, so „ЗАДАЧА 1/2" ticked itself off at t = 0, at rest, and the
  // student performed one task out of the two the banner promised him.
  // `everOutside` latches the moment the car is seen beyond the grace ring,
  // so a real approach behaves exactly as before and a standing start does
  // not. The AUTHORED radius is untouched: a zone the template really does
  // draw around the spawn still completes on presence, as it always did.
  const everOutside = st.everOutside || !inGraceRing;
  const graceArmed = everOutside && inApproachGrace;

  // B18/FR-24 („I have to stop BEFORE the line not after it"). The circle is
  // cut at the mark along the approach: `inZone` alone no longer credits a car
  // that has crossed the paint. The grace capsule is unaffected — it was
  // already approach-side only (`along <= 0`) — so a student who stops SHORT
  // of the line keeps every metre of forgiveness he had, at every rung, while
  // one who rolls past it is simply not credited with having stopped at it.
  const inAcceptance = inZone && !beyondMark;
  // The swept face of the same acceptance — the ARRIVAL half only. `beyondMark`
  // still reads the tick's own position, so a car that sweeps a stop-line
  // waypoint and ENDS past the paint is refused exactly as it was.
  const sweptAcceptance = sweptZone && !beyondMark;
  const reached = st.reached || sweptAcceptance || (graceArmed && halted && isHaltDemand);
  // THE APPROACH SIDE OF THE MARK — the acceptance disc plus the capsule
  // stretched back down the approach, and NOT one metre of the far side. A cap
  // named «приближи … с готовност за спиране» is a promise about getting there;
  // once the mark is behind the car the drill has been performed and the drive
  // away from it is the rule engine's to grade, not this latch's. (In practice
  // the far side is unreachable here anyway — crossing the disc sets `reached`,
  // and the engine never re-steps a completed objective — but the geometry is
  // stated rather than relied upon.)
  const onApproachSide = inAcceptance || inApproachGrace;
  // A cap honoured and then thrown away before arrival is not honoured. See
  // REACH_ZONE_CAP_SLACK_KMH for the five drills that banked one during their
  // acceleration run and arrived 11–19 км/ч over it with a green tick.
  //
  // ── …AND THE ARRIVAL FRAME IS ONE OF THE FRAMES THAT SPENDS IT ────────────
  // (round 11, 2026-08-26 — see `approachBlown` below for the measurement.)
  //
  // `onApproachSide` is a POINT test against the tick's own position, and the
  // arrival is a SEGMENT test („A WAYPOINT IS CROSSED, NOT SAMPLED"). So the
  // two halves of one contract were measured against different objects, and at
  // the tick rate this product actually runs at the gap between them is the
  // whole capsule: at 58 км/ч one 0.5 s tick covers 8 m against a 15 m capsule,
  // and above ~110 км/ч a single tick clears the capsule entirely. A car that
  // banks the cap from below on the way up and then JUMPS the mark had no frame
  // in which it was both on the approach side and over the cap, so nothing ever
  // spent the latch — probe C of `reach-zone-blown-approach.test.ts`: one sample
  // at 28 in the ring, the next at 58 nineteen metres past a mark capped at 30,
  // green tick. Reading the spend off the swept face too costs nothing and
  // refuses nobody who did not go through the mark over the cap.
  const overCapNow = cap !== undefined && speedKmh > cap + REACH_ZONE_CAP_SLACK_KMH;
  const capSpent = overCapNow && (onApproachSide || sweptAcceptance);

  // ── THE STATE HALF OF THE ARRIVAL CONTRACT (2026-08-19) ──────────────────
  // See `ReachZoneWitnessDemands` above for the five drills and the frame.
  //
  // WITNESSED ON THE SWEPT FACE, WHICH THE SPEED HALF IS NOT, and the asymmetry
  // is the same one „A WAYPOINT IS CROSSED, NOT SAMPLED" states: a SEGMENT says
  // where the car went and nothing about how fast it was at each point of it,
  // so speed may only ever be read at the tick's own position. Lamps and gear
  // are not integrated over the segment — they are DISCRETE latched cockpit
  // states, and the tick that swept the disc carries the state the car held
  // while sweeping it. Reading them off the swept face is what keeps a
  // low-frame-rate device from refusing a correct drive that no sample landed
  // inside (71 of the catalogue's 1,720 reachZone gates are narrower than one
  // 50 км/ч tick), and refusing a correct drive is the failure the founder
  // ranks worst.
  const lampDemand = params.requireLamps;
  const gearDemand = params.requireGear;
  const atMark = sweptAcceptance || graceArmed;
  const lampOk = lampDemand === undefined || lampDemandMet(lampDemand, tick);
  // Signed on purpose: `speedKmh` above is the ABSOLUTE speed (the C1 fix —
  // a reversing car read as at-rest and a park was credited before it stopped),
  // so the direction has to come from the selector the student actually moved
  // (A1: `contractGear` reports R only when R was engaged). „Went through
  // backwards" therefore means IN REVERSE AND MOVING — a car standing in R has
  // not yet done anything, and a car rolling back in D is not reversing.
  const reversing = tick.gear < 0 && speedKmh > STOPPED_SPEED_KMH;
  const goingForward = tick.gear >= 0 && speedKmh > STOPPED_SPEED_KMH;
  const gearOk = gearDemand === undefined || reversing;
  // EARNED WIDE, SPENT NARROW — the same direction the whole file spends its
  // slack in. The gear latch is spent only by actually TRAVELLING FORWARD
  // through the authored disc (not by a standstill, not by a shunt out in the
  // grace capsule), because a reverse manoeuvre legitimately pauses and a
  // pause must never withdraw a credit already performed.
  const lampSpent = lampDemand !== undefined && atMark && !lampOk;
  const gearSpent = gearDemand !== undefined && inAcceptance && goingForward;

  // ── THE JOURNEY HALF: the officer's permission (see requireControllerProceed)
  // Read ANYWHERE on the way to the mark rather than at it, because that is
  // where the stop line is. `parseControllerDemand` refuses to let this share a
  // zone with the three at-mark demands, so the single-frame conjunction below
  // stays honest: on such a zone the other three arms are vacuous and this one
  // alone decides.
  const controllerDemand = params.requireControllerProceed === true;
  const controllerHere = controllerDemand ? controllerVerdictHere(tick) : null;
  const controllerSpent = controllerHere === "halt";

  // ── THE APPROACH THAT WAS ALREADY THROWN AWAY (round 11, 2026-08-26) ──────
  //
  // WHAT WAS BROKEN, and it is the last hole in the sweep-161 cap contract.
  // `capMet` may be re-earned on ANY later frame the car is at the mark at or
  // under the cap — the anti-trap rule, written for a student who arrives a
  // shade fast and brakes while still on the mark. Nothing in it asked whether
  // the car was still APPROACHING. So the certificate could also be collected
  // by a car that had already gone THROUGH the mark at twice the cap and then
  // slowed, rolled back, or simply came to rest inside the disc.
  //
  // MEASURED THROUGH THIS EVALUATOR, not inferred — `reach-zone-blown-approach
  // .test.ts` replays the four shapes and the shipped code credits three of
  // them. The sweep frames each drill was filed on read the same way, taking
  // the leg's own `run.log` speed samples against the gate the template
  // authors:
  //
  //   drill / gate                   cap  at the mark  ✓ printed at  run top
  //   sc-ac-highbeam-lead/sc-ahl-follow 45   ~59         0:37         59
  //   sc-crossing-bus-shadow/sc-bsh-appr 30   ~58        0:33         58
  //   sc-crossing-white-cane/sc-wcn-appr 40   ~50        0:29         59
  //   sc-hazard-obstacle/sc-obs-approach 46   ~57        0:32         59
  //
  // Every one of those ticks lands SECONDS AFTER the car crossed the gate — in
  // each case the leg's own samples put it far over the cap when it went
  // through and far under it when the tick printed. `sc-crossing-bus-shadow/
  // pc-wrong` is the whole class in one protocol: «✓ Приближи камиона и
  // пътеката с готовност за спиране 0:33» directly above «Грешки (6)», with
  // «Твърде бързо приближаване към пешеходна пътека −10 изпитни т. ОПАСНА
  // ГРЕШКА» and «Удар в пешеходец» inside it, on a drive whose own machine
  // summary reads „top 58 км/ч · 0 full stops". The student who floors it past
  // the crossing is handed the certificate for approaching it ready to stop.
  //
  // THE BAND IS THE ONE ALREADY THERE. „Blown" is not „over the cap" — it is
  // over `cap + REACH_ZONE_CAP_SLACK_KMH`, the same 5 км/ч the spend above
  // uses and the same number the rule engine grades speeding with. So the
  // population this refuses is EXACTLY the population `capSpent` already
  // refuses; the change is only that the refusal now sticks for the rest of
  // that approach instead of being erased by the next slow frame. B4 (brake to
  // the cap on the approach, coast a shade above it through the mark) and B5
  // (stop SHORT of a halt mark) are untouched — neither is ever more than the
  // slack over its cap, and the halt drills sit at 0 км/ч.
  //
  // AND IT CANNOT TRAP ANYONE, which is the half checked before the half that
  // refuses: `freshApproach` clears it on the same ring-entry edge, with the
  // same direction guard, that re-latches the approach axis. A student who
  // overshoots, backs off down the road and comes at the mark again gets a
  // clean slate — the escape hatch this file has always documented — while a
  // car that drifts back in from the FAR side does not, because that is not an
  // approach (B18/FR-24, the same dot ≤ 0 test).
  //
  // ONLY THE CAP ARM. The lamp, gear and officer arms keep their own „lighting
  // up at the mark earns it on the next frame" rescue verbatim: a cockpit state
  // is switched at a moment, and a moment cannot be blown on the way in.
  //
  // AND ONLY A FLOW CAP, WHICH IS NOT A DETAIL — it is the whole difference
  // between „be here already slowed" and „come to rest here", and getting it
  // wrong breaks 166 correct drives. MEASURED, not reasoned: the first cut of
  // this arm armed on every cap, and the bot-completion suites went from 0
  // failures to 166 in one run. `sc-acs-mark` is the shape — «Спри точно на
  // маркираната позиция», radius 4, cap 6 — where ARRIVING IN MOTION IS THE
  // ACT: the shadow reaches it at ~22 км/ч and brakes to a standstill on the
  // mark, so „over the cap at the disc" is true of every correct drive that
  // ever completed it. `REACH_ZONE_HALT_CAP_KMH` already draws exactly this
  // line for the grace capsule's standstill arm, and it draws it here for the
  // same reason.
  //
  // AND „BLOWN" MEANS THROUGH THE MARK, NOT NEAR IT. Braking hard while still
  // SHORT of the mark — even inside the disc — is the approach being saved, and
  // saving it is what the coach card asks for in so many words («Намали СЕГА,
  // докато си върху точката»); that re-earn is `approach-cap-contract.test.ts`'s
  // „is not a trap" row and it stays green. What cannot be taken back is a mark
  // the car has already gone PAST at speed: there is no approach left to
  // perform, and every one of the four filed drills is that shape. `alongMark`
  // is null while the axis is unknown, and unknown counts as still approaching.
  //
  // AND ONLY ON AN APPROACH THAT NEVER HONOURED THE CAP AT ALL. A car that
  // arrived legally and lost the speed afterwards has performed the approach
  // the banner names; what it then did on top of the mark is `capSpent`'s to
  // withdraw and its to win back — the rescue the 29 gates carrying a lamp or
  // gear demand beside their cap depend on, since their whole mistake lane is
  // „entered under the cap with the switch still off"
  // (`objective-notice-shown-cap.test.ts`'s sc-ac-fog row is that drive).
  //
  // WHICH IS WHY THE STATE IS `approachCap` AND NOT `capMet`. `capMet` is the
  // WHOLE arrival contract — cap AND lamps AND gear AND the officer — so on
  // those 29 gates it is false on a car whose cap discipline was perfect. The
  // cap needed a word of its own, and `honoured` is it. The two values are
  // mutually exclusive per frame (≤ cap versus > cap + slack), so they share
  // one field.
  const capArmHere = cap !== undefined && speedKmh <= cap && (inAcceptance || graceArmed);
  const pastMark = alongMark !== null && alongMark >= 0;
  const isFlowCap = cap !== undefined && cap > REACH_ZONE_HALT_CAP_KMH;
  const carried = freshApproach ? undefined : st.approachCap;
  const blownHere =
    isFlowCap && overCapNow && pastMark && (inAcceptance || sweptAcceptance);
  const approachCap: "honoured" | "blown" | undefined =
    carried === "honoured" || (carried === undefined && capArmHere)
      ? "honoured"
      : carried === "blown" || blownHere
        ? "blown"
        : undefined;
  const approachBlown = approachCap === "blown";

  // ONE LATCH FOR THE WHOLE CONTRACT, because an arrival contract is one thing:
  // the speed, the lamps and the direction are what the banner asks for AT THE
  // MARK, so they are earned together on one frame and any of them thrown away
  // spends the latch. A zone that demands only a cap is bit-identical to
  // shipped (the two state arms collapse to `true`/`false`), which
  // `objectives.test.ts` sweeps.
  //
  // (This comment used to add „and because `ObjectiveEvalState.reachZone`
  // belongs to lessons/types.ts and this lane may not add a field to it". That
  // was a lane boundary, not a design reason, and round 11 held the file that
  // owns it — hence `approachCap`. The one-latch shape stayed anyway: it is
  // the honest one for a contract read on a single frame.)
  const contractEarned =
    (cap === undefined || (!approachBlown && capArmHere)) &&
    (lampDemand === undefined || (lampOk && atMark)) &&
    (gearDemand === undefined || (gearOk && atMark)) &&
    (!controllerDemand || controllerHere === "proceed");
  const capMet = !hasArrivalDemand(params)
    ? true
    : (st.capMet && !(capSpent || lampSpent || gearSpent || controllerSpent)) || contractEarned;
  // ── THE WAITED-FOR PERSON (see `ReachZoneWitnessDemands`) ─────────────────
  // A pure per-frame read of the session's staged-outcome record, OUTSIDE the
  // latch: outcomes only ever append, so „the latest dart resolution is a
  // collision" needs no memory of its own and cannot flicker. On the frame the
  // strike is folded in, `done` goes unreachable and stays so until a later
  // encounter resolves clean; every zone without the demand is bit-identical.
  const vruOk = params.requireVruUntouched !== true || vruWaitHonoured(ctx);
  // ── NOTHING WAS STRUCK ON THE WAY HERE (ReachZoneParams.requireNoContact) ──
  // Same shape and same reasoning as the arm above it: a per-frame read of a
  // session-monotone fact, outside the `capMet` latch, so no eval-state field
  // is needed and nothing can flicker. A zone without the key never consults
  // it and is bit-identical to shipped.
  //
  // THE FINDING THIS CLOSES, in its own words: *„«✓ Задмини обекта и продължи
  // напред 0:43» … the credit is still a bare reachZone arrival with no contact
  // or avoidance term."* `COLLISION` is `terminateSession`, and terminating
  // ends the SHEET rather than the drive — so the car that clipped the stalled
  // vehicle kept rolling the remaining 48 m and collected the tick under a
  // sentence about having got past it. It no longer does.
  const contactOk = params.requireNoContact !== true || noContactHonoured(ctx);
  // ── THE ARM WAS UP WHEN THE CAR WENT OVER THE RAILS (requireRailClear) ─────
  // Third arm of the same shape, and see `railClearHonoured` for the per-frame
  // design this replaced and the drive that killed it. Outside the `capMet`
  // latch because the fact is session-monotone: the entry was adjudicated once,
  // by the grader that owns it, and a later frame cannot un-adjudicate it.
  const railOk = params.requireRailClear !== true || railClearHonoured(ctx);
  // ── THE YIELD THE BANNER SAYS HAPPENED (requireYieldClean) ────────────────
  // Fourth arm of the same shape and the fourth outside the `capMet` latch —
  // but the first bounded by a WINDOW rather than by the whole run, because
  // one drill in the catalogue («…на второто кръстовище») asks for the same
  // act twice and a run-wide read would answer for the wrong junction. See
  // `ReachZoneWitnessDemands.requireYieldClean` for the drive this closes:
  // «✓ Премини правó напред, след като пропуснеш идващия отдясно 1:48» printed
  // five seconds under «✗ Непропускане на пътно превозно средство с
  // предимство −10 изпитни т. в 1:43». A zone whose banner promises no yield
  // never consults this and is bit-identical to shipped.
  const yieldOk =
    params.requireYieldClean === undefined || yieldCleanHonoured(params.requireYieldClean, ctx);
  // ── «СПРИ ПРЕД ЧОВЕКА» (requireHaltForVru) ────────────────────────────────
  // Fifth arm of the same shape and the fifth outside the `capMet` latch. The
  // frame it closes is one beat of one drive: `w13/…/sc-hz-emergency-stop__
  // mobile-right/04-t070s` carries «−10 изпитни т. Удар в пешеходец» and
  // «✓ Спри преди детето — с пълна спирачка, в лентата» on the same screen.
  // A halt disc four metres short of the child could say where the car came to
  // rest and nothing about whether she was still standing; now it can.
  const haltForVruOk = params.requireHaltForVru !== true || haltForVruHonoured(ctx);
  const done = reached && capMet && vruOk && contactOk && railOk && yieldOk && haltForVruOk;
  // „You are ON the mark and still too fast" — the one state the student
  // reads as „nothing happened". Latched so it is said once, not every frame.
  //
  // ── …AND „ON THE MARK" IS THE SWEPT FACE, BECAUSE THE REFUSAL IS ──────────
  // (round 12, 2026-08-27.)
  //
  // WHAT WAS BROKEN. This latch is the ONLY channel in the product that
  // explains a withheld cap certificate — `lessons/engine.ts objectiveNotice`
  // renders «Задачата иска да си тук с не повече от N км/ч …» off exactly this
  // bit, and no rule-engine card covers it (a gate cap is a lesson's demand,
  // not a posted limit, so nothing is billed when it is missed). It was armed
  // on `inAcceptance` — a POINT test against the tick's own position — while
  // every arm that WITHDRAWS the certificate is armed on the swept face too:
  // `capSpent = overCapNow && (onApproachSide || sweptAcceptance)`. The two
  // halves of one contract were measured against different objects, which is
  // the same asymmetry the block at REACH_ZONE_CAP_SLACK_KMH closed for the
  // grader one round earlier — and „A WAYPOINT IS CROSSED, NOT SAMPLED" states
  // the size of the gap in its own census: at PHYSICS_MAX_FRAME_DT = 0.5 s per
  // tick, 71 of the catalogue's 1,720 reachZone gates are narrower than ONE
  // 50 км/ч tick and 167 are narrower than one at 90.
  //
  // WHERE IT BITES, from the shipped catalogue rather than from the general
  // case: `sc-mwms-join` and `sc-mwms-hold` are radius 6 — a 12 m disc — on a
  // motorway rung whose own banner asks for 120–130 км/ч, where one tick
  // covers 18–19.4 m; `sc-hzbp-approach` is radius 12 against a 140 км/ч road
  // (`w12/frames/sc-hz-breakdown-pulloff__pc-wrong/run.log` samples that leg at
  // 145 км/ч for a full minute, i.e. 20.1 m of travel per tick against a 24 m
  // disc). On those gates a sample INSIDE the disc is the exception, so the
  // fast drive — the one this whole contract exists to refuse — was the drive
  // most likely to be refused in SILENCE. That is a bare verdict, and doc 64
  // THEO-4 forbids one anywhere in this product: «no bare correct/wrong
  // verdicts, ever».
  //
  // IT CREDITS AND REFUSES NOBODY. `overCapNoted` is read by one caller and
  // that caller composes a `lesson` HudEvent; it is not a term of `done`, of
  // `capMet` or of any latch. Widening it can only ever ADD an explanation to a
  // drive that was already being refused — the population is unchanged, and
  // `!done` still keeps the card off a drive that was credited.
  //
  // THE TAIL IS THE CALLER'S HALF. On a swept-only frame the car is already
  // PAST the disc, so «Намали СЕГА, докато си върху точката» would be an
  // instruction that cannot work; `objectiveNotice` now picks the corrective
  // from where the car actually is on the frame the card is composed, which is
  // the half of THEO-4 that says never give advice that will not work.
  const overCapNoted =
    st.overCapNoted ||
    (!done && (inAcceptance || sweptAcceptance) && cap !== undefined && speedKmh > cap);

  const evalState: ObjectiveEvalState = {
    type: "reachZone",
    reached,
    capMet,
    overCapNoted,
    approachFrom,
    prevPos: here,
    everOutside,
    ...(approachCap !== undefined ? { approachCap } : {}),
  };
  return {
    done,
    // Half progress once the place is reached but the speed contract is not
    // yet met — the banner stops looking inert while the student slows down.
    progress: done ? 1 : reached ? 0.5 : 0,
    evalState,
  };
}

/**
 * A lamp that FORBIDS entry — the two states a driver has to be let through by
 * someone. Red-yellow rides with red because ППЗДвП treats it as „prepare, do
 * not go"; a регулировчик waving through either one is the чл. 7 case.
 */
function isForbiddingLamp(lightState: string | undefined): boolean {
  return lightState === "red" || lightState === "redYellow";
}

/**
 * Pass a controlled junction (A10-hardened for traffic lights).
 *
 * Base completion: a stopLineCrossed event of the matching control type near
 * the node — running the red still COMPLETES a plain passSignal (progression);
 * the rule engine grades RED_LIGHT_CROSSED separately.
 *
 * requireRedMet gate (L2): the objective additionally demands that the RUN
 * has met at least one red. With `lightState` only observable at the moment
 * of crossing (SimTick contract), a met red has two observable signatures:
 *   1. crossing a FORBIDDING LAMP on a регулировчик's `proceed` — ЗДвП чл. 7,
 *      the officer's signal outranks the светофар, so this is a red the student
 *      MET and handled lawfully. `sc-sig-controller-live` is built on exactly
 *      this and nothing else completes it;
 *   2. a full stop on the current APPROACH — inside the zone, or (2026-08-16)
 *      at the back of the queue with the tick reporting a red/red-yellow light
 *      ahead — followed by a crossing on green: the signature of waiting a red
 *      out. (A student who voluntarily stops at a green inside the zone matches
 *      it too; with the crossing-time-only sensor that stop-verify-proceed
 *      behavior is the closest honest proxy, and it is exactly the drilled
 *      sequence.)
 * Reds met by EARLIER passSignal objectives count via ctx.redsMetInRun.
 * Feasibility: runtime SIGNAL_TIMING gives every light red 26 s of every
 * 50 s cycle, so a student who crossed on green can always re-approach, stop
 * at the line, and meet a red within ≤ 24 s — the gate can never deadlock.
 *
 * ── THE OBJECTIVE THAT CREDITED ITSELF AGAINST ITS OWN FAULT ────────────────
 * Reproduced on staging on BOTH platforms, `sc-signal-response` L1:
 * «✓ Изчакай червения сигнал и премини на зелено — Изчака червения сигнал и
 * потегли на зелено» printed in THE SAME SECOND as «Преминаване на червен
 * сигнал −10 изпитни т.».
 *
 * Signature 1 used to read „crossing ON red, met the hard way" — the lamp
 * alone, with nothing asked about PERMISSION. One crossing on red therefore set
 * `crossed` AND `redMet` on the same tick, so `done` was true on the exact
 * frame the rule engine billed the опасна. Worse than a silent tick: the
 * debrief detail line is rendered from `redMetHere` (SessionEndScreen) and it
 * SAYS, in words, „Изчака червения сигнал и потегли на зелено" — a sentence
 * about an act that did not happen, printed beside the fault proving it did
 * not. An objective that can be satisfied by the act it exists to forbid
 * teaches that act.
 *
 * The repair is the one word that was missing, and only that word: a red DRIVEN
 * THROUGH is not a red met; a red an officer WAVED YOU THROUGH is. `crossed`
 * still latches on any crossing, so every plain junction, every stop-sign
 * junction and every recorded trace evaluates bit-identically, and the
 * progression/correctness split above is intact — what stops is a GATE
 * certifying itself with the offence it exists to forbid.
 *
 * The retry this leaves the student is the one the gate was designed around and
 * finish.ts already protects (`terminalRescue: params.requireRedMet !== true`,
 * so the drive is not closed underneath him): re-approach, stop at the line,
 * wait the red out, cross on green — feasible inside 24 s, every time.
 *
 * ── AND THE SENTENCE SURVIVED THE REPAIR (2026-08-17) ──────────────────────
 * Narrowing `redMet` fixed the GATE and left the WORDS. `redMetHere` is a
 * boolean, so the debrief still rendered one sentence — the wait — for both
 * surviving signatures, and signature 1 is the one where nothing waits: the
 * `sc-sig-controller-live` bot rolls over a red line at 22 km/h on the
 * officer's wave, and that wave is the template's ONLY completion path. So
 * every successful run of it printed „Изчака червения сигнал и потегли на
 * зелено" about a student who did no such thing — the same false sentence as
 * before, now on a run with no fault beside it to contradict it.
 * `redMetVia` records WHICH signature fired, latched with `redMet` on the
 * frame it first fires, and SessionEndScreen renders the matching account:
 * the wait for signature 2, and for signature 1 the чл. 7 reasoning that makes
 * the crossing lawful. THEO-4 — the student is owed the reasoning, and the
 * reasoning has to be about what he actually did.
 *
 * WHY THE QUEUE ARM EXISTS. Signature 2 used to count a stop only INSIDE the
 * node radius (40–50 m in the shipped templates). A student who joins the back
 * of a queue beyond it, waits the whole red out properly and creeps to the line
 * already rolling never latched `stoppedInZoneVisit`, so `redMet` never fired
 * and the L2 gate stayed open although he handled the red exactly as taught —
 * the queue length decided, not the driving. Outside the circle the arm demands
 * MORE than the inside one, not less: the world must positively report a
 * forbidding light ahead.
 *
 * ── AND THE LAMP WAS NEVER THE SIGNAL WHEN AN OFFICER WAS STANDING THERE ────
 * 2026-08-17, `sc-sig-controller-live` on staging, mobile/right. The bot stopped
 * at the line, waited, and drove off when its lamp went GREEN — while the
 * регулировчик stood chest-on with both arms out, i.e. stopping this direction.
 * The debrief printed, on one screen:
 *   «✓ Премини стоп-линията по разрешение на регулировчика — въпреки червената
 *    лампа 1:27 · Изчака червения сигнал и потегли на зелено»
 *   «✗ Неизпълнение на сигнала на регулировчика −10 изпитни т. ОПАСНА ГРЕШКА»
 * Signature 2 read `e.lightState === "green"` and asked nothing about the
 * officer, so the ONE act this template exists to forbid — the drive that
 * ships as its own `mistake-wait-for-green` demo — satisfied the `requireRedMet`
 * gate whose comment in templates-signals2.ts promises the opposite. Exactly the
 * shape of the sc-signal-response bug two paragraphs up, mirrored: there a red
 * DRIVEN THROUGH certified itself, here a green DRIVEN THROUGH AGAINST THE
 * OFFICER did.
 *
 * The repair is the contract, read as written. `stopLineCrossed.controller` is
 * documented in rules/types.ts as „the EFFECTIVE signal … overrides `lightState`
 * ENTIRELY (ЗДвП чл. 7)": on "halt" the lamp does not exist, whatever colour it
 * is showing, and there is nothing to have waited out. So signature 2 now reads
 * the effective signal instead of the lamp. `controller` is optional by the same
 * contract and ABSENT on every junction without an officer — every plain light,
 * every recorded trace and every hand-built tick evaluates bit-identically.
 *
 * ── AND Б2 IS A STOP, NOT A PLACE YOU DRIVE PAST (2026-08-17) ───────────────
 * The same sweep, three templates, both platforms. `sc-junction-gap` mobile/wrong:
 *   «✓ Премини стоп-линията след пълно спиране и пропуснат интервал 0:23»
 *   «✗ Неспиране на знак Б2 „Спри!" × 7»   (243 наказателни точки, 0 full stops)
 * `sc-junction-left` mobile/wrong repeats it with × 11 and 295 точки;
 * `sc-junction-stop` pc/wrong reaches ЗАДАЧА 3/3 having been convicted × 13.
 *
 * A `control: "stopSign"` objective completed on the CROSSING ALONE, so five of
 * the six shipped Б2 rungs — every one of whose titles contains the words
 * «след пълно спиране» — certified in writing a stop the evaluator never asked
 * for, beside the conviction proving it never happened. That is the exact class
 * `stop-claim-gates.test.ts` guards for reachZone («an objective title is a
 * certificate»); passSignal was outside its reach because it grades events, not
 * geometry — and it is the one evaluator here that CAN witness a stop: the
 * approach-scoped stop memory built for the red-light gate is the same memory.
 *
 * WHY THIS IS NOT A THRESHOLD SOMEBODY PICKED. The demand is the control's own
 * documented meaning, one module over: rules/types.ts on the same event says
 * "stopSign" = Б2 „Стоп" — a full stop at the line is demanded REGARDLESS OF
 * TRAFFIC (ЗДвП чл. 50)", and in the same breath that "giveWay" (Б1) demands
 * none. So the gate is asked of `stopSign` and of nothing else: Б1 keeps its
 * lawful roll, and a trafficLight keeps green = go.
 *
 * WHAT IT COSTS AND WHY THAT IS RIGHT. `crossed` is the completion latch here
 * (a stop sign has no `requireRedMet` half), so gating it means a rolled Б2
 * leaves the objective at 0 % instead of 50 %, and the sequential engine holds
 * the following rungs shut. That is the honest reading of «Премини стоп-линията
 * след пълно спиране»: he did not. He is not left guessing either — the rule
 * engine bills STOP_SIGN_NO_FULL_STOP with its card on the same frame — and he
 * is not trapped: stop anywhere on this approach and cross again and it
 * completes, on any of the shipped rungs, at any rung width.
 *
 * THE RESIDUAL, named rather than hidden: the memory is scoped to the APPROACH,
 * not to the last six seconds, so a stop made early on the approach and gone
 * stale by the rule engine's `stopRecencySec` (6) still certifies here while the
 * engine convicts. That is a narrower disagreement than the one being closed and
 * it needs a stop-TIME in the eval state to fix; `ObjectiveEvalState` lives in
 * lessons/types.ts, another lane's file.
 */
function stepPassSignal(
  params: PassSignalParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  if (prev.type !== "passSignal") return { done: false, progress: 0, evalState: prev };

  const nodeDistM = dist(tick.position.x, tick.position.y, params.x, params.y);
  const inZone = nodeDistM <= params.radiusM;

  const halted = Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH;
  // THE QUEUE THE RADIUS CANNOT SEE (2026-08-16). A stop that
  // certifies this junction's red is a stop made ON THIS APPROACH to it, and
  // the approach is longer than the acceptance circle: the tail of the queue is
  // where a student who arrives late is supposed to be. So the stop memory is
  // scoped to the approach rather than to the zone, and a halt made outside the
  // circle counts only on POSITIVE evidence from the world-context channel —
  // the runtime saying the light he is queued behind is actually forbidding.
  //
  // All three context fields are optional by the SimTick contract, and a tick
  // that cannot answer them leaves this evaluator exactly as shipped: hand-built
  // ticks, recorded traces and every legacy source are byte-identical.
  //
  // The SECOND HALF of the signature is unchanged and is what keeps this from
  // becoming a free pass: the certified red is only spent by a later crossing
  // ON GREEN, i.e. by waiting it out. A student who stops at the red and then
  // creeps over on red+yellow still fails the gate — measured on the shipped
  // `sc-signal-redyellow / mistake-creep` demo, which is exactly that drive.
  const onApproach = nodeDistM <= params.radiusM + PASS_SIGNAL_QUEUE_REACH_M;
  const queuedAtRed =
    !inZone &&
    params.control === "trafficLight" &&
    tick.nextStopLineControl === "trafficLight" &&
    (tick.nextStopLineState === "red" || tick.nextStopLineState === "redYellow") &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= PASS_SIGNAL_QUEUE_REACH_M;
  // The SAME queue, at a Б2. The stop gate below turns this memory into the
  // completion condition for a stop sign, and a gate that could only see the
  // node radius would refuse the student who does it RIGHT behind a queue:
  // tj-emerge-v1's line sits 27.7 m out against a radius of 45, so four cars
  // ahead of him put his own lawful stop outside the circle. Positive evidence
  // only, exactly as at the lamp — the world must report that the line ahead of
  // him is a stop line and that it is within the queue reach. A Б2 carries no
  // state to check (it forbids always), which is why this arm has no analogue of
  // the red/red-yellow test and no lamp can be borrowed to stand in for one.
  const queuedAtStopSign =
    !inZone &&
    params.control === "stopSign" &&
    tick.nextStopLineControl === "stopSign" &&
    tick.nextStopLineM !== undefined &&
    tick.nextStopLineM <= PASS_SIGNAL_QUEUE_REACH_M;
  // Approach-scoped stop memory: leaving the approach forgets the stop, so a
  // halt elsewhere can never certify this junction's red — nor, now, its Б2.
  const stoppedInZoneVisit = onApproach
    ? prev.stoppedInZoneVisit || (halted && (inZone || queuedAtRed || queuedAtStopSign))
    : false;
  let redMet = prev.redMet;
  // WHICH signature certified the red, latched with it. The debrief renders a
  // SENTENCE from this, and the two signatures are opposite acts — see
  // RedMetVia in lessons/types.ts for the run that forced them apart.
  let redMetVia = prev.redMetVia;
  let crossed = prev.crossed;

  if (inZone) {
    for (const e of tick.events) {
      if (e.kind !== "stopLineCrossed" || e.control !== params.control) continue;
      // PROGRESSION IS UNTOUCHED AT A LAMP: crossing the line completes a plain
      // trafficLight passSignal on red exactly as it always has, and the rule
      // engine grades the law separately (the split at the top of this file).
      //
      // AT A Б2 THE STOP IS THE PASS. `crossed` is the whole completion latch
      // for a stop sign, so the demand rides here rather than in a second gate:
      // a line rolled without a stop on this approach is not a crossing of Б2,
      // it is STOP_SIGN_NO_FULL_STOP with the car ending up on the other side.
      // A second crossing after a stop still completes it — the memory is live,
      // not consumed. (`stoppedInZoneVisit` is this tick's value and the engine
      // never re-steps a completed objective, so the certificate cannot be
      // withdrawn afterwards, and a stop made PAST the junction — still inside
      // the 60 m approach reach — cannot retroactively buy a crossing that is
      // already behind the car.)
      if (params.control !== "stopSign" || stoppedInZoneVisit) crossed = true;
      if (params.control === "trafficLight") {
        // A red a регулировчик waved you through IS met: you encountered a
        // forbidding lamp and dealt with it the way чл. 7 says to. This is the
        // whole thesis of sc-sig-controller-live, whose bot crosses red lamps
        // at 22 km/h on the officer's signal and must still complete. NOTHING
        // IN THIS BRANCH WAITED — hence `redMetVia`, so the debrief stops
        // describing it as a wait.
        if (isForbiddingLamp(e.lightState) && e.controller === "proceed") {
          if (!redMet) redMetVia = "controllerProceed";
          redMet = true;
        }
        // …and a red you WAITED OUT is met: stopped on this approach, then
        // away on green. Unchanged since A10 EXCEPT for whose green it is —
        // `controller: "halt"` means the officer is stopping this direction and
        // the lamp is not the signal at all (rules/types.ts: the controller
        // „overrides `lightState` entirely"), so there is no green here to have
        // been released onto and nothing was waited out. Absent controller =
        // every ordinary junction = byte-identical to shipped.
        else if (e.lightState === "green" && e.controller !== "halt" && stoppedInZoneVisit) {
          if (!redMet) redMetVia = "waitedOutGreen";
          redMet = true;
        }
      }
    }
  }

  const redSatisfied = params.requireRedMet !== true || redMet || ctx.redsMetInRun > 0;
  const done = crossed && redSatisfied;

  const evalState: ObjectiveEvalState = {
    type: "passSignal",
    crossed,
    stoppedInZoneVisit,
    redMet,
    redMetVia,
  };
  const detail: ObjectiveDetail = {
    kind: "passSignal",
    redsMetInRun: ctx.redsMetInRun + (redMet && !prev.redMet ? 1 : 0),
    redMetHere: redMet,
    redMetVia,
  };
  // Crossed on lucky greens with the gate unmet: half progress — the banner
  // keeps the objective open until the student meets a red.
  const progress = done ? 1 : crossed ? 0.5 : 0;
  return { done, progress, evalState, detail };
}

/**
 * Smooth stop — completes on a stop whose PEAK deceleration stayed under the
 * authored cap.
 *
 * `prevSpeedKmh` / `prevT` hold the WINDOW ANCHOR, not the previous frame: the
 * oldest sample the current derivative is still measured against, re-taken once
 * it is `SMOOTH_STOP_DECEL_WINDOW_SEC` old. See that constant for the frame-rate
 * measurement that forced it (the field names are the eval-state contract's and
 * live in lessons/types.ts, another lane's file).
 */
function stepSmoothStop(
  minApproachKmh: number,
  maxDecelMs2: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "smoothStop") return { done: false, progress: 0, evalState: prev };

  let { armed, maxDecelMs2: peakDecel } = prev;
  let anchorSpeedKmh = prev.prevSpeedKmh;
  let anchorT = prev.prevT;

  // Track deceleration against the window anchor while an attempt is armed.
  // The denominator never falls below the window, so a span shorter than it
  // (the frames inside one window, and the truncated tail at the standstill)
  // is measured CONSERVATIVELY — noise cannot be amplified, and a real brake
  // application still shows up, scaled by how much of the window it fills.
  if (!armed) {
    // Nothing to measure yet: the anchor rides the live frame so the attempt
    // arms on a fresh sample instead of one banked before the approach.
    anchorSpeedKmh = tick.speedKmh;
    anchorT = tick.t;
  } else if (anchorSpeedKmh !== null && anchorT !== null && tick.t > anchorT) {
    const spanSec = tick.t - anchorT;
    const decel =
      ((anchorSpeedKmh - tick.speedKmh) * KMH_TO_MS) /
      Math.max(spanSec, SMOOTH_STOP_DECEL_WINDOW_SEC);
    if (decel > peakDecel) peakDecel = decel;
    // Re-anchor only once the sample is a full window old — at trace/replay
    // rates that is every frame (identical to the old frame-to-frame delta),
    // at render rates it is every ~30-60th.
    if (spanSec >= SMOOTH_STOP_DECEL_WINDOW_SEC) {
      anchorSpeedKmh = tick.speedKmh;
      anchorT = tick.t;
    }
  }

  if (!armed && tick.speedKmh >= minApproachKmh) {
    armed = true;
    peakDecel = 0;
  }

  let done = false;
  // …AND A SIGNED SPEED IS NOT A SPEED — the same sweep, the same law, the last
  // evaluator in this file that had not been told (2026-08-22).
  //
  // `stepReachZone`, `stepPassSignal`, `stepParkInBay` and `stepThreePointTurn`
  // all fold the sign before asking „is this car at rest" (`Math.abs`), because
  // the driveline reports reverse as a NEGATIVE `speedKmh` — the C1 finding
  // `stepParkInBay`'s own comment sets out at length. `stepSmoothStop` asked
  // `tick.speedKmh <= 1`, which is true of EVERY reversing frame at any speed:
  // −3, −12, −40 all satisfy it.
  //
  // WHAT THAT CREDITS. `l1-smooth-stop` objective 2 and its two siblings in
  // `specs.ts` are «спри плавно» gates armed above 15–20 км/ч. A car that
  // brakes, keeps rolling backwards down the camber and is sampled at −3 км/ч
  // is handed the tick for a STOP IT NEVER MADE — and the window-anchored
  // derivative does not catch it, because from −1.5 to −3.0 km/h over half a
  // second is 0.08 m/s², a fortieth of the 3.5 cap. The student is told the
  // stop was smooth while the car is still moving, in lesson one.
  //
  // IT CANNOT TRAP ANYONE: a car genuinely at rest reads |v| ≤ 1 under either
  // sign convention, and the arming half is deliberately left SIGNED (an
  // approach is a forward approach — a car reversing at 25 км/ч is not
  // beginning a smooth stop). Every hand-built tick, every recorded trace and
  // every forward drive evaluates bit-identically.
  if (armed && Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH) {
    if (peakDecel <= maxDecelMs2) {
      done = true;
    } else {
      // Harsh stop — the attempt failed; accelerate back up and try again.
      armed = false;
      peakDecel = 0;
    }
  }

  return {
    done,
    progress: done ? 1 : armed ? 0.5 : 0,
    evalState: {
      type: "smoothStop",
      armed,
      maxDecelMs2: peakDecel,
      prevSpeedKmh: anchorSpeedKmh,
      prevT: anchorT,
    },
  };
}

/**
 * Emergency stop (A10) — STIMULUS-LOCKED: graded purely from the staged
 * encounter's resolution (StagedEventOutcome via ObjectiveContext). The old
 * speed-only arming is gone — a hard stop with no hazard present proves
 * braking force, not hazard reaction, and trained nothing (audit D4).
 *
 *  - no outcome yet          → pending (the encounter has not resolved)
 *  - success + stoppedInTime → done; reaction time banded for the debrief
 *  - hitLeadCar / passedWithoutStopping / collision → stays failed (the
 *    orchestrator may restage a retry; the LAST outcome for the event wins)
 */
function stepEmergencyStop(
  stagedEventId: string,
  prev: ObjectiveEvalState,
  ctx: ObjectiveContext,
): ObjectiveStepResult {
  if (prev.type !== "emergencyStop") return { done: false, progress: 0, evalState: prev };

  // Last outcome wins — a restaged retry after a failure can still complete.
  let outcome: StagedEventOutcome | null = null;
  for (const o of ctx.stagedOutcomes) {
    if (o.eventId === stagedEventId) outcome = o;
  }

  if (outcome === null) {
    return {
      done: false,
      progress: 0,
      evalState: prev,
      detail: {
        kind: "emergencyStop",
        outcome: "pending",
        reactionTimeSec: null,
        band: null,
        stopGapM: null,
      },
    };
  }

  const done = outcome.success && outcome.detail === "stoppedInTime";
  const detailOutcome =
    outcome.detail === "stoppedInTime" ||
    outcome.detail === "hitLeadCar" ||
    outcome.detail === "passedWithoutStopping" ||
    outcome.detail === "collision"
      ? outcome.detail
      : "pending";
  return {
    done,
    // A resolved-but-failed encounter shows half progress: the stimulus fired
    // and was measured, but the stop was not earned.
    progress: done ? 1 : 0.5,
    evalState: prev,
    detail: {
      kind: "emergencyStop",
      outcome: detailOutcome,
      reactionTimeSec: outcome.reactionTimeSec ?? null,
      band: reactionBand(outcome.reactionTimeSec),
      stopGapM: outcome.stopGapM ?? null,
    },
  };
}

/**
 * Reverse-park (A10) — BAY-LOCKED: completes only when the car is at rest
 * INSIDE the authored bay rect, placed within the bay-shaped tolerance
 * (`centerTolM` composed with the paint on each axis — PARK_CAR_HALF_LENGTH_M
 * has the census and the reason it is not one disc), aligned with
 * the bay axis within `headingTolDeg` (folded to 180° — the rect is
 * symmetric; facing direction is the rule engine's business), with reverse
 * gear used during the current attempt (and within PARK_MANEUVER_ZONE_M of
 * the bay — reverse banked elsewhere does not count) and the stop held
 * `holdSec` seconds. Rolling resets the hold clock; leaving the bay starts a
 * NEW attempt (counted, and reverse must be used again). A stop that is
 * inside the bay but outside tolerance surfaces as alignment "sloppy" and
 * does not complete.
 *
 * S2: `entry: "forward"` swaps the gate — the current attempt's bay ENTRY
 * itself must happen in a forward gear (echelon/45° drills); everything else
 * (bay lock, alignment, hold, attempts) is identical.
 */
function stepParkInBay(
  params: ParkInBayParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "parkInBay") return { done: false, progress: 0, evalState: prev };

  const { bay, holdSec, centerTolM, headingTolDeg } = params;

  // Bay-local frame. headingDeg: 0 = north, clockwise positive (contracts.ts)
  // → axis unit (sin h, cos h), right-hand lateral unit (cos h, −sin h).
  const h = bay.headingDeg * DEG_TO_RAD;
  const axX = Math.sin(h);
  const axY = Math.cos(h);
  const relX = tick.position.x - bay.x;
  const relY = tick.position.y - bay.y;
  const lonM = relX * axX + relY * axY; // along the bay axis
  const latM = relX * axY - relY * axX; // across it (signed, right positive)
  const inBay = Math.abs(lonM) <= bay.lengthM / 2 && Math.abs(latM) <= bay.widthM / 2;

  // Attempts: every outside → inside transition opens a new attempt; leaving
  // the bay revokes the reverse credit — re-entering forward in D after one
  // early reverse must not satisfy the maneuver. Reverse credit accrues only
  // inside the maneuver zone around the bay (a reverse at spawn followed by
  // a forward nose-in was the D4 cheat path).
  const attempts = prev.attempts + (inBay && !prev.inBay ? 1 : 0);
  const exitedBay = prev.inBay && !inBay;
  const nearBay = Math.hypot(relX, relY) <= PARK_MANEUVER_ZONE_M;
  // A GEAR SELECTED IS NOT A MANOEUVRE PERFORMED — sweep 161, 2026-08-22.
  //
  // The reverse credit accrued from `tick.gear < 0` alone, with nothing said
  // about MOTION, so the whole entry gate of «Задача 2: влез НА ЗАДЕН ХОД в
  // алеята и спри напълно» was satisfied by *touching the selector* anywhere
  // inside PARK_MANEUVER_ZONE_M (15 m) of the bay. The drive that follows can
  // then be a plain forward nose-in: `entryOk` reads the latch, not the path,
  // and `done` asks nothing else about direction. That is the D4 cheat path
  // this evaluator's own header says it closed — closed for reverse banked
  // ELSEWHERE (the 15 m zone), still open for reverse banked AT A STANDSTILL.
  //
  // THE LAW IS ALREADY WRITTEN IN THIS FILE, three hundred lines up, for the
  // gate that grades the same act geometrically: „«Went through backwards»
  // therefore means IN REVERSE AND MOVING — a car standing in R has not yet
  // done anything, and a car rolling back in D is not reversing"
  // (`stepReachZone`'s `reversing`). This is that sentence, applied in the
  // evaluator the sentence was about.
  //
  // IT CANNOT TRAP ANYONE, and that is the half checked before the half that
  // refuses: a reverse park MOVES BACKWARDS by definition — every committed
  // shadow of the four depth drills carries 156–186 frames of negative speed —
  // so nothing a correct drive does is withheld. What stops is a certificate
  // for a manoeuvre whose only reverse was the lever.
  //
  // THE RESIDUAL, named rather than hidden: reverse performed while moving
  // anywhere inside the 15 m zone still counts, so a genuine reverse shunt out
  // on the aisle followed by a forward nose-in is credited. Binding the credit
  // to the bay ENTRY itself (the `enteredForward` mould) is the tighter rule
  // and it is the wrong one: a car that backs in, over-runs, and pulls forward
  // ten centimetres to square up has entered FORWARD on its last transition,
  // and refusing that park refuses the correction an instructor asks for.
  const reversingNow = tick.gear < 0 && Math.abs(tick.speedKmh) > STOPPED_SPEED_KMH;
  const usedReverse = (exitedBay ? false : prev.usedReverse) || (reversingNow && nearBay);
  // S2 forward-entry gate: latched on the outside → inside transition (the
  // gear that CARRIED the entry), cleared on exit — a reverse nose-out
  // followed by a forward re-entry re-earns it, symmetric with usedReverse.
  const enteredForward = inBay
    ? prev.inBay
      ? prev.enteredForward
      : tick.gear > 0
    : false;

  // REVERSE READS NEGATIVE, and this is the one evaluator that lives in it.
  // `tick.speedKmh` is signed (the same convention `stepReachZone`,
  // `stepPassSignal` and `stepThreePointTurn` all fold), so an unsigned
  // `speedKmh <= 1` called EVERY REVERSING FRAME „at rest": measured on the
  // committed shadows of the four depth drills, 156 / 167 / 186 / 164 frames
  // per run carry a negative speed down to −3.83 км/ч, and all of them ran the
  // hold clock. The gate whose title is «влез на заден ход и СПРИ НАПЪЛНО»
  // could not see a stop — a car reversing straight through the bay collected
  // it if the crossing happened to take `holdSec`, which at a 3 км/ч creep is
  // 1.25 m of travel and therefore inside the acceptance band of every bay
  // 5.5 m or longer. The bay-shaped tolerance above widens exactly those
  // bands, so this is fixed with it and not after it.
  const stopped = Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH;
  // The hold clock only runs at rest INSIDE the bay.
  const stoppedSinceT = stopped && inBay ? (prev.stoppedSinceT ?? tick.t) : null;
  const heldFor = stoppedSinceT !== null ? tick.t - stoppedSinceT : 0;

  const centerOffsetM = Math.hypot(lonM, latM);
  const headingOffsetDeg = axisAngleDiffDeg(tick.headingDeg, bay.headingDeg);
  // The acceptance is the BAY's shape, not a disc drawn on top of it — the two
  // axes carry different tolerances because the two over-runs cost different
  // things. See PARK_CAR_HALF_LENGTH_M for the 85-rung census this is built on.
  // Across: never past the paint, so the aid ladder can tighten here and never
  // widen. In depth: never less than the paint allows, so a car that is fully
  // home is credited for the park and graded on the centring separately.
  const lonTolM = Math.max(centerTolM, bay.lengthM / 2 - PARK_CAR_HALF_LENGTH_M);
  const latTolM = Math.min(centerTolM, bay.widthM / 2 - PARK_CAR_HALF_WIDTH_M);
  const aligned =
    Math.abs(lonM) <= lonTolM && Math.abs(latM) <= latTolM && headingOffsetDeg <= headingTolDeg;

  // The entry-gear gate: reverse credit (the A10 default) or the S2 forward
  // entry, per the authored param.
  const entryOk = params.entry === "forward" ? enteredForward : usedReverse;

  const done = inBay && stopped && entryOk && aligned && heldFor >= holdSec;

  let alignment: ParkAlignment | null = null;
  if (inBay && stopped) {
    alignment = !aligned
      ? "sloppy"
      : centerOffsetM <= centerTolM * 0.5 && headingOffsetDeg <= headingTolDeg * 0.5
        ? "centered"
        : "acceptable";
  }

  const progress = done
    ? 1
    : inBay
      ? stopped
        ? aligned && entryOk
          ? 0.9 // holding for holdSec
          : 0.7 // stopped in bay, but sloppy or with the wrong entry gear
        : 0.5 // maneuvering inside the bay
      : entryOk
        ? 0.3
        : 0.1;

  return {
    done,
    progress,
    evalState: { type: "parkInBay", usedReverse, enteredForward, stoppedSinceT, inBay, attempts },
    detail: {
      kind: "parkInBay",
      attempts,
      inBay,
      centerOffsetM: inBay ? centerOffsetM : null,
      headingOffsetDeg: inBay ? headingOffsetDeg : null,
      alignment,
    },
  };
}

/** |a − b| in degrees, folded onto the 0..90° axis difference. */
function axisAngleDiffDeg(aDeg: number, bDeg: number): number {
  const raw = Math.abs(((aDeg - bDeg) % 360) + 360) % 360; // 0..360
  const diff = raw > 180 ? 360 - raw : raw; // 0..180
  return diff > 90 ? 180 - diff : diff; // fold to the axis
}

/**
 * Roundabout (A10) — enter the ring, then exit it WITH the right indicator
 * on in the exit window (annulus between enterRadiusM and the exit crossing,
 * after entering — the L3 spec's „излез с десен мигач"). An unsignaled exit
 * RESETS the traversal: the objective stays open and the student re-enters
 * the ring to exit properly, so signaling during the initial approach can
 * never be banked for a later silent exit.
 *
 * B6 (doc 86 §3, 2026-07-30). The reset is kept — it is the only thing that
 * stops „signal on after you are already out" from buying the objective, and
 * the skill this drill exists for is the signal, so it has to be performed
 * rather than banked. What is fixed is that the reset was SILENT and INESCAPABLE:
 *
 *  - silent: nothing on screen said the traversal had been voided or why, so
 *    the drill simply stopped responding. `voidedExits` now counts each one
 *    and the engine turns the increment into an explaining card (THEO-4);
 *  - inescapable: combined with B1 (no finish anchor for a roundabout) there
 *    was no termination path AT ALL — re-enter and redo it, or reload the
 *    browser. finish.ts now anchors the route on LEAVING the ring, with a
 *    twenty-second window so an immediate second attempt still wins the rung
 *    and a student who drives on gets the debrief instead of a dead lesson.
 *
 * B21-RB (2026-08-11, founder: «I turned on the signal when leaving it but, it
 * didnt mark it as signal is on and it popped up an error stating I didnt
 * leave the roundabout with signal»). The annulus above was read as a LEVEL —
 * the stalk had to be lit on some frame with d > enterRadiusM — and the stalk
 * is not a level. scene/cabin.ts auto-cancels like a real car (ARM 0.22 rad →
 * RELEASE 0.05), so the exit turn itself extinguishes it: the student is
 * punished for the indicator behaving like an indicator.
 *
 * MEASURED, not reasoned — fifteen drives of the rb-mini ring through the real
 * Rapier car and the real CabinControls, signalling at φ ≈ 110° (textbook: one
 * exit early), then exiting normally. Where the driver holds the ring until
 * his exit is beside him the wheel comes back to centre at d = 21.9–26.7 m,
 * i.e. INSIDE the sampling boundary, and the objective sees an unlit stalk on
 * every frame it looks at. The credit rate for a CORRECT exit was:
 *   24/34  «Кръгово движение» + sc-rb-exit-signal   12/15
 *   26/45  L3 «Кръгово движение» + the exam bank     9/15
 *   29/34  sc-rb-ped-exit                            6/15
 *   33/46  sc-rb-lane-choice                         5/15
 * — i.e. the verdict was decided by the two metres at which the driver
 * happened to straighten the wheel, which is unlearnable. A student obeying
 * the sibling template's own instruction 5 («изключи го веднага след изхода»)
 * scored 0/15 on three of the four geometries.
 *
 * THE FIX IS ADDITIVE. The annulus arm is untouched, so everything that was
 * credited before is still credited. What is added is the second, honest
 * signature of the same act: the stalk was live ON THE RING and the car has
 * not since driven more than ROUNDABOUT_EXIT_SIGNAL_ARC_DEG of arc away from
 * it. Same treatment register B21 gave the lane-change detector — remember the
 * signal instead of sampling it as a level — in the currency this geometry
 * actually needs.
 *
 * WHY NOT SECONDS (the first cut of this fix, corrected 2026-08-11 by driving
 * it): a 5 s lookback still failed 16 of 32 correct exits, because seconds
 * measure how slowly the student drove. 64 drives of the real car — four
 * geometries × two input styles × 12/15/18/22 km/h × {textbook signal, flick
 * at the entrance} — gave overlapping second-counts (1.53–13.57 vs 10.20–33.70)
 * and cleanly separated degree-counts (1.1–87.7 vs 152.1–231.4). Worst hit was
 * the keyboard driver, whose lane-keeping corrections arm the auto-cancel on
 * the ring itself: his stalk dies at d ≈ 17–21 m, a whole exit before the old
 * window even opens. See ROUNDABOUT_EXIT_SIGNAL_ARC_DEG for the table.
 *
 * WHAT STILL FAILS, and must:
 *  - no signal anywhere in the traversal → void, `voidedExits` counts it, the
 *    explaining card fires. Unchanged, and it is the whole drill;
 *  - a signal given and then driven away from — a stalk that went out more
 *    than 120° of ring ago is gone: the drivers waiting at the mouths you have
 *    since passed never saw it, and the traversal voids as it did before;
 *  - the approach signal is not banked either, and this is the part the
 *    obvious reading of this function gets wrong. `entered` does NOT mean „on
 *    the ring": enterRadiusM is authored 6–11 m OUTSIDE the circulatory
 *    carriageway on every shipped geometry (24 vs r18, 26 vs r19.83, 29 vs
 *    r18, 33 vs r21.94), which is 1–2 s of approach at lesson speed during
 *    which a right stalk lit for the give-way line would latch. Deleting the
 *    radius test outright — the tempting one-line "fix" — banks exactly that
 *    signal for a silent lap. The arc memory is what closes it: measured, that
 *    approach sweeps only 5.4–23.4° before the car joins the ring, so a signal
 *    left over from it is 152°+ stale by the exit of any traversal longer than
 *    one exit — while on a FIRST-exit traversal (73–87°) it is still fresh,
 *    which is right, because there signalling on approach is what you do.
 *
 * AND THE OTHER HALF OF «ПРЕМИНИ ПРЕЗ КРЪГОВОТО» (2026-08-17). Everything above
 * grades the SIGNAL. Nothing graded the PASSAGE: `entered` latches at
 * d ≤ enterRadiusM, and that radius sits 6–11 m outside the carriageway, so a
 * car that only ever reached the give-way line satisfied it. `traversalArcDeg`
 * is the missing measurement — net arc about the island, counted only while
 * inside the entry circle — and leaving without at least
 * ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG of it ABANDONS the attempt (silently, like
 * backing out) instead of completing or voiding it. The two halves are
 * independent on purpose: the signal arm is untouched, so nothing that was
 * credited for signalling correctly on a real traversal loses its tick.
 *
 * …AND IT IS ONLY DEMANDED OF ATTEMPTS THE EVALUATOR ACTUALLY WATCHED. Found by
 * running it, not by reading it: objectives are SEQUENTIAL (engine.ts steps only
 * the current one), and four of the five shipped roundabout drills put a zone ON
 * THE RING immediately before this objective — sc-rb-ped-exit's authored shadow
 * drive begins being graded by this function while STOPPED IN THE POCKET at
 * r = 27.3 of an enterRadiusM of 29, its 164° of island already behind it and
 * invisible. Demanding arc from that car refuses a textbook drive, which is the
 * one failure the founder ranks above every other. So `traversalArcDeg` is NULL
 * until a tick is seen OUTSIDE the entry circle with the attempt not yet
 * latched, and null is „unmeasurable — do not ask": the passage is required only
 * of a car this objective watched approach. Nothing is lost by that, because in
 * every such drill the preceding zone is itself the proof of the traversal.
 */
function stepRoundabout(
  x: number,
  y: number,
  enterRadiusM: number,
  exitRadiusM: number,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "roundabout") return { done: false, progress: 0, evalState: prev };

  const d = dist(tick.position.x, tick.position.y, x, y);
  let entered = prev.entered || d <= enterRadiusM;
  let exitSignaled = prev.exitSignaled;
  let voidedExits = prev.voidedExits;

  // Where the car stands on the ring, as an angle about the island. This is the
  // ONLY extra geometry the fix needs, and the objective already owns it: the
  // centre is (x, y), which is what `d` is measured from.
  const azDeg = (Math.atan2(tick.position.x - x, -(tick.position.y - y)) * 180) / Math.PI;
  let prevAzimuthDeg = prev.prevAzimuthDeg;
  let ringSignalArcDeg = prev.ringSignalArcDeg;
  let traversalArcDeg = prev.traversalArcDeg;
  let insideAzimuthDeg = prev.insideAzimuthDeg;

  // The attempt becomes MEASURABLE the moment this objective sees the car
  // OUT of the roundabout — past `exitRadiusM`, this objective's own definition
  // of „left it" — with nothing latched: from there every metre of the approach
  // is watched, so the passage can be asked for. Until then the counter stays
  // null, because the sequential engine hands this evaluator a car that is
  // already on the ring in four of the five shipped drills, and arc it never
  // saw is not a debt.
  //
  // WHY `exitRadiusM` AND NOT `enterRadiusM`, which is the obvious choice: the
  // arming must not depend on where a zone happens to be satisfied to the
  // metre. sc-rb-ped-exit's pocket zone reaches r = 29.9 against an
  // enterRadiusM of 29, so a student who rolls the last metre and stops AT the
  // zebra instead of mid-pocket would arm the gate on his way OUT of a ring he
  // had already driven — and be refused for it. Against exitRadiusM (34) the
  // whole pocket is inside, the gate stays down for that activation, and the
  // verdict no longer turns on 90 cm. Every shipped rung lands cleanly on one
  // side or the other; roundabout-traversal.test.ts holds the census.
  if (!prev.entered && d >= exitRadiusM) traversalArcDeg ??= 0;

  // How far round the island this attempt has actually travelled, counted ONLY
  // between two consecutive samples that were both inside enterRadiusM, and
  // SIGNED so that shuffling at the line nets nothing. Arc swept outside the
  // circle is not traversal — driving round the OUTSIDE of a roundabout and
  // back into a mouth is not a passage through it, and the ring-signal memory
  // above is the only thing that legitimately spends arc out there.
  if (entered && d <= enterRadiusM) {
    if (insideAzimuthDeg !== null && traversalArcDeg !== null) {
      traversalArcDeg += signedAzimuthDiffDeg(azDeg, insideAzimuthDeg);
    }
    insideAzimuthDeg = azDeg;
  } else {
    insideAzimuthDeg = null;
  }

  if (entered) {
    // Arc swept since the previous tick, in degrees, unsigned — a car that
    // stands still (waiting out a pedestrian on the exit crossing) sweeps
    // none, which is the whole reason this is measured in degrees and not in
    // seconds. No teleport guard is needed here: a respawn puts the car past
    // exitRadiusM, which the branch below already reads as a departure.
    const step = prevAzimuthDeg === null ? 0 : headingDiffDeg(azDeg, prevAzimuthDeg);
    prevAzimuthDeg = azDeg;

    // The stalk seen ON the ring. Every lit frame RESETS the arc, so what the
    // counter holds is how far round the island the car has travelled since the
    // signal went out — by the student's hand or by the car's own auto-cancel,
    // which the objective cannot and should not tell apart.
    if (d <= enterRadiusM && tick.indicator === "right") ringSignalArcDeg = 0;
    else if (ringSignalArcDeg !== null) ringSignalArcDeg += step;
  }

  // Exit window: only ticks AFTER entering, outward of the ring radius. Two
  // signatures of the one act — the stalk still lit out here (as shipped), or
  // a ring-side signal the car has not yet driven away from (B21-RB).
  if (entered && d > enterRadiusM) {
    if (tick.indicator === "right") {
      exitSignaled = true;
    } else if (
      ringSignalArcDeg !== null &&
      ringSignalArcDeg <= ROUNDABOUT_EXIT_SIGNAL_ARC_DEG
    ) {
      exitSignaled = true;
    }
  }

  // NOBODY LEAVES A ROUNDABOUT BACKWARDS — 2026-08-16, measured on staging.
  //
  // Driving `sc-roundabout-entry` L1 to find out why the founder's exit went
  // uncredited produced the opposite result, and it is worse: the credit is
  // reachable WITHOUT A TRAVERSAL. Logged off the live session, azimuth about
  // the island in the same convention this function uses:
  //
  //     d 27.56  az  8.5°  banner bar   0 %   (approaching, not entered)
  //     d 17.85  az 13.1°  bar  50 %          right stalk flicked HERE
  //     d 23.86  az 10.8°  bar  50 %          reversing back out the same mouth
  //     d 29.85  az  9.1°  bar  75 %          exitSignaled — arc arm, 37 s later
  //     d ≥ 34            «✓ Премини през кръговото и излез с десен мигач»
  //
  // Four degrees of arc. The car entered the south mouth, stopped, and reversed
  // straight back out of the south mouth, and the objective whose title
  // promises a PASSAGE ticked. The latches only ever asked „was I inside 24 m,
  // am I now outside 34 m, was the stalk lit somewhere between". (The same run
  // is the live proof that the B21-RB arc memory works: the stalk had been out
  // for 37 s — every seconds-based lookback would have expired — and 4° of arc
  // carried it, exactly as the degrees-not-seconds table above predicts.)
  //
  // The gear is the half of that this evaluator can honestly close on its own,
  // and it is a true statement about the world rather than a threshold: an exit
  // is a departure, and a car in reverse is not departing — it is UNDOING its
  // entry. So backing out past `exitRadiusM` ABANDONS the attempt: the latches
  // clear and the student must enter again, exactly as after a void — but it is
  // not counted as one and says nothing, because „Излезе от кръговото без десен
  // мигач" aimed at a student who never left, with his stalk lit, is a worse
  // lie than silence.
  //
  // Clearing rather than merely refusing is the whole of it. A guard that only
  // withheld `done` on the reversing tick would leave `entered` and the signal
  // memory standing, so the same bench drive would collect the tick on its
  // first forward frame out at d = 47 — the cheat moved one frame later, not
  // closed.
  //
  // WHAT THIS DID NOT CLOSE, and what closed it (2026-08-17). The gear guard
  // left the whole family of forward non-traversals standing — nosing into the
  // mouth, turning round inside it, driving out; or simply reaching the
  // give-way line, thinking better of it and turning off down the side road —
  // because the objective measured no ARC. That is the accumulator below, now
  // that the eval state carries one.
  const leavingForward = tick.gear >= 0;
  // …AND NOBODY PASSES THROUGH A ROUNDABOUT WITHOUT GOING ROUND ONE — the
  // residual the paragraph above named and scheduled, now measured and closed.
  // See ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG for the drive that got the tick
  // without a traversal and for both populations of arc it was chosen between.
  const traversed =
    traversalArcDeg === null ||
    Math.abs(traversalArcDeg) >= ROUNDABOUT_MIN_TRAVERSAL_ARC_DEG;

  let done = false;
  if (entered && d >= exitRadiusM) {
    if (!leavingForward || !traversed) {
      // Backed out of the mouth, or never went round at all: not an exit, not a
      // void — an abandoned attempt. SILENT for the same reason the reversing
      // case is silent: „Излезе от кръговото без десен мигач" aimed at a student
      // who turned off before the ring, stalk lit for the turn he did make, is
      // a worse lie than saying nothing. He is told by the bar dropping back to
      // 0 %, and the objective stays open for the roundabout he has not driven.
      entered = false;
      exitSignaled = false;
      ringSignalArcDeg = null;
      prevAzimuthDeg = null;
      traversalArcDeg = null;
      insideAzimuthDeg = null;
    } else if (exitSignaled) {
      done = true;
    } else {
      // Left the roundabout without the exit signal — traversal void, redo.
      // Counted, so the student is TOLD rather than left guessing. The reset
      // of `entered` also stops this branch from re-firing every frame while
      // the car drives away: one departure, one count. The ring-signal memory
      // clears with it, so a stale signal from the voided lap cannot bank into
      // the next one.
      voidedExits += 1;
      entered = false;
      exitSignaled = false;
      ringSignalArcDeg = null;
      prevAzimuthDeg = null;
      traversalArcDeg = null;
      insideAzimuthDeg = null;
    }
  }

  return {
    done,
    progress: done ? 1 : entered ? (exitSignaled ? 0.75 : 0.5) : 0,
    evalState: {
      type: "roundabout",
      entered,
      exitSignaled,
      ringSignalArcDeg,
      prevAzimuthDeg,
      traversalArcDeg,
      insideAzimuthDeg,
      voidedExits,
    },
    detail: { kind: "roundabout", entered, exitSignaled },
  };
}

/**
 * SIGNED shortest angle from `bDeg` to `aDeg`, −180..180. The traversal
 * integrator needs the sign that `headingDiffDeg` throws away: unsigned steps
 * rectify noise, so a car creeping back and forth at the give-way line would
 * accumulate arc it never travelled, and the one thing this counter must not do
 * is manufacture a passage out of shuffling. Between consecutive samples of a
 * real drive the step is far under 180°, so the shortest-way reading is the
 * true one.
 */
function signedAzimuthDiffDeg(aDeg: number, bDeg: number): number {
  const raw = (((aDeg - bDeg) % 360) + 360) % 360; // 0..360
  return raw > 180 ? raw - 360 : raw; // −180..180
}

/** Absolute DIRECTED angle difference, folded to 0..180° (NOT the 0..90° axis
 *  fold — a U-turn must face BACK, not merely along the axis). */
function headingDiffDeg(aDeg: number, bDeg: number): number {
  const raw = (((aDeg - bDeg) % 360) + 360) % 360; // 0..360
  return raw > 180 ? 360 - raw : raw; // 0..180
}

/**
 * Three-point turn / обратен завой (Наредба-38; ЗДвП чл. 38) — CORRIDOR-LOCKED,
 * the parkInBay mold. Completes when the car has REVERSED its travel direction
 * (final heading within `toleranceDeg` of `startHeadingDeg + 180`), at rest
 * INSIDE the corridor rect, held `holdSec` continuous seconds. Rolling or
 * leaving the corridor resets the hold clock. Economy: the evaluator counts
 * direction-change shunts (forward↔reverse) once the corridor is entered and
 * reports `movements = reversals + 1` in the detail (a clean turn is 3);
 * curb/obstacle contact grades COLLISION through the obstacle-rect machinery,
 * separately. No hard reverse requirement — the narrow corridor + curbs make the
 * reverse physically necessary; a wide one-arc U-turn is a 1-movement completion.
 * The count is reported only once the facing has actually come back (sweep 161 —
 * see the comment on `movements` below for the two drills that scored 2 / 2 т.
 * «чиста маневра» for entering the box and standing there).
 */
function stepThreePointTurn(
  params: ThreePointTurnParams,
  prev: ObjectiveEvalState,
  tick: SimTick,
): ObjectiveStepResult {
  if (prev.type !== "threePointTurn") return { done: false, progress: 0, evalState: prev };

  const { corridor, startHeadingDeg, toleranceDeg, holdSec } = params;

  // Corridor-local frame — axis along the start heading (parkInBay convention).
  const h = startHeadingDeg * DEG_TO_RAD;
  const axX = Math.sin(h);
  const axY = Math.cos(h);
  const relX = tick.position.x - corridor.x;
  const relY = tick.position.y - corridor.y;
  const lonM = relX * axX + relY * axY; // along the corridor length (start heading)
  const latM = relX * axY - relY * axX; // across it
  const inCorridor =
    Math.abs(lonM) <= corridor.halfLengthM && Math.abs(latM) <= corridor.halfWidthM;

  const entered = prev.entered || inCorridor;

  // Shunt counting: a genuine direction reversal (forward↔reverse) while moving,
  // inside the corridor. A stop does not change direction — only a sign flip is
  // a shunt, so accel/decel ramps never inflate the count.
  //
  // A MANOEUVRE EVALUATOR MEASURES THE ATTEMPT, NOT THE SESSION — sweep 161,
  // 2026-08-22, and it is the third face of the same law as the two fixes
  // above: this file states a rule for one evaluator and does not apply it in
  // the sibling that grades the same kind of act.
  //
  // WHAT WAS BROKEN. The count was gated on `entered`, which is MONOTONIC —
  // once the car has touched the corridor it is true for the rest of the
  // session — so every forward↔reverse flip anywhere in the district, for the
  // remaining minutes of the lesson, kept incrementing it. Two consequences,
  // and the second is a false conviction of a correct manoeuvre:
  //
  //  · a student who enters the box, thinks better of it, drives out, comes
  //    back and executes a textbook three-movement turn is reported with every
  //    shunt of the abandoned attempt still on the sheet. rubric.ts prices the
  //    economy row off exactly this number (`turn.movements`, then
  //    `<= attemptsFor3Stars`, which is 1 on both U-turn drills) and
  //    SessionEndScreen prints it as the objective's evidence line, so the
  //    clean retry is graded as the mess that preceded it;
  //  · and the same drift runs the other way for anything the car does on the
  //    road AFTER the turn — a reverse out of a parking bay two hundred metres
  //    later is one more „движение" of a manoeuvre that finished long ago.
  //
  // `stepParkInBay` has had the right law since A10 — „leaving the bay starts a
  // NEW attempt (counted, and reverse must be used again)". The corridor is the
  // turn's bay; this is that law, in the turn.
  //
  // IT CANNOT REFUSE ANYBODY: `done` never reads `reversals`, so this changes
  // only the NUMBER the debrief prints, and it only ever moves it toward the
  // truth of the attempt being graded. The leniency it admits is named — a car
  // whose CENTRE leaves the box mid-turn restarts its count — and the boxes are
  // 16–30 m across against a 4 m car, so leaving one is a departure rather than
  // a wobble.
  const stopped = Math.abs(tick.speedKmh) <= STOPPED_SPEED_KMH;
  const movingDir = stopped ? 0 : tick.gear < 0 ? -1 : 1;
  let lastDir = inCorridor ? prev.lastDir : 0;
  let reversals = inCorridor ? prev.reversals : 0;
  if (inCorridor && movingDir !== 0) {
    if (lastDir !== 0 && movingDir !== lastDir) reversals += 1;
    lastDir = movingDir;
  }

  // Heading reversal: within tolerance of the start heading turned 180°.
  const headingToTargetDeg = headingDiffDeg(tick.headingDeg, startHeadingDeg + 180);
  const reversedFacing = headingToTargetDeg <= toleranceDeg;

  // Hold clock: at rest INSIDE the corridor (rolling or leaving resets it).
  const stoppedSinceT = stopped && inCorridor ? (prev.stoppedSinceT ?? tick.t) : null;
  const heldFor = stoppedSinceT !== null ? tick.t - stoppedSinceT : 0;

  const done = entered && inCorridor && reversedFacing && stopped && heldFor >= holdSec;

  // A MANOEUVRE IS COUNTED WHEN IT HAS BEEN PERFORMED — sweep 161, 2026-08-18.
  //
  // `movements = reversals + 1` was reported from the moment the car ENTERED
  // the corridor, so a car that drove in and did nothing at all reported ONE
  // movement. One is the best score there is: rubric.ts prices the economy row
  // off this number (`turn.movements > 0`, then `<= attemptsFor3Stars`) and
  // SessionEndScreen prints it as the objective's evidence line. Both shipped
  // U-turn drills therefore printed, on the same screen, in the same protocol:
  //
  //     «Икономичност на маневрата 2 / 2 т. — Обратен завой в 1 движения —
  //      чиста маневра.»
  //     «– Задача 2: обърни посоката на 180° … — Обратен завой: 1 движение»
  //
  // — a perfect mark and a dash for one act. Read off sc-maneuver-uturn and
  // sc-maneuver-3point, mobile AND pc, and the run logs settle which half was
  // lying: «refused 2 (4) standstill brake presses (would have selected R)»,
  // gear D in every captured frame, 7–11 full stops. No reverse leg was ever
  // engaged and the heading never came back — there was no обратен завой to
  // score, and the car was never asked to be anywhere else than in the box.
  //
  // The condition is the manoeuvre's own definition and not a threshold: the
  // turn is a REVERSAL OF TRAVEL DIRECTION, so it is counted once the facing
  // has actually come back within `toleranceDeg` of start + 180°. A completed
  // objective is unaffected — `done` demands the same `reversedFacing`, so
  // every clean 3-movement turn and every single-arc U-turn in the trace suite
  // reports exactly what it reported before. What stops is a score for a turn
  // that did not happen; the row falls back to rubric.ts's honest
  // „Няма измерване" and SessionEndScreen drops the evidence line (both already
  // branch on 0 — no consumer needed changing).
  //
  // THE RESIDUAL, named rather than hidden: a car that enters the corridor
  // ALREADY facing back — driving in from the far end — still counts as one
  // movement. Separating that needs the entry heading in the eval state, and
  // `ObjectiveEvalState` lives in lessons/types.ts, another lane's file.
  const movements = entered && reversedFacing ? reversals + 1 : 0;
  const progress = done
    ? 1
    : entered
      ? Math.min(0.95, Math.max(0, (180 - headingToTargetDeg) / 180))
      : 0;

  return {
    done,
    progress,
    evalState: { type: "threePointTurn", entered, lastDir, reversals, stoppedSinceT },
    detail: {
      kind: "threePointTurn",
      entered,
      reversals,
      movements,
      headingToTargetDeg: entered ? headingToTargetDeg : null,
    },
  };
}
