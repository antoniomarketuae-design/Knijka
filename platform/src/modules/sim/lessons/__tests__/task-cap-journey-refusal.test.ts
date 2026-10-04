/**
 * THE TASK CEILING, ROUND 15 — every withholding gate that slowing down cannot undo, enumerated off `stepReachZone`'s
 * arrival conjunction (`sc-follow-tailgater:5a56612e`).
 *
 * `objectives.ts reachZoneJourneyRefusal` is what lets the «Стигна точката, но твърде бързо» card stop telling a student
 * that the speed is why the tick is withheld, and that «Намали СЕГА» would earn it, when a journey demand has already
 * refused. Its contract has two halves, both pinned here for each of the eleven arms:
 *   · it names the arm whose fact refuses (and null on a clean context);
 *   · the arm REALLY withholds the tick: the same car, at the mark, under the cap, is credited on the clean context and
 *     refused on the refusing one — so the function cannot name an arm the conjunction does not have.
 * And the one arm deliberately NOT here: `requireFullStop`'s standstill (`qualifyingStopCurrent`), which coming to rest
 * on the mark — slowing down — does satisfy.
 */
import { describe, expect, it } from "vitest";
import {
  createEvalState,
  reachZoneJourneyRefusal,
  stepObjective,
  type ObjectiveContext,
  type ReachZoneJourneyRefusal,
  type WitnessedReachZoneParams,
} from "../objectives";
import type { ObjectiveParams } from "../types";
import { makeTick } from "./fixtures";

const BASE = { kind: "reachZone" as const, x: 0, y: 100, radiusM: 10, maxSpeedKmh: 30 };
const CLEAN: ObjectiveContext = { stagedOutcomes: [], redsMetInRun: 0, objectiveActiveSinceSec: 0 };

const CASES: Array<[ReachZoneJourneyRefusal, Partial<WitnessedReachZoneParams>, Partial<ObjectiveContext>]> = [
  ["vruUntouched", { requireVruUntouched: true }, { struckAPersonInRun: true }],
  ["noContact", { requireNoContact: true }, { struckABodyInRun: true }],
  ["railClear", { requireRailClear: true }, { enteredRailBarredInRun: true }],
  ["yieldClean", { requireYieldClean: "traffic" }, { yieldFaults: [{ code: "FAILED_TO_YIELD", tSec: 1 }] }],
  ["haltForVru", { requireHaltForVru: true }, { struckAPersonInRun: true }],
  ["restClean", { requireRestClean: "banZone" }, { restedInBanZoneInRun: true }],
  ["solidLineClean", { requireSolidLineClean: true }, { crossedSolidLineInRun: true }],
  ["stopSignRoll", { requireFullStop: true }, { stopSignRollFaultsSec: [1] }],
  ["speedClean", { requireSpeedClean: true }, { overTheCeilingInRun: true }],
  ["brakingClean", { requireBrakingClean: true }, { stoppedWithoutCauseInRun: true }],
  ["brakingClean", { requireBrakingClean: true }, { harshBrakeNoCauseInRun: true }],
  ["greenStartClean", { requireGreenStartClean: true }, { hesitatedAtGreenInRun: true }],
];

/** Out on the approach, then AT the mark under the cap: the frame the tick is either credited or withheld on. */
function arrive(params: WitnessedReachZoneParams, ctx: ObjectiveContext): boolean {
  const p = params as unknown as ObjectiveParams;
  let st = createEvalState(p);
  st = stepObjective(p, st, makeTick({ t: 1, position: { x: 0, y: 60 }, speedKmh: 25 }), ctx).evalState;
  st = stepObjective(p, st, makeTick({ t: 2, position: { x: 0, y: 80 }, speedKmh: 25 }), ctx).evalState;
  return stepObjective(p, st, makeTick({ t: 3, position: { x: 0, y: 100 }, speedKmh: 0 }), ctx).done;
}

describe("reachZoneJourneyRefusal — the eleven journey arms, each named only when its fact refuses, each really withholding the tick", () => {
  for (const [kind, demand, fact] of CASES) {
    const params = { ...BASE, ...demand } as WitnessedReachZoneParams;
    it(`${kind} (${Object.keys(demand)[0]} with ${Object.keys(fact)[0]})`, () => {
      expect(reachZoneJourneyRefusal(params, CLEAN)).toBeNull();
      expect(reachZoneJourneyRefusal(params, { ...CLEAN, ...fact })).toBe(kind);
      // The arm is real: credited on the clean context, withheld on the refusing one — at the same speed, at the mark.
      expect(arrive(params, { ...CLEAN, ...(kind === "stopSignRoll" ? { qualifyingStopCurrent: true } : {}) })).toBe(true);
      expect(arrive(params, { ...CLEAN, ...fact, ...(kind === "stopSignRoll" ? { qualifyingStopCurrent: true } : {}) })).toBe(false);
    });
  }
  it("a fact with no demand to read it refuses nothing (the eleven facts on a plain capped zone)", () => {
    const all = Object.assign({}, ...CASES.map(([, , f]) => f)) as Partial<ObjectiveContext>;
    expect(reachZoneJourneyRefusal(BASE as WitnessedReachZoneParams, { ...CLEAN, ...all })).toBeNull();
  });
  it("NOT an arm: «Спри напълно» without the standstill yet (`qualifyingStopCurrent: false`) — coming to rest on the mark earns it, so it is not a reason slowing down cannot undo", () => {
    const params = { ...BASE, requireFullStop: true } as WitnessedReachZoneParams;
    expect(reachZoneJourneyRefusal(params, { ...CLEAN, qualifyingStopCurrent: false })).toBeNull();
  });
});
