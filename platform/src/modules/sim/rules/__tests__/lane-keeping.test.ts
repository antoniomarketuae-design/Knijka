import { describe, expect, it } from "vitest";
import { DEFAULT_RULE_CONFIG } from "../types";
import { codes, drive, tick } from "./fixtures";

// laneKeepMaxOffsetM scales with the perceptual road width; straddle just
// past it. laneKeepSustainSec = 3, movingSpeedKmh = 5.
const OFF = DEFAULT_RULE_CONFIG.laneKeepMaxOffsetM + 0.3;
const straddle = (t: number) => tick(t, { speedKmh: 30, maxSpeedKmh: 50, laneOffsetM: OFF });
const centred = (t: number) => tick(t, { speedKmh: 30, maxSpeedKmh: 50, laneOffsetM: 0 });

// THE SPAWN-POSE LATCH (doc 87 B23/B26/B33). POOR_LANE_KEEPING grades a
// DEPARTURE from the lane, so every fixture below opens with one compliant
// frame — which is also what a real drive does: a car does not teleport onto
// the paint, it drifts there from inside its lane. A drive with NO such frame
// is the founder's broken case and has its own test at the bottom.
describe("lane-keeping detector", () => {
  it("fires after sustained straddling while moving", () => {
    const ticks = [centred(0), ...[1, 2, 3, 4, 5].map(straddle)];
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
      centred(0), // in his lane — where the lesson meant to put him
      straddle(1), straddle(2), straddle(3), straddle(4), // first episode fires ~t=4
      centred(5), // re-centre → reset
      straddle(6), straddle(7), straddle(8), straddle(9), // second episode fires ~t=9
    ];
    const fires = codes(drive(ticks).events).filter((c) => c === "POOR_LANE_KEEPING");
    expect(fires).toHaveLength(2);
  });

  // -- doc 87 B23/B26/B33 ---------------------------------------------------
  it("a car PLACED astride the paint, that never left it, is never convicted", () => {
    // The founder's four-of-four case: tj-*-v1 spawnPoints author x = 0 (the
    // road CENTRELINE) while the lane centre is 4.06 m off it, so the drill
    // hands him the car already straddling. He held the taught speed, drove
    // dead straight for 32 s, and was billed a второстепенна for it. You cannot
    // depart from a lane you were never in.
    const ticks = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(straddle);
    expect(codes(drive(ticks).events)).not.toContain("POOR_LANE_KEEPING");
  });

  it("…and the very first frame in his own lane arms it again", () => {
    // Data half fixed (or the student steers right once): grading resumes
    // byte-identically to shipped.
    const ticks = [
      straddle(0), straddle(1), // handed to him astride — ungraded
      centred(2), // he finds his lane
      straddle(3), straddle(4), straddle(5), straddle(6), // and leaves it → graded
    ];
    expect(codes(drive(ticks).events)).toContain("POOR_LANE_KEEPING");
  });
});
