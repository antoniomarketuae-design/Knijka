/**
 * sc-ac-wet-braking — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Спирачен път на мокро" (the AC-07 friction slice,
 * ADR-006 stage 4a) on the committed ac-rain-v1 district, recorded in DAY RAIN.
 * No lane actors, ambient traffic ZERO (seed 7): the ONLY hazard is a STOPPED
 * van ahead in the lane, staged as a recorder obstacle rect (the
 * sc-pk-smooth-stop mold), so the ONLY things the stack can grade are the
 * driver's rain speed and any contact with the van.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note — read before editing):
 *   - The LIVE student session runs REAL wet physics: LessonSpec.physics
 *     .wetGrip → VehicleRig → VehicleSim gripFactor = WET_GRIP_FACTOR (0.7),
 *     measured braking distance × ~1.42 (vehicle/wet-grip.test.ts).
 *   - These RECORDED demos are KINEMATIC (recorder.ts authored envelopes —
 *     the recorder never runs VehicleSim), so the wet truth must be AUTHORED:
 *     every stop ramp below passes maxDecelMps2 = WET_DECEL = SCRIPT_DECEL ×
 *     WET_GRIP_FACTOR (4.6 × 0.7 ≈ 3.22 m/s²) — the same ~0.7 scaling the
 *     live car obeys. The ghost brakes to the envelope the student's wet car
 *     actually has; it never demonstrates a dry stop the wet physics cannot do.
 *
 * The trace gate replays exactly these through the production stack, day rain:
 *   - shadow: low beams ON (explicit — the recorder's DAY default is "off"),
 *     ~38 km/h under the 0.85 × 50 = 42.5 rain envelope, lifts off EARLY (the
 *     wet envelope needs ~25 m from 38) and rests at the mark (y = 300), ~5.7 m
 *     short of the van → ZERO violations + CLEAN_DRIVING;
 *   - „Спирачка като на сухо": same lawful 38, but the stop ramp STARTS at the
 *     DRY-habit point (~17 m before the mark — where the dry envelope would
 *     have sufficed); on the wet envelope the car needs ~25 m and rolls past
 *     the mark into the van at ~10 km/h → EXACTLY COLLISION;
 *   - „Кара като на сухо — 50 в дъжда": carries the dry-limit 50 km/h through
 *     the rain (> 42.5 sustained ≫ 3 s → SPEED_TOO_FAST_FOR_CONDITIONS), then
 *     brakes where a dry 50-stop would fit (~30 m) — the wet envelope needs
 *     ~43 m and the car ploughs into the van at ~20 km/h → EXACTLY
 *     COLLISION + SPEED_TOO_FAST_FOR_CONDITIONS.
 *
 * Geometry pinned to content/world/ac-rain-v1.json: street on x = 0, right-
 * lane center x = 4.06, spawn ac-rain-spawn-approach (4.06, 15) heading north,
 * 360 m long, limit 50. The van sits centred at (4.06, 310); the hero footprint
 * (CHASSIS_HALF_EXTENTS.z = 2.02) clears it from a stop at y = 300 (nose 302.0
 * vs the van's rear at 307.75) and overlaps it once the centre passes ~305.7.
 */

import type { StagedEventSpec } from "../contracts";
import { WET_GRIP_FACTOR } from "../vehicle";
import { SC_AC_WET_BRAKING } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_WET_BRAKING_ID = "sc-ac-wet-braking";

/** Northbound right-lane center of ac-rain-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow eases to a full stop at (denormalized in the template). */
const STOP_MARK_Y = 300;
/** The stopped van's centre in the lane. */
const VAN_Y = 310;

/**
 * The AUTHORED wet braking envelope of every stop ramp in this file:
 * SCRIPT_DECEL (the recorder's dry comfortable 4.6 m/s²) × WET_GRIP_FACTOR
 * (the live physics scaling, 0.7) ≈ 3.22 m/s². This single expression is the
 * dual-channel honesty contract — change the physics factor and the ghosts
 * follow automatically on the next re-record.
 */
export const WET_DECEL = SCRIPT_DECEL * WET_GRIP_FACTOR;

/** A stopped delivery van (the sc-pk-smooth-stop vehicle footprint) centred in
 *  the lane at (4.06, 310): the obstruction the driver must stop short of. */
export function wetVanObstacle(): ObstacleRect2D[] {
  return [
    {
      x: LANE_X,
      y: VAN_Y,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — early lift-off, wet-envelope stop
// ---------------------------------------------------------------------------

export function scAcWetBrakingShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Вали и настилката е мокра — гумите държат около 70% от сухото сцепление." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off",
      // which would itself grade HEADLIGHTS_OFF_IN_RAIN.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~38 km/h — under the 42.5 km/h rain envelope for the whole approach.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 250]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "Напред е спрял автомобил: на мокро спирачният път е ~1,4 пъти по-дълъг — вдигаме газта ОЩЕ СЕГА." },
      // The wet stop ramp: WET_DECEL needs ~25 m from 38 km/h, so braking
      // begins around y ≈ 275 — visibly earlier than the dry habit (~283).
      { kind: "drive", points: [[LANE_X, 250], [LANE_X, STOP_MARK_Y]], targetKmh: 38, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спряхме плавно на позицията, с дистанция до спрелия отпред — мокрият път беше сметнат отрано." },
      { kind: "annotation", textBg: "Правилото: мокър път = по-ниска скорост, по-ранно вдигане на газта, по-мека спирачка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Спирачка като на сухо" (COLLISION)
// ---------------------------------------------------------------------------

export function scAcWetBrakingMistakeDryPointScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: скоростта е съобразена, но спирачката идва на СУХАТА точка." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Lawful ~38 km/h — the ONLY fault of this demo is the braking point.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 282.5]], targetKmh: 38, stopAtEnd: false },
      { kind: "annotation", textBg: "На сухо оттук спирачката стига точно до позицията… но пътят е мокър." },
      // The dry habit: braking starts ~17 m before the mark (the DRY envelope
      // from 38). On the WET envelope the car needs ~25 m — it overruns the
      // mark and rolls into the van at ~10 km/h.
      { kind: "drive", points: [[LANE_X, 282.5], [LANE_X, 307.5]], targetKmh: 38, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Мокрият път удължи спирането с още метри — на мокро вдигаш газта и спираш ПО-РАНО." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Кара като на сухо — 50 в дъжда"
// (COLLISION + SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scAcWetBrakingMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 50 км/ч в дъжда — „нали е в ограничението“." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // The dry-limit 50 sustained through the rain: > 42.5 km/h for far more
      // than the 3 s sustain → SPEED_TOO_FAST_FOR_CONDITIONS (второстепенна).
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 270]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Спирачката идва там, където на сухо 50 се спират… но на мокро трябват още 13 метра." },
      // A dry 50-stop fits in ~30 m (brake at 270 for the 300 mark); the wet
      // envelope needs ~43 m — the car ploughs into the van at ~20 km/h.
      { kind: "drive", points: [[LANE_X, 270], [LANE_X, 313]], targetKmh: 50, maxDecelMps2: WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ограничението е таван за СУХО: в дъжд скоростта се съобразява надолу — и спирачният път се брои мокър." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcWetBrakingTraceName = "shadow-correct" | "mistake-dry-point" | "mistake-dry-speed";

const SCRIPTS: Record<
  ScAcWetBrakingTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcWetBrakingShadowScript },
  "mistake-dry-point": { kind: "mistake", script: scAcWetBrakingMistakeDryPointScript },
  "mistake-dry-speed": { kind: "mistake", script: scAcWetBrakingMistakeDrySpeedScript },
};

/**
 * Record one of the three drives against a loaded ac-rain-v1 document — in DAY
 * RAIN, the van obstacle armed, ambient traffic zero (the harness law).
 * collisionMinKmh 5 so even a gentle overrun into the van grades COLLISION.
 * Deterministic: same district → same trace.
 */
export function recordScAcWetBrakingDrive(
  districtRaw: unknown,
  name: ScAcWetBrakingTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_WET_BRAKING_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_WET_BRAKING.staged ?? [])] as StagedEventSpec[],
    rain: true,
    obstacles: wetVanObstacle(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
