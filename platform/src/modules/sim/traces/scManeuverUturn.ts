/**
 * sc-maneuver-uturn — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Обръщане в едно движение" (обратен завой на широк
 * булевард; doc 72 OV-17 / PK-12) on the committed wb-boulevard-v1 two-way
 * boulevard (2 lanes per direction, carriageway |x| ≤ 16.25). No lane actors,
 * ambient traffic ZERO (seed 7): the map hosts only the street, so the ONLY
 * things the stack can grade are the turn itself and any contact with a CURB
 * (two obstacle rects at x = ±17 flanking the carriageway).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; reverses travel direction north → south in ONE
 *     smooth FORWARD arc (no reverse gear → the threePointTurn evaluator reports
 *     movements = 1), coming to rest inside the turn corridor facing back;
 *   - „Твърде широка дъга" grades EXACTLY COLLISION (a too-shallow arc runs the
 *     nose onto the FAR/west curb at creep speed);
 *   - „Замах надясно" grades EXACTLY COLLISION (an over-wide setup swing to the
 *     right mounts the NEAR/east curb before the turn).
 *
 * Geometry pinned to content/world/wb-boulevard-v1.json: a 200 m boulevard on
 * x = 0, outer-lane centre x = 12.19, carriageway x ∈ [−16.25, +16.25], limit
 * 40. The turn corridor is centred at (0, 76). The curbs sit just outside the
 * carriageway at x = ±17 (rects x ∈ [±16, ±18], y ∈ [62, 94]); the correct
 * single arc keeps the car centre within |x| ≲ 12.2 (body ≲ 13) and clears them.
 * Every FORWARD move is at creep speed (≤ 4.5 km/h < the 5 km/h `moving` floor)
 * on a TWO-WAY street (no wrong-way), so the ONLY gradable event is a curb
 * contact — the sc-maneuver-3point discipline, one arc instead of three shunts.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MANEUVER_UTURN_ID = "sc-maneuver-uturn";

/** Northbound OUTER-lane center of wb-boulevard-v1. */
const LANE_OUT = 12.19;
/** Turn corridor centre (denormalized in the template). */
const TURN_Y = 76;
/** Creep speed for every move of the turn (< the 5 km/h `moving` floor). */
const CREEP_KMH = 4;

/**
 * The two kerbs flanking the boulevard through the turn zone — the headless
 * twins of the scene's kerb colliders. Just outside the ±16.25 m carriageway at
 * x = ±17 (rects x ∈ [±16, ±18]); the correct single arc clears them, a
 * too-wide sweep or a right-hand setup swing mounts one at walking speed.
 */
export function boulevardCurbObstacles(): ObstacleRect2D[] {
  return [
    { x: -17, y: TURN_Y + 2, headingDeg: 0, halfWidthM: 1, halfLengthM: 16, withWhat: "staticObject" as const },
    { x: 17, y: TURN_Y + 2, headingDeg: 0, halfWidthM: 1, halfLengthM: 16, withWhat: "staticObject" as const },
  ];
}

/** The single-arc U-turn polyline: a semicircle (R = 12.19) centred at (0, 76),
 *  swept from the northbound outer lane to the southbound outer lane. */
const UTURN_ARC: ReadonlyArray<readonly [number, number]> = [
  [12.19, 76.0],
  [11.26, 80.66],
  [8.62, 84.62],
  [4.66, 87.26],
  [0, 88.19],
  [-4.66, 87.26],
  [-8.62, 84.62],
  [-11.26, 80.66],
  [-12.19, 76.0],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — a clean single-arc U-turn
// ---------------------------------------------------------------------------

export function scManeuverUturnShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Широк булевард без кръстовище наблизо — тук обръщането се прави наведнъж, в една дъга." },
      { kind: "glance", mirror: "rear" },
      // Approach north in the right (outer) lane, into the turn corridor, and stop.
      { kind: "drive", points: [[LANE_OUT, 20], [LANE_OUT, 45], [LANE_OUT, 68]], targetKmh: 16 },
      { kind: "annotation", textBg: "Спри, огледай се напред и назад — платното трябва да е чисто в двете посоки, преди да започнеш." },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 0.8, brake: true },
      // The single forward arc: full left, one smooth sweep across the boulevard.
      { kind: "annotation", textBg: "Волан наляво и една плавна дъга през насрещните ленти — без връщане назад." },
      { kind: "drive", points: UTURN_ARC, targetKmh: CREEP_KMH },
      // Straighten out and settle in the opposite-direction outer lane.
      { kind: "drive", points: [[-LANE_OUT, 72], [-LANE_OUT, 66]], targetKmh: CREEP_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: колата смени посоката на 180° в едно движение, без да опре бордюра." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде широка дъга" (nose onto the far/west curb = COLLISION)
// ---------------------------------------------------------------------------

export function scManeuverUturnMistakeWideScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: дъгата тръгва прекалено плитко и излиза към отсрещния бордюр." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 20], [LANE_OUT, 68]], targetKmh: 16 },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "annotation", textBg: "Волан наляво, но твърде малко — колата се носи широко към западния бордюр…" },
      // A shallow, over-wide sweep whose body runs onto the west curb (x ≤ −16).
      {
        kind: "drive",
        points: [[LANE_OUT, 70], [10, 74], [4, 78], [-4, 80], [-11, 80], [-16.5, 78], [-16.5, 74]],
        targetKmh: CREEP_KMH,
      },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Предницата се качи на бордюра. Дори на широко платно завърти волана достатъчно и гледай докъде стига колата." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Замах надясно" (tail/nose onto the near/east curb = COLLISION)
// ---------------------------------------------------------------------------

export function scManeuverUturnMistakeSwingScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: замах надясно „за повече място“ преди завоя — право към близкия бордюр." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_OUT, 20], [LANE_OUT, 68]], targetKmh: 16 },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "annotation", textBg: "Колата се засилва надясно към източния бордюр, преди изобщо да е започнала да завива…" },
      // An over-wide setup swing to the right mounts the east curb (x ≥ 16).
      { kind: "drive", points: [[LANE_OUT, 70], [14, 72], [16.3, 74], [16.3, 77]], targetKmh: CREEP_KMH },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Закачи близкия бордюр. Обръщането се започва от лентата — широкото платно дава мястото, не замахът." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScManeuverUturnTraceName = "shadow-correct" | "mistake-wide" | "mistake-swing";

const SCRIPTS: Record<ScManeuverUturnTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scManeuverUturnShadowScript },
  "mistake-wide": { kind: "mistake", script: scManeuverUturnMistakeWideScript },
  "mistake-swing": { kind: "mistake", script: scManeuverUturnMistakeSwingScript },
};

/**
 * Record one of the three drives against a loaded wb-boulevard-v1 document — the
 * two curbs armed, ambient traffic zero (the harness law). collisionMinKmh 0 so
 * even a creep-speed curb touch grades COLLISION (the parking threshold, doc 76
 * §0). Deterministic: same district → same trace.
 */
export function recordScManeuverUturnDrive(
  districtRaw: unknown,
  name: ScManeuverUturnTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MANEUVER_UTURN_ID,
    kind,
    seed: 7,
    obstacles: boulevardCurbObstacles(),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
