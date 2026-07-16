/**
 * sc-follow-truck — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Зад камион" (FO-06, following a vision-blocking box
 * truck) on the committed fo-follow-v1 district, recorded with the template's
 * OWN staged lead truck (brakingLeadCar sc-ft-lead, `profile: "truck"` — the
 * large-vehicle actor profile; single truth, imported from the template). The
 * trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a calm ~20 km/h follow behind
 *     the pinned ~17 m gap — about 3 seconds at that speed, the increased
 *     blocked-vision distance the lesson teaches);
 *   - „Залепен зад камиона": steady ~48 km/h behind the SAME 17 m grades
 *     EXACTLY FOLLOWING_TOO_CLOSE (~1 s at that speed — with zero forward
 *     vision);
 *   - „Доближаване „за да виждаш"": starts prudent at 20, accelerates to 48
 *     trying to peek past the truck without dropping back → grades EXACTLY
 *     FOLLOWING_TOO_CLOSE.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The truck paces AHEAD in the SAME lane
 * (matchPlayer, gap pinned); its slam tier is authored out of reach in the
 * template — deterministic moving traffic whose whole hazard is the sight line
 * it takes away, not a braking drill. The profile is visual+data only: the
 * leadGap detector stays point-based (doc 72 FO-06 "zero grading change").
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_TRUCK } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_TRUCK_ID = "sc-follow-truck";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scFollowTruckShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб се движи камион — той закрива целия обзор напред. Изостани на поне 3 секунди." },
      { kind: "glance", mirror: "rear" },
      // ~20 km/h behind the pinned ~17 m lead: ~3 s of gap — the increased
      // blocked-vision distance.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Виждаш само задната врата на камиона — тези 3 секунди са времето ти за реакция на невидимото." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 230]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Не се доближавай, „за да виждаш“ — по-близо значи по-малко видимост и по-малко време." },
      { kind: "drive", points: [[X_LANE, 230], [X_LANE, 345]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: целият участък зад камиона — на дистанция, която връща изгубената видимост." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Залепен зад камиона" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowTruckMistakeTailgateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: 48 км/ч на около секунда зад камиона — при нулева видимост напред." },
      { kind: "glance", mirror: "rear" },
      // ~48 km/h behind the SAME ~17 m gap: ~1 s — sustained tailgating with
      // the entire road ahead hidden by the box.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 160]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Каквото и да спре камиона, ти ще го разбереш последен — и без никакво време за спиране." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Зад камион дистанцията се увеличава, не се топи — изостани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Доближаване „за да виждаш"" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowTruckMistakePeekScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията беше добра, но колата ускорява към камиона — уж за да „вижда“." },
      { kind: "glance", mirror: "rear" },
      // Prudent at 20, then accelerate to 48 WITHOUT dropping back — the same
      // 17 m becomes ~1 second, and the wall of the box only gets bigger.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Колкото по-близо до задната врата, толкова ПО-МАЛКО път се вижда." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Видимостта зад камион се купува само с дистанция — изостани още." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowTruckTraceName =
  | "shadow-correct"
  | "mistake-tailgate"
  | "mistake-peek";

const SCRIPTS: Record<
  ScFollowTruckTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowTruckShadowScript },
  "mistake-tailgate": { kind: "mistake", script: scFollowTruckMistakeTailgateScript },
  "mistake-peek": { kind: "mistake", script: scFollowTruckMistakePeekScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — the
 * TEMPLATE's staged lead truck armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFollowTruckDrive(
  districtRaw: unknown,
  name: ScFollowTruckTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_TRUCK_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_TRUCK.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
