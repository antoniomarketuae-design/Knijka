/**
 * sc-ov-lane-keeping — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Движение в средата на лентата" (OV-12 straddle +
 * OV-04 center-line touch) on the committed ov-lane-v1 district — since the
 * founder R3 redesign (doc 62 #46) an S-CURVE street (sway ±14 m over 300 m,
 * apex radius ≈ 160 m): holding the middle takes real steering, and the two
 * classic curve errors are genuinely committable. No staged actors, ambient
 * traffic ZERO (seed 7): the ONLY thing the rule engine can grade is the
 * driver's own lateral position in the lane.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (the whole S-curve held in the
 *     MIDDLE of the lane — the offset polylines track the curved lane center);
 *   - „Изнасяне към бордюра в левия завой": running wide through the western
 *     sway rides the curb-side lane edge (laneOffsetM ≈ −3.64) and grades
 *     EXACTLY POOR_LANE_KEEPING;
 *   - „Изплуване върху осевата в десния завой": under-steering the eastern
 *     sway drifts the car onto the осева (laneOffsetM ≈ +3.56 toward
 *     oncoming) and grades EXACTLY CENTER_LINE_TOUCHED.
 *
 * Geometry pinned to content/world/ov-lane-v1.json: centerline
 * x = 14·sin(2π·y/300) for y ∈ [0, 300]; the lane center rides 4.06 m right
 * of it (осева on the centerline, curb edge 8.125 m right). Spawn
 * ov-ln-spawn-approach ≈ (8.24, 13.91) heading ~16.4°, limit 50. The scripts
 * below REPLICATE the generator's curve math (tools/maps/gen_ov_lanekeep.mjs)
 * so every polyline stays lane-true along the whole sway.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 *   - POOR_LANE_KEEPING fires after laneKeepSustainSec = 3 s with |laneOffsetM|
 *     beyond laneKeepMaxOffsetM = 3.25 m, moving forward, when the specific
 *     center-line condition is NOT armed (so the toward-CURB offset grades it);
 *   - CENTER_LINE_TOUCHED fires after centerLineSustainSec = 3.5 s on a two-way
 *     edge, in the leftmost lane, with the offset toward oncoming beyond the
 *     same 3.25 m and the indicator off — and it SUPPRESSES the generic
 *     lane-keeping episode (one act, one code).
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

// ---------------------------------------------------------------------------
// The generator's curve math, replicated (gen_ov_lanekeep.mjs — the L7 twin)
// ---------------------------------------------------------------------------

/** S-curve amplitude and run of ov-lane-v1 (meta.scenario.params). */
const SWAY_M = 14;
const LENGTH_M = 300;
/** Lane-centre offset right of the centreline (meta.scenario.laneCenterRightM). */
const O_CENTER = 4.06;
/** Toward the curb edge: laneOffsetM ≈ −3.64 (past the 3.25 m tolerance). */
const O_CURB_EDGE = 7.7;
/** Toward the осева линия: laneOffsetM ≈ +3.56 (toward oncoming). */
const O_CENTER_LINE = 0.5;

function centerX(y: number): number {
  return SWAY_M * Math.sin((2 * Math.PI * y) / LENGTH_M);
}
function slope(y: number): number {
  return SWAY_M * ((2 * Math.PI) / LENGTH_M) * Math.cos((2 * Math.PI * y) / LENGTH_M);
}
/** Point `offsetM` right of the centreline at parameter y (unit right-normal). */
function offsetPoint(y: number, offsetM: number): readonly [number, number] {
  const dx = slope(y);
  const n = Math.hypot(dx, 1);
  return [centerX(y) + offsetM / n, y - (offsetM * dx) / n];
}
/** Lane-true polyline from y0 to y1 at a FIXED offset (10 m sampling). */
function lanePath(y0: number, y1: number, offsetM: number): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  const step = 10;
  for (let y = y0; y < y1; y += step) pts.push(offsetPoint(y, offsetM));
  pts.push(offsetPoint(y1, offsetM));
  return pts;
}
/** Polyline whose offset drifts linearly o0 → o1 across [y0, y1]. */
function driftPath(y0: number, y1: number, o0: number, o1: number): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  const step = 10;
  for (let y = y0; y < y1; y += step) {
    pts.push(offsetPoint(y, o0 + ((o1 - o0) * (y - y0)) / (y1 - y0)));
  }
  pts.push(offsetPoint(y1, o1));
  return pts;
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Улицата прави S-извивка — средата на лентата тук се ДЪРЖИ с волана, не се подарява." },
      { kind: "glance", mirror: "rear" },
      // The eastern (right-hand) bend, centred all the way.
      { kind: "drive", points: lanePath(15, 110, O_CENTER), targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Гледай далеч напред по средата на лентата — колата отива там, където гледаш." },
      // The reversal and the western (left-hand) bend, still centred.
      { kind: "drive", points: lanePath(110, 230, O_CENTER), targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Малки, ранни корекции — равни отстояния от осевата и от бордюра през целия завой." },
      { kind: "drive", points: lanePath(230, 285, O_CENTER), targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата S-извивка центрирано в лентата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изнасяне към бордюра в левия завой" (POOR_LANE_KEEPING)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingMistakeStraddleScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: в левия завой воланът не води колата — и тя се изнася навън, към бордюра." },
      { kind: "glance", mirror: "rear" },
      // Correct through the right-hand bend…
      { kind: "drive", points: lanePath(15, 150, O_CENTER), targetKmh: 32, stopAtEnd: false },
      // …then the left-hand bend carries the car wide: drift to the curb edge…
      { kind: "drive", points: driftPath(150, 175, O_CENTER, O_CURB_EDGE), targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата се вози до дясната маркировка — страничният резерв към бордюра е изяден." },
      // …and ride it (|laneOffset| ≈ 3.64 > 3.25, sustained ≫ 3 s).
      { kind: "drive", points: lanePath(175, 285, O_CURB_EDGE), targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дръж средата с ранни, малки корекции — изнасянето навън е същата грешка като срязването." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изплуване върху осевата в десния завой" (CENTER_LINE_TOUCHED)
// ---------------------------------------------------------------------------

export function scOvLaneKeepingMistakeCenterLineScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: в десния завой колата „изплува“ навън — върху осевата линия, към насрещните." },
      { kind: "glance", mirror: "rear" },
      // Rolling off centred…
      { kind: "drive", points: lanePath(15, 40, O_CENTER), targetKmh: 32, stopAtEnd: false },
      // …the right-hand bend under-steered: drift onto the осева…
      { kind: "drive", points: driftPath(40, 65, O_CENTER, O_CENTER_LINE), targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Класическото недозавиване: осевата е под лявото колело, точно срещу насрещните." },
      // …and ride it through the bend (offset ≈ +3.56 toward oncoming, ≫ 3.5 s).
      { kind: "drive", points: lanePath(65, 160, O_CENTER_LINE), targetKmh: 30, stopAtEnd: false },
      // Recovery: back to the middle through the left-hand bend.
      { kind: "drive", points: driftPath(160, 185, O_CENTER_LINE, O_CENTER), targetKmh: 32, stopAtEnd: false },
      { kind: "drive", points: lanePath(185, 285, O_CENTER), targetKmh: 34 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Води колата през завоя, не я оставяй да се носи — осевата линия не се настъпва." },
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
