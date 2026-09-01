import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { SC_JX_PRIORITY_CONFIDENCE } from "../templates-junctions3";
import type { ScenarioLevel } from "../types";
import { createRuleEngine, reduceTick } from "../../../rules/engine";
import type { RuleEngineConfig, RuleEvent, SimTick } from "../../../rules/types";

/**
 * THE LESSON'S TITLE IS NOW A GRADED FAULT (audit
 * `sc-jx-priority-confidence:9c987e7b`).
 *
 * The template is called „По пътя с предимство — без излишни спирания" and the
 * credited drive of `.audit-frames/w21/frames/sc-jx-priority-confidence__pc-right`
 * (attested b224c7e) stood still through most of 88 s against a 40 s par and
 * read «Второстепенни 0 0 · ★★★». `STOPPED_WITHOUT_CAUSE` (rules/engine.ts,
 * ЗДвП чл. 24, ал. 2) is the detector; this file pins the WIRE, because a
 * detector nothing arms is the dead-predicate class the audit exists to stop.
 *
 * The chain, one link per test:
 *   template `ruleConfig` → `compileScenario` → `LessonSpec.ruleConfig` →
 *   `lessons/engine.ts` `createRuleEngine({ ...lesson.ruleConfig, … })` → the
 *   session's violations → the exam sheet, the «Грешки» rows and the debrief.
 */

const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];

/** The frame the audited drive spent most of its 88 s in: at rest, in gear,
 *  eastbound lane of the priority arm, nothing ahead and nothing behind it. */
function standingOnThePriorityArm(t: number): SimTick {
  return {
    t,
    speedKmh: 0,
    maxSpeedKmh: 50, // the arm's plate — map.params.priorityMaxKmh
    position: { x: -40, y: -4.0625 },
    headingDeg: 90,
    laneOffsetM: 0,
    laneId: 0,
    indicator: "off",
    headlights: "low",
    seatbeltOn: true,
    handbrakeOn: false,
    gear: 1,
    isNight: false,
    events: [],
  };
}

function driveStandingStill(config: Partial<RuleEngineConfig>): RuleEvent[] {
  let state = createRuleEngine(config);
  const out: RuleEvent[] = [];
  // Roll first — the detector never grades a session that has not driven.
  for (let t = 0; t <= 4; t += 1) {
    const r = reduceTick(state, { ...standingOnThePriorityArm(t), speedKmh: 40 });
    state = r.state;
    out.push(...r.events);
  }
  for (let t = 5; t <= 40; t += 1) {
    const r = reduceTick(state, standingOnThePriorityArm(t));
    state = r.state;
    out.push(...r.events);
  }
  return out;
}

describe("sc-jx-priority-confidence arms the fault it is named after", () => {
  it("the template asks for the detector", () => {
    expect(SC_JX_PRIORITY_CONFIDENCE.ruleConfig?.needlessStopEnabled).toBe(true);
  });

  it("compileScenario carries it onto EVERY rung's LessonSpec", () => {
    // On the template rather than on a rung: the fault is the same fault at L1
    // and at L5 (doc 86 D7's per-rung ruleConfig is for detectors a lower rung
    // has not taught yet — this one IS the lesson).
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, level);
      expect(lesson.ruleConfig?.needlessStopEnabled, `L${level}`).toBe(true);
    }
  });

  it("a rule engine built from that LessonSpec bills the standstill", () => {
    // The consumer end of the wire, exercised through the compiled lesson's own
    // config object rather than a hand-written one.
    const lesson = compileScenario(SC_JX_PRIORITY_CONFIDENCE, 1);
    const billed = driveStandingStill(lesson.ruleConfig ?? {}).filter(
      (e) => e.code === "STOPPED_WITHOUT_CAUSE",
    );
    expect(billed.length).toBeGreaterThan(0);
    expect(billed[0].kind).toBe("violation");
  });

  it("…and the same drive on a lesson that did NOT ask for it books nothing", () => {
    // The proof that the bill above is this template's own choice and not a new
    // corpus-wide charge on every drive that pauses.
    const billed = driveStandingStill({}).filter((e) => e.code === "STOPPED_WITHOUT_CAUSE");
    expect(billed).toEqual([]);
  });
});
