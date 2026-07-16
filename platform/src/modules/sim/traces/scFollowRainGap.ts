/**
 * sc-follow-rain-gap — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дистанция в дъжд" (FO-04) on the committed fo-follow-v1
 * district, recorded in RAIN with the template's OWN staged lead car
 * (brakingLeadCar sc-fr-lead — single truth, imported from the template) pacing
 * a fixed ~18 m ahead. The rain-aware following detector ships config-OFF
 * (types.ts: the exam-bot never widens its rain time-gap), so this DRILL enables
 * it via the recorder's ruleConfig override — the per-lesson opt-in.
 *
 * The trace gate replays exactly these through the production stack, in RAIN,
 * with the rain-following drill ENABLED:
 *   - shadow: follows the same 18 m at a calm 25 km/h (~2.6 s — wet-prudent) →
 *     ZERO violations + CLEAN_DRIVING;
 *   - „Дистанция за сухо в дъжд": holds the same 18 m at 40 km/h (~1.6 s — too
 *     close for wet) → grades EXACTLY FOLLOWING_TOO_CLOSE_FOR_RAIN (never the
 *     base FOLLOWING_TOO_CLOSE — 18 m is fine for dry — nor a conditions-speed
 *     code: 40 ≤ the 42.5 rain envelope);
 *   - „Дистанцията се топи": prudent at 25 km/h, then accelerates to 40 km/h at
 *     the SAME 18 m → EXACTLY FOLLOWING_TOO_CLOSE_FOR_RAIN.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_RAIN_GAP } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_RAIN_GAP_ID = "sc-follow-rain-gap";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the same gap, taken calmly (wet-prudent)
// ---------------------------------------------------------------------------

export function scFollowRainGapShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Вали — следвай предната кола с УВЕЛИЧЕНА за дъжда дистанция." },
      { kind: "glance", mirror: "rear" },
      // Rain, daytime → low beams on (else HEADLIGHTS_OFF_IN_RAIN leaks; чл. 70).
      { kind: "headlights", setting: "low" },
      // Calm 25 km/h: 18 m is ~2.6 s — wet-prudent, so no rain-following code.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 210]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокро правилото е 3 и повече секунди — карай спокойно и дръж дистанция." },
      { kind: "drive", points: [[X_LANE, 210], [X_LANE, 340]], targetKmh: 25 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: увеличена дистанция за дъжда през целия участък." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Дистанция за сухо в дъжд" (FOLLOWING_TOO_CLOSE_FOR_RAIN)
// ---------------------------------------------------------------------------

export function scFollowRainGapMistakeDryHabitScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: в дъжд следва на дистанция „както при сухо“ — твърде близо." },
      { kind: "glance", mirror: "rear" },
      // Rain, daytime → low beams on (else HEADLIGHTS_OFF_IN_RAIN leaks; чл. 70).
      { kind: "headlights", setting: "low" },
      // 40 km/h at the SAME 18 m gap = ~1.6 s — too close for wet.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120], [X_LANE, 210]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокро спирачният път е с около половина по-дълъг — секунда и половина не стига." },
      { kind: "drive", points: [[X_LANE, 210], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "В дъжд дръж 3 и повече секунди до предния." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Дистанцията се топи с ускоряването" (FOLLOWING_TOO_CLOSE_FOR_RAIN)
// ---------------------------------------------------------------------------

export function scFollowRainGapMistakeGapMeltsScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията е добра на спокойно, но се топи с ускоряването." },
      { kind: "glance", mirror: "rear" },
      // Rain, daytime → low beams on (else HEADLIGHTS_OFF_IN_RAIN leaks; чл. 70).
      { kind: "headlights", setting: "low" },
      // Prudent at 25 km/h first (the same 18 m is wet-safe there)…
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90], [X_LANE, 150]], targetKmh: 25, stopAtEnd: false },
      { kind: "annotation", textBg: "…но ускорява до 40 км/ч, без да изостане — същите метри вече не стигат за дъжда." },
      // …then accelerate to 40 km/h at the SAME 18 m gap → wet-imprudent.
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 240], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ускоряваш ли в дъжд, изостани още — дистанцията се държи в секунди, не в метри." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowRainGapTraceName = "shadow-correct" | "mistake-dry-habit" | "mistake-gap-melts";

const SCRIPTS: Record<ScFollowRainGapTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scFollowRainGapShadowScript },
  "mistake-dry-habit": { kind: "mistake", script: scFollowRainGapMistakeDryHabitScript },
  "mistake-gap-melts": { kind: "mistake", script: scFollowRainGapMistakeGapMeltsScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — in
 * RAIN, the rain-following drill ENABLED via ruleConfig (the config-gated
 * detector's per-lesson opt-in), ambient traffic zero. Deterministic: same
 * district → same trace (rule config does not affect the serialized trace bytes).
 */
export function recordScFollowRainGapDrive(
  districtRaw: unknown,
  name: ScFollowRainGapTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_RAIN_GAP_ID,
    kind,
    seed: 7,
    rain: true,
    stagedEvents: [...(SC_FOLLOW_RAIN_GAP.staged ?? [])] as StagedEventSpec[],
    ruleConfig: { followRainAwareEnabled: true },
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
