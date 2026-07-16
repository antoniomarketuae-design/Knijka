/**
 * sc-crossing-bus-shadow — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Пешеходци иззад спрял автобус" (PE-10, the
 * bus-stop kill zone) on the committed pe-bus-v1 district, recorded with the
 * template's OWN staged crosser (pedestrianDartOut sc-bsh-ped, 1.4 m/s stepping
 * off the NEAR/east curb heading WEST, released only within ~44 m — single
 * truth, imported from the template).
 *
 * A large stopped bus stands at the near (east) curb south of the zebra —
 * modelled as an ObstacleRect2D (BUS_OBSTACLE, withWhat "vehicle") clear of the
 * driving lane. The shadow proves the car passes it without contact; the darter
 * emerges from its shadow into the player's lane.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + PEDESTRIAN_YIELDED (reacted, stopped, waited);
 *   - „Преминаване покрай автобуса" grades EXACTLY PEDESTRIAN_NOT_YIELDED (drove
 *     through the occupied zebra under the 30 km/h approach cap — no too-fast,
 *     no contact with the bus or the pedestrian);
 *   - „Удар в пешеходеца" grades EXACTLY COLLISION (never braked, struck the
 *     darter ON the crossing; stays under the 30 km/h cap and never passes the
 *     line, so the ONLY code is the authored contact).
 *
 * Geometry pinned to content/world/pe-bus-v1.json:
 *   street on x = 0, right-lane center x = 4.06, zebra at y = 88, spawn
 *   pe-spawn-approach (4.06, 15) heading north, limit 50 km/h.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_CROSSING_BUS_SHADOW } from "../lessons/scenario/templates-pe";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_CROSSING_BUS_SHADOW_ID = "sc-crossing-bus-shadow";

/** Northbound right-lane center of pe-bus-v1. */
const X_LANE = 4.06;
/** The staged crossing (pe-x-1). */
const Y_ZEBRA = 88;

/**
 * The stopped bus at the near (east) curb, its nose just south of the zebra —
 * a 12 m × 2.6 m body centered at (8.0, 80), clear of the x = 4.06 driving lane
 * by > 1.7 m. It is the occluder the passenger emerges from; the shadow's SAT
 * test proves the car never touches it (`withWhat: "vehicle"`).
 */
export const BUS_OBSTACLE: ObstacleRect2D = {
  x: 8.0,
  y: Y_ZEBRA - 8,
  headingDeg: 0,
  halfWidthM: 1.3,
  halfLengthM: 6,
  withWhat: "vehicle",
};

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scCrossingBusShadowShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Спрял автобус до пътеката вдясно — приближавай с готовност за спиране, кракът над спирачката." },
      { kind: "glance", mirror: "rear" },
      // ~24 km/h — под прага за приближаване; готов за изскачащ иззад автобуса.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 34]], targetKmh: 24 },
      {
        kind: "annotation",
        textBg: "Пешеходец излиза иззад автобуса на пътеката! Реагирай веднага — спирачка, без да завиваш.",
      },
      {
        // Firm, planned stop 6 m short of the crossing line.
        kind: "drive",
        points: [[X_LANE, 34], [X_LANE, 58], [X_LANE, Y_ZEBRA - 6]],
        targetKmh: 24,
      },
      // Wait the crosser out — the 1.4 m/s pedestrian clears the carriageway in ~13 s.
      { kind: "pause", sec: 13, brake: true },
      { kind: "annotation", textBg: "Изчакай го да освободи цялото платно — не потегляй под носа му." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Пътеката е свободна — премини спокойно." },
      {
        kind: "drive",
        points: [[X_LANE, Y_ZEBRA - 6], [X_LANE, 118], [X_LANE, 132]],
        targetKmh: 22,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: намали пред автобуса, реагира навреме и пропусна изскочилия пешеходец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Преминаване покрай автобуса" (PEDESTRIAN_NOT_YIELDED)
// ---------------------------------------------------------------------------

export function scCrossingBusShadowMistakeNotYieldedScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: колата подминава автобуса, без да пропусне излезлия иззад него пешеходец.",
      },
      { kind: "glance", mirror: "rear" },
      // 24 km/h — legal and under the 30 km/h approach cap, so the ONLY fault is
      // crossing while the pedestrian is still on the zebra.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 24, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на платното, но колата не изчаква…" },
      {
        kind: "drive",
        points: [[X_LANE, 60], [X_LANE, 122]],
        targetKmh: 24,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Спрелият автобус е предупреждение — пешеходецът на пътеката има предимство дори когато изскача иззад него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Удар в пешеходеца" (COLLISION)
// ---------------------------------------------------------------------------

export function scCrossingBusShadowMistakeCollisionScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешка: погледът е другаде, колата не спира при появата на пешеходеца иззад автобуса.",
      },
      { kind: "glance", mirror: "rear" },
      // ~28 km/h, under the 30 km/h approach cap (no too-fast), no braking:
      // the car reaches the zebra and strikes the darter — the ONLY code is the
      // authored contact (the car never passes the line, so no not-yielded).
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 60]], targetKmh: 28, stopAtEnd: false },
      { kind: "annotation", textBg: "Пешеходецът е на пътеката иззад автобуса, а спирачка няма…" },
      { kind: "drive", points: [[X_LANE, 60], [X_LANE, Y_ZEBRA - 2]], targetKmh: 28, stopAtEnd: false },
      // The authored consequence: the darter is struck on the crossing.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.4, brake: true },
      {
        kind: "annotation",
        textBg: "При закрита от автобуса гледка скоростта трябва да позволява спиране при внезапна поява. Ударът прекратява изпита.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScCrossingBusShadowTraceName = "shadow-correct" | "mistake-not-yielded" | "mistake-collision";

const SCRIPTS: Record<
  ScCrossingBusShadowTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scCrossingBusShadowShadowScript },
  "mistake-not-yielded": { kind: "mistake", script: scCrossingBusShadowMistakeNotYieldedScript },
  "mistake-collision": { kind: "mistake", script: scCrossingBusShadowMistakeCollisionScript },
};

/**
 * Record one of the three drives against a loaded pe-bus-v1 document — the
 * TEMPLATE's staged darter armed (single truth), the stopped bus staged as a
 * static obstacle rect, ambient traffic zero. Deterministic: same district →
 * same trace.
 */
export function recordScCrossingBusShadowDrive(
  districtRaw: unknown,
  name: ScCrossingBusShadowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_CROSSING_BUS_SHADOW_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_CROSSING_BUS_SHADOW.staged ?? [])] as StagedEventSpec[],
    obstacles: [BUS_OBSTACLE],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
