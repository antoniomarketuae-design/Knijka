/**
 * LevelSpec.physics — the RUNG-level half of the ADR-006 stage-4a opt-in.
 *
 * Why the seam exists: ScenarioSpec.physics is template-wide, so authoring
 * "L5 = rain + wet grip" flipped L1..L4 onto wet grip too and invalidated
 * every dry-tuned committed ghost (4a pinned ghosts to the tuning constants).
 * Templates therefore shipped L5 rungs with RENDER-ONLY weather — the rain
 * looked wet, the car did not. A rung may now carry its own physics delta.
 *
 * The contract under test:
 *  - rung over template, PER KEY (the conditions precedent — add crosswind
 *    without clearing an inherited wetGrip; clear one with an explicit false),
 *  - absent everywhere = NO physics key at all (bit-identical dry compile —
 *    the ruleConfig/signalPlan opt-in rule; compile.test.ts's golden snapshots
 *    are the other half of that proof and must not move).
 */
import { describe, expect, it } from "vitest";
import { compileScenario } from "../compile";
import { validateScenarioSpec } from "../validate";
import { SC_PARK_PERP_REV } from "../templates";
import type { LevelSpec, ScenarioSpec } from "../types";

/** Deep-clone the P0 template, physics-free on BOTH axes — the dry baseline
 *  this file reasons from, whatever the shipped template later authors. */
function dryClone(): ScenarioSpec {
  const s = JSON.parse(JSON.stringify(SC_PARK_PERP_REV)) as ScenarioSpec;
  delete s.physics;
  for (const l of s.levels) delete l.physics;
  return s;
}

/** The rung L3 of a clone (the template authors L1..L4; L3 is aid-free). */
function rung(s: ScenarioSpec, level: number): LevelSpec {
  return s.levels.find((l) => l.level === level)!;
}

describe("LevelSpec.physics — rung-level live-physics deltas", () => {
  it("absent on template AND rung: no physics key at all (not merely undefined)", () => {
    const s = dryClone();
    for (const level of [1, 2, 3, 4] as const) {
      const lesson = compileScenario(s, level);
      // The opt-in rule is about the KEY, not the value: an empty merge must
      // not materialize `physics: {}` on the compiled lesson.
      expect("physics" in lesson).toBe(false);
      expect(JSON.stringify(lesson)).not.toContain("physics");
    }
  });

  it("an explicitly-undefined rung physics compiles byte-identically to a dry rung", () => {
    // The merge spreads `rung.physics ?? {}` — an authored `undefined` must be
    // indistinguishable from an absent field, byte for byte.
    const dry = dryClone();
    const explicitUndefined = dryClone();
    rung(explicitUndefined, 3).physics = undefined;
    expect(JSON.stringify(compileScenario(explicitUndefined, 3))).toBe(
      JSON.stringify(compileScenario(dry, 3)),
    );
  });

  it("rung-only physics: the authored rung gets it, every other rung stays dry", () => {
    // THE motivating case (six templates shipped render-only L5 weather for
    // want of it): L5 runs wet, L1..L4 keep the dry physics their committed
    // ghosts were tuned against.
    const s = dryClone();
    s.levels.push({ level: 5, conditions: { weather: "rain" }, physics: { wetGrip: true } });
    const l5 = compileScenario(s, 5);
    expect(l5.physics).toEqual({ wetGrip: true });
    expect(l5.environment).toEqual({ rain: true }); // render AND dynamics now agree
    for (const level of [1, 2, 3, 4] as const) {
      expect("physics" in compileScenario(s, level)).toBe(false);
    }
  });

  it("template-only physics: unchanged behavior — every rung inherits it", () => {
    const s = dryClone();
    s.physics = { wetGrip: true };
    for (const level of [1, 2, 3, 4] as const) {
      expect(compileScenario(s, level).physics).toEqual({ wetGrip: true });
    }
  });

  it("rung over template merges PER KEY (the conditions precedent, not a replace)", () => {
    const s = dryClone();
    s.physics = { wetGrip: true };
    // The rung ADDS crosswind; the inherited wetGrip survives — a wholesale
    // replace would silently drop it and put the car back on dry grip.
    rung(s, 3).physics = { crosswind: true };
    expect(compileScenario(s, 3).physics).toEqual({ wetGrip: true, crosswind: true });
    // Untouched rungs keep the template's alone.
    expect(compileScenario(s, 2).physics).toEqual({ wetGrip: true });
  });

  it("a rung may CLEAR an inherited flag with an explicit false (the mergeAids escape hatch)", () => {
    const s = dryClone();
    s.physics = { wetGrip: true, snowGrip: true };
    rung(s, 3).physics = { snowGrip: false };
    expect(compileScenario(s, 3).physics).toEqual({ wetGrip: true });
    // Clearing the last flag drops the key entirely — back to a dry compile.
    rung(s, 3).physics = { wetGrip: false, snowGrip: false };
    expect("physics" in compileScenario(s, 3)).toBe(false);
  });

  it("rung physics may override the template's own value per key", () => {
    const s = dryClone();
    s.physics = { wetGrip: true };
    rung(s, 4).physics = { wetGrip: false, snowGrip: true };
    expect(compileScenario(s, 4).physics).toEqual({ snowGrip: true });
  });

  it("all three flags compose, in the contract's key order", () => {
    const s = dryClone();
    s.physics = { wetGrip: true };
    rung(s, 3).physics = { snowGrip: true, crosswind: true };
    const lesson = compileScenario(s, 3);
    expect(Object.keys(lesson.physics!)).toEqual(["wetGrip", "snowGrip", "crosswind"]);
  });

  it("the compiled physics is a fresh object, never aliased to the shared spec", () => {
    // Specs are shared module data; a compiled lesson must never hand out a
    // reference a caller could mutate (the signalPlan precedent).
    const s = dryClone();
    s.physics = { wetGrip: true };
    rung(s, 3).physics = { crosswind: true };
    const lesson = compileScenario(s, 3);
    expect(lesson.physics).not.toBe(s.physics);
    expect(lesson.physics).not.toBe(rung(s, 3).physics);
  });

  it("conditions.weather still never implies physics (the wet precedent holds per rung)", () => {
    const s = dryClone();
    rung(s, 3).conditions = { weather: "snow" };
    const lesson = compileScenario(s, 3);
    expect(lesson.environment).toEqual({ snow: true });
    expect("physics" in lesson).toBe(false);
  });

  it("validate gates rung physics with the same message as the template's", () => {
    const ok = dryClone();
    rung(ok, 3).physics = { wetGrip: true, snowGrip: false };
    expect(validateScenarioSpec(ok)).toEqual([]);

    const bad = dryClone();
    rung(bad, 3).physics = { wetGrip: "yes" as unknown as boolean };
    expect(validateScenarioSpec(bad)).toEqual(["levels L3: physics.wetGrip must be boolean when present"]);

    const notAnObject = dryClone();
    rung(notAnObject, 3).physics = true as unknown as ScenarioSpec["physics"];
    expect(validateScenarioSpec(notAnObject)[0]).toContain("levels L3: physics must be an object");

    // The template-wide gate is untouched (same wording, no "levels" prefix).
    const badTemplate = dryClone();
    badTemplate.physics = { crosswind: 1 as unknown as boolean };
    expect(validateScenarioSpec(badTemplate)).toEqual(["physics.crosswind must be boolean when present"]);
  });
});
