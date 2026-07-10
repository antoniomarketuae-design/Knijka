/**
 * P5 integration contracts — the seams between the sim's parallel workstreams.
 * Owned by the integrator (main session). Implementations live in:
 *   world/     — district geometry + visual world (renders district-v1.json)
 *   runtime/   — logic layer: signals, zones, lane tracking, SimTick emission
 *   lessons/   — lesson specs, objectives, session orchestration
 *   traffic/   — scripted traffic agents
 *   environment/ — sky, lighting, weather, time-of-day, quality presets
 *
 * The rule engine's SimTick/SimTickEvent (rules/types.ts) is the *authoritative*
 * frame contract — runtime produces it, nothing else redefines it.
 */

import type { SimTick } from "./rules/types";
import type { PreDriveMode } from "./procedures/types";

/**
 * PERCEPTUAL ROAD SCALE — the single dial for how exaggerated the road
 * network is versus textbook Bulgarian dimensions (founder call 2026-07-10:
 * perception over textbook; tunable). Driving games run 1.5–2.5× lane
 * exaggeration because textbook-width lanes read miniature on screen; we run
 * 2.5×. The CAR stays real-size — only the road world scales. EVERY road
 * dimension (lane width, paint, setbacks, grading tolerances, traffic-AI
 * offsets) must derive from this constant so one edit re-tunes the world
 * coherently — visual geometry, grading geometry, traffic AI and paint have
 * to agree or detectors misfire.
 */
export const PERCEPTUAL_ROAD_SCALE = 2.5;

/** Vehicle state sampled from the physics rig each frame (world space, meters). */
export interface VehicleSample {
  position: { x: number; y: number }; // ground plane; x=east, y=north (district space)
  headingDeg: number; // 0 = north, clockwise positive
  speedKmh: number;
  indicator: "off" | "left" | "right";
  headlights: "off" | "low" | "high";
  seatbeltOn: boolean;
  handbrakeOn: boolean;
  gear: number;
  mirrorGlance: "left" | "right" | "rear" | null; // set on the frame a glance key is pressed
}

/** Traffic-signal runtime state, per signal node id from district-v1.json. */
export type SignalPhase = "red" | "redYellow" | "green" | "yellow";

export interface WorldRuntime {
  /** Advance signal phases etc.; call once per render frame. */
  update(dtSec: number): void;
  /** Produce the authoritative SimTick for the rule engine from a vehicle sample. */
  sample(
    v: VehicleSample,
    tSec: number,
    isNight: boolean,
    rain?: boolean,
    leadGapM?: number,
  ): SimTick;
  /** Current phase for a signal node (world renderer reads this to light the lamps). */
  signalPhase(signalNodeId: string): SignalPhase;
  /** Resolved speed limit at a position (edge maxspeed or BG urban default 50). */
  speedLimitAt(pos: { x: number; y: number }): number;
  /** Nearest drivable edge + lane info (for HUD/minimap and lane tracking). */
  locate(pos: { x: number; y: number }): {
    edgeId: string | null;
    laneId: number;
    laneOffsetM: number;
  };
}

/** A scored driving lesson. Specs are data; orchestration lives in lessons/. */
export interface LessonSpec {
  id: string; // "l-first-drive"
  order: number;
  titleBg: string;
  descriptionBg: string;
  /** Concept ids this lesson exercises (links sim ↔ knowledge graph). */
  conceptIds: string[];
  /** Spawn point id from district-v1.json, or explicit pose. */
  spawn: { pointId?: string; position?: { x: number; y: number }; headingDeg?: number };
  /** Whether the 13-step pre-drive procedure runs before driving. */
  preDrive: boolean;
  /**
   * A2 pre-drive mode (Instruction→Practice→Assess ladder, doc 68 §5).
   * Default (absent) = "instruction": guided prompts + hotspot highlights,
   * order coached. "practice" = no guidance, order-tolerant, idle hints.
   * "assess" = exam-strict order scoring. Only read when `preDrive` is true.
   */
  preDriveMode?: PreDriveMode;
  /**
   * Vehicle state at spawn (A1 driveline). Default (absent) = "cold": engine
   * OFF, selector P, parking brake ON — the pre-drive reality every lesson
   * should start from. "ready" = engine running in D with the brake released;
   * reserved for acclimatization free-drive (L0).
   */
  vehicleStart?: "cold" | "ready";
  /** Ordered objectives; each completes via a predicate over runtime state. */
  objectives: LessonObjective[];
  /** Optional time-of-day/weather override. */
  environment?: { timeOfDay?: "day" | "dusk" | "night"; rain?: boolean };
  /** Marked parking bay this lesson's park objective targets (L7). The world
   * paints every lesson-authored bay by default (buildWorldGeometry ←
   * LESSON_PARKING_BAYS from lessons/specs). */
  parkingBay?: ParkingBaySpec;
  /** Sudden-obstacle stimulus for emergency-stop lessons (L5). Render-side
   * lives in TrafficLayer; the trigger is A8's job. */
  hazard?: HazardStimulusSpec;
  /**
   * A8 staged encounters — deterministic scripted events the scenario
   * orchestrator (modules/sim/orchestrator) directs during this lesson.
   * DATA ONLY, pinned to district-v1.json like every other spec field;
   * absent/empty = free ambient traffic only (pre-A8 behavior).
   */
  stagedEvents?: StagedEventSpec[];
  /**
   * A13 exam session mode („Пробен практически изпит"). Additive; absent =
   * training lesson. True flips the session to exam-strict behavior:
   *  - coach OFF — every violation grades at catalog points from the FIRST
   *    encounter (no teach moments, no warn-once, no escalation multipliers;
   *    lessons/engine.ts wires it through scenarios/coach `examMode`);
   *  - live official termination — any опасна, any collision, > 9 total
   *    points or > 6 points from основни ends the session immediately
   *    („Изпитът се прекратява", lessons/exam.ts);
   *  - the shell suppresses route guidance and micro-quizzes — the student
   *    navigates by the objective banner's examiner instructions.
   */
  examMode?: boolean;
  /**
   * A13 unlock gate for out-of-curriculum entries (the exam card on
   * /simulator): the entry unlocks once THIS lesson id has a passed session
   * (lessons/progression.ts isExamUnlocked). Linear curriculum progression
   * ignores it; absent = always unlocked.
   */
  unlockAfterLessonId?: string;
}

export interface LessonObjective {
  id: string;
  titleBg: string; // shown in the objective banner
  /** Reach a zone, maintain behavior, or pass a checkpoint — kinds the
   * lessons engine implements; keep this union in sync there. */
  kind: "reachZone" | "passSignal" | "completeManeuver" | "driveDistance";
  params: Record<string, unknown>;
}

/**
 * Painted parking-bay rectangle, district space (doc 68 A5): center (x, y),
 * headingDeg along the street (0 = north, cw), lengthM along the heading,
 * widthM across it. The world markings builder paints it as a white U-shape
 * (side line toward the roadway + both end lines; the curb closes the fourth
 * side). Scoring note: the parkInBay maneuver stays coordinate-free for now —
 * A10 (objective hardening) is what locks the objective to this rect.
 */
export interface ParkingBaySpec {
  x: number;
  y: number;
  headingDeg: number;
  widthM: number;
  lengthM: number;
}

/**
 * Sudden-obstacle stimulus for emergency-stop lessons (doc 68 A5): a bright
 * ball darts from (x, y) along the unit direction (dirX, dirY) at speedMps
 * for travelM meters, crossing the road in front of the student. DATA ONLY —
 * TrafficLayer renders/animates it while its `hazardActiveRef` is true; the
 * A8 scenario orchestrator owns WHEN to flip that ref (nothing triggers it
 * until A8 lands).
 */
export interface HazardStimulusSpec {
  kind: "ballDartOut";
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
  travelM: number;
}

// ---------------------------------------------------------------------------
// A8 staged scenario events (doc 68 A8; event library: docs/simulation/65).
//
// Each spec is authored DATA describing one deterministic encounter: the
// actor's scripted path (district node ids resolved against the same lane
// graph ambient traffic drives), its dormant hold pose, and the arm/trigger
// geometry the orchestrator evaluates against the player each frame.
// Outcomes are reported as SimTick events the EXISTING rule engine already
// grades (prioritySituation / crossing events / collision) — staged events
// add no new ViolationCodes.
// ---------------------------------------------------------------------------

/** Scripted vehicle path + dormant pose (resolved by traffic.stage()). */
export interface StagedActorPathSpec {
  /** District node ids; consecutive pairs must be lane-graph-connected. */
  pathNodes: string[];
  /** Dormant hold: arc of pathNodes[nodeIndex] + offsetM (negative = before). */
  hold: { nodeIndex: number; offsetM: number };
  /** Default cruise speed, m/s. */
  cruiseSpeedMps: number;
  /** Curb-side extra offset, m (cyclist proxy rides right of lane center). */
  extraRightOffsetM?: number;
  /** Closed loop path (roundabout circulation). */
  loop?: boolean;
  /** Presentation palette index. */
  colorIndex?: number;
}

export type StagedEventKind =
  | "pedestrianDartOut"
  | "priorityFromRight"
  | "brakingLeadCar"
  | "cyclistRightHook"
  | "roundaboutEntry";

interface StagedEventBase {
  /** Unique per lesson, e.g. "l4-dart-out". */
  id: string;
  kind: StagedEventKind;
  /** 45-event library id (docs/simulation/65) for traceability. */
  libraryEventId?: string;
}

/** A pedestrian steps onto a specific crossing as the player approaches at
 * speed — crossing occupancy drives the existing PEDESTRIAN_* grading. */
export interface PedestrianDartOutSpec extends StagedEventBase {
  kind: "pedestrianDartOut";
  /** Crossing id from district-v1.json (occupancy + zone grading key). */
  crossingId: string;
  crossing: { x: number; y: number };
  /** Curb start point + unit dart direction (across the road). */
  start: { x: number; y: number };
  dir: { x: number; y: number };
  speedMps: number;
  /** Total walk length (across + a few metres of walk-out), m. */
  travelM: number;
  /** Roadway span along the dart path (crossing-occupancy window), m. */
  roadFromM: number;
  roadToM: number;
  /** Trigger: player nearer than this to the crossing (± seeded jitter)… */
  triggerDistM: number;
  /** …approaching it, at or above this speed. */
  minTriggerSpeedKmh: number;
}

/** A scripted car crosses the player's guarded junction from the right,
 * timed to arrive just before the player's projected line-crossing. Grading:
 * the runtime's existing junction adjudication (give-way conflict at the
 * stop line via conflictNear, right-hand rule via conflictFromRight at
 * uncontrolled nodes) fires on the staged car like on any other vehicle. */
export interface PriorityFromRightSpec extends StagedEventBase {
  kind: "priorityFromRight";
  junction: { nodeId: string; x: number; y: number };
  /**
   * Which runtime detector guards the junction (default "stopLine"): the
   * stop-line give-way check needs the orchestrator to emit the yielded
   * commendation itself; the uncontrolled right-hand-rule tracker emits its
   * own on leaving the junction.
   */
  junctionControl?: "stopLine" | "uncontrolled";
  actor: StagedActorPathSpec;
  /** Index of the junction node within actor.pathNodes (timing reference). */
  junctionNodeIndex: number;
  /** Player distance to the junction that starts the arrival sync, m. */
  armDistM: number;
  /** Car passes the node this long before the player's projected crossing, s. */
  leadSec: number;
  /** Approximate player stop-line distance from the junction node, m. */
  lineDistM: number;
  /** Speed after clearing the junction (leave the conflict radius fast), m/s. */
  clearSpeedMps: number;
}

/** A lead car matches the player's speed at a fixed gap, then brake-slams at
 * a staged point (with the lesson's ballDartOut visual as the WHY). The
 * orchestrator measures stimulus→brake-onset reaction time. */
export interface BrakingLeadCarSpec extends StagedEventBase {
  kind: "brakingLeadCar";
  actor: StagedActorPathSpec;
  /** Gap held ahead of the player while matching, m. */
  followGapM: number;
  maxMatchSpeedMps: number;
  /** The staged slam point on the lead car's path (district space). */
  slamAt: { x: number; y: number };
  slamRadiusM: number;
  slamDecelMps2: number;
  /** Player must be at least this fast for the slam (else it defers until the
   *  player closes within proximityFallbackM of the held car). */
  minSlamSpeedKmh: number;
  proximityFallbackM: number;
  /** Flip the lesson's HazardStimulusSpec visual (ball dart) at the slam. */
  triggersHazard: boolean;
  /** Seconds after resolution before the lead car drives on. */
  resumeAfterSec: number;
}

/** A slow "cyclist" (narrow scripted vehicle-agent — honest v1 actor-model
 * limitation, audit C3) rides curb-side toward a junction the player turns
 * right at; turning across it is the classic right hook. Graded via existing
 * vocabulary: prioritySituation (FAILED_TO_YIELD / YIELDED_TO_PRIORITY) and
 * collision(cyclist) on contact. */
export interface CyclistRightHookSpec extends StagedEventBase {
  kind: "cyclistRightHook";
  junction: { nodeId: string; x: number; y: number };
  actor: StagedActorPathSpec;
  junctionNodeIndex: number;
  /** Player distance to the junction that releases the cyclist, m. */
  releaseDistM: number;
  /** Right turn started with the cyclist within this of the player = hook, m. */
  dangerRadiusM: number;
  /** Cyclist within this of the player near the junction = a real conflict
   *  existed (gates the yielded commendation), m. */
  conflictWindowM: number;
}

/** A scripted car circulates the roundabout timed to the player's approach —
 * the runtime's existing circulatingConflict query grades the entry. */
export interface RoundaboutEntrySpec extends StagedEventBase {
  kind: "roundaboutEntry";
  center: { x: number; y: number };
  ringRadiusM: number;
  /** Closed ring loop (loop: true). */
  actor: StagedActorPathSpec;
  /** Player's entry mouth (district space) + its ring node index. */
  entry: { x: number; y: number };
  entryNodeIndex: number;
  /** Desired car arc upstream of the entry when the player arrives, m. */
  conflictLeadM: number;
  /** Player distance to the ring center that starts the sync, m. */
  armDistM: number;
  minSyncSpeedMps: number;
  maxSyncSpeedMps: number;
}

export type StagedEventSpec =
  | PedestrianDartOutSpec
  | PriorityFromRightSpec
  | BrakingLeadCarSpec
  | CyclistRightHookSpec
  | RoundaboutEntrySpec;

/**
 * Resolution record of one staged encounter (A8). The GRADING already
 * happened through the rule engine (the orchestrator emits only existing
 * SimTick vocabulary); this record is the additive measurement channel —
 * A10 locks lesson objectives to it (e.g. L5 reaction time).
 */
export interface StagedEventOutcome {
  eventId: string;
  kind: StagedEventKind;
  /** True = the student resolved the encounter correctly. */
  success: boolean;
  detail:
    | "yielded" // conflict existed, player gave way
    | "clear" // encounter resolved without a live conflict
    | "violation" // graded FAILED_TO_YIELD / PEDESTRIAN_* path
    | "collision" // physical contact with the staged actor
    | "stoppedInTime" // brakingLeadCar: full stop with gap left
    | "hitLeadCar" // brakingLeadCar: rear-ended the lead
    | "passedWithoutStopping"; // brakingLeadCar: swerved past the stimulus
  /** Session time of resolution, s. */
  tSec: number;
  /** Stimulus onset → first brake application, s (dart-out + lead car). */
  reactionTimeSec?: number;
  /** Remaining bumper gap at full stop, m (brakingLeadCar). */
  stopGapM?: number;
  /** Player speed at the moment the stimulus fired, km/h. */
  approachSpeedKmh?: number;
}

// ---------------------------------------------------------------------------
// A11 hittable traffic — near-miss session stat (doc 68 A11; audit C1).
//
// A near-miss is the player passing a MOVING NPC with almost no lateral
// clearance at a real relative speed — nothing touched, so nothing is graded
// (deliberately NOT a ViolationCode). It is an ADDITIVE measurement channel
// like StagedEventOutcome: A15's feedback map consumes it to show "you got
// away with these". Detection lives in traffic/proximity.ts (pure); the
// NpcColliders physics layer runs it and reports through LessonScene.
// ---------------------------------------------------------------------------

/** One resolved near-miss encounter (reported when the bodies separate). */
export interface NearMissEvent {
  /** Session time at resolution, s. */
  tSec: number;
  /** What was nearly hit (staged cyclist proxies report "cyclist"). */
  kind: "vehicle" | "pedestrian" | "cyclist";
  /** Published traffic state id (staged actors >= 1000). */
  npcId: number;
  /** Tightest body-envelope clearance during the encounter, m (0 = brushed). */
  clearanceM: number;
  /** Peak relative speed during the encounter, m/s. */
  relSpeedMps: number;
}

/** Running session aggregate — `worst` is the tightest-clearance encounter. */
export interface NearMissStats {
  count: number;
  worst: NearMissEvent | null;
}

/** Events the HUD listens to (toasts, banners). Emitted by lessons/runtime. */
export type HudEvent =
  /** A graded mistake. Carries the catalog's authored WHY (explanationBg) +
   * law citation — the toast must teach at the moment of the error (QW7). */
  | { kind: "violation"; titleBg: string; explanationBg: string; points: number; severity: "opasna" | "osnovna" | "vtorostepenna"; lawRef?: string }
  | { kind: "commendation"; titleBg: string }
  /** A first, teachable encounter — coached, not scored (teach-first-then-grade). */
  | { kind: "lesson"; titleBg: string; explanationBg: string; lawRef?: string }
  | { kind: "objectiveComplete"; titleBg: string }
  | { kind: "quiz"; questionId: string };
