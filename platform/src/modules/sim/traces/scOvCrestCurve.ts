/**
 * sc-ov-crest-curve — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Забранено изпреварване преди било и завой" (doc 72
 * OV-06 ban × OV-05 corridor × SP-05 curve; ЗДвП чл. 43) on the committed
 * ov-crest-v1 district (extra-urban 1+1 posted 90: a 240 m approach, a 90° arc
 * at R 135 carrying В24 [150, 452.04] + А1 advisory-40 [240, 452.04], then a
 * 450 m straight where passing is LEGAL), recorded with the template's OWN
 * staged actors (single truth, imported from the template):
 *  - the slow TRUCK (brakingLeadCar sc-ovcc-lead, matchPlayer ~38 m ahead
 *    capped at 15.8 m/s ≈ 57 km/h — the „бавен камион" of q-manevri-012 and the
 *    car every drive here follows);
 *  - the oncoming stream (oncomingStream sc-ovcc-stream): TWO cars at 12 m/s
 *    southbound, released on the player's first movement — pure clockwork, both
 *    timed to sweep past INSIDE the arc.
 * Dry daylight, ambient traffic ZERO (seed 7).
 *
 * The trace gate replays exactly these through the production stack:
 *  - shadow: follows the truck at ~55 through the В24 approach, brakes to the
 *    А1 advisory BEFORE the bend, holds ~40 through the whole blind arc while
 *    both oncoming cars sweep past in their own lane, then passes in the legal
 *    straight → ZERO violations + CLEAN_DRIVING. On this 1+1 the bank flip
 *    renumbers no lane, so NO lane-change code (positive or negative) can
 *    exist — the pass's innocence is the corridor's silence (scOvNightGap's
 *    ruling, verbatim);
 *  - „Изпреварване в слепия завой": identical pacing right up to the bend, then
 *    pulls onto the oncoming bank mid-arc — where car 0 is closing head-on out
 *    of the curve — and holds it unbraked past YIELD_CONVICT_SUSTAIN_SEC →
 *    grades EXACTLY OVERTAKE_INSUFFICIENT_GAP (опасна). The pass runs at the
 *    advisory band's own speed (44 ≤ 40 + the engine's 5 km/h grace), so the
 *    curve code cannot leak in: the fault graded is the DECISION, not the
 *    speed. The staged car's playerGuard is what keeps the demo out of a
 *    collision — the gap-memory latch keeps the conviction honest against that
 *    rescue (worldRuntime OVERTAKE_GAP_MEMORY_SEC);
 *  - „Прекалена скорост в дъгата": never leaves its lane and never overtakes —
 *    it simply carries ~54 km/h into the advisory-40 arc → EXACTLY
 *    SPEED_TOO_FAST_FOR_CURVE. 54 sits under the truck's 57 km/h cap, so the
 *    truck keeps pace and no following fault can leak in; it sits under the
 *    recorder's √(2.4·R) curve cap (≈ 63.8 km/h on the inside lane), so the
 *    demo records at its AUTHORED speed; and it sits far under the posted 90,
 *    so every SPEEDING_* code stays silent.
 *
 * TURN-DETECTOR interplay (the no-double-bill proof, generator header math):
 * ov-crest-v1 has ZERO intersections (the junction gate never opens) and the
 * heading-rate math stays under 55°/3 s at every speed the limit allows — the
 * gate asserts the guilty codes are EXACTLY the authored ones.
 *
 * Geometry pinned to content/world/ov-crest-v1.json: approach on x = 0 (own
 * lane x = 4.06, spawn ovc-spawn-approach (4.06, 15) heading north), arc center
 * (135, 240) — inside-lane radius 130.94, oncoming-lane radius 139.06 — exit
 * leg east at y = 370.94 (own) / 379.06 (oncoming bank), road 902.04 m.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_CREST_CURVE } from "../lessons/scenario/templates-lanes2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_CREST_CURVE_ID = "sc-ov-crest-curve";

/** Northbound own-lane center of the ov-crest-v1 approach. */
const X_LANE = 4.06;
/** Arc center (map centerline R 135). */
const ARC_CX = 135;
const ARC_CY = 240;
/** Radii of the three lines every script rides through the bend:
 *  - OWN  (< 135) = the inside lane, the player's own bank;
 *  - OUT  (> 135) = the committed excursion line on the oncoming bank (the
 *    scOvNightGap X_OUT = −2.5 discipline: past the осева, short of the
 *    oncoming lane's own centre, so the pass is real but not suicidal). */
const R_OWN = 130.94;
const R_OUT = 137.5;
/** Exit-leg lines: own (eastbound) lane centre and the oncoming bank. */
const EXIT_Y = 370.94;
const EXIT_OUT_Y = 379.06;

/** A point on the bend at radius `r`, `deg` of sweep from the arc start. */
function arcAt(r: number, deg: number): readonly [number, number] {
  const th = (deg * Math.PI) / 180;
  return [ARC_CX - r * Math.cos(th), ARC_CY + r * Math.sin(th)];
}

/** The bend as a chorded polyline at radius `r`, 2.5° steps (the map's law). */
function arcPoints(r: number, fromDeg: number, toDeg: number): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let d = fromDeg; d < toDeg - 1e-9; d += 2.5) pts.push(arcAt(r, d));
  pts.push(arcAt(r, toDeg));
  return pts;
}

/** A lateral ramp across the bend: radius `fromR` → `toR` over the sweep, so a
 *  pull-out/dive-back follows the road instead of cutting a chord through it. */
function arcRamp(
  fromR: number,
  toR: number,
  fromDeg: number,
  toDeg: number,
): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  const steps = Math.max(2, Math.round((toDeg - fromDeg) / 2.5));
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    pts.push(arcAt(fromR + (toR - fromR) * f, fromDeg + (toDeg - fromDeg) * f));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — patience through the blind bend, then
// one clean pass in the legal straight
// ---------------------------------------------------------------------------

export function scOvCrestCurveShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Извънградски път, ограничение 90 — но пред теб пълзи бавен камион." },
      { kind: "glance", mirror: "rear" },
      // Settle behind the truck at its own pace — no reason to close up.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Знак В24: оттук нататък не се изпреварва — забраната започва при знака, не при завоя." },
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 150], [X_LANE, 205]], targetKmh: 55, stopAtEnd: false },
      { kind: "annotation", textBg: "Знак А1 с табела „40“ — завоят е сляп. Свали скоростта на правата, ПРЕДИ дъгата." },
      // Braked to the advisory before the arc entry (55 → 40 in ~35 m).
      { kind: "drive", points: [[X_LANE, 205], [X_LANE, 240]], targetKmh: 40, stopAtEnd: false },
      // The whole blind arc at the advisory, behind the truck. Both oncoming
      // cars sweep past here — in their own lane, which is the entire lesson.
      { kind: "drive", points: arcPoints(R_OWN, 0, 90), targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Ето ги насрещните — изскачат иззад склона. Точно тях не виждаше отпреди завоя." },
      // Out of the bend onto the legal straight; the ban span ended at x = 135.
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [152, EXIT_Y]], targetKmh: 52, stopAtEnd: false },
      { kind: "annotation", textBg: "Правата: сега виждаш свободен участък за ЦЯЛАТА маневра — сега е разрешено." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[152, EXIT_Y], [159, EXIT_Y], [173, 375], [187, EXIT_OUT_Y]], targetKmh: 55, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // The decisive pass: ~85 km/h (legal — limit 90) against the 57 km/h truck.
      { kind: "drive", points: [[187, EXIT_OUT_Y], [260, EXIT_OUT_Y]], targetKmh: 85, stopAtEnd: false },
      { kind: "drive", points: [[260, EXIT_OUT_Y], [470, EXIT_OUT_Y]], targetKmh: 85, stopAtEnd: false },
      { kind: "annotation", textBg: "Кратко и решително — колкото по-малко време в насрещното, толкова по-добре." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[470, EXIT_OUT_Y], [484, 375], [498, EXIT_Y]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[498, EXIT_Y], [560, EXIT_Y]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: търпение в слепия завой, чисто изпреварване на правата след него." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване в слепия завой" (OVERTAKE_INSUFFICIENT_GAP)
// ---------------------------------------------------------------------------

export function scOvCrestCurveMistakeBlindPassScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „камионът пълзи, а насреща е чисто“ — и колата излиза да изпреварва в дъгата." },
      { kind: "glance", mirror: "rear" },
      // Identical pacing to the shadow up to the bend: the ONLY difference
      // between an innocent drive and this one is the decision at the sign.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90]], targetKmh: 50, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 150], [X_LANE, 205]], targetKmh: 55, stopAtEnd: false },
      { kind: "annotation", textBg: "Знаците В24 и А1 останаха зад гърба му — водачът реши, че „чисто“ значи безопасно." },
      { kind: "drive", points: [[X_LANE, 205], [X_LANE, 240]], targetKmh: 44, stopAtEnd: false },
      // Into the bend at 44 — inside the advisory's grace band (40 + 5), so
      // nothing here can be billed as curve overspeed. The graded act is the
      // excursion alone.
      { kind: "drive", points: arcPoints(R_OWN, 0, 24), targetKmh: 44, stopAtEnd: false },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // The pull-out: a ~31 m ramp across the осева, into the bend.
      { kind: "drive", points: arcRamp(R_OWN, R_OUT, 24, 37), targetKmh: 44, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      // Held on the oncoming bank, unbraked, at speed, ACROSS the arc's midpoint
      // (θ = 45° — the blindest metre of the bend and the patience gate's own
      // anchor): the gamble the corridor adjudicator convicts. A lift anywhere
      // in here would be the OV-08 abort and would stand the conviction down.
      { kind: "drive", points: arcPoints(R_OUT, 37, 52), targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Иззад склона излиза кола — прозорецът, който „изглеждаше празен“, е секунди." },
      // Dives back at the SAME speed (no braking — the abort must not stand the
      // conviction down); the staged car's guard is what averts the head-on.
      { kind: "drive", points: arcRamp(R_OUT, R_OWN, 52, 64), targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Прибра се по инстинкт, не по преценка — това не е шофиране, а лотария." },
      { kind: "drive", points: arcPoints(R_OWN, 64, 90), targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [300, EXIT_Y]], targetKmh: 55 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При ограничена видимост не се изпреварва — изчакай правата след завоя (чл. 43)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Прекалена скорост в дъгата" (SPEED_TOO_FAST_FOR_CURVE)
// ---------------------------------------------------------------------------

export function scOvCrestCurveMistakeCurveSpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: табелата под А1 препоръчва 40, а водачът влиза в слепия завой с 54." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90]], targetKmh: 50, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 150], [X_LANE, 205]], targetKmh: 55, stopAtEnd: false },
      { kind: "annotation", textBg: "Никакво намаляване на правата — „завоят е широк, ще мине“." },
      // No lift for the bend: the arc is taken at the approach's own pace. 54
      // stays under the truck's 57 km/h cap (no following fault can leak in)
      // and far under the posted 90 (no speeding code) — the advisory is the
      // only law broken here.
      { kind: "drive", points: [[X_LANE, 205], [X_LANE, 240]], targetKmh: 54, stopAtEnd: false },
      { kind: "drive", points: arcPoints(R_OWN, 0, 90), targetKmh: 54, stopAtEnd: false },
      { kind: "annotation", textBg: "В дъгата сцеплението се дели между завиване и спиране — а спирачка тук вече няма да има." },
      { kind: "drive", points: [[ARC_CX, EXIT_Y], [300, EXIT_Y]], targetKmh: 60 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Цялото намаляване се прави ПРЕДИ завоя — в сляпа дъга караш толкова, колкото виждаш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvCrestCurveTraceName =
  | "shadow-correct"
  | "mistake-blind-pass"
  | "mistake-curve-speed";

const SCRIPTS: Record<
  ScOvCrestCurveTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvCrestCurveShadowScript },
  "mistake-blind-pass": { kind: "mistake", script: scOvCrestCurveMistakeBlindPassScript },
  "mistake-curve-speed": { kind: "mistake", script: scOvCrestCurveMistakeCurveSpeedScript },
};

/**
 * Record one of the three drives against a loaded ov-crest-v1 document — the
 * TEMPLATE's staged truck + oncoming stream armed (single truth), dry daylight,
 * ambient traffic zero (the harness law). Deterministic: same district → same
 * trace.
 */
export function recordScOvCrestCurveDrive(
  districtRaw: unknown,
  name: ScOvCrestCurveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_CREST_CURVE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_CREST_CURVE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
