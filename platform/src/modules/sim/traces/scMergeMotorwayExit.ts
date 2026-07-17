/**
 * sc-merge-motorway-exit — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Изход от магистралата" (ЗДвП чл. 55 + чл. 58
 * + чл. 20, ал. 2) on the committed mw-exit-v1 district. Ambient traffic ZERO
 * (seed 7), dry day; the ONLY staged actor is the car BEHIND of
 * SC_MERGE_MOTORWAY_EXIT.staged — the rearTailgater runner, which emits ZERO
 * SimTick events by contract (pressure scenery, doc 72 FO-07). Everything the
 * gate asserts therefore comes from the PLAYER's own channels.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: left lane → mirror, right indicator, shoulder → laneId 1 a
 *     kilometre out → holds 130 to the taper → mirror/indicator/shoulder again
 *     → laneId 0 (the лента за намаляване) with the flow speed intact → sheds
 *     130 → 60 INSIDE the lane → rides the ramp bend AT its advisory → out.
 *     ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE;
 *   - „Спиране на платното преди изхода": a 12 m/s²-envelope slam from 130 to a
 *     dead stop in laneId 1, on an EMPTY carriageway → EXACTLY
 *     HARSH_BRAKING_NO_CAUSE (the map has no crossing, no stop line, no
 *     junction and nothing ahead — every ledger cause is positively absent; the
 *     staged car is 35 m BEHIND, which is the fault's whole point). It then
 *     exits properly, so the ONE thing graded is the causeless stop;
 *   - „Рампата с магистрална скорост": the лента за намаляване goes by at 130
 *     and the brake starts at the gore → 85 in the advisory-60 bend → EXACTLY
 *     SPEED_TOO_FAST_FOR_CURVE.
 *
 * Geometry pinned to content/world/mw-exit-v1.json (meta.scenario): the
 * northbound carriageway runs on x = 0 — curb/deceleration lane (laneId 0)
 * x = 8.13, travel lane (laneId 1) x = 0, overtaking lane (laneId 2) x = −8.12;
 * the deceleration lane opens at y = 520 and the gore is at y = 800; the ramp
 * bends right R 250 × 45° around (258.13, 800) and its tail ends at
 * (123.78, 1019.21); spawn mwx-spawn-left-lane (−8.12, 15) heading north; АМ
 * limit 140, ramp 90, ramp advisory 60.
 *
 * PACING LAWS the numbers obey (probed against the district battery, not
 * guessed):
 *  - the LANE FLIP lands at 54 % of each lateral shift (the locator's 0.35 m
 *    hysteresis deadband past the 8.125 m lane boundary). Both authored shifts
 *    put the flip ≥ 1.9 s after the previous segment joint — a lane delta
 *    inside laneChangeJointGraceSec (1.5 s) is DROPPED ungraded, which would
 *    silently gut the §9 asserts — and ≤ 2.2 s after their indicator, inside
 *    the 3 s indicatorLookbackSec;
 *  - the drill opens in laneId 2, where keep-right is armed: every drive is out
 *    of it inside 7 s, far under the 12 s keepRightSustainSec;
 *  - the locator hands the fix from the deceleration lane to the ramp within a
 *    car length of the gore (mw-exit-districts.test.ts pins it): every drive is
 *    at/under the ramp's own 90 by then, so nothing can grade as speeding on
 *    the връзка;
 *  - the recorder's curve-speed cap NEVER arms on this arc (6.9° over its 30 m
 *    window at R 250 < the 8° trigger), so the authored ramp speeds record
 *    faithfully. The generator asserts the honesty ceiling instead: the guilty
 *    85 sits under the √(2.4 · 250) ≈ 88.2 km/h comfort cap of the bend.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_MOTORWAY_EXIT } from "../lessons/scenario/templates-merging2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_MOTORWAY_EXIT_ID = "sc-merge-motorway-exit";

/** mw-exit-v1 northbound lane centers (meta.scenario — the L7 copy truth). */
const X_CURB = 8.13; // laneId 0 — the deceleration lane between taper and gore
const X_CRUISE = 0; // laneId 1 — the travel lane the exit is taken from
const X_LEFT = -8.12; // laneId 2 — the overtaking lane the drill opens in
/** mw-exit-v1 story arclengths in district y (meta.scenario). */
const TAPER_Y = 520;
const NOSE_Y = 800;
/** mw-exit-v1 ramp arc (meta.scenario.rampArc) + its tail end. */
const RAMP_R = 250;
const RAMP_CX = X_CURB + RAMP_R; // 258.13
const RAMP_SWEEP_DEG = 45;
const RAMP_STEP_DEG = 1.5;
const RAMP_END: readonly [number, number] = [123.78, 1019.21];

/** Motorway pace the drill holds to the deceleration lane. */
const CRUISE_KMH = 130;
/** The ramp advisory (А1 + Т-табела) — the shadow rides the bend AT it. */
const ADVISORY_KMH = 60;
/** „Рампата с магистрална скорост": under the ramp's own 90 (so no SPEEDING_*
 *  code leaks) and under the arc's √(2.4·R) ≈ 88.2 km/h comfort cap, but 25
 *  over the advisory — the single-code demo. */
const RAMP_GUILTY_KMH = 85;

/** The ramp bend as a chorded polyline, 1.5° steps (the map's own law). */
function rampArcPoints(): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i <= RAMP_SWEEP_DEG / RAMP_STEP_DEG; i++) {
    const th = ((i * RAMP_STEP_DEG) * Math.PI) / 180;
    pts.push([RAMP_CX - RAMP_R * Math.cos(th), NOSE_Y + RAMP_R * Math.sin(th)]);
  }
  return pts;
}
const ARC_END = rampArcPoints()[RAMP_SWEEP_DEG / RAMP_STEP_DEG];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — right early, flow speed into the lane,
// all the braking INSIDE it, the ramp at its advisory
// ---------------------------------------------------------------------------

export function scMergeMotorwayExitShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Току-що изпреварихме и сме в лявата лента. Изходът е след около километър — значи се престрояваме вдясно СЕГА, не на табелата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 40]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // The observation pair the rubric names: mirror first, then the
      // indicator, then the wheel — never the other way round.
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Десен мигач, огледало и поглед през рамо — чак тогава воланът." },
      // Shift 1: laneId 2 → 1. The flip lands ~27 m in (54 % of the lateral),
      // ~2.1 s after the indicator — inside the 3 s lookback.
      { kind: "drive", points: [[X_LEFT, 40], [X_CRUISE, 90]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "В дясната лента за движение, с темпото на потока. Указателните табели броят 500 – 300 – 100 метра до изхода — тук още НЕ се намалява." },
      { kind: "drive", points: [[X_CRUISE, 90], [X_CRUISE, TAPER_Y]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Вдясно се отваря лентата за намаляване — тя е наша за 280 метра." },
      { kind: "drive", points: [[X_CRUISE, TAPER_Y], [X_CRUISE, 580]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      // Shift 2: laneId 1 → 0, INSIDE the decel segment. The flip lands at
      // y ≈ 615 — 2.6 s past the taper joint (outside the 1.5 s joint grace)
      // and 1 s after the indicator. Speed is still the full 130: the lane is
      // entered with the flow, not crawled into.
      { kind: "drive", points: [[X_CRUISE, 580], [X_CURB, 645]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Влязохме с 130 — и чак СЕГА спирачката. Цялото намаляване се случва вътре в лентата, а не на платното зад нас." },
      // 130 → 60 in ~111 m of the 155 available: a firm ~4,6 m/s² shed, nowhere
      // near the 7 m/s² emergency line.
      { kind: "drive", points: [[X_CURB, 645], [X_CURB, NOSE_Y]], targetKmh: ADVISORY_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "На гърловината вече сме с 60 — скоростта, която табелата под А1 препоръчва за рампата." },
      { kind: "drive", points: rampArcPoints(), targetKmh: ADVISORY_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Равномерно през дъгата: сцеплението остава изцяло за завиването, защото спирането свърши преди нея." },
      { kind: "drive", points: [ARC_END, RAMP_END], targetKmh: ADVISORY_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: вдясно навреме, в лентата с темпото на потока, намаляване В нея и рампа със съобразена скорост — точно това очаква изпитващият." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спиране на платното преди изхода"
// (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scMergeMotorwayExitMistakeBrakeOnCarriagewayScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: изходът е видян късно и водачът решава да „оправи“ скоростта на самото платно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 40]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LEFT, 40], [X_CRUISE, 90]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Зад нас, на около 30 метра, върви кола със 130. Пред нас — празно платно." },
      // The 12 m/s² envelope turns the „stop and think about it" into an
      // emergency slam from 130 to rest: a sustained ~8,4 m/s² the detector
      // grades. The carriageway ahead is empty (the staged car is 35 m BEHIND,
      // in this very lane) — every ledger cause is positively absent.
      { kind: "drive", points: [[X_CRUISE, 90], [X_CRUISE, 470]], targetKmh: CRUISE_KMH, maxDecelMps2: 12 },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Стоп в лентата за движение на автомагистрала. Идващият отзад има под две секунди — и никаква причина да очаква това." },
      { kind: "annotation", textBg: "А ако изходът вече е изпуснат: караш до следващия. Спиране и движение назад по магистрала са забранени (чл. 58)." },
      { kind: "drive", points: [[X_CRUISE, 470], [X_CRUISE, 600]], targetKmh: 100, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_CRUISE, 600], [X_CURB, 665]], targetKmh: 100, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CURB, 665], [X_CURB, NOSE_Y]], targetKmh: ADVISORY_KMH, stopAtEnd: false },
      { kind: "drive", points: rampArcPoints(), targetKmh: ADVISORY_KMH, stopAtEnd: false },
      { kind: "drive", points: [ARC_END, RAMP_END], targetKmh: ADVISORY_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спирачката на платното е сигнал за изненада; лентата за намаляване е мястото, където темпото пада, без някой да плаща за това." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Рампата с магистрална скорост"
// (SPEED_TOO_FAST_FOR_CURVE)
// ---------------------------------------------------------------------------

export function scMergeMotorwayExitMistakeRampTooFastScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: престрояването е наред, но кракът не мръдва от газта — лентата за намаляване минава със 130." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 40]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LEFT, 40], [X_CRUISE, 90]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, 90], [X_CRUISE, TAPER_Y]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "drive", points: [[X_CRUISE, TAPER_Y], [X_CRUISE, 580]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_CRUISE, 580], [X_CURB, 645]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "280 метра лента за намаляване — и нито един от тях използван. Спирачката тръгва чак на гърловината." },
      { kind: "drive", points: [[X_CURB, 645], [X_CURB, 736]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // A firm-but-late 6 m/s² shed — under the 7 m/s² emergency line, so the
      // fault stays the CURVE code alone. 130 → 85 needs 62 m; there are 64.
      { kind: "drive", points: [[X_CURB, 736], [X_CURB, NOSE_Y]], targetKmh: RAMP_GUILTY_KMH, maxDecelMps2: 6, stopAtEnd: false },
      { kind: "annotation", textBg: "В дъгата колата държи 85 при препоръчани 60 — и сцеплението вече се дели между спиране и завиване." },
      { kind: "drive", points: rampArcPoints(), targetKmh: RAMP_GUILTY_KMH, stopAtEnd: false },
      { kind: "drive", points: [ARC_END, RAMP_END], targetKmh: 70 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ограничението на връзката не те пази — пази те табелата под А1. Стигни гърловината ВЕЧЕ със скоростта на рампата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeMotorwayExitTraceName =
  | "shadow-correct"
  | "mistake-brake-on-carriageway"
  | "mistake-ramp-too-fast";

const SCRIPTS: Record<
  ScMergeMotorwayExitTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeMotorwayExitShadowScript },
  "mistake-brake-on-carriageway": {
    kind: "mistake",
    script: scMergeMotorwayExitMistakeBrakeOnCarriagewayScript,
  },
  "mistake-ramp-too-fast": { kind: "mistake", script: scMergeMotorwayExitMistakeRampTooFastScript },
};

/**
 * Record one of the three drives against a loaded mw-exit-v1 document — the
 * template's staged rear car armed, ambient traffic zero (the harness law).
 * Deterministic: same district → same trace.
 */
export function recordScMergeMotorwayExitDrive(
  districtRaw: unknown,
  name: ScMergeMotorwayExitTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_MOTORWAY_EXIT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MERGE_MOTORWAY_EXIT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
