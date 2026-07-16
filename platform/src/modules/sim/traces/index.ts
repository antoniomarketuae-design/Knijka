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

// PE batch 2 — the additional pedestrian-hazard authored drives (bus-stop kill
// zone PE-10, child-after-ball PE-04, white-cane PE-14); committed traces are
// recordings of exactly these scripts (gates: traces/__tests__/
// sc-crossing-bus-shadow- / sc-crossing-child-ball- / sc-crossing-white-cane-).
export {
  SC_CROSSING_BUS_SHADOW_ID,
  BUS_OBSTACLE,
  recordScCrossingBusShadowDrive,
  type ScCrossingBusShadowTraceName,
} from "./scCrossingBusShadow";
export {
  SC_CROSSING_CHILD_BALL_ID,
  recordScCrossingChildBallDrive,
  type ScCrossingChildBallTraceName,
} from "./scCrossingChildBall";
export {
  SC_CROSSING_WHITE_CANE_ID,
  recordScCrossingWhiteCaneDrive,
  type ScCrossingWhiteCaneTraceName,
} from "./scCrossingWhiteCane";

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

// S3-E — the lane-discipline authored drives (sc-ov-keep-right / sc-ov-lane-
// keeping / sc-ov-oneway); committed traces are recordings of exactly these
// scripts (gates: traces/__tests__/sc-ov-keep-right- / sc-ov-lane-keeping- /
// sc-ov-oneway-traces).
export {
  SC_OV_KEEP_RIGHT_ID,
  recordScOvKeepRightDrive,
  type ScOvKeepRightTraceName,
} from "./scOvKeepRight";
export {
  SC_OV_LANE_KEEPING_ID,
  recordScOvLaneKeepingDrive,
  type ScOvLaneKeepingTraceName,
} from "./scOvLaneKeeping";
export {
  SC_OV_ONEWAY_ID,
  recordScOvOneWayDrive,
  type ScOvOneWayTraceName,
} from "./scOvOneWay";

// S3-F — the VRU-family authored drives (sc-vu-cyclist-hook); committed traces
// are recordings of exactly these scripts (gate: traces/__tests__/
// sc-vu-cyclist-hook-traces).
export {
  SC_VU_CYCLIST_HOOK_ID,
  recordScVuCyclistDrive,
  type ScVuCyclistTraceName,
} from "./scVuCyclist";
export {
  SC_PK_SMOOTH_STOP_ID,
  pkVanObstacle,
  recordScPkSmoothStopDrive,
  type ScPkSmoothStopTraceName,
} from "./scPkSmoothStop";

// S4 (cockpit channels — AC/VP unlock) — the cockpit-procedure + adverse-
// conditions authored drives (sc-vp-readiness / sc-ac-night-lights /
// sc-ac-rain-lights); committed traces are recordings of exactly these scripts
// (gates: traces/__tests__/vp-readiness- / ac-night-lights- /
// ac-rain-lights-traces).
export {
  SC_VP_READINESS_ID,
  recordScVpReadinessDrive,
  type ScVpReadinessTraceName,
} from "./scVpReadiness";
export {
  SC_AC_NIGHT_LIGHTS_ID,
  recordScAcNightLightsDrive,
  type ScAcNightLightsTraceName,
} from "./scAcNightLights";
export {
  SC_AC_RAIN_LIGHTS_ID,
  recordScAcRainLightsDrive,
  type ScAcRainLightsTraceName,
} from "./scAcRainLights";
export {
  SC_AC_HIGHBEAM_LEAD_ID,
  recordScAcHighbeamLeadDrive,
  type ScAcHighbeamLeadTraceName,
} from "./scAcHighbeamLead";

// Detector pack unit 2 — Part A (shipped detectors: FO-08 standstill gap,
// OV-07 crossing overtake) + Part B (config-gated drills: JU-23 junction scan,
// FO-04 rain following). Committed traces under content/traces/<template>/ are
// recordings of exactly these scripts (gates: traces/__tests__/*).
export {
  SC_FOLLOW_STANDSTILL_ID,
  recordScFollowStandstillDrive,
  type ScFollowStandstillTraceName,
} from "./scFollowStandstill";
export {
  SC_OV_CROSSING_OVERTAKE_ID,
  recordScOvCrossingOvertakeDrive,
  type ScOvCrossingOvertakeTraceName,
} from "./scOvCrossingOvertake";
export {
  SC_JUNCTION_SCAN_ID,
  recordScJunctionScanDrive,
  type ScJunctionScanTraceName,
} from "./scJunctionScan";
export {
  SC_FOLLOW_RAIN_GAP_ID,
  recordScFollowRainGapDrive,
  type ScFollowRainGapTraceName,
} from "./scFollowRainGap";

// Final harvest — config-gated move-off-observation drill (doc 72 PK-05) +
// reverse-into-a-driveway (doc 72 PK-11); committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/sc-pk-move-off- / sc-pk-driveway-traces).
export {
  SC_PK_MOVE_OFF_ID,
  recordScPkMoveOffDrive,
  type ScPkMoveOffTraceName,
} from "./scPkMoveOff";
export {
  SC_PK_DRIVEWAY_ID,
  PK_DRIVE_TARGET_BAY,
  drivewayObstacles,
  recordScPkDrivewayDrive,
  type ScPkDrivewayTraceName,
} from "./scPkDriveway";
// Final harvest — green-hesitation drill on a LIVE green phase (doc 72 JU-09);
// committed traces under content/traces/sc-signal-hesitation/ are recordings of
// exactly these scripts (gate: traces/__tests__/sc-signal-hesitation-traces).
export {
  SC_SIGNAL_HESITATION_ID,
  SX_PIN_NS_GREEN_HOLD,
  recordScSignalHesitationDrive,
  type ScSignalHesitationTraceName,
} from "./scSignalHesitation";

// Capability batch 2 (stall + hard-brake recorder channels — the VP-04/SP-11
// unlock) — the stall-at-move-off + causeless-harsh-brake authored drives
// (sc-vp-stall / sc-sp-harsh-brake); committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/vp-stall- / sp-harsh-brake-traces).
export {
  SC_VP_STALL_ID,
  recordScVpStallDrive,
  type ScVpStallTraceName,
} from "./scVpStall";
export {
  SC_SP_HARSH_BRAKE_ID,
  recordScSpHarshBrakeDrive,
  type ScSpHarshBrakeTraceName,
} from "./scSpHarshBrake";

// Signals family — the dead/flashing-signal capability drives (sc-signal-dead /
// sc-signal-flashing); the signal cluster is dialed DARK / flashing amber and
// the junction falls back to the right-hand rule (doc 72 JU-20). Committed
// traces under content/traces/<template>/ are recordings of exactly these
// scripts (gate: traces/__tests__/sc-signals-traces).
export {
  recordScSignalDrive,
  scSignalTraceNames,
  SC_SIGNAL_RECORDINGS,
  SC_SIGNAL_DEAD_ID,
  SC_SIGNAL_FLASHING_ID,
  type ScSignalTemplateId,
  type ScSignalTraceName,
} from "./scSignals";
