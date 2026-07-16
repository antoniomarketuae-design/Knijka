/**
 * sc-maneuver-3point — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Обратен завой в три точки" (обратен завой, Наредба-38;
 * doc 72 PK-12 „Обръщане в три хода") on the committed ov-narrow-v1 two-way
 * street. No lane actors, ambient traffic ZERO (seed 7): the map hosts only the
 * street, so the ONLY things the stack can grade are the turn itself and any
 * contact with a CURB (two obstacle rects flanking the carriageway).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; reverses travel direction north → south in THREE
 *     movements (forward-left · reverse-right · forward-away), coming to rest
 *     inside the turn corridor facing back — completes the threePointTurn
 *     objective (3 movements);
 *   - „Твърде широк замах" grades EXACTLY COLLISION (the forward swing runs the
 *     nose onto the FAR/west curb at creep speed);
 *   - „Излишни маневри" grades EXACTLY COLLISION (a late over-correction backs
 *     the tail onto the NEAR/east curb).
 *
 * Geometry pinned to content/world/ov-narrow-v1.json: a 240 m two-way street on
 * x = 0, right-lane center x = 4.06, carriageway x ∈ [−8.125, +8.125], limit 40.
 * The turn corridor is centred at (0, 60). The curbs sit just outside the
 * carriageway at x = ±9.0 (rects x ∈ [±8.5, ±9.5], y ∈ [45, 75]); the correct
 * turn keeps the car centre within |x| ≲ 5 and clears them, a too-wide/too-deep
 * swing mounts one. Reverse gear is exempt from lane/wrong-way detectors and the
 * street is TWO-WAY (no wrong-way), so keeping every FORWARD move at creep speed
 * (≤ 4.5 km/h < the 5 km/h `moving` floor) leaves the ONLY gradeable event the
 * curb contact — the sc-park-perp-rev discipline.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MANEUVER_3POINT_ID = "sc-maneuver-3point";

/** Northbound right-lane center of ov-narrow-v1. */
const LANE_X = 4.06;
/** Turn corridor centre (denormalized in the template). */
const TURN_Y = 60;
/** Creep speed for every forward move of the turn (< the 5 km/h `moving` floor). */
const CREEP_KMH = 4;

/**
 * The two curbs flanking the carriageway through the turn zone — the headless
 * twins of the scene's kerb colliders. Just outside the ±8.125 m carriageway at
 * x = ±9.0 (rects x ∈ [±8.5, ±9.5]); a swing that clears them is a clean turn,
 * one that mounts them is a COLLISION at walking speed.
 */
export function narrowCurbObstacles(): ObstacleRect2D[] {
  return [
    {
      x: -9.0,
      y: TURN_Y,
      headingDeg: 0,
      halfWidthM: 0.5,
      halfLengthM: 15,
      withWhat: "staticObject" as const,
    },
    {
      x: 9.0,
      y: TURN_Y,
      headingDeg: 0,
      halfWidthM: 0.5,
      halfLengthM: 15,
      withWhat: "staticObject" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — a clean three-point turn
// ---------------------------------------------------------------------------

export function scManeuver3PointShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Тясна двупосочна улица без кръстовище наблизо — тук се прави обратен завой в три точки." },
      { kind: "glance", mirror: "rear" },
      // Approach north in the right lane, into the turn corridor, and stop.
      { kind: "drive", points: [[LANE_X, 40], [LANE_X, 48], [LANE_X, 54]], targetKmh: 16 },
      { kind: "annotation", textBg: "Спри, огледай се напред и назад — улицата трябва да е чиста в двете посоки, преди да започнеш." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 1.0, brake: true },
      // Movement 1 (forward, full left): swing across to the far/west side.
      { kind: "annotation", textBg: "Първо движение: волан докрай наляво, бавно напред към отсрещния бордюр." },
      {
        kind: "drive",
        points: [[LANE_X, 54], [3.6, 57], [2.2, 59.5], [0, 61], [-3, 60.7], [-5, 61]],
        targetKmh: CREEP_KMH,
      },
      { kind: "pause", sec: 0.6, brake: true },
      // Movement 2 (reverse, full right): back across toward the near/east side.
      { kind: "annotation", textBg: "Второ движение: задна предавка, волан докрай надясно, огледай назад и се върни към отсрещния бордюр." },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[-5, 61], [-2, 60], [1.5, 60.5], [3.5, 62], [4.2, 63.5]],
        targetKmh: CREEP_KMH,
        reverse: true,
      },
      { kind: "pause", sec: 0.6, brake: true },
      // Movement 3 (forward, straighten): pull away facing SOUTH and settle.
      { kind: "annotation", textBg: "Трето движение: напред, изправи волана и излез по платното в обратната посока." },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [[4.2, 63.5], [2, 61], [-1, 59], [-2.5, 57.5], [-2.5, 55]],
        targetKmh: CREEP_KMH,
      },
      { kind: "pause", sec: 1.4, brake: true },
      { kind: "annotation", textBg: "Готово: колата смени посоката на 180° в три движения, без да опре бордюра." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде широк замах" (nose onto the far/west curb = COLLISION)
// ---------------------------------------------------------------------------

export function scManeuver3PointMistakeWideScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: първото движение продължава твърде широко към отсрещния бордюр." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 40], [LANE_X, 48], [LANE_X, 54]], targetKmh: 16 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "annotation", textBg: "Волан наляво, но напред без да следиш докъде стига предницата…" },
      // Forward-left runs on PAST the safe point, mounting the west curb.
      {
        kind: "drive",
        points: [[LANE_X, 54], [2, 58], [-2, 60.5], [-6, 61], [-8, 61]],
        targetKmh: CREEP_KMH,
      },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Предницата се качи на бордюра. В три точки се завива на части — гледай докъде стига колата преди всяко движение." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Излишни маневри" (tail onto the near/east curb = COLLISION)
// ---------------------------------------------------------------------------

export function scManeuver3PointMistakeShuntScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: излишни превключвания и връщане назад без контрол докъде стига задницата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 40], [LANE_X, 48], [LANE_X, 54]], targetKmh: 16 },
      { kind: "pause", sec: 0.8, brake: true },
      // A short forward-left, like the first move…
      { kind: "drive", points: [[LANE_X, 54], [1.5, 58], [-3, 60.5], [-4, 61]], targetKmh: CREEP_KMH },
      { kind: "pause", sec: 0.5, brake: true },
      { kind: "annotation", textBg: "Заден ход надясно, но твърде дълго — задницата отива право в близкия бордюр…" },
      // …then a reverse that backs too far onto the east curb.
      {
        kind: "drive",
        points: [[-4, 61], [0, 60.5], [4, 62], [7, 63], [8, 63.5]],
        targetKmh: CREEP_KMH,
        reverse: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Задницата закачи бордюра. По-малко, но по-точни движения — и наблюдение назад преди всяко връщане." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScManeuver3PointTraceName = "shadow-correct" | "mistake-wide" | "mistake-shunt";

const SCRIPTS: Record<ScManeuver3PointTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scManeuver3PointShadowScript },
  "mistake-wide": { kind: "mistake", script: scManeuver3PointMistakeWideScript },
  "mistake-shunt": { kind: "mistake", script: scManeuver3PointMistakeShuntScript },
};

/**
 * Record one of the three drives against a loaded ov-narrow-v1 document — the
 * two curbs armed, ambient traffic zero (the harness law). collisionMinKmh 0 so
 * even a creep-speed curb touch grades COLLISION (the parking threshold, doc 76
 * §0). Deterministic: same district → same trace.
 */
export function recordScManeuver3PointDrive(
  districtRaw: unknown,
  name: ScManeuver3PointTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MANEUVER_3POINT_ID,
    kind,
    seed: 7,
    obstacles: narrowCurbObstacles(),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
