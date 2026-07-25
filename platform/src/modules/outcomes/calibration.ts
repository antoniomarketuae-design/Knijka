/**
 * Calibration — the internal read side of the transfer loop (audit M-4 / I-5).
 *
 * One question: when the product told a student they were ready, were they?
 * `computeCalibration` is a PURE fold over de-identified rows (no id, no
 * userId ever reaches it — see store.ts) producing three things:
 *
 *  - per-band pass rates, so the bands the UI actually shows can be checked
 *    against reality one at a time. The ≥75 band is the one audit M-4 calls
 *    out by name: the ring labels it „Почти готов" while the real bar is
 *    ≥87/97 (~90%), and readiness.ts's own header says not to sit the exam
 *    below ~85–90. This is where that disagreement becomes a number;
 *  - the calibration GAP = mean(readiness/100) − pass rate. Positive means
 *    the product is OVER-confident: it is telling students they are readier
 *    than they turn out to be, which is the failure mode that hurts a
 *    17-year-old (a wasted exam fee and a knocked confidence). Negative is
 *    merely conservative;
 *  - the Brier score, mean((predicted − actual)²), which unlike the gap does
 *    not let a confident-wrong and a timid-right cancel out.
 *
 * Everything is gated on sample size. Reading a pass rate off nine reports
 * would be worse than reading nothing — it would look like evidence. Below
 * the threshold these fields are null and the view says so.
 *
 * Honest limitation, stated once here rather than implied: `readinessScore`
 * is a THEORY-knowledge estimate. For kind "practical" the pairing is still
 * worth collecting (theory mastery plausibly correlates with passing the
 * road test — de Winter et al., cited in readiness.ts) but it is a weaker
 * claim than for "theory", and must be read as one.
 */

import { getOutcomesStore, type CalibrationRow } from "./store";
import { reportLagDays } from "./report";
import { EXAM_KINDS, type ExamKind } from "./types";

/**
 * A report made this long after the exam pairs a MOVED readiness score with
 * an old result — readiness decays by design (RECENCY_FLOOR_DAYS = 30 in
 * learning/readiness.ts), so a late report systematically understates what
 * we were predicting on the day. Those rows are kept but excluded from the
 * headline numbers, and counted so the exclusion is visible.
 */
export const FRESH_REPORT_LAG_DAYS = 30;

/** No headline number below this many usable reports. */
export const CALIBRATION_MIN_SAMPLES = 30;

/** No per-band pass rate below this many reports in the band. */
export const BAND_MIN_SAMPLES = 10;

/**
 * The bands are the ones the STUDENT sees, not statistically convenient
 * ones: the first three are ReadinessRing's own thresholds (50 / 75), and
 * the fourth splits „Почти готов" at 85 — the point readiness.ts says a
 * student may actually sit the exam. Calibrating against any other cut would
 * measure a number nobody is shown.
 */
export const READINESS_BANDS = [
  { minScore: 0, maxScore: 49, labelBg: "В началото си" },
  { minScore: 50, maxScore: 74, labelBg: "Напредваш" },
  { minScore: 75, maxScore: 84, labelBg: "Почти готов (75–84)" },
  { minScore: 85, maxScore: 100, labelBg: "Почти готов (85+)" },
] as const;

export interface CalibrationBand {
  minScore: number;
  maxScore: number;
  labelBg: string;
  /** Usable (fresh) reports whose readiness fell in this band. */
  n: number;
  passedCount: number;
  /** passedCount / n — null until n >= BAND_MIN_SAMPLES. */
  passRate: number | null;
  /** Mean predicted probability (readiness/100) of the rows in the band. */
  meanPredicted: number | null;
}

export interface Calibration {
  kind: ExamKind;
  /** Every report of this kind, including the stale ones. */
  totalReports: number;
  /** Reports inside FRESH_REPORT_LAG_DAYS — what the numbers below use. */
  usedReports: number;
  staleExcluded: number;
  bands: CalibrationBand[];
  /** All null until usedReports >= CALIBRATION_MIN_SAMPLES. */
  overallPassRate: number | null;
  meanPredicted: number | null;
  /** meanPredicted − overallPassRate. > 0 = the product is over-confident. */
  calibrationGap: number | null;
  /** mean((predicted − actual)²), 0 = perfect, lower is better. */
  brierScore: number | null;
  /** How much more data the headline needs; 0 once it is unlocked. */
  reportsUntilSignal: number;
  /** Range of exam days covered by the usable reports (null when none). */
  firstExamOn: Date | null;
  lastExamOn: Date | null;
}

/** Pure fold — the whole statistical claim of the feature lives here. */
export function computeCalibration(
  rows: ReadonlyArray<CalibrationRow>,
  kind: ExamKind,
): Calibration {
  const fresh = rows.filter((r) => reportLagDays(r) <= FRESH_REPORT_LAG_DAYS);

  const bands: CalibrationBand[] = READINESS_BANDS.map((band) => {
    const inBand = fresh.filter(
      (r) => r.readinessScore >= band.minScore && r.readinessScore <= band.maxScore,
    );
    const passedCount = inBand.filter((r) => r.passed).length;
    return {
      minScore: band.minScore,
      maxScore: band.maxScore,
      labelBg: band.labelBg,
      n: inBand.length,
      passedCount,
      passRate:
        inBand.length >= BAND_MIN_SAMPLES ? passedCount / inBand.length : null,
      meanPredicted:
        inBand.length === 0
          ? null
          : mean(inBand.map((r) => r.readinessScore / 100)),
    };
  });

  const enough = fresh.length >= CALIBRATION_MIN_SAMPLES;
  const passRate = enough
    ? fresh.filter((r) => r.passed).length / fresh.length
    : null;
  const predicted = enough ? mean(fresh.map((r) => r.readinessScore / 100)) : null;

  const days = fresh.map((r) => r.examOn.getTime());

  return {
    kind,
    totalReports: rows.length,
    usedReports: fresh.length,
    staleExcluded: rows.length - fresh.length,
    bands,
    overallPassRate: passRate,
    meanPredicted: predicted,
    calibrationGap:
      predicted !== null && passRate !== null ? predicted - passRate : null,
    brierScore: enough
      ? mean(
          fresh.map((r) => (r.readinessScore / 100 - (r.passed ? 1 : 0)) ** 2),
        )
      : null,
    reportsUntilSignal: Math.max(0, CALIBRATION_MIN_SAMPLES - fresh.length),
    firstExamOn: days.length > 0 ? new Date(Math.min(...days)) : null,
    lastExamOn: days.length > 0 ? new Date(Math.max(...days)) : null,
  };
}

/** Calibration for one exam kind (internal view). */
export async function getCalibration(kind: ExamKind): Promise<Calibration> {
  const rows = await getOutcomesStore().listForCalibration(kind);
  return computeCalibration(rows, kind);
}

/** Both kinds, in the order a student meets them (theory, then practical). */
export async function getCalibrationOverview(): Promise<Calibration[]> {
  return Promise.all(EXAM_KINDS.map((kind) => getCalibration(kind)));
}

function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}
