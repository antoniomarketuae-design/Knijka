/**
 * Spaced-repetition scheduler ("SM-2-lite") — pure functions, no I/O.
 *
 * Per-concept state lives on Progress (reps, dueAt):
 * - reps  = consecutive successful reviews (0 for a new or lapsed concept).
 * - dueAt = next review date; null = concept never answered (a "new" concept).
 *
 * Rules (learning-engine v1):
 * - Fixed interval ladder in days: [1, 3, 7, 16, 35]. The (n+1)th consecutive
 *   success schedules the next review INTERVALS[min(n, 4)] days out, so the
 *   ladder is 1 → 3 → 7 → 16 → 35 → 35 → …
 * - Correct on a NEW concept, or correct when the review is DUE: advance.
 * - Correct while NOT yet due (extra practice ahead of schedule): schedule
 *   unchanged — early drilling never inflates intervals.
 * - Wrong (any time): reps reset to 0, next review in 1 day.
 */

export const REVIEW_INTERVALS_DAYS = [1, 3, 7, 16, 35] as const;

export const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScheduleState {
  /** Consecutive successful (due or first-time) reviews. */
  reps: number;
  /** Next review moment; null = never answered. */
  dueAt: Date | null;
}

export const INITIAL_SCHEDULE: ScheduleState = { reps: 0, dueAt: null };

/** A concept is due when it has a schedule and its dueAt has passed. */
export function isDue(state: ScheduleState, now: Date): boolean {
  return state.dueAt !== null && state.dueAt.getTime() <= now.getTime();
}

export function schedule(
  state: ScheduleState,
  correct: boolean,
  now: Date,
): ScheduleState {
  if (!correct) {
    return { reps: 0, dueAt: addDays(now, REVIEW_INTERVALS_DAYS[0]) };
  }
  const isNew = state.dueAt === null;
  if (!isNew && !isDue(state, now)) {
    return state; // correct but reviewed early — keep the existing schedule
  }
  const interval =
    REVIEW_INTERVALS_DAYS[Math.min(state.reps, REVIEW_INTERVALS_DAYS.length - 1)];
  return { reps: state.reps + 1, dueAt: addDays(now, interval) };
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}
