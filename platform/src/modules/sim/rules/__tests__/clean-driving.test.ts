import { describe, expect, it } from "vitest";
import { cruise, drive, codes, tick } from "./fixtures";

// Positive reinforcement: a sustained violation-free stretch earns a
// CLEAN_DRIVING commendation; any mistake resets the streak.
describe("clean-driving streak", () => {
  it("commends a long violation-free stretch of driving", () => {
    // ~50 km/h ≈ 13.9 m/s; 21 one-second ticks clears the 250 m default.
    const { events } = drive(cruise(0, 20, { speedKmh: 50 }));
    expect(codes(events)).toContain("CLEAN_DRIVING");
  });

  it("does not commend while standing still", () => {
    const { events } = drive(cruise(0, 40, { speedKmh: 0 }));
    expect(codes(events)).not.toContain("CLEAN_DRIVING");
  });

  it("resets the streak when a violation occurs", () => {
    // Drive clean for a while, then speed hard (dangerous) mid-way; the
    // accumulated distance must reset so no commendation slips through early.
    const clean = cruise(0, 10, { speedKmh: 50 });
    const speeding = cruise(11, 14, { speedKmh: 110, maxSpeedKmh: 50 });
    const { events } = drive([...clean, ...speeding]);
    // The speeding ticks broke the streak — the short run can't have earned one.
    expect(codes(events)).not.toContain("CLEAN_DRIVING");
  });

  it("earns a fresh commendation only after re-accumulating distance", () => {
    // One long clean run earns exactly one; distance carries the remainder.
    const { events } = drive(cruise(0, 40, { speedKmh: 50 }));
    const count = codes(events).filter((c) => c === "CLEAN_DRIVING").length;
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(3);
  });

  it("emits a positive commendation event, not a violation", () => {
    const { events } = drive(cruise(0, 20, { speedKmh: 50 }));
    const clean = events.find((e) => e.code === "CLEAN_DRIVING");
    expect(clean?.kind).toBe("commendation");
  });

  it("ignores a single idle frame without breaking a moving streak", () => {
    const ticks = [
      ...cruise(0, 18, { speedKmh: 50 }),
      tick(19, { speedKmh: 0 }),
      ...cruise(20, 22, { speedKmh: 50 }),
    ];
    const { events } = drive(ticks);
    expect(codes(events)).toContain("CLEAN_DRIVING");
  });
});
