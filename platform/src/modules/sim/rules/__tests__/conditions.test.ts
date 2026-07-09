import { describe, expect, it } from "vitest";
import { codes, drive, tick } from "./fixtures";

// limit 50 · rain factor 0.85 → conditionLimit 42.5 · sustain 3 s.
describe("speed-for-conditions detector", () => {
  it("fires when within the limit but too fast for the rain", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 48, maxSpeedKmh: 50, rain: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire at the same speed in the dry", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 48, maxSpeedKmh: 50 }));
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });

  it("does not fire when suitably slow for the rain", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 40, maxSpeedKmh: 50, rain: true, headlights: "low" }),
    );
    expect(codes(drive(ticks).events)).not.toContain("SPEED_TOO_FAST_FOR_CONDITIONS");
  });
});

describe("lights-in-rain detector", () => {
  it("fires when driving in daytime rain without low beam", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) =>
      tick(t, { speedKmh: 30, maxSpeedKmh: 50, rain: true, headlights: "off" }),
    );
    expect(codes(drive(ticks).events)).toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire with low beam on", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 30, rain: true, headlights: "low" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });

  it("does not fire when dry", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 30, headlights: "off" }));
    expect(codes(drive(ticks).events)).not.toContain("HEADLIGHTS_OFF_IN_RAIN");
  });
});
