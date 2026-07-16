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

import type { RuleEngineConfig, SimTick } from "./rules/types";
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
  /**
   * B1a (doc 72 VP-04): the driveline's latched stall flag (DrivelineState
   * .stalled — set by a stall, cleared by the next successful restart).
   * Additive; absent = the rig has no stall channel (automatic fleet / older
   * callers). The rule engine grades the RISING EDGE as the official
   * второстепенна „загасване".
   */
  stalled?: boolean;
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

/**
 * Multi-map seam (doc 74 §5.1): the district a lesson without `world` plays
 * on — the original Студентски град map. Every existing spec omits the field,
 * so the default keeps them byte-identical in behavior.
 */
export const DEFAULT_DISTRICT_ID = "district-v1";

/** Resolved district id of a lesson (absent `world` = the city default). */
export function lessonDistrictId(lesson: Pick<LessonSpec, "world">): string {
  return lesson.world?.districtId ?? DEFAULT_DISTRICT_ID;
}

/**
 * Ambient-traffic sizing the scene used to hardcode (doc 74 §5.5) — now the
 * per-lesson `traffic` field's fallback. These ARE the pre-seam city values;
 * changing them re-tunes every lesson that doesn't override.
 */
export const DEFAULT_LESSON_TRAFFIC = {
  vehicleCount: 26,
  pedestrianCount: 20,
  anchorRadiusM: 280,
} as const;

/** A scored driving lesson. Specs are data; orchestration lives in lessons/. */
export interface LessonSpec {
  id: string; // "l-first-drive"
  order: number;
  titleBg: string;
  descriptionBg: string;
  /** Concept ids this lesson exercises (links sim ↔ knowledge graph). */
  conceptIds: string[];
  /**
   * B-multi-map (doc 74 §5.1): which world file this lesson plays on —
   * LessonScene fetches `/world/${districtId}.json`. Absent =
   * DEFAULT_DISTRICT_ID (district-v1, Студентски град). Everything downstream
   * of the fetch (runtime, builder, traffic, minimap, spawns, guidance) is
   * parameterized by the parsed document — proven map-agnostic by the
   * poligon-district test suite.
   */
  world?: { districtId: string };
  /**
   * B-multi-map (doc 74 §5.5): per-lesson ambient traffic sizing. Absent
   * fields fall back to DEFAULT_LESSON_TRAFFIC (the city values). The полигон
   * runs ~2 vehicles / 2 pedestrians — an учебна площадка is not a highway.
   */
  traffic?: { vehicleCount?: number; pedestrianCount?: number; anchorRadiusM?: number };
  /** Spawn point id from the lesson's district JSON, or explicit pose. */
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
  /**
   * Per-lesson rule-engine config override (merged over DEFAULT_RULE_CONFIG;
   * createLessonSession opts win over this). Scenario drills for config-gated
   * detectors (e.g. JUNCTION_SCAN_INCOMPLETE, FOLLOWING_TOO_CLOSE_FOR_RAIN,
   * default-OFF so they never touch the exam bank / free-drive) set it here so
   * the LIVE student session grades the taught fault — not only the recorded
   * shadow. compileScenario propagates it from ScenarioSpec.ruleConfig.
   */
  ruleConfig?: Partial<RuleEngineConfig>;
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
  /**
   * S0 Scenario Studio (doc 76 §7) — per-level learning aids of a compiled
   * scenario micro-lesson. ADDITIVE + DATA ONLY: absent (every existing
   * lesson) = no aids, byte-identical behavior. The scenario compiler
   * (lessons/scenario) writes it per difficulty level; LessonScene/the shell
   * consume it when the S0-View workstream lands the ghost/top-down/timeline
   * renderers — until then the field is inert data riding the existing
   * LessonSpec prop path.
   */
  aids?: LessonAidsSpec;
  /**
   * S1 (doc 76 §0 low-speed fidelity): minimum impact speed, km/h, that
   * grades a contact as COLLISION in this lesson. Absent = the street
   * nudge-tolerance default (VehicleRig COLLISION_MIN_KMH = 10). The scenario
   * compiler writes 0 for maneuver drills — in a parking task a 2 km/h
   * bumper touch on a parked car IS the graded mistake. Additive: every
   * existing lesson omits it and keeps street behavior byte-identical.
   */
  collisionMinKmh?: number;
}

/**
 * S1 — one bay of a scenario district's meta.scenario payload (the parking-lot
 * generator's single geometric truth): a ParkingBaySpec rect + occupancy.
 * Occupied bays receive precise hittable parked cars (ScenarioObstacles in the
 * scene; ObstacleRect2D in the headless trace recorder), free bays are
 * maneuver targets. Parsed defensively — a district without the payload
 * (city, полигон) simply yields [].
 */
export interface ScenarioBayMeta extends ParkingBaySpec {
  id: string;
  occupied: boolean;
}

/** Defensive read of `meta.scenario.bays` from a raw district document. */
export function scenarioBaysOf(districtRaw: unknown): ScenarioBayMeta[] {
  if (typeof districtRaw !== "object" || districtRaw === null) return [];
  const meta = (districtRaw as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return [];
  const scenario = (meta as { scenario?: unknown }).scenario;
  if (typeof scenario !== "object" || scenario === null) return [];
  const bays = (scenario as { bays?: unknown }).bays;
  if (!Array.isArray(bays)) return [];
  const out: ScenarioBayMeta[] = [];
  for (const raw of bays) {
    if (typeof raw !== "object" || raw === null) continue;
    const b = raw as Record<string, unknown>;
    if (
      typeof b.id !== "string" ||
      typeof b.x !== "number" ||
      typeof b.y !== "number" ||
      typeof b.headingDeg !== "number" ||
      typeof b.widthM !== "number" ||
      typeof b.lengthM !== "number" ||
      typeof b.occupied !== "boolean" ||
      ![b.x, b.y, b.headingDeg, b.widthM, b.lengthM].every(Number.isFinite)
    ) {
      continue;
    }
    out.push({
      id: b.id,
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      widthM: b.widthM,
      lengthM: b.lengthM,
      occupied: b.occupied,
    });
  }
  return out;
}

/**
 * The Scenario Studio aid ladder contract (doc 76 §7, one flag per aid the
 * table names). Every flag is optional; absent = off. Consumers:
 *  - shadowCar / followHints — S0-View's ghost playback + deviation hints;
 *  - pathRibbon — the A7 guidance ribbon restyled as the correct-path overlay;
 *  - pauseOnError — the shell freezes physics on the first graded mistake
 *    (beyond the A9 teach-moment machinery, which stays coach-policy-driven);
 *  - topdownAllowed — the orthographic top-down POV may be used WHILE DRIVING
 *    (L1); demo/replay views are always free to use it. L4 locks to cockpit
 *    like the real exam (doc 76 §4) — flag absent;
 *  - hintsAfterIdleSec — idle seconds before a contextual hint (L2 pattern).
 */
export interface LessonAidsSpec {
  /** Translucent ghost car replaying the correct recorded trace. */
  shadowCar?: boolean;
  /** Correct-path ground ribbon (the reference image's colored line). */
  pathRibbon?: boolean;
  /** Live follow-the-ghost deviation hints („0,8 м встрани от линията"). */
  followHints?: boolean;
  /** Freeze + card on the first graded mistake. */
  pauseOnError?: boolean;
  /** Top-down ortho camera allowed while driving (grading stays cockpit/chase-only elsewhere). */
  topdownAllowed?: boolean;
  /** Seconds of idling before a contextual hint appears; absent = no idle hints. */
  hintsAfterIdleSec?: number;
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
  /**
   * Vehicle size/type profile (doc 72 §9 FO-06 „Зад камион"): "truck" renders
   * the box-truck rig, "van" the panel van, "emergency" (doc 72 §15 N9,
   * VU-09) the white special-regime rig with the blue light bar; absent =
   * "car" (the deterministic fleet pick — byte-identical pre-profile
   * behavior). Visual + data only: the leadGap/conflict queries stay
   * point-based (ADR-001: rigs fictional).
   */
  profile?: "car" | "van" | "truck" | "emergency";
}

export type StagedEventKind =
  | "pedestrianDartOut"
  | "priorityFromRight"
  | "brakingLeadCar"
  | "cyclistRightHook"
  | "roundaboutEntry"
  | "amberDilemma"
  | "oncomingLeftTurn"
  | "narrowMeeting"
  | "emergencyApproach"
  | "policeStop";

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
  /** C1: player-to-lead distance that arms the encounter, m. Absent = legacy
   * spawn-corridor behaviour (arms on the first player movement); set it for
   * MID-ROUTE corridors so the held lead waits for the player instead of
   * driving its corridor alone at session start. */
  armDistM?: number;
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

/**
 * B1a — the first phase-driven staged event (doc 72 JU-06, capability N2).
 * No actor: the director pins the junction's signal-cluster phase offset when
 * the player ARMS the approach, so the green→yellow flip lands exactly
 * `flipEtaSec` of travel time before the player's stop line — the dilemma
 * window, guaranteed per seed. Grading stays in the EXISTING pipeline: the
 * runtime's stopLineCrossed reports yellow/redYellow/red at crossing (plus
 * the amber `stoppable` adjudication) and the rule engine grades it; the
 * runner only records the outcome.
 */
export interface AmberDilemmaSpec extends StagedEventBase {
  kind: "amberDilemma";
  /** Signal node id (member of the junction's controller cluster). */
  signalNodeId: string;
  /** Junction node position, district space. */
  junction: { x: number; y: number };
  /** Player distance to the junction that pins the phase, m. */
  armDistM: number;
  /** Player must be at least this fast at arm, km/h. */
  minTriggerSpeedKmh: number;
  /** Stop-line setback from the junction node on the player's approach, m. */
  lineDistM: number;
  /**
   * Player's time-to-line at the green→yellow flip, s (± seeded jitter).
   * The dilemma dial: ≥ ~4 s = a comfortable stop exists (stopping is the
   * graded correct answer — carrying on lands on red); ≤ ~2 s = committed
   * (proceeding through the yellow is correct).
   */
  flipEtaSec: number;
}

/**
 * N1 (doc 72 JU-10 — the #1 ranked capability gap): an oncoming car drives
 * STRAIGHT through the junction the player turns LEFT at, timed so it is
 * `gapSec` short of the junction node when the player's projected arrival at
 * the node lands — the left-turn-across-path dilemma, guaranteed per seed.
 * Grading is the runtime's own N1 tracker (prioritySituation
 * "left-turn-oncoming" → FAILED_TO_YIELD / YIELDED_TO_PRIORITY); the runner
 * records the outcome + the ACCEPTED GAP measurement (acceptedGapSec).
 *
 * `gapSec` is the tier dial (exam-bank style):
 *  - ≤ ~1.6 s "tight"  — turning grades the 10-point опасна; waiting is the
 *    only correct resolution;
 *  - ~2.6–3.0 s "advisory" — legal but unsafe: no violation, the outcome's
 *    acceptedGapSec < 3 s lets the scenario rubric coach it;
 *  - ≥ ~5 s "safe" — a clean gap; turning immediately is correct.
 */
export interface OncomingLeftTurnSpec extends StagedEventBase {
  kind: "oncomingLeftTurn";
  junction: { nodeId: string; x: number; y: number };
  /** Opposing-approach path straight through the junction. */
  actor: StagedActorPathSpec;
  /** Index of the junction node within actor.pathNodes (timing reference). */
  junctionNodeIndex: number;
  /** Player distance to the junction that starts the arrival sync, m. */
  armDistM: number;
  /** Oncoming's time-to-node at the player's projected node arrival, s
   * (± seeded jitter) — the gap-class tier dial, see above. The sync holds
   * the actor at (playerEta + gapSec) × cruise metres from the node, so it
   * arrives AT CRUISE SPEED with the authored gap. */
  gapSec: number;
  /** Speed after clearing the junction (leave the conflict radius fast), m/s. */
  clearSpeedMps: number;
}

/**
 * N1 (doc 72 OV-14 — „разминаване в тясна улица"): a parked row narrows the
 * road to ONE usable lane; an oncoming actor is timed to transit the section
 * as the player arrives. ЗДвП narrow-passage priority: the side WITH the
 * obstruction yields. The runner adjudicates (no runtime detector can see
 * authored obstruction sides) and emits ONLY the reserved vocabulary:
 * prioritySituation "narrow-meeting" → FAILED_TO_YIELD (barging into the
 * oncoming's priority) / YIELDED_TO_PRIORITY (waiting at the widening).
 */
export interface NarrowMeetingSpec extends StagedEventBase {
  kind: "narrowMeeting";
  /** Narrow-section span on the ROAD CENTERLINE, district space:
   * `sectionStart` = the player-side entrance, `sectionEnd` = the far end. */
  sectionStart: { x: number; y: number };
  sectionEnd: { x: number; y: number };
  /** Which side carries the obstruction — and therefore must yield. */
  obstructionSide: "player" | "oncoming";
  /** Oncoming actor scripted through the section toward the player. */
  actor: StagedActorPathSpec;
  /** The actor-path arc of ITS section entrance (the sectionEnd side):
   * nodeS[nodeIndex] + offsetM — the runner's timing reference. */
  actorEntry: { nodeIndex: number; offsetM: number };
  /** Player distance to sectionStart that begins the arrival sync, m. */
  armDistM: number;
  /** Actor speed while transiting the section, m/s (default: cruise). */
  transitSpeedMps?: number;
  /** Stationary prop vehicles forming the parked row (staged held actors —
   * doc 72 OV-18's "stage() with a hold pose" pattern; never commanded). */
  props?: Array<{
    pathNodes: string[];
    hold: { nodeIndex: number; offsetM: number };
    extraRightOffsetM?: number;
    colorIndex?: number;
  }>;
}

/**
 * ADR-006 stage 1b (doc 72 §15 N9 — VU-09 „Линейка отзад", ЗДвП чл. 91): an
 * EMERGENCY actor (profile "emergency" — white rig + blue light bar) closes
 * FROM BEHIND at higher speed, pathed on the player's left edge (author the
 * actor path with a negative extraRightOffsetM so it passes to the LEFT).
 * The graded duty is to MAKE WAY — ease right and/or slow so it can pass,
 * never block it. No runtime detector looks behind the player, so the
 * ADJUDICATION lives in the runner (cyclist-right-hook precedent), emitting
 * ONLY the reserved prioritySituation vocabulary ("emergency" → the reducer
 * grades EMERGENCY_NOT_YIELDED / YIELDED_TO_PRIORITY).
 *
 * Choreography: the actor holds dormant behind the spawn; once the player is
 * `releaseGapM` ahead along its path it starts its run at cruise. The DUTY
 * arms when the actor is behind within `armBehindM` and closing; the player
 * then has a GENEROUS `responseWindowSec` to show a yield response — a
 * rightward lane-offset shift ≥ `yieldShiftM` (covers the full lane change
 * right too), OR slowing to ≤ `yieldSlowKmh` while keeping right, OR already
 * standing (≤ ~3 km/h, the stopped-at-the-curb innocent). Only a window that
 * EXPIRES with the player still centered/blocking AT SPEED convicts; once the
 * actor has passed (`passAheadM` ahead) the runner stands down — one
 * adjudication per approach, and a fast pass convicts nobody.
 */
export interface EmergencyApproachSpec extends StagedEventBase {
  kind: "emergencyApproach";
  /** The emergency actor: path from behind the spawn along the player's road,
   *  offset LEFT (negative extraRightOffsetM), profile "emergency", cruise
   *  faster than the player's plausible speed (special-regime exemption). */
  actor: StagedActorPathSpec;
  /** Player this far ahead of the held actor (along its path direction)
   *  releases the run, m (± seeded jitter). */
  releaseGapM: number;
  /** The yield DUTY arms when the actor is behind within this and closing, m. */
  armBehindM: number;
  /** Generous response window from duty-arm to adjudication, s (± jitter). */
  responseWindowSec: number;
  /** Rightward lateral shift vs the duty-arm baseline that counts as making
   *  way, m (a full lane change right trivially exceeds it). */
  yieldShiftM: number;
  /** At/below this speed counts as the slowing response while keeping right,
   *  km/h (author ~10 under the road's limit). */
  yieldSlowKmh: number;
  /** Actor this far ahead of the player = passed → stand down, m. */
  passAheadM: number;
  /** Speed after passing (clears ahead and away), m/s. Default: cruise. */
  clearSpeedMps?: number;
}

/**
 * ADR-006 stage 1c (doc 72 §3 VP-11 — „Спиране по полицейски сигнал",
 * Наредба-38 / ЗДвП чл. 170): a uniformed OFFICER FIGURE stands at the curb
 * signalling THE PLAYER to stop (a staged pedestrian actor that never walks —
 * pose "stopSignal" renders the raised arm + hi-vis vest, ADR-001 fictional).
 *
 * SCENERY + MEASUREMENT ONLY — deliberately NOT an adjudicator: the runner
 * stages the figure and records an outcome ("yielded" when the player rests
 * at the curb-side halt point, "passedWithoutStopping" when the officer falls
 * `passBeyondM` behind without a compliant stop), but emits ZERO SimTick
 * events, so NO violation can ever grade from it (the A12 bias — an
 * unmodelled duty must not convict). The graded contract lives entirely in
 * the scenario's EXISTING objectives (a low-speed curb-side reachZone = the
 * pull-over-and-stop completion, the sc-pk-smooth-stop stop-mark pattern).
 */
export interface PoliceStopSpec extends StagedEventBase {
  kind: "policeStop";
  /** Officer's standing point (sidewalk, clear of the roadway), district space. */
  officer: { x: number; y: number };
  /** Unit facing direction (toward the roadway) — the figure's pose heading. */
  facing: { x: number; y: number };
  /** Curb-side halt point the compliant driver rests at (mirrors the
   *  scenario's graded stop-zone objective — single truth by value). */
  stop: { x: number; y: number };
  /** Within this of `stop`… */
  stopRadiusM: number;
  /** …at/below this speed = complied (outcome "yielded"), km/h. */
  stopSpeedKmh: number;
  /** Officer this far behind the player (player-frame arc) without a
   *  compliant stop = the signal was ignored (outcome only, no grading), m. */
  passBeyondM: number;
}

export type StagedEventSpec =
  | PedestrianDartOutSpec
  | PriorityFromRightSpec
  | BrakingLeadCarSpec
  | CyclistRightHookSpec
  | RoundaboutEntrySpec
  | AmberDilemmaSpec
  | OncomingLeftTurnSpec
  | NarrowMeetingSpec
  | EmergencyApproachSpec
  | PoliceStopSpec;

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
  /**
   * N1 gap-acceptance measurement (oncomingLeftTurn): seconds until the
   * oncoming vehicle would reach the junction, measured at the player's turn
   * commit. Rubric thresholds (doc 72 JU-10 evidence): < 3 s = unsafe-but-
   * legal advisory (NOT a violation — the 10-point conviction band lives in
   * the runtime at ≤ 2 s), ≥ 4 s = the taught norm. Absent = no oncoming was
   * inbound at commit (waited it out / clear road).
   */
  acceptedGapSec?: number;
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
