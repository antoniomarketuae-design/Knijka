/**
 * A GEAR SELECTED IS NOT A MANOEUVRE PERFORMED, A SIGNED SPEED IS NOT A SPEED,
 * AND A MANOEUVRE EVALUATOR MEASURES THE ATTEMPT, NOT THE SESSION.
 *
 * Three laws this file already states — each of them in the doc comment of ONE
 * evaluator — and three sibling evaluators in the same file that were never
 * told. Sweep 161 routed twenty-four open criticals to `objectives.ts` under
 * one sentence: „an objective ticked on a drive that cannot have earned it".
 * These are the three places where that is a fact about the evaluator and not
 * about the world it was handed.
 *
 *  §1 `stepParkInBay` banked the whole reverse-entry gate on `tick.gear < 0`,
 *     with nothing said about MOTION. «Задача 2: влез НА ЗАДЕН ХОД в алеята и
 *     спри напълно» was therefore completed by a car that touched the selector
 *     while standing still and then drove in FORWARDS. `stepReachZone`, three
 *     hundred lines up, has said since 2026-08-19 that „«went through
 *     backwards» means IN REVERSE AND MOVING — a car standing in R has not yet
 *     done anything"; this is that sentence, in the evaluator it was about.
 *
 *  §2 `stepSmoothStop` was the last evaluator here still reading the raw
 *     `tick.speedKmh` as „at rest". The driveline reports reverse NEGATIVE, so
 *     `speedKmh <= 1` is true of every reversing frame at any speed — «спри
 *     плавно», objective two of lesson one, completed for a car that was still
 *     rolling backwards.
 *
 *  §3 `stepThreePointTurn` counted its direction-change shunts from a
 *     MONOTONIC `entered` latch, so the count outlived the attempt: an
 *     abandoned first go — or a reverse out of a bay two hundred metres later —
 *     stayed on the sheet of the clean turn that followed. rubric.ts prices the
 *     economy row off exactly that number and SessionEndScreen prints it as the
 *     objective's own evidence line, so the retry was graded as the mess before
 *     it. `stepParkInBay` has had the right rule since A10 („leaving the bay
 *     starts a NEW attempt"); the corridor is the turn's bay.
 *
 * EVERY SECTION ASSERTS BOTH DIRECTIONS, because a refusal handed to a correct
 * drive is the same crime pointing backwards and is the one this project ranks
 * worst. Each „refused" case is paired with the SAME tick stream with one field
 * changed — the mutation that makes it an assertion rather than decoration —
 * and §1 is additionally replayed against the recordings the product ships as
 * its own demonstrations, at every authored rung.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import type { SimTick } from "../../rules";
import type { ScenarioTrace } from "../../traces/types";
import { createEvalState, parseObjectiveParams, stepObjective } from "../objectives";
import { compileScenario } from "../scenario/compile";
import { SCENARIO_TEMPLATES } from "../scenario/templates";
import type { ObjectiveDetail, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function parsed(params: Record<string, unknown>, titleBg = "Тест"): ObjectiveParams {
  const objective: LessonObjective = { id: "o1", titleBg, kind: "completeManeuver", params };
  return parseObjectiveParams(objective);
}

/** Run a tick stream through one objective; report whether it EVER completed. */
function run(
  params: ObjectiveParams,
  ticks: SimTick[],
): { done: boolean; detail: ObjectiveDetail | undefined } {
  let state: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let detail: ObjectiveDetail | undefined;
  for (const tick of ticks) {
    const r = stepObjective(params, state, tick);
    state = r.evalState;
    detail = r.detail;
    if (r.done) done = true;
  }
  return { done, detail };
}

// ---------------------------------------------------------------------------
// §1 · «ВЛЕЗ НА ЗАДЕН ХОД» — the lever is not the manoeuvre
// ---------------------------------------------------------------------------

/** The shipped shape: a 5.0 × 2.5 bay at the origin, reverse entry (the A10
 *  default), evaluator tolerances. */
const BAY_PARAMS = parsed({
  maneuver: "parkInBay",
  bay: { x: 0, y: 0, headingDeg: 0, widthM: 2.5, lengthM: 5, },
  holdSec: 1.5,
});

/** One frame of a park attempt, in the bay-local frame the drills use. */
function bayTick(
  t: number,
  y: number,
  speedKmh: number,
  gear: number,
  x = 0,
): SimTick {
  return makeTick({ t, position: { x, y }, headingDeg: 0, speedKmh, gear });
}

describe("§1 a reverse park is performed in reverse, not selected in reverse", () => {
  it("REFUSES the lever-only park: R chosen at a standstill, then a forward nose-in", () => {
    // The cheat, frame by frame. The car is stationary 8 m short of the bay
    // (well inside PARK_MANEUVER_ZONE_M = 15), selects R and never moves an
    // inch in it, then drives IN, FORWARDS, in D, and holds the stop. Under the
    // old latch `usedReverse` was true from t = 0 and `entryOk` asked nothing
    // else, so «влез НА ЗАДЕН ХОД в алеята и спри напълно» was certified for a
    // drive with no reverse leg in it at all.
    const cheat = run(BAY_PARAMS, [
      bayTick(0, -8, 0, -1), // standing still, lever in R — the whole "reverse"
      bayTick(1, -8, 0, -1),
      bayTick(2, -6, 12, 1), // away, FORWARDS, in D
      bayTick(3, -3, 8, 1),
      bayTick(4, -0.2, 4, 1), // nosing in
      bayTick(5, 0, 0, 1), // at rest, square, centred — hold starts
      bayTick(6, 0, 0, 1),
      bayTick(7, 0, 0, 1), // held 2 s ≥ holdSec
    ]);
    expect(cheat.done, "a park whose only reverse was the lever").toBe(false);

    // THE MUTATION — the identical geometry, the identical stop, with the
    // approach actually DRIVEN in reverse. One field per frame differs (the
    // sign of the speed), and it is the field the gate's own title names.
    const honest = run(BAY_PARAMS, [
      bayTick(0, 8, 0, -1), // same standstill, same lever
      bayTick(1, 8, 0, -1),
      bayTick(2, 6, -12, -1), // now MOVING backwards toward the bay
      bayTick(3, 3, -8, -1),
      bayTick(4, 0.2, -4, -1),
      bayTick(5, 0, 0, -1),
      bayTick(6, 0, 0, -1),
      bayTick(7, 0, 0, -1),
    ]);
    expect(honest.done, "the same park, actually reversed in").toBe(true);
  });

  it("a standstill in R does not bank credit for a LATER forward attempt either", () => {
    // The latch is per-attempt (`exitedBay` clears it), and the fix must not
    // leave a standstill selection able to survive the clearing. Enter forward,
    // leave, select R while parked outside, come back forward.
    const r = run(BAY_PARAMS, [
      bayTick(0, -4, 10, 1),
      bayTick(1, 0, 3, 1), // attempt 1: entered forward
      bayTick(2, 6, 10, 1), // out again
      bayTick(3, 6, 0, -1), // stationary, lever in R
      bayTick(4, 6, 0, -1),
      bayTick(5, 3, -0.5, -1), // creeping under the at-rest threshold: not motion
      bayTick(6, 1, 8, 1), // attempt 2, forward again
      bayTick(7, 0, 0, 1),
      bayTick(9, 0, 0, 1),
    ]);
    expect(r.done).toBe(false);
  });

  it("the shipped demonstrations still park — every authored rung, real recordings", () => {
    // If the drill's own „this is how it is done" recording stops completing
    // the drill, the change is wrong whatever the unit cases say. `gear` and
    // the signed `speedKmh` come STRAIGHT OUT of the committed trace — nothing
    // is supplied here.
    const rows: ReadonlyArray<[string, string, string]> = [
      ["sc-park-parallel", "sc-ppl-park", "content/traces/sc-park-parallel/shadow-correct.trace.json"],
      ["sc-park-narrow", "sc-pnr-park", "content/traces/sc-park-narrow/shadow-correct.trace.json"],
    ];
    for (const [specId, objectiveId, path] of rows) {
      const trace = JSON.parse(
        readFileSync(join(process.cwd(), "..", path), "utf8"),
      ) as ScenarioTrace;
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId);
      expect(spec, specId).toBeDefined();
      // The recording has to be a REVERSE one for this to prove anything.
      expect(
        trace.samples.filter((s) => s.gear < 0 && Math.abs(s.speedKmh) > 1).length,
        `${specId} shadow carries no moving-reverse frames — this gate is pinned to nothing`,
      ).toBeGreaterThan(20);
      for (const rung of spec!.levels) {
        const obj = compileScenario(spec!, rung.level).objectives.find((o) => o.id === objectiveId);
        expect(obj, `${objectiveId} L${rung.level}`).toBeDefined();
        const p = parseObjectiveParams(obj!);
        const done = run(
          p,
          trace.samples.map((s) =>
            makeTick({
              t: s.tSec,
              speedKmh: s.speedKmh,
              position: { x: s.x, y: s.y },
              headingDeg: s.headingDeg,
              gear: s.gear,
              indicator: s.indicator,
            }),
          ),
        ).done;
        expect(done, `${specId}/${objectiveId} shadow at L${rung.level}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §2 · «СПРИ ПЛАВНО» — a car rolling backwards has not stopped
// ---------------------------------------------------------------------------

const SMOOTH_PARAMS = parsed({ maneuver: "smoothStop", minApproachKmh: 20, maxDecelMs2: 3.5 });

/**
 * A gentle approach from 25 км/ч, then a tail the caller writes. The braking
 * ramp is well under the 3.5 m/s² cap (≈1.4 m/s²), so the ONLY thing under test
 * in the tail is what the evaluator calls „at rest".
 */
function smoothApproach(): SimTick[] {
  const out: SimTick[] = [];
  let t = 0;
  for (const v of [25, 25, 22.5, 20, 17.5, 15, 12.5, 10, 7.5, 5, 2.5]) {
    out.push(makeTick({ t, speedKmh: v, gear: 1, position: { x: 0, y: t * 3 } }));
    t += 0.5;
  }
  return out;
}

describe("§2 the at-rest test folds the sign, in the last evaluator that did not", () => {
  it("REFUSES a stop that is still rolling BACKWARDS at 3 км/ч", () => {
    // −3 км/ч is 0.83 m/s: the car is moving, and the window-anchored
    // derivative sees only 0.08 m/s² across the reversal — a fortieth of the
    // cap — so nothing else in this evaluator was ever going to catch it.
    const rolling = run(SMOOTH_PARAMS, [
      ...smoothApproach(),
      makeTick({ t: 5.5, speedKmh: -1.5, gear: 1, position: { x: 0, y: 16.4 } }),
      makeTick({ t: 6, speedKmh: -3, gear: 1, position: { x: 0, y: 16 } }),
      makeTick({ t: 6.5, speedKmh: -3, gear: 1, position: { x: 0, y: 15.6 } }),
      makeTick({ t: 7, speedKmh: -3, gear: 1, position: { x: 0, y: 15.2 } }),
    ]);
    expect(rolling.done, "«спри плавно» credited to a car still moving").toBe(false);
  });

  it("…and CREDITS the same approach the moment the car is genuinely at rest", () => {
    // The mutation: the identical stream with the tail's speed field zeroed.
    // If this half were to go red the fix would be refusing lesson one.
    const stopped = run(SMOOTH_PARAMS, [
      ...smoothApproach(),
      makeTick({ t: 5.5, speedKmh: 1, gear: 1, position: { x: 0, y: 16.4 } }),
      makeTick({ t: 6, speedKmh: 0, gear: 1, position: { x: 0, y: 16.5 } }),
    ]);
    expect(stopped.done).toBe(true);

    // …and the sign convention cuts both ways: a car at rest reads |v| ≤ 1
    // whichever way the driveline signs it.
    const restNegativeEpsilon = run(SMOOTH_PARAMS, [
      ...smoothApproach(),
      makeTick({ t: 6, speedKmh: -0.4, gear: -1, position: { x: 0, y: 16.5 } }),
    ]);
    expect(restNegativeEpsilon.done).toBe(true);
  });

  it("the arming half stays SIGNED — reversing at 25 км/ч is not an approach", () => {
    // Deliberately NOT folded: a smooth stop is graded off a forward approach,
    // and a car backing up at 25 км/ч that then halts has performed no «спри
    // плавно». Folding this half too would have invented completions.
    const reversingApproach = run(SMOOTH_PARAMS, [
      makeTick({ t: 0, speedKmh: -25, gear: -1, position: { x: 0, y: 0 } }),
      makeTick({ t: 0.5, speedKmh: -25, gear: -1, position: { x: 0, y: -3.5 } }),
      makeTick({ t: 1, speedKmh: -12, gear: -1, position: { x: 0, y: -5 } }),
      makeTick({ t: 1.5, speedKmh: 0, gear: -1, position: { x: 0, y: -5.5 } }),
      makeTick({ t: 2, speedKmh: 0, gear: -1, position: { x: 0, y: -5.5 } }),
    ]);
    expect(reversingApproach.done).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3 · «ОБРАТЕН ЗАВОЙ» — the count belongs to the attempt being graded
// ---------------------------------------------------------------------------

const TURN_PARAMS = parsed({
  maneuver: "threePointTurn",
  corridor: { x: 0, y: 0, halfWidthM: 8, halfLengthM: 12 },
  startHeadingDeg: 0,
  toleranceDeg: 20,
  holdSec: 0.6,
});

function turnTick(
  t: number,
  y: number,
  speedKmh: number,
  gear: number,
  headingDeg: number,
  x = 0,
): SimTick {
  return makeTick({ t, position: { x, y }, headingDeg, speedKmh, gear });
}

describe("§3 the shunt count is the attempt's, not the session's", () => {
  it("an abandoned first go does not follow a clean retry onto the sheet", () => {
    // Four shunts inside the box, then OUT of the corridor entirely (y = 40
    // against halfLengthM 12), then back in for a textbook three-movement turn.
    // rubric.ts prices the economy row off `movements` and the U-turn drills
    // ask for 1; carrying the abandoned attempt's four shunts across grades the
    // clean retry as the mess that preceded it.
    const r = run(TURN_PARAMS, [
      turnTick(0, 8, 6, 1, 0),
      turnTick(1, 6, 4, -1, 30), // shunt 1
      turnTick(2, 5, 4, 1, 50), // shunt 2
      turnTick(3, 4, 4, -1, 40), // shunt 3
      turnTick(4, 3, 4, 1, 20), // shunt 4
      turnTick(5, 20, 30, 1, 0), // gave up — driven right out of the corridor
      turnTick(6, 40, 30, 1, 0),
      turnTick(7, 45, 30, 1, 180), // …and turned round somewhere else entirely
      turnTick(8, 8, 8, 1, 0), // back at the corridor mouth for a fresh go
      turnTick(9, 5, 6, 1, 0), // move 1
      turnTick(10, 4, 4, -1, 95), // move 2 — shunt 1
      turnTick(11, 2, 4, 1, 160), // move 3 — shunt 2
      turnTick(12, 0, 0, 1, 180), // at rest facing back — hold starts
      turnTick(12.7, 0, 0, 0, 180),
    ]);
    expect(r.done).toBe(true);
    expect(
      r.detail,
      "the clean retry must be reported as the three-movement turn it was",
    ).toMatchObject({ kind: "threePointTurn", reversals: 2, movements: 3 });
  });

  it("shunts made OUTSIDE the corridor are not the turn's movements", () => {
    // The mirror of the case above and the one that bites in the shipped
    // catalogue: `entered` is monotonic, so before this rule every
    // forward↔reverse flip for the REST of the lesson — a parking bay two
    // hundred metres on — kept incrementing the manoeuvre's own count.
    const r = run(TURN_PARAMS, [
      turnTick(0, 8, 6, 1, 0), // move 1, inside
      turnTick(1, 4, 4, -1, 95), // move 2 — shunt 1
      turnTick(2, 2, 4, 1, 160), // move 3 — shunt 2
      turnTick(3, 0, 0, 1, 180),
      turnTick(3.7, 0, 0, 0, 180), // completes here, three movements
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ reversals: 2, movements: 3 });

    // Same turn, with a shuttle out on the road BEFORE it. Under the old rule
    // the corridor touch at t = 0 armed the counter for good.
    const withPriorTouch = run(TURN_PARAMS, [
      turnTick(0, 11, 4, 1, 0), // brushes the corridor edge and drives on
      turnTick(1, 30, 20, 1, 0),
      turnTick(2, 30, 4, -1, 0), // reversing about, out on the road — shunt?
      turnTick(3, 34, 4, 1, 0),
      turnTick(4, 30, 4, -1, 0),
      turnTick(5, 8, 6, 1, 0), // NOW the turn begins — move 1
      turnTick(6, 4, 4, -1, 95), // move 2 — shunt 1
      turnTick(7, 2, 4, 1, 160), // move 3 — shunt 2
      turnTick(8, 0, 0, 1, 180),
      turnTick(8.7, 0, 0, 0, 180),
    ]);
    expect(withPriorTouch.done).toBe(true);
    expect(withPriorTouch.detail).toMatchObject({ reversals: 2, movements: 3 });
  });

  it("a genuinely over-worked turn still reports every one of its shunts", () => {
    // The guard against the lazy reading of this fix. Scoping the count to the
    // corridor must not become „the count is always small": a five-point turn
    // done entirely inside the box reports five movements, exactly as before.
    const r = run(TURN_PARAMS, [
      turnTick(0, 8, 5, 1, 0),
      turnTick(1, 6, 4, -1, 60), // shunt 1
      turnTick(2, 5, 4, 1, 110), // shunt 2
      turnTick(3, 3, 4, -1, 150), // shunt 3
      turnTick(4, 1, 4, 1, 175), // shunt 4
      turnTick(5, 0, 0, 1, 180),
      turnTick(5.7, 0, 0, 0, 180),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ reversals: 4, movements: 5 });
  });

  it("the shipped turn demonstrations print the same number they always did", () => {
    // §1 was pinned to real recordings and §3 was not, and §3 is the fix that
    // changes a NUMBER THE STUDENT READS — rubric.ts prices the economy row off
    // `movements` and SessionEndScreen prints it as the objective's evidence
    // line. So the three shipped turn drills are replayed against their own
    // „this is how it is done" recordings and the printed count is asserted
    // exactly, at every authored rung.
    //
    // READ THE DETAIL THE WAY THE PRODUCT DOES. engine.ts freezes an
    // objective's detail on the frame it completes and never steps it again
    // (`currentIndex` moves past it), so the number the debrief carries is the
    // one at the DONE tick — not the one at the last tick of the session, which
    // is what a naive replay would report. This loop stops where the engine
    // stops.
    //
    // WHAT IT CAN CATCH: this went green before the §3 change and after it —
    // no committed recording ever leaves and re-enters its corridor, which is
    // the proof that scoping the count to the corridor visit refuses nobody.
    // What it refuses is the NEXT tightening: any rule that resets the count on
    // something a real turn does (standing still, brushing the corridor edge,
    // a shunt at the box corner) takes 3 → 1 here and goes red.
    const rows: ReadonlyArray<[string, string, number]> = [
      // spec, objective, the movements the debrief prints for the clean drive
      ["sc-maneuver-3point", "sc-m3p-turn", 3],
      ["sc-maneuver-uturn", "sc-utn-turn", 1], // a wide single-arc U-turn
      ["sc-ed-poligon-chain", "sc-pgc-turn", 3],
    ];
    for (const [specId, objectiveId, movements] of rows) {
      const trace = JSON.parse(
        readFileSync(
          join(process.cwd(), "..", "content", "traces", specId, "shadow-correct.trace.json"),
          "utf8",
        ),
      ) as ScenarioTrace;
      const spec = SCENARIO_TEMPLATES.find((s) => s.id === specId);
      expect(spec, specId).toBeDefined();
      for (const rung of spec!.levels) {
        const obj = compileScenario(spec!, rung.level).objectives.find((o) => o.id === objectiveId);
        expect(obj, `${objectiveId} L${rung.level}`).toBeDefined();
        const p = parseObjectiveParams(obj!);
        let state: ObjectiveEvalState = createEvalState(p);
        let doneDetail: ObjectiveDetail | undefined;
        for (const s of trace.samples) {
          const r = stepObjective(
            p,
            state,
            makeTick({
              t: s.tSec,
              speedKmh: s.speedKmh,
              position: { x: s.x, y: s.y },
              headingDeg: s.headingDeg,
              gear: s.gear,
              indicator: s.indicator,
            }),
          );
          state = r.evalState;
          if (r.done) {
            doneDetail = r.detail;
            break;
          }
        }
        expect(doneDetail, `${specId}/${objectiveId} shadow never completed at L${rung.level}`)
          .toBeDefined();
        expect(doneDetail, `${specId}/${objectiveId} at L${rung.level}`).toMatchObject({
          kind: "threePointTurn",
          movements,
        });
      }
    }
  });
});
