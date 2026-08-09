import { describe, expect, it } from "vitest";
import {
  ACCURATE_BAND_POINTS,
  CALIBRATION_MIN_SAMPLES,
  MAX_PREDICTED_POINTS,
  calibrationError,
  classifyCalibration,
  formatCalibrationError,
  isResultScreenHeld,
  parsePredictionInput,
  summarizeCalibration,
  verdictAgrees,
  type CalibrationRecord,
  type GateSequenceState,
} from "./calibration";

const DAY_MS = 24 * 60 * 60 * 1000;
const T0 = new Date("2026-07-20T10:00:00Z");

function record(over: Partial<CalibrationRecord> = {}): CalibrationRecord {
  return {
    simSessionId: "s1",
    lessonId: "sc-park-perp-rev@L1",
    predictedPoints: 3,
    predictedPass: true,
    actualPoints: 3,
    actualPass: true,
    recordedAt: T0,
    ...over,
  };
}

describe("parsePredictionInput", () => {
  it("accepts a whole in-range prediction", () => {
    expect(parsePredictionInput({ predictedPoints: 4, predictedPass: false })).toEqual({
      predictedPoints: 4,
      predictedPass: false,
    });
  });

  it("refuses non-integers, out-of-range values and missing verdicts", () => {
    expect(parsePredictionInput({ predictedPoints: 3.5, predictedPass: true })).toBeNull();
    expect(parsePredictionInput({ predictedPoints: -1, predictedPass: true })).toBeNull();
    expect(
      parsePredictionInput({ predictedPoints: MAX_PREDICTED_POINTS + 1, predictedPass: true }),
    ).toBeNull();
    expect(parsePredictionInput({ predictedPoints: 3 })).toBeNull();
    expect(parsePredictionInput({ predictedPoints: "3", predictedPass: true })).toBeNull();
    expect(parsePredictionInput(null)).toBeNull();
  });

  it("refuses rather than clamps — a stored belief must be one the student held", () => {
    expect(parsePredictionInput({ predictedPoints: 999, predictedPass: false })).toBeNull();
  });
});

describe("calibrationError sign convention", () => {
  it("is negative when the student flattered themselves", () => {
    expect(calibrationError(record({ predictedPoints: 2, actualPoints: 7 }))).toBe(-5);
    expect(classifyCalibration(record({ predictedPoints: 2, actualPoints: 7 }))).toBe(
      "overconfident",
    );
  });

  it("is positive when the student was harsher than the engine", () => {
    expect(calibrationError(record({ predictedPoints: 9, actualPoints: 1 }))).toBe(8);
    expect(classifyCalibration(record({ predictedPoints: 9, actualPoints: 1 }))).toBe(
      "underconfident",
    );
  });

  it("treats the band edge itself as 'позна' (inclusive)", () => {
    const edge = record({ predictedPoints: 1, actualPoints: 1 + ACCURATE_BAND_POINTS });
    expect(classifyCalibration(edge)).toBe("accurate");
    const past = record({ predictedPoints: 1, actualPoints: 2 + ACCURATE_BAND_POINTS });
    expect(classifyCalibration(past)).toBe("overconfident");
  });
});

describe("verdictAgrees", () => {
  it("is independent of the point error", () => {
    // Wildly wrong on points, right about pass/fail.
    expect(verdictAgrees(record({ predictedPoints: 0, actualPoints: 8 }))).toBe(true);
    // Points nearly right, but the ≤9 line was crossed.
    expect(
      verdictAgrees(
        record({ predictedPoints: 9, predictedPass: true, actualPoints: 10, actualPass: false }),
      ),
    ).toBe(false);
  });
});

describe("summarizeCalibration", () => {
  it("is empty-safe", () => {
    const s = summarizeCalibration([]);
    expect(s.sampleCount).toBe(0);
    expect(s.meanError).toBeNull();
    expect(s.meanAbsError).toBeNull();
    expect(s.verdictAgreementRate).toBeNull();
    expect(s.trend).toBeNull();
    expect(s.samplesUntilTrend).toBe(CALIBRATION_MIN_SAMPLES);
  });

  it("orders points oldest-first regardless of input order", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "new", recordedAt: new Date(T0.getTime() + 2 * DAY_MS) }),
      record({ simSessionId: "old", recordedAt: T0 }),
      record({ simSessionId: "mid", recordedAt: new Date(T0.getTime() + DAY_MS) }),
    ]);
    expect(s.points.map((p) => p.simSessionId)).toEqual(["old", "mid", "new"]);
  });

  it("does not let flattering and harsh predictions cancel in meanAbsError", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "a", predictedPoints: 0, actualPoints: 6, recordedAt: T0 }),
      record({
        simSessionId: "b",
        predictedPoints: 6,
        actualPoints: 0,
        recordedAt: new Date(T0.getTime() + DAY_MS),
      }),
    ]);
    expect(s.meanError).toBe(0); // they cancel here — that is the point of the pair
    expect(s.meanAbsError).toBe(6); // and emphatically not here
  });

  it("counts the three verdict buckets", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "a", predictedPoints: 0, actualPoints: 9, recordedAt: T0 }),
      record({
        simSessionId: "b",
        predictedPoints: 3,
        actualPoints: 3,
        recordedAt: new Date(T0.getTime() + DAY_MS),
      }),
      record({
        simSessionId: "c",
        predictedPoints: 10,
        actualPoints: 1,
        recordedAt: new Date(T0.getTime() + 2 * DAY_MS),
      }),
    ]);
    expect(s.overconfidentCount).toBe(1);
    expect(s.accurateCount).toBe(1);
    expect(s.underconfidentCount).toBe(1);
  });

  it("reports the pass/fail agreement rate", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "a", predictedPass: true, actualPass: true, recordedAt: T0 }),
      record({
        simSessionId: "b",
        predictedPass: true,
        actualPass: false,
        recordedAt: new Date(T0.getTime() + DAY_MS),
      }),
    ]);
    expect(s.verdictAgreementRate).toBe(0.5);
  });

  it("withholds a trend below the minimum sample count", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "a", predictedPoints: 0, actualPoints: 9, recordedAt: T0 }),
      record({
        simSessionId: "b",
        predictedPoints: 0,
        actualPoints: 9,
        recordedAt: new Date(T0.getTime() + DAY_MS),
      }),
    ]);
    expect(s.trend).toBeNull();
    expect(s.samplesUntilTrend).toBe(CALIBRATION_MIN_SAMPLES - 2);
  });

  it("calls a shrinking |error| 'improving' and gives the newer half the odd record", () => {
    // 4 records: older half |9|,|8| → 8.5; newer half |1|,|0| → 0.5.
    const errors = [9, 8, 1, 0];
    const s = summarizeCalibration(
      errors.map((e, i) =>
        record({
          simSessionId: `s${i}`,
          predictedPoints: e,
          actualPoints: 0,
          recordedAt: new Date(T0.getTime() + i * DAY_MS),
        }),
      ),
    );
    expect(s.trend).toBe("improving");
  });

  it("calls a growing |error| 'worsening'", () => {
    const errors = [0, 1, 8, 9];
    const s = summarizeCalibration(
      errors.map((e, i) =>
        record({
          simSessionId: `s${i}`,
          predictedPoints: e,
          actualPoints: 0,
          recordedAt: new Date(T0.getTime() + i * DAY_MS),
        }),
      ),
    );
    expect(s.trend).toBe("worsening");
  });

  it("treats sub-half-point movement as steady, not learning", () => {
    const errors = [2, 2, 2, 3];
    const s = summarizeCalibration(
      errors.map((e, i) =>
        record({
          simSessionId: `s${i}`,
          predictedPoints: e,
          actualPoints: 0,
          recordedAt: new Date(T0.getTime() + i * DAY_MS),
        }),
      ),
    );
    expect(s.trend).toBe("steady");
  });
});

describe("formatCalibrationError", () => {
  it("always carries the sign, because the sign is the message", () => {
    expect(formatCalibrationError(-3)).toBe("-3 изпитни т.");
    expect(formatCalibrationError(2)).toBe("+2 изпитни т.");
    expect(formatCalibrationError(0)).toBe("0 изпитни т.");
    expect(formatCalibrationError(-1.26)).toBe("-1.3 изпитни т.");
  });

  /**
   * …AND ALWAYS CARRIES THE SCALE. This string is rendered on the calibration
   * gate directly under „6 изпитни т. / 20 изпитни т.", and it read „−14 т." —
   * the same bare unit the founder took for контролни точки off his licence.
   * It survived the sim-side source scan because it is composed in THIS module
   * and only displayed over there; it was caught by photographing the screen.
   */
  it("names the scale — a bare „т.“ here reads as контролни точки", () => {
    expect(formatCalibrationError(-14)).toContain("изпитни т.");
    expect(formatCalibrationError(-14)).not.toMatch(/^-?\+?\d+([.,]\d+)? т\.$/);
    // точка is feminine singular, and it stays feminine when abbreviated.
    expect(formatCalibrationError(1)).toBe("+1 изпитна т.");
    expect(formatCalibrationError(-1)).toBe("-1 изпитна т.");
  });
});

describe("isResultScreenHeld", () => {
  const state = (over: Partial<GateSequenceState> = {}): GateSequenceState => ({
    ended: true,
    aborted: false,
    persists: true,
    saved: true,
    resolved: false,
    ...over,
  });

  it("holds while the save is still in flight", () => {
    // THE regression this exists for: `result` lands synchronously when the
    // drive ends and `saveResult` lands one POST later. Anything that does not
    // hold this window renders the score, and a prediction made after reading
    // the score measures reading, not judgement.
    expect(isResultScreenHeld(state({ saved: null }))).toBe(true);
  });

  it("holds once the gate is up and unanswered", () => {
    expect(isResultScreenHeld(state())).toBe(true);
  });

  it("releases the moment the student predicts or skips", () => {
    expect(isResultScreenHeld(state({ resolved: true }))).toBe(false);
    expect(isResultScreenHeld(state({ saved: null, resolved: true }))).toBe(false);
  });

  it("never holds a drive there is nothing to be wrong about", () => {
    // Quit mid-route, sandbox mistake-experience run, or a failed save: all
    // three go straight to the debrief. A mechanic on top of the lesson must
    // never cost the student the lesson.
    expect(isResultScreenHeld(state({ aborted: true }))).toBe(false);
    expect(isResultScreenHeld(state({ persists: false, saved: null }))).toBe(false);
    expect(isResultScreenHeld(state({ saved: false }))).toBe(false);
  });

  it("does not hold a drive that has not ended", () => {
    expect(isResultScreenHeld(state({ ended: false, saved: null }))).toBe(false);
  });
});
