/**
 * N11 cockpit-stimuli integration — telltaleStimulus against the REAL
 * district (doc 72 VP-06 „Контролна лампа по време на движение", ЗДвП чл. 20
 * / чл. 139, library ev-warning-light). Site: the same 352 m two-way
 * residential east arm the police-stop suite uses (e519275131.0), mid-block.
 *
 * The runner is STIMULUS + MEASUREMENT ONLY (contracts.ts): it stages NO
 * actor — at the authored trigger it lights the director's cockpit-lamp
 * channel (`telltaleLit`) and records the outcome — "yielded" for a compliant
 * curb-side rest (reactionTimeSec = stimulus→first-brake respondedSec),
 * "passedWithoutStopping" for driving on — but emits ZERO SimTick events.
 * The A12 battery here proves the hard bias: NEITHER side can ever grade a
 * violation from this runner; the graded duty lives in scenario objectives.
 */

import { describe, expect, it } from "vitest";
import type { TelltaleStimulusSpec } from "../../contracts";
import {
  commendationCodes,
  DT,
  loadRawDistrict,
  makeStack,
  offsetRight,
  PolyDriver,
  stepFrame,
  violationCodes,
} from "./helpers";

const EDGE = "e519275131.0";
/** Scaled lane-center offset for the right lane of a 2-lane two-way edge. */
const LANE_OFFSET = 4.0625;

function edgeGeometry(): Array<[number, number]> {
  const raw = loadRawDistrict();
  const edge = raw.roads.edges.find((e) => e.id === EDGE);
  if (!edge) throw new Error(`edge ${EDGE} not in district`);
  return edge.geometry.map((p) => [p[0], p[1]]);
}

/** Trigger on the lane centerline (arc 100) + curb-side halt point 30 m
 *  farther (arc 130), both derived from the SAME edge polyline. */
function telltaleSpec(): TelltaleStimulusSpec {
  const lane = new PolyDriver(offsetRight(edgeGeometry(), LANE_OFFSET));
  const curbLine = new PolyDriver(offsetRight(edgeGeometry(), LANE_OFFSET + 1.6));
  const trig = lane.poseAt(100);
  const stop = curbLine.poseAt(130);
  return {
    id: "t-telltale",
    kind: "telltaleStimulus",
    lamp: "temperature",
    trigger: { x: trig.x, y: trig.y },
    triggerDistM: 8,
    stop: { x: stop.x, y: stop.y },
    stopRadiusM: 3,
    stopSpeedKmh: 4,
    ignoreBeyondM: 60,
  };
}

describe("telltaleStimulus (integration)", () => {
  it("lights the director's cockpit-lamp channel at the trigger — dark before, lit after, actorless", () => {
    const spec = telltaleSpec();
    const stack = makeStack([spec]);
    // No actor of any kind staged — the stimulus is state, not scenery.
    expect(stack.traffic.pedestrians.length).toBe(0);
    expect(stack.director.telltaleLit).toBe(false);
    const driver = new PolyDriver(offsetRight(edgeGeometry(), LANE_OFFSET), 20);
    for (let i = 0; i < 30 * 30 && !stack.director.telltaleLit; i++) {
      stepFrame(stack, driver.advance(DT, 10));
    }
    expect(stack.director.telltaleLit).toBe(true);
    // Lit mid-drive at the authored point, not at spawn.
    expect(driver.s).toBeGreaterThan(80);
    expect(driver.s).toBeLessThan(120);
  });

  it("compliant: pulling over and resting at the halt point resolves 'yielded' with a measured respondedSec — zero rule events", () => {
    const spec = telltaleSpec();
    const stack = makeStack([spec]);
    // Approach on the curb-side line that passes through the halt point;
    // brake (pedal DOWN — the reaction stopwatch input) to rest AT it.
    const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
    const driver = new PolyDriver(pullOver, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      const braking = driver.s >= 125;
      const frame = driver.advance(DT, braking ? 0 : 9);
      frame.brakePedal = braking ? 1 : 0;
      stepFrame(stack, frame);
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({
      eventId: "t-telltale",
      kind: "telltaleStimulus",
      success: true,
      detail: "yielded",
    });
    // The stimulus→first-brake stopwatch measured a real response.
    expect(stack.outcomes[0].reactionTimeSec).toBeGreaterThan(0);
    expect(stack.outcomes[0].reactionTimeSec!).toBeLessThan(10);
    expect(stack.outcomes[0].approachSpeedKmh).toBeGreaterThan(5);
    // The lamp STAYS lit after resolution (a real fault does not clear).
    expect(stack.director.telltaleLit).toBe(true);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("A12 both ways: ignoring the lamp records 'passedWithoutStopping' and grades NOTHING", () => {
    const stack = makeStack([telltaleSpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11)); // ~40 km/h, straight past
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "passedWithoutStopping" });
    // The hard A12 guarantee: the runner emitted NO SimTick vocabulary at all
    // — no violation, no commendation, nothing for the reducer to grade.
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    for (const tick of stack.ticks) {
      expect(tick.events.filter((e) => e.kind === "prioritySituation" || e.kind === "collision")).toEqual([]);
    }
  });

  it("one adjudication per attempt; reset() re-arms the lamp dark", () => {
    const spec = telltaleSpec();
    const stack = makeStack([spec]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    let driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.director.telltaleLit).toBe(true);
    // Driving on past the resolution never re-fires.
    for (let i = 0; i < 5 * 30; i++) stepFrame(stack, driver.advance(DT, 11));
    expect(stack.outcomes).toHaveLength(1);
    // Retry: the lamp re-arms DARK and the fresh attempt adjudicates.
    stack.director.reset();
    expect(stack.director.telltaleLit).toBe(false);
    expect(stack.director.snapshot()[0].phase).toBe("armed");
    driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length < 2; i++) {
      stepFrame(stack, driver.advance(DT, 11));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(2);
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
  });

  it("same seed + same driving = identical outcomes (deterministic staging)", () => {
    const runOnce = () => {
      const stack = makeStack([telltaleSpec()]);
      const pullOver = offsetRight(edgeGeometry(), LANE_OFFSET + 1.6);
      const driver = new PolyDriver(pullOver, 20);
      for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
        const braking = driver.s >= 125;
        const frame = driver.advance(DT, braking ? 0 : 9);
        frame.brakePedal = braking ? 1 : 0;
        stepFrame(stack, frame);
      }
      return stack;
    };
    const a = runOnce();
    const b = runOnce();
    expect(a.outcomes).toEqual(b.outcomes);
    expect(violationCodes(a.ruleEvents)).toEqual(violationCodes(b.ruleEvents));
  });
});
