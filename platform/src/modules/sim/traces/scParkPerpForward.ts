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
 *   east-west (headingDeg 90); occupied neighbours at y = ∓2.7 / ∓5.4, their
 *   noses at x ≈ 2.78;
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * WHERE A FORWARD ENTRY STARTS ON THE CAR'S OWN CIRCLE (catalogue-demo-
 * curvature: dae908c7, family «curvpark2», integrator ruling R3(d), 2026-11-05).
 * The old shadow swung a 4 m polyline quarter circle from x = 0.9 (2.47 m over
 * its tightest metre) and, on the live scene's colliders, touched the south
 * neighbour (−0.031 m). Going in nose first the rear axle TRAILS the body
 * centre, so a real car whose centre follows a 4.6 m swing runs its body wide
 * of the ghost's; measured on the recorder and the product's boxes, a swing
 * begun anywhere inside the old Задача 1 disc (0.9, −6.5) r 3 passes 0.11–0.12
 * m from the north neighbour, and the car keeps ≥ 0.25 m only with ≥ 3 m of
 * straight run after the swing — a swing begun at x ≈ −3.6 or further west.
 * The shadow therefore crosses the aisle (one ramped S on the unpainted
 * `service` aisle, radius 6, see below) to x = −4.63, the left half of the
 * aisle, through the re-centred Задача 1 disc (−4.6, −6.5) r 3 at the setup
 * pace with no stop (it is not a halt gate), the right indicator and the
 * looks right and back (instruction 4: the tail swings across the aisle),
 * then ONE turn of 90° on the 4.6 m drivable circle begun when the front
 * bumper is level with the car parked before the bay, and 4 m straight in.
 * The old «as far left as the lane detectors allow» premise held only on
 * paint: the aisle is unpainted, so no lane episode can arm there.
 *
 * WHY THE LEFT HALF IS LAWFUL HERE, AND FOR HOW LONG (lane curvpark2 round 3,
 * integrator ruling CP2-1bis). ЗДвП чл. 15, ал. 1 binds on this two-way
 * aisle; чл. 35, ал. 2 (content/law/acts/zdvp.json) lets a right turn whose
 * radius the vehicle cannot make BEGIN «и от друга част на платното за
 * движение», the driver letting through «пътните превозни средства,
 * преминаващи от дясната му страна». Measured, not assumed: on the product
 * chassis at full lock (the physics circle, ≈ 4.17 m — not the demo's 4.6),
 * wound at rest, no entry begun with the car wholly right of the centre line
 * reaches this bay without contact (park-family-limit.test.ts; best −0.065 m).
 * So the left half is the turn's start, and only that: the S (the kit's aisle
 * radius 6, ramps 1.5) ends 5.73 m before the turn-in — the left signal
 * cancelled there, the right one given one blink (0.75 s) later, 3.0 s ahead —
 * and begins its own length before that; the car's centre is left of the line
 * only for the S's second half and the straight after it (pinned in
 * park-family-drivable). Round 2 crossed at y −21.5 and ran 17.9 m there.
 */

import { authoredDrive, DRIVABLE_MIN_CENTRE_RADIUS_M, sShift, straight, swingForShift, turn, withRunOut, type AuthoredPath, type CurvatureStretch, type PathPose } from "./drivablePath";
import { CREEP_KMH, LOT_AISLE_Y, lotObstacleRects, parkedRect, SETTLE, SETUP_KMH, SETUP_SLOW_M, untilContact, X_LANE } from "./parkKit";
import type { DriveScript, DriveStep, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";

export const SC_PARK_PERP_FORWARD_ID = "sc-park-perp-forward";

/** Target bay centre (lot-bay-3 of lot-perp-v1). */
const BAY = { x: 5.03, y: 0 };
/** The Задача 1 disc's centre y (templates-parking.ts sc-ppf-setup). */
const DISC_Y = -6.5;
/** The turn: ramp 2.5 m, hold, ramp 2 m on the 4.6 m circle, then 4 m straight in. */
const TURN = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, rampInM: 2.5, rampOutM: 2.0, inM: 4.0 };
/**
 * The EARLY-TURN mistake's run-up (unchanged since round 2): its S onto x 1.5
 * — the right half, the car's left side 0.65 m right of the centre line —
 * begins at y −28, its left signal 8 m before, at y −36.
 */
const S_FROM_Y = -28;
const SIGNAL_AT_Y = -36;
/** The aisle S: the kit's aisle radius (parkKit `aisleTo`), ramps 1.5 m. */
const S_RADIUS_M = 6;
const S_RAMP_M = 1.5;
/**
 * THE RIGHT SIGNAL'S LEAD BEFORE THE TURN-IN, s (lane curvpark2 round 3,
 * integrator ruling CP2-1bis (2)). ЗДвП чл. 26 asks for the signal
 * «своевременно» and names no number; the product's own figure for it is the
 * 3.0 s an actor's blinker is lit before its manoeuvre (orchestrator/
 * runners.ts INDICATOR_LEAD_SEC, «clears the ledger's own 2.5 s gate with
 * margin»). At the disc pace SETUP_KMH that is TURN_SIGNAL_LEAD_M = 4.58 m of
 * straight between the end of the S (where the left signal is cancelled — the
 * set-up move is over) and the turn-in.
 */
export const TURN_SIGNAL_LEAD_SEC = 3.0;
const TURN_SIGNAL_LEAD_M = (TURN_SIGNAL_LEAD_SEC * SETUP_KMH) / 3.6;
/**
 * Between the two signals, s: the left one cancelled where the S ends, the
 * right one given a full blink later — one period of the ghost's own lamp
 * (components/sim/ShadowCar.tsx BLINK_PERIOD_S 0.75) — so the student sees
 * the set-up move's signal END before the turn's begins, never a flip from
 * one side to the other (park-family-drivable, «…and not straight into the
 * other side»). At SETUP_KMH: SIGNAL_GAP_M = 1.15 m.
 */
export const SIGNAL_GAP_SEC = 0.75;
const SIGNAL_GAP_M = (SIGNAL_GAP_SEC * SETUP_KMH) / 3.6;
/** The left signal's lead before the S: 8 m at the aisle's 9 km/h = 3.2 s (≥ TURN_SIGNAL_LEAD_SEC). */
const LEFT_SIGNAL_LEAD_M = 8;
/** Where the approach road's 18 km/h ends: 3 m short of the aisle (parkKit `lotApproach`). */
const AISLE_PACE_FROM_Y = LOT_AISLE_Y - 3;
function sProgramme(shift: number): CurvatureStretch[] {
  const k = Math.sign(shift) / S_RADIUS_M;
  return sShift(swingForShift(shift, k, S_RAMP_M), k, S_RAMP_M);
}
const sLength = (shift: number) => authoredDrive({ x: 0, y: 0, headingDeg: 0 }, sProgramme(shift), 1).end.y;

function turnProgramme(): CurvatureStretch[] {
  return [...turn(Math.PI / 2, 1 / TURN.radiusM, TURN.rampInM, TURN.rampOutM), straight(TURN.inM)];
}
function turnInPose(): PathPose {
  const d = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, turnProgramme(), 1).end;
  return { x: BAY.x - d.x, y: BAY.y - d.y, headingDeg: 0 };
}
const TURN_IN = turnInPose();
/**
 * THE CLEAN RUN-UP (lane curvpark2 round 3, integrator ruling CP2-1bis (2):
 * the car takes the aisle's left half only as late as the turn's start needs).
 * The S onto the turn-in line ends SIGNAL_GAP_M + TURN_SIGNAL_LEAD_M before
 * the turn-in — the left signal cancelled there, the right one given one
 * blink later, 3.0 s before the turn — and begins its own length before
 * that; the left signal 8 m before the S.
 */
const S_END_Y = TURN_IN.y - TURN_SIGNAL_LEAD_M - SIGNAL_GAP_M;
const S_FROM_Y_CLEAN = S_END_Y - sLength(TURN_IN.x - X_LANE);
const SIGNAL_AT_Y_CLEAN = S_FROM_Y_CLEAN - LEFT_SIGNAL_LEAD_M;

/** The early-turn mistake: from x 1.5 (half the room the swing needs) … */
const X_EARLY = 1.5;
/**
 * …and begun this far before the correct turn-in, m — a whole car length and
 * more («цяла кола по-рано»). Round 2 (CP2-3): begun 2.4 m early the ghost
 * touched the neighbour 0.12 m deep but a REAL car on the same centre line (its
 * rear axle rolling along its body, parkDepthProduct `bicycleOnPath`) passed
 * it 0.087 m clear, and the product chassis driven along the demo
 * (parkChassisDrive.ts) 0.19 m clear: the contact rested on the ghost's
 * chord-heading crab. Begun 5 m early the real car's front-right quarter
 * reaches the neighbour deeper than the ghost's does, and the chassis strikes
 * it (pinned in park-family-drivable and park-family-chassis).
 */
const EARLY_M = 5.0;

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PARK_PERP_FORWARD_GEOMETRY = {
  radiusM: TURN.radiusM,
  turnIn: { ...TURN_IN },
  straightInM: TURN.inM,
  earlyX: X_EARLY,
  earlyM: EARLY_M,
  /** The clean run-up's S: where it begins and ends (y), and the straight after it, m. */
  sFromY: S_FROM_Y_CLEAN,
  sEndY: S_END_Y,
  sRadiusM: S_RADIUS_M,
  sRampM: S_RAMP_M,
  turnSignalLeadM: TURN_SIGNAL_LEAD_M,
  signalGapM: SIGNAL_GAP_M,
  leftSignalAtY: SIGNAL_AT_Y_CLEAN,
} as const;

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
  [X_LANE, SIGNAL_AT_Y],
];
/** …and its last 8 m, after the set-up move's signal (see `runUp`). */
const APPROACH_END: Array<[number, number]> = [
  [X_LANE, SIGNAL_AT_Y],
  [X_LANE, S_FROM_Y],
];

/**
 * Across the aisle onto the line `x`, to (`x`, `y`): one ramped S of radius 6
 * from S_FROM_Y, then straight on. As drive steps that never stop: 9 km/h,
 * then SETUP_KMH from SETUP_SLOW_M before the disc on, with `before` spliced in
 * where the last `lastM` metres begin. Every slice but the last runs
 * RUN_OUT_PTS (5 cm, at 1 mm per point) further along the path itself — the
 * recorder ends a step 5 cm short of its last point — so no slice starts with a
 * hop and no run-out leaves the curve (the scPark45 note).
 */
const RUN_OUT_PTS = 50;
/**
 * The S is a set-up move to the LEFT (2.6–8.7 m — more than the car's half
 * width), so it is signalled as parkKit `leftSetUpMove` signals one (ЗДвП
 * чл. 26; lane curvpark2 round 2, CP2-6): the left mirror and indicator before
 * it (`approachSignalled`, on the approach's last 8 m), the indicator OFF where the
 * car is square on its line — spliced in here — and the bay's right signal
 * only after that, in `before`.
 */
function runUp(x: number, y: number, before: DriveStep[], lastM = 4, sFromY = S_FROM_Y): DriveStep[] {
  const s = sProgramme(x - X_LANE);
  const sLen = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, s, 1).end.y;
  if (y - sFromY - sLen < -1e-9) throw new Error(`runUp(${x}, ${y}): the S needs ${sLen.toFixed(2)} m`);
  const p: AuthoredPath = authoredDrive({ x: X_LANE, y: sFromY, headingDeg: 0 }, [...s, straight(Math.max(0, y - sFromY - sLen))], 1);
  const pts = p.points;
  const iSlow = Math.max(1, pts.findIndex(([, py]) => py >= DISC_Y - SETUP_SLOW_M));
  const iLine = pts.findIndex(([, py]) => py >= sFromY + sLen);
  const iLast = pts.findIndex(([, py]) => py >= y - lastM);
  if (!(iLine > 0 && iLine < iLast)) throw new Error(`runUp(${x}, ${y}): the line is not reached before the turn's looks`);
  const cuts = [...new Set([0, iSlow, iLine, iLast])].sort((a, b) => a - b);
  const out: DriveStep[] = [];
  for (let c = 0; c < cuts.length; c++) {
    const a = cuts[c];
    if (a === iLine) out.push({ kind: "indicator", setting: "off" });
    if (a === iLast) out.push(...before);
    const kmh = a < iSlow ? 9 : SETUP_KMH;
    const last = c + 1 === cuts.length;
    out.push({ kind: "drive", points: last ? withRunOut(pts.slice(a)) : pts.slice(a, cuts[c + 1] + 1 + RUN_OUT_PTS), targetKmh: kmh, stopAtEnd: false });
  }
  return out;
}
/**
 * The approach, with the set-up move's signal given on its last 8 m — the
 * early-turn mistake's (round 2, byte-for-byte) or, `clean`, the clean
 * run-up's (round 3): 18 km/h to 3 m short of the aisle, the aisle's 9 from
 * there, the left signal LEFT_SIGNAL_LEAD_M before the S.
 */
function approachSignalled(look: boolean, caption: DriveStep[] = [], clean = false): DriveStep[] {
  if (clean) {
    if (!(SIGNAL_AT_Y_CLEAN > AISLE_PACE_FROM_Y)) throw new Error("approachSignalled: the left signal falls before the aisle's pace");
    return [
      { kind: "drive", points: [[X_LANE, -105], [X_LANE, -92], [X_LANE, AISLE_PACE_FROM_Y + 0.05]], targetKmh: 18, stopAtEnd: false },
      { kind: "drive", points: [[X_LANE, AISLE_PACE_FROM_Y], [X_LANE, SIGNAL_AT_Y_CLEAN + 0.05]], targetKmh: 9, stopAtEnd: false },
      ...caption,
      ...(look ? [{ kind: "glance", mirror: "left" } as DriveStep] : []),
      { kind: "indicator", setting: "left" },
      { kind: "drive", points: [[X_LANE, SIGNAL_AT_Y_CLEAN], [X_LANE, S_FROM_Y_CLEAN]], targetKmh: 9, stopAtEnd: false },
    ];
  }
  return [
    { kind: "drive", points: APPROACH, targetKmh: 18, stopAtEnd: false },
    ...caption,
    ...(look ? [{ kind: "glance", mirror: "left" } as DriveStep] : []),
    { kind: "indicator", setting: "left" },
    // at the aisle's pace from here (instruction 1: «не повече от 10 км/ч»;
    // the recorder brakes 18 → 10 in under 2 m): ≤ 10 where the aisle begins
    { kind: "drive", points: APPROACH_END, targetKmh: 9, stopAtEnd: false },
  ];
}

/** The clean forward park both the shadow and the blind-exit demo make. */
function cleanPark(looks: boolean): DriveStep[] {
  const sw = authoredDrive(TURN_IN, turnProgramme(), 1);
  return [
    ...approachSignalled(
      looks,
      looks
        ? [
            {
              kind: "annotation",
              textBg:
                "Мястото е вдясно, но завоят напред започва отляво: щом лявата половина е свободна напред, ляв мигач и се изнеси там — от дясната лента дъгата не се побира.",
            } as DriveStep,
          ]
        : [],
      true,
    ),
    // ЗДвП чл. 35, ал. 2: a turn begun from another part of the carriageway
    // owes the vehicles passing on the driver's right — the look right, taken
    // rolling, with the right signal (no stop: this is a pass-through lesson).
    ...runUp(
      TURN_IN.x,
      TURN_IN.y,
      [
        ...(looks
          ? [
              {
                kind: "annotation",
                textBg:
                  "Десен мигач и пешеходна скорост: погледни вдясно, пропусни всеки, който минава отдясно, и изчакай колата преди мястото да дойде срещу бронята ти.",
              } as DriveStep,
              { kind: "glance", mirror: "right" } as DriveStep,
            ]
          : []),
        { kind: "indicator", setting: "right" },
      ],
      TURN_SIGNAL_LEAD_M,
      S_FROM_Y_CLEAN,
    ),
    ...(looks
      ? [
          {
            kind: "annotation",
            textBg: "Сега завой надясно в една дъга — следи ДЯСНОТО огледало: там минава ъгълът на съседа.",
          } as DriveStep,
          { kind: "glance", mirror: "right" } as DriveStep,
          { kind: "glance", mirror: "rear" } as DriveStep,
        ]
      : []),
    { kind: "drive", points: withRunOut(sw.points), targetKmh: SETUP_KMH },
  ];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkPerpForwardShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      ...cleanPark(true),
      // holdSec 1.5 + margin — the parkInBay contract completes at rest.
      ...SETTLE,
      {
        kind: "annotation",
        textBg:
          "Готово — и запомни цената: сега си с нос навътре и излизането ще е на сляпо между тези две коли.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подранил завой" (no room taken, turning early → the corner)
// ---------------------------------------------------------------------------

export function scParkPerpForwardMistakeEarlyTurnScript(): DriveScript {
  // The same turn, from a line half-way across instead of the far side, and
  // begun 5 m too soon: the front-right quarter reaches a parked car two
  // bays before the free one — cut where that contact has happened (parkKit
  // `untilContact`, on the smaller of the gate's rect and the live collider).
  const start: PathPose = { x: X_EARLY, y: TURN_IN.y - EARLY_M, headingDeg: 0 };
  const sw = authoredDrive(start, [...turnProgramme(), straight(2)], 1);
  // The first car the front-right quarter reaches: lot-bay-1 (5.03, −5.4), a dret_90 in the live scene.
  const NEIGHBOUR = parkedRect(5.03, -5.4, 90);
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката, която прави всеки бързащ: малко място отляво и волан преди ъгъла на мястото.",
      },
      { kind: "glance", mirror: "rear" },
      ...approachSignalled(true),
      ...runUp(start.x, start.y, [{ kind: "indicator", setting: "right" }]),
      {
        kind: "annotation",
        textBg: "Оттук дъгата свършва между двете коли, не в мястото — а предният десен ъгъл вече върви към съседа…",
      },
      { kind: "drive", points: untilContact(sw.points, 1, NEIGHBOUR, "dret_90"), targetKmh: CREEP_KMH },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Закачи съседа с предната дясна четвърт. Дъгата е вярна — моментът не: завърташ, когато бронята ти е срещу колата преди СВОБОДНОТО място, и с цялата алея зад гърба си.",
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
      ...cleanPark(false),
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
          [BAY.x, 0],
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
