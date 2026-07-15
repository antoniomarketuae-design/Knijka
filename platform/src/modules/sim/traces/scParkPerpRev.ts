/**
 * sc-park-perp-rev — the P0 authored drives (doc 76 §10): ONE correct shadow
 * demonstration + TWO mistake demos for „Перпендикулярно паркиране на заден
 * ход" on the committed lot-perp-v1 district. The scripts are the SOURCE of
 * the committed traces under content/traces/sc-park-perp-rev/ — the trace
 * gate test replays exactly these through the production stack and asserts:
 *   - shadow: ZERO violations (with the parked-car obstacle rects ARMED at
 *     collisionMinKmh 0) and the parkInBay contract completes (§5 gate);
 *   - each mistake demo grades EXACTLY its authored codeRefs (§9 stage 5).
 *
 * Geometry is pinned to content/world/lot-perp-v1.json (the demo.ts pattern —
 * lessons pin district coordinates by value):
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625
 *   (2-lane road, 3.25 m lane × 2.5 perceptual scale / 2);
 *   bay row on the EAST side, bay rects x ∈ [2.53, 7.53];
 *   target bay lot-bay-3 center (5.03, 0), axis east-west (headingDeg 90);
 *   occupied neighbors lot-bay-1/2/4/5 at y = ∓5.4 / ∓2.7;
 *   spawn lot-spawn-approach (0, −105) heading north.
 *
 * Rule-engine safety envelope the paths respect (why the numbers are what
 * they are): lane detectors arm at |laneOffset| > 3.25 m ⇔ |x| < 0.81 on
 * this road while moving > 5 km/h in a forward gear — the correct pull-past
 * therefore parks at x = 0.9; the WIDE mistake crosses to x = −1.6 at creep
 * speed (≤ 4.5 km/h) so wrong-way/lane episodes (which require `moving`)
 * never arm and the demo grades ONLY its collision. Reverse gear is exempt
 * from all lane/wrong-way detectors by A12 law.
 */

import type { ScenarioBayMeta } from "../contracts";
import { scenarioBaysOf } from "../contracts";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PARK_PERP_REV_ID = "sc-park-perp-rev";

/**
 * Nominal parked-car footprint for the HEADLESS collision gate, m. The live
 * scene colliders use each GLB rig's measured bbox (ScenarioObstacles);
 * these run a hair larger than the fleet's compacts so the recorded gate is
 * at least as strict as the scene.
 */
export const PARKED_CAR_HALF_WIDTH_M = 0.9;
export const PARKED_CAR_HALF_LENGTH_M = 2.25;

/** Northbound drawn lane center on the lot roads (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Correct pull-past lateral position (see the header envelope note). */
const X_SETUP = 0.9;
/** Pull-past stop: rear bumper past the north neighbor's car (bay-4). */
const Y_SETUP = 6.3;
/** Reverse-arc radius (car-center path), m — a full-lock-ish swing. */
const ARC_R = 4.0;

/** Quarter arc (path heading south → east), car-center path, cw sweep. */
function reverseArc(startX: number, startY: number, r: number): Array<[number, number]> {
  // Start (startX, startY) tangent south; center (startX + r, startY);
  // end (startX + r, startY − r) tangent east.
  const cx = startX + r;
  const cy = startY;
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const th = (k / 8) * (Math.PI / 2);
    out.push([cx - r * Math.cos(th), cy - r * Math.sin(th)]);
  }
  return out;
}

/**
 * The headless obstacle set of a scenario-lot district: one parked-car rect
 * per OCCUPIED bay (meta.scenario.bays — the same single truth the scene's
 * ScenarioObstacles mounts from).
 */
export function lotObstacleRects(districtRaw: unknown): ObstacleRect2D[] {
  return scenarioBaysOf(districtRaw)
    .filter((b: ScenarioBayMeta) => b.occupied)
    .map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      halfWidthM: PARKED_CAR_HALF_WIDTH_M,
      halfLengthM: PARKED_CAR_HALF_LENGTH_M,
      withWhat: "vehicle" as const,
    }));
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/** Approach: spawn → right-lane cruise up the approach road. */
const APPROACH: Array<[number, number]> = [
  [0, -105],
  [0, -103],
  [X_LANE, -92],
  [X_LANE, -24],
];

export function scParkPerpRevShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Свободното място е вдясно. Намали, огледай се и пусни десен мигач.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        // Slow down and ease left BEFORE the bay row starts (the south
        // neighbor's car nose sits at y ≈ −6.3), then run the row at ~1 m.
        kind: "drive",
        points: [
          [X_LANE, -24],
          [X_LANE, -16],
          [2.4, -11],
          [X_SETUP, -7],
          [X_SETUP, Y_SETUP],
        ],
        targetKmh: 10,
      },
      {
        kind: "annotation",
        textBg: "Подмини мястото и спри, щом задната броня подмине съседната кола.",
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg: "Преди задната: двете огледала, после през рамо — и чак тогава завивай.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      {
        // Full-lock reverse swing into the bay (car-center quarter arc).
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, ARC_R],
          ...reverseArc(X_SETUP, ARC_R, ARC_R),
        ],
        targetKmh: 5,
        reverse: true,
      },
      // Mid-maneuver observation (instruction 4: „следи двете съседни коли
      // в огледалата") — the during-reverse rubric moment.
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Следи съседните коли в огледалата и изправи волана." },
      {
        // Straighten: dead-center stop on the bay center (5.03, 0).
        kind: "drive",
        points: [
          [X_SETUP + ARC_R, 0],
          [5.03, 0],
        ],
        targetKmh: 3,
        reverse: true,
      },
      // The final check before the definitive stop (rubric moment 3).
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // holdSec 1.5 + margin — the parkInBay contract completes at rest.
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Готово: центрирано, успоредно на линиите, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде широк подход" (clips the neighbor = COLLISION)
// ---------------------------------------------------------------------------

export function scParkPerpRevMistakeWideScript(): DriveScript {
  const xWide = -1.6; // ~3.3 m off the row — the „твърде далеч" setup
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата застава твърде далеч от реда с колите.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [X_LANE, -24],
          [X_LANE, -16],
          [1.5, -11],
        ],
        targetKmh: 10,
      },
      {
        // Creep across toward the wide setup — parking-maneuver speed, so
        // the wide line is the ONLY mistake this demo demonstrates.
        kind: "drive",
        points: [
          [1.5, -11],
          [xWide, -4],
          [xWide, 6.5],
        ],
        targetKmh: 4.5,
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg: "От толкова широко ъгълът на завиване не стига до мястото…",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [
          [xWide, 6.5],
          [xWide, ARC_R],
          ...reverseArc(xWide, ARC_R, ARC_R),
        ],
        targetKmh: 4.5,
        reverse: true,
      },
      {
        // The doomed correction: dragging the tail toward the bay clips the
        // neighbor's car at walking speed — the COLLISION gate.
        kind: "drive",
        points: [
          [xWide + ARC_R, 0],
          [4.6, 1.15],
        ],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Задницата подряза съседната кола. Правилно: започни на около метър от реда.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без наблюдение" (scripted consequence)
// ---------------------------------------------------------------------------

export function scParkPerpRevMistakeNoObservationScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо без огледала и поглед през рамо.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [X_LANE, -24],
          [X_LANE, -16],
          [2.4, -11],
          [X_SETUP, -7],
          [X_SETUP, Y_SETUP],
        ],
        targetKmh: 10,
      },
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
          [X_SETUP, 4.2],
        ],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence: the unseen pedestrian is hit at reversing
      // speed — the rule engine grades it exactly like a physics contact.
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

export type ScParkPerpRevTraceName =
  | "shadow-correct"
  | "mistake-wide-approach"
  | "mistake-no-observation";

const SCRIPTS: Record<ScParkPerpRevTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scParkPerpRevShadowScript },
  "mistake-wide-approach": { kind: "mistake", script: scParkPerpRevMistakeWideScript },
  "mistake-no-observation": { kind: "mistake", script: scParkPerpRevMistakeNoObservationScript },
};

/**
 * Record one of the three P0 drives against a loaded lot-perp-v1 document —
 * obstacles armed from the district's own occupancy, collisionMinKmh 0 (the
 * parking threshold, doc 76 §0). Deterministic: same district → same trace.
 */
export function recordScParkPerpRevDrive(
  districtRaw: unknown,
  name: ScParkPerpRevTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_PERP_REV_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
