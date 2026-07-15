/**
 * sc-crossing-let-pass — the authored drives (doc 76 §5/§9): ONE correct
 * shadow demonstration + TWO mistake demos for „Изчакай пътеката" (PE-03,
 * squeezing past a pedestrian on the crossing) on the committed pe-clear-v1
 * district, recorded with the template's OWN staged crosser (pedestrianDartOut
 * sc-clp-ped — single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + the PEDESTRIAN_YIELDED commendation;
 *   - „Твърде бързо приближаване" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST;
 *   - „Промъкване зад гърба" grades EXACTLY PEDESTRIAN_NOT_YIELDED.
 *
 * Geometry pinned to content/world/pe-clear-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 90, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_LET_PASS } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_LET_PASS_ID = "sc-crossing-let-pass";

/** Northbound right-lane center of pe-clear-v1 (2 lanes × 8.125 m / 2). */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 90;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingLetPassShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно и наблюдавай пешеходеца, който вече пресича." },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — вече „скорост, позволяваща спиране" (под прага от 30 км/ч).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 40]], targetKmh: 28 },
      {
        kind: "annotation",
        textBg: "Пешеходецът е на пътеката. Вдигни газта и спри плавно преди зебрата.",
      },
      {
        // Ease down and stop 6.5 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 40], [X_LANE, 64], [X_LANE, Y_ZEBRA - 6.5]],
        targetKmh: 28,
      },
      // Wait the crosser out (she needs ~12.8 s from release to clear the
      // carriageway; the stop begins ~6.6 s in).
      { kind: "pause", sec: 9.5, brake: true },
      { kind: "annotation", textBg: "Изчакай да освободи ЦЯЛАТА пътека — не се провирай зад гърба ѝ." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6.5], [X_LANE, 120], [X_LANE, 135]],
        targetKmh: 25,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: изчака пешеходеца и премина едва на чиста пътека." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде бързо приближаване" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scCrossingLetPassMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: скоростта не пада, макар че пешеходец вече е на пътеката.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 45 km/h STRAIGHT THROUGH the zone entry (y ≈ 55) — over a second
      // of „без готовност" with the crosser on the zebra = the graded fault.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 70]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак сега спирачка — късно за спокойно спиране." },
      {
        // The late hard brake still stops ~4 m short of the line — the demo
        // shows ONLY the approach-speed mistake, not a second one.
        kind: "drive",
        points: [[X_LANE, 70], [X_LANE, Y_ZEBRA - 4]],
        targetKmh: 5,
      },
      { kind: "pause", sec: 8.5, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_ZEBRA - 4], [X_LANE, 115]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Приближаването с 45 км/ч към заета пътека е опасната грешка — чл. 119 иска скорост, позволяваща спиране.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Промъкване зад гърба" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingLetPassMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката „има място“: колата не спира, докато пешеходецът пресича.",
      },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — legal and under the approach threshold, so the ONLY fault
      // this demo shows is crossing an OCCUPIED zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на платното, но колата се провира зад гърба му…" },
      {
        // Straight past the occupied crossing (she is still on the far half —
        // the demo passes ~4 m behind her, no contact, pure „непропускане").
        kind: "drive",
        points: [[X_LANE, 60], [X_LANE, 120]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът на пътеката има предимство. Изчакваш го да освободи платното — не се разминаваш с него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingLetPassTraceName =
  | "shadow-correct"
  | "mistake-too-fast"
  | "mistake-not-yielded";

const SCRIPTS: Record<
  ScCrossingLetPassTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingLetPassShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scCrossingLetPassMistakeTooFastScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingLetPassMistakeNotYieldedScript },
};

/**
 * Record one of the three drives against a loaded pe-clear-v1 document — the
 * TEMPLATE's staged crosser armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScCrossingLetPassDrive(
  districtRaw: unknown,
  name: ScCrossingLetPassTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_LET_PASS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_LET_PASS.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
