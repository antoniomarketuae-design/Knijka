/**
 * sc-pe-school-patrol — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Училищна пътека със стоп-палка" (PE-07 + PE-02) on
 * the committed pe-school-v1 district, recorded with the template's OWN staged
 * actors (the policeStop warden + the pedestrianDartOut child group — single
 * truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED — entered the зона 30 at
 *     the zone's speed, stopped short of the zebra on the paddle, waited the
 *     group off the carriageway, moved off clean (the warden's outcome
 *     channel reads "yielded" — the paddle was obeyed);
 *   - „Подминаване на вдигната стоп-палка" grades EXACTLY
 *     PEDESTRIAN_NOT_YIELDED (a LAWFUL 26 km/h through the occupied crossing:
 *     no speeding, no too-fast, no contact — the group is still on the western
 *     half, the sc-pe-jaywalker precedent);
 *   - „Бърз подход" grades EXACTLY SPEEDING_OVER_LIMIT (holds ~38 km/h in the
 *     30 zone — above the 33 grace, below the 40 dangerous band — through the
 *     map's SPEED-ONLY WINDOW, then yields correctly for the children).
 *
 * Geometry pinned to content/world/pe-school-v1.json: the street on x = 0
 * (right lane 4.06), the 50 → 30 school-zone entry at y = 140, the zebra
 * pes-x-1 at y = 250, the halt at y = 244, street end y = 310.
 *
 * THE SPEED-ONLY WINDOW (why the „бърз подход" demo can assert exactly one
 * code): the crossing zone arms ~35 m out (y = 215) and the child group is
 * released at trigger 40 m (y = 210) — so between the zone entry (140) and
 * y = 215 there is NO crossing event and NO pedestrian seen. The speeding
 * episode (2 s sustain ⇒ ~21 m at 38 km/h) completes and resets inside that
 * 75 m window, so no crossing code can pile onto it. pe-school-districts.test
 * asserts that window as a structural invariant of the map.
 *
 * Child-group timing (speedMps 1.1 from the west curb, released at y = 210):
 * on the carriageway ~1.45 s later, reaches the player's lane (x ≈ 4.06)
 * ~12.5 s after release, off the road at ~16.2 s, walk finished at ~21.3 s.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PE_SCHOOL_PATROL } from "../lessons/scenario/templates-pe2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PE_SCHOOL_PATROL_ID = "sc-pe-school-patrol";

/** Northbound right-lane center of pe-school-v1's street. */
const X_LANE = 4.06;
/** The 50 → 30 school-zone entry (pes-n-mid). */
const Y_ZONE = 140;
/** The staged zebra (pes-x-1). */
const Y_CROSSING = 250;
/** The compliant halt — 6 m short of the zebra (single truth with the spec). */
const Y_HALT = Y_CROSSING - 6;
/** The finish checkpoint (sc-pesp-clear at y = 290, radius 12). */
const Y_FINISH = 292;
/** Zone speed a competent driver holds: 26 — under 30 with eye-error room. */
const ZONE_KMH = 26;
/** Approach speed in the 50 segment (under the 55 grace). */
const APPROACH_KMH = 46;
/** Long enough to wait the group off the carriageway (~16.2 s from release). */
const WAIT_SEC = 13;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPeSchoolPatrolShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Улица край училище. Знакът за зона 30 идва — скоростта се сваля ПРЕДИ него, не след него.",
      },
      { kind: "glance", mirror: "rear" },
      // The 50 segment, lawfully.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60], [X_LANE, 110]], targetKmh: APPROACH_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Влизаш в училищната зона: 30 означава 30, а не „около 30“." },
      // Shed the boulevard speed BEFORE the entry at y = 140 — the whole lesson
      // of the зона-30 regime (and the sc-pesp-zone gate at y = 170, ≤ 30).
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 138]], targetKmh: ZONE_KMH, stopAtEnd: false },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, 138], [X_LANE, 200]], targetKmh: ZONE_KMH, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Отговорникът вдига стоп-палката — групата тръгва. Палката е разпореждане, не молба.",
      },
      // Stop 6 m short of the zebra — where the чл. 119 duty puts you, and
      // where the warden's halt point sits (single truth with the objective).
      { kind: "drive", points: [[X_LANE, 200], [X_LANE, Y_HALT]], targetKmh: ZONE_KMH },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      {
        kind: "annotation",
        textBg: "Изчакай ЦЯЛАТА група да освободи платното — децата не вървят в права линия.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Потегли плавно едва когато палката е свалена и пътеката е чиста." },
      { kind: "drive", points: [[X_LANE, Y_HALT], [X_LANE, 275], [X_LANE, Y_FINISH]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: 30 в зоната, пълно спиране на палката, потегляне след чиста пътека.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подминаване на вдигната стоп-палка" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scPeSchoolPatrolMistakeIgnoredPaddleScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „палката е за другите“ — колата не спира, макар децата вече да са на платното.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60], [X_LANE, 110]], targetKmh: APPROACH_KMH, stopAtEnd: false },
      // The ONLY fault this demo shows is the refusal to yield: the zone speed
      // itself is lawful the whole way (26 in a 30), so nothing else can grade.
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 138]], targetKmh: ZONE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Палката е вдигната, групата е стъпила — а колата продължава…" },
      {
        // Straight over the occupied crossing at a lawful 26: the group is on
        // the WESTERN half (~7 m away) — pure „непропускане", no contact.
        kind: "drive",
        points: [[X_LANE, 138], [X_LANE, 200], [X_LANE, 285]],
        targetKmh: ZONE_KMH,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Стоп-палката се вдига именно защото хора са на пътеката. Подминаването е непропускане на пешеходец — чл. 119, прекратен изпит.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Бърз подход към зоната" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scPeSchoolPatrolMistakeFastApproachScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „30 е прекалено бавно“ — водачът сваля само малко и влиза в зоната с 38.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60], [X_LANE, 110]], targetKmh: APPROACH_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Знакът казва 30. Колата минава с 38 — над границата, но „нали е малко“." },
      // ~38 km/h: above the 33 grace, below the 40 dangerous band — the
      // SPEEDING_OVER_LIMIT band exactly. Held through the map's speed-only
      // window (y 140..215), so the 2 s sustain lands with no child in sight.
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 138]], targetKmh: 38, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 138], [X_LANE, 205]], targetKmh: 38, stopAtEnd: false },
      {
        kind: "annotation",
        textBg: "Стоп-палката се вдига. От 38 км/ч спирачният път е с ~40% по-дълъг, отколкото от 30.",
      },
      // The driver DOES stop for the group — the taught fault is the approach,
      // not the yield (that keeps this demo's assert to a single code).
      { kind: "drive", points: [[X_LANE, 205], [X_LANE, Y_HALT]], targetKmh: 24 },
      { kind: "pause", sec: WAIT_SEC, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_LANE, Y_HALT], [X_LANE, 275], [X_LANE, Y_FINISH]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спря навреме — този път. В зона 30 резервът за спиране е целият смисъл на ограничението: детето излиза, без да гледа.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPeSchoolPatrolTraceName =
  | "shadow-correct"
  | "mistake-ignored-paddle"
  | "mistake-fast-approach";

const SCRIPTS: Record<
  ScPeSchoolPatrolTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scPeSchoolPatrolShadowScript },
  "mistake-ignored-paddle": { kind: "mistake", script: scPeSchoolPatrolMistakeIgnoredPaddleScript },
  "mistake-fast-approach": { kind: "mistake", script: scPeSchoolPatrolMistakeFastApproachScript },
};

/**
 * Record one of the three drives against a loaded pe-school-v1 document — the
 * TEMPLATE's staged warden + child group armed (single truth), ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScPeSchoolPatrolDrive(
  districtRaw: unknown,
  name: ScPeSchoolPatrolTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PE_SCHOOL_PATROL_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PE_SCHOOL_PATROL.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
