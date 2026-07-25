import { describe, expect, it } from "vitest";
import {
  BAND_MIN_SAMPLES,
  CALIBRATION_MIN_SAMPLES,
  computeCalibration,
  FRESH_REPORT_LAG_DAYS,
  type CalibrationRow,
} from "../index";

/** A fresh report: reported the day after the exam. */
function row(
  readinessScore: number,
  passed: boolean,
  opts: { lagDays?: number; examOn?: string } = {},
): CalibrationRow {
  const examOn = new Date(`${opts.examOn ?? "2026-07-20"}T00:00:00.000Z`);
  const lag = opts.lagDays ?? 1;
  return {
    passed,
    examOn,
    reportedAt: new Date(examOn.getTime() + lag * 24 * 60 * 60 * 1000),
    readinessScore,
    mockAttempts: 3,
    bestMockScore: 88,
  };
}

function repeat(n: number, make: (i: number) => CalibrationRow) {
  return Array.from({ length: n }, (_, i) => make(i));
}

describe("computeCalibration — sample-size gating", () => {
  it("reports no headline number below CALIBRATION_MIN_SAMPLES", () => {
    // Nine reports that all agree would look like proof. They are not.
    const c = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLES - 1, () => row(80, true)),
      "theory",
    );

    expect(c.usedReports).toBe(CALIBRATION_MIN_SAMPLES - 1);
    expect(c.overallPassRate).toBeNull();
    expect(c.calibrationGap).toBeNull();
    expect(c.brierScore).toBeNull();
    expect(c.reportsUntilSignal).toBe(1);
  });

  it("unlocks the headline exactly at the threshold", () => {
    const c = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLES, () => row(80, true)),
      "theory",
    );
    expect(c.overallPassRate).toBe(1);
    expect(c.reportsUntilSignal).toBe(0);
  });

  it("leaves a thin band's pass rate null while still counting it", () => {
    const c = computeCalibration(
      [
        // 85+ band: plenty.
        ...repeat(CALIBRATION_MIN_SAMPLES, () => row(90, true)),
        // 50–74 band: below BAND_MIN_SAMPLES.
        ...repeat(BAND_MIN_SAMPLES - 1, () => row(60, false)),
      ],
      "theory",
    );

    const thin = c.bands.find((b) => b.minScore === 50);
    expect(thin?.n).toBe(BAND_MIN_SAMPLES - 1);
    expect(thin?.passRate).toBeNull();

    const thick = c.bands.find((b) => b.minScore === 85);
    expect(thick?.passRate).toBe(1);
  });
});

describe("computeCalibration — the M-4 question", () => {
  it("exposes an over-confident 'Почти готов' band as a positive gap", () => {
    // 40 students the ring told „Почти готов" (78/100 → predicted 0.78);
    // half of them actually failed. This is exactly the disagreement audit
    // M-4 describes, and it must show up as a NUMBER, not a vibe.
    const rows = [
      ...repeat(20, () => row(78, true)),
      ...repeat(20, () => row(78, false)),
    ];
    const c = computeCalibration(rows, "theory");

    expect(c.overallPassRate).toBeCloseTo(0.5, 10);
    expect(c.meanPredicted).toBeCloseTo(0.78, 10);
    // Positive gap = we told them they were readier than they were.
    expect(c.calibrationGap).toBeCloseTo(0.28, 10);

    const band = c.bands.find((b) => b.minScore === 75);
    expect(band?.n).toBe(40);
    expect(band?.passRate).toBeCloseTo(0.5, 10);
  });

  it("reports a NEGATIVE gap when the product is merely conservative", () => {
    const c = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLES, () => row(60, true)),
      "theory",
    );
    expect(c.calibrationGap).toBeCloseTo(-0.4, 10);
  });

  it("uses the Brier score to catch what a cancelling gap hides", () => {
    // Half confidently wrong, half timidly right: the gap nets to zero while
    // every single prediction was bad. Brier does not let that pass.
    const rows = [
      ...repeat(20, () => row(90, false)),
      ...repeat(20, () => row(10, true)),
    ];
    const c = computeCalibration(rows, "theory");

    expect(c.calibrationGap).toBeCloseTo(0, 10);
    expect(c.brierScore).toBeCloseTo(0.81, 10);
  });
});

describe("computeCalibration — staleness", () => {
  it("excludes reports made long after the exam, and says how many", () => {
    const rows = [
      ...repeat(CALIBRATION_MIN_SAMPLES, () => row(90, true)),
      // Readiness decays by design after 30 days, so a late report pairs a
      // sunk score with an old result — counted, but not in the headline.
      ...repeat(5, () => row(20, false, { lagDays: FRESH_REPORT_LAG_DAYS + 1 })),
    ];
    const c = computeCalibration(rows, "theory");

    expect(c.totalReports).toBe(CALIBRATION_MIN_SAMPLES + 5);
    expect(c.usedReports).toBe(CALIBRATION_MIN_SAMPLES);
    expect(c.staleExcluded).toBe(5);
    expect(c.overallPassRate).toBe(1);
  });

  it("keeps a report made exactly on the freshness boundary", () => {
    const c = computeCalibration(
      repeat(CALIBRATION_MIN_SAMPLES, () =>
        row(90, true, { lagDays: FRESH_REPORT_LAG_DAYS }),
      ),
      "theory",
    );
    expect(c.staleExcluded).toBe(0);
    expect(c.usedReports).toBe(CALIBRATION_MIN_SAMPLES);
  });
});

describe("computeCalibration — empty and edges", () => {
  it("is safe on zero reports (the state it ships in)", () => {
    const c = computeCalibration([], "practical");
    expect(c).toMatchObject({
      kind: "practical",
      totalReports: 0,
      usedReports: 0,
      staleExcluded: 0,
      overallPassRate: null,
      meanPredicted: null,
      calibrationGap: null,
      brierScore: null,
      reportsUntilSignal: CALIBRATION_MIN_SAMPLES,
      firstExamOn: null,
      lastExamOn: null,
    });
    expect(c.bands).toHaveLength(4);
    expect(c.bands.every((b) => b.n === 0 && b.meanPredicted === null)).toBe(true);
  });

  it("puts every 0..100 score in exactly one band", () => {
    const rows = repeat(101, (i) => row(i, i >= 87));
    const c = computeCalibration(rows, "theory");
    expect(c.bands.reduce((sum, b) => sum + b.n, 0)).toBe(101);
  });

  it("reports the exam-day range actually covered", () => {
    const c = computeCalibration(
      [
        row(80, true, { examOn: "2026-05-04" }),
        row(80, false, { examOn: "2026-07-19" }),
        row(80, true, { examOn: "2026-06-11" }),
      ],
      "theory",
    );
    expect(c.firstExamOn?.toISOString()).toBe("2026-05-04T00:00:00.000Z");
    expect(c.lastExamOn?.toISOString()).toBe("2026-07-19T00:00:00.000Z");
  });
});
