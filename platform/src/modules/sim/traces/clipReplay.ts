/**
 * Clip-plan replay registry (doc 66 R3 — the produced-media fault-time law).
 *
 * Re-runs a pilot template's AUTHORED recorder script through the production
 * grading stack. By the trace-gate law (traces/__tests__/*: committed bytes
 * ARE these scripts' recordings) the run is a faithful replay of the
 * committed demo, so the returned `ruleEvents` log carries the committed
 * trace's grading — timestamps included. The clip-plan generator
 * (learning/clipPlanBuilder) reads the FIRST cited violation's time from it
 * and byte-verifies the recording against the committed file.
 *
 * PILOT SCOPE: exactly the templates the clip pilot covers today. Extend the
 * registry as the pilot scales; an unknown template THROWS so the generator
 * can never silently guess a fault time (doc 66: engine-computed, not
 * annotation-guessed).
 */

import type { StagedEventSpec } from "../contracts";
import type { RecordedDrive } from "./recorder";
import { recordScAcNightLightsDrive, type ScAcNightLightsTraceName } from "./scAcNightLights";
import {
  recordScAcRainLightsDrive,
  scAcRainLightsClipStaged,
  type ScAcRainLightsTraceName,
} from "./scAcRainLights";
import { recordScEdD2CityRunDrive, type ScEdD2CityRunTraceName } from "./scEdD2CityRun";
import {
  recordScFollowDistanceDrive,
  scFollowDistanceClipStaged,
  type ScFollowDistanceTraceName,
} from "./scFollowDistance";
import {
  SC_JUNCTION_RHR_ID,
  SC_TURN_LEFT_ONCOMING_ID,
  recordScJunctionDrive,
  type ScJunctionTraceName,
} from "./scJunctions";
import { recordScLaneChangeDrive, type ScLaneChangeTraceName } from "./scLaneChange";
import { recordScMwDisciplineDrive, type ScMwDisciplineTraceName } from "./scMwDiscipline";
import { recordScOvBanOvertakeDrive, type ScOvBanOvertakeTraceName } from "./scOvBanOvertake";
import { recordScOvOneWayDrive, type ScOvOneWayTraceName } from "./scOvOneWay";
import {
  recordScOvSolidLineDrive,
  scOvSolidLineClipStaged,
  type ScOvSolidLineTraceName,
} from "./scOvSolidLine";
import { recordScParkPerpRevDrive, type ScParkPerpRevTraceName } from "./scParkPerpRev";
import { recordScPkBanStopDrive, type ScPkBanStopTraceName } from "./scPkBanStop";
import {
  recordScRoundaboutEntryDrive,
  scRoundaboutEntryClipStaged,
  type ScRoundaboutEntryTraceName,
} from "./scRoundaboutEntry";
import { recordScRxUnguardedDrive, type ScRxUnguardedTraceName } from "./scRxUnguarded";
import { recordScSpeedCreepDrive, type ScSpeedCreepTraceName } from "./scSpeedCreep";
import {
  recordScSpeedRainDrive,
  scSpeedRainClipStaged,
  type ScSpeedRainTraceName,
} from "./scSpeedRain";
import { recordScVpReadinessDrive, type ScVpReadinessTraceName } from "./scVpReadiness";
import { recordScVuEmergencyDrive, type ScVuEmergencyTraceName } from "./scVuEmergency";
import { recordScZebraApproachDrive, type ScZebraApproachTraceName } from "./scZebraApproach";
// EVENT→SCENARIO resolver pilot growth (why-panel direct wiring): the 19
// recorders behind the newly-wired events' representative demos.
import { recordScAcCrosswindDrive, type ScAcCrosswindTraceName } from "./scAcCrosswind";
import { recordScHzBrakeDontSwerveDrive, type ScHzBrakeDontSwerveTraceName } from "./scHzBrakeDontSwerve";
import { recordScHzBreakdownPulloffDrive, type ScHzBreakdownPulloffTraceName } from "./scHzBreakdownPulloff";
import { recordScJxPriorityConfidenceDrive, type ScJxPriorityConfidenceTraceName } from "./scJxPriorityConfidence";
import { recordScLnObstacleMeetingDrive, type ScLnObstacleMeetingTraceName } from "./scLnObstacleMeeting";
import { recordScMergeAccelLaneDrive, type ScMergeAccelLaneTraceName } from "./scMergeAccelLane";
import { recordScMergeBusPulloutDrive, type ScMergeBusPulloutTraceName } from "./scMergeBusPullout";
import { recordScMergeFromPropertyDrive, type ScMergeFromPropertyTraceName } from "./scMergeFromProperty";
import { recordScMvUturnBanDrive, type ScMvUturnBanTraceName } from "./scMvUturnBan";
import { recordScParkParallelDrive, type ScParkParallelTraceName } from "./scParkParallel";
import { recordScPeParkedRowScanDrive, type ScPeParkedRowScanTraceName } from "./scPeParkedRowScan";
import { recordScPeZoneLivingDrive, type ScPeZoneLivingTraceName } from "./scPeZoneLiving";
import { SC_RX_TRAM_LEFT_ID, recordScRxTramDrive, type ScRxTramTraceName } from "./scRxTram";
import { recordScSignalControllerDrive, type ScSignalControllerTraceName } from "./scSignalController";
import { recordScVpPoliceStopDrive, type ScVpPoliceStopTraceName } from "./scVpPoliceStop";
import { recordScVpTelltaleRedDrive, type ScVpTelltaleRedTraceName } from "./scVpTelltaleRed";
import { recordScVuPassDrive, type ScVuPassTraceName } from "./scVuPass";
// Half-B reel wave — the 5 new theory-reel drills share one recorder module.
import { recordReelDrive, reelClipStaged } from "./scReels";

type Replayer = (districtRaw: unknown, traceName: string) => RecordedDrive;

/** templateId → its authored recorder. Trace names are validated by the
 *  recorders themselves (unknown name → the recorder's own throw). */
const REGISTRY: Readonly<Record<string, Replayer>> = {
  "sc-ac-crosswind": (d, n) => recordScAcCrosswindDrive(d, n as ScAcCrosswindTraceName),
  "sc-ac-night-lights": (d, n) => recordScAcNightLightsDrive(d, n as ScAcNightLightsTraceName),
  "sc-ac-rain-lights": (d, n) => recordScAcRainLightsDrive(d, n as ScAcRainLightsTraceName),
  "sc-ed-d2-city-run": (d, n) => recordScEdD2CityRunDrive(d, n as ScEdD2CityRunTraceName),
  "sc-follow-distance": (d, n) => recordScFollowDistanceDrive(d, n as ScFollowDistanceTraceName),
  "sc-hz-brake-dont-swerve": (d, n) => recordScHzBrakeDontSwerveDrive(d, n as ScHzBrakeDontSwerveTraceName),
  "sc-hz-breakdown-pulloff": (d, n) => recordScHzBreakdownPulloffDrive(d, n as ScHzBreakdownPulloffTraceName),
  "sc-junction-rhr": (d, n) => recordScJunctionDrive(d, SC_JUNCTION_RHR_ID, n as ScJunctionTraceName),
  "sc-junction-stop": (d, n) => recordScJunctionDrive(d, "sc-junction-stop", n as ScJunctionTraceName),
  "sc-jx-priority-confidence": (d, n) => recordScJxPriorityConfidenceDrive(d, n as ScJxPriorityConfidenceTraceName),
  "sc-lane-change": (d, n) => recordScLaneChangeDrive(d, n as ScLaneChangeTraceName),
  "sc-ln-obstacle-meeting": (d, n) => recordScLnObstacleMeetingDrive(d, n as ScLnObstacleMeetingTraceName),
  "sc-merge-accel-lane": (d, n) => recordScMergeAccelLaneDrive(d, n as ScMergeAccelLaneTraceName),
  "sc-merge-bus-pullout": (d, n) => recordScMergeBusPulloutDrive(d, n as ScMergeBusPulloutTraceName),
  "sc-merge-from-property": (d, n) => recordScMergeFromPropertyDrive(d, n as ScMergeFromPropertyTraceName),
  "sc-mv-uturn-ban": (d, n) => recordScMvUturnBanDrive(d, n as ScMvUturnBanTraceName),
  "sc-mw-discipline": (d, n) => recordScMwDisciplineDrive(d, n as ScMwDisciplineTraceName),
  "sc-ov-ban-overtake": (d, n) => recordScOvBanOvertakeDrive(d, n as ScOvBanOvertakeTraceName),
  "sc-ov-oneway": (d, n) => recordScOvOneWayDrive(d, n as ScOvOneWayTraceName),
  "sc-ov-solid-line": (d, n) => recordScOvSolidLineDrive(d, n as ScOvSolidLineTraceName),
  "sc-park-parallel": (d, n) => recordScParkParallelDrive(d, n as ScParkParallelTraceName),
  "sc-park-perp-rev": (d, n) => recordScParkPerpRevDrive(d, n as ScParkPerpRevTraceName),
  "sc-pe-parked-row-scan": (d, n) => recordScPeParkedRowScanDrive(d, n as ScPeParkedRowScanTraceName),
  "sc-pe-zone-living": (d, n) => recordScPeZoneLivingDrive(d, n as ScPeZoneLivingTraceName),
  "sc-pk-ban-stop": (d, n) => recordScPkBanStopDrive(d, n as ScPkBanStopTraceName),
  "sc-roundabout-entry": (d, n) => recordScRoundaboutEntryDrive(d, n as ScRoundaboutEntryTraceName),
  "sc-rx-tram-left": (d, n) => recordScRxTramDrive(d, SC_RX_TRAM_LEFT_ID, n as ScRxTramTraceName),
  "sc-rx-unguarded": (d, n) => recordScRxUnguardedDrive(d, n as ScRxUnguardedTraceName),
  "sc-signal-controller": (d, n) => recordScSignalControllerDrive(d, n as ScSignalControllerTraceName),
  "sc-speed-creep": (d, n) => recordScSpeedCreepDrive(d, n as ScSpeedCreepTraceName),
  "sc-speed-rain": (d, n) => recordScSpeedRainDrive(d, n as ScSpeedRainTraceName),
  "sc-turn-left-oncoming": (d, n) => recordScJunctionDrive(d, SC_TURN_LEFT_ONCOMING_ID, n as ScJunctionTraceName),
  "sc-vp-police-stop": (d, n) => recordScVpPoliceStopDrive(d, n as ScVpPoliceStopTraceName),
  "sc-vp-readiness": (d, n) => recordScVpReadinessDrive(d, n as ScVpReadinessTraceName),
  "sc-vp-telltale-red": (d, n) => recordScVpTelltaleRedDrive(d, n as ScVpTelltaleRedTraceName),
  "sc-vu-emergency": (d, n) => recordScVuEmergencyDrive(d, n as ScVuEmergencyTraceName),
  "sc-vu-pass-clearance": (d, n) => recordScVuPassDrive(d, n as ScVuPassTraceName),
  "sc-zebra-approach": (d, n) => recordScZebraApproachDrive(d, n as ScZebraApproachTraceName),
  // Half-B reel wave (scReels.ts) — one recorder, dispatched by templateId.
  "sc-sign-warning": (d, n) => recordReelDrive("sc-sign-warning", n, d),
  "sc-driver-distraction": (d, n) => recordReelDrive("sc-driver-distraction", n, d),
  "sc-accident-own-conduct": (d, n) => recordReelDrive("sc-accident-own-conduct", n, d),
  "sc-animal-hazard": (d, n) => recordReelDrive("sc-animal-hazard", n, d),
  "sc-lane-control-signal": (d, n) => recordReelDrive("sc-lane-control-signal", n, d),
};

/** The templates this registry can replay, sorted (introspection/tests). */
export function clipReplayTemplateIds(): string[] {
  return Object.keys(REGISTRY).sort();
}

/**
 * templateId → a per-mistake CLIP staged override. Some demos are RECORDED
 * against a demo-specific staged actor (the recorder's own override), so the
 * PRODUCED clip must re-enact THAT actor, not the DRILL default the compiled
 * lesson carries — otherwise the clip renders a gap the ghost was never graded
 * against (doc 66 / THEO-4 debrief honesty). Returns null (use the compiled
 * drill staged) unless a template registers one; only sc-follow-distance does
 * today (its „Лепене за предния" tailgate demo). The single source of truth is
 * the recorder — see scFollowDistanceClipStaged.
 */
const CLIP_STAGED_OVERRIDES: Readonly<
  Record<string, (mistakeIndex: number) => StagedEventSpec[] | null>
> = {
  "sc-follow-distance": scFollowDistanceClipStaged,
  // Roundabout barge — the circulating car it failed to yield to is graded 14 m
  // upstream (far to the driver's LEFT); pull it to ~the south node for the CLIP
  // only so the chase cone contains it (grading untouched; see the recorder).
  "sc-roundabout-entry": scRoundaboutEntryClipStaged,
  // Half-B head-on reels — the oncoming stream is pulled into the fault frame
  // for the CLIP only (the recording keeps the far stream; see reelClipStaged).
  "sc-animal-hazard": (mi) => reelClipStaged("sc-animal-hazard", mi),
  "sc-lane-control-signal": (mi) => reelClipStaged("sc-lane-control-signal", mi),
  // Founder R0 „nothing is happening": two EGO-ONLY faults whose recordings
  // legitimately stage no actor, so the clip framed an empty road and the
  // student saw no reason for the manoeuvre / no measure of the speed. Both get
  // the missing conflict actor FOR THE CLIP ONLY — the slow truck the solid
  // line is crossed to get past, and the wet-pace traffic the rain speeder
  // reels in. Grading is byte-identical (see each recorder's comment).
  "sc-ov-solid-line": scOvSolidLineClipStaged,
  "sc-speed-rain": scSpeedRainClipStaged,
  // Founder R0 „the road is completely visible, this contradicts the question":
  // the AC-02 lesson is „лампите са за да те ВИЖДАТ", and the recording drives
  // an empty street — nobody in frame for whom the unlit car is invisible. The
  // clip gets an oncoming stream on the far bank (see scAcRainLightsClipStaged).
  "sc-ac-rain-lights": scAcRainLightsClipStaged,
};

/**
 * The CLIP staged override for (template, mistake), or null to keep the
 * compiled DRILL staged. The clip-capture front-ends apply this to the
 * compiled lesson's stagedEvents BEFORE mounting the scene — clip-scoped, so
 * the live drill (which compiles the same lesson independently) is untouched.
 */
export function clipStagedOverrideFor(
  templateId: string,
  mistakeIndex: number,
): StagedEventSpec[] | null {
  const fn = Object.hasOwn(CLIP_STAGED_OVERRIDES, templateId)
    ? CLIP_STAGED_OVERRIDES[templateId]
    : undefined;
  return fn ? fn(mistakeIndex) : null;
}

/**
 * Replay one committed mistake demo headlessly through the production stack.
 * `traceName` is the committed file's basename without ".trace.json"
 * (e.g. "mistake-tailgate"). Throws for a template outside the registry.
 */
export function replayPilotMistake(
  templateId: string,
  districtRaw: unknown,
  traceName: string,
): RecordedDrive {
  const replay = Object.hasOwn(REGISTRY, templateId) ? REGISTRY[templateId] : undefined;
  if (!replay) {
    throw new Error(
      `clipReplay: no replay recorder registered for "${templateId}" — extend sim/traces/clipReplay.ts`,
    );
  }
  return replay(districtRaw, traceName);
}
