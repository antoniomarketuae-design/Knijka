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
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * THE MANOEUVRE, AS THE PRODUCT CAR DRIVES IT (catalogue-demo-curvature:
 * dae908c7, family «curvpark2», 2026-11-06). Until then the reverse S was two
 * 4 m polyline arcs swung to 47.5° («~45°»): the ghost pivoted at every vertex
 * (3.25 m over its tightest metre). It is now the parking kit's `kerbPark`
 * (./parkKit) on the 4.6 m drivable circle: from ориентир 1 — beside the lead
 * car, rear bumpers level, its flank 0.74 m away on the live collider (0.85 m
 * on the gate's rect) — the car rolls straight back 0.6 m, swings to ≈ 38°
 * (ориентир 2: «около 40°», the measured angle rounded to the nearest 5°,
 * integrator ruling R6), counter-swings to parallel deep in the slot, 0.44 m
 * off the rear car, and pulls 1.8 m forward to the middle (instruction 6,
 * «центрирай се»). Every pose keeps ≥ 0.25 m from both cars as the product's
 * boxes see them — pinned in traces/__tests__/park-family-drivable.test.ts.
 * The setup rides x = 3.68, beside the drawn lane centre; reverse is exempt
 * from the lane detectors by A12 law.
 */

import { authoredDrive, DRIVABLE_MIN_CENTRE_RADIUS_M, straight, turn, withRunOut } from "./drivablePath";
import {
  aisleSEndY,
  aisleTo,
  CREEP_KMH,
  kerbPark,
  LOOK_BEFORE_REVERSE,
  lotObstacleRects,
  parkedRect,
  REVERSE_KMH,
  SETTLE,
  leftSetUpMove,
  toSetup,
  untilContact,
  D2R,
  type KerbPark,
  FEEDER_END_Y,
  lotApproach,
} from "./parkKit";
import type { DriveScript, ObstacleRect2D, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";

export const SC_PARK_PARALLEL_ID = "sc-park-parallel";

/** Northbound drawn lane center (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Target bay center (lot-bay-3 of lot-par-v1). */
const BAY_X = 6.28;
/** Correct setup (ориентир 1): beside the lead car, rear bumpers level. */
const X_SETUP = 3.68;
/** Setup stop: rear bumper level with the lead car's rear bumper (4.25). */
const Y_SETUP = 6.3;

/** The kerb park: roll back 0.6 m, ramps of 1 m, at rest parallel deep in the slot, one pull to the middle. */
const KP_OPTS = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, restY: 0, rampInM: 1.0, rampM: 1.0, shortDeg: 0, s0M: 0.6 };
const KP: KerbPark = kerbPark(X_SETUP, Y_SETUP, { x: BAY_X, y: 0 }, KP_OPTS);
/** The far mistake's setup: 2.12 m off the lead car's flank on its live collider (2.23 m on the gate's rect). */
const X_FAR = 2.3;

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PARK_PARALLEL_GEOMETRY = {
  radiusM: KP_OPTS.radiusM,
  setup: { ...KP.setup },
  swingDeg: KP.swingDeg,
  rollBackM: KP.s0M,
  reverseEnd: { ...KP.b.end },
  pullM: KP.fwd.lengthM,
  farSetupX: X_FAR,
} as const;

/**
 * Approach: spawn → right-lane cruise up the approach road — kept for
 * sc-park-parallel/mistake-no-observation alone, which is byte-for-byte the
 * drive it was (never an offender); the re-authored demos use parkKit
 * `lotApproach`, at the aisle's pace where the aisle begins.
 */
const APPROACH: Array<[number, number]> = [
  [X_LANE, -105],
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
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: FEEDER_END_Y }),
      {
        kind: "annotation",
        textBg: "Свободното място е вдясно, между двете коли. Намали и застани успоредно на предната кола.",
      },
      // The 0.38 m onto the setup line is a correction inside the lane, not a
      // set-up move (less than the car's half width — parkKit `leftSetUpMove`):
      // no signal for it; the bay's right signal is given at the setup.
      ...toSetup(aisleTo(X_SETUP, Y_SETUP, { radiusM: 30 }), 9),
      {
        kind: "annotation",
        textBg:
          "Ориентир 1: успоредно на предната кола, на половин до един метър — задна броня срещу задна броня.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Сега десен мигач. Преди задната: двете огледала, после през рамо — и завърти докрай надясно.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...LOOK_BEFORE_REVERSE,
      // The gear goes in after the looks, never on the instant of the last one
      // (so every look is heard before R on every display — grade-grid ROUND 8).
      { kind: "pause", sec: 0.4, brake: true },
      // Straight back 0.6 m, then the first half of the S — wheel right.
      { kind: "drive", points: withRunOut(KP.a.points), targetKmh: REVERSE_KMH, reverse: true },
      {
        kind: "annotation",
        textBg:
          "Ориентир 2: под около 40° си. Спри и погледни назад. Щом предната броня подмине задната броня на съседа — докрай наляво (ориентир 3).",
      },
      { kind: "pause", sec: 1.0, brake: true },
      // Mid-maneuver observation (instruction 4) — the during-reverse moment.
      { kind: "glance", mirror: "rear" },
      // The counter-swing, down to parallel deep in the slot.
      { kind: "drive", points: withRunOut(KP.b.points), targetKmh: CREEP_KMH, reverse: true },
      { kind: "annotation", textBg: "И леко напред, докато застанеш по средата на мястото." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "drive", points: withRunOut(KP.fwd.points), targetKmh: CREEP_KMH },
      // The final check before the definitive stop (rubric moment 3).
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: успоредно на линиите, центрирано, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде далеч от предната кола" (slot geometry collapses)
// ---------------------------------------------------------------------------

/**
 * The same S as the correct demo — the same roll back, the same 4.6 m swings
 * to the same angle — begun 2.2 m off the lead car instead of 0.74 m. It ends
 * parallel, but 1.4 m short of the kerb line; the driver then tries to get
 * there backwards, wheel right again (the doomed correction), and the tail
 * swings into the rear car — cut where that contact has happened (parkKit
 * `untilContact`, on the smaller of the gate's rect and the live collider).
 */
export function scParkParallelMistakeFarScript(): DriveScript {
  const k = 1 / KP_OPTS.radiusM;
  const sameS = authoredDrive(
    { x: X_FAR, y: Y_SETUP, headingDeg: 0 },
    [
      straight(KP.s0M),
      ...turn(KP.swingDeg * D2R, k, KP_OPTS.rampInM, KP_OPTS.rampM),
      ...turn(KP.swingDeg * D2R, -k, KP_OPTS.rampM, KP_OPTS.rampM),
    ],
    -1,
  );
  const correction = authoredDrive(sameS.end, [...turn(30 * D2R, k, 1.0, 1.0), straight(3)], -1);
  const REAR_CAR = parkedRect(BAY_X, -6.5, 0);
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата спира на повече от два метра от предната кола.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: FEEDER_END_Y }),
      ...leftSetUpMove(aisleTo(X_FAR, Y_SETUP), 9, aisleSEndY(X_FAR)),
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        kind: "annotation",
        textBg: "От толкова далеч същите завъртания не стигат до реда…",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "drive", points: withRunOut(sameS.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "drive",
        points: untilContact(correction.points, -1, REAR_CAR, "vela_h3"),
        targetKmh: CREEP_KMH,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата удари задната кола. Правилно: започни на половин до един метър от съседа — геометрията на маневрата зависи от изходната позиция.",
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
