import { describe, expect, it } from "vitest";
import { levelForXp, xpForEvent, XP_PER_LEVEL } from "./xp";

describe("xpForEvent", () => {
  it("awards 10 × question weight for correct practice answers", () => {
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: 1 }),
    ).toBe(10);
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: 2 }),
    ).toBe(20);
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: 3 }),
    ).toBe(30);
  });

  it("awards 2 XP for a wrong answer regardless of weight", () => {
    expect(
      xpForEvent({ type: "practice_answer", correct: false, points: 3 }),
    ).toBe(2);
  });

  it("clamps out-of-contract question weights to 1..3", () => {
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: 7 }),
    ).toBe(30);
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: 0 }),
    ).toBe(10);
    expect(
      xpForEvent({ type: "practice_answer", correct: true, points: NaN }),
    ).toBe(10);
  });

  it("awards 50 + score for a completed exam, +150 when passed", () => {
    expect(
      xpForEvent({ type: "exam_completed", passed: false, score: 60 }),
    ).toBe(110);
    expect(
      xpForEvent({ type: "exam_completed", passed: false, score: 0 }),
    ).toBe(50);
    expect(
      xpForEvent({ type: "exam_completed", passed: true, score: 95 }),
    ).toBe(50 + 95 + 150);
  });

  it("clamps out-of-contract exam scores to 0..97", () => {
    expect(
      xpForEvent({ type: "exam_completed", passed: true, score: 500 }),
    ).toBe(50 + 97 + 150);
    expect(
      xpForEvent({ type: "exam_completed", passed: false, score: -10 }),
    ).toBe(50);
  });
});

describe("levelForXp", () => {
  it("is 1 + floor(xp / 400), matching the dashboard formula", () => {
    expect(XP_PER_LEVEL).toBe(400);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(399)).toBe(1);
    expect(levelForXp(400)).toBe(2);
    expect(levelForXp(1200)).toBe(4);
  });

  it("never drops below level 1", () => {
    expect(levelForXp(-50)).toBe(1);
  });
});
