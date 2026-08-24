/**
 * O30 — THE END OF THE ROUTE IS BEHIND YOU AND THE DRIVE IS STILL RUNNING.
 *
 * WHAT THIS FILE IS ABOUT. Every ending an ARRIVAL terminal has today is an
 * ARRIVAL: `routeFinishZone`'s half-second presence (which the engine withholds
 * on the terminal objective) and `terminalRescueZone`'s FINISH_STUCK_S at a full
 * standstill. Both require the car to BE at the mark. A car that drives THROUGH
 * the mark and keeps going satisfies neither — and on a terminal carrying a
 * speed contract it cannot satisfy the OBJECTIVE either: `stepReachZone` grades
 * `done = reached && capMet`, so a car that swept the disc at 40 km/h against a
 * 6 km/h cap has latched `reached` and spent `capMet` for good. The chain stalls
 * on a gate driving on cannot re-earn and the drive runs until somebody presses
 * «Прекрати урока».
 *
 * That is the shape of sweep161's most repeated complaint on this file
 * (sc-ac-aquaplane:517af4c5 — „five of the seven lessons cannot be finished by
 * driving … the pass path exists in exactly one lesson out of seven").
 * `sc-ac-aquaplane` and `sc-ac-night-overdrive` are two of the five; both end on
 * «Спри точно на позицията…» and both re-drove for 258 s WITH STEERING
 * (.audit-frames/rebase, commit 70bcd1b) with the terminal task unticked and no
 * ending offered.
 *
 * WHAT IS PINNED HERE. `terminalDepartureZone` is derived, measured and driven
 * through the real `stepFinishGate` on the shipped lessons — the geometry, the
 * dwell, the arm, the census and the withhold rule. The ARM (six lines in
 * `engine.ts` plus one field in `types.ts`) is another lane's, so the last test
 * in this file states, and fails on, exactly what is still missing: driven
 * end-to-end through `applyTick`, that lesson still does not end.
 */

import { describe, expect, it } from "vitest";
import type { SimTick } from "../../rules";
import { applyTick, createLessonSession } from "../engine";
import {
  createFinishGate,
  FINISH_BAY_STUCK_S,
  FINISH_DEPARTED_S,
  FINISH_LANE_FLOOR_M,
  FINISH_LEAVE_S,
  FINISH_OUTSIDE_ANNULUS_M,
  FINISH_OUTSIDE_STUCK_S,
  FINISH_STANDSTILL_KMH,
  routeDepartedEndingCopy,
  stepFinishGate,
  strandedBeyondM,
  terminalDepartureZone,
  terminalRescueZone,
} from "../finish";
import { parseObjectiveParams } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ScenarioLevel } from "../scenario/types";
import type { FinishGateState, ObjectiveParams, RouteFinishZone } from "../types";
import { makeTick } from "./fixtures";

const DT = 0.25;

function paramsOf(id: string, level: ScenarioLevel): ObjectiveParams[] {
  const t = SCENARIO_TEMPLATES.find((x) => x.id === id);
  if (t === undefined) throw new Error("no such template: " + id);
  return compileScenario(t, level).objectives.map((o) => parseObjectiveParams(o));
}

interface Leg {
  /** Where the car is going, and how fast it is when it gets there. */
  x: number;
  y: number;
  speedKmh: number;
}

/**
 * Walk a pose stream through the real gate and report when it latched.
 *
 * A gate is a fold over poses, so the honest test of one is poses — not a
 * hand-placed distance. Legs are travelled at their own speed, so „drove
 * through and kept going" and „stopped there" are the same code path with
 * different numbers, which is exactly the distinction the two faces rest on.
 */
function walk(zone: RouteFinishZone, from: Leg, legs: readonly Leg[]): {
  reachedAtSec: number | null;
  lastT: number;
} {
  let gate: FinishGateState = createFinishGate();
  let t = 0;
  let { x, y } = from;
  const feed = (speedKmh: number): void => {
    gate = stepFinishGate(gate, zone, makeTick({ t, speedKmh, position: { x, y } }));
  };
  feed(from.speedKmh);
  for (const leg of legs) {
    const stepM = (leg.speedKmh / 3.6) * DT;
    if (stepM <= 1e-9) {
      // A standstill leg: hold the pose and burn the clock.
      const holdSec = leg.x; // legs of speed 0 carry their duration in `x`
      for (let s = 0; s < holdSec; s += DT) {
        t += DT;
        feed(0);
        if (gate.reachedAtSec !== null) return { reachedAtSec: gate.reachedAtSec, lastT: t };
      }
      continue;
    }
    while (Math.hypot(leg.x - x, leg.y - y) > stepM) {
      const d = Math.hypot(leg.x - x, leg.y - y);
      x += ((leg.x - x) / d) * stepM;
      y += ((leg.y - y) / d) * stepM;
      t += DT;
      feed(leg.speedKmh);
      if (gate.reachedAtSec !== null) return { reachedAtSec: gate.reachedAtSec, lastT: t };
    }
    x = leg.x;
    y = leg.y;
    t += DT;
    feed(leg.speedKmh);
    if (gate.reachedAtSec !== null) return { reachedAtSec: gate.reachedAtSec, lastT: t };
  }
  return { reachedAtSec: null, lastT: t };
}

/** A standstill leg: `x` carries the seconds to hold, `y` is ignored. */
function hold(seconds: number): Leg {
  return { x: seconds, y: 0, speedKmh: 0 };
}

// ---------------------------------------------------------------------------
// DRIVEN — sc-ac-aquaplane@L1, the audit's own exhibit
//   obj0 reachZone (4.06, 225) r 15 cap 63   „намали под 58 ПРЕДИ водата"
//   obj1 reachZone (4.06, 450) r  6 cap  6   „спри точно на позицията"
// ---------------------------------------------------------------------------

describe("sc-ac-aquaplane@L1 — the car that drives past the end of the route", () => {
  const P = paramsOf("sc-ac-aquaplane", 1);
  const TERM = P[P.length - 1];
  const ZONE = terminalDepartureZone(P);

  it("the fixture is the shape this test is about", () => {
    expect(P).toHaveLength(2);
    expect(TERM.kind).toBe("reachZone");
    if (TERM.kind !== "reachZone") return;
    expect(TERM.x).toBeCloseTo(4.06, 2);
    expect(TERM.y).toBe(450);
    expect(TERM.radiusM).toBe(6);
    // The speed contract is what makes this unfixable by driving on: sweep the
    // disc over it once and `capMet` is spent for the rest of the session.
    expect(TERM.maxSpeedKmh).toBe(6);
  });

  it("is a departure zone anchored on the mark, armed by the lane floor", () => {
    expect(ZONE).not.toBeNull();
    if (ZONE === null) return;
    expect(ZONE.mode).toBe("outside");
    expect(ZONE.x).toBeCloseTo(4.06, 2);
    expect(ZONE.y).toBe(450);
    // B3's floor: the objective's r 6 is a one-lane gate, and a car a lane wide
    // of it has been at the end of the route just as surely as one in the lane.
    expect(ZONE.armWithinM).toBe(FINISH_LANE_FLOOR_M);
    expect(ZONE.radiusM).toBe(FINISH_LANE_FLOOR_M + FINISH_OUTSIDE_ANNULUS_M);
    // FINISH_DEPARTED_S, not FINISH_LEAVE_S — the dwell decision that let the
    // arm land. At 20 s the gate refused the recorded return drive 41.3 s
    // before the student finished it (the end-to-end test below drives it);
    // the bar must clear both the recorded return (61.5 s of region time) and
    // the longest resumed standstill in the corpus (74.2 s ⇒ 75).
    expect(ZONE.dwellSec).toBe(FINISH_DEPARTED_S);
    expect(FINISH_DEPARTED_S).toBe(FINISH_OUTSIDE_STUCK_S);
    expect(FINISH_DEPARTED_S).toBeGreaterThan(61.5);
  });

  it("LATCHES — through the mark at 40 km/h and on, after FINISH_DEPARTED_S clear of it", () => {
    if (ZONE === null) throw new Error("no zone");
    const out = walk(ZONE, { x: 4.06, y: 300, speedKmh: 40 }, [
      { x: 4.06, y: 1800, speedKmh: 40 },
    ]);
    expect(out.reachedAtSec).not.toBeNull();
    // It latches because he LEFT, not on a timer. He is clear of the departure
    // circle at y = 450 + radiusM, and the dwell past it is FINISH_DEPARTED_S.
    const clearedAtSec = (450 + ZONE.radiusM - 300) / (40 / 3.6);
    expect(out.reachedAtSec as number).toBeGreaterThan(clearedAtSec + FINISH_DEPARTED_S - DT * 2);
    expect(out.reachedAtSec as number).toBeLessThan(clearedAtSec + FINISH_DEPARTED_S + DT * 2);
  });

  it("does NOT latch on a car that never got to the end of the route", () => {
    // Off-axis by 40 m the whole way: he passes the mark's latitude and drives
    // on, but he was never within the arming circle. You cannot leave somewhere
    // you never reached — this is the clause that stops a wrong turn 200 m
    // earlier from reading as „finished".
    if (ZONE === null) throw new Error("no zone");
    const out = walk(ZONE, { x: 44.06, y: 300, speedKmh: 40 }, [
      { x: 44.06, y: 1200, speedKmh: 40 },
    ]);
    expect(out.reachedAtSec).toBeNull();
  });

  it("does NOT latch while the car is still within a lane of the end of the route", () => {
    // Stopped one metre short of the departure circle and left there for twice
    // the departure dwell. He is in the band, so the only bar that can reach him
    // is the stranded one — which is 75 s, not 20 — and he must not be closed on
    // the departure dwell he never spent. (This comment first said „four
    // minutes". It holds 2 × FINISH_LEAVE_S = 40 s, and four minutes would put
    // him PAST FINISH_OUTSIDE_STUCK_S and FAIL the assertion below. A comment
    // that describes a stronger test than the code runs is how a weak test gets
    // read as a strong one.)
    if (ZONE === null) throw new Error("no zone");
    const restY = 450 + ZONE.radiusM - 1;
    const out = walk(ZONE, { x: 4.06, y: 300, speedKmh: 20 }, [
      { x: 4.06, y: restY, speedKmh: 20 },
      hold(FINISH_LEAVE_S * 2),
    ]);
    expect(out.reachedAtSec).toBeNull();
  });

  it("a car that turns back inside FINISH_DEPARTED_S keeps its drive", () => {
    // Out past the departure circle, then back to the mark before the dwell is
    // spent. B1's own principle pointed at a waypoint — an overshoot is not an
    // abandonment, and the 75 s bar gives the return far more room than the
    // 20 s the zone first shipped with (which refused a measured return drive).
    if (ZONE === null) throw new Error("no zone");
    const out = walk(ZONE, { x: 4.06, y: 300, speedKmh: 30 }, [
      { x: 4.06, y: 450 + ZONE.radiusM + 40, speedKmh: 30 },
      { x: 4.06, y: 450, speedKmh: 30 },
    ]);
    expect(out.reachedAtSec).toBeNull();
  });

  it("the stranded face still guards a car that STOPS in the band, at 75 s", () => {
    if (ZONE === null) throw new Error("no zone");
    const bandY = 450 + (ZONE.armWithinM ?? 0) + FINISH_OUTSIDE_ANNULUS_M / 2;
    const arrive = walk(ZONE, { x: 4.06, y: 300, speedKmh: 20 }, [
      { x: 4.06, y: bandY, speedKmh: 20 },
    ]);
    expect(arrive.reachedAtSec).toBeNull();
    const out = walk(ZONE, { x: 4.06, y: 300, speedKmh: 20 }, [
      { x: 4.06, y: bandY, speedKmh: 20 },
      hold(FINISH_OUTSIDE_STUCK_S + 5),
    ]);
    expect(out.reachedAtSec).not.toBeNull();
    expect((out.reachedAtSec as number) - arrive.lastT).toBeGreaterThan(
      FINISH_OUTSIDE_STUCK_S - 2,
    );
  });
});

// ---------------------------------------------------------------------------
// THE STANDSTILL FACE IS UNTOUCHED — the ending this must not trade away
// ---------------------------------------------------------------------------

describe("terminalRescueZone is bit-identical", () => {
  it("still the inside standstill zone on every arrival terminal", () => {
    let checked = 0;
    for (const t of SCENARIO_TEMPLATES) {
      for (const { level } of t.levels) {
        let params: ObjectiveParams[];
        try {
          params = compileScenario(t, level).objectives.map((o) => parseObjectiveParams(o));
        } catch {
          continue;
        }
        if (params.length === 0) continue;
        const term = params[params.length - 1];
        if (term.kind !== "reachZone") continue;
        const z = terminalRescueZone(params);
        checked++;
        expect(z?.mode).toBeUndefined();
        expect(z?.radiusM).toBe(Math.max(term.radiusM, FINISH_LANE_FLOOR_M));
        expect(z?.maxSpeedKmh).toBe(FINISH_STANDSTILL_KMH);
      }
    }
    expect(checked).toBeGreaterThan(600); // 674 when this was written
  });

  it("a bay terminal gets neither face — its retry looks exactly like a departure", () => {
    let bays = 0;
    for (const t of SCENARIO_TEMPLATES) {
      for (const { level } of t.levels) {
        let params: ObjectiveParams[];
        try {
          params = compileScenario(t, level).objectives.map((o) => parseObjectiveParams(o));
        } catch {
          continue;
        }
        if (params.length === 0) continue;
        const term = params[params.length - 1];
        if (term.kind !== "completeManeuver" || term.maneuver !== "parkInBay") continue;
        bays++;
        expect(terminalDepartureZone(params)).toBeNull();
        expect(terminalRescueZone(params)?.dwellSec).toBe(FINISH_BAY_STUCK_S);
      }
    }
    expect(bays).toBeGreaterThan(50); // 80 when this was written
  });
});

// ---------------------------------------------------------------------------
// THE CENSUS — a statement about the SHAPE, over the compiled catalogue
// ---------------------------------------------------------------------------

interface Rung {
  id: string;
  level: ScenarioLevel;
  params: ObjectiveParams[];
}

function compileAllRungs(): { rungs: Rung[]; failed: string[] } {
  const rungs: Rung[] = [];
  const failed: string[] = [];
  for (const t of SCENARIO_TEMPLATES) {
    for (const { level } of t.levels) {
      try {
        const lesson = compileScenario(t, level);
        rungs.push({
          id: t.id,
          level,
          params: lesson.objectives.map((o) => parseObjectiveParams(o)),
        });
      } catch (e) {
        failed.push(t.id + "@L" + level + ": " + (e as Error).message.split("\n")[0]);
      }
    }
  }
  return { rungs, failed };
}

const { rungs: RUNGS, failed: COMPILE_FAILURES } = compileAllRungs();

function terminalOf(r: Rung): ObjectiveParams {
  return r.params[r.params.length - 1];
}

function locatedPoint(p: ObjectiveParams): { x: number; y: number } | null {
  switch (p.kind) {
    case "reachZone":
    case "passSignal":
      return { x: p.x, y: p.y };
    case "driveDistance":
      return null;
    case "completeManeuver":
      switch (p.maneuver) {
        case "parkInBay":
          return { x: p.bay.x, y: p.bay.y };
        case "roundabout":
          return { x: p.x, y: p.y };
        case "threePointTurn":
          return { x: p.corridor.x, y: p.corridor.y };
        default:
          return null;
      }
  }
}

describe("the catalogue", () => {
  it("compiles, so the census below is over the whole world", () => {
    // A census that swallowed a compile error would quietly shrink its own
    // coverage and still report „0 problems" — the instrument failure this
    // programme has shipped four times, always in the reassuring direction. The
    // failure LIST is the guard, not a rung count: eight lanes edit this
    // catalogue at once and a hard total goes red for somebody else's template.
    expect(COMPILE_FAILURES).toEqual([]);
    expect(RUNGS.length).toBeGreaterThan(750); // 808 when this was written
  });

  it("every terminal reachZone gets a departure zone, except the compact drills", () => {
    const withZone: string[] = [];
    const withheld: string[] = [];
    for (const r of RUNGS) {
      if (terminalOf(r).kind !== "reachZone") continue;
      (terminalDepartureZone(r.params) === null ? withheld : withZone).push(r.id + "@L" + r.level);
    }
    expect(withZone.length).toBeGreaterThan(600); // 665 of 674 when written
    // The withheld ones are the manoeuvring drills whose PREVIOUS waypoint lies
    // inside the departure circle: there, „you have left the end of the route"
    // and „you are back at the checkpoint before it" are the same pose, and a
    // drill retried from its own approach pose would be closed mid-retry. That
    // is `routeFinishZone`'s half-distance clamp, pointed the other way. The SET
    // is asserted, not the count: a NEW template landing in it is a drill
    // somebody has to look at, not a number to bump.
    expect([...new Set(withheld.map((s) => s.split("@")[0]))].sort()).toEqual([
      "sc-ed-reverse-line",
      "sc-park-parallel-exit",
    ]);
  });

  it("no rung can arm the departure zone from an earlier leg of its own route", () => {
    // The arm is „the car was at the end of the route". If a waypoint the route
    // sends him to EARLIER sat inside that circle, a mid-route pose would arm it
    // and the drive could be closed on a student who has not been to the end at
    // all. Measured over every terminal waypoint in the catalogue: none does.
    //
    // REWRITTEN 2026-08-22 BY THE VERIFIER, because the first version could not
    // fail. It skipped every rung whose zone is null, and the withhold rule
    // inside `terminalDepartureZone` already guarantees a returned zone has no
    // earlier waypoint within `radiusM` — which is strictly larger than the
    // `arm` the loop then measured. The assertion was therefore implied by the
    // code it was guarding: `dist > radiusM > arm`, always. Deleting the
    // withhold rule outright left this test GREEN (only the census test went
    // red), which is the proof. It now states what the comment always claimed —
    // a fact about the CATALOGUE, computed without asking the function under
    // test — so a new template parked inside a terminal's arm goes red here and
    // a human looks at it.
    const offenders: string[] = [];
    let terminals = 0;
    for (const r of RUNGS) {
      const term = terminalOf(r);
      if (term.kind !== "reachZone") continue;
      terminals++;
      const arm = Math.max(term.radiusM, FINISH_LANE_FLOOR_M);
      for (let i = 0; i < r.params.length - 1; i++) {
        const q = locatedPoint(r.params[i]);
        if (q === null) continue;
        const d = Math.hypot(q.x - term.x, q.y - term.y);
        if (d <= arm) {
          offenders.push(r.id + "@L" + r.level + " prev " + d.toFixed(2) + "m <= arm " + arm);
        }
      }
    }
    expect(offenders).toEqual([]);
    expect(terminals).toBeGreaterThan(600); // 674 when this was written
  });

  it("every departure zone obeys the band invariants an outside zone rests on", () => {
    // The same three the work-site file states, restated over THIS population:
    // the band never reaches inside the arm (B1's ground), it is never
    // zero-width („left" would mean one pose sample further out), and it is
    // never wider than one margin — which is what keeps the 75 s stranded face
    // off ground nothing covers.
    let checked = 0;
    for (const r of RUNGS) {
      const z = terminalDepartureZone(r.params);
      if (z === null) continue;
      checked++;
      const arm = z.armWithinM ?? z.radiusM;
      const inner = strandedBeyondM(z);
      expect(inner).toBe(arm);
      expect(z.radiusM - inner).toBe(FINISH_OUTSIDE_ANNULUS_M);
    }
    expect(checked).toBeGreaterThan(600);
  });
});

// ---------------------------------------------------------------------------
// THE COPY, and what is still owed
// ---------------------------------------------------------------------------

describe("routeDepartedEndingCopy", () => {
  // STRENGTHENED 2026-08-22 BY THE VERIFIER. The first version of this block
  // asserted `toMatch(/разбор/i)`, a length CEILING, and
  // `!startsWith("Спря")`. Two neutralisations were run against it and BOTH
  // passed all fifteen tests:
  //   · «Стигна края на маршрута, затова изпитът приключва тук. Разбор…» — the
  //     exact borrowed arrival sentence this block's own comment forbids, which
  //     survives because the only prefix test looks for the OTHER sentence and
  //     nothing looks for this one at all;
  //   · «Урокът приключва. Виж разбора.» — a bare verdict, THEO-4
  //     requirement-zero, which survives because a ceiling with no floor cannot
  //     tell a short sentence from a missing reason.
  // Both die on the standard the sibling ending is already held to
  // (`off-network-ending.test.ts`): forbid the SUBSTRING, demand «разборът
  // показва», and put a FLOOR under the length. An assertion never seen red is
  // decoration, and these two had never been red.
  for (const examMode of [false, true]) {
    it(
      "says what happened, not what the other two endings say — " +
        (examMode ? "exam" : "training"),
      () => {
        const c = routeDepartedEndingCopy(examMode);
        expect(c.kind).toBe("lesson");

        // It must SAY the thing that happened: he went PAST the end of the route.
        expect(c.titleBg).toContain("покрай края");
        expect(c.explanationBg).toContain("покрай");

        // It may not borrow either sentence the engine can already speak. «Спря
        // в края на маршрута» is false of a car that did not stop, and «Стигна
        // края на маршрута, затова…» reads as an arrival that never happened —
        // THEO-4 counts a wrong reason as a bare verdict in a costume.
        expect(c.explanationBg).not.toContain("Стигна края на маршрута");
        expect(c.explanationBg).not.toContain("Спря в края на маршрута");
        // The sibling ending's broader form, and the original prefix test kept
        // alongside it: neither implies the other («Спря и това е всичко» passes
        // the substring tests and fails the prefix one), and a verifier may not
        // drop a bar while raising another.
        expect(c.explanationBg).not.toContain("края на маршрута");
        expect(c.explanationBg.startsWith("Спря")).toBe(false);

        // It must hand him to the разбор, which is where the teaching is.
        expect(c.explanationBg).toMatch(/разборът показва/i);

        // THEO-4: never a bare verdict. The FLOOR is the half that does the
        // work — a ceiling alone accepts a sentence with no reason in it. Same
        // band the sibling ending is held to (violation catalogue median 186,
        // max 319).
        expect(c.explanationBg.length).toBeGreaterThan(120);
        expect(c.explanationBg.length).toBeLessThanOrEqual(400);
        expect(c.titleBg.length).toBeLessThanOrEqual(48);
      },
    );
  }

  it("the exam and the training sentence differ, and each names its own thing", () => {
    expect(routeDepartedEndingCopy(true).titleBg).toContain("изпит");
    expect(routeDepartedEndingCopy(false).titleBg).toContain("урок");
    expect(routeDepartedEndingCopy(true).explanationBg).not.toBe(
      routeDepartedEndingCopy(false).explanationBg,
    );
  });
});

describe("THE ARM LANDED — 2026-08-24, and both directions are driven end-to-end", () => {
  // This block used to be „STILL OWED": one test asserting the exhibit drive
  // does NOT end, written to flip the day engine.ts consulted the zone. It
  // flipped. What stands here now is the pair the dwell decision rests on —
  // the drive that must END and the drive that must NOT — because a departure
  // ending that cannot tell them apart is worse than no ending at all.

  function drive(
    plan: (t: number) => { y: number; speedKmh: number } | null,
  ): { state: ReturnType<typeof createLessonSession>; titles: string[]; t: number } {
    const template = SCENARIO_TEMPLATES.find((t) => t.id === "sc-ac-aquaplane");
    if (template === undefined) throw new Error("fixture gone");
    const lesson = compileScenario(template, 1);
    let state = createLessonSession(lesson);
    const titles: string[] = [];
    let t = 0;
    for (;;) {
      t += DT;
      const pose = plan(t);
      if (pose === null) break;
      const tick: SimTick = makeTick({
        t,
        speedKmh: pose.speedKmh,
        maxSpeedKmh: 90,
        position: { x: 4.06, y: pose.y },
      });
      const out = applyTick(state, tick);
      state = out.state;
      for (const e of out.hudEvents) if (e.kind === "lesson") titles.push(e.titleBg);
      if (state.phase !== "driving") break;
    }
    return { state, titles, t };
  }

  // SKIPPED 2026-08-24 — THE ARM IS DISARMED, AND THIS TEST IS ITS SPEC.
  //
  // engine.ts:1000 no longer builds the departure zone. Its verifier proved a
  // FALSE REFUSAL with a probe drive: FINISH_DEPARTED_S of dwell accrues while
  // the car is DRIVING BACK, so pause + travel > 75 s refuses a return that
  // completed before the arm existed. This assertion is kept, not deleted,
  // because it is the exhibit the arm has to satisfy.
  //
  // RE-ENABLE ONLY WITH ITS COUNTERPART: a test that drives the
  // overshoot-and-RETURN case and proves the dwell does not accrue while the
  // car is closing on the mark. That needs a previous-distance field on the
  // finish state (types.ts carries dwellFace / regionDwellSec /
  // strandedDwellSec and no range). Un-skipping this one alone re-ships the
  // false refusal.
  it.skip("the exhibit drive ENDS: straight through the terminal at 40 and away", () => {
    // Below obj0's 63 km/h cap so the first task ticks, far over obj1's 6 so
    // sweeping the disc spends `capMet`, then straight on. The departure
    // circle (y = 467) is crossed at t ≈ 33.1 s; FINISH_DEPARTED_S later the
    // drive is over, with the departure sentence and not either arrival one.
    const v = 40 / 3.6;
    const out = drive((t) => (t > 240 ? null : { y: 100 + v * t, speedKmh: 40 }));
    expect(out.state.phase).toBe("completed");
    expect(out.state.objectives.filter((o) => o.status === "done")).toHaveLength(1);
    // Latch = circle crossing (≈ 33.1 s) + 75 s, quantized to the tick.
    const clearedAtSec = (467 - 100) / v;
    expect(out.state.endedAtSec ?? 0).toBeGreaterThan(clearedAtSec + FINISH_DEPARTED_S - 2);
    expect(out.state.endedAtSec ?? 0).toBeLessThan(clearedAtSec + FINISH_DEPARTED_S + 2);
    expect(out.titles.some((s) => s.includes("покрай края"))).toBe(true);
  });

  it("the recorded return drive is NOT refused: out 200 m, back, done at ≈ 94.5 s", () => {
    // The O30 warning's own measurement, the drive the 20 s dwell closed at
    // t = 53.25 s — 41.3 s before the student finished it. Out through the
    // terminal at 40 km/h to y = 650, back at 40 to the edge of the acceptance
    // disc, then onto the mark under obj1's 6 km/h cap, where `contractEarned`
    // re-earns the objective and the chain completes. The departure gate's
    // region time on this drive is ≈ 33 s — under FINISH_DEPARTED_S, over the
    // 20 s that refused it — so the ending it gets is the COMPLETION, and no
    // departure toast is ever pushed. This test fails at any dwell below 62 s.
    const v40 = 40 / 3.6;
    const v5 = 5 / 3.6;
    const tOut = (650 - 100) / v40; // ≈ 49.5 s northbound
    const tBack = tOut + (650 - 470) / v40; // ≈ 65.7 s back at the disc edge
    const out = drive((t) => {
      if (t > 200) return null;
      if (t <= tOut) return { y: 100 + v40 * t, speedKmh: 40 };
      if (t <= tBack) return { y: 650 - v40 * (t - tOut), speedKmh: 40 };
      const y = Math.max(450, 470 - v5 * (t - tBack));
      return { y, speedKmh: y > 450 ? 5 : 0 };
    });
    expect(out.state.phase).toBe("completed");
    expect(out.state.objectives.filter((o) => o.status === "done")).toHaveLength(2);
    expect(out.titles.some((s) => s.includes("покрай края"))).toBe(false);
    // The completion is the return's, not a timeout's: well before the 200 s
    // guard and after the car was back on the mark.
    expect(out.t).toBeGreaterThan(tBack);
    expect(out.t).toBeLessThan(130);
  });
});
