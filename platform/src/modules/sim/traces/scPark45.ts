/**
 * sc-park-45 — authored drives (S2-A): ONE correct shadow + TWO mistake
 * demos for „Паркиране на 45°" on the committed lot-45-v1 district. The
 * scripts are the SOURCE of the committed traces under
 * content/traces/sc-park-45/ (§5 zero-violation shadow, §9 exact codes).
 *
 * Geometry pinned to content/world/lot-45-v1.json:
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   echelon row on the EAST side: bays at x = 4.8, axis 45°, pitch 3.82;
 *   target bay lot-bay-3 center (4.8, 0); occupied neighbors at y ∓3.82/∓7.64;
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * FORWARD entry (doc-72 PK-02 echelon variant; the spec's parkInBay carries
 * entry "forward"): swing slightly LEFT on the aisle (x ≈ 1.0 — laneOffset
 * 3.06 m, still inside the 3.25 m detector envelope), then one smooth
 * right-hand arc onto the 45° center line y = x − 4.8, which threads the
 * corridor between the two neighbor cars dead-center (±0.95 m flank margins).
 * The corner-cut mistake shifts that line 1.7 m toward the near neighbor
 * (y = x − 6.5) so the flank grazes the parked car at creep speed.
 */

import type { DriveScript, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_PARK_45_ID = "sc-park-45";

/** Northbound drawn lane center (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Target bay center (lot-bay-3 of lot-45-v1). */
const BAY_X = 4.8;
/** Turn-in arc radius (car-center path), m. */
const ARC_R = 4.0;

/**
 * Right-hand turn-in arc: tangent-north at (x0, y1), sweeping to the 45°
 * tangent point that lands EXACTLY on the diagonal y = x − b (the bay center
 * line for b = 4.8). y1 = x0 − b − R(1 − cos45 + sin45 − …) — solved:
 * y1 = x0 − b − R(sin45 − (1 − cos45)) = x0 − b − 0.414R.
 */
function turnInArc(x0: number, b: number): Array<[number, number]> {
  const y1 = x0 - b - ARC_R * (Math.SQRT1_2 - (1 - Math.SQRT1_2));
  const cx = x0 + ARC_R;
  const cy = y1;
  const out: Array<[number, number]> = [[x0, y1]];
  for (let k = 1; k <= 5; k++) {
    const th = ((k / 5) * 45 * Math.PI) / 180;
    // Tangent-NORTH at θ=0, curving right (east) toward the 45° diagonal.
    out.push([cx - ARC_R * Math.cos(th), cy + ARC_R * Math.sin(th)]);
  }
  return out;
}

/** Approach: spawn → right-lane cruise, stopping short of the echelon row. */
const APPROACH: Array<[number, number]> = [
  [X_LANE, -105],
  [X_LANE, -30],
];

/** Ease left on the aisle to open the right-hand swing (forward, ≤ 10 km/h;
 *  |laneOffset| peaks at 3.06 m — under the 3.25 m detector). */
function veerPoints(xEntry: number): Array<[number, number]> {
  return [
    [X_LANE, -30],
    [X_LANE, -24],
    [2.6, -17],
    [xEntry + 0.3, -12],
    [xEntry, -9.5],
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPark45ShadowScript(): DriveScript {
  const arc = turnInArc(1.0, BAY_X);
  const y1 = arc[0][1]; // where the straight run ends and the arc begins
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Косите места се отварят надясно. Дръпни се леко вляво и намали.",
      },
      { kind: "drive", points: veerPoints(1.0), targetKmh: 10 },
      {
        kind: "annotation",
        textBg: "Огледало, рамо, десен мигач — и завий, щом бронята се изравни с ъгъла на мястото.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        // The straight run to the turn-in point (still forward, slow).
        kind: "drive",
        points: [[1.0, -9.5], [1.0, y1]],
        targetKmh: 6,
      },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "Плавна дъга под 45° — следи съседната кола в дясното огледало.",
      },
      {
        // One smooth arc onto the 45° center line, then straight to center.
        kind: "drive",
        points: [...arc, [3.5, -1.3], [BAY_X, 0]],
        targetKmh: 5,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // holdSec 1.5 + margin — the parkInBay contract completes at rest.
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: по посоката на линиите, центрирано, без подминаване." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подмината линия на гнездото" (overshoot → curb strike)
// ---------------------------------------------------------------------------

export function scPark45MistakeOvershootScript(): DriveScript {
  const arc = turnInArc(1.0, BAY_X);
  const y1 = arc[0][1];
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво става, когато влизането продължи след линията на гнездото.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "drive", points: veerPoints(1.0), targetKmh: 10 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[1.0, -9.5], [1.0, y1]], targetKmh: 6 },
      {
        kind: "annotation",
        textBg: "Влизането е добро… но погледът остава напред и никой не брои линиите.",
      },
      {
        // Correct entry line, but pushed ~1.5 m past the bay center — the
        // nose crosses the end line and the front wheel meets the curb strip
        // (an authored consequence at creeping speed).
        kind: "drive",
        points: [...arc, [3.5, -1.3], [BAY_X, 0], [5.85, 1.05]],
        targetKmh: 5,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "staticObject" },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предното колело опря бордюра — колата подмина крайната линия. Спри, когато страничните линии застанат успоредно на теб, не когато бордюрът те спре.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Подрязан ъгъл на съседа" (tight diagonal → 2 km/h clip)
// ---------------------------------------------------------------------------

export function scPark45MistakeCornerCutScript(): DriveScript {
  // The same turn-in, but onto the line y = x − 6.5 — 1.2 m closer to the
  // near neighbor than the correct y = x − 4.8: the right flank grazes the
  // parked car's aisle-side corner at walking speed (geometric COLLISION).
  const arc = turnInArc(1.4, 6.5);
  const y1 = arc[0][1];
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: завоят тръгва твърде рано и дъгата минава плътно до съседа.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "drive",
        points: [
          [X_LANE, -30],
          [X_LANE, -24],
          [2.6, -18],
          [1.7, -13],
          [1.4, -10],
        ],
        targetKmh: 8,
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        kind: "annotation",
        textBg: "Дъгата реже към ъгъла на паркираната кола…",
      },
      {
        // Creep the tight diagonal — the graze IS the demonstrated mistake.
        kind: "drive",
        points: [[1.4, -10], [1.4, y1], ...arc.slice(1), [3.6, -2.9], [4.6, -1.9]],
        targetKmh: 4.5,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Страницата закачи ъгъла на съседа — в паркинга и 2 км/ч са удар. Отвори завоя: дръж около метър от реда и завивай срещу близкия ъгъл на мястото.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPark45TraceName =
  | "shadow-correct"
  | "mistake-overshoot"
  | "mistake-corner-cut";

const SCRIPTS: Record<ScPark45TraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scPark45ShadowScript },
  "mistake-overshoot": { kind: "mistake", script: scPark45MistakeOvershootScript },
  "mistake-corner-cut": { kind: "mistake", script: scPark45MistakeCornerCutScript },
};

/**
 * Record one of the three drives against a loaded lot-45-v1 document —
 * parked-car obstacles armed at the parking threshold. Deterministic.
 */
export function recordScPark45Drive(
  districtRaw: unknown,
  name: ScPark45TraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_45_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
