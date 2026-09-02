/**
 * N11 cockpit-stimuli integration — telltaleStimulus against the REAL
 * district (doc 72 VP-06 „Контролна лампа по време на движение", ЗДвП чл. 20
 * / чл. 139, library ev-warning-light). Site: the same 352 m two-way
 * residential east arm the police-stop suite uses (e519275131.0), mid-block.
 *
 * The runner stages NO actor — at the authored trigger it lights the
 * director's cockpit-lamp channel (`telltaleLit` for a red lamp) and records
 * the outcome: "yielded" for a compliant curb-side rest (reactionTimeSec =
 * stimulus→first-brake respondedSec), "passedWithoutStopping" for driving on.
 *
 * IT ALSO GRADES, SINCE 2026-09-02 (sc-vp-telltale-red:c172d48b), and this
 * suite's A12 battery was rewritten with it rather than around it. A12 forbids
 * convicting an UNMODELLED duty; this duty is modelled to the metre by the
 * spec's own trigger and halt contract, and while the runner stayed silent a
 * student who mis-triaged a red lamp as a yellow one and did not crash was
 * recorded as faultless. So the red leg resolves BOTH ways in the existing
 * `prioritySituation` vocabulary — "warning-lamp" → the основна
 * WARNING_LAMP_IGNORED on the drive-on, the yield praise on the pull-over —
 * exactly once per attempt. What the battery below now proves is the shape
 * that matters: ONE bill per adjudication, none before it, and none from the
 * compliant leg.
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
    // …and it is the RED channel specifically: the amber one stays dark, which
    // is the half that had no channel at all before 2026-09-02.
    expect(stack.director.telltaleCautionLit).toBe(false);
  });

  it("an AMBER cue lights the OTHER channel and demands no stop — it resolves 'clear' by carrying on", () => {
    // sc-vp-telltale-red:775b58cc. The lesson's whole subject is «цветът на
    // лампата решава какво правиш», and one boolean channel could only ever
    // show a student one colour. A `checkEngine` spec authors NO halt contract
    // (contracts.ts makes that unrepresentable) because the taught response to
    // amber is to keep rolling calmly to a garage.
    const red = telltaleSpec();
    const amber: TelltaleStimulusSpec = {
      id: "t-telltale-amber",
      kind: "telltaleStimulus",
      lamp: "checkEngine",
      trigger: red.trigger,
      triggerDistM: red.triggerDistM,
      ignoreBeyondM: 40,
    };
    const stack = makeStack([amber]);
    expect(stack.director.telltaleCautionLit).toBe(false);
    const driver = new PolyDriver(offsetRight(edgeGeometry(), LANE_OFFSET), 20);
    for (let i = 0; i < 30 * 30 && !stack.director.telltaleCautionLit; i++) {
      stepFrame(stack, driver.advance(DT, 10));
    }
    expect(stack.director.telltaleCautionLit).toBe(true);
    // The RED channel never rises for it — two lamps, not one repainted.
    expect(stack.director.telltaleLit).toBe(false);
    // Carrying on IS the compliant answer, so it resolves successfully…
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 10));
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: true, detail: "clear" });
    // …and it charges nothing and praises nothing: there is no manoeuvre to
    // grade, and the scenario's own rolling checkpoint objective grades the
    // driving. The amber lamp stays lit afterwards, like the red one.
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    expect(stack.director.telltaleCautionLit).toBe(true);
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
    // The compliant leg convicts NOTHING and is PRAISED — THEO-4: a drill that
    // can only convict teaches half a rule.
    expect(violationCodes(stack.ruleEvents)).toEqual([]);
    expect(commendationCodes(stack.ruleEvents)).toEqual(["YIELDED_TO_PRIORITY"]);
  });

  it("ignoring the lamp records 'passedWithoutStopping' and grades WARNING_LAMP_IGNORED — once", () => {
    const stack = makeStack([telltaleSpec()]);
    const path = offsetRight(edgeGeometry(), LANE_OFFSET);
    const driver = new PolyDriver(path, 20);
    for (let i = 0; i < 60 * 30 && stack.outcomes.length === 0; i++) {
      stepFrame(stack, driver.advance(DT, 11)); // ~40 km/h, straight past
      if (driver.s >= driver.length) break;
    }
    expect(stack.outcomes).toHaveLength(1);
    expect(stack.outcomes[0]).toMatchObject({ success: false, detail: "passedWithoutStopping" });
    // The ignore is now BILLED, and billed exactly once: the "warning-lamp"
    // prioritySituation is emitted on the resolving frame and on no other, so
    // the drive that ignored one lamp carries one основна and not a per-frame
    // stream of them (the reducer's ACT_REOPEN discipline is not even reached).
    expect(violationCodes(stack.ruleEvents)).toEqual(["WARNING_LAMP_IGNORED"]);
    expect(commendationCodes(stack.ruleEvents)).toEqual([]);
    const priorityEvents = stack.ticks.flatMap((tick) =>
      tick.events.filter((e) => e.kind === "prioritySituation"),
    );
    expect(priorityEvents).toEqual([
      { kind: "prioritySituation", situation: "warning-lamp", violated: true },
    ]);
    // Still nothing physical: the runner stages no actor, so it can never
    // manufacture a contact.
    for (const tick of stack.ticks) {
      expect(tick.events.filter((e) => e.kind === "collision")).toEqual([]);
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
    // ONE bill per adjudication — which is the claim in this test's own title,
    // and it is only checkable now that the runner bills at all. Two ignored
    // lamps across two attempts, two основни; the five seconds of driving on
    // past the first resolution added none.
    expect(violationCodes(stack.ruleEvents)).toEqual([
      "WARNING_LAMP_IGNORED",
      "WARNING_LAMP_IGNORED",
    ]);
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
