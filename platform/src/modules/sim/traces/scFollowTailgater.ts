/**
 * sc-follow-tailgater — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Лепка отзад" (FO-07, being tailgated) on the
 * committed ln-v1 district (the 400 m 2+2 boulevard), recorded with the
 * template's OWN staged pair (single truth, imported from the template):
 *   - the FRONT LEAD (brakingLeadCar sc-ftg-lead, constant-cruiser trick):
 *     ~11.5 m/s far ahead — the leadGap surface the taught response GROWS;
 *   - the TAILGATER (rearTailgater sc-ftg-tail): matchPlayer at ~5 m of
 *     bumpers BEHIND — pressure scenery, ZERO events (learn-only, doc 72).
 *
 * The graded surfaces are the PLAYER's own choices, all shipped code:
 *   - shadow: eases off (front gap grows, the taught FO-07 response), keeps
 *     right, lets the tailgater laneShift-pass → ZERO violations +
 *     CLEAN_DRIVING (outcome "yielded" on the measurement channel);
 *   - „Спирачен удар": a 12 m/s²-envelope slam on an empty road (the front
 *     lead ~90 m of bumpers ahead — no forward cause, and the REAR car is
 *     structurally not one: leadGap only looks forward) → grades EXACTLY
 *     HARSH_BRAKING_NO_CAUSE;
 *   - „Гузно ускоряване": pushed to ~58 km/h in the 50 limit → grades
 *     EXACTLY SPEEDING_OVER_LIMIT (the graced-band основна; under the +10
 *     dangerous escalation).
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, left-lane center x = 4.06; spawn ln-spawn-start (12.19, 15,
 * heading 0 = north); limit 50 km/h. No junction/crossing/signal exists on
 * the map, so the harsh-brake cause ledger is empty by construction.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_TAILGATER } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_TAILGATER_ID = "sc-follow-tailgater";

/** Northbound right-lane center of ln-v1. */
const RIGHT = 12.19;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — ease off, grow the FRONT gap, let pass
// ---------------------------------------------------------------------------

export function scFollowTailgaterShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно — в огледалото се появява кола, залепена зад теб." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 150]], targetKmh: 42, stopAtEnd: false },
      { kind: "annotation", textBg: "Лепка отзад. Не наказвай със спирачка — вдигни газта и увеличи дистанцията НАПРЕД." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 150], [RIGHT, 260]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Предната дистанция расте — сега тя поема и твоето спиране, и грешката на лепката. Изнервеният отзад изпреварва и си заминава." },
      { kind: "drive", points: [[RIGHT, 260], [RIGHT, 345]], targetKmh: 36 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спокойствие, увеличена предна дистанция и никакъв спирачен удар." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спирачен удар „за урок"" (HARSH_BRAKING_NO_CAUSE)
// ---------------------------------------------------------------------------

export function scFollowTailgaterMistakeBrakeCheckScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: лепка отзад — и водачът ѝ отговаря със спирачен удар." },
      // The 12 m/s² envelope turns the stop into an emergency slam mid-block:
      // the front lead is ~90 m of bumpers ahead (outside the 45 m cause
      // window), the rear car is not a forward cause — the phantom stop.
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 195]], targetKmh: 46, maxDecelMps2: 12 },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Пред колата няма нищо — спирачният удар е само „урок“ за лепката. Точно това е предпоставката за удар отзад." },
      { kind: "drive", points: [[RIGHT, 195], [RIGHT, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спирачката не е възпитателно средство: при лепка отзад увеличи дистанцията НАПРЕД и я остави да те изпревари." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Гузно ускоряване" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scFollowTailgaterMistakeSpeedUpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: лепка отзад — и водачът гузно ускорява, „за да не пречи“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 120]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Стрелката минава ограничението — а лепката просто идва със скоростта. Нарушението остава за теб." },
      { kind: "drive", points: [[RIGHT, 120], [RIGHT, 290]], targetKmh: 58, stopAtEnd: false },
      { kind: "drive", points: [[RIGHT, 290], [RIGHT, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ограничението не се предоговаря от огледалото. Лепката се решава с дистанция напред и пропускане — не със скорост." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowTailgaterTraceName =
  | "shadow-correct"
  | "mistake-brake-check"
  | "mistake-speed-up";

const SCRIPTS: Record<
  ScFollowTailgaterTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowTailgaterShadowScript },
  "mistake-brake-check": { kind: "mistake", script: scFollowTailgaterMistakeBrakeCheckScript },
  "mistake-speed-up": { kind: "mistake", script: scFollowTailgaterMistakeSpeedUpScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged lead + tailgater armed (single truth), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScFollowTailgaterDrive(
  districtRaw: unknown,
  name: ScFollowTailgaterTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_TAILGATER_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_TAILGATER.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
