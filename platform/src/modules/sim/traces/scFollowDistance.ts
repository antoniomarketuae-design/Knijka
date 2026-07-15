/**
 * sc-follow-distance — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дистанция на следване" (FO-01, steady-state
 * tailgating) on the committed fo-follow-v1 district, recorded with the
 * template's OWN staged lead car (brakingLeadCar sc-fd-lead — single truth,
 * imported from the template). The trace gate replays exactly these through the
 * production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a calm ~26 km/h follow that
 *     keeps the pinned ~13 m gap safely above the 2-second threshold for its
 *     speed);
 *   - „Лепене за предния": steady ~48 km/h behind the SAME 13 m gap grades
 *     EXACTLY FOLLOWING_TOO_CLOSE (under 1.3 s at that speed);
 *   - „Дистанцията се топи": starts safe at 26, accelerates to 48 without
 *     opening the gap → grades EXACTLY FOLLOWING_TOO_CLOSE.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The lead car paces AHEAD in the SAME lane;
 * its slam tier is authored out of reach in the template — it is deterministic
 * moving traffic, the gap the following rule exists for, not a braking drill.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_DISTANCE } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_DISTANCE_ID = "sc-follow-distance";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scFollowDistanceShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб се движи кола — следвай я спокойно на дистанция от поне 2 секунди." },
      { kind: "glance", mirror: "rear" },
      // ~26 km/h behind the pinned ~13 m lead: ~1.8 s of gap — comfortably safe.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "На 26 км/ч тези 13 метра са около 1,8 секунди — има време за реакция." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 230]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Дистанцията се държи в секунди, не в метри на око — брой „едно-и-две“." },
      { kind: "drive", points: [[X_LANE, 230], [X_LANE, 345]], targetKmh: 26 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с безопасна дистанция до предния." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Лепене за предния" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowDistanceMistakeTailgateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: залепен за предния на 48 км/ч — под секунда дистанция." },
      { kind: "glance", mirror: "rear" },
      // ~48 km/h behind the SAME ~13 m gap: ~1.0 s — sustained tailgating.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 160]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "На 48 км/ч трябва над два пъти по-голяма дистанция — 13 метра са опасно малко." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ако предният спре рязко, тук няма никакъв шанс за спиране — изостани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Дистанцията се топи" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowDistanceMistakeGapMeltsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията беше добра, но с ускоряването се стопи." },
      { kind: "glance", mirror: "rear" },
      // Safe at 26, then accelerate to 48 WITHOUT dropping back — the same 13 m
      // becomes sub-second at speed.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "Стрелката се качва, но дистанцията остава същата — грешка." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ускоряваш ли, изостани още — метрите остават същите, а нужната дистанция расте." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowDistanceTraceName =
  | "shadow-correct"
  | "mistake-tailgate"
  | "mistake-gap-melts";

const SCRIPTS: Record<
  ScFollowDistanceTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowDistanceShadowScript },
  "mistake-tailgate": { kind: "mistake", script: scFollowDistanceMistakeTailgateScript },
  "mistake-gap-melts": { kind: "mistake", script: scFollowDistanceMistakeGapMeltsScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — the
 * TEMPLATE's staged lead car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFollowDistanceDrive(
  districtRaw: unknown,
  name: ScFollowDistanceTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_DISTANCE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_DISTANCE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
