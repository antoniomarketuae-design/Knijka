/**
 * sc-crossing-dart — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Внезапен пешеходец на пътеката" (PE-02 dart-out +
 * PE-04 occlusion) on the committed pe-dart-v1 district, recorded with the
 * template's OWN staged darter (pedestrianDartOut sc-drt-ped, 1.6 m/s, released
 * only when the player closes within 40 m — single truth, imported from the
 * template).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (reacted, stopped, waited);
 *   - „Преминаване през пешеходеца" grades EXACTLY PEDESTRIAN_NOT_YIELDED (drove
 *     through the occupied zebra, under the 30 km/h approach cap so no
 *     too-fast, never a contact);
 *   - „Удар в пешеходеца" grades EXACTLY COLLISION (never braked, hit the darter
 *     ON the crossing; the car stays under the 30 km/h approach cap and never
 *     passes the line, so the ONLY code is the authored contact).
 *
 * Geometry pinned to content/world/pe-dart-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 80, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_DART } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_DART_ID = "sc-crossing-dart";

/** Northbound right-lane center of pe-dart-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 80;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingDartShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Приближавай пътеката с готовност за спиране — ъгловият магазин крие тротоара вляво." },
      { kind: "glance", mirror: "rear" },
      // ~26 km/h — under the 30 km/h approach cap; ready for the surprise.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 34]], targetKmh: 26 },
      {
        kind: "annotation",
        textBg: "Пешеходец изскача на пътеката! Реагирай веднага — спирачка, без да завиваш встрани.",
      },
      {
        // Firm, planned stop 6 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 34], [X_LANE, 58], [X_LANE, Y_ZEBRA - 6]],
        targetKmh: 26,
      },
      // Wait the darter out — the 1.6 m/s crosser clears the carriageway in ~11 s.
      { kind: "pause", sec: 11, brake: true },
      { kind: "annotation", textBg: "Изчакай го да освободи цялото платно — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6], [X_LANE, 110], [X_LANE, 128]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: реагира навреме, спря и пропусна внезапно появилия се пешеходец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Преминаване през пешеходеца" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingDartMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата не реагира на внезапната поява и продължава през пътеката.",
      },
      { kind: "glance", mirror: "rear" },
      // 24 km/h — legal and under the 30 km/h approach cap, so the ONLY fault is
      // crossing while the pedestrian is still on the zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на платното, но колата не изчаква…" },
      {
        kind: "drive",
        points: [[X_LANE, 55], [X_LANE, 118]],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Дори когато пешеходецът изскача изненадващо, предимството е негово — преминаването под носа му е опасна грешка.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Удар в пешеходеца" (COLLISION)
// ---------------------------------------------------------------------------

export function scCrossingDartMistakeCollisionScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: погледът е другаде, колата изобщо не спира при появата на пешеходеца.",
      },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h, under the 30 km/h approach cap (no too-fast), no braking:
      // the car reaches the zebra and strikes the darter — the ONLY code is the
      // authored contact (the car never passes the line, so no not-yielded).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 55]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на пътеката, а спирачка няма…" },
      { kind: "drive", points: [[X_LANE, 55], [X_LANE, Y_ZEBRA - 2]], targetKmh: 28, stopAtEnd: false },
      // The authored consequence: the darter is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "Пред закрита пътека скоростта и вниманието трябва да позволяват спиране при внезапна поява. Ударът прекратява изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingDartTraceName = "shadow-correct" | "mistake-not-yielded" | "mistake-collision";

const SCRIPTS: Record<
  ScCrossingDartTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingDartShadowScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingDartMistakeNotYieldedScript },
  "mistake-collision": { kind: "mistake", script: scCrossingDartMistakeCollisionScript },
};

/**
 * Record one of the three drives against a loaded pe-dart-v1 document — the
 * TEMPLATE's staged darter armed (single truth), ambient traffic zero.
 * Deterministic: same district → same trace.
 */
export function recordScCrossingDartDrive(
  districtRaw: unknown,
  name: ScCrossingDartTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_DART_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_DART.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
