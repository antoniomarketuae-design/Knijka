/**
 * faultMarker — the ground ❌ projection (doc 66 R5, founder round-3
 * „✗ floats over grass"). The clip rig now anchors the fault marker at the
 * CAR's trace pose at faultTimeSec on EVERY map (clip-capture-client.loadRun:
 * `sampleAt(trace, faultTimeSec)` → CaptureGroundMarker → faultMarkerPose),
 * replacing the roof badge that projected onto the horizon over off-road
 * backgrounds. This pins the one thing that can silently break it — the
 * district→three axis mapping — on both a LOT map and a STREET map, so a
 * „wrong axis/scale" regression (the founder's own hypothesis) fails loudly.
 *
 * The invariant: faultMarkerPose(sampleAt(trace, faultTime)) lands on the
 * SAME ground footprint the ShadowCar ghost occupies at that instant. The
 * ghost's pose law (ShadowCar.tsx) is district (x, y) → three (x, GHOST_Y,
 * −y); the marker must share the (x, z) of that footprint (only its height
 * differs — it lies ON the road, the ghost sits a hair lower).
 */

import { describe, expect, it } from "vitest";
import { createTracePoint, sampleAt, type ScenarioTrace, type TraceSample } from "@/modules/sim/traces";
import { faultMarkerPose, FAULT_MARKER_Y } from "./capturePlan";

/** ShadowCar's pose law, ground plane only (ShadowCar.tsx: (x,y)→(x,·,−y)). */
function ghostGroundFootprint(pt: { x: number; y: number }): { x: number; z: number } {
  return { x: pt.x, z: -pt.y };
}

function sample(over: Partial<TraceSample> & { tSec: number; x: number; y: number }): TraceSample {
  return {
    headingDeg: 0,
    steerRad: 0,
    speedKmh: 0,
    gear: 1,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
    ...over,
  };
}

function trace(scenarioId: string, samples: TraceSample[]): ScenarioTrace {
  return {
    meta: { scenarioId, kind: "mistake", version: 1, durationSec: samples[samples.length - 1].tSec },
    samples,
    events: [],
  };
}

/** The client's exact derivation: sample the committed trace at the ENGINE
 *  fault time, then project the ground marker. */
function markerAtFault(t: ScenarioTrace, faultTimeSec: number) {
  const pt = createTracePoint();
  sampleAt(t, faultTimeSec, pt);
  return { pose: faultMarkerPose({ x: pt.x, y: pt.y }), pt };
}

describe("fault marker projection lands on the car (every map)", () => {
  // A LOT map (sc-park-perp-rev-like): tight coords, a reversing pose whose
  // fault instant sits BETWEEN samples (faultTimeSec rarely lands on a sample —
  // the interpolated pose must still carry through to the marker unchanged).
  it("lot map — marker sits on the ghost footprint at the interpolated fault pose", () => {
    const lot = trace("sc-park-perp-rev", [
      sample({ tSec: 0, x: -1.0, y: 30.0, headingDeg: 180, speedKmh: -4, gear: -1 }),
      sample({ tSec: 2, x: -2.6, y: 38.0, headingDeg: 205, speedKmh: -6, gear: -1 }),
      sample({ tSec: 4, x: -4.2, y: 44.0, headingDeg: 232, speedKmh: -3, gear: -1 }),
    ]);
    const faultTimeSec = 3.0; // between the 2 s and 4 s samples → interpolated
    const { pose, pt } = markerAtFault(lot, faultTimeSec);
    const foot = ghostGroundFootprint(pt);

    // The marker's ground (x, z) is the ghost's ground (x, z) — it lands AT the car.
    expect(pose.x).toBeCloseTo(foot.x, 10);
    expect(pose.z).toBeCloseTo(foot.z, 10);
    // …and it lies flat on the road, not floating at camera height (the old badge).
    expect(pose.y).toBe(FAULT_MARKER_Y);
    // Guard the exact axis the founder flagged: z is −y, NEVER +y, and never y·scale.
    expect(pose.z).toBeCloseTo(-pt.y, 10);
    expect(pose.z).not.toBeCloseTo(pt.y, 3);
  });

  // A STREET map (sc-ov-oneway-like): a left turn against a one-way, larger
  // world coords, fault landing exactly on a sample. This is the case whose
  // roof badge floated over the roadside grass (k1) — the ground marker must
  // instead sit on the carriageway at the car.
  it("street map — marker sits on the ghost footprint at the on-sample fault pose", () => {
    const street = trace("sc-ov-oneway", [
      sample({ tSec: 0, x: 0.5, y: 120.0, headingDeg: 0, speedKmh: 40, gear: 3 }),
      sample({ tSec: 4, x: 0.9, y: 176.0, headingDeg: 12, speedKmh: 34, gear: 3 }),
      sample({ tSec: 6, x: -6.4, y: 182.5, headingDeg: 278, speedKmh: 18, gear: 2 }),
      sample({ tSec: 9, x: -28.0, y: 181.0, headingDeg: 272, speedKmh: 22, gear: 3 }),
    ]);
    const faultTimeSec = 6.0; // exactly on the wrong-way-turn sample
    const { pose, pt } = markerAtFault(street, faultTimeSec);
    const foot = ghostGroundFootprint(pt);

    expect(pt.x).toBeCloseTo(-6.4, 10); // sanity: sampled the turn pose
    expect(pose.x).toBeCloseTo(foot.x, 10);
    expect(pose.z).toBeCloseTo(foot.z, 10);
    expect(pose.y).toBe(FAULT_MARKER_Y);
    expect(pose.z).toBeCloseTo(-pt.y, 10);
    expect(pose.z).not.toBeCloseTo(pt.y, 3);
  });

  it("marker never inherits the roof badge's height (it lies on the road)", () => {
    // FAULT_MARKER_Y is a hair above the asphalt (over paint, under the ribbon),
    // nowhere near the 2.9 m roof-badge float that read as detached in space.
    expect(FAULT_MARKER_Y).toBeGreaterThan(0);
    expect(FAULT_MARKER_Y).toBeLessThan(0.2);
  });
});
