/**
 * compileScenario — every rung of the P0 template must compile into a VALID
 * micro-lesson: parseObjectiveParams-clean, ladder-correct aids, exam-mode at
 * L4, single-truth painted/graded bay, deterministic (golden snapshots).
 */
import { describe, expect, it } from "vitest";
import { createLessonSession } from "../../engine";
import { parseObjectiveParams } from "../../objectives";
import {
  DEFAULT_LEVEL_AIDS,
  SCENARIO_DEFAULT_TRAFFIC,
  SCENARIO_LESSON_ORDER,
  ScenarioCompileError,
  compileScenario,
} from "../compile";
import { SC_PARK_PERP_REV } from "../templates";
import type { ScenarioLevel, ScenarioSpec } from "../types";

const clone = (): ScenarioSpec => JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;

describe("compileScenario — sc-park-perp-rev", () => {
  // L5 joined the P0's ladder with doc 87 B2 — night + rain on the same bay,
  // the rung its repaired sibling sc-park-narrow already shipped.
  const LEVELS: ScenarioLevel[] = [1, 2, 3, 4, 5];

  it("compiles every authored rung into a parse-clean, session-startable lesson", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_PARK_PERP_REV, level);
      // The REAL parser accepts every objective…
      for (const o of lesson.objectives) expect(() => parseObjectiveParams(o)).not.toThrow();
      // …and the REAL engine opens a session on the compiled spec.
      const session = createLessonSession(lesson);
      expect(session.phase).toBe("driving"); // preDrive off for maneuvers
      expect(session.objectives).toHaveLength(2);
      expect(lesson.id).toBe(`sc-park-perp-rev@L${level}`);
      expect(lesson.order).toBe(SCENARIO_LESSON_ORDER);
      expect(lesson.world?.districtId).toBe("lot-perp-v1");
      expect(lesson.spawn).toEqual({ pointId: "lot-spawn-approach" });
    }
  });

  it("L1 (Пълна помощ): the full §7 aid set + widened tolerances", () => {
    const l1 = compileScenario(SC_PARK_PERP_REV, 1);
    expect(l1.aids).toEqual({
      shadowCar: true,
      pathRibbon: true,
      followHints: true,
      pauseOnError: true,
      topdownAllowed: true,
    });
    expect(l1.examMode).toBeUndefined();
    const park = l1.objectives[1].params;
    expect(park.centerTolM).toBe(0.75); // 0.5 × 1.5
    expect(park.headingTolDeg).toBe(15); // 10 × 1.5
    expect(l1.vehicleStart).toBe("ready");
  });

  it("L2 (Частична помощ): ribbon + idle hints, and top-down (the POV every rung gets)", () => {
    const l2 = compileScenario(SC_PARK_PERP_REV, 2);
    expect(l2.aids).toEqual({ pathRibbon: true, hintsAfterIdleSec: 20, topdownAllowed: true });
    const park = l2.objectives[1].params;
    expect(park.centerTolM).toBe(0.63); // 0.5 × 1.25, rounded 2dp
    expect(park.headingTolDeg).toBe(12.5);
  });

  it("L3 (Самостоятелно): no aids but top-down, evaluator-default tolerances", () => {
    const l3 = compileScenario(SC_PARK_PERP_REV, 3);
    expect(l3.aids).toEqual({ topdownAllowed: true }); // a POV, not an aid
    expect(l3.examMode).toBeUndefined();
    const park = l3.objectives[1].params;
    expect(park.centerTolM).toBe(0.5);
    expect(park.headingTolDeg).toBe(10);
  });

  it("L4 (Изпитни условия): examMode ON, cold start, no aids — top-down still granted", () => {
    const l4 = compileScenario(SC_PARK_PERP_REV, 4);
    expect(l4.examMode).toBe(true);
    expect(l4.vehicleStart).toBe("cold");
    // Founder ruling 2026-07-17: the exam rung keeps the POV. §4's cockpit-lock
    // is about GRADED views; every exam-bank practical variant grants G too.
    expect(l4.aids).toEqual({ topdownAllowed: true });
  });

  it("paints exactly the rect it grades (the L7 single-truth pattern)", () => {
    for (const level of LEVELS) {
      const lesson = compileScenario(SC_PARK_PERP_REV, level);
      expect(lesson.parkingBay).toEqual(
        (lesson.objectives[1].params as { bay: unknown }).bay,
      );
    }
  });

  it("scenario micro-maps run with ZERO ambient traffic by default", () => {
    const lesson = compileScenario(SC_PARK_PERP_REV, 3);
    expect(lesson.traffic).toEqual(SCENARIO_DEFAULT_TRAFFIC);
  });

  it("refuses a level the template does not author", () => {
    // The P0 authors L1..L5 since doc 87 B2 (catalog position 1 was the one
    // parking card in the family with no L5 tile to click), so the unauthored
    // rung is made here rather than borrowed from the shipped template.
    const noL5 = clone();
    noL5.levels = noL5.levels.filter((l) => l.level !== 5);
    expect(() => compileScenario(noL5, 5)).toThrow(ScenarioCompileError);
    expect(() => compileScenario(noL5, 5)).toThrow(/does not author L5.*L1, L2, L3, L4/);
  });

  it("compiles SNOW rungs into the lesson environment (the AC-08 unlock — the last weather ungated)", () => {
    const s = clone();
    s.levels[2].conditions = { weather: "snow" };
    // The doc 76 §0 gate is GONE: a snow rung no longer throws…
    expect(() => compileScenario(s, 3)).not.toThrow();
    // …and compiles the render/grading flag. Physics stays the template's
    // explicit opt-in (the wet precedent): weather alone never flips grip.
    const lesson = compileScenario(s, 3);
    expect(lesson.environment).toEqual({ snow: true });
    expect(lesson.physics).toBeUndefined();
    // Snowy night composes both flags.
    s.levels[2].conditions = { weather: "snow", night: true };
    expect(compileScenario(s, 3).environment).toEqual({ timeOfDay: "night", snow: true });
  });

  it("compiles FOG rungs into the lesson environment (the AC-03 unlock — fog is no longer gated)", () => {
    const s = clone();
    s.levels[2].conditions = { weather: "fog" };
    const lesson = compileScenario(s, 3);
    expect(lesson.environment).toEqual({ fog: true });
    // Foggy night composes both flags.
    s.levels[2].conditions = { weather: "fog", night: true };
    expect(compileScenario(s, 3).environment).toEqual({ timeOfDay: "night", fog: true });
  });

  it("compiles rain/night rungs into the lesson environment", () => {
    const s = clone();
    s.levels[2].conditions = { weather: "rain", night: true };
    const lesson = compileScenario(s, 3);
    expect(lesson.environment).toEqual({ timeOfDay: "night", rain: true });
  });

  it("level traffic/staged deltas land on the compiled lesson", () => {
    const s = clone();
    s.levels[2].traffic = { vehicleCount: 2 };
    const lesson = compileScenario(s, 3);
    expect(lesson.traffic?.vehicleCount).toBe(2);
    expect(lesson.traffic?.pedestrianCount).toBe(0);
    expect(lesson.stagedEvents).toBeUndefined(); // none authored
  });

  it("is deterministic: same spec + level → identical output", () => {
    expect(compileScenario(SC_PARK_PERP_REV, 2)).toEqual(compileScenario(SC_PARK_PERP_REV, 2));
  });

  it("propagates signalPlan to the lesson (the ruleConfig/physics opt-in pattern)", () => {
    // Absent on the template = absent on the lesson — today's wall-clock
    // signal behavior, bit-identical (no field to arm).
    expect(compileScenario(SC_PARK_PERP_REV, 3).signalPlan).toBeUndefined();
    const s = clone();
    s.signalPlan = { arm: "redFresh", triggerM: 45, clusterId: "sx-n-c" };
    const lesson = compileScenario(s, 3);
    expect(lesson.signalPlan).toEqual({ arm: "redFresh", triggerM: 45, clusterId: "sx-n-c" });
    // Compiled copy, not the template's own object (specs are shared data).
    expect(lesson.signalPlan).not.toBe(s.signalPlan);
  });

  it("golden compile snapshot per level (the compiled contract — review on change)", () => {
    for (const level of LEVELS) {
      expect(compileScenario(SC_PARK_PERP_REV, level)).toMatchSnapshot(`L${level}`);
    }
  });

  it("the DEFAULT_LEVEL_AIDS ladder matches the doc 76 §7 table", () => {
    expect(DEFAULT_LEVEL_AIDS[1]).toEqual({
      shadowCar: true,
      pathRibbon: true,
      followHints: true,
      pauseOnError: true,
      topdownAllowed: true,
    });
    expect(DEFAULT_LEVEL_AIDS[2]).toEqual({
      pathRibbon: true,
      hintsAfterIdleSec: 20,
      topdownAllowed: true,
    });
    expect(DEFAULT_LEVEL_AIDS[3]).toEqual({ topdownAllowed: true });
    expect(DEFAULT_LEVEL_AIDS[4]).toEqual({ topdownAllowed: true });
    expect(DEFAULT_LEVEL_AIDS[5]).toEqual({ topdownAllowed: true });
  });

  it("every rung grants top-down; only an explicit false takes it away", () => {
    for (const level of LEVELS) {
      expect(compileScenario(SC_PARK_PERP_REV, level).aids?.topdownAllowed).toBe(true);
    }
    // The escape hatch (mergeAids drops falsy flags) — kept working on purpose.
    const s = clone();
    s.levels[3].aids = { topdownAllowed: false };
    expect(compileScenario(s, 4).aids?.topdownAllowed).toBeUndefined();
  });
});
