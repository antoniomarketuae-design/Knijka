/**
 * rearGapFor — leadGapFor's mirror (PROX rear-proximity HUD channel).
 * Same corridor + bumper constants; only the forward test is flipped. The
 * empty-road case is the cue's honesty contract: NO vehicle ⇒ Infinity ⇒
 * (via stepRearCue) no badge, ever.
 */

import { describe, expect, it } from "vitest";
import { leadGapFor, rearGapFor } from "./system";

// VEHICLE_LENGTH_M = 4.1, LEAD_CORRIDOR_M = 4.0. Player at origin.
describe("rearGapFor", () => {
  it("returns the bumper gap to a car straight behind (facing north)", () => {
    expect(rearGapFor([{ x: 0, y: -20 }], 0, 0, 0)).toBeCloseTo(15.9);
  });

  it("HONESTY: an empty road reports Infinity — no vehicle, no badge", () => {
    expect(rearGapFor([], 0, 0, 0)).toBe(Infinity);
  });

  it("ignores a car ahead", () => {
    expect(rearGapFor([{ x: 0, y: 20 }], 0, 0, 0)).toBe(Infinity);
  });

  it("ignores a car outside the lane corridor", () => {
    expect(rearGapFor([{ x: 10, y: -20 }], 0, 0, 0)).toBe(Infinity);
  });

  it("picks the nearest of several cars behind", () => {
    expect(rearGapFor([{ x: 0, y: -30 }, { x: 0.5, y: -10 }], 0, 0, 0)).toBeCloseTo(5.9);
  });

  it("respects heading (facing east)", () => {
    expect(rearGapFor([{ x: -20, y: 0 }], 0, 0, 90)).toBeCloseTo(15.9);
  });

  it("clamps an overlapping car to 0, never negative", () => {
    expect(rearGapFor([{ x: 0, y: -2 }], 0, 0, 0)).toBe(0);
  });

  it("is leadGapFor's exact mirror: one car reads the same gap from both sides", () => {
    const car = [{ x: 0.5, y: -12 }];
    expect(rearGapFor(car, 0, 0, 0)).toBeCloseTo(leadGapFor(car, 0, 0, 180));
  });
});
