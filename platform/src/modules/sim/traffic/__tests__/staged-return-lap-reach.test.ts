/**
 * FR-B5-REACH (sc-follow-tailgater:41a625d1) — THE REFERENCE DRIVE OF A LESSON
 * HAS TO BE SURVIVABLE.
 *
 * THE FINDING, in the frame it was filed with
 * (`.audit-frames/wave-c/frames/sc-follow-tailgater__mobile-right/04-t111s.png`
 * and the identical `pc-right/08-debrief.png`): the CORRECT leg of „Лепка
 * отзад" ends with the ego motionless INSIDE another vehicle — windscreen full
 * of that car's interior geometry, cluster at 0 км/ч, the rear chip reading
 * «Кола отзад · 0 м» — and the sheet bills «-10 ИЗПИТНИ Т. · Удар в друго
 * превозно средство», една опасна грешка, НЕИЗДЪРЖАН. A student who did exactly
 * what the lesson asked is failed for an accident he did not have.
 *
 * WHAT IT ACTUALLY IS. `sc-ftg-tail` leaves its scripted pass under `cruise`
 * at `passSpeedMps` = 17 m/s, runs out of road, retires and RE-ENTERS
 * (FR-B5-RETURN) still carrying that command — and the player guard's window
 * was a fixed 16 m while a stopping distance is quadratic in speed. From 16 m
 * at `HOLD_DECEL_MPS2` the actor comes to rest at `16 − v²/16`, which is
 * −2.1 m at 17 m/s: it does not stop, it passes through his centre. Measured on
 * the build this test was written against, driving the taught response below:
 *
 *   before   `sc-ftg-tail` reaches 0.01 m of the player's centre at t = 58.3 s
 *            (nose-to-tail touch is 4.07 m), and again every ~35 s lap after
 *   after    6.00 m — the standoff the guard aims at — for the whole lesson
 *
 * The three tests are the three ways the repair could be wrong:
 *   1. the unscripted lap must not reach him (the finding itself),
 *   2. the SCRIPTED encounter must still happen at its authored лепка pose —
 *      a guard that simply keeps every car away has deleted the lesson,
 *   3. two actors queueing behind one stopped student must not come to rest
 *      inside each other (the residue test 1's clamp creates on its own).
 */
import { describe, expect, it } from "vitest";

import { compileScenario } from "../../lessons/scenario/compile";
import { SC_FOLLOW_TAILGATER } from "../../lessons/scenario/templates-following";
import { createScenarioDirector, lessonSeed } from "../../orchestrator";
import { loadDistrict } from "../../world/referents";
import { createTrafficSystem } from "../system";
import type { TrafficDistrict } from "../types";

const DT = 1 / 30;
/** ln-v1's northbound right-lane centre and `ln-spawn-start` (templates-following). */
const RIGHT = 12.19;
const START_Y = 15;
/** The `sc-ftg-finish` reachZone the card sends him to, y = 340 ± 12. */
const FINISH_Y = 344;
const LESSON_SEC = 210;
/** The lesson's two staged bodies. */
const LEAD = "sc-ftg-lead";
const TAIL = "sc-ftg-tail";
/**
 * Nose-to-tail touch between two cars, centre to centre: `PLAYER_HALF_LENGTH_M`
 * 2.02 + the car profile's 2.05 (the table in LessonScene's naming block). The
 * bar below sits a metre clear of it — the guard aims at 6 m and the test must
 * fail on a body that is merely CLOSE rather than only on one already inside.
 */
const TOUCH_M = 4.07;
const CLEAR_BAR_M = 5;

interface Run {
  /** Closest any staged body came to the player's centre, m. */
  readonly closestToPlayer: number;
  readonly closestId: string;
  readonly closestAtSec: number;
  /** Closest the two staged bodies came to each other, m. */
  readonly closestStagedPair: number;
  /** Did the лепка ever take its authored glued pose (~9 m of centres)? */
  readonly lepkaPosed: boolean;
}

/**
 * Drive the taught FO-07 response: calm 30 км/ч up the right lane to the
 * finish zone, then stand there. That is instructions 1–7 and the shadow's own
 * profile, and it is what the audit's „right" leg drives.
 */
function driveTheTaughtResponse(): Run {
  const lesson = compileScenario(SC_FOLLOW_TAILGATER, 1);
  const traffic = createTrafficSystem(loadDistrict("ln-v1") as TrafficDistrict, {
    anchor: { x: RIGHT, y: START_Y },
    anchorRadiusM: lesson.traffic?.anchorRadiusM ?? 400,
    vehicleCount: lesson.traffic?.vehicleCount ?? 0,
    pedestrianCount: 0,
  });
  const director = createScenarioDirector(lesson.stagedEvents ?? [], traffic, {
    seed: lessonSeed(lesson.id),
  });

  let t = 0;
  let py = START_Y;
  let closestToPlayer = Number.POSITIVE_INFINITY;
  let closestId = "";
  let closestAtSec = 0;
  let closestStagedPair = Number.POSITIVE_INFINITY;
  let lepkaPosed = false;

  while (t <= LESSON_SEC) {
    const kmh = py < FINISH_Y ? 30 : 0;
    py += (kmh / 3.6) * DT;
    traffic.update(DT, {
      signalPhase: () => "green",
      playerPos: { x: RIGHT, y: py },
      playerSpeedKmh: kmh,
      playerHeadingDeg: 0,
    });
    director.step({
      tSec: t,
      dtSec: DT,
      x: RIGHT,
      y: py,
      speedKmh: kmh,
      headingDeg: 0,
      brakePedal: kmh < 1 ? 1 : 0,
      tickEvents: [],
    });

    for (const id of [LEAD, TAIL]) {
      const a = traffic.staged(id);
      if (!a) continue;
      const d = Math.hypot(a.x - RIGHT, a.y - py);
      if (d < closestToPlayer) {
        closestToPlayer = d;
        closestId = id;
        closestAtSec = t;
      }
    }
    const lead = traffic.staged(LEAD);
    const tail = traffic.staged(TAIL);
    if (lead && tail) {
      const pair = Math.hypot(lead.x - tail.x, lead.y - tail.y);
      if (pair < closestStagedPair) closestStagedPair = pair;
      // The authored лепка pose: BEHIND him, ~9 m of centres ± jitter, while
      // the encounter is still running (before he reaches the finish zone).
      if (py < FINISH_Y && tail.y < py && py - tail.y < 12) lepkaPosed = true;
    }
    t += DT;
  }
  return { closestToPlayer, closestId, closestAtSec, closestStagedPair, lepkaPosed };
}

describe("FR-B5-REACH — an unscripted return lap may not drive through the student", () => {
  const run = driveTheTaughtResponse();

  it(
    "no staged body reaches the correctly-driven student",
    () => {
      expect(
        run.closestToPlayer,
        `${run.closestId} came within ${run.closestToPlayer.toFixed(2)} m of his centre at ` +
          `t=${run.closestAtSec.toFixed(1)} s (bodies touch at ${TOUCH_M} m). ` +
          "Measured at 0.01 m before FR-B5-REACH.",
      ).toBeGreaterThan(CLEAR_BAR_M);
    },
    120000,
  );

  it("…and the лепка still glues itself to his bumper, which is the lesson", () => {
    // The control half. A guard that kept every car 30 m away would pass the
    // test above and would have deleted „Лепка отзад" — the whole drill is a
    // car at metres behind him, and `playerGuard: false` is authored for it.
    expect(run.lepkaPosed, "sc-ftg-tail never took its glued pose behind him").toBe(true);
  });

  it("…and the two of them do not queue into each other behind him", () => {
    // Both actors aim at the same standoff once he has stopped, so without the
    // staged half of the clamp the second comes to rest inside the first: both
    // were measured at rest at y = 338.2, one car in the other, for 140 s.
    expect(
      run.closestStagedPair,
      `sc-ftg-lead and sc-ftg-tail came within ${run.closestStagedPair.toFixed(2)} m`,
    ).toBeGreaterThan(TOUCH_M);
  });
});
