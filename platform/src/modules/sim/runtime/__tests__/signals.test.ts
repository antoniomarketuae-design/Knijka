import { describe, expect, it } from "vitest";
import type { SignalPhase } from "../../contracts";
import { createWorldRuntime, SIGNAL_TIMING } from "..";
import { loadDistrict } from "./helpers";

/**
 * Signal controller against the real district: 19 signalized intersection
 * nodes + 24 signalized crossings. Reference junction for single-node checks:
 * n179974491 — бул. Свети Климент Охридски × ул. Трайко Станоев (hand-polish
 * junction #5 in docs/simulation/17, the only signalized node in its area).
 */
const JUNCTION = "n179974491";

describe("signal controller", () => {
  const district = loadDistrict();

  it("is deterministic: two runtimes fed the same dt sequence agree everywhere", () => {
    const a = createWorldRuntime(district);
    const b = createWorldRuntime(district);
    const signalIds = district.intersections.filter((i) => i.signalized).map((i) => i.id);
    const dts = [0.016, 0.4, 1.7, 0.016, 3.3, 0.7, 12.9, 0.05];
    for (const dt of dts) {
      a.update(dt);
      b.update(dt);
      for (const id of signalIds) {
        expect(a.signalPhase(id)).toBe(b.signalPhase(id));
      }
    }
  });

  it("cycles green 20s / yellow 3s / redYellow 1s / red 26s (50s total)", () => {
    const rt = createWorldRuntime(district);
    const step = 0.05;
    const seen: Record<SignalPhase, number> = { red: 0, redYellow: 0, green: 0, yellow: 0 };
    const steps = Math.round(SIGNAL_TIMING.cycleSec / step);
    for (let i = 0; i < steps; i++) {
      rt.update(step);
      seen[rt.signalPhase(JUNCTION)] += step;
    }
    expect(seen.green).toBeCloseTo(SIGNAL_TIMING.greenSec, 0);
    expect(seen.yellow).toBeCloseTo(SIGNAL_TIMING.yellowSec, 0);
    expect(seen.redYellow).toBeCloseTo(SIGNAL_TIMING.redYellowSec, 0);
    expect(seen.red).toBeCloseTo(26, 0);
    expect(seen.red + seen.green + seen.yellow + seen.redYellow).toBeCloseTo(
      SIGNAL_TIMING.cycleSec,
      5,
    );
  });

  it("follows the BG phase order red → redYellow → green → yellow → red", () => {
    const rt = createWorldRuntime(district);
    const order: SignalPhase[] = [];
    let last: SignalPhase | null = null;
    for (let t = 0; t < SIGNAL_TIMING.cycleSec * 2; t += 0.05) {
      rt.update(0.05);
      const p = rt.signalPhase(JUNCTION);
      if (p !== last) {
        order.push(p);
        last = p;
      }
    }
    const allowed: Record<SignalPhase, SignalPhase> = {
      red: "redYellow",
      redYellow: "green",
      green: "yellow",
      yellow: "red",
    };
    for (let i = 1; i < order.length; i++) {
      expect(order[i], `after ${order[i - 1]}`).toBe(allowed[order[i - 1]]);
    }
  });

  it("never shows green to both axes of a junction at once — and serves each in turn", () => {
    const rt = createWorldRuntime(district);
    let nsGreen = 0;
    let ewGreen = 0;
    for (let t = 0; t < SIGNAL_TIMING.cycleSec; t += 0.1) {
      rt.update(0.1);
      const ns = rt.signalPhaseForApproach(JUNCTION, 178); // Климент Охридски
      const ew = rt.signalPhaseForApproach(JUNCTION, 74); // Трайко Станоев
      expect(ns === "green" && ew === "green").toBe(false);
      // Also never green against the crossing axis' yellow (clearance is red).
      if (ns === "green") {
        expect(ew).toBe("red");
        nsGreen++;
      }
      if (ew === "green") {
        expect(ns === "red" || ns === "redYellow").toBe(true);
        ewGreen++;
      }
    }
    expect(nsGreen).toBeGreaterThan(0);
    expect(ewGreen).toBeGreaterThan(0);
  });

  it("groups dual-carriageway nodes into one physical junction, separate ones apart", () => {
    const rt = createWorldRuntime(district);
    const clusters = rt.debugSignalClusters();
    const clusterOf = (nodeId: string) =>
      clusters.findIndex((c) => c.memberNodeIds.includes(nodeId));
    // n148570715 / n148572504: two nodes of the same physical junction on
    // бул. Г. М. Димитров west, ~14 m apart.
    expect(clusterOf("n148570715")).toBe(clusterOf("n148572504"));
    expect(clusterOf("n148570715")).toBeGreaterThanOrEqual(0);
    // The reference junction is ~700 m away — must be its own controller.
    expect(clusterOf(JUNCTION)).not.toBe(clusterOf("n148570715"));
    // Every signalized intersection node belongs to exactly one cluster.
    for (const it of district.intersections) {
      if (!it.signalized) continue;
      expect(clusters.filter((c) => c.memberNodeIds.includes(it.id)).length, it.id).toBe(1);
    }
  });

  it("gives different junctions different (deterministic) phase offsets", () => {
    const rt = createWorldRuntime(district);
    const offsets = new Set(rt.debugSignalClusters().map((c) => c.offsetSec));
    expect(offsets.size).toBeGreaterThan(1); // seeded by id, not all in lockstep
    const rt2 = createWorldRuntime(district);
    expect(rt2.debugSignalClusters().map((c) => c.offsetSec)).toEqual(
      rt.debugSignalClusters().map((c) => c.offsetSec),
    );
  });

  it("returns red for unknown signal node ids (fail safe)", () => {
    const rt = createWorldRuntime(district);
    rt.update(10);
    expect(rt.signalPhase("n-does-not-exist")).toBe("red");
  });
});
