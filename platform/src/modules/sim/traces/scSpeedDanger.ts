/**
 * sc-speed-dangerous — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Над +10 км/ч" (SP-02, dangerous speeding) on the
 * committed sp-danger-v1 district. No staged actors, ambient traffic ZERO
 * (seed 7): the ONLY gradable fault is the driver's own speed vs the posted 50.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (a disciplined 46 km/h cruise);
 *   - „Пълна газ": accelerating hard to ~66 km/h grades EXACTLY
 *     SPEEDING_DANGEROUS (опасна). The car crosses the 55–60 km/h minor band in
 *     ~0.6 s — far under the 2 s minor-sustain — so SPEEDING_OVER_LIMIT never
 *     arms; only the dangerous code (1 s sustain) fires;
 *   - „Ускоряване": accelerating to ~63 km/h grades EXACTLY SPEEDING_DANGEROUS.
 *
 * Geometry pinned to content/world/sp-danger-v1.json:
 *   street on x = 0, right-lane center x = 4.06, spawn sp-spawn-approach
 *   (4.06, 15) heading north, 400 m long, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_SPEED_DANGEROUS } from "../lessons/scenario/templates-sp";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_DANGEROUS_ID = "sc-speed-dangerous";

/** Northbound right-lane center of sp-danger-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedDangerousShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Ограничение 50 — дръж скоростта под тавана; над +10 км/ч е опасна грешка и отпадане.",
      },
      { kind: "glance", mirror: "rear" },
      // 46 km/h — well under the +10 dangerous band for the whole street.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 140]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "+10 км/ч не е буфер, а границата на изпита — не я доближавай." },
      { kind: "drive", points: [[X_LANE, 140], [X_LANE, 270]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Плавно и предвидимо, с поглед към скоростомера." },
      { kind: "drive", points: [[X_LANE, 270], [X_LANE, 385]], targetKmh: 46 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: под ограничението през цялата отсечка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Пълна газ след потеглянето" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpeedDangerousMistakeFlooringScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: пълна газ след потеглянето — стрелката прескача 60.",
      },
      { kind: "glance", mirror: "rear" },
      // Start legal at 46, then floor it straight to ~66: the car blows through
      // the 55–60 minor band too fast for the 2 s minor-sustain, so ONLY
      // SPEEDING_DANGEROUS (> +10, 1 s sustain) fires.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Над +10 км/ч над ограничението е опасна грешка — на изпита това е отпадане." },
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 350]], targetKmh: 66 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Вдигни крака от газта веднага — +10 км/ч е границата, не буфер." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Ускоряване без поглед към скоростомера" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpeedDangerousMistakeAccelerateScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата ускорява силно и не поглежда скоростомера — стрелката е на 63.",
      },
      { kind: "glance", mirror: "rear" },
      // Start legal at 45, then accelerate through the minor band to ~63: again
      // too fast to arm the 2 s minor episode — EXACTLY SPEEDING_DANGEROUS.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "63 км/ч в зона 50 е над +10 км/ч — опасната грешка от списъка на изпита." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 360]], targetKmh: 63 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Остави колата да намали, щом видиш знака — +10 км/ч е границата на изпита." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedDangerousTraceName = "shadow-correct" | "mistake-flooring" | "mistake-accelerate";

const SCRIPTS: Record<
  ScSpeedDangerousTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedDangerousShadowScript },
  "mistake-flooring": { kind: "mistake", script: scSpeedDangerousMistakeFlooringScript },
  "mistake-accelerate": { kind: "mistake", script: scSpeedDangerousMistakeAccelerateScript },
};

/**
 * Record one of the three drives against a loaded sp-danger-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedDangerousDrive(
  districtRaw: unknown,
  name: ScSpeedDangerousTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_DANGEROUS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_SPEED_DANGEROUS.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
