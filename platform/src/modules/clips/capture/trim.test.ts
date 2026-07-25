/**
 * Trim-window math (clips/capture/trim.ts) — pure battery: fault detection per
 * the annotation convention, the [t−8, t+4] window, the 10 s floor, and the
 * short-trace degradations.
 */
import { describe, expect, it } from "vitest";
import {
  CLIP_MIN_S,
  clipWindowFor,
  faultTimeSec,
  recordingWindow,
  type TrimTraceLike,
} from "./trim";

function trace(durationSec: number, annotations: number[]): TrimTraceLike {
  return {
    meta: { durationSec },
    events: annotations.map((tSec) => ({ tSec, kind: "annotation" })),
  };
}

describe("faultTimeSec — the annotation convention", () => {
  it("picks the FIRST mid-run annotation (setup at 0 and end moral skipped)", () => {
    // The sc-ac-aquaplane shape: 0 = setup, 14.7/21.3 = the fault landing,
    // 27.0 (= end) = the moral.
    expect(faultTimeSec(trace(27, [0, 14.7, 21.3, 27]))).toBe(14.7);
  });

  it("no mid-run annotation → the last annotation after t=0 (the crash)", () => {
    // The sc-junction-stop shape: events at 0 and at the end only.
    expect(faultTimeSec(trace(37.1, [0, 37.1]))).toBe(37.1);
  });

  it("non-annotation events are ignored", () => {
    const t: TrimTraceLike = {
      meta: { durationSec: 30 },
      events: [
        { tSec: 0, kind: "annotation" },
        { tSec: 5, kind: "glance-rear" },
        { tSec: 12, kind: "signal-on" },
        { tSec: 18, kind: "annotation" },
        { tSec: 30, kind: "annotation" },
      ],
    };
    expect(faultTimeSec(t)).toBe(18);
  });

  it("no annotations at all → the trace end", () => {
    expect(faultTimeSec(trace(22, []))).toBe(22);
  });

  it("only the t=0 setup annotation → the trace end", () => {
    expect(faultTimeSec(trace(22, [0]))).toBe(22);
  });
});

describe("recordingWindow — [max(0, t−8), min(end, t+4)] with the 10 s floor", () => {
  it("mid-trace fault → the plain 12 s window", () => {
    expect(recordingWindow(60, 20)).toEqual({ startSec: 12, endSec: 24 });
  });

  it("early fault clamps the start at 0", () => {
    // t=3: [0, 7] → floor-grow forward to 10 s.
    expect(recordingWindow(60, 3)).toEqual({ startSec: 0, endSec: 10 });
  });

  it("fault at the very end grows backward to the 10 s floor", () => {
    // t=end=37.1: [29.1, 37.1] is 8 s → start pulled to 27.1.
    const w = recordingWindow(37.1, 37.1);
    expect(w.endSec).toBeCloseTo(37.1, 6);
    expect(w.endSec - w.startSec).toBeCloseTo(CLIP_MIN_S, 6);
  });

  it("trace shorter than 10 s → the whole trace, never padded", () => {
    // The sc-park-bay-exit-rev shape (4.8 s traces).
    expect(recordingWindow(4.8, 4.8)).toEqual({ startSec: 0, endSec: 4.8 });
  });

  it("fault beyond the duration is clamped in", () => {
    expect(recordingWindow(30, 99)).toEqual({ startSec: 20, endSec: 30 });
  });

  it("window always sits inside the trace and is 10–12 s when the trace allows", () => {
    for (const dur of [10, 12, 15, 20, 27.03, 37.7, 56.7, 79.7]) {
      for (const t of [0, 0.5, dur / 3, dur / 2, dur - 1, dur]) {
        const w = recordingWindow(dur, t);
        expect(w.startSec).toBeGreaterThanOrEqual(0);
        expect(w.endSec).toBeLessThanOrEqual(dur);
        expect(w.endSec - w.startSec).toBeGreaterThanOrEqual(Math.min(CLIP_MIN_S, dur) - 1e-9);
        expect(w.endSec - w.startSec).toBeLessThanOrEqual(12 + 1e-9);
      }
    }
  });
});

describe("clipWindowFor — composed", () => {
  it("centers on the first mid-run annotation", () => {
    expect(clipWindowFor(trace(27, [0, 14.7, 21.3, 27]))).toEqual({
      startSec: 14.7 - 8,
      endSec: 14.7 + 4,
    });
  });

  it("is deterministic", () => {
    const t = trace(37.1, [0, 37.1]);
    expect(clipWindowFor(t)).toEqual(clipWindowFor(t));
  });
});
