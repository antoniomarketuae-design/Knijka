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

import type { RecordedDrive } from "./recorder";
import { recordScAcNightLightsDrive, type ScAcNightLightsTraceName } from "./scAcNightLights";
import { recordScAcRainLightsDrive, type ScAcRainLightsTraceName } from "./scAcRainLights";
import { recordScEdD2CityRunDrive, type ScEdD2CityRunTraceName } from "./scEdD2CityRun";
import { recordScFollowDistanceDrive, type ScFollowDistanceTraceName } from "./scFollowDistance";
import { recordScJunctionDrive, type ScJunctionTraceName } from "./scJunctions";
import { recordScLaneChangeDrive, type ScLaneChangeTraceName } from "./scLaneChange";
import { recordScMwDisciplineDrive, type ScMwDisciplineTraceName } from "./scMwDiscipline";
import { recordScOvBanOvertakeDrive, type ScOvBanOvertakeTraceName } from "./scOvBanOvertake";
import { recordScOvOneWayDrive, type ScOvOneWayTraceName } from "./scOvOneWay";
import { recordScOvSolidLineDrive, type ScOvSolidLineTraceName } from "./scOvSolidLine";
import { recordScParkPerpRevDrive, type ScParkPerpRevTraceName } from "./scParkPerpRev";
import { recordScPkBanStopDrive, type ScPkBanStopTraceName } from "./scPkBanStop";
import { recordScRoundaboutEntryDrive, type ScRoundaboutEntryTraceName } from "./scRoundaboutEntry";
import { recordScRxUnguardedDrive, type ScRxUnguardedTraceName } from "./scRxUnguarded";
import { recordScSpeedCreepDrive, type ScSpeedCreepTraceName } from "./scSpeedCreep";
import { recordScSpeedRainDrive, type ScSpeedRainTraceName } from "./scSpeedRain";
import { recordScVpReadinessDrive, type ScVpReadinessTraceName } from "./scVpReadiness";
import { recordScVuEmergencyDrive, type ScVuEmergencyTraceName } from "./scVuEmergency";
import { recordScZebraApproachDrive, type ScZebraApproachTraceName } from "./scZebraApproach";

type Replayer = (districtRaw: unknown, traceName: string) => RecordedDrive;

/** templateId → its authored recorder. Trace names are validated by the
 *  recorders themselves (unknown name → the recorder's own throw). */
const REGISTRY: Readonly<Record<string, Replayer>> = {
  "sc-ac-night-lights": (d, n) => recordScAcNightLightsDrive(d, n as ScAcNightLightsTraceName),
  "sc-ac-rain-lights": (d, n) => recordScAcRainLightsDrive(d, n as ScAcRainLightsTraceName),
  "sc-ed-d2-city-run": (d, n) => recordScEdD2CityRunDrive(d, n as ScEdD2CityRunTraceName),
  "sc-follow-distance": (d, n) => recordScFollowDistanceDrive(d, n as ScFollowDistanceTraceName),
  "sc-junction-stop": (d, n) => recordScJunctionDrive(d, "sc-junction-stop", n as ScJunctionTraceName),
  "sc-lane-change": (d, n) => recordScLaneChangeDrive(d, n as ScLaneChangeTraceName),
  "sc-mw-discipline": (d, n) => recordScMwDisciplineDrive(d, n as ScMwDisciplineTraceName),
  "sc-ov-ban-overtake": (d, n) => recordScOvBanOvertakeDrive(d, n as ScOvBanOvertakeTraceName),
  "sc-ov-oneway": (d, n) => recordScOvOneWayDrive(d, n as ScOvOneWayTraceName),
  "sc-ov-solid-line": (d, n) => recordScOvSolidLineDrive(d, n as ScOvSolidLineTraceName),
  "sc-park-perp-rev": (d, n) => recordScParkPerpRevDrive(d, n as ScParkPerpRevTraceName),
  "sc-pk-ban-stop": (d, n) => recordScPkBanStopDrive(d, n as ScPkBanStopTraceName),
  "sc-roundabout-entry": (d, n) => recordScRoundaboutEntryDrive(d, n as ScRoundaboutEntryTraceName),
  "sc-rx-unguarded": (d, n) => recordScRxUnguardedDrive(d, n as ScRxUnguardedTraceName),
  "sc-speed-creep": (d, n) => recordScSpeedCreepDrive(d, n as ScSpeedCreepTraceName),
  "sc-speed-rain": (d, n) => recordScSpeedRainDrive(d, n as ScSpeedRainTraceName),
  "sc-vp-readiness": (d, n) => recordScVpReadinessDrive(d, n as ScVpReadinessTraceName),
  "sc-vu-emergency": (d, n) => recordScVuEmergencyDrive(d, n as ScVuEmergencyTraceName),
  "sc-zebra-approach": (d, n) => recordScZebraApproachDrive(d, n as ScZebraApproachTraceName),
};

/** The templates this registry can replay, sorted (introspection/tests). */
export function clipReplayTemplateIds(): string[] {
  return Object.keys(REGISTRY).sort();
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
