/**
 * sc-follow-truck — the authored drives (doc 76 §5/§9): ONE correct shadow +
 * TWO mistake demos for „Зад камион" (FO-06, following a vision-blocking box
 * truck) on the committed fo-follow-v1 district, recorded with the template's
 * OWN staged lead truck (brakingLeadCar sc-ft-lead, `profile: "truck"` — the
 * large-vehicle actor profile; single truth, imported from the template). The
 * trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + CLEAN_DRIVING — a follow that now VARIES with
 *     the truck (20 → 13 → 21 → 15 → 20 km/h), because since B72 the truck
 *     varies too; the headway never drops under the 2.5 s floor
 *     `lane11-data-truth` pins, against the copy's «поне 3 секунди»;
 *   - „Залепен зад камиона": steady ~48 km/h behind the SAME 17 m grades
 *     EXACTLY FOLLOWING_TOO_CLOSE (~1 s at that speed — with zero forward
 *     vision);
 *   - „Доближаване „за да виждаш"": starts prudent at 20, accelerates to 48
 *     trying to peek past the truck without dropping back → grades EXACTLY
 *     FOLLOWING_TOO_CLOSE.
 *
 * Geometry pinned to content/world/fo-follow-v1.json: a 1+1 straight street on
 * x = 0, right-lane center x = 4.06, spawn fo-spawn-approach (4.06, 15) heading
 * north, 360 m long, limit 50 km/h. The truck paces AHEAD in the SAME lane
 * under T17's `scheduledCruise` with B72's `paceProfile` — its own arc, its own
 * schedule, no player term at all; its slam tier is authored out of reach in the
 * template — deterministic moving traffic whose whole hazard is the sight line
 * it takes away, not a braking drill. The two MISTAKE tapes keep pinned clones
 * of the historical matchPlayer rig (`scFollowTruckStaged`) because a recorded
 * input tape needs a lead that holds station; only the shadow drives the live
 * template. The `profile: "truck"` field is visual+data only: the leadGap
 * detector stays point-based (doc 72 FO-06 "zero grading change").
 */

import type { StagedEventSpec } from "../contracts";
import { SC_FOLLOW_TRUCK } from "../lessons/scenario/templates-following";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_FOLLOW_TRUCK_ID = "sc-follow-truck";

/** Northbound right-lane center of fo-follow-v1. */
const X_LANE = 4.06;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

/**
 * B72 / FR-53 — THE SHADOW NOW FOLLOWS A TRUCK THAT DOES SOMETHING.
 *
 * The old script was three legs of a flat 20 km/h, and it was correct against
 * the drill as it then stood: the truck held a dead-constant 20.2 km/h for the
 * whole 360 m, so „following" it was one throttle setting held for 55 seconds
 * and the gap drifted 22.4 → 25.8 m in all that time. Measured, that is the
 * founder's «very boring» — and a correct demonstration of a lesson with
 * nothing in it demonstrates nothing.
 *
 * `FT_LEAD_TRUCK.paceProfile` now eases at arc 120 (5.6 → 3.6 m/s) and again
 * at 235 (5.9 → 4.3), resuming after each, so this script mirrors it ONE
 * REACTION LATE — which is the whole skill the lesson claims to teach and the
 * only way a student can drive it, because behind a box truck the ease itself
 * is the first and only warning. The leg boundaries are the player positions
 * at which the truck's change becomes visible, not the truck's own arcs.
 */
export function scFollowTruckShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Пред теб се движи камион — той закрива целия обзор напред. Изостани на поне 3 секунди." },
      { kind: "glance", mirror: "rear" },
      // Calm ~20 km/h behind the truck's own 20.2 — the handover gap held.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 90]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Стоповете на камиона светнаха — не знаеш защо и няма как да знаеш. Вдигни крака от газта веднага." },
      // The truck's deep ease (13 km/h at arc 120–160): read it and ease too.
      { kind: "drive", points: [[X_LANE, 90], [X_LANE, 130]], targetKmh: 13, stopAtEnd: false },
      { kind: "annotation", textBg: "Тръгна пак — но дистанцията се връща бавно, не с газ. Ти не виждаш пътя, ти виждаш само вратата му." },
      { kind: "drive", points: [[X_LANE, 130], [X_LANE, 205]], targetKmh: 21, stopAtEnd: false },
      { kind: "annotation", textBg: "Пак намалява. Всеки път разбираш последен — затова разстоянието се държи предварително, а не се навакса после." },
      // The second, softer ease (15.5 km/h at arc 235–275).
      { kind: "drive", points: [[X_LANE, 205], [X_LANE, 245]], targetKmh: 15, stopAtEnd: false },
      { kind: "annotation", textBg: "Не се доближавай, „за да виждаш“ — по-близо значи по-малко видимост и по-малко време." },
      // Ends at 336, not 345: the truck runs out of carriageway at y = 360 and
      // stops there, so the last metres of the old script were a run-up onto a
      // stationary box that pushed the shadow's MINIMUM headway to 2.43 s —
      // under `lane11-data-truth`'s 2.5 s floor, and under this drill's own
      // «поне 3 секунди». y = 336 is inside the finish zone (330 ± 12).
      { kind: "drive", points: [[X_LANE, 245], [X_LANE, 336]], targetKmh: 20 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Готово: целият участък зад камиона — на дистанция, която връща изгубената видимост." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Залепен зад камиона" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowTruckMistakeTailgateScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: 48 км/ч на около секунда зад камиона — при нулева видимост напред." },
      { kind: "glance", mirror: "rear" },
      // ~48 km/h behind the SAME ~17 m gap: ~1 s — sustained tailgating with
      // the entire road ahead hidden by the box.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 160]], targetKmh: 48, stopAtEnd: false },
      { kind: "annotation", textBg: "Каквото и да спре камиона, ти ще го разбереш последен — и без никакво време за спиране." },
      { kind: "drive", points: [[X_LANE, 160], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Зад камион дистанцията се увеличава, не се топи — изостани." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Доближаване „за да виждаш"" (FOLLOWING_TOO_CLOSE)
// ---------------------------------------------------------------------------

export function scFollowTruckMistakePeekScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: дистанцията беше добра, но колата ускорява към камиона — уж за да „вижда“." },
      { kind: "glance", mirror: "rear" },
      // Prudent at 20, then accelerate to 48 WITHOUT dropping back — the same
      // 17 m becomes ~1 second, and the wall of the box only gets bigger.
      { kind: "drive", points: [[X_LANE, 15], [X_LANE, 110]], targetKmh: 20, stopAtEnd: false },
      { kind: "annotation", textBg: "Колкото по-близо до задната врата, толкова ПО-МАЛКО път се вижда." },
      { kind: "drive", points: [[X_LANE, 110], [X_LANE, 330]], targetKmh: 48 },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Видимостта зад камион се купува само с дистанция — изостани още." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScFollowTruckTraceName =
  | "shadow-correct"
  | "mistake-tailgate"
  | "mistake-peek";

const SCRIPTS: Record<
  ScFollowTruckTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scFollowTruckShadowScript },
  "mistake-tailgate": { kind: "mistake", script: scFollowTruckMistakeTailgateScript },
  "mistake-peek": { kind: "mistake", script: scFollowTruckMistakePeekScript },
};

/**
 * The staged rig for a given demo (the scFollowDistanceStaged pattern).
 *
 * LEDGER T17/T18: the DRILL's truck is now a scheduled cruise — it drives its
 * own arc at 5.6 m/s from 30 m of centres, so the live student can genuinely
 * open the gap and is not convicted at the 30 km/h his own success gate caps
 * him to. A RECORDED demo is a fixed input tape, though: replayed against a
 * lead that no longer holds station, „залепен зад камиона" (48 km/h against a
 * 20 km/h truck) ends in a rear-end and grades COLLISION instead of the
 * FOLLOWING_TOO_CLOSE it is authored to teach. So both mistakes keep a PINNED
 * clone of the historical rig, and only the shadow — the drive whose whole job
 * is to demonstrate the drill as it now plays — sees the new one.
 */
function scFollowTruckStaged(name: ScFollowTruckTraceName): StagedEventSpec[] {
  const base = [...(SC_FOLLOW_TRUCK.staged ?? [])] as StagedEventSpec[];
  if (name === "shadow-correct") return base;
  return base.map((e) =>
    e.kind === "brakingLeadCar" && e.id === "sc-ft-lead"
      ? {
          ...e,
          paceMode: "matchPlayer" as const,
          followGapM: 17, // the historical pin the two demo tapes were authored against
          maxMatchSpeedMps: 15,
          actor: { ...e.actor, cruiseSpeedMps: 8, hold: { nodeIndex: 0, offsetM: 35 } },
        }
      : e,
  );
}

/**
 * Record one of the three drives against a loaded fo-follow-v1 document — the
 * demo's staged lead truck armed (see scFollowTruckStaged), ambient traffic
 * zero (the harness law). Deterministic: same district → same trace.
 */
export function recordScFollowTruckDrive(
  districtRaw: unknown,
  name: ScFollowTruckTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_FOLLOW_TRUCK_ID,
    kind,
    seed: 7,
    stagedEvents: scFollowTruckStaged(name),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
