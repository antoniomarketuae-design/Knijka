/**
 * outcomes module — public API (docs/architecture/05: modules talk only via
 * index.ts; deep imports are a review-blocking violation).
 *
 * Closes the transfer loop (audit M-4 / I-5). Two halves:
 *
 * - CAPTURE — recordExamOutcome() stores what a student says happened at
 *   their real ДАИ exam, paired with the readiness score the product was
 *   showing them at that moment. Consent-based and withdrawable
 *   (withdrawExamOutcome), day precision, no free text — see the
 *   ExamOutcomeReport comment in schema.prisma for why each field is there
 *   and, more importantly, why nothing else is.
 * - CALIBRATION — getCalibration() answers "when we said ready, were they?"
 *   over de-identified rows, with every headline number gated on sample
 *   size. It will read „not enough data" for a long time. That is the point:
 *   the collection has to start years before the answer is worth anything,
 *   and until then the north star claim stays unproven rather than assumed.
 *
 * Test seams: setOutcomesStore() for persistence,
 * setReadinessSnapshotProvider() for the learning/exam side of the pair.
 */

// Capture
export {
  recordExamOutcome,
  listMyOutcomes,
  withdrawExamOutcome,
  reportLagDays,
} from "./report";
export { MAX_REPORT_AGE_DAYS } from "./schemas";

// Calibration (internal)
export {
  computeCalibration,
  getCalibration,
  getCalibrationOverview,
  BAND_MIN_SAMPLES,
  CALIBRATION_MIN_SAMPLES,
  FRESH_REPORT_LAG_DAYS,
  READINESS_BANDS,
} from "./calibration";
export type { Calibration, CalibrationBand } from "./calibration";

// Readiness snapshot seam
export {
  captureReadinessSnapshot,
  setReadinessSnapshotProvider,
  NO_SNAPSHOT,
} from "./snapshot";
export type { ReadinessSnapshotProvider } from "./snapshot";

// Persistence seam
export {
  setOutcomesStore,
  getOutcomesStore,
  InMemoryOutcomesStore,
} from "./store";
export type {
  OutcomesStore,
  OutcomeRow,
  OutcomeWrite,
  CalibrationRow,
} from "./store";

// Wire types + exam-day helpers
export {
  EXAM_KINDS,
  EXAM_KIND_LABELS_BG,
  formatExamDay,
  parseExamDay,
} from "./types";
export type {
  ExamKind,
  OutcomeReportInput,
  ReadinessSnapshot,
  RecordOutcomeResult,
  ReportedOutcome,
} from "./types";
