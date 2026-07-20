/**
 * sc-speed-dangerous — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Над +10 км/ч" (SP-02 + SP-13) on the committed
 * ov-keepright-v1 district (REUSED 2+2 boulevard, 360 m, limit 50) — the
 * founder R3 redesign (doc 62 #31): the +10 band taught by CONTRAST under real
 * flow pressure. TWO staged learn-only actors ride every drive (from the
 * template's own `staged`):
 *   - the RUNAWAY PACE CAR ahead (brakingLeadCar, followGapM 400 → constant
 *     ~61 km/h cruise, slam tier authored out of reach) — the carrot;
 *   - the PASSER behind (rearTailgater — its runner emits ZERO events by
 *     contract) that glues briefly and then overtakes on the left at ~61 —
 *     the push.
 * Neither actor can emit a grade; ambient traffic ZERO (seed 7): the ONLY
 * gradable fault is the player's own speed against the posted 50.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (47 km/h held in the right lane
 *     while the flow runs away ahead and passes on the left);
 *   - „Със скоростта на потока — 58": pacing the flow at ~58 grades EXACTLY
 *     SPEEDING_OVER_LIMIT (51–60 → второстепенна), NEVER the dangerous band;
 *   - „Гонене на потока — 66": chasing the runaway car to ~66 grades EXACTLY
 *     SPEEDING_DANGEROUS (> +10 — the exam-termination band). The car crosses
 *     the 55–60 minor band in well under the 2 s minor sustain, so only the
 *     dangerous code (1 s sustain) fires. The pace car starts ~75 m ahead at
 *     61, so even the 66 km/h chase closes the gap by only ~1.4 m/s and
 *     FOLLOWING_TOO_CLOSE structurally cannot arm.
 *
 * Geometry pinned to content/world/ov-keepright-v1.json: a 2+2 straight
 * boulevard on y ∈ [0, 360], RIGHT-lane center x = 12.19, LEFT-lane center
 * x = 4.06, spawn ov-kr-spawn-start (12.19, 15) heading north, limit 50 km/h.
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

/** Right-lane (the player's) center of ov-keepright-v1. */
const X_RIGHT = 12.19;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scSpeedDangerousShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Потокът лети с над 60 — колата пред теб се отдалечава, тази отзад напира. Твоят таван остава 50.",
      },
      { kind: "glance", mirror: "rear" },
      // 47 km/h in the RIGHT lane — the flow pulls away ahead and passes left.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 150]], targetKmh: 47, stopAtEnd: false },
      { kind: "annotation", textBg: "Остави ги: скоростта се чете от знака и скоростомера, не от гърба на предния." },
      { kind: "drive", points: [[X_RIGHT, 150], [X_RIGHT, 250]], targetKmh: 47, stopAtEnd: false },
      { kind: "annotation", textBg: "Границата на изпита е +10: 55–60 е второстепенна грешка, над 60 — опасна и отпадане." },
      { kind: "drive", points: [[X_RIGHT, 250], [X_RIGHT, 340]], targetKmh: 47 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: целият поток те изпревари, а изпитът остана твой — това е печелившата размяна." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Със скоростта на потока — 58" (SPEEDING_OVER_LIMIT)
// ---------------------------------------------------------------------------

export function scSpeedDangerousMistakePaceFlowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: водачът се лепва за потока и задържа 58 — „за да не пречи“.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold ~58 km/h — above the 55 graced limit, under the 60 dangerous band:
      // sustained → SPEEDING_OVER_LIMIT alone (второстепенна).
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 160]], targetKmh: 58, stopAtEnd: false },
      { kind: "annotation", textBg: "51–60 км/ч в зона 50 е второстепенна грешка — коригируема, но записана." },
      { kind: "drive", points: [[X_RIGHT, 160], [X_RIGHT, 300]], targetKmh: 58, stopAtEnd: false },
      { kind: "drive", points: [[X_RIGHT, 300], [X_RIGHT, 345]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Потокът не вдига тавана — той просто кара сбъркано пред свидетел." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Гонене на потока — 66" (SPEEDING_DANGEROUS)
// ---------------------------------------------------------------------------

export function scSpeedDangerousMistakeChaseFlowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: предният „дръпна“ и водачът го подгонва — стрелката минава 60.",
      },
      { kind: "glance", mirror: "rear" },
      // Hard chase to ~66 km/h: the 55–60 band is crossed in well under the
      // 2 s minor sustain, then > 60 holds → SPEEDING_DANGEROUS alone.
      { kind: "drive", points: [[X_RIGHT, 15], [X_RIGHT, 150]], targetKmh: 66, stopAtEnd: false },
      { kind: "annotation", textBg: "Над +10 км/ч (тук над 60) е опасна грешка — на изпита това е незабавно отпадане." },
      { kind: "drive", points: [[X_RIGHT, 150], [X_RIGHT, 300]], targetKmh: 66, stopAtEnd: false },
      { kind: "drive", points: [[X_RIGHT, 300], [X_RIGHT, 345]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "58 беше коригируема грешка; 66 е прекратен изпит. Осем км/ч делят двете присъди — не гони потока." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScSpeedDangerousTraceName = "shadow-correct" | "mistake-pace-flow" | "mistake-chase-flow";

const SCRIPTS: Record<
  ScSpeedDangerousTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scSpeedDangerousShadowScript },
  "mistake-pace-flow": { kind: "mistake", script: scSpeedDangerousMistakePaceFlowScript },
  "mistake-chase-flow": { kind: "mistake", script: scSpeedDangerousMistakeChaseFlowScript },
};

/**
 * Record one of the three drives against a loaded ov-keepright-v1 document —
 * the template's OWN staged flow actors ride along (deterministic, seed 7),
 * ambient traffic zero. Same district → same trace.
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
