import { describe, expect, it } from "vitest";
import { isWrongWay } from "../worldRuntime";

// tangent = geometry-forward unit dir (dx east, dy north); heading 0 = north, cw.
describe("isWrongWay", () => {
  it("never flags a two-way edge", () => {
    expect(isWrongWay(false, [0, 1], 180)).toBe(false);
  });

  it("flags heading opposed to the one-way flow", () => {
    expect(isWrongWay(true, [0, 1], 180)).toBe(true); // flow north, heading south
    expect(isWrongWay(true, [1, 0], 270)).toBe(true); // flow east, heading west
  });

  it("allows heading with the flow (incl. a modest deviation)", () => {
    expect(isWrongWay(true, [0, 1], 0)).toBe(false);
    expect(isWrongWay(true, [0, 1], 20)).toBe(false);
  });

  it("allows a perpendicular heading (turning across)", () => {
    expect(isWrongWay(true, [0, 1], 90)).toBe(false);
  });
});
