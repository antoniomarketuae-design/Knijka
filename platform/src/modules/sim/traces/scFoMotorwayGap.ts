/**
 * sc-fo-motorway-gap — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дистанция при 130" (FO-01 + SP-10) on the committed
 * mw-v1 district (the 2+2 motorway, posted 140), recorded with the template's
 * OWN staged actor (brakingLeadCar sc-fmg-lead — single truth, imported from the
 * template). Ambient traffic ZERO (seed 7): the ONLY actor is the lead car.
 *
 * THE DESIGN (see the template): the lead PREFERS a 76 m gap (leadGap ~72 m ≈
 * 2.0 s at 130) and cruises with a whisker of headroom (maxMatchSpeedMps ≈ 130.3
 * km/h). So:
 *   - the SHADOW cruises AT flow (~128) and is simply held at 76 m — the taught
 *     2-second gap — then absorbs the lead's firm 6 m/s² brake and rolls to rest
 *     with metres to spare (stoppedInTime), then resumes to the finish;
 *   - „Една секунда зад водещия": the impatient driver RACES into the gap (a
 *     burst at 144 — under the 145 km/h grace of the posted 140) and sits ~40 m
 *     back at 130 — the lead has no headroom to escape — grading EXACTLY
 *     FOLLOWING_TOO_CLOSE. It ends BEFORE the slam: the fault is the gap,
 *     nothing else. The burst USED to be authored at 149, which was legal only
 *     because of the audit's M-14 dead band (a 10% grace of 154 sitting above
 *     the +10 опасна line made second-degree speeding unreachable on every
 *     motorway map). With the band restored, 149 is a real second-degree
 *     mistake — so the demo was slowed to keep its one fault isolated;
 *   - „Каране на бронята": the same race, but onto the bumper (~14 m) — the gap
 *     fires FOLLOWING_TOO_CLOSE, then the slam arrives with no metres left and
 *     the late reaction rear-ends the lead → COLLISION.
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway on x = 0 — cruise lane center x = 0; spawn mw-spawn-approach
 * (0, 15) heading north; limit 140; length 1000.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FO_MOTORWAY_GAP } from "../lessons/scenario/templates-following2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FO_MOTORWAY_GAP_ID = "sc-fo-motorway-gap";

/** mw-v1 northbound cruise-lane center. */
const X = 0;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — hold the 2-s gap at flow, absorb the brake
// ---------------------------------------------------------------------------

export function scFoMotorwayGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала, със скоростта на потока — дръж 2 секунди до предния: при тази скорост това са над 70 метра." },
      { kind: "glance", mirror: "rear" },
      // Accelerate to flow and hold the pinned 76 m gap all the way to the brake.
      { kind: "drive", points: [[X, 15], [X, 320], [X, 655]], targetKmh: 121, stopAtEnd: false },
      { kind: "annotation", textBg: "Стоп на предния — плавно и право, не в паника: голямата дистанция ти дава метрите за спокойно спиране." },
      // The lead braked to a stop as the player passed y ~644; brake firmly (but
      // never harshly — ≤ 6.5 ⇒ ~4.6 m/s² envelope) to rest with a big margin.
      { kind: "drive", points: [[X, 655], [X, 792]], targetKmh: 121, stopAtEnd: true, maxDecelMps2: 6.5 },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Спря с десетки метри резерв — дистанцията беше времето ти за реакция." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Една секунда зад водещия при 130" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFoMotorwayGapMistakeOneSecondScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: нетърпение — колата се засилва и се залепва на около 40 метра зад водещия." },
      { kind: "glance", mirror: "rear" },
      // Race into the pinned gap (a burst under the 145 km/h grace line), then
      // sit at ~40 m at flow — one second where two are needed.
      { kind: "drive", points: [[X, 15], [X, 300]], targetKmh: 144, stopAtEnd: false },
      { kind: "drive", points: [[X, 300], [X, 500]], targetKmh: 144, stopAtEnd: false },
      { kind: "drive", points: [[X, 500], [X, 660]], targetKmh: 122, stopAtEnd: false },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "40 метра на тази скорост е под секунда и половина — по-малко от времето дори само да реагираш." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Каране на бронята и закъсняла реакция" (FOLLOWING_TOO_CLOSE + COLLISION)
// ---------------------------------------------------------------------------

export function scFoMotorwayGapMistakeBumperCrashScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: каране почти на бронята — за да те „тегли“ бързият." },
      { kind: "glance", mirror: "rear" },
      // Race onto the bumper (~14 m), sit there long enough for the gap to fire,
      // then meet the brake with no metres and a late reaction. The run-in
      // reaches y = 800 rather than 786: at the slowed 144 burst the ego meets
      // the stopped lead a few metres further along, and the contact — the
      // whole point of the demo — must still happen inside the script.
      { kind: "drive", points: [[X, 15], [X, 300]], targetKmh: 144, stopAtEnd: false },
      { kind: "drive", points: [[X, 300], [X, 640]], targetKmh: 144, stopAtEnd: false },
      { kind: "drive", points: [[X, 640], [X, 712]], targetKmh: 123, stopAtEnd: false },
      { kind: "annotation", textBg: "Водещият спря — а метрите ги нямаше." },
      // No lift: ram the braking lead (stopAtEnd false — the drive holds speed
      // straight into it; the runner grades the contact as COLLISION).
      { kind: "drive", points: [[X, 712], [X, 800]], targetKmh: 123, stopAtEnd: false },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Удар отзад: спирачният път от тази скорост е над сто метра, а дистанцията беше нула." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFoMotorwayGapTraceName =
  | "shadow-correct"
  | "mistake-one-second"
  | "mistake-bumper-crash";

const SCRIPTS: Record<
  ScFoMotorwayGapTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFoMotorwayGapShadowScript },
  "mistake-one-second": { kind: "mistake", script: scFoMotorwayGapMistakeOneSecondScript },
  "mistake-bumper-crash": { kind: "mistake", script: scFoMotorwayGapMistakeBumperCrashScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — the
 * TEMPLATE's staged lead armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFoMotorwayGapDrive(
  districtRaw: unknown,
  name: ScFoMotorwayGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FO_MOTORWAY_GAP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FO_MOTORWAY_GAP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
