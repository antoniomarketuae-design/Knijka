/**
 * „Твоят дубъл" read model (doc 82 §5.3 I2) — the join between a decoded
 * attempt trace and the session's stored verdict.
 *
 * The join is the whole feature: everything else (codec, retention,
 * ownership-scoped read, ghost renderer, timeline) was already written and
 * tested, and the traces were still never shown to anyone.
 */

import { describe, expect, it } from "vitest";
import {
  REEL_LEAD_IN_SEC,
  buildAttemptReel,
  reelStartSec,
  type StoredReelEvent,
  type StoredReelPosition,
} from "../attemptReel";
import { VIOLATIONS } from "../../rules";
import { TRACE_VERSION, type ScenarioTrace, type TraceSample } from "../types";

/** A straight 20 Hz run north at 10 m/s — position at t seconds is (0, 10t). */
function straightTrace(durationSec = 30): ScenarioTrace {
  const samples: TraceSample[] = [];
  for (let i = 0; i <= durationSec * 20; i++) {
    const tSec = i / 20;
    samples.push({
      tSec,
      x: 0,
      y: 10 * tSec,
      headingDeg: 0,
      steerRad: 0,
      speedKmh: 36,
      gear: 1,
      indicator: "off",
      brakeOn: false,
      throttleOn: true,
    });
  }
  return {
    meta: {
      scenarioId: "sc-junction-rhr",
      kind: "attempt",
      version: TRACE_VERSION,
      durationSec,
    },
    samples,
    events: [],
  };
}

function violation(over: Partial<StoredReelEvent> = {}): StoredReelEvent {
  return {
    kind: "violation",
    code: "SPEEDING_OVER_LIMIT",
    t: 5,
    severityClass: "vtorostepenna",
    titleBg: "Превишена скорост",
    explanationBg: "…",
    lawRef: "ЗДвП чл. 21",
    ...over,
  };
}

describe("buildAttemptReel", () => {
  it("attaches the catalog's authored corrective to each fault", () => {
    // The reason the screen exists: „какво трябваше да направя" beside the
    // moment it should have been done — authored copy, never generated.
    const reel = buildAttemptReel(straightTrace(), [violation()]);
    expect(reel.faults).toHaveLength(1);
    expect(reel.faults[0].correctiveBg).toBe(VIOLATIONS.SPEEDING_OVER_LIMIT.correctiveBg);
    expect(reel.faults[0].correctiveBg).not.toBeNull();
  });

  it("prefers the engine's recorded position over interpolation", () => {
    const positions: StoredReelPosition[] = [
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 42, y: 7 },
    ];
    const reel = buildAttemptReel(straightTrace(), [violation()], positions);
    expect(reel.faults[0]).toMatchObject({ x: 42, y: 7, positionExact: true });
  });

  it("reconstructs a missing position from the student's own path, and says so", () => {
    // Pre-drive events fire with no tick in hand, and rows saved before A15
    // carry no positions at all — but the car was somewhere, and the trace
    // knows where. The marker must not CLAIM the engine placed it.
    const reel = buildAttemptReel(straightTrace(), [violation({ t: 5 })]);
    expect(reel.faults[0].positionExact).toBe(false);
    expect(reel.faults[0].x).toBeCloseTo(0, 6);
    expect(reel.faults[0].y).toBeCloseTo(50, 6);
  });

  it("consumes each stored position once, so twin violations do not share a marker", () => {
    const events = [violation({ t: 5 }), violation({ t: 6 })];
    const positions: StoredReelPosition[] = [
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 5, x: 1, y: 1 },
      { kind: "violation", code: "SPEEDING_OVER_LIMIT", t: 6, x: 2, y: 2 },
    ];
    const reel = buildAttemptReel(straightTrace(), events, positions);
    expect(reel.faults.map((f) => [f.x, f.y])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it("keeps commendations out of the reel", () => {
    const reel = buildAttemptReel(straightTrace(), [
      violation(),
      { kind: "commendation", code: "CLEAN_DRIVING", t: 9, titleBg: "Чисто каране" },
    ]);
    expect(reel.faults).toHaveLength(1);
    expect(reel.faults[0].code).toBe("SPEEDING_OVER_LIMIT");
  });

  it("opens on the most severe fault, earliest among equals", () => {
    const reel = buildAttemptReel(straightTrace(), [
      violation({ t: 2, code: "SPEEDING_OVER_LIMIT", severityClass: "vtorostepenna" }),
      violation({ t: 11, code: "COLLISION", severityClass: "opasna" }),
      violation({ t: 19, code: "COLLISION", severityClass: "opasna" }),
    ]);
    expect(reel.openAtSec).toBe(11);
  });

  it("still produces a playable reel for a clean drive", () => {
    const reel = buildAttemptReel(straightTrace(), []);
    expect(reel.faults).toEqual([]);
    expect(reel.openAtSec).toBeNull();
    expect(reel.trace.samples.length).toBeGreaterThan(0);
  });

  it("survives a corrupt / foreign stored payload instead of throwing on screen", () => {
    // The source is a Json column. A row written by an older format, a
    // renamed code or a hand-edited payload must degrade, never explode.
    const reel = buildAttemptReel(straightTrace(), [
      violation({ t: Number.NaN }),
      violation({ t: -3 }),
      violation({ code: "" }),
      violation({ code: 17 }),
      { kind: "violation" },
      violation({ code: "A_CODE_THAT_NO_LONGER_EXISTS", severityClass: "nonsense" }),
    ]);
    expect(reel.faults).toHaveLength(1);
    expect(reel.faults[0].code).toBe("A_CODE_THAT_NO_LONGER_EXISTS");
    // No catalog entry → no invented corrective, and the stored strings stand.
    expect(reel.faults[0].correctiveBg).toBeNull();
    expect(reel.faults[0].severityClass).toBe("vtorostepenna");
  });

  it("returns faults in time order regardless of stored order", () => {
    const reel = buildAttemptReel(straightTrace(), [
      violation({ t: 12 }),
      violation({ t: 3 }),
      violation({ t: 7 }),
    ]);
    expect(reel.faults.map((f) => f.tSec)).toEqual([3, 7, 12]);
  });
});

describe("reelStartSec", () => {
  it("opens on the RUN-UP, not the impact", () => {
    // Same window shape as the clip trimmer: the decision that produced the
    // mistake was taken seconds before the engine convicted it.
    expect(reelStartSec(20)).toBe(20 - REEL_LEAD_IN_SEC);
  });

  it("never seeks before the start of the drive", () => {
    expect(reelStartSec(2)).toBe(0);
    expect(reelStartSec(null)).toBe(0);
  });
});
