/**
 * sc-sp-wet-limit-plate — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Табела „при мокра настилка"" (SP-04 — the
 * conditional-plate half) on the committed sp-rain-v1 district (360 m straight
 * street, limit 50), recorded in DAY RAIN. No staged actors, ambient traffic
 * ZERO (seed 7). The only gradable channels are the driver's speed vs the rain
 * envelope and the posted limit — this is a speed-discipline drill, nothing to
 * hit and no lane to leave.
 *
 * DUAL-CHANNEL HONESTY (the 4a note): the WET rungs (L3–L5) run the LIVE
 * student car at real wetGrip (physics.wetGrip → ~1.4× braking distance). These
 * RECORDED demos are KINEMATIC (the recorder never runs VehicleSim), so grip is
 * the LIVE car's, not the ghost's — the ghost simply drives the authored
 * envelope. Rain is fed to tick.rain so the conditions detector is live; low
 * beams are set ON (the recorder's DAY default is "off", which would itself
 * grade HEADLIGHTS_OFF_IN_RAIN).
 *
 * The trace gate replays exactly these through the production stack, day rain:
 *   - shadow: low beams ON, ~38 km/h the whole street (under the 0.85 × 50 =
 *     42.5 km/h rain envelope — the „40 при мокра настилка" ceiling, driven a
 *     touch under) → ZERO violations + CLEAN_DRIVING;
 *   - „Сухата скорост под мократа табела": ~50 held (> 42.5 envelope, ≤ 55
 *     graced) → EXACTLY SPEED_TOO_FAST_FOR_CONDITIONS, never a speeding or
 *     lights code;
 *   - „Пълно превишение в дъжда": ~57 held (> 55 graced, ≤ 60) → EXACTLY
 *     SPEEDING_OVER_LIMIT; above the graced limit the conditions episode's
 *     accumulator is cleared by band, so the ~1.6 s accel crossing and the
 *     ~1.5 s decel crossing of (42.5, 55] never reach the 3 s sustain.
 *
 * Geometry pinned to content/world/sp-rain-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn sp-spawn-approach (4.06, 15) heading north, 360 m long,
 * limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SP_WET_LIMIT_PLATE } from "../lessons/scenario/templates-speed2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SP_WET_LIMIT_PLATE_ID = "sc-sp-wet-limit-plate";

/** Northbound right-lane center of sp-rain-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the wet ceiling, held the whole street
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Основно ограничение 50, но табелата „при мокра настилка — 40“ важи: вали. Таванът ни е 40 км/ч." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off",
      // which would itself grade HEADLIGHTS_OFF_IN_RAIN.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~38 km/h — under the 42.5 km/h rain envelope for the whole street, a
      // touch under the 40 plate ceiling.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Подминаваме табелата вече на 38 — не чакаме изпитващият да ни каже, че вали." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На мокър път спирачният път е около 1,4 пъти по-дълъг — 40 връща и разстоянието, и времето за реакция." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 38 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: мокрият таван е спазен по цялата отсечка. На сухо същата улица позволява 50 — това е разликата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Сухата скорост под мократа табела"
// (SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: 50 км/ч „по знака“, все едно е сухо — а табелата „при мокра настилка“ важи." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Hold 50 km/h (the posted limit): above the 42.5 rain envelope but at the
      // limit — SPEED_TOO_FAST_FOR_CONDITIONS ALONE, never SPEEDING_OVER_LIMIT.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "50 по мокро под табелата „40“ е несъобразена скорост — законна по знака, но грешна под условието." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Табелата не е за украса: при мокра настилка таванът тук е 40 км/ч." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълно превишение в дъжда" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpWetLimitPlateMistakeOverLimitScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: около 57 км/ч по улица с ограничение 50 — и то в дъжд." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Hold ~57 km/h: over the graced 55 (⇒ SPEEDING_OVER_LIMIT), under the
      // dangerous 60. Above the graced limit the conditions detector stands down
      // by band, so this bills the speeding code ALONE.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "Тук вече не е спазен дори основният знак: 57 при ограничение 50 е превишаване." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 57 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Първо се спазва знакът (50), после и табелата под него (40 при мокро). Тук не беше нито едното." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpWetLimitPlateTraceName =
  | "shadow-correct"
  | "mistake-dry-speed-in-wet"
  | "mistake-over-limit-in-wet";

const SCRIPTS: Record<
  ScSpWetLimitPlateTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpWetLimitPlateShadowScript },
  "mistake-dry-speed-in-wet": { kind: "mistake", script: scSpWetLimitPlateMistakeDrySpeedScript },
  "mistake-over-limit-in-wet": { kind: "mistake", script: scSpWetLimitPlateMistakeOverLimitScript },
};

/**
 * Record one of the three drives against a loaded sp-rain-v1 document — in DAY
 * RAIN (the wet rung the drill grades on), no staged actors, ambient traffic
 * zero. Deterministic: same district → same trace.
 */
export function recordScSpWetLimitPlateDrive(
  districtRaw: unknown,
  name: ScSpWetLimitPlateTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SP_WET_LIMIT_PLATE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SP_WET_LIMIT_PLATE.staged ?? [])] as StagedEventSpec[],
    rain: true,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
