import { describe, expect, it } from "vitest";
import { computeCostMicroUsd, PRICING } from "./cost";

describe("computeCostMicroUsd", () => {
  it("prices 1M input tokens at $3.00 (3,000,000 µUSD)", () => {
    expect(computeCostMicroUsd(1_000_000, 0)).toBe(3_000_000);
  });

  it("prices 1M output tokens at $15.00 (15,000,000 µUSD)", () => {
    expect(computeCostMicroUsd(0, 1_000_000)).toBe(15_000_000);
  });

  it("combines input and output", () => {
    // Typical tutor exchange: ~1200 in / ~200 out.
    expect(computeCostMicroUsd(1200, 200)).toBe(1200 * 3 + 200 * 15);
  });

  it("costs zero for zero tokens", () => {
    expect(computeCostMicroUsd(0, 0)).toBe(0);
  });

  it("books whole micro-USD (integer, rounded up)", () => {
    const cost = computeCostMicroUsd(1, 1);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(18); // 3 + 15
  });

  it("pins the model the pricing was written for", () => {
    // If the model changes, PRICING must be re-verified (see cost.ts).
    expect(PRICING.model).toBe("claude-sonnet-5");
  });
});
