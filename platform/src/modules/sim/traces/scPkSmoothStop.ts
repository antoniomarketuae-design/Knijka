/**
 * sc-pk-smooth-stop — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Плавно спиране на позиция" (PK-14) on the committed
 * pk-stop-v1 district. No lane actors, ambient traffic ZERO (seed 7): the ONLY
 * hazard is a STOPPED van ahead in the lane, staged as a recorder obstacle rect
 * (the sc-park-perp-rev pattern), so the ONLY things the stack can grade are the
 * smoothness of the driver's stop and any contact with the van.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations; eases to a controlled stop AT the mark (y = 112),
 *     ~6 m short of the van — rests inside the low-speed stop-mark zone (a
 *     recorder-driven smoothStop maneuver objective is not usable, see the
 *     template header: the kinematic recorder brakes at a fixed ~4.6 m/s² and
 *     zeroes the last ~2 km/h in one frame, a spike no maxDecelMs2 accepts);
 *   - „Претърколи се в спрелия автомобил" grades EXACTLY COLLISION (braked too
 *     late/soft, rolled past the mark into the van);
 *   - „Твърде бърз подход" grades EXACTLY COLLISION (approached far too fast to
 *     stop in the distance and ploughed into the van).
 *
 * Geometry pinned to content/world/pk-stop-v1.json: a 200 m straight street on
 * x = 0, right-lane center x = 4.06, spawn pk-spawn-approach (4.06, 15) heading
 * north, limit 50. The van sits centred at (4.06, 120); the hero footprint
 * (CHASSIS_HALF_EXTENTS.z = 2.02) clears it from a stop at y = 112 (nose 114.0
 * vs the van's rear at 117.75) and overlaps it once the centre passes ~115.7.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_PK_SMOOTH_STOP } from "../lessons/scenario/templates-pk";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PK_SMOOTH_STOP_ID = "sc-pk-smooth-stop";

/** Northbound right-lane center of pk-stop-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow eases to a full stop at (denormalized in the template). */
const STOP_MARK_Y = 112;

/** A parked delivery van (the sc-park-perp-rev vehicle footprint) centred in the
 *  lane at (4.06, 120): the obstruction the driver must stop short of. */
export function pkVanObstacle(): ObstacleRect2D[] {
  return [
    {
      x: LANE_X,
      y: 120,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — a smooth, precise stop at the mark
// ---------------------------------------------------------------------------

export function scPkSmoothStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Напред е спрял автомобил — ще спрем плавно на маркираната позиция зад него." },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Вдигаме газта отдалеч и оставяме колата да намали — спирачката е мека." },
      // Accelerate to a calm ~30 km/h and cruise (both segments target 30 so the
      // speed never jumps at the boundary — no harsh spike).
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 50], [LANE_X, 82]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирачката е плавна и постепенна — без клъвване напред." },
      // The single stop-ramp eases the car to a FULL stop exactly at the mark,
      // a controlled stop ~6 m short of the van.
      { kind: "drive", points: [[LANE_X, 82], [LANE_X, STOP_MARK_Y]], targetKmh: 30 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: спряхме плавно и точно на позицията, с дистанция до спрелия отпред." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Претърколи се в спрелия автомобил" (COLLISION)
// ---------------------------------------------------------------------------

export function scPkSmoothStopMistakeOvershootScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: спирачката дойде твърде късно и меко." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 60], [LANE_X, 95]], targetKmh: 30, stopAtEnd: false },
      { kind: "annotation", textBg: "Колата подминава маркираната позиция и продължава към спрелия отпред…" },
      // Roll on PAST the mark into the van — a low-speed overrun, but contact.
      { kind: "drive", points: [[LANE_X, 95], [LANE_X, 118], [LANE_X, 126]], targetKmh: 16 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Газта се вдига рано, а спирането се планира — не се изчаква последният метър." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Твърде бърз подход" (COLLISION)
// ---------------------------------------------------------------------------

export function scPkSmoothStopMistakeTooFastScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: подходът към позицията е твърде бърз." },
      { kind: "glance", mirror: "rear" },
      // Carry ~45 km/h far too close, then there is no room to stop — into the van.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 70], [LANE_X, 108]], targetKmh: 45, stopAtEnd: false },
      { kind: "annotation", textBg: "На тази скорост спирачният път не стига — колата се врязва в спрелия отпред." },
      { kind: "drive", points: [[LANE_X, 108], [LANE_X, 124]], targetKmh: 42 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спирачният път расте квадратично със скоростта — приближавай бавно и с готовност за спиране." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPkSmoothStopTraceName = "shadow-correct" | "mistake-overshoot" | "mistake-too-fast";

const SCRIPTS: Record<ScPkSmoothStopTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scPkSmoothStopShadowScript },
  "mistake-overshoot": { kind: "mistake", script: scPkSmoothStopMistakeOvershootScript },
  "mistake-too-fast": { kind: "mistake", script: scPkSmoothStopMistakeTooFastScript },
};

/**
 * Record one of the three drives against a loaded pk-stop-v1 document — the van
 * obstacle armed, ambient traffic zero (the harness law). collisionMinKmh 5 so
 * even a gentle overrun into the van grades COLLISION. Deterministic.
 */
export function recordScPkSmoothStopDrive(
  districtRaw: unknown,
  name: ScPkSmoothStopTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PK_SMOOTH_STOP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PK_SMOOTH_STOP.staged ?? [])] as StagedEventSpec[],
    obstacles: pkVanObstacle(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
