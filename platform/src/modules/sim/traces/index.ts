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

// Clip-plan replay registry (doc 66 R3) — replays a pilot template's
// committed mistake demo through the production grading stack so the
// clip-plan generator reads the ENGINE-computed first-violation time.
export { clipReplayTemplateIds, clipStagedOverrideFor, replayPilotMistake } from "./clipReplay";

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
// The curve-envelope wave (doc 72 SP-05, rural-curve archetype); committed
// traces are recordings of exactly this script (gate: traces/__tests__/
// sc-sp-curve-traces.test.ts).
export {
  SC_SP_CURVE_ID,
  recordScSpCurveDrive,
  type ScSpCurveTraceName,
} from "./scSpCurve";

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
// ADR-006 stage 1b — the VU-09 emergency-approach authored drives
// (sc-vu-emergency); committed traces are recordings of exactly these scripts
// (gate: traces/__tests__/sc-vu-emergency-traces).
export {
  SC_VU_EMERGENCY_ID,
  recordScVuEmergencyDrive,
  type ScVuEmergencyTraceName,
} from "./scVuEmergency";
export {
  SC_PK_SMOOTH_STOP_ID,
  pkVanObstacle,
  recordScPkSmoothStopDrive,
  type ScPkSmoothStopTraceName,
} from "./scPkSmoothStop";
// ADR-006 stage 1c — the VU-10 junction-EV authored drives
// (sc-vu-emergency-junction, the priorityFromRight crossing recipe with
// profile "emergency"); committed traces are recordings of exactly these
// scripts (gate: traces/__tests__/sc-vu-emergency-junction-traces).
export {
  SC_VU_EMERGENCY_JUNCTION_ID,
  recordScVuEmergencyJunctionDrive,
  type ScVuEmergencyJunctionTraceName,
} from "./scVuEmergencyJunction";
// N8 slice 1 (VRU-interaction pack) — the VU-02 lateral-clearance authored
// drives (sc-vu-pass-clearance) and the VU-04 door-zone drives
// (sc-vu-door-zone, the first TIMED ObstacleRect2D); committed traces are
// recordings of exactly these scripts (gates: traces/__tests__/
// sc-vu-pass-clearance- / sc-vu-door-zone-traces).
export {
  SC_VU_PASS_CLEARANCE_ID,
  recordScVuPassDrive,
  type ScVuPassTraceName,
} from "./scVuPass";
export {
  SC_VU_DOOR_ZONE_ID,
  doorObstacle,
  doorZoneObstacles,
  recordScVuDoorDrive,
  type ScVuDoorTraceName,
} from "./scVuDoorZone";
// ADR-006 stage 1c — the VP-11 police-stop authored drives
// (sc-vp-police-stop, the policeStop officer figure + curb-side completion
// objectives); committed traces are recordings of exactly these scripts
// (gate: traces/__tests__/sc-vp-police-stop-traces).
export {
  SC_VP_POLICE_STOP_ID,
  recordScVpPoliceStopDrive,
  type ScVpPoliceStopTraceName,
} from "./scVpPoliceStop";
// N11 cockpit-stimuli batch #10 — the VP-06 telltale authored drives
// (sc-vp-telltale, the staged dashboard-lamp stimulus + curb-side completion
// objectives); committed traces are recordings of exactly these scripts
// (gate: traces/__tests__/sc-vp-telltale-traces).
export {
  SC_VP_TELLTALE_ID,
  recordScVpTelltaleDrive,
  type ScVpTelltaleTraceName,
} from "./scVpTelltale";

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
// FOG unlock (doc 72 AC-03 — the compilable weather="fog" condition) — the
// dense-fog authored drives (sc-ac-fog: fog conditions envelope + the
// recorder's fogLights channel); committed traces under
// content/traces/sc-ac-fog/ are recordings of exactly these scripts (gate:
// traces/__tests__/sc-ac-fog-traces).
export {
  SC_AC_FOG_ID,
  recordScAcFogDrive,
  type ScAcFogTraceName,
} from "./scAcFog";
// SNOW unlock (doc 72 AC-08 packed-snow slice — the LAST weather ungated) —
// the day-snow authored drives (sc-ac-snow: snow conditions envelope 0.5 +
// SNOW_DECEL ghost envelopes authored at SCRIPT_DECEL × SNOW_GRIP_FACTOR);
// committed traces under content/traces/sc-ac-snow/ are recordings of exactly
// these scripts (gate: traces/__tests__/sc-ac-snow-traces).
export {
  SC_AC_SNOW_ID,
  recordScAcSnowDrive,
  type ScAcSnowTraceName,
} from "./scAcSnow";
// CROSSWIND unlock (doc 72 AC-12 — the opt-in lateral-wind physics slice on
// the wet-grip seam) — the day-dry authored drives (sc-ac-crosswind: the
// drift-and-correct wind story AUTHORED into the ghost polylines; the LIVE
// wind is physics.crosswind → VehicleSim windLateralN + gust; the shipped
// lane detectors grade the drift — NO new rule code). Committed traces under
// content/traces/sc-ac-crosswind/ are recordings of exactly these scripts
// (gate: traces/__tests__/sc-ac-crosswind-traces).
export {
  SC_AC_CROSSWIND_ID,
  recordScAcCrosswindDrive,
  type ScAcCrosswindTraceName,
} from "./scAcCrosswind";
// SURFACE-PATCH unlock (doc 72 AC-07-full aquaplane / AC-08 ice band — the
// last named Phase-4 friction item): sc-ac-aquaplane rides the waterPatch
// span of ac-aqua-v1 (the LIVE float is VehicleSim.setSurfaceGripFactor via
// the rig; the ghosts AUTHOR it — unbraked span transit, WET_DECEL overrun,
// the осева drift polyline); sc-ac-ice rides ac-ice-v1's icePatch (ICE_DECEL
// = SCRIPT_DECEL × ICE_PATCH_GRIP_FACTOR authors every on-ice ramp). NO new
// rule code — COLLISION / CENTER_LINE_TOUCHED / POOR_LANE_KEEPING /
// SPEED_TOO_FAST_FOR_CONDITIONS grade the outcomes. Committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/sc-ac-aquaplane-traces + sc-ac-ice-traces).
export {
  SC_AC_AQUAPLANE_ID,
  AQUA_WET_DECEL,
  AQUA_PANIC_DECEL,
  aquaVanObstacle,
  recordScAcAquaplaneDrive,
  type ScAcAquaplaneTraceName,
} from "./scAcAquaplane";
export {
  SC_AC_ICE_ID,
  ICE_DECEL,
  iceCarObstacle,
  recordScAcIceDrive,
  type ScAcIceTraceName,
} from "./scAcIce";

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

// Capability — the FO-06 large-vehicle actor profile (sc-follow-truck: the
// brakingLeadCar staged kind with profile "truck", rendered as the box-truck
// rig; leadGap detector unchanged). Committed traces under
// content/traces/sc-follow-truck/ are recordings of exactly these scripts
// (gate: traces/__tests__/sc-follow-truck-traces).
export {
  SC_FOLLOW_TRUCK_ID,
  recordScFollowTruckDrive,
  type ScFollowTruckTraceName,
} from "./scFollowTruck";

// Capability — the FO actor pair on ln-v1 (doc 72 FO-03 cut-in / FO-07
// tailgater): sc-follow-cutin rides the NEW cutInLeadCar staged kind + the
// traffic port's laneShift command (grading fully shipped —
// FOLLOWING_TOO_CLOSE with the recovery-rate innocence guard);
// sc-follow-tailgater rides the NEW rearTailgater pressure actor (learn-only,
// zero emissions — the mistakes grade HARSH_BRAKING_NO_CAUSE /
// SPEEDING_OVER_LIMIT off the player's own choices). Committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/sc-follow-cutin-traces, sc-follow-tailgater-traces).
export {
  SC_FOLLOW_CUTIN_ID,
  recordScFollowCutinDrive,
  recordScFollowCutinPanicSlamProbe,
  type ScFollowCutinTraceName,
} from "./scFollowCutin";
export {
  SC_FOLLOW_TAILGATER_ID,
  recordScFollowTailgaterDrive,
  type ScFollowTailgaterTraceName,
} from "./scFollowTailgater";

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

// ADR-006 stage 1d — the JU-18 регулировчик authored drives
// (sc-signal-controller: the trafficController staged kind arms cluster mode
// "controlled" + the authored permission timetable while the lamps keep
// cycling — the signal-hierarchy lesson). Committed traces under
// content/traces/sc-signal-controller/ are recordings of exactly these
// scripts (gate: traces/__tests__/sc-signal-controller-traces).
export {
  SC_SIGNAL_CONTROLLER_ID,
  recordScSignalControllerDrive,
  scSignalControllerTraceNames,
  type ScSignalControllerTraceName,
} from "./scSignalController";

// ADR-006 stage 2a — the ZONE-BAN authored drives (sc-ov-ban-overtake /
// sc-pk-ban-stop: the first templates on the district `zones` data layer —
// В24 no-overtaking + В27 no-stopping spans consumed by the runtime and the
// OVERTAKING_IN_BAN_ZONE / ILLEGAL_STOP_IN_BAN_ZONE detectors). Committed
// traces under content/traces/<template>/ are recordings of exactly these
// scripts (gates: traces/__tests__/sc-ov-ban-overtake-traces +
// sc-pk-ban-stop-traces).
export {
  SC_OV_BAN_OVERTAKE_ID,
  recordScOvBanOvertakeDrive,
  type ScOvBanOvertakeTraceName,
} from "./scOvBanOvertake";
export {
  SC_PK_BAN_STOP_ID,
  recordScPkBanStopDrive,
  type ScPkBanStopTraceName,
} from "./scPkBanStop";

// ADR-006 stage 2b — the LINE TYPES + BUS LANES authored drives
// (sc-ov-solid-line / sc-ov-bus-lane: the first templates on the 2b `zones`
// vocabulary — М1 solid-осева + BUS-lane spans consumed by the runtime and
// the CROSSED_SOLID_LINE / DRIVING_IN_BUS_LANE detectors). Committed traces
// under content/traces/<template>/ are recordings of exactly these scripts
// (gates: traces/__tests__/sc-ov-solid-line-traces + sc-ov-bus-lane-traces).
export {
  SC_OV_SOLID_LINE_ID,
  recordScOvSolidLineDrive,
  type ScOvSolidLineTraceName,
} from "./scOvSolidLine";
export {
  SC_OV_BUS_LANE_ID,
  recordScOvBusLaneDrive,
  type ScOvBusLaneTraceName,
} from "./scOvBusLane";

// ADR-006 stage 3a — the RAIL PACK slice-1 authored drives (sc-rx-unguarded /
// sc-rx-guarded: the first templates on the `railCrossing` zone kind — the
// authored track band + deterministic barrier timetable consumed by the
// runtime and the RAIL_CROSSING_VIOLATION detector). Committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/sc-rx-unguarded-traces + sc-rx-guarded-traces).
export {
  SC_RX_UNGUARDED_ID,
  recordScRxUnguardedDrive,
  type ScRxUnguardedTraceName,
} from "./scRxUnguarded";
export {
  SC_RX_GUARDED_ID,
  recordScRxGuardedDrive,
  type ScRxGuardedTraceName,
} from "./scRxGuarded";

// RAIL PACK actor slice (ADR-006 stage 3b — doc 72 RX-05 „Ляв завой през
// трамвайно трасе" on sx-v1 + RX-04 „Трамвайна спирка с остров" on
// rx-tram-island-v1): the TRAM as a staged actor — profile "tram" through
// the shipped oncomingLeftTurn machinery, and the halted tram as a dart-out
// PROP at the island stop. Committed traces under content/traces/<template>/
// are recordings of exactly these scripts (gate: sc-rx-tram-traces).
export {
  SC_RX_TRAM_LEFT_ID,
  SC_RX_TRAM_ISLAND_ID,
  recordScRxTramDrive,
  scRxTramTraceNames,
  type ScRxTramTemplateId,
  type ScRxTramTraceName,
} from "./scRxTram";

// OVERTAKE-CORRIDOR adjudication (doc 72 OV-05/OV-08 — the head-on family):
// sc-ov-oncoming-gap rides the NEW oncomingStream staged kind + the runtime's
// overtake-corridor tracker (OVERTAKE_INSUFFICIENT_GAP off the measured
// oncoming gap on the opposing bank of a dashed two-way); sc-ov-abort is the
// abort discipline — its shadow's braked tuck-back replays completely clean
// (an aborted overtake NEVER convicts). Committed traces under
// content/traces/<template>/ are recordings of exactly these scripts (gates:
// traces/__tests__/sc-ov-oncoming-gap-traces + sc-ov-abort-traces).
export {
  SC_OV_ONCOMING_GAP_ID,
  recordScOvOncomingGapDrive,
  type ScOvOncomingGapTraceName,
} from "./scOvOncomingGap";
export {
  SC_OV_ABORT_ID,
  recordScOvAbortDrive,
  type ScOvAbortTraceName,
} from "./scOvAbort";

// OVERTAKE-RETURN adjudication (doc 72 OV-09 — the overtake's third act):
// sc-ov-return-gap rides the runtime's overtake-return tracker
// (OVERTAKE_RETURN_TOO_EARLY off the measured landing gap in front of the
// overtaken vehicle at the committed return — the reference-speed latch keeps
// a guard-rescued victim from acquitting the cut). Committed traces under
// content/traces/sc-ov-return-gap/ are recordings of exactly these scripts
// (gate: traces/__tests__/sc-ov-return-gap-traces).
export {
  SC_OV_RETURN_GAP_ID,
  recordScOvReturnGapDrive,
  type ScOvReturnGapTraceName,
} from "./scOvReturnGap";
