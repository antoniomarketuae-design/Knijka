/**
 * sc-park-narrow — authored drives (S2-A): ONE correct shadow + TWO mistake
 * demos for „Тясно гнездо" on the committed lot-narrow-v1 district. The
 * scripts are the SOURCE of the committed traces under
 * content/traces/sc-park-narrow/ (§5 zero-violation shadow, §9 exact codes).
 *
 * Geometry pinned to content/world/lot-narrow-v1.json:
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   perpendicular row on the EAST side at 2.5 m pitch: bays at x = 5.03;
 *   target bay lot-bay-3 center (5.03, 0), axis east-west (headingDeg 90);
 *   BOTH direct neighbors occupied (bay-2/4 at y = ∓2.5 — car flanks at
 *   |y| = 1.6, i.e. 0.75 m clearance for the 1.7 m hero at rest);
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * The teaching point vs the P0 lot: the SAME full-lock swing that clears a
 * 2.7 m row (arc radius 4) CLIPS a 2.5 m row — the corridor is 0.2 m tighter
 * per side. The correct narrow entry is a STEEPER, later swing (radius 3 +
 * a 1.1 m straight finish), which passes the north neighbor's aisle corner
 * with ~0.45 m to spare. The wide-swing mistake demo replays the P0-style
 * arc (radius 4.5) and grazes that exact corner at creep speed. The correct
 * pull-past rides x = 0.9 (|laneOffset| 3.16 < the 3.25 m detector envelope);
 * reverse is exempt by A12 law.
 */

import type { DriveScript, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_PARK_NARROW_ID = "sc-park-narrow";

/** Northbound drawn lane center (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Target bay center (lot-bay-3 of lot-narrow-v1). */
const BAY_X = 5.03;
/** Correct pull-past lateral position (see the header envelope note). */
const X_SETUP = 0.9;
/** Pull-past stop: rear bumper past the north neighbor's car (bay-4). */
const Y_SETUP = 5.8;
/** The NARROW swing: steeper than P0's 4 m — the drill's whole point. */
const ARC_R = 3.0;
/** The mistake's wide swing (the P0 habit brought into the tight pocket). */
const WIDE_ARC_R = 4.5;

/** Quarter arc (path heading south → east), car-center path, cw sweep —
 *  the scParkPerpRev helper, reproduced for this template's radii. */
function reverseArc(startX: number, startY: number, r: number): Array<[number, number]> {
  const cx = startX + r;
  const cy = startY;
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const th = (k / 8) * (Math.PI / 2);
    out.push([cx - r * Math.cos(th), cy - r * Math.sin(th)]);
  }
  return out;
}

/** Approach: spawn → right-lane cruise up the approach road. */
const APPROACH: Array<[number, number]> = [
  [X_LANE, -105],
  [X_LANE, -24],
];

/** Slow pull-past along the row at ~1 m lateral distance. */
function pullPastPoints(yStop: number): Array<[number, number]> {
  return [
    [X_LANE, -24],
    [X_LANE, -16],
    [2.4, -11],
    [X_SETUP, -7],
    [X_SETUP, yStop],
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkNarrowShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Тясното място е вдясно, с коли от двете страни. Намали, огледай се и пусни десен мигач.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullPastPoints(Y_SETUP), targetKmh: 10 },
      {
        kind: "annotation",
        textBg: "Подмини мястото и спри, щом задната броня подмине съседната кола.",
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Огледала и рамо — и внимавай: тук дъгата е ПО-СТРЪМНА от обичайната. Широкият замах закача съседа.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      {
        // The narrow-pocket swing: later, steeper (radius 3), leaving a
        // straight 1.1 m finish instead of P0's swept entry.
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, ARC_R],
          ...reverseArc(X_SETUP, ARC_R, ARC_R),
        ],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Сантиметри са: следи двете коли в огледалата и изправи волана." },
      {
        // Straight finish: dead-center stop on the bay center (5.03, 0).
        kind: "drive",
        points: [
          [X_SETUP + ARC_R, 0],
          [BAY_X, 0],
        ],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: точно между линиите, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Широк замах в тясното място" (the P0 habit → clip)
// ---------------------------------------------------------------------------

export function scParkNarrowMistakeWideSwingScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво прави широкият замах от просторното място в тясното гнездо.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullPastPoints(6.3), targetKmh: 10 },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg: "Същата широка дъга, която минаваше на широкото място…",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      {
        // The P0-style sweep (radius 4.5) — mid-arc the rear quarter grazes
        // the north neighbor at creep speed (the geometric COLLISION gate).
        kind: "drive",
        points: [
          [X_SETUP, 6.3],
          [X_SETUP, WIDE_ARC_R],
          ...reverseArc(X_SETUP, WIDE_ARC_R, WIDE_ARC_R),
        ],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задният калник закачи съседната кола по средата на завъртането. В тясно гнездо се влиза по-късно и по-стръмно — с половин око на всяко огледало.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без наблюдение" (scripted consequence)
// ---------------------------------------------------------------------------

export function scParkNarrowMistakeNoObservationScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо без огледала и поглед през рамо.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: pullPastPoints(Y_SETUP), targetKmh: 10 },
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
          [X_SETUP, 3.8],
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

export type ScParkNarrowTraceName =
  | "shadow-correct"
  | "mistake-wide-swing"
  | "mistake-no-observation";

const SCRIPTS: Record<ScParkNarrowTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scParkNarrowShadowScript },
  "mistake-wide-swing": { kind: "mistake", script: scParkNarrowMistakeWideSwingScript },
  "mistake-no-observation": { kind: "mistake", script: scParkNarrowMistakeNoObservationScript },
};

/**
 * Record one of the three drives against a loaded lot-narrow-v1 document —
 * parked-car obstacles armed at the parking threshold. Deterministic.
 */
export function recordScParkNarrowDrive(
  districtRaw: unknown,
  name: ScParkNarrowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_NARROW_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
