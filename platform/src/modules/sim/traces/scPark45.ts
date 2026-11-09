/**
 * sc-park-45 — authored drives (S2-A): ONE correct shadow + TWO mistake
 * demos for „Паркиране на 45°" on the committed lot-45-v1 district. The
 * scripts are the SOURCE of the committed traces under
 * content/traces/sc-park-45/ (§5 zero-violation shadow, §9 exact codes).
 *
 * Geometry pinned to content/world/lot-45-v1.json:
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   echelon row on the EAST side: bays at x = 4.8, axis 45°, pitch 3.82;
 *   target bay lot-bay-3 center (4.8, 0); occupied neighbors at y ∓3.82/∓7.64,
 *   their aisle-side corners at x ≈ 2.53–2.57;
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * FORWARD entry (doc-72 PK-02 echelon variant; the spec's parkInBay carries
 * entry "forward") — AS THE PRODUCT CAR DRIVES IT (catalogue-demo-curvature:
 * dae908c7, family «curvpark2», 2026-11-06). Until then the turn-in was a 4 m
 * five-chord polyline arc (3.2 m over its tightest metre, pivots at every
 * vertex), and the shadow came into its own Задача 1 disc at 10.1 km/h, over
 * the cap — its own too-fast card at L3–L5. Now: one ramped S on the
 * unpainted aisle onto the line x = 0.8 — the car's right side ≈ 0.9 m off the
 * row's aisle corners («дръж метър до реда») — through the Задача 1 disc at
 * the setup pace (5.5 km/h over the last 12 m, no stop: this disc is not a halt
 * gate), the right mirror, the shoulder and the right indicator, then ONE
 * turn of 45° on the 4.6 m drivable circle begun when the front bumper is
 * level with the aisle corner of the car parked before the bay, and 3 m
 * straight in. A real car whose centre follows that line keeps ≥ 0.25 m from
 * both neighbours (its rear axle trails the ghost; with only 2 m of straight
 * it would touch) — pinned in traces/__tests__/park-family-drivable.test.ts.
 */

import { authoredDrive, DRIVABLE_MIN_CENTRE_RADIUS_M, straight, turn, withRunOut, type AuthoredPath, type CurvatureStretch, type PathPose } from "./drivablePath";
import { aisleSEndY, aisleTo, CREEP_KMH, lotApproach, lotObstacleRects, parkedRect, SETTLE, SETUP_KMH, SETUP_SLOW_M, untilContact, X_LANE } from "./parkKit";
import type { DriveScript, DriveStep, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";

export const SC_PARK_45_ID = "sc-park-45";

/** Target bay center (lot-bay-3 of lot-45-v1), its axis at 45°. */
const BAY = { x: 4.8, y: 0, headingDeg: 45 };
/** The Задача 1 disc's centre y (templates-parking.ts sc-p45-position). */
const DISC_Y = -9.5;
/** The turn-in: ramp 1.5 m, hold, ramp 1.5 m on the 4.6 m circle, then 3 m straight in. */
const TURN = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, rampInM: 1.5, rampOutM: 1.5, inM: 3.0 };

function turnProgramme(): CurvatureStretch[] {
  return [...turn(Math.PI / 4, 1 / TURN.radiusM, TURN.rampInM, TURN.rampOutM), straight(TURN.inM)];
}
/** Where the turn must begin for the car to arrive on the bay's centre, nose in. */
function turnInPose(): PathPose {
  const d = authoredDrive({ x: 0, y: 0, headingDeg: 0 }, turnProgramme(), 1).end;
  return { x: BAY.x - d.x, y: BAY.y - d.y, headingDeg: 0 };
}
const TURN_IN = turnInPose();

/** The corner-cut mistake's line: hugging the row, the car's right side ≈ 0.4 m off its corners. */
const X_HUG = 1.3;
/**
 * …and its turn begun this far before the correct turn-in, m. Round 2 (CP2-3):
 * 1.5 m early, the ghost touched the corner 0.12 m deep but a REAL car on the
 * same centre line — its rear axle rolling along its body (parkDepthProduct
 * `bicycleOnPath`) — passed it 0.006 m clear, and the product chassis driven
 * along the demo (parkChassisDrive.ts) 0.18 m clear: the contact rested on the
 * ghost's chord-heading crab. 2.5 m early the real car reaches the corner
 * deeper than the ghost does, and the chassis strikes it (pinned in
 * park-family-drivable and park-family-chassis).
 */
const EARLY_M = 2.5;
/**
 * Where every demo's S onto its line begins — 3 m before the aisle's GATE_Y,
 * still on the unpainted aisle (round 2, CP2-6): so the S, and with it the left
 * signal of the set-up move, is over before the looks and the right indicator
 * of the turn, 4 m before the turn-in (2.4 m on the corner-cut, whose turn
 * comes 2.5 m early).
 */
const SHIFT_FROM_Y = -21;
/** How deep the corner-cut's ghost rests in the neighbour's smaller box, m. */
const CORNER_CUT_DEPTH_M = 0.2;

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PARK_45_GEOMETRY = {
  radiusM: TURN.radiusM,
  turnIn: { ...TURN_IN },
  straightInM: TURN.inM,
  hugX: X_HUG,
  earlyM: EARLY_M,
} as const;


/**
 * The run-up onto the line `x` to the turn-in at `y`, as drive steps that never
 * stop: the aisle's pace, then SETUP_KMH from SETUP_SLOW_M before the disc's
 * centre on. `before` is spliced in where the run-up's last `lastM` metres
 * begin (the looks and the indicator before the turn). Every slice but the
 * last runs RUN_OUT_PTS (5 cm) further along the path itself: the recorder
 * ends a drive step 5 cm short of its last point, so a slice cut exactly at the
 * join would leave the next one to start with a 5 cm hop — a heading step the
 * ghost's wheel reads as a snap to full lock — and a straight run-out (as
 * drivablePath `withRunOut`) inside a curve dips the wheel instead.
 */
const RUN_OUT_PTS = 50;
/**
 * The S onto the line is a set-up move to the LEFT (3 m and more — more than
 * the car's half width), so it is signalled as parkKit `leftSetUpMove` signals
 * one (ЗДвП чл. 26; lane curvpark2 round 2, CP2-6): the left mirror and the
 * left indicator before it (`setUpSignal`, given where the approach hands over
 * to the aisle), the indicator off where the car is square on the line —
 * spliced in here — and the bay's right signal only after that, in `before`.
 */
function runUp(x: number, y: number, before: DriveStep[], lastM = 4, shiftFromY?: number): DriveStep[] {
  const o = shiftFromY === undefined ? {} : { shiftFromY };
  const p: AuthoredPath = aisleTo(x, y, o);
  const pts = p.points;
  const iSlow = Math.max(1, pts.findIndex(([, py]) => py >= DISC_Y - SETUP_SLOW_M));
  const lineY = aisleSEndY(x, o);
  const iLine = pts.findIndex(([, py]) => py >= lineY);
  const iLast = pts.findIndex(([, py]) => py >= y - lastM);
  if (!(iLine > 0 && iLine < iLast)) throw new Error(`runUp(${x}, ${y}): the line (y ${lineY.toFixed(2)}) is not reached before the turn's looks`);
  const cuts = [...new Set([0, iSlow, iLine, iLast])].sort((a, b) => a - b);
  const out: DriveStep[] = [];
  for (let c = 0; c < cuts.length; c++) {
    const a = cuts[c];
    if (a === iLine) out.push({ kind: "indicator", setting: "off" });
    if (a === iLast) out.push(...before);
    const kmh = a < iSlow ? 9 : SETUP_KMH;
    const last = c + 1 === cuts.length;
    out.push({ kind: "drive", points: last ? pts.slice(a) : pts.slice(a, cuts[c + 1] + 1 + RUN_OUT_PTS), targetKmh: kmh, stopAtEnd: false });
  }
  return out;
}
/** The set-up move's signal, given before the S (see `runUp`). */
function setUpSignal(look: boolean): DriveStep[] {
  return [...(look ? [{ kind: "glance", mirror: "left" } as DriveStep] : []), { kind: "indicator", setting: "left" }];
}

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scPark45ShadowScript(): DriveScript {
  const sw = authoredDrive(TURN_IN, turnProgramme(), 1);
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: -24 }, false),
      {
        kind: "annotation",
        textBg: "Косите места се отварят надясно. Дръпни се леко вляво с ляв мигач и намали.",
      },
      ...setUpSignal(true),
      ...runUp(TURN_IN.x, TURN_IN.y, [
        {
          kind: "annotation",
          textBg:
            "Огледало, рамо, десен мигач — и завий, щом предната броня се изравни с ъгъла на паркираната кола преди мястото.",
        },
        { kind: "glance", mirror: "right" },
        { kind: "glance", mirror: "rear" },
        { kind: "indicator", setting: "right" },
      ], 4, SHIFT_FROM_Y),
      {
        kind: "annotation",
        textBg: "Плавна дъга под 45° — следи съседната кола в дясното огледало.",
      },
      { kind: "glance", mirror: "right" },
      // One turn onto the bay's axis, then straight to its centre.
      { kind: "drive", points: withRunOut(sw.points), targetKmh: SETUP_KMH },
      // holdSec 1.5 + margin — the parkInBay contract completes at rest.
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: по посоката на линиите, центрирано, без подминаване." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Подмината линия на гнездото" (overshoot → curb strike)
// ---------------------------------------------------------------------------

export function scPark45MistakeOvershootScript(): DriveScript {
  // The correct line, but pushed ~1.5 m past the bay centre — the nose
  // crosses the end line and the front wheel meets the curb strip (an
  // authored consequence at creeping speed).
  const sw = authoredDrive(TURN_IN, [...turnProgramme(), straight(1.5)], 1);
  // Creep over the last 1.5 m past the bay centre; the curb is met 0.1 m before the end.
  const iCurb = sw.points.length - 1 - 1500;
  const iTouch = sw.points.length - 1 - 100;
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво става, когато влизането продължи след линията на гнездото.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: -24 }, false),
      ...setUpSignal(true),
      ...runUp(TURN_IN.x, TURN_IN.y, [
        { kind: "glance", mirror: "right" },
        { kind: "indicator", setting: "right" },
      ], 4, SHIFT_FROM_Y),
      {
        kind: "annotation",
        textBg: "Влизането е добро… но погледът остава напред и никой не брои линиите.",
      },
      { kind: "drive", points: withRunOut(sw.points.slice(0, iCurb + 1)), targetKmh: SETUP_KMH, stopAtEnd: false },
      { kind: "drive", points: withRunOut(sw.points.slice(iCurb, iTouch + 1)), targetKmh: CREEP_KMH, stopAtEnd: false },
      // The front wheel meets the curb strip while the car still rolls; it is
      // braked to rest against it over the last decimetre.
      { kind: "collision", withWhat: "staticObject" },
      { kind: "drive", points: sw.points.slice(iTouch), targetKmh: CREEP_KMH },
      { kind: "pause", sec: 1.8, brake: true },
      {
        kind: "annotation",
        textBg:
          "Предното колело опря бордюра — колата подмина крайната линия. Спри, когато страничните линии застанат успоредно на теб, не когато бордюрът те спре.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Подрязан ъгъл на съседа" (hugging the row, turning early)
// ---------------------------------------------------------------------------

export function scPark45MistakeCornerCutScript(): DriveScript {
  // The same turn, from a line hugging the row (x = 1.3, the car's right side
  // ≈ 0.4 m off the corners) and begun early: the 45° line it lands on runs
  // into the corner of the car parked before the bay — cut where that contact
  // has happened (parkKit `untilContact`, the smaller of the gate's rect and
  // the live collider).
  const start: PathPose = { x: X_HUG, y: TURN_IN.y - EARLY_M, headingDeg: 0 };
  const sw = authoredDrive(start, [...turnProgramme(), straight(2)], 1);
  const NEIGHBOUR = parkedRect(4.8, -3.82, 45);
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: завоят тръгва твърде рано и дъгата минава плътно до съседа.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: -24 }, false),
      ...setUpSignal(true),
      // The S onto the hugging line begins 3 m sooner than the shadow's (y −21,
      // still on the unpainted aisle) so that it is over before a turn begun
      // 2.5 m early: the car comes out of it square.
      ...runUp(start.x, start.y, [
        { kind: "glance", mirror: "right" },
        { kind: "indicator", setting: "right" },
      ], 2.4, SHIFT_FROM_Y),
      {
        kind: "annotation",
        textBg: "Дъгата реже към ъгъла на паркираната кола…",
      },
      {
        kind: "drive",
        // 0.2 m into the smaller box, not parkKit's 0.12: the REAL car on this
        // line trails the ghost by ≈ 0.05 m at the corner and the product
        // chassis by ≈ 0.12 m more (park-family-chassis), so a ghost resting a
        // bumper's give deep would leave the chassis a hair short of the car
        // the explanation says it struck.
        points: untilContact(sw.points, 1, NEIGHBOUR, "vela_h3", CORNER_CUT_DEPTH_M),
        targetKmh: CREEP_KMH,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Страницата закачи ъгъла на съседа — в паркинга и 2 км/ч са удар. Отвори завоя: дръж около метър от реда и завивай срещу ъгъла на колата преди мястото.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScPark45TraceName =
  | "shadow-correct"
  | "mistake-overshoot"
  | "mistake-corner-cut";

const SCRIPTS: Record<ScPark45TraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scPark45ShadowScript },
  "mistake-overshoot": { kind: "mistake", script: scPark45MistakeOvershootScript },
  "mistake-corner-cut": { kind: "mistake", script: scPark45MistakeCornerCutScript },
};

/**
 * Record one of the three drives against a loaded lot-45-v1 document —
 * parked-car obstacles armed at the parking threshold. Deterministic.
 */
export function recordScPark45Drive(
  districtRaw: unknown,
  name: ScPark45TraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_45_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
