/**
 * sc-ov-lane-keeping — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Движение в средата на лентата" (OV-12 straddle + OV-04
 * center-line touch) on the committed ov-lane-v1 district. No staged actors,
 * ambient traffic ZERO (seed 7): the ONLY thing the rule engine can grade is the
 * driver's own lateral position in the lane.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (the whole street held in the
 *     MIDDLE of the lane, laneOffsetM ≈ 0);
 *   - „Возене встрани от средата": riding the lane edge toward the curb
 *     (laneOffsetM ≈ −3.64) grades EXACTLY POOR_LANE_KEEPING;
 *   - „Настъпване на осевата линия": riding the center line toward oncoming
 *     (laneOffsetM ≈ +3.56) grades EXACTLY CENTER_LINE_TOUCHED.
 *
 * Geometry pinned to content/world/ov-lane-v1.json: a 1+1 straight street on
 * y ∈ [0, 300], right-lane center x = 4.06 (осева линия on x = 0, curb edge on
 * x = 8.125), spawn ov-ln-spawn-approach (4.06, 15) heading north, limit 50.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 *   - POOR_LANE_KEEPING fires after laneKeepSustainSec = 3 s with |laneOffsetM|
 *     beyond laneKeepMaxOffsetM = 3.25 m, moving forward, when the specific
 *     center-line condition is NOT armed (so the toward-CURB offset grades it);
 *   - CENTER_LINE_TOUCHED fires after centerLineSustainSec = 3.5 s on a two-way
 *     edge (oneway=false), in the leftmost lane, with the offset toward oncoming
 *     beyond the same 3.25 m and the indicator off — and it SUPPRESSES the
 *     generic lane-keeping episode (one act, one code).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_LANE_KEEPING } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_LANE_KEEPING_ID = "sc-ov-lane-keeping";

/** Lane centre + the two off-centre positions of ov-lane-v1. */
const X_CENTER = 4.06;
/** Toward the curb: laneOffsetM ≈ −3.64 (past the 3.25 m tolerance). */
const X_CURB_EDGE = 7.7;
/** Toward the осева линия: laneOffsetM ≈ +3.56 (toward oncoming). */
const X_CENTER_LINE = 0.5;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Права улица — дръж колата в СРЕДАТА на своята лента." },
      { kind: "glance", mirror: "rear" },
      // Centre of the lane (x = 4.06 — laneOffsetM ≈ 0) the whole way.
      { kind: "drive", points: [[X_CENTER, 15], [X_CENTER, 105], [X_CENTER, 160]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Гледай далеч напред по средата на лентата, не в предния капак." },
      { kind: "drive", points: [[X_CENTER, 160], [X_CENTER, 225]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Равномерно разстояние и от осевата линия, и от бордюра — с малки, ранни корекции." },
      { kind: "drive", points: [[X_CENTER, 225], [X_CENTER, 285]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка центрирано в лентата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Возене встрани от средата" (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingMistakeStraddleScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се движи встрани от средата — опряна до дясната маркировка." },
      { kind: "glance", mirror: "rear" },
      // Ride the curb-side lane edge (x = 7.7 — offset ≈ −3.64) the whole way:
      // sustained off-centre → POOR_LANE_KEEPING (center-line cond NOT armed).
      { kind: "drive", points: [[X_CURB_EDGE, 15], [X_CURB_EDGE, 110], [X_CURB_EDGE, 175]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Неустойчивото движение встрани те прави непредвидим и изяжда страничния резерв." },
      { kind: "drive", points: [[X_CURB_EDGE, 175], [X_CURB_EDGE, 285]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Върни се в средата на лентата — малки, ранни корекции на волана, поглед далеч напред." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Настъпване на осевата линия" (CENTER_LINE_TOUCHED)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingMistakeCenterLineScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се движи върху осевата линия, към насрещните." },
      { kind: "glance", mirror: "rear" },
      // Ride the center line (x = 0.5 — offset ≈ +3.56 toward oncoming) the
      // whole way: sustained → CENTER_LINE_TOUCHED (suppresses lane-keeping).
      { kind: "drive", points: [[X_CENTER_LINE, 15], [X_CENTER_LINE, 110], [X_CENTER_LINE, 175]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Настъпването на осевата линия навлиза в пространството на насрещните — класическа второстепенна грешка." },
      { kind: "drive", points: [[X_CENTER_LINE, 175], [X_CENTER_LINE, 285]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дръж се в средата на своята лента — осевата линия не се настъпва." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvLaneKeepingTraceName =
  | "shadow-correct"
  | "mistake-straddle"
  | "mistake-center-line";

const SCRIPTS: Record<
  ScOvLaneKeepingTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvLaneKeepingShadowScript },
  "mistake-straddle": { kind: "mistake", script: scOvLaneKeepingMistakeStraddleScript },
  "mistake-center-line": { kind: "mistake", script: scOvLaneKeepingMistakeCenterLineScript },
};

/**
 * Record one of the three drives against a loaded ov-lane-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScOvLaneKeepingDrive(
  districtRaw: unknown,
  name: ScOvLaneKeepingTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_LANE_KEEPING_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_LANE_KEEPING.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
