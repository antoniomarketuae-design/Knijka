/**
 * THE BAND'S INNER EDGE — where the work site stops and the margin begins.
 *
 * WHAT THIS FILE IS ABOUT. C7 (`FINISH_OUTSIDE_STUCK_S`) gave an "outside"
 * finish the standstill face it shipped without: a car that STOPS in the band
 * between „you were here" and „you have left" has no exit, so after 75 s the
 * drive is closed where it stands. It read the band as everything past
 * `armWithinM`, i.e. it assumed the ARMING CIRCLE IS THE WORK SITE.
 *
 * That is true of a `passSignal` (arm = the acceptance ring, a circle
 * CONTAINING the junction) and of a `roundabout` (arm = `enterRadiusM`, a
 * circle containing the ring). It is FALSE of the third shape: a
 * `threePointTurn`'s arm is `Math.min(halfWidthM, halfLengthM)` — the circle
 * INSCRIBED in the corridor. Everything between the inscribed and the
 * circumscribed circle is AUTHORED CORRIDOR that C7 read as margin, so a
 * student who paused inside the box he was told to turn in had his lesson
 * closed for him at 75 s. Doc 88 §4 N3 measured exactly that and named the
 * sentence it refutes: „the arming circle's interior is untouched, so B1 holds
 * exactly as written".
 *
 * BOTH DIRECTIONS ARE PINNED HERE, on the SHIPPED lessons rather than on
 * hand-built shapes, because either one alone is the other crime:
 *   · a pose INSIDE the authored corridor must never end a drive — the false
 *     refusal N3 found, and the founder's own complaint in miniature (the
 *     engine closing a lesson on a student doing what it asked);
 *   · a pose genuinely in the margin must STILL end at 75 s — otherwise the
 *     fix is not a fix, it is C7 switched off, and the trapped student it was
 *     written for is back;
 *   · `passSignal`'s 41–47 m closure must be BIT-IDENTICAL — that is the one
 *     ending C7 actually bought and it may not be paid back.
 *
 * The catalogue ratchet at the bottom is what stops the NEXT authored turn box
 * reinventing this: it is a statement about the shape, not about the two
 * drills that happen to exist today.
 */

import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  FINISH_OUTSIDE_ANNULUS_M,
  FINISH_OUTSIDE_STUCK_S,
  routeFinishZone,
  strandedBeyondM,
  terminalRescueZone,
  yieldReasonAt,
  YIELD_ROUNDABOUT_APPROACH_M,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { ObjectiveParams, RouteFinishZone } from "../types";
import { makeTick } from "./fixtures";

// ---------------------------------------------------------------------------
// The shipped catalogue, compiled — never a hand-built shape for the geometry
// ---------------------------------------------------------------------------

interface Rung {
  id: string;
  level: ScenarioLevel;
  params: ObjectiveParams[];
}

/**
 * Every rung that compiles, and the id of every template that does not.
 *
 * The skip list is NOT a convenience: eight lanes edit this catalogue at once,
 * and a census that swallowed a compile error would quietly shrink its own
 * coverage and still report „0 problems" — the exact instrument failure this
 * programme has shipped four times, always in the reassuring direction. So the
 * failures are carried out of here and the zone TOTAL is asserted below: if a
 * template that produces an "outside" zone stops compiling, the count drops
 * and the assertion names the template rather than passing on a smaller world.
 */
function compileAllRungs(): { rungs: Rung[]; failed: string[] } {
  const rungs: Rung[] = [];
  const failed: string[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    for (const { level } of t.levels) {
      let lesson;
      try {
        lesson = compileScenario(t, level);
      } catch (e) {
        failed.push(`${t.id}@L${level}: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }
      rungs.push({
        id: t.id,
        level,
        params: lesson.objectives.map((o) => parseObjectiveParams(o)),
      });
    }
  }
  return { rungs, failed };
}

const { rungs: RUNGS, failed: COMPILE_FAILURES } = compileAllRungs();

/** Both "outside" zones a rung hands out (they are the same shape by design). */
function outsideZones(r: Rung): RouteFinishZone[] {
  return [routeFinishZone(r.params), terminalRescueZone(r.params)].filter(
    (z): z is RouteFinishZone => z !== null && z.mode === "outside",
  );
}

function terminalOf(r: Rung): ObjectiveParams {
  return r.params[r.params.length - 1];
}

function rung(id: string, level: ScenarioLevel): Rung {
  const found = RUNGS.find((r) => r.id === id && r.level === level);
  if (found === undefined) throw new Error(`no such rung: ${id}@L${level}`);
  return found;
}

// ---------------------------------------------------------------------------
// DRIVEN — the two turn drills, through the real engine
// ---------------------------------------------------------------------------

/**
 * Drive into the corridor (which is what ARMS the gate — you cannot leave
 * somewhere you never reached), then rest at `hold` for `restSec`.
 *
 * Deliberately at 5 km/h: below the drills' own approach cap, so nothing the
 * rule engine grades can end the session for an unrelated reason and steal the
 * assertion. The only thing that can stop this drive is a finish gate.
 */
function driveIntoBoxThenRest(
  r: Rung,
  centre: { x: number; y: number },
  hold: { x: number; y: number },
  restSec: number,
): { ended: boolean; endedAtSec: number | null; restStartedAtSec: number } {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === r.id)!;
  const lesson = compileScenario(template, r.level);
  const DT = 0.25;
  const ticks: SimTick[] = [];
  let t = 0;

  // 40 m of approach, ending ON the corridor centre: the arming evidence.
  const from = { x: centre.x, y: centre.y - 40 };
  for (let s = 0; s <= 1; s += DT / 8) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: { x: from.x + (centre.x - from.x) * s, y: from.y + (centre.y - from.y) * s },
      }),
    );
    t += DT;
  }
  // Creep to the hold pose, then stop dead on it.
  for (let s = 0; s <= 1; s += DT / 4) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: { x: centre.x + (hold.x - centre.x) * s, y: centre.y + (hold.y - centre.y) * s },
      }),
    );
    t += DT;
  }
  const restStartedAtSec = t;
  for (let s = 0; s < restSec; s += DT) {
    ticks.push(makeTick({ t, speedKmh: 0, position: hold }));
    t += DT;
  }

  let state = createLessonSession(lesson);
  for (const tick of ticks) {
    state = applyTick(state, tick).state;
    if (state.phase !== "driving") break;
  }
  return {
    ended: state.phase !== "driving",
    endedAtSec: state.endedAtSec ?? null,
    restStartedAtSec,
  };
}

/** The corridor of a `threePointTurn` terminal, with its two circles. */
function corridorOf(r: Rung): {
  centre: { x: number; y: number };
  halfWidthM: number;
  halfLengthM: number;
  circumM: number;
} {
  const p = terminalOf(r);
  if (p.kind !== "completeManeuver" || p.maneuver !== "threePointTurn") {
    throw new Error(`${r.id}@L${r.level} does not end on a turn box`);
  }
  const c = p.corridor;
  return {
    centre: { x: c.x, y: c.y },
    halfWidthM: c.halfWidthM,
    halfLengthM: c.halfLengthM,
    circumM: Math.hypot(c.halfWidthM, c.halfLengthM),
  };
}

describe("a student paused INSIDE the manoeuvre box keeps his lesson", () => {
  // The two poses doc 88 §4 N3 measured, recomputed from the compiled
  // corridors rather than copied, so a re-authored box moves the test with it.
  it("sc-maneuver-3point@L1 — 200 s at (0, 71.5), inside an 8 × 12 corridor", () => {
    const r = rung("sc-maneuver-3point", 1);
    const box = corridorOf(r);
    const hold = { x: box.centre.x, y: box.centre.y + 11.5 };

    // The pose is INSIDE the authored rectangle, on both axes — that is the
    // whole claim, and it is asserted rather than assumed.
    expect(Math.abs(hold.x - box.centre.x)).toBeLessThanOrEqual(box.halfWidthM);
    expect(Math.abs(hold.y - box.centre.y)).toBeLessThanOrEqual(box.halfLengthM);
    // …and it is past the ARM, which is why C7 used to read it as margin.
    const zone = outsideZones(r)[0];
    expect(Math.hypot(hold.x - box.centre.x, hold.y - box.centre.y)).toBeGreaterThan(
      zone.armWithinM ?? zone.radiusM,
    );

    const out = driveIntoBoxThenRest(r, box.centre, hold, 200);
    expect(out.ended).toBe(false);
    expect(out.endedAtSec).toBeNull();
  });

  it("sc-maneuver-uturn@L1 — 200 s at (14.5, 76), inside a 15 × 14 corridor", () => {
    const r = rung("sc-maneuver-uturn", 1);
    const box = corridorOf(r);
    const hold = { x: box.centre.x + 14.5, y: box.centre.y };

    expect(Math.abs(hold.x - box.centre.x)).toBeLessThanOrEqual(box.halfWidthM);
    expect(Math.abs(hold.y - box.centre.y)).toBeLessThanOrEqual(box.halfLengthM);
    const zone = outsideZones(r)[0];
    expect(Math.hypot(hold.x - box.centre.x, hold.y - box.centre.y)).toBeGreaterThan(
      zone.armWithinM ?? zone.radiusM,
    );

    const out = driveIntoBoxThenRest(r, box.centre, hold, 200);
    expect(out.ended).toBe(false);
    expect(out.endedAtSec).toBeNull();
  });
});

describe("…and a student stopped in the MARGIN is still let out", () => {
  // The other direction, on the same two lessons. If only the tests above
  // existed, deleting the stranded face entirely would pass them — and that is
  // the trapped student C7 was written for, put back.
  it("sc-maneuver-3point@L1 — resting one lane clear of the box ends at 75 s", () => {
    const r = rung("sc-maneuver-3point", 1);
    const box = corridorOf(r);
    const zone = outsideZones(r)[0];
    // Strictly between the box's outer bound and the departure circle: this is
    // the margin, and it is nowhere the lesson ever asks the student to be.
    const dM = (box.circumM + zone.radiusM) / 2;
    expect(dM).toBeGreaterThan(box.circumM);
    expect(dM).toBeLessThan(zone.radiusM);
    const hold = { x: box.centre.x, y: box.centre.y + dM };
    expect(Math.abs(hold.y - box.centre.y)).toBeGreaterThan(box.halfLengthM); // outside the box

    const out = driveIntoBoxThenRest(r, box.centre, hold, 200);
    expect(out.ended).toBe(true);
    // Within one tick of the bar, measured from the frame the car stopped.
    expect(out.endedAtSec! - out.restStartedAtSec).toBeGreaterThanOrEqual(
      FINISH_OUTSIDE_STUCK_S - 1,
    );
    expect(out.endedAtSec! - out.restStartedAtSec).toBeLessThanOrEqual(
      FINISH_OUTSIDE_STUCK_S + 1,
    );
  });

  it("sc-maneuver-uturn@L1 — the same, on the wider corridor", () => {
    const r = rung("sc-maneuver-uturn", 1);
    const box = corridorOf(r);
    const zone = outsideZones(r)[0];
    const dM = (box.circumM + zone.radiusM) / 2;
    const hold = { x: box.centre.x + dM, y: box.centre.y };
    expect(Math.abs(hold.x - box.centre.x)).toBeGreaterThan(box.halfWidthM);

    const out = driveIntoBoxThenRest(r, box.centre, hold, 200);
    expect(out.ended).toBe(true);
    expect(out.endedAtSec! - out.restStartedAtSec).toBeGreaterThanOrEqual(
      FINISH_OUTSIDE_STUCK_S - 1,
    );
  });
});

// ---------------------------------------------------------------------------
// C7 IS NOT BEING PAID BACK
// ---------------------------------------------------------------------------

describe("the passSignal closure C7 bought is bit-identical", () => {
  it("every passSignal zone in the catalogue keeps its inner edge at the arm", () => {
    const rows = RUNGS.flatMap((r) =>
      terminalOf(r).kind === "passSignal" ? outsideZones(r) : [],
    );
    // The catalogue's only passSignal TERMINAL is sc-sig-green-wave L1–L5, and
    // it hands out two zones per rung (routeFinishZone + terminalRescueZone).
    expect(rows.length).toBe(10);
    for (const z of rows) {
      const arm = z.armWithinM ?? z.radiusM;
      expect(strandedBeyondM(z)).toBe(arm);
      expect(z.radiusM - arm).toBe(FINISH_OUTSIDE_ANNULUS_M);
    }
  });
});

// ---------------------------------------------------------------------------
// THE RATCHET — a statement about the SHAPE, so the next box cannot lose it
// ---------------------------------------------------------------------------

describe("no pose inside an authored work site can ever be in the band", () => {
  it("every turn box in the catalogue: the band starts at or past its circumradius", () => {
    let checked = 0;
    for (const r of RUNGS) {
      const p = terminalOf(r);
      if (p.kind !== "completeManeuver" || p.maneuver !== "threePointTurn") continue;
      const circumM = Math.hypot(p.corridor.halfWidthM, p.corridor.halfLengthM);
      for (const z of outsideZones(r)) {
        checked++;
        // The circumscribed circle is the rectangle's outer bound, so a band
        // that starts at or beyond it cannot contain a pose inside the box.
        expect(strandedBeyondM(z)).toBeGreaterThanOrEqual(circumM - 1e-9);
      }
    }
    // 20 authored turn-box rungs × 2 zones each — a floor, not an equality, so
    // authoring another drill does not have to touch this number.
    expect(checked).toBeGreaterThanOrEqual(40);
  });

  it("the band is never wider than the margin, and never narrower than nothing", () => {
    let checked = 0;
    for (const r of RUNGS) {
      for (const z of outsideZones(r)) {
        checked++;
        const inner = strandedBeyondM(z);
        // Never deeper into the region than one margin…
        expect(z.radiusM - inner).toBeLessThanOrEqual(FINISH_OUTSIDE_ANNULUS_M + 1e-9);
        // …and never inside the arming circle, which is B1's untouched ground.
        expect(inner).toBeGreaterThanOrEqual(z.armWithinM ?? z.radiusM);
        // A zero-width band would make „left" mean one pose sample further out.
        expect(z.radiusM - inner).toBeGreaterThan(0);
      }
    }
    // THE COVERAGE SELF-CHECK. 108 is the measured population of "outside"
    // zones over the compiled catalogue (58 roundabout + 40 turn box + 10
    // passSignal). If a template that produces one stops compiling, this drops
    // and the failure NAMES it — the census cannot silently shrink to a world
    // it can pass in, which is how every "0 defects" report in this project
    // was wrong.
    expect(
      checked === 108
        ? "108 outside zones"
        : `only ${checked} outside zones; templates that did not compile: ` +
          (COMPILE_FAILURES.join(" | ") || "(none — the population itself moved)"),
    ).toBe("108 outside zones");
  });
});

// ---------------------------------------------------------------------------
// WHAT IT COSTS, PROVED RATHER THAN ASSERTED
// ---------------------------------------------------------------------------

describe("the roundabout hand-back is inside B15's freeze", () => {
  it("a ring's handed-back sliver is a pose the lawful wait already covers", () => {
    // A ring whose authored band is wider than one margin gives
    // (enterRadiusM, radiusM − 8] back to „no automatic ending". The claim in
    // `strandedBeyondM`'s docstring is that this is not a place a car rests
    // unnoticed, because B15 already reads a standstill there as a lawful wait
    // to enter — so it was never spending the 75 s bar there in the first
    // place. Proved on the shipped drill instead of asserted.
    const r = rung("sc-roundabout-entry", 1);
    const ring = terminalOf(r);
    if (ring.kind !== "completeManeuver" || ring.maneuver !== "roundabout") {
      throw new Error("sc-roundabout-entry no longer ends on a ring");
    }
    const z = outsideZones(r)[0];
    const arm = z.armWithinM ?? z.radiusM;
    const inner = strandedBeyondM(z);
    expect(inner).toBeGreaterThan(arm); // there IS a hand-back on this drill

    // Every metre of it, sampled: B15 must call it a lawful wait to enter.
    for (let d = arm + 0.25; d <= inner; d += 0.25) {
      const reason = yieldReasonAt(
        makeTick({ t: 0, speedKmh: 0, position: { x: ring.x + d, y: ring.y } }),
        { params: r.params, currentIndex: r.params.length - 1 },
        [],
      );
      expect(reason).toBe("roundaboutEntry");
    }
    // And the reason's own window is what makes that true, not luck.
    expect(inner).toBeLessThanOrEqual(ring.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M);
  });
});
