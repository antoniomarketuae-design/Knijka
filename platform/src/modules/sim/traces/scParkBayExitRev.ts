/**
 * sc-park-bay-exit-rev — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Излизане на заден от перпендикулярно място" on the
 * committed lot-perp-v1 district (the P0's map, REUSED byte-for-byte), recorded
 * with the template's OWN staged walker (single truth, imported from the spec).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations with the parked-car obstacle rects ARMED at
 *     collisionMinKmh 0 — the car leaves a bay boxed on both sides, pauses
 *     twice mid-arc to look, then yields to the staged walker on the aisle;
 *   - „Заден ход без оглед": the blind reverse's scripted pedestrian
 *     consequence, EXACTLY COLLISION;
 *   - „Изнасяне със замах": the SAME arc driven in one motion without a single
 *     pause or look, scripted contact with a car passing down the aisle,
 *     EXACTLY COLLISION.
 *
 * Geometry pinned to content/world/lot-perp-v1.json (the demo.ts pattern —
 * lessons pin district coordinates by value):
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   bay row on the EAST side, bay rects x ∈ [2.53, 7.53];
 *   start bay lot-bay-3 centre (5.03, 0), axis east-west (headingDeg 90);
 *   occupied neighbours lot-bay-1/2/4/5 at y = ∓5.4 / ∓2.7 — their car rects
 *   (2.25 × 0.9 half-extents) span x ∈ [2.78, 7.28], y ∈ ±[1.8, 3.6];
 *   spawn lot-spawn-finish (0, 18.75) sits on the drive-away leg.
 *
 * WHY THE PATH IS SHAPED THE WAY IT IS. The hero rect is 2.02 × 0.85 half
 * extents and the bay leaves 0.95 m of air on each side, so WHERE the car
 * rotates decides whether it clips. The recorder is kinematic: heading is the
 * tangent of the CENTRE path, i.e. the car pivots about its centre, and a
 * centre-pivot rotation sweeps both ends. Rotating from the bay centre in one
 * arc (radius ≈ 4.13, the single arc that lands on the aisle line) clears the
 * neighbours by ~0.08 m — a pass, but one that any authoring rounding could
 * turn into a clip. Backing STRAIGHT 1 m first and then swinging tighter
 * (radius 3.03) trades nothing and clears by 0.426 m, because the tail is past
 * the neighbours' x-band (2.78) before the rotation gets steep. That is also
 * how the maneuver is actually taught (instruction 3: „излез назад около метър,
 * без да завърташ волана"), so the geometry and the teaching agree.
 *
 * Rule-engine safety envelope the paths respect: lane detectors arm at
 * |laneOffset| > 3.25 m ⇔ |x| < 0.81 on this road while moving > 5 km/h in a
 * FORWARD gear — the drive-away therefore runs the aisle at x = 1.0
 * (offset −3.06). Reverse gear is exempt from all lane/wrong-way detectors by
 * A12 law, which is what lets the arc cross the aisle freely.
 */

import type { StagedEventSpec } from "../contracts";
import type { ScenarioBayMeta } from "../contracts";
import { scenarioBaysOf } from "../contracts";
import { SC_PARK_BAY_EXIT_REV } from "../lessons/scenario/templates-parking2";
import {
  recordScriptedDrive,
  type DriveScript,
  type ObstacleRect2D,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PARK_BAY_EXIT_REV_ID = "sc-park-bay-exit-rev";

/**
 * Nominal parked-car footprint for the HEADLESS collision gate, m — the P0's
 * constants verbatim (the live scene colliders use each GLB rig's measured
 * bbox; these run a hair larger, so the recorded gate is at least as strict).
 */
export const PARKED_CAR_HALF_WIDTH_M = 0.9;
export const PARKED_CAR_HALF_LENGTH_M = 2.25;

/** Start pose: the centre of lot-bay-3, nose east (the bay axis), deep in. */
const BAY_X = 5.03;
const BAY_Y = 0;
/** Straight-back stop: 1 m out, wheel still straight (instruction 3). */
const X_STRAIGHT = 4.03;
/** Reverse-arc radius (car-centre path), m — the swing after the straight m. */
const ARC_R = 3.03;
/** Where the arc lands: the aisle exit line, inside the lane-detector band. */
const X_EXIT = X_STRAIGHT - ARC_R; // 1.0
const Y_EXIT = -ARC_R; // −3.03
/** The drive-away pause point: short of the staged walker's crossing (y = 10). */
const Y_YIELD = 5.5;
/** End of the drive-away leg — past the aisle checkpoint zone (0, 20). */
const Y_FINISH = 21;
/** Пешеходна скорост — the reverse target, and the dial that keeps the staged
 *  walker (minTriggerSpeedKmh 7) strictly out of the arc. */
const REVERSE_KMH = 4;

/**
 * Quarter arc of the reverse exit, car-centre path, from `fromDeg` to `toDeg`
 * of the sweep. Sweep t: centre = (X_STRAIGHT − R·sin t, −R·(1 − cos t)),
 * travel bearing 270° − t (west → south), so the recorder's reverse rule
 * (heading = bearing + 180°) yields heading 90° − t: nose east → nose north.
 * 2°-ish steps keep the chord heading within ~1° of the true tangent — two
 * orders of magnitude inside the 0.426 m clearance.
 */
function reverseExitArc(fromDeg: number, toDeg: number): Array<[number, number]> {
  const steps = Math.max(1, Math.round((toDeg - fromDeg) / 2));
  const out: Array<[number, number]> = [];
  for (let k = 0; k <= steps; k++) {
    const t = ((fromDeg + ((toDeg - fromDeg) * k) / steps) * Math.PI) / 180;
    out.push([X_STRAIGHT - ARC_R * Math.sin(t), -ARC_R * (1 - Math.cos(t))]);
  }
  return out;
}

/**
 * The headless obstacle set of a scenario-lot district: one parked-car rect
 * per OCCUPIED bay (meta.scenario.bays — the same single truth the scene's
 * ScenarioObstacles mounts from). The P0's helper, re-derived here so the two
 * templates never share a private.
 */
export function lotObstacleRects(districtRaw: unknown): ObstacleRect2D[] {
  return scenarioBaysOf(districtRaw)
    .filter((b: ScenarioBayMeta) => b.occupied)
    .map((b) => ({
      x: b.x,
      y: b.y,
      headingDeg: b.headingDeg,
      halfWidthM: PARKED_CAR_HALF_WIDTH_M,
      halfLengthM: PARKED_CAR_HALF_LENGTH_M,
      withWhat: "vehicle" as const,
    }));
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkBayExitRevShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Паркирани сме с предницата навътре, отляво и отдясно има коли. Оглеждането е ПРЕДИ задната.",
      },
      // Rubric moment obs-before-reverse: both mirrors, then over the shoulder.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Алеята зад нас е чиста. Чак сега — задна предавка." },
      {
        // Straight back 1 m (wheel still straight), then the first third of the
        // swing — the nose has not started to cut toward the neighbour yet.
        kind: "drive",
        points: [[BAY_X, BAY_Y], ...reverseExitArc(0, 30)],
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Спри и погледни пак: по алеята зад теб може да мине човек." },
      // Mid-maneuver pause 1 — rubric moment obs-during-reverse.
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: reverseExitArc(30, 60),
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Задницата вече е в алеята — спри отново и се убеди, че нищо не идва." },
      // Mid-maneuver pause 2 — the second look of the two the maneuver requires.
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: reverseExitArc(60, 90),
        targetKmh: REVERSE_KMH,
        reverse: true,
      },
      { kind: "annotation", textBg: "Изправи волана. Излязохме — колата е подравнена по алеята." },
      { kind: "pause", sec: 1.0, brake: true },
      // Rubric moment obs-before-moveoff: look down the aisle both ways first.
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Погледни по алеята в двете посоки и чак тогава потегли напред." },
      {
        // Drive away up the aisle at x = 1.0 — inside the lane-detector band,
        // clear of the parked rects (which start at x = 2.78). Above 7 km/h,
        // so the staged walker arms here and only here.
        kind: "drive",
        points: [
          [X_EXIT, Y_EXIT],
          [X_EXIT, Y_YIELD],
        ],
        targetKmh: 9,
      },
      { kind: "annotation", textBg: "Пешеходец пресича алеята. В паркинга хората вървят по платното — спри и изчакай." },
      // She needs ~6.5 s to clear her 8.4 m walk; 7 s of standstill lets her
      // finish with margin, and a stopped car can never trip the contact check.
      { kind: "pause", sec: 7.0, brake: true },
      { kind: "glance", mirror: "right" },
      // No-spoiler voice (sc-zebra-approach:8dda834f class): condition before command.
      { kind: "annotation", textBg: "Продължи спокойно към изхода едва когато алеята е чиста." },
      {
        kind: "drive",
        points: [
          [X_EXIT, Y_YIELD],
          [X_EXIT, Y_FINISH],
        ],
        targetKmh: 12,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Точно така: оглед преди задната, пешеходна скорост, две спирания — и пропуснат пешеходец.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Заден ход без оглед" (scripted pedestrian consequence)
// ---------------------------------------------------------------------------

export function scParkBayExitRevMistakeBlindScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо, когато задната влезе преди огледалата.",
      },
      {
        kind: "annotation",
        textBg: "Задна предавка ВЕДНАГА — без огледала, без рамо, без поглед през задното стъкло. Това е грешката.",
      },
      {
        // The same straight-back-then-swing geometry, driven blind. Kept under
        // the walker's 7 km/h arm so the ONLY thing this demo grades is the
        // person the driver never looked for.
        kind: "drive",
        points: [[BAY_X, BAY_Y], ...reverseExitArc(0, 40)],
        targetKmh: 5,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence: the unseen walker behind the car is struck at
      // reversing speed — the rule engine grades it exactly like a physics
      // contact (the P0's „пешеходец зад колата" seam).
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Човекът зад колата беше невидим от седалката — по устройство, не случайно. Чл. 40: убеди се, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Изнасяне със замах" (scripted contact with the aisle car)
// ---------------------------------------------------------------------------

export function scParkBayExitRevMistakeSwingScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Същата дъга — но изкарана наведнъж: без спиране, без поглед назад.",
      },
      {
        // The shadow's exact path, minus every pause and every glance: the arc
        // is proven clean against the neighbours, so the two missing checks are
        // the ONLY difference between this demo and the correct maneuver.
        kind: "drive",
        points: [[BAY_X, BAY_Y], ...reverseExitArc(0, 75)],
        targetKmh: 6,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence at the frame the tail is across the aisle
      // lane: a car coming down the aisle has nowhere to go. Scripted, because
      // no staged vehicle can be pathed on a `service` edge — see the
      // template's honest-scope header.
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Излизащият назад пропуска всички. „Замахът“ не печели секунди — той маха проверките, при които щеше да я видиш.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkBayExitRevTraceName =
  | "shadow-correct"
  | "mistake-blind-reverse"
  | "mistake-swing-out";

const SCRIPTS: Record<
  ScParkBayExitRevTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scParkBayExitRevShadowScript },
  "mistake-blind-reverse": { kind: "mistake", script: scParkBayExitRevMistakeBlindScript },
  "mistake-swing-out": { kind: "mistake", script: scParkBayExitRevMistakeSwingScript },
};

/**
 * Record one of the three drives against a loaded lot-perp-v1 document — the
 * TEMPLATE's staged walker armed (single truth), obstacles armed from the
 * district's own occupancy, collisionMinKmh 0 (the parking threshold, doc 76
 * §0). Deterministic: same district → same trace.
 */
export function recordScParkBayExitRevDrive(
  districtRaw: unknown,
  name: ScParkBayExitRevTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_BAY_EXIT_REV_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_PARK_BAY_EXIT_REV.staged ?? [])] as StagedEventSpec[],
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
