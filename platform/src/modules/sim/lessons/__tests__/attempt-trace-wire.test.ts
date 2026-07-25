/**
 * I-2 „Твоят дубъл" — the attempt trace on the client → server hop.
 *
 * This channel is the one place a browser can hand the server a kilobyte-heavy
 * blob, so it is validated the way A15 positions are, not the way scores are:
 * a bad trace DROPS and the session still saves. Refusing the whole finish
 * payload because a replay was malformed would trade a graded drive for a
 * cosmetic one — the worst possible exchange rate.
 *
 * The four checks only this layer can make (parse.ts already rejects NaN,
 * unordered timestamps and foreign versions):
 *   • kind must be "attempt" — nobody files their own drive as an AUTHORED
 *     shadow/mistake demo;
 *   • scenarioId must be the lesson being finished, or the reel would render
 *     one drive inside another scenario's world;
 *   • the size caps, so an unreduced payload never reaches the compressor.
 */

import { describe, expect, it } from "vitest";
import { MAX_STORED_EVENTS, MAX_STORED_SAMPLES } from "../../traces/compact";
import type { ScenarioTrace, TraceSample } from "../../traces/types";
import { TRACE_VERSION } from "../../traces/types";
import { gradeFinishWire, parseFinishLessonWire } from "../wire";

const LESSON_ID = "l0-free-drive";

function sample(tSec: number): TraceSample {
  return {
    tSec,
    x: 12.34 + tSec,
    y: -5.67,
    headingDeg: 271.4,
    steerRad: 0.012,
    speedKmh: 28.3,
    gear: 1,
    indicator: "off",
    brakeOn: false,
    throttleOn: true,
  };
}

function trace(overrides: Partial<ScenarioTrace["meta"]> = {}, sampleCount = 40): ScenarioTrace {
  const samples = Array.from({ length: sampleCount }, (_, i) => sample(i / 10));
  return {
    meta: {
      scenarioId: LESSON_ID,
      kind: "attempt",
      version: TRACE_VERSION,
      durationSec: samples[samples.length - 1].tSec,
      ...overrides,
    },
    samples,
    events: [{ tSec: 1.2, kind: "glance-right", detail: "right" }],
  };
}

const base = {
  lessonId: LESSON_ID,
  startedAtMs: 1000,
  finishedAtMs: 61_000,
  aborted: false,
  ruleEvents: [{ kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 3 }],
  objectives: [],
};

describe("attempt trace over the finish wire", () => {
  it("carries the student's own drive through to the graded payload", () => {
    const wire = parseFinishLessonWire({ ...base, attemptTrace: trace() });
    expect(wire?.attemptTrace).toEqual(trace());

    // The end-to-end assertion: the server action reads graded.wire, so if the
    // trace stops surviving gradeFinishWire nothing is ever persisted.
    const graded = gradeFinishWire({ ...base, attemptTrace: trace() });
    expect(graded.status).toBe("ok");
    if (graded.status !== "ok") return;
    expect(graded.wire.attemptTrace?.samples.length).toBe(40);
    expect(graded.wire.attemptTrace?.meta.kind).toBe("attempt");
  });

  it("is optional — a session without one is still a valid finish", () => {
    const wire = parseFinishLessonWire(base);
    expect(wire).not.toBeNull();
    expect(wire?.attemptTrace).toBeUndefined();
  });

  it("drops a bad trace instead of failing the whole save", () => {
    const bad = [
      { ...base, attemptTrace: null },
      { ...base, attemptTrace: "не е следа" },
      { ...base, attemptTrace: { meta: {}, samples: [], events: [] } },
      // One sample: playback interpolates, so it is not a trace (parse.ts).
      { ...base, attemptTrace: { ...trace(), samples: [sample(0)] } },
      // Non-ascending timestamps — a hand-edited or reordered payload.
      { ...base, attemptTrace: { ...trace(), samples: [sample(1), sample(0.5)] } },
    ];
    for (const payload of bad) {
      const wire = parseFinishLessonWire(payload);
      expect(wire).not.toBeNull(); // the SESSION still parses…
      expect(wire?.attemptTrace).toBeUndefined(); // …only the replay is gone
    }
  });

  it("refuses a drive filed as an authored demo", () => {
    // The clip pipeline treats "shadow"/"mistake" as reviewed, authored
    // teaching material. A student upload must never be able to claim that
    // status — the trace kind is what tells the two apart everywhere else.
    for (const kind of ["shadow", "mistake"] as const) {
      const wire = parseFinishLessonWire({ ...base, attemptTrace: trace({ kind }) });
      expect(wire?.attemptTrace).toBeUndefined();
    }
  });

  it("refuses a drive recorded in a different scenario", () => {
    const wire = parseFinishLessonWire({
      ...base,
      attemptTrace: trace({ scenarioId: "sc-roundabout-entry@L2" }),
    });
    expect(wire?.attemptTrace).toBeUndefined();
  });

  it("refuses a payload that was never reduced for storage", () => {
    const tooMany = parseFinishLessonWire({
      ...base,
      attemptTrace: trace({}, MAX_STORED_SAMPLES + 1),
    });
    expect(tooMany?.attemptTrace).toBeUndefined();

    // The event list is capped for the same reason the sample list is.
    const flooded = {
      ...trace(),
      events: Array.from({ length: MAX_STORED_EVENTS + 1 }, (_, i) => ({
        tSec: i / 100,
        kind: "annotation" as const,
        textBg: "x",
      })),
    };
    expect(parseFinishLessonWire({ ...base, attemptTrace: flooded })?.attemptTrace).toBeUndefined();

    // …and the accepted boundary is genuinely accepted, so the cap is a cap
    // and not an off-by-one that rejects every full-length drive.
    const atCap = parseFinishLessonWire({
      ...base,
      attemptTrace: trace({}, MAX_STORED_SAMPLES),
    });
    expect(atCap?.attemptTrace?.samples.length).toBe(MAX_STORED_SAMPLES);
  });
});
