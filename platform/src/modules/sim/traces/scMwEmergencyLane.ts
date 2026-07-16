/**
 * sc-mw-emergency-lane — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Аварийната лента" (ЗДвП чл. 58, т. 3 — the
 * motorway emergency-lane ban) on the committed mw-v1 district. No lane
 * actors, ambient traffic ZERO (seed 7): the ONLY hazard is a BROKEN-DOWN car
 * standing ON the emergency lane, staged as a recorder obstacle rect (the
 * sc-hazard-obstacle pattern — trace/demo data, NOT map data; the live map
 * hosts only the road).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — cruises the RIGHT travel
 *     lane (laneId 1), eases slightly passing the breakdown scene and NEVER
 *     touches the emergency lane (the obstacle rect proves no contact);
 *   - „Изпреварване през аварийната лента": a SIGNALLED drift into laneId 0
 *     held at speed for seconds grades EXACTLY EMERGENCY_LANE_DRIVING — the
 *     indicator does NOT exempt (contrast the bus lane), which is the point
 *     of the demo; the signalled lane changes themselves stay clean;
 *   - „Каране по аварийната лента": settles into laneId 0 and rides it for
 *     hundreds of metres — the same single code (one excursion, one bill),
 *     forced back to the travel lane by the stranded car ahead anyway.
 *
 * Both mistakes exit the emergency lane WELL BEFORE the breakdown at y = 780
 * (by y ≈ 700) — the demos teach the ban, not a crash; and both end within
 * 250 m of the recovery so no post-fault CLEAN_DRIVING can dilute the story.
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway on x = 0 — cruise lane (laneId 1) x = 0, emergency lane
 * (laneId 0) x = 8.13; spawn mw-spawn-approach (0, 15); limit 140; length
 * 1000. The breakdown car stands at (8.13, 780) heading north.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MW_EMERGENCY_LANE } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MW_EMERGENCY_LANE_ID = "sc-mw-emergency-lane";

/** mw-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CRUISE = 0;
const X_EMERG = 8.13;
/** The breakdown scene: a stalled car ON the emergency lane. */
const BREAKDOWN_Y = 780;

/** The stalled car the drives pass — the чл. 58 exception made visible. */
export function mwBreakdownRects(): ObstacleRect2D[] {
  return [
    {
      x: X_EMERG,
      y: BREAKDOWN_Y,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — pass the scene in the TRAVEL lane
// ---------------------------------------------------------------------------

export function scMwEmergencyLaneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала: вдясно от нас е аварийната лента — тя НЕ е лента за движение." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 430]], targetKmh: 110, stopAtEnd: false },
      { kind: "annotation", textBg: "Напред в аварийната лента стои аварирала кола — оставаме в своята лента и леко сваляме газта." },
      // Ease past the breakdown scene — defensive, still flow speed, laneId 1.
      { kind: "drive", points: [[X_CRUISE, 430], [X_CRUISE, 830]], targetKmh: 95, stopAtEnd: false },
      { kind: "annotation", textBg: "Подминахме, без да докоснем аварийната лента — тя остава свободна за помощта." },
      { kind: "drive", points: [[X_CRUISE, 830], [X_CRUISE, 955]], targetKmh: 105 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка в лентата за движение — аварийната е само за аварии." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване през аварийната лента" (EMERGENCY_LANE_DRIVING)
// ---------------------------------------------------------------------------

export function scMwEmergencyLaneMistakeUndertakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът решава да „изпревари“ отдясно — през аварийната лента." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 320]], targetKmh: 100, stopAtEnd: false },
      // Politely signalled — and still the fault: the indicator does not make
      // the emergency lane a travel lane.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_CRUISE, 320], [X_EMERG, 400]], targetKmh: 100, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Над 100 км/ч по лентата за принудително спиране — с мигач, но напълно забранено." },
      { kind: "drive", points: [[X_EMERG, 400], [X_EMERG, 620]], targetKmh: 105, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_EMERG, 620], [X_CRUISE, 700]], targetKmh: 100, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, 700], [X_CRUISE, 900]], targetKmh: 100 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Аварийната лента не е лента за изпреварване — там може да стои кола с хора около нея." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Каране по аварийната лента" (EMERGENCY_LANE_DRIVING)
// ---------------------------------------------------------------------------

export function scMwEmergencyLaneMistakeShoulderCruiseScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът се настанява в аварийната лента и я подкарва като „своя“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 240]], targetKmh: 90, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_CRUISE, 240], [X_EMERG, 320]], targetKmh: 90, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Стотици метри по лентата за принудително спиране — коридорът на линейката е зает." },
      { kind: "drive", points: [[X_EMERG, 320], [X_EMERG, 650]], targetKmh: 100, stopAtEnd: false },
      { kind: "annotation", textBg: "Спрялата напред аварирала кола така или иначе я връща в потока…" },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_EMERG, 650], [X_CRUISE, 730]], targetKmh: 95, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, 730], [X_CRUISE, 900]], targetKmh: 100 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Движението по аварийната лента е опасна грешка — дори когато изглежда празна." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMwEmergencyLaneTraceName =
  | "shadow-correct"
  | "mistake-undertake"
  | "mistake-shoulder-cruise";

const SCRIPTS: Record<
  ScMwEmergencyLaneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMwEmergencyLaneShadowScript },
  "mistake-undertake": { kind: "mistake", script: scMwEmergencyLaneMistakeUndertakeScript },
  "mistake-shoulder-cruise": { kind: "mistake", script: scMwEmergencyLaneMistakeShoulderCruiseScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — the
 * breakdown-car obstacle armed, ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScMwEmergencyLaneDrive(
  districtRaw: unknown,
  name: ScMwEmergencyLaneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MW_EMERGENCY_LANE_ID,
    kind,
    seed: 7,
    obstacles: mwBreakdownRects(),
    stagedEvents: [...(SC_MW_EMERGENCY_LANE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
