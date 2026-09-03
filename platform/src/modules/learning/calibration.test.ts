import { describe, expect, it } from "vitest";
import {
  ACCURATE_BAND_POINTS,
  CALIBRATION_BEYOND_SCALE_TITLE_BG,
  CALIBRATION_MIN_SAMPLES,
  CALIBRATION_VERDICT_BODY_BG,
  CALIBRATION_VERDICT_TITLE_BG,
  MAX_PREDICTED_POINTS,
  calibrationBeyondScaleBodyBg,
  calibrationError,
  calibrationRevealCopy,
  classifyCalibration,
  formatCalibrationError,
  isBeyondPredictableScale,
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN THE PROTOCOL WILL NOT FIT IN THE QUESTION — sc-junction-rhr:c6d88f3f.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The gate asks «Цяло число от 0 до 30» and the engine scored 394 on a sibling
 * drive in the same sweep chunk; 7 of the 151 scored drives in the newest sweep
 * are still over the cap. Every case below FAILS on the pre-fix behaviour,
 * where the only possible outcome past the ceiling was a large negative error
 * classified `overconfident` — the product bounding the answer and then
 * convicting the student of the bound.
 */
describe("beyond the scale the student was allowed to answer on", () => {
  it("is the CEILING that decides, not the size of the error", () => {
    expect(isBeyondPredictableScale(MAX_PREDICTED_POINTS)).toBe(false);
    expect(isBeyondPredictableScale(MAX_PREDICTED_POINTS + 1)).toBe(true);
    expect(isBeyondPredictableScale(394)).toBe(true);
    // A drive that is not a number is not a drive off the scale — an unreadable
    // total must never be the thing that withholds a verdict.
    expect(isBeyondPredictableScale(Number.NaN)).toBe(false);
    expect(isBeyondPredictableScale(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("withholds the verdict wording instead of calling him overconfident", () => {
    // The exact shape of the row: he typed the largest number the form accepts
    // and the protocol is an order of magnitude past it.
    const r = record({ predictedPoints: MAX_PREDICTED_POINTS, actualPoints: 394 });
    // The raw classification is unchanged — it is what was stored, and the
    // trend page still reads it — but the COPY may not be a verdict.
    expect(classifyCalibration(r)).toBe("overconfident");
    const copy = calibrationRevealCopy(r);
    expect(copy.beyondScale).toBe(true);
    expect(copy.titleBg).toBe(CALIBRATION_BEYOND_SCALE_TITLE_BG);
    expect(copy.titleBg).not.toBe(CALIBRATION_VERDICT_TITLE_BG.overconfident);
    expect(copy.bodyBg).not.toBe(CALIBRATION_VERDICT_BODY_BG.overconfident);
  });

  it("still gives an ordinary drive its ordinary verdict", () => {
    const r = record({ predictedPoints: 2, actualPoints: 12 });
    const copy = calibrationRevealCopy(r);
    expect(copy.beyondScale).toBe(false);
    expect(copy.titleBg).toBe(CALIBRATION_VERDICT_TITLE_BG.overconfident);
    expect(copy.bodyBg).toBe(CALIBRATION_VERDICT_BODY_BG.overconfident);
  });

  it("names BOTH numbers, because the mismatch is the explanation (THEO-4)", () => {
    const body = calibrationBeyondScaleBodyBg(394);
    expect(body).toContain(String(MAX_PREDICTED_POINTS));
    expect(body).toContain("394");
    // Requirement-zero: it says what to do next, not just that the mechanic
    // declined to grade.
    expect(body).toContain("разбора");
  });

  it("keeps a ceiling drive out of the means, the buckets and the trend", () => {
    const s = summarizeCalibration([
      record({ simSessionId: "a", predictedPoints: 4, actualPoints: 4, recordedAt: T0 }),
      record({
        simSessionId: "b",
        predictedPoints: 6,
        actualPoints: 8,
        recordedAt: new Date(T0.getTime() + DAY_MS),
      }),
      record({
        simSessionId: "c",
        predictedPoints: MAX_PREDICTED_POINTS,
        actualPoints: 394,
        recordedAt: new Date(T0.getTime() + 2 * DAY_MS),
      }),
    ]);
    // The row is still evidence of a drive, so it is still listed.
    expect(s.points.map((p) => p.simSessionId)).toEqual(["a", "b", "c"]);
    expect(s.points[2].beyondScale).toBe(true);
    expect(s.beyondScaleCount).toBe(1);
    expect(s.sampleCount).toBe(3);
    // Means over the two gradable drives only: errors 0 and −2.
    expect(s.meanError).toBe(-1);
    expect(s.meanAbsError).toBe(1);
    expect(s.overconfidentCount).toBe(0);
    expect(s.accurateCount).toBe(2);
    // …and the screen may not promise a trend it is drawing through two points.
    expect(s.samplesUntilTrend).toBe(1);
    expect(s.trend).toBeNull();
  });

  it("still counts the pass/fail call, which was answerable either way", () => {
    // He could not name 394, but he could say „неиздържан" — and he did.
    const s = summarizeCalibration([
      record({
        simSessionId: "c",
        predictedPoints: MAX_PREDICTED_POINTS,
        predictedPass: false,
        actualPoints: 394,
        actualPass: false,
      }),
    ]);
    expect(s.verdictAgreementRate).toBe(1);
    // Nothing gradable, so no mean — and null is the honest answer, not 0.
    expect(s.meanError).toBeNull();
    expect(s.meanAbsError).toBeNull();
  });
});
