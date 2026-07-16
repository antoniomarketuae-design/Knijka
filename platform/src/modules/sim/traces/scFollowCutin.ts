/**
 * sc-follow-cutin — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Вклиняване" (FO-03, cut-in recovery) on the committed
 * ln-v1 district (the 400 m 2+2 boulevard), recorded with the template's OWN
 * staged cut-in actor (cutInLeadCar sc-fc-cutter — single truth, imported from
 * the template). Ambient traffic ZERO (seed 7): the ONLY actor is the cutter,
 * and the ONLY fault the rule engine can grade is what the driver does with
 * the STOLEN gap.
 *
 * The choreography (runner: CutInLeadCarRunner): the cutter paces the LEFT
 * lane pinned ~12 m of centers ahead (matchPlayer), and when it reaches
 * y = 150 (player ≈ 138 at ~40 km/h) it locks an 11 m/s cruise and
 * laneShift-glides one lane right over 1.5 s — landing in the player's lane
 * ~8 m of bumpers ahead: ~0.7 s of cushion where 2 s belong.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: lifts AT the cut → the recovery-rate guard keeps the whole
 *     stolen-gap phase INNOCENT (the FO-03 point: the gap is opening, so the
 *     following episode never sustains) → ZERO violations + CLEAN_DRIVING;
 *   - „Лепене по инерция": holds the same ~40 km/h behind the stolen ~8 m
 *     bumper gap → grades EXACTLY FOLLOWING_TOO_CLOSE (once);
 *   - „Затваряне за наказание": accelerates after the cutter and squeezes the
 *     stolen gap even tighter → grades EXACTLY FOLLOWING_TOO_CLOSE.
 *
 * The panic-slam flavor is deliberately NOT a mistake demo: the cut-in IS a
 * forward cause in the harsh-brake ledger (leadGap ≤ 45 m / fast-closing), so
 * HARSH_BRAKING_NO_CAUSE honestly must NOT fire — the gate proves that fact
 * with a probe drive instead (see sc-follow-cutin-traces.test.ts), and the
 * two demos are a same-code pair at different severities (doc 72 guidance).
 *
 * Geometry pinned to content/world/ln-v1.json: northbound right-lane center
 * x = 12.19, left-lane center x = 4.06; spawn ln-spawn-start (12.19, 15,
 * heading 0 = north); limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_CUTIN } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_CUTIN_ID = "sc-follow-cutin";

/** Northbound right-lane center of ln-v1. */
const RIGHT = 12.19;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — lift, let the gap rebuild, stay calm
// ---------------------------------------------------------------------------

export function scFollowCutinShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Караш спокойно в дясната лента — кола отляво се движи почти редом с теб." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 138]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата се вклинява на метри пред теб — дистанцията ти е открадната. Вдигни газта." },
      // The lift begins right AT the cut (y ≈ 138): by the time the cutter
      // crosses into the lead corridor the gap is already OPENING — the
      // recovery-rate guard keeps the whole stolen-gap phase innocent.
      { kind: "drive", points: [[RIGHT, 138], [RIGHT, 250]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Възглавницата е възстановена — отново 2 секунди зад вклинилия се, без нито едно рязко движение." },
      { kind: "drive", points: [[RIGHT, 250], [RIGHT, 345]], targetKmh: 36 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спокойно възстановяване — с вдигане на газта, не с наказваща спирачка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Лепене по инерция" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowCutinMistakeHoldGapScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата се вклинява — а водачът продължава, все едно дистанцията си е там." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 138]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Открадната дистанция, задържана по инерция: под секунда зад вклинилия се на 40 км/ч." },
      { kind: "drive", points: [[RIGHT, 138], [RIGHT, 330]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Вклиняването не е по твоя вина — задържането на открадната дистанция вече е. Вдигни газта и изостани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Затваряне за наказание" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowCutinMistakeSqueezeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: вместо да отстъпи, водачът тръгва след вклинилия се — „да му покаже“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 138]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Газ след вклинилия се: открадната дистанция се затваря още повече." },
      { kind: "drive", points: [[RIGHT, 138], [RIGHT, 168]], targetKmh: 46, stopAtEnd: false },
      { kind: "annotation", textBg: "Броени метри броня в броня — никакво време за реакция, чиста провокация." },
      { kind: "drive", points: [[RIGHT, 168], [RIGHT, 330]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "„Наказателното“ лепене не връща нищо — дистанцията се възстановява назад, не напред." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Honesty probe (gate-only, never committed as a demo) — the panic slam
// ---------------------------------------------------------------------------

/**
 * The third FO-03 flavor: a panic-slam right after the cut. The cut-in is a
 * FORWARD CAUSE in the harsh-brake ledger (leadGap within 45 m and closing
 * fast), so HARSH_BRAKING_NO_CAUSE must NOT fire — and the lift-to-a-slam
 * profile opens the gap, so FOLLOWING_TOO_CLOSE must not either. The gate
 * replays this probe and asserts ZERO violations: no shipped code grades the
 * panic slam honestly, which is exactly why the committed demo pair is two
 * same-code holds instead (doc 72 FO-03 guidance).
 */
export function scFollowCutinProbePanicSlamScript(): DriveScript {
  return {
    steps: [
      { kind: "drive", points: [[RIGHT, 15], [RIGHT, 138]], targetKmh: 40, stopAtEnd: false },
      // The slam: 12 m/s² envelope down to a dead stop just past the cut.
      { kind: "drive", points: [[RIGHT, 138], [RIGHT, 158]], targetKmh: 40, maxDecelMps2: 12 },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "drive", points: [[RIGHT, 158], [RIGHT, 330]], targetKmh: 36 },
      { kind: "pause", sec: 1.5, brake: true },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowCutinTraceName = "shadow-correct" | "mistake-hold-gap" | "mistake-squeeze";

const SCRIPTS: Record<
  ScFollowCutinTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowCutinShadowScript },
  "mistake-hold-gap": { kind: "mistake", script: scFollowCutinMistakeHoldGapScript },
  "mistake-squeeze": { kind: "mistake", script: scFollowCutinMistakeSqueezeScript },
};

/**
 * Record one of the three drives against a loaded ln-v1 document — the
 * TEMPLATE's staged cutter armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScFollowCutinDrive(
  districtRaw: unknown,
  name: ScFollowCutinTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_CUTIN_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_CUTIN.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}

/** Record the gate-only panic-slam probe (never serialized/committed). */
export function recordScFollowCutinPanicSlamProbe(districtRaw: unknown): RecordedDrive {
  return recordScriptedDrive(districtRaw, scFollowCutinProbePanicSlamScript(), {
    scenarioId: SC_FOLLOW_CUTIN_ID,
    kind: "mistake",
    seed: 7,
    stagedEvents: [...(SC_FOLLOW_CUTIN.staged ?? [])] as StagedEventSpec[],
  });
}
