/**
 * sc-vu-child-cyclist — the authored drives (doc 76 §5/§9): ONE correct shadow
 * + TWO mistake demos for „Дете на колело лъкатуши" (VU-03 „Колелото завива
 * около дупка") on the vu-child-v1 residential street, recorded with the
 * template's OWN staged child (single truth, imported from the template). No
 * ambient traffic (seed 7).
 *
 * The trace gate replays exactly these through the production stack:
 *   - shadow: ZERO violations + YIELDED_TO_PRIORITY (the wide oncoming-bank
 *     line at ~5.4 m of air past the child's NEW line, committed only after the
 *     swerve has finished);
 *   - „Изпреварване точно в лъкатушенето" grades EXACTLY
 *     VULNERABLE_PASS_TOO_CLOSE + COLLISION;
 *   - „Тесен просвет покрай детето" grades EXACTLY VULNERABLE_PASS_TOO_CLOSE.
 *
 * GEOMETRY, pinned to content/world/vu-child-v1.json meta.scenario (the
 * vu-child district battery asserts every one of these against the map AND
 * against the runtime's own constants):
 *   · 300 m S→N street on x = 0, 1+1, residential, posted 30. Northbound lane
 *     center x = 4.0625, southbound x = −4.0625; no zones ⇒ no М1 span ⇒
 *     crossing the crown is free; no junctions ⇒ the pass adjudicates anywhere.
 *   · The child: staged at y = 45 on the curb line x = 6.6625, rolling a
 *     dead-constant 2.6 m/s from the first frame the player moves.
 *   · THE WOBBLE: at y = 100 he glides 2.0 m LEFT over 2.5 s (6.5 m of road),
 *     settling on x = 4.6625 — 0.6 m off the driver's own lane center.
 *
 * Lateral honesty (runtime VULNERABLE_PASS_* doc): every threshold is
 * CENTER-TO-CENTER; subtract the ~1.25 m body allowance for air.
 *   wide line  x −2.0  → 6.66 m centers ≈ 5.4 m air  (≥ 2.75 SAFE → yielded)
 *   nudge line x  2.31 → 2.35 m centers ≈ 1.1 m air  (< 2.45 CONVICT)
 *   squeeze    x  4.30 → 2.36 m centers ≈ 1.1 m air  (< 2.45 CONVICT)
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THE THREE DRIVES ARE SHAPED THE WAY THEY ARE — three runtime laws, not
 * three stylistic choices. Every one of them is asserted in the district
 * battery against the shipped constant, so a re-tune fails there, loudly,
 * instead of silently rotting these recordings:
 *
 * 1. THE SWERVE STAND-DOWN (VULNERABLE_PASS_SWERVE_M = 0.6). The tracker
 *    freezes the cyclist's line at ARM and DISCARDS the whole episode if he
 *    later drifts ≥ 0.6 m toward the player — „the margin the driver SET is
 *    what's graded, never the margin the cyclist consumed". This wobble is
 *    2.0 m. So NO pass may be armed while the swerve is still running: the arm
 *    window is `cyclist ahead 5.5–25 m, player > 15 km/h, closing ≥ 1 m/s`, and
 *    all three drives keep OUT of it until the glide has settled (the shadow
 *    and the first demo by hanging back at 11 km/h — under the 15 km/h arm
 *    floor, so the gap is irrelevant; the second demo by being 60 m past the
 *    child before the drain arrives). This is also exactly the backlog's own
 *    reading: „the tracker grades the pass distance against the WOBBLE APEX,
 *    not the curb line".
 *
 * 2. THE FOLLOW FLOOR (followMinSpeedKmh = 20). The child sits INSIDE
 *    leadGapFor's 4 m lead corridor on both squeeze lines, so at 20 km/h and up
 *    he reads as a zero-gap lead and FOLLOWING_TOO_CLOSE joins every verdict.
 *    Both demos therefore squeeze at 19 km/h — under the follow floor, still
 *    over the 15 km/h pass floor. That 5 km/h band is the entire authoring
 *    space, and it is why the child pedals 2.6 m/s and not 3.5: at 19 km/h vs
 *    3.5 m/s the closing rate is 1.8 m/s and a pass would not fit on the street.
 *    (The sc-vu-cyclist-group „narrow" demo's ruling, reused.)
 *
 * 3. THERE IS NO CONTACT IN EITHER DEMO, AND THERE NEVER WAS (corrected
 *    2026-08-10). This block used to read „THE CONTACT BAR IS THE DEMOS'
 *    DIVIDING LINE": cutInLeadCar's runner emitted a collision inside
 *    VEHICLE_CONTACT_M = 3.0 m, so the pass driven DURING the wobble billed two
 *    codes and the identical margin driven 60 m earlier billed one. The block
 *    even flagged its own smell — „the 3.0 m bar is the CAR body's, and the
 *    actor is a bike" — and then reasoned that shrinking it would leave „VU-03's
 *    опасна on contact with no home in the shipped stack".
 *
 *    The bar was not too big for a bike. It was an isotropic circle around two
 *    POINTS, which is not a contact test at any radius. Measured on the actor's
 *    real bodies — a 1.70 m car beside a 0.33 m child's bicycle at 2.35 m of
 *    centres — this pass leaves 1.33 m of air. Neither demo touches the child,
 *    the pair's asymmetry was an artefact, and both now bill the one code the
 *    driving is guilty of: VULNERABLE_PASS_TOO_CLOSE. „опасна on contact" has a
 *    home in the shipped stack — it is the drive that actually hits the child,
 *    and this template does not contain one.
 * ────────────────────────────────────────────────────────────────────────────
 */

import type { StagedEventSpec } from "../contracts";
import { SC_VU_CHILD_CYCLIST } from "../lessons/scenario/templates-vru2";
import {
  recordScriptedDrive,
  type DriveScript,
  type RecordedDrive,
  type RecordScriptedDriveOptions,
} from "./recorder";

export const SC_VU_CHILD_CYCLIST_ID = "sc-vu-child-cyclist";

/** vu-child-v1 northbound lane center (meta.scenario.laneCenterRightM). */
const LANE_X = 4.06;
/** The taught wide line — genuinely on the oncoming bank. */
const WIDE_X = -2.0;
/** The nudge line: 1.1 m of air past the child's POST-wobble line (x 4.6625). */
const NUDGE_X = 2.31;
/** The squeeze line: 1.1 m of air past the child's PRE-wobble curb line (6.6625). */
const SQUEEZE_X = 4.3;
/** Where the drives stop (the finish gate sits at y = 265, radius 8). */
const FINISH_Y = 268;

// ---------------------------------------------------------------------------
// The correct demonstration (shadow) — hang back at a walking pace, let the
// wobble happen in front of you, THEN one wide pass through the oncoming lane.
//
// TIMING (the numbers the drive is built on): the child rolls 2.6 m/s from
// y = 45 and reaches the drain at y = 100 around t ≈ 22 s; the glide settles by
// t ≈ 24.5 s. The player crawls at 11 km/h (3.05 m/s) — a hair over the child's
// 9.4, so the ~30 m gap barely closes — and 11 is under the tracker's 15 km/h
// arm floor, so no episode can even exist while the child is moving. That is
// the whole trick of this shadow: it is not „passing carefully", it is NOT
// PASSING until the child has shown you his line.
// ---------------------------------------------------------------------------

export function scVuChildCyclistShadowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Дете на велосипед пред теб. Не го подминавай — първо го прочети.",
      },
      { kind: "glance", mirror: "left" },
      // Crawl behind him. 11 km/h is not timidity: it is the speed at which the
      // stopping distance is shorter than the reaction you would need.
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [LANE_X, 88],
        ],
        targetKmh: 11,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Гледай предното колело. То казва накъде тръгва — преди самото дете да е решило.",
      },
      // THE WOBBLE happens here, ~20 m in front of the bumper. The correct
      // response is nothing dramatic: ease off and keep watching.
      {
        kind: "drive",
        points: [
          [LANE_X, 88],
          [LANE_X, 104],
        ],
        targetKmh: 9,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Ето го: два метра навътре, без мигач. Ти си отзад — просто отпускаш газта.",
      },
      { kind: "glance", mirror: "left" },
      { kind: "indicator", setting: "left" },
      // Out to the oncoming bank BEFORE closing: the child is on his new line
      // (x 4.6625) and the pass margin is measured from THERE. The excursion is
      // one continuous move — out, past, home — never a nudge.
      {
        kind: "drive",
        points: [
          [LANE_X, 104],
          [WIDE_X, 124],
          [WIDE_X, 200],
        ],
        targetKmh: 26,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Просветът се мери от НОВАТА му линия — и се удвоява, защото може да залитне пак.",
      },
      { kind: "glance", mirror: "right" },
      { kind: "indicator", setting: "right" },
      // Home only now: the child is fully in the mirror.
      {
        kind: "drive",
        points: [
          [WIDE_X, 200],
          [LANE_X, 222],
          [LANE_X, FINISH_Y],
        ],
        targetKmh: 26,
      },
      { kind: "indicator", setting: "off" },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg: "Назад, бавно, изчакай линията — и чак тогава една широка дъга. Това е чл. 42 при дете.",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 1 — „Изпреварване точно в лъкатушенето"
//        (VULNERABLE_PASS_TOO_CLOSE)
//
// The demo's honesty is that the FIRST half is the shadow's, verbatim: this
// driver hangs back at 11 km/h, watches the whole swerve, and is therefore the
// only person on the street who KNOWS the child does not hold a line. And then
// he passes him at a metre of air anyway — the width he would have left a
// parked car — because he measured the gap from the curb instead of from the
// child. The second wobble arrives while the car is beside him.
//   · The pass arms only after the glide has settled (crawling at 11 km/h is
//     under the 15 km/h arm floor), so the frozen line is the APEX and the
//     stand-down never triggers → the clearance is genuinely graded.
//   · The alongside window records ~2.35 m of centers → < 2.45 CONVICT and
//     above the contact bar (VULNERABLE_PASS_CONTACT_M, now the 1.25 m body
//     allowance) → VULNERABLE_PASS_TOO_CLOSE at pass completion.
//   · AND NOTHING ELSE. The same 2.35 m used to trip the cut-in runner's 3.0 m
//     circle and bill a COLLISION on top; measured on the real bodies (0.85 car
//     + 0.166 child's bicycle) it is 1.33 m of clear air, and the phantom is
//     gone (2026-08-10). Nobody was hit here; somebody was crowded.
//   · 19 km/h holds the whole pass under followMinSpeedKmh (20), so no FOLLOWING
//     code can pollute the verdict, while staying over the 15 km/h pass floor.
// ---------------------------------------------------------------------------

export function scVuChildCyclistMistakePassInWobbleScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Началото е правилно: водачът стои назад и вижда всичко.",
      },
      { kind: "glance", mirror: "left" },
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [LANE_X, 88],
        ],
        targetKmh: 11,
        stopAtEnd: false,
      },
      {
        kind: "drive",
        points: [
          [LANE_X, 88],
          [LANE_X, 104],
        ],
        targetKmh: 9,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Видя лъкатушенето. И реши, че вече знае какво ще прави детето.",
      },
      // THE NUDGE — a metre of air past a child he has just watched swerve two
      // metres. He does not even leave his own lane: 2.31 sits 1.75 m off the
      // lane center, well inside laneKeepMaxOffsetM (3.25), so nothing about
      // the car's line is illegal. Only the gap is.
      {
        kind: "drive",
        points: [
          [LANE_X, 104],
          [NUDGE_X, 120],
          [NUDGE_X, 180],
        ],
        targetKmh: 19,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Метър въздух — просветът за паркирана кола. Детето обаче не е паркирано.",
      },
      {
        kind: "drive",
        points: [
          [NUDGE_X, 180],
          [LANE_X, 200],
          [LANE_X, FINISH_Y],
        ],
        targetKmh: 19,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Просветът се мери от линията, на която детето Е, и се удвоява — защото може да я смени пак (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Mistake demo 2 — „Тесен просвет покрай детето" (VULNERABLE_PASS_TOO_CLOSE)
//
// The mirror image, and the reason both demos exist. This driver never waits
// for anything: he worms past the child at a metre of air while the child is
// still pedalling quietly along the curb, 60 m before the drain. And he GETS
// AWAY WITH IT — the swerve happens two seconds later, harmlessly, behind him.
// That is the whole point of putting this demo next to the one above: the act
// is identical, the margin is identical, and only the clock differs. The engine
// still bills him, because чл. 42 grades the gap you left, not the outcome you
// were handed.
//
// The single line that makes it exactly ONE code: the pass completes ~60 m
// before the child reaches the drain, so the cut has not fired and the runner's
// contact channel is not even running (see law 3 in the module header).
// ---------------------------------------------------------------------------

export function scVuChildCyclistMistakeNarrowScript(): DriveScript {
  return {
    steps: [
      {
        kind: "annotation",
        textBg: "Грешката: водачът не чака нищо — провира се покрай детето още в началото.",
      },
      { kind: "glance", mirror: "left" },
      // Straight onto the squeeze line and past him. 19 km/h keeps the follow
      // detector structurally off (< 20) and the pass floor live (> 15): the
      // only thing on this street that can grade is the metre of air.
      {
        kind: "drive",
        points: [
          [LANE_X, 15],
          [SQUEEZE_X, 26],
          [SQUEEZE_X, 95],
        ],
        targetKmh: 19,
        stopAtEnd: false,
      },
      {
        kind: "annotation",
        textBg: "Мина на една ръка от детето — и нищо не се случи. Този път.",
      },
      // Away. Behind him, at the drain, the child swings the two metres that
      // would have been the car's door — and the driver never learns it.
      {
        kind: "drive",
        points: [
          [SQUEEZE_X, 95],
          [LANE_X, 115],
          [LANE_X, FINISH_Y],
        ],
        targetKmh: 26,
      },
      { kind: "pause", sec: 1.5, brake: true },
      {
        kind: "annotation",
        textBg:
          "Метър до дете на колело не е дистанция, а залог. Достатъчно е онова, което оцелява едно залитане (чл. 42).",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Recording assembly (the tool/test entry)
// ---------------------------------------------------------------------------

export type ScVuChildCyclistTraceName =
  | "shadow-correct"
  | "mistake-pass-in-wobble"
  | "mistake-narrow";

const SCRIPTS: Record<
  ScVuChildCyclistTraceName,
  { kind: "shadow" | "mistake"; script: () => DriveScript }
> = {
  "shadow-correct": { kind: "shadow", script: scVuChildCyclistShadowScript },
  "mistake-pass-in-wobble": {
    kind: "mistake",
    script: scVuChildCyclistMistakePassInWobbleScript,
  },
  "mistake-narrow": { kind: "mistake", script: scVuChildCyclistMistakeNarrowScript },
};

/**
 * Record one of the three drives against a loaded vu-child-v1 document — the
 * TEMPLATE's staged child armed (single truth), ambient traffic zero (the
 * harness law). Deterministic: same district → same trace.
 */
export function recordScVuChildCyclistDrive(
  districtRaw: unknown,
  name: ScVuChildCyclistTraceName,
  extra?: Pick<RecordScriptedDriveOptions, "onTick">,
): RecordedDrive {
  const { kind, script } = SCRIPTS[name];
  return recordScriptedDrive(districtRaw, script(), {
    scenarioId: SC_VU_CHILD_CYCLIST_ID,
    kind,
    seed: 7,
    stagedEvents: [...(SC_VU_CHILD_CYCLIST.staged ?? [])] as StagedEventSpec[],
    ...(extra?.onTick ? { onTick: extra.onTick } : {}),
  });
}
