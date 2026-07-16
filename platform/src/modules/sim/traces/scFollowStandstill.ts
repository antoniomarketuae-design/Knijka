/**
 * sc-follow-standstill — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Дистанция при спиране в колона" (FO-08) on the
 * committed fo-follow-v1 district, recorded with the template's OWN staged lead
 * car (brakingLeadCar sc-fs-lead — single truth, imported from the template).
 * The lead paces AHEAD, brake-slams to a full stop at y = 250 and STAYS stopped
 * (resumeAfterSec 40), so the drives all pull up behind a stationary lead.
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
 * north, 360 m long, limit 50 km/h. The lead is a STATIONARY queue tail held at
 * y = 290; the standstill detector reads the RECORDER's leadGapM (bumper gap =
 * 290 − playerY − 4.1 m), so the shadow rests at y ≈ 281 (~4.9 m) and the
 * mistakes at y ≈ 284.7 (~1.2 m).
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

export function scFollowStandstillShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Следвай спокойно колата пред теб на съобразена дистанция." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150], [X_LANE, 250]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред теб има спряла колона — намали плавно и спри зад нея." },
      // Ease down well before the gap closes, then stop ~4.9 m behind the
      // stationary lead (lead at y = 290): a see-the-tyres gap.
      { kind: "drive", points: [[X_LANE, 250], [X_LANE, 272]], targetKmh: 16, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 272], [X_LANE, 281]], targetKmh: 8, stopAtEnd: true },
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
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150], [X_LANE, 250]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Спряла колона — но колата продължава чак до бронята ѝ." },
      // Ease down, then crawl the last bit and stop bumper-kissing (~1.2 m) —
      // but short of contact.
      { kind: "drive", points: [[X_LANE, 250], [X_LANE, 278]], targetKmh: 16, stopAtEnd: false },
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
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150], [X_LANE, 250]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Спря добре зад колоната…" },
      { kind: "drive", points: [[X_LANE, 250], [X_LANE, 272]], targetKmh: 16, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 272], [X_LANE, 281]], targetKmh: 8, stopAtEnd: true },
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
