import { describe, expect, it } from "vitest";
import { leadGapFor } from "./system";

// VEHICLE_LENGTH_M = 4.1, LEAD_CORRIDOR_M = 1.8. Player at origin.
describe("leadGapFor", () => {
  it("returns the bumper gap to a car straight ahead (facing north)", () => {
    expect(leadGapFor([{ x: 0, y: 20 }], 0, 0, 0)).toBeCloseTo(15.9);
  });

  it("ignores a car behind", () => {
    expect(leadGapFor([{ x: 0, y: -20 }], 0, 0, 0)).toBe(Infinity);
  });

  it("ignores a car outside the lane corridor", () => {
    expect(leadGapFor([{ x: 10, y: 20 }], 0, 0, 0)).toBe(Infinity);
  });

  it("picks the nearest of several cars ahead", () => {
    expect(leadGapFor([{ x: 0, y: 30 }, { x: 0.5, y: 10 }], 0, 0, 0)).toBeCloseTo(5.9);
  });

  it("respects heading (facing east)", () => {
    expect(leadGapFor([{ x: 20, y: 0 }], 0, 0, 90)).toBeCloseTo(15.9);
  });

  it("clamps an overlapping car to 0, never negative", () => {
    expect(leadGapFor([{ x: 0, y: 2 }], 0, 0, 0)).toBe(0);
  });
});
