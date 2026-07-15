/**
 * sc-zebra-approach — the authored drives (doc 76 §5/§9): ONE correct shadow
 * demonstration + TWO mistake demos for „Пешеходна пътека" on the committed
 * zb-v1 district, recorded with the template's OWN staged slow-crosser
 * (pedestrianDartOut sc-za-ped — single truth, imported from the template).
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + the PEDESTRIAN_YIELDED commendation;
 *   - „Твърде бързо приближаване" grades EXACTLY PEDESTRIAN_CROSSING_TOO_FAST;
 *   - „Непропускане на пешеходец" grades EXACTLY PEDESTRIAN_NOT_YIELDED.
 *
 * Geometry pinned to content/world/zb-v1.json (the scParkPerpRev pattern):
 *   street on x = 0, right-lane center x = 4.06, zebras at y = 90 / 160,
 *   spawn zb-spawn-approach (4.06, 15) heading north, limit 50 km/h.
 *
 * Timing envelope the scripts respect (why the numbers are what they are):
 * the crosser releases at triggerDistM 55 and needs 1.15 s to the west road
 * edge, then 11.6 s across the 16.25 m carriageway (1.4 m/s walk). The
 * too-fast detector (crossingApproachMaxKmh 30, 1 s sustain) is paused by a
 * ≥ 2 m/s² braking response, so the too-fast demo holds 45 km/h through the
 * zone entry (y ≈ 55) until PAST y ≈ 67.5 before its late brake — while the
 * recorder's stop envelope (0.7 × 4.6 m/s²) still lands the stop 4 m short
 * of the zebra, keeping PEDESTRIAN_NOT_YIELDED out of that demo.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_ZEBRA_APPROACH } from "../lessons/scenario/templates-flow";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_ZEBRA_APPROACH_ID = "sc-zebra-approach";

/** Northbound right-lane center of zb-v1 (2 lanes × 8.125 m / 2). */
const X_LANE = 4.06;
/** The staged crossing (zb-x-1). */
const Y_ZEBRA = 90;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scZebraApproachShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Карай спокойно и наблюдавай тротоарите около пътеката." },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — already „скорост, позволяваща спиране" (under the 30 km/h
      // approach threshold); the crosser releases around y ≈ 36.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 40]], targetKmh: 28 },
      {
        kind: "annotation",
        textBg: "Пешеходка стъпва на пътеката. Вдигни газта и спри плавно преди зебрата.",
      },
      {
        // Ease down and stop 6.5 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 40], [X_LANE, 64], [X_LANE, Y_ZEBRA - 6.5]],
        targetKmh: 28,
      },
      // Wait the slow crosser out (she needs ~12.8 s from release to clear
      // the carriageway; the stop begins ~6.6 s in).
      { kind: "pause", sec: 9.5, brake: true },
      { kind: "annotation", textBg: "Изчакай я да освободи ЦЯЛАТА пътека — не потегляй по-рано." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6.5], [X_LANE, 120], [X_LANE, 138]],
        targetKmh: 25,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: пропусна пешеходеца и премина едва на чиста пътека." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде бързо приближаване" (PEDESTRIAN_CROSSING_TOO_FAST)
// ---------------------------------------------------------------------------

export function scZebraApproachMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: скоростта не пада, макар че пешеходка вече е на пътеката.",
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
// Mistake demo 2 — „Непропускане на пешеходец" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scZebraApproachMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката „има място“: колата не спира, докато пешеходката пресича.",
      },
      { kind: "glance", mirror: "rear" },
      // 28 km/h — legal and under the approach threshold, so the ONLY fault
      // this demo shows is crossing an OCCUPIED zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходката е на платното, но колата продължава…" },
      {
        // Straight over the occupied crossing (she is still on the far half —
        // the demo passes ~4 m from her, no contact, pure „непропускане").
        kind: "drive",
        points: [[X_LANE, 60], [X_LANE, 120]],
        targetKmh: 28,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът на пътеката има предимство. Пропускаш го с пълно спиране — не се разминаваш с него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScZebraApproachTraceName =
  | "shadow-correct"
  | "mistake-too-fast"
  | "mistake-not-yielded";

const SCRIPTS: Record<ScZebraApproachTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scZebraApproachShadowScript },
  "mistake-too-fast": { kind: "mistake", script: scZebraApproachMistakeTooFastScript },
  "mistake-not-yielded": { kind: "mistake", script: scZebraApproachMistakeNotYieldedScript },
};

/**
 * Record one of the three drives against a loaded zb-v1 document — the
 * TEMPLATE's staged slow-crosser armed (single truth), ambient traffic zero
 * (the harness law). Deterministic: same district → same trace.
 */
export function recordScZebraApproachDrive(
  districtRaw: unknown,
  name: ScZebraApproachTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_ZEBRA_APPROACH_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_ZEBRA_APPROACH.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
