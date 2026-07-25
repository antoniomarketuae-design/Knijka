/**
 * Capture side of the transfer loop (audit M-4 / I-5).
 *
 * A student tells us how their real ДАИ exam went; we pair that with the
 * readiness we had been predicting for them and store one row. That pair is
 * the ONLY thing that can ever turn "we produce safer, more competent
 * drivers" from a slogan into a measured claim — and it has to start
 * accruing long before it can pay off, which is precisely why it ships now.
 *
 * Consent (ADR-004, users are minors): this module never writes without an
 * explicit opt-in — the gate lives in the server action that calls it,
 * because that is where the wording the student actually read lives. What
 * this module guarantees is the other half: nothing is stored beyond outcome
 * + day + our own prediction, and withdrawExamOutcome() makes Art. 7(3)
 * withdrawal a one-click product action rather than a support ticket.
 */

import { outcomeReportSchema } from "./schemas";
import { captureReadinessSnapshot } from "./snapshot";
import { getOutcomesStore, type OutcomeRow } from "./store";
import type {
  OutcomeReportInput,
  RecordOutcomeResult,
  ReportedOutcome,
} from "./types";
import { parseExamDay } from "./types";

/**
 * Validate, snapshot, store. Returns a result object rather than throwing:
 * every failure here is something the student can fix in the form, so it
 * belongs in the UI's error slot, not in an exception handler.
 *
 * Re-reporting the same sitting CORRECTS the earlier row (unique key
 * [userId, kind, examOn]) instead of adding a second one — someone who
 * mis-clicks "не взех" and fixes it must not appear twice in the pass rate.
 * Note the correction re-snapshots readiness: that is intentional, the
 * snapshot always describes the moment the standing report was made.
 */
export async function recordExamOutcome(
  userId: string,
  input: OutcomeReportInput,
  now: Date = new Date(),
): Promise<RecordOutcomeResult> {
  const parsed = outcomeReportSchema(now).safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "invalid_input",
      // First issue only: the form has three fields and a wall of messages
      // reads as blame. The order follows the schema, so it is stable.
      messageBg:
        parsed.error.issues[0]?.message ?? "Не успяхме да запишем резултата.",
    };
  }

  const examOn = parseExamDay(parsed.data.examOn);
  if (!examOn) {
    // Unreachable: the schema already refined on parseExamDay.
    return {
      ok: false,
      error: "invalid_input",
      messageBg: "Невалидна дата на изпита.",
    };
  }

  const snapshot = await captureReadinessSnapshot(userId);
  const { row, replaced } = await getOutcomesStore().upsertOutcome(userId, {
    kind: parsed.data.kind,
    passed: parsed.data.passed,
    examOn,
    reportedAt: now,
    ...snapshot,
  });

  return { ok: true, outcome: stripOwner(row), replaced };
}

/** The student's own reports, most recent exam first. */
export async function listMyOutcomes(
  userId: string,
): Promise<ReportedOutcome[]> {
  const rows = await getOutcomesStore().listOutcomes(userId);
  return rows.map(stripOwner);
}

/**
 * Art. 7(3): withdraw consent for one report by deleting it. False when the
 * id is unknown or not theirs — the caller shows the same message either way.
 */
export async function withdrawExamOutcome(
  userId: string,
  outcomeId: string,
): Promise<boolean> {
  if (!outcomeId) return false;
  return getOutcomesStore().deleteOutcome(userId, outcomeId);
}

/** Days between the exam and the report — the staleness of the pairing. */
export function reportLagDays(row: {
  examOn: Date;
  reportedAt: Date;
}): number {
  const ms = row.reportedAt.getTime() - row.examOn.getTime();
  // Floor, not round: a report 47h after a midnight-anchored exam day is "1
  // day late" by the only reading a human would accept.
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * The store's rows carry the owner; nothing outside the store needs it.
 * Written as an explicit field list rather than a rest-spread so that adding
 * a column to OutcomeRow is a compile-time decision about whether it should
 * leave the module, not an automatic yes.
 */
function stripOwner({
  id,
  kind,
  passed,
  examOn,
  reportedAt,
  readinessScore,
  mockAttempts,
  bestMockScore,
}: OutcomeRow): ReportedOutcome {
  return {
    id,
    kind,
    passed,
    examOn,
    reportedAt,
    readinessScore,
    mockAttempts,
    bestMockScore,
  };
}
