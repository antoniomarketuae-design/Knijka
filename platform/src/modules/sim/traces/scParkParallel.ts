/**
 * sc-park-parallel — authored drives (S2-A, the scParkPerpRev mold): ONE
 * correct shadow + TWO mistake demos for „Успоредно паркиране" on the
 * committed lot-par-v1 district. The scripts are the SOURCE of the committed
 * traces under content/traces/sc-park-parallel/ — the trace gate replays
 * exactly these through the production stack (§5 zero-violation shadow,
 * §9 stage-5 exact mistake codes).
 *
 * Geometry pinned to content/world/lot-par-v1.json:
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   parallel slot row on the EAST curb: bays at x = 6.28, pitch 6.5,
 *   parked-car flank (west) at x = 5.38;
 *   target bay lot-bay-3 center (6.28, 0), axis north (headingDeg 0);
 *   lead car (bay-4) y ∈ [4.25, 8.75], rear car (bay-2) y ∈ [−8.75, −4.25];
 *   spawn lot-spawn-approach (0, −105) heading north.
 *
 * The correct maneuver is the textbook reverse S with a forward finish (the
 * ~45° entry, three reference points): pull up beside the lead car (~0.85 m
 * gap, rear bumpers level — ref 1), reverse straight until the rear axle
 * clears the lead's bumper, full right lock to ~47° (ref 2), counter-steer
 * full left when the nose clears the lead's rear bumper (ref 3), come to
 * rest DEEP in the slot near the rear car, then pull forward to center —
 * the real-world three-point finish. Ending the reverse deep is what keeps
 * the swinging nose 0.75+ m off the lead car's corner (verified by SAT scan
 * over the whole path; a symmetric S that ends ON the center clips the lead
 * by ~0.2 m). Setup rides x ≈ 3.7 — near the drawn lane center, so no lane
 * detector is ever near arming; reverse is exempt by A12 law.
 */

import type { DriveScript, ObstacleRect2D, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_PARK_PARALLEL_ID = "sc-park-parallel";

/** Northbound drawn lane center (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Target bay center (lot-bay-3 of lot-par-v1). */
const BAY_X = 6.28;
/** Correct setup: beside the lead car, ~0.85 m lateral gap
 *  (= BAY_X − 2·R_S·(1 − cos ENTRY), rounded — the S lands on the bay line). */
const X_SETUP = 3.68;
/** Arc radius of both S halves (car-center path), m — full-lock-ish, the
 *  prototype's realism envelope. */
const R_S = 4.0;
/** Max entry angle of the S, degrees (the „~45°" teaching reference). */
const ENTRY_DEG = 47.5;
/** Where the S begins (top of the straight-back phase);
 *  ≈ Y_S_END + 2·R_S·sin(ENTRY_DEG). */
const Y_S_TOP = 4.9;
/** The reverse ends DEEP in the slot (tangent-south at y ≈ −1, straight
 *  tail to −1.3) — the forward pull to center is the three-point finish. */
const Y_REV_STOP = -1.3;
/** Setup stop: rear bumper level with the lead car's rear bumper (4.25). */
const Y_SETUP = 6.3;

/**
 * The reverse S (car-center path): arc A sweeps 0→ENTRY_DEG around a center
 * east of the start (full right lock in reverse), arc B is its point-mirror
 * (full left), ending tangent-south on the bay line. Returns the polyline
 * WITHOUT the start point.
 */
function reverseSPoints(startX: number, startY: number): Array<[number, number]> {
  const cx = startX + R_S;
  const cy = startY;
  const out: Array<[number, number]> = [];
  const steps = 8;
  for (let k = 1; k <= steps; k++) {
    const th = ((k / steps) * ENTRY_DEG * Math.PI) / 180;
    out.push([cx - R_S * Math.cos(th), cy - R_S * Math.sin(th)]);
  }
  const [mx, my] = out[out.length - 1]; // the S midpoint
  const first: Array<[number, number]> = [[startX, startY], ...out.slice(0, steps - 1)];
  for (let k = steps - 1; k >= 0; k--) {
    const [px, py] = first[k];
    out.push([2 * mx - px, 2 * my - py]);
  }
  return out;
}

/** Approach: spawn → right-lane cruise up the approach road. */
const APPROACH: Array<[number, number]> = [
  [0, -105],
  [0, -103],
  [X_LANE, -92],
  [X_LANE, -24],
];

/** Forward pull-up beside the lead car (essentially lane-center — no lane
 *  detector ever arms; the row's parked flanks sit 0.64 m east). */
function pullUpPoints(x: number): Array<[number, number]> {
  return [
    [X_LANE, -24],
    [X_LANE, -16],
    [x, -8],
    [x, Y_SETUP],
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkParallelShadowScript(): DriveScript {
  const s = reverseSPoints(X_SETUP, Y_S_TOP);
  const mid = s[7]; // end of arc A (the ~45° reference pose)
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Свободното място е вдясно, между двете коли. Намали, огледай се и пусни десен мигач.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullUpPoints(X_SETUP), targetKmh: 10 },
      {
        kind: "annotation",
        textBg:
          "Ориентир 1: успоредно на предната кола, на половин до един метър — задна броня срещу задна броня.",
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg: "Преди задната: двете огледала, после през рамо — и завърти докрай надясно.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      {
        // Straight-back until the rear axle clears the lead's bumper, then
        // the full-right half of the S.
        kind: "drive",
        points: [[X_SETUP, Y_SETUP], [X_SETUP, Y_S_TOP], ...s.slice(0, 8)],
        targetKmh: 4,
        reverse: true,
      },
      // Mid-maneuver observation (instruction 4) — the during-reverse moment.
      { kind: "glance", mirror: "rear" },
      {
        kind: "annotation",
        textBg:
          "Ориентир 2: под ~45° си. Щом предната броня подмине задната броня на съседа — докрай наляво (ориентир 3).",
      },
      {
        // Counter-steer half of the S, ending DEEP in the slot near the rear
        // car — that depth is what keeps the swinging nose off the lead car.
        kind: "drive",
        points: [mid, ...s.slice(8), [BAY_X, Y_REV_STOP]],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "annotation", textBg: "И леко напред, докато застанеш по средата на мястото." },
      {
        // The three-point finish: pull forward to the slot center.
        kind: "drive",
        points: [
          [BAY_X, Y_REV_STOP],
          [BAY_X, 0],
        ],
        targetKmh: 3,
      },
      // The final check before the definitive stop (rubric moment 3).
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: успоредно на линиите, центрирано, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде далеч от предната кола" (slot geometry collapses)
// ---------------------------------------------------------------------------

export function scParkParallelMistakeFarScript(): DriveScript {
  const xFar = 2.3; // ~2.2 m off the lead car — the broken setup
  const s = reverseSPoints(xFar, Y_S_TOP);
  const mid = s[7];
  const sEnd = s[s.length - 1]; // ≈ (4.90, −1.0) — a car-width short of the curb
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата спира на близо два метра от предната кола.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullUpPoints(xFar), targetKmh: 10 },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg: "От толкова далеч същите завъртания не стигат до реда…",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[xFar, Y_SETUP], [xFar, Y_S_TOP], ...s.slice(0, 8)],
        targetKmh: 4,
        reverse: true,
      },
      {
        kind: "drive",
        points: [mid, ...s.slice(8)],
        targetKmh: 4,
        reverse: true,
      },
      {
        // The doomed correction: still angled, still short of the curb, the
        // driver keeps backing toward the slot — the tail runs into the rear
        // car at creep speed (the geometric COLLISION gate).
        kind: "drive",
        points: [sEnd, [5.5, -2.6], [6.1, -4.4]],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата удари задната кола. Правилно: започни на около половин метър от съседа — геометрията на маневрата зависи от изходната позиция.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без наблюдение" (scripted consequence)
// ---------------------------------------------------------------------------

export function scParkParallelMistakeNoObservationScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо без огледала и поглед през рамо.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullUpPoints(X_SETUP), targetKmh: 10 },
      { kind: "pause", sec: 0.8, brake: true },
      {
        kind: "annotation",
        textBg: "Задна предавка ВЕДНАГА — без огледала, без рамо. Това е грешката.",
      },
      {
        // Reverse blind; a pedestrian is walking behind the car.
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, 4.4],
        ],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът зад колата остана невидим до удара. Чл. 40: убеди се, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkParallelTraceName =
  | "shadow-correct"
  | "mistake-far-from-lead"
  | "mistake-no-observation";

const SCRIPTS: Record<ScParkParallelTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scParkParallelShadowScript },
  "mistake-far-from-lead": { kind: "mistake", script: scParkParallelMistakeFarScript },
  "mistake-no-observation": { kind: "mistake", script: scParkParallelMistakeNoObservationScript },
};

/**
 * Record one of the three drives against a loaded lot-par-v1 document —
 * parked-car obstacles armed from the district's own occupancy at the
 * parking threshold (collisionMinKmh 0). Deterministic.
 */
export function recordScParkParallelDrive(
  districtRaw: unknown,
  name: ScParkParallelTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  const obstacles: ObstacleRect2D[] = lotObstacleRects(districtRaw);
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_PARALLEL_ID,
    kind,
    seed: 7,
    obstacles,
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
