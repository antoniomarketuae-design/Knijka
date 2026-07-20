/**
 * sc-speed-rain — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Скорост в дъжд през нощта" (SP-04, rain speed discipline
 * ×N) on the committed sp-rain-v1 district, recorded at NIGHT in the RAIN (the
 * recorder feeds tick.rain / tick.isNight so the conditions detector is live).
 * No staged actors, ambient traffic ZERO (seed 7).
 *
 * The trace gate replays exactly these through the production stack, under
 * rain + night:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a 38 km/h drive, under the
 *     0.85 × 50 = 42.5 km/h rain envelope; low beams on at night avoid
 *     HEADLIGHTS_OFF_IN_RAIN);
 *   - „Суха скорост в дъжд": holding 50 km/h grades EXACTLY
 *     SPEED_TOO_FAST_FOR_CONDITIONS (over the 42.5 envelope, at/under the 50
 *     limit so NOT SPEEDING_OVER_LIMIT);
 *   - „Каране с потока": holding 48 km/h grades EXACTLY
 *     SPEED_TOO_FAST_FOR_CONDITIONS.
 *
 * Geometry pinned to content/world/sp-rain-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-spawn-approach
 *   (4.06, 15) heading north, 360 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SPEED_RAIN } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_RAIN_ID = "sc-speed-rain";

/** Northbound right-lane center of sp-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedRainShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Знакът казва 50, но тази вечер той лъже: в дъжд и тъмнина съобразената скорост е около 38 км/ч." },
      { kind: "glance", mirror: "rear" },
      // 38 km/h — under the rain envelope (42.5 km/h) for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Съобразената скорост е тази, при която спираш в осветеното от фаровете платно." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг — дръж резерв." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намалена за дъжда и нощта скорост през цялата отсечка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Суха скорост в дъжд" (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scSpeedRainMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: „карам под знака“ — стрелката на 50 в дъжда, все едно е сух ден. Знакът важи за идеални условия.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 50 km/h (the posted limit): above the 42.5 rain envelope but at the
      // limit — SPEED_TOO_FAST_FOR_CONDITIONS ALONE, never SPEEDING_OVER_LIMIT.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокър и тъмен път 50 е несъобразена скорост — спирачният път е по-дълъг." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Свали 10–15% под ограничението — тук съобразената скорост е около 38 км/ч." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Каране с потока в дъжда" (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scSpeedRainMistakeFlowAlongScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: потокът кара 48 и водачът върви с него, макар да вали.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 48 km/h — over the 42.5 rain envelope, under the limit: EXACTLY
      // SPEED_TOO_FAST_FOR_CONDITIONS.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "48 км/ч в дъжд и тъмнина е несъобразена скорост — видимостта и сцеплението са по-малки." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 320]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При дъжд намали до около 38 км/ч — спираш в рамките на видимото платно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedRainTraceName = "shadow-correct" | "mistake-dry-speed" | "mistake-flow-along";

const SCRIPTS: Record<
  ScSpeedRainTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedRainShadowScript },
  "mistake-dry-speed": { kind: "mistake", script: scSpeedRainMistakeDrySpeedScript },
  "mistake-flow-along": { kind: "mistake", script: scSpeedRainMistakeFlowAlongScript },
};

/**
 * Record one of the three drives against a loaded sp-rain-v1 document — at
 * NIGHT in the RAIN (the conditions the archetype is defined by), no staged
 * actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedRainDrive(
  districtRaw: unknown,
  name: ScSpeedRainTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_RAIN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_RAIN.staged ?? [])] as StagedEventSpec[],
    rain: true,
    isNight: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
