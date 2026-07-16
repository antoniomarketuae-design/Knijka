/**
 * sc-vp-stall — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Загасване при потегляне" (VP-04) on the committed
 * vp-ready-v1 district (map REUSED from sc-vp-readiness). No staged actors,
 * ambient traffic ZERO (seed 7), dry day: the ONLY thing the rule engine can
 * grade is the stall channel ({kind:"stall"} — the VP-04 capability unlock).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: a controlled move-off (клъч плавно до зацепване), a centered
 *     ~40 km/h drive the whole street → ZERO violations + CLEAN_DRIVING;
 *   - „Загасване при потеглянето": one lurch-and-stall at move-off, then a
 *     calm restart → EXACTLY ONE ENGINE_STALLED (the latch's rising edge);
 *   - „Повторно загасване": TWO lurch-and-stall cycles (panic repeats the
 *     same fast clutch) → EXACTLY TWO ENGINE_STALLED — the restart re-arms
 *     the episode, every stall bills separately.
 *
 * Geometry pinned to content/world/vp-ready-v1.json: street on x = 0,
 * right-lane center x = 4.06, spawn vp-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The drives stay on x = 4.06 (centered)
 * and at 40 km/h (well under the limit) so nothing but the stall is gradable.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VP_STALL } from "../lessons/scenario/templates-cockpit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VP_STALL_ID = "sc-vp-stall";

/** Northbound right-lane center of vp-ready-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — clutch controlled, no stall, clean run
// ---------------------------------------------------------------------------

export function scVpStallShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Потегляне без загасване: съединител докрай, лек газ, плавно до точката на зацепване." },
      // The correct engine state — matches the recorder default (running), so
      // the shadow records byte-identically while stating the story.
      { kind: "stall", on: false },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 120]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата тръгна плавно — кракът задържа зацепването, газта пое двигателя." },
      { kind: "drive", points: [[X_LANE, 120], [X_LANE, 240]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Двигателят работи равномерно през цялото потегляне — нито едно загасване." },
      { kind: "drive", points: [[X_LANE, 240], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спокойно потегляне и цялата отсечка без загасване." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Загасване при потеглянето" (ENGINE_STALLED ×1)
// ---------------------------------------------------------------------------

export function scVpStallMistakeOnceScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: съединителят е отпуснат рязко — колата подскача и двигателят гасне." },
      { kind: "glance", mirror: "rear" },
      // The lurch: a metre and a half of creep, then the engine dies.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 17.5]], targetKmh: 7 },
      { kind: "stall", on: true },
      { kind: "pause", sec: 2.5, brake: true },
      { kind: "annotation", textBg: "Двигателят загасна — второстепенна грешка, отбелязва се всяко загасване." },
      // Calm restart (clears the driveline latch), then the proper move-off.
      { kind: "stall", on: false },
      { kind: "pause", sec: 1 },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 17.5], [X_LANE, 150]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 150], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спокоен рестарт и плавно повторно потегляне — така се поправя загасването." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Повторно загасване" (ENGINE_STALLED ×2)
// ---------------------------------------------------------------------------

export function scVpStallMistakeRepeatScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: загасване, паника — и същото рязко отпускане още веднъж." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 17]], targetKmh: 6 },
      { kind: "stall", on: true },
      { kind: "pause", sec: 2, brake: true },
      { kind: "stall", on: false },
      { kind: "pause", sec: 0.8 },
      { kind: "annotation", textBg: "Пак твърде бързо отпуснат съединител — двигателят гасне втори път." },
      { kind: "drive", points: [[X_LANE, 17], [X_LANE, 19]], targetKmh: 6 },
      { kind: "stall", on: true },
      { kind: "pause", sec: 2, brake: true },
      { kind: "stall", on: false },
      { kind: "pause", sec: 0.8 },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LANE, 19], [X_LANE, 160]], targetKmh: 40, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 345]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Всяко загасване се брои отделно — дишай, съединител докрай и повтори процедурата бавно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVpStallTraceName = "shadow-correct" | "mistake-stall-once" | "mistake-stall-repeat";

const SCRIPTS: Record<
  ScVpStallTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVpStallShadowScript },
  "mistake-stall-once": { kind: "mistake", script: scVpStallMistakeOnceScript },
  "mistake-stall-repeat": { kind: "mistake", script: scVpStallMistakeRepeatScript },
};

/**
 * Record one of the three drives against a loaded vp-ready-v1 document — no
 * staged actors, ambient traffic zero, dry day. Deterministic: same district →
 * same trace.
 */
export function recordScVpStallDrive(
  districtRaw: unknown,
  name: ScVpStallTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VP_STALL_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VP_STALL.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
