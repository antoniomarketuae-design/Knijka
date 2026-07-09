import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

// keepRightSustainSec = 8 → needs a long stint in the left lane, not a brief overtake.
describe("keep-right detector", () => {
  it("fires after a prolonged stint in a left lane on a multi-lane road", () => {
    const ticks = Array.from({ length: 10 }, (_, t) =>
      tick(t, { speedKmh: 40, laneId: 1, laneCount: 2 }),
    );
    expect(codes(drive(ticks).events)).toContain("NOT_KEEPING_RIGHT");
  });

  it("does not fire in the rightmost lane", () => {
    const ticks = Array.from({ length: 10 }, (_, t) =>
      tick(t, { speedKmh: 40, laneId: 0, laneCount: 2 }),
    );
    expect(codes(drive(ticks).events)).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("does not fire on a single-lane road", () => {
    const ticks = Array.from({ length: 10 }, (_, t) =>
      tick(t, { speedKmh: 40, laneId: 1, laneCount: 1 }),
    );
    expect(codes(drive(ticks).events)).not.toContain("NOT_KEEPING_RIGHT");
  });

  it("does not fire for a brief overtake (under the sustain window)", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 40, laneId: 1, laneCount: 2 }));
    expect(codes(drive(ticks).events)).not.toContain("NOT_KEEPING_RIGHT");
  });
});
