/**
 * sc-vu-emergency — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Линейка отзад" (VU-09, ADR-006 stage 1b) on the
 * committed ln-v1 district (the 400 m 2+2 boulevard), recorded with the
 * template's OWN staged emergency actor (emergencyApproach sc-vue-approach —
 * single truth, imported from the template). No ambient traffic (seed 7): the
 * ONLY actor is the emergency vehicle closing from behind, and the ONLY fault
 * the rule engine can grade is how the driver treats it.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (mirror check, right
 *     indicator, eased right + slowed; the EV passed on the left edge);
 *   - „Блокиране на линейката" grades EXACTLY EMERGENCY_NOT_YIELDED (held the
 *     lane center at speed through the whole response window);
 *   - „Ускоряване пред линейката" grades EXACTLY EMERGENCY_NOT_YIELDED (sped
 *     up and drifted LEFT into the EV's corridor side — the opposite of the
 *     duty; same code, distinct coaching story).
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, left-lane center x = 4.06, divider x = 8.125; the EV runs at
 * x ≈ 5.69 (right lane − 6.5 m — straddling the divider on the player's left
 * edge). Spawn ln-spawn-start (12.19, 15, heading 0 = north).
 *
 * Runner windows (orchestrator/runners.ts EmergencyApproachRunner):
 *  · the EV is RELEASED once the player is releaseGapM (38 ± jitter) ahead;
 *  · the DUTY arms with the EV behind ≤ 60 m and closing; the player then has
 *    responseWindowSec (7 ± jitter) to shift right ≥ 0.8 m, slow to ≤ 38 km/h
 *    keeping right, or stand — any of these latches the yield permanently;
 *  · conviction ONLY at window expiry with the player still centered at speed
 *    (prioritySituation "emergency" violated → EMERGENCY_NOT_YIELDED);
 *  · once the EV is 18 m past, the runner stands down (one adjudication).
 *
 * Lane-discipline safety of the demos: the mistake drift stays at x ≥ 10.3
 * (offset −1.9 m — under the 3.25 m laneKeepMaxOffsetM, same laneId, and
 * 4.6 m lateral from the EV — outside both the 4.0 m lead corridor and the
 * 3.0 m player guard), so EMERGENCY_NOT_YIELDED is the only gradable code.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_EMERGENCY } from "../lessons/scenario/templates-vru";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_EMERGENCY_ID = "sc-vu-emergency";

/** Northbound lane centers of ln-v1 (meta.scenario, pinned by value). */
const RIGHT = 12.19;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — mirror, signal, ease right + slow
// ---------------------------------------------------------------------------

export function scVuEmergencyShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно в дясната лента и поглеждай в огледалото." },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 60]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Синя лампа отзад — линейка със специален режим. Правим ѝ път." },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      // Ease toward the right edge of the lane and shed speed — the make-way
      // posture; the EV passes on the left edge while this leg runs.
      {
        kind: "drive",
        points: [[RIGHT, 60], [RIGHT, 85], [12.9, 105], [13.4, 125], [13.5, 165], [13.5, 215], [13.5, 255]],
        targetKmh: 28,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Линейката премина — плавно обратно към средата на лентата." },
      {
        kind: "drive",
        points: [[13.5, 255], [12.6, 278], [RIGHT, 300], [RIGHT, 340], [RIGHT, 358]],
        targetKmh: 40,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: направи път незабавно и без рязко спиране (чл. 91)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Блокиране на линейката" (EMERGENCY_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scVuEmergencyMistakeBlockScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: водачът не поглежда назад и не прави път." },
      // Lane-center cruise at an unchanged 46 km/h — the whole response
      // window expires with the car parked in the EV's approach line.
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 120]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Сирената вие зад колата… а тя продължава по средата, все едно нищо." },
      { kind: "drive", points: [[RIGHT, 120], [RIGHT, 240], [RIGHT, 330]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[RIGHT, 330], [RIGHT, 360]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "При специален режим си длъжен НЕЗАБАВНО да направиш път — вдясно и с намаляване. Блокирането на коридора е опасна грешка (чл. 91).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Ускоряване пред линейката" (EMERGENCY_NOT_YIELDED)
//
// A DISTINCT second way to refuse the duty: where demo 1 freezes in line,
// this driver floors it and drifts LEFT — „да не му се пречка" — racing the
// EV instead of releasing its corridor. Same graded code (the refused duty),
// the coaching story is "make way right, don't run ahead". The drift stays at
// x ≥ 10.3: same lane, under every lane-keeping threshold, outside the EV's
// guard corridor — the ONLY gradable fault is the refused yield.
// ---------------------------------------------------------------------------

export function scVuEmergencyMistakeSpeedUpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: вместо път — газ и изместване наляво." },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 100]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Линейката приближава… а водачът ускорява и се мести към нейния коридор." },
      {
        kind: "drive",
        points: [[RIGHT, 100], [11.3, 140], [10.3, 180], [10.3, 260], [10.3, 320]],
        targetKmh: 53,
        stopAtEnd: false,
      },
      { kind: "drive", points: [[10.3, 320], [11.5, 345], [RIGHT, 362]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Лявата страна Е коридорът на линейката — надбягването само я бави. Прави се път вдясно, с намаляване (чл. 91).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuEmergencyTraceName = "shadow-correct" | "mistake-block" | "mistake-speed-up";

const SCRIPTS: Record<ScVuEmergencyTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVuEmergencyShadowScript },
  "mistake-block": { kind: "mistake", script: scVuEmergencyMistakeBlockScript },
  "mistake-speed-up": { kind: "mistake", script: scVuEmergencyMistakeSpeedUpScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged emergency actor armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScVuEmergencyDrive(
  districtRaw: unknown,
  name: ScVuEmergencyTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_EMERGENCY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_EMERGENCY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
