// The dev-only cluster seed — the affordance that let the speed readout be
// PHOTOGRAPHED at two and three digits.
//
// The point of pinning it: this thing writes into the cluster's per-frame input
// struct, and the one property that must never rot is that it writes into
// NOTHING else. These assertions are about the seed's blast radius (which
// fields it may touch, and that a missing/garbage param leaves the sampled
// frame exactly as the cockpit filled it), not about how the digits look.

import { describe, expect, it } from "vitest";
import { applyClusterDevSeed, parseClusterDevSeed } from "./clusterDevSeed";
import { createClusterInputs, type ClusterInputs } from "./clusterReadout";

/** A frame as the cockpit's real sampler would have written it. */
function sampled(): ClusterInputs {
  const out = createClusterInputs();
  out.speedKmh = 0;
  out.gearLabel = "P";
  out.seatbeltOn = true;
  out.parkingBrakeOn = false;
  out.engineOn = true;
  return out;
}

describe("parseClusterDevSeed", () => {
  it("returns null when neither param is present — the common case, so the caller can skip the write", () => {
    expect(parseClusterDevSeed("")).toBeNull();
    expect(parseClusterDevSeed("?ghost=demo")).toBeNull();
  });

  it("reads the two- and three-digit speeds the layout is judged on", () => {
    expect(parseClusterDevSeed("?clusterSpeed=58")).toEqual({ speedKmh: 58, gearLabel: null });
    expect(parseClusterDevSeed("?clusterSpeed=132")).toEqual({ speedKmh: 132, gearLabel: null });
  });

  it("reads a selector label independently of the speed", () => {
    expect(parseClusterDevSeed("?clusterGear=D")).toEqual({ speedKmh: null, gearLabel: "D" });
    expect(parseClusterDevSeed("?clusterSpeed=58&clusterGear=M2")).toEqual({
      speedKmh: 58,
      gearLabel: "M2",
    });
  });

  it("never hands the display law a NaN, an Infinity or a negative", () => {
    expect(parseClusterDevSeed("?clusterSpeed=abc")).toBeNull();
    expect(parseClusterDevSeed("?clusterSpeed=")).toBeNull();
    expect(parseClusterDevSeed("?clusterSpeed=Infinity")).toBeNull();
    expect(parseClusterDevSeed("?clusterSpeed=-40")?.speedKmh).toBe(0);
    expect(parseClusterDevSeed("?clusterSpeed=99999")?.speedKmh).toBe(999);
  });

  it("rejects a selector the atlas has no glyph for rather than drawing garbage", () => {
    expect(parseClusterDevSeed("?clusterGear=X")).toBeNull();
    expect(parseClusterDevSeed("?clusterGear=")).toBeNull();
    expect(parseClusterDevSeed("?clusterSpeed=58&clusterGear=X")).toEqual({
      speedKmh: 58,
      gearLabel: null,
    });
  });
});

describe("applyClusterDevSeed", () => {
  it("is a no-op without a seed", () => {
    const out = sampled();
    applyClusterDevSeed(null, out);
    expect(out).toEqual(sampled());
  });

  it("touches ONLY the seeded display channels — every telltale input survives", () => {
    const out = sampled();
    out.seatbeltOn = false;
    out.tempWarnOn = true;
    out.indicatorLeftLit = true;
    applyClusterDevSeed(parseClusterDevSeed("?clusterSpeed=132&clusterGear=D"), out);
    expect(out.speedKmh).toBe(132);
    expect(out.gearLabel).toBe("D");
    // The lamp bank is still whatever the cockpit sampled.
    expect(out.seatbeltOn).toBe(false);
    expect(out.tempWarnOn).toBe(true);
    expect(out.indicatorLeftLit).toBe(true);
    expect(out.engineOn).toBe(true);
    expect(out.parkingBrakeOn).toBe(false);
  });

  it("leaves the sampled selector alone when only a speed is seeded", () => {
    const out = sampled();
    applyClusterDevSeed(parseClusterDevSeed("?clusterSpeed=58"), out);
    expect(out.speedKmh).toBe(58);
    expect(out.gearLabel).toBe("P");
  });
});
