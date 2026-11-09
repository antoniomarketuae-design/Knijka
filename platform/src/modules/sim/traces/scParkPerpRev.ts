/**
 * sc-park-perp-rev — the P0 authored drives (doc 76 §10): ONE correct shadow
 * demonstration + TWO mistake demos for „Перпендикулярно паркиране на заден
 * ход" on the committed lot-perp-v1 district. The scripts are the SOURCE of
 * the committed traces under content/traces/sc-park-perp-rev/ — the trace
 * gate test replays exactly these through the production stack and asserts:
 *   - shadow: ZERO violations (with the parked-car obstacle rects ARMED at
 *     collisionMinKmh 0) and the parkInBay contract completes (§5 gate);
 *   - each mistake demo grades EXACTLY its authored codeRefs (§9 stage 5).
 *
 * Geometry is pinned to content/world/lot-perp-v1.json (the demo.ts pattern —
 * lessons pin district coordinates by value):
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625
 *   (2-lane road, 3.25 m lane × 2.5 perceptual scale / 2);
 *   bay row on the EAST side, bay rects x ∈ [2.53, 7.53], the parked cars'
 *   noses at x ≈ 2.78;
 *   target bay lot-bay-3 center (5.03, 0), axis east-west (headingDeg 90);
 *   occupied neighbors lot-bay-1/2/4/5 at y = ∓5.4 / ∓2.7;
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * EVERY PATH IS ONE THE PRODUCT CAR CAN DRIVE (catalogue-demo-curvature:
 * dae908c7, family «curvpark2», 2026-11-06). Until then the swing was a 4 m
 * polyline quarter circle from a setup at x = 0.9: the ghost pivoted at every
 * vertex (the census measured 2.59 m over its tightest metre, 1.295 m on the
 * mistake), and on the live scene's per-model colliders the correct demo
 * touched the neighbour (−0.003 m). Every drive is now cut from the parking kit
 * (./parkKit): curvature programmes on the 4.6 m drivable circle
 * (./drivablePath), the wheel wound on and off in ramps, the car at rest
 * wherever the gear changes, and ≥ 0.25 m from every parked car as the
 * product's boxes see them — pinned in
 * traces/__tests__/park-family-drivable.test.ts.
 *
 * WHAT THE CAR'S OWN CIRCLE DOES TO THIS LESSON. At 4.6 m a quarter swing
 * carries the car's centre ≈ 5.3 m sideways, so the setup that works is the
 * WIDE one: x = −0.5, the car's right side ≈ 2.4 m off the parked cars' noses
 * («около два и половина метра»; the old «метър и половина» does not fit).
 * From the old line, a metre off the noses, the same swing does not fit: the
 * tail meets the neighbour before the car is straight. That is mistake 1 now
 * (integrator ruling R2: re-cast as the too-CLOSE setup; its trace file and
 * demo id stay «mistake-wide-approach» — internal, never shown — and only the
 * shown text says what it is).
 *
 * Rule-engine safety envelope: north of the approach the aisle is the
 * unpainted `service` class, so no lane / centre-line detector can arm there
 * in any gear (world/builders/constants.ts MARKED_CLASSES — the old «|x| <
 * 0.81 arms a lane episode» premise held only on paint); the approach stays in
 * the kerb lane; reverse gear is exempt from every lane/wrong-way detector by
 * A12 law.
 */

import { authoredDrive, DRIVABLE_MIN_CENTRE_RADIUS_M, straight, turn, withRunOut } from "./drivablePath";
import {
  aisleSEndY,
  aisleTo,
  bayReverse,
  CREEP_KMH,
  firstMetres,
  LOOK_BEFORE_REVERSE,
  lotObstacleRects,
  parkedRect,
  REVERSE_KMH,
  SETTLE,
  leftSetUpMove,
  untilContact,
  X_LANE,
  type BayReverse,
  FEEDER_END_Y,
  lotApproach,
  TWO_STAGE_FROM_Y,
  twoStageSetUp,
  twoStageSteps,
} from "./parkKit";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_PARK_PERP_REV_ID = "sc-park-perp-rev";

/**
 * The parked-car footprint and the lot's obstacle rects moved to ./parkKit (the
 * parking kit's leaf module) with the same values; exported from here as before,
 * so every importer of this module (scParkParallelExit, scPkDoublePark,
 * scVuDoorZone, the trace tests) is unedited.
 */
export { lotObstacleRects, PARKED_CAR_HALF_LENGTH_M, PARKED_CAR_HALF_WIDTH_M } from "./parkKit";

/** Target bay center (lot-bay-3 of lot-perp-v1). */
const BAY = { x: 5.03, y: 0 };
/** The setup line: the car's right side ≈ 2.4 m off the noses (see header). */
const X_SETUP = -0.5;
/** The swing: straight back 1 m, the wheel wound on over 1.5 m, held, unwound over 1.2 m. */
const SWING = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, s0M: 1.0, rampInM: 1.5, rampOutM: 1.2 };
/** The correct manoeuvre; its setup y is DERIVED (parkKit `bayReverse`). */
const PR: BayReverse = bayReverse(1, X_SETUP, BAY, SWING);
/** The old line, a metre off the noses — mistake 1's setup (R2). */
const X_CLOSE = 0.9;
/** The neighbour the too-close swing clips: lot-bay-4 at (5.03, 2.7): the car the stop has just passed, a dret_90 in the live scene. */
const NEIGHBOUR = parkedRect(5.03, 2.7, 90);

/**
 * THE AISLE'S LEFT HALF, ONLY AS THE MANOEUVRE'S START (lane curvpark2 round
 * 4, integrator rulings CP2-1bis / CP2-1ter, 2026-11-08). The setup x = −0.5
 * stands 0.5 m left of the aisle centre line, in the half of a two-way aisle
 * where ЗДвП чл. 15, ал. 1 binds; чл. 35, ал. 2 (content/law/acts/zdvp.json)
 * lets a turn whose radius the vehicle cannot make BEGIN «и от друга част на
 * платното за движение», the driver letting through «пътните превозни
 * средства, преминаващи от дясната му страна». The radius, as ruled (CP2-1ter),
 * is the drivable programme's with the demo floor: no reverse begun with the
 * car wholly right of the centre line enters the bay on the 4.6 m circle
 * keeping ≥ 0.25 m (the kit refuses the swing from the old x 0.9 line: «the
 * swing ends 1.09 m past the bay»); at FULL lock wound at rest one does, 0.116
 * m off the neighbour — a recorded fact (park-family-limit.test.ts), not a
 * radius a driver turns on. So the left half is the reverse's start, and only
 * that, and the car stays in the right half for as long as the geometry
 * allows (round 5, integrator ruling CP2-1quater): a TWO-STAGE set-up (parkKit
 * `twoStageSetUp`) — S1 from the drawn lane centre onto the right-half line
 * x = XM before the row, that line past the row, and S2 onto the setup line,
 * ending AT the setup stop where the reverse begins. The car's centre is left
 * of the centre line only for S2's tail, ≈ 3.19 m (round 4: one late S from
 * the lane centre, 11.90 m; round 3: 16.55 m). Pinned, with the minimum
 * re-derived over every right-half line, in park-family-drivable.
 */
/**
 * The right-half line past the row: 0.2 m inside the line the demo floor
 * allows (≈ 1.42, measured on the product's boxes — a car further right comes
 * within 0.25 m of the row), the car's right side ≈ 0.7 m off the noses; the
 * line costs ≤ 0.02 m of left-half travel against the floor's own line.
 */
const XM = 1.2;
/** Up the aisle: S1 onto XM, past the row, S2 onto the setup line (see above). */
const TS = twoStageSetUp(XM, PR.setup.x, PR.setup.y);

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PARK_PERP_REV_GEOMETRY = {
  radiusM: SWING.radiusM,
  setup: { ...PR.setup },
  closeSetupX: X_CLOSE,
  bay: { ...BAY },
  /** The swing programme (round 4: the precondition pin re-runs the kit on it from the right half). */
  swing: { ...SWING },
  /** The two-stage set-up (round 5): the right-half line, where each S begins and ends, where each left signal is given; the S's radius and ramps. */
  xm: TS.xm,
  s1SignalY: TS.s1SignalY,
  s1FromY: TS.s1FromY,
  s1EndY: TS.s1EndY,
  s2SignalY: TS.s2SignalY,
  s2FromY: TS.s2FromY,
  sRadiusM: 6,
  sRampM: 1.5,
} as const;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scParkPerpRevShadowScript(): DriveScript {
  return {
    steps: [
      { kind: "annotation", textBg: "Влизаме в паркинга: дръж дясната страна и карай спокойно." },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: TWO_STAGE_FROM_Y + 0.05 }, false),
      ...twoStageSteps(TS, 9, true, {
        s1: [
          {
            kind: "annotation",
            textBg: "Преди реда се отмести наляво с ляв мигач, по-далеч от предниците на колите — но остани в дясната половина на алеята.",
          },
        ],
        s2: [
          {
            kind: "annotation",
            textBg:
              "Свободното място е вдясно, но замахът започва отляво: щом лявата половина е свободна напред, огледай се и се отмести там с ляв мигач.",
          },
        ],
      }),
      {
        kind: "annotation",
        textBg:
          "Подмини мястото и спри, щом задната броня подмине съседната кола — на около два и половина метра от предниците на колите.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Сега десен мигач — към мястото. Преди задната: двете огледала и през рамо; пропусни всеки, който минава отдясно — и чак тогава завивай.",
      },
      { kind: "indicator", setting: "right" },
      ...LOOK_BEFORE_REVERSE,
      // The gear goes in after the looks, never on the instant of the last one
      // (so every look is heard before R on every display — grade-grid ROUND 8).
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "drive", points: withRunOut(PR.a.points), targetKmh: REVERSE_KMH, reverse: true },
      // Mid-maneuver observation (instruction 4: „следи двете съседни коли
      // в огледалата") — the during-reverse rubric moment, taken at rest.
      { kind: "annotation", textBg: "Спри на половината завой и погледни назад — и в дясното огледало." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Следи съседните коли в огледалата и изправи волана." },
      { kind: "drive", points: withRunOut(PR.b.points), targetKmh: CREEP_KMH, reverse: true },
      // The final check before the definitive stop (rubric moment 3), the
      // parkInBay hold (holdSec 1.5 + margin), the indicator off at rest.
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: центрирано, успоредно на линиите, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — the too-CLOSE setup (trace «mistake-wide-approach»)
// ---------------------------------------------------------------------------

/**
 * RE-CAST (lane curvpark2, integrator ruling R2, 2026-11-05). This demo used to
 * show a «too wide» setup that could not reach the bay; on the car's own
 * circle the wide setup is the one that WORKS, and the old demo made its
 * contact by a 1.295 m pivot. It now shows the habit the lesson exists to
 * break: the setup a metre off the noses (the old line, x = 0.9), at the same
 * stop, the same swing — and the tail meets the neighbour before the car is
 * straight, cut where that contact has happened (parkKit `untilContact`, on the
 * smaller of the gate's rect and the live collider). The trace file and the
 * demo id stay «mistake-wide-approach» (traces/clipReplay.ts, the template's
 * traceRef, the census pins key on them); only the shown text moved.
 */
export function scParkPerpRevMistakeWideScript(): DriveScript {
  const setup = { x: X_CLOSE, y: PR.setup.y, headingDeg: 0 };
  const swing = authoredDrive(
    setup,
    [
      straight(SWING.s0M),
      ...turn(Math.PI / 2, 1 / SWING.radiusM, SWING.rampInM, SWING.rampOutM),
      straight(3),
    ],
    -1,
  );
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешен подход: колата застава твърде близо до реда — на около метър от колите.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: FEEDER_END_Y }),
      ...leftSetUpMove(aisleTo(setup.x, setup.y), 9, aisleSEndY(setup.x)),
      { kind: "pause", sec: 1.2, brake: true },
      { kind: "annotation", textBg: "Оттук същият замах не се побира…" },
      { kind: "indicator", setting: "right" },
      ...LOOK_BEFORE_REVERSE,
      // The gear goes in after the looks, never on the instant of the last one
      // (so every look is heard before R on every display — grade-grid ROUND 8).
      { kind: "pause", sec: 0.4, brake: true },
      {
        kind: "drive",
        points: untilContact(swing.points, -1, NEIGHBOUR, "dret_90"),
        targetKmh: CREEP_KMH,
        reverse: true,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Задният калник закачи съседната кола. Правилно: започни на около два и половина метра от реда.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без наблюдение" (scripted consequence)
// ---------------------------------------------------------------------------

export function scParkPerpRevMistakeNoObservationScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво остава невидимо без огледала и поглед през рамо.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: TWO_STAGE_FROM_Y + 0.05 }, false),
      ...twoStageSteps(TS, 9, false),
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "indicator", setting: "right" },
      {
        kind: "annotation",
        textBg: "Задна предавка ВЕДНАГА — без огледала, без рамо. Това е грешката.",
      },
      {
        // Reverse blind along the start of the same swing; a pedestrian is
        // walking behind the car.
        kind: "drive",
        points: firstMetres(PR.a, 2.1),
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
      // The authored consequence: the unseen pedestrian is hit at reversing
      // speed — the rule engine grades it exactly like a physics contact.
      { kind: "collision", withWhat: "pedestrian" },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg:
          "Пешеходецът зад колата остана невидим до удара. Чл. 40: убеди се, че пътят зад теб е свободен, ПРЕДИ да потеглиш назад.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScParkPerpRevTraceName =
  | "shadow-correct"
  | "mistake-wide-approach"
  | "mistake-no-observation";

const SCRIPTS: Record<ScParkPerpRevTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scParkPerpRevShadowScript },
  "mistake-wide-approach": { kind: "mistake", script: scParkPerpRevMistakeWideScript },
  "mistake-no-observation": { kind: "mistake", script: scParkPerpRevMistakeNoObservationScript },
};

/**
 * Record one of the three P0 drives against a loaded lot-perp-v1 document —
 * obstacles armed from the district's own occupancy, collisionMinKmh 0 (the
 * parking threshold, doc 76 §0). Deterministic: same district → same trace.
 */
export function recordScParkPerpRevDrive(
  districtRaw: unknown,
  name: ScParkPerpRevTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_PERP_REV_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
