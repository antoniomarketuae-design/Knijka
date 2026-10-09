/**
 * sc-ac-wind-truck-pass — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Страничен вятър след камиона" (doc 72 AC-12,
 * the crosswind physics slice, OVERTAKING beat) on the committed mw-v1 district
 * (the 2600 m divided 2+2 АМ posted 140), recorded in DAY DRY with the
 * template's OWN staged truck (sc-acw-truck — single truth, imported from the
 * template) in the cruise lane. Ambient traffic ZERO (seed 7).
 *
 * THE RESTAGE OF 2026-10-08 (sc-ac-wind-truck-pass:ff1d4290). The truck used to
 * be `matchPlayer`: it paced 60 m ahead of the ghost for the whole drive, the
 * „pass" was a polyline through an empty lane, and the last caption said
 * «изпреварихме камиона» over a truck that was still ahead. It now holds its
 * own 40 км/ч on a scheduled cruise, in the recorder's stack exactly as in the
 * live one, so every drive below really meets it:
 *
 *   - shadow: follows at a distance, signals, pulls out a good three seconds
 *     behind the truck, draws level with the cab at ~70 км/ч inside its LEE
 *     (the live car's wind is at 30 % there — `vehicle/windShelter.ts`), is met
 *     by the returning wind one car length past the cab (authored drift to
 *     x ≈ −8.9, ~0.8 m — far inside the 3.25 m band), and returns to the right
 *     lane with the right indicator once the truck's nose is 10 m behind its
 *     tail → ZERO violations, SAFE_LANE_CHANGE each way, CLEAN_DRIVING. The
 *     staged runner reports `drewLevel` and `overtaken` on this drive, which
 *     is what completes the lesson's first two tasks;
 *   - „Изненадан от порива“: road speed and a loose hand; the wind that comes
 *     back past the cab walks the car to x ≈ −11.6 (offset ≈ 3.48 m > the
 *     band) and it rides the median side ~4 s → EXACTLY POOR_LANE_KEEPING;
 *   - „Рязка корекция в тясната пролука“: the pass is made hard against the
 *     truck's side of the lane, and a sharp correction to the right, made as
 *     the car enters the lee and HELD there — where there is no wind left to
 *     lean on — carries the car on an arc into the truck's flank beside the
 *     cab. The contact is REAL: the director's sentinel reports the two bodies
 *     overlapping (the scripted `collision` seam is gone). The driver has
 *     looked right and signalled right before the wheel goes over (round 2),
 *     so the swerve grades as nothing but what it is → EXACTLY COLLISION, and
 *     the recording's wheel channel shows the correction (`heldWheel`).
 *
 * DUAL-CHANNEL HONESTY (the 4a design note, wind edition — sc-ac-crosswind
 * verbatim): the LIVE student session runs REAL wind physics (LessonSpec
 * .physics.crosswind → the westward force + gust sine, multiplied by the lee).
 * These recordings are KINEMATIC (recorder.ts authored envelopes — VehicleSim
 * never runs), so what the wind does to the car is AUTHORED into the polylines
 * below; what the TRUCK does is not authored at all — it is the staged actor,
 * stepped by the same traffic system, and the gates in
 * `__tests__/sc-ac-wind-truck-pass-traces.test.ts` measure each caption
 * against where it really is.
 *
 * Geometry pinned to content/world/mw-v1.json (meta.scenario): northbound
 * carriageway — cruise lane (laneId 1) center x = 0, overtaking lane (laneId 2)
 * x = −8.12, emergency lane x = 8.13; spawn mw-spawn-approach (0, 15) heading
 * north; limit 140; length 2600. Lane detectors
 * (DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM = 3.25): in the overtaking lane the
 * offset passes 3.25 m toward the median at x < −11.375; the pass never leaves
 * laneId 2 (basin [−12.19, −4.06]).
 */

import type { StagedEventSpec } from "../contracts";
import { SC_AC_WIND_TRUCK_PASS } from "../lessons/scenario/templates-conditions2";
import { lessonRigPhysics } from "../vehicle";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_AC_WIND_TRUCK_PASS_ID = "sc-ac-wind-truck-pass";

/** mw-v1 northbound CRUISE-lane center (laneId 1 — meta.scenario.laneCruiseX). */
const X_CRUISE = 0;
/** mw-v1 northbound OVERTAKING-lane center (laneId 2 — meta.scenario.laneLeftX). */
const X_OVERTAKE = -8.12;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — a real pass: lee, cab, wind, return
// ---------------------------------------------------------------------------

/** Where the shadow's nose enters the truck's wake, clears its cab and has
 *  the whole truck in its mirror, m up the road. NOT free numbers: the truck
 *  is the staged actor on its own schedule, and the trace gate measures all
 *  three against where it really is on the recorded drive (the wind share at
 *  WAKE_Y, the car's nose against the truck's at CAB_Y, the road between the
 *  two bumpers at CLEAR_Y). */
const WAKE_Y = 232;
const CAB_Y = 284;
const CLEAR_Y = 340;

export function scAcWindTruckPassShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Магистрала в силен страничен вятър, а пред нас пъпли бавен камион. Двете ръце здраво на волана." },
      // Cruise-lane approach, building to a MODERATE pass speed (the prudent-wind
      // band). The truck moved off with us and is pulling up to its 40 км/ч.
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 112]], targetKmh: 74, stopAtEnd: false },
      { kind: "annotation", textBg: "Намаляваме преди изпреварването — колкото по-бавно минаваме, толкова по-малко ще ни отмести поривът." },
      // Declared overtake, started three seconds behind the truck: LEFT
      // indicator + mirror, then the lane change (→ SAFE_LANE_CHANGE). The LEFT
      // indicator stays on across the pass, exempting keep-right.
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CRUISE, 112], [X_OVERTAKE, 192]], targetKmh: 62, stopAtEnd: false },
      // In the overtaking lane, closing on the truck's tail at 62 км/ч against
      // its 40: its wake begins 13 m behind it, and from there to the cab the
      // live car's wind is at 30 % (the held-wheel channel of this recording
      // eases with it).
      { kind: "drive", points: [[X_OVERTAKE, 192], [X_OVERTAKE, WAKE_Y]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Влизаме в завета на камиона — вятърът отслабна. Отпускаме корекцията плавно и държим волана готов: пред кабината вятърът се връща наведнъж." },
      { kind: "drive", points: [[X_OVERTAKE, WAKE_Y], [X_OVERTAKE, CAB_Y]], targetKmh: 62, stopAtEnd: false },
      { kind: "annotation", textBg: "Носът излезе пред кабината — заветът свърши и вятърът ни бута наляво. Посрещаме го с лека, ПОСТОЯННА корекция надясно, не с рязко дръпване." },
      // The returning wind, AUTHORED into the polyline: it shoves LEFT and the
      // correct driver meets it with a small STEADY correction (drift to
      // x ≈ −8.9, ≈ 0.8 m, far inside the 3.25 m band), held, then released.
      {
        kind: "drive",
        points: [[X_OVERTAKE, CAB_Y], [-8.9, CAB_Y + 20], [-8.7, CAB_Y + 38], [X_OVERTAKE, CLEAR_Y]],
        targetKmh: 62,
        stopAtEnd: false,
      },
      // Return: RIGHT indicator + mirror once the WHOLE truck is behind (its
      // nose a good 10 m behind our tail), then the lane change back to the
      // cruise lane (→ SAFE_LANE_CHANGE).
      { kind: "annotation", textBg: "Целият камион е в огледалото — десен мигач и се прибираме плавно в дясната лента." },
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: [[X_OVERTAKE, CLEAR_Y], [X_CRUISE, CLEAR_Y + 85]], targetKmh: 70, stopAtEnd: false },
      { kind: "indicator", setting: "off" },
      { kind: "drive", points: [[X_CRUISE, CLEAR_Y + 85], [X_CRUISE, 910]], targetKmh: 78 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: изпреварихме камиона със съобразена скорост, посрещнахме вятъра пред кабината в лентата и се прибрахме плавно." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изненадан от порива" (POOR_LANE_KEEPING — toward the median)
// ---------------------------------------------------------------------------

export function scAcWindTruckPassMistakeBlownOutScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: изпреварване с пътна скорост и отпусната ръка в силен страничен вятър." },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, 100]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      { kind: "drive", points: [[X_CRUISE, 100], [X_OVERTAKE, 180]], targetKmh: 80, stopAtEnd: false },
      { kind: "drive", points: [[X_OVERTAKE, 180], [X_OVERTAKE, 240]], targetKmh: 80, stopAtEnd: false },
      { kind: "annotation", textBg: "Пред кабината заветът свършва, вятърът се връща — и с отпусната ръка колата тръгва наляво, към разделителната ивица." },
      // Loose hands past the cab: the returning wind walks the car to
      // x ≈ −11.6 (offset ≈ 3.48 m, past the 3.25 m band) and it rides the
      // median side for ~97 m — ~4.3 s at 80 km/h, past the 3 s
      // POOR_LANE_KEEPING sustain. Never leaves laneId 2 (basin left edge −12.19).
      {
        kind: "drive",
        points: [[X_OVERTAKE, 240], [-11.6, 290], [-11.6, 387]],
        targetKmh: 80,
        stopAtEnd: false,
      },
      { kind: "annotation", textBg: "Колата се понесе през половин лента към разделителната ивица, докато водачът се събуди." },
      { kind: "drive", points: [[-11.6, 387], [X_OVERTAKE, 437], [X_OVERTAKE, 507]], targetKmh: 76 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "При излизане от завета на камион скоростта се смъква ПРЕДИ това, а воланът се държи здраво с двете ръце (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Рязка корекция в тясната пролука" (COLLISION — into the
// truck's flank)
// ---------------------------------------------------------------------------

/** The narrow gap: the pass is made at x = −5.0 — still laneId 2, 3.1 m right
 *  of the lane's centre and inside the 3.25 m band — so the car's flank passes
 *  the truck's with about three metres of air between them instead of six. */
const CLIP_GAP_X = -5.0;
/**
 * THE SHARP CORRECTION, AS A PATH (round 2 — the round-1 verifier's F-04: the
 * «рязка корекция» was a straight 3.1 m diagonal over 44 m, one 4° kink the
 * recorder turned in a single frame, and the wheel channel read 0 on every
 * sample). It is an ARC now, of this radius, to the right: the line a car
 * follows when its wheel is put over and HELD — which is the caption's own
 * word, «…рязката корекция срещу него ОСТАВА».
 *
 * WHY 222 m. At the demo's 80 км/ч that is a yaw rate of 0.10 rad/s and
 * 2.2 m/s² across the car: the hardest turn the kinematic recorder will make
 * without slowing for it (its curve-speed cap bites above 8° of heading in any
 * 30 m of path — 30 m of this arc is 7.7°), so the car is still doing 80 when
 * it hits. The front wheels that hold such an arc stand at
 * atan(wheelbase / R) ≈ 11.7 mrad — about twice the correction the open wind
 * asks of this car at that speed, kept on while the wind falls to a third of
 * itself in the lee. That is what throws it.
 */
const CLIP_ARC_RADIUS_M = 222;
/** Where the wheel goes over, m up the road: the car's nose is a few metres
 *  into the truck's wake there (the trace gate measures the wind share on that
 *  frame against the staged truck), and the arc that starts here meets the
 *  truck's flank with the car's nose beside the back of the cab. */
const CLIP_SWERVE_Y = 194.6;
/** The arc is followed until the car's centre is here: its front-right corner
 *  (0.85 m out, 2.02 m forward, yawed 9°) is then some 0.15 m inside the
 *  truck's flank (x = −1.2), so the two bodies really overlap. */
const CLIP_HIT_X = -2.2;

/**
 * THE PULL-OUT IS LONG AND GENTLE ON PURPOSE (y = 30…140, two arcs of 605 m
 * radius, a vertex every 5 m). The wheel channel is computed from the path, and
 * a lane change drawn as one straight diagonal turns the car at its two ends in
 * a single frame each — which the channel then shows as a wheel input LARGER
 * than the correction this demo is about (measured on the first cut of this
 * script: 13.8 mrad at the end of a 70 m diagonal against 10.9 in the swerve).
 * Drawn this way the lane change's own share of the wheel is about 4 mrad, the
 * car then runs straight for two and a half seconds on the held correction
 * (5.6 mrad to the right at 80 км/ч), and the wheel going over in the lee takes
 * it to 10.9 — twice what was being held, while the wind falls to a third.
 */
const CLIP_PULL_OUT_FROM_Y = 30;
const CLIP_PULL_OUT_TO_Y = 140;
function clipPullOut(): Array<[number, number]> {
  const y0 = CLIP_PULL_OUT_FROM_Y;
  const y1 = CLIP_PULL_OUT_TO_Y;
  const half = (y1 - y0) / 2;
  // Two mirrored parabolic arcs: x falls by half the offset over each half.
  const k = (CLIP_GAP_X - X_CRUISE) / 2 / (half * half);
  const pts: Array<[number, number]> = [];
  for (let y = y0; y <= y1 + 1e-9; y += 5) {
    const d = y - y0;
    const x = d <= half ? X_CRUISE + k * d * d : CLIP_GAP_X - k * (y1 - y) * (y1 - y);
    pts.push([x, y]);
  }
  return pts;
}

/** The arc's points, every 2 m of path, from the swerve to the hit. */
function clipSwerveArc(swerveY: number): Array<[number, number]> {
  const R = CLIP_ARC_RADIUS_M;
  const endAngle = Math.acos(1 - (CLIP_HIT_X - CLIP_GAP_X) / R);
  const n = Math.ceil((endAngle * R) / 2);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const a = (endAngle * i) / n;
    pts.push([CLIP_GAP_X + R * (1 - Math.cos(a)), swerveY + R * Math.sin(a)]);
  }
  return pts;
}

export function scAcWindTruckPassMistakeClipTruckScript(swerveY: number = CLIP_SWERVE_Y): DriveScript {
  const arc = clipSwerveArc(swerveY);
  const [hitX, hitY] = arc[arc.length - 1]!;
  return {
    steps: [
      { kind: "annotation", textBg: "Грешката: тясна пролука до камиона и висока скорост — пролуката не оставя място за грешка с волана." },
      { kind: "drive", points: [[X_CRUISE, 15], [X_CRUISE, CLIP_PULL_OUT_FROM_Y]], targetKmh: 80, stopAtEnd: false },
      { kind: "indicator", setting: "left" },
      { kind: "glance", mirror: "left" },
      // The narrow gap: the lane change stops SHORT of the lane's centre, on
      // the truck's side of it (CLIP_GAP_X) — see `clipPullOut`.
      { kind: "drive", points: clipPullOut(), targetKmh: 80, stopAtEnd: false },
      { kind: "drive", points: [[CLIP_GAP_X, CLIP_PULL_OUT_TO_Y], [CLIP_GAP_X, swerveY]], targetKmh: 80, stopAtEnd: false },
      { kind: "annotation", textBg: "В завета на камиона вятърът отслабва — а рязката корекция срещу него остава и хвърля колата към камиона." },
      // THE DRIVER HAS LOOKED AND SIGNALLED (round 2, F-04). He means to pull
      // back in the moment he is past: right indicator, right mirror — and
      // then the wheel. So the sheet reads this swerve as what the card says
      // it is and nothing else: in round 1 the same swerve also graded
      // LANE_CHANGE_WITHOUT_INDICATOR and LANE_CHANGE_WITHOUT_MIRROR_CHECK (the
      // car's centre is two metres over the lane line before the bodies can
      // touch), and the universal first-fault grace was spent on the first of
      // them — a code the card never mentions. Nor is the lane change PRAISED:
      // it ends against the truck's side, and the rule engine does not commend
      // a lane change that does (`rules/engine.ts`, the `collision` case).
      { kind: "indicator", setting: "right" },
      { kind: "glance", mirror: "right" },
      // The arc: the wheel over and held, in the lee where nothing pushes back.
      { kind: "drive", points: arc, targetKmh: 80, stopAtEnd: false },
      // After the blow the car is knocked straight and braked to a stop where
      // it is, half out of its lane — no second swerve.
      { kind: "drive", points: [[hitX, hitY], [hitX - 0.4, hitY + 42]], targetKmh: 14 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Изпреварването на камион в силен вятър иска по-широк просвет и по-ниска скорост — тръгне ли колата, за просвета трябва време, а вятърът не чака (чл. 20, ал. 2)." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScAcWindTruckPassTraceName = "shadow-correct" | "mistake-blown-out" | "mistake-clip-truck";

const SCRIPTS: Record<
  ScAcWindTruckPassTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scAcWindTruckPassShadowScript },
  "mistake-blown-out": { kind: "mistake", script: scAcWindTruckPassMistakeBlownOutScript },
  "mistake-clip-truck": { kind: "mistake", script: scAcWindTruckPassMistakeClipTruckScript },
};

/**
 * Record one of the three drives against a loaded mw-v1 document — in DAY DRY
 * (the wind is PHYSICS, opted in per template — never a weather tag), the
 * template's own staged truck, ambient traffic zero. Deterministic: same
 * district → same trace.
 */
export function recordScAcWindTruckPassDrive(
  districtRaw: unknown,
  name: ScAcWindTruckPassTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick" | "onOutcome">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_AC_WIND_TRUCK_PASS_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
    // The lesson's own rule config: it arms LANE_ENTRY_FORCED_BRAKING (round 2),
    // so the recorder's internal grader reads these drives through exactly the
    // config the live lesson runs. The trace bytes never depend on it.
    ...(SC_AC_WIND_TRUCK_PASS.ruleConfig !== undefined ? { ruleConfig: SC_AC_WIND_TRUCK_PASS.ruleConfig } : {}),
    // THE CORRECT DEMO HOLDS THE WHEEL THE LIVE CAR NEEDS (round 2, verifier
    // V-06): the shadow's `steerRad` channel carries the correction that
    // cancels the lesson's own wind — the rig physics the scene derives from
    // `physics.crosswind` — and releases it in each lull. Since the restage
    // that wind has a LEE, so the channel is computed from the sheltered force
    // at each recorded pose (`heldWheel.shelter`, the scene's own mapping
    // against the truck this recorder staged): the wheel comes off beside the
    // truck and back on at the cab, where the live car's does.
    //
    // THE CLIP-TRUCK DEMO OPTS IN TOO (round 2, F-04): its title is about the
    // hand — «Рязка корекция…» — so its wheel channel is the same computation
    // on its own recorded path: the wheel that takes this car along that arc
    // under that (sheltered) wind. The blown-out demo does not: a loose hand
    // is its story, and its channel stays the bare path estimate.
    ...(kind === "shadow" || name === "mistake-clip-truck"
      ? {
          heldWheel: {
            ...lessonRigPhysics(SC_AC_WIND_TRUCK_PASS.physics),
            shelter: {
              physics: SC_AC_WIND_TRUCK_PASS.physics,
              stagedEvents: [...(SC_AC_WIND_TRUCK_PASS.staged ?? [])] as StagedEventSpec[],
            },
          },
        }
      : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
    ...(extra?.onOutcome ? { onOutcome: extra.onOutcome } : {}),
  });
}
