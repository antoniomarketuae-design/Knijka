/**
 * Onboarding answers — the rules, independent of both storage sides.
 *
 * The flow's answers now live on the User row (see ./store.ts). This file owns
 * the two things that sit between an untrusted browser and that row:
 *
 *  1. VALIDATION. A server action is a public POST endpoint; „ще ти покажем
 *     колко дни остават" must not be reachable with `dailyGoalMin = -1` or an
 *     exam date in 1970 just because someone skipped the UI.
 *  2. THE DATE, ONCE. `examDate` is `@db.Date`, and the flow speaks
 *     "YYYY-MM-DD". Converting between them with LOCAL getters is a real bug
 *     west of Greenwich: midnight UTC read back with getDate() is the previous
 *     day, so a student in a negative offset would watch their countdown say
 *     one day fewer than the calendar. Both directions are UTC here, in one
 *     place, with a test.
 */

import {
  getOnboardingStore,
  type OnboardingPatch,
  type OnboardingRow,
} from "./store";
import { NO_EXAM_DATE, type DailyGoalMinutes } from "./storage";

/** Answers, in the shape the client speaks: ISO day, the sentinel, or absent. */
export interface OnboardingAnswers {
  /** "YYYY-MM-DD", NO_EXAM_DATE ("none"), or null when not answered here. */
  examDate?: string | null;
  /** 10 | 20 | 30, or null when not answered here. */
  dailyGoalMin?: number | null;
  /** Stamp `onboardedAt` — the flow reached its end (or was skipped). */
  completed?: boolean;
}

/** What a device needs to mirror the server locally. */
export interface OnboardingSnapshot {
  /** "YYYY-MM-DD", NO_EXAM_DATE, or null when never asked. */
  examDate: string | null;
  dailyGoalMin: DailyGoalMinutes | null;
  onboarded: boolean;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * How far ahead an exam date may be. The theory certificate that makes a
 * candidate eligible is valid for a limited stretch and the product sells a
 * four-month pack, so a date two years out is a typo or a probe, not a plan.
 * Rejecting it keeps the countdown honest rather than rendering „731 дни".
 */
export const MAX_EXAM_DAYS_AHEAD = 400;

/** ISO day → midnight UTC, or null when it is not a real calendar day. */
export function parseExamDay(value: string): Date | null {
  if (!ISO_DAY.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  // "2026-02-31" parses to March 3rd. Round-tripping is what catches it.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

/** Midnight UTC → ISO day. UTC on purpose — see the header. */
export function formatExamDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isDailyGoal(value: unknown): value is DailyGoalMinutes {
  return value === 10 || value === 20 || value === 30;
}

/**
 * Untrusted answers → the columns to write, or a reason to write nothing.
 *
 * Returns `null` for input that says nothing at all, so a malformed post is a
 * no-op rather than a write of nulls over answers the student already gave.
 */
export function toOnboardingPatch(
  answers: OnboardingAnswers,
  now: Date,
): OnboardingPatch | null {
  const patch: OnboardingPatch = {};

  if (answers.examDate !== undefined && answers.examDate !== null) {
    if (answers.examDate === NO_EXAM_DATE) {
      // „Още нямам дата" is an ANSWER, and its answer is NULL. It is only
      // distinguishable from "never asked" because `onboardedAt` gets stamped.
      patch.examDate = null;
    } else {
      const day = parseExamDay(answers.examDate);
      if (!day) return null;
      const maxAhead = new Date(now.getTime());
      maxAhead.setUTCDate(maxAhead.getUTCDate() + MAX_EXAM_DAYS_AHEAD);
      // A date already past is not rejected — a student who failed and is
      // re-sitting still has a real old date on the row, and the countdown
      // already renders nothing for it (ExamCountdown.daysUntil).
      if (day.getTime() > maxAhead.getTime()) return null;
      patch.examDate = day;
    }
  }

  if (answers.dailyGoalMin !== undefined && answers.dailyGoalMin !== null) {
    if (!isDailyGoal(answers.dailyGoalMin)) return null;
    patch.dailyGoalMin = answers.dailyGoalMin;
  }

  if (answers.completed) patch.onboardedAt = now;

  return Object.keys(patch).length > 0 ? patch : null;
}

/** A row from the store → the snapshot a device mirrors. */
export function toSnapshot(row: OnboardingRow | null): OnboardingSnapshot {
  if (!row) return { examDate: null, dailyGoalMin: null, onboarded: false };
  return {
    // The three-state encoding, decoded: a stamped row with no date means the
    // student answered „Още нямам дата" — the sentinel, not "unanswered".
    examDate: row.examDate
      ? formatExamDay(row.examDate)
      : row.onboardedAt
        ? NO_EXAM_DATE
        : null,
    dailyGoalMin: isDailyGoal(row.dailyGoalMin) ? row.dailyGoalMin : null,
    onboarded: row.onboardedAt !== null,
  };
}

/**
 * Persist whatever of `answers` is valid. Returns true when something landed.
 *
 * Never throws at the caller: the flow is a preferences screen, and a student
 * must not be blocked from reaching the dashboard because a write failed. The
 * localStorage mirror still has the answers, and the next visit re-syncs.
 */
export async function saveOnboardingAnswers(
  userId: string,
  answers: OnboardingAnswers,
  now: Date = new Date(),
): Promise<boolean> {
  const patch = toOnboardingPatch(answers, now);
  if (!patch) return false;
  try {
    await getOnboardingStore().save(userId, patch);
    return true;
  } catch {
    return false;
  }
}

/** The student's answers as this server knows them (never throws). */
export async function readOnboarding(
  userId: string,
): Promise<OnboardingSnapshot> {
  try {
    return toSnapshot(await getOnboardingStore().get(userId));
  } catch {
    return { examDate: null, dailyGoalMin: null, onboarded: false };
  }
}
