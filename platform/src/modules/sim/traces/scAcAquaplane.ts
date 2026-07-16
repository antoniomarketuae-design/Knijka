/**
 * sc-ac-aquaplane — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Аквапланинг" (doc 72 AC-07-full — the standing-water
 * slice of the surface-patch unlock) on the committed ac-aqua-v1 district
 * (520 m extra-urban 90 road), recorded in DAY RAIN. No lane actors, ambient
 * traffic ZERO (seed 7): the hazards are the map's waterPatch span [240, 280]
 * and a BROKEN-DOWN VAN after it, staged as a recorder obstacle rect (the
 * sc-ac-wet-braking mold), so the only gradable channels are the driver's
 * rain speed, the lane position and any contact with the van.
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, surface-patch edition — read
 * before editing):
 *   - The LIVE student session runs the REAL float: physics.wetGrip → base
 *     grip 0.7 everywhere, and the district's waterPatch drops it to
 *     MIN(0.7, 0.15) = 0.15 while the chassis crosses [240, 280] at/above
 *     tuning.AQUAPLANE_ABOVE_KMH (65) — below the float speed the patch does
 *     not bite at all (runtime/surface.ts speed gate). Measured at 0.15:
 *     braking ≈ 5.5× dry distance, steering ≈ 0.14×
 *     (vehicle/surface-grip.test.ts).
 *   - These RECORDED demos are KINEMATIC (recorder.ts authored envelopes —
 *     the recorder never runs VehicleSim), so the float truth is AUTHORED:
 *     the mistakes cross the span UNBRAKED at speed (in the water no ramp
 *     exists — nothing answers), and pay only after it: a WET_DECEL overrun
 *     into the van, or the drift polyline riding the осева. Every ordinary
 *     stop ramp uses WET_DECEL = SCRIPT_DECEL × WET_GRIP_FACTOR — the same
 *     scaling the live wet car obeys outside the water.
 *
 * The trace gate replays exactly these through the production stack, day rain:
 *   - shadow: low beams ON, ~70 km/h approach (under the 0.85 × 90 = 76.5
 *     rain envelope), slows to ~55 BEFORE the water (55 < the 65 float
 *     speed — physically cannot aquaplane), transits with steady speed, then
 *     eases a WET_DECEL stop at the mark (y = 450), ~5.7 m short of the van
 *     → ZERO violations + CLEAN_DRIVING;
 *   - „Полет във водата — 85 в дъжда": 85 sustained ≫ 3 s (> 76.5 →
 *     SPEED_TOO_FAST_FOR_CONDITIONS), floats through the span unbraked, and
 *     the WET envelope after it cannot fit — ploughs into the van at
 *     ~40 km/h → EXACTLY COLLISION + SPEED_TOO_FAST_FOR_CONDITIONS;
 *   - „«В нормата съм» — 72 върху водата": 72 < 76.5 (lawful in rain — the
 *     whole point) but > 65: the float carries the car diagonally onto the
 *     осева and it rides it ~4 s toward oncoming (past the 3.5 s
 *     CENTER_LINE sustain), recovers past the van's lane line and stops
 *     short of the mark → EXACTLY CENTER_LINE_TOUCHED.
 *
 * Geometry pinned to content/world/ac-aqua-v1.json: street on x = 0, right-
 * lane center x = 4.06 (drawn lane 8.125 m), spawn ac-aqua-spawn-approach
 * (4.06, 15) heading north, 520 m, limit 90, waterPatch [240, 280]. The van
 * sits centred at (4.06, 460); the hero footprint (CHASSIS_HALF_EXTENTS.z =
 * 2.02) clears it from a stop at y = 450 (nose 452.02 vs the van's rear at
 * 457.75) and overlaps it once the centre passes ~455.7. Lane detectors
 * (DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM = 3.25): the осева side of the
 * band ends at x = 0.8125 (CENTER_LINE_TOUCHED, 3.5 s sustain).
 */

import { WET_GRIP_FACTOR } from "../vehicle";
import { SC_AC_AQUAPLANE } from "../lessons/scenario/templates-conditions";
import {
  recordScriptedDrive,
  SCRIPT_DECEL,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_AQUAPLANE_ID = "sc-ac-aquaplane";

/** Northbound right-lane center of ac-aqua-v1. */
const LANE_X = 4.06;
/** The stop mark the shadow eases to (denormalized in the template). */
const STOP_MARK_Y = 450;
/** The broken-down van's centre in the lane. */
const VAN_Y = 460;

/**
 * The AUTHORED wet envelope of every ordinary ramp in this file:
 * SCRIPT_DECEL × WET_GRIP_FACTOR ≈ 3.22 m/s² — the sc-ac-wet-braking
 * dual-channel honesty contract, verbatim.
 */
export const AQUA_WET_DECEL = SCRIPT_DECEL * WET_GRIP_FACTOR;
/**
 * The float-drift mistake's PANIC stop after regaining the road: the wet
 * PHYSICAL cap, not the comfortable rate — full service brake ≈
 * BRAKE_FORCE_N / CHASSIS_MASS ≈ 9 m/s² dry, × WET_GRIP_FACTOR ≈ 6.3 m/s².
 * An honest emergency stop on wet asphalt (the demo's near-miss needs it;
 * the shadow never does — its stop is planned, not rescued).
 */
export const AQUA_PANIC_DECEL = 6.3;

/** The broken-down van (the wet-braking footprint) centred in the lane at
 *  (4.06, 460): the obstruction the driver must stop short of. */
export function aquaVanObstacle(): ObstacleRect2D[] {
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
// The correct demonstration (shadow) — slow BEFORE the water, steady across
// ---------------------------------------------------------------------------

export function scAcAquaplaneShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пороен дъжд на извънградски път — и стояща вода в ниското напред. Решенията се взимат ПРЕДИ водата." },
      // Low beams ON, set explicitly: the recorder's DAY default is "off",
      // which would itself grade HEADLIGHTS_OFF_IN_RAIN.
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // ~70 km/h — under the 76.5 km/h rain envelope for the whole approach.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, 170]], targetKmh: 70, stopAtEnd: false },
      { kind: "annotation", textBg: "Стояща вода след ~70 метра: над ~65 км/ч гумите изплуват. Смъкваме под 60 ОЩЕ СЕГА, на чист асфалт." },
      // Ease to ~55 BEFORE the span — the wet comfortable envelope; the
      // pre-water objective zone (y 225 ± 10, cap 58) is passed at 55.
      { kind: "drive", points: [[LANE_X, 170], [LANE_X, 225]], targetKmh: 55, maxDecelMps2: AQUA_WET_DECEL, stopAtEnd: false },
      { kind: "annotation", textBg: "Във водата: равна газ, прав волан, никаква спирачка — под скоростта на изплуване протекторът изхвърля водата." },
      // The transit: steady 55 through [240, 280] — below the float speed
      // the patch physically cannot bite (the live car keeps its wet grip).
      { kind: "drive", points: [[LANE_X, 225], [LANE_X, 300]], targetKmh: 55, stopAtEnd: false },
      { kind: "annotation", textBg: "Водата свърши. Напред е аварирал автомобил — вдигаме газта отрано: мокрият спирачен път е ~1,4 пъти по-дълъг." },
      // The wet stop ramp: WET envelope needs ~52 m from 55 — braking begins
      // around y ≈ 398, visibly early.
      { kind: "drive", points: [[LANE_X, 300], [LANE_X, STOP_MARK_Y]], targetKmh: 55, maxDecelMps2: AQUA_WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спряхме плавно на позицията. Аквапланингът изобщо не се случи — защото скоростта падна ПРЕДИ водата." },
      { kind: "annotation", textBg: "Правилото: стояща вода = под скоростта на изплуване преди нея, равна газ и прав волан в нея." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Полет във водата — 85 в дъжда"
// (COLLISION + SPEED_TOO_FAST_FOR_CONDITIONS)
// ---------------------------------------------------------------------------

export function scAcAquaplaneMistakeFullSpeedScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 85 км/ч в пороя — „нали ограничението е 90“." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 85 sustained through the rain (> 76.5 for ≫ 3 s →
      // SPEED_TOO_FAST_FOR_CONDITIONS), carried STRAIGHT INTO the water.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, 235]], targetKmh: 85, stopAtEnd: false },
      { kind: "annotation", textBg: "Водата идва — а газта остава долу. При 85 гумите ще изплуват в мига на допира." },
      // THE FLOAT, authored honestly: NO braking ramp exists inside the span
      // — in aquaplaning the pedals reach nothing; the car simply carries
      // its 85 through [240, 280] and far beyond before the driver's foot
      // finally finds asphalt.
      { kind: "drive", points: [[LANE_X, 235], [LANE_X, 390]], targetKmh: 85, stopAtEnd: false },
      { kind: "annotation", textBg: "Воланът олекна — колата плува. Спирачката ще стигне асфалта чак СЛЕД водата… твърде късно." },
      // The too-late wet stop: the WET envelope needs ~123 m from 85; only
      // ~66 remain to the van — impact at ~40 km/h.
      { kind: "drive", points: [[LANE_X, 390], [LANE_X, 461]], targetKmh: 85, maxDecelMps2: AQUA_WET_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Ударът беше неизбежен още преди водата: несъобразената с дъжда скорост изяде и водата, и спирачния път (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „«В нормата съм» — 72 върху водата" (CENTER_LINE_TOUCHED)
// ---------------------------------------------------------------------------

export function scAcAquaplaneMistakeFloatDriftScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: 72 км/ч — уж съобразено с дъжда… но НАД скоростта на изплуване." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      // 72 < 76.5: fully lawful in the rain — no speed code. The fault is
      // physics, not the limit: 72 > 65 and the water is deep.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, 215]], targetKmh: 72, stopAtEnd: false },
      { kind: "annotation", textBg: "Върху водата предницата „заплува“ — и колата тръгва косо наляво, без воланът да я води." },
      // THE FLOAT DRIFT, authored into the polyline: the car glides
      // diagonally onto the осева during the span and RIDES it long after
      // (x < 0.8125 from y ≈ 274 to ≈ 355 — ~4 s at 72 km/h, past the 3.5 s
      // CENTER_LINE sustain), the flailing driver easing it back only once
      // the water is far behind.
      {
        kind: "drive",
        points: [[LANE_X, 215], [3.2, 242], [1.4, 262], [0.6, 278], [0.6, 352], [2.4, 379], [LANE_X, 398]],
        targetKmh: 72,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата язди осевата линия срещу насрещното — секунди, в които никой не кара, само се чака." },
      // The rescued near-miss: a genuine PANIC stop at the wet physical cap
      // (≈ 6.3 m/s²) rests the car ~6 m short of the van — luck, not skill.
      { kind: "drive", points: [[LANE_X, 398], [LANE_X, 444]], targetKmh: 72, maxDecelMps2: AQUA_PANIC_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "„Малко по-бавно“ не стига: правилото е ПОД скоростта на изплуване преди водата — тук под 60 (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcAquaplaneTraceName = "shadow-correct" | "mistake-full-speed" | "mistake-float-drift";

const SCRIPTS: Record<
  ScAcAquaplaneTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcAquaplaneShadowScript },
  "mistake-full-speed": { kind: "mistake", script: scAcAquaplaneMistakeFullSpeedScript },
  "mistake-float-drift": { kind: "mistake", script: scAcAquaplaneMistakeFloatDriftScript },
};

/**
 * Record one of the three drives against a loaded ac-aqua-v1 document — in
 * DAY RAIN, the van obstacle armed, ambient traffic zero (the harness law).
 * collisionMinKmh 5 so even a slowed overrun into the van grades COLLISION.
 * Deterministic: same district → same trace.
 */
export function recordScAcAquaplaneDrive(
  districtRaw: unknown,
  name: ScAcAquaplaneTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_AQUAPLANE_ID,
    kind,
    seed: 7,
    ...(SC_AC_AQUAPLANE.staged && SC_AC_AQUAPLANE.staged.length > 0
      ? { stagedEvents: [...SC_AC_AQUAPLANE.staged] }
      : {}),
    rain: true,
    obstacles: aquaVanObstacle(),
    collisionMinKmh: 5,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
