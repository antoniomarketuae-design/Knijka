/**
 * sc-park-perp-forward — authored drives (lane 15, the doc 86 D11 parking
 * deepening): ONE correct shadow + TWO mistake demos for „Паркиране напред в
 * гнездото" on the committed lot-perp-v1 district (map REUSED, untouched).
 *
 * WHY A FORWARD ENTRY DESERVES ITS OWN DRILL. The P0 (sc-park-perp-rev) and
 * its other half (sc-park-bay-exit-rev) between them teach reversing IN and
 * reversing OUT. Nobody was teaching the entry nine drivers out of ten
 * actually make — nose first — or the price it charges, which is paid at the
 * exit, minutes later, with a blind reverse into an aisle where people walk.
 * So this file's two demos are the two halves of that price:
 *   1. „Подранил завой" — the swing started before the aisle gave it room and
 *      the front-right quarter took the neighbour's corner (COLLISION,
 *      vehicle, at creep speed — the geometric gate, collisionMinKmh 0);
 *   2. „Чиста маневра, сляп изход" — the SAME clean forward park the shadow
 *      makes, followed by the exit it buys: reverse out without a look and the
 *      person walking down the aisle is behind the car (COLLISION, pedestrian,
 *      the authored-consequence `collision` step the P0's own demo uses).
 * Demo 2 is the argument for reverse parking made in world space instead of in
 * a paragraph, and it grades through the real reducer either way.
 *
 * Geometry pinned to content/world/lot-perp-v1.json (lessons pin district
 * coordinates by value — the demo.ts pattern):
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   bay row on the EAST side; target bay lot-bay-3 centre (5.03, 0), axis
 *   east-west (headingDeg 90); occupied neighbours at y = ∓2.7 / ∓5.4;
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * Rule-engine safety envelope (why the numbers are what they are — the P0's
 * header note applies unchanged): the lane detectors arm at |laneOffset| >
 * 3.25 m ⇔ x < 0.81 on this road while moving > 5 km/h in a FORWARD gear, and
 * this whole drill is forward. The setup therefore stops at x = 0.9 (offset
 * 3.16) and the swing only ever increases x, so no lane episode can arm at any
 * point of the correct drive. The early-turn demo does its wrong turn from
 * x = 3.2 — inside the lane — so the ONLY thing it demonstrates is the clip.
 */

import type { DriveScript, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

export const SC_PARK_PERP_FORWARD_ID = "sc-park-perp-forward";

/** Northbound drawn lane center on the lot roads (2 lanes × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;
/** Target bay centre (lot-bay-3 of lot-perp-v1). */
const BAY_X = 5.03;
/** The wide setup line: as far left as the lane detectors allow (see header). */
const X_SETUP = 0.9;
/** Where the correct swing begins — one turning radius short of the bay axis. */
const TURN_IN_Y = -4.0;
/** Correct swing radius (car-centre path): the aisle's full width, used. */
const ARC_R = 4.0;

/**
 * Quarter arc, car-centre path: enters at (x0, y0) heading NORTH and leaves at
 * (x0 + r, y0 + r) heading EAST — the forward right-hand swing into a bay whose
 * axis is east-west. Mirror of scParkPerpRev's `reverseArc`, driven forward.
 */
function forwardArc(x0: number, y0: number, r: number): Array<[number, number]> {
  const cx = x0 + r;
  const cy = y0;
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k += 1) {
    const phi = Math.PI - (k / 8) * (Math.PI / 2);
    out.push([cx + r * Math.cos(phi), cy + r * Math.sin(phi)]);
  }
  return out;
}

/**
 * Approach: right-lane cruise up the approach road. Unlike the P0's line this
 * one STARTS in the lane (X_LANE) rather than on the centreline — the template
 * authors an explicit start pose instead of `lot-spawn-approach` precisely so
 * the drive never begins in violation (doc 86 T2/S2; see the template's
 * `start` comment).
 */
const APPROACH: Array<[number, number]> = [
  [X_LANE, -105],
  [X_LANE, -92],
  [X_LANE, -24],
];

/** Ease left across the aisle to open the right-hand swing (forward, ≤ 10 km/h;
 *  x bottoms out at X_SETUP = 0.9 ⇒ |laneOffset| 3.16 < 3.25). */
const VEER: Array<[number, number]> = [
  [X_LANE, -24],
  [X_LANE, -18],
  [2.4, -13],
  [X_SETUP, -9.5],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkPerpForwardShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      {
        kind: "annotation",
        textBg:
          "Мястото е вдясно. За да влезеш НАПРЕД, първо си вземи място отляво — от дясната лента завоят просто не се побира.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: VEER, targetKmh: 10 },
      {
        kind: "annotation",
        textBg: "Намали до пешеходна скорост и изчакай ъгъла на мястото да дойде срещу бронята ти.",
      },
      { kind: "drive", points: [[X_SETUP, -9.5], [X_SETUP, TURN_IN_Y]], targetKmh: 6 },
      { kind: "glance", mirror: "right" },
      {
        kind: "annotation",
        textBg: "Сега завой надясно в една дъга — следи ДЯСНОТО огледало: там минава ъгълът на съседа.",
      },
      {
        // One forward quarter-arc onto the bay axis, then straight to centre.
        kind: "drive",
        points: [
          [X_SETUP, TURN_IN_Y],
          ...forwardArc(X_SETUP, TURN_IN_Y, ARC_R),
          [BAY_X, 0],
        ],
        targetKmh: 5,
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // holdSec 1.5 + margin — the parkInBay contract completes at rest.
      { kind: "pause", sec: 2.2, brake: true },
      { kind: "indicator", setting: "off" },
      {
        kind: "annotation",
        textBg:
          "Готово — и запомни цената: сега си с нос навътре и излизането ще е на сляпо между тези две коли.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подранил завой" (turns in from the lane → clips the corner)
// ---------------------------------------------------------------------------

export function scParkPerpForwardMistakeEarlyTurnScript(): DriveScript {
  /** Half the room the correct setup takes: 0.6 m right of the X_SETUP line,
   *  which is still the last lateral metre that clears the parked row (the
   *  bay rects start at x = 2.78 and the hero half-width is 0.85). */
  const xEarly = 1.5;
  /** …and the swing starts 2.4 m — more than half a car — too soon. */
  const yEarly = -6.4;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката, която прави всеки бързащ: малко място отляво и волан преди ъгъла на мястото.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [
          [X_LANE, -24],
          [X_LANE, -18],
          [2.6, -13],
          [xEarly, yEarly],
        ],
        targetKmh: 8,
      },
      { kind: "pause", sec: 0.8, brake: true },
      {
        kind: "annotation",
        textBg: "Оттук дъгата свършва между двете коли, не в мястото — а предният десен ъгъл вече върви към съседа…",
      },
      {
        // The same radius as the correct swing, begun 2.4 m early: it lands on
        // the neighbour's bay instead of the free one, and the front-right
        // quarter reaches the parked car mid-arc, at creep speed.
        kind: "drive",
        points: [[xEarly, yEarly], ...forwardArc(xEarly, yEarly, ARC_R)],
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Закачи съседа с предната дясна четвърт. Дъгата е вярна — моментът не: завърташ, когато бронята ти е срещу ъгъла на СВОБОДНОТО място, и с цялата алея зад гърба си.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Чиста маневра, сляп изход" (the price of nose-in parking)
// ---------------------------------------------------------------------------

export function scParkPerpForwardMistakeBlindExitScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Влизането е перфектно. Гледай какво купува то — за после.",
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: APPROACH, targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: VEER, targetKmh: 10 },
      { kind: "drive", points: [[X_SETUP, -9.5], [X_SETUP, TURN_IN_Y]], targetKmh: 6 },
      {
        kind: "drive",
        points: [
          [X_SETUP, TURN_IN_Y],
          ...forwardArc(X_SETUP, TURN_IN_Y, ARC_R),
          [BAY_X, 0],
        ],
        targetKmh: 5,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.6, brake: true },
      {
        kind: "annotation",
        textBg:
          "Минути по-късно: време е да си тръгнеш. Между двете съседни коли от седалката се вижда точно нищо.",
      },
      {
        // The exit this entry bought: straight back out of the bay, blind.
        kind: "drive",
        points: [
          [BAY_X, 0],
          [3.0, 0],
        ],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence: the person walking the aisle behind the car.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Ето я цената на влизането напред: излизаш назад в алея, която не виждаш. Затова изпитът учи обратното паркиране — то мести сляпата минута в началото.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkPerpForwardTraceName =
  | "shadow-correct"
  | "mistake-early-turn"
  | "mistake-blind-exit";

const SCRIPTS: Record<
  ScParkPerpForwardTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scParkPerpForwardShadowScript },
  "mistake-early-turn": { kind: "mistake", script: scParkPerpForwardMistakeEarlyTurnScript },
  "mistake-blind-exit": { kind: "mistake", script: scParkPerpForwardMistakeBlindExitScript },
};

/**
 * Record one of the three drives against a loaded lot-perp-v1 document —
 * parked-car obstacles armed from the district's own occupancy at
 * collisionMinKmh 0 (the parking threshold, doc 76 §0). Deterministic.
 */
export function recordScParkPerpForwardDrive(
  districtRaw: unknown,
  name: ScParkPerpForwardTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_PERP_FORWARD_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
