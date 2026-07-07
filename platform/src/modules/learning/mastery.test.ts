import { describe, expect, it } from "vitest";
import {
  applyAnswer,
  applyCorrect,
  applyWrong,
  GAIN_BY_POINTS,
  INITIAL_MASTERY,
  WRONG_DECAY,
} from "./mastery";

describe("mastery model", () => {
  it("gains depend on question points: 1 → 0.25, 2 → 0.35, 3 → 0.45", () => {
    expect(GAIN_BY_POINTS).toEqual({ 1: 0.25, 2: 0.35, 3: 0.45 });
    expect(applyCorrect(INITIAL_MASTERY, 1).mastery).toBeCloseTo(0.25, 10);
    expect(applyCorrect(INITIAL_MASTERY, 2).mastery).toBeCloseTo(0.35, 10);
    expect(applyCorrect(INITIAL_MASTERY, 3).mastery).toBeCloseTo(0.45, 10);
  });

  it("correct answer moves mastery toward 1 proportionally to the gap", () => {
    // 0.5 + (1 - 0.5) * 0.25 = 0.625
    const next = applyCorrect({ mastery: 0.5, lapses: 2 }, 1);
    expect(next.mastery).toBeCloseTo(0.625, 10);
    expect(next.lapses).toBe(2); // lapses untouched on correct
  });

  it("mastery never exceeds 1", () => {
    let state = { mastery: 0.999, lapses: 0 };
    for (let i = 0; i < 50; i++) state = applyCorrect(state, 3);
    expect(state.mastery).toBeLessThanOrEqual(1);
    expect(state.mastery).toBeGreaterThan(0.999);
  });

  it("wrong answer multiplies mastery by 0.6 and increments lapses", () => {
    expect(WRONG_DECAY).toBe(0.6);
    const next = applyWrong({ mastery: 0.8, lapses: 1 });
    expect(next.mastery).toBeCloseTo(0.48, 10);
    expect(next.lapses).toBe(2);
  });

  it("wrong answer at mastery 0 stays 0 (never negative)", () => {
    const next = applyWrong(INITIAL_MASTERY);
    expect(next.mastery).toBe(0);
    expect(next.lapses).toBe(1);
  });

  it("applyAnswer dispatches on correctness", () => {
    expect(applyAnswer({ mastery: 0.4, lapses: 0 }, true, 2).mastery).toBeCloseTo(
      0.4 + 0.6 * 0.35,
      10,
    );
    expect(applyAnswer({ mastery: 0.4, lapses: 0 }, false, 2).mastery).toBeCloseTo(
      0.24,
      10,
    );
  });

  it("repeated correct 1-point answers converge: 0 → .25 → .4375 → .578…", () => {
    let state = INITIAL_MASTERY;
    state = applyCorrect(state, 1);
    expect(state.mastery).toBeCloseTo(0.25, 10);
    state = applyCorrect(state, 1);
    expect(state.mastery).toBeCloseTo(0.4375, 10);
    state = applyCorrect(state, 1);
    expect(state.mastery).toBeCloseTo(0.578125, 10);
  });
});
