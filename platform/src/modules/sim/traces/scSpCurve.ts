/**
 * sc-sp-curve — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Скорост в завой" (SP-05, curve overspeed — the SWOV
 * novice loss-of-control archetype) on the committed sp-curve-v1 district
 * (the FIRST rural-curve map: extra-urban 1+1 posted 90, a 90° arc at R 170
 * carrying the curveAdvisory zone span, advisory 50 under the А1 warning).
 * No staged actors, ambient traffic ZERO (seed 7), dry daylight.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — 85 km/h on the legal 90
 *     approach, braked to ~48 BEFORE the arc, held steady through it,
 *     accelerating out („спирачките работят на правата, не в завоя");
 *   - „Със скоростта от правата": holding ~70 km/h through the advisory-50
 *     arc grades EXACTLY SPEED_TOO_FAST_FOR_CURVE (once — one act, one bill;
 *     70 < 90 keeps every SPEEDING_* code silent, the honest single-code demo);
 *   - „Спиране В завоя": carrying ~85 to the arc ENTRY and braking only in
 *     the arc, down to ~62 — still above the advisory envelope the whole way
 *     through → the SAME code (the taught anti-pattern: braking in the curve).
 *
 * TURN-DETECTOR interplay (the no-double-bill proof, generator header math):
 * the map has ZERO intersections (the junction gate never opens) and even the
 * heading-rate math stays far under 55°/3 s at every authored speed — the
 * trace gate asserts the guilty codes are EXACTLY the curve code.
 *
 * RECORDER curve-cap honesty (traces/recorder.ts): the kinematic cap on the
 * inside-lane arc (R 165.94) is √(2.4·165.94)·3.6 ≈ 71.8 km/h — the guilty
 * 70 km/h target sits under it, so the demo records the AUTHORED speed.
 *
 * Geometry pinned to content/world/sp-curve-v1.json:
 *   approach on x = 0 (right-lane center x = 4.06, spawn spc-spawn-approach
 *   (4.06, 15) heading north), arc center (170, 220) — inside-lane radius
 *   165.94 — exit lane y = 385.94 east, limit 90, advisory 50 @ [220, 487.02].
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SP_CURVE } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_CURVE_ID = "sc-sp-curve";

/** Northbound right-lane center of the sp-curve-v1 approach. */
const X_LANE = 4.06;
/** Arc center + the inside-lane radius (map centerline R 170 − lane 4.06). */
const ARC_CX = 170;
const ARC_CY = 220;
const ARC_R_LANE = 165.94;
/** Exit-leg lane center (southern lane of the eastbound straight). */
const EXIT_Y = 385.94;

/** The inside-lane arc as a chorded polyline, 2.5° steps (the map's law). */
function arcLanePoints(): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= 36; i++) {
    const th = ((i * 2.5) * Math.PI) / 180;
    pts.push([ARC_CX - ARC_R_LANE * Math.cos(th), ARC_CY + ARC_R_LANE * Math.sin(th)]);
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpCurveShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Извънградски път, ограничение 90 — но напред има обозначен завой." },
      { kind: "glance", mirror: "rear" },
      // The legal rural cruise on the free straight.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 85, stopAtEnd: false },
      { kind: "annotation", textBg: "Знак А1 с табела „50“ — свали скоростта ПРЕДИ завоя, на правата." },
      // Braked to the advisory well before the arc entry (85 → 48 in ~41 m).
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 220]], targetKmh: 48, stopAtEnd: false },
      // Steady at ~48 through the whole marked arc — no brakes, no throttle.
      { kind: "drive", points: arcLanePoints(), targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Равномерно през дъгата — сцеплението остава изцяло за завиването." },
      // Accelerating out once the wheel straightens.
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [340, EXIT_Y]], targetKmh: 70 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намаляване преди завоя, равномерна дъга, газ на излизане." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Със скоростта от правата" (SPEED_TOO_FAST_FOR_CURVE)
// ---------------------------------------------------------------------------

export function scSpCurveMistakeHoldSpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: табелата препоръчва 50, а водачът само леко вдига газта — 70 в завоя.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140]], targetKmh: 85, stopAtEnd: false },
      // A token lift (85 → 70) instead of real braking — still 20 over the advisory.
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 220]], targetKmh: 70, stopAtEnd: false },
      { kind: "annotation", textBg: "20 км/ч над препоръчителното: в дъгата не остава резерв за нищо." },
      { kind: "drive", points: arcLanePoints(), targetKmh: 70, stopAtEnd: false },
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [340, EXIT_Y]], targetKmh: 70 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Правилно: свали до 50 още на правата и дръж равномерно през завоя." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спиране В завоя" (SPEED_TOO_FAST_FOR_CURVE)
// ---------------------------------------------------------------------------

export function scSpCurveMistakeBrakeLateScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: намаляването остава за самия завой — колата лети до входа му с 85.",
      },
      { kind: "glance", mirror: "rear" },
      // Full speed all the way TO the arc entry — the braking never happened
      // on the straight.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 220]], targetKmh: 85, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирачка В дъгата: сцеплението се дели между спиране и завиване." },
      // Braking IN the curve, and only down to ~62 — never under the envelope.
      { kind: "drive", points: arcLanePoints(), targetKmh: 62, stopAtEnd: false },
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [340, EXIT_Y]], targetKmh: 70 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Цялото намаляване се прави ПРЕДИ завоя — в дъгата кракът стои спокоен." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpCurveTraceName = "shadow-correct" | "mistake-hold-speed" | "mistake-brake-late";

const SCRIPTS: Record<
  ScSpCurveTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpCurveShadowScript },
  "mistake-hold-speed": { kind: "mistake", script: scSpCurveMistakeHoldSpeedScript },
  "mistake-brake-late": { kind: "mistake", script: scSpCurveMistakeBrakeLateScript },
};

/**
 * Record one of the three drives against a loaded sp-curve-v1 document — dry
 * daylight, no staged actors, ambient traffic zero. Deterministic: same
 * district → same trace.
 */
export function recordScSpCurveDrive(
  districtRaw: unknown,
  name: ScSpCurveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_CURVE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SP_CURVE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
