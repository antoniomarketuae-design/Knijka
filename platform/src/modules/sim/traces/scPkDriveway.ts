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
 *   - shadow: ZERO violations; signals, pulls PAST the driveway, observes
 *     (mirrors + shoulder) and REVERSES into it, stopping half-way round to
 *     look again, coming to rest centered in the bay facing the street —
 *     completes the parkInBay objective (reverse used, aligned);
 *   - „Твърде късен замах" grades EXACTLY COLLISION (the swing starts 1.5 m
 *     too far past the mouth and the tail sweeps onto the driveway's fence);
 *   - „Твърде дълбоко назад" grades EXACTLY COLLISION (backs past the mark into
 *     the garage's back wall).
 *
 * Geometry pinned to content/world/pk-drive-v1.json: a 90 m residential street
 * on x = 0, right-lane center x = 4.06, limit 30, spawn pkd-spawn-approach
 * (4.06, 15). The driveway opens on the EAST kerb at y ≈ 45; the target bay
 * lot-drive center (8.0, 45), axis east-west (headingDeg 90).
 *
 * EVERY PATH IS ONE THE PRODUCT CAR CAN DRIVE (catalogue-demo-curvature:
 * dae908c7, family «curvpark2», 2026-11-06). The swing used to be a 4 m
 * polyline quarter circle (2.59 m over its tightest metre; the wide mistake
 * 1.587 m). It is now the parking kit's `bayReverse` (./parkKit) on the 4.6 m
 * drivable circle: the setup is x = 2.4, the left half of the right lane —
 * from the lane centre the swing ends past the bay — reached by one gentle S
 * at walking pace, and the setup stop is 1.5 m from the Задача 1 marker.
 * Reverse gear is exempt from lane/wrong-way detectors and every FORWARD move
 * is under the 15 km/h the briefing states, so the ONLY gradeable events are
 * the maneuver and the wall contacts — pinned in
 * traces/__tests__/park-family-drivable.test.ts.
 */

import type { ParkingBaySpec } from "../contracts";
import {
  authoredDrive,
  DRIVABLE_MIN_CENTRE_RADIUS_M,
  sShift,
  straight,
  swingForShift,
  turn,
  withRunOut,
  type AuthoredPath,
} from "./drivablePath";
import { bayReverse, CREEP_KMH, leftSetUpMove, LOOK_BEFORE_REVERSE, REVERSE_KMH, SETTLE, untilContact, type BayReverse } from "./parkKit";
import {
  recordScriptedDrive,
  type DriveScript,
  type DriveStep,
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
/** The setup line: the left half of the right lane (see header). */
const X_SETUP = 2.4;
/** The swing: straight back 1 m, wound on over 1.5 m, held, unwound over 1.2 m. */
const SWING = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, s0M: 1.0, rampInM: 1.5, rampOutM: 1.2 };
const DW: BayReverse = bayReverse(1, X_SETUP, { x: PK_DRIVE_TARGET_BAY.x, y: PK_DRIVE_TARGET_BAY.y }, SWING);
/** How much further past the mouth the late swing (mistake 1) begins, m. */
const LATE_M = 1.5;

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PK_DRIVEWAY_GEOMETRY = {
  radiusM: SWING.radiusM,
  setup: { ...DW.setup },
  lateM: LATE_M,
} as const;

/**
 * The driveway's two walls — the headless twins of the scene's kerb/fence
 * colliders. A clean reverse threads BELOW the north fence (its south edge at
 * y = 47.0; the parked car's north edge rests at y ≈ 45.85) and stops SHORT of
 * the back wall (its west edge at x = 10.7; the car's east edge rests at
 * x ≈ 10.02). A swing begun too late mounts the fence; a too-deep reverse hits the wall.
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

/**
 * Up the street to a setup at (`x`, `y`): straight in the lane to y = 30, one
 * gentle S (radius 30) onto the line `x`, straight on to the stop — slowing to
 * the setup pace over the last 12 m (parkKit `toSetup`). The S is a set-up move
 * of 1.66 m to the left (more than the car's half width), so it is signalled
 * LEFT and the indicator goes off where the car is square on its line (parkKit
 * `leftSetUpMove`, ЗДвП чл. 26; lane curvpark2 round 2, CP2-6) — the bay's
 * right signal is given at the setup stop, never during the drift. `look`:
 * the left mirror before the move.
 */
function streetTo(x: number, y: number, look = true) {
  const fromY = 30;
  const shift = x - LANE_X;
  const k = Math.sign(shift) / 30;
  const s = sShift(swingForShift(shift, k, 1.5), k, 1.5);
  const sLen = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, 1).end.y;
  const p = authoredDrive({ x: LANE_X, y: 16, headingDeg: 0 }, [straight(fromY - 16), ...s, straight(y - fromY - sLen)], 1);
  // The signal is given 6 m before the S (y 24), not at the spawn: the first
  // stretch is driven as its own step, run 5 cm on along the path (the recorder
  // ends a step 5 cm short) so the next one starts on the pose it ended on.
  const iSignal = p.points.findIndex(([, py]) => py >= SIGNAL_AT_Y);
  const path: AuthoredPath = { ...p, points: p.points.slice(iSignal), end: { x, y, headingDeg: 0 } };
  return [
    { kind: "drive", points: p.points.slice(0, iSignal + 1 + 50), targetKmh: 8, stopAtEnd: false } as DriveStep,
    ...leftSetUpMove(path, 8, fromY + sLen, look),
  ];
}
/** Where the set-up move's left signal is given: 6 m before its S. */
const SIGNAL_AT_Y = 24;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — pull past, observe, reverse in
// ---------------------------------------------------------------------------

export function scPkDrivewayShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Заден ход в алея вдясно: карай спокойно и подмини входа, преди да започнеш." },
      { kind: "glance", mirror: "rear" },
      {
        kind: "annotation",
        textBg: "Отдалечи се от бордюра с ляв мигач — замахът иска място. Подмини алеята и спри, когато задната броня подмине входа ѝ.",
      },
      ...streetTo(DW.setup.x, DW.setup.y),
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Сега десен мигач. Преди задната: двете огледала, после през рамо — и чак тогава завивай назад." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      ...LOOK_BEFORE_REVERSE,
      // The gear goes in after the looks, never on the instant of the last one
      // (so every look is heard before R on every display — grade-grid ROUND 8).
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "drive", points: withRunOut(DW.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни назад — и в дясното огледало." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Следи стените на алеята в огледалата и изправи волана." },
      { kind: "drive", points: withRunOut(DW.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: центрирано в алеята, с нос към улицата, без да опреш стените." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Твърде късен замах" (tail onto the north fence = COLLISION)
// ---------------------------------------------------------------------------

export function scPkDrivewayMistakeWideScript(): DriveScript {
  // The same swing, begun 1.5 m further past the mouth: the tail is aimed
  // north of the driveway and sweeps onto its fence — cut where that contact
  // has happened (parkKit `untilContact`).
  const setup = { x: X_SETUP, y: DW.setup.y + LATE_M, headingDeg: 0 };
  const swing = authoredDrive(
    setup,
    [straight(SWING.s0M), ...turn(Math.PI / 2, 1 / SWING.radiusM, SWING.rampInM, SWING.rampOutM), straight(4)],
    -1,
  );
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: замахът назад започва твърде късно и задницата отива към оградата." },
      { kind: "glance", mirror: "rear" },
      ...streetTo(setup.x, setup.y),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Волан надясно, но без да следиш докъде стига задницата…" },
      {
        kind: "drive",
        points: untilContact(swing.points, -1, drivewayObstacles()[0], "wall"),
        targetKmh: CREEP_KMH,
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
  // A clean swing into the bay… but then it keeps rolling back east into the
  // garage's back wall instead of stopping on the mark.
  const deep = authoredDrive(
    DW.setup,
    [straight(SWING.s0M), ...turn(Math.PI / 2, 1 / SWING.radiusM, SWING.rampInM, SWING.rampOutM), straight(DW.b.lengthM + 3)],
    -1,
  );
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: заден ход без спиране — колата се врязва в дъното на алеята." },
      { kind: "glance", mirror: "rear" },
      ...streetTo(DW.setup.x, DW.setup.y),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: untilContact(deep.points, -1, drivewayObstacles()[1], "wall"),
        targetKmh: REVERSE_KMH,
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
