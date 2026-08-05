/**
 * sc-follow-standstill — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Дистанция при спиране в колона" (FO-08) on the
 * committed fo-follow-v1 district, recorded with the template's OWN staged lead
 * car (brakingLeadCar sc-fs-lead — single truth, imported from the template).
 *
 * B70 / FR-51 — WHAT THESE THREE NOW DEPICT. The lead used to be a prop parked
 * at y = 290 that could never move (`armDistM: 3`), so all three tapes drove
 * 235 m of empty street at 30 km/h before anything happened: measured on the
 * old shadow, the first thirty seconds carried a lead gap of 270.9 → 37.7 m
 * with no other object in the world. The founder's sentence for that is «the
 * user just drives and nothing much happens until the very end».
 *
 * The lead is now the car that ARRIVES at the back of the column: it is
 * released by the player's first movement, drives its own `paceProfile`
 * (eases at arcs 110 and 215, resumes between), rolls up to the standing
 * column and stops at y = 290 — the same metre it used to be parked at, so
 * every graded number below is unchanged. All three scripts follow it.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: rests a see-the-tyres ~4 m back → ZERO violations + CLEAN_DRIVING;
 *   - „Залепване за бронята": stops at a bumper-kiss ≤ 1.5 m at a full stop →
 *     grades EXACTLY STANDSTILL_GAP_TOO_CLOSE (never a COLLISION — it stops
 *     short of contact — nor a FOLLOWING code — it is at rest);
 *   - „Пълзене напред": rests safely, then creeps to the bumper → EXACTLY
 *     STANDSTILL_GAP_TOO_CLOSE.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The lead comes to REST as the queue tail at
 * y = 290.0 (measured); the standstill detector reads the RECORDER's leadGapM
 * (bumper gap = 290 − playerY − 4.1 m), so the shadow rests at y ≈ 281 (~5.0 m)
 * and the mistakes at y ≈ 284.7 (~1.3 m) — the same numbers as before, because
 * the tail's final metre is the design constraint the profile is tuned to.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_STANDSTILL } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_STANDSTILL_ID = "sc-follow-standstill";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — rest a see-the-tyres gap back
// ---------------------------------------------------------------------------

/**
 * B70 / FR-51 — the approach is now a drive, not a wait.
 *
 * The old script was 235 m at a flat 30 km/h down an empty street: measured,
 * the first thirty seconds carried a lead gap of 270.9 → 37.7 m with nothing
 * else in the world. That is the founder's second sentence verbatim — «the
 * user just drives and nothing much happens until the very end» — and a
 * correct demonstration of an empty road demonstrates an empty road.
 *
 * The lead is now the car that ARRIVES at the back of the column
 * (`FS_LEAD_CAR.paceProfile`, eases at arcs 110 and 215), so the shadow shows
 * the whole чл. 23 sequence: follow it, ease when it eases, take the gap back
 * when it resumes, and roll up behind it as it stops — the standstill judgement
 * at the end is now the CLIMAX of a following exercise instead of the only
 * event in it. Legs are keyed to the player positions where each of the lead's
 * changes becomes visible, one reaction late.
 */
export function scFollowStandstillShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Следвай спокойно колата пред теб на съобразена дистанция." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 85]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Намалява — намали и ти, без да чакаш да видиш защо." },
      { kind: "drive", points: [[X_LANE, 85], [X_LANE, 122]], targetKmh: 14, stopAtEnd: false },
      { kind: "annotation", textBg: "Тръгна пак — върни дистанцията плавно, не с газ." },
      { kind: "drive", points: [[X_LANE, 122], [X_LANE, 190]], targetKmh: 21, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред него се вижда спряла колона — той намалява към нея." },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 228]], targetKmh: 15, stopAtEnd: false },
      // He rolls up to the back of the column at ~8 km/h and stops at y = 290.
      { kind: "drive", points: [[X_LANE, 228], [X_LANE, 266]], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 266], [X_LANE, 281]], targetKmh: 6, stopAtEnd: true },
      { kind: "pause", sec: 4, brake: true },
      { kind: "annotation", textBg: "Готово: спря зад него на разумно разстояние — виждаш гумите му на асфалта." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Залепване за бронята" (STANDSTILL_GAP_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowStandstillMistakeBumperKissScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спиране почти опряно в бронята на предната кола." },
      { kind: "glance", mirror: "rear" },
      // The SAME lawful approach as the shadow — the demonstrated error is the
      // standstill gap alone, so nothing before the stop may grade (the gate
      // asserts EXACTLY STANDSTILL_GAP_TOO_CLOSE, never a following code).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 85]], targetKmh: 20, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 85], [X_LANE, 122]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 122], [X_LANE, 190]], targetKmh: 21, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 228]], targetKmh: 15, stopAtEnd: false },
      { kind: "annotation", textBg: "Спряла колона — но колата продължава чак до бронята ѝ." },
      // Ease down, then crawl the last bit and stop bumper-kissing (~1.2 m) —
      // but short of contact.
      { kind: "drive", points: [[X_LANE, 228], [X_LANE, 278]], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 278], [X_LANE, 284.7]], targetKmh: 6, stopAtEnd: true },
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "Под метър и половина до предния — нямаш място за маневра и резерв за наклона." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Пълзене напред до бронята" (STANDSTILL_GAP_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowStandstillMistakeCreepUpScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: спира на разумно място, после запълзява до бронята." },
      { kind: "glance", mirror: "rear" },
      // The SAME lawful approach as the shadow — see the bumper-kiss note.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 85]], targetKmh: 20, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 85], [X_LANE, 122]], targetKmh: 14, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 122], [X_LANE, 190]], targetKmh: 21, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 190], [X_LANE, 228]], targetKmh: 15, stopAtEnd: false },
      { kind: "annotation", textBg: "Спря добре зад колоната…" },
      { kind: "drive", points: [[X_LANE, 228], [X_LANE, 272]], targetKmh: 9, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 272], [X_LANE, 281]], targetKmh: 6, stopAtEnd: true },
      { kind: "pause", sec: 2, brake: true },
      { kind: "annotation", textBg: "…но после запълзява напред „да не остане дупка“ — и се залепва." },
      { kind: "drive", points: [[X_LANE, 281], [X_LANE, 284.7]], targetKmh: 5, stopAtEnd: true },
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "Дистанцията при спиране не е дупка за запълване — тя е резервът ти." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowStandstillTraceName =
  | "shadow-correct"
  | "mistake-bumper-kiss"
  | "mistake-creep-up";

const SCRIPTS: Record<
  ScFollowStandstillTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowStandstillShadowScript },
  "mistake-bumper-kiss": { kind: "mistake", script: scFollowStandstillMistakeBumperKissScript },
  "mistake-creep-up": { kind: "mistake", script: scFollowStandstillMistakeCreepUpScript },
};

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — the
 * TEMPLATE's staged lead car armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFollowStandstillDrive(
  districtRaw: unknown,
  name: ScFollowStandstillTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_STANDSTILL_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_STANDSTILL.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
