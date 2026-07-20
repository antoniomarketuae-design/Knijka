/**
 * MistakeReplay core — fit math, playhead looping, marker timing and the
 * defensive district derivation, plus a smoke pass over a real committed
 * trace + district so the 2D replay stays glued to the shipped artifacts.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseScenarioTrace, type ScenarioTrace } from "@/modules/sim/traces";
import {
  REPLAY_END_HOLD_SEC,
  REPLAY_FLASH_SEC,
  REPLAY_MAX_SCALE,
  REPLAY_MAX_STEP_SEC,
  activeMarkerIndex,
  advancePlayhead,
  annotationMarkers,
  crossingPointsOf,
  districtRoadPolylines,
  fitReplayView,
  flashAlpha,
  flashIndex,
  markerAtStep,
  replayToCanvas,
  stepTimes,
  traceBounds,
} from "./mistakeReplayCore";

function makeTrace(partial?: Partial<ScenarioTrace>): ScenarioTrace {
  return {
    meta: { scenarioId: "sc-test", kind: "mistake", version: 1, durationSec: 10 },
    samples: [
      { tSec: 0, x: 0, y: 0, headingDeg: 0, steerRad: 0, speedKmh: 0, gear: 1, indicator: "off", brakeOn: false, throttleOn: true },
      { tSec: 10, x: 10, y: 0, headingDeg: 0, steerRad: 0, speedKmh: 20, gear: 1, indicator: "off", brakeOn: false, throttleOn: true },
    ],
    events: [],
    ...partial,
  };
}

describe("traceBounds", () => {
  it("boxes the ground path", () => {
    const trace = makeTrace({
      samples: [
        { tSec: 0, x: -5, y: 4, headingDeg: 0, steerRad: 0, speedKmh: 0, gear: 1, indicator: "off", brakeOn: false, throttleOn: false },
        { tSec: 1, x: 10, y: 20, headingDeg: 0, steerRad: 0, speedKmh: 0, gear: 1, indicator: "off", brakeOn: false, throttleOn: false },
        { tSec: 2, x: 0, y: 0, headingDeg: 0, steerRad: 0, speedKmh: 0, gear: 1, indicator: "off", brakeOn: false, throttleOn: false },
      ],
    });
    expect(traceBounds(trace)).toEqual({ minX: -5, minY: 0, maxX: 10, maxY: 20 });
  });
});

describe("fitReplayView", () => {
  const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 50 };

  it("fits with margin, limited by the tighter axis", () => {
    const view = fitReplayView(bounds, 200, 100, 10);
    expect(view.scale).toBeCloseTo(Math.min(180 / 100, 80 / 50), 6);
  });

  it("centers the bounds on the canvas", () => {
    const view = fitReplayView(bounds, 200, 100, 10);
    expect(replayToCanvas(view, 50, 25)).toEqual([100, 50]);
  });

  it("renders north up (larger y → smaller canvasY)", () => {
    const view = fitReplayView(bounds, 200, 100, 10);
    const [, southPy] = replayToCanvas(view, 50, 0);
    const [, northPy] = replayToCanvas(view, 50, 50);
    expect(northPy).toBeLessThan(southPy);
  });

  it("clamps the zoom for near-point traces", () => {
    const view = fitReplayView({ minX: 0, minY: 0, maxX: 1, maxY: 1 }, 400, 400, 10);
    expect(view.scale).toBe(REPLAY_MAX_SCALE);
  });

  it("degrades safely on a zero-size canvas", () => {
    const view = fitReplayView(bounds, 0, 100, 10);
    expect(view.scale).toBe(1);
    expect(replayToCanvas(view, 3, 4)).toEqual([3, -4]);
  });
});

describe("advancePlayhead", () => {
  it("advances at the given dt", () => {
    expect(advancePlayhead(1, 0.016, 10)).toBeCloseTo(1.016, 6);
  });

  it("clamps a background-tab jump", () => {
    expect(advancePlayhead(0, 5, 10)).toBe(REPLAY_MAX_STEP_SEC);
  });

  it("ignores negative dt", () => {
    expect(advancePlayhead(2, -1, 10)).toBe(2);
  });

  it("holds past the end, then loops to 0", () => {
    const nearEnd = 10 + REPLAY_END_HOLD_SEC - 0.2;
    expect(advancePlayhead(nearEnd, 0.1, 10)).toBeCloseTo(nearEnd + 0.1, 6);
    expect(advancePlayhead(nearEnd, 0.25, 10)).toBe(0);
  });

  it("recovers a corrupt playhead to 0", () => {
    expect(advancePlayhead(Number.NaN, 0.016, 10)).toBeCloseTo(0.016, 6);
  });
});

describe("annotationMarkers", () => {
  const trace = makeTrace({
    events: [
      { tSec: 2, kind: "glance-left" },
      { tSec: 5, kind: "annotation", textBg: "Късна спирачка." },
      { tSec: 10, kind: "annotation" },
    ],
  });

  it("locates only annotations, via the shared interpolation", () => {
    const markers = annotationMarkers(trace);
    expect(markers).toHaveLength(2);
    // Linear path (0,0)→(10,0): t=5 sits at x=5.
    expect(markers[0].x).toBeCloseTo(5, 6);
    expect(markers[0].y).toBeCloseTo(0, 6);
    expect(markers[0].labelBg).toBe("Късна спирачка.");
    // Stored text only — an absent textBg stays empty, never invented.
    expect(markers[1].labelBg).toBe("");
  });

  it("activeMarkerIndex lingers, then clears", () => {
    const markers = annotationMarkers(trace);
    expect(activeMarkerIndex(markers, 4.9)).toBe(-1);
    expect(activeMarkerIndex(markers, 5)).toBe(0);
    expect(activeMarkerIndex(markers, 8.9)).toBe(0);
    expect(activeMarkerIndex(markers, 10)).toBe(1);
    expect(activeMarkerIndex(markers, 14.5)).toBe(-1);
  });
});

describe("flash timing", () => {
  const trace = makeTrace({
    events: [
      { tSec: 5, kind: "annotation", textBg: "А" },
      { tSec: 6, kind: "annotation", textBg: "Б" },
    ],
  });
  const markers = annotationMarkers(trace);

  it("flashes only inside the pulse window", () => {
    expect(flashIndex(markers, 4.99)).toBe(-1);
    expect(flashIndex(markers, 5)).toBe(0);
    expect(flashIndex(markers, 5 + REPLAY_FLASH_SEC + 0.01)).toBe(1); // Б still hot
    expect(flashIndex(markers, 6 + REPLAY_FLASH_SEC + 0.01)).toBe(-1);
  });

  it("the newest fired marker wins", () => {
    expect(flashIndex(markers, 6.2)).toBe(1);
  });

  it("alpha decays linearly from 1 to 0", () => {
    expect(flashAlpha(5, 5)).toBe(1);
    expect(flashAlpha(5, 5 + REPLAY_FLASH_SEC / 2)).toBeCloseTo(0.5, 6);
    expect(flashAlpha(5, 5 + REPLAY_FLASH_SEC)).toBeCloseTo(0, 6);
    expect(flashAlpha(5, 4.9)).toBe(0);
    expect(flashAlpha(5, 5 + REPLAY_FLASH_SEC + 0.1)).toBe(0);
  });
});

describe("reduced-motion steps", () => {
  const trace = makeTrace({
    events: [
      { tSec: 0.1, kind: "annotation", textBg: "Старт" },
      { tSec: 5, kind: "annotation", textBg: "Среда" },
      { tSec: 9.9, kind: "annotation", textBg: "Край" },
    ],
  });
  const markers = annotationMarkers(trace);

  it("merges stops touching the start and the end", () => {
    expect(stepTimes(trace, markers)).toEqual([0, 5, 9.9]);
  });

  it("finds the marker sitting at a stop", () => {
    expect(markerAtStep(markers, 0)?.labelBg).toBe("Старт");
    expect(markerAtStep(markers, 5)?.labelBg).toBe("Среда");
    expect(markerAtStep(markers, 2.5)).toBeNull();
  });
});

describe("district derivation (defensive)", () => {
  const valid = {
    roads: {
      edges: [
        { geometry: [[0, 0], [10, 5], [20, 0]], class: "residential" },
        { geometry: [[0, 0], ["bad", 1], [3, 3]] }, // junk vertex dropped
        { geometry: [[1, 1]] }, // too short after cleaning → dropped
      ],
    },
    crossings: [{ x: 4, y: 5 }, { x: Number.NaN, y: 1 }, "junk", { x: 7 }],
  };

  it("derives drawable road polylines, dropping junk", () => {
    const polylines = districtRoadPolylines(valid);
    expect(polylines).not.toBeNull();
    expect(polylines).toHaveLength(2);
    expect(polylines![0].points).toEqual([[0, 0], [10, 5], [20, 0]]);
    expect(polylines![0].kind).toBe("road");
    expect(polylines![1].points).toEqual([[0, 0], [3, 3]]);
  });

  it("degrades to null when nothing is drawable", () => {
    expect(districtRoadPolylines(null)).toBeNull();
    expect(districtRoadPolylines({})).toBeNull();
    expect(districtRoadPolylines({ roads: { edges: [{ geometry: [[1, 1]] }] } })).toBeNull();
  });

  it("keeps only finite crossing points", () => {
    expect(crossingPointsOf(valid)).toEqual([{ x: 4, y: 5 }]);
    expect(crossingPointsOf({})).toEqual([]);
  });
});

describe("committed artifacts smoke", () => {
  it("replays a real mistake trace inside its fitted canvas", () => {
    const file = path.resolve(
      __dirname,
      "../../../public/traces/sc-crossing-child-ball/mistake-too-fast.trace.json",
    );
    const trace = parseScenarioTrace(JSON.parse(fs.readFileSync(file, "utf8")));
    expect(trace).not.toBeNull();

    const markers = annotationMarkers(trace!);
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) {
      expect(m.labelBg.length).toBeGreaterThan(0); // committed teach copy present
    }

    const view = fitReplayView(traceBounds(trace!), 260, 190, 14);
    for (const m of markers) {
      const [px, py] = replayToCanvas(view, m.x, m.y);
      expect(px).toBeGreaterThanOrEqual(0);
      expect(px).toBeLessThanOrEqual(260);
      expect(py).toBeGreaterThanOrEqual(0);
      expect(py).toBeLessThanOrEqual(190);
    }
  });

  it("derives drawable context from a real district", () => {
    const file = path.resolve(__dirname, "../../../public/world/district-v1.json");
    const raw: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    const polylines = districtRoadPolylines(raw);
    expect(polylines).not.toBeNull();
    expect(polylines!.length).toBeGreaterThan(100);
    expect(crossingPointsOf(raw).length).toBeGreaterThan(0);
  });
});
