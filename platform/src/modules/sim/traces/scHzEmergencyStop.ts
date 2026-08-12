/**
 * sc-hz-emergency-stop — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Екстрено спиране" (PE-04) on the committed
 * hz-obstacle-v1 district, recorded with the template's OWN staged child
 * (pedestrianDartOut sc-hzes-child — single truth, imported from the template;
 * the scPeJaywalker pattern). Ambient traffic ZERO (seed 7).
 *
 * THE ENVELOPE THE DEMOS ARE TUNED AGAINST (read before editing):
 *   - the drives record with the template's OWN ruleConfig
 *     (harshBrakeDecelMps2 25 — see the template header: the engine's cause
 *     ledger is crossing-shaped and this street has no crossings, so a
 *     full-force stop would otherwise bill „рязко спиране без причина"), i.e.
 *     the recorder's internal grader runs EXACTLY the config the live lesson
 *     runs;
 *   - the recorder is KINEMATIC and its stop envelope tracks 0.7 × the step's
 *     decel cap. The live car's full-pedal rate is BRAKE_FORCE_N / CHASSIS_MASS
 *     = 11000 / 1220 ≈ 9.0 m/s², so the shadow's stop ramps pass
 *     FULL_BRAKE_DECEL = 12.9 (0.7 × 12.9 ≈ 9.03): the ghost brakes at the rate
 *     the student's own ABS stop achieves — the sc-ac-wet-braking dual-channel
 *     honesty, applied to a DRY full-force stop. From 50 km/h that envelope
 *     needs ≈ 10.7 m;
 *   - the child never leaves y = 150 and the shadow rests at STOP_MARK_Y, which
 *     is DERIVED so the car's NOSE stops 2 m short of her body (see the
 *     constant). The old literal 148 measured the gap from the hero's CENTRE
 *     and parked its bumper 2 cm past her; the isotropic 1.5 m contact circle
 *     the runner used could not see that, and exact body geometry does.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: cruises 50, stops FULL-FORCE at the mark 2 m short of the child,
 *     wheel straight (x = 4.06 throughout), waits her off the carriageway and
 *     drives on → ZERO violations;
 *   - „Късна реакция" grades EXACTLY COLLISION (holds 50 straight through the
 *     dart line and meets her at the lane centre — the ~2 s of warning spent);
 *   - „Отклонение от лентата вместо спиране" grades EXACTLY POOR_LANE_KEEPING +
 *     COLLISION (yanks right instead of braking: the swerve MISSES the child —
 *     a 1.5 m contact radius at x ≈ 3.9 cannot reach a car at x = 7.8, which is
 *     the honest geometry and the point of the card — then holds the gutter line
 *     past the 3 s lane-keep sustain and runs into the parked car at y = 185).
 *
 * Geometry pinned to content/world/hz-obstacle-v1.json: a 240 m two-way street
 * on x = 0, northbound right-lane center x = 4.06 (lane width 8.125, so the
 * carriageway edge is x = 8.125 and the 3.25 m lane-keep tolerance is crossed at
 * x > 7.31), spawn hz-spawn-approach (4.06, 15) heading north, limit 50, NO
 * crossings / intersections / zones.
 */

import { PEDESTRIAN_BODY_RADIUS_M, PLAYER_HALF_LENGTH_M } from "../collision";
import type { StagedEventSpec } from "../contracts";
import { SC_HZ_EMERGENCY_STOP } from "../lessons/scenario/templates-hazards2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_HZ_EMERGENCY_STOP_ID = "sc-hz-emergency-stop";

/** Northbound right-lane center of hz-obstacle-v1. */
const LANE_X = 4.06;
/** The child's line — she crosses at a fixed y, mid-block. */
const DART_Y = 150;
/**
 * The shadow's rest mark — 2 m of AIR between the BUMPER and the child.
 *
 * IT USED TO BE THE LITERAL 148, commented "2 m short of her line", and it was
 * measured from the wrong end of the car. The hero is 4.04 m long, so a centre
 * at y = 148 puts the NOSE at 150.02 — two centimetres PAST her. The model
 * answer to «Екстрено спиране» was running the child over, and the shadow gate
 * could not see it because the grader compared two POINTS against a 1.5 m
 * circle: a walker 1.6 m in front of the centre — i.e. 0.4 m INSIDE the
 * bonnet — read as clear air. Exact body geometry (sim/collision, 2026-08-10)
 * bills it on the first frame, which is how it was found.
 *
 * Derived, never typed: her body radius + the taught 2 m + the car's own front
 * overhang. If the chassis or the pedestrian shell ever resizes, the ghost's
 * stop moves with them instead of quietly parking on top of her.
 */
const STOP_AIR_M = 2;
const STOP_MARK_Y = DART_Y - PEDESTRIAN_BODY_RADIUS_M - STOP_AIR_M - PLAYER_HALF_LENGTH_M; // 145.68
/**
 * The kinematic twin of a full ABS stop: the live car decelerates at
 * BRAKE_FORCE_N / CHASSIS_MASS ≈ 9.0 m/s² on a full pedal, and the recorder's
 * stop envelope tracks 0.7 × the cap → 0.7 × 12.9 ≈ 9.03. The ghost therefore
 * brakes at the student's own achievable rate, not at the C1 comfort rate
 * (SCRIPT_DECEL 4.6 → 3.22 m/s², which is not an emergency stop at all).
 */
const FULL_BRAKE_DECEL = 12.9;
/** The gutter line of the panic swerve: offset 4.06 − 7.8 = −3.74, past the
 *  3.25 m lane-keep tolerance (and NEGATIVE — away from the centre line, so the
 *  CENTER_LINE_TOUCHED arm stays disarmed and the generic lane-keep episode is
 *  the one that bills). */
const SWERVE_X = 7.8;

/**
 * The parked car the swerve demo runs into: curb-side of the wide lane at
 * (7.2, 185) — it spans x ∈ [6.3, 8.1], and the hero footprint
 * (CHASSIS_HALF_EXTENTS.x = 0.85) at the gutter line x = 7.8 spans [6.95, 8.65],
 * so the swerved car hits it while a car on the 4.06 driving line ([3.21, 4.91])
 * clears it by 1.4 m — the shadow and the late-reaction demo never touch it.
 * A RECORDER obstacle rect (the sc-hazard-obstacle / sc-ac-night-overdrive mold
 * on this same family): the live student's graded skill is the stop-mark zone,
 * and the swerve's consequence is demonstrated by the red ghost.
 */
export function hzEmergencyStopObstacles(): ObstacleRect2D[] {
  return [
    {
      x: 7.2,
      y: 185,
      headingDeg: 0,
      halfWidthM: 0.9,
      halfLengthM: 2.25,
      withWhat: "vehicle" as const,
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — 50 km/h, full-force stop, straight wheel
// ---------------------------------------------------------------------------

export function scHzEmergencyStopShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Права улица, 50 км/ч. Стъпалото стои готово над спирачката — тук няма пътека, която да те предупреди." },
      { kind: "glance", mirror: "rear" },
      // The lawful approach — 50 exactly (the graced band is 55), held to the
      // release point so the dart arms at its authored trigger speed.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 90], [LANE_X, 120]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Топка на платното — и веднага след нея детето. Оттук имаш около две секунди." },
      // FULL BRAKE, wheel dead straight: 28 m of room for a ~10.7 m stop, so the
      // envelope brakes of its own accord at y ≈ 137 and rests on the mark.
      { kind: "drive", points: [[LANE_X, 120], [LANE_X, STOP_MARK_Y]], targetKmh: 50, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "annotation", textBg: "Спирачка ДОКРАЙ и я държим натисната — педалът вибрира, това е ABS, който работи." },
      // Wait her off the carriageway (she clears x < −8.125 at ≈ 7.1 s from
      // release; the stop lands at ≈ 2.8 s, so the residue is ~4.5 s).
      { kind: "pause", sec: 5.5, brake: true },
      { kind: "annotation", textBg: "Воланът остана прав — при ABS правата линия е и най-късото, и най-управляемото спиране." },
      { kind: "glance", mirror: "left" },
      { kind: "annotation", textBg: "Платното е чисто — чак сега потегляме." },
      { kind: "drive", points: [[LANE_X, STOP_MARK_Y], [LANE_X, 190], [LANE_X, 225]], targetKmh: 45 },
      { kind: "pause", sec: 1, brake: true },
      { kind: "annotation", textBg: "Точно така: пълна спирачка, прав волан, спряхме преди детето — и чакахме, докато освободи платното." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Късна реакция" (COLLISION)
// ---------------------------------------------------------------------------

export function scHzEmergencyStopMistakeLateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: детето е на платното, а кракът още стои на газта." },
      { kind: "glance", mirror: "rear" },
      // The SAME lawful 50 as the shadow — the only fault this demo shows is
      // WHEN the foot moves. It never does in time: the car holds 50 straight
      // through her line and meets her at the lane centre (≈ 2.2 s after
      // release, exactly where the dart is tuned to be).
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 90], [LANE_X, 152]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Двете секунди отидоха в чудене — 28 метра при 50 км/ч. Спирачката поема чак сега…" },
      // The stop that comes too late: full force, but the metres are spent.
      { kind: "drive", points: [[LANE_X, 152], [LANE_X, 175]], targetKmh: 50, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Спирачният път е физика и не се пазари. Реакцията е единственото, което е твое — и тя закъсня." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Отклонение от лентата вместо спиране"
// (POOR_LANE_KEEPING + COLLISION)
// ---------------------------------------------------------------------------

export function scHzEmergencyStopMistakeSwerveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: рефлексът дърпа волана, а не спирачката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 90], [LANE_X, 124]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Детето изскача — и вместо спирачка идва волан надясно." },
      // The yank: out of the lane onto the gutter line, speed untouched.
      { kind: "drive", points: [[LANE_X, 124], [SWERVE_X, 136]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Разминаване — но колата вече не е в лентата си и никой не я връща обратно." },
      // Holding the excursion: |offset| 3.74 > the 3.25 tolerance for well past
      // the 3 s lane-keep sustain (POOR_LANE_KEEPING fires ≈ y 174) — and then
      // the curb side collects what it always has on it.
      { kind: "drive", points: [[SWERVE_X, 136], [SWERVE_X, 178]], targetKmh: 50, stopAtEnd: false },
      { kind: "annotation", textBg: "Встрани от лентата не е празно — там е паркираният автомобил…" },
      { kind: "drive", points: [[SWERVE_X, 178], [SWERVE_X, 190]], targetKmh: 50, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Заобикалянето не е спиране — само сменя в какво ще се удариш. С ABS: първо спирачка докрай, воланът остава жив." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScHzEmergencyStopTraceName = "shadow-correct" | "mistake-late-reaction" | "mistake-swerve";

const SCRIPTS: Record<
  ScHzEmergencyStopTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scHzEmergencyStopShadowScript },
  "mistake-late-reaction": { kind: "mistake", script: scHzEmergencyStopMistakeLateScript },
  "mistake-swerve": { kind: "mistake", script: scHzEmergencyStopMistakeSwerveScript },
};

/**
 * Record one of the three drives against a loaded hz-obstacle-v1 document — the
 * TEMPLATE's staged child armed (single truth), the curb-side parked car staged
 * as an obstacle rect, ambient traffic zero (the harness law). The template's
 * OWN ruleConfig is passed through, so the recorder's internal grader runs the
 * same disarmed causeless-harsh-brake threshold the live lesson runs.
 * collisionMinKmh 5 so even a gentle overrun into the parked car grades
 * COLLISION. Deterministic: same district → same trace.
 */
export function recordScHzEmergencyStopDrive(
  districtRaw: unknown,
  name: ScHzEmergencyStopTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_HZ_EMERGENCY_STOP_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_HZ_EMERGENCY_STOP.staged ?? [])] as StagedEventSpec[],
    obstacles: hzEmergencyStopObstacles(),
    collisionMinKmh: 5,
    ...(SC_HZ_EMERGENCY_STOP.ruleConfig ? { ruleConfig: SC_HZ_EMERGENCY_STOP.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
