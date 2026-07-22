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
 *     indicator, kept RIGHT + slowed; the EV passes in its own left lane);
 *   - „Блокиране на линейката" grades EXACTLY EMERGENCY_NOT_YIELDED (sat in
 *     the EV's LEFT-lane corridor at steady speed through the whole response
 *     window, never pulling right — the ambulance is pinned behind it);
 *   - „Ускоряване пред линейката" grades EXACTLY EMERGENCY_NOT_YIELDED (floored
 *     it and stayed in the left-lane corridor, racing the EV up its own lane
 *     instead of releasing it — same code, distinct coaching story).
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, left-lane center x = 4.06, divider x = 8.125. The EV now runs
 * DEAD-CENTRE in the LEFT lane (x = 4.06 — right lane − 8.125 m, its чл. 91
 * corridor). The SHADOW rides the RIGHT lane (out of the corridor), keeps
 * right + slows; the MISTAKE ghosts ride the LEFT-lane centre (x = 4.06 — IN
 * the corridor) and never pull right, so the ambulance is visibly blocked
 * behind them in the SAME lane (founder taste-pass, doc 66 R0). Spawn
 * ln-spawn-start (12.19, 15, heading 0 = north).
 *
 * Runner windows (orchestrator/runners.ts EmergencyApproachRunner):
 *  · the EV is RELEASED the instant the player takes its 15 m lead (releaseGapM
 *    14 ± jitter), and its ramp is held to the player's own launch pace
 *    (actor.accelMps2 2.2) — so the EV rides ~15 m off the ghost's bumper from
 *    the start instead of holding dormant and blowing out to ~68 m (the founder
 *    render taste-pass: the old releaseGapM 38 opened the clip on a distant
 *    speck; matching the ramp keeps the EV a close, constant tail);
 *  · the DUTY arms with the EV behind ≤ 60 m and closing — matching the ramp
 *    means the EV only pulls ahead in speed once the GHOST is at cruise, so the
 *    duty arms with the ghost fast and in the corridor (an EV that surged past
 *    the slow launch would arm it while the ghost was under the make-way speed,
 *    which the runner reads as a yield — the fault would never fire);
 *  · the player then has responseWindowSec (7 ± jitter) to shift right ≥ 0.8 m,
 *    slow to ≤ 38 km/h keeping right, or stand — any of these latches the yield;
 *  · conviction ONLY at window expiry with the player still in the corridor at
 *    speed (prioritySituation "emergency" violated → EMERGENCY_NOT_YIELDED);
 *  · the EV shares the lane behind the unyielding ghost; playerGuard holds it
 *    ~15 m back against the fast ghost (its 16 m corridor) — the guard tail IS
 *    the block, never a COLLISION.
 *
 * Lane-discipline safety of the mistakes: the ghosts ride the LEFT-lane CENTRE
 * (x = 4.06, laneOffsetM ≈ 0 — under the 3.25 m laneKeepMaxOffsetM) with the
 * LEFT indicator HELD (declared left-lane use). That indicator exempts BOTH
 * the keep-right episode (NOT_KEEPING_RIGHT, чл. 25) and the two-way centre-
 * line detector; the ghosts START in the left lane (no lane change → no
 * lane-change codes) and never pull right, so EMERGENCY_NOT_YIELDED is the
 * ONLY gradable code.
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
/** Left-lane centre — the EV's чл. 91 corridor; the mistake ghosts sit here. */
const LEFT = 4.06;

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
      { kind: "annotation", textBg: "Грешката: колата виси в лявата лента — коридора на линейката — и не прави път." },
      // Committed to the LEFT lane (the EV's corridor): the left indicator is
      // HELD the whole way (declared left-lane use — the keep-right / two-way
      // centre-line exemption), and the car never pulls right. It rides the
      // left-lane CENTRE (x = LEFT), laneOffsetM ≈ 0, so no lane-keeping code.
      { kind: "indicator", setting: "left" },
      // Steady left-lane cruise at an unchanged 46 km/h — the whole response
      // window expires with the car parked in the EV's OWN corridor.
      { kind: "drive", points: [[LEFT, 15], [LEFT, 150]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Сирената вие плътно зад нея, в същата лента… а колата продължава напред, все едно нищо." },
      { kind: "drive", points: [[LEFT, 150], [LEFT, 260], [LEFT, 330]], targetKmh: 46, stopAtEnd: false },
      { kind: "drive", points: [[LEFT, 330], [LEFT, 360]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Лявата лента Е коридорът на линейката. При специален режим си длъжен НЕЗАБАВНО да се прибереш вдясно и да намалиш — оставането в коридора ѝ е опасна грешка (чл. 91).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Ускоряване пред линейката" (EMERGENCY_NOT_YIELDED)
//
// A DISTINCT second way to refuse the duty: where demo 1 sits still in the
// corridor, this driver FLOORS it — racing the EV up its OWN left lane instead
// of releasing it. Same left-lane commitment (indicator held, x = LEFT centre),
// same graded code (the refused duty); the coaching story is "make way right,
// don't run ahead". No lane change, no lane-keeping code — the ONLY gradable
// fault is the refused yield.
// ---------------------------------------------------------------------------

export function scVuEmergencyMistakeSpeedUpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: вместо да се прибере вдясно — газ, за да „избяга“ напред в лявата лента." },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[LEFT, 15], [LEFT, 120]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Линейката приближава в същата лента… а водачът ускорява, за да я изпревари, вместо да ѝ отвори път." },
      {
        kind: "drive",
        points: [[LEFT, 120], [LEFT, 210], [LEFT, 300], [LEFT, 340]],
        targetKmh: 53,
        stopAtEnd: false,
      },
      { kind: "drive", points: [[LEFT, 340], [LEFT, 366]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Лявата лента Е коридорът на линейката — надбягването само я бави. Прави се път ВДЯСНО, с намаляване, а не се бяга напред (чл. 91).",
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
