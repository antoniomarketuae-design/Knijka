import { describe, expect, it } from "vitest";
import { leadGapFor, rearGapFor } from "./system";
import { VEHICLE_PROFILE_LENGTH_M } from "./types";

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

/**
 * T17(e) — the follow gap is measured against the LEAD'S OWN BODY.
 *
 * The query subtracted one fixed 4.1 m car constant from the centre-to-centre
 * distance no matter what was in front. A 14 m tram or a 34.4 m train
 * therefore graded as if its rear bumper were 5 m / 15.2 m further away than
 * it is, and the student was told he had road that does not exist. Cars are
 * unchanged to the bit — the whole pre-profile world is byte-identical.
 */
describe("leadGapFor · the lead's own profile length (ledger T17e)", () => {
  const centres = 20;

  it("a car and a profile-less agent are IDENTICAL to the legacy constant", () => {
    const legacy = 15.9; // 20 − 4.1
    expect(leadGapFor([{ x: 0, y: centres }], 0, 0, 0)).toBeCloseTo(legacy, 10);
    expect(leadGapFor([{ x: 0, y: centres, profile: "car" }], 0, 0, 0)).toBeCloseTo(legacy, 10);
  });

  it("a longer body reports the shorter — and true — gap", () => {
    // gap = centres − (playerHalf 2.05 + leadHalf)
    const expected = (p: keyof typeof VEHICLE_PROFILE_LENGTH_M) =>
      centres - (VEHICLE_PROFILE_LENGTH_M.car / 2 + VEHICLE_PROFILE_LENGTH_M[p] / 2);
    expect(leadGapFor([{ x: 0, y: centres, profile: "truck" }], 0, 0, 0)).toBeCloseTo(expected("truck"), 10);
    expect(leadGapFor([{ x: 0, y: centres, profile: "tram" }], 0, 0, 0)).toBeCloseTo(expected("tram"), 10);
    expect(leadGapFor([{ x: 0, y: centres, profile: "train" }], 0, 0, 0)).toBeCloseTo(expected("train"), 10);
    // The measured deltas against the legacy 15.9 m, spelled out:
    expect(15.9 - leadGapFor([{ x: 0, y: centres, profile: "truck" }], 0, 0, 0)).toBeCloseTo(1.7, 6);
    expect(15.9 - leadGapFor([{ x: 0, y: centres, profile: "tram" }], 0, 0, 0)).toBeCloseTo(4.95, 6);
    expect(15.9 - leadGapFor([{ x: 0, y: centres, profile: "train" }], 0, 0, 0)).toBeCloseTo(15.15, 6);
  });

  it("a SHORT body buys no slack — the subtrahend is floored at the car constant", () => {
    // Unfloored, a 1.8 m cyclist proxy would report 1.15 m MORE room and stop
    // FOLLOWING_TOO_CLOSE firing behind a rider (caught by
    // s-w4-bot-completion.test.ts on sc-vu-cyclist-group's cut-in). A
    // vulnerable road user earns a bigger buffer, never a smaller one.
    for (const p of ["cyclist", "childCyclist", "animal", "van", "emergency"] as const) {
      expect(leadGapFor([{ x: 0, y: centres, profile: p }], 0, 0, 0)).toBeLessThanOrEqual(15.9);
    }
    expect(leadGapFor([{ x: 0, y: centres, profile: "cyclist" }], 0, 0, 0)).toBeCloseTo(15.9, 10);
  });

  it("rearGapFor uses the same body table", () => {
    expect(rearGapFor([{ x: 0, y: -centres }], 0, 0, 0)).toBeCloseTo(15.9, 10);
    expect(rearGapFor([{ x: 0, y: -centres, profile: "truck" }], 0, 0, 0)).toBeCloseTo(14.2, 6);
  });
});
