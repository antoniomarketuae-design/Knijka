/**
 * Wire types for the outcomes module — the transfer loop (audit M-4 / I-5).
 *
 * Pure types + tiny date helpers only: no zod, no Prisma, no side effects, so
 * client components can `import type` from the module's index without pulling
 * any of it into the browser bundle.
 */

/** The two real ДАИ exams a student sits (docs/education/32). */
export type ExamKind = "theory" | "practical";

export const EXAM_KINDS = ["theory", "practical"] as const satisfies readonly ExamKind[];

export const EXAM_KIND_LABELS_BG: Record<ExamKind, string> = {
  theory: "Теория",
  practical: "Кормуване",
};

/**
 * The PRODUCT side of the calibration pair: what we were telling this student
 * about their chances, captured at the moment they reported. Copied into the
 * row rather than joined — see the schema comment on ExamOutcomeReport.
 */
export interface ReadinessSnapshot {
  /** 0..100 — the number the readiness ring showed. */
  readinessScore: number;
  /** Completed mock exams at report time. */
  mockAttempts: number;
  /** Best mock score out of 97; null when they never finished one. */
  bestMockScore: number | null;
}

/** What the student's form sends. `examOn` is an ISO day, "2026-07-20". */
export interface OutcomeReportInput {
  kind: ExamKind;
  passed: boolean;
  examOn: string;
}

/** A report as the student sees it back (their own row). */
export interface ReportedOutcome extends ReadinessSnapshot {
  id: string;
  kind: ExamKind;
  passed: boolean;
  /** UTC midnight of the exam day — day precision by design. */
  examOn: Date;
  reportedAt: Date;
}

export type RecordOutcomeResult =
  | {
      ok: true;
      outcome: ReportedOutcome;
      /** True when this corrected an earlier report for the same sitting. */
      replaced: boolean;
    }
  | { ok: false; error: "invalid_input"; messageBg: string };

// ---------------------------------------------------------------------------
// Exam-day handling
// ---------------------------------------------------------------------------
//
// The column is a DATE, so every Date crossing this boundary is UTC midnight.
// Parsing/formatting go through these two helpers and nowhere else: doing it
// with the local-time constructor would shift a Sofia evening report to the
// previous day for anyone whose clock is behind UTC, quietly splitting one
// sitting into two rows under the [userId, kind, examOn] unique key.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** "2026-07-20" → UTC midnight; null when the string is not a real day. */
export function parseExamDay(iso: string): Date | null {
  if (!ISO_DAY.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Round-trip guard: "2026-02-31" parses (JS rolls it over to March) but is
  // not the day the student typed, and storing it would misdate the report.
  return formatExamDay(date) === iso ? date : null;
}

/** UTC midnight → "2026-07-20" (the value an <input type="date"> expects). */
export function formatExamDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
