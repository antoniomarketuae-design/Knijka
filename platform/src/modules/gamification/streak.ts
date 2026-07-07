/**
 * Streak transitions — pure.
 *
 * A streak counts CONSECUTIVE Sofia calendar days with at least one recorded
 * activity. Same day → unchanged; next day → +1; a gap of 2+ days (or no
 * history) → the chain restarts at 1. `lastActiveDay` stores the instant of
 * the last activity; all comparisons happen on Sofia day indices (time.ts),
 * so UTC storage vs. local midnight never skews the count.
 */

import { sofiaDayIndex } from "./time";

export interface StreakState {
  streak: number;
  lastActiveDay: Date | null;
}

/** Apply one activity at `now` to the stored streak state. */
export function applyStreak(prev: StreakState, now: Date): StreakState {
  if (prev.lastActiveDay === null) {
    return { streak: 1, lastActiveDay: now };
  }
  const diff = sofiaDayIndex(now) - sofiaDayIndex(prev.lastActiveDay);
  if (diff <= 0) {
    // Same Sofia day (or clock skew backwards): keep the chain as-is but
    // never let a fresh state show streak 0 after real activity.
    return { streak: Math.max(1, prev.streak), lastActiveDay: now };
  }
  if (diff === 1) {
    return { streak: prev.streak + 1, lastActiveDay: now };
  }
  return { streak: 1, lastActiveDay: now };
}

/**
 * The streak to DISPLAY at `now` without writing anything: the stored value
 * while the chain is still alive (active today or yesterday), else 0.
 */
export function effectiveStreak(prev: StreakState, now: Date): number {
  if (prev.lastActiveDay === null) return 0;
  const diff = sofiaDayIndex(now) - sofiaDayIndex(prev.lastActiveDay);
  return diff <= 1 ? prev.streak : 0;
}

/** True when the last recorded activity falls on today's Sofia day. */
export function isActiveToday(prev: StreakState, now: Date): boolean {
  return (
    prev.lastActiveDay !== null &&
    sofiaDayIndex(prev.lastActiveDay) === sofiaDayIndex(now)
  );
}
