/**
 * sc-ac-truck-spray — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Водна пелена зад камиона" (FO-04 + FO-06 + AC-02) on
 * the committed mw-v1 district (the 1000 m divided 2+2 АМ posted 140), recorded
 * in DAY RAIN with the template's OWN staged rig (sc-acts-truck — single truth,
 * imported from the template) pinned a fixed 64 m of centers ahead. Ambient
 * traffic ZERO (seed 7). The rain-aware following detector ships config-OFF
 * (rules/types.ts: the exam bot never widens its rain time-gap), so this DRILL
 * enables it via the recorder's ruleConfig — the same override the template
 * propagates to the live student session.
 *
 * THE PINNED GAP IS THE WHOLE DESIGN (the sc-follow-rain-gap recipe at motorway
 * scale): the rig paces 64 m of centers ahead, so tick.leadGapM sits at ~59.9 m
 * (leadGapFor subtracts the 4.1 m VEHICLE_LENGTH_M) for every drive — the ONLY
 * variable is the player's SPEED, which is exactly FO-04's lesson. 59.9 m is
 *   ~3.4 s at the shadow's 64 km/h  → wet-prudent (the wet rule wants 2.88 s)
 *   ~1.9 s at the mistake's 115 km/h → the FOLLOWING_TOO_CLOSE_FOR_RAIN band
 * and never under the DRY band (0.7 × 1.8 s = 1.26 s ⇒ 40.2 m at 115), so the
 * base основна FOLLOWING_TOO_CLOSE can never double-bill.
 *
 * WHY THE 115 km/h DEMO GRADES NOTHING BUT THE GAP — the point of the motorway:
 * the rain envelope here is 0.85 × 140 = 119 km/h, so 115 is lawful for the
 * conditions AND under the posted limit AND under the speeding grace (154).
 * The car is convicted for the GAP alone. The drives never leave laneId 1 (the
 * rightmost REQUIRED lane — the emergencyLaneRight seam), so NOT_KEEPING_RIGHT
 * never arms, and every plateau is ≥ 50 km/h, so DRIVING_TOO_SLOW_FOR_MOTORWAY
 * never arms either.
 *
 * WET ENVELOPE HONESTY (the sc-ac-wet-braking dual-channel contract): the
 * template authors physics.wetGrip, so the LIVE student's car brakes at
 * WET_GRIP_FACTOR. These recordings are KINEMATIC, so every stop ramp below
 * passes maxDecelMps2 = WET_DECEL (SCRIPT_DECEL × WET_GRIP_FACTOR ≈ 3.22 m/s²)
 * — the ghost never demonstrates a dry stop the student's wet car cannot do.
 *
 * The trace gate replays exactly these through the production stack, in day
 * rain, with the rain-following drill ENABLED:
 *   - shadow: low beams ON (explicit — the recorder's DAY default is "off",
 *     which would itself grade AC-02), a wet-prudent ~64 km/h at ~3.4 s behind
 *     the rig → ZERO violations + CLEAN_DRIVING;
 *   - „Суха дистанция в мокрото": 115 km/h at the SAME 59.9 m (~1.9 s) →
 *     EXACTLY FOLLOWING_TOO_CLOSE_FOR_RAIN (never the base FOLLOWING_TOO_CLOSE,
 *     never a conditions/speeding code — 115 ≤ 119 ≤ 140);
 *   - „Дъжд без светлини": the shadow's exemplary gap and speed, {headlights:
 *     "off"} the whole way → EXACTLY HEADLIGHTS_OFF_IN_RAIN (3 s sustain).
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway — cruise lane (laneId 1) center x = 0, emergency lane x = 8.13,
 * overtaking lane x = −8.12; spawn mw-spawn-approach (0, 15) heading north;
 * limit 140; length 1000.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_TRUCK_SPRAY } from "../lessons/scenario/templates-conditions2";
import { WET_GRIP_FACTOR } from "../vehicle";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_TRUCK_SPRAY_ID = "sc-ac-truck-spray";

/** mw-v1 northbound CRUISE-lane center (laneId 1 — meta.scenario.laneCruiseX). */
const X_CRUISE = 0;

/**
 * The AUTHORED wet braking envelope of every stop ramp in this file:
 * SCRIPT_DECEL (the recorder's dry comfortable 4.6 m/s²) × WET_GRIP_FACTOR (the
 * live physics scaling, 0.7) ≈ 3.22 m/s² — the sc-ac-wet-braking contract.
 * Change the physics factor and the ghosts follow on the next re-record.
 */
export const WET_DECEL = SCRIPT_DECEL * WET_GRIP_FACTOR;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lights on, ~3.4 s behind the pelena
// ---------------------------------------------------------------------------

export function scAcTruckSprayShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала в порой, а пред нас — камион: зад него стои пелена от пръски." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off",
      // which would itself grade HEADLIGHTS_OFF_IN_RAIN (чл. 70).
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~64 km/h: the pinned 59.9 m is ~3.4 s — wet-prudent, so the FO-04
      // detector stays silent. Far under the 119 km/h rain envelope, and well
      // over the 50 km/h motorway floor.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 250], [X_CRUISE, 450]], targetKmh: 64, stopAtEnd: false },
      { kind: "annotation", textBg: "140 е таван за сух и чист път — тук нито едното е вярно. Държим около 65." },
      { kind: "drive", points: [[X_CRUISE, 450], [X_CRUISE, 650]], targetKmh: 64, stopAtEnd: false },
      { kind: "annotation", textBg: "В пелената не се виждат дори стоповете му — затова дистанцията е 3+ секунди, а не 2." },
      // The wet stop ramp: authored at WET_DECEL — the envelope the student's
      // wet car actually has.
      { kind: "drive", points: [[X_CRUISE, 650], [X_CRUISE, 880]], targetKmh: 64, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка с включени къси и с дистанция, която купува обратно видимостта." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Суха дистанция в мокрото" (FOLLOWING_TOO_CLOSE_FOR_RAIN)
// ---------------------------------------------------------------------------

export function scAcTruckSprayMistakeDryGapScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: 115 км/ч зад камиона — „нали съм под 140“." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 115 km/h at the SAME pinned 59.9 m = ~1.9 s — inside the wet band
      // (< 0.7 × 2.88 s) and comfortably outside the dry one (> 0.7 × 1.8 s),
      // so EXACTLY the rain code bills. 115 ≤ the 119 rain envelope, so no
      // conditions code can attach: the gap is the whole fault.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 250], [X_CRUISE, 450]], targetKmh: 115, stopAtEnd: false },
      { kind: "annotation", textBg: "60 метра при 115 км/ч са 1,9 секунди — на мокро трябват 3 и повече." },
      { kind: "drive", points: [[X_CRUISE, 450], [X_CRUISE, 650]], targetKmh: 115, stopAtEnd: false },
      { kind: "annotation", textBg: "Ако камионът спре рязко, ще научиш за това от удара — стоповете му са в пелената." },
      { kind: "drive", points: [[X_CRUISE, 650], [X_CRUISE, 880]], targetKmh: 115, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дистанцията се държи в секунди, не в метри — и в дъжд секундите стават три." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Дъжд без светлини" (HEADLIGHTS_OFF_IN_RAIN)
// ---------------------------------------------------------------------------

export function scAcTruckSprayMistakeLightsOffScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията е примерна, но колата пътува в пороя без светлини." },
      // Lights off in day rain → HEADLIGHTS_OFF_IN_RAIN after the 3 s sustain.
      // Everything else is the shadow verbatim (the same 64 km/h, the same
      // ~3.4 s gap), so the lamp is the ONLY fault on the sheet.
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 250], [X_CRUISE, 450]], targetKmh: 64, stopAtEnd: false },
      { kind: "annotation", textBg: "Пръските разсейват дневната светлина, а мокрото платно поглъща силуета." },
      { kind: "drive", points: [[X_CRUISE, 450], [X_CRUISE, 650]], targetKmh: 64, stopAtEnd: false },
      { kind: "drive", points: [[X_CRUISE, 650], [X_CRUISE, 880]], targetKmh: 64, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Тръгнат ли чистачките, светват и късите — в дъжд светлините са, за да те виждат." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcTruckSprayTraceName = "shadow-correct" | "mistake-dry-gap" | "mistake-lights-off";

const SCRIPTS: Record<
  ScAcTruckSprayTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcTruckSprayShadowScript },
  "mistake-dry-gap": { kind: "mistake", script: scAcTruckSprayMistakeDryGapScript },
  "mistake-lights-off": { kind: "mistake", script: scAcTruckSprayMistakeLightsOffScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — in DAY RAIN,
 * the rain-following drill ENABLED via ruleConfig (the config-gated detector's
 * per-lesson opt-in), the template's own staged rig, ambient traffic zero.
 * Deterministic: same district → same trace (rule config does not affect the
 * serialized trace bytes).
 */
export function recordScAcTruckSprayDrive(
  districtRaw: unknown,
  name: ScAcTruckSprayTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_TRUCK_SPRAY_ID,
    kind,
    seed: 7,
    rain: true,
    stagedEvents: [...(SC_AC_TRUCK_SPRAY.staged ?? [])] as StagedEventSpec[],
    ruleConfig: { followRainAwareEnabled: true },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
