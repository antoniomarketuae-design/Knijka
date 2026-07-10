import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../types";
import { codes, drive, tick } from "./fixtures";

// laneKeepMaxOffsetM scales with the perceptual road width; straddle just
// past it. laneKeepSustainSec = 3, movingSpeedKmh = 5.
const OFF = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM + 0.3;
const straddle = (t: number) => tick(t, { speedKmh: 30, maxSpeedKmh: 50, laneOffsetM: OFF });
const centred = (t: number) => tick(t, { speedKmh: 30, maxSpeedKmh: 50, laneOffsetM: 0 });

describe("lane-keeping detector", () => {
  it("fires after sustained straddling while moving", () => {
    const ticks = [0, 1, 2, 3, 4].map(straddle);
    expect(codes(drive(ticks).events)).toContain("POOR_LANE_KEEPING");
  });

  it("does not fire when centred", () => {
    const ticks = [0, 1, 2, 3, 4].map(centred);
    expect(codes(drive(ticks).events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("does not fire on a brief drift shorter than the sustain window", () => {
    const ticks = [straddle(0), straddle(1), centred(2), centred(3)];
    expect(codes(drive(ticks).events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("does not fire while stopped", () => {
    const ticks = [0, 1, 2, 3, 4].map((t) => tick(t, { speedKmh: 0, laneOffsetM: OFF }));
    expect(codes(drive(ticks).events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("fires once per episode and re-arms after re-centring", () => {
    const ticks = [
      straddle(0), straddle(1), straddle(2), straddle(3), // first episode fires ~t=3
      centred(4), // re-centre → reset
      straddle(5), straddle(6), straddle(7), straddle(8), // second episode fires ~t=8
    ];
    const fires = codes(drive(ticks).events).filter((c) => c === "POOR_LANE_KEEPING");
    expect(fires).toHaveLength(2);
  });
});
