/**
 * sc-ov-keep-right — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дръж вдясно" (OV-11) on the committed ov-keepright-v1
 * district. No staged actors, ambient traffic ZERO (seed 7): the ONLY thing the
 * rule engine can grade is the driver's own lane choice.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (the whole boulevard in the RIGHT
 *     lane, laneId 0 — where you belong);
 *   - „Висене в лявата лента": cruising the LEFT lane (laneId 1) with the right
 *     lane free grades EXACTLY NOT_KEEPING_RIGHT (the 12 s keep-right sustain);
 *   - „Бавно в лявата лента": the same left-lane hog at a slower pace grades
 *     EXACTLY NOT_KEEPING_RIGHT.
 *
 * Geometry pinned to content/world/ov-keepright-v1.json: a 2+2 straight
 * boulevard on y ∈ [0, 360], RIGHT-lane center x = 12.19, LEFT-lane center
 * x = 4.06 (lane boundary x = 8.125), spawn ov-kr-spawn-start (12.19, 15)
 * heading north, limit 50 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 * NOT_KEEPING_RIGHT fires after keepRightSustainSec = 12 s in a non-rightmost
 * lane (laneId > 0) on a multi-lane road (laneCount > 1), while moving forward
 * and WITHOUT the left indicator on (a declared overtake/left-turn is exempt).
 * The shadow never leaves laneId 0; each mistake sits in laneId 1 without the
 * left indicator for well over the sustain.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_KEEP_RIGHT } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_KEEP_RIGHT_ID = "sc-ov-keep-right";

/** Right-lane (cruise) and left-lane (hog) centers of ov-keepright-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scOvKeepRightShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Булевард с две ленти в посока — установи се в ДЯСНАТА лента." },
      { kind: "glance", mirror: "rear" },
      // Cruise the RIGHT lane (x = 12.19) the whole way — laneId 0, keep-right
      // never arms.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 120], [X_RIGHT, 185]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Дясната лента е лентата ти за пътуване — стой в нея, докато няма причина да я напуснеш." },
      { kind: "drive", points: [[X_RIGHT, 185], [X_RIGHT, 260]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Лявата лента е само за изпреварване или ляв завой — не „за всеки случай“." },
      { kind: "drive", points: [[X_RIGHT, 260], [X_RIGHT, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата отсечка в дясната лента — чисто и подредено." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Висене в лявата лента" (NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scOvKeepRightMistakeHogScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата виси в ЛЯВАТА лента при свободна дясна — без да изпреварва." },
      { kind: "glance", mirror: "rear" },
      // Cruise the LEFT lane (x = 4.06 — laneId 1) the whole way, no left
      // indicator: after 12 s → NOT_KEEPING_RIGHT.
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 130], [X_LEFT, 200]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Дясната лента е празна, а водачът стои вляво — зад него се събира колона." },
      { kind: "drive", points: [[X_LEFT, 200], [X_LEFT, 345]], targetKmh: 45 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Извън изпреварване мястото ти е в най-дясната свободна лента (чл. 15) — прибери се вдясно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Бавно в лявата лента" (NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scOvKeepRightMistakeSlowHogScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът се е настанил в лявата лента и кара по-бавно от потока." },
      { kind: "glance", mirror: "rear" },
      // The same left-lane hog, slower — запушва бързата лента; still laneId 1,
      // no left indicator → NOT_KEEPING_RIGHT.
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 120], [X_LEFT, 190]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "„За да е спокоен“ — но бавно в лявата лента запушва пътя на по-бързите." },
      { kind: "drive", points: [[X_LEFT, 190], [X_LEFT, 330]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Мястото ти е вдясно; лявата лента се освобождава за изпреварване." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvKeepRightTraceName = "shadow-correct" | "mistake-hog" | "mistake-slow-hog";

const SCRIPTS: Record<
  ScOvKeepRightTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvKeepRightShadowScript },
  "mistake-hog": { kind: "mistake", script: scOvKeepRightMistakeHogScript },
  "mistake-slow-hog": { kind: "mistake", script: scOvKeepRightMistakeSlowHogScript },
};

/**
 * Record one of the three drives against a loaded ov-keepright-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScOvKeepRightDrive(
  districtRaw: unknown,
  name: ScOvKeepRightTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_KEEP_RIGHT_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_KEEP_RIGHT.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
