/**
 * PARKING-DEPTH authored drives — the ten new „how to park" drills
 * (templates-parking3.ts), one shadow + two mistake demos each, on the ten
 * committed lot-* districts this wave generated.
 *
 * WHY ONE FILE. Every drill here is a low-speed manoeuvre on a
 * gen_parking_lot.mjs district, so they share exactly four pieces of geometry:
 * the approach up the 2-lane residential feeder, the quarter-circle reverse
 * swing into a perpendicular bay, the reverse S of a kerb-side parallel park,
 * and the shallow forward S of a nose-in entry. Ten copies of those four
 * functions is how the four earlier parking scripts drifted apart; here they
 * are ONE parametric kit and each drill is its own short story on top of it.
 *
 * WHAT MAKES THE TEN DIFFERENT — and it is never the district's colour:
 *   sc-park-gap-short   6.5 m of kerb (1.6 car lengths) — the S only just fits
 *   sc-park-gap-long   12.7 m of kerb — the reverse is unnecessary, nose in
 *   sc-park-van         a VAN on one flank: less room, and no sight-line
 *   sc-park-45-rev      a 135° echelon mouth — nose-in is impossible
 *   sc-park-left        the row on the WEST kerb — every reference mirrored
 *   sc-park-zebra       a чл. 98 span with a real В27 post and painted zebra
 *   sc-park-wall        the END bay, closed by a garage wall
 *   sc-park-night       an unlit row; the lamps are the whole first duty
 *   sc-park-double      two rows, a 5.56 m corridor — no room to swing wide
 *   sc-park-judge       two free slots, 4.3 m and 9.5 m — one is not a slot
 *
 * SAFETY ENVELOPE the paths respect (why the numbers are what they are):
 *  - the APPROACH edge is `residential` and painted, so forward driving there
 *    stays in the curb lane at x = +4.06; the AISLE is `service`, which
 *    paintsCentreLine/paintsLaneLines refuse, so the lane detectors cannot arm
 *    on it at all — that is what lets sc-park-left legally set up at x = −0.9;
 *  - reverse gear is exempt from every lane/wrong-way detector by A12 law;
 *  - SCRIPT_DECEL (4.6 m/s²) is under the harsh-braking threshold, so no stop
 *    in this file bills HARSH_BRAKING_NO_CAUSE;
 *  - collisionMinKmh is 0 for every drive: in a parking lot a 2 km/h bumper
 *    touch IS the graded mistake (doc 76 §0).
 *
 * The committed traces under content/traces/<drill-id> ARE the recordings of
 * these scripts; the gate is
 * traces/__tests__/sc-park-depth-traces.test.ts (RECORD_TRACES=1 re-records).
 */

import type {
  DriveScript,
  DriveStep,
  ObstacleRect2D,
  RecordedDrive,
  RecordScriptedDriveOptions,
} from "./recorder";
import { recordScriptedDrive } from "./recorder";
import { lotObstacleRects } from "./scParkPerpRev";

// ---------------------------------------------------------------------------
// Shared geometry kit
// ---------------------------------------------------------------------------

/** Northbound drawn curb-lane centre on every lot road (2 × 3.25 m × 2.5 / 2). */
const X_LANE = 4.0625;

/** Approach polyline: the spawn pose up the feeder to the aisle mouth. */
function approach(spawnY: number): Array<[number, number]> {
  return [
    [X_LANE, spawnY],
    [X_LANE, -24],
  ];
}

/**
 * Ease off the curb lane onto the manoeuvring line `x` — the lateral move
 * happens entirely NORTH of the gate (y = −18), i.e. on the unpainted `service`
 * aisle, never on the painted feeder where the lane detectors live.
 *
 * The shift length adapts to how much aisle is left before `endY`: a fixed
 * 12 m ease (the shape the four earlier parking scripts hardcode) turns into a
 * polyline that runs NORTH past its own target and then doubles back when the
 * target sits below y = −6, and the recorder happily drives that U-turn.
 */
function easeTo(x: number, endY: number): Array<[number, number]> {
  const gateY = -18;
  const shift = Math.min(6, Math.max(1.5, (endY - gateY) / 2));
  return [
    [X_LANE, -24],
    [X_LANE, gateY],
    [(X_LANE + x) / 2, gateY + shift],
    [x, gateY + shift * 2],
    [x, endY],
  ];
}

/**
 * Quarter-circle REVERSE swing into a PERPENDICULAR bay (the P0 shape,
 * parameterised by kerb side). Starts at (x0, y0) tangent-south (the car faces
 * north, reversing), ends `r` south and `r` toward the kerb, tangent along the
 * bay axis. `side` +1 = bays on the east, −1 = bays on the west.
 */
function perpReverseArc(
  x0: number,
  y0: number,
  r: number,
  side: 1 | -1,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 8; k++) {
    const th = (k / 8) * (Math.PI / 2);
    out.push([x0 + side * r * (1 - Math.cos(th)), y0 - r * Math.sin(th)]);
  }
  return out;
}

/**
 * The reverse S of a kerb-side parallel park: two mirrored arcs of radius `r`
 * that shift the car `targetX − startX` toward the kerb and `2r·sin θ` down the
 * street, ending tangent-south on the bay line. θ is DERIVED from the lateral
 * shift (cos θ = 1 − L / 2r), which is what lets one function serve a 6.5 m
 * slot and a 9.5 m one without either drifting from the taught reference points.
 */
function reverseS(
  startX: number,
  startY: number,
  targetX: number,
  r: number,
): { points: Array<[number, number]>; midIndex: number; endY: number } {
  const L = targetX - startX;
  const entry = Math.acos(Math.max(-1, Math.min(1, 1 - L / (2 * r))));
  const steps = 8;
  const arcA: Array<[number, number]> = [];
  for (let k = 1; k <= steps; k++) {
    const th = (k / steps) * entry;
    arcA.push([startX + r * (1 - Math.cos(th)), startY - r * Math.sin(th)]);
  }
  const [mx, my] = arcA[arcA.length - 1];
  const first: Array<[number, number]> = [[startX, startY], ...arcA.slice(0, steps - 1)];
  const arcB: Array<[number, number]> = [];
  for (let k = steps - 1; k >= 0; k--) {
    const [px, py] = first[k];
    arcB.push([2 * mx - px, 2 * my - py]);
  }
  const points = [...arcA, ...arcB];
  return { points, midIndex: steps - 1, endY: startY - 2 * r * Math.sin(entry) };
}

/**
 * The shallow FORWARD S of a nose-in kerb entry: the mirror of `reverseS`,
 * travelling north. Long radius on purpose — a nose-in entry is only legal
 * where the slot is long enough for a gentle arc.
 */
function forwardS(
  startX: number,
  startY: number,
  targetX: number,
  r: number,
): { points: Array<[number, number]>; endY: number } {
  const L = targetX - startX;
  const entry = Math.acos(Math.max(-1, Math.min(1, 1 - L / (2 * r))));
  const steps = 8;
  const arcA: Array<[number, number]> = [];
  for (let k = 1; k <= steps; k++) {
    const th = (k / steps) * entry;
    arcA.push([startX + r * (1 - Math.cos(th)), startY + r * Math.sin(th)]);
  }
  const [mx, my] = arcA[arcA.length - 1];
  const first: Array<[number, number]> = [[startX, startY], ...arcA.slice(0, steps - 1)];
  const arcB: Array<[number, number]> = [];
  for (let k = steps - 1; k >= 0; k--) {
    const [px, py] = first[k];
    arcB.push([2 * mx - px, 2 * my - py]);
  }
  return { points: [...arcA, ...arcB], endY: startY + 2 * r * Math.sin(entry) };
}

/**
 * The 45° REVERSE swing into a 135° echelon bay: starts tangent-south (car
 * facing north) and ends on the bay's own axis, the car facing back up the
 * aisle at 315°. That final heading is the whole point of reverse-angle
 * parking — you leave the bay nose-first, looking where you are going.
 */
function echelonReverseArc(x0: number, y0: number, r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let k = 1; k <= 6; k++) {
    const phi = (k / 6) * (Math.PI / 4);
    out.push([x0 + r * (1 - Math.cos(phi)), y0 - r * Math.sin(phi)]);
  }
  return out;
}

/** The three glances every reverse manoeuvre owes before the gear goes in. */
const LOOK_BEFORE_REVERSE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "glance", mirror: "rear" },
];

/** The settle-and-hold that completes a parkInBay contract (holdSec 1.5). */
const SETTLE: DriveStep[] = [
  { kind: "glance", mirror: "left" },
  { kind: "glance", mirror: "right" },
  { kind: "pause", sec: 2.2, brake: true },
  { kind: "indicator", setting: "off" },
];

// ---------------------------------------------------------------------------
// Extra obstacle bodies (the two drills whose neighbour is not a parked car)
// ---------------------------------------------------------------------------

/**
 * The kargo_v van standing in lot-van-v1's bay 2. The bay is left FREE in the
 * district on purpose so the scene does not also draw a deterministic civilian
 * car there; this rect is the headless twin of the held-scenery body
 * (scene/scenarioSceneryProps.ts pins itself against these numbers).
 *
 * A van is wider AND ~0.45 m longer than the fleet compacts, so it protrudes
 * further into the aisle than the parked cars beside it — which is exactly the
 * sight-line the drill teaches around.
 */
export const PARK_DEPTH_VAN: ObstacleRect2D = {
  x: 5.03,
  y: -2.7,
  headingDeg: 90,
  halfWidthM: 1.0,
  halfLengthM: 2.65,
  withWhat: "vehicle",
};

/**
 * lot-wall-v1's garage end wall: 6 m of masonry across the north end of the
 * row, 1.65 m past the last bay's line. `staticObject` — the untagged
 * classification a live wall collider also grades as.
 */
export const PARK_DEPTH_WALL: ObstacleRect2D = {
  x: 5.03,
  y: 8.6,
  headingDeg: 90,
  halfWidthM: 0.2,
  halfLengthM: 3.0,
  withWhat: "staticObject",
};

// ---------------------------------------------------------------------------
// 1 — sc-park-gap-short (lot-gap-short-v1): 7.3 m of kerb
// ---------------------------------------------------------------------------
// Cars at y = ∓5.9 leave clear space y ∈ (−3.65, 3.65). Setup 0.83 m off the
// lead car's flank (x 3.7) with the rear bumpers level (y 5.67); the S shifts
// 2.58 m across and 5.89 m down, ending 0.95 m short of the rear car, then the
// three-point finish pulls forward onto the line. Both margins are the drill:
// there is exactly one setup that works and no room to correct from a wrong one.

const GS_BAY_X = 6.28;
const GS_SETUP_X = 3.7;
const GS_SETUP_Y = 5.67;
const GS_S_TOP = 5.2;

function gsShadow(): DriveScript {
  const s = reverseS(GS_SETUP_X, GS_S_TOP, GS_BAY_X, 4.0);
  const mid = s.points[s.midIndex];
  return {
    steps: [
      { kind: "annotation", textBg: "Мястото между двете коли е късо — малко над седем метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GS_SETUP_X, GS_SETUP_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Ориентир 1: успоредно на предната кола, на половин метър — задна броня срещу задна броня.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "annotation",
        textBg: "В късо място ъгълът трябва да е точен от първия път — докрай надясно.",
      },
      {
        kind: "drive",
        points: [[GS_SETUP_X, GS_SETUP_Y], [GS_SETUP_X, GS_S_TOP], ...s.points.slice(0, s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Ориентир 2: под ~44°. Сега докрай наляво и назад до дъното." },
      {
        kind: "drive",
        points: [mid, ...s.points.slice(s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "annotation", textBg: "И леко напред, докато застанеш по средата." },
      { kind: "drive", points: [[GS_BAY_X, s.endY], [GS_BAY_X, 0]], targetKmh: 2.5 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, успоредно, с по метър пред и зад теб." },
    ],
  };
}

function gsMistakeShallow(): DriveScript {
  // Half the entry angle: the S never reaches the kerb, and the driver keeps
  // backing at that angle until the tail meets the rear car.
  const s = reverseS(GS_SETUP_X, GS_S_TOP, GS_SETUP_X + 1.2, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: воланът не отива докрай и ъгълът остава плитък." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GS_SETUP_X, GS_SETUP_Y), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[GS_SETUP_X, GS_SETUP_Y], [GS_SETUP_X, GS_S_TOP], ...s.points],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "annotation", textBg: "Колата стои далеч от бордюра — и вместо да излезе, шофьорът продължава назад…" },
      {
        kind: "drive",
        points: [[GS_SETUP_X + 1.2, s.endY], [5.7, -1.8], [6.2, -3.6]],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата удари задната кола. В късо място плиткият ъгъл няма поправка — излез напред и започни отначало с пълен волан.",
      },
    ],
  };
}

function gsMistakeForwardHit(): DriveScript {
  // The other end of the same short slot: the driver gets in crooked (a
  // shallower S that stops a metre off the kerb, well clear of the rear car)
  // and then, while straightening FORWARD, drives the nose into the car in
  // front.
  const s = reverseS(GS_SETUP_X, GS_S_TOP, 5.2, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: изправянето напред в късо място, без да се брои разстоянието отпред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GS_SETUP_X, GS_SETUP_Y), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[GS_SETUP_X, GS_SETUP_Y], [GS_SETUP_X, GS_S_TOP], ...s.points],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "annotation", textBg: "Влезе накриво и далеч от бордюра — и подкарва напред, за да се изправи…" },
      {
        kind: "drive",
        points: [[5.2, s.endY], [5.8, 2.2], [6.28, 3.8]],
        targetKmh: 2.5,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата удари предната кола. В късо място изправянето става на сантиметри: гледай предната броня, не волана.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 2 — sc-park-gap-long (lot-gap-long-v1): 12.7 m of kerb, nose-in
// ---------------------------------------------------------------------------

// The assess halt IS the turn-in pose: a separate "reposition" leg of a few
// decimetres is not a manoeuvre, it is a pivot — the recorder faithfully turns
// the car 90° to drive 0.3 m sideways, and the flank meets the parked car.
const GL_BAY_X = 6.28;
const GL_ASSESS_X = 3.5;
const GL_ASSESS_Y = -8.37;

function glShadow(): DriveScript {
  const s = forwardS(GL_ASSESS_X, GL_ASSESS_Y, GL_BAY_X, 7.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Това място е дълго — над дванайсет метра, три пъти колата." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GL_ASSESS_X, GL_ASSESS_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Задача 1: спри срещу мястото и го премери — над две дължини на колата, значи се влиза напред.",
      },
      { kind: "pause", sec: 1.4, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "annotation", textBg: "Плавна дъга надясно и вътре — без заден ход." },
      { kind: "drive", points: s.points, targetKmh: 6 },
      { kind: "annotation", textBg: "Изправи волана и се прибери плътно до бордюра." },
      { kind: "drive", points: [[GL_BAY_X, s.endY], [GL_BAY_X, 0]], targetKmh: 4 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: успоредно на бордюра, по посоката на движението." },
    ],
  };
}

function glMistakeOverrun(): DriveScript {
  // The long-slot failure: the driver turns in late and keeps going, so the
  // nose ends inside the car in front instead of in the middle of the space.
  const s = forwardS(3.5, -2.0, GL_BAY_X, 7.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завоят тръгва късно и колата продължава напред в мястото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(3.5, -2.0), targetKmh: 9 },
      { kind: "drive", points: s.points, targetKmh: 6, stopAtEnd: false },
      { kind: "drive", points: [[GL_BAY_X, s.endY], [GL_BAY_X, 8.0]], targetKmh: 4 },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата влезе в колата отпред. Дългото място не е безкрайно: влизаш срещу СРЕДАТА му, не срещу предния му край.",
      },
    ],
  };
}

function glMistakeBlindReverse(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: излишен заден ход в място, в което се влиза напред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(4.0, 6.0), targetKmh: 9 },
      { kind: "pause", sec: 0.8, brake: true },
      { kind: "annotation", textBg: "Задна предавка веднага — без огледала, без рамо." },
      {
        kind: "drive",
        points: [[4.0, 6.0], [4.0, 3.6]],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът зад колата остана невидим. В дълго място заден ход изобщо не е нужен — а щом го правиш, чл. 40 иска да си сигурен, че отзад е чисто.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 3 — sc-park-van (lot-van-v1): the wide neighbour
// ---------------------------------------------------------------------------

const VN_BAY_X = 5.03;
const VN_SETUP_X = 0.9;
const VN_SETUP_Y = 6.3;

function vnShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободното гнездо е точно до бус — той краде и място, и видимост." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(VN_SETUP_X, VN_SETUP_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Подмини гнездото и спри: задната броня подминава съседната кола, метър и половина странично.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "annotation",
        textBg: "Влизай към страната на буса по-предпазливо — той е по-широк от очертанията си.",
      },
      {
        kind: "drive",
        points: [[VN_SETUP_X, VN_SETUP_Y], [VN_SETUP_X, 4.0], ...perpReverseArc(VN_SETUP_X, 4.0, 4.0, 1)],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана и се центрирай ПО-ДАЛЕЧ от буса." },
      { kind: "drive", points: [[4.9, 0], [VN_BAY_X, 0]], targetKmh: 2.5, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, с работещо разстояние до буса." },
    ],
  };
}

function vnMistakeEarly(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завоят тръгва, преди колата да е подминала гнездото." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(VN_SETUP_X, 3.8), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[VN_SETUP_X, 3.8], [VN_SETUP_X, 1.5], ...perpReverseArc(VN_SETUP_X, 1.5, 4.0, 1)],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "drive", points: [[4.9, -2.5], [VN_BAY_X, -2.5]], targetKmh: 2, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в буса, а не в гнездото. Ориентирът е задната броня на съседа: докато не си я подминал, воланът стои прав.",
      },
    ],
  };
}

function vnMistakeBlind(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: заден ход покрай бус, без нито един поглед назад." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(VN_SETUP_X, VN_SETUP_Y), targetKmh: 9 },
      { kind: "pause", sec: 0.8, brake: true },
      {
        kind: "drive",
        points: [[VN_SETUP_X, VN_SETUP_Y], [VN_SETUP_X, 4.2]],
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходец, минаващ иззад буса, остана скрит до удара. Точно това прави бусът опасен: огледалата ти свършват там, където започва той.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 4 — sc-park-45-rev (lot-45rev-v1): reverse angle parking
// ---------------------------------------------------------------------------

const RV_SETUP_X = 0.9;
const RV_SETUP_Y = 6.0;
const RV_R = 5.0;

function rvShadow(): DriveScript {
  const arc = echelonReverseArc(RV_SETUP_X, RV_SETUP_Y, RV_R);
  return {
    steps: [
      { kind: "annotation", textBg: "Устата на това косо място гледа назад — напред просто няма как да се влезе." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(RV_SETUP_X, RV_SETUP_Y), targetKmh: 9 },
      { kind: "annotation", textBg: "Подмини мястото и спри успоредно на алеята — оттук започва завъртането." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "На заден ход, волан надясно — само 45°, не докрай." },
      {
        kind: "drive",
        points: [[RV_SETUP_X, RV_SETUP_Y], ...arc],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана и влез право по линиите до дъното." },
      {
        kind: "drive",
        points: [arc[arc.length - 1], [4.8, 0]],
        targetKmh: 3,
        reverse: true,
      },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово — и предницата гледа към алеята: излизането ще е с лице напред." },
    ],
  };
}

function rvMistakeNoseIn(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: шофьорът опитва да влезе напред, както в място на 45° по посоката." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      // The echelon cars reach x ≈ 2.57 at their aisle corner, so the run-up
      // line has to stay west of 1.2 or the demo grades a graze it never meant.
      { kind: "drive", points: easeTo(1.0, -6.0), targetKmh: 8 },
      { kind: "annotation", textBg: "Завива надясно към устата… която е от другата страна." },
      {
        kind: "drive",
        points: [[1.0, -6.0], [1.8, -4.6], [3.2, -3.0], [4.6, -1.6]],
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в съседната кола. Косо място с обратна уста се взима САМО на заден ход — иначе колата застава напречно на реда.",
      },
    ],
  };
}

function rvMistakeShallow(): DriveScript {
  const arc = echelonReverseArc(RV_SETUP_X, RV_SETUP_Y, RV_R).slice(0, 3);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завъртането спира по средата и колата влиза под грешен ъгъл." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(RV_SETUP_X, RV_SETUP_Y), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[RV_SETUP_X, RV_SETUP_Y], ...arc],
        targetKmh: 3.5,
        reverse: true,
      },
      {
        kind: "drive",
        points: [arc[arc.length - 1], [3.0, 0.6], [4.4, -1.8]],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Под този ъгъл колата не влиза в мястото, а в съседа. 45° са 45°: довърти завъртането, преди да тръгнеш назад по линиите.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 5 — sc-park-left (lot-left-v1): the row on the west kerb
// ---------------------------------------------------------------------------

const LF_BAY_X = -5.03;
const LF_SETUP_X = -0.9;
const LF_SETUP_Y = 6.3;

function lfShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободното гнездо е ОТЛЯВО — цялата маневра е огледална." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      {
        kind: "annotation",
        textBg: "Преди да пресечеш алеята: ляво огледало, после поглед в двете посоки — минаваш през чужд път.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: easeTo(LF_SETUP_X, LF_SETUP_Y), targetKmh: 9 },
      { kind: "annotation", textBg: "Подмини гнездото и спри — ориентирите са същите, но в лявото огледало." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "На заден ход, волан ДОКРАЙ НАЛЯВО — обратното на познатото." },
      {
        kind: "drive",
        points: [[LF_SETUP_X, LF_SETUP_Y], [LF_SETUP_X, 4.0], ...perpReverseArc(LF_SETUP_X, 4.0, 4.0, -1)],
        targetKmh: 4,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана и се центрирай в очертанията." },
      { kind: "drive", points: [[-4.9, 0], [LF_BAY_X, 0]], targetKmh: 2.5, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: същата маневра, огледално — и водещото огледало е лявото." },
    ],
  };
}

function lfMistakeMirrored(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: ръцете правят заучената дясна маневра, а мястото е отляво." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: easeTo(LF_SETUP_X, 3.6), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[LF_SETUP_X, 3.6], [LF_SETUP_X, 1.4], ...perpReverseArc(LF_SETUP_X, 1.4, 4.0, -1)],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "drive", points: [[-4.9, -2.6], [LF_BAY_X, -2.6]], targetKmh: 2, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Завъртането тръгна твърде рано и задницата влезе в съседната кола. Огледалната маневра иска СЪЩИЯ ориентир — но прочетен в другото огледало.",
      },
    ],
  };
}

function lfMistakeCross(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: пресичане на алеята без поглед — отляво идва кола." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      {
        kind: "drive",
        points: [[X_LANE, -24], [X_LANE, -18], [1.2, -12], [LF_SETUP_X, -8]],
        targetKmh: 12,
        stopAtEnd: false,
      },
      { kind: "collision", withWhat: "vehicle" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пресичането на алеята е маневра като всяка друга: огледало, мигач, поглед — и чак тогава волана. Мястото отляво струва един допълнителен поглед.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6 — sc-park-zebra (lot-zebra-v1): чл. 98 at a marked crossing
// ---------------------------------------------------------------------------

const ZB_BAY_X = 6.28;
const ZB_BAY_Y = 11.75;
const ZB_SETUP_X = 4.0;
const ZB_SETUP_Y = 18.0;
const ZB_S_TOP = 16.9;

function zbShadow(): DriveScript {
  const s = reverseS(ZB_SETUP_X, ZB_S_TOP, ZB_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Пред пътеката има свободни места — но законът ги затваря: 5 метра преди и след нея." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: easeTo(ZB_SETUP_X, -12), targetKmh: 10 },
      { kind: "annotation", textBg: "Знакът В27 стои в началото на забраната. Минаваме — не спираме в зоната." },
      { kind: "drive", points: [[ZB_SETUP_X, -12], [ZB_SETUP_X, 10]], targetKmh: 9, stopAtEnd: false },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[ZB_SETUP_X, 10], [ZB_SETUP_X, ZB_SETUP_Y]], targetKmh: 8 },
      {
        kind: "annotation",
        textBg: "Първото разрешено място е чак тук. Ориентир 1: успоредно на предната кола.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[ZB_SETUP_X, ZB_SETUP_Y], [ZB_SETUP_X, ZB_S_TOP], ...s.points.slice(0, s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [s.points[s.midIndex], ...s.points.slice(s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "drive", points: [[ZB_BAY_X, s.endY], [ZB_BAY_X, ZB_BAY_Y]], targetKmh: 2.5 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: паркирано законно, на повече от пет метра след пътеката." },
    ],
  };
}

/**
 * The ban is graded on the SECOND slot, not the first, and that is an engine
 * fact worth stating: rules/engine.ts exempts a rest inside a ban span while
 * the crossing episode is live (`s.crossing === null` is a precondition of
 * `illegalBanRest`) — a car stopped SHORT of a zebra can always be yielding to
 * someone on it, and convicting that would be a false positive. So the drill's
 * graded demo is the slot five metres PAST the crossing, which no such reading
 * excuses; the slot before it is demonstrated through its consequence instead
 * (the second demo below).
 */
function zbMistakeAfterZebra(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „минах пътеката, значи може“ — забраната важи и след нея." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(4.0, -1.0), targetKmh: 9 },
      { kind: "drive", points: [[4.0, -1.0], [5.3, 1.6], [6.28, 3.0], [6.28, 3.75]], targetKmh: 5 },
      { kind: "pause", sec: 8.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Мястото е свободно, но е на по-малко от пет метра СЛЕД пътеката. Чл. 98 брои и в двете посоки: спряла тук, колата пак крие тръгващия пешеходец. Първото разрешено място е следващото.",
      },
    ],
  };
}

function zbMistakeHiddenPed(): DriveScript {
  // Why the five metres BEFORE the crossing exist, shown instead of asserted:
  // the car parks in the slot right in front of the zebra, and the pedestrian
  // that its own body hid walks out as it pulls away.
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: паркиране непосредствено ПРЕД пътеката — „само пет метра, кой ги брои“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(4.0, -10.0), targetKmh: 10 },
      { kind: "drive", points: [[4.0, -10.0], [5.3, -7.4], [6.28, -6.0], [6.28, -5.25]], targetKmh: 5 },
      { kind: "pause", sec: 3.0, brake: true },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "И когато тръгва отново, пешеходецът излиза точно иззад собствената му кола…" },
      { kind: "drive", points: [[6.28, -5.25], [5.6, -3.4], [4.6, -1.6]], targetKmh: 6, stopAtEnd: false },
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Ето за какво са петте метра: кола, спряла плътно преди пътеката, я закрива — и за теб, и за всички зад теб. Забраната не пази мястото, пази човека на него.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 7 — sc-park-wall (lot-wall-v1): the end bay against a garage wall
// ---------------------------------------------------------------------------

const WL_BAY_X = 5.03;
const WL_BAY_Y = 5.4;
const WL_SETUP_X = 0.9;
const WL_SETUP_Y = 11.7;

function wlShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Свободно е само последното гнездо — а редът свършва в стена." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(WL_SETUP_X, WL_SETUP_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Спри РАНО и близо до средата на алеята: стената не оставя място за широк замах.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[WL_SETUP_X, WL_SETUP_Y], [WL_SETUP_X, 9.4], ...perpReverseArc(WL_SETUP_X, 9.4, 4.0, 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Изправи волана — и следи разстоянието до стената в дясното огледало." },
      { kind: "drive", points: [[4.9, WL_BAY_Y], [WL_BAY_X, WL_BAY_Y]], targetKmh: 2.5, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, без нито един сантиметър, взет от стената." },
    ],
  };
}

function wlMistakeIntoWall(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: шофьорът търси мястото с поглед вдясно и продължава напред." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(WL_SETUP_X, 3.0), targetKmh: 9 },
      { kind: "annotation", textBg: "Гнездото е подминато отдясно, а редът свършва — но стената не се гледа." },
      {
        kind: "drive",
        points: [[WL_SETUP_X, 3.0], [2.0, 5.0], [4.0, 7.0], [5.2, 8.8]],
        targetKmh: 6,
        stopAtEnd: false,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в стената в края на реда. Крайното гнездо иска решението да е взето РАНО: спираш успоредно на него, не покрай него.",
      },
    ],
  };
}

function wlMistakeClipNeighbour(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: завъртане твърде рано — стената кара шофьора да бърза." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(WL_SETUP_X, 9.2), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[WL_SETUP_X, 9.2], [WL_SETUP_X, 6.9], ...perpReverseArc(WL_SETUP_X, 6.9, 4.0, 1)],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "drive", points: [[4.9, 2.9], [WL_BAY_X, 2.9]], targetKmh: 2, reverse: true },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в съседната кола, не в гнездото. Стената не мести ориентира: той пак е задната броня на съседа.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 8 — sc-park-night (lot-night-v1): the unlit row
// ---------------------------------------------------------------------------

const NT_BAY_X = 6.28;
const NT_BAY_Y = 13.0;
const NT_SETUP_X = 4.0;
const NT_SETUP_Y = 19.3;
const NT_S_TOP = 18.0;

function ntShadow(): DriveScript {
  const s = reverseS(NT_SETUP_X, NT_S_TOP, NT_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Тъмно е и редът не е осветен — късите светлини са първото действие." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "annotation", textBg: "На фаровете четеш линиите — карай бавно покрай целия ред." },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(NT_SETUP_X, NT_SETUP_Y), targetKmh: 8 },
      { kind: "annotation", textBg: "Ориентир 1: успоредно на предната кола, задна броня срещу задна броня." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[NT_SETUP_X, NT_SETUP_Y], [NT_SETUP_X, NT_S_TOP], ...s.points.slice(0, s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [s.points[s.midIndex], ...s.points.slice(s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "drive", points: [[NT_BAY_X, s.endY], [NT_BAY_X, NT_BAY_Y]], targetKmh: 2.5 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията и видим — светлините остават до спирането на двигателя." },
    ],
  };
}

function ntMistakeNoLights(): DriveScript {
  const s = reverseS(NT_SETUP_X, NT_S_TOP, NT_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „паркингът е близо, няма да паля светлините“." },
      { kind: "headlights", setting: "off" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(NT_SETUP_X, NT_SETUP_Y), targetKmh: 8 },
      { kind: "pause", sec: 1.0, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[NT_SETUP_X, NT_SETUP_Y], [NT_SETUP_X, NT_S_TOP], ...s.points],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Без светлини колата е невидима за всички останали, а линиите — невидими за теб. Нощем фаровете не са за да виждаш: те са за да те виждат.",
      },
    ],
  };
}

function ntMistakeTooDeep(): DriveScript {
  const s = reverseS(NT_SETUP_X, NT_S_TOP, NT_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: назад „по усет“, защото в тъмното задната кола не се вижда." },
      { kind: "headlights", setting: "low" },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-75), targetKmh: 16 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(NT_SETUP_X, NT_SETUP_Y), targetKmh: 8 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[NT_SETUP_X, NT_SETUP_Y], [NT_SETUP_X, NT_S_TOP], ...s.points],
        targetKmh: 3.5,
        reverse: true,
      },
      {
        kind: "drive",
        points: [[NT_BAY_X, s.endY], [NT_BAY_X, 9.4]],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата опря в колата отзад. Нощем разстоянието се брои по огледала и по светлините на съседа — не по усет.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 9 — sc-park-double (lot-double-v1): two rows, a 5.56 m corridor
// ---------------------------------------------------------------------------

const DB_BAY_X = 5.03;
const DB_SETUP_X = 0.9;
const DB_SETUP_Y = 6.3;

function dbShadow(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Гнезда има от двете страни — свободният коридор между тях е под шест метра." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(DB_SETUP_X, DB_SETUP_Y), targetKmh: 8 },
      {
        kind: "annotation",
        textBg: "Дръж се точно по средата: и една педя вляво вече е чужд ред.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      { kind: "annotation", textBg: "Замахът се прави само назад — предницата няма къде да излезе." },
      {
        kind: "drive",
        points: [[DB_SETUP_X, DB_SETUP_Y], [DB_SETUP_X, 4.0], ...perpReverseArc(DB_SETUP_X, 4.0, 4.0, 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: [[4.9, 0], [DB_BAY_X, 0]], targetKmh: 2.5, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: в очертанията, без да си влизал в отсрещния ред." },
    ],
  };
}

function dbMistakeWideRunUp(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: широкият замах от отсрещната страна — навикът от празен паркинг." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      {
        kind: "drive",
        points: [[X_LANE, -24], [X_LANE, -18], [0.6, -12], [-2.3, -7.0], [-2.3, 0]],
        targetKmh: 8,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Колата закачи паркиран автомобил от отсрещния ред. В коридор между два реда широкият подход не съществува: маневрата тръгва от средата.",
      },
    ],
  };
}

function dbMistakeCorrectBack(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще се пооправя назад“ — в коридор, в който няма назад." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(DB_SETUP_X, 3.4), targetKmh: 8 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[DB_SETUP_X, 3.4], [DB_SETUP_X, 1.6], [2.2, 0.2]],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "annotation", textBg: "Ъгълът не става — и шофьорът тръгва назад през коридора, за да го поправи." },
      {
        kind: "drive",
        points: [[2.2, 0.2], [0.0, -0.6], [-2.4, -1.2]],
        targetKmh: 2.5,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Задницата влезе в отсрещния ред. Корекцията в тесен коридор се прави НАПРЕД, по дължината на алеята — не настрани.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 10 — sc-park-judge (lot-gap-judge-v1): 4.3 m is not a parking space
// ---------------------------------------------------------------------------

const GJ_BAY_X = 6.28;
const GJ_SHORT_Y = -4.0;
const GJ_GOOD_Y = 7.4;
const GJ_ASSESS_X = 4.0;
/** The parallel-park setup line: 0.83 m off the lead car's flank. The assess
 *  line (0.53 m) is close enough that the constant-radius S grazes on its way
 *  round — measured, not guessed. */
const GJ_SETUP_X = 3.7;
const GJ_SETUP_Y = 14.2;
const GJ_S_TOP = 12.5;

function gjShadow(): DriveScript {
  const s = reverseS(GJ_SETUP_X, GJ_S_TOP, GJ_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Две свободни места. Първото изглежда добре — и не е." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "glance", mirror: "right" },
      { kind: "drive", points: easeTo(GJ_ASSESS_X, GJ_SHORT_Y), targetKmh: 9 },
      {
        kind: "annotation",
        textBg: "Задача 1: спри срещу мястото и го премери — между бронята на едната и бронята на другата кола.",
      },
      { kind: "pause", sec: 1.6, brake: true },
      {
        kind: "annotation",
        textBg: "Около четири метра и малко. Колата е над четири — това не е място, а капан. Продължаваме.",
      },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: [[GJ_ASSESS_X, GJ_SHORT_Y], [GJ_SETUP_X, GJ_SETUP_Y]], targetKmh: 8 },
      { kind: "annotation", textBg: "Второто място е близо десет метра — тук се влиза спокойно." },
      { kind: "pause", sec: 1.2, brake: true },
      ...LOOK_BEFORE_REVERSE,
      {
        kind: "drive",
        points: [[GJ_SETUP_X, GJ_SETUP_Y], [GJ_SETUP_X, GJ_S_TOP], ...s.points.slice(0, s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [s.points[s.midIndex], ...s.points.slice(s.midIndex + 1)],
        targetKmh: 3.5,
        reverse: true,
      },
      { kind: "drive", points: [[GJ_BAY_X, s.endY], [GJ_BAY_X, GJ_GOOD_Y]], targetKmh: 2.5 },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово. Най-важната част от паркирането стана, преди воланът да е мръднал." },
    ],
  };
}

/**
 * The two ways a driver tries a 4.3 m slot, and the two cars he meets.
 *
 * The reverse demo is authored from the CORRECT setup — alongside the car in
 * front, 0.83 m off its flank, exactly as the shadow of every other parallel
 * drill starts. That is the honest form of this mistake: nothing about the
 * approach is wrong, the slot is. The S needs 5.9 m of travel and the slot has
 * 4.3 m of clear space, so the swing brushes the car IN FRONT on the way round
 * and buries the tail in the car BEHIND when it arrives — both contacts are in
 * the demo, and the copy names both.
 */
function gjMistakeTryShort(): DriveScript {
  const s = reverseS(GJ_SETUP_X, 1.2, GJ_BAY_X, 4.0);
  return {
    steps: [
      { kind: "annotation", textBg: "Грешка: „ще се сместя“ — маневра в място, по-късо от колата плюс метър." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GJ_SETUP_X, 2.6), targetKmh: 9 },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "rear" },
      {
        kind: "drive",
        points: [[GJ_SETUP_X, 2.6], [GJ_SETUP_X, 1.2], ...s.points],
        targetKmh: 3,
        reverse: true,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Изходната позиция беше вярна — мястото не беше. Завоят закачи колата отпред, а задницата стигна до колата отзад. Между двете брони има четири метра и трийсет, а колата е четири и четири.",
      },
    ],
  };
}

function gjMistakeShortForward(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Същото късо място, другият опит: влизане напред, „колкото да се вреже“." },
      { kind: "glance", mirror: "rear" },
      { kind: "drive", points: approach(-105), targetKmh: 18 },
      { kind: "indicator", setting: "right" },
      { kind: "drive", points: easeTo(GJ_SETUP_X, -5.0), targetKmh: 8 },
      { kind: "annotation", textBg: "Носът влиза под ъгъл в четириметровия процеп…" },
      {
        kind: "drive",
        points: [[GJ_SETUP_X, -5.0], [4.6, -4.4], [5.6, -4.0], [6.28, -3.8], [6.28, -2.2]],
        targetKmh: 4,
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предницата опря в колата отпред, а задницата стърчи в платното. В твърде късо място всяка поправка на единия край е удар в другия — затова решението се взима ПРЕДИ маневрата.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly
// ---------------------------------------------------------------------------

export type ParkDepthDrillId =
  | "sc-park-gap-short"
  | "sc-park-gap-long"
  | "sc-park-van"
  | "sc-park-45-rev"
  | "sc-park-left"
  | "sc-park-zebra"
  | "sc-park-wall"
  | "sc-park-night"
  | "sc-park-double"
  | "sc-park-judge";

interface DrillDef {
  districtId: string;
  isNight?: boolean;
  /** Bodies the district's own occupancy does not carry (van, wall). */
  extraObstacles?: readonly ObstacleRect2D[];
  traces: Record<string, { kind: "shadow" | "mistake"; script: () => DriveScript }>;
}

/** Every parking-depth drill, its map and its three authored drives. */
export const PARK_DEPTH_DRILLS: Record<ParkDepthDrillId, DrillDef> = {
  "sc-park-gap-short": {
    districtId: "lot-gap-short-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: gsShadow },
      "mistake-shallow-angle": { kind: "mistake", script: gsMistakeShallow },
      "mistake-forward-hit": { kind: "mistake", script: gsMistakeForwardHit },
    },
  },
  "sc-park-gap-long": {
    districtId: "lot-gap-long-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: glShadow },
      "mistake-overrun": { kind: "mistake", script: glMistakeOverrun },
      "mistake-blind-reverse": { kind: "mistake", script: glMistakeBlindReverse },
    },
  },
  "sc-park-van": {
    districtId: "lot-van-v1",
    extraObstacles: [PARK_DEPTH_VAN],
    traces: {
      "shadow-correct": { kind: "shadow", script: vnShadow },
      "mistake-early-turn": { kind: "mistake", script: vnMistakeEarly },
      "mistake-blind-reverse": { kind: "mistake", script: vnMistakeBlind },
    },
  },
  "sc-park-45-rev": {
    districtId: "lot-45rev-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: rvShadow },
      "mistake-nose-in": { kind: "mistake", script: rvMistakeNoseIn },
      "mistake-shallow-swing": { kind: "mistake", script: rvMistakeShallow },
    },
  },
  "sc-park-left": {
    districtId: "lot-left-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: lfShadow },
      "mistake-mirrored-habit": { kind: "mistake", script: lfMistakeMirrored },
      "mistake-cross-blind": { kind: "mistake", script: lfMistakeCross },
    },
  },
  "sc-park-zebra": {
    districtId: "lot-zebra-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: zbShadow },
      "mistake-park-after": { kind: "mistake", script: zbMistakeAfterZebra },
      "mistake-hidden-pedestrian": { kind: "mistake", script: zbMistakeHiddenPed },
    },
  },
  "sc-park-wall": {
    districtId: "lot-wall-v1",
    extraObstacles: [PARK_DEPTH_WALL],
    traces: {
      "shadow-correct": { kind: "shadow", script: wlShadow },
      "mistake-into-wall": { kind: "mistake", script: wlMistakeIntoWall },
      "mistake-clip-neighbour": { kind: "mistake", script: wlMistakeClipNeighbour },
    },
  },
  "sc-park-night": {
    districtId: "lot-night-v1",
    isNight: true,
    traces: {
      "shadow-correct": { kind: "shadow", script: ntShadow },
      "mistake-no-lights": { kind: "mistake", script: ntMistakeNoLights },
      "mistake-too-deep": { kind: "mistake", script: ntMistakeTooDeep },
    },
  },
  "sc-park-double": {
    districtId: "lot-double-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: dbShadow },
      "mistake-wide-run-up": { kind: "mistake", script: dbMistakeWideRunUp },
      "mistake-correct-backwards": { kind: "mistake", script: dbMistakeCorrectBack },
    },
  },
  "sc-park-judge": {
    districtId: "lot-gap-judge-v1",
    traces: {
      "shadow-correct": { kind: "shadow", script: gjShadow },
      "mistake-try-short": { kind: "mistake", script: gjMistakeTryShort },
      "mistake-short-forward": { kind: "mistake", script: gjMistakeShortForward },
    },
  },
};

/**
 * The full obstacle set of a parking-depth drill: the district's OWN occupied
 * bays (the single geometric truth) plus the drill's extra bodies. Exported so
 * the trace gate and the scene's held-scenery test can pin against the same
 * rects the recording was made with.
 */
export function parkDepthObstacles(
  districtRaw: unknown,
  drillId: ParkDepthDrillId,
): ObstacleRect2D[] {
  return [...lotObstacleRects(districtRaw), ...(PARK_DEPTH_DRILLS[drillId].extraObstacles ?? [])];
}

/**
 * Record one authored drive of one parking-depth drill against its loaded
 * district. Contacts grade from 0 km/h, which is what makes a 2 km/h bumper
 * touch a mistake. Deterministic.
 */
export function recordScParkDepthDrive(
  districtRaw: unknown,
  drillId: ParkDepthDrillId,
  traceName: string,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const drill = PARK_DEPTH_DRILLS[drillId];
  const entry = drill.traces[traceName];
  if (!entry) throw new Error(`${drillId}: unknown trace "${traceName}"`);
  return recordScriptedDrive(districtRaw, entry.script(), {
    scenarioId: drillId,
    kind: entry.kind,
    seed: 7,
    obstacles: parkDepthObstacles(districtRaw, drillId),
    collisionMinKmh: 0,
    ...(drill.isNight ? { isNight: true } : {}),
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
