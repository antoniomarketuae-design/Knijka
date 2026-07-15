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
  recordScriptedDrive,
  type DriveScript,
  type DriveStep,
  type LiveRecorderOptions,
  type LiveTraceRecorder,
  type LiveTraceSampleInput,
  type RecordScriptedDriveOptions,
  type RecordedDrive,
} from "./recorder";

// The полигон ghost demo (S0-View P0 proof — LessonScene's ?ghost=demo)
export { buildPoligonGhostDemo, poligonGhostDemoScript } from "./demo";
