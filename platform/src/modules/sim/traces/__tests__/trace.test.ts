/**
 * ScenarioTrace format — parse (never trust stored JSON) + sampleAt
 * interpolation (position lerp, shortest-arc heading, nearest-sample
 * discrete states, end clamping, zero-alloc out reuse).
 */

import { describe, expect, it } from "vitest";
import {
  activeAnnotationIndex,
  createTracePoint,
  parseScenarioTrace,
  sampleAt,
  serializeScenarioTrace,
  TRACE_VERSION,
  traceAnnotations,
  tracePathForRibbon,
  type ScenarioTrace,
  type TraceSample,
} from "..";

function sample(partial: Partial<TraceSample> & { tSec: number }): TraceSample {
  return {
    x: 0,
    y: 0,
    headingDeg: 0,
    steerRad: 0,
    speedKmh: 0,
    gear: 1,
    indicator: "off",
    brakeOn: false,
    throttleOn: false,
    ...partial,
  };
}

function validTrace(): ScenarioTrace {
  return {
    meta: { scenarioId: "sc-test", kind: "shadow", version: TRACE_VERSION, durationSec: 2 },
    samples: [
      sample({ tSec: 0, x: 0, y: 0, headingDeg: 350, speedKmh: 10, indicator: "left" }),
      sample({ tSec: 1, x: 10, y: 20, headingDeg: 10, speedKmh: 20, gear: 2, brakeOn: true }),
      sample({ tSec: 2, x: 20, y: 20, headingDeg: 90, speedKmh: 0, gear: -1, throttleOn: true }),
    ],
    events: [
      { tSec: 0.2, kind: "glance-left" },
      { tSec: 0.5, kind: "signal-on", detail: "left" },
      { tSec: 1.5, kind: "annotation", textBg: "Спри плавно" },
    ],
  };
}

describe("parseScenarioTrace", () => {
  it("round-trips a valid trace through JSON", () => {
    const trace = validTrace();
    const parsed = parseScenarioTrace(JSON.parse(serializeScenarioTrace(trace)));
    expect(parsed).toEqual(trace);
  });

  it("drops unknown extra fields while keeping the payload", () => {
    const raw = JSON.parse(serializeScenarioTrace(validTrace())) as Record<string, unknown>;
    (raw as { rogue?: string }).rogue = "field";
    (raw.meta as Record<string, unknown>).extra = 1;
    ((raw.samples as unknown[])[0] as Record<string, unknown>).hacked = true;
    const parsed = parseScenarioTrace(raw);
    expect(parsed).toEqual(validTrace());
  });

  it.each([
    ["null", null],
    ["not an object", 42],
    ["wrong version", { ...validTrace(), meta: { ...validTrace().meta, version: 99 } }],
    ["missing samples", { ...validTrace(), samples: undefined }],
    ["one sample only", { ...validTrace(), samples: [sample({ tSec: 0 })] }],
    [
      "NaN position",
      { ...validTrace(), samples: [sample({ tSec: 0, x: NaN }), sample({ tSec: 1 })] },
    ],
    [
      "non-ascending sample times",
      { ...validTrace(), samples: [sample({ tSec: 1 }), sample({ tSec: 1 })] },
    ],
    [
      "negative first sample time",
      { ...validTrace(), samples: [sample({ tSec: -1 }), sample({ tSec: 1 })] },
    ],
    [
      "unknown indicator",
      {
        ...validTrace(),
        samples: [
          { ...sample({ tSec: 0 }), indicator: "hazard" },
          sample({ tSec: 1 }),
        ],
      },
    ],
    [
      "unknown event kind",
      { ...validTrace(), events: [{ tSec: 0, kind: "teleport" }] },
    ],
    [
      "descending events",
      {
        ...validTrace(),
        events: [
          { tSec: 1, kind: "annotation", textBg: "a" },
          { tSec: 0.5, kind: "annotation", textBg: "b" },
        ],
      },
    ],
    [
      "boolean field of wrong type",
      {
        ...validTrace(),
        samples: [
          { ...sample({ tSec: 0 }), brakeOn: 1 },
          sample({ tSec: 1 }),
        ],
      },
    ],
    [
      "bad meta kind",
      { ...validTrace(), meta: { ...validTrace().meta, kind: "correct" } },
    ],
  ])("rejects %s", (_name, payload) => {
    expect(parseScenarioTrace(payload)).toBeNull();
  });
});

describe("sampleAt", () => {
  it("lerps continuous channels at the midpoint", () => {
    const trace = validTrace();
    const out = createTracePoint();
    const returned = sampleAt(trace, 0.5, out);
    expect(returned).toBe(out); // caller-owned out — zero-alloc contract
    expect(out.x).toBeCloseTo(5, 10);
    expect(out.y).toBeCloseTo(10, 10);
    expect(out.speedKmh).toBeCloseTo(15, 10);
  });

  it("interpolates heading via the shortest arc across the 360° wrap", () => {
    const trace = validTrace();
    const out = createTracePoint();
    sampleAt(trace, 0.5, out); // 350° → 10° passes through 0°, never 180°
    expect(out.headingDeg).toBeCloseTo(0, 10);
    sampleAt(trace, 0.25, out);
    expect(out.headingDeg).toBeCloseTo(355, 10);
    sampleAt(trace, 0.75, out);
    expect(out.headingDeg).toBeCloseTo(5, 10);
  });

  it("snaps discrete channels to the NEAREST sample", () => {
    const trace = validTrace();
    const out = createTracePoint();
    sampleAt(trace, 0.4, out); // nearer sample 0
    expect(out.indicator).toBe("left");
    expect(out.gear).toBe(1);
    expect(out.brakeOn).toBe(false);
    sampleAt(trace, 0.6, out); // nearer sample 1
    expect(out.indicator).toBe("off");
    expect(out.gear).toBe(2);
    expect(out.brakeOn).toBe(true);
    sampleAt(trace, 1.9, out); // nearer sample 2
    expect(out.gear).toBe(-1);
    expect(out.throttleOn).toBe(true);
  });

  it("clamps before the first and after the last sample", () => {
    const trace = validTrace();
    const out = createTracePoint();
    sampleAt(trace, -5, out);
    expect(out.x).toBe(0);
    expect(out.headingDeg).toBe(350);
    sampleAt(trace, 99, out);
    expect(out.x).toBe(20);
    expect(out.gear).toBe(-1);
  });

  it("stays exact ON sample timestamps", () => {
    const trace = validTrace();
    const out = createTracePoint();
    sampleAt(trace, 1, out);
    expect(out.x).toBeCloseTo(10, 10);
    expect(out.y).toBeCloseTo(20, 10);
    expect(out.headingDeg).toBeCloseTo(10, 10);
  });
});

describe("annotations + ribbon path", () => {
  it("activeAnnotationIndex windows around the playhead", () => {
    const notes = traceAnnotations(validTrace());
    expect(notes).toHaveLength(1);
    expect(activeAnnotationIndex(notes, 0.4)).toBe(-1); // before it
    expect(activeAnnotationIndex(notes, 1.5)).toBe(0); // exactly on it
    expect(activeAnnotationIndex(notes, 4.0)).toBe(0); // within the window
    expect(activeAnnotationIndex(notes, 9.0)).toBe(-1); // long past it
  });

  it("tracePathForRibbon decimates by spacing and accumulates arclength", () => {
    const samples: TraceSample[] = [];
    for (let i = 0; i <= 100; i++) {
      samples.push(sample({ tSec: i * 0.05, x: i * 0.5, y: 0 })); // 0.5 m apart
    }
    const trace: ScenarioTrace = {
      meta: { scenarioId: "sc-path", kind: "shadow", version: TRACE_VERSION, durationSec: 5 },
      samples,
      events: [],
    };
    const path = tracePathForRibbon(trace, 1.25, 1024);
    expect(path.count).toBeGreaterThan(10);
    expect(path.count).toBeLessThan(60); // decimated well below 101
    expect(path.pts[0]).toBe(0);
    // Straight line: arclength equals x displacement of the last kept point.
    expect(path.arc[path.count - 1]).toBeCloseTo(path.pts[(path.count - 1) * 2], 5);
    // Last sample always kept — the ribbon reaches the stop point.
    expect(path.pts[(path.count - 1) * 2]).toBeCloseTo(50, 5);
  });
});
