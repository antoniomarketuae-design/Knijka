/**
 * sc-vu-door-zone — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Зоната на вратата" (VU-04) on the committed
 * vu-door-v1 street. NO staged actors, ambient traffic ZERO (seed 7): the map
 * hosts the occupied parallel row (meta.scenario.bays → lotObstacleRects, the
 * scene's ScenarioObstacles twins) and the scripts stage the DOOR — the first
 * TIMED obstacle (ObstacleRect2D.trigger): a narrow rect beside the parked
 * car that ARMS when the player first closes within the trigger radius, the
 * classic door-zone ambush, deterministic at any script pace.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations — rides the discipline line (~2.3 m off the
 *     row); the door opens beside it and misses by over a meter;
 *   - „Каране плътно до паркираните коли" grades EXACTLY COLLISION (the
 *     door): hugging at ~0.4 m off the row leaves the swing nowhere to miss;
 *   - „Рязко избягване през непрекъснатата линия" grades EXACTLY
 *     CROSSED_SOLID_LINE: the late dodge clears the door but crosses the М1
 *     осева onto the oncoming bank — the documented one-honest-code
 *     composition (no staged oncoming; the risk swap IS the lesson).
 *
 * Geometry pinned to content/world/vu-door-v1.json: 300 m S→N street on
 * x = 0 (limit 40), northbound lane center x = 4.0625; occupied bays at
 * x = 6.75 (y = 110..191, pitch 9) → parked-car rect flanks at x = 5.85
 * (PARKED_CAR_HALF_WIDTH_M 0.9); М1 solidCenterLine span y = 90..240. The
 * DOOR hangs on the bay at y = 155 (front-left of the northbound-parked car):
 * a 1.1 × 0.18 m panel from the flank into the roadway — x 4.75..5.85 around
 * y 156 — armed when the player first closes within 22 m.
 *
 * SCENE DESCOPE (documented, the template header's ruling): the live scene
 * mounts the hittable parked ROW from the bays but no door prop/collider —
 * the ambush lives in these recorded demos + the scenario copy.
 */

import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_VU_DOOR_ZONE_ID = "sc-vu-door-zone";

/** Northbound lane center of vu-door-v1. */
const LANE_X = 4.06;
/** The door-zone discipline line (car flank ≈ 2.3 m off the parked row). */
const CLEAR_X = 2.6;
/** The hug line (car flank ≈ 0.4 m off the row — inside the door swing). */
const HUG_X = 4.6;

/**
 * The DOOR — the timed obstacle (see the header). withWhat "vehicle": a car
 * door is part of a parked vehicle, and the scene's row carries the same
 * "vehicle" collision tag. The trigger latches on the player's approach
 * (~22 m — around y 134 on any of the three lines), well before the swing is
 * reachable, so shadow and mistakes meet the SAME armed door.
 */
export function doorObstacle(): ObstacleRect2D {
  return {
    x: 5.3,
    y: 156,
    headingDeg: 90, // panel length runs E–W: from the flank into the roadway
    halfWidthM: 0.09,
    halfLengthM: 0.55,
    withWhat: "vehicle",
    trigger: { x: 5.3, y: 156, distM: 22 },
  };
}

/** The full obstacle set: the occupied parked row (bays single truth) + door. */
export function doorZoneObstacles(districtRaw: unknown): ObstacleRect2D[] {
  return [...lotObstacleRects(districtRaw), doorObstacle()];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — the discipline line past the row
// ---------------------------------------------------------------------------

export function scVuDoorShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Вдясно започва плътна редица паркирани коли — отмести се ОЩЕ ПРЕДИ нея." },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 60]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Една отворена врата разстояние от редицата — и по-ниска скорост." },
      {
        kind: "drive",
        points: [[LANE_X, 60], [CLEAR_X, 80], [CLEAR_X, 220]],
        targetKmh: 30,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Врата се отваря пред теб — дистанцията, която държиш, я прави безопасна." },
      {
        kind: "drive",
        points: [[CLEAR_X, 220], [LANE_X, 240], [LANE_X, 285]],
        targetKmh: 35,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: позицията реши всичко — вратата се отвори в празно пространство." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Каране плътно до паркираните коли" (COLLISION — the door)
// ---------------------------------------------------------------------------

export function scVuDoorMistakeHugScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: колата кара на педя от паркираната редица — в зоната на вратата." },
      { kind: "drive", points: [[LANE_X, 15], [HUG_X, 35], [HUG_X, 120]], targetKmh: 34, stopAtEnd: false },
      { kind: "annotation", textBg: "Врата се отваря пред колата — на педя няма нито време, нито място." },
      { kind: "drive", points: [[HUG_X, 120], [HUG_X, 200]], targetKmh: 28, stopAtEnd: false },
      { kind: "drive", points: [[HUG_X, 200], [LANE_X, 215], [LANE_X, 280]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Зоната на вратата е около метър от всяка паркирана кола: позицията се взема преди редицата, не при отварянето (чл. 20).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Рязко избягване през непрекъснатата линия"
// (CROSSED_SOLID_LINE — the risk swap)
// ---------------------------------------------------------------------------

export function scVuDoorMistakeSwerveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: пак на педя от редицата — но този път водачът ще бяга наляво." },
      // The dodge BEGINS in the inter-bay gap (y ≈ 141.8, between the parked
      // rects at y 137 and 146): the tail swings east as the nose dives left,
      // and starting beside a parked car would clip it — the door, not the
      // row, is this demo's contact story.
      { kind: "drive", points: [[LANE_X, 15], [HUG_X, 35], [HUG_X, 141.8]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Вратата се отваря — и колата свива рязко в насрещното, през непрекъснатата М1." },
      {
        kind: "drive",
        points: [
          [HUG_X, 141.8],
          [3.0, 147.5],
          [0.5, 151.5],
          [-1.2, 155.5],
          [-1.2, 168],
          [0.5, 172],
          [3.0, 178],
          [LANE_X, 185],
          [LANE_X, 285],
        ],
        targetKmh: 30,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Избегна вратата, но през плътната осева срещу насрещното — размяна на риск за по-голям. Дистанцията ПРЕДИ редицата прави маневрата излишна (чл. 20).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuDoorTraceName = "shadow-correct" | "mistake-hug" | "mistake-swerve";

const SCRIPTS: Record<ScVuDoorTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scVuDoorShadowScript },
  "mistake-hug": { kind: "mistake", script: scVuDoorMistakeHugScript },
  "mistake-swerve": { kind: "mistake", script: scVuDoorMistakeSwerveScript },
};

/**
 * Record one of the three drives against a loaded vu-door-v1 document — the
 * bays row + the timed door armed (single truth), ambient traffic zero, ANY
 * contact grades (collisionMinKmh 0 — the compileScenario live parity).
 * Deterministic: same district → same trace.
 */
export function recordScVuDoorDrive(
  districtRaw: unknown,
  name: ScVuDoorTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_DOOR_ZONE_ID,
    kind,
    seed: 7,
    obstacles: doorZoneObstacles(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
