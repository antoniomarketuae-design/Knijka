/**
 * sc-ac-snow — the authored drives (doc 76 §5/§9): ONE correct shadow + TWO
 * mistake demos for „Сняг" (the AC-08 packed-snow slice — the LAST weather
 * unlock) on the committed ac-rain-v1 district, recorded in DAY SNOW (the
 * recorder feeds tick.snow with isNight false: conditions envelope 0.5 × 50 =
 * 25 km/h; no lamp duty arms on snow). No lane actors, ambient traffic ZERO
 * (seed 7): the ONLY hazard is a STOPPED van ahead in the lane, staged as a
 * recorder obstacle rect (the sc-ac-wet-braking mold, geometry reused
 * verbatim), so the ONLY things the stack can grade are the driver's winter
 * speed and any contact with the van.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, one grip band deeper):
 *   - The LIVE student session runs REAL snow physics: LessonSpec.physics
 *     .snowGrip → VehicleRig → VehicleSim gripFactor = SNOW_GRIP_FACTOR
 *     (0.4), braking distance ~2.5× dry (vehicle/wet-grip.test.ts, the snow
 *     band).
 *   - These RECORDED demos are KINEMATIC (recorder.ts authored envelopes —
 *     the recorder never runs VehicleSim), so the snow truth must be
 *     AUTHORED: every stop ramp below passes maxDecelMps2 = SNOW_DECEL =
 *     SCRIPT_DECEL × SNOW_GRIP_FACTOR (4.6 × 0.4 = 1.84 m/s²) — the same
 *     scaling the live car obeys. The ghost brakes to the envelope the
 *     student's snow car actually has; it never demonstrates a dry stop the
 *     snow physics cannot do.
 *
 * The trace gate replays exactly these through the production stack, day snow:
 *   - shadow: low beams ON (story — no detector requires lights in snow),
 *     ~22 km/h under the 0.5 × 50 = 25 winter envelope, lifts off EARLY (the
 *     snow envelope needs ~14.5 m from 22) and rests at the mark (y = 300),
 *     ~5.7 m short of the van → ZERO violations + CLEAN_DRIVING;
 *   - „Кара като на сухо — 40 в снега": carries ~40 km/h through the snow
 *     (> 25 sustained ≫ 3 s → SPEED_TOO_FAST_FOR_CONDITIONS), then the LONG
 *     early snow-envelope stop (~48 m) still rests it safely at the mark —
 *     the fault of this demo is the SPEED alone → EXACTLY
 *     SPEED_TOO_FAST_FOR_CONDITIONS, no collision;
 *   - „Спирачка на сухата точка": lawful ~22, but the stop ramp STARTS at
 *     the DRY-habit point (~6 m before the mark — where the dry envelope
 *     would have sufficed); on the snow envelope the car needs ~14.5 m and
 *     slides past the mark into the van at ~10 km/h → EXACTLY COLLISION.
 *
 * Geometry pinned to content/world/ac-rain-v1.json (the wet-braking values,
 * verbatim): street on x = 0, right-lane center x = 4.06, spawn
 * ac-rain-spawn-approach (4.06, 15) heading north, 360 m long, limit 50. The
 * van sits centred at (4.06, 310); the hero footprint (CHASSIS_HALF_EXTENTS.z
 * = 2.02) clears it from a stop at y = 300 (nose 302.0 vs the van's rear at
 * 307.75) and overlaps it once the centre passes ~305.7.
 */

import type { StagedEventSpec } from "../contracts";
import { SNOW_GRIP_FACTOR } from "../vehicle";
import { SC_AC_SNOW } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_SNOW_ID = "sc-ac-snow";

/** Northbound right-lane center of ac-rain-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow eases to a full stop at (denormalized in the template). */
const STOP_MARK_Y = 300;
/** The stopped van's centre in the lane. */
const VAN_Y = 310;

/**
 * The AUTHORED snow braking envelope of every stop ramp in this file:
 * SCRIPT_DECEL (the recorder's dry comfortable 4.6 m/s²) × SNOW_GRIP_FACTOR
 * (the live physics scaling, 0.4) = 1.84 m/s². This single expression is the
 * dual-channel honesty contract (the WET_DECEL law, one grip band deeper) —
 * change the physics factor and the ghosts follow automatically on the next
 * re-record.
 */
export const SNOW_DECEL = SCRIPT_DECEL * SNOW_GRIP_FACTOR;

/** A stopped delivery van (the sc-ac-wet-braking obstacle, verbatim) centred
 *  in the lane at (4.06, 310): the obstruction the driver must stop short of. */
export function snowVanObstacle(): ObstacleRect2D[] {
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
// The correct demonstration (shadow) — winter speed, early snow-envelope stop
// ---------------------------------------------------------------------------

export function scAcSnowShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пътят е заснежен — утъпканият сняг държи около 40% от сухото сцепление." },
      // Low beams ON, set for the story (no detector requires lights in snow;
      // the lights lesson is AC-02's, not this one's).
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~22 km/h — comfortably under the 0.5 × 50 = 25 km/h winter envelope.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 250]], targetKmh: 22, stopAtEnd: false },
      { kind: "annotation", textBg: "Напред е спрял автомобил: на сняг спирачният път е ~2,5 пъти по-дълъг — вдигаме газта ОЩЕ СЕГА." },
      // The snow stop ramp: SNOW_DECEL needs ~14.5 m from 22 km/h, so braking
      // begins around y ≈ 285.5 — far earlier than the dry habit (~294).
      { kind: "drive", points: [[LANE_X, 250], [LANE_X, STOP_MARK_Y]], targetKmh: 22, maxDecelMps2: SNOW_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спряхме плавно на позицията, с дистанция до спрелия отпред — снежният път беше сметнат отрано." },
      { kind: "annotation", textBg: "Правилото: сняг = зимна скорост, многократно по-ранно вдигане на газта, мека спирачка." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Кара като на сухо — 40 в снега"
// (SPEED_TOO_FAST_FOR_CONDITIONS — the speed alone; the stop itself is early)
// ---------------------------------------------------------------------------

export function scAcSnowMistakeDrySpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 40 км/ч по снега — „нали е под ограничението“." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // The dry-habit ~40 sustained through the snow: > 25 km/h for far more
      // than the 3 s sustain → SPEED_TOO_FAST_FOR_CONDITIONS (второстепенна).
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 80], [LANE_X, 250]], targetKmh: 40, stopAtEnd: false },
      { kind: "annotation", textBg: "От 40 на сняг трябват близо 50 метра спирачен път — двойно повече дистанция, изядена от скоростта." },
      // Braking IS early and gentle here (the snow envelope needs ~48 m from
      // 40 and bites right after y ≈ 252) — the ONLY fault of this demo is
      // the winter speed itself.
      { kind: "drive", points: [[LANE_X, 250], [LANE_X, STOP_MARK_Y]], targetKmh: 40, maxDecelMps2: SNOW_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ограничението е таван за СУХО: на сняг зимната скорост е наполовина под знака (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Спирачка на сухата точка" (COLLISION)
// ---------------------------------------------------------------------------

export function scAcSnowMistakeLateBrakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: скоростта е зимна, но спирачката идва на СУХАТА точка." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // Lawful ~22 km/h — the ONLY fault of this demo is the braking point.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 150], [LANE_X, 294]], targetKmh: 22, stopAtEnd: false },
      { kind: "annotation", textBg: "На сухо оттук спирачката стига точно до позицията… но пътят е заснежен." },
      // The dry habit: braking starts ~6 m before the mark (the DRY envelope
      // from 22). On the SNOW envelope the car needs ~14.5 m — it slides past
      // the mark and into the van at ~10 km/h.
      { kind: "drive", points: [[LANE_X, 294], [LANE_X, 308.5]], targetKmh: 22, maxDecelMps2: SNOW_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Снегът удължи спирането в пъти — на сняг вдигаш газта многократно ПО-РАНО." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcSnowTraceName = "shadow-correct" | "mistake-dry-speed" | "mistake-late-brake";

const SCRIPTS: Record<
  ScAcSnowTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcSnowShadowScript },
  "mistake-dry-speed": { kind: "mistake", script: scAcSnowMistakeDrySpeedScript },
  "mistake-late-brake": { kind: "mistake", script: scAcSnowMistakeLateBrakeScript },
};

/**
 * Record one of the three drives against a loaded ac-rain-v1 document — in
 * DAY SNOW, the van obstacle armed, ambient traffic zero (the harness law).
 * collisionMinKmh 5 so even a gentle slide into the van grades COLLISION.
 * Deterministic: same district → same trace.
 */
export function recordScAcSnowDrive(
  districtRaw: unknown,
  name: ScAcSnowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_SNOW_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_SNOW.staged ?? [])] as StagedEventSpec[],
    snow: true,
    obstacles: snowVanObstacle(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
