/**
 * sc-speed-zone — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Зона 30 (училище/жилищна)" (SP-03 / PE-07) on the committed
 * sp-zone30-v1 district (a straight street posted 30 — the whole street IS the
 * zone). No staged actors, ambient traffic ZERO (seed 7): the ONLY gradable
 * fault is the driver's own speed against the posted 30 km/h.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a disciplined ~27 km/h cruise);
 *   - „Скорост от булеварда": steady ~37 km/h grades EXACTLY SPEEDING_OVER_LIMIT
 *     (31–40 in a 30 zone → второстепенна), NEVER SPEEDING_DANGEROUS;
 *   - „Пълни 50 през зоната": ~50 km/h grades EXACTLY SPEEDING_DANGEROUS (the car
 *     crosses the 33–40 minor band in < 2 s minor-sustain, so the minor code
 *     never arms — the sc-speed-dangerous „flooring" pattern at a 30 limit).
 *
 * Geometry pinned to content/world/sp-zone30-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-spawn-approach
 *   (4.06, 15) heading north, 360 m long, limit 30 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SPEED_ZONE } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_ZONE_ID = "sc-speed-zone";

/** Northbound right-lane center of sp-zone30-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedZoneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Зона 30 — училище и жилищен квартал. Свали скоростта до около 27 км/ч." },
      { kind: "glance", mirror: "rear" },
      // ~27 km/h — comfortably under the 30 limit for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "Между паркираните коли всеки момент може да излезе дете — карай с готовност за спиране." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "Не пренасяй скоростта от булеварда — тук таванът е 30, не 50." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 27 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата зона изминат под 30 км/ч." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Скорост от булеварда в зона 30" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpeedZoneMistakeBoulevardScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата държи 37 км/ч — нормална за булевард, но над тавана в зона 30.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold ~37 km/h — above the graced 33, under the 40 dangerous band:
      // sustained → SPEEDING_OVER_LIMIT alone (второстепенна).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 37, stopAtEnd: false },
      { kind: "annotation", textBg: "31–40 км/ч в зона 30 е второстепенна грешка — знакът смени тавана." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 37 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Свали до под 30 км/ч — зоната иска по-ниска скорост, не булевардната." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълни 50 през зоната" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpeedZoneMistakeFullSpeedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата минава зоната с 50 км/ч, все едно е булевард.",
      },
      { kind: "glance", mirror: "rear" },
      // Start legal at 26, then carry ~50 km/h through the zone: the car blows
      // through the 33–40 minor band too fast for the 2 s minor-sustain, so ONLY
      // SPEEDING_DANGEROUS (> +10 = > 40, 1 s sustain) fires.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 70]], targetKmh: 26, stopAtEnd: false },
      { kind: "annotation", textBg: "50 км/ч в зона 30 е над +10 км/ч — опасна грешка, отпадане на изпита." },
      { kind: "drive", points: [[X_LANE, 70], [X_LANE, 330]], targetKmh: 50 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Вдигни крака от газта веднага на знака за зона 30 — тук 40 км/ч е границата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedZoneTraceName = "shadow-correct" | "mistake-boulevard-speed" | "mistake-full-speed";

const SCRIPTS: Record<
  ScSpeedZoneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedZoneShadowScript },
  "mistake-boulevard-speed": { kind: "mistake", script: scSpeedZoneMistakeBoulevardScript },
  "mistake-full-speed": { kind: "mistake", script: scSpeedZoneMistakeFullSpeedScript },
};

/**
 * Record one of the three drives against a loaded sp-zone30-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedZoneDrive(
  districtRaw: unknown,
  name: ScSpeedZoneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_ZONE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_ZONE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
