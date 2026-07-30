/**
 * sc-park-parallel-exit — authored drives (lane 15, the doc 86 D11 parking
 * deepening): ONE correct shadow + TWO mistake demos for „Излизане от успоредно
 * място" on the committed lot-par-v1 district (map REUSED, untouched).
 *
 * WHY THIS IS NOT sc-park-parallel PLAYED BACKWARDS. Getting into a kerbside
 * slot is a geometry problem you solve at 2 km/h with nobody behind you.
 * Getting OUT of one is a NEGOTIATION: the nose has to come out into a lane
 * that belongs to somebody else, and it comes out at an angle, which means the
 * driver's own view down that lane is the last thing to arrive. Two facts drive
 * everything the drill teaches:
 *   - the car pivots about the REAR axle, so steering left to leave swings the
 *     TAIL RIGHT — into the kerb and into the car parked behind. The room for
 *     that swing is bought before the manoeuvre, by reversing up to the rear
 *     car first; it cannot be bought during it.
 *   - the first thing to enter the lane is the corner of the bonnet, and the
 *     last thing to see down the lane is the driver. Whatever is filtering past
 *     on the left — a cyclist, a scooter — meets the car before the car meets
 *     it. Потеглянето от място е маневра (чл. 25): огледало, ляв мигач, поглед
 *     през рамо, чак после колелата.
 *
 * The two demos are exactly those two facts failing:
 *   1. „Изнасяне без връщане назад" — no room bought, so the swing lands on the
 *      front car's rear corner (COLLISION, detail „vehicle", at creep speed —
 *      the geometric gate, collisionMinKmh 0);
 *   2. „Ляв мигач без поглед" — the room IS bought and the indicator IS on, and
 *      it still ends in contact, because a lamp announces and only a look
 *      checks (COLLISION, detail „cyclist", the authored-consequence
 *      `collision` step).
 *
 * Geometry pinned to content/world/lot-par-v1.json:
 *   aisle centreline x = 0 (northbound), drawn lane centre x = +4.0625;
 *   kerbside slot row on the EAST side, bay pitch 6.5 m, bay axis north-south
 *   (headingDeg 0); target slot lot-bay-3 centre (6.28, 0);
 *   parked neighbours lot-bay-2/4 at y = ∓6.5 — their rects (half 0.9 × 2.25)
 *   span y ∈ [−8.75, −4.25] and [4.25, 8.75], x ∈ [5.38, 7.18], so the free
 *   kerb gap is 8.5 m for a 4.04 m car.
 *
 * START POSE: (6.28, 1.6) facing north — parked in the slot but tucked up
 * behind the front car, 0.63 m off its bumper. That is what a real kerbside
 * slot looks like after somebody else parks in front of you, and it is what
 * makes „first reverse, then leave" a requirement instead of a suggestion.
 *
 * Rule-engine safety envelope: the lane detectors arm at |laneOffset| > 3.25 m
 * ⇔ x < 0.81 on this road while moving > 5 km/h in a forward gear. This drill
 * lives entirely EAST of the lane centre (x ≥ 4.06 once it is out), so no lane
 * episode can arm at any point of any of the three drives.
 */

import type { DriveScript, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_PARK_PARALLEL_EXIT_ID = "sc-park-parallel-exit";

/** Northbound drawn lane centre on the lot roads (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Kerbside slot row centre-line (lot-par-v1 bays). */
const SLOT_X = 6.28;
/** The START pose: tucked up behind the car in front (bumper at y = 4.25). */
const START_Y = 1.6;
/** After the room-buying reverse: 0.63 m off the rear car's bumper (y −4.25). */
const BACK_Y = -1.6;
/** The „no room" demo's token metre back — 2 m short of what the swing needs. */
const NO_ROOM_Y = 0.6;
/** Car-centre radius of the pull-out arc — a full left lock at creep speed. */
const OUT_R = 6.0;

/**
 * Left-hand forward arc, car-centre path: enters at (x0, y0) heading NORTH and
 * sweeps `deg` degrees counter-clockwise (the tail swinging right — the whole
 * hazard of the manoeuvre). Centre sits one radius to the LEFT.
 */
function pullOutArc(x0: number, y0: number, r: number, deg: number): Array<[number, number]> {
  const cx = x0 - r;
  const cy = y0;
  const out: Array<[number, number]> = [];
  const steps = 8;
  for (let k = 1; k <= steps; k += 1) {
    const phi = ((k / steps) * deg * Math.PI) / 180;
    out.push([cx + r * Math.cos(phi), cy + r * Math.sin(phi)]);
  }
  return out;
}

/** The straighten-and-leave leg, from the arc's exit up the aisle. */
const AWAY: Array<[number, number]> = [
  [4.3, 6],
  [X_LANE, 11],
  [X_LANE, 22],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkParallelExitShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg:
          "Колата е между две коли до бордюра, плътно зад предната. Излизането започва НАЗАД — първо си купуваш място.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "glance", mirror: "right" },
      {
        // Room-buying reverse: straight back to a hand's width off the rear car.
        kind: "drive",
        points: [
          [SLOT_X, START_Y],
          [SLOT_X, BACK_Y],
        ],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Сега огледало, ЛЯВ мигач и поглед през лявото рамо. Потеглянето от място е маневра — започва с оглед, не с волан (чл. 25).",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "rear" },
      { kind: "indicator", setting: "left" },
      { kind: "pause", sec: 0.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Волан наляво и съвсем бавно напред. Следи ДВЕ неща: предната кола вдясно от бронята ти и собствената си задница — тя замахва към бордюра.",
      },
      {
        kind: "drive",
        points: [[SLOT_X, BACK_Y], ...pullOutArc(SLOT_X, BACK_Y, OUT_R, 40)],
        targetKmh: 4,
      },
      { kind: "glance", mirror: "left" },
      {
        kind: "annotation",
        textBg: "Задницата е чиста, носът е в алеята — изправи волана и се подравни.",
      },
      { kind: "drive", points: AWAY, targetKmh: 10 },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Готово: излязъл си в лентата, без да опреш нито съседа, нито бордюра." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изнасяне без връщане назад" (no room bought → clips front)
// ---------------------------------------------------------------------------

export function scParkParallelExitMistakeNoRoomScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Бързаме: един метър назад „колкото да мръдна“ и веднага волан наляво.",
      },
      { kind: "glance", mirror: "left" },
      {
        // A token metre instead of the three the manoeuvre needs.
        kind: "drive",
        points: [
          [SLOT_X, START_Y],
          [SLOT_X, NO_ROOM_Y],
        ],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 0.6, brake: true },
      { kind: "indicator", setting: "left" },
      {
        kind: "annotation",
        textBg: "Изглежда достатъчно. Не е: дъгата вече върви към задния ъгъл на предната кола…",
      },
      {
        // The same arc as the shadow, started 2 m further forward: the front
        // car's rear corner is now inside the swing.
        kind: "drive",
        points: [[SLOT_X, NO_ROOM_Y], ...pullOutArc(SLOT_X, NO_ROOM_Y, OUT_R, 40)],
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предната дясна четвърт влезе в задния ъгъл на колата отпред. Мястото за завоя се купува назад, преди маневрата — после вече няма откъде.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Ляв мигач без поглед" (the lamp announces, only a look checks)
// ---------------------------------------------------------------------------

export function scParkParallelExitMistakeNoLookScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Този път всичко изглежда изрядно: връщане назад за място и ляв мигач.",
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [
          [SLOT_X, START_Y],
          [SLOT_X, BACK_Y],
        ],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 0.9, brake: true },
      { kind: "indicator", setting: "left" },
      {
        kind: "annotation",
        textBg: "Но мигачът само СЪОБЩАВА. Никой не погледна в огледалото и през рамо — а по алеята вече идва колело.",
      },
      {
        kind: "drive",
        points: [[SLOT_X, BACK_Y], ...pullOutArc(SLOT_X, BACK_Y, OUT_R, 22)],
        targetKmh: 4,
        stopAtEnd: false,
      },
      // The authored consequence: the cyclist filtering past on the left, met
      // by the bonnet corner before the driver ever sees down the aisle.
      { kind: "collision", withWhat: "cyclist" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мигачът не проверява нищо — той само казва какво възнамеряваш. Проверява огледалото и погледът през рамо, и то в тази последователност, ПРЕДИ колелата да се завъртят (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkParallelExitTraceName =
  | "shadow-correct"
  | "mistake-no-room"
  | "mistake-no-look";

const SCRIPTS: Record<
  ScParkParallelExitTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scParkParallelExitShadowScript },
  "mistake-no-room": { kind: "mistake", script: scParkParallelExitMistakeNoRoomScript },
  "mistake-no-look": { kind: "mistake", script: scParkParallelExitMistakeNoLookScript },
};

/**
 * Record one of the three drives against a loaded lot-par-v1 document —
 * parked-car obstacles armed from the district's own occupancy at
 * collisionMinKmh 0 (the parking threshold, doc 76 §0). Deterministic.
 */
export function recordScParkParallelExitDrive(
  districtRaw: unknown,
  name: ScParkParallelExitTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_PARALLEL_EXIT_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
