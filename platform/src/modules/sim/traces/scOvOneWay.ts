/**
 * sc-ov-oneway — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Еднопосочна улица" (OV-13) on the committed ov-oneway-v1
 * district. No staged actors, ambient traffic ZERO (seed 7): the ONLY thing the
 * rule engine can grade is the driver's own direction of travel.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING (the whole street WITH the flow,
 *     heading north = the legal from→to direction);
 *   - „Срещу движението по еднопосочна": driving the full street AGAINST the
 *     flow (heading south) grades EXACTLY WRONG_WAY;
 *   - „Кратко в грешната посока": a shorter wrong-direction stint grades EXACTLY
 *     WRONG_WAY.
 *
 * Geometry pinned to content/world/ov-oneway-v1.json: a single-lane one-way on
 * y ∈ [0, 300], legal flow NORTH, lane center on the polyline x = 0, spawn
 * ov-ow-spawn-entry (0, 15) heading north, limit 50 km/h.
 *
 * Rule envelope the scripts respect (rules/engine.ts §4, cfg defaults):
 * WRONG_WAY fires after wrongWaySustainSec = 1.5 s while moving forward against a
 * one-way's flow (the runtime sets tick.wrongWay when the heading opposes the
 * edge tangent by > 120°). The shadow heads with the flow (wrongWay never true);
 * each mistake heads against it for well over the sustain.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_OV_ONEWAY } from "../lessons/scenario/templates-lanes";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_OV_ONEWAY_ID = "sc-ov-oneway";

/** The single one-way lane centers on the polyline (x = 0). */
const X_LANE = 0;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — WITH the flow (north)
// ---------------------------------------------------------------------------

export function scOvOneWayShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Еднопосочна улица — влизаш и се движиш само ПО посока на движението (на север)." },
      { kind: "glance", mirror: "rear" },
      // With the flow (increasing y = geometry from→to = north): wrongWay never
      // arms.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 105], [X_LANE, 160]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "По еднопосочна насрещните нямат как да те очакват — затова посоката е задължителна." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 225]], targetKmh: 44, stopAtEnd: false },
      { kind: "annotation", textBg: "Оглеждай знаците на входа на всяка улица: В2 „Влизането забранено“ значи не влизаш." },
      { kind: "drive", points: [[X_LANE, 225], [X_LANE, 285]], targetKmh: 44 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: цялата улица по разрешената посока." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Срещу движението по еднопосочна" (WRONG_WAY)
// ---------------------------------------------------------------------------

export function scOvOneWayMistakeWrongWayScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: колата влиза в еднопосочната СРЕЩУ разрешената посока — покрай знака В2." },
      { kind: "glance", mirror: "rear" },
      // Against the flow (decreasing y = heading south): after 1.5 s → WRONG_WAY.
      { kind: "drive", points: [[X_LANE, 285], [X_LANE, 160], [X_LANE, 90]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Насрещните карат с очакването, че никой няма да се появи насреща им — реакцията им закъснява фатално." },
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 15]], targetKmh: 40 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Движение срещу еднопосочното е опасна грешка и прекратява изпита — оглеждай знаците на всеки вход." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Кратко в грешната посока" (WRONG_WAY)
// ---------------------------------------------------------------------------

export function scOvOneWayMistakeWrongWayShortScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: водачът пое срещу движението само за няколко метра, „колкото да стигне“." },
      { kind: "glance", mirror: "rear" },
      // A shorter wrong-direction stint (heading south) — still well over the
      // 1.5 s sustain → WRONG_WAY.
      { kind: "drive", points: [[X_LANE, 200], [X_LANE, 120], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "И краткото движение срещу еднопосочното е същата опасна грешка." },
      { kind: "drive", points: [[X_LANE, 60], [X_LANE, 30]], targetKmh: 28 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "По еднопосочна се влиза и се движи единствено по посока на движението." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScOvOneWayTraceName =
  | "shadow-correct"
  | "mistake-wrong-way"
  | "mistake-wrong-way-short";

const SCRIPTS: Record<
  ScOvOneWayTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scOvOneWayShadowScript },
  "mistake-wrong-way": { kind: "mistake", script: scOvOneWayMistakeWrongWayScript },
  "mistake-wrong-way-short": { kind: "mistake", script: scOvOneWayMistakeWrongWayShortScript },
};

/**
 * Record one of the three drives against a loaded ov-oneway-v1 document — no
 * staged actors, ambient traffic zero. Deterministic: same district → same trace.
 */
export function recordScOvOneWayDrive(
  districtRaw: unknown,
  name: ScOvOneWayTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_OV_ONEWAY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_OV_ONEWAY.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
