/**
 * SWEEP 161 — the two green ticks handed out for skills the objective never
 * finished measuring. Both are field defects: every case below is a shipped
 * drill, read off `.audit-frames/sweep161` on both platforms, and every
 * assertion here is red on the code as it stood on 2026-08-17.
 *
 * 1. THE APPROACH CAP THAT WAS SPENT ON THE WAY UP. `capMet` latched on „the
 *    cap was honoured at least once inside the capsule" and was never asked
 *    again, so an accelerating car — and every drive starts at rest — banked
 *    the whole speed contract while crossing the cap FROM BELOW, then arrived
 *    11–19 км/ч over it and collected the tick. See REACH_ZONE_CAP_SLACK_KMH
 *    in objectives.ts for the five drills and the frame.
 *
 * 2. THE U-TURN THAT WAS SCORED FOR BEING PARKED IN THE BOX. `movements` was
 *    `reversals + 1` from the moment the corridor was entered, so a car that
 *    turned nothing at all reported the best possible economy — 2 / 2 т.,
 *    «чиста маневра» — beside the very objective it had failed.
 *
 * Each block carries the counter-direction too: the B4/B5 rescues these fixes
 * must not undo, because a false failure and a false pass are the same crime.
 */

import { describe, expect, it } from "vitest";
import type { LessonObjective } from "../../contracts";
import { DEFAULT_RULE_CONFIG } from "../../rules";
import {
  REACH_ZONE_CAP_SLACK_KMH,
  createEvalState,
  parseObjectiveParams,
  stepObjective,
} from "../objectives";
import type { ObjectiveDetail, ObjectiveEvalState, ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

function parsed(kind: LessonObjective["kind"], params: Record<string, unknown>): ObjectiveParams {
  return parseObjectiveParams({ id: "o1", titleBg: "Тест", kind, params });
}

/**
 * Run a tick sequence through one objective. Unlike objectives.test.ts's helper
 * this does NOT stop at the first completed frame: half of what is under test
 * is what the LAST frame reports, and the engine keeps stepping an objective
 * until it completes (engine.ts) — a helper that breaks early cannot see a
 * latch fall back.
 */
function run(params: ObjectiveParams, ticks: ReturnType<typeof makeTick>[]) {
  let evalState: ObjectiveEvalState = createEvalState(params);
  let done = false;
  let detail: ObjectiveDetail | undefined;
  for (const tick of ticks) {
    if (done) break; // the engine never re-steps a completed objective
    const r = stepObjective(params, evalState, tick);
    evalState = r.evalState;
    detail = r.detail;
    done = r.done;
  }
  return { done, evalState, detail };
}

// ---------------------------------------------------------------------------
// 1. The approach cap
// ---------------------------------------------------------------------------

describe("a reachZone cap is a contract on the whole approach, not a moment", () => {
  /** `sc-crossing-dart`'s own gate: r10 at the zebra approach, capped at 40. */
  const DART = { x: 4.06, y: 68, radiusM: 10, maxSpeedKmh: 40 };
  /** Ticks up the approach axis (+y) in the right-lane centre. */
  const at = (y: number, speedKmh: number, t: number) =>
    makeTick({ t, position: { x: 4.06, y }, speedKmh });

  it("REFUSES the drive that met the cap while accelerating THROUGH it", () => {
    // sc-crossing-dart/mobile-wrong, 04-t007s.png: the ✓ toast «Приближи
    // пътеката с готовност за спиране» over a cluster reading 51 км/ч, the
    // zebra still ahead — and the same protocol convicting «Твърде бързо
    // приближаване към пешеходна пътека −10 изпитни т. ОПАСНА ГРЕШКА».
    // The car is inside the 15 m capsule (mark 68, radius 10 + grace 5) at 38,
    // still on the throttle, and arrives at the mark at 51.
    const r = run(parsed("reachZone", DART), [
      at(20, 20, 0), // far out, outside the ring
      at(56, 38, 1), // 12 m short — under the cap, ACCELERATING through it
      at(68, 51, 2), // on the mark, 11 км/ч over
    ]);
    expect(r.done).toBe(false);
    // Reached, yes. The discipline the cap NAMES is what was not performed —
    // and the state the engine turns into the explaining card is latched.
    expect(r.evalState).toMatchObject({ reached: true, capMet: false, overCapNoted: true });
  });

  it("…and the same drive is credited without the arrival check (the defect, stated)", () => {
    // The half that keeps the test above honest: this sequence is not refused
    // by geometry or by the cap never having been met — remove the arrival
    // check and it passes, which is exactly how it shipped. Slowing at the
    // mark instead of past it is the whole difference.
    const r = run(parsed("reachZone", DART), [
      at(20, 20, 0),
      at(56, 38, 1),
      at(68, 39, 2), // same approach, arrives UNDER the cap
    ]);
    expect(r.done).toBe(true);
  });

  it("keeps B4: braking to the cap early and arriving a shade over still counts", () => {
    // The counter-direction, and the one that must never be lost. The taught
    // behaviour — slow down BEFORE the hazard — was performed; the car coasts
    // through the mark `REACH_ZONE_CAP_SLACK_KMH` over the cap and no more.
    const r = run(parsed("reachZone", DART), [
      at(40, 55, 0),
      at(58, 36, 1), // braked to the cap 10 m short
      at(68, 40 + REACH_ZONE_CAP_SLACK_KMH, 2), // arrives at the edge of the slack
    ]);
    expect(r.done).toBe(true);
  });

  it("keeps B5: a full stop SHORT of a halt mark, then a creep over it", () => {
    // sc-jxgb-yield's shape — r4 at ≤6 км/ч. Stopping short is stopping there,
    // done better; the credit is earned at the standstill and the objective is
    // complete before the car moves again, so the arrival check never sees it.
    const halt = parsed("reachZone", { x: 4.06, y: 118, radiusM: 4, maxSpeedKmh: 6 });
    const r = run(halt, [
      makeTick({ t: 0, position: { x: 4.06, y: 100 }, speedKmh: 25 }),
      makeTick({ t: 1, position: { x: 4.06, y: 112 }, speedKmh: 0 }), // 6 m short, stopped
      makeTick({ t: 2, position: { x: 4.06, y: 118 }, speedKmh: 12 }), // rolls on
    ]);
    expect(r.done).toBe(true);
  });

  it("is not a trap: braking at the mark re-earns the refused cap", () => {
    // The withdrawal is not a latch. A student who arrives too fast is told so
    // (`overCapNoted` → the engine's card, which promises exactly this) and can
    // still slow down while he is on the mark — the same way out as a student
    // who never met the cap at all.
    const r = run(parsed("reachZone", DART), [
      at(20, 20, 0),
      at(56, 38, 1),
      at(66, 51, 2), // on the mark, refused
      at(70, 30, 3), // brakes while still inside the disc
    ]);
    expect(r.done).toBe(true);
  });

  /**
   * The five audited drills, swept rather than asserted once: the defect was
   * one mechanism wearing five costumes, and a single example is how it
   * survived the last review. Each row is (authored cap, arrival speed) read
   * off the sweep's own machine summaries.
   */
  it("refuses every audited mistake-demo drive that banked its cap on the way up", () => {
    const DRILLS: ReadonlyArray<{ id: string; cap: number; arrivalKmh: number }> = [
      { id: "sc-crossing-dart", cap: 40, arrivalKmh: 59 },
      { id: "sc-crossing-white-cane", cap: 40, arrivalKmh: 59 },
      { id: "sc-crossing-bus-shadow", cap: 30, arrivalKmh: 57 },
      { id: "sc-hazard-obstacle", cap: 46, arrivalKmh: 59 },
      { id: "sc-hz-breakdown-pulloff", cap: 130, arrivalKmh: 145 },
    ];
    const credited: string[] = [];
    for (const { id, cap, arrivalKmh } of DRILLS) {
      const gate = parsed("reachZone", { x: 4.06, y: 68, radiusM: 10, maxSpeedKmh: cap });
      const r = run(gate, [
        at(20, cap - 20, 0), // far out, under the cap and climbing
        at(56, cap - 2, 1), // inside the capsule, still under it
        at(68, arrivalKmh, 2), // arrives well over
      ]);
      if (r.done) credited.push(`${id}: cap ${cap}, arrived ${arrivalKmh} км/ч, still ticked`);
    }
    expect(credited).toEqual([]);
  });

  it("the boundary the world-referent B4 probe used to carry, both sides of it", () => {
    // `reachZoneEvaluatorProbe` (world/referents.ts) drives the B4 census row:
    // brake to a 20 км/ч cap 9 m out, then cross the mark above it. Its fixture
    // said „a shade" was +6 and had to move to +4 for this fix, so the pair is
    // pinned HERE — on the evaluator that owns the rule — rather than left to
    // a probe in another module to define by accident.
    const probe = (arrivalKmh: number) =>
      run(parsed("reachZone", { x: 0, y: 0, radiusM: 5, maxSpeedKmh: 20 }), [
        makeTick({ t: 0, position: { x: 0, y: -20 }, speedKmh: 30 }),
        makeTick({ t: 1, position: { x: 0, y: -9 }, speedKmh: 18 }), // at the cap, 9 m out
        makeTick({ t: 2, position: { x: 0, y: 0 }, speedKmh: arrivalKmh },),
      ]).done;
    expect(probe(20 + REACH_ZONE_CAP_SLACK_KMH)).toBe(true); // a shade, forgiven
    expect(probe(20 + REACH_ZONE_CAP_SLACK_KMH + 1)).toBe(false); // a decision, refused
  });

  it("the slack is the rule engine's own speedometer grace, not a new number", () => {
    // Drift guard. objectives.ts borrows `speedingGraceMaxKmh` and its
    // reasoning („slack that does not grow because the road is faster");
    // if the law engine's grace moves, this fails instead of silently
    // disagreeing with the speeding detector one module over.
    expect(REACH_ZONE_CAP_SLACK_KMH).toBe(DEFAULT_RULE_CONFIG.speedingGraceMaxKmh);
  });

  it("an UNCAPPED waypoint is untouched — no arrival check exists to apply", () => {
    const plain = parsed("reachZone", { x: 4.06, y: 68, radiusM: 10 });
    expect(run(plain, [at(20, 59, 0), at(68, 59, 1)]).done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. The manoeuvre economy count
// ---------------------------------------------------------------------------

describe("a three-point turn is counted only once it has been performed", () => {
  const turn = parsed("completeManeuver", {
    maneuver: "threePointTurn",
    corridor: { x: 0, y: 0, halfWidthM: 6, halfLengthM: 10 },
    startHeadingDeg: 0,
  });
  const at = (
    t: number,
    y: number,
    o: { speedKmh: number; gear: number; headingDeg: number },
  ) => makeTick({ t, position: { x: 0, y }, ...o });

  it("REPORTS NOTHING for a car that entered the box and never turned", () => {
    // sc-maneuver-uturn and sc-maneuver-3point, both platforms: gear D in every
    // captured frame, the harness refusing the standstill press that would have
    // selected R, 7–11 full stops — and «Икономичност на маневрата 2 / 2 т. ·
    // Обратен завой в 1 движения — чиста маневра» printed above the dash.
    const r = run(turn, [
      at(0, 5, { speedKmh: 6, gear: 1, headingDeg: 0 }),
      at(1, 3, { speedKmh: 4, gear: 1, headingDeg: 0 }),
      at(2, 0, { speedKmh: 0, gear: 1, headingDeg: 0 }),
      at(4, 0, { speedKmh: 0, gear: 0, headingDeg: 0 }),
    ]);
    expect(r.done).toBe(false);
    // 0 is what rubric.ts and SessionEndScreen both already read as „nothing
    // measured": the economy row goes unscored and the evidence line is dropped.
    expect(r.detail).toMatchObject({ kind: "threePointTurn", entered: true, movements: 0 });
  });

  it("still reports a turn that WAS performed but not parked — the honest half", () => {
    // The counter-direction: a student who swung round in one arc and drove off
    // without holding the corridor has performed the manoeuvre. The objective
    // stays open (no hold), and the economy row still tells him what it cost.
    const r = run(turn, [
      at(0, 8, { speedKmh: 8, gear: 1, headingDeg: 0 }),
      at(1, 4, { speedKmh: 6, gear: 1, headingDeg: 95 }),
      at(2, 2, { speedKmh: 6, gear: 1, headingDeg: 178 }),
      at(3, 6, { speedKmh: 8, gear: 1, headingDeg: 180 }), // driving away, facing back
    ]);
    expect(r.done).toBe(false);
    expect(r.detail).toMatchObject({ movements: 1, entered: true });
  });

  it("a completed three-point turn counts exactly as before", () => {
    // The regression bound: `done` already demands the reversed facing, so no
    // completion anywhere in the trace suite changes its economy score.
    const r = run(turn, [
      at(0, 5, { speedKmh: 6, gear: 1, headingDeg: 0 }),
      at(1, 4, { speedKmh: 4, gear: -1, headingDeg: 95 }),
      at(2, 2, { speedKmh: 4, gear: 1, headingDeg: 160 }),
      at(3, 0, { speedKmh: 0, gear: 1, headingDeg: 180 }),
      at(3.7, 0, { speedKmh: 0, gear: 0, headingDeg: 180 }),
    ]);
    expect(r.done).toBe(true);
    expect(r.detail).toMatchObject({ reversals: 2, movements: 3 });
  });
});
