/**
 * Onboarding preferences — v1 storage: localStorage, versioned keys.
 *
 * Why localStorage: launch scope keeps the User table untouched (no schema
 * changes during the sprint). These are low-stakes UX preferences — losing
 * them on a device switch costs one gentle re-ask, not data.
 *
 * Future server-side home (post-launch, documented in
 * docs/development/54_DEPLOYMENT_STRATEGY.md §10): two nullable columns on
 * User — `examDate DateTime?` and `dailyGoalMin Int?` — written via a small
 * server action, migrated by reading these keys once after login and
 * clearing them. The `.v1.` segment in the key names exists exactly so that
 * migration can detect stale clients.
 *
 * All reads/writes are guarded: localStorage can throw (Safari private mode,
 * storage quota) and is absent during SSR.
 */

export const EXAM_DATE_KEY = "knizhka.v1.examDate"; // "YYYY-MM-DD" | "none"
export const DAILY_GOAL_KEY = "knizhka.v1.dailyGoalMin"; // "10" | "20" | "30"
export const ONBOARDING_DONE_KEY = "knizhka.v1.onboardingCompletedAt"; // ISO timestamp

export type DailyGoalMinutes = 10 | 20 | 30;

/** "Още нямам дата" sentinel — distinguishes "answered: no date" from "never asked". */
export const NO_EXAM_DATE = "none";

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the flow still completes, we just can't persist.
  }
}

/** ISO exam date ("YYYY-MM-DD"), NO_EXAM_DATE, or null if never answered. */
export function readExamDate(): string | null {
  const raw = safeGet(EXAM_DATE_KEY);
  if (!raw) return null;
  if (raw === NO_EXAM_DATE || /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return null;
}

export function writeExamDate(value: string): void {
  safeSet(EXAM_DATE_KEY, value);
}

export function readDailyGoalMin(): DailyGoalMinutes | null {
  const raw = safeGet(DAILY_GOAL_KEY);
  if (raw === "10" || raw === "20" || raw === "30") {
    return Number(raw) as DailyGoalMinutes;
  }
  return null;
}

export function writeDailyGoalMin(minutes: DailyGoalMinutes): void {
  safeSet(DAILY_GOAL_KEY, String(minutes));
}

export function isOnboardingDone(): boolean {
  return safeGet(ONBOARDING_DONE_KEY) !== null;
}

export function markOnboardingDone(): void {
  safeSet(ONBOARDING_DONE_KEY, new Date().toISOString());
}
