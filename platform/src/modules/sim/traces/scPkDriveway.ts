/**
 * sc-pk-driveway — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Заден ход в алея" (doc 72 PK-11 „Reverse around the
 * corner / into a driveway"; a Grundfahraufgabe-class low-speed maneuver NOT
 * among the four shipped bay parks) on the committed pk-drive-v1 residential
 * street. No lane actors, ambient traffic ZERO (seed 7): the map hosts only the
 * street, so the ONLY things the stack grades are the parkInBay maneuver and any
 * contact with the driveway's WALLS (two staticObject rects — a north fence and
 * an east back wall, the headless twins of the scene colliders, the
 * scManeuver3Point curbs precedent).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; pulls PAST the driveway, observes (mirrors +
 *     shoulder) and REVERSES into it, coming to rest centered in the bay facing
 *     the street — completes the parkInBay objective (reverse used, aligned);
 *   - „Твърде широк замах" grades EXACTLY COLLISION (the tail swings north onto
 *     the driveway's fence at creep speed);
 *   - „Твърде дълбоко назад" grades EXACTLY COLLISION (backs past the mark into
 *     the garage's back wall).
 *
 * Geometry pinned to content/world/pk-drive-v1.json: a 90 m residential street
 * on x = 0, right-lane center x = 4.06, limit 30, spawn pkd-spawn-approach
 * (4.06, 15). The driveway opens on the EAST kerb at y ≈ 45; the target bay
 * lot-drive center (8.0, 45), axis east-west (headingDeg 90). Reverse gear is
 * exempt from lane/wrong-way detectors and every FORWARD move is a creep
 * (≤ 8 km/h), so the ONLY gradeable events are the maneuver and the wall
 * contacts — the sc-park-perp-rev discipline.
 */

import type { ParkingBaySpec } from "../contracts";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_DRIVEWAY_ID = "sc-pk-driveway";

/** Right-lane center of pk-drive-v1. */
const LANE_X = 4.06;
/** The driveway bay (the graded parkInBay rect; also the painted rect). */
export const PK_DRIVE_TARGET_BAY: ParkingBaySpec = {
  x: 8.0,
  y: 45.0,
  headingDeg: 90,
  widthM: 2.7,
  lengthM: 5,
};
/** Reverse-arc radius (car-center path), m — mirrors sc-park-perp-rev. */
const ARC_R = 4.0;
/** Pull-past lateral position (in the lane; arc ends ~0.13 m short of the bay). */
const X_SETUP = 3.87;
/** Pull-past stop: rear bumper north of the driveway mouth. */
const Y_SETUP = 51.3;

/**
 * The driveway's two walls — the headless twins of the scene's kerb/fence
 * colliders. A clean reverse threads BELOW the north fence (its south edge at
 * y = 47.0; the parked car's north edge rests at y ≈ 45.85) and stops SHORT of
 * the back wall (its west edge at x = 10.7; the car's east edge rests at
 * x ≈ 10.02). A wide swing mounts the fence; a too-deep reverse hits the wall.
 */
export function drivewayObstacles(): ObstacleRect2D[] {
  return [
    // North fence along the driveway's north edge (length runs E-W). Only the
    // EAST half (x ∈ [7, 11]) is walled: the clean reverse sweeps its high-y arc
    // at LOW x (still in the lane) and only comes east as y drops below the
    // fence, so it threads clear; an over-rotated tail swings up into it.
    { x: 9.0, y: 47.3, headingDeg: 90, halfWidthM: 0.3, halfLengthM: 2.0, withWhat: "staticObject" as const },
    // Back wall closing the driveway at the east end (length runs N-S).
    { x: 11.0, y: 45.0, headingDeg: 0, halfWidthM: 0.3, halfLengthM: 2.5, withWhat: "staticObject" as const },
  ];
}

/** Quarter arc (path heading south → east), car-center path — sc-park-perp-rev. */
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

/** Approach: spawn → right-lane cruise up to the driveway. */
const APPROACH: Array<[number, number]> = [
  [LANE_X, 16],
  [LANE_X, 20],
  [LANE_X, 40],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — pull past, observe, reverse in
// ---------------------------------------------------------------------------

export function scPkDrivewayShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Заден ход в алея вдясно: карай спокойно и подмини входа, преди да започнеш." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 16 },
      { kind: "annotation", textBg: "Подмини алеята и спри, когато задната броня подмине входа ѝ." },
      {
        // Ease past the driveway to the setup pose (still in the lane).
        kind: "drive",
        points: [[LANE_X, 40], [LANE_X, 46], [X_SETUP, Y_SETUP]],
        targetKmh: 8,
      },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "annotation", textBg: "Преди задната: двете огледала, после през рамо — и чак тогава завивай назад." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      {
        // Full-lock reverse swing into the driveway (car-center quarter arc).
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, 49.0],
          ...reverseArc(X_SETUP, 49.0, ARC_R),
        ],
        targetKmh: 5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Следи стените на алеята в огледалата и изправи волана." },
      {
        // Straighten: dead-center stop on the bay center (8.0, 45).
        kind: "drive",
        points: [[X_SETUP + ARC_R, 45.0], [8.0, 45.0]],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "annotation", textBg: "Готово: центрирано в алеята, с нос към улицата, без да опреш стените." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде широк замах" (tail onto the north fence = COLLISION)
// ---------------------------------------------------------------------------

export function scPkDrivewayMistakeWideScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: замахът назад е твърде широк и задницата отива към оградата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 16 },
      { kind: "drive", points: [[LANE_X, 40], [LANE_X, 46], [X_SETUP, Y_SETUP]], targetKmh: 8 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Волан наляво, но без да следиш докъде стига задницата…" },
      {
        // Over-rotated reverse: the tail sweeps north onto the driveway's fence.
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, 50.0],
          [5.0, 48.5],
          [6.5, 47.4],
          [8.0, 46.7],
        ],
        targetKmh: 4.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Задницата се качи на оградата. Заден ход в алея се прави на части — гледай докъде стига колата преди всяко движение.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Твърде дълбоко назад" (into the back wall = COLLISION)
// ---------------------------------------------------------------------------

export function scPkDrivewayMistakeDeepScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: заден ход без спиране — колата се врязва в дъното на алеята." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 16 },
      { kind: "drive", points: [[LANE_X, 40], [LANE_X, 46], [X_SETUP, Y_SETUP]], targetKmh: 8 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        // A clean swing into the bay… but then it keeps rolling back east into
        // the garage's back wall instead of stopping on the mark.
        kind: "drive",
        points: [
          [X_SETUP, Y_SETUP],
          [X_SETUP, 49.0],
          ...reverseArc(X_SETUP, 49.0, ARC_R),
          [8.0, 45.0],
          [9.6, 45.0],
        ],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Колата удари дъното на алеята. На заден ход се спира на мястото, не когато стената те спре — гледай в огледалото за обратно виждане.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkDrivewayTraceName = "shadow-correct" | "mistake-wide" | "mistake-deep";

const SCRIPTS: Record<ScPkDrivewayTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scPkDrivewayShadowScript },
  "mistake-wide": { kind: "mistake", script: scPkDrivewayMistakeWideScript },
  "mistake-deep": { kind: "mistake", script: scPkDrivewayMistakeDeepScript },
};

/**
 * Record one of the three drives against a loaded pk-drive-v1 document — the two
 * driveway walls armed, ambient traffic zero (the harness law). collisionMinKmh
 * 0 so even a creep-speed wall touch grades COLLISION (the parking threshold,
 * doc 76 §0). Deterministic: same district → same trace.
 */
export function recordScPkDrivewayDrive(
  districtRaw: unknown,
  name: ScPkDrivewayTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_DRIVEWAY_ID,
    kind,
    seed: 7,
    obstacles: drivewayObstacles(),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
