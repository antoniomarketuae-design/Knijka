import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

// followSafeSeconds 1.8 · followMinGapM 4 · followMinSpeedKmh 15 · sustain 2 s.
// At 40 km/h the safe gap ≈ (40/3.6)·1.8 ≈ 20 m.
describe("following-distance detector", () => {
  it("fires when tailgating above stop-and-go speed", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 40, leadGapM: 8 }));
    expect(codes(drive(ticks).events)).toContain("FOLLOWING_TOO_CLOSE");
  });

  it("does not fire with a safe gap", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 40, leadGapM: 30 }));
    expect(codes(drive(ticks).events)).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("does not fire when the road ahead is clear", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 40 })); // leadGapM absent = clear
    expect(codes(drive(ticks).events)).not.toContain("FOLLOWING_TOO_CLOSE");
  });

  it("does not fire in stop-and-go (below the follow-min speed)", () => {
    const ticks = [0, 1, 2, 3].map((t) => tick(t, { speedKmh: 10, leadGapM: 3 }));
    expect(codes(drive(ticks).events)).not.toContain("FOLLOWING_TOO_CLOSE");
  });
});
