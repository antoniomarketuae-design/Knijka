/**
 * sc-speed-transition — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Преход 50→30 (навлизане в зона 30)" (SP-03) on the
 * committed sp-trans-v1 district — a street of TWO collinear segments: a 160 m
 * approach posted 50, then a 200 m zone posted 30. No staged actors, ambient
 * traffic ZERO (seed 7): the ONLY gradable fault is the driver's own speed
 * against the PER-EDGE local limit.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — lifts off BEFORE the transition
 *     (≈46 on the approach → ≈27 through the zone);
 *   - „Скоростта от преди зоната": carries ≈48 km/h straight through the sign →
 *     EXACTLY SPEEDING_DANGEROUS (48 > 40 = the 30-zone's +10 band), and NEVER
 *     the minor band; the code fires only PAST the transition (against 30), not
 *     on the 50 approach (48 < the graced 55 there);
 *   - „Само наполовина намалена": ≈37 km/h in the zone → EXACTLY
 *     SPEEDING_OVER_LIMIT (31–40 in a 30 zone → второстепенна), never dangerous.
 *
 * Geometry pinned to content/world/sp-trans-v1.json: street on x = 0, right-lane
 * center x = 4.06, spawn sp-tr-spawn-approach (4.06, 15) heading north; the
 * limit drops from 50 to 30 at the mid node y = 160 (total length 360 m).
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_SPEED_TRANSITION_ID = "sc-speed-transition";

/** Northbound right-lane center of sp-trans-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — anticipatory lift at the transition
// ---------------------------------------------------------------------------

export function scSpeedTransitionShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Ограничението е 50 км/ч, но напред следва знак за зона 30 — намаляването започва преди знака." },
      { kind: "glance", mirror: "rear" },
      // Calm ~46 km/h on the 50 approach.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Вдигаме газта навреме и влизаме в зоната вече под 30 км/ч." },
      // Lift off THROUGH the transition (y = 160): decelerate to ~27 by y ≈ 178.
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 178]], targetKmh: 27, stopAtEnd: false },
      { kind: "annotation", textBg: "В зоната карай с готовност за спиране — между дворовете и паркираните коли изскачат деца." },
      { kind: "drive", points: [[X_LANE, 178], [X_LANE, 350]], targetKmh: 27 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намалихме навреме на прехода и минахме цялата зона под 30 км/ч." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Скоростта от преди зоната" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpeedTransitionMistakeCarryScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата пренася 48 км/ч право през знака за зона 30." },
      { kind: "glance", mirror: "rear" },
      // Hold ~48 across the transition — legal on the 50 approach, dangerous in 30.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "48 км/ч в зона 30 е над +10 км/ч — опасна грешка, отпадане на изпита." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 340]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Вдигни крака от газта още на знака — таванът вече е 30, не 50." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Само наполовина намалена" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpeedTransitionMistakeHalfScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: скоростта падна, но само до около 37 км/ч — все още над 30." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 150]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "31–40 км/ч в зона 30 е второстепенна грешка — намаляването закъсня и остана недостатъчно." },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 182]], targetKmh: 37, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 182], [X_LANE, 340]], targetKmh: 37 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Целѝ под тавана, не към него — свали до под 30 км/ч в зоната." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedTransitionTraceName = "shadow-correct" | "mistake-carry-speed" | "mistake-half-slow";

const SCRIPTS: Record<
  ScSpeedTransitionTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedTransitionShadowScript },
  "mistake-carry-speed": { kind: "mistake", script: scSpeedTransitionMistakeCarryScript },
  "mistake-half-slow": { kind: "mistake", script: scSpeedTransitionMistakeHalfScript },
};

/**
 * Record one of the three drives against a loaded sp-trans-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScSpeedTransitionDrive(
  districtRaw: unknown,
  name: ScSpeedTransitionTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_SPEED_TRANSITION_ID,
    kind,
    seed: 7,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
