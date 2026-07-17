/**
 * sc-hz-brake-dont-swerve — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Спри в лентата, не свивай на сляпо" (OV-18)
 * on the committed hz-debris-v1 district, recorded with the template's OWN
 * staged escort (cutInLeadCar sc-hzbds-escort — single truth, imported from the
 * template; the scHzEmergencyStop / scPeJaywalker pattern). Ambient traffic
 * ZERO (seed 7), dry day.
 *
 * THE ENVELOPE THE DEMOS ARE TUNED AGAINST (read before editing):
 *   - the drives record with the template's OWN ruleConfig
 *     (harshBrakeDecelMps2 25 — see templates-hazards2.ts: hz-debris-v1 has no
 *     crossing, junction or stop line, and the escort sits a full lane pitch
 *     outside the 4 m lead corridor, so the engine's cause ledger is EMPTY and
 *     a full-force stop would otherwise bill „рязко спиране без причина"),
 *     i.e. the recorder's internal grader runs EXACTLY the config the live
 *     lesson runs;
 *   - the recorder is KINEMATIC and its stop envelope tracks 0.7 × the step's
 *     decel cap. The live car's full-pedal rate is BRAKE_FORCE_N / CHASSIS_MASS
 *     = 11000 / 1220 ≈ 9.0 m/s², so every full-force ramp here passes
 *     FULL_BRAKE_DECEL = 12.9 (0.7 × 12.9 ≈ 9.03): the ghost brakes at the rate
 *     the student's own ABS stop achieves. From 50 km/h that envelope needs
 *     ≈ 10.7 m, and gen_hz_debris.mjs asserts that it fits the 30 m reveal
 *     window while a COMFORTABLE stop (0.7 × 4.6 ≈ 3.2 m/s², ≈ 29.9 m) does not
 *     — which is why the shadow stamps instead of lifting;
 *   - the debris is a TRIGGERED obstacle rect (the VU-04 door-swing seam): it
 *     is fully inert until the player reaches the reveal 30 m out, so it does
 *     not exist before the story says it does.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: cruises 50 in lane 0 beside the escort → the debris reveals →
 *     FULL-FORCE stop on a dead-straight wheel, resting 6 m short of it, in its
 *     OWN lane → then the honest second half: mirror, indicator, and a
 *     ~20 km/h pass-around into the (by now empty) neighbouring lane and back
 *     right again → ZERO violations;
 *   - „Рязко отклонение в съседната кола" grades EXACTLY
 *     LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION: the indicator IS on (the
 *     scMergeLaneEnd „politely signalled and still blind" precedent — the demo
 *     is about the missing LOOK, so LANE_CHANGE_WITHOUT_INDICATOR must not
 *     fire and steal the point) and no left glance exists anywhere near the
 *     wheel-over;
 *   - „Късно спиране в препятствието" grades EXACTLY COLLISION: same lawful 50,
 *     same dead-straight line as the shadow — only the foot is late, so the
 *     rect at y = 190 collects the car. Never POOR_LANE_KEEPING, never a lane
 *     code: the fault is TIMING and the gate proves the line was innocent.
 *
 * Geometry pinned to content/world/hz-debris-v1.json (meta.scenario): a 300 m
 * ONE-WAY 2-lane street on x = 0 — player/curb lane (laneId 0) x = 4.06, escort
 * lane (laneId 1) x = −4.06; reveal y = 160, debris y = 190; spawn
 * hzd-spawn-approach (4.06, 15) heading 0; limit 50; NO crossings /
 * intersections / signals / zones.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_HZ_BRAKE_DONT_SWERVE } from "../lessons/scenario/templates-hazards2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_HZ_BRAKE_DONT_SWERVE_ID = "sc-hz-brake-dont-swerve";

/** hz-debris-v1 lane centers (meta.scenario — pinned by value, the L7 pattern). */
const LANE_X = 4.06; // laneId 0 — the player's curb lane
const ESCORT_X = -4.06; // laneId 1 — the escort's lane; the swerve's target
/** The reveal (meta.scenario.revealY) — where the debris rect's trigger arms. */
const REVEAL_Y = 160;
/** The debris rect's center (meta.scenario.debrisY). */
const DEBRIS_Y = 190;
/** The shadow's rest mark: 6 m short of the debris, wheel dead straight. */
const STOP_MARK_Y = 184;
/**
 * The kinematic twin of a full ABS stop: the live car decelerates at
 * BRAKE_FORCE_N / CHASSIS_MASS ≈ 9.0 m/s² on a full pedal, and the recorder's
 * envelope tracks 0.7 × the cap → 0.7 × 12.9 ≈ 9.03. The ghost therefore brakes
 * at the student's own achievable rate, not at the C1 comfort rate (SCRIPT_DECEL
 * 4.6 → 3.22 m/s², which this map is explicitly sized to make INSUFFICIENT).
 */
const FULL_BRAKE_DECEL = 12.9;
/** The approach — the posted limit exactly (the graced band is 55). */
const CRUISE_KMH = 50;
/** The shadow's post-stop pass-around: walking pace, both ways. */
const PASS_KMH = 20;

/**
 * The DEBRIS — a TRIGGERED obstacle rect in the player's lane at (4.06, 190).
 *
 * Sized as a real chunk of fallen load: 1.6 m across × 2.4 m along. It spans
 * x ∈ [3.26, 4.86]; the hero footprint (CHASSIS_HALF_EXTENTS.x = 0.85) on the
 * driving line x = 4.06 spans [3.21, 4.91] — so a car that stays in its lane
 * MUST hit it, which is the entire premise (there is no „ease around it in
 * lane" cheat here, unlike gen_hazard_obstacle's deliberately wide lane). A car
 * that reached the escort lane (x = −4.06, spanning [−4.91, −3.21]) misses it
 * by a full lane — the swerve „works" against the debris, and that is precisely
 * why the demo has to show what it finds instead.
 *
 * The `trigger` (VU-04 door-swing seam) is what makes this a HAZARD rather than
 * a landmark: the rect is fully inert — no contact, no latched state — until
 * the player first comes within 30 m of it, i.e. at the reveal y = 160. Before
 * that the debris does not exist, so nothing about the approach is a trap: a
 * driver is asked to react to it only from the moment it is there to be seen.
 *
 * A RECORDER obstacle rect (the sc-hazard-obstacle / sc-hz-emergency-stop mold
 * on this same family): the live student's graded skill is the stop-mark zone,
 * and the consequence of arriving too fast is demonstrated by the red ghost.
 * Honest gap, flagged: there is no debris GLB and no „падащ товар" world zone —
 * the object grades correctly, it does not yet render as itself.
 */
export function hzBrakeDontSwerveObstacles(): ObstacleRect2D[] {
  return [
    {
      x: LANE_X,
      y: DEBRIS_Y,
      headingDeg: 0,
      halfWidthM: 0.8,
      halfLengthM: 1.2,
      withWhat: "staticObject" as const,
      trigger: { x: LANE_X, y: DEBRIS_Y, distM: 30 },
    },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — stop straight, THEN look and go around
// ---------------------------------------------------------------------------

export function scHzBrakeDontSwerveShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Две ленти в една посока, 50 км/ч. Ние сме в дясната — а в лявата, почти наравно с вратата ни, се движи кола." },
      { kind: "glance", mirror: "rear" },
      // The lawful approach — 50 exactly, held to the reveal so the escort's
      // release arms at its authored trigger speed.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, REVEAL_Y]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Препятствие в НАШАТА лента. Рефлексът казва „встрани“ — но встрани е колата, която видяхме преди малко." },
      // FULL BRAKE, wheel dead straight: 24 m of room for a ~10.7 m stop, so
      // the envelope brakes of its own accord at y ≈ 173 and rests on the mark.
      { kind: "drive", points: [[LANE_X, REVEAL_Y], [LANE_X, STOP_MARK_Y]], targetKmh: CRUISE_KMH, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "annotation", textBg: "Спирачка ДОКРАЙ, волан ПРАВ. Педалът вибрира — това е ABS, който работи. Спряхме в своята лента, преди препятствието." },
      { kind: "pause", sec: 2.5, brake: true },
      // The escort sails past in ITS clear lane — the whole point, made visible:
      // the tarmac the reflex wanted was never empty. (It is released at the
      // reveal and needs ~4 s to clear the runner's 60 m resolve window, which
      // this hold covers — the gate asserts the resolution.)
      { kind: "annotation", textBg: "Виж я колата отляво — мина си по своята лента, без изобщо да разбере. Ако бяхме свили, щяхме да сме В нея." },
      { kind: "glance", mirror: "left" },
      { kind: "pause", sec: 3, brake: true },
      { kind: "annotation", textBg: "Колата стои, воланът е прав, ти си жив и с избор. Дотук задачата е решена — заобикалянето е следващият, отделен ход: пак с оглед и на скорост на пешеходец." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Рязко отклонение в съседната кола"
// (LANE_CHANGE_WITHOUT_MIRROR_CHECK + COLLISION)
// ---------------------------------------------------------------------------

export function scHzBrakeDontSwerveMistakeBlindSwerveScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: воланът тръгва преди очите. Препятствието се вижда — колата вляво не се проверява." },
      { kind: "glance", mirror: "rear" },
      // The SAME lawful 50 and the SAME line as the shadow — up to the reveal
      // the two drives are identical. Everything that follows is the choice.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, REVEAL_Y]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // Politely signalled — and still blind. The indicator DECLARES, it does
      // not CHECK: no left glance exists anywhere in this script, which is the
      // one fault the card claims (and the reason LANE_CHANGE_WITHOUT_INDICATOR
      // must stay silent — see the scMergeLaneEnd push-out precedent).
      { kind: "indicator", setting: "left" },
      { kind: "annotation", textBg: "Мигач — и веднага волан. Мигачът обявява маневрата, но не я проверява. В лявата лента вече има кола." },
      // The yank into the occupied lane: speed untouched, 25 m of lateral run
      // (a lane change, not a swerve-in-place — the off-centre window is ~0.4 s,
      // far inside laneKeepSustainSec, so POOR_LANE_KEEPING never bills).
      { kind: "drive", points: [[LANE_X, REVEAL_Y], [ESCORT_X, 185]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      // The authored consequence (DriveStep.collision — the scMergeLaneEnd
      // „изтласкване" / scJunctions2 „скритата кола удря носа" beat). HONEST
      // PROXY, flagged: it is an authored beat, not a physical overlap, and the
      // reason is measured, not assumed — by the time the wheel lands in lane 1
      // the escort has been RELEASED (it locked its own cruise at the reveal
      // and is pulling away), so the runner's contact test (VEHICLE_CONTACT_M
      // = 3.0) no longer reaches it. Probed: without this beat the drive grades
      // LANE_CHANGE_WITHOUT_MIRROR_CHECK alone. The gate proves the GEOMETRY the
      // beat depicts — the wheel goes fully into the escort's lane with no
      // glance behind it — which is the same standard the merging family holds.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "annotation", textBg: "Препятствието е разминато — и точно там, където отиде воланът, беше колата." },
      // Post-impact: a real full-force stop ramp, so the ghost's speed trace
      // stays physical (a bare `pause` after a stopAtEnd:false drive would
      // teleport 50 → 0 in one frame and record an absurd decel spike).
      { kind: "drive", points: [[ESCORT_X, 185], [ESCORT_X, 196]], targetKmh: CRUISE_KMH, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Сляпото отклонение сменя удар, който виждаш, с удар, за който не подозираш. Огледалото е ПРЕДИ волана — винаги." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Късно спиране в препятствието" (COLLISION)
// ---------------------------------------------------------------------------

export function scHzBrakeDontSwerveMistakeLateBrakeScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: воланът е прав и лентата е спазена — но кракът тръгва твърде късно." },
      { kind: "glance", mirror: "rear" },
      // Same lawful 50, same dead-straight line — the fault is WHEN the foot
      // moves. It never does in time: the car holds 50 well past the reveal.
      { kind: "drive", points: [[LANE_X, 15], [LANE_X, 100], [LANE_X, 182]], targetKmh: CRUISE_KMH, stopAtEnd: false },
      { kind: "annotation", textBg: "Секундата чудене при 50 км/ч е близо 14 метра. Спирачката поема чак сега — метрите вече са изхарчени." },
      // The stop that comes too late: full force, but the rect is already there.
      { kind: "drive", points: [[LANE_X, 182], [LANE_X, 200]], targetKmh: CRUISE_KMH, maxDecelMps2: FULL_BRAKE_DECEL },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Тези 30 метра стигаха: пълното спиране от 50 иска към 11. Стъпалото стои НАД спирачката, а натискът е докрай от първия сантиметър." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScHzBrakeDontSwerveTraceName =
  | "shadow-correct"
  | "mistake-blind-swerve"
  | "mistake-late-brake";

const SCRIPTS: Record<
  ScHzBrakeDontSwerveTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scHzBrakeDontSwerveShadowScript },
  "mistake-blind-swerve": { kind: "mistake", script: scHzBrakeDontSwerveMistakeBlindSwerveScript },
  "mistake-late-brake": { kind: "mistake", script: scHzBrakeDontSwerveMistakeLateBrakeScript },
};

/**
 * Record one of the three drives against a loaded hz-debris-v1 document — the
 * TEMPLATE's staged escort armed (single truth), the debris staged as a
 * triggered obstacle rect, ambient traffic zero (the harness law). The
 * template's OWN ruleConfig is passed through, so the recorder's internal
 * grader runs the same disarmed causeless-harsh-brake threshold the live lesson
 * runs. collisionMinKmh 5 so even a gentle overrun into the debris grades
 * COLLISION. Deterministic: same district → same trace.
 */
export function recordScHzBrakeDontSwerveDrive(
  districtRaw: unknown,
  name: ScHzBrakeDontSwerveTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_HZ_BRAKE_DONT_SWERVE_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_HZ_BRAKE_DONT_SWERVE.staged ?? [])] as StagedEventSpec[],
    obstacles: hzBrakeDontSwerveObstacles(),
    collisionMinKmh: 5,
    ...(SC_HZ_BRAKE_DONT_SWERVE.ruleConfig ? { ruleConfig: SC_HZ_BRAKE_DONT_SWERVE.ruleConfig } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
