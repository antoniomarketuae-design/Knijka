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
  const LEVELS: ScenarioLevel[] = [1, 2, 3, 4];

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

  it("L1 (Воден опит): the full §7 aid set + widened tolerances", () => {
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

  it("L2 (Частична помощ): ribbon + idle hints only", () => {
    const l2 = compileScenario(SC_PARK_PERP_REV, 2);
    expect(l2.aids).toEqual({ pathRibbon: true, hintsAfterIdleSec: 20 });
    const park = l2.objectives[1].params;
    expect(park.centerTolM).toBe(0.63); // 0.5 × 1.25, rounded 2dp
    expect(park.headingTolDeg).toBe(12.5);
  });

  it("L3 (Самостоятелно): no aids, evaluator-default tolerances", () => {
    const l3 = compileScenario(SC_PARK_PERP_REV, 3);
    expect(l3.aids).toBeUndefined();
    expect(l3.examMode).toBeUndefined();
    const park = l3.objectives[1].params;
    expect(park.centerTolM).toBe(0.5);
    expect(park.headingTolDeg).toBe(10);
  });

  it("L4 (Изпитни условия): examMode ON, cold start, no aids", () => {
    const l4 = compileScenario(SC_PARK_PERP_REV, 4);
    expect(l4.examMode).toBe(true);
    expect(l4.vehicleStart).toBe("cold");
    expect(l4.aids).toBeUndefined();
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
    expect(() => compileScenario(SC_PARK_PERP_REV, 5)).toThrow(ScenarioCompileError);
    expect(() => compileScenario(SC_PARK_PERP_REV, 5)).toThrow(/does not author L5.*L1, L2, L3, L4/);
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
    expect(DEFAULT_LEVEL_AIDS[2]).toEqual({ pathRibbon: true, hintsAfterIdleSec: 20 });
    expect(DEFAULT_LEVEL_AIDS[3]).toEqual({});
    expect(DEFAULT_LEVEL_AIDS[4]).toEqual({});
    expect(DEFAULT_LEVEL_AIDS[5]).toEqual({});
  });
});
