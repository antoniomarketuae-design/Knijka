/**
 * sc-ov-keep-right — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дръж вдясно" on the committed ov-keepright-v1
 * district — the founder R3 redesign (doc 62 #45: the drill SPAWNS IN THE LEFT
 * LANE, so coming home is an actual mirror-signal-move lane change). No staged
 * actors, ambient traffic ZERO (seed 7): the ONLY thing the rule engine can
 * grade is the driver's own lane change.
 *
 * FOUNDER RULING 2026-10-01 «KEEP-RIGHT FOLLOWS THE LAW» re-scoped the
 * mistakes. ov-keepright-v1 is a TOWN street (2+2, posted 50 by tag, dressed
 * as a street — not an извънградски път), so ЗДвП чл. 15, ал. 2, т. 2 lets
 * the driver use the most convenient lane there and NOT_KEEPING_RIGHT no
 * longer bills it. The two left-lane «hog» demos therefore demonstrated no
 * offence. The map has no out-of-settlement or > 80 multi-lane road to move
 * to (the repo's only such roads are the motorway maps, whose left-lane hog
 * sc-mw-discipline already teaches), so the drill keeps its act — coming home
 * from the left lane — and its demos now show the two ways that act really
 * goes wrong, under the law that binds on EVERY road (чл. 25, ал. 1; чл. 26):
 *
 *   - shadow: ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE (rolls off in
 *     the LEFT lane, right mirror → right indicator → moves to the RIGHT lane,
 *     cruises home laneId 0) — samples unchanged since R3;
 *   - „Престрояване надясно без мигач": the same move with the right-mirror
 *     glance and NO indicator → EXACTLY LANE_CHANGE_WITHOUT_INDICATOR;
 *   - „Престрояване без поглед в огледалото": the same move with the right
 *     indicator and NO glance → EXACTLY LANE_CHANGE_WITHOUT_MIRROR_CHECK.
 *
 * Geometry pinned to content/world/ov-keepright-v1.json: a 2+2 straight
 * boulevard on y ∈ [0, 360], RIGHT-lane center x = 12.19, LEFT-lane center
 * x = 4.06 (lane boundary x = 8.125), spawn ov-kr-spawn-left (4.06, 15)
 * heading north, limit 50 km/h.
 *
 * Rule envelope (rules/engine.ts §3, cfg defaults): the lane-change codes ride
 * the laneId delta at ≥ 10 km/h — indicatorOk = a matching-direction signal
 * within the indicator lookback, mirrorOk = a matching-SIDE glance within the
 * mirror lookback (a "rear" glance does not count for a rightward change, so
 * the no-mirror demo takes none at all).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_KEEP_RIGHT } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_KEEP_RIGHT_ID = "sc-ov-keep-right";

/** Right-lane (cruise) and left-lane (spawn) centers of ov-keepright-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — mirror, signal, come home
// ---------------------------------------------------------------------------

export function scOvKeepRightShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Започваш в ЛЯВАТА лента. Задачата е да се прибереш в дясната — по реда на всяко престрояване." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 45]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Дясната е свободна: огледало, десен мигач — и плавно вдясно." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      // The move: across the 8.125 m lane boundary.
      { kind: "drive", points: [[X_LEFT, 45], [8.0, 62], [X_RIGHT, 80]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово — в дясната лента, а мигачът е изключен веднага след маневрата." },
      { kind: "drive", points: [[X_RIGHT, 80], [X_RIGHT, 200]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Тук, в града, лентата е по избор (чл. 15, ал. 2, т. 2) — извън населено място или над 80 км/ч дясната е задължителна (ал. 1)." },
      { kind: "drive", points: [[X_RIGHT, 200], [X_RIGHT, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: една маневра — огледало, мигач, вдясно — и отсечката в лентата, която задачата поиска." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Престрояване надясно без мигач" (LANE_CHANGE_WITHOUT_INDICATOR)
// ---------------------------------------------------------------------------

export function scOvKeepRightMistakeNoIndicatorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се прибира от лявата в дясната лента — без нито един мигач." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 45]], targetKmh: 35, stopAtEnd: false },
      // The mirror IS checked (mirrorOk holds, so the _MIRROR_CHECK code cannot
      // leak) — the isolated fault is the dark stalk.
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LEFT, 45], [8.0, 62], [X_RIGHT, 80]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Огледалото е проверено — но отвън никой не разбра какво е решил водачът. Мигачът обявява маневрата ПРЕДИ нея (чл. 26)." },
      { kind: "drive", points: [[X_RIGHT, 80], [X_RIGHT, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Преди всяко отклонение встрани — своевременен мигач (чл. 26), а преди него огледало и поглед през рамо (чл. 25, ал. 1)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Престрояване без поглед в огледалото" (LANE_CHANGE_WITHOUT_MIRROR_CHECK)
// ---------------------------------------------------------------------------

export function scOvKeepRightMistakeNoMirrorScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: десният мигач светва — но погледът остава напред." },
      // NO glance of any kind: a "rear" one would not count for a rightward
      // change anyway, and the demo's own words say «без поглед».
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 45]], targetKmh: 35, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[X_LEFT, 45], [8.0, 62], [X_RIGHT, 80]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Воланът тръгна надясно без поглед в дясното огледало и през рамо — мигачът обявява, но не проверява дали лентата е свободна." },
      { kind: "drive", points: [[X_RIGHT, 80], [X_RIGHT, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Огледало, мигач, поглед през рамо — и чак тогава волан: преди маневрата се убеждаваш, че няма да създадеш опасност (чл. 25, ал. 1)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvKeepRightTraceName = "shadow-correct" | "mistake-no-indicator" | "mistake-no-mirror";

const SCRIPTS: Record<
  ScOvKeepRightTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvKeepRightShadowScript },
  "mistake-no-indicator": { kind: "mistake", script: scOvKeepRightMistakeNoIndicatorScript },
  "mistake-no-mirror": { kind: "mistake", script: scOvKeepRightMistakeNoMirrorScript },
};

/**
 * Record one of the three drives against a loaded ov-keepright-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScOvKeepRightDrive(
  districtRaw: unknown,
  name: ScOvKeepRightTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_KEEP_RIGHT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_KEEP_RIGHT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
