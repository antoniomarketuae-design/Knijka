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
  YIELD_WAIT_MAX_S,
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

/**
 * The same drive, shaped for a RING: in past `enterRadiusM` (the arming
 * evidence — you cannot leave a roundabout you never reached), back out to
 * `hold`, then `restSec` there.
 *
 * `restKmh` is what makes this prove both directions with one helper: 0 is a
 * car that has stopped, and anything above FINISH_STANDSTILL_KMH is a student
 * still driving — the pose is identical and only the evidence differs, which
 * is exactly the distinction the stranded face rests on. The creep is given a
 * real displacement rather than a speed reading alone, so the tick is not a
 * car claiming 4 км/ч while parked.
 */
function driveIntoRingThenRest(
  r: Rung,
  ring: { x: number; y: number; enterRadiusM: number; exitRadiusM: number },
  hold: { x: number; y: number },
  restSec: number,
  restKmh = 0,
): { ended: boolean; endedAtSec: number | null; restStartedAtSec: number } {
  const template = SCENARIO_TEMPLATES.find((t) => t.id === r.id)!;
  const lesson = compileScenario(template, r.level);
  const DT = 0.25;
  const ticks: SimTick[] = [];
  let t = 0;

  // Approach along −y from well outside the ring to one metre inside the
  // arming circle, which is the minimum evidence the gate asks for.
  const armPose = { x: ring.x, y: ring.y - (ring.enterRadiusM - 1) };
  const from = { x: ring.x, y: ring.y - (ring.exitRadiusM + 40) };
  for (let s = 0; s <= 1; s += DT / 8) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: { x: from.x + (armPose.x - from.x) * s, y: from.y + (armPose.y - from.y) * s },
      }),
    );
    t += DT;
  }
  // Back out to the hold pose.
  for (let s = 0; s <= 1; s += DT / 4) {
    ticks.push(
      makeTick({
        t,
        speedKmh: 5,
        position: { x: armPose.x + (hold.x - armPose.x) * s, y: armPose.y + (hold.y - armPose.y) * s },
      }),
    );
    t += DT;
  }
  const restStartedAtSec = t;
  // Rest — or creep, which is the same place at a different speed. The creep
  // shuffles ±0.5 m along the approach so it never leaves the band.
  for (let s = 0; s < restSec; s += DT) {
    const wobble = restKmh > 0 ? Math.sin(s * 0.6) * 0.5 : 0;
    ticks.push(
      makeTick({
        t,
        speedKmh: restKmh,
        position: { x: hold.x, y: hold.y - wobble },
      }),
    );
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

  it("the band starts at the STATED work site, is never narrower than nothing, and never reaches inside the arm", () => {
    let checked = 0;
    let stated = 0;
    for (const r of RUNGS) {
      for (const z of outsideZones(r)) {
        checked++;
        const arm = z.armWithinM ?? z.radiusM;
        const inner = strandedBeyondM(z);
        // Never inside the arming circle, which is B1's untouched ground.
        expect(inner).toBeGreaterThanOrEqual(arm);
        // A zero-width band would make „left" mean one pose sample further out.
        expect(z.radiusM - inner).toBeGreaterThan(0);
        // O23 — where the band starts is now READ OFF THE ZONE, not inferred
        // from `radiusM − FINISH_OUTSIDE_ANNULUS_M`. That inference was a
        // BOUND on the work site and it cost exactly where the two differ: a
        // ring's authored band is wider than one margin, so the bound sat
        // outside the arm and handed the difference back to no ending at all.
        // Asserting the identity is what stops the bound coming back — it is
        // false for every ring the moment the fallback is used again.
        if (z.workSiteRadiusM !== undefined) {
          stated++;
          expect(inner).toBe(Math.max(z.workSiteRadiusM, arm));
        }
      }
    }
    // Every "outside" zone the module hands out states its work site. If a new
    // anchor ships without one it falls back to the inference this row exists
    // to have replaced, and this count — not a silent pass — is what says so.
    expect(stated).toBe(checked);
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

describe("O23 — the ring approach no longer has a region with no ending", () => {
  /** The ring a rung ends on, or a thrown explanation. */
  function ringOf(r: Rung): { x: number; y: number; enterRadiusM: number; exitRadiusM: number } {
    const p = terminalOf(r);
    if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") {
      throw new Error(`${r.id}@L${r.level} no longer ends on a ring`);
    }
    return { x: p.x, y: p.y, enterRadiusM: p.enterRadiusM, exitRadiusM: p.exitRadiusM };
  }

  it("every ring band now starts at enterRadiusM — the handed-back sliver is gone", () => {
    // BEFORE O23 the inner edge was `max(arm, radiusM − 8)`, which on 48 of the
    // 58 ring zones sat OUTSIDE the arm and left (enterRadiusM, radiusM − 8] —
    // up to 5.0 m on `sc-rb-lane-choice` (enter 33 / exit 46) — in neither
    // state: not in the region, so the departure dwell never ran; not in the
    // band, so the stranded face never ran. A car resting there could not be
    // closed by anything in this module at any duration.
    let rings = 0;
    let wouldHaveBeenHandedBack = 0;
    for (const r of RUNGS) {
      const p = terminalOf(r);
      if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") continue;
      for (const z of outsideZones(r)) {
        rings++;
        expect(strandedBeyondM(z)).toBe(p.enterRadiusM);
        if (p.enterRadiusM < z.radiusM - FINISH_OUTSIDE_ANNULUS_M) wouldHaveBeenHandedBack++;
      }
    }
    expect(rings).toBe(58);
    // The measured population of the defect, so „0 rings changed" cannot be
    // reported by a census that quietly stopped finding any.
    expect(wouldHaveBeenHandedBack).toBe(48);
  });

  it("…and every metre of every ring band is still inside B15's freeze", () => {
    // THE FALSE-REFUSAL DIRECTION, and it is the one that decides whether the
    // row above may ship. What the ring band now contains is a car stopped on
    // the approach to a roundabout it has not finished — which is the founder's
    // own B15 complaint verbatim. It may only be closed after the lawful wait
    // has been honoured in full, so EVERY pose in EVERY ring's band has to be a
    // pose `yieldReasonAt` calls `roundaboutEntry`. Sampled over the catalogue
    // rather than argued from one drill.
    let sampled = 0;
    for (const r of RUNGS) {
      const p = terminalOf(r);
      if (p.kind !== "completeManeuver" || p.maneuver !== "roundabout") continue;
      const ring = ringOf(r);
      for (const z of outsideZones(r)) {
        // The whole band, not just its inner edge: the departure circle itself
        // must be inside `enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M`.
        expect(z.radiusM).toBeLessThanOrEqual(ring.enterRadiusM + YIELD_ROUNDABOUT_APPROACH_M);
        for (let d = strandedBeyondM(z) + 0.25; d <= z.radiusM; d += 0.5) {
          sampled++;
          const reason = yieldReasonAt(
            makeTick({ t: 0, speedKmh: 0, position: { x: ring.x + d, y: ring.y } }),
            { params: r.params, currentIndex: r.params.length - 1 },
            [],
          );
          expect(reason).toBe("roundaboutEntry");
        }
      }
    }
    // A self-check on the instrument: a loop that sampled nothing would pass
    // every assertion inside it, which is exactly how this project's „0
    // defects" reports were produced.
    expect(sampled).toBeGreaterThan(500);
  });

  it("a car dead still in the reclaimed sliver ENDS — after the lawful wait is honoured in full", () => {
    // Direction one, driven through the real engine on the shipped drill.
    const r = rung("sc-roundabout-entry", 1);
    const ring = ringOf(r);
    const z = outsideZones(r)[0];
    // A pose that used to be in NEITHER state: past the arm, short of the old
    // inferred inner edge. If the sliver ever closes on this drill the setup
    // asserts rather than silently testing an ordinary band pose.
    const oldInner = Math.max(ring.enterRadiusM, z.radiusM - FINISH_OUTSIDE_ANNULUS_M);
    expect(oldInner).toBeGreaterThan(ring.enterRadiusM);
    const dM = (ring.enterRadiusM + oldInner) / 2;
    const hold = { x: ring.x, y: ring.y - dM };

    const out = driveIntoRingThenRest(r, ring, hold, 300);
    expect(out.ended).toBe(true);
    // YIELD_WAIT_MAX_S of lawful wait first — the standstill is evidence of
    // nothing while the road is what is holding him — and only then the 75 s
    // stranded bar. Never earlier: that is the founder's forty seconds.
    const spent = out.endedAtSec! - out.restStartedAtSec;
    expect(spent).toBeGreaterThanOrEqual(YIELD_WAIT_MAX_S + FINISH_OUTSIDE_STUCK_S - 2);
    expect(spent).toBeLessThanOrEqual(YIELD_WAIT_MAX_S + FINISH_OUTSIDE_STUCK_S + 2);
  });

  it("…and a student still creeping through the same sliver is never ended on", () => {
    // Direction two. The same 300 s at the same place, but he is DRIVING —
    // slowly, the way a beginner edges toward a ring he cannot read yet. The
    // stranded face demands a full standstill and this is not one, so nothing
    // may close the lesson under him however long he takes.
    const r = rung("sc-roundabout-entry", 1);
    const ring = ringOf(r);
    const z = outsideZones(r)[0];
    const oldInner = Math.max(ring.enterRadiusM, z.radiusM - FINISH_OUTSIDE_ANNULUS_M);
    const dM = (ring.enterRadiusM + oldInner) / 2;

    const out = driveIntoRingThenRest(r, ring, { x: ring.x, y: ring.y - dM }, 300, 4);
    expect(out.ended).toBe(false);
    expect(out.endedAtSec).toBeNull();
  });
});
