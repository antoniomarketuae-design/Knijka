/**
 * sim/traces — public surface of the Scenario Studio trace subsystem
 * (doc 76 §5: recorded kinematic ghosts, never re-simulated physics).
 *
 * NOTE: the sim module's public API is src/modules/sim/index.ts (module
 * boundary rule, docs/architecture/05); it re-exports this barrel as
 * `traces`. The /simulator scene layer and tools consume this sub-barrel
 * directly (the sim/lessons pattern).
 */

// Format v1: types + version + shared playback clock
export {
  TRACE_SAMPLE_HZ,
  TRACE_VERSION,
  createTraceClock,
  createTracePoint,
  type ScenarioTrace,
  type TraceClock,
  type TraceEvent,
  type TraceEventKind,
  type TraceIndicator,
  type TraceKind,
  type TraceMeta,
  type TracePoint,
  type TraceSample,
} from "./types";

// Defensive parse/serialize (never trust stored JSON — the store.ts law)
export { parseScenarioTrace, serializeScenarioTrace } from "./parse";

// Playback queries (zero-alloc hot path) + ribbon-path decimation
export {
  activeAnnotationIndex,
  sampleAt,
  traceAnnotations,
  tracePathForRibbon,
} from "./sample";

// Recorders: live ring (student attempts) + scripted headless (demos/QA)
export {
  createTraceRecorder,
  obstacleRectsOverlap,
  recordScriptedDrive,
  type DriveScript,
  type DriveStep,
  type LiveRecorderOptions,
  type LiveTraceRecorder,
  type LiveTraceSampleInput,
  type ObstacleRect2D,
  type RecordScriptedDriveOptions,
  type RecordedDrive,
  type TraceCollisionWith,
} from "./recorder";

// The полигон ghost demo (S0-View P0 proof — LessonScene's ?ghost=demo)
export { buildPoligonGhostDemo, poligonGhostDemoScript } from "./demo";

// S1 — the sc-park-perp-rev authored drives (shadow + 2 mistake demos); the
// committed traces under content/traces/sc-park-perp-rev/ are recordings of
// exactly these scripts (gate: traces/__tests__/sc-park-perp-rev-traces).
export {
  PARKED_CAR_HALF_LENGTH_M,
  PARKED_CAR_HALF_WIDTH_M,
  SC_PARK_PERP_REV_ID,
  lotObstacleRects,
  recordScParkPerpRevDrive,
  scParkPerpRevMistakeNoObservationScript,
  scParkPerpRevMistakeWideScript,
  scParkPerpRevShadowScript,
  type ScParkPerpRevTraceName,
} from "./scParkPerpRev";

// S2-A — the parking-wave authored drives (sc-park-parallel / sc-park-45 /
// sc-park-narrow); committed traces under content/traces/<template>/ are
// recordings of exactly these scripts (gates: traces/__tests__/sc-park-*).
export {
  SC_PARK_PARALLEL_ID,
  recordScParkParallelDrive,
  type ScParkParallelTraceName,
} from "./scParkParallel";
export { SC_PARK_45_ID, recordScPark45Drive, type ScPark45TraceName } from "./scPark45";
export {
  SC_PARK_NARROW_ID,
  recordScParkNarrowDrive,
  type ScParkNarrowTraceName,
} from "./scParkNarrow";

// S2-B — the junction/signal authored drives (sc-junction-rhr / -stop /
// sc-signal-response / sc-turn-left-oncoming); committed traces are recordings
// of exactly these scripts (gates: traces/__tests__/sc-tj- / sc-sx-traces).
export {
  recordScJunctionDrive,
  scJunctionTraceNames,
  SC_JUNCTION_RECORDINGS,
  type ScJunctionTemplateId,
  type ScJunctionTraceName,
} from "./scJunctions";

// S2-C — the flow authored drives (sc-zebra-approach / sc-roundabout-entry /
// sc-lane-change); committed traces are recordings of exactly these scripts
// (gates: traces/__tests__/sc-zebra-approach- / sc-roundabout-entry- /
// sc-lane-change-traces).
export {
  SC_ZEBRA_APPROACH_ID,
  recordScZebraApproachDrive,
  type ScZebraApproachTraceName,
} from "./scZebraApproach";
export {
  SC_ROUNDABOUT_ENTRY_ID,
  recordScRoundaboutEntryDrive,
  type ScRoundaboutEntryTraceName,
} from "./scRoundaboutEntry";
export {
  SC_LANE_CHANGE_ID,
  recordScLaneChangeDrive,
  type ScLaneChangeTraceName,
} from "./scLaneChange";

// S3-A — the pedestrian-family authored drives (sc-crossing-let-pass /
// sc-crossing-slow-crosser / sc-crossing-rain-sprint); committed traces are
// recordings of exactly these scripts (gates: traces/__tests__/sc-crossing-*).
export {
  SC_CROSSING_LET_PASS_ID,
  recordScCrossingLetPassDrive,
  type ScCrossingLetPassTraceName,
} from "./scCrossingLetPass";
export {
  SC_CROSSING_SLOW_CROSSER_ID,
  recordScCrossingSlowCrosserDrive,
  type ScCrossingSlowCrosserTraceName,
} from "./scCrossingSlowCrosser";
export {
  SC_CROSSING_RAIN_SPRINT_ID,
  recordScCrossingRainSprintDrive,
  type ScCrossingRainSprintTraceName,
} from "./scCrossingRainSprint";

// S3-B — the speed-management authored drives (sc-speed-creep / sc-speed-
// dangerous / sc-speed-rain); committed traces are recordings of exactly these
// scripts (gates: traces/__tests__/sp-speed-*).
export {
  SC_SPEED_CREEP_ID,
  recordScSpeedCreepDrive,
  type ScSpeedCreepTraceName,
} from "./scSpeedCreep";
export {
  SC_SPEED_DANGEROUS_ID,
  recordScSpeedDangerousDrive,
  type ScSpeedDangerousTraceName,
} from "./scSpeedDanger";
export {
  SC_SPEED_RAIN_ID,
  recordScSpeedRainDrive,
  type ScSpeedRainTraceName,
} from "./scSpeedRain";

// S3-C — the following/gap-management authored drives (sc-follow-distance /
// sc-follow-brake); committed traces are recordings of exactly these scripts
// (gates: traces/__tests__/fo-follow-distance- / fo-follow-brake-traces).
export {
  SC_FOLLOW_DISTANCE_ID,
  recordScFollowDistanceDrive,
  type ScFollowDistanceTraceName,
} from "./scFollowDistance";
export {
  SC_FOLLOW_BRAKE_ID,
  recordScFollowBrakeDrive,
  type ScFollowBrakeTraceName,
} from "./scFollowBrake";

// S3-D — the second junction/priority authored drives (sc-junction-gap /
// sc-junction-blind); committed traces are recordings of exactly these scripts
// (gate: traces/__tests__/sc-ju2-traces).
export {
  recordScJunction2Drive,
  scJunction2TraceNames,
  SC_JUNCTION2_RECORDINGS,
  SC_JUNCTION_GAP_ID,
  SC_JUNCTION_BLIND_ID,
  type ScJunction2TemplateId,
  type ScJunction2TraceName,
} from "./scJunctions2";
