/**
 * sc-crossing-slow-crosser — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Бавен пешеходец" (PE-08, the elderly slow
 * crosser) on the committed pe-slow-v1 district, recorded with the template's
 * OWN staged crosser (pedestrianDartOut sc-scr-ped, 0.8 m/s — single truth,
 * imported from the template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (the long wait pays off);
 *   - „Твърде бързо приближаване" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST;
 *   - „Потегляне, преди да слезе" grades EXACTLY PEDESTRIAN_NOT_YIELDED.
 *
 * Geometry pinned to content/world/pe-slow-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 85, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 40 km/h. A 0.8 m/s
 *   crosser occupies the 16.25 m carriageway for ~20 s — the patience test.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_SLOW_CROSSER } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_SLOW_CROSSER_ID = "sc-crossing-slow-crosser";

/** Northbound right-lane center of pe-slow-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 85;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingSlowCrosserShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Квартална улица — карай спокойно и наблюдавай тротоарите." },
      { kind: "glance", mirror: "rear" },
      // 24 km/h — под прага за приближаване; в жилищната зона и без пешеходец.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 34]], targetKmh: 24 },
      {
        kind: "annotation",
        textBg: "Бавен пешеходец стъпва на пътеката. Намали рано и спри напълно преди зебрата.",
      },
      {
        // Ease down and stop 6.5 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 34], [X_LANE, 60], [X_LANE, Y_ZEBRA - 6.5]],
        targetKmh: 24,
      },
      // Wait the SLOW crosser out — she needs ~20 s to clear the carriageway.
      { kind: "pause", sec: 20, brake: true },
      { kind: "annotation", textBg: "Търпение — дай ѝ цялото време; не настъпвай, за да я подканиш." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Премини спокойно едва когато пешеходецът слезе напълно от платното." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6.5], [X_LANE, 115], [X_LANE, 130]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: изчака бавния пешеходец и премина на чиста пътека." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде бързо приближаване" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scCrossingSlowCrosserMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата задържа 40 км/ч, макар бавният пешеходец да е на пътеката.",
      },
      { kind: "glance", mirror: "rear" },
      // Hold 40 km/h (the limit, but too fast for an occupied crossing) through
      // the zone entry (y ≈ 50) — over a second of „без готовност" = the fault.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 66]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "Чак сега спирачка — късно за спокойно спиране." },
      {
        // The late hard brake still stops ~4 m short of the line — ONE fault.
        kind: "drive",
        points: [[X_LANE, 66], [X_LANE, Y_ZEBRA - 4]],
        targetKmh: 5,
      },
      { kind: "pause", sec: 19, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_LANE, Y_ZEBRA - 4], [X_LANE, 112]], targetKmh: 18 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дори при законно ограничение приближаването с 40 км/ч към заета пътека е опасната грешка (чл. 119).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Потегляне, преди да слезе" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingSlowCrosserMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Нетърпение: колата потегля през пътеката, докато бавният пешеходец още пресича.",
      },
      { kind: "glance", mirror: "rear" },
      // 24 km/h — legal, under the approach threshold, so the ONLY fault this
      // demo shows is crossing while the slow pedestrian is still on the zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът още е на платното, но колата не изчаква…" },
      {
        kind: "drive",
        points: [[X_LANE, 55], [X_LANE, 118]],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Бавният пешеходец има предимство до последната крачка от платното — потеглянето под носа му е опасна грешка.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingSlowCrosserTraceName =
  | "shadow-correct"
  | "mistake-too-fast"
  | "mistake-not-yielded";

const SCRIPTS: Record<
  ScCrossingSlowCrosserTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingSlowCrosserShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scCrossingSlowCrosserMistakeTooFastScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingSlowCrosserMistakeNotYieldedScript },
};

/**
 * Record one of the three drives against a loaded pe-slow-v1 document — the
 * TEMPLATE's staged crosser armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScCrossingSlowCrosserDrive(
  districtRaw: unknown,
  name: ScCrossingSlowCrosserTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_SLOW_CROSSER_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_SLOW_CROSSER.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
