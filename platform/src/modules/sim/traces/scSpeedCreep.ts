/**
 * sc-speed-creep — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Пълзящо превишаване" (SP-01, creeping over the limit)
 * on the committed sp-creep-v1 district. No staged actors, ambient traffic
 * ZERO (seed 7): the ONLY thing the rule engine can grade is the driver's own
 * speed against the posted 50 km/h.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a disciplined 46 km/h cruise);
 *   - „Носене с потока": steady ~57 km/h grades EXACTLY SPEEDING_OVER_LIMIT
 *     (51–60 in a 50 zone → второстепенна), NEVER SPEEDING_DANGEROUS;
 *   - „Скоростта пълзи нагоре": drifting 48 → 59 grades EXACTLY
 *     SPEEDING_OVER_LIMIT, still under the +10 dangerous band.
 *
 * Geometry pinned to content/world/sp-creep-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-spawn-approach
 *   (4.06, 15) heading north, 360 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SPEED_CREEP } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_CREEP_ID = "sc-speed-creep";

/** Northbound right-lane center of sp-creep-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedCreepShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Права улица, ограничение 50 — дръж скоростта под тавана, около 46 км/ч." },
      { kind: "glance", mirror: "rear" },
      // 46 km/h — comfortably under the 50 limit for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Ограничението е таван, не цел — остави си резерв за неточността на окото." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Поглед към скоростомера от време на време — скоростта пълзи неусетно нагоре." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 46 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка изминат под ограничението." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Носене с потока" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpeedCreepMistakeFlowAlongScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: потокът се носи с 56–58 и водачът върви с него — над ограничението.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold ~57 km/h — above the 55 graced limit, under the 60 dangerous band:
      // sustained → SPEEDING_OVER_LIMIT alone (второстепенна).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 57, stopAtEnd: false },
      { kind: "annotation", textBg: "51–60 км/ч е второстепенна грешка — таванът е 50, не потокът." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 320]], targetKmh: 57 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Дори „с потока“, над ограничението е грешка — свали газта до под 50." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Скоростта пълзи нагоре" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpeedCreepMistakeCreepUpScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: скоростта пълзи нагоре без поглед към скоростомера.",
      },
      { kind: "glance", mirror: "rear" },
      // Start legal at 48, then drift up to 59 and hold — still under the +10
      // dangerous band, so the ONLY code is SPEEDING_OVER_LIMIT.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Стрелката минава 55, после 59 — а усещането е същото." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 320]], targetKmh: 59 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "59 км/ч е второстепенна грешка — върни се съзнателно под 50." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedCreepTraceName = "shadow-correct" | "mistake-flow-along" | "mistake-creep-up";

const SCRIPTS: Record<
  ScSpeedCreepTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedCreepShadowScript },
  "mistake-flow-along": { kind: "mistake", script: scSpeedCreepMistakeFlowAlongScript },
  "mistake-creep-up": { kind: "mistake", script: scSpeedCreepMistakeCreepUpScript },
};

/**
 * Record one of the three drives against a loaded sp-creep-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedCreepDrive(
  districtRaw: unknown,
  name: ScSpeedCreepTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_CREEP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_CREEP.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
