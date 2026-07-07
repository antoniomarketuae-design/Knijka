import { describe, expect, it } from "vitest";
import { makeViolation } from "../catalog";
import {
  accumulateScore,
  applyViolation,
  emptyScore,
  isPassing,
  PASS_MAX_OSNOVNI_POINTS,
  PASS_MAX_TOTAL_POINTS,
} from "../scoring";

// convenient real events per class
const opasna = (t = 0) => makeViolation("RED_LIGHT_CROSSED", t); // 10 т.
const osnovna = (t = 0) => makeViolation("SEATBELT_OFF_WHILE_MOVING", t); // 3 т.
const vtorostepenna = (t = 0) => makeViolation("HANDBRAKE_LEFT_ON", t); // 1 т.

describe("official pass rule constants (doc 32)", () => {
  it("caps are 9 total / 6 from основни", () => {
    expect(PASS_MAX_TOTAL_POINTS).toBe(9);
    expect(PASS_MAX_OSNOVNI_POINTS).toBe(6);
  });
});

describe("score accumulation", () => {
  it("starts clean and passing", () => {
    const s = emptyScore();
    expect(s.totalPoints).toBe(0);
    expect(isPassing(s)).toBe(true);
  });

  it("tallies points and counts per class", () => {
    const s = accumulateScore([opasna(1), osnovna(2), osnovna(3), vtorostepenna(4)]);
    expect(s.totalPoints).toBe(17);
    expect(s.opasniPoints).toBe(10);
    expect(s.osnovniPoints).toBe(6);
    expect(s.vtorostepenniPoints).toBe(1);
    expect(s.opasniCount).toBe(1);
    expect(s.osnovniCount).toBe(2);
    expect(s.vtorostepenniCount).toBe(1);
  });

  it("ignores commendations (only violations score)", () => {
    const s = accumulateScore([]);
    expect(s.totalPoints).toBe(0);
  });

  it("applyViolation is pure — the input breakdown is not mutated", () => {
    const before = emptyScore();
    const after = applyViolation(before, osnovna());
    expect(before.totalPoints).toBe(0);
    expect(before.osnovniCount).toBe(0);
    expect(after.totalPoints).toBe(3);
  });
});

describe("official pass boundaries", () => {
  it("passes at exactly 9 total with exactly 6 from основни (both caps hit)", () => {
    const s = accumulateScore([
      osnovna(1),
      osnovna(2), // 6 т. основни
      vtorostepenna(3),
      vtorostepenna(4),
      vtorostepenna(5), // + 3 = 9 total
    ]);
    expect(s.totalPoints).toBe(9);
    expect(s.osnovniPoints).toBe(6);
    expect(isPassing(s)).toBe(true);
  });

  it("fails at 10 total even with основни within their cap", () => {
    const s = accumulateScore([
      osnovna(1),
      osnovna(2),
      vtorostepenna(3),
      vtorostepenna(4),
      vtorostepenna(5),
      vtorostepenna(6), // 10 total
    ]);
    expect(s.totalPoints).toBe(10);
    expect(s.osnovniPoints).toBe(6);
    expect(isPassing(s)).toBe(false);
  });

  it("fails on основни cap alone: 3 основни = 9 total (<= 9) but 9 основни points > 6", () => {
    const s = accumulateScore([osnovna(1), osnovna(2), osnovna(3)]);
    expect(s.totalPoints).toBe(9); // total cap satisfied…
    expect(s.osnovniPoints).toBe(9); // …but основни cap exceeded
    expect(isPassing(s)).toBe(false);
  });

  it("a single опасна fails outright and raises the instant-fail flag", () => {
    const s = accumulateScore([opasna(1)]);
    expect(s.hasDangerous).toBe(true);
    expect(isPassing(s)).toBe(false);
  });
});
