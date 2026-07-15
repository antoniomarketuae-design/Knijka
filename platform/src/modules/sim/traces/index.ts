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
