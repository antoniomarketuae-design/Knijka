/**
 * sc-park-narrow — authored drives (S2-A): ONE correct shadow + TWO mistake
 * demos for „Тясно гнездо" on the committed lot-narrow-v1 district. The
 * scripts are the SOURCE of the committed traces under
 * content/traces/sc-park-narrow/ (§5 zero-violation shadow, §9 exact codes).
 *
 * Geometry pinned to content/world/lot-narrow-v1.json:
 *   aisle centerline x = 0 (northbound), drawn lane center x = +4.0625;
 *   perpendicular row on the EAST side at 2.5 m pitch: bays at x = 5.03, the
 *   parked cars' noses at x ≈ 2.78;
 *   target bay lot-bay-3 center (5.03, 0), axis east-west (headingDeg 90);
 *   BOTH direct neighbors occupied (bay-2/4 at y = ∓2.5 — car flanks at
 *   |y| = 1.6, i.e. 0.75 m clearance for the 1.7 m hero at rest);
 *   spawn lot-spawn-approach (4.06, −105) heading north.
 *
 * THE TEACHING POINT, AS THE CAR CAN DRIVE IT (catalogue-demo-curvature:
 * dae908c7, family «curvpark2», integrator ruling R1(a), 2026-11-05). This
 * drill used to teach a «steeper» swing — a 3.0 m polyline arc, tighter than
 * the car's own circle (3.955 m kinematic, ≈ 4.17 m on the physics car): no
 * product car turns steeper in a narrow bay than in a wide one, and on the
 * live scene's colliders that demo touched the south neighbour (−0.014 m). The
 * car's swing is the same in every bay. What changes in a 2.5 m bay is WHERE
 * it starts: the further out the swing begins, the straighter the tail goes in
 * between the two neighbours (measured on the committed demos: 26° off the
 * bay axis when the tail reaches the noses, against 39° in the 2.7 m bay of
 * sc-park-perp-rev, and 62° where the habit below meets the neighbour), so
 * the setup is further from the row — x = −1.6, the car's right side ≈ 3.5 m
 * off the noses (the wide bay's ≈ 2.4 m plus a metre) — and the wheel comes
 * back over a long 3.5 m ramp, at a creep, with both mirrors. The
 * wide-bay habit of a setup a metre off the row is the mistake: the same swing
 * from there puts the rear quarter into the neighbour the car has just passed.
 *
 * Every drive is cut from the parking kit (./parkKit) on the 4.6 m drivable
 * circle (./drivablePath) and pinned in
 * traces/__tests__/park-family-drivable.test.ts. The setup stays inside the
 * template's Задача 1 marker (0.9, 5.8) by less than its radius − 2 (R9(b)).
 * The aisle north of the approach is the unpainted `service` class, so no lane
 * detector arms on it; reverse is exempt by A12 law.
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
import type { DriveScript, RecordedDrive, RecordScriptedDriveOptions } from "./recorder";
import { recordScriptedDrive } from "./recorder";

export const SC_PARK_NARROW_ID = "sc-park-narrow";

/** Target bay center (lot-bay-3 of lot-narrow-v1). */
const BAY = { x: 5.03, y: 0 };
/** The setup line: the car's right side ≈ 3.5 m off the noses (see header). */
const X_SETUP = -1.6;
/** The swing: straight back 0.5 m, wound on over 1.5 m, held, unwound over 3.5 m. */
const SWING = { radiusM: DRIVABLE_MIN_CENTRE_RADIUS_M, s0M: 0.5, rampInM: 1.5, rampOutM: 3.5 };
const NR: BayReverse = bayReverse(1, X_SETUP, BAY, SWING);
/** The wide bay's habit: a metre off the noses (the old line). */
const X_CLOSE = 0.9;
/** The neighbour the habit clips: lot-bay-4 at (5.03, 2.5), a dret_90 in the live scene. */
const NEIGHBOUR = parkedRect(5.03, 2.5, 90);

/**
 * THE AISLE'S LEFT HALF, ONLY AS THE MANOEUVRE'S START (lane curvpark2 round
 * 4, integrator rulings CP2-1bis / CP2-1ter, 2026-11-08) — sc-park-perp-rev's
 * reading (see its note), here for a setup 1.6 m left of the aisle centre line.
 * ЗДвП чл. 35, ал. 2 lets the turn BEGIN from another part of the carriageway,
 * the driver letting through the vehicles passing on the right; the radius, as
 * ruled, is the drivable programme's with the demo floor: no reverse begun with
 * the car wholly right of the centre line enters this 2.5 m bay on the 4.6 m
 * circle keeping ≥ 0.25 m (at FULL lock wound at rest one does, 0.003 m off
 * the neighbour — a recorded fact, park-family-limit.test.ts). And the car
 * stays in the right half as long as the geometry allows (round 5, integrator
 * ruling CP2-1quater): the TWO-STAGE set-up (parkKit `twoStageSetUp`) — S1
 * from the drawn lane centre onto the right-half line x = XM before the row,
 * that line past the row, S2 onto the setup line ending AT the setup stop — so
 * the car's centre is left of the centre line only for S2's tail, ≈ 5.35 m
 * before the reverse (round 4: one late S, 12.36 m; round 3: 17.46 m). Pinned,
 * with the minimum re-derived over every right-half line, in
 * park-family-drivable.
 */
/** The right-half line past the row (sc-park-perp-rev's XM, and its reason): 0.2 m inside the floor's line (≈ 1.42). */
const XM = 1.2;
const TS = twoStageSetUp(XM, NR.setup.x, NR.setup.y);

/** Geometry the drivability pin reads (traces/__tests__/park-family-drivable.test.ts). */
export const SC_PARK_NARROW_GEOMETRY = {
  radiusM: SWING.radiusM,
  setup: { ...NR.setup },
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

export function scParkNarrowShadowScript(): DriveScript {
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
              "Тясното място е вдясно, но замахът започва отляво: щом лявата половина е свободна напред, огледай се и се отмести там с ляв мигач.",
          },
        ],
      }),
      {
        kind: "annotation",
        textBg:
          "Подмини мястото и спри, щом задната броня подмине съседната кола — на около три и половина метра от предниците на колите.",
      },
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg:
          "Десен мигач, огледала и рамо — пропусни всеки, който минава отдясно. Замахът е същият като на широкото място, но започва по-отдалеч — така задницата влиза между колите по-изправена.",
      },
      { kind: "indicator", setting: "right" },
      ...LOOK_BEFORE_REVERSE,
      // The gear goes in after the looks, never on the instant of the last one
      // (so every look is heard before R on every display — grade-grid ROUND 8).
      { kind: "pause", sec: 0.4, brake: true },
      { kind: "drive", points: withRunOut(NR.a.points), targetKmh: REVERSE_KMH, reverse: true },
      { kind: "annotation", textBg: "Спри на половината завой и погледни в двете огледала — тук грешката се мери в сантиметри." },
      { kind: "pause", sec: 1.0, brake: true },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      { kind: "glance", mirror: "rear" },
      { kind: "annotation", textBg: "Сантиметри са: следи двете коли в огледалата и изправи волана." },
      { kind: "drive", points: withRunOut(NR.b.points), targetKmh: CREEP_KMH, reverse: true },
      ...SETTLE,
      { kind: "annotation", textBg: "Готово: точно между линиите, колата е в покой." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — the setup taken too close (trace «mistake-wide-swing»)
// ---------------------------------------------------------------------------

/**
 * RE-TAUGHT (integrator rulings R1(a) and CP2-2). The habit of the setup taken
 * too close — a metre off the noses, the old setup line — and the same swing:
 * the rear quarter meets the neighbour the car has just passed before the car
 * is straight, cut where that contact has happened (parkKit `untilContact`, on
 * the smaller of the gate's rect and the live collider). It is a mistake in
 * EITHER bay: sc-park-perp-rev's own «mistake-wide-approach» shows the same
 * setup failing in the 2.7 m bay, after 4.64 m of reverse and 54° off the
 * bay's axis; here it fails sooner (3.47 m) and more askew (62°) — measured on
 * the committed traces and pinned in park-family-drivable. The trace file keeps
 * its name.
 */
export function scParkNarrowMistakeWideSwingScript(): DriveScript {
  const setup = { x: X_CLOSE, y: NR.setup.y, headingDeg: 0 };
  const swing = authoredDrive(
    setup,
    [straight(SWING.s0M), ...turn(Math.PI / 2, 1 / SWING.radiusM, SWING.rampInM, SWING.rampOutM), straight(3)],
    -1,
  );
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Гледай какво прави в тясното гнездо подход на метър от колите — твърде близо дори за широкото място.",
      },
      { kind: "glance", mirror: "rear" },
      ...lotApproach({ x: X_LANE, y: FEEDER_END_Y }),
      ...leftSetUpMove(aisleTo(setup.x, setup.y), 9, aisleSEndY(setup.x)),
      { kind: "pause", sec: 1.2, brake: true },
      {
        kind: "annotation",
        textBg: "Същият замах, но започнат на метър от колите…",
      },
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
        textBg:
          "Задният калник закачи съседната кола: от метър колата е още силно накосо, когато задницата стигне колите. В тясното гнездо започваш по-отдалеч — бавно, с око в двете огледала.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Заден ход без наблюдение" (scripted consequence)
// ---------------------------------------------------------------------------

export function scParkNarrowMistakeNoObservationScript(): DriveScript {
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
        points: firstMetres(NR.a, 2.0),
        targetKmh: 4,
        reverse: true,
        stopAtEnd: false,
      },
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

export type ScParkNarrowTraceName =
  | "shadow-correct"
  | "mistake-wide-swing"
  | "mistake-no-observation";

const SCRIPTS: Record<ScParkNarrowTraceName, { kind: "shadow" | "mistake"; script: () => DriveScript }> = {
  "shadow-correct": { kind: "shadow", script: scParkNarrowShadowScript },
  "mistake-wide-swing": { kind: "mistake", script: scParkNarrowMistakeWideSwingScript },
  "mistake-no-observation": { kind: "mistake", script: scParkNarrowMistakeNoObservationScript },
};

/**
 * Record one of the three drives against a loaded lot-narrow-v1 document —
 * parked-car obstacles armed at the parking threshold. Deterministic.
 */
export function recordScParkNarrowDrive(
  districtRaw: unknown,
  name: ScParkNarrowTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_PARK_NARROW_ID,
    kind,
    seed: 7,
    obstacles: lotObstacleRects(districtRaw),
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
