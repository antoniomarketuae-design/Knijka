/**
 * sc-crossing-white-cane — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Пешеходец с бял бастун" (PE-14) on the
 * committed pe-cane-v1 district, recorded with the template's OWN staged
 * crosser (pedestrianDartOut sc-wcn-ped, 0.75 m/s — a blind pedestrian tapping
 * across, single truth, imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (recognised the cane, stopped
 *     fully and waited);
 *   - „Твърде бързо приближаване" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST;
 *   - „Непропускане на незрящия" grades EXACTLY PEDESTRIAN_NOT_YIELDED (drove
 *     through the occupied zebra under the 30 km/h cap — no too-fast, and the
 *     very slow crosser is still near the far curb, so no contact).
 *
 * Geometry pinned to content/world/pe-cane-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 92, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 50 km/h. A 0.75 m/s
 *   crosser occupies the 16.25 m carriageway for ~22 s — the recognition +
 *   absolute-yield test.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_WHITE_CANE } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_WHITE_CANE_ID = "sc-crossing-white-cane";

/** Northbound right-lane center of pe-cane-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 92;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingWhiteCaneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Движи се спокойно и наблюдавай пешеходната пътека напред." },
      { kind: "glance", mirror: "rear" },
      // ~26 km/h — под прага за приближаване; готов да спреш при разпознат бастун.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 40]], targetKmh: 26 },
      {
        kind: "annotation",
        textBg: "Пешеходец с бял бастун стъпва на пътеката — незрящ човек с безусловно предимство. Спри напълно.",
      },
      {
        // Ease down and stop 6.5 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 40], [X_LANE, 66], [X_LANE, Y_ZEBRA - 6.5]],
        targetKmh: 26,
      },
      // Wait the very slow crosser out — 0.75 m/s needs ~22 s to clear the road.
      { kind: "pause", sec: 22, brake: true },
      { kind: "annotation", textBg: "Търпение — той не те вижда и има нужда от много време; не настъпвай." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Премини спокойно едва когато пешеходецът слезе напълно от платното." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6.5], [X_LANE, 122], [X_LANE, 136]],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: разпозна бастуна, спря напълно и изчака незрящия пешеходец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде бързо приближаване" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scCrossingWhiteCaneMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата задържа 45 км/ч, макар незрящият с бял бастун вече да е на пътеката.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 45 km/h through the zone entry — over a second of „без готовност"
      // with the crosser on the zebra = the graded fault.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 72]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак сега спирачка — късно за спокойно спиране." },
      {
        // The late hard brake still stops ~4 m short of the line — ONE fault.
        kind: "drive",
        points: [[X_LANE, 72], [X_LANE, Y_ZEBRA - 4]],
        targetKmh: 5,
      },
      { kind: "pause", sec: 21, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_ZEBRA - 4], [X_LANE, 118]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Приближаването с 45 км/ч към заета от незрящ пешеходец пътека е опасната грешка — чл. 119 иска скорост, позволяваща спиране.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Непропускане на незрящия" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingWhiteCaneMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата минава през пътеката, докато незрящият пешеходец още пресича.",
      },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — legal and under the 30 km/h cap, so the ONLY fault this demo
      // shows is crossing while the blind pedestrian is still on the zebra. He
      // is only a step onto the near curb, well clear of the driving lane, so
      // there is no contact — pure „непропускане".
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 62]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът с бастуна е на платното, но колата не изчаква…" },
      {
        kind: "drive",
        points: [[X_LANE, 62], [X_LANE, 124]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Белият бастун означава безусловно предимство — незрящият не може да те види. Задължението да спреш е изцяло твое.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingWhiteCaneTraceName =
  | "shadow-correct"
  | "mistake-too-fast"
  | "mistake-not-yielded";

const SCRIPTS: Record<
  ScCrossingWhiteCaneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingWhiteCaneShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scCrossingWhiteCaneMistakeTooFastScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingWhiteCaneMistakeNotYieldedScript },
};

/**
 * Record one of the three drives against a loaded pe-cane-v1 document — the
 * TEMPLATE's staged crosser armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScCrossingWhiteCaneDrive(
  districtRaw: unknown,
  name: ScCrossingWhiteCaneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_WHITE_CANE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_WHITE_CANE.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
