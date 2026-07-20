/**
 * sc-ov-keep-right — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Дръж вдясно" (OV-11 + OV-02) on the committed
 * ov-keepright-v1 district — the founder R3 redesign (doc 62 #45: the drill
 * now SPAWNS IN THE LEFT LANE, so keeping right is an actual
 * mirror-signal-move lane change and staying put is an actual fault). No
 * staged actors, ambient traffic ZERO (seed 7): the ONLY thing the rule
 * engine can grade is the driver's own lane choice and change discipline.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING + SAFE_LANE_CHANGE (rolls off in
 *     the LEFT lane, mirror → right indicator → moves to the RIGHT lane well
 *     inside the 12 s keep-right sustain, cruises home laneId 0);
 *   - „Висене в лявата лента": never coming home — cruising the LEFT lane
 *     (laneId 1) the whole way grades EXACTLY NOT_KEEPING_RIGHT (the 12 s
 *     keep-right sustain);
 *   - „Бавно в лявата лента": the same left-lane stay at a slower pace grades
 *     EXACTLY NOT_KEEPING_RIGHT.
 *
 * Geometry pinned to content/world/ov-keepright-v1.json: a 2+2 straight
 * boulevard on y ∈ [0, 360], RIGHT-lane center x = 12.19, LEFT-lane center
 * x = 4.06 (lane boundary x = 8.125), spawn ov-kr-spawn-left (4.06, 15)
 * heading north, limit 50 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 * NOT_KEEPING_RIGHT fires after keepRightSustainSec = 12 s in a non-rightmost
 * lane (laneId > 0) on a multi-lane road (laneCount > 1), while moving forward
 * and WITHOUT the left indicator on. The shadow crosses into laneId 0 at
 * ~8 s of driving — inside the sustain; each mistake sits in laneId 1 without
 * the left indicator for well over it.
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

/** Right-lane (cruise) and left-lane (spawn/hog) centers of ov-keepright-v1. */
const X_RIGHT = 12.19;
const X_LEFT = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — mirror, signal, come home
// ---------------------------------------------------------------------------

export function scOvKeepRightShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Започваш в ЛЯВАТА лента — мястото ти не е тук. По чл. 15 пътуваш във възможно най-дясната свободна." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[X_LEFT, 15], [X_LEFT, 45]], targetKmh: 35, stopAtEnd: false },
      { kind: "annotation", textBg: "Дясната е свободна: огледало, десен мигач — и се прибираш." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      // The move: across the 8.125 m lane boundary well inside the 12 s
      // keep-right sustain.
      { kind: "drive", points: [[X_LEFT, 45], [8.0, 62], [X_RIGHT, 80]], targetKmh: 40, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово — в дясната лента, мигачът изключен. Лявата се посещава, в дясната се живее." },
      { kind: "drive", points: [[X_RIGHT, 80], [X_RIGHT, 200]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Дръж дясната до края — висенето вляво без причина е грешка, която тече със секундите." },
      { kind: "drive", points: [[X_RIGHT, 200], [X_RIGHT, 345]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: една маневра — огледало, мигач, вдясно — и целият булевард в правилната лента." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Висене в лявата лента" (NOT_KEEPING_RIGHT)
// ---------------------------------------------------------------------------

export function scOvKeepRightMistakeHogScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата тръгва в лявата лента… и просто остава там, при свободна дясна." },
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
      { kind: "annotation", textBg: "Грешка: водачът остава в лявата лента И кара по-бавно от потока." },
      { kind: "glance", mirror: "rear" },
      // The same left-lane stay, slower — запушва бързата лента; still laneId 1,
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
