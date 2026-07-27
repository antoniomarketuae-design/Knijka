/**
 * sc-merge-from-property — the authored drives (doc 76 §5/§9): ONE correct
 * shadow + TWO mistake demos for „Излизане от бензиностанция през тротоара"
 * (OV-15, ЗДвП чл. 25) on the committed mg-property-v1 district, recorded with
 * the template's OWN staged actors (the тротоар walker + the boulevard поток —
 * single truth, imported from the template).
 *
 * THE MAP IS THE SCRIPT (every number below is pinned from
 * content/world/mg-property-v1.json meta.scenario; the district battery
 * re-proves each against the runtime):
 *   - the exit lane runs WEST on y = 4.06 from the forecourt (x = 62);
 *   - the тротоар (mgp-x-walk) crosses it at x = 34;
 *   - the DERIVED Б2 line sits at x = 27.73 — INSIDE the тротоар, so the
 *     taught order is walk-band → знак → платно, and the two demos fail on
 *     two different beats;
 *   - the boulevard's northbound lane is x = 4.06; the exit node is the ORIGIN.
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + FULL_STOP_AT_STOP_SIGN + PEDESTRIAN_YIELDED —
 *     stopped short of the тротоар for the walker, waited her off the exit,
 *     crept to the Б2, made a real full stop, waited the whole поток out, and
 *     only then indicated right and joined;
 *   - „Изнасяне през тротоара без спиране" grades EXACTLY
 *     PEDESTRIAN_NOT_YIELDED + COLLISION (25 km/h — under the 30 km/h approach
 *     cap, so no too-fast code — and the drive ENDS at the contact, 6 m short
 *     of the Б2 line, so no stop-sign code can leak);
 *   - „Вливане „с мигача“ пред потока" grades EXACTLY FAILED_TO_YIELD (it does
 *     the walker beat correctly AND makes a real full stop at the Б2 AND
 *     indicates — its only fault is rolling over the line with the поток
 *     inside the runtime's 26 m conflict radius) — and it then CARRIES THE
 *     MERGE THROUGH at 28 km/h round the opened-out TURN_ARC, so the clip's
 *     four post-fault seconds show the car taking the boulevard rather than
 *     crawling down the exit lane (founder review 2026-07-27).
 *
 * THE COLUMN IS NOW A COLUMN. templates-merging MFP_STREAM was staging its
 * three cars on the SAME path arc (the runner clamps a follower's negative arc
 * to the path start), so „Три коли минаха" rendered as one car and the drill's
 * premise — a boulevard with no gap in it — was invisible. Its hold arc and
 * cumulative gaps now put 26 m between them. The number that carries the
 * grading is the TAIL's arc (0), which is unchanged: it is the car inside the
 * 26 m radius when this demo crosses the line at t = 23.48, and the car whose
 * exit at t ≈ 25.9 the shadow's 9 s wait is measured against.
 *
 * WHY THE TWO CARDS CANNOT BLUR (the tuning, stated so a script edit that
 * breaks it fails loudly rather than silently): the тротоар is 6.3 m OUTSIDE
 * the Б2 line. Demo 1 dies at x ≈ 34 and never reaches x = 27.73; demo 2
 * clears the walker before x = 34 and only then meets the line. One demo, one
 * thing to fix.
 */

import type { StagedEventSpec } from "../contracts";
import { SC_MERGE_FROM_PROPERTY } from "../lessons/scenario/templates-merging";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_MERGE_FROM_PROPERTY_ID = "sc-merge-from-property";

/** mg-property-v1 truths (meta.scenario — the L7 copy law). */
const Y_EXIT = 4.06; // the outbound exit-lane center (westbound, right half)
const X_SPAWN = 62; // mgp-spawn-forecourt
const X_WALK = 34; // mgp-x-walk — the тротоар band
const X_LINE = 27.73; // the DERIVED Б2 stop line on mgp-e-drive
const X_LANE = 4.06; // the boulevard's northbound lane center
const Y_FINISH = 120;

/** Where the taught drive rests for the walker — one car length short of the
 *  band, close enough to see along the pavement, far enough not to sit on it. */
const X_WALK_REST = 37.5;
/** …and where it rests for the поток: nose ON the Б2, never over it. */
const X_LINE_REST = 29;

/**
 * The right-turn arc off the exit into the northbound lane. Authored as a
 * polyline (the recorder does not lane-offset): west along y = 4.06, then a
 * corner sweeping 270° → 0°, which is the +90° the TurnDetector's 3 s window
 * reads as a right turn well inside the 40 m junction radius.
 *
 * OPENED OUT from the shipped ~9 m corner (founder review 2026-07-27, on the
 * „Вливане „с мигача“" reel: „this question must be completed because it is
 * stopping … the shadow car must continue … trying to get in the lane
 * infront"). The clip window is [fault − 8 s, fault + 4 s] and the fault is the
 * line crossing itself, so everything the student sees of the MERGE has to
 * happen in those four seconds. The recorder's curve cap ties speed to radius
 * (v ≤ √(2.4 r)), so the tight corner pinned the manoeuvre at ~13 km/h and the
 * clip ended with the car still crawling down the exit lane — the merge it was
 * being convicted for never appeared. At ~15 m of radius the same 90° is
 * drivable at ~20 km/h and the car is committed INTO the boulevard, in front of
 * the column, before the window closes. Geometry only: the graded act is the
 * line crossing, which happens 12 m earlier and is untouched.
 */
const TURN_ARC: ReadonlyArray<readonly [number, number]> = [
  [16, Y_EXIT],
  [11.4, 4.7],
  [7.7, 6.6],
  [5.3, 9.8],
  [X_LANE, 14],
  [X_LANE, 22],
];

// ---------------------------------------------------------------------------
// The correct demonstration (shadow)
// ---------------------------------------------------------------------------

export function scMergeFromPropertyShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Излизаш от бензиностанция. Пред теб има тротоар, велоалея и чак после булевардът — ти нямаш предимство пред нито едно от трите.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // Roll off the forecourt at a station's pace: 18 km/h is inside the exit's
      // own 20 km/h graced band (22) AND far under the 30 km/h crossing-approach
      // cap — this drill is never about speed.
      {
        kind: "drive",
        points: [
          [X_SPAWN, Y_EXIT],
          [48, Y_EXIT],
          [X_WALK_REST, Y_EXIT],
        ],
        targetKmh: 18,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Пешеходец по тротоара! Спираш ПРЕД банда — тротоарът е негов, ти го пресичаш (чл. 25, ал. 2)." },
      { kind: "glance", mirror: "right" },
      // Wait her fully off the exit's carriageway (~12.8 s of walk from the
      // release; the stop lands mid-walk, so the residue is shorter).
      { kind: "pause", sec: 10.5, brake: true },
      { kind: "annotation", textBg: "Освободи ли платното напълно? Чак тогава тръгваш — не „в гърба ѝ“." },
      { kind: "glance", mirror: "left" },
      // Creep over the cleared band to the Б2 at the mouth and STOP on it.
      {
        kind: "drive",
        points: [
          [X_WALK_REST, Y_EXIT],
          [X_WALK, Y_EXIT],
          [X_LINE_REST, Y_EXIT],
        ],
        targetKmh: 12,
        stopAtEnd: true,
      },
      { kind: "annotation", textBg: "Знакът Б2 на изхода: пълно спиране. Оттук нататък решава потокът по булеварда, не мигачът ти." },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // THE WAIT. Sit on the line until the whole поток has gone by — this is
      // the beat the entire template exists for, and the ONE number that must
      // not be trimmed: the last car of the column leaves the runtime's 26 m
      // conflict radius at t ≈ 25.9, and this pause puts the line crossing at
      // t ≈ 30.9. Cut it and the shadow silently becomes the mistake.
      { kind: "pause", sec: 9.0, brake: true },
      { kind: "annotation", textBg: "Три коли минаха. Пролуката е ЗАД тях — тя е твоята, а не тази „между“ тях." },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "right" },
      // Over the line with the boulevard genuinely empty, then the corner.
      {
        kind: "drive",
        points: [
          [X_LINE_REST, Y_EXIT],
          [X_LINE, Y_EXIT],
          ...TURN_ARC,
        ],
        targetKmh: 14,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      { kind: "annotation", textBg: "Мигачът се изключва, скоростта се изравнява с потока. Излизането от имот свърши — вече си част от движението." },
      {
        kind: "drive",
        points: [
          [X_LANE, 22],
          [X_LANE, 70],
          [X_LANE, Y_FINISH],
        ],
        targetKmh: 45,
      },
      { kind: "pause", sec: 1.5, brake: true },
      { kind: "annotation", textBg: "Точно така: пешеходецът, после знакът, после потокът. Три пропускания — и нито един спрял заради теб." },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изнасяне през тротоара без спиране"
//                  (PEDESTRIAN_NOT_YIELDED + COLLISION)
// ---------------------------------------------------------------------------

export function scMergeFromPropertyMistakeWalkThroughScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: погледът е вече на булеварда — търси пролука, а между него и колата има тротоар.",
      },
      { kind: "glance", mirror: "left" },
      // The SAME 18 km/h roll-off as the shadow's, deliberately: this demo is
      // not about speed (it is inside the exit's graced band and half the
      // crossing-approach cap) and not about braking ability. It is about a
      // duty the driver never looked for. Identical approach ⇒ the walker's
      // seeded trigger fires at the same metre as the shadow's, so the ONLY
      // difference between the two drives is the decision.
      {
        kind: "drive",
        points: [
          [X_SPAWN, Y_EXIT],
          [44, Y_EXIT],
          [35, Y_EXIT],
        ],
        targetKmh: 18,
        stopAtEnd: false,
      },
      // The authored consequence: the walker is struck ON the тротоар band.
      { kind: "collision", withWhat: "pedestrian" },
      // …and the car carries ON over the band. This second step is not
      // decoration: crossingPassed — and therefore the whole
      // PEDESTRIAN_NOT_YIELDED chain — fires only when the car's position
      // passes the crossing POINT (x = 34), so a demo that stops ON the band
      // grades the contact and stays silent about the duty. It rests at x = 31,
      // still 3.3 m clear of the Б2 line, so no stop-sign code can leak either.
      {
        kind: "drive",
        points: [
          [35, Y_EXIT],
          [31, Y_EXIT],
        ],
        targetKmh: 18,
        stopAtEnd: true,
      },
      { kind: "pause", sec: 2.0, brake: true },
      {
        kind: "annotation",
        textBg: "Пешеходецът по тротоара е с предимство винаги. Излизането от имот е маневра — ти се съобразяваш с всички, а не те с теб.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Вливане „с мигача“ пред потока" (FAILED_TO_YIELD)
// ---------------------------------------------------------------------------

export function scMergeFromPropertyMistakeSignalAndGoScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: „подадох мигач, значи ме пуснаха“. Тук всичко до знака е направено правилно — и после следва едно решение.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "glance", mirror: "right" },
      // The walker beat, done exactly like the shadow: this demo must never
      // leak a pedestrian code — its whole point is that the driver was good
      // right up to the line.
      {
        kind: "drive",
        points: [
          [X_SPAWN, Y_EXIT],
          [48, Y_EXIT],
          [X_WALK_REST, Y_EXIT],
        ],
        targetKmh: 18,
        stopAtEnd: true,
      },
      { kind: "glance", mirror: "right" },
      { kind: "pause", sec: 10.5, brake: true },
      { kind: "annotation", textBg: "Пешеходецът мина. Дотук — учебникарски." },
      {
        kind: "drive",
        points: [
          [X_WALK_REST, Y_EXIT],
          [X_WALK, Y_EXIT],
          [X_LINE_REST, Y_EXIT],
        ],
        targetKmh: 12,
        stopAtEnd: true,
      },
      // A REAL full stop on the Б2 — inside stopRecencySec of the crossing, so
      // the sign itself is honoured and cannot leak a code.
      { kind: "pause", sec: 1.6, brake: true },
      // …and he DID look. This glance is the card's whole point and must not be
      // trimmed as decoration: the fault being taught is not „не погледна", it
      // is „погледна, видя ги, и тръгна, защото светна мигач". A demo that
      // skipped the look would teach observation instead — a different lesson,
      // already covered elsewhere — and would let the reader believe чл. 25 is
      // about eyesight rather than about priority.
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "right" },
      { kind: "annotation", textBg: "Мигачът светва — и колата тръгва в същата секунда. Но потокът е там." },
      // …and straight over the line into the поток's 26 m conflict radius —
      // and THROUGH, not half-way. 28 km/h is the „вече съм част от движението"
      // pace this driver believes his indicator bought him; the curve cap holds
      // the corner itself to ~20 km/h, so the four seconds the clip has after
      // the fault carry the car off the exit and into the boulevard IN FRONT of
      // the column (founder review: the manoeuvre has to be completed, not
      // abandoned mid-exit). Speed changes nothing about the verdict — the
      // crossing-approach cap is 30 km/h and the give-way adjudication reads the
      // conflict, not the pace.
      {
        kind: "drive",
        points: [
          [X_LINE_REST, Y_EXIT],
          [X_LINE, Y_EXIT],
          ...TURN_ARC,
        ],
        targetKmh: 28,
        stopAtEnd: false,
      },
      { kind: "indicator", setting: "off" },
      {
        kind: "drive",
        points: [
          [X_LANE, 22],
          [X_LANE, 70],
          [X_LANE, Y_FINISH],
        ],
        targetKmh: 45,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Стигна закъдето тръгна — но накара движещите се по булеварда да се съобразят с теб. Мигачът обявява намерение, не създава предимство (чл. 25).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScMergeFromPropertyTraceName =
  | "shadow-correct"
  | "mistake-walk-through"
  | "mistake-signal-and-go";

const SCRIPTS: Record<
  ScMergeFromPropertyTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scMergeFromPropertyShadowScript },
  "mistake-walk-through": { kind: "mistake", script: scMergeFromPropertyMistakeWalkThroughScript },
  "mistake-signal-and-go": { kind: "mistake", script: scMergeFromPropertyMistakeSignalAndGoScript },
};

/**
 * Record one of the three drives against a loaded mg-property-v1 document —
 * the TEMPLATE's own staged actors armed (single truth), ambient traffic zero,
 * contacts graded from 0 km/h (a station exit is a creep: a 3 km/h nudge into
 * a pedestrian IS the graded mistake). Deterministic: same district → same
 * trace.
 */
export function recordScMergeFromPropertyDrive(
  districtRaw: unknown,
  name: ScMergeFromPropertyTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_MERGE_FROM_PROPERTY_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_MERGE_FROM_PROPERTY.staged ?? [])] as StagedEventSpec[],
    collisionMinKmh: 0,
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
